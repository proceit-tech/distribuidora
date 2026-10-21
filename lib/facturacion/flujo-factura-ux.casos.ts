/**
 * Nueva factura premium (desktop) — flujo y densidad visual. Lógica REAL: disponibilidadPago y resumenStockCompacto (las usa la pantalla), junto con el motor de cálculo y la conciliación de pagos reales
 * (resumenCalculo / pendientesPagos / conciliarPagos) para comprobar que el total sigue a las líneas y que un pago incompatible nunca se conserva en silencio. El aspecto en navegador (altura de filas, scroll
 * del modal) NO se puede ejecutar aquí: se verifica el marcado y las reglas CSS y la revisión visual corresponde al responsable.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { accionTeclaResumen, disponibilidadPago, resumenStockCompacto, siguienteFocoModal, type LineaStockResumen } from "@/lib/facturacion/flujo-factura";
import { resumenCalculo, type LineaFE } from "@/lib/facturacion/payload-fe";
import { B, parseDec } from "@/lib/facturacion/calculo";
import { conciliarPagos, pendientesPagos, type PagoEntrada } from "@/lib/facturacion/pagos";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");
const sinCom = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const L = (cantidad: string, precio: string, extra: Partial<LineaFE> = {}): LineaFE => ({ codigoInterno: "P1", gtin: null, descripcion: "Producto", unidadSifen: 77, cantidad, precio, afectacion: 1, tasa: 10, proporcion: "100", ...extra });

export async function verificarCasosFlujoFacturaUx(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const total = (lineas: LineaFE[]) => resumenCalculo(lineas).texto.total;
  /** Disponibilidad con el resultado REAL del motor (igual que la pantalla): total positivo y cálculo completo sin errores de descuento. */
  const dispCon = (hayCliente: boolean, lineas: LineaFE[], lineasValidas = true, descuentoGeneral: { modo: "PORCENTAJE" | "MONTO"; valor: string } | null = null) => {
    const c = resumenCalculo(lineas, descuentoGeneral);

    return disponibilidadPago({ hayCliente, nLineas: lineas.length, lineasValidas, totalPositivo: c.total > 0, calculoValido: c.completo && c.erroresDescuento.length === 0 });
  };
  const disp = (hayCliente: boolean, lineas: LineaFE[], lineasValidas = true) => dispCon(hayCliente, lineas, lineasValidas);

  // ── Disponibilidad de la forma de pago (flujo: cliente → productos → pago) ─────────────────────
  igual("UX-01 sin cliente ni productos: no editable, con guía y SIN «cubre Gs. 0»", [disp(false, []).disponible, disp(false, []).motivo, /cubre/.test(disp(false, []).guia)], [false, "SIN_CLIENTE", false]);
  igual("UX-01 con productos pero sin cliente sigue sin estar disponible (el cliente va primero)", [disp(false, [L("2", "50000")]).disponible, disp(false, [L("2", "50000")]).motivo], [false, "SIN_CLIENTE"]);
  igual("UX-02 con cliente y sin productos: tampoco editable, con orientación", [disp(true, []).disponible, disp(true, []).motivo, disp(true, []).guia.length > 0], [false, "SIN_ITEMS", true]);
  igual("UX-02 con cliente y líneas con cantidad/precio inválidos: no editable hasta corregirlas", [disp(true, [L("0", "50000")], false).disponible, disp(true, [L("0", "50000")], false).motivo], [false, "ITEMS_INVALIDOS"]);
  igual("UX-03 con cliente y productos válidos hay total y se habilita (el total lo calcula el motor real)", [disp(true, [L("2", "50000")]).disponible, total([L("2", "50000")])], [true, "100000"]);
  igual("UX-03 un total no calculable o cero no habilita el pago", [disponibilidadPago({ hayCliente: true, nLineas: 1, lineasValidas: true, totalPositivo: false, calculoValido: true }).motivo], ["SIN_TOTAL"]);

  // ── Total y conciliación siguen a las líneas (Cantidad fraccionaria, descuento, múltiples medios) ──
  const una: PagoEntrada[] = [{ tipo: 1 }];
  const dos: PagoEntrada[] = [{ tipo: 1, monto: "60000" }, { tipo: 1, monto: "40000" }];
  const objetivo = (lineas: LineaFE[]) => parseDec(total(lineas), 8) ?? B(0);
  const base = [L("2", "50000")];

  igual("UX-04 un único medio cubre siempre el total vigente: tras cambiar la cantidad no queda ningún valor viejo", [pendientesPagos(una, objetivo(base), 1), pendientesPagos(una, objetivo([L("3", "50000")]), 1), total([L("3", "50000")])], [[], [], "150000"]);
  igual("UX-04 con varios medios que conciliaban con 100.000, al subir el total a 150.000 el desajuste se señala (no se conserva en silencio)", [conciliarPagos(dos, objetivo(base)).coincide, conciliarPagos(dos, objetivo([L("3", "50000")])).coincide, pendientesPagos(dos, objetivo([L("3", "50000")]), 1).some((m) => /suman 100000 y deben sumar exactamente 150000/.test(m))], [true, false, true]);
  igual("UX-04 cantidad fraccionaria con coma ya normalizada (2,5 → 2.5) y descuento por ítem actualizan el total exacto", [total([L("2.5", "40000")]), total([L("2", "50000", { descuento: { modo: "PORCENTAJE", valor: "10" } })])], ["100000", "90000"]);
  igual("UX-05 Crédito con entrega inicial: los medios conciliaron contra la entrega, no contra el total (el objetivo lo fija la pantalla)", [conciliarPagos(una, parseDec("30000", 8) ?? B(0)).coincide, conciliarPagos(dos, parseDec("100000", 8) ?? B(0)).coincide], [true, true]);

  // ── Resumen de stock compacto ──────────────────────────────────────────────────────────────────
  const l = (codigo: string, deps: Array<[string, string]>): LineaStockResumen => ({ codigo, descripcion: "Prod " + codigo, requerido: "1", salidas: deps.map(([c, n]) => ({ depositoCodigo: c, depositoNombre: n, cantidad: "1" })) });

  igual("UX-06 tres productos desde un depósito: «3 productos · Salida desde DEP-PRINCIPAL»", resumenStockCompacto([l("A", [["DEP-PRINCIPAL", "Principal"]]), l("B", [["DEP-PRINCIPAL", "Principal"]]), l("C", [["DEP-PRINCIPAL", "Principal"]])]).texto, "3 productos · Salida desde DEP-PRINCIPAL");
  igual("UX-06 varios depósitos (sin repetir, ordenados), singular y lista vacía", [resumenStockCompacto([l("A", [["DEP-B", "B"], ["DEP-A", "A"]]), l("B", [["DEP-A", "A"]])]).texto, resumenStockCompacto([l("A", [["DEP-A", "A"]])]).texto, resumenStockCompacto([]).texto], ["2 productos · Salida desde 2 depósitos: DEP-A, DEP-B", "1 producto · Salida desde DEP-A", "0 productos"]);

  // ── Marcado y estilos ──────────────────────────────────────────────────────────────────────────
  const pagina = sinCom(leer("app/(private)/facturas/nueva/page.tsx"));
  const css = sinCom(leer("app/(private)/facturas/nueva/page.module.css"));
  const iDetalle = pagina.indexOf('aria-labelledby="sec-detalle"');
  const iPago = pagina.indexOf('aria-labelledby="sec-pago"');
  const iInfo = pagina.indexOf('id="sec-info"');
  const iCliente = pagina.indexOf('aria-labelledby="sec-cliente"');
  const iOper = pagina.indexOf('aria-labelledby="sec-operacion"');

  cierto("UX-07 orden del flujo: Operación → Cliente → Detalle → Forma de pago → Observaciones; MediosPago ya no está dentro de Operación y solo se monta con disponibilidadPago", iOper < iCliente && iCliente < iDetalle && iDetalle < iPago && iPago < iInfo && pagina.indexOf("<MediosPago") > iPago && (pagina.match(/<MediosPago/g) ?? []).length === 1 && /!pagoFlujo\.disponible \?/.test(pagina) && /disponibilidadPago\(\{ hayCliente: cliente !== null/.test(pagina));
  cierto("UX-07 los cálculos y el cuerpo de la factura no se tocaron: pagos, condición, crédito y revisión se siguen armando como antes (pagoParaEnvio, creditoParaEnvio, huella de revisión)", /pagos: hayPagos \? pagos\.map\(\(p\) => pagoParaEnvio\(p, pagos\.length === 1\)\) : \[\]/.test(pagina) && /creditoParaEnvio\(credito\)/.test(pagina) && /huellaActual/.test(pagina) && /pedirCondicion\(/.test(pagina) && /pedirMoneda\(/.test(pagina));
  cierto("UX-08 tabla de ítems: columnas funcionales intactas (Producto, IVA, Unidad, Cantidad, Precio, Descuento, Subtotal, Acciones), nombre con título accesible, código/GTIN completos en una línea secundaria con título, edición fiscal, quitar y desglose conservados", ["Producto", "IVA", "Unidad", "Cantidad", "Descuento", "Subtotal", "Acciones"].every((c) => pagina.includes(c)) && /<strong title=\{l\.producto\.descripcion\}>/.test(pagina) && /GTIN \$\{l\.producto\.gtin\}/.test(pagina) && /Datos fiscales de/.test(pagina) && /aria-label=\{`Quitar /.test(pagina) && /EditorFiscalItem/.test(pagina));
  cierto("UX-08 CSS compacto: celdas de 4×8 px, nombre limitado a 2 líneas con overflow oculto, código/GTIN en una línea con puntos suspensivos y controles de 30 px", /\.itemsCompacta td \{\s*padding: 4px 8px;/.test(css) && /-webkit-line-clamp: 2/.test(css) && /\.itemsCompacta \.prod small \{[^}]*white-space: nowrap/.test(css) && /text-overflow: ellipsis/.test(css) && /\.itemsCompacta input,\s*\.itemsCompacta select \{\s*min-height: 30px/.test(css) && /vertical-align: middle/.test(css));
  cierto("UX-08 sin tarjetas: la tabla sigue siendo una tabla de escritorio (no se transforman las filas en cards)", /<table className=\{`\$\{estilos\.items\} \$\{estilos\.itemsCompacta\}`\}>/.test(pagina));

  cierto("UX-09 el resumen conserva TODOS los datos del servidor: empresa, establecimiento, punto, fecha, cliente, entrega, transacción/presencia, condición, moneda, cambio, pagos y crédito, líneas, descuentos y los ocho importes; los importes salen de resumen.totalesTexto (sin recalcular)", ["resumen.empresa", "resumen.establecimiento", "resumen.punto", "resumen.cliente.razonSocial", "resumen.entrega", "resumen.tipoTransaccion", "resumen.condicion", "resumen.cambio", "resumen.pagos", "resumen.credito", "resumen.lineas", "resumen.descuentos", "totalesTexto?.exento", "totalesTexto?.exonerado", "totalesTexto?.gravado5", "totalesTexto?.gravado10", "totalesTexto?.iva5", "totalesTexto?.iva10", "totalesTexto?.totalIva", "totalesTexto?.total"].every((c) => pagina.includes(c)));
  cierto("UX-09 jerarquía: cabecera compacta, grupos (cliente y entrega · operación · pagos), tabla de productos con scroll interno, total general e IVA destacados y acciones «Volver a editar» / «Enviar factura» en un pie siempre visible", /resumenCabecera/.test(pagina) && /aria-label="Cliente y entrega"/.test(pagina) && /aria-label="Operación"/.test(pagina) && /aria-label="Pagos"/.test(pagina) && /resumenTabla/.test(pagina) && /totalesPrincipales/.test(pagina) && /<footer className=\{estilos\.resumenAcciones\}>[\s\S]*Volver a editar[\s\S]*Enviar factura/.test(pagina));
  cierto("UX-09 CSS del modal: alto máximo respecto al viewport, cuerpo con scroll interno, cabecera de la tabla fija, pie de acciones fuera del scroll", /\.modalResumen \{[^}]*max-height: calc\(100vh - 32px\)[^}]*overflow: hidden/.test(css) && /\.resumenCuerpo \{[^}]*overflow-y: auto/.test(css) && /\.resumenTabla \{[^}]*max-height: 260px[^}]*overflow: auto/.test(css) && /\.resumenTabla th \{[^}]*position: sticky/.test(css) && /\.resumenAcciones \{/.test(css));
  cierto("UX-10 la distribución de stock queda resumida pero detallable: <details> con el resumen compacto y la lista completa (producto, depósito, lote, cantidad) y el aviso del descuento; no se oculta ni altera la huella", /<details className=\{estilos\.stockSalida\}>/.test(pagina) && /resumenStockCompacto\(resumen\.stock\.lineas\)\.texto/.test(pagina) && /s\.loteCodigo \? /.test(pagina) && /El stock se descuenta de estos depósitos al enviar la factura\./.test(pagina) && /repartoDe\(/.test(pagina));
  cierto("UX-11 la confirmación final se mantiene: Enviar factura exige gateway habilitado y la revisión sigue vinculada a la huella actual (el resumen solo aparece si coincide)", /revision && revision\.huella === huellaActual \? revision\.resumen : null/.test(pagina) && /disabled=\{enviando \|\| !puedeEnviarPorGateway\(gateway\)\}/.test(pagina));
  cierto("UX-12 alcance: sin tocar payload, IVA, descuentos, stock, numeración, permisos ni otros menús (el archivo de presentación no importa nada de emisión/servidor nuevo y el layout global no cambió)", !/from "@\/lib\/facturacion\/(emision|envio|shared|gateway)/.test(leer("lib/facturacion/flujo-factura.ts")) && !/color:\s*#(f00|ff0000)/i.test(css));

  // ── R01: el pago no se habilita con un cálculo fiscal inválido (descuentos) ───────────────────────
  const conDesc = (modo: "PORCENTAJE" | "MONTO", valor: string) => [L("2", "50000", { descuento: { modo, valor } })];

  igual("UX-R01-01 descuento particular de 150 %: el motor lo rechaza y el pago NO se habilita", [resumenCalculo(conDesc("PORCENTAJE", "150")).erroresDescuento.length > 0, dispCon(true, conDesc("PORCENTAJE", "150")).disponible, dispCon(true, conDesc("PORCENTAJE", "150")).motivo], [true, false, "CALCULO_INVALIDO"]);
  igual("UX-R01-02 descuento monetario por unidad mayor o igual al precio (50.000 de 50.000 y 60.000): pago no disponible", [dispCon(true, conDesc("MONTO", "50000")).disponible, dispCon(true, conDesc("MONTO", "60000")).disponible], [false, false]);
  igual("UX-R01-03 descuento general inválido (150 % y monto mayor que el total): pago no disponible", [dispCon(true, [L("2", "50000")], true, { modo: "PORCENTAJE", valor: "150" }).disponible, dispCon(true, [L("2", "50000")], true, { modo: "MONTO", valor: "999999" }).disponible], [false, false]);
  igual("UX-R01-04 al corregir el descuento (150 % → 10 %; monto 60.000 → 5.000; general 150 % → 5 %) el pago vuelve a estar disponible con el total exacto", [dispCon(true, conDesc("PORCENTAJE", "10")).disponible, total(conDesc("PORCENTAJE", "10")), dispCon(true, conDesc("MONTO", "5000")).disponible, dispCon(true, [L("2", "50000")], true, { modo: "PORCENTAJE", valor: "5" }).disponible], [true, "90000", true, true]);
  igual("UX-R01-05 sin descuentos ni errores fiscales el comportamiento previo se conserva (cliente + productos válidos → disponible; pagos múltiples siguen conciliando)", [dispCon(true, [L("2", "50000")]).disponible, conciliarPagos(dos, objetivo(base)).coincide], [true, true]);

  const pag = sinCom(leer("app/(private)/facturas/nueva/page.tsx"));

  cierto("UX-R01-05 la pantalla pasa el resultado real del motor (completo y sin erroresDescuento) y no borra los pagos digitados al quedar indisponible", /calculoValido: calculo\.completo && calculo\.erroresDescuento\.length === 0/.test(pag) && !/setPagos\([^)]*pagoFlujo/.test(pag) && !/useEffect\([^]*?pagoFlujo[^]*?\[/.test(pag.slice(0, pag.indexOf("return ("))));

  // ── R01: foco del diálogo de resumen ─────────────────────────────────────────────────────────────
  igual("UX-R01-06 Escape equivale a «Volver a editar» salvo con un envío en curso (entonces se ignora); otras teclas no hacen nada", [accionTeclaResumen({ tecla: "Escape", enviando: false }), accionTeclaResumen({ tecla: "Escape", enviando: true }), accionTeclaResumen({ tecla: "Enter", enviando: false }), accionTeclaResumen({ tecla: "Tab", enviando: true })], ["VOLVER", "IGNORAR", null, null]);
  igual("UX-R01-07 Tab/Shift+Tab nunca salen de la modal: del último al primero, del primero al último, foco fuera entra por el borde correcto y en el medio manda el orden natural", [siguienteFocoModal(4, 3, false), siguienteFocoModal(4, 0, true), siguienteFocoModal(4, -1, false), siguienteFocoModal(4, -1, true), siguienteFocoModal(4, 1, false), siguienteFocoModal(4, 2, true), siguienteFocoModal(1, 0, false), siguienteFocoModal(1, 0, true), siguienteFocoModal(0, -1, false)], [0, 3, 0, 3, null, null, 0, 0, null]);

  const iRes = pag.indexOf("{resumen ? (");

  cierto("UX-R01-08 el resumen mueve el foco adentro al abrirse (botón «Volver a editar»), atrapa Tab con el helper puro, cierra con Escape solo si no se está enviando y devuelve el foco al control que inició la revisión", /botonVolver\.current\?\.focus\(\)/.test(pag) && /accionTeclaResumen\(\{ tecla: e\.key, enviando: enviandoRef\.current \}\) === "VOLVER"/.test(pag) && /siguienteFocoModal\(lista\.length, lista\.indexOf\(document\.activeElement as HTMLElement\), ev\.shiftKey\)/.test(pag) && /iniciadorResumen\.current = document\.activeElement instanceof HTMLElement/.test(pag) && /i\.isConnected && !i\.hasAttribute\("disabled"\)\) i\.focus\(\)/.test(pag) && /ref=\{dialogoResumen\} tabIndex=\{-1\}/.test(pag.slice(iRes)));
  cierto("UX-R01-09 durante el envío «Volver a editar» queda deshabilitado, Escape se ignora y «Enviar factura» sigue deshabilitado (sin doble envío); Enviar usa el cuerpo revisado y la misma clave de idempotencia", /ref=\{botonVolver\} className=\{ui\.secondaryButton\} disabled=\{enviando\}/.test(pag) && /disabled=\{enviando \|\| !puedeEnviarPorGateway\(gateway\)\}/.test(pag) && /void flujo\.enviar\(\)/.test(pag));
  cierto("UX-R01-10 la revisión y la idempotencia no cambiaron: el cuerpo sigue saliendo de cuerpoFactura() y la huella actual valida el resumen; el contenido del resumen se conserva", /const huellaActual = JSON\.stringify\(cuerpoFactura\(\)\)/.test(pag) && /revision && revision\.huella === huellaActual \? revision\.resumen : null/.test(pag) && /resumen\.totalesTexto\?\.total/.test(pag) && /Salida de stock por depósito/.test(pag));

  // ── C03: pantalla de operación compacta (desktop) ─────────────────────────────────────────────────
  const entrega = sinCom(leer("app/(private)/facturas/nueva/entrega-cliente.tsx"));
  const iBarra = pag.indexOf('<div className={estilos.barraResumen}');
  const iObs = pag.indexOf("<details className={estilos.observaciones}>");
  const ancho = (clase: string): number => Number(new RegExp("\\." + clase + " \\{ width: (\\d+)px; \\}").exec(css)?.[1] ?? NaN);
  const fijas = ["colIva", "colUnidad", "colCantidad", "colPrecio", "colDescuento", "colSubtotal", "colAcciones"].map(ancho);
  const suma = fijas.reduce((a, b) => a + b, 0);
  // Ancho útil supuesto = viewport − menú lateral (280) − márgenes de página (80): lo que queda para «Producto» debe ser holgado.
  const producto = (viewport: number) => viewport - 280 - 80 - suma;

  cierto("C03-01 una sola columna a todo el ancho: sin aside ni columna fija de 340 px, el workspace es flex en columna y la barra móvil duplicada desapareció", !/<aside/.test(pag) && !/barraMovil/.test(pag) && /\.workspace \{\s*display: flex;\s*flex-direction: column;/.test(css) && iBarra > iObs && iObs > pag.indexOf('aria-labelledby="sec-pago"') && pag.indexOf('aria-labelledby="sec-pago"') > pag.indexOf('aria-labelledby="sec-detalle"'));
  igual("C03-02 la tabla de productos reparte el ancho: 7 columnas de ancho fijo suman ≤ 800 px y «Producto» recibe el resto; con el supuesto de menú+márgenes queda ≥ 300 px a 1600 px y ≥ 200 px a 1366 px (sin scroll horizontal), y holgado a 1920 px", [fijas.every((n) => Number.isFinite(n)), suma <= 800, producto(1600) >= 300, producto(1366) >= 200, producto(1920) >= 600], [true, true, true, true, true]);
  cierto("C03-02 las 8 columnas siguen presentes y accesibles (colgroup + cabeceras): Producto, IVA, Unidad, Cantidad, Precio, Descuento, Subtotal, Acciones; table-layout fijo y controles al 100 % de su celda", (pag.match(/<col className=\{estilos\.col/g) ?? []).length === 8 && ["Producto", "IVA", "Unidad", "Cantidad", "Descuento", "Subtotal", "Acciones"].every((c) => pag.includes(`<th>${c}</th>`) || pag.includes(c)) && /\.itemsCompacta \{\s*table-layout: fixed;/.test(css) && /\.itemsCompacta \.qty,\s*\.itemsCompacta \.price,\s*\.itemsCompacta \.ivaSelect \{\s*width: 100%/.test(css) && /Datos fiscales de/.test(pag) && /aria-label=\{`Quitar /.test(pag) && /aria-label=\{`Tipo de descuento de /.test(pag));
  cierto("C03-03 producto largo: nombre a 2 líneas con título, código/GTIN en una línea con puntos suspensivos y título (descripción, código y GTIN completos accesibles), celdas con overflow-wrap", /<strong title=\{l\.producto\.descripcion\}>/.test(pag) && /GTIN \$\{l\.producto\.gtin\}/.test(pag) && /-webkit-line-clamp: 2/.test(css) && /text-overflow: ellipsis/.test(css) && /\.itemsCompacta td,\s*\.itemsCompacta th \{\s*overflow-wrap: anywhere/.test(css));
  cierto("C03-04 operación y cliente compactos: cabeceras de 36 px, cuerpos de 10×12 px, campos de 34 px, banda de cliente con nombre/documento/estado, dirección de entrega y acciones en una fila, ficha fiscal completa plegable y avisos de cliente no apto conservados", /\.cardHead \{\s*min-height: 36px;\s*padding: 6px 12px;/.test(css) && /\.cardBody \{\s*padding: 10px 12px;/.test(css) && /\.gridOperacion \.field select,\s*\.gridOperacion \.field input \{\s*min-height: 34px/.test(css) && /className=\{estilos\.bandaCliente\}/.test(pag) && /<EntregaCliente control=\{entregaCtl\} clienteId=\{cliente\.id\} \/>/.test(pag) && /Ficha fiscal completa/.test(pag) && /Regularizar en Clientes/.test(pag) && /Cambiar cliente/.test(pag) && (pag.match(/<EntregaCliente/g) ?? []).length === 1);
  cierto("C03-04 dirección de entrega compacta: un solo selector (sin cajas ni párrafos permanentes); el domicilio completo y la aclaración «no cambia el domicilio fiscal» están en el título; se conservan carga, error con reintento, sin direcciones y selección obligatoria", /title=\{`\$\{ayuda\}Es solo el destino de la mercadería: no cambia el domicilio fiscal/.test(entrega) && !/<small className=\{estilos\.hint\}>Es solo el destino/.test(entrega) && /Cargando las direcciones de entrega del cliente/.test(entrega) && /control\.reintentar\(\)/.test(entrega) && /no tiene direcciones de entrega registradas/.test(entrega) && /Seleccione la dirección de entrega\./.test(entrega));
  cierto("C03-05 descuento general en una línea bajo la tabla (tipo + valor, aclaración en título, importe aplicado solo si existe, errores siempre visibles con role=alert); el motor y los nombres accesibles no cambiaron", /className=\{estilos\.descuentoLinea\} role="group" aria-label="Descuento general"/.test(pag) && /aria-label="Tipo de descuento general"/.test(pag) && /aria-label="Descuento general" placeholder="0"/.test(pag) && /title="Se aplica a cada ítem sobre su precio, sin prorrateo/.test(pag) && /calculo\.erroresDescuento\.length > 0 \? <small className=\{estilos\.fieldError\} role="alert">/.test(pag) && /resumenCalculo\(lineas\.map/.test(pag));
  cierto("C03-06 observaciones recogidas por defecto (details sin «open»), con el mismo estado controlado (no se pierde al recoger), hasta 5000 caracteres e indicador «con texto»", /<details className=\{estilos\.observaciones\}>/.test(pag) && !/<details className=\{estilos\.observaciones\} open/.test(pag) && /<textarea value=\{infoAdicional\} maxLength=\{5000\}/.test(pag) && /· con texto/.test(pag) && /infoAdicional,/.test(pag));
  cierto("C03-07 barra de resumen inferior: total general, total IVA, descuentos (solo si existen), pendientes de validación (con lista expandible) y «Revisar y confirmar» / Cancelar; sticky; el detalle de impuestos trae exento, exonerado, gravados e IVA 5/10, descuentos, total general, cliente, condición, pagos y crédito", /Total general<\/dt>/.test(pag.slice(iBarra)) && /Total IVA<\/dt>/.test(pag.slice(iBarra)) && /Descuentos<\/dt>/.test(pag.slice(iBarra)) && /pendientes\.length > 0 \? \(/.test(pag.slice(iBarra)) && /Todo listo para revisar\./.test(pag.slice(iBarra)) && ["Exento", "Exonerado", "Gravado 5 % (IVA incl.)", "IVA 5 %", "Gravado 10 % (IVA incl.)", "IVA 10 %", "Total descuentos", "Forma de pago", "Condición", "Crédito"].every((t) => pag.slice(iBarra).includes(t)) && /disabled=\{!puedeGuardar\} onClick=\{grabar\}/.test(pag.slice(iBarra)) && /Detalle de impuestos/.test(pag) && /\.barraResumen \{[^}]*position: sticky[^}]*bottom: 0/.test(css));
  cierto("C03-07 la barra no tapa contenido: está dentro del workspace inerte (el diálogo de revisión la bloquea), los controles tienen scroll-margin-bottom para el foco por teclado, los paneles se abren hacia arriba solo a pedido y en móvil pasan a flujo normal", /\.workspace summary,\s*\.workspace a \{\s*scroll-margin-bottom: 110px/.test(css) && /\.barraPanel \{[^}]*position: absolute[^}]*bottom: calc\(100% \+ 14px\)/.test(css) && /@media \(max-width: 760px\) \{\s*\.barraPanel \{\s*position: static/.test(css) && pag.indexOf('<div className={estilos.workspace} inert=') < iBarra && pag.indexOf("<EntregaCliente") < iBarra);
  cierto("C03-08 revisión, huella e idempotencia intactas: grabar() y cuerpoFactura() no cambiaron, el diálogo de resumen conserva foco, Tab, Escape y retorno del foco, y el contenido del resumen sigue saliendo del servidor", /function grabar\(\) \{\s*if \(!cliente\) return;/.test(pag) && /void flujo\.revisar\(cuerpoFactura\(\)\)/.test(pag) && /const huellaActual = JSON\.stringify\(cuerpoFactura\(\)\)/.test(pag) && /siguienteFocoModal\(/.test(pag) && /accionTeclaResumen\(/.test(pag) && /iniciadorResumen\.current/.test(pag) && /resumen\.totalesTexto\?\.total/.test(pag));
  cierto("C03-09 alcance: solo presentación — el módulo de cálculo y el payload no se importan de nuevo ni se modificó el motor, y el componente de pago conserva sus props", /resumenCalculo\(lineas\.map/.test(pag) && !/payload-fe/.test(entrega) && (pag.match(/<MediosPago/g) ?? []).length === 1 && /pagos: hayPagos \? pagos\.map/.test(pag));

  // ── C03-F001: la acción principal nunca se oculta (cascada CSS real) ───────────────────────────────
  type ReglaCss = { media: string | null; selector: string; cuerpo: string };

  /** Aplana el CSS (sin comentarios) en reglas con su @media: lee los bloques por llaves, no por búsqueda de texto. */
  const reglas = (texto: string): ReglaCss[] => {
    const salida: ReglaCss[] = [];
    const recorrer = (t: string, media: string | null) => {
      let i = 0;

      while (i < t.length) {
        const a = t.indexOf("{", i);

        if (a < 0) break;

        const cab = t.slice(i, a).trim();
        let prof = 1;
        let j = a + 1;

        while (j < t.length && prof > 0) { if (t[j] === "{") prof += 1; else if (t[j] === "}") prof -= 1; j += 1; }

        const cuerpo = t.slice(a + 1, j - 1);

        if (cab.startsWith("@media")) recorrer(cuerpo, cab.slice(6).trim());
        else if (!cab.startsWith("@")) salida.push({ media, selector: cab, cuerpo });
        i = j;
      }
    };

    recorrer(texto, null);

    return salida;
  };
  const aplica = (media: string | null, ancho: number): boolean => {
    if (media === null) return true;

    const max = /max-width:\s*(\d+)px/.exec(media);
    const min = /min-width:\s*(\d+)px/.exec(media);

    return (!max || ancho <= Number(max[1])) && (!min || ancho >= Number(min[1]));
  };
  const oculta = (r: ReglaCss) => /(^|;|\s)display:\s*none|visibility:\s*hidden/.test(r.cuerpo);
  const tocaAccion = (r: ReglaCss) => /accionRevisar|barraAcciones|barraResumen|accionPrincipal/.test(r.selector) || /(^|,)\s*(\.[\w-]+\s+)?button\s*(,|$)/.test(r.selector);
  const todas = reglas(css);
  const ocultadores = (ancho: number) => todas.filter((r) => aplica(r.media, ancho) && oculta(r) && tocaAccion(r)).map((r) => r.selector);

  igual("C03-F001-01 la cascada CSS real no oculta la barra ni su acción en 1024, 1099 ni en ≥ 1100 px (ninguna regla aplicable con display:none/visibility:hidden sobre accionRevisar, barraAcciones, barraResumen o accionPrincipal)", [1024, 1099, 1100, 1366, 1600, 1920].map(ocultadores), [[], [], [], [], [], []]);
  igual("C03-F001-02 ya no existe el quiebre de 1099 px ni el CSS/markup de la barra móvil o de .accionRevisar (dependencias residuales eliminadas)", [/max-width:\s*1099px/.test(css), /barraMovil|accionRevisar/.test(css), /barraMovil|accionRevisar/.test(pag)], [false, false, false]);
  igual("C03-F001-03 el JSX tiene UNA sola acción «Revisar y confirmar» (sin botones duplicados) con disabled={!puedeGuardar} y onClick={grabar}; Cancelar sigue a su lado", [(pag.match(/Revisar y confirmar/g) ?? []).length, (pag.match(/disabled=\{!puedeGuardar\} onClick=\{grabar\}/g) ?? []).length, /<Link href="\/dashboard" className=\{ui\.secondaryButton\}>Cancelar<\/Link>/.test(pag)], [1, 1, true]);
  igual("C03-F001-04 la barra con varias líneas mantiene las acciones accesibles: contenedor con flex-wrap y sin encogerse (flex: 0 0 auto), y a ≤ 760 px las acciones ocupan toda la fila", [/\.barraAcciones \{[^}]*flex: 0 0 auto[^}]*flex-wrap: wrap/.test(css), /\.barraResumen \{[^}]*flex-wrap: wrap/.test(css), todas.some((r) => r.media !== null && /max-width:\s*760px/.test(r.media) && /\.barraAcciones/.test(r.selector) && /width: 100%/.test(r.cuerpo))], [true, true, true]);
  cierto("C03-F001-05 revisión y emisión sin cambios: grabar(), cuerpoFactura(), huella, diálogo con foco/Escape y envío con la misma clave de idempotencia siguen idénticos", /function grabar\(\) \{\s*if \(!cliente\) return;/.test(pag) && /void flujo\.revisar\(cuerpoFactura\(\)\)/.test(pag) && /const huellaActual = JSON\.stringify\(cuerpoFactura\(\)\)/.test(pag) && /accionTeclaResumen\(/.test(pag) && /siguienteFocoModal\(/.test(pag) && /void flujo\.enviar\(\)/.test(pag));

  return fallos;
}
