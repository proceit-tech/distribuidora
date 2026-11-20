/**
 * PRO-313-R01 / PRO-199 — Lectura de eventos de FE (response.DE.Evento) y preparación NO operativa de la cancelación (orden ORD-CLAUDE-NEXIT-PRO-313-PRO-199-R01-CANCELACION-2026-11-20
 * + complemento vinculante del JSON completo del 20/11/2026). Casos P313-* sobre funciones PURAS reales (eventos-fe.ts, documentos-tabla.ts), sobre conEventosFe (shared.ts) con base
 * simulada y sobre el texto fuente de la pantalla/modal (React y navegador NO se renderizan aquí).
 * ESCRITOS, NO EJECUTADOS (sin tests, lint, typecheck, build, CI manual, SQL, API, VM ni navegador). Datos sintéticos: el CDC es un marcador documental, no un CDC real.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { estadoPrincipalFila, eventosFila, SIN_INFORMACION_EVENTOS } from "@/lib/facturacion/documentos-tabla";
import {
  aprobacionCandidataDeRetorno,
  aprobacionOficialDocumento,
  CANCELACION_FE_OPERATIVA,
  contextoCancelacionDocumento,
  elegibilidadCancelacionFe,
  eventosDeRespuesta,
  fechaEvento,
  fechaGatewayEstricta,
  FORMATO_DMY,
  FORMATO_FECHA_CONSULTA,
  FORMATO_YMD,
  leerEventos,
  MOTIVO_SIN_APROBACION_OFICIAL,
  PLAZO_CANCELACION_MS,
  proyectarEventosFe,
  textoFechaGateway,
  validarSolicitudCancelacion,
  type ContextoCancelacion,
  type LecturaConsulta,
} from "@/lib/facturacion/eventos-fe";
import { limpiarTexto } from "@/lib/facturacion/gateway";
import { conEventosFe, PROYECCION_EVENTOS_NO_LEIDA, SQL_CONEXIONES_ENVIO, SQL_LECTURAS_EVENTOS_FE } from "@/lib/facturacion/shared";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");
const sinComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const sinLiterales = (t: string) => t.replace(/`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"/g, '""');

/** Marcador documental (no es un CDC real ni válido). */
const CDC = "<CDC_DEL_DOCUMENTO>";
const CONEXION = { host: "gateway.ejemplo.test", credencialRef: "NEXIT_DB", credencialesVersion: 3, origenCredenciales: "BASE" };

/** JSON completo acreditado (20/11/2026) con el CDC sustituido por el marcador. */
const JSON_COMPLETO = {
  status: "success",
  response: {
    Estado: "Aprobado",
    FechaRegistro: "20-11-2026 12:13:00",
    DE: {
      CDC,
      FechaFirma: "20-11-2026 12:12:30",
      FechaEnvio: "2026-11-20 12:13:05",
      Retorno: { FechaRetorno: "20-11-2026 12:13:10", CodRespuesta: "0260", Mensaje: "Aprobado" },
      Evento: [
        { estado: "Rechazado", motivo: "TESTE MAGNO", detalle: "Error Inesperado", fecha_creacion: "Fecha inválida" },
        { estado: "Rechazado", motivo: "teste magno", detalle: "Error Inesperado", fecha_creacion: "Fecha inválida" },
        { estado: "Aprobado", motivo: "prueba Magno", detalle: "Evento registrado correctamente", fecha_creacion: "Fecha inválida" },
      ],
    },
  },
};
const RETORNO = JSON_COMPLETO.response.DE.Retorno;
const EVENTOS = JSON_COMPLETO.response.DE.Evento;
const SOLO_RECHAZO = [EVENTOS[0]];

const lectura = (p: Partial<LecturaConsulta> = {}): LecturaConsulta => ({ intentoId: "00000000-0000-4000-8000-000000000001", creadoAt: "2026-11-20T15:20:00.000Z", cdc: CDC, evento: EVENTOS, retorno: RETORNO, continuidad: "MISMA", ...p });
const NO_ACREDITADO = contextoCancelacionDocumento();
const ACREDITADO: ContextoCancelacion = { acreditado: true, fuente: "solicitud de cancelación propia registrada y correlacionada (sintética)" };

