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
import { esFaseXmlFirmado, ESTADOS_LOCAL_TRANSMITIDO, ESTADOS_SIFEN_FINALES, ESTADOS_SIFEN_SIN_FINAL, ETIQUETA_EMAIL, ETIQUETA_LOCAL, ETIQUETA_RESULTADO_INTENTO, ETIQUETA_SIFEN, type EstadoEmail, type EstadoLocal, type EstadoSifen } from "@/lib/facturacion/estados";

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
 * PRO-342-R05: NEXIT ya no valida el CDC; CDC_DIVERGENTE solo puede ser un resultado HISTÓRICO (anterior a NEX-080). Se muestra como registro histórico, sin afirmar que el CDC sea incorrecto y
 * sin presentarlo como rechazo fiscal. La próxima consulta registra el estado informado por la API con la regla vigente.
 */
export function alertaConsulta(d: { ultimaConsultaResultado: string | null; cdc?: string | null }): AlertaConsulta | null {
  const r = d.ultimaConsultaResultado;

  if (!r || r === "OK") return null;

  if (r === "CDC_DIVERGENTE") {
    return {
      tipo: "inconsistencia",
      texto: "Registro histórico: una validación anterior del CDC (ya retirada) no aceptó la última consulta",
      detalle: "Esa consulta se registró con una regla anterior que validaba el CDC. Hoy el CDC es un dato informado por la API: la próxima consulta registrará el estado fiscal informado. El historial se conserva sin cambios.",
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
export type IntentoConsulta = {
  tipo: string; resultado: string; creadoAt: string; httpStatus: number | null; estadoGateway: string | null; codRespuesta: string | null; mensaje: string | null; cdcInformado: string | null; cdcRespuesta?: string | null;
  conexion?: Record<string, unknown> | null;
  /** PRO-342-R05 (NEX-080): qué hizo la SQL con el CDC informado en este intento, y el CDC que tenía el documento antes de un CAMBIO. null en intentos anteriores a NEX-080. */
  cdcProyeccion?: string | null; cdcAnterior?: string | null;
};

/**
 * PRO-342-R05: aviso INFORMATIVO (nunca bloqueo) de la proyección del CDC registrada en el intento. El CDC de cada intento es inmutable en el historial; el documento muestra el último informado
 * por una respuesta aceptada. null si no hay nada que avisar.
 */
export function avisoProyeccionCdc(i: Pick<IntentoConsulta, "cdcProyeccion" | "cdcAnterior">): string | null {
  switch (i.cdcProyeccion) {
    case "CAMBIO":
      return `La API informó un CDC distinto del registrado antes${i.cdcAnterior ? ` (anterior: ${i.cdcAnterior})` : ""}: el documento muestra el nuevo; el anterior queda en el historial. No se modificaron notas de crédito ya emitidas.`;
    case "NO_PROYECTADO_OTRO_DOCUMENTO":
      return "El CDC informado ya figura en otro documento de la empresa: se guardó como evidencia de este intento y no se asignó al documento. Revise el caso con el proveedor.";
    case "NO_PROYECTADO":
      return "Respuesta no aceptada como resultado del documento: el CDC informado se guardó solo como evidencia.";
    default:
      return null;
  }
}

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

// ── PRO-342-R04 (UX01/UX02): iconos de estado por eje INDEPENDIENTE y primera capa fiscal ───────────────────────────────────────────────────────────────
/**
 * Cuatro ejes que nunca se mezclan ni se deducen unos de otros: ENVÍO (ACK del gateway), XML/CDC (CDC informado por la API, dato opaco), SIFEN (estado fiscal PERSISTIDO) y CORREO.
 * Una factura puede estar a la vez «Enviado ✓ · XML firmado ✓ · SIFEN Rechazado ✕»: la firma/CDC no es aprobación. Puro: solo deriva presentación desde lo persistido; nunca cambia datos.
 * Cada icono lleva un símbolo distinto además del color (el color nunca es la única señal) y un texto completo para aria-label/tooltip.
 */
export type EjeEstado = "envio" | "xml" | "sifen" | "correo";
export type SimboloEstado = "check" | "reloj" | "alerta" | "cruz" | "guion" | "archivoCheck" | "archivoReloj" | "archivoAlerta" | "prohibido" | "correo" | "correoCheck" | "correoCruz";
export type TonoIcono = "ok" | "info" | "aviso" | "error" | "neutro";
export type IconoEstado = { eje: EjeEstado; nombre: string; simbolo: SimboloEstado; tono: TonoIcono; corto: string; texto: string };

export const NOMBRE_EJE: Record<EjeEstado, string> = { envio: "Envío", xml: "XML/CDC", sifen: "SIFEN", correo: "Correo" };

/** PRO-342-R05: hay CDC informado por la API = cualquier texto no vacío (dato opaco: sin exigir 44 dígitos ni composición). */
export const cdcPresente = (c: unknown): c is string => typeof c === "string" && c !== "";

/** Respuesta no interpretable (RESPUESTA_INVALIDA) o resultado histórico CDC_DIVERGENTE (anterior a NEX-080). */
const RESULTADOS_INCONSISTENTES = new Set(["CDC_DIVERGENTE", "RESPUESTA_INVALIDA"]);

type DocIconos = { estadoLocal: EstadoLocal; estadoSifen: EstadoSifen; estadoEmail: EstadoEmail; cdc: string | null; ultimaConsultaResultado: string | null; envioErrorTipo?: string | null };

/**
 * PRO-342-R05: nota INFORMATIVA cuando el documento tiene un estado fiscal final informado por la API pero la API no informó CDC. Ya no es una «alerta de integridad»: el estado se registra
 * sin condicionarlo al CDC. Nada se modifica. null si no aplica.
 */
export function avisoSinCdc(d: { estadoSifen: EstadoSifen; cdc: string | null }): string | null {
  return ESTADOS_SIFEN_FINALES.includes(d.estadoSifen) && !cdcPresente(d.cdc)
    ? `La API informó el estado «${ETIQUETA_SIFEN[d.estadoSifen]}» sin CDC para este documento: se registró el estado tal como fue informado. Si la API informa el CDC en una consulta posterior, se registrará.`
    : null;
}

function iconoEnvio(d: DocIconos): IconoEstado {
  const base = { eje: "envio" as const, nombre: NOMBRE_EJE.envio };

  switch (d.estadoLocal) {
    case "ENVIADO":
      return { ...base, simbolo: "check", tono: "ok", corto: "Enviado", texto: "Envío: recepción confirmada por el gateway (ACK). No es aprobación SIFEN." };
    case "ENVIO_INDETERMINADO":
      return { ...base, simbolo: "alerta", tono: "aviso", corto: "Envío indeterminado", texto: "Envío: resultado indeterminado. Verifique en el gateway antes de cualquier reenvío." };
    case "ERROR_ENVIO":
      return d.envioErrorTipo === "RECHAZO"
        ? { ...base, simbolo: "cruz", tono: "error", corto: "Error de envío", texto: "Envío: el gateway rechazó el documento por validación (no es un rechazo SIFEN)." }
        : { ...base, simbolo: "cruz", tono: "error", corto: "Error de envío", texto: "Envío: error al enviar al gateway; el documento no fue recibido." };
    case "ENVIANDO":
      return { ...base, simbolo: "reloj", tono: "aviso", corto: "Enviando", texto: "Envío: en curso, todavía sin confirmación del gateway." };
    default:
      return { ...base, simbolo: "guion", tono: "neutro", corto: "Pendiente de envío", texto: "Envío: pendiente, todavía no se transmitió al gateway." };
  }
}

function iconoXml(d: DocIconos): IconoEstado {
  const base = { eje: "xml" as const, nombre: NOMBRE_EJE.xml };
  const conCdc = cdcPresente(d.cdc);

  if (d.ultimaConsultaResultado && RESULTADOS_INCONSISTENTES.has(d.ultimaConsultaResultado)) {
    const motivo = d.ultimaConsultaResultado === "CDC_DIVERGENTE" ? "registro histórico de una validación de CDC ya retirada" : "la última respuesta del gateway no fue interpretable para este documento";

    return { ...base, simbolo: "archivoAlerta", tono: "aviso", corto: "XML/CDC con aviso", texto: `XML/CDC: ${motivo}. ${conCdc ? "Se conserva el CDC registrado." : "Aún no hay CDC informado."}` };
  }
  if (conCdc) return { ...base, simbolo: "archivoCheck", tono: "info", corto: "CDC informado", texto: "XML/CDC: CDC informado por la API y registrado tal cual. No es aprobación SIFEN." };

  return { ...base, simbolo: "archivoReloj", tono: "neutro", corto: "Sin CDC", texto: "XML/CDC: la API aún no informó el CDC de este documento." };
}

function iconoSifen(d: DocIconos): IconoEstado {
  const base = { eje: "sifen" as const, nombre: NOMBRE_EJE.sifen };
  const etiqueta = ETIQUETA_SIFEN[d.estadoSifen] ?? d.estadoSifen;

  // PRO-342-R05: el estado fiscal se presenta tal como lo informó la API, con o sin CDC (sin «alerta de integridad»).
  if (d.estadoSifen === "APROBADO") return { ...base, simbolo: "check", tono: "ok", corto: "SIFEN Aprobado", texto: "SIFEN: aprobado (resultado fiscal informado por la API)." };
  if (d.estadoSifen === "RECHAZADO") return { ...base, simbolo: "cruz", tono: "error", corto: "SIFEN Rechazado", texto: "SIFEN: rechazo fiscal informado por la API. Ver código y mensaje en el detalle." };
  if (d.estadoSifen === "CANCELADO" || d.estadoSifen === "INUTILIZADO") return { ...base, simbolo: "prohibido", tono: "neutro", corto: `SIFEN ${etiqueta}`, texto: `SIFEN: ${etiqueta} (estado fiscal registrado).` };
  if (ESTADOS_SIFEN_SIN_FINAL.includes(d.estadoSifen) && ESTADOS_LOCAL_TRANSMITIDO.includes(d.estadoLocal)) {
    return { ...base, simbolo: "reloj", tono: "aviso", corto: "SIFEN pendiente", texto: `SIFEN: pendiente de resultado, todavía sin decisión fiscal (estado registrado: ${etiqueta}).` };
  }

  return { ...base, simbolo: "guion", tono: "neutro", corto: "SIFEN sin información", texto: "SIFEN: sin información fiscal (documento aún no recibido por el gateway)." };
}

function iconoCorreo(d: DocIconos): IconoEstado {
  const base = { eje: "correo" as const, nombre: NOMBRE_EJE.correo, corto: ETIQUETA_EMAIL[d.estadoEmail] ?? d.estadoEmail };
  const texto = `Correo: ${ETIQUETA_EMAIL[d.estadoEmail] ?? d.estadoEmail} (independiente del estado SIFEN).`;

  if (d.estadoEmail === "ENVIADO") return { ...base, simbolo: "correoCheck", tono: "ok", texto };
  if (d.estadoEmail === "ERROR") return { ...base, simbolo: "correoCruz", tono: "error", texto };
  if (d.estadoEmail === "PENDIENTE") return { ...base, simbolo: "reloj", tono: "aviso", texto };

  return { ...base, simbolo: "correo", tono: "neutro", texto };
}

/** Siempre CUATRO iconos, en orden fijo Envío · XML/CDC · SIFEN · Correo. */
export function iconosEstado(d: DocIconos): [IconoEstado, IconoEstado, IconoEstado, IconoEstado] {
  return [iconoEnvio(d), iconoXml(d), iconoSifen(d), iconoCorreo(d)];
}

/** Línea compacta de fases para la cabecera del detalle (sin correo): p. ej. «Enviado · XML firmado · SIFEN Rechazado». */
export function resumenFases(d: DocIconos): string {
  return iconosEstado(d).slice(0, 3).map((i) => i.corto).join(" · ");
}

/**
 * PRO-342-R04 (UX02): primera capa del detalle, SOLO cuatro datos fiscales tal como se registraron (sin inventar, recortar ni enmascarar):
 * lote literal, CDC literal informado por la API (PRO-342-R05: cualquier forma), fecha de firma informada por la API y código + mensaje de la última respuesta registrada. `rechazo` solo con
 * RECHAZADO persistido (sin condición sobre el CDC): el rojo nunca se deduce del texto del mensaje.
 */
export function detalleFiscalPrimario(d: { lote: string | null; cdc: string | null; fechaFirma: string | null; codRespuesta: string | null; mensajeRespuesta: string | null; estadoSifen: EstadoSifen }) {
  const mensaje = [d.codRespuesta, d.mensajeRespuesta].filter((x): x is string => typeof x === "string" && x !== "").join(" · ");

  return { lote: d.lote, cdc: d.cdc, fechaFirma: d.fechaFirma, mensaje: mensaje === "" ? null : mensaje, rechazo: d.estadoSifen === "RECHAZADO" };
}
