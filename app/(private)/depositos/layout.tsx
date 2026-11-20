import { guardPage } from "@/lib/auth/permissions";

export default async function DepositosLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await guardPage("INVENTARIO", "VER");
  return children;
}
