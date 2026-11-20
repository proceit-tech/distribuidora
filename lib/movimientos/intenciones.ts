/**
 * MOV-O07 / PRO-188 — orquestación de servidor de la intención DURABLE de registro (NEX-066). Identidad y empresa llegan SIEMPRE de la sesión (parámetros), nunca del cliente; K1 no autentica nada.
 *  · reservarIntencion: valida el movimiento, y reserva K1 + snapshot con COMMIT independiente ANTES de cualquier operación que pueda alterar stock.
 *  · consultarIntencion: solo lectura de la pendiente del operador (con la evidencia del movimiento original, si existe).
 *  · reconocerIntencion (ACK, MOV-R08-01): el operador confirma haber recibido el resultado de una intención CONFIRMADA; solo entonces queda libre una intención nueva. No toca stock.
 *  · ejecutarIntencion: usa SIEMPRE el snapshot persistido y K1; ejecuta el motor `inventario_registrar_movimiento` y marca CONFIRMADA en la MISMA transacción. Rechazo definitivo solo si el servidor ejecutó,
 *    revirtió con éxito y la base confirma que no existe movimiento; cualquier otra falla deja la intención pendiente (K1 retenida, sin K2).
 */
import type { PoolClient } from "pg";

import { prepararMovimiento, registrarMovimiento, type DatosMovimiento } from "@/lib/movimientos/shared";

type Db = { connect(): Promise<PoolClient> };

export class ErrorIntencion extends Error {
  constructor(mensaje: string, readonly estado: number, readonly extra: Record<string, unknown> = {}) {
    super(mensaje);
  }
}

export type IntencionDto = { clave: string; estado: string; snapshot: Record<string, unknown>; creadoEn: string; requiereRevision: boolean; evidenciaNumero: string | null };
export type ResultadoReconocimiento = { numero: string };
export type ResultadoEjecucion = { tipo: "OK"; numero: string; repetido: boolean } | { tipo: "RECHAZADA"; mensaje: string };

/** Snapshot canónico de lo YA validado (sin la clave, sin credenciales ni contexto de usuario). */
export function snapshotDe(d: DatosMovimiento): Record<string, unknown> {
  return {
    tipo: d.tipo, origen: d.origen, fecha: d.fecha, productoId: d.productoId, cantidad: d.cantidad, costo: d.costo, origenId: d.origenId, destinoId: d.destinoId,
    lote: d.lote, vencimiento: d.vencimiento, documento: d.documento, motivo: d.motivo, observacion: d.observacion,
  };
}

/** Reconstruye los datos desde el snapshot persistido (y los vuelve a validar con las mismas reglas), con la K1 original. La fecha original NO se recalcula. */
export function datosDeSnapshot(s: Record<string, unknown>, clave: string): DatosMovimiento {
  return prepararMovimiento({
    tipo: s.tipo, origen: s.origen, fecha: s.fecha, productoId: s.productoId, cantidad: s.cantidad, costoUnitario: s.costo,
    depositoOrigenId: s.origenId ?? "", depositoDestinoId: s.destinoId ?? "", lote: s.lote ?? "", fechaVencimiento: s.vencimiento ?? "",
    documentoReferencia: s.documento ?? "", motivo: s.motivo ?? "", observacion: s.observacion ?? "", claveIdempotencia: clave,
  });
}

type Fila = Record<string, unknown>;
const dto = (f: Fila): IntencionDto => ({
  clave: String(f.clave), estado: String(f.estado), snapshot: f.snapshot as Record<string, unknown>, creadoEn: f.creado_at instanceof Date ? f.creado_at.toISOString() : String(f.creado_at),
  requiereRevision: f.requiere_revision === true, evidenciaNumero: typeof f.evidencia_numero === "string" ? f.evidencia_numero : null,
});

const SQL_PENDIENTE = `SELECT o_clave AS clave, o_estado AS estado, o_snapshot AS snapshot, o_creado_at AS creado_at, o_requiere_revision AS requiere_revision, o_evidencia_numero AS evidencia_numero FROM movimiento_intencion_pendiente($1::uuid, $2::uuid)`;

