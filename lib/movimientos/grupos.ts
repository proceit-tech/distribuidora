/**
 * Los nueve tipos técnicos de movimiento (enums y funciones SQL intactos) se presentan en CUATRO operaciones (DEFINICAO-MENUS-INVENTARIO-V1 / ORDEM §2.B).
 * Es solo agrupación visual: cada tipo conserva su regla (origen, destino, costo, motivo, saldo) y su motor `inventario_registrar_movimiento`. Funciones puras.
 */
import type { MovimientoStockTipo } from "@/types/movimientos-stock";

export type GrupoMovimiento = "ENTRADA_SALIDA" | "TRANSFERENCIA" | "AJUSTE" | "CAMBIO_ESTADO";

export type InfoGrupo = {
  etiqueta: string;
  /** Qué es y qué NO es (para distinguir Entrada/Salida de Ajuste). */
  ayuda: string;
  /** Subtipos, en orden de presentación, con la etiqueta que se ve dentro del grupo. */
  tipos: Array<{ tipo: MovimientoStockTipo; etiqueta: string }>;
};

export const GRUPOS: Record<GrupoMovimiento, InfoGrupo> = {
  ENTRADA_SALIDA: {
    etiqueta: "Entrada / Salida",
    ayuda: "Hecho físico identificable: recibo o despacho de mercadería que todavía no tiene un documento integrado.",
    tipos: [
      { tipo: "ENTRADA", etiqueta: "Entrada" },
      { tipo: "SALIDA", etiqueta: "Salida" },
    ],
  },
  TRANSFERENCIA: {
    etiqueta: "Transferencia",
    ayuda: "Traslado inmediato de stock disponible entre dos depósitos distintos (una sola operación con dos puntas).",
    tipos: [{ tipo: "TRANSFERENCIA", etiqueta: "Transferencia entre depósitos" }],
  },
  AJUSTE: {
    etiqueta: "Ajuste",
    ayuda: "Diferencia de inventario, pérdida o regularización. Siempre con motivo; no sustituye a una entrada o salida reales.",
    tipos: [
      { tipo: "AJUSTE_POSITIVO", etiqueta: "Ajuste positivo (sobrante)" },
      { tipo: "AJUSTE_NEGATIVO", etiqueta: "Ajuste negativo (faltante)" },
    ],
  },
  CAMBIO_ESTADO: {
    etiqueta: "Cambio de estado",
    ayuda: "Mueve stock entre estados dentro del mismo depósito: reserva o cuarentena y sus liberaciones.",
    tipos: [
      { tipo: "RESERVA", etiqueta: "Reservar" },
      { tipo: "LIBERACION_RESERVA", etiqueta: "Liberar reserva" },
      { tipo: "CUARENTENA", etiqueta: "Enviar a cuarentena" },
      { tipo: "LIBERACION_CUARENTENA", etiqueta: "Liberar de cuarentena" },
    ],
  },
};

export const ORDEN_GRUPOS = Object.keys(GRUPOS) as GrupoMovimiento[];

export function grupoDeTipo(tipo: MovimientoStockTipo): GrupoMovimiento {
  return ORDEN_GRUPOS.find((g) => GRUPOS[g].tipos.some((t) => t.tipo === tipo)) ?? "ENTRADA_SALIDA";
}

/** Primer subtipo del grupo: el que queda seleccionado al elegir la operación. */
export const tipoInicialDelGrupo = (grupo: GrupoMovimiento): MovimientoStockTipo => GRUPOS[grupo].tipos[0].tipo;

/** Todos los tipos técnicos cubiertos por los grupos, sin repetir (deben ser los nueve existentes). */
export const tiposAgrupados = (): MovimientoStockTipo[] => ORDEN_GRUPOS.flatMap((g) => GRUPOS[g].tipos.map((t) => t.tipo));
