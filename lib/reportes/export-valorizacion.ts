import type { Celda, ColRep, TablaReporte } from "@/lib/reportes/export";
import { ETIQUETA_SITUACION, porcentajeCobertura, SITUACIONES, totalDivergencias } from "@/lib/reportes/valorizacion-cobertura";
import type { ValorizacionFila, ValorizacionFiltros, ValorizacionRespuesta } from "@/types/reportes";

// Exportación de Valorización de inventario: mismas filas, filtros, totales y conteos que la pantalla (una sola lectura con snapshot por solicitud).
// Dinero y cantidades salen como texto numeric exacto; lo que no tiene sentido sumar (cantidades de unidades distintas) se escribe «n/a».

export const SITUACION_COSTO: Record<string, string> = ETIQUETA_SITUACION;
export const VISTAS_VALORIZACION: Record<ValorizacionFiltros["vista"], string> = {
  DETALLE: "Detalle por producto y depósito", PRODUCTO: "Subtotal por producto", DEPOSITO: "Subtotal por depósito", CATEGORIA: "Subtotal por categoría",
};
export const NO_APLICA = "n/a";
const ETIQUETA_COBERTURA_FILTRO: Record<ValorizacionFiltros["cobertura"], string> = {
  TODOS: "Todas", DIVERGENCIAS: "Solo divergencias", PARCIAL: "Parcial", SIN_COSTO: "Sin costo", EXCEDENTE: "Excedente valorizado", RESIDUO: "Valor sin cantidad",
};

export function describirFiltrosValorizacion(r: ValorizacionRespuesta): string[] {
  const f = r.filtros;
  const nombre = (l: { id: string; nombre: string }[], id: string) => l.find((x) => x.id === id)?.nombre ?? id;
  const inactivos = r.catalogos.depositos.filter((d) => !d.activo).length;
  const out = [
    `Vista: ${VISTAS_VALORIZACION[f.vista]}`, `Moneda base: ${r.empresa.moneda}`,
    `Alcance: ${r.catalogos.depositos.length} depósito(s) de su alcance${inactivos ? `, ${inactivos} inactivo(s)` : ""}`,
    `Depósito: ${f.depositoId ? nombre(r.catalogos.depositos, f.depositoId) : "Todos"}`,
  ];
  if (f.q) out.push(`Búsqueda: ${f.q}`);
  if (f.categoriaId) out.push(`Categoría: ${nombre(r.catalogos.categorias, f.categoriaId)}`);
  if (f.familiaId) out.push(`Familia: ${nombre(r.catalogos.familias, f.familiaId)}`);
  if (f.existencia !== "TODOS") out.push(`Existencia: ${f.existencia === "CON" ? "Con existencia" : "Sin existencia"}`);
  if (f.costo !== "TODOS") out.push(`Costo registrado: ${f.costo === "CON" ? "Con costo" : "Sin costo"}`);
  if (f.cobertura !== "TODOS") out.push(`Cobertura: ${ETIQUETA_COBERTURA_FILTRO[f.cobertura]}`);
  return out;
}

type Col = ColRep & { valor: (f: ValorizacionFila) => Celda };

const nombreDeposito = (f: ValorizacionFila) => (f.depositoInactivo ? `${f.deposito} (inactivo)` : f.deposito);