const pg = (e: unknown) => e as { code?: string; message?: string; detail?: string };

/**
 * MOV-R09-02: mensaje NEUTRO cuando el operador ya no puede ver la operación (perdió MOVIMIENTOS.VER o el alcance de un depósito). No incluye datos de la operación. La intención se conserva en el servidor.
 */
export const MENSAJE_SIN_VISIBILIDAD =
  "La operación anterior no puede recuperarse con los permisos actuales. Se requiere la intervención de un administrador autorizado; la operación sigue guardada y no se habilitó ninguna operación nueva.";

const sinVisibilidad = (e: unknown) => pg(e).code === "42501" && pg(e).detail?.startsWith("NEX:INTENCION_SIN_VISIBILIDAD") === true;
const errorSinVisibilidad = () => new ErrorIntencion(MENSAJE_SIN_VISIBILIDAD, 403, { sinVisibilidad: true });

async function liberar(c: PoolClient) {
  c.release();
}

export async function consultarIntencion(db: Db, empresaId: string, usuarioId: string): Promise<IntencionDto | null> {
  const c = await db.connect();

  try {
    const r = await c.query(SQL_PENDIENTE, [empresaId, usuarioId]);

    return r.rows[0] ? dto(r.rows[0] as Fila) : null;
  } catch (e) {
    if (sinVisibilidad(e)) throw errorSinVisibilidad();
    if (pg(e).code === "42501") throw new ErrorIntencion("No tiene permiso para registrar movimientos.", 403);
    throw e;
  } finally {
    await liberar(c);
  }
}

export async function reservarIntencion(db: Db, empresaId: string, usuarioId: string, cuerpo: Record<string, unknown>): Promise<{ intencion: IntencionDto; nueva: boolean }> {
  let datos: DatosMovimiento;

  try {
    datos = prepararMovimiento(cuerpo);
  } catch (e) {
    throw new ErrorIntencion(e instanceof Error ? e.message : "Los datos del movimiento no son válidos.", 400);
  }
  if (!datos.clave || datos.clave.length < 8) throw new ErrorIntencion("Falta la clave del registro.", 400);

  const c = await db.connect();

  try {
    await c.query("BEGIN");
    const r = await c.query(
      `SELECT o_clave AS clave, o_estado AS estado, o_snapshot AS snapshot, o_creado_at AS creado_at, o_nueva AS nueva FROM movimiento_intencion_reservar($1::uuid, $2::uuid, $3, $4::jsonb)`,
      [empresaId, usuarioId, datos.clave, JSON.stringify(snapshotDe(datos))],
    );

    await c.query("COMMIT"); // checkpoint durable: a partir de aquí K1 y el snapshot sobreviven a cualquier fallo posterior

    const f = r.rows[0] as Fila;

    return { intencion: dto({ ...f, requiere_revision: false, evidencia_numero: null }), nueva: f.nueva === true };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);

    const x = pg(e);

    // MOV-R10-01: repetir una K1 existente sin visibilidad vigente → bloqueo neutro (sin snapshot, número ni DTO); la intención y K2 quedan como estaban.
    if (sinVisibilidad(e)) throw new ErrorIntencion(MENSAJE_SIN_VISIBILIDAD, 409, { pendiente: true, intencion: null, sinVisibilidad: true });
    if (x.code === "42501") throw new ErrorIntencion("No tiene permiso para registrar movimientos.", 403);
    if (x.code === "P0001" && x.detail?.startsWith("NEX:INTENCION_PENDIENTE")) {
      let invisible = false;
      const existente = await c.query(SQL_PENDIENTE, [empresaId, usuarioId]).then(
        (r) => (r.rows[0] ? dto(r.rows[0] as Fila) : null),
        (e2) => {
          invisible = sinVisibilidad(e2);

          return null;
        },
      );

      // Con una pendiente que el operador ya no puede ver NO se devuelve nada de ella; se informa el bloqueo de forma neutra (K2 sigue bloqueada por la base).
      throw new ErrorIntencion(invisible ? MENSAJE_SIN_VISIBILIDAD : "Hay un registro anterior sin resolver. Recupérelo antes de iniciar otro movimiento.", 409, { pendiente: true, intencion: existente, ...(invisible ? { sinVisibilidad: true } : {}) });
    }
    if (x.code === "P0001" && x.detail?.startsWith("NEX:INTENCION_CONFLICTO")) throw new ErrorIntencion("La clave del registro no está disponible.", 409);
    if (x.code === "23505") throw new ErrorIntencion("Hay un registro anterior sin resolver. Recupérelo antes de iniciar otro movimiento.", 409, { pendiente: true, intencion: null });
    throw e;
  } finally {
    await liberar(c);
  }
}

