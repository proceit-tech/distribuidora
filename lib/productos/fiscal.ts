/**
 * Clasificación fiscal estándar del producto (Tabla 6 y grupo E8.2 del MT v150; validaciones 151–156). Reglas puras compartidas por el
 * formulario, el normalizador, la API y (como CHECK/trigger) la base de datos. E735–E737 (bases y liquidación) son cálculo de la operación: no se guardan.
 *   E731 afectación: 1 Gravado IVA · 2 Exonerado (Art. 83 – Ley 125/91) · 3 Exento · 4 Gravado parcial
 *   E733 proporción gravada: 100 (E731=1) · 0 (E731=2/3) · 0<x<100 (E731=4)
 *   E734 tasa: 0 (E731=2/3) · 5 o 10 (E731=1/4)   (la tasa del producto es el `porcentaje` del impuesto elegido)
 */
export const AFECTACIONES_IVA: ReadonlyArray<{ codigo: 1 | 2 | 3 | 4; texto: string }> = [
  { codigo: 1, texto: "Gravado IVA" },
  { codigo: 2, texto: "Exonerado (Art. 83 – Ley 125/91)" },
  { codigo: 3, texto: "Exento" },
  { codigo: 4, texto: "Gravado parcial (Grav-Exento)" },
];

/** Longitudes admitidas por el SIFEN para E706 (GTIN del producto) y E707 (GTIN del paquete). */
export const LONGITUDES_GTIN = [8, 12, 13, 14] as const;

/** Tipos de código que se validan como GTIN (no se aplica a códigos internos, SKU de proveedor ni identificadores de otros ERP). */
export const TIPOS_CODIGO_GTIN = ["GTIN", "GTIN_EMPAQUE", "EAN", "UPC"] as const;

export const textoAfectacion = (codigo: number | null | undefined) => AFECTACIONES_IVA.find((a) => a.codigo === codigo)?.texto ?? "";

/** Proporción gravada efectiva (E733) que aplica por defecto: 100, 0 o la informada para el gravado parcial. */
export function proporcionEfectiva(afectacion: number | null, proporcion: string | null): string | null {
  if (afectacion === 1) return "100";
  if (afectacion === 2 || afectacion === 3) return "0";
  if (afectacion === 4) return proporcion;

  return null;
}

const esCero = (t: string) => !/[1-9]/.test(t);

/**
 * Coherencia afectación × tasa × proporción. `tasa` es el porcentaje del impuesto elegido (texto decimal) o null si no hay impuesto.
 * Devuelve el primer problema con el campo al que se asocia, o null si es coherente (o si no hay afectación: producto sin clasificar).
 */
export function coherenciaIva(afectacion: number | null, tasa: string | null, proporcion: string | null): { campo: string; mensaje: string } | null {
  if (afectacion === null) {
    return proporcion !== null ? { campo: "proporcionGravadaIva", mensaje: "La proporción gravada solo se informa con afectación «Gravado parcial»." } : null;
  }
  if (tasa === null) return { campo: "impuestoId", mensaje: "Seleccione el impuesto: la afectación IVA requiere una tasa (0, 5 o 10 %)." };

  const t = Number(tasa);

  if (afectacion === 1 || afectacion === 4) {
    if (t !== 5 && t !== 10) return { campo: "impuestoId", mensaje: "Para Gravado IVA o Gravado parcial la tasa debe ser 5 % o 10 %." };
  } else if (t !== 0) {
    return { campo: "impuestoId", mensaje: "Para Exonerado o Exento la tasa debe ser 0 %." };
  }

  if (afectacion === 4) {
    if (proporcion === null) return { campo: "proporcionGravadaIva", mensaje: "Informe la proporción gravada (mayor que 0 y menor que 100)." };
    if (esCero(proporcion) || Number(proporcion) >= 100) return { campo: "proporcionGravadaIva", mensaje: "La proporción gravada debe ser mayor que 0 y menor que 100." };
  } else if (proporcion !== null) {
    return { campo: "proporcionGravadaIva", mensaje: afectacion === 1 ? "Gravado IVA tiene proporción gravada fija de 100 %: no se informa." : "Exonerado y Exento tienen proporción gravada 0: no se informa." };
  }

  return null;
}
