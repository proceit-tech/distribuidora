export type ClienteNaturaleza =
  | "CONTRIBUYENTE"
  | "NO_CONTRIBUYENTE";

export type ClienteOperacion =
  | "B2B"
  | "B2C"
  | "B2G"
  | "B2F";

export type ClienteTipoPersona =
  | "JURIDICA"
  | "FISICA";

/** Fila de la lista de clientes (viene de GET /api/clientes, nunca de datos de prueba). */
export type ClienteLista = {
  id: string;
  codigo: string;
  naturaleza: ClienteNaturaleza;
  tipoOperacion: ClienteOperacion;
  tipoDocumento: string;
  numeroDocumento: string;
  dv: string;
  razonSocial: string;
  nombreFantasia: string;
  paisNombre: string;
  email: string;
  telefono: string;
  celular: string;
  gln: string;
  limiteCredito: number;
  grupoCliente: string;
  condicionPago: string;
  vendedor: string;
  rutaEntrega: string;
  zonaComercial: string;
  bloqueadoVentas: boolean;
  activo: boolean;
};

/** Cliente completo (GET /api/clientes/[id]); los *Id son UUID de catálogos de la empresa. */
export type ClienteDetalle = {
  id: string;
  codigo: string;
  naturaleza: ClienteNaturaleza;
  tipoOperacion: ClienteOperacion;
  tipoPersona: ClienteTipoPersona;
  paisCodigo: string;
  paisNombre: string;
  tipoDocumento: string;
  descripcionDocumentoIdentidad: string;
  numeroDocumento: string;
  dv: string;
  razonSocial: string;
  nombreFantasia: string;
  email: string;
  emailCopia: string;
  telefono: string;
  celular: string;
  limiteCredito: number;
  limiteCreditoTemporal: string;
  fechaVencimientoCredito: string;
  grupoClienteId: string;
  condicionPagoId: string;
  monedaCodigoPredeterminada: string;
  listaPrecioId: string;
  canalVentaId: string;
  vendedorId: string;
  codigoExterno: string;
  gln: string;
  descuentoComercialPct: number;
  bloqueadoVentas: boolean;
  motivoBloqueoVentas: string;
  diaPreferidoCobro: number | null;
  requiereOrdenCompra: boolean;
  emailFacturacion: string;
  emailCobranzas: string;
  recibeDocumentoElectronico: boolean;
  rutaEntregaId: string;
  zonaComercialId: string;
  frecuenciaEntrega: string;
  diasEntrega: number[];
  observacionComercial: string;
  observacionLogistica: string;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
};
