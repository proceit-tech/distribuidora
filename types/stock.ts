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