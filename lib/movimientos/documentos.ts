/**
 * Contrato de integración Movimientos ↔ documentos comerciales/fiscales (ETAPA C — preparación, SIN automatismos).
 *
 * Principio: un documento NO es un hecho físico. El stock se mueve por el EVENTO FÍSICO (entrega/remisión, recepción, retorno confirmado), y
 * para un mismo evento físico y línea existe UN solo efecto. Este módulo solo DECIDE y VALIDA (funciones puras, sin base de datos y sin
 * efectos): nada aquí registra movimientos ni emite documentos. El registro real seguiría pasando por inventario_registrar_movimiento /
 * inventario_anular_movimiento (SECURITY DEFINER). El momento de baja/alta por documento es una decisión pendiente del responsable.
 */

export type TipoDocumento = "FACTURA_VENTA" | "NOTA_REMISION" | "NOTA_CREDITO_VENTA" | "RECEPCION_COMPRA" | "FACTURA_COMPRA" | "DEVOLUCION_PROVEEDOR";

/** Finalidad de una nota de remisión: define si hay salida, traslado entre depósitos u otra operación que requiere decisión. */
export type FinalidadRemision = "ENTREGA_VENTA" | "TRASLADO_ENTRE_DEPOSITOS" | "OTRA";

export type TipoNotaCredito = "DEVOLUCION_FISICA" | "FINANCIERA";

/** Momento en que una venta baja el stock. Configuración aún NO aprobada: sin valor explícito no se genera ningún efecto por factura. */
export type MomentoBajaVenta = "FACTURA" | "REMISION_ENTREGA";

export type Efecto = "NINGUNO" | "SALIDA" | "ENTRADA" | "TRANSFERENCIA";

export type LineaDocumento = {
  lineaId: string;
  productoId: string;
  /** Cantidad en la unidad base del producto. Si no se conoce el factor de conversión, el llamador NO debe estimarla: debe dejarla en null. */
  cantidadBase: number | null;
  depositoOrigenId?: string | null;
  depositoDestinoId?: string | null;
  propiedad?: "PROPIO" | "TERCERO";
  /** Producto controlado por lote: el lote es obligatorio. */
  exigeLote?: boolean;
  loteCodigo?: string | null;
};

export type ContextoDocumento = {
  tipo: TipoDocumento;
  documentoId: string;
  /** Identificador del hecho físico (entrega, recepción, retorno). Debe ser el mismo cuando factura y remisión describen el mismo despacho. */
  eventoFisicoId: string;
  linea: LineaDocumento;
  finalidadRemision?: FinalidadRemision;
  tipoNotaCredito?: TipoNotaCredito;
  /** Retorno físico verificado (producto, cantidad, condición, depósito y propiedad). */
  retornoFisicoConfirmado?: boolean;
  /** Mercadería realmente recibida/despachada (no basta con registrar el documento). */
  hechoFisicoConfirmado?: boolean;
  momentoBajaVenta?: MomentoBajaVenta | null;
  /** Efectos ya registrados (no anulados) para esta línea: (eventoFisicoId, lineaId, efecto). */
  efectosPrevios: Array<{ eventoFisicoId: string; lineaId: string; efecto: Exclude<Efecto, "NINGUNO"> }>;
};

export type Decision = {
  efecto: Efecto;
  /** Motivo legible (para la auditoría y la pantalla). */
  motivo: string;
  /** Impedimentos: si hay alguno, no se debe registrar nada. */
  bloqueos: string[];
  /** Clave de idempotencia determinista para inventario_registrar_movimiento (solo cuando hay efecto). */
  claveIdempotencia: string | null;
};

/** Clave estable por evento físico + línea + efecto (8–120 caracteres, como exige inventario_registrar_movimiento). */
export function claveEfectoFisico(eventoFisicoId: string, lineaId: string, efecto: Exclude<Efecto, "NINGUNO">): string {
  const clave = `fis:${eventoFisicoId}:${lineaId}:${efecto}`;

  if (clave.length < 8 || clave.length > 120) throw new Error("La clave del evento físico excede los límites de idempotencia.");

  return clave;
}

const sin = (motivo: string): Decision => ({ efecto: "NINGUNO", motivo, bloqueos: [], claveIdempotencia: null });
const bloqueado = (...bloqueos: string[]): Decision => ({ efecto: "NINGUNO", motivo: "Operación bloqueada.", bloqueos, claveIdempotencia: null });

/** Validaciones comunes de la línea para un efecto dado. */
export function validarLinea(efecto: Exclude<Efecto, "NINGUNO">, l: LineaDocumento): string[] {
  const e: string[] = [];

  if (l.cantidadBase === null) e.push("Falta la cantidad en unidad base: no se estima ninguna conversión de unidades.");
  else if (!(l.cantidadBase > 0) || !Number.isFinite(l.cantidadBase)) e.push("La cantidad debe ser mayor que cero.");
  if ((efecto === "SALIDA" || efecto === "TRANSFERENCIA") && !l.depositoOrigenId) e.push("Falta el depósito de origen.");
  if ((efecto === "ENTRADA" || efecto === "TRANSFERENCIA") && !l.depositoDestinoId) e.push("Falta el depósito de destino.");
  if (efecto === "TRANSFERENCIA" && l.depositoOrigenId && l.depositoOrigenId === l.depositoDestinoId) e.push("El depósito de origen y el de destino deben ser diferentes.");
  if (l.exigeLote && !l.loteCodigo) e.push("El producto se controla por lote: indique el lote.");
  if (l.propiedad === "TERCERO") e.push("Stock de terceros: el movimiento por documento requiere propietario y no está habilitado.");

  return e;
}

