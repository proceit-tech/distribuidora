import { B, S, calcularItem, calcularSubtotales, numeroDec, parseDec, textoDec, type AfectacionIva, type Dec, type TasaIva } from "@/lib/facturacion/calculo";
import { cabeEnF023, esMonedaFE, leerCambio, MAX_ENTEROS_F023, totalEnGuaranies } from "@/lib/facturacion/monedas";

/**
 * Nota de Crédito Electrónica (iTiDE = 5, PRO-94): validación y construcción del payload a partir de la FACTURA ORIGINAL ya emitida (receptor, moneda, cambio e ítems salen del payload persistido de la FE,
 * NUNCA del cadastro vigente). Puro y sin red; mismo motor decimal EXACTO (BigInt a escala 10^-8) que la FE. Contrato: estructura NCE sustentada por el ejemplo aprobado por el gateway (iTiDE 5,
 * iMotEmi, DocumentosAsociados[0].{iTipDocAso:1,dCdCDERef}, Detalles[], Subtotales[]) y MT v150 (gCamNCDE E400, iMotEmi E401).
 *
 * Motivos V1: 2 Devolución, 3 Descuento, 4 Bonificación, 8 Ajuste de precio.
 *  · Devolución: por línea se devuelve una CANTIDAD (>0, ≤ disponible); precio unitario, unidad, IVA y datos fiscales son los de la línea original (no editables). Importe = cantidad × precio original.
 *  · Descuento / Bonificación / Ajuste de precio: por línea se acredita un MONTO total con IVA incluido (>0, ≤ saldo). Representación fiscal elegida (a verificar con el proveedor en la operación humana;
 *    no hay una NCE aprobada de estos motivos): el ítem se envía con cantidad 1 y precio unitario = monto, de modo que dTotOpeItem es EXACTAMENTE el crédito y nunca se multiplica por la cantidad de la
 *    factura; unidad, IVA, descripción y código son los de la línea original.
 * No se envían: condición/pagos/crédito (propios de la FE), tipo de transacción ni presencia. Fecha, número y CDC los completa SQL/el gateway.
 */

export const MOTIVOS_NCE: Record<number, string> = { 2: "Devolución", 3: "Descuento", 4: "Bonificación", 8: "Ajuste de precio" };
export type MotivoNce = 2 | 3 | 4 | 8;
export const esMotivoNce = (m: unknown): m is MotivoNce => m === 2 || m === 3 || m === 4 || m === 8;
export const MAX_LINEAS_NCE = 999;
export const TOTAL_MAXIMO_NCE = B(1000000000000) * S;
export const OBSERVACION_MAXIMA = 5000;
/** Unidad de 10^-4 en la escala interna (10^-8): el total debe ser múltiplo de ella para caber exacto en numeric(20,4). */
const TOTAL_ESCALA_4 = S / B(10000);

/** Una línea de la FE original tal como se envió (Detalles[] de la solicitud persistida). `linea` es el ordinal 1..n: identificador estable, las líneas repetidas NO se fusionan. */
export type LineaOriginal = {
  linea: number;
  codigoInterno: string;
  gtin: string | null;
  descripcion: string;
  unidadSifen: number | null;
  cantidad: string;
  precio: string;
  total: string;
  afectacion: AfectacionIva;
  tasa: TasaIva;
  proporcion: string;
};

/** Lo ya acreditado por NCE APROBADAS de esa línea (texto Decimal). */
export type Acreditado = { cantidad: string; monto: string };

export type LineaNceEntrada = { original: LineaOriginal; acreditado: Acreditado; cantidad?: string; monto?: string };

export type EntradaNce = {
  motivo: number;
  moneda: string;
  /** Tipo de cambio ORIGINAL de la FE (texto), solo con moneda extranjera. Se copia sin edición. */
  cambio: string | null;
  lineas: LineaNceEntrada[];
  observacion: string;
};

