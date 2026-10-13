import type { Celda, ColRep, TablaReporte } from "@/lib/reportes/export";
import { fmtNum } from "@/lib/reportes/formato";
import { CRITICIDADES, ETIQUETA_CRITICIDAD } from "@/lib/reportes/stock-critico-plan";
import type { StockCriticoFila, StockCriticoFiltros, StockCriticoRespuesta } from "@/types/reportes";

// Exportación de Stock crítico y reposición: mismas filas, filtros y totales que la pantalla (resultado del motor único de Reposición).
// Las cantidades no se suman entre productos (unidades distintas): el TOTAL GENERAL muestra «n/a» en ellas; solo cuenta alertas y estima valor.

export const VISTAS_CRITICO: Record<StockCriticoFiltros["vista"], string> = { PRODUCTO: "Por producto (consolida solo los planes del mismo producto)", DEPOSITO: "Por producto y depósito" };
export const SITUACIONES_CRITICO: Record<StockCriticoFiltros["situacion"], string> = {
  ALERTAS: "Solo lo que necesita reposición", TODAS: "Todas las situaciones", SIN_STOCK: "Sin stock", BAJO_MINIMO: "Bajo el mínimo", EN_PUNTO: "En punto de reposición", OK: "Normal", SIN_GATILLO: "Cantidad sin gatillo",
};
export const NO_APLICA = "n/a";
export const SIN_META = "Sin meta";

export function describirFiltrosStockCritico(r: StockCriticoRespuesta): string[] {
  const f = r.filtros;
  const nombre = (l: { id: string; nombre: string }[], id: string) => l.find((x) => x.id === id)?.nombre ?? id;
  const out = [
    `Vista: ${VISTAS_CRITICO[f.vista]}`,
    `Depósito: ${f.depositoId ? nombre(r.catalogos.depositos, f.depositoId) : "Todos los activos de su alcance"}`,
    `Situación: ${SITUACIONES_CRITICO[f.situacion]}`,
    "Cálculo: el mismo de Inventario > Reposición (parámetros por depósito, sin tránsito)",
  ];
  if (f.q) out.push(`Producto: ${f.q}`);
  if (f.categoriaId) out.push(`Categoría: ${nombre(r.catalogos.categorias, f.categoriaId)}`);
  if (f.marcaId) out.push(`Marca: ${nombre(r.catalogos.marcas, f.marcaId)}`);
  if (f.familiaId) out.push(`Familia: ${nombre(r.catalogos.familias, f.familiaId)}`);
  return out;
}

type Col = ColRep & { valor: (x: StockCriticoFila) => Celda };

/** Meta definida → número; destinos que necesitan reposición sin meta → «Sin meta» (texto, nunca 0 inventado). */
const conMeta = (cantidad: number, x: StockCriticoFila): Celda => (x.sinMeta > 0 && cantidad === 0 ? SIN_META : cantidad);

export function columnasStockCritico(f: Pick<StockCriticoFiltros, "vista">): Col[] {
  const txt = (titulo: string, peso: number, valor: (x: StockCriticoFila) => string): Col => ({ titulo, peso, tipo: "texto", valor });
  const cant = (titulo: string, peso: number, valor: (x: StockCriticoFila) => Celda): Col => ({ titulo, peso, tipo: "cantidad", valor });
  const cols: Col[] = [
    txt("Código", 5.5, (x) => x.codigo), txt("Descripción", 11, (x) => x.descripcion), txt("Categoría", 6.5, (x) => x.categoria), txt("Marca", 5, (x) => x.marca),
  ];
  if (f.vista === "DEPOSITO") cols.push(txt("Depósito", 7.5, (x) => x.deposito));
  else cols.push(cant("Destinos", 4.5, (x) => x.destinos));
  cols.push(txt("Unidad", 4, (x) => x.unidad), cant(f.vista === "DEPOSITO" ? "Disponible" : "Disponible (destinos)", 6, (x) => x.disponible));
  if (f.vista === "DEPOSITO") cols.push(cant("Mínimo", 4.5, (x) => x.minimo), cant("Punto reposición", 5.5, (x) => x.punto), cant("Máximo", 4.5, (x) => x.maximo));
  cols.push(
    txt("Situación", 6.5, (x) => ETIQUETA_CRITICIDAD[x.criticidad]),
    cant("Cant. sugerida", 5.5, (x) => conMeta(x.sugerida, x)),
    cant("Transferencia", 5.5, (x) => x.transferencia),
    cant("Compra", 5, (x) => conMeta(x.compra, x)),
  );
  if (f.vista === "DEPOSITO") cols.push(txt("Orígenes sugeridos", 9, (x) => x.origenes));
  cols.push(
    { titulo: "Costo ref.", peso: 6, tipo: "dinero", valor: (x) => x.costoReferencia },
    { titulo: "Valor ref.", peso: 6.5, tipo: "dinero", valor: (x) => x.valorReferencia },
  );
  return cols;
}

export function tablaStockCritico(r: StockCriticoRespuesta): TablaReporte {
  const cols = columnasStockCritico(r.filtros);
  const t = r.totales;
  const v = r.filtros.vista;
  const noSuma = new Set(["Disponible", "Disponible (destinos)", "Mínimo", "Punto reposición", "Máximo", "Cant. sugerida", "Transferencia", "Compra", "Costo ref."]);
  const celdas: Celda[] = cols.map((c) => (c.titulo === "Valor ref." ? t.valorReferencia : c.titulo === "Destinos" ? t.destinos : noSuma.has(c.titulo) ? NO_APLICA : ""));
  const conteo = CRITICIDADES.filter((c) => t.porCriticidad[c] > 0).map((c) => `${ETIQUETA_CRITICIDAD[c]}: ${t.porCriticidad[c]}`).join(" · ");

  return {
    titulo: "Stock crítico y reposición",
    hoja: "Stock crítico",
    nombreBase: `Stock_Critico_${v === "PRODUCTO" ? "Producto" : "Deposito"}`,
    empresa: r.empresa.nombre,
    generado: r.generado,
    sello: r.sello,
    filtros: describirFiltrosStockCritico(r),
    totalFilas: r.pagina.totalFilas,
    columnas: cols.map(({ titulo, peso, tipo }) => ({ titulo, peso, tipo })),
    filas: r.filas.map((x) => cols.map((c) => c.valor(x))),
    totales: [{ etiqueta: "TOTAL GENERAL (alertas, sin sumar cantidades)", celdas }],
    colEtiquetaPdf: 1,
    multilinea: true,
    notas: [
      `Destinos con plan: ${fmtNum(t.destinos)} de ${fmtNum(t.productos)} producto(s) · Necesitan reposición: ${fmtNum(t.necesitan)} · ${conteo || "sin destinos"}. Importes en ${t.moneda}.`,
      ...(t.sinMeta > 0 ? [`${t.sinMeta} destino(s) necesitan reposición pero no tienen máximo ni cantidad de reposición («Sin meta»): defina la meta en Productos > Inventario.`] : []),
      ...(t.sinCosto > 0 ? [`${t.sinCosto} destino(s) con cantidad sugerida no tienen costo registrado: no se estima su valor (no se asume 0).`] : []),
      ...(t.referencias > 0 ? [`${t.referencias} total(es) consolidado(s) de productos con parámetros por depósito se omiten: son solo referencia y no generan alertas.`] : []),
      "Valor ref. = cantidad sugerida × costo promedio real; estimación, no es la valorización del inventario ni un precio de compra. Las cantidades no se suman entre productos (unidades distintas).",
      ...r.cobertura,
    ],
  };
}
