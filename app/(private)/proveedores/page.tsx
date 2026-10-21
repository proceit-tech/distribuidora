import { guardPage, hasPermission } from "@/lib/auth/permissions";

import ListadoProveedores from "./_components/listado-proveedores";

// PRV-D01/D02: la lista exige PROVEEDORES.VER; «Nuevo proveedor» solo con PROVEEDORES.CREAR (permiso leído del contexto autenticado del servidor, nunca del navegador).
export default async function ProveedoresPage() {
  const { access } = await guardPage("PROVEEDORES", "VER");

  return <ListadoProveedores puedeCrear={hasPermission(access, "PROVEEDORES", "CREAR")} />;
}
