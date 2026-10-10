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
  // Vista DETALLE: depósito/lote/vencimiento de la fila y qué stock tiene (PROPIO, TERCERO o AMBOS). Vista PRODUCTO: vacíos (agregado de los depósitos filtrados).
  deposito: string;
  lote: string;
  fechaVencimiento: string;
  propiedad: "" | "PROPIO" | "TERCERO" | "AMBOS";
  disponible: number;
  reservado: number;
  cuarentena: number;
  transito: number;
  fisico: number;
  virtual: number;
  // Stock de terceros (todos los estados), SIEMPRE separado de las cantidades propias. Igual significado en las dos vistas.
  terceros: number;
  tercerosEstados: { disponible: number; reservado: number; cuarentena: number; transito: number };
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

// ---- Reporte 2: Valorización de inventario ----
export type VistaValorizacion = "DETALLE" | "PRODUCTO" | "DEPOSITO" | "CATEGORIA";
/** CON_COSTO: toda la cantidad física está valorizada; PARCIAL: valorizada ≠ física; SIN_COSTO: hay stock físico sin valorizar; SIN_STOCK: sin cantidades. */
export type SituacionCosto = "CON_COSTO" | "PARCIAL" | "SIN_COSTO" | "SIN_STOCK";

export type ValorizacionFiltros = {
  vista: VistaValorizacion;
  q: string;
  depositoId: string;
  categoriaId: string;
  familiaId: string;
  existencia: "TODOS" | "CON" | "SIN";
  costo: "TODOS" | "CON" | "SIN";
};

export type ValorizacionFila = {
  clave: string;
  codigo: string;
  descripcion: string;
  categoria: string;
  familia: string;
  deposito: string;
  /** Cantidad de productos / depósitos que agrupa la fila (1 en la vista DETALLE). */
  productos: number;
  depositos: number;
  /** Stock físico PROPIO (disponible + reservado + cuarentena), de stock_saldos: solo para conciliar con Stock. */
  fisico: number;
  /** Cantidad valorizada de inventario_costos (no es lo mismo que el stock físico). */
  cantidadValorizada: number;
  /** Valor / cantidad valorizada (4 decimales); null si no hay cantidad valorizada. Texto numeric exacto. */
  costoPromedio: string | null;
  /** valor_total de inventario_costos; null si no existe registro de costo. Texto numeric exacto. */
  valorTotal: string | null;
  moneda: string;
  situacionCosto: SituacionCosto;
};

export type ValorizacionTotales = {
  filas: number;
  productos: number;
  depositos: number;
  fisico: number;
  cantidadValorizada: number;
  valorTotal: string;
  costoPromedio: string | null;
  /** Filas (producto × depósito) con stock físico y sin cantidad valorizada, y unidades físicas no valorizadas. */
  filasSinCosto: number;
  fisicoNoValorizado: number;
  moneda: string;
};

export type ValorizacionRespuesta = {
  empresa: { nombre: string; moneda: string };
  generado: string;
  sello: string;
  filtros: ValorizacionFiltros;
  pagina: { numero: number; tamano: number; totalFilas: number };
  filas: ValorizacionFila[];
  totales: ValorizacionTotales;
  catalogos: {
    depositos: { id: string; nombre: string }[];
    categorias: { id: string; nombre: string }[];
    familias: { id: string; nombre: string }[];
  };
  cobertura: string[];
};
