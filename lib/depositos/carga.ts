/**
 * INV-05 — carga de la pantalla de Depósitos, separada de React para probarla sin navegador. Verifica HTTP y FORMA de cada registro (depositos y sucursales = arreglos de objetos válidos; permisos = booleanos; INV-R02-03): una
 * respuesta rara NO se convierte en «sin depósitos» ni conserva los permisos de una carga anterior. Los permisos de una carga previa (o de una carga que falló o está en curso)
 * nunca habilitan crear, editar, activar/inactivar ni gestionar usuarios (ver `permisosVigentes`/`cargaConfiable` en catalogos-carga).
 */
import { actorValido, depositoValido, listaValida, sucursalValida } from "@/lib/inventario/validar-carga";

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
  if (!j || !listaValida(j.depositos, depositoValido) || !listaValida(j.sucursales, sucursalValida) || !actorValido(j.actor)) return { datos: null, error: "La respuesta de depósitos no tiene el formato esperado." };

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

/** Dirección de «Ver stock» de un depósito: Stock valida `?deposito=` contra los depósitos autorizados del usuario (ver `interpretarDepositoUrl`). */
export const enlaceStockDeDeposito = (depositoId: string): string => `/stock?deposito=${encodeURIComponent(depositoId)}`;

/**
 * INV-R02-02 — resultado de interpretar `?deposito=` contra los depósitos AUTORIZADOS del usuario (tengan o no saldo):
 *  · SIN_PARAMETRO: la URL no pide depósito → consolidado normal;
 *  · SELECCIONADO: depósito autorizado (con o sin saldo) → se aplica el filtro y, si no hay saldo, se informa «sin saldos» (no desaparece);
 *  · NO_DISPONIBLE: id vacío, obsoleto, inexistente o fuera de su alcance → aviso explícito; NUNCA se confunde en silencio con el consolidado
 *    y el aviso no distingue «no existe» de «no autorizado» (no revela depósitos ajenos).
 */
export type DepositoUrl = { tipo: "SIN_PARAMETRO" } | { tipo: "SELECCIONADO"; id: string; nombre: string } | { tipo: "NO_DISPONIBLE" };

export function interpretarDepositoUrl(consulta: string, autorizados: Array<{ id: string; nombre: string }>): DepositoUrl {
  const params = new URLSearchParams(consulta);

  if (!params.has("deposito")) return { tipo: "SIN_PARAMETRO" };

  const id = (params.get("deposito") ?? "").trim();
  const dep = id ? autorizados.find((d) => d.id === id) : undefined;

  return dep ? { tipo: "SELECCIONADO", id: dep.id, nombre: dep.nombre } : { tipo: "NO_DISPONIBLE" };
}
