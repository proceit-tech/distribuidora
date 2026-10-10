import type { Celda, ColRep, TablaReporte } from "@/lib/reportes/export";
import { fmtNum, textoTercerosEstados } from "@/lib/reportes/formato";
import type { ClaseVencimiento, LotesFila, LotesFiltros, LotesRespuesta } from "@/types/reportes";

// Exportación de Lotes y vencimientos: mismas filas, filtros y totales que la pantalla.

export const CLASE_LOTE: Record<ClaseVencimiento, string> = { VENCIDO: "Vencido", PROXIMO: "Próximo a vencer", VIGENTE: "Vigente", SIN_FECHA: "Sin fecha" };
export const VISTAS_LOTES: Record<LotesFiltros["vista"], string> = { LOTE: "Por lote (consolidado)", DEPOSITO: "Por lote y depósito" };
const EXISTENCIA: Record<LotesFiltros["existencia"], string> = { CON: "Solo con saldo", SIN: "Sin saldo", TODOS: "Todos" };

export const textoDias = (f: Pick<LotesFila, "diasRestantes">) => (f.diasRestantes === null ? "—" : fmtNum(f.diasRestantes));

export function describirFiltrosLotes(r: LotesRespuesta): string[] {
  const f = r.filtros;
  const nombre = (l: { id: string; nombre: string }[], id: string) => l.find((x) => x.id === id)?.nombre ?? id;
  const out = [
    `Vista: ${VISTAS_LOTES[f.vista]}`,
    `Fecha de referencia (Paraguay): ${r.totales.hoy}`,
    `Horizonte de alerta: ${f.horizonte} días`,
    `Depósito: ${f.depositoId ? nombre(r.catalogos.depositos, f.depositoId) : "Todos"}`,
    `Existencia: ${EXISTENCIA[f.existencia]}`,
  ];
  if (f.q) out.push(`Producto: ${f.q}`);
  if (f.lote) out.push(`Lote: ${f.lote}`);
  if (f.categoriaId) out.push(`Categoría: ${nombre(r.catalogos.categorias, f.categoriaId)}`);
  if (f.marcaId) out.push(`Marca: ${nombre(r.catalogos.marcas, f.marcaId)}`);
  if (f.familiaId) out.push(`Familia: ${nombre(r.catalogos.familias, f.familiaId)}`);
  if (f.clase) out.push(`Situación de vencimiento: ${CLASE_LOTE[f.clase]}`);
  if (f.vencDesde) out.push(`Vence desde: ${f.vencDesde}`);
  if (f.vencHasta) out.push(`Vence hasta: ${f.vencHasta}`);
  return out;
}

type Col = ColRep & { valor: (x: LotesFila) => Celda };

export function columnasLotes(vista: LotesFiltros["vista"]): Col[] {
  const txt = (titulo: string, peso: number, valor: (x: LotesFila) => string): Col => ({ titulo, peso, tipo: "texto", valor });
  const cant = (titulo: string, peso: number, valor: (x: LotesFila) => number): Col => ({ titulo, peso, tipo: "cantidad", valor });
  return [
    txt("Código", 5.5, (x) => x.codigo), txt("Producto", 10, (x) => x.descripcion), txt("Categoría", 6, (x) => x.categoria), txt("Familia", 5.5, (x) => x.familia),
    txt("Lote", 6, (x) => x.lote),
    vista === "DEPOSITO" ? txt("Depósito", 7, (x) => x.deposito || "—") : cant("Depósitos", 4.5, (x) => x.depositos),
    txt("Vencimiento", 6, (x) => x.vencimiento || "Sin fecha"),
    txt("Días restantes", 5, (x) => textoDias(x)),
    txt("Situación", 6.5, (x) => CLASE_LOTE[x.clase]),
    cant("Disponible", 5.5, (x) => x.disponible), cant("Reservado", 5.5, (x) => x.reservado), cant("Cuarentena", 5.5, (x) => x.cuarentena), cant("Físico propio", 5.5, (x) => x.fisico),
    cant("Terceros", 5.5, (x) => x.terceros), txt("Terceros por estado", 8, (x) => textoTercerosEstados(x.tercerosEstados)),
  ];
}

export function tablaLotes(r: LotesRespuesta): TablaReporte {
  const cols = columnasLotes(r.filtros.vista);
  const t = r.totales;
  const tot: Record<string, Celda> = {
    Disponible: t.disponible, Reservado: t.reservado, Cuarentena: t.cuarentena, "Físico propio": t.fisico, Terceros: t.terceros,
    "Terceros por estado": textoTercerosEstados(t.tercerosPorEstado),
  };
  const celdas: Celda[] = cols.map((c) => (c.titulo in tot ? tot[c.titulo] : ""));
  const porClase = t.clases.map((c) => `${CLASE_LOTE[c.clase]}: ${c.lotes} lotes, físico propio ${fmtNum(c.fisico)}, terceros ${fmtNum(c.terceros)}`).join(" · ");
  return {
    titulo: "Lotes y vencimientos",
    hoja: "Lotes",
    nombreBase: `Lotes_Vencimientos_${r.filtros.vista === "LOTE" ? "Lote" : "Deposito"}`,
    empresa: r.empresa.nombre,
    generado: r.generado,
    sello: r.sello,
    filtros: describirFiltrosLotes(r),
    totalFilas: r.pagina.totalFilas,
    columnas: cols.map(({ titulo, peso, tipo }) => ({ titulo, peso, tipo })),
    filas: r.filas.map((x) => cols.map((c) => c.valor(x))),
    totales: [{ etiqueta: "TOTAL GENERAL (lotes únicos)", celdas }],
    colEtiquetaPdf: 1,
    multilinea: true,
    notas: [`Lotes: ${fmtNum(t.lotes)}. ${porClase}. Cada lote cuenta una sola vez y cada saldo se suma una sola vez aunque el lote esté en varios depósitos.`, ...r.cobertura],
  };
}
