/**
 * MOV-D01 — ciclo de vida de UNA intención de registrar un movimiento. Función pura con el envío inyectado (se prueba sin navegador).
 *
 * Al iniciar se toma un SNAPSHOT del payload validado y se genera la clave de idempotencia K1 UNA sola vez. Mientras exista la intención (enviando o con resultado indeterminado) el formulario está bloqueado,
 * la clave y el payload no cambian y no se inicia otra intención. Solo un resultado conclusivo la cierra:
 *  · OK (incluye «ya estaba registrado», `repetido`) → el movimiento original quedó confirmado;
 *  · RECHAZADO (el servidor evaluó y NO registró: validación, permisos, saldo…) → nada se grabó, se libera el formulario y la próxima vez se usa una clave nueva;
 *  · INDETERMINADO (red, tiempo agotado, 5xx, respuesta ilegible) → el movimiento PUEDE haberse registrado: se conservan K1 y el payload exacto; el reintento reenvía exactamente eso.
 * Una intención nueva tras un resultado indeterminado solo nace por `descartarIndeterminado()` (decisión explícita del operador, advertida en la pantalla).
 * PRO-185: la intención recuerda su HISTORIAL. Si alguna vez fue indeterminada, un rechazo posterior (401/403/400/409, cuerpo ilegible…) NO prueba que el movimiento anterior no exista (el servidor puede haber rechazado antes
 * de consultar la clave): K1 y el snapshot se conservan, el formulario sigue bloqueado y el reintento con la misma clave sigue disponible. Solo un rechazo en la PRIMERA tentativa (sin historial indeterminado) libera el formulario.
 */
import type { NuevoMovimientoStock } from "@/types/movimientos-stock";

export type ResultadoRegistro =
  | { tipo: "OK"; numero: string; repetido: boolean }
  | { tipo: "RECHAZADO"; mensaje: string; estado: number }
  | { tipo: "INDETERMINADO"; mensaje: string };

export type EstadoIntento = "LIBRE" | "ENVIANDO" | "INDETERMINADO";

type Intento = { clave: string; payload: NuevoMovimientoStock; estado: "ENVIANDO" | "INDETERMINADO"; huboIndeterminado: boolean };

export type SalidaRegistro = ResultadoRegistro | { tipo: "OCUPADO" };

export const MENSAJE_INDETERMINADO = "No se pudo confirmar el resultado: el movimiento PUEDE haberse registrado. No cambie los datos: reintente con «Reintentar el mismo registro» (no se duplica) o verifique en Movimientos.";

/** Rechazo HTTP recibido en un reintento cuando una tentativa anterior quedó indeterminada: el movimiento anterior PUEDE existir. Nunca afirma que no se registró. */
export const mensajeRechazoTrasIndeterminado = (mensaje: string, estado: number) =>
  `El servidor rechazó el reintento (${mensaje} · código ${estado}), pero el intento anterior no se pudo confirmar: el movimiento PUEDE haberse registrado. Los datos siguen bloqueados; reintente con «Reintentar el mismo registro» cuando se resuelva la causa (no se duplica) o verifique en Movimientos.`;

/**
 * PRO-186: aplica el resultado de un registro SOLO si la instancia de la pantalla sigue vigente. Abandonada la pantalla, no hay navegación, mensajes ni cambios visuales (el POST en el servidor no se cancela ni se confirma por ello).
 */
export function aplicarResultadoSiVigente(
  r: SalidaRegistro,
  vigente: () => boolean,
  acciones: { alRegistrar: (numero: string) => void; alMensaje: (mensaje: string) => void; alEstado: () => void },
): boolean {
  if (!vigente()) return false;
  acciones.alEstado();
  if (r.tipo === "OK") acciones.alRegistrar(r.numero);
  else if (r.tipo === "RECHAZADO" || r.tipo === "INDETERMINADO") acciones.alMensaje(r.mensaje);

  return true;
}

export const MENSAJE_SALIDA: Record<Exclude<EstadoIntento, "LIBRE">, string> = {
  ENVIANDO: "Hay un registro en curso y todavía no se conoce su resultado: el movimiento puede quedar registrado aunque salga de esta pantalla. Verifique el resultado en Movimientos. ¿Desea salir?",
  INDETERMINADO: "El resultado del registro anterior es desconocido: el movimiento puede haberse registrado. Verifique en Movimientos antes de repetirlo. ¿Desea salir?",
};

export function crearControlRegistro(deps: { generarClave: () => string; enviar: (datos: NuevoMovimientoStock & { claveIdempotencia: string }) => Promise<ResultadoRegistro> }) {
  let intento: Intento | null = null;

  return {
    estado: (): EstadoIntento => (intento === null ? "LIBRE" : intento.estado),
    /** Hay una intención abierta: ningún campo puede modificarse y no puede iniciarse otra. */
    bloqueado: () => intento !== null,
    clave: () => intento?.clave ?? null,
    payload: () => (intento === null ? null : intento.payload),
    /**
     * Inicia (o reintenta) el registro. La reserva de la intención ocurre de forma SÍNCRONA antes de cualquier await: un segundo submit consecutivo recibe OCUPADO. Con un resultado indeterminado previo
     * se reenvía EXACTAMENTE el payload y la clave originales (los `datos` actuales se ignoran).
     */
    async registrar(datos: NuevoMovimientoStock): Promise<SalidaRegistro> {
      if (intento !== null && intento.estado === "ENVIANDO") return { tipo: "OCUPADO" };

      const actual: Intento = intento ?? { clave: deps.generarClave(), payload: structuredClone(datos), estado: "ENVIANDO", huboIndeterminado: false };

      actual.estado = "ENVIANDO";
      intento = actual;

      let r: ResultadoRegistro;

      try {
        r = await deps.enviar({ ...actual.payload, claveIdempotencia: actual.clave });
      } catch {
        r = { tipo: "INDETERMINADO", mensaje: MENSAJE_INDETERMINADO };
      }

      if (r.tipo === "RECHAZADO" && actual.huboIndeterminado) {
        // PRO-185: tras una tentativa indeterminada el rechazo NO es conclusivo; se conserva K1 y el snapshot.
        actual.estado = "INDETERMINADO";

        return { tipo: "INDETERMINADO", mensaje: mensajeRechazoTrasIndeterminado(r.mensaje, r.estado) };
      }

      if (r.tipo === "INDETERMINADO") {
        actual.estado = "INDETERMINADO";
        actual.huboIndeterminado = true;
      } else {
        intento = null; // conclusivo: confirmado, o rechazado en la primera tentativa sin grabar
      }

      return r;
    },
    /** Decisión EXPLÍCITA del operador de dejar la intención indeterminada y empezar otra (la pantalla advierte que la anterior puede haberse registrado). */
    descartarIndeterminado(): boolean {
      if (intento === null || intento.estado !== "INDETERMINADO") return false;
      intento = null;

      return true;
    },
  };
}
