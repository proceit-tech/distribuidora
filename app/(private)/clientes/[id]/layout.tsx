import { guardPage } from "@/lib/auth/permissions";

// CLI-D01: la ficha de un cliente exige CLIENTES.VER (quien solo crea no consulta fichas).
export default async function FichaClienteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await guardPage("CLIENTES", "VER");
  return children;
}
