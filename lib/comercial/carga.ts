/**
 * CC-A03/A04 — carga de la pantalla de Catálogos comerciales, separada de React para probarla sin navegador. Verifica HTTP y FORMA (la clave del catálogo debe ser un arreglo; los permisos,
 * un objeto con booleanos): una respuesta 200 sin la clave NO se convierte en «catálogo vacío». Los permisos solo valen con carga confiable (ver `permisosVigentes` en catalogos-carga).
 */
export type PermisosComercial = { crear: boolean; editar: boolean };
export type MonedaComercial = { codigo: string; nombre: string; simbolo: string };

export type ResultadoCargaComercial = {
  filas: Array<Record<string, unknown>>;
  permisos: PermisosComercial;
  monedas: MonedaComercial[] | null;
  error: string;
};

type Fetch = (url: string) => Promise<Response>;

const SIN_PERMISOS: PermisosComercial = { crear: false, editar: false };

export async function cargarCatalogoComercial(ruta: string, clave: string, historial: boolean, f: Fetch): Promise<ResultadoCargaComercial> {
  const vacio: ResultadoCargaComercial = { filas: [], permisos: SIN_PERMISOS, monedas: null, error: "" };
  let r: Response;

  try {
    r = await f(`/api/catalogos-comerciales/${ruta}${historial ? "?historial=1" : ""}`);
  } catch {
    return { ...vacio, error: "No hubo conexión para cargar el catálogo." };
  }

  type Cuerpo = Record<string, unknown> & { error?: string; permisos?: unknown; monedas?: unknown };
  let j: Cuerpo | null = null;

  try {
    j = (await r.json()) as Cuerpo;
  } catch {
    j = null;
  }

  if (!r.ok) return { ...vacio, error: `${j?.error ?? "No fue posible cargar el catálogo."} (código ${r.status})` };
  if (!j || !Array.isArray(j[clave])) return { ...vacio, error: "La respuesta del catálogo no tiene el formato esperado." };

  const p = j.permisos as Partial<PermisosComercial> | undefined;

  if (!p || typeof p.crear !== "boolean" || typeof p.editar !== "boolean") return { ...vacio, error: "La respuesta del catálogo no incluye los permisos esperados." };
  // CC-D03: en Tipos de cambio las monedas son OBLIGATORIAS (un arreglo, aunque esté vacío): sin ellas no se puede registrar. Canales y zonas no las necesitan.
  if (clave === "tiposCambio") {
    if (!monedasValidas(j.monedas)) return { ...vacio, error: "La respuesta de los tipos de cambio no incluye las monedas o las trae con un formato inesperado." };
  } else if (j.monedas !== undefined && !Array.isArray(j.monedas)) {
    return { ...vacio, error: "La respuesta del catálogo trae las monedas con un formato inesperado." };
  }

  return { filas: j[clave] as Array<Record<string, unknown>>, permisos: { crear: p.crear, editar: p.editar }, monedas: (j.monedas as MonedaComercial[] | undefined) ?? null, error: "" };
}

/** Un arreglo (posiblemente vacío) cuyos elementos son objetos con `codigo` de texto. */
export function monedasValidas(m: unknown): m is MonedaComercial[] {
  return Array.isArray(m) && m.every((x) => x !== null && typeof x === "object" && typeof (x as { codigo?: unknown }).codigo === "string");
}

/** CC-D01: monedas del alta (consulta mínima `modo=monedas`) y si la sesión puede ver el listado. Un fallo o una forma inválida NO se convierte en un selector vacío. */
export async function cargarMonedasAlta(f: Fetch): Promise<{ ok: true; monedas: MonedaComercial[]; puedeVer: boolean } | { ok: false; mensaje: string }> {
  let r: Response;

  try {
    r = await f("/api/catalogos-comerciales/tipos-cambio?modo=monedas");
  } catch {
    return { ok: false, mensaje: "No hubo conexión para cargar las monedas." };
  }

  type CuerpoMonedas = { error?: unknown; monedas?: unknown; permisos?: { ver?: unknown } };
  let j: CuerpoMonedas | null = null;

  try {
    j = (await r.json()) as CuerpoMonedas;
  } catch {
    j = null;
  }

  if (!r.ok) return { ok: false, mensaje: `${typeof j?.error === "string" && j.error.trim() ? j.error : "No fue posible cargar las monedas."} (código ${r.status})` };
  if (!j || !monedasValidas(j.monedas)) return { ok: false, mensaje: "La respuesta de las monedas no tiene el formato esperado." };

  return { ok: true, monedas: j.monedas, puedeVer: j.permisos?.ver === true };
}
