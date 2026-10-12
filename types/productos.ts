export type ProductoTipo =
  | "MERCADERIA"
  | "SERVICIO"
  | "KIT"
  | "ACTIVO_FIJO";

export type ProductoModoControlStock =
  | "CANTIDAD"
  | "LOTE"
  | "UNIDAD_ETIQUETADA";

export type ProductoCodigoTipo = "GTIN" | "GTIN_EMPAQUE" | "EAN" | "UPC" | "CODIGO_ALTERNO" | "SKU_PROVEEDOR" | "OTRO";

/**
 * Contrato de la ficha (GET /api/productos/[id]). Los importes, cantidades y factores viajan como CADENAS decimales exactas
 * (numeric de PostgreSQL ::text); "" = sin valor (NULL). Nunca Number: no se pierde precisión.
 */
export type ProductoCodigo = {
  id: string;
  tipo: ProductoCodigoTipo;
  codigo: string;
  descripcion: string;
  esPrincipal: boolean;
};

export type ProductoPresentacion = {
  id: string;
  unidadMedidaId: string;
  nombrePresentacion: string;
  factorConversion: string;
  esUnidadBase: boolean;
  esUnidadCompra: boolean;
  esUnidadVenta: boolean;
  codigoBarras: string;
  pesoBrutoKg: string;
  volumenM3: string;
};

export type ProductoProveedor = {
  id: string;
  proveedorId: string;
  proveedorNombre: string;
  codigoProveedor: string;
  descripcionProveedor: string;
  unidadMedidaId: string;
  factorConversion: string;
  costoReferencia: string;
  monedaCodigo: string;
  cantidadMinimaCompra: string;
  plazoEntregaDias: string;
  esPrincipal: boolean;
};

export type ProductoDeposito = {
  id: string;
  depositoId: string;
  depositoNombre: string;
  ubicacionPreferidaId: string;
  stockMinimo: string;
  stockMaximo: string;
  puntoReposicion: string;
  cantidadReposicion: string;
};

export type ProductoAlternativo = {
  id: string;
  productoAlternativoId: string;
  productoAlternativoNombre: string;
  tipo: "SUSTITUTO" | "COMPLEMENTARIO" | "UPSELL";
  prioridad: string;
};

export type ProductoComponente = {
  id: string;
  productoComponenteId: string;
  productoComponenteNombre: string;
  cantidad: string;
  esOpcional: boolean;
  orden: string;
};

/** Documento técnico del producto: archivo privado con versiones (NEX-041) o enlace anterior (legado, sin archivo). */
export type ProductoDocumento = {
  id: string;
  tipo: "FICHA_TECNICA" | "HOJA_SEGURIDAD" | "CERTIFICADO" | "IMAGEN" | "OTRO";
  nombreArchivo: string;
  /** Enlace anterior (documentos cargados antes del archivo privado); vacío si tiene archivo. */
  urlArchivo: string;
  tieneArchivo: boolean;
  tamanoBytes: number | null;
  tipoMime: string;
  version: number;
  /** ISO (yyyy-mm-dd) en la API; la pantalla muestra dd/mm/aaaa. */
  fechaEmision: string;
  fechaVencimiento: string;
  observacion: string;
};

/** Permisos de documentos/foto para el usuario y este producto (la decisión final siempre la toma el servidor). */
export type PermisosDocumentosProducto = { cargar: boolean; gestionar: boolean; historial: boolean; finalizar: boolean };

/** Foto principal privada (NEX-041). La foto anterior por enlace sigue en `imagenUrl`. */
export type ImagenPrivadaProducto = { nombre: string; tamanoBytes: number; tipoMime: string; actualizadaEn: string };

