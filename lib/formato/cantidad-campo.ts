/**
 * Cantidad de un ítem de la Factura (E01): se acepta coma o punto como separador decimal, hasta 10 enteros y 4 decimales, para TODAS las unidades (también SIFEN 77/UNI).
 * Todo es TEXTO decimal: nunca se pasa por Number para guardar ni enviar, así 5,5 → «5.5» y 0,0001 → «0.0001» sin pérdida.
 * El campo guarda lo que el operador escribe (incluso «5,» a mitad de la escritura); `normalizarCantidadTexto` produce el valor canónico que valida y envía.
 */
export const CANTIDAD_FACTURA_OK = /^\d{1,10}(\.\d{1,4})?$/;

/** «5,5» → «5.5»; «,5» → «0.5»; «5,» → «5». Un texto ambiguo (coma y punto juntos, varias comas) se devuelve sin tocar para que la validación lo rechace. */
export function normalizarCantidadTexto(texto: string): string {
  let s = texto.trim();

  if (s.includes(",")) {
    if (s.includes(".") || (s.match(/,/g) ?? []).length > 1) return s;
    s = s.replace(",", ".");
  }

  return s.replace(/^\./, "0.").replace(/\.$/, "");
}

/** ¿Es una cantidad válida (mayor que cero, ≤ 10 enteros, ≤ 4 decimales)? */
export function cantidadFacturaValida(texto: string): boolean {
  const n = normalizarCantidadTexto(texto);

  return CANTIDAD_FACTURA_OK.test(n) && /[1-9]/.test(n);
}

/** Suma un entero a una cantidad (exacto, con 4 decimales de escala) y devuelve el texto canónico; null si la cantidad actual no es válida. */
export function sumarUnaUnidad(texto: string): string | null {
  const n = normalizarCantidadTexto(texto);

  if (!CANTIDAD_FACTURA_OK.test(n)) return null;

  const [entera, frac = ""] = n.split(".");
  const total = (Number(entera) + 1).toString();

  if (total.length > 10) return null; // ya está en el máximo de 10 enteros: no se suma (la línea conserva su cantidad)

  const fracTrim = frac.replace(/0+$/, "");

  return fracTrim === "" ? total : total + "." + fracTrim;
}
