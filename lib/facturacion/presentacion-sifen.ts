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
import { ESTADOS_LOCAL_TRANSMITIDO, ESTADOS_SIFEN_SIN_FINAL, ETIQUETA_RESULTADO_INTENTO, ETIQUETA_SIFEN, type EstadoLocal, type EstadoSifen } from "@/lib/facturacion/estados";

export type TonoSifen = "aprobado" | "rechazado" | "pendiente" | "sinTransmitir" | "anulado";
export type PresentacionSifen = { tono: TonoSifen; texto: string; detalle: string };
export type AlertaConsulta = { tipo: "inconsistencia" | "tecnica"; texto: string; detalle: string };

export function presentacionSifen(d: { estadoLocal: EstadoLocal; estadoSifen: EstadoSifen }): PresentacionSifen {
  const registrado = ETIQUETA_SIFEN[d.estadoSifen] ?? d.estadoSifen;

  if (d.estadoSifen === "APROBADO") return { tono: "aprobado", texto: "Aprobado", detalle: "Resultado fiscal aprobado, registrado para este documento." };
  if (d.estadoSifen === "RECHAZADO") return { tono: "rechazado", texto: "Rechazado", detalle: "Rechazo fiscal confirmado y registrado para este documento." };
  if (d.estadoSifen === "CANCELADO" || d.estadoSifen === "INUTILIZADO") return { tono: "anulado", texto: registrado, detalle: `Estado fiscal registrado: ${registrado}.` };

  // PRO-338-R02: el mismo conjunto que el indicador PEND_RESPUESTA (estados.ts).
  if (ESTADOS_SIFEN_SIN_FINAL.includes(d.estadoSifen) && ESTADOS_LOCAL_TRANSMITIDO.includes(d.estadoLocal)) {
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

/** Campos de un intento del historial que usa el resumen de consultas (los devuelve listarIntentos / listarIntentosPagina). */
export type IntentoConsulta = { tipo: string; resultado: string; creadoAt: string; httpStatus: number | null; estadoGateway: string | null; codRespuesta: string | null; mensaje: string | null; cdcInformado: string | null; cdcRespuesta?: string | null };

/**
 * PRO-338-R02 (AUD-R01 F003): separa la ÚLTIMA RESPUESTA FISCAL VÁLIDA (consulta con resultado OK) del ÚLTIMO INTENTO DE CONSULTA (cualquier resultado, p. ej. CDC_DIVERGENTE o ERROR_HTTP), a partir del
 * historial cargado (más reciente primero). Nada se reemplaza: si la consulta válida no está en las páginas cargadas, `valida` es null y la pantalla lo dice. Los envíos no cuentan.
 */
export function resumenConsultas<T extends IntentoConsulta>(intentos: readonly T[]): { valida: T | null; ultima: T | null } {
  const consultas = intentos.filter((i) => i.tipo === "CONSULTA");

  return { valida: consultas.find((i) => i.resultado === "OK") ?? null, ultima: consultas[0] ?? null };
}

/** CDC que informó el gateway en un intento y su FUENTE: la columna estructurada (cdc_informado) o, si está vacía, el JSON de respuesta saneado. */
export function cdcDeIntento(i: Pick<IntentoConsulta, "cdcInformado" | "cdcRespuesta">): { cdc: string; fuente: "columna" | "json" } | null {
  if (i.cdcInformado) return { cdc: i.cdcInformado, fuente: "columna" };
  if (i.cdcRespuesta) return { cdc: i.cdcRespuesta, fuente: "json" };

  return null;
}
