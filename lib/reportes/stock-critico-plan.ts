/**
 * Stock crítico y reposición — reglas PURAS del informe (sin base de datos ni React). El informe NO calcula reposición: toma el resultado de
 * `calcularPlanReposicion` (motor único de Inventario > Reposición) y solo lo enriquece (categoría, marca, familia, costo), filtra, agrupa y totaliza.
 *
 *  · Los filtros se aplican DESPUÉS del motor (el reparto de orígenes compartidos depende del conjunto completo de destinos).
 *  · Los renglones consolidados que son solo referencia no generan alertas, cantidades ni valor (contados aparte).
 *  · Las cantidades se suman únicamente dentro de UN producto (misma unidad). No existe una cantidad total de la empresa.
 *  · El valor es una estimación de referencia (sugerida × costo promedio real de inventario_costos), exacta en decimal; nunca se asume costo 0.
 */
import { dividirDecimales, multiplicarDecimales, redondearDecimal, sumarDecimales } from "@/lib/inventario/decimal";
import type { FilaReposicion } from "@/lib/reposicion/calculo";
import type { CriticidadReporte, StockCriticoFila, StockCriticoFiltros, StockCriticoTotales } from "@/types/reportes";

export type ProductoInfo = {
  categoriaId: string; categoria: string; marcaId: string; familiaId: string; familia: string;
  /** Texto en minúsculas con código, código de inventario, GTIN y descripción (búsqueda). */
  busqueda: string;
};
export type CostoCrudo = { valor: string; cantidad: string };
export type Detalle = StockCriticoFila & { depositoId: string | null };

export const CRITICIDADES: CriticidadReporte[] = ["SIN_STOCK", "BAJO_MINIMO", "EN_PUNTO", "OK", "SIN_GATILLO", "SIN_PARAMETROS"];
const PRIORIDAD: Record<CriticidadReporte, number> = { SIN_STOCK: 0, BAJO_MINIMO: 1, EN_PUNTO: 2, OK: 3, SIN_GATILLO: 4, SIN_PARAMETROS: 5 };
const redondear = (n: number) => Math.round(n * 10000) / 10000;
const fijo = (n: number) => n.toFixed(4);

export const ETIQUETA_CRITICIDAD: Record<CriticidadReporte, string> = {
  SIN_STOCK: "Sin stock", BAJO_MINIMO: "Bajo el mínimo", EN_PUNTO: "En punto de reposición", OK: "Normal", SIN_GATILLO: "Cantidad sin gatillo", SIN_PARAMETROS: "Sin parámetros",
};

/** Costo unitario = valor / cantidad valorizada (4 decimales, decimal exacto); null si no hay cantidad valorizada (nunca 0 inventado). */
export function costoUnitario(c: CostoCrudo | undefined): string | null {
  if (!c) return null;

  return dividirDecimales(c.valor, c.cantidad, 4);
}

/** Costo promedio ponderado de un producto en los depósitos con alcance: Σ valor / Σ cantidad valorizada. */
export function costoDeProducto(costos: CostoCrudo[]): string | null {
  if (costos.length === 0) return null;

  return dividirDecimales(sumarDecimales(costos.map((c) => c.valor)), sumarDecimales(costos.map((c) => c.cantidad)), 4);
}

export type ContextoCritico = {
  productos: Map<string, ProductoInfo>;
  /** clave `${productoId}|${depositoId}` → costo del depósito. */
  costoDeposito: Map<string, CostoCrudo>;
  /** productoId → costo promedio del producto (todos los depósitos con alcance). */
  costoProducto: Map<string, string | null>;
};

