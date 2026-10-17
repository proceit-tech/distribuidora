import type { Pool } from "pg";

import { MAX_FILAS_EXPORTACION } from "@/lib/reportes/stock-general";
import { depositosDelAlcance } from "@/lib/reportes/alcance";
import { conSnapshotLectura } from "@/lib/reportes/snapshot";
import { SQL_SITUACION } from "@/lib/reportes/valorizacion-cobertura";
import type {
  ConteoSituaciones,
  SituacionCosto,
  ValorizacionFila,
  ValorizacionFiltros,
  ValorizacionRespuesta,
  ValorizacionTotales,
} from "@/types/reportes";

// Reporte 2 — Valorización de inventario (a la fecha de la consulta). Fuente ÚNICA de costos: inventario_costos (cantidad valorizada y valor total
// reales); el stock físico propio (stock_saldos) solo concilia cantidades. Nunca se usan precios de venta ni se calculan márgenes.
// Dinero Y cantidades se leen como texto `numeric` y se suman/comparan en la base (sin float). Todo lo de UNA solicitud (totales, conteo, filas,
// catálogos, hora) se lee en UNA conexión y UNA transacción REPEATABLE READ de solo lectura (RPT-V02).

type Db = Pick<Pool, "connect">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const COBERTURA_VALORIZACION = [
  "Valorización a la fecha de la consulta con el costo promedio ponderado real de inventario_costos (importes en la moneda base de la empresa). No es una valorización histórica ni un cierre contable: V1 no guarda instantáneas de costos; el archivo exportado es una foto corriente.",
  "El dinero se suma siempre (misma moneda base). Las cantidades y el costo unitario solo existen por producto (detalle y por producto): no se suman cantidades de unidades distintas, por eso las vistas por depósito y por categoría los muestran como «n/a».",
  "Cada par producto × depósito se clasifica ANTES de agrupar: con costo, parcial (valorizada < física), sin costo, excedente valorizado (valorizada > física) o valor sin cantidad. Las diferencias de signo opuesto no se compensan: los conteos y el dinero se informan por situación.",
  "El stock físico sin costo registrado no se valoriza ni se le asigna un costo; el reporte detecta las diferencias pero NO ajusta costos ni saldos (eso lo hace el motor de Inventario). El stock de terceros y el tránsito no se valorizan.",
  "Incluye los depósitos inactivos de su alcance (con existencia o valor): su valor forma parte del total y se identifica como tal.",
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
  const cobertura = sp.get("cobertura") ?? "TODOS";
  if (!["TODOS", "CON", "SIN"].includes(existencia)) return { error: "Filtro de existencia no válido." };
  if (!["TODOS", "CON", "SIN"].includes(costo)) return { error: "Filtro de costo no válido." };
  if (!["TODOS", "DIVERGENCIAS", "PARCIAL", "SIN_COSTO", "EXCEDENTE", "RESIDUO"].includes(cobertura)) return { error: "Filtro de cobertura no válido." };
  const pagina = Math.max(1, Math.floor(Number(sp.get("pagina") ?? 1)) || 1);
  const tamano = Math.min(200, Math.max(10, Math.floor(Number(sp.get("tamano") ?? 50)) || 50));
  return {
    filtros: {
      vista: vista as ValorizacionFiltros["vista"], depositoId, categoriaId, familiaId,
      existencia: existencia as ValorizacionFiltros["existencia"], costo: costo as ValorizacionFiltros["costo"],
      cobertura: cobertura as ValorizacionFiltros["cobertura"],
      q: (sp.get("q") ?? "").trim().slice(0, 80),
    },
    pagina, tamano,
  };
}

