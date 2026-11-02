/**
 * Teléfono y celular por país (Clientes: cliente principal y contactos) — REGLAS CADASTRALES.
 * Retificación aprobada 2026-10-11 (documentacao/regras/REGRA-CADASTRO-CLIENTES-NEXIT-V1.md):
 *  - el usuario elige el PAÍS DEL NÚMERO (Paraguay por defecto); país del teléfono ≠ DDI ≠ DDD y ≠ país fiscal del receptor;
 *  - Paraguay: sin campo de DDD; el DDI +595 se asocia solo; el número se guarda tal como se informa (con su prefijo
 *    local; los ceros no se quitan);
 *  - otros países: campo de código de área (DDD) solo donde el plan de numeración lo usa; el DDI se asocia solo;
 *  - los números PUEDEN REPETIRSE (clientes, contactos, empresas): no hay ni habrá unicidad sobre teléfonos;
 *  - un número que COMIENZA por los mismos dígitos del DDI es válido (coincidencia); solo se rechazan los formatos de
 *    discado ambiguos ("+" y prefijo internacional "00") pidiendo separar el país, sin cortar ni adivinar;
 *  - la futura serialización D214/D215 del XML SIFEN (V2) es una regla SEPARADA y no está decidida aquí.
 *
 * NORMA SIFEN (Manual v150 D214/D215, NT 014 GENFE023/024; ninguna NT lo modifica): tipo A, teléfono 6–15 y celular 10–20,
 * opcionales; el teléfono "debe incluir el prefijo de la ciudad si D203 = PRY". La norma NO menciona DDI/DDD ni números
 * internacionales. Por eso los límites 6–15 / 10–20 se aplican SOLO a números paraguayos (como regla cadastral de PRY);
 * los demás países se validan con su plan de numeración. No se declara que la DNIT exija DDI/DDD.
 *
 * FUENTES de los planes (ITU-T E.164 y planes nacionales de numeración; longitudes nacionales significativas, sin el
 * prefijo de discado nacional "0", según la metadata pública de libphonenumber de Google). Son una compilación de
 * Claude que el responsable debe confirmar antes de homologar; cada entrada es editable aquí y es la ÚNICA fuente de
 * la interfaz y de las API. CATÁLOGO MUNDIAL (`paises-ddi.ts`, decisión definitiva 2026-10-11): todo país/territorio con DDI
 * UIT asignado es seleccionable con su ISO real; los que no tienen plan detallado aquí usan solo los límites E.164
 * (DDI + número ≤ 15 dígitos) y nunca se guardan como "OTR".
 */

import { PAISES_DDI } from "@/lib/fiscal/paises-ddi";

export type CampoTelefonico = "telefono" | "celular";

export type PlanPais = {
  iso: string;
  nombre: string;
  ddi: string;
  /** Código de área / DDD en campo propio. `null` = el plan no lo usa como campo separado. */
  area: { min: number; max: number } | null;
  /** Largos válidos del número nacional significativo (área + número, sin "0" de discado nacional). */
  nsn: number[];
  ayuda: string;
  /** true = país del catálogo sin plan de numeración propio: solo DDI + límites UIT. */
  generico?: boolean;
  /** ISO = código ISO 3166-1 asignado; USR = identificador interno del rango XAA–XZZ (destino UIT sin ISO propio). */
  origen?: "ISO" | "USR";
};

/** Paraguay: el número se guarda tal como se informa; los límites son los de D214/D215 aplicados al número paraguayo. */
export const LIMITES_PARAGUAY: Record<CampoTelefonico, { min: number; max: number }> = {
  telefono: { min: 6, max: 15 },
  celular: { min: 10, max: 20 },
};

/** Valor histórico (NEX-025 aún no aplicada): ya no se ofrece ni se guarda; solo se reconoce en registros anteriores para pedir el país real. */
export const PAIS_LEGADO_SIN_IDENTIFICAR = "OTR";
export const PAIS_POR_DEFECTO = "PRY";

