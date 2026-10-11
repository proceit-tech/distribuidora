import { editarCatalogo } from "@/lib/productos/catalogos-admin";

// Edición / inactivación (PRODUCTOS.EDITAR). Sin borrado físico.
export async function PUT(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const { id } = await contexto.params;
  return editarCatalogo("familias", request, id);
}
