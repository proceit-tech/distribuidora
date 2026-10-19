import type {
  CatalogoMovimientos,
  MovimientoStockDetalle,
  MovimientoStockFila,
  NuevoMovimientoStock,
} from "@/types/movimientos-stock";
import { MENSAJE_INDETERMINADO, type ResultadoRegistro } from "@/lib/movimientos/intento";

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
