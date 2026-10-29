import type {
  CatalogoMovimientos,
  MovimientoStockDetalle,
  MovimientoStockFila,
  NuevoMovimientoStock,
} from "@/types/movimientos-stock";
import { MENSAJE_INDETERMINADO, MENSAJE_NO_RESERVADA, mensajeRechazoTrasIndeterminado, type ResultadoReconocimiento, type ResultadoRegistro, type ResultadoReserva } from "@/lib/movimientos/intento";
import { formularioDesdeSnapshot, type ConsultaIntencion, type IntencionRecuperada } from "@/lib/movimientos/recuperacion";

async function mensajeError(r: Response, porDefecto: string) {
  try {
    return ((await r.json()) as { error?: string }).error || porDefecto;
  } catch {
    return porDefecto;
  }
}

export type RespuestaHistorial = {
  movimientos: MovimientoStockFila[];
  /** Líneas que cumplen el filtro (cada fila de la tabla es una línea). */
  total: number;
  /** Movimientos distintos que cumplen el filtro. */
  totalMovimientos: number;
  pagina: number;
  tamano: number;
  totalPaginas: number;
  resumen: { movimientos: number; entradas: number; salidas: number; transferencias: number };
  /** Presente solo si se pidió confirmar un número de movimiento. */
  confirmado?: boolean;
  /** Permisos de la sesión, solo para mostrar atajos (INV-02). */
  permisos?: { crear: boolean };
};

export type ConsultaHistorialCliente = { q?: string; tipo?: string; orden?: string; dir?: string; pagina?: number; tamano?: number; confirmar?: string };

export async function cargarMovimientos(consulta: ConsultaHistorialCliente = {}): Promise<RespuestaHistorial> {
  const p = new URLSearchParams();

  for (const [k, v] of Object.entries(consulta)) if (v !== undefined && v !== "") p.set(k, String(v));

  const r = await fetch(`/api/movimientos${p.size ? `?${p.toString()}` : ""}`, { cache: "no-store" });
  if (!r.ok) throw new Error(await mensajeError(r, "No fue posible cargar los movimientos."));
  return (await r.json()) as RespuestaHistorial;
}

export async function cargarCatalogosMovimientos(): Promise<CatalogoMovimientos> {
  const r = await fetch("/api/movimientos?modo=catalogos", { cache: "no-store" });
  if (!r.ok) throw new Error(await mensajeError(r, "No fue posible cargar los catálogos."));
  return ((await r.json()) as { catalogos: CatalogoMovimientos }).catalogos;
}

export type RespuestaMovimiento = { movimiento: MovimientoStockDetalle; permisos: { anular: boolean; crear: boolean } };

export async function cargarMovimiento(id: string): Promise<RespuestaMovimiento | null> {
  const r = await fetch(`/api/movimientos/${id}`, { cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(await mensajeError(r, "No fue posible cargar el movimiento."));
  const j = (await r.json()) as { movimiento: MovimientoStockDetalle; permisos?: RespuestaMovimiento["permisos"] };
  return { movimiento: j.movimiento, permisos: j.permisos ?? { anular: false, crear: false } };
}

/**
 * MOV-D01: resultado CLASIFICADO del POST. OK = registrado (también «ya estaba registrado»); RECHAZADO = el servidor respondió 4xx (salvo 408): evaluó y no grabó; INDETERMINADO = red, 408, 5xx o respuesta
 * ilegible: no se sabe si se grabó (el reintento con la MISMA clave es seguro por NEX-014).
 */
export async function registrarMovimientoResultado(datos: NuevoMovimientoStock, enviar: (url: string, init: RequestInit) => Promise<Response> = (u, i) => fetch(u, i)): Promise<ResultadoRegistro> {
  let r: Response;

  try {
    r = await enviar("/api/movimientos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos) });
  } catch {
    return { tipo: "INDETERMINADO", mensaje: MENSAJE_INDETERMINADO };
  }

  if (r.ok) {
    try {
      const j = (await r.json()) as { movimiento: { numero: string }; repetido?: boolean };

      return { tipo: "OK", numero: j.movimiento.numero, repetido: j.repetido === true };
    } catch {
      return { tipo: "INDETERMINADO", mensaje: MENSAJE_INDETERMINADO };
    }
  }

  if (r.status >= 400 && r.status < 500 && r.status !== 408) {
    // Un rechazo solo es conclusivo si el cuerpo es el error JSON de la API; una respuesta ilegible (p. ej. de un intermediario) se trata de forma conservadora como indeterminada.
    try {
      const j = (await r.json()) as { error?: unknown };

      if (typeof j.error === "string" && j.error.trim()) return { tipo: "RECHAZADO", estado: r.status, mensaje: j.error };
    } catch {
      // cuerpo ilegible
    }

    return { tipo: "INDETERMINADO", mensaje: MENSAJE_INDETERMINADO };
  }

  return { tipo: "INDETERMINADO", mensaje: MENSAJE_INDETERMINADO };
}

export async function registrarMovimientoApi(datos: NuevoMovimientoStock): Promise<string> {
  const r = await registrarMovimientoResultado(datos);

  if (r.tipo === "OK") return r.numero;

  throw new Error(r.mensaje);
}

/** claveIdempotencia: la misma clave en reintentos de la misma anulación (doble clic, corte de red) evita anular dos veces. */
export async function anularMovimientoApi(id: string, motivo: string, claveIdempotencia: string = crypto.randomUUID()): Promise<string> {
  const r = await fetch(`/api/movimientos/${id}/anular`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ motivo, claveIdempotencia }),
  });
  if (!r.ok) throw new Error(await mensajeError(r, "No fue posible anular el movimiento."));
  return ((await r.json()) as { message: string }).message;
}

