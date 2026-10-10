import "server-only";

import { getAccessContext } from "@/lib/auth/permissions";
import { getCurrentSession } from "@/lib/auth/session";
import { resolveNavigation } from "@/lib/navigation/menu";
import type { ShellContext } from "@/types/shell";

type CompanyRow = {
  codigo: string;
  razon_social: string;
  ruc: string | null;
  dv: string | null;
};

export async function getShellContext(): Promise<ShellContext | null> {
  const session = await getCurrentSession();
  if (!session) return null;

  const user = session.user;
  const access = await getAccessContext(user, session.demo === true);
  let company: CompanyRow | null = null;

  if (!session.demo) {
    const { db } = await import("@/lib/db");
    const result = await db.query<CompanyRow>(
      `SELECT e.codigo, e.razon_social, e.ruc, e.dv
         FROM empresas e
        WHERE e.id = $1 AND e.estado = 'ACTIVA' AND NOT e.es_demo`,
      [user.empresaId],
    );
    company = result.rows[0] ?? null;
    if (!company) return null;
  }

  const displayName =
    [user.nombre, user.apellido]
      .map((part) => (typeof part === "string" ? part.trim() : ""))
      .filter(Boolean)
      .join(" ") || user.usuario;

  return {
    user: {
      id: user.id,
      username: user.usuario,
      displayName,
      roleCode: access.isPlatformAdmin ? "PLATAFORMA" : user.perfiles[0] ?? null,
      roleLabel: access.isPlatformAdmin
        ? "Administrador de plataforma"
        : access.isCompanyAdmin
          ? "Administrador de empresa"
          : user.perfiles[0] ?? "Usuario",
    },
    company: {
      id: user.empresaId,
      code: company?.codigo ?? "demo",
      name: company?.razon_social ?? "Empresa DEMO",
      branchName: company?.ruc
        ? `RUC ${company.ruc}${company.dv ? "-" + company.dv : ""}`
        : null,
    },
    permissions: access.permissions,
    navigation: resolveNavigation(access),
  };
}
