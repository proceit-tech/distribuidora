/**
 * Casos de regresión de la pestaña Comercial y crédito (importes, porcentaje, entrada decimal, pestaña de error).
 * No se ejecutan automáticamente: `verificarCasosComercial()` devuelve los fallos (lista vacía = todos coinciden).
 */
import { DESCUENTO_COMERCIAL, LIMITE_CREDITO, decimalAcotado, normalizarDecimalEntrada } from "@/lib/clientes/comercial";
import { pestanaDeErrorApi } from "@/lib/clientes/pestanas";

export function verificarCasosComercial(): string[] {
  const fallos: string[] = [];
  const ok = (valor: unknown, opciones: typeof LIMITE_CREDITO | typeof DESCUENTO_COMERCIAL, esperado: number | null, nombre: string) => {
    try {
      const r = decimalAcotado(valor, "Campo", opciones);
      if (r !== esperado) fallos.push(`${nombre}: esperado ${esperado}, obtenido ${r}`);
    } catch (e) {
      fallos.push(`${nombre}: no debía fallar (${(e as Error).message})`);
    }
  };
  const falla = (valor: unknown, opciones: typeof LIMITE_CREDITO | typeof DESCUENTO_COMERCIAL, nombre: string) => {
    try {
      decimalAcotado(valor, "Campo", opciones);
      fallos.push(`${nombre}: debía fallar`);
    } catch {
      /* esperado */
    }
  };

  // Límite de crédito numeric(18,4)
  ok("", LIMITE_CREDITO, null, "límite vacío");
  ok("0", LIMITE_CREDITO, 0, "límite 0");
  ok("1500.5", LIMITE_CREDITO, 1500.5, "límite con decimal (no se convierte en 15005)");
  ok("1000.1234", LIMITE_CREDITO, 1000.1234, "límite con 4 decimales");
  ok("1000.12340", LIMITE_CREDITO, 1000.1234, "ceros finales no cuentan como decimales");
  falla("1000.12345", LIMITE_CREDITO, "límite con 5 decimales");
  falla("-1", LIMITE_CREDITO, "límite negativo");
  falla("abc", LIMITE_CREDITO, "límite con letras");
  falla("1e5", LIMITE_CREDITO, "notación científica");
  falla("100000000000000", LIMITE_CREDITO, "límite de 15 dígitos enteros (excede numeric(18,4))");
  ok("99999999999999", LIMITE_CREDITO, 99999999999999, "límite máximo de 14 dígitos enteros");

  // Descuento comercial numeric(5,2), 0–100
  ok("2.5", DESCUENTO_COMERCIAL, 2.5, "descuento 2.5 (no 25)");
  ok("100", DESCUENTO_COMERCIAL, 100, "descuento 100");
  falla("100.01", DESCUENTO_COMERCIAL, "descuento mayor a 100");
  falla("12.345", DESCUENTO_COMERCIAL, "descuento con 3 decimales");
  falla("-0.5", DESCUENTO_COMERCIAL, "descuento negativo");

  // Entrada decimal: coma o punto, un solo separador, sin miles
  for (const [entrada, esperado] of [["2,5", "2.5"], ["2.5", "2.5"], ["1.234,5", "1.2345"], ["abc12", "12"], ["1..2", "1.2"], ["", ""]] as Array<[string, string]>) {
    if (normalizarDecimalEntrada(entrada) !== esperado) fallos.push(`normalizarDecimalEntrada("${entrada}") ≠ "${esperado}"`);
  }

  // Pestaña de los mensajes de la API (alta y edición comparten la misma función)
  for (const [mensaje, pestana] of [
    ["El límite de crédito debe ser igual o mayor a 0.", "comercial"],
    ["La moneda predeterminada (XXX) no está disponible.", "comercial"],
    ["La condición de pago seleccionada no está disponible.", "comercial"],
    ["Cada contacto debe tener nombre.", "contactos"],
    ["Informe la dirección de cada ubicación registrada.", "direcciones"],
    ["La frecuencia de entrega no es válida.", "logistica"],
    ["Existe un tipo de documento de cliente no válido.", "documentos"],
    ["Ya existe un cliente con esa identificación.", "fiscal"],
  ] as const) {
    if (pestanaDeErrorApi(mensaje) !== pestana) fallos.push(`pestanaDeErrorApi("${mensaje}") ≠ ${pestana}`);
  }

  return fallos;
}
