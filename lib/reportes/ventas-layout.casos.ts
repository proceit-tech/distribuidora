/**
 * PRO-337 — Informe de Ventas: tarjetas «Documentos no computados» y «Anomalías fiscales» sin columnas recortadas.
 * Casos ESTRUCTURALES sobre el marcado (page.tsx) y las reglas CSS (page.module.css): seis columnas intactas, wrapper de scroll
 * horizontal LOCAL accesible por tabla, sin overflow:hidden/ellipsis, grilla por container query con más ancho para la tabla,
 * apilado a ancho completo, altura natural y títulos compactos. El aspecto real (CA-01..CA-03 en 1920/1366/768/360 px y zoom)
 * NO se puede ejecutar aquí: la revisión en navegador corresponde a una autorización posterior.
 * Suite fuente aislada: no está registrada en scripts/casos-clientes/run.js (fuera del alcance autorizado de PRO-337).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");
const sinCom = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
/** Cuerpos (concatenados) de todas las reglas CSS cuyo último selector es exactamente `selector` (fuera o dentro de @container). */
const regla = (css: string, selector: string) =>
  [...css.matchAll(new RegExp(`(^|[}\\s,])${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "gm"))].map((m) => m[2]).join("\n");
/** Bloques @container con su condición y contenido (un nivel de anidación). */
const containers = (css: string) => [...css.matchAll(/@container\s+([^{]+)\{((?:[^{}]*\{[^}]*\})*)\s*\}/g)].map((m) => ({ cond: m[1].trim(), cuerpo: m[2] }));

export async function verificarCasosVentasLayout(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  const tsx = sinCom(leer("app/(private)/reportes/ventas/page.tsx"));
  const css = sinCom(leer("app/(private)/reportes/ventas/page.module.css"));
  const ini = tsx.indexOf("propios.informativo}");
  const fin = tsx.indexOf("styles.contentCard", ini);
  const bloque = ini >= 0 && fin > ini ? tsx.slice(ini, fin) : "";
  const tarjetas = bloque.split("propios.tarjetaInformativa").slice(1);
  const [docs = "", anom = ""] = tarjetas;
  const encabezados = (t: string) => [...t.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map((m) => m[1]);

  // ── Datos y columnas intactos (CA-04, CA-06, CA-08) ───────────────────────────────────────────
  cierto("PRO337-01 el bloque informativo existe y contiene exactamente dos tarjetas", bloque.length > 0 && tarjetas.length === 2);
  igual("PRO337-02 seis columnas exactas y en orden en «Documentos no computados»", encabezados(docs), ["Tipo", "Estado fiscal", "Moneda", "Documentos", "Enviados sin aprobación", "Importe informativo"]);
  igual("PRO337-03 cinco columnas exactas y en orden en «Anomalías fiscales»", encabezados(anom), ["Motivo", "Tipo", "Moneda", "Documentos", "Importe"]);
  cierto("PRO337-04 el importe informativo sigue usando fmtImporteMoneda(e.total, e.moneda) (PRO-335 intacta)", docs.includes("fmtImporteMoneda(e.total, e.moneda)"));
  cierto("PRO337-05 el importe de anomalías sigue usando fmtImporteMoneda(a.total, a.moneda)", anom.includes("fmtImporteMoneda(a.total, a.moneda)"));
  cierto("PRO337-06 conteos con fmtNum(e.documentos) y fmtNum(e.enviados) sin cambios", docs.includes("fmtNum(e.documentos)") && docs.includes("fmtNum(e.enviados)"));
  cierto("PRO337-07 las filas siguen recorriendo actual.estados y actual.anomalias completos (sin slice/filter)", /actual\.estados\.map\(/.test(docs) && /actual\.anomalias\.map\(/.test(anom) && !/actual\.(estados|anomalias)\.(slice|filter)\(/.test(bloque));
  cierto("PRO337-08 tabla semántica: thead/tbody y th con scope=col en ambas tablas", [docs, anom].every((t) => t.includes("<thead>") && t.includes("<tbody>") && (t.match(/<th scope="col"/g) ?? []).length === encabezados(t).length));

  // ── Títulos compactos y explicación completa (CA-07) ─────────────────────────────────────────
  cierto("PRO337-09 título «Documentos no computados» con h2 y subtítulo que explica que no altera los netos", /<h2[^>]*>Documentos no computados<\/h2>/.test(docs) && /<p>[^<]*no computan por estado fiscal[^<]*No alteran los netos\.<\/p>/.test(docs));
  cierto("PRO337-10 título «Anomalías fiscales» con subtítulo sobre aprobados sin información fiscal conciliable excluidos", /<h2[^>]*>Anomalías fiscales<\/h2>/.test(anom) && /<p>Aprobados sin información fiscal conciliable: excluidos de los indicadores[^<]*<\/p>/.test(anom));
  cierto("PRO337-11 los títulos largos anteriores ya no se muestran", !bloque.includes("No computan por estado fiscal<") && !bloque.includes("Anomalías: aprobados sin información fiscal conciliable"));
  cierto("PRO337-12 cada sección queda etiquetada por su título (aria-labelledby → id del h2)", [["ventas-no-computados-titulo", docs], ["ventas-anomalias-titulo", anom]].every(([id, t]) => t.includes(`aria-labelledby="${id}"`) && t.includes(`<h2 id="${id}"`)));
  const h2 = regla(css, ".tarjetaInformativa h2");
  cierto("PRO337-13 título discreto ~13px y subtítulo subordinado de 12px, sin truncado", /font-size:\s*13px/.test(h2) && /font-size:\s*12px/.test(regla(css, ".tarjetaInformativa header p")) && !/ellipsis|nowrap/.test(h2));

  // ── Scroll horizontal LOCAL y accesible (CA-03, CA-06) ───────────────────────────────────────
  const wrappers = (t: string) => [...t.matchAll(/<div className=\{propios\.tablaScroll\}([^>]*)>\s*<table className=\{propios\.tablaChica\}>/g)].map((m) => m[1]);
  cierto("PRO337-14 cada tabla está dentro de su propio wrapper tablaScroll", wrappers(docs).length === 1 && wrappers(anom).length === 1 && (bloque.match(/<table /g) ?? []).length === 2);
  cierto("PRO337-15 los wrappers son enfocables con teclado y tienen región con etiqueta accesible", [...wrappers(docs), ...wrappers(anom)].every((a) => a.includes("tabIndex={0}") && a.includes('role="region"') && /aria-label="[^"]+"/.test(a)));
  const scroll = regla(css, ".tablaScroll");
  cierto("PRO337-16 tablaScroll: overflow-x:auto y max-width:100%, sin altura máxima ni scroll vertical propio", /overflow-x:\s*auto/.test(scroll) && /max-width:\s*100%/.test(scroll) && !/max-height|overflow-y:\s*(auto|scroll)|overflow:\s*(auto|scroll)/.test(scroll));
  cierto("PRO337-17 el foco del wrapper es visible", /outline:\s*2px/.test(regla(css, ".tablaScroll:focus-visible")));

  // ── Ningún recorte (CA-01, CA-04) ────────────────────────────────────────────────────────────
  cierto("PRO337-18 la hoja del informe ya no tiene overflow:hidden ni text-overflow", !/overflow\s*:\s*hidden|text-overflow/.test(css));
  cierto("PRO337-19 las celdas (cifras) no se dividen: td con white-space:nowrap", /white-space:\s*nowrap/.test(regla(css, ".tablaChica td")));
  cierto("PRO337-20 los encabezados largos pueden pasar a dos líneas (th white-space:normal)", /white-space:\s*normal/.test(regla(css, ".tablaChica th")));
  cierto("PRO337-21 el motivo largo de anomalías se ajusta con clase propia y sin estilo inline", anom.includes("className={propios.motivo}") && !bloque.includes("whiteSpace") && /white-space:\s*normal/.test(regla(css, ".tablaChica td.motivo")));
  cierto("PRO337-22 la regla 50/50 auto-fit minmax(420px, 1fr) desapareció", !/auto-fit,\s*minmax\(420px/.test(css));

  // ── Grilla responsiva por ancho real y altura natural (CA-01, CA-02, CA-05) ───────────────────
  const contenedor = regla(css, ".informativo");
  const grilla = regla(css, ".informativoGrilla");
  cierto("PRO337-23 .informativo es contenedor de consulta (inline-size) con min-width:0", /container-type:\s*inline-size/.test(contenedor) && /container-name:\s*informativo/.test(contenedor) && /min-width:\s*0/.test(contenedor));
  cierto("PRO337-24 por defecto una sola columna a ancho completo con minmax(0, 1fr) (apilado)", /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/.test(grilla));
  cierto("PRO337-25 altura natural: align-items:start (anomalías vacías no se estiran)", /align-items:\s*start/.test(grilla));
  const cq = containers(css);
  const anchoMin = (c: string) => Number(/min-width:\s*(\d+)px/.exec(c)?.[1] ?? NaN);
  const dosCol = cq.find((c) => !c.cuerpo.includes("conAnomalias") && /2\.2fr/.test(c.cuerpo));
  cierto("PRO337-26 sin anomalías y ≥1120px de contenedor: tabla 2.2fr frente a 1fr, ambas con minmax(0, …)", !!dosCol && dosCol.cond.startsWith("informativo") && anchoMin(dosCol.cond) === 1120 && /minmax\(0,\s*2\.2fr\)\s+minmax\(0,\s*1fr\)/.test(dosCol.cuerpo));
  cierto("PRO337-27 a 1120px la tarjeta de la tabla (≈(1120−10)·2.2/3.2 ≈ 763px) cabe las seis columnas estimadas (~740px)", ((1120 - 10) * 2.2) / 3.2 >= 740);
  const apilaAnom = cq.find((c) => c.cuerpo.includes(".informativoGrilla.conAnomalias") && /max-width/.test(c.cond));
  const ladoAnom = cq.find((c) => c.cuerpo.includes(".informativoGrilla.conAnomalias") && !/max-width/.test(c.cond));
  cierto("PRO337-28 con anomalías entre 1120 y 1460px las tarjetas se apilan (una columna)", !!apilaAnom && /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/.test(apilaAnom.cuerpo));
  cierto("PRO337-29 con anomalías desde 1460px: tabla más ancha (1.3fr) que anomalías (1fr)", !!ladoAnom && anchoMin(ladoAnom.cond) === 1460 && /minmax\(0,\s*1\.3fr\)\s+minmax\(0,\s*1fr\)/.test(ladoAnom.cuerpo));
  cierto("PRO337-30 a 1460px ambas tablas caben (~808px ≥ 740px seis columnas; ~622px ≥ ~615px cinco columnas)", ((1460 - 10) * 1.3) / 2.3 >= 740 && (1460 - 10) / 2.3 >= 615);
  cierto("PRO337-31 la clase conAnomalias solo se aplica cuando hay anomalías", /actual\.anomalias\.length > 0 \? propios\.conAnomalias : ""/.test(bloque));
  cierto("PRO337-32 la tarjeta tiene min-width:0 y conserva borde y radio de los cards NEXIT", ["min-width:\\s*0", "border-radius:\\s*12px", "border:\\s*1px solid #dce6ed"].every((r) => new RegExp(r).test(regla(css, ".tarjetaInformativa"))));
  cierto("PRO337-33 no se usa una media query de viewport para esta grilla (responde al contenedor)", !/@media[^{]*\{[^@]*informativo/.test(css));

  // ── Estados vacíos y funciones (CA-05, CA-08) ────────────────────────────────────────────────
  cierto("PRO337-34 estados vacíos con mensaje completo en ambas tarjetas", docs.includes("Ningún documento fuera de APROBADO en el período.") && anom.includes("Sin anomalías en el período."));
  cierto("PRO337-35 el enlace «Ver los documentos con anomalía» sigue filtrando por situacion ANOMALIA", anom.includes('cambiar({ vista: "DOCUMENTOS", estado: "", situacion: "ANOMALIA" })'));
  cierto("PRO337-36 la hoja global de reportes no recibe clases de PRO-337", !/tablaScroll|tarjetaInformativa|informativoGrilla/.test(leer("components/ui/lista-padrao/reporte.module.css")));

  return fallos;
}
