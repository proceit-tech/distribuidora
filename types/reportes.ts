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
  /** true = depósito inactivo del alcance del usuario (se informa; solo vista DETALLE). */
  depositoInactivo: boolean;
  lote: string;
  fechaVencimiento: string;
  propiedad: "" | "PROPIO" | "TERCERO" | "AMBOS";
  /** Vista DETALLE: el producto no tiene saldo desglosable por depósito/lote en el alcance filtrado (se muestra una sola fila honesta, sin inventar depósito ni lote). */
  sinSaldo: boolean;
  // Cantidades EXACTAS como texto numeric (nunca float). Disponible…Virtual = stock PROPIO.
  disponible: string;
  reservado: string;
  cuarentena: string;
  transito: string;
  fisico: string;
  virtual: string;
  // Stock de terceros (todos los estados), SIEMPRE separado de las cantidades propias. Igual significado en las dos vistas.
  terceros: string;
  tercerosEstados: { disponible: string; reservado: string; cuarentena: string; transito: string };
  nivel: NivelStock;
};

/** Totales cuantitativos POR UNIDAD de medida (kg, unidades, litros… no se suman entre sí). */
export type StockGeneralUnidad = {
  unidad: string;
  productos: number;
  disponible: string;
  reservado: string;
  cuarentena: string;
  transito: string;
  fisico: string;
  virtual: string;
  terceros: string;
};

export type StockGeneralTotales = {
  /** Productos del filtro (en las dos vistas). */
  productos: number;
  /** Productos sin ningún saldo (propio ni de terceros) en el alcance filtrado: en la vista DETALLE salen como una fila «sin saldo». */
  sinSaldo: number;
  sinStock: number;
  bajo: number;
  sobrestock: number;
  /** Las cantidades solo se suman dentro de una misma unidad: no existe una cantidad total sin unidad. */
  porUnidad: StockGeneralUnidad[];
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
    depositos: { id: string; nombre: string; activo: boolean }[];
    categorias: { id: string; nombre: string }[];
    marcas: { id: string; nombre: string }[];
    familias: { id: string; nombre: string }[];
  };
  cobertura: string[];
};

export type StockGeneralRespuestaApi = StockGeneralRespuesta & { permisos: { exportar: boolean } };

// ---- Reporte 2: Valorización de inventario ----
export type VistaValorizacion = "DETALLE" | "PRODUCTO" | "DEPOSITO" | "CATEGORIA";
/**
 * Cobertura de costo, clasificada por producto × depósito ANTES de agrupar (nunca sobre sumas netas):
 * CON_COSTO: valorizada = física; PARCIAL: 0 < valorizada < física; SIN_COSTO: física > 0 y sin cantidad valorizada; EXCEDENTE: valorizada > física;
 * RESIDUO: valor sin cantidad valorizada; SIN_STOCK: sin cantidades ni valor. En filas agrupadas se muestra la peor situación y los conteos exactos.
 */
export type SituacionCosto = "CON_COSTO" | "PARCIAL" | "SIN_COSTO" | "EXCEDENTE" | "RESIDUO" | "SIN_STOCK";
export type ConteoSituaciones = Record<SituacionCosto, number>;

export type ValorizacionFiltros = {
  vista: VistaValorizacion;
  q: string;
  depositoId: string;
  categoriaId: string;
  familiaId: string;
  existencia: "TODOS" | "CON" | "SIN";
  costo: "TODOS" | "CON" | "SIN";
  /** DIVERGENCIAS = cualquier situación distinta de CON_COSTO / SIN_STOCK. */
  cobertura: "TODOS" | "DIVERGENCIAS" | "PARCIAL" | "SIN_COSTO" | "EXCEDENTE" | "RESIDUO";
};

