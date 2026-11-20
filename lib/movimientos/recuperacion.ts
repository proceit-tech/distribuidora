/**
 * MOV-O07 — recuperación en la apertura de «Nuevo movimiento» (falla CERRADO). Antes de habilitar un registro nuevo se pregunta al servidor por la intención pendiente del operador (PostgreSQL = fuente de verdad):
 *  · hay pendiente → se ADOPTA (K1 + snapshot originales), el formulario se muestra bloqueado con sus datos y solo se admite reintentarla con SU clave;
 *  · no hay → el formulario queda libre;
 *  · la consulta falla (API caída, sesión inválida, tiempo) → el registro nuevo permanece BLOQUEADO con error y «Reintentar»; nunca vuelve a modo libre por un fallo.
 * El payload recuperado es el snapshot guardado en el servidor, no lo que haya en pantalla; K1 jamás autentica (la titularidad la decide el servidor por sesión).
 */
import { MENSAJE_SIN_ACK, type EstadoIntento } from "@/lib/movimientos/intento";
import type { NuevoMovimientoStock } from "@/types/movimientos-stock";

export type IntencionRecuperada = { clave: string; estado: string; snapshot: Record<string, unknown>; creadoEn: string; requiereRevision: boolean; evidenciaNumero: string | null };
export type ConsultaIntencion = { ok: true; intencion: IntencionRecuperada | null } | { ok: false; mensaje: string };

type ControlRecuperable = {
  fijarRecuperacion: (r: "RECUPERANDO" | "RECUPERACION_ERROR" | null) => void;
  adoptar: (clave: string, payload: NuevoMovimientoStock, confirmada?: { numero: string }) => void;
  liberarResuelta: () => void;
  clave: () => string | null;
  estado: () => EstadoIntento;
};

const texto = (v: unknown) => (typeof v === "string" ? v : "");

/** Formulario (solo lectura) reconstruido del snapshot persistido; la fecha original se conserva tal cual. */
export function formularioDesdeSnapshot(s: Record<string, unknown>): NuevoMovimientoStock {
  return {
    tipo: s.tipo as NuevoMovimientoStock["tipo"], origen: s.origen as NuevoMovimientoStock["origen"], fecha: texto(s.fecha), productoId: texto(s.productoId), cantidad: Number(s.cantidad) || 0,
    costoUnitario: s.costo === null || s.costo === undefined ? null : Number(s.costo), depositoOrigenId: texto(s.origenId), depositoDestinoId: texto(s.destinoId), lote: texto(s.lote),
    fechaVencimiento: texto(s.vencimiento), documentoReferencia: texto(s.documento), motivo: texto(s.motivo), observacion: texto(s.observacion), claveIdempotencia: "",
  };
}

/** Texto en español de Paraguay sobre la operación recuperada; nunca afirma que se canceló o no se registró. */
export function mensajeRecuperada(i: IntencionRecuperada): string {
  const base = "Hay un registro anterior sin resolver: el movimiento PUEDE haberse registrado. Se recuperó la operación original y sus datos están bloqueados.";
  const evidencia = i.evidenciaNumero ? ` El sistema encontró el movimiento original: ${i.evidenciaNumero}. Use «Reintentar el mismo registro» para confirmarlo (no se duplica).` : " Use «Consultar resultado» o «Reintentar el mismo registro» (no se duplica).";
  const revision = i.requiereRevision ? " Esta operación lleva más de 7 días sin resolverse y requiere revisión; no se liberó ni se descartó." : "";

  return base + evidencia + revision;
}

