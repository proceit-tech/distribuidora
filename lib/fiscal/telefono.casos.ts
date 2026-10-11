/**
 * Casos de regresión de teléfono/celular por país (retificación 2026-10-11) y del día preferido de cobro (DEC-CLI-COB-06).
 * No se ejecutan automáticamente (el notebook no ejecuta nada): `verificarCasosTelefonoYCobro()` devuelve los fallos
 * (lista vacía = todos coinciden). Los números son ficticios.
 */
import { diaDeCobroEnMes, ultimoDiaDelMes, validarDiaPreferidoCobro } from "@/lib/clientes/dia-cobro";
import { validarTelefono, type CampoTelefonico, type TelefonoForm } from "@/lib/fiscal/telefono";

type CasoTel = { nombre: string; campo: CampoTelefonico; entrada: Partial<TelefonoForm> & { numero: string }; ok: boolean; esperado?: Partial<{ pais: string; ddi: string; area: string | null; numero: string }>; error?: string };

const pry = { pais: "PRY" };

export const CASOS_TELEFONO: CasoTel[] = [
  // Paraguay: sin DDD; DDI +595 asociado; ceros preservados; D214 6–15 / D215 10–20 sobre el número paraguayo
  { nombre: "PRY teléfono con prefijo local, DDI automático", campo: "telefono", entrada: { ...pry, numero: "021 123-456" }, ok: true, esperado: { pais: "PRY", ddi: "595", area: null, numero: "021123456" } },
  { nombre: "PRY celular con cero inicial preservado", campo: "celular", entrada: { ...pry, numero: "0981 123456" }, ok: true, esperado: { ddi: "595", numero: "0981123456" } },
  { nombre: "PRY teléfono 5 dígitos", campo: "telefono", entrada: { ...pry, numero: "12345" }, ok: false },
  { nombre: "PRY teléfono 16 dígitos", campo: "telefono", entrada: { ...pry, numero: "1234567890123456" }, ok: false },
  { nombre: "PRY celular 9 dígitos", campo: "celular", entrada: { ...pry, numero: "098112345" }, ok: false },
  { nombre: "PRY con código de área separado", campo: "telefono", entrada: { ...pry, area: "21", numero: "123456" }, ok: false },
  { nombre: "PRY número que empieza por los dígitos del DDI (595…) no se rechaza", campo: "celular", entrada: { ...pry, numero: "5951234567" }, ok: true, esperado: { numero: "5951234567" } },
  // Otros países: área condicional y largo por plan
  { nombre: "BRA DDD 11 + celular de 9 dígitos", campo: "celular", entrada: { pais: "BRA", area: "11", numero: "98765-4321" }, ok: true, esperado: { pais: "BRA", ddi: "55", area: "11", numero: "987654321" } },
  { nombre: "BRA fijo de 8 dígitos", campo: "telefono", entrada: { pais: "BRA", area: "21", numero: "3456 7890" }, ok: true },
  { nombre: "BRA sin DDD", campo: "celular", entrada: { pais: "BRA", numero: "987654321" }, ok: false },
  { nombre: "BRA DDD con 0 de discado nacional", campo: "celular", entrada: { pais: "BRA", area: "011", numero: "987654321" }, ok: false },
  { nombre: "ARG área 3 dígitos + número de 7 (total 10)", campo: "telefono", entrada: { pais: "ARG", area: "351", numero: "4123456" }, ok: true, esperado: { ddi: "54", area: "351" } },
  { nombre: "ARG con 15 sobrante (total 12)", campo: "celular", entrada: { pais: "ARG", area: "351", numero: "15412345678" }, ok: false },
  { nombre: "URY celular de 8 dígitos sin campo de área", campo: "celular", entrada: { pais: "URY", numero: "99 123 456" }, ok: true, esperado: { ddi: "598", area: null, numero: "99123456" } },
  { nombre: "URY con campo de área", campo: "celular", entrada: { pais: "URY", area: "2", numero: "99123456" }, ok: false },
  { nombre: "URY con 0 de discado nacional", campo: "celular", entrada: { pais: "URY", numero: "099123456" }, ok: false },
  { nombre: "USA área 3 + 7", campo: "telefono", entrada: { pais: "USA", area: "305", numero: "555-0123" }, ok: true, esperado: { ddi: "1" } },
  { nombre: "CHL celular de 9 dígitos", campo: "celular", entrada: { pais: "CHL", numero: "9 8765 4321" }, ok: true },
  { nombre: "otro país con DDI manual", campo: "telefono", entrada: { pais: "OTR", ddi: "81", numero: "9012345678" }, ok: true, esperado: { pais: "OTR", ddi: "81" } },
  { nombre: "otro país sin DDI", campo: "telefono", entrada: { pais: "OTR", numero: "9012345678" }, ok: false },
  { nombre: "otro país con DDI + número > 15", campo: "telefono", entrada: { pais: "OTR", ddi: "81", numero: "12345678901234" }, ok: false },
  // Formatos ambiguos y país
  { nombre: "signo + rechazado", campo: "celular", entrada: { ...pry, numero: "+595981123456" }, ok: false },
  { nombre: "prefijo internacional 00 rechazado", campo: "celular", entrada: { ...pry, numero: "00595981123456" }, ok: false },
  { nombre: "letras rechazadas", campo: "celular", entrada: { ...pry, numero: "0981ABC456" }, ok: false },
  { nombre: "número sin país", campo: "celular", entrada: { pais: "", numero: "0981123456" }, ok: false },
  { nombre: "país no configurado (ZZZ)", campo: "celular", entrada: { pais: "ZZZ", numero: "0981123456" }, ok: false },
  { nombre: "campo vacío es válido (opcional) aunque el país sea el predeterminado", campo: "telefono", entrada: { ...pry, numero: "" }, ok: true, esperado: { numero: undefined } },
  { nombre: "área sin número", campo: "telefono", entrada: { pais: "BRA", area: "11", numero: "" }, ok: false },
];

export function verificarCasosTelefonoYCobro(): string[] {
  const fallos: string[] = [];

  for (const c of CASOS_TELEFONO) {
    const r = validarTelefono(c.campo, { pais: "", ddi: "", area: "", ...c.entrada });
    if (r.ok !== c.ok) {
      fallos.push(`${c.nombre}: esperado ok=${c.ok}, obtenido ok=${r.ok}${r.ok ? "" : ` (${r.error})`}`);
    } else if (r.ok && c.esperado) {
      const v = r.valor as unknown as Record<string, string | null>;
      for (const [k, esperado] of Object.entries(c.esperado)) {
        if (k === "numero" && esperado === undefined) {
          if (v.numero !== null) fallos.push(`${c.nombre}: número vacío debe ser null`);
        } else if (v[k] !== esperado) {
          fallos.push(`${c.nombre}: ${k} esperado ${esperado}, obtenido ${v[k]}`);
        }
      }
    }
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
