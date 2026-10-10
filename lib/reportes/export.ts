import { fmtDinero, fmtNum } from "@/lib/reportes/formato";
import { generarPdf } from "@/lib/reportes/pdf";
import { generarXlsxSimple, type CeldaXlsx } from "@/lib/reportes/xlsx";

// Exportación común de los reportes (Excel y PDF). Cada reporte arma una TablaReporte con las mismas filas, filtros y
// totales que muestra la pantalla; aquí solo se decide cómo se escribe cada celda en cada formato.

export type TipoCol = "texto" | "cantidad" | "dinero";
export type ColRep = { titulo: string; peso: number; tipo: TipoCol };
/** texto → string; cantidad → number; dinero → string numérico exacto de PostgreSQL (null = sin dato, se muestra "—"). */
export type Celda = string | number | null;
export type FilaTotal = { etiqueta: string; celdas: Celda[] };

export type TablaReporte = {
  titulo: string;
  hoja: string;
  nombreBase: string;
  empresa: string;
  generado: string;
  sello: string;
  filtros: string[];
  totalFilas: number;
  columnas: ColRep[];
  filas: Celda[][];
  totales: FilaTotal[];
  /** Columna del PDF donde se escribe la etiqueta de los totales (una columna ancha, para que no se recorte). */
  colEtiquetaPdf: number;
  notas: string[];
};

const textoCelda = (c: ColRep, v: Celda): string => {
  if (c.tipo === "dinero") return fmtDinero(v as string | null);
  if (c.tipo === "cantidad") return typeof v === "number" ? fmtNum(v) : "";
  return v === null || v === undefined ? "" : String(v);
};

// Excel: los importes se escriben como número real cuando caben sin perder precisión (≤ 15 dígitos); si no, como texto exacto.
const celdaXlsx = (c: ColRep, v: Celda): CeldaXlsx => {
  if (c.tipo === "dinero") {
    if (v === null || v === undefined || v === "") return "—";
    const s = String(v);
    return s.replace(/[-.]/g, "").length <= 15 ? Number(s) : s;
  }
  if (c.tipo === "cantidad") return typeof v === "number" ? v : "";
  return v === null || v === undefined ? "" : String(v);
};

export function nombreArchivo(t: TablaReporte, ext: string) {
  const slug = t.empresa.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30);
  return `${t.nombreBase}_${slug}_${t.sello}.${ext}`;
}

export function generarXlsxTabla(t: TablaReporte): Buffer {
  const cabecera: CeldaXlsx[][] = [
    [`Reporte: ${t.titulo}`], [`Empresa: ${t.empresa}`], [`Generado: ${t.generado} (hora de Asunción)`],
    ...t.filtros.map((l) => [l]), [],
  ];
  const totales = t.totales.map((f) => t.columnas.map((c, i) => (i === 0 ? f.etiqueta : celdaXlsx(c, f.celdas[i]))));
  const filas: CeldaXlsx[][] = [
    ...cabecera,
    t.columnas.map((c) => c.titulo),
    ...t.filas.map((f) => t.columnas.map((c, i) => celdaXlsx(c, f[i]))),
    ...totales,
    [], ...t.notas.map((n) => [n]),
  ];
  const iEnc = cabecera.length;
  const iTot = iEnc + 1 + t.filas.length;
  return generarXlsxSimple({
    hoja: t.hoja,
    filas,
    anchos: t.columnas.map((c) => Math.max(10, Math.round(c.peso * 2.2))),
    negritaFilas: [0, iEnc, ...totales.map((_, i) => iTot + i)],
    inmovilizarHasta: iEnc + 1,
  });
}

export function generarPdfTabla(t: TablaReporte): Buffer {
  const filasTot = t.totales.map((f) => {
    const fila = t.columnas.map((c, i) => textoCelda(c, f.celdas[i]));
    fila[t.colEtiquetaPdf] = f.etiqueta;
    return fila;
  });
  return generarPdf({
    titulo: t.titulo,
    lineas: [`Empresa: ${t.empresa}   ·   Generado: ${t.generado} (hora de Asunción)   ·   Filas: ${fmtNum(t.totalFilas)}`, t.filtros.join("   ·   ")],
    columnas: t.columnas.map((c) => ({ titulo: c.titulo, peso: c.peso, derecha: c.tipo !== "texto" })),
    filas: t.filas.map((f) => t.columnas.map((c, i) => textoCelda(c, f[i]))),
    totales: filasTot[0],
    totalesExtra: filasTot.slice(1),
    notas: t.notas,
  });
}
