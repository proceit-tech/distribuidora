import { NextResponse } from "next/server";
import type { Pool } from "pg";

import { ErrorFacturacion } from "@/lib/facturacion/shared";

/**
 * Gestión administrativa de los PUNTOS DE EXPEDICIÓN (PRO-129, NEX-057). El servidor solo valida la FORMA y traduce errores: la autoridad es la función SQL (SECURITY DEFINER), que vuelve a
 * verificar el permiso FACTURACION_ELECTRONICA.PUNTOS, el alcance de la sucursal, la confirmación y que la numeración nunca retroceda. empresa_id y usuario salen SIEMPRE de la sesión.
 * Nunca se crea un punto con numeración por omisión: el último número EMITIDO se informa y se confirma de forma expresa (también el emitido por otros sistemas).
 */

type Db = Pick<Pool, "query">;
type F = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NUMERO_MAXIMO_PUNTO = 9999998;

export async function permisoPuntos(db: Db, empresaId: string, usuarioId: string): Promise<boolean> {
  try {
    const r = await db.query("SELECT usuario_tiene_permiso($1::uuid, $2::uuid, 'FACTURACION_ELECTRONICA', 'PUNTOS') AS ok", [empresaId, usuarioId]);

    return (r.rows[0] as F | undefined)?.ok === true;
  } catch {
    return false;
  }
}

export type AltaPunto = { sucursalId: string; codigo: string; nombre: string; ultimoNumero: number };
export type ActivacionPunto = { ultimoNumero: number };

/** «Último número emitido»: entero 0…9999998 escrito explícitamente (número o texto de dígitos). Sin valor por defecto. */
export function leerUltimoNumero(v: unknown): number | string {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,7}$/.test(v.trim()) ? Number(v.trim()) : NaN;

  if (!Number.isInteger(n) || n < 0 || n > NUMERO_MAXIMO_PUNTO) return `Informe el último número realmente emitido (entero de 0 a ${NUMERO_MAXIMO_PUNTO}). Es obligatorio: no se asume cero.`;

  return n;
}

export function leerAltaPunto(c: Record<string, unknown>): AltaPunto | string {
  if (typeof c.sucursalId !== "string" || !UUID.test(c.sucursalId)) return "Seleccione la sucursal.";
  if (typeof c.codigo !== "string" || !/^\d{3}$/.test(c.codigo.trim()) || c.codigo.trim() === "000") return "El código del punto debe tener 3 dígitos (001 a 999).";
  if (typeof c.nombre !== "string" || c.nombre.trim().length < 1 || c.nombre.trim().length > 60) return "El nombre del punto debe tener de 1 a 60 caracteres.";

  const n = leerUltimoNumero(c.ultimoNumero);

  if (typeof n === "string") return n;
  if (c.confirmado !== true) return "Confirme que el último número emitido es correcto: de él depende la numeración de las facturas.";

  return { sucursalId: c.sucursalId, codigo: c.codigo.trim(), nombre: c.nombre.trim(), ultimoNumero: n };
}

export function leerActivacion(c: Record<string, unknown>): ActivacionPunto | string {
  const n = leerUltimoNumero(c.ultimoNumero);

  if (typeof n === "string") return n;
  if (c.confirmado !== true) return "Confirme que el último número emitido es correcto antes de activar el punto.";

  return { ultimoNumero: n };
}

/** Traduce los errores de las funciones SQL a respuestas dirigidas (permiso → 403; reglas → 409/422; sin NEX-057 → 409 explícito). */
export function traducirErrorPunto(error: unknown): never {
  const pg = error as { code?: string; detail?: string; message?: string };
  const m = (estado: number, texto: string) => new ErrorFacturacion(estado, texto);

  if (error instanceof ErrorFacturacion) throw error;
  if (pg.code === "42501") throw m(403, "No tiene permiso para gestionar puntos de expedición (FACTURACION_ELECTRONICA.PUNTOS).");
  if (pg.code === "42883" || pg.code === "42P01") throw m(409, "La gestión de puntos de expedición no está disponible: falta aplicar la migración NEX-057.");

  switch (pg.detail) {
    case "NEX:CONFIRMACION_REQUERIDA": throw m(422, "Confirme que el último número emitido es correcto.");
    case "NEX:NUMERO_INVALIDO": throw m(422, "El último número emitido no es válido (entero de 0 a 9999998).");
    case "NEX:CODIGO_INVALIDO": throw m(422, "El código del punto debe tener 3 dígitos (001 a 999).");
    case "NEX:NOMBRE_INVALIDO": throw m(422, "El nombre del punto debe tener de 1 a 60 caracteres.");
    case "NEX:SUCURSAL_INVALIDA": throw m(409, "La sucursal no existe, está inactiva o está fuera de su alcance.");
    case "NEX:SIN_ESTABLECIMIENTO": throw m(409, "La sucursal no tiene establecimiento SIFEN configurado: configúrelo antes de crear puntos.");
    case "NEX:PUNTO_DUPLICADO": throw m(409, "Ya existe un punto con ese código en la sucursal.");
    case "NEX:PUNTO_INVALIDO": throw m(404, "El punto de expedición no existe.");
    case "NEX:SECUENCIA_NO_CONFIGURADA": throw m(409, "El punto no tiene secuencia FE configurada: active el punto confirmando el último número emitido.");
    case "NEX:PUNTO_YA_ACTIVO": throw m(409, "El punto ya está activo.");
    case "NEX:PUNTO_YA_INACTIVO": throw m(409, "El punto ya está inactivo.");
    case "NEX:IDENTIDAD_FISCAL_DUPLICADA": throw m(409, "Ese establecimiento y código de punto ya están en uso en otra sucursal de la empresa: dos puntos con la misma identidad fiscal colisionarían en la numeración. Use otro código o desactive el otro punto.");
    case "NEX:NUMERO_MENOR_QUE_EMITIDOS": throw m(409, "El último número informado es menor que el registrado o que el ya emitido por Nexit: la numeración nunca retrocede.");
    default: throw error;
  }
}

