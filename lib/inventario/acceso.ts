/**
 * INV-02 — visibilidad de los atajos hacia Movimientos. `/movimientos` exige MOVIMIENTOS.VER y `/movimientos/nuevo` exige MOVIMIENTOS.CREAR (guardas de página):
 * un atajo «Nuevo movimiento» / «Preparar transferencia» solo se ofrece con AMBOS permisos; el historial, solo con VER. Es solo presentación: cada API vuelve a verificar al operar.
 */
export type PermisosMovimientos = { movimientosVer: boolean; movimientosCrear: boolean };

export const SIN_PERMISOS_MOVIMIENTOS: PermisosMovimientos = { movimientosVer: false, movimientosCrear: false };

export const puedeAbrirNuevoMovimiento = (p: PermisosMovimientos | null | undefined): boolean => p?.movimientosVer === true && p?.movimientosCrear === true;

export const puedeVerMovimientos = (p: PermisosMovimientos | null | undefined): boolean => p?.movimientosVer === true;

/** Valida la forma del bloque de permisos recibido de una API; cualquier otra cosa equivale a «sin permisos» (nunca se asume un permiso). */
export function normalizarPermisosMovimientos(raw: unknown): PermisosMovimientos {
  const p = raw as Partial<PermisosMovimientos> | null | undefined;

  return { movimientosVer: p?.movimientosVer === true, movimientosCrear: p?.movimientosCrear === true };
}
