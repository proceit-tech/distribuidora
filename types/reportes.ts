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

// ---- Reporte 3: Kardex de movimientos ----
export type VistaKardex = "DETALLE" | "RESUMEN";
export type KardexFiltros = {
  vista: VistaKardex;
  q: string;
  depositoId: string;
  tipo: string;
  usuarioId: string;
  documento: string;
  /** Estado del movimiento (REGISTRADO / ANULADO). */
  estado: "" | "REGISTRADO" | "ANULADO";
  /** Solo filas que cambian este estado de stock. */
  estadoStock: "" | "DISPONIBLE" | "RESERVADO" | "CUARENTENA";
  lote: string;
  /** Período por FECHA DE REGISTRO del movimiento (momento en que cambió el saldo), YYYY-MM-DD. */
  desde: string;
  hasta: string;
};

export type KardexSaldos = { disponible: number; reservado: number; cuarentena: number; fisico: number };

export type KardexFila = {
  clave: string;
  numero: string;
  fechaRegistro: string;
  horaRegistro: string;
  fechaMovimiento: string;
  /** La fecha del movimiento es distinta de la fecha de registro (movimiento retroactivo). */
  retroactivo: boolean;
  tipo: string;
  origen: string;
  estado: string;
  documento: string;
  motivo: string;
  observacion: string;
  usuario: string;
  productoCodigo: string;
  productoDescripcion: string;
  deposito: string;
  /** Otro depósito de la transferencia ("" si no aplica). */
  contraparte: string;
  lote: string;
  propiedad: string;
  /** ENTRADA/SALIDA = cambio de cantidad física; ESTADO = reserva/cuarentena (el físico no cambia). */
  efecto: "ENTRADA" | "SALIDA" | "ESTADO";
  entrada: number;
  salida: number;
  dDisponible: number;
  dReservado: number;
  dCuarentena: number;
  saldoDisponible: number;
  saldoReservado: number;
  saldoCuarentena: number;
  saldoFisico: number;
  costoUnitario: string | null;
  costoTotal: string | null;
  moneda: string;
  /** Número del movimiento vinculado: el que anula a este, o el anulado por este. */
  vinculado: string;
  vinculoTipo: "" | "ANULADO_POR" | "ANULA_A";
};

export type KardexResumenFila = {
  clave: string;
  productoCodigo: string;
  productoDescripcion: string;
  deposito: string;
  lote: string;
  propiedad: string;
  saldoInicial: number;
  /** Movimientos que cumplen los filtros de fila (sin filtros de fila: todos los del período). */
  entradas: number;
  salidas: number;
  transfEntradas: number;
  transfSalidas: number;
  /** Variación neta física de los movimientos del período que quedan FUERA de los filtros de fila (0 sin filtros). */
  fueraDelFiltro: number;
  saldoFinal: number;
  finalDisponible: number;
  finalReservado: number;
  finalCuarentena: number;
};

/** Cantidades físicas de un conjunto de movimientos (transferencias aparte; se compensan en el consolidado). */
export type KardexMovimientos = {
  /** Entradas/salidas físicas SIN transferencias (incluyen reversiones por anulación). */
  entradas: number;
  salidas: number;
  transfEntradas: number;
  transfSalidas: number;
  cambiosEstado: number;
  anulaciones: number;
};

export type KardexResumenTotales = {
  filas: number;
  saldoInicial: number;
  entradas: number;
  salidas: number;
  transfEntradas: number;
  transfSalidas: number;
  fueraDelFiltro: number;
  saldoFinal: number;
  finalDisponible: number;
  finalReservado: number;
  finalCuarentena: number;
};

export type KardexTotales = {
  /** Filas que cumplen todos los filtros (movimientos del DETALLE). */
  filas: number;
  /** Hay filtros de tipo/usuario/documento/estado/estado de stock (filtros de fila). */
  filtrosDeFila: boolean;
  /** Saldos REALES del libro (todos los movimientos anteriores al período / hasta el fin del período), sin filtros de fila. */
  saldoInicial: KardexSaldos;
  saldoFinal: KardexSaldos;
  /** Movimientos del período que cumplen los filtros de fila: lo que muestran las filas. NO explican por sí solos la variación del saldo. */
  filtrado: KardexMovimientos;
  /** Movimientos del período que NO cumplen los filtros de fila (todo en cero si no hay filtros de fila). */
  fueraDelFiltro: KardexMovimientos;
  /** Conciliación completa: TODOS los movimientos del período, sin filtros de fila. */
  completo: KardexMovimientos;
  /** saldoInicial.fisico + completo(entradas − salidas + transf.) === saldoFinal.fisico, y filtrado + fuera del filtro = completo. Independiente de los filtros de fila. */
  cuadra: boolean;
  /** Solo vista RESUMEN: suma de las filas mostradas (mismo criterio que las filas). */
  resumen: KardexResumenTotales | null;
};

export type KardexConciliacion = {
  /** Combinaciones producto × depósito × lote × propiedad comparadas contra stock_saldos (hoy). */
  combinaciones: number;
  divergentes: number;
  conciliado: boolean;
};

