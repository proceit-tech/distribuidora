import { guardPage } from "@/lib/auth/permissions";

// «Catálogos de productos» conserva su requisito (PRODUCTOS.VER) aunque el módulo admita CREAR para la alta (PRD-D01).
export default async function CatalogosProductosLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await guardPage("PRODUCTOS", "VER");
  return children;
}
