/**
 * Obligatoriedad condicional de la dirección fiscal del cliente (decisión 01 del responsable, 2026-10-11; Manual SIFEN v150).
 * Matriz aplicada (solo lo que la norma y las decisiones aprobadas fijan; nada más se vuelve obligatorio):
 *  - B2F (D202 = 4): D213 (dirección del receptor) es obligatoria → debe existir una dirección FISCAL del cliente.
 *  - B2B, B2C, B2G: la dirección fiscal es facultativa; si se registra, se validan sus campos (D213/D218–D224, ver
 *    `validarDireccionFiscal`). Un contribuyente NO queda obligado por esta regla.
 * Un mismo registro puede ser a la vez dirección fiscal y de entrega predeterminada.
 */
export function validarDireccionFiscalRequerida(tipoOperacion: string, hayDireccionFiscal: boolean): string | null {
  if (tipoOperacion.toUpperCase() === "B2F" && !hayDireccionFiscal) {
    return "Una operación B2F (cliente del exterior) requiere una dirección fiscal: agréguela en la pestaña Direcciones y márquela como fiscal.";
  }

  return null;
}
