/**
 * Casos de regresión de la pestaña Comercial y crédito (importes, porcentaje, entrada decimal, pestaña de error).
 * No se ejecutan automáticamente: `verificarCasosComercial()` devuelve los fallos (lista vacía = todos coinciden).
 */
import { DESCUENTO_COMERCIAL, LIMITE_CREDITO, decimalAcotado } from "@/lib/clientes/comercial";
import { pestanaDeErrorApi } from "@/lib/clientes/pestanas";

export function verificarCasosComercial(): string[] {
  const fallos: string[] = [];
  const ok = (valor: unknown, opciones: typeof LIMITE_CREDITO | typeof DESCUENTO_COMERCIAL, esperado: string | null, nombre: string) => {
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
  ok("0", LIMITE_CREDITO, "0", "límite 0");
  ok("1500.5", LIMITE_CREDITO, "1500.5", "límite con decimal (no se convierte en 15005)");
  ok("1000.1234", LIMITE_CREDITO, "1000.1234", "límite con 4 decimales");
  ok("1000.12340", LIMITE_CREDITO, "1000.1234", "ceros finales no cuentan como decimales");
  falla("1000.12345", LIMITE_CREDITO, "límite con 5 decimales");
  falla("-1", LIMITE_CREDITO, "límite negativo");
  falla("abc", LIMITE_CREDITO, "límite con letras");
  falla("1e5", LIMITE_CREDITO, "notación científica");
  falla("100000000000000", LIMITE_CREDITO, "límite de 15 dígitos enteros (excede numeric(18,4))");
  ok("99999999999999", LIMITE_CREDITO, "99999999999999", "límite máximo de 14 dígitos enteros");

  // Descuento comercial numeric(5,2), 0–100
  ok("2.5", DESCUENTO_COMERCIAL, "2.5", "descuento 2.5 (no 25)");
  ok("100", DESCUENTO_COMERCIAL, "100", "descuento 100");
  falla("100.01", DESCUENTO_COMERCIAL, "descuento mayor a 100");
  falla("12.345", DESCUENTO_COMERCIAL, "descuento con 3 decimales");
  falla("-0.5", DESCUENTO_COMERCIAL, "descuento negativo");

  // F-CLI-DEC-02: sin conversión a Number; el valor canónico se conserva como texto (numeric(18,4))
  ok("99999999999999.9999", LIMITE_CREDITO, "99999999999999.9999", "máximo exacto de numeric(18,4)");
  ok("12345678901234.5678", LIMITE_CREDITO, "12345678901234.5678", "14 enteros + 4 decimales (18 cifras, más que un double)");
  ok("12345678901234,5678", LIMITE_CREDITO, "12345678901234.5678", "idem con coma decimal");
  ok("0.0001", LIMITE_CREDITO, "0.0001", "mínima unidad de escala");
  ok("0.00010", LIMITE_CREDITO, "0.0001", "ceros finales se normalizan");
  ok("000123", LIMITE_CREDITO, "123", "ceros a la izquierda se normalizan al canónico");
  ok("100.00", DESCUENTO_COMERCIAL, "100", "descuento 100.00 = 100");
  ok("99.99", DESCUENTO_COMERCIAL, "99.99", "descuento 99.99");
  ok("0,01", DESCUENTO_COMERCIAL, "0.01", "descuento 0,01");
  falla("100000000000000", LIMITE_CREDITO, "15 dígitos enteros");
  falla("99999999999999.99991", LIMITE_CREDITO, "5 decimales");
  falla("100000000000000.0001", LIMITE_CREDITO, "supera el máximo por la parte entera");
  falla("99999999999999.99999", LIMITE_CREDITO, "no se redondea hacia el máximo");
  falla("100.0001", DESCUENTO_COMERCIAL, "descuento 100.0001 (también excede la escala)");
  falla("100.01", DESCUENTO_COMERCIAL, "descuento por encima de 100");
  falla(12345678901234.5678, LIMITE_CREDITO, "número JSON con más de 15 cifras (ya perdió precisión): debe enviarse como texto");
  falla(1e21, LIMITE_CREDITO, "número JSON en notación exponencial");
  // F-CLI-DEC-01: ninguna entrada se transforma en otra; coma o punto como ÚNICO separador decimal
  ok("2,5", DESCUENTO_COMERCIAL, "2.5", "coma decimal válida");
  ok("2.5", DESCUENTO_COMERCIAL, "2.5", "punto decimal válido");
  ok("1500,5", LIMITE_CREDITO, "1500.5", "límite con coma decimal");
  ok("0,125", LIMITE_CREDITO, "0.125", "0,125 (parte entera 0): decimal legítimo de 3 cifras");
  ok("1000.1234", LIMITE_CREDITO, "1000.1234", "4 decimales con punto");
  ok("1234567", LIMITE_CREDITO, "1234567", "entero sin separadores");
  ok(1500.5, LIMITE_CREDITO, "1500.5", "número JSON");
  falla("1.234,5", LIMITE_CREDITO, "1.234,5 (miles + decimal) NO se convierte en 1.2345");
  falla("1,234.5", LIMITE_CREDITO, "1,234.5 (miles + decimal)");
  falla("-25", LIMITE_CREDITO, "-25 NO se convierte en 25");
  falla("-25", DESCUENTO_COMERCIAL, "descuento -25");
  falla("+25", LIMITE_CREDITO, "signo + no válido");
  falla("abc12", LIMITE_CREDITO, "abc12 NO se convierte en 12");
  falla("12abc", LIMITE_CREDITO, "12abc");
  falla("1..2", LIMITE_CREDITO, "dos puntos");
  falla("1,,2", LIMITE_CREDITO, "dos comas");
  falla("1.2.3", LIMITE_CREDITO, "varios separadores");
  falla("1,5.5", LIMITE_CREDITO, "coma y punto mezclados");
  falla("1.500", LIMITE_CREDITO, "1.500 ambiguo (¿miles o decimal?)");
  falla("1,500", LIMITE_CREDITO, "1,500 ambiguo");
  falla("25.000", DESCUENTO_COMERCIAL, "25.000 ambiguo/fuera de precisión");
  falla(".5", LIMITE_CREDITO, "sin parte entera");
  falla("5.", LIMITE_CREDITO, "separador sin decimales");
  falla("1 000", LIMITE_CREDITO, "espacio como miles");
  falla("12,345", DESCUENTO_COMERCIAL, "descuento con 3 decimales");
  falla("100,01", DESCUENTO_COMERCIAL, "descuento > 100");
  falla("1e3", LIMITE_CREDITO, "notación científica");
  falla(" ", LIMITE_CREDITO, "solo espacios");

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
