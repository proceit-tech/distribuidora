import type { Celda, ColRep, TablaReporte } from "@/lib/reportes/export";
import type { ValorizacionFila, ValorizacionFiltros, ValorizacionRespuesta } from "@/types/reportes";

// Exportación de Valorización de inventario: mismas filas, filtros y totales que la pantalla.

export const SITUACION_COSTO: Record<string, string> = { CON_COSTO: "Con costo", PARCIAL: "Parcial", SIN_COSTO: "Sin costo", SIN_STOCK: "Sin stock" };
export const VISTAS_VALORIZACION: Record<ValorizacionFiltros["vista"], string> = {
  DETALLE: "Detalle por producto y depósito", PRODUCTO: "Subtotal por producto", DEPOSITO: "Subtotal por depósito", CATEGORIA: "Subtotal por categoría",
};

export function describirFiltrosValorizacion(r: ValorizacionRespuesta): string[] {
  const f = r.filtros;
  const nombre = (l: { id: string; nombre: string }[], id: string) => l.find((x) => x.id === id)?.nombre ?? id;
  const out = [`Vista: ${VISTAS_VALORIZACION[f.vista]}`, `Moneda: ${r.empresa.moneda}`, `Depósito: ${f.depositoId ? nombre(r.catalogos.depositos, f.depositoId) : "Todos"}`];
  if (f.q) out.push(`Búsqueda: ${f.q}`);
  if (f.categoriaId) out.push(`Categoría: ${nombre(r.catalogos.categorias, f.categoriaId)}`);
  if (f.familiaId) out.push(`Familia: ${nombre(r.catalogos.familias, f.familiaId)}`);
  if (f.existencia !== "TODOS") out.push(`Existencia: ${f.existencia === "CON" ? "Con existencia" : "Sin existencia"}`);
  if (f.costo !== "TODOS") out.push(`Costo registrado: ${f.costo === "CON" ? "Con costo" : "Sin costo"}`);
  return out;
}

type Col = ColRep & { valor: (f: ValorizacionFila) => Celda };

export function columnasValorizacion(vista: ValorizacionFiltros["vista"]): Col[] {
  const txt = (titulo: string, peso: number, valor: (f: ValorizacionFila) => string): Col => ({ titulo, peso, tipo: "texto", valor });
  const ident: Col[] =
    vista === "DETALLE" || vista === "PRODUCTO"
      ? [txt("Código", 6, (f) => f.codigo), txt("Producto", 12, (f) => f.descripcion), txt("Categoría", 7, (f) => f.categoria), txt("Familia", 6, (f) => f.familia)]
      : vista === "CATEGORIA" ? [txt("Categoría", 12, (f) => f.categoria)] : [];
  if (vista === "DETALLE") ident.push(txt("Depósito", 8, (f) => f.deposito));
  if (vista === "DEPOSITO") ident.push(txt("Depósito", 12, (f) => f.deposito));
  const grupo: Col[] = [];
  if (vista === "DEPOSITO" || vista === "CATEGORIA") grupo.push({ titulo: "Productos", peso: 5, tipo: "cantidad", valor: (f) => f.productos });
  if (vista === "PRODUCTO" || vista === "CATEGORIA") grupo.push({ titulo: "Depósitos", peso: 5, tipo: "cantidad", valor: (f) => f.depositos });
  return [
    ...ident, ...grupo,
    { titulo: "Stock físico propio", peso: 6, tipo: "cantidad", valor: (f) => f.fisico },
    { titulo: "Cantidad valorizada", peso: 6, tipo: "cantidad", valor: (f) => f.cantidadValorizada },
    { titulo: "Costo promedio unit.", peso: 7, tipo: "dinero", valor: (f) => f.costoPromedio },
    { titulo: "Valor total", peso: 8, tipo: "dinero", valor: (f) => f.valorTotal },
    txt("Moneda", 4, (f) => f.moneda),
    txt("Costo", 5, (f) => SITUACION_COSTO[f.situacionCosto]),
  ];
}

export function tablaValorizacion(r: ValorizacionRespuesta): TablaReporte {
  const cols = columnasValorizacion(r.filtros.vista);
  const t = r.totales;
  const tot: Record<string, Celda> = {
    "Productos": t.productos, "Depósitos": t.depositos, "Stock físico propio": t.fisico, "Cantidad valorizada": t.cantidadValorizada,
    "Costo promedio unit.": t.costoPromedio, "Valor total": t.valorTotal, "Moneda": t.moneda,
  };
  const celdas: Celda[] = cols.map((c) => (c.titulo in tot ? tot[c.titulo] : ""));
  return {
    titulo: "Valorización de inventario",
    hoja: "Valorización",
    nombreBase: `Valorizacion_Inventario_${{ DETALLE: "Detalle", PRODUCTO: "Producto", DEPOSITO: "Deposito", CATEGORIA: "Categoria" }[r.filtros.vista]}`,
    empresa: r.empresa.nombre,
    generado: r.generado,
    sello: r.sello,
    filtros: describirFiltrosValorizacion(r),
    totalFilas: r.pagina.totalFilas,
    columnas: cols.map(({ titulo, peso, tipo }) => ({ titulo, peso, tipo })),
    filas: r.filas.map((f) => cols.map((c) => c.valor(f))),
    totales: [{ etiqueta: "TOTAL GENERAL", celdas }],
    colEtiquetaPdf: 0,
    notas: [...(t.filasSinCosto > 0 ? [`Stock sin costo registrado (no incluido en el valor): ${t.filasSinCosto} filas producto × depósito, ${t.fisicoNoValorizado} unidades físicas no valorizadas.`] : []), ...r.cobertura],
  };
}
