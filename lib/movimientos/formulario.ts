/**
 * Formulario «Nuevo movimiento de stock»: reglas de pantalla (puras, sin red). La API y las funciones SQL siguen siendo la autoridad:
 * aquí solo se anticipan los rechazos conocidos (lib/movimientos/shared.ts y NEX-014) para señalar el campo exacto antes de enviar.
 * Nada de lo que se precarga por la dirección (producto, tipo, depósitos, cantidad) se acepta sin validarlo contra el catálogo que la API
 * entrega para la sesión (depósitos autorizados, productos activos con control de stock).
 */
import type { CatalogoMovimientos, MovimientoProductoOpcion, MovimientoStockOrigen, MovimientoStockTipo, NuevoMovimientoStock } from "@/types/movimientos-stock";

export type TipoInfo = {
  etiqueta: string;
  /** Consecuencia sobre el stock, en una línea. */
  descripcion: string;
  origen: boolean;
  destino: boolean;
  costo: boolean;
  /** Orígenes operativos coherentes con el tipo (el primero es el predeterminado). La API acepta cualquiera; no implican un documento. */
  origenes: MovimientoStockOrigen[];
  /** Estado de stock del que sale la cantidad en el depósito de origen (para avisar si supera lo visible). */
  consume?: "disponible" | "reservado" | "cuarentena";
};

export const TIPOS_INFO: Record<MovimientoStockTipo, TipoInfo> = {
  ENTRADA: { etiqueta: "Entrada", descripcion: "Ingresa stock propio disponible al depósito destino, con su costo.", origen: false, destino: true, costo: true, origenes: ["COMPRA", "DEVOLUCION", "INVENTARIO", "MANUAL"] },
  SALIDA: { etiqueta: "Salida", descripcion: "Descuenta stock disponible del depósito origen al costo promedio vigente.", origen: true, destino: false, costo: false, origenes: ["VENTA", "DEVOLUCION", "INVENTARIO", "MANUAL"], consume: "disponible" },
  TRANSFERENCIA: { etiqueta: "Transferencia", descripcion: "Traslada stock disponible entre dos depósitos distintos.", origen: true, destino: true, costo: false, origenes: ["TRANSFERENCIA"], consume: "disponible" },
  AJUSTE_POSITIVO: { etiqueta: "Ajuste positivo", descripcion: "Aumenta el stock disponible por una diferencia de inventario, con su costo.", origen: false, destino: true, costo: true, origenes: ["AJUSTE", "INVENTARIO", "MANUAL"] },
  AJUSTE_NEGATIVO: { etiqueta: "Ajuste negativo", descripcion: "Disminuye el stock disponible por una diferencia de inventario.", origen: true, destino: false, costo: false, origenes: ["AJUSTE", "INVENTARIO", "MANUAL"], consume: "disponible" },
  RESERVA: { etiqueta: "Reserva", descripcion: "Pasa stock de disponible a reservado en el mismo depósito.", origen: true, destino: false, costo: false, origenes: ["AJUSTE", "MANUAL"], consume: "disponible" },
  LIBERACION_RESERVA: { etiqueta: "Liberación de reserva", descripcion: "Devuelve stock de reservado a disponible en el mismo depósito.", origen: true, destino: false, costo: false, origenes: ["AJUSTE", "MANUAL"], consume: "reservado" },
  CUARENTENA: { etiqueta: "Cuarentena", descripcion: "Pasa stock de disponible a cuarentena (no vendible) en el mismo depósito.", origen: true, destino: false, costo: false, origenes: ["AJUSTE", "MANUAL"], consume: "disponible" },
  LIBERACION_CUARENTENA: { etiqueta: "Liberación de cuarentena", descripcion: "Devuelve stock de cuarentena a disponible en el mismo depósito.", origen: true, destino: false, costo: false, origenes: ["AJUSTE", "MANUAL"], consume: "cuarentena" },
};

export const ORDEN_TIPOS = Object.keys(TIPOS_INFO) as MovimientoStockTipo[];

export const ETIQUETA_ORIGEN: Record<MovimientoStockOrigen, string> = {
  MANUAL: "Manual",
  COMPRA: "Compra",
  VENTA: "Venta",
  DEVOLUCION: "Devolución",
  TRANSFERENCIA: "Transferencia",
  AJUSTE: "Ajuste",
  INVENTARIO: "Inventario",
};

export type CampoMovimiento = "tipo" | "origen" | "fecha" | "productoId" | "cantidad" | "costoUnitario" | "depositoOrigenId" | "depositoDestinoId" | "lote" | "fechaVencimiento" | "documentoReferencia" | "motivo" | "observacion";
export type ErroresMovimiento = Partial<Record<CampoMovimiento, string>>;

