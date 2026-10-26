import type { Pool } from "pg";

import { hoyParaguay } from "@/lib/facturacion/credito";
import { ESTADOS_SIFEN } from "@/lib/facturacion/estados";
import { conSnapshotLectura, type Cliente } from "@/lib/reportes/snapshot";
import { MAX_FILAS_EXPORTACION } from "@/lib/reportes/stock-general";
import { ETIQUETA_AJUSTE_NO_ATRIBUIBLE, ETIQUETA_ANOMALIA, ETIQUETA_SIN_CODIGO, ETIQUETA_VENDEDOR, MONEDAS_VENTAS, mesCorrienteParaguay } from "@/lib/reportes/ventas-presentacion";
import type {
  EstadoVendedorVentas,
  SituacionVentas,
  VentasAjusteNoAtribuible,
  VentasAnomalia,
  VentasEstadoInformativo,
  VentasFilaDocumento,
  VentasFilaGrupo,
  VentasFiltros,
  VentasImportes,
  VentasRespuesta,
  VentasResumenMoneda,
  VentasTotalDocumentos,
  VistaVentas,
} from "@/types/reportes";

// Informe de Ventas (E5 / PRO-296). Fuente ÚNICA: documentos_electronicos FE/NCE emitidos por el NEXIT y su solicitud fiscal persistida (documento_electronico_solicitudes): Subtotales[0].dTotGralOpe y
// dTotIVA (foto fiscal histórica; nunca precios, IVA ni catálogos actuales). Solo computa estado_sifen = APROBADO (ENVIADO ≠ APROBADO) con payload conciliable; el resto se informa aparte y NUNCA altera
// los netos. Grano primario: UNA fila por documento (los importes se toman de la cabecera ANTES de cualquier unión con ítems, líneas acreditadas o vendedor: cada 1:N se agrega por separado).
// NCE: se imputa por SU fecha de emisión, se resta una sola vez (cabecera de la NCE; nce_lineas / nce_descuentos solo verifican y atribuyen) y hereda el vendedor de su FE por nce_origen.
// Monedas nunca se suman entre sí. Dinero y cantidades: numeric en PostgreSQL, devueltos como texto exacto. Todo lo de UNA solicitud se lee en UNA transacción REPEATABLE READ READ ONLY.

type Db = Pick<Pool, "connect">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
/** Período máximo por consulta (un año calendario completo, también bisiesto): se rechaza con 400, nunca se recorta en silencio. */
export const MAX_DIAS_PERIODO = 366;
const VISTAS: VistaVentas[] = ["RESUMEN", "DOCUMENTOS", "PRODUCTOS", "CLIENTES", "VENDEDORES", "MESES"];

export const COBERTURA_VENTAS = [
  "Informe fiscal-operativo de las Facturas Electrónicas (FE) y Notas de Crédito Electrónicas (NCE) emitidas por el NEXIT. No es libro tributario oficial, ni cuentas por cobrar, cobros, pedidos, costo ni margen.",
  "Solo computan los documentos con estado SIFEN APROBADO y JSON fiscal conciliable. Enviado, pendiente, sin consultar, no reconocido, rechazado, cancelado e inutilizado se informan aparte y no alteran los netos. Un envío aceptado por el gateway no equivale a aprobación.",
  "Importes de la foto fiscal histórica de cada documento: dTotGralOpe (con IVA) y dTotIVA de Subtotales[0]; «sin IVA» = total − IVA por documento (incluye exentas y exoneradas). No se usan precios, clasificación de IVA ni clientes actuales.",
  "Venta neta con IVA = FE aprobadas con IVA − NCE aprobadas con IVA; IVA neto = IVA FE − IVA NCE; venta neta sin IVA = venta neta con IVA − IVA neto. Cada NCE se resta una sola vez y en el período de SU fecha de emisión: un período puede tener neto o IVA neto negativo.",
  "Monedas separadas: no hay total general entre PYG, USD y BRL ni conversión con tipos de cambio.",
  "Situación fiscal al generar: el informe refleja los estados SIFEN actuales al momento de generarlo; un cambio posterior (p. ej. una cancelación) modifica la lectura del mismo período. No se atribuye fecha de aprobación.",
  "Vendedor: vendedor comercial registrado en la FE (NEX-074), nunca el usuario emisor; la NCE hereda el de su factura original. Las FE anteriores al registro de vendedor figuran «Sin vendedor registrado».",
  `Productos: ítems del JSON fiscal original (código, descripción y unidad de emisión históricos). Las NCE de servicio DESCUENTO (descuento/bonificación) y las que no pueden vincularse a ítems se muestran en «${ETIQUETA_AJUSTE_NO_ATRIBUIBLE}» y forman parte del total. Las cantidades se informan por unidad de emisión; la cantidad devuelta solo proviene de NCE de devolución.`,
  "Un documento aprobado sin información fiscal conciliable (sin JSON, versión incierta, sin CDC, subtotales o ítems inconsistentes, NCE sin vínculo verificable) se informa como anomalía con su monto aparte: no se suma como cero ni se incluye en los indicadores.",
];

/** Validación de una fecha civil real AAAA-MM-DD (años 2000–2100). */
function fechaReal(t: string): boolean {
  if (!FECHA.test(t)) return false;

  const [a, m, d] = t.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));

  return a >= 2000 && a <= 2100 && f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

const diaUtc = (t: string) => {
  const [a, m, d] = t.split("-").map(Number);

  return Date.UTC(a, m - 1, d);
};

