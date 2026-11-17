/**
 * PRO-342-UX-R01 — Revisión y simplificación integral de la pantalla «Documentos electrónicos» (AUD-CHATGPT-PRO-342-DOCUMENTOS-UX-PREPRODUCCION-2026-11-17: UX01–UX04).
 * Casos de ACEPTACIÓN de los 15 puntos del responsable:
 *  · funciones PURAS reales (posicionTooltip, claveContexto, esResultadoVigente de documentos-ux.ts; iconosEstado/detalleFiscalPrimario de presentacion-sifen.ts, sin cambios);
 *  · contraste WCAG calculado sobre los colores REALES del CSS local;
 *  · estructura de page.tsx / page.module.css verificada sobre el texto fuente (React y navegador NO se renderizan aquí).
 * ESCRITOS, NO EJECUTADOS en esta entrega (orden PRO-342-UX-R01: sin tests, lint, typecheck, build, SQL ni navegador). La verificación visual real (360/768/1280/1600,
 * zoom, teclado, toque, lector de pantalla) queda para la homologación autorizada por el responsable.
 * Sin cambios de motor fiscal, APIs, SQL, migrations ni otros módulos: el CDC sigue siendo dato opaco mostrado tal cual (PRO-342-R05).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { claveContexto, esResultadoVigente, posicionTooltip } from "@/lib/facturacion/documentos-ux";
import { GRUPOS_INDICADOR } from "@/lib/facturacion/estados";
import { detalleFiscalPrimario, iconosEstado } from "@/lib/facturacion/presentacion-sifen";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");
const sinComentariosCss = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "");

/** Cuerpo de la PRIMERA regla cuyo selector completo coincide exactamente (sin comentarios). */
function regla(css: string, selector: string): string {
  const m = new RegExp(`(?:^|[}{])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(sinComentariosCss(css));

  return m ? m[1] : "";
}
const hex = (bloque: string, prop: string) => new RegExp(`(?:^|[;\\s])${prop}:\\s*(#[0-9a-f]{6})`, "i").exec(bloque)?.[1]?.toLowerCase() ?? "";
function luminancia(h: string): number {
  const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));

  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
const contraste = (a: string, b: string) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);

  return (x + 0.05) / (y + 0.05);
};