export function formularioInicial(hoy: string): NuevoMovimientoStock {
  return {
    tipo: "ENTRADA", origen: "COMPRA", fecha: hoy, productoId: "", cantidad: 0, costoUnitario: null, depositoOrigenId: "", depositoDestinoId: "",
    lote: "", fechaVencimiento: "", documentoReferencia: "", motivo: "", observacion: "", claveIdempotencia: "",
  };
}

/** Al cambiar el tipo: se conserva el origen si sigue siendo coherente; si no, el predeterminado del tipo. Se limpian los campos que ya no aplican. */
export function aplicarTipo(f: NuevoMovimientoStock, tipo: MovimientoStockTipo): NuevoMovimientoStock {
  const info = TIPOS_INFO[tipo];

  return {
    ...f,
    tipo,
    origen: info.origenes.includes(f.origen) ? f.origen : info.origenes[0],
    depositoOrigenId: info.origen ? f.depositoOrigenId : "",
    depositoDestinoId: info.destino ? f.depositoDestinoId : "",
    costoUnitario: info.costo ? f.costoUnitario : null,
    fechaVencimiento: info.destino && tipo !== "TRANSFERENCIA" ? f.fechaVencimiento : "",
  };
}

const decimalesValidos = (n: number) => Math.abs(n - Math.round(n * 10000) / 10000) <= 1e-9;

/** El orden de las claves del resultado es el orden visual del formulario: la primera recibe el foco. */
export function validarMovimiento(f: NuevoMovimientoStock, catalogo: CatalogoMovimientos | null, hoy: string): ErroresMovimiento {
  const e: ErroresMovimiento = {};
  const info = TIPOS_INFO[f.tipo];
  const producto = catalogo?.productos.find((p) => p.id === f.productoId);
  const permitidos = new Set((catalogo?.depositos ?? []).filter((d) => d.permitido).map((d) => d.id));

  if (!info) e.tipo = "Seleccione el tipo de movimiento.";
  if (!f.fecha) e.fecha = "Ingrese una fecha válida.";
  else if (f.fecha > hoy) e.fecha = "La fecha del movimiento no puede ser futura.";

  if (!f.productoId) e.productoId = "Seleccione un producto.";
  else if (!producto) e.productoId = "El producto no está disponible para movimientos.";
  else if (producto.modoControl === "UNIDAD_ETIQUETADA") e.productoId = "Los productos con unidad identificada (serie/etiqueta) aún no se pueden mover desde esta pantalla.";

  if (!Number.isFinite(f.cantidad) || f.cantidad <= 0) e.cantidad = "La cantidad debe ser mayor que cero.";
  else if (!decimalesValidos(f.cantidad)) e.cantidad = "La cantidad admite hasta 4 decimales.";

  if (info?.costo && (f.costoUnitario === null || !Number.isFinite(f.costoUnitario) || f.costoUnitario < 0)) e.costoUnitario = "Ingrese el costo unitario: el costo no se inventa.";

  if (info?.origen) {
    if (!f.depositoOrigenId) e.depositoOrigenId = "Seleccione el depósito origen.";
    else if (!permitidos.has(f.depositoOrigenId)) e.depositoOrigenId = "No tiene acceso a ese depósito.";
  }

  if (info?.destino) {
    if (!f.depositoDestinoId) e.depositoDestinoId = "Seleccione el depósito destino.";
    else if (!permitidos.has(f.depositoDestinoId)) e.depositoDestinoId = "No tiene acceso a ese depósito.";
  }
  if (f.tipo === "TRANSFERENCIA" && f.depositoOrigenId && f.depositoOrigenId === f.depositoDestinoId && !e.depositoDestinoId) e.depositoDestinoId = "El depósito origen y destino deben ser diferentes.";

  if (producto?.modoControl === "LOTE") {
    if (!f.lote.trim()) e.lote = "Ingrese el lote: este producto se controla por lote.";
    else if (f.lote.trim().length > 80) e.lote = "El lote no puede superar los 80 caracteres.";
  }
  if (f.fechaVencimiento && f.fechaVencimiento < f.fecha && !e.fecha) e.fechaVencimiento = "El vencimiento no puede ser anterior a la fecha del movimiento.";

  if (f.documentoReferencia.trim().length > 120) e.documentoReferencia = "La referencia no puede superar los 120 caracteres.";
  if (f.motivo.trim().length > 300) e.motivo = "El motivo no puede superar los 300 caracteres.";
  if (f.observacion.trim().length > 1000) e.observacion = "La observación no puede superar los 1000 caracteres.";

  return e;
}

