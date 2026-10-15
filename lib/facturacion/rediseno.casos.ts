/**
 * PRO-128 — rediseño compacto de Nueva factura electrónica: IVA directo (E731/E733/E734), unidades de medida buscables, formato decimal exacto de importes, detección de cambios sin enviar, y estructura
 * de la pantalla (Operación a la vista, pago/crédito compactos, tabla compacta + panel fiscal contextual). Sin red y sin PostgreSQL; no hay navegador: la verificación visual (1440/1024/768/375 px, foco,
 * teclado) NO la hace esta suite — solo comprueba código, CSS y lógica. El motor fiscal, el contrato del cuerpo y el JSON no cambian: se comprueba con los mismos módulos que usan el servidor y el builder.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { AJUSTE_VACIO, ajusteParaEnvio, problemasFiscales, valoresEfectivos, type AjusteUI, type ProductoBase } from "@/lib/facturacion/ajuste-item";
import { formularioModificado, type EstadoFormulario } from "@/lib/facturacion/cambios-formulario";
import { CREDITO_UI_VACIO } from "@/lib/facturacion/credito";
import { cambiosPorOpcionIva, esParcial, etiquetaIva, OPCIONES_IVA, opcionIvaDe } from "@/lib/facturacion/iva-opciones";
import { PAGO_UI_VACIO } from "@/lib/facturacion/pagos";
import { construirPayloadFE, resumenCalculo, validarEntradaFE, type EntradaFE, type LineaFE, type ReceptorFE } from "@/lib/facturacion/payload-fe";
import { etiquetaUnidad, filtrarUnidades, type UnidadMedida } from "@/lib/facturacion/unidades";
import { formatearDecimalTexto } from "@/lib/formato/decimal-texto";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");
const HOY = "2026-10-15";

const receptor: ReceptorFE = { codigo: "CLI-000001", naturaleza: 1, tipoOperacion: 1, tipoContribuyente: 2, pais: "PRY", ruc: "80000005", dv: "6", tipoDocumentoIdentidad: null, descripcionTipoDocumento: "", numeroDocumento: "", razonSocial: "EMPRESA SINTETICA SA", nombreFantasia: "", direccion: "Calle 1", numeroCasa: "123", departamento: "1", distrito: "1", ciudad: "1", telefono: "", celular: "", email: "a@b.com", emailCopia: "", emailFacturacion: "" };
const producto = (extra: Partial<ProductoBase> = {}): ProductoBase => ({ unidadSifen: 77, unidadVigente: true, afectacion: 1, tasa: 10, proporcion: null, precio: "11000", monedaPrecio: "PYG", descripcion: "Producto", gtin: null, ...extra });

export async function verificarCasosRediseno(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const ajusteCon = (c: Partial<AjusteUI>): AjusteUI => ({ ...AJUSTE_VACIO, ...c });

  // ── 1. IVA directo: cada opción fija afectación + tasa (+ proporción) JUNTAS (E731, E734, E733) ─────────────────────────────────────────────
  igual("catálogo de opciones: Gravado 10/5, Exento, Exonerado, Gravado parcial 10/5 con su (E731, E734)", OPCIONES_IVA.map((o) => [o.etiqueta, o.afectacion, o.tasa, o.parcial]), [["Gravado IVA 10 %", 1, 10, false], ["Gravado IVA 5 %", 1, 5, false], ["Exento", 3, 0, false], ["Exonerado", 2, 0, false], ["Gravado parcial IVA 10 %", 4, 10, true], ["Gravado parcial IVA 5 %", 4, 5, true]]);
  igual("opcionIvaDe: clasificación → opción; incompleta o sin clasificar → vacío", [opcionIvaDe(1, 10), opcionIvaDe(1, 5), opcionIvaDe(3, 0), opcionIvaDe(2, 0), opcionIvaDe(4, 10), opcionIvaDe(4, 5), opcionIvaDe(null, null), opcionIvaDe(1, null), opcionIvaDe(1, 0)], ["G10", "G5", "EXE", "EXO", "P10", "P5", "", "", ""]);
  const g10 = producto();
  igual("UX-04 Gravado 10 → 5 directo: afectación y tasa juntas, sin proporción (ya no se ignora la tasa por falta de afectación)", cambiosPorOpcionIva("G5", g10, AJUSTE_VACIO), { afectacion: "1", tasa: "5", proporcion: "" });
  igual("Gravado 5 → 10", cambiosPorOpcionIva("G10", producto({ tasa: 5 }), AJUSTE_VACIO), { afectacion: "1", tasa: "10", proporcion: "" });
  igual("Exento y Exonerado → tasa 0 con su afectación (3 y 2)", [cambiosPorOpcionIva("EXE", g10, AJUSTE_VACIO), cambiosPorOpcionIva("EXO", g10, AJUSTE_VACIO)], [{ afectacion: "3", tasa: "0", proporcion: "" }, { afectacion: "2", tasa: "0", proporcion: "" }]);
  igual("Gravado parcial 10 % y 5 % desde un producto no parcial: afectación 4, tasa y proporción VACÍA a completar", [cambiosPorOpcionIva("P10", g10, AJUSTE_VACIO), cambiosPorOpcionIva("P5", g10, AJUSTE_VACIO)], [{ afectacion: "4", tasa: "10", proporcion: "" }, { afectacion: "4", tasa: "5", proporcion: "" }]);
  igual("volver a la clasificación del producto limpia el ajuste (no se envía ajuste redundante) y conserva solo lo demás", [cambiosPorOpcionIva("G10", g10, ajusteCon({ afectacion: "1", tasa: "5", guardar: true })), cambiosPorOpcionIva("", g10, ajusteCon({ afectacion: "1", tasa: "5" }))], [{ afectacion: "", tasa: "", proporcion: "", guardar: false }, { afectacion: "", tasa: "", proporcion: "", guardar: false }]);
  igual("parcial del propio producto: parte de su proporción; cambiar entre parciales no arrastra una proporción ajena", [cambiosPorOpcionIva("P10", producto({ afectacion: 4, tasa: 10, proporcion: "50" }), AJUSTE_VACIO), cambiosPorOpcionIva("P5", producto({ afectacion: 4, tasa: 10, proporcion: "50" }), ajusteCon({ afectacion: "4", tasa: "10", proporcion: "50" }))], [{ afectacion: "4", tasa: "10", proporcion: "50" }, { afectacion: "4", tasa: "5", proporcion: "50" }]);
  igual("esParcial y etiquetas", [esParcial("P10"), esParcial("P5"), esParcial("G10"), esParcial(""), etiquetaIva(1, 10, null), etiquetaIva(4, 5, "50"), etiquetaIva(3, 0, null), etiquetaIva(null, null, null)], [true, true, false, false, "Gravado IVA 10 %", "Gravado parcial IVA 5 % · 50 %", "Exento", "Sin clasificar"]);

  // contrato UI → cuerpo (ajuste) y validación: la misma que usa el servidor
  igual("ajuste enviado en 10 → 5: afectación 1, tasa 5, proporción null; igual al producto: nada que enviar", [ajusteParaEnvio(g10, ajusteCon(cambiosPorOpcionIva("G5", g10, AJUSTE_VACIO))), ajusteParaEnvio(g10, ajusteCon(cambiosPorOpcionIva("G10", g10, AJUSTE_VACIO)))], [{ afectacion: 1, tasa: 5, proporcion: null }, undefined]);
  igual("parcial sin proporción queda PENDIENTE; con proporción válida (0<p<100) se envía (4, tasa, proporción)", [problemasFiscales(g10, ajusteCon(cambiosPorOpcionIva("P10", g10, AJUSTE_VACIO)), "11000").some((m) => /proporción gravada/.test(m)), problemasFiscales(g10, ajusteCon({ afectacion: "4", tasa: "10", proporcion: "50" }), "11000").some((m) => /proporción gravada/.test(m)), ajusteParaEnvio(g10, ajusteCon({ afectacion: "4", tasa: "10", proporcion: "50" })), problemasFiscales(g10, ajusteCon({ afectacion: "4", tasa: "10", proporcion: "100" }), "11000").some((m) => /proporción gravada/.test(m))], [true, false, { afectacion: 4, tasa: 10, proporcion: "50" }, true]);
  const lineaFE = (afectacion: number, tasa: number, proporcion: string | null, precio = "10500"): LineaFE => ({ codigoInterno: "P-1", gtin: null, descripcion: "Producto", unidadSifen: 77, cantidad: "1", precio, afectacion, tasa, proporcion });
  const entrada = (l: LineaFE, total: string): EntradaFE => ({ moneda: "PYG", tipoTransaccion: 1, presencia: 1, condicion: 1, pagos: [{ tipo: 1, monto: total }], infoAdicional: "", receptor, lineas: [l] });
  const det = (l: LineaFE, total: string) => (construirPayloadFE(entrada(l, total), HOY) as { Detalles: Array<Record<string, unknown>>; Subtotales: Array<Record<string, number>> });
  const d10 = det(lineaFE(1, 10, null, "11000"), "11000");
  const d5 = det(lineaFE(1, 5, null, "10500"), "10500");
  igual("JSON Gravado 10 %: iAfecIVA 1, dTasaIVA 10, dPropIVA 100; IVA 1000", [d10.Detalles[0].iAfecIVA, d10.Detalles[0].dTasaIVA, d10.Detalles[0].dPropIVA, d10.Subtotales[0].dIVA10], [1, 10, 100, 1000]);
  igual("JSON Gravado 5 %: iAfecIVA 1, dTasaIVA 5, dPropIVA 100; IVA 500 (dIVA5), sin IVA 10", [d5.Detalles[0].iAfecIVA, d5.Detalles[0].dTasaIVA, d5.Detalles[0].dPropIVA, d5.Subtotales[0].dIVA5, d5.Subtotales[0].dIVA10], [1, 5, 100, 500, 0]);
  const dx = det(lineaFE(3, 0, null, "11000"), "11000");
  const dn = det(lineaFE(2, 0, null, "11000"), "11000");
  igual("JSON Exento (3, tasa 0) y Exonerado (2, tasa 0): sin base gravada ni IVA", [dx.Detalles[0].iAfecIVA, dx.Detalles[0].dTasaIVA, dx.Detalles[0].dBasGravIVA, dx.Subtotales[0].dTotIVA, dn.Detalles[0].iAfecIVA, dn.Detalles[0].dTasaIVA, dn.Detalles[0].dBasGravIVA, dn.Subtotales[0].dTotIVA], [3, 0, 0, 0, 2, 0, 0, 0]);
  const dp = det(lineaFE(4, 10, "50", "10500"), "10500");
  igual("JSON Gravado parcial 10 % al 50 %: iAfecIVA 4, dTasaIVA 10, dPropIVA 50 (E731/E734/E733), total conciliado", [dp.Detalles[0].iAfecIVA, dp.Detalles[0].dTasaIVA, dp.Detalles[0].dPropIVA, dp.Subtotales[0].dTotGralOpe], [4, 10, 50, 10500]);
  igual("P-11 conservado: el parcial con residuo (11.000 al 50 %) SIGUE bloqueado, sin arredondeo nuevo", validarEntradaFE(entrada(lineaFE(4, 10, "50", "11000"), "11000"), HOY).some((m) => /difiere de la suma de los ítems/.test(m)), true);
  igual("valores efectivos tras el ajuste directo (10 → 5): la línea se calcula con tasa 5", valoresEfectivos(g10, ajusteCon(cambiosPorOpcionIva("G5", g10, AJUSTE_VACIO))).tasa, 5);

  // ── 2. Unidades de medida: todas, buscables, sin fusionar ──────────────────────────────────────────────────────────────────────────────────
  const unidades: UnidadMedida[] = [
    { codigo: 77, representacion: "UNI", descripcion: "Unidad" }, { codigo: 131, representacion: "BX", descripcion: "Caja" }, { codigo: 113, representacion: "DOC", descripcion: "Docena" },
    { codigo: 87, representacion: "m", descripcion: "Metros" }, { codigo: 108, representacion: "m", descripcion: "Metros" }, { codigo: 83, representacion: "kg", descripcion: "Kilogramos" },
    ...Array.from({ length: 64 }, (_, i) => ({ codigo: 900 + i, representacion: `X${i}`, descripcion: `Relleno ${i}` })),
  ];
  igual("sin texto: TODAS las unidades (sin tope artificial)", filtrarUnidades(unidades, "").length, unidades.length);
  igual("buscar por nombre, símbolo y código (sin distinguir mayúsculas ni acentos)", [filtrarUnidades(unidades, "caja").map((u) => u.codigo), filtrarUnidades(unidades, "BX").map((u) => u.codigo), filtrarUnidades(unidades, "113").map((u) => u.codigo), filtrarUnidades(unidades, "DOCÉNA").map((u) => u.codigo), filtrarUnidades(unidades, "zzz").length], [[131], [131], [113], [113], 0]);
  igual("dos entradas con el mismo nombre y códigos distintos (Metros 87 y 108) se muestran SEPARADAS y con su código", [filtrarUnidades(unidades, "metros").map((u) => u.codigo), filtrarUnidades(unidades, "metros").map(etiquetaUnidad)], [[87, 108], ["Metros (m) · 87", "Metros (m) · 108"]]);
  igual("etiquetas «Nombre (SIM) · código»", [etiquetaUnidad(unidades[1]), etiquetaUnidad(unidades[2])], ["Caja (BX) · 131", "Docena (DOC) · 113"]);
  const m39 = leer("documentacao/banco/nexit/v1/migraciones/NEX-039-unidades-medida-sifen.sql");
  const m43 = leer("documentacao/banco/nexit/v1/migraciones/NEX-043-unidades-medida-sifen-nt023.sql");
  const filas = (t: string) => (t.match(/^ {2}\(\d+, '/gm) ?? []).length;
  igual("catálogo versionado: NEX-039 (34) + NEX-043 (30) = 64 entradas VERSIONADAS en el repositorio (no se afirma cuántas están vigentes en la VM)", [filas(m39), filas(m43), filas(m39) + filas(m43)], [34, 30, 64]);
  const emision = leer("lib/facturacion/emision.ts");
  cierto("la API de catálogos lee TODAS las unidades vigentes: SELECT … WHERE vigente, sin LIMIT; no altera la unidad física del producto", /FROM unidades_medida_sifen WHERE vigente ORDER BY descripcion, codigo/.test(emision) && !/unidades_medida_sifen WHERE vigente[^`]*LIMIT/.test(emision) && !/UPDATE\s+unidades_medida|unidad_medida_id\s*=/.test(emision));

  // ── 3. Importes: texto decimal exacto, nunca Number ────────────────────────────────────────────────────────────────────────────────────────
  igual("formato es-PY exacto desde texto", [formatearDecimalTexto("1234567.89"), formatearDecimalTexto("11000"), formatearDecimalTexto("0.5000"), formatearDecimalTexto("-12.50"), formatearDecimalTexto("1000000"), formatearDecimalTexto("0")], ["1.234.567,89", "11.000", "0,5", "-12,5", "1.000.000", "0"]);
  igual("no pierde dígitos en importes altos ni en la diferencia de 0,0001 (CA-08)", [formatearDecimalTexto("847688702356.7569"), formatearDecimalTexto("847688702356.7570"), formatearDecimalTexto("999999999999.9999"), formatearDecimalTexto("33000.0001")], ["847.688.702.356,7569", "847.688.702.356,757", "999.999.999.999,9999", "33.000,0001"]);
  igual("la presentación con Number SÍ habría perdido el valor (la premisa del defecto UX-30)", [Number("847688702356.7569").toLocaleString("es-PY", { maximumFractionDigits: 8 }) === "847.688.702.356,7569"], [false]);
  igual("texto no decimal o vacío: se devuelve tal cual / «—» (no se inventa un valor)", [formatearDecimalTexto("abc"), formatearDecimalTexto(""), formatearDecimalTexto(null), formatearDecimalTexto(undefined)], ["abc", "", "—", "—"]);
  const grande = resumenCalculo([{ codigoInterno: "P", gtin: null, descripcion: "x", unidadSifen: 83, cantidad: "1", precio: "847688702356.7569", afectacion: 3, tasa: 0, proporcion: null }]);
  igual("resumenCalculo.texto trae el mismo importe como Decimal exacto; los campos numéricos existentes no cambian de contrato", [grande.texto.total, grande.texto.items[0], typeof grande.total, typeof grande.items[0], Object.keys(grande).sort().join(",")], ["847688702356.7569", "847688702356.7569", "number", "number", "completo,exento,exonerado,gravado10,gravado5,items,iva10,iva5,texto,total,totalIva"]);

  // ── 4. Protección de cambios: toda decisión del operador cuenta ────────────────────────────────────────────────────────────────────────────
  const base: EstadoFormulario = { cliente: false, lineas: 0, infoAdicional: "", ubicacionElegidaPorElOperador: false, tipoTransaccion: "1", presencia: "1", condicion: "1", moneda: "PYG", cambio: "", pagos: [PAGO_UI_VACIO], credito: CREDITO_UI_VACIO };
  igual("formulario intacto (valores por defecto y sucursal/punto preseleccionados solos) → sin cambios, sin falsos positivos", formularioModificado(base), false);
  const cambios: Array<[string, Partial<EstadoFormulario>]> = [
    ["cliente", { cliente: true }], ["ítems", { lineas: 1 }], ["observaciones", { infoAdicional: "x" }], ["sucursal/punto elegidos por el operador", { ubicacionElegidaPorElOperador: true }],
    ["tipo de transacción", { tipoTransaccion: "2" }], ["presencia", { presencia: "2" }], ["condición", { condicion: "2" }], ["moneda", { moneda: "USD" }], ["cambio", { cambio: "7500" }],
    ["medio de pago", { pagos: [{ ...PAGO_UI_VACIO, tipo: "5" }] }], ["monto de un pago", { pagos: [{ ...PAGO_UI_VACIO, monto: "100" }] }], ["dato de cheque", { pagos: [{ ...PAGO_UI_VACIO, chequeBanco: "Banco" }] }],
    ["segundo medio", { pagos: [PAGO_UI_VACIO, PAGO_UI_VACIO] }], ["plazo de crédito", { credito: { ...CREDITO_UI_VACIO, plazoDias: "60" } }], ["entrega inicial", { credito: { ...CREDITO_UI_VACIO, entrega: "5000" } }],
  ];
  for (const [campo, c] of cambios) igual(`UX-29 cambiar ${campo} marca el formulario como modificado`, formularioModificado({ ...base, ...c }), true);
  igual("volver a los valores por defecto deja de marcarlo", [formularioModificado({ ...base, moneda: "USD" }), formularioModificado({ ...base, moneda: "PYG" })], [true, false]);

  // ── 5. Estructura de la pantalla ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const pagina = leer("app/(private)/facturas/nueva/page.tsx");
  const editor = leer("app/(private)/facturas/nueva/ajuste-fiscal-item.tsx");
  const medios = leer("app/(private)/facturas/nueva/medios-pago.tsx");
  const credito = leer("app/(private)/facturas/nueva/condicion-credito.tsx");
  const css = leer("app/(private)/facturas/nueva/page.module.css");
  const operacion = pagina.slice(pagina.indexOf('aria-labelledby="sec-operacion"'), pagina.indexOf('aria-labelledby="sec-cliente"'));
  cierto("CA-01 Operación a la vista: Sucursal, Punto, Condición, Moneda, Tipo de transacción e Indicador de presencia son campos directos (sin <details> «Parámetros fiscales»), con cambio condicional, enlace administrativo de puntos y N.º referencial", ["Sucursal *", "Punto de expedición *", "<span>Condición</span>", "<span>Moneda</span>", 'aria-label="Tipo de transacción"', 'aria-label="Indicador de presencia"', 'aria-label="Tipo de cambio"', "Configurar punto de expedición", "Próximo N.º (referencial)"].every((t) => operacion.includes(t)) && !/<details/.test(operacion) && !/Parámetros fiscales/.test(pagina) && /extranjera \? \(/.test(operacion));
  cierto("Operación conserva el cuerpo hacia la API: tipoTransaccion, presencia, moneda, cambio (solo extranjera), condición/crédito y pagos", /tipoTransaccion: Number\(tipoTransaccion\), presencia: Number\(presencia\), moneda, \.\.\.\(extranjera \? \{ cambio \} : \{\}\)/.test(pagina) && /condicion: Number\(condicion\)/.test(pagina));
  cierto("Pago compacto: una línea por medio (sin fieldset), «cubre …» para el medio único, monto/quitar solo con varios, subcampos solo de cheque, tarjeta y «Otro»; sin PAN/CVV; 20 medios; conciliación Decimal (sin Number/Math.abs)", !/<fieldset/.test(medios) && /cubre \{simbolo\}/.test(medios) && /varios \? \(/.test(medios) && /TIPO_CHEQUE \? \(/.test(medios) && /TIPO_OTRO \? \(/.test(medios) && /MAX_PAGOS/.test(medios) && !/Number\(p\.monto\)|Math\.abs|reduce\(/.test(medios) && /conciliacion\.coincide/.test(medios) && /No se solicita el número de la tarjeta ni el código de seguridad/.test(medios) && !/cvv|N° de tarjeta/i.test(medios.replace("ni el código de seguridad", "")));
  cierto("Crédito compacto: una línea con Plazo 30/60/90 + días, entrega inicial y saldo (Decimal); Cuotas suspendido (la opción solo existe si CUOTAS_HABILITADAS) y sin pago cuando no hay entrega", /\[30, 60, 90\]/.test(credito) && /Saldo a financiar/.test(credito) && /CUOTAS_HABILITADAS \? \(/.test(credito) && !/Number\(estado\.entrega|Math\.max/.test(credito) && /hayPagos = !enCredito \|\| \(entregaDec !== null/.test(pagina));
  cierto("Tabla compacta: Producto | IVA | Unidad | Cantidad | Precio | Subtotal | Acciones; NO hay fila fiscal por ítem (filaFiscal) y el editor se renderiza UNA sola vez, solo para el producto seleccionado", ["Producto", "IVA", "Unidad", "Cantidad", "Subtotal"].every((t) => pagina.includes(`<th>${t}</th>`) || pagina.includes(`<th className={estilos.num}>${t}</th>`)) && /Precio \(\{sim\}, IVA incl\.\)/.test(pagina) && !/filaFiscal/.test(pagina) && (pagina.match(/<EditorFiscalItem/g) ?? []).length === 1 && /editando !== null && lineas\.some/.test(pagina) && /setEditando\(seleccionada \? null : l\.clave\)/.test(pagina));
  cierto("el panel fiscal conserva el estado (no limpia datos al abrir/cerrar), solo existe con AJUSTE_FISCAL y el IVA se elige directo en la fila con las 6 opciones", /puedeAjustarFiscal && editando !== null/.test(pagina) && /OPCIONES_IVA\.map/.test(pagina) && /cambiosPorOpcionIva\(ev\.target\.value, l\.producto, l\.ajuste\)/.test(pagina) && !/setEditando\(null\)[^;]*editarAjuste|editarAjuste\([^)]*AJUSTE_VACIO/.test(pagina) && /alCerrar=\{\(\) => setEditando\(null\)\}/.test(pagina));
  cierto("etiquetas de negocio: «Unidad de medida» (nunca «Unidad SIFEN» como rótulo), «IVA», «Descripción fiscal», «GTIN»; el código SIFEN se muestra solo como dato en la lista; unidad/descripción/GTIN siguen siendo solo-documento", /Unidad de medida/.test(editor) && !/>Unidad SIFEN</.test(editor) && !/Unidad SIFEN/.test(pagina.replace(/\/\/.*$/gm, "")) && /<span>IVA<\/span>/.test(editor) && /etiquetaUnidad\(u\)/.test(editor) && /filtrarUnidades\(unidades, busqueda\)/.test(editor) && /no cambian el producto ni su unidad de stock/.test(editor));
  cierto("IVA: «Guardar también en Productos» sigue explícito y limitado a la clasificación de IVA, deshabilitado sin PRODUCTOS.EDITAR; «Solo esta factura» por defecto", /Solo esta factura \(recomendado\)/.test(editor) && /Guardar también en Productos \(solo la clasificación de IVA\)/.test(editor) && /disabled=\{!puedeEditarProductos\}/.test(editor) && /checked=\{!ajuste\.guardar\}/.test(editor));
  cierto("integridad: la protección de cambios usa formularioModificado y NINGÚN importe se formatea con Number/toLocaleString en la pantalla (todo con formatearDecimalTexto)", /formularioModificado\(\{/.test(pagina) && !/toLocaleString|gs\(|Number\(l\.precio\)|Number\(p\.monto\)|Number\(resumen\./.test(pagina) && /formatearDecimalTexto/.test(pagina));
  cierto("pendientes objetivos: sin el bloque rojo repetido de «datos fiscales pendientes»; pendiente por fila corta y lista única en el resumen lateral", !/Hay ítems con datos fiscales pendientes/.test(pagina) && /Pendientes de validación/.test(pagina) && /Completar: /.test(pagina) && (pagina.match(/Pendientes de validación/g) ?? []).length === 1);
  cierto("sin funcionalidad fuera de alcance: no hay controles de descuentos, anticipos, lotes, series, GTIN de embalaje, importación ni B2G en la pantalla; Cuotas no se ofrece", !/Descuento|Anticipo|N° de serie|embalaje|importaci[oó]n|B2G|Vencimiento de mercader/i.test(pagina + editor + medios + credito) && /CUOTAS_HABILITADAS = false/.test(leer("lib/facturacion/credito.ts")));
  cierto("responsive: puntos de corte 1099/900/760 px, tabla como tarjetas bajo 900 px (data-label), controles a ancho completo bajo 760 px y panel/filas compactos", /@media \(max-width: 1099px\)/.test(css) && /@media \(max-width: 900px\)/.test(css) && /@media \(max-width: 760px\)/.test(css) && /td\[data-label\]::before/.test(css) && /\.itemsCompacta/.test(css) && /\.panelFiscal/.test(css) && /\.pagoFila/.test(css) && /\.campoUnidad \{\s*grid-column: auto;/.test(css) && /data-label="IVA"/.test(pagina) && /data-label="Subtotal"/.test(pagina));
  cierto("accesibilidad: cada control con etiqueta o aria-label, errores por campo y panel con nombre accesible; el botón de datos fiscales anuncia aria-expanded", /aria-label=\{`IVA de \$\{l\.producto\.codigo\}`\}/.test(pagina) && /aria-expanded=\{seleccionada\}/.test(pagina) && /aria-label=\{`Datos fiscales de \$\{base\}`\}/.test(editor) && /aria-label=\{`Buscar unidad de medida de \$\{base\}`\}/.test(editor) && /aria-invalid=\{cantOk \? undefined : true\}/.test(pagina));
  cierto("el servidor, las APIs, el motor fiscal y las migraciones no cambian en esta etapa: solo se AÑADEN textos decimales a la respuesta de la previa (resumen.totalesTexto / lineas[].totalTexto)", /totalesTexto: calculo\.texto/.test(emision) && /totalTexto: calculo\.texto\.items\[i\]/.test(emision) && !/calculo\.texto/.test(leer("lib/facturacion/calculo.ts")));

  return fallos;
}
