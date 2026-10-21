/**
 * Nueva factura — presentación del flujo (solo desktop). Funciones PURAS de presentación; no tocan cálculos, payload, IVA, descuentos, stock ni numeración.
 *  · Flujo: Configuración → Cliente → Productos → Forma de pago → Revisión y emisión. La forma de pago solo se ofrece cuando hay cliente y un total válido.
 *  · Resumen previo al envío: la distribución de stock se muestra compacta («3 productos · Salida desde DEP-PRINCIPAL») con detalle expandible.
 */
export type MotivoPagoNoDisponible = "SIN_CLIENTE" | "SIN_ITEMS" | "ITEMS_INVALIDOS" | "SIN_TOTAL";
export type DisponibilidadPago = { disponible: true; motivo: null; guia: "" } | { disponible: false; motivo: MotivoPagoNoDisponible; guia: string };

/** ¿Se puede editar la forma de pago? Cliente seleccionado, al menos un ítem con cantidad y precio válidos y un total calculado mayor que cero. Nunca se muestra «cubre Gs. 0». */
export function disponibilidadPago(e: { hayCliente: boolean; nLineas: number; lineasValidas: boolean; totalPositivo: boolean }): DisponibilidadPago {
  if (!e.hayCliente) return { disponible: false, motivo: "SIN_CLIENTE", guia: "Seleccione el cliente y agregue los productos para elegir la forma de pago." };
  if (e.nLineas === 0) return { disponible: false, motivo: "SIN_ITEMS", guia: "Agregue productos a la factura para elegir la forma de pago." };
  if (!e.lineasValidas) return { disponible: false, motivo: "ITEMS_INVALIDOS", guia: "Corrija las cantidades o los precios de los productos para elegir la forma de pago." };
  if (!e.totalPositivo) return { disponible: false, motivo: "SIN_TOTAL", guia: "La forma de pago se habilita cuando la factura tiene un total calculado." };

  return { disponible: true, motivo: null, guia: "" };
}

export type SalidaStockResumen = { depositoCodigo: string; depositoNombre: string; loteCodigo?: string | null; cantidad: string };
export type LineaStockResumen = { codigo: string; descripcion: string; requerido: string; salidas: readonly SalidaStockResumen[] };

/** Resumen de una línea: «3 productos · Salida desde DEP-PRINCIPAL» (o «desde 2 depósitos: A, B»). El detalle completo sigue disponible al expandir. */
export function resumenStockCompacto(lineas: readonly LineaStockResumen[]): { productos: number; depositos: string[]; texto: string } {
  const depositos = [...new Set(lineas.flatMap((l) => l.salidas.map((s) => s.depositoCodigo)))].sort();
  const productos = lineas.length;
  const base = `${productos} producto${productos === 1 ? "" : "s"}`;
  const desde = depositos.length === 0 ? "" : depositos.length === 1 ? ` · Salida desde ${depositos[0]}` : ` · Salida desde ${depositos.length} depósitos: ${depositos.join(", ")}`;

  return { productos, depositos, texto: `${base}${desde}` };
}
