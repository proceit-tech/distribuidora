import { PAGO_UI_VACIO, type PagoUI } from "@/lib/facturacion/pagos";
import { CREDITO_UI_VACIO, type EstadoCreditoUI } from "@/lib/facturacion/credito";

/**
 * ¿La Nueva factura tiene cambios sin enviar? (PRO-128, UX-29). Antes solo miraba cliente, líneas y observaciones; ahora TODA decisión del operador cuenta: sucursal/punto elegidos a mano, condición, moneda,
 * cambio, tipo de transacción, presencia, medios de pago y crédito. Los valores por defecto (y la sucursal/punto que se preseleccionan solos al cargar el catálogo) NO cuentan: sin falsos positivos.
 */
export type EstadoFormulario = {
  cliente: boolean; lineas: number; infoAdicional: string; ubicacionElegidaPorElOperador: boolean; tipoTransaccion: string; presencia: string; condicion: string; moneda: string; cambio: string;
  pagos: PagoUI[]; credito: EstadoCreditoUI;
};

const pagoModificado = (p: PagoUI): boolean => (Object.keys(PAGO_UI_VACIO) as Array<keyof PagoUI>).some((k) => p[k] !== PAGO_UI_VACIO[k]);
const creditoModificado = (c: EstadoCreditoUI): boolean => (Object.keys(CREDITO_UI_VACIO) as Array<keyof EstadoCreditoUI>).some((k) => JSON.stringify(c[k]) !== JSON.stringify(CREDITO_UI_VACIO[k]));

/**
 * Qué se PERDERÍA al cambiar la Moneda o la Condición (AUD-PRO128-R01-01): las reglas de limpieza no cambian (precios no convertidos, pagos y entrega reiniciados), pero ya no ocurren en silencio. Lista
 * vacía = no hay nada digitado que perder y el cambio se aplica sin confirmación.
 */
export function perdidasAlCambiarMoneda(e: { precios: Array<{ actual: string; nuevo: string }>; pagos: PagoUI[]; credito: EstadoCreditoUI; cambio: string; aMoneda: string }): string[] {
  const p: string[] = [];
  const preciosCambian = e.precios.filter((x) => x.actual !== x.nuevo && x.actual.trim() !== "").length;

  if (preciosCambian > 0) p.push(`el precio de ${preciosCambian} ítem${preciosCambian === 1 ? "" : "s"} (no se convierten: quedan solo los precios de lista en la nueva moneda)`);
  if (e.pagos.length !== 1 || e.pagos.some(pagoModificado)) p.push("los medios de pago ya cargados");
  if (creditoModificado(e.credito)) p.push("el plazo y la entrega inicial del crédito");
  if (e.cambio.trim() !== "" && e.aMoneda === "PYG") p.push("el tipo de cambio");

  return p;
}

export function perdidasAlCambiarCondicion(e: { pagos: PagoUI[]; credito: EstadoCreditoUI }): string[] {
  const p: string[] = [];

  if (e.pagos.length !== 1 || e.pagos.some(pagoModificado)) p.push("los medios de pago ya cargados");
  if (creditoModificado(e.credito)) p.push("el plazo y la entrega inicial del crédito");

  return p;
}

export function formularioModificado(e: EstadoFormulario): boolean {
  return e.cliente || e.lineas > 0 || e.infoAdicional !== "" || e.ubicacionElegidaPorElOperador || e.tipoTransaccion !== "1" || e.presencia !== "1" || e.condicion !== "1" || e.moneda !== "PYG" || e.cambio.trim() !== ""
    || e.pagos.length !== 1 || e.pagos.some(pagoModificado) || creditoModificado(e.credito);
}
