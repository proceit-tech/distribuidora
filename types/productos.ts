export type ProductoTipo =
  | "MERCADERIA"
  | "SERVICIO"
  | "KIT"
  | "ACTIVO_FIJO";

export type ProductoModoControlStock =
  | "CANTIDAD"
  | "LOTE"
  | "UNIDAD_ETIQUETADA";

export type ProductoCodigo = {
  id: string;
  tipo:
    | "GTIN"
    | "GTIN_EMPAQUE"
    | "EAN"
    | "UPC"
    | "CODIGO_ALTERNO"
    | "OTRO";
  codigo: string;
  descripcion: string;
  esPrincipal: boolean;
};

export type ProductoPresentacion = {
  id: string;
  unidadMedidaId: string;
  nombrePresentacion: string;
  factorConversion: number;
  esUnidadBase: boolean;
  esUnidadCompra: boolean;
  esUnidadVenta: boolean;
  codigoBarras: string;
  pesoBrutoKg: number;
  volumenM3: number;
};

export type ProductoProveedor = {
  id: string;
  proveedorId: string;
  proveedorNombre: string;
  codigoProveedor: string;
  descripcionProveedor: string;
  unidadMedidaId: string;
  factorConversion: number;
  costoReferencia: number;
  monedaCodigo: string;
  cantidadMinimaCompra: number;
  plazoEntregaDias: number;
  esPrincipal: boolean;
};

export type ProductoDeposito = {
  id: string;
  depositoId: string;
  depositoNombre: string;
  ubicacionPreferidaId: string;
  stockMinimo: number;
  stockMaximo: number;
  puntoReposicion: number;
  cantidadReposicion: number;
};

export type ProductoAlternativo = {
  id: string;
  productoAlternativoId: string;
  productoAlternativoNombre: string;
  tipo:
    | "SUSTITUTO"
    | "COMPLEMENTARIO"
    | "UPSELL";
  prioridad: number;
};

export type ProductoComponente = {
  id: string;
  productoComponenteId: string;
  productoComponenteNombre: string;
  cantidad: number;
  esOpcional: boolean;
  orden: number;
};

export type ProductoDocumento = {
  id: string;
  tipo:
    | "FICHA_TECNICA"
    | "HOJA_SEGURIDAD"
    | "CERTIFICADO"
    | "IMAGEN"
    | "OTRO";
  nombreArchivo: string;
  urlArchivo: string;
  fechaEmision: string;
  fechaVencimiento: string;
  observacion: string;
};

/** Modelo de la ficha (formulario) tal como lo devuelve GET /api/productos/[id]. */
export type ProductoDetalle = {
  id: string;

  codigo: string;
  codigoInventario: string;
  codigoSifen: string;
  codigoBarras: string;

  descripcion: string;
  descripcionFactura: string;
  tipoProducto: ProductoTipo;

  categoriaId: string;
  marcaId: string;
  procedencia: string;

  unidadMedidaId: string;
  impuestoId: string;

  controlaStock: boolean;
  modoControlStock: ProductoModoControlStock;
  permiteTerceros: boolean;
  requiereVencimiento: boolean;

  stockMinimo: number;
  stockMaximo: number;
  puntoReposicion: number;

  partidaArancelaria: string;
  ncm: string;
  dncpGeneral: string;
  dncpEspecifico: string;

  paisOrigenCodigo: string;
  paisOrigenNombre: string;

  informacionFactura: string;

  relacionMercaderia: string;
  porcentajeMerma: number;
  cantidadMerma: number;

  vendible: boolean;
  comprable: boolean;
  requiereInspeccionCalidad: boolean;
  vidaUtilDias: number;

  pesoNetoKg: number;
  pesoBrutoKg: number;
  largoCm: number;
  anchoCm: number;
  altoCm: number;
  volumenM3: number;

  imagenUrl: string;
  observacion: string;
  activo: boolean;

  codigos: ProductoCodigo[];
  unidades: ProductoPresentacion[];
  proveedores: ProductoProveedor[];
  depositos: ProductoDeposito[];
  alternativos: ProductoAlternativo[];
  componentes: ProductoComponente[];
  documentos: ProductoDocumento[];

  creadoEn: string;
  actualizadoEn: string;
};

