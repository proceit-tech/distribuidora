import { CONDICION_CONTADO, CONDICION_CREDITO, CREDITO_CUOTAS, CREDITO_PLAZO, erroresCredito, hoyParaguay, plazoTexto, type CreditoEntrada } from "@/lib/facturacion/credito";
import { cabeEnF023, esMonedaFE, leerCambio, MAX_ENTEROS_F023, totalEnGuaranies } from "@/lib/facturacion/monedas";
import { DESCRIPCION_FISCAL_DENOMINACION, DESCRIPCION_FISCAL_MONEDA, DESCRIPCION_FISCAL_PAGO, erroresMedio, FORMAS_PAGO, TIPO_EFECTIVO, numeroChequeFiscal, TIPO_CHEQUE, TIPO_OTRO, TIPO_TARJETA_CREDITO, TIPO_TARJETA_DEBITO, type PagoEntrada } from "@/lib/facturacion/pagos";
import { B, S, calcularItem, calcularSubtotales, numeroDec, parseDec, textoDec, type AfectacionIva, type Dec, type Subtotales, type TasaIva } from "@/lib/facturacion/calculo";
import { resolverDescuentos, type DescuentoEntrada } from "@/lib/facturacion/descuentos";

/**
 * Validación fiscal y construcción del payload de Factura Electrónica (iTiDE = 1) a partir de datos YA resueltos por el servidor desde los
 * cadastros (cliente, productos, precios). Puro y sin red. Los nombres de campo son los del JSON FE conocido del gateway (ver especificación
 * REQUISITOS-FACTURACION-ELECTRONICA, §4) y los del MT v150.
 *
 * NO se incluyen aquí: cdc, dEst, dPunExp, dNumDoc, dSerieNum y dFeEmiDE (los completa la función SQL fe_documento_crear_fe al reservar el número
 * y fijar la fecha), ni datos del emisor/timbrado (los resuelve el gateway). Alcance: guaraníes, condición Contado o Crédito (plazo/cuotas, MFE-B1), sin descuentos, anticipos,
 * exportación ni contratación pública.
 */

/**
 * iTipTra (MT v150, D011): catálogo normativo COMPLETO, conferido contra el Manual Técnico del repositorio. Solo se habilitan los que una factura al contado en
 * guaraníes con IVA incluido calcula igual que una venta; los demás exigen reglas que esta etapa no implementa (divisas: tipo de cambio; compras: son de
 * autofactura; anticipo, crédito fiscal, muestras médicas y donaciones: tratamiento fiscal propio) y NO se ofrecen.
 */
export const CATALOGO_TIPOS_TRANSACCION: Record<number, string> = {
  1: "Venta de mercadería", 2: "Prestación de servicios", 3: "Mixto (venta de mercadería y servicios)", 4: "Venta de activo fijo", 5: "Venta de divisas", 6: "Compra de divisas",
  7: "Promoción o entrega de muestras", 8: "Donación", 9: "Anticipo", 10: "Compra de productos", 11: "Compra de servicios", 12: "Venta de crédito fiscal", 13: "Muestras médicas (Art. 3 RG 24/2014)",
};
export const TIPOS_TRANSACCION = { 1: CATALOGO_TIPOS_TRANSACCION[1], 2: CATALOGO_TIPOS_TRANSACCION[2], 3: CATALOGO_TIPOS_TRANSACCION[3], 4: CATALOGO_TIPOS_TRANSACCION[4] } as Record<number, string>;
/** iCondOpe (E601): 1 Contado / 2 Crédito (plazo o cuotas, MFE-B1). */
export const CONDICIONES_OPERACION = { 1: "Contado", 2: "Crédito" } as Record<number, string>;
export const TIPOS_CREDITO = { 1: "Plazo", 2: "Cuotas" } as Record<number, string>;
/** iIndPres (MT v150, E011): 1–6 completos; el código 9 «Otro» exige además un texto descriptivo (E012) que el JSON funcional no transporta, por eso no se ofrece. */
export const INDICADORES_PRESENCIA = { 1: "Operación presencial", 2: "Operación electrónica", 3: "Operación telemarketing", 4: "Venta a domicilio", 5: "Operación bancaria", 6: "Operación cíclica" } as const;
/** E606 (MT v150): catálogo de medios habilitados con sus condicionales (MFE-03 P1; ver `pagos.ts`). */
export { FORMAS_PAGO };

/** NT 024: sin nombre (Innominado) no se admite con total general ≥ Gs. 7.000.000 (D208c). */
export const LIMITE_INNOMINADO = B(7000000) * S;
export const MAX_LINEAS = 999; // gCamItem 1-999
/** E711 dCantProSer (NT 023: 1-10p(0-8)): a lo sumo 10 dígitos enteros. Nexit admite además solo 4 decimales (restricción propia, más estricta que la norma). */
export const CANTIDAD_MAXIMA = B(10000000000) * S;
/** E608 dMonTiPag (MT v150: 1-15p(0-4)): a lo sumo 4 decimales; en la escala interna de 8 decimales, el monto debe ser múltiplo de 10^4. */
const PASO_MONTO_PAGO = S / B(10000);

