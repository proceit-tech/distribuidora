/**
 * Cálculos y formatos puros de Listas de Precios (cliente, servidor y pruebas). Sin acceso a base de datos.
 * Reglas que NO se inventan aquí: conversión de moneda, precedencia/acumulación de descuentos y redondeo comercial más allá de la precisión
 * de la moneda. Esas decisiones siguen pendientes (ver documentación).
 */

/** Decimales de la moneda para precios mostrados y calculados: PYG sin decimales; el resto, 2. */
export function decimalesMoneda(monedaCodigo: string): number {
  return monedaCodigo.toUpperCase() === "PYG" ? 0 : 2;
}

/** Redondeo a la precisión de la moneda (mitades hacia arriba en valor absoluto, estable ante coma flotante). */
export function redondearMoneda(valor: number, monedaCodigo: string): number {
  const d = decimalesMoneda(monedaCodigo);
  const f = 10 ** d;
  const r = Math.sign(valor) * Math.round(Math.abs(valor) * f * (1 + Number.EPSILON)) / f;

  return Object.is(r, -0) ? 0 : r;
}

export function formatoMoneda(valor: number, monedaCodigo: string): string {
  const d = decimalesMoneda(monedaCodigo);

  return new Intl.NumberFormat("es-PY", { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number.isFinite(valor) ? valor : 0);
}

/**
 * Margen bruto sobre el precio de venta: (precio − costo) / precio × 100, con 2 decimales.
 * null (sin dato, nunca 0 ni Infinity) cuando el precio no es positivo o no hay costo: sin precio o sin costo la
 * relación no está definida y no debe mostrarse como un 0 % falso.
 */
export function margenBruto(precio: number, costo: number): number | null {
  if (!Number.isFinite(precio) || !Number.isFinite(costo) || precio <= 0 || costo <= 0) return null;

  return Number((((precio - costo) / precio) * 100).toFixed(2));
}

export type AjusteMasivo = { aplicados: number; omitidosSinBase: number; precios: Array<number | null> };

/**
 * Ajuste porcentual masivo. Cada precio nuevo se calcula SIEMPRE desde el precio base del producto (nunca desde el precio de lista actual ni
 * desde el costo), por lo que repetir la acción no acumula. Un producto sin precio base positivo se omite (null) y se informa: el costo no
 * se usa como precio de venta. No toca descuentos: el porcentaje se aplica una sola vez, sobre el precio.
 */
export function ajusteMasivo(items: Array<{ precioBase: number }>, porcentaje: number, monedaCodigo: string): AjusteMasivo {
  let omitidos = 0;
  const precios = items.map((i) => {
    if (!Number.isFinite(i.precioBase) || i.precioBase <= 0) {
      omitidos += 1;

      return null;
    }

    return Math.max(0, redondearMoneda(i.precioBase * (1 + porcentaje / 100), monedaCodigo));
  });

  return { aplicados: items.length - omitidos, omitidosSinBase: omitidos, precios };
}

export type EscalaTramo = { cantidadMinima: number; cantidadMaxima: number | null };

/** Índices (base 0) de tramos que se solapan con otro: cantidades mínimas/máximas inclusivas; máximo null = sin límite. */
export function tramosSuperpuestos(tramos: EscalaTramo[]): number[] {
  const solapados = new Set<number>();

  for (let i = 0; i < tramos.length; i += 1) {
    for (let j = i + 1; j < tramos.length; j += 1) {
      const a = tramos[i];
      const b = tramos[j];
      const finA = a.cantidadMaxima ?? Number.POSITIVE_INFINITY;
      const finB = b.cantidadMaxima ?? Number.POSITIVE_INFINITY;

      if (a.cantidadMinima <= finB && b.cantidadMinima <= finA) {
        solapados.add(i);
        solapados.add(j);
      }
    }
  }

  return [...solapados].sort((x, y) => x - y);
}

/** Fecha de hoy (yyyy-mm-dd) en la zona horaria de Asunción, no en UTC. */
export function hoyAsuncion(ahora: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(ahora);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";

  return `${g("year")}-${g("month")}-${g("day")}`;
}

/** yyyy-mm-dd → dd/mm/yyyy ("" si no es una fecha ISO). */
export function isoAFechaLocal(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);

  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** dd/mm/yyyy (o yyyy-mm-dd) → yyyy-mm-dd; null si no es una fecha válida del calendario. */
export function fechaLocalAIso(texto: string): string | null {
  const t = texto.trim();
  const loc = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  const [dd, mm, yyyy] = loc ? [loc[1], loc[2], loc[3]] : iso ? [iso[3], iso[2], iso[1]] : [null, null, null];

  if (!dd || !mm || !yyyy) return null;

  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));

  if (d.getUTCFullYear() !== Number(yyyy) || d.getUTCMonth() !== Number(mm) - 1 || d.getUTCDate() !== Number(dd)) return null;

  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/**
 * Cotización digitada (es-PY): admite «7350», «7350,5», «7.350,50» o «7350.5». Con coma, el punto es separador de miles; sin coma, un punto
 * seguido de exactamente tres dígitos en grupos (7.350) se toma como miles. Devuelve el texto decimal normalizado o null si no es válido
 * (vacío, no numérico, cero, negativo o con más de 6 decimales).
 */
export function normalizarCambio(texto: string): string | null {
  const t = texto.trim().replace(/\s/g, "");

  if (!t || /[^0-9.,]/.test(t)) return null;

  let n: string;

  if (t.includes(",")) {
    if ((t.match(/,/g) ?? []).length > 1) return null;
    n = t.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    n = t.replace(/\./g, "");
  } else {
    n = t;
  }

  if (!/^\d+(\.\d{1,6})?$/.test(n)) return null;
  if (!(Number(n) > 0)) return null;

  return n.replace(/^0+(?=\d)/, "");
}
