/**
 * PRO-313-R01 / PRO-199 — Lectura de los eventos de una FE informados por POST /api/consulta_de y preparación (NO operativa) de la cancelación.
 * Módulo PURO (sin React, sin red, sin base, sin node:crypto): se usa en el servidor (proyección del listado) y en la pantalla (presentación y validación del formulario).
 *
 * Contrato ACREDITADO (REQ-NEXIT-CANCELACION-FE-API-2026-11-20, JSON completo del 20/11/2026):
 *   response.Estado / response.FechaRegistro (DD-MM-YYYY HH:mm:ss)
 *   response.DE.CDC · response.DE.FechaFirma (DD-MM-YYYY HH:mm:ss) · response.DE.FechaEnvio (YYYY-MM-DD HH:mm:ss)
 *   response.DE.Retorno {FechaRetorno (DD-MM-YYYY HH:mm:ss), CodRespuesta, Mensaje}  → aprobación de la FE ORIGINAL (no del evento)
 *   response.DE.Evento[] {estado, motivo, detalle, fecha_creacion}                   → eventos; SIN id ni tipo de evento
 *
 * Reglas (no se inventa nada):
 *  · Solo se lee la ruta exacta response.DE.Evento (singular, array). Ausente/null ≠ lista vacía acreditada; otro tipo JSON = no interpretable.
 *  · Se conservan TODAS las ocurrencias en el orden recibido; no se asume orden temporal, no se toma el último elemento, no se unifican motivos ni se deduplica.
 *  · Clase del evento por literal EXACTO observado («Aprobado» / «Rechazado»); cualquier otro valor se muestra literal y se trata como resultado desconocido.
 *  · fecha_creacion solo se presenta si cumple ESTRICTAMENTE uno de los formatos acreditados del gateway (con calendario real); «Fecha inválida» u otro texto = «Sin información».
 *  · Un evento Aprobado proyecta «Cancelado» SOLO si (a) el tipo del evento como cancelación está acreditado por un CONTEXTO independiente de la respuesta (solicitud de cancelación
 *    propia registrada y correlacionada, o contrato del proveedor) y (b) la lectura está correlacionada con el documento: consulta OK de ESE documento, CDC informado igual al registrado
 *    (literal) y la MISMA cuenta del envío (continuidad MISMA). Ni Retorno 0260, ni HTTP 200, ni el ACK, ni el motivo, ni la posición en el array son prueba.
 *  · Sin tipo/correlación acreditados, un evento Aprobado (o desconocido) se muestra literal y BLOQUEA una nueva solicitud por revisión; no cambia el estado fiscal ni el stock.
 *  · Una cancelación ya acreditada en una lectura anterior no retrocede porque una lectura posterior no la repita (no regresión); el historial queda íntegro en los intentos.
 *  · La proyección es de PRESENTACIÓN: estado_sifen persistido, CDC, lote, historial e inventario no se modifican aquí.
 *  · Plazo de 48 h: solo desde la fecha/hora OFICIAL de aprobación SIFEN acreditada (con zona). FechaRetorno es CANDIDATA (semántica y zona sin confirmar): se muestra como evidencia y
 *    nunca habilita el plazo. Nunca se calcula desde firma, emisión, envío, consulta o reloj local.
 *  · El POST /api/cancelacion_dte NO está habilitado (CANCELACION_FE_OPERATIVA = false): ninguna ruta, botón ni modal lo transmite.
 */

// ── Fechas del gateway (formatos acreditados, validación calendárica estricta, sin zona ni conversión) ─────────────────────────────────────────────────
export type FormatoFechaGateway = "DD-MM-YYYY HH:mm:ss" | "YYYY-MM-DD HH:mm:ss";
export type FechaGateway = { anio: number; mes: number; dia: number; hora: number; minuto: number; segundo: number; formato: FormatoFechaGateway; literal: string; visible: string };

export const FORMATO_DMY: FormatoFechaGateway = "DD-MM-YYYY HH:mm:ss";
export const FORMATO_YMD: FormatoFechaGateway = "YYYY-MM-DD HH:mm:ss";