/** D209 dDTipIDRec: la descripción de los códigos 1–6 es la del catálogo del Manual (D208); para 9 «Otro» la informa el cadastro (9–41 caracteres). */
export const DESCRIPCION_TIPO_DOCUMENTO: Record<number, string> = { 1: "Cédula paraguaya", 2: "Pasaporte", 3: "Cédula extranjera", 4: "Carnet de residencia", 5: "Innominado", 6: "Tarjeta Diplomática de exoneración fiscal" };
/** D211 dNomRec / D210 dNumIDRec de un DE Innominado (MT v150 y NT 023). */
export const NOMBRE_INNOMINADO_FE = "Sin Nombre";
/** D217 dCodCliente: A 3-15 (opcional). */
const CODIGO_CLIENTE = { min: 3, max: 15 } as const;
export const TOTAL_MAXIMO = B(1000000000000) * S; // acota el número JSON a una precisión segura

export type ReceptorFE = {
  codigo: string;
  naturaleza: 1 | 2; // D201: 1 contribuyente, 2 no contribuyente
  tipoOperacion: 1 | 2 | 3 | 4; // D202: B2B, B2C, B2G, B2F
  tipoContribuyente: 1 | 2 | null; // D205: 1 física, 2 jurídica (solo contribuyente)
  pais: string; // D203
  ruc: string; // D206 (sin DV)
  dv: string; // D207
  tipoDocumentoIdentidad: number | null; // D208 (no contribuyente, no B2F)
  descripcionTipoDocumento: string; // D209
  numeroDocumento: string; // D210
  razonSocial: string; // D211
  nombreFantasia: string; // D212
  direccion: string; // D213
  numeroCasa: string; // D218
  departamento: string; // D219
  distrito: string; // D221
  ciudad: string; // D223
  telefono: string;
  celular: string;
  email: string;
  emailCopia: string;
  emailFacturacion: string;
};

export type LineaFE = {
  codigoInterno: string; // E701
  gtin: string | null; // E714
  descripcion: string; // E708 (descripción de factura)
  unidadSifen: number | null; // E709
  cantidad: string; // E711
  precio: string; // E721 (impuestos incluidos)
  afectacion: number | null; // E731
  tasa: number | null; // E734
  proporcion: string | null; // E733 (solo afectación 4)
  /** E03: descuento particular del ítem (% o monto POR UNIDAD, EA002/EA003). */
  descuento?: DescuentoEntrada | null;
};

export type EntradaFE = {
  /** D015: PYG, USD o BRL. */
  moneda: string;
  /** D018: guaraníes por 1 unidad de la moneda extranjera (texto Decimal, ≤ 5 enteros y 4 decimales). Obligatorio con USD/BRL y prohibido con PYG. */
  cambio?: string;
  tipoTransaccion: number;
  presencia: number;
  condicion: number; // 1 contado / 2 crédito
  /** Contado: los pagos suman el total. Crédito: SOLO la entrega inicial (E605), vacío si no hay entrega. */
  pagos: Array<PagoEntrada & { monto: string }>;
  /** Solo con condicion 2 (E640): plazo o cuotas. */
  credito?: CreditoEntrada;
  infoAdicional: string;
  receptor: ReceptorFE;
  lineas: LineaFE[];
  /** E03: descuento general (F010; % o monto, que se convierte a % y se reparte sin prorrateo en EA004 de cada ítem). */
  descuentoGlobal?: DescuentoEntrada | null;
};

function prepararLineas(lineas: LineaFE[], errores: string[]) {
  const items: Array<{ linea: LineaFE; cantidad: Dec; precio: Dec; afectacion: AfectacionIva; tasa: TasaIva; proporcion: Dec }> = [];

  lineas.forEach((l, idx) => {
    const n = idx + 1;
    const cantidad = parseDec(l.cantidad, 4);
    const precio = parseDec(l.precio, 8);

    if (!l.codigoInterno || l.codigoInterno.length > 20) errores.push(`Ítem ${n}: el código del producto debe tener de 1 a 20 caracteres para el documento electrónico.`);
    if (!l.descripcion.trim() || l.descripcion.length > 120) errores.push(`Ítem ${n}: la descripción de factura del producto debe tener de 1 a 120 caracteres.`);
    if (l.gtin !== null && !/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(l.gtin)) errores.push(`Ítem ${n}: el GTIN del producto debe tener 8, 12, 13 o 14 dígitos.`);
    if (l.unidadSifen === null) errores.push(`Ítem ${n}: la unidad de medida del producto no tiene equivalencia SIFEN configurada.`);
    else if (!Number.isInteger(l.unidadSifen) || l.unidadSifen < 1 || l.unidadSifen > 99999) errores.push(`Ítem ${n}: el código SIFEN de la unidad de medida debe ser un entero de 1 a 5 dígitos.`);
    if (cantidad === null || cantidad <= B(0)) errores.push(`Ítem ${n}: la cantidad debe ser mayor que cero, con hasta 4 decimales.`);
    else if (cantidad >= CANTIDAD_MAXIMA) errores.push(`Ítem ${n}: la cantidad admite hasta 10 dígitos enteros.`);
    if (precio === null || precio <= B(0)) errores.push(`Ítem ${n}: el producto no tiene un precio de venta de referencia válido en guaraníes.`);
    if (l.afectacion === null || ![1, 2, 3, 4].includes(l.afectacion)) {
      errores.push(`Ítem ${n}: el producto no tiene clasificación de IVA (afectación). Clasifíquelo en Productos antes de facturarlo.`);

      return;
    }

    const tasaOk = l.afectacion === 1 || l.afectacion === 4 ? l.tasa === 5 || l.tasa === 10 : l.tasa === 0;
    const prop = l.afectacion === 1 ? B(100) * S : l.afectacion === 4 ? parseDec(l.proporcion, 8) : B(0);

    if (!tasaOk) errores.push(`Ítem ${n}: la tasa de IVA del producto no es coherente con su afectación.`);
    if (l.afectacion === 4 && (prop === null || prop <= B(0) || prop >= B(100) * S)) errores.push(`Ítem ${n}: el gravado parcial requiere una proporción gravada mayor que 0 y menor que 100.`);
    if (cantidad !== null && precio !== null && tasaOk && prop !== null) {
      items.push({ linea: l, cantidad, precio, afectacion: l.afectacion as AfectacionIva, tasa: l.tasa as TasaIva, proporcion: prop });
    }
  });

  return { items };
}