export async function recuperarIntencion(
  control: ControlRecuperable,
  consultar: () => Promise<ConsultaIntencion>,
): Promise<{ estado: "LIBRE" } | { estado: "INDETERMINADO" | "CONFIRMADA"; formulario: NuevoMovimientoStock; mensaje: string } | { estado: "ERROR"; mensaje: string }> {
  control.fijarRecuperacion("RECUPERANDO");

  let r: ConsultaIntencion;

  try {
    r = await consultar();
  } catch {
    r = { ok: false, mensaje: "No se pudo comprobar si hay un registro anterior sin resolver." };
  }

  if (!r.ok) {
    control.fijarRecuperacion("RECUPERACION_ERROR");

    return { estado: "ERROR", mensaje: `${r.mensaje} El registro nuevo permanece bloqueado hasta poder comprobarlo.` };
  }
  if (r.intencion === null) {
    control.fijarRecuperacion(null);

    return { estado: "LIBRE" };
  }

  const formulario = formularioDesdeSnapshot(r.intencion.snapshot);

  // CONFIRMADA en el servidor y aún no reconocida: se muestra el número ORIGINAL (jamás como indeterminada ni como libre) y se exige el reconocimiento antes de una operación nueva.
  if (r.intencion.estado === "CONFIRMADA" && r.intencion.evidenciaNumero) {
    control.adoptar(r.intencion.clave, formulario, { numero: r.intencion.evidenciaNumero });

    return { estado: "CONFIRMADA", formulario, mensaje: MENSAJE_SIN_ACK(r.intencion.evidenciaNumero) };
  }

  control.adoptar(r.intencion.clave, formulario);

  return { estado: "INDETERMINADO", formulario, mensaje: mensajeRecuperada(r.intencion) };
}

type ControlReconocible = { reconocer: () => Promise<{ ok: true } | { ok: false; mensaje: string }>; numero: () => string | null };
const confirmandoRecepcion = new WeakMap<object, Promise<void>>();

/**
 * MOV-R09-01 — «Confirmar recepción»: ÚNICO camino que reconoce (ACK) una intención CONFIRMADA y solo por una acción EXPLÍCITA del operador, después de mostrarle el número original. Reutiliza `control.reconocer()`.
 * Un doble clic comparte la misma solicitud y el resultado se aplica UNA vez; una respuesta posterior al desmontaje no navega ni cambia estado; un fallo deja la intención CONFIRMADA (reintentable).
 */
export function confirmarRecepcionOperador(control: ControlReconocible, vigente: () => boolean, ev: { alExito: (numero: string) => void; alFallo: (mensaje: string) => void }): Promise<void> {
  const previo = confirmandoRecepcion.get(control);

  if (previo) return previo;

  const numero = control.numero();
  const p = (async () => {
    const a = await control.reconocer();

    if (!vigente()) return;
    if (a.ok && numero) ev.alExito(numero);
    else if (!a.ok) ev.alFallo(a.mensaje);
  })().finally(() => {
    confirmandoRecepcion.delete(control);
  });

  confirmandoRecepcion.set(control, p);

  return p;
}

/** «Consultar resultado» (solo lectura): informa la evidencia; si el servidor ya no tiene la intención pendiente, fue resuelta (otra pestaña/sesión) y se libera la local. */
export async function consultarResultado(control: ControlRecuperable, consultar: () => Promise<ConsultaIntencion>): Promise<{ liberada: boolean; mensaje: string }> {
  let r: ConsultaIntencion;

  try {
    r = await consultar();
  } catch {
    r = { ok: false, mensaje: "No se pudo consultar el resultado." };
  }
  if (!r.ok) return { liberada: false, mensaje: `${r.mensaje} El movimiento PUEDE haberse registrado; los datos siguen bloqueados.` };
  if (r.intencion === null) {
    control.liberarResuelta();

    return { liberada: true, mensaje: "La operación original ya fue resuelta. Verifique el resultado en Movimientos antes de continuar." };
  }

  if (r.intencion.estado === "CONFIRMADA" && r.intencion.evidenciaNumero) {
    if (control.estado() !== "CONFIRMADA") control.adoptar(r.intencion.clave, formularioDesdeSnapshot(r.intencion.snapshot), { numero: r.intencion.evidenciaNumero });

    return { liberada: false, mensaje: MENSAJE_SIN_ACK(r.intencion.evidenciaNumero) };
  }

  return { liberada: false, mensaje: mensajeRecuperada(r.intencion) };
}
