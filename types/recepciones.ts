export type RecepcionEstado =
  | "BORRADOR"
  | "RECIBIDA"
  | "ANULADA";

export type RecepcionItemDemo = {
  id: string;

  productoId: string;
  productoCodigo: string;
  productoCodigoInventario: string;
  productoDescripcion: string;
  unidadMedidaNombre: string;

  cantidadOrdenada: number;
  cantidadRecibida: number;
  cantidadPendiente: number;

  costoUnitario: number;
  subtotal: number;

  lote: string;
  fechaVencimiento: string;
};

export type RecepcionDemo = {
  id: string;
  numero: string;
  estado: RecepcionEstado;

  fecha: string;
  hora: string;

  proveedorId: string;
  proveedorCodigo: string;
  proveedorNombre: string;

  ordenCompraId: string;
  ordenCompraNumero: string;

  depositoId: string;
  depositoCodigo: string;
  depositoNombre: string;

  documentoProveedor: string;
  observacion: string;

  items: RecepcionItemDemo[];

  totalUnidades: number;
  totalCosto: number;

  usuario: string;
  creadoEn: string;
};

export type NuevaRecepcionDemo = Omit<
  RecepcionDemo,
  | "id"
  | "numero"
  | "estado"
  | "totalUnidades"
  | "totalCosto"
  | "creadoEn"
>;