/**
 * Presentación VISUAL de importes monetarios. SOLO formatea para mostrar: no se usa para calcular, validar ni enviar nada; el valor interno (payload, cálculo, persistencia, exportación) no cambia.
 *  · PYG (guaraníes; también «Gs», «Gs.», «GS») → sin decimales, con separador de miles (1.234.567).
 *  · USD y BRL → 2 decimales fijos (12,50): ocultar los centavos de una moneda que los usa sería engañoso.
 * El redondeo es por TEXTO decimal (mitad hacia arriba sobre el valor absoluto, así -0,5 → -1), sin pasar por Number, así que un importe largo o con 8 decimales no pierde dígitos ni muestra ruido binario.
 * PRO-335: única semántica visual de dinero del NEXIT. Las cantidades, tasas de cambio, porcentajes y códigos NO pasan por aquí (ver `formatearDecimalExacto`).
 */

export type MonedaVisual = "PYG" | "USD" | "BRL";

const ALIAS_MONEDA: Record<string, MonedaVisual> = {
  PYG: "PYG", GS: "PYG", "GS.": "PYG", "₲": "PYG", GUARANI: "PYG", "GUARANÍ": "PYG", GUARANIES: "PYG", "GUARANÍES": "PYG",
  USD: "USD", "US$": "USD", "U$S": "USD",
  BRL: "BRL", "R$": "BRL",
};

const DECIMALES_MONEDA: Record<MonedaVisual, number> = { PYG: 0, USD: 2, BRL: 2 };

const ETIQUETA_MONEDA: Record<MonedaVisual, string> = { PYG: "Gs.", USD: "USD", BRL: "BRL" };

/** Código canónico de la moneda (alias PYG/Gs/GS incluidos). Una moneda desconocida o ausente → null: nunca se asume PYG ni USD. */
export function normalizarMonedaVisual(moneda: string | null | undefined): MonedaVisual | null {
  if (typeof moneda !== "string") return null;

  return ALIAS_MONEDA[moneda.trim().toUpperCase()] ?? null;
}

/** Decimales visuales de la moneda (PYG 0, USD/BRL 2); null si la moneda es desconocida o falta. */
export function decimalesMonedaVisual(moneda: string | null | undefined): number | null {
  const m = normalizarMonedaVisual(moneda);

  return m === null ? null : DECIMALES_MONEDA[m];
}

type Partes = { negativo: boolean; entero: string; frac: string };

/** Texto decimal canónico de la entrada (texto `numeric` tal cual; un number se escribe con su representación más corta). null si no es un decimal. */
function textoDecimal(valor: string | number): string | null {
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return null;

    const s = String(valor);

    if (!/e/i.test(s)) return s;
    // Notación exponencial (|v| < 1e-6 o ≥ 1e21): se expande sin inventar dígitos significativos.
    return Math.abs(valor) < 1 ? valor.toFixed(20) : BigInt(Math.trunc(valor)).toString();
  }

  return valor.trim();
}

function partesDecimal(valor: string | number): Partes | null {
  const t = textoDecimal(valor);
  const m = t === null ? null : /^(-?)(\d+)(?:\.(\d+))?$/.exec(t);

  if (!m) return null;

  return { negativo: m[1] === "-", entero: m[2], frac: m[3] ?? "" };
}

/** Suma 1 a un entero escrito como texto de dígitos (sin Number ni BigInt). */
function sumarUno(d: string): string {
  const a = d.split("");
  let i = a.length - 1;

  while (i >= 0 && a[i] === "9") {
    a[i] = "0";
    i -= 1;
  }
  if (i < 0) return "1" + a.join("");
  a[i] = String(Number(a[i]) + 1);

  return a.join("");
}

/** Agrupa miles con punto y separa decimales con coma; nunca muestra «-0». */
function componer(negativo: boolean, entero: string, frac: string): string {
  const e = entero.replace(/^0+(?=\d)/, "");
  const esCero = /^0+$/.test(e + frac);

  return (negativo && !esCero ? "-" : "") + e.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (frac !== "" ? "," + frac : "");
}

/** Redondeo «mitad hacia arriba» en valor absoluto a `decimales` posiciones, sobre texto. */
function redondear(p: Partes, decimales: number): string {
  let escalado = p.entero + p.frac.slice(0, decimales).padEnd(decimales, "0");

  if (p.frac.length > decimales && p.frac.charCodeAt(decimales) >= 53) escalado = sumarUno(escalado); // dígito descartado >= 5

  const digitos = escalado.padStart(decimales + 1, "0");

  return componer(p.negativo, digitos.slice(0, digitos.length - decimales), decimales > 0 ? digitos.slice(digitos.length - decimales) : "");
}

/**
 * Decimal EXACTO es-PY (cantidades, tasas, costos técnicos, monedas desconocidas): agrupa miles y quita ceros decimales finales, sin redondear ni pasar por Number.
 * null/undefined/"" → «—»; un texto que no es decimal se devuelve tal cual (no se inventa un valor; p. ej. el código «000123-A»).
 */
export function formatearDecimalExacto(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "—";

  const p = partesDecimal(valor);

  if (!p) return typeof valor === "string" ? valor : "—";

  return componer(p.negativo, p.entero, p.frac.replace(/0+$/, ""));
}

/**
 * PRO-335 — importe MONETARIO visual según la moneda de SU registro: PYG 0 decimales; USD/BRL 2 fijos; sin símbolo (la moneda la muestra la columna o el bloque).
 * Moneda desconocida o ausente → decimal exacto, sin redondear (no se asume PYG ni USD). null/undefined/"" → «—» (ausencia, distinta del 0 real);
 * texto que no es decimal → tal cual. Nunca «-0».
 */
export function formatearImporteMoneda(valor: string | number | null | undefined, moneda: string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "—";

  const p = partesDecimal(valor);

  if (!p) return typeof valor === "string" ? valor : "—";

  const decimales = decimalesMonedaVisual(moneda);

  return decimales === null ? componer(p.negativo, p.entero, p.frac.replace(/0+$/, "")) : redondear(p, decimales);
}

/**
 * Igual que `formatearImporteMoneda`, con la moneda delante: «Gs. 1.234.567», «USD 1.234,50». Una moneda desconocida conserva su código y el valor exacto;
 * sin moneda no se antepone nada. Ausencia o texto inválido sin prefijo (no se rotula como dinero lo que no es un importe).
 */
export function formatearImporteConMoneda(valor: string | number | null | undefined, moneda: string | null | undefined): string {
  const cuerpo = formatearImporteMoneda(valor, moneda);

  if (cuerpo === "—" || valor === null || valor === undefined || !partesDecimal(valor)) return cuerpo;

  const m = normalizarMonedaVisual(moneda);
  const etiqueta = m !== null ? ETIQUETA_MONEDA[m] : (moneda ?? "").trim().toUpperCase();

  return etiqueta ? `${etiqueta} ${cuerpo}` : cuerpo;
}

/**
 * Formato visual de la facturación (contrato previo, conservado): sin moneda se asume PYG (el resumen de Factura/NCE siempre tiene moneda del documento);
 * una moneda no reconocida usa 2 decimales. null/undefined → «—»; un texto que no es decimal (incluido "") se devuelve tal cual.
 */
export function formatearMontoVisual(texto: string | number | null | undefined, moneda?: string | null): string {
  if (texto === null || texto === undefined) return "—";

  const p = partesDecimal(texto);

  if (!p) return typeof texto === "string" ? texto : "—";

  return redondear(p, !moneda ? 0 : (decimalesMonedaVisual(moneda) ?? 2));
}
