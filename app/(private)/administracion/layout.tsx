// El árbol /administracion tiene secciones con autorizaciones DISTINTAS: Empresas es de la plataforma (empresas/layout.tsx) y Usuarios es del administrador de cada empresa (usuarios/layout.tsx).
// Cada sección aplica su propia guarda en el servidor; este layout no concede ni exige nada por sí mismo.
export default function AdministracionLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
