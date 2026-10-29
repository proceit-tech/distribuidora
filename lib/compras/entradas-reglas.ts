/**
 * E6-A / PRO-325 — reglas de la entrada de Compras (Compras → Entradas), compartidas por la pantalla y la API para que ambas validen exactamente lo mismo. Funciones puras, sin acceso a datos.
 * La validación DEFINITIVA la repite PostgreSQL (compras_entrada_registrar + motor inventario_registrar_movimiento, NEX-075 / NEX-014) dentro de la transacción del registro.
 *  · Proveedor, depósito destino y fecha operativa obligatorios; referencia libre (no es factura) y observación opcionales.
 *  · Una o más líneas (máx. 500, límite del motor): producto, cantidad > 0 con hasta 4 decimales, costo unitario EXPRESO ≥ 0 con hasta 4 decimales (vacío NO es cero), lote/vencimiento según el control del producto.
 *  · Cantidades y costos viajan como TEXTO decimal canónico (nunca float) para que el snapshot durable y la huella de K1 sean exactos.
 */
export const MAX_LINEAS_ENTRADA = 500;
export const MAX_REFERENCIA = 120;
export const MAX_OBSERVACION = 1000;
export const MAX_LOTE = 80;

export type LineaEntrada = { productoId: string; cantidad: string; costo: string; lote: string; vencimiento: string };

/** Snapshot canónico de la entrada: es lo que se reserva (K1 + huella) y lo único que el servidor ejecuta. */
export type SnapshotEntrada = { fecha: string; proveedorId: string; depositoId: string; referencia: string; observacion: string; lineas: LineaEntrada[] };

export type ModoControl = "CANTIDAD" | "LOTE" | "UNIDAD_ETIQUETADA";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECIMAL = /^\d{1,14}(\.\d{1,4})?$/;

export const esUuid = (v: string) => UUID.test(v);

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** «0012.5000» → «12.5»; «0.0» → «0». Devuelve null si no es un decimal no negativo con hasta 4 decimales (acepta coma decimal). */
export function decimalCanonico(v: unknown): string | null {
  const t = (typeof v === "number" && Number.isFinite(v) ? String(v) : typeof v === "string" ? v : "").trim().replace(",", ".");

  if (!DECIMAL.test(t)) return null;

  const [entera, frac = ""] = t.split(".");
  const e = entera.replace(/^0+(?=\d)/, "");
  const f = frac.replace(/0+$/, "");

  return f ? `${e}.${f}` : e;
}

export const esPositivo = (canonico: string) => /[1-9]/.test(canonico);

export function fechaIsoValida(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);

  if (!m) return false;

  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));

  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export type ErroresLinea = Partial<Record<"productoId" | "cantidad" | "costo" | "lote" | "vencimiento", string>>;
export type ErroresEntrada = { fecha?: string; proveedorId?: string; depositoId?: string; referencia?: string; observacion?: string; lineas?: string; porLinea: ErroresLinea[] };

export const sinErrores = (e: ErroresEntrada) => !e.fecha && !e.proveedorId && !e.depositoId && !e.referencia && !e.observacion && !e.lineas && e.porLinea.every((l) => Object.keys(l).length === 0);

/**
 * Valida la forma de la entrada. `modoDe` (opcional, solo en la pantalla) informa el control de stock del producto para validar lote y bloquear la unidad identificada; el servidor lo vuelve a comprobar en SQL.
 * `hoy` = fecha vigente de Asunción (ISO): la fecha operativa no puede ser futura.
 */
