export type ListaPrecioTipo =
  | "VENTA"
  | "COMPRA";

/** Código ISO de la tabla `monedas` (catálogo del banco). */
export type ListaPrecioMoneda = string;

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

export type ListaPrecioDetalle = {
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

  /** Lista de precio de venta de referencia de la ficha de Productos (NEX-017). Solo lectura. */
  esReferencia: boolean;

  creadoEn: string;
  actualizadoEn: string;
};

export type NuevaListaPrecio = Omit<
  ListaPrecioDetalle,
  "id" | "creadoEn" | "actualizadoEn" | "esReferencia"
>;

/** Fila de la lista (GET /api/listas-precio): sin los hijos, con sus conteos. */
export type ListaPrecioFila = Omit<
  ListaPrecioDetalle,
  "productos" | "reglasComerciales"
> & {
  productosCount: number;
  reglasCount: number;
};

export type ListaPrecioProductoOpcion = {
  id: string;
  codigo: string;
  descripcion: string;
  unidadMedidaId: string;
  unidadMedidaNombre: string;
  /** Costo promedio real (inventario_costos); 0 si no hay saldo valorizado. */
  costoPromedio: number;
  /** Precio de venta de referencia (lista de referencia) o null si no tiene. */
  precioReferencia: number | null;
};

export type CatalogoListasPrecio = {
  monedas: { codigo: string; nombre: string; simbolo: string }[];
  gruposCliente: ListaPrecioCatalogoOpcion[];
  zonas: ListaPrecioCatalogoOpcion[];
  canales: ListaPrecioCatalogoOpcion[];
  clientes: ListaPrecioCatalogoOpcion[];
  productos: ListaPrecioProductoOpcion[];
  listasBase: { id: string; codigo: string; nombre: string; monedaCodigo: string }[];
  monedaBase: string;
};

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