import type { DashboardPeriodo, DashboardRespuesta } from "@/types/dashboard";

export async function cargarDashboard(periodo: DashboardPeriodo, depositoId: string): Promise<DashboardRespuesta> {
  const qs = new URLSearchParams({ periodo });
  if (depositoId) qs.set("depositoId", depositoId);
  const r = await fetch(`/api/dashboard?${qs}`, { cache: "no-store" });
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? "No fue posible cargar el panel.");
  }
  return (await r.json()) as DashboardRespuesta;
}
