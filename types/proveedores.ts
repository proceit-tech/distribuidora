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
  impuestoId?: string | null;
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

export type ProveedorDetalle = {
  id: string;
  codigo: string;

  tipoPersona: ProveedorTipoPersona;
  grupoProveedorId: string | null;

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

  condicionPagoId: string | null;
  monedaCodigoPredeterminada: string;
  medioPagoPreferidoId: string | null;
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

export type NuevoProveedor = Omit<
  ProveedorDetalle,
  "id" | "codigo" | "creadoEn" | "actualizadoEn"
>;

/** Fila de la lista (GET /api/proveedores), ya mapeada a camelCase. */
export type ProveedorLista = {
  id: string;
  codigo: string;
  razonSocial: string;
  nombreFantasia: string;
  tipoDocumento: string;
  numeroDocumento: string;
  dv: string;
  paisNombre: string;
  email: string;
  telefono: string;
  grupoNombre: string;
  condicionPagoNombre: string;
  monedaCodigoPredeterminada: string;
  montoMinimoCompra: number;
  estadoHomologacion: ProveedorEstadoHomologacion;
  nivelRiesgo: ProveedorNivelRiesgo;
  calificacionActual: number | null;
  activo: boolean;
};

export type CatalogoProveedores = {
  grupos: { id: string; codigo: string; nombre: string }[];
  condicionesPago: { id: string; codigo: string; nombre: string }[];
  monedas: { codigo: string; nombre: string; simbolo?: string }[];
  mediosPago: { id: string; codigo: string; nombre: string }[];
  paises: { codigo: string; nombre: string }[];
  incoterms: { codigo: string; nombre: string }[];
  departamentos: { codigo: number; nombre: string }[];
};
