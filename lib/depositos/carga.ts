/**
 * INV-05 — carga de la pantalla de Depósitos, separada de React para probarla sin navegador. Verifica HTTP y FORMA (depositos y sucursales = arreglos; permisos = booleanos): una
 * respuesta rara NO se convierte en «sin depósitos» ni conserva los permisos de una carga anterior. Los permisos de una carga previa (o de una carga que falló o está en curso)
 * nunca habilitan crear, editar, activar/inactivar ni gestionar usuarios (ver `permisosVigentes`/`cargaConfiable` en catalogos-carga).
 */
export type PermisosDepositos = { crear: boolean; editar: boolean; stock?: boolean };

export type ResultadoCargaDepositos<D, S> = {
  datos: { depositos: D[]; sucursales: S[]; permisos: PermisosDepositos; actor: { alcanceDepositos: "TODOS" | "ASIGNADOS" } | null } | null;
  error: string;
};

type Fetch = (url: string) => Promise<Response>;

export async function cargarDepositos<D = Record<string, unknown>, S = Record<string, unknown>>(f: Fetch): Promise<ResultadoCargaDepositos<D, S>> {
  let r: Response;

  try {
    r = await f("/api/depositos");
  } catch {
    return { datos: null, error: "No hubo conexión para cargar los depósitos." };
  }

  let j: (Record<string, unknown> & { error?: string }) | null = null;

  try {
    j = (await r.json()) as Record<string, unknown> & { error?: string };
  } catch {
    j = null;
  }

  if (!r.ok) return { datos: null, error: `${j?.error ?? "No fue posible cargar los depósitos."} (código ${r.status})` };
  if (!j || !Array.isArray(j.depositos) || !Array.isArray(j.sucursales)) return { datos: null, error: "La respuesta de depósitos no tiene el formato esperado." };

  const p = j.permisos as Partial<PermisosDepositos> | undefined;

  if (!p || typeof p.crear !== "boolean" || typeof p.editar !== "boolean") return { datos: null, error: "La respuesta de depósitos no incluye los permisos esperados." };

  return {
    datos: {
      depositos: j.depositos as D[],
      sucursales: j.sucursales as S[],
      permisos: { crear: p.crear, editar: p.editar, stock: p.stock === true },
      actor: (j.actor as { alcanceDepositos: "TODOS" | "ASIGNADOS" } | null | undefined) ?? null,
    },
    error: "",
  };
}

/** Dirección de «Ver stock» de un depósito: Stock aplica de verdad el filtro `?deposito=` (si el depósito no está en su alcance, se ignora). */
export const enlaceStockDeDeposito = (depositoId: string): string => `/stock?deposito=${encodeURIComponent(depositoId)}`;

/** Lee `?deposito=` de una consulta y lo acepta solo si coincide con un depósito que el usuario ve (nunca se aplica un id desconocido). */
export function depositoDesdeConsulta(consulta: string, conocidos: string[]): string | null {
  const id = new URLSearchParams(consulta).get("deposito");

  return id && conocidos.includes(id) ? id : null;
}
