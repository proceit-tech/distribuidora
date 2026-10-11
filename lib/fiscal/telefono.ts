/**
 * Teléfono y celular fiscales del receptor (D214 dTelRec / D215 dCelRec del SIFEN): DDI separado + número.
 *
 * FUENTE NORMATIVA (Manual Técnico v150, D3, págs. 72–73; NT 014 GENFE023/024; no hay NT que lo modifique):
 *  - D214 dTelRec: tipo A, 6–15 posiciones, opcional; "Debe incluir el prefijo de la ciudad si D203 = PRY".
 *  - D215 dCelRec: tipo A, 10–20 posiciones, opcional; sin observación de prefijo.
 * LA NORMA NO DICE NADA SOBRE EL DDI (código de país) ni sobre el formato de números internacionales.
 * Por eso, sin inventar formato (DEC-CLI-TEL-03/04):
 *  - el DDI se guarda aparte (columnas `telefono_ddi` / `celular_ddi`, NEX-024) y el número nacional en
 *    `telefono` / `celular`, solo dígitos y con ceros iniciales preservados;
 *  - las longitudes del SIFEN (6–15 / 10–20) se aplican al NÚMERO NACIONAL normalizado;
 *  - NO se decide si el valor transmitido en el XML (V2) lleva el DDI antepuesto: queda pendiente de decisión
 *    (DEC-CLI-TEL-PEND), y al estar el DDI guardado aparte cualquiera de las dos opciones se puede aplicar sin
 *    perder datos;
 *  - el prefijo de ciudad para PRY es responsabilidad de quien escribe el número (no hay tabla oficial de
 *    prefijos en el paquete DNIT): la pantalla lo indica, el sistema solo valida dígitos y largo.
 * El catálogo de DDI de esta lista es una ayuda de la interfaz (UIT E.164), NO una tabla del SIFEN; "Otro"
 * permite indicar cualquier DDI de 1 a 3 dígitos.
 */

export type CampoTelefonico = "telefono" | "celular";

export const LIMITES_TELEFONO: Record<CampoTelefonico, { min: number; max: number; etiqueta: string }> = {
  telefono: { min: 6, max: 15, etiqueta: "El teléfono" },
  celular: { min: 10, max: 20, etiqueta: "El celular" },
};

/** Ayuda de interfaz (UIT E.164): DDI de uso frecuente. Cualquier otro se informa con "Otro". */
export const DDI_FRECUENTES: Array<{ ddi: string; pais: string }> = [
  { ddi: "595", pais: "Paraguay" },
  { ddi: "54", pais: "Argentina" },
  { ddi: "55", pais: "Brasil" },
  { ddi: "598", pais: "Uruguay" },
  { ddi: "591", pais: "Bolivia" },
  { ddi: "56", pais: "Chile" },
  { ddi: "57", pais: "Colombia" },
  { ddi: "51", pais: "Perú" },
  { ddi: "593", pais: "Ecuador" },
  { ddi: "58", pais: "Venezuela" },
  { ddi: "1", pais: "Estados Unidos / Canadá" },
  { ddi: "34", pais: "España" },
  { ddi: "39", pais: "Italia" },
  { ddi: "49", pais: "Alemania" },
  { ddi: "81", pais: "Japón" },
  { ddi: "86", pais: "China" },
];

const DDI_FORMATO = /^[0-9]{1,3}$/;

/**
 * Número nacional canónico: se aceptan espacios, guiones, puntos y paréntesis solo como separación visual y se
 * guardan únicamente dígitos (ceros iniciales preservados). Se rechaza todo lo ambiguo: letras, "+", "00" de
 * discado internacional o un número que ya empiece por el DDI no se interpretan ni se corrigen.
 */
export function normalizarNumeroTelefonico(entrada: string): { numero: string } | { error: string } {
  const texto = entrada.trim();

  if (texto === "") return { numero: "" };
  if (texto.includes("+")) return { error: "no incluya el signo + ni el DDI en el número: seleccione el DDI aparte" };
  if (!/^[0-9 .\-()]+$/.test(texto)) return { error: "solo puede contener dígitos (se admiten espacios, guiones, puntos y paréntesis)" };

  return { numero: texto.replace(/[ .\-()]/g, "") };
}

/** Valida DDI + número de un campo telefónico. Devuelve el valor canónico a guardar o el mensaje de error. */
export function validarTelefonoFiscal(
  campo: CampoTelefonico,
  ddi: string,
  numeroEntrada: string,
): { ok: true; ddi: string; numero: string } | { ok: false; error: string } {
  const L = LIMITES_TELEFONO[campo];
  const normalizado = normalizarNumeroTelefonico(numeroEntrada);

  if ("error" in normalizado) return { ok: false, error: `${L.etiqueta} ${normalizado.error}.` };
  if (normalizado.numero === "") return { ok: true, ddi: "", numero: "" };

  if (normalizado.numero.length < L.min || normalizado.numero.length > L.max) {
    return { ok: false, error: `${L.etiqueta} debe tener entre ${L.min} y ${L.max} dígitos (sin el DDI).` };
  }

  const ddiLimpio = ddi.trim();

  if (!DDI_FORMATO.test(ddiLimpio)) {
    return { ok: false, error: `Seleccione el DDI (código de país, de 1 a 3 dígitos) para ${campo === "telefono" ? "el teléfono" : "el celular"}.` };
  }

  return { ok: true, ddi: ddiLimpio, numero: normalizado.numero };
}

/** Solo la forma del número (sin exigir DDI): para evaluar datos ya grabados y tolerar los anteriores al DDI. */
export function validarNumeroTelefonico(campo: CampoTelefonico, numeroEntrada: string): string | null {
  const L = LIMITES_TELEFONO[campo];
  const normalizado = normalizarNumeroTelefonico(numeroEntrada);

  if ("error" in normalizado) return `${L.etiqueta} ${normalizado.error}.`;
  if (normalizado.numero === "") return null;

  return normalizado.numero.length >= L.min && normalizado.numero.length <= L.max
    ? null
    : `${L.etiqueta} debe tener entre ${L.min} y ${L.max} dígitos (sin el DDI).`;
}
