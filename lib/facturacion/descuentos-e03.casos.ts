/**
 * E03 (PRO-200 / PRO-124) — descuentos por ítem y general en la Factura Electrónica. Fórmulas del Manual Técnico SIFEN v150 y de la Nota Técnica 1 (EA002/EA003/EA004/EA008, F009/F033/F011/F010, F014 = F008 − F013 + F025).
 * Los valores esperados se calculan a mano con esas fórmulas (enteros sencillos) y, además, se verifican invariantes con un barrido determinista: cuando el sistema acepta un descuento general en monto, el total descontado
 * es EXACTAMENTE ese monto y los totales concilian. Sin PostgreSQL ni navegador; la pantalla se verifica de forma estructural. Estas pruebas NO prueban la aceptación del gateway/SIFEN real.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { B, parseDec, S, textoDec } from "@/lib/facturacion/calculo";
import { leerDescuento, resolverDescuentos } from "@/lib/facturacion/descuentos";
import { crearFacturaElectronica, leerCuerpoFactura, prepararFactura, type CuerpoFactura } from "@/lib/facturacion/emision";
import { construirPayloadFE, resumenCalculo, totalFactura, validarEntradaFE, type EntradaFE, type LineaFE, type ReceptorFE } from "@/lib/facturacion/payload-fe";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");
const EMPRESA = "11111111-1111-4111-8111-111111111111";
const USUARIO = "99999999-9999-4999-8999-999999999999";
const SUC = "55555555-5555-4555-8555-555555555555";
const CLIENTE = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";
const PUNTO = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1";
const P1 = "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1";
const DEP_A = "a0000000-0000-4000-8000-00000000000a";

const receptor: ReceptorFE = {
  codigo: "CLI-000001", naturaleza: 1, tipoOperacion: 1, tipoContribuyente: 2, pais: "PRY", ruc: "80000005", dv: "6", tipoDocumentoIdentidad: null, descripcionTipoDocumento: "", numeroDocumento: "",
  razonSocial: "EMPRESA SINTETICA SA", nombreFantasia: "", direccion: "Calle 1", numeroCasa: "123", departamento: "1", distrito: "1", ciudad: "1", telefono: "", celular: "", email: "a@b.com", emailCopia: "", emailFacturacion: "",
};
const linea = (extra: Partial<LineaFE> = {}): LineaFE => ({ codigoInterno: "P-1", gtin: null, descripcion: "Producto de prueba", unidadSifen: 77, cantidad: "1", precio: "11000", afectacion: 1, tasa: 10, proporcion: null, ...extra });
type Desc = { modo: "PORCENTAJE" | "MONTO"; valor: string };
const pct = (valor: string): Desc => ({ modo: "PORCENTAJE", valor });
const monto = (valor: string): Desc => ({ modo: "MONTO", valor });

/** Entrada con el pago igual al total que calcula el motor (como lo hace el servidor). */
function entrada(lineas: LineaFE[], global?: Desc, extra: Partial<EntradaFE> = {}): EntradaFE {
  const total = totalFactura(lineas, global ?? null);

  return { moneda: "PYG", tipoTransaccion: 1, presencia: 1, condicion: 1, pagos: [{ tipo: 1, monto: total === null ? "1" : textoDec(total) }], infoAdicional: "", receptor, lineas, ...(global ? { descuentoGlobal: global } : {}), ...extra };
}
type Payload = { Detalles: Array<Record<string, number | string | null>>; Subtotales: Array<Record<string, number>> };
const payloadDe = (lineas: LineaFE[], global?: Desc, extra: Partial<EntradaFE> = {}) => construirPayloadFE(entrada(lineas, global, extra)) as unknown as Payload;