const PLANES_DETALLADOS: PlanPais[] = [
  { iso: "PRY", nombre: "Paraguay", ddi: "595", area: null, nsn: [], ayuda: "Sin campo de código de área: escriba el número con su prefijo local (el teléfono debe incluir el prefijo de la ciudad; no se quitan ceros)." },
  { iso: "ARG", nombre: "Argentina", ddi: "54", area: { min: 2, max: 4 }, nsn: [10], ayuda: "Código de área de 2 a 4 dígitos (sin el 0) y número sin el 15; área + número = 10 dígitos." },
  { iso: "BOL", nombre: "Bolivia", ddi: "591", area: null, nsn: [8], ayuda: "Número de 8 dígitos (incluye el código de área de los fijos)." },
  { iso: "BRA", nombre: "Brasil", ddi: "55", area: { min: 2, max: 2 }, nsn: [10, 11], ayuda: "DDD de 2 dígitos (sin el 0) y número de 8 (fijo) o 9 (celular) dígitos." },
  { iso: "CAN", nombre: "Canadá", ddi: "1", area: { min: 3, max: 3 }, nsn: [10], ayuda: "Código de área de 3 dígitos y número de 7 dígitos." },
  { iso: "CHL", nombre: "Chile", ddi: "56", area: null, nsn: [9], ayuda: "Número de 9 dígitos (incluye el código de área de los fijos)." },
  { iso: "COL", nombre: "Colombia", ddi: "57", area: null, nsn: [8, 10], ayuda: "Fijo de 8 dígitos (con indicativo de ciudad) o celular de 10 dígitos." },
  { iso: "ESP", nombre: "España", ddi: "34", area: null, nsn: [9], ayuda: "Número de 9 dígitos." },
  { iso: "USA", nombre: "Estados Unidos", ddi: "1", area: { min: 3, max: 3 }, nsn: [10], ayuda: "Código de área de 3 dígitos y número de 7 dígitos." },
  { iso: "PER", nombre: "Perú", ddi: "51", area: null, nsn: [8, 9], ayuda: "Fijo de 8 dígitos (con indicativo de ciudad) o celular de 9 dígitos." },
  { iso: "URY", nombre: "Uruguay", ddi: "598", area: null, nsn: [8], ayuda: "Número de 8 dígitos, sin el 0 de discado nacional." },
];

const AYUDA_NANP = "Plan norteamericano (+1): estructura habitual de código de área de 3 dígitos + número de 7 (aviso, no bloquea).";
const AYUDA_GENERICA = "Destino sin regla de numeración propia configurada: se verifica solo que sean dígitos y que DDI + número no superen 15 dígitos (UIT E.164). Los ceros se conservan.";

/**
 * Todos los países del catálogo `PAISES_DDI`: los que tienen plan detallado arriba lo conservan; los del plan
 * norteamericano (DDI 1) usan área de 3 + número de 7; el resto solo lleva DDI y los límites UIT (`generico`).
 * Paraguay primero y luego orden alfabético.
 */
export const PLANES_TELEFONIA: PlanPais[] = (() => {
  const detallados = new Map(PLANES_DETALLADOS.map((p) => [p.iso, p]));
  const todos: PlanPais[] = PAISES_DDI.map((fila) => {
    const [iso, nombre, ddi, origenFila = "ISO"] = fila.split("|");
    const origen = origenFila.startsWith("USR") ? ("USR" as const) : ("ISO" as const);
    const detallado = detallados.get(iso);

    if (detallado) return { ...detallado, origen };
    if (ddi === "1") return { iso, nombre, ddi, area: { min: 3, max: 3 }, nsn: [10], ayuda: AYUDA_NANP, origen };

    return { iso, nombre, ddi, area: null, nsn: [], ayuda: AYUDA_GENERICA, generico: true, origen };
  });

  return todos.sort((a, b) => (a.iso === PAIS_POR_DEFECTO ? -1 : b.iso === PAIS_POR_DEFECTO ? 1 : a.nombre.localeCompare(b.nombre, "es")));
})();

export type TelefonoForm = { pais: string; ddi: string; area: string; numero: string };
export type TelefonoGuardar = { pais: string | null; ddi: string | null; area: string | null; numero: string | null };

export const telefonoVacio = (pais: string = PAIS_POR_DEFECTO): TelefonoForm => ({ pais, ddi: planDe(pais)?.ddi ?? "", area: "", numero: "" });

export function planDe(iso: string): PlanPais | undefined {
  return PLANES_TELEFONIA.find((p) => p.iso === iso);
}

