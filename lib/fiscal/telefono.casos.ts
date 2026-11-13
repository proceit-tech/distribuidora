/**
 * Casos de regresión de teléfono/celular por país (retificación 2026-10-11) y del día preferido de cobro (DEC-CLI-COB-06).
 * No se ejecutan automáticamente (el notebook no ejecuta nada): `verificarCasosTelefonoYCobro()` devuelve los fallos
 * (lista vacía = todos coinciden). Los números son ficticios.
 */
import { diaDeCobroEnMes, ultimoDiaDelMes, validarDiaPreferidoCobro } from "@/lib/clientes/dia-cobro";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HUELLA_CATALOGO_MD5, PAISES_DDI } from "@/lib/fiscal/paises-ddi";
import { PLANES_TELEFONIA, advertenciaTelefono, avisosTelefono, buscarPaisesTelefonia, planDe, validarTelefono, type CampoTelefonico, type TelefonoForm } from "@/lib/fiscal/telefono";

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
  { nombre: "BRA sin DDD: solo aviso (regla no bloqueante)", campo: "celular", entrada: { pais: "BRA", numero: "987654321" }, ok: true },
  { nombre: "BRA DDD con 0 de discado nacional: solo aviso", campo: "celular", entrada: { pais: "BRA", area: "011", numero: "987654321" }, ok: true },
  { nombre: "ARG área 3 dígitos + número de 7 (total 10)", campo: "telefono", entrada: { pais: "ARG", area: "351", numero: "4123456" }, ok: true, esperado: { ddi: "54", area: "351" } },
  { nombre: "ARG con 15 sobrante (área 3 + número 9 = 12): largo atípico solo advierte, no rechaza", campo: "celular", entrada: { pais: "ARG", area: "351", numero: "154123456" }, ok: true },
  { nombre: "ARG excede los 15 dígitos E.164 con el DDI (área 3 + número 11 = 14 + DDI 2)", campo: "celular", entrada: { pais: "ARG", area: "351", numero: "15412345678" }, ok: false },
  { nombre: "URY celular de 8 dígitos sin campo de área", campo: "celular", entrada: { pais: "URY", numero: "99 123 456" }, ok: true, esperado: { ddi: "598", area: null, numero: "99123456" } },
  { nombre: "URY con campo de área", campo: "celular", entrada: { pais: "URY", area: "2", numero: "99123456" }, ok: false },
  { nombre: "URY con 0 de discado nacional: solo advierte, no rechaza", campo: "celular", entrada: { pais: "URY", numero: "099123456" }, ok: true },
  { nombre: "USA área 3 + 7", campo: "telefono", entrada: { pais: "USA", area: "305", numero: "555-0123" }, ok: true, esperado: { ddi: "1" } },
  { nombre: "CHL celular de 9 dígitos", campo: "celular", entrada: { pais: "CHL", numero: "9 8765 4321" }, ok: true },
  // Catálogo mundial: países lejanos / planes no detallados (solo DDI + límites E.164), ISO real, nunca OTR
  { nombre: "JPN (sin plan detallado) conserva ISO y DDI 81", campo: "telefono", entrada: { pais: "JPN", numero: "90 1234 5678" }, ok: true, esperado: { pais: "JPN", ddi: "81", area: null, numero: "9012345678" } },
  { nombre: "ZWE DDI 263", campo: "celular", entrada: { pais: "ZWE", numero: "771234567" }, ok: true, esperado: { pais: "ZWE", ddi: "263" } },
  { nombre: "ISL (DDI 354, números de 7 dígitos)", campo: "telefono", entrada: { pais: "ISL", numero: "5551234" }, ok: true, esperado: { pais: "ISL", ddi: "354" } },
  { nombre: "ITA conserva el 0 inicial de los fijos", campo: "telefono", entrada: { pais: "ITA", numero: "06 1234 5678" }, ok: true, esperado: { numero: "0612345678" } },
  { nombre: "país sin plan no admite campo de área", campo: "telefono", entrada: { pais: "JPN", area: "3", numero: "12345678" }, ok: false },
  { nombre: "DDI + número > 15 dígitos rechazado (E.164)", campo: "telefono", entrada: { pais: "JPN", numero: "12345678901234" }, ok: false },
  { nombre: "número corto: sin mínimo universal UIT, solo aviso", campo: "telefono", entrada: { pais: "JPN", numero: "123" }, ok: true },
  { nombre: "OTR ya no es país válido (registro anterior: pedir país real)", campo: "telefono", entrada: { pais: "OTR", ddi: "81", numero: "9012345678" }, ok: false },
  // DDI compartido: +1 (NANP), +7, +44, +590, +599, +262, +358
  { nombre: "DOM comparte +1 con área 809", campo: "celular", entrada: { pais: "DOM", area: "809", numero: "555-0123" }, ok: true, esperado: { pais: "DOM", ddi: "1", area: "809" } },
  { nombre: "PRI comparte +1 con área 787", campo: "telefono", entrada: { pais: "PRI", area: "787", numero: "5550123" }, ok: true, esperado: { pais: "PRI", ddi: "1" } },
  { nombre: "JAM +1 sin área: solo aviso (no se asume obligatoriedad)", campo: "telefono", entrada: { pais: "JAM", numero: "5550123" }, ok: true },
  { nombre: "KAZ comparte +7 con Rusia", campo: "celular", entrada: { pais: "KAZ", numero: "7012345678" }, ok: true, esperado: { pais: "KAZ", ddi: "7" } },
  { nombre: "GGY comparte +44 con Reino Unido", campo: "telefono", entrada: { pais: "GGY", numero: "1481123456" }, ok: true, esperado: { pais: "GGY", ddi: "44" } },
  { nombre: "GLP comparte +590 con San Bartolomé", campo: "celular", entrada: { pais: "GLP", numero: "690123456" }, ok: true, esperado: { pais: "GLP", ddi: "590" } },
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

