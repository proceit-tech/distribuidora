/**
 * PRD-D06 — decide si se puede abandonar la pestaña Documentos. Con un borrador (documento nuevo o en edición sin enviar) se pide confirmación EXPLÍCITA antes de desmontar el editor: cancelar mantiene la
 * pestaña y el borrador; confirmar descarta solo el borrador (nunca registros ya grabados). Pura: la confirmación se inyecta.
 */
export const MENSAJE_BORRADOR_DOCUMENTO = "Hay un documento en preparación en la pestaña Documentos. Si cambia de pestaña se perderá. ¿Desea continuar?";

export function puedeCambiarPestana(actual: string, nueva: string, hayBorrador: boolean, confirmar: (mensaje: string) => boolean): boolean {
  if (actual !== "documentos" || nueva === "documentos" || !hayBorrador) return true;

  return confirmar(MENSAJE_BORRADOR_DOCUMENTO);
}
