/**
 * Casos de regresión de la reactivación administrativa de cuentas bancarias (diccionario §8): conexión SIMULADA que modela
 * la tabla (filtra por id, proveedor y empresa) + verificaciones estáticas del RBAC y de la ruta.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { ErrorValidacion } from "@/lib/proveedores/errores";
import { normalizarProveedor } from "@/lib/proveedores/normalizar";
import { reactivarCuenta, validarJustificacionReactivacion } from "@/lib/proveedores/reactivacion";
import { sincronizarHijos } from "@/lib/proveedores/sincronizar";

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const OTRA_EMPRESA = "44444444-4444-4444-8444-444444444444";
const PROV = "22222222-2222-4222-8222-222222222222";
const ADMIN = "33333333-3333-4333-8333-333333333333";
const CUENTA = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";

type Consulta = { sql: string; parametros: unknown[] };

function cuenta(extra: Record<string, unknown> = {}) {
  return {
    id: CUENTA,
    empresa_id: EMPRESA,
    proveedor_id: PROV,
    estado_aprobacion: "APROBADA",
    aprobado_por: ADMIN,
    activa: false,
    es_principal: false,
    desactivada_at: "2026-10-01T10:00:00Z",
    desactivada_por: ADMIN,
    motivo_desactivacion: "Cuenta cerrada",
    banco: "B",
    sucursal_banco: null,
    titular: "T",
    documento_titular: null,
    tipo_cuenta: "CORRIENTE",
    numero_cuenta: "1",
    moneda_codigo: "PYG",
    alias_cuenta: null,
    codigo_swift: null,
    iban: null,
    ...extra,
  };
}

function conexionSimulada(fila: Record<string, unknown> | null) {
  const registro: Consulta[] = [];
  const conexion = {
    async query(sql: string, parametros: unknown[] = []) {
      registro.push({ sql, parametros });

      if (/FROM proveedor_cuentas_bancarias t WHERE id = \$1 AND proveedor_id = \$2 AND empresa_id = \$3 FOR UPDATE/.test(sql)) {
        const visible = fila && fila.id === parametros[0] && fila.proveedor_id === parametros[1] && fila.empresa_id === parametros[2];

        return visible ? { rows: [{ fila }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (/FROM proveedor_cuentas_bancarias t WHERE proveedor_id/.test(sql)) return { rows: fila ? [{ fila }] : [], rowCount: fila ? 1 : 0 };

      return { rows: [], rowCount: 0 };
    },
  } as never;

  return { conexion, registro };
}

export async function verificarCasosReactivacion(): Promise<string[]> {
  const raiz = process.cwd();
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const reactivar = async (fila: Record<string, unknown> | null, empresaId = EMPRESA) => {
    const { conexion, registro } = conexionSimulada(fila);
    const resultado = await reactivarCuenta(conexion, { empresaId, proveedorId: PROV, cuentaId: CUENTA, usuarioId: ADMIN, justificacion: "Error de baja" }).then(
      (r) => ({ r, error: null as ErrorValidacion | null }),
      (e) => ({ r: null, error: e as ErrorValidacion }),
    );

    return { ...resultado, registro };
  };
  const updates = (r: Consulta[]) => r.filter((c) => /^\s*UPDATE proveedor_cuentas_bancarias/.test(c.sql));
  const eventos = (r: Consulta[]) => r.filter((c) => /INSERT INTO proveedor_eventos/.test(c.sql));

  // ── Justificación obligatoria
  for (const vacia of [undefined, null, "", "   ", 5]) {
    let campo = "";

    try {
      validarJustificacionReactivacion(vacia);
    } catch (e) {
      campo = (e as ErrorValidacion).campo ?? "";
    }
    igual(`justificación vacía (${JSON.stringify(vacia)}) rechazada`, campo, "motivo");
  }
  igual("justificación se recorta", validarJustificacionReactivacion("  Error de baja  "), "Error de baja");
  igual(
    "justificación > 1000 rechazada",
    (() => {
      try {
        validarJustificacionReactivacion("x".repeat(1001));

        return false;
      } catch {
        return true;
      }
    })(),
    true,
  );

  // ── Reactivación válida de cuenta anteriormente aprobada
  const ok = await reactivar(cuenta());

  igual("aprobada: sin error", ok.error, null);
  igual("aprobada: vuelve a ser pagable", ok.r, { estadoAprobacion: "APROBADA", pagable: true });
  igual("aprobada: un único UPDATE", updates(ok.registro).length, 1);

  const sql = updates(ok.registro)[0]?.sql ?? "";

  cierto("UPDATE solo restablece la actividad", /SET activa = true, desactivada_at = NULL, desactivada_por = NULL, motivo_desactivacion = NULL/.test(sql));
  cierto("UPDATE exige cuenta desactivada y filtra por id, proveedor y empresa", /AND NOT activa/.test(sql) && JSON.stringify(updates(ok.registro)[0].parametros) === JSON.stringify([CUENTA, PROV, EMPRESA]));

  const asignaciones = sql.slice(sql.indexOf("SET"), sql.indexOf("WHERE"));

  for (const prohibida of ["estado_aprobacion", "aprobado_por", "aprobado_at", "es_principal", "banco", "numero_cuenta", "titular", "moneda_codigo", "iban"]) {
    cierto(`UPDATE no toca ${prohibida}`, !new RegExp(`\\b${prohibida}\\b`).test(asignaciones));
  }
  igual("no toca proveedor_cuenta_revisiones (no reabre ni aprueba)", ok.registro.some((c) => /proveedor_cuenta_revisiones/.test(c.sql)), false);
  igual("no hay DELETE", ok.registro.some((c) => /DELETE/.test(c.sql)), false);
  igual("la fila se lee bloqueada (FOR UPDATE)", ok.registro.some((c) => /FOR UPDATE/.test(c.sql)), true);

  // ── Evento en la misma conexión/transacción
  const ev = eventos(ok.registro);

  igual("un evento CUENTA_REACTIVADA", ev.length, 1);

  const p = ev[0]?.parametros ?? [];

  igual("evento: empresa, proveedor, entidad, cuenta y acción", [p[0], p[1], p[2], p[3], p[4]], [EMPRESA, PROV, "CUENTA", CUENTA, "CUENTA_REACTIVADA"]);
  igual("evento: justificación y administrador", [p[7], p[8]], ["Error de baja", ADMIN]);
  cierto("evento: estado anterior conserva la desactivación original", /"activa":false/.test(String(p[5])) && /Cuenta cerrada/.test(String(p[5])) && /desactivadaPor/.test(String(p[5])));
  cierto("evento: estado nuevo activo, aprobada, no principal", /"activa":true/.test(String(p[6])) && /"estado":"APROBADA"/.test(String(p[6])) && /"principal":false/.test(String(p[6])));
  igual("el evento se registra después del UPDATE", ok.registro.findIndex((c) => /INSERT INTO proveedor_eventos/.test(c.sql)) > ok.registro.findIndex((c) => /^\s*UPDATE/.test(c.sql)), true);

  // ── Cuenta principal desactivada: no vuelve como principal
  const prin = await reactivar(cuenta({ es_principal: true }));

  cierto("principal previa: el evento declara principal=false", /"principal":false/.test(String(eventos(prin.registro)[0]?.parametros[6])));
  igual("principal previa: el UPDATE no menciona es_principal", /es_principal/.test(updates(prin.registro)[0]?.sql ?? ""), false);

  // ── Pendiente / rechazada: reactiva pero sigue sin ser pagable
  for (const estado of ["PENDIENTE", "RECHAZADA"]) {
    const r = await reactivar(cuenta({ estado_aprobacion: estado, aprobado_por: null }));

    igual(`${estado}: reactivada pero NO pagable`, r.r, { estadoAprobacion: estado, pagable: false });
    cierto(`${estado}: no cambia su estado de aprobación`, !/estado_aprobacion/.test(updates(r.registro)[0]?.sql ?? ""));
  }

  const rech = await reactivar(cuenta({ estado_aprobacion: "RECHAZADA" }));

  igual("alguna vez aprobada y hoy rechazada: no pagable", rech.r?.pagable, false);

  // ── Cuenta ya activa
  const activa = await reactivar(cuenta({ activa: true, desactivada_at: null, desactivada_por: null }));

  igual("ya activa: 409", activa.error?.estado, 409);
  igual("ya activa: sin UPDATE ni evento", updates(activa.registro).length + eventos(activa.registro).length, 0);

  // ── Multiempresa: la cuenta de otra empresa es invisible
  const otra = await reactivar(cuenta(), OTRA_EMPRESA);

  igual("otra empresa: no encontrada", otra.r, null);
  igual("otra empresa: sin error filtrable y sin escrituras", [otra.error, updates(otra.registro).length, eventos(otra.registro).length], [null, 0, 0]);

  const ajena = await reactivar(cuenta({ empresa_id: OTRA_EMPRESA }));

  igual("cuenta de otra empresa desde mi sesión: no encontrada", [ajena.r, updates(ajena.registro).length], [null, 0]);
  igual("cuenta inexistente: no encontrada", (await reactivar(null)).r, null);

  // ── Un usuario común no reactiva por el PUT cadastral: la cuenta desactivada es solo lectura
  const put = conexionSimulada(cuenta());
  const datos = normalizarProveedor({
    tipoDocumento: "RUC",
    numeroDocumento: "80000005",
    dv: "6",
    razonSocial: "X",
    cuentasBancarias: [{ id: CUENTA, banco: "B2", titular: "T", tipoCuenta: "CORRIENTE", numeroCuenta: "1", monedaCodigo: "PYG", esPrincipal: false }],
  });
  const putError = await sincronizarHijos(put.conexion, EMPRESA, PROV, datos, ADMIN).then(
    () => null,
    (e) => e as ErrorValidacion,
  );

  igual("PUT: modificar una cuenta desactivada → 409", putError?.estado, 409);
  igual("PUT: no emite UPDATE de cuentas ni eventos", put.registro.filter((c) => /^\s*UPDATE proveedor_cuentas_bancarias|INSERT INTO proveedor_eventos/.test(c.sql)).length, 0);

  // ── RBAC real en el servidor (no solo el botón)
  const ruta = readFileSync(join(raiz, "app/api/proveedores/[id]/cuentas/[cuentaId]/reactivar/route.ts"), "utf8");
  const http = readFileSync(join(raiz, "lib/proveedores/http.ts"), "utf8");

  cierto("ruta: exige administrador antes de abrir la transacción", ruta.indexOf("permisos.administrador") > 0 && ruta.indexOf("permisos.administrador") < ruta.indexOf("conTransaccion("));
  cierto("ruta: no acepta APROBAR_BANCO, EDITAR ni otros permisos como autoridad", !/permisos\.(aprobarBanco|editar|homologar|bloquear|crear|ver)\b/.test(ruta));
  cierto("administrador proviene de isCompanyAdmin y excluye al administrador de plataforma", /administrador: acceso\.isCompanyAdmin && !acceso\.isPlatformAdmin/.test(http));
  cierto("ruta: empresa y usuario salen de la sesión, no del cuerpo", /empresaId: auth\.sesion\.user\.empresaId/.test(ruta) && !/cuerpo\.(empresa|usuario)/i.test(ruta));
  cierto("ruta: transacción y justificación validada en el servidor", /conTransaccion/.test(ruta) && /validarJustificacionReactivacion\(cuerpo\.motivo\)/.test(ruta));
  cierto("la UI solo muestra la acción con permisos.reactivarCuenta", /permisos\.reactivarCuenta !== true\) return null/.test(readFileSync(join(raiz, "app/(private)/proveedores/_components/pestanas/reactivar-cuenta.tsx"), "utf8")));

  // ── La elegibilidad de pago sigue gobernada por SQL (NEX-037): activa + APROBADA
  const mig = readFileSync(join(raiz, "documentacao/banco/nexit/v1/migraciones/NEX-037-proveedores-cuentas-desactivacion-auditoria-inmutable.sql"), "utf8");

  cierto("proveedor_cuenta_pagable exige APROBADA y activa", /c\.estado_aprobacion = 'APROBADA' AND c\.activa/.test(mig));
  cierto("el CHECK de coherencia admite la reactivación (activa ⇒ sin desactivada_*)", /\(activa AND desactivada_at IS NULL AND desactivada_por IS NULL\)/.test(mig));

  return fallos;
}