/** Formato acreditado de cada fecha de la respuesta de consulta (comprobados individualmente en el JSON completo del 20/11/2026). Campos independientes: nunca se intercambian. */
export const FORMATO_FECHA_CONSULTA = {
  FechaRegistro: FORMATO_DMY,
  FechaFirma: FORMATO_DMY,
  FechaEnvio: FORMATO_YMD,
  FechaRetorno: FORMATO_DMY,
} as const;

const RE_DMY = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/;
const RE_YMD = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;
const dos = (n: number) => String(n).padStart(2, "0");

/** Interpreta `v` EXACTAMENTE en `formato` (sin espacios extra, sin zona, sin milisegundos) y con calendario real (31-02 o 24:00:00 no valen). null si no cumple. */
export function fechaGatewayEstricta(v: unknown, formato: FormatoFechaGateway): FechaGateway | null {
  if (typeof v !== "string") return null;

  const m = (formato === FORMATO_DMY ? RE_DMY : RE_YMD).exec(v);

  if (!m) return null;

  const [dia, mes, anio] = formato === FORMATO_DMY ? [Number(m[1]), Number(m[2]), Number(m[3])] : [Number(m[3]), Number(m[2]), Number(m[1])];
  const [hora, minuto, segundo] = [Number(m[4]), Number(m[5]), Number(m[6])];

  if (anio < 1 || mes < 1 || mes > 12 || dia < 1 || hora > 23 || minuto > 59 || segundo > 59) return null;

  const f = new Date(0);

  f.setUTCFullYear(anio, mes - 1, dia);
  if (f.getUTCFullYear() !== anio || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) return null;

  return { anio, mes, dia, hora, minuto, segundo, formato, literal: v, visible: `${dos(dia)}/${dos(mes)}/${String(anio).padStart(4, "0")} ${dos(hora)}:${dos(minuto)}:${dos(segundo)}` };
}

/**
 * PRO-313-R01 (F014): presentación de una fecha del gateway guardada como TEXTO (fecha_firma_gateway / fecha_envio_gateway). Acepta el formato acreditado DD-MM-YYYY HH:mm:ss (FechaFirma real)
 * con validación estricta y mantiene la presentación anterior para YYYY-MM-DD[ HH:mm[:ss]] (FechaEnvio). Sin zona ni conversión al reloj local; cualquier otro texto se muestra literal.
 */
export function textoFechaGateway(v: string | null): string {
  const dmy = fechaGatewayEstricta(v, FORMATO_DMY);

  if (dmy) return dmy.visible;

  const m = v ? /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?/.exec(v) : null;

  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}` : ""}` : (v ?? "—");
}

// ── Lectura de response.DE.Evento ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type ClaseEvento = "APROBADO" | "RECHAZADO" | "DESCONOCIDO";
export type EventoFe = {
  /** Posición en el array RECIBIDO (solo para mostrar y distinguir ocurrencias; no es identidad ni orden temporal). */
  posicion: number;
  clase: ClaseEvento;
  /** Texto literal del estado informado (saneado), o null si no es texto. */
  estado: string | null;
  motivo: string | null;
  detalle: string | null;
  /** Fecha válida en un formato acreditado (texto visible sin zona) o null = «Sin información». El literal queda solo en la evidencia del intento. */
  fecha: string | null;
};
export type FormaEventos = "AUSENTE" | "VACIO" | "LISTA" | "NO_INTERPRETABLE";
export type LecturaEventos = { forma: FormaEventos; eventos: EventoFe[] };

/** Límite de presentación de textos libres del evento (la evidencia ya está acotada y saneada al registrarse). */
export const MAX_TEXTO_EVENTO = 300;
/** Estados literales OBSERVADOS en el contrato (comparación exacta, sin normalizar mayúsculas ni tildes). */
export const ESTADO_EVENTO_APROBADO = "Aprobado";
export const ESTADO_EVENTO_RECHAZADO = "Rechazado";

