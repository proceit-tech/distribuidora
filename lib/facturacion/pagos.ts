import { B, parseDec, textoDec, type Dec } from "@/lib/facturacion/calculo";

/**
 * Medios de pago de la Factura Electrónica (MFE-03 P1, MT v150 E605–E632). Módulo PURO: lo usan el servidor (forma del cuerpo, validación por modalidad, payload) y la pantalla
 * (los mismos pendientes), de modo que el navegador nunca acepta lo que el servidor rechaza.
 *
 *  · E606 iTiPago (catálogo oficial): solo se habilitan los medios cuyas reglas están implementadas (abajo). Los que exigen grupos propios (10 Retención → H012/H013, 11 Pago por anticipo,
 *    12–15 valores/compensación/permuta, 18–20 donación/promoción/consumo interno) NO se ofrecen.
 *  · E608 dMonTiPag: 1-15p(0-4), exacto (la precisión se verifica al serializar); E609 cMoneTiPag = PYG y sin tipo de cambio (E611) hasta la fase de monedas.
 *  · E620 gPagTarCD (solo E606 = 3 o 4): E621 iDenTarj (1–6, 99 «Otro» + E622 dDesDenTarj 4–20) y E626 iForProPa (1 POS, 2 Pago electrónico, 9 Otro) son obligatorios. NO se pide ni se
 *    guarda el número de la tarjeta, el CVV, el titular ni la autorización (E623–E625, E627–E629 son opcionales en el MT y no se recolectan).
 *  · E630 gPagCheq (solo E606 = 2): E631 dNumCheq (8 caracteres, ceros a la izquierda) y E632 dBcoEmi (4–20).
 *  · E607 dDesTiPag: solo con E606 = 99 (4–30). E606 = 16 (pago bancario) solo con presencia «Operación bancaria» (E011 = 5), regla 1553.
 */

export const FORMAS_PAGO: Record<number, string> = {
  1: "Efectivo", 2: "Cheque", 3: "Tarjeta de crédito", 4: "Tarjeta de débito", 5: "Transferencia bancaria", 6: "Giro", 7: "Billetera electrónica", 8: "Tarjeta empresarial",
  9: "Vale", 16: "Pago bancario", 17: "Pago móvil", 21: "Pago electrónico", 99: "Otro",
};
export const TIPO_EFECTIVO = 1;
export const TIPO_CHEQUE = 2;
export const TIPO_TARJETA_CREDITO = 3;
export const TIPO_TARJETA_DEBITO = 4;
export const TIPO_PAGO_BANCARIO = 16;
export const TIPO_OTRO = 99;
export const PRESENCIA_BANCARIA = 5;
/** E621 iDenTarj. */
export const DENOMINACIONES_TARJETA: Record<number, string> = { 1: "Visa", 2: "Mastercard", 3: "American Express", 4: "Maestro", 5: "Panal", 6: "Cabal", 99: "Otro" };
/** E626 iForProPa. */
export const FORMAS_PROCESAMIENTO: Record<number, string> = { 1: "POS", 2: "Pago electrónico (p. ej. compras por Internet)", 9: "Otro" };
export const MAX_PAGOS = 20;

export type PagoEntrada = {
  tipo: number;
  /** Ausente solo cuando hay UN único medio: entonces cubre todo el monto a pagar (total en Contado; entrega inicial en Crédito). */
  monto?: string;
  descripcion?: string;
  cheque?: { numero: string; banco: string };
  tarjeta?: { denominacion: number; descripcion?: string; formaProcesamiento: number };
};

