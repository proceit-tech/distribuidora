import "server-only";

import { getCurrentSession } from "@/lib/auth/session";
import { resolveNavigation } from "@/lib/navigation/menu";
import type { ShellContext } from "@/types/shell";

type CompanyRow = {
  codigo: string;
  razon_social: string;
  ruc: string | null;
  dv: string | null;
  administrador_global: boolean;
};

export async function getShellContext(): Promise<ShellContext | null> {
  const session = await getCurrentSession();
  if (!session) return null;

  const user = session.user;
  const isAdmin = user.perfiles.includes("ADMIN");
  let company: CompanyRow | null = null;

  if (!session.demo) {
    const { db } = await import("@/lib/db");
    const result = await db.query<CompanyRow>(
      `SELECT e.codigo, e.razon_social, e.ruc, e.dv,
              EXISTS (
                SELECT 1 FROM administradores_plataforma ap
                WHERE ap.usuario_id = $2 AND ap.empresa_id = e.id AND ap.activo
              ) AS administrador_global
         FROM empresas e
        WHERE e.id = $1 AND e.estado = 'ACTIVA' AND NOT e.es_demo`,
      [user.empresaId, user.id],
    );
    company = result.rows[0] ?? null;
    if (!company) return null;
  }

  return {
    user: {
      id: user.id,
      username: user.usuario,
      displayName: `${user.nombre} ${user.apellido}`.trim(),
      roleCode: company?.administrador_global ? "PLATAFORMA" : user.perfiles[0] ?? null,
      roleLabel: company?.administrador_global
        ? "Administrador de plataforma"
        : isAdmin ? "Administrador" : user.perfiles[0] ?? "Usuario",
    },
    company: {
      id: user.empresaId,
      code: company?.codigo ?? "casa_mingo",
      name: company?.razon_social ?? "CASA MINGO S.A.",
      branchName: company?.ruc
        ? `RUC ${company.ruc}${company.dv ? "-" + company.dv : ""}`
        : null,
    },
    permissions: [],
    navigation: resolveNavigation([]),
  };
}
