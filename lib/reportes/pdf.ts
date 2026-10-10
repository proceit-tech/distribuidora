// Generador PDF mínimo (sin dependencias): tablas en A4 horizontal con Helvetica estándar (WinAnsi).
// Suficiente para reportes tabulares; se valida con un lector PDF real en las pruebas.

const W = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,
  667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,
  556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];

const CP1252: Record<string, number> = { "…": 0x85, "–": 0x96, "—": 0x97, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "€": 0x80 };

export function anchoTexto(t: string, size: number, negrita = false) {
  let w = 0;
  for (const ch of t) {
    const c = ch.charCodeAt(0);
    w += c >= 32 && c <= 126 ? W[c - 32] : 556;
  }
  return (w * size * (negrita ? 1.06 : 1)) / 1000;
}

function bytes(t: string) {
  const out: number[] = [];
  for (const ch of t) {
    const c = ch.charCodeAt(0);
    if (ch === "→") { out.push(0x2d, 0x3e); continue; }
    if (c === 0x28 || c === 0x29 || c === 0x5c) { out.push(0x5c, c); continue; }
    if (c >= 32 && c <= 126) out.push(c);
    else if (c >= 0xa0 && c <= 0xff) out.push(c);
    else if (CP1252[ch] !== undefined) out.push(CP1252[ch]);
    else out.push(0x3f);
  }
  return Buffer.from(out);
}

export function recortar(t: string, ancho: number, size: number, negrita = false) {
  if (anchoTexto(t, size, negrita) <= ancho) return t;
  let s = t;
  while (s.length > 1 && anchoTexto(s + "…", size, negrita) > ancho) s = s.slice(0, -1);
  return s + "…";
}

export type ColumnaPdf = { titulo: string; peso: number; derecha?: boolean };
export type TablaPdf = {
  titulo: string;
  lineas: string[]; // encabezado: empresa, filtros, generado…
  columnas: ColumnaPdf[];
  filas: string[][];
  totales?: string[]; // misma cantidad de columnas que `columnas`
  totalesExtra?: string[][];
  notas: string[];
};

