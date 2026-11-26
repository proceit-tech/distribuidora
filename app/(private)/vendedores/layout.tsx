import { guardPage } from "@/lib/auth/permissions";

// Maestros → Vendedores: VENDEDORES.VER (el administrador de empresa pasa por RN-16). El alta y los cambios los autoriza además la API/base (solo administrador de empresa).
export default async function VendedoresLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await guardPage("VENDEDORES", "VER");
  return children;
}
