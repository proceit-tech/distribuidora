/**
 * Nueva factura — presentación del flujo (solo desktop). Funciones PURAS de presentación; no tocan cálculos, payload, IVA, descuentos, stock ni numeración.
 *  · Flujo: Configuración → Cliente → Productos → Forma de pago → Revisión y emisión. La forma de pago solo se ofrece cuando hay cliente y un total válido.
 *  · Resumen previo al envío: la distribución de stock se muestra compacta («3 productos · Salida desde DEP-PRINCIPAL») con detalle expandible.
 */
export type MotivoPagoNoDisponible = "SIN_CLIENTE" | "SIN_ITEMS" | "ITEMS_INVALIDOS" | "CALCULO_INVALIDO" | "SIN_TOTAL";
export type DisponibilidadPago = { disponible: true; motivo: null; guia: "" } | { disponible: false; motivo: MotivoPagoNoDisponible; guia: string };

/** ¿Se puede editar la forma de pago? Cliente seleccionado, al menos un ítem con cantidad y precio válidos, un cálculo completo sin errores de descuento y un total mayor que cero. Nunca se muestra «cubre Gs. 0». */
export function disponibilidadPago(e: { hayCliente: boolean; nLineas: number; lineasValidas: boolean; totalPositivo: boolean; /** Resultado REAL del motor: `completo` y sin errores de descuento. Si es false no hay total fiable. */ calculoValido: boolean }): DisponibilidadPago {
  if (!e.hayCliente) return { disponible: false, motivo: "SIN_CLIENTE", guia: "Seleccione el cliente y agregue los productos para elegir la forma de pago." };
  if (e.nLineas === 0) return { disponible: false, motivo: "SIN_ITEMS", guia: "Agregue productos a la factura para elegir la forma de pago." };
  if (!e.lineasValidas) return { disponible: false, motivo: "ITEMS_INVALIDOS", guia: "Corrija las cantidades o los precios de los productos para elegir la forma de pago." };
  if (!e.calculoValido) return { disponible: false, motivo: "CALCULO_INVALIDO", guia: "Corrija los descuentos o los datos fiscales de los productos para elegir la forma de pago." };
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

/** Escape en el resumen: equivale a «Volver a editar» salvo que haya un envío en curso (no se interrumpe una operación ya iniciada). Otra tecla: sin acción. */
export function accionTeclaResumen(e: { tecla: string; enviando: boolean }): "VOLVER" | "IGNORAR" | null {
  if (e.tecla !== "Escape") return null;

  return e.enviando ? "IGNORAR" : "VOLVER";
}

/**
 * Tab / Shift+Tab dentro de una modal con `n` elementos enfocables y foco en `actual` (-1 = fuera de la modal): índice al que hay que saltar para que el foco NO escape, o null si el orden natural del
 * navegador ya se queda dentro. Sin elementos enfocables no hay salto posible (el contenedor retiene el foco).
 */
export function siguienteFocoModal(n: number, actual: number, shift: boolean): number | null {
  if (n <= 0) return null;
  if (actual < 0 || actual >= n) return shift ? n - 1 : 0;
  if (!shift && actual === n - 1) return 0;
  if (shift && actual === 0) return n - 1;

  return null;
}
