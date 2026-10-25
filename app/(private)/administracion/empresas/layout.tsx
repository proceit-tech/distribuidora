import { guardPlatformPage } from "@/lib/auth/permissions";

// Administración de empresas: exclusiva del administrador global de plataforma (los usuarios de empresa no entran).
export default async function PlatformCompaniesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await guardPlatformPage();
  return children;
}