type Saneador = (t: string) => string;

const sinControl = (t: string) => t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

function textoEvento(v: unknown, sanear: Saneador): string | null {
  if (typeof v !== "string") return null;

  const t = sinControl(sanear(v)).trim();

  if (t === "") return null;

  return Array.from(t).length > MAX_TEXTO_EVENTO ? `${Array.from(t).slice(0, MAX_TEXTO_EVENTO).join("")}…` : t;
}

/** fecha_creacion: no tiene formato propio acreditado; solo se presenta si cumple ESTRICTAMENTE uno de los formatos acreditados del gateway. «Fecha inválida» u otro texto = null. */
export function fechaEvento(v: unknown): string | null {
  return (fechaGatewayEstricta(v, FORMATO_DMY) ?? fechaGatewayEstricta(v, FORMATO_YMD))?.visible ?? null;
}

const registro = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/**
 * Lee el VALOR de response.DE.Evento (ya extraído de la respuesta). undefined/null = AUSENTE (sin información, no «sin eventos»); [] = VACIO acreditado; array = LISTA (todas las
 * ocurrencias; un elemento que no es objeto queda como DESCONOCIDO, no se descarta); otro tipo = NO_INTERPRETABLE.
 */
export function leerEventos(valor: unknown, sanear: Saneador = (t) => t): LecturaEventos {
  if (valor === undefined || valor === null) return { forma: "AUSENTE", eventos: [] };
  if (!Array.isArray(valor)) return { forma: "NO_INTERPRETABLE", eventos: [] };
  if (valor.length === 0) return { forma: "VACIO", eventos: [] };

  return {
    forma: "LISTA",
    eventos: valor.map((e, posicion) => {
      const r = registro(e);
      const estado = r ? textoEvento(r.estado, sanear) : null;
      const clase: ClaseEvento = r && r.estado === ESTADO_EVENTO_APROBADO ? "APROBADO" : r && r.estado === ESTADO_EVENTO_RECHAZADO ? "RECHAZADO" : "DESCONOCIDO";

      return { posicion, clase, estado, motivo: r ? textoEvento(r.motivo, sanear) : null, detalle: r ? textoEvento(r.detalle, sanear) : null, fecha: r ? fechaEvento(r.fecha_creacion) : null };
    }),
  };
}

/** Lee response.DE.Evento desde una respuesta COMPLETA guardada (cuerpo {status, response:{…}}). Una evidencia truncada ({truncado:true}) o sin response.DE es AUSENTE. */
export function eventosDeRespuesta(respuesta: unknown, sanear?: Saneador): LecturaEventos {
  const de = registro(registro(registro(respuesta)?.response)?.DE);

  return de && "Evento" in de ? leerEventos(de.Evento, sanear) : { forma: "AUSENTE", eventos: [] };
}

// ── Proyección de los eventos de un documento ──────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * UNA lectura de consulta registrada (intento CONSULTA con resultado OK del MISMO documento, ya en el alcance de la sesión). Solo los fragmentos contractuales necesarios:
 * response.DE.CDC (literal), response.DE.Evento, response.DE.Retorno; la continuidad de la cuenta respecto del envío la calcula el servidor (continuidadConexion).
 */
export type LecturaConsulta = {
  intentoId: string;
  creadoAt: string;
  cdc: unknown;
  /** Valor de response.DE.Evento (undefined/null = clave ausente o nula: AUSENTE). */
  evento: unknown;
  retorno: unknown;
  continuidad: "MISMA" | "DISTINTA" | "SIN_REFERENCIA";
};

/**
 * Contexto que ACREDITA que los eventos aprobados de este documento son de CANCELACIÓN. La respuesta no trae tipo ni id de evento: este contexto debe venir de fuera de la respuesta.
 * Hoy NO existe fuente en el esquema (no hay registro persistido de solicitudes de cancelación ni contrato general del proveedor): ver contextoCancelacionDocumento.
 */
export type ContextoCancelacion = { acreditado: true; fuente: string } | { acreditado: false; motivo: string };