/**
 * Decide el efecto físico de un documento. Reglas:
 *  · Factura de venta: salida solo si el momento de baja configurado es «FACTURA», el despacho no fue confirmado antes por remisión/entrega y no hay efecto previo.
 *  · Nota de remisión: entrega de venta → salida; traslado entre depósitos → transferencia; otra finalidad → requiere decisión (sin efecto).
 *  · Nota de crédito: devolución física con retorno confirmado → entrada; devolución sin confirmar o financiera → sin efecto.
 *  · Recepción de compra confirmada → entrada. La factura de compra por sí sola no mueve stock.
 *  · Devolución al proveedor con salida confirmada → salida.
 *  · Un mismo evento físico y línea nunca produce dos efectos (idempotencia / sin doble baja).
 */
export function decidirEfecto(c: ContextoDocumento): Decision {
  const previo = c.efectosPrevios.find((p) => p.eventoFisicoId === c.eventoFisicoId && p.lineaId === c.linea.lineaId);

  if (previo) return sin(`El evento físico ya tiene un efecto registrado (${previo.efecto}): no se repite.`);

  let efecto: Efecto = "NINGUNO";
  let motivo = "";

  switch (c.tipo) {
    case "FACTURA_VENTA":
      if (c.efectosPrevios.some((p) => p.eventoFisicoId === c.eventoFisicoId && p.efecto === "SALIDA")) return sin("El despacho ya dio salida por remisión o entrega: la factura no vuelve a bajar el stock.");
      if (c.momentoBajaVenta === undefined || c.momentoBajaVenta === null) return bloqueado("El momento de baja de stock por venta no está definido: decisión pendiente del responsable.");
      if (c.momentoBajaVenta !== "FACTURA") return sin("La baja ocurre en la remisión o entrega, no en la factura.");
      efecto = "SALIDA";
      motivo = "Factura de venta con baja configurada en la factura y sin salida previa del despacho.";
      break;
    case "NOTA_REMISION":
      if (!c.hechoFisicoConfirmado) return sin("La remisión aún no confirma el hecho físico.");
      if (c.finalidadRemision === "ENTREGA_VENTA") {
        efecto = "SALIDA";
        motivo = "Remisión de entrega de venta confirmada.";
      } else if (c.finalidadRemision === "TRASLADO_ENTRE_DEPOSITOS") {
        efecto = "TRANSFERENCIA";
        motivo = "Remisión de traslado entre depósitos confirmada.";
      } else {
        return bloqueado("La finalidad de la remisión requiere una decisión: no toda remisión es una baja definitiva.");
      }
      break;
    case "NOTA_CREDITO_VENTA":
      if (c.tipoNotaCredito !== "DEVOLUCION_FISICA") return sin("Nota de crédito financiera: no altera el stock.");
      if (!c.retornoFisicoConfirmado) return sin("La devolución física todavía no fue confirmada: sin entrada.");
      efecto = "ENTRADA";
      motivo = "Nota de crédito por devolución con retorno físico confirmado.";
      break;
    case "RECEPCION_COMPRA":
      if (!c.hechoFisicoConfirmado) return sin("La mercadería aún no fue recibida.");
      efecto = "ENTRADA";
      motivo = "Recepción de compra confirmada.";
      break;
    case "FACTURA_COMPRA":
      return sin("La factura de compra no mueve stock: la entrada ocurre con la recepción de la mercadería.");
    case "DEVOLUCION_PROVEEDOR":
      if (!c.hechoFisicoConfirmado) return sin("La mercadería aún no salió hacia el proveedor.");
      efecto = "SALIDA";
      motivo = "Devolución al proveedor con salida confirmada.";
      break;
  }

  const bloqueos = validarLinea(efecto as Exclude<Efecto, "NINGUNO">, c.linea);

  if (bloqueos.length > 0) return bloqueado(...bloqueos);

  return { efecto, motivo, bloqueos: [], claveIdempotencia: claveEfectoFisico(c.eventoFisicoId, c.linea.lineaId, efecto as Exclude<Efecto, "NINGUNO">) };
}

/** Un estorno nunca elimina el original: siempre es una operación compensatoria ligada a él (inventario_anular_movimiento). */
export function planEstorno(m: { id: string; estado: "REGISTRADO" | "ANULADO"; esAnulacion: boolean }, motivo: string): { operacion: "ANULAR" | "NINGUNA"; motivo: string } {
  if (m.esAnulacion) return { operacion: "NINGUNA", motivo: "Un movimiento de anulación no se anula." };
  if (m.estado === "ANULADO") return { operacion: "NINGUNA", motivo: "El movimiento ya fue anulado." };
  if (motivo.trim().length < 5) return { operacion: "NINGUNA", motivo: "La anulación exige un motivo (mínimo 5 caracteres)." };

  return { operacion: "ANULAR", motivo: motivo.trim() };
}
