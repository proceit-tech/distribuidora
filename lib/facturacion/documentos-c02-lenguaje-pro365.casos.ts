/**
 * PRO-365-R02-C02 — Lenguaje de usuario final en «Documentos electrónicos» (primera capa) y detalle fiscal por estado.
 * Casos sobre funciones PURAS reales (documentos-copy-operador.ts, presentacion-sifen.ts) y sobre el texto fuente de page.tsx / page.module.css / kude-modal.tsx.
 * ESCRITOS, NO EJECUTADOS (orden PRO-365-R02-C02: sin tests, lint, typecheck, build, CI manual, SQL ni navegador). No es homologación visual.
 * Cubre T01–T10 y C02-11..C02-18 de la orden: APROBADO, RECHAZADO (1109), PENDIENTE, CANCELADO, INUTILIZADO, respuestas contradictorias y estados históricos.
 * PRO-365-R02-C02-C01 (PRO-369): casos C02C01 de F01 (aviso en APROBADO — BLOQUEADO por falta de datos fiables, ver informe). Sus casos F02 (título/aviso del PDF sin verificación) quedan
 * SUSTITUIDOS por PRO-365-R02-C02-C02 (decisión del responsable: se retira la validación por CDC, el título «PDF sin verificación», el aviso y el sufijo): casos C02C02-01..06.
 * PRO-370 / PRO-365-R02-C02-C03 (F03): APROBADO con cancelación acreditada por evento ⇒ eje SIFEN de PRIMERA CAPA «prohibido»/neutro/«Cancelado» (iconosEstadoOperador);
 * el historial técnico conserva la aprobación original (iconosEstado base, check verde). C02-14b/c actualizados; casos C02C03-01..18. La cancelación acreditada es un escenario
 * SINTÉTICO de presentación: hoy contextoCancelacionDocumento() no acredita ninguna (acreditado:false) y CANCELACION_FE_OPERATIVA=false.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import {
  AYUDA_ACCION_NO_DISPONIBLE,
  avisoOperador,
  encabezadoFiscal,
  eventosOperador,
  iconosEstadoOperador,
  MOTIVO_NO_INFORMADO,
  NOTA_MENSAJES_HISTORIAL,
  respuestaFiscal,
  TEXTO_CORREO_OPERADOR,
  TEXTO_ENVIO_OPERADOR,
  textoConsultaOperador,
  textoEnvioOperador,
  textoIconoOperador,
} from "@/lib/facturacion/documentos-copy-operador";
import { type EstadoEmail, type EstadoLocal, type EstadoSifen } from "@/lib/facturacion/estados";
import { alertaConsulta, detalleFiscalPrimario, iconosEstado } from "@/lib/facturacion/presentacion-sifen";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");

type Doc = {
  estadoLocal: EstadoLocal;
  estadoSifen: EstadoSifen;
  estadoEmail: EstadoEmail;
  cdc: string | null;
  ultimaConsultaResultado: string | null;
  envioErrorTipo?: string | null;
  lote: string | null;
  fechaFirma: string | null;
  codRespuesta: string | null;
  mensajeRespuesta: string | null;
  eventosFe?: never;
};

const doc = (p: Partial<Doc> = {}): Doc => ({
  estadoLocal: "ENVIADO",
  estadoSifen: "PENDIENTE",
  estadoEmail: "NO_INFORMADO",
  cdc: null,
  ultimaConsultaResultado: null,
  envioErrorTipo: null,
  lote: "L-1",
  fechaFirma: null,
  codRespuesta: null,
  mensajeRespuesta: null,
  ...p,
});

/** Proyección mínima de eventos (solo los campos que leen las funciones de copy). */
const eventos = (situacion: string, texto: string) => ({ situacion, texto, eventos: [], lectura: null, detalle: "", bloqueaSolicitud: false, aprobacionCandidata: null, avisos: [] }) as never;
const cancelFe = { aplica: true, disponible: false, corto: "No disponible", motivo: "x", vencimientoMs: null };
const cancelNce = { aplica: false, disponible: false, corto: "", motivo: "", vencimientoMs: null };

/** Textos de operador de los cuatro iconos, en orden Envío · XML/CDC · SIFEN · Correo. */
const textos = (d: Doc) => iconosEstado(d).map((i) => textoIconoOperador(i, d).texto);
const JERGA = /gateway|ACK|\bAPI\b|HTTP|NO_RECONOCIDO|ENVIO_INDETERMINADO|SIN_CONSULTA|CDC_DIVERGENTE/;