/** Un importe se escribe en el JSON como número de JavaScript: debe ir ida y vuelta sin perder dígitos ni caer en notación exponencial (p. ej. 1e-7). */
const exacto = (d: Dec): boolean => String(numeroDec(d)) === textoDec(d);

/** Número JSON de un importe que ya debe ser exacto: si no lo fuera, FALLA en vez de cambiar el valor en silencio (defensa en profundidad; la validación lo rechaza antes de reservar numeración). */
function numeroExacto(d: Dec): number {
  if (!exacto(d)) throw new Error("Un importe del documento no puede escribirse sin perder precisión.");

  return numeroDec(d);
}

type ItemPreparado = { linea: LineaFE; cantidad: Dec; precio: Dec; afectacion: AfectacionIva; tasa: TasaIva; proporcion: Dec };

/** Cálculo único (validación, payload, total y pantalla): resuelve los descuentos (E03) y calcula ítems y subtotales con el mismo motor. */
function calcularFE(items: ItemPreparado[], general?: DescuentoEntrada | null) {
  const res = resolverDescuentos(items.map((i) => ({ cantidad: i.cantidad, precio: i.precio, descuento: i.linea.descuento ?? null })), general ?? null);
  const calculados = items.map((i, k) => {
    const entrada = { cantidad: i.cantidad, precioUnitario: i.precio, afectacion: i.afectacion, tasa: i.tasa, proporcion: i.proporcion, descuentoItem: res.porItem[k].descItem, descuentoGlobal: res.porItem[k].descGlobal };

    return { i, entrada, resultado: calcularItem(entrada) };
  });

  return { res, calculados, sub: calcularSubtotales(calculados) };
}

function importesRepresentables(items: Array<{ cantidad: Dec; precio: Dec; proporcion: Dec }>, resultados: Array<{ totBruto: Dec; totOperacion: Dec; baseGravada: Dec; liquidacion: Dec; baseExenta: Dec }>, sub: Subtotales, extra: Dec[] = []): boolean {
  const valores: Dec[] = [
    ...extra,
    sub.dTotDesc, sub.dTotDescGlotem, sub.dDescTotal,
    ...items.flatMap((i) => [i.cantidad, i.precio, i.proporcion]),
    ...resultados.flatMap((x) => [x.totBruto, x.totOperacion, x.baseGravada, x.liquidacion, x.baseExenta]),
    sub.dSubExe, sub.dSubExo, sub.dSub5, sub.dSub10, sub.dTotOpe, sub.dTotGralOpe, sub.dIVA5, sub.dIVA10, sub.dTotIVA, sub.dBaseGrav5, sub.dBaseGrav10, sub.dTBasGraIVA, sub.dTotalGs,
  ];

  return valores.every(exacto);
}

