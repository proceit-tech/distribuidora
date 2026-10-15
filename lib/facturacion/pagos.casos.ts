/**
 * MFE-03 P1 — Medios de pago (MT v150 E605–E632). Sin red y sin PostgreSQL: base simulada que responde por el texto de cada consulta. Se prueba la lógica del servidor (forma del
 * cuerpo, reglas por modalidad, conciliación exacta, qué llega al payload inmutable, que un error no reserve número) y la estructura de la pantalla. Nada se ejecutó en PostgreSQL
 * ni en el gateway: la forma exacta de los grupos gPagTarCD/gPagCheq dentro de FormaPago[] se basa en el Manual (paridad confirmada por el responsable), no en una transmisión real.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { B, parseDec } from "@/lib/facturacion/calculo";
import { crearFacturaElectronica, leerCuerpoFactura, prepararFactura } from "@/lib/facturacion/emision";
import { FORMAS_PAGO, leerPagos, numeroChequeFiscal, pagoParaEnvio, PAGO_UI_VACIO, pendientesPagos, type PagoEntrada } from "@/lib/facturacion/pagos";
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
const producto = { id: PRODUCTO, codigo: "P-1", descripcion: "Producto de prueba", unidadSifen: 77, unidadSimbolo: "UNI", unidadVigente: true, afectacion: 1, proporcion: null, tasa: 10, precio: "11000", monedaPrecio: "PYG", gtin: null };
const receptor: ReceptorFE = { codigo: "CLI-000001", naturaleza: 1, tipoOperacion: 1, tipoContribuyente: 2, pais: "PRY", ruc: "80000005", dv: "6", tipoDocumentoIdentidad: null, descripcionTipoDocumento: "", numeroDocumento: "", razonSocial: "EMPRESA SINTETICA SA", nombreFantasia: "", direccion: "Calle 1", numeroCasa: "123", departamento: "1", distrito: "1", ciudad: "1", telefono: "", celular: "", email: "a@b.com", emailCopia: "", emailFacturacion: "" };

type Llamada = { sql: string; parametros: unknown[] };

function baseSimulada() {
  const llamadas: Llamada[] = [];
  const db = {
    async query(sql: string, parametros: unknown[] = []) {
      llamadas.push({ sql, parametros });
      if (/usuario_tiene_permiso/.test(sql)) return { rows: [{ ok: false }], rowCount: 1 };
      if (/FROM clientes c\s+LEFT JOIN LATERAL/.test(sql)) return { rows: [filaCliente], rowCount: 1 };
      if (/SELECT c\.id, c\.naturaleza_receptor/.test(sql)) return { rows: [{ ...filaCliente, id: CLIENTE, tipo_persona: "JURIDICA", tipo_documento: "RUC", pais_codigo: "PRY" }], rowCount: 1 };
      if (/FROM direcciones_cliente/.test(sql)) return { rows: [{ cliente_id: CLIENTE, direccion: "Calle 1", numero_casa: "123", departamento_codigo: "1", distrito_codigo: "1", ciudad_codigo: "1", pais_codigo: "PRY" }], rowCount: 1 };
      if (/FROM referencia_geografica_paises/.test(sql)) return { rows: [{ codigo: "PRY" }], rowCount: 1 };
      if (/FROM sucursales sc JOIN empresas e/.test(sql)) return { rows: [{ empresa: "EMPRESA SINTETICA", sucursal: "Casa Central", establecimiento: "001", punto: "002", puntoNombre: "Punto 002" }], rowCount: 1 };
      if (/FROM productos p/.test(sql)) return { rows: [producto], rowCount: 1 };
      if (/fe_documento_crear_fe/.test(sql)) return { rows: [{ documentoId: DOC, numero: "0050000", reutilizado: false }], rowCount: 1 };

      return { rows: [], rowCount: 0 };
    },
  };

  return { db: db as never, llamadas, creaciones: () => llamadas.filter((l) => /fe_documento_crear_fe/.test(l.sql)), escrituras: () => llamadas.filter((l) => /INSERT INTO|UPDATE |DELETE FROM|fe_documento_crear_fe/.test(l.sql)) };
}

// Total del cuerpo de prueba: 3 × 11.000 = 33.000 (IVA 10 % incluido)
const cuerpo = (extra: Record<string, unknown> = {}) => ({ claveIdempotencia: "clave-de-prueba-0001", sucursalId: SUC, puntoId: PUNTO, clienteId: CLIENTE, tipoTransaccion: 1, presencia: 1, pagos: [{ tipo: 1 }], infoAdicional: "", lineas: [{ productoId: PRODUCTO, cantidad: "3" }], ...extra });

export async function verificarCasosPagos(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const resultado = async (p: Promise<unknown>) => {
    try { await p; return "OK"; } catch (e) { return e instanceof ErrorValidacionFiscal ? `${e.estado}:${e.detalles.join("|")}` : e instanceof ErrorFacturacion ? `${e.estado}:${e.message}` : `ERR:${String(e)}`; }
  };
  const lineas = [{ codigoInterno: "P-1", gtin: null, descripcion: "Producto", unidadSifen: 77, cantidad: "3", precio: "11000", afectacion: 1 as const, tasa: 10 as const, proporcion: null }];
  const entrada = (extra: Partial<EntradaFE> = {}): EntradaFE => ({ moneda: "PYG", tipoTransaccion: 1, presencia: 1, condicion: 1, pagos: [{ tipo: 1, monto: "33000" }], infoAdicional: "", receptor, lineas, ...extra });
  const errores = (e: EntradaFE) => validarEntradaFE(e, HOY);
  const payload = (e: EntradaFE) => construirPayloadFE(e, HOY) as Record<string, unknown> & { FormaPago: Array<Record<string, unknown>> };
  const tiene = (e: EntradaFE, re: RegExp) => errores(e).some((m) => re.test(m));
  const pago = (x: Partial<PagoEntrada> & { monto?: string }): PagoEntrada & { monto: string } => ({ tipo: 1, monto: "33000", ...x }) as PagoEntrada & { monto: string };
  const unico = (x: Partial<PagoEntrada>) => entrada({ pagos: [pago(x)] });

  // ── 1. Efectivo: baseline idéntico ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  igual("CA-01 Efectivo único: FormaPago con exactamente las cuatro claves de siempre y sin grupos condicionales", [errores(entrada()), payload(entrada()).FormaPago], [[], [{ iTiPago: 1, dMonTiPag: 33000, cMoneTiPag: "PYG", dTiCamTiPag: null }]]);

  // ── 2. Transferencia y medios sin datos adicionales ────────────────────────────────────────────────────────────────────────────────────────────
  for (const t of [5, 6, 7, 8, 9, 17, 21]) igual(`medio ${t} (${FORMAS_PAGO[t]}) sin grupos adicionales: cuatro claves y el código oficial`, [errores(unico({ tipo: t })), payload(unico({ tipo: t })).FormaPago], [[], [{ iTiPago: t, dMonTiPag: 33000, cMoneTiPag: "PYG", dTiCamTiPag: null }]]);
  igual("catálogo oficial E606: códigos 1 Efectivo, 2 Cheque, 3 Tarjeta de crédito, 4 Tarjeta de débito, 5 Transferencia", [1, 2, 3, 4, 5].map((k) => FORMAS_PAGO[k]), ["Efectivo", "Cheque", "Tarjeta de crédito", "Tarjeta de débito", "Transferencia bancaria"]);
  igual("medios que exigen grupos propios NO se ofrecen (10 retención, 11 anticipo, 12–15, 18–20)", [10, 11, 12, 13, 14, 15, 18, 19, 20].map((k) => k in FORMAS_PAGO), [false, false, false, false, false, false, false, false, false]);

  // ── 3. Tarjeta ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const visa = { denominacion: 1, formaProcesamiento: 1 };
  for (const t of [3, 4]) {
    igual(`tarjeta ${FORMAS_PAGO[t]}: gPagTarCD con iDenTarj e iForProPa (números), sin dDesDenTarj, sin número de tarjeta`, payload(unico({ tipo: t, tarjeta: visa })).FormaPago[0], { iTiPago: t, dMonTiPag: 33000, cMoneTiPag: "PYG", dTiCamTiPag: null, gPagTarCD: { iDenTarj: 1, iForProPa: 1 } });
  }
  igual("tarjeta marca «Otro» (99): dDesDenTarj obligatoria de 4 a 20 caracteres", [
    payload(unico({ tipo: 3, tarjeta: { denominacion: 99, descripcion: "Unica", formaProcesamiento: 2 } })).FormaPago[0].gPagTarCD,
    tiene(unico({ tipo: 3, tarjeta: { denominacion: 99, formaProcesamiento: 2 } }), /describa la marca/),
    tiene(unico({ tipo: 3, tarjeta: { denominacion: 99, descripcion: "abc", formaProcesamiento: 2 } }), /describa la marca/),
  ], [{ iDenTarj: 99, dDesDenTarj: "Unica", iForProPa: 2 }, true, true]);
  igual("CA-10 tarjeta sin marca o sin forma de procesamiento → error por campo", [tiene(unico({ tipo: 3 }), /marca de la tarjeta/), tiene(unico({ tipo: 4, tarjeta: { denominacion: 1, formaProcesamiento: 3 } }), /forma de procesamiento/), tiene(unico({ tipo: 3, tarjeta: { denominacion: 7, formaProcesamiento: 1 } }), /marca de la tarjeta/)], [true, true, true]);
  igual("la descripción de marca solo con «Otro»", tiene(unico({ tipo: 3, tarjeta: { ...visa, descripcion: "Visa" } }), /solo se informa con «Otro»/), true);
  igual("tarjeta en una modalidad que no la admite → error (no se descarta en silencio)", [tiene(unico({ tipo: 5, tarjeta: visa }), /solo corresponden a tarjeta/), tiene(unico({ tipo: 1, tarjeta: visa }), /solo corresponden a tarjeta/)], [true, true]);
  igual("sin PAN ni CVV: el cuerpo con número de tarjeta, CVV o titular se rechaza en la lectura", [{ ...visa, numero: "4111111111111111" }, { ...visa, cvv: "123" }, { ...visa, titular: "X" }, { ...visa, ultimos4: "1111" }].map((t) => typeof leerPagos([{ tipo: 3, tarjeta: t }])), ["string", "string", "string", "string"]);
  cierto("el payload de tarjeta no contiene claves de PAN, CVV, titular, autorización ni últimos dígitos", !/dNumTarj|dNomTit|dCodAuOpe|cvv|pan/i.test(JSON.stringify(payload(unico({ tipo: 3, tarjeta: visa })))));

  // ── 4. Cheque ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  igual("cheque: gPagCheq con dNumCheq de 8 caracteres (ceros a la izquierda) y dBcoEmi", payload(unico({ tipo: 2, cheque: { numero: "1234", banco: "Banco Continental" } })).FormaPago[0], { iTiPago: 2, dMonTiPag: 33000, cMoneTiPag: "PYG", dTiCamTiPag: null, gPagCheq: { dNumCheq: "00001234", dBcoEmi: "Banco Continental" } });
  igual("numeroChequeFiscal conserva 8 dígitos y completa a la izquierda", [numeroChequeFiscal("1"), numeroChequeFiscal("12345678")], ["00000001", "12345678"]);
  igual("CA-09 cheque sin número, sin banco, banco corto, número de 9 dígitos o con letras → error por campo", [
    tiene(unico({ tipo: 2 }), /número de cheque/), tiene(unico({ tipo: 2, cheque: { numero: "", banco: "Banco Continental" } }), /número de cheque/),
    tiene(unico({ tipo: 2, cheque: { numero: "1234", banco: "" } }), /banco emisor/), tiene(unico({ tipo: 2, cheque: { numero: "1234", banco: "abc" } }), /banco emisor/),
    tiene(unico({ tipo: 2, cheque: { numero: "123456789", banco: "Banco Continental" } }), /número de cheque/), tiene(unico({ tipo: 2, cheque: { numero: "12a4", banco: "Banco Continental" } }), /número de cheque/),
  ], [true, true, true, true, true, true]);
  igual("CA-09 grupo de cheque en Efectivo → error", tiene(unico({ tipo: 1, cheque: { numero: "1234", banco: "Banco Continental" } }), /solo corresponden a la forma Cheque/), true);

  // ── 5. Otro (99) y pago bancario (16) ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  igual("«Otro» (99): dDesTiPag obligatoria (4–30) y solo con 99", [payload(unico({ tipo: 99, descripcion: "Canje comercial" })).FormaPago[0].dDesTiPag, tiene(unico({ tipo: 99 }), /describa el medio de pago/), tiene(unico({ tipo: 99, descripcion: "abc" }), /describa el medio/), tiene(unico({ tipo: 1, descripcion: "x" }), /solo se informa con la forma «Otro»/)], ["Canje comercial", true, true, true]);
  igual("CA-11 pago bancario (16) solo con presencia «Operación bancaria» (E011 = 5)", [tiene(unico({ tipo: 16 }), /Operación bancaria/), errores({ ...unico({ tipo: 16 }), presencia: 5 })], [true, []]);

  // ── 6. Múltiples medios en Contado ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const mixto = entrada({ pagos: [pago({ tipo: 1, monto: "20000" }), pago({ tipo: 5, monto: "13000" })] });
  igual("CA-08 Contado Efectivo + Transferencia: dos registros, suma exacta", [errores(mixto), payload(mixto).FormaPago.map((p) => [p.iTiPago, p.dMonTiPag])], [[], [[1, 20000], [5, 13000]]]);
  igual("Contado combinado con cheque y tarjeta: cada grupo en SU medio y nada más", (() => { const p = payload(entrada({ pagos: [pago({ tipo: 2, monto: "10000", cheque: { numero: "55", banco: "Banco Atlas" } }), pago({ tipo: 3, monto: "13000", tarjeta: visa }), pago({ tipo: 1, monto: "10000" })] })).FormaPago; return p.map((x) => Object.keys(x).join(",")); })(), ["iTiPago,dMonTiPag,cMoneTiPag,dTiCamTiPag,gPagCheq", "iTiPago,dMonTiPag,cMoneTiPag,dTiCamTiPag,gPagTarCD", "iTiPago,dMonTiPag,cMoneTiPag,dTiCamTiPag"]);
  igual("la suma debe ser EXACTA: 1 guaraní de más o de menos se rechaza", [tiene(entrada({ pagos: [pago({ monto: "20000" }), pago({ tipo: 5, monto: "13001" })] }), /suma de los pagos/), tiene(entrada({ pagos: [pago({ monto: "20000" }), pago({ tipo: 5, monto: "12999" })] }), /suma de los pagos/)], [true, true]);
  igual("monto cero, negativo o con 5 decimales en cualquier medio → error", [tiene(entrada({ pagos: [pago({ monto: "33000" }), pago({ tipo: 5, monto: "0" })] }), /mayor que cero/), tiene(entrada({ pagos: [pago({ monto: "32999.99999" }), pago({ tipo: 5, monto: "0.00001" })] }), /4 decimales/)], [true, true]);
  igual("sin ningún pago en Contado → error", tiene(entrada({ pagos: [] }), /Indique la forma de pago/), true);

  // ── 7. Crédito a Plazo: los medios pagan SOLO la entrega ───────────────────────────────────────────────────────────────────────────────────────
  const aCredito = (entrega: string | null, pagos: Array<PagoEntrada & { monto: string }>) => entrada({ condicion: 2, pagos, credito: { tipo: 1, plazoDias: 30, cuotas: [], entrega } });
  const cEntrega = aCredito("10000", [pago({ tipo: 1, monto: "4000" }), pago({ tipo: 5, monto: "6000" })]);
  igual("PAGO-02 Crédito con entrega repartida en dos medios: dMonEnt = Σ medios (10000) < total (33000); el saldo financiado no se paga", [errores(cEntrega), payload(cEntrega).dMonEnt, payload(cEntrega).FormaPago.map((p) => p.dMonTiPag), payload(cEntrega).dPlazoCre], [[], 10000, [4000, 6000], "30 días"]);
  igual("Crédito: medios que NO suman la entrega declarada → error con ambas cifras", tiene(aCredito("10000", [pago({ tipo: 1, monto: "4000" }), pago({ tipo: 5, monto: "5000" })]), /suman 9000.*entrega inicial \(10000\)/), true);
  igual("Crédito: pagar el saldo financiado como si fuera entrega (medios = total) → error", errores(aCredito("33000", [pago({ tipo: 1, monto: "33000" })])).length > 0, true);
  igual("Crédito sin entrega: sin medios de pago (FormaPago vacío y dMonEnt nulo); con medios → error", [payload(aCredito(null, [])).FormaPago, payload(aCredito(null, [])).dMonEnt, tiene(aCredito(null, [pago({ monto: "100" })]), /Sin entrega inicial/)], [[], null, true]);
  igual("Crédito con entrega y tarjeta: gPagTarCD viaja en el medio de la entrega", payload(aCredito("5000", [pago({ tipo: 3, monto: "5000", tarjeta: visa })])).FormaPago[0].gPagTarCD, { iDenTarj: 1, iForProPa: 1 });

  // ── 8. Precisión decimal de dMonTiPag / dMonEnt se conserva ────────────────────────────────────────────────────────────────────────────────────
  igual("regresión R01-01: un pago que Number alteraría se rechaza también en varios medios", tiene(entrada({ lineas: [{ ...lineas[0], cantidad: "72727272.7273" }], pagos: [pago({ monto: "782284262408.5882" }), pago({ tipo: 5, monto: "17715737591.7118" })] }), /perder precisión/), true);
  cierto("todos los pagos usan moneda PYG sin tipo de cambio (las monedas son P2)", payload(mixto).FormaPago.every((p) => p.cMoneTiPag === "PYG" && p.dTiCamTiPag === null));

  // ── 9. Forma del cuerpo y servidor ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  igual("leerPagos: campos ajenos, tipo no numérico y montos inválidos se rechazan", [leerPagos([{ tipo: 1, foo: 1 }]), leerPagos([{ tipo: "x" }]), leerPagos([{ tipo: 1, monto: "1.23456" }]), leerPagos([{ tipo: 2, cheque: { numero: "1", banco: "Banco Atlas", pan: "1" } }])].map((x) => typeof x), ["string", "string", "string", "string"]);
  igual("leerPagos: más de 20 medios → error", typeof leerPagos(Array.from({ length: 21 }, () => ({ tipo: 1, monto: "1" }))), "string");
  igual("leerCuerpoFactura: Contado sin pagos → error; con pagos múltiples y datos → se conserva", [typeof leerCuerpoFactura(cuerpo({ pagos: [] })), (leerCuerpoFactura(cuerpo({ pagos: [{ tipo: 2, monto: "1000", cheque: { numero: "7", banco: "Banco Atlas" } }, { tipo: 1, monto: "32000" }] })) as { pagos: unknown[] }).pagos.length], ["string", 2]);

  const emitir = async (extra: Record<string, unknown>) => { const b = baseSimulada(); const c = leerCuerpoFactura(cuerpo(extra)); return { b, e: typeof c === "string" ? `400:${c}` : await resultado(crearFacturaElectronica(b.db, EMPRESA, USUARIO, c)) }; };
  const json = (x: { b: ReturnType<typeof baseSimulada> }) => JSON.parse(String(x.b.creaciones()[0]?.parametros[9] ?? "{}")) as Record<string, unknown> & { FormaPago: Array<Record<string, unknown>> };
  const base = await emitir({});
  igual("PAGO-01 servidor Efectivo único SIN monto: el medio cubre el total calculado por el servidor (33000) con la forma de siempre", [base.e, json(base).FormaPago], ["OK", [{ iTiPago: 1, dMonTiPag: 33000, cMoneTiPag: "PYG", dTiCamTiPag: null }]]);
  const transf = await emitir({ pagos: [{ tipo: 5 }] });
  igual("servidor Transferencia única: iTiPago 5 por el total", [transf.e, json(transf).FormaPago.map((p) => [p.iTiPago, p.dMonTiPag])], ["OK", [[5, 33000]]]);
  const combinado = await emitir({ pagos: [{ tipo: 1, monto: "13000" }, { tipo: 3, monto: "20000", tarjeta: { denominacion: 2, formaProcesamiento: 1 } }] });
  igual("servidor Contado combinado Efectivo + Tarjeta de crédito: dos medios, grupo de tarjeta solo en el segundo, un documento", [combinado.e, json(combinado).FormaPago.map((p) => Object.keys(p).includes("gPagTarCD")), combinado.b.creaciones().length], ["OK", [false, true], 1]);
  const cheque = await emitir({ pagos: [{ tipo: 2, cheque: { numero: "42", banco: "Banco Atlas" } }] });
  igual("servidor Cheque único con datos: gPagCheq con número de 8 dígitos", [cheque.e, json(cheque).FormaPago[0].gPagCheq], ["OK", { dNumCheq: "00000042", dBcoEmi: "Banco Atlas" }]);
  const entregaTarjeta = await emitir({ condicion: 2, credito: { tipo: 1, plazoDias: 60, entrega: "8000" }, pagos: [{ tipo: 1, monto: "3000" }, { tipo: 5, monto: "5000" }] });
  igual("servidor Crédito a Plazo con entrega en dos medios: dMonEnt 8000 = Σ medios, dPlazoCre «60 días»", [entregaTarjeta.e, json(entregaTarjeta).dMonEnt, json(entregaTarjeta).FormaPago.map((p) => p.dMonTiPag), json(entregaTarjeta).dPlazoCre], ["OK", 8000, [3000, 5000], "60 días"]);
  const entregaUnico = await emitir({ condicion: 2, credito: { tipo: 1, plazoDias: 30, entrega: "8000" }, pagos: [{ tipo: 5 }] });
  igual("servidor Crédito con entrega y UN medio sin monto: cubre la entrega (nunca el total)", [entregaUnico.e, json(entregaUnico).FormaPago.map((p) => [p.iTiPago, p.dMonTiPag])], ["OK", [[5, 8000]]]);
  const sinEntrega = await emitir({ condicion: 2, credito: { tipo: 1, plazoDias: 30 }, pagos: [{ tipo: 1 }] });
  igual("servidor Crédito sin entrega con el medio por defecto de la pantalla anterior: se ignora (FormaPago vacío)", [sinEntrega.e, json(sinEntrega).FormaPago], ["OK", []]);

  // Errores: 4xx/422 ANTES de fe_documento_crear_fe (sin numeración) y sin consultas de escritura
  const malos: Array<[string, Record<string, unknown>, RegExp]> = [
    ["suma menor", { pagos: [{ tipo: 1, monto: "20000" }, { tipo: 5, monto: "12999" }] }, /^422:.*suma de los pagos debe ser igual/],
    ["varios medios sin monto", { pagos: [{ tipo: 1 }, { tipo: 5 }] }, /^422:.*monto de cada medio/],
    ["cheque sin datos", { pagos: [{ tipo: 2 }] }, /^422:.*número de cheque/],
    ["tarjeta sin marca", { pagos: [{ tipo: 4 }] }, /^422:.*marca de la tarjeta/],
    ["forma fuera del catálogo", { pagos: [{ tipo: 10 }] }, /^422:La forma de pago no es válida/],
    ["pago bancario sin presencia bancaria", { pagos: [{ tipo: 16 }] }, /^422:.*Operación bancaria/],
    ["entrega con medios que no suman", { condicion: 2, credito: { tipo: 1, plazoDias: 30, entrega: "8000" }, pagos: [{ tipo: 1, monto: "3000" }, { tipo: 5, monto: "4000" }] }, /^422:.*suman 7000/],
    ["medios sin entrega declarada", { condicion: 2, credito: { tipo: 1, plazoDias: 30 }, pagos: [{ tipo: 1, monto: "100" }] }, /^422:.*Sin entrega inicial/],
    ["cuotas siguen suspendidas", { condicion: 2, credito: { tipo: 2, cuotas: [{ monto: "33000", vencimiento: "2099-01-10" }] }, pagos: [{ tipo: 1 }] }, /^400:.*suspendido/],
    ["PAN en el cuerpo", { pagos: [{ tipo: 3, tarjeta: { denominacion: 1, formaProcesamiento: 1, numero: "4111111111111111" } }] }, /^400:/],
  ];

  for (const [nombre, extra, re] of malos) {
    const r = await emitir(extra);

    igual(`error antes de reservar número — ${nombre}: respuesta dirigida y ninguna llamada a fe_documento_crear_fe`, [re.test(r.e), r.b.creaciones().length, r.b.escrituras().length], [true, 0, 0]);
  }

  // Autorización, aislamiento e idempotencia
  const consultas = (x: { b: ReturnType<typeof baseSimulada> }) => x.b.llamadas.map((l) => l.sql.replace(/\s+/g, " ").slice(0, 40)).join("|");
  igual("autorización y aislamiento: los medios de pago no agregan consultas ni permisos nuevos (mismas consultas que Efectivo) y todas siguen recibiendo la empresa de la sesión", [consultas(transf) === consultas(base), consultas(combinado) === consultas(base), consultas(cheque) === consultas(base), [base, combinado, cheque].every((x) => x.b.creaciones()[0].parametros[0] === EMPRESA)], [true, true, true, true]);
  const repetido = await emitir({ pagos: [{ tipo: 5 }] });
  igual("idempotencia: la misma operación produce el MISMO payload (misma huella); Efectivo, Transferencia y combinado producen payloads distintos (misma clave con otro contenido conflictúa en SQL)", [JSON.stringify(json(repetido)) === JSON.stringify(json(transf)), new Set([base, transf, combinado, cheque].map((x) => JSON.stringify(json(x)))).size], [true, 4]);
  const previaB = baseSimulada();
  const previa = (await prepararFactura(previaB.db, EMPRESA, USUARIO, leerCuerpoFactura(cuerpo({ pagos: [{ tipo: 1, monto: "13000" }, { tipo: 3, monto: "20000", tarjeta: { denominacion: 99, descripcion: "Unica", formaProcesamiento: 9 } }] })) as never)).resumen as { formaPago: string; pagos: Array<{ medio: string; monto: string; detalle: string }> };
  igual("previa: lista cada medio con monto y dato legible (sin número de tarjeta) y no escribe nada", [previa.formaPago, previa.pagos, previaB.escrituras().length], ["Efectivo + Tarjeta de crédito", [{ medio: "Efectivo", monto: "13000", detalle: "" }, { medio: "Tarjeta de crédito", monto: "20000", detalle: "Unica · Otro" }], 0]);

  // ── 10. Pantalla ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const ui = (o: Partial<typeof PAGO_UI_VACIO>) => ({ ...PAGO_UI_VACIO, ...o });
  igual("pagoParaEnvio: un solo medio no escribe monto; con varios viaja el monto; los datos de otra modalidad no se arrastran al cambiar de medio", [
    pagoParaEnvio(ui({ tipo: "1", monto: "999" }), true), pagoParaEnvio(ui({ tipo: "5", monto: " 700 " }), false), pagoParaEnvio(ui({ tipo: "1", chequeNumero: "12", chequeBanco: "Banco Atlas", tarjetaDenominacion: "1" }), true),
  ], [{ tipo: 1 }, { tipo: 5, monto: "700" }, { tipo: 1 }]);
  igual("pagoParaEnvio: cheque, tarjeta y «Otro» llevan SOLO su grupo", [pagoParaEnvio(ui({ tipo: "2", chequeNumero: "9", chequeBanco: "Banco Atlas" }), true), pagoParaEnvio(ui({ tipo: "3", tarjetaDenominacion: "99", tarjetaDescripcion: "Unica", tarjetaForma: "1" }), true), pagoParaEnvio(ui({ tipo: "99", descripcion: "Canje comercial" }), true)], [{ tipo: 2, cheque: { numero: "9", banco: "Banco Atlas" } }, { tipo: 3, tarjeta: { denominacion: 99, formaProcesamiento: 1, descripcion: "Unica" } }, { tipo: 99, descripcion: "Canje comercial" }]);
  igual("pendientesPagos (misma regla que el servidor): exacto → sin pendientes; faltante → mensaje; cheque incompleto → mensaje; sin pagos → mensaje", [
    pendientesPagos([{ tipo: 1, monto: "20000" }, { tipo: 5, monto: "13000" }], parseDec("33000", 8)!, 1), pendientesPagos([{ tipo: 1, monto: "20000" }, { tipo: 5, monto: "12000" }], parseDec("33000", 8)!, 1).length,
    pendientesPagos([{ tipo: 2 }], parseDec("33000", 8)!, 1).length > 0, pendientesPagos([], B(1), 1),
  ], [[], 1, true, ["Indique la forma de pago."]]);

  const pagina = leer("app/(private)/facturas/nueva/page.tsx");
  const medios = leer("app/(private)/facturas/nueva/medios-pago.tsx");
  cierto("pantalla: selector de medios con monto por medio, campos condicionales (cheque, tarjeta, otro), agregar/quitar y suma visible; sin campos de número de tarjeta ni CVV", /Agregar otro medio de pago/.test(medios) && /N° de cheque/.test(medios) && /Marca de la tarjeta/.test(medios) && /Forma de procesamiento/.test(medios) && /Suma de los pagos/.test(medios) && !/cvv|código de seguridad<\/span>|N° de tarjeta|Número de la tarjeta<\/span>/i.test(medios.replace("ni el código de seguridad", "")));
  cierto("pantalla: el cuerpo envía pagoParaEnvio por medio (y vacío en Crédito sin entrega); los pendientes de pago bloquean «Revisar»; todo dentro de la tarjeta Operación (layout aprobado)", /pagos: hayPagos \? pagos\.map\(\(p\) => pagoParaEnvio\(p, pagos\.length === 1\)\) : \[\]/.test(pagina) && /pendientesDePagos\.length > 0 \? "corregir los medios de pago"/.test(pagina) && pagina.indexOf("<MediosPago") > pagina.indexOf('aria-labelledby="sec-operacion"') && pagina.indexOf("<MediosPago") < pagina.indexOf('aria-labelledby="sec-cliente"'));
  cierto("límites de la etapa: moneda PYG fija en el payload, Cuotas suspendido, FAT-E1/FAT-E2 y gateway sin dependencia de los medios de pago", /cMoneTiPag: "PYG"/.test(leer("lib/facturacion/payload-fe.ts")) && !/pagos/.test(leer("lib/facturacion/calculo.ts")) && !/from "@\/lib\/facturacion\/pagos"/.test(leer("lib/facturacion/envio.ts") + leer("lib/facturacion/gateway.ts") + leer("lib/facturacion/reconciliacion.ts")) && !/from "pg"|fetch\(|node:fs/.test(leer("lib/facturacion/pagos.ts")));

  return fallos;
}
