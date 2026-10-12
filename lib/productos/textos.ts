/** Textos en español de Productos (documentos y auditoría). */
export const TIPO_DOCUMENTO_TEXTO: Record<string, string> = {
  FICHA_TECNICA: "Ficha técnica",
  HOJA_SEGURIDAD: "Hoja de seguridad",
  CERTIFICADO: "Certificado",
  IMAGEN: "Imagen",
  OTRO: "Otro",
};

/** Acciones de auditoría (producto_eventos.accion) en español. */
export const EVENTO_TEXTO: Record<string, string> = {
  DOC_CARGA: "Documento cargado",
  DOC_REEMPLAZO: "Documento reemplazado (nueva versión)",
  DOC_EDICION: "Datos del documento editados",
  DOC_ELIMINACION: "Documento eliminado",
  DOC_RESTAURACION: "Documento restaurado",
  DOC_RECUPERACION: "Versión de documento recuperada",
  FOTO_ACTUALIZADA: "Foto del producto actualizada",
  FOTO_ELIMINADA: "Foto del producto quitada",
};
