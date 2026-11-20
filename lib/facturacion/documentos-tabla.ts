/**
 * PRO-195-UX-R01 — Ayudas PURAS de la tabla compacta de «Documentos electrónicos» (sin React, sin DOM, sin red). Solo deciden QUÉ se muestra a partir de lo persistido;
 * nunca cambian estado_sifen, estado_local, CDC, lote ni reglas fiscales, y no inventan estados, eventos, respuestas ni operaciones.
 *
 *  · estadoPrincipalFila: UN solo estado principal por documento (presentacionSifen, ya auditado) + una línea secundaria con la fase técnica real (Enviado,
 *    XML firmado, Envío indeterminado, Error de envío…). Aprobado y Rechazado nunca coexisten: salen del ÚNICO estado fiscal persistido. Un error de transporte o
 *    de validación del gateway se dice como tal, nunca como rechazo SIFEN.
 *  · eventosFila: columna Eventos. PRO-313-R01: además del estado fiscal ya registrado (Cancelado/Inutilizado informado por la API), muestra la proyección de los eventos
 *    leídos de response.DE.Evento (eventos-fe.ts) y la elegibilidad de la cancelación (preparada, NO operativa). Inutilización sigue fuera de alcance.
 *  · accionesFila: acciones directas de la fila según operaciones REALES: KuDE (endpoint existente, solo FE/NCE), consulta SIFEN (endpoint existente, permiso editar);
 *    XML y correo NO tienen endpoint en Nexit: se muestran deshabilitados con su motivo.
 *  · seleccionVigente: la selección solo vale en el contexto (filtros + página) donde se hizo y solo para filas visibles; no habilita ninguna acción masiva.
 */
import { esFaseXmlFirmado, type EstadoLocal, type EstadoSifen } from "@/lib/facturacion/estados";
import type { ElegibilidadCancelacion, ProyeccionEventosFe } from "@/lib/facturacion/eventos-fe";
import { presentacionSifen, type TonoSifen } from "@/lib/facturacion/presentacion-sifen";

export type EstadoFila = { tono: TonoSifen; texto: string; detalle: string; secundario: string | null };

type DocEstado = { estadoLocal: EstadoLocal; estadoSifen: EstadoSifen; estadoGatewayTexto?: string | null; ultimaConsultaAt?: string | null; envioErrorTipo?: string | null };

export function estadoPrincipalFila(d: DocEstado & { eventosFe?: ProyeccionEventosFe | null }): EstadoFila {
  const p = presentacionSifen(d);

  // PRO-313-R01: cancelación ACREDITADA (evento de cancelación aprobado y correlacionado) sobre una FE aprobada: se presenta Cancelado y la aprobación original queda como historial.
  // Es proyección de presentación: estado_sifen persistido, filtros e indicadores no cambian (el Estado del gateway sigue «Aprobado»).
  if (d.estadoSifen === "APROBADO" && d.eventosFe?.situacion === "CANCELADO") {
    return { tono: "anulado", texto: "Cancelado", detalle: `${d.eventosFe.detalle} Estado fiscal registrado: Aprobado (aprobación original).`, secundario: "Aprobación original conservada" };
  }

  // Estados fiscales finales registrados: sin línea secundaria (Envío OK o CDC informado nunca se muestran como si fueran el resultado).
  if (p.tono === "aprobado" || p.tono === "rechazado" || p.tono === "anulado") return { ...p, secundario: null };

  if (p.tono === "pendiente") {
    const secundario = esFaseXmlFirmado(d.estadoGatewayTexto) ? "XML firmado (sin decisión SIFEN)" : d.estadoLocal === "ENVIO_INDETERMINADO" ? "Envío indeterminado" : "Enviado";

    return { ...p, secundario };
  }

  switch (d.estadoLocal) {
    case "ERROR_ENVIO":
      return { ...p, secundario: d.envioErrorTipo === "RECHAZO" ? "Error de envío: validación del gateway (no es rechazo SIFEN)" : "Error de envío (no es rechazo SIFEN)" };
    case "ENVIANDO":
      return { ...p, secundario: "Enviando" };
    case "PENDIENTE_ENVIO":
      return { ...p, secundario: "Pendiente de envío" };
    default:
      return { ...p, secundario: null };
  }
}