/** Saldo visible del depósito relevante (origen; si no hay, destino; sin depósito, el total de los depósitos autorizados). */
export function saldoVisible(producto: MovimientoProductoOpcion | undefined, depositoId: string) {
  return (producto?.stock ?? [])
    .filter((x) => !depositoId || x.depositoId === depositoId)
    .reduce((a, x) => ({ disponible: a.disponible + x.disponible, reservado: a.reservado + x.reservado, cuarentena: a.cuarentena + x.cuarentena, transito: a.transito + x.transito }), { disponible: 0, reservado: 0, cuarentena: 0, transito: 0 });
}

/** Advertencia (no bloqueante: la función SQL decide) cuando la cantidad supera lo visible en el estado del que sale. */
export function advertenciaSaldo(f: NuevoMovimientoStock, producto: MovimientoProductoOpcion | undefined): string {
  const consume = TIPOS_INFO[f.tipo]?.consume;

  if (!consume || !producto || !f.depositoOrigenId || !(f.cantidad > 0)) return "";

  const visible = saldoVisible(producto, f.depositoOrigenId)[consume];

  if (f.cantidad <= visible) return "";

  return `La cantidad supera el ${consume} visible en el depósito origen (${visible}). El sistema validará el saldo real al registrar${producto.modoControl === "LOTE" ? " y el lote indicado" : ""}.`;
}

export function movimientoSucio(actual: NuevoMovimientoStock, base: NuevoMovimientoStock): boolean {
  const n = (f: NuevoMovimientoStock) => [f.tipo, f.origen, f.fecha, f.productoId, f.cantidad, f.costoUnitario, f.depositoOrigenId, f.depositoDestinoId, f.lote.trim(), f.fechaVencimiento, f.documentoReferencia.trim(), f.motivo.trim(), f.observacion.trim()];

  return JSON.stringify(n(actual)) !== JSON.stringify(n(base));
}

/**
 * Precarga desde la dirección (?producto=&tipo=&depositoOrigen=&depositoDestino=&cantidad=). Cada valor se descarta si no coincide con el catálogo
 * de la sesión: producto activo con control de stock y no «unidad identificada», depósitos autorizados, tipo conocido, cantidad positiva.
 * Devuelve el formulario precargado y los valores descartados (para avisar). La API vuelve a verificar todo al registrar.
 */
export function precargarDesdeConsulta(params: URLSearchParams, catalogo: CatalogoMovimientos, base: NuevoMovimientoStock): { formulario: NuevoMovimientoStock; descartados: string[]; precargado: boolean } {
  const descartados: string[] = [];
  let f = base;
  let precargado = false;
  const tipo = params.get("tipo");

  if (tipo) {
    if ((ORDEN_TIPOS as string[]).includes(tipo)) {
      f = aplicarTipo(f, tipo as MovimientoStockTipo);
      precargado = true;
    } else descartados.push("el tipo de movimiento");
  }

  const productoId = params.get("producto");

  if (productoId) {
    const p = catalogo.productos.find((x) => x.id === productoId);

    if (p && p.modoControl !== "UNIDAD_ETIQUETADA") {
      f = { ...f, productoId: p.id };
      precargado = true;
    } else descartados.push("el producto");
  }

  const permitidos = new Set(catalogo.depositos.filter((d) => d.permitido).map((d) => d.id));
  const info = TIPOS_INFO[f.tipo];

  for (const [clave, campo, aplica] of [["depositoOrigen", "depositoOrigenId", info.origen], ["depositoDestino", "depositoDestinoId", info.destino]] as const) {
    const id = params.get(clave);

    if (!id) continue;
    if (aplica && permitidos.has(id)) {
      f = { ...f, [campo]: id };
      precargado = true;
    } else descartados.push(clave === "depositoOrigen" ? "el depósito origen" : "el depósito destino");
  }

  const cantidadTexto = params.get("cantidad");

  if (cantidadTexto) {
    const c = Number(cantidadTexto);

    if (Number.isFinite(c) && c > 0 && decimalesValidos(c)) {
      f = { ...f, cantidad: c };
      precargado = true;
    } else descartados.push("la cantidad");
  }

  return { formulario: f, descartados, precargado };
}

/** Dirección de «Nuevo movimiento» con datos de contexto (solo identificadores y cantidad; el destino los valida contra la sesión). */
export function enlaceNuevoMovimiento(d: { productoId: string; tipo?: MovimientoStockTipo; depositoOrigenId?: string; depositoDestinoId?: string; cantidad?: number }): string {
  const q = new URLSearchParams();

  q.set("producto", d.productoId);
  if (d.tipo) q.set("tipo", d.tipo);
  if (d.depositoOrigenId) q.set("depositoOrigen", d.depositoOrigenId);
  if (d.depositoDestinoId) q.set("depositoDestino", d.depositoDestinoId);
  if (d.cantidad && d.cantidad > 0) q.set("cantidad", String(d.cantidad));

  return `/movimientos/nuevo?${q.toString()}`;
}
