/**
 * E05 — los códigos de producto son TEXTO. Los códigos migrados desde Excel pueden empezar con ceros (`001234`) y `001234` es OTRO código distinto de `1234`: nunca se convierten a número ni se recortan.
 * Este módulo solo contiene comparaciones de texto (sin Number/parseInt).
 */

/** ¿Ambos son numéricos, distintos como texto, y solo difieren en los ceros iniciales? (001234 / 1234). */
export function soloDifierenCerosIniciales(codigo: string, texto: string): boolean {
  const a = codigo.trim();
  const b = texto.trim();

  if (!/^\d+$/.test(a) || !/^\d+$/.test(b) || a === b) return false;

  return a.replace(/^0+(?=\d)/, "") === b.replace(/^0+(?=\d)/, "");
}
