import type { Pool } from "pg";

import { depositosPermitidos, MAX_FILAS_EXPORTACION } from "@/lib/reportes/stock-general";
import type {
  SituacionCosto,
  ValorizacionFila,
  ValorizacionFiltros,
  ValorizacionRespuesta,
  ValorizacionTotales,
} from "@/types/reportes";

// Reporte 2 — Valorización de inventario (a la fecha de hoy). Fuente ÚNICA de costos: inventario_costos
// (cantidad valorizada y valor total reales). Nunca se usan precios de venta ni se calculan márgenes.
// Importes: se leen como texto `numeric` de PostgreSQL y se suman en la base (sin float).

type Db = Pick<Pool, "query">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const COBERTURA_VALORIZACION = [
  "Valorización a la fecha de hoy con el costo promedio ponderado real de inventario_costos (importes en la moneda base de la empresa). No es una valorización histórica a una fecha: V1 no guarda instantáneas de costos.",
  "Costo promedio = valor total / cantidad valorizada (—, si no hay cantidad valorizada). La cantidad valorizada no es el stock físico: el stock físico propio (de stock_saldos) se muestra solo para conciliar con el módulo Stock.",
  "El stock físico sin costo registrado no se valoriza ni se le asigna un costo: aparece como —, no suma al valor total y se informa como cantidad no valorizada.",
  "Es un reporte de costo: no incluye precios de venta ni márgenes. El stock de terceros no se valoriza (no es patrimonio de la empresa).",
];

export function parsearFiltrosValorizacion(sp: URLSearchParams): { filtros: ValorizacionFiltros; pagina: number; tamano: number } | { error: string } {
  const uuid = (k: string) => {
    const v = sp.get(k) ?? "";
    return v === "" || UUID.test(v) ? v : null;
  };
  const depositoId = uuid("depositoId"), categoriaId = uuid("categoriaId"), familiaId = uuid("familiaId");
  if (depositoId === null || categoriaId === null || familiaId === null) return { error: "Filtro con identificador no válido." };
  const vista = sp.get("vista") ?? "DETALLE";
  if (!["DETALLE", "PRODUCTO", "DEPOSITO", "CATEGORIA"].includes(vista)) return { error: "Vista no válida." };
  const existencia = sp.get("existencia") ?? "CON";
  const costo = sp.get("costo") ?? "TODOS";
  if (!["TODOS", "CON", "SIN"].includes(existencia)) return { error: "Filtro de existencia no válido." };
  if (!["TODOS", "CON", "SIN"].includes(costo)) return { error: "Filtro de costo no válido." };
  const pagina = Math.max(1, Math.floor(Number(sp.get("pagina") ?? 1)) || 1);
  const tamano = Math.min(200, Math.max(10, Math.floor(Number(sp.get("tamano") ?? 50)) || 50));
  return {
    filtros: {
      vista: vista as ValorizacionFiltros["vista"], depositoId, categoriaId, familiaId,
      existencia: existencia as ValorizacionFiltros["existencia"], costo: costo as ValorizacionFiltros["costo"],
      q: (sp.get("q") ?? "").trim().slice(0, 80),
    },
    pagina, tamano,
  };
}