/** Errores de validación fiscal de la entrada (lista vacía = emitible). Mensajes en español para la pantalla y la API. */
export function validarEntradaFE(e: EntradaFE, hoy: string = hoyParaguay()): string[] {
  const errores: string[] = [];

  if (!esMonedaFE(e.moneda)) errores.push("La moneda de la factura no es válida (PYG, USD o BRL).");
  else if (e.moneda === "PYG" && e.cambio !== undefined) errores.push("Una factura en guaraníes no lleva tipo de cambio.");
  else if (e.moneda !== "PYG" && (e.cambio === undefined || leerCambio(e.cambio) === null)) errores.push(`Indique el tipo de cambio manual: guaraníes por 1 ${e.moneda} (mayor que cero, hasta 5 enteros y 4 decimales).`);
  if (!(e.tipoTransaccion in TIPOS_TRANSACCION)) errores.push("Seleccione un tipo de transacción válido.");
  if (!(e.presencia in INDICADORES_PRESENCIA)) errores.push("Seleccione un indicador de presencia válido.");
  if (e.condicion !== CONDICION_CONTADO && e.condicion !== CONDICION_CREDITO) errores.push("Seleccione la condición de la operación: Contado o Crédito.");
  if (e.condicion === CONDICION_CONTADO && e.credito !== undefined) errores.push("Una factura al contado no lleva datos de crédito.");
  if (e.condicion === CONDICION_CREDITO && e.credito === undefined) errores.push("Indique las condiciones del crédito (plazo o cuotas).");
  if (e.infoAdicional.length > 5000) errores.push("La información adicional supera 5000 caracteres.");
  if (e.lineas.length === 0) errores.push("Agregue al menos un ítem.");
  if (e.lineas.length > MAX_LINEAS) errores.push(`Una factura admite hasta ${MAX_LINEAS} ítems.`);

  const { items } = prepararLineas(e.lineas.slice(0, MAX_LINEAS), errores);

  if (errores.length > 0 || items.length !== e.lineas.length) return errores;

  const { res: descuentos, calculados, sub } = calcularFE(items, e.descuentoGlobal);

  if (descuentos.errores.length > 0) return descuentos.errores;

  if (sub.dTotGralOpe <= B(0)) errores.push("El total de la factura debe ser mayor que cero.");
  if (sub.dTotGralOpe >= TOTAL_MAXIMO) errores.push("El total de la factura supera el máximo admitido.");
  // Conciliación (FAT-E1-R01-01): el total de la operación (F014) debe ser EXACTAMENTE la suma de los valores de los ítems (EA008) y el pago al contado debe poder igualarlo
  // con los 4 decimales de E608. Ni el MT ni el contrato del gateway autorizan un ajuste, una tolerancia ni un redondeo (dRedon queda en 0): si no concilia, no se emite.
  const sumaItems = calculados.reduce((a, c) => a + c.resultado.totOperacion, B(0));

  if (sub.dTotGralOpe !== sumaItems) errores.push(`El total de la operación (${textoDec(sub.dTotGralOpe)}) difiere de la suma de los ítems (${textoDec(sumaItems)}) por el redondeo del IVA de un ítem con gravado parcial (NT 13). No se puede conciliar sin un ajuste no autorizado: use ítems con otra cantidad o precio, o no los combine.`);
  else if (sub.dTotGralOpe % PASO_MONTO_PAGO !== B(0)) errores.push(`El total de la factura (${textoDec(sub.dTotGralOpe)}) tiene más de 4 decimales y el pago (E608) admite solo 4: no se puede conciliar sin un ajuste no autorizado. Ajuste las cantidades o los precios.`);
  if (!importesRepresentables(items, calculados.map((c) => c.resultado), sub, [descuentos.porcGlobal, ...descuentos.porItem.flatMap((d) => [d.descItem, d.porcItem, d.descGlobal])])) errores.push("Algún importe de la factura no puede escribirse en el documento electrónico sin perder precisión. Reduzca las cantidades o los precios.");

  // Moneda extranjera: F023 dTotalGs = F014 × D018 EXACTO (regla 2385). Con total y cambio de ≤ 4 decimales el producto es exacto; si no cupiera como número del JSON, se bloquea la modalidad (nunca se redondea).
  const totalGs = totalEnGuaranies0(e, sub.dTotGralOpe);

  if (e.moneda !== "PYG" && esMonedaFE(e.moneda) && leerCambio(e.cambio) !== null) {
    if (totalGs === null) errores.push("El equivalente en guaraníes (F023 = total × tipo de cambio) no es exacto: ajuste el tipo de cambio o los importes; no se redondea.");
    else if (!cabeEnF023(totalGs)) errores.push(`El equivalente en guaraníes (F023 = total × tipo de cambio = ${textoDec(totalGs)}) supera los ${MAX_ENTEROS_F023} dígitos enteros que admite el Manual (1-15p(0-8)). Reduzca los importes o el tipo de cambio; no se trunca ni se redondea.`);
    else if (!exacto(totalGs)) errores.push("El equivalente en guaraníes (F023) no puede escribirse en el documento electrónico sin perder precisión. Reduzca los importes o el tipo de cambio.");
  }

  // Contado: al menos un pago. Crédito: sin entrega no hay grupo de pago (E605 no se informa); con entrega, los pagos iniciales.
  if (e.condicion === CONDICION_CREDITO ? e.pagos.length > 999 : e.pagos.length === 0 || e.pagos.length > 999) errores.push("Indique la forma de pago.");

  let sumaPagos = B(0);
  let posicion = 0;

  for (const p of e.pagos) {
    const m = parseDec(p.monto, 8);

    posicion += 1;
    if (!(p.tipo in FORMAS_PAGO)) errores.push("Una forma de pago no es válida.");
    else errores.push(...erroresMedio(p, posicion, e.presencia));
    if (m === null || m <= B(0)) errores.push("Cada pago debe tener un monto mayor que cero.");
    else if (m % PASO_MONTO_PAGO !== B(0)) errores.push("El monto de un pago admite hasta 4 decimales (E608).");
    else if (!exacto(m)) errores.push("El monto de un pago no puede escribirse en el documento electrónico sin perder precisión. Reduzca el monto.");
    else sumaPagos += m;
  }
  // Σ de pagos (= E645 en crédito): también debe viajar como número exacto; ni una suma de montos exactos puede cambiar de valor al serializarse.
  if (errores.length === 0 && !exacto(sumaPagos)) errores.push("La suma de los pagos no puede escribirse en el documento electrónico sin perder precisión. Reduzca los montos.");
  if (e.condicion === CONDICION_CREDITO && e.credito !== undefined) {
    // La suma de pagos es la ENTREGA INICIAL (E645 = Σ E608): entrega + cuotas (o saldo a plazo) = total, sin contarla dos veces.
    // Los medios de pago cubren EXACTAMENTE la entrega declarada (E645 = Σ E608), nunca el saldo financiado; sin entrega no hay medios.
    const declarada = e.credito.entrega === null ? B(0) : parseDec(e.credito.entrega, 4) ?? B(0);

    if (errores.length === 0 && sumaPagos !== declarada) errores.push(e.credito.entrega === null ? "Sin entrega inicial no se informan medios de pago." : `Los medios de pago suman ${textoDec(sumaPagos)} y deben sumar exactamente la entrega inicial (${textoDec(declarada)}).`);
    if (errores.length === 0) errores.push(...erroresCredito(e.credito, sub.dTotGralOpe, sumaPagos, hoy));
  } else if (errores.length === 0 && sumaPagos !== sub.dTotGralOpe) errores.push("La suma de los pagos debe ser igual al total de la factura.");

  // Receptor (reglas del MT v150 y NT 010/023/024; la coherencia de la ficha la valida aparte la aptitud SIFEN del cliente).
  const r = e.receptor;

  if (r.tipoDocumentoIdentidad === 5 && r.tipoOperacion !== 2) errores.push("El cliente Innominado solo puede usarse en operaciones B2C.");
  // NT 024: el límite es en guaraníes; con moneda extranjera se compara el equivalente F023.
  if (r.tipoDocumentoIdentidad === 5 && (totalGs ?? sub.dTotGralOpe) >= LIMITE_INNOMINADO) errores.push("No se puede facturar a un cliente Innominado con un total igual o superior a Gs. 7.000.000 (NT 024).");
  if (r.naturaleza === 1 && (!/^\d{3,8}$/.test(r.ruc) || !/^\d$/.test(r.dv))) errores.push("El cliente contribuyente requiere RUC y dígito verificador válidos (RUC de 3 a 8 dígitos y DV de 1 dígito).");
  if (r.naturaleza === 1 && r.tipoContribuyente !== 1 && r.tipoContribuyente !== 2) errores.push("El cliente contribuyente requiere el tipo de contribuyente (persona física o jurídica).");
  if (r.razonSocial.trim().length < 4 || r.razonSocial.length > 255) errores.push("El nombre o razón social del cliente debe tener de 4 a 255 caracteres.");
  if (r.naturaleza === 2 && r.tipoDocumentoIdentidad !== null && ![1, 2, 3, 4, 5, 6, 9].includes(r.tipoDocumentoIdentidad)) errores.push("El tipo de documento de identidad del cliente no es válido.");
  if (r.naturaleza === 2 && r.tipoDocumentoIdentidad === 9 && (r.descripcionTipoDocumento.trim().length < 9 || r.descripcionTipoDocumento.trim().length > 41)) errores.push("El tipo de documento «Otro» requiere una descripción de 9 a 41 caracteres.");
  if (r.numeroDocumento.length > 20) errores.push("El número de documento del cliente no puede superar 20 caracteres.");
  if (r.tipoDocumentoIdentidad === 5 && (r.numeroDocumento !== "0" || r.razonSocial.trim() !== NOMBRE_INNOMINADO_FE)) errores.push(`El cliente Innominado debe tener documento «0» y nombre «${NOMBRE_INNOMINADO_FE}».`);
  if (r.direccion.length > 255) errores.push("La dirección del cliente no puede superar 255 caracteres.");
  if (r.tipoOperacion === 4 && r.direccion.trim() === "") errores.push("Una operación B2F requiere la dirección del receptor (D213).");
  if (r.naturaleza === 2 && r.tipoOperacion !== 4 && (r.tipoDocumentoIdentidad === null || r.numeroDocumento === "")) errores.push("El cliente no contribuyente requiere tipo y número de documento.");
  errores.push(...erroresDomicilioReceptor(r));

  return errores;
}

