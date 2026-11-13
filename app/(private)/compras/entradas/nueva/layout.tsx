import { guardPage } from "@/lib/auth/permissions";

export default async function NuevaEntradaLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await guardPage("COMPRAS", "CREAR");
  return children;
}
