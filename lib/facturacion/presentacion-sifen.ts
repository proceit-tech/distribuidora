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
import { esFaseXmlFirmado, ESTADOS_LOCAL_TRANSMITIDO, ESTADOS_SIFEN_FINALES, ESTADOS_SIFEN_SIN_FINAL, ETIQUETA_LOCAL, ETIQUETA_RESULTADO_INTENTO, ETIQUETA_SIFEN, type EstadoLocal, type EstadoSifen } from "@/lib/facturacion/estados";

export type TonoSifen = "aprobado" | "rechazado" | "pendiente" | "sinTransmitir" | "anulado";
export type PresentacionSifen = { tono: TonoSifen; texto: string; detalle: string };
export type AlertaConsulta = { tipo: "inconsistencia" | "tecnica"; texto: string; detalle: string };

export function presentacionSifen(d: { estadoLocal: EstadoLocal; estadoSifen: EstadoSifen; estadoGatewayTexto?: string | null; ultimaConsultaAt?: string | null }): PresentacionSifen {
  const registrado = ETIQUETA_SIFEN[d.estadoSifen] ?? d.estadoSifen;

  if (d.estadoSifen === "APROBADO") return { tono: "aprobado", texto: "Aprobado", detalle: "Resultado fiscal aprobado, registrado para este documento." };
  if (d.estadoSifen === "RECHAZADO") return { tono: "rechazado", texto: "Rechazado", detalle: "Rechazo fiscal confirmado y registrado para este documento." };
  if (d.estadoSifen === "CANCELADO" || d.estadoSifen === "INUTILIZADO") return { tono: "anulado", texto: registrado, detalle: `Estado fiscal registrado: ${registrado}.` };

  // PRO-338-R02: el mismo conjunto que el indicador PEND_RESPUESTA (estados.ts).
  if (ESTADOS_SIFEN_SIN_FINAL.includes(d.estadoSifen) && ESTADOS_LOCAL_TRANSMITIDO.includes(d.estadoLocal)) {
    // PRO-342-R01: «XML firmado» es la fase intermedia del gateway; «Sin consultar» con una consulta técnica ya hecha se dice tal cual (la consulta existió pero no dio estado válido).
    const fase = esFaseXmlFirmado(d.estadoGatewayTexto) ? " El gateway informó «XML firmado»: fase intermedia, todavía sin decisión SIFEN." : "";
    const consultado = d.estadoSifen === "SIN_CONSULTA" && d.ultimaConsultaAt ? " Ya se consultó técnicamente al gateway, sin un estado fiscal válido todavía." : "";

    return { tono: "pendiente", texto: "Pendiente de confirmación", detalle: `Enviado sin resultado fiscal final confirmado (estado registrado: ${registrado}).${fase}${consultado} Se sigue consultando automáticamente hasta «Aprobado» o «Rechazado».` };
  }

  return d.estadoLocal === "ENVIANDO"
    ? { tono: "sinTransmitir", texto: "Sin información", detalle: "Envío en curso: todavía no hay información fiscal verificable." }
    : { tono: "sinTransmitir", texto: "Aún sin transmitir", detalle: "El documento todavía no fue recibido por el gateway: no hay información fiscal." };
}

/**
 * Aviso técnico de la ÚLTIMA consulta registrada (ultima_consulta_resultado). Si la última fue satisfactoria (OK) o no hubo consultas, no hay aviso: una alerta antigua no se muestra como actual.
 * PRO-338-R03 — CDC_DIVERGENTE según el CDC REGISTRADO del documento (`cdc`):
 *  · sin CDC registrado (NULL, lo normal antes de la primera consulta válida): no se afirma que exista uno; la SQL solo marca la divergencia si el CDC informado no corresponde a la
 *    identidad fiscal del documento (tipo, establecimiento, punto, número) o no es un CDC válido;
 *  · con CDC registrado: ese CDC ya es coherente con la identidad (CHECK de NEX-047), así que el informado es necesariamente distinto del previamente registrado; NO se sobrescribe.
 * En ningún caso se presenta como rechazo fiscal ni cambia el estado persistido.
 */
export function alertaConsulta(d: { ultimaConsultaResultado: string | null; cdc?: string | null }): AlertaConsulta | null {
  const r = d.ultimaConsultaResultado;

  if (!r || r === "OK") return null;

  if (r === "CDC_DIVERGENTE") {
    return d.cdc
      ? {
          tipo: "inconsistencia",
          texto: "Inconsistencia de consulta: CDC distinto del previamente registrado",
          detalle: "La última consulta devolvió un CDC distinto del ya registrado para este documento: el CDC registrado se conserva y la respuesta NO se tomó como resultado fiscal. Ver mensaje, CDC informado, fecha y JSON en el historial.",
        }
      : {
          tipo: "inconsistencia",
          texto: "Inconsistencia de consulta: el CDC informado no corresponde a la identidad fiscal del documento",
          detalle: "El documento aún no tiene CDC registrado. La última consulta devolvió un CDC que no corresponde al tipo, establecimiento, punto o número de este documento (o no es un CDC válido): su respuesta NO se tomó como resultado fiscal. Ver mensaje, CDC informado, fecha y JSON en el historial.",
        };
  }

  return {
    tipo: "tecnica",
    texto: `Consulta con error técnico: ${ETIQUETA_RESULTADO_INTENTO[r] ?? r}`,
    detalle: "La última consulta no obtuvo una respuesta fiscal válida; el estado fiscal no se modificó. Ver detalle en el historial.",
  };
}

