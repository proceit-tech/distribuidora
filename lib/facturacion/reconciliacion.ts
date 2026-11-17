import { type ResultadoConsulta } from "@/lib/facturacion/gateway";

/**
 * Decide (puro) si el resultado de una consulta puede fijar el estado fiscal del documento (RN-E2-08). La aprobación o el rechazo son del gateway/SIFEN: Nexit solo los
 * ACEPTA cuando la respuesta se asocia al documento de forma confiable y no contradice lo ya registrado.
 *  · PRO-342-R05 (regla definitiva del responsable): NEXIT NO valida el CDC. El estado fiscal informado por la API para el documento solicitado (cuenta autenticada + tipo, establecimiento,
 *    punto, número y serie) se registra SIN condicionarlo al CDC: con CDC ausente, de cualquier forma, o distinto del registrado. Las reglas R03-01/R04-F01 (final o «XML firmado» exigen CDC)
 *    quedan REVOCADAS. El CDC nunca se calcula, completa ni inventa: la SQL (NEX-080) guarda el literal informado y proyecta el último informado en el documento, con traza del cambio.
 *  · HTTP 200 sin estado nunca es final (lo resuelve interpretarConsulta); «XML firmado» es intermedio (PENDIENTE), no es aprobación, y el worker sigue consultando el mismo documento.
 *  · Guarda INDEPENDIENTE del CDC que se conserva: un estado final ya registrado no retrocede a transitorio ni cambia a otro final (solo APROBADO → CANCELADO es una evolución legítima).
 *    La contradicción queda como evidencia (RESPUESTA_INVALIDA) y no modifica el documento.
 */

export type DocumentoReconciliable = { tipo: string; establecimiento: string; puntoExpedicion: string; numero: string; cdc: string | null; estadoSifen: string | null };

const FINALES = new Set(["APROBADO", "RECHAZADO", "CANCELADO", "INUTILIZADO"]);
const EVOLUCIONES: Record<string, readonly string[]> = { APROBADO: ["APROBADO", "CANCELADO"], RECHAZADO: ["RECHAZADO"], CANCELADO: ["CANCELADO"], INUTILIZADO: ["INUTILIZADO"] };

const invalida = (r: ResultadoConsulta, mensaje: string): ResultadoConsulta => ({ ...r, resultado: "RESPUESTA_INVALIDA", estadoSifen: null, mensaje });

export function decidirConsulta(doc: DocumentoReconciliable, r: ResultadoConsulta): ResultadoConsulta {
  if (r.resultado !== "OK" || r.estadoSifen === null) return r;

  const previo = doc.estadoSifen;

  if (previo && FINALES.has(previo) && !(EVOLUCIONES[previo] ?? []).includes(r.estadoSifen)) {
    return invalida(r, `La consulta informa «${r.estadoSifen}» pero el documento ya figura como «${previo}»: la respuesta contradice el estado fiscal registrado y no lo modifica.`);
  }

  // PRO-342-R05: sin bloqueos por CDC (ausente, forma o distinto del registrado). El CDC informado, si lo hay, viaja literal a la SQL.
  return r;
}