export function parsearFiltrosVentas(sp: URLSearchParams, hoy: string = hoyParaguay()): { filtros: VentasFiltros; pagina: number; tamano: number } | { error: string } {
  const vista = (sp.get("vista") ?? "RESUMEN") as VistaVentas;
  if (!VISTAS.includes(vista)) return { error: "Vista no válida." };

  const mes = mesCorrienteParaguay(hoy);
  const desde = sp.get("desde") ?? mes.desde;
  const hasta = sp.get("hasta") ?? mes.hasta;
  if (!fechaReal(desde) || !fechaReal(hasta)) return { error: "Fecha no válida: use AAAA-MM-DD con una fecha real." };
  if (desde > hasta) return { error: "La fecha «desde» es posterior a la fecha «hasta»." };
  if ((diaUtc(hasta) - diaUtc(desde)) / 86_400_000 + 1 > MAX_DIAS_PERIODO) return { error: `El período máximo es de ${MAX_DIAS_PERIODO} días: divida la consulta en períodos menores.` };

  const uuid = (k: string) => {
    const v = sp.get(k) ?? "";
    return v === "" || UUID.test(v) ? v.toLowerCase() : null;
  };
  const sucursalId = uuid("sucursalId"), clienteId = uuid("clienteId");
  if (sucursalId === null || clienteId === null) return { error: "Filtro con identificador no válido." };

  const vendedor = sp.get("vendedor") ?? "";
  if (vendedor !== "" && vendedor !== "SIN" && !UUID.test(vendedor)) return { error: "Filtro de vendedor no válido." };

  const tipo = sp.get("tipo") ?? "";
  if (!["", "FE", "NCE"].includes(tipo)) return { error: "Tipo de documento no válido." };
  const moneda = sp.get("moneda") ?? "";
  if (moneda !== "" && !(MONEDAS_VENTAS as readonly string[]).includes(moneda)) return { error: "Moneda no válida." };
  const estado = sp.get("estado") ?? "";
  if (estado !== "" && !(ESTADOS_SIFEN as readonly string[]).includes(estado)) return { error: "Estado fiscal no válido." };
  const situacion = sp.get("situacion") ?? "TODAS";
  if (!["TODAS", "COMPUTA", "NO_COMPUTA", "ANOMALIA"].includes(situacion)) return { error: "Situación no válida." };

  const pagina = Math.max(1, Math.floor(Number(sp.get("pagina") ?? 1)) || 1);
  const tamano = Math.min(200, Math.max(10, Math.floor(Number(sp.get("tamano") ?? 50)) || 50));

  return {
    filtros: {
      vista, desde, hasta, sucursalId, clienteId, vendedor: vendedor === "SIN" ? "SIN" : vendedor.toLowerCase(),
      tipo: tipo as VentasFiltros["tipo"], moneda: moneda as VentasFiltros["moneda"],
      // Filtros propios de una vista: fuera de ella no se aplican y quedan vacíos (la respuesta declara exactamente lo aplicado).
      q: (sp.get("q") ?? "").trim().slice(0, 80), producto: vista === "PRODUCTOS" ? (sp.get("producto") ?? "").trim().slice(0, 80) : "",
      estado: vista === "DOCUMENTOS" ? estado : "", situacion: vista === "DOCUMENTOS" ? (situacion as VentasFiltros["situacion"]) : "TODAS",
    },
    pagina, tamano,
  };
}

/** Escapa ! % _ para ILIKE ... ESCAPE '!'. */
const like = (t: string) => `%${t.replace(/[!%_]/g, (c) => `!${c}`)}%`;
/** Número de un valor JSON solo si es un número JSON (un texto, nulo u objeto queda NULL → anomalía; nunca se fuerza un cast que falle). */
const NUM = (e: string) => `(CASE WHEN jsonb_typeof(${e}) = 'number' THEN (${e} #>> '{}')::numeric END)`;
const ARREGLO = (e: string) => `(CASE WHEN jsonb_typeof(${e}) = 'array' THEN ${e} ELSE '[]'::jsonb END)`;
/** Orden de monedas: PYG primero, luego alfabético (las monedas NUNCA se suman). */
const ORDEN_MONEDA = "(moneda <> 'PYG'), moneda";

type Esquema = { base: boolean; nce: boolean; nceDescuento: boolean; vendedor: boolean; unidades: boolean };

async function leerEsquema(c: Cliente): Promise<Esquema> {
  const r = (await c.query(
    `SELECT to_regclass('public.documentos_electronicos') IS NOT NULL AND to_regclass('public.documento_electronico_solicitudes') IS NOT NULL
              AND to_regprocedure('public.sucursal_en_alcance(uuid,uuid,uuid)') IS NOT NULL AS base,
            to_regclass('public.nce_origen') IS NOT NULL AND to_regclass('public.nce_lineas') IS NOT NULL AS nce,
            to_regclass('public.nce_descuentos') IS NOT NULL AS nce_descuento,
            to_regclass('public.documento_electronico_vendedor') IS NOT NULL AS vendedor,
            to_regclass('public.unidades_medida_sifen') IS NOT NULL AS unidades`,
  )).rows[0];

  return { base: r.base === true, nce: r.nce === true, nceDescuento: r.nce_descuento === true, vendedor: r.vendedor === true, unidades: r.unidades === true };
}

/**
 * CTE común (una fila por documento FE/NCE del filtro, ya clasificada). $1 empresa, $2 usuario, $3 desde, $4 hasta. El alcance se aplica a CADA documento (sucursal_en_alcance) y, para la NCE, también a su
 * FE original: el número y el vendedor de una FE fuera del alcance no se exponen. Todo JOIN ancla empresa_id + id.
 */