const like = (v: string) => `%${v.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const SITUACION = (fis: string, cant: string) => `CASE WHEN ${cant} = 0 AND ${fis} = 0 THEN 'SIN_STOCK' WHEN ${cant} = 0 THEN 'SIN_COSTO' WHEN ${cant} = ${fis} THEN 'CON_COSTO' ELSE 'PARCIAL' END`;
const COSTO = (val: string, cant: string) => `CASE WHEN ${cant} > 0 THEN round(${val} / ${cant}, 4)::text END`;

export async function leerValorizacion(
  db: Db,
  empresaId: string,
  usuarioId: string,
  filtros: ValorizacionFiltros,
  pagina: number,
  tamano: number,
  todas = false,
): Promise<ValorizacionRespuesta | { error: string; status: number }> {
  const permitidos = await depositosPermitidos(db, empresaId, usuarioId);
  if (filtros.depositoId && !permitidos.some((d) => d.id === filtros.depositoId)) return { error: "Depósito no permitido.", status: 403 };
  const deps = filtros.depositoId ? [filtros.depositoId] : permitidos.map((d) => d.id);

  const params: unknown[] = [empresaId, deps];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const donde: string[] = [];
  if (filtros.q) { const n = p(like(filtros.q)); donde.push(`(pr.codigo ILIKE ${n} OR pr.descripcion ILIKE ${n} OR pr.codigo_inventario ILIKE ${n} OR pr.codigo_barras ILIKE ${n})`); }
  if (filtros.categoriaId) donde.push(`pr.categoria_id = ${p(filtros.categoriaId)}`);
  if (filtros.familiaId) donde.push(`pr.familia_id = ${p(filtros.familiaId)}`);
  const post: string[] = [];
  if (filtros.existencia === "CON") post.push(`(fisico > 0 OR cantv > 0)`);
  if (filtros.existencia === "SIN") post.push(`(fisico = 0 AND cantv = 0)`);
  if (filtros.costo === "CON") post.push(`cantv > 0`);
  if (filtros.costo === "SIN") post.push(`cantv = 0`);

  // Una fila por producto × depósito: registros de inventario_costos y/o stock físico PROPIO (aunque no tenga costo).
  const cte = `
    par AS (
      SELECT producto_id, deposito_id FROM inventario_costos WHERE empresa_id = $1 AND deposito_id = ANY($2::uuid[])
      UNION
      SELECT producto_id, deposito_id FROM stock_saldos
       WHERE empresa_id = $1 AND deposito_id = ANY($2::uuid[]) AND propiedad = 'PROPIO' AND estado_stock <> 'TRANSITO' AND cantidad > 0
    ),
    fis AS (
      SELECT producto_id, deposito_id, sum(cantidad) AS fisico FROM stock_saldos
       WHERE empresa_id = $1 AND deposito_id = ANY($2::uuid[]) AND propiedad = 'PROPIO' AND estado_stock <> 'TRANSITO'
       GROUP BY producto_id, deposito_id
    ),
    base AS (
      SELECT pr.id AS producto_id, pr.codigo, pr.descripcion, pr.categoria_id, coalesce(cat.nombre, 'Sin categoría') AS categoria,
             coalesce(fa.nombre, '') AS familia, d.id AS deposito_id, d.nombre AS deposito,
             coalesce(f.fisico, 0) AS fisico, coalesce(ic.cantidad_valorizada, 0) AS cantv, ic.valor_total AS valor,
             (ic.id IS NOT NULL) AS tiene_registro
        FROM par
        JOIN productos pr ON pr.empresa_id = $1 AND pr.id = par.producto_id
        JOIN depositos d ON d.empresa_id = $1 AND d.id = par.deposito_id
        LEFT JOIN categorias_producto cat ON cat.empresa_id = pr.empresa_id AND cat.id = pr.categoria_id
        LEFT JOIN familias_producto fa ON fa.empresa_id = pr.empresa_id AND fa.id = pr.familia_id
        LEFT JOIN fis f ON f.producto_id = par.producto_id AND f.deposito_id = par.deposito_id
        LEFT JOIN inventario_costos ic ON ic.empresa_id = $1 AND ic.producto_id = par.producto_id AND ic.deposito_id = par.deposito_id
       ${donde.length ? "WHERE " + donde.join(" AND ") : ""}
    ),
    fil AS (SELECT * FROM base${post.length ? " WHERE " + post.join(" AND ") : ""})`;

  const agg = (extra: string, clave: string, cod: string, desc: string, cat: string, fam: string, dep: string, group: string, order: string) => `
    vista AS (
      SELECT ${clave} AS clave, ${cod} AS codigo, ${desc} AS descripcion, ${cat} AS categoria, ${fam} AS familia, ${dep} AS deposito,
             ${extra}
             sum(fisico) AS fisico, sum(cantv) AS cantv, sum(valor) AS valor
        FROM fil GROUP BY ${group}
    )`;
  const cuentas = `count(DISTINCT producto_id)::int AS productos, count(DISTINCT deposito_id)::int AS depositos,`;
  let vistaCte: string;
  switch (filtros.vista) {
    case "PRODUCTO":
      vistaCte = agg(cuentas, "producto_id::text", "codigo", "descripcion", "categoria", "familia", "''", "producto_id, codigo, descripcion, categoria, familia", "");
      break;
    case "DEPOSITO":
      vistaCte = agg(cuentas, "deposito_id::text", "''", "''", "''", "''", "deposito", "deposito_id, deposito", "");
      break;
    case "CATEGORIA":
      vistaCte = agg(cuentas, "coalesce(categoria_id::text, 'sin')", "''", "''", "categoria", "''", "''", "categoria_id, categoria", "");
      break;
    default:
      vistaCte = agg("1 AS productos, 1 AS depositos,", "producto_id::text || ':' || deposito_id::text", "codigo", "descripcion", "categoria", "familia", "deposito", "producto_id, deposito_id, codigo, descripcion, categoria, familia, deposito", "");
  }
  const orden = { DETALLE: "categoria, codigo, deposito, clave", PRODUCTO: "categoria, codigo, clave", DEPOSITO: "deposito, clave", CATEGORIA: "categoria, clave" }[filtros.vista];

  const [totQ, cntQ] = await Promise.all([
    db.query(
      `WITH ${cte}
       SELECT count(*)::int AS filas, count(DISTINCT producto_id)::int AS productos, count(DISTINCT deposito_id)::int AS depositos,
              coalesce(sum(fisico), 0)::float8 AS fisico, coalesce(sum(cantv), 0)::float8 AS cantv, coalesce(sum(valor), 0::numeric(18,4))::text AS valor,
              ${COSTO("coalesce(sum(valor), 0::numeric(18,4))", "sum(cantv)")} AS costo,
              count(*) FILTER (WHERE cantv = 0 AND fisico > 0)::int AS sin_costo, coalesce(sum(greatest(fisico - cantv, 0)), 0)::float8 AS no_valorizado
         FROM fil`,
      params,
    ),
    db.query(`WITH ${cte}, ${vistaCte} SELECT count(*)::int AS n FROM vista`, params),
  ]);
  const emp = (await db.query(`SELECT razon_social AS nombre, moneda_base_codigo AS moneda FROM empresas WHERE id = $1`, [empresaId])).rows[0];
  const t = totQ.rows[0];
  const totales: ValorizacionTotales = {
    filas: t.filas, productos: t.productos, depositos: t.depositos, fisico: t.fisico, cantidadValorizada: t.cantv,
    valorTotal: t.valor, costoPromedio: t.costo, filasSinCosto: t.sin_costo, fisicoNoValorizado: t.no_valorizado, moneda: emp.moneda,
  };
  const totalFilas = cntQ.rows[0].n as number;
  const limite = todas ? MAX_FILAS_EXPORTACION + 1 : tamano;
  const desplazamiento = todas ? 0 : (pagina - 1) * tamano;

  const rows = await db.query(
    `WITH ${cte}, ${vistaCte}
     SELECT clave, codigo, descripcion, categoria, familia, deposito, productos, depositos, fisico::float8 AS fisico, cantv::float8 AS cantv,
            ${COSTO("valor", "cantv")} AS costo, valor::text AS valor, ${SITUACION("fisico", "cantv")} AS situacion
       FROM vista ORDER BY ${orden} LIMIT ${p(limite)} OFFSET ${p(desplazamiento)}`,
    params,
  );
  if (todas && rows.rows.length > MAX_FILAS_EXPORTACION) return { error: `La exportación supera ${MAX_FILAS_EXPORTACION} filas; reduzca los filtros.`, status: 413 };
  const filas: ValorizacionFila[] = rows.rows.map((x) => ({
    clave: x.clave, codigo: x.codigo, descripcion: x.descripcion, categoria: x.categoria, familia: x.familia, deposito: x.deposito,
    productos: x.productos, depositos: x.depositos, fisico: x.fisico, cantidadValorizada: x.cantv, costoPromedio: x.costo, valorTotal: x.valor,
    moneda: emp.moneda, situacionCosto: x.situacion as SituacionCosto,
  }));

  const [cat, fam, ahora] = await Promise.all([
    db.query(`SELECT id, nombre FROM categorias_producto WHERE empresa_id = $1 AND activo ORDER BY nombre`, [empresaId]),
    db.query(`SELECT id, nombre FROM familias_producto WHERE empresa_id = $1 AND activo ORDER BY nombre`, [empresaId]),
    db.query(`SELECT to_char(now() AT TIME ZONE 'America/Asuncion', 'DD/MM/YYYY HH24:MI') AS t, to_char(now() AT TIME ZONE 'America/Asuncion', 'YYYYMMDD-HH24MI') AS f`),
  ]);

  return {
    empresa: emp,
    generado: ahora.rows[0].t,
    sello: ahora.rows[0].f,
    filtros,
    pagina: { numero: pagina, tamano, totalFilas },
    filas,
    totales,
    catalogos: { depositos: permitidos, categorias: cat.rows, familias: fam.rows },
    cobertura: COBERTURA_VALORIZACION,
  };
}
