import type { DocumentoPendiente } from "@/lib/productos/documento-pendiente";
import type { FormularioProducto } from "@/lib/productos/formulario";
import type { Coleccion } from "@/lib/productos/normalizar";
import type { CatalogoProductos, ProductoDetalle } from "@/types/productos";

import type { Errores } from "./campos";

/** Todo lo que necesitan las pestañas: datos, errores por campo, catálogos y operaciones sobre las filas relacionadas. */
export type ContextoFormulario = {
  modo: "crear" | "editar";
  /** PRD-D05: sin PRODUCTOS.EDITAR la edición común de datos maestros queda bloqueada (foto y documentos tienen permisos propios). */
  soloLectura: boolean;
  /** PRD-D06: la pestaña de documentos informa si tiene un borrador (alta o edición de un documento) sin enviar. */
  marcarBorradorDocumento: (hay: boolean) => void;
  form: FormularioProducto;
  detalle?: ProductoDetalle;
  catalogos: CatalogoProductos;
  errores: Errores;
  /** Alta: documentos adjuntos que se cargan al guardar el producto. */
  pendientes: DocumentoPendiente[];
  setPendientes: (pendientes: DocumentoPendiente[]) => void;
  /** Alta: foto elegida, que se carga al guardar el producto. */
  fotoPendiente: File | null;
  setFotoPendiente: (foto: File | null) => void;
  /** Hay cambios sin guardar en el formulario (las acciones sobre archivos recargan la ficha y los descartarían). */
  sucio: boolean;
  /** Vuelve a leer la ficha del servidor (tras una acción sobre documentos o foto). */
  recargar: () => void;
  set: <K extends keyof FormularioProducto>(clave: K, valor: FormularioProducto[K]) => void;
  agregar: (coleccion: Coleccion) => void;
  actualizar: (coleccion: Coleccion, id: string, parche: Record<string, unknown>) => void;
  quitar: (coleccion: Coleccion, id: string) => void;
  /** Marca como principal una fila y desmarca las demás de la colección. */
  marcarPrincipal: (coleccion: "codigos" | "proveedores", id: string, valor: boolean) => void;
};
