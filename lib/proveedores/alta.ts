/**
 * Recuperación del alta de un proveedor YA creado (PRV-R01-01/02). El proveedor existe y NUNCA se vuelve a crear: lo que falla (subida de un archivo o cierre de la carga inicial)
 * se reintenta sobre el mismo identificador, con las mismas rutas y la misma autoridad del alta (PROVEEDORES.CREAR del creador mientras la carga siga abierta; el cierre es idempotente).
 * Funciones puras o con `fetch` inyectado: se prueban sin navegador ni base.
 */
import { formDataDeDocumento, type DocumentoPendiente } from "@/lib/proveedores/documento-pendiente";
import { UUID } from "@/lib/proveedores/normalizar";

type Fetch = (entrada: string, init?: RequestInit) => Promise<Response>;

export type FalloDocumento = { uid: string; estado: number | null; mensaje: string };
export type ResultadoSubida = { subidos: string[]; fallidos: FalloDocumento[] };

async function mensajeDe(respuesta: Response, porDefecto: string) {
  try {
    const json = (await respuesta.json()) as { error?: unknown };

    return typeof json.error === "string" && json.error.trim() ? json.error : porDefecto;
  } catch {
    return porDefecto;
  }
}

/**
 * Sube cada documento pendiente UNA sola vez. Devuelve los uid subidos (que el llamador debe retirar de su lista para no duplicarlos al reintentar) y los fallidos con su causa.
 * Un metadato inválido o una caída de red cuentan como fallo del documento, nunca como excepción que aborte los demás.
 */
export async function subirDocumentosPendientes(proveedorId: string, pendientes: DocumentoPendiente[], enviar: Fetch = (e, i) => fetch(e, i)): Promise<ResultadoSubida> {
  const subidos: string[] = [];
  const fallidos: FalloDocumento[] = [];

  for (const [indice, documento] of pendientes.entries()) {
    try {
      const respuesta = await enviar(`/api/proveedores/${encodeURIComponent(proveedorId)}/documentos`, { method: "POST", body: formDataDeDocumento(documento, indice) });

      if (respuesta.ok) subidos.push(documento.uid);
      else fallidos.push({ uid: documento.uid, estado: respuesta.status, mensaje: await mensajeDe(respuesta, "No fue posible cargar el documento.") });
    } catch (e) {
      fallidos.push({ uid: documento.uid, estado: null, mensaje: e instanceof Error && e.message && !/fetch failed|network/i.test(e.message) ? e.message : "No hubo conexión con el servidor al cargar el documento." });
    }
  }

  return { subidos, fallidos };
}

export type Retomada = { id: string; codigo: string };

/** Lee `?retomar=<uuid>&codigo=<código>` de la URL de la página de alta. Un identificador que no sea UUID se ignora (se muestra el formulario normal). */
export function leerRetomada(search: string): Retomada | null {
  const p = new URLSearchParams(search);
  const id = p.get("retomar") ?? "";

  if (!UUID.test(id)) return null;

  const codigo = (p.get("codigo") ?? "").trim();

  return { id, codigo: /^[A-Za-z0-9-]{1,40}$/.test(codigo) ? codigo : "" };
}

/** Dirección que se deja en la barra del navegador para poder retomar tras recargar. No contiene datos del proveedor salvo su identificador y código. */
export function urlRetomada(id: string, codigo: string) {
  return `/proveedores/nuevo?retomar=${encodeURIComponent(id)}${codigo ? `&codigo=${encodeURIComponent(codigo)}` : ""}`;
}
