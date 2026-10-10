import { generarPdf, type ColumnaPdf } from "@/lib/reportes/pdf";
import { fmtNum, textoTercerosEstados, TEXTO_PROPIEDAD } from "@/lib/reportes/formato";
import { generarXlsxSimple, type CeldaXlsx } from "@/lib/reportes/xlsx";
import type { StockGeneralFiltros, StockGeneralFila, StockGeneralRespuesta } from "@/types/reportes";

// Exportación de Stock general: usa exactamente las mismas filas, totales y filtros que la pantalla.

export { fmtNum };

export const NIVEL: Record<string, string> = { SIN_STOCK: "Sin stock", BAJO: "Bajo", NORMAL: "Normal", SOBRESTOCK: "Sobrestock" };

export function describirFiltros(r: StockGeneralRespuesta): string[] {
  const f: StockGeneralFiltros = r.filtros;
  const nombre = (l: { id: string; nombre: string }[], id: string) => l.find((x) => x.id === id)?.nombre ?? id;
  const out = [`Vista: ${f.vista === "PRODUCTO" ? "Agregado por producto" : "Detalle por depósito y lote"}`];
  out.push(`Depósito: ${f.depositoId ? nombre(r.catalogos.depositos, f.depositoId) : "Todos"}`);
  if (f.q) out.push(`Búsqueda: ${f.q}`);
  if (f.categoriaId) out.push(`Categoría: ${nombre(r.catalogos.categorias, f.categoriaId)}`);
  if (f.marcaId) out.push(`Marca: ${nombre(r.catalogos.marcas, f.marcaId)}`);
  if (f.familiaId) out.push(`Familia: ${nombre(r.catalogos.familias, f.familiaId)}`);
  if (f.situacion) out.push(`Situación: ${NIVEL[f.situacion]}`);
  if (f.lote) out.push(`Lote: ${f.lote}`);
  if (f.existencia !== "TODOS") out.push(`Existencia: ${f.existencia === "CON" ? "Con stock" : "Sin stock"}`);
  return out;
}

type Cant = "disponible" | "reservado" | "cuarentena" | "transito" | "fisico" | "virtual";
export type Col = { titulo: string; peso: number; cant?: Cant | "terceros"; valor: (f: StockGeneralFila) => string | number };

export function columnas(vista: StockGeneralFiltros["vista"]): Col[] {
  const base: Col[] = [
    { titulo: "Código", peso: 5.5, valor: (f) => f.codigo },
    { titulo: "Cód. inv. / GTIN", peso: 8, valor: (f) => [f.codigoInventario, f.codigoBarras].filter(Boolean).join(" / ") },
    { titulo: "Descripción", peso: 11, valor: (f) => f.descripcion },
    { titulo: "Categoría", peso: 6.5, valor: (f) => f.categoria },
    { titulo: "Marca", peso: 5.5, valor: (f) => f.marca },
    { titulo: "Familia", peso: 5.5, valor: (f) => f.familia },
    { titulo: "Línea", peso: 4.5, valor: (f) => f.linea },
    { titulo: "Unidad", peso: 4, valor: (f) => f.unidad },
  ];
  const cant = (titulo: string, k: Cant): Col => ({ titulo, peso: 5.8, cant: k, valor: (f) => f[k] });
  // Mismas columnas de cantidad en las dos vistas: Disponible…Virtual = stock PROPIO; Terceros = stock de terceros (todos los estados).
  const cantidades: Col[] = [
    cant("Disponible", "disponible"), cant("Reservado", "reservado"), cant("Cuarentena", "cuarentena"), cant("En tránsito", "transito"),
    cant("Físico", "fisico"), cant("Virtual", "virtual"),
    { titulo: "Terceros", peso: 5.8, cant: "terceros", valor: (f) => f.terceros },
    { titulo: "Terceros por estado", peso: 11, valor: (f) => textoTercerosEstados(f.tercerosEstados) },
  ];
  if (vista === "PRODUCTO") return [...base, ...cantidades, { titulo: "Situación", peso: 5.5, valor: (f) => NIVEL[f.nivel] }];
  return [
    ...base,
    { titulo: "Depósito", peso: 8, valor: (f) => f.deposito },
    { titulo: "Lote", peso: 4.5, valor: (f) => f.lote },
    { titulo: "Vencimiento", peso: 6, valor: (f) => f.fechaVencimiento },
    { titulo: "Propiedad", peso: 6.5, valor: (f) => TEXTO_PROPIEDAD[f.propiedad] ?? "" },
    ...cantidades,
  ];
}

