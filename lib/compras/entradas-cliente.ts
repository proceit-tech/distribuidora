/**
 * E6-A — llamadas de la pantalla a la API de Compras → Entradas. Clasifica cada respuesta sin suponer éxito: solo 200 + CONFIRMADA es una entrada registrada y solo 422 + RECHAZADA un rechazo definitivo.
 */
import { normalizarEntrada, type ModoControl, type SnapshotEntrada } from "@/lib/compras/entradas-reglas";
import { MENSAJE_INDETERMINADO_ENTRADA, MENSAJE_NO_RESERVADA_ENTRADA, type ResultadoAck, type ResultadoRegistroEntrada, type ResultadoReservaEntrada } from "@/lib/compras/entradas-intento";

export type EntradaFila = {
  id: string;
  movimientoId: string;
  numero: string;
  estado: "REGISTRADO" | "ANULADO";
  fecha: string;
  proveedorId: string;
  proveedorCodigo: string;
  proveedorNombre: string;
  proveedorDocumento: string;
  depositoId: string;
  depositoCodigo: string;
  depositoNombre: string;
  referencia: string;
  observacion: string;
  usuario: string;
  creadoEn: string;
  lineas: number;
  /** numeric como texto (suma exacta en PostgreSQL de movimiento_lineas.costo_total). */
  costoTotal: string;
  moneda: string;
};

export type EntradaLinea = {
  id: string;
  productoId: string;
  productoCodigo: string;
  productoDescripcion: string;
  unidadMedidaNombre: string;
  cantidad: string;
  costoUnitario: string | null;
  costoTotal: string | null;
  moneda: string;
  lote: string;
  fechaVencimiento: string;
};

export type EntradaDetalle = EntradaFila & { anuladoPor: string; lineasDetalle: EntradaLinea[] };

export type RespuestaEntradas = { entradas: EntradaFila[]; total: number; pagina: number; tamano: number; totalPaginas: number; permisos?: { crear: boolean } };

export type CatalogoEntrada = {
  proveedores: Array<{ id: string; codigo: string; nombre: string; fantasia: string; documento: string }>;
  depositos: Array<{ id: string; codigo: string; nombre: string }>;
  productos: Array<{ id: string; codigo: string; descripcion: string; unidadMedidaNombre: string; modoControl: ModoControl }>;
  monedaBase: string;
};

export type ConsultaEntradasCliente = { q?: string; desde?: string; hasta?: string; proveedorId?: string; depositoId?: string; estado?: string; pagina?: number };

