/**
 * PRO-365-R02-C02 — Textos de PRIMERA CAPA (operador) de «Documentos electrónicos». Módulo PURO de presentación: sin React, sin red, sin escritura.
 *
 * Dos capas reales:
 *  · PRIMERA CAPA (este módulo): tooltip de los iconos, encabezado del detalle fiscal, motivo del rechazo, aviso breve, eventos, ayudas y mensajes tras una acción.
 *    Castellano claro y breve, sin «gateway», «ACK», «API», «HTTP» ni nombres de enums.
 *  · SEGUNDA CAPA (historial técnico): sigue usando IconoEstado.texto, seguimientoFiscal, alertaConsulta.detalle, eventosFila y el historial de intentos SIN cambios.
 *
 * No clasifica nada de nuevo: los iconos siguen saliendo de iconosEstado(d) (símbolo, color y posición intactos) y este módulo solo pone NOMBRE a lo que ya se derivó.
 * Reglas de seguridad: «Enviado» nunca significa aprobado; un envío indeterminado nunca se llama «Enviado»; «Código del documento registrado» no afirma XML ni PDF;
 * un código o mensaje de rechazo (p. ej. 1109) nunca convierte el documento en Inutilizado o Cancelado; el estado fiscal sale SOLO del estado persistido.
 */
import { ESTADOS_LOCAL_TRANSMITIDO, type EstadoEmail, type EstadoLocal, type EstadoSifen } from "@/lib/facturacion/estados";
import type { ElegibilidadCancelacion, ProyeccionEventosFe } from "@/lib/facturacion/eventos-fe";
import { NOMBRE_EJE, type AlertaConsulta, type IconoEstado, type SimboloEstado, type TonoIcono } from "@/lib/facturacion/presentacion-sifen";

type DocOperador = { estadoLocal: EstadoLocal; estadoSifen: EstadoSifen; estadoEmail: EstadoEmail; eventosFe?: ProyeccionEventosFe | null };

/** Envío: un nombre distinto por estado; ENVIO_INDETERMINADO y ERROR_ENVIO nunca se llaman «Enviado». */
export const TEXTO_ENVIO_OPERADOR: Record<EstadoLocal, string> = {
  ENVIADO: "Enviado",
  ENVIANDO: "Enviando",
  PENDIENTE_ENVIO: "Pendiente de envío",
  ENVIO_INDETERMINADO: "No se pudo confirmar el envío",
  ERROR_ENVIO: "Error al enviar",
};

/** Correo: cinco estados con nombre propio; SIN_EMAIL y NO_INFORMADO no se confunden ni se deduce que el correo se envió o no. */
export const TEXTO_CORREO_OPERADOR: Record<EstadoEmail, string> = {
  ENVIADO: "Correo enviado",
  PENDIENTE: "Correo pendiente",
  ERROR: "Error al enviar correo",
  SIN_EMAIL: "Sin correo",
  NO_INFORMADO: "Sin información de correo",
};

/** XML/CDC según el símbolo que ya decidió iconosEstado (no se reevalúa el CDC). */
const TEXTO_XML_OPERADOR: Partial<Record<SimboloEstado, string>> = {
  archivoCheck: "Código del documento registrado",
  archivoReloj: "Código del documento pendiente",
  archivoAlerta: "Revisar información del documento",
};

function textoSifen(i: IconoEstado, d: DocOperador): string {
  switch (d.estadoSifen) {
    case "APROBADO":
      // Cancelación ACREDITADA por evento (misma regla que estadoPrincipalFila): el icono sigue verde por el estado persistido, el texto deja claro que ya no está vigente.
      return d.eventosFe?.situacion === "CANCELADO" ? "Aprobado, luego cancelado" : "Aprobado";
    case "RECHAZADO":
      return "Rechazado";
    case "CANCELADO":
      return "Cancelado";
    case "INUTILIZADO":
      return "Inutilizado";
    default:
      if (i.simbolo === "reloj") return d.estadoSifen === "NO_RECONOCIDO" ? "Sin resultado confirmado" : "Pendiente de respuesta";

      return "Sin información";
  }
}

