import { guardPage } from "@/lib/auth/permissions";

export default async function FacturacionAdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await guardPage("FACTURACION_ELECTRONICA", "PUNTOS");
  return children;
}