export function columnasValorizacion(vista: ValorizacionFiltros["vista"]): Col[] {
  const txt = (titulo: string, peso: number, valor: (f: ValorizacionFila) => string): Col => ({ titulo, peso, tipo: "texto", valor });
  const cant = (titulo: string, peso: number, valor: (f: ValorizacionFila) => string | number | null): Col => ({ titulo, peso, tipo: "cantidad", valor: (f) => valor(f) ?? NO_APLICA });
  const dinero = (titulo: string, peso: number, valor: (f: ValorizacionFila) => string | null): Col => ({ titulo, peso, tipo: "dinero", valor });
  const conteos: Col[] = [
    cant("Con costo", 5, (f) => f.conteos.CON_COSTO), cant("Parcial", 5, (f) => f.conteos.PARCIAL), cant("Sin costo", 5, (f) => f.conteos.SIN_COSTO),
    cant("Excedente", 5, (f) => f.conteos.EXCEDENTE), cant("Valor sin cantidad", 6, (f) => f.conteos.RESIDUO),
  ];
  const cantidades: Col[] = [
    cant("Stock físico propio", 6, (f) => f.fisico), cant("Cantidad valorizada", 6, (f) => f.cantidadValorizada),
    cant("Sin valorizar", 6, (f) => f.sinValorizar), cant("Excedente valorizado", 6, (f) => f.excedente), dinero("Costo promedio unit.", 7, (f) => f.costoPromedio),
  ];

  if (vista === "DETALLE") {
    return [txt("Código", 6, (f) => f.codigo), txt("Producto", 12, (f) => f.descripcion), txt("Categoría", 7, (f) => f.categoria), txt("Depósito", 8, nombreDeposito), txt("Unidad", 4, (f) => f.unidad),
      ...cantidades, dinero("Valor total", 8, (f) => f.valorTotal), txt("Moneda", 4, (f) => f.moneda), txt("Cobertura", 7, (f) => SITUACION_COSTO[f.situacionCosto])];
  }
  if (vista === "PRODUCTO") {
    return [txt("Código", 6, (f) => f.codigo), txt("Producto", 12, (f) => f.descripcion), txt("Categoría", 7, (f) => f.categoria), txt("Unidad", 4, (f) => f.unidad), cant("Depósitos", 5, (f) => f.depositos),
      ...cantidades, dinero("Valor total", 8, (f) => f.valorTotal), txt("Moneda", 4, (f) => f.moneda), txt("Cobertura", 7, (f) => SITUACION_COSTO[f.situacionCosto]), cant("Pares con divergencia", 6, (f) => totalDivergencias(f.conteos))];
  }
  if (vista === "DEPOSITO") {
    return [txt("Depósito", 12, nombreDeposito), cant("Productos", 5, (f) => f.productos), dinero("Valor total", 8, (f) => f.valorTotal), txt("Moneda", 4, (f) => f.moneda), ...conteos];
  }

  return [txt("Categoría", 12, (f) => f.categoria), cant("Productos", 5, (f) => f.productos), cant("Depósitos", 5, (f) => f.depositos), dinero("Valor total", 8, (f) => f.valorTotal), txt("Moneda", 4, (f) => f.moneda), ...conteos];
}

export function tablaValorizacion(r: ValorizacionRespuesta): TablaReporte {
  const cols = columnasValorizacion(r.filtros.vista);
  const t = r.totales;
  const tot: Record<string, Celda> = {
    "Productos": t.productos, "Depósitos": t.depositos, "Valor total": t.valorTotal, "Moneda": t.moneda,
    "Stock físico propio": NO_APLICA, "Cantidad valorizada": NO_APLICA, "Sin valorizar": NO_APLICA, "Excedente valorizado": NO_APLICA, "Costo promedio unit.": NO_APLICA,
    "Con costo": t.conteos.CON_COSTO, "Parcial": t.conteos.PARCIAL, "Sin costo": t.conteos.SIN_COSTO, "Excedente": t.conteos.EXCEDENTE, "Valor sin cantidad": t.conteos.RESIDUO,
    "Pares con divergencia": totalDivergencias(t.conteos),
  };
  const celdas: Celda[] = cols.map((c) => (c.titulo in tot ? tot[c.titulo] : ""));
  const cobertura = porcentajeCobertura(t.conteos);
  const resumen = SITUACIONES.filter((s) => s !== "SIN_STOCK" && t.conteos[s] > 0).map((s) => `${ETIQUETA_SITUACION[s]}: ${t.conteos[s]} par(es) producto × depósito, valor ${t.valorPorSituacion[s]} ${t.moneda}`);

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
    notas: [
      `Valor total del inventario (${t.moneda}): ${t.valorTotal} · ${t.productosConCosto} producto(s) con costo${cobertura ? ` · cobertura ${cobertura} % de los pares con existencia` : ""}.`,
      ...(resumen.length ? [`Situaciones sin compensar — ${resumen.join("; ")}.`] : []),
      ...(t.inactivos.filas > 0 ? [`Incluye ${t.inactivos.filas} par(es) de depósitos inactivos con existencia o valor, por ${t.inactivos.valor} ${t.moneda}.`] : []),
      ...r.cobertura,
    ],
  };
}
