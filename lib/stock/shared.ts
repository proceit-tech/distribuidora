import type { Pool } from "pg";

import { multiplicarDecimales, sumarDecimales } from "@/lib/inventario/decimal";
import { clasificarNivel } from "@/lib/stock/vista";

// Lectura de saldos reales. Todo filtrado por empresa_id de la sesión.

type Db = Pick<Pool, "query">;
type F = Record<string, unknown>;

/**
 * Depósitos que el usuario puede ver: todos si su alcance es TODOS o los asignados en usuario_deposito (activos o no: el saldo de un depósito
 * inactivo no desaparece del stock). Los productos sin saldo visible no cambian; solo se filtran saldos y costos.
 */
const PERMITIDOS = `SELECT d.id FROM depositos d JOIN usuarios u ON u.empresa_id = d.empresa_id AND u.id = $3
    WHERE d.empresa_id = $1 AND (u.alcance_depositos = 'TODOS'
       OR EXISTS (SELECT 1 FROM usuario_deposito ud WHERE ud.empresa_id = u.empresa_id AND ud.usuario_id = u.id AND ud.deposito_id = d.id))`;

export async function leerStock(db: Db, empresaId: string, productoId: string | null, usuarioId: string | null = null) {
  const filtro = productoId ? " AND p.id = $2" : "";
  const filtroS = productoId ? " AND s.producto_id = $2" : "";
  const filtroC = productoId ? " AND c.producto_id = $2" : "";
  const filtroR = productoId ? " AND r.producto_id = $2" : "";
  const alcance = usuarioId !== null;
  const params: unknown[] = productoId ? [empresaId, productoId] : [empresaId];
  const paramsAlcance: unknown[] = [...params, usuarioId];
  const idx = params.length + 1; // posición de $usuario en las consultas con alcance
  const filtroAlcanceS = alcance ? ` AND s.deposito_id IN (${PERMITIDOS.replace("$3", `$${idx}`)})` : "";
  const filtroAlcanceC = alcance ? ` AND c.deposito_id IN (${PERMITIDOS.replace("$3", `$${idx}`)})` : "";

  const [productos, saldos, costos, precios, empresa, configuraciones, todosDepositos, permitidos] = await Promise.all([
    db.query(
      `SELECT p.id, p.codigo, coalesce(p.codigo_inventario, '') AS "codigoInventario", coalesce(p.codigo_barras, '') AS "codigoBarras",
              p.descripcion, coalesce(cat.nombre, '') AS categoria, coalesce(m.nombre, '') AS marca,
              coalesce(f.nombre, '') AS familia, coalesce(l.nombre, '') AS linea, coalesce(p.origen_etiqueta, '') AS procedencia,
              p.unidad_medida_id AS "unidadMedidaId", coalesce(um.nombre, '') AS "unidadMedidaNombre",
              p.modo_control_stock AS "modoControl", p.stock_minimo::float8 AS "stockMinimo",
              coalesce(p.stock_maximo, 0)::float8 AS "stockMaximo", coalesce(p.punto_reposicion, 0)::float8 AS "puntoReposicion",
              p.actualizado_at AS "actualizadoEn"
         FROM productos p
         LEFT JOIN categorias_producto cat ON cat.empresa_id = p.empresa_id AND cat.id = p.categoria_id
         LEFT JOIN marcas_producto m ON m.empresa_id = p.empresa_id AND m.id = p.marca_id
         LEFT JOIN familias_producto f ON f.empresa_id = p.empresa_id AND f.id = p.familia_id
         LEFT JOIN lineas_producto l ON l.empresa_id = p.empresa_id AND l.id = p.linea_id
         LEFT JOIN unidades_medida um ON um.id = p.unidad_medida_id
        WHERE p.empresa_id = $1 AND p.controla_stock${filtro}
          AND (p.activo OR EXISTS (SELECT 1 FROM stock_saldos s WHERE s.empresa_id = p.empresa_id AND s.producto_id = p.id AND s.cantidad > 0))
        ORDER BY p.descripcion`,
      params,
    ),
    db.query(
      `SELECT s.id, s.producto_id AS "productoId", s.deposito_id AS "depositoId", d.codigo AS "depositoCodigo", d.nombre AS "depositoNombre",
              s.estado_stock AS estado, s.propiedad, s.cantidad::float8 AS cantidad, s.cantidad::text AS "cantidadTexto",
              coalesce(sl.codigo_lote, '') AS lote, coalesce(to_char(sl.fecha_vencimiento, 'YYYY-MM-DD'), '') AS vencimiento
         FROM stock_saldos s
         JOIN depositos d ON d.empresa_id = s.empresa_id AND d.id = s.deposito_id
         LEFT JOIN stock_lotes sl ON sl.empresa_id = s.empresa_id AND sl.id = s.lote_id
        WHERE s.empresa_id = $1 AND s.cantidad <> 0${filtroS}${filtroAlcanceS}
        ORDER BY d.nombre, sl.fecha_vencimiento NULLS LAST, sl.codigo_lote`,
      alcance ? paramsAlcance : params,
    ),
    db.query(
      `SELECT c.producto_id AS "productoId", c.deposito_id AS "depositoId", c.cantidad_valorizada::float8 AS cantidad, c.valor_total::float8 AS valor,
              c.valor_total::text AS "valorTexto"
         FROM inventario_costos c WHERE c.empresa_id = $1${filtroC}${filtroAlcanceC}`,
      alcance ? paramsAlcance : params,
    ),
    db.query(
      `SELECT r.producto_id AS "productoId", r.precio::float8 AS precio, r.precio::text AS "precioTexto", r.moneda
         FROM v_producto_precio_referencia r WHERE r.empresa_id = $1${filtroR}`,
      params,
    ),
    db.query(`SELECT razon_social AS nombre, moneda_base_codigo AS moneda FROM empresas WHERE id = $1`, [empresaId]),
    db.query(
      `SELECT k.producto_id AS "productoId", k.deposito_id AS "depositoId", k.stock_minimo::float8 AS minimo, k.stock_maximo::float8 AS maximo,
              k.punto_reposicion::float8 AS punto, k.cantidad_reposicion::float8 AS reposicion
         FROM producto_deposito_configuracion k WHERE k.empresa_id = $1${productoId ? " AND k.producto_id = $2" : ""}`,
      params,
    ),
    db.query(`SELECT count(*)::int AS n FROM depositos WHERE empresa_id = $1`, [empresaId]),
    alcance ? db.query(`SELECT count(*)::int AS n FROM (${PERMITIDOS.replace("$3", "$2")}) x`, [empresaId, usuarioId]) : Promise.resolve(null),
  ]);

  const emp = empresa.rows[0] as { nombre: string; moneda: string };
  const porProducto = <T extends F>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.productoId as string, [...(m.get(r.productoId as string) ?? []), r]);
    return m;
  };
  const sPor = porProducto(saldos.rows as F[]);
  const cPor = porProducto(costos.rows as F[]);
  const pPor = new Map((precios.rows as F[]).map((r) => [r.productoId as string, r]));
  const kPor = new Map((configuraciones.rows as F[]).map((r) => [`${r.productoId}|${r.depositoId}`, r]));
  const costoPorDeposito = new Map((costos.rows as F[]).map((r) => [`${r.productoId}|${r.depositoId}`, r]));
  const alcanceParcial = alcance && permitidos !== null && Number((permitidos.rows[0] as F).n) < Number((todosDepositos.rows[0] as F).n);

  const items = (productos.rows as F[]).map((p) => {
    const ss = sPor.get(p.id as string) ?? [];
    const propios = ss.filter((s) => s.propiedad === "PROPIO");
    const suma = (est: string, arr = propios) => arr.filter((s) => s.estado === est).reduce((a, s) => a + (s.cantidad as number), 0);
    const disponible = suma("DISPONIBLE"), reservado = suma("RESERVADO"), cuarentena = suma("CUARENTENA"), transito = suma("TRANSITO");
    const terceros = ss.filter((s) => s.propiedad === "TERCERO").reduce((a, s) => a + (s.cantidad as number), 0);
    const totalFisico = disponible + reservado + cuarentena;

    const depMap = new Map<string, F>();
    for (const s of ss) {
      const d = depMap.get(s.depositoId as string) ?? {
        id: s.depositoId, depositoId: s.depositoId, depositoCodigo: s.depositoCodigo, depositoNombre: s.depositoNombre,
        // No existe un modelo de ubicaciones físicas en el banco: la ubicación queda vacía (la pantalla rotula «Sin ubicación registrada»).
        ubicacion: "", disponible: 0, reservado: 0, cuarentena: 0, transito: 0, totalFisico: 0, terceros: 0,
        disponibleTexto: "0", costoCantidad: 0, costoValor: 0, costoValorTexto: "0", stockMinimo: null, stockMaximo: null, puntoReposicion: null, cantidadReposicion: null,
      };
      if (s.propiedad === "TERCERO") d.terceros = (d.terceros as number) + (s.cantidad as number);
      if (s.propiedad === "PROPIO") {
        if (s.estado === "DISPONIBLE") d.disponibleTexto = sumarDecimales([d.disponibleTexto as string, s.cantidadTexto as string]);
        const k = { DISPONIBLE: "disponible", RESERVADO: "reservado", CUARENTENA: "cuarentena", TRANSITO: "transito" }[s.estado as string] as string;
        d[k] = (d[k] as number) + (s.cantidad as number);
        d.totalFisico = (d.disponible as number) + (d.reservado as number) + (d.cuarentena as number);
      }
      depMap.set(s.depositoId as string, d);
    }

    for (const d of depMap.values()) {
      const c = costoPorDeposito.get(`${p.id}|${d.depositoId}`);
      const k = kPor.get(`${p.id}|${d.depositoId}`);

      d.costoCantidad = c ? (c.cantidad as number) : 0;
      d.costoValor = c ? (c.valor as number) : 0;
      d.costoValorTexto = c ? (c.valorTexto as string) : "0";
      d.stockMinimo = k ? (k.minimo as number | null) : null;
      d.stockMaximo = k ? (k.maximo as number | null) : null;
      d.puntoReposicion = k ? (k.punto as number | null) : null;
      d.cantidadReposicion = k ? (k.reposicion as number | null) : null;
    }

    const cs = cPor.get(p.id as string) ?? [];
    const cantVal = cs.reduce((a, c) => a + (c.cantidad as number), 0);
    const valor = cs.reduce((a, c) => a + (c.valor as number), 0);
    // INV-04: los importes se suman y multiplican como decimal exacto (texto de numeric), no como float.
    const valorTexto = sumarDecimales(cs.map((c) => c.valorTexto as string));
    const disponibleTexto = sumarDecimales(propios.filter((s) => s.estado === "DISPONIBLE").map((s) => s.cantidadTexto as string));
    const costoPromedio = cantVal > 0 ? Math.round((valor / cantVal) * 10000) / 10000 : null;
    const pr = pPor.get(p.id as string);
    const precio = pr ? (pr.precio as number) : null;
    const precioTexto = pr ? (pr.precioTexto as string) : null;

    const minimo = p.stockMinimo as number, maximo = p.stockMaximo as number;
    const nivel = clasificarNivel({ disponible, totalFisico, minimo, maximo });

    return {
      id: p.id, productoId: p.id, productoCodigo: p.codigo, productoCodigoInventario: p.codigoInventario, productoDescripcion: p.descripcion,
      codigoBarras: p.codigoBarras, categoria: p.categoria, marca: p.marca, familia: p.familia, linea: p.linea, procedencia: p.procedencia,
      unidadMedidaId: p.unidadMedidaId, unidadMedidaNombre: p.unidadMedidaNombre, modoControl: p.modoControl,
      stockMinimo: minimo, stockMaximo: maximo, puntoReposicion: p.puntoReposicion,
      disponible, reservado, cuarentena, transito, totalFisico, totalVirtual: totalFisico + transito,
      propiedad: propios.length === 0 && terceros > 0 ? "TERCERO" : "PROPIO",
      propietarioId: "", propietarioNombre: propios.length === 0 && terceros > 0 ? "Tercero (propietario no registrado)" : emp.nombre,
      nivel, costoPromedio, valorInventario: valor, valorInventarioTexto: valorTexto,
      precioVentaReferencia: precio, valorVentaReferencia: precio === null ? null : precio * disponible,
      precioVentaReferenciaTexto: precioTexto, valorVentaReferenciaTexto: precioTexto === null ? null : multiplicarDecimales(precioTexto, disponibleTexto),
      monedaPrecio: pr ? (pr.moneda as string) : "", terceros,
      depositos: [...depMap.values()],
      lotes: ss.filter((s) => s.lote).map((s) => ({
        id: s.id, lote: s.lote, fechaVencimiento: s.vencimiento, cantidad: s.cantidad, estado: s.estado,
        depositoId: s.depositoId, ubicacion: s.depositoNombre,
        propietario: s.propiedad === "PROPIO" ? emp.nombre : "Tercero (propietario no registrado)",
      })),
      actualizadoEn: p.actualizadoEn,
    };
  });
  return { stock: items, monedaBase: emp.moneda, alcanceParcial };
}
