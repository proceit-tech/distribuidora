import { guardPage } from "@/lib/auth/permissions";

import ListadoCatalogosComerciales from "./_components/catalogos-comerciales";

// CC-D01: el listado, la consulta y el historial exigen LISTAS_PRECIO.VER (el layout del módulo también admite CREAR solo para el alta).
export default async function CatalogosComercialesPage() {
  await guardPage("LISTAS_PRECIO", "VER");

  return <ListadoCatalogosComerciales />;
}
