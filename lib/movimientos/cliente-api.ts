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

export async function cargarMovimientos(): Promise<MovimientoStockFila[]> {
  const r = await fetch("/api/movimientos", { cache: "no-store" });
  if (!r.ok) throw new Error(await mensajeError(r, "No fue posible cargar los movimientos."));
  return ((await r.json()) as { movimientos: MovimientoStockFila[] }).movimientos;
}

export async function cargarCatalogosMovimientos(): Promise<CatalogoMovimientos> {
  const r = await fetch("/api/movimientos?modo=catalogos", { cache: "no-store" });
  if (!r.ok) throw new Error(await mensajeError(r, "No fue posible cargar los catálogos."));
  return ((await r.json()) as { catalogos: CatalogoMovimientos }).catalogos;
}

export async function cargarMovimiento(id: string): Promise<MovimientoStockDetalle | null> {
  const r = await fetch(`/api/movimientos/${id}`, { cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(await mensajeError(r, "No fue posible cargar el movimiento."));
  return ((await r.json()) as { movimiento: MovimientoStockDetalle }).movimiento;
}

export async function registrarMovimientoApi(datos: NuevoMovimientoStock): Promise<string> {
  const r = await fetch("/api/movimientos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos) });
  if (!r.ok) throw new Error(await mensajeError(r, "No fue posible registrar el movimiento."));
  return ((await r.json()) as { movimiento: { numero: string } }).movimiento.numero;
}

export async function anularMovimientoApi(id: string, motivo: string): Promise<string> {
  const r = await fetch(`/api/movimientos/${id}/anular`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ motivo, claveIdempotencia: crypto.randomUUID() }),
  });
  if (!r.ok) throw new Error(await mensajeError(r, "No fue posible anular el movimiento."));
  return ((await r.json()) as { message: string }).message;
}
