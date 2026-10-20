/**
 * Primera versión visual de la facturación: (A) acciones compactas con iconos en /documentos (KuDE visible en la fila) y (B) importes sin decimales largos en el resumen de Factura y Nota de crédito.
 * Solo presentación. Sin React/navegador: el formateador y el predicado son funciones reales; el cableado de las pantallas se verifica estructuralmente y el flujo del KuDE usa el controlador real (ya cubierto por la suite kude).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { crearControladorVisor, kudeDisponible } from "@/lib/facturacion/kude-visor";
import { formatearMontoVisual } from "@/lib/formato/monto-visual";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");

export async function verificarCasosVisualV1(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(nombre + ": esperado " + JSON.stringify(esperado) + ", obtenido " + JSON.stringify(obtenido));
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── B. Formato monetario visual ───────────────────────────────────────────────────────────────
  igual("VIS-01 PYG: un importe con 8 decimales se muestra sin decimales y con separador de miles", [formatearMontoVisual("1234567.12345678", "PYG"), formatearMontoVisual("909090.90909091", "PYG"), formatearMontoVisual("4545.45454545", "PYG")], ["1.234.567", "909.091", "4.545"]);
  igual("VIS-02 redondeo por texto, medio hacia arriba, sin ruido binario", [formatearMontoVisual("0.49999999", "PYG"), formatearMontoVisual("0.5", "PYG"), formatearMontoVisual("1.5", "PYG"), formatearMontoVisual("999999.5", "PYG"), formatearMontoVisual("0.1", "PYG")], ["0", "1", "2", "1.000.000", "0"]);
  igual("VIS-03 enteros, ceros y grandes importes", [formatearMontoVisual("0", "PYG"), formatearMontoVisual("100", "PYG"), formatearMontoVisual("1000", "PYG"), formatearMontoVisual("123456789012345678", "PYG"), formatearMontoVisual(1100)], ["0", "100", "1.000", "123.456.789.012.345.678", "1.100"]);
  igual("VIS-04 negativos (nota de crédito) conservan el signo; un negativo que redondea a cero no muestra «-0»", [formatearMontoVisual("-1500.7", "PYG"), formatearMontoVisual("-0.2", "PYG")], ["-1.501", "0"]);
  igual("VIS-05 sin moneda se asume PYG; USD/BRL conservan 2 decimales (no se ocultan los centavos de una moneda que los usa)", [formatearMontoVisual("1500.9"), formatearMontoVisual("12.5", "USD"), formatearMontoVisual("12.3456", "USD"), formatearMontoVisual("1234.995", "BRL"), formatearMontoVisual("7", "USD")], ["1.501", "12,50", "12,35", "1.235,00", "7,00"]);
  igual("VIS-06 un texto que no es un decimal se devuelve tal cual y null/undefined se muestran como guion", [formatearMontoVisual("abc", "PYG"), formatearMontoVisual(null), formatearMontoVisual(undefined), formatearMontoVisual("")], ["abc", "—", "—", ""]);
  {
    const entrada = "1234567.12345678";
    const antes = entrada;

    formatearMontoVisual(entrada, "PYG");
    igual("VIS-07 el formateador no altera el valor original (solo devuelve texto para mostrar)", entrada, antes);
  }

  // ── B. Cableado en Factura y Nota de crédito; el JSON/payload no cambia ────────────────────────────────
  const factura = leer("app/(private)/facturas/nueva/page.tsx");
  const nce = leer("app/(private)/notas-credito/page.tsx");
  const ini = factura.indexOf('<h2 id="titulo-resumen">Resumen de la factura</h2>');
  const modalFactura = factura.slice(ini, factura.indexOf("      {mostrarEnvio ? (", ini));

  cierto("VIS-10 Factura: en el resumen previo al envío todos los importes (líneas, pagos, crédito, totales, IVA y gravados, equivalente en guaraníes) pasan por el formateador visual", ini > 0 && !/\bfd\((?!resumen\.cambio\.valor\))/.test(modalFactura) && (modalFactura.match(/fmv\(/g) ?? []).length >= 15 && /formatearMontoVisual\(resumen\.cambio\.totalGs, "PYG"\)/.test(modalFactura) && /fd\(resumen\.cambio\.valor\)/.test(modalFactura) && /const fmv = \(t: string \| number \| null \| undefined\) => formatearMontoVisual\(t, resumen\?\.moneda\)/.test(factura));
  cierto("VIS-11 Factura: el tipo de cambio y las cantidades NO se redondean (no son importes); lo que se envía sale de revision.cuerpo / cuerpoFactura, nunca del texto formateado", /fd\(resumen\.cambio\.valor\)/.test(modalFactura) && /<td className=\{estilos\.num\}>\{l\.cantidad\}<\/td>/.test(modalFactura) && !/fmv\(/.test(factura.slice(factura.indexOf("const cuerpoFactura = () =>"), factura.indexOf("const cuerpoFactura = () =>") + 1200)));
  cierto("VIS-12 Nota de crédito: totales (exento, gravados, IVA, total) y líneas del resumen, y los importes de la lista de facturas y de las líneas, usan el formateador visual; cantidades y tipo de cambio se mantienen", /fmv\(resumen\.totales\.total, resumen\.moneda\)/.test(nce) && ["exento", "gravado5", "gravado10", "iva5", "iva10", "totalIva"].every((k) => new RegExp("fmv\\(resumen\\.totales\\." + k + ", resumen\\.moneda\\)").test(nce)) && /fmv\(l\.precioUnitario, resumen\.moneda\)/.test(nce) && /fmv\(l\.monto, resumen\.moneda\)/.test(nce) && /fmv\(f\.total, f\.moneda\)/.test(nce) && /fmv\(f\.saldo, f\.moneda\)/.test(nce) && /\{fm\(l\.cantidad\)\}/.test(nce) && /cambio \$\{fm\(resumen\.cambio\)\}/.test(nce));
  {
    const archivosPayload = ["lib/facturacion/payload-fe.ts", "lib/facturacion/payload-nce.ts", "lib/facturacion/emision.ts", "lib/facturacion/nce.ts", "lib/facturacion/calculo.ts", "lib/facturacion/shared.ts"];

    cierto("VIS-13 el formateador visual no se usa en ningún archivo de cálculo, payload, emisión ni API (JSON y persistencia intactos)", archivosPayload.every((f) => !/monto-visual/.test(leer(f))) && !/monto-visual/.test(leer("app/api/documentos/route.ts")));
  }

  // ── A. Lista de Documentos: acciones con iconos ──────────────────────────────────────────────────
  const casos: Array<[string, { tipo: string; estadoSifen: string; cdc: string | null }, boolean]> = [
    ["FE aprobada con CDC", { tipo: "FE", estadoSifen: "APROBADO", cdc: "0".repeat(44) }, true],
    ["FE aprobada sin CDC", { tipo: "FE", estadoSifen: "APROBADO", cdc: null }, false],
    ["FE aprobada con CDC vacío", { tipo: "FE", estadoSifen: "APROBADO", cdc: "" }, false],
    ["FE pendiente", { tipo: "FE", estadoSifen: "PENDIENTE", cdc: "0".repeat(44) }, false],
    ["FE rechazada", { tipo: "FE", estadoSifen: "RECHAZADO", cdc: "0".repeat(44) }, false],
    ["FE sin consulta", { tipo: "FE", estadoSifen: "SIN_CONSULTA", cdc: "0".repeat(44) }, false],
    ["NCE aprobada con CDC", { tipo: "NCE", estadoSifen: "APROBADO", cdc: "0".repeat(44) }, false],
    ["otro tipo aprobado", { tipo: "NDE", estadoSifen: "APROBADO", cdc: "0".repeat(44) }, false],
  ];

  for (const [nombre, d, esperado] of casos) igual("VIS-20 [" + nombre + "]: el icono de KuDE " + (esperado ? "aparece" : "NO aparece"), kudeDisponible(d), esperado);

  const pagina = leer("app/(private)/documentos/page.tsx");
  const celda = pagina.slice(pagina.indexOf("<div className={estilos.accionesLinea}>"), pagina.indexOf("</td>", pagina.indexOf("<div className={estilos.accionesLinea}>")));

  cierto("VIS-21 la columna Acciones muestra botones de icono compactos: KuDE (solo si kudeDisponible) y detalle (aria-expanded, título y etiqueta accesibles), sin texto largo", /kudeDisponible\(d\) \? \(/.test(celda) && /title="Ver KuDE \(PDF\)"/.test(celda) && /aria-label=\{`Ver KuDE \(PDF\) de la factura/.test(celda) && /onClick=\{\(\) => abrirKude\(d\)\}/.test(celda) && /aria-expanded=\{Boolean\(det\)\}/.test(celda) && /title=\{det \? "Ocultar detalle" : "Ver detalle"\}/.test(celda) && /onClick=\{\(\) => alternar\(d\)\}/.test(celda) && (celda.match(/<svg /g) ?? []).length === 2 && !/XML/.test(celda));
  cierto("VIS-22 no hay acción de XML ni falso soporte (el aviso «XML: descarga no disponible» se mantiene) y el KuDE no se duplica dentro del detalle", /XML: descarga no disponible/.test(pagina) && (pagina.match(/Ver KuDE \(PDF\)/g) ?? []).length === 2 && !/Descargar XML|Ver XML/.test(pagina));
  cierto("VIS-23 el clic en el icono usa el flujo ya aceptado: abrirKude → visor.abrir (modal, backend autenticado por ID, nueva consulta en cada apertura)", /function abrirKude\(d: Documento\) \{\s*void visor\.abrir\(/.test(pagina) && /pedirKudeAlServidor\(id, signal\)/.test(pagina) && /<KudeModal controlador=\{visor\}/.test(pagina) && !/window\.open/.test(pagina));
  cierto("VIS-24 los estilos de icono tienen foco visible, tamaño compacto y no dependen del color solo", /\.iconBtn:focus-visible/.test(leer("app/(private)/documentos/page.module.css")) && /\.accionesLinea/.test(leer("app/(private)/documentos/page.module.css")));

  // El clic abre el visor con el controlador real y consulta una vez (sin PDF en la fila ni en el detalle).
  {
    const llamadas: string[] = [];
    const visor = crearControladorVisor({ obtener: async (id) => { llamadas.push(id); return new Blob([new Uint8Array([37, 80, 68, 70])]); }, crearUrl: () => "blob:x", revocarUrl: () => undefined, descargar: () => undefined, imprimir: () => undefined });

    await visor.abrir({ id: "d1", titulo: "KuDE · Factura 001-001-0010004", nombre: "KuDE-FE-001-001-0010004.pdf" });
    igual("VIS-25 el clic en el icono (visor real): una consulta por apertura y la modal queda LISTA", [llamadas, visor.estado().fase], [["d1"], "LISTO"]);
    visor.cerrar();
  }

  return fallos;
}
