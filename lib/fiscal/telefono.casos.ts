/**
 * Casos de regresión de DDI + teléfono/celular fiscal (D214/D215) y del día preferido de cobro (DEC-CLI-COB-06).
 * No se ejecutan automáticamente (el notebook no ejecuta nada): `verificarCasosTelefonoYCobro()` devuelve los fallos
 * (lista vacía = todos coinciden).
 */
import { diaDeCobroEnMes, ultimoDiaDelMes, validarDiaPreferidoCobro } from "@/lib/clientes/dia-cobro";
import { validarTelefonoFiscal, type CampoTelefonico } from "@/lib/fiscal/telefono";

type CasoTel = { nombre: string; campo: CampoTelefonico; ddi: string; numero: string; ok: boolean; numeroCanonico?: string };

export const CASOS_TELEFONO: CasoTel[] = [
  { nombre: "teléfono PRY con prefijo de ciudad (9 dígitos)", campo: "telefono", ddi: "595", numero: "021 123-456", ok: true, numeroCanonico: "021123456" },
  { nombre: "teléfono 6 dígitos (mínimo)", campo: "telefono", ddi: "54", numero: "123456", ok: true, numeroCanonico: "123456" },
  { nombre: "teléfono 15 dígitos (máximo)", campo: "telefono", ddi: "1", numero: "123456789012345", ok: true },
  { nombre: "teléfono 5 dígitos", campo: "telefono", ddi: "595", numero: "12345", ok: false },
  { nombre: "teléfono 16 dígitos", campo: "telefono", ddi: "595", numero: "1234567890123456", ok: false },
  { nombre: "celular 10 dígitos con cero inicial preservado", campo: "celular", ddi: "595", numero: "0981 123456", ok: true, numeroCanonico: "0981123456" },
  { nombre: "celular 20 dígitos (máximo)", campo: "celular", ddi: "55", numero: "12345678901234567890", ok: true },
  { nombre: "celular 9 dígitos", campo: "celular", ddi: "595", numero: "098112345", ok: false },
  { nombre: "celular 21 dígitos", campo: "celular", ddi: "595", numero: "123456789012345678901", ok: false },
  { nombre: "número con letras", campo: "celular", ddi: "595", numero: "0981ABC456", ok: false },
  { nombre: "número con signo + (DDI dentro del número)", campo: "celular", ddi: "595", numero: "+595981123456", ok: false },
  { nombre: "número sin DDI", campo: "celular", ddi: "", numero: "0981123456", ok: false },
  { nombre: "DDI de 4 dígitos", campo: "celular", ddi: "5955", numero: "0981123456", ok: false },
  { nombre: "DDI con letras", campo: "telefono", ddi: "ab", numero: "021123456", ok: false },
  { nombre: "campo vacío es válido (opcional) y no exige DDI", campo: "telefono", ddi: "", numero: "", ok: true, numeroCanonico: "" },
];

export function verificarCasosTelefonoYCobro(): string[] {
  const fallos: string[] = [];

  for (const c of CASOS_TELEFONO) {
    const r = validarTelefonoFiscal(c.campo, c.ddi, c.numero);
    if (r.ok !== c.ok) fallos.push(`${c.nombre}: esperado ok=${c.ok}, obtenido ok=${r.ok}`);
    else if (r.ok && c.numeroCanonico !== undefined && r.numero !== c.numeroCanonico) fallos.push(`${c.nombre}: canónico ${r.numero} ≠ ${c.numeroCanonico}`);
  }

  for (const [valor, ok, dia] of [
    ["1", true, 1], ["31", true, 31], [15, true, 15], ["", true, null], [null, true, null],
    ["0", false, null], ["32", false, null], ["-1", false, null], ["15.5", false, null], [15.5, false, null], ["abc", false, null],
  ] as Array<[unknown, boolean, number | null]>) {
    const r = validarDiaPreferidoCobro(valor);
    if (r.ok !== ok || (r.ok && r.dia !== dia)) fallos.push(`día de cobro ${JSON.stringify(valor)}: resultado inesperado`);
  }

  const fechas: Array<[number, number, number, number]> = [
    [2025, 4, 30, 31], // abril: 31 → 30
    [2025, 2, 28, 31], // febrero común: 31 → 28
    [2024, 2, 29, 31], // febrero bisiesto: 31 → 29
    [2025, 1, 31, 31], // enero: 31 → 31
    [2025, 6, 30, 30], // junio
    [2025, 4, 15, 15], // día menor no cambia
  ];
  for (const [anio, mes, esperado, preferido] of fechas) {
    if (diaDeCobroEnMes(preferido, anio, mes) !== esperado) fallos.push(`diaDeCobroEnMes(${preferido}, ${anio}-${mes}) ≠ ${esperado}`);
  }
  if (ultimoDiaDelMes(2100, 2) !== 28) fallos.push("2100 no es bisiesto (febrero = 28)");
  if (ultimoDiaDelMes(2000, 2) !== 29) fallos.push("2000 es bisiesto (febrero = 29)");

  return fallos;
}
