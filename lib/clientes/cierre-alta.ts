/**
 * CLI-R03-01 — protección de «cambios sin guardar» de la alta y cierre explícito de la carga inicial. Lógica pura (la misma que usa la pantalla), probada sin navegador.
 * La protección solo se libera cuando el servidor CONFIRMÓ el cierre (`cerrada`): cancelar la confirmación o un fallo HTTP/de conexión la mantienen y permiten reintentar.
 */
export type EstadoProteccionAlta = {
  /** El cliente ya fue creado (identidad conservada). */
  altaCreada: boolean;
  /** El servidor confirmó el cierre de la carga inicial: ya no hay nada que proteger. */
  cerrada: boolean;
  /** Antes del alta: el formulario tiene datos escritos. */
  formularioSucio: boolean;
  /** Después del alta: hay documentos con archivo que todavía no se subieron. */
  hayArchivosPendientes: boolean;
};

export function altaSucia(e: EstadoProteccionAlta): boolean {
  if (e.cerrada) return false;

  return e.altaCreada ? e.hayArchivosPendientes : e.formularioSucio;
}

export type ResultadoCierre = "cancelado" | "finalizado" | "error";

/** «Finalizar sin los documentos pendientes»: confirma, cierra en el servidor y solo si el servidor respondió OK da por terminada el alta. */
export async function finalizarSinPendientes(deps: {
  confirmar: () => boolean;
  cerrarCarga: () => Promise<boolean>;
  alTerminar: () => void;
}): Promise<ResultadoCierre> {
  if (!deps.confirmar()) return "cancelado";

  let ok = false;

  try {
    ok = await deps.cerrarCarga();
  } catch {
    ok = false;
  }

  if (!ok) return "error";

  deps.alTerminar();

  return "finalizado";
}