/** Convierte las filas del motor en filas del informe (solo planes reales; las referencias se cuentan aparte). */
export function detallesDesdePlan(plan: FilaReposicion[], ctx: ContextoCritico): { filas: Detalle[]; referencias: number } {
  const filas: Detalle[] = [];
  let referencias = 0;

  for (const f of plan) {
    if (f.soloReferencia) { referencias += 1; continue; }

    const info = ctx.productos.get(f.productoId);
    const sugerida = f.necesita ? (f.sugerida ?? 0) : 0;
    const sinMeta = f.necesita && f.sugerida === null ? 1 : 0;
    const costo = (f.depositoId ? costoUnitario(ctx.costoDeposito.get(`${f.productoId}|${f.depositoId}`)) : null) ?? ctx.costoProducto.get(f.productoId) ?? null;
    const bruto = sugerida > 0 && costo ? multiplicarDecimales(costo, fijo(sugerida)) : null;

    filas.push({
      clave: f.clave, productoId: f.productoId, codigo: f.productoCodigo, descripcion: f.productoDescripcion, categoria: info?.categoria ?? "", marca: f.marca, familia: info?.familia ?? "", unidad: f.unidad,
      deposito: f.depositoNombre, ambito: f.ambito, destinos: 1, disponible: f.posicion,
      minimo: f.parametros.minimo, punto: f.parametros.punto, maximo: f.parametros.maximo, cantidadReposicion: f.parametros.cantidadReposicion,
      criticidad: f.criticidad, necesita: f.necesita, sugerida, sinMeta, transferencia: f.sugeridaTransferencia, compra: f.sugeridaCompra ?? 0,
      origenes: f.transferencias.map((t) => `${t.depositoNombre}: ${t.cantidad}`).join("; "), advertencias: f.advertencias,
      costoReferencia: costo, valorReferencia: bruto ? redondearDecimal(bruto, 4) : null, destinosSinCosto: sugerida > 0 && !costo ? 1 : 0, depositoId: f.depositoId,
    });
  }

  return { filas, referencias };
}

export function filtrarDetalles(filas: Detalle[], f: StockCriticoFiltros, productos: Map<string, ProductoInfo>): Detalle[] {
  const q = f.q.trim().toLowerCase();

  return filas.filter((x) => {
    const info = productos.get(x.productoId);

    if (f.situacion === "ALERTAS" ? !x.necesita : f.situacion !== "TODAS" && x.criticidad !== f.situacion) return false;
    // Con un depósito elegido solo cuentan los planes de ESE depósito (el plan consolidado no pertenece a ningún depósito concreto).
    if (f.depositoId && x.depositoId !== f.depositoId) return false;
    if (f.categoriaId && info?.categoriaId !== f.categoriaId) return false;
    if (f.marcaId && info?.marcaId !== f.marcaId) return false;
    if (f.familiaId && info?.familiaId !== f.familiaId) return false;
    if (q && !(info?.busqueda ?? "").includes(q)) return false;

    return true;
  });
}

export function ordenarDetalles(filas: Detalle[]): Detalle[] {
  return [...filas].sort(
    (a, b) => PRIORIDAD[a.criticidad] - PRIORIDAD[b.criticidad] || b.sugerida - a.sugerida || a.descripcion.localeCompare(b.descripcion, "es") || a.deposito.localeCompare(b.deposito, "es") || a.clave.localeCompare(b.clave),
  );
}

/** Vista «Por producto»: consolida SOLO los planes reales ya filtrados del mismo producto (misma unidad); nada se duplica ni se suma entre productos. */
export function agruparPorProducto(filas: Detalle[]): Detalle[] {
  const porProducto = new Map<string, Detalle[]>();

  for (const x of filas) porProducto.set(x.productoId, [...(porProducto.get(x.productoId) ?? []), x]);

  return [...porProducto.values()].map((g) => {
    const primero = g[0];
    const valores = g.map((x) => x.valorReferencia).filter((v): v is string => v !== null);
    const peor = g.reduce((a, x) => (PRIORIDAD[x.criticidad] < PRIORIDAD[a] ? x.criticidad : a), g[0].criticidad);

    return {
      ...primero, clave: primero.productoId, deposito: "", ambito: g.every((x) => x.ambito === "CONSOLIDADO") ? "CONSOLIDADO" : "DEPOSITO", destinos: g.length,
      disponible: redondear(g.reduce((a, x) => a + x.disponible, 0)), minimo: null, punto: null, maximo: null, cantidadReposicion: null,
      criticidad: peor, necesita: g.some((x) => x.necesita), sugerida: redondear(g.reduce((a, x) => a + x.sugerida, 0)), sinMeta: g.reduce((a, x) => a + x.sinMeta, 0),
      transferencia: redondear(g.reduce((a, x) => a + x.transferencia, 0)), compra: redondear(g.reduce((a, x) => a + x.compra, 0)),
      origenes: "", advertencias: [...new Set(g.flatMap((x) => x.advertencias))], costoReferencia: null,
      valorReferencia: valores.length ? sumarDecimales(valores) : null, destinosSinCosto: g.reduce((a, x) => a + x.destinosSinCosto, 0), depositoId: null,
    };
  });
}