function construirCte(f: VentasFiltros, esq: Esquema, p: (v: unknown) => string): string {
  const condDocs: string[] = [];
  if (f.sucursalId) condDocs.push(`d.sucursal_id = ${p(f.sucursalId)}::uuid`);
  if (f.tipo) condDocs.push(`d.tipo = ${p(f.tipo)}`);
  if (f.moneda) condDocs.push(`d.moneda = ${p(f.moneda)}`);
  if (f.clienteId) condDocs.push(`d.cliente_id = ${p(f.clienteId)}::uuid`);
  if (f.q) {
    condDocs.push(`concat_ws(' ', d.establecimiento || '-' || d.punto_expedicion || '-' || d.numero, coalesce(d.serie || '-' || d.numero, ''), d.cdc, d.receptor_documento, d.receptor_nombre) ILIKE ${p(like(f.q))} ESCAPE '!'`);
  }

  const dsc = esq.nceDescuento
    ? `SELECT nd.nce_id, count(*)::int AS n, sum(nd.monto) AS monto FROM nce_descuentos nd JOIN docs n ON nd.empresa_id = $1 AND nd.nce_id = n.id GROUP BY nd.nce_id`
    : `SELECT NULL::uuid AS nce_id, 0 AS n, 0::numeric AS monto WHERE false`;
  const vend = esq.vendedor
    ? `SELECT v.documento_id, v.vendedor_id, v.vendedor_nombre FROM documento_electronico_vendedor v
        WHERE v.empresa_id = $1 AND v.documento_id IN (SELECT id FROM docs WHERE tipo = 'FE' UNION SELECT fe_id FROM org)`
    : `SELECT NULL::uuid AS documento_id, NULL::uuid AS vendedor_id, NULL::text AS vendedor_nombre WHERE false`;

  const condFil: string[] = [];
  if (f.vendedor === "SIN") condFil.push(`vend_estado = 'SIN_REGISTRO'`);
  else if (f.vendedor) condFil.push(`vend_estado = 'REGISTRADO' AND vendedor_id = ${p(f.vendedor)}::uuid`);

  return `
    docs AS (
      SELECT d.id, d.sucursal_id, s.nombre AS sucursal, d.tipo, d.establecimiento, d.punto_expedicion, d.numero, d.serie, d.cdc, d.fecha_emision,
             d.cliente_id, d.receptor_nombre, d.receptor_documento, d.moneda, d.total, d.estado_local, d.estado_sifen
        FROM documentos_electronicos d
        JOIN sucursales s ON s.empresa_id = d.empresa_id AND s.id = d.sucursal_id
       WHERE d.empresa_id = $1 AND d.tipo IN ('FE', 'NCE') AND sucursal_en_alcance($1::uuid, $2::uuid, d.sucursal_id)
         AND d.fecha_emision >= ($3::date)::timestamp AT TIME ZONE 'America/Asuncion'
         AND d.fecha_emision < (($4::date) + 1)::timestamp AT TIME ZONE 'America/Asuncion'
         ${condDocs.map((x) => `AND ${x}`).join(" ")}
    ),
    ver AS (
      SELECT sv.documento_id, count(*)::int AS n, max(sv.version) AS v
        FROM documento_electronico_solicitudes sv JOIN docs ON sv.empresa_id = $1 AND sv.documento_id = docs.id
       GROUP BY sv.documento_id
    ),
    pay AS (
      SELECT docs.*, coalesce(ver.n, 0) AS n_versiones, sol.payload->'Subtotales'->0 AS sub, sol.payload->'Detalles' AS det,
             sol.payload->>'iTiDE' AS itide, sol.payload->>'cMoneOpe' AS mon_payload, sol.payload->>'iMotEmi' AS imotemi,
             coalesce(CASE WHEN jsonb_typeof(sol.payload->'Subtotales') = 'array' THEN jsonb_array_length(sol.payload->'Subtotales') = 1 END, false) AS sub_unico
        FROM docs
        LEFT JOIN ver ON ver.documento_id = docs.id
        LEFT JOIN documento_electronico_solicitudes sol ON sol.empresa_id = $1 AND sol.documento_id = docs.id AND ver.n = 1 AND sol.version = ver.v
    ),
    it AS (
      SELECT pay.id, count(*)::int AS n,
             count(*) FILTER (WHERE jsonb_typeof(x.e) <> 'object' OR ${NUM("x.e->'dTotOpeItem'")} IS NULL OR ${NUM("x.e->'dLiqIVAItem'")} IS NULL OR ${NUM("x.e->'dCantProSer'")} IS NULL)::int AS malos,
             sum(${NUM("x.e->'dTotOpeItem'")}) AS tot, sum(${NUM("x.e->'dLiqIVAItem'")}) AS iva
        FROM pay CROSS JOIN LATERAL jsonb_array_elements(${ARREGLO("pay.det")}) x(e)
       WHERE pay.estado_sifen = 'APROBADO'
       GROUP BY pay.id
    ),
    org AS (
      SELECT o.nce_id, o.fe_id, o.motivo, o.fe_cdc, fe.tipo AS fe_tipo, fe.moneda AS fe_moneda, fe.estado_sifen AS fe_estado, fe.cdc AS fe_cdc_doc,
             coalesce(sucursal_en_alcance($1::uuid, $2::uuid, fe.sucursal_id), false) AS fe_visible,
             fe.establecimiento || '-' || fe.punto_expedicion || '-' || fe.numero || CASE WHEN fe.serie IS NULL THEN '' ELSE ' (' || fe.serie || ')' END AS fe_numero
        FROM nce_origen o
        JOIN docs n ON o.empresa_id = $1 AND o.nce_id = n.id AND n.tipo = 'NCE'
        LEFT JOIN documentos_electronicos fe ON fe.empresa_id = o.empresa_id AND fe.id = o.fe_id
    ),
    lin AS (
      SELECT nl.nce_id, count(*)::int AS n, sum(nl.monto) AS monto FROM nce_lineas nl JOIN docs n ON nl.empresa_id = $1 AND nl.nce_id = n.id GROUP BY nl.nce_id
    ),
    dsc AS (${dsc}),
    vend AS (${vend}),
    cal AS (
      SELECT pay.*, ${NUM("pay.sub->'dTotGralOpe'")} AS tot, ${NUM("pay.sub->'dTotIVA'")} AS iva, ${NUM("pay.sub->'dIVA5'")} AS iva5, ${NUM("pay.sub->'dIVA10'")} AS iva10,
             it.n AS it_n, it.malos AS it_malos, it.tot AS it_tot, it.iva AS it_iva,
             org.fe_id, org.motivo, org.fe_cdc, org.fe_tipo, org.fe_moneda, org.fe_estado, org.fe_cdc_doc, coalesce(org.fe_visible, false) AS fe_visible, org.fe_numero,
             lin.n AS lin_n, lin.monto AS lin_monto, dsc.n AS dsc_n, dsc.monto AS dsc_monto,
             vend.vendedor_id, vend.vendedor_nombre
        FROM pay
        LEFT JOIN it ON it.id = pay.id
        LEFT JOIN org ON org.nce_id = pay.id
        LEFT JOIN lin ON lin.nce_id = pay.id
        LEFT JOIN dsc ON dsc.nce_id = pay.id
        LEFT JOIN vend ON vend.documento_id = CASE WHEN pay.tipo = 'FE' THEN pay.id ELSE org.fe_id END
    ),
    cls AS (
      SELECT cal.*,
             CASE WHEN estado_sifen <> 'APROBADO' THEN NULL
                  WHEN n_versiones = 0 THEN 'SIN_PAYLOAD'
                  WHEN n_versiones > 1 THEN 'VERSION_INCIERTA'
                  WHEN cdc IS NULL THEN 'SIN_CDC'
                  WHEN itide IS DISTINCT FROM CASE tipo WHEN 'FE' THEN '1' ELSE '5' END THEN 'PAYLOAD_TIPO'
                  WHEN mon_payload IS DISTINCT FROM moneda THEN 'MONEDA'
                  WHEN NOT sub_unico OR tot IS NULL OR iva IS NULL OR iva5 IS NULL OR iva10 IS NULL THEN 'SUBTOTALES'
                  WHEN tot <> total THEN 'TOTAL_DIFIERE'
                  WHEN iva <> iva5 + iva10 OR iva < 0 OR iva > tot THEN 'IVA_INCONSISTENTE'
                  WHEN coalesce(it_n, 0) = 0 OR it_malos > 0 OR it_tot <> tot OR it_iva <> iva THEN 'ITEMS'
                  WHEN tipo = 'NCE' AND fe_id IS NULL THEN 'NCE_SIN_ORIGEN'
                  WHEN tipo = 'NCE' AND (fe_tipo IS DISTINCT FROM 'FE' OR fe_moneda IS DISTINCT FROM moneda OR fe_cdc_doc IS DISTINCT FROM fe_cdc) THEN 'NCE_ORIGEN_INVALIDO'
                  WHEN tipo = 'NCE' AND imotemi IS DISTINCT FROM motivo::text THEN 'NCE_MOTIVO'
                  WHEN tipo = 'NCE' AND coalesce(lin_monto, 0) + coalesce(dsc_monto, 0) <> total THEN 'NCE_LINEAS'
                  WHEN tipo = 'NCE' AND fe_estado IS DISTINCT FROM 'APROBADO' THEN 'NCE_FE_NO_APROBADA'
             END AS anomalia,
             CASE WHEN ${esq.vendedor ? "false" : "true"} THEN 'NO_DISPONIBLE'
                  WHEN tipo = 'NCE' AND fe_id IS NULL THEN 'SIN_ORIGEN'
                  WHEN tipo = 'NCE' AND NOT coalesce(fe_visible, false) THEN 'FUERA_ALCANCE'
                  WHEN vendedor_id IS NULL THEN 'SIN_REGISTRO'
                  ELSE 'REGISTRADO'
             END AS vend_estado,
             CASE WHEN tipo = 'NCE' THEN -1 ELSE 1 END AS sg
        FROM cal
    ),
    cls2 AS (
      SELECT cls.*, CASE WHEN vend_estado = 'REGISTRADO' THEN vendedor_id::text ELSE vend_estado END AS vend_clave FROM cls
    ),
    fil AS (
      SELECT cls2.*,
             CASE WHEN estado_sifen <> 'APROBADO' THEN 'NO_COMPUTA' WHEN anomalia IS NULL THEN 'COMPUTA' ELSE 'ANOMALIA' END AS situacion,
             -- NCE vinculable a ítems (devolución / ajuste por línea): sin servicio DESCUENTO y una línea acreditada por ítem del JSON (las líneas ya concilian con el total por la clasificación).
             (tipo = 'NCE' AND coalesce(dsc_n, 0) = 0 AND lin_n IS NOT NULL AND lin_n = it_n) AS atribuible
        FROM cls2
       ${condFil.length ? `WHERE ${condFil.join(" AND ")}` : ""}
    )`;
}

