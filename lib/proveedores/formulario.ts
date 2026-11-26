/**
 * Modelo del formulario de Proveedores (todo en texto, tal como lo escribe el usuario; fechas en dd/mm/aaaa) y su conversión al
 * contrato de la API (fechas ISO, números, decimales como cadena exacta). La conversión es pura y la validación final es la misma
 * función que usa el servidor (normalizarProveedor).
 */
import { ErrorValidacion } from "@/lib/proveedores/errores";
import { isoALocal, localAIso } from "@/lib/proveedores/fechas";
import type { EliminacionesProveedor, ProveedorContacto, ProveedorCuentaBancaria, ProveedorDetalle, ProveedorDireccion, ProveedorRetencion } from "@/types/proveedores";

export type RetencionFormulario = Omit<ProveedorRetencion, "fechaVigenciaDesde" | "fechaVigenciaHasta"> & {
  /** dd/mm/aaaa */
  fechaVigenciaDesde: string;
  fechaVigenciaHasta: string;
};

export type FormularioProveedor = {
  version: string;
  tipoPersona: "JURIDICA" | "FISICA";
  grupoProveedorId: string;
  tipoDocumento: string;
  numeroDocumento: string;
  dv: string;
  razonSocial: string;
  nombreFantasia: string;
  paisCodigo: string;
  email: string;
  telefono: string;
  sitioWeb: string;
  activo: boolean;
  observacion: string;
  condicionPagoId: string;
  monedaCodigoPredeterminada: string;
  medioPagoPreferidoId: string;
  diaPagoPreferido: string;
  plazoEntregaDias: string;
  descuentoComercialPct: string;
  montoMinimoCompra: string;
  permiteAnticipos: boolean;
  requiereOrdenCompra: boolean;
  emailPagos: string;
  fechaInicioRelacion: string;
  fechaFinRelacion: string;
  incotermCodigo: string;
  condicionEntrega: string;
  metodoTransportePreferido: string;
  diasConfirmacionPedido: string;
  permiteEntregaParcial: boolean;
  contactos: ProveedorContacto[];
  direcciones: ProveedorDireccion[];
  cuentasBancarias: ProveedorCuentaBancaria[];
  retenciones: RetencionFormulario[];
  eliminaciones: EliminacionesProveedor;
};

export function formularioInicial(): FormularioProveedor {
  return {
    version: "",
    tipoPersona: "JURIDICA",
    grupoProveedorId: "",
    tipoDocumento: "RUC",
    numeroDocumento: "",
    dv: "",
    razonSocial: "",
    nombreFantasia: "",
    paisCodigo: "PRY",
    email: "",
    telefono: "",
    sitioWeb: "",
    activo: true,
    observacion: "",
    condicionPagoId: "",
    monedaCodigoPredeterminada: "PYG",
    medioPagoPreferidoId: "",
    diaPagoPreferido: "",
    plazoEntregaDias: "",
    descuentoComercialPct: "0",
    montoMinimoCompra: "0",
    permiteAnticipos: false,
    requiereOrdenCompra: false,
    emailPagos: "",
    fechaInicioRelacion: "",
    fechaFinRelacion: "",
    incotermCodigo: "",
    condicionEntrega: "",
    metodoTransportePreferido: "",
    diasConfirmacionPedido: "",
    permiteEntregaParcial: true,
    contactos: [],
    direcciones: [],
    cuentasBancarias: [],
    retenciones: [],
    eliminaciones: { contactos: [], direcciones: [], cuentasBancarias: [], retenciones: [] },
  };
}

export function formularioDesdeDetalle(d: ProveedorDetalle): FormularioProveedor {
  const numero = (v: number | null) => (v === null || v === undefined ? "" : String(v));

  return {
    version: d.version,
    tipoPersona: d.tipoPersona,
    grupoProveedorId: d.grupoProveedorId ?? "",
    tipoDocumento: d.tipoDocumento,
    numeroDocumento: d.numeroDocumento,
    dv: d.dv,
    razonSocial: d.razonSocial,
    nombreFantasia: d.nombreFantasia,
    paisCodigo: d.paisCodigo,
    email: d.email,
    telefono: d.telefono,
    sitioWeb: d.sitioWeb,
    activo: d.activo,
    observacion: d.observacion,
    condicionPagoId: d.condicionPagoId ?? "",
    monedaCodigoPredeterminada: d.monedaCodigoPredeterminada,
    medioPagoPreferidoId: d.medioPagoPreferidoId ?? "",
    diaPagoPreferido: numero(d.diaPagoPreferido),
    plazoEntregaDias: numero(d.plazoEntregaDias),
    descuentoComercialPct: d.descuentoComercialPct,
    montoMinimoCompra: d.montoMinimoCompra,
    permiteAnticipos: d.permiteAnticipos,
    requiereOrdenCompra: d.requiereOrdenCompra,
    emailPagos: d.emailPagos,
    fechaInicioRelacion: isoALocal(d.fechaInicioRelacion),
    fechaFinRelacion: isoALocal(d.fechaFinRelacion),
    incotermCodigo: d.incotermCodigo,
    condicionEntrega: d.condicionEntrega,
    metodoTransportePreferido: d.metodoTransportePreferido,
    diasConfirmacionPedido: numero(d.diasConfirmacionPedido),
    permiteEntregaParcial: d.permiteEntregaParcial,
    contactos: structuredClone(d.contactos),
    direcciones: structuredClone(d.direcciones),
    cuentasBancarias: structuredClone(d.cuentasBancarias),
    retenciones: d.retenciones.map((r) => ({ ...r, fechaVigenciaDesde: isoALocal(r.fechaVigenciaDesde), fechaVigenciaHasta: isoALocal(r.fechaVigenciaHasta) })),
    eliminaciones: { contactos: [], direcciones: [], cuentasBancarias: [], retenciones: [] },
  };
}

function fecha(valor: string, campo: string, etiqueta: string): string {
  const iso = localAIso(valor);

  if (iso === null) throw new ErrorValidacion(`${etiqueta} debe tener el formato dd/mm/aaaa y ser una fecha real.`, campo);

  return iso;
}

/** Contrato de la API. Lanza ErrorValidacion (con campo) si una fecha escrita no es válida. */
export function formularioAPayload(f: FormularioProveedor, modo: "crear" | "editar"): Record<string, unknown> {
  const { version, eliminaciones, retenciones, ...resto } = f;

  return {
    ...resto,
    grupoProveedorId: f.grupoProveedorId || null,
    condicionPagoId: f.condicionPagoId || null,
    medioPagoPreferidoId: f.medioPagoPreferidoId || null,
    fechaInicioRelacion: fecha(f.fechaInicioRelacion, "fechaInicioRelacion", "La fecha de inicio de la relación"),
    fechaFinRelacion: fecha(f.fechaFinRelacion, "fechaFinRelacion", "La fecha de finalización"),
    retenciones: retenciones.map((r, i) => ({
      ...r,
      fechaVigenciaDesde: fecha(r.fechaVigenciaDesde, `retenciones.${i}.fechaVigenciaDesde`, `La vigencia inicial de la retención ${i + 1}`),
      fechaVigenciaHasta: fecha(r.fechaVigenciaHasta, `retenciones.${i}.fechaVigenciaHasta`, `La vigencia final de la retención ${i + 1}`),
    })),
    ...(modo === "editar" ? { version, eliminaciones } : {}),
  };
}
