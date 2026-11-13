/**
 * PRO-330 — aviso INMEDIATO de stock en «Nueva factura» (consulta anticipada, SOLO LECTURA). Módulo sin dependencias de Node, usable en el servidor y en la pantalla:
 *  · Servidor: forma estricta de la solicitud `{sucursalId, lineas:[{productoId, cantidad}]}` (nada de controlaStock/precio/depósito/empresa del navegador), sucursal en alcance y productos de la
 *    empresa leídos de la base (el flag `controla_stock` es el de la BD). El saldo y el reparto son los de `stock-fe.ts` (fe_stock_disponibilidad + asignarStock), sin otra fórmula.
 *  · Pantalla: una sola petición agrupada por el borrador completo, con espera corta, AbortController y versión monotónica + firma (sucursal, cliente, UUID y cantidades canónicas): una respuesta
 *    tardía de otro borrador NUNCA pisa el estado vigente, ni siquiera al volver a la sucursal original. Un error técnico NO es «saldo cero».
 * La consulta es referencial (no reserva): la previa y la emisión vuelven a planificar el stock, firman `repartoHuella` y la base revalida bajo bloqueo.
 */
import type { Pool } from "pg";

import { parseDec, textoDec } from "@/lib/facturacion/calculo";
import type { LineaStock, ProductoStockPreventivo } from "@/lib/facturacion/stock-fe";
import { cantidadFacturaValida, normalizarCantidadTexto } from "@/lib/formato/cantidad-campo";
import { formatearDecimalTexto } from "@/lib/formato/decimal-texto";

type Db = Pick<Pool, "query">;
type F = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Máximo real de ítems de una FE (el mismo de `leerCuerpoFactura`). */
export const MAX_LINEAS_FE = 999;
/** 999 líneas caben holgadamente (≈ 90 bytes por línea); un cuerpo mayor se rechaza sin interpretarlo. */
export const LIMITE_CUERPO_DISPONIBILIDAD = 256 * 1024;
export const ESPERA_VERIFICACION_MS = 200;

export type SolicitudDisponibilidad = { sucursalId: string; lineas: Array<{ productoId: string; cantidad: string }> };
export type RespuestaDisponibilidad = { sucursalId: string; suficiente: boolean; productos: ProductoStockPreventivo[] };
export type ProductoParaStock = { id: string; codigo: string; descripcion: string; controlaStock: boolean };

const MAL = "Los datos enviados no son válidos.";
const soloClaves = (o: F, claves: string[]) => Object.keys(o).every((k) => claves.includes(k));
const esObjeto = (v: unknown): v is F => typeof v === "object" && v !== null && !Array.isArray(v);
/** Cantidad canónica exacta (5,0000 → «5»; 1,5 → «1.5»); null si no es > 0 con hasta 4 decimales. */
export function cantidadCanonica(texto: string): string | null {
  if (!cantidadFacturaValida(texto)) return null;

  const d = parseDec(normalizarCantidadTexto(texto), 4);

  return d === null ? null : textoDec(d);
}

// ── Servidor ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Forma ESTRICTA del cuerpo: solo `sucursalId` y `lineas` (0..999) con `productoId` UUID y `cantidad` texto > 0 de hasta 4 decimales. Cualquier otro campo se rechaza. */
export function leerSolicitudDisponibilidad(c: unknown): SolicitudDisponibilidad | string {
  if (!esObjeto(c) || !soloClaves(c, ["sucursalId", "lineas"])) return MAL;
  if (typeof c.sucursalId !== "string" || !UUID.test(c.sucursalId)) return "Seleccione la sucursal.";
  if (!Array.isArray(c.lineas) || c.lineas.length > MAX_LINEAS_FE) return `Los ítems no son válidos (máximo ${MAX_LINEAS_FE}).`;

  const lineas: SolicitudDisponibilidad["lineas"] = [];

  for (const l of c.lineas as unknown[]) {
    if (!esObjeto(l) || !soloClaves(l, ["productoId", "cantidad"]) || typeof l.productoId !== "string" || !UUID.test(l.productoId)) return "Los ítems no son válidos.";
    if (typeof l.cantidad !== "string" || l.cantidad.length > 32) return "La cantidad de un ítem no es válida.";

    const cantidad = cantidadCanonica(l.cantidad);

    if (cantidad === null) return "La cantidad de un ítem no es válida: mayor que 0, hasta 4 decimales.";
    lineas.push({ productoId: l.productoId.toLowerCase(), cantidad });
  }

  return { sucursalId: c.sucursalId.toLowerCase(), lineas };
}