const exacto = (d: Dec): boolean => String(numeroDec(d)) === textoDec(d);
const sinControl = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/** Campos del receptor que la NCE hereda TAL CUAL de la FE original (snapshot). */
export const CAMPOS_RECEPTOR = [
  "iNatRec", "iTiOpe", "cPaisRec", "iTiContRec", "dRucRec", "dDVRec", "iTipIDRec", "dDTipIDRec", "dNumIDRec", "dNomRec", "dNomFanRec", "dDirRec", "dNumCasRec",
  "dTelRec", "dCelRec", "dEmailRec", "dEmailAdic", "dEmailAdmin", "dCodCliente",
] as const;

const texto = (v: unknown): string | null => (typeof v === "number" && Number.isFinite(v) ? String(v) : typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** Ítems de la FE original → líneas con su ordinal. null si el payload no tiene la forma esperada (la NCE no se emite). */
export function lineasOriginalesDe(payload: unknown): LineaOriginal[] | null {
  const det = (payload as { Detalles?: unknown } | null)?.Detalles;

  if (!Array.isArray(det) || det.length === 0 || det.length > MAX_LINEAS_NCE) return null;

  const salida: LineaOriginal[] = [];

  for (let i = 0; i < det.length; i++) {
    const d = det[i] as Record<string, unknown> | null;

    if (!d || typeof d !== "object") return null;

    const cantidad = texto(d.dCantProSer);
    const precio = texto(d.dPUniProSer);
    const total = texto(d.dTotOpeItem);
    const afec = Number(d.iAfecIVA);
    const tasa = Number(d.dTasaIVA);
    const prop = texto(d.dPropIVA);

    if (!cantidad || !precio || !total || !prop || typeof d.dDesProSer !== "string" || typeof d.dCodInt !== "string") return null;
    if (![1, 2, 3, 4].includes(afec) || ![0, 5, 10].includes(tasa)) return null;
    if (parseDec(cantidad, 8) === null || parseDec(precio, 8) === null || parseDec(total, 8) === null || parseDec(prop, 8) === null) return null;

    salida.push({
      linea: i + 1,
      codigoInterno: d.dCodInt,
      gtin: typeof d.dGtin === "string" && d.dGtin !== "" ? d.dGtin : null,
      descripcion: d.dDesProSer,
      unidadSifen: typeof d.cUniMed === "number" ? d.cUniMed : null,
      cantidad,
      precio,
      total,
      afectacion: afec as AfectacionIva,
      tasa: tasa as TasaIva,
      proporcion: prop,
    });
  }

  return salida;
}

export type ItemNce = { linea: number; cantidad: Dec; precio: Dec; original: LineaOriginal; totBruto: Dec; totOperacion: Dec; baseGravada: Dec; liquidacion: Dec; baseExenta: Dec; montoTexto: string; cantidadAcreditadaTexto: string };

/** Saldos de una línea (Decimal): cantidad y monto disponibles. */
export function saldoDe(l: LineaOriginal, a: Acreditado): { cantidad: Dec; monto: Dec } {
  const cantidad = (parseDec(l.cantidad, 8) ?? B(0)) - (parseDec(a.cantidad, 8) ?? B(0));
  const monto = (parseDec(l.total, 8) ?? B(0)) - (parseDec(a.monto, 8) ?? B(0));

  return { cantidad: cantidad > B(0) ? cantidad : B(0), monto: monto > B(0) ? monto : B(0) };
}

/** Calcula las líneas seleccionadas (sin validar el conjunto). Devuelve errores por línea o los ítems con sus importes exactos. */
function calcular(e: EntradaNce, errores: string[]): ItemNce[] {
  const items: ItemNce[] = [];
  const vistas = new Set<number>();

  for (const l of e.lineas) {
    const o = l.original;
    const n = o.linea;
    const nombre = `Ítem ${n} (${o.descripcion.slice(0, 40)})`;

    if (vistas.has(n)) { errores.push(`${nombre}: la línea está repetida.`); continue; }
    vistas.add(n);

    const saldo = saldoDe(o, l.acreditado);
    const proporcion = parseDec(o.proporcion, 8) ?? B(0);
    let cantidad: Dec;
    let precio: Dec;

    if (e.motivo === 2) {
      const c = parseDec(l.cantidad, 4);

      if (saldo.monto <= B(0) || saldo.cantidad <= B(0)) { errores.push(`${nombre}: no tiene saldo disponible para devolver.`); continue; }
      if (c === null || c <= B(0)) { errores.push(`${nombre}: la cantidad a devolver debe ser mayor que cero, con hasta 4 decimales.`); continue; }
      if (c > saldo.cantidad) { errores.push(`${nombre}: la cantidad a devolver (${textoDec(c)}) supera la disponible (${textoDec(saldo.cantidad)}).`); continue; }

      cantidad = c;
      precio = parseDec(o.precio, 8) ?? B(0);
    } else {
      const m = parseDec(l.monto, e.moneda === "PYG" ? 0 : 4);

      if (saldo.monto <= B(0)) { errores.push(`${nombre}: no tiene saldo disponible para acreditar.`); continue; }
      if (m === null || m <= B(0)) { errores.push(`${nombre}: el crédito debe ser un monto mayor que cero${e.moneda === "PYG" ? " (sin decimales en guaraníes)" : ", con hasta 4 decimales"}.`); continue; }
      if (m > saldo.monto) { errores.push(`${nombre}: el crédito (${textoDec(m)}) supera el saldo disponible (${textoDec(saldo.monto)}).`); continue; }

      // Cantidad 1 y precio = monto: el importe de la línea es EXACTAMENTE el crédito (no se multiplica por la cantidad de la factura).
      cantidad = S;
      precio = m;
    }

    const r = calcularItem({ cantidad, precioUnitario: precio, afectacion: o.afectacion, tasa: o.tasa, proporcion });

    if (e.motivo === 2 && r.totOperacion > saldo.monto) { errores.push(`${nombre}: el importe de la devolución (${textoDec(r.totOperacion)}) supera el saldo monetario disponible (${textoDec(saldo.monto)}).`); continue; }
    if (r.totOperacion <= B(0)) { errores.push(`${nombre}: el importe resultante debe ser mayor que cero.`); continue; }

    items.push({ linea: n, cantidad, precio, original: o, ...r, montoTexto: textoDec(r.totOperacion), cantidadAcreditadaTexto: e.motivo === 2 ? textoDec(cantidad) : "0" });
  }

  return items;
}

/** Errores de validación de la NCE (lista vacía = emitible). Mensajes en español para la pantalla y la API. */
export function validarEntradaNce(e: EntradaNce): string[] {
  const errores: string[] = [];

  if (!esMotivoNce(e.motivo)) errores.push("Seleccione el motivo de la nota de crédito (Devolución, Descuento, Bonificación o Ajuste de precio).");
  if (!esMonedaFE(e.moneda)) errores.push("La moneda de la factura original no es válida.");
  else if (e.moneda === "PYG" && e.cambio !== null) errores.push("Una nota de crédito en guaraníes no lleva tipo de cambio.");
  else if (e.moneda !== "PYG" && (e.cambio === null || leerCambio(e.cambio) === null)) errores.push("La factura original en moneda extranjera no tiene un tipo de cambio válido.");
  if (e.observacion.length > OBSERVACION_MAXIMA) errores.push(`La observación supera ${OBSERVACION_MAXIMA} caracteres.`);
  if (sinControl.test(e.observacion)) errores.push("La observación contiene caracteres no permitidos.");
  if (e.lineas.length === 0) errores.push("Seleccione al menos una línea de la factura.");
  if (e.lineas.length > MAX_LINEAS_NCE) errores.push(`Una nota de crédito admite hasta ${MAX_LINEAS_NCE} ítems.`);
  if (errores.length > 0 || !esMotivoNce(e.motivo)) return errores;

  const items = calcular(e, errores);

  if (errores.length > 0 || items.length !== e.lineas.length) return errores;

  const calculados = items.map((i) => ({ entrada: { cantidad: i.cantidad, precioUnitario: i.precio, afectacion: i.original.afectacion, tasa: i.original.tasa, proporcion: parseDec(i.original.proporcion, 8) ?? B(0) }, resultado: i }));
  const sub = calcularSubtotales(calculados);
  const suma = items.reduce((a, i) => a + i.totOperacion, B(0));

  if (sub.dTotGralOpe <= B(0)) errores.push("El total de la nota de crédito debe ser mayor que cero.");
  if (sub.dTotGralOpe >= TOTAL_MAXIMO_NCE) errores.push("El total de la nota de crédito supera el máximo admitido.");
  // NCE-DB-01/02: el total principal se guarda en documentos_electronicos.total numeric(20,4) y debe coincidir EXACTAMENTE con las líneas y el JSON: nunca se redondea ni se trunca en silencio.
  if (sub.dTotGralOpe % TOTAL_ESCALA_4 !== B(0)) errores.push("El total de la nota de crédito no se puede representar con hasta 4 decimales: ajuste la cantidad o el monto.");
  else if (e.moneda === "PYG" && sub.dTotGralOpe % S !== B(0)) errores.push("El total de una nota de crédito en guaraníes debe ser un número entero (sin centavos): ajuste la cantidad a devolver o el monto.");
  if (sub.dTotGralOpe !== suma) errores.push(`El total (${textoDec(sub.dTotGralOpe)}) difiere de la suma de las líneas (${textoDec(suma)}) por el redondeo del IVA de un ítem: no se puede emitir sin ajustar los importes.`);

  const valores: Dec[] = [
    ...items.flatMap((i) => [i.cantidad, i.precio, i.totBruto, i.totOperacion, i.baseGravada, i.liquidacion, i.baseExenta]),
    sub.dSubExe, sub.dSubExo, sub.dSub5, sub.dSub10, sub.dTotOpe, sub.dTotGralOpe, sub.dIVA5, sub.dIVA10, sub.dTotIVA, sub.dBaseGrav5, sub.dBaseGrav10, sub.dTBasGraIVA,
  ];

  if (!valores.every(exacto)) errores.push("Algún importe de la nota de crédito no puede escribirse en el documento electrónico sin perder precisión. Reduzca los importes.");

  if (e.moneda !== "PYG" && e.cambio !== null && leerCambio(e.cambio) !== null) {
    const gs = totalEnGuaranies(sub.dTotGralOpe, e.cambio);

    if (gs === null) errores.push("El equivalente en guaraníes (total × tipo de cambio original) no es exacto: ajuste los importes; no se redondea.");
    else if (!cabeEnF023(gs)) errores.push(`El equivalente en guaraníes supera los ${MAX_ENTEROS_F023} dígitos enteros que admite el Manual Técnico.`);
    else if (!exacto(gs)) errores.push("El equivalente en guaraníes no puede escribirse en el documento electrónico sin perder precisión.");
  }

  return errores;
}

export type ResultadoNce = {
  items: ItemNce[];
  totales: { exento: string; exonerado: string; gravado5: string; gravado10: string; iva5: string; iva10: string; totalIva: string; total: string };
  totalTexto: string;
};

/** Cálculo de la NCE (mismo motor del payload) para el resumen de la pantalla. Lanza si la entrada no es válida. */
export function calcularNce(e: EntradaNce): ResultadoNce {
  const invalidos = validarEntradaNce(e);

  if (invalidos.length > 0) throw new Error(`La entrada no es válida para la nota de crédito: ${invalidos.join(" | ")}`);

  const items = calcular(e, []);
  const sub = calcularSubtotales(items.map((i) => ({ entrada: { cantidad: i.cantidad, precioUnitario: i.precio, afectacion: i.original.afectacion, tasa: i.original.tasa, proporcion: parseDec(i.original.proporcion, 8) ?? B(0) }, resultado: i })));

  return {
    items,
    totales: { exento: textoDec(sub.dSubExe), exonerado: textoDec(sub.dSubExo), gravado5: textoDec(sub.dSub5), gravado10: textoDec(sub.dSub10), iva5: textoDec(sub.dIVA5), iva10: textoDec(sub.dIVA10), totalIva: textoDec(sub.dTotIVA), total: textoDec(sub.dTotGralOpe) },
    totalTexto: textoDec(sub.dTotGralOpe),
  };
}

const num = (d: Dec) => numeroDec(d);

/**
 * Payload NCE (sin cdc, dEst, dPunExp, dNumDoc, dSerieNum, dFeEmiDE: los completa fe_documento_crear_nce). `receptor` son los campos de la FE original (CAMPOS_RECEPTOR) copiados sin cambios;
 * `cdcOriginal` es el CDC de la factura asociada (DocumentosAsociados[0].dCdCDERef). dInfoEmi/dInfoFisc no se copian: son propios de la emisión original.
 */
export function construirPayloadNCE(e: EntradaNce, receptor: Record<string, unknown>, cdcOriginal: string): Record<string, unknown> {
  const invalidos = validarEntradaNce(e);

  if (invalidos.length > 0) throw new Error(`La entrada no es válida para construir el payload NCE: ${invalidos.join(" | ")}`);
  if (!/^\d{44}$/.test(cdcOriginal)) throw new Error("El CDC de la factura original no es válido.");

  const r = calcularNce(e);
  const sub = calcularSubtotales(r.items.map((i) => ({ entrada: { cantidad: i.cantidad, precioUnitario: i.precio, afectacion: i.original.afectacion, tasa: i.original.tasa, proporcion: parseDec(i.original.proporcion, 8) ?? B(0) }, resultado: i })));
  const extranjera = e.moneda !== "PYG";
  const totalGs = extranjera && e.cambio !== null ? totalEnGuaranies(sub.dTotGralOpe, e.cambio) : null;
  const observacion = e.observacion.trim();

  if (extranjera && (totalGs === null || !cabeEnF023(totalGs))) throw new Error("El equivalente en guaraníes (F023) no es válido.");

  return {
    iTiDE: 5,
    iMotEmi: e.motivo,
    dInfoEmi: null,
    dInfoFisc: null,
    iTImp: 1,
    cMoneOpe: e.moneda,
    dCondTiCam: extranjera ? 1 : null,
    dTiCam: extranjera && e.cambio !== null ? Number(e.cambio) : null,
    dInfAdic: observacion === "" ? null : observacion,
    ...Object.fromEntries(CAMPOS_RECEPTOR.map((k) => [k, receptor[k] ?? null])),
    DocumentosAsociados: [{ iTipDocAso: 1, dCdCDERef: cdcOriginal }],
    Detalles: r.items.map((i) => ({
      dCodInt: i.original.codigoInterno,
      dGtin: i.original.gtin,
      dDesProSer: i.original.descripcion.trim(),
      cUniMed: i.original.unidadSifen,
      dCantProSer: num(i.cantidad),
      dPUniProSer: num(i.precio),
      dTotBruOpeItem: num(i.totBruto),
      dTotOpeItem: num(i.totOperacion),
      iAfecIVA: i.original.afectacion,
      dPropIVA: num(parseDec(i.original.proporcion, 8) ?? B(0)),
      dTasaIVA: i.original.tasa,
      dBasGravIVA: num(i.baseGravada),
      dLiqIVAItem: num(i.liquidacion),
      dBasExe: num(i.baseExenta),
    })),
    Subtotales: [
      {
        dSubExe: num(sub.dSubExe), dSubExo: num(sub.dSubExo), dSub5: num(sub.dSub5), dSub10: num(sub.dSub10), dTotOpe: num(sub.dTotOpe),
        dTotDesc: 0, dTotDescGlotem: 0, dTotAntItem: 0, dTotAnt: 0, dPorcDescTotal: 0, dDescTotal: 0, dAnticipo: 0, dRedon: 0,
        dTotGralOpe: num(sub.dTotGralOpe), dIVA5: num(sub.dIVA5), dIVA10: num(sub.dIVA10), dLiqTotIVA5: num(sub.dIVA5), dLiqTotIVA10: num(sub.dIVA10), dTotIVA: num(sub.dTotIVA),
        dBaseGrav5: num(sub.dBaseGrav5), dBaseGrav10: num(sub.dBaseGrav10), dTBasGraIVA: num(sub.dTBasGraIVA), dTotalGs: extranjera && totalGs !== null ? num(totalGs) : num(sub.dTotalGs),
      },
    ],
  };
}

/** Líneas para fe_documento_crear_nce: ordinal, cantidad (solo devolución; 0 en los demás) y monto con IVA incluido, como texto Decimal exacto. */
export function lineasParaSql(e: EntradaNce): Array<{ linea: number; cantidad: string; monto: string }> {
  const r = calcularNce(e);

  return r.items.map((i) => ({ linea: i.linea, cantidad: e.motivo === 2 ? textoDec(i.cantidad) : "0", monto: i.montoTexto }));
}
