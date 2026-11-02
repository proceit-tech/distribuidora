/**
 * Unidades de medida de la factura (PRO-128, UX-14): catálogo fiscal vigente (`unidades_medida_sifen`, NEX-039/043) mostrado como «Unidad de medida». El código SIFEN (E709 `cUniMed`) es el que viaja en el JSON;
 * el nombre y el símbolo son ayudas de lectura. Dos entradas con el mismo nombre y códigos distintos (p. ej. Metro 87 y 108) se muestran SEPARADAS y nunca se fusionan ni se eligen por suposición.
 * No toca la unidad física del producto ni del stock: es solo la unidad de EMISIÓN de esta factura.
 */
export type UnidadMedida = { codigo: number; representacion: string; descripcion: string };

const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Etiqueta completa y estable de una entrada: «Caja (BX) · 131». */
export const etiquetaUnidad = (u: UnidadMedida): string => `${u.descripcion} (${u.representacion}) · ${u.codigo}`;

/** Filtra por nombre, símbolo o código (sin distinguir acentos ni mayúsculas); sin texto devuelve TODAS. Nunca recorta la lista ni fusiona entradas. */
export function filtrarUnidades(unidades: UnidadMedida[], texto: string): UnidadMedida[] {
  const q = sinAcentos(texto.trim());

  if (q === "") return unidades;

  return unidades.filter((u) => sinAcentos(`${u.descripcion} ${u.representacion} ${u.codigo}`).includes(q));
}