export type ValorizacionFila = {
  clave: string;
  codigo: string;
  descripcion: string;
  categoria: string;
  familia: string;
  deposito: string;
  /** true = depósito inactivo (se informa: su valor residual forma parte del total). Solo vistas DETALLE y DEPOSITO. */
  depositoInactivo: boolean;
  /** Unidad de medida del producto (solo DETALLE y PRODUCTO: en agrupaciones heterogéneas no existe una unidad común). */
  unidad: string;
  /** Cantidad de productos / depósitos que agrupa la fila (1 en la vista DETALLE). */
  productos: number;
  depositos: number;
  /**
   * Cantidades exactas (texto numeric). Solo DETALLE y PRODUCTO (un único producto → una única unidad); null = NO APLICABLE en DEPOSITO y CATEGORIA,
   * donde sumar cantidades de unidades distintas no tiene sentido.
   */
  fisico: string | null;
  cantidadValorizada: string | null;
  /** Magnitudes sin compensar (suma de la parte positiva por depósito): física sin valorizar y valorizada que excede la física. Solo DETALLE y PRODUCTO. */
  sinValorizar: string | null;
  excedente: string | null;
  /** Valor / cantidad valorizada (4 decimales) del mismo producto; null = no aplicable (agrupaciones heterogéneas) o sin cantidad valorizada. */
  costoPromedio: string | null;
  /** Suma de valor_total (dinero exacto, misma moneda base); null si no existe registro de costo (detalle). */
  valorTotal: string | null;
  moneda: string;
  /** Peor situación entre los pares producto × depósito que agrupa la fila. */
  situacionCosto: SituacionCosto;
  /** Conteo EXACTO de pares producto × depósito por situación (nada se compensa entre pares). */
  conteos: ConteoSituaciones;
};

export type ValorizacionTotales = {
  /** Pares producto × depósito dentro del filtro. */
  filas: number;
  productos: number;
  depositos: number;
  productosConCosto: number;
  /** Dinero exacto (texto numeric) en moneda base. */
  valorTotal: string;
  /** Conteo y dinero por situación de cobertura, sin compensar. */
  conteos: ConteoSituaciones;
  valorPorSituacion: Record<SituacionCosto, string>;
  /** Depósitos inactivos incluidos con existencia o valor: cantidad de pares y valor (RPT-V06). */
  inactivos: { filas: number; valor: string };
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
    depositos: { id: string; nombre: string; activo: boolean }[];
    categorias: { id: string; nombre: string }[];
    familias: { id: string; nombre: string }[];
  };
  cobertura: string[];
};

/** Respuesta de la API: agrega lo que la pantalla necesita para mostrar u ocultar la exportación (el servidor vuelve a exigir REPORTES.EXPORTAR). */
export type ValorizacionRespuestaApi = ValorizacionRespuesta & { permisos: { exportar: boolean } };

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

export type PropiedadKardex = "PROPIO" | "TERCERO";

/** Todas las cantidades del Kardex son texto `numeric` exacto de PostgreSQL (nunca float). */
export type KardexSaldos = { disponible: string; reservado: string; cuarentena: string; fisico: string };

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
  /** Unidad de medida del producto: las cantidades de unidades distintas nunca se suman. */
  unidad: string;
  deposito: string;
  depositoInactivo: boolean;
  /** Otro depósito de la transferencia: solo su nombre si está en el alcance del usuario; si no, «Otro depósito (sin acceso)». "" si no aplica. */
  contraparte: string;
  lote: string;
  propiedad: PropiedadKardex;
  /** "" para stock propio; para terceros, el propietario identificado (o «propietario no registrado»). */
  propietario: string;
  /** ENTRADA/SALIDA = cambio de cantidad física; ESTADO = reserva/cuarentena (el físico no cambia). */
  efecto: "ENTRADA" | "SALIDA" | "ESTADO";
  entrada: string;
  salida: string;
  dDisponible: string;
  dReservado: string;
  dCuarentena: string;
  saldoDisponible: string;
  saldoReservado: string;
  saldoCuarentena: string;
  saldoFisico: string;
  /** Costo REGISTRADO en la línea del movimiento (null = no existe; nunca el costo promedio actual). Solo stock propio; en transferencias solo en la fila de salida. */
  costoUnitario: string | null;
  costoTotal: string | null;
  /** Moneda del costo de la línea ("" si no hay costo). */
  moneda: string;
  /** Número del movimiento vinculado: el que anula a este, o el anulado por este. */
  vinculado: string;
  vinculoTipo: "" | "ANULADO_POR" | "ANULA_A";
};

