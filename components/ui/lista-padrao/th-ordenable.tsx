import styles from "./lista.module.css";
import type { Orden } from "./orden";

type Props<C extends string> = {
  titulo: string;
  campo?: C;
  orden?: Orden<C>;
  onOrden?: (campo: C) => void;
  alinear?: "derecha";
};

/** Encabezado de columna de los listados V1: ordenable (botón con indicador y aria-sort) o simple. */
export function ThOrdenable<C extends string>({ titulo, campo, orden, onOrden, alinear }: Props<C>) {
  const activo = campo !== undefined && orden?.campo === campo;

  return (
    <th
      scope="col"
      className={alinear === "derecha" ? styles.numericHead : undefined}
      aria-sort={
        campo === undefined ? undefined : activo ? (orden?.dir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      {campo !== undefined && onOrden ? (
        <button
          type="button"
          className={styles.sortButton}
          onClick={() => onOrden(campo)}
          title={`Ordenar por ${titulo.toLowerCase()}`}
        >
          {titulo}
          <i aria-hidden="true">{activo ? (orden?.dir === "asc" ? "▲" : "▼") : "⇅"}</i>
        </button>
      ) : (
        titulo
      )}
    </th>
  );
}
