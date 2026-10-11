/**
 * Autorización de las rutas de documentos de Proveedores. Función PURA (testeable sin base ni sesión).
 *  - Descargar la versión vigente: PROVEEDORES.VER.
 *  - Cargar un documento NUEVO: PROVEEDORES.EDITAR, o bien PROVEEDORES.CREAR únicamente en el contexto comprobado de la creación de
 *    ESE proveedor: el usuario de la sesión es su creador (`proveedores.creado_por`) Y la carga inicial sigue abierta
 *    (`proveedores.carga_documentos_inicial_abierta`, NEX-036). Sin plazos: se abre en el alta y se cierra al finalizarla o en la
 *    primera edición del proveedor.
 *  - Finalizar la carga inicial: EDITAR, o el creador con CREAR mientras esté abierta.
 *  - Reemplazar (nueva versión), editar datos, eliminar (lógicamente), restaurar, ver historial/eliminados y recuperar versiones:
 *    solo PROVEEDORES.EDITAR (CREAR nunca basta). Ninguna acción destruye un archivo físicamente.
 * El aislamiento por empresa NO se decide aquí: todas las consultas filtran por `empresa_id` de la sesión.
 */
export type PermisosDocumentos = { ver: boolean; editar: boolean; crear: boolean };

export type AccionDocumento = "DESCARGAR" | "CARGAR" | "FINALIZAR_CARGA" | "REEMPLAZAR" | "EDITAR_DATOS" | "ELIMINAR" | "RESTAURAR" | "VER_HISTORIAL" | "RECUPERAR_VERSION";

/** Estado del proveedor (de la empresa de la sesión) relevante para la carga inicial; null = no existe en esa empresa. */
export type ContextoCargaInicial = { esCreador: boolean; cargaInicialAbierta: boolean };

export type DecisionAcceso = { permitido: true; cargaInicial: boolean } | { permitido: false; estado: 403 | 404; mensaje: string };

const NO_PERMISO = "No tiene permiso para esta acción.";

export function decidirAccesoDocumento(accion: AccionDocumento, permisos: PermisosDocumentos, contexto: ContextoCargaInicial | null): DecisionAcceso {
  if (accion === "DESCARGAR") {
    return permisos.ver ? { permitido: true, cargaInicial: false } : { permitido: false, estado: 403, mensaje: NO_PERMISO };
  }

  if (permisos.editar) return { permitido: true, cargaInicial: false };

  if ((accion === "CARGAR" || accion === "FINALIZAR_CARGA") && permisos.crear) {
    if (contexto !== null && contexto.esCreador && contexto.cargaInicialAbierta) return { permitido: true, cargaInicial: true };

    return {
      permitido: false,
      estado: 403,
      mensaje: "Con permiso de creación solo puede cargar documentos al registrar el proveedor que usted creó; para agregarlos después necesita permiso de edición.",
    };
  }

  return { permitido: false, estado: 403, mensaje: NO_PERMISO };
}
