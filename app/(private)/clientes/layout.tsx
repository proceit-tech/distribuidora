import { notFound, redirect } from "next/navigation";

import { getAccessContext, hasPermission } from "@/lib/auth/permissions";
import { getCurrentSession } from "@/lib/auth/session";

// CLI-D01: el módulo admite VER (consulta) o CREAR (alta guiada). Cada subpágina exige su propio permiso: /clientes y /clientes/[id] → VER (layouts propios); /clientes/nuevo → CREAR.
export default async function ModuleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const access = await getAccessContext(session.user, session.demo === true);
  if (!hasPermission(access, "CLIENTES", "VER") && !hasPermission(access, "CLIENTES", "CREAR")) notFound();

  return children;
}