export type KardexRespuesta = {
  empresa: { nombre: string; moneda: string };
  generado: string;
  sello: string;
  filtros: KardexFiltros;
  pagina: { numero: number; tamano: number; totalFilas: number };
  filas: KardexFila[];
  resumen: KardexResumenFila[];
  totales: KardexTotales;
  conciliacion: KardexConciliacion;
  catalogos: {
    depositos: { id: string; nombre: string }[];
    usuarios: { id: string; nombre: string }[];
    tipos: { id: string; nombre: string }[];
  };
  cobertura: string[];
};

// Reporte 4 — Stock crítico y reposición
export type VistaStockCritico = "PRODUCTO" | "DEPOSITO";
export type ObjetivoReposicion = "MINIMO" | "MAXIMO";

export type StockCriticoFiltros = {
  vista: VistaStockCritico;
  q: string;
  depositoId: string;
  categoriaId: string;
  marcaId: string;
  familiaId: string;
  situacion: "" | NivelStock;
  objetivo: ObjetivoReposicion;
};

export type StockCriticoFila = {
  productoId: string;
  codigo: string;
  descripcion: string;
  categoria: string;
  marca: string;
  familia: string;
  unidad: string;
  // Vista DEPOSITO: depósito de la fila. Vista PRODUCTO: vacío.
  deposito: string;
  // Disponible propio del depósito de la fila (vista DEPOSITO) o del depósito filtrado (vista PRODUCTO con filtro); null si no aplica.
  disponibleDeposito: number | null;
  // Valores del PRODUCTO sobre todos los depósitos con alcance del usuario (base de la situación y de la reposición).
  disponible: number;
  fisico: number;
  minimo: number;
  maximo: number | null;
  puntoReposicion: number | null;
  nivel: NivelStock;
  enPuntoReposicion: boolean;
  cantidadSugerida: number;
  // numeric exacto como texto; null si el producto no tiene costo registrado.
  costoReferencia: string | null;
  valorSugerido: string | null;
};

export type StockCriticoTotales = {
  productos: number;
  sinStock: number;
  bajo: number;
  normal: number;
  sobrestock: number;
  enPuntoReposicion: number;
  aReponer: number;
  cantidadSugerida: number;
  valorSugerido: string;
  sugeridoSinCosto: number;
  moneda: string;
};

export type StockCriticoRespuesta = {
  empresa: { nombre: string; moneda: string };
  generado: string;
  sello: string;
  filtros: StockCriticoFiltros;
  pagina: { numero: number; tamano: number; totalFilas: number };
  filas: StockCriticoFila[];
  totales: StockCriticoTotales;
  catalogos: {
    depositos: { id: string; nombre: string }[];
    categorias: { id: string; nombre: string }[];
    marcas: { id: string; nombre: string }[];
    familias: { id: string; nombre: string }[];
  };
  cobertura: string[];
};

// Reporte 5 — Lotes y vencimientos
export type ClaseVencimiento = "VENCIDO" | "PROXIMO" | "VIGENTE" | "SIN_FECHA";
export type VistaLotes = "LOTE" | "DEPOSITO";

export type LotesFiltros = {
  vista: VistaLotes;
  q: string;
  lote: string;
  depositoId: string;
  categoriaId: string;
  marcaId: string;
  familiaId: string;
  clase: "" | ClaseVencimiento;
  existencia: "CON" | "SIN" | "TODOS";
  horizonte: number;
  vencDesde: string;
  vencHasta: string;
};

export type LotesFila = {
  productoId: string;
  loteId: string;
  codigo: string;
  descripcion: string;
  categoria: string;
  marca: string;
  familia: string;
  unidad: string;
  lote: string;
  // Vista DEPOSITO: depósito de la fila. Vista LOTE: vacío y `depositos` = cuántos depósitos del alcance tienen saldo del lote.
  deposito: string;
  depositos: number;
  vencimiento: string;
  diasRestantes: number | null;
  clase: ClaseVencimiento;
  // Stock PROPIO (nunca incluye terceros)
  disponible: number;
  reservado: number;
  cuarentena: number;
  fisico: number;
  // Stock de TERCEROS en columnas aparte
  terceros: number;
  tercerosEstados: { disponible: number; reservado: number; cuarentena: number; transito: number };
};

export type LotesTotalClase = { clase: ClaseVencimiento; lotes: number; fisico: number; terceros: number };

export type LotesTotales = {
  lotes: number;
  filas: number;
  clases: LotesTotalClase[];
  disponible: number;
  reservado: number;
  cuarentena: number;
  fisico: number;
  terceros: number;
  tercerosPorEstado: { disponible: number; reservado: number; cuarentena: number; transito: number };
  hoy: string;
};

export type LotesRespuesta = {
  empresa: { nombre: string; moneda: string };
  generado: string;
  sello: string;
  filtros: LotesFiltros;
  pagina: { numero: number; tamano: number; totalFilas: number };
  filas: LotesFila[];
  totales: LotesTotales;
  catalogos: {
    depositos: { id: string; nombre: string }[];
    categorias: { id: string; nombre: string }[];
    marcas: { id: string; nombre: string }[];
    familias: { id: string; nombre: string }[];
  };
  cobertura: string[];
};
