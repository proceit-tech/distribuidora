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
    return { ok: false, estado: null, mensaje: fallaRed(e, "No hubo conexión con el servidor al cargar la foto (resultado incierto: verifique si ya se adjuntó antes de reenviarla).") };
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
      fallidos.push({ uid: documento.uid, estado: null, mensaje: fallaRed(e, "No hubo conexión con el servidor al cargar el documento (resultado incierto: verifique si ya se adjuntó antes de reenviarlo).") });
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

/**
 * Qué falta tras el alta, conservado como indicador NO sensible en la URL (PRD-R03-01): "archivos" = hubo foto/documentos sin confirmar; "cierre" = todos los archivos se confirmaron y solo falta cerrar la
 * carga inicial. Sin indicador o con un valor desconocido (URL antigua) se asume "archivos" (seguro: nunca se presume que todo se envió). No concede ninguna autorización: el servidor decide por sesión, empresa y creador.
 */
export type EstadoRetomada = "archivos" | "cierre";

export function leerEstadoRetomada(search: string): EstadoRetomada {
  return new URLSearchParams(search).get("pend") === "cierre" ? "cierre" : "archivos";
}

/** Dirección que se deja en la barra del navegador para retomar tras recargar. Solo contiene identificador, código y el indicador de pendencia (sin archivos ni datos del documento). */
export function urlRetomada(id: string, codigo: string, estado?: EstadoRetomada) {
  return `/productos/nuevo?retomar=${encodeURIComponent(id)}${codigo ? `&codigo=${encodeURIComponent(codigo)}` : ""}${estado ? `&pend=${estado}` : ""}`;
}

export const MENSAJE_ABANDONO =
  "Hay archivos que no pudieron cargarse. Si finaliza ahora, esos archivos no se adjuntarán al producto. ¿Desea finalizar sin los archivos pendientes?";

export type ResultadoCierreRetomada = { cerrada: true } | { cerrada: false; cancelada: boolean; mensaje: string };

/**
 * Cierre de la retomada. Si pueden faltar archivos (los de esta sesión sin confirmar, o los de una sesión anterior perdida al recargar) el cierre exige una decisión EXPLÍCITA de abandonarlos; cancelar no llama
 * al servidor. Solo un cierre confirmado por el servidor (`cerrar` ya verifica el HTTP) concluye el alta; un error la deja en retomada para reintentar. Con "cierre" (todo confirmado) se cierra directamente.
 */
export async function cerrarRetomada(
  puedenFaltarArchivos: boolean,
  confirmar: (mensaje: string) => boolean,
  cerrar: () => Promise<{ cerrada: true } | { cerrada: false; estado: number | null; mensaje: string }>,
): Promise<ResultadoCierreRetomada> {
  if (puedenFaltarArchivos && !confirmar(MENSAJE_ABANDONO)) return { cerrada: false, cancelada: true, mensaje: "" };

  const cierre = await cerrar();

  return cierre.cerrada ? { cerrada: true } : { cerrada: false, cancelada: false, mensaje: `${cierre.mensaje}${cierre.estado ? ` (código ${cierre.estado})` : ""}` };
}

/**
 * Estado tras un envío. Solo se pasa a «cierre» (cierre directo, sin confirmación) si no quedó ninguna falla, los pendientes son exactos (misma sesión) Y no se quitó ningún pendiente original sin enviarlo;
 * `fallas === 0` por sí solo NO prueba que todo se resolvió. Con un abandono sin decidir se mantiene «archivos»: el cierre pedirá la confirmación explícita.
 */
export function estadoTrasEnvio(fallas: number, exactas: boolean, abandonoSinDecidir: boolean): EstadoRetomada | null {
  if (fallas > 0) return "archivos";

  return exactas && !abandonoSinDecidir ? "cierre" : null;
}

/** Identificador de la foto en el seguimiento de archivos con intento de envío fallido (los documentos usan su uid). */
export const ID_FOTO = "foto";

/**
 * PRD-R05-01 — seguimiento de archivos cuyo envío FALLÓ (originales de la alta o nuevos con un intento fallido). Tras un envío: se agregan los que fallaron y se retiran los confirmados por el servidor.
 * Un archivo nuevo nunca enviado no entra aquí; uno confirmado sale (no es pendiente ni genera abandono).
 */
export function registrarEnvio(fallidos: readonly string[], confirmados: readonly string[], nuevosFallos: readonly string[]): string[] {
  return [...new Set([...fallidos, ...nuevosFallos])].filter((x) => !confirmados.includes(x));
}

/** Quitar un archivo de la lista: si había fallado es un ABANDONO (el cierre exigirá confirmarlo); si nunca falló, se quita sin más. */
export function quitarArchivo(fallidos: readonly string[], id: string): { fallidos: string[]; abandono: boolean } {
  return { fallidos: fallidos.filter((x) => x !== id), abandono: fallidos.includes(id) };
}
