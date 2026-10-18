/**
 * FAT-D02 — la factura ENVIADA es exactamente la que el operador REVISÓ. Controlador puro (sin React ni red), probado con secuencias de eventos en `revision-factura.casos.ts`.
 * Al iniciar la previa se fija el cuerpo canónico con su huella y una versión; el resultado solo vale si sigue siendo la versión pendiente y el formulario conserva la misma huella. Cualquier cambio
 * (antes o después de la respuesta) invalida la revisión y obliga a revisar de nuevo. El envío toma SIEMPRE el cuerpo revisado fijado (nunca lo reconstruye desde el estado de la pantalla) y solo uno a la vez.
 */
export type Revision<R> = { version: number; huella: string; cuerpo: unknown; resumen: R };
export type TomaEnvio = { cuerpo: unknown; version: number } | "sin_revision" | "cambio" | "en_curso";

export function crearControlRevision<R>() {
  let version = 0;
  let pendiente: { version: number; huella: string } | null = null;
  let revisada: Revision<R> | null = null;
  let enviando = false;

  return {
    /** Inicia una previa: fija el cuerpo (huella canónica) y descarta cualquier revisión o previa anterior. */
    iniciar(cuerpo: unknown): { version: number; huella: string } {
      version += 1;
      pendiente = { version, huella: JSON.stringify(cuerpo) };
      revisada = null;

      return { ...pendiente };
    },
    /** La previa v sigue siendo la pendiente: no fue invalidada por un cambio de datos, por cancelar ni reemplazada por otra. */
    vigente: (v: number) => pendiente !== null && pendiente.version === v,
    /** Versión de la última previa iniciada (para saber si una respuesta pertenece a la previa más reciente). */
    version: () => version,
    /** Respuesta de la previa: solo se acepta si es la previa pendiente y el formulario NO cambió desde que se fijó el cuerpo. */
    resolver(v: number, cuerpo: unknown, huellaActual: string, resumen: R): boolean {
      if (!pendiente || pendiente.version !== v) return false;

      const fijada = pendiente.huella;

      pendiente = null;
      if (fijada !== huellaActual || JSON.stringify(cuerpo) !== fijada) return false;

      revisada = { version: v, huella: fijada, cuerpo, resumen };

      return true;
    },
    /** Cambió el formulario: invalida la previa pendiente y la revisión si su huella ya no coincide. Devuelve true si invalidó algo. */
    sincronizar(huellaActual: string): boolean {
      let invalido = false;

      if (pendiente && pendiente.huella !== huellaActual) { pendiente = null; invalido = true; }
      if (revisada && revisada.huella !== huellaActual) { revisada = null; invalido = true; }

      return invalido;
    },
    revisada: () => revisada,
    /** Volver a editar / cancelar: no emite ni consume número; solo olvida la revisión. */
    cancelar() { pendiente = null; revisada = null; },
    /** «Enviar factura»: devuelve el cuerpo REVISADO (el mismo objeto fijado) o el motivo por el que no se puede enviar. Un envío en curso bloquea cualquier otro. */
    tomarParaEnviar(huellaActual: string): TomaEnvio {
      if (enviando) return "en_curso";
      if (!revisada) return "sin_revision";
      if (revisada.huella !== huellaActual) { revisada = null; return "cambio"; }

      enviando = true;

      return { cuerpo: revisada.cuerpo, version: revisada.version };
    },
    terminarEnvio() { enviando = false; },
    enviando: () => enviando,
  };
}

export type DepsFlujo<R, Res> = {
  previa: (cuerpo: unknown) => Promise<R>;
  enviar: (cuerpo: unknown) => Promise<Res>;
  alRevisando: (b: boolean) => void;
  alRevision: (r: Revision<R> | null) => void;
  alEnviando: (b: boolean) => void;
  alResultado: (r: Res) => void;
  /** Mensaje propio (cambio de datos, falta de revisión). */
  alAviso: (mensaje: string) => void;
  /** Error de la previa o del envío (con sus detalles originales). */
  alError: (e: unknown, fase: "previa" | "envio") => void;
};

export const AVISO_CAMBIO = "Los datos de la factura cambiaron: la revisión anterior quedó sin efecto. Revise la factura de nuevo antes de enviarla.";
export const AVISO_SIN_REVISION = "La factura cambió o no fue revisada: revísela de nuevo antes de enviarla.";

/** Orquesta «Revisar» y «Enviar» sobre el controlador: el cuerpo enviado es el revisado, las respuestas obsoletas se descartan y no hay envíos simultáneos. */
export function crearFlujoRevision<R, Res>(deps: DepsFlujo<R, Res>) {
  const control = crearControlRevision<R>();
  let huella = "";

  return {
    control,
    /** El formulario cambió (huella canónica actual). */
    cambio(h: string) {
      huella = h;

      if (control.sincronizar(h)) {
        deps.alRevision(null);
        deps.alRevisando(false);
        deps.alAviso(AVISO_CAMBIO);
      }
    },
    async revisar(cuerpo: unknown) {
      const previa = control.iniciar(cuerpo);

      huella = previa.huella; // el cuerpo que se revisa ES el formulario actual
      deps.alRevision(null);
      deps.alRevisando(true);
      try {
        const r = await deps.previa(cuerpo);

        // Respuesta de una previa anterior o con el formulario ya modificado: se descarta (no hay revisión vigente).
        if (control.resolver(previa.version, cuerpo, huella, r)) deps.alRevision(control.revisada());
      } catch (e) {
        // C01-R02-01: el error de una previa invalidada (cambio de datos o cancelación) o reemplazada se descarta aunque no haya empezado otra previa.
        if (control.vigente(previa.version)) deps.alError(e, "previa");
      } finally {
        if (control.version() === previa.version) deps.alRevisando(false);
      }
    },
    /** «Volver a editar»: olvida la revisión; no emite ni consume número. */
    cancelar() { control.cancelar(); deps.alRevision(null); deps.alRevisando(false); },
    async enviar() {
      const toma = control.tomarParaEnviar(huella);

      if (toma === "en_curso") return;
      if (toma === "sin_revision" || toma === "cambio") { deps.alRevision(null); deps.alAviso(AVISO_SIN_REVISION); return; }

      deps.alEnviando(true);
      try {
        deps.alResultado(await deps.enviar(toma.cuerpo));
        control.cancelar();
        deps.alRevision(null);
      } catch (e) {
        control.cancelar();
        deps.alRevision(null);
        deps.alError(e, "envio");
      } finally {
        control.terminarEnvio();
        deps.alEnviando(false);
      }
    },
  };
}
