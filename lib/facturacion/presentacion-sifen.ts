/**
 * PRO-338 — Presentación del estado fiscal en Documentos electrónicos. Módulo PURO: deriva SOLO lo que se muestra; nunca escribe ni reinterpreta estado_sifen (la verdad fiscal sigue siendo
 * la persistida por fe_documento_registrar_consulta / _flujo_nce tras decidirConsulta y las guardas NEX-054). Los filtros e indicadores siguen usando el estado real (SQL_GRUPO), no este tono.
 *
 *  · verde  «Aprobado» / rojo «Rechazado»: solo si el estado PERSISTIDO es ese (rechazo fiscal confirmado y correlacionado; nunca el texto crudo de una respuesta divergente).
 *  · amarillo «Pendiente de confirmación»: enviado (o envío indeterminado) sin resultado fiscal final, aunque todavía no se haya consultado.
 *  · gris «Aún sin transmitir» / «Sin información»: documento no transmitido.
 *  · Cancelado / Inutilizado: estados propios, tono neutro oscuro (no se presentan como rechazo).
 * Las anomalías técnicas de la ÚLTIMA consulta (CDC divergente, errores HTTP, tiempo de espera, red, respuesta inválida, no encontrado) van en un aviso aparte, nunca en el badge fiscal.
 */
import { ETIQUETA_RESULTADO_INTENTO, ETIQUETA_SIFEN, type EstadoLocal, type EstadoSifen } from "@/lib/facturacion/estados";

export type TonoSifen = "aprobado" | "rechazado" | "pendiente" | "sinTransmitir" | "anulado";
export type PresentacionSifen = { tono: TonoSifen; texto: string; detalle: string };
export type AlertaConsulta = { tipo: "inconsistencia" | "tecnica"; texto: string; detalle: string };

const TRANSMITIDO: readonly string[] = ["ENVIADO", "ENVIO_INDETERMINADO"];
const NO_FINAL: readonly string[] = ["SIN_CONSULTA", "PENDIENTE", "NO_RECONOCIDO"];

export function presentacionSifen(d: { estadoLocal: EstadoLocal; estadoSifen: EstadoSifen }): PresentacionSifen {
  const registrado = ETIQUETA_SIFEN[d.estadoSifen] ?? d.estadoSifen;

  if (d.estadoSifen === "APROBADO") return { tono: "aprobado", texto: "Aprobado", detalle: "Resultado fiscal aprobado, registrado para este documento." };
  if (d.estadoSifen === "RECHAZADO") return { tono: "rechazado", texto: "Rechazado", detalle: "Rechazo fiscal confirmado y registrado para este documento." };
  if (d.estadoSifen === "CANCELADO" || d.estadoSifen === "INUTILIZADO") return { tono: "anulado", texto: registrado, detalle: `Estado fiscal registrado: ${registrado}.` };

  if (NO_FINAL.includes(d.estadoSifen) && TRANSMITIDO.includes(d.estadoLocal)) {
    return { tono: "pendiente", texto: "Pendiente de confirmación", detalle: `Enviado sin resultado fiscal final confirmado (estado registrado: ${registrado}).` };
  }

  return d.estadoLocal === "ENVIANDO"
    ? { tono: "sinTransmitir", texto: "Sin información", detalle: "Envío en curso: todavía no hay información fiscal verificable." }
    : { tono: "sinTransmitir", texto: "Aún sin transmitir", detalle: "El documento todavía no fue recibido por el gateway: no hay información fiscal." };
}

/** Aviso técnico de la ÚLTIMA consulta registrada (ultima_consulta_resultado). Si la última fue satisfactoria (OK) o no hubo consultas, no hay aviso: una alerta antigua no se muestra como actual. */
export function alertaConsulta(d: { ultimaConsultaResultado: string | null }): AlertaConsulta | null {
  const r = d.ultimaConsultaResultado;

  if (!r || r === "OK") return null;

  if (r === "CDC_DIVERGENTE") {
    return {
      tipo: "inconsistencia",
      texto: "Inconsistencia de consulta: CDC distinto del registrado",
      detalle: "La última consulta devolvió un CDC que no corresponde al registrado para este documento: su respuesta NO se tomó como resultado fiscal. Ver mensaje, CDC informado, fecha y JSON en el historial.",
    };
  }

  return {
    tipo: "tecnica",
    texto: `Consulta con error técnico: ${ETIQUETA_RESULTADO_INTENTO[r] ?? r}`,
    detalle: "La última consulta no obtuvo una respuesta fiscal válida; el estado fiscal no se modificó. Ver detalle en el historial.",
  };
}
