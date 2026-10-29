/**
 * E07 (PRO-200) — NCE con el servicio fijo DESCUENTO (motivos 3 Descuento y 4 Bonificación): cantidad 1, precio = monto digitado, IVA 10% fijo, sin stock, único ítem, tope por saldo global. Se prueba el
 * motor REAL de validación/payload (el mismo que alimenta la función SQL), la lectura del cuerpo, el estado de la pantalla y el texto de NEX-070. El SQL no se ejecutó (sin PostgreSQL).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { leerCuerpoNce } from "@/lib/facturacion/nce";
import { errorMontoDescuento, lineasOriginalesPendientes, puedeAgregarDescuento } from "@/lib/facturacion/nce-entradas";
import { calcularNce, construirPayloadNCE, lineasParaSql, validarEntradaNce, type EntradaNce, type LineaOriginal } from "@/lib/facturacion/payload-nce";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");
const sinCom = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const L = (linea: number, cantidad: string, precio: string, afectacion: 1 | 3, tasa: 10 | 0 | 5): LineaOriginal => ({ linea, codigoInterno: `P${linea}`, gtin: null, descripcion: `Prod ${linea}`, unidadSifen: 77, cantidad, precio, total: String(Number(cantidad) * Number(precio)), afectacion, tasa, proporcion: afectacion === 1 ? "100" : "0" });
const SIN = { cantidad: "0", monto: "0" };
const CDC = "01800000012001001000000112026101612345678901";
const RECEPTOR = { dNomRec: "CLIENTE SA", dRucRec: "80000001", iNatRec: 1 };
const nota = (motivo: number, monto: string, extra: Partial<EntradaNce> = {}): EntradaNce => ({ motivo, moneda: "PYG", cambio: null, lineas: [], observacion: "", servicio: { monto }, saldoCredito: "200000", ...extra });

export async function verificarCasosNceDescuentoE07(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── Motor fiscal: ítem DESCUENTO ───────────────────────────────────────────────────────────────
  for (const motivo of [3, 4]) {
    const e = nota(motivo, "33000");
    const payload = construirPayloadNCE(e, RECEPTOR, CDC) as { iMotEmi: number; DocumentosAsociados: Array<{ dCdCDERef: string; iTipDocAso: number }>; Detalles: Array<Record<string, unknown>>; Subtotales: Array<Record<string, unknown>> };

    igual(`E07-01 motivo ${motivo}: la nota contiene SOLO el ítem DESCUENTO (código y descripción DESCUENTO, sin GTIN, unidad 77, cantidad 1, precio = monto, gravado 10%, proporción 100)`, [payload.Detalles.length, payload.Detalles[0].dCodInt, payload.Detalles[0].dDesProSer, payload.Detalles[0].dGtin, payload.Detalles[0].cUniMed, payload.Detalles[0].dCantProSer, payload.Detalles[0].dPUniProSer, payload.Detalles[0].iAfecIVA, payload.Detalles[0].dTasaIVA, payload.Detalles[0].dPropIVA], [1, "DESCUENTO", "DESCUENTO", null, 77, 1, 33000, 1, 10, 100]);
    igual(`E07-01 motivo ${motivo}: importes fiscales — total 33.000, base gravada 30.000 e IVA 3.000, subtotales sin descuentos ni anticipos`, [payload.Detalles[0].dTotOpeItem, payload.Detalles[0].dBasGravIVA, payload.Detalles[0].dLiqIVAItem, payload.Detalles[0].dBasExe, payload.Subtotales[0].dSub10, payload.Subtotales[0].dIVA10, payload.Subtotales[0].dTotGralOpe, payload.Subtotales[0].dTotDesc, payload.Subtotales[0].dSub5, payload.Subtotales[0].dSubExe], [33000, 30000, 3000, 0, 33000, 3000, 33000, 0, 0, 0]);
    igual(`E07-01 motivo ${motivo}: se conserva el CDC de la factura original y el motivo SIFEN`, [payload.iMotEmi, payload.DocumentosAsociados[0].dCdCDERef, payload.DocumentosAsociados[0].iTipDocAso, payload.DocumentosAsociados.length], [motivo, CDC, 1, 1]);
  }

  igual("E07-02 el servicio viaja a SQL como {servicio:true} (sin ordinal de la FE) con cantidad 0 y el monto exacto", lineasParaSql(nota(3, "33000")), [{ servicio: true, cantidad: "0", monto: "33000" }]);
  igual("E07-02 el IVA es SIEMPRE 10% fijo, sin prorrateo: la misma nota sirve para una FE original exenta o al 5% (la entrada no depende de las líneas originales)", [calcularNce(nota(3, "11000")).totales.gravado10, calcularNce(nota(4, "11000")).totales.iva10, calcularNce(nota(3, "11000")).totales.gravado5, calcularNce(nota(3, "11000")).totales.exento], ["11000", "1000", "0", "0"]);
  igual("E07-03 monto libre positivo: 1 guaraní, valores no redondos y USD con 4 decimales son válidos (el servicio no controla stock)", [validarEntradaNce(nota(3, "1")), validarEntradaNce(nota(4, "12345")), validarEntradaNce({ ...nota(3, "10.5"), moneda: "USD", cambio: "7300" })], [[], [], []]);

  // ── Validaciones del servidor ──────────────────────────────────────────────────────────────────
  const msg = (e: EntradaNce) => validarEntradaNce(e).join(" | ");

  cierto("E07-04 rechaza monto cero, negativo, vacío, texto, con decimales en guaraníes o con más de 4 decimales en moneda extranjera", ["0", "-5", "", "abc", "1000.5", "1e3"].every((m) => validarEntradaNce(nota(3, m)).length > 0) && validarEntradaNce({ ...nota(3, "1.00001"), moneda: "USD", cambio: "7300" }).length > 0);
  cierto("E07-04 el desconto no puede superar el saldo disponible para crédito (saldo 200.000: 200.000 pasa, 200.001 no) ni lo ya consumido por otras notas", validarEntradaNce(nota(3, "200000")).length === 0 && /supera el saldo disponible/.test(msg(nota(3, "200001"))) && /supera el saldo disponible/.test(msg(nota(4, "50001", { saldoCredito: "50000" }))));
  cierto("E07-05 solo existe en Descuento y Bonificación: Devolución y Ajuste de precio lo rechazan", [2, 8].every((m) => /solo se admite en los motivos Descuento y Bonificación/.test(msg(nota(m, "1000")))));
  cierto("E07-05 con el servicio no puede haber líneas de la factura (hay que retirarlas): mezcla rechazada", /no puede incluir líneas/.test(msg(nota(3, "1000", { lineas: [{ original: L(1, "2", "50000", 1, 10), acreditado: SIN, monto: "1000" }] }))));
  cierto("E07-05 sin servicio y sin líneas la nota sigue sin ser emitible", /agregue el servicio DESCUENTO/.test(msg({ motivo: 3, moneda: "PYG", cambio: null, lineas: [], observacion: "" })));
  cierto("E07-06 el saldo global también limita a las notas por línea (descuento previo consumió parte del crédito): 150.000 de línea con saldo global 100.000 se rechaza", /supera el saldo disponible de la factura original/.test(msg({ motivo: 3, moneda: "PYG", cambio: null, observacion: "", saldoCredito: "100000", lineas: [{ original: L(1, "2", "100000", 1, 10), acreditado: SIN, monto: "150000" }] })) && validarEntradaNce({ motivo: 3, moneda: "PYG", cambio: null, observacion: "", saldoCredito: "100000", lineas: [{ original: L(1, "2", "100000", 1, 10), acreditado: SIN, monto: "100000" }] }).length === 0);
  cierto("E07-06 las notas por línea de siempre no cambian (sin servicio ni saldo global): devolución parcial y crédito por monto válidos como antes", validarEntradaNce({ motivo: 2, moneda: "PYG", cambio: null, observacion: "", lineas: [{ original: L(1, "5", "10000", 1, 10), acreditado: SIN, cantidad: "2" }] }).length === 0 && validarEntradaNce({ motivo: 3, moneda: "PYG", cambio: null, observacion: "", lineas: [{ original: L(2, "1", "20000", 3, 0), acreditado: SIN, monto: "5000" }] }).length === 0);

  // cuerpo de la API
  const U = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const base = { facturaId: U, sucursalId: U, puntoId: U, claveIdempotencia: "clave-12345" };
  const ok = leerCuerpoNce({ ...base, motivo: 3, lineas: [], servicio: { monto: " 12500 " } });
  const usd = leerCuerpoNce({ ...base, motivo: 4, servicio: { monto: "10,5" } });

  igual("E07-07 la API acepta el servicio con lista de líneas vacía (o ausente), normaliza la coma y no exige líneas", [typeof ok === "string" ? ok : ok.servicio, typeof ok === "string" ? ok : ok.lineas, typeof usd === "string" ? usd : usd.servicio], [{ monto: "12500" }, [], { monto: "10.5" }]);
  igual("E07-07 la API rechaza el servicio en Devolución, con líneas, sin monto o con un monto inválido", [leerCuerpoNce({ ...base, motivo: 2, lineas: [], servicio: { monto: "1000" } }), leerCuerpoNce({ ...base, motivo: 3, lineas: [{ linea: 1, monto: "5" }], servicio: { monto: "1000" } }), leerCuerpoNce({ ...base, motivo: 3, lineas: [], servicio: {} }), leerCuerpoNce({ ...base, motivo: 3, lineas: [], servicio: { monto: 5 } })].map((x) => typeof x === "string"), [true, true, true, true]);
  cierto("E07-07 sin servicio, una nota sin líneas sigue rechazada", typeof leerCuerpoNce({ ...base, motivo: 3, lineas: [] }) === "string");

  // ── Estado de la pantalla ──────────────────────────────────────────────────────────────────────
  igual("E07-08 el botón «+ Agregar DESCUENTO» aparece solo en Descuento/Bonificación, con el servicio disponible y sin haberlo agregado", [puedeAgregarDescuento(3, true, false), puedeAgregarDescuento(4, true, false), puedeAgregarDescuento(2, true, false), puedeAgregarDescuento(8, true, false), puedeAgregarDescuento("", true, false), puedeAgregarDescuento(3, false, false), puedeAgregarDescuento(3, true, true)], [true, true, false, false, false, false, false]);
  igual("E07-08 validación en pantalla del monto: válido, vacío, cero, decimales en PYG, USD 4 decimales y tope por saldo", [errorMontoDescuento("33000", "PYG", "100000"), errorMontoDescuento("", "PYG", "100000") !== null, errorMontoDescuento("0", "PYG", "100000") !== null, errorMontoDescuento("10,5", "PYG", "100000") !== null, errorMontoDescuento("10,5", "USD", "100"), errorMontoDescuento("100001", "PYG", "100000")], [null, true, true, true, null, "Supera el saldo disponible para crédito (100000)."]);

  const originales = [{ linea: 1, agotada: false }, { linea: 2, agotada: false }, { linea: 3, agotada: true }];

  igual("E07-09 con DESCUENTO, las líneas originales que siguen en la nota bloquean la emisión; tras seleccionar todas y eliminar (y sin contar las agotadas) puede emitirse solo el DESCUENTO", [lineasOriginalesPendientes(originales, new Set()), lineasOriginalesPendientes(originales, new Set([1])), lineasOriginalesPendientes(originales, new Set([1, 2]))], [2, 1, 0]);

  const pagina = sinCom(leer("app/(private)/notas-credito/page.tsx")) + sinCom(leer("lib/facturacion/nce-entradas.ts"));

  cierto("E07-10 la pantalla ofrece «+ Agregar DESCUENTO» y «Quitar DESCUENTO», fila de servicio con monto editable, envía {servicio:{monto}} sin líneas, no elimina las originales por su cuenta y reinicia al cambiar de motivo", /\+ Agregar DESCUENTO/.test(pagina) && /Quitar DESCUENTO/.test(pagina) && /aria-label="Monto del DESCUENTO"/.test(pagina) && /e\.descuento !== null \? \[\]/.test(pagina) && /servicio: \{ monto: normalizarCantidadTexto\(e\.descuento\) \}/.test(pagina) && /originalesPendientes === 0/.test(pagina) && /setDescuento\(null\); \}\}/.test(pagina) && !/setEliminadas\(new Set\(factura\.lineas/.test(pagina.replace(/precarga\.servicio[^;]*;/, "")));
  cierto("E07-10 la corrección de una NCE rechazada con DESCUENTO precarga el servicio y deja la nota sin líneas originales; el motivo fijado y la corrección siguen intactos", /precarga\.servicio/.test(pagina) && /motivoFijado/.test(pagina) && /correccion\.cargar\(corregir\)/.test(pagina));

  // ── SQL NEX-070 (texto) ────────────────────────────────────────────────────────────────────────
  const sqlCrudo = leer("documentacao/banco/nexit/v1/migraciones/NEX-070-facturacion-nce-descuento.sql");
  const sql = sqlCrudo.replace(/--.*$/gm, "");
  const rev = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-070.sql");

  cierto("E07-11 NEX-070 es incremental: crea nce_descuentos (solo altas, anclada a nce_origen, monto > 0), reemplaza fe_documento_crear_nce con la MISMA firma y no depende de NEX-066…069 ni edita migraciones aplicadas", /CREATE TABLE public\.nce_descuentos/.test(sql) && /FOREIGN KEY \(empresa_id, nce_id, fe_id\) REFERENCES public\.nce_origen/.test(sql) && /monto\s+numeric\(24,8\) NOT NULL CHECK \(monto > 0\)/.test(sql) && /nce_descuentos_inmutable_fila_trg/.test(sql) && /p_empresa uuid, p_usuario uuid, p_sucursal uuid, p_punto uuid, p_clave text, p_fe uuid, p_motivo integer, p_lineas jsonb, p_moneda text, p_total numeric, p_payload jsonb/.test(sql) && !/fe_stock|fe_documento_crear_fe_con_stock|documento_electronico_entregas|fe_gateway_url_valida/.test(sql));
  cierto("E07-11 la función valida el servicio: solo motivos 3/4 y como único elemento; ítem del payload exacto (DESCUENTO, sin GTIN, unidad 77, cantidad 1, precio = monto, gravado, tasa 10, prop. 100); no toca stock", /p_motivo NOT IN \(3, 4\) OR jsonb_array_length\(p_lineas\) <> 1/.test(sql) && /'dCodInt', 'DESCUENTO'/.test(sql) && /'cUniMed', 77/.test(sql) && /'iAfecIVA', 1, 'dTasaIVA', 10, 'dPropIVA', 100/.test(sql) && !/movimiento|inventario|stock/i.test(sql));
  cierto("E07-11 saldo GLOBAL en SQL: Σ dTotOpeItem de la FE − (líneas + DESCUENTO de NCE aprobadas) bajo el bloqueo FOR UPDATE de la FE; se conservan CDC, receptor, motivo fijado, NCE pendiente, numeración, idempotencia y totales", /v_usado_glob \+ v_suma > v_fe_total/.test(sql) && /nce_descuentos nd JOIN public\.documentos_electronicos n/.test(sql) && /FOR UPDATE/.test(sql) && /NEX:ASOCIACION_INVALIDA/.test(sql) && /NEX:MOTIVO_FIJADO/.test(sql) && /NEX:NCE_PENDIENTE/.test(sql) && /fe_secuencia_reservar\(p_empresa, p_punto, 'NCE'\)/.test(sql) && /NEX:IDEMPOTENCIA_CONFLICTO/.test(sql) && /NEX:TOTAL_NO_CONCILIA/.test(sql) && /INSERT INTO public\.nce_descuentos/.test(sql));
  cierto("E07-11 permisos: la aplicación solo LEE nce_descuentos (la escribe únicamente la función); permiso CREAR de la función conservado; reversión se niega si ya hay descuentos y restaura NEX-065", /GRANT SELECT ON public\.nce_descuentos TO nexit_runtime/.test(sql) && /REVOKE ALL ON public\.nce_descuentos FROM nexit_runtime/.test(sql) && /usuario_tiene_permiso\(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR'\)/.test(sql) && /REVERSIÓN ABORTADA/.test(rev) && /CREATE OR REPLACE FUNCTION public\.fe_documento_crear_nce/.test(rev) && /DROP TABLE public\.nce_descuentos/.test(rev));
  cierto("E07-11 preflight, verificación y procedimiento de NEX-070 existen y declaran que NO está aplicada", /to_regprocedure/.test(leer("documentacao/banco/nexit/v1/scripts/preflight-NEX-070.sql")) && /ROLLBACK;/.test(leer("documentacao/banco/nexit/v1/scripts/verificar-NEX-070.sql")) && /NO aplicada/.test(leer("documentacao/banco/nexit/v1/docs/PROCEDIMIENTO-NEX-070.md")));

  // sin efectos de inventario en el código de la NCE
  cierto("E07-12 el servicio no genera movimiento de stock: ningún módulo de la NCE referencia inventario/stock", ["lib/facturacion/payload-nce.ts", "lib/facturacion/nce.ts", "lib/facturacion/nce-emision.ts"].every((f) => !/inventario_|movimientos?\b|fe_stock|aplicar_movimiento/i.test(sinCom(leer(f)))));
  cierto("E07-12 sin la migración el servicio queda NO disponible (la pantalla no lo ofrece y el servidor responde 409 antes de reservar numeración)", /servicioDescuento/.test(leer("lib/facturacion/nce.ts")) && /falta aplicar la migración NEX-070/.test(leer("lib/facturacion/nce.ts")) && /to_regclass\('public\.nce_descuentos'\)/.test(leer("lib/facturacion/nce.ts")));

  return fallos;
}
