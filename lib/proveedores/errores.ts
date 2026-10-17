import { pestanaDeCampo, type PestanaId } from "@/lib/proveedores/pestanas";

/**
 * Error de validación con destino: la ruta del campo (por ejemplo `razonSocial` o `contactos.0.nombre`) y, derivada de ella,
 * la pestaña del formulario. La API lo devuelve como { error, campo, pestana } para que la pantalla enfoque el campo exacto.
 */
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
