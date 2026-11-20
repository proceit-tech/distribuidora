import { guardPage } from "@/lib/auth/permissions";

import ListadoListas from "./_components/listado-listas";

// LPR-D01: el listado exige LISTAS_PRECIO.VER (el layout del módulo también admite CREAR solo para el alta).
export default async function ListasPrecioPage() {
  await guardPage("LISTAS_PRECIO", "VER");

  return <ListadoListas />;
}
