/**
 * Estado visual y disponibilidad de una lista de precios (LPR-D03). Separa el estado ADMINISTRATIVO (BORRADOR/INACTIVA/ACTIVA) de la vigencia TEMPORAL y usa SIEMPRE el calendario de
 * America/Asuncion (nunca el huso del dispositivo). No modifica el estado almacenado. Función pura.
 *
 *  · BORRADOR e INACTIVA (o `activo=false`) se muestran tal cual, con cualquier fecha.
 *  · ACTIVA habilitada: inicio futuro → «Aún no vigente»; fin anterior a hoy → «Vencida» (el día de fin es INCLUSIVO); en rango → «Activa» y disponible.
 */
import { hoyAsuncion } from "@/lib/listas-precio/calculos";

export type EstadoVisualLista = "ACTIVA" | "BORRADOR" | "INACTIVA" | "VENCIDA" | "AUN_NO_VIGENTE";

export type DatosVigencia = { estado: string; activo: boolean; vigenteDesde: string; vigenteHasta: string };

export const ETIQUETA_ESTADO_VISUAL: Record<EstadoVisualLista, string> = {
  ACTIVA: "Activa",
  BORRADOR: "Borrador",
  INACTIVA: "Inactiva",
  VENCIDA: "Vencida",
  AUN_NO_VIGENTE: "Aún no vigente",
};

/** `hoy` es una fecha ISO yyyy-mm-dd del calendario de Asunción (ver `hoyAsuncion`). */
export function clasificarVigencia(lista: DatosVigencia, hoy: string): { estadoVisual: EstadoVisualLista; disponible: boolean } {
  if (lista.estado === "BORRADOR") return { estadoVisual: "BORRADOR", disponible: false };
  if (lista.estado === "INACTIVA" || !lista.activo) return { estadoVisual: "INACTIVA", disponible: false };
  if (lista.estado === "VENCIDA") return { estadoVisual: "VENCIDA", disponible: false };

  if (lista.vigenteDesde && lista.vigenteDesde > hoy) return { estadoVisual: "AUN_NO_VIGENTE", disponible: false };
  if (lista.vigenteHasta && lista.vigenteHasta < hoy) return { estadoVisual: "VENCIDA", disponible: false };

  return { estadoVisual: "ACTIVA", disponible: true };
}

/** Fecha de hoy en Asunción para clasificar (el instante se inyecta para poder probarlo). */
export const hoyParaVigencia = (ahora: Date = new Date()) => hoyAsuncion(ahora);

/** `hoy` + n días en el calendario ISO (aritmética en UTC: sin efecto de husos horarios ni horario de verano). */
export function sumarDias(hoy: string, dias: number): string {
  const [a, m, d] = hoy.split("-").map(Number);

  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Milisegundos hasta el comienzo del PRÓXIMO día en America/Asuncion (no la medianoche del dispositivo): se busca el primer instante en que cambia la fecha de Asunción. */
export function msHastaProximoDia(ahora: Date): number {
  const hoy = hoyParaVigencia(ahora);
  let bajo = ahora.getTime();
  let alto = bajo + 26 * 3_600_000; // en cualquier huso real el día siguiente comienza antes de 26 h

  while (alto - bajo > 1000) {
    const medio = Math.floor((bajo + alto) / 2);

    if (hoyParaVigencia(new Date(medio)) === hoy) bajo = medio;
    else alto = medio;
  }

  return alto - ahora.getTime();
}

type DepsVigilante = {
  ahora: () => Date;
  programar: (fn: () => void, ms: number) => unknown;
  cancelar: (handle: unknown) => void;
  /** Suscribe `fn` a los eventos de retorno (foco, visibilidad) y devuelve la función que los retira. */
  suscribir: (fn: () => void) => () => void;
  alCambiar: (hoy: string) => void;
  /** Fecha que la pantalla ya tiene (la del render). Si al instalar el vigilante el día ya cambió, `iniciar` lo notifica (LPR-R04-01). Sin ella se parte de la fecha actual. */
  fechaInicial?: string;
};

/**
 * LPR-R03-01: mantiene la fecha de Asunción al día con la pantalla abierta. Un único temporizador hacia la próxima medianoche de Asunción (reprogramado tras cada revisión) y revisión inmediata al volver
 * el foco/la visibilidad (el navegador puede suspender el temporizador). `alCambiar` solo se invoca cuando la fecha REALMENTE cambió. Un único conjunto de recursos: `detener` los libera.
 */
export function crearVigilanteDia(d: DepsVigilante) {
  // Se parte de la fecha que la PANTALLA conoce, no de «ahora»: así una virada ocurrida entre el render y la instalación del efecto se detecta en `iniciar`.
  let actual = d.fechaInicial ?? hoyParaVigencia(d.ahora());
  let timer: unknown = null;
  let retirar: (() => void) | null = null;

  const reprogramar = () => {
    if (timer !== null) d.cancelar(timer);
    timer = d.programar(revisar, msHastaProximoDia(d.ahora()) + 500);
  };

  function revisar() {
    const hoy = hoyParaVigencia(d.ahora());

    if (hoy !== actual) {
      actual = hoy;
      d.alCambiar(hoy);
    }
    reprogramar();
  }

  return {
    iniciar() {
      if (retirar !== null) return; // sin recursos duplicados
      retirar = d.suscribir(revisar);
      revisar();
    },
    detener() {
      if (timer !== null) d.cancelar(timer);
      timer = null;
      retirar?.();
      retirar = null;
    },
    fechaActual: () => actual,
  };
}