/**
 * PRO-342-R01 — Seguimiento fiscal en TRES ejes que nunca se mezclan (pantalla de detalle):
 *  · envío: ACK del gateway (ENVIADO = recibido, con su lote literal), nunca aprobación;
 *  · último retorno del gateway: el texto crudo de la última consulta válida (p. ej. «XML firmado», fase intermedia) o, si solo hubo consultas sin estado válido, que la consulta técnica existió;
 *  · resultado fiscal SIFEN: solo un estado final persistido (Aprobado / Rechazado / Cancelado / Inutilizado); si no, pendiente y en seguimiento automático.
 * Puro: no lee ni escribe nada; la disponibilidad del KuDE no participa (no es aprobación).
 */
export type SeguimientoFiscal = { envio: string; ultimoRetorno: string; resultadoFiscal: string; final: boolean; consultando: boolean };

export function seguimientoFiscal(d: { estadoLocal: EstadoLocal; estadoSifen: EstadoSifen; estadoGatewayTexto: string | null; ultimaConsultaAt: string | null; ultimaConsultaResultado: string | null; lote: string | null }): SeguimientoFiscal {
  const final = ESTADOS_SIFEN_FINALES.includes(d.estadoSifen);
  const transmitido = ESTADOS_LOCAL_TRANSMITIDO.includes(d.estadoLocal);
  const envio = d.estadoLocal === "ENVIADO"
    ? `Recibido por el gateway${d.lote ? ` (lote ${d.lote})` : ""}. La recepción no es aprobación SIFEN.`
    : ETIQUETA_LOCAL[d.estadoLocal] ?? d.estadoLocal;
  const tecnica = d.ultimaConsultaAt && d.ultimaConsultaResultado && d.ultimaConsultaResultado !== "OK" ? ` Última consulta: ${ETIQUETA_RESULTADO_INTENTO[d.ultimaConsultaResultado] ?? d.ultimaConsultaResultado}.` : "";
  const ultimoRetorno = d.estadoGatewayTexto
    ? `«${d.estadoGatewayTexto}»${esFaseXmlFirmado(d.estadoGatewayTexto) ? " (fase intermedia del gateway: XML firmado, todavía sin decisión SIFEN; el KuDE puede estar disponible)" : ""}.${tecnica}`
    : d.ultimaConsultaAt
      ? `Consultado técnicamente, sin un estado válido informado por el gateway.${tecnica}`
      : "Aún no consultado.";
  const resultadoFiscal = final
    ? `${ETIQUETA_SIFEN[d.estadoSifen]} (informado por la API y registrado para este documento).`
    : transmitido
      ? "Pendiente: se sigue consultando automáticamente el mismo documento hasta «Aprobado» o «Rechazado» (sin reenviar el JSON)."
      : "Sin información fiscal: el documento todavía no fue recibido por el gateway.";

  return { envio, ultimoRetorno, resultadoFiscal, final, consultando: !final && transmitido };
}

/** Campos de un intento del historial que usa el resumen de consultas (los devuelve listarIntentos / listarIntentosPagina). */
export type IntentoConsulta = { tipo: string; resultado: string; creadoAt: string; httpStatus: number | null; estadoGateway: string | null; codRespuesta: string | null; mensaje: string | null; cdcInformado: string | null; cdcRespuesta?: string | null; conexion?: Record<string, unknown> | null };

/** PRO-342-R01: texto de la conexión usada en un intento (NEX-079): host y versión de credenciales; nunca usuario, RUC, clave ni token (la columna no los admite). null si no se registró. */
export function textoConexion(c: Record<string, unknown> | null | undefined): string | null {
  if (!c || typeof c !== "object") return null;

  const host = typeof c.host === "string" && c.host ? c.host : null;
  const version = typeof c.credencialesVersion === "number" ? `credenciales v${c.credencialesVersion}` : null;
  const origen = c.origenCredenciales === "BASE" ? "de la empresa" : c.origenCredenciales === "ENTORNO" ? "del servidor" : null;
  const partes = [host, version && origen ? `${version} ${origen}` : version ?? (origen ? `credenciales ${origen}` : null)].filter(Boolean);

  return partes.length ? partes.join(" · ") : null;
}

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
