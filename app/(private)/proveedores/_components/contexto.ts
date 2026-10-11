import type { FormularioProveedor, RetencionFormulario } from "@/lib/proveedores/formulario";
import type { CatalogoProveedores, ProveedorContacto, ProveedorCuentaBancaria, ProveedorDetalle, ProveedorDireccion } from "@/types/proveedores";

import type { Errores } from "./campos";

export type ColeccionClave = "contactos" | "direcciones" | "cuentasBancarias" | "retenciones";

export type ItemDe = {
  contactos: ProveedorContacto;
  direcciones: ProveedorDireccion;
  cuentasBancarias: ProveedorCuentaBancaria;
  retenciones: RetencionFormulario;
};

/** Todo lo que necesitan las pestañas: datos, errores por campo, catálogos y operaciones sobre las filas relacionadas. */
export type ContextoFormulario = {
  modo: "crear" | "editar";
  form: FormularioProveedor;
  detalle?: ProveedorDetalle;
  catalogos: CatalogoProveedores;
  errores: Errores;
  set: <K extends keyof FormularioProveedor>(clave: K, valor: FormularioProveedor[K]) => void;
  cambiarIdentificacion: (parche: Partial<Pick<FormularioProveedor, "paisCodigo" | "tipoDocumento" | "numeroDocumento">>) => void;
  agregar: (coleccion: ColeccionClave) => void;
  actualizar: <C extends ColeccionClave>(coleccion: C, id: string, parche: Partial<ItemDe[C]>) => void;
  quitar: (coleccion: ColeccionClave, id: string) => void;
  /** Marca como principal una fila y desmarca las demás del mismo grupo (tipo o moneda cuando corresponde). */
  marcarPrincipal: (coleccion: "contactos" | "direcciones" | "cuentasBancarias", id: string, valor: boolean) => void;
};