/**
 * PRO-195-UX-R01-R01 (F003): la columna Eventos NUNCA afirma ausencia de eventos sin una lectura que la acredite: sin estado fiscal Cancelado/Inutilizado ni lectura de response.DE.Evento
 * se dice «Sin información de eventos». PRO-313-R01: con la proyección de eventos (eventos-fe.ts) se muestra su resumen (evento aprobado, rechazados, en revisión, lista vacía acreditada) y
 * la operación Cancelación con su estado REAL (no disponible y por qué, en revisión, plazo vencido, cancelado); Inutilización sigue no disponible (fuera de alcance). No se infiere
 * protocolo ni fecha, no se simula ningún evento y no se toca el stock.
 */
export type OperacionEvento = { nombre: "Cancelación" | "Inutilización"; estado: string };
export type EventosFila = { registrado: string | null; sinRegistro: string; operaciones: readonly OperacionEvento[]; operacion: string };

export const SIN_INFORMACION_EVENTOS = "Sin información de eventos";

/** Inutilización: fuera del alcance de PRO-313 (corresponde a numeración no utilizada, no a un documento emitido). */
export const MOTIVO_INUTILIZACION_NO_DISPONIBLE = "Inutilización no disponible en Nexit (corresponde a numeración no utilizada). No se simula ningún evento ni se modifica el stock.";

/** Motivo por defecto cuando no se conoce la elegibilidad (sin proyección): la cancelación no se ofrece. */
export const MOTIVO_EVENTOS_NO_DISPONIBLES = `Cancelación no disponible: falta la lectura de eventos y la fecha oficial de aprobación acreditada; el envío al gateway no está habilitado. ${MOTIVO_INUTILIZACION_NO_DISPONIBLE}`;

export const OPERACIONES_EVENTO: readonly OperacionEvento[] = [
  { nombre: "Cancelación", estado: "No disponible" },
  { nombre: "Inutilización", estado: "No disponible" },
];

export function eventosFila(d: { estadoSifen: EstadoSifen; eventosFe?: ProyeccionEventosFe | null }, cancelacion?: ElegibilidadCancelacion | null): EventosFila {
  const fiscal =
    d.estadoSifen === "CANCELADO" ? "Cancelado (estado fiscal informado por la API)" : d.estadoSifen === "INUTILIZADO" ? "Inutilizado (estado fiscal informado por la API)" : null;
  const proyectado = d.eventosFe && d.eventosFe.situacion !== "SIN_INFORMACION" ? d.eventosFe.texto : null;
  const operaciones: readonly OperacionEvento[] = cancelacion
    ? cancelacion.aplica
      ? [{ nombre: "Cancelación", estado: cancelacion.corto }, OPERACIONES_EVENTO[1]]
      : [OPERACIONES_EVENTO[1]]
    : OPERACIONES_EVENTO;
  const operacion = cancelacion ? `${cancelacion.disponible ? "Cancelación disponible." : cancelacion.motivo} ${MOTIVO_INUTILIZACION_NO_DISPONIBLE}` : MOTIVO_EVENTOS_NO_DISPONIBLES;

  return { registrado: fiscal ?? proyectado, sinRegistro: SIN_INFORMACION_EVENTOS, operaciones, operacion };
}

export type AccionFila = { clave: "kude" | "xml" | "consulta" | "correo"; visible: boolean; disponible: boolean; motivo: string };

export const MOTIVO_XML_NO_DISPONIBLE = "Descarga de XML no disponible: Nexit no tiene una operación comprobada para obtener el XML del gateway.";
export const MOTIVO_CORREO_NO_DISPONIBLE = "Envío de correo no disponible: Nexit no tiene una operación comprobada para (re)enviar el correo del documento.";

/**
 * Acciones de la fila, en orden fijo KuDE · XML · Consulta SIFEN · Correo.
 *  · KuDE: visible solo si kudeDisponible(d) (FE/NCE; la pantalla pasa ese resultado); consultar el KuDE no garantiza que el PDF exista ni que esté verificado.
 *  · Consulta SIFEN: visible solo con permiso de edición (ACL ya aplicada por la API); disponible según accionDisponible (sin acción en curso, listado vigente).
 *  · XML y Correo: visibles pero deshabilitados con su motivo (no hay endpoint).
 */
