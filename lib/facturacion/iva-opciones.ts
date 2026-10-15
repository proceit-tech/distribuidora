import type { AjusteUI } from "@/lib/facturacion/ajuste-item";

/**
 * Selector DIRECTO de IVA por ítem (PRO-128, UX-15). Cada opción fija JUNTAS afectación (E731), tasa (E734) y, en los parciales, la proporción gravada (E733): cambiar solo la tasa deja de ser un paso
 * oculto. Es solo la forma de elegir: el motor fiscal, el contrato del cuerpo (`ajuste.afectacion/tasa/proporcion`) y las validaciones del servidor no cambian.
 *   Gravado 10 % = (1, 10) · Gravado 5 % = (1, 5) · Exento = (3, 0) · Exonerado = (2, 0) · Gravado parcial 10 % = (4, 10 + proporción) · Gravado parcial 5 % = (4, 5 + proporción)
 */
export type OpcionIva = { valor: string; etiqueta: string; afectacion: number; tasa: number; parcial: boolean };

export const OPCIONES_IVA: OpcionIva[] = [
  { valor: "G10", etiqueta: "Gravado IVA 10 %", afectacion: 1, tasa: 10, parcial: false },
  { valor: "G5", etiqueta: "Gravado IVA 5 %", afectacion: 1, tasa: 5, parcial: false },
  { valor: "EXE", etiqueta: "Exento", afectacion: 3, tasa: 0, parcial: false },
  { valor: "EXO", etiqueta: "Exonerado", afectacion: 2, tasa: 0, parcial: false },
  { valor: "P10", etiqueta: "Gravado parcial IVA 10 %", afectacion: 4, tasa: 10, parcial: true },
  { valor: "P5", etiqueta: "Gravado parcial IVA 5 %", afectacion: 4, tasa: 5, parcial: true },
];

/** Opción que corresponde a una clasificación (afectación, tasa) o "" si no existe/está incompleta. */
export function opcionIvaDe(afectacion: number | null, tasa: number | null): string {
  if (afectacion === null || tasa === null) return "";

  return OPCIONES_IVA.find((o) => o.afectacion === afectacion && o.tasa === tasa)?.valor ?? "";
}

export const esParcial = (valor: string): boolean => OPCIONES_IVA.find((o) => o.valor === valor)?.parcial === true;

/**
 * Cambios del ajuste al elegir una opción. Si la opción coincide con la clasificación del producto NO se envía ajuste redundante (se limpian afectación/tasa/proporción/guardar); si es otra, se fijan
 * afectación + tasa JUNTAS (con proporción vacía a completar en los parciales) y se conserva la elección de «guardar».
 */
export function cambiosPorOpcionIva(valor: string, producto: { afectacion: number | null; tasa: number | null; proporcion: string | null }, ajuste: Pick<AjusteUI, "proporcion" | "guardar">): Partial<AjusteUI> {
  const o = OPCIONES_IVA.find((x) => x.valor === valor);

  if (!o) return { afectacion: "", tasa: "", proporcion: "", guardar: false };

  const igualAlProducto = producto.afectacion === o.afectacion && producto.tasa === o.tasa;

  if (igualAlProducto && !o.parcial) return { afectacion: "", tasa: "", proporcion: "", guardar: false };

  // Parcial igual al del producto: se parte de su proporción; no se arrastra una proporción ajena al pasar de una categoría a otra.
  const proporcion = o.parcial ? (igualAlProducto ? (ajuste.proporcion !== "" ? ajuste.proporcion : (producto.proporcion ?? "")) : ajuste.proporcion) : "";

  return { afectacion: String(o.afectacion), tasa: String(o.tasa), proporcion };
}

/** Texto corto de la clasificación efectiva para la tabla y el resumen (p. ej. «Gravado IVA 10 %» o «Gravado parcial IVA 5 % · 50 %»). */
export function etiquetaIva(afectacion: number | null, tasa: number | null, proporcion: string | null): string {
  if (afectacion === null) return "Sin clasificar";

  const o = OPCIONES_IVA.find((x) => x.afectacion === afectacion && x.tasa === tasa);

  if (!o) return tasa === null ? "IVA incompleto" : `IVA ${afectacion}/${tasa} %`;

  return o.parcial && proporcion ? `${o.etiqueta} · ${proporcion} %` : o.etiqueta;
}
