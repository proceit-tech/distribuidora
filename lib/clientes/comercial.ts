/**
 * Validaciones compartidas de la pestaña Comercial y crédito (alta y edición): importes y porcentajes acotados a la
 * precisión de las columnas (nunca se redondea ni se trunca en silencio) y catálogos de condición de pago y moneda.
 * El límite de crédito se guarda como numeric(18,4) y el descuento como numeric(5,2) (NEX-005).
 */
type ConsultaDb = { query: (texto: string, valores?: unknown[]) => Promise<{ rowCount: number | null }> };

type Opciones = { min: number; max: number; decimales: number };

/** Número opcional dentro de rango y con a lo sumo `decimales` decimales. Vacío/null → null. Lanza Error con el campo. */
export function decimalAcotado(valor: unknown, etiqueta: string, { min, max, decimales }: Opciones): number | null {
  if (valor === null || valor === undefined || valor === "") return null;

  const bruto = typeof valor === "number" ? String(valor) : typeof valor === "string" ? valor.trim() : "";

  // Formato estricto: dígitos con UN solo separador decimal (punto o coma) y nada más. Nunca se quitan ni se reinterpretan
  // caracteres: signos, letras, separadores de miles (1.234,5), varios separadores o notación científica se rechazan.
  if (bruto.startsWith("-") || bruto.startsWith("+")) {
    throw new Error(`${etiqueta} no admite signo: ${bruto.startsWith("-") ? "no puede ser negativo" : "escriba el número sin el signo +"}.`);
  }
  if (!/^[0-9]+([.,][0-9]+)?$/.test(bruto)) {
    throw new Error(`${etiqueta} no es un número válido: use solo dígitos y un único separador decimal (punto o coma), sin separador de miles.`);
  }

  const [entera = "", fraccion = ""] = bruto.split(/[.,]/);

  // "1.500" / "1,500": un separador seguido de exactamente 3 dígitos tras una parte entera corta es ambiguo (¿miles o decimales?).
  if (fraccion.length === 3 && entera !== "0" && entera.length <= 3 && !entera.startsWith("0")) {
    throw new Error(`${etiqueta} es ambiguo ("${bruto}"): escriba el número sin separador de miles (p. ej. 1500) o con decimales explícitos (p. ej. ${entera},${fraccion}0).`);
  }
  if (fraccion.replace(/0+$/, "").length > decimales) {
    throw new Error(`${etiqueta} admite como máximo ${decimales} decimales.`);
  }

  const numero = Number(`${entera}.${fraccion || "0"}`);

  if (numero < min) throw new Error(`${etiqueta} debe ser igual o mayor a ${min}.`);
  if (numero > max) throw new Error(`${etiqueta} debe ser igual o menor a ${max}.`);

  return numero;
}

export const LIMITE_CREDITO = { min: 0, max: 99999999999999, decimales: 4 } as const;
export const DESCUENTO_COMERCIAL = { min: 0, max: 100, decimales: 2 } as const;

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
