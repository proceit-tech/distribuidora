/**
 * Casos de regresión PRV-AUD-01 (bajas de cuentas bancarias: nunca se destruye una cuenta aprobada) y PRV-AUD-02 (auditoría
 * inmutable y grants resistentes a la reaplicación). Sincronización contra una conexión SIMULADA + verificaciones estáticas del SQL.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { ErrorValidacion } from "@/lib/proveedores/errores";
import { normalizarProveedor } from "@/lib/proveedores/normalizar";
import { sincronizarHijos } from "@/lib/proveedores/sincronizar";

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const OTRA_EMPRESA = "44444444-4444-4444-8444-444444444444";
const PROV = "22222222-2222-4222-8222-222222222222";
const USUARIO = "33333333-3333-4333-8333-333333333333";
const A1 = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const A2 = "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2";
const A3 = "a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3";

type Consulta = { sql: string; parametros: unknown[] };

const fila = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  estado_aprobacion: "PENDIENTE",
  aprobado_por: null,
  activa: true,
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
  es_principal: false,
  ...extra,
});

async function ejecutar(existentes: Array<Record<string, unknown>>, eliminar: string[], fallaDelete?: string, enviar: Array<Record<string, unknown>> = []) {
  const registro: Consulta[] = [];
  const conexion = {
    async query(sql: string, parametros: unknown[] = []) {
      registro.push({ sql, parametros });

      if (/FROM proveedor_cuentas_bancarias t WHERE proveedor_id/.test(sql)) return { rows: existentes.map((f) => ({ fila: f })), rowCount: existentes.length };
      if (/^\s*DELETE FROM proveedor_cuentas_bancarias/.test(sql) && fallaDelete) throw Object.assign(new Error("bloqueada"), { code: fallaDelete });

      return { rows: [], rowCount: 0 };
    },
  } as never;
  const datos = normalizarProveedor({ tipoDocumento: "RUC", numeroDocumento: "80000005", dv: "6", razonSocial: "X", cuentasBancarias: enviar, eliminaciones: { cuentasBancarias: eliminar } });
  const error = await sincronizarHijos(conexion, EMPRESA, PROV, datos, USUARIO).then(
    () => null,
    (e) => e as ErrorValidacion & { code?: string },
  );

  return { registro, error };
}

const escribe = (c: Consulta) => /^\s*(UPDATE|DELETE|INSERT)/.test(c.sql);

export async function verificarCasosCuentasYAuditoria(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const borrados = (r: Consulta[]) => r.filter((c) => /DELETE FROM proveedor_cuentas_bancarias/.test(c.sql));
  const desactivaciones = (r: Consulta[]) => r.filter((c) => /UPDATE proveedor_cuentas_bancarias[\s\S]*activa = false/.test(c.sql));
  const aprobada = { estado_aprobacion: "APROBADA", aprobado_por: USUARIO };

  // ── Cuenta aprobada → desactivación, jamás DELETE
  const a = await ejecutar([fila(A1, { ...aprobada, es_principal: true })], [A1]);

  igual("aprobada: sin DELETE", borrados(a.registro).length, 0);
  igual("aprobada: una desactivación", desactivaciones(a.registro).length, 1);
  cierto("aprobada: deja de ser principal al desactivarse", /activa = false, es_principal = false/.test(desactivaciones(a.registro)[0]?.sql ?? ""));
  cierto("aprobada: desactivación filtrada por id, proveedor y empresa", desactivaciones(a.registro).every((c) => c.parametros[0] === A1 && c.parametros[1] === PROV && c.parametros[2] === EMPRESA));
  cierto("aprobada: la revisión pendiente se cancela (con empresa)", a.registro.some((c) => /UPDATE proveedor_cuenta_revisiones SET estado = 'RECHAZADA'/.test(c.sql) && c.parametros[2] === EMPRESA));
  cierto("aprobada: queda auditada como CUENTA_DESACTIVADA", a.registro.some((c) => /INSERT INTO proveedor_eventos/.test(c.sql) && c.parametros[4] === "CUENTA_DESACTIVADA" && c.parametros[0] === EMPRESA));
  igual("aprobada: ni siquiera se intenta el DELETE", a.registro.some((c) => /SAVEPOINT/.test(c.sql)), false);
  igual("aprobada: sin error", a.error, null);

  // ── Alguna vez aprobada (hoy rechazada tras un cambio): tampoco se elimina
  const antes = await ejecutar([fila(A2, { estado_aprobacion: "RECHAZADA", aprobado_por: USUARIO })], [A2]);

  igual("alguna vez aprobada: sin DELETE", borrados(antes.registro).length, 0);
  igual("alguna vez aprobada: se desactiva", desactivaciones(antes.registro).length, 1);

  // ── Pendiente nunca aprobada → eliminación física con savepoint y fila completa auditada
  const p = await ejecutar([fila(A3)], [A3]);

  igual("pendiente: un DELETE", borrados(p.registro).length, 1);
  cierto("pendiente: DELETE filtrado por id, proveedor y empresa", borrados(p.registro).every((c) => c.parametros[0] === A3 && c.parametros[1] === PROV && c.parametros[2] === EMPRESA));
  cierto("pendiente: la baja guarda la fila completa en la auditoría", p.registro.some((c) => /INSERT INTO proveedor_eventos/.test(c.sql) && c.parametros[4] === "BAJA" && /"numero_cuenta":"1"/.test(String(c.parametros[5]))));
  igual("pendiente: no se desactiva", desactivaciones(p.registro).length, 0);
  cierto("pendiente: el DELETE va protegido por savepoint", p.registro.some((c) => /^SAVEPOINT baja_cuenta/.test(c.sql)) && p.registro.some((c) => /^RELEASE SAVEPOINT baja_cuenta/.test(c.sql)));

  // ── Vinculada a operaciones (FK 23503) o protegida por el trigger (P0001) → se desactiva
  const v = await ejecutar([fila(A3)], [A3], "23503");

  cierto("vinculada: se revierte el savepoint y se desactiva", v.error === null && v.registro.some((c) => /^ROLLBACK TO SAVEPOINT/.test(c.sql)) && desactivaciones(v.registro).length === 1);
  cierto("vinculada: auditada como desactivación (no como baja)", v.registro.some((c) => c.parametros[4] === "CUENTA_DESACTIVADA") && !v.registro.some((c) => c.parametros[4] === "BAJA"));
  const t = await ejecutar([fila(A3)], [A3], "P0001");

  cierto("protegida por trigger: se desactiva", t.error === null && desactivaciones(t.registro).length === 1);
  const o = await ejecutar([fila(A3)], [A3], "57014");

  igual("otro error de base de datos se propaga", o.error?.code, "57014");

  // ── Cuenta ya desactivada
  const ya = await ejecutar([fila(A1, { ...aprobada, activa: false })], [A1]);

  igual("ya desactivada: la baja es idempotente (no escribe)", ya.registro.filter(escribe).length, 0);
  const modif = await ejecutar([fila(A1, { ...aprobada, activa: false })], [], undefined, [{ id: A1, banco: "Otro banco", titular: "T", numeroCuenta: "1", monedaCodigo: "PYG" }]);

  igual("desactivada: no se modifica (409)", modif.error?.estado, 409);
  const sin = await ejecutar([fila(A1, { ...aprobada, activa: false })], [], undefined, [{ id: A1, banco: "B", titular: "T", numeroCuenta: "1", monedaCodigo: "PYG" }]);

  igual("desactivada sin cambios: se ignora", [sin.error, sin.registro.filter(escribe).length], [null, 0]);

  // ── Multiempresa / otro proveedor: la lectura filtra por ambos y un id ajeno se rechaza sin escribir
  const ajena = await ejecutar([], [A1]);

  igual("cuenta ajena o inexistente: 409 y sin escrituras", [ajena.error?.estado, ajena.registro.filter(escribe).length], [409, 0]);
  cierto("existentes: se leen con proveedor y empresa de la sesión", a.registro.filter((c) => /FROM proveedor_cuentas_bancarias t WHERE proveedor_id/.test(c.sql)).every((c) => c.parametros[0] === PROV && c.parametros[1] === EMPRESA));
  cierto("ninguna consulta usa otra empresa", [a, antes, p, v, t].every((r) => r.registro.every((c) => !c.parametros.includes(OTRA_EMPRESA))));

  // ── Aprobada y modificada: revisión (no cambia la cuenta aprobada) — regresión de NEX-035
  const mod = await ejecutar([fila(A1, aprobada)], [], undefined, [{ id: A1, banco: "Nuevo banco", titular: "T", numeroCuenta: "1", monedaCodigo: "PYG" }]);

  igual("aprobada modificada: no se actualiza la cuenta", mod.registro.filter((c) => /UPDATE proveedor_cuentas_bancarias/.test(c.sql)).length, 0);
  igual("aprobada modificada: se crea la revisión", mod.registro.filter((c) => /INSERT INTO proveedor_cuenta_revisiones/.test(c.sql)).length, 1);

  // ── SQL: NEX-037 y privilegios efectivos de proveedor_eventos
  const raiz = process.cwd();
  const dirMig = join(raiz, "documentacao/banco/nexit/v1/migraciones");
  const sinComentarios = (s: string) => s.replace(/--.*$/gm, "");
  const mig037 = sinComentarios(readFileSync(join(dirMig, "NEX-037-proveedores-cuentas-desactivacion-auditoria-inmutable.sql"), "utf8"));
  const todas = readdirSync(dirMig).filter((f) => f.endsWith(".sql")).map((f) => sinComentarios(readFileSync(join(dirMig, f), "utf8")));
  const concesiones = todas.flatMap((m) => m.split(/;\s*\n/).filter((s) => /\bGRANT\b/i.test(s) && /proveedor_eventos/.test(s)));

  cierto("hay concesiones sobre proveedor_eventos", concesiones.length >= 2);
  cierto("ninguna migración concede UPDATE, DELETE, TRUNCATE ni ALL sobre proveedor_eventos", concesiones.every((g) => !/\b(UPDATE|DELETE|TRUNCATE|ALL)\b/i.test(g.replace(/REVOKE ALL[^;]*/i, ""))));
  cierto("las concesiones sobre eventos son exactamente SELECT, INSERT", concesiones.every((g) => /GRANT SELECT, INSERT ON public\.proveedor_eventos/.test(g) || /proveedor_eventos_inmutable/.test(g) || !/GRANT\s+\w/.test(g)));
  cierto("NEX-037: triggers rechazan UPDATE, DELETE y TRUNCATE de eventos", /BEFORE UPDATE OR DELETE ON public\.proveedor_eventos/.test(mig037) && /BEFORE TRUNCATE ON public\.proveedor_eventos/.test(mig037));
  cierto("NEX-037: el DELETE solo se admite si el proveedor ya no existe (cascada del reinicio DEMO)", /IF EXISTS \(SELECT 1 FROM public\.proveedores p WHERE p\.empresa_id = OLD\.empresa_id AND p\.id = OLD\.proveedor_id\)/.test(mig037));
  cierto("NEX-037: la reaplicación de grants conserva la base y reaplica Proveedores", /RENAME TO nex_aplicar_grants_runtime_base/.test(mig037) && /PERFORM public\.nex_aplicar_grants_runtime_base\(\);\s*PERFORM public\.nex_aplicar_grants_proveedores\(\)/.test(mig037));
  cierto("NEX-037: Proveedores reaplica REVOKE ALL y solo SELECT, INSERT a eventos", /REVOKE ALL ON public\.proveedor_eventos/.test(mig037) && /GRANT SELECT, INSERT ON public\.proveedor_eventos TO nexit_runtime/.test(mig037));
  cierto("NEX-037: los documentos quedan sin DELETE tras reaplicar", /REVOKE DELETE ON public\.proveedor_documentos FROM nexit_runtime/.test(mig037));
  cierto("NEX-037: se aplica en el momento de la migración", /SELECT public\.nex_aplicar_grants_proveedores\(\)/.test(mig037));
  cierto("NEX-037: no se puede eliminar una cuenta alguna vez aprobada", /BEFORE DELETE ON public\.proveedor_cuentas_bancarias/.test(mig037) && /OLD\.estado_aprobacion = 'APROBADA' OR OLD\.aprobado_por IS NOT NULL/.test(mig037));
  cierto("NEX-037: la cuenta desactivada no es pagable ni principal", /c\.estado_aprobacion = 'APROBADA' AND c\.activa/.test(mig037) && /WHERE es_principal AND estado_aprobacion = 'APROBADA' AND activa/.test(mig037));
  cierto("NEX-037: desactivación con autor y fecha obligatorios", /desactivada_at IS NOT NULL AND desactivada_por IS NOT NULL/.test(mig037));
  cierto("NEX-037: aditiva (sin borrar datos ni tablas)", !/DELETE FROM|DROP TABLE|TRUNCATE TABLE/i.test(mig037));

  const rev = readFileSync(join(raiz, "documentacao/banco/nexit/v1/scripts/reversion-NEX-037.sql"), "utf8");

  cierto("reversión NEX-037 aborta con cuentas desactivadas", /WHERE NOT activa\)[\s\S]*?RAISE EXCEPTION/.test(rev));
  cierto("la resolución bancaria rechaza cuentas desactivadas", /fila\.activa === false/.test(readFileSync(join(raiz, "app/api/proveedores/[id]/cuentas/[cuentaId]/resolucion/route.ts"), "utf8")));

  // Ninguna ruta emite UPDATE/DELETE sobre proveedor_eventos
  const rutas = [
    "lib/proveedores/sincronizar.ts",
    "lib/proveedores/shared.ts",
    "app/api/proveedores/route.ts",
    "app/api/proveedores/[id]/route.ts",
    "app/api/proveedores/[id]/gobernanza/route.ts",
    "app/api/proveedores/[id]/eventos/route.ts",
  ];

  for (const r of rutas) cierto(`${r}: no modifica ni borra eventos`, !/(UPDATE|DELETE FROM)\s+proveedor_eventos/i.test(readFileSync(join(raiz, r), "utf8")));

  return fallos;
}
