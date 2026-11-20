import type { Pool } from "pg";

import { coherenciaIva } from "@/lib/productos/fiscal";

/**
 * Servidor — Fase A de PRO-93: permisos del ajuste fiscal en la factura y «Guardar también en Productos» (FE-UX-08).
 *  · FACTURACION_ELECTRONICA.AJUSTE_FISCAL: corregir en la propia factura la unidad SIFEN, el IVA, la descripción fiscal y el GTIN de un ítem (solo para ese documento).
 *  · PRODUCTOS.EDITAR: además, guardar la clasificación de IVA corregida en el cadastro (confirmación explícita por línea). La unidad y el precio NUNCA se guardan desde la factura.
 * Sin la migración NEX-056 (o sin el permiso asignado) el usuario no puede ajustar: solo el administrador de la empresa lo tiene por definición.
 */

type Db = Pick<Pool, "query">;
type F = Record<string, unknown>;

async function tiene(db: Db, empresaId: string, usuarioId: string, recurso: string, accion: string): Promise<boolean> {
  try {
    const r = await db.query("SELECT usuario_tiene_permiso($1::uuid, $2::uuid, $3, $4) AS ok", [empresaId, usuarioId, recurso, accion]);

    return (r.rows[0] as F | undefined)?.ok === true;
  } catch {
    return false;
  }
}

export const permisoAjusteFiscal = (db: Db, empresaId: string, usuarioId: string) => tiene(db, empresaId, usuarioId, "FACTURACION_ELECTRONICA", "AJUSTE_FISCAL");
export const permisoEditarProductos = (db: Db, empresaId: string, usuarioId: string) => tiene(db, empresaId, usuarioId, "PRODUCTOS", "EDITAR");

export type ClasificacionGuardar = { productoId: string; codigo: string; afectacion: number; tasa: number; proporcion: string | null };
export type ResultadoGuardado = { productoId: string; codigo: string; estado: "GUARDADO" | "SIN_CAMBIO" | "OMITIDO" | "ERROR"; mensaje: string };

/**
 * Guarda UNA clasificación de IVA en el producto y la anota en la bitácora, en UNA sola sentencia (atómica: si la bitácora no está disponible, el producto no cambia). Solo
 * actúa si los valores realmente difieren (idempotente: repetir la misma factura no duplica bitácora). Re-verifica PRODUCTOS.EDITAR y la coherencia IVA en el servidor.
 */
export async function guardarClasificacionIva(db: Db, empresaId: string, usuarioId: string, documentoId: string, c: ClasificacionGuardar): Promise<ResultadoGuardado> {
  const base = { productoId: c.productoId, codigo: c.codigo };

  try {
    if (!(await permisoEditarProductos(db, empresaId, usuarioId))) return { ...base, estado: "ERROR", mensaje: "Sin permiso para editar Productos (PRODUCTOS.EDITAR): el cambio quedó solo en esta factura." };

    const incoherencia = coherenciaIva(c.afectacion, String(c.tasa), c.proporcion);

    if (incoherencia) return { ...base, estado: "ERROR", mensaje: incoherencia.mensaje };

    const imp = await db.query("SELECT id FROM impuestos WHERE porcentaje = $1::numeric AND activo", [c.tasa]);

    if (imp.rows.length !== 1) return { ...base, estado: "ERROR", mensaje: `No se encontró un único impuesto activo del ${c.tasa} % para guardar la clasificación.` };

    const impuestoId = String((imp.rows[0] as F).id);
    const r = await db.query(
      `WITH ant AS (
         SELECT p.id, p.afectacion_iva, p.proporcion_gravada_iva::text AS prop, i.porcentaje::text AS tasa
           FROM productos p LEFT JOIN impuestos i ON i.id = p.impuesto_id
          WHERE p.empresa_id = $1 AND p.id = $2 FOR UPDATE OF p),
       upd AS (
         UPDATE productos p SET impuesto_id = $3::uuid, afectacion_iva = $4::smallint, proporcion_gravada_iva = $5::numeric, actualizado_at = now()
           FROM ant WHERE p.empresa_id = $1 AND p.id = ant.id
            AND (p.impuesto_id IS DISTINCT FROM $3::uuid OR p.afectacion_iva IS DISTINCT FROM $4::smallint OR p.proporcion_gravada_iva IS DISTINCT FROM $5::numeric)
         RETURNING p.id),
       ins AS (
         INSERT INTO producto_clasificacion_fiscal_log (empresa_id, producto_id, documento_id, usuario_id, anterior, nuevo)
         SELECT $1, upd.id, $6::uuid, $7::uuid,
                jsonb_build_object('afectacion', ant.afectacion_iva, 'tasa', ant.tasa, 'proporcion', ant.prop),
                jsonb_build_object('afectacion', $4::smallint, 'tasa', $8::numeric, 'proporcion', $5::numeric)
           FROM upd JOIN ant ON ant.id = upd.id
         RETURNING 1)
       SELECT (SELECT count(*) FROM ant)::int AS existe, (SELECT count(*) FROM upd)::int AS cambio, (SELECT count(*) FROM ins)::int AS anotado`,
      [empresaId, c.productoId, impuestoId, c.afectacion, c.proporcion, documentoId, usuarioId, c.tasa],
    );
    const f = r.rows[0] as { existe: number; cambio: number; anotado: number } | undefined;

    if (!f || f.existe === 0) return { ...base, estado: "ERROR", mensaje: "El producto no existe en su empresa." };
    if (f.cambio === 0) return { ...base, estado: "SIN_CAMBIO", mensaje: "Productos ya tenía esta clasificación de IVA." };

    return { ...base, estado: "GUARDADO", mensaje: "Clasificación de IVA guardada también en Productos (queda registrada en la bitácora)." };
  } catch (error) {
    const pg = error as { code?: string };

    // 42P01 = la bitácora (NEX-056) todavía no existe: nada se guardó (la sentencia es atómica).
    return { ...base, estado: "ERROR", mensaje: pg.code === "42P01" ? "La bitácora de Productos (NEX-056) no está disponible: el cambio quedó solo en esta factura." : "No fue posible guardar en Productos: el cambio quedó solo en esta factura." };
  }
}
