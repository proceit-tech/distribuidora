import { MAX_LINEAS } from "@/lib/facturacion/payload-fe";

/**
 * PRO-339-R01 — máximo de LÍNEAS por Factura Electrónica NUEVA, configurable POR EMPRESA (tenant de NEXIT: empresas.fe_max_lineas, NEX-078).
 * Reglas puras (sin base ni servidor; las usa también la pantalla Nueva factura):
 *  · Cuenta elementos de `cuerpo.lineas` (filas del detalle = ítems gCamItem), NO cantidades ni SKU distintos.
 *  · NULL en la base = sin política propia => MAX_LINEAS (999, máximo fiscal común, que NO cambia). Un valor válido es un entero 1..999.
 *  · Ninguna empresa, nombre, RUC ni UUID se identifica aquí: el valor sale SIEMPRE de la fila de la empresa de la SESIÓN.
 *  · Sin la columna (NEX-078 no aplicada) o con un valor ilegible: falla cerrado (no se asume 999 en silencio).
 * La cantidad de filas visibles del detalle (PRO-331) es solo presentación y no se relaciona con este máximo.
 */

export const MENSAJE_LIMITE_SIN_MIGRACION = "El máximo de líneas por factura electrónica de esta empresa requiere la migración NEX-078 en la base de datos (aún no aplicada). No se crean facturas nuevas hasta aplicarla.";
export const MENSAJE_LIMITE_SIN_EMPRESA = "No se pudo leer la configuración de la empresa de la sesión. No se crean facturas nuevas.";
export const MENSAJE_LIMITE_INVALIDO = "La configuración del máximo de líneas por factura electrónica de esta empresa no es válida. No se crean facturas nuevas hasta corregirla.";

/** Clave devuelta por el alta de la pantalla cuando NO se agregó una línea nueva por el máximo de la empresa (las claves reales son ≥ 1). */
export const ALTA_BLOQUEADA = -1;

export type LecturaLimite = { ok: true; maximo: number } | { ok: false; mensaje: string };

/** ¿Es un máximo válido (entero 1..999)? */
export function maximoValido(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_LINEAS;
}

/**
 * Interpreta la fila leída de la empresa de la sesión. `fila` undefined = la empresa no existe (falla cerrado); `existe` false = falta NEX-078 (falla cerrado);
 * `valor` null = 999; texto o número entero 1..999 = ese valor; cualquier otra cosa = configuración inválida (falla cerrado).
 */
export function interpretarLimiteLineas(fila: { existe?: unknown; valor?: unknown } | undefined): LecturaLimite {
  if (!fila) return { ok: false, mensaje: MENSAJE_LIMITE_SIN_EMPRESA };
  if (fila.existe !== true) return { ok: false, mensaje: MENSAJE_LIMITE_SIN_MIGRACION };
  if (fila.valor === null || fila.valor === undefined) return { ok: true, maximo: MAX_LINEAS };

  const n = typeof fila.valor === "number" ? fila.valor : typeof fila.valor === "string" && /^\d{1,3}$/.test(fila.valor) ? Number(fila.valor) : Number.NaN;

  return maximoValido(n) ? { ok: true, maximo: n } : { ok: false, mensaje: MENSAJE_LIMITE_INVALIDO };
}

/** Mensaje para el operador con el máximo REAL de su empresa (nunca un número fijo). */
export function mensajeLimiteLineas(maximo: number): string {
  return `Esta empresa admite un máximo de ${maximo} ${maximo === 1 ? "línea" : "líneas"} por factura electrónica.`;
}

/** Pantalla: aviso al intentar una línea nueva por encima del máximo (sin máximo conocido, el fiscal común). */
export function mensajeAltaBloqueada(maximo: number | null): string {
  return mensajeLimiteLineas(maximo ?? MAX_LINEAS);
}

/** Mensaje del servidor cuando el cuerpo trae más líneas que el máximo vigente (permite corregir y revisar de nuevo). */
export function mensajeExcesoLineas(maximo: number, lineas: number): string {
  return `${mensajeLimiteLineas(maximo)} La factura tiene ${lineas}: quite ${lineas - maximo} y revísela de nuevo.`;
}

/** ¿Excede el máximo? Solo cuenta filas. */
export function excedeLimite(nLineas: number, maximo: number): boolean {
  return nLineas > maximo;
}

/**
 * Pantalla: ¿se puede agregar UNA LÍNEA NUEVA con `nLineas` ya cargadas? `maximo` null = aún no se conoce el de la empresa (sin catálogo o sin NEX-078): no se bloquea en la pantalla
 * (el servidor es la autoridad y falla cerrado); solo se respeta el máximo fiscal común. Sumar cantidad a una línea existente nunca pasa por aquí.
 */
export function puedeAgregarLinea(nLineas: number, maximo: number | null): boolean {
  return nLineas < (maximo ?? MAX_LINEAS);
}

/** Pantalla: agrega la línea solo si cabe; protege contra dos lecturas del lector casi simultáneas que vieron el mismo estado anterior. */
export function agregarSiCabe<T>(lineas: T[], nueva: T, maximo: number | null): T[] {
  return puedeAgregarLinea(lineas.length, maximo) ? [...lineas, nueva] : lineas;
}

/** Contador visible: «N de M ítems» con el máximo de la empresa; sin máximo conocido, «N ítems». */
export function textoContadorLineas(nLineas: number, maximo: number | null): string {
  const items = `ítem${(maximo ?? nLineas) === 1 ? "" : "s"}`;

  return maximo === null ? `${nLineas} ítem${nLineas === 1 ? "" : "s"}` : `${nLineas} de ${maximo} ${items}`;
}

/** Máximo devuelto por la API (catálogos o un 422 de previa/emisión); cualquier otra cosa = desconocido. */
export function leerMaximoApi(v: unknown): number | null {
  return maximoValido(v) ? v : null;
}
