/**
 * PRO-195-UX-R01 — Documentos electrónicos como central operacional compacta (orden ORD-CLAUDE-NEXIT-PRO-195-UX-R01-DOCUMENTOS-2026-11-18).
 * Casos de aceptación R01-01..R01-14 sobre funciones PURAS reales (documentos-tabla.ts, presentacion-sifen.ts, monto-visual.ts, documentos-ux.ts) y sobre la estructura del
 * texto fuente de page.tsx / page.module.css (React y navegador NO se renderizan aquí).
 * ESCRITOS, NO EJECUTADOS (orden PRO-195-UX-R01: sin tests, lint, typecheck, build, CI manual, SQL ni navegador). La comprobación visual (1366/1920, móvil, teclado, lector
 * de pantalla) y la del ambiente real quedan PENDIENTES para la homologación del responsable.
 * Casos existentes reaproveitados (no se repiten aquí): UXR02-01..21 (respuestas tardías, secuencia del listado, disponibilidad, copia por generación), UXR01-13..20 (tooltip),
 * UXR01-27..35 (primera/segunda capa), PRO334-* (colores por tipo y contraste AA), KUDE-* y PRO342-R04-F4 (KuDE NO_VERIFICADO), PRO333-* (orden numérico), PRO335-H08 (monto).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import {
  accionesFila,
  alternarSeleccion,
  estadoPrincipalFila,
  eventosFila,
  MOTIVO_CORREO_NO_DISPONIBLE,
  MOTIVO_EVENTOS_NO_DISPONIBLES,
  MOTIVO_XML_NO_DISPONIBLE,
  partirFechaHora,
  seleccionVigente,
} from "@/lib/facturacion/documentos-tabla";
import { accionDisponible, claveContexto } from "@/lib/facturacion/documentos-ux";
import { ESTADOS_LOCAL, ESTADOS_SIFEN, type EstadoLocal, type EstadoSifen } from "@/lib/facturacion/estados";
import { kudeDisponible } from "@/lib/facturacion/kude-visor";
import { iconosEstado } from "@/lib/facturacion/presentacion-sifen";
import { formatearImporteMoneda } from "@/lib/formato/monto-visual";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");
const sinComentariosCss = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "");

/** Cuerpo de la PRIMERA regla cuyo selector completo coincide exactamente (sin comentarios). */
function regla(css: string, selector: string): string {
  const m = new RegExp(`(?:^|[}{])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(sinComentariosCss(css));

  return m ? m[1] : "";
}

export async function verificarCasosDocumentosPro195R01(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, condicion: boolean) => igual(nombre, condicion, true);

  const pagina = leer("app/(private)/documentos/page.tsx");
  const css = leer("app/(private)/documentos/page.module.css");
  const cssLimpio = sinComentariosCss(css);
  const tabla = leer("lib/facturacion/documentos-tabla.ts");
  const tramo = (desde: string, hasta: string) => pagina.slice(pagina.indexOf(desde), pagina.indexOf(hasta, pagina.indexOf(desde) + desde.length));
  const cabecera = tramo("<thead>", "</thead>");
  const fila = tramo("<tr className={clases(ui.row, CLASE_FILA_TIPO[d.tipo], marcado && estilos.filaMarcada)} data-tipo={d.tipo}>", "{det ? (\n                      <tr");
  const detalle = tramo("PRIMERA CAPA", "</Fragment>");
  const primera = detalle.slice(0, detalle.indexOf("SEGUNDA CAPA"));
  const segunda = detalle.slice(detalle.indexOf("SEGUNDA CAPA"));
  const doc = (p: Partial<{ estadoLocal: EstadoLocal; estadoSifen: EstadoSifen; estadoGatewayTexto: string | null; envioErrorTipo: string | null; cdc: string | null }>) => ({
    estadoLocal: "ENVIADO" as EstadoLocal, estadoSifen: "PENDIENTE" as EstadoSifen, estadoGatewayTexto: null, ultimaConsultaAt: null, envioErrorTipo: null, estadoEmail: "NO_INFORMADO" as const, cdc: null, ultimaConsultaResultado: null, ...p,
  });

  // ══ R01-01 Columnas y orden; FE/NCE, serie, fecha/hora, RUC y razón social separados ═══════════════════════════════════════════════════
  {
    const titulos = [...cabecera.matchAll(/titulo="([^"]+)"/g)].map((m) => m[1]);

    igual("R01-01a cabecera: expansión | selección | Acciones | Nro. Documento | Fecha emisión | RUC/CI | Razón Social | Monto | Estado | Eventos (diez columnas, en este orden)",
      [(cabecera.match(/<th className=\{estilos\.colControl\}>/g) ?? []).length, cabecera.indexOf("<span className={estilos.srSolo}>Detalle</span>") < cabecera.indexOf("type=\"checkbox\""), titulos],
      [2, true, ["Acciones", "Nro. Documento", "Fecha emisión", "RUC/CI", "Razón Social", "Monto", "Estado", "Eventos"]]);
    cierto("R01-01b la fila tiene sus diez celdas en el mismo orden (expandir, casilla, acciones, documento, fecha, RUC/CI, razón social, monto, estado, eventos) y el detalle ocupa las 10",
      (fila.match(/\n {22}<td/g) ?? []).length === 10 && fila.indexOf("alternar(d)") < fila.indexOf("aria-label={`Seleccionar ${doc}`}") && fila.indexOf("aria-label={`Seleccionar ${doc}`}") < fila.indexOf("aria-label={`Acciones de ${doc}`}") &&
        fila.indexOf("aria-label={`Acciones de ${doc}`}") < fila.indexOf("{d.establecimiento}-{d.puntoExpedicion}-{d.numero}") && fila.indexOf("{fecha}") < fila.indexOf("d.receptorDocumento ?? \"Sin información\"") &&
        fila.indexOf("d.receptorDocumento") < fila.indexOf("{d.receptorNombre}") && fila.indexOf("{d.receptorNombre}") < fila.indexOf("formatearImporteMoneda(d.total, d.moneda)") && fila.indexOf("formatearImporteMoneda(d.total, d.moneda)") < fila.indexOf("{estado.texto}") &&
        fila.indexOf("{estado.texto}") < fila.indexOf("eventos.registrado"));
    cierto("R01-01c documento: número EEE-PPP-NNNNNNN, tipo FE/NCE visible (código + nombre completo accesible), serie fiscal («Serie X» / «Sin serie»), sucursal y factura original de la NCE",
      /\{d\.establecimiento\}-\{d\.puntoExpedicion\}-\{d\.numero\}/.test(fila) && />\{d\.tipo\}<\/span>/.test(fila) && /\{ETIQUETA_TIPO\[d\.tipo\]\}/.test(fila) && /d\.serie \? `Serie \$\{d\.serie\}` : "Sin serie"/.test(fila) && /\{d\.sucursalNombre\}/.test(fila) && /Factura \{d\.feNumero\}/.test(fila));
    igual("R01-01d fecha y hora por separado, sin reconvertir zona (texto ya formateado en hora de Paraguay)", [partirFechaHora("18/11/2026 09:10:27"), partirFechaHora("—")], [{ fecha: "18/11/2026", hora: "09:10:27" }, { fecha: "—", hora: "" }]);
    cierto("R01-01e RUC/CI y razón social en celdas propias (no mezcladas); RUC/CI ausente = «Sin información»; razón social con corte de línea, sin truncar",
      /<td className=\{clases\(ui\.mono, estilos\.sinCorte\)\}>\{d\.receptorDocumento \?\? "Sin información"\}<\/td>/.test(fila) && /<td className=\{estilos\.razon\}>\{d\.receptorNombre\}<\/td>/.test(fila) && /overflow-wrap: anywhere/.test(regla(css, ".razon")));
    cierto("R01-01f solo tipos habilitados: el filtro de tipo sigue en TIPOS_DOCUMENTO y la fila no inventa tipos (etiqueta neutra tipoOtro para tipos sin color propio)",
      /TIPOS_DOCUMENTO\.map/.test(pagina) && /CLASE_ETIQUETA_TIPO\[d\.tipo\] \?\? estilos\.tipoOtro/.test(fila));
  }

  // ══ R01-02 Montos grandes PYG/USD sin pérdida (texto NUMERIC, sin Number) ══════════════════════════════════════════════════════════════
  igual("R01-02a montos grandes desde el texto exacto: PYG 0 decimales y USD 2, sin notación científica ni pérdida de dígitos",
    [formatearImporteMoneda("999999999999999999.4", "PYG"), formatearImporteMoneda("1234567890123.456", "USD"), formatearImporteMoneda("1420909.09090908", "PYG"), formatearImporteMoneda("0.005", "USD")],
    ["999.999.999.999.999.999", "1.234.567.890.123,46", "1.420.909", "0,01"]);
  cierto("R01-02b la celda Monto muestra la moneda del documento y el importe con formatearImporteMoneda(d.total, d.moneda); el título conserva el importe con moneda; nunca Number(d.total)",
    /<span className=\{estilos\.moneda\}>\{d\.moneda\}<\/span> <strong className=\{ui\.mono\}>\{formatearImporteMoneda\(d\.total, d\.moneda\)\}<\/strong>/.test(fila) && /title=\{importe\(d\)\}/.test(fila) && !/Number\(d\.total\)|parseFloat|toLocaleString/.test(pagina));

  // ══ R01-03 Aprobado / Rechazado exclusivos, aun con Envío OK + CDC ═════════════════════════════════════════════════════════════════════
  {
    const textos = ESTADOS_LOCAL.flatMap((l) => ESTADOS_SIFEN.map((s) => estadoPrincipalFila(doc({ estadoLocal: l, estadoSifen: s, cdc: "CDC-OPACO" }))));

    cierto("R01-03a para TODA combinación envío × estado SIFEN hay UN estado principal; nunca aparece «Aprobado» y «Rechazado» a la vez (ni en texto ni en la línea secundaria)",
      textos.every((e) => !(/Aprobado/.test(`${e.texto} ${e.secundario ?? ""}`) && /Rechazado/.test(`${e.texto} ${e.secundario ?? ""}`))));
    igual("R01-03b Aprobado/Rechazado SOLO desde el estado fiscal persistido; Envío OK + CDC informado con SIFEN pendiente sigue «Pendiente de confirmación»",
      [estadoPrincipalFila(doc({ estadoSifen: "APROBADO", cdc: "X" })).texto, estadoPrincipalFila(doc({ estadoSifen: "RECHAZADO", cdc: "X" })).texto, estadoPrincipalFila(doc({ estadoSifen: "PENDIENTE", cdc: "X" })).texto,
        estadoPrincipalFila(doc({ estadoSifen: "APROBADO" })).secundario],
      ["Aprobado", "Rechazado", "Pendiente de confirmación", null]);
    igual("R01-03c los ejes técnicos coexisten SOLO en la segunda capa (Enviado ✓ · CDC informado · SIFEN ✕) y la fila sigue con un único estado",
      [iconosEstado(doc({ estadoSifen: "RECHAZADO", cdc: "X" })).map((i) => i.tono), estadoPrincipalFila(doc({ estadoSifen: "RECHAZADO", cdc: "X" })).tono], [["ok", "info", "error", "neutro"], "rechazado"]);
    cierto("R01-03d la fila NO pinta los cuatro iconos (iconosEstado solo en la segunda capa) y la celda Estado usa estadoPrincipalFila",
      !/iconosEstado\(d\)/.test(fila) && /iconosEstado\(d\)/.test(segunda) && /const estado = estadoPrincipalFila\(d\);/.test(pagina) && /<strong>\{estado\.texto\}<\/strong>/.test(fila));
  }

  // ══ R01-04 XML firmado / pendiente / sin información, sin aprobación falsa ═════════════════════════════════════════════════════════════
  igual("R01-04 «XML firmado» y pendientes: principal «Pendiente de confirmación» con la fase real como secundaria; no transmitido «Aún sin transmitir»/«Sin información»",
    [estadoPrincipalFila(doc({ estadoGatewayTexto: "XML firmado" })), estadoPrincipalFila(doc({ estadoSifen: "SIN_CONSULTA" })), estadoPrincipalFila(doc({ estadoLocal: "ENVIO_INDETERMINADO", estadoSifen: "NO_RECONOCIDO" })),
      estadoPrincipalFila(doc({ estadoLocal: "PENDIENTE_ENVIO", estadoSifen: "SIN_CONSULTA" })), estadoPrincipalFila(doc({ estadoLocal: "ENVIANDO", estadoSifen: "SIN_CONSULTA" }))].map((e) => [e.tono, e.texto, e.secundario]),
    [["pendiente", "Pendiente de confirmación", "XML firmado (sin decisión SIFEN)"], ["pendiente", "Pendiente de confirmación", "Enviado"], ["pendiente", "Pendiente de confirmación", "Envío indeterminado"],
      ["sinTransmitir", "Aún sin transmitir", "Pendiente de envío"], ["sinTransmitir", "Sin información", "Enviando"]]);

  // ══ R01-05 Error de transporte / validación del gateway no es rechazo fiscal ══════════════════════════════════════════════════════════
  igual("R01-05a error de envío (transporte o validación del gateway) = «Aún sin transmitir» + «no es rechazo SIFEN»; nunca tono «rechazado»",
    [estadoPrincipalFila(doc({ estadoLocal: "ERROR_ENVIO", estadoSifen: "SIN_CONSULTA" })), estadoPrincipalFila(doc({ estadoLocal: "ERROR_ENVIO", estadoSifen: "SIN_CONSULTA", envioErrorTipo: "RECHAZO" }))].map((e) => [e.tono, e.texto, e.secundario]),
    [["sinTransmitir", "Aún sin transmitir", "Error de envío (no es rechazo SIFEN)"], ["sinTransmitir", "Aún sin transmitir", "Error de envío: validación del gateway (no es rechazo SIFEN)"]]);
  cierto("R01-05b el aviso técnico real de la última consulta se conserva como «!» separado del estado principal (no lo reemplaza)",
    /const alerta = alertaConsulta\(d\);/.test(pagina) && /\{avisoFila \? \(\s*<IconoFase eje="aviso" simbolo="alerta"/.test(fila) && fila.indexOf("{estado.texto}") < fila.indexOf("eje=\"aviso\""));

  // ══ R01-06 Eventos: estado registrado vs. operación no disponible ══════════════════════════════════════════════════════════════════════
  igual("R01-06a Eventos: Cancelado/Inutilizado solo como estado fiscal YA informado por la API; sin él «Sin eventos»; la operación siempre no disponible con su motivo",
    [eventosFila({ estadoSifen: "CANCELADO" }).registrado, eventosFila({ estadoSifen: "INUTILIZADO" }).registrado, eventosFila({ estadoSifen: "APROBADO" }).registrado, eventosFila({ estadoSifen: "RECHAZADO" }).operacion === MOTIVO_EVENTOS_NO_DISPONIBLES],
    ["Cancelado (estado fiscal informado por la API)", "Inutilizado (estado fiscal informado por la API)", null, true]);
  cierto("R01-06b el control de eventos está DESHABILITADO (disponible=false) y su clic no hace nada; no hay rutas de cancelación/inutilización ni stock en la pantalla",
    /<AccionIcono clase=\{estilos\.accionEventos\} glifo=\{ACCION\.eventos\} etiqueta=\{`Eventos de \$\{doc\}`\} disponible=\{false\} motivo=\{eventos\.operacion\} alActivar=\{\(\) => undefined\}/.test(fila) &&
    !/\/api\/[^`"]*(cancel|inutiliz|evento)/i.test(pagina) && !/stock|inventario/i.test(tabla.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/MOTIVO_EVENTOS_NO_DISPONIBLES =[\s\S]*?;/, "")));
  cierto("R01-06c el motivo dice la verdad: sin API ni contrato del proveedor, sin simular eventos ni tocar stock; Inutilización no exige factura (no se pide un documento ficticio)",
    /sin API ni contrato comprobado del proveedor/.test(MOTIVO_EVENTOS_NO_DISPONIBLES) && /No se simula ningún evento ni se modifica el stock/.test(MOTIVO_EVENTOS_NO_DISPONIBLES) && !/factura/i.test(MOTIVO_EVENTOS_NO_DISPONIBLES));

  // ══ R01-07 Acciones, ACL y deshabilitación honesta ═══════════════════════════════════════════════════════════════════════════════════════
  {
    const a = (k: boolean, e: boolean, c: boolean) => accionesFila(k, { editar: e }, c, "Consulta en curso.").map((x) => [x.clave, x.visible, x.disponible]);

    igual("R01-07a orden fijo KuDE · XML · Consulta SIFEN · Correo; KuDE solo FE/NCE; consulta visible solo con EDITAR y disponible solo si no hay acción en curso; XML y correo deshabilitados",
      [a(true, true, true), a(false, false, true), a(true, true, false)],
      [[["kude", true, true], ["xml", true, false], ["consulta", true, true], ["correo", true, false]], [["kude", false, false], ["xml", true, false], ["consulta", false, false], ["correo", true, false]],
        [["kude", true, true], ["xml", true, false], ["consulta", true, false], ["correo", true, false]]]);
    igual("R01-07b motivos honestos: XML y correo sin endpoint; consulta no disponible con el motivo de espera; kudeDisponible sin cambios (FE/NCE)",
      [accionesFila(true, { editar: true }, true, "").map((x) => x.motivo), accionesFila(true, { editar: true }, false, "Consulta en curso.")[2].motivo, [kudeDisponible({ tipo: "FE" }), kudeDisponible({ tipo: "NCE" }), kudeDisponible({ tipo: "NDE" })]],
      [["", MOTIVO_XML_NO_DISPONIBLE, "", MOTIVO_CORREO_NO_DISPONIBLE], "Consulta en curso.", [true, true, false]]);
    cierto("R01-07c acción deshabilitada = aria-disabled (enfocable, motivo en el nombre accesible y en el tooltip) y su clic no ejecuta nada",
      /const texto = disponible \? etiqueta : `\$\{etiqueta\}\. \$\{motivo\}`;/.test(pagina) && /aria-label=\{texto\}\s*aria-disabled=\{!disponible\}/.test(pagina) && /if \(disponible\) alActivar\(\);\s*else tip\.mostrar\(e\.currentTarget, texto\);/.test(pagina) && /\.accion\[aria-disabled="true"\] \{[^}]*cursor: not-allowed;/.test(cssLimpio));
    cierto("R01-07d iconos de CONTORNO sin fondo relleno, color por función: KuDE rojo, XML azul, consulta azul neutro, correo ámbar",
      /background: transparent;/.test(regla(css, ".accion")) && /fill: none;/.test(regla(css, ".expandir svg,\n.accion svg")) &&
      [[".accionKude", "#b42318"], [".accionXml", "#1d5799"], [".accionConsulta", "#24506f"], [".accionCorreo", "#8a5a00"]].every(([s, c]) => new RegExp(`color: ${c};`).test(regla(css, s))));
    cierto("R01-07e ACL/tenant: sin rutas nuevas (las mismas de antes; la API sigue aplicando empresa/sucursal/permisos); las demás acciones legítimas (enviar, reenviar con confirmación, corregir NCE) siguen en «Más acciones» del detalle con sus guardas",
      (() => {
        const rutas = [...new Set([...pagina.matchAll(/`(\/api\/[^`]*)`/g)].map((m) => m[1].replace(/\$\{[^}]*\}/g, ":x")))].sort();

        return JSON.stringify(rutas) === JSON.stringify(["/api/documentos/:x", "/api/documentos/:x/consultar", "/api/documentos/:x/enviar", "/api/documentos/:x/intentos/:x/respuesta", "/api/documentos/:x/intentos?cursor=:x", "/api/documentos/:x/solicitud?version=:x", "/api/documentos?:x"].sort());
      })() && /aria-label=\{`Más acciones de \$\{doc\}`\}/.test(primera) && /crear && \(d\.estadoLocal === "PENDIENTE_ENVIO"/.test(primera) && /enviarAlGateway\(d, true\)/.test(primera) && /if \(confirmarRechazo && !window\.confirm\(/.test(pagina) && /Corregir y emitir nueva/.test(primera));
    cierto("R01-07f sin operaciones en lote: la selección no dispara ninguna llamada (no hay fetch ni acción que use la selección)",
      !/seleccionados\.(map|forEach)\([^)]*fetch|fetch\([^)]*seleccion/.test(pagina) && /Sin acciones masivas disponibles en esta versión/.test(pagina));
  }

  // ══ R01-08 Detalle: cuatro campos, copia e historial recogido ═══════════════════════════════════════════════════════════════════════════
  cierto("R01-08a primera capa: exactamente Nro lote, CDC, Fecha firma y Mensaje/código, con «Sin información» si falta; sin consulta externa al expandir",
    (primera.match(/<dt /g) ?? []).length === 4 && (primera.match(/"Sin información"/g) ?? []).length === 4 && !/reconsultar|fetch/.test(primera));
  cierto("R01-08b copiar lote y CDC exactos con feedback accesible (aria-live) y error visible; segunda capa CERRADA por defecto con los cuatro estados técnicos, eventos e historial",
    /aria-label="Copiar número de lote"/.test(primera) && /aria-label="Copiar CDC"/.test(primera) && /aria-live="polite"/.test(primera) && /tecnico: false, copiado: "" \};/.test(pagina) && /\{det\.tecnico \? \(/.test(segunda) &&
    /Estados técnicos/.test(segunda) && /Eventos: \{eventos\.registrado \?\? "sin eventos registrados"\}/.test(segunda) && /Historial de envíos y consultas/.test(segunda));
  cierto("R01-08c el expandir está en su propia columna, con aria-expanded/aria-controls al detalle (id detalle-…) y nombre accesible por documento",
    /aria-expanded=\{Boolean\(det\)\} aria-controls=\{det \? `detalle-\$\{d\.id\}` : undefined\}/.test(fila) && /<tr id=\{`detalle-\$\{d\.id\}`\}/.test(pagina) && /aria-label=\{`\$\{det \? "Ocultar" : "Ver"\} detalle de \$\{doc\}`\}/.test(fila));

  // ══ R01-09 Latencia A→B, cambio de filtro/página/empresa, selección limpia, respuestas tardías ═════════════════════════════════════════
  {
    const c1 = claveContexto("[\"filtro A\"]", 1);
    const c2 = claveContexto("[\"filtro B\"]", 1);
    const s1 = alternarSeleccion(alternarSeleccion({ contexto: "", ids: [] }, c1, "a", true), c1, "b", true);

    igual("R01-09a selección: vale solo en su contexto y para filas visibles; otro filtro/página ⇒ vacía; marcar en otro contexto descarta la anterior",
      [seleccionVigente(s1, c1, ["a", "b", "c"]), seleccionVigente(s1, c1, ["b"]), seleccionVigente(s1, c2, ["a", "b"]), alternarSeleccion(s1, c2, "z", true), alternarSeleccion(s1, c1, "a", false).ids],
      [["a", "b"], ["b"], [], { contexto: c2, ids: ["z"] }, ["b"]]);
    cierto("R01-09b al cambiar de contexto (filtros, página u otra lectura) se cierran detalles y tooltip y se limpian selección y aviso de la fila",
      /if \(contextoVisto !== contexto\) \{\s*setContextoVisto\(contexto\);\s*setAbiertos\(\{\}\);\s*setTip\(null\);[^}]*setSeleccion\(\{ contexto, ids: \[\] \}\);\s*setAnuncio\(null\);\s*\}/.test(pagina) &&
      /const seleccionados = seleccionVigente\(seleccion, contexto, filas\.map\(\(f\) => f\.id\)\);/.test(pagina));
    cierto("R01-09c la consulta desde la fila conserva las guardas UX-R02: una por documento, listado vigente tras la acción, respuesta solo en su generación; con el detalle cerrado el resultado se anuncia SOLO si sigue el mismo contexto",
      /if \(accionEnCurso\.current\.has\(d\.id\) \|\| !disponible\(d\)\) return null;/.test(pagina) && /cargandoDetalle: abiertos\[d\.id\]\?\.cargando === true/.test(pagina) &&
      /if \(!abiertosRef\.current\[d\.id\]\) setAnuncio\(\(a\) => \(contextoAccion === contextoVistoRef\.current \?/.test(pagina) && /anuncio && anuncio\.contexto === contexto \?/.test(pagina) &&
      [accionDisponible({ cargandoDetalle: false, enCurso: false, esperaListado: 7, secuenciaListado: 7 }), accionDisponible({ cargandoDetalle: false, enCurso: false, esperaListado: 7, secuenciaListado: 8 })].join() === "false,true");
    cierto("R01-09d las referencias de las respuestas asíncronas se sincronizan DESPUÉS del render (useEffect), no se escriben durante el render",
      /useEffect\(\(\) => \{\s*abiertosRef\.current = abiertos;\s*\}, \[abiertos\]\);/.test(pagina) && /useEffect\(\(\) => \{\s*contextoVistoRef\.current = contextoVisto;\s*\}, \[contextoVisto\]\);/.test(pagina));
  }

  // ══ R01-10 Escritorio 1366/1920 y móvil, teclado, tooltip y foco (estructura; render PENDIENTE) ═══════════════════════════════════════
  cierto("R01-10a escritorio: tabla blanca de 1180px con scroll horizontal LOCAL (cabe en 1366 con barra lateral solo con scroll; en 1920 sin scroll); separadores discretos; sin pintar la fila entera",
    /min-width: 1180px/.test(regla(css, "table.tablaDocs")) && /background: #ffffff;/.test(regla(css, "tr.filaFE > td,\ntr.filaNCE > td")) && /border-bottom-color: #edf1f5;/.test(regla(css, "table.tablaDocs > tbody > tr > td")) &&
    /<div className=\{clases\(ui\.tableScroll, estilos\.contenedorTabla\)\}>/.test(pagina));
  cierto("R01-10b móvil (≤ 720px): tarjeta de diez áreas sin ocultar identidad, estado, monto ni acciones; filas separadas por defecto y agrupadas solo con contenedor ≥ 440px",
    /tr:has\(> td:nth-child\(10\)\) \{\s*display: grid;/.test(cssLimpio) && ["doc", "estado", "monto", "acciones", "eventos", "razon", "ruc", "fecha"].every((a) => new RegExp(`grid-area: ${a};`).test(cssLimpio)) && /@container documentos \(min-width: 440px\)/.test(cssLimpio));
  cierto("R01-10c teclado y foco: casillas, expandir y acciones enfocables con foco visible; tooltip en hover/foco/toque para acciones y estado (mismo tooltip fijo de UX-R01)",
    /\.casilla:focus-visible \{/.test(cssLimpio) && /\.expandir:focus-visible,\s*\.accion:focus-visible \{/.test(cssLimpio) && /onFocus=\{\(e\) => tip\.mostrar\(e\.currentTarget, texto\)\}/.test(tramo("function AccionIcono", "const CLASE_ESTADO")) && /\.tooltip \{\s*position: fixed;/.test(cssLimpio));
  cierto("R01-10d «seleccionar todos» con estado indeterminado real y nombre accesible; cada casilla nombra su documento",
    /aria-label="Seleccionar todos los documentos de esta página"/.test(cabecera) && /el\.indeterminate = seleccionados\.length > 0 && seleccionados\.length < filas\.length/.test(cabecera) && /aria-label=\{`Seleccionar \$\{doc\}`\}/.test(fila));

  // ══ R01-11 KuDE NO_VERIFICADO y guardas intactas ════════════════════════════════════════════════════════════════════════════════════════
  cierto("R01-11 KuDE: misma apertura (abrirKude → visor, sin caché nueva) y modal/aviso NO_VERIFICADO intactos; la acción no afirma que el PDF exista ni esté verificado",
    /alActivar=\{\(\) => abrirKude\(d\)\}/.test(fila) && /function abrirKude\(d: Documento\) \{\s*void visor\.abrir\(/.test(pagina) && /AVISO_KUDE_NO_VERIFICADO/.test(leer("app/(private)/documentos/kude-modal.tsx")) &&
    /no confirma por sí que el PDF exista ni que esté verificado/.test(fila) && !/sessionStorage|localStorage|caches\./.test(pagina));

  // ══ R01-12 Regresión FE/NCE, consulta sin reenvío, estados técnicos e historial ═════════════════════════════════════════════════════════
  cierto("R01-12 FE/NCE: colores de tipo y detalle por tipo, CDC de la factura original en la NCE, consulta = POST /consultar (nunca /enviar), estados técnicos y historial completos en la segunda capa",
    /CLASE_FILA_TIPO\[d\.tipo\]/.test(fila) && /CDC de la factura original/.test(segunda) && /fetch\(`\/api\/documentos\/\$\{d\.id\}\/consultar`, \{ method: "POST" \}\)/.test(tramo("async function reconsultar", "async function enviarAlGateway")) &&
    !/\/enviar/.test(tramo("async function reconsultar", "async function enviarAlGateway")) && /Seguimiento fiscal/.test(segunda) && /verRespuesta\(d, i\)/.test(segunda) && /cargarAnteriores\(d\)/.test(segunda));

  // ══ R01-13 Filtros y paginación sin cambio contractual ══════════════════════════════════════════════════════════════════════════════════
  cierto("R01-13 filtros (búsqueda 300 ms, tipo, sucursal, estado SIFEN, fechas), indicadores, orden por las mismas cinco claves (numero/fecha/cliente/total/estado) y paginación de 20 sin cambios",
    ["setBusquedaAplicada(busqueda.trim()), 300", "TIPOS_DOCUMENTO.map", "ESTADOS_SIFEN.map", "<CampoFecha valor={desde}", "INDICADORES.map", "setPagina(paginaMostrada + 1)", "const PAGE_SIZE = 20;"].every((t) => pagina.includes(t)) &&
    ["numero", "fecha", "cliente", "total", "estado"].every((c) => pagina.includes(`campo="${c}" orden={orden} onOrden={cambiarOrden}`)) && /type CampoOrden = "fecha" \| "numero" \| "cliente" \| "total" \| "estado";/.test(pagina));

  // ══ R01-14 Sin KPIs falsos ni estado de ambiente inventado ══════════════════════════════════════════════════════════════════════════════
  cierto("R01-14 los indicadores siguen siendo los del servidor (resumen) y no se muestra ambiente TEST/PRODUCCIÓN (no hay fuente confiable en el listado)",
    /resumen\[i\.grupo\]/.test(pagina) && !/PRODUCCI[OÓ]N|\bTEST\b|ambiente/i.test(pagina.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")) && !/seleccionados\.length[^\n]*resumen/.test(pagina));

  return fallos;
}
