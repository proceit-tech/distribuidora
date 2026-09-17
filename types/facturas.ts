export type FacturaEstado =
  | "BORRADOR"
  | "EMITIDA"
  | "APROBADA"
  | "RECHAZADA"
  | "ANULADA";

export type FacturaCondicionOperacion =
  | "CONTADO"
  | "CREDITO";

export type FacturaTipoTransaccion =
  | "VENTA_MERCADERIA"
  | "PRESTACION_SERVICIO"
  | "MIXTO"
  | "MUESTRAS_MEDICAS"
  | "DONACION"
  | "OTRO";

export type FacturaIndicadorPresencia =
  | "PRESENCIAL"
  | "INTERNET"
  | "TELEFONO"
  | "OTRO";

export type FacturaMoneda =
  | "PYG"
  | "USD"
  | "BRL"
  | "EUR";

export type FacturaCliente = {
  clienteId: string;
  codigo: string;
  naturaleza: "CONTRIBUYENTE" | "NO_CONTRIBUYENTE";
  tipoContribuyente: "PERSONA_JURIDICA" | "PERSONA_FISICA";
  tipoDocumento: string;
  numeroDocumento: string;
  dv: string;
  razonSocial: string;
  email: string;
  telefono: string;
  celular: string;
  direccion: string;
  numeroCasa: string;
};

export type FacturaItem = {
  id: string;
  productoId: string;
  productoCodigo: string;
  descripcion: string;
  afectacionIva: "GRAVADO" | "EXENTO";
  porcentajeIva: 0 | 5 | 10;
  unidadMedida: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
};

export type FacturaFormaPago = {
  medio:
    | "EFECTIVO"
    | "TARJETA"
    | "TRANSFERENCIA"
    | "CHEQUE"
    | "OTRO";
  monto: number;
};

export type FacturaExportacion = {
  habilitado: boolean;
  tipoOperacion: string;
  condicionNegociacion: string;
  paisDestino: string;
  empresaFletera: string;
  agenteTransporte: string;
  instruccionesPago: string;
  conocimientoEmbarque: string;
  manifiestoCarga: string;
  barcazaRemolcador: string;
  descripcionBienTransportado: string;
  cantidadBienTransportado: number;
  ciudadExportacion: string;
  pesoBruto: number;
  pesoNeto: number;
  otrasObservaciones: string;
};

export type FacturaContratacionPublica = {
  habilitado: boolean;
  modalidad: string;
  entidad: string;
  codigoContratacion: string;
  numeroContrato: string;
  fechaContrato: string;
};

export type FacturaTotales = {
  subtotalExento: number;
  subtotal5: number;
  subtotal10: number;
  totalOperacion: number;
  iva5: number;
  iva10: number;
  liquidacionIva5: number;
  liquidacionIva10: number;
  totalIva: number;
  baseGravada5: number;
  baseGravada10: number;
  totalBaseGravadaIva: number;
  totalGeneral: number;
};

export type FacturaDemo = {
  id: string;
  numeroInterno: string;
  estado: FacturaEstado;

  sucursalCodigo: string;
  sucursalDescripcion: string;
  puntoExpedicion: string;
  descripcionPuntoExpedicion: string;
  numeroSecuencia: string;

  fechaEmision: string;
  moneda: FacturaMoneda;

  condicionOperacion: FacturaCondicionOperacion;
  tipoTransaccion: FacturaTipoTransaccion;
  indicadorPresencia: FacturaIndicadorPresencia;

  informacionAdicional: string;

  cliente: FacturaCliente;
  exportacion: FacturaExportacion;
  contratacionPublica: FacturaContratacionPublica;

  items: FacturaItem[];
  formaPago: FacturaFormaPago;

  totales: FacturaTotales;

  cdc: string;
  mensajeSifen: string;

  creadoEn: string;
  actualizadoEn: string;
};

export type NuevaFacturaDemo = Omit<
  FacturaDemo,
  "id" | "numeroInterno" | "estado" | "cdc" | "mensajeSifen" | "creadoEn" | "actualizadoEn"
>;