export async function verificarCasosDocumentosC02LenguajePro365(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, condicion: boolean) => igual(nombre, condicion, true);

  const pagina = leer("app/(private)/documentos/page.tsx");
  const css = leer("app/(private)/documentos/page.module.css");
  const modal = leer("app/(private)/documentos/kude-modal.tsx");
  const visor = leer("lib/facturacion/kude-visor.ts");
  const copy = leer("lib/facturacion/documentos-copy-operador.ts");
  const fila = pagina.slice(pagina.indexOf("<tr className={clases(ui.row, CLASE_FILA_TIPO[d.tipo], marcado && estilos.filaMarcada)} data-tipo={d.tipo}>"), pagina.indexOf("{det ? (\n                      <tr"));
  const detalle = pagina.slice(pagina.indexOf("PRIMERA CAPA"));
  const primera = detalle.slice(0, detalle.indexOf("SEGUNDA CAPA"));
  const segunda = detalle.slice(detalle.indexOf("SEGUNDA CAPA"));

  // ══ T01 Envío confirmado = EXACTAMENTE «Enviado» ════════════════════════════════════════════════════════════════════════════════════════
  {
    const d = doc({ estadoLocal: "ENVIADO" });
    const envio = iconosEstado(d)[0];
    igual("C02-T01a tooltip de Envío ENVIADO = exactamente «Enviado»; nombre accesible «Envío: Enviado»", textoIconoOperador(envio, d), { texto: "Enviado", etiqueta: "Envío: Enviado" });
    cierto("C02-T01b el tooltip ENVIADO no menciona gateway/ACK/API ni aprobación", !/gateway|ACK|API|aprob/i.test(textoIconoOperador(envio, d).texto));
  }

  // ══ T02 Cinco estados de envío con nombre propio; indeterminado/error nunca «Enviado» ═════════════════════════════════════════════════════
  igual("C02-T02a cinco nombres de envío según la matriz de la orden", TEXTO_ENVIO_OPERADOR, {
    ENVIADO: "Enviado",
    ENVIANDO: "Enviando",
    PENDIENTE_ENVIO: "Pendiente de envío",
    ENVIO_INDETERMINADO: "No se pudo confirmar el envío",
    ERROR_ENVIO: "Error al enviar",
  });
  igual("C02-T02b envío indeterminado y error (validación o transporte) nunca se llaman «Enviado»",
    [doc({ estadoLocal: "ENVIO_INDETERMINADO" }), doc({ estadoLocal: "ERROR_ENVIO", estadoSifen: "SIN_CONSULTA", envioErrorTipo: "RECHAZO" }), doc({ estadoLocal: "ERROR_ENVIO", estadoSifen: "SIN_CONSULTA" })].map((d) => textos(d)[0]),
    ["No se pudo confirmar el envío", "Error al enviar", "Error al enviar"]);
  igual("C02-T02c los cuatro nombres de envío distintos de «Enviado» son distintos entre sí", new Set(Object.values(TEXTO_ENVIO_OPERADOR)).size, 5);

  // ══ T03 Cuatro iconos por estado fiscal; 1109 RECHAZADO ═══════════════════════════════════════════════════════════════════════════════════
  {
    const r1109 = doc({ estadoSifen: "RECHAZADO", cdc: "01800000000001001000000122026112410000000001", codRespuesta: "1109", mensajeRespuesta: "Número de documento ha sido inutilizado anteriormente", estadoEmail: "SIN_EMAIL" });
    igual("C02-T03a RECHAZADO 1109: Enviado · Código del documento registrado · Rechazado · Sin correo (el 1109 NO convierte en Inutilizado)", textos(r1109), ["Enviado", "Código del documento registrado", "Rechazado", "Sin correo"]);
    igual("C02-T03b RECHAZADO 1109: encabezado «Rechazado» (rojo) y «Motivo del rechazo» con código y descripción tal como se registraron",
      [encabezadoFiscal(r1109).titulo, encabezadoFiscal(r1109).tono, respuestaFiscal(r1109, detalleFiscalPrimario(r1109))],
      ["Rechazado", "error", { motivo: { etiqueta: "Motivo del rechazo", valor: "1109 · Número de documento ha sido inutilizado anteriormente" }, notaHistorial: null }]);
    igual("C02-T03c XML/CDC: registrado / pendiente / revisar, según el símbolo de iconosEstado (sin reevaluar el CDC)",
      [textos(doc({ cdc: "X" }))[1], textos(doc({ cdc: null }))[1], textos(doc({ cdc: "X", ultimaConsultaResultado: "RESPUESTA_INVALIDA" }))[1]],
      ["Código del documento registrado", "Código del documento pendiente", "Revisar información del documento"]);
    igual("C02-T03d SIFEN: Aprobado / Pendiente de respuesta / Sin resultado confirmado / Cancelado / Inutilizado / Sin información (no transmitido)",
      [doc({ estadoSifen: "APROBADO" }), doc({ estadoSifen: "PENDIENTE" }), doc({ estadoSifen: "NO_RECONOCIDO" }), doc({ estadoSifen: "CANCELADO" }), doc({ estadoSifen: "INUTILIZADO" }), doc({ estadoLocal: "PENDIENTE_ENVIO", estadoSifen: "SIN_CONSULTA" })].map((d) => textos(d)[2]),
      ["Aprobado", "Pendiente de respuesta", "Sin resultado confirmado", "Cancelado", "Inutilizado", "Sin información"]);
  }

  // ══ T04 Correo: cinco estados ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  igual("C02-T04 correo: cinco nombres propios; SIN_EMAIL ≠ NO_INFORMADO", TEXTO_CORREO_OPERADOR, {
    ENVIADO: "Correo enviado",
    PENDIENTE: "Correo pendiente",
    ERROR: "Error al enviar correo",
    SIN_EMAIL: "Sin correo",
    NO_INFORMADO: "Sin información de correo",
  });

  // ══ T05 Sin jerga técnica en la primera capa (tooltips, KPI, acciones, avisos, mensajes) ══════════════════════════════════════════════════
  {
    const combinaciones: Doc[] = [];
    for (const estadoLocal of ["PENDIENTE_ENVIO", "ENVIANDO", "ENVIADO", "ENVIO_INDETERMINADO", "ERROR_ENVIO"] as EstadoLocal[])
      for (const estadoSifen of ["SIN_CONSULTA", "PENDIENTE", "NO_RECONOCIDO", "APROBADO", "RECHAZADO", "CANCELADO", "INUTILIZADO"] as EstadoSifen[])
        for (const estadoEmail of ["ENVIADO", "PENDIENTE", "ERROR", "SIN_EMAIL", "NO_INFORMADO"] as EstadoEmail[]) combinaciones.push(doc({ estadoLocal, estadoSifen, estadoEmail }));
    igual("C02-T05a ningún tooltip ni encabezado de primera capa (175 combinaciones) contiene gateway/ACK/API/HTTP ni nombres de enum",
      combinaciones.filter((d) => [...textos(d), encabezadoFiscal(d).titulo, encabezadoFiscal(d).nota ?? ""].some((t) => JERGA.test(t))).length, 0);
    const ayudas = [...pagina.matchAll(/ayuda: "([^"]*)"/g)].map((m) => m[1]);
    cierto("C02-T05b ayudas de las ocho tarjetas sin «gateway», «proveedor» ni «Según el proveedor»", ayudas.length === 8 && ayudas.every((a) => !/gateway|proveedor|API|ACK/i.test(a)));
    cierto("C02-T05c títulos de KPI de correo en castellano llano: «Correo enviado», «Error de correo», «Sin correo» (sin «e-mail»)",
      /titulo: "Correo enviado"/.test(pagina) && /titulo: "Error de correo"/.test(pagina) && /titulo: "Sin correo"/.test(pagina) && !/titulo: "[^"]*e-mail/i.test(pagina));
    cierto("C02-T05d acciones: KuDE «Consultar KuDE (PDF)», consulta «Consultar estado en SIFEN … (no reenvía)», XML/correo «Descarga/Envío no disponible.», botón «Enviar documento»",
      /etiqueta=\{`Consultar KuDE \(PDF\) de \$\{doc\}`\}/.test(fila) && /`Consultar estado en SIFEN de \$\{doc\} \(no reenvía\)`/.test(fila) && /motivo=\{AYUDA_ACCION_NO_DISPONIBLE\[a\.clave\]\}/.test(fila) &&
      JSON.stringify(AYUDA_ACCION_NO_DISPONIBLE) === JSON.stringify({ xml: "Descarga no disponible.", correo: "Envío no disponible." }) && /"Enviar documento"/.test(pagina) && !/Enviar al gateway/.test(pagina));
    cierto("C02-T05e avisos, eventos y mensajes tras acción sin jerga técnica",
      ![avisoOperador({ tipo: "inconsistencia", texto: "", detalle: "" }, true, "NCE"), avisoOperador({ tipo: "tecnica", texto: "", detalle: "" }, false, "FE"),
        eventosOperador(doc(), cancelFe).operacion, eventosOperador(doc(), cancelNce).operacion,
        textoConsultaOperador("OK"), textoConsultaOperador("NO_ENCONTRADO"), textoConsultaOperador("ERROR_HTTP", "SIN_REFERENCIA"),
        textoEnvioOperador({ resultado: "OK", estadoLocal: "ENVIADO", errores: [], mensaje: null }), textoEnvioOperador({ resultado: "INDETERMINADO", estadoLocal: "ENVIO_INDETERMINADO", errores: [], mensaje: null })].some((t) => JERGA.test(t)));
  }

  // ══ T06 Accesibilidad: nombre accesible con el eje; tooltip breve ═══════════════════════════════════════════════════════════════════════
  igual("C02-T06a etiqueta accesible = «<eje>: <texto>» para los cuatro ejes",
    iconosEstado(doc({ estadoSifen: "APROBADO", cdc: "X", estadoEmail: "ENVIADO" })).map((i) => textoIconoOperador(i, doc({ estadoSifen: "APROBADO", cdc: "X", estadoEmail: "ENVIADO" })).etiqueta),
    ["Envío: Enviado", "XML/CDC: Código del documento registrado", "SIFEN: Aprobado", "Correo: Correo enviado"]);
  cierto("C02-T06b IconoFase usa la etiqueta como nombre accesible (o el texto) y la fila pasa texto y etiqueta de operador",
    /aria-label=\{etiqueta \?\? texto\}/.test(pagina) && /texto=\{textoIconoOperador\(i, d\)\.texto\} etiqueta=\{textoIconoOperador\(i, d\)\.etiqueta\}/.test(fila));

  // ══ T07 Segunda capa: textos técnicos completos conservados ═══════════════════════════════════════════════════════════════════════════════
  cierto("C02-T07 la segunda capa conserva i.texto, «Aviso técnico» con alerta.texto + alerta.detalle, eventos técnicos y etiquetaIntento del historial",
    /texto=\{i\.texto\}/.test(segunda) && /<strong>Aviso técnico:<\/strong> \{alerta\.texto\}\. \{alerta\.detalle\}/.test(segunda) && /Eventos: \{eventos\.registrado \?\? eventos\.sinRegistro\}\. \{eventos\.operacion\}/.test(segunda) &&
    /etiquetaIntento\(/.test(segunda));

  // ══ T08 Iconos sin cambios de clasificación (símbolo, tono, orden) ════════════════════════════════════════════════════════════════════════
  igual("C02-T08 iconosEstado intacto: RECHAZADO con CDC = check/ok · archivoCheck/info · cruz/error · correo/neutro",
    iconosEstado(doc({ estadoSifen: "RECHAZADO", cdc: "X" })).map((i) => [i.eje, i.simbolo, i.tono]), [["envio", "check", "ok"], ["xml", "archivoCheck", "info"], ["sifen", "cruz", "error"], ["correo", "correo", "neutro"]]);

  // ══ T09 KuDE: PDF original y endpoint intactos (PRO-365-R02-C02-C02: el aviso NO_VERIFICADO y el título de seguridad se retiraron por decisión del responsable) ═══
  cierto("C02-T09 (actualizado C02-C02) KuDE: mismo endpoint /api/documentos/{id}/kude; la modal titula con el título del documento y sin aviso de verificación; texto de carga en lenguaje llano",
    /fetchFn\("\/api\/documentos\/" \+ encodeURIComponent\(docId\) \+ "\/kude"/.test(visor) && !/AVISO_KUDE_NO_VERIFICADO|noVerificado/.test(modal) &&
    /const titulo = estado\.titulo;/.test(modal) && /Cargando el KuDE…/.test(modal) && !/Obteniendo el KuDE del gateway/.test(modal) && /<iframe id="kude-visor" key=\{estado\.url\} src=\{estado\.url\}/.test(modal));

  // ══ T10 Sin efectos: módulo puro, sin red ni escritura ════════════════════════════════════════════════════════════════════════════════════
  cierto("C02-T10 documentos-copy-operador es puro: sin fetch, React, SQL ni rutas /api",
    !/fetch\(|from "react"|\/api\/|SELECT |UPDATE |INSERT /.test(copy));

  // ══ C02-11 APROBADO: sin motivo; un mensaje anterior no se presenta como vigente ══════════════════════════════════════════════════════════
  {
    const ap = doc({ estadoSifen: "APROBADO", cdc: "X", codRespuesta: "0260", mensajeRespuesta: "Aprobado" });
    // PRO-365-R02-C02-C01: el escenario APROBADO + 1109 se retiró de este caso (no se fuerza un PASS sobre él). Ver C02C01-F01: con los datos actuales no se puede
    // acreditar que un código registrado junto a APROBADO sea una respuesta anterior; queda BLOQUEADO y documentado en el informe C02-C01.
    igual("C02-11a (actualizado PRO-365-R02-C02-C01) APROBADO con respuesta de aprobación: encabezado «Aprobado» verde; sin fila de motivo ni nota",
      [encabezadoFiscal(ap), respuestaFiscal(ap, detalleFiscalPrimario(ap))],
      [{ titulo: "Aprobado", tono: "ok", simbolo: "check", nota: null }, { motivo: null, notaHistorial: null }]);
    cierto("C02-11b el detalle ya no tiene «Mensaje» incondicional: la fila de respuesta solo existe si respuesta.motivo",
      !primera.includes(">Mensaje</dt>") && /\{respuesta\.motivo \? \(/.test(primera) && /<dt className=\{ui\.muted\}>\{respuesta\.motivo\.etiqueta\}<\/dt>/.test(primera));
  }

  // ══ C02-12 RECHAZADO sin mensaje (contradictorio / incompleto) ════════════════════════════════════════════════════════════════════════════
  {
    const r = doc({ estadoSifen: "RECHAZADO", codRespuesta: null, mensajeRespuesta: null });
    igual("C02-12 RECHAZADO sin código ni mensaje: «Motivo del rechazo: Motivo no informado» (sin inventar)", respuestaFiscal(r, detalleFiscalPrimario(r)), { motivo: { etiqueta: "Motivo del rechazo", valor: MOTIVO_NO_INFORMADO }, notaHistorial: null });
  }

  // ══ C02-13 PENDIENTE / SIN_CONSULTA / NO_RECONOCIDO / envío indeterminado ═════════════════════════════════════════════════════════════════
  {
    const pend = doc({ estadoSifen: "PENDIENTE", codRespuesta: "1109", mensajeRespuesta: "Número de documento ha sido inutilizado anteriormente" });
    igual("C02-13a PENDIENTE con un mensaje anterior: «Pendiente de respuesta», sin motivo; solo la nota que remite al historial técnico",
      [encabezadoFiscal(pend).titulo, respuestaFiscal(pend, detalleFiscalPrimario(pend))], ["Pendiente de respuesta", { motivo: null, notaHistorial: NOTA_MENSAJES_HISTORIAL }]);
    igual("C02-13b SIN_CONSULTA transmitido = «Pendiente de respuesta»; NO_RECONOCIDO o envío indeterminado = «Sin resultado confirmado» (aviso, nunca «Rechazado»)",
      [doc({ estadoSifen: "SIN_CONSULTA" }), doc({ estadoSifen: "NO_RECONOCIDO" }), doc({ estadoLocal: "ENVIO_INDETERMINADO", estadoSifen: "SIN_CONSULTA" })].map((d) => [encabezadoFiscal(d).titulo, encabezadoFiscal(d).tono]),
      [["Pendiente de respuesta", "aviso"], ["Sin resultado confirmado", "aviso"], ["Sin resultado confirmado", "aviso"]]);
    igual("C02-13c no transmitido: «Sin enviar» / «Enviando» / «Error al enviar» con nota «No es un rechazo de SIFEN.»",
      [doc({ estadoLocal: "PENDIENTE_ENVIO", estadoSifen: "SIN_CONSULTA" }), doc({ estadoLocal: "ENVIANDO", estadoSifen: "SIN_CONSULTA" }), doc({ estadoLocal: "ERROR_ENVIO", estadoSifen: "SIN_CONSULTA", envioErrorTipo: "RECHAZO" })].map((d) => [encabezadoFiscal(d).titulo, encabezadoFiscal(d).nota]),
      [["Sin enviar", null], ["Enviando", null], ["Error al enviar", "No es un rechazo de SIFEN."]]);
  }

  // ══ C02-14 CANCELADO / INUTILIZADO / APROBADO luego cancelado (estado histórico) ══════════════════════════════════════════════════════════
  {
    const canc = doc({ estadoSifen: "CANCELADO", codRespuesta: "1109", mensajeRespuesta: "x" });
    const inut = doc({ estadoSifen: "INUTILIZADO" });
    const apCanc = { ...doc({ estadoSifen: "APROBADO", cdc: "X" }), eventosFe: eventos("CANCELADO", "Cancelado (evento aprobado)") };
    igual("C02-14a CANCELADO e INUTILIZADO: encabezado propio (neutro), sin motivo ni nota aunque haya un mensaje anterior",
      [encabezadoFiscal(canc).titulo, encabezadoFiscal(canc).tono, respuestaFiscal(canc, detalleFiscalPrimario(canc)), encabezadoFiscal(inut).titulo],
      ["Cancelado", "neutro", { motivo: null, notaHistorial: null }, "Inutilizado"]);
    // Actualizado C02-C03 (F03): el tooltip de primera capa pasa de «Aprobado, luego cancelado» a «Cancelado» (orden PRO-370).
    igual("C02-14b APROBADO con cancelación acreditada por evento: encabezado «Cancelado» con nota de la aprobación original; tooltip SIFEN «Cancelado»; Eventos muestra la situación",
      [encabezadoFiscal(apCanc).titulo, encabezadoFiscal(apCanc).nota, textoIconoOperador(iconosEstadoOperador(apCanc)[2], apCanc).texto, eventosOperador(apCanc, cancelFe).registrado],
      ["Cancelado", "Fue aprobado y luego cancelado. La aprobación original se conserva en el historial.", "Cancelado", "Cancelado (evento aprobado)"]);
    // Actualizado C02-C03 (F03): la expectativa «check verde» queda SUSTITUIDA solo en primera capa; el historial técnico (iconosEstado base) sigue verde y se comprueba aquí.
    igual("C02-14c APROBADO luego cancelado: primera capa prohibido/neutro; historial técnico (iconosEstado base) conserva el check verde de la aprobación original",
      [iconosEstadoOperador(apCanc)[2].simbolo, iconosEstadoOperador(apCanc)[2].tono, iconosEstado(apCanc)[2].simbolo, iconosEstado(apCanc)[2].tono], ["prohibido", "neutro", "check", "ok"]);
    igual("C02-14d Eventos: estado persistido CANCELADO/INUTILIZADO con nombre llano; sin lectura → null (la celda muestra «Sin información»)",
      [eventosOperador(canc, cancelFe).registrado, eventosOperador(inut, cancelNce).registrado, eventosOperador(doc({ estadoSifen: "APROBADO" }), cancelFe).registrado], ["Cancelado", "Inutilizado", null]);
  }

  // ══ C02-15 Encabezado del detalle: estado claro, accesible y sin color como único medio ═══════════════════════════════════════════════════
  cierto("C02-15 el encabezado del detalle muestra el estado (texto + glifo + clase por tono) con «Estado:» para lectores; CSS con borde y colores AA",
    /<span className=\{clases\(estilos\.estadoFiscal, CLASE_TONO_ICONO\[encabezado\.tono\]\)\} data-estado-fiscal=\{encabezado\.titulo\}>/.test(pagina) && /<span className=\{estilos\.srSolo\}>Estado: <\/span>\{encabezado\.titulo\}/.test(pagina) &&
    /const encabezado = encabezadoFiscal\(d\);/.test(pagina) && /\.estadoFiscal \{[^}]*border: 1px solid currentColor;/.test(css) && /\.estadoFiscal\.iconoError \{[^}]*color: #b42318;/.test(css) && /\.notaEstadoFiscal \{/.test(css));

  // ══ C02-16 Avisos y mensajes tras acción ═════════════════════════════════════════════════════════════════════════════════════════════════
  igual("C02-16a avisos breves: inconsistencia / técnica / revisión (NCE añade el saldo)",
    [avisoOperador({ tipo: "inconsistencia", texto: "", detalle: "" }, false, "FE"), avisoOperador({ tipo: "tecnica", texto: "", detalle: "" }, false, "FE"), avisoOperador(null, true, "NCE"), avisoOperador(null, false, "FE")],
    ["Hay un registro anterior de consulta para revisar; el estado no cambió.", "La última consulta no obtuvo una respuesta válida; el estado no cambió.", "Lleva mucho tiempo sin resultado definitivo; no se reenvía ni se libera el saldo.", ""]);
  igual("C02-16b alertaConsulta sigue derivando la alerta técnica (la clasificación no cambia, solo el texto de primera capa)", [alertaConsulta({ ultimaConsultaResultado: "OK" }), alertaConsulta({ ultimaConsultaResultado: "CDC_DIVERGENTE" })?.tipo], [null, "inconsistencia"]);
  igual("C02-16c tras «Enviar documento»: confirmado / ya enviado / error con el detalle útil / no confirmado (nunca «Enviado»)",
    [textoEnvioOperador({ resultado: "OK", estadoLocal: "ENVIADO", errores: [], mensaje: null }), textoEnvioOperador({ resultado: "YA_ENVIADO", errores: [], mensaje: null }),
      textoEnvioOperador({ resultado: "ERROR_HTTP", estadoLocal: "ERROR_ENVIO", errores: ["dRucRec inválido"], mensaje: "Validación" }), textoEnvioOperador({ resultado: "OK", estadoLocal: "ENVIO_INDETERMINADO", errores: [], mensaje: null })],
    ["Enviado. Falta la respuesta de SIFEN.", "Este documento ya fue enviado; no se reenvía.", "Error al enviar. Validación dRucRec inválido", "No se pudo confirmar el envío. No lo reenvíe sin verificar antes con el proveedor de facturación."]);
  igual("C02-16d tras «Consultar estado»: OK / no encontrado / error; la advertencia de cuenta no comprobada se conserva",
    [textoConsultaOperador("OK"), textoConsultaOperador("NO_ENCONTRADO"), textoConsultaOperador("ERROR_HTTP"), textoConsultaOperador("OK", "SIN_REFERENCIA").endsWith("Aviso: no se pudo comprobar que la consulta usara la misma cuenta del envío.")],
    ["Consulta realizada. El estado se actualiza en el listado.", "El servicio de facturación no encontró el documento; el estado no cambió.", "No se obtuvo una respuesta válida; el estado no cambió. Puede volver a consultar más tarde.", true]);
  cierto("C02-16e la página usa los textos de operador para envío y consulta (sin componer HTTP/lote en el aviso)",
    /aviso: textoEnvioOperador\(j\)/.test(pagina) && /const texto = textoConsultaOperador\(j\.resultado, j\.continuidadConexion\);/.test(pagina) && !/`HTTP \$\{j\.http\}`/.test(pagina));

  // ══ C02-17 Sin cambios fuera del alcance (estados, contadores, permisos, eventos) ═════════════════════════════════════════════════════════
  cierto("C02-17 la página no gana rutas nuevas de escritura ni de eventos; la consulta y el envío siguen en sus rutas y permisos",
    !/\/api\/[^`"]*(cancel|inutiliz|evento)/i.test(pagina) && /`\/api\/documentos\/\$\{d\.id\}\/enviar`/.test(pagina) && /accionesFila\(kudeDisponible\(d\), \{ editar \}/.test(pagina));

  // ══ C02-18 Alcance de la evidencia ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  // Estos casos son conformidad ESTÁTICA (fuente y funciones puras). El CI automático los ejecuta tras el push; la homologación visual real en el navegador es del responsable.

  // ══ PRO-365-R02-C02-C01 (PRO-369) ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  {
    const nex080 = leer("documentacao/banco/nexit/v1/migraciones/NEX-080-facturacion-cdc-dato-api.sql");
    const nucleo = nex080.slice(nex080.indexOf("FUNCTION public.fe_documento_registrar_consulta_nucleo_r05("), nex080.indexOf("FUNCTION public.fe_documento_registrar_consulta_r05("));
    const ap0260 = doc({ estadoSifen: "APROBADO", cdc: "X", codRespuesta: "0260", mensajeRespuesta: "Aprobado" });
    const apSin = doc({ estadoSifen: "APROBADO", cdc: "X" });
    const r1109 = doc({ estadoSifen: "RECHAZADO", codRespuesta: "1109", mensajeRespuesta: "Número de documento ha sido inutilizado anteriormente" });
    const pend = doc({ estadoSifen: "PENDIENTE", codRespuesta: "0160", mensajeRespuesta: "XML firmado" });

    // F01 — escenarios que NO deben recibir aviso.
    igual("C02C01-01 APROBADO + respuesta normal 0260: «Aprobado», sin motivo ni nota (ninguna advertencia falsa)", [encabezadoFiscal(ap0260).titulo, respuestaFiscal(ap0260, detalleFiscalPrimario(ap0260))], ["Aprobado", { motivo: null, notaHistorial: null }]);
    igual("C02C01-02 APROBADO sin respuesta adicional: «Aprobado», sin motivo ni nota", [encabezadoFiscal(apSin).titulo, respuestaFiscal(apSin, detalleFiscalPrimario(apSin))], ["Aprobado", { motivo: null, notaHistorial: null }]);
    // F01 — BLOQUEADO: evidencia de fuente del motivo. El código y el mensaje del documento se escriben en el MISMO UPDATE que fija el estado (respuesta OK), y una respuesta
    // contradictoria posterior NO los toca. No hay fecha ni correlación por campo: un 1109 junto a APROBADO es el código que llegó con esa respuesta, no una respuesta anterior
    // demostrable. El historial (segunda capa, paginado y cargado a demanda) no se usa como prueba en la primera capa. Por eso no se implementa el aviso (sin heurísticas).
    cierto("C02C01-F01 (bloqueo, evidencia) NEX-080: cod_respuesta/mensaje_respuesta solo se actualizan junto con estado_sifen en una respuesta OK; la contradictoria solo anota la consulta",
      /IF v_resultado = 'OK' THEN[\s\S]*?UPDATE public\.documentos_electronicos SET\s+estado_sifen = p_estado_sifen,[\s\S]*?cod_respuesta = p_cod_respuesta,\s+mensaje_respuesta = v_mensaje,/.test(nucleo) &&
      /ELSE[\s\S]*?UPDATE public\.documentos_electronicos SET ultima_consulta_at = now\(\), ultima_consulta_resultado = v_resultado, actualizado_at = now\(\)/.test(nucleo) &&
      !/Hay una respuesta anterior para revisar/.test(copy) && !/notaAprobado|respuestaAnterior/.test(pagina));
    igual("C02C01-03 RECHAZADO + 1109: «Rechazado» con «Motivo del rechazo» con código y descripción literales", [encabezadoFiscal(r1109).titulo, respuestaFiscal(r1109, detalleFiscalPrimario(r1109)).motivo],
      ["Rechazado", { etiqueta: "Motivo del rechazo", valor: "1109 · Número de documento ha sido inutilizado anteriormente" }]);
    igual("C02C01-04 PENDIENTE con respuesta anterior: comportamiento C02 (sin motivo, nota que remite al historial técnico)", respuestaFiscal(pend, detalleFiscalPrimario(pend)), { motivo: null, notaHistorial: NOTA_MENSAJES_HISTORIAL });

    // F02 de C02-C01 SUSTITUIDO por PRO-365-R02-C02-C02 (decisión del responsable): sin título «PDF sin verificación», sin aviso, sin sufijo ni clasificación por CDC.
    const visorCodigo = visor.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const modalCodigo = modal.replace(/\/\/.*$/gm, "");

    cierto("C02C02-01 título normal: la modal usa el título del documento («KuDE · Factura …» / «KuDE · Nota de crédito …» con número y serie dinámicos que arma la página)",
      /const titulo = estado\.titulo;/.test(modal) && /titulo: `KuDE · \$\{d\.tipo === "NCE" \? "Nota de crédito" : "Factura"\} \$\{d\.establecimiento\}-\$\{d\.puntoExpedicion\}-\$\{d\.numero\}\$\{d\.serie \? ` \(\$\{d\.serie\}\)` : ""\}`/.test(pagina));
    cierto("C02C02-02 sin título «PDF sin verificación», sin aviso de PDF no verificado, sin sufijo «-NO-VERIFICADO» y sin clasificación VERIFICADA/NO_VERIFICADA en visor y modal",
      !/PDF sin verificación|No se pudo confirmar que este PDF|NO-VERIFICADO|VERIFICADA|pertenencia|tituloKude|AVISO_KUDE/.test(visorCodigo + modalCodigo));
    cierto("C02C02-03 botones Descargar PDF, Imprimir y Cerrar; mismo iframe con el PDF original (URL del Blob, sin modificar bytes)",
      />\{estado\.fase === "LISTO" && estado\.descarga === "CARGANDO" \? "Preparando descarga…" : "Descargar PDF"\}</.test(modal) && />Imprimir</.test(modal) && />Cerrar</.test(modal) &&
      /<iframe id="kude-visor" key=\{estado\.url\} src=\{estado\.url\}/.test(modal) && /return r\.blob\(\);/.test(visor));
    cierto("C02C02-04 descarga con el nombre normal del documento (sin sufijo) y solicitud NUEVA en cada apertura/descarga",
      /dep\.descargar\(temporal, nombre\);/.test(visor) && /const blob = await dep\.obtener\(docId, control\.signal\);/.test(visor) && /cache: "no-store"/.test(visor));
    cierto("C02C02-05 cierre, abortos y respuestas tardías intactos: abortos, revocación de URL y secuencias de apertura y descarga",
      /aborto\?\.abort\(\);/.test(visor) && /abortoDescarga\?\.abort\(\);/.test(visor) && /dep\.revocarUrl\(estado\.url\)/.test(visor) && /if \(mia !== secuencia \|\| control\.signal\.aborted\) return;/.test(visor) &&
      /if \(mia !== secuenciaDescarga \|\| control\.signal\.aborted\) return;/.test(visor));
    cierto("C02C02-06 sin cambios fuera del KuDE: la página no cambia el título armado ni gana rutas nuevas; el módulo de textos sigue puro",
      !/fetch\(|\/api\/|SELECT |UPDATE |INSERT /.test(copy) && /accionesFila\(kudeDisponible\(d\), \{ editar \}/.test(pagina));
    cierto("C02C01-11 historial técnico preservado: i.texto, aviso técnico completo, eventos técnicos y etiquetaIntento en la segunda capa",
      /texto=\{i\.texto\}/.test(segunda) && /\{alerta\.texto\}\. \{alerta\.detalle\}/.test(segunda) && /etiquetaIntento\(/.test(segunda));
    cierto("C02C01-12 sin cambios fiscales, de API, SQL ni permisos: el módulo de textos sigue puro y la página no gana rutas ni llamadas nuevas",
      !/fetch\(|\/api\/|SELECT |UPDATE |INSERT /.test(copy) && !/\/api\/[^`"]*(cancel|inutiliz|evento)/i.test(pagina) && /accionesFila\(kudeDisponible\(d\), \{ editar \}/.test(pagina));
  }

  // ══ C02C03 (PRO-370, F03) — APROBADO con cancelación acreditada: primera capa «Cancelado»; historial con la aprobación original ═══════════════════
  {
    const sifen = (d: Doc) => {
      const i = iconosEstadoOperador(d)[2];
      const t = textoIconoOperador(i, d);

      return [i.simbolo, i.tono, t.texto, t.etiqueta];
    };
    const ap = doc({ estadoSifen: "APROBADO", cdc: "CDC-1", estadoEmail: "ENVIADO" });
    const apSinCdc = doc({ estadoSifen: "APROBADO", cdc: null });
    const apCanc = { ...doc({ estadoSifen: "APROBADO", cdc: "CDC-1", estadoEmail: "ENVIADO" }), eventosFe: eventos("CANCELADO", "Cancelado (evento aprobado)") };
    const canc = doc({ estadoSifen: "CANCELADO" });
    const cancConEv = { ...doc({ estadoSifen: "CANCELADO" }), eventosFe: eventos("CANCELADO", "Cancelado (evento aprobado)") };
    const inut = doc({ estadoSifen: "INUTILIZADO" });
    const r1109 = doc({ estadoSifen: "RECHAZADO", cdc: "X", codRespuesta: "1109", mensajeRespuesta: "Número de documento ha sido inutilizado anteriormente" });
    const pend = doc({ estadoSifen: "PENDIENTE" });
    const conEv = (situacion: string) => ({ ...doc({ estadoSifen: "APROBADO", cdc: "CDC-1" }), eventosFe: eventos(situacion, "x") });
    const segundaCodigo = segunda.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

    igual("C02C03-01 APROBADO normal: check verde «Aprobado» (igual que iconosEstado base)", [sifen(ap), iconosEstadoOperador(ap)[2]], [["check", "ok", "Aprobado", "SIFEN: Aprobado"], iconosEstado(ap)[2]]);
    igual("C02C03-02 APROBADO sin CDC: check verde «Aprobado»", sifen(apSinCdc), ["check", "ok", "Aprobado", "SIFEN: Aprobado"]);
    igual("C02C03-03 APROBADO + cancelación acreditada: eje SIFEN prohibido/neutro, tooltip EXACTO «Cancelado», aria-label «SIFEN: Cancelado»; encabezado y nota intactos",
      [...sifen(apCanc), encabezadoFiscal(apCanc).titulo, encabezadoFiscal(apCanc).simbolo, encabezadoFiscal(apCanc).nota],
      ["prohibido", "neutro", "Cancelado", "SIFEN: Cancelado", "Cancelado", "prohibido", "Fue aprobado y luego cancelado. La aprobación original se conserva en el historial."]);
    igual("C02C03-04 historial técnico del mismo documento: iconosEstado base con check verde y estado registrado APROBADO; la página usa iconosEstado(d) en la segunda capa y no la proyección",
      [iconosEstado(apCanc)[2].simbolo, iconosEstado(apCanc)[2].tono, iconosEstado(apCanc)[2].corto, apCanc.estadoSifen, /\{iconosEstado\(d\)\.map\(\(i\) => \(/.test(segundaCodigo), /iconosEstadoOperador/.test(segundaCodigo)],
      ["check", "ok", "SIFEN Aprobado", "APROBADO", true, false]);
    igual("C02C03-05 CANCELADO persistido (con y sin eventos): prohibido/neutro «Cancelado», sin nota de aprobación original inventada",
      [sifen(canc), sifen(cancConEv), encabezadoFiscal(canc).nota, encabezadoFiscal(cancConEv).nota, iconosEstadoOperador(canc)[2], iconosEstado(canc)[2]],
      [["prohibido", "neutro", "Cancelado", "SIFEN: Cancelado"], ["prohibido", "neutro", "Cancelado", "SIFEN: Cancelado"], null, null, iconosEstado(canc)[2], iconosEstado(canc)[2]]);
    igual("C02C03-06 INUTILIZADO sin cambios: prohibido/neutro con tooltip «Inutilizado»", [sifen(inut), iconosEstadoOperador(inut)[2]], [["prohibido", "neutro", "Inutilizado", "SIFEN: Inutilizado"], iconosEstado(inut)[2]]);
    igual("C02C03-07 RECHAZADO 1109: cruz roja «Rechazado» y «Motivo del rechazo» con código y mensaje literales (no se vuelve Cancelado ni Inutilizado)",
      [sifen(r1109), encabezadoFiscal(r1109).titulo, respuestaFiscal(r1109, detalleFiscalPrimario(r1109)).motivo],
      [["cruz", "error", "Rechazado", "SIFEN: Rechazado"], "Rechazado", { etiqueta: "Motivo del rechazo", valor: "1109 · Número de documento ha sido inutilizado anteriormente" }]);
    igual("C02C03-08 PENDIENTE sin cambios (reloj ámbar, «Pendiente de respuesta»)", [sifen(pend), iconosEstadoOperador(pend)], [["reloj", "aviso", "Pendiente de respuesta", "SIFEN: Pendiente de respuesta"], iconosEstado(pend)]);
    igual("C02C03-09 APROBADO + EN_REVISION (incluye evento genérico aprobado sin tipo/correlación): no se presenta cancelación", sifen(conEv("EN_REVISION")), ["check", "ok", "Aprobado", "SIFEN: Aprobado"]);
    igual("C02C03-10 APROBADO + SOLO_RECHAZADOS: no cancelado", sifen(conEv("SOLO_RECHAZADOS")), ["check", "ok", "Aprobado", "SIFEN: Aprobado"]);
    igual("C02C03-11 APROBADO + SIN_INFORMACION y sin proyección (null/ausente): no cancelado",
      [sifen(conEv("SIN_INFORMACION")), sifen({ ...ap, eventosFe: null as never }), sifen(ap)], [["check", "ok", "Aprobado", "SIFEN: Aprobado"], ["check", "ok", "Aprobado", "SIFEN: Aprobado"], ["check", "ok", "Aprobado", "SIFEN: Aprobado"]]);
    igual("C02C03-12 APROBADO + SIN_EVENTOS: no cancelado; un mensaje/código de cancelación en la respuesta tampoco acredita nada",
      [sifen(conEv("SIN_EVENTOS")), sifen(doc({ estadoSifen: "APROBADO", cdc: "X", codRespuesta: "0600", mensajeRespuesta: "Documento cancelado" }))],
      [["check", "ok", "Aprobado", "SIFEN: Aprobado"], ["check", "ok", "Aprobado", "SIFEN: Aprobado"]]);
    igual("C02C03-13 Envío, XML/CDC y Correo idénticos a iconosEstado base en el caso cancelado; el aviso técnico sigue independiente (avisoOperador no recibe la proyección)",
      [0, 1, 3].map((n) => JSON.stringify(iconosEstadoOperador(apCanc)[n]) === JSON.stringify(iconosEstado(apCanc)[n])).concat(/const avisoFila = avisoOperador\(alerta, d\.requiereRevision, d\.tipo\);/.test(pagina)), [true, true, true, true]);
    igual("C02C03-14 cuatro ejes en el mismo orden (Envío · XML/CDC · SIFEN · Correo)", [iconosEstadoOperador(apCanc).map((i) => i.eje), iconosEstadoOperador(ap).map((i) => i.eje)], [["envio", "xml", "sifen", "correo"], ["envio", "xml", "sifen", "correo"]]);
    cierto("C02C03-15 leyenda con «prohibido» (estilo neutro existente, «cancelado o inutilizado»); la fila (misma en móvil) usa la proyección una sola vez con el mismo IconoFase/GLIFO",
      /\{ simbolo: "prohibido", clase: estilos\.iconoNeutro, texto: "cancelado o inutilizado" \}/.test(pagina) && /const fases = iconosEstadoOperador\(d\);/.test(pagina) &&
      (pagina.match(/iconosEstadoOperador\(/g) ?? []).length === 1 && /\{fases\.map\(\(i\) => \(\s*<IconoFase key=\{i\.eje\} eje=\{i\.eje\} simbolo=\{i\.simbolo\} clase=\{CLASE_TONO_ICONO\[i\.tono\]\}/.test(fila) && /prohibido: /.test(pagina));
    {
      const d = { ...doc({ estadoSifen: "APROBADO", cdc: "CDC-1" }), eventosFe: eventos("CANCELADO", "Cancelado (evento aprobado)") };
      const antes = JSON.stringify(d);
      const base = iconosEstado(d);
      const baseAntes = JSON.stringify(base);
      const salida = iconosEstadoOperador(d);
      igual("C02C03-16 sin mutación: documento, eventos e iconos base intactos; el eje SIFEN sustituido es un objeto nuevo", [JSON.stringify(d) === antes, JSON.stringify(base) === baseAntes, salida[2] !== base[2], d.estadoSifen], [true, true, true, "APROBADO"]);
    }
    cierto("C02C03-17 filtros/KPI, permisos y operaciones intactos: indicador «Aprobados» sigue en check; cancelación no operativa; el módulo de textos sigue puro (sin red ni SQL)",
      /\{ grupo: "APROBADO", titulo: "Aprobados", ayuda: "Documentos aprobados", clase: estilos\.tonoVerde, simbolo: "check" \}/.test(pagina) && /accionesFila\(kudeDisponible\(d\), \{ editar \}/.test(pagina) &&
      /const cancelacion = elegibilidadCancelacionFe\(/.test(pagina) && /CANCELACION_FE_OPERATIVA = false/.test(leer("lib/facturacion/eventos-fe.ts")) && !/fetch\(|\/api\/|SELECT |UPDATE |INSERT /.test(copy));
    cierto("C02C03-18 KuDE C02-C02 preservado: título del documento, sin aviso/sufijo/clasificación por CDC en visor y modal",
      /const titulo = estado\.titulo;/.test(modal) && !/PDF sin verificación|NO-VERIFICADO|VERIFICADA|tituloKude|AVISO_KUDE/.test(visor.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "") + modal.replace(/\/\/.*$/gm, "")));
  }

  return fallos;
}