export const MOTIVO_TIPO_NO_ACREDITADO =
  "La respuesta no informa el tipo ni el identificador del evento, y Nexit aún no registra solicitudes de cancelación propias: no se puede acreditar que el evento aprobado sea una cancelación de este documento.";

/** Fuente vigente del tipo de evento para un documento. Sin esquema de solicitudes (propuesta documental pendiente de autorización), nunca acredita. */
export function contextoCancelacionDocumento(): ContextoCancelacion {
  return { acreditado: false, motivo: MOTIVO_TIPO_NO_ACREDITADO };
}

export type SituacionEventos =
  | "SIN_INFORMACION" // no hay lectura con la clave Evento (o no se pudo leer el historial)
  | "SIN_EVENTOS" // la última lectura informó Evento: [] (vacío acreditado)
  | "SOLO_RECHAZADOS" // todos los eventos informados son Rechazado: la FE sigue aprobada
  | "CANCELADO" // cancelación aprobada acreditada y correlacionada
  | "EN_REVISION"; // evento aprobado sin tipo/correlación acreditados, o resultado desconocido / ambiguo / no interpretable

export type ProyeccionEventosFe = {
  situacion: SituacionEventos;
  /** Eventos de la lectura presentada (la más reciente con lista o vacío), en el orden recibido. */
  eventos: EventoFe[];
  /** Lectura presentada (intento de consulta) y su fecha de registro en Nexit (no es fecha del evento). */
  lectura: { intentoId: string; creadoAt: string } | null;
  /** Texto corto para la columna Eventos. */
  texto: string;
  /** Explicación para el tooltip / segunda capa. */
  detalle: string;
  /** Impide iniciar otra solicitud de cancelación (cancelación acreditada, evento aprobado en revisión, resultado desconocido o sin lectura). */
  bloqueaSolicitud: boolean;
  /** FechaRetorno informada con CodRespuesta 0260 en la lectura correlacionada más reciente: CANDIDATA a aprobación oficial (sin confirmar semántica ni zona). Solo evidencia. */
  aprobacionCandidata: string | null;
  /** Avisos adicionales (p. ej. una lectura posterior no repite la cancelación acreditada, o la última consulta no informó la clave Evento). */
  avisos: string[];
};

export const SIN_INFORMACION_EVENTOS_FE = "Sin información de eventos";
export const COD_RETORNO_APROBADO_OBSERVADO = "0260";

/** Correlación de UNA lectura con el documento: consulta OK de ese documento (garantizado por el origen), CDC informado literal = CDC registrado, misma cuenta del envío. */
export function lecturaCorrelacionada(l: LecturaConsulta, cdcDocumento: string | null): { ok: true } | { ok: false; motivo: string } {
  if (cdcDocumento === null || cdcDocumento === "") return { ok: false, motivo: "El documento no tiene CDC registrado para correlacionar la lectura." };
  if (typeof l.cdc !== "string" || l.cdc === "") return { ok: false, motivo: "La consulta no informó el CDC del documento." };
  if (l.cdc.includes("[omitido]")) return { ok: false, motivo: "El CDC de la evidencia fue omitido por el saneamiento: no sirve para correlacionar." };
  if (l.cdc !== cdcDocumento) return { ok: false, motivo: "El CDC informado en la consulta no es el registrado para el documento." };
  if (l.continuidad === "DISTINTA") return { ok: false, motivo: "La consulta se hizo con una cuenta o servidor distinto del envío." };
  if (l.continuidad !== "MISMA") return { ok: false, motivo: "No está comprobado que la consulta se haya hecho con la misma cuenta del envío." };

  return { ok: true };
}

/** FechaRetorno candidata: solo con CodRespuesta 0260 literal y formato DD-MM-YYYY HH:mm:ss estricto; texto visible sin zona. */
export function aprobacionCandidataDeRetorno(retorno: unknown): string | null {
  const r = registro(retorno);

  if (!r || r.CodRespuesta !== COD_RETORNO_APROBADO_OBSERVADO) return null;

  return fechaGatewayEstricta(r.FechaRetorno, FORMATO_DMY)?.visible ?? null;
}

