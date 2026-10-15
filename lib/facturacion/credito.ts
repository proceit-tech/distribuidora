import { B, S, parseDec, textoDec, type Dec } from "@/lib/facturacion/calculo";

/**
 * Crédito de la Factura Electrónica (MFE-B1, MT v150 E601 y E640–E654). Módulo PURO (sin red ni base): lo usan el servidor (forma del cuerpo, validación fiscal, payload) y la
 * pantalla (mismas reglas, calculadas con el mismo código), de modo que el navegador nunca acepta lo que el servidor rechaza.
 *
 *  · E601 iCondOpe: 1 Contado / 2 Crédito. E640 gPagCred solo con Crédito; en Contado no se informa nada de crédito.
 *  · E641 iCondCred: 1 Plazo / 2 Cuota. E643 dPlazoCre (A 2-15, p. ej. «30 días») solo con Plazo; E644 dCuotas (N 1-3) y E650 gCuotas (0-999) solo con Cuota.
 *  · E645 dMonEnt: entrega inicial opcional (1-15p(0-4)). Con entrega, E605 (FormaPago) es obligatorio y suma exactamente E645; sin entrega, E605 NO se informa (reglas 1551/1552).
 *  · E650 gCuotas: cMoneCuo (E653), dMonCuota (E651, 1-15p(0-4)) y dVencCuo (E652, AAAA-MM-DD). Política NEXIT: el vencimiento es obligatorio (opcional en el MT) y estrictamente creciente.
 *  · Regla comercial: entrega + Σ cuotas = total EXACTO (Decimal, sin tolerancia ni redondeo). Plazo: el saldo (total − entrega) se cobra una sola vez al vencer el plazo.
 * No se crea ninguna cuenta por cobrar: el crédito es un dato fiscal del documento (snapshot inmutable en el payload).
 */

export const CONDICION_CONTADO = 1;
export const CONDICION_CREDITO = 2;
export const CREDITO_PLAZO = 1;
export const CREDITO_CUOTAS = 2;
/**
 * Decisión MFE-03: el crédito en CUOTAS queda SUSPENDIDO para nuevas emisiones (se retoma en una fase posterior, con las correcciones de AUD-MFE-B1-R01). El código se conserva; esta
 * bandera lo cierra en la pantalla Y en el servidor (lectura del cuerpo y preparación), siempre ANTES de reservar numeración. Los documentos ya creados no se tocan.
 */
export const CUOTAS_HABILITADAS = false;
export const MENSAJE_CUOTAS_SUSPENDIDAS = "El crédito en cuotas está suspendido por el momento: emita la factura a plazo (días) o al contado.";
/** E644 dCuotas: N 1-3. */
export const MAX_CUOTAS = 999;
/** Tope operativo del plazo en días (el texto fiscal «N días» debe caber en 2-15 caracteres). */
export const MAX_PLAZO_DIAS = 9999;
/** E651 / E645: 1-15p(0-4). En la escala interna de 8 decimales el monto debe ser múltiplo de 10^4. */
const PASO_MONTO = S / B(10000);
const MONTO_TEXTO = /^\d{1,12}(\.\d{1,4})?$/;
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

export type CuotaEntrada = { monto: string; vencimiento: string };
/** Condiciones de crédito ya validadas en su FORMA (el servidor valida después los valores contra el total). */
export type CreditoEntrada = { tipo: 1 | 2; plazoDias: number | null; cuotas: CuotaEntrada[]; entrega: string | null };

/** Fecha civil de hoy en Paraguay (AAAA-MM-DD): referencia para exigir vencimientos no vencidos. */
export function hoyParaguay(ahora: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
  } catch {
    return new Date(ahora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  }
}

export function fechaValida(t: string): boolean {
  const m = FECHA.exec(t);

  if (!m) return false;

  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));

  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) && Number(m[1]) >= 2000;
}

export function sumarDias(fecha: string, dias: number): string {
  const m = FECHA.exec(fecha);

  if (!m) return fecha;

  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + dias)).toISOString().slice(0, 10);
}

/** E643 dPlazoCre: texto fiscal derivado de los días (2-15 caracteres). Nunca un número suelto sin unidad. */
export const plazoTexto = (dias: number): string => (dias === 1 ? "1 día" : `${dias} días`);

/**
 * Lee y valida la FORMA del crédito del cuerpo. `condicion` ya es 1 o 2. undefined = sin crédito; string = error para el operador.
 * Contado + datos de crédito es un error (no se ignoran en silencio); Crédito sin datos también.
 */
