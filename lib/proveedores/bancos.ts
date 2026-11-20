/** Validaciones de datos bancarios internacionales (opcionales; solo se validan si se informan). */

export type ResultadoTexto = { ok: true; valor: string } | { ok: false; error: string };

/** SWIFT/BIC: 8 u 11 caracteres alfanuméricos (4 letras de banco + 2 de país + 2 de plaza + 3 opcionales de sucursal). */
export function validarSwift(entrada: string): ResultadoTexto {
  const valor = entrada.replace(/\s/g, "").toUpperCase();

  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(valor)) {
    return { ok: false, error: "El SWIFT/BIC debe tener 8 u 11 caracteres (por ejemplo, BCOEPYPA)." };
  }

  return { ok: true, valor };
}

/** IBAN: estructura general (2 letras de país, 2 dígitos de control, hasta 30 alfanuméricos) y control módulo 97. */
export function validarIban(entrada: string): ResultadoTexto {
  const valor = entrada.replace(/\s/g, "").toUpperCase();

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(valor)) return { ok: false, error: "El IBAN no tiene una estructura válida." };

  const reordenado = valor.slice(4) + valor.slice(0, 4);
  let resto = 0;

  for (const caracter of reordenado) {
    const digitos = caracter >= "A" ? String(caracter.charCodeAt(0) - 55) : caracter;

    for (const d of digitos) resto = (resto * 10 + Number(d)) % 97;
  }

  return resto === 1 ? { ok: true, valor } : { ok: false, error: "El dígito de control del IBAN no es válido." };
}