/** Cobertura mundial: invariantes del catálogo, DDI compartido, búsqueda, advertencias no bloqueantes y registros anteriores. */
export function verificarCatalogoMundial(): string[] {
  const fallos: string[] = [];
  const vistos = new Set<string>();

  for (const fila of PAISES_DDI) {
    const [iso, nombre, ddi] = fila.split("|");

    if (!/^[A-Z]{3}$/.test(iso ?? "")) fallos.push(`ISO inválido: ${fila}`);
    if (!nombre) fallos.push(`sin nombre: ${fila}`);
    if (!/^[0-9]{1,3}$/.test(ddi ?? "")) fallos.push(`DDI inválido: ${fila}`);
    if (vistos.has(iso)) fallos.push(`ISO duplicado: ${iso}`);
    vistos.add(iso);
    if (!planDe(iso)) fallos.push(`sin plan en PLANES_TELEFONIA: ${iso}`);
  }

  if (PAISES_DDI.length !== 247) fallos.push(`catálogo con ${PAISES_DDI.length} entradas (se esperaban 247)`);
  if (PLANES_TELEFONIA.length !== PAISES_DDI.length) fallos.push("PLANES_TELEFONIA no cubre todo el catálogo");
  if (PLANES_TELEFONIA[0]?.iso !== "PRY") fallos.push("Paraguay debe ser el primero");
  if (planDe("OTR")) fallos.push("OTR no puede ser un país del catálogo");

  const compartido = (ddi: string) => PLANES_TELEFONIA.filter((p) => p.ddi === ddi).length;
  for (const [ddi, minimo] of [["1", 20], ["7", 2], ["44", 4], ["590", 3], ["599", 2], ["262", 2]] as Array<[string, number]>) {
    if (compartido(ddi) < minimo) fallos.push(`DDI compartido +${ddi}: se esperaban ≥${minimo} destinos`);
  }

  // Búsqueda por nombre (con/sin acentos), ISO y DDI (con/sin "+")
  const busquedas: Array<[string, string]> = [["paraguay", "PRY"], ["japon", "JPN"], ["BRA", "BRA"], ["+595", "PRY"], ["81", "JPN"], ["+1", "USA"], ["peru", "PER"], ["tailandia", "THA"]];
  for (const [texto, iso] of busquedas) {
    if (!buscarPaisesTelefonia(texto).some((p) => p.iso === iso)) fallos.push(`búsqueda "${texto}" no encuentra ${iso}`);
  }
  if (buscarPaisesTelefonia("zzzz").length !== 0) fallos.push("búsqueda sin coincidencias debe quedar vacía");

  // Advertencias NO bloqueantes
  if (advertenciaTelefono({ pais: "ARG", ddi: "54", area: "351", numero: "15412345678" }) === null) fallos.push("ARG largo atípico debe advertir");
  if (advertenciaTelefono({ pais: "ARG", ddi: "54", area: "351", numero: "4123456" }) !== null) fallos.push("ARG 10 dígitos no debe advertir");
  if (advertenciaTelefono({ pais: "JPN", ddi: "81", area: "", numero: "9012345678" }) !== null) fallos.push("país genérico no advierte");

  // Aislamiento entre empresas / repetición: validar el mismo número dos veces siempre es válido (no hay unicidad ni contexto de empresa)
  const mismo = { pais: "PRY", ddi: "595", area: "", numero: "0981123456" };
  if (!validarTelefono("celular", mismo).ok || !validarTelefono("celular", mismo).ok) fallos.push("el mismo número debe poder repetirse");

  return fallos;
}