const ETIQUETA: Record<CampoTelefonico, string> = { telefono: "el teléfono", celular: "el celular" };

/** Separadores visuales permitidos; solo se guardan dígitos. Devuelve error si hay formato de discado ambiguo. */
export function normalizarNumeroTelefonico(entrada: string): { numero: string } | { error: string } {
  const texto = entrada.trim();

  if (texto === "") return { numero: "" };
  if (texto.includes("+")) return { error: "no debe incluir el signo +: seleccione el país del número y escriba solo el número" };
  if (!/^[0-9 .\-()]+$/.test(texto)) return { error: "solo puede contener dígitos (se admiten espacios, guiones, puntos y paréntesis)" };

  const digitos = texto.replace(/[ .\-()]/g, "");

  if (digitos.startsWith("00")) return { error: "no debe incluir el prefijo de discado internacional (00): seleccione el país del número y escriba solo el número" };

  return { numero: digitos };
}

/**
 * Valida un teléfono/celular completo y devuelve el valor canónico a guardar.
 * `etiqueta` opcional para los mensajes (p. ej. "el celular del contacto 2"). No cuenta repetición de números (permitida).
 */
export function validarTelefono(
  campo: CampoTelefonico,
  entrada: TelefonoForm,
  etiqueta: string = ETIQUETA[campo],
): { ok: true; valor: TelefonoGuardar } | { ok: false; error: string } {
  const fallo = (detalle: string) => ({ ok: false as const, error: `${etiqueta.charAt(0).toUpperCase()}${etiqueta.slice(1)} ${detalle}` });
  const normalizado = normalizarNumeroTelefonico(entrada.numero);

  if ("error" in normalizado) return fallo(`${normalizado.error}.`);

  const area = entrada.area.trim();

  if (normalizado.numero === "") {
    return area === "" ? { ok: true, valor: { pais: null, ddi: null, area: null, numero: null } } : fallo("tiene código de área pero no tiene número.");
  }

  const pais = entrada.pais.trim();
  const numero = normalizado.numero;

  if (pais === "") return fallo("necesita el país del número (seleccione el país).");

  const plan = planDe(pais);

  if (!plan) {
    return fallo(
      pais === PAIS_LEGADO_SIN_IDENTIFICAR
        ? "tiene un país sin identificar (registro anterior): seleccione el país real del número."
        : "necesita un país válido del catálogo (seleccione el país).",
    );
  }

  if (plan.iso === "PRY") {
    const L = LIMITES_PARAGUAY[campo];

    if (area !== "") return fallo("de Paraguay no usa campo de código de área: escriba el número con su prefijo local.");
    if (numero.length < L.min || numero.length > L.max) return fallo(`debe tener entre ${L.min} y ${L.max} dígitos (Paraguay, con su prefijo local).`);

    return { ok: true, valor: { pais: "PRY", ddi: plan.ddi, area: null, numero } };
  }

  // Resto del mundo. BLOQUEA solo lo que ninguna llamada internacional puede ser o rompe el modelo de datos:
  // dígitos únicamente, área solo si el país la muestra (máx. 5 dígitos, columna varchar(5)) y E.164: DDI + área + número ≤ 15
  // dígitos (Rec. UIT-T E.164 fija ese máximo; NO fija un mínimo universal). Largos/áreas/ceros "habituales" del país son
  // reglas NO confirmadas contra fuente oficial por destino y se informan como AVISO (`avisosTelefono`), nunca bloquean.
  if (plan.area === null && area !== "") return fallo(`de ${plan.nombre} no usa código de área separado: inclúyalo en el número.`);
  if (area !== "" && !/^[0-9]{1,5}$/.test(area)) return fallo("tiene un código de área inválido (solo dígitos, hasta 5).");

  const total = area.length + numero.length;

  if (plan.ddi.length + total > 15) return fallo(`excede los 15 dígitos de la UIT E.164 con el DDI (+${plan.ddi}); se ingresaron ${plan.ddi.length + total}.`);

  return { ok: true, valor: { pais: plan.iso, ddi: plan.ddi, area: area === "" ? null : area, numero } };
}

/**
 * AVISOS no bloqueantes sobre un teléfono ya válido: patrones habituales del país (código de área esperado en los destinos
 * +1/ARG/BRA, largo habitual, 0 inicial). Provienen de planes compilados sin homologar por destino; nunca impiden guardar
 * ni cambian aptitud SIFEN.
 */
