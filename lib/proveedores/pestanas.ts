export type PestanaId = "general" | "compras" | "homologacion" | "contactos" | "direcciones" | "bancos" | "retenciones" | "documentos";

const POR_CAMPO: Record<string, PestanaId> = {
  tipoPersona: "general",
  grupoProveedorId: "general",
  tipoDocumento: "general",
  numeroDocumento: "general",
  dv: "general",
  razonSocial: "general",
  nombreFantasia: "general",
  paisCodigo: "general",
  telefono: "general",
  email: "general",
  sitioWeb: "general",
  activo: "general",
  observacion: "general",
  condicionPagoId: "compras",
  monedaCodigoPredeterminada: "compras",
  medioPagoPreferidoId: "compras",
  diaPagoPreferido: "compras",
  plazoEntregaDias: "compras",
  descuentoComercialPct: "compras",
  montoMinimoCompra: "compras",
  permiteAnticipos: "compras",
  requiereOrdenCompra: "compras",
  emailPagos: "compras",
  fechaInicioRelacion: "compras",
  fechaFinRelacion: "compras",
  estadoHomologacion: "homologacion",
  fechaHomologacion: "homologacion",
  fechaVencimientoHomologacion: "homologacion",
  nivelRiesgo: "homologacion",
  calificacionActual: "homologacion",
  bloqueado: "homologacion",
  motivoBloqueo: "homologacion",
  incotermCodigo: "homologacion",
  condicionEntrega: "homologacion",
  metodoTransportePreferido: "homologacion",
  diasConfirmacionPedido: "homologacion",
  permiteEntregaParcial: "homologacion",
  contactos: "contactos",
  direcciones: "direcciones",
  cuentasBancarias: "bancos",
  retenciones: "retenciones",
  documentos: "documentos",
};

/** Pestaña del formulario a la que pertenece una ruta de campo (`contactos.0.nombre` → contactos). */
export function pestanaDeCampo(campo: string): PestanaId | null {
  return POR_CAMPO[campo.split(".")[0]] ?? null;
}

/** Identificador DOM del campo (el formulario lo usa para enfocarlo). */
export function idCampo(campo: string): string {
  return `prv-${campo.replace(/\./g, "-")}`;
}