export function generarPdf(t: TablaPdf): Buffer {
  const PW = 842, PH = 595, M = 28, RH = 11.5;
  const anchoUtil = PW - 2 * M;

  // Ajuste automático: se busca la letra más grande (6,2 → 5,0) y el tope de ancho por columna que permitan mostrar
  // los textos completos; solo si no cabe se recorta con "…" (proporcional a los pesos).
  const pesoTotal = t.columnas.reduce((a, c) => a + c.peso, 0);
  let FS = 5;
  let anchos = t.columnas.map((c) => (c.peso / pesoTotal) * anchoUtil);
  buscar: for (let fs = 6.2; fs >= 5; fs -= 0.2) {
    for (const tope of [200, 140, 100, 80, 65, 52]) {
      const nat = t.columnas.map((c, i) => {
        let m = anchoTexto(c.titulo, fs, true);
        for (const f of t.filas) m = Math.max(m, anchoTexto(f[i] ?? "", fs));
        if (t.totales) m = Math.max(m, anchoTexto(t.totales[i] ?? "", fs, true));
        for (const f of t.totalesExtra ?? []) m = Math.max(m, anchoTexto(f[i] ?? "", fs, true));
        return Math.min(m, tope) + 6;
      });
      const suma = nat.reduce((a, b) => a + b, 0);
      if (suma <= anchoUtil) {
        FS = fs;
        anchos = nat.map((w) => (w / suma) * anchoUtil);
        break buscar;
      }
    }
  }

  const paginas: Buffer[][] = [];
  let cur: Buffer[] = [];
  const emit = (s: string | Buffer) => cur.push(typeof s === "string" ? Buffer.from(s, "latin1") : s);
  const texto = (x: number, y: number, s: string, size: number, negrita = false, derechaAncho = 0) => {
    const xx = derechaAncho ? x + derechaAncho - anchoTexto(s, size, negrita) : x;
    emit(`BT /${negrita ? "F2" : "F1"} ${size} Tf ${xx.toFixed(2)} ${y.toFixed(2)} Td (`);
    emit(bytes(s));
    emit(") Tj ET\n");
  };
  const linea = (x1: number, y: number, x2: number, gris = 0.8) => emit(`${gris} G 0.4 w ${x1.toFixed(2)} ${y.toFixed(2)} m ${x2.toFixed(2)} ${y.toFixed(2)} l S\n`);
  const fondo = (x: number, y: number, w: number, h: number, g: number) => emit(`${g} g ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f 0 g\n`);

  const cabeceraTabla = (y: number) => {
    fondo(M, y - 3, anchoUtil, RH, 0.9);
    let x = M;
    t.columnas.forEach((c, i) => {
      texto(x + 2, y, recortar(c.titulo, anchos[i] - 4, FS, true), FS, true, c.derecha ? anchos[i] - 4 : 0);
      x += anchos[i];
    });
  };

  const nuevaPagina = (primera: boolean) => {
    cur = [];
    paginas.push(cur);
    let y = PH - M;
    texto(M, y - 10, t.titulo, 13, true);
    y -= 26;
    if (primera) {
      for (const l of t.lineas) {
        texto(M, y, recortar(l, anchoUtil, 7.5), 7.5);
        y -= 10;
      }
      y -= 4;
    } else y -= 2;
    cabeceraTabla(y);
    return y - RH;
  };

  let y = nuevaPagina(true);
  const filaTexto = (cells: string[], negrita: boolean, gris?: number) => {
    if (gris !== undefined) fondo(M, y - 3, anchoUtil, RH, gris);
    let x = M;
    cells.forEach((v, i) => {
      texto(x + 2, y, recortar(v, anchos[i] - 4, FS, negrita), FS, negrita, t.columnas[i].derecha ? anchos[i] - 4 : 0);
      x += anchos[i];
    });
    linea(M, y - 3, M + anchoUtil, 0.88);
    y -= RH;
  };

  t.filas.forEach((f) => {
    if (y < M + 28) y = nuevaPagina(false);
    filaTexto(f, false);
  });
  if (t.totales) {
    if (y < M + 28) y = nuevaPagina(false);
    filaTexto(t.totales, true, 0.93);
    for (const extra of t.totalesExtra ?? []) {
      if (y < M + 28) y = nuevaPagina(false);
      filaTexto(extra, true, 0.93);
    }
  }
  y -= 6;
  for (const n of t.notas) {
    const partes: string[] = [];
    let resto = `• ${n}`;
    while (resto.length) {
      let corte = resto.length;
      while (corte > 1 && anchoTexto(resto.slice(0, corte), 6.5) > anchoUtil) corte--;
      if (corte < resto.length) { const sp = resto.lastIndexOf(" ", corte); if (sp > 10) corte = sp; }
      partes.push(resto.slice(0, corte).trimEnd());
      resto = resto.slice(corte).trimStart();
    }
    for (const parte of partes) {
      if (y < M + 14) y = nuevaPagina(false);
      texto(M, y, parte, 6.5);
      y -= 8.5;
    }
  }

  // Ensamblado: 1 catálogo, 2 páginas, 3-4 fuentes, luego (página, contenido) por página.
  const total = paginas.length;
  const objs: Buffer[] = [];
  const b = (s: string) => Buffer.from(s, "latin1");
  const kids = paginas.map((_, i) => `${5 + i * 2} 0 R`).join(" ");
  objs.push(b("<< /Type /Catalog /Pages 2 0 R >>"));
  objs.push(b(`<< /Type /Pages /Kids [${kids}] /Count ${total} >>`));
  objs.push(b("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));
  objs.push(b("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"));
  paginas.forEach((contenido, i) => {
    const pie = Buffer.concat([b(`BT /F1 6.5 Tf ${M} 16 Td (`), bytes(`Página ${i + 1} de ${total}`), b(") Tj ET\n")]);
    const stream = Buffer.concat([...contenido, pie]);
    objs.push(b(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`));
    objs.push(Buffer.concat([b(`<< /Length ${stream.length} >>\nstream\n`), stream, b("\nendstream")]));
  });

  const partes: Buffer[] = [b("%PDF-1.4\n")];
  const offs: number[] = [];
  let pos = partes[0].length;
  objs.forEach((o, i) => {
    offs.push(pos);
    const chunk = Buffer.concat([b(`${i + 1} 0 obj\n`), o, b("\nendobj\n")]);
    partes.push(chunk);
    pos += chunk.length;
  });
  const xref = [`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`, ...offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
  partes.push(b(`${xref}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`));
  return Buffer.concat(partes);
}
