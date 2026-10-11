import { guardPage } from "@/lib/auth/permissions";

export default async function ModuleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await guardPage("CLIENTES", "VER");
  return children;
}