/** C9/C10: destinos sin ISO propio, huella canónica del catálogo, avisos no bloqueantes y coherencia con la aptitud. */
export function verificarCatalogoC8C9C10(): string[] {
  const fallos: string[] = [];

  // C8: huella canónica == constante exportada (la misma se verifica en SQL con scripts/verificar-paises-telefonia.sql)
  const filas = PAISES_DDI.map((f) => {
    const [iso, nombre, ddi, origen = "ISO"] = f.split("|");
    return `${iso}|${nombre}|${ddi}|${origen}`;
  }).sort((a, b) => (a.split("|")[0]! < b.split("|")[0]! ? -1 : 1));
  const huella = createHash("md5").update(`${filas.join("\n")}\n`, "utf8").digest("hex");

  if (huella !== HUELLA_CATALOGO_MD5) fallos.push(`huella del catálogo ${huella} ≠ HUELLA_CATALOGO_MD5 ${HUELLA_CATALOGO_MD5}: actualizar la constante y el seed SQL`);

  // C9: destinos UIT sin ISO propio o con identificación especial
  const esperados: Array<[string, string, string]> = [["XAC", "247", "USR"], ["IOT", "246", "ISO"], ["SHN", "290", "ISO"], ["VAT", "39", "ISO"], ["XKX", "383", "USR"]];
  for (const [iso, ddi, origen] of esperados) {
    const p = planDe(iso);
    if (!p || p.ddi !== ddi || p.origen !== origen) fallos.push(`destino ${iso}: se esperaba +${ddi} origen ${origen}`);
  }
  if (!buscarPaisesTelefonia("ascension").some((p) => p.iso === "XAC")) fallos.push("búsqueda 'ascension' no encuentra XAC");
  if (!buscarPaisesTelefonia("diego").some((p) => p.iso === "IOT")) fallos.push("búsqueda 'diego' no encuentra IOT");
  if (!buscarPaisesTelefonia("+247").some((p) => p.iso === "XAC")) fallos.push("búsqueda '+247' no encuentra XAC");
  if (!validarTelefono("telefono", { pais: "XAC", ddi: "", area: "", numero: "6000" }).ok) fallos.push("número corto de Ascensión (+247) no debe bloquearse");

  // C10: sin mínimo universal; máximo E.164; avisos no bloqueantes
  if (!validarTelefono("telefono", { pais: "JPN", ddi: "", area: "", numero: "12" }).ok) fallos.push("sin mínimo universal: 2 dígitos válidos");
  if (validarTelefono("telefono", { pais: "JPN", ddi: "", area: "", numero: "12345678901234" }).ok) fallos.push("JPN +81 con 14 dígitos = 16 excede 15");
  if (!validarTelefono("telefono", { pais: "JPN", ddi: "", area: "", numero: "1234567890123" }).ok) fallos.push("JPN +81 con 13 dígitos = 15 es válido");
  if (avisosTelefono({ pais: "BRA", ddi: "55", area: "", numero: "987654321" }).length === 0) fallos.push("BRA sin DDD debe avisar");
  if (avisosTelefono({ pais: "USA", ddi: "1", area: "", numero: "5550123" }).length === 0) fallos.push("+1 sin área debe avisar");
  if (avisosTelefono({ pais: "USA", ddi: "1", area: "305", numero: "5550123" }).length !== 0) fallos.push("USA área 305 + 7 dígitos no avisa");
  if (avisosTelefono({ pais: "PRY", ddi: "595", area: "", numero: "0981123456" }).length !== 0) fallos.push("PRY no emite avisos de plan extranjero");

  return fallos;
}

