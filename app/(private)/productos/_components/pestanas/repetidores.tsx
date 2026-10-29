"use client";

import { UUID, type Coleccion } from "@/lib/productos/normalizar";

import type { ContextoFormulario } from "../contexto";
import styles from "../producto-form.module.css";

/** Título de sección con el botón de agregar. */
export function TituloColeccion({ titulo, boton, alAgregar, deshabilitado }: { titulo: string; boton: string; alAgregar: () => void; deshabilitado?: boolean }) {
  return (
    <div className={styles.sectionTitle}>
      <h3>{titulo}</h3>
      <button type="button" className={styles.addButton} onClick={alAgregar} disabled={deshabilitado}>
        + {boton}
      </button>
    </div>
  );
}

/** Tarjeta de una fila relacionada con su botón Eliminar (las filas guardadas piden confirmación: se eliminan al guardar). */
export function TarjetaFila({ ctx, coleccion, id, titulo, children }: { ctx: ContextoFormulario; coleccion: Coleccion; id: string; titulo: string; children: React.ReactNode }) {
  const guardada = UUID.test(id);

  return (
    <article className={styles.repeaterCard}>
      <header>
        <strong>{titulo}</strong>
        <button
          type="button"
          onClick={() => {
            if (guardada && !window.confirm("Este registro ya está guardado: se eliminará al guardar la ficha. ¿Desea continuar?")) return;

            ctx.quitar(coleccion, id);
          }}
        >
          Eliminar
        </button>
      </header>
      {children}
    </article>
  );
}
