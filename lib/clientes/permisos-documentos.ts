/**
 * Autorización de las rutas de documentos de Clientes (F-CLI-09-01 / F-CLI-09-03). Función PURA (testeable sin base ni sesión).
 *  - Descargar: CLIENTES.VER.
 *  - Cargar un documento NUEVO: CLIENTES.EDITAR, o bien CLIENTES.CREAR únicamente en el contexto comprobado de la creación de
 *    ESE cliente: el usuario de la sesión es su creador (`clientes.creado_por`) Y la carga inicial sigue abierta
 *    (`clientes.carga_documentos_inicial_abierta`, NEX-030). No hay plazos: el estado se abre en el alta y se cierra al
 *    finalizar el flujo de alta (`/documentos/finalizar`) o en la primera edición del cliente.
 *  - Finalizar la carga inicial: EDITAR, o el creador con CREAR mientras esté abierta.
 *  - Reemplazar (nueva versión), cambiar los datos, eliminar (lógicamente), restaurar, ver el historial/eliminados y recuperar una
 *    versión anterior: solo CLIENTES.EDITAR (CREAR nunca basta). Ninguna acción destruye un archivo físicamente.
 * El aislamiento por empresa NO se decide aquí: todas las consultas de las rutas filtran por `empresa_id` de la sesión.
 */
export type PermisosClientes = { ver: boolean; editar: boolean; crear: boolean };
export type AccionDocumento =
  | "DESCARGAR"
  | "CARGAR"
  | "FINALIZAR_CARGA"
  | "REEMPLAZAR"
  | "EDITAR_DATOS"
  | "ELIMINAR" // exclusión LÓGICA (el archivo se conserva)
  | "RESTAURAR"
  | "VER_HISTORIAL" // listar versiones/eliminados y descargar una versión no vigente o un documento eliminado
  | "RECUPERAR_VERSION";

/** Estado del cliente (de la empresa de la sesión) relevante para la carga inicial; null = el cliente no existe en esa empresa. */
export type ContextoCargaInicial = { esCreador: boolean; cargaInicialAbierta: boolean };

export type DecisionAcceso = { permitido: true; cargaInicial: boolean } | { permitido: false; estado: 403; mensaje: string };

const NO_PERMISO = "No tiene permiso para esta acción.";

export function decidirAccesoDocumento(accion: AccionDocumento, permisos: PermisosClientes, contexto: ContextoCargaInicial | null): DecisionAcceso {
  if (accion === "DESCARGAR") {
    return permisos.ver ? { permitido: true, cargaInicial: false } : { permitido: false, estado: 403, mensaje: NO_PERMISO };
  }

  if (permisos.editar) return { permitido: true, cargaInicial: false };

  if ((accion === "CARGAR" || accion === "FINALIZAR_CARGA") && permisos.crear) {
    if (contexto !== null && contexto.esCreador && contexto.cargaInicialAbierta) return { permitido: true, cargaInicial: true };

    return {
      permitido: false,
      estado: 403,
      mensaje: "Con permiso de creación solo puede cargar documentos al registrar el cliente que usted creó; para agregarlos después necesita permiso de edición.",
    };
  }

  return { permitido: false, estado: 403, mensaje: NO_PERMISO };
}
