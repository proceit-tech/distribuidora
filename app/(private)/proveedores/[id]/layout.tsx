import { guardPage } from "@/lib/auth/permissions";

// PRV-D01: la ficha de un proveedor exige PROVEEDORES.VER (quien solo crea no consulta fichas).
export default async function FichaProveedorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await guardPage("PROVEEDORES", "VER");
  return children;
}
