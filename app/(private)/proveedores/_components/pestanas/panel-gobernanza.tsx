"use client";

import { isoALocal } from "@/lib/proveedores/fechas";
import { HOMOLOGACION_TEXTO, RIESGO_TEXTO } from "@/lib/proveedores/textos";

import type { ContextoFormulario } from "../contexto";
import styles from "../proveedor-form.module.css";

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className={styles.field}>
      <span>{etiqueta}</span>
      <div className={styles.soloLectura}>{valor || "—"}</div>
    </div>
  );
}

/** Estado de homologación y riesgo: se muestra siempre; solo cambia con acciones específicas, con permiso y auditoría. */
export function PanelGobernanza({ ctx }: { ctx: ContextoFormulario }) {
  const d = ctx.detalle;

  return (
    <section className={styles.bloque} aria-label="Homologación y riesgo">
      <h4>Homologación y riesgo</h4>

      <div className={styles.gridFour}>
        <Dato etiqueta="Estado de homologación" valor={HOMOLOGACION_TEXTO[d?.estadoHomologacion ?? "PENDIENTE"]} />
        <Dato etiqueta="Fecha de homologación" valor={isoALocal(d?.fechaHomologacion)} />
        <Dato etiqueta="Vencimiento de la homologación" valor={isoALocal(d?.fechaVencimientoHomologacion)} />
        <Dato etiqueta="Nivel de riesgo" valor={RIESGO_TEXTO[d?.nivelRiesgo ?? "NO_EVALUADO"]} />
      </div>

      <div className={styles.gridFour}>
        <Dato etiqueta="Calificación actual" valor={d?.calificacionActual ? `${d.calificacionActual} / 100` : ""} />
      </div>

      <p className={styles.textoSecundario}>La homologación, el riesgo y el bloqueo se modifican solo con las acciones específicas, que exigen permiso y quedan auditadas.</p>
    </section>
  );
}
