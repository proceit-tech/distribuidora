import type { Pool } from "pg";

import { depositosDelAlcance } from "@/lib/reportes/alcance";
import { construirGrupos, textoPropietario } from "@/lib/reportes/kardex-plan";
import { ORIGENES_KARDEX, TIPOS_KARDEX } from "@/lib/reportes/kardex-textos";
import { conSnapshotLectura } from "@/lib/reportes/snapshot";
import { MAX_FILAS_EXPORTACION } from "@/lib/reportes/stock-general";
import type { KardexFiltros, KardexFila, KardexResumenFila, KardexRespuesta, KardexTotales } from "@/types/reportes";

// Reporte 3 — Kardex de movimientos (solo lectura). Fuente: libro de movimientos (movimientos_inventario + movimiento_lineas).
// Todo cambio de stock pasa por funciones SECURITY DEFINER que escriben una línea, por lo que el saldo de cada
// producto × depósito × lote × propiedad × propietario es EXACTAMENTE la suma de los efectos de sus líneas, en orden de registro (número de
// movimiento). El saldo acumulado se calcula en la base sobre TODA la historia (nunca por página) y se concilia con
// stock_saldos. No se estiman saldos: si el libro no coincide con Stock, se informa. Cantidades como texto numeric exacto (nunca float).
// Toda la lectura de UNA solicitud ocurre en UNA conexión y UNA transacción REPEATABLE READ de solo lectura.

type DbConexion = Pick<Pool, "connect">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
export { ORIGENES_KARDEX, TIPOS_KARDEX };
const CERO_UUID = "00000000-0000-0000-0000-000000000000";

export const COBERTURA_KARDEX = [
  "Cada fila es el efecto de un movimiento sobre un depósito. El saldo acumulado es la suma de todos los efectos anteriores del mismo producto × depósito × lote × propiedad × propietario, en orden de registro (número de movimiento), desde el primer movimiento: no se reinicia por página, período ni filtro.",
  "El período filtra por FECHA DE REGISTRO (cuando cambió el saldo). La fecha del movimiento puede ser anterior (movimiento retroactivo) y se muestra aparte; el saldo sigue el orden de registro. Saldo inicial = suma de los efectos registrados antes del período.",
  "Transferencias: una fila de salida en el depósito de origen y una de entrada en el destino (mismo número de movimiento); en el consolidado se compensan y se totalizan aparte, sin duplicar cantidades. Si el otro depósito está fuera de su alcance no se muestra su nombre.",
  "Reservas y cuarentena son cambios de estado: no son entrada ni salida física. Se muestran sus efectos sobre disponible, reservado y cuarentena; físico = disponible + reservado + cuarentena.",
  "Anulaciones: el movimiento original queda ANULADO y se genera un movimiento inverso (origen Anulación) vinculado a él; ninguno se borra y ambos cuentan en el saldo (neto cero).",
  "Stock propio y de terceros: se muestran separados y nunca se suman entre sí ni entre propietarios distintos; el stock de terceros no tiene costo patrimonial propio.",
  "Unidades: las cantidades no se suman entre unidades de medida distintas (kg, unidades, litros…). Los totales se presentan por unidad × propiedad × propietario; no existe un total general de cantidades heterogéneas.",
  "Costos: solo el costo unitario y total registrado en la línea del movimiento, con su moneda (—, si no existe, p. ej. reservas). En una transferencia el costo se muestra una sola vez, en la fila de salida. V1 no guarda saldos valorizados históricos: este reporte no los calcula ni usa el costo promedio actual.",
  "El estado En tránsito no tiene flujo en V1. Incluye los depósitos de su alcance, activos e inactivos (rotulados). Foto única (misma transacción) de una solicitud; la exportación genera su propia fotografía.",
];

export const COBERTURA_UNIDAD_HISTORIAL =
  "Unidad de medida histórica: cada movimiento muestra la unidad-base vigente cuando se registró (según el historial de cambios de unidad, NEX-052; un cambio exige stock en cero). Las cantidades NO se convierten entre unidades y cada unidad se totaliza por separado: un producto que pasó de Kilo a Unidad aparece en dos grupos.";
