import type { Pool } from "pg";

import { depositosDelAlcance } from "@/lib/reportes/alcance";
import { conSnapshotLectura } from "@/lib/reportes/snapshot";
import { calcularProducto, filaDeProducto, filaDetalle, filtrarProductos, totalesStockGeneral, type ProductoAgregado } from "@/lib/reportes/stock-general-plan";
import type { StockGeneralFila, StockGeneralFiltros, StockGeneralRespuesta } from "@/types/reportes";

// Reporte 1 — Stock general (informe CUANTITATIVO de solo lectura). Fuente: stock_saldos (mismas reglas que lib/stock/shared.ts):
// físico propio = disponible + reservado + cuarentena; virtual = físico + tránsito; terceros aparte. Cantidades como texto numeric exacto.
// Todo filtrado por empresa_id y por los depósitos del alcance del usuario (activos e inactivos, como Inventario > Stock). Toda la lectura de UNA solicitud
// (alcance, agregados, desglose, catálogos y hora) ocurre en UNA conexión y UNA transacción REPEATABLE READ de solo lectura. No incluye costos ni valorización.

type Db = Pick<Pool, "query">;
type DbConexion = Pick<Pool, "connect">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIVELES = ["SIN_STOCK", "BAJO", "NORMAL", "SOBRESTOCK"];
export const MAX_FILAS_EXPORTACION = 50000;

export const COBERTURA_STOCK_GENERAL = [
  "Informe cuantitativo: cantidades propias (físico = disponible + reservado + cuarentena; virtual = físico + en tránsito) y stock de terceros en columnas aparte, que nunca se suma a lo propio. No incluye costos, valorización ni precios (ver Valorización de inventario).",
  "Las cantidades no se suman entre unidades distintas (kg, unidades, litros…): el total general muestra «n/a» y el resumen indica los totales POR UNIDAD.",
  "Situación (sin stock / bajo / normal / sobrestock): la misma regla de Inventario > Stock. Sin depósito filtrado usa el mínimo y el máximo del producto sobre los depósitos de su alcance; con un depósito filtrado usa los parámetros de ESE depósito (sin parámetros, no hay bajo ni sobrestock).",
  "Existencia: «Con stock» = hay algo propio (incluido el tránsito) o de terceros; «Sin stock» = no hay nada propio ni de terceros. La situación «Sin stock» (disponible propio en cero) es otro concepto.",
  "Vista detalle: una fila por producto × depósito × lote con saldo. Un producto sin saldo en el alcance filtrado aparece en UNA fila marcada «Sin saldo» (sin depósito ni lote inventados).",
  "En V1 ningún movimiento genera el estado TRÁNSITO: la columna En tránsito es 0 hasta que exista ese flujo. Incluye los depósitos inactivos de su alcance (rotulados). Foto actual de los saldos de la solicitud; no es un stock histórico.",
];

export function parsearFiltros(sp: URLSearchParams): { filtros: StockGeneralFiltros; pagina: number; tamano: number } | { error: string } {
  const uuid = (k: string) => {
    const v = sp.get(k) ?? "";
    return v === "" || UUID.test(v) ? v : null;
  };
  const depositoId = uuid("depositoId"), categoriaId = uuid("categoriaId"), marcaId = uuid("marcaId"), familiaId = uuid("familiaId");
  if (depositoId === null || categoriaId === null || marcaId === null || familiaId === null) return { error: "Filtro con identificador no válido." };
  const vista = sp.get("vista") ?? "PRODUCTO";
  if (vista !== "PRODUCTO" && vista !== "DETALLE") return { error: "Vista no válida." };
  const situacion = sp.get("situacion") ?? "";
  if (situacion !== "" && !NIVELES.includes(situacion)) return { error: "Situación no válida." };
  const existencia = sp.get("existencia") ?? "TODOS";
  if (!["TODOS", "CON", "SIN"].includes(existencia)) return { error: "Filtro de existencia no válido." };
  const pagina = Math.max(1, Math.floor(Number(sp.get("pagina") ?? 1)) || 1);
  const tamano = Math.min(200, Math.max(10, Math.floor(Number(sp.get("tamano") ?? 50)) || 50));
  return {
    filtros: {
      vista, depositoId, categoriaId, marcaId, familiaId,
      situacion: situacion as StockGeneralFiltros["situacion"],
      existencia: existencia as StockGeneralFiltros["existencia"],
      q: (sp.get("q") ?? "").trim().slice(0, 80),
      lote: (sp.get("lote") ?? "").trim().slice(0, 40),
    },
    pagina, tamano,
  };
}

