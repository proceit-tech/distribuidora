import { guardPage } from "@/lib/auth/permissions";

// Emisión de Notas de Crédito: mismo permiso que la emisión de facturas (FACTURACION_ELECTRONICA.CREAR). Las APIs y las funciones SQL vuelven a verificarlo.
export default async function NotasCreditoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await guardPage("FACTURACION_ELECTRONICA", "CREAR");
  return children;
}