export function leerCredito(condicion: number, crudo: unknown, cuotasHabilitadas: boolean = CUOTAS_HABILITADAS): CreditoEntrada | undefined | string {
  if (condicion === CONDICION_CONTADO) return crudo === undefined || crudo === null ? undefined : "Una factura al contado no lleva datos de crédito: quite el crédito o elija la condición Crédito.";
  if (crudo === undefined || crudo === null || typeof crudo !== "object" || Array.isArray(crudo)) return "Indique las condiciones del crédito (plazo o cuotas).";

  const o = crudo as Record<string, unknown>;

  if (Object.keys(o).some((k) => !["tipo", "plazoDias", "cuotas", "entrega"].includes(k))) return "Las condiciones del crédito contienen un campo no admitido.";
  if (o.tipo !== CREDITO_PLAZO && o.tipo !== CREDITO_CUOTAS) return cuotasHabilitadas ? "Seleccione el tipo de crédito: Plazo o Cuotas." : "Seleccione el tipo de crédito: Plazo.";
  if (o.tipo === CREDITO_CUOTAS && !cuotasHabilitadas) return MENSAJE_CUOTAS_SUSPENDIDAS;

  let entrega: string | null = null;

  if (o.entrega !== undefined && o.entrega !== null && o.entrega !== "") {
    if (typeof o.entrega !== "string" || !MONTO_TEXTO.test(o.entrega.trim())) return "La entrega inicial no es válida (hasta 4 decimales).";

    // Una entrega en cero equivale a «sin entrega»: no genera grupo de pago.
    entrega = parseDec(o.entrega.trim(), 4)! > B(0) ? o.entrega.trim() : null;
  }

  if (o.tipo === CREDITO_PLAZO) {
    if (o.cuotas !== undefined && !(Array.isArray(o.cuotas) && o.cuotas.length === 0)) return "El crédito a plazo no lleva cuotas.";
    if (typeof o.plazoDias !== "number" || !Number.isInteger(o.plazoDias) || o.plazoDias < 1 || o.plazoDias > MAX_PLAZO_DIAS) return `Indique el plazo en días (de 1 a ${MAX_PLAZO_DIAS}).`;

    return { tipo: 1, plazoDias: o.plazoDias, cuotas: [], entrega };
  }

  if (o.plazoDias !== undefined && o.plazoDias !== null) return "El crédito en cuotas no lleva plazo.";
  if (!Array.isArray(o.cuotas) || o.cuotas.length < 1 || o.cuotas.length > MAX_CUOTAS) return `Indique de 1 a ${MAX_CUOTAS} cuotas.`;

  const cuotas: CuotaEntrada[] = [];

  for (const c of o.cuotas) {
    if (!c || typeof c !== "object" || Array.isArray(c) || Object.keys(c).some((k) => k !== "monto" && k !== "vencimiento")) return "Una cuota no es válida.";

    const { monto, vencimiento } = c as Record<string, unknown>;

    if (typeof monto !== "string" || typeof vencimiento !== "string") return "Cada cuota requiere monto y fecha de vencimiento.";
    cuotas.push({ monto: monto.trim(), vencimiento: vencimiento.trim() });
  }

  return { tipo: 2, plazoDias: null, cuotas, entrega };
}

/**
 * Valida los VALORES del crédito contra el total calculado (mismo código en servidor y pantalla). `entrega` es lo ya pagado (Σ pagos iniciales) y `hoy` la fecha civil de
 * referencia. Lista vacía = consistente. No redondea ni compensa diferencias.
 */
export function erroresCredito(c: Pick<CreditoEntrada, "tipo" | "plazoDias" | "cuotas">, total: Dec, entrega: Dec, hoy: string): string[] {
  const e: string[] = [];

  if (entrega < B(0) || entrega >= total) {
    e.push("La entrega inicial debe ser menor que el total de la factura: si se paga todo en el acto, la condición es Contado.");

    return e;
  }

  const saldo = total - entrega;

  if (c.tipo === CREDITO_PLAZO) {
    if (c.plazoDias === null || !Number.isInteger(c.plazoDias) || c.plazoDias < 1 || c.plazoDias > MAX_PLAZO_DIAS) e.push(`Indique el plazo en días (de 1 a ${MAX_PLAZO_DIAS}).`);

    return e;
  }

  if (c.cuotas.length < 1 || c.cuotas.length > MAX_CUOTAS) {
    e.push(`Indique de 1 a ${MAX_CUOTAS} cuotas.`);

    return e;
  }

  let suma = B(0);
  let anterior = "";
  let montosOk = true;

  c.cuotas.forEach((q, i) => {
    const n = i + 1;
    const m = MONTO_TEXTO.test(q.monto) ? parseDec(q.monto, 4) : null;

    if (m === null || m <= B(0)) {
      e.push(`Cuota ${n}: el monto debe ser mayor que cero, con hasta 4 decimales.`);
      montosOk = false;
    } else if (m % PASO_MONTO !== B(0)) {
      e.push(`Cuota ${n}: el monto admite hasta 4 decimales.`);
      montosOk = false;
    } else suma += m;

    if (!fechaValida(q.vencimiento)) e.push(`Cuota ${n}: la fecha de vencimiento no es válida (AAAA-MM-DD).`);
    else {
      if (q.vencimiento < hoy) e.push(`Cuota ${n}: el vencimiento no puede ser anterior a hoy.`);
      if (anterior !== "" && q.vencimiento <= anterior) e.push(`Cuota ${n}: el vencimiento debe ser posterior al de la cuota anterior.`);
      anterior = q.vencimiento;
    }
  });
  if (montosOk && suma !== saldo) e.push(`La suma de las cuotas (${textoDec(suma)}) debe ser igual al saldo a financiar (${textoDec(saldo)}): total menos entrega inicial.`);

  return e;
}

