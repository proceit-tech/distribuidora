import type { Pool } from "pg";

import { ORIGENES_KARDEX, TIPOS_KARDEX } from "@/lib/reportes/kardex-textos";
import { depositosPermitidos, MAX_FILAS_EXPORTACION } from "@/lib/reportes/stock-general";
import type { KardexFiltros, KardexFila, KardexMovimientos, KardexResumenFila, KardexRespuesta, KardexSaldos, KardexTotales } from "@/types/reportes";

// Reporte 3 — Kardex de movimientos. Fuente: libro de movimientos (movimientos_inventario + movimiento_lineas).
// Todo cambio de stock pasa por funciones SECURITY DEFINER que escriben una línea, por lo que el saldo de cada
// producto × depósito × lote es EXACTAMENTE la suma de los efectos de sus líneas, en orden de registro (número de
// movimiento). El saldo acumulado se calcula en la base sobre TODA la historia (nunca por página) y se concilia con
// stock_saldos. No se estiman saldos: si el libro no coincide con Stock, se informa.

type Db = Pick<Pool, "query">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
export { ORIGENES_KARDEX, TIPOS_KARDEX };
const CERO_UUID = "00000000-0000-0000-0000-000000000000";

export const COBERTURA_KARDEX = [
  "Cada fila es el efecto de un movimiento sobre un depósito. El saldo acumulado es la suma de todos los efectos anteriores del mismo producto × depósito × lote, en orden de registro (número de movimiento), desde el primer movimiento: no se reinicia por página, período ni filtro.",
  "El período filtra por FECHA DE REGISTRO (cuando cambió el saldo). La fecha del movimiento puede ser anterior (movimiento retroactivo) y se muestra aparte; el saldo sigue el orden de registro. Saldo inicial = suma de los efectos registrados antes del período.",
  "Transferencias: una fila de salida en el depósito de origen y una de entrada en el destino (mismo número de movimiento); en el consolidado de la empresa se compensan y se totalizan aparte, sin duplicar cantidades.",
  "Reservas y cuarentena son cambios de estado: no son entrada ni salida física. Se muestran sus efectos sobre disponible, reservado y cuarentena; físico = disponible + reservado + cuarentena.",
  "Anulaciones: el movimiento original queda ANULADO y se genera un movimiento inverso (origen Anulación) vinculado a él; ninguno se borra y ambos cuentan en el saldo (neto cero).",
  "Costos: solo el costo unitario y total registrado en la línea del movimiento (—, si no existe, p. ej. reservas). V1 no guarda saldos valorizados históricos: este reporte no los calcula ni usa el costo promedio actual.",
  "Solo stock propio. El estado En tránsito no tiene flujo en V1. Con depósitos restringidos solo se ven los efectos de los depósitos con alcance.",
];

export function parsearFiltrosKardex(sp: URLSearchParams): { filtros: KardexFiltros; pagina: number; tamano: number } | { error: string } {
  const uuid = (k: string) => {
    const v = sp.get(k) ?? "";
    return v === "" || UUID.test(v) ? v : null;
  };
  const depositoId = uuid("depositoId"), usuarioId = uuid("usuarioId");
  if (depositoId === null || usuarioId === null) return { error: "Filtro con identificador no válido." };
  const vista = sp.get("vista") ?? "DETALLE";
  if (vista !== "DETALLE" && vista !== "RESUMEN") return { error: "Vista no válida." };
  const tipo = sp.get("tipo") ?? "";
  if (tipo !== "" && !TIPOS_KARDEX.some((t) => t.id === tipo)) return { error: "Tipo de movimiento no válido." };
  const estado = sp.get("estado") ?? "";
  if (!["", "REGISTRADO", "ANULADO"].includes(estado)) return { error: "Estado no válido." };
  const estadoStock = sp.get("estadoStock") ?? "";
  if (!["", "DISPONIBLE", "RESERVADO", "CUARENTENA"].includes(estadoStock)) return { error: "Estado de stock no válido." };
  const fecha = (k: string) => {
    const v = sp.get(k) ?? "";
    if (v === "") return "";
    if (!FECHA.test(v) || Number.isNaN(Date.parse(v + "T00:00:00Z")) || new Date(v + "T00:00:00Z").toISOString().slice(0, 10) !== v) return null;
    return v;
  };
  const desde = fecha("desde"), hasta = fecha("hasta");
  if (desde === null || hasta === null) return { error: "Fecha no válida (use AAAA-MM-DD)." };
  if (desde && hasta && desde > hasta) return { error: "El período es inválido: 'desde' es posterior a 'hasta'." };
  const pagina = Math.max(1, Math.floor(Number(sp.get("pagina") ?? 1)) || 1);
  const tamano = Math.min(200, Math.max(10, Math.floor(Number(sp.get("tamano") ?? 50)) || 50));
  return {
    filtros: {
      vista, depositoId, usuarioId, tipo, estado: estado as KardexFiltros["estado"], estadoStock: estadoStock as KardexFiltros["estadoStock"],
      desde, hasta, q: (sp.get("q") ?? "").trim().slice(0, 80), documento: (sp.get("documento") ?? "").trim().slice(0, 60),
      lote: (sp.get("lote") ?? "").trim().slice(0, 40),
    },
    pagina, tamano,
  };
}