export function validarEntrada(s: SnapshotEntrada, hoy: string, modoDe?: (productoId: string) => ModoControl | undefined): ErroresEntrada {
  const e: ErroresEntrada = { porLinea: [] };

  if (!fechaIsoValida(s.fecha)) e.fecha = "Ingrese una fecha válida.";
  else if (s.fecha > hoy) e.fecha = "La fecha de la entrada no puede ser futura.";
  if (!esUuid(s.proveedorId)) e.proveedorId = "Seleccione el proveedor.";
  if (!esUuid(s.depositoId)) e.depositoId = "Seleccione el depósito destino.";
  if (s.referencia.length > MAX_REFERENCIA) e.referencia = `Máximo ${MAX_REFERENCIA} caracteres.`;
  if (s.observacion.length > MAX_OBSERVACION) e.observacion = `Máximo ${MAX_OBSERVACION} caracteres.`;
  if (s.lineas.length === 0) e.lineas = "Agregue al menos un producto.";
  if (s.lineas.length > MAX_LINEAS_ENTRADA) e.lineas = `Una entrada admite hasta ${MAX_LINEAS_ENTRADA} productos.`;

  const vistos = new Set<string>();

  for (const l of s.lineas) {
    const el: ErroresLinea = {};
    const modo = modoDe?.(l.productoId);
    const cant = decimalCanonico(l.cantidad);

    if (!esUuid(l.productoId)) el.productoId = "Seleccione un producto.";
    else if (modo === "UNIDAD_ETIQUETADA") el.productoId = "Producto con unidad identificada (serie/etiqueta): aún no se puede ingresar desde Compras.";
    if (cant === null || !esPositivo(cant)) el.cantidad = "Cantidad mayor que cero, hasta 4 decimales.";
    if (l.costo.trim() === "") el.costo = "Ingrese el costo unitario: el costo no se inventa.";
    else if (decimalCanonico(l.costo) === null) el.costo = "Costo ≥ 0 con hasta 4 decimales.";
    if (l.lote.length > MAX_LOTE) el.lote = `Máximo ${MAX_LOTE} caracteres.`;
    else if (modo === "LOTE" && !l.lote) el.lote = "Ingrese el lote: el producto se controla por lote.";
    else if (modo !== undefined && modo !== "LOTE" && l.lote) el.lote = "Este producto no se controla por lote.";
    if (l.vencimiento && !fechaIsoValida(l.vencimiento)) el.vencimiento = "Fecha no válida.";
    else if (l.vencimiento && modo !== undefined && modo !== "LOTE") el.vencimiento = "Solo para productos con lote.";

    const k = `${l.productoId}|${l.lote}`;

    if (esUuid(l.productoId) && vistos.has(k)) el.productoId = "Producto (y lote) repetido: unifique la cantidad en un solo ítem.";
    vistos.add(k);
    e.porLinea.push(el);
  }

  return e;
}

/** Primer mensaje de error (para la API, que responde un único texto). */
export function primerError(e: ErroresEntrada): string | null {
  const cab = e.fecha ?? e.proveedorId ?? e.depositoId ?? e.referencia ?? e.observacion ?? e.lineas;

  if (cab) return cab;

  const i = e.porLinea.findIndex((l) => Object.keys(l).length > 0);

  if (i < 0) return null;

  const l = e.porLinea[i];

  return `Ítem ${i + 1}: ${l.productoId ?? l.cantidad ?? l.costo ?? l.lote ?? l.vencimiento}`;
}

/** Normaliza un cuerpo recibido (o un snapshot persistido) al snapshot canónico. No valida: ver validarEntrada. */
export function normalizarEntrada(d: Record<string, unknown>): SnapshotEntrada {
  const lineas = Array.isArray(d.lineas) ? (d.lineas as unknown[]).slice(0, MAX_LINEAS_ENTRADA + 1) : [];

  return {
    fecha: texto(d.fecha, 10),
    proveedorId: texto(d.proveedorId, 40),
    depositoId: texto(d.depositoId, 40),
    referencia: texto(d.referencia, MAX_REFERENCIA + 1),
    observacion: texto(d.observacion, MAX_OBSERVACION + 1),
    lineas: lineas.map((x) => {
      const l = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      const cantidad = decimalCanonico(l.cantidad);
      const costo = decimalCanonico(l.costo);

      return {
        productoId: texto(l.productoId, 40),
        cantidad: cantidad ?? texto(l.cantidad, 30),
        costo: costo ?? texto(l.costo, 30),
        lote: texto(l.lote, MAX_LOTE + 1),
        vencimiento: texto(l.vencimiento, 10),
      };
    }),
  };
}
