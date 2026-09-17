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

export type ClienteDemo = {
  id: string;
  codigo: string;

  naturaleza: ClienteNaturaleza;
  tipoOperacion: ClienteOperacion;
  tipoPersona: ClienteTipoPersona;

  paisCodigo: string;
  paisNombre: string;

  tipoDocumento: string;
  numeroDocumento: string;
  dv: string;
  razonSocial: string;
  nombreFantasia: string;

  email: string;
  emailCopia: string;
  telefono: string;
  celular: string;

  limiteCredito: number;
  limiteCreditoTemporal: number;
  fechaVencimientoCredito: string;

  grupoCliente: string;
  condicionPago: string;
  moneda: string;
  listaPrecio: string;
  canalVenta: string;
  vendedor: string;

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

  rutaEntrega: string;
  zonaComercial: string;
  frecuenciaEntrega: string;
  diasEntrega: number[];

  observacionComercial: string;
  observacionLogistica: string;

  activo: boolean;

  creadoEn: string;
  actualizadoEn: string;
};

export type NuevoClienteDemo = Omit<
  ClienteDemo,
  "id" | "codigo" | "creadoEn" | "actualizadoEn"
>;
