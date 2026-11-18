/**
 * PRO-334 (CASA MINGO, ETAPA 3) — Documentos electrónicos: color por TIPO de comprobante (FE = azul suave, NCE = amarillo claro suave) en la fila y en el detalle
 * desplegado, INDEPENDIENTE del estado fiscal PRO-338 (cápsula verde/roja/amarilla/gris) y de la alerta técnica CDC_DIVERGENTE (rectángulo rojo).
 * Lógica REAL probada: presentacionSifen/alertaConsulta (el tono fiscal no depende del tipo). Pantalla y CSS se verifican sobre el texto fuente (sin navegador).
 * PRO-334-R02 (R01-F001): texto secundario de filas y detalle FE/NCE con contraste AA ABSOLUTO ≥ 4.5:1 (PRO334-18b corregido, PRO334-25..30 nuevos).
 * PRO-195-UX-R01: tabla BLANCA (la fila ya no se pinta entera); el tipo queda en la etiqueta FE/NCE y en un acento lateral de 3px; casos marcados «actualizado PRO-195».
 * Casos ESCRITOS, NO EJECUTADOS en la entrega (restricción vigente: sin runner, lint, typecheck, build, SQL ni navegador).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { ETIQUETA_TIPO, type EstadoLocal, type EstadoSifen } from "@/lib/facturacion/estados";
import { alertaConsulta, presentacionSifen } from "@/lib/facturacion/presentacion-sifen";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");

/** Extrae el cuerpo de la PRIMERA regla cuyo selector COMPLETO coincide exactamente (no una parte de una lista «a, b {»), sin comentarios. */
function regla(css: string, selector: string): string {
  const limpio = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const m = new RegExp(`(?:^|[}{])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(limpio);

  return m ? m[1] : "";
}

/** Color hex → luminancia relativa WCAG. */
function luminancia(hex: string): number {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));

  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}

const contraste = (a: string, b: string) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);

  return (x + 0.05) / (y + 0.05);
};

const hex = (bloque: string, prop: string) => new RegExp(`${prop}:\\s*(#[0-9a-f]{6})`, "i").exec(bloque)?.[1]?.toLowerCase() ?? "";

/** Matiz HSL en grados (para distinguir azul / amarillo / rojo / verde). */
function matiz(h: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  if (d === 0) return -1;
  const t = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;

  return (t * 60 + 360) % 360;
}

const esAzul = (h: string) => matiz(h) >= 195 && matiz(h) <= 230;
const esAmarillo = (h: string) => matiz(h) >= 40 && matiz(h) <= 60;
const esRojoOVerde = (h: string) => { const m = matiz(h); return m >= 0 && (m < 25 || m > 340 || (m > 90 && m < 160)); };

export async function verificarCasosColoresTipoPro334(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, condicion: boolean) => igual(nombre, condicion, true);

  const pagina = leer("app/(private)/documentos/page.tsx");
  const css = leer("app/(private)/documentos/page.module.css");

  // ── 1. Color por tipo en la pantalla ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  cierto("PRO334-01 mapas por TIPO: FE → filaFE/detalleFE/tipoFE, NCE → filaNCE/detalleNCE/tipoNCE; otros tipos sin clase",
    /CLASE_FILA_TIPO: Partial<Record<TipoDocumento, string>> = \{ FE: estilos\.filaFE, NCE: estilos\.filaNCE \}/.test(pagina) &&
    /CLASE_DETALLE_TIPO: Partial<Record<TipoDocumento, string>> = \{ FE: estilos\.detalleFE, NCE: estilos\.detalleNCE \}/.test(pagina) &&
    /CLASE_ETIQUETA_TIPO: Partial<Record<TipoDocumento, string>> = \{ FE: estilos\.tipoFE, NCE: estilos\.tipoNCE \}/.test(pagina));
  cierto("PRO334-02 (actualizado PRO-195) la fila conserva ui.row (hover/foco estándar) y suma la clase del tipo con data-tipo (y la de selección, sin significado fiscal)", /<tr className=\{clases\(ui\.row, CLASE_FILA_TIPO\[d\.tipo\], marcado && estilos\.filaMarcada\)\} data-tipo=\{d\.tipo\}>/.test(pagina));
  cierto("PRO334-03 la clase de fila depende SOLO de d.tipo: no se usa estadoSifen, tono ni alerta para colorear la fila",
    !/CLASE_FILA_TIPO\[[^\]]*(estado|sifen|tono|alerta)/i.test(pagina) && !/className=\{[^}]*sifen\.tono[^}]*ui\.row/.test(pagina));
  cierto("PRO334-04 (actualizado PRO-195) el detalle desplegado lleva el mismo acento por tipo, ocupa las 10 columnas y no usa fondo inline",
    /<tr id=\{`detalle-\$\{d\.id\}`\} className=\{clases\(estilos\.detalle, CLASE_DETALLE_TIPO\[d\.tipo\]\)\} data-tipo=\{d\.tipo\}>\s*<td colSpan=\{10\}>/.test(pagina) && !/colSpan=\{\d+\} style=\{\{ background/.test(pagina));
  cierto("PRO334-05 (actualizado PRO-195) el tipo sigue ESCRITO (no solo color): código FE/NCE visible en la etiqueta + nombre completo como título y texto accesible",
    /<span className=\{CLASE_ETIQUETA_TIPO\[d\.tipo\] \?\? estilos\.tipoOtro\} title=\{ETIQUETA_TIPO\[d\.tipo\]\}>\{d\.tipo\}<\/span>/.test(pagina) && /<span className=\{estilos\.srSolo\}> \{ETIQUETA_TIPO\[d\.tipo\]\}<\/span>/.test(pagina));
  igual("PRO334-06 etiquetas de texto de FE y NCE", [ETIQUETA_TIPO.FE, ETIQUETA_TIPO.NCE], ["Factura electrónica", "Nota de crédito"]);

  // ── 2. Paleta (PRO-195-UX-R01: tabla BLANCA, la fila ya no se pinta entera; el tipo queda en la etiqueta y en un acento lateral discreto de 3px) ──────────
  const FILAS = "tr.filaFE > td,\ntr.filaNCE > td";
  const HOVER = "tr.filaFE:hover > td,\ntr.filaFE:focus-within > td,\ntr.filaNCE:hover > td,\ntr.filaNCE:focus-within > td";
  const fe = hex(regla(css, FILAS), "background");
  const nce = fe;
  const hover = hex(regla(css, HOVER), "background");
  const acentoFe = /inset 3px 0 0 (#[0-9a-f]{6})/i.exec(regla(css, "tr.filaFE > td:first-child"))?.[1] ?? "";
  const acentoNce = /inset 3px 0 0 (#[0-9a-f]{6})/i.exec(regla(css, "tr.filaNCE > td:first-child"))?.[1] ?? "";

  cierto("PRO334-07 (actualizado PRO-195) FE: fondo BLANCO y acento lateral AZUL discreto de 3px; la etiqueta FE conserva su azul", fe === "#ffffff" && esAzul(acentoFe) && esAzul(hex(regla(css, ".filaFE .tipoFE"), "background")));
  cierto("PRO334-08 (actualizado PRO-195) NCE: fondo BLANCO y acento lateral AMARILLO discreto de 3px; la etiqueta NCE conserva su amarillo", nce === "#ffffff" && esAmarillo(acentoNce) && esAmarillo(hex(regla(css, ".filaNCE .tipoNCE"), "background")));
  cierto("PRO334-09 (actualizado PRO-195) ninguna clase de fila/detalle usa rojo o verde (no se confunde con aprobado/rechazado)",
    [FILAS, HOVER, "tr.filaMarcada > td", "tr.detalleFE > td", "tr.detalleNCE > td"].map((x) => hex(regla(css, x), "background")).every((h) => h !== "" && !esRojoOVerde(h)));
  cierto("PRO334-10 (actualizado PRO-195) la fila no lleva color de estado ni borde redondeado: el «pendiente» fiscal es un trazo ámbar del símbolo, sin fondo",
    hex(regla(css, ".iconoAviso .iconoCirculo"), "background") === "" && hex(regla(css, ".iconoAviso .iconoCirculo"), "color") === "#8a5a00" && !/border-radius/.test(regla(css, FILAS)));

  // ── 3. Estado fiscal PRO-338 y CDC_DIVERGENTE intactos e independientes del tipo ──────────────────────────────────────────────────────────────────
  /** El documento completo (con tipo) pasa a la lógica fiscal real: el tono debe ser el mismo para FE y NCE. */
  const tonos = (estadoLocal: EstadoLocal, estadoSifen: EstadoSifen) => (["FE", "NCE"] as const).map((tipo) => {
    const d = { tipo, estadoLocal, estadoSifen };

    return presentacionSifen(d).tono;
  });
  const alertas = (["FE", "NCE"] as const).map((tipo) => {
    const d = { tipo, ultimaConsultaResultado: "CDC_DIVERGENTE" };

    return alertaConsulta(d)?.tipo;
  });

  igual("PRO334-11 FE y NCE APROBADO → tono «aprobado» (verde) en ambos tipos", tonos("ENVIADO", "APROBADO"), ["aprobado", "aprobado"]);
  igual("PRO334-12 FE y NCE RECHAZADO → tono «rechazado» (rojo) en ambos tipos; PENDIENTE enviado → «pendiente» (amarillo) en ambos", [tonos("ENVIADO", "RECHAZADO"), tonos("ENVIADO", "PENDIENTE")], [["rechazado", "rechazado"], ["pendiente", "pendiente"]]);
  igual("PRO334-13 FE y NCE aún no transmitidos → «sinTransmitir» (gris) en ambos tipos", tonos("PENDIENTE_ENVIO", "SIN_CONSULTA"), ["sinTransmitir", "sinTransmitir"]);
  igual("PRO334-14 (R05: CDC_DIVERGENTE solo como registro histórico) CDC_DIVERGENTE sigue siendo alerta de «inconsistencia» (roja técnica) para FE y NCE", alertas, ["inconsistencia", "inconsistencia"]);
  // PRO-195-UX-R01 (punto 1): símbolos de CONTORNO sin círculo relleno; el color va en el trazo (verde/azul/ámbar/rojo/gris), nunca en la fila.
  cierto("PRO334-15 (actualizado PRO-195) colores fiscales en el TRAZO de los símbolos (sin fondo relleno): verde confirmado, rojo rechazo/error, ámbar pendiente, gris sin información",
    hex(regla(css, ".iconoOk .iconoCirculo"), "color") === "#12703f" && hex(regla(css, ".iconoError .iconoCirculo"), "color") === "#b42318" &&
    hex(regla(css, ".iconoAviso .iconoCirculo"), "color") === "#8a5a00" && hex(regla(css, ".iconoNeutro .iconoCirculo"), "color") === "#4a5a6a" &&
    ![".iconoOk .iconoCirculo", ".iconoInfo .iconoCirculo", ".iconoAviso .iconoCirculo", ".iconoError .iconoCirculo", ".iconoNeutro .iconoCirculo"].some((x) => /background/.test(regla(css, x))) &&
    !/\.sifen/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")));
  // PRO-195-UX-R01 (punto 4): la fila muestra UN estado principal (clase por tono fiscal); los cuatro ejes independientes pasan a la segunda capa, con las clases por tono, nunca por tipo.
  cierto("PRO334-16 (actualizado PRO-195) estado principal por tono fiscal en la fila; cuatro estados técnicos en la segunda capa con CLASE_TONO_ICONO (no las del tipo); el aviso del detalle conserva las clases PRO-338 y su borde rojo",
    /clases\(estilos\.estadoPrincipal, CLASE_ESTADO\[estado\.tono\]\)/.test(pagina) && !/CLASE_ESTADO\[[^\]]*tipo/.test(pagina) &&
    /iconosEstado\(d\)\.map\(\(i\) => \([\s\S]*?<IconoFase eje=\{i\.eje\} simbolo=\{i\.simbolo\} clase=\{CLASE_TONO_ICONO\[i\.tono\]\} texto=\{i\.texto\} tip=\{eventosTip\} \/>/.test(pagina) && !/CLASE_TONO_ICONO\[[^\]]*tipo/.test(pagina) &&
    /alerta\.tipo === "inconsistencia" \? estilos\.avisoInconsistencia : estilos\.avisoTecnico/.test(pagina) && hex(regla(css, ".avisoInconsistencia"), "border-color") === "#c8372d");

  // ── 4. Hover/foco, accesibilidad y responsive ─────────────────────────────────────────────────────────────────────────────────────────────────────
  cierto("PRO334-17 (actualizado PRO-195) hover y foco de teclado (focus-within) siguen visibles: gris neutro muy claro, distinto del blanco y sin color fiscal",
    hover !== "" && hover !== fe && luminancia(hover) < luminancia(fe) && luminancia(hover) > 0.9 && !esRojoOVerde(hover));
  const fondosFila = [fe, nce, hover, hex(regla(css, "tr.filaMarcada > td"), "background")];

  cierto("PRO334-18 contraste AA (≥ 4.5): etiquetas FE/NCE sobre su fondo y texto principal de la lista (.cell strong #234560) sobre todos los fondos de fila, incluso en hover/foco",
    contraste(hex(regla(css, ".filaFE .tipoFE"), "color"), hex(regla(css, ".filaFE .tipoFE"), "background")) >= 4.5 &&
    contraste(hex(regla(css, ".filaNCE .tipoNCE"), "color"), hex(regla(css, ".filaNCE .tipoNCE"), "background")) >= 4.5 &&
    fondosFila.every((f) => f !== "" && contraste("#234560", f) >= 4.5));
  // ── R02 (R01-F001): texto secundario con contraste AA ABSOLUTO, colores y selectores reales ────────────────────────────────────────────────────────
  const lista = leer("components/ui/lista-padrao/lista.module.css");
  const SEL_SECUNDARIO = [
    "tr.filaFE > td:is(:nth-child(4), :nth-child(5)) > div > span",
    "tr.filaNCE > td:is(:nth-child(4), :nth-child(5)) > div > span",
    "tr.detalleFE > td :is(dt, small, p:not([role]))",
    "tr.detalleNCE > td :is(dt, small, p:not([role]))",
  ].join(",\n");
  const secundario = hex(regla(css, SEL_SECUNDARIO), "color");
  const detalleFe = hex(regla(css, "tr.detalleFE > td"), "background");
  const detalleNce = hex(regla(css, "tr.detalleNCE > td"), "background");
  const hoverAnidado = hex(regla(lista, ".row:hover td,\n.row:focus-within td"), "background");
  const fondosSecundario = [...fondosFila, detalleFe, detalleNce, hoverAnidado];
  const minimo = Math.min(...fondosSecundario.map((f) => contraste(secundario, f)));

  cierto("PRO334-18b (actualizado PRO-195) contraste ABSOLUTO ≥ 4.5:1 del texto secundario local en los fondos de fila (blanco, hover/foco, seleccionada), del detalle FE/NCE y en el hover de filas del historial",
    secundario !== "" && fondosSecundario.length === 7 && fondosSecundario.every((f) => f !== "") && minimo >= 4.5);
  igual("PRO334-25 (actualizado PRO-195) texto secundario = #53687a, ≥ 5:1 en todos los fondos (los fondos PRO-195 son más claros que el antiguo hover FE)", [secundario, minimo >= 5], ["#53687a", true]);
  cierto("PRO334-26 los colores heredados que fallaban AA (.cell span #6f8498, .muted #8092a4) quedan sustituidos solo localmente: la regla R02 gana en especificidad y el CSS global no cambia",
    hex(regla(lista, ".cell span"), "color") === "#6f8498" && hex(regla(lista, ".muted"), "color") === "#8092a4" &&
    [fe, nce, hover, detalleFe, detalleNce].some((f) => contraste("#6f8498", f) < 4.5 || contraste("#8092a4", f) < 4.5) && !/53687a/i.test(lista));
  cierto("PRO334-27 (actualizado PRO-195) filas: el selector alcanza solo los metadatos directos de Nro. Documento (4.ª) y Fecha emisión (5.ª); las columnas de control, acciones, estado y eventos quedan fuera",
    /<th className=\{estilos\.colControl\}>[\s\S]*<th className=\{estilos\.colControl\}>[\s\S]*titulo="Acciones"[\s\S]*titulo="Nro\. Documento"[\s\S]*titulo="Fecha emisión"[\s\S]*titulo="RUC\/CI"[\s\S]*titulo="Razón Social"[\s\S]*titulo="Monto"[\s\S]*titulo="Estado"[\s\S]*titulo="Eventos"/.test(pagina) &&
    !/nth-child\((1|2|3|6|7|8|9|10)\)/.test(regla(css, SEL_SECUNDARIO) + SEL_SECUNDARIO));
  cierto("PRO334-28 (actualizado PRO-195) la etiqueta de tipo no es hija directa de la celda (va dentro del span de metadatos) y conserva su color propio con contraste AA",
    /<span>\s*<span className=\{CLASE_ETIQUETA_TIPO\[d\.tipo\] \?\? estilos\.tipoOtro\}/.test(pagina) && hex(regla(css, ".filaFE .tipoFE"), "color") === "#1d4a7c" && hex(regla(css, ".filaNCE .tipoNCE"), "color") === "#5a4500");
  // PRO-342-UX-R01: los indicadores ya no tienen <small> de ayuda (es texto accesible oculto) y «Cargar intentos anteriores» está en un <div>, no en un <p>.
  cierto("PRO334-29 (actualizado UX-R01) detalle: todos los <dt> son ui.muted; todo <small> es ui.muted (con o sin clase extra); todo <p> sin role es ui.muted; los avisos role=alert quedan excluidos",
    (pagina.match(/<dt /g) ?? []).length === (pagina.match(/<dt className=\{ui\.muted\}>/g) ?? []).length &&
    (pagina.match(/<small className=\{(ui\.muted|clases\(ui\.muted, [^)]*\))\}>/g) ?? []).length === (pagina.match(/<small/g) ?? []).length && !/<small>\{i\.ayuda\}<\/small>/.test(pagina) &&
    (pagina.match(/<p (?![^>]*role=)(?![^>]*ui\.muted)[^>]*>/g) ?? []).length === 0 &&
    /<p className=\{ui\.alertError\} role="alert">/.test(pagina) && /p:not\(\[role\]\)/.test(SEL_SECUNDARIO));
  igual("PRO334-30 (actualizado PRO-195) fondos blancos/neutros y acentos de tipo vigentes", [fe, hover, fondosFila[3], detalleFe, detalleNce, acentoFe, acentoNce], ["#ffffff", "#f7f9fb", "#f1f6fb", "#fbfcfe", "#fffefa", "#6d9bd1", "#d9bb4e"]);
  cierto("PRO334-19 alto contraste del sistema: el acento pasa a borde real (sólido FE, discontinuo NCE)", /@media \(forced-colors: active\)[\s\S]*border-left: 4px solid CanvasText[\s\S]*border-left: 4px dashed CanvasText/.test(css));
  // PRO-195-UX-R01: diez columnas ⇒ ancho mínimo 1180px en escritorio (scroll horizontal local); 0 en la tarjeta móvil.
  cierto("PRO334-20 (actualizado PRO-195) sin desborde: el acento es box-shadow inset (no suma ancho); la tabla conserva tableScroll, minWidth 1180 en escritorio (clase local) y 0 en tarjeta móvil",
    /inset 3px 0 0/.test(regla(css, "tr.filaFE > td:first-child")) && !/width|padding|margin/.test(regla(css, "tr.filaFE > td:first-child")) &&
    /<div className=\{clases\(ui\.tableScroll, estilos\.contenedorTabla\)\}>\s*<table className=\{clases\(ui\.table, estilos\.tablaDocs\)\}/.test(pagina) && /min-width: 1180px/.test(regla(css, "table.tablaDocs")) && /@media \(max-width: 720px\) \{\s*table\.tablaDocs \{\s*min-width: 0;/.test(css));
  cierto("PRO334-21 sin CSS global: lista.module.css no conoce filaFE/filaNCE", !/fila(FE|NCE)|detalle(FE|NCE)/.test(leer("components/ui/lista-padrao/lista.module.css")));

  // ── 5. Funcionalidades preservadas ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  cierto("PRO334-22 (actualizado PRO-195) KuDE sigue en la fila por kudeDisponible (FE/NCE aun rechazadas o sin CDC), con su nombre accesible por documento",
    /accionesFila\(kudeDisponible\(d\), \{ editar \}, habilitada, motivoEspera\)/.test(pagina) && /etiqueta=\{`Consultar KuDE \(PDF\) de \$\{doc\}/.test(pagina) && /const doc = `\$\{d\.tipo === "NCE" \? "la nota de crédito" : "la factura"\}/.test(pagina));
  cierto("PRO334-23 (actualizado PRO-195) expansión, historial, JSON, consulta manual y automática y orden numérico (PRO-333) siguen presentes",
    /aria-expanded=\{Boolean\(det\)\}/.test(pagina) && /reconsultar\(d\)/.test(pagina) && /iniciarRefresco/.test(pagina) && /verRespuesta\(d, i\)/.test(pagina) &&
    /<ThOrdenable titulo="Nro\. Documento" campo="numero" orden=\{orden\} onOrden=\{cambiarOrden\} \/>/.test(pagina));
  cierto("PRO334-24 sin cambios de datos: la API y el SQL de documentos no mencionan colores por tipo", !/filaFE|filaNCE|azul|amarillo/i.test(leer("app/api/documentos/route.ts")));

  return fallos;
}