/** Fila de totales: la misma que muestra la pantalla, en las dos vistas (propio y terceros en columnas separadas). */
export function filasTotales(r: StockGeneralRespuesta): { etiqueta: string; valores: Record<string, number>; texto: string }[] {
  const t = r.totales;
  return [{
    etiqueta: "TOTAL",
    valores: { disponible: t.disponible, reservado: t.reservado, cuarentena: t.cuarentena, transito: t.transito, fisico: t.fisico, virtual: t.virtual, terceros: t.terceros },
    texto: textoTercerosEstados(t.tercerosPorEstado),
  }];
}

export function nombreArchivo(r: StockGeneralRespuesta, ext: string) {
  const slug = r.empresa.nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30);
  return `Stock_General_${r.filtros.vista === "PRODUCTO" ? "Producto" : "Detalle"}_${slug}_${r.sello}.${ext}`;
}

const filaTotal = (cols: Col[], etiqueta: string, valores: Record<string, number>, texto: string) =>
  cols.map((c, i) => (i === 0 ? etiqueta : c.cant ? valores[c.cant] : c.titulo === "Terceros por estado" ? texto : ""));

export function generarXlsx(r: StockGeneralRespuesta): Buffer {
  const cols = columnas(r.filtros.vista);
  const cabecera: CeldaXlsx[][] = [
    ["Reporte: Stock general"], [`Empresa: ${r.empresa.nombre}`], [`Generado: ${r.generado} (hora de Asunción)`],
    ...describirFiltros(r).map((l) => [l]), [],
  ];
  const totales = filasTotales(r).map((t) => filaTotal(cols, t.etiqueta, t.valores, t.texto));
  const filas: CeldaXlsx[][] = [
    ...cabecera,
    cols.map((c) => c.titulo),
    ...r.filas.map((f) => cols.map((c) => c.valor(f))),
    ...totales,
    [], ...r.cobertura.map((n) => [n]),
  ];
  const iEnc = cabecera.length;
  const iTot = iEnc + 1 + r.filas.length;
  return generarXlsxSimple({
    hoja: "Stock general",
    filas,
    anchos: cols.map((c) => Math.max(10, Math.round(c.peso * 2.2))),
    negritaFilas: [0, iEnc, ...totales.map((_, i) => iTot + i)],
    inmovilizarHasta: iEnc + 1,
  });
}

export function generarPdfStock(r: StockGeneralRespuesta): Buffer {
  const cols = columnas(r.filtros.vista);
  const columnasPdf: ColumnaPdf[] = cols.map((c) => ({ titulo: c.titulo, peso: c.peso, derecha: !!c.cant }));
  const txt = (c: Col, v: string | number) => (typeof v === "number" ? fmtNum(v) : v);
  // En el PDF la etiqueta del total va en la columna Descripción (más ancha) para que no se recorte.
  const totales = filasTotales(r).map((t) => {
    const fila = filaTotal(cols, "", t.valores, t.texto).map((v, i) => txt(cols[i], v));
    fila[2] = t.etiqueta;
    return fila;
  });
  const filtros = describirFiltros(r).join("   ·   ");
  return generarPdf({
    titulo: "Stock general",
    lineas: [`Empresa: ${r.empresa.nombre}   ·   Generado: ${r.generado} (hora de Asunción)   ·   Filas: ${fmtNum(r.pagina.totalFilas)}`, filtros],
    columnas: columnasPdf,
    filas: r.filas.map((f) => cols.map((c) => txt(c, c.valor(f)))),
    totales: totales[0],
    totalesExtra: totales.slice(1),
    notas: r.cobertura,
  });
}
