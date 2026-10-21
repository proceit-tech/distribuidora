import { guardPage, hasPermission } from "@/lib/auth/permissions";

import ListadoProductos from "./_components/listado-productos";

// PRD-D01/D05: la lista exige PRODUCTOS.VER; «Nuevo producto» solo con PRODUCTOS.CREAR (permiso leído del contexto autenticado del servidor, nunca del navegador).
export default async function ProductosPage() {
  const { access } = await guardPage("PRODUCTOS", "VER");

  return <ListadoProductos puedeCrear={hasPermission(access, "PRODUCTOS", "CREAR")} />;
}