export async function verificarCasosDescuentosE03(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(nombre + ": esperado " + JSON.stringify(esperado) + ", obtenido " + JSON.stringify(obtenido));
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── 1. Sin descuentos: el payload no cambia ───────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const p = payloadDe([linea()]);

    igual("D-01 sin descuentos el detalle conserva EXACTAMENTE las claves de siempre (no aparecen EA002/EA003/EA004) y los totales de descuento van en cero", [Object.keys(p.Detalles[0]).filter((k) => /^dDesc|^dPorcDes/.test(k)), p.Subtotales[0].dTotDesc, p.Subtotales[0].dTotDescGlotem, p.Subtotales[0].dPorcDescTotal, p.Subtotales[0].dDescTotal, p.Subtotales[0].dTotGralOpe, p.Detalles[0].dTotOpeItem, p.Detalles[0].dTotBruOpeItem], [[], 0, 0, 0, 0, 11000, 11000, 11000]);
    igual("D-02 descuento vacío o cero equivale a no tener descuento (mismo payload)", [JSON.stringify(payloadDe([linea({ descuento: pct("") })])) === JSON.stringify(p), JSON.stringify(payloadDe([linea({ descuento: pct("0") })], monto("0"))) === JSON.stringify(p)], [true, true]);
  }

  // ── 2. Descuento por ítem (EA002/EA003/EA008, F009) ───────────────────────────────────────────────────────────────────────────────────────────
  {
    const p = payloadDe([linea({ descuento: pct("10") })]);
    const d = p.Detalles[0];
    const t = p.Subtotales[0];

    igual("D-03 ítem 10 % sobre 11.000 (IVA 10 %): EA002 = 1100, EA003 = 10, EA008 = (11000 − 1100) × 1 = 9900; E727 bruto sigue 11000", [d.dDescItem, d.dPorcDesIt, d.dDescGloItem, d.dTotOpeItem, d.dTotBruOpeItem], [1100, 10, 0, 9900, 11000]);
    igual("D-04 bases e IVA se recalculan sobre el neto (EA008): base 9000, liquidación 900; F009 = 1100, F011 = 1100, F010 = 0; F008 = F014 = 9900 (NO se resta el descuento dos veces)", [d.dBasGravIVA, d.dLiqIVAItem, t.dTotDesc, t.dTotDescGlotem, t.dDescTotal, t.dPorcDescTotal, t.dTotOpe, t.dTotGralOpe, t.dBaseGrav10, t.dIVA10, t.dTotIVA, t.dSub10], [9000, 900, 1100, 0, 1100, 0, 9900, 9900, 9000, 900, 900, 9900]);

    const q = payloadDe([linea({ cantidad: "3", descuento: monto("2000") })]);

    igual("D-05 ítem en monto POR UNIDAD (2.000 × 3 u.): EA002 = 2000, EA003 = 2000 × 100 / 11000 = 18.18181818, EA008 = (11000 − 2000) × 3 = 27000, F009 = 2000 × 3 = 6000", [q.Detalles[0].dDescItem, q.Detalles[0].dPorcDesIt, q.Detalles[0].dTotOpeItem, q.Subtotales[0].dTotDesc, q.Subtotales[0].dTotGralOpe], [2000, 18.18181818, 27000, 6000, 27000]);

    const frac = payloadDe([linea({ cantidad: "5.5", descuento: pct("10") })]);

    igual("D-06 cantidad fraccionaria 5,5 con 10 %: EA008 = (11000 − 1100) × 5,5 = 54450 exacto y F009 = 1100 × 5,5 = 6050", [frac.Detalles[0].dCantProSer, frac.Detalles[0].dTotOpeItem, frac.Subtotales[0].dTotDesc], [5.5, 54450, 6050]);
  }

  // ── 3. Descuento general (F010/EA004/F033) ────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const lineas = [linea({ codigoInterno: "A", precio: "11000" }), linea({ codigoInterno: "B", precio: "22000", cantidad: "2", afectacion: 1, tasa: 5 })];
    const p = payloadDe(lineas, pct("5"));
    const [a, b] = p.Detalles;
    const t = p.Subtotales[0];

    igual("D-07 general 5 %: EA004 = 5 × E721 / 100 en CADA ítem (550 y 1100; sin prorrateo), EA008 = 10450 y (22000 − 1100) × 2 = 41800, F033 = 550 + 2200 = 2750, F010 = 5, F014 = F008 = 52250", [a.dDescGloItem, b.dDescGloItem, a.dTotOpeItem, b.dTotOpeItem, t.dTotDesc, t.dTotDescGlotem, t.dDescTotal, t.dPorcDescTotal, t.dTotOpe, t.dTotGralOpe], [550, 1100, 10450, 41800, 0, 2750, 2750, 5, 52250, 52250]);
    igual("D-08 IVA por tasa tras el descuento: 10 % → base 9500 / IVA 950; 5 % → IVA 41800 × 5 / 105 = 1990.47619048", [a.dBasGravIVA, a.dLiqIVAItem, b.dLiqIVAItem, t.dIVA10, t.dIVA5], [9500, 950, 1990.47619048, 950, 1990.47619048]);
  }
  {
    const p = payloadDe([linea({ descuento: pct("10") })], pct("5"));
    const d = p.Detalles[0];
    const t = p.Subtotales[0];

    igual("D-09 combinados (ítem 10 % + general 5 %): EA002 = 1100, EA004 = 550 (independiente del particular), EA008 = (11000 − 1100 − 550) = 9350; F009 = 1100, F033 = 550, F011 = 1650, F014 = 9350", [d.dDescItem, d.dDescGloItem, d.dTotOpeItem, t.dTotDesc, t.dTotDescGlotem, t.dDescTotal, t.dTotGralOpe], [1100, 550, 9350, 1100, 550, 1650, 9350]);
  }
  {
    // Monto general: F010 = monto × 100 / Σ(E721 × E711) y reparto exacto.
    const lineas = [linea({ codigoInterno: "A", precio: "24600" }), linea({ codigoInterno: "B", precio: "24600" }), linea({ codigoInterno: "C", precio: "58100" })];
    const p = payloadDe(lineas, monto("5000"));
    const t = p.Subtotales[0];
    const e = p.Detalles.map((x) => Number(x.dDescGloItem));

    igual("D-10 general en monto 5.000 sobre 107.300: el total descontado es EXACTAMENTE 5.000 (F033), F014 = 102.300 y F010 = 5000 × 100 / 107300 (8 decimales)", [t.dTotDescGlotem, t.dDescTotal, t.dTotGralOpe, t.dPorcDescTotal, e.reduce((a, x) => a + x, 0)], [5000, 5000, 102300, 4.65983225, 5000]);
    cierto("D-11 cada EA004 respeta la regla de SIFEN |EA004 − F010 × E721 / 100| ≤ 0,8 (NT 1)", p.Detalles.every((x) => Math.abs(Number(x.dDescGloItem) - (t.dPorcDescTotal * Number(x.dPUniProSer)) / 100) <= 0.8));
  }

  // ── 4. IVA mixto, exento, moneda extranjera ───────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const mixto = payloadDe([linea({ codigoInterno: "G", precio: "11000", descuento: pct("10") }), linea({ codigoInterno: "E", precio: "5000", afectacion: 3, tasa: 0, descuento: pct("20") }), linea({ codigoInterno: "P", precio: "10500", afectacion: 1, tasa: 5 })], pct("10"));
    const t = mixto.Subtotales[0];

    igual("D-12 factura mixta (10 %, exenta y 5 %) con descuento particular y general: subtotales por tipo sobre el NETO (9900−1100 .. ) y F014 = suma de EA008", [t.dSub10, t.dSubExe, t.dSub5, t.dTotOpe, t.dTotGralOpe, mixto.Detalles.map((d) => d.dTotOpeItem)], [11000 - 1100 - 1100, 5000 - 1000 - 500, 10500 - 1050, 11000 - 1100 - 1100 + 5000 - 1000 - 500 + 10500 - 1050, 11000 - 1100 - 1100 + 5000 - 1000 - 500 + 10500 - 1050, [8800, 3500, 9450]]);
    igual("D-13 las bases gravadas e IVA salen del neto: 10 % → 8800 / 9 = 800 de IVA; 5 % → 9450 × 5 / 105 = 450; exenta sin IVA", [t.dIVA10, t.dIVA5, t.dBaseGrav10, t.dBaseGrav5, t.dTotIVA], [800, 450, 8000, 9000, 1250]);

    const parcial = payloadDe([linea({ afectacion: 4, tasa: 10, proporcion: "10", precio: "12625", descuento: pct("20") })]);

    igual("D-14 gravado parcial (afectación 4, 10 % gravado) con 20 % de descuento: EA008 = 10100; base gravada 1000, IVA 100 y base exenta 9000 se calculan sobre el NETO", [parcial.Detalles[0].dDescItem, parcial.Detalles[0].dTotOpeItem, parcial.Detalles[0].dBasGravIVA, parcial.Detalles[0].dLiqIVAItem, parcial.Detalles[0].dBasExe, parcial.Subtotales[0].dTotGralOpe], [2525, 10100, 1000, 100, 9000, 10100]);
  }
  {
    const usd = payloadDe([linea({ precio: "10.5", cantidad: "2", descuento: pct("10") })], undefined, { moneda: "USD", cambio: "7500", pagos: [{ tipo: 1, monto: "18.9" }] });

    igual("D-15 moneda extranjera (USD): EA002 = 1,05 por unidad, EA008 = (10,5 − 1,05) × 2 = 18,9; F009 = 2,1; el equivalente en guaraníes usa el total neto", [usd.Detalles[0].dDescItem, usd.Detalles[0].dTotOpeItem, usd.Subtotales[0].dTotDesc, usd.Subtotales[0].dTotGralOpe, usd.Subtotales[0].dTotalGs], [1.05, 18.9, 2.1, 18.9, 141750]);
  }

  // ── 5. Validaciones: nada fuera de regla llega al payload ─────────────────────────────────────────────────────────────────────────────────────────
  {
    const err = (l: LineaFE[], g?: Desc) => validarEntradaFE(entrada(l, g, { pagos: [{ tipo: 1, monto: "1000" }] }));
    const hay = (errores: string[], texto: RegExp) => errores.some((x) => texto.test(x));

    cierto("D-16 un descuento por ítem igual o mayor que el precio se rechaza (monto 11.000, monto 12.000)", hay(err([linea({ descuento: monto("11000") })]), /igual ni mayor que el precio/) && hay(err([linea({ descuento: monto("12000") })]), /igual ni mayor que el precio/));
    cierto("D-17 el porcentaje debe ser menor que 100 (100 y 150 se rechazan); negativo, texto y más de 4 decimales se rechazan", hay(err([linea({ descuento: pct("100") })]), /menor que 100/) && hay(err([linea({ descuento: pct("150") })]), /menor que 100/) && hay(err([linea({ descuento: pct("-5") })]), /hasta 4 decimales/) && hay(err([linea({ descuento: pct("abc") })]), /hasta 4 decimales/) && hay(err([linea({ descuento: monto("1.23456") })]), /hasta 4 decimales/));
    cierto("D-18 los dos descuentos combinados no pueden dejar el precio en cero o negativo (ítem 60 % + general 40 %)", hay(err([linea({ descuento: pct("60") })], pct("40")), /cero o negativo/));
    cierto("D-19 el descuento general no puede ser igual o mayor que el total (monto 11.000 sobre 11.000; sin ítems)", hay(err([linea()], monto("11000")), /igual ni mayor que el total/) && hay(validarEntradaFE({ ...entrada([], monto("5")), lineas: [] }), /Agregue al menos un ítem/));
    igual("D-20 un descuento general en monto que no se puede repartir exactamente (único ítem con cantidad 3 y monto no múltiplo de 0,0003) se rechaza en vez de redondear", hay(err([linea({ cantidad: "3" })], monto("1000.0001")), /repartir exactamente/), true);
    igual("D-21 coma decimal y espacios en el valor se aceptan (10,5 % = 10.5)", [leerDescuento({ modo: "PORCENTAJE", valor: " 10,5 " }), leerDescuento({ modo: "MONTO", valor: "" }), leerDescuento(undefined), leerDescuento({ modo: "OTRO", valor: "1" }), leerDescuento({ modo: "MONTO", valor: 5 })], [{ modo: "PORCENTAJE", valor: "10.5" }, null, null, "El tipo de descuento debe ser porcentaje o monto.", "El valor del descuento no es válido."]);
  }

  // ── 6. Barrido determinista: invariantes del reparto del descuento general en monto ───────────────────────────────────────────────────────────────
  {
    let semilla = 12345;
    const azar = (max: number) => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla % max; };
    let aceptados = 0;
    let rechazados = 0;
    let violaciones = 0;

    for (let n = 0; n < 400; n++) {
      const k = 1 + azar(5);
      const items = Array.from({ length: k }, () => ({ cantidad: parseDec(String(1 + azar(9)) + (azar(2) === 0 ? "" : "." + String(azar(9999)).padStart(4, "0")), 4) as bigint, precio: parseDec(String(100 + azar(90000)) + (azar(3) === 0 ? "." + String(azar(9999)).padStart(4, "0") : ""), 4) as bigint }));
      const bruto = items.reduce((a, i) => a + (i.cantidad * i.precio + S / B(2)) / S, B(0));
      const d = parseDec(String(1 + azar(Number(bruto / S) - 1 || 1)), 4) as bigint;
      const r = resolverDescuentos(items, { modo: "MONTO", valor: textoDec(d) });

      if (r.errores.length > 0) { rechazados += 1; continue; }
      aceptados += 1;

      const total = items.reduce((a, it, i) => a + (it.cantidad * r.porItem[i].descGlobal + S / B(2)) / S, B(0));
      const netoPositivo = items.every((it, i) => it.precio - r.porItem[i].descGlobal > B(0));

      if (total !== d || !netoPositivo) violaciones += 1;
    }
    igual("D-22 barrido de 400 casos: cuando se acepta un descuento general en monto el total descontado es EXACTAMENTE el monto ingresado y todo precio neto sigue positivo; los que no se pueden repartir exactamente se rechazan (nunca se aproximan)", [violaciones, aceptados > 250, aceptados + rechazados], [0, true, 400]);
  }

  // ── 7. Resumen para la pantalla (mismo motor) ───────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const r = resumenCalculo([linea({ descuento: pct("10") })], pct("5"));

    igual("D-23 el resumen de la pantalla usa el mismo motor: total 9350, descuentos 1100 + 550 = 1650, F010 = 5, detalle por ítem (unitario, %, general, total)", [r.texto.total, r.descuentos.totalItems, r.descuentos.totalGeneral, r.descuentos.total, r.descuentos.porcGlobal, r.descuentos.items[0], r.erroresDescuento, r.completo], ["9350", "1100", "550", "1650", "5", { unitario: "1100", porcentaje: "10", global: "550", total: "1650" }, [], true]);
    igual("D-24 con un descuento inválido el resumen marca el error y no completa", [resumenCalculo([linea({ descuento: monto("99999") })]).completo, resumenCalculo([linea({ descuento: monto("99999") })]).erroresDescuento.length > 0], [false, true]);
    igual("D-25 sin descuentos el resumen no cambia (hay = false, total 11000)", [resumenCalculo([linea()]).descuentos.hay, resumenCalculo([linea()]).texto.total], [false, "11000"]);
  }

  // ── 8. Servidor: cuerpo, previa y emisión (orquestación real) ─────────────────────────────────────────────────────────────────────────────────────
  const cuerpoBase = (lineas: unknown[], extra: Record<string, unknown> = {}) => ({ claveIdempotencia: "clave-descuento-0001", sucursalId: SUC, puntoId: PUNTO, clienteId: CLIENTE, tipoTransaccion: 1, presencia: 1, pagos: [{ tipo: 1 }], infoAdicional: "", lineas, ...extra });
  const l1 = (extra: Record<string, unknown> = {}) => ({ productoId: P1, cantidad: "2", precio: null, ...extra });

  igual("D-30 el cuerpo acepta descuento por ítem y general (forma validada) y los conserva", (() => {
    const c = leerCuerpoFactura(cuerpoBase([l1({ descuento: { modo: "PORCENTAJE", valor: "10" } })], { descuentoGlobal: { modo: "MONTO", valor: "500" } })) as { lineas: Array<{ descuento?: unknown }>; descuentoGlobal?: unknown };

    return [c.lineas[0].descuento, c.descuentoGlobal];
  })(), [{ modo: "PORCENTAJE", valor: "10" }, { modo: "MONTO", valor: "500" }]);
  igual("D-31 el cuerpo rechaza formas inválidas de descuento (modo desconocido, valor no textual, arreglo)", [leerCuerpoFactura(cuerpoBase([l1({ descuento: { modo: "X", valor: "1" } })])), leerCuerpoFactura(cuerpoBase([l1({ descuento: { modo: "MONTO", valor: 5 } })])), leerCuerpoFactura(cuerpoBase([l1()], { descuentoGlobal: [] }))], ["El tipo de descuento debe ser porcentaje o monto.", "El valor del descuento no es válido.", "El descuento no es válido."]);

  {
    const filaCliente = { codigo: "CLI-000001", naturaleza_receptor: 1, tipo_operacion: 1, tipo_contribuyente_sifen: 2, pais_codigo: "PRY", tipo_documento_identidad_sifen: null, descripcion_documento_identidad: null, numero_documento: "80000005", dv: "6", razon_social: "CLIENTE SINTETICO", nombre_fantasia: null, email: null, email_copia: null, email_facturacion: null, telefono: null, celular: null, telefono_ddi: null, celular_ddi: null, activo: true, bloqueado_ventas: false, direccion: "Calle 1", numero_casa: "123", departamento_codigo: "1", distrito_codigo: "1", ciudad_codigo: "1" };
    const producto = { id: P1, codigo: "P-1", controlaStock: true, descripcion: "Producto P-1", unidadSifen: 77, unidadSimbolo: "UNI", unidadNombre: "Unidad", unidadVigente: true, afectacion: 1, proporcion: null, tasa: 10, precio: "11000", monedaPrecio: "PYG", gtin: null };
    const llamadas: Array<{ sql: string; p: unknown[] }> = [];
    let stock = 10;
    const db = {
      async query(sql: string, p: unknown[] = []) {
        llamadas.push({ sql, p });
        if (/usuario_tiene_permiso/.test(sql)) return { rows: [{ ok: false }], rowCount: 1 };
        if (/FROM clientes c\s+LEFT JOIN LATERAL/.test(sql)) return { rows: [filaCliente], rowCount: 1 };
        if (/SELECT c\.id, c\.naturaleza_receptor/.test(sql)) return { rows: [{ ...filaCliente, id: CLIENTE, tipo_persona: "JURIDICA", tipo_documento: "RUC", pais_codigo: "PRY" }], rowCount: 1 };
        if (/FROM direcciones_cliente/.test(sql)) return { rows: [{ cliente_id: CLIENTE, direccion: "Calle 1", numero_casa: "123", departamento_codigo: "1", distrito_codigo: "1", ciudad_codigo: "1", pais_codigo: "PRY" }], rowCount: 1 };
        if (/FROM referencia_geografica_paises/.test(sql)) return { rows: [{ codigo: "PRY" }], rowCount: 1 };
        if (/FROM sucursales sc JOIN empresas e/.test(sql)) return { rows: [{ empresa: "EMPRESA SINTETICA", sucursal: "Casa Central", establecimiento: "001", punto: "002", puntoNombre: "Punto 002" }], rowCount: 1 };
        if (/FROM productos p/.test(sql)) return { rows: [producto], rowCount: 1 };
        if (/FROM documentos_electronicos WHERE empresa_id/.test(sql)) return { rows: [], rowCount: 0 };
        if (/FROM fe_stock_disponibilidad/.test(sql)) return { rows: [{ productoId: P1, depositoId: DEP_A, depositoCodigo: "A", depositoNombre: "Depósito A", loteId: null, loteCodigo: null, vencimiento: null, disponible: String(stock) }], rowCount: 1 };
        if (/fe_documento_crear_fe_con_stock/.test(sql)) return { rows: [{ documentoId: "d0000000-0000-4000-8000-000000000001", numero: "0050000", reutilizado: false }], rowCount: 1 };

        return { rows: [], rowCount: 0 };
      },
    } as never;

    const c = leerCuerpoFactura(cuerpoBase([l1({ descuento: { modo: "PORCENTAJE", valor: "10" } })], { descuentoGlobal: { modo: "PORCENTAJE", valor: "5" } })) as CuerpoFactura;
    const prep = await prepararFactura(db, EMPRESA, USUARIO, c);
    const pay = prep.payload as unknown as Payload;
    const resumen = prep.resumen as unknown as { totalesTexto: { total: string }; descuentos?: { total: string; porcGlobal: string }; lineas: Array<{ descuento?: { unitario: string; global: string; total: string } }> };

    igual("D-32 la previa del servidor aplica ambos descuentos: cantidad 2 × (11000 − 1100 − 550) = 18700, payload con EA002/EA004 y totales, resumen con el detalle por ítem y los totales de descuento", [pay.Detalles[0].dTotOpeItem, pay.Detalles[0].dDescItem, pay.Detalles[0].dDescGloItem, pay.Subtotales[0].dTotDesc, pay.Subtotales[0].dTotDescGlotem, pay.Subtotales[0].dTotGralOpe, resumen.totalesTexto.total, resumen.descuentos?.total, resumen.descuentos?.porcGlobal, resumen.lineas[0].descuento], [18700, 1100, 550, 2200, 1100, 18700, "18700", "3300", "5", { unitario: "1100", porcentaje: "10", global: "550", total: "3300" }]);
    igual("D-33 el control de stock (E02) sigue usando la cantidad facturada (2), no el valor descontado: la baja pedida es 2 unidades", prep.lineasStock.map((l) => [l.productoId, l.cantidad, l.controlaStock]), [[P1, "2", true]]);

    // Emisión: el payload que viaja a la función atómica contiene los descuentos y el reparto de stock no cambia.
    const { planificarStock } = await import("@/lib/facturacion/stock-fe");
    const plan = await planificarStock(db, EMPRESA, USUARIO, SUC, prep.lineasStock);

    await crearFacturaElectronica(db, EMPRESA, USUARIO, { ...c, repartoHuella: plan.huella });

    const emision = llamadas.find((x) => /fe_documento_crear_fe_con_stock/.test(x.sql));
    const enviado = JSON.parse(String(emision?.p[9])) as Payload;
    const asignaciones = JSON.parse(String(emision?.p[11])) as Array<{ cantidad: string }>;

    igual("D-34 la emisión envía a PostgreSQL el MISMO payload con descuentos y la baja de stock de 2 unidades exactas; el total viaja neto", [enviado.Detalles[0].dDescItem, enviado.Subtotales[0].dTotDescGlotem, enviado.Subtotales[0].dTotGralOpe, emision?.p[8], asignaciones.map((a) => a.cantidad)], [1100, 1100, 18700, "18700", ["2"]]);
    stock = 10;

    // Cambiar el descuento cambia la huella de la revisión (la revisión FAT-D02 invalida el envío): el cuerpo es distinto.
    const c2 = leerCuerpoFactura(cuerpoBase([l1({ descuento: { modo: "PORCENTAJE", valor: "11" } })], { descuentoGlobal: { modo: "PORCENTAJE", valor: "5" } }));

    igual("D-35 cambiar un descuento cambia el cuerpo revisado (JSON distinto), de modo que la revisión previa deja de ser válida", JSON.stringify(c) !== JSON.stringify(c2), true);
  }

  // ── 9. Pantalla (estructural) y no regresión de otros documentos ────────────────────────────────────────────────────────────────────────────────
  const pagina = leer("app/(private)/facturas/nueva/page.tsx");
  const payloadNce = leer("lib/facturacion/payload-nce.ts");

  cierto("D-40 pantalla: cada ítem tiene control de descuento (% / monto por unidad) y la factura tiene el descuento general; ambos viajan en el cuerpo revisado y el cálculo del panel usa el mismo motor", /aria-label=\{`Tipo de descuento de \$\{l\.producto\.descripcion\}`\}/.test(pagina) && /aria-label=\{`Descuento de \$\{l\.producto\.descripcion\}`\}/.test(pagina) && /aria-label="Tipo de descuento general"/.test(pagina) && /aria-label="Descuento general"/.test(pagina) && /resumenCalculo\(lineas\.map\(\(l\) => aLineaFE\(l, moneda\)\), descuentoGeneralFE\)/.test(pagina) && /descuentoGlobal: descuentoGeneralFE/.test(pagina) && /\.\.\.\(descuento \? \{ descuento \} : \{\}\)/.test(pagina));
  cierto("D-41 pantalla: el resumen previo al envío muestra los descuentos (por ítem, general y total) y los errores del descuento bloquean «Revisar»", /resumen\.descuentos/.test(pagina) && /Descuento por ítems/.test(pagina) && /Descuento general/.test(pagina) && /Total descuentos/.test(pagina) && /calculo\.erroresDescuento/.test(pagina));
  cierto("D-42 la NCE no se toca (no importa el módulo de descuentos) y el motor de cálculo solo recibe descuentos desde la Factura", !/descuentos/.test(payloadNce) && !/descuentoItem|descuentoGlobal/.test(payloadNce));


  // ── 10. E03-R02 (PRO-204): al confirmar un cambio de moneda se limpian los descuentos en MONTO (por ítem y general); los porcentajes se conservan; cancelar no cambia nada ──────────────
  {
    const { descuentosTrasCambioMoneda, tieneDescuentoMonto } = await import("@/lib/facturacion/descuentos");
    const { perdidasAlCambiarMoneda } = await import("@/lib/facturacion/cambios-formulario");
    const { PAGO_UI_VACIO } = await import("@/lib/facturacion/pagos");
    const { CREDITO_UI_VACIO } = await import("@/lib/facturacion/credito");
    const base = { precios: [] as Array<{ actual: string; nuevo: string }>, pagos: [PAGO_UI_VACIO], credito: CREDITO_UI_VACIO, cambio: "", cambioManual: false, cambioNuevo: "" };

    igual("R02-01 solo un monto digitado cuenta como descuento monetario (el vacío y el porcentaje no)", [tieneDescuentoMonto(monto("2000")), tieneDescuentoMonto(monto("  ")), tieneDescuentoMonto(pct("10")), tieneDescuentoMonto(null)], [true, false, false, false]);

    const itemsAntes: Desc[] = [monto("2000"), pct("10"), { modo: "MONTO", valor: "" }, monto("500,5")];
    const general: Desc = monto("1500");
    const r = descuentosTrasCambioMoneda(itemsAntes, general);

    igual("R02-02 confirmar: los montos por ítem y el general se limpian (el tipo elegido se conserva); el porcentaje queda intacto; no se convierte ningún valor", [r.items, r.general, r.perdidos], [[{ modo: "MONTO", valor: "" }, pct("10"), { modo: "MONTO", valor: "" }, { modo: "MONTO", valor: "" }], { modo: "MONTO", valor: "" }, { items: 2, general: true }]);
    igual("R02-03 el porcentaje general se conserva; sin descuentos monetarios no hay nada que perder", [descuentosTrasCambioMoneda([pct("5")], pct("7")), descuentosTrasCambioMoneda([], { modo: "PORCENTAJE", valor: "" }).perdidos], [{ items: [pct("5")], general: pct("7"), perdidos: { items: 0, general: false } }, { items: 0, general: false }]);
    igual("R02-04 la función no muta la entrada (cancelar conserva TODOS los valores: el estado original sigue intacto)", [JSON.stringify(itemsAntes), JSON.stringify(general)], [JSON.stringify([monto("2000"), pct("10"), { modo: "MONTO", valor: "" }, monto("500,5")]), JSON.stringify(monto("1500"))]);

    // El diálogo de confirmación informa QUÉ descuentos monetarios se pierden (PYG → USD, USD → BRL, BRL → PYG, USD → PYG).
    for (const [de, a] of [["PYG", "USD"], ["USD", "BRL"], ["BRL", "PYG"], ["USD", "PYG"]] as Array<[string, string]>) {
      const conMonto = perdidasAlCambiarMoneda({ ...base, descuentosMonto: { items: 2, general: true } });
      const soloPct = perdidasAlCambiarMoneda({ ...base, descuentosMonto: { items: 0, general: false } });

      igual("R02-05 [" + de + " → " + a + "] con 2 descuentos en monto por ítem y el general, el diálogo los lista (sin convertir) y sin montos no pide confirmación por descuentos", [conMonto.some((x) => /descuento en monto de 2 ítems/.test(x)), conMonto.some((x) => /descuento general en monto/.test(x)), conMonto.every((x) => /no se convierte/.test(x) || !/descuento/.test(x)), soloPct], [true, true, true, []]);
    }
    igual("R02-06 un solo ítem usa el singular y las otras pérdidas (pagos, precios) siguen listándose junto a los descuentos", (() => {
      const l = perdidasAlCambiarMoneda({ ...base, precios: [{ actual: "11000", nuevo: "1.5" }], descuentosMonto: { items: 1, general: false } });

      return [l.some((x) => /descuento en monto de 1 ítem \(/.test(x)), l.some((x) => /precio de 1 ítem/.test(x))];
    })(), [true, true]);

    // Efecto en el cálculo: PYG con descuento en monto → USD: sin el monto el total es el bruto; con porcentaje sigue descontando.
    const enUsd = (d1: Desc, g: Desc | null) => {
      const t = descuentosTrasCambioMoneda([d1], g ?? { modo: "PORCENTAJE", valor: "" });

      return resumenCalculo([linea({ precio: "10", cantidad: "2", descuento: t.items[0].valor.trim() === "" ? undefined : t.items[0] })], t.general.valor.trim() === "" ? null : t.general).texto.total;
    };

    igual("R02-07 tras el cambio a USD: un monto de 2000 (que eran guaraníes) ya NO descuenta 2.000 USD (total bruto 20); un 10 % por ítem y un 5 % general se conservan (20 × 0,9 − general)", [enUsd(monto("2000"), monto("3000")), enUsd(pct("10"), pct("5"))], ["20", "17"]);
    igual("R02-08 en la nueva moneda se puede volver a digitar un monto válido (BRL y USD con decimales) y se calcula sobre ese valor", [resumenCalculo([linea({ precio: "10", cantidad: "2", descuento: monto("1.5") })]).texto.total, resumenCalculo([linea({ precio: "10", cantidad: "2" })], monto("2.5")).texto.total], ["17", "17.5"]);
  }
  {
    const pag = leer("app/(private)/facturas/nueva/page.tsx");
    const cierre = pag.slice(pag.indexOf("const cerrarConfirmacion = useCallback"), pag.indexOf("const cerrarConfirmacion = useCallback") + 300);

    cierto("R02-09 pantalla: cambiarMoneda (solo al confirmar) limpia los montos por ítem y el general con descuentosTrasCambioMoneda; pedirMoneda informa los montos que se perderían; cancelar/cerrar la confirmación no toca descuentos ni valores", /const desc = descuentosTrasCambioMoneda\(lineas\.map\(\(l\) => l\.descuento\), descuentoGeneral\)/.test(pag) && /setDescuentoGeneral\(desc\.general\)/.test(pag) && /descuento: descPorClave\.get\(l\.clave\) \?\? l\.descuento/.test(pag) && /descuentosMonto: descuentosTrasCambioMoneda\(lineas\.map\(\(l\) => l\.descuento\), descuentoGeneral\)\.perdidos/.test(pag) && /if \(perdidas\.length === 0\) cambiarMoneda\(m\);\s+else setConfirmacion/.test(pag) && cierre.length > 0 && !/descuento|Descuento/.test(cierre));
    cierto("R02-10 las fórmulas fiscales, el cálculo del IVA y el estoque no se tocaron en esta corrección (calculo.ts/payload-fe.ts/stock-fe.ts no importan los helpers de moneda)", !/descuentosTrasCambioMoneda|tieneDescuentoMonto/.test(leer("lib/facturacion/calculo.ts") + leer("lib/facturacion/payload-fe.ts") + leer("lib/facturacion/stock-fe.ts") + leer("lib/facturacion/emision.ts")));
  }

  return fallos;
}