export function accionesFila(conKude: boolean, permisos: { editar: boolean }, consultaDisponible: boolean, motivoEspera: string): AccionFila[] {
  return [
    { clave: "kude", visible: conKude, disponible: conKude, motivo: "" },
    { clave: "xml", visible: true, disponible: false, motivo: MOTIVO_XML_NO_DISPONIBLE },
    { clave: "consulta", visible: permisos.editar, disponible: permisos.editar && consultaDisponible, motivo: consultaDisponible ? "" : motivoEspera },
    { clave: "correo", visible: true, disponible: false, motivo: MOTIVO_CORREO_NO_DISPONIBLE },
  ];
}

export type Seleccion = { contexto: string; ids: readonly string[] };

/** Ids seleccionados que siguen VISIBLES en el contexto actual. Otro contexto (filtros, página, empresa recargada) ⇒ selección vacía. */
export function seleccionVigente(s: Seleccion, contexto: string, visibles: readonly string[]): string[] {
  if (s.contexto !== contexto) return [];

  const v = new Set(visibles);

  return s.ids.filter((id) => v.has(id));
}

/** Marca o desmarca un id dentro del contexto actual (si la selección era de otro contexto, se descarta antes). */
export function alternarSeleccion(s: Seleccion, contexto: string, id: string, marcado: boolean): Seleccion {
  const base = s.contexto === contexto ? s.ids.filter((x) => x !== id) : [];

  return { contexto, ids: marcado ? [...base, id] : base };
}

/** Fecha y hora por separado a partir del texto ya formateado «dd/MM/yyyy HH:mm:ss» (sin reconvertir zona). */
export function partirFechaHora(texto: string): { fecha: string; hora: string } {
  const i = texto.indexOf(" ");

  return i < 0 ? { fecha: texto, hora: "" } : { fecha: texto.slice(0, i), hora: texto.slice(i + 1) };
}

/**
 * PRO-195-UX-R01-R01 (F001): claves del listado. El CONTEXTO visible (filas, selección, detalles, acciones e indicadores) sigue a la búsqueda ESCRITA (normalizada con
 * trim) desde la primera tecla; la PETICIÓN usa la búsqueda APLICADA tras el debounce y su propia página. Mientras ambas difieren, el resultado mostrado es de otro
 * contexto y la pantalla lo trata como obsoleto (no accionable). Sin cambios en el contrato de la API.
 */
export type ClavesListado = { claveFiltros: string; claveFiltrosAplicada: string; pagina: number; paginaAplicada: number };

export function clavesListado(escrita: string, aplicada: string, resto: readonly unknown[], paginacion: { clave: string; pagina: number }): ClavesListado {
  const claveFiltros = JSON.stringify([escrita.trim(), ...resto]);
  const claveFiltrosAplicada = JSON.stringify([aplicada, ...resto]);

  return {
    claveFiltros,
    claveFiltrosAplicada,
    pagina: paginacion.clave === claveFiltros ? paginacion.pagina : 1,
    paginaAplicada: paginacion.clave === claveFiltrosAplicada ? paginacion.pagina : 1,
  };
}

/**
 * PRO-195-UX-R01-R01 (F002): destino de la respuesta de una consulta SIFEN lanzada desde la fila.
 *  · Otra época de contexto (filtros, página, empresa recargada, o A→B→A aunque la clave textual vuelva a coincidir) ⇒ «descartar».
 *  · Misma época y detalle abierto AHORA (sea la apertura que sea: abierto después de lanzar, cerrado y reabierto) ⇒ «detalle» (fusión no regresiva del historial).
 *  · Misma época y detalle cerrado ⇒ «anuncio» en la cabecera del listado.
 * Nunca decide repetir la consulta ni reenviar el documento.
 */
export type DestinoConsulta = "descartar" | "detalle" | "anuncio";

export function destinoConsulta(e: { epocaAccion: number; epocaActual: number; contextoAccion: string; contextoActual: string; detalleAbierto: boolean }): DestinoConsulta {
  if (e.epocaAccion !== e.epocaActual || e.contextoAccion !== e.contextoActual) return "descartar";

  return e.detalleAbierto ? "detalle" : "anuncio";
}
