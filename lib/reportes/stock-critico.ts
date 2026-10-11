import type { Pool } from "pg";

import { depositosPermitidos, MAX_FILAS_EXPORTACION } from "@/lib/reportes/stock-general";
import type {
  NivelStock,
  StockCriticoFila,
  StockCriticoFiltros,
  StockCriticoRespuesta,
  StockCriticoTotales,
} from "@/types/reportes";

// Reporte 4 — Stock crítico y reposición (solo lectura; no crea compras ni pedidos).
//
// POLÍTICA POR PRODUCTO, NO POR DEPÓSITO. En V1 el stock mínimo, el máximo y el punto de reposición se definen en el
// cadastro de Productos y valen para el producto completo. Por eso la situación y la cantidad sugerida se calculan
// SIEMPRE con el disponible consolidado del producto en todos los depósitos con alcance del usuario. El filtro de
// depósito solo (a) limita la lista a los productos con stock propio en ese depósito y (b) muestra cuánto hay allí;
// nunca compara el mínimo/máximo del producto contra el stock de un único depósito.
//
// Fórmulas (idénticas a Stock general para la situación):
//   disponible = Σ stock_saldos PROPIO / DISPONIBLE     físico propio = disponible + reservado + cuarentena
//   SIN_STOCK  : disponible <= 0
//   BAJO       : mínimo > 0 y disponible < mínimo
//   SOBRESTOCK : máximo > 0 y físico propio > máximo
//   NORMAL     : cualquier otro caso
//   en punto de reposición : punto_reposicion > 0 y disponible <= punto_reposicion
//   A reponer  : situación SIN_STOCK o BAJO, o en punto de reposición
//   objetivo   : MINIMO (por defecto, conservador) = mínimo;  MAXIMO = máximo si > 0 (si no, el mínimo)
//   cantidad sugerida = si "A reponer": max(0, objetivo − disponible); si no: 0
// Costo de referencia: costo promedio ponderado de inventario_costos (Σ valor / Σ cantidad valorizada) en los depósitos con
// alcance; sin registro de costo no se inventa ninguno (—). Valor sugerido = cantidad sugerida × costo de referencia.

type Db = Pick<Pool, "query">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIVELES = ["SIN_STOCK", "BAJO", "NORMAL", "SOBRESTOCK"];

export const COBERTURA_STOCK_CRITICO = [
  "En V1 el stock mínimo, el máximo y el punto de reposición se definen por producto (cadastro de Productos), no por depósito. La situación y la cantidad sugerida usan el disponible consolidado del producto en todos los depósitos con alcance del usuario.",
  "El filtro de Depósito limita la lista a los productos con stock propio en ese depósito y muestra el disponible allí; no convierte el mínimo ni el máximo del producto en un límite de ese depósito.",
  "Situación: Sin stock = disponible <= 0; Bajo = disponible < mínimo; Sobrestock = físico propio (disponible + reservado + cuarentena) > máximo; Normal = resto. Sin mínimo/máximo definido (0) el producto no puede ser Bajo/Sobrestock.",
  "Cantidad sugerida = máx(0; objetivo - disponible) para productos Sin stock, Bajos o en punto de reposición (punto > 0 y disponible <= punto); objetivo = mínimo (conservador) o máximo, según lo elegido. El stock reservado, en cuarentena y de terceros no cuenta como disponible.",
  "Es solo una sugerencia: este reporte no crea compras, pedidos ni movimientos. El costo de referencia es el costo promedio real de inventario_costos; sin costo registrado se muestra —.",
  "Foto actual de los saldos; no considera consumo, plazos de entrega ni compras en camino.",
];

