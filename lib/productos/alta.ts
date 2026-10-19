/**
 * Recuperación del alta de un producto YA creado (PRD-D02). El producto existe y NUNCA se vuelve a crear: lo que falla (foto, un documento o el cierre de la carga inicial) se reintenta sobre el mismo
 * identificador, con las mismas rutas y la misma autoridad del alta (PRODUCTOS.CREAR del creador mientras la carga siga abierta; el cierre es idempotente). La foto y cada documento se rastrean por
 * separado y lo confirmado por el servidor no se reenvía. Funciones puras o con `fetch` inyectado: se prueban sin navegador ni base.
 */
import { formDataDeDocumento, type DocumentoPendiente } from "@/lib/productos/documento-pendiente";
import { UUID } from "@/lib/productos/normalizar";

type Fetch = (entrada: string, init?: RequestInit) => Promise<Response>;

export type FalloArchivo = { uid: string; estado: number | null; mensaje: string };
export type ResultadoSubida = { subidos: string[]; fallidos: FalloArchivo[] };

async function mensajeDe(respuesta: Response, porDefecto: string) {
  try {
    const json = (await respuesta.json()) as { error?: unknown };

    return typeof json.error === "string" && json.error.trim() ? json.error : porDefecto;
  } catch {
    return porDefecto;
  }
}

const fallaRed = (e: unknown, porDefecto: string) => (e instanceof Error && e.message && !/fetch failed|network/i.test(e.message) ? e.message : porDefecto);

/** Sube la foto UNA vez. `ok` = confirmada por el servidor (el llamador debe dejar de conservarla); si falla se conserva para reintentar. */
export async function subirFoto(productoId: string, foto: File, enviar: Fetch = (e, i) => fetch(e, i)): Promise<{ ok: true } | { ok: false; estado: number | null; mensaje: string }> {
  const datos = new FormData();

  datos.set("archivo", foto);

  try {
    const respuesta = await enviar(`/api/productos/${encodeURIComponent(productoId)}/imagen`, { method: "POST", body: datos });

    return respuesta.ok ? { ok: true } : { ok: false, estado: respuesta.status, mensaje: await mensajeDe(respuesta, "No fue posible cargar la foto.") };
  } catch (e) {
    return { ok: false, estado: null, mensaje: fallaRed(e, "No hubo conexión con el servidor al cargar la foto.") };
  }
}

/** Sube cada documento pendiente UNA sola vez; devuelve los uid confirmados (a retirar de la lista) y los fallidos con su causa. Un metadato inválido o una caída de red son fallo del documento, no abortan los demás. */
export async function subirDocumentosPendientes(productoId: string, pendientes: DocumentoPendiente[], enviar: Fetch = (e, i) => fetch(e, i)): Promise<ResultadoSubida> {
  const subidos: string[] = [];
  const fallidos: FalloArchivo[] = [];

  for (const [indice, documento] of pendientes.entries()) {
    try {
      const respuesta = await enviar(`/api/productos/${encodeURIComponent(productoId)}/documentos`, { method: "POST", body: formDataDeDocumento(documento, indice) });

      if (respuesta.ok) subidos.push(documento.uid);
      else fallidos.push({ uid: documento.uid, estado: respuesta.status, mensaje: await mensajeDe(respuesta, "No fue posible cargar el documento.") });
    } catch (e) {
      fallidos.push({ uid: documento.uid, estado: null, mensaje: fallaRed(e, "No hubo conexión con el servidor al cargar el documento.") });
    }
  }

  return { subidos, fallidos };
}

export type Retomada = { id: string; codigo: string };

/** Lee `?retomar=<uuid>&codigo=<código>` de la URL de la alta. Un identificador que no sea UUID se ignora (se muestra el formulario normal). */
export function leerRetomada(search: string): Retomada | null {
  const p = new URLSearchParams(search);
  const id = p.get("retomar") ?? "";

  if (!UUID.test(id)) return null;

  const codigo = (p.get("codigo") ?? "").trim();

  return { id, codigo: /^[A-Za-z0-9-]{1,40}$/.test(codigo) ? codigo : "" };
}

/** Dirección que se deja en la barra del navegador para retomar tras recargar. Solo contiene identificador y código del producto. */
export function urlRetomada(id: string, codigo: string) {
  return `/productos/nuevo?retomar=${encodeURIComponent(id)}${codigo ? `&codigo=${encodeURIComponent(codigo)}` : ""}`;
}