const contar = (eventos: readonly EventoFe[], clase: ClaseEvento) => eventos.filter((e) => e.clase === clase).length;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Proyección de los eventos de UNA FE a partir de sus lecturas de consulta (cualquier orden de entrada; se ordenan por creadoAt/intentoId DESC). Pura y conservadora.
 * `cdcDocumento`: CDC registrado del documento (literal). `contexto`: acreditación del tipo de evento (hoy nunca acreditada).
 */
export function proyectarEventosFe(lecturas: readonly LecturaConsulta[], cdcDocumento: string | null, contexto: ContextoCancelacion, sanear?: Saneador): ProyeccionEventosFe {
  const ordenadas = [...lecturas].sort((a, b) => (a.creadoAt === b.creadoAt ? (a.intentoId < b.intentoId ? 1 : -1) : a.creadoAt < b.creadoAt ? 1 : -1));
  const leidas = ordenadas.map((l) => ({ l, lectura: leerEventos(l.evento, sanear), correlacion: lecturaCorrelacionada(l, cdcDocumento) }));
  const avisos: string[] = [];
  const candidata = leidas.find((x) => x.correlacion.ok && aprobacionCandidataDeRetorno(x.l.retorno) !== null);
  const aprobacionCandidata = candidata ? aprobacionCandidataDeRetorno(candidata.l.retorno) : null;

  // Cancelación acreditada en ALGUNA lectura (no regresión): contexto acreditado + lectura correlacionada + exactamente UN evento Aprobado y ninguno desconocido en esa lectura.
  const acreditada = contexto.acreditado
    ? leidas.find((x) => x.correlacion.ok && x.lectura.forma === "LISTA" && contar(x.lectura.eventos, "APROBADO") === 1 && contar(x.lectura.eventos, "DESCONOCIDO") === 0)
    : undefined;
  const presentada = leidas.find((x) => x.lectura.forma === "LISTA" || x.lectura.forma === "VACIO") ?? leidas.find((x) => x.lectura.forma === "NO_INTERPRETABLE");
  const masReciente = leidas[0];

  if (masReciente && presentada && masReciente !== presentada && masReciente.lectura.forma === "AUSENTE") {
    avisos.push("La consulta más reciente no informó eventos (clave Evento ausente); se muestran los de la última consulta que sí los informó.");
  }

  const base = { aprobacionCandidata, avisos };

  if (acreditada) {
    if (presentada && presentada !== acreditada && contar(presentada.lectura.eventos, "APROBADO") === 0) {
      avisos.push("Una consulta posterior no repite el evento de cancelación aprobado: se conserva la cancelación acreditada y su evidencia (no hay regresión).");
    }

    return {
      ...base,
      situacion: "CANCELADO",
      eventos: acreditada.lectura.eventos,
      lectura: { intentoId: acreditada.l.intentoId, creadoAt: acreditada.l.creadoAt },
      texto: "Cancelado (evento de cancelación aprobado)",
      detalle: `Evento de cancelación aprobado y correlacionado con este documento (${contexto.acreditado ? contexto.fuente : ""}). La aprobación original de la FE se conserva como historial. No se permite otra solicitud.`,
      bloqueaSolicitud: true,
    };
  }

  if (!presentada) {
    return {
      ...base,
      situacion: "SIN_INFORMACION",
      eventos: [],
      lectura: null,
      texto: SIN_INFORMACION_EVENTOS_FE,
      detalle: "Ninguna consulta registrada informó la lista de eventos (response.DE.Evento): no se afirma que no existan eventos.",
      bloqueaSolicitud: false,
    };
  }

  const lectura = { intentoId: presentada.l.intentoId, creadoAt: presentada.l.creadoAt };
  const eventos = presentada.lectura.eventos;

  if (presentada.lectura.forma === "NO_INTERPRETABLE") {
    return { ...base, situacion: "EN_REVISION", eventos, lectura, texto: "Eventos no interpretables", detalle: "La consulta informó la clave Evento con un formato no interpretable: requiere revisión; no se permite otra solicitud.", bloqueaSolicitud: true };
  }
  if (presentada.lectura.forma === "VACIO") {
    return { ...base, situacion: "SIN_EVENTOS", eventos, lectura, texto: "Sin eventos informados", detalle: "La última consulta que informó eventos devolvió la lista vacía.", bloqueaSolicitud: false };
  }

  const aprobados = contar(eventos, "APROBADO");
  const rechazados = contar(eventos, "RECHAZADO");
  const desconocidos = contar(eventos, "DESCONOCIDO");
  const resumen = [aprobados ? plural(aprobados, "aprobado", "aprobados") : "", rechazados ? plural(rechazados, "rechazado", "rechazados") : "", desconocidos ? plural(desconocidos, "con resultado desconocido", "con resultado desconocido") : ""]
    .filter(Boolean)
    .join(", ");

  if (aprobados === 0 && desconocidos === 0) {
    return {
      ...base,
      situacion: "SOLO_RECHAZADOS",
      eventos,
      lectura,
      texto: `${plural(eventos.length, "evento", "eventos")}: ${resumen}`,
      detalle: "Eventos rechazados: la FE conserva su aprobación original; ningún evento rechazado la cancela.",
      bloqueaSolicitud: false,
    };
  }

  const porQue = aprobados > 0
    ? presentada.correlacion.ok
      ? contexto.acreditado
        ? "Hay más de un evento aprobado o un evento con resultado desconocido en la misma lectura: la cancelación es ambigua."
        : contexto.motivo
      : `Evento aprobado sin correlación acreditada: ${presentada.correlacion.motivo}`
    : "Hay eventos con resultado desconocido.";

  return {
    ...base,
    situacion: "EN_REVISION",
    eventos,
    lectura,
    texto: `${plural(eventos.length, "evento", "eventos")}: ${resumen} (en revisión)`,
    detalle: `${porQue} Se muestra el evento tal como lo informó la API, sin cambiar el estado fiscal ni el stock; no se permite otra solicitud hasta resolverlo.`,
    bloqueaSolicitud: true,
  };
}