export type NuevoProducto = Omit<
  ProductoDetalle,
  "id" | "creadoEn" | "actualizadoEn"
>;

/** Fila de la lista (GET /api/productos) ya mapeada a camelCase. */
export type ProductoLista = {
  id: string;
  codigo: string;
  codigoInventario: string;
  codigoSifen: string;
  codigoBarras: string;
  descripcion: string;
  descripcionFactura: string;
  tipoProducto: ProductoTipo;
  categoriaNombre: string;
  marcaNombre: string;
  impuestoNombre: string;
  unidadMedidaNombre: string;
  procedencia: string;
  paisOrigenNombre: string;
  controlaStock: boolean;
  stockMinimo: number;
  puntoReposicion: number;
  stockDisponible: number;
  bajoMinimo: boolean;
  activo: boolean;
};

export type CatalogoProductos = {
  categorias: { id: string; codigo: string; nombre: string }[];
  marcas: { id: string; codigo: string; nombre: string }[];
  unidades: { id: string; codigo: string; nombre: string }[];
  impuestos: { id: string; codigo: string; nombre: string; porcentaje: number }[];
  proveedores: { id: string; codigo: string; razon_social: string }[];
  depositos: { id: string; codigo: string; nombre: string }[];
  paises: { codigo: string; nombre: string }[];
  productos: { id: string; codigo: string; descripcion: string }[];
};

/**
 * LEGADO: solo lo usan los mocks de Stock/Movimientos/Recepciones (lib/mocks/productos*.ts),
 * pendientes de sus propios ítems. Productos ya no los utiliza. Eliminar junto con esos mocks.
 */
export type ProductoDemo = {
  id: string;

  codigo: string;
  codigoInventario: string;
  codigoSifen: string;
  codigoBarras: string;

  descripcion: string;
  descripcionFactura: string;
  tipoProducto: ProductoTipo;

  categoriaId: string;
  categoriaNombre: string;

  marcaId: string;
  marcaNombre: string;

  familiaNombre: string;
  lineaNombre: string;
  procedencia: string;

  unidadMedidaId: string;
  unidadMedidaNombre: string;

  impuestoId: string;
  impuestoNombre: string;

  controlaStock: boolean;
  modoControlStock: ProductoModoControlStock;
  permiteTerceros: boolean;
  requiereVencimiento: boolean;

  stockMinimo: number;
  stockMaximo: number;
  puntoReposicion: number;
  stockActual: number;

  inventarioInicial: number;

  costoPromedio: number;

  precioVentaReferencia: number;
  valorVentaReferencia: number;

  partidaArancelaria: string;
  ncm: string;
  dncpGeneral: string;
  dncpEspecifico: string;

  paisOrigenCodigo: string;
  paisOrigenNombre: string;

  informacionFactura: string;

  relacionMercaderia: string;
  porcentajeMerma: number;
  cantidadMerma: number;

  vendible: boolean;
  comprable: boolean;
  requiereInspeccionCalidad: boolean;
  vidaUtilDias: number;

  pesoNetoKg: number;
  pesoBrutoKg: number;
  largoCm: number;
  anchoCm: number;
  altoCm: number;
  volumenM3: number;

  imagenUrl: string;
  observacion: string;
  activo: boolean;

  codigos: ProductoCodigo[];
  unidades: ProductoPresentacion[];
  proveedores: ProductoProveedor[];
  depositos: ProductoDeposito[];
  alternativos: ProductoAlternativo[];
  componentes: ProductoComponente[];
  documentos: ProductoDocumento[];

  creadoEn: string;
  actualizadoEn: string;
};

export type NuevoProductoDemo = Omit<
  ProductoDemo,
  "id" | "creadoEn" | "actualizadoEn"
>;

export type ProductoCatalogoOpcion = {
  id: string;
  codigo: string;
  nombre: string;
};
