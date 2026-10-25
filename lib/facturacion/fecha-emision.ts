import { hoyParaguay } from "@/lib/facturacion/credito";

/**
 * Fecha de emisión de la Factura Electrónica (D002 dFeEmiDE). Puro y sin red.
 *
 * Dos conceptos distintos (no confundir):
 *  · VENTANA DE SELECCIÓN comercial: el operador puede ELEGIR desde 30 días atrás hasta 5 días adelante (día local de Paraguay).
 *  · VENTANA HABILITADA para emitir: la transmisión NORMAL a SIFEN exige enviar el DE dentro de las 120 h de su emisión (DNIT, preguntas frecuentes e-Kuatia). Fuera de ella el tratamiento fiscal es otro (extemporáneo) y
 *    este flujo NO lo implementa: la fecha se puede elegir, pero la emisión se bloquea ANTES de reservar numeración, con el motivo; nunca se cambia en silencio por la de hoy ni se falsifica fecha/hora.
 *    Se habilitan hasta 4 días atrás (96 h + margen: el envío ocurre segundos después de crear el documento) y nunca fechas futuras (el DE no puede declararse emitido después de transmitirse).
 * Un cambio de estas constantes es una decisión fiscal; la migración NEX-073 aplica los mismos límites en la base.
 */
export const SELECCION_DIAS_ATRAS = 30;
export const SELECCION_DIAS_ADELANTE = 5;
export const HABILITADA_DIAS_ATRAS = 4;
export const HABILITADA_DIAS_ADELANTE = 0;

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
    return { ok: false, error: "Una fecha de emisión futura no está habilitada para emitir: el documento no puede declararse emitido después de su transmisión. Use la fecha de hoy." };
  }
  if (dif < -HABILITADA_DIAS_ATRAS) {
    return { ok: false, error: `La emisión con fecha de hace más de ${HABILITADA_DIAS_ATRAS} días queda fuera del plazo de transmisión normal a SIFEN (120 horas) y requiere un tratamiento fiscal extemporáneo que este flujo aún no implementa. Use una fecha más reciente.` };
  }

  return { ok: true };
}

/** Clave del payload de ENTRADA con la fecha elegida (solo si difiere de hoy). La función SQL la valida, la usa para dFeEmiDE/fecha_emision y NO la deja en el snapshot enviado. */
export const CLAVE_FECHA_SOLICITADA = "dFecEmiSol";
