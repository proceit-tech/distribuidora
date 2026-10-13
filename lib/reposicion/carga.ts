/**
 * Reposición — carga y simulación (helpers puros, sin React).
 *  · Carga: verifica HTTP y FORMA (entradas y depósitos = arreglos); los permisos de Movimientos se normalizan (VER y CREAR, INV-02) y cualquier valor raro equivale a «sin permisos».
 *  · Simulación (INV-06/INV-08): «Simular» es una hipótesis LOCAL. Mientras no esté activa, las cantidades escritas y la hipótesis de tránsito no se aplican; nada se guarda, reserva ni ejecuta.
 */
import { normalizarPermisosMovimientos, type PermisosMovimientos } from "@/lib/inventario/acceso";
import type { EntradaReposicion } from "@/lib/reposicion/calculo";

export type DatosReposicion = { entradas: EntradaReposicion[]; depositos: Array<{ id: string; nombre: string }>; alcanceParcial: boolean; permisos: PermisosMovimientos };

type Fetch = (url: string) => Promise<Response>;

export async function cargarReposicion(f: Fetch): Promise<{ datos: DatosReposicion | null; error: string }> {
  let r: Response;

  try {
    r = await f("/api/reposicion");
  } catch {
    return { datos: null, error: "No hubo conexión para cargar los datos de reposición." };
  }

  let j: (Record<string, unknown> & { error?: string }) | null = null;

  try {
    j = (await r.json()) as Record<string, unknown> & { error?: string };
  } catch {
    j = null;
  }

  if (!r.ok) return { datos: null, error: `${j?.error ?? "No fue posible cargar los datos de reposición."} (código ${r.status})` };
  if (!j || !Array.isArray(j.entradas) || !Array.isArray(j.depositos)) return { datos: null, error: "La respuesta de reposición no tiene el formato esperado." };

  return { datos: { entradas: j.entradas as EntradaReposicion[], depositos: j.depositos as DatosReposicion["depositos"], alcanceParcial: j.alcanceParcial === true, permisos: normalizarPermisosMovimientos(j.permisos) }, error: "" };
}

/** Cantidad escrita en la simulación; null si la simulación no está activa, no hay texto o no es un número ≥ 0. */
export function cantidadSimulada(plan: Record<string, string>, clave: string, simulando: boolean): number | null {
  if (!simulando) return null;

  const escrito = plan[clave];

  if (escrito === undefined || escrito === "") return null;

  const n = Number(escrito);

  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** El tránsito solo entra al cálculo como hipótesis explícita dentro de la simulación: por defecto nunca se cuenta como ingreso (no hay flujo de tránsito en la V1). */
export const incluirTransitoEfectivo = (simulando: boolean, hipotesisTransito: boolean): boolean => simulando && hipotesisTransito;
