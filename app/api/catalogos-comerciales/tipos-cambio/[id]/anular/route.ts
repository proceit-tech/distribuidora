import { anularCambio } from "@/lib/comercial/servidor";

// Anular una cotización vigente (se conserva en el historial). LISTAS_PRECIO.EDITAR.
export async function POST(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  const { id } = await contexto.params;

  return anularCambio(id);
}
