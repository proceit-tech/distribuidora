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
/** Fila del historial real (una por línea de movimiento; `id` = id del movimiento). */
export type MovimientoStockFila = {
  id: string;
  lineaId: string;
  numero: string;
  tipo: MovimientoStockTipo;
  origen: MovimientoStockOrigen | "ABERTURA" | "ANULACION";
  estado: MovimientoStockEstado;
  fecha: string;
  hora: string;
  productoId: string;
  productoCodigo: string;
  productoDescripcion: string;
  unidadMedidaNombre: string;
  depositoOrigenId: string;
  depositoOrigenNombre: string;
  depositoDestinoId: string;
  depositoDestinoNombre: string;
  cantidad: number;
  costoUnitario: number | null;
  costoTotal: number | null;
  monedaCosto: string;
  lote: string;
  fechaVencimiento: string;
  propiedad: "PROPIO" | "TERCERO";
  documentoReferencia: string;
  motivo: string;
  observacion: string;
  usuario: string;
  creadoEn: string;
};

export type MovimientoStockDetalle = MovimientoStockFila & {
  /** Todas las líneas del movimiento (la primera coincide con los campos planos). */
  lineas: MovimientoStockFila[];
  /** Número del movimiento que anuló a este (si está ANULADO) o que este anula (si es ANULACION). */
  anuladoPor: string;
  anulaA: string;
};

export type NuevoMovimientoStock = {
  tipo: MovimientoStockTipo;
  origen: MovimientoStockOrigen;
  fecha: string;
  productoId: string;
  cantidad: number;
  costoUnitario: number | null;
  depositoOrigenId: string;
  depositoDestinoId: string;
  lote: string;
  fechaVencimiento: string;
  documentoReferencia: string;
  motivo: string;
  observacion: string;
  claveIdempotencia: string;
};

export type MovimientoDepositoOpcion = { id: string; codigo: string; nombre: string; permitido: boolean };

export type MovimientoProductoOpcion = {
  id: string;
  codigo: string;
  descripcion: string;
  unidadMedidaNombre: string;
  modoControl: "CANTIDAD" | "LOTE" | "UNIDAD_ETIQUETADA";
  /** Stock por depósito (sumado en todos los lotes, solo stock propio) y costo promedio. */
  stock: Array<{
    depositoId: string;
    disponible: number;
    reservado: number;
    cuarentena: number;
    transito: number;
    costoPromedio: number | null;
  }>;
  /** Lotes con saldo, por depósito y estado. */
  lotes: Array<{ depositoId: string; codigo: string; fechaVencimiento: string; estado: string; cantidad: number }>;
};

export type CatalogoMovimientos = {
  depositos: MovimientoDepositoOpcion[];
  productos: MovimientoProductoOpcion[];
  monedaBase: string;
};
