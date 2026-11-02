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

/**
 * Los identificadores de las filas relacionadas son los del servidor (UUID). Una fila nueva en el formulario usa un identificador
 * temporal («nuevo-…»): el servidor lo reemplaza por el definitivo y, al editar, conserva el de las filas existentes.
 */
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
  /** Solo lectura (lo devuelve el servidor): una cuenta aprobada no se sobrescribe, sus cambios quedan en revisión. */
  estadoAprobacion?: "PENDIENTE" | "APROBADA" | "RECHAZADA";
  motivoResolucion?: string;
  aprobadoEn?: string;
  /** Solo lectura: una cuenta desactivada se conserva con su historial pero no es pagable ni editable. */
  activa?: boolean;
  desactivadaEn?: string;
  revisionPendiente?: { id: string; datos: Record<string, unknown>; solicitadoEn: string } | null;
};

export type ProveedorRetencion = {
  id: string;
  impuestoId: string | null;
  tipo: "IVA" | "RENTA" | "OTRA";
  /** Porcentaje como cadena decimal exacta («10.00»). */
  porcentaje: string;
  certificadoObligatorio: boolean;
  /** Una retención que exige certificado solo puede estar activa con un certificado de retención válido vinculado. */
  activa: boolean;
  documentoCertificadoId: string | null;
  /** Solo lectura: lo calcula el servidor con el documento vinculado. */
  certificadoValido?: boolean;
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
  /** Enlace anterior (documentos cargados antes del archivo privado); vacío si tiene archivo. */
  urlArchivo: string;
  tieneArchivo: boolean;
  tamanoBytes: number | null;
  tipoMime: string;
  version: number;
  fechaEmision: string;
  fechaVencimiento: string;
  observacion: string;
};

/** Permisos de documentos para el usuario y este proveedor (la decisión final siempre la toma el servidor). */
export type PermisosDocumentosProveedor = { cargar: boolean; gestionar: boolean; historial: boolean; finalizar: boolean };

/** Filas relacionadas que el usuario quitó explícitamente en esta edición (solo identificadores persistidos). */
export type EliminacionesProveedor = {
  contactos: string[];
  direcciones: string[];
  cuentasBancarias: string[];
  retenciones: string[];
};

export type ProveedorDetalle = {
  id: string;
  codigo: string;
  /** Marca de concurrencia: la edición se rechaza si otro usuario guardó antes. */
  version: string;
  /** Grupo y medio de pago ya asignados que hoy están inactivos (se muestran «(inactivo)» sin ofrecerlos como elección nueva). */
  referenciasHistoricas?: Record<string, { id: string; codigo: string; nombre: string }>;

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
  descuentoComercialPct: string;
  montoMinimoCompra: string;
  permiteAnticipos: boolean;
  requiereOrdenCompra: boolean;
  emailPagos: string;
  fechaInicioRelacion: string;
  fechaFinRelacion: string;

  estadoHomologacion: ProveedorEstadoHomologacion;
  fechaHomologacion: string;
  fechaVencimientoHomologacion: string;
  nivelRiesgo: ProveedorNivelRiesgo;
  calificacionActual: string | null;
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

  bloqueado: boolean;
  motivoBloqueo: string;
  esCreador: boolean;
  cargaDocumentosInicialAbierta: boolean;
  permisosDocumentos: PermisosDocumentosProveedor;
  homologacionVencida: boolean;
  estadoOperativo: { elegible: boolean; motivos: string[] };
  permisos: { editar: boolean; homologar: boolean; evaluarRiesgo: boolean; bloquear: boolean; aprobarBanco: boolean; reactivarCuenta: boolean };

  creadoEn: string;
  actualizadoEn: string;
};

/** Datos editables enviados por el formulario (sin identidad, auditoría ni los datos gobernados por acciones propias). */
export type NuevoProveedor = Omit<
  ProveedorDetalle,
  | "id"
  | "codigo"
  | "version"
  | "creadoEn"
  | "actualizadoEn"
  | "paisNombre"
  | "bloqueado"
  | "motivoBloqueo"
  | "esCreador"
  | "cargaDocumentosInicialAbierta"
  | "permisosDocumentos"
  | "documentos"
  | "homologacionVencida"
  | "estadoOperativo"
  | "permisos"
  | "estadoHomologacion"
  | "fechaHomologacion"
  | "fechaVencimientoHomologacion"
  | "nivelRiesgo"
  | "calificacionActual"
> & {
  version?: string;
  eliminaciones?: EliminacionesProveedor;
};

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
  montoMinimoCompra: string;
  estadoHomologacion: ProveedorEstadoHomologacion;
  nivelRiesgo: ProveedorNivelRiesgo;
  calificacionActual: string | null;
  activo: boolean;
  bloqueado: boolean;
  homologacionVencida: boolean;
};

export type CatalogoProveedores = {
  grupos: { id: string; codigo: string; nombre: string }[];
  condicionesPago: { id: string; codigo: string; nombre: string }[];
  monedas: { codigo: string; nombre: string; simbolo?: string }[];
  mediosPago: { id: string; codigo: string; nombre: string }[];
  paises: { codigo: string; nombre: string }[];
  incoterms: { codigo: string; nombre: string }[];
  departamentos: { codigo: number; nombre: string }[];
  impuestos: { id: string; codigo: string; nombre: string; porcentaje: string }[];
};
