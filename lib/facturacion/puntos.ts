import { NextResponse } from "next/server";
import type { Pool } from "pg";

import { numeracionSiguiente, textoNumeracion } from "@/lib/facturacion/series";
import { ErrorFacturacion } from "@/lib/facturacion/shared";

/**
 * Gestión administrativa de los PUNTOS DE EXPEDICIÓN y de su configuración POR TIPO DOCUMENTAL (PRO-129, NEX-057, NEX-060, NEX-063; DECISION-PUNTOS-TIPOS-SERIES-2026-10-17). El servidor solo valida la
 * FORMA y traduce errores: la autoridad son las funciones SQL (SECURITY DEFINER), que vuelven a verificar el permiso FACTURACION_ELECTRONICA.PUNTOS, el alcance de la sucursal, la confirmación y que la
 * numeración (serie + número) nunca retroceda. empresa_id y usuario salen SIEMPRE de la sesión.
 *
 * Modelo: el punto administrativo (empresa + establecimiento + código) se registra UNA vez; cada tipo (FE, NCE, NRE, NDE, AFE) tiene su propia configuración (serie actual + último número) y su estado.
 * Nunca se crea un tipo con numeración por omisión: el último número EMITIDO y la serie se informan y se confirman una sola vez (también lo emitido por otros sistemas).
 */

type Db = Pick<Pool, "query">;
type F = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NUMERO_MAXIMO_PUNTO = 9999999;
export const TIPOS_DOCUMENTO_PUNTO = ["FE", "NCE", "NRE", "NDE", "AFE"] as const;
export type TipoDocumentoPunto = (typeof TIPOS_DOCUMENTO_PUNTO)[number];
/** Tipos cuyo flujo de emisión existe hoy. NRE/NDE/AFE solo se pueden CONFIGURAR; su emisión sigue bloqueada hasta tener flujo, contrato y validaciones propios. */
export const TIPOS_EMITIBLES: readonly TipoDocumentoPunto[] = ["FE", "NCE"];
export const ETIQUETA_TIPO_PUNTO: Record<TipoDocumentoPunto, string> = { FE: "Factura electrónica", NCE: "Nota de crédito", NRE: "Nota de remisión", NDE: "Nota de débito", AFE: "Autofactura" };

export const esTipoDocumentoPunto = (v: unknown): v is TipoDocumentoPunto => typeof v === "string" && (TIPOS_DOCUMENTO_PUNTO as readonly string[]).includes(v);

export async function permisoPuntos(db: Db, empresaId: string, usuarioId: string): Promise<boolean> {
  try {
    const r = await db.query("SELECT usuario_tiene_permiso($1::uuid, $2::uuid, 'FACTURACION_ELECTRONICA', 'PUNTOS') AS ok", [empresaId, usuarioId]);

    return (r.rows[0] as F | undefined)?.ok === true;
  } catch {
    return false;
  }
}

export type RegistroPunto = { sucursalId: string; codigo: string; nombre: string };
export type ConfiguracionTipo = { tipo: TipoDocumentoPunto; serie: string | null; ultimoNumero: number; activar: boolean };

/** «Último número emitido»: entero 0…9999999 escrito explícitamente (número o texto de dígitos). Sin valor por defecto. */
export function leerUltimoNumero(v: unknown): number | string {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,7}$/.test(v.trim()) ? Number(v.trim()) : NaN;

  if (!Number.isInteger(n) || n < 0 || n > NUMERO_MAXIMO_PUNTO) return `Informe el último número realmente emitido (entero de 0 a ${NUMERO_MAXIMO_PUNTO}). Es obligatorio: no se asume cero.`;

  return n;
}

/** Serie: vacía/«Sin serie» (null) o dos letras AA…ZZ (se normaliza a mayúsculas). Nunca se asume «AA». */
export function leerSerie(v: unknown): string | null | { error: string } {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return { error: "La serie no es válida." };

  const t = v.trim().toUpperCase();

  if (t === "" || t === "SIN SERIE" || t === "SIN_SERIE") return null;
  if (!/^[A-Z]{2}$/.test(t)) return { error: "La serie debe estar vacía (sin serie) o tener dos letras (AA a ZZ)." };

  return t;
}

export function leerRegistroPunto(c: Record<string, unknown>): RegistroPunto | string {
  if (typeof c.sucursalId !== "string" || !UUID.test(c.sucursalId)) return "Seleccione la sucursal.";
  if (typeof c.codigo !== "string" || !/^\d{3}$/.test(c.codigo.trim()) || c.codigo.trim() === "000") return "El código del punto debe tener 3 dígitos (001 a 999).";
  if (typeof c.nombre !== "string" || c.nombre.trim().length < 1 || c.nombre.trim().length > 60) return "El nombre del punto debe tener de 1 a 60 caracteres.";

  return { sucursalId: c.sucursalId, codigo: c.codigo.trim(), nombre: c.nombre.trim() };
}

