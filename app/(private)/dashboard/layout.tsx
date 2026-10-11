import { redirect } from "next/navigation";

import { getAccessContext } from "@/lib/auth/permissions";
import { getCurrentSession } from "@/lib/auth/session";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  // El administrador global no opera una empresa: su inicio es la administración de plataforma.
  const access = await getAccessContext(session.user, session.demo === true);
  if (access.isPlatformAdmin) redirect("/administracion/empresas");

  return children;
}
