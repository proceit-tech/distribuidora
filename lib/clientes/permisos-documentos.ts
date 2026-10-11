/**
 * Autorización de las rutas de documentos de Clientes (F-CLI-09-01). Función PURA (testeable sin base ni sesión):
 *  - Descargar: CLIENTES.VER.
 *  - Cargar un documento NUEVO: CLIENTES.EDITAR, o bien CLIENTES.CREAR solo dentro del flujo de alta: el cliente debe haberse
 *    creado hace menos de `VENTANA_CARGA_INICIAL_MS` (el alta crea el cliente y luego sube sus archivos). Un usuario con solo
 *    CREAR no puede agregar documentos a clientes antiguos.
 *  - Reemplazar el archivo, cambiar los datos y ELIMINAR un documento: solo CLIENTES.EDITAR (CREAR nunca basta).
 * El aislamiento por empresa NO se decide aquí: todas las consultas de las rutas filtran por `empresa_id` de la sesión.
 */
export type PermisosClientes = { ver: boolean; editar: boolean; crear: boolean };
export type AccionDocumento = "DESCARGAR" | "CARGAR" | "REEMPLAZAR" | "EDITAR_DATOS" | "ELIMINAR";

/** Margen para que el alta suba sus archivos (ajustable): 15 minutos desde la creación del cliente. */
export const VENTANA_CARGA_INICIAL_MS = 15 * 60 * 1000;

export type DecisionAcceso = { permitido: true; cargaInicial: boolean } | { permitido: false; estado: 403; mensaje: string };

const NO_PERMISO = "No tiene permiso para esta acción.";

/** `antiguedadClienteMs`: milisegundos desde la creación del cliente (null = no consultada/desconocida). */
export function decidirAccesoDocumento(accion: AccionDocumento, permisos: PermisosClientes, antiguedadClienteMs: number | null): DecisionAcceso {
  if (accion === "DESCARGAR") {
    return permisos.ver ? { permitido: true, cargaInicial: false } : { permitido: false, estado: 403, mensaje: NO_PERMISO };
  }

  if (permisos.editar) return { permitido: true, cargaInicial: false };

  if (accion === "CARGAR" && permisos.crear) {
    const dentroDeVentana = antiguedadClienteMs !== null && antiguedadClienteMs >= 0 && antiguedadClienteMs <= VENTANA_CARGA_INICIAL_MS;

    if (dentroDeVentana) return { permitido: true, cargaInicial: true };

    return {
      permitido: false,
      estado: 403,
      mensaje: "Con permiso de creación solo puede cargar documentos al registrar el cliente; para agregarlos después necesita permiso de edición.",
    };
  }

  return { permitido: false, estado: 403, mensaje: NO_PERMISO };
}
