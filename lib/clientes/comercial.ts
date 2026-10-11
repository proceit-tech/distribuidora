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

  const texto = typeof valor === "number" ? String(valor) : typeof valor === "string" ? valor.trim() : "";

  if (!/^-?[0-9]+(\.[0-9]+)?$/.test(texto)) throw new Error(`${etiqueta} no es un número válido.`);

  const numero = Number(texto);
  const fraccion = texto.split(".")[1] ?? "";

  if (fraccion.replace(/0+$/, "").length > decimales) {
    throw new Error(`${etiqueta} admite como máximo ${decimales} decimales.`);
  }
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

/**
 * Entrada de un importe/porcentaje en un campo de texto: acepta dígitos y un único separador decimal (punto o coma);
 * devuelve el valor canónico con punto decimal. No interpreta "." como separador de miles (evita convertir 2.5 en 25).
 */
export function normalizarDecimalEntrada(valor: string): string {
  const limpio = valor.replace(",", ".").replace(/[^0-9.]/g, "");
  const primero = limpio.indexOf(".");

  return primero === -1 ? limpio : `${limpio.slice(0, primero + 1)}${limpio.slice(primero + 1).replace(/\./g, "")}`;
}