export function parsearFiltrosStockCritico(sp: URLSearchParams): { filtros: StockCriticoFiltros; pagina: number; tamano: number } | { error: string } {
  const uuid = (k: string) => {
    const v = sp.get(k) ?? "";
    return v === "" || UUID.test(v) ? v : null;
  };
  const depositoId = uuid("depositoId"), categoriaId = uuid("categoriaId"), marcaId = uuid("marcaId"), familiaId = uuid("familiaId");
  if (depositoId === null || categoriaId === null || marcaId === null || familiaId === null) return { error: "Filtro con identificador no válido." };
  const vista = sp.get("vista") ?? "PRODUCTO";
  if (vista !== "PRODUCTO" && vista !== "DEPOSITO") return { error: "Vista no válida." };
  const situacion = sp.get("situacion") ?? "";
  if (situacion !== "" && !NIVELES.includes(situacion)) return { error: "Situación no válida." };
  const objetivo = sp.get("objetivo") ?? "MINIMO";
  if (objetivo !== "MINIMO" && objetivo !== "MAXIMO") return { error: "Objetivo de reposición no válido." };
  const pagina = Math.max(1, Math.floor(Number(sp.get("pagina") ?? 1)) || 1);
  const tamano = Math.min(200, Math.max(10, Math.floor(Number(sp.get("tamano") ?? 50)) || 50));
  return {
    filtros: {
      vista, depositoId, categoriaId, marcaId, familiaId, objetivo,
      situacion: situacion as StockCriticoFiltros["situacion"],
      q: (sp.get("q") ?? "").trim().slice(0, 80),
    },
    pagina, tamano,
  };
}