export type KardexResumenFila = {
  clave: string;
  productoCodigo: string;
  productoDescripcion: string;
  unidad: string;
  deposito: string;
  depositoInactivo: boolean;
  lote: string;
  propiedad: PropiedadKardex;
  propietario: string;
  saldoInicial: string;
  /** Movimientos que cumplen los filtros de fila (sin filtros de fila: todos los del período). */
  entradas: string;
  salidas: string;
  transfEntradas: string;
  transfSalidas: string;
  /** Variación neta física de los movimientos del período que quedan FUERA de los filtros de fila (0 sin filtros). */
  fueraDelFiltro: string;
  saldoFinal: string;
  finalDisponible: string;
  finalReservado: string;
  finalCuarentena: string;
};

/** Cantidades físicas de un conjunto de movimientos (transferencias aparte; se compensan en el consolidado). */
export type KardexMovimientos = {
  /** Entradas/salidas físicas SIN transferencias (incluyen reversiones por anulación). */
  entradas: string;
  salidas: string;
  transfEntradas: string;
  transfSalidas: string;
  cambiosEstado: number;
  anulaciones: number;
};

export type KardexResumenTotales = {
  filas: number;
  saldoInicial: string;
  entradas: string;
  salidas: string;
  transfEntradas: string;
  transfSalidas: string;
  fueraDelFiltro: string;
  saldoFinal: string;
  finalDisponible: string;
  finalReservado: string;
  finalCuarentena: string;
};

/** Totales de UN grupo homogéneo: unidad de medida × propiedad × propietario. Nunca se mezclan grupos distintos. */
export type KardexGrupo = {
  clave: string;
  unidad: string;
  propiedad: PropiedadKardex;
  propietario: string;
  /** Movimientos (filas) del grupo que cumplen todos los filtros. */
  filas: number;
  /** Saldos REALES del libro (todos los movimientos anteriores al período / hasta el fin del período), sin filtros de fila. */
  saldoInicial: KardexSaldos;
  saldoFinal: KardexSaldos;
  /** Movimientos del período que cumplen los filtros de fila: lo que muestran las filas. NO explican por sí solos la variación del saldo. */
  filtrado: KardexMovimientos;
  /** Movimientos del período que NO cumplen los filtros de fila (todo en cero si no hay filtros de fila). */
  fueraDelFiltro: KardexMovimientos;
  /** Conciliación completa: TODOS los movimientos del período, sin filtros de fila. */
  completo: KardexMovimientos;
  /** saldoInicial.fisico + completo(entradas − salidas + transf.) === saldoFinal.fisico (exacto), y filtrado + fuera del filtro = completo. */
  cuadra: boolean;
  /** Solo vista RESUMEN: suma de las filas mostradas del grupo (mismo criterio que las filas). */
  resumen: KardexResumenTotales | null;
};

export type KardexTotales = {
  /** Filas que cumplen todos los filtros (movimientos del DETALLE). */
  filas: number;
  /** Hay filtros de tipo/usuario/documento/estado/estado de stock (filtros de fila). */
  filtrosDeFila: boolean;
  /** Un grupo por unidad × propiedad × propietario. Con más de un grupo no existe un total general de cantidades (n/a). */
  grupos: KardexGrupo[];
  /** Todos los grupos cuadran exactamente. */
  cuadra: boolean;
};

export type KardexConciliacion = {
  /** Combinaciones producto × depósito × lote × propiedad × propietario comparadas contra stock_saldos (hoy, misma fotografía). */
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
    depositos: { id: string; nombre: string; activo: boolean }[];
    usuarios: { id: string; nombre: string }[];
    tipos: { id: string; nombre: string }[];
  };
  /** Origen de la unidad de cada movimiento: HISTORIAL (vigente al registrarse, NEX-052 aplicada) o CATALOGO (NEX-052 ausente: no hay cambios de unidad posibles). */
  fuenteUnidad: "HISTORIAL" | "CATALOGO";
  cobertura: string[];
};

/** Respuesta de la API: agrega lo que la pantalla necesita para mostrar u ocultar la exportación (el servidor vuelve a exigir REPORTES.EXPORTAR). */
export type KardexRespuestaApi = KardexRespuesta & { permisos: { exportar: boolean } };