const MONTO = /^\d{1,12}(\.\d{1,4})?$/;
const CLAVES = ["tipo", "monto", "descripcion", "cheque", "tarjeta"];
const entero = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) ? v : NaN);
const objeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Lee y valida la FORMA de los pagos del cuerpo. string = error para el operador. Los valores se validan después contra el total (mismo código en servidor y pantalla). */
export function leerPagos(crudo: unknown): PagoEntrada[] | string {
  if (crudo === undefined || crudo === null) return [];
  if (!Array.isArray(crudo) || crudo.length > MAX_PAGOS) return `Indique hasta ${MAX_PAGOS} medios de pago.`;

  const salida: PagoEntrada[] = [];

  for (const c of crudo) {
    if (!objeto(c) || Object.keys(c).some((k) => !CLAVES.includes(k))) return "Un medio de pago contiene un campo no admitido.";

    const tipo = typeof c.tipo === "string" && /^\d{1,2}$/.test(c.tipo) ? Number(c.tipo) : entero(c.tipo);

    if (!Number.isInteger(tipo)) return "Seleccione la forma de pago.";

    const p: PagoEntrada = { tipo };

    if (c.monto !== undefined && c.monto !== null && c.monto !== "") {
      if (typeof c.monto !== "string" || !MONTO.test(c.monto.trim())) return "El monto de un medio de pago no es válido (hasta 4 decimales).";
      p.monto = c.monto.trim();
    }
    if (c.descripcion !== undefined && c.descripcion !== null) {
      if (typeof c.descripcion !== "string") return "La descripción del medio de pago no es válida.";
      p.descripcion = c.descripcion.trim();
    }
    if (c.cheque !== undefined && c.cheque !== null) {
      if (!objeto(c.cheque) || Object.keys(c.cheque).some((k) => k !== "numero" && k !== "banco") || typeof c.cheque.numero !== "string" || typeof c.cheque.banco !== "string") return "Los datos del cheque no son válidos.";
      p.cheque = { numero: c.cheque.numero.trim(), banco: c.cheque.banco.trim() };
    }
    if (c.tarjeta !== undefined && c.tarjeta !== null) {
      const t = c.tarjeta;

      if (!objeto(t) || Object.keys(t).some((k) => !["denominacion", "descripcion", "formaProcesamiento"].includes(k))) return "Los datos de la tarjeta no son válidos (no se admiten número ni código de seguridad).";

      const den = entero(t.denominacion);
      const forma = entero(t.formaProcesamiento);

      if (!Number.isInteger(den) || !Number.isInteger(forma) || (t.descripcion !== undefined && typeof t.descripcion !== "string")) return "Los datos de la tarjeta no son válidos.";
      p.tarjeta = { denominacion: den, formaProcesamiento: forma, ...(typeof t.descripcion === "string" ? { descripcion: t.descripcion.trim() } : {}) };
    }
    salida.push(p);
  }

  return salida;
}

/** Cheque: número de 1 a 8 dígitos (E631 se completa con ceros a la izquierda hasta 8). */
export const numeroChequeFiscal = (n: string): string => n.trim().padStart(8, "0");

/**
 * Reglas por modalidad de UN medio de pago (sin su monto): grupos condicionales exactos del MT. `n` es la posición (1…) para el mensaje. Lista vacía = consistente.
 * Un grupo de otra modalidad (cheque en efectivo, tarjeta en transferencia…) es un ERROR, no se descarta en silencio.
 */
export function erroresMedio(p: PagoEntrada, n: number, presencia: number): string[] {
  const e: string[] = [];
  const t = `Pago ${n} (${FORMAS_PAGO[p.tipo] ?? "?"})`;

  if (!(p.tipo in FORMAS_PAGO)) return [`Pago ${n}: la forma de pago no es válida.`];

  if (p.tipo === TIPO_CHEQUE) {
    if (!p.cheque || !/^\d{1,8}$/.test(p.cheque.numero)) e.push(`${t}: el número de cheque debe tener de 1 a 8 dígitos.`);
    if (!p.cheque || p.cheque.banco.length < 4 || p.cheque.banco.length > 20) e.push(`${t}: el banco emisor debe tener de 4 a 20 caracteres.`);
  } else if (p.cheque) e.push(`${t}: los datos de cheque solo corresponden a la forma Cheque.`);

  if (p.tipo === TIPO_TARJETA_CREDITO || p.tipo === TIPO_TARJETA_DEBITO) {
    const k = p.tarjeta;

    if (!k || !(k.denominacion in DENOMINACIONES_TARJETA)) e.push(`${t}: seleccione la marca de la tarjeta.`);
    else if (k.denominacion === 99 && ((k.descripcion ?? "").length < 4 || (k.descripcion ?? "").length > 20)) e.push(`${t}: describa la marca «Otro» (4 a 20 caracteres).`);
    else if (k.denominacion !== 99 && k.descripcion !== undefined && k.descripcion !== "") e.push(`${t}: la descripción de marca solo se informa con «Otro».`);
    if (!k || !(k.formaProcesamiento in FORMAS_PROCESAMIENTO)) e.push(`${t}: seleccione la forma de procesamiento.`);
  } else if (p.tarjeta) e.push(`${t}: los datos de tarjeta solo corresponden a tarjeta de crédito o débito.`);

  if (p.tipo === TIPO_OTRO) {
    if ((p.descripcion ?? "").length < 4 || (p.descripcion ?? "").length > 30) e.push(`${t}: describa el medio de pago (4 a 30 caracteres).`);
  } else if (p.descripcion !== undefined && p.descripcion !== "") e.push(`${t}: la descripción solo se informa con la forma «Otro».`);

  if (p.tipo === TIPO_PAGO_BANCARIO && presencia !== PRESENCIA_BANCARIA) e.push(`${t}: solo se admite con el indicador de presencia «Operación bancaria».`);

  return e;
}

