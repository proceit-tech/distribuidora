import type { Pool } from "pg";

import type { ConfigGateway } from "@/lib/facturacion/gateway";

/**
 * Credenciales de la API del gateway guardadas en PostgreSQL por empresa (PRO-133, NEX-061). El rol de la aplicación NO tiene ningún privilegio sobre la tabla de credenciales: solo las funciones SQL
 * SECURITY DEFINER las leen, siempre para la empresa y el usuario de la SESIÓN. Este módulo nunca registra, serializa ni devuelve la clave.
 */
type Db = Pick<Pool, "query">;

/** Referencia lógica que marca «las credenciales están en la base» (fe_gateway_config.credencial_ref). Cualquier otra referencia sigue usando variables de entorno (respaldo). */
export const REF_CREDENCIALES_BASE = "NEXIT_DB";

/** Gateway de PRUEBA documentado (REQUISITOS-FACTURACION-ELECTRONICA-API-EXTERNA): la pantalla no pide URL ni endpoints. */
export const URL_GATEWAY_PRUEBA = "https://gateway-bebidas-py.e-factura-hub.com";
export const TIMEOUT_GATEWAY_MS = 30000;

/** Si la configuración de la empresa usa credenciales de la base, las agrega a la configuración (solo en memoria del servidor). Sin ellas devuelve la configuración tal cual. */
export async function adjuntarCredencialesDeBase(db: Db, config: ConfigGateway, usuarioId: string): Promise<ConfigGateway> {
  if (config.credencialRef !== REF_CREDENCIALES_BASE) return config;

  const r = await db.query("SELECT o_api_usuario AS ruc, o_api_password AS password FROM fe_gateway_credenciales_leer($1::uuid, $2::uuid)", [config.empresaId, usuarioId]);
  const f = r.rows[0] as { ruc?: unknown; password?: unknown } | undefined;

  return f && typeof f.ruc === "string" && typeof f.password === "string" && f.ruc && f.password ? { ...config, credenciales: { ruc: f.ruc, password: f.password } } : config;
}

/** ¿Hay credenciales guardadas para la empresa? (booleano; sin secretos). */
export async function hayCredencialesEnBase(db: Db, empresaId: string): Promise<boolean> {
  const r = await db.query("SELECT fe_gateway_credenciales_existe($1::uuid) AS ok", [empresaId]);

  return (r.rows[0] as { ok?: unknown } | undefined)?.ok === true;
}
