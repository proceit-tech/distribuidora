import type { Cliente } from "@/lib/reportes/snapshot";

/**
 * Depósitos del alcance del usuario (todos si su alcance es TODOS; si no, los asignados en usuario_deposito), ACTIVOS E INACTIVOS: mismo criterio que
 * Inventario > Stock y que deposito_en_alcance de NEX-046 («activos o no»). El valor/saldo de un depósito inactivo no puede desaparecer de un informe
 * (NEX-046 impide inactivar con saldo, pero el informe no lo presume). No otorga acceso a nada fuera de la empresa de la sesión ni de los depósitos asignados.
 * No sustituye a `depositosPermitidos` (solo activos) que usan otros informes.
 */
export async function depositosDelAlcance(c: Cliente, empresaId: string, usuarioId: string) {
  const r = await c.query(
    `SELECT d.id, d.nombre, d.activo FROM depositos d JOIN usuarios u ON u.empresa_id = d.empresa_id AND u.id = $2
      WHERE d.empresa_id = $1 AND (u.alcance_depositos = 'TODOS'
         OR EXISTS (SELECT 1 FROM usuario_deposito ud WHERE ud.empresa_id = u.empresa_id AND ud.usuario_id = u.id AND ud.deposito_id = d.id))
      ORDER BY d.activo DESC, d.nombre`,
    [empresaId, usuarioId],
  );

  return r.rows as { id: string; nombre: string; activo: boolean }[];
}