/**
 * Resuelve los montos de los medios contra el monto a pagar `objetivo` (total en Contado; entrega inicial en Crédito): un único medio sin monto cubre todo; con varios, cada
 * uno lleva su monto. Devuelve los montos como texto Decimal o los errores. NO conciliado aquí: la suma exacta la valida `validarEntradaFE` (fuente única).
 */
export function resolverMontos(pagos: PagoEntrada[], objetivo: Dec): { montos: string[] } | { errores: string[] } {
  if (pagos.length === 1 && pagos[0].monto === undefined) return { montos: [textoDec(objetivo)] };
  if (pagos.some((p) => p.monto === undefined)) return { errores: ["Indique el monto de cada medio de pago."] };

  return { montos: pagos.map((p) => p.monto as string) };
}

/** Pendientes de pago para la pantalla (mismas reglas que el servidor): errores por medio + conciliación exacta con el monto a pagar. */
export function pendientesPagos(pagos: PagoEntrada[], objetivo: Dec, presencia: number): string[] {
  const m: string[] = [];

  pagos.forEach((p, i) => m.push(...erroresMedio(p, i + 1, presencia)));
  if (pagos.length === 0) return ["Indique la forma de pago."];

  const r = resolverMontos(pagos, objetivo);

  if ("errores" in r) return [...m, ...r.errores];

  let suma = B(0);

  r.montos.forEach((t, i) => {
    const d = MONTO.test(t) ? parseDec(t, 4) : null;

    if (d === null || d <= B(0)) m.push(`Pago ${i + 1}: el monto debe ser mayor que cero, con hasta 4 decimales.`);
    else suma += d;
  });
  if (m.length === 0 && suma !== objetivo) m.push(`Los pagos suman ${textoDec(suma)} y deben sumar exactamente ${textoDec(objetivo)}.`);

  return m;
}

// ── Lado del navegador: estado de edición de un medio y cuerpo que viaja al servidor ───────────────────────────────────────────────────────────────

export type PagoUI = { tipo: string; monto: string; descripcion: string; chequeNumero: string; chequeBanco: string; tarjetaDenominacion: string; tarjetaDescripcion: string; tarjetaForma: string };

export const PAGO_UI_VACIO: PagoUI = { tipo: "1", monto: "", descripcion: "", chequeNumero: "", chequeBanco: "", tarjetaDenominacion: "", tarjetaDescripcion: "", tarjetaForma: "" };

/** Medio del cuerpo del POST: solo los campos de SU modalidad (cambiar de medio no arrastra datos del anterior). Con UN solo medio no viaja el monto: cubre todo el objetivo. */
export function pagoParaEnvio(p: PagoUI, unico: boolean): PagoEntrada {
  const tipo = Number(p.tipo);
  const num = (t: string) => (/^\d{1,3}$/.test(t.trim()) ? Number(t.trim()) : 0);

  return {
    tipo,
    ...(!unico && p.monto.trim() !== "" ? { monto: p.monto.trim() } : {}),
    ...(tipo === TIPO_OTRO ? { descripcion: p.descripcion.trim() } : {}),
    ...(tipo === TIPO_CHEQUE ? { cheque: { numero: p.chequeNumero.trim(), banco: p.chequeBanco.trim() } } : {}),
    ...(tipo === TIPO_TARJETA_CREDITO || tipo === TIPO_TARJETA_DEBITO
      ? { tarjeta: { denominacion: num(p.tarjetaDenominacion), formaProcesamiento: num(p.tarjetaForma), ...(num(p.tarjetaDenominacion) === 99 ? { descripcion: p.tarjetaDescripcion.trim() } : {}) } }
      : {}),
  };
}