export function leerConfiguracionTipo(c: Record<string, unknown>): ConfiguracionTipo | string {
  if (!esTipoDocumentoPunto(c.tipo)) return "Seleccione el tipo de documento (FE, NCE, NRE, NDE o AFE).";

  const serie = leerSerie(c.serie);

  if (serie !== null && typeof serie === "object") return serie.error;

  const n = leerUltimoNumero(c.ultimoNumero);

  if (typeof n === "string") return n;
  if (c.confirmado !== true) return "Confirme que la serie y el último número emitido son correctos: de ellos depende la numeración de los documentos.";
  if (c.activar !== undefined && typeof c.activar !== "boolean") return "El estado de activación no es válido.";

  return { tipo: c.tipo, serie, ultimoNumero: n, activar: c.activar === true };
}

export function leerEstado(c: Record<string, unknown>): boolean | string {
  return typeof c.activo === "boolean" ? c.activo : "Indique el estado deseado (activo o inactivo).";
}

/** Traduce los errores de las funciones SQL a respuestas dirigidas (permiso → 403; reglas → 409/422; sin la migración → 409 explícito). */
export function traducirErrorPunto(error: unknown): never {
  const pg = error as { code?: string; detail?: string; message?: string };
  const m = (estado: number, texto: string) => new ErrorFacturacion(estado, texto);

  if (error instanceof ErrorFacturacion) throw error;
  if (pg.code === "42501") throw m(403, "No tiene permiso para gestionar puntos de expedición (FACTURACION_ELECTRONICA.PUNTOS).");
  if (pg.code === "42883" || pg.code === "42P01" || pg.code === "42703") throw m(409, "La gestión de puntos por tipo de documento no está disponible: falta aplicar la migración NEX-063.");

  switch (pg.detail) {
    case "NEX:CONFIRMACION_REQUERIDA": throw m(422, "Confirme que la serie y el último número emitido son correctos.");
    case "NEX:NUMERO_INVALIDO": throw m(422, "El último número emitido no es válido (entero de 0 a 9999999).");
    case "NEX:SERIE_INVALIDA": throw m(422, "La serie debe estar vacía (sin serie) o tener dos letras (AA a ZZ).");
    case "NEX:TIPO_INVALIDO": throw m(422, "El tipo de documento o el estado indicado no es válido.");
    case "NEX:CODIGO_INVALIDO": throw m(422, "El código del punto debe tener 3 dígitos (001 a 999).");
    case "NEX:NOMBRE_INVALIDO": throw m(422, "El nombre del punto debe tener de 1 a 60 caracteres.");
    case "NEX:SUCURSAL_INVALIDA": throw m(409, "La sucursal no existe, está inactiva o está fuera de su alcance.");
    case "NEX:SIN_ESTABLECIMIENTO": throw m(409, "La sucursal no tiene establecimiento SIFEN configurado: configúrelo antes de crear puntos.");
    case "NEX:PUNTO_DUPLICADO": throw m(409, "Ya existe un punto con ese código en la sucursal.");
    case "NEX:PUNTO_INVALIDO": throw m(404, "El punto de expedición no existe.");
    case "NEX:SECUENCIA_NO_CONFIGURADA": throw m(409, "Ese tipo de documento no está configurado en el punto: configure primero la serie y el último número emitido.");
    case "NEX:PUNTO_YA_ACTIVO": throw m(409, "El punto ya está activo.");
    case "NEX:PUNTO_YA_INACTIVO": throw m(409, "El punto ya está inactivo.");
    case "NEX:TIPO_YA_ACTIVO": throw m(409, "El tipo de documento ya está activo en el punto.");
    case "NEX:TIPO_YA_INACTIVO": throw m(409, "El tipo de documento ya está inactivo en el punto.");
    case "NEX:IDENTIDAD_FISCAL_DUPLICADA": throw m(409, "Ese establecimiento y código de punto ya están en uso en otra sucursal de la empresa: dos puntos con la misma identidad fiscal colisionarían en la numeración. Use otro código o desactive el otro punto.");
    case "NEX:NUMERO_MENOR_QUE_EMITIDOS": throw m(409, "La serie y el número informados son menores que los ya registrados o emitidos por Nexit: la numeración nunca retrocede.");
    default: throw error;
  }
}

/** Configuración de UN tipo en un punto. `ultimoNumero`/`proximo` provienen de la secuencia real: nunca se inventa un contador. `proximo` es referencial (el definitivo se reserva al emitir). */
export type TipoConfigurado = { tipo: TipoDocumentoPunto; serie: string | null; ultimoNumero: number; activo: boolean; proximo: string | null; emitible: boolean };
export type PuntoFila = { id: string; codigo: string; nombre: string; activo: boolean; tipos: TipoConfigurado[] };
export type SucursalPuntos = { id: string; nombre: string; establecimiento: string | null; puntos: PuntoFila[] };

/** Texto del próximo número referencial: «AA-0000001», «0000001» o «Agotada» (ZZ-9999999). */
export function proximoReferencial(serie: string | null, ultimoNumero: number): string {
  const s = numeracionSiguiente(serie, ultimoNumero);

  return s === null ? "Agotada" : textoNumeracion(s.serie, s.numero);
}