// ── Elegibilidad de la cancelación (preparada, NO operativa) ──────────────────────────────────────────────────────────────────────────────────────
/** Gate de integración: el POST /api/cancelacion_dte no se transmite hasta homologación y autorización expresa. */
export const CANCELACION_FE_OPERATIVA = false as const;
/** 48 horas exactas = 172800 s, límite inclusivo, contadas SOLO desde la aprobación oficial SIFEN acreditada. */
export const PLAZO_CANCELACION_MS = 172_800_000;

export type AprobacionOficial = { acreditada: true; instanteMs: number } | { acreditada: false; candidata: string | null };

/** Fuente vigente de la aprobación oficial: ninguna (FechaRetorno es solo candidata). */
export function aprobacionOficialDocumento(proyeccion: ProyeccionEventosFe | null | undefined): AprobacionOficial {
  return { acreditada: false, candidata: proyeccion?.aprobacionCandidata ?? null };
}

export type ElegibilidadCancelacion = {
  /** La cancelación aplica al tipo de documento (solo FE). */
  aplica: boolean;
  disponible: boolean;
  /** Estado corto para la columna Eventos («Cancelación: …»). */
  corto: string;
  /** Motivo de la indisponibilidad (vacío si disponible). */
  motivo: string;
  /** Vencimiento del plazo (epoch ms, inclusivo) cuando la aprobación oficial está acreditada; null si no. */
  vencimientoMs: number | null;
};

export const MOTIVO_SIN_APROBACION_OFICIAL =
  "la fecha y hora oficial de aprobación SIFEN no está acreditada (FechaRetorno es solo candidata: falta confirmar su significado y zona horaria)";
export const MOTIVO_NO_OPERATIVA = "el envío de la cancelación al gateway no está habilitado hasta la homologación autorizada";

