import { redirect } from "next/navigation";

import { getAccessContext } from "@/lib/auth/permissions";
import { getCurrentSession } from "@/lib/auth/session";
import { puedeVerDashboard, resolverInicio } from "@/lib/navigation/menu";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  // El administrador global no opera una empresa: su inicio es la administración de plataforma.
  const access = await getAccessContext(session.user, session.demo === true);
  if (access.isPlatformAdmin) redirect("/administracion/empresas");

  // F-DASH-04: sin DASHBOARD.VER no hay panel; se lleva a una página que sí tiene autorizada (o a «sin acceso», que no redirige).
  if (!puedeVerDashboard(access)) redirect(resolverInicio(access));

  return children;
}
