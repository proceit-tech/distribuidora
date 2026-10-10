import type { StockItem, StockRespuesta } from "@/types/stock";

async function mensajeError(r: Response, porDefecto: string) {
  try {
    return ((await r.json()) as { error?: string }).error || porDefecto;
  } catch {
    return porDefecto;
  }
}

export async function cargarStock(): Promise<StockRespuesta> {
  const r = await fetch("/api/stock", { cache: "no-store" });
  if (!r.ok) throw new Error(await mensajeError(r, "No fue posible cargar el stock."));
  return (await r.json()) as StockRespuesta;
}

export async function cargarStockItem(id: string): Promise<{ item: StockItem; monedaBase: string } | null> {
  const r = await fetch(`/api/stock/${id}`, { cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(await mensajeError(r, "No fue posible cargar el stock."));
  return (await r.json()) as { item: StockItem; monedaBase: string };
}
