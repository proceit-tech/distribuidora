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

export function formularioModificado(e: EstadoFormulario): boolean {
  return e.cliente || e.lineas > 0 || e.infoAdicional !== "" || e.ubicacionElegidaPorElOperador || e.tipoTransaccion !== "1" || e.presencia !== "1" || e.condicion !== "1" || e.moneda !== "PYG" || e.cambio.trim() !== ""
    || e.pagos.length !== 1 || e.pagos.some(pagoModificado) || creditoModificado(e.credito);
}
