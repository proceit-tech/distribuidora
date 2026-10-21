/**
 * Reportes — serialización XLSX/PDF compartida (RPT-R03-01 / RPT-R03-02). Genera archivos XLSX REALES, los abre con un lector mínimo del ZIP
 * (directorio central + inflate) y compara el XML interno celda a celda (tipo y valor) con los datos de la API; no basta con verificar la cabecera «PK».
 * Incluye compatibilidad de los cinco relatórios que usan `export.ts`. Sin PostgreSQL ni navegador.
 */
import { inflateRawSync } from "node:zlib";

import { contador } from "@/lib/clientes/contador-casos";
import { celdaXlsx, generarPdfTabla, generarXlsxTabla, numeroOTexto, type Celda, type ColRep, type TablaReporte } from "@/lib/reportes/export";
import { COLUMNAS_KARDEX, columnasResumen } from "@/lib/reportes/export-kardex";
import { columnasLotes } from "@/lib/reportes/export-lotes";
import { columnas as columnasStockGeneral } from "@/lib/reportes/export-stock-general";
import { columnasStockCritico } from "@/lib/reportes/export-stock-critico";
import { tablaValorizacion } from "@/lib/reportes/export-valorizacion";
import type { ConteoSituaciones, ValorizacionFila, ValorizacionRespuesta } from "@/types/reportes";

type CeldaLeida = { tipo: "n" | "s"; valor: string };

/** Lector mínimo de XLSX: ZIP (directorio central) → xl/worksheets/sheet1.xml → celdas {ref → tipo/valor}. */
export function leerHojaXlsx(buf: Buffer): Map<string, CeldaLeida> {
  let eocd = -1;

  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("XLSX sin directorio central");

  const total = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  const archivos = new Map<string, Buffer>();

  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error("directorio central corrupto");

    const metodo = buf.readUInt16LE(pos + 10), comp = buf.readUInt32LE(pos + 20), lonNombre = buf.readUInt16LE(pos + 28), lonExtra = buf.readUInt16LE(pos + 30), lonCom = buf.readUInt16LE(pos + 32), local = buf.readUInt32LE(pos + 42);
    const nombre = buf.subarray(pos + 46, pos + 46 + lonNombre).toString("utf8");
    const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const datos = buf.subarray(inicio, inicio + comp);

    archivos.set(nombre, metodo === 8 ? inflateRawSync(datos) : datos);
    pos += 46 + lonNombre + lonExtra + lonCom;
  }

  const xml = archivos.get("xl/worksheets/sheet1.xml")?.toString("utf8");

  if (!xml) throw new Error("XLSX sin hoja 1");

  const des = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const celdas = new Map<string, CeldaLeida>();

  for (const m of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*)>(.*?)<\/c>/g)) {
    const texto = /<t[^>]*>([\s\S]*?)<\/t>/.exec(m[3]);
    const num = /<v>([\s\S]*?)<\/v>/.exec(m[3]);

    celdas.set(m[1], texto ? { tipo: "s", valor: des(texto[1]) } : { tipo: "n", valor: num ? num[1] : "" });
  }

  return celdas;
}

const col = (i: number) => String.fromCharCode(65 + i); // las tablas de prueba tienen < 26 columnas

/** Celdas de datos y de totales de una tabla, en el orden en que `generarXlsxTabla` las escribe. */
function posiciones(t: TablaReporte) {
  const cabecera = 1 + 1 + 1 + t.filtros.length + 1; // título, empresa, generado, filtros, fila vacía
  const filaEnc = cabecera + 1;

  return { filaEnc, primera: filaEnc + 1, totales: filaEnc + 1 + t.filas.length };
}

const textoPdf = (b: Buffer): string[] => [...b.toString("latin1").matchAll(/\(((?:[^()\\]|\\.)*)\) Tj/g)].map((m) => m[1].replace(/\\(.)/g, "$1"));