const like = (v: string) => `%${v.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const N = (c: string) => `${c}::float8`;
const ORDEN_NIVEL = `CASE nivel WHEN 'SIN_STOCK' THEN 0 WHEN 'BAJO' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END`;

export async function leerStockCritico(
  db: Db,
  empresaId: string,
  usuarioId: string,
  filtros: StockCriticoFiltros,
  pagina: number,
  tamano: number,
  todas = false,
): Promise<StockCriticoRespuesta | { error: string; status: number }> {
  const permitidos = await depositosPermitidos(db, empresaId, usuarioId);
  if (filtros.depositoId && !permitidos.some((d) => d.id === filtros.depositoId)) return { error: "Depósito no permitido.", status: 403 };
  const alcance = permitidos.map((d) => d.id);
  const depsVista = filtros.depositoId ? [filtros.depositoId] : alcance;

  // $1 empresa, $2 depósitos con alcance (base de la política por producto), $3 depósito filtrado (o null), $4 depósitos de la vista.
  const params: unknown[] = [empresaId, alcance, filtros.depositoId || null, depsVista];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const donde: string[] = [];
  if (filtros.q) { const n = p(like(filtros.q)); donde.push(`(p.codigo ILIKE ${n} OR p.descripcion ILIKE ${n} OR p.codigo_inventario ILIKE ${n} OR p.codigo_barras ILIKE ${n})`); }
  if (filtros.categoriaId) donde.push(`p.categoria_id = ${p(filtros.categoriaId)}`);
  if (filtros.marcaId) donde.push(`p.marca_id = ${p(filtros.marcaId)}`);
  if (filtros.familiaId) donde.push(`p.familia_id = ${p(filtros.familiaId)}`);
  const post: string[] = [];
  if (filtros.situacion) post.push(`nivel = ${p(filtros.situacion)}`);
  if (filtros.depositoId) post.push(`tiene_dep`);
  const meta = filtros.objetivo === "MAXIMO" ? `CASE WHEN a.maximo > 0 THEN a.maximo ELSE a.minimo END` : `a.minimo`;

  const sum = (cond: string) => `coalesce(sum(s.cantidad) FILTER (WHERE ${cond}), 0)`;
  const cte = `
    agg AS (
      SELECT p.id, p.codigo, p.descripcion, coalesce(cat.nombre, '') AS categoria, coalesce(m.nombre, '') AS marca,
             coalesce(fa.nombre, '') AS familia, coalesce(um.nombre, '') AS unidad,
             p.stock_minimo AS minimo, p.stock_maximo AS maximo_cad, coalesce(p.stock_maximo, 0) AS maximo, p.punto_reposicion AS punto,
             ${sum(`s.propiedad = 'PROPIO' AND s.estado_stock = 'DISPONIBLE'`)} AS disponible,
             ${sum(`s.propiedad = 'PROPIO' AND s.estado_stock IN ('RESERVADO', 'CUARENTENA')`)} AS reservado_cuarentena,
             ${sum(`s.propiedad = 'PROPIO' AND s.estado_stock = 'DISPONIBLE' AND s.deposito_id = $3::uuid`)} AS disp_dep,
             coalesce(bool_or(s.propiedad = 'PROPIO' AND s.estado_stock <> 'TRANSITO' AND s.cantidad > 0 AND s.deposito_id = $3::uuid), false) AS tiene_dep
        FROM productos p
        LEFT JOIN categorias_producto cat ON cat.empresa_id = p.empresa_id AND cat.id = p.categoria_id
        LEFT JOIN marcas_producto m ON m.empresa_id = p.empresa_id AND m.id = p.marca_id
        LEFT JOIN familias_producto fa ON fa.empresa_id = p.empresa_id AND fa.id = p.familia_id
        LEFT JOIN unidades_medida um ON um.id = p.unidad_medida_id
        LEFT JOIN stock_saldos s ON s.empresa_id = p.empresa_id AND s.producto_id = p.id AND s.deposito_id = ANY($2::uuid[])
       WHERE p.empresa_id = $1 AND cardinality($4::uuid[]) >= 0 AND p.controla_stock${donde.length ? " AND " + donde.join(" AND ") : ""}
       GROUP BY p.id, cat.nombre, m.nombre, fa.nombre, um.nombre
      HAVING p.activo OR coalesce(sum(s.cantidad), 0) > 0
    ),
    cst AS (
      SELECT producto_id, sum(valor_total) AS valor, sum(cantidad_valorizada) AS cant
        FROM inventario_costos WHERE empresa_id = $1 AND deposito_id = ANY($2::uuid[]) GROUP BY producto_id
    ),
    niv AS (
      SELECT a.*, a.disponible + a.reservado_cuarentena AS fisico,
             CASE WHEN a.disponible <= 0 THEN 'SIN_STOCK'
                  WHEN a.minimo > 0 AND a.disponible < a.minimo THEN 'BAJO'
                  WHEN a.maximo > 0 AND a.disponible + a.reservado_cuarentena > a.maximo THEN 'SOBRESTOCK'
                  ELSE 'NORMAL' END AS nivel,
             (coalesce(a.punto, 0) > 0 AND a.disponible <= a.punto) AS en_punto
        FROM agg a
    ),
    rep AS (
      SELECT n.*, (n.nivel IN ('SIN_STOCK', 'BAJO') OR n.en_punto) AS a_reponer,
             CASE WHEN c.cant > 0 THEN round(c.valor / c.cant, 4) END AS costo
        FROM niv n LEFT JOIN cst c ON c.producto_id = n.id
    ),
    fil AS (
      SELECT r.*, CASE WHEN r.a_reponer THEN greatest((${meta.replace(/a\./g, "r.")}) - greatest(r.disponible, 0), 0) ELSE 0 END AS sugerida
        FROM rep r${post.length ? " WHERE " + post.join(" AND ") : ""}
    ),
    fin AS (SELECT f.*, CASE WHEN f.costo IS NOT NULL AND f.sugerida > 0 THEN round(f.sugerida * f.costo, 4) END AS valor_sug FROM fil f)`;

  const emp = (await db.query(`SELECT razon_social AS nombre, moneda_base_codigo AS moneda FROM empresas WHERE id = $1`, [empresaId])).rows[0];

  const tr = (
    await db.query(
      `WITH ${cte}
       SELECT count(*)::int AS productos, count(*) FILTER (WHERE nivel = 'SIN_STOCK')::int AS "sinStock",
              count(*) FILTER (WHERE nivel = 'BAJO')::int AS bajo, count(*) FILTER (WHERE nivel = 'NORMAL')::int AS normal,
              count(*) FILTER (WHERE nivel = 'SOBRESTOCK')::int AS sobrestock, count(*) FILTER (WHERE en_punto)::int AS "enPunto",
              count(*) FILTER (WHERE a_reponer)::int AS "aReponer", ${N("coalesce(sum(sugerida), 0)")} AS sugerida,
              coalesce(sum(valor_sug), 0::numeric(18,4))::text AS valor,
              count(*) FILTER (WHERE sugerida > 0 AND costo IS NULL)::int AS "sinCosto"
         FROM fin`,
      params,
    )
  ).rows[0];
  const totales: StockCriticoTotales = {
    productos: tr.productos, sinStock: tr.sinStock, bajo: tr.bajo, normal: tr.normal, sobrestock: tr.sobrestock,
    enPuntoReposicion: tr.enPunto, aReponer: tr.aReponer, cantidadSugerida: tr.sugerida, valorSugerido: tr.valor,
    sugeridoSinCosto: tr.sinCosto, moneda: emp.moneda,
  };

  const limite = todas ? MAX_FILAS_EXPORTACION + 1 : tamano;
  const desplazamiento = todas ? 0 : (pagina - 1) * tamano;
  const campos = `f.id, f.codigo, f.descripcion, f.categoria, f.marca, f.familia, f.unidad, f.nivel, f.en_punto,
              ${N("f.disponible")} AS disponible, ${N("f.fisico")} AS fisico, ${N("f.minimo")} AS minimo,
              ${N("f.maximo_cad")} AS maximo, ${N("f.punto")} AS punto, ${N("f.sugerida")} AS sugerida, f.costo::text AS costo, f.valor_sug::text AS valor_sug`;

  let rows: Record<string, unknown>[];
  let totalFilas: number;
  if (filtros.vista === "PRODUCTO") {
    totalFilas = totales.productos;
    rows = (
      await db.query(
        `WITH ${cte}
         SELECT ${campos}, ${filtros.depositoId ? N("f.disp_dep") : "NULL::float8"} AS disp_dep, '' AS deposito
           FROM fin f ORDER BY ${ORDEN_NIVEL.replace(/nivel/g, "f.nivel")}, f.codigo, f.id LIMIT ${p(limite)} OFFSET ${p(desplazamiento)}`,
        params,
      )
    ).rows;
  } else {
    // Una fila por producto × depósito con stock propio físico; el producto sin stock propio en ningún depósito sale en una fila sin depósito.
    const base = `WITH ${cte},
      par AS (
        SELECT s.producto_id, s.deposito_id,
               coalesce(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'DISPONIBLE'), 0) AS disp
          FROM stock_saldos s
         WHERE s.empresa_id = $1 AND s.deposito_id = ANY($4::uuid[]) AND s.propiedad = 'PROPIO' AND s.estado_stock <> 'TRANSITO'
         GROUP BY s.producto_id, s.deposito_id HAVING sum(s.cantidad) > 0
      ),
      lin AS (
        SELECT f.*, d.nombre AS dep_nombre, par.disp AS disp_fila
          FROM fin f LEFT JOIN par ON par.producto_id = f.id LEFT JOIN depositos d ON d.empresa_id = $1 AND d.id = par.deposito_id
      )`;
    totalFilas = Number((await db.query(`${base} SELECT count(*)::int AS n FROM lin`, params)).rows[0].n);
    rows = (
      await db.query(
        `${base}
         SELECT ${campos}, ${N("f.disp_fila")} AS disp_dep, coalesce(f.dep_nombre, '') AS deposito
           FROM lin f ORDER BY ${ORDEN_NIVEL.replace(/nivel/g, "f.nivel")}, f.codigo, f.id, f.dep_nombre LIMIT ${p(limite)} OFFSET ${p(desplazamiento)}`,
        params,
      )
    ).rows;
  }
  if (todas && rows.length > MAX_FILAS_EXPORTACION) return { error: `La exportación supera ${MAX_FILAS_EXPORTACION} filas; reduzca los filtros.`, status: 413 };

  const filas: StockCriticoFila[] = rows.map((r) => ({
    productoId: r.id as string, codigo: r.codigo as string, descripcion: r.descripcion as string, categoria: r.categoria as string,
    marca: r.marca as string, familia: r.familia as string, unidad: r.unidad as string, deposito: r.deposito as string,
    disponibleDeposito: r.disp_dep as number | null, disponible: r.disponible as number, fisico: r.fisico as number,
    minimo: r.minimo as number, maximo: r.maximo as number | null, puntoReposicion: r.punto as number | null,
    nivel: r.nivel as NivelStock, enPuntoReposicion: r.en_punto as boolean, cantidadSugerida: r.sugerida as number,
    costoReferencia: r.costo as string | null, valorSugerido: r.valor_sug as string | null,
  }));

  const [cat, mar, fam, ahora] = await Promise.all([
    db.query(`SELECT id, nombre FROM categorias_producto WHERE empresa_id = $1 AND activo ORDER BY nombre`, [empresaId]),
    db.query(`SELECT id, nombre FROM marcas_producto WHERE empresa_id = $1 AND activo ORDER BY nombre`, [empresaId]),
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
    catalogos: { depositos: permitidos, categorias: cat.rows, marcas: mar.rows, familias: fam.rows },
    cobertura: COBERTURA_STOCK_CRITICO,
  };
}
