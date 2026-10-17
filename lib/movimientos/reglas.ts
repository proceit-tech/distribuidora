/**
 * Reglas de negocio de los movimientos MANUALES (pantalla «Nuevo movimiento» y su API), compartidas por el formulario y por la API para que ambos
 * apliquen exactamente lo mismo. Aprobadas por el responsable (matriz de origen por tipo y motivo contextual).
 *
 * Alcance y límites:
 *  · Solo gobiernan lo que se registra por la API de la pantalla. Las funciones SQL (inventario_registrar_movimiento) siguen aceptando todas las
 *    combinaciones: no se modificó ninguna función ni migration, y los movimientos ya registrados no se alteran ni se reclasifican.
 *  · Los movimientos que en el futuro generen otros módulos (compras, ventas, remisión, devoluciones) NO usan un motivo escrito a mano: aportarán un
 *    texto estructurado y el vínculo persistido documento/línea/evento físico (AUD-DOC-01). Esta política no se les aplica.
 */

export type TipoMovimiento = "ENTRADA" | "SALIDA" | "TRANSFERENCIA" | "AJUSTE_POSITIVO" | "AJUSTE_NEGATIVO" | "RESERVA" | "LIBERACION_RESERVA" | "CUARENTENA" | "LIBERACION_CUARENTENA";
export type OrigenMovimiento = "MANUAL" | "COMPRA" | "VENTA" | "DEVOLUCION" | "TRANSFERENCIA" | "AJUSTE" | "INVENTARIO";

/** Orígenes permitidos por tipo; el primero es el predeterminado. «Compra», «Venta» y «Devolución» no implican un documento. */
export const ORIGENES_POR_TIPO: Record<TipoMovimiento, OrigenMovimiento[]> = {
  ENTRADA: ["COMPRA", "DEVOLUCION", "INVENTARIO", "MANUAL"],
  SALIDA: ["VENTA", "DEVOLUCION", "INVENTARIO", "MANUAL"],
  TRANSFERENCIA: ["TRANSFERENCIA"],
  AJUSTE_POSITIVO: ["AJUSTE", "INVENTARIO", "MANUAL"],
  AJUSTE_NEGATIVO: ["AJUSTE", "INVENTARIO", "MANUAL"],
  RESERVA: ["AJUSTE", "MANUAL"],
  LIBERACION_RESERVA: ["AJUSTE", "MANUAL"],
  CUARENTENA: ["AJUSTE", "MANUAL"],
  LIBERACION_CUARENTENA: ["AJUSTE", "MANUAL"],
};

export const MOTIVO_MINIMO = 5;

export function origenPermitido(tipo: string, origen: string): boolean {
  return (ORIGENES_POR_TIPO[tipo as TipoMovimiento] as string[] | undefined)?.includes(origen) ?? false;
}

/**
 * Motivo obligatorio (mínimo 5 caracteres, igual que la anulación): ajustes, cuarentena y su liberación, reservas y liberaciones (siempre manuales
 * aquí), y entradas/salidas cuyo origen es MANUAL o INVENTARIO (sin documento operativo). Opcional: compra/devolución/venta y transferencia.
 */
export function motivoObligatorio(tipo: string, origen: string): boolean {
  if (["AJUSTE_POSITIVO", "AJUSTE_NEGATIVO", "CUARENTENA", "LIBERACION_CUARENTENA", "RESERVA", "LIBERACION_RESERVA"].includes(tipo)) return true;
  if (tipo === "ENTRADA" || tipo === "SALIDA") return origen === "MANUAL" || origen === "INVENTARIO";

  return false;
}

export const mensajeMotivoObligatorio = "Indique el motivo (mínimo 5 caracteres): este tipo de movimiento no tiene un documento que lo respalde.";
