import type { Pool } from "pg";

import type {
  NivelStock,
  StockGeneralFila,
  StockGeneralFiltros,
  StockGeneralRespuesta,
  StockGeneralTotales,
} from "@/types/reportes";

// Reporte 1 — Stock general. Fuente: stock_saldos (mismas reglas que lib/stock/shared.ts):
// físico propio = disponible + reservado + cuarentena; virtual = físico + tránsito; terceros aparte.
// Todo filtrado por empresa_id y por los depósitos con alcance del usuario.

type Db = Pick<Pool, "query">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIVELES = ["SIN_STOCK", "BAJO", "NORMAL", "SOBRESTOCK"];
export const MAX_FILAS_EXPORTACION = 50000;

export const COBERTURA_STOCK_GENERAL = [
  "Cantidades propias: físico = disponible + reservado + cuarentena; virtual = físico + en tránsito. El stock de terceros se muestra aparte y no se suma al propio.",
  "En V1 ningún movimiento genera el estado TRÁNSITO: la columna En tránsito es 0 hasta que exista ese flujo.",
  "Situación (sin stock / bajo / normal / sobrestock) según el mínimo y máximo del producto, sobre los depósitos filtrados; no son límites por depósito.",
  "Foto actual de los saldos; no es un stock histórico a fecha.",
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

// Construye el CTE común a totales, vista por producto y vista detalle: una sola definición de filtros.
function construir(empresaId: string, deps: string[], f: StockGeneralFiltros) {
  const params: unknown[] = [empresaId, deps];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const donde: string[] = [];
  if (f.q) { const n = p(like(f.q)); donde.push(`(p.codigo ILIKE ${n} OR p.descripcion ILIKE ${n} OR p.codigo_inventario ILIKE ${n} OR p.codigo_barras ILIKE ${n})`); }
  if (f.categoriaId) donde.push(`p.categoria_id = ${p(f.categoriaId)}`);
  if (f.marcaId) donde.push(`p.marca_id = ${p(f.marcaId)}`);
  if (f.familiaId) donde.push(`p.familia_id = ${p(f.familiaId)}`);
  let loteN = "";
  if (f.lote) { loteN = p(like(f.lote)); donde.push(`l.codigo_lote ILIKE ${loteN}`); }
  const post: string[] = [];
  if (f.situacion) post.push(`nivel = ${p(f.situacion)}`);
  if (f.existencia === "CON") post.push(`(fisico + terceros) > 0`);
  if (f.existencia === "SIN") post.push(`(fisico + terceros) = 0`);

  const sum = (cond: string) => `coalesce(sum(s.cantidad) FILTER (WHERE ${cond}), 0)`;
  const cte = `
    agg AS (
      SELECT p.id, p.codigo, coalesce(p.codigo_inventario, '') AS ci, coalesce(p.codigo_barras, '') AS gtin, p.descripcion,
             coalesce(cat.nombre, '') AS categoria, coalesce(m.nombre, '') AS marca, coalesce(fa.nombre, '') AS familia,
             coalesce(li.nombre, '') AS linea, coalesce(um.nombre, '') AS unidad,
             p.stock_minimo AS minimo, coalesce(p.stock_maximo, 0) AS maximo,
             ${sum(`s.propiedad = 'PROPIO' AND s.estado_stock = 'DISPONIBLE'`)} AS disponible,
             ${sum(`s.propiedad = 'PROPIO' AND s.estado_stock = 'RESERVADO'`)} AS reservado,
             ${sum(`s.propiedad = 'PROPIO' AND s.estado_stock = 'CUARENTENA'`)} AS cuarentena,
             ${sum(`s.propiedad = 'PROPIO' AND s.estado_stock = 'TRANSITO'`)} AS transito,
             ${sum(`s.propiedad = 'TERCERO' AND s.estado_stock = 'DISPONIBLE'`)} AS t_disponible,
             ${sum(`s.propiedad = 'TERCERO' AND s.estado_stock = 'RESERVADO'`)} AS t_reservado,
             ${sum(`s.propiedad = 'TERCERO' AND s.estado_stock = 'CUARENTENA'`)} AS t_cuarentena,
             ${sum(`s.propiedad = 'TERCERO' AND s.estado_stock = 'TRANSITO'`)} AS t_transito
        FROM productos p
        LEFT JOIN categorias_producto cat ON cat.empresa_id = p.empresa_id AND cat.id = p.categoria_id
        LEFT JOIN marcas_producto m ON m.empresa_id = p.empresa_id AND m.id = p.marca_id
        LEFT JOIN familias_producto fa ON fa.empresa_id = p.empresa_id AND fa.id = p.familia_id
        LEFT JOIN lineas_producto li ON li.empresa_id = p.empresa_id AND li.id = p.linea_id
        LEFT JOIN unidades_medida um ON um.id = p.unidad_medida_id
        LEFT JOIN stock_saldos s ON s.empresa_id = p.empresa_id AND s.producto_id = p.id AND s.deposito_id = ANY($2::uuid[])
        LEFT JOIN stock_lotes l ON l.empresa_id = s.empresa_id AND l.id = s.lote_id
       WHERE p.empresa_id = $1 AND p.controla_stock${donde.length ? " AND " + donde.join(" AND ") : ""}
       GROUP BY p.id, cat.nombre, m.nombre, fa.nombre, li.nombre, um.nombre
      HAVING p.activo OR coalesce(sum(s.cantidad), 0) > 0
    ),
    niv AS (
      SELECT a.*, a.t_disponible + a.t_reservado + a.t_cuarentena + a.t_transito AS terceros,
             a.disponible + a.reservado + a.cuarentena AS fisico, a.disponible + a.reservado + a.cuarentena + a.transito AS virtual,
             CASE WHEN a.disponible <= 0 THEN 'SIN_STOCK'
                  WHEN a.minimo > 0 AND a.disponible < a.minimo THEN 'BAJO'
                  WHEN a.maximo > 0 AND a.disponible + a.reservado + a.cuarentena > a.maximo THEN 'SOBRESTOCK'
                  ELSE 'NORMAL' END AS nivel
        FROM agg a
    ),
    fil AS (SELECT * FROM niv${post.length ? " WHERE " + post.join(" AND ") : ""})`;
  return { cte, params, p, loteN };
}

const N = (c: string) => `${c}::float8`;

const filaDeProducto = (r: Record<string, unknown>): StockGeneralFila => ({
  productoId: r.id as string, codigo: r.codigo as string, codigoInventario: r.ci as string, codigoBarras: r.gtin as string,
  descripcion: r.descripcion as string, categoria: r.categoria as string, marca: r.marca as string, familia: r.familia as string,
  linea: r.linea as string, unidad: r.unidad as string, deposito: "", lote: "", fechaVencimiento: "", propiedad: "",
  disponible: r.disponible as number, reservado: r.reservado as number, cuarentena: r.cuarentena as number, transito: r.transito as number,
  fisico: r.fisico as number, virtual: r.virtual as number, terceros: r.terceros as number, nivel: r.nivel as NivelStock,
});

export async function leerStockGeneral(
  db: Db,
  empresaId: string,
  usuarioId: string,
  filtros: StockGeneralFiltros,
  pagina: number,
  tamano: number,
  todas = false,
): Promise<StockGeneralRespuesta | { error: string; status: number }> {
  const permitidos = await depositosPermitidos(db, empresaId, usuarioId);
  if (filtros.depositoId && !permitidos.some((d) => d.id === filtros.depositoId)) return { error: "Depósito no permitido.", status: 403 };
  const deps = filtros.depositoId ? [filtros.depositoId] : permitidos.map((d) => d.id);

  const { cte, params, p, loteN } = construir(empresaId, deps, filtros);

  const totalesQ = await db.query(
    `WITH ${cte}
     SELECT count(*)::int AS productos, ${N("coalesce(sum(disponible),0)")} AS disponible, ${N("coalesce(sum(reservado),0)")} AS reservado,
            ${N("coalesce(sum(cuarentena),0)")} AS cuarentena, ${N("coalesce(sum(transito),0)")} AS transito, ${N("coalesce(sum(fisico),0)")} AS fisico,
            ${N("coalesce(sum(virtual),0)")} AS virtual, ${N("coalesce(sum(terceros),0)")} AS terceros,
            count(*) FILTER (WHERE nivel = 'SIN_STOCK')::int AS "sinStock", count(*) FILTER (WHERE nivel = 'BAJO')::int AS bajo,
            count(*) FILTER (WHERE nivel = 'SOBRESTOCK')::int AS sobrestock,
            ${N("coalesce(sum(t_disponible),0)")} AS "tDisponible", ${N("coalesce(sum(t_reservado),0)")} AS "tReservado",
            ${N("coalesce(sum(t_cuarentena),0)")} AS "tCuarentena", ${N("coalesce(sum(t_transito),0)")} AS "tTransito"
       FROM fil`,
    params,
  );
  const tr = totalesQ.rows[0];
  const totales: StockGeneralTotales = {
    productos: tr.productos, disponible: tr.disponible, reservado: tr.reservado, cuarentena: tr.cuarentena, transito: tr.transito,
    fisico: tr.fisico, virtual: tr.virtual, terceros: tr.terceros, sinStock: tr.sinStock, bajo: tr.bajo, sobrestock: tr.sobrestock,
    tercerosPorEstado: { disponible: tr.tDisponible, reservado: tr.tReservado, cuarentena: tr.tCuarentena, transito: tr.tTransito },
  };

  let filas: StockGeneralFila[];
  let totalFilas: number;
  const limite = todas ? MAX_FILAS_EXPORTACION + 1 : tamano;
  const desplazamiento = todas ? 0 : (pagina - 1) * tamano;

  if (filtros.vista === "PRODUCTO") {
    totalFilas = totales.productos;
    const r = await db.query(
      `WITH ${cte}
       SELECT id, codigo, ci, gtin, descripcion, categoria, marca, familia, linea, unidad, ${N("disponible")} AS disponible, ${N("reservado")} AS reservado,
              ${N("cuarentena")} AS cuarentena, ${N("transito")} AS transito, ${N("fisico")} AS fisico, ${N("virtual")} AS virtual,
              ${N("terceros")} AS terceros, nivel
         FROM fil ORDER BY codigo, id LIMIT ${p(limite)} OFFSET ${p(desplazamiento)}`,
      params,
    );
    filas = r.rows.map(filaDeProducto);
  } else {
    const loteDet = loteN ? ` AND s.lote_id IN (SELECT id FROM stock_lotes WHERE empresa_id = $1 AND codigo_lote ILIKE ${loteN})` : "";
    const det = `det AS (
        SELECT s.producto_id, s.deposito_id, s.lote_id, s.propiedad,
               coalesce(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'DISPONIBLE'), 0) AS disponible,
               coalesce(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'RESERVADO'), 0) AS reservado,
               coalesce(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'CUARENTENA'), 0) AS cuarentena,
               coalesce(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'TRANSITO'), 0) AS transito
          FROM stock_saldos s
         WHERE s.empresa_id = $1 AND s.deposito_id = ANY($2::uuid[]) AND s.producto_id IN (SELECT id FROM fil)${loteDet}
         GROUP BY s.producto_id, s.deposito_id, s.lote_id, s.propiedad
        HAVING sum(s.cantidad) > 0
      )`;
    const base = `WITH ${cte}, ${det}`;
    totalFilas = Number((await db.query(`${base} SELECT count(*)::int AS n FROM det`, params)).rows[0].n);
    const r = await db.query(
      `${base}
       SELECT f.id, f.codigo, f.ci, f.gtin, f.descripcion, f.categoria, f.marca, f.familia, f.linea, f.unidad, f.nivel,
              d.nombre AS deposito, coalesce(l.codigo_lote, '') AS lote, coalesce(to_char(l.fecha_vencimiento, 'YYYY-MM-DD'), '') AS venc,
              det.propiedad, ${N("det.disponible")} AS disponible, ${N("det.reservado")} AS reservado, ${N("det.cuarentena")} AS cuarentena,
              ${N("det.transito")} AS transito, ${N("det.disponible + det.reservado + det.cuarentena")} AS fisico,
              ${N("det.disponible + det.reservado + det.cuarentena + det.transito")} AS virtual
         FROM det JOIN fil f ON f.id = det.producto_id
         JOIN depositos d ON d.empresa_id = $1 AND d.id = det.deposito_id
         LEFT JOIN stock_lotes l ON l.empresa_id = $1 AND l.id = det.lote_id
        ORDER BY f.codigo, f.id, d.nombre, lote, det.propiedad LIMIT ${p(limite)} OFFSET ${p(desplazamiento)}`,
      params,
    );
    filas = r.rows.map((x) => ({
      ...filaDeProducto(x), deposito: x.deposito as string, lote: x.lote as string, fechaVencimiento: x.venc as string,
      propiedad: x.propiedad as "PROPIO" | "TERCERO", terceros: 0,
    }));
  }
  if (todas && filas.length > MAX_FILAS_EXPORTACION) return { error: `La exportación supera ${MAX_FILAS_EXPORTACION} filas; reduzca los filtros.`, status: 413 };

  const [emp, cat, mar, fam, ahora] = await Promise.all([
    db.query(`SELECT razon_social AS nombre, moneda_base_codigo AS moneda FROM empresas WHERE id = $1`, [empresaId]),
    db.query(`SELECT id, nombre FROM categorias_producto WHERE empresa_id = $1 AND activo ORDER BY nombre`, [empresaId]),
    db.query(`SELECT id, nombre FROM marcas_producto WHERE empresa_id = $1 AND activo ORDER BY nombre`, [empresaId]),
    db.query(`SELECT id, nombre FROM familias_producto WHERE empresa_id = $1 AND activo ORDER BY nombre`, [empresaId]),
    db.query(`SELECT to_char(now() AT TIME ZONE 'America/Asuncion', 'DD/MM/YYYY HH24:MI') AS t, to_char(now() AT TIME ZONE 'America/Asuncion', 'YYYYMMDD-HH24MI') AS f`),
  ]);

  return {
    empresa: emp.rows[0],
    generado: ahora.rows[0].t,
    filtros,
    pagina: { numero: pagina, tamano, totalFilas },
    filas,
    totales,
    catalogos: { depositos: permitidos, categorias: cat.rows, marcas: mar.rows, familias: fam.rows },
    cobertura: COBERTURA_STOCK_GENERAL,
    sello: ahora.rows[0].f,
  };
}
