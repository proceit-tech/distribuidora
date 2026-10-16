import { NextResponse } from "next/server";
import type { Pool } from "pg";

import { type Dependencias, invalidarTokensEmpresa, probarLoginGateway, type EstadoPrueba } from "@/lib/facturacion/gateway";
import { TIMEOUT_GATEWAY_MS, URL_GATEWAY_PRUEBA } from "@/lib/facturacion/gateway-credenciales";
import { ErrorFacturacion } from "@/lib/facturacion/shared";

/**
 * Configuración del gateway de facturación electrónica por empresa (PRO-133, NEX-061). El servidor valida la FORMA y traduce errores; la autoridad es la función SQL (SECURITY DEFINER), que vuelve a
 * verificar el permiso FACTURACION_ELECTRONICA.CONFIGURAR. empresa_id y usuario salen SIEMPRE de la sesión. La clave se guarda sin cifrado en reposo (decisión expresa del responsable) pero NUNCA
 * se devuelve: ni en GET, ni en listados, ni en errores, ni en la auditoría. La URL no se pide: es la del gateway de prueba documentado.
 */
type Db = Pick<Pool, "query">;
type F = Record<string, unknown>;

export type ConfiguracionGateway = {
  configurado: boolean;
  empresa: string;
  baseUrl: string;
  apiUsuario: string | null;
  tienePassword: boolean;
  activo: boolean;
  ultimaPruebaAt: string | null;
  ultimaPruebaEstado: EstadoPrueba | null;
};

export type GuardadoGateway = { apiUsuario: string; password: string | null };
export type PruebaGateway = { apiUsuario: string | null; password: string | null };

const ESTADOS_PRUEBA: readonly string[] = ["OK", "CREDENCIALES_INVALIDAS", "NO_DISPONIBLE", "TIMEOUT"];

/** Mensajes de «Probar conexión». Sin token ni clave. */
export const MENSAJES_PRUEBA: Record<EstadoPrueba, string> = {
  OK: "Autenticación correcta: el gateway aceptó el usuario y la clave.",
  CREDENCIALES_INVALIDAS: "El gateway rechazó el usuario o la clave de la API. Verifique las credenciales.",
  NO_DISPONIBLE: "El gateway no está disponible en este momento. Intente de nuevo más tarde.",
  TIMEOUT: "Tiempo de espera agotado al comunicarse con el gateway.",
};

/** Texto libre: sin caracteres de control (no se rechaza la clave por su contenido, solo por largo/forma). */
const SIN_CONTROL = /[\u0000-\u001f\u007f]/;

export function leerGuardado(c: Record<string, unknown>): GuardadoGateway | string {
  if (typeof c.apiUsuario !== "string" || c.apiUsuario.trim().length < 1 || c.apiUsuario.trim().length > 60 || SIN_CONTROL.test(c.apiUsuario)) return "Informe el usuario de la API (1 a 60 caracteres).";

  let password: string | null = null;

  if (c.password !== undefined && c.password !== null && c.password !== "") {
    if (typeof c.password !== "string" || c.password.length > 200 || SIN_CONTROL.test(c.password)) return "La contraseña de la API debe tener de 1 a 200 caracteres, sin saltos de línea.";
    password = c.password;
  }

  return { apiUsuario: c.apiUsuario.trim(), password };
}

export function leerPrueba(c: Record<string, unknown>): PruebaGateway | string {
  let apiUsuario: string | null = null;
  let password: string | null = null;

  if (c.apiUsuario !== undefined && c.apiUsuario !== null && c.apiUsuario !== "") {
    if (typeof c.apiUsuario !== "string" || c.apiUsuario.trim().length > 60 || SIN_CONTROL.test(c.apiUsuario)) return "El usuario de la API no es válido (hasta 60 caracteres).";
    apiUsuario = c.apiUsuario.trim();
  }
  if (c.password !== undefined && c.password !== null && c.password !== "") {
    if (typeof c.password !== "string" || c.password.length > 200 || SIN_CONTROL.test(c.password)) return "La contraseña de la API no es válida (hasta 200 caracteres, sin saltos de línea).";
    password = c.password;
  }

  return { apiUsuario, password };
}

export function traducirErrorConfiguracion(error: unknown): never {
  const pg = error as { code?: string; detail?: string };
  const m = (estado: number, texto: string) => new ErrorFacturacion(estado, texto);

  if (error instanceof ErrorFacturacion) throw error;
  if (pg.code === "42501") throw m(403, "No tiene permiso para configurar la facturación electrónica (FACTURACION_ELECTRONICA.CONFIGURAR).");
  if (pg.code === "42883" || pg.code === "42P01") throw m(409, "La configuración de facturación electrónica no está disponible: falta aplicar la migración NEX-061.");

  switch (pg.detail) {
    case "NEX:URL_INVALIDA": throw m(422, "La URL del gateway no es válida.");
    case "NEX:USUARIO_INVALIDO": throw m(422, "Informe el usuario de la API (1 a 60 caracteres).");
    case "NEX:PASSWORD_INVALIDA": throw m(422, "La contraseña de la API debe tener de 1 a 200 caracteres.");
    case "NEX:PASSWORD_REQUERIDA": throw m(422, "Informe la contraseña de la API.");
    case "NEX:TIMEOUT_INVALIDO": throw m(422, "El tiempo de espera no es válido.");
    default: throw error;
  }
}

