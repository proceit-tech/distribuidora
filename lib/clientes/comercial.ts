/**
 * Validaciones compartidas de la pestaña Comercial y crédito (alta y edición): importes y porcentajes acotados a la
 * precisión de las columnas (nunca se redondea ni se trunca en silencio) y catálogos de condición de pago y moneda.
 * El límite de crédito se guarda como numeric(18,4) y el descuento como numeric(5,2) (NEX-005).
 */
type ConsultaDb = { query: (texto: string, valores?: unknown[]) => Promise<{ rowCount: number | null }> };

/** min/max como TEXTO decimal (nunca Number): numeric(18,4) llega a 99999999999999.9999, más de lo que un double representa. */
type Opciones = { min: string; max: string; decimales: number };

/** Compara dos decimales NO negativos canónicos (sin ceros a la izquierda; fracción sin ceros finales) sin usar Number. */
function compararDecimales(a: { entera: string; fraccion: string }, b: { entera: string; fraccion: string }): number {
  if (a.entera.length !== b.entera.length) return a.entera.length < b.entera.length ? -1 : 1;
  if (a.entera !== b.entera) return a.entera < b.entera ? -1 : 1;

  const largo = Math.max(a.fraccion.length, b.fraccion.length);
  const fa = a.fraccion.padEnd(largo, "0");
  const fb = b.fraccion.padEnd(largo, "0");

  return fa === fb ? 0 : fa < fb ? -1 : 1;
}

/** Parte un decimal no negativo escrito con punto en { entera sin ceros a la izquierda, fracción sin ceros finales }. */
function partirDecimal(texto: string): { entera: string; fraccion: string } {
  const [entera = "", fraccion = ""] = texto.split(".");

  return { entera: entera.replace(/^0+(?=\d)/, ""), fraccion: fraccion.replace(/0+$/, "") };
}

/** Texto canónico (punto decimal, sin ceros a la izquierda ni finales) de un numeric que PostgreSQL devuelve como texto. */
export function numericoCanonico(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "";

  const { entera, fraccion } = partirDecimal(String(valor));

  return fraccion ? `${entera}.${fraccion}` : entera;
}

/**
 * Importe/porcentaje opcional dentro de rango y con a lo sumo `decimales` decimales. Vacío/null → null.
 * Devuelve el valor CANÓNICO COMO TEXTO (punto decimal) para persistir en numeric: no hay conversión a Number en ningún
 * paso (rango y escala se validan sobre las cifras), de modo que numeric(18,4) conserva todas sus cifras. Lanza Error con el campo.
 */
export function decimalAcotado(valor: unknown, etiqueta: string, { min, max, decimales }: Opciones): string | null {
  if (valor === null || valor === undefined || valor === "") return null;

  // Un número JSON llega ya redondeado a doble precisión: solo se acepta si su texto es un decimal llano (sin exponente).
  const bruto = typeof valor === "number" ? String(valor) : typeof valor === "string" ? valor.trim() : "";

  if (typeof valor === "number" && bruto.replace(/\D/g, "").length > 15) {
    throw new Error(`${etiqueta} tiene más de 15 cifras: envíelo como texto para no perder precisión.`);
  }
  // Formato estricto: dígitos con UN solo separador decimal (punto o coma) y nada más. Nunca se quitan ni se reinterpretan
  // caracteres: signos, letras, separadores de miles (1.234,5), varios separadores o notación científica se rechazan.
  if (bruto.startsWith("-") || bruto.startsWith("+")) {
    throw new Error(`${etiqueta} no admite signo: ${bruto.startsWith("-") ? "no puede ser negativo" : "escriba el número sin el signo +"}.`);
  }
  if (!/^[0-9]+([.,][0-9]+)?$/.test(bruto)) {
    throw new Error(`${etiqueta} no es un número válido: use solo dígitos y un único separador decimal (punto o coma), sin separador de miles.`);
  }

  const [enteraBruta = "", fraccionBruta = ""] = bruto.split(/[.,]/);

  // "1.500" / "1,500": un separador seguido de exactamente 3 dígitos tras una parte entera corta es ambiguo (¿miles o decimales?).
  if (fraccionBruta.length === 3 && enteraBruta !== "0" && enteraBruta.length <= 3 && !enteraBruta.startsWith("0")) {
    throw new Error(`${etiqueta} es ambiguo ("${bruto}"): escriba el número sin separador de miles (p. ej. 1500) o con decimales explícitos (p. ej. ${enteraBruta},${fraccionBruta}0).`);
  }

  const canonico = partirDecimal(`${enteraBruta}.${fraccionBruta}`);

  if (canonico.fraccion.length > decimales) {
    throw new Error(`${etiqueta} admite como máximo ${decimales} decimales.`);
  }
  if (compararDecimales(canonico, partirDecimal(min)) < 0) throw new Error(`${etiqueta} debe ser igual o mayor a ${min}.`);
  if (compararDecimales(canonico, partirDecimal(max)) > 0) throw new Error(`${etiqueta} debe ser igual o menor a ${max}.`);

  return canonico.fraccion ? `${canonico.entera}.${canonico.fraccion}` : canonico.entera;
}

export const LIMITE_CREDITO = { min: "0", max: "99999999999999.9999", decimales: 4 } as const;
export const DESCUENTO_COMERCIAL = { min: "0", max: "100", decimales: 2 } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Condición de pago (catálogo global activo) y moneda predeterminada (catálogo `monedas` activo): existencia verificada. */
export async function validarCondicionYMoneda(db: ConsultaDb, condicionPagoId: string | null, monedaCodigo: string | null) {
  if (condicionPagoId) {
    if (!UUID.test(condicionPagoId)) throw new Error("La condición de pago seleccionada no es válida.");

    const ok = await db.query("SELECT 1 FROM condiciones_pago WHERE id = $1 AND activo = true", [condicionPagoId]);

    if (ok.rowCount !== 1) throw new Error("La condición de pago seleccionada no está disponible.");
  }

  if (monedaCodigo) {
    const ok = await db.query("SELECT 1 FROM monedas WHERE codigo = $1 AND activo = true", [monedaCodigo]);

    if (ok.rowCount !== 1) throw new Error(`La moneda predeterminada (${monedaCodigo}) no está disponible.`);
  }
}
