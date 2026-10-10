import { guardPlatformPage } from "@/lib/auth/permissions";

export default async function PlatformLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await guardPlatformPage();
  return children;
}
