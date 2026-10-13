export type StockEstado =
  | "DISPONIBLE"
  | "RESERVADO"
  | "CUARENTENA"
  | "TRANSITO";

export type StockPropiedad =
  | "PROPIO"
  | "TERCERO";

export type StockNivel =
  | "NORMAL"
  | "BAJO"
  | "SIN_STOCK"
  | "SOBRESTOCK";

export type StockLoteDemo = {
  id: string;
  lote: string;
  fechaVencimiento: string;
  cantidad: number;
  estado: StockEstado;
  ubicacion: string;
  propietario: string;
};

export type StockDepositoDetalleDemo = {
  id: string;
  depositoId: string;
  depositoCodigo: string;
  depositoNombre: string;
  ubicacion: string;
  disponible: number;
  reservado: number;
  cuarentena: number;
  transito: number;
  totalFisico: number;
};

export type StockDemo = {
  id: string;

  productoId: string;
  productoCodigo: string;
  productoCodigoInventario: string;
  productoDescripcion: string;
  codigoBarras: string;

  categoria: string;
  marca: string;
  familia: string;
  linea: string;
  procedencia: string;

  unidadMedidaId: string;
  unidadMedidaNombre: string;

  modoControl:
    | "CANTIDAD"
    | "LOTE"
    | "UNIDAD_ETIQUETADA";

  stockMinimo: number;
  stockMaximo: number;
  puntoReposicion: number;

  disponible: number;
  reservado: number;
  cuarentena: number;
  transito: number;

  totalFisico: number;
  totalVirtual: number;

  propiedad: StockPropiedad;
  propietarioId: string;
  propietarioNombre: string;

  nivel: StockNivel;

  costoPromedio: number;
  valorInventario: number;

  precioVentaReferencia: number;
  valorVentaReferencia: number;

  depositos: StockDepositoDetalleDemo[];
  lotes: StockLoteDemo[];

  actualizadoEn: string;
};

export type StockResumenDemo = {
  skuActivos: number;
  unidadesDisponibles: number;
  stockBajo: number;
  sinStock: number;
  valorInventario: number;
  valorVentaReferencia: number;
};
/** Stock real (PostgreSQL). Cantidades = stock PROPIO; `terceros` = stock de terceros (todas las situaciones). */
export type StockLote = {
  id: string;
  lote: string;
  fechaVencimiento: string;
  cantidad: number;
  estado: StockEstado;
  depositoId: string;
  /** Nombre del depósito (la ubicación física dentro del depósito no existe en el banco). */
  ubicacion: string;
  propietario: string;
};

/** Detalle real por depósito: saldos PROPIOS, terceros, costo valorizado y parámetros propios del depósito (null = no configurado). */
export type StockDeposito = StockDepositoDetalleDemo & {
  terceros: number;
  costoCantidad: number;
  costoValor: number;
  /** Cantidad disponible propia y valor a costo como decimal exacto (texto de numeric): nunca se suman como float (INV-04). */
  disponibleTexto: string;
  costoValorTexto: string;
  stockMinimo: number | null;
  stockMaximo: number | null;
  puntoReposicion: number | null;
  cantidadReposicion: number | null;
};

export type StockItem = Omit<
  StockDemo,
  | "depositos"
  | "precioVentaReferencia"
  | "valorVentaReferencia"
  | "costoPromedio"
  | "lotes"
  | "stockMaximo"
  | "puntoReposicion"
> & {
  stockMaximo: number;
  puntoReposicion: number;
  /** null = sin costo registrado / sin precio de referencia (nunca se inventan). */
  costoPromedio: number | null;
  precioVentaReferencia: number | null;
  valorVentaReferencia: number | null;
  monedaPrecio: string;
  /** Decimales exactos (texto) para presentar importes sin pérdida; el valor a costo está en la moneda base y el de venta en `monedaPrecio` (INV-03/04). */
  valorInventarioTexto: string;
  precioVentaReferenciaTexto: string | null;
  valorVentaReferenciaTexto: string | null;
  terceros: number;
  depositos: StockDeposito[];
  lotes: StockLote[];
};

/** alcanceParcial: el usuario solo ve los depósitos que tiene autorizados (los totales no incluyen los demás). */
export type StockRespuesta = { stock: StockItem[]; monedaBase: string; alcanceParcial?: boolean; permisos?: { movimientosCrear: boolean; movimientosVer: boolean } };