/** Códigos geográficos SIFEN del receptor: enteros positivos, sin ceros a la izquierda, con el largo del Manual (D219 1-2, D221 1-4, D223 1-5 dígitos). */
const CODIGO_DEPARTAMENTO = /^[1-9]\d{0,1}$/;
const CODIGO_DISTRITO = /^[1-9]\d{0,3}$/;
const CODIGO_CIUDAD = /^[1-9]\d{0,4}$/;

/**
 * País y bloque de domicilio fiscal del receptor (D203, D213, D218, D219, D221, D223; MT v150 y NT 003). El bloque es todo o nada: sin calle no se informa ningún dato de
 * domicilio (el país se conserva); con calle se exige un número de casa numérico real (1–6 dígitos, nunca un 0 inventado) y, fuera de B2F, departamento, distrito y ciudad
 * como CÓDIGOS (las descripciones las resuelve el gateway). En B2F la geografía paraguaya no se informa ni se exige. La existencia y la jerarquía de los códigos las valida el
 * servidor contra el catálogo geográfico (`validarGeografiaReceptor`), antes de reservar numeración.
 */
export function erroresDomicilioReceptor(r: ReceptorFE): string[] {
  const errores: string[] = [];
  const b2f = r.tipoOperacion === 4;

  if (b2f && (r.pais === "" || r.pais === "PRY")) errores.push("En una operación B2F el país del receptor debe ser distinto de Paraguay (D203).");
  else if (!b2f && r.pais !== "PRY") errores.push("En operaciones B2B, B2C y B2G el país del receptor debe ser Paraguay (D203).");
  if (r.direccion.trim() === "") return errores;
  if (!/^\d{1,6}$/.test(r.numeroCasa.trim())) errores.push("La dirección fiscal del cliente requiere un número de casa numérico de 1 a 6 dígitos (D218). Corríjalo en Clientes; no se reemplaza por 0.");
  if (b2f) return errores;
  if (!CODIGO_DEPARTAMENTO.test(r.departamento.trim())) errores.push("La dirección fiscal del cliente requiere un departamento válido (D219, NT 003).");
  if (!CODIGO_DISTRITO.test(r.distrito.trim())) errores.push("La dirección fiscal del cliente requiere un distrito válido (D221).");
  if (!CODIGO_CIUDAD.test(r.ciudad.trim())) errores.push("La dirección fiscal del cliente requiere una ciudad válida (D223, NT 003).");

  return errores;
}

