import { guardPage } from "@/lib/auth/permissions";

// CLI-D01: el alta exige CLIENTES.CREAR y NO exige CLIENTES.VER.
export default async function NuevoClienteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await guardPage("CLIENTES", "CREAR");
  return children;
}