export type PuntoFila = { id: string; codigo: string; nombre: string; ultimoNumero: number; activo: boolean; proximo: string };
export type SucursalPuntos = { id: string; nombre: string; establecimiento: string | null; puntos: PuntoFila[] };

/**
 * Sucursales activas del alcance del usuario con TODOS sus puntos (también inactivos) y la numeración de la secuencia FE (NEX-060: fe_punto_secuencias, tipo 'FE'; la secuencia de cada
 * tipo es independiente), solo de la empresa de la sesión. Un punto sin secuencia FE muestra 0 solo como valor de pantalla: no puede numerar hasta que se active confirmando su número.
 */
export async function listarPuntos(db: Db, empresaId: string, usuarioId: string): Promise<SucursalPuntos[]> {
  const r = await db.query(
    `SELECT sc.id, sc.nombre, sc.establecimiento_sifen AS establecimiento,
            coalesce(json_agg(json_build_object('id', p.id, 'codigo', p.codigo, 'nombre', p.nombre, 'ultimoNumero', coalesce(s.ultimo_numero, 0), 'activo', p.activo) ORDER BY p.codigo) FILTER (WHERE p.id IS NOT NULL), '[]'::json) AS puntos
       FROM sucursales sc
       LEFT JOIN fe_puntos_expedicion p ON p.empresa_id = sc.empresa_id AND p.sucursal_id = sc.id
       LEFT JOIN fe_punto_secuencias s ON s.empresa_id = p.empresa_id AND s.punto_id = p.id AND s.tipo_documento = 'FE'
      WHERE sc.empresa_id = $1 AND sc.activo AND sucursal_en_alcance($1::uuid, $2::uuid, sc.id)
      GROUP BY sc.id ORDER BY sc.nombre, sc.id`,
    [empresaId, usuarioId],
  );

  return (r.rows as F[]).map((s) => ({
    id: String(s.id),
    nombre: String(s.nombre),
    establecimiento: s.establecimiento === null ? null : String(s.establecimiento),
    puntos: ((s.puntos as Array<Record<string, unknown>>) ?? []).map((p) => ({
      id: String(p.id), codigo: String(p.codigo), nombre: String(p.nombre), ultimoNumero: Number(p.ultimoNumero), activo: p.activo === true, proximo: String(Number(p.ultimoNumero) + 1).padStart(7, "0"),
    })),
  }));
}

export async function crearPunto(db: Db, empresaId: string, usuarioId: string, a: AltaPunto): Promise<string> {
  try {
    const r = await db.query("SELECT fe_punto_crear($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::integer, true) AS id", [empresaId, usuarioId, a.sucursalId, a.codigo, a.nombre, a.ultimoNumero]);

    return String((r.rows[0] as F).id);
  } catch (error) {
    return traducirErrorPunto(error);
  }
}

export async function activarPunto(db: Db, empresaId: string, usuarioId: string, puntoId: string, a: ActivacionPunto): Promise<void> {
  try {
    await db.query("SELECT fe_punto_activar($1::uuid, $2::uuid, $3::uuid, $4::integer, true)", [empresaId, usuarioId, puntoId, a.ultimoNumero]);
  } catch (error) {
    traducirErrorPunto(error);
  }
}

export async function desactivarPunto(db: Db, empresaId: string, usuarioId: string, puntoId: string): Promise<void> {
  try {
    await db.query("SELECT fe_punto_desactivar($1::uuid, $2::uuid, $3::uuid)", [empresaId, usuarioId, puntoId]);
  } catch (error) {
    traducirErrorPunto(error);
  }
}

export const idPuntoValido = (v: string) => UUID.test(v);

/** Respuesta HTTP de un error de la gestión de puntos: los dirigidos con su estado; cualquier otro, 500 genérico (sin filtrar detalles internos). */
export function respuestaErrorPunto(error: unknown) {
  if (error instanceof ErrorFacturacion) return NextResponse.json({ error: error.message }, { status: error.estado });

  console.error("Error en la gestión de puntos de expedición:", error);

  return NextResponse.json({ error: "No fue posible completar la operación con el punto de expedición." }, { status: 500 });
}
