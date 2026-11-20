/**
 * LPR-A02 / LPR-R02-01 — helpers puros de concurrencia de los precios de una lista (sin base de datos ni red).
 * La pantalla envía la «foto» de lo que cargó al abrir: id y versión de TODOS los precios, también los que luego quitó del borrador. El servidor la contrasta, ya con
 * los precios bloqueados, con lo que hay en la base: cualquier alta, cambio o baja externos (p. ej. Productos fijando el precio de referencia) dan 409 sin escribir.
 */
export type ItemCargado = { id: string; version: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/;

/** null = no enviado; "invalido" = enviado pero incompleto o malformado (id/versión ausentes, no válidos o repetidos). */
export function normalizarItemsCargados(raw: unknown): ItemCargado[] | null | "invalido" {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) return "invalido";

  const vistos = new Set<string>();
  const salida: ItemCargado[] = [];

  for (const x of raw as unknown[]) {
    if (typeof x !== "object" || x === null) return "invalido";

    const { id, version } = x as { id?: unknown; version?: unknown };

    if (typeof id !== "string" || !UUID.test(id.trim()) || typeof version !== "string" || !VERSION.test(version.trim())) return "invalido";

    const limpio = id.trim().toLowerCase();

    if (vistos.has(limpio)) return "invalido";
    vistos.add(limpio);
    salida.push({ id: limpio, version: version.trim() });
  }

  return salida;
}

export type ConflictoItems = { tipo: "agregado" | "modificado" | "eliminado"; id: string };

/** Primer conflicto entre los precios de la base (con su versión) y la foto que cargó la pantalla; null si coinciden exactamente. */
export function conflictoItems(enBase: ItemCargado[], cargados: ItemCargado[]): ConflictoItems | null {
  const cargadosPorId = new Map(cargados.map((c) => [c.id.toLowerCase(), c.version]));
  const basePorId = new Map(enBase.map((b) => [b.id.toLowerCase(), b.version]));

  for (const b of enBase) {
    const v = cargadosPorId.get(b.id.toLowerCase());

    if (v === undefined) return { tipo: "agregado", id: b.id };
    if (v !== b.version) return { tipo: "modificado", id: b.id };
  }
  for (const c of cargados) if (!basePorId.has(c.id.toLowerCase())) return { tipo: "eliminado", id: c.id };

  return null;
}

export const MENSAJE_CONFLICTO_ITEMS: Record<ConflictoItems["tipo"], string> = {
  agregado: "Se agregaron precios a esta lista (por ejemplo desde la ficha de Productos) después de abrirla. No se guardó nada: recargue para verlos.",
  modificado: "Un precio de esta lista fue modificado (por otra persona o desde la ficha de Productos) después de abrirla, aunque lo haya quitado de su borrador. No se guardó nada: recargue para ver el precio vigente.",
  eliminado: "Un precio de esta lista ya no existe (fue eliminado desde otra pantalla) después de abrirla. No se guardó nada: recargue la lista.",
};