/** Sucursal activa de la empresa, con establecimiento SIFEN y dentro del alcance del usuario (la misma condición de la previa). fe_stock_disponibilidad lo vuelve a verificar. */
export async function sucursalParaStock(db: Db, empresaId: string, usuarioId: string, sucursalId: string): Promise<boolean> {
  const r = await db.query(
    `SELECT 1 AS ok FROM sucursales sc
      WHERE sc.empresa_id = $1 AND sc.id = $2 AND sc.activo AND sc.establecimiento_sifen IS NOT NULL AND sucursal_en_alcance($1::uuid, $3::uuid, sc.id)`,
    [empresaId, sucursalId, usuarioId],
  );

  return r.rows.length > 0;
}

/** Productos facturables de la EMPRESA de la sesión (activos, vendibles, MERCADERIA|SERVICIO), con código, descripción de factura y `controla_stock` de la base. */
export async function productosParaStock(db: Db, empresaId: string, productoIds: string[]): Promise<ProductoParaStock[]> {
  if (productoIds.length === 0) return [];

  const r = await db.query(
    `SELECT p.id::text AS id, p.codigo, p.descripcion_factura AS descripcion, p.controla_stock AS "controlaStock"
       FROM productos p
      WHERE p.empresa_id = $1 AND p.activo AND p.vendible AND p.tipo_producto IN ('MERCADERIA','SERVICIO') AND p.id = ANY($2::uuid[])`,
    [empresaId, [...new Set(productoIds)]],
  );

  return (r.rows as F[]).map((f) => ({ id: String(f.id).toLowerCase(), codigo: String(f.codigo), descripcion: String(f.descripcion ?? ""), controlaStock: f.controlaStock === true }));
}

/** Líneas para `asignarStock` con los datos AUTORITATIVOS del servidor; null si algún producto no pertenece a la empresa o no es facturable (error genérico, sin decir cuál ni por qué). */
export function lineasParaStock(solicitud: SolicitudDisponibilidad, productos: ProductoParaStock[]): LineaStock[] | null {
  const porId = new Map(productos.map((p) => [p.id, p] as const));
  const lineas: LineaStock[] = [];

  for (const l of solicitud.lineas) {
    const p = porId.get(l.productoId);

    if (!p) return null;
    lineas.push({ productoId: p.id, codigo: p.codigo, descripcion: p.descripcion, cantidad: l.cantidad, controlaStock: p.controlaStock });
  }

  return lineas;
}

// ── Pantalla ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Lo que la pantalla sabe del borrador. `controlaStock` del catálogo solo evita consultas innecesarias (servicios); el servidor decide el estado real. */
export type BorradorStock = { sucursalId: string; clienteId: string | null; lineas: Array<{ productoId: string; cantidad: string; controlaStock?: boolean | null }> };
export type PreparacionStock = { firma: string | null; solicitud: SolicitudDisponibilidad | null; invalidas: Set<string> };

/**
 * Solicitud agrupada del borrador COMPLETO (no del último ítem): solo líneas que pueden controlar stock; un UUID con alguna cantidad inválida queda fuera (se pide «Corrija la cantidad», nunca se
 * suma una cantidad estimada). Sin sucursal o sin nada que verificar no hay consulta (firma null). La firma incluye el cliente solo como contexto de descarte en la pantalla.
 */
export function prepararVerificacion(b: BorradorStock): PreparacionStock {
  const candidatas = b.lineas.filter((l) => l.controlaStock !== false);
  const invalidas = new Set(candidatas.filter((l) => cantidadCanonica(l.cantidad) === null).map((l) => l.productoId));
  const lineas = candidatas.filter((l) => !invalidas.has(l.productoId)).map((l) => ({ productoId: l.productoId, cantidad: cantidadCanonica(l.cantidad) as string }));

  if (b.sucursalId === "" || lineas.length === 0) return { firma: null, solicitud: null, invalidas };

  return { firma: JSON.stringify([b.sucursalId, b.clienteId ?? "", lineas.map((l) => [l.productoId, l.cantidad])]), solicitud: { sucursalId: b.sucursalId, lineas }, invalidas };
}

const ESTADOS = ["SUFICIENTE", "INSUFICIENTE", "SIN_CONTROL"];
const decTexto = (v: unknown) => typeof v === "string" && parseDec(v, 4) !== null;

