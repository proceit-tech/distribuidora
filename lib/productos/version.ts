import { ErrorValidacion } from "@/lib/productos/errores";

/**
 * PRD-D03 — concurrencia optimista de la edición de Productos. La versión es `actualizado_at` con MICROSEGUNDOS (texto UTC), la misma que usan Proveedores y su GET; el PUT la exige
 * (ausente, vacía o no textual → 409) y la compara tras bloquear la fila (FOR UPDATE) y ANTES de validar o escribir cualquier cosa. Distinta o vieja → 409 con ROLLBACK: no se persiste nada.
 */
export const SQL_VERSION = `to_char(actualizado_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')`;

export function exigirVersionPresente(enviada: unknown) {
  if (typeof enviada !== "string" || enviada.trim() === "") {
    throw new ErrorValidacion("Falta la versión de la ficha: recargue el producto antes de guardar. No se guardó ningún cambio.", null, 409);
  }
}

export function exigirVersion(enviada: unknown, actual: unknown) {
  exigirVersionPresente(enviada);
  if (enviada !== actual) {
    throw new ErrorValidacion("Otro usuario modificó este producto mientras usted lo editaba (o la versión enviada no es válida). Recargue la ficha para ver los cambios antes de guardar; no se guardó ningún cambio.", null, 409);
  }
}