/** Medidas agregadas (sobre filas ya COMPUTA): cantidades de documentos DISTINTOS y sumas de cabecera; NCE en positivo y restadas en los netos. */
const MEDIDAS = (tot: string, iva: string, doc: string, cond = "") => `
  count(DISTINCT ${doc}) FILTER (WHERE ${cond}tipo = 'FE')::int AS n_fe, count(DISTINCT ${doc}) FILTER (WHERE ${cond}tipo = 'NCE')::int AS n_nce,
  coalesce(sum(${tot}) FILTER (WHERE ${cond}tipo = 'FE'), 0) AS fe, coalesce(sum(${iva}) FILTER (WHERE ${cond}tipo = 'FE'), 0) AS iva_fe,
  coalesce(sum(${tot}) FILTER (WHERE ${cond}tipo = 'NCE'), 0) AS nce, coalesce(sum(${iva}) FILTER (WHERE ${cond}tipo = 'NCE'), 0) AS iva_nce`;
const IMPORTES_TEXTO = `n_fe, n_nce, fe::text AS fe, iva_fe::text AS iva_fe, (fe - iva_fe)::text AS fe_sin, nce::text AS nce, iva_nce::text AS iva_nce, (nce - iva_nce)::text AS nce_sin,
  (fe - nce)::text AS neto, (iva_fe - iva_nce)::text AS iva_neto, ((fe - nce) - (iva_fe - iva_nce))::text AS neto_sin`;