/** La respuesta debe ser de ESTA solicitud: misma sucursal y exactamente un resultado por UUID pedido, con cantidades decimales en texto. Si no, es un error técnico (nunca un saldo). */
export function respuestaCoherente(r: unknown, s: SolicitudDisponibilidad): r is RespuestaDisponibilidad {
  if (!esObjeto(r) || r.sucursalId !== s.sucursalId || !Array.isArray(r.productos)) return false;

  const pedidos = new Set(s.lineas.map((l) => l.productoId));
  const vistos = new Set<string>();

  for (const p of r.productos as unknown[]) {
    if (!esObjeto(p) || typeof p.productoId !== "string" || !pedidos.has(p.productoId) || vistos.has(p.productoId) || !ESTADOS.includes(String(p.estado)) || !decTexto(p.requerido)) return false;
    if (p.estado === "SIN_CONTROL" ? p.disponible !== null || p.faltante !== null : !decTexto(p.disponible) || (p.estado === "INSUFICIENTE" ? !decTexto(p.faltante) : p.faltante !== null)) return false;
    vistos.add(p.productoId);
  }

  return vistos.size === pedidos.size;
}

export async function pedirDisponibilidad(s: SolicitudDisponibilidad, signal: AbortSignal, fetchFn: typeof fetch = fetch): Promise<RespuestaDisponibilidad> {
  const r = await fetchFn("/api/facturas/stock/disponibilidad", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s), cache: "no-store", signal });
  const j = (await r.json().catch(() => null)) as F | null;

  if (!r.ok) throw new Error(typeof j?.error === "string" && j.error ? j.error : "No se pudo verificar el stock.");

  return j as unknown as RespuestaDisponibilidad;
}

export type EstadoVerificacion = { fase: "INACTIVO" | "VERIFICANDO" | "LISTO" | "ERROR"; firma: string | null; resultado: RespuestaDisponibilidad | null; mensaje: string };
const INACTIVO: EstadoVerificacion = { fase: "INACTIVO", firma: null, resultado: null, mensaje: "" };

/**
 * Controlador de la verificación (lógica pura, sin React; el temporizador es inyectable para probar secuencias). Cada cambio del borrador:
 *  · misma firma ⇒ nada (cambiar un precio no vuelve a consultar; un ERROR espera «Reintentar», sin bucles);
 *  · otra firma ⇒ aborta la petición en curso, sube la versión y pasa a VERIFICANDO de inmediato (el saldo anterior deja de valer), y consulta tras una espera corta;
 *  · sin nada que verificar ⇒ INACTIVO (estado limpio).
 * Al resolver Y al rechazar se exige versión vigente, señal no abortada y firma vigente; si no, la respuesta se descarta.
 */
export function crearVerificadorStock(dep: {
  consultar: (s: SolicitudDisponibilidad, signal: AbortSignal) => Promise<unknown>;
  esperaMs?: number;
  programar?: (f: () => void, ms: number) => unknown;
  cancelar?: (t: unknown) => void;
}) {
  const esperaMs = dep.esperaMs ?? ESPERA_VERIFICACION_MS;
  const programar = dep.programar ?? ((f: () => void, ms: number) => setTimeout(f, ms));
  const cancelar = dep.cancelar ?? ((t: unknown) => clearTimeout(t as ReturnType<typeof setTimeout>));
  const oyentes = new Set<() => void>();
  let estado: EstadoVerificacion = INACTIVO;
  let version = 0;
  let aborto: AbortController | null = null;
  let temporizador: unknown = null;
  let vigente: SolicitudDisponibilidad | null = null;

  const poner = (e: EstadoVerificacion) => {
    estado = e;
    oyentes.forEach((f) => f());
  };

  function detener() {
    aborto?.abort();
    aborto = null;
    if (temporizador !== null) cancelar(temporizador);
    temporizador = null;
    version += 1;
  }

  async function ejecutar(mia: number, firma: string, s: SolicitudDisponibilidad) {
    if (mia !== version) return;

    const control = new AbortController();
    const valida = () => mia === version && !control.signal.aborted && estado.firma === firma;

    aborto = control;
    try {
      const r = await dep.consultar(s, control.signal);

      if (!valida()) return; // respuesta tardía (otra sucursal, cantidad, cliente o borrador): se descarta
      if (!respuestaCoherente(r, s)) throw new Error("La respuesta de stock no corresponde a la factura actual.");
      poner({ fase: "LISTO", firma, resultado: { ...r, suficiente: r.productos.every((p) => p.estado !== "INSUFICIENTE") }, mensaje: "" });
    } catch (e) {
      if (!valida()) return;
      poner({ fase: "ERROR", firma, resultado: null, mensaje: e instanceof Error && e.message ? e.message : "No se pudo verificar el stock." });
    } finally {
      if (aborto === control) aborto = null;
    }
  }

  function lanzar(firma: string, s: SolicitudDisponibilidad, ms: number) {
    detener();

    const mia = version;

    vigente = s;
    poner({ fase: "VERIFICANDO", firma, resultado: null, mensaje: "" });
    temporizador = programar(() => {
      temporizador = null;
      void ejecutar(mia, firma, s);
    }, ms);
  }

  return {
    estado: () => estado,
    suscribir(f: () => void) {
      oyentes.add(f);

      return () => {
        oyentes.delete(f);
      };
    },
    actualizar(b: BorradorStock) {
      const { firma, solicitud } = prepararVerificacion(b);

      if (firma === null || solicitud === null) {
        detener();
        vigente = null;
        if (estado !== INACTIVO) poner(INACTIVO);

        return;
      }
      if (firma === estado.firma) return;
      lanzar(firma, solicitud, esperaMs);
    },
    /** «Reintentar»: fuerza una consulta real del borrador vigente, sin espera. */
    reintentar() {
      if (estado.firma === null || vigente === null) return;
      lanzar(estado.firma, vigente, 0);
    },
    /** Al desmontar: aborta y vuelve a INACTIVO sin notificar (un remontaje vuelve a consultar el borrador vigente). */
    destruir() {
      detener();
      vigente = null;
      estado = INACTIVO;
    },
  };
}

