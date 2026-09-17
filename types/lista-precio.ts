export type ListaPrecioTipo =
  | "VENTA"
  | "COMPRA";

export type ListaPrecioMoneda =
  | "PYG"
  | "USD"
  | "BRL"
  | "EUR";

export type ListaPrecioEstado =
  | "BORRADOR"
  | "ACTIVA"
  | "INACTIVA"
  | "VENCIDA";

export type ListaPrecioModo =
  | "PRECIO_FIJO"
  | "AJUSTE_PORCENTAJE"
  | "MARGEN_SOBRE_COSTO";

export type ListaPrecioAplicacion =
  | "GENERAL"
  | "GRUPO_CLIENTE"
  | "CLIENTE"
  | "ZONA"
  | "CANAL_VENTA";

export type ListaPrecioOperacionAjuste =
  | "AUMENTAR_PORCENTAJE"
  | "DISMINUIR_PORCENTAJE"
  | "MARGEN_SOBRE_COSTO"
  | "PRECIO_FIJO";

export type ListaPrecioEscala = {
  id: string;
  cantidadMinima: number;
  cantidadMaxima: number | null;
  precio: number;
  descuentoPct: number;
};

export type ListaPrecioProducto = {
  id: string;

  productoId: string;
  productoCodigo: string;
  productoDescripcion: string;

  unidadMedidaId: string;
  unidadMedidaNombre: string;

  monedaCodigo: ListaPrecioMoneda;

  costoReferencia: number;
  precioBase: number;
  precioLista: number;

  margenPct: number;
  descuentoPct: number;

  cantidadMinima: number;

  vigenteDesde: string;
  vigenteHasta: string;

  activo: boolean;

  escalas: ListaPrecioEscala[];
};

export type ListaPrecioReglaComercial = {
  id: string;

  tipoAplicacion: ListaPrecioAplicacion;

  referenciaId: string;
  referenciaCodigo: string;
  referenciaNombre: string;

  prioridad: number;

  cantidadMinima: number;

  permiteDescuentoAdicional: boolean;

  descuentoMaximoPct: number;

  vigenteDesde: string;
  vigenteHasta: string;

  activo: boolean;
};

export type ListaPrecioAjusteMasivo = {
  origen:
    | "LISTA_BASE"
    | "COSTO_PROMEDIO";

  operacion: ListaPrecioOperacionAjuste;

  valor: number;
};

export type ListaPrecioDemo = {
  id: string;

  codigo: string;
  nombre: string;
  descripcion: string;

  tipo: ListaPrecioTipo;

  monedaCodigo: ListaPrecioMoneda;

  estado: ListaPrecioEstado;

  modoPrecio: ListaPrecioModo;

  incluyeIva: boolean;

  listaBaseId: string;
  listaBaseCodigo: string;
  listaBaseNombre: string;

  ajusteGeneralPct: number;

  vigenteDesde: string;
  vigenteHasta: string;

  prioridad: number;

  permiteDescuentoAdicional: boolean;

  descuentoMaximoPct: number;

  grupoClienteId: string;
  grupoClienteNombre: string;

  clienteId: string;
  clienteCodigo: string;
  clienteNombre: string;

  zonaId: string;
  zonaNombre: string;

  canalVentaId: string;
  canalVentaNombre: string;

  productos: ListaPrecioProducto[];

  reglasComerciales: ListaPrecioReglaComercial[];

  activo: boolean;

  observacion: string;

  creadoEn: string;
  actualizadoEn: string;
};

export type NuevaListaPrecioDemo = Omit<
  ListaPrecioDemo,
  "id" | "creadoEn" | "actualizadoEn"
>;

export type ListaPrecioCatalogoOpcion = {
  id: string;
  codigo: string;
  nombre: string;
};

export type ListaPrecioResumen = {
  totalListas: number;
  activas: number;
  venta: number;
  compra: number;
  proximasAVencer: number;
};

export type ListaPrecioProductoCalculado = {
  productoId: string;
  productoCodigo: string;
  productoDescripcion: string;

  costoReferencia: number;
  precioBase: number;
  precioCalculado: number;

  margenPct: number;
  descuentoPct: number;

  cantidadMinima: number;

  origenPrecio:
    | "LISTA_BASE"
    | "PRECIO_ESPECIFICO"
    | "ESCALA_CANTIDAD"
    | "AJUSTE_GENERAL";
};