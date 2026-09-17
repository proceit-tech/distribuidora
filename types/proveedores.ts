export type ProveedorTipoPersona =
  | "JURIDICA"
  | "FISICA";

export type ProveedorEstadoHomologacion =
  | "PENDIENTE"
  | "EN_EVALUACION"
  | "HOMOLOGADO"
  | "RECHAZADO"
  | "SUSPENDIDO"
  | "VENCIDO";

export type ProveedorNivelRiesgo =
  | "NO_EVALUADO"
  | "BAJO"
  | "MEDIO"
  | "ALTO"
  | "CRITICO";

export type ProveedorContacto = {
  id: string;
  nombre: string;
  apellido: string;
  cargo: string;
  departamento: string;
  telefono: string;
  celular: string;
  email: string;
  esPrincipal: boolean;
  recibeCotizaciones: boolean;
  recibeOrdenesCompra: boolean;
  recibeLogistica: boolean;
  recibeDevoluciones: boolean;
  recibePagos: boolean;
  recibeCalidad: boolean;
  recibeNotificaciones: boolean;
};

export type ProveedorDireccion = {
  id: string;
  tipo: "FISCAL" | "COMERCIAL" | "RETIRO" | "PAGOS" | "OTRA";
  descripcion: string;
  direccion: string;
  numeroCasa: string;
  paisCodigo: string;
  paisNombre: string;
  departamentoCodigo: string;
  distritoCodigo: string;
  ciudadCodigo: string;
  departamento: string;
  distrito: string;
  ciudad: string;
  codigoPostal: string;
  esPrincipal: boolean;
};

export type ProveedorCuentaBancaria = {
  id: string;
  banco: string;
  sucursalBanco: string;
  titular: string;
  documentoTitular: string;
  tipoCuenta: "CORRIENTE" | "AHORRO" | "CAJA_AHORRO" | "OTRA";
  numeroCuenta: string;
  monedaCodigo: string;
  aliasCuenta: string;
  codigoSwift: string;
  iban: string;
  esPrincipal: boolean;
};

export type ProveedorRetencion = {
  id: string;
  tipo: "IVA" | "RENTA" | "OTRA";
  porcentaje: number;
  certificadoObligatorio: boolean;
  fechaVigenciaDesde: string;
  fechaVigenciaHasta: string;
  observacion: string;
};

export type ProveedorDocumento = {
  id: string;
  tipo:
    | "CONTRATO"
    | "CONSTANCIA_RUC"
    | "CERTIFICADO_BANCARIO"
    | "CERTIFICADO_RETENCION"
    | "LICENCIA"
    | "OTRO";
  nombreArchivo: string;
  urlArchivo: string;
  fechaEmision: string;
  fechaVencimiento: string;
  observacion: string;
};

export type ProveedorDemo = {
  id: string;
  codigo: string;

  tipoPersona: ProveedorTipoPersona;
  grupoProveedor: string;

  tipoDocumento: string;
  numeroDocumento: string;
  dv: string;
  razonSocial: string;
  nombreFantasia: string;

  paisCodigo: string;
  paisNombre: string;
  email: string;
  telefono: string;
  sitioWeb: string;

  condicionPago: string;
  monedaCodigoPredeterminada: string;
  medioPagoPreferido: string;
  diaPagoPreferido: number | null;
  plazoEntregaDias: number | null;
  descuentoComercialPct: number;
  montoMinimoCompra: number;
  permiteAnticipos: boolean;
  requiereOrdenCompra: boolean;
  emailPagos: string;
  fechaInicioRelacion: string;
  fechaFinRelacion: string;

  estadoHomologacion: ProveedorEstadoHomologacion;
  fechaHomologacion: string;
  fechaVencimientoHomologacion: string;
  nivelRiesgo: ProveedorNivelRiesgo;
  calificacionActual: number | null;
  incotermCodigo: string;
  condicionEntrega: string;
  metodoTransportePreferido: string;
  diasConfirmacionPedido: number | null;
  permiteEntregaParcial: boolean;

  contactos: ProveedorContacto[];
  direcciones: ProveedorDireccion[];
  cuentasBancarias: ProveedorCuentaBancaria[];
  retenciones: ProveedorRetencion[];
  documentos: ProveedorDocumento[];

  observacion: string;
  activo: boolean;

  creadoEn: string;
  actualizadoEn: string;
};

export type NuevoProveedorDemo = Omit<
  ProveedorDemo,
  "id" | "codigo" | "creadoEn" | "actualizadoEn"
>;
