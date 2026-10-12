import { B, S, calcularItem, calcularSubtotales, numeroDec, parseDec, type AfectacionIva, type Dec, type TasaIva } from "@/lib/facturacion/calculo";

/**
 * Validación fiscal y construcción del payload de Factura Electrónica (iTiDE = 1) a partir de datos YA resueltos por el servidor desde los
 * cadastros (cliente, productos, precios). Puro y sin red. Los nombres de campo son los del JSON FE conocido del gateway (ver especificación
 * REQUISITOS-FACTURACION-ELECTRONICA, §4) y los del MT v150.
 *
 * NO se incluyen aquí: cdc, dEst, dPunExp, dNumDoc, dSerieNum y dFeEmiDE (los completa la función SQL fe_documento_crear_fe al reservar el número
 * y fijar la fecha), ni datos del emisor/timbrado (los resuelve el gateway). Alcance F-02: guaraníes, condición contado, sin descuentos, anticipos,
 * exportación, contratación pública ni crédito.
 */

export const TIPOS_TRANSACCION = { 1: "Venta de mercadería", 2: "Prestación de servicios", 3: "Mixto (mercadería y servicios)" } as const;
export const INDICADORES_PRESENCIA = { 1: "Operación presencial", 2: "Operación electrónica", 3: "Operación telemarketing", 4: "Venta a domicilio", 5: "Operación bancaria", 6: "Operación cíclica" } as const;
/** E606 (MT v150): en la primera emisión de prueba SOLO se habilita Efectivo (decisión del responsable); otras formas exigen validar sus condicionales fiscales. */
export const FORMAS_PAGO = { 1: "Efectivo" } as const;

/** NT 024: sin nombre (Innominado) no se admite con total general ≥ Gs. 7.000.000 (D208c). */
export const LIMITE_INNOMINADO = B(7000000) * S;
export const MAX_LINEAS = 999; // gCamItem 1-999
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
};

