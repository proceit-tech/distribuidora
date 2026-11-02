import { guardPage } from "@/lib/auth/permissions";

// LPR-D01: la ficha de una lista exige LISTAS_PRECIO.VER (quien solo crea no consulta fichas).
export default async function FichaListaLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await guardPage("LISTAS_PRECIO", "VER");
  return children;
}
