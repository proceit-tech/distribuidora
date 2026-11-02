import { pestanaDeCampo, type PestanaId } from "@/lib/productos/pestanas";

/** Error de validación con destino: ruta del campo (por ejemplo `descripcion` o `proveedores.0.factorConversion`) y su pestaña. */
export class ErrorValidacion extends Error {
  readonly pestana: PestanaId | null;

  constructor(
    mensaje: string,
    readonly campo: string | null = null,
    readonly estado: number = 400,
  ) {
    super(mensaje);
    this.pestana = campo ? pestanaDeCampo(campo) : null;
  }
}
