/**
 * PRO-365 / NEXIT-DOC-UX-COMPETENCIA-R01 — Documentos electrónicos: cuatro indicadores INDEPENDIENTES visibles por fila (Envío | XML/CDC | SIFEN | Correo), sin texto grande de
 * estado, acciones separadas de los estados, Eventos compacto y leyenda única sobre la tabla.
 * Casos sobre funciones PURAS reales (presentacion-sifen.ts, documentos-tabla.ts) y sobre la estructura del texto fuente de page.tsx / page.module.css (React y navegador NO se renderizan).
 * ESCRITOS, NO EJECUTADOS (orden PRO-365: sin tests, lint, typecheck, build, CI manual, SQL ni navegador). La paridad visual con las capturas de la competencia NO se afirma: las capturas no
 * fueron recibidas; la comprobación visual real queda para la homologación.
 * Sin cambios de estados, contadores, APIs, SQL, migraciones, gateway, CDC, KuDE, stock ni permisos.
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
  cierto("PRO365-A01b la celda Estado de la FILA pinta los cuatro iconos (fases.map de iconosEstado), cada uno enfocable con su texto completo",
    /const fases = iconosEstado\(d\);/.test(pagina) && /\{fases\.map\(\(i\) => \(\s*<IconoFase key=\{i\.eje\} eje=\{i\.eje\} simbolo=\{i\.simbolo\} clase=\{CLASE_TONO_ICONO\[i\.tono\]\} texto=\{textoFase\(i, fiscal\)\} tip=\{eventosTip\} \/>/.test(celdaEstado) &&
    /role="img"\s+tabIndex=\{0\}\s+aria-label=\{texto\}/.test(pagina) && /role="group" aria-label=\{`Estados de \$\{doc\}`\}/.test(celdaEstado));
  cierto("PRO365-A01c los indicadores NO quedan ocultos en el Historial técnico: la fila los muestra y la segunda capa los repite con nombre",
    /fases\.map/.test(fila) && /iconosEstado\(d\)\.map\(\(i\) => \(/.test(segunda) && /<strong>\{NOMBRE_EJE\[i\.eje\]\}:<\/strong> \{i\.corto\}/.test(segunda));

  // ══ A02 «Rechazado» fiel, sin texto enorme y sin alterar estados ═══════════════════════════════════════════════════════════════════════
  {
    const rechazado = iconosEstado(doc({ estadoSifen: "RECHAZADO", cdc: "CDC-API-OPACO" }));

    igual("PRO365-A02a RECHAZADO persistido = icono SIFEN cruz roja; Envío ✓ y CDC informado coexisten (ejes independientes, la firma no es aprobación)",
      rechazado.map((i) => [i.eje, i.simbolo, i.tono]), [["envio", "check", "ok"], ["xml", "archivoCheck", "info"], ["sifen", "cruz", "error"], ["correo", "correo", "neutro"]]);
    cierto("PRO365-A02b la fila ya no pinta un texto grande de estado (sin estadoPrincipalFila, {estado.texto} ni <strong> en la celda Estado)",
      !/estadoPrincipalFila|\{estado\.texto\}|SIMBOLO_ESTADO|CLASE_ESTADO/.test(pagina) && !/<strong>/.test(celdaEstado));
    cierto("PRO365-A02c el motivo del rechazo se añade al tooltip del icono SIFEN SOLO si el rechazo y su mensaje están registrados (detalleFiscalPrimario), sin reclasificar",
      /i\.eje === "sifen" && fiscal\.rechazo && fiscal\.mensaje \? `\$\{i\.texto\} Motivo registrado: \$\{fiscal\.mensaje\}\.` : i\.texto/.test(pagina) && /const fiscal = detalleFiscalPrimario\(d\);/.test(pagina));
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
    /\{eventos\.registrado \?\? "Sin información"\}/.test(celdaEventos) && !/eventos\.operaciones|No disponible|\{o\.nombre\}/.test(celdaEventos) && /motivo=\{eventos\.operacion\}/.test(celdaEventos));
  igual("PRO365-A04b «Sin información» ≠ «sin eventos»: sin registro, eventosFila no inventa una situación registrada",
    eventosFila({ estadoSifen: "PENDIENTE" }).registrado, null);
  cierto("PRO365-A04c la segunda capa conserva el texto honesto completo de eventos (sinRegistro + operación)",
    /Eventos: \{eventos\.registrado \?\? eventos\.sinRegistro\}\. \{eventos\.operacion\}/.test(segunda));

  // ══ A05 Leyenda única ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  cierto("PRO365-A05 leyenda ÚNICA sobre la tabla con el orden de los cuatro estados y los símbolos (check/reloj/cruz/guion + aviso), referida por aria-describedby",
    (pagina.match(/className=\{estilos\.leyendaEstados\}/g) ?? []).length === 1 && pagina.indexOf("id=\"leyenda-estados\"") < pagina.indexOf("aria-describedby=\"leyenda-estados\"") &&
    /<strong>Envío<\/strong>[\s\S]*?<strong>XML\/CDC<\/strong>[\s\S]*?<strong>SIFEN<\/strong>[\s\S]*?<strong>Correo<\/strong>/.test(pagina) && !/leyenda/.test(fila));

  // ══ A06 CSS: sin clases huérfanas y áreas táctiles ══════════════════════════════════════════════════════════════════════════════════════
  cierto("PRO365-A06a retiradas las clases del estado principal y de las operaciones por fila; añadidas iconoVacio/leyendaEstados/leyendaSimbolos/leyendaSimbolo usadas por la página",
    !/\.(estadoPrincipal|estadoAprobado|estadoRechazado|estadoPendiente|estadoSinInfo|estadoAnulado|estadoSecundario|eventosTexto|eventoOperacion)\b/.test(cssLimpio) &&
    ["iconoVacio", "leyendaEstados", "leyendaSimbolos", "leyendaSimbolo"].every((c) => new RegExp(`\\.${c} \\{`).test(cssLimpio) && pagina.includes(`estilos.${c}`)));
  cierto("PRO365-A06b la celda Estado no rompe línea y el hueco del aviso reserva 36px (alineación entre filas)",
    /white-space: nowrap;/.test(regla(css, ".estado")) && /width: 36px;\s*height: 36px;/.test(regla(css, ".iconoVacio")));

  // ══ A07 Alcance ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  cierto("PRO365-A07 sin rutas nuevas, sin filtros/KPIs/acciones masivas inventados: las rutas de la pantalla son las mismas de UX-R02",
    (() => {
      const rutas = [...new Set([...pagina.matchAll(/`(\/api\/[^`]*)`/g)].map((m) => m[1].replace(/\$\{[^}]*\}/g, ":x")))].sort();

      return JSON.stringify(rutas) === JSON.stringify(["/api/documentos/:x", "/api/documentos/:x/consultar", "/api/documentos/:x/enviar", "/api/documentos/:x/intentos/:x/respuesta", "/api/documentos/:x/intentos?cursor=:x", "/api/documentos/:x/solicitud?version=:x", "/api/documentos?:x"].sort());
    })());

  return fallos;
}
