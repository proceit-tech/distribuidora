import { redirect } from "next/navigation";

import AppShell from "@/components/layout/app-shell/app-shell";
import { getShellContext } from "@/lib/auth/server-context";

export default async function PrivateLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const context = await getShellContext();

  if (!context) {
    redirect("/login");
  }
  // Contraseña provisional: hasta cambiarla no se entra a ninguna página privada.
  if (context.debeCambiarContrasena) {
    redirect("/cambiar-contrasena");
  }

  return (
    <AppShell context={context}>
      {children}
    </AppShell>
  );
}