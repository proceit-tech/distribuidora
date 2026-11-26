import { guardPage } from "@/lib/auth/permissions";

// Solo el administrador de la empresa (o un perfil con FACTURACION_ELECTRONICA.CONFIGURAR). Las APIs vuelven a verificarlo en el servidor y en la función SQL.
export default async function ConfiguracionFacturacionLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await guardPage("FACTURACION_ELECTRONICA", "CONFIGURAR");
  return children;
}