export type AvisoStock =
  | { tipo: "NINGUNO" }
  | { tipo: "VERIFICANDO" }
  | { tipo: "ERROR"; mensaje: string }
  | { tipo: "CANTIDAD_INVALIDA" }
  | { tipo: "SUFICIENTE"; requerido: string; disponible: string }
  | { tipo: "INSUFICIENTE"; codigo: string; descripcion: string; requerido: string; disponible: string; faltante: string };

/**
 * Vista para la pantalla, calculada en CADA render contra el borrador ACTUAL: un estado cuya firma no es la vigente cuenta como VERIFICANDO (nunca un verde de otro borrador).
 * `pendiente` bloquea «Revisar y confirmar» con insuficiencia, verificación en curso/vencida o error; sin nada que verificar (solo servicios, sin sucursal) no bloquea por stock.
 */
export function vistaStock(estado: EstadoVerificacion, b: BorradorStock): { avisos: Map<string, AvisoStock>; pendiente: string } {
  const { firma, solicitud, invalidas } = prepararVerificacion(b);
  const avisos = new Map<string, AvisoStock>();
  const actual = firma !== null && estado.firma === firma ? estado : null;
  const faltantes: string[] = [];

  for (const id of invalidas) avisos.set(id, { tipo: "CANTIDAD_INVALIDA" });
  for (const l of solicitud?.lineas ?? []) {
    if (avisos.has(l.productoId)) continue;
    if (!actual || actual.fase === "VERIFICANDO" || actual.fase === "INACTIVO") {
      avisos.set(l.productoId, { tipo: "VERIFICANDO" });
      continue;
    }
    if (actual.fase === "ERROR" || !actual.resultado) {
      avisos.set(l.productoId, { tipo: "ERROR", mensaje: actual.mensaje });
      continue;
    }

    const p = actual.resultado.productos.find((x) => x.productoId === l.productoId);

    if (!p) avisos.set(l.productoId, { tipo: "VERIFICANDO" });
    else if (p.estado === "SIN_CONTROL") avisos.set(l.productoId, { tipo: "NINGUNO" });
    else if (p.estado === "SUFICIENTE") avisos.set(l.productoId, { tipo: "SUFICIENTE", requerido: p.requerido, disponible: p.disponible ?? "0" });
    else {
      avisos.set(l.productoId, { tipo: "INSUFICIENTE", codigo: p.codigo, descripcion: p.descripcion, requerido: p.requerido, disponible: p.disponible ?? "0", faltante: p.faltante ?? "0" });
      faltantes.push(`${p.codigo} (faltan ${formatearDecimalTexto(p.faltante)})`);
    }
  }

  const tipos = [...avisos.values()].map((a) => a.tipo);
  const pendiente = faltantes.length > 0
    ? `corregir el stock insuficiente: ${faltantes.join(", ")}`
    : tipos.includes("ERROR") ? "reintentar la verificación de stock"
      : tipos.includes("VERIFICANDO") ? "esperar la verificación de stock" : "";

  return { avisos, pendiente };
}

/** «Stock insuficiente — Solicitado: 3 | Disponible: 2 | Faltante: 1» (decimales exactos en formato es-PY). */
export const textoInsuficiente = (a: { requerido: string; disponible: string; faltante: string }) =>
  `Stock insuficiente — Solicitado: ${formatearDecimalTexto(a.requerido)} | Disponible: ${formatearDecimalTexto(a.disponible)} | Faltante: ${formatearDecimalTexto(a.faltante)}`;
