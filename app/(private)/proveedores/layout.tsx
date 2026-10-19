import { notFound, redirect } from "next/navigation";

import { getAccessContext, hasPermission } from "@/lib/auth/permissions";
import { getCurrentSession } from "@/lib/auth/session";

// PRV-D01: el módulo admite VER (consulta) o CREAR (alta). Cada subpágina exige su propio permiso: /proveedores y /proveedores/[id] → VER; /proveedores/nuevo → CREAR.
export default async function ModuleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const access = await getAccessContext(session.user, session.demo === true);
  if (!hasPermission(access, "PROVEEDORES", "VER") && !hasPermission(access, "PROVEEDORES", "CREAR")) notFound();

  return children;
}