export async function verificarCasosEventosFePro313(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, condicion: boolean) => igual(nombre, condicion, true);

  // ══ P313-01 Ruta exacta response.DE.Evento y formas ══════════════════════════════════════════════════════════════════════════════════════
  igual("P313-01a JSON completo: response.DE.Evento leído con las TRES ocurrencias en el orden recibido (dos Rechazado, una Aprobado), motivos literales sin unificar mayúsculas",
    eventosDeRespuesta(JSON_COMPLETO).eventos.map((e) => [e.posicion, e.clase, e.estado, e.motivo, e.detalle, e.fecha]),
    [[0, "RECHAZADO", "Rechazado", "TESTE MAGNO", "Error Inesperado", null], [1, "RECHAZADO", "Rechazado", "teste magno", "Error Inesperado", null], [2, "APROBADO", "Aprobado", "prueba Magno", "Evento registrado correctamente", null]]);
  igual("P313-01b ausente ≠ vacío: sin clave / null = AUSENTE; [] = VACIO; objeto o texto = NO_INTERPRETABLE; elemento no objeto = DESCONOCIDO (no se descarta)",
    [leerEventos(undefined).forma, leerEventos(null).forma, leerEventos([]).forma, leerEventos({ estado: "Aprobado" }).forma, leerEventos("Aprobado").forma, leerEventos(["x", 3]).eventos.map((e) => e.clase)],
    ["AUSENTE", "AUSENTE", "VACIO", "NO_INTERPRETABLE", "NO_INTERPRETABLE", ["DESCONOCIDO", "DESCONOCIDO"]]);
  igual("P313-01c solo la ruta exacta: Evento en response (no en DE), «Eventos» plural o evidencia truncada = AUSENTE",
    [eventosDeRespuesta({ response: { Evento: EVENTOS } }).forma, eventosDeRespuesta({ response: { DE: { Eventos: EVENTOS } } }).forma, eventosDeRespuesta({ truncado: true }).forma], ["AUSENTE", "AUSENTE", "AUSENTE"]);
  igual("P313-01d estados literales EXACTOS: «aprobado», «APROBADO», «Aprobado » u otro texto = DESCONOCIDO, mostrados literal (sin inventar estados)",
    leerEventos([{ estado: "aprobado" }, { estado: "APROBADO" }, { estado: "Aprobado " }, { estado: "Pendiente" }, { estado: 1 }]).eventos.map((e) => [e.clase, e.estado]),
    [["DESCONOCIDO", "aprobado"], ["DESCONOCIDO", "APROBADO"], ["DESCONOCIDO", "Aprobado"], ["DESCONOCIDO", "Pendiente"], ["DESCONOCIDO", null]]);
  {
    const largo = "x".repeat(400);
    const e = leerEventos([{ estado: "Rechazado", motivo: "Bearer abcdefghijklmnop\u0007 fin", detalle: largo }], limpiarTexto).eventos[0];

    cierto("P313-01e motivo/detalle saneados (secretos con limpiarTexto, sin caracteres de control) y acotados a 300 caracteres; React los escapa al mostrar (sin HTML)",
      e.motivo === "[omitido] fin" && e.detalle !== null && Array.from(e.detalle).length === 301 && e.detalle.endsWith("…"));
  }

  // ══ P313-02 Fechas: formatos acreditados, estrictos, sin zona ═══════════════════════════════════════════════════════════════════════════
  igual("P313-02a formatos acreditados por campo: FechaRegistro/FechaFirma/FechaRetorno DD-MM-YYYY HH:mm:ss; FechaEnvio YYYY-MM-DD HH:mm:ss",
    FORMATO_FECHA_CONSULTA, { FechaRegistro: FORMATO_DMY, FechaFirma: FORMATO_DMY, FechaEnvio: FORMATO_YMD, FechaRetorno: FORMATO_DMY });
  igual("P313-02b validación estricta: calendario real, sin espacios extra, sin zona ni milisegundos, sin intercambiar formatos",
    [fechaGatewayEstricta("20-11-2026 12:13:10", FORMATO_DMY)?.visible, fechaGatewayEstricta("2026-11-20 12:13:05", FORMATO_YMD)?.visible, fechaGatewayEstricta("31-02-2026 10:00:00", FORMATO_DMY),
      fechaGatewayEstricta("20-11-2026 24:00:00", FORMATO_DMY), fechaGatewayEstricta("20-11-2026 12:13:10 ", FORMATO_DMY), fechaGatewayEstricta("2026-11-20T12:13:05Z", FORMATO_YMD),
      fechaGatewayEstricta("2026-11-20 12:13:05", FORMATO_DMY), fechaGatewayEstricta("29-02-2028 00:00:00", FORMATO_DMY)?.visible, fechaGatewayEstricta("29-02-2026 00:00:00", FORMATO_DMY)],
    ["20/11/2026 12:13:10", "20/11/2026 12:13:05", null, null, null, null, null, "29/02/2028 00:00:00", null]);
  igual("P313-02c fecha_creacion «Fecha inválida» (o cualquier texto no acreditado) = Sin información (null); nunca la fecha actual",
    [fechaEvento("Fecha inválida"), fechaEvento(""), fechaEvento(null), fechaEvento("20/11/2026"), fechaEvento("20-11-2026 12:13:10")], [null, null, null, null, "20/11/2026 12:13:10"]);
  igual("P313-02d (F014) presentación de fecha_firma_gateway real DD-MM-YYYY HH:mm:ss y de FechaEnvio; otro texto literal; sin conversión de zona",
    [textoFechaGateway("20-11-2026 12:12:30"), textoFechaGateway("2026-11-20 12:13:05"), textoFechaGateway("Fecha inválida"), textoFechaGateway(null)], ["20/11/2026 12:12:30", "20/11/2026 12:13:05", "Fecha inválida", "—"]);
  igual("P313-02e FechaRetorno candidata SOLO con CodRespuesta 0260 literal y formato estricto; FechaRegistro/Firma/Envio nunca la sustituyen",
    [aprobacionCandidataDeRetorno(RETORNO), aprobacionCandidataDeRetorno({ ...RETORNO, CodRespuesta: "0261" }), aprobacionCandidataDeRetorno({ ...RETORNO, FechaRetorno: "Fecha inválida" }), aprobacionCandidataDeRetorno(null)],
    ["20/11/2026 12:13:10", null, null, null]);

  // ══ P313-03 Caso de aceptación obligatorio (JSON completo) ═══════════════════════════════════════════════════════════════════════════════
  {
    const sinTipo = proyectarEventosFe([lectura()], CDC, NO_ACREDITADO);

    igual("P313-03a tipo NO acreditado (vigente): tres eventos visibles, el Aprobado se muestra literal, EN REVISIÓN y bloquea nueva solicitud; NO se proyecta Cancelado",
      [sinTipo.situacion, sinTipo.eventos.length, sinTipo.bloqueaSolicitud, sinTipo.texto, /no informa el tipo ni el identificador del evento/.test(sinTipo.detalle), /sin cambiar el estado fiscal ni el stock/.test(sinTipo.detalle)],
      ["EN_REVISION", 3, true, "3 eventos: 1 aprobado, 2 rechazados (en revisión)", true, true]);
    igual("P313-03b con tipo NO acreditado el estado principal sigue «Aprobado» (response.Estado y Retorno 0260 de la FE original)",
      estadoPrincipalFila({ estadoLocal: "ENVIADO", estadoSifen: "APROBADO", eventosFe: sinTipo }).texto, "Aprobado");

    const cancelado = proyectarEventosFe([lectura()], CDC, ACREDITADO);
    const principal = estadoPrincipalFila({ estadoLocal: "ENVIADO", estadoSifen: "APROBADO", eventosFe: cancelado });

    igual("P313-03c contexto de cancelación acreditado + correlación (CDC literal y misma cuenta): proyección Cancelado aunque response.Estado siga Aprobado; los tres eventos se conservan",
      [cancelado.situacion, cancelado.eventos.map((e) => e.clase), cancelado.bloqueaSolicitud, principal.texto, principal.tono, principal.secundario],
      ["CANCELADO", ["RECHAZADO", "RECHAZADO", "APROBADO"], true, "Cancelado", "anulado", "Aprobación original conservada"]);
    igual("P313-03d cancelado: la elegibilidad impide otra solicitud («Cancelado») y no hay POST",
      [elegibilidadCancelacionFe({ tipo: "FE", estadoSifen: "APROBADO", puedeEditar: true, proyeccion: cancelado, aprobacion: aprobacionOficialDocumento(cancelado), ahoraMs: 0 }).corto, CANCELACION_FE_OPERATIVA], ["Cancelado", false]);
    igual("P313-03e FechaRetorno se informa como CANDIDATA (evidencia) y no habilita el plazo: aprobación oficial NO acreditada",
      [cancelado.aprobacionCandidata, aprobacionOficialDocumento(cancelado)], ["20/11/2026 12:13:10", { acreditada: false, candidata: "20/11/2026 12:13:10" }]);
  }

  // ══ P313-04 ACK, rechazos, vacío, sin lectura ═════════════════════════════════════════════════════════════════════════════════════════════
  igual("P313-04a ACK 200 {status:success, message:Evento recibido correctamente} no es una consulta: sin Evento = AUSENTE, no cancela ni bloquea",
    [eventosDeRespuesta({ status: "success", message: "Evento recibido correctamente" }).forma, proyectarEventosFe([], CDC, ACREDITADO).situacion], ["AUSENTE", "SIN_INFORMACION"]);
  {
    const r = proyectarEventosFe([lectura({ evento: SOLO_RECHAZO })], CDC, ACREDITADO);

    igual("P313-04b FE aprobada + evento Rechazado con fecha inválida: la FE sigue Aprobada, el rechazo se muestra aparte, sin bloquear ni mutar",
      [r.situacion, r.texto, r.bloqueaSolicitud, r.eventos[0].fecha, estadoPrincipalFila({ estadoLocal: "ENVIADO", estadoSifen: "APROBADO", eventosFe: r }).texto], ["SOLO_RECHAZADOS", "1 evento: 1 rechazado", false, null, "Aprobado"]);
  }
  igual("P313-04c lista vacía acreditada = «Sin eventos informados»; sin ninguna lectura = «Sin información de eventos» (no se afirma ausencia)",
    [proyectarEventosFe([lectura({ evento: [] })], CDC, NO_ACREDITADO).texto, proyectarEventosFe([lectura({ evento: undefined })], CDC, NO_ACREDITADO).texto], ["Sin eventos informados", SIN_INFORMACION_EVENTOS]);
  igual("P313-04d evento con resultado desconocido o Evento no interpretable: en revisión y bloquea (no se duplica la solicitud)",
    [proyectarEventosFe([lectura({ evento: [{ estado: "Pendiente" }] })], CDC, ACREDITADO).bloqueaSolicitud, proyectarEventosFe([lectura({ evento: { estado: "Aprobado" } })], CDC, ACREDITADO).situacion], [true, "EN_REVISION"]);

  // ══ P313-05 Correlación (identidad, CDC, cuenta) y ambigüedad ═══════════════════════════════════════════════════════════════════════════
  igual("P313-05a sin correlación NO hay Cancelado aunque el tipo esté acreditado: CDC distinto, CDC omitido por saneamiento, CDC ausente, documento sin CDC, cuenta distinta o no comprobada",
    [proyectarEventosFe([lectura({ cdc: "<OTRO_CDC>" })], CDC, ACREDITADO).situacion, proyectarEventosFe([lectura({ cdc: "[omitido]" })], "[omitido]", ACREDITADO).situacion,
      proyectarEventosFe([lectura({ cdc: undefined })], CDC, ACREDITADO).situacion, proyectarEventosFe([lectura()], null, ACREDITADO).situacion,
      proyectarEventosFe([lectura({ continuidad: "DISTINTA" })], CDC, ACREDITADO).situacion, proyectarEventosFe([lectura({ continuidad: "SIN_REFERENCIA" })], CDC, ACREDITADO).situacion],
    ["EN_REVISION", "EN_REVISION", "EN_REVISION", "EN_REVISION", "EN_REVISION", "EN_REVISION"]);
  igual("P313-05b el motivo de revisión dice POR QUÉ no se acredita (CDC / cuenta), sin cambiar estado fiscal",
    [/CDC informado en la consulta no es el registrado/.test(proyectarEventosFe([lectura({ cdc: "<OTRO_CDC>" })], CDC, ACREDITADO).detalle), /misma cuenta del envío/.test(proyectarEventosFe([lectura({ continuidad: "SIN_REFERENCIA" })], CDC, ACREDITADO).detalle)], [true, true]);
  igual("P313-05c dos eventos Aprobado (o uno Aprobado + uno desconocido) en la misma lectura: cancelación ambigua, sin Cancelado; no se elige por posición ni por motivo",
    [proyectarEventosFe([lectura({ evento: [EVENTOS[2], EVENTOS[2]] })], CDC, ACREDITADO).situacion, proyectarEventosFe([lectura({ evento: [EVENTOS[2], { estado: "Otro" }] })], CDC, ACREDITADO).situacion],
    ["EN_REVISION", "EN_REVISION"]);
  igual("P313-05d el motivo coincidente no es prueba: un evento Aprobado con el mismo motivo de una solicitud no acredita tipo sin contexto",
    proyectarEventosFe([lectura({ evento: [{ estado: "Aprobado", motivo: "prueba Magno" }] })], CDC, NO_ACREDITADO).situacion, "EN_REVISION");

  // ══ P313-06 Historial, orden y no regresión ══════════════════════════════════════════════════════════════════════════════════════════════
  {
    const antigua = lectura({ intentoId: "00000000-0000-4000-8000-000000000001", creadoAt: "2026-11-20T15:20:00.000Z" });
    const posteriorSinAprobado = lectura({ intentoId: "00000000-0000-4000-8000-000000000002", creadoAt: "2026-11-20T16:00:00.000Z", evento: SOLO_RECHAZO });
    const posteriorAusente = lectura({ intentoId: "00000000-0000-4000-8000-000000000003", creadoAt: "2026-11-20T17:00:00.000Z", evento: undefined });
    const p = proyectarEventosFe([posteriorAusente, antigua, posteriorSinAprobado], CDC, ACREDITADO);

    igual("P313-06a no regresión: una cancelación acreditada en una lectura anterior se conserva aunque consultas posteriores no la repitan o no informen Evento; se avisa",
      [p.situacion, p.lectura?.intentoId, p.avisos.length, p.avisos.some((a) => /no repite el evento de cancelación aprobado/.test(a)), p.avisos.some((a) => /clave Evento ausente/.test(a))],
      ["CANCELADO", "00000000-0000-4000-8000-000000000001", 2, true, true]);

    const q = proyectarEventosFe([antigua, posteriorSinAprobado], CDC, NO_ACREDITADO);

    igual("P313-06b sin acreditación se presenta la lectura MÁS RECIENTE con lista, independientemente del orden de entrada (no se toma el último elemento del array)",
      [q.lectura?.intentoId, q.situacion], ["00000000-0000-4000-8000-000000000002", "SOLO_RECHAZADOS"]);
  }

  // ══ P313-07 Elegibilidad 48 h (preparada, no operativa) ═════════════════════════════════════════════════════════════════════════════════
  {
    const rechazos = proyectarEventosFe([lectura({ evento: SOLO_RECHAZO })], CDC, NO_ACREDITADO);
    const base = { tipo: "FE", estadoSifen: "APROBADO", puedeEditar: true, proyeccion: rechazos };
    const T = Date.UTC(2026, 10, 20, 15, 13, 10);
    const e = (p: Partial<Parameters<typeof elegibilidadCancelacionFe>[0]>) => elegibilidadCancelacionFe({ ...base, aprobacion: { acreditada: true, instanteMs: T }, ahoraMs: T, ...p });

    igual("P313-07a vigente: aprobación oficial NO acreditada ⇒ no disponible con ese motivo exacto (FechaRetorno candidata no habilita el plazo)",
      [elegibilidadCancelacionFe({ ...base, aprobacion: aprobacionOficialDocumento(rechazos), ahoraMs: T }).disponible, elegibilidadCancelacionFe({ ...base, aprobacion: aprobacionOficialDocumento(rechazos), ahoraMs: T }).motivo],
      [false, `Cancelación no disponible: ${MOTIVO_SIN_APROBACION_OFICIAL}.`]);
    igual("P313-07b plazo EXACTO 172800 s inclusivo desde la aprobación oficial: en el límite sigue en plazo (bloquea el gate de integración); 1 ms después = Plazo vencido",
      [PLAZO_CANCELACION_MS, e({ ahoraMs: T + PLAZO_CANCELACION_MS }).corto, e({ ahoraMs: T + PLAZO_CANCELACION_MS }).vencimientoMs === T + PLAZO_CANCELACION_MS, e({ ahoraMs: T + PLAZO_CANCELACION_MS + 1 }).corto],
      [172_800_000, "No disponible", true, "Plazo vencido"]);
    igual("P313-07c dentro de plazo solo queda disponible si la integración es operativa (hoy false); aprobación futura o inválida bloquea",
      [e({}).disponible, e({ operativa: true }).disponible, e({ aprobacion: { acreditada: true, instanteMs: T + 1 } }).disponible, e({ aprobacion: { acreditada: true, instanteMs: Number.NaN } }).disponible, e({ ahoraMs: Number.NaN, operativa: true }).disponible],
      [false, true, false, false, false]);
    igual("P313-07d guardas previas: NCE no aplica; sin permiso de edición; FE no aprobada (pendiente/rechazada); sin lectura de eventos; evento en revisión",
      [e({ tipo: "NCE" }).aplica, e({ puedeEditar: false, operativa: true }).disponible, e({ estadoSifen: "PENDIENTE", operativa: true }).disponible, e({ estadoSifen: "RECHAZADO", operativa: true }).disponible,
        e({ proyeccion: null, operativa: true }).disponible, e({ proyeccion: proyectarEventosFe([lectura()], CDC, NO_ACREDITADO), operativa: true }).corto],
      [false, false, false, false, false, "En revisión"]);
    igual("P313-07e consulta posterior al plazo: la lectura de eventos sigue (proyección) aunque no se pueda iniciar una cancelación nueva",
      [e({ ahoraMs: T + PLAZO_CANCELACION_MS + 1 }).corto, rechazos.eventos.length], ["Plazo vencido", 1]);
  }

  // ══ P313-08 Formulario preparado ═════════════════════════════════════════════════════════════════════════════════════════════════════════
  igual("P313-08 motivo obligatorio (no vacío tras quitar espacios, sin caracteres de control) y confirmación explícita; sin límites de longitud inventados",
    [validarSolicitudCancelacion({ motivo: "", confirmado: true }), validarSolicitudCancelacion({ motivo: "   ", confirmado: true }), validarSolicitudCancelacion({ motivo: "Error en emisión", confirmado: false }),
      validarSolicitudCancelacion({ motivo: "a\u0000b", confirmado: true }), validarSolicitudCancelacion({ motivo: `  ${"x".repeat(900)}  `, confirmado: true })].map((v) => (v.valida ? v.motivo.length : v.errores)),
    [["Indique el motivo de la cancelación."], ["Indique el motivo de la cancelación."], ["Confirme explícitamente la solicitud de cancelación."], ["El motivo contiene caracteres no permitidos."], 900]);

  // ══ P313-09 Columna Eventos ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  {
    const rechazos = proyectarEventosFe([lectura({ evento: SOLO_RECHAZO })], CDC, NO_ACREDITADO);
    const eleg = elegibilidadCancelacionFe({ tipo: "FE", estadoSifen: "APROBADO", puedeEditar: true, proyeccion: rechazos, aprobacion: aprobacionOficialDocumento(rechazos), ahoraMs: 0 });
    const f = eventosFila({ estadoSifen: "APROBADO", eventosFe: rechazos }, eleg);

    igual("P313-09a FE: resumen de eventos separado del estado de la FE; «Cancelación: No disponible» con la razón real; Inutilización sigue no disponible",
      [f.registrado, f.operaciones.map((o) => `${o.nombre}: ${o.estado}`), /^Cancelación no disponible: la fecha y hora oficial de aprobación SIFEN no está acreditada/.test(f.operacion), /Inutilización no disponible/.test(f.operacion)],
      ["1 evento: 1 rechazado", ["Cancelación: No disponible", "Inutilización: No disponible"], true, true]);
    igual("P313-09b NCE: la cancelación FE no aplica (solo se lista Inutilización); estado fiscal Cancelado informado por la API sigue teniendo prioridad",
      [eventosFila({ estadoSifen: "APROBADO" }, elegibilidadCancelacionFe({ tipo: "NCE", estadoSifen: "APROBADO", puedeEditar: true, proyeccion: null, aprobacion: { acreditada: false, candidata: null }, ahoraMs: 0 })).operaciones.map((o) => o.nombre),
        eventosFila({ estadoSifen: "CANCELADO", eventosFe: rechazos }).registrado], [["Inutilización"], "Cancelado (estado fiscal informado por la API)"]);
  }

  // ══ P313-10 Servidor: lectura acotada por empresa/documento, sin escritura; fallo de lectura conservador ═════════════════════════════════
  {
    cierto("P313-10a SQL de lecturas: solo SELECT, empresa_id = $1, ids de la página ($2), documento FE de la MISMA empresa, solo CONSULTA con resultado OK; rutas contractuales exactas",
      !/\b(INSERT|UPDATE|DELETE|ALTER|CREATE)\b/i.test(SQL_LECTURAS_EVENTOS_FE + SQL_CONEXIONES_ENVIO) && /i\.empresa_id = \$1 AND i\.documento_id = ANY\(\$2::uuid\[\]\)/.test(SQL_LECTURAS_EVENTOS_FE) &&
      /JOIN documentos_electronicos d ON d\.empresa_id = i\.empresa_id AND d\.id = i\.documento_id/.test(SQL_LECTURAS_EVENTOS_FE) && /d\.tipo = 'FE' AND i\.tipo = 'CONSULTA' AND i\.resultado = 'OK'/.test(SQL_LECTURAS_EVENTOS_FE) &&
      /'\{response,DE,CDC\}'/.test(SQL_LECTURAS_EVENTOS_FE) && /'\{response,DE,Evento\}'/.test(SQL_LECTURAS_EVENTOS_FE) && /'\{response,DE,Retorno\}'/.test(SQL_LECTURAS_EVENTOS_FE) &&
      /i\.empresa_id = \$1 AND i\.documento_id = ANY\(\$2::uuid\[\]\) AND i\.tipo = 'ENVIO'/.test(SQL_CONEXIONES_ENVIO));

    const llamadas: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      async query(sql: string, params: unknown[] = []) {
        llamadas.push({ sql, params });
        if (sql === SQL_LECTURAS_EVENTOS_FE) return { rows: [{ documentoId: "fe-1", intentoId: "i-1", creadoAt: "2026-11-20T15:20:00.000Z", conexion: CONEXION, cdc: CDC, evento: EVENTOS, retorno: RETORNO }] };
        if (sql === SQL_CONEXIONES_ENVIO) return { rows: [{ documentoId: "fe-1", conexion: CONEXION }] };

        throw new Error("consulta inesperada");
      },
    } as never;
    const filas = await conEventosFe(db, "empresa-A", [{ id: "fe-1", tipo: "FE", cdc: CDC }, { id: "nce-1", tipo: "NCE", cdc: CDC }, { id: "fe-2", tipo: "FE", cdc: null }]);

    igual("P313-10b conEventosFe: solo ids FE de la página y la empresa de la sesión; NCE sin proyección; FE sin lecturas = sin información; continuidad MISMA calculada del envío",
      [llamadas.map((l) => l.params), (filas[0].eventosFe as { situacion: string }).situacion, "eventosFe" in filas[1], (filas[2].eventosFe as { situacion: string }).situacion],
      [[["empresa-A", ["fe-1", "fe-2"]], ["empresa-A", ["fe-1", "fe-2"]]], "EN_REVISION", false, "SIN_INFORMACION"]);

    const caida = await conEventosFe({ async query() { throw new Error("sin conexión"); } } as never, "empresa-A", [{ id: "fe-1", tipo: "FE", cdc: CDC }]);
    const sinFe = await conEventosFe({ async query() { throw new Error("no debe consultar"); } } as never, "empresa-A", [{ id: "nce-1", tipo: "NCE" }]);

    igual("P313-10c si el historial no se puede leer: el listado sigue, sin información y BLOQUEO de nueva solicitud (resultado desconocido); sin FE no se consulta nada",
      [caida[0].eventosFe === PROYECCION_EVENTOS_NO_LEIDA, PROYECCION_EVENTOS_NO_LEIDA.bloqueaSolicitud, sinFe], [true, true, [{ id: "nce-1", tipo: "NCE" }]]);
  }

  // ══ P313-11 Fuente: sin POST, sin rutas nuevas, sin stock, sin mutar estado ════════════════════════════════════════════════════════════
  {
    const pagina = leer("app/(private)/documentos/page.tsx");
    const modal = leer("app/(private)/documentos/cancelacion-modal.tsx");
    const modulo = leer("lib/facturacion/eventos-fe.ts");
    const shared = leer("lib/facturacion/shared.ts");

    cierto("P313-11a sin envío de cancelación: ninguna ruta/fetch de cancelación en pantalla ni modal; «Confirmar cancelación» siempre deshabilitado y sin manejador; gate operativo en false",
      !/\/api\/[^`"]*(cancel|inutiliz|evento)/i.test(pagina + modal) && !/fetch\(/.test(modal) && /<button type="button" className=\{ui\.primaryButton\} disabled>Confirmar cancelación<\/button>/.test(modal) &&
      /export const CANCELACION_FE_OPERATIVA = false as const;/.test(modulo) && !/cancelacion_dte/.test(sinComentarios(shared)));
    cierto("P313-11b el módulo de eventos es puro y no toca stock/inventario ni escribe estado (sin node:, sin fetch, sin SQL)",
      !/stock|inventario/i.test(sinLiterales(sinComentarios(modulo))) && !/from "node:|fetch\(|SELECT |UPDATE |INSERT /.test(sinComentarios(modulo)));
    cierto("P313-11c la pantalla calcula la elegibilidad con el instante del SERVIDOR (generadoMs), no con el reloj del navegador; «Cancelar documento» solo abre la modal si está disponible",
      /ahoraMs: datos\?\.generadoMs \?\? Number\.NaN/.test(pagina) && !/Date\.now\(\)/.test(pagina) && /disponible=\{cancelacion\.disponible\} motivo=\{eventos\.operacion\} alActivar=\{\(\) => setCancelando\(d\)\}/.test(pagina) && /generadoMs: Date\.now\(\)/.test(shared));
    cierto("P313-11d segunda capa: eventos en lista ordenada con estado, motivo, detalle y fecha («Sin información» si falta), separados del estado de la FE; FechaRetorno solo como candidata",
      /<ol className=\{estilos\.listaEventos\}>/.test(pagina) && /Motivo: \{e\.motivo \?\? "Sin información"\}/.test(pagina) && /Fecha: \{e\.fecha \?\? "Sin información"\}/.test(pagina) && /candidata, sin confirmar significado ni zona horaria/.test(pagina));
    cierto("P313-11e modal: diálogo accesible, Volver sin efectos, motivo obligatorio y confirmación explícita; Escape cierra; foco atrapado",
      /role="dialog" aria-modal="true" aria-labelledby="cancelacion-titulo"/.test(modal) && />Volver<\/button>/.test(modal) && /validarSolicitudCancelacion\(\{ motivo, confirmado \}\)/.test(modal) && /e\.key === "Escape"/.test(modal) && /e\.key !== "Tab"/.test(modal));
  }

  return fallos;
}
