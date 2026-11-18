/**
 * PRO-195-UX-R01 — Ayudas PURAS de la tabla compacta de «Documentos electrónicos» (sin React, sin DOM, sin red). Solo deciden QUÉ se muestra a partir de lo persistido;
 * nunca cambian estado_sifen, estado_local, CDC, lote ni reglas fiscales, y no inventan estados, eventos, respuestas ni operaciones.
 *
 *  · estadoPrincipalFila: UN solo estado principal por documento (presentacionSifen, ya auditado) + una línea secundaria con la fase técnica real (Enviado,
 *    XML firmado, Envío indeterminado, Error de envío…). Aprobado y Rechazado nunca coexisten: salen del ÚNICO estado fiscal persistido. Un error de transporte o
 *    de validación del gateway se dice como tal, nunca como rechazo SIFEN.
 *  · eventosFila: columna Eventos. Cancelación e Inutilización NO tienen API ni contrato comprobado (PRO-199 suspendida, PRO-313 guardas): solo se informa el estado
 *    fiscal ya registrado (si la API informó Cancelado/Inutilizado) y la indisponibilidad honesta de la operación.
 *  · accionesFila: acciones directas de la fila según operaciones REALES: KuDE (endpoint existente, solo FE/NCE), consulta SIFEN (endpoint existente, permiso editar);
 *    XML y correo NO tienen endpoint en Nexit: se muestran deshabilitados con su motivo.
 *  · seleccionVigente: la selección solo vale en el contexto (filtros + página) donde se hizo y solo para filas visibles; no habilita ninguna acción masiva.
 */
import { esFaseXmlFirmado, type EstadoLocal, type EstadoSifen } from "@/lib/facturacion/estados";
import { presentacionSifen, type TonoSifen } from "@/lib/facturacion/presentacion-sifen";

export type EstadoFila = { tono: TonoSifen; texto: string; detalle: string; secundario: string | null };

type DocEstado = { estadoLocal: EstadoLocal; estadoSifen: EstadoSifen; estadoGatewayTexto?: string | null; ultimaConsultaAt?: string | null; envioErrorTipo?: string | null };

export function estadoPrincipalFila(d: DocEstado): EstadoFila {
  const p = presentacionSifen(d);

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

export type EventosFila = { registrado: string | null; operacion: string };

/** Motivo ÚNICO de indisponibilidad de los eventos (sin API ni contrato del proveedor). */
export const MOTIVO_EVENTOS_NO_DISPONIBLES =
  "Cancelación e Inutilización: operaciones no disponibles en Nexit (sin API ni contrato comprobado del proveedor). No se simula ningún evento ni se modifica el stock.";

export function eventosFila(d: { estadoSifen: EstadoSifen }): EventosFila {
  const registrado =
    d.estadoSifen === "CANCELADO" ? "Cancelado (estado fiscal informado por la API)" : d.estadoSifen === "INUTILIZADO" ? "Inutilizado (estado fiscal informado por la API)" : null;

  return { registrado, operacion: MOTIVO_EVENTOS_NO_DISPONIBLES };
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