const huellaDe = (filas: readonly string[]) => {
  const canonicas = filas
    .map((f) => {
      const [iso, nombre, ddi, origen = "ISO"] = f.split("|");
      return `${iso}|${nombre}|${ddi}|${origen}`;
    })
    .sort((a, b) => (a.split("|")[0]! < b.split("|")[0]! ? -1 : 1));

  return createHash("md5").update(`${canonicas.join("\n")}\n`, "utf8").digest("hex");
};

/** Filas del seed de NEX-027 reconstruidas desde el SQL versionado (mismo formato canónico que el catálogo TypeScript). */
function filasSeedSql(): string[] {
  const sql = readFileSync(join(process.cwd(), "documentacao/banco/nexit/v1/migraciones/NEX-027-catalogo-paises-telefonia-canonico.sql"), "utf8");
  const filas: string[] = [];

  for (const m of sql.matchAll(/\('([A-Z]{3})', '([^']*)', '([0-9]{1,3})', '(ISO|USR)', (NULL|'[A-Z]{3}'), true\)/g)) {
    const origen = m[4] === "USR" ? `USR${m[5] === "NULL" ? "" : `:${m[5]!.replace(/'/g, "")}`}` : "ISO";
    filas.push(`${m[1]}|${m[2]}|${m[3]}|${origen}`);
  }

  return filas;
}

/** C11: coherencia TypeScript ↔ seed SQL ↔ huella ↔ script de verificación, y detección de divergencias simuladas. */
export function verificarCoherenciaYDivergenciasCatalogo(): string[] {
  const fallos: string[] = [];
  const base = [...PAISES_DDI];

  if (huellaDe(base) !== HUELLA_CATALOGO_MD5) fallos.push("la huella del catálogo TypeScript no coincide con HUELLA_CATALOGO_MD5");

  // Seed SQL versionado == catálogo TypeScript (mismo conjunto, mismos DDI/nombres/orígenes)
  const sql = filasSeedSql();
  if (sql.length !== base.length) fallos.push(`seed SQL con ${sql.length} filas, catálogo TypeScript con ${base.length}`);
  if (huellaDe(sql) !== HUELLA_CATALOGO_MD5) fallos.push("la huella del seed SQL NEX-027 no coincide con HUELLA_CATALOGO_MD5");

  // El script de verificación debe llevar la misma huella
  const verificacion = readFileSync(join(process.cwd(), "documentacao/banco/nexit/v1/scripts/verificar-paises-telefonia.sql"), "utf8");
  if (!verificacion.includes(HUELLA_CATALOGO_MD5)) fallos.push("scripts/verificar-paises-telefonia.sql no contiene la huella vigente");

  // Divergencias simuladas: toda alteración debe cambiar la huella
  const divergencias: Array<[string, string[]]> = [
    ["DDI cambiado (VAT 39→379)", base.map((f) => (f.startsWith("VAT|") ? "VAT|Ciudad del Vaticano|379" : f))],
    ["país eliminado (PCN)", base.filter((f) => !f.startsWith("PCN|"))],
    ["país agregado (ZZZ)", [...base, "ZZZ|Inventado|999"]],
    ["nombre alterado (JPN)", base.map((f) => (f.startsWith("JPN|") ? "JPN|Japon|81" : f))],
    ["origen alterado (XAC sin jurisdicción)", base.map((f) => (f.startsWith("XAC|") ? "XAC|Ascensión (identificador interno)|247|USR" : f))],
    ["ISO duplicado", [...base, "PRY|Paraguay|595"]],
    ["fila de seed SQL perdida (SQL)", sql.slice(1)],
  ];
  for (const [nombre, filas] of divergencias) {
    if (huellaDe(filas) === HUELLA_CATALOGO_MD5) fallos.push(`divergencia no detectada por la huella: ${nombre}`);
  }

  return fallos;
}
