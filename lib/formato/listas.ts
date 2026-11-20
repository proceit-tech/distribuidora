// Formato único (es-PY) de cantidades, montos y fechas en listados y tablas de la V1.
// Solo presentación: no convierte monedas ni altera los valores guardados.
import { formatearImporteConMoneda } from "@/lib/formato/monto-visual";

const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });

/** Cantidades (stock, movimientos): separador de miles y hasta 2 decimales. */
export function formatearCantidad(valor: number) {
  return decimal.format(valor);
}

/**
 * Guaraníes como "Gs. 1.234.567" (sin decimales); USD/BRL con su código y 2 decimales fijos ("USD 1.234,50").
 * PRO-335: delega en la semántica visual única (redondeo por texto, mitad hacia arriba); una moneda ausente o desconocida ya no se asume PYG.
 */
export function formatearMonto(valor: number | string, moneda?: string | null) {
  return formatearImporteConMoneda(valor, moneda);
}

/** "2026-10-11" (o ISO con hora) → "11/10/2026". Si no es una fecha ISO, devuelve el texto tal cual. */
export function formatearFechaIso(valor: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);

  return m ? `${m[3]}/${m[2]}/${m[1]}` : valor;
}

const PARTES_PY = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Asuncion", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

function partesPy(valor: string | Date): Record<string, string> | null {
  const d = valor instanceof Date ? valor : new Date(valor);

  if (Number.isNaN(d.getTime())) return null;

  return Object.fromEntries(PARTES_PY.formatToParts(d).map((p) => [p.type, p.value]));
}

/** Instante → "dd/MM/yyyy" en la hora de Paraguay, sin depender del idioma del navegador. */
export function formatearFechaPy(valor: string | Date) {
  const p = partesPy(valor);

  return p ? `${p.day}/${p.month}/${p.year}` : String(valor);
}

/** Instante → "dd/MM/yyyy HH:mm:ss" en la hora de Paraguay, sin depender del idioma del navegador. */
export function formatearFechaHoraPy(valor: string | Date) {
  const p = partesPy(valor);

  return p ? `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}` : String(valor);
}
