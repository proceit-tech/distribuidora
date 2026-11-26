/** Auditoría (solo altas) de Productos: documentos y foto. Se registra en la MISMA transacción que la acción. */
import type { PoolClient } from "pg";

export type EntidadEventoProducto = "PRODUCTO" | "DOCUMENTO" | "IMAGEN";

export async function registrarEvento(
  conexion: PoolClient,
  e: { empresaId: string; productoId: string; entidad: EntidadEventoProducto; entidadId?: string | null; accion: string; anterior?: unknown; nuevo?: unknown; usuarioId: string },
) {
  await conexion.query(
    `INSERT INTO producto_eventos (empresa_id, producto_id, entidad, entidad_id, accion, anterior, nuevo, usuario_id)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`,
    [e.empresaId, e.productoId, e.entidad, e.entidadId ?? null, e.accion, e.anterior === undefined ? null : JSON.stringify(e.anterior), e.nuevo === undefined ? null : JSON.stringify(e.nuevo), e.usuarioId],
  );
}