export const COBERTURA_UNIDAD_CATALOGO =
  "Unidad de medida: la del catálogo del producto. El historial de cambios de unidad-base (NEX-052) no existe en esta base, por lo que no hay cambios de unidad registrados y la unidad actual es la de todos los movimientos.";

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
export async function leerKardex(
  db: DbConexion,
  empresaId: string,
  usuarioId: string,
  f: KardexFiltros,
  pagina: number,
  tamano: number,
  todas = false,
): Promise<KardexRespuesta | { error: string; status: number }> {
  // Toda la lectura de UNA solicitud (alcance, totales, conciliación, filas y catálogos) ocurre en UNA conexión y UNA transacción REPEATABLE READ de solo lectura.
  return conSnapshotLectura(db, async (c) => {
    const alcance = await depositosDelAlcance(c, empresaId, usuarioId);
    if (f.depositoId && !alcance.some((d) => d.id === f.depositoId)) return { error: "Depósito no permitido.", status: 403 };
    const deps = f.depositoId ? [f.depositoId] : alcance.map((d) => d.id);

    // Unidad-base HISTÓRICA (NEX-052): si la tabla de cambios existe, cada línea toma la unidad vigente en el instante de registro del movimiento; si NEX-052 aún no
    // está aplicada (no se puede haber cambiado la unidad), se usa la del catálogo. La existencia se verifica con to_regclass: nunca se consulta una tabla ausente.
    const historial = (await c.query("SELECT to_regclass('public.producto_unidad_base_historial') IS NOT NULL AS existe")).rows[0]?.existe === true;
    const unidadSql = historial
      ? `LEFT JOIN LATERAL (
          SELECT coalesce(
            (SELECT h.unidad_nueva_id FROM producto_unidad_base_historial h
              WHERE h.empresa_id = $1 AND h.producto_id = ef.producto_id AND h.cambiado_at <= ef.creado_at ORDER BY h.cambiado_at DESC, h.id DESC LIMIT 1),
            (SELECT h.unidad_anterior_id FROM producto_unidad_base_historial h
              WHERE h.empresa_id = $1 AND h.producto_id = ef.producto_id ORDER BY h.cambiado_at ASC, h.id ASC LIMIT 1),
            pr.unidad_medida_id) AS unidad_id) uh ON true`
      : "LEFT JOIN LATERAL (SELECT pr.unidad_medida_id AS unidad_id) uh ON true";

    // $3 = TODO el alcance del usuario (no solo el depósito filtrado): decide si el nombre de la contraparte de una transferencia puede mostrarse.
    const params: unknown[] = [empresaId, deps, alcance.map((d) => d.id)];
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

    // El libro incluye stock PROPIO y de TERCEROS (separados por propiedad y propietario en la ventana del saldo acumulado).
    const cte = `
    mv AS (
      SELECT m.id AS movimiento_id, m.numero_movimiento, m.tipo_movimiento, m.tipo_origen, m.estado, m.fecha_movimiento, m.hora_movimiento, m.creado_at,
             m.documento_referencia, m.motivo, m.observacion, m.creado_por, m.anula_a_id, m.deposito_origen_id, m.deposito_destino_id,
             l.id AS linea_id, l.producto_id, l.cantidad, l.lote_id, l.propiedad, l.propietario_id, l.costo_unitario, l.costo_total,
             l.moneda_costo_codigo, l.creado_at AS linea_at
        FROM movimientos_inventario m JOIN movimiento_lineas l ON l.empresa_id = m.empresa_id AND l.movimiento_id = m.id
       WHERE m.empresa_id = $1
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
      SELECT ef.*, pr.codigo AS pcodigo, pr.descripcion AS pdesc, sl.codigo_lote, coalesce(um.nombre, '') AS unidad, uh.unidad_id,
             (ef.creado_at AT TIME ZONE 'America/Asuncion')::date AS reg_fecha,
             sum(ef.dd) OVER w AS s_disp, sum(ef.dr) OVER w AS s_res, sum(ef.dc) OVER w AS s_cuar
        FROM ef
        JOIN productos pr ON pr.empresa_id = $1 AND pr.id = ef.producto_id
        ${unidadSql}
        LEFT JOIN unidades_medida um ON um.id = uh.unidad_id
        LEFT JOIN stock_lotes sl ON sl.empresa_id = $1 AND sl.producto_id = ef.producto_id AND sl.id = ef.lote_id
       WHERE ef.deposito_id = ANY($2::uuid[])${dim}
      WINDOW w AS (PARTITION BY ef.producto_id, ef.deposito_id, ef.lote_id, ef.propiedad, ef.propietario_id, uh.unidad_id
                   ORDER BY ef.numero_movimiento, ef.linea_at, ef.linea_id, ef.lado_ord ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
    )`;

    const sumas = (col: string, hastaTotal = false) =>
      `coalesce(sum(${col}) FILTER (WHERE ${hastaTotal ? (f.hasta ? `reg_fecha <= ${ph}::date` : "true") : f.desde ? `reg_fecha < ${pd}::date` : "false"}), 0)::text`;
    const fis = "(dd + dr + dc)";
    // Tres conjuntos de movimientos del período (mismo cálculo, distinta condición): los que cumplen los filtros de fila (f),
    // los que quedan fuera de ellos (o) y todos (c = conciliación completa). Transferencias siempre aparte.
    const fuera = `(${enPer}) AND NOT (${pasa})`;
    const movCols = (px: string, cond: string) => `
              coalesce(sum(${fis}) FILTER (WHERE ${cond} AND tipo_movimiento <> 'TRANSFERENCIA' AND ${fis} > 0), 0)::text AS ${px}_ent,
              coalesce(-sum(${fis}) FILTER (WHERE ${cond} AND tipo_movimiento <> 'TRANSFERENCIA' AND ${fis} < 0), 0)::text AS ${px}_sal,
              coalesce(sum(dd) FILTER (WHERE ${cond} AND tipo_movimiento = 'TRANSFERENCIA' AND dd > 0), 0)::text AS ${px}_tent,
              coalesce(-sum(dd) FILTER (WHERE ${cond} AND tipo_movimiento = 'TRANSFERENCIA' AND dd < 0), 0)::text AS ${px}_tsal,
              count(*) FILTER (WHERE ${cond} AND efecto = 'ESTADO')::int AS ${px}_cam,
              count(DISTINCT movimiento_id) FILTER (WHERE ${cond} AND tipo_origen = 'ANULACION')::int AS ${px}_anu`;

    // Totales por grupo homogéneo (unidad × propiedad × propietario): nunca se suman unidades ni propietarios distintos.
    const tq = await c.query(
      `WITH ${cte}
       SELECT unidad, propiedad, propietario_id::text AS propietario_id, count(*) FILTER (WHERE ${sel})::int AS filas,
              ${sumas("dd")} AS i_disp, ${sumas("dr")} AS i_res, ${sumas("dc")} AS i_cuar,
              ${sumas("dd", true)} AS f_disp, ${sumas("dr", true)} AS f_res, ${sumas("dc", true)} AS f_cuar,
              ${movCols("f", sel)}, ${movCols("o", fuera)}, ${movCols("c", enPer)}
         FROM sal GROUP BY unidad, propiedad, propietario_id ORDER BY unidad, propiedad, propietario_id NULLS FIRST`,
      params,
    );
    // Conciliación con Stock (misma fotografía): el libro completo debe dar el mismo saldo por estado que stock_saldos, también para terceros.
    const cq = await c.query(
      `WITH ${cte},
       hist AS (SELECT producto_id, deposito_id, lote_id, propiedad, propietario_id, sum(dd) AS d, sum(dr) AS r, sum(dc) AS c FROM sal GROUP BY 1, 2, 3, 4, 5),
       st AS (
         SELECT s.producto_id, s.deposito_id, s.lote_id, s.propiedad, s.propietario_id,
                coalesce(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'DISPONIBLE'), 0) AS d,
                coalesce(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'RESERVADO'), 0) AS r,
                coalesce(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'CUARENTENA'), 0) AS c
           FROM stock_saldos s
           JOIN productos pr ON pr.empresa_id = $1 AND pr.id = s.producto_id
           LEFT JOIN stock_lotes sl ON sl.empresa_id = $1 AND sl.producto_id = s.producto_id AND sl.id = s.lote_id
          WHERE s.empresa_id = $1 AND s.deposito_id = ANY($2::uuid[]) AND s.estado_stock <> 'TRANSITO'${dim}
          GROUP BY 1, 2, 3, 4, 5)
       SELECT count(*)::int AS n,
              count(*) FILTER (WHERE coalesce(h.d, 0) <> coalesce(s.d, 0) OR coalesce(h.r, 0) <> coalesce(s.r, 0) OR coalesce(h.c, 0) <> coalesce(s.c, 0))::int AS divergentes
         FROM hist h FULL JOIN st s
           ON h.producto_id = s.producto_id AND h.deposito_id = s.deposito_id AND h.propiedad = s.propiedad
          AND coalesce(h.lote_id, '${CERO_UUID}'::uuid) = coalesce(s.lote_id, '${CERO_UUID}'::uuid)
          AND coalesce(h.propietario_id, '${CERO_UUID}'::uuid) = coalesce(s.propietario_id, '${CERO_UUID}'::uuid)`,
      params,
    );
    const em = await c.query(`SELECT razon_social AS nombre, moneda_base_codigo AS moneda FROM empresas WHERE id = $1`, [empresaId]);

    let totalFilas = (tq.rows as { filas: number }[]).reduce((a, x) => a + x.filas, 0);
    const limite = todas ? MAX_FILAS_EXPORTACION + 1 : tamano;
    const desplazamiento = todas ? 0 : (pagina - 1) * tamano;
    let filasOut: KardexFila[] = [];
    let resumen: KardexResumenFila[] = [];
    let grupoRes: Record<string, unknown>[] | null = null;

    if (f.vista === "DETALLE") {
      const rows = await c.query(
        `WITH ${cte},
         pg AS (SELECT * FROM sal WHERE ${sel} ORDER BY numero_movimiento, linea_at, linea_id, lado_ord LIMIT ${p(limite)} OFFSET ${p(desplazamiento)})
         SELECT s.movimiento_id::text || ':' || s.linea_id::text || ':' || s.lado_ord AS clave, s.numero_movimiento, to_char(s.reg_fecha, 'YYYY-MM-DD') AS freg,
                to_char(s.creado_at AT TIME ZONE 'America/Asuncion', 'HH24:MI:SS') AS hreg, to_char(s.fecha_movimiento, 'YYYY-MM-DD') AS fmov,
                (s.fecha_movimiento <> s.reg_fecha) AS retro, s.tipo_movimiento, s.tipo_origen, s.estado, coalesce(s.documento_referencia, '') AS doc,
                coalesce(s.motivo, '') AS motivo, coalesce(s.observacion, '') AS obs, coalesce(u.usuario, '') AS usuario, s.pcodigo, s.pdesc, s.unidad,
                d.nombre AS deposito, NOT d.activo AS inactivo,
                CASE WHEN s.contra_id IS NULL THEN '' WHEN dcp.id IS NULL THEN 'Otro depósito (sin acceso)' ELSE dcp.nombre END AS contra,
                coalesce(s.codigo_lote, '') AS lote, s.propiedad, s.propietario_id::text AS propietario_id, s.efecto,
                greatest(s.dd + s.dr + s.dc, 0)::text AS entrada, greatest(-(s.dd + s.dr + s.dc), 0)::text AS salida,
                s.dd::text AS dd, s.dr::text AS dr, s.dc::text AS dc,
                s.s_disp::text AS s_disp, s.s_res::text AS s_res, s.s_cuar::text AS s_cuar, (s.s_disp + s.s_res + s.s_cuar)::text AS s_fis,
                CASE WHEN s.propiedad = 'PROPIO' AND NOT (s.tipo_movimiento = 'TRANSFERENCIA' AND s.efecto = 'ENTRADA') THEN s.costo_unitario::text END AS cu,
                CASE WHEN s.propiedad = 'PROPIO' AND NOT (s.tipo_movimiento = 'TRANSFERENCIA' AND s.efecto = 'ENTRADA') THEN s.costo_total::text END AS ct,
                CASE WHEN s.propiedad = 'PROPIO' AND NOT (s.tipo_movimiento = 'TRANSFERENCIA' AND s.efecto = 'ENTRADA') AND s.costo_total IS NOT NULL THEN coalesce(s.moneda_costo_codigo, '') ELSE '' END AS mon,
                coalesce(an.numero_movimiento, '') AS anulado_por, coalesce(og.numero_movimiento, '') AS anula_a
           FROM pg s
           JOIN depositos d ON d.empresa_id = $1 AND d.id = s.deposito_id
           LEFT JOIN depositos dcp ON dcp.empresa_id = $1 AND dcp.id = s.contra_id AND dcp.id = ANY($3::uuid[])
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
        productoCodigo: x.pcodigo, productoDescripcion: x.pdesc, unidad: x.unidad, deposito: x.deposito, depositoInactivo: x.inactivo === true, contraparte: x.contra, lote: x.lote,
        propiedad: x.propiedad, propietario: textoPropietario(x.propiedad, x.propietario_id),
        efecto: x.efecto, entrada: x.entrada, salida: x.salida, dDisponible: x.dd, dReservado: x.dr, dCuarentena: x.dc,
        saldoDisponible: x.s_disp, saldoReservado: x.s_res, saldoCuarentena: x.s_cuar, saldoFisico: x.s_fis,
        costoUnitario: x.cu ?? null, costoTotal: x.ct ?? null, moneda: x.mon,
        vinculado: x.anulado_por || x.anula_a, vinculoTipo: x.anulado_por ? "ANULADO_POR" : x.anula_a ? "ANULA_A" : "",
      }));
    } else {
      const ini = f.desde ? `reg_fecha < ${pd}::date` : "false";
      const fin = f.hasta ? `reg_fecha <= ${ph}::date` : "true";
      const grupo = `
      g AS (
        SELECT producto_id, deposito_id, lote_id, propiedad, propietario_id, unidad_id, max(pcodigo) AS pcodigo, max(pdesc) AS pdesc, max(codigo_lote) AS codigo_lote, max(unidad) AS unidad,
               coalesce(sum(${fis}) FILTER (WHERE ${ini}), 0) AS inicial,
               coalesce(sum(${fis}) FILTER (WHERE ${sel} AND tipo_movimiento <> 'TRANSFERENCIA' AND ${fis} > 0), 0) AS entradas,
               coalesce(-sum(${fis}) FILTER (WHERE ${sel} AND tipo_movimiento <> 'TRANSFERENCIA' AND ${fis} < 0), 0) AS salidas,
               coalesce(sum(dd) FILTER (WHERE ${sel} AND tipo_movimiento = 'TRANSFERENCIA' AND dd > 0), 0) AS t_ent,
               coalesce(-sum(dd) FILTER (WHERE ${sel} AND tipo_movimiento = 'TRANSFERENCIA' AND dd < 0), 0) AS t_sal,
               coalesce(sum(${fis}) FILTER (WHERE ${fuera}), 0) AS fuera_filtro,
               coalesce(sum(dd) FILTER (WHERE ${fin}), 0) AS f_disp, coalesce(sum(dr) FILTER (WHERE ${fin}), 0) AS f_res,
               coalesce(sum(dc) FILTER (WHERE ${fin}), 0) AS f_cuar,
               count(*) FILTER (WHERE ${sel}) AS en_filtro
          FROM sal GROUP BY producto_id, deposito_id, lote_id, propiedad, propietario_id, unidad_id
      ),
      gf AS (SELECT * FROM g WHERE en_filtro > 0${filtrosDeFila ? "" : " OR inicial <> 0"})`;
      // Totales de las filas mostradas (mismo conjunto gf que las filas), por grupo homogéneo: el TOTAL del resumen es la suma exacta de sus filas.
      const cnt = await c.query(
        `WITH ${cte}, ${grupo}
         SELECT unidad, propiedad, propietario_id::text AS propietario_id, count(*)::int AS n, coalesce(sum(inicial), 0)::text AS inicial, coalesce(sum(entradas), 0)::text AS entradas,
                coalesce(sum(salidas), 0)::text AS salidas, coalesce(sum(t_ent), 0)::text AS t_ent, coalesce(sum(t_sal), 0)::text AS t_sal, coalesce(sum(fuera_filtro), 0)::text AS fuera,
                coalesce(sum(f_disp + f_res + f_cuar), 0)::text AS final, coalesce(sum(f_disp), 0)::text AS f_disp,
                coalesce(sum(f_res), 0)::text AS f_res, coalesce(sum(f_cuar), 0)::text AS f_cuar
           FROM gf GROUP BY unidad, propiedad, propietario_id`,
        params,
      );
      grupoRes = cnt.rows;
      totalFilas = (cnt.rows as { n: number }[]).reduce((a, x) => a + x.n, 0);
      const rows = await c.query(
        `WITH ${cte}, ${grupo}
         SELECT gf.producto_id::text || ':' || d.id::text || ':' || coalesce(gf.lote_id::text, '') || ':' || gf.propiedad || ':' || coalesce(gf.propietario_id::text, '') || ':' || coalesce(gf.unidad_id::text, '') AS clave,
                gf.pcodigo, gf.pdesc, gf.unidad, d.nombre AS deposito, NOT d.activo AS inactivo, coalesce(gf.codigo_lote, '') AS lote, gf.propiedad, gf.propietario_id::text AS propietario_id,
                gf.inicial::text AS inicial, gf.entradas::text AS entradas, gf.salidas::text AS salidas,
                gf.t_ent::text AS t_ent, gf.t_sal::text AS t_sal, gf.fuera_filtro::text AS fuera, (gf.f_disp + gf.f_res + gf.f_cuar)::text AS final,
                gf.f_disp::text AS f_disp, gf.f_res::text AS f_res, gf.f_cuar::text AS f_cuar
           FROM gf JOIN depositos d ON d.empresa_id = $1 AND d.id = gf.deposito_id
          ORDER BY gf.pcodigo, d.nombre, gf.codigo_lote NULLS FIRST, gf.propiedad, gf.propietario_id NULLS FIRST, gf.unidad, gf.producto_id
          LIMIT ${p(limite)} OFFSET ${p(desplazamiento)}`,
        params,
      );
      if (todas && rows.rows.length > MAX_FILAS_EXPORTACION) return { error: `La exportación supera ${MAX_FILAS_EXPORTACION} filas; reduzca los filtros.`, status: 413 };
      resumen = rows.rows.map((x): KardexResumenFila => ({
        clave: x.clave, productoCodigo: x.pcodigo, productoDescripcion: x.pdesc, unidad: x.unidad, deposito: x.deposito, depositoInactivo: x.inactivo === true, lote: x.lote,
        propiedad: x.propiedad, propietario: textoPropietario(x.propiedad, x.propietario_id),
        saldoInicial: x.inicial, entradas: x.entradas, salidas: x.salidas, transfEntradas: x.t_ent, transfSalidas: x.t_sal, fueraDelFiltro: x.fuera,
        saldoFinal: x.final, finalDisponible: x.f_disp, finalReservado: x.f_res, finalCuarentena: x.f_cuar,
      }));
    }

    const usr = await c.query(
      `SELECT u.id, u.usuario AS nombre FROM usuarios u
        WHERE u.empresa_id = $1 AND EXISTS (SELECT 1 FROM movimientos_inventario m WHERE m.empresa_id = $1 AND m.creado_por = u.id) ORDER BY u.usuario`,
      [empresaId],
    );
    const ahora = await c.query(`SELECT to_char(now() AT TIME ZONE 'America/Asuncion', 'DD/MM/YYYY HH24:MI') AS t, to_char(now() AT TIME ZONE 'America/Asuncion', 'YYYYMMDD-HH24MI') AS f`);
    const cc = cq.rows[0];
    const grupos = construirGrupos(tq.rows, grupoRes);
    const totales: KardexTotales = { filas: (tq.rows as { filas: number }[]).reduce((a, x) => a + x.filas, 0), filtrosDeFila, grupos, cuadra: grupos.every((g) => g.cuadra) };

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
      catalogos: { depositos: alcance, usuarios: usr.rows, tipos: TIPOS_KARDEX },
      fuenteUnidad: historial ? "HISTORIAL" : "CATALOGO",
      cobertura: [...COBERTURA_KARDEX, historial ? COBERTURA_UNIDAD_HISTORIAL : COBERTURA_UNIDAD_CATALOGO],
    } satisfies KardexRespuesta;
  });
}