export function avisosTelefono(entrada: TelefonoForm): string[] {
  const plan = planDe(entrada.pais.trim());
  const normalizado = normalizarNumeroTelefonico(entrada.numero);

  if (!plan || plan.iso === "PRY" || "error" in normalizado || normalizado.numero === "") return [];

  const avisos: string[] = [];
  const area = entrada.area.trim();
  const numero = normalizado.numero;

  if (plan.area !== null) {
    if (area === "") avisos.push(`En ${plan.nombre} el número suele llevar código de área${plan.area.min === plan.area.max ? ` de ${plan.area.min} dígitos` : ` de ${plan.area.min} a ${plan.area.max} dígitos`}; no se indicó.`);
    else if (area.length < plan.area.min || area.length > plan.area.max) avisos.push(`El código de área habitual en ${plan.nombre} tiene ${plan.area.min === plan.area.max ? plan.area.min : `${plan.area.min} a ${plan.area.max}`} dígitos.`);
    if (area.startsWith("0")) avisos.push("El código de área empieza con 0: en formato internacional normalmente se omite el 0 de discado nacional.");
  }

  if (!plan.generico) {
    const total = area.length + numero.length;

    if (plan.nsn.length > 0 && !plan.nsn.includes(total)) avisos.push(`El largo habitual en ${plan.nombre} es de ${plan.nsn.join(" o ")} dígitos; se ingresaron ${total}.`);
    if (numero.startsWith("0")) avisos.push("El número empieza con 0: en formato internacional normalmente se omite el 0 de discado nacional.");
  }

  if (area.length + numero.length < 4) avisos.push("El número es muy corto; verifique que esté completo.");

  return avisos;
}

/** Aviso único para la interfaz (se puede guardar igual). */
export function advertenciaTelefono(entrada: TelefonoForm): string | null {
  const avisos = avisosTelefono(entrada);

  return avisos.length > 0 ? `${avisos.join(" ")} Se puede guardar igual.` : null;
}

/**
 * Registro anterior a la retificación: número sin país. Solo se evalúa su forma (dígitos y largo D214/D215 como
 * antes) para informar la aptitud; no se corrige ni se reinterpreta.
 */
export function validarNumeroTelefonicoLegado(campo: CampoTelefonico, numeroEntrada: string): string | null {
  const L = LIMITES_PARAGUAY[campo];
  const normalizado = normalizarNumeroTelefonico(numeroEntrada);

  if ("error" in normalizado) return `${ETIQUETA[campo].charAt(0).toUpperCase()}${ETIQUETA[campo].slice(1)} ${normalizado.error}.`;
  if (normalizado.numero === "") return null;

  return normalizado.numero.length >= L.min && normalizado.numero.length <= L.max
    ? null
    : `${ETIQUETA[campo].charAt(0).toUpperCase()}${ETIQUETA[campo].slice(1)} (sin país registrado) debe tener entre ${L.min} y ${L.max} dígitos.`;
}

/** Lee de un cuerpo JSON los cuatro datos de un teléfono (`telefono`, `telefonoPais`, `telefonoDdi`, `telefonoArea`) sin truncar. */
export function leerTelefonoEntrada(cuerpo: Record<string, unknown>, campo: CampoTelefonico, prefijo: string = campo): TelefonoForm {
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const clave = (sufijo: string) => (sufijo ? `${prefijo}${sufijo}` : prefijo);

  return {
    numero: texto(cuerpo[clave("")]),
    pais: texto(cuerpo[clave("Pais")]).toUpperCase(),
    ddi: texto(cuerpo[clave("Ddi")]),
    area: texto(cuerpo[clave("Area")]),
  };
}

const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Búsqueda del selector por nombre (sin acentos), ISO o DDI (con o sin "+"). Texto vacío = catálogo completo. */
export function buscarPaisesTelefonia(texto: string): PlanPais[] {
  const q = sinAcentos(texto.trim()).replace(/^\+/, "");

  if (q === "") return PLANES_TELEFONIA;

  return PLANES_TELEFONIA.filter((p) => sinAcentos(p.nombre).includes(q) || p.iso.toLowerCase().startsWith(q) || p.ddi.startsWith(q));
}
