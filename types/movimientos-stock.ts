"use client";

export type MovimientoStockTipo =
  | "ENTRADA"
  | "SALIDA"
  | "TRANSFERENCIA"
  | "AJUSTE_POSITIVO"
  | "AJUSTE_NEGATIVO"
  | "RESERVA"
  | "LIBERACION_RESERVA"
  | "CUARENTENA"
  | "LIBERACION_CUARENTENA";

export type MovimientoStockOrigen =
  | "MANUAL"
  | "COMPRA"
  | "VENTA"
  | "DEVOLUCION"
  | "TRANSFERENCIA"
  | "AJUSTE"
  | "INVENTARIO";

export type MovimientoStockEstado =
  | "REGISTRADO"
  | "ANULADO";

export type MovimientoStockDemo = {
  id: string;
  numero: string;

  tipo: MovimientoStockTipo;
  origen: MovimientoStockOrigen;
  estado: MovimientoStockEstado;

  fecha: string;
  hora: string;

  productoId: string;
  productoCodigo: string;
  productoDescripcion: string;
  unidadMedidaNombre: string;

  depositoOrigenId: string;
  depositoOrigenCodigo: string;
  depositoOrigenNombre: string;

  depositoDestinoId: string;
  depositoDestinoCodigo: string;
  depositoDestinoNombre: string;

  cantidad: number;

  lote: string;
  fechaVencimiento: string;

  propiedad: "PROPIO" | "TERCERO";
  propietarioId: string;
  propietarioNombre: string;

  documentoReferencia: string;
  motivo: string;
  observacion: string;

  usuario: string;

  creadoEn: string;
};

export type NuevoMovimientoStockDemo = Omit<
  MovimientoStockDemo,
  "id" | "numero" | "estado" | "creadoEn"
>;