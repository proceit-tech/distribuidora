/**
 * INV-04 — aritmética decimal EXACTA sobre texto (BigInt), para importes de inventario que vienen de PostgreSQL `numeric`: nunca float8/Number.
 * Funciones puras. Soportan signo; el resultado se devuelve canónico («12.5», «0», «-3.25»).
 */
type Dec = { n: bigint; escala: number };

function parsear(texto: string): Dec | null {
  const m = /^(-)?(\d+)(?:\.(\d*))?$/.exec(texto.trim());

  if (!m) return null;

  const frac = m[3] ?? "";
  const n = BigInt(`${m[2]}${frac}`);

  return { n: m[1] ? -n : n, escala: frac.length };
}

function aTexto(d: Dec, fijo = false): string {
  const neg = d.n < BigInt(0);
  const abs = (neg ? -d.n : d.n).toString().padStart(d.escala + 1, "0");
  const entera = abs.slice(0, abs.length - d.escala);
  const fracCompleta = abs.slice(abs.length - d.escala);
  const frac = fijo ? fracCompleta : fracCompleta.replace(/0+$/, "");
  const cuerpo = frac ? `${entera}.${frac}` : entera;

  return neg && cuerpo !== "0" ? `-${cuerpo}` : cuerpo;
}

const ajustar = (d: Dec, escala: number): bigint => d.n * BigInt(10) ** BigInt(escala - d.escala);

/** Suma exacta; los textos no numéricos se ignoran como 0. Lista vacía → «0». */
export function sumarDecimales(valores: Array<string | null | undefined>): string {
  const ds = valores.map((v) => (v == null ? null : parsear(v))).filter((d): d is Dec => d !== null);
  const escala = ds.reduce((a, d) => Math.max(a, d.escala), 0);

  return aTexto({ n: ds.reduce((a, d) => a + ajustar(d, escala), BigInt(0)), escala });
}

/** Producto exacto; si algún factor no es numérico → null. */
export function multiplicarDecimales(a: string | null | undefined, b: string | null | undefined): string | null {
  const x = a == null ? null : parsear(a);
  const y = b == null ? null : parsear(b);

  if (!x || !y) return null;

  return aTexto({ n: x.n * y.n, escala: x.escala + y.escala });
}

/** Redondeo «mitad hacia arriba» (en valor absoluto) a `decimales` posiciones, sobre texto. null si no es numérico. */
export function redondearDecimal(texto: string, decimales: number): string | null {
  const d = parsear(texto);

  if (!d) return null;
  if (d.escala <= decimales) return aTexto({ n: d.n * BigInt(10) ** BigInt(decimales - d.escala), escala: decimales }, true);

  const neg = d.n < BigInt(0);
  const abs = neg ? -d.n : d.n;
  const factor = BigInt(10) ** BigInt(d.escala - decimales);
  let q = abs / factor;

  if ((abs % factor) * BigInt(2) >= factor) q += BigInt(1);

  return aTexto({ n: neg ? -q : q, escala: decimales }, true);
}

/**
 * Importe es-PY sin pérdida: «Gs. 1.234.567» (PYG sin decimales) u otras monedas «USD 1.234,50». Solo agrupa y redondea sobre texto. Entrada inválida → «—».
 */
export function formatearMontoTexto(texto: string | null | undefined, moneda?: string | null): string {
  const codigo = (moneda ?? "").trim().toUpperCase();
  const pyg = codigo === "" || codigo === "PYG" || codigo === "GS" || codigo === "GS.";
  const r = texto == null ? null : redondearDecimal(texto, pyg ? 0 : 2);

  if (r === null) return "—";

  const neg = r.startsWith("-");
  const [entera, frac] = (neg ? r.slice(1) : r).split(".");
  const miles = entera.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const cuerpo = `${neg ? "-" : ""}${miles}${frac ? `,${frac}` : ""}`;

  return pyg ? `Gs. ${cuerpo}` : `${codigo} ${cuerpo}`;
}
