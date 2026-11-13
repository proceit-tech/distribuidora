import { guardPage } from "@/lib/auth/permissions";

export default async function FacturasLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await guardPage("FACTURACION_ELECTRONICA", "CREAR");
  return children;
}
