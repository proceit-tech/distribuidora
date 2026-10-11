/**
 * Límites y obligatoriedades de los campos del receptor (grupo D3 del SIFEN v150) aplicados al CADASTRO.
 *
 * Decisión: documentacao/v1/homologacao-visual/DECISAO-LIMITES-CAMPOS-FISCAIS-SIFEN-CADASTRO-2026-10-11.md
 * Fuente: Manual Técnico v150, D3 (págs. 70–73) y validaciones 45–74; NT 002, 003, 005, 023 (ver
 * documentacao/v1/homologacao-visual/E2-CAMPOS-FISCAIS-SIFEN-CLIENTES-2026-10-11.md).
 *
 * Función pura compartida por los formularios de alta/edición y por las API POST/PUT: la misma regla
 * en ambos lados, sin truncar ni "corregir" valores en silencio. El RUC/DV se valida en `calcular-dv-ruc.ts`.
 */

export const LIMITES_RECEPTOR = {
  /** D210 dNumIDRec: A 1–20. */
  documento: { min: 1, max: 20 },
  /** D209 dDTipIDRec (descripción cuando D208 = 9 Otro): A 9–41. */
  descripcionOtro: { min: 9, max: 41 },
  /**
   * D211 dNomRec: A 4–255. La columna `clientes.razon_social` (NEX-005) es varchar(200): hasta que se
   * autorice una migración incremental el máximo efectivo es 200 (propuesta en el documento E2).
   */
  razonSocial: { min: 4, max: 200, maxSifen: 255 },
  /** D212 dNomFanRec: A 4–255 si se informa. Columna varchar(200): máximo efectivo 200 (idem). */
  nombreFantasia: { min: 4, max: 200, maxSifen: 255 },
  /** D216 dEmailRec: A 3–80. */
  email: { min: 3, max: 80 },
  /** D214 dTelRec: A 6–15. */
  telefono: { min: 6, max: 15 },
  /** D215 dCelRec: A 10–20. */
  celular: { min: 10, max: 20 },
  /** D213 dDirRec: A 1–255. */
  direccion: { min: 1, max: 255 },
  /** D218 dNumCasRec: N 1–6. */
  numeroCasa: { min: 1, max: 6 },
} as const;

export type CamposReceptor = {
  naturaleza: string;
  tipoDocumento: string;
  numeroDocumento: string;
  descripcionDocumento: string;
  razonSocial: string;
  nombreFantasia: string;
  email: string;
  telefono: string;
  celular: string;
};

/** Texto tal como llega (recortando solo espacios de los extremos), sin truncar. */
export function textoCrudo(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function rango(valor: string, min: number, max: number) {
  return valor.length >= min && valor.length <= max;
}

/**
 * Valida los campos fiscales del receptor. Devuelve el primer mensaje de error o `null`.
 * `previos` (solo en edición): un campo cuyo valor no cambió respecto del guardado se tolera
 * (datos anteriores a la regla) hasta que se modifique.
 */
export function validarCamposReceptor(c: CamposReceptor, previos?: Partial<CamposReceptor>): string | null {
  const cambio = (campo: keyof CamposReceptor) => previos === undefined || previos[campo] !== c[campo];
  const L = LIMITES_RECEPTOR;

  if (c.naturaleza !== "CONTRIBUYENTE" && cambio("numeroDocumento") && !rango(c.numeroDocumento, L.documento.min, L.documento.max)) {
    return `El número de documento debe tener entre ${L.documento.min} y ${L.documento.max} caracteres.`;
  }

  if (
    c.naturaleza !== "CONTRIBUYENTE" &&
    c.tipoDocumento === "OTRO" &&
    cambio("descripcionDocumento") &&
    !rango(c.descripcionDocumento, L.descripcionOtro.min, L.descripcionOtro.max)
  ) {
    return `La descripción del tipo de documento debe tener entre ${L.descripcionOtro.min} y ${L.descripcionOtro.max} caracteres.`;
  }

  if (cambio("razonSocial") && !rango(c.razonSocial, L.razonSocial.min, L.razonSocial.max)) {
    return `El nombre o razón social debe tener entre ${L.razonSocial.min} y ${L.razonSocial.max} caracteres.`;
  }

  if (c.nombreFantasia && cambio("nombreFantasia") && !rango(c.nombreFantasia, L.nombreFantasia.min, L.nombreFantasia.max)) {
    return `El nombre de fantasía, si se informa, debe tener entre ${L.nombreFantasia.min} y ${L.nombreFantasia.max} caracteres.`;
  }

  if (c.email && cambio("email") && !rango(c.email, L.email.min, L.email.max)) {
    return `El correo electrónico debe tener entre ${L.email.min} y ${L.email.max} caracteres.`;
  }

  if (c.telefono && cambio("telefono") && !rango(c.telefono, L.telefono.min, L.telefono.max)) {
    return `El teléfono debe tener entre ${L.telefono.min} y ${L.telefono.max} caracteres.`;
  }

  if (c.celular && cambio("celular") && !rango(c.celular, L.celular.min, L.celular.max)) {
    return `El celular debe tener entre ${L.celular.min} y ${L.celular.max} caracteres.`;
  }

  return null;
}

/**
 * Dirección destinada al receptor (domicilio fiscal): D213 1–255 y, al informarla, número de casa
 * obligatorio, numérico de 1 a 6 dígitos (D218, validación 68). La geografía (D219–D223) no se exige
 * aquí: sigue opcional en el cadastro (NEX-021).
 */
export function validarDireccionFiscal(direccion: string, numeroCasa: string): string | null {
  const L = LIMITES_RECEPTOR;

  if (!rango(direccion, L.direccion.min, L.direccion.max)) {
    return `La dirección fiscal debe tener entre ${L.direccion.min} y ${L.direccion.max} caracteres.`;
  }

  if (!new RegExp(`^\\d{${L.numeroCasa.min},${L.numeroCasa.max}}$`).test(numeroCasa)) {
    return `El número de casa de la dirección fiscal es obligatorio y debe ser numérico (${L.numeroCasa.min} a ${L.numeroCasa.max} dígitos).`;
  }

  return null;
}