/**
 * País y domicilio del receptor en el JSON. `cPaisRec` va siempre. Sin calle: `dDirRec` y `dNumCasRec` nulos como hasta ahora y NINGUNA clave geográfica. Con calle: `dNumCasRec` es el
 * número real de la ficha y, fuera de B2F, se agregan SOLO los códigos `cDepRec`, `cDisRec` y `cCiuRec` (jamás `dDesPaisRe`/`dDesDepRec`/`dDesDisRec`/`dDesCiuRec`: el gateway
 * las resuelve). En B2F no viaja geografía paraguaya. Solo se llama con la entrada ya validada.
 */
function domicilioFiscalJSON(r: ReceptorFE): Record<string, unknown> {
  const calle = nulo(r.direccion);

  if (calle === null) return { dDirRec: null, dNumCasRec: null };

  const base = { dDirRec: calle, dNumCasRec: Number(r.numeroCasa.trim()) };

  return r.tipoOperacion === 4 ? base : { ...base, cDepRec: Number(r.departamento.trim()), cDisRec: Number(r.distrito.trim()), cCiuRec: Number(r.ciudad.trim()) };
}

/**
 * Grupo de condición de pago con los nombres y tipos del MT v150 (E641–E654). Contado conserva EXACTAMENTE la forma anterior (iCondCred/dPlazoCre/dCuotas nulos y Cuotas vacío, sin dMonEnt).
 * Crédito: Plazo → iCondCred 1 + dPlazoCre «N días»; Cuotas → iCondCred 2 + dCuotas = filas de Cuotas[]; dMonEnt = Σ de la entrega inicial (nulo sin entrega). Las descripciones
 * (E602/E642/E654/E607/E610) las deriva el gateway del código, igual que en el baseline.
 */
function condicionPago(e: EntradaFE): Record<string, unknown> {
  if (e.condicion !== CONDICION_CREDITO || e.credito === undefined) return { iCondCred: null, dPlazoCre: null, dCuotas: null, Cuotas: [] };

  const c = e.credito;
  const entrega = e.pagos.reduce((a, p) => a + (parseDec(p.monto, 8) ?? B(0)), B(0));

  return {
    iCondCred: c.tipo,
    dPlazoCre: c.tipo === CREDITO_PLAZO && c.plazoDias !== null ? plazoTexto(c.plazoDias) : null,
    dCuotas: c.tipo === CREDITO_CUOTAS ? c.cuotas.length : null,
    dMonEnt: entrega > B(0) ? numeroExacto(entrega) : null,
    Cuotas: c.tipo === CREDITO_CUOTAS ? c.cuotas.map((q) => ({ cMoneCuo: e.moneda, dMonCuota: Number(q.monto), dVencCuo: q.vencimiento })) : [],
  };
}

/**
 * Un elemento de FormaPago[] (E605) con los nombres y tipos del MT: iTiPago (N), dDesTiPag (E607, oficial; con «Otro» la del operador), dMonTiPag (N, exacto), cMoneTiPag (PYG),
 * dDMoneTiPag (E610), dTiCamTiPag nulo; grupos condicionales gPagTarCD (E620, solo tarjeta; con dDesDenTarj E622) y gPagCheq (E630, solo cheque).
 */
function formaPagoJSON(p: PagoEntrada & { monto: string }, moneda: string = "PYG", cambio?: string): Record<string, unknown> {
  const monto = numeroExacto(parseDec(p.monto, 8) ?? B(0));
  const extranjera = moneda !== "PYG";

  // Efectivo/PYG conserva EXACTAMENTE la forma del JSON de referencia del gateway (cuatro claves): ese contrato real no trae E607/E610, luego el gateway las genera para ese caso.
  // Para los demás medios no hay esa evidencia: se envían las descripciones fiscales del MT (E607 dDesTiPag, E610 dDMoneTiPag) para no depender de una derivación no comprobada.
  if (p.tipo === TIPO_EFECTIVO && !extranjera) return { iTiPago: p.tipo, dMonTiPag: monto, cMoneTiPag: "PYG", dTiCamTiPag: null };

  // Moneda extranjera (E609–E611): el pago va en la moneda de la factura y E611 dTiCamTiPag lleva el MISMO cambio manual (obligatorio si E609 ≠ PYG, regla 1556). La descripción de la
  // moneda (E610) solo se envía donde el texto oficial está comprobado (PYG); para USD/BRL la deriva el gateway, como D016 (ver PROGRESSO, MFE-03 P2).
  const descMoneda = DESCRIPCION_FISCAL_MONEDA[moneda];

  return {
    iTiPago: p.tipo,
    dDesTiPag: p.tipo === TIPO_OTRO ? p.descripcion : DESCRIPCION_FISCAL_PAGO[p.tipo],
    dMonTiPag: monto,
    cMoneTiPag: moneda,
    ...(descMoneda !== undefined ? { dDMoneTiPag: descMoneda } : {}),
    dTiCamTiPag: extranjera && cambio !== undefined ? Number(cambio) : null,
    ...((p.tipo === TIPO_TARJETA_CREDITO || p.tipo === TIPO_TARJETA_DEBITO) && p.tarjeta
      ? { gPagTarCD: { iDenTarj: p.tarjeta.denominacion, dDesDenTarj: p.tarjeta.denominacion === 99 ? p.tarjeta.descripcion : DESCRIPCION_FISCAL_DENOMINACION[p.tarjeta.denominacion], iForProPa: p.tarjeta.formaProcesamiento } }
      : {}),
    ...(p.tipo === TIPO_CHEQUE && p.cheque ? { gPagCheq: { dNumCheq: numeroChequeFiscal(p.cheque.numero), dBcoEmi: p.cheque.banco } } : {}),
  };
}