export async function verificarCasosDocumentosUxR01(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, condicion: boolean) => igual(nombre, condicion, true);

  const pagina = leer("app/(private)/documentos/page.tsx");
  const css = leer("app/(private)/documentos/page.module.css");
  const cssLimpio = sinComentariosCss(css);
  const lista = leer("components/ui/lista-padrao/lista.module.css");
  const tramo = (desde: string, hasta: string) => pagina.slice(pagina.indexOf(desde), pagina.indexOf(hasta, pagina.indexOf(desde) + desde.length));
  const fila = tramo("<tr className={clases(ui.row, CLASE_FILA_TIPO[d.tipo])} data-tipo={d.tipo}>", "{det ? (\n                      <tr");
  const detalle = tramo("PRIMERA CAPA", "</Fragment>");
  const primera = detalle.slice(0, detalle.indexOf("SEGUNDA CAPA"));
  const segunda = detalle.slice(detalle.indexOf("SEGUNDA CAPA"));
  const indicadores = tramo("const INDICADORES", "];");

  // ══ 1. Indicadores superiores compactos, con cantidades y filtros ═══════════════════════════════════════════════════════════════════════
  igual("UXR01-01 los ocho indicadores se conservan: Total + los 7 grupos de GRUPOS_INDICADOR, en el mismo orden",
    [...indicadores.matchAll(/grupo: "([A-Z_]*)"/g)].map((m) => m[1]), ["", ...GRUPOS_INDICADOR]);
  cierto("UXR01-02 cada indicador sigue siendo un botón-filtro (aria-pressed, setGrupo) con su cantidad del resumen del servidor",
    /aria-pressed=\{grupo === i\.grupo\}/.test(pagina) && /onClick=\{\(\) => setGrupo\(i\.grupo\)\}/.test(pagina) && /\{i\.grupo === "" \? \(resumen\.total \?\? 0\) : \(resumen\[i\.grupo\] \?\? 0\)\}/.test(pagina));
  cierto("UXR01-03 sin texto de ayuda visible por tarjeta: la ayuda es descripción accesible oculta (srSolo) y title; ya no usa las tarjetas grandes compartidas (summaryGrid/summaryCard)",
    !/<small>\{i\.ayuda\}<\/small>/.test(pagina) && /<span className=\{estilos\.srSolo\}>\. \{i\.ayuda\}<\/span>/.test(pagina) && /title=\{i\.ayuda\}/.test(pagina) && !/ui\.summary(Grid|Card)/.test(pagina) && /className=\{estilos\.kpis\}/.test(pagina));
  cierto("UXR01-04 CSS compacto: chips en una fila que se ajusta (flex-wrap), altura ≥ 36px, foco visible y estado activo turquesa",
    /display: flex;\s*flex-wrap: wrap;/.test(regla(css, ".kpis")) && /min-height: 36px/.test(regla(css, ".kpi")) && /outline: 3px solid/.test(regla(css, ".kpi:focus-visible")) && /#0f9ca5/.test(regla(css, ".kpiActivo")));

  // ══ 2. Cuatro iconos independientes en posiciones fijas ═════════════════════════════════════════════════════════════════════════════════
  {
    const base = { estadoLocal: "ENVIADO" as const, estadoSifen: "RECHAZADO" as const, estadoEmail: "NO_INFORMADO" as never, cdc: "CDC-OPACO", ultimaConsultaResultado: "OK", envioErrorTipo: null };
    const sinNada = { ...base, estadoLocal: "PENDIENTE_ENVIO" as const, estadoSifen: "SIN_CONSULTA" as const, cdc: null, ultimaConsultaResultado: null };

    igual("UXR01-05 iconosEstado devuelve SIEMPRE cuatro ejes en orden fijo Envío · XML/CDC · SIFEN · Correo (también sin CDC ni correo)",
      [iconosEstado(base).map((i) => i.eje), iconosEstado(sinNada).map((i) => i.eje)], [["envio", "xml", "sifen", "correo"], ["envio", "xml", "sifen", "correo"]]);
    igual("UXR01-06 ejes independientes: Enviado ✓ + CDC informado + SIFEN Rechazado ✕ coexisten (la firma/CDC no es aprobación)",
      iconosEstado(base).slice(0, 3).map((i) => [i.simbolo, i.tono]), [["check", "ok"], ["archivoCheck", "info"], ["cruz", "error"]]);
  }
  cierto("UXR01-07 la celda Estados pinta los cuatro iconos de iconosEstado y reserva la QUINTA posición (aviso «!» o hueco invisible) para no desalinear filas",
    /iconos\.map\(\(i\) => <IconoFase key=\{i\.eje\}/.test(fila) && /\{avisoFila \? \(\s*<IconoFase eje="aviso" simbolo="alerta"/.test(fila) && /<span className=\{estilos\.iconoVacio\} aria-hidden="true" \/>/.test(fila) &&
    /\.icono,\s*\.iconoVacio \{[^}]*min-width: 40px;\s*min-height: 40px;/.test(cssLimpio) && /flex-wrap: nowrap/.test(regla(css, ".iconosEstado")));

  // ══ 3. Sin textos repetidos debajo de cada icono ════════════════════════════════════════════════════════════════════════════════════════
  cierto("UXR01-08 ningún nombre corto bajo los iconos (sin iconoNombre / icono.nombre / i.corto en la fila); los nombres de los ejes aparecen UNA vez en la leyenda",
    !/iconoNombre|icono\.nombre|i\.nombre|i\.corto/.test(pagina) && !/iconoNombre/.test(cssLimpio) && (pagina.match(/NOMBRE_EJE\.envio/g) ?? []).length === 1);

  // ══ 4. Visibilidad y contraste de los iconos ════════════════════════════════════════════════════════════════════════════════════════════
  {
    const fondo = (t: string) => hex(regla(css, `.${t} .iconoCirculo`), "background");
    const simbolo = (t: string) => hex(regla(css, `.${t} .iconoCirculo`), "color");

    cierto("UXR01-09 contraste del símbolo sobre su círculo ≥ 4.5:1 en verde, azul, ámbar y rojo (blanco o marrón oscuro sobre ámbar)",
      ["iconoOk", "iconoInfo", "iconoAviso", "iconoError"].every((t) => fondo(t) !== "" && simbolo(t) !== "" && contraste(simbolo(t), fondo(t)) >= 4.5));
    cierto("UXR01-10 «sin información» = contorno oscuro sobre blanco: símbolo ≥ 4.5:1 y borde ≥ 3:1 (objeto gráfico, WCAG 1.4.11), también sobre el fondo FE",
      contraste(simbolo("iconoNeutro"), "#ffffff") >= 4.5 && contraste(hex(regla(css, ".iconoNeutro .iconoCirculo"), "border-color"), "#ffffff") >= 3 && contraste(hex(regla(css, ".iconoNeutro .iconoCirculo"), "border-color"), "#e9f1fb") >= 3);
    cierto("UXR01-11 círculos y fondos fiscales ≥ 3:1 contra los fondos de fila FE/NCE (normal y hover), salvo el ámbar que lleva borde oscuro ≥ 3:1",
      ["iconoOk", "iconoInfo", "iconoError"].every((t) => ["#f4f8fd", "#fffcee", "#e9f1fb", "#fdf6da"].every((f) => contraste(fondo(t), f) >= 3)) &&
      ["#f4f8fd", "#fffcee", "#e9f1fb", "#fdf6da"].every((f) => contraste(hex(regla(css, ".iconoAviso .iconoCirculo"), "border-color"), f) >= 3));
    cierto("UXR01-12 iconos más visibles: círculo 28px (antes 24), símbolo 18px (antes 16), trazo 2.4 (antes 2.2)",
      /width: 28px;\s*height: 28px;/.test(regla(css, ".iconoCirculo")) && /width: 18px;\s*height: 18px;/.test(regla(css, ".iconoCirculo svg")) && /stroke-width: 2\.4/.test(regla(css, ".iconoCirculo svg")));
  }

  // ══ 5. Descripción completa por tooltip accesible ═══════════════════════════════════════════════════════════════════════════════════════
  cierto("UXR01-13 el texto COMPLETO de cada icono es su nombre accesible (role=img + aria-label) y es enfocable (tabIndex 0)",
    /role="img"\s+tabIndex=\{0\}\s+aria-label=\{texto\}/.test(pagina) && /texto=\{i\.texto\}/.test(fila) && /texto=\{`Aviso técnico: \$\{avisoFila\}`\}/.test(fila));
  cierto("UXR01-14 el tooltip visual se abre con mouse (enter), teclado (focus) y toque (click), se cierra al salir con demora (pasar al tooltip sin cerrarlo) y al perder el foco",
    ["onMouseEnter={(e) => tip.mostrar(e.currentTarget, texto)}", "onFocus={(e) => tip.mostrar(e.currentTarget, texto)}", "onClick={(e) => tip.mostrar(e.currentTarget, texto)}", "onMouseLeave={tip.programarCierre}", "onBlur={(e) => tip.ocultar(e.currentTarget)}"].every((t) => pagina.includes(t)) &&
    /setTimeout\(\(\) => setTip\(null\), 160\)/.test(pagina) && /onMouseEnter=\{\(\) => window\.clearTimeout\(cierreTip\.current\)\}/.test(pagina));
  cierto("UXR01-15 se puede descartar: Escape, toque fuera del icono/tooltip, desplazamiento (también el horizontal de la tabla, captura) y cambio de tamaño",
    /e\.key === "Escape"/.test(pagina) && /addEventListener\("pointerdown", fuera\)/.test(pagina) && /addEventListener\("scroll", cerrar, true\)/.test(pagina) && /addEventListener\("resize", cerrar\)/.test(pagina) && /removeEventListener\("scroll", cerrar, true\)/.test(pagina));
  cierto("UXR01-16 sin recorte (AUD UX03): tooltip position: fixed fuera de la tabla, posicionado con posicionTooltip tras medirlo; ya no ::after dentro del contenedor con scroll",
    /\.tooltip \{\s*position: fixed;/.test(cssLimpio) && !/::after|data-tip/.test(cssLimpio) && /posicionTooltip\(/.test(pagina) && /useLayoutEffect\(/.test(pagina) &&
    pagina.lastIndexOf("className={estilos.tooltip}") > pagina.lastIndexOf("</footer>") && /aria-hidden="true" onMouseEnter/.test(pagina));
  {
    const vista = { ancho: 1280, alto: 800 };

    igual("UXR01-17 posicionTooltip: con espacio abajo → debajo del icono y centrado", posicionTooltip({ x: 600, y: 100, ancho: 40, alto: 40 }, { ancho: 200, alto: 60 }, vista), { x: 520, y: 146, lado: "abajo" });
    igual("UXR01-18 posicionTooltip: última fila (sin espacio abajo) → arriba del icono", posicionTooltip({ x: 600, y: 740, ancho: 40, alto: 40 }, { ancho: 200, alto: 60 }, vista), { x: 520, y: 674, lado: "arriba" });
    igual("UXR01-19 posicionTooltip: junto al borde derecho/izquierdo se mantiene dentro de la ventana con margen 8", [posicionTooltip({ x: 1250, y: 100, ancho: 40, alto: 40 }, { ancho: 280, alto: 60 }, vista).x, posicionTooltip({ x: 0, y: 100, ancho: 40, alto: 40 }, { ancho: 280, alto: 60 }, vista).x], [992, 8]);
    igual("UXR01-20 posicionTooltip móvil 360px: tooltip de 344px queda en x=8 y no desborda; si no cabe ni arriba ni abajo, usa el lado con más espacio sin salir de la ventana",
      [posicionTooltip({ x: 300, y: 100, ancho: 40, alto: 40 }, { ancho: 344, alto: 80 }, { ancho: 360, alto: 640 }).x, posicionTooltip({ x: 100, y: 50, ancho: 40, alto: 40 }, { ancho: 200, alto: 600 }, { ancho: 360, alto: 640 })], [8, { x: 20, y: 32, lado: "abajo" }]);
  }

  // ══ 6. Leyenda simplificada ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  {
    const leyenda = tramo("className={estilos.leyenda}", "<div className={ui.tableScroll}>");

    cierto("UXR01-21 leyenda UNA vez, fuera de las filas: orden de los cuatro iconos en una línea + cinco colores (confirmado, CDC informado, pendiente/aviso, rechazo/error, sin información)",
      (pagina.match(/className=\{estilos\.leyenda\}/g) ?? []).length === 1 && pagina.indexOf("estilos.leyenda}") < pagina.indexOf("filas.map((d) =>") &&
      /NOMBRE_EJE\.envio\} · \{NOMBRE_EJE\.xml\} · \{NOMBRE_EJE\.sifen\} · \{NOMBRE_EJE\.correo\}/.test(leyenda) && (leyenda.match(/estilos\.punto/g) ?? []).length === 5 &&
      ["confirmado", "CDC informado", "pendiente / aviso", "rechazo / error", "sin información"].every((t) => leyenda.includes(t)));
    cierto("UXR01-22 sin párrafo de instrucciones ni explicaciones por eje en la leyenda (antes «Pase el cursor…» y «(recepción del gateway)…»)",
      !/Pase el cursor|recepción del gateway\)|leyendaAyuda/.test(pagina));
  }

  // ══ 7. Iconos para consultar, KuDE, copiar y expandir ═══════════════════════════════════════════════════════════════════════════════════
  cierto("UXR01-23 consultar = botón de icono en la cabecera del detalle, SOLO con permiso EDITAR, con aria-label/title, deshabilitado y girando mientras consulta",
    /\{editar \? \(\s*<div className=\{estilos\.herramientas\} role="toolbar"/.test(primera) && /<Glifo>\{ACCION\.consultar\}<\/Glifo>/.test(primera) && /title=\{accion === "consulta" \? "Consultando\.\.\." : "Consultar estado en SIFEN"\}/.test(primera) &&
    /disabled=\{Boolean\(accion\)\}/.test(primera) && /accion === "consulta" && estilos\.girando/.test(primera) && /onClick=\{\(\) => void reconsultar\(d\)\}/.test(primera) && /prefers-reduced-motion: reduce/.test(cssLimpio));
  cierto("UXR01-24 KuDE = icono de la fila (kudeDisponible, aria-label por tipo y número), sin duplicado en el detalle",
    /kudeDisponible\(d\) \? \(/.test(fila) && /\{ACCION\.kude\}/.test(fila) && (pagina.match(/abrirKude\(d\)/g) ?? []).length === 1 && !/abrirKude/.test(detalle));
  cierto("UXR01-25 copiar = icono con aria-label «Copiar número de lote»/«Copiar CDC», copia exacta (writeText(valor)) y feedback por icono ✓ + aviso aria-live; sin botón «Copiar» de texto",
    /aria-label="Copiar número de lote"/.test(primera) && /aria-label="Copiar CDC"/.test(primera) && /ACCION\.copiado : ACCION\.copiar/.test(primera) && /await navigator\.clipboard\.writeText\(valor\);/.test(pagina) && !/>Copiar<|>Copiado</.test(primera) && /aria-live="polite"/.test(primera));
  cierto("UXR01-26 expandir = icono chevron (abrir/cerrar) en la fila con aria-expanded y en el control del historial técnico",
    /aria-expanded=\{Boolean\(det\)\}/.test(fila) && /\{det \? ACCION\.cerrar : ACCION\.abrir\}/.test(fila) && /aria-expanded=\{det\.tecnico\}/.test(primera) && /\{det\.tecnico \? ACCION\.cerrar : ACCION\.abrir\}/.test(primera));

  // ══ 8. Primera capa: solo cuatro datos fiscales ═════════════════════════════════════════════════════════════════════════════════════════
  cierto("UXR01-27 primera capa con exactamente cuatro <dt>: Nro lote, CDC (o «CDC de la nota de crédito»), Fecha firma, Mensaje; sin «fases» repetidas en la cabecera",
    (primera.match(/<dt /g) ?? []).length === 4 && ["Nro lote</dt>", "\"CDC de la nota de crédito\" : \"CDC\"", "Fecha firma</dt>", "Mensaje</dt>"].every((t) => primera.includes(t)) && !/resumenFases|fiscalFases/.test(pagina));
  cierto("UXR01-28 lote y CDC literales (sin trim/recorte, CDC en pre-wrap) con «No informado»; mensaje en rojo SOLO con RECHAZADO persistido",
    /\{d\.lote \?\? "No informado"\}/.test(primera) && /style=\{\{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" \}\}>\{fiscal\.cdc \?\? "No informado"\}/.test(primera) && /fiscal\.rechazo \? estilos\.mensajeRechazo/.test(primera) && !/\.trim\(\)/.test(primera));
  igual("UXR01-29 detalleFiscalPrimario (sin cambios) entrega el CDC opaco tal cual, aunque tenga espacios o no tenga 44 dígitos",
    detalleFiscalPrimario({ lote: " L-1 ", cdc: " 0180-ABC ", fechaFirma: null, codRespuesta: "1101", mensajeRespuesta: "Número de timbrado inválido", estadoSifen: "RECHAZADO" }),
    { lote: " L-1 ", cdc: " 0180-ABC ", fechaFirma: null, mensaje: "1101 · Número de timbrado inválido", rechazo: true });

  // ══ 9. Segunda capa: explicaciones técnicas y JSON, cerrada por defecto ═══════════════════════════════════════════════════════════════════
  cierto("UXR01-30 el historial técnico arranca CERRADO (tecnico: false) y abrirlo no hace fetch (solo muestra lo ya cargado por GET)",
    /tecnico: false, copiado: "" \};/.test(pagina) && /\{det\.tecnico \? \(/.test(segunda) && !/fetch/.test(tramo("function alternarTecnico", "function verSolicitud")));
  cierto("UXR01-31 en la segunda capa (y no en la primera): explicación completa del aviso (alerta.detalle), nota «estado final sin CDC» (avisoSinCdc), seguimiento en 3 ejes, registro, JSON de solicitud/respuesta, historial, conexión y paginación",
    ["{alerta.detalle}", "{sinCdc}", "seguimiento.envio", "Estado fiscal registrado", "verSolicitud(d, sol)", "verRespuesta(d, i)", "Historial de envíos y consultas", "Conexión: no registrada (intento anterior a NEX-079)", "cargarAnteriores(d)", "XML: descarga no disponible"]
      .every((t) => segunda.includes(t) && !primera.includes(t)));
  cierto("UXR01-32 la segunda capa ya no usa estilos en línea para su maquetación (dl/pre/h4 con clases locales); solo quedan el ancho mínimo de la tabla del historial y el margen de un aviso",
    (segunda.match(/style=\{\{/g) ?? []).length === 2 /* ancho mínimo de la tabla del historial + margen del error de «cargar anteriores» */ && /className=\{estilos\.datosTecnicos\}/.test(segunda) && /<pre className=\{estilos\.json\}>/.test(segunda) && /<h4 className=\{estilos\.subtitulo\}>/.test(segunda));

  // ══ 10. Avisos críticos siempre visibles ════════════════════════════════════════════════════════════════════════════════════════════════
  cierto("UXR01-33 en la PRIMERA capa, breves y visibles: rechazo del gateway por validación, envío indeterminado (verificar antes de reenviar), aviso técnico de la última consulta y «Requiere revisión»",
    /d\.estadoLocal === "ERROR_ENVIO" && d\.envioErrorTipo === "RECHAZO" \? \(\s*<p className=\{ui\.alertError\} role="alert">/.test(primera) && /d\.estadoLocal === "ENVIO_INDETERMINADO" \? \(\s*<p className=\{ui\.alertError\} role="alert">/.test(primera) &&
    /Verifique el documento en el gateway antes de cualquier reenvío/.test(primera) && /<strong>Aviso técnico:<\/strong> \{alerta\.texto\}/.test(primera) && /<strong>Requiere revisión:<\/strong>/.test(primera));
  cierto("UXR01-34 el reenvío de un documento rechazado sigue exigiendo confirmación explícita (window.confirm) antes de cualquier POST; el envío indeterminado no ofrece reenviar",
    /if \(confirmarRechazo && !window\.confirm\(/.test(pagina) && pagina.indexOf("window.confirm(") < pagina.indexOf("iniciarAccion(d, \"envio\")") && !/ENVIO_INDETERMINADO"[^)]{0,80}enviarAlGateway/.test(pagina));
  cierto("UXR01-35 resultado y error de la última acción visibles (role status / alert) en la primera capa, incluida la continuidad de conexión no verificable",
    /\{det\.aviso \? <div className=\{ui\.alertOk\} role="status"/.test(primera) && /\{det\.error \? <div className=\{ui\.alertError\} role="alert"/.test(primera) && /Continuidad de la conexión no verificable/.test(pagina));

  // ══ 11. Respuestas tardías y cambios de filtros (AUD UX04) ══════════════════════════════════════════════════════════════════════════════
  igual("UXR01-36 claveContexto: filtros + página; la recarga NO cambia el contexto, otra página u otros filtros sí",
    [claveContexto("[\"a\"]", 1) === claveContexto("[\"a\"]", 1), claveContexto("[\"a\"]", 1) === claveContexto("[\"a\"]", 2), claveContexto("[\"a\"]", 1) === claveContexto("[\"b\"]", 1)], [true, false, false]);
  igual("UXR01-37 esResultadoVigente: solo con detalle abierto y misma generación (cerrado, reabierto o de otro contexto → se descarta)",
    [esResultadoVigente(true, 3, 3), esResultadoVigente(false, 3, 3), esResultadoVigente(true, 3, 4)], [true, false, false]);
  cierto("UXR01-38 el resultado guarda su contexto; uno de OTRO contexto no se muestra (filas vacías, «Cargando…»): no quedan filas obsoletas accionables tras cambiar filtros o página",
    /setResultado\(\{ clave: claveConsulta, contexto, datos, error: "" \}\)/.test(pagina) && /const obsoleto = resultado !== null && resultado\.contexto !== contexto;/.test(pagina) && /const filas = obsoleto \? \[\] :/.test(pagina) && /obsoleto \? "Cargando\.\.\."/.test(pagina));
  cierto("UXR01-39 al cambiar de contexto se cierran todos los detalles y el tooltip (ajuste de estado en el render, sin efecto)",
    /if \(contextoVisto !== contexto\) \{\s*setContextoVisto\(contexto\);\s*setAbiertos\(\{\}\);\s*setTip\(null\);\s*\}/.test(pagina));
  cierto("UXR01-40 consultar/enviar: una acción por documento a la vez (ref + estado enCurso que sobrevive al cierre), respuesta aplicada SOLO a la misma generación y sin recrear el detalle; la lista se relee igual",
    /if \(accionEnCurso\.current\.has\(d\.id\)\) return null;/.test(pagina) && /if \(vigenteDetalle\(d, generacion\)\) fusionarIntentos/.test(pagina) && /if \(vigenteDetalle\(d, generacion\)\) aplicarDetalle/.test(pagina) &&
    (pagina.match(/finally \{\s*terminarAccion\(d\);/g) ?? []).length === 2 && /setRecarga\(\(n\) => n \+ 1\)/.test(tramo("async function reconsultar", "async function enviarAlGateway")) && !/actualizarDetalle/.test(pagina) &&
    /function aplicarDetalle\(id: string, parte: Partial<Detalle>\) \{\s*setAbiertos\(\(a\) => \(a\[id\] \?/.test(pagina));
  cierto("UXR01-41 abrir un detalle invalida el JSON y el historial anteriores (nueva generación de ambos); la copia solo borra su propio «Copiado»",
    /historialVigente\.current\[d\.id\] = generacion;\s*jsonVigente\.current\[d\.id\] = \(jsonVigente\.current\[d\.id\] \?\? 0\) \+ 1;/.test(pagina) && /if \(copiaVigente\.current\[d\.id\] === marca\) aplicarDetalle/.test(pagina));
  cierto("UXR01-42 el refresco automático (solo GET) se calcula sobre el contexto vigente y sigue limpiando su temporizador",
    /resultado\?\.contexto === contexto \?/.test(tramo("const hayPendientes", "useEffect(")) && /if \(!hayPendientes\) return;/.test(pagina) && /detener\(\);/.test(pagina) && !/consultar-estado|enviar/.test(tramo("Actualización automática", "const cargando")));

  // ══ 12. Responsive ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  cierto("UXR01-43 escritorio: tabla con ancho mínimo propio 860px y scroll horizontal local; tarjeta en ≤ 720px (Documento|Total / Cliente|Fecha / Estados|Acciones) sin ancho mínimo",
    /min-width: 860px/.test(regla(css, "table.tablaDocs")) && /<div className=\{ui\.tableScroll\}>\s*<table className=\{clases\(ui\.table, estilos\.tablaDocs\)\}/.test(pagina) &&
    /@media \(max-width: 720px\) \{\s*table\.tablaDocs \{\s*min-width: 0;/.test(cssLimpio) && /"doc total"\s*"cliente fecha"\s*"estados acciones"/.test(cssLimpio) && /tr:has\(> td:nth-child\(6\)\)/.test(cssLimpio));
  cierto("UXR01-44 móvil: la barra de orden se conserva (thead como fila flexible, sin la columna Acciones), el acento FE/NCE recorre la columna izquierda de la tarjeta y los datos fiscales apilan etiqueta/valor (≤ 640px)",
    /table\.tablaDocs > thead > tr \{\s*display: flex;/.test(cssLimpio) && /table\.tablaDocs tr\.filaFE > td:is\(:nth-child\(3\), :nth-child\(5\)\) \{\s*box-shadow: inset 4px 0 0 #6d9bd1;/.test(cssLimpio) &&
    /table\.tablaDocs tr\.filaNCE > td:is\(:nth-child\(3\), :nth-child\(5\)\) \{\s*box-shadow: inset 4px 0 0 #d9bb4e;/.test(cssLimpio) && /@media \(max-width: 640px\) \{\s*\.fiscal > div \{\s*grid-template-columns: minmax\(0, 1fr\) 36px;/.test(cssLimpio));
  cierto("UXR01-45 áreas táctiles ≥ 36px en botones de acción/copia/historial y ≥ 40px en iconos de estado; sin cambios en el CSS compartido",
    /width: 36px;\s*height: 36px;/.test(regla(css, ".iconBtn")) && /width: 36px;\s*height: 36px;/.test(regla(css, ".copiar")) && /min-height: 36px/.test(regla(css, ".toggleTecnico")) && !/tablaDocs|tooltip|iconoVacio|kpis/.test(lista));

  // ══ 13. Solo se eliminan estilos locales sin uso confirmado ═════════════════════════════════════════════════════════════════════════════
  {
    const clasesCss = [...new Set([...cssLimpio.matchAll(/\.([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1]))];
    const usadas = new Set([...pagina.matchAll(/estilos\.([a-zA-Z0-9]+)/g)].map((m) => m[1]));

    cierto("UXR01-46 toda clase del CSS local se usa en page.tsx (estilos.X) y toda estilos.X existe en el CSS: no quedan reglas huérfanas ni referencias rotas",
      clasesCss.length > 0 && clasesCss.every((c) => usadas.has(c)) && [...usadas].every((c) => clasesCss.includes(c)));
    cierto("UXR01-47 retiradas SOLO reglas sin uso confirmado (cápsulas .sifen*, alertas .alerta*, .iconoNombre, .leyendaAyuda, .fiscalCabecera/.fiscalFases, tooltip ::after) y ningún otro archivo las usaba",
      !/\.(sifen|alertaInconsistencia|alertaTecnica|alertaIcono|iconoNombre|leyendaAyuda|fiscalCabecera|fiscalFases)\b/.test(cssLimpio) && !/estilos\.(sifen|alerta[A-Z])/.test(pagina) && !/page\.module\.css/.test(leer("app/(private)/documentos/kude-modal.tsx")));
  }

  // ══ 14. Colores FE y NCE preservados ════════════════════════════════════════════════════════════════════════════════════════════════════
  igual("UXR01-48 FE azul / NCE amarillo sin cambios: fila, acento, hover/foco, detalle y etiqueta de tipo (mismos valores de PRO-334/R02)",
    [hex(regla(css, "tr.filaFE > td"), "background"), hex(regla(css, "tr.filaNCE > td"), "background"), /#6d9bd1/.test(regla(css, "tr.filaFE > td:first-child")), /#d9bb4e/.test(regla(css, "tr.filaNCE > td:first-child")),
      hex(regla(css, "tr.filaFE:hover > td,\ntr.filaFE:focus-within > td"), "background"), hex(regla(css, "tr.filaNCE:hover > td,\ntr.filaNCE:focus-within > td"), "background"),
      hex(regla(css, "tr.detalleFE > td"), "background"), hex(regla(css, "tr.detalleNCE > td"), "background"), hex(regla(css, ".filaFE .tipoFE"), "color"), hex(regla(css, ".filaNCE .tipoNCE"), "color")],
    ["#f4f8fd", "#fffcee", true, true, "#e9f1fb", "#fdf6da", "#f9fbfe", "#fffdf5", "#1d4a7c", "#5a4500"]);
  cierto("UXR01-49 el color de la fila sigue dependiendo SOLO del tipo (CLASE_FILA_TIPO/CLASE_DETALLE_TIPO) y el texto secundario AA (#53687a) se mantiene",
    /CLASE_FILA_TIPO: Partial<Record<TipoDocumento, string>> = \{ FE: estilos\.filaFE, NCE: estilos\.filaNCE \}/.test(pagina) && /<tr className=\{clases\(estilos\.detalle, CLASE_DETALLE_TIPO\[d\.tipo\]\)\} data-tipo=\{d\.tipo\}>/.test(pagina) && /#53687a/.test(cssLimpio));

  // ══ 15. Funcionalidades, permisos, filtros, estados, consultas y acciones preservados ══════════════════════════════════════════════════
  cierto("UXR01-50 filtros (búsqueda con espera 300 ms, tipo, sucursal, estado SIFEN, desde/hasta), «Limpiar filtros», indicadores-filtro, orden por 5 columnas y paginación",
    ["setBusqueda(e.target.value)", "setBusquedaAplicada(busqueda.trim()), 300", "TIPOS_DOCUMENTO.map", "datos?.sucursales", "ESTADOS_SIFEN.map", "<CampoFecha valor={desde}", "<CampoFecha valor={hasta}", "onClick={limpiar}", "INDICADORES.map", "setPagina(paginaMostrada + 1)", "setPagina(paginaMostrada - 1)"].every((t) => pagina.includes(t)) &&
    ["numero", "fecha", "cliente", "total", "estado"].every((c) => pagina.includes(`campo="${c}" orden={orden} onOrden={cambiarOrden}`)));
  cierto("UXR01-51 permisos sin cambios: consultar solo con EDITAR; enviar/reenviar/corregir NCE solo con CREAR; las rutas llamadas son exactamente las mismas (sin rutas nuevas)",
    /\{editar \? \(/.test(primera) && /crear && \(d\.estadoLocal === "PENDIENTE_ENVIO" \|\| \(d\.estadoLocal === "ERROR_ENVIO" && d\.envioErrorTipo !== "RECHAZO"\)\)/.test(primera) && /crear && d\.tipo !== "NCE" && d\.estadoLocal === "ERROR_ENVIO" && d\.envioErrorTipo === "RECHAZO"/.test(primera) && /crear && d\.tipo === "NCE" && d\.corregible/.test(primera) &&
    igualRutas(pagina));
  cierto("UXR01-52 acciones y lecturas preservadas: enviar, reenviar con confirmación, corregir NCE, consulta manual, KuDE, JSON de solicitud/respuesta, intentos anteriores, refresco automático y relectura tras acciones",
    ["enviarAlGateway(d)", "enviarAlGateway(d, true)", "Corregir y emitir nueva", "reconsultar(d)", "abrirKude(d)", "verSolicitud(d, sol)", "verRespuesta(d, i)", "cargarAnteriores(d)", "cerrarJson(d)", "iniciarRefresco({", "<KudeModal controlador={visor} />"].every((t) => pagina.includes(t)));
  cierto("UXR01-53 sin validación fiscal del CDC en la pantalla (sin 44 dígitos, módulo 11 ni comparación): el CDC se muestra y copia tal cual lo informó la API",
    !/\\d\{44\}|\{44\}|modulo|módulo|cdcCoherente|cdcValido/.test(pagina));

  return fallos;
}

/** Las únicas llamadas de red de la pantalla son las ya existentes (listado, detalle, intentos, consultar, enviar, solicitud, respuesta); ninguna ruta nueva. */
function igualRutas(pagina: string): boolean {
  const rutas = [...pagina.matchAll(/`(\/api\/[^`]*)`/g)].map((m) => m[1].replace(/\$\{[^}]*\}/g, ":x")).sort();

  return JSON.stringify([...new Set(rutas)]) === JSON.stringify([
    "/api/documentos/:x", "/api/documentos/:x/consultar", "/api/documentos/:x/enviar", "/api/documentos/:x/intentos/:x/respuesta", "/api/documentos/:x/intentos?cursor=:x", "/api/documentos/:x/solicitud?version=:x", "/api/documentos?:x",
  ].sort());
}
