export type VistaStockGeneral = "PRODUCTO" | "DETALLE";
export type NivelStock = "SIN_STOCK" | "BAJO" | "NORMAL" | "SOBRESTOCK";

export type StockGeneralFiltros = {
  vista: VistaStockGeneral;
  q: string;
  depositoId: string;
  categoriaId: string;
  marcaId: string;
  familiaId: string;
  situacion: "" | NivelStock;
  lote: string;
  existencia: "TODOS" | "CON" | "SIN";
};

export type StockGeneralFila = {
  productoId: string;
  codigo: string;
  codigoInventario: string;
  codigoBarras: string;
  descripcion: string;
  categoria: string;
  marca: string;
  familia: string;
  linea: string;
  unidad: string;
  // Vista DETALLE: depósito/lote/vencimiento/propiedad de la fila. Vista PRODUCTO: vacíos (agregado de los depósitos filtrados).
  deposito: string;
  lote: string;
  fechaVencimiento: string;
  propiedad: "" | "PROPIO" | "TERCERO";
  disponible: number;
  reservado: number;
  cuarentena: number;
  transito: number;
  fisico: number;
  virtual: number;
  // Solo vista PRODUCTO: stock de terceros, separado de las cantidades propias.
  terceros: number;
  nivel: NivelStock;
};

export type StockGeneralTotales = {
  productos: number;
  disponible: number;
  reservado: number;
  cuarentena: number;
  transito: number;
  fisico: number;
  virtual: number;
  terceros: number;
  tercerosPorEstado: { disponible: number; reservado: number; cuarentena: number; transito: number };
  sinStock: number;
  bajo: number;
  sobrestock: number;
};

export type StockGeneralRespuesta = {
  empresa: { nombre: string; moneda: string };
  generado: string;
  /** AAAAMMDD-HHMM en hora de Asunción; se usa en el nombre del archivo exportado. */
  sello: string;
  filtros: StockGeneralFiltros;
  pagina: { numero: number; tamano: number; totalFilas: number };
  filas: StockGeneralFila[];
  totales: StockGeneralTotales;
  catalogos: {
    depositos: { id: string; nombre: string }[];
    categorias: { id: string; nombre: string }[];
    marcas: { id: string; nombre: string }[];
    familias: { id: string; nombre: string }[];
  };
  cobertura: string[];
};
