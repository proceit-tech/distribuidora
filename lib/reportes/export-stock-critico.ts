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
    cant("Cant. sugerida", 5.5, (x) => x.cantidadSugerida),
    { titulo: "Costo ref.", peso: 6, tipo: "dinero", valor: (x) => x.costoReferencia },
    { titulo: "Valor sugerido", peso: 6.5, tipo: "dinero", valor: (x) => x.valorSugerido },
  );
  return cols;
}

export function tablaStockCritico(r: StockCriticoRespuesta): TablaReporte {
  const cols = columnasStockCritico(r.filtros);
  const t = r.totales;
  const tot: Record<string, Celda> = { "Cant. sugerida": t.cantidadSugerida, "Valor sugerido": t.valorSugerido };
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
    totales: [{ etiqueta: "TOTAL (productos)", celdas }],
    colEtiquetaPdf: 1,
    multilinea: true,
    notas: [
      `Productos: ${fmtNum(t.productos)} · Sin stock: ${t.sinStock} · Bajo: ${t.bajo} · Normal: ${t.normal} · Sobrestock: ${t.sobrestock} · En punto de reposición: ${t.enPuntoReposicion} · A reponer: ${t.aReponer}. Los totales cuentan cada producto una sola vez (también en la vista por depósito). Importes en ${t.moneda}.`,
      ...(t.sugeridoSinCosto > 0 ? [`${t.sugeridoSinCosto} producto(s) con reposición sugerida no tienen costo registrado: no suman al valor sugerido.`] : []),
      "Máximo o punto de reposición vacíos = no definidos en el cadastro del producto.",
      ...r.cobertura,
    ],
  };
}
