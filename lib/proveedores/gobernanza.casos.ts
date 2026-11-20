/**
 * Casos de regresión de la gobernanza de Proveedores (DEC-PRV-01 a 10): elegibilidad, transiciones de homologación, riesgo manual,
 * bloqueo con motivo, aprobación bancaria y verificaciones estáticas de que NINGÚN camino común puede cambiar estos datos.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { columnasDeRevision, planDeResolucion } from "@/lib/proveedores/cuentas";
import { ErrorValidacion } from "@/lib/proveedores/errores";
import { estadoOperativo, homologacionVencida, permisoDeAccion, resolverAccion, type AccionGobernanza, type EstadoGobernanza } from "@/lib/proveedores/gobernanza";
import { normalizarProveedor } from "@/lib/proveedores/normalizar";
import { sincronizarHijos } from "@/lib/proveedores/sincronizar";

const HOY = "2026-10-11";
const EMPRESA = "11111111-1111-4111-8111-111111111111";
const PROV = "22222222-2222-4222-8222-222222222222";
const USUARIO = "33333333-3333-4333-8333-333333333333";
const CUENTA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const estado = (extra: Partial<EstadoGobernanza> = {}): EstadoGobernanza => ({
  activo: true,
  bloqueado: false,
  motivoBloqueo: "",
  estadoHomologacion: "HOMOLOGADO",
  fechaHomologacion: "2026-01-01",
  fechaVencimientoHomologacion: "2026-12-31",
  nivelRiesgo: "NO_EVALUADO",
  calificacionActual: null,
  ...extra,
});

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);

    return statSync(ruta).isDirectory() ? archivos(ruta) : [ruta];
  });
}

export async function verificarCasosGobernanza(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const error = (fn: () => unknown): ErrorValidacion | null => {
    try {
      fn();
      return null;
    } catch (e) {
      return e instanceof ErrorValidacion ? e : null;
    }
  };
  const accion = (a: AccionGobernanza, e: EstadoGobernanza, entrada: Record<string, unknown> = {}) => resolverAccion(a, e, entrada, HOY);

  // ── Elegibilidad (DEC-PRV-01 y 03)
  cierto("elegible: activo, no bloqueado, homologado, vigente", estadoOperativo(estado(), HOY).elegible);
  cierto("elegible: sin vencimiento", estadoOperativo(estado({ fechaVencimientoHomologacion: "" }), HOY).elegible);
  cierto("elegible: vence HOY (vale hasta el final del día)", estadoOperativo(estado({ fechaVencimientoHomologacion: HOY }), HOY).elegible);
  cierto("no elegible: venció ayer", !estadoOperativo(estado({ fechaVencimientoHomologacion: "2026-10-10" }), HOY).elegible);
  cierto("vencida: estado HOMOLOGADO con fecha pasada", homologacionVencida(estado({ fechaVencimientoHomologacion: "2026-10-10" }), HOY));
  cierto("vencida: estado almacenado VENCIDO", homologacionVencida(estado({ estadoHomologacion: "VENCIDO" }), HOY));
  cierto("no vencida si no está homologado", !homologacionVencida(estado({ estadoHomologacion: "PENDIENTE", fechaVencimientoHomologacion: "2020-01-01" }), HOY));
  cierto("no elegible: bloqueado", !estadoOperativo(estado({ bloqueado: true, motivoBloqueo: "x" }), HOY).elegible);
  cierto("no elegible: inactivo", !estadoOperativo(estado({ activo: false }), HOY).elegible);
  for (const e of ["PENDIENTE", "EN_EVALUACION", "RECHAZADO", "SUSPENDIDO", "VENCIDO"]) {
    cierto(`no elegible: ${e}`, !estadoOperativo(estado({ estadoHomologacion: e }), HOY).elegible);
  }
  cierto("los motivos se informan", estadoOperativo(estado({ activo: false, bloqueado: true }), HOY).motivos.length === 2);
  cierto("homologación vencida pide renovación", estadoOperativo(estado({ fechaVencimientoHomologacion: "2026-10-10" }), HOY).motivos.some((m) => /renovaci/.test(m)));

  // ── Permisos por acción (DEC-PRV-02/06/10)
  for (const a of ["EN_EVALUACION", "HOMOLOGAR", "RECHAZAR", "SUSPENDER", "RENOVAR"] as const) igual(`permiso ${a}`, permisoDeAccion(a), "HOMOLOGAR");
  igual("permiso EVALUAR_RIESGO", permisoDeAccion("EVALUAR_RIESGO"), "EVALUAR_RIESGO");
  igual("permiso BLOQUEAR", permisoDeAccion("BLOQUEAR"), "BLOQUEAR");
  igual("permiso DESBLOQUEAR", permisoDeAccion("DESBLOQUEAR"), "BLOQUEAR");

  // ── Homologación
  const pendiente = estado({ estadoHomologacion: "PENDIENTE", fechaHomologacion: "", fechaVencimientoHomologacion: "" });
  const h = accion("HOMOLOGAR", pendiente, { justificacion: "Documentación completa", fechaVencimiento: "2027-10-11" });

  igual("homologar: estado", h.cambios.estado_homologacion, "HOMOLOGADO");
  igual("homologar: fecha la fija el servidor (hoy)", h.cambios.fecha_homologacion, HOY);
  igual("homologar: vencimiento", h.cambios.fecha_vencimiento_homologacion, "2027-10-11");
  igual("homologar: evento con anterior y nuevo", [h.evento.accion, (h.evento.anterior as { estadoHomologacion: string }).estadoHomologacion, (h.evento.nuevo as { estadoHomologacion: string }).estadoHomologacion], ["HOMOLOGACION_APROBADA", "PENDIENTE", "HOMOLOGADO"]);
  igual("homologar: justificación auditada", h.evento.justificacion, "Documentación completa");
  igual("homologar sin vencimiento → null", accion("HOMOLOGAR", pendiente, { justificacion: "ok" }).cambios.fecha_vencimiento_homologacion, null);
  igual("homologar sin justificación: campo", error(() => accion("HOMOLOGAR", pendiente, {}))?.campo, "justificacion");
  igual("homologar con vencimiento pasado: campo", error(() => accion("HOMOLOGAR", pendiente, { justificacion: "x", fechaVencimiento: "2026-10-10" }))?.campo, "fechaVencimiento");
  igual("homologar con fecha irreal", error(() => accion("HOMOLOGAR", pendiente, { justificacion: "x", fechaVencimiento: "2026-02-30" }))?.campo, "fechaVencimiento");
  igual("homologar un homologado vigente → 409", error(() => accion("HOMOLOGAR", estado(), { justificacion: "x" }))?.estado, 409);
  igual("homologar una vencida debe ser RENOVAR (409)", error(() => accion("HOMOLOGAR", estado({ fechaVencimientoHomologacion: "2026-10-10" }), { justificacion: "x" }))?.estado, 409);
  igual("justificación de 1001 caracteres", error(() => accion("HOMOLOGAR", pendiente, { justificacion: "x".repeat(1001) }))?.campo, "justificacion");
  cierto("homologar desde EN_EVALUACION", error(() => accion("HOMOLOGAR", estado({ estadoHomologacion: "EN_EVALUACION" }), { justificacion: "x" })) === null);
  cierto("homologar desde SUSPENDIDO (reactivación)", error(() => accion("HOMOLOGAR", estado({ estadoHomologacion: "SUSPENDIDO" }), { justificacion: "x" })) === null);
  igual("homologar un RECHAZADO exige volver a evaluación (409)", error(() => accion("HOMOLOGAR", estado({ estadoHomologacion: "RECHAZADO" }), { justificacion: "x" }))?.estado, 409);

  igual("rechazar: estado", accion("RECHAZAR", pendiente, { justificacion: "Sin RUC vigente" }).cambios.estado_homologacion, "RECHAZADO");
  igual("rechazar sin motivo", error(() => accion("RECHAZAR", pendiente, {}))?.campo, "justificacion");
  igual("rechazar un homologado → 409", error(() => accion("RECHAZAR", estado(), { justificacion: "x" }))?.estado, 409);
  igual("suspender: estado", accion("SUSPENDER", estado(), { justificacion: "Incumplimiento" }).cambios.estado_homologacion, "SUSPENDIDO");
  igual("suspender un pendiente → 409", error(() => accion("SUSPENDER", pendiente, { justificacion: "x" }))?.estado, 409);
  igual("en evaluación desde pendiente", accion("EN_EVALUACION", pendiente, { justificacion: "Inicio" }).cambios.estado_homologacion, "EN_EVALUACION");
  igual("en evaluación desde homologado → 409", error(() => accion("EN_EVALUACION", estado(), { justificacion: "x" }))?.estado, 409);

  // ── Renovación (DEC-PRV-03)
  const vencida = estado({ fechaVencimientoHomologacion: "2026-10-10" });
  const r = accion("RENOVAR", vencida, { justificacion: "Renovación anual", fechaVencimiento: "2027-10-10" });

  igual("renovar vencida: nueva fecha y vencimiento", [r.cambios.fecha_homologacion, r.cambios.fecha_vencimiento_homologacion, r.evento.accion], [HOY, "2027-10-10", "HOMOLOGACION_RENOVADA"]);
  igual("renovar exige nuevo vencimiento", error(() => accion("RENOVAR", vencida, { justificacion: "x" }))?.campo, "fechaVencimiento");
  igual("renovar una pendiente → 409", error(() => accion("RENOVAR", pendiente, { justificacion: "x", fechaVencimiento: "2027-10-10" }))?.estado, 409);
  cierto("renovar de forma anticipada (vigente)", error(() => accion("RENOVAR", estado(), { justificacion: "x", fechaVencimiento: "2027-12-31" })) === null);
  cierto("renovar un VENCIDO almacenado", error(() => accion("RENOVAR", estado({ estadoHomologacion: "VENCIDO" }), { justificacion: "x", fechaVencimiento: "2027-12-31" })) === null);

  // ── Riesgo manual (DEC-PRV-10)
  const rg = accion("EVALUAR_RIESGO", estado(), { justificacion: "Auditoría anual", nivelRiesgo: "alto", calificacion: "72.5" });

  igual("riesgo: nivel y nota exactos", [rg.cambios.nivel_riesgo, rg.cambios.calificacion_actual], ["ALTO", "72.50"]);
  igual("riesgo: evento con anterior (NO_EVALUADO) y nuevo", [(rg.evento.anterior as { nivelRiesgo: string }).nivelRiesgo, (rg.evento.nuevo as { nivelRiesgo: string }).nivelRiesgo], ["NO_EVALUADO", "ALTO"]);
  igual("riesgo sin justificación", error(() => accion("EVALUAR_RIESGO", estado(), { nivelRiesgo: "BAJO" }))?.campo, "justificacion");
  igual("riesgo NO_EVALUADO no se asigna", error(() => accion("EVALUAR_RIESGO", estado(), { justificacion: "x", nivelRiesgo: "NO_EVALUADO" }))?.campo, "nivelRiesgo");
  igual("riesgo sin nivel", error(() => accion("EVALUAR_RIESGO", estado(), { justificacion: "x" }))?.campo, "nivelRiesgo");
  igual("nota 100.01 rechazada", error(() => accion("EVALUAR_RIESGO", estado(), { justificacion: "x", nivelRiesgo: "BAJO", calificacion: "100.01" }))?.campo, "calificacion");
  igual("nota 3 decimales rechazada", error(() => accion("EVALUAR_RIESGO", estado(), { justificacion: "x", nivelRiesgo: "BAJO", calificacion: "50.123" }))?.campo, "calificacion");
  igual("nota opcional → null", accion("EVALUAR_RIESGO", estado(), { justificacion: "x", nivelRiesgo: "BAJO" }).cambios.calificacion_actual, null);

  // ── Bloqueo (DEC-PRV-06)
  const b = accion("BLOQUEAR", estado(), { justificacion: "Investigación en curso" });

  igual("bloquear: bloqueado + motivo", [b.cambios.bloqueado, b.cambios.motivo_bloqueo], [true, "Investigación en curso"]);
  igual("bloquear sin motivo", error(() => accion("BLOQUEAR", estado(), {}))?.campo, "justificacion");
  igual("bloquear con motivo en blanco", error(() => accion("BLOQUEAR", estado(), { justificacion: "   " }))?.campo, "justificacion");
  igual("bloquear a un bloqueado → 409", error(() => accion("BLOQUEAR", estado({ bloqueado: true, motivoBloqueo: "x" }), { justificacion: "y" }))?.estado, 409);
  const d = accion("DESBLOQUEAR", estado({ bloqueado: true, motivoBloqueo: "x" }), { justificacion: "Resuelto" });

  igual("desbloquear: limpia bloqueo", [d.cambios.bloqueado, d.cambios.motivo_bloqueo], [false, null]);
  igual("desbloquear audita el motivo anterior", (d.evento.anterior as { motivoBloqueo: string }).motivoBloqueo, "x");
  igual("desbloquear sin motivo", error(() => accion("DESBLOQUEAR", estado({ bloqueado: true, motivoBloqueo: "x" }), {}))?.campo, "justificacion");
  igual("desbloquear a un no bloqueado → 409", error(() => accion("DESBLOQUEAR", estado(), { justificacion: "x" }))?.estado, 409);
  cierto("el bloqueo no cambia la homologación", !("estado_homologacion" in b.cambios));
  cierto("la homologación no toca el bloqueo", !("bloqueado" in h.cambios));

  // ── Aprobación bancaria (DEC-PRV-04 y 07)
  const plan = (dec: unknown, est: string, rev: boolean, motivo?: unknown) => {
    try {
      return planDeResolucion(dec, est, rev, motivo).plan;
    } catch (e) {
      return e instanceof ErrorValidacion ? `ERR:${e.estado}` : "ERR";
    }
  };

  igual("cuenta nueva: aprobar", plan("APROBAR", "PENDIENTE", false), "APROBAR_CUENTA");
  igual("cuenta nueva: rechazar con motivo", plan("RECHAZAR", "PENDIENTE", false, "Datos incorrectos"), "RECHAZAR_CUENTA");
  igual("rechazar sin motivo", plan("RECHAZAR", "PENDIENTE", false), "ERR:400");
  igual("cuenta aprobada con revisión: aprobar", plan("APROBAR", "APROBADA", true), "APROBAR_REVISION");
  igual("cuenta aprobada con revisión: rechazar", plan("RECHAZAR", "APROBADA", true, "No coincide"), "RECHAZAR_REVISION");
  igual("cuenta aprobada sin cambios pendientes → 409", plan("APROBAR", "APROBADA", false), "ERR:409");
  igual("cuenta rechazada → 409", plan("APROBAR", "RECHAZADA", false), "ERR:409");
  igual("decisión inválida", plan("TAL VEZ", "PENDIENTE", false), "ERR:400");
  igual("columnas revisables: solo las permitidas", columnasDeRevision({ banco: "X", estado_aprobacion: "APROBADA", aprobado_por: "u", id: "z", es_principal: true }).map(([c]) => c), ["banco", "es_principal"]);

  // ── La edición común NO sobrescribe una cuenta aprobada: crea una revisión
  type C = { sql: string; parametros: unknown[] };
  const consultas: C[] = [];
  const conexion = {
    async query(sql: string, parametros: unknown[] = []) {
      consultas.push({ sql, parametros });
      if (/FROM proveedor_cuentas_bancarias t WHERE proveedor_id/.test(sql)) {
        return { rows: [{ fila: { id: CUENTA, estado_aprobacion: "APROBADA", banco: "Banco X", sucursal_banco: null, titular: "Prov SA", documento_titular: null, tipo_cuenta: "CORRIENTE", numero_cuenta: "123", moneda_codigo: "PYG", alias_cuenta: null, codigo_swift: null, iban: null, es_principal: true } }], rowCount: 1 };
      }
      if (/^\s*UPDATE proveedor_cuenta_revisiones/.test(sql)) return { rows: [], rowCount: 0 };

      return { rows: [], rowCount: 0 };
    },
  } as never;
  const cuenta = { id: CUENTA, banco: "Banco X", titular: "Prov SA", numeroCuenta: "123", monedaCodigo: "PYG", esPrincipal: true };

  // sin cambios: no escribe nada en la cuenta ni crea revisión
  await sincronizarHijos(conexion, EMPRESA, PROV, normalizarProveedor({ tipoDocumento: "RUC", numeroDocumento: "80000005", dv: "6", razonSocial: "X", cuentasBancarias: [cuenta] }), USUARIO);
  igual("cuenta aprobada sin cambios: sin UPDATE de la cuenta", consultas.filter((c) => /UPDATE proveedor_cuentas_bancarias/.test(c.sql)).length, 0);
  igual("cuenta aprobada sin cambios: sin revisión", consultas.filter((c) => /proveedor_cuenta_revisiones/.test(c.sql)).length, 0);

  consultas.length = 0;
  await sincronizarHijos(conexion, EMPRESA, PROV, normalizarProveedor({ tipoDocumento: "RUC", numeroDocumento: "80000005", dv: "6", razonSocial: "X", cuentasBancarias: [{ ...cuenta, titular: "Otro titular", iban: "DE89370400440532013000" }] }), USUARIO);
  igual("cuenta aprobada modificada: la cuenta NO se actualiza", consultas.filter((c) => /UPDATE proveedor_cuentas_bancarias/.test(c.sql)).length, 0);
  igual("cuenta aprobada modificada: se crea la revisión pendiente", consultas.filter((c) => /INSERT INTO proveedor_cuenta_revisiones/.test(c.sql)).length, 1);
  cierto("revisión: datos propuestos con el nuevo titular", consultas.some((c) => /INSERT INTO proveedor_cuenta_revisiones/.test(c.sql) && /Otro titular/.test(String(c.parametros[3]))));
  cierto("revisión auditada", consultas.some((c) => /INSERT INTO proveedor_eventos/.test(c.sql) && c.parametros[4] === "CUENTA_REVISION_SOLICITADA"));
  igual("sin DELETE en la sincronización", consultas.filter((c) => /^\s*DELETE/.test(c.sql)).length, 0);

  // ── Verificaciones estáticas: nadie más puede cambiar los datos gobernados
  const raiz = process.cwd();
  const api = archivos(join(raiz, "app/api/proveedores")).filter((f) => f.endsWith(".ts"));
  const quienCambia = api.filter((f) => /estado_homologacion\s*=|nivel_riesgo\s*=|calificacion_actual\s*=|bloqueado\s*=\s*\$|motivo_bloqueo\s*=/.test(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")));

  igual("solo la ruta de gobernanza escribe homologación/riesgo/bloqueo", quienCambia.map((f) => f.split(/[\\/]/).slice(-2).join("/")), []);
  cierto("la ruta de gobernanza existe y valida permiso por acción", /permisoDeAccion\(accion\)/.test(readFileSync(join(raiz, "app/api/proveedores/[id]/gobernanza/route.ts"), "utf8")) && /sinPermiso\(\)/.test(readFileSync(join(raiz, "app/api/proveedores/[id]/gobernanza/route.ts"), "utf8")));
  cierto("el PUT rechaza cambios de datos gobernados", /gobernados[\s\S]*?ErrorValidacion\([^)]*acción específica/.test(readFileSync(join(raiz, "app/api/proveedores/[id]/route.ts"), "utf8")));
  cierto("el POST impide definir datos gobernados al crear", /no se definen al registrar/.test(readFileSync(join(raiz, "app/api/proveedores/route.ts"), "utf8")));
  cierto("columnasProveedor no incluye datos gobernados", !/estado_homologacion|nivel_riesgo|calificacion_actual|bloqueado/.test(readFileSync(join(raiz, "lib/proveedores/shared.ts"), "utf8").replace(/\/\/.*$/gm, "").split("export function columnasProveedor")[1]?.split("export function")[0] ?? "x"));
  cierto("la resolución bancaria exige APROBAR_BANCO", /aprobarBanco/.test(readFileSync(join(raiz, "app/api/proveedores/[id]/cuentas/[cuentaId]/resolucion/route.ts"), "utf8")));
  const mig034 = readFileSync(join(raiz, "documentacao/banco/nexit/v1/migraciones/NEX-034-proveedores-auditoria-gobernanza.sql"), "utf8");

  for (const permiso of ["HOMOLOGAR", "EVALUAR_RIESGO", "BLOQUEAR", "APROBAR_BANCO"]) cierto(`NEX-034 crea PROVEEDORES.${permiso}`, mig034.includes(`'${permiso}'`));
  cierto("NEX-034: el rol de la aplicación solo puede insertar eventos", /GRANT SELECT, INSERT ON public\.proveedor_eventos/.test(mig034) && !/GRANT[^;]*(UPDATE|DELETE)[^;]*proveedor_eventos/.test(mig034));
  cierto("NEX-034: motivo de bloqueo obligatorio", /proveedores_motivo_bloqueo_chk CHECK \(NOT bloqueado OR length\(btrim/.test(mig034));
  cierto("NEX-034: función de elegibilidad (fecha de Asunción)", /proveedor_elegible_para_compra/.test(mig034) && /America\/Asuncion/.test(mig034));
  const mig035 = readFileSync(join(raiz, "documentacao/banco/nexit/v1/migraciones/NEX-035-proveedores-cuentas-aprobacion.sql"), "utf8");

  cierto("NEX-035: principal por moneda solo entre aprobadas", /UNIQUE INDEX proveedor_cuentas_bancarias_principal_moneda_uq[\s\S]*?\(empresa_id, proveedor_id, moneda_codigo\)[\s\S]*?es_principal AND estado_aprobacion = 'APROBADA'/.test(mig035));
  cierto("NEX-035: cuentas existentes quedan pendientes (sin presumir aprobación)", /DEFAULT 'PENDIENTE'/.test(mig035) && !/UPDATE public\.proveedor_cuentas_bancarias/.test(mig035));
  cierto("NEX-035: una sola revisión pendiente por cuenta", /proveedor_cuenta_revisiones_pendiente_uq[\s\S]*?WHERE estado = 'PENDIENTE'/.test(mig035));
  cierto("NEX-035: contrato de pago por cuenta aprobada", /proveedor_cuenta_pagable/.test(mig035));

  return fallos;
}