/**
 * Totales SIEMPRE sobre los planes por destino ya filtrados (no sobre las filas agrupadas): así tienen el mismo significado en las dos vistas, ningún destino
 * se cuenta dos veces y un producto con varias situaciones se refleja en cada una. `filasVista` es solo el número de filas que muestra la vista elegida.
 */
export function totalesCritico(detalles: Detalle[], filasVista: number, referencias: number, moneda: string): StockCriticoTotales {
  const porCriticidad = Object.fromEntries(CRITICIDADES.map((c) => [c, 0])) as Record<CriticidadReporte, number>;

  for (const x of detalles) porCriticidad[x.criticidad] += 1;

  return {
    filas: filasVista, productos: new Set(detalles.map((x) => x.productoId)).size, destinos: detalles.length, necesitan: detalles.filter((x) => x.necesita).length, porCriticidad,
    sinMeta: detalles.reduce((a, x) => a + x.sinMeta, 0), valorReferencia: sumarDecimales(detalles.map((x) => x.valorReferencia)), sinCosto: detalles.reduce((a, x) => a + x.destinosSinCosto, 0), referencias, moneda,
  };
}

// ── Validación estructural de la respuesta de la API (cliente)
const esObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const txt = (v: unknown): v is string => typeof v === "string";
const entero = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numONulo = (v: unknown): boolean => v === null || num(v);
const decimalTxt = (v: unknown): boolean => txt(v) && /^-?\d+(\.\d+)?$/.test(v);
const lista = (v: unknown, ok: (x: unknown) => boolean): boolean => Array.isArray(v) && v.every(ok);
const idNombre = (d: unknown): boolean => esObj(d) && txt(d.id) && txt(d.nombre);

function filaValida(f: unknown): boolean {
  return esObj(f) && txt(f.clave) && f.clave !== "" && txt(f.productoId) && txt(f.codigo) && txt(f.descripcion) && txt(f.categoria) && txt(f.marca) && txt(f.familia) && txt(f.unidad) && txt(f.deposito) &&
    (f.ambito === "DEPOSITO" || f.ambito === "CONSOLIDADO") && entero(f.destinos) && num(f.disponible) && numONulo(f.minimo) && numONulo(f.punto) && numONulo(f.maximo) && numONulo(f.cantidadReposicion) &&
    txt(f.criticidad) && (CRITICIDADES as string[]).includes(f.criticidad) && typeof f.necesita === "boolean" && num(f.sugerida) && entero(f.sinMeta) && num(f.transferencia) && num(f.compra) && txt(f.origenes) &&
    lista(f.advertencias, txt) && (f.costoReferencia === null || decimalTxt(f.costoReferencia)) && (f.valorReferencia === null || decimalTxt(f.valorReferencia)) && entero(f.destinosSinCosto);
}

export function respuestaStockCriticoValida(x: unknown): boolean {
  if (!esObj(x)) return false;

  const t = x.totales, p = x.pagina, c = x.catalogos, e = x.empresa, perm = x.permisos, f = x.filtros;

  return esObj(e) && txt(e.nombre) && txt(e.moneda) && txt(x.generado) && txt(x.sello) && esObj(f) && txt(f.vista) && esObj(p) && entero(p.numero) && entero(p.tamano) && entero(p.totalFilas) &&
    lista(x.filas, filaValida) && lista(x.cobertura, txt) &&
    esObj(t) && entero(t.filas) && entero(t.productos) && entero(t.destinos) && entero(t.necesitan) && entero(t.sinMeta) && decimalTxt(t.valorReferencia) && entero(t.sinCosto) && entero(t.referencias) && txt(t.moneda) &&
    esObj(t.porCriticidad) && CRITICIDADES.every((k) => entero((t.porCriticidad as Record<string, unknown>)[k])) &&
    esObj(c) && lista(c.depositos, idNombre) && lista(c.categorias, idNombre) && lista(c.marcas, idNombre) && lista(c.familias, idNombre) &&
    esObj(perm) && typeof perm.exportar === "boolean";
}