/** Tooltip visual (texto) y nombre accesible (etiqueta: antepone el eje para desambiguar en lectores de pantalla). El tooltip de Envío ENVIADO es EXACTAMENTE «Enviado». */
export function textoIconoOperador(i: IconoEstado, d: DocOperador): { texto: string; etiqueta: string } {
  const texto =
    i.eje === "envio"
      ? TEXTO_ENVIO_OPERADOR[d.estadoLocal] ?? "Pendiente de envío"
      : i.eje === "xml"
        ? TEXTO_XML_OPERADOR[i.simbolo] ?? "Código del documento pendiente"
        : i.eje === "sifen"
          ? textoSifen(i, d)
          : TEXTO_CORREO_OPERADOR[d.estadoEmail] ?? "Sin información de correo";

  return { texto, etiqueta: `${NOMBRE_EJE[i.eje]}: ${texto}` };
}

/**
 * Encabezado del Detalle fiscal: UN estado claro, derivado solo del estado persistido (y de la cancelación acreditada por evento, la misma proyección que ya usa la fila).
 * Nunca se deduce del texto del mensaje: un 1109 «inutilizado anteriormente» con estado RECHAZADO sigue siendo «Rechazado».
 */
export type EncabezadoFiscal = { titulo: string; tono: TonoIcono; simbolo: SimboloEstado; nota: string | null };

export function encabezadoFiscal(d: { estadoLocal: EstadoLocal; estadoSifen: EstadoSifen; eventosFe?: ProyeccionEventosFe | null }): EncabezadoFiscal {
  switch (d.estadoSifen) {
    case "APROBADO":
      return d.eventosFe?.situacion === "CANCELADO"
        ? { titulo: "Cancelado", tono: "neutro", simbolo: "prohibido", nota: "Fue aprobado y luego cancelado. La aprobación original se conserva en el historial." }
        : { titulo: "Aprobado", tono: "ok", simbolo: "check", nota: null };
    case "RECHAZADO":
      return { titulo: "Rechazado", tono: "error", simbolo: "cruz", nota: null };
    case "CANCELADO":
      return { titulo: "Cancelado", tono: "neutro", simbolo: "prohibido", nota: null };
    case "INUTILIZADO":
      return { titulo: "Inutilizado", tono: "neutro", simbolo: "prohibido", nota: null };
    default:
      break;
  }

  if (ESTADOS_LOCAL_TRANSMITIDO.includes(d.estadoLocal)) {
    return d.estadoSifen === "NO_RECONOCIDO" || d.estadoLocal === "ENVIO_INDETERMINADO"
      ? { titulo: "Sin resultado confirmado", tono: "aviso", simbolo: "alerta", nota: null }
      : { titulo: "Pendiente de respuesta", tono: "aviso", simbolo: "reloj", nota: null };
  }

  switch (d.estadoLocal) {
    case "ENVIANDO":
      return { titulo: "Enviando", tono: "aviso", simbolo: "reloj", nota: null };
    case "ERROR_ENVIO":
      return { titulo: "Error al enviar", tono: "error", simbolo: "cruz", nota: "No es un rechazo de SIFEN." };
    default:
      return { titulo: "Sin enviar", tono: "neutro", simbolo: "guion", nota: null };
  }
}

/**
 * Fila de respuesta de la primera capa. Ya NO hay un «Mensaje» incondicional:
 *  · RECHAZADO persistido ⇒ «Motivo del rechazo» con el código y el mensaje TAL COMO se registraron (o «Motivo no informado», sin inventar).
 *  · Cualquier otro estado ⇒ sin fila: un mensaje registrado no se presenta como resultado vigente (p. ej. un rechazo viejo junto a «Aprobado»).
 *    Si el documento aún no tiene resultado final y hay un mensaje registrado, solo se avisa que existe y dónde verlo (historial técnico).
 */
export type RespuestaFiscal = { motivo: { etiqueta: string; valor: string } | null; notaHistorial: string | null };

export const MOTIVO_NO_INFORMADO = "Motivo no informado";
export const NOTA_MENSAJES_HISTORIAL = "Hay respuestas anteriores registradas. Se ven en el historial técnico.";

