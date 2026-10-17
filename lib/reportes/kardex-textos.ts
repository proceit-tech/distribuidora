// Textos del Kardex compartidos entre servidor, exportación y pantalla (sin dependencias de servidor).

export const TIPOS_KARDEX: { id: string; nombre: string }[] = [
  { id: "ENTRADA", nombre: "Entrada" }, { id: "SALIDA", nombre: "Salida" }, { id: "TRANSFERENCIA", nombre: "Transferencia" },
  { id: "AJUSTE_POSITIVO", nombre: "Ajuste positivo" }, { id: "AJUSTE_NEGATIVO", nombre: "Ajuste negativo" },
  { id: "RESERVA", nombre: "Reserva" }, { id: "LIBERACION_RESERVA", nombre: "Liberación de reserva" },
  { id: "CUARENTENA", nombre: "Cuarentena" }, { id: "LIBERACION_CUARENTENA", nombre: "Liberación de cuarentena" },
];
export const ORIGENES_KARDEX: Record<string, string> = {
  MANUAL: "Manual", COMPRA: "Compra", VENTA: "Venta", DEVOLUCION: "Devolución", TRANSFERENCIA: "Transferencia",
  AJUSTE: "Ajuste", INVENTARIO: "Inventario", ABERTURA: "Apertura", ANULACION: "Anulación",
};
