/** Formulario de Catálogos comerciales (cliente y pruebas): validación por campo y cambios sin guardar. */
import { cambioEnAlcance, MENSAJE_ALCANCE_CAMBIO } from "@/lib/comercial/cambio-decimal";
import { normalizarCambio } from "@/lib/listas-precio/calculos";

export type TabComercial = "cambios" | "canales" | "zonas";

export type FormularioComercial = {
  id: string | null;
  codigo: string;
  nombre: string;
  fecha: string;
  monedaCodigo: string;
  cambio: string;
  motivo: string;
  /** Versión (actualizado_at µs) del canal/zona que se abrió para editar (CC-A01); no cuenta como cambio del operador. */
  version?: string;
};

export type CampoComercial = "fecha" | "monedaCodigo" | "cambio" | "motivo" | "codigo" | "nombre";
export type ErroresComercial = Partial<Record<CampoComercial, string>>;

/** El orden de las claves del resultado es el orden visual: la primera recibe el foco. */
export function validarFormularioComercial(tab: TabComercial, f: FormularioComercial): ErroresComercial {
  const e: ErroresComercial = {};

  if (tab === "cambios") {
    if (f.id === null) {
      if (!f.fecha) e.fecha = "Ingrese una fecha válida.";
      if (!f.monedaCodigo) e.monedaCodigo = "Seleccione la moneda.";
    }
    const normal = normalizarCambio(f.cambio);

    if (normal === null) e.cambio = "Ingrese una cotización mayor que cero (hasta 6 decimales).";
    else if (!cambioEnAlcance(normal)) e.cambio = MENSAJE_ALCANCE_CAMBIO;
    if (f.motivo.length > 200) e.motivo = "El motivo no puede superar los 200 caracteres.";

    return e;
  }

  if (!f.codigo.trim()) e.codigo = "El código es obligatorio.";
  if (!f.nombre.trim()) e.nombre = "El nombre es obligatorio.";

  return e;
}

/**
 * CC-R03-01: aplica el cambio de un campo al borrador SALVO que haya una gravación en curso (`bloqueado`): lo enviado al servidor es exactamente lo que el operador revisó y nada se edita (ni programáticamente)
 * hasta que termine. Devuelve el mismo objeto si está bloqueado.
 */
export function aplicarCambioCampo(actual: FormularioComercial, campo: CampoComercial, valor: string, bloqueado: boolean): FormularioComercial {
  return bloqueado ? actual : { ...actual, [campo]: valor };
}

export function formularioComercialSucio(actual: FormularioComercial | null, base: FormularioComercial | null): boolean {
  if (!actual || !base) return false;

  const n = (f: FormularioComercial) => [f.id, f.codigo.trim(), f.nombre.trim(), f.fecha, f.monedaCodigo, f.cambio.trim(), f.motivo.trim()];

  return JSON.stringify(n(actual)) !== JSON.stringify(n(base));
}
