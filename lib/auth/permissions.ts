import { db } from "@/lib/db";
import { isDemoMode } from "@/lib/auth/session";
import type { AuthUser } from "@/types/auth";

export async function userHasPermission(
  user: AuthUser,
  recurso: string,
  accion: string,
) {
  if (isDemoMode()) {
    return true;
  }

  const result = await db.query<{ permitido: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM usuario_perfil up
       JOIN perfiles pf ON pf.id = up.perfil_id AND pf.activo
       LEFT JOIN perfil_permiso pp ON pp.perfil_id = pf.id
       LEFT JOIN permisos pe ON pe.id = pp.permiso_id
       WHERE up.usuario_id = $1
         AND (pf.es_administrador OR (pe.recurso = $2 AND pe.accion = $3))
     ) AS permitido`,
    [user.id, recurso, accion],
  );

  return result.rows[0]?.permitido === true;
}