export function respuestaFiscal(d: { estadoSifen: EstadoSifen }, fiscal: { mensaje: string | null; rechazo: boolean }): RespuestaFiscal {
  if (fiscal.rechazo) return { motivo: { etiqueta: "Motivo del rechazo", valor: fiscal.mensaje ?? MOTIVO_NO_INFORMADO }, notaHistorial: null };

  const final = d.estadoSifen === "APROBADO" || d.estadoSifen === "CANCELADO" || d.estadoSifen === "INUTILIZADO";

  return { motivo: null, notaHistorial: !final && fiscal.mensaje ? NOTA_MENSAJES_HISTORIAL : null };
}

/** Aviso breve de la fila y del detalle (quinto icono). El texto técnico completo (alertaConsulta.texto/detalle) queda en el historial técnico. */
export function avisoOperador(alerta: AlertaConsulta | null, requiereRevision: boolean | undefined, tipo: string): string {
  return [
    alerta ? (alerta.tipo === "inconsistencia" ? "Hay un registro anterior de consulta para revisar; el estado no cambió." : "La última consulta no obtuvo una respuesta válida; el estado no cambió.") : "",
    requiereRevision ? `Lleva mucho tiempo sin resultado definitivo; no se reenvía${tipo === "NCE" ? " ni se libera el saldo" : ""}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Columna Eventos en primera capa: situación acreditada con nombre llano y la operación en una frase corta (el motivo completo sigue en el historial técnico). */
export function eventosOperador(d: { estadoSifen: EstadoSifen; eventosFe?: ProyeccionEventosFe | null }, cancelacion: ElegibilidadCancelacion): { registrado: string | null; operacion: string } {
  const registrado =
    d.estadoSifen === "CANCELADO" ? "Cancelado" : d.estadoSifen === "INUTILIZADO" ? "Inutilizado" : d.eventosFe && d.eventosFe.situacion !== "SIN_INFORMACION" ? d.eventosFe.texto : null;
  const operacion = cancelacion.aplica ? `Cancelación: ${cancelacion.corto.toLowerCase()}. Inutilización: no disponible.` : "Cancelación e inutilización no disponibles.";

  return { registrado, operacion };
}

/** Ayuda de las acciones sin operación en Nexit (el motivo técnico queda en documentos-tabla y en el historial técnico). */
export const AYUDA_ACCION_NO_DISPONIBLE: Record<"xml" | "correo", string> = { xml: "Descarga no disponible.", correo: "Envío no disponible." };

/** Mensaje breve tras «Consultar estado». El resultado técnico completo (HTTP, mensaje crudo) queda en el historial de consultas. */
export function textoConsultaOperador(resultado: string, continuidad?: string): string {
  const base =
    resultado === "OK"
      ? "Consulta realizada. El estado se actualiza en el listado."
      : resultado === "NO_ENCONTRADO"
        ? "El servicio de facturación no encontró el documento; el estado no cambió."
        : "No se obtuvo una respuesta válida; el estado no cambió. Puede volver a consultar más tarde.";
  // Advertencia de seguridad conservada: la cuenta usada para consultar no se pudo comprobar.
  const aviso = continuidad === "SIN_REFERENCIA" ? " Aviso: no se pudo comprobar que la consulta usara la misma cuenta del envío." : "";

  return base + aviso;
}

/**
 * Mensaje breve tras «Enviar documento», decidido por el estado local que devolvió el servidor (no por el texto). Un envío no confirmado NUNCA se informa como «Enviado»
 * y advierte no reenviar sin verificar. Los errores de datos se muestran tal cual (son útiles para corregir). Lote, HTTP y respuesta completa quedan en el historial técnico.
 */
export function textoEnvioOperador(r: { resultado: string; estadoLocal?: string | null; errores: readonly string[]; mensaje: string | null }): string {
  if (r.resultado === "YA_ENVIADO") return "Este documento ya fue enviado; no se reenvía.";
  if (r.estadoLocal === "ENVIADO") return "Enviado. Falta la respuesta de SIFEN.";
  if (r.estadoLocal === "ERROR_ENVIO") return ["Error al enviar.", r.mensaje ?? "", ...r.errores].filter(Boolean).join(" ");

  return "No se pudo confirmar el envío. No lo reenvíe sin verificar antes con el proveedor de facturación.";
}
