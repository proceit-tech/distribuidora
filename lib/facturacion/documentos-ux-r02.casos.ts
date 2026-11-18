/**
 * PRO-342-UX-R02 — Correctivo focal de la auditoría AUD-CHATGPT-PRO-342-UX-R01-2026-11-17 (UX-F001 y UX-F002) sobre 4156d1b20abaa505fdb14a3bf26175d1ae163466.
 *  · UX-F001: respuestas tardías del GET inicial del detalle, de consultas y de envíos; lecturas del listado fuera de orden; feedback de copia.
 *  · UX-F002: iconos de estado, aviso opcional y botones de acción sin superposición en pantallas estrechas (320/360/768, zoom).
 * Casos sobre funciones PURAS reales (documentos-ux.ts), escenarios simulados con esas funciones, geometría calculada con los valores REALES del CSS local y
 * estructura del texto fuente de page.tsx / page.module.css (React y navegador NO se renderizan aquí).
 * ESCRITOS, NO EJECUTADOS (orden PRO-342-UX-R02: sin tests, lint, typecheck, build, SQL ni navegador). La comprobación visual real queda para la homologación.
 * Sin cambios de motor fiscal, validación de CDC, APIs, SQL, migrations, inventario, permisos ni otros módulos; el resto de UX-R01 se conserva.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { accionDisponible, esListadoMasReciente, esResultadoVigente, unirIntentos } from "@/lib/facturacion/documentos-ux";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");
const sinComentariosCss = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "");

/** Cuerpo de la PRIMERA regla cuyo selector completo coincide exactamente (sin comentarios). */
function regla(css: string, selector: string): string {
  const m = new RegExp(`(?:^|[}{])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(sinComentariosCss(css));

  return m ? m[1] : "";
}
const px = (bloque: string, prop: string) => Number(new RegExp(`(?:^|[;\\s])${prop}:\\s*(\\d+(?:\\.\\d+)?)px`).exec(bloque)?.[1] ?? NaN);

export async function verificarCasosDocumentosUxR02(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, condicion: boolean) => igual(nombre, condicion, true);

  const pagina = leer("app/(private)/documentos/page.tsx");
  const css = leer("app/(private)/documentos/page.module.css");
  const cssLimpio = sinComentariosCss(css);
  const tramo = (desde: string, hasta: string) => pagina.slice(pagina.indexOf(desde), pagina.indexOf(hasta, pagina.indexOf(desde) + desde.length));
  const detalle = tramo("PRIMERA CAPA", "</Fragment>");
  const primera = detalle.slice(0, detalle.indexOf("SEGUNDA CAPA"));
  const reconsultar = tramo("async function reconsultar", "async function enviarAlGateway");
  const enviar = tramo("async function enviarAlGateway", "const setPagina");
  const catchDe = (f: string) => f.slice(f.indexOf("} catch (e) {"), f.indexOf("} finally {"));
  const intento = (id: string, cursor: string) => ({ id, cursor });

  // ══ UX-F001 (a) Lecturas del listado fuera de orden ═════════════════════════════════════════════════════════════════════════════════════
  igual("UXR02-01 esListadoMasReciente: sin listado → se aplica; una lectura lanzada después → se aplica; la misma o una anterior → se descarta",
    [esListadoMasReciente(null, 1), esListadoMasReciente(3, 4), esListadoMasReciente(4, 4), esListadoMasReciente(4, 3)], [true, true, false, false]);
  {
    // Escenario: carga inicial (sec 1) lenta, refresco automático (sec 2) rápido. Llega 2, luego 1: el listado mostrado queda en 2.
    let mostrada: number | null = null;
    const llega = (s: number) => { if (esListadoMasReciente(mostrada, s)) mostrada = s; };

    llega(2);
    llega(1);
    igual("UXR02-02 escenario: una carga inicial lenta que llega DESPUÉS de un refresco más nuevo no sustituye los datos actualizados", mostrada, 2);
  }
  cierto("UXR02-03 toda lectura del listado (carga/relectura y refresco automático) recibe su secuencia AL LANZARSE y solo se aplica si es más reciente que la mostrada",
    (pagina.match(/secuenciaListado\.current \+= 1;\s*const secuencia = secuenciaListado\.current;/g) ?? []).length === 2 &&
    (pagina.match(/setResultado\(\(r\) => \(esListadoMasReciente\(r\?\.secuencia \?\? null, secuencia\) \? \{ clave: claveConsulta, contexto, secuencia, datos, error(: "")? \} : r\)\)/g) ?? []).length === 2 &&
    !/setResultado\(\{/.test(pagina));
  cierto("UXR02-04 se mantienen las protecciones de UX-R01: cancelación al cambiar de consulta (activo=false), filas de otro contexto ocultas y detalles/tooltip cerrados al cambiar filtros",
    (pagina.match(/activo = false;/g) ?? []).length === 2 && /const obsoleto = resultado !== null && resultado\.contexto !== contexto;/.test(pagina) && /if \(contextoVisto !== contexto\) \{\s*setContextoVisto\(contexto\);\s*setAbiertos\(\{\}\);\s*setTip\(null\);/.test(pagina));

  // ══ UX-F001 (b) GET inicial del detalle vs. consulta/envío ══════════════════════════════════════════════════════════════════════════════
  igual("UXR02-05 accionDisponible: con el GET inicial del detalle sin resolver NO hay acción (consultar/enviar/corregir), aunque no haya nada en curso",
    accionDisponible({ cargandoDetalle: true, enCurso: false, esperaListado: undefined, secuenciaListado: 5 }), false);
  igual("UXR02-06 accionDisponible: detalle cargado, sin acción previa ni en curso → disponible; con acción en curso → no (doble clic)",
    [accionDisponible({ cargandoDetalle: false, enCurso: false, esperaListado: undefined, secuenciaListado: 5 }), accionDisponible({ cargandoDetalle: false, enCurso: true, esperaListado: undefined, secuenciaListado: 5 })], [true, false]);
  // PRO-195-UX-R01: la consulta SIFEN pasó a la FILA y funciona con el detalle cerrado (no hay snapshot que pueda pisar intentos nuevos; al reabrir, el GET se fusiona con unirIntentos).
  // Con el detalle ABIERTO y su GET inicial sin resolver, sigue sin haber acción.
  cierto("UXR02-07 (actualizado PRO-195) la apertura del detalle parte de cargando=true y las acciones consultan `cargando === true` (detalle cargando = no disponible; fila cerrada = disponible)",
    /setAbiertos\(\(a\) => \(\{ \.\.\.a, \[d\.id\]: \{ \.\.\.DETALLE_VACIO, cargando: true \} \}\)\);/.test(pagina) && /cargandoDetalle: abiertos\[d\.id\]\?\.cargando === true/.test(pagina) && /fusion \? unirIntentos\(previos, j\.intentos\)/.test(pagina));
  igual("UXR02-08 unirIntentos: fusión NO regresiva sin duplicados (gana la versión nueva) y orden por cursor DESC",
    unirIntentos([intento("c", "3"), { id: "b", cursor: "2", nuevo: true }], [{ id: "b", cursor: "2", nuevo: false }, intento("a", "1")]),
    [intento("c", "3"), { id: "b", cursor: "2", nuevo: true }, intento("a", "1")]);
  {
    // Escenario AUD: abrir detalle (GET lento, snapshot [a]); POST rápido fusiona [c, a]; luego llega el GET con [a]. El historial NO pierde «c».
    const trasPost = unirIntentos([intento("c", "3")], []);
    const trasGetTardio = trasPost.length > 0 ? unirIntentos(trasPost, [intento("a", "1")]) : [intento("a", "1")];

    igual("UXR02-09 escenario: GET inicial lento que llega después de una consulta rápida no reemplaza los intentos nuevos (se fusiona)", trasGetTardio.map((i) => i.id), ["c", "a"]);
  }
  cierto("UXR02-10 el GET inicial aplica con fusión no regresiva si ya hay intentos fusionados en la misma generación (sin borrar ni retroceder el cursor), y reemplaza solo si no los hay",
    /const fusion = previos\.length > 0;/.test(pagina) && /intentos: fusion \? unirIntentos\(previos, j\.intentos\) : j\.intentos/.test(pagina) && /siguienteIntentos: fusion \? \(a\[d\.id\]\.siguienteIntentos \?\? j\.siguienteIntentos \?\? null\)/.test(pagina) &&
    /if \(vigente\(\)\) \{\s*setAbiertos/.test(tramo("async function alternar", "// E01 (PRO-314)")) && /const unidos = unirIntentos\(nuevos, hueco \? \[\] : previos\);/.test(pagina));

  // ══ UX-F001 (c) Estado desactualizado después de una consulta/envío ══════════════════════════════════════════════════════════════════════
  {
    // Escenario: listado mostrado sec 7; termina una acción (espera = 7: última lectura lanzada). Relectura posterior lanzada = sec 8.
    const tras = (sec: number) => accionDisponible({ cargandoDetalle: false, enCurso: false, esperaListado: 7, secuenciaListado: sec });

    igual("UXR02-11 escenario: tras terminar una consulta/envío, las acciones siguen deshabilitadas con el listado anterior (sec 7) y se habilitan con uno lanzado DESPUÉS (sec 8)", [tras(7), tras(8)], [false, true]);
  }
  cierto("UXR02-12 al terminar (éxito o error, en finally) se registra la espera con la última lectura LANZADA antes de liberar «en curso»: no hay instante con estado viejo habilitado",
    /function terminarAccion\(d: Documento\) \{[\s\S]*?const espera = secuenciaListado\.current;\s*setEsperaListado\(\(e\) => \(\{ \.\.\.e, \[d\.id\]: espera \}\)\);\s*accionEnCurso\.current\.delete\(d\.id\);/.test(pagina) &&
    (pagina.match(/finally \{\s*terminarAccion\(d\);/g) ?? []).length === 2);
  cierto("UXR02-13 (actualizado PRO-195) los cuatro controles que actúan sobre el estado (Consultar en la fila, Enviar, Reenviar con confirmación, Corregir NCE) dependen de la MISMA disponibilidad; «Corregir» no es un enlace activo mientras no lo está",
    (primera.match(/disabled=\{!habilitada\}/g) ?? []).length === 2 && /accionesFila\(kudeDisponible\(d\), \{ editar \}, habilitada, motivoEspera\)/.test(pagina) && /habilitada \? \(\s*<Link className=\{ui\.primaryButton\} href=\{`\/notas-credito\?corregir=\$\{d\.id\}`\}>Corregir y emitir nueva<\/Link>\s*\) : \(\s*<button type="button" className=\{ui\.primaryButton\} disabled>Corregir y emitir nueva<\/button>/.test(primera) &&
    !/disabled=\{Boolean\(accion\)\}/.test(pagina) && /const habilitada = disponible\(d\);/.test(pagina));
  cierto("UXR02-14 además del atributo disabled, la función también se niega (clic tardío o repetido con un render anterior): iniciarAccion exige disponible(d) y no estar en curso",
    /if \(accionEnCurso\.current\.has\(d\.id\) \|\| !disponible\(d\)\) return null;/.test(pagina) && /const generacion = iniciarAccion\(d, "consulta"\);\s*if \(generacion === null\) return;/.test(reconsultar) && /const generacion = iniciarAccion\(d, "envio"\);\s*if \(generacion === null\) return;/.test(enviar));
  cierto("UXR02-15 tras éxito se relee el listado (solo GET); tras error NO se relee ni se reenvía automáticamente: el error se muestra y la espera ofrece «Actualizar» explícito",
    /setRecarga\(\(n\) => n \+ 1\);\s*\} catch/.test(reconsultar) && /setRecarga\(\(n\) => n \+ 1\);\s*\} catch/.test(enviar) && !/setRecarga|fetch|enviarAlGateway|reconsultar\(/.test(catchDe(reconsultar)) && !/setRecarga|fetch|enviarAlGateway|reconsultar\(/.test(catchDe(enviar)) &&
    /const actualizarListado = \(\) => setRecarga\(\(n\) => n \+ 1\);/.test(pagina) && /onClick=\{actualizarListado\}>Actualizar<\/button>/.test(primera));
  cierto("UXR02-16 mientras espera, la primera capa lo dice (role=status): «Actualizando el estado del documento…» si la relectura está en curso; si no, «Estado del documento sin actualizar…» + Actualizar; no bloquea el resto de la pantalla",
    /const esperando = !accion && esperaListado\[d\.id\] !== undefined && \(resultado\?\.secuencia \?\? 0\) <= esperaListado\[d\.id\];/.test(pagina) && /\{esperando \? \(\s*<p className=\{estilos\.esperaEstado\} role="status">/.test(primera) &&
    /Actualizando el estado del documento…/.test(primera) && /Estado del documento sin actualizar tras la última acción\./.test(primera) && /\.esperaEstado \{/.test(cssLimpio));
  cierto("UXR02-17 la espera sobrevive al cierre/reapertura del detalle y al cambio de filtros (estado por documento, no del detalle), y cualquier listado posterior la resuelve (relectura, refresco o error de carga)",
    /const \[esperaListado, setEsperaListado\] = useState<Record<string, number>>\(\{\}\);/.test(pagina) && !/setEsperaListado\(\{\}\)/.test(pagina) && /secuenciaListado: resultado\?\.secuencia \?\? 0/.test(pagina));
  cierto("UXR02-18 las respuestas de consulta/envío siguen aplicándose SOLO a la misma generación abierta (cerrar/reabrir las descarta) y nunca recrean un detalle cerrado",
    /if \(vigenteDetalle\(d, generacion\)\) fusionarIntentos/.test(reconsultar) && /if \(vigenteDetalle\(d, generacion\)\) aplicarDetalle/.test(reconsultar) && /if \(vigenteDetalle\(d, generacion\)\) fusionarIntentos/.test(enviar) &&
    /function aplicarDetalle\(id: string, parte: Partial<Detalle>\) \{\s*setAbiertos\(\(a\) => \(a\[id\] \?/.test(pagina) && /if \(!a\[id\]\) return a;/.test(tramo("function fusionarIntentos", "async function cargarAnteriores")));
  cierto("UXR02-19 (actualizado PRO-195) permisos sin cambios: consultar solo con EDITAR (acción de la fila); enviar/reenviar/corregir solo con CREAR y las mismas condiciones de estado; el reenvío conserva la confirmación",
    /accionesFila\(kudeDisponible\(d\), \{ editar \}/.test(pagina) && /clave: "consulta", visible: permisos\.editar, disponible: permisos\.editar && consultaDisponible/.test(leer("lib/facturacion/documentos-tabla.ts")) && /crear && \(d\.estadoLocal === "PENDIENTE_ENVIO" \|\| \(d\.estadoLocal === "ERROR_ENVIO" && d\.envioErrorTipo !== "RECHAZO"\)\)/.test(primera) &&
    /crear && d\.tipo !== "NCE" && d\.estadoLocal === "ERROR_ENVIO" && d\.envioErrorTipo === "RECHAZO"/.test(primera) && /crear && d\.tipo === "NCE" && d\.corregible/.test(primera) && /if \(confirmarRechazo && !window\.confirm\(/.test(enviar));

  // ══ UX-F001 (d) Feedback de copia ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  {
    // Escenario: copia en la apertura 1 (marca 1), el usuario cierra y reabre (generación 2) antes de que resuelva el portapapeles.
    const vigenteCopia = (marca: number, marcaActual: number, gen: number, genActual: number) => marca === marcaActual && esResultadoVigente(true, gen, genActual);

    igual("UXR02-20 escenario: el portapapeles que resuelve tras cerrar/reabrir, o superado por otra copia, no muestra ni borra «Copiado»; la última copia de la apertura actual sí",
      [vigenteCopia(1, 1, 1, 2), vigenteCopia(1, 2, 2, 2), vigenteCopia(2, 2, 2, 2)], [false, false, true]);
  }
  cierto("UXR02-21 copiar comprueba marca Y generación al resolver, al rechazar y al borrar el aviso; la copia literal no se bloquea ni se transforma",
    /const generacion = historialVigente\.current\[d\.id\] \?\? 0;\s*const vigente = \(\) => copiaVigente\.current\[d\.id\] === marca && vigenteDetalle\(d, generacion\);/.test(pagina) &&
    /await navigator\.clipboard\.writeText\(valor\);\s*if \(vigente\(\)\) aplicarDetalle\(d\.id, \{ copiado: campo \}\);/.test(pagina) && /\} catch \{\s*if \(vigente\(\)\) aplicarDetalle\(d\.id, \{ copiado: "error" \}\);/.test(pagina) &&
    /window\.setTimeout\(\(\) => \{\s*if \(vigente\(\)\) aplicarDetalle\(d\.id, \{ copiado: "" \}\);\s*\}, 2000\);/.test(pagina) && !/copiar\([^)]*\)[^\n]*disabled/.test(primera));

  // ══ UX-F002 Responsive sin superposición (actualizado PRO-195: tarjeta de diez celdas) ═════════════════════════════════════════════════
  {
    const accion = px(regla(css, ".accion"), "width");
    const gapAcciones = px(regla(css, ".accionesLinea"), "gap");
    const control = 40; // columna izquierda de la tarjeta (expandir / seleccionar): grid-template-columns: 40px …
    const relleno = 10; // padding lateral de cada celda de la tarjeta (4px 10px)
    const acciones = 4 * accion + 3 * gapAcciones; // KuDE · XML · Consulta · Correo (con permiso; sin él, menos)
    const eventosMin = 32; // el control de eventos (32px); el texto «Sin eventos» puede pasar a la línea siguiente (flex-wrap)
    const umbral = Number(/@container documentos \(min-width: (\d+)px\)/.exec(cssLimpio)?.[1] ?? NaN);
    const contenedor = (vista: number) => vista - 24 - 2; // padding exterior del listado compartido + borde (valores de la auditoría UX-R01)
    const enFila = (ancho: number) => ancho >= umbral;
    const cabe = (ancho: number) => (enFila(ancho) ? control + acciones + eventosMin + 4 * relleno <= ancho : control + Math.max(acciones, eventosMin) + 2 * relleno <= ancho);

    igual("UXR02-22 (actualizado PRO-195) geometría con los valores REALES del CSS: acciones de 32px y separación 6px → 4 acciones = 146px", [accion, gapAcciones, acciones], [32, 6, 146]);
    igual("UXR02-23 (actualizado PRO-195) umbral del contenedor (440px) ≥ mínimo para juntar acciones y eventos sin solaparse (40 + 146 + 32 + 4 × 10 = 258px)", [umbral, control + acciones + eventosMin + 4 * relleno, umbral >= control + acciones + eventosMin + 4 * relleno], [440, 258, true]);
    igual("UXR02-24 (actualizado PRO-195) 320px / 360px (contenedor 294 / 334): estado, acciones y eventos en filas SEPARADAS y caben (206px ≤ ancho)",
      [contenedor(320), enFila(contenedor(320)), cabe(contenedor(320)), contenedor(360), enFila(contenedor(360)), cabe(contenedor(360))], [294, false, true, 334, false, true]);
    igual("UXR02-25 (actualizado PRO-195) tarjeta con contenedor de 600px (p. ej. 1280px al 200 % de zoom, o 720px con barra lateral): agrupada, sin solape", [enFila(600), cabe(600)], [true, true]);
    igual("UXR02-26 (actualizado PRO-195) hasta un contenedor extremo de 240px (zoom 400 %) entran las acciones; si faltara ancho, la red de seguridad pasa acciones/eventos/estado a la línea siguiente sin encogerlos",
      [cabe(240), /table\.tablaDocs \.accionesLinea,\s*table\.tablaDocs \.eventos,\s*table\.tablaDocs \.estado \{\s*flex-wrap: wrap;/.test(cssLimpio)], [true, true]);
  }
  cierto("UXR02-27 (actualizado PRO-195) por defecto (≤ 720px) la tarjeta pone estado, acciones y eventos en filas propias; @container (≥ 440px de ancho REAL del contenedor) los agrupa",
    /grid-template-areas:\s*"exp doc doc"\s*"sel estado estado"\s*"\. razon monto"\s*"\. ruc fecha"\s*"\. acciones acciones"\s*"\. eventos eventos";/.test(cssLimpio) &&
    /@container documentos \(min-width: 440px\) \{\s*table\.tablaDocs > tbody > tr:has\(> td:nth-child\(10\)\) \{\s*grid-template-areas:\s*"exp doc estado"\s*"sel razon monto"\s*"\. ruc fecha"\s*"\. acciones eventos";/.test(cssLimpio) &&
    cssLimpio.indexOf("@container documentos") > cssLimpio.indexOf("@media (max-width: 720px)"));
  cierto("UXR02-28 el contenedor medido es el de la tabla de documentos (container: documentos / inline-size), no la página ni el CSS compartido",
    /container: documentos \/ inline-size;/.test(regla(css, ".contenedorTabla")) && /<div className=\{clases\(ui\.tableScroll, estilos\.contenedorTabla\)\}>\s*<table className=\{clases\(ui\.table, estilos\.tablaDocs\)\}/.test(pagina) &&
    !/contenedorTabla|@container/.test(leer("components/ui/lista-padrao/lista.module.css")));
  cierto("UXR02-29 (actualizado PRO-195) cada celda tiene su área propia (sin solaparse) y el acento FE/NCE queda en la columna de control de la tarjeta",
    ["exp", "sel", "acciones", "doc", "fecha", "ruc", "razon", "monto", "estado", "eventos"].every((a, i) => new RegExp(`tr:has\\(> td:nth-child\\(10\\)\\) > td:nth-child\\(${i + 1}\\) \\{\\s*grid-area: ${a};`).test(cssLimpio)) &&
    /table\.tablaDocs tr\.filaFE > td:nth-child\(2\) \{\s*box-shadow: inset 3px 0 0 #6d9bd1;/.test(cssLimpio) && /table\.tablaDocs tr\.filaNCE > td:nth-child\(2\) \{\s*box-shadow: inset 3px 0 0 #d9bb4e;/.test(cssLimpio));
  cierto("UXR02-30 (actualizado PRO-195) accesibilidad y escritorio: estado principal con símbolo enfocable + texto, aviso «!» solo si existe, acciones 32px, tabla de 1180px con scroll local en escritorio",
    /<IconoFase eje="estado"/.test(pagina) && /<strong>\{estado\.texto\}<\/strong>/.test(pagina) && !/iconoVacio/.test(pagina) &&
    /min-width: 1180px/.test(regla(css, "table.tablaDocs")) && /width: 24px;\s*height: 24px;/.test(regla(css, ".iconoCirculo")) && /width: 32px;\s*height: 32px;/.test(regla(css, ".accion")));

  // ══ Alcance ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  cierto("UXR02-31 sin rutas nuevas ni cambios de API: la pantalla sigue llamando exactamente a las mismas rutas", (() => {
    const rutas = [...new Set([...pagina.matchAll(/`(\/api\/[^`]*)`/g)].map((m) => m[1].replace(/\$\{[^}]*\}/g, ":x")))].sort();

    return JSON.stringify(rutas) === JSON.stringify(["/api/documentos/:x", "/api/documentos/:x/consultar", "/api/documentos/:x/enviar", "/api/documentos/:x/intentos/:x/respuesta", "/api/documentos/:x/intentos?cursor=:x", "/api/documentos/:x/solicitud?version=:x", "/api/documentos?:x"].sort());
  })());
  cierto("UXR02-32 sin validación fiscal del CDC en la pantalla ni en las ayudas (el CDC sigue siendo dato opaco mostrado y copiado tal cual)",
    !/\\d\{44\}|\{44\}|modulo|módulo|cdcCoherente|cdcValido/.test(pagina) && !/cdc/i.test(leer("lib/facturacion/documentos-ux.ts").replace(/\/\*[\s\S]*?\*\//g, "")));

  return fallos;
}