const num = (v: unknown): number => Number(v ?? 0);
const txt = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

function importesDe(x: Record<string, unknown>): VentasImportes {
  return {
    documentosFe: num(x.n_fe), documentosNce: num(x.n_nce), feConIva: String(x.fe), ivaFe: String(x.iva_fe), feSinIva: String(x.fe_sin),
    nceConIva: String(x.nce), ivaNce: String(x.iva_nce), nceSinIva: String(x.nce_sin), netoConIva: String(x.neto), ivaNeto: String(x.iva_neto), netoSinIva: String(x.neto_sin),
  };
}

export async function leerVentas(
  db: Db,
  empresaId: string,
  usuarioId: string,
  filtros: VentasFiltros,
  pagina: number,
  tamano: number,
  todas = false,
): Promise<VentasRespuesta | { error: string; status: number }> {
  return conSnapshotLectura(db, async (c) => {
    const esq = await leerEsquema(c);

    // Sin la estructura fiscal o sin la de NCE no se calcula un neto «como si no existieran NCE»: el informe se declara NO DISPONIBLE (nunca cifras de demostración ni ceros).
    if (!esq.base) return { error: "Informe de Ventas no disponible: la estructura de documentos electrónicos (NEX-046/047/048) no está disponible en esta base.", status: 503 };
    if (!esq.nce) return { error: "Informe de Ventas no disponible: falta la estructura de notas de crédito (NEX-062); no se calcula una venta neta sin poder deducir las NCE.", status: 503 };
    if (filtros.vendedor && !esq.vendedor) return { error: "El filtro por vendedor no está disponible: falta la estructura de vendedor comercial (NEX-074).", status: 409 };
    if (todas && filtros.vista === "VENDEDORES" && !esq.vendedor) return { error: "La vista por vendedor no está disponible por esquema (NEX-074): no se exporta.", status: 409 };

    const sucursales = (await c.query(
      `SELECT s.id::text AS id, s.nombre FROM sucursales s WHERE s.empresa_id = $1 AND sucursal_en_alcance($1::uuid, $2::uuid, s.id) ORDER BY s.nombre, s.id`,
      [empresaId, usuarioId],
    )).rows as { id: string; nombre: string }[];
    if (filtros.sucursalId && !sucursales.some((s) => s.id === filtros.sucursalId)) return { error: "Sucursal no permitida.", status: 403 };

    const params: unknown[] = [empresaId, usuarioId, filtros.desde, filtros.hasta];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const cte = construirCte(filtros, esq, p);
    const base = params.length;
    const baseParams = params.slice(0, base);
    // Consulta sobre el CTE común; `adicional` agrega CTE propios de la vista (sus parámetros siguen a los del CTE común, en `extra`).
    const q = async (sql: string, adicional = "", extra: unknown[] = []) =>
      (await c.query(`WITH ${cte}${adicional ? `, ${adicional}` : ""} ${sql}`, [...baseParams, ...extra])).rows as Record<string, unknown>[];
    const pe = (k: number) => `$${base + k}`;

    // Consultas SECUENCIALES en la misma conexión/transacción (un único snapshot).
    const resumen: VentasResumenMoneda[] = (await q(
      `SELECT moneda, ${IMPORTES_TEXTO} FROM (
         SELECT moneda, ${MEDIDAS("tot", "iva", "id", "situacion = 'COMPUTA' AND ")} FROM fil GROUP BY moneda
       ) r ORDER BY ${ORDEN_MONEDA}`,
    )).map((x) => ({ moneda: String(x.moneda), ...importesDe(x) }));

    const estados: VentasEstadoInformativo[] = (await q(
      `SELECT tipo, estado_sifen, moneda, count(*)::int AS n, count(*) FILTER (WHERE estado_local = 'ENVIADO')::int AS enviados, sum(total)::text AS total
         FROM fil WHERE situacion = 'NO_COMPUTA' GROUP BY tipo, estado_sifen, moneda ORDER BY tipo, estado_sifen, ${ORDEN_MONEDA}`,
    )).map((x) => ({ tipo: String(x.tipo), estadoSifen: String(x.estado_sifen), moneda: String(x.moneda), documentos: num(x.n), enviados: num(x.enviados), total: String(x.total) }));

    const anomalias: VentasAnomalia[] = (await q(
      `SELECT anomalia, tipo, moneda, count(*)::int AS n, sum(total)::text AS total FROM fil WHERE situacion = 'ANOMALIA' GROUP BY anomalia, tipo, moneda ORDER BY anomalia, tipo, ${ORDEN_MONEDA}`,
    )).map((x) => ({ motivo: String(x.anomalia), tipo: String(x.tipo), moneda: String(x.moneda), documentos: num(x.n), total: String(x.total) }));

    const limite = todas ? MAX_FILAS_EXPORTACION + 1 : tamano;
    const desplazamiento = todas ? 0 : (pagina - 1) * tamano;
    let totalFilas = 0;
    let documentos: VentasFilaDocumento[] = [];
    let totalesDocumentos: VentasTotalDocumentos[] = [];
    let grupos: VentasFilaGrupo[] = [];
    let totalesProductos: VentasResumenMoneda[] = [];
    let ajustesNoAtribuibles: VentasAjusteNoAtribuible[] = [];
    const excede = () => ({ error: `La exportación supera ${MAX_FILAS_EXPORTACION} filas; reduzca el período o los filtros.`, status: 413 });

    if (filtros.vista === "RESUMEN") {
      totalFilas = resumen.length;
    } else if (filtros.vista === "DOCUMENTOS") {
      // Estado y situación filtran SOLO la lista (los indicadores del período siguen sobre todo el filtro común).
      const extra: unknown[] = [];
      const condLista: string[] = [];
      if (filtros.estado) {
        extra.push(filtros.estado);
        condLista.push(`estado_sifen = ${pe(extra.length)}`);
      }
      if (filtros.situacion !== "TODAS") {
        extra.push(filtros.situacion);
        condLista.push(`situacion = ${pe(extra.length)}`);
      }
      const lista = `lista AS (SELECT * FROM fil${condLista.length ? ` WHERE ${condLista.join(" AND ")}` : ""})`;

      totalesDocumentos = (await q(
        `SELECT moneda, count(*)::int AS filas, count(*) FILTER (WHERE situacion = 'COMPUTA')::int AS computan,
                coalesce(sum(sg * tot) FILTER (WHERE situacion = 'COMPUTA'), 0)::text AS tot, coalesce(sum(sg * iva) FILTER (WHERE situacion = 'COMPUTA'), 0)::text AS iva,
                coalesce(sum(sg * (tot - iva)) FILTER (WHERE situacion = 'COMPUTA'), 0)::text AS sin
           FROM lista GROUP BY moneda ORDER BY ${ORDEN_MONEDA}`,
        lista, extra,
      )).map((x) => ({ moneda: String(x.moneda), filas: num(x.filas), computan: num(x.computan), totalConIva: String(x.tot), iva: String(x.iva), sinIva: String(x.sin) }));
      totalFilas = totalesDocumentos.reduce((a, t) => a + t.filas, 0);

      const rows = await q(
        `SELECT id::text AS id, to_char(fecha_emision AT TIME ZONE 'America/Asuncion', 'DD/MM/YYYY HH24:MI') AS fecha, tipo,
                establecimiento || '-' || punto_expedicion || '-' || numero || CASE WHEN serie IS NULL THEN '' ELSE ' (' || serie || ')' END AS numero_doc,
                cdc, sucursal, receptor_nombre, receptor_documento, (cliente_id IS NOT NULL) AS vinculado, vend_estado,
                CASE WHEN vend_estado = 'REGISTRADO' THEN vendedor_nombre END AS vendedor_nombre, moneda,
                (sg * total)::text AS total_signo, CASE WHEN situacion = 'COMPUTA' THEN (sg * iva)::text END AS iva_signo,
                CASE WHEN situacion = 'COMPUTA' THEN (sg * (tot - iva))::text END AS sin_signo,
                estado_sifen, estado_local, situacion, anomalia, motivo,
                CASE WHEN tipo = 'NCE' AND fe_visible THEN fe_numero END AS fe_numero, (tipo = 'NCE' AND fe_id IS NOT NULL AND NOT fe_visible) AS fe_fuera
           FROM lista ORDER BY fecha_emision, id LIMIT ${pe(extra.length + 1)} OFFSET ${pe(extra.length + 2)}`,
        lista, [...extra, limite, desplazamiento],
      );
      if (todas && rows.length > MAX_FILAS_EXPORTACION) return excede();

      documentos = rows.map((x) => ({
        clave: String(x.id), fecha: String(x.fecha), tipo: String(x.tipo), numero: String(x.numero_doc), cdc: txt(x.cdc), sucursal: String(x.sucursal),
        receptor: String(x.receptor_nombre), receptorDocumento: txt(x.receptor_documento), clienteVinculado: x.vinculado === true,
        vendedorEstado: String(x.vend_estado) as EstadoVendedorVentas, vendedor: txt(x.vendedor_nombre), moneda: String(x.moneda),
        totalConIva: String(x.total_signo), iva: txt(x.iva_signo), sinIva: txt(x.sin_signo), estadoSifen: String(x.estado_sifen), estadoLocal: String(x.estado_local),
        situacion: String(x.situacion) as SituacionVentas, anomalia: txt(x.anomalia), nceMotivo: x.motivo === null || x.motivo === undefined ? null : num(x.motivo),
        feReferencia: txt(x.fe_numero), feFueraAlcance: x.fe_fuera === true,
      }));
    } else if (filtros.vista === "PRODUCTOS") {
      const extra: unknown[] = [];
      let condPrd = "";
      if (filtros.producto) {
        extra.push(like(filtros.producto));
        condPrd = `WHERE (coalesce(codigo, '') ILIKE ${pe(1)} ESCAPE '!' OR descripcion ILIKE ${pe(1)} ESCAPE '!')`;
      }
      const um = esq.unidades
        ? `LEFT JOIN unidades_medida_sifen um ON um.codigo::text = g.unidad`
        : `LEFT JOIN (SELECT NULL::text AS codigo, NULL::text AS representacion WHERE false) um ON um.codigo = g.unidad`;
      // Grano ítem: SOLO documentos que computan; las NCE sin vínculo a ítems (servicio DESCUENTO u otras) van al bloque «no atribuible» con los importes de su cabecera (sin repartirlas).
      const prd = `
        itm AS (
          SELECT f.id AS doc_id, f.tipo, f.moneda, f.motivo, f.fecha_emision, x.ord,
                 nullif(btrim(x.e->>'dCodInt'), '') AS codigo, btrim(coalesce(x.e->>'dDesProSer', '')) AS descripcion, coalesce(x.e->>'cUniMed', '') AS unidad,
                 ${NUM("x.e->'dCantProSer'")} AS cant, ${NUM("x.e->'dTotOpeItem'")} AS monto, ${NUM("x.e->'dLiqIVAItem'")} AS iva
            FROM fil f CROSS JOIN LATERAL jsonb_array_elements(${ARREGLO("f.det")}) WITH ORDINALITY x(e, ord)
           WHERE f.situacion = 'COMPUTA' AND (f.tipo = 'FE' OR f.atribuible)
        ),
        prd AS (SELECT itm.*, CASE WHEN codigo IS NULL THEN descripcion END AS desc_clave FROM itm ${condPrd}),
        g AS (
          SELECT moneda, codigo, unidad, desc_clave, (array_agg(descripcion ORDER BY fecha_emision DESC, doc_id DESC, ord))[1] AS descripcion,
                 coalesce(sum(cant) FILTER (WHERE tipo = 'FE'), 0) AS cant_v, coalesce(sum(cant) FILTER (WHERE tipo = 'NCE' AND motivo = 2), 0) AS cant_d,
                 ${MEDIDAS("monto", "iva", "doc_id")}
            FROM prd GROUP BY moneda, codigo, unidad, desc_clave
        )`;
      totalFilas = num((await q(`SELECT count(*)::int AS n FROM g`, prd, extra))[0]?.n);
      const rows = await q(
        `SELECT g.moneda, coalesce(g.codigo, '') || '|' || g.unidad || '|' || coalesce(g.desc_clave, '') AS clave, g.codigo, g.descripcion, g.unidad, um.representacion,
                g.cant_v::text AS cant_v, g.cant_d::text AS cant_d, ${IMPORTES_TEXTO}
           FROM g ${um} ORDER BY (g.moneda <> 'PYG'), g.moneda, g.codigo NULLS LAST, g.descripcion, g.unidad, g.desc_clave NULLS FIRST
          LIMIT ${pe(extra.length + 1)} OFFSET ${pe(extra.length + 2)}`,
        prd, [...extra, limite, desplazamiento],
      );
      if (todas && rows.length > MAX_FILAS_EXPORTACION) return excede();

      grupos = rows.map((x) => ({
        clave: String(x.clave), etiqueta: x.codigo === null ? ETIQUETA_SIN_CODIGO : String(x.codigo), detalle: String(x.descripcion ?? ""), moneda: String(x.moneda),
        unidad: x.representacion ? `${x.representacion} · ${x.unidad}` : String(x.unidad), cantidadVendida: txt(x.cant_v), cantidadDevuelta: txt(x.cant_d), clienteId: null, ...importesDe(x),
      }));
      totalesProductos = (await q(
        `SELECT moneda, ${IMPORTES_TEXTO} FROM (SELECT moneda, ${MEDIDAS("monto", "iva", "doc_id")} FROM prd GROUP BY moneda) r ORDER BY ${ORDEN_MONEDA}`,
        prd, extra,
      )).map((x) => ({ moneda: String(x.moneda), ...importesDe(x) }));
      ajustesNoAtribuibles = (await q(
        `SELECT moneda, count(*)::int AS n, sum(tot)::text AS tot, sum(iva)::text AS iva, sum(tot - iva)::text AS sin
           FROM fil WHERE situacion = 'COMPUTA' AND tipo = 'NCE' AND NOT atribuible GROUP BY moneda ORDER BY ${ORDEN_MONEDA}`,
      )).map((x) => ({ moneda: String(x.moneda), documentos: num(x.n), conIva: String(x.tot), iva: String(x.iva), sinIva: String(x.sin) }));
    } else if (filtros.vista === "VENDEDORES" && !esq.vendedor) {
      // Sin NEX-074 no hay vendedor comercial confiable: la vista queda «No disponible por esquema» (no se agrupa por el emisor).
      totalFilas = 0;
    } else {
      // Expresiones de agrupación FIJAS (no provienen del usuario). Vendedores: vend_clave = ID del vendedor registrado o el estado (sin registro / FE fuera de alcance), sin abrir este último por vendedor.
      const def = {
        CLIENTES: {
          clave: "coalesce(cliente_id::text, 'SIN')",
          etiqueta: "CASE WHEN cliente_id IS NULL THEN 'Sin cliente vinculado' ELSE (array_agg(receptor_nombre ORDER BY fecha_emision DESC, id DESC))[1] END",
          detalle: "CASE WHEN cliente_id IS NULL THEN '' ELSE coalesce((array_agg(receptor_documento ORDER BY fecha_emision DESC, id DESC))[1], '') END",
          cliente: "cliente_id::text", grupo: "cliente_id", orden: "neto_orden DESC, clave",
        },
        VENDEDORES: {
          clave: "vend_clave",
          etiqueta: `CASE WHEN vend_estado = 'REGISTRADO' THEN (array_agg(vendedor_nombre ORDER BY fecha_emision DESC, id DESC))[1]
                          WHEN vend_estado = 'FUERA_ALCANCE' THEN '${ETIQUETA_VENDEDOR.FUERA_ALCANCE}' ELSE '${ETIQUETA_VENDEDOR.SIN_REGISTRO}' END`,
          detalle: "''", cliente: "NULL::text", grupo: "vend_clave, vend_estado", orden: "(clave IN ('SIN_REGISTRO', 'FUERA_ALCANCE')), etiqueta, clave",
        },
        MESES: {
          clave: "to_char(fecha_emision AT TIME ZONE 'America/Asuncion', 'YYYY-MM')", etiqueta: "to_char(fecha_emision AT TIME ZONE 'America/Asuncion', 'MM/YYYY')",
          detalle: "''", cliente: "NULL::text", grupo: "to_char(fecha_emision AT TIME ZONE 'America/Asuncion', 'YYYY-MM'), to_char(fecha_emision AT TIME ZONE 'America/Asuncion', 'MM/YYYY')", orden: "clave",
        },
      }[filtros.vista as "CLIENTES" | "VENDEDORES" | "MESES"];
      const grp = `
        grp AS (
          SELECT moneda, ${def.clave} AS clave, ${def.etiqueta} AS etiqueta, ${def.detalle} AS detalle, ${def.cliente} AS cliente_id, ${MEDIDAS("tot", "iva", "id")}
            FROM fil WHERE situacion = 'COMPUTA' GROUP BY moneda, ${def.grupo}
        ),
        grt AS (SELECT grp.*, (fe - nce) AS neto_orden FROM grp)`;
      totalFilas = num((await q(`SELECT count(*)::int AS n FROM grt`, grp))[0]?.n);
      const rows = await q(
        `SELECT moneda, clave, etiqueta, detalle, cliente_id, ${IMPORTES_TEXTO} FROM grt ORDER BY ${ORDEN_MONEDA}, ${def.orden} LIMIT ${pe(1)} OFFSET ${pe(2)}`,
        grp, [limite, desplazamiento],
      );
      if (todas && rows.length > MAX_FILAS_EXPORTACION) return excede();

      grupos = rows.map((x) => ({
        clave: `${x.moneda}|${x.clave}`, etiqueta: String(x.etiqueta ?? ""), detalle: String(x.detalle ?? ""), moneda: String(x.moneda), unidad: "",
        cantidadVendida: null, cantidadDevuelta: null, clienteId: txt(x.cliente_id), ...importesDe(x),
      }));
    }

    const vendedores = esq.vendedor
      ? ((await c.query(
          `SELECT v.vendedor_id::text AS id, (array_agg(v.vendedor_nombre ORDER BY d.fecha_emision DESC, d.id DESC))[1] AS nombre
             FROM documento_electronico_vendedor v JOIN documentos_electronicos d ON d.empresa_id = v.empresa_id AND d.id = v.documento_id
            WHERE v.empresa_id = $1 AND sucursal_en_alcance($1::uuid, $2::uuid, d.sucursal_id) GROUP BY v.vendedor_id ORDER BY 2, 1`,
          [empresaId, usuarioId],
        )).rows as { id: string; nombre: string }[])
      : [];
    const cliente = filtros.clienteId
      ? ((await c.query(
          `SELECT d.cliente_id::text AS id, d.receptor_nombre AS nombre FROM documentos_electronicos d
            WHERE d.empresa_id = $1 AND d.cliente_id = $3::uuid AND sucursal_en_alcance($1::uuid, $2::uuid, d.sucursal_id) ORDER BY d.fecha_emision DESC, d.id DESC LIMIT 1`,
          [empresaId, usuarioId, filtros.clienteId],
        )).rows[0] as { id: string; nombre: string } | undefined) ?? null
      : null;
    const emp = (await c.query(`SELECT razon_social AS nombre FROM empresas WHERE id = $1`, [empresaId])).rows[0];
    const ahora = (await c.query(`SELECT to_char(now() AT TIME ZONE 'America/Asuncion', 'DD/MM/YYYY HH24:MI') AS t, to_char(now() AT TIME ZONE 'America/Asuncion', 'YYYYMMDD-HH24MI') AS f`)).rows[0];

    return {
      empresa: { nombre: String(emp?.nombre ?? "") },
      generado: ahora.t,
      sello: ahora.f,
      filtros,
      pagina: { numero: pagina, tamano, totalFilas },
      esquema: { vendedor: esq.vendedor, nceDescuento: esq.nceDescuento },
      resumen, estados, anomalias, documentos, totalesDocumentos, grupos, totalesProductos, ajustesNoAtribuibles,
      catalogos: { sucursales, vendedores, cliente },
      avisos: avisosVentas(filtros, esq, anomalias),
      cobertura: COBERTURA_VENTAS,
    } satisfies VentasRespuesta;
  });
}

