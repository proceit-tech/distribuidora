import { esFaseXmlFirmado } from "@/lib/facturacion/estados";
import { type ResultadoConsulta } from "@/lib/facturacion/gateway";

/**
 * Decide (puro) si el resultado de una consulta puede fijar el estado fiscal del documento (RN-E2-08). La aprobación o el rechazo son del gateway/SIFEN: Nexit solo los
 * ACEPTA cuando la respuesta se asocia al documento de forma confiable y no contradice lo ya registrado.
 *  · PRO-342-R03-01 (regla fiscal definitiva del responsable): un XML firmado SIEMPRE tiene CDC. Por eso un estado FINAL (aprobado, rechazado, cancelado, inutilizado) solo se acepta si el
 *    documento tiene un CDC auténtico informado por la API: el de esta respuesta o uno ya registrado antes para el MISMO documento (la respuesta final no necesita repetirlo). Nunca se
 *    registra un final con CDC NULL. «XML firmado» sin CDC (ni registrado) tampoco prueba la firma: es una respuesta inconsistente (RESPUESTA_INVALIDA), queda como evidencia y el documento
 *    sigue en seguimiento. PRO-342-R04: esto vale aunque el documento YA tenga CDC — el CDC debe venir en la respuesta «XML firmado» actual. El CDC nunca se calcula, completa ni inventa. Este bloqueo ocurre ANTES de llamar a cualquier función SQL (incluida la firma antigua NEX-054, que no lo tiene).
 *    HTTP 200 sin estado nunca es final; «XML firmado» con CDC es intermedio (PENDIENTE) y no es aprobación.
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
  // PRO-342-R03-01: sin CDC disponible para el documento (ni en la respuesta ni registrado) no se consolida un final ni se confirma la firma del XML.
  const sinCdc = r.cdc === null && doc.cdc === null;

  if (sinCdc && FINALES.has(r.estadoSifen)) {
    return invalida(r, `La consulta informa «${r.estadoGateway ?? r.estadoSifen}» sin CDC para este documento (ni en la respuesta ni registrado): no se consolida el resultado fiscal y se continúa el seguimiento.`);
  }
  // PRO-342-R04-F01: «XML firmado» exige CDC en la RESPUESTA ACTUAL, aunque el documento ya tenga un CDC registrado. Sin él, esta respuesta no acredita la firma: queda como
  // RESPUESTA_INVALIDA (evidencia), el CDC previo se conserva intacto y el seguimiento continúa. Un final posterior sí puede omitir el CDC si ya está registrado (regla anterior).
  if (r.cdc === null && esFaseXmlFirmado(r.estadoGateway)) {
    return invalida(r, "CDC ausente en XML firmado: la respuesta actual informa «XML firmado» sin CDC, no se confirma la firma, se conserva el CDC registrado (si existe) y se continúa el seguimiento.");
  }
  // Un CDC informado que no corresponde al documento (o distinto del registrado) no se toma como final: la función SQL lo anota como CDC_DIVERGENTE (el CDC registrado nunca se sobrescribe).
  return r;
}
