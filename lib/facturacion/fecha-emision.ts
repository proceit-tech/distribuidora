import { hoyParaguay } from "@/lib/facturacion/credito";

/**
 * Fecha de emisión de la Factura Electrónica (D002 dFeEmiDE). Puro y sin red.
 *
 * Dos conceptos distintos (no confundir):
 *  · VENTANA DE SELECCIÓN comercial: el operador puede ELEGIR desde 30 días atrás hasta 5 días adelante (día local de Paraguay). Es una decisión del responsable; elegir una fecha NO promete que SIFEN la acepte.
 *  · VENTANA HABILITADA para emitir (transmisión NORMAL). Según las preguntas frecuentes e-Kuatia de la DNIT, el documento se transmite normalmente cuando firma→transmisión ≤ 72 h y emisión→transmisión (emisión anterior O
 *    posterior a la transmisión) ≤ 120 h. La firma y la transmisión las ejecuta el gateway después de crear el documento; ni este módulo ni la base conocen ni presumen ese instante, ni el tiempo que tarde (reintentos incluidos).
 *    Convención de la hora: el selector trae solo una FECHA; la base compone el instante de emisión con esa fecha y la hora LOCAL de Asunción en que se reserva el número (el operador no elige hora). Por lo tanto la diferencia
 *    nominal entre el instante de emisión y el de creación es de N×24 h exactas, y N = 5 (120 h) es una FRONTERA SIN MARGEN: cualquier demora del envío o un reintento lo deja fuera de la regla.
 *    Política conservadora, simétrica y con 24 h de margen: se habilitan −4…+4 días (96 h). Con +5 y −5…−30 se BLOQUEA la emisión ANTES de reservar numeración, con el motivo; esas fechas quedan seleccionables pero no emitibles
 *    sin el tratamiento adicional (extemporáneo o con validación del instante real de transmisión) que este flujo no implementa. Nunca se cambia la fecha en silencio ni se falsifica hora/CDC.
 * Los límites de este módulo y de la migración NEX-073 deben coincidir; cambiar uno exige cambiar el otro (decisión fiscal).
 */
export const SELECCION_DIAS_ATRAS = 30;
export const SELECCION_DIAS_ADELANTE = 5;
export const HABILITADA_DIAS_ATRAS = 4;
export const HABILITADA_DIAS_ADELANTE = 4;

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
  if (dif > HABILITADA_DIAS_ADELANTE) {
    return { ok: false, error: `Una fecha de emisión a ${dif} días en el futuro queda en el límite de las 120 horas de la transmisión normal a SIFEN, sin margen para el envío: no se puede emitir. Use una fecha hasta ${HABILITADA_DIAS_ADELANTE} días adelante.` };
  }
  if (dif < -HABILITADA_DIAS_ATRAS) {
    return { ok: false, error: `La emisión con fecha de hace más de ${HABILITADA_DIAS_ATRAS} días queda en o fuera del límite de las 120 horas de la transmisión normal a SIFEN (sin margen para el envío) y requiere un tratamiento fiscal extemporáneo que este flujo aún no implementa. Use una fecha más reciente.` };
  }

  return { ok: true };
}

/** Clave del payload de ENTRADA con la fecha elegida (solo si difiere de hoy). La función SQL la valida, la usa para dFeEmiDE/fecha_emision y NO la deja en el snapshot enviado. */
export const CLAVE_FECHA_SOLICITADA = "dFecEmiSol";
