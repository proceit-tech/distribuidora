import type { Pool } from "pg";

import { depositosPermitidos, MAX_FILAS_EXPORTACION } from "@/lib/reportes/stock-general";
import type { ClaseVencimiento, LotesFila, LotesFiltros, LotesRespuesta, LotesTotales } from "@/types/reportes";

// Reporte 5 — Lotes y vencimientos (solo lectura; no crea movimientos ni modifica stock).
//
// Fuente: stock_lotes (lote real de un producto, con fecha de vencimiento opcional) × stock_saldos (cantidad por
// depósito, estado y propiedad). Solo existen lotes para productos controlados por lote; el stock sin lote no aparece
// aquí y nunca se le asigna vencimiento. Todo filtrado por empresa_id y por los depósitos con alcance del usuario.
//
// Clasificación según la fecha de HOY en Paraguay (America/Asuncion), no la del servidor:
//   SIN_FECHA : el lote no tiene fecha de vencimiento (no se inventa; nunca se mezcla con vencidos)
//   VENCIDO   : vencimiento < hoy  (el día de vencimiento todavía NO está vencido)
//   PROXIMO   : hoy <= vencimiento <= hoy + horizonte (días)
//   VIGENTE   : vencimiento > hoy + horizonte
// Días restantes = vencimiento − hoy (negativo si ya venció). La cuarentena es un estado de stock y NO vuelve vencido a un lote.
// Cantidades PROPIAS: disponible / reservado / cuarentena; físico = suma de las tres. Terceros va en columnas aparte.

type Db = Pick<Pool, "query">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const CLASES: ClaseVencimiento[] = ["VENCIDO", "PROXIMO", "VIGENTE", "SIN_FECHA"];
export const HORIZONTE_DEFECTO = 30;
export const HORIZONTE_MAX = 3650;

export const COBERTURA_LOTES = [
  "Lotes reales de stock_lotes con sus saldos de stock_saldos. Solo aparecen productos controlados por lote: el stock sin lote no se muestra aquí y nunca se le asigna vencimiento.",
  "Clasificación con la fecha de hoy en Paraguay (America/Asuncion): Vencido = vencimiento anterior a hoy (el día del vencimiento aún no está vencido); Próximo a vencer = vence entre hoy y el horizonte elegido; Vigente = vence después del horizonte; Sin fecha = lote sin vencimiento registrado.",
  "La cuarentena es un estado del stock: no hace vencido a un lote. Un lote sin fecha de vencimiento se muestra como Sin fecha, nunca como vencido ni vigente.",
  "Cantidades propias (disponible, reservado, cuarentena, físico) separadas del stock de terceros, que va en sus propias columnas y nunca se suma al propio. En V1 no hay stock propio en tránsito.",
  "Los totales por situación cuentan cada lote una sola vez y suman cada saldo una sola vez, aunque el lote esté en varios depósitos (vista por lote y por depósito concilian entre sí).",
  "Foto actual de los saldos; no es un histórico de vencimientos.",
];

export function parsearFiltrosLotes(sp: URLSearchParams): { filtros: LotesFiltros; pagina: number; tamano: number } | { error: string } {
  const uuid = (k: string) => {
    const v = sp.get(k) ?? "";
    return v === "" || UUID.test(v) ? v : null;
  };
  const depositoId = uuid("depositoId"), categoriaId = uuid("categoriaId"), marcaId = uuid("marcaId"), familiaId = uuid("familiaId");
  if (depositoId === null || categoriaId === null || marcaId === null || familiaId === null) return { error: "Filtro con identificador no válido." };
  const vista = sp.get("vista") ?? "LOTE";
  if (vista !== "LOTE" && vista !== "DEPOSITO") return { error: "Vista no válida." };
  const clase = sp.get("clase") ?? "";
  if (clase !== "" && !CLASES.includes(clase as ClaseVencimiento)) return { error: "Situación de vencimiento no válida." };
  const existencia = sp.get("existencia") ?? "CON";
  if (!["CON", "SIN", "TODOS"].includes(existencia)) return { error: "Filtro de existencia no válido." };
  const hRaw = sp.get("horizonte") ?? String(HORIZONTE_DEFECTO);
  const horizonte = Number(hRaw);
  if (!/^\d+$/.test(hRaw) || horizonte > HORIZONTE_MAX) return { error: `Horizonte no válido (0 a ${HORIZONTE_MAX} días).` };
  const fecha = (k: string) => {
    const v = sp.get(k) ?? "";
    if (v === "") return "";
    if (!FECHA.test(v) || Number.isNaN(Date.parse(v + "T00:00:00Z")) || new Date(v + "T00:00:00Z").toISOString().slice(0, 10) !== v) return null;
    return v;
  };
  const vencDesde = fecha("vencDesde"), vencHasta = fecha("vencHasta");
  if (vencDesde === null || vencHasta === null) return { error: "Fecha no válida (AAAA-MM-DD)." };
  if (vencDesde && vencHasta && vencDesde > vencHasta) return { error: "El intervalo de vencimiento es inválido: la fecha inicial es posterior a la final." };
  const pagina = Math.max(1, Math.floor(Number(sp.get("pagina") ?? 1)) || 1);
  const tamano = Math.min(200, Math.max(10, Math.floor(Number(sp.get("tamano") ?? 50)) || 50));
  return {
    filtros: {
      vista, depositoId, categoriaId, marcaId, familiaId, horizonte, vencDesde, vencHasta,
      clase: clase as LotesFiltros["clase"], existencia: existencia as LotesFiltros["existencia"],
      q: (sp.get("q") ?? "").trim().slice(0, 80), lote: (sp.get("lote") ?? "").trim().slice(0, 40),
    },
    pagina, tamano,
  };
}

