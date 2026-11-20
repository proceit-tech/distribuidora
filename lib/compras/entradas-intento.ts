/**
 * E6-A — ciclo de vida de UNA intención de registrar una entrada de Compras (misma política durable que «Nuevo movimiento», MOV-D01 / MOV-O07 / AUD-R08). Función pura con los envíos inyectados.
 *  · Al confirmar se fija el SNAPSHOT de la entrada (cabecera + todas las líneas) y se genera K1 UNA sola vez; mientras exista la intención el formulario está bloqueado y no se inicia otra.
 *  · ANTES de cualquier envío que pueda alterar stock, K1 + snapshot se reservan en PostgreSQL. Si la reserva falla no se envía nada y no queda intención local; si el servidor ya tiene una entrada
 *    pendiente de este operador (otra pestaña / sesión / visita anterior) se ADOPTA y solo se admite su reintento con SU K1.
 *  · Solo cierran la intención: la confirmación (seguida del reconocimiento explícito del operador, ACK) o un rechazo DEFINITIVO comprobado por el servidor. Red, tiempo agotado, 5xx, 401/403/409 o una
 *    respuesta ilegible = INDETERMINADO: la entrada PUEDE existir; se conserva K1 y el snapshot exacto; reintentar no duplica (la base serializa y devuelve la misma entrada).
 *  · No existe descarte de una intención incierta. Mientras se recupera (o si la recuperación falla) el registro nuevo está bloqueado: falla cerrado.
 */
import type { SnapshotEntrada } from "@/lib/compras/entradas-reglas";

export type ResultadoRegistroEntrada =
  | { tipo: "OK"; numero: string; entradaId: string; repetido: boolean }
  | { tipo: "RECHAZADO"; mensaje: string; definitivo: boolean }
  | { tipo: "INDETERMINADO"; mensaje: string };

export type ResultadoReservaEntrada =
  | { tipo: "RESERVADA" }
  | { tipo: "PENDIENTE_EXISTENTE"; clave: string; snapshot: SnapshotEntrada; confirmada: { numero: string; entradaId: string } | null }
  | { tipo: "PENDIENTE_NO_VISIBLE"; mensaje: string }
  | { tipo: "FALLO"; mensaje: string };

export type ResultadoAck = { ok: true } | { ok: false; mensaje: string };

export type EstadoEntrada = "LIBRE" | "ENVIANDO" | "INDETERMINADO" | "CONFIRMADA" | "RECUPERANDO" | "RECUPERACION_ERROR";

export type SalidaRegistroEntrada = ResultadoRegistroEntrada | { tipo: "OCUPADO" } | { tipo: "RECUPERADA"; mensaje: string } | { tipo: "NO_RESERVADA"; mensaje: string };

type Intento = { clave: string; snapshot: SnapshotEntrada; estado: "ENVIANDO" | "INDETERMINADO" | "CONFIRMADA"; reservada: boolean; numero?: string; entradaId?: string };

export const MENSAJE_INDETERMINADO_ENTRADA =
  "No se pudo confirmar el resultado: la entrada PUEDE haberse registrado. No cambie los datos: use «Reintentar la misma entrada» (no se duplica) o «Consultar resultado».";
export const MENSAJE_NO_RESERVADA_ENTRADA = "No se pudo preparar el registro: no se envió nada al stock. Puede intentarlo nuevamente.";
export const MENSAJE_RECUPERADA_ENTRADA =
  "Hay una entrada anterior sin resolver: PUEDE haberse registrado. Se recuperó la operación original (sus datos están bloqueados). Use «Consultar resultado» o «Reintentar la misma entrada» (no se duplica).";
export const mensajeSinAckEntrada = (numero: string) =>
  `La entrada ${numero} fue registrada correctamente. Pulse «Confirmar recepción» para poder registrar otra entrada.`;

export const MENSAJE_SALIDA_ENTRADA: Record<Exclude<EstadoEntrada, "LIBRE">, string> = {
  ENVIANDO: "Hay un registro en curso y todavía no se conoce su resultado: la entrada puede quedar registrada aunque salga. Podrá recuperarla al volver a «Nueva entrada». ¿Desea salir?",
  INDETERMINADO: "El resultado del registro es desconocido: la entrada puede haberse registrado. La operación queda guardada y podrá recuperarla al volver a «Nueva entrada». ¿Desea salir?",
  CONFIRMADA: "La entrada ya fue registrada, pero falta confirmar la recepción del resultado. Podrá hacerlo al volver a «Nueva entrada». ¿Desea salir?",
  RECUPERANDO: "Se está comprobando si hay una entrada anterior sin resolver. ¿Desea salir?",
  RECUPERACION_ERROR: "No se pudo comprobar si hay una entrada anterior sin resolver. ¿Desea salir?",
};

