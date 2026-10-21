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
  const iInfo = pagina.indexOf('aria-labelledby="sec-info"');
  const iCliente = pagina.indexOf('aria-labelledby="sec-cliente"');
  const iOper = pagina.indexOf('aria-labelledby="sec-operacion"');

  cierto("UX-07 orden del flujo: Operación → Cliente → Detalle → Forma de pago → Información adicional; MediosPago ya no está dentro de Operación y solo se monta con disponibilidadPago", iOper < iCliente && iCliente < iDetalle && iDetalle < iPago && iPago < iInfo && pagina.indexOf("<MediosPago") > iPago && (pagina.match(/<MediosPago/g) ?? []).length === 1 && /!pagoFlujo\.disponible \?/.test(pagina) && /disponibilidadPago\(\{ hayCliente: cliente !== null/.test(pagina));
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

  return fallos;
}
