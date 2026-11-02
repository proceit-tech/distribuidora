/**
 * Dígito verificador (DV) del RUC paraguayo — módulo 11.
 *
 * Fuente normativa: DNIT, "Dígito Verificador.pdf" (funciones oficiales Pa_Calcular_Dv_11_A, basemax = 11).
 * Ver documentacao/v1/homologacao-visual/VETORES-DV-RUC-DNIT-2026-10-11.md.
 *
 * Función pura, compartida por el formulario y las API de Clientes (misma regla en ambos lados).
 * El RUC siempre se maneja como texto para preservar ceros a la izquierda.
 */

const BASE_MAX = 11;
const RUC_FORMATO = /^\d{3,8}$/;

export const MENSAJE_RUC_INVALIDO =
  "El RUC debe tener entre 3 y 8 dígitos numéricos, sin letras, puntos ni guion.";

/** El RUC (sin DV) es válido para el DV si son 3 a 8 dígitos ASCII 0-9. */
export function esRucValido(ruc: string): boolean {
  return RUC_FORMATO.test(ruc);
}

/**
 * Calcula el DV del RUC (sin DV). Devuelve un dígito "0"-"9" o `null` si el RUC no es válido.
 *
 * Procedimiento oficial: de derecha a izquierda se multiplica cada dígito por 2, 3, …, 11
 * (reinicia en 2 tras 11) y se suman los productos; resto = suma % 11;
 * DV = 0 si resto es 0 o 1, en otro caso 11 - resto.
 * (La conversión ASCII de caracteres no numéricos de la función genérica de la DNIT no se usa:
 * el RUC fiscal acepta solo dígitos.)
 */
export function calcularDvRuc(ruc: string): string | null {
  if (!esRucValido(ruc)) return null;

  let factor = 2;
  let total = 0;

  for (let posicion = ruc.length - 1; posicion >= 0; posicion -= 1) {
    if (factor > BASE_MAX) factor = 2;
    total += (ruc.charCodeAt(posicion) - 48) * factor;
    factor += 1;
  }

  const resto = total % 11;

  return String(resto > 1 ? 11 - resto : 0);
}

export type ResultadoRucDv = { ok: true; dv: string } | { ok: false; error: string };

/** Valida RUC (sin DV) y DV informado contra el cálculo oficial. */
export function validarRucDv(ruc: string, dv: string): ResultadoRucDv {
  const calculado = calcularDvRuc(ruc);

  if (calculado === null) return { ok: false, error: MENSAJE_RUC_INVALIDO };

  if (dv !== calculado) {
    return {
      ok: false,
      error: `El DV informado no corresponde al RUC (DV esperado: ${calculado}).`,
    };
  }

  return { ok: true, dv: calculado };
}
