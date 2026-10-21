/**
 * MFE-03 P2 — Monedas y tipo de cambio (PYG, USD, BRL; MT v150 D015–D018, E609–E611, F023). Sin red y sin PostgreSQL: base simulada que responde por el texto de cada consulta. Se
 * prueba la lógica del servidor (validación, cálculo Decimal exacto, qué llega al payload inmutable, que un error no reserve número, que no se conviertan precios de lista) y la
 * estructura de la pantalla. Nada se ejecutó en PostgreSQL ni en el gateway: P-02 (PYG) y P-12 siguen abiertos y NO se tocaron.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { B, parseDec, S, textoDec } from "@/lib/facturacion/calculo";
import { cotizacionVigente, crearFacturaElectronica, leerCuerpoFactura, prepararFactura } from "@/lib/facturacion/emision";
import { decidirProducto } from "@/lib/facturacion/ajuste-item";
import { cabeEnF023, esMonedaFE, leerCambio, leerMonedaYCambio, mismoPrecio, precioEnMoneda, precioSerializable, simboloMoneda, totalEnGuaranies } from "@/lib/facturacion/monedas";
import { construirPayloadFE, validarEntradaFE, type EntradaFE, type ReceptorFE } from "@/lib/facturacion/payload-fe";
import { ErrorFacturacion, ErrorValidacionFiscal } from "@/lib/facturacion/shared";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const USUARIO = "99999999-9999-4999-8999-999999999999";
const SUC = "55555555-5555-4555-8555-555555555555";
const PRODUCTO = "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1";
const CLIENTE = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";
const PUNTO = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1";
const DOC = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const HOY = "2026-10-15";
const filaCliente = { codigo: "CLI-000001", naturaleza_receptor: 1, tipo_operacion: 1, tipo_contribuyente_sifen: 2, pais_codigo: "PRY", tipo_documento_identidad_sifen: null, descripcion_documento_identidad: null, numero_documento: "80000005", dv: "6", razon_social: "EMPRESA SINTETICA SA", nombre_fantasia: null, email: "a@b.com", email_copia: null, email_facturacion: null, telefono: null, celular: null, activo: true, bloqueado_ventas: false, direccion: "Calle 1", numero_casa: "123", departamento_codigo: "1", distrito_codigo: "1", ciudad_codigo: "1" };
const productoPyg = { id: PRODUCTO, codigo: "P-1", descripcion: "Producto de prueba", unidadSifen: 77, unidadSimbolo: "UNI", unidadVigente: true, afectacion: 1, proporcion: null, tasa: 10, precio: "11000", monedaPrecio: "PYG", gtin: null };
const productoUsd = { ...productoPyg, precio: "10.5", monedaPrecio: "USD" };
const receptor: ReceptorFE = { codigo: "CLI-000001", naturaleza: 1, tipoOperacion: 1, tipoContribuyente: 2, pais: "PRY", ruc: "80000005", dv: "6", tipoDocumentoIdentidad: null, descripcionTipoDocumento: "", numeroDocumento: "", razonSocial: "EMPRESA SINTETICA SA", nombreFantasia: "", direccion: "Calle 1", numeroCasa: "123", departamento: "1", distrito: "1", ciudad: "1", telefono: "", celular: "", email: "a@b.com", emailCopia: "", emailFacturacion: "" };

type Llamada = { sql: string; parametros: unknown[] };
type Entorno = { producto?: Record<string, unknown>; permisos?: string[]; cotizacion?: { cambio: string; fecha: string } | null; cliente?: Record<string, unknown> };

function baseSimulada(o: Entorno = {}) {
  const llamadas: Llamada[] = [];
  const db = {
    async query(sql: string, parametros: unknown[] = []) {
      llamadas.push({ sql, parametros });
      if (/usuario_tiene_permiso/.test(sql)) {
        const lit = /'([A-Z_]+)',\s*'([A-Z_]+)'\)/.exec(sql);
        const codigo = parametros.length >= 4 ? `${String(parametros[2])}.${String(parametros[3])}` : lit ? `${lit[1]}.${lit[2]}` : "";

        return { rows: [{ ok: (o.permisos ?? []).includes(codigo) }], rowCount: 1 };
      }
      if (/FROM tipos_cambio/.test(sql)) return { rows: o.cotizacion === null || o.cotizacion === undefined ? [] : [o.cotizacion], rowCount: 1 };
      if (/FROM clientes c\s+LEFT JOIN LATERAL/.test(sql)) return { rows: [{ ...filaCliente, ...(o.cliente ?? {}) }], rowCount: 1 };
      if (/SELECT c\.id, c\.naturaleza_receptor/.test(sql)) return { rows: [{ ...filaCliente, id: CLIENTE, tipo_persona: "JURIDICA", tipo_documento: "RUC", pais_codigo: "PRY" }], rowCount: 1 };
      if (/FROM direcciones_cliente/.test(sql)) return { rows: [{ cliente_id: CLIENTE, direccion: "Calle 1", numero_casa: "123", departamento_codigo: "1", distrito_codigo: "1", ciudad_codigo: "1", pais_codigo: "PRY" }], rowCount: 1 };
      if (/FROM referencia_geografica_paises/.test(sql)) return { rows: [{ codigo: "PRY" }], rowCount: 1 };
      if (/FROM sucursales sc JOIN empresas e/.test(sql)) return { rows: [{ empresa: "EMPRESA SINTETICA", sucursal: "Casa Central", establecimiento: "001", punto: "002", puntoNombre: "Punto 002" }], rowCount: 1 };
      if (/FROM productos p/.test(sql)) return { rows: [o.producto ?? productoPyg], rowCount: 1 };
      if (/fe_documento_crear_fe/.test(sql)) return { rows: [{ documentoId: DOC, numero: "0050000", reutilizado: false }], rowCount: 1 };

      return { rows: [], rowCount: 0 };
    },
  };

  return { db: db as never, llamadas, creaciones: () => llamadas.filter((l) => /fe_documento_crear_fe/.test(l.sql)), escrituras: () => llamadas.filter((l) => /INSERT INTO|UPDATE |DELETE FROM|fe_documento_crear_fe/.test(l.sql)) };
}

const cuerpo = (extra: Record<string, unknown> = {}, cantidad = "3") => ({ claveIdempotencia: "clave-de-prueba-0001", sucursalId: SUC, puntoId: PUNTO, clienteId: CLIENTE, tipoTransaccion: 1, presencia: 1, pagos: [{ tipo: 1 }], infoAdicional: "", lineas: [{ productoId: PRODUCTO, cantidad }], ...extra });

export async function verificarCasosMonedas(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const resultado = async (p: Promise<unknown>) => {
    try { await p; return "OK"; } catch (e) { return e instanceof ErrorValidacionFiscal ? `${e.estado}:${e.detalles.join("|")}` : e instanceof ErrorFacturacion ? `${e.estado}:${e.message}` : `ERR:${String(e)}`; }
  };
  const dec = (t: string) => parseDec(t, 8)!;
  const linea = (precio: string, cantidad = "3") => [{ codigoInterno: "P-1", gtin: null, descripcion: "Producto", unidadSifen: 77, cantidad, precio, afectacion: 1 as const, tasa: 10 as const, proporcion: null }];
  // 3 × 10,5 = 31,5 USD (IVA 10 % incluido)
  const entrada = (extra: Partial<EntradaFE> = {}): EntradaFE => ({ moneda: "USD", cambio: "7500", tipoTransaccion: 1, presencia: 1, condicion: 1, pagos: [{ tipo: 1, monto: "31.5" }], infoAdicional: "", receptor, lineas: linea("10.5"), ...extra });
  const pyg = (extra: Partial<EntradaFE> = {}): EntradaFE => ({ moneda: "PYG", tipoTransaccion: 1, presencia: 1, condicion: 1, pagos: [{ tipo: 1, monto: "33000" }], infoAdicional: "", receptor, lineas: linea("11000"), ...extra });
  const errores = (e: EntradaFE) => validarEntradaFE(e, HOY);
  const tiene = (e: EntradaFE, re: RegExp) => errores(e).some((m) => re.test(m));
  type P = Record<string, unknown> & { FormaPago: Array<Record<string, unknown>>; Subtotales: Array<Record<string, number>>; Detalles: Array<Record<string, unknown>> };
  const payload = (e: EntradaFE) => construirPayloadFE(e, HOY) as P;

  // ── 1. Cambio manual y moneda (módulo puro) ───────────────────────────────────────────────────────────────────────────────────────────────────
  igual("cambio válido: hasta 5 enteros y 4 decimales, normalizado, con coma o punto", ["7500", "7500.5000", "7500,25", "0.0001", "99999.9999"].map((x) => leerCambio(x)), ["7500", "7500.5", "7500.25", "0.0001", "99999.9999"]);
  igual("MON-01 cambio inválido: cero, negativo, 6 enteros, 5 decimales, letras, vacío, no texto", ["0", "0.0000", "-1", "100000", "7500.12345", "abc", "", " "].map((x) => leerCambio(x)).concat([leerCambio(7500), leerCambio(null)]), [null, null, null, null, null, null, null, null, null, null]);
  igual("monedas admitidas: PYG, USD y BRL; otra (EUR, minúscula) no", [esMonedaFE("PYG"), esMonedaFE("USD"), esMonedaFE("BRL"), esMonedaFE("EUR"), esMonedaFE("usd")], [true, true, true, false, false]);
  igual("leerMonedaYCambio: sin moneda = PYG; PYG con cambio → error; USD sin cambio → error; EUR → error; USD válido", [leerMonedaYCambio(undefined, undefined), typeof leerMonedaYCambio("PYG", "1"), typeof leerMonedaYCambio("USD", undefined), typeof leerMonedaYCambio("EUR", "1"), leerMonedaYCambio("USD", "7500.50")], [{ moneda: "PYG", cambio: null }, "string", "string", "string", { moneda: "USD", cambio: "7500.5" }]);
  igual("F023 = F014 × D018, exacto y sin redondeo (hasta 8 decimales)", [textoDec(totalEnGuaranies(dec("31.5"), "7500")!), textoDec(totalEnGuaranies(dec("100.5"), "7500.1234")!), textoDec(totalEnGuaranies(dec("0.0001"), "0.0001")!)], ["236250", "753762.40170000".replace(/0+$/, ""), "0.00000001"]);
  igual("F023: si el producto necesitara más de 8 decimales no se calcula (sería un redondeo)", totalEnGuaranies(dec("0.00001"), "0.0001"), null);
  igual("sin conversión de listas: el precio de lista solo vale en su moneda", [precioEnMoneda("USD", "USD"), precioEnMoneda("PYG", "USD"), precioEnMoneda(null, "USD"), precioEnMoneda("PYG", "PYG")], [true, false, false, true]);
  igual("símbolos de moneda", ["PYG", "USD", "BRL"].map(simboloMoneda), ["Gs.", "US$", "R$"]);

  // ── 2. Payload: PYG intacto; USD y BRL con los campos SIFEN ────────────────────────────────────────────────────────────────────────────────────
  const pp = payload(pyg());
  igual("CA-13 PYG/Contado/Efectivo: cMoneOpe PYG, SIN dCondTiCam ni dTiCam (nulos), dTotalGs = total (P-02 intacto) y FormaPago de cuatro claves", [pp.cMoneOpe, pp.dCondTiCam, pp.dTiCam, pp.Subtotales[0].dTotalGs, "dDesMoneOpe" in pp, Object.keys(pp.FormaPago[0]).join(",")], ["PYG", null, null, 33000, false, "iTiPago,dMonTiPag,cMoneTiPag,dTiCamTiPag"]);
  const pu = payload(entrada());
  igual("CA-12 USD con cambio global: D015 USD, D017 = 1, D018 = 7500; totales en USD; F023 = F014 × D018", [pu.cMoneOpe, pu.dCondTiCam, pu.dTiCam, pu.Subtotales[0].dTotGralOpe, pu.Subtotales[0].dTotalGs, pu.Subtotales[0].dTotOpe], ["USD", 1, 7500, 31.5, 236250, 31.5]);
  igual("USD: detalle con precio, bruto y total en USD; IVA y bases calculados por el mismo motor (10 %: base 28,63636364, IVA 2,86363636)", [pu.Detalles[0].dPUniProSer, pu.Detalles[0].dTotBruOpeItem, pu.Detalles[0].dTotOpeItem, pu.Detalles[0].dBasGravIVA, pu.Detalles[0].dLiqIVAItem, pu.Subtotales[0].dIVA10, pu.Subtotales[0].dTotIVA, pu.Subtotales[0].dBaseGrav10], [10.5, 31.5, 31.5, 28.63636364, 2.86363636, 2.86363636, 2.86363636, 28.63636364]);
  igual("P-12 intacto en moneda extranjera: dLiqTotIVA10 sigue siendo el IVA del tramo (misma política que PYG), dRedon 0", [pu.Subtotales[0].dLiqTotIVA10, pu.Subtotales[0].dRedon], [pu.Subtotales[0].dIVA10, 0]);
  igual("USD: el pago va en USD con E611 dTiCamTiPag = el mismo cambio (obligatorio si E609 ≠ PYG) y E607; la descripción de la moneda la deriva el gateway", pu.FormaPago, [{ iTiPago: 1, dDesTiPag: "Efectivo", dMonTiPag: 31.5, cMoneTiPag: "USD", dTiCamTiPag: 7500 }]);
  const pb = payload(entrada({ moneda: "BRL", cambio: "1425.5" }));
  igual("BRL con cambio 1425,5: D015 BRL, D018 1425,5, F023 = 31,5 × 1425,5 = 44903,25", [pb.cMoneOpe, pb.dTiCam, pb.Subtotales[0].dTotalGs, pb.FormaPago[0].cMoneTiPag, pb.FormaPago[0].dTiCamTiPag], ["BRL", 1425.5, 44903.25, "BRL", 1425.5]);
  igual("D018 nunca se redondea: cambio con 4 decimales viaja exacto", [payload(entrada({ cambio: "7421.1234" })).dTiCam, payload(entrada({ cambio: "7421.1234" })).Subtotales[0].dTotalGs], [7421.1234, 233765.3871]);
  igual("USD con tarjeta: gPagTarCD, E607 y E611 con el cambio", payload(entrada({ pagos: [{ tipo: 3, monto: "31.5", tarjeta: { denominacion: 1, formaProcesamiento: 1 } }] })).FormaPago[0], { iTiPago: 3, dDesTiPag: "Tarjeta de crédito", dMonTiPag: 31.5, cMoneTiPag: "USD", dTiCamTiPag: 7500, gPagTarCD: { iDenTarj: 1, dDesDenTarj: "Visa", iForProPa: 1 } });
  igual("USD con pagos combinados Efectivo + Transferencia: dos medios en USD, suma exacta; 1 centavo de diferencia se rechaza", [errores(entrada({ pagos: [{ tipo: 1, monto: "20" }, { tipo: 5, monto: "11.5" }] })), payload(entrada({ pagos: [{ tipo: 1, monto: "20" }, { tipo: 5, monto: "11.5" }] })).FormaPago.map((p) => [p.cMoneTiPag, p.dMonTiPag, p.dTiCamTiPag]), tiene(entrada({ pagos: [{ tipo: 1, monto: "20" }, { tipo: 5, monto: "11.49" }] }), /suma de los pagos/)], [[], [["USD", 20, 7500], ["USD", 11.5, 7500]], true]);
  const credUsd = payload(entrada({ condicion: 2, pagos: [{ tipo: 1, monto: "10" }], credito: { tipo: 1, plazoDias: 60, cuotas: [], entrega: "10" } }));
  igual("Crédito a Plazo en USD con entrega: dMonEnt 10 USD, un pago de 10 USD (con E611), «60 días»; el saldo (21,5) no se paga", [credUsd.dMonEnt, credUsd.FormaPago.map((p) => [p.dMonTiPag, p.cMoneTiPag, p.dTiCamTiPag]), credUsd.dPlazoCre, credUsd.iCondCred], [10, [[10, "USD", 7500]], "60 días", 1]);
  igual("Crédito a Plazo en USD sin entrega: sin pagos, dMonEnt nulo", [payload(entrada({ condicion: 2, pagos: [], credito: { tipo: 1, plazoDias: 30, cuotas: [], entrega: null } })).FormaPago, payload(entrada({ condicion: 2, pagos: [], credito: { tipo: 1, plazoDias: 30, cuotas: [], entrega: null } })).dMonEnt], [[], null]);
  igual("las cuotas (suspendidas) llevarían la moneda del documento si se reactivan", /cMoneCuo: e\.moneda/.test(leer("lib/facturacion/payload-fe.ts")), true);

  // ── 3. Validación fiscal de moneda y cambio ───────────────────────────────────────────────────────────────────────────────────────────────────
  igual("USD sin cambio, con cambio 0 o con cambio inválido → error; EUR → error; PYG con cambio → error", [tiene(entrada({ cambio: undefined }), /tipo de cambio manual/), tiene(entrada({ cambio: "0" }), /tipo de cambio manual/), tiene(entrada({ cambio: "7500.12345" }), /tipo de cambio manual/), tiene(entrada({ moneda: "EUR" }), /moneda de la factura no es válida/), tiene(pyg({ cambio: "1" }), /guaraníes no lleva tipo de cambio/)], [true, true, true, true, true]);
  igual("CA-14 BRL sin cotización o con tasa 0 → bloqueo (ni payload ni número)", [tiene(entrada({ moneda: "BRL", cambio: undefined }), /tipo de cambio/), (() => { try { construirPayloadFE(entrada({ moneda: "BRL", cambio: "0" }), HOY); return "OK"; } catch { return "bloqueado"; } })()], [true, "bloqueado"]);
  igual("el equivalente en guaraníes que no cabe como número exacto del JSON bloquea SOLO esa modalidad (sin redondeo)", [tiene(entrada({ lineas: linea("999999999.9999", "1"), cambio: "99999.9999", pagos: [{ tipo: 1, monto: "999999999.9999" }] }), /equivalente en guaraníes/), errores(pyg()).length], [true, 0]);
  const innominado = { ...receptor, tipoOperacion: 2 as const, naturaleza: 2 as const, tipoDocumentoIdentidad: 5, numeroDocumento: "0", razonSocial: "Sin Nombre", ruc: "", dv: "", tipoContribuyente: null };
  igual("NT 024 con moneda extranjera: el límite de 7.000.000 Gs. se compara con el equivalente (1000 USD × 7500 = 7.500.000 → error; 900 × 7500 = 6.750.000 → válido)", [tiene(entrada({ receptor: innominado, lineas: linea("1000", "1"), pagos: [{ tipo: 1, monto: "1000" }] }), /Innominado.*7\.000\.000/), tiene(entrada({ receptor: innominado, lineas: linea("900", "1"), pagos: [{ tipo: 1, monto: "900" }] }), /Innominado.*7\.000\.000/)], [true, false]);
  igual("P-11 sigue bloqueando el residuo del gravado parcial también en USD (11.000 USD al 50 % no concilia con ítems y pago exactos; la política no depende de la moneda)", tiene(entrada({ lineas: [{ ...linea("11000", "1")[0], afectacion: 4 as const, tasa: 10 as const, proporcion: "50" }], pagos: [{ tipo: 1, monto: "11000" }] }), /difiere de la suma de los ítems|más de 4 decimales/), true);
  igual("total con más de 4 decimales sigue bloqueado (sin redondeo) en cualquier moneda", tiene(entrada({ lineas: linea("0.00001", "1"), pagos: [{ tipo: 1, monto: "0.0001" }] }), /más de 4 decimales|perder precisión|suma de los pagos/), true);

  // ── 4. Servidor: lectura del cuerpo, precios, snapshot, errores antes de reservar número ──────────────────────────────────────────────────────
  igual("leerCuerpoFactura: sin moneda = PYG; USD sin cambio → error; PYG con cambio → error; EUR → error; USD válido conserva moneda y cambio normalizado", [
    (leerCuerpoFactura(cuerpo()) as { moneda?: string }).moneda, typeof leerCuerpoFactura(cuerpo({ moneda: "USD" })), typeof leerCuerpoFactura(cuerpo({ moneda: "PYG", cambio: "7500" })), typeof leerCuerpoFactura(cuerpo({ moneda: "EUR", cambio: "1" })),
    (() => { const c = leerCuerpoFactura(cuerpo({ moneda: "USD", cambio: "7500,50" })) as { moneda: string; cambio: string }; return [c.moneda, c.cambio]; })(),
  ], [undefined, "string", "string", "string", ["USD", "7500.5"]]);

  const emitir = async (extra: Record<string, unknown>, entorno: Entorno = {}, cantidad = "3") => { const b = baseSimulada(entorno); const c = leerCuerpoFactura(cuerpo(extra, cantidad)); return { b, e: typeof c === "string" ? `400:${c}` : await resultado(crearFacturaElectronica(b.db, EMPRESA, USUARIO, c)) }; };
  const json = (x: { b: ReturnType<typeof baseSimulada> }) => JSON.parse(String(x.b.creaciones()[0]?.parametros[9] ?? "{}")) as Record<string, unknown> & P;
  const par = (x: { b: ReturnType<typeof baseSimulada> }) => x.b.creaciones()[0]?.parametros ?? [];

  const base = await emitir({});
  igual("CA-01 baseline PYG: moneda 'PYG', total 33000, sin consulta de tipos de cambio y mismo payload de siempre", [base.e, par(base)[10], par(base)[8], base.b.llamadas.some((l) => /tipos_cambio/.test(l.sql)), json(base).cMoneOpe, json(base).dCondTiCam], ["OK", "PYG", "33000", false, "PYG", null]);
  const usd = await emitir({ moneda: "USD", cambio: "7500" }, { producto: productoUsd, cotizacion: { cambio: "7500.000000", fecha: "2026-10-14" } });
  igual("USD con producto de lista en USD: documento con moneda 'USD' y total 31.5 (no 31500), precio de lista sin permiso de precio, payload con cambio y F023", [usd.e, par(usd)[10], par(usd)[8], json(usd).Detalles[0].dPUniProSer, json(usd).dTiCam, json(usd).Subtotales[0].dTotalGs, json(usd).FormaPago[0].dMonTiPag], ["OK", "USD", "31.5", 10.5, 7500, 236250, 31.5]);
  const x74 = await emitir({ moneda: "USD", cambio: "7500" }, { producto: productoUsd, cotizacion: { cambio: "7400.000000", fecha: "2026-10-15" } });
  const x75 = await emitir({ moneda: "USD", cambio: "7500" }, { producto: productoUsd, cotizacion: { cambio: "7650.000000", fecha: "2026-10-16" } });
  igual("MON-02: con la cotización del catálogo cambiada a 7400 o a 7650, el payload del documento sigue con dTiCam 7500 y dTotalGs 236250 (idéntico byte a byte)", [json(x74).dTiCam, json(x74).Subtotales[0].dTotalGs, JSON.stringify(json(x74)) === JSON.stringify(json(x75))], [7500, 236250, true]);
  const previaB = baseSimulada({ producto: productoUsd, cotizacion: { cambio: "7400.000000", fecha: "2026-10-15" } });
  const previa = (await prepararFactura(previaB.db, EMPRESA, USUARIO, leerCuerpoFactura(cuerpo({ moneda: "USD", cambio: "7500" })) as never)).resumen as { moneda: string; cambio: { valor: string; totalGs: string; catalogo: { cambio: string; fecha: string } | null; modificado: boolean }; totales: { total: number } };
  igual("previa USD: moneda, total en USD, cambio usado, equivalente en guaraníes y aviso de cambio distinto del registrado; sin escrituras", [previa.moneda, previa.totales.total, previa.cambio.valor, previa.cambio.totalGs, previa.cambio.catalogo, previa.cambio.modificado, previaB.escrituras().length], ["USD", 31.5, "7500", "236250", { cambio: "7400", fecha: "2026-10-15" }, true, 0]);
  igual("aislamiento: la consulta de cotizaciones filtra por la empresa de la sesión", previaB.llamadas.filter((l) => /FROM tipos_cambio/.test(l.sql)).map((l) => [/empresa_id = \$1/.test(l.sql), l.parametros[0]]), [[true, EMPRESA]]);

  // Sin conversión silenciosa de precios de lista
  const pygEnUsd = await emitir({ moneda: "USD", cambio: "7500" }, { producto: productoPyg });
  igual("producto con lista SOLO en PYG facturado en USD sin precio escrito: 422, no se convierte y no se reserva número", [/^422:.*no se convierte el precio de otra moneda/.test(pygEnUsd.e), pygEnUsd.b.creaciones().length], [true, 0]);
  const manualSinPermiso = await emitir({ moneda: "USD", cambio: "7500", lineas: [{ productoId: PRODUCTO, cantidad: "3", precio: "10.5" }] }, { producto: productoPyg });
  igual("precio escrito a mano en USD sin FACTURACION_ELECTRONICA.PRECIO → 403 y sin número", [/^403:.*permiso para modificar el precio/.test(manualSinPermiso.e), manualSinPermiso.b.creaciones().length], [true, 0]);
  const manualConPermiso = await emitir({ moneda: "USD", cambio: "7500", lineas: [{ productoId: PRODUCTO, cantidad: "3", precio: "10.5" }] }, { producto: productoPyg, permisos: ["FACTURACION_ELECTRONICA.PRECIO"] });
  igual("precio escrito a mano en USD con el permiso: se crea y el payload lleva ese precio en USD (nada convertido)", [manualConPermiso.e, json(manualConPermiso).Detalles[0].dPUniProSer, json(manualConPermiso).Subtotales[0].dTotGralOpe], ["OK", 10.5, 31.5]);
  const usdEnPyg = await emitir({}, { producto: productoUsd });
  igual("producto con lista en USD facturado en PYG sin precio: 422 (tampoco se convierte hacia guaraníes)", [/^422:.*guaraníes/.test(usdEnPyg.e), usdEnPyg.b.creaciones().length], [true, 0]);

  // Errores antes de reservar numeración
  const malos: Array<[string, Record<string, unknown>, Entorno, RegExp]> = [
    ["USD sin cambio", { moneda: "USD" }, { producto: productoUsd }, /^400:.*tipo de cambio manual/],
    ["USD con cambio cero", { moneda: "USD", cambio: "0" }, { producto: productoUsd }, /^400:.*tipo de cambio manual/],
    ["BRL con cambio de 5 decimales", { moneda: "BRL", cambio: "1425.12345" }, { producto: productoUsd }, /^400:/],
    ["PYG con cambio", { cambio: "7500" }, {}, /^400:.*no lleva tipo de cambio/],
    ["moneda desconocida", { moneda: "EUR", cambio: "8000" }, {}, /^400:.*moneda de la factura no es válida/],
    ["USD con pagos que no suman", { moneda: "USD", cambio: "7500", pagos: [{ tipo: 1, monto: "20" }, { tipo: 5, monto: "11.49" }] }, { producto: productoUsd }, /^422:.*suma de los pagos/],
    ["USD con entrega igual al total", { moneda: "USD", cambio: "7500", condicion: 2, credito: { tipo: 1, plazoDias: 30, entrega: "31.5" }, pagos: [{ tipo: 1 }] }, { producto: productoUsd }, /^422:.*menor que el total/],
    ["Cuotas siguen suspendidas en USD", { moneda: "USD", cambio: "7500", condicion: 2, credito: { tipo: 2, cuotas: [{ monto: "31.5", vencimiento: "2099-01-10" }] }, pagos: [{ tipo: 1 }] }, { producto: productoUsd }, /^400:.*suspendido/],
  ];

  for (const [nombre, extra, entorno, re] of malos) {
    const r = await emitir(extra, entorno);

    igual(`error antes de reservar número — ${nombre}: respuesta dirigida y ninguna llamada a fe_documento_crear_fe`, [re.test(r.e), r.b.creaciones().length], [true, 0]);
  }

  // Crédito a Plazo en USD de ponta a ponta
  const plazoUsd = await emitir({ moneda: "USD", cambio: "7500", condicion: 2, credito: { tipo: 1, plazoDias: 90, entrega: "10" }, pagos: [{ tipo: 1 }] }, { producto: productoUsd });
  igual("servidor Crédito a Plazo 90 días en USD con entrega de 10 USD en Efectivo: dMonEnt 10, pago 10 USD con cambio, «90 días», total 31.5 en el documento", [plazoUsd.e, json(plazoUsd).dMonEnt, json(plazoUsd).FormaPago.map((p) => [p.dMonTiPag, p.cMoneTiPag, p.dTiCamTiPag]), json(plazoUsd).dPlazoCre, par(plazoUsd)[10], par(plazoUsd)[8]], ["OK", 10, [[10, "USD", 7500]], "90 días", "USD", "31.5"]);
  const mixUsd = await emitir({ moneda: "BRL", cambio: "1425.5", pagos: [{ tipo: 1, monto: "20" }, { tipo: 3, monto: "11.5", tarjeta: { denominacion: 2, formaProcesamiento: 1 } }] }, { producto: { ...productoUsd, monedaPrecio: "BRL" } });
  igual("servidor BRL con pagos combinados Efectivo + Tarjeta: dos medios en BRL, grupo de tarjeta solo en el segundo", [mixUsd.e, json(mixUsd).FormaPago.map((p) => [p.cMoneTiPag, p.dMonTiPag, "gPagTarCD" in p]), json(mixUsd).Subtotales[0].dTotalGs], ["OK", [["BRL", 20, false], ["BRL", 11.5, true]], 44903.25]);

  // Idempotencia y precisión de pagos
  const rep = await emitir({ moneda: "USD", cambio: "7500" }, { producto: productoUsd });
  const otroCambio = await emitir({ moneda: "USD", cambio: "7501" }, { producto: productoUsd });
  igual("idempotencia: misma operación → mismo payload; otro cambio o otra moneda → payload distinto (misma clave con otro contenido conflictúa en SQL)", [JSON.stringify(json(rep)) === JSON.stringify(json(usd)), JSON.stringify(json(otroCambio)) === JSON.stringify(json(usd)), JSON.stringify(json(base)) === JSON.stringify(json(usd))], [true, false, false]);
  igual("regresión R01-01: un pago en USD que Number alteraría se rechaza (también con E611)", tiene(entrada({ lineas: linea("847688702356.7569", "1"), cambio: "1", pagos: [{ tipo: 1, monto: "782284262408.5882" }] }), /perder precisión|suma de los pagos/), true);
  const consultas = (x: { b: ReturnType<typeof baseSimulada> }) => x.b.llamadas.map((l) => l.sql.replace(/\s+/g, " ").slice(0, 40)).filter((q) => !/FROM tipos_cambio|SELECT cambio/.test(q)).join("|");
  igual("permisos y aislamiento intactos: USD solo agrega la lectura de cotizaciones; el resto de consultas es el de PYG", consultas(rep) === consultas(base), true);

  // cotizacionVigente: nunca recorta una cotización del catálogo
  const cot = async (fila: Record<string, unknown> | null, lanza = false) => cotizacionVigente({ query: async () => { if (lanza) throw Object.assign(new Error("x"), { code: "42P01" }); return { rows: fila ? [fila] : [], rowCount: fila ? 1 : 0 }; } } as never, EMPRESA, "USD");
  igual("cotizacionVigente: 7500.500000 → 7500.5; 7500.123456 (no cabe en 4 decimales) → null (no se recorta); sin fila o sin tabla → null", [await cot({ cambio: "7500.500000", fecha: "2026-10-15" }), await cot({ cambio: "7500.123456", fecha: "2026-10-15" }), await cot({ cambio: "7500.120000", fecha: "2026-10-15" }), await cot(null), await cot(null, true)], [{ cambio: "7500.5", fecha: "2026-10-15" }, null, { cambio: "7500.12", fecha: "2026-10-15" }, null, null]);

  // ── 4-bis. AUD-MFE-P2-R01-01: F023 `1-15p(0-8)` — hasta 15 dígitos enteros, sin redondear ni truncar ───────────────────────────────────────────────────
  const exento = (precio: string, cantidad = "1") => [{ ...linea(precio, cantidad)[0], afectacion: 3 as const, tasa: 0 as const }];
  const grande = (precio: string, cambio: string) => entrada({ lineas: exento(precio), cambio, pagos: [{ tipo: 1, monto: precio }] });
  igual("ejemplo de la auditoría: 100000000000 USD × 99999 = 9999900000000000 Gs (16 dígitos enteros) → bloqueado con el motivo y sin truncar", [totalEnGuaranies(dec("100000000000"), "99999") === BigInt("9999900000000000") * S, cabeEnF023(BigInt("9999900000000000") * S), tiene(grande("100000000000", "99999"), /F023.*supera los 15 dígitos enteros.*1-15p\(0-8\)/)], [true, false, true]);
  igual("el generador JSON también se niega (defensa en profundidad): construirPayloadFE lanza y no emite un F023 fuera de rango", (() => { try { construirPayloadFE(grande("100000000000", "99999"), HOY); return "OK"; } catch { return "bloqueado"; } })(), "bloqueado");
  igual("límites de F023: 15 dígitos enteros caben (999999999999999), 16 no; con decimales (≤ 8) también", [cabeEnF023(dec("999999999999999")), cabeEnF023(dec("999847688702356.75699999")), cabeEnF023(BigInt("1000000000000000") * S), cabeEnF023(dec("0"))], [true, true, false, true]);
  igual("valor válido grande SIGUE emitiéndose sin cambios: 99999999999 USD × 9999 = 999899999990001 Gs (15 dígitos) → F023 exacto, sin redondeo", [errores(grande("99999999999", "9999")), payload(grande("99999999999", "9999")).Subtotales[0].dTotalGs], [[], 999899999990001]);
  const pBorde = payload(grande("100000000000", "9999.9999"));
  igual("justo bajo el límite (1e11 × 9999,9999 = 999999990000000 < 1e15): válido y exacto", [pBorde.Subtotales[0].dTotalGs, pBorde.dTiCam], [999999990000000, 9999.9999]);
  const f023 = await emitir({ moneda: "USD", cambio: "99999", lineas: [{ productoId: PRODUCTO, cantidad: "1" }] }, { producto: { ...productoUsd, precio: "100000000000", afectacion: 3, tasa: 0, proporcion: null } });
  igual("servidor: F023 fuera de rango → 422 dirigido ANTES de reservar numeración (ninguna llamada a fe_documento_crear_fe)", [/^422:.*F023.*15 dígitos enteros/.test(f023.e), f023.b.creaciones().length, f023.b.escrituras().length], [true, 0, 0]);
  const f023ok = await emitir({ moneda: "USD", cambio: "9999", lineas: [{ productoId: PRODUCTO, cantidad: "1" }] }, { producto: { ...productoUsd, precio: "99999999999", afectacion: 3, tasa: 0, proporcion: null } });
  igual("servidor: el caso con cambio que cabe se emite y el payload lleva F023 exacto", [f023ok.e, json(f023ok).Subtotales[0].dTotalGs], ["OK", 999899999990001]);
  igual("PYG y USD de importes normales no cambian (regresión)", [errores(pyg()), errores(entrada()), payload(entrada()).Subtotales[0].dTotalGs], [[], [], 236250]);

  // ── 4-ter. AUD-MFE-P2-R01-02: pendientes fiscales y de precio separados, cada uno con su permiso ───────────────────────────────────────────────────
  const prod = (extra: Record<string, unknown> = {}) => ({ afectacion: 1, unidadSifen: 77, unidadVigente: true, precio: "11000", monedaPrecio: "PYG", ...extra }) as Parameters<typeof decidirProducto>[0];
  const solo = (a: boolean, p: boolean) => ({ puedeAjustarFiscal: a, puedeEditarPrecio: p });
  const dec3 = (p: Parameters<typeof decidirProducto>[0], m: string, a: boolean, pr: boolean) => { const d = decidirProducto(p, m, solo(a, pr)); return [d.habilitado, d.fiscales.length, d.precio.length]; };
  igual("PRECIO sin AJUSTE_FISCAL: producto fiscalmente válido con lista en PYG se AÑADE a una factura USD (el precio se escribe a mano)", [dec3(prod(), "USD", false, true), decidirProducto(prod(), "USD", solo(false, true)).mensaje], [[true, 0, 1], "Pendiente de completar: sin precio de venta en USD. Se completa en la línea de la factura."]);
  igual("AJUSTE_FISCAL sin PRECIO: el mismo producto en USD NO se añade (no podría escribir el precio) y el mensaje explica el permiso", [dec3(prod(), "USD", true, false), /permiso de precio/.test(decidirProducto(prod(), "USD", solo(true, false)).mensaje ?? "")], [[false, 0, 1], true]);
  igual("sin ningún permiso: bloqueado; con ambos: habilitado", [dec3(prod(), "USD", false, false)[0], dec3(prod(), "USD", true, true)[0]], [false, true]);
  igual("producto fiscalmente incompleto (sin IVA ni unidad) con PRECIO y sin AJUSTE_FISCAL: bloqueado, remite a Productos y NO se abre la edición fiscal", [dec3(prod({ afectacion: null, unidadSifen: null }), "PYG", false, true), decidirProducto(prod({ afectacion: null, unidadSifen: null }), "PYG", solo(false, true)).corregirEnProductos], [[false, 2, 0], true]);
  igual("producto fiscalmente incompleto con AJUSTE_FISCAL y precio en la moneda: habilitado (se completa en la línea)", dec3(prod({ afectacion: null, unidadVigente: false }), "PYG", true, false), [true, 2, 0]);
  igual("producto completo con precio en la moneda de la factura: habilitado sin pendientes ni permisos especiales", [dec3(prod({ monedaPrecio: "USD", precio: "10.5" }), "USD", false, false), decidirProducto(prod({ monedaPrecio: "USD", precio: "10.5" }), "USD", solo(false, false)).mensaje], [[true, 0, 0], undefined]);
  igual("PYG intacto: producto sin precio PYG pide guaraníes y el permiso de precio", [decidirProducto(prod({ precio: null }), "PYG", solo(false, false)).mensaje?.includes("guaraníes"), dec3(prod({ precio: null }), "PYG", false, true)[0]], [true, true]);
  const soloPrecio = await emitir({ moneda: "USD", cambio: "7500", lineas: [{ productoId: PRODUCTO, cantidad: "3", precio: "10.5", ajuste: { descripcion: "Otra descripción" } }] }, { producto: productoPyg, permisos: ["FACTURACION_ELECTRONICA.PRECIO"] });
  igual("servidor: con PRECIO pero sin AJUSTE_FISCAL no se altera descripción/IVA/unidad/GTIN (403 AJUSTE_FISCAL) y no se reserva número", [/^403:.*AJUSTE_FISCAL/.test(soloPrecio.e), soloPrecio.b.creaciones().length], [true, 0]);
  const soloPrecioOk = await emitir({ moneda: "USD", cambio: "7500", lineas: [{ productoId: PRODUCTO, cantidad: "3", precio: "10.5" }] }, { producto: productoPyg, permisos: ["FACTURACION_ELECTRONICA.PRECIO"] });
  igual("servidor: con PRECIO y sin AJUSTE_FISCAL el precio manual en USD se acepta y el resto del producto no cambia", [soloPrecioOk.e, json(soloPrecioOk).Detalles[0].dPUniProSer, json(soloPrecioOk).Detalles[0].cUniMed, json(soloPrecioOk).Detalles[0].iAfecIVA], ["OK", 10.5, 77, 1]);

  // ── 4-quater. AUD-MFE-P2-R01-03: comparación exacta de precios ─────────────────────────────────────────────────────────────────────────────────
  igual("Number no distingue 847688702356.7569 de 847688702356.7570 pero la comparación exacta sí", [Number("847688702356.7569") === Number("847688702356.7570"), mismoPrecio("847688702356.7569", "847688702356.7570"), mismoPrecio("847688702356.7569", "847688702356.7569")], [true, false, true]);
  igual("mismoPrecio: ceros finales equivalen; inválidos y lista nula nunca son iguales", [mismoPrecio("10", "10.0000"), mismoPrecio("10.5", "10.50"), mismoPrecio("abc", "10"), mismoPrecio("10", null), mismoPrecio("", "")], [true, true, false, false, false]);
  igual("precioSerializable: 782284262408.5882 no sobrevive a Number; 10.5 y 999999999999.9999 sí", [precioSerializable("782284262408.5882"), precioSerializable("10.5"), precioSerializable("999999999999.9999")], [false, true, true]);
  const noSerial = await emitir({ moneda: "USD", cambio: "7500", lineas: [{ productoId: PRODUCTO, cantidad: "1", precio: "782284262408.5882" }] }, { producto: { ...productoUsd, precio: "782284262408.5881" }, permisos: ["FACTURACION_ELECTRONICA.PRECIO"] });
  igual("servidor: un precio escrito que no se puede serializar sin perder precisión se RECHAZA con el motivo (422) en vez de usar el precio de lista, y sin reservar número", [/^422:.*782284262408\.5882.*no puede escribirse.*no se usa el precio de lista/.test(noSerial.e), noSerial.b.creaciones().length], [true, 0]);
  const sinPermisoDif = await emitir({ moneda: "USD", cambio: "7500", lineas: [{ productoId: PRODUCTO, cantidad: "1", precio: "10.5001" }] }, { producto: productoUsd });
  igual("servidor: diferencia mínima de 0,0001 sin FACTURACION_ELECTRONICA.PRECIO → 403 (no se descarta ni se acepta) y sin reservar número", [/^403:.*permiso para modificar el precio/.test(sinPermisoDif.e), sinPermisoDif.b.creaciones().length], [true, 0]);
  const conPermisoDif = await emitir({ moneda: "USD", cambio: "7500", lineas: [{ productoId: PRODUCTO, cantidad: "1", precio: "10.5001" }] }, { producto: productoUsd, permisos: ["FACTURACION_ELECTRONICA.PRECIO"] });
  igual("servidor: con el permiso, la diferencia mínima se factura con el precio ESCRITO (10.5001), no con el de lista", [conPermisoDif.e, json(conPermisoDif).Detalles[0].dPUniProSer], ["OK", 10.5001]);

  // ── D016 / E610 en USD/BRL: lo comprobable ────────────────────────────────────────────────────────────────────────────────────────────────────
  igual("D016 dDesMoneOpe y E610 dDMoneTiPag NO se envían en USD/BRL (sin texto oficial comprobable) y el baseline PYG no cambia: Efectivo PYG de 4 chaves, sin D016", [pu.dDesMoneOpe === undefined, "dDMoneTiPag" in pu.FormaPago[0], "dDMoneTiPag" in pb.FormaPago[0], Object.keys(pp.FormaPago[0]).join(","), "dDesMoneOpe" in pp], [true, false, false, "iTiPago,dMonTiPag,cMoneTiPag,dTiCamTiPag", false]);

  // ── 5. Pantalla y límites ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const pagina = leer("app/(private)/facturas/nueva/page.tsx");
  const cuerpoUI = pagina.slice(pagina.indexOf("const cuerpoFactura"), pagina.indexOf("const cuerpoFactura") + 1100);
  cierto("pantalla: selector de moneda (PYG/USD/BRL) y campo «Tipo de cambio (Gs. por 1 …)» solo con moneda extranjera, dentro de la tarjeta Operación", /aria-label="Moneda de la factura"/.test(pagina) && /aria-label="Tipo de cambio"/.test(pagina) && /extranjera \? \(/.test(pagina) && pagina.indexOf('aria-label="Moneda de la factura"') > pagina.indexOf('aria-labelledby="sec-operacion"') && pagina.indexOf('aria-label="Moneda de la factura"') < pagina.indexOf('aria-labelledby="sec-cliente"'));
  cierto("pantalla: el cuerpo envía moneda y cambio (este solo si es extranjera); cambiar de moneda reinicia precios, pagos y entrega SIN convertir nada", /moneda, \.\.\.\(extranjera \? \{ cambio \} : \{\}\)/.test(cuerpoUI) && /function cambiarMoneda\(m: Moneda\)/.test(pagina) && /referencia\(l\.producto, m\) \?\? ""/.test(pagina) && !/\* *Number\(cambio\)|Number\(cambio\) *\*|precio.*\*.*cambio/.test(pagina));
  cierto("pantalla: totales con el símbolo de la moneda, equivalente en guaraníes con aritmética exacta, pendiente si falta el cambio y cambio fijo en el modal de confirmación", /\{sim\} \{fmCampo\(calculo\.texto\.total\)\}/.test(pagina) && /Equivalente: Gs\./.test(pagina) && /totalEnGuaranies\(totalDec, cambioNormal\)/.test(pagina) && /indicar el tipo de cambio manual/.test(pagina) && /Tipo de cambio \(manual\)/.test(pagina) && /Equivalente en guaraníes/.test(pagina));
  cierto("R01-02 pantalla: BuscadorProducto y SelectorProducto usan decidirProducto con los permisos de precio y de ajuste fiscal por separado (el editor fiscal sigue condicionado a AJUSTE_FISCAL)", /function SelectorProducto\([\s\S]{0,400}?permisos: PermisosProducto/.test(pagina) && /function BuscadorProducto\([\s\S]{0,400}?permisos: PermisosProducto/.test(pagina) && (pagina.match(/decidirProducto\(p, moneda, permisos\)/g) ?? []).length === 2 && !/permiteIncompletos/.test(pagina) && /puedeAjustarFiscal \? \(/.test(pagina));
  cierto("R01-03 pantalla: los precios se comparan en Decimal exacto (mismoPrecio / parseDec), sin Number(l.precio)", /mismoPrecio\(l\.precio, referencia\(l\.producto, moneda\)\)/.test(pagina) && !/Number\(l\.precio\) *[!=>]/.test(pagina));
  cierto("pantalla: el precio de lista solo se usa si está en la moneda de la factura (no hay conversión en el navegador)", /const referencia = \(p: Producto, moneda: string\) => \(p\.monedaPrecio === moneda \? p\.precio : null\)/.test(pagina));
  const migraciones = readdirSync(join(process.cwd(), "documentacao/banco/nexit/v1/migraciones")).filter((f) => /^NEX-\d+/.test(f)).sort();
  igual("sin migración: documentos.moneda/total y el payload inmutable ya guardan la moneda, la cotización y los importes (última NEX-056)", migraciones.filter((f) => f < "NEX-057").pop()?.slice(0, 7), "NEX-056");
  cierto("FAT-E1/FAT-E2 sin tocar: el cálculo, el envío y el gateway no importan el módulo de monedas", !/monedas/.test(leer("lib/facturacion/calculo.ts")) && !/monedas/.test(leer("lib/facturacion/envio.ts")) && !/monedas/.test(leer("lib/facturacion/gateway.ts")) && !/monedas/.test(leer("lib/facturacion/reconciliacion.ts")) && !/from "pg"|fetch\(|node:fs/.test(leer("lib/facturacion/monedas.ts")));
  cierto("sin conversión de listas de precio en el servidor ni en el módulo: no existe ninguna multiplicación de precios por el cambio", !/precio[^;\n]*cambio|cambio[^;\n]*precio/i.test(leer("lib/facturacion/monedas.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
  igual("el factor Decimal interno no cambia (10^8) y el cero exacto sigue siendo cero", B(0) === BigInt(0), true);

  return fallos;
}