// Reporte 4 — Stock crítico y reposición: fotografía de las excepciones del MOTOR ÚNICO de Reposición (calcularPlanReposicion); no calcula ni planifica por su cuenta.
export type VistaStockCritico = "PRODUCTO" | "DEPOSITO";
export type CriticidadReporte = "SIN_STOCK" | "BAJO_MINIMO" | "EN_PUNTO" | "OK" | "SIN_GATILLO" | "SIN_PARAMETROS";
export type SituacionStockCritico = "ALERTAS" | "TODAS" | "SIN_STOCK" | "BAJO_MINIMO" | "EN_PUNTO" | "SOBRESTOCK" | "OK" | "SIN_GATILLO";

export type StockCriticoFiltros = {
  vista: VistaStockCritico;
  q: string;
  depositoId: string;
  categoriaId: string;
  marcaId: string;
  familiaId: string;
  /** ALERTAS = lo que necesita reposición (sin stock, bajo el mínimo, en punto) o está en sobrestock; SOBRESTOCK aísla el exceso; TODAS incluye lo que está bien y los avisos de configuración. */
  situacion: SituacionStockCritico;
};

export type StockCriticoFila = {
  clave: string;
  productoId: string;
  codigo: string;
  descripcion: string;
  categoria: string;
  marca: string;
  familia: string;
  unidad: string;
  /** Depósito destino (vista DEPOSITO); «Todos los depósitos» si el plan usa los parámetros globales del producto; vacío en la vista PRODUCTO. */
  deposito: string;
  ambito: "DEPOSITO" | "CONSOLIDADO";
  /** Depósitos con plan que agrupa la fila (1 en la vista DEPOSITO). */
  destinos: number;
  /** Disponible propio (posición del motor; en PRODUCTO, suma de los destinos del MISMO producto). */
  disponible: number;
  /** Físico propio = disponible + reservado + cuarentena (sin tránsito ni terceros), el mismo de Stock; base del sobrestock. En PRODUCTO, suma de los destinos del mismo producto. */
  fisico: number;
  minimo: number | null;
  punto: number | null;
  maximo: number | null;
  cantidadReposicion: number | null;
  /** Peor criticidad entre los destinos de la fila. */
  criticidad: CriticidadReporte;
  necesita: boolean;
  /** Sobrestock = máximo > 0 y físico propio > máximo del MISMO ámbito (depósito con parámetros propios, o plan consolidado real). Aviso informativo: no genera compra ni transferencia ni modifica el plan. */
  sobrestock: boolean;
  /** Físico − máximo cuando hay sobrestock (suma de los destinos con exceso en PRODUCTO); 0 si no. */
  exceso: number;
  /** Suma de metas DEFINIDAS del mismo producto/unidad; los destinos con necesidad y sin meta se cuentan en sinMeta (nunca como 0 ni inventados). */
  sugerida: number;
  sinMeta: number;
  transferencia: number;
  compra: number;
  origenes: string;
  advertencias: string[];
  /** Costo promedio real de inventario_costos (depósito destino; si no hay, el del producto); null = sin costo registrado (no se asume 0). */
  costoReferencia: string | null;
  /** sugerida × costo de referencia: estimación de referencia, no valorización del inventario ni precio de compra. null si no hay necesidad con meta o falta costo. */
  valorReferencia: string | null;
  destinosSinCosto: number;
};

export type StockCriticoTotales = {
  filas: number;
  productos: number;
  destinos: number;
  necesitan: number;
  /** Destinos en sobrestock (exceso informativo, independiente de la criticidad del motor). */
  sobrestock: number;
  porCriticidad: Record<CriticidadReporte, number>;
  sinMeta: number;
  valorReferencia: string;
  sinCosto: number;
  /** Renglones consolidados de referencia que corresponden a los PRODUCTOS del recorte filtrado (sin depósito concreto): no generan alertas ni valor. */
  referencias: number;
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

export type StockCriticoRespuestaApi = StockCriticoRespuesta & { permisos: { exportar: boolean } };

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
