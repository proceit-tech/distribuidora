/**
 * Stock general — reglas PURAS (sin base de datos ni React). El informe es CUANTITATIVO: físico propio = disponible + reservado + cuarentena; virtual = físico + tránsito;
 * terceros siempre aparte. Cantidades como texto numeric exacto (BigInt), nunca float. La situación (sin stock / bajo / normal / sobrestock) usa la MISMA regla que
 * Inventario > Stock (`clasificarNivel` de lib/stock/vista.ts) con los mismos parámetros: los del producto en la visión consolidada y los de
 * `producto_deposito_configuracion` del depósito elegido (cero si no hay) cuando se filtra por depósito. No es política de reposición.
 */
import { compararDecimales, sumarDecimales } from "@/lib/inventario/decimal";
import type { NivelStock, StockGeneralFila, StockGeneralFiltros, StockGeneralTotales, StockGeneralUnidad } from "@/types/reportes";

export type ProductoAgregado = {
  id: string; codigo: string; ci: string; gtin: string; descripcion: string; categoria: string; marca: string; familia: string; linea: string; unidad: string;
  minimo: string; maximo: string;
  disponible: string; reservado: string; cuarentena: string; transito: string;
  t_disponible: string; t_reservado: string; t_cuarentena: string; t_transito: string;
};

const positivo = (v: string) => compararDecimales(v, "0") > 0;

/** Misma regla que clasificarNivel (Inventario > Stock), con decimales exactos. */
export function nivelStockTexto(p: { disponible: string; fisico: string; minimo: string; maximo: string }): NivelStock {
  if (compararDecimales(p.disponible, "0") <= 0) return "SIN_STOCK";
  if (positivo(p.minimo) && compararDecimales(p.disponible, p.minimo) < 0) return "BAJO";
  if (positivo(p.maximo) && compararDecimales(p.fisico, p.maximo) > 0) return "SOBRESTOCK";

  return "NORMAL";
}

export type ProductoCalculado = ProductoAgregado & { fisico: string; virtual: string; terceros: string; nivel: NivelStock; sinSaldo: boolean };

export function calcularProducto(p: ProductoAgregado): ProductoCalculado {
  const fisico = sumarDecimales([p.disponible, p.reservado, p.cuarentena]);
  const terceros = sumarDecimales([p.t_disponible, p.t_reservado, p.t_cuarentena, p.t_transito]);
  const virtual = sumarDecimales([fisico, p.transito]);

  return { ...p, fisico, virtual, terceros, nivel: nivelStockTexto({ disponible: p.disponible, fisico, minimo: p.minimo, maximo: p.maximo }), sinSaldo: !positivo(virtual) && !positivo(terceros) };
}

/**
 * Filtros posteriores a la agregación. «Existencia» considera TODO el saldo del alcance: propio (físico + tránsito) y de terceros.
 * CON = hay algo propio o de terceros; SIN = no hay nada propio ni de terceros.
 */
export function filtrarProductos(productos: ProductoCalculado[], f: Pick<StockGeneralFiltros, "situacion" | "existencia">): ProductoCalculado[] {
  return productos.filter((p) => {
    if (f.situacion && p.nivel !== f.situacion) return false;
    if (f.existencia === "CON" && p.sinSaldo) return false;
    if (f.existencia === "SIN" && !p.sinSaldo) return false;

    return true;
  });
}

export function totalesStockGeneral(productos: ProductoCalculado[]): StockGeneralTotales {
  const porUnidad = new Map<string, ProductoCalculado[]>();

  for (const p of productos) porUnidad.set(p.unidad, [...(porUnidad.get(p.unidad) ?? []), p]);

  const unidades: StockGeneralUnidad[] = [...porUnidad.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "es"))
    .map(([unidad, l]) => ({
      unidad, productos: l.length, disponible: sumarDecimales(l.map((x) => x.disponible)), reservado: sumarDecimales(l.map((x) => x.reservado)), cuarentena: sumarDecimales(l.map((x) => x.cuarentena)),
      transito: sumarDecimales(l.map((x) => x.transito)), fisico: sumarDecimales(l.map((x) => x.fisico)), virtual: sumarDecimales(l.map((x) => x.virtual)), terceros: sumarDecimales(l.map((x) => x.terceros)),
    }));

  return {
    productos: productos.length, sinSaldo: productos.filter((p) => p.sinSaldo).length, sinStock: productos.filter((p) => p.nivel === "SIN_STOCK").length,
    bajo: productos.filter((p) => p.nivel === "BAJO").length, sobrestock: productos.filter((p) => p.nivel === "SOBRESTOCK").length, porUnidad: unidades,
  };
}

export const filaDeProducto = (p: ProductoCalculado): StockGeneralFila => ({
  productoId: p.id, codigo: p.codigo, codigoInventario: p.ci, codigoBarras: p.gtin, descripcion: p.descripcion, categoria: p.categoria, marca: p.marca, familia: p.familia, linea: p.linea, unidad: p.unidad,
  deposito: "", depositoInactivo: false, lote: "", fechaVencimiento: "", propiedad: "", sinSaldo: false,
  disponible: p.disponible, reservado: p.reservado, cuarentena: p.cuarentena, transito: p.transito, fisico: p.fisico, virtual: p.virtual, terceros: p.terceros,
  tercerosEstados: { disponible: p.t_disponible, reservado: p.t_reservado, cuarentena: p.t_cuarentena, transito: p.t_transito }, nivel: p.nivel,
});

