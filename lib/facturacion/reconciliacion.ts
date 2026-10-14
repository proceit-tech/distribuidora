import { cdcCoherente, type ResultadoConsulta } from "@/lib/facturacion/gateway";

/**
 * Decide (puro) si el resultado de una consulta puede fijar el estado fiscal del documento (RN-E2-08). La aprobación o el rechazo son del gateway/SIFEN: Nexit solo los
 * ACEPTA cuando la respuesta se asocia al documento de forma confiable y no contradice lo ya registrado.
 *  · Un estado FINAL (aprobado, rechazado, cancelado, inutilizado) exige un CDC coherente con la identidad del documento (el informado en la respuesta o el ya guardado). Sin él, la
 *    respuesta queda como evidencia RESPUESTA_INVALIDA y el estado fiscal NO cambia.
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
  if (FINALES.has(r.estadoSifen)) {
    if (r.cdc !== null && !cdcCoherente({ tipo: doc.tipo, establecimiento: doc.establecimiento, puntoExpedicion: doc.puntoExpedicion, numero: doc.numero }, r.cdc)) return r; // la función SQL lo anota como CDC_DIVERGENTE

    const identificado = r.cdc !== null || (doc.cdc !== null && cdcCoherente({ tipo: doc.tipo, establecimiento: doc.establecimiento, puntoExpedicion: doc.puntoExpedicion, numero: doc.numero }, doc.cdc));

    if (!identificado) return invalida(r, `La consulta informa «${r.estadoSifen}» sin un CDC que identifique el documento: no se registra el estado fiscal hasta confirmarlo.`);
  }

  return r;
}
