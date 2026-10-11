// Formato único (es-PY) de cantidades, montos y fechas en listados y tablas de la V1.
// Solo presentación: no convierte monedas ni altera los valores guardados.

const entero = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });

/** Cantidades (stock, movimientos): separador de miles y hasta 2 decimales. */
export function formatearCantidad(valor: number) {
  return decimal.format(valor);
}

/** Guaraníes como "Gs. 1.234.567" (sin decimales); otras monedas con su código ("USD 1.234,50"). */
export function formatearMonto(valor: number, moneda?: string | null) {
  const codigo = (moneda ?? "").trim().toUpperCase();

  if (codigo === "" || codigo === "PYG" || codigo === "GS" || codigo === "GS.") {
    return `Gs. ${entero.format(valor)}`;
  }

  return `${codigo} ${decimal.format(valor)}`;
}

/** "2026-10-11" (o ISO con hora) → "11/10/2026". Si no es una fecha ISO, devuelve el texto tal cual. */
export function formatearFechaIso(valor: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);

  return m ? `${m[3]}/${m[2]}/${m[1]}` : valor;
}