/** Modelo de la ficha tal como lo devuelve GET /api/productos/[id]. */
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
  familiaId: string;
  lineaId: string;
  procedencia: string;

  unidadMedidaId: string;
  impuestoId: string;
  /** Clasificación IVA estándar (E731): "" = sin clasificar (legado), "1"…"4". */
  afectacionIva: string;
  /** E733 informada (solo afectación 4); "" en los demás casos. */
  proporcionGravadaIva: string;

  controlaStock: boolean;
  modoControlStock: ProductoModoControlStock;
  permiteTerceros: boolean;
  requiereVencimiento: boolean;

  stockMinimo: string;
  stockMaximo: string;
  puntoReposicion: string;

  /** Precio de venta de referencia (lista de referencia, NEX-017). null = sin precio cargado (distinto de 0). */
  precioVentaReferencia: string | null;
  /** Moneda del precio de referencia. Solo lectura. */
  monedaPrecioReferencia: string;

  /** Stock real (stock_saldos). Solo lectura: lo mueven los movimientos. */
  stockActual: string;
  stockPorDeposito: { depositoId: string; depositoNombre: string; cantidad: string }[];
  /** Costo promedio real (inventario_costos). null = sin saldo valorizado. Solo lectura. */
  costoPromedio: string | null;
  /** Movimiento de apertura ya registrado (solo lectura). */
  aperturaRegistrada: {
    numero: string;
    fecha: string;
    cantidad: string;
    costoUnitario: string | null;
    depositoNombre: string;
  } | null;

  partidaArancelaria: string;
  ncm: string;
  dncpGeneral: string;
  dncpEspecifico: string;

  paisOrigenCodigo: string;
  paisOrigenNombre: string;

  informacionFactura: string;

  relacionMercaderia: string;
  porcentajeMerma: string;
  cantidadMerma: string;

  vendible: boolean;
  comprable: boolean;
  requiereInspeccionCalidad: boolean;
  vidaUtilDias: string;

  pesoNetoKg: string;
  pesoBrutoKg: string;
  largoCm: string;
  anchoCm: string;
  altoCm: string;
  volumenM3: string;

  /** Enlace de imagen ANTERIOR (legado, se conserva). */
  imagenUrl: string;
  /** Foto privada cargada como archivo; null si no hay. */
  imagenPrivada: ImagenPrivadaProducto | null;
  observacion: string;
  activo: boolean;

  esCreador: boolean;
  cargaDocumentosInicialAbierta: boolean;
  permisosDocumentos: PermisosDocumentosProducto;

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
  familiaId: string;
  familiaNombre: string;
  lineaId: string;
  lineaNombre: string;
  impuestoNombre: string;
  unidadMedidaNombre: string;
  procedencia: string;
  paisOrigenNombre: string;
  controlaStock: boolean;
  stockMinimo: number;
  puntoReposicion: number;
  stockDisponible: number;
  costoPromedio: number | null;
  precioVentaReferencia: number | null;
  monedaPrecioReferencia: string;
  inventarioInicial: number;
  bajoMinimo: boolean;
  activo: boolean;
};

export type CatalogoProductos = {
  categorias: { id: string; codigo: string; nombre: string }[];
  marcas: { id: string; codigo: string; nombre: string }[];
  /** categoriaId = null: familia histórica aún sin clasificar (no se presume categoría por el nombre). */
  familias: { id: string; codigo: string; nombre: string; categoriaId: string | null }[];
  lineas: { id: string; familiaId: string; codigo: string; nombre: string }[];
  /** Moneda del precio de venta de referencia (moneda base de la empresa o la de la lista de referencia). */
  monedaReferencia: string;
  /** `sifenCodigo`/`sifenRepresentacion`: equivalencia oficial E709/E710 (Tabla 5); null = sin equivalencia SIFEN configurada. */
  unidades: { id: string; codigo: string; nombre: string; sifenCodigo: number | null; sifenRepresentacion: string; sifenVigente?: boolean | null }[];
  impuestos: { id: string; codigo: string; nombre: string; porcentaje: string }[];
  proveedores: { id: string; codigo: string; razon_social: string }[];
  depositos: { id: string; codigo: string; nombre: string }[];
  paises: { codigo: string; nombre: string }[];
  monedas: { codigo: string; nombre: string }[];
  productos: { id: string; codigo: string; descripcion: string }[];
};

export type ProductoCodigoDemo = { id: string; tipo: "GTIN" | "GTIN_EMPAQUE" | "EAN" | "UPC" | "CODIGO_ALTERNO" | "OTRO"; codigo: string; descripcion: string; esPrincipal: boolean };
export type ProductoPresentacionDemo = { id: string; unidadMedidaId: string; nombrePresentacion: string; factorConversion: number; esUnidadBase: boolean; esUnidadCompra: boolean; esUnidadVenta: boolean; codigoBarras: string; pesoBrutoKg: number; volumenM3: number };
export type ProductoProveedorDemo = { id: string; proveedorId: string; proveedorNombre: string; codigoProveedor: string; descripcionProveedor: string; unidadMedidaId: string; factorConversion: number; costoReferencia: number; monedaCodigo: string; cantidadMinimaCompra: number; plazoEntregaDias: number; esPrincipal: boolean };
export type ProductoDepositoDemo = { id: string; depositoId: string; depositoNombre: string; ubicacionPreferidaId: string; stockMinimo: number; stockMaximo: number; puntoReposicion: number; cantidadReposicion: number };
export type ProductoAlternativoDemo = { id: string; productoAlternativoId: string; productoAlternativoNombre: string; tipo: "SUSTITUTO" | "COMPLEMENTARIO" | "UPSELL"; prioridad: number };
export type ProductoComponenteDemo = { id: string; productoComponenteId: string; productoComponenteNombre: string; cantidad: number; esOpcional: boolean; orden: number };
export type ProductoDocumentoDemo = { id: string; tipo: "FICHA_TECNICA" | "HOJA_SEGURIDAD" | "CERTIFICADO" | "IMAGEN" | "OTRO"; nombreArchivo: string; urlArchivo: string; fechaEmision: string; fechaVencimiento: string; observacion: string };

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

  codigos: ProductoCodigoDemo[];
  unidades: ProductoPresentacionDemo[];
  proveedores: ProductoProveedorDemo[];
  depositos: ProductoDepositoDemo[];
  alternativos: ProductoAlternativoDemo[];
  componentes: ProductoComponenteDemo[];
  documentos: ProductoDocumentoDemo[];

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