/** Fila de la vista DETALLE a partir de un registro producto × depósito × lote (textos numeric) o, si no hay saldo, de la fila honesta «sin saldo». */
export function filaDetalle(p: ProductoCalculado, d: Record<string, unknown> | null): StockGeneralFila {
  if (!d) return { ...filaDeProducto(p), sinSaldo: true, disponible: "0", reservado: "0", cuarentena: "0", transito: "0", fisico: "0", virtual: "0", terceros: "0", tercerosEstados: { disponible: "0", reservado: "0", cuarentena: "0", transito: "0" } };

  const t = { disponible: String(d.t_disponible), reservado: String(d.t_reservado), cuarentena: String(d.t_cuarentena), transito: String(d.t_transito) };
  const propios = { disponible: String(d.disponible), reservado: String(d.reservado), cuarentena: String(d.cuarentena), transito: String(d.transito) };
  const fisico = sumarDecimales([propios.disponible, propios.reservado, propios.cuarentena]);
  const virtual = sumarDecimales([fisico, propios.transito]);
  const terceros = sumarDecimales(Object.values(t));
  const tienePropio = positivo(virtual);

  return {
    ...filaDeProducto(p), deposito: String(d.deposito), depositoInactivo: d.inactivo === true, lote: String(d.lote ?? ""), fechaVencimiento: String(d.venc ?? ""), sinSaldo: false,
    ...propios, fisico, virtual, terceros, tercerosEstados: t, propiedad: tienePropio ? (positivo(terceros) ? "AMBOS" : "PROPIO") : "TERCERO",
  };
}

// ── Filtros y validación de la respuesta (cliente)
export function filtrosStockGeneralIguales(a: StockGeneralFiltros, b: StockGeneralFiltros): boolean {
  return a.vista === b.vista && a.q === b.q && a.depositoId === b.depositoId && a.categoriaId === b.categoriaId && a.marcaId === b.marcaId && a.familiaId === b.familiaId && a.situacion === b.situacion && a.lote === b.lote && a.existencia === b.existencia;
}

export function respuestaStockGeneralVigente(datos: { filtros: StockGeneralFiltros; pagina: { numero: number } } | null, error: string, aplicados: StockGeneralFiltros, pagina: number): boolean {
  return datos !== null && !error && filtrosStockGeneralIguales(datos.filtros, aplicados) && datos.pagina.numero === pagina;
}

const esObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const txt = (v: unknown): v is string => typeof v === "string";
const entero = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const dec = (v: unknown): boolean => txt(v) && /^-?\d+(\.\d+)?$/.test(v);
const lista = (v: unknown, ok: (x: unknown) => boolean): boolean => Array.isArray(v) && v.every(ok);
const idNombre = (d: unknown): boolean => esObj(d) && txt(d.id) && txt(d.nombre);
const NIVELES = ["SIN_STOCK", "BAJO", "NORMAL", "SOBRESTOCK"];

function filaValida(f: unknown): boolean {
  return esObj(f) && txt(f.productoId) && f.productoId !== "" && txt(f.codigo) && txt(f.codigoInventario) && txt(f.codigoBarras) && txt(f.descripcion) && txt(f.categoria) && txt(f.marca) && txt(f.familia) && txt(f.linea) && txt(f.unidad) &&
    txt(f.deposito) && typeof f.depositoInactivo === "boolean" && txt(f.lote) && txt(f.fechaVencimiento) && txt(f.propiedad) && ["", "PROPIO", "TERCERO", "AMBOS"].includes(f.propiedad) && typeof f.sinSaldo === "boolean" &&
    ["disponible", "reservado", "cuarentena", "transito", "fisico", "virtual", "terceros"].every((k) => dec(f[k])) &&
    esObj(f.tercerosEstados) && ["disponible", "reservado", "cuarentena", "transito"].every((k) => dec((f.tercerosEstados as Record<string, unknown>)[k])) && txt(f.nivel) && NIVELES.includes(f.nivel);
}

function unidadValida(u: unknown): boolean {
  return esObj(u) && txt(u.unidad) && entero(u.productos) && ["disponible", "reservado", "cuarentena", "transito", "fisico", "virtual", "terceros"].every((k) => dec(u[k]));
}

/** Validación estructural de la respuesta de la API antes de pintarla o habilitar la exportación: una respuesta incompleta o con cantidades no numéricas se rechaza completa. */
export function respuestaStockGeneralValida(x: unknown): boolean {
  if (!esObj(x)) return false;

  const t = x.totales, p = x.pagina, c = x.catalogos, e = x.empresa, perm = x.permisos, f = x.filtros;

  return esObj(e) && txt(e.nombre) && txt(e.moneda) && txt(x.generado) && txt(x.sello) && esObj(f) && txt(f.vista) && esObj(p) && entero(p.numero) && entero(p.tamano) && entero(p.totalFilas) &&
    lista(x.filas, filaValida) && lista(x.cobertura, txt) &&
    esObj(t) && entero(t.productos) && entero(t.sinSaldo) && entero(t.sinStock) && entero(t.bajo) && entero(t.sobrestock) && lista(t.porUnidad, unidadValida) &&
    esObj(c) && lista(c.depositos, (d) => idNombre(d) && typeof (d as Record<string, unknown>).activo === "boolean") && lista(c.categorias, idNombre) && lista(c.marcas, idNombre) && lista(c.familias, idNombre) &&
    esObj(perm) && typeof perm.exportar === "boolean";
}
