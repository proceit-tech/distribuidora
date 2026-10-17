import { guardPage } from "@/lib/auth/permissions";

export default async function NuevoMovimientoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await guardPage("MOVIMIENTOS", "CREAR");
  return children;
}
