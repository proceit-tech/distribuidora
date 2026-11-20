/**
 * Cierre de la carga inicial de documentos de un proveedor ya creado (PRV-M04). Verifica SIEMPRE la respuesta HTTP y la red: el proveedor existe y sus archivos ya se enviaron,
 * por lo que un fallo aquí nunca debe presentarse como éxito ni provocar un nuevo alta. El endpoint es idempotente; el creador con solo PROVEEDORES.CREAR está autorizado a
 * llamarlo mientras la carga siga abierta (no requiere acceso a la ficha).
 */
export type ResultadoCierreCarga = { cerrada: true } | { cerrada: false; estado: number | null; mensaje: string };

type Fetch = (entrada: string, init?: RequestInit) => Promise<Response>;

const MENSAJE_GENERICO = "No fue posible cerrar la carga inicial de documentos.";

export async function cerrarCargaInicialProveedor(proveedorId: string, enviar: Fetch = (e, i) => fetch(e, i)): Promise<ResultadoCierreCarga> {
  let respuesta: Response;

  try {
    respuesta = await enviar(`/api/proveedores/${encodeURIComponent(proveedorId)}/documentos/finalizar`, { method: "POST" });
  } catch {
    return { cerrada: false, estado: null, mensaje: "No hubo conexión con el servidor para cerrar la carga inicial de documentos." };
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
