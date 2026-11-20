import { ErrorComercial } from "@/lib/comercial/validacion";

/** CC-A01 — versión de edición de Canales/Zonas: `actualizado_at` con microsegundos (UTC), calculada en SQL con esta misma expresión al listar y al comparar. */
export const SQL_VERSION_COMERCIAL = (columna: string) => `to_char(${columna} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')`;

/**
 * La versión es OBLIGATORIA y debe coincidir exactamente con la persistida. Se llama con la fila ya bloqueada (FOR UPDATE) y antes de duplicados y de cualquier escritura.
 * Sin versión o con una obsoleta → 409; el formulario del cliente conserva lo escrito.
 */
export function exigirVersionComercial(enviada: unknown, actual: string): void {
  const v = typeof enviada === "string" ? enviada.trim() : "";

  if (!v) throw new ErrorComercial("Falta la versión del registro que se está editando. Recargue la página y vuelva a aplicar sus cambios.", null, 409);
  if (v !== actual) {
    throw new ErrorComercial("El registro fue modificado por otra persona después de abrirlo. No se guardó nada: recargue para ver los datos vigentes (copie antes lo que haya escrito).", null, 409);
  }
}
