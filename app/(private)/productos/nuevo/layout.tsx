import { guardPage } from "@/lib/auth/permissions";

// PRD-D01: el alta exige PRODUCTOS.CREAR y NO exige PRODUCTOS.VER.
export default async function NuevoProductoLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await guardPage("PRODUCTOS", "CREAR");
  return children;
}
