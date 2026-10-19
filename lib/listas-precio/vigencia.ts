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
