/** Textos en español (Paraguay) de los valores internos de Proveedores; la pantalla nunca muestra los códigos crudos. */
export const HOMOLOGACION_TEXTO: Record<string, string> = {
  PENDIENTE: "Pendiente",
  EN_EVALUACION: "En evaluación",
  HOMOLOGADO: "Homologado",
  RECHAZADO: "Rechazado",
  SUSPENDIDO: "Suspendido",
  VENCIDO: "Vencido",
};

export const RIESGO_TEXTO: Record<string, string> = {
  NO_EVALUADO: "No evaluado",
  BAJO: "Bajo",
  MEDIO: "Medio",
  ALTO: "Alto",
  CRITICO: "Crítico",
};

export const TIPO_DIRECCION_TEXTO: Record<string, string> = {
  FISCAL: "Fiscal",
  COMERCIAL: "Comercial",
  RETIRO: "Retiro",
  PAGOS: "Pagos",
  OTRA: "Otra",
};

export const TIPO_CUENTA_TEXTO: Record<string, string> = {
  CORRIENTE: "Cuenta corriente",
  AHORRO: "Cuenta de ahorro",
  CAJA_AHORRO: "Caja de ahorro",
  OTRA: "Otra",
};

export const TIPO_RETENCION_TEXTO: Record<string, string> = {
  IVA: "IVA",
  RENTA: "Renta",
  OTRA: "Otra",
};

export const TIPO_DOCUMENTO_TEXTO: Record<string, string> = {
  CONTRATO: "Contrato",
  CONSTANCIA_RUC: "Constancia de RUC",
  CERTIFICADO_BANCARIO: "Certificado bancario",
  CERTIFICADO_RETENCION: "Certificado de retención",
  LICENCIA: "Licencia",
  OTRO: "Otro",
};

/** Acciones de auditoría (proveedor_eventos.accion) en español. */
export const EVENTO_TEXTO: Record<string, string> = {
  CREACION: "Proveedor creado",
  ACTUALIZACION: "Datos del proveedor actualizados",
  ALTA: "Registro agregado",
  MODIFICACION: "Registro modificado",
  BAJA: "Registro eliminado",
  HOMOLOGACION_EN_EVALUACION: "Pasó a evaluación",
  HOMOLOGACION_APROBADA: "Homologación aprobada",
  HOMOLOGACION_RECHAZADA: "Homologación rechazada",
  HOMOLOGACION_SUSPENDIDA: "Homologación suspendida",
  HOMOLOGACION_RENOVADA: "Homologación renovada",
  RIESGO_EVALUADO: "Riesgo evaluado",
  BLOQUEO: "Proveedor bloqueado",
  DESBLOQUEO: "Proveedor desbloqueado",
  CUENTA_REVISION_SOLICITADA: "Cambio de cuenta bancaria solicitado",
  CUENTA_DESACTIVADA: "Cuenta bancaria desactivada",
  CUENTA_REACTIVADA: "Cuenta bancaria reactivada",
  CUENTA_APROBADA: "Cuenta bancaria aprobada",
  CUENTA_RECHAZADA: "Cuenta bancaria rechazada",
  CUENTA_REVISION_APROBADA: "Cambio de cuenta bancaria aprobado",
  CUENTA_REVISION_RECHAZADA: "Cambio de cuenta bancaria rechazado",
  RETENCION_ACTIVADA: "Retención activada",
  RETENCION_DESACTIVADA: "Retención desactivada",
  DOC_CARGA: "Documento cargado",
  DOC_REEMPLAZO: "Documento reemplazado (nueva versión)",
  DOC_EDICION: "Datos del documento editados",
  DOC_ELIMINACION: "Documento eliminado",
  DOC_RESTAURACION: "Documento restaurado",
  DOC_RECUPERACION: "Versión de documento recuperada",
};

export const ENTIDAD_TEXTO: Record<string, string> = {
  PROVEEDOR: "Proveedor",
  CONTACTO: "Contacto",
  DIRECCION: "Dirección",
  CUENTA: "Cuenta bancaria",
  RETENCION: "Retención",
  DOCUMENTO: "Documento",
};
