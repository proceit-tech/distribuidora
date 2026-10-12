import type {
  CatalogoMovimientos,
  MovimientoStockDetalle,
  MovimientoStockFila,
  NuevoMovimientoStock,
} from "@/types/movimientos-stock";

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

export async function registrarMovimientoApi(datos: NuevoMovimientoStock): Promise<string> {
  const r = await fetch("/api/movimientos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos) });
  if (!r.ok) throw new Error(await mensajeError(r, "No fue posible registrar el movimiento."));
  return ((await r.json()) as { movimiento: { numero: string } }).movimiento.numero;
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
