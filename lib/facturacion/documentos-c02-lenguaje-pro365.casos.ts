/**
 * PRO-365-R02-C02 — Lenguaje de usuario final en «Documentos electrónicos» (primera capa) y detalle fiscal por estado.
 * Casos sobre funciones PURAS reales (documentos-copy-operador.ts, presentacion-sifen.ts) y sobre el texto fuente de page.tsx / page.module.css / kude-modal.tsx.
 * ESCRITOS, NO EJECUTADOS (orden PRO-365-R02-C02: sin tests, lint, typecheck, build, CI manual, SQL ni navegador). No es homologación visual.
 * Cubre T01–T10 y C02-11..C02-18 de la orden: APROBADO, RECHAZADO (1109), PENDIENTE, CANCELADO, INUTILIZADO, respuestas contradictorias y estados históricos.
 * PRO-365-R02-C02-C01 (PRO-369): casos C02C01-01..12 (F01 aviso en APROBADO — BLOQUEADO por falta de datos fiables, ver informe; F02 título y aviso del PDF sin verificación).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import {
  AYUDA_ACCION_NO_DISPONIBLE,
  avisoOperador,
  encabezadoFiscal,
  eventosOperador,
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
import { AVISO_KUDE_NO_VERIFICADO, pertenenciaDe, tituloKude, type BlobKude } from "@/lib/facturacion/kude-visor";
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

  // ══ T09 KuDE: PDF original, endpoint y aviso NO_VERIFICADO intactos ═══════════════════════════════════════════════════════════════════════
  cierto("C02-T09 KuDE: mismo endpoint /api/documentos/{id}/kude, aviso NO_VERIFICADO y título de seguridad conservados; solo cambia el texto de carga",
    /fetchFn\("\/api\/documentos\/" \+ encodeURIComponent\(docId\) \+ "\/kude"/.test(visor) && /\{noVerificado \? <p className=\{ui\.alertError\} role="alert"[^>]*>\{AVISO_KUDE_NO_VERIFICADO\}<\/p>/.test(modal) &&
    /tituloKude/.test(modal) && /Cargando el KuDE…/.test(modal) && !/Obteniendo el KuDE del gateway/.test(modal) && /<iframe id="kude-visor" key=\{estado\.url\} src=\{estado\.url\}/.test(modal));

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
    igual("C02-14b APROBADO con cancelación acreditada por evento: encabezado «Cancelado» con nota de la aprobación original; tooltip SIFEN «Aprobado, luego cancelado»; Eventos muestra la situación",
      [encabezadoFiscal(apCanc).titulo, encabezadoFiscal(apCanc).nota, textoIconoOperador(iconosEstado(apCanc)[2], apCanc).texto, eventosOperador(apCanc, cancelFe).registrado],
      ["Cancelado", "Fue aprobado y luego cancelado. La aprobación original se conserva en el historial.", "Aprobado, luego cancelado", "Cancelado (evento aprobado)"]);
    igual("C02-14c el icono SIFEN de APROBADO luego cancelado no cambia de clasificación (check verde por el estado persistido)", [iconosEstado(apCanc)[2].simbolo, iconosEstado(apCanc)[2].tono], ["check", "ok"]);
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

    // F02 — título y aviso del PDF sin verificación.
    igual("C02C01-05 KuDE VERIFICADO: conserva su título exacto", tituloKude("KuDE · Factura 001-001-0000003", "VERIFICADA"), "KuDE · Factura 001-001-0000003");
    igual("C02C01-06 PDF NO_VERIFICADO: título claro con el número del documento real (FE y NCE)",
      [tituloKude("KuDE · Factura 001-001-0000003", "NO_VERIFICADA"), tituloKude("KuDE · Nota de crédito 001-002-0000010 (AA)", "NO_VERIFICADA")],
      ["PDF sin verificación — Factura 001-001-0000003", "PDF sin verificación — Nota de crédito 001-002-0000010 (AA)"]);
    igual("C02C01-07 advertencia obligatoria en lenguaje llano, sin gateway/API/CDC, que expresa falta de verificación (no «falso», «incorrecto» ni «rechazado»)",
      [AVISO_KUDE_NO_VERIFICADO, /gateway|\bAPI\b|CDC|NEXIT/.test(AVISO_KUDE_NO_VERIFICADO + tituloKude("KuDE · Factura 1", "NO_VERIFICADA")), /falso|incorrecto|rechazad/i.test(AVISO_KUDE_NO_VERIFICADO)],
      ["No se pudo confirmar que este PDF corresponda a esta factura. Revise la empresa emisora, el número, la fecha y los importes antes de utilizarlo. Si los datos no coinciden, no lo entregue como KuDE.", false, false]);
    igual("C02C01-08 sin evidencia de correspondencia = NO_VERIFICADA (Blob sin marca o con valor desconocido); solo «VERIFICADA» verifica",
      [pertenenciaDe(new Blob([])), pertenenciaDe(Object.assign(new Blob([]), { pertenencia: "OTRO" }) as unknown as BlobKude), pertenenciaDe(Object.assign(new Blob([]), { pertenencia: "VERIFICADA" }) as BlobKude)],
      ["NO_VERIFICADA", "NO_VERIFICADA", "VERIFICADA"]);
    cierto("C02C01-09 nombre de descarga protegido «-NO-VERIFICADO.pdf» y lógica de pertenencia sin cambios",
      /const nombreSegun = \(nombre: string, p: PertenenciaKude\) => \(p === "VERIFICADA" \? nombre : nombre\.replace\(\/\\\.pdf\$\/i, ""\) \+ "-NO-VERIFICADO\.pdf"\);/.test(visor) &&
      /export const pertenenciaDe = \(b: Blob\): PertenenciaKude => \(\(b as BlobKude\)\.pertenencia === "VERIFICADA" \? "VERIFICADA" : "NO_VERIFICADA"\);/.test(visor) &&
      /p === "VERIFICADA" \? titulo : `PDF sin verificación — \$\{titulo\.replace\(\/\^KuDE · \/, ""\)\}`/.test(visor));
    cierto("C02C01-10 PDF, endpoint, cierre y respuestas tardías intactos: misma solicitud /kude, abortos, revocación de URL y secuencia; la modal sigue condicionando el aviso a noVerificado y muestra el mismo iframe",
      /fetchFn\("\/api\/documentos\/" \+ encodeURIComponent\(docId\) \+ "\/kude"/.test(visor) && /aborto\?\.abort\(\);/.test(visor) && /revocarUrl/.test(visor) && /let secuencia = 0;/.test(visor) &&
      /\{noVerificado \? <p className=\{ui\.alertError\} role="alert"[^>]*>\{AVISO_KUDE_NO_VERIFICADO\}<\/p> : null\}/.test(modal) && /tituloKude\(estado\.titulo, estado\.pertenencia\)/.test(modal) &&
      /<iframe id="kude-visor" key=\{estado\.url\} src=\{estado\.url\}/.test(modal));
    cierto("C02C01-11 historial técnico preservado: i.texto, aviso técnico completo, eventos técnicos y etiquetaIntento en la segunda capa",
      /texto=\{i\.texto\}/.test(segunda) && /\{alerta\.texto\}\. \{alerta\.detalle\}/.test(segunda) && /etiquetaIntento\(/.test(segunda));
    cierto("C02C01-12 sin cambios fiscales, de API, SQL ni permisos: el módulo de textos sigue puro y la página no gana rutas ni llamadas nuevas",
      !/fetch\(|\/api\/|SELECT |UPDATE |INSERT /.test(copy) && !/\/api\/[^`"]*(cancel|inutiliz|evento)/i.test(pagina) && /accionesFila\(kudeDisponible\(d\), \{ editar \}/.test(pagina));
  }

  return fallos;
}