export async function verificarCasosExportacionXlsx(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── Conversor único: dinero y cantidades (texto numeric estricto)
  const cDin: ColRep = { titulo: "d", peso: 1, tipo: "dinero" }, cCan: ColRep = { titulo: "c", peso: 1, tipo: "cantidad" }, cTxt: ColRep = { titulo: "t", peso: 1, tipo: "texto" };

  igual("R03-01 cantidades en texto numeric: fraccionarias, enteras, cero, negativas → número real; más de 15 dígitos → texto exacto; sin dato → vacío", [
    celdaXlsx(cCan, "10.5000"), celdaXlsx(cCan, "3"), celdaXlsx(cCan, "0"), celdaXlsx(cCan, "0.0000"), celdaXlsx(cCan, "-2.25"), celdaXlsx(cCan, "123456789012345.1234"), celdaXlsx(cCan, "999999999999999"), celdaXlsx(cCan, null), celdaXlsx(cCan, 12.5), celdaXlsx(cCan, 0),
  ], [10.5, 3, 0, 0, -2.25, "123456789012345.1234", 999999999999999, "", 12.5, 0]);
  igual("R03-02 «n/a» y demás textos no numéricos se conservan como texto (nunca NaN) en dinero y en cantidad; null monetario → «—»", [
    celdaXlsx(cDin, "n/a"), celdaXlsx(cCan, "n/a"), celdaXlsx(cDin, "—"), celdaXlsx(cDin, null), celdaXlsx(cDin, ""), celdaXlsx(cDin, "abc"), celdaXlsx(cDin, "1e5"), celdaXlsx(cDin, "1,5"), celdaXlsx(cDin, "Infinity"), celdaXlsx(cDin, "NaN"),
  ], ["n/a", "n/a", "—", "—", "—", "abc", "1e5", "1,5", "Infinity", "NaN"]);
  igual("dinero numérico: corto → número; 14 enteros + 4 decimales → texto exacto; negativo y fracción", [celdaXlsx(cDin, "500.0000"), celdaXlsx(cDin, "99999999999999.9999"), celdaXlsx(cDin, "-1234.5"), celdaXlsx(cDin, "0.0001"), numeroOTexto("12"), celdaXlsx(cTxt, null), celdaXlsx(cTxt, "x")], [500, "99999999999999.9999", -1234.5, 0.0001, 12, "", "x"]);

  // ── Valorización: XLSX real vs datos de la API
  const k = (p: Partial<ConteoSituaciones>): ConteoSituaciones => ({ CON_COSTO: 0, PARCIAL: 0, SIN_COSTO: 0, EXCEDENTE: 0, RESIDUO: 0, SIN_STOCK: 0, ...p });
  const f = (e: Partial<ValorizacionFila>): ValorizacionFila => ({
    clave: "k", codigo: "P", descripcion: "Producto", categoria: "Cat", familia: "Fam", deposito: "Central", depositoInactivo: false, unidad: "Kg", productos: 1, depositos: 1,
    fisico: "10.5000", cantidadValorizada: "10.5000", sinValorizar: "0", excedente: "0", costoPromedio: "50.0000", valorTotal: "525.0000", moneda: "PYG", situacionCosto: "CON_COSTO", conteos: k({ CON_COSTO: 1 }), ...e,
  });
  const resp = (vista: ValorizacionRespuesta["filtros"]["vista"], filas: ValorizacionFila[]): ValorizacionRespuesta => ({
    empresa: { nombre: "Empresa SA", moneda: "PYG" }, generado: "13/10/2026 10:00", sello: "20261013-1000",
    filtros: { vista, q: "", depositoId: "", categoriaId: "", familiaId: "", existencia: "CON", costo: "TODOS", cobertura: "TODOS" },
    pagina: { numero: 1, tamano: 50, totalFilas: filas.length }, filas,
    totales: {
      filas: 4, productos: 3, depositos: 2, productosConCosto: 2, valorTotal: "99999999999999.9999", conteos: k({ CON_COSTO: 2, PARCIAL: 1, SIN_COSTO: 1 }),
      valorPorSituacion: { CON_COSTO: "525", PARCIAL: "10", SIN_COSTO: "0", EXCEDENTE: "0", RESIDUO: "0", SIN_STOCK: "0" }, inactivos: { filas: 0, valor: "0" }, moneda: "PYG",
    },
    catalogos: { depositos: [{ id: "d", nombre: "Central", activo: true }], categorias: [], familias: [] }, cobertura: ["nota"],
  });
  const filasDet: ValorizacionFila[] = [
    f({ clave: "1" }),
    f({ clave: "2", codigo: "Q", descripcion: "Producto fraccionado", fisico: "123456789012345.1234", cantidadValorizada: "0.0001", sinValorizar: "123456789012345.1233", excedente: "0", costoPromedio: "0.3333", valorTotal: "0.0001", situacionCosto: "PARCIAL", conteos: k({ PARCIAL: 1 }) }),
    f({ clave: "3", codigo: "R", descripcion: "Sin costo", fisico: "7", cantidadValorizada: "0", sinValorizar: "7", costoPromedio: null, valorTotal: null, situacionCosto: "SIN_COSTO", conteos: k({ SIN_COSTO: 1 }) }),
    f({ clave: "4", codigo: "S", descripcion: "Excedente", fisico: "2", cantidadValorizada: "5.5", sinValorizar: "0", excedente: "3.5", costoPromedio: "99999999999999.9999", valorTotal: "-12.5", situacionCosto: "EXCEDENTE", conteos: k({ EXCEDENTE: 1 }) }),
  ];
  const det = tablaValorizacion(resp("DETALLE", filasDet));
  const hojaDet = leerHojaXlsx(generarXlsxTabla(det));
  const pos = posiciones(det);
  const iCol = (t: TablaReporte, titulo: string) => t.columnas.findIndex((c) => c.titulo === titulo);
  const celda = (h: Map<string, CeldaLeida>, c: number, fila: number) => h.get(`${col(c)}${fila}`);

  igual("R03-01 DETALLE (XLSX real): encabezados de columna presentes en la fila de títulos", det.columnas.map((c, i) => celda(hojaDet, i, pos.filaEnc)?.valor), det.columnas.map((c) => c.titulo));

  const esperadoNumero = (texto: string | null): CeldaLeida | undefined => (texto === null ? undefined : /^-?\d+(\.\d+)?$/.test(texto) && texto.replace(/[-.]/g, "").length <= 15 ? { tipo: "n", valor: String(Number(texto)) } : { tipo: "s", valor: texto });
  const comparar = (nombre: string, tabla: TablaReporte, hoja: Map<string, CeldaLeida>, filas: ValorizacionFila[], campos: Array<[string, (x: ValorizacionFila) => string | null, "cantidad" | "dinero"]>) => {
    const p = posiciones(tabla);

    for (const [titulo, valor, tipo] of campos) {
      const ci = iCol(tabla, titulo);

      filas.forEach((x, i) => {
        const v = valor(x);
        const real = celda(hoja, ci, p.primera + i);
        const esp = v === null ? (tipo === "dinero" ? { tipo: "s", valor: "—" } : { tipo: "s", valor: "n/a" }) : esperadoNumero(v);

        igual(`${nombre} · «${titulo}» fila ${i + 1} = dato de la API (${v === null ? "sin dato" : v})`, real, esp);
      });
    }
  };

  comparar("R03-01 DETALLE", det, hojaDet, filasDet, [
    ["Stock físico propio", (x) => x.fisico, "cantidad"], ["Cantidad valorizada", (x) => x.cantidadValorizada, "cantidad"], ["Sin valorizar", (x) => x.sinValorizar, "cantidad"], ["Excedente valorizado", (x) => x.excedente, "cantidad"],
    ["Costo promedio unit.", (x) => x.costoPromedio, "dinero"], ["Valor total", (x) => x.valorTotal, "dinero"],
  ]);

  const tot = pos.totales;

  igual("R03-02 DETALLE: fila TOTAL GENERAL — cantidades y costo unitario «n/a» como TEXTO (no NaN), valor total exacto", [
    celda(hojaDet, iCol(det, "Stock físico propio"), tot), celda(hojaDet, iCol(det, "Costo promedio unit."), tot), celda(hojaDet, iCol(det, "Valor total"), tot), celda(hojaDet, 0, tot),
  ], [{ tipo: "s", valor: "n/a" }, { tipo: "s", valor: "n/a" }, { tipo: "s", valor: "99999999999999.9999" }, { tipo: "s", valor: "TOTAL GENERAL" }]);
  igual("R03-01 DETALLE: valor monetario 525 → número 525; texto largo preservado; ningún «NaN», «undefined» ni celda de cantidad vacía donde hay dato", [
    celda(hojaDet, iCol(det, "Valor total"), pos.primera), [...hojaDet.values()].some((c) => /NaN|undefined|Infinity/.test(c.valor)),
    [0, 1, 2, 3].every((i) => celda(hojaDet, iCol(det, "Stock físico propio"), pos.primera + i)?.valor),
  ], [{ tipo: "n", valor: "525" }, false, true]);

  // PRODUCTO
  const filasProd: ValorizacionFila[] = [f({ clave: "p1", depositos: 2, fisico: "15.5", cantidadValorizada: "12", sinValorizar: "3.5", excedente: "0", costoPromedio: "10.0000", valorTotal: "120", situacionCosto: "PARCIAL", conteos: k({ CON_COSTO: 1, PARCIAL: 1 }) }), f({ clave: "p2", fisico: "0", cantidadValorizada: "0", sinValorizar: "0", costoPromedio: null, valorTotal: "0", situacionCosto: "SIN_STOCK", conteos: k({ SIN_STOCK: 1 }) })];
  const prod = tablaValorizacion(resp("PRODUCTO", filasProd));
  const hojaProd = leerHojaXlsx(generarXlsxTabla(prod));

  comparar("R03-01 PRODUCTO", prod, hojaProd, filasProd, [
    ["Stock físico propio", (x) => x.fisico, "cantidad"], ["Cantidad valorizada", (x) => x.cantidadValorizada, "cantidad"], ["Sin valorizar", (x) => x.sinValorizar, "cantidad"], ["Costo promedio unit.", (x) => x.costoPromedio, "dinero"], ["Valor total", (x) => x.valorTotal, "dinero"],
  ]);
  igual("R03-01 PRODUCTO: cero se escribe como número 0 (no vacío) y los depósitos como número; total «n/a» como texto", [
    celda(hojaProd, iCol(prod, "Stock físico propio"), posiciones(prod).primera + 1), celda(hojaProd, iCol(prod, "Depósitos"), posiciones(prod).primera), celda(hojaProd, iCol(prod, "Cantidad valorizada"), posiciones(prod).totales),
  ], [{ tipo: "n", valor: "0" }, { tipo: "n", valor: "2" }, { tipo: "s", valor: "n/a" }]);

  // DEPOSITO y CATEGORIA: sin cantidades; dinero y conteos exactos
  for (const vista of ["DEPOSITO", "CATEGORIA"] as const) {
    const filas = [f({ clave: "g", productos: 3, depositos: 2, fisico: null, cantidadValorizada: null, sinValorizar: null, excedente: null, costoPromedio: null, valorTotal: "800.5000", conteos: k({ CON_COSTO: 1, PARCIAL: 1, SIN_COSTO: 1 }) })];
    const t = tablaValorizacion(resp(vista, filas));
    const h = leerHojaXlsx(generarXlsxTabla(t));
    const p = posiciones(t);

    igual(`R03-01 ${vista}: valor 800.5 y conteos como números; total con dinero exacto; sin columnas de cantidad`, [
      celda(h, iCol(t, "Valor total"), p.primera), celda(h, iCol(t, "Parcial"), p.primera), celda(h, iCol(t, "Sin costo"), p.primera), celda(h, iCol(t, "Valor total"), p.totales), t.columnas.some((c) => /físico|valorizada|Costo promedio/i.test(c.titulo)),
    ], [{ tipo: "n", valor: "800.5" }, { tipo: "n", valor: "1" }, { tipo: "n", valor: "1" }, { tipo: "s", valor: "99999999999999.9999" }, false]);
  }

  // PDF equivalente (mismos valores formateados es-PY, «n/a» presente)
  const pdf = textoPdf(generarPdfTabla(det));

  cierto("R03 PDF de Valorización: muestra cantidades exactas (10,5), el valor grande exacto, «n/a» y «—» sin NaN", pdf.includes("10,5") && pdf.includes("123.456.789.012.345,1234") && pdf.includes("99.999.999.999.999,9999") && pdf.includes("n/a") && pdf.includes("\u0097") && !pdf.some((s) => /NaN/.test(s)));

  // ── Compatibilidad de los otros cuatro relatórios (columnas reales, valores típicos de cada contrato)
  const sintetica = (nombre: string, columnas: ColRep[]): TablaReporte => ({
    titulo: nombre, hoja: "Hoja", nombreBase: nombre, empresa: "Empresa SA", generado: "13/10/2026 10:00", sello: "20261013-1000", filtros: ["Filtro: x"], totalFilas: 3, columnas,
    filas: [0, 1, 2].map((r) => columnas.map((c): Celda => (c.tipo === "texto" ? `t${r}` : c.tipo === "cantidad" ? [12.5, 0, 1234567][r] : ["1500.5000", null, "99999999999999.9999"][r]))),
    totales: [{ etiqueta: "TOTAL", celdas: columnas.map((c): Celda => (c.tipo === "texto" ? "" : c.tipo === "cantidad" ? 99 : "7.5")) }], colEtiquetaPdf: 0, notas: ["n"],
  });
  const defs: Array<[string, ColRep[]]> = [
    ["Stock general PRODUCTO", columnasStockGeneral("PRODUCTO").map((c) => ({ titulo: c.titulo, peso: c.peso, tipo: c.cant ? "cantidad" : "texto" }))],
    ["Stock general DETALLE", columnasStockGeneral("DETALLE").map((c) => ({ titulo: c.titulo, peso: c.peso, tipo: c.cant ? "cantidad" : "texto" }))],
    ["Kardex detalle", COLUMNAS_KARDEX.map(({ titulo, peso, tipo }) => ({ titulo, peso, tipo }))],
    ["Kardex resumen", columnasResumen(true).map(({ titulo, peso, tipo }) => ({ titulo, peso, tipo }))],
    ["Stock crítico PRODUCTO", columnasStockCritico({ vista: "PRODUCTO" } as never).map(({ titulo, peso, tipo }) => ({ titulo, peso, tipo }))],
    ["Stock crítico DEPOSITO", columnasStockCritico({ vista: "DEPOSITO" } as never).map(({ titulo, peso, tipo }) => ({ titulo, peso, tipo }))],
    ["Lotes LOTE", columnasLotes("LOTE").map(({ titulo, peso, tipo }) => ({ titulo, peso, tipo }))],
    ["Lotes DEPOSITO", columnasLotes("DEPOSITO").map(({ titulo, peso, tipo }) => ({ titulo, peso, tipo }))],
  ];

  for (const [nombre, columnas] of defs) {
    const t = sintetica(nombre, columnas);
    const h = leerHojaXlsx(generarXlsxTabla(t));
    const p = posiciones(t);
    const detalle: string[] = [];

    columnas.forEach((c, ci) => {
      for (let r = 0; r < 3; r++) {
        const v = t.filas[r][ci];
        const real = celda(h, ci, p.primera + r);
        const esp: CeldaLeida | undefined =
          c.tipo === "texto" ? { tipo: "s", valor: String(v) } : c.tipo === "cantidad" ? { tipo: "n", valor: String(v) } : v === null ? { tipo: "s", valor: "—" } : v === "99999999999999.9999" ? { tipo: "s", valor: v } : { tipo: "n", valor: String(Number(v)) };

        if (JSON.stringify(real) !== JSON.stringify(esp)) detalle.push(`${c.titulo}[${r}] esperado ${JSON.stringify(esp)} obtenido ${JSON.stringify(real)}`);
      }
    });
    igual(`Compatibilidad ${nombre}: ${columnas.length} columnas — cantidades numéricas (12,5 · 0 · 1234567) y dinero (1500.5 · «—» · valor largo exacto) idénticos al contrato anterior`, detalle, []);
    cierto(`Compatibilidad ${nombre}: sin NaN y PDF generado`, ![...h.values()].some((c) => /NaN/.test(c.valor)) && generarPdfTabla(t).subarray(0, 5).toString() === "%PDF-");
  }

  igual("Compatibilidad: una cantidad ausente (null) en Stock crítico sigue siendo celda vacía (sin dato), no «n/a» ni cero", (() => {
    const t = sintetica("x", [{ titulo: "c", peso: 1, tipo: "cantidad" }]);

    t.filas[0][0] = null;

    return leerHojaXlsx(generarXlsxTabla(t)).get(`A${posiciones(t).primera}`) ?? "vacía";
  })(), "vacía");

  return fallos;
}
