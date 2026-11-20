// Ordenación de listados V1 (cliente): sin orden (el de la API) → ascendente → descendente → sin orden.
export type Orden<C extends string> = { campo: C; dir: "asc" | "desc" } | null;

export function siguienteOrden<C extends string>(actual: Orden<C>, campo: C): Orden<C> {
  if (!actual || actual.campo !== campo) {
    return { campo, dir: "asc" };
  }

  return actual.dir === "asc" ? { campo, dir: "desc" } : null;
}

export function compararTexto(a: string, b: string) {
  return a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
}

/** Ordena una copia del conjunto COMPLETO (ya filtrado) antes de paginar. */
export function ordenarLista<T, C extends string>(
  filas: T[],
  orden: Orden<C>,
  comparar: (campo: C, a: T, b: T) => number,
): T[] {
  if (!orden) {
    return filas;
  }

  const factor = orden.dir === "asc" ? 1 : -1;

  return [...filas].sort((a, b) => factor * comparar(orden.campo, a, b));
}