const jsonDe = async (r: Response): Promise<Record<string, unknown> | null> => {
  try {
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
};

async function errorDe(r: Response, porDefecto: string): Promise<Error> {
  const j = await jsonDe(r);

  return new Error(typeof j?.error === "string" && j.error ? j.error : porDefecto);
}

export async function cargarEntradas(consulta: ConsultaEntradasCliente): Promise<RespuestaEntradas> {
  const p = new URLSearchParams();

  for (const [k, v] of Object.entries(consulta)) if (v !== undefined && v !== "") p.set(k, String(v));

  const r = await fetch(`/api/compras/entradas${p.size ? `?${p.toString()}` : ""}`, { cache: "no-store" });

  if (!r.ok) throw await errorDe(r, "No fue posible cargar las entradas.");

  return (await r.json()) as RespuestaEntradas;
}

export async function cargarEntrada(id: string): Promise<EntradaDetalle | null> {
  const r = await fetch(`/api/compras/entradas/${encodeURIComponent(id)}`, { cache: "no-store" });

  if (r.status === 404) return null;
  if (!r.ok) throw await errorDe(r, "No fue posible cargar la entrada.");

  return ((await r.json()) as { entrada: EntradaDetalle }).entrada;
}

export async function cargarCatalogosEntrada(): Promise<CatalogoEntrada> {
  const r = await fetch("/api/compras/entradas?modo=catalogos", { cache: "no-store" });

  if (!r.ok) throw await errorDe(r, "No fue posible cargar los catálogos.");

  return ((await r.json()) as { catalogos: CatalogoEntrada }).catalogos;
}

export type IntencionEntradaCliente = { clave: string; estado: string; snapshot: SnapshotEntrada; requiereRevision: boolean; evidenciaNumero: string | null; entradaId: string | null };
export type ConsultaPendiente = { ok: true; intencion: IntencionEntradaCliente | null } | { ok: false; mensaje: string };

const intencionDe = (i: Record<string, unknown>): IntencionEntradaCliente => ({
  clave: String(i.clave),
  estado: String(i.estado),
  snapshot: normalizarEntrada((i.snapshot ?? {}) as Record<string, unknown>),
  requiereRevision: i.requiereRevision === true,
  evidenciaNumero: typeof i.evidenciaNumero === "string" ? i.evidenciaNumero : null,
  entradaId: typeof i.entradaId === "string" ? i.entradaId : null,
});

/** Confirmada en el servidor (número y entrada originales) o null. */
export const confirmadaDe = (i: IntencionEntradaCliente) => (i.estado === "CONFIRMADA" && i.evidenciaNumero && i.entradaId ? { numero: i.evidenciaNumero, entradaId: i.entradaId } : null);

export async function consultarPendienteEntradaApi(): Promise<ConsultaPendiente> {
  let r: Response;

  try {
    r = await fetch("/api/compras/entradas/intencion", { cache: "no-store" });
  } catch {
    return { ok: false, mensaje: "No hubo conexión con el servidor para comprobar si hay una entrada anterior sin resolver." };
  }

  const j = await jsonDe(r);

  if (!r.ok) return { ok: false, mensaje: `${typeof j?.error === "string" && j.error ? j.error : "No se pudo comprobar si hay una entrada anterior sin resolver."} (código ${r.status})` };
  if (!j || !("intencion" in j)) return { ok: false, mensaje: "La respuesta del servidor no tiene el formato esperado." };

  return { ok: true, intencion: j.intencion ? intencionDe(j.intencion as Record<string, unknown>) : null };
}

/** Reserva K1 + snapshot (checkpoint durable) ANTES de enviar nada al stock. 409 «pendiente» = ya hay una entrada sin resolver de este operador: se devuelve para adoptarla. */
export async function reservarEntradaApi(clave: string, entrada: SnapshotEntrada): Promise<ResultadoReservaEntrada> {
  let r: Response;

  try {
    r = await fetch("/api/compras/entradas/intencion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clave, entrada }) });
  } catch {
    return { tipo: "FALLO", mensaje: MENSAJE_NO_RESERVADA_ENTRADA };
  }

  const j = await jsonDe(r);

  if (r.ok && j?.intencion) return { tipo: "RESERVADA" };
  if (r.status === 409 && j?.pendiente === true && j.intencion && typeof j.intencion === "object") {
    const i = intencionDe(j.intencion as Record<string, unknown>);

    return { tipo: "PENDIENTE_EXISTENTE", clave: i.clave, snapshot: i.snapshot, confirmada: confirmadaDe(i) };
  }
  if (r.status === 409 && j?.pendiente === true && j.sinVisibilidad === true) return { tipo: "PENDIENTE_NO_VISIBLE", mensaje: typeof j.error === "string" ? j.error : MENSAJE_NO_RESERVADA_ENTRADA };

  return { tipo: "FALLO", mensaje: typeof j?.error === "string" && j.error ? `${j.error} No se envió nada al stock.` : MENSAJE_NO_RESERVADA_ENTRADA };
}

export async function ejecutarEntradaApi(clave: string): Promise<ResultadoRegistroEntrada> {
  let r: Response;

  try {
    r = await fetch("/api/compras/entradas/intencion/ejecutar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clave }) });
  } catch {
    return { tipo: "INDETERMINADO", mensaje: MENSAJE_INDETERMINADO_ENTRADA };
  }

  const j = await jsonDe(r);
  const e = j?.entrada as { id?: unknown; numero?: unknown } | undefined;

  if (r.ok && j?.resuelta === "CONFIRMADA" && typeof e?.numero === "string" && typeof e.id === "string") return { tipo: "OK", numero: e.numero, entradaId: e.id, repetido: j.repetido === true };
  if (r.status === 422 && j?.resuelta === "RECHAZADA" && typeof j.error === "string") return { tipo: "RECHAZADO", mensaje: j.error, definitivo: true };
  if (r.status >= 400 && r.status < 500 && r.status !== 408 && typeof j?.error === "string" && j.error) return { tipo: "RECHAZADO", mensaje: `${j.error} (código ${r.status})`, definitivo: false };

  return { tipo: "INDETERMINADO", mensaje: MENSAJE_INDETERMINADO_ENTRADA };
}

export async function reconocerEntradaApi(clave: string): Promise<ResultadoAck> {
  let r: Response;

  try {
    r = await fetch("/api/compras/entradas/intencion/reconocer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clave }) });
  } catch {
    return { ok: false, mensaje: "No hubo conexión con el servidor para confirmar la recepción del resultado." };
  }

  const j = await jsonDe(r);

  if (r.ok && j?.reconocida === true) return { ok: true };

  return { ok: false, mensaje: `${typeof j?.error === "string" && j.error ? j.error : "No se pudo confirmar la recepción del resultado."} (código ${r.status})` };
}
