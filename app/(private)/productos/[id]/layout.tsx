import { guardPage } from "@/lib/auth/permissions";

// PRD-D01: la ficha de un producto exige PRODUCTOS.VER (quien solo crea no consulta fichas).
export default async function FichaProductoLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await guardPage("PRODUCTOS", "VER");
  return children;
}
