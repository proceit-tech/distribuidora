/**
 * Conversión de moneda de los límites de crédito de un cliente (CLI-VIS-05/06, D-10). Aritmética decimal EXACTA con BigInt:
 * nunca Number ni coma flotante. La tasa la informa el usuario (no hay cotización automática) y se interpreta como
 * «unidades de la moneda DESTINO por 1 unidad de la moneda ORIGEN». Redondeo (propuesta documentada, pendiente de aprobación
 * del responsable): half-up a 4 decimales, la escala de numeric(18,4); el resultado debe caber en el rango del límite.
 */
import { LIMITE_CREDITO, decimalAcotado, dentroDeRango } from "@/lib/clientes/comercial";

export const TASA_CAMBIO = { min: "0.00000001", max: "9999999999999999.99999999", decimales: 8 } as const;
export const REDONDEO_CONVERSION = "HALF_UP_4";

/** Tasa estricta (mismo formato que los importes: un separador decimal, sin miles, sin ambigüedad) → texto canónico. */
export function validarTasa(valor: unknown): string {
  const tasa = decimalAcotado(valor, "La tasa de cambio", TASA_CAMBIO);

  if (tasa === null) throw new Error("Informe la tasa de cambio.");

  return tasa;
}

const aEscala = (texto: string, escala: number): bigint => {
  const [entera = "0", fraccion = ""] = texto.split(".");

  return BigInt(`${entera}${fraccion.padEnd(escala, "0")}`);
};

/** importe × tasa redondeado half-up a 4 decimales. `importe` y `tasa` son decimales canónicos no negativos. */
export function convertirImporte(importe: string, tasa: string): string {
  const producto = aEscala(importe, 4) * aEscala(tasa, 8); // escala 12
  const divisor = BigInt("100000000"); // 10^8: pasa de escala 12 a escala 4 (sin literales bigint: target ES2017)
  const redondeado = (producto + divisor / BigInt(2)) / divisor; // escala 4, half-up (valores no negativos)
  const texto = redondeado.toString().padStart(5, "0");
  const entera = texto.slice(0, -4).replace(/^0+(?=\d)/, "");
  const fraccion = texto.slice(-4).replace(/0+$/, "");

  return fraccion ? `${entera}.${fraccion}` : entera;
}

export type ConversionLimites = {
  tasa: string;
  limiteOrigen: string;
  limiteDestino: string;
  temporalOrigen: string | null;
  temporalDestino: string | null;
};

/** Convierte el límite normal y el temporal con la misma tasa; falla si el resultado excede numeric(18,4). */
export function convertirLimites(limite: string, temporal: string | null, tasaEntrada: unknown): ConversionLimites {
  const tasa = validarTasa(tasaEntrada);
  const limiteDestino = convertirImporte(limite, tasa);
  const temporalDestino = temporal === null ? null : convertirImporte(temporal, tasa);

  for (const [etiqueta, valor] of [["límite de crédito", limiteDestino], ["límite temporal", temporalDestino]] as const) {
    if (valor !== null && !dentroDeRango(valor, LIMITE_CREDITO)) {
      throw new Error(`El ${etiqueta} convertido (${valor}) excede el máximo permitido: revise la tasa de cambio.`);
    }
  }

  return { tasa, limiteOrigen: limite, limiteDestino, temporalOrigen: temporal, temporalDestino };
}

/** ¿Hay algo que convertir? (algún límite mayor que cero). Con límites en cero un cambio de moneda no requiere tasa. */
export function requiereConversion(limite: string, temporal: string | null): boolean {
  const positivo = (v: string | null) => v !== null && /[1-9]/.test(v);

  return positivo(limite) || positivo(temporal);
}
