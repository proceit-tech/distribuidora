/** Reglas del formulario de Catálogos de productos (cliente y pruebas): validación por campo, mapeo de errores del servidor y cambios sin guardar. */

export type TipoCatalogoForm = "categorias" | "marcas" | "familias" | "lineas";

export type FormularioCatalogo = {
  id: string | null;
  codigo: string;
  nombre: string;
  descripcion: string;
  familiaId: string;
  categoriaId: string;
};

export type CampoCatalogo = "categoriaId" | "familiaId" | "codigo" | "nombre" | "descripcion";

export type ErroresCatalogo = Partial<Record<CampoCatalogo, string>>;

/** Orden visual de los campos: define cuál recibe el foco primero. */
export const ORDEN_CAMPOS: CampoCatalogo[] = ["categoriaId", "familiaId", "codigo", "nombre", "descripcion"];

/**
 * Validación local. La categoría es obligatoria en las familias NUEVAS; al editar una familia histórica sin categoría no se exige
 * (`categoriaPendiente`), para poder inactivarla o corregirla sin quedar bloqueada hasta su clasificación manual.
 */
export function validarFormularioCatalogo(tipo: TipoCatalogoForm, f: FormularioCatalogo, categoriaPendiente = false): ErroresCatalogo {
  const e: ErroresCatalogo = {};

  if (tipo === "familias" && !f.categoriaId && !(f.id !== null && categoriaPendiente)) e.categoriaId = "Seleccione la categoría de la familia.";
  if (tipo === "lineas" && !f.familiaId) e.familiaId = "Seleccione la familia de la línea.";
  if (!f.nombre.trim()) e.nombre = "El nombre es obligatorio.";

  return e;
}

/** Asigna un mensaje del servidor al campo que corresponde; null = error general. */
export function campoDeErrorServidor(tipo: TipoCatalogoForm, mensaje: string): CampoCatalogo | null {
  const m = mensaje.toLowerCase();

  if (m.includes("código") && !m.includes("nombre")) return "codigo";
  if (tipo === "familias" && m.includes("categor") && !m.includes("producto")) return "categoriaId";
  if (tipo === "lineas" && m.includes("familia") && !m.includes("producto")) return "familiaId";
  if (m.includes("nombre")) return "nombre";

  return null;
}

export function primerCampoConError(errores: ErroresCatalogo): CampoCatalogo | null {
  return ORDEN_CAMPOS.find((c) => errores[c]) ?? null;
}

/** Hay cambios sin guardar si el formulario difiere del que se abrió (comparación de los campos editables, sin espacios sobrantes en los extremos). */
export function formularioSucio(actual: FormularioCatalogo | null, base: FormularioCatalogo | null): boolean {
  if (!actual || !base) return false;

  const normal = (f: FormularioCatalogo) => [f.id, f.codigo.trim(), f.nombre.trim(), f.descripcion.trim(), f.familiaId, f.categoriaId];

  return JSON.stringify(normal(actual)) !== JSON.stringify(normal(base));
}
