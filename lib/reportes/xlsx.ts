import { deflateRawSync } from "node:zlib";

// Escritor XLSX mínimo (sin dependencias): una hoja, textos en línea, números reales, encabezado en negrita,
// panel inmovilizado y anchos de columna. Zip con deflate de Node. Verificado con openpyxl.

export type CeldaXlsx = string | number | null | undefined;

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(archivos: { nombre: string; datos: Buffer }[]) {
  const partes: Buffer[] = [];
  const central: Buffer[] = [];
  let pos = 0;
  for (const a of archivos) {
    const nombre = Buffer.from(a.nombre, "utf8");
    const comp = deflateRawSync(a.datos);
    const crc = crc32(a.datos);
    const cab = Buffer.alloc(30);
    cab.writeUInt32LE(0x04034b50, 0); cab.writeUInt16LE(20, 4); cab.writeUInt16LE(0x0800, 6); cab.writeUInt16LE(8, 8);
    cab.writeUInt16LE(0, 10); cab.writeUInt16LE(0x21, 12); cab.writeUInt32LE(crc, 14); cab.writeUInt32LE(comp.length, 18);
    cab.writeUInt32LE(a.datos.length, 22); cab.writeUInt16LE(nombre.length, 26); cab.writeUInt16LE(0, 28);
    partes.push(cab, nombre, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20);
    c.writeUInt32LE(a.datos.length, 24); c.writeUInt16LE(nombre.length, 28); c.writeUInt32LE(pos, 42);
    central.push(c, nombre);
    pos += cab.length + nombre.length + comp.length;
  }
  const dirCentral = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(archivos.length, 8); fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(dirCentral.length, 12); fin.writeUInt32LE(pos, 16);
  return Buffer.concat([...partes, dirCentral, fin]);
}

const esc = (s: string) =>
  s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function ref(col: number, fila: number) {
  let s = "";
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return `${s}${fila}`;
}

/** `negritaFilas`: índices (base 0) de filas a resaltar en negrita; `inmovilizarHasta`: fila (base 1) bajo la cual se fija el panel. */
export function generarXlsxSimple(opts: {
  hoja: string;
  filas: CeldaXlsx[][];
  anchos?: number[];
  negritaFilas?: number[];
  inmovilizarHasta?: number;
}): Buffer {
  const negrita = new Set(opts.negritaFilas ?? []);
  const xmlFilas = opts.filas.map((fila, i) => {
    const celdas = fila.map((v, j) => {
      if (v === null || v === undefined || v === "") return "";
      const s = negrita.has(i) ? ' s="1"' : "";
      return typeof v === "number" && Number.isFinite(v)
        ? `<c r="${ref(j, i + 1)}"${s}><v>${v}</v></c>`
        : `<c r="${ref(j, i + 1)}" t="inlineStr"${s}><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
    });
    return `<row r="${i + 1}">${celdas.join("")}</row>`;
  });
  const cols = opts.anchos?.length
    ? `<cols>${opts.anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const panel = opts.inmovilizarHasta
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${opts.inmovilizarHasta}" topLeftCell="A${opts.inmovilizarHasta + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : "";
  const hoja = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${panel}${cols}<sheetData>${xmlFilas.join("")}</sheetData></worksheet>`;
  const b = (s: string) => Buffer.from(s, "utf8");
  const nombreHoja = esc(opts.hoja.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
  return zip([
    { nombre: "[Content_Types].xml", datos: b(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`) },
    { nombre: "_rels/.rels", datos: b(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { nombre: "xl/workbook.xml", datos: b(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${nombreHoja}" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { nombre: "xl/_rels/workbook.xml.rels", datos: b(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { nombre: "xl/styles.xml", datos: b(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`) },
    { nombre: "xl/worksheets/sheet1.xml", datos: b(hoja) },
  ]);
}
