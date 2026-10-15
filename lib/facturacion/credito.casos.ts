/**
 * MFE-B1 — Crédito, Plazo y Cuotas (MT v150 E601, E640–E654). Sin red y sin PostgreSQL: base simulada que responde por el texto de cada consulta. Se prueba la lógica pura
 * (forma, reparto, conciliación exacta, fechas), lo que llega al payload inmutable (nombres y tipos del MT), que Contado/Efectivo no cambie, que un error no reserve número y la
 * estructura de la pantalla. NINGUNA migración fue necesaria (el payload inmutable ya es el snapshot) y nada se ejecutó en PostgreSQL ni en el gateway.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { creditoParaEnvio, CREDITO_UI_VACIO, erroresCredito, fechaValida, hoyParaguay, leerCredito, pendientesCredito, plazoTexto, repartirCuotas, sumarDias } from "@/lib/facturacion/credito";
import { B, parseDec, S } from "@/lib/facturacion/calculo";
import { crearFacturaElectronica, leerCuerpoFactura, prepararFactura } from "@/lib/facturacion/emision";
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
const FUTURO = (n: number) => `2099-0${n}-10`;

type Llamada = { sql: string; parametros: unknown[] };

let productoActual: Record<string, unknown> = producto;
let permisosActuales: string[] = [];

function baseSimulada() {
  const llamadas: Llamada[] = [];
  const db = {
    async query(sql: string, parametros: unknown[] = []) {
      llamadas.push({ sql, parametros });
      if (/usuario_tiene_permiso/.test(sql)) {
        const lit = /'([A-Z_]+)',\s*'([A-Z_]+)'\)/.exec(sql);
        const codigo = parametros.length >= 4 ? `${String(parametros[2])}.${String(parametros[3])}` : lit ? `${lit[1]}.${lit[2]}` : "";

        return { rows: [{ ok: permisosActuales.includes(codigo) }], rowCount: 1 };
      }
      if (/FROM unidades_medida_sifen WHERE codigo = ANY/.test(sql)) return { rows: [{ codigo: 83, representacion: "kg", vigente: true }], rowCount: 1 };
      if (/FROM clientes c\s+LEFT JOIN LATERAL/.test(sql)) return { rows: [filaCliente], rowCount: 1 };
      if (/SELECT c\.id, c\.naturaleza_receptor/.test(sql)) return { rows: [{ ...filaCliente, id: CLIENTE, tipo_persona: "JURIDICA", tipo_documento: "RUC", pais_codigo: "PRY" }], rowCount: 1 };
      if (/FROM direcciones_cliente/.test(sql)) return { rows: [{ cliente_id: CLIENTE, direccion: "Calle 1", numero_casa: "123", departamento_codigo: "1", distrito_codigo: "1", ciudad_codigo: "1", pais_codigo: "PRY" }], rowCount: 1 };
      if (/FROM referencia_geografica_paises/.test(sql)) return { rows: [{ codigo: "PRY" }], rowCount: 1 };
      if (/FROM sucursales sc JOIN empresas e/.test(sql)) return { rows: [{ empresa: "EMPRESA SINTETICA", sucursal: "Casa Central", establecimiento: "001", punto: "002", puntoNombre: "Punto 002" }], rowCount: 1 };
      if (/FROM productos p/.test(sql)) return { rows: [productoActual], rowCount: 1 };
      if (/fe_documento_crear_fe/.test(sql)) return { rows: [{ documentoId: DOC, numero: "0050000", reutilizado: false }], rowCount: 1 };

      return { rows: [], rowCount: 0 };
    },
  };

  return { db: db as never, llamadas, creaciones: () => llamadas.filter((l) => /fe_documento_crear_fe/.test(l.sql)), escrituras: () => llamadas.filter((l) => /INSERT INTO|UPDATE |DELETE FROM|fe_documento_crear_fe/.test(l.sql)) };
}

const cuerpo = (extra: Record<string, unknown> = {}, cantidad = "3") => ({ claveIdempotencia: "clave-de-prueba-0001", sucursalId: SUC, puntoId: PUNTO, clienteId: CLIENTE, tipoTransaccion: 1, presencia: 1, pagos: [{ tipo: 1 }], infoAdicional: "", lineas: [{ productoId: PRODUCTO, cantidad }], ...extra });

const leerCreditoTodo = (c: number, x: unknown) => leerCredito(c, x, true);

export async function verificarCasosCredito(): Promise<string[]> {
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
  const entrada = (extra: Partial<EntradaFE> = {}): EntradaFE => ({ moneda: "PYG", tipoTransaccion: 1, presencia: 1, condicion: 1, pagos: [{ tipo: 1, monto: "33000" }], infoAdicional: "", receptor, lineas: [{ codigoInterno: "P-1", gtin: null, descripcion: "Producto", unidadSifen: 77, cantidad: "3", precio: "11000", afectacion: 1, tasa: 10, proporcion: null }], ...extra });
  const payload = (e: EntradaFE) => construirPayloadFE(e, HOY) as Record<string, unknown> & { FormaPago: Array<Record<string, unknown>>; Cuotas: Array<Record<string, unknown>>; Subtotales: Array<Record<string, number>> };
  const errores = (e: EntradaFE) => validarEntradaFE(e, HOY);
  const cuotas3 = [{ monto: "11000", vencimiento: FUTURO(1) }, { monto: "11000", vencimiento: FUTURO(2) }, { monto: "11000", vencimiento: FUTURO(3) }];
  const aCredito = (c: EntradaFE["credito"], pagos: EntradaFE["pagos"] = []) => entrada({ condicion: 2, pagos, credito: c });

  // ── 1. Forma del cuerpo (leerCredito) ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  igual("Contado sin crédito → undefined; Contado + crédito → error", [leerCredito(1, undefined), leerCredito(1, null), typeof leerCredito(1, { tipo: 1, plazoDias: 30 })], [undefined, undefined, "string"]);
  igual("Crédito sin datos → error", typeof leerCredito(2, undefined), "string");
  igual("Plazo válido", leerCredito(2, { tipo: 1, plazoDias: 30 }), { tipo: 1, plazoDias: 30, cuotas: [], entrega: null });
  igual("Plazo con cuotas, sin días, 0, fraccionario o enorme → error", [{ tipo: 1, plazoDias: 30, cuotas: [{ monto: "1", vencimiento: "2099-01-01" }] }, { tipo: 1 }, { tipo: 1, plazoDias: 0 }, { tipo: 1, plazoDias: 1.5 }, { tipo: 1, plazoDias: 10000 }, { tipo: 1, plazoDias: "30" }].map((c) => typeof leerCredito(2, c)), ["string", "string", "string", "string", "string", "string"]);
  igual("Cuotas válidas", leerCreditoTodo(2, { tipo: 2, cuotas: cuotas3 }), { tipo: 2, plazoDias: null, cuotas: cuotas3, entrega: null });
  igual("Cuotas con plazo, vacías, sin fecha o con campo extra → error", [{ tipo: 2, plazoDias: 30, cuotas: cuotas3 }, { tipo: 2, cuotas: [] }, { tipo: 2 }, { tipo: 2, cuotas: [{ monto: "1" }] }, { tipo: 2, cuotas: [{ monto: "1", vencimiento: "2099-01-01", extra: 1 }] }, { tipo: 3, cuotas: cuotas3 }, { tipo: 2, cuotas: cuotas3, otro: 1 }].map((c) => typeof leerCreditoTodo(2, c)), ["string", "string", "string", "string", "string", "string", "string"]);
  igual("Entrega: texto válido se conserva; cero equivale a sin entrega; inválida → error", [leerCredito(2, { tipo: 1, plazoDias: 30, entrega: "5000" }), leerCredito(2, { tipo: 1, plazoDias: 30, entrega: "0" }), leerCredito(2, { tipo: 1, plazoDias: 30, entrega: "" }), typeof leerCredito(2, { tipo: 1, plazoDias: 30, entrega: "-5" }), typeof leerCredito(2, { tipo: 1, plazoDias: 30, entrega: "1.23456" })], [{ tipo: 1, plazoDias: 30, cuotas: [], entrega: "5000" }, { tipo: 1, plazoDias: 30, cuotas: [], entrega: null }, { tipo: 1, plazoDias: 30, cuotas: [], entrega: null }, "string", "string"]);
  igual("leerCuerpoFactura: sin condición = Contado (compatibilidad); condición inválida o Contado con crédito → error; Crédito válido se conserva", [
    (leerCuerpoFactura(cuerpo()) as { condicion: number }).condicion,
    typeof leerCuerpoFactura(cuerpo({ condicion: 3 })),
    typeof leerCuerpoFactura(cuerpo({ condicion: 1, credito: { tipo: 1, plazoDias: 30 } })),
    typeof leerCuerpoFactura(cuerpo({ condicion: 2 })),
    (leerCuerpoFactura(cuerpo({ condicion: 2, credito: { tipo: 1, plazoDias: 30 } })) as { condicion: number }).condicion,
  ], [1, "string", "string", "string", 2]);

  // ── 2. Texto del plazo, fechas y reparto ──────────────────────────────────────────────────────────────────────────────────────────────────────
  igual("E643 dPlazoCre: «N días» (2–15 caracteres)", [plazoTexto(30), plazoTexto(1), plazoTexto(9999)], ["30 días", "1 día", "9999 días"]);
  cierto("E643 siempre entre 2 y 15 caracteres para 1..9999 días", [1, 2, 30, 365, 9999].every((d) => plazoTexto(d).length >= 2 && plazoTexto(d).length <= 15));
  igual("fechas: reales, no inventadas", [fechaValida("2026-10-15"), fechaValida("2026-02-30"), fechaValida("2026-13-01"), fechaValida("26-10-15"), fechaValida("2028-02-29"), fechaValida("2027-02-29")], [true, false, false, false, true, false]);
  igual("sumarDias cruza mes y año", [sumarDias("2026-12-20", 30), sumarDias("2026-01-31", 1)], ["2027-01-19", "2026-02-01"]);
  igual("hoyParaguay: fecha civil AAAA-MM-DD", /^\d{4}-\d{2}-\d{2}$/.test(hoyParaguay()), true);
  igual("hoyParaguay: UTC-3 (02:00 UTC del 16 sigue siendo el 15 en Paraguay)", hoyParaguay(new Date("2026-10-16T02:00:00Z")), "2026-10-15");
  igual("repartirCuotas: 3 cuotas de 33.000 → iguales", repartirCuotas("33000", 3, "2099-01-10", 30).map((c) => c.monto), ["11000", "11000", "11000"]);
  igual("repartirCuotas: la diferencia de la división va a la última y suma EXACTA", (() => { const c = repartirCuotas("10000", 3, "2099-01-10", 30); return [c.map((x) => x.monto), c.reduce((a, x) => a + dec(x.monto), B(0)) === dec("10000")]; })(), [["3333", "3333", "3334"], true]);
  igual("repartirCuotas: saldo con decimales trabaja en diezmilésimas y suma exacta", (() => { const c = repartirCuotas("100.0001", 3, "2099-01-10", 30); return c.reduce((a, x) => a + dec(x.monto), B(0)) === dec("100.0001"); })(), true);
  igual("repartirCuotas: vencimientos cada N días, estrictamente crecientes", repartirCuotas("30000", 3, "2099-01-10", 30).map((c) => c.vencimiento), ["2099-01-10", "2099-02-09", "2099-03-11"]);
  igual("repartirCuotas: entradas inválidas → sin cuotas", [repartirCuotas("0", 3, "2099-01-10", 30), repartirCuotas("100", 0, "2099-01-10", 30), repartirCuotas("100", 3, "2099-13-10", 30), repartirCuotas("2", 3, "2099-01-10", 30)], [[], [], [], []]);

  // ── 3. Conciliación exacta y fechas (erroresCredito) ──────────────────────────────────────────────────────────────────────────────────────────
  const total = dec("33000");
  const ok = { tipo: 2 as const, plazoDias: null, cuotas: cuotas3 };
  igual("CA-04: 3 cuotas que suman el total → sin errores", erroresCredito(ok, total, B(0), HOY), []);
  igual("CA-05: la suma no coincide → error con ambos montos", erroresCredito({ ...ok, cuotas: [cuotas3[0], cuotas3[1], { ...cuotas3[2], monto: "10999" }] }, total, B(0), HOY).some((m) => /suma de las cuotas \(32999\).*\(33000\)/.test(m)), true);
  igual("cuota de 0, negativa o con 5 decimales → error", [{ monto: "0" }, { monto: "-1" }, { monto: "1.23456" }, { monto: "abc" }].map((x) => erroresCredito({ ...ok, cuotas: [{ ...cuotas3[0], ...x }, cuotas3[1], cuotas3[2]] }, total, B(0), HOY).length > 0), [true, true, true, true]);
  igual("CA-05: fecha imposible, pasada o no creciente → error", [
    erroresCredito({ ...ok, cuotas: [{ ...cuotas3[0], vencimiento: "2099-02-30" }, cuotas3[1], cuotas3[2]] }, total, B(0), HOY).some((m) => /no es válida/.test(m)),
    erroresCredito({ ...ok, cuotas: [{ ...cuotas3[0], vencimiento: "2020-01-01" }, cuotas3[1], cuotas3[2]] }, total, B(0), HOY).some((m) => /anterior a hoy/.test(m)),
    erroresCredito({ ...ok, cuotas: [cuotas3[1], cuotas3[0], cuotas3[2]] }, total, B(0), HOY).some((m) => /posterior al de la cuota anterior/.test(m)),
    erroresCredito({ ...ok, cuotas: [cuotas3[0], cuotas3[0], cuotas3[2]] }, total, B(0), HOY).some((m) => /posterior al de la cuota anterior/.test(m)),
  ], [true, true, true, true]);
  igual("vencimiento HOY es válido (no vencido)", erroresCredito({ tipo: 2, plazoDias: null, cuotas: [{ monto: "33000", vencimiento: HOY }] }, total, B(0), HOY), []);
  igual("Plazo válido; plazo 0 o fraccionario → error", [erroresCredito({ tipo: 1, plazoDias: 30, cuotas: [] }, total, B(0), HOY), erroresCredito({ tipo: 1, plazoDias: 0, cuotas: [] }, total, B(0), HOY).length > 0, erroresCredito({ tipo: 1, plazoDias: 2.5, cuotas: [] }, total, B(0), HOY).length > 0], [[], true, true]);
  igual("CA-07: entrega + cuotas = total; la entrega se descuenta del saldo", erroresCredito({ ...ok, cuotas: [{ monto: "14000", vencimiento: FUTURO(1) }, { monto: "14000", vencimiento: FUTURO(2) }] }, total, dec("5000"), HOY), []);
  igual("CA-07: cuotas por el total completo con entrega → se cuenta dos veces → error", erroresCredito(ok, total, dec("5000"), HOY).some((m) => /saldo a financiar \(28000\)/.test(m)), true);
  igual("entrega igual o mayor al total → error (es Contado)", [erroresCredito(ok, total, total, HOY).length > 0, erroresCredito(ok, total, dec("40000"), HOY).length > 0], [true, true]);
  igual("1 cuota (mínimo) y 999 cuotas (máximo) son admisibles; 1000 no", [erroresCredito({ tipo: 2, plazoDias: null, cuotas: [{ monto: "33000", vencimiento: FUTURO(1) }] }, total, B(0), HOY), leerCreditoTodo(2, { tipo: 2, cuotas: Array.from({ length: 999 }, (_, i) => ({ monto: "1", vencimiento: sumarDias("2099-01-01", i) })) }) !== undefined && typeof leerCreditoTodo(2, { tipo: 2, cuotas: Array.from({ length: 999 }, () => ({ monto: "1", vencimiento: "2099-01-01" })) }) !== "string", typeof leerCreditoTodo(2, { tipo: 2, cuotas: Array.from({ length: 1000 }, () => ({ monto: "1", vencimiento: "2099-01-01" })) })], [[], true, "string"]);

  // ── 4. Payload FE: nombres y tipos del MT; Contado idéntico al baseline ───────────────────────────────────────────────────────────────────────
  const pc = payload(entrada());
  igual("CA-01 baseline Contado/Efectivo: iCondOpe 1, sin crédito (nulos y Cuotas vacío), SIN dMonEnt, un FormaPago por el total", [pc.iCondOpe, pc.iCondCred, pc.dPlazoCre, pc.dCuotas, pc.Cuotas, "dMonEnt" in pc, pc.FormaPago], [1, null, null, null, [], false, [{ iTiPago: 1, dMonTiPag: 33000, cMoneTiPag: "PYG", dTiCamTiPag: null }]]);
  const pp = payload(aCredito({ tipo: 1, plazoDias: 30, cuotas: [], entrega: null }));
  igual("CA-03 Crédito Plazo 30 días: E601=2, E641=1, E643=«30 días»; sin dCuotas ni Cuotas; sin FormaPago (sin entrega); dMonEnt nulo", [pp.iCondOpe, pp.iCondCred, pp.dPlazoCre, pp.dCuotas, pp.Cuotas, pp.FormaPago, pp.dMonEnt], [2, 1, "30 días", null, [], [], null]);
  const pq = payload(aCredito({ tipo: 2, plazoDias: null, cuotas: cuotas3, entrega: null }));
  igual("CA-04 Crédito 3 cuotas: E601=2, E641=2, E644=3 (= filas), sin dPlazoCre; Cuotas[] con cMoneCuo (A), dMonCuota (N) y dVencCuo (AAAA-MM-DD)", [pq.iCondOpe, pq.iCondCred, pq.dPlazoCre, pq.dCuotas, pq.Cuotas.length, pq.Cuotas[0], pq.FormaPago], [2, 2, null, 3, 3, { cMoneCuo: "PYG", dMonCuota: 11000, dVencCuo: FUTURO(1) }, []]);
  igual("tipos JSON de Cuotas[]: moneda texto, monto número, vencimiento texto con formato oficial", pq.Cuotas.every((c) => typeof c.cMoneCuo === "string" && typeof c.dMonCuota === "number" && typeof c.dVencCuo === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.dVencCuo as string)), true);
  igual("CA-04: Σ cuotas = dTotGralOpe", pq.Cuotas.reduce((a, c) => a + (c.dMonCuota as number), 0), pq.Subtotales[0].dTotGralOpe);
  const pe = payload(aCredito({ tipo: 2, plazoDias: null, cuotas: [{ monto: "14000", vencimiento: FUTURO(1) }, { monto: "14000", vencimiento: FUTURO(2) }], entrega: "5000" }, [{ tipo: 1, monto: "5000" }]));
  igual("CA-07 Crédito con entrega: E645 dMonEnt = 5000, E605 un solo pago de 5000 (no el total), cuotas = saldo; nada se cuenta dos veces", [pe.dMonEnt, pe.FormaPago, pe.Cuotas.length, pe.FormaPago.reduce((a, p) => a + (p.dMonTiPag as number), 0) + pe.Cuotas.reduce((a, c) => a + (c.dMonCuota as number), 0) === pe.Subtotales[0].dTotGralOpe], [5000, [{ iTiPago: 1, dMonTiPag: 5000, cMoneTiPag: "PYG", dTiCamTiPag: null }], 2, true]);
  const ppe = payload(aCredito({ tipo: 1, plazoDias: 45, cuotas: [], entrega: "3000" }, [{ tipo: 1, monto: "3000" }]));
  igual("Plazo con entrega: dMonEnt y E605 coinciden, dPlazoCre «45 días»", [ppe.dMonEnt, ppe.FormaPago.map((p) => p.dMonTiPag), ppe.dPlazoCre], [3000, [3000], "45 días"]);
  igual("el crédito no altera cálculos: subtotales, IVA y detalles idénticos al Contado", [JSON.stringify(pq.Subtotales), JSON.stringify(pq.Detalles)], [JSON.stringify(pc.Subtotales), JSON.stringify(pc.Detalles)]);
  igual("CA-06 volver a Contado: el payload no conserva rastro del crédito", JSON.stringify(payload(entrada({ condicion: 1 }))), JSON.stringify(pc));
  igual("el payload de crédito sigue siendo determinista (misma entrada → mismo JSON)", JSON.stringify(payload(aCredito({ tipo: 2, plazoDias: null, cuotas: cuotas3, entrega: null }))), JSON.stringify(pq));

  // ── 5. Validación fiscal de la entrada ────────────────────────────────────────────────────────────────────────────────────────────────────
  igual("condición 3 → error; Contado con crédito → error; Crédito sin crédito → error", [errores(entrada({ condicion: 3 })).some((m) => /Contado o Crédito/.test(m)), errores(entrada({ credito: { tipo: 1, plazoDias: 30, cuotas: [], entrega: null } })).some((m) => /no lleva datos de crédito/.test(m)), errores(entrada({ condicion: 2, pagos: [] })).some((m) => /condiciones del crédito/.test(m))], [true, true, true]);
  igual("Crédito válido sin errores (Plazo, Cuotas, con entrega)", [errores(aCredito({ tipo: 1, plazoDias: 30, cuotas: [], entrega: null })), errores(aCredito({ tipo: 2, plazoDias: null, cuotas: cuotas3, entrega: null })), errores(aCredito({ tipo: 2, plazoDias: null, cuotas: [{ monto: "14000", vencimiento: FUTURO(1) }, { monto: "14000", vencimiento: FUTURO(2) }], entrega: "5000" }, [{ tipo: 1, monto: "5000" }]))], [[], [], []]);
  igual("Crédito: la entrega que llega por pagos se concilia (entrega ≥ total → error)", errores(aCredito({ tipo: 1, plazoDias: 30, cuotas: [], entrega: "33000" }, [{ tipo: 1, monto: "33000" }])).some((m) => /menor que el total/.test(m)), true);
  igual("Crédito: pago con forma inválida o monto no positivo → error (la entrega usa las mismas reglas de pago)", [errores(aCredito({ tipo: 1, plazoDias: 30, cuotas: [], entrega: "100" }, [{ tipo: 77, monto: "100" }])).length > 0, errores(aCredito({ tipo: 1, plazoDias: 30, cuotas: [], entrega: "0" }, [{ tipo: 1, monto: "0" }])).length > 0], [true, true]);
  igual("validarEntradaFE no recibe un crédito ignorado: las cuotas inválidas bloquean construirPayloadFE", (() => { try { construirPayloadFE(aCredito({ tipo: 2, plazoDias: null, cuotas: [cuotas3[0]], entrega: null }), HOY); return "OK"; } catch { return "bloqueado"; } })(), "bloqueado");

  // ── 6. Servidor: prepararFactura / crearFacturaElectronica con base simulada ──────────────────────────────────────────────────────────────────
  const prep = async (extra: Record<string, unknown>) => { const b = baseSimulada(); const c = leerCuerpoFactura(cuerpo(extra)); return { b, r: typeof c === "string" ? c : await prepararFactura(b.db, EMPRESA, USUARIO, c) }; };
  const creaP = async (extra: Record<string, unknown>) => { const b = baseSimulada(); const c = leerCuerpoFactura(cuerpo(extra)); if (typeof c === "string") return { b, e: c }; const e = await resultado(crearFacturaElectronica(b.db, EMPRESA, USUARIO, c)); return { b, e }; };

  const rContado = await prep({});
  igual("CA-01 servidor Contado/Efectivo: condición «Contado», forma de pago Efectivo, sin bloque de crédito, sin escrituras", [(rContado.r as unknown as { resumen: { condicion: string; formaPago: string; credito?: unknown } }).resumen.condicion, (rContado.r as unknown as { resumen: { formaPago: string } }).resumen.formaPago, "credito" in (rContado.r as unknown as { resumen: object }).resumen, rContado.b.escrituras().length], ["Contado", "Efectivo", false, 0]);
  const rPlazo = await prep({ condicion: 2, credito: { tipo: 1, plazoDias: 30 } });
  const resP = (rPlazo.r as unknown as { resumen: { condicion: string; formaPago: string; credito: { tipo: string; plazo: string; entrega: string; saldo: string; cuotas: unknown[] } }; entrada: EntradaFE; payload: { iCondOpe: number } }).resumen;
  igual("previa Crédito/Plazo: condición Crédito, plazo «30 días», saldo = total, sin entrega ni forma de pago, sin escrituras", [resP.condicion, resP.credito.tipo, resP.credito.plazo, resP.credito.saldo, resP.credito.entrega, resP.formaPago, rPlazo.b.escrituras().length], ["Crédito", "Plazo", "30 días", "33000", "0", "", 0]);
  const rCuotas = await prep({ condicion: 2, credito: { tipo: 2, cuotas: cuotas3 } });
  igual("CORE-04 Cuotas suspendido: la lectura del cuerpo lo rechaza con mensaje dirigido y no toca la base", [typeof rCuotas.r === "string" && /suspendido/.test(rCuotas.r), rCuotas.b.llamadas.length], [true, 0]);
  const rEntrega = await prep({ condicion: 2, credito: { tipo: 1, plazoDias: 60, entrega: "5000" } });
  const resE = (rEntrega.r as unknown as { resumen: { formaPago: string; credito: { entrega: string; saldo: string } }; payload: { dMonEnt: number; FormaPago: unknown[] } });
  igual("previa Crédito con entrega: entrega 5000, saldo 28000, forma de pago de la entrega, payload coherente", [resE.resumen.credito.entrega, resE.resumen.credito.saldo, resE.resumen.formaPago, resE.payload.dMonEnt, resE.payload.FormaPago.length], ["5000", "28000", "Efectivo", 5000, 1]);

  // CA-05: errores no reservan número (no llega a fe_documento_crear_fe) y devuelven 422 con el motivo exacto
  const bloqueo = baseSimulada();
  const cuerpoCuotas = { ...(leerCuerpoFactura(cuerpo()) as object), condicion: 2, credito: { tipo: 2, plazoDias: null, cuotas: cuotas3, entrega: null } } as never;
  const malSuma = { e: await resultado(prepararFactura(bloqueo.db, EMPRESA, USUARIO, cuerpoCuotas)), b: bloqueo };
  const creadoCuotas = baseSimulada();
  const malFecha = { e: await resultado(crearFacturaElectronica(creadoCuotas.db, EMPRESA, USUARIO, cuerpoCuotas)), b: creadoCuotas };
  igual("CORE-04 POST directo con Cuotas (sin pasar por la lectura): 422 dirigido, sin una sola consulta y SIN reservar número (ninguna llamada a fe_documento_crear_fe)", [/^422:.*suspendido/.test(malSuma.e), malSuma.b.llamadas.length, /^422:.*suspendido/.test(malFecha.e), malFecha.b.creaciones().length, malFecha.b.llamadas.length], [true, 0, true, 0, 0]);


  const malEntrega = await creaP({ condicion: 2, credito: { tipo: 1, plazoDias: 30, entrega: "33000" } });
  igual("entrega = total: 422 y sin número", [/^422:.*menor que el total/.test(malEntrega.e), malEntrega.b.creaciones().length], [true, 0]);
  igual("crédito malformado en el cuerpo: se rechaza en la lectura (400) antes de tocar la base", [typeof leerCuerpoFactura(cuerpo({ condicion: 2, credito: { tipo: 2, cuotas: [] } })), typeof leerCuerpoFactura(cuerpo({ condicion: 1, credito: { tipo: 2, cuotas: cuotas3 } }))], ["string", "string"]);

  // Emisión: el payload inmutable lleva el crédito y el total coincide; la huella distingue contado, plazo y cuotas (idempotencia)
  const eContado = await creaP({});
  const ePlazo = await creaP({ condicion: 2, credito: { tipo: 1, plazoDias: 30 } });
  const eCuotas = await creaP({ condicion: 2, credito: { tipo: 1, plazoDias: 60 } });
  const eCuotas2 = await creaP({ condicion: 2, credito: { tipo: 1, plazoDias: 60 } });
  const par = (x: { b: ReturnType<typeof baseSimulada> }) => x.b.creaciones()[0].parametros;
  igual("emisión: Contado, Plazo 30 y Plazo 60 crean exactamente un documento cada uno", [eContado.e, ePlazo.e, eCuotas.e, [eContado, ePlazo, eCuotas].map((x) => x.b.creaciones().length)], ["OK", "OK", "OK", [1, 1, 1]]);
  igual("emisión Plazo 60: el payload guardado lleva iCondOpe 2, iCondCred 1, «60 días», sin cuotas, y p_total = dTotGralOpe", (() => { const p = JSON.parse(String(par(eCuotas)[9])) as { iCondOpe: number; iCondCred: number; dPlazoCre: string; dCuotas: unknown; Cuotas: unknown[]; Subtotales: Array<{ dTotGralOpe: number }> }; return [p.iCondOpe, p.iCondCred, p.dPlazoCre, p.dCuotas, p.Cuotas.length, String(p.Subtotales[0].dTotGralOpe) === String(par(eCuotas)[8])]; })(), [2, 1, "60 días", null, 0, true]);
  igual("idempotencia: misma operación → mismo payload (misma huella); Contado, Plazo 30 y Plazo 60 → payloads distintos (la misma clave con otro contenido conflictúa en SQL)", [par(eCuotas)[9] === par(eCuotas2)[9], new Set([par(eContado)[9], par(ePlazo)[9], par(eCuotas)[9]]).size], [true, 3]);
  igual("emisión Contado: payload byte a byte el del baseline (sin dMonEnt, mismo FormaPago)", (() => { const p = JSON.parse(String(par(eContado)[9])) as Record<string, unknown>; return [p.iCondOpe, p.iCondCred, p.dPlazoCre, p.dCuotas, p.Cuotas, "dMonEnt" in p, p.FormaPago]; })(), [1, null, null, null, [], false, [{ iTiPago: 1, dMonTiPag: 33000, cMoneTiPag: "PYG", dTiCamTiPag: null }]]);
  igual("aislamiento y permisos intactos: el crédito no agrega consultas ni permisos nuevos (mismas consultas que Contado)", [eContado, ePlazo, eCuotas].map((x) => x.b.llamadas.map((l) => l.sql.replace(/\s+/g, " ").slice(0, 40)).join("|")).every((s, _, a) => s === a[0]), true);

  // ── 6-bis. P0 (MFE-03): producto incompleto completado en la propia factura; Plazo 30/60/90 ───────────────────────────────────────────────────
  const incompleto = { ...producto, unidadSifen: null, unidadSimbolo: null, unidadVigente: null, afectacion: null, tasa: null, precio: null, monedaPrecio: null };
  const conProducto = async <T>(p: Record<string, unknown>, permisos: string[], f: () => Promise<T>): Promise<T> => { const a = [productoActual, permisosActuales] as const; productoActual = p; permisosActuales = permisos; try { return await f(); } finally { productoActual = a[0]; permisosActuales = a[1]; } };
  const emitir = async (extra: Record<string, unknown>, lineaExtra: Record<string, unknown> = {}) => { const b = baseSimulada(); const c = leerCuerpoFactura(cuerpo({ ...extra, lineas: [{ productoId: PRODUCTO, cantidad: "2", ...lineaExtra }] })); return { b, e: typeof c === "string" ? c : await resultado(crearFacturaElectronica(b.db, EMPRESA, USUARIO, c)) }; };
  const completo = { ajuste: { unidadSifen: 83, afectacion: 1, tasa: 10, proporcion: null }, precio: "5000" };
  const sinAjuste = await conProducto(incompleto, [], () => emitir({}));
  igual("CORE-01 producto incompleto SIN completar: 422 antes de la secuencia (ninguna llamada a fe_documento_crear_fe)", [/^422:/.test(sinAjuste.e), sinAjuste.b.creaciones().length], [true, 0]);
  const sinPermiso = await conProducto(incompleto, [], () => emitir({}, completo));
  igual("CORE-01 completar en la factura exige AJUSTE_FISCAL: 403 y sin número", [/^403:.*AJUSTE_FISCAL/.test(sinPermiso.e), sinPermiso.b.creaciones().length], [true, 0]);
  const sinPrecio = await conProducto(incompleto, ["FACTURACION_ELECTRONICA.AJUSTE_FISCAL"], () => emitir({}, completo));
  igual("CORE-01 el precio de un producto sin precio de lista exige FACTURACION_ELECTRONICA.PRECIO: 403 y sin número", [/^403:.*precio/.test(sinPrecio.e), sinPrecio.b.creaciones().length], [true, 0]);
  const parcial = await conProducto(incompleto, ["FACTURACION_ELECTRONICA.AJUSTE_FISCAL", "FACTURACION_ELECTRONICA.PRECIO"], () => emitir({}, { ajuste: { unidadSifen: 83 }, precio: "5000" }));
  igual("CORE-01 completar solo la unidad (falta IVA): sigue bloqueado, sin número", [/^422:.*IVA/.test(parcial.e), parcial.b.creaciones().length], [true, 0]);
  const completado = await conProducto(incompleto, ["FACTURACION_ELECTRONICA.AJUSTE_FISCAL", "FACTURACION_ELECTRONICA.PRECIO"], () => emitir({}, completo));
  igual("CORE-01 completado en la misma línea (unidad, IVA, precio) con los permisos vigentes: se crea el documento y el payload lleva lo completado", [completado.e, completado.b.creaciones().length, (() => { const p = JSON.parse(String(completado.b.creaciones()[0].parametros[9])) as { Detalles: Array<Record<string, unknown>> }; return [p.Detalles[0].cUniMed, p.Detalles[0].iAfecIVA, p.Detalles[0].dTasaIVA, p.Detalles[0].dPUniProSer]; })()], ["OK", 1, [83, 1, 10, 5000]]);
  igual("CORE-02 «Solo esta factura»: Productos NO se modifica (la única escritura es el documento; ni UPDATE ni bitácora)", completado.b.escrituras().map((l) => (/fe_documento_crear_fe/.test(l.sql) ? "documento" : l.sql.slice(0, 30))), ["documento"]);
  for (const dias of [30, 60, 90]) {
    const r = await emitir({ condicion: 2, credito: { tipo: 1, plazoDias: dias } });
    const p = JSON.parse(String(r.b.creaciones()[0]?.parametros[9] ?? "{}")) as Record<string, unknown>;
    igual(`CORE-03 Crédito a Plazo de ${dias} días: iCondOpe 2, iCondCred 1, dPlazoCre «${dias} días», sin Cuotas ni pago (sin entrega)`, [r.e, p.iCondOpe, p.iCondCred, p.dPlazoCre, p.dCuotas, p.Cuotas, p.FormaPago], ["OK", 2, 1, `${dias} días`, null, [], []]);
  }
  const ent = await emitir({ condicion: 2, credito: { tipo: 1, plazoDias: 30, entrega: "6000" } });
  const pent = JSON.parse(String(ent.b.creaciones()[0]?.parametros[9] ?? "{}")) as { dMonEnt: number; FormaPago: Array<{ iTiPago: number; dMonTiPag: number }> };
  igual("CORE-03 Crédito con entrega inicial en Efectivo: dMonEnt = pago inicial < total (22000); el saldo financiado no se paga ahora", [ent.e, pent.dMonEnt, pent.FormaPago.map((x) => [x.iTiPago, x.dMonTiPag])], ["OK", 6000, [[1, 6000]]]);
  const entTotal = await emitir({ condicion: 2, credito: { tipo: 1, plazoDias: 30, entrega: "22000" } });
  igual("CORE-03 entrega igual al total: 422 (es Contado) y sin número", [/^422:.*menor que el total/.test(entTotal.e), entTotal.b.creaciones().length], [true, 0]);
  const aContado = await emitir({ condicion: 1 });
  const pcon = JSON.parse(String(aContado.b.creaciones()[0]?.parametros[9] ?? "{}")) as Record<string, unknown>;
  igual("CORE-03 volver a Contado: sin rastro de crédito en el payload (un FormaPago por el total)", [aContado.e, pcon.iCondOpe, pcon.iCondCred, pcon.dPlazoCre, "dMonEnt" in pcon, (pcon.FormaPago as Array<{ dMonTiPag: number }>)[0].dMonTiPag], ["OK", 1, null, null, false, 22000]);

  // ── 6-ter. AUD-MFE-P0-R01-01: precisión de los pagos (dMonTiPag / dMonEnt) — ningún valor cambia en silencio al serializarse ─────────────────────────
  const lineaGrande = (cantidad: string) => [{ codigoInterno: "P-1", gtin: null, descripcion: "Producto", unidadSifen: 77, cantidad, precio: "11000", afectacion: 1 as const, tasa: 10 as const, proporcion: null }];
  const PERDIDA = "782284262408.5882"; // 15 dígitos + 4 decimales: Number() lo escribe como 782284262408.5881 o similar
  igual("el valor del ejemplo no sobrevive a Number (la premisa de la auditoría)", String(Number(PERDIDA)) === PERDIDA, false);
  const msgPrecision = /perder precisión/;
  igual("Crédito a Plazo con entrega que Number alteraría: rechazado en la validación (antes de reservar numeración)", errores(entrada({ condicion: 2, lineas: lineaGrande("72727272.7273"), pagos: [{ tipo: 1, monto: PERDIDA }], credito: { tipo: 1, plazoDias: 30, cuotas: [], entrega: PERDIDA } })).some((m) => msgPrecision.test(m)), true);
  igual("Contado/Efectivo con un pago que Number alteraría: rechazado en la validación", errores(entrada({ lineas: lineaGrande("72727272.7273"), pagos: [{ tipo: 1, monto: PERDIDA }] })).some((m) => msgPrecision.test(m)), true);
  igual("dos pagos exactos cuya suma no es representable: rechazado (la suma = dMonEnt también debe ser exacta)", errores(entrada({ condicion: 2, lineas: lineaGrande("72727272.7273"), pagos: [{ tipo: 1, monto: "500000000000.0001" }, { tipo: 1, monto: "282284262408.5881" }], credito: { tipo: 1, plazoDias: 30, cuotas: [], entrega: "782284262408.5882" } })).some((m) => msgPrecision.test(m)), true);
  igual("construirPayloadFE nunca emite un JSON con un monto alterado: lanza en lugar de redondear o truncar", ((): string => { try { construirPayloadFE(entrada({ condicion: 2, lineas: lineaGrande("72727272.7273"), pagos: [{ tipo: 1, monto: PERDIDA }], credito: { tipo: 1, plazoDias: 30, cuotas: [], entrega: PERDIDA } }), HOY); return "OK"; } catch { return "bloqueado"; } })(), "bloqueado");
  // Servidor: el rechazo ocurre antes de fe_documento_crear_fe (sin numeración) y sin compensación artificial
  const grande = await conProducto({ ...producto, unidadSifen: 83, unidadSimbolo: "kg", precio: "11000" }, [], () => emitir({ condicion: 2, credito: { tipo: 1, plazoDias: 30, entrega: PERDIDA } }, { cantidad: "72727272.7273" }));
  igual("servidor, Crédito a Plazo con entrega no representable: 422 con motivo y SIN reservar número", [/^422:.*perder precisión/.test(grande.e), grande.b.creaciones().length], [true, 0]);
  const grandeContado = await conProducto({ ...producto, unidadSifen: 83, unidadSimbolo: "kg", precio: "11000" }, [], () => emitir({}, { cantidad: "72727272.7273" }));
  igual("servidor, Contado/Efectivo grande pero representable (pago = total exacto): se crea y el pago viaja con el valor exacto", [grandeContado.e, (() => { const p = JSON.parse(String(grandeContado.b.creaciones()[0]?.parametros[9] ?? "{}")) as { FormaPago: Array<{ dMonTiPag: number }>; Subtotales: Array<{ dTotGralOpe: number }> }; return [p.FormaPago[0].dMonTiPag === p.Subtotales[0].dTotGralOpe, String(p.FormaPago[0].dMonTiPag)]; })()], ["OK", [true, "800000000000.3"]]);
  // Límites de la precisión: valores EXACTOS en el borde siguen emitiéndose tal cual (sin redondeo, sin compensación)
  const limite = payload(entrada({ lineas: lineaGrande("90909090.9089"), pagos: [{ tipo: 1, monto: "999999999997.9" }] }));
  igual("límite: Contado con 12 enteros + 1 decimal exacto (999999999997.9) viaja sin cambio", [String(limite.FormaPago[0].dMonTiPag), String(limite.Subtotales[0].dTotGralOpe)], ["999999999997.9", "999999999997.9"]);
  const limite4 = payload({ ...aCredito({ tipo: 1, plazoDias: 30, cuotas: [], entrega: "99999999999.9999" }, [{ tipo: 1, monto: "99999999999.9999" }]), lineas: lineaGrande("90909090.9089") });
  igual("límite: entrega con 4 decimales exactos (11 enteros) viaja sin cambio en dMonEnt y FormaPago", [String(limite4.dMonEnt), String(limite4.FormaPago[0].dMonTiPag)], ["99999999999.9999", "99999999999.9999"]);
  igual("regresión: entrega pequeña de siempre intacta y sin cambios en subtotales", [payload(aCredito({ tipo: 1, plazoDias: 30, cuotas: [], entrega: "5000" }, [{ tipo: 1, monto: "5000" }])).dMonEnt, JSON.stringify(payload(aCredito({ tipo: 1, plazoDias: 30, cuotas: [], entrega: "5000" }, [{ tipo: 1, monto: "5000" }])).Subtotales) === JSON.stringify(pc.Subtotales)], [5000, true]);

  // ── 7. Pantalla (estado y cuerpo) ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  igual("creditoParaEnvio Plazo: solo plazo (+ entrega si hay)", [creditoParaEnvio({ ...CREDITO_UI_VACIO, tipo: "1", plazoDias: "45", entrega: " 5000 " }), creditoParaEnvio({ ...CREDITO_UI_VACIO, tipo: "1", plazoDias: "30" })], [{ tipo: 1, plazoDias: 45, entrega: "5000" }, { tipo: 1, plazoDias: 30 }]);
  igual("creditoParaEnvio Cuotas: solo cuotas, sin plazo", creditoParaEnvio({ ...CREDITO_UI_VACIO, tipo: "2", plazoDias: "30", cuotas: [{ monto: " 100 ", vencimiento: "2099-01-01" }] }), { tipo: 2, cuotas: [{ monto: "100", vencimiento: "2099-01-01" }] });
  igual("pendientesCredito (misma regla que el servidor): sin cuotas pide generarlas; cuotas que suman el saldo → sin pendientes; no suman → mensaje", [
    pendientesCredito({ ...CREDITO_UI_VACIO, tipo: "2" }, "33000", HOY),
    pendientesCredito({ ...CREDITO_UI_VACIO, tipo: "2", cuotas: cuotas3 }, "33000", HOY),
    pendientesCredito({ ...CREDITO_UI_VACIO, tipo: "2", cuotas: cuotas3 }, "34000", HOY).length,
    pendientesCredito({ ...CREDITO_UI_VACIO, tipo: "1", plazoDias: "30" }, "33000", HOY),
    pendientesCredito({ ...CREDITO_UI_VACIO, tipo: "1", plazoDias: "" }, "33000", HOY).length,
    pendientesCredito({ ...CREDITO_UI_VACIO, tipo: "1", plazoDias: "30", entrega: "40000" }, "33000", HOY).length,
  ], [["genere o cargue las cuotas del crédito"], [], 1, [], 1, 1]);

  const pagina = leer("app/(private)/facturas/nueva/page.tsx");
  const panel = leer("app/(private)/facturas/nueva/condicion-credito.tsx");
  const cuerpoUI = pagina.slice(pagina.indexOf("const cuerpoFactura"), pagina.indexOf("const cuerpoFactura") + 1100);
  cierto("pantalla: la condición es un select del catálogo; el cuerpo envía condicion y credito SOLO en Crédito; al volver a Contado se limpia el estado de crédito (CA-06)", /aria-label="Condición de la operación" value=\{condicion\}/.test(pagina) && /condicion: Number\(condicion\), \.\.\.\(enCredito \? \{ credito: creditoParaEnvio\(credito\) \} : \{\}\)/.test(cuerpoUI) && /setCondicion\(e\.target\.value\); setCredito\(CREDITO_UI_VACIO\)/.test(pagina) && /setCondicion\("1"\);\s+setCredito\(CREDITO_UI_VACIO\)/.test(pagina));
  cierto("pantalla: campos condicionales (Plazo vs Cuotas), grilla editable de cuotas, entrega inicial y suma visible; la forma de pago pasa a ser la de la entrega", /aria-label="Plazo en días"/.test(panel) && /Cantidad de cuotas/.test(panel) && /Generar cuotas iguales/.test(panel) && /Entrega inicial/.test(panel) && /Saldo a financiar/.test(panel) && /Medios de pago de la entrega inicial/.test(pagina) && /estado\.tipo === "1" \?/.test(panel));
  cierto("pantalla: pendientes del crédito bloquean «Revisar» y se muestran en el resumen lateral y en el modal de confirmación (cuotas, entrega, saldo)", /pendientesDeCredito\.length > 0 \? "corregir las condiciones del crédito"/.test(pagina) && /Tipo de crédito/.test(pagina) && /Saldo financiado/.test(pagina) && /Cuota \{q\.numero\}/.test(pagina));
  cierto("layout aprobado intacto: el panel de crédito vive DENTRO de la tarjeta Operación (no hay encabezado nuevo ni tarjeta nueva)", pagina.indexOf("<CondicionCredito") > pagina.indexOf('aria-labelledby="sec-operacion"') && pagina.indexOf("<CondicionCredito") < pagina.indexOf('aria-labelledby="sec-cliente"'));

  // ── 8. Estructura, límites de la fase y regresiones de arquitectura ───────────────────────────────────────────────────────────────────────────
  const migraciones = readdirSync(join(process.cwd(), "documentacao/banco/nexit/v1/migraciones")).filter((f) => /^NEX-\d+/.test(f)).sort();
  igual("sin migración: la última sigue siendo NEX-056 (el payload inmutable ya es el snapshot del crédito; no hay cuentas por cobrar)", migraciones.filter((f) => f < "NEX-057").pop()?.slice(0, 7), "NEX-056");
  const credito = leer("lib/facturacion/credito.ts");
  cierto("credito.ts es puro: sin red, base, fs ni dependencias del servidor", !/from "pg"|fetch\(|node:fs|from "@\/lib\/facturacion\/(emision|envio|gateway|shared)/.test(credito));
  cierto("FAT-E1/E2 sin tocar: el cálculo, el envío y el gateway no importan el crédito; numeración (NEX-048) intacta", !/credito/.test(leer("lib/facturacion/calculo.ts")) && !/credito/.test(leer("lib/facturacion/envio.ts")) && !/credito/.test(leer("lib/facturacion/gateway.ts")) && !/credito/.test(leer("lib/facturacion/reconciliacion.ts")));
  cierto("límites de la fase B1: sin descuentos (la moneda USD/BRL se habilitó después, en MFE-03 P2)",/cMoneOpe: e\.moneda/.test(leer("lib/facturacion/payload-fe.ts")) && !existsSync(join(process.cwd(), "documentacao/banco/nexit/v1/migraciones/NEX-057-facturacion-credito.sql")));
  cierto("sin cuentas por cobrar ni movimientos financieros automáticos: ni credito.ts ni emision.ts escriben tablas de cobranza", !/cuentas_por_cobrar|cuenta_cobrar|INSERT INTO cuotas/i.test(credito + leer("lib/facturacion/emision.ts")));
  igual("el factor de escala interno sigue siendo 10^8 (reparto exacto en PYG)", S === B(100000000), true);

  return fallos;
}
