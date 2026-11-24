/**
 * PRO-365 / NEXIT-DOC-UX-COMPETENCIA-R01 — Documentos electrónicos: cuatro indicadores INDEPENDIENTES visibles por fila (Envío | XML/CDC | SIFEN | Correo), sin texto grande de
 * estado, acciones separadas de los estados, Eventos compacto y leyenda única sobre la tabla.
 * Casos sobre funciones PURAS reales (presentacion-sifen.ts, documentos-tabla.ts) y sobre la estructura del texto fuente de page.tsx / page.module.css (React y navegador NO se renderizan).
 * ESCRITOS, NO EJECUTADOS (orden PRO-365: sin tests, lint, typecheck, build, CI manual, SQL ni navegador). La paridad visual con las capturas de la competencia NO se afirma: las capturas no
 * fueron recibidas; la comprobación visual real queda para la homologación.
 * Sin cambios de estados, contadores, APIs, SQL, migraciones, gateway, CDC, KuDE, stock ni permisos.
 * PRO-365-R02 (24/11/2026): las dos capturas ya están en el repositorio (documentacao/referencias-visuais/PRO-365/); casos R02-01..12 sobre filtros, «Resumen de estados»,
 * densidad de la tabla, leyenda compacta y acciones. Igualmente ESCRITOS, NO EJECUTADOS; la paridad visual la confirma el responsable en el navegador.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { accionesFila, eventosFila, MOTIVO_CORREO_NO_DISPONIBLE, MOTIVO_XML_NO_DISPONIBLE } from "@/lib/facturacion/documentos-tabla";
import { type EstadoEmail, type EstadoLocal, type EstadoSifen } from "@/lib/facturacion/estados";
import { iconosEstado, NOMBRE_EJE } from "@/lib/facturacion/presentacion-sifen";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");
const sinComentariosCss = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "");

/** Cuerpo de la PRIMERA regla cuyo selector completo coincide exactamente (sin comentarios). */
function regla(css: string, selector: string): string {
  const m = new RegExp(`(?:^|[}{])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(sinComentariosCss(css));

  return m ? m[1] : "";
}

export async function verificarCasosDocumentosUxCompetenciaPro365(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, condicion: boolean) => igual(nombre, condicion, true);

  const pagina = leer("app/(private)/documentos/page.tsx");
  const css = leer("app/(private)/documentos/page.module.css");
  const cssLimpio = sinComentariosCss(css);
  const fila = pagina.slice(pagina.indexOf("<tr className={clases(ui.row, CLASE_FILA_TIPO[d.tipo], marcado && estilos.filaMarcada)} data-tipo={d.tipo}>"), pagina.indexOf("{det ? (\n                      <tr"));
  const celdaEstado = fila.slice(fila.indexOf("className={estilos.estado}"), fila.indexOf("className={estilos.eventos}"));
  const celdaEventos = fila.slice(fila.indexOf("className={estilos.eventos}"));
  const segunda = pagina.slice(pagina.indexOf("SEGUNDA CAPA"));
  const doc = (p: Partial<{ estadoLocal: EstadoLocal; estadoSifen: EstadoSifen; cdc: string | null; estadoEmail: EstadoEmail }>) => ({
    estadoLocal: "ENVIADO" as EstadoLocal, estadoSifen: "PENDIENTE" as EstadoSifen, estadoEmail: "NO_INFORMADO" as EstadoEmail, cdc: null as string | null, ultimaConsultaResultado: null, envioErrorTipo: null, ...p,
  });

  // ══ A01 Cuatro indicadores independientes, visibles en la fila y en orden fijo ═════════════════════════════════════════════════════════
  igual("PRO365-A01a iconosEstado devuelve SIEMPRE cuatro ejes en orden Envío · XML/CDC · SIFEN · Correo",
    iconosEstado(doc({})).map((i) => NOMBRE_EJE[i.eje]), ["Envío", "XML/CDC", "SIFEN", "Correo"]);
  cierto("PRO365-A01b (actualizado PRO-365-R02-C02) la celda Estado de la FILA pinta los cuatro iconos (fases.map de iconosEstado), cada uno enfocable con su texto de operador y nombre accesible con el eje",
    /const fases = iconosEstado\(d\);/.test(pagina) && /\{fases\.map\(\(i\) => \(\s*<IconoFase key=\{i\.eje\} eje=\{i\.eje\} simbolo=\{i\.simbolo\} clase=\{CLASE_TONO_ICONO\[i\.tono\]\} texto=\{textoIconoOperador\(i, d\)\.texto\} etiqueta=\{textoIconoOperador\(i, d\)\.etiqueta\} tip=\{eventosTip\} \/>/.test(celdaEstado) &&
    /role="img"\s+tabIndex=\{0\}\s+aria-label=\{etiqueta \?\? texto\}/.test(pagina) && /role="group" aria-label=\{`Estados de \$\{doc\}`\}/.test(celdaEstado));
  cierto("PRO365-A01c los indicadores NO quedan ocultos en el Historial técnico: la fila los muestra y la segunda capa los repite con nombre",
    /fases\.map/.test(fila) && /iconosEstado\(d\)\.map\(\(i\) => \(/.test(segunda) && /<strong>\{NOMBRE_EJE\[i\.eje\]\}:<\/strong> \{i\.corto\}/.test(segunda));

  // ══ A02 «Rechazado» fiel, sin texto enorme y sin alterar estados ═══════════════════════════════════════════════════════════════════════
  {
    const rechazado = iconosEstado(doc({ estadoSifen: "RECHAZADO", cdc: "CDC-API-OPACO" }));

    igual("PRO365-A02a RECHAZADO persistido = icono SIFEN cruz roja; Envío ✓ y CDC informado coexisten (ejes independientes, la firma no es aprobación)",
      rechazado.map((i) => [i.eje, i.simbolo, i.tono]), [["envio", "check", "ok"], ["xml", "archivoCheck", "info"], ["sifen", "cruz", "error"], ["correo", "correo", "neutro"]]);
    cierto("PRO365-A02b la fila ya no pinta un texto grande de estado (sin estadoPrincipalFila, {estado.texto} ni <strong> en la celda Estado)",
      !/estadoPrincipalFila|\{estado\.texto\}|SIMBOLO_ESTADO|CLASE_ESTADO/.test(pagina) && !/<strong>/.test(celdaEstado));
    // PRO-365-R02-C02: el tooltip SIFEN es «Rechazado» a secas; el motivo (código y descripción) va en el detalle fiscal como «Motivo del rechazo».
    cierto("PRO365-A02c (actualizado PRO-365-R02-C02) el tooltip SIFEN no arrastra el mensaje; el motivo del rechazo se muestra en el detalle fiscal solo con RECHAZADO persistido (detalleFiscalPrimario → respuestaFiscal), sin reclasificar",
      !/textoFase|Motivo registrado/.test(pagina) && /const fiscal = detalleFiscalPrimario\(d\);/.test(pagina) && /const respuesta = respuestaFiscal\(d, fiscal\);/.test(pagina));
    igual("PRO365-A02d iconosEstado es puro: no modifica el documento (estado y CDC idénticos tras derivar la presentación)",
      (() => { const d = doc({ estadoSifen: "RECHAZADO", cdc: "X" }); const antes = JSON.stringify(d); iconosEstado(d); return JSON.stringify(d) === antes; })(), true);
  }

  // ══ A03 Acciones separadas de los estados; XML y Correo sin endpoint ════════════════════════════════════════════════════════════════════
  igual("PRO365-A03a XML y Correo siguen deshabilitados con su motivo (no hay endpoint probado); KuDE y Consulta sin cambios",
    accionesFila(true, { editar: true }, true, "").map((a) => [a.clave, a.disponible, a.motivo]),
    [["kude", true, ""], ["xml", false, MOTIVO_XML_NO_DISPONIBLE], ["consulta", true, ""], ["correo", false, MOTIVO_CORREO_NO_DISPONIBLE]]);
  cierto("PRO365-A03b las acciones viven en la columna Acciones (antes del documento) y la celda Estado no contiene ningún control de acción",
    fila.indexOf("aria-label={`Acciones de ${doc}`}") < fila.indexOf("className={estilos.estado}") && !/<AccionIcono|<button/.test(celdaEstado));

  // ══ A04 Eventos compacto, sin repetir indisponibilidad por fila ═════════════════════════════════════════════════════════════════════════
  cierto("PRO365-A04a Eventos: situación acreditada o «Sin información» (de eventos, para lectores); no repite «Cancelación/Inutilización: No disponible» en cada fila",
    /\{eventosVista\.registrado \?\? "Sin información"\}/.test(celdaEventos) && !/eventos\.operaciones|No disponible|\{o\.nombre\}/.test(celdaEventos) && /motivo=\{eventosVista\.operacion\}/.test(celdaEventos));
  igual("PRO365-A04b «Sin información» ≠ «sin eventos»: sin registro, eventosFila no inventa una situación registrada",
    eventosFila({ estadoSifen: "PENDIENTE" }).registrado, null);
  cierto("PRO365-A04c la segunda capa conserva el texto honesto completo de eventos (sinRegistro + operación)",
    /Eventos: \{eventos\.registrado \?\? eventos\.sinRegistro\}\. \{eventos\.operacion\}/.test(segunda));

  // ══ A05 Leyenda única ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  cierto("PRO365-A05 (actualizado PRO-365-R02) leyenda ÚNICA y compacta sobre la tabla con el orden de los cuatro estados y los símbolos (check/reloj/cruz/guion + aviso), referida por aria-describedby",
    (pagina.match(/className=\{estilos\.leyendaEstados\}/g) ?? []).length === 1 && pagina.indexOf("id=\"leyenda-estados\"") < pagina.indexOf("aria-describedby=\"leyenda-estados\"") &&
    /<strong>Estado:<\/strong> Envío · XML\/CDC · SIFEN · Correo/.test(pagina) && !/leyenda/.test(fila));

  // ══ A06 CSS: sin clases huérfanas y áreas táctiles ══════════════════════════════════════════════════════════════════════════════════════
  cierto("PRO365-A06a retiradas las clases del estado principal y de las operaciones por fila; añadidas iconoVacio/leyendaEstados/leyendaSimbolos/leyendaSimbolo usadas por la página",
    !/\.(estadoPrincipal|estadoAprobado|estadoRechazado|estadoPendiente|estadoSinInfo|estadoAnulado|estadoSecundario|eventosTexto|eventoOperacion)\b/.test(cssLimpio) &&
    ["iconoVacio", "leyendaEstados", "leyendaSimbolos", "leyendaSimbolo"].every((c) => new RegExp(`\\.${c} \\{`).test(cssLimpio) && pagina.includes(`estilos.${c}`)));
  cierto("PRO365-A06b (actualizado PRO-365-R02) la celda Estado no rompe línea y el hueco del aviso reserva el mismo ancho que un icono (28px en escritorio; 36px en móvil) para alinear filas",
    /white-space: nowrap;/.test(regla(css, ".estado")) && /width: 28px;\s*height: 28px;/.test(regla(css, ".iconoVacio")) && /min-width: 28px;/.test(regla(css, ".estado .icono")));

  // ══ A07 Alcance ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  cierto("PRO365-A07 sin rutas nuevas, sin filtros/KPIs/acciones masivas inventados: las rutas de la pantalla son las mismas de UX-R02",
    (() => {
      const rutas = [...new Set([...pagina.matchAll(/`(\/api\/[^`]*)`/g)].map((m) => m[1].replace(/\$\{[^}]*\}/g, ":x")))].sort();

      return JSON.stringify(rutas) === JSON.stringify(["/api/documentos/:x", "/api/documentos/:x/consultar", "/api/documentos/:x/enviar", "/api/documentos/:x/intentos/:x/respuesta", "/api/documentos/:x/intentos?cursor=:x", "/api/documentos/:x/solicitud?version=:x", "/api/documentos?:x"].sort());
    })());

  // ══ PRO-365-R02 — corrección visual con las dos capturas de la competencia (ESCRITOS, NO EJECUTADOS) ═══════════════════════════════════════
  const filtros = pagina.slice(pagina.indexOf("estilos.tarjetaFiltros"), pagina.indexOf("estilos.resumen}"));
  const resumenJsx = pagina.slice(pagina.indexOf("estilos.resumen}"), pagina.indexOf("<section className={ui.contentCard}>", pagina.indexOf("estilos.resumen}")));
  const indicadores = pagina.slice(pagina.indexOf("const INDICADORES"), pagina.indexOf("];", pagina.indexOf("const INDICADORES")));

  cierto("PRO365-R02-01 filtros en tarjeta propia ANTES del resumen y de la tabla, con etiqueta sobre cada campo, en el orden de la referencia: Emisión desde · Emisión hasta · Sucursal · Receptor/RUC/Nro./CDC · Tipo · Estado SIFEN",
    pagina.indexOf("estilos.tarjetaFiltros") > 0 && pagina.indexOf("estilos.tarjetaFiltros") < pagina.indexOf("estilos.resumen}") && pagina.indexOf("estilos.resumen}") < pagina.indexOf("aria-describedby=\"leyenda-estados\"") &&
    ["<span>Emisión desde</span>", "<span>Emisión hasta</span>", "<span>Sucursal</span>", "<span>Receptor / RUC / Nro. / CDC</span>", "<span>Tipo</span>", "<span>Estado SIFEN</span>"].every((t, k, a) => filtros.includes(t) && (k === 0 || filtros.indexOf(a[k - 1]) < filtros.indexOf(t))));
  cierto("PRO365-R02-02 los filtros son los MISMOS de antes (sin filtros nuevos fingidos: ni lote, ni fecha de firma, ni estado de envío, ni tamaño de página) y se siguen aplicando solos (sin botón «Filtrar»)",
    ["<CampoFecha valor={desde} alCambiar={setDesde} />", "<CampoFecha valor={hasta} alCambiar={setHasta} />", "setSucursal(e.target.value)", "setBusqueda(e.target.value)", "TIPOS_DOCUMENTO.map", "ESTADOS_SIFEN.map", "onClick={limpiar}"].every((t) => filtros.includes(t)) &&
    (filtros.match(/<label /g) ?? []).length === 6 && !/lote|firma|estadoLocal|tamano|Filtrar</i.test(filtros));
  cierto("PRO365-R02-03 CSS de filtros: rejilla que se adapta (auto-fill, mínimo 160px), campos de 36px, búsqueda en dos columnas (toda la fila en móvil) y acciones a la derecha en su propia fila",
    /grid-template-columns: repeat\(auto-fill, minmax\(160px, 1fr\)\);/.test(regla(css, ".filtros")) && /height: 36px;/.test(regla(css, ".campoFiltro > select,\n.campoFiltro > input")) &&
    /grid-column: span 2;/.test(regla(css, ".campoBusqueda")) && /@media \(max-width: 720px\) \{[\s\S]*\.campoBusqueda \{\s*grid-column: 1 \/ -1;/.test(cssLimpio) && /grid-column: 1 \/ -1;[\s\S]*justify-content: flex-end;/.test(regla(css, ".filtrosAcciones")));
  cierto("PRO365-R02-04 «Resumen de estados» con título propio (h2 asociado por aria-labelledby) entre filtros y tabla",
    /<section className=\{estilos\.resumen\} aria-labelledby="titulo-resumen-estados">\s*<h2 className=\{estilos\.tituloSeccion\} id="titulo-resumen-estados">Resumen de estados<\/h2>/.test(pagina));
  igual("PRO365-R02-05 ocho tarjetas con el color semántico de cada grupo (ámbar, azul, verde, rojo, violeta, rojo, gris) y Total al final (turquesa)",
    [...indicadores.matchAll(/grupo: "([A-Z_]*)"[^}]*clase: estilos\.(tono\w+), simbolo: "(\w+)"/g)].map((m) => [m[1], m[2], m[3]]),
    [["PEND_ENVIO", "tonoAmber", "reloj"], ["PEND_RESPUESTA", "tonoBlue", "archivoReloj"], ["APROBADO", "tonoVerde", "check"], ["RECHAZADO", "tonoRed", "cruz"],
      ["EMAIL_ENVIADO", "tonoViolet", "correoCheck"], ["EMAIL_ERROR", "tonoRed", "correoCruz"], ["SIN_EMAIL", "tonoGris", "correo"], ["", "tonoTeal", "archivoCheck"]]);
  cierto("PRO365-R02-06 cada tarjeta: título, cifra REAL del resumen del servidor (incluido RECHAZADO, «—» si el recorte es de otro contexto), símbolo decorativo (aria-hidden) y ayuda accesible; sigue siendo botón-filtro",
    /<span className=\{estilos\.kpiTitulo\}>\{i\.titulo\}<\/span>\s*<strong className=\{estilos\.kpiValor\}>\{resumen === null \? "—" : i\.grupo === "" \? \(resumen\.total \?\? 0\) : \(resumen\[i\.grupo\] \?\? 0\)\}<\/strong>/.test(resumenJsx) &&
    /<span className=\{estilos\.kpiIcono\} aria-hidden="true"><svg viewBox="0 0 24 24">\{GLIFO\[i\.simbolo\]\}<\/svg><\/span>/.test(resumenJsx) && /aria-pressed=\{grupo === i\.grupo\}/.test(resumenJsx) && /onClick=\{\(\) => setGrupo\(i\.grupo\)\}/.test(resumenJsx) &&
    !/kpi::before/.test(cssLimpio));
  cierto("PRO365-R02-07 tarjetas uniformes: rejilla auto-fill (mínimo 170px), 64px de alto, cifra de 20px con el color del grupo y recuadro del símbolo con su fondo tenue",
    /repeat\(auto-fill, minmax\(170px, 1fr\)\)/.test(regla(css, ".kpis")) && /min-height: 64px;/.test(regla(css, ".kpi")) && /font-size: 20px;/.test(regla(css, ".kpiValor")) && /color: var\(--tonoTexto/.test(regla(css, ".kpiValor")) &&
    /background: var\(--tonoFondo/.test(regla(css, ".kpiIcono")));
  {
    const luz = (h: string) => { const c = [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const contraste = (a: string, b: string) => { const [x, y] = [luz(a), luz(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const tonos = ["tonoTeal", "tonoAmber", "tonoBlue", "tonoVerde", "tonoRed", "tonoViolet", "tonoGris"].map((t) => {
      const r = regla(css, `.${t}`);
      return [/--tonoTexto: (#[0-9a-f]{6});/i.exec(r)?.[1] ?? "", /--tonoFondo: (#[0-9a-f]{6});/i.exec(r)?.[1] ?? ""];
    });
    cierto("PRO365-R02-08 contraste AA (≥ 4.5:1) de la cifra y del símbolo de cada grupo sobre blanco, sobre su fondo tenue y sobre la tarjeta activa (#f3fbfb)",
      tonos.every(([t, f]) => t !== "" && f !== "" && [contraste(t, "#ffffff"), contraste(t, f), contraste(t, "#f3fbfb")].every((v) => v >= 4.5)));
  }
  cierto("PRO365-R02-09 tabla más densa (como la referencia): ancho mínimo 1100px en escritorio, celdas 6px/10px, encabezado 8px/10px; iconos de estado 28px en escritorio y 36px en móvil",
    /min-width: 1100px/.test(regla(css, "table.tablaDocs")) && /padding: 6px 10px;/.test(regla(css, "table.tablaDocs > tbody > tr > td")) && /table\.tablaDocs > thead th \{\s*padding: 8px 10px;/.test(cssLimpio) &&
    /min-width: 28px;/.test(regla(css, ".estado .icono")) && /@media \(max-width: 720px\) \{[\s\S]*\.estado \.icono \{\s*min-width: 36px;/.test(cssLimpio));
  cierto("PRO365-R02-10 leyenda compacta en UNA franja: «Estado: Envío · XML/CDC · SIFEN · Correo» + símbolos; la explicación larga queda solo para lectores de pantalla",
    /<span>\s*<strong>Estado:<\/strong>\s*Envío · XML\/CDC · SIFEN · Correo\s*<\/span>/.test(pagina) /* C01: admite espacios y saltos de línea del JSX formateado */ && /<span className=\{estilos\.srSolo\}>Envío indica si el documento fue enviado; XML\/CDC indica si se registró el código del documento, que no es una aprobación; SIFEN es el resultado fiscal; Correo es el envío por correo al cliente\./.test(pagina) /* C02: lenguaje llano */ &&
    /padding: 4px 14px;/.test(regla(css, ".leyendaEstados")));
  igual("PRO365-R02-11 acciones intactas y distintas de los estados: KuDE y Consulta activas, XML y Correo deshabilitados con su motivo",
    accionesFila(true, { editar: true }, true, "").map((a) => [a.clave, a.disponible]), [["kude", true], ["xml", false], ["consulta", true], ["correo", false]]);
  cierto("PRO365-R02-12 sin el contador y la barra compartidos anteriores (ui.toolbar / ui.resultCount): el contador de documentos vive en la tarjeta de filtros (aria-live)",
    !/ui\.toolbar|ui\.resultCount/.test(pagina) && /<span className=\{estilos\.conteo\} aria-live="polite">/.test(filtros));

  return fallos;
}
