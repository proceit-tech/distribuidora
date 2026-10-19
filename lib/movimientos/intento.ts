/**
 * MOV-D01 — ciclo de vida de UNA intención de registrar un movimiento. Función pura con el envío inyectado (se prueba sin navegador).
 *
 * Al iniciar se toma un SNAPSHOT del payload validado y se genera la clave de idempotencia K1 UNA sola vez. Mientras exista la intención (enviando o con resultado indeterminado) el formulario está bloqueado,
 * la clave y el payload no cambian y no se inicia otra intención. Solo un resultado conclusivo la cierra:
 *  · OK (incluye «ya estaba registrado», `repetido`) → el movimiento original quedó confirmado;
 *  · RECHAZADO (el servidor evaluó y NO registró: validación, permisos, saldo…) → nada se grabó, se libera el formulario y la próxima vez se usa una clave nueva;
 *  · INDETERMINADO (red, tiempo agotado, 5xx, respuesta ilegible) → el movimiento PUEDE haberse registrado: se conservan K1 y el payload exacto; el reintento reenvía exactamente eso.
 * Una intención nueva tras un resultado indeterminado solo nace por `descartarIndeterminado()` (decisión explícita del operador, advertida en la pantalla).
 */
import type { NuevoMovimientoStock } from "@/types/movimientos-stock";

export type ResultadoRegistro =
  | { tipo: "OK"; numero: string; repetido: boolean }
  | { tipo: "RECHAZADO"; mensaje: string; estado: number }
  | { tipo: "INDETERMINADO"; mensaje: string };

export type EstadoIntento = "LIBRE" | "ENVIANDO" | "INDETERMINADO";

type Intento = { clave: string; payload: NuevoMovimientoStock; estado: "ENVIANDO" | "INDETERMINADO" };

export type SalidaRegistro = ResultadoRegistro | { tipo: "OCUPADO" };

export const MENSAJE_INDETERMINADO = "No se pudo confirmar el resultado: el movimiento PUEDE haberse registrado. No cambie los datos: reintente con «Reintentar el mismo registro» (no se duplica) o verifique en Movimientos.";

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

      const actual: Intento = intento ?? { clave: deps.generarClave(), payload: structuredClone(datos), estado: "ENVIANDO" };

      actual.estado = "ENVIANDO";
      intento = actual;

      let r: ResultadoRegistro;

      try {
        r = await deps.enviar({ ...actual.payload, claveIdempotencia: actual.clave });
      } catch {
        r = { tipo: "INDETERMINADO", mensaje: MENSAJE_INDETERMINADO };
      }

      if (r.tipo === "INDETERMINADO") actual.estado = "INDETERMINADO";
      else intento = null; // conclusivo: confirmado o rechazado sin grabar

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
