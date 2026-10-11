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
 * la interfaz y de las API. Países no listados: opción explícita "Otro país" con los únicos límites de la UIT E.164
 * (DDI de 1–3 dígitos; DDI + número ≤ 15 dígitos), sin reglas por país.
 */

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
};

/** Paraguay: el número se guarda tal como se informa; los límites son los de D214/D215 aplicados al número paraguayo. */
export const LIMITES_PARAGUAY: Record<CampoTelefonico, { min: number; max: number }> = {
  telefono: { min: 6, max: 15 },
  celular: { min: 10, max: 20 },
};

export const PAIS_OTRO = "OTR";
export const PAIS_POR_DEFECTO = "PRY";

export const PLANES_TELEFONIA: PlanPais[] = [
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

export type TelefonoForm = { pais: string; ddi: string; area: string; numero: string };
export type TelefonoGuardar = { pais: string | null; ddi: string | null; area: string | null; numero: string | null };

export const telefonoVacio = (pais: string = PAIS_POR_DEFECTO): TelefonoForm => ({ pais, ddi: pais === PAIS_OTRO ? "" : planDe(pais)?.ddi ?? "", area: "", numero: "" });

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

  if (pais === PAIS_OTRO) {
    const ddi = entrada.ddi.trim();

    if (!/^[0-9]{1,3}$/.test(ddi)) return fallo("necesita el DDI del país (1 a 3 dígitos).");
    if (area !== "") return fallo("no admite código de área para un país sin plan de numeración configurado: inclúyalo en el número.");
    if (numero.length < 4 || ddi.length + numero.length > 15) return fallo("debe tener al menos 4 dígitos y, con el DDI, no más de 15 (UIT E.164).");

    return { ok: true, valor: { pais: PAIS_OTRO, ddi, area: null, numero } };
  }

  const plan = planDe(pais);

  if (!plan) return fallo("necesita un país válido para el número (seleccione el país).");

  if (plan.iso === "PRY") {
    const L = LIMITES_PARAGUAY[campo];

    if (area !== "") return fallo("de Paraguay no usa campo de código de área: escriba el número con su prefijo local.");
    if (numero.length < L.min || numero.length > L.max) return fallo(`debe tener entre ${L.min} y ${L.max} dígitos (Paraguay, con su prefijo local).`);

    return { ok: true, valor: { pais: "PRY", ddi: plan.ddi, area: null, numero } };
  }

  // Resto de países: código de área solo si el plan lo usa; sin el "0" de discado nacional; largo total según el plan.
  if (plan.area === null && area !== "") return fallo(`de ${plan.nombre} no usa código de área separado: inclúyalo en el número.`);
  if (plan.area !== null) {
    if (!/^[0-9]+$/.test(area)) return fallo(`necesita el código de área de ${plan.nombre} (solo dígitos).`);
    if (area.length < plan.area.min || area.length > plan.area.max) {
      return fallo(`necesita un código de área de ${plan.area.min === plan.area.max ? plan.area.min : `${plan.area.min} a ${plan.area.max}`} dígitos para ${plan.nombre}.`);
    }
  }
  if (area.startsWith("0") || numero.startsWith("0")) return fallo("no debe llevar el 0 de discado nacional (escriba el número sin ese 0).");

  const total = area.length + numero.length;

  if (!plan.nsn.includes(total)) {
    return fallo(`no tiene un largo válido para ${plan.nombre} (${plan.nsn.join(" o ")} dígitos${plan.area ? " entre código de área y número" : ""}; se ingresaron ${total}).`);
  }

  return { ok: true, valor: { pais: plan.iso, ddi: plan.ddi, area: area === "" ? null : area, numero } };
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
