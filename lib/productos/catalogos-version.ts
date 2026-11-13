/** Error de la administración de catálogos con su estado HTTP (módulo puro: se prueba sin Next ni base). */
export class ErrorCatalogo extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * CAT-A06: precondición de edición. `enviada` es la versión de la fila que el operador tenía en pantalla; `actual`, la leída bajo el bloqueo de la tabla. Ausente, malformada u
 * obsoleta → 409 (nada se escribe) y la pantalla conserva el formulario.
 */
export function exigirVersionCatalogo(enviada: unknown, actual: unknown) {
  if (typeof enviada !== "string" || enviada.trim() === "") throw new ErrorCatalogo("Falta la versión del registro: recargue el catálogo antes de guardar. No se guardó ningún cambio.", 409);
  if (enviada !== actual) throw new ErrorCatalogo("Otro usuario modificó este registro después de que usted lo abrió. Sus cambios NO se guardaron; recargue la lista y repita la edición.", 409);
}