/** Avisos objetivos de conciliación y cobertura (pantalla, Excel y PDF). */
export function avisosVentas(f: VentasFiltros, esq: { vendedor: boolean; nceDescuento: boolean }, anomalias: VentasAnomalia[]): string[] {
  const out: string[] = [];
  const nAnom = anomalias.reduce((a, x) => a + x.documentos, 0);
  const inconsist = anomalias.filter((a) => a.motivo === "NCE_FE_NO_APROBADA").reduce((a, x) => a + x.documentos, 0);

  if (nAnom > 0) out.push(`Hay ${nAnom} documento(s) aprobado(s) sin información fiscal conciliable: NO están incluidos en los indicadores y se informan aparte con su monto (no como cero).`);
  if (inconsist > 0) out.push(`${ETIQUETA_ANOMALIA.NCE_FE_NO_APROBADA}: ${inconsist} NCE. Sus importes no se restan para no producir un neto engañoso; requiere revisión fiscal.`);
  if (f.tipo) out.push(`Filtro por tipo (${f.tipo === "FE" ? "solo facturas" : "solo notas de crédito"}): la venta neta mostrada no es la venta neta total del período.`);
  if (f.q || f.clienteId || f.vendedor) out.push("Subconjunto filtrado (búsqueda, cliente o vendedor): los indicadores corresponden solo a los documentos filtrados.");
  if (f.vista === "PRODUCTOS" && f.producto) out.push(`Filtro por producto: el subtotal de productos NO concilia con el total de la empresa; «${ETIQUETA_AJUSTE_NO_ATRIBUIBLE}» se muestra aparte.`);
  if (f.vista === "DOCUMENTOS" && (f.estado || f.situacion !== "TODAS")) out.push("Los filtros de estado y situación solo afectan la lista de documentos; los indicadores del período no cambian.");
  if (!esq.vendedor) out.push("Vendedor comercial no disponible por esquema (NEX-074 no aplicada): la vista y el filtro por vendedor no están disponibles; no se usa el usuario emisor en su lugar.");
  if (!esq.nceDescuento) out.push("Estructura de NCE de servicio DESCUENTO (NEX-070) no disponible: una NCE sin líneas acreditadas que concilien con su total se informa como anomalía (no se presume descuento); las NCE con líneas que no se vinculan ítem por ítem van a ajustes no atribuibles.");

  return out;
}