/** F023 como número JSON: EXACTO y dentro de 1-15p(0-8); si no, lanza (defensa en profundidad; la validación lo rechaza antes de reservar numeración). */
function numeroF023(d: Dec | null): number {
  if (d === null || !cabeEnF023(d)) throw new Error("El equivalente en guaraníes (F023) no cabe en 15 dígitos enteros.");

  return numeroExacto(d);
}

/** F023 de la entrada: null en PYG (se conserva el valor del baseline) o si el cambio no es válido/exacto. */
function totalEnGuaranies0(e: EntradaFE, total: Dec): Dec | null {
  return e.moneda === "PYG" || e.cambio === undefined || leerCambio(e.cambio) === null ? null : totalEnGuaranies(total, e.cambio);
}

const nulo = (v: string) => (v.trim() === "" ? null : v.trim());

/**
 * Construye el payload FE (sin cdc ni numeración). Aplica ella misma `validarEntradaFE` (receptor, ítems, conciliación ítems ↔ total ↔ pago, precisión): una llamada futura que no pase
 * por la validación previa nunca produce un JSON fiscal parcial o inconsistente; lanza con la lista de motivos.
 */
export function construirPayloadFE(e: EntradaFE, hoy?: string): Record<string, unknown> {
  const invalidos = validarEntradaFE(e, hoy);

  if (invalidos.length > 0) throw new Error(`La entrada no es válida para construir el payload FE: ${invalidos.join(" | ")}`);

  const errores: string[] = [];
  const { items } = prepararLineas(e.lineas, errores);

  if (errores.length > 0 || items.length !== e.lineas.length) throw new Error("La entrada no es válida para construir el payload FE.");

  const { res: descuentos, calculados, sub } = calcularFE(items, e.descuentoGlobal);
  const r = e.receptor;
  const contribuyente = r.naturaleza === 1;
  const sinDocumento = !contribuyente && r.tipoOperacion === 4;
  const detalles = calculados.map(({ i, resultado: x }, k) => ({
    dCodInt: i.linea.codigoInterno,
    dGtin: i.linea.gtin,
    dDesProSer: i.linea.descripcion.trim(),
    cUniMed: i.linea.unidadSifen,
    dCantProSer: numeroDec(i.cantidad),
    dPUniProSer: numeroDec(i.precio),
    dTotBruOpeItem: numeroDec(x.totBruto),
    dTotOpeItem: numeroDec(x.totOperacion),
    // E03: con algún descuento en el documento, EA002/EA003/EA004 se informan en TODOS los ítems (0 donde no hay, MT v150). Sin descuentos el payload es el de siempre.
    ...(descuentos.hay ? { dDescItem: numeroExacto(descuentos.porItem[k].descItem), dPorcDesIt: numeroExacto(descuentos.porItem[k].porcItem), dDescGloItem: numeroExacto(descuentos.porItem[k].descGlobal) } : {}),
    iAfecIVA: i.afectacion,
    dPropIVA: numeroDec(i.proporcion),
    dTasaIVA: i.tasa,
    dBasGravIVA: numeroDec(x.baseGravada),
    dLiqIVAItem: numeroDec(x.liquidacion),
    dBasExe: numeroDec(x.baseExenta),
  }));
  const num = (d: Dec) => numeroDec(d);

  return {
    iTiDE: 1,
    dInfoEmi: null,
    dInfoFisc: null,
    iTipTra: e.tipoTransaccion,
    iTImp: 1,
    cMoneOpe: e.moneda,
    dCondTiCam: e.moneda !== "PYG" ? 1 : null,
    dTiCam: e.moneda !== "PYG" && e.cambio !== undefined ? Number(e.cambio) : null,
    iIndPres: e.presencia,
    dFecEmNR: null,
    dInfAdic: nulo(e.infoAdicional),
    iNatRec: r.naturaleza,
    iTiOpe: r.tipoOperacion,
    cPaisRec: r.pais,
    iTiContRec: contribuyente ? r.tipoContribuyente : null,
    dRucRec: contribuyente ? r.ruc : null,
    // En el JSON funcional el DV viaja como número.
    dDVRec: contribuyente ? Number(r.dv) : null,
    iTipIDRec: contribuyente || sinDocumento ? null : r.tipoDocumentoIdentidad,
    dDTipIDRec: contribuyente || sinDocumento ? null : r.tipoDocumentoIdentidad !== null && r.tipoDocumentoIdentidad in DESCRIPCION_TIPO_DOCUMENTO ? DESCRIPCION_TIPO_DOCUMENTO[r.tipoDocumentoIdentidad] : nulo(r.descripcionTipoDocumento),
    dNumIDRec: contribuyente || sinDocumento ? null : nulo(r.numeroDocumento),
    dNomRec: r.razonSocial,
    dNomFanRec: nulo(r.nombreFantasia),
    // dDirRec, dNumCasRec (numérico, el de la ficha: sin fallback a 0) y, si corresponde, solo los códigos cDepRec/cDisRec/cCiuRec.
    ...domicilioFiscalJSON(r),
    dTelRec: nulo(r.telefono),
    dCelRec: nulo(r.celular),
    dEmailRec: nulo(r.email),
    dEmailAdic: nulo(r.emailCopia),
    dEmailAdmin: nulo(r.emailFacturacion),
    // D217 es opcional y mide 3-15: un código interno fuera de ese rango no se envía (no se acorta ni se inventa otro).
    dCodCliente: r.codigo.length >= CODIGO_CLIENTE.min && r.codigo.length <= CODIGO_CLIENTE.max ? r.codigo : null,
    iCondOpe: e.condicion,
    ...condicionPago(e),
    FormaPago: e.pagos.map((p) => formaPagoJSON(p, e.moneda, e.cambio)),
    Detalles: detalles,
    Subtotales: [
      {
        dSubExe: num(sub.dSubExe), dSubExo: num(sub.dSubExo), dSub5: num(sub.dSub5), dSub10: num(sub.dSub10), dTotOpe: num(sub.dTotOpe),
        dTotDesc: num(sub.dTotDesc), dTotDescGlotem: num(sub.dTotDescGlotem), dTotAntItem: 0, dTotAnt: 0, dPorcDescTotal: num(descuentos.porcGlobal), dDescTotal: num(sub.dDescTotal), dAnticipo: 0, dRedon: 0,
        dTotGralOpe: num(sub.dTotGralOpe), dIVA5: num(sub.dIVA5), dIVA10: num(sub.dIVA10), dLiqTotIVA5: num(sub.dIVA5), dLiqTotIVA10: num(sub.dIVA10), dTotIVA: num(sub.dTotIVA),
        dBaseGrav5: num(sub.dBaseGrav5), dBaseGrav10: num(sub.dBaseGrav10), dTBasGraIVA: num(sub.dTBasGraIVA), dTotalGs: e.moneda === "PYG" ? num(sub.dTotalGs) : numeroF023(totalEnGuaranies0(e, sub.dTotGralOpe)),
      },
    ],
  };
}

