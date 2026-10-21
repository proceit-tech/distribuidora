import { guardPage } from "@/lib/auth/permissions";

// PRV-D01: el alta exige PROVEEDORES.CREAR y NO exige PROVEEDORES.VER.
export default async function NuevoProveedorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await guardPage("PROVEEDORES", "CREAR");
  return children;
}