// ── MOV-O07: intención DURABLE (reservar → ejecutar con SU K1; consultar/recuperar) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
type Enviar = (url: string, init?: RequestInit) => Promise<Response>;
const enviarPorDefecto: Enviar = (u, i) => fetch(u, i);
const jsonDe = async (r: Response): Promise<Record<string, unknown> | null> => {
  try {
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export async function consultarIntencionApi(enviar: Enviar = enviarPorDefecto): Promise<ConsultaIntencion> {
  let r: Response;

  try {
    r = await enviar("/api/movimientos/intencion", { cache: "no-store" });
  } catch {
    return { ok: false, mensaje: "No hubo conexión con el servidor para comprobar si hay un registro anterior sin resolver." };
  }

  const j = await jsonDe(r);

  if (!r.ok) return { ok: false, mensaje: `${typeof j?.error === "string" && j.error ? j.error : "No se pudo comprobar si hay un registro anterior sin resolver."} (código ${r.status})` };
  if (!j || !("intencion" in j)) return { ok: false, mensaje: "La respuesta del servidor no tiene el formato esperado." };

  return { ok: true, intencion: (j.intencion as IntencionRecuperada | null) ?? null };
}

/** Reserva K1 + snapshot en el servidor (checkpoint durable) ANTES de enviar nada a stock. 409 «pendiente» = ya hay una intención sin resolver de este operador: se devuelve para adoptarla. */
export async function reservarIntencionApi(datos: NuevoMovimientoStock, enviar: Enviar = enviarPorDefecto): Promise<ResultadoReserva> {
  let r: Response;

  try {
    r = await enviar("/api/movimientos/intencion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos) });
  } catch {
    return { tipo: "FALLO", mensaje: MENSAJE_NO_RESERVADA };
  }

  const j = await jsonDe(r);

  if (r.ok) return { tipo: "RESERVADA" };
  if (r.status === 409 && j?.pendiente === true && j.intencion && typeof j.intencion === "object") {
    const i = j.intencion as IntencionRecuperada;

    return { tipo: "PENDIENTE_EXISTENTE", clave: i.clave, payload: formularioDesdeSnapshot(i.snapshot), requiereRevision: i.requiereRevision === true, evidenciaNumero: i.evidenciaNumero ?? null, confirmada: i.estado === "CONFIRMADA" };
  }

  // Hay una pendiente que el operador ya no puede ver: no se envió nada, la base mantiene K2 bloqueada y la pantalla queda bloqueada hasta restablecer el acceso.
  if (r.status === 409 && j?.pendiente === true && j.sinVisibilidad === true) return { tipo: "PENDIENTE_NO_VISIBLE", mensaje: typeof j.error === "string" ? j.error : MENSAJE_NO_RESERVADA };

  return { tipo: "FALLO", mensaje: typeof j?.error === "string" && j.error ? `${j.error} No se envió ningún movimiento al stock.` : MENSAJE_NO_RESERVADA };
}

/**
 * Ejecuta (o repite) la intención con su K1; el cliente solo envía la clave (el servidor usa el snapshot persistido). Solo es CONCLUSIVO: 200 confirmada, o 422 con `resuelta: "RECHAZADA"` (comprobado por el servidor).
 * Cualquier otro resultado (401/403/409/5xx, red, cuerpo ilegible) es INDETERMINADO: no libera nada.
 */
export async function ejecutarIntencionApi(clave: string, enviar: Enviar = enviarPorDefecto): Promise<ResultadoRegistro> {
  let r: Response;

  try {
    r = await enviar("/api/movimientos/intencion/ejecutar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clave }) });
  } catch {
    return { tipo: "INDETERMINADO", mensaje: MENSAJE_INDETERMINADO };
  }

  const j = await jsonDe(r);

  if (r.ok && j?.resuelta === "CONFIRMADA" && j.movimiento && typeof (j.movimiento as { numero?: unknown }).numero === "string") {
    return { tipo: "OK", numero: (j.movimiento as { numero: string }).numero, repetido: j.repetido === true };
  }
  if (r.status === 422 && j?.resuelta === "RECHAZADA" && typeof j.error === "string") return { tipo: "RECHAZADO", mensaje: j.error, estado: 422, definitivo: true };
  if (!r.ok && r.status >= 400 && r.status < 500 && typeof j?.error === "string" && j.error && r.status !== 408) {
    return { tipo: "INDETERMINADO", mensaje: mensajeRechazoTrasIndeterminado(j.error, r.status) };
  }

  return { tipo: "INDETERMINADO", mensaje: MENSAJE_INDETERMINADO };
}

/** ACK (AUD-R08 / MOV-R08-01): el operador reconoce haber recibido el resultado de su intención CONFIRMADA. Idempotente; no registra nada. Solo la confirmación inequívoca (200 + reconocida) libera. */
export async function reconocerIntencionApi(clave: string, enviar: Enviar = enviarPorDefecto): Promise<ResultadoReconocimiento> {
  let r: Response;

  try {
    r = await enviar("/api/movimientos/intencion/reconocer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clave }) });
  } catch {
    return { ok: false, mensaje: "No hubo conexión con el servidor para confirmar la recepción del resultado." };
  }

  const j = await jsonDe(r);

  if (r.ok && j?.reconocida === true) return { ok: true };

  return { ok: false, mensaje: `${typeof j?.error === "string" && j.error ? j.error : "No se pudo confirmar la recepción del resultado."} (código ${r.status})` };
}
