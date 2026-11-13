import { editarSimple } from "@/lib/comercial/servidor";

// zonas: PUT (LISTAS_PRECIO.EDITAR). No hay DELETE: los registros se inactivan.
export async function PUT(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const { id } = await contexto.params;

  return editarSimple("zonas", request, id);
}