/** Total general de la operación (F014) o null si alguna línea no es calculable. */
export function totalFactura(lineas: LineaFE[], descuentoGlobal?: DescuentoEntrada | null): Dec | null {
  const errores: string[] = [];
  const { items } = prepararLineas(lineas, errores);

  if (errores.length > 0 || items.length !== lineas.length || items.length === 0) return null;

  const { res, sub } = calcularFE(items, descuentoGlobal);

  return res.errores.length > 0 ? null : sub.dTotGralOpe;
}

/** Resumen numérico para la pantalla (mismo motor que el payload): evita que el navegador calcule distinto del servidor. */
export function resumenCalculo(lineas: LineaFE[], descuentoGlobal?: DescuentoEntrada | null) {
  const errores: string[] = [];
  const { items } = prepararLineas(lineas, errores);
  const { res, calculados, sub: s } = calcularFE(items, descuentoGlobal);

  return {
    completo: items.length === lineas.length && res.errores.length === 0,
    /** E03: errores de los descuentos (para mostrarlos junto al campo) y su detalle por ítem. */
    erroresDescuento: res.errores,
    descuentos: {
      hay: res.hay,
      porcGlobal: textoDec(res.porcGlobal),
      items: res.porItem.map((d, k) => ({ unitario: textoDec(d.descItem), porcentaje: textoDec(d.porcItem), global: textoDec(d.descGlobal), total: textoDec(calculados[k].resultado.totBruto - calculados[k].resultado.totOperacion) })),
      totalItems: textoDec(s.dTotDesc), totalGeneral: textoDec(s.dTotDescGlotem), total: textoDec(s.dDescTotal),
    },
    items: calculados.map((c) => numeroDec(c.resultado.totOperacion)),
    exento: numeroDec(s.dSubExe), exonerado: numeroDec(s.dSubExo), gravado5: numeroDec(s.dSub5), gravado10: numeroDec(s.dSub10),
    iva5: numeroDec(s.dIVA5), iva10: numeroDec(s.dIVA10), totalIva: numeroDec(s.dTotIVA), total: numeroDec(s.dTotGralOpe),
    // Solo PRESENTACIÓN (PRO-128, UX-30): los mismos importes como texto Decimal exacto, para mostrar sin pasar por Number. Los campos numéricos de arriba y el cálculo no cambian.
    texto: {
      items: calculados.map((c) => textoDec(c.resultado.totOperacion)),
      exento: textoDec(s.dSubExe), exonerado: textoDec(s.dSubExo), gravado5: textoDec(s.dSub5), gravado10: textoDec(s.dSub10),
      iva5: textoDec(s.dIVA5), iva10: textoDec(s.dIVA10), totalIva: textoDec(s.dTotIVA), total: textoDec(s.dTotGralOpe),
    },
  };
}
