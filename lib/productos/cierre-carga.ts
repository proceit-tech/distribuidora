/**
 * Cierre de la carga inicial de documentos/foto de un producto ya creado (PRD-AUD-07). Verifica SIEMPRE la respuesta HTTP:
 * el producto existe y sus archivos ya se enviaron, por lo que un fallo aquí nunca debe tratarse como éxito ni provocar un nuevo alta.
 */
export type ResultadoCierreCarga = { cerrada: true } | { cerrada: false; estado: number | null; mensaje: string };

type Fetch = (entrada: string, init?: RequestInit) => Promise<Response>;

const MENSAJE_GENERICO = "No fue posible cerrar la carga inicial de archivos.";

export async function cerrarCargaInicial(productoId: string, enviar: Fetch = (e, i) => fetch(e, i)): Promise<ResultadoCierreCarga> {
  let respuesta: Response;

  try {
    respuesta = await enviar(`/api/productos/${encodeURIComponent(productoId)}/documentos/finalizar`, { method: "POST" });
  } catch {
    return { cerrada: false, estado: null, mensaje: "No hubo conexión con el servidor para cerrar la carga inicial." };
  }

  if (respuesta.ok) return { cerrada: true };

  let mensaje = MENSAJE_GENERICO;

  try {
    const json = (await respuesta.json()) as { error?: unknown };

    if (typeof json.error === "string" && json.error.trim()) mensaje = json.error;
  } catch {
    // cuerpo no JSON: se conserva el mensaje genérico
  }

  return { cerrada: false, estado: respuesta.status, mensaje };
}
