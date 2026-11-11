import { type ResultadoConsulta } from "@/lib/facturacion/gateway";

/**
 * Decide (puro) si el resultado de una consulta puede fijar el estado fiscal del documento (RN-E2-08). La aprobación o el rechazo son del gateway/SIFEN: Nexit solo los
 * ACEPTA cuando la respuesta se asocia al documento de forma confiable y no contradice lo ya registrado.
 *  · PRO-342-R03: un estado FINAL (aprobado, rechazado, cancelado, inutilizado) informado EXPRESAMENTE por la API de consulta del documento solicitado se registra aunque la respuesta
 *    todavía no traiga CDC (el CDC queda NULL: nunca se inventa ni se calcula). Si la respuesta trae un CDC que no corresponde al documento, no se toma como final (CDC_DIVERGENTE en la SQL).
 *    HTTP 200 sin estado o «XML firmado» (PENDIENTE) nunca son finales.
 *  · Un estado final ya registrado no retrocede a transitorio ni cambia a otro final (solo APROBADO → CANCELADO es una evolución legítima). La contradicción queda como evidencia.
 *  · Un CDC informado que contradice el documento no se toca aquí: la función SQL lo anota como CDC_DIVERGENTE sin modificar el documento.
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
  // PRO-342-R03: un final con CDC informado que no corresponde al documento NO se registra como final: la función SQL lo anota como CDC_DIVERGENTE (el CDC registrado nunca se sobrescribe).
  // Un final SIN CDC en la respuesta pasa tal cual (CDC NULL): la ausencia de CDC no anula el resultado que la API informó para este documento.
  return r;
}
