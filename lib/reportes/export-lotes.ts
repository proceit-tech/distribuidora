import type { Celda, ColRep, TablaReporte } from "@/lib/reportes/export";
import { fmtCantidadTexto, fmtNum, textoTercerosEstadosTexto } from "@/lib/reportes/formato";
import { etiquetasUnidad, nombreUnidad } from "@/lib/reportes/lotes-plan";
import type { ClaseVencimiento, LotesFila, LotesFiltros, LotesRespuesta } from "@/types/reportes";

// Exportación de Lotes y vencimientos: mismas filas, filtros y totales que la pantalla. Cantidades como texto numeric exacto; totales POR unidad de medida (UUID).

export const CLASE_LOTE: Record<ClaseVencimiento, string> = { VENCIDO: "Vencido", PROXIMO: "Próximo a vencer", VIGENTE: "Vigente", SIN_FECHA: "Sin fecha" };
export const VISTAS_LOTES: Record<LotesFiltros["vista"], string> = { LOTE: "Por lote (consolidado)", DEPOSITO: "Por lote y depósito" };
const EXISTENCIA: Record<LotesFiltros["existencia"], string> = { CON: "Solo con saldo", SIN: "Sin saldo", TODOS: "Todos" };

export const textoDias = (f: Pick<LotesFila, "diasRestantes">) => (f.diasRestantes === null ? "—" : fmtNum(f.diasRestantes));
export const textoDepositoLote = (f: Pick<LotesFila, "deposito" | "depositoInactivo">) => (f.deposito ? `${f.deposito}${f.depositoInactivo ? " (inactivo)" : ""}` : "—");
export const textoAlcanceExistencia = (r: Pick<LotesRespuesta, "alcanceExistencia" | "filtros" | "catalogos">): string =>
  r.alcanceExistencia.modo === "DEPOSITO"
    ? `saldo total del lote en el depósito ${r.catalogos.depositos.find((d) => d.id === r.filtros.depositoId)?.nombre ?? "elegido"}`
    : `saldo total del lote en los ${r.alcanceExistencia.depositos} depósitos autorizados`;

export function describirFiltrosLotes(r: LotesRespuesta): string[] {
  const f = r.filtros;
  const nombre = (l: { id: string; nombre: string }[], id: string) => l.find((x) => x.id === id)?.nombre ?? id;
  const out = [
    `Vista: ${VISTAS_LOTES[f.vista]}`,
    `Fecha de referencia (Paraguay): ${r.totales.hoy}`,
    `Horizonte de alerta: ${f.horizonte} días`,
    `Depósito: ${f.depositoId ? nombre(r.catalogos.depositos, f.depositoId) : "Todos los de su alcance"}`,
    `Existencia: ${EXISTENCIA[f.existencia]} (${textoAlcanceExistencia(r)})`,
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
  const cant = (titulo: string, peso: number, valor: (x: LotesFila) => string): Col => ({ titulo, peso, tipo: "cantidad", valor });
  return [
    txt("Código", 5.5, (x) => x.codigo), txt("Producto", 10, (x) => x.descripcion), txt("Unidad", 4.5, (x) => x.unidad), txt("Categoría", 6, (x) => x.categoria), txt("Familia", 5.5, (x) => x.familia),
    txt("Lote", 6, (x) => x.lote),
    vista === "DEPOSITO" ? txt("Depósito", 7, (x) => textoDepositoLote(x)) : { titulo: "Depósitos", peso: 4.5, tipo: "cantidad", valor: (x: LotesFila) => x.depositos },
    txt("Vencimiento", 6, (x) => x.vencimiento || "Sin fecha"),
    txt("Días restantes", 5, (x) => textoDias(x)),
    txt("Situación", 6.5, (x) => CLASE_LOTE[x.clase]),
    cant("Disponible", 5.5, (x) => x.disponible), cant("Reservado", 5.5, (x) => x.reservado), cant("Cuarentena", 5.5, (x) => x.cuarentena), cant("Físico propio", 5.5, (x) => x.fisico),
    cant("Terceros", 5.5, (x) => x.terceros), txt("Terceros por estado", 8, (x) => textoTercerosEstadosTexto(x.tercerosEstados)),
  ];
}

export function tablaLotes(r: LotesRespuesta): TablaReporte {
  const cols = columnasLotes(r.filtros.vista);
  const t = r.totales;
  // Rótulo de cada unidad derivado de TODAS las unidades del alcance (UUID = identidad; el nombre repetido se rotula con el identificador).
  const et = etiquetasUnidad(t.porUnidad);
  const iUni = cols.findIndex((c) => c.titulo === "Unidad");
  // Un bloque de totales por unidad física: jamás se suman cantidades de unidades distintas.
  const totales = t.porUnidad.map((u) => {
    const tot: Record<string, Celda> = {
      Unidad: nombreUnidad(et, u), Disponible: u.disponible, Reservado: u.reservado, Cuarentena: u.cuarentena, "Físico propio": u.fisico, Terceros: u.terceros,
      "Terceros por estado": textoTercerosEstadosTexto(u.tercerosPorEstado),
    };

    return { etiqueta: `TOTAL · ${fmtNum(u.lotes)} lote(s)`, celdas: cols.map((c) => (c.titulo in tot ? tot[c.titulo] : "")) };
  });
  const porClase = t.clases
    .map((c) => `${CLASE_LOTE[c.clase]}: ${fmtNum(c.lotes)} lotes${c.unidades.length ? ` (${c.unidades.map((u) => `${nombreUnidad(et, u)}: físico propio ${fmtCantidadTexto(u.fisico)}, terceros ${fmtCantidadTexto(u.terceros)}`).join("; ")})` : ""}`)
    .join(" · ");
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
    filas: r.filas.map((x) => cols.map((c) => c.valor({ ...x, unidad: nombreUnidad(et, x) }))),
    totales,
    colEtiquetaPdf: 1,
    multilinea: true,
    // PDF EXACTO: ninguna cifra se recorta; si las columnas no caben pasan a bloques que repiten código, producto, unidad, lote y depósito.
    pdfAnclas: [0, 1, iUni, cols.findIndex((c) => c.titulo === "Lote"), cols.findIndex((c) => c.titulo === "Depósito" || c.titulo === "Depósitos")],
    notas: [
      `Lotes: ${fmtNum(t.lotes)} (cada lote cuenta una sola vez). ${porClase}. Los totales de cantidades se presentan por unidad de medida y no se suman entre unidades distintas.`,
      ...(t.porUnidad.length > 1 ? ["Hay más de una unidad de medida: no existe un total general de cantidades (n/a)."] : []),
      ...r.cobertura,
    ],
  };
}