/**
 * Propuesta de cuotas iguales (ayuda de la pantalla; el servidor valida lo que llegue, no recalcula). Trabaja en guaraníes enteros si el saldo no tiene decimales y en
 * diezmilésimas si los tiene; la diferencia de la división va a la ÚLTIMA cuota para que la suma sea exacta. Vencimientos cada `cadaDias` desde `primero`.
 */
export function repartirCuotas(saldo: string, cantidad: number, primero: string, cadaDias: number): CuotaEntrada[] {
  const total = parseDec(saldo, 4);

  if (total === null || total <= B(0) || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_CUOTAS || !fechaValida(primero)) return [];

  const unidad = total % S === B(0) ? S : PASO_MONTO;
  const unidades = total / unidad;
  const n = BigInt(cantidad);
  const base = unidades / n;
  const ultima = unidades - base * (n - B(1));

  if (base <= B(0)) return [];

  return Array.from({ length: cantidad }, (_, i) => ({
    monto: textoDec((i === cantidad - 1 ? ultima : base) * unidad),
    vencimiento: sumarDias(primero, cadaDias * i),
  }));
}

// ── Lado del navegador: estado de edición del crédito, cuerpo que viaja al servidor y pendientes (mismas reglas del servidor) ──────────────────────────

export type EstadoCreditoUI = { tipo: "1" | "2"; plazoDias: string; cantidad: string; cuotas: CuotaEntrada[]; entrega: string; primerVencimiento: string; cadaDias: string };

export const CREDITO_UI_VACIO: EstadoCreditoUI = { tipo: "1", plazoDias: "30", cantidad: "3", cuotas: [], entrega: "", primerVencimiento: "", cadaDias: "30" };

/** Cuerpo `credito` del POST: solo lo que corresponde al tipo elegido (Plazo no lleva cuotas, Cuotas no lleva plazo). */
export function creditoParaEnvio(e: EstadoCreditoUI): Record<string, unknown> {
  const entrega = e.entrega.trim() !== "" ? { entrega: e.entrega.trim() } : {};

  return e.tipo === "1"
    ? { tipo: 1, plazoDias: /^\d{1,5}$/.test(e.plazoDias.trim()) ? Number(e.plazoDias.trim()) : 0, ...entrega }
    : { tipo: 2, cuotas: e.cuotas.map((q) => ({ monto: q.monto.trim(), vencimiento: q.vencimiento.trim() })), ...entrega };
}

/** Pendientes del crédito para la pantalla: reutiliza `erroresCredito` del servidor. `total` es el total calculado de la factura. */
export function pendientesCredito(e: EstadoCreditoUI, total: string, hoy: string): string[] {
  const t = parseDec(total, 4);

  if (t === null || t <= B(0)) return [];

  let entrega = B(0);

  if (e.entrega.trim() !== "") {
    const p = MONTO_TEXTO.test(e.entrega.trim()) ? parseDec(e.entrega.trim(), 4) : null;

    if (p === null) return ["la entrega inicial no es válida (hasta 4 decimales)"];
    entrega = p;
  }
  if (e.tipo === "2" && e.cuotas.length === 0) return ["genere o cargue las cuotas del crédito"];

  const plazo = e.tipo === "1" ? (/^\d{1,5}$/.test(e.plazoDias.trim()) ? Number(e.plazoDias.trim()) : null) : null;

  return erroresCredito({ tipo: e.tipo === "1" ? 1 : 2, plazoDias: plazo, cuotas: e.tipo === "2" ? e.cuotas : [] }, t, entrega, hoy).map((m) => m.replace(/\.$/, ""));
}