/** ¿Es una falla DETERMINISTA del motor (la transacción se revirtió y el movimiento NO existe)? Los errores de conexión, tiempo y permiso NO lo son. */
/** ACK idempotente de una intención CONFIRMADA (empresa y usuario de la SESIÓN). No registra, anula ni altera stock; repetirlo o perder su respuesta es seguro. */
export async function reconocerIntencion(db: Db, empresaId: string, usuarioId: string, clave: string): Promise<ResultadoReconocimiento> {
  const c = await db.connect();

  try {
    await c.query("BEGIN");
    const r = await c.query(`SELECT o_numero AS numero FROM movimiento_intencion_reconocer($1::uuid, $2::uuid, $3)`, [empresaId, usuarioId, clave]);

    await c.query("COMMIT");

    return { numero: String((r.rows[0] as Fila).numero) };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);

    const x = pg(e);

    if (sinVisibilidad(e)) throw errorSinVisibilidad();
    if (x.code === "42501") throw new ErrorIntencion("No tiene permiso para registrar movimientos.", 403);
    if (x.code === "P0002") throw new ErrorIntencion("Registro no encontrado.", 404);
    if (x.code === "P0001" && x.detail?.startsWith("NEX:INTENCION_NO_CONFIRMADA")) throw new ErrorIntencion("El registro todavía no está confirmado; no puede reconocerse.", 409);
    throw e;
  } finally {
    await liberar(c);
  }
}

export function esRechazoDeterminista(e: unknown): boolean {
  const x = pg(e);

  if (typeof x.code === "string" && x.code.length === 5) {
    if (x.code === "42501" || x.code.startsWith("08") || x.code.startsWith("40") || x.code.startsWith("53") || x.code.startsWith("57") || x.code.startsWith("58")) return false;
    if (x.code === "P0001") return !x.detail?.startsWith("NEX:IDEMPOTENCIA_CONFLICTO") && !x.detail?.startsWith("NEX:INTENCION");
    if (x.code === "P0002") return false;

    return x.code.startsWith("22") || x.code.startsWith("23");
  }
  if (typeof x.code === "string") return false; // códigos de sistema (ECONNRESET, ETIMEDOUT…)

  // Error plano de las validaciones de la aplicación (p. ej. lote inexistente), salvo mensajes de conexión.
  return !/conex|connection|terminated|timeout|timed out|socket|ECONN|network/i.test(x.message ?? "");
}

const MENSAJE_RECHAZO = "El movimiento fue rechazado por las reglas de inventario; no se registró ningún movimiento.";