/** Respuesta HTTP de un error: los dirigidos con su estado; cualquier otro, 500 genérico SIN detalles internos (nunca eco de la clave). */
export function respuestaErrorConfiguracion(error: unknown) {
  if (error instanceof ErrorFacturacion) return NextResponse.json({ error: error.message }, { status: error.estado });

  console.error("Error en la configuración del gateway de facturación electrónica:", (error as { code?: string })?.code ?? "desconocido");

  return NextResponse.json({ error: "No fue posible completar la operación con la configuración del gateway." }, { status: 500 });
}

/** Configuración visible de la empresa de la sesión. NUNCA incluye la clave: solo si existe. */
export async function leerConfiguracion(db: Db, empresaId: string, usuarioId: string): Promise<ConfiguracionGateway> {
  try {
    const [cfg, emp] = await Promise.all([
      db.query("SELECT o_base_url, o_api_usuario, o_tiene_password, o_activo, o_ultima_prueba_at, o_ultima_prueba_estado FROM fe_gateway_config_ver($1::uuid, $2::uuid)", [empresaId, usuarioId]),
      db.query("SELECT razon_social FROM empresas WHERE id = $1", [empresaId]),
    ]);
    const f = cfg.rows[0] as F | undefined;
    const empresa = String((emp.rows[0] as F | undefined)?.razon_social ?? "");
    const estado = f?.o_ultima_prueba_estado === null || f?.o_ultima_prueba_estado === undefined ? null : String(f.o_ultima_prueba_estado);

    return {
      configurado: f !== undefined && f.o_tiene_password === true && typeof f.o_api_usuario === "string",
      empresa,
      baseUrl: f ? String(f.o_base_url) : URL_GATEWAY_PRUEBA,
      apiUsuario: f && typeof f.o_api_usuario === "string" ? f.o_api_usuario : null,
      tienePassword: f?.o_tiene_password === true,
      activo: f?.o_activo === true,
      ultimaPruebaAt: f?.o_ultima_prueba_at ? new Date(String(f.o_ultima_prueba_at)).toISOString() : null,
      ultimaPruebaEstado: estado !== null && ESTADOS_PRUEBA.includes(estado) ? (estado as EstadoPrueba) : null,
    };
  } catch (error) {
    return traducirErrorConfiguracion(error);
  }
}

/** Guarda usuario y clave de la API (la clave en blanco conserva la actual). Invalida los tokens en caché de la empresa. */
export async function guardarConfiguracion(db: Db, empresaId: string, usuarioId: string, g: GuardadoGateway): Promise<void> {
  try {
    await db.query("SELECT fe_gateway_config_guardar($1::uuid, $2::uuid, $3, $4, $5, $6::integer)", [empresaId, usuarioId, URL_GATEWAY_PRUEBA, g.apiUsuario, g.password, TIMEOUT_GATEWAY_MS]);
    invalidarTokensEmpresa(empresaId);
  } catch (error) {
    traducirErrorConfiguracion(error);
  }
}

export type ResultadoPrueba = { estado: EstadoPrueba; mensaje: string; credenciales: "GUARDADAS" | "INFORMADAS" };

/**
 * «Probar conexión»: SOLO POST /api/login con las credenciales informadas en la pantalla o, en su defecto, las guardadas. No crea facturas, no reserva numeración, no llama a recepcion_de ni toca
 * documentos. Con límite de intentos por empresa (función SQL). El resultado se registra sin secretos; el token y la clave nunca salen del servidor.
 */
export async function probarConexion(db: Db, empresaId: string, usuarioId: string, p: PruebaGateway, dep: Pick<Dependencias, "fetch"> = {}): Promise<ResultadoPrueba> {
  try {
    const espera = Number(((await db.query("SELECT fe_gateway_prueba_iniciar($1::uuid, $2::uuid) AS espera", [empresaId, usuarioId])).rows[0] as F).espera);

    if (espera > 0) throw new ErrorFacturacion(429, `Demasiados intentos de prueba. Espere ${espera} segundo${espera === 1 ? "" : "s"} antes de volver a probar.`);

    const guardado = (await db.query("SELECT o_api_usuario AS ruc, o_api_password AS password FROM fe_gateway_credenciales_leer($1::uuid, $2::uuid)", [empresaId, usuarioId])).rows[0] as { ruc?: string; password?: string } | undefined;
    const ruc = p.apiUsuario ?? guardado?.ruc ?? null;
    const password = p.password ?? guardado?.password ?? null;

    if (!ruc || !password) throw new ErrorFacturacion(422, "Informe el usuario y la contraseña de la API (o guárdelos antes de probar).");

    // La prueba se considera de las credenciales GUARDADAS solo si no se informó nada distinto de lo guardado.
    const guardadas = guardado !== undefined && ruc === guardado.ruc && password === guardado.password;
    const r = await probarLoginGateway({ baseUrl: URL_GATEWAY_PRUEBA, timeoutMs: TIMEOUT_GATEWAY_MS }, ruc, password, dep);

    await db.query("SELECT fe_gateway_prueba_registrar($1::uuid, $2::uuid, $3, $4)", [empresaId, usuarioId, r.estado, guardadas]);

    return { estado: r.estado, mensaje: MENSAJES_PRUEBA[r.estado], credenciales: guardadas ? "GUARDADAS" : "INFORMADAS" };
  } catch (error) {
    return traducirErrorConfiguracion(error);
  }
}
