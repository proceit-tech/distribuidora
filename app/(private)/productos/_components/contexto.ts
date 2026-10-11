import type { FormularioProducto } from "@/lib/productos/formulario";
import type { Coleccion } from "@/lib/productos/normalizar";
import type { CatalogoProductos, ProductoDetalle } from "@/types/productos";

import type { Errores } from "./campos";

/** Todo lo que necesitan las pestañas: datos, errores por campo, catálogos y operaciones sobre las filas relacionadas. */
export type ContextoFormulario = {
  modo: "crear" | "editar";
  form: FormularioProducto;
  detalle?: ProductoDetalle;
  catalogos: CatalogoProductos;
  errores: Errores;
  set: <K extends keyof FormularioProducto>(clave: K, valor: FormularioProducto[K]) => void;
  agregar: (coleccion: Coleccion) => void;
  actualizar: (coleccion: Coleccion, id: string, parche: Record<string, unknown>) => void;
  quitar: (coleccion: Coleccion, id: string) => void;
  /** Marca como principal una fila y desmarca las demás de la colección. */
  marcarPrincipal: (coleccion: "codigos" | "proveedores", id: string, valor: boolean) => void;
};
