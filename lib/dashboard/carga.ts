/**
 * F-DASH-02 — los datos del Dashboard pertenecen al contexto (período + depósito) con el que se pidieron. Controlador puro: cada solicitud invalida la anterior; solo la vigente aplica su resultado,
 * su error o apaga «Actualizando…». La pantalla muestra un resultado únicamente cuando su clave coincide con el contexto seleccionado.
 */
export const claveContexto = (periodo: string, depositoId: string) => `${periodo}|${depositoId}`;

export function crearCargaDashboard<R>(deps: {
  cargar: (periodo: string, depositoId: string) => Promise<R>;
  alResultado: (clave: string, r: R) => void;
  alError: (clave: string, mensaje: string) => void;
  alCargando: (b: boolean) => void;
}) {
  let token = 0;

  return {
    async solicitar(periodo: string, depositoId: string) {
      const clave = claveContexto(periodo, depositoId);
      const mio = ++token;

      deps.alCargando(true);
      try {
        const r = await deps.cargar(periodo, depositoId);

        if (mio === token) deps.alResultado(clave, r);
      } catch (e) {
        if (mio === token) deps.alError(clave, e instanceof Error ? e.message : "No fue posible cargar el panel.");
      } finally {
        if (mio === token) deps.alCargando(false);
      }
    },
    /** Al desmontar: nada pendiente puede actualizar la pantalla. */
    invalidar() { token += 1; },
  };
}
