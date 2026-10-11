import type { Celda, ColRep, TablaReporte } from "@/lib/reportes/export";
import { fmtNum } from "@/lib/reportes/formato";
import type { StockCriticoFila, StockCriticoFiltros, StockCriticoRespuesta } from "@/types/reportes";

// Exportación de Stock crítico y reposición: mismas filas, filtros y totales que la pantalla.

export const NIVEL_CRITICO: Record<string, string> = { SIN_STOCK: "Sin stock", BAJO: "Bajo", NORMAL: "Normal", SOBRESTOCK: "Sobrestock" };
export const VISTAS_CRITICO: Record<StockCriticoFiltros["vista"], string> = { PRODUCTO: "Por producto (consolidado)", DEPOSITO: "Por producto y depósito" };
export const OBJETIVOS: Record<StockCriticoFiltros["objetivo"], string> = { MINIMO: "hasta el stock mínimo (conservador)", MAXIMO: "hasta el stock máximo" };

export function describirFiltrosStockCritico(r: StockCriticoRespuesta): string[] {
  const f = r.filtros;
  const nombre = (l: { id: string; nombre: string }[], id: string) => l.find((x) => x.id === id)?.nombre ?? id;
  const out = [
    `Vista: ${VISTAS_CRITICO[f.vista]}`,
    `Depósito: ${f.depositoId ? nombre(r.catalogos.depositos, f.depositoId) : "Todos"}`,
    "Límites: por producto (no por depósito)",
    `Reposición sugerida: ${OBJETIVOS[f.objetivo]}`,
  ];
  if (f.q) out.push(`Producto: ${f.q}`);
  if (f.categoriaId) out.push(`Categoría: ${nombre(r.catalogos.categorias, f.categoriaId)}`);
  if (f.marcaId) out.push(`Marca: ${nombre(r.catalogos.marcas, f.marcaId)}`);
  if (f.familiaId) out.push(`Familia: ${nombre(r.catalogos.familias, f.familiaId)}`);
  if (f.situacion) out.push(`Situación: ${NIVEL_CRITICO[f.situacion]}`);
  return out;
}

type Col = ColRep & { valor: (x: StockCriticoFila) => Celda };

// En la vista por depósito la sugerencia es única por producto: se repite como REFERENCIA en cada fila de depósito y no es aditiva.
export const TITULO_SUGERIDA = (vista: StockCriticoFiltros["vista"]) => (vista === "DEPOSITO" ? "Sugerida (ref. no sumar)" : "Cant. sugerida");
export const TITULO_VALOR = (vista: StockCriticoFiltros["vista"]) => (vista === "DEPOSITO" ? "Valor sug. (ref. no sumar)" : "Valor sugerido");
export const NOTA_NO_ADITIVO =
  "Vista por depósito: las columnas \"Sugerida (ref. no sumar)\" y \"Valor sug. (ref. no sumar)\" son únicas por producto; la cantidad sugerida y su valor son únicos por producto (se calculan con el disponible consolidado y los límites del producto). Se repiten como referencia en cada fila de depósito del mismo producto y NO son aditivos entre depósitos: no sume las filas. El TOTAL GENERAL cuenta cada producto una sola vez. El disponible total, el mínimo, el máximo, el punto de reposición y la situación también son del producto; solo \"Disp. en depósito\" corresponde a cada depósito.";

export function columnasStockCritico(f: StockCriticoFiltros): Col[] {
  const txt = (titulo: string, peso: number, valor: (x: StockCriticoFila) => string): Col => ({ titulo, peso, tipo: "texto", valor });
  const cant = (titulo: string, peso: number, valor: (x: StockCriticoFila) => number | null): Col => ({ titulo, peso, tipo: "cantidad", valor });
  const cols: Col[] = [
    txt("Código", 5.5, (x) => x.codigo), txt("Descripción", 11, (x) => x.descripcion), txt("Categoría", 6.5, (x) => x.categoria),
    txt("Marca", 5, (x) => x.marca), txt("Familia", 5.5, (x) => x.familia),
  ];
  if (f.vista === "DEPOSITO") cols.push(txt("Depósito", 7, (x) => x.deposito));
  if (f.vista === "DEPOSITO" || f.depositoId) cols.push(cant("Disp. en depósito", 6, (x) => x.disponibleDeposito));
  cols.push(
    cant("Disponible (total)", 6.5, (x) => x.disponible), cant("Mínimo", 4.5, (x) => x.minimo), cant("Máximo", 4.5, (x) => x.maximo),
    cant("Punto reposición", 5.5, (x) => x.puntoReposicion),
    txt("Situación", 5.5, (x) => NIVEL_CRITICO[x.nivel] + (x.enPuntoReposicion && x.nivel !== "SIN_STOCK" && x.nivel !== "BAJO" ? " (en punto)" : "")),
    cant(TITULO_SUGERIDA(f.vista), f.vista === "DEPOSITO" ? 9 : 5.5, (x) => x.cantidadSugerida),
    { titulo: "Costo ref.", peso: 6, tipo: "dinero", valor: (x) => x.costoReferencia },
    { titulo: TITULO_VALOR(f.vista), peso: f.vista === "DEPOSITO" ? 9.5 : 6.5, tipo: "dinero", valor: (x) => x.valorSugerido },
  );
  return cols;
}

export function tablaStockCritico(r: StockCriticoRespuesta): TablaReporte {
  const cols = columnasStockCritico(r.filtros);
  const t = r.totales;
  const v = r.filtros.vista;
  const tot: Record<string, Celda> = { [TITULO_SUGERIDA(v)]: t.cantidadSugerida, [TITULO_VALOR(v)]: t.valorSugerido };
  const celdas: Celda[] = cols.map((c) => (c.titulo in tot ? tot[c.titulo] : ""));
  return {
    titulo: "Stock crítico y reposición",
    hoja: "Stock crítico",
    nombreBase: `Stock_Critico_${r.filtros.vista === "PRODUCTO" ? "Producto" : "Deposito"}`,
    empresa: r.empresa.nombre,
    generado: r.generado,
    sello: r.sello,
    filtros: describirFiltrosStockCritico(r),
    totalFilas: r.pagina.totalFilas,
    columnas: cols.map(({ titulo, peso, tipo }) => ({ titulo, peso, tipo })),
    filas: r.filas.map((x) => cols.map((c) => c.valor(x))),
    totales: [{ etiqueta: "TOTAL GENERAL (productos únicos)", celdas }],
    colEtiquetaPdf: 1,
    multilinea: true,
    notas: [
      ...(v === "DEPOSITO" ? [NOTA_NO_ADITIVO] : []),
      `Productos: ${fmtNum(t.productos)} · Sin stock: ${t.sinStock} · Bajo: ${t.bajo} · Normal: ${t.normal} · Sobrestock: ${t.sobrestock} · En punto de reposición: ${t.enPuntoReposicion} · A reponer: ${t.aReponer}. Los totales cuentan cada producto una sola vez (también en la vista por depósito). Importes en ${t.moneda}.`,
      ...(t.sugeridoSinCosto > 0 ? [`${t.sugeridoSinCosto} producto(s) con reposición sugerida no tienen costo registrado: no suman al valor sugerido.`] : []),
      "Máximo o punto de reposición vacíos = no definidos en el cadastro del producto.",
      ...r.cobertura,
    ],
  };
}