export function crearControlEntrada(deps: {
  generarClave: () => string;
  reservar: (clave: string, snapshot: SnapshotEntrada) => Promise<ResultadoReservaEntrada>;
  ejecutar: (clave: string) => Promise<ResultadoRegistroEntrada>;
  reconocer: (clave: string) => Promise<ResultadoAck>;
}) {
  let intento: Intento | null = null;
  // Nace bloqueado: hasta que la recuperación de la apertura termine no se admite una entrada nueva.
  let recuperacion: "RECUPERANDO" | "RECUPERACION_ERROR" | null = "RECUPERANDO";
  let ackEnCurso: Promise<ResultadoAck> | null = null;

  return {
    estado: (): EstadoEntrada => (recuperacion !== null ? recuperacion : intento === null ? "LIBRE" : intento.estado),
    bloqueado: () => intento !== null || recuperacion !== null,
    clave: () => intento?.clave ?? null,
    numero: () => intento?.numero ?? null,
    entradaId: () => intento?.entradaId ?? null,
    snapshot: () => (intento === null ? null : intento.snapshot),
    fijarRecuperacion(r: "RECUPERANDO" | "RECUPERACION_ERROR" | null) {
      recuperacion = r;
    },
    /** SOLO tras comprobar en el servidor que ya no hay entrada pendiente: libera la intención local. */
    liberarResuelta() {
      intento = null;
    },
    /** Adopta una intención ya reservada en el servidor: INDETERMINADA (reintentable solo con SU K1) o CONFIRMADA (pendiente de ACK). */
    adoptar(clave: string, snapshot: SnapshotEntrada, confirmada: { numero: string; entradaId: string } | null) {
      intento = { clave, snapshot: structuredClone(snapshot), estado: confirmada ? "CONFIRMADA" : "INDETERMINADO", reservada: true, ...(confirmada ?? {}) };
      recuperacion = null;
    },
    /** ACK idempotente: solo la confirmación inequívoca del servidor libera; llamadas simultáneas comparten la misma solicitud. No registra nada. */
    async reconocer(): Promise<ResultadoAck> {
      if (intento === null || intento.estado !== "CONFIRMADA") return { ok: false, mensaje: "No hay un resultado confirmado que reconocer." };
      if (ackEnCurso) return ackEnCurso;

      const clave = intento.clave;

      ackEnCurso = (async (): Promise<ResultadoAck> => {
        let r: ResultadoAck;

        try {
          r = await deps.reconocer(clave);
        } catch {
          r = { ok: false, mensaje: "No se pudo confirmar la recepción del resultado." };
        }
        if (r.ok) intento = null;

        return r;
      })().finally(() => {
        ackEnCurso = null;
      });

      return ackEnCurso;
    },
    /**
     * Inicia (o reintenta) el registro. La intención se fija de forma SÍNCRONA antes de cualquier await: un segundo clic recibe OCUPADO. Con un resultado indeterminado previo se reenvía EXACTAMENTE
     * la clave original (el servidor ejecuta el snapshot persistido; los datos de pantalla se ignoran).
     */
    async registrar(snapshot: SnapshotEntrada): Promise<SalidaRegistroEntrada> {
      if (recuperacion !== null) return { tipo: "OCUPADO" };
      if (intento !== null && (intento.estado === "ENVIANDO" || intento.estado === "CONFIRMADA")) return { tipo: "OCUPADO" };

      const actual: Intento = intento ?? { clave: deps.generarClave(), snapshot: structuredClone(snapshot), estado: "ENVIANDO", reservada: false };

      actual.estado = "ENVIANDO";
      intento = actual;

      if (!actual.reservada) {
        let rs: ResultadoReservaEntrada;

        try {
          rs = await deps.reservar(actual.clave, actual.snapshot);
        } catch {
          rs = { tipo: "FALLO", mensaje: MENSAJE_NO_RESERVADA_ENTRADA };
        }
        if (rs.tipo === "FALLO") {
          intento = null; // nada se envió a stock (si el servidor llegó a reservarla, la próxima reserva o la apertura la recuperan)

          return { tipo: "NO_RESERVADA", mensaje: rs.mensaje || MENSAJE_NO_RESERVADA_ENTRADA };
        }
        if (rs.tipo === "PENDIENTE_NO_VISIBLE") {
          intento = null;
          recuperacion = "RECUPERACION_ERROR";

          return { tipo: "NO_RESERVADA", mensaje: rs.mensaje };
        }
        if (rs.tipo === "PENDIENTE_EXISTENTE") {
          intento = { clave: rs.clave, snapshot: structuredClone(rs.snapshot), estado: rs.confirmada ? "CONFIRMADA" : "INDETERMINADO", reservada: true, ...(rs.confirmada ?? {}) };

          return { tipo: "RECUPERADA", mensaje: rs.confirmada ? mensajeSinAckEntrada(rs.confirmada.numero) : MENSAJE_RECUPERADA_ENTRADA };
        }
        actual.reservada = true;
      }

      let r: ResultadoRegistroEntrada;

      try {
        r = await deps.ejecutar(actual.clave);
      } catch {
        r = { tipo: "INDETERMINADO", mensaje: MENSAJE_INDETERMINADO_ENTRADA };
      }

      if (r.tipo === "OK") {
        // Confirmada en el servidor, pero NO libre hasta el reconocimiento (ACK) del operador.
        actual.estado = "CONFIRMADA";
        actual.numero = r.numero;
        actual.entradaId = r.entradaId;
      } else if (r.tipo === "RECHAZADO" && r.definitivo) {
        intento = null; // el servidor comprobó que nada se registró
      } else {
        actual.estado = "INDETERMINADO";
        if (r.tipo === "RECHAZADO") return { tipo: "INDETERMINADO", mensaje: `${r.mensaje} La entrada PUEDE haberse registrado; los datos siguen bloqueados.` };
      }

      return r;
    },
  };
}
