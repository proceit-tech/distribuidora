/**
 * Operaciones de escritura de Catálogos de productos (CAT-D01/CAT-D02), separadas de React para probarlas sin navegador.
 *  · CAT-D01: una gravación en curso (POST/PUT) es EXCLUSIVA: mientras dura no se admite otra escritura ni un cambio de contexto (pestaña, otro formulario, cancelar, activar/inactivar).
 *    No se simula cancelar una petición ya enviada: simplemente no se permite iniciar nada que pueda cruzarse con ella.
 *  · CAT-D02: el error de una acción de estado (409/403/500) sobrevive a la recarga posterior de la lista; es un canal distinto del error de la consulta.
 */
export type ResultadoExclusivo<T> = { ejecutada: true; valor: T } | { ejecutada: false };

export function crearExclusion() {
  let activa = false;

  return {
    activa: () => activa,
    /** Ejecuta `fn` solo si no hay otra operación en curso; si la hay devuelve `ejecutada: false` sin llamarla. */
    async ejecutar<T>(fn: () => Promise<T>): Promise<ResultadoExclusivo<T>> {
      if (activa) return { ejecutada: false };

      activa = true;

      try {
        return { ejecutada: true, valor: await fn() };
      } finally {
        activa = false;
      }
    },
  };
}

type CambioEstado = {
  /** PUT del cambio de estado; lanza ante HTTP no OK. */
  enviar: () => Promise<unknown>;
  /** Recarga la lista. `preservarError` evita que la recarga borre el error de la acción. */
  recargar: (opciones: { preservarError: boolean }) => Promise<void>;
  alExito: () => void;
  alError: (mensaje: string) => void;
};

/**
 * Activar/inactivar: éxito → aviso y recarga. Fallo → el error de la acción se publica ANTES de recargar y la recarga (para mostrar los datos vigentes ante un 409) NO lo borra; nunca se
 * publica un aviso de éxito si el PUT falló.
 */
export async function ejecutarCambioEstado(c: CambioEstado): Promise<void> {
  try {
    await c.enviar();
  } catch (e) {
    c.alError(e instanceof Error && e.message ? e.message : "No fue posible cambiar el estado.");
    await c.recargar({ preservarError: true });

    return;
  }

  c.alExito();
  await c.recargar({ preservarError: false });
}
