import { editarSimple } from "@/lib/comercial/servidor";

// canales: PUT (LISTAS_PRECIO.EDITAR). No hay DELETE: los registros se inactivan.
export async function PUT(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const { id } = await contexto.params;

  return editarSimple("canales", request, id);
}
