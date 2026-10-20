/**
 * MOV-D01 / MOV-O07 — ciclo de vida de UNA intención de registrar un movimiento. Función pura con los envíos inyectados (se prueba sin navegador).
 *
 * Al iniciar se toma un SNAPSHOT del payload validado y se genera la clave de idempotencia K1 UNA sola vez. Mientras exista la intención (enviando o con resultado indeterminado) el formulario está bloqueado,
 * la clave y el payload no cambian y no se inicia otra intención. Solo un resultado conclusivo la cierra:
 *  · OK (incluye «ya estaba registrado», `repetido`) → el movimiento original quedó confirmado;
 *  · RECHAZADO (el servidor evaluó y NO registró: validación, permisos, saldo…) → nada se grabó, se libera el formulario y la próxima vez se usa una clave nueva;
 *  · INDETERMINADO (red, tiempo agotado, 5xx, respuesta ilegible) → el movimiento PUEDE haberse registrado: se conservan K1 y el payload exacto; el reintento reenvía exactamente eso.
 * PRO-185: la intención recuerda su HISTORIAL. Si alguna vez fue indeterminada, un rechazo posterior NO probado como definitivo (401/403/400/409, cuerpo ilegible…) no libera nada: K1 y el snapshot se conservan.
 *
 * MOV-O07 (modo DURABLE, con `reservar`): ANTES de cualquier envío que pueda alterar stock, K1 + snapshot se reservan en el servidor (PostgreSQL). Si la reserva falla NO se envía nada a stock y no queda intención local;
 * si el servidor ya tiene una intención pendiente de este operador (otra pestaña / sesión / visita anterior) esa se ADOPTA (RECUPERADA): se bloquea el formulario con su snapshot y solo se admite su reintento con SU K1.
 * No existe descarte de una intención incierta: solo una confirmación, o un rechazo DEFINITIVO comprobado por el servidor (`definitivo`), la cierran. Mientras se recupera (o si la recuperación falla) el registro
 * nuevo está bloqueado: falla cerrado.
 */
import type { NuevoMovimientoStock } from "@/types/movimientos-stock";

export type ResultadoRegistro =
  | { tipo: "OK"; numero: string; repetido: boolean }
  | { tipo: "RECHAZADO"; mensaje: string; estado: number; /** el servidor comprobó que NO existe el movimiento (rechazo definitivo): libera aunque hubiera una tentativa indeterminada */ definitivo?: boolean }
  | { tipo: "INDETERMINADO"; mensaje: string };

export type ResultadoReserva =
  | { tipo: "RESERVADA" }
  | { tipo: "PENDIENTE_EXISTENTE"; clave: string; payload: NuevoMovimientoStock; requiereRevision: boolean; evidenciaNumero: string | null }
  | { tipo: "FALLO"; mensaje: string };

export type EstadoIntento = "LIBRE" | "ENVIANDO" | "INDETERMINADO" | "RECUPERANDO" | "RECUPERACION_ERROR";

type Intento = { clave: string; payload: NuevoMovimientoStock; estado: "ENVIANDO" | "INDETERMINADO"; huboIndeterminado: boolean; reservada: boolean };

export type SalidaRegistro = ResultadoRegistro | { tipo: "OCUPADO" } | { tipo: "RECUPERADA"; mensaje: string } | { tipo: "NO_RESERVADA"; mensaje: string };

export const MENSAJE_INDETERMINADO = "No se pudo confirmar el resultado: el movimiento PUEDE haberse registrado. No cambie los datos: reintente con «Reintentar el mismo registro» (no se duplica) o verifique en Movimientos.";

export const MENSAJE_RECUPERADA = "Hay un registro anterior sin resolver: el movimiento PUEDE haberse registrado. Se recuperó la operación original (sus datos están bloqueados). Use «Consultar resultado» o «Reintentar el mismo registro» (no se duplica).";

export const MENSAJE_NO_RESERVADA = "No se pudo preparar el registro: no se envió ningún movimiento al stock. Puede intentarlo nuevamente.";

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
  else if (r.tipo === "RECHAZADO" || r.tipo === "INDETERMINADO" || r.tipo === "RECUPERADA" || r.tipo === "NO_RESERVADA") acciones.alMensaje(r.mensaje);

  return true;
}

export const MENSAJE_SALIDA: Record<Exclude<EstadoIntento, "LIBRE">, string> = {
  ENVIANDO: "Hay un registro en curso y todavía no se conoce su resultado: el movimiento puede quedar registrado aunque salga de esta pantalla. Podrá recuperarlo al volver a «Nuevo movimiento» y verificarlo en Movimientos. ¿Desea salir?",
  INDETERMINADO: "El resultado del registro anterior es desconocido: el movimiento puede haberse registrado. La operación queda guardada y podrá recuperarla al volver a «Nuevo movimiento» y verificarla en Movimientos. ¿Desea salir?",
  RECUPERANDO: "Se está comprobando si hay un registro anterior sin resolver. ¿Desea salir?",
  RECUPERACION_ERROR: "No se pudo comprobar si hay un registro anterior sin resolver. ¿Desea salir?",
};

