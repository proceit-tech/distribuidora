/**
 * PRO-334 (CASA MINGO, ETAPA 3) — Documentos electrónicos: color por TIPO de comprobante (FE = azul suave, NCE = amarillo claro suave) en la fila y en el detalle
 * desplegado, INDEPENDIENTE del estado fiscal PRO-338 (cápsula verde/roja/amarilla/gris) y de la alerta técnica CDC_DIVERGENTE (rectángulo rojo).
 * Lógica REAL probada: presentacionSifen/alertaConsulta (el tono fiscal no depende del tipo). Pantalla y CSS se verifican sobre el texto fuente (sin navegador).
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
  cierto("PRO334-02 la fila conserva ui.row (hover/foco estándar) y suma la clase del tipo con data-tipo", /<tr className=\{clases\(ui\.row, CLASE_FILA_TIPO\[d\.tipo\]\)\} data-tipo=\{d\.tipo\}>/.test(pagina));
  cierto("PRO334-03 la clase de fila depende SOLO de d.tipo: no se usa estadoSifen, tono ni alerta para colorear la fila",
    !/CLASE_FILA_TIPO\[[^\]]*(estado|sifen|tono|alerta)/i.test(pagina) && !/className=\{[^}]*sifen\.tono[^}]*ui\.row/.test(pagina));
  cierto("PRO334-04 el detalle desplegado lleva el mismo acento por tipo, sin el fondo inline anterior que lo anularía",
    /<tr className=\{clases\(estilos\.detalle, CLASE_DETALLE_TIPO\[d\.tipo\]\)\} data-tipo=\{d\.tipo\}>\s*<td colSpan=\{6\}>/.test(pagina) && !/colSpan=\{6\} style=\{\{ background/.test(pagina));
  cierto("PRO334-05 el tipo sigue ESCRITO (no solo color): «Factura electrónica» / «Nota de crédito» dentro de la etiqueta", /<span className=\{CLASE_ETIQUETA_TIPO\[d\.tipo\]\}>\{ETIQUETA_TIPO\[d\.tipo\]\}<\/span> · \{d\.sucursalNombre\}/.test(pagina));
  igual("PRO334-06 etiquetas de texto de FE y NCE", [ETIQUETA_TIPO.FE, ETIQUETA_TIPO.NCE], ["Factura electrónica", "Nota de crédito"]);

  // ── 2. Paleta: azul FE, amarillo claro NCE, nunca rojo/verde ──────────────────────────────────────────────────────────────────────────────────────
  const fe = hex(regla(css, "tr.filaFE > td"), "background");
  const nce = hex(regla(css, "tr.filaNCE > td"), "background");
  const acentoFe = /inset 4px 0 0 (#[0-9a-f]{6})/i.exec(regla(css, "tr.filaFE > td:first-child"))?.[1] ?? "";
  const acentoNce = /inset 4px 0 0 (#[0-9a-f]{6})/i.exec(regla(css, "tr.filaNCE > td:first-child"))?.[1] ?? "";

  cierto("PRO334-07 FE: fondo y acento AZUL suave (fondo muy claro, luminancia > 0.9)", esAzul(fe) && esAzul(acentoFe) && luminancia(fe) > 0.9);
  cierto("PRO334-08 NCE: fondo y acento AMARILLO claro (fondo muy claro, luminancia > 0.9)", esAmarillo(nce) && esAmarillo(acentoNce) && luminancia(nce) > 0.9);
  cierto("PRO334-09 ninguna clase de tipo usa rojo o verde (no se confunde con aprobado/rechazado)",
    ["tr.filaFE > td", "tr.filaNCE > td", "tr.filaFE:hover > td,\ntr.filaFE:focus-within > td", "tr.filaNCE:hover > td,\ntr.filaNCE:focus-within > td", "tr.detalleFE > td", "tr.detalleNCE > td"]
      .map((s) => hex(regla(css, s), "background")).every((h) => h !== "" && !esRojoOVerde(h)));
  cierto("PRO334-10 el amarillo de la fila NCE es distinto y más claro que la cápsula «pendiente», y la fila no lleva borde de cápsula",
    nce !== hex(regla(css, ".sifenPendiente"), "background") && luminancia(nce) > luminancia(hex(regla(css, ".sifenPendiente"), "background")) && !/border-radius/.test(regla(css, "tr.filaNCE > td")));

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
  igual("PRO334-14 CDC_DIVERGENTE sigue siendo alerta de «inconsistencia» (roja técnica) para FE y NCE", alertas, ["inconsistencia", "inconsistencia"]);
  cierto("PRO334-15 cápsula fiscal sin cambios: verde aprobado, rojo rechazado, amarillo pendiente, gris sin transmitir",
    hex(regla(css, ".sifenAprobado"), "background") === "#e6f6ec" && hex(regla(css, ".sifenRechazado"), "background") === "#fdeceb" &&
    hex(regla(css, ".sifenPendiente"), "background") === "#fff6d6" && hex(regla(css, ".sifenSinTransmitir"), "background") === "#f1f3f5");
  cierto("PRO334-16 cápsula fiscal y alerta CDC siguen en la celda Estados con sus clases PRO-338",
    /<span className=\{`\$\{estilos\.sifen\} \$\{CLASE_TONO_SIFEN\[sifen\.tono\]\}`\} title=\{sifen\.detalle\}>SIFEN: \{sifen\.texto\}<\/span>/.test(pagina) &&
    /alerta\.tipo === "inconsistencia" \? estilos\.alertaInconsistencia : estilos\.alertaTecnica/.test(pagina) && hex(regla(css, ".alertaInconsistencia"), "border-color") === "#c8372d");

  // ── 4. Hover/foco, accesibilidad y responsive ─────────────────────────────────────────────────────────────────────────────────────────────────────
  cierto("PRO334-17 hover y foco de teclado (focus-within) siguen visibles sobre FE y NCE con un tono más intenso del MISMO color",
    esAzul(hex(regla(css, "tr.filaFE:hover > td,\ntr.filaFE:focus-within > td"), "background")) && esAmarillo(hex(regla(css, "tr.filaNCE:hover > td,\ntr.filaNCE:focus-within > td"), "background")) &&
    luminancia(hex(regla(css, "tr.filaFE:hover > td,\ntr.filaFE:focus-within > td"), "background")) < luminancia(fe) &&
    luminancia(hex(regla(css, "tr.filaNCE:hover > td,\ntr.filaNCE:focus-within > td"), "background")) < luminancia(nce));
  const fondosFila = [fe, nce, hex(regla(css, "tr.filaFE:hover > td,\ntr.filaFE:focus-within > td"), "background"), hex(regla(css, "tr.filaNCE:hover > td,\ntr.filaNCE:focus-within > td"), "background")];

  cierto("PRO334-18 contraste AA (≥ 4.5): etiquetas FE/NCE sobre su fondo y texto principal de la lista (.cell strong #234560) sobre todos los fondos de fila, incluso en hover/foco",
    contraste(hex(regla(css, ".filaFE .tipoFE"), "color"), hex(regla(css, ".filaFE .tipoFE"), "background")) >= 4.5 &&
    contraste(hex(regla(css, ".filaNCE .tipoNCE"), "color"), hex(regla(css, ".filaNCE .tipoNCE"), "background")) >= 4.5 &&
    fondosFila.every((f) => f !== "" && contraste("#234560", f) >= 4.5));
  cierto("PRO334-18b el texto secundario gris existente (.cell span #6f8498, 3.87:1 sobre blanco) no pierde más de 0.5 de contraste sobre los fondos de tipo",
    fondosFila.every((f) => contraste("#6f8498", "#ffffff") - contraste("#6f8498", f) <= 0.5));
  cierto("PRO334-19 alto contraste del sistema: el acento pasa a borde real (sólido FE, discontinuo NCE)", /@media \(forced-colors: active\)[\s\S]*border-left: 4px solid CanvasText[\s\S]*border-left: 4px dashed CanvasText/.test(css));
  cierto("PRO334-20 sin desborde: el acento es box-shadow inset (no suma ancho) y la tabla conserva tableScroll y minWidth 860",
    /inset 4px 0 0/.test(regla(css, "tr.filaFE > td:first-child")) && !/width|padding|margin/.test(regla(css, "tr.filaFE > td:first-child")) &&
    /<div className=\{ui\.tableScroll\}>\s*<table className=\{ui\.table\} style=\{\{ minWidth: 860 \}\}>/.test(pagina));
  cierto("PRO334-21 sin CSS global: lista.module.css no conoce filaFE/filaNCE", !/fila(FE|NCE)|detalle(FE|NCE)/.test(leer("components/ui/lista-padrao/lista.module.css")));

  // ── 5. Funcionalidades preservadas ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  cierto("PRO334-22 KuDE sigue en la fila por kudeDisponible (FE/NCE aun rechazadas o sin CDC), con su aria-label por tipo",
    /\{kudeDisponible\(d\) \? \(/.test(pagina) && /aria-label=\{`Ver KuDE \(PDF\) de \$\{d\.tipo === "NCE" \? "la nota de crédito" : "la factura"\}/.test(pagina));
  cierto("PRO334-23 expansión, historial, JSON, consulta manual y automática y orden numérico (PRO-333) siguen presentes",
    /aria-expanded=\{Boolean\(det\)\}/.test(pagina) && /reconsultar\(d\)/.test(pagina) && /iniciarRefresco/.test(pagina) && /verRespuesta\(d, i\)/.test(pagina) &&
    /<ThOrdenable titulo="Documento" campo="numero" orden=\{orden\} onOrden=\{cambiarOrden\} \/>/.test(pagina));
  cierto("PRO334-24 sin cambios de datos: la API y el SQL de documentos no mencionan colores por tipo", !/filaFE|filaNCE|azul|amarillo/i.test(leer("app/api/documentos/route.ts")));

  return fallos;
}
