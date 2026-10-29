import { guardPage } from "@/lib/auth/permissions";

// CC-D01: el alta exige LISTAS_PRECIO.CREAR y NO exige LISTAS_PRECIO.VER.
export default async function NuevoCatalogoComercialLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await guardPage("LISTAS_PRECIO", "CREAR");
  return children;
}
