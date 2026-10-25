import { hoyParaguay } from "@/lib/facturacion/credito";

/**
 * Fecha de emisión de la Factura Electrónica (D002 dFeEmiDE). Puro y sin red.
 *
 * Dos conceptos distintos (no confundir):
 *  · VENTANA DE SELECCIÓN comercial: el operador puede ELEGIR desde 30 días atrás hasta 5 días adelante (día local de Paraguay).
 *  · VENTANA HABILITADA para emitir: transmisión NORMAL a SIFEN. Según las preguntas frecuentes e-Kuatia de la DNIT, el documento se transmite normalmente cuando la FIRMA→transmisión no pasa de 72 h y la EMISIÓN→transmisión
 *    (emisión anterior O posterior a la transmisión) no pasa de 120 h. La firma y la transmisión las ejecuta el gateway justo después de crear el documento, así que este flujo no presume ningún instante de transmisión.
 *    Convención de la hora: el selector solo trae una FECHA; la base compone el instante de emisión con esa fecha y la hora LOCAL de Asunción en que se reserva el número (el operador no elige hora).
 *    Con esa convención la diferencia emisión−transmisión es de N×24 h menos (futuro) o más (pasado) el retraso hasta transmitir:
 *      – Futuro (+1…+5 días): la diferencia es ≤ 120 h porque la transmisión ocurre DESPUÉS de crear el documento ⇒ habilitado en toda la selección.
 *      – Pasado: −4 días = 96 h deja 24 h de margen para el envío (y un reintento); −5 días = 120 h ya no tiene margen y −6…−30 la exceden ⇒ la emisión se BLOQUEA antes de reservar numeración, con el motivo.
 *        Esas fechas requieren el tratamiento fiscal extemporáneo que este flujo no implementa; nunca se cambia la fecha en silencio ni se falsifica hora/CDC.
 * Los límites de este módulo y de la migración NEX-073 deben coincidir; cambiar uno exige cambiar el otro (decisión fiscal).
 */
export const SELECCION_DIAS_ATRAS = 30;
export const SELECCION_DIAS_ADELANTE = 5;
export const HABILITADA_DIAS_ATRAS = 4;
export const HABILITADA_DIAS_ADELANTE = 5;

const FORMA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** AAAA-MM-DD válida (calendario real) o null. */
export function fechaIsoValida(texto: unknown): string | null {
  if (typeof texto !== "string") return null;

  const m = FORMA.exec(texto);

  if (!m) return null;

  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));

  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? texto : null;
}

/** Suma (o resta) días a una fecha AAAA-MM-DD sin zona horaria. */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split("-").map(Number);

  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Diferencia en días (fecha − referencia). */
export function diferenciaDias(fecha: string, referencia: string): number {
  const f = fecha.split("-").map(Number);
  const r = referencia.split("-").map(Number);

  return Math.round((Date.UTC(f[0], f[1] - 1, f[2]) - Date.UTC(r[0], r[1] - 1, r[2])) / 86400000);
}

/** Límites del selector de fecha (atributos min/max del input). */
export function rangoSeleccion(hoy: string = hoyParaguay()): { min: string; max: string } {
  return { min: sumarDias(hoy, -SELECCION_DIAS_ATRAS), max: sumarDias(hoy, SELECCION_DIAS_ADELANTE) };
}

export type EvaluacionFecha = { ok: true } | { ok: false; error: string };

/** Evalúa una fecha elegida: dentro de la selección comercial y dentro de la ventana fiscalmente habilitada. */
export function evaluarFechaEmision(fecha: unknown, hoy: string = hoyParaguay()): EvaluacionFecha {
  const f = fechaIsoValida(fecha);

  if (f === null) return { ok: false, error: "La fecha de emisión no es válida (use una fecha real, formato AAAA-MM-DD)." };

  const dif = diferenciaDias(f, hoy);

  if (dif < -SELECCION_DIAS_ATRAS || dif > SELECCION_DIAS_ADELANTE) {
    return { ok: false, error: `La fecha de emisión debe estar entre ${SELECCION_DIAS_ATRAS} días atrás y ${SELECCION_DIAS_ADELANTE} días adelante de hoy.` };
  }
  if (dif < -HABILITADA_DIAS_ATRAS) {
    return { ok: false, error: `La emisión con fecha de hace más de ${HABILITADA_DIAS_ATRAS} días queda fuera del plazo de transmisión normal a SIFEN (120 horas, con el envío ya incluido) y requiere un tratamiento fiscal extemporáneo que este flujo aún no implementa. Use una fecha más reciente.` };
  }

  return { ok: true };
}

/** Clave del payload de ENTRADA con la fecha elegida (solo si difiere de hoy). La función SQL la valida, la usa para dFeEmiDE/fecha_emision y NO la deja en el snapshot enviado. */
export const CLAVE_FECHA_SOLICITADA = "dFecEmiSol";