const like = (v: string) => `%${v.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const N = (c: string) => `${c}::float8`;
const HOY = `(now() AT TIME ZONE 'America/Asuncion')::date`;

export async function leerLotes(
  db: Db,
  empresaId: string,
  usuarioId: string,
  filtros: LotesFiltros,
  pagina: number,
  tamano: number,
  todas = false,
): Promise<LotesRespuesta | { error: string; status: number }> {
  const permitidos = await depositosPermitidos(db, empresaId, usuarioId);
  if (filtros.depositoId && !permitidos.some((d) => d.id === filtros.depositoId)) return { error: "Depósito no permitido.", status: 403 };
  const deps = filtros.depositoId ? [filtros.depositoId] : permitidos.map((d) => d.id);

  const params: unknown[] = [empresaId, deps, filtros.horizonte];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const donde: string[] = [];
  if (filtros.q) { const n = p(like(filtros.q)); donde.push(`(pr.codigo ILIKE ${n} OR pr.descripcion ILIKE ${n} OR pr.codigo_inventario ILIKE ${n} OR pr.codigo_barras ILIKE ${n})`); }
  if (filtros.lote) donde.push(`l.codigo_lote ILIKE ${p(like(filtros.lote))}`);
  if (filtros.categoriaId) donde.push(`pr.categoria_id = ${p(filtros.categoriaId)}`);
  if (filtros.marcaId) donde.push(`pr.marca_id = ${p(filtros.marcaId)}`);
  if (filtros.familiaId) donde.push(`pr.familia_id = ${p(filtros.familiaId)}`);
  if (filtros.vencDesde) donde.push(`l.fecha_vencimiento >= ${p(filtros.vencDesde)}::date`);
  if (filtros.vencHasta) donde.push(`l.fecha_vencimiento <= ${p(filtros.vencHasta)}::date`);
  const post: string[] = [];
  if (filtros.clase) post.push(`clase = ${p(filtros.clase)}`);
  if (filtros.existencia === "CON") post.push(`(fisico + terceros) > 0`);
  if (filtros.existencia === "SIN") post.push(`(fisico + terceros) = 0`);

  const sum = (cond: string) => `coalesce(sum(s.cantidad) FILTER (WHERE ${cond}), 0)`;
  // Un saldo por lote × depósito (propio y terceros en columnas distintas). Sin filtro de depósito, un lote sin ningún saldo
  // registrado en toda la empresa aparece una vez, con ceros y sin depósito; con filtro de depósito solo salen lotes con saldo allí.
  const cte = `
    par AS (
      SELECT s.lote_id, s.deposito_id,
             ${sum(`s.propiedad = 'PROPIO' AND s.estado_stock = 'DISPONIBLE'`)} AS disponible,
             ${sum(`s.propiedad = 'PROPIO' AND s.estado_stock = 'RESERVADO'`)} AS reservado,
             ${sum(`s.propiedad = 'PROPIO' AND s.estado_stock = 'CUARENTENA'`)} AS cuarentena,
             ${sum(`s.propiedad = 'TERCERO' AND s.estado_stock = 'DISPONIBLE'`)} AS t_disponible,
             ${sum(`s.propiedad = 'TERCERO' AND s.estado_stock = 'RESERVADO'`)} AS t_reservado,
             ${sum(`s.propiedad = 'TERCERO' AND s.estado_stock = 'CUARENTENA'`)} AS t_cuarentena,
             ${sum(`s.propiedad = 'TERCERO' AND s.estado_stock = 'TRANSITO'`)} AS t_transito
        FROM stock_saldos s
       WHERE s.empresa_id = $1 AND s.lote_id IS NOT NULL AND s.deposito_id = ANY($2::uuid[])
       GROUP BY s.lote_id, s.deposito_id
    ),
    base AS (
      SELECT l.id AS lote_id, l.codigo_lote AS lote, l.fecha_vencimiento AS venc, pr.id AS producto_id, pr.codigo, pr.descripcion,
             coalesce(cat.nombre, '') AS categoria, coalesce(m.nombre, '') AS marca, coalesce(fa.nombre, '') AS familia, coalesce(um.nombre, '') AS unidad,
             par.deposito_id, coalesce(d.nombre, '') AS deposito,
             coalesce(par.disponible, 0) AS disponible, coalesce(par.reservado, 0) AS reservado, coalesce(par.cuarentena, 0) AS cuarentena,
             coalesce(par.disponible, 0) + coalesce(par.reservado, 0) + coalesce(par.cuarentena, 0) AS fisico,
             coalesce(par.t_disponible, 0) AS t_disponible, coalesce(par.t_reservado, 0) AS t_reservado,
             coalesce(par.t_cuarentena, 0) AS t_cuarentena, coalesce(par.t_transito, 0) AS t_transito,
             coalesce(par.t_disponible, 0) + coalesce(par.t_reservado, 0) + coalesce(par.t_cuarentena, 0) + coalesce(par.t_transito, 0) AS terceros,
             CASE WHEN l.fecha_vencimiento IS NULL THEN 'SIN_FECHA'
                  WHEN l.fecha_vencimiento < ${HOY} THEN 'VENCIDO'
                  WHEN l.fecha_vencimiento <= ${HOY} + $3::int THEN 'PROXIMO'
                  ELSE 'VIGENTE' END AS clase,
             (l.fecha_vencimiento - ${HOY}) AS dias
        FROM stock_lotes l
        JOIN productos pr ON pr.empresa_id = l.empresa_id AND pr.id = l.producto_id
        LEFT JOIN categorias_producto cat ON cat.empresa_id = pr.empresa_id AND cat.id = pr.categoria_id
        LEFT JOIN marcas_producto m ON m.empresa_id = pr.empresa_id AND m.id = pr.marca_id
        LEFT JOIN familias_producto fa ON fa.empresa_id = pr.empresa_id AND fa.id = pr.familia_id
        LEFT JOIN unidades_medida um ON um.id = pr.unidad_medida_id
        LEFT JOIN par ON par.lote_id = l.id
        LEFT JOIN depositos d ON d.empresa_id = l.empresa_id AND d.id = par.deposito_id
       WHERE l.empresa_id = $1${donde.length ? " AND " + donde.join(" AND ") : ""}
         AND (par.lote_id IS NOT NULL${filtros.depositoId ? "" : " OR NOT EXISTS (SELECT 1 FROM stock_saldos x WHERE x.empresa_id = $1 AND x.lote_id = l.id)"})
    ),
    fil AS (SELECT * FROM base${post.length ? " WHERE " + post.join(" AND ") : ""}),
    lot AS (
      SELECT lote_id, producto_id, codigo, descripcion, categoria, marca, familia, unidad, lote, venc, clase, dias,
             count(deposito_id)::int AS depositos,
             sum(disponible) AS disponible, sum(reservado) AS reservado, sum(cuarentena) AS cuarentena, sum(fisico) AS fisico,
             sum(t_disponible) AS t_disponible, sum(t_reservado) AS t_reservado, sum(t_cuarentena) AS t_cuarentena, sum(t_transito) AS t_transito,
             sum(terceros) AS terceros
        FROM fil GROUP BY lote_id, producto_id, codigo, descripcion, categoria, marca, familia, unidad, lote, venc, clase, dias
    )`;

  const emp = (await db.query(`SELECT razon_social AS nombre, moneda_base_codigo AS moneda FROM empresas WHERE id = $1`, [empresaId])).rows[0];

  const porClase = await db.query(
    `WITH ${cte}
     SELECT clase, count(*)::int AS lotes, ${N("coalesce(sum(fisico), 0)")} AS fisico, ${N("coalesce(sum(terceros), 0)")} AS terceros FROM lot GROUP BY clase`,
    params,
  );
  const tot = (
    await db.query(
      `WITH ${cte}
       SELECT (SELECT count(*) FROM fil)::int AS filas, ${HOY}::text AS hoy,
              ${N("coalesce(sum(disponible), 0)")} AS disponible, ${N("coalesce(sum(reservado), 0)")} AS reservado, ${N("coalesce(sum(cuarentena), 0)")} AS cuarentena,
              ${N("coalesce(sum(fisico), 0)")} AS fisico, ${N("coalesce(sum(terceros), 0)")} AS terceros, count(*)::int AS lotes,
              ${N("coalesce(sum(t_disponible), 0)")} AS td, ${N("coalesce(sum(t_reservado), 0)")} AS tr, ${N("coalesce(sum(t_cuarentena), 0)")} AS tc, ${N("coalesce(sum(t_transito), 0)")} AS tt
         FROM lot`,
      params,
    )
  ).rows[0];
  const totales: LotesTotales = {
    lotes: tot.lotes, filas: tot.filas, hoy: tot.hoy, disponible: tot.disponible, reservado: tot.reservado, cuarentena: tot.cuarentena,
    fisico: tot.fisico, terceros: tot.terceros, tercerosPorEstado: { disponible: tot.td, reservado: tot.tr, cuarentena: tot.tc, transito: tot.tt },
    clases: CLASES.map((c) => {
      const x = porClase.rows.find((r) => r.clase === c);
      return { clase: c, lotes: x?.lotes ?? 0, fisico: x?.fisico ?? 0, terceros: x?.terceros ?? 0 };
    }),
  };

  const limite = todas ? MAX_FILAS_EXPORTACION + 1 : tamano;
  const desplazamiento = todas ? 0 : (pagina - 1) * tamano;
  const orden = `CASE f.clase WHEN 'VENCIDO' THEN 0 WHEN 'PROXIMO' THEN 1 WHEN 'VIGENTE' THEN 2 ELSE 3 END, f.venc NULLS LAST, f.codigo, f.lote, f.lote_id`;
  const campos = `f.producto_id, f.lote_id, f.codigo, f.descripcion, f.categoria, f.marca, f.familia, f.unidad, f.lote, f.clase, f.dias,
              coalesce(to_char(f.venc, 'YYYY-MM-DD'), '') AS venc,
              ${N("f.disponible")} AS disponible, ${N("f.reservado")} AS reservado, ${N("f.cuarentena")} AS cuarentena, ${N("f.fisico")} AS fisico,
              ${N("f.terceros")} AS terceros, ${N("f.t_disponible")} AS td, ${N("f.t_reservado")} AS tr, ${N("f.t_cuarentena")} AS tc, ${N("f.t_transito")} AS tt`;
  let rows: Record<string, unknown>[];
  let totalFilas: number;
  if (filtros.vista === "LOTE") {
    totalFilas = totales.lotes;
    rows = (await db.query(`WITH ${cte} SELECT ${campos}, f.depositos, '' AS deposito FROM lot f ORDER BY ${orden} LIMIT ${p(limite)} OFFSET ${p(desplazamiento)}`, params)).rows;
  } else {
    totalFilas = totales.filas;
    rows = (await db.query(`WITH ${cte} SELECT ${campos}, (f.deposito_id IS NOT NULL)::int AS depositos, f.deposito FROM fil f ORDER BY ${orden}, f.deposito LIMIT ${p(limite)} OFFSET ${p(desplazamiento)}`, params)).rows;
  }
  if (todas && rows.length > MAX_FILAS_EXPORTACION) return { error: `La exportación supera ${MAX_FILAS_EXPORTACION} filas; reduzca los filtros.`, status: 413 };

  const filas: LotesFila[] = rows.map((r) => ({
    productoId: r.producto_id as string, loteId: r.lote_id as string, codigo: r.codigo as string, descripcion: r.descripcion as string,
    categoria: r.categoria as string, marca: r.marca as string, familia: r.familia as string, unidad: r.unidad as string,
    lote: r.lote as string, deposito: r.deposito as string, depositos: r.depositos as number, vencimiento: r.venc as string,
    diasRestantes: r.dias === null ? null : Number(r.dias), clase: r.clase as ClaseVencimiento,
    disponible: r.disponible as number, reservado: r.reservado as number, cuarentena: r.cuarentena as number, fisico: r.fisico as number,
    terceros: r.terceros as number, tercerosEstados: { disponible: r.td as number, reservado: r.tr as number, cuarentena: r.tc as number, transito: r.tt as number },
  }));

  const [cat, mar, fam, ahora] = await Promise.all([
    db.query(`SELECT id, nombre FROM categorias_producto WHERE empresa_id = $1 AND activo ORDER BY nombre`, [empresaId]),
    db.query(`SELECT id, nombre FROM marcas_producto WHERE empresa_id = $1 AND activo ORDER BY nombre`, [empresaId]),
    db.query(`SELECT id, nombre FROM familias_producto WHERE empresa_id = $1 AND activo ORDER BY nombre`, [empresaId]),
    db.query(`SELECT to_char(now() AT TIME ZONE 'America/Asuncion', 'DD/MM/YYYY HH24:MI') AS t, to_char(now() AT TIME ZONE 'America/Asuncion', 'YYYYMMDD-HH24MI') AS f`),
  ]);

  return {
    empresa: emp, generado: ahora.rows[0].t, sello: ahora.rows[0].f, filtros,
    pagina: { numero: pagina, tamano, totalFilas }, filas, totales,
    catalogos: { depositos: permitidos, categorias: cat.rows, marcas: mar.rows, familias: fam.rows },
    cobertura: COBERTURA_LOTES,
  };
}