export type EntradaFE = {
  moneda: string;
  tipoTransaccion: number;
  presencia: number;
  condicion: number; // 1 contado
  pagos: Array<{ tipo: number; monto: string }>;
  infoAdicional: string;
  receptor: ReceptorFE;
  lineas: LineaFE[];
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
    if (cantidad === null || cantidad <= B(0)) errores.push(`Ítem ${n}: la cantidad debe ser mayor que cero, con hasta 4 decimales.`);
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

/** Errores de validación fiscal de la entrada (lista vacía = emitible). Mensajes en español para la pantalla y la API. */
export function validarEntradaFE(e: EntradaFE): string[] {
  const errores: string[] = [];

  if (e.moneda !== "PYG") errores.push("En esta etapa solo se emiten facturas en guaraníes (PYG).");
  if (!(e.tipoTransaccion in TIPOS_TRANSACCION)) errores.push("Seleccione un tipo de transacción válido.");
  if (!(e.presencia in INDICADORES_PRESENCIA)) errores.push("Seleccione un indicador de presencia válido.");
  if (e.condicion !== 1) errores.push("En esta etapa solo se emiten facturas al contado.");
  if (e.infoAdicional.length > 5000) errores.push("La información adicional supera 5000 caracteres.");
  if (e.lineas.length === 0) errores.push("Agregue al menos un ítem.");
  if (e.lineas.length > MAX_LINEAS) errores.push(`Una factura admite hasta ${MAX_LINEAS} ítems.`);

  const { items } = prepararLineas(e.lineas.slice(0, MAX_LINEAS), errores);

  if (errores.length > 0 || items.length !== e.lineas.length) return errores;

  const calculados = items.map((i) => ({ entrada: { cantidad: i.cantidad, precioUnitario: i.precio, afectacion: i.afectacion, tasa: i.tasa, proporcion: i.proporcion }, resultado: calcularItem({ cantidad: i.cantidad, precioUnitario: i.precio, afectacion: i.afectacion, tasa: i.tasa, proporcion: i.proporcion }) }));
  const sub = calcularSubtotales(calculados);

  if (sub.dTotGralOpe <= B(0)) errores.push("El total de la factura debe ser mayor que cero.");
  if (sub.dTotGralOpe >= TOTAL_MAXIMO) errores.push("El total de la factura supera el máximo admitido.");

  // Pagos al contado: al menos uno, formas habilitadas y suma EXACTA igual al total.
  if (e.pagos.length === 0 || e.pagos.length > 999) errores.push("Indique la forma de pago.");

  let sumaPagos = B(0);

  for (const p of e.pagos) {
    const m = parseDec(p.monto, 8);

    if (!(p.tipo in FORMAS_PAGO)) errores.push("Una forma de pago no es válida.");
    if (m === null || m <= B(0)) errores.push("Cada pago debe tener un monto mayor que cero.");
    else sumaPagos += m;
  }
  if (errores.length === 0 && sumaPagos !== sub.dTotGralOpe) errores.push("La suma de los pagos debe ser igual al total de la factura.");

  // Receptor (reglas del MT v150 y NT 010/023/024; la coherencia de la ficha la valida aparte la aptitud SIFEN del cliente).
  const r = e.receptor;

  if (r.tipoDocumentoIdentidad === 5 && r.tipoOperacion !== 2) errores.push("El cliente Innominado solo puede usarse en operaciones B2C.");
  if (r.tipoDocumentoIdentidad === 5 && sub.dTotGralOpe >= LIMITE_INNOMINADO) errores.push("No se puede facturar a un cliente Innominado con un total igual o superior a Gs. 7.000.000 (NT 024).");
  if (r.naturaleza === 1 && (!/^\d{3,8}$/.test(r.ruc) || r.dv === "")) errores.push("El cliente contribuyente requiere RUC y dígito verificador.");
  if (r.naturaleza === 2 && r.tipoOperacion !== 4 && (r.tipoDocumentoIdentidad === null || r.numeroDocumento === "")) errores.push("El cliente no contribuyente requiere tipo y número de documento.");
  if (r.pais === "PRY" && r.direccion !== "" && (r.departamento === "" || r.ciudad === "") && r.tipoOperacion !== 4) errores.push("La dirección fiscal del cliente en Paraguay requiere departamento y ciudad (NT 003).");

  return errores;
}

const nulo = (v: string) => (v.trim() === "" ? null : v.trim());

/** Construye el payload FE (sin cdc ni numeración). Llamar solo con una entrada que pasó `validarEntradaFE`. */
export function construirPayloadFE(e: EntradaFE): Record<string, unknown> {
  const errores: string[] = [];
  const { items } = prepararLineas(e.lineas, errores);

  if (errores.length > 0 || items.length !== e.lineas.length) throw new Error("La entrada no es válida para construir el payload FE.");

  const calculados = items.map((i) => {
    const entrada = { cantidad: i.cantidad, precioUnitario: i.precio, afectacion: i.afectacion, tasa: i.tasa, proporcion: i.proporcion };

    return { i, entrada, resultado: calcularItem(entrada) };
  });
  const sub = calcularSubtotales(calculados);
  const r = e.receptor;
  const contribuyente = r.naturaleza === 1;
  const sinDocumento = !contribuyente && r.tipoOperacion === 4;
  const detalles = calculados.map(({ i, resultado: x }) => ({
    dCodInt: i.linea.codigoInterno,
    dGtin: i.linea.gtin,
    dDesProSer: i.linea.descripcion.trim(),
    cUniMed: i.linea.unidadSifen,
    dCantProSer: numeroDec(i.cantidad),
    dPUniProSer: numeroDec(i.precio),
    dTotBruOpeItem: numeroDec(x.totBruto),
    dTotOpeItem: numeroDec(x.totOperacion),
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
    cMoneOpe: "PYG",
    dCondTiCam: null,
    dTiCam: null,
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
    dDTipIDRec: contribuyente || sinDocumento ? null : nulo(r.descripcionTipoDocumento),
    dNumIDRec: contribuyente || sinDocumento ? null : nulo(r.numeroDocumento),
    dNomRec: r.razonSocial,
    dNomFanRec: nulo(r.nombreFantasia),
    dDirRec: nulo(r.direccion),
    // Numérico como en el JSON funcional. 0 solo si el cadastro no trae un número utilizable (parámetro de la primera prueba; no sobrescribe la ficha).
    dNumCasRec: nulo(r.direccion) === null ? null : /^\d{1,6}$/.test(r.numeroCasa.trim()) ? Number(r.numeroCasa.trim()) : 0,
    dTelRec: nulo(r.telefono),
    dCelRec: nulo(r.celular),
    dEmailRec: nulo(r.email),
    dEmailAdic: nulo(r.emailCopia),
    dEmailAdmin: nulo(r.emailFacturacion),
    dCodCliente: r.codigo,
    iCondOpe: 1,
    iCondCred: null,
    dPlazoCre: null,
    dCuotas: null,
    Cuotas: [],
    FormaPago: e.pagos.map((p) => ({ iTiPago: p.tipo, dMonTiPag: Number(p.monto), cMoneTiPag: "PYG", dTiCamTiPag: null })),
    Detalles: detalles,
    Subtotales: [
      {
        dSubExe: num(sub.dSubExe), dSubExo: num(sub.dSubExo), dSub5: num(sub.dSub5), dSub10: num(sub.dSub10), dTotOpe: num(sub.dTotOpe),
        dTotDesc: 0, dTotDescGlotem: 0, dTotAntItem: 0, dTotAnt: 0, dPorcDescTotal: 0, dDescTotal: 0, dAnticipo: 0, dRedon: 0,
        dTotGralOpe: num(sub.dTotGralOpe), dIVA5: num(sub.dIVA5), dIVA10: num(sub.dIVA10), dLiqTotIVA5: num(sub.dIVA5), dLiqTotIVA10: num(sub.dIVA10), dTotIVA: num(sub.dTotIVA),
        dBaseGrav5: num(sub.dBaseGrav5), dBaseGrav10: num(sub.dBaseGrav10), dTBasGraIVA: num(sub.dTBasGraIVA), dTotalGs: num(sub.dTotalGs),
      },
    ],
  };
}

/** Total general de la operación (F014) o null si alguna línea no es calculable. */
export function totalFactura(lineas: LineaFE[]): Dec | null {
  const errores: string[] = [];
  const { items } = prepararLineas(lineas, errores);

  if (errores.length > 0 || items.length !== lineas.length || items.length === 0) return null;

  const entradas = items.map((i) => {
    const entrada = { cantidad: i.cantidad, precioUnitario: i.precio, afectacion: i.afectacion, tasa: i.tasa, proporcion: i.proporcion };

    return { entrada, resultado: calcularItem(entrada) };
  });

  return calcularSubtotales(entradas).dTotGralOpe;
}

/** Resumen numérico para la pantalla (mismo motor que el payload): evita que el navegador calcule distinto del servidor. */
export function resumenCalculo(lineas: LineaFE[]) {
  const errores: string[] = [];
  const { items } = prepararLineas(lineas, errores);
  const calculados = items.map((i) => {
    const entrada = { cantidad: i.cantidad, precioUnitario: i.precio, afectacion: i.afectacion, tasa: i.tasa, proporcion: i.proporcion };

    return { entrada, resultado: calcularItem(entrada) };
  });
  const s = calcularSubtotales(calculados);

  return {
    completo: items.length === lineas.length,
    items: calculados.map((c) => numeroDec(c.resultado.totOperacion)),
    exento: numeroDec(s.dSubExe), exonerado: numeroDec(s.dSubExo), gravado5: numeroDec(s.dSub5), gravado10: numeroDec(s.dSub10),
    iva5: numeroDec(s.dIVA5), iva10: numeroDec(s.dIVA10), totalIva: numeroDec(s.dTotIVA), total: numeroDec(s.dTotGralOpe),
  };
}