export function crearControlRegistro(deps: {
  generarClave: () => string;
  enviar: (datos: NuevoMovimientoStock & { claveIdempotencia: string }) => Promise<ResultadoRegistro>;
  /** Modo durable (MOV-O07): reserva K1 + snapshot en el servidor antes de enviar. Sin esta dependencia se conserva el comportamiento de MOV-D01. */
  reservar?: (datos: NuevoMovimientoStock & { claveIdempotencia: string }) => Promise<ResultadoReserva>;
  /** Modo durable: el control nace bloqueado hasta que la recuperación de la apertura termina. */
  iniciarRecuperando?: boolean;
}) {
  let intento: Intento | null = null;
  let recuperacion: "RECUPERANDO" | "RECUPERACION_ERROR" | null = deps.iniciarRecuperando ? "RECUPERANDO" : null;

  return {
    estado: (): EstadoIntento => (recuperacion !== null ? recuperacion : intento === null ? "LIBRE" : intento.estado),
    /** Hay una intención abierta (o se está recuperando): ningún campo puede modificarse y no puede iniciarse otra. */
    bloqueado: () => intento !== null || recuperacion !== null,
    clave: () => intento?.clave ?? null,
    payload: () => (intento === null ? null : intento.payload),
    /** Marca la recuperación de la apertura: en curso, fallida (cerrado) o terminada sin pendiente (null). */
    fijarRecuperacion(r: "RECUPERANDO" | "RECUPERACION_ERROR" | null) {
      recuperacion = r;
    },
    /** SOLO tras comprobar en el servidor que ya no hay intención pendiente (confirmada o rechazada en otra pestaña/sesión): libera la intención local. */
    liberarResuelta() {
      intento = null;
    },
    /** Adopta una intención ya reservada en el servidor (recuperada): queda INDETERMINADA, bloqueada y reintentable solo con SU K1. */
    adoptar(clave: string, payload: NuevoMovimientoStock) {
      intento = { clave, payload: structuredClone(payload), estado: "INDETERMINADO", huboIndeterminado: true, reservada: true };
      recuperacion = null;
    },
    /**
     * Inicia (o reintenta) el registro. La reserva de la intención ocurre de forma SÍNCRONA antes de cualquier await: un segundo submit consecutivo recibe OCUPADO. Con un resultado indeterminado previo
     * se reenvía EXACTAMENTE el payload y la clave originales (los `datos` actuales se ignoran).
     */
    async registrar(datos: NuevoMovimientoStock): Promise<SalidaRegistro> {
      if (recuperacion !== null) return { tipo: "OCUPADO" };
      if (intento !== null && intento.estado === "ENVIANDO") return { tipo: "OCUPADO" };

      const actual: Intento = intento ?? { clave: deps.generarClave(), payload: structuredClone(datos), estado: "ENVIANDO", huboIndeterminado: false, reservada: false };

      actual.estado = "ENVIANDO";
      intento = actual;

      if (deps.reservar && !actual.reservada) {
        let rs: ResultadoReserva;

        try {
          rs = await deps.reservar({ ...actual.payload, claveIdempotencia: actual.clave });
        } catch {
          rs = { tipo: "FALLO", mensaje: MENSAJE_NO_RESERVADA };
        }
        if (rs.tipo === "FALLO") {
          intento = null; // nada se envió a stock: sin intención local (si el servidor llegó a reservarla, la próxima reserva la recupera)

          return { tipo: "NO_RESERVADA", mensaje: rs.mensaje || MENSAJE_NO_RESERVADA };
        }
        if (rs.tipo === "PENDIENTE_EXISTENTE") {
          intento = { clave: rs.clave, payload: structuredClone(rs.payload), estado: "INDETERMINADO", huboIndeterminado: true, reservada: true };

          return { tipo: "RECUPERADA", mensaje: MENSAJE_RECUPERADA };
        }
        actual.reservada = true;
      }

      let r: ResultadoRegistro;

      try {
        r = await deps.enviar({ ...actual.payload, claveIdempotencia: actual.clave });
      } catch {
        r = { tipo: "INDETERMINADO", mensaje: MENSAJE_INDETERMINADO };
      }

      if (r.tipo === "RECHAZADO" && actual.huboIndeterminado && !r.definitivo) {
        // PRO-185: tras una tentativa indeterminada el rechazo NO es conclusivo; se conserva K1 y el snapshot.
        actual.estado = "INDETERMINADO";

        return { tipo: "INDETERMINADO", mensaje: mensajeRechazoTrasIndeterminado(r.mensaje, r.estado) };
      }

      if (r.tipo === "INDETERMINADO") {
        actual.estado = "INDETERMINADO";
        actual.huboIndeterminado = true;
      } else {
        intento = null; // conclusivo: confirmado, o rechazado sin grabar (probado)
      }

      return r;
    },
  };
}
