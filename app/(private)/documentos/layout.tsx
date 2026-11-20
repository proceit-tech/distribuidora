import { guardPage } from "@/lib/auth/permissions";

export default async function DocumentosLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await guardPage("FACTURACION_ELECTRONICA", "VER");
  return children;
}