/**
 * Elegibilidad para INICIAR una solicitud de cancelación. Pura; el servidor deberá revalidarla íntegra al confirmar (fase futura). Orden de las guardas: tipo, permiso, estado fiscal,
 * eventos, aprobación oficial y plazo, gate de integración.
 */
export function elegibilidadCancelacionFe(e: {
  tipo: string;
  estadoSifen: string;
  puedeEditar: boolean;
  proyeccion: ProyeccionEventosFe | null | undefined;
  aprobacion: AprobacionOficial;
  ahoraMs: number;
  operativa?: boolean;
}): ElegibilidadCancelacion {
  const no = (corto: string, motivo: string, vencimientoMs: number | null = null): ElegibilidadCancelacion => ({ aplica: true, disponible: false, corto, motivo: `Cancelación no disponible: ${motivo}.`, vencimientoMs });

  if (e.tipo !== "FE") return { aplica: false, disponible: false, corto: "No aplica", motivo: "Cancelación no disponible: solo aplica a facturas electrónicas (FE).", vencimientoMs: null };
  if (e.estadoSifen === "CANCELADO" || e.proyeccion?.situacion === "CANCELADO") return no("Cancelado", "el documento ya está cancelado");
  if (!e.puedeEditar) return no("No disponible", "su perfil no tiene permiso de edición de facturación electrónica");
  if (e.estadoSifen !== "APROBADO") return no("No disponible", "solo una FE aprobada por SIFEN puede cancelarse");
  if (!e.proyeccion || e.proyeccion.situacion === "SIN_INFORMACION") return no("No disponible", "no hay una consulta registrada que informe los eventos del documento (consulte el estado antes)");
  if (e.proyeccion.bloqueaSolicitud) return no("En revisión", `hay un evento que requiere revisión (${e.proyeccion.texto})`);
  if (!e.aprobacion.acreditada) return no("No disponible", MOTIVO_SIN_APROBACION_OFICIAL);
  if (!Number.isFinite(e.ahoraMs)) return no("No disponible", "no se conoce el instante del servidor para verificar el plazo");
  if (!Number.isFinite(e.aprobacion.instanteMs) || e.aprobacion.instanteMs > e.ahoraMs) return no("No disponible", "la fecha oficial de aprobación es inválida o futura");

  const vencimientoMs = e.aprobacion.instanteMs + PLAZO_CANCELACION_MS;

  if (e.ahoraMs > vencimientoMs) return no("Plazo vencido", "pasaron más de 48 horas desde la aprobación oficial SIFEN", vencimientoMs);
  if (!(e.operativa ?? CANCELACION_FE_OPERATIVA)) return no("No disponible", MOTIVO_NO_OPERATIVA, vencimientoMs);

  return { aplica: true, disponible: true, corto: "Disponible", motivo: "", vencimientoMs };
}

// ── Formulario (preparado, sin transmisión) ────────────────────────────────────────────────────────────────────────────────────────────────────────
export type ValidacionSolicitud = { valida: true; motivo: string } | { valida: false; errores: string[] };

/**
 * Validación local del formulario: motivo obligatorio (no vacío tras quitar espacios, sin caracteres de control) y confirmación explícita. Los límites de longitud de mOtEve NO están
 * acreditados por el contrato: no se inventan (el servidor los validará cuando se confirmen). La validación local no autoriza nada: el servidor revalida todo.
 */
export function validarSolicitudCancelacion(f: { motivo: string; confirmado: boolean }): ValidacionSolicitud {
  const motivo = typeof f.motivo === "string" ? f.motivo.trim() : "";
  const errores: string[] = [];

  if (motivo === "") errores.push("Indique el motivo de la cancelación.");
  else if (sinControl(motivo) !== motivo) errores.push("El motivo contiene caracteres no permitidos.");
  if (f.confirmado !== true) errores.push("Confirme explícitamente la solicitud de cancelación.");

  return errores.length ? { valida: false, errores } : { valida: true, motivo };
}
