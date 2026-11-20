/**
 * Refresco de LECTURA de «Documentos electrónicos» (PRO-94, RN-19, NCE-R02-01): mientras haya documentos pendientes de resultado fiscal se vuelve a leer el listado, SIN tope de lecturas total
 * (un documento puede seguir pendiente muchas horas), con la frecuencia decreciente y con tope (30 s → 60 s → 120 s) para no cargar al servidor. Solo cuenta la pestaña visible: oculta no lee, y al
 * volver a ser visible se lee de inmediato. Solo GET del listado: no consulta ni reenvía nada (eso lo hace el servidor). `detener` limpia todo (desmontaje, cambio de filtros, sin pendientes).
 */
export const RETARDOS_REFRESCO_MS = { rapido: 30_000, medio: 60_000, lento: 120_000 } as const;

/** Retardo antes de la lectura número `lecturas + 1`: 20 lecturas a 30 s, 40 a 60 s y luego 120 s de forma indefinida. */
export function retardoRefresco(lecturas: number): number {
  if (lecturas < 20) return RETARDOS_REFRESCO_MS.rapido;
  if (lecturas < 60) return RETARDOS_REFRESCO_MS.medio;

  return RETARDOS_REFRESCO_MS.lento;
}

export type EntornoRefresco = {
  leer: () => void;
  visible: () => boolean;
  programar: (f: () => void, ms: number) => unknown;
  cancelar: (t: unknown) => void;
  /** Registra un aviso de cambio de visibilidad; devuelve la función que lo retira. */
  alVolverVisible: (f: () => void) => () => void;
};

export function iniciarRefresco(e: EntornoRefresco): () => void {
  let lecturas = 0;
  let timer: unknown;
  let activo = true;

  const ciclo = () => {
    if (!activo) return;

    if (e.visible()) {
      lecturas += 1;
      e.leer();
    }

    timer = e.programar(ciclo, retardoRefresco(lecturas));
  };

  const retirar = e.alVolverVisible(() => {
    if (!activo || !e.visible()) return;

    e.cancelar(timer);
    ciclo();
  });

  timer = e.programar(ciclo, retardoRefresco(0));

  return () => {
    activo = false;
    e.cancelar(timer);
    retirar();
  };
}
