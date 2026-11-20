/** Validación pura de los catálogos comerciales (servidor, cliente y pruebas). */
import { cambioEnAlcance, MENSAJE_ALCANCE_CAMBIO } from "@/lib/comercial/cambio-decimal";
import { fechaLocalAIso, normalizarCambio } from "@/lib/listas-precio/calculos";

export class ErrorComercial extends Error {
  campo: string | null;
  estado: number;

  constructor(mensaje: string, campo: string | null = null, estado = 400) {
    super(mensaje);
    this.campo = campo;
    this.estado = estado;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const esUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export type DatosTipoCambio = { fecha: string; monedaCodigo: string; cambio: string };

/** Fecha, moneda y cotización (PYG por 1 unidad de la moneda). La moneda debe existir/estar activa: lo comprueba el servidor contra `monedas`. */
export function validarTipoCambio(d: Record<string, unknown>): DatosTipoCambio {
  const fecha = typeof d.fecha === "string" ? fechaLocalAIso(d.fecha) : null;

  if (!fecha) throw new ErrorComercial("Ingrese una fecha válida.", "fecha");

  const moneda = typeof d.monedaCodigo === "string" ? d.monedaCodigo.trim().toUpperCase() : "";

  if (!moneda) throw new ErrorComercial("Seleccione la moneda.", "monedaCodigo");
  if (!/^[A-Z]{3}$/.test(moneda)) throw new ErrorComercial("La moneda no es válida.", "monedaCodigo");
  if (moneda === "PYG") throw new ErrorComercial("PYG es la moneda base: su cotización es 1 y no se registra.", "monedaCodigo");

  const bruto = typeof d.cambio === "string" ? d.cambio : typeof d.cambio === "number" ? String(d.cambio) : "";
  const cambio = normalizarCambio(bruto);

  if (cambio === null) throw new ErrorComercial("Ingrese una cotización mayor que cero (hasta 6 decimales).", "cambio");

  if (!cambioEnAlcance(cambio)) throw new ErrorComercial(MENSAJE_ALCANCE_CAMBIO, "cambio");

  return { fecha, monedaCodigo: moneda, cambio };
}

export type DatosCatalogoSimple = { codigo: string; nombre: string; activo: boolean | undefined };

/** Canales de venta y zonas comerciales: código (obligatorio, ≤ 40) y nombre (obligatorio, ≤ 120). */
export function validarCatalogoSimple(d: Record<string, unknown>): DatosCatalogoSimple {
  const codigo = typeof d.codigo === "string" ? d.codigo.trim() : "";
  const nombre = typeof d.nombre === "string" ? d.nombre.trim() : "";

  if (!codigo) throw new ErrorComercial("El código es obligatorio.", "codigo");
  if (codigo.length > 40) throw new ErrorComercial("El código no puede superar los 40 caracteres.", "codigo");
  if (!nombre) throw new ErrorComercial("El nombre es obligatorio.", "nombre");
  if (nombre.length > 120) throw new ErrorComercial("El nombre no puede superar los 120 caracteres.", "nombre");
  if (d.activo !== undefined && typeof d.activo !== "boolean") throw new ErrorComercial("El estado no es válido.", "activo");

  return { codigo, nombre, activo: d.activo as boolean | undefined };
}