export async function ejecutarIntencion(db: Db, empresaId: string, usuarioId: string, clave: string): Promise<ResultadoEjecucion> {
  const c = await db.connect();
  let comprometiendo = false;

  try {
    await c.query("BEGIN");

    const t = (await c.query(`SELECT o_estado AS estado, o_snapshot AS snapshot, o_numero AS numero FROM movimiento_intencion_tomar($1::uuid, $2::uuid, $3)`, [empresaId, usuarioId, clave])).rows[0] as Fila;

    if (t.estado === "CONFIRMADA") {
      await c.query("COMMIT");

      return { tipo: "OK", numero: String(t.numero), repetido: true };
    }
    if (t.estado === "RECHAZADA_DEFINITIVA") {
      await c.query("COMMIT");

      return { tipo: "RECHAZADA", mensaje: MENSAJE_RECHAZO };
    }

    const datos = datosDeSnapshot(t.snapshot as Record<string, unknown>, clave);
    const mov = await registrarMovimiento(c, empresaId, usuarioId, datos);

    await c.query(`SELECT movimiento_intencion_confirmar($1::uuid, $2::uuid, $3, $4::uuid, $5)`, [empresaId, usuarioId, clave, mov.id, mov.numero]);
    comprometiendo = true;
    await c.query("COMMIT");

    return { tipo: "OK", numero: mov.numero, repetido: mov.repetido };
  } catch (e) {
    if (comprometiendo) throw e; // el COMMIT pudo haberse efectuado: resultado desconocido, la intención sigue pendiente

    const revertida = await c.query("ROLLBACK").then(() => true, () => false);

    if (e instanceof ErrorIntencion) throw e;

    const x = pg(e);

    if (x.code === "P0002") throw new ErrorIntencion("Registro no encontrado.", 404);
    if (revertida && sinVisibilidad(e)) throw errorSinVisibilidad();
    if (revertida && x.code === "42501") throw new ErrorIntencion("No tiene permiso o alcance sobre el depósito para esta operación. El registro sigue pendiente.", 403);
    if (revertida && esRechazoDeterminista(e)) {
      try {
        await c.query("BEGIN");
        await c.query(`SELECT movimiento_intencion_rechazar($1::uuid, $2::uuid, $3, $4)`, [empresaId, usuarioId, clave, x.message ?? MENSAJE_RECHAZO]);
        await c.query("COMMIT");
      } catch {
        await c.query("ROLLBACK").catch(() => undefined);
        throw new ErrorIntencion("No se pudo resolver el registro; sigue pendiente y puede reintentarse.", 409);
      }

      return { tipo: "RECHAZADA", mensaje: x.message && x.code ? x.message : (e instanceof Error ? e.message : MENSAJE_RECHAZO) };
    }
    if (revertida && x.code === "P0001" && x.detail?.startsWith("NEX:IDEMPOTENCIA_CONFLICTO")) throw new ErrorIntencion("La clave ya se usó con otra solicitud; el registro sigue pendiente.", 409);
    throw e;
  } finally {
    await liberar(c);
  }
}

/** Cuerpo y estado HTTP de la ejecución (misma traducción para la ruta y para las pruebas): 200 confirmada; 422 + `resuelta: "RECHAZADA"` = rechazo definitivo comprobado. */
export function respuestaEjecucion(r: ResultadoEjecucion): { status: number; body: Record<string, unknown> } {
  if (r.tipo === "RECHAZADA") return { status: 422, body: { error: r.mensaje, resuelta: "RECHAZADA" } };

  return { status: 200, body: { resuelta: "CONFIRMADA", movimiento: { numero: r.numero }, repetido: r.repetido } };
}

/** Cuerpo del ACK: 200 con el número original. */
export function respuestaReconocimiento(r: ResultadoReconocimiento): { status: number; body: Record<string, unknown> } {
  return { status: 200, body: { reconocida: true, movimiento: { numero: r.numero } } };
}

/** Un error de la intención conserva su estado HTTP; cualquier otro es un 500 genérico sin datos del movimiento ni del SQL. Una respuesta no conclusiva NUNCA libera la intención. */
export function respuestaDeError(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof ErrorIntencion) return { status: error.estado, body: { error: error.message, ...error.extra } };

  return { status: 500, body: { error: "No fue posible completar la operación. El movimiento puede haberse registrado." } };
}

/** Política del POST directo antiguo /api/movimientos (PRO-190): retirado, 410 en TODOS los casos; indica el flujo durable. No depende de sesión, permisos, base ni del cuerpo. */
export function respuestaPostLegado(): { status: number; body: Record<string, unknown> } {
  return {
    status: 410,
    body: { error: "El registro directo de movimientos fue retirado. Use «Nuevo movimiento»: el registro ahora exige una reserva durable previa.", flujo: "/api/movimientos/intencion" },
  };
}
