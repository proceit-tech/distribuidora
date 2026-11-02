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
  /** D211 dNomRec: A 4–255 (columna varchar(255) desde NEX-022; con la migración sin aplicar el INSERT fallaría). */
  razonSocial: { min: 4, max: 255 },
  /** D212 dNomFanRec: A 4–255 si se informa (varchar(255) desde NEX-022). */
  nombreFantasia: { min: 4, max: 255 },
  /** D216 dEmailRec: A 3–80. */
  email: { min: 3, max: 80 },
  // D214/D215: teléfono y celular se validan por país del número en lib/fiscal/telefono.ts (no aquí).
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


  return null;
}

/**
 * Dirección destinada al receptor (domicilio fiscal): D213 1–255 y, al informarla, número de casa
 * obligatorio, numérico de 1 a 6 dígitos (D218, validación 68). Con `geo.exigir` (operación distinta de B2F,
 * NT 003: D219/D223 obligatorios si se informa D213) exige además departamento, distrito y ciudad (el
 * distrito es parte de la cadena jerárquica de NEX-021); en B2F no se exige ni se envía geografía paraguaya.
 * Las direcciones no fiscales siguen con ubicación opcional (NEX-021).
 */
export function validarDireccionFiscal(
  direccion: string,
  numeroCasa: string,
  geo?: { exigir: boolean; departamento: string; distrito: string; ciudad: string },
): string | null {
  const L = LIMITES_RECEPTOR;

  if (!rango(direccion, L.direccion.min, L.direccion.max)) {
    return `La dirección fiscal debe tener entre ${L.direccion.min} y ${L.direccion.max} caracteres.`;
  }

  if (!new RegExp(`^\\d{${L.numeroCasa.min},${L.numeroCasa.max}}$`).test(numeroCasa)) {
    return `El número de casa de la dirección fiscal es obligatorio y debe ser numérico (${L.numeroCasa.min} a ${L.numeroCasa.max} dígitos).`;
  }

  if (geo?.exigir && (!geo.departamento || !geo.distrito || !geo.ciudad)) {
    return "La dirección fiscal requiere departamento, distrito y ciudad (excepto en operaciones B2F).";
  }

  return null;
}

/** Matriz natureza × operación (D201/D202): contribuyente B2B/B2C/B2G; no contribuyente B2C/B2F. */
export function validarNaturalezaOperacion(naturaleza: string, tipoOperacion: string): string | null {
  const permitidas = naturaleza === "CONTRIBUYENTE" ? ["B2B", "B2C", "B2G"] : ["B2C", "B2F"];

  return permitidas.includes(tipoOperacion)
    ? null
    : naturaleza === "CONTRIBUYENTE"
      ? "Un contribuyente solo admite operaciones B2B, B2C o B2G."
      : "Un no contribuyente solo admite operaciones B2C o B2F.";
}

/** Cliente Innominado (D208 = 5): solo no contribuyente en B2C, número "0" y nombre "Sin Nombre". */
export const NOMBRE_INNOMINADO = "Sin Nombre";

export function validarInnominado(c: { tipoDocumento: string; naturaleza: string; tipoOperacion: string; numeroDocumento: string; razonSocial: string }): string | null {
  if (c.tipoDocumento !== "INNOMINADO") return null;
  if (c.naturaleza !== "NO_CONTRIBUYENTE" || c.tipoOperacion !== "B2C") {
    return "El documento Innominado solo se permite para un no contribuyente en operación B2C.";
  }
  if (c.numeroDocumento !== "0") return 'Un cliente Innominado debe tener el número de documento "0".';
  if (c.razonSocial.toLowerCase() !== NOMBRE_INNOMINADO.toLowerCase()) return `Un cliente Innominado debe llamarse "${NOMBRE_INNOMINADO}".`;
  return null;
}

/**
 * Dígito verificador GS1 (módulo 10) de un GLN/EAN-13: los 12 primeros dígitos se ponderan 1,3,1,3… de izquierda a derecha;
 * el dígito de control completa la suma a múltiplo de 10. Devuelve el dígito esperado (0–9) para los 12 dígitos dados.
 */
export function digitoGs1(doce: string): number {
  let suma = 0;

  for (let i = 0; i < 12; i += 1) suma += Number(doce[i]) * (i % 2 === 0 ? 1 : 3);

  return (10 - (suma % 10)) % 10;
}

/** GLN (D-08, decisión 7 del responsable): opcional; si se informa, EXACTAMENTE 13 dígitos numéricos y dígito verificador GS1 correcto. */
export function validarGln(valor: string): string | null {
  if (valor === "") return null;
  if (!/^\d{13}$/.test(valor)) return "El GLN debe tener exactamente 13 dígitos numéricos.";
  if (digitoGs1(valor.slice(0, 12)) !== Number(valor[12])) {
    return `El dígito verificador GS1 del GLN no es correcto (debería terminar en ${digitoGs1(valor.slice(0, 12))}).`;
  }

  return null;
}

/** URL de documento (ERP): http/https reales; se rechazan javascript:, data: y similares. */
export function validarUrlDocumento(valor: string): string | null {
  try {
    const url = new URL(valor);
    if ((url.protocol === "http:" || url.protocol === "https:") && url.hostname) return null;
  } catch {
    // se informa abajo
  }
  return "La URL del documento debe ser una dirección http:// o https:// válida.";
}

/** Longitudes máximas de las columnas (NEX-005…023) para rechazar en lugar de truncar. Devuelve el primer exceso. */
export function validarLongitudes(items: Array<[valor: string, max: number, etiqueta: string]>): string | null {
  for (const [valor, max, etiqueta] of items) {
    if (valor.length > max) return `${etiqueta} no puede superar ${max} caracteres.`;
  }
  return null;
}
