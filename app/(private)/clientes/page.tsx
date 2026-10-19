import { guardPage, hasPermission } from "@/lib/auth/permissions";

import ListadoClientes from "./_components/listado-clientes";

// CLI-D01/D02: la lista exige CLIENTES.VER; «Nuevo cliente» solo se ofrece con CLIENTES.CREAR (permiso leído del contexto autenticado del servidor, nunca del navegador).
export default async function ClientesPage() {
  const { access } = await guardPage("CLIENTES", "VER");

  return <ListadoClientes puedeCrear={hasPermission(access, "CLIENTES", "CREAR")} />;
}
