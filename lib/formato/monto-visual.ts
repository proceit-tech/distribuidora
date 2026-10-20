/**
 * Presentación VISUAL de importes monetarios (primera versión visual de la facturación). SOLO formatea para mostrar: no se usa para calcular, validar ni enviar nada; el valor interno (payload, cálculo, persistencia) no cambia.
 *  · PYG (guaraníes) → sin decimales, con separador de miles (1.234.567).
 *  · Otras monedas (USD, BRL) → 2 decimales fijos (12,50): ocultar los centavos de una moneda que los usa sería engañoso.
 * El redondeo es por TEXTO decimal (medio hacia arriba sobre el valor absoluto), sin pasar por Number, así que un importe largo o con 8 decimales no pierde dígitos ni muestra ruido binario.
 * Un texto que no es un decimal se devuelve tal cual (no se inventa un valor); null/undefined se muestra como «—».
 */
export function formatearMontoVisual(texto: string | number | null | undefined, moneda?: string | null): string {
  if (texto === null || texto === undefined) return "—";

  const original = typeof texto === "number" ? (Number.isFinite(texto) ? String(texto) : "") : texto;
  const t = original.trim();
  const m = /^(-?)(\d{1,30})(?:\.(\d{1,30}))?$/.exec(t);

  if (!m) return typeof texto === "string" ? texto : "—";

  const decimales = !moneda || moneda === "PYG" ? 0 : 2;
  const frac = m[3] ?? "";
  // Todo el valor como entero escalado a `decimales`, redondeando por el primer dígito descartado.
  let escalado = m[2] + frac.slice(0, decimales).padEnd(decimales, "0");

  if (frac.length > decimales && frac.charCodeAt(decimales) >= 53) escalado = sumarUno(escalado); // dígito descartado >= 5

  const digitos = escalado.replace(/^0+(?=\d)/, "").padStart(decimales + 1, "0");
  const entero = digitos.slice(0, digitos.length - decimales).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const parteDecimal = decimales > 0 ? "," + digitos.slice(digitos.length - decimales) : "";
  const esCero = /^0+$/.test(escalado);

  return (m[1] === "-" && !esCero ? "-" : "") + entero + parteDecimal;
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
