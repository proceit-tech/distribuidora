import "server-only";

import { getCurrentSession } from "@/lib/auth/session";
import { resolveNavigation } from "@/lib/navigation/menu";
import type { ShellContext } from "@/types/shell";

export async function getShellContext(): Promise<ShellContext | null> {
  const session = await getCurrentSession();

  if (!session) {
    return null;
  }

  const user = session.user;
  const isAdmin = user.perfiles.includes("ADMIN");

  return {
    user: {
      id: user.id,
      username: user.usuario,
      displayName: `${user.nombre} ${user.apellido}`.trim(),
      roleCode: user.perfiles[0] ?? null,
      roleLabel: isAdmin
        ? "Administrador"
        : user.perfiles[0] ?? "Usuario",
    },
    company: {
      id: user.empresaId,
      code: session.demo ? "CASA_MINGO" : null,
      name: session.demo
        ? "CASA MINGO S.A."
        : "Empresa activa",
      branchName: session.demo
        ? "RUC 80003314-0 · Casa Central"
        : null,
    },
    permissions: [],
    navigation: resolveNavigation([]),
  };
}
