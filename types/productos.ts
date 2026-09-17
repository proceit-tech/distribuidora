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
