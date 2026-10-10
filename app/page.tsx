import { redirect } from "next/navigation";

import { getAccessContext } from "@/lib/auth/permissions";
import { getCurrentSession } from "@/lib/auth/session";

export default async function HomePage() {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/login");
  }

  const access = await getAccessContext(session.user, session.demo === true);
  redirect(access.isPlatformAdmin ? "/administracion/empresas" : "/dashboard");
}
