import { corregirCambio } from "@/lib/comercial/servidor";

// Corregir una cotización vigente = nueva versión; la anterior queda en el historial (LISTAS_PRECIO.EDITAR). No hay DELETE.
export async function PUT(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const { id } = await contexto.params;

  return corregirCambio(request, id);
}