const like = (v: string) => `%${v.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function depositosPermitidos(db: Db, empresaId: string, usuarioId: string) {
  const r = await db.query(
    `SELECT d.id, d.nombre FROM depositos d
      WHERE d.empresa_id = $1 AND d.activo AND usuario_puede_deposito($1::uuid, $2::uuid, d.id) ORDER BY d.nombre`,
    [empresaId, usuarioId],
  );
  return r.rows as { id: string; nombre: string }[];
}

const SUMAS = (alias: string) => `
  coalesce(sum(${alias}.cantidad) FILTER (WHERE ${alias}.propiedad = 'PROPIO' AND ${alias}.estado_stock = 'DISPONIBLE'), 0)::text AS disponible,
  coalesce(sum(${alias}.cantidad) FILTER (WHERE ${alias}.propiedad = 'PROPIO' AND ${alias}.estado_stock = 'RESERVADO'), 0)::text AS reservado,
  coalesce(sum(${alias}.cantidad) FILTER (WHERE ${alias}.propiedad = 'PROPIO' AND ${alias}.estado_stock = 'CUARENTENA'), 0)::text AS cuarentena,
  coalesce(sum(${alias}.cantidad) FILTER (WHERE ${alias}.propiedad = 'PROPIO' AND ${alias}.estado_stock = 'TRANSITO'), 0)::text AS transito,
  coalesce(sum(${alias}.cantidad) FILTER (WHERE ${alias}.propiedad = 'TERCERO' AND ${alias}.estado_stock = 'DISPONIBLE'), 0)::text AS t_disponible,
  coalesce(sum(${alias}.cantidad) FILTER (WHERE ${alias}.propiedad = 'TERCERO' AND ${alias}.estado_stock = 'RESERVADO'), 0)::text AS t_reservado,
  coalesce(sum(${alias}.cantidad) FILTER (WHERE ${alias}.propiedad = 'TERCERO' AND ${alias}.estado_stock = 'CUARENTENA'), 0)::text AS t_cuarentena,
  coalesce(sum(${alias}.cantidad) FILTER (WHERE ${alias}.propiedad = 'TERCERO' AND ${alias}.estado_stock = 'TRANSITO'), 0)::text AS t_transito`;

export async function leerStockGeneral(
  db: DbConexion,
  empresaId: string,
  usuarioId: string,
  filtros: StockGeneralFiltros,
  pagina: number,
  tamano: number,
  todas = false,
): Promise<StockGeneralRespuesta | { error: string; status: number }> {
  return conSnapshotLectura(db, async (c) => {
    const alcance = await depositosDelAlcance(c, empresaId, usuarioId);
    if (filtros.depositoId && !alcance.some((d) => d.id === filtros.depositoId)) return { error: "Depósito no permitido.", status: 403 };
    const deps = filtros.depositoId ? [filtros.depositoId] : alcance.map((d) => d.id);

    // Agregado por producto (una fila por producto); la situación y la existencia se calculan después, en TS, con la regla compartida con Inventario > Stock.
    const params: unknown[] = [empresaId, deps];
    const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
    const donde: string[] = [];
    if (filtros.q) { const n = p(like(filtros.q)); donde.push(`(p.codigo ILIKE ${n} OR p.descripcion ILIKE ${n} OR p.codigo_inventario ILIKE ${n} OR p.codigo_barras ILIKE ${n})`); }
    if (filtros.categoriaId) donde.push(`p.categoria_id = ${p(filtros.categoriaId)}`);
    if (filtros.marcaId) donde.push(`p.marca_id = ${p(filtros.marcaId)}`);
    if (filtros.familiaId) donde.push(`p.familia_id = ${p(filtros.familiaId)}`);
    let loteN = "";
    if (filtros.lote) { loteN = p(like(filtros.lote)); donde.push(`l.codigo_lote ILIKE ${loteN}`); }
    // Con un depósito elegido, los parámetros de mínimo/máximo son los de ESE depósito (cero si no hay), igual que Inventario > Stock.
    const conDeposito = !!filtros.depositoId;
    const dep = conDeposito ? p(filtros.depositoId) : "";
    const agg = await c.query(
      `SELECT p.id, p.codigo, coalesce(p.codigo_inventario, '') AS ci, coalesce(p.codigo_barras, '') AS gtin, p.descripcion,
              coalesce(cat.nombre, '') AS categoria, coalesce(m.nombre, '') AS marca, coalesce(fa.nombre, '') AS familia, coalesce(li.nombre, '') AS linea, coalesce(um.nombre, '') AS unidad,
              ${conDeposito ? "coalesce(k.stock_minimo, 0)" : "coalesce(p.stock_minimo, 0)"}::text AS minimo, ${conDeposito ? "coalesce(k.stock_maximo, 0)" : "coalesce(p.stock_maximo, 0)"}::text AS maximo,
              ${SUMAS("s")}
         FROM productos p
         LEFT JOIN categorias_producto cat ON cat.empresa_id = p.empresa_id AND cat.id = p.categoria_id
         LEFT JOIN marcas_producto m ON m.empresa_id = p.empresa_id AND m.id = p.marca_id
         LEFT JOIN familias_producto fa ON fa.empresa_id = p.empresa_id AND fa.id = p.familia_id
         LEFT JOIN lineas_producto li ON li.empresa_id = p.empresa_id AND li.id = p.linea_id
         LEFT JOIN unidades_medida um ON um.id = p.unidad_medida_id
         LEFT JOIN stock_saldos s ON s.empresa_id = p.empresa_id AND s.producto_id = p.id AND s.deposito_id = ANY($2::uuid[])
         LEFT JOIN stock_lotes l ON l.empresa_id = s.empresa_id AND l.id = s.lote_id
         ${conDeposito ? `LEFT JOIN producto_deposito_configuracion k ON k.empresa_id = p.empresa_id AND k.producto_id = p.id AND k.deposito_id = ${dep}` : ""}
        WHERE p.empresa_id = $1 AND p.controla_stock${donde.length ? " AND " + donde.join(" AND ") : ""}
        GROUP BY p.id, cat.nombre, m.nombre, fa.nombre, li.nombre, um.nombre${conDeposito ? ", k.stock_minimo, k.stock_maximo" : ""}
       HAVING p.activo OR coalesce(sum(s.cantidad), 0) > 0
        ORDER BY p.codigo, p.id`,
      params,
    );
    const calculados = (agg.rows as unknown as ProductoAgregado[]).map(calcularProducto);
    const filtrados = filtrarProductos(calculados, filtros);
    const totales = totalesStockGeneral(filtrados);
    const porId = new Map(filtrados.map((x) => [x.id, x]));
    const limite = todas ? MAX_FILAS_EXPORTACION + 1 : tamano;
    const desplazamiento = todas ? 0 : (pagina - 1) * tamano;

    let filas: StockGeneralFila[];
    let totalFilas: number;

    if (filtros.vista === "PRODUCTO") {
      totalFilas = filtrados.length;
      filas = filtrados.slice(desplazamiento, desplazamiento + limite).map(filaDeProducto);
    } else if (filtrados.length === 0) {
      totalFilas = 0;
      filas = [];
    } else {
      // Una fila por producto × depósito × lote CON saldo; el producto sin saldo desglosable sale en UNA fila «sin saldo» (LEFT JOIN), sin inventar depósito ni lote.
      const dp: unknown[] = [empresaId, deps, filtrados.map((x) => x.id)];
      let loteDet = "";
      if (filtros.lote) { dp.push(like(filtros.lote)); loteDet = ` AND s.lote_id IN (SELECT id FROM stock_lotes WHERE empresa_id = $1 AND codigo_lote ILIKE $4)`; }
      const base = `WITH det AS (
          SELECT s.producto_id, s.deposito_id, s.lote_id, ${SUMAS("s")}
            FROM stock_saldos s
           WHERE s.empresa_id = $1 AND s.deposito_id = ANY($2::uuid[]) AND s.producto_id = ANY($3::uuid[])${loteDet}
           GROUP BY s.producto_id, s.deposito_id, s.lote_id
          HAVING sum(s.cantidad) > 0
        ), lista AS (
          SELECT f.id AS producto_id, pr.codigo, det.deposito_id, det.lote_id, det.disponible, det.reservado, det.cuarentena, det.transito,
                 det.t_disponible, det.t_reservado, det.t_cuarentena, det.t_transito
            FROM unnest($3::uuid[]) AS f(id)
            JOIN productos pr ON pr.empresa_id = $1 AND pr.id = f.id
            LEFT JOIN det ON det.producto_id = f.id
        )`;
      totalFilas = Number((await c.query(`${base} SELECT count(*)::int AS n FROM lista`, dp)).rows[0].n);
      dp.push(limite, desplazamiento);

      const r = await c.query(
        `${base}
         SELECT lista.producto_id, (lista.deposito_id IS NOT NULL) AS con_saldo, d.nombre AS deposito, NOT d.activo AS inactivo, coalesce(l.codigo_lote, '') AS lote,
                coalesce(to_char(l.fecha_vencimiento, 'YYYY-MM-DD'), '') AS venc,
                lista.disponible, lista.reservado, lista.cuarentena, lista.transito, lista.t_disponible, lista.t_reservado, lista.t_cuarentena, lista.t_transito
           FROM lista
           LEFT JOIN depositos d ON d.empresa_id = $1 AND d.id = lista.deposito_id
           LEFT JOIN stock_lotes l ON l.empresa_id = $1 AND l.id = lista.lote_id
          ORDER BY lista.codigo, lista.producto_id, d.nombre NULLS FIRST, lote LIMIT $${dp.length - 1} OFFSET $${dp.length}`,
        dp,
      );
      filas = (r.rows as Record<string, unknown>[]).flatMap((x) => {
        const prod = porId.get(x.producto_id as string);

        return prod ? [filaDetalle(prod, x.con_saldo ? x : null)] : [];
      });
    }
    if (todas && filas.length > MAX_FILAS_EXPORTACION) return { error: `La exportación supera ${MAX_FILAS_EXPORTACION} filas; reduzca los filtros.`, status: 413 };

    const emp = await c.query(`SELECT razon_social AS nombre, moneda_base_codigo AS moneda FROM empresas WHERE id = $1`, [empresaId]);
    const cat = await c.query(`SELECT id, nombre FROM categorias_producto WHERE empresa_id = $1 AND activo ORDER BY nombre`, [empresaId]);
    const mar = await c.query(`SELECT id, nombre FROM marcas_producto WHERE empresa_id = $1 AND activo ORDER BY nombre`, [empresaId]);
    const fam = await c.query(`SELECT id, nombre FROM familias_producto WHERE empresa_id = $1 AND activo ORDER BY nombre`, [empresaId]);
    const ahora = await c.query(`SELECT to_char(now() AT TIME ZONE 'America/Asuncion', 'DD/MM/YYYY HH24:MI') AS t, to_char(now() AT TIME ZONE 'America/Asuncion', 'YYYYMMDD-HH24MI') AS f`);

    return {
      empresa: emp.rows[0],
      generado: ahora.rows[0].t,
      filtros,
      pagina: { numero: pagina, tamano, totalFilas },
      filas,
      totales,
      catalogos: { depositos: alcance, categorias: cat.rows, marcas: mar.rows, familias: fam.rows },
      cobertura: COBERTURA_STOCK_GENERAL,
      sello: ahora.rows[0].f,
    } satisfies StockGeneralRespuesta;
  });
}
