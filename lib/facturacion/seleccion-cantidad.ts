/**
 * E01-R02 (PRO-201): en el selector avanzado de productos (diálogo aria-modal, multi-alta) la cantidad se edita DENTRO del diálogo justo después de cada «Añadir».
 * `solicitud` crece con CADA alta (también al repetir el mismo producto), de modo que el campo vuelve a recibir foco cada vez; `clave` identifica la línea real de la factura a editar.
 */
export type UltimoAnadido = { clave: number; descripcion: string; solicitud: number };

export const registrarAnadido = (previo: UltimoAnadido | null, clave: number, descripcion: string): UltimoAnadido => ({ clave, descripcion, solicitud: (previo?.solicitud ?? 0) + 1 });
