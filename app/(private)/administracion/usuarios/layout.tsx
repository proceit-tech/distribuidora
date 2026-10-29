import { guardCompanyAdminPage } from "@/lib/auth/permissions";

// Usuarios de la empresa: solo el administrador de empresa (nunca la plataforma). Las APIs y funciones SQL vuelven a exigirlo.
export default async function CompanyUsersLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await guardCompanyAdminPage();
  return children;
}