const SQL_LISTA = (conNuevo: boolean) => `SELECT sc.id, sc.nombre, sc.establecimiento_sifen AS establecimiento,
            coalesce(json_agg(json_build_object('id', p.id, 'codigo', p.codigo, 'nombre', p.nombre, 'activo', p.activo,
              'tipos', coalesce((SELECT json_agg(json_build_object('tipo', q.tipo_documento, 'serie', ${conNuevo ? "q.serie" : "NULL"}, 'ultimoNumero', q.ultimo_numero, 'activo', ${conNuevo ? "q.activo" : "true"}) ORDER BY q.tipo_documento)
                                   FROM fe_punto_secuencias q WHERE q.empresa_id = p.empresa_id AND q.punto_id = p.id), '[]'::json)) ORDER BY p.codigo) FILTER (WHERE p.id IS NOT NULL), '[]'::json) AS puntos
       FROM sucursales sc
       LEFT JOIN fe_puntos_expedicion p ON p.empresa_id = sc.empresa_id AND p.sucursal_id = sc.id
      WHERE sc.empresa_id = $1 AND sc.activo AND sucursal_en_alcance($1::uuid, $2::uuid, sc.id)
      GROUP BY sc.id ORDER BY sc.nombre, sc.id`;

/**
 * Sucursales activas del alcance del usuario con TODOS sus puntos (también inactivos) y, de cada uno, sus tipos configurados con serie, último número y estado (fe_punto_secuencias), solo de la
 * empresa de la sesión. Un punto sin ningún tipo se devuelve con `tipos` vacío. Si todavía falta NEX-063 (columnas serie/activo) se lista con la numeración básica: sin serie y activos.
 */
export async function listarPuntos(db: Db, empresaId: string, usuarioId: string): Promise<SucursalPuntos[]> {
  let r;

  try {
    r = await db.query(SQL_LISTA(true), [empresaId, usuarioId]);
  } catch (error) {
    if ((error as { code?: string }).code !== "42703") throw error;

    r = await db.query(SQL_LISTA(false), [empresaId, usuarioId]);
  }

  return (r.rows as F[]).map((s) => ({
    id: String(s.id),
    nombre: String(s.nombre),
    establecimiento: s.establecimiento === null ? null : String(s.establecimiento),
    puntos: ((s.puntos as Array<Record<string, unknown>>) ?? []).map((p) => ({
      id: String(p.id), codigo: String(p.codigo), nombre: String(p.nombre), activo: p.activo === true,
      tipos: ((p.tipos as Array<Record<string, unknown>> | undefined) ?? []).filter((q) => esTipoDocumentoPunto(q.tipo)).map((q) => {
        const serie = q.serie === null || q.serie === undefined ? null : String(q.serie);
        const ultimo = Number(q.ultimoNumero);

        return {
          tipo: String(q.tipo) as TipoDocumentoPunto, serie, ultimoNumero: ultimo, activo: q.activo !== false, proximo: proximoReferencial(serie, ultimo),
          emitible: TIPOS_EMITIBLES.includes(String(q.tipo) as TipoDocumentoPunto),
        };
      }),
    })),
  }));
}

export async function registrarPunto(db: Db, empresaId: string, usuarioId: string, a: RegistroPunto): Promise<string> {
  try {
    const r = await db.query("SELECT fe_punto_registrar($1::uuid, $2::uuid, $3::uuid, $4, $5) AS id", [empresaId, usuarioId, a.sucursalId, a.codigo, a.nombre]);

    return String((r.rows[0] as F).id);
  } catch (error) {
    return traducirErrorPunto(error);
  }
}

/** Informa y confirma (UNA vez) la serie y el último número realmente emitido de UN tipo de un punto existente. Nunca presume 0 ni retrocede. Los demás tipos no se tocan. */
export async function configurarTipoPunto(db: Db, empresaId: string, usuarioId: string, puntoId: string, a: ConfiguracionTipo): Promise<void> {
  try {
    await db.query("SELECT fe_secuencia_configurar($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::integer, true, $7::boolean)", [empresaId, usuarioId, puntoId, a.tipo, a.serie, a.ultimoNumero, a.activar]);
  } catch (error) {
    traducirErrorPunto(error);
  }
}

export async function cambiarEstadoTipo(db: Db, empresaId: string, usuarioId: string, puntoId: string, tipo: TipoDocumentoPunto, activo: boolean): Promise<void> {
  try {
    await db.query("SELECT fe_secuencia_estado($1::uuid, $2::uuid, $3::uuid, $4, $5::boolean)", [empresaId, usuarioId, puntoId, tipo, activo]);
  } catch (error) {
    traducirErrorPunto(error);
  }
}

export async function cambiarEstadoPunto(db: Db, empresaId: string, usuarioId: string, puntoId: string, activo: boolean): Promise<void> {
  try {
    await db.query("SELECT fe_punto_estado($1::uuid, $2::uuid, $3::uuid, $4::boolean)", [empresaId, usuarioId, puntoId, activo]);
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
