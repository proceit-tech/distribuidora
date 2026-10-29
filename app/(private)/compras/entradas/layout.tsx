import { guardPage } from "@/lib/auth/permissions";

export default async function ComprasEntradasLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await guardPage("COMPRAS", "VER");
  return children;
}
