"use client";

import { isoALocal } from "@/lib/proveedores/fechas";
import { TIPO_DOCUMENTO_TEXTO } from "@/lib/proveedores/textos";

import { SinRegistros } from "../campos";
import type { ContextoFormulario } from "../contexto";
import styles from "../proveedor-form.module.css";

export function PestanaDocumentos({ ctx }: { ctx: ContextoFormulario }) {
  const documentos = ctx.detalle?.documentos ?? [];

  return (
    <>
      <div className={styles.sectionTitle}>
        <h3>Documentos</h3>
      </div>

      {documentos.length === 0 ? <SinRegistros texto="Aún no hay documentos cargados." /> : null}

      <div className={styles.repeaterList}>
        {documentos.map((d) => (
          <article key={d.id} className={styles.repeaterCard}>
            <header>
              <strong>{TIPO_DOCUMENTO_TEXTO[d.tipo] ?? d.tipo}</strong>
            </header>
            <div className={styles.gridThree}>
              <div className={styles.field}>
                <span>Archivo</span>
                <div className={styles.soloLectura}>{d.nombreArchivo}</div>
              </div>
              <div className={styles.field}>
                <span>Emisión</span>
                <div className={styles.soloLectura}>{isoALocal(d.fechaEmision) || "—"}</div>
              </div>
              <div className={styles.field}>
                <span>Vencimiento</span>
                <div className={styles.soloLectura}>{isoALocal(d.fechaVencimiento) || "—"}</div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
