/**
 * Autorización de las rutas de documentos de Productos. Función PURA (testeable sin base ni sesión).
 *  - Descargar la versión vigente: PRODUCTOS.VER.
 *  - Cargar un documento NUEVO: PRODUCTOS.EDITAR, o bien PRODUCTOS.CREAR únicamente en el contexto comprobado de la creación de
 *    ESE producto: el usuario de la sesión es su creador (`productos.creado_por`) Y la carga inicial sigue abierta
 *    (`productos.carga_documentos_inicial_abierta`, NEX-041). Sin plazos: se abre en el alta y se cierra al finalizarla o en la
 *    primera edición del producto.
 *  - Finalizar la carga inicial: EDITAR, o el CREADOR con CREAR — también cuando ya está cerrada: el cierre es idempotente (si el servidor cerró pero la respuesta se perdió, el reintento da 200).
 *    Esto NO amplía CARGAR: después del cierre el creador con solo CREAR no puede agregar documentos.
 *  - Reemplazar (nueva versión), editar datos, eliminar (lógicamente), restaurar, ver historial/eliminados y recuperar versiones:
 *    solo PRODUCTOS.EDITAR (CREAR nunca basta). Ninguna acción destruye un archivo físicamente.
 * El aislamiento por empresa NO se decide aquí: todas las consultas filtran por `empresa_id` de la sesión.
 */
export type PermisosDocumentos = { ver: boolean; editar: boolean; crear: boolean };

export type AccionDocumento = "DESCARGAR" | "CARGAR" | "FINALIZAR_CARGA" | "REEMPLAZAR" | "EDITAR_DATOS" | "ELIMINAR" | "RESTAURAR" | "VER_HISTORIAL" | "RECUPERAR_VERSION";

/** Estado del producto (de la empresa de la sesión) relevante para la carga inicial; null = no existe en esa empresa. */
export type ContextoCargaInicial = { esCreador: boolean; cargaInicialAbierta: boolean };

export type DecisionAcceso = { permitido: true; cargaInicial: boolean } | { permitido: false; estado: 403 | 404; mensaje: string };

const NO_PERMISO = "No tiene permiso para esta acción.";

export function decidirAccesoDocumento(accion: AccionDocumento, permisos: PermisosDocumentos, contexto: ContextoCargaInicial | null): DecisionAcceso {
  if (accion === "DESCARGAR") {
    return permisos.ver ? { permitido: true, cargaInicial: false } : { permitido: false, estado: 403, mensaje: NO_PERMISO };
  }

  if (permisos.editar) return { permitido: true, cargaInicial: false };

  // PRD-D04 — cierre idempotente: solo el propio creador (de esa empresa; el contexto es null si el producto no existe en ella), esté la carga abierta o ya cerrada. NO amplía CARGAR.
  if (accion === "FINALIZAR_CARGA" && permisos.crear && contexto !== null && contexto.esCreador) return { permitido: true, cargaInicial: contexto.cargaInicialAbierta };

  if ((accion === "CARGAR" || accion === "FINALIZAR_CARGA") && permisos.crear) {
    if (contexto !== null && contexto.esCreador && contexto.cargaInicialAbierta) return { permitido: true, cargaInicial: true };

    return {
      permitido: false,
      estado: 403,
      mensaje: "Con permiso de creación solo puede cargar documentos al registrar el producto que usted creó; para agregarlos después necesita permiso de edición.",
    };
  }

  return { permitido: false, estado: 403, mensaje: NO_PERMISO };
}
