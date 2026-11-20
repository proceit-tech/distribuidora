import type { Pool } from "pg";

import type { EntradaReposicion, OtroDeposito } from "@/lib/reposicion/calculo";

// Lectura (solo SELECT) de los datos de Reposición. empresa_id y usuario SIEMPRE de la sesión; solo depósitos activos que el usuario tiene
// autorizados (alcance TODOS o asignados). Solo stock PROPIO: los saldos de terceros no participan de la reposición.

type Db = Pick<Pool, "query">;
type F = Record<string, unknown>;

const DEPOSITOS_VISIBLES = `
  SELECT d.id, d.codigo, d.nombre FROM depositos d JOIN usuarios u ON u.empresa_id = d.empresa_id AND u.id = $2
   WHERE d.empresa_id = $1 AND d.activo
     AND (u.alcance_depositos = 'TODOS'
          OR EXISTS (SELECT 1 FROM usuario_deposito ud WHERE ud.empresa_id = u.empresa_id AND ud.usuario_id = u.id AND ud.deposito_id = d.id))`;

export async function leerEntradasReposicion(db: Db, empresaId: string, usuarioId: string) {
  const [productos, saldos, config, visibles, totalDepositos] = await Promise.all([
    db.query(
      `SELECT p.id, p.codigo, p.descripcion, coalesce(m.nombre, '') AS marca, coalesce(um.nombre, '') AS unidad,
              p.stock_minimo::float8 AS minimo, p.stock_maximo::float8 AS maximo, p.punto_reposicion::float8 AS punto,
              p.modo_control_stock AS "modoControl", pp.proveedor AS "proveedorNombre", pp.plazo AS "proveedorPlazo", pp.minima AS "proveedorMinima"
         FROM productos p
         LEFT JOIN marcas_producto m ON m.empresa_id = p.empresa_id AND m.id = p.marca_id
         LEFT JOIN unidades_medida um ON um.id = p.unidad_medida_id
         LEFT JOIN LATERAL (
              SELECT pr.razon_social AS proveedor, x.plazo_entrega_dias AS plazo, x.cantidad_minima_compra::float8 AS minima
                FROM producto_proveedores x JOIN proveedores pr ON pr.empresa_id = x.empresa_id AND pr.id = x.proveedor_id
               WHERE x.empresa_id = p.empresa_id AND x.producto_id = p.id AND x.es_principal LIMIT 1) pp ON true
        WHERE p.empresa_id = $1 AND p.activo AND p.controla_stock
        ORDER BY p.descripcion`,
      [empresaId],
    ),
    db.query(
      `SELECT s.producto_id AS "productoId", s.deposito_id AS "depositoId", s.estado_stock AS estado, sum(s.cantidad)::float8 AS cantidad
         FROM stock_saldos s
        WHERE s.empresa_id = $1 AND s.propiedad = 'PROPIO' AND s.cantidad <> 0 AND s.deposito_id IN (SELECT id FROM (${DEPOSITOS_VISIBLES}) v)
        GROUP BY s.producto_id, s.deposito_id, s.estado_stock`,
      [empresaId, usuarioId],
    ),
    db.query(
      `SELECT k.producto_id AS "productoId", k.deposito_id AS "depositoId", k.stock_minimo::float8 AS minimo, k.stock_maximo::float8 AS maximo,
              k.punto_reposicion::float8 AS punto, k.cantidad_reposicion::float8 AS reposicion
         FROM producto_deposito_configuracion k WHERE k.empresa_id = $1 AND k.deposito_id IN (SELECT id FROM (${DEPOSITOS_VISIBLES}) v)`,
      [empresaId, usuarioId],
    ),
    db.query(`${DEPOSITOS_VISIBLES} ORDER BY d.nombre`, [empresaId, usuarioId]),
    db.query(`SELECT count(*)::int AS n FROM depositos WHERE empresa_id = $1 AND activo`, [empresaId]),
  ]);

  const nombreDeposito = new Map((visibles.rows as F[]).map((d) => [d.id as string, d.nombre as string]));
  const saldoDe = new Map<string, { disponible: number; reservado: number; cuarentena: number; transito: number }>();

  for (const s of saldos.rows as F[]) {
    const k = `${s.productoId}|${s.depositoId}`;
    const a = saldoDe.get(k) ?? { disponible: 0, reservado: 0, cuarentena: 0, transito: 0 };
    const campo = ({ DISPONIBLE: "disponible", RESERVADO: "reservado", CUARENTENA: "cuarentena", TRANSITO: "transito" } as Record<string, keyof typeof a>)[s.estado as string];

    if (campo) a[campo] += s.cantidad as number;
    saldoDe.set(k, a);
  }

  const configPorProducto = new Map<string, F[]>();

  for (const c of config.rows as F[]) configPorProducto.set(c.productoId as string, [...(configPorProducto.get(c.productoId as string) ?? []), c]);

  const entradas: EntradaReposicion[] = [];

  for (const p of productos.rows as F[]) {
    const proveedorPrincipal = p.proveedorNombre
      ? { nombre: p.proveedorNombre as string, plazoDias: (p.proveedorPlazo as number | null) ?? null, cantidadMinimaCompra: (p.proveedorMinima as number | null) ?? null }
      : null;
    const base = { modoControl: p.modoControl as EntradaReposicion["modoControl"], productoId: p.id as string, productoCodigo: p.codigo as string, productoDescripcion: p.descripcion as string, marca: p.marca as string, unidad: p.unidad as string, proveedorPrincipal };
    const configs = configPorProducto.get(p.id as string) ?? [];
    const deConfig = new Map(configs.map((c) => [c.depositoId as string, c]));

    // Disponibilidad y parámetros de los demás depósitos visibles (para ofrecer transferencias).
    const otros = (excluir: string | null): OtroDeposito[] =>
      [...nombreDeposito.entries()]
        .filter(([id]) => id !== excluir)
        .map(([id, nombre]) => {
          const k = deConfig.get(id);

          return { id, nombre, disponible: saldoDe.get(`${p.id}|${id}`)?.disponible ?? 0, minimo: (k?.minimo as number | null) ?? null, punto: (k?.punto as number | null) ?? null };
        })
        .filter((o) => o.disponible > 0);

    // 1) Un renglón por depósito con parámetros propios del depósito.
    for (const c of configs) {
      const tieneParametros = ["minimo", "maximo", "punto", "reposicion"].some((campo) => c[campo] !== null);

      if (!tieneParametros || !nombreDeposito.has(c.depositoId as string)) continue;

      const id = c.depositoId as string;

      entradas.push({
        ...base,
        clave: `${p.id}|${id}`,
        ambito: "DEPOSITO",
        depositoId: id,
        depositoNombre: nombreDeposito.get(id) as string,
        saldo: saldoDe.get(`${p.id}|${id}`) ?? { disponible: 0, reservado: 0, cuarentena: 0, transito: 0 },
        parametros: { minimo: c.minimo as number | null, punto: c.punto as number | null, maximo: c.maximo as number | null, cantidadReposicion: c.reposicion as number | null },
        otrosDepositos: otros(id),
      });
    }

    // 2) Un renglón consolidado con los parámetros globales del producto (contra el saldo de todos los depósitos visibles). Si el producto ya tiene
    //    plan por depósito, el consolidado es solo referencia (no genera necesidad ni se suma: evita duplicar la sugerencia sobre el mismo saldo).
    const tienePlanPorDeposito = entradas.some((x) => x.productoId === p.id && x.ambito === "DEPOSITO");
    const global = { minimo: p.minimo as number | null, punto: p.punto as number | null, maximo: p.maximo as number | null };

    if ([global.minimo, global.punto, global.maximo].some((v) => v !== null && v > 0)) {
      const saldo = { disponible: 0, reservado: 0, cuarentena: 0, transito: 0 };

      for (const id of nombreDeposito.keys()) {
        const s = saldoDe.get(`${p.id}|${id}`);

        if (s) (Object.keys(saldo) as Array<keyof typeof saldo>).forEach((k) => (saldo[k] += s[k]));
      }
      entradas.push({
        ...base,
        clave: `${p.id}|*`,
        ambito: "CONSOLIDADO",
        depositoId: null,
        depositoNombre: "Todos los depósitos",
        saldo,
        parametros: { ...global, cantidadReposicion: null },
        otrosDepositos: [],
        soloReferencia: tienePlanPorDeposito,
      });
    }
  }

  return {
    entradas,
    depositos: (visibles.rows as F[]).map((d) => ({ id: d.id as string, nombre: d.nombre as string })),
    alcanceParcial: (visibles.rowCount ?? 0) < Number((totalDepositos.rows[0] as F).n),
  };
}