const like = (v: string) => `%${v.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const n = (v: unknown) => Number(v ?? 0);

export async function leerKardex(
  db: Db,
  empresaId: string,
  usuarioId: string,
  f: KardexFiltros,
  pagina: number,
  tamano: number,
  todas = false,
): Promise<KardexRespuesta | { error: string; status: number }> {
  const permitidos = await depositosPermitidos(db, empresaId, usuarioId);
  if (f.depositoId && !permitidos.some((d) => d.id === f.depositoId)) return { error: "Depósito no permitido.", status: 403 };
  const deps = f.depositoId ? [f.depositoId] : permitidos.map((d) => d.id);

  const params: unknown[] = [empresaId, deps];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };

  // Filtros de dimensión (definen qué combinaciones producto × depósito × lote se calculan).
  let dim = "";
  if (f.q) { const k = p(like(f.q)); dim += ` AND (pr.codigo ILIKE ${k} OR pr.descripcion ILIKE ${k} OR pr.codigo_inventario ILIKE ${k} OR pr.codigo_barras ILIKE ${k})`; }
  if (f.lote) dim += ` AND sl.codigo_lote ILIKE ${p(like(f.lote))}`;

  // Período (fecha de registro, hora de Asunción) y filtros de fila: se aplican DESPUÉS del saldo acumulado.
  const pd = f.desde ? p(f.desde) : "", ph = f.hasta ? p(f.hasta) : "";
  const enPer = [f.desde ? `reg_fecha >= ${pd}::date` : "", f.hasta ? `reg_fecha <= ${ph}::date` : ""].filter(Boolean).join(" AND ") || "true";
  const filas: string[] = [];
  if (f.tipo) filas.push(`tipo_movimiento = ${p(f.tipo)}`);
  if (f.usuarioId) filas.push(`creado_por = ${p(f.usuarioId)}`);
  if (f.documento) { const k = p(like(f.documento)); filas.push(`(documento_referencia ILIKE ${k} OR numero_movimiento ILIKE ${k})`); }
  if (f.estado) filas.push(`estado = ${p(f.estado)}`);
  if (f.estadoStock) filas.push(f.estadoStock === "DISPONIBLE" ? "dd <> 0" : f.estadoStock === "RESERVADO" ? "dr <> 0" : "dc <> 0");
  const pasa = filas.join(" AND ") || "true";
  const filtrosDeFila = filas.length > 0;
  const sel = `(${enPer}) AND (${pasa})`;

  const cte = `
    mv AS (
      SELECT m.id AS movimiento_id, m.numero_movimiento, m.tipo_movimiento, m.tipo_origen, m.estado, m.fecha_movimiento, m.hora_movimiento, m.creado_at,
             m.documento_referencia, m.motivo, m.observacion, m.creado_por, m.anula_a_id, m.deposito_origen_id, m.deposito_destino_id,
             l.id AS linea_id, l.producto_id, l.cantidad, l.lote_id, l.propiedad, l.propietario_id, l.costo_unitario, l.costo_total,
             l.moneda_costo_codigo, l.creado_at AS linea_at
        FROM movimientos_inventario m JOIN movimiento_lineas l ON l.empresa_id = m.empresa_id AND l.movimiento_id = m.id
       WHERE m.empresa_id = $1 AND l.propiedad = 'PROPIO'
    ),
    ef AS (
      SELECT mv.*, mv.deposito_destino_id AS deposito_id, mv.deposito_origen_id AS contra_id, 1 AS lado_ord, 'ENTRADA'::text AS efecto,
             mv.cantidad AS dd, 0::numeric AS dr, 0::numeric AS dc
        FROM mv WHERE tipo_movimiento IN ('ENTRADA','AJUSTE_POSITIVO','TRANSFERENCIA')
      UNION ALL
      SELECT mv.*, mv.deposito_origen_id, mv.deposito_destino_id, 0, 'SALIDA', -mv.cantidad, 0::numeric, 0::numeric
        FROM mv WHERE tipo_movimiento IN ('SALIDA','AJUSTE_NEGATIVO','TRANSFERENCIA')
      UNION ALL
      SELECT mv.*, mv.deposito_origen_id, NULL::uuid, 2, 'ESTADO',
             CASE tipo_movimiento WHEN 'RESERVA' THEN -cantidad WHEN 'CUARENTENA' THEN -cantidad ELSE cantidad END,
             CASE tipo_movimiento WHEN 'RESERVA' THEN cantidad WHEN 'LIBERACION_RESERVA' THEN -cantidad ELSE 0::numeric END,
             CASE tipo_movimiento WHEN 'CUARENTENA' THEN cantidad WHEN 'LIBERACION_CUARENTENA' THEN -cantidad ELSE 0::numeric END
        FROM mv WHERE tipo_movimiento IN ('RESERVA','LIBERACION_RESERVA','CUARENTENA','LIBERACION_CUARENTENA')
    ),
    sal AS (
      SELECT ef.*, pr.codigo AS pcodigo, pr.descripcion AS pdesc, sl.codigo_lote,
             (ef.creado_at AT TIME ZONE 'America/Asuncion')::date AS reg_fecha,
             sum(ef.dd) OVER w AS s_disp, sum(ef.dr) OVER w AS s_res, sum(ef.dc) OVER w AS s_cuar
        FROM ef
        JOIN productos pr ON pr.empresa_id = $1 AND pr.id = ef.producto_id
        LEFT JOIN stock_lotes sl ON sl.empresa_id = $1 AND sl.producto_id = ef.producto_id AND sl.id = ef.lote_id
       WHERE ef.deposito_id = ANY($2::uuid[])${dim}
      WINDOW w AS (PARTITION BY ef.producto_id, ef.deposito_id, ef.lote_id, ef.propietario_id
                   ORDER BY ef.numero_movimiento, ef.linea_at, ef.linea_id, ef.lado_ord ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
    )`;

  const sumas = (col: string, hastaTotal = false) =>
    `coalesce(sum(${col}) FILTER (WHERE ${hastaTotal ? (f.hasta ? `reg_fecha <= ${ph}::date` : "true") : f.desde ? `reg_fecha < ${pd}::date` : "false"}), 0)`;
  const fis = "(dd + dr + dc)";
  // Tres conjuntos de movimientos del período (mismo cálculo, distinta condición): los que cumplen los filtros de fila (f),
  // los que quedan fuera de ellos (o) y todos (c = conciliación completa). Transferencias siempre aparte.
  const fuera = `(${enPer}) AND NOT (${pasa})`;
  const movCols = (px: string, cond: string, agg = (x: string) => x) => `
              ${agg(`coalesce(sum(${fis}) FILTER (WHERE ${cond} AND tipo_movimiento <> 'TRANSFERENCIA' AND ${fis} > 0), 0)::float8`)} AS ${px}_ent,
              ${agg(`coalesce(-sum(${fis}) FILTER (WHERE ${cond} AND tipo_movimiento <> 'TRANSFERENCIA' AND ${fis} < 0), 0)::float8`)} AS ${px}_sal,
              ${agg(`coalesce(sum(dd) FILTER (WHERE ${cond} AND tipo_movimiento = 'TRANSFERENCIA' AND dd > 0), 0)::float8`)} AS ${px}_tent,
              ${agg(`coalesce(-sum(dd) FILTER (WHERE ${cond} AND tipo_movimiento = 'TRANSFERENCIA' AND dd < 0), 0)::float8`)} AS ${px}_tsal,
              count(*) FILTER (WHERE ${cond} AND efecto = 'ESTADO')::int AS ${px}_cam,
              count(DISTINCT movimiento_id) FILTER (WHERE ${cond} AND tipo_origen = 'ANULACION')::int AS ${px}_anu`;

  const [tq, cq, em] = await Promise.all([
    db.query(
      `WITH ${cte}
       SELECT count(*) FILTER (WHERE ${sel})::int AS filas,
              ${sumas("dd")}::float8 AS i_disp, ${sumas("dr")}::float8 AS i_res, ${sumas("dc")}::float8 AS i_cuar,
              ${sumas("dd", true)}::float8 AS f_disp, ${sumas("dr", true)}::float8 AS f_res, ${sumas("dc", true)}::float8 AS f_cuar,
              ${movCols("f", sel)}, ${movCols("o", fuera)}, ${movCols("c", enPer)}
         FROM sal`,
      params,
    ),
    // Conciliación con Stock (hoy): el libro completo debe dar el mismo saldo por estado que stock_saldos.
    db.query(
      `WITH ${cte},
       hist AS (SELECT producto_id, deposito_id, lote_id, propietario_id, sum(dd) AS d, sum(dr) AS r, sum(dc) AS c FROM sal GROUP BY 1, 2, 3, 4),
       st AS (
         SELECT s.producto_id, s.deposito_id, s.lote_id, s.propietario_id,
                coalesce(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'DISPONIBLE'), 0) AS d,
                coalesce(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'RESERVADO'), 0) AS r,
                coalesce(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'CUARENTENA'), 0) AS c
           FROM stock_saldos s
           JOIN productos pr ON pr.empresa_id = $1 AND pr.id = s.producto_id
           LEFT JOIN stock_lotes sl ON sl.empresa_id = $1 AND sl.producto_id = s.producto_id AND sl.id = s.lote_id
          WHERE s.empresa_id = $1 AND s.deposito_id = ANY($2::uuid[]) AND s.propiedad = 'PROPIO' AND s.estado_stock <> 'TRANSITO'${dim}
          GROUP BY 1, 2, 3, 4)
       SELECT count(*)::int AS n,
              count(*) FILTER (WHERE coalesce(h.d, 0) <> coalesce(s.d, 0) OR coalesce(h.r, 0) <> coalesce(s.r, 0) OR coalesce(h.c, 0) <> coalesce(s.c, 0))::int AS divergentes
         FROM hist h FULL JOIN st s
           ON h.producto_id = s.producto_id AND h.deposito_id = s.deposito_id
          AND coalesce(h.lote_id, '${CERO_UUID}'::uuid) = coalesce(s.lote_id, '${CERO_UUID}'::uuid)
          AND coalesce(h.propietario_id, '${CERO_UUID}'::uuid) = coalesce(s.propietario_id, '${CERO_UUID}'::uuid)`,
      params,
    ),
    db.query(`SELECT razon_social AS nombre, moneda_base_codigo AS moneda FROM empresas WHERE id = $1`, [empresaId]),
  ]);
  const t = tq.rows[0];
  const saldo = (d: unknown, r: unknown, c: unknown): KardexSaldos => ({ disponible: n(d), reservado: n(r), cuarentena: n(c), fisico: n(d) + n(r) + n(c) });
  const movs = (px: string): KardexMovimientos => ({
    entradas: n(t[`${px}_ent`]), salidas: n(t[`${px}_sal`]), transfEntradas: n(t[`${px}_tent`]), transfSalidas: n(t[`${px}_tsal`]),
    cambiosEstado: t[`${px}_cam`], anulaciones: t[`${px}_anu`],
  });
  const neto = (m: KardexMovimientos) => m.entradas - m.salidas + m.transfEntradas - m.transfSalidas;
  const totales: KardexTotales = {
    filas: t.filas,
    filtrosDeFila,
    saldoInicial: saldo(t.i_disp, t.i_res, t.i_cuar),
    saldoFinal: saldo(t.f_disp, t.f_res, t.f_cuar),
    filtrado: movs("f"),
    fueraDelFiltro: movs("o"),
    completo: movs("c"),
    cuadra: false,
    resumen: null,
  };
  // Cuadre SIEMPRE sobre la conciliación completa (todos los movimientos), nunca sobre los totales filtrados:
  // saldo inicial + movimientos del período = saldo final, y filtrados + fuera del filtro = completo.
  const eps = 0.00005;
  totales.cuadra =
    Math.abs(totales.saldoInicial.fisico + neto(totales.completo) - totales.saldoFinal.fisico) < eps &&
    Math.abs(neto(totales.filtrado) + neto(totales.fueraDelFiltro) - neto(totales.completo)) < eps;

  let totalFilas = t.filas as number;
  const limite = todas ? MAX_FILAS_EXPORTACION + 1 : tamano;
  const desplazamiento = todas ? 0 : (pagina - 1) * tamano;
  let filasOut: KardexFila[] = [];
  let resumen: KardexResumenFila[] = [];

  if (f.vista === "DETALLE") {
    const rows = await db.query(
      `WITH ${cte},
       pg AS (SELECT * FROM sal WHERE ${sel} ORDER BY numero_movimiento, linea_at, linea_id, lado_ord LIMIT ${p(limite)} OFFSET ${p(desplazamiento)})
       SELECT s.movimiento_id::text || ':' || s.linea_id::text || ':' || s.lado_ord AS clave, s.numero_movimiento, to_char(s.reg_fecha, 'YYYY-MM-DD') AS freg,
              to_char(s.creado_at AT TIME ZONE 'America/Asuncion', 'HH24:MI:SS') AS hreg, to_char(s.fecha_movimiento, 'YYYY-MM-DD') AS fmov,
              (s.fecha_movimiento <> s.reg_fecha) AS retro, s.tipo_movimiento, s.tipo_origen, s.estado, coalesce(s.documento_referencia, '') AS doc,
              coalesce(s.motivo, '') AS motivo, coalesce(s.observacion, '') AS obs, coalesce(u.usuario, '') AS usuario, s.pcodigo, s.pdesc,
              d.nombre AS deposito, coalesce(dcp.nombre, '') AS contra, coalesce(s.codigo_lote, '') AS lote, s.propiedad, s.efecto,
              greatest(s.dd + s.dr + s.dc, 0)::float8 AS entrada, greatest(-(s.dd + s.dr + s.dc), 0)::float8 AS salida,
              s.dd::float8 AS dd, s.dr::float8 AS dr, s.dc::float8 AS dc,
              s.s_disp::float8 AS s_disp, s.s_res::float8 AS s_res, s.s_cuar::float8 AS s_cuar, (s.s_disp + s.s_res + s.s_cuar)::float8 AS s_fis,
              s.costo_unitario::text AS cu, s.costo_total::text AS ct, coalesce(s.moneda_costo_codigo, '') AS mon,
              coalesce(an.numero_movimiento, '') AS anulado_por, coalesce(og.numero_movimiento, '') AS anula_a
         FROM pg s
         JOIN depositos d ON d.empresa_id = $1 AND d.id = s.deposito_id
         LEFT JOIN depositos dcp ON dcp.empresa_id = $1 AND dcp.id = s.contra_id
         LEFT JOIN usuarios u ON u.empresa_id = $1 AND u.id = s.creado_por
         LEFT JOIN movimientos_inventario an ON an.empresa_id = $1 AND an.anula_a_id = s.movimiento_id
         LEFT JOIN movimientos_inventario og ON og.empresa_id = $1 AND og.id = s.anula_a_id
        ORDER BY s.numero_movimiento, s.linea_at, s.linea_id, s.lado_ord`,
      params,
    );
    if (todas && rows.rows.length > MAX_FILAS_EXPORTACION) return { error: `La exportación supera ${MAX_FILAS_EXPORTACION} filas; reduzca los filtros.`, status: 413 };
    filasOut = rows.rows.map((x): KardexFila => ({
      clave: x.clave, numero: x.numero_movimiento, fechaRegistro: x.freg, horaRegistro: x.hreg, fechaMovimiento: x.fmov, retroactivo: x.retro,
      tipo: x.tipo_movimiento, origen: x.tipo_origen, estado: x.estado, documento: x.doc, motivo: x.motivo, observacion: x.obs, usuario: x.usuario,
      productoCodigo: x.pcodigo, productoDescripcion: x.pdesc, deposito: x.deposito, contraparte: x.contra, lote: x.lote, propiedad: x.propiedad,
      efecto: x.efecto, entrada: x.entrada, salida: x.salida, dDisponible: x.dd, dReservado: x.dr, dCuarentena: x.dc,
      saldoDisponible: x.s_disp, saldoReservado: x.s_res, saldoCuarentena: x.s_cuar, saldoFisico: x.s_fis,
      costoUnitario: x.cu, costoTotal: x.ct, moneda: x.mon,
      vinculado: x.anulado_por || x.anula_a, vinculoTipo: x.anulado_por ? "ANULADO_POR" : x.anula_a ? "ANULA_A" : "",
    }));
  } else {
    const ini = f.desde ? `reg_fecha < ${pd}::date` : "false";
    const fin = f.hasta ? `reg_fecha <= ${ph}::date` : "true";
    const grupo = `
      g AS (
        SELECT producto_id, deposito_id, lote_id, propietario_id, max(pcodigo) AS pcodigo, max(pdesc) AS pdesc, max(codigo_lote) AS codigo_lote,
               coalesce(sum(${fis}) FILTER (WHERE ${ini}), 0) AS inicial,
               coalesce(sum(${fis}) FILTER (WHERE ${sel} AND tipo_movimiento <> 'TRANSFERENCIA' AND ${fis} > 0), 0) AS entradas,
               coalesce(-sum(${fis}) FILTER (WHERE ${sel} AND tipo_movimiento <> 'TRANSFERENCIA' AND ${fis} < 0), 0) AS salidas,
               coalesce(sum(dd) FILTER (WHERE ${sel} AND tipo_movimiento = 'TRANSFERENCIA' AND dd > 0), 0) AS t_ent,
               coalesce(-sum(dd) FILTER (WHERE ${sel} AND tipo_movimiento = 'TRANSFERENCIA' AND dd < 0), 0) AS t_sal,
               coalesce(sum(${fis}) FILTER (WHERE ${fuera}), 0) AS fuera_filtro,
               coalesce(sum(dd) FILTER (WHERE ${fin}), 0) AS f_disp, coalesce(sum(dr) FILTER (WHERE ${fin}), 0) AS f_res,
               coalesce(sum(dc) FILTER (WHERE ${fin}), 0) AS f_cuar,
               count(*) FILTER (WHERE ${sel}) AS en_filtro
          FROM sal GROUP BY producto_id, deposito_id, lote_id, propietario_id
      ),
      gf AS (SELECT * FROM g WHERE en_filtro > 0${filtrosDeFila ? "" : " OR inicial <> 0"})`;
    // Totales de las filas mostradas (mismo conjunto gf que las filas): el TOTAL del resumen es la suma exacta de sus filas.
    const cnt = await db.query(
      `WITH ${cte}, ${grupo}
       SELECT count(*)::int AS n, coalesce(sum(inicial), 0)::float8 AS inicial, coalesce(sum(entradas), 0)::float8 AS entradas, coalesce(sum(salidas), 0)::float8 AS salidas,
              coalesce(sum(t_ent), 0)::float8 AS t_ent, coalesce(sum(t_sal), 0)::float8 AS t_sal, coalesce(sum(fuera_filtro), 0)::float8 AS fuera,
              coalesce(sum(f_disp + f_res + f_cuar), 0)::float8 AS final, coalesce(sum(f_disp), 0)::float8 AS f_disp,
              coalesce(sum(f_res), 0)::float8 AS f_res, coalesce(sum(f_cuar), 0)::float8 AS f_cuar
         FROM gf`,
      params,
    );
    const c0 = cnt.rows[0];
    totalFilas = c0.n;
    totales.resumen = {
      filas: c0.n, saldoInicial: c0.inicial, entradas: c0.entradas, salidas: c0.salidas, transfEntradas: c0.t_ent, transfSalidas: c0.t_sal,
      fueraDelFiltro: c0.fuera, saldoFinal: c0.final, finalDisponible: c0.f_disp, finalReservado: c0.f_res, finalCuarentena: c0.f_cuar,
    };
    const rows = await db.query(
      `WITH ${cte}, ${grupo}
       SELECT gf.producto_id::text || ':' || d.id::text || ':' || coalesce(gf.lote_id::text, '') AS clave, gf.pcodigo, gf.pdesc, d.nombre AS deposito,
              coalesce(gf.codigo_lote, '') AS lote, gf.inicial::float8 AS inicial, gf.entradas::float8 AS entradas, gf.salidas::float8 AS salidas,
              gf.t_ent::float8 AS t_ent, gf.t_sal::float8 AS t_sal, gf.fuera_filtro::float8 AS fuera, (gf.f_disp + gf.f_res + gf.f_cuar)::float8 AS final,
              gf.f_disp::float8 AS f_disp, gf.f_res::float8 AS f_res, gf.f_cuar::float8 AS f_cuar
         FROM gf JOIN depositos d ON d.empresa_id = $1 AND d.id = gf.deposito_id
        ORDER BY gf.pcodigo, d.nombre, gf.codigo_lote NULLS FIRST, gf.producto_id
        LIMIT ${p(limite)} OFFSET ${p(desplazamiento)}`,
      params,
    );
    if (todas && rows.rows.length > MAX_FILAS_EXPORTACION) return { error: `La exportación supera ${MAX_FILAS_EXPORTACION} filas; reduzca los filtros.`, status: 413 };
    resumen = rows.rows.map((x): KardexResumenFila => ({
      clave: x.clave, productoCodigo: x.pcodigo, productoDescripcion: x.pdesc, deposito: x.deposito, lote: x.lote, propiedad: "PROPIO",
      saldoInicial: x.inicial, entradas: x.entradas, salidas: x.salidas, transfEntradas: x.t_ent, transfSalidas: x.t_sal, fueraDelFiltro: x.fuera,
      saldoFinal: x.final, finalDisponible: x.f_disp, finalReservado: x.f_res, finalCuarentena: x.f_cuar,
    }));
  }

  const [usr, ahora] = await Promise.all([
    db.query(
      `SELECT u.id, u.usuario AS nombre FROM usuarios u
        WHERE u.empresa_id = $1 AND EXISTS (SELECT 1 FROM movimientos_inventario m WHERE m.empresa_id = $1 AND m.creado_por = u.id) ORDER BY u.usuario`,
      [empresaId],
    ),
    db.query(`SELECT to_char(now() AT TIME ZONE 'America/Asuncion', 'DD/MM/YYYY HH24:MI') AS t, to_char(now() AT TIME ZONE 'America/Asuncion', 'YYYYMMDD-HH24MI') AS f`),
  ]);
  const cc = cq.rows[0];

  return {
    empresa: em.rows[0],
    generado: ahora.rows[0].t,
    sello: ahora.rows[0].f,
    filtros: f,
    pagina: { numero: pagina, tamano, totalFilas },
    filas: filasOut,
    resumen,
    totales,
    conciliacion: { combinaciones: cc.n, divergentes: cc.divergentes, conciliado: cc.divergentes === 0 },
    catalogos: { depositos: permitidos, usuarios: usr.rows, tipos: TIPOS_KARDEX },
    cobertura: COBERTURA_KARDEX,
  };
}