const like = (v: string) => `%${v.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const COSTO = (val: string, cant: string) => `CASE WHEN ${cant} > 0 THEN round(${val} / ${cant}, 4)::text END`;

// El snapshot de lectura vive en snapshot.ts (compartido con Stock crítico); se reexporta para conservar la API de este módulo.
export { conSnapshotLectura };

const num = (v: unknown): number => Number(v ?? 0);

function conteosDe(x: Record<string, unknown>): ConteoSituaciones {
  return { CON_COSTO: num(x.n_con), PARCIAL: num(x.n_par), SIN_COSTO: num(x.n_sin), EXCEDENTE: num(x.n_exc), RESIDUO: num(x.n_res), SIN_STOCK: num(x.n_nul) };
}

export async function leerValorizacion(
  db: Db,
  empresaId: string,
  usuarioId: string,
  filtros: ValorizacionFiltros,
  pagina: number,
  tamano: number,
  todas = false,
): Promise<ValorizacionRespuesta | { error: string; status: number }> {
  return conSnapshotLectura(db, async (c) => {
    const permitidos = await depositosDelAlcance(c, empresaId, usuarioId);
    if (filtros.depositoId && !permitidos.some((d) => d.id === filtros.depositoId)) return { error: "Depósito no permitido.", status: 403 };
    const deps = filtros.depositoId ? [filtros.depositoId] : permitidos.map((d) => d.id);

    const params: unknown[] = [empresaId, deps];
    const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
    const donde: string[] = [];
    if (filtros.q) { const n = p(like(filtros.q)); donde.push(`(pr.codigo ILIKE ${n} OR pr.descripcion ILIKE ${n} OR pr.codigo_inventario ILIKE ${n} OR pr.codigo_barras ILIKE ${n})`); }
    if (filtros.categoriaId) donde.push(`pr.categoria_id = ${p(filtros.categoriaId)}`);
    if (filtros.familiaId) donde.push(`pr.familia_id = ${p(filtros.familiaId)}`);
    const post: string[] = [];
    if (filtros.existencia === "CON") post.push(`(fisico > 0 OR cantv > 0 OR valor <> 0)`);
    if (filtros.existencia === "SIN") post.push(`situacion = 'SIN_STOCK'`);
    if (filtros.costo === "CON") post.push(`cantv > 0`);
    if (filtros.costo === "SIN") post.push(`cantv = 0`);
    if (filtros.cobertura === "DIVERGENCIAS") post.push(`situacion NOT IN ('CON_COSTO', 'SIN_STOCK')`);
    else if (filtros.cobertura !== "TODOS") post.push(`situacion = '${filtros.cobertura}'`); // valor ya validado contra una lista cerrada

    // Una fila por producto × depósito: registros de inventario_costos y/o stock físico PROPIO (aunque no tenga costo), SIEMPRE clasificada antes de agrupar.
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
               coalesce(fa.nombre, '') AS familia, coalesce(um.nombre, '') AS unidad, d.id AS deposito_id, d.nombre AS deposito, d.activo AS deposito_activo,
               coalesce(f.fisico, 0) AS fisico, coalesce(ic.cantidad_valorizada, 0) AS cantv, coalesce(ic.valor_total, 0) AS valor,
               (ic.id IS NOT NULL) AS tiene_registro
          FROM par
          JOIN productos pr ON pr.empresa_id = $1 AND pr.id = par.producto_id
          JOIN depositos d ON d.empresa_id = $1 AND d.id = par.deposito_id
          LEFT JOIN categorias_producto cat ON cat.empresa_id = pr.empresa_id AND cat.id = pr.categoria_id
          LEFT JOIN familias_producto fa ON fa.empresa_id = pr.empresa_id AND fa.id = pr.familia_id
          LEFT JOIN unidades_medida um ON um.id = pr.unidad_medida_id
          LEFT JOIN fis f ON f.producto_id = par.producto_id AND f.deposito_id = par.deposito_id
          LEFT JOIN inventario_costos ic ON ic.empresa_id = $1 AND ic.producto_id = par.producto_id AND ic.deposito_id = par.deposito_id
         ${donde.length ? "WHERE " + donde.join(" AND ") : ""}
      ),
      cls AS (SELECT base.*, ${SQL_SITUACION} AS situacion FROM base),
      fil AS (SELECT * FROM cls${post.length ? " WHERE " + post.join(" AND ") : ""})`;

    const cuentaSituaciones = `
      count(*) FILTER (WHERE situacion = 'CON_COSTO')::int AS n_con, count(*) FILTER (WHERE situacion = 'PARCIAL')::int AS n_par,
      count(*) FILTER (WHERE situacion = 'SIN_COSTO')::int AS n_sin, count(*) FILTER (WHERE situacion = 'EXCEDENTE')::int AS n_exc,
      count(*) FILTER (WHERE situacion = 'RESIDUO')::int AS n_res, count(*) FILTER (WHERE situacion = 'SIN_STOCK')::int AS n_nul`;

    // Cantidades y costo unitario solo cuando el grupo es de UN producto (una unidad); en depósito y categoría quedan NULL (no aplicable).
    const conCantidades = filtros.vista === "DETALLE" || filtros.vista === "PRODUCTO";
    const agg = (clave: string, cod: string, desc: string, cat: string, fam: string, dep: string, uni: string, group: string, cuentas: string) => `
      vista AS (
        SELECT ${clave} AS clave, ${cod} AS codigo, ${desc} AS descripcion, ${cat} AS categoria, ${fam} AS familia, ${dep} AS deposito, ${uni} AS unidad,
               ${cuentas}
               bool_or(NOT deposito_activo) AS inactivo,
               ${conCantidades ? "sum(fisico) AS fisico, sum(cantv) AS cantv, sum(greatest(fisico - cantv, 0)) AS sin_val, sum(greatest(cantv - fisico, 0)) AS exced," : ""}
               sum(valor) AS valor, bool_or(tiene_registro) AS tiene_registro,
               ${cuentaSituaciones}
          FROM fil GROUP BY ${group}
      )`;
    const cuentas = `count(DISTINCT producto_id)::int AS productos, count(DISTINCT deposito_id)::int AS depositos,`;
    let vistaCte: string;
    switch (filtros.vista) {
      case "PRODUCTO":
        vistaCte = agg("producto_id::text", "codigo", "descripcion", "categoria", "familia", "''", "unidad", "producto_id, codigo, descripcion, categoria, familia, unidad", cuentas);
        break;
      case "DEPOSITO":
        vistaCte = agg("deposito_id::text", "''", "''", "''", "''", "deposito", "''", "deposito_id, deposito", cuentas);
        break;
      case "CATEGORIA":
        vistaCte = agg("coalesce(categoria_id::text, 'sin')", "''", "''", "categoria", "''", "''", "''", "categoria_id, categoria", cuentas);
        break;
      default:
        vistaCte = agg("producto_id::text || ':' || deposito_id::text", "codigo", "descripcion", "categoria", "familia", "deposito", "unidad", "producto_id, deposito_id, codigo, descripcion, categoria, familia, deposito, unidad", "1 AS productos, 1 AS depositos,");
    }
    const orden = { DETALLE: "categoria, codigo, deposito, clave", PRODUCTO: "categoria, codigo, clave", DEPOSITO: "deposito, clave", CATEGORIA: "categoria, clave" }[filtros.vista];
    const dineroSituacion = (s: string, alias: string) => `coalesce(sum(valor) FILTER (WHERE situacion = '${s}'), 0::numeric)::text AS ${alias}`;

    // Consultas SECUENCIALES sobre la misma conexión/transacción (un único snapshot).
    const emp = (await c.query(`SELECT razon_social AS nombre, moneda_base_codigo AS moneda FROM empresas WHERE id = $1`, [empresaId])).rows[0];
    const t = (await c.query(
      `WITH ${cte}
       SELECT count(*)::int AS filas, count(DISTINCT producto_id)::int AS productos, count(DISTINCT deposito_id)::int AS depositos,
              count(DISTINCT producto_id) FILTER (WHERE cantv > 0)::int AS productos_con_costo,
              coalesce(sum(valor), 0::numeric)::text AS valor,
              ${cuentaSituaciones},
              ${dineroSituacion("CON_COSTO", "v_con")}, ${dineroSituacion("PARCIAL", "v_par")}, ${dineroSituacion("SIN_COSTO", "v_sin")},
              ${dineroSituacion("EXCEDENTE", "v_exc")}, ${dineroSituacion("RESIDUO", "v_res")}, ${dineroSituacion("SIN_STOCK", "v_nul")},
              count(*) FILTER (WHERE NOT deposito_activo AND (fisico > 0 OR cantv > 0 OR valor <> 0))::int AS n_inactivos,
              coalesce(sum(valor) FILTER (WHERE NOT deposito_activo), 0::numeric)::text AS v_inactivos
         FROM fil`,
      params,
    )).rows[0];
    const totalFilas = num((await c.query(`WITH ${cte}, ${vistaCte} SELECT count(*)::int AS n FROM vista`, params)).rows[0].n);
    const limite = todas ? MAX_FILAS_EXPORTACION + 1 : tamano;
    const desplazamiento = todas ? 0 : (pagina - 1) * tamano;
    const rows = await c.query(
      `WITH ${cte}, ${vistaCte}
       SELECT clave, codigo, descripcion, categoria, familia, deposito, unidad, productos, depositos, inactivo,
              ${conCantidades ? `fisico::text AS fisico, cantv::text AS cantv, sin_val::text AS sin_val, exced::text AS exced, ${COSTO("valor", "cantv")} AS costo,` : ""}
              CASE WHEN tiene_registro THEN valor::text ELSE ${filtros.vista === "DETALLE" ? "NULL" : "'0'"} END AS valor,
              n_con, n_par, n_sin, n_exc, n_res, n_nul
         FROM vista ORDER BY ${orden} LIMIT ${p(limite)} OFFSET ${p(desplazamiento)}`,
      params,
    );
    if (todas && rows.rows.length > MAX_FILAS_EXPORTACION) return { error: `La exportación supera ${MAX_FILAS_EXPORTACION} filas; reduzca los filtros.`, status: 413 };

    const peor = (k: ConteoSituaciones): SituacionCosto => (k.RESIDUO ? "RESIDUO" : k.EXCEDENTE ? "EXCEDENTE" : k.SIN_COSTO ? "SIN_COSTO" : k.PARCIAL ? "PARCIAL" : k.CON_COSTO ? "CON_COSTO" : "SIN_STOCK");
    const txt = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
    const filas: ValorizacionFila[] = rows.rows.map((x) => {
      const conteos = conteosDe(x);

      return {
        clave: String(x.clave), codigo: String(x.codigo ?? ""), descripcion: String(x.descripcion ?? ""), categoria: String(x.categoria ?? ""), familia: String(x.familia ?? ""),
        deposito: String(x.deposito ?? ""), depositoInactivo: (filtros.vista === "DETALLE" || filtros.vista === "DEPOSITO") && x.inactivo === true, unidad: conCantidades ? String(x.unidad ?? "") : "",
        productos: num(x.productos), depositos: num(x.depositos),
        fisico: conCantidades ? txt(x.fisico) : null, cantidadValorizada: conCantidades ? txt(x.cantv) : null, sinValorizar: conCantidades ? txt(x.sin_val) : null, excedente: conCantidades ? txt(x.exced) : null,
        costoPromedio: conCantidades ? txt(x.costo) : null, valorTotal: txt(x.valor), moneda: emp.moneda, situacionCosto: peor(conteos), conteos,
      };
    });
    const conteos = conteosDe(t);
    const valorPorSituacion = { CON_COSTO: t.v_con, PARCIAL: t.v_par, SIN_COSTO: t.v_sin, EXCEDENTE: t.v_exc, RESIDUO: t.v_res, SIN_STOCK: t.v_nul } as Record<SituacionCosto, string>;
    const totales: ValorizacionTotales = {
      filas: num(t.filas), productos: num(t.productos), depositos: num(t.depositos), productosConCosto: num(t.productos_con_costo), valorTotal: String(t.valor), conteos, valorPorSituacion,
      inactivos: { filas: num(t.n_inactivos), valor: String(t.v_inactivos) }, moneda: emp.moneda,
    };

    const cat = await c.query(`SELECT id, nombre FROM categorias_producto WHERE empresa_id = $1 AND activo ORDER BY nombre`, [empresaId]);
    const fam = await c.query(`SELECT id, nombre FROM familias_producto WHERE empresa_id = $1 AND activo ORDER BY nombre`, [empresaId]);
    const ahora = await c.query(`SELECT to_char(now() AT TIME ZONE 'America/Asuncion', 'DD/MM/YYYY HH24:MI') AS t, to_char(now() AT TIME ZONE 'America/Asuncion', 'YYYYMMDD-HH24MI') AS f`);

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
    } satisfies ValorizacionRespuesta;
  });
}
