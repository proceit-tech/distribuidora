"use client";

import type { RetencionFormulario } from "@/lib/proveedores/formulario";

import { isoALocal } from "@/lib/proveedores/fechas";

import { Area, Casilla, Fecha, Selector, SinRegistros, Texto } from "../campos";
import type { ContextoFormulario } from "../contexto";
import styles from "../proveedor-form.module.css";

export function PestanaRetenciones({ ctx }: { ctx: ContextoFormulario }) {
  const { form, errores, catalogos } = ctx;
  // Certificados que se pueden vincular: documentos de retención del proveedor, con archivo (solo existen una vez guardado el proveedor).
  const certificados = (ctx.detalle?.documentos ?? []).filter((d) => d.tipo === "CERTIFICADO_RETENCION" && d.tieneArchivo);

  return (
    <>
      <div className={styles.sectionTitle}>
        <h3>Retenciones</h3>
        <button type="button" className={styles.addButton} onClick={() => ctx.agregar("retenciones")}>
          + Agregar retención
        </button>
      </div>

      {form.retenciones.length === 0 ? <SinRegistros texto="Aún no hay retenciones cargadas." /> : <p className={styles.nota} style={{ margin: "0 0 10px" }}>* Obligatorio en cada retención agregada. El cadastro solo registra la regla; no calcula retenciones.</p>}

      <div className={styles.repeaterList}>
        {form.retenciones.map((r, i) => {
          const p = `retenciones.${i}`;
          const cambiar = (parche: Partial<RetencionFormulario>) => ctx.actualizar("retenciones", r.id, parche);

          return (
            <article key={r.id} className={styles.repeaterCard}>
              <header>
                <strong>Retención {i + 1}</strong>
                <button type="button" onClick={() => ctx.quitar("retenciones", r.id)}>
                  Eliminar
                </button>
              </header>

              <div className={styles.gridFour}>
                <Selector
                  etiqueta="Tipo *"
                  campo={`${p}.tipo`}
                  errores={errores}
                  valor={r.tipo}
                  alCambiar={(v) => cambiar({ tipo: v as RetencionFormulario["tipo"] })}
                  opciones={[
                    ["IVA", "IVA"],
                    ["RENTA", "Renta"],
                    ["OTRA", "Otra"],
                  ]}
                />
                <Selector
                  etiqueta="Impuesto"
                  campo={`${p}.impuestoId`}
                  errores={errores}
                  valor={r.impuestoId ?? ""}
                  alCambiar={(v) => cambiar({ impuestoId: v || null })}
                  opciones={[["", "Sin impuesto"], ...catalogos.impuestos.map((x): [string, string] => [x.id, `${x.codigo} · ${x.nombre}`])]}
                />
                <Texto etiqueta="Porcentaje (%) *" campo={`${p}.porcentaje`} errores={errores} valor={r.porcentaje} alCambiar={(v) => cambiar({ porcentaje: v })} maxLength={6} modo="decimal" ayuda="De 0 a 100, hasta 2 decimales." />
              </div>

              <div className={styles.gridFour}>
                <Fecha etiqueta="Vigente desde" campo={`${p}.fechaVigenciaDesde`} errores={errores} valor={r.fechaVigenciaDesde} alCambiar={(v) => cambiar({ fechaVigenciaDesde: v })} />
                <Fecha etiqueta="Vigente hasta" campo={`${p}.fechaVigenciaHasta`} errores={errores} valor={r.fechaVigenciaHasta} alCambiar={(v) => cambiar({ fechaVigenciaHasta: v })} />
              </div>

              <div className={styles.gridFour}>
                <Selector
                  etiqueta={r.certificadoObligatorio ? "Certificado vinculado *" : "Certificado vinculado"}
                  campo={`${p}.documentoCertificadoId`}
                  errores={errores}
                  valor={r.documentoCertificadoId ?? ""}
                  disabled={ctx.modo === "crear"}
                  alCambiar={(v) => cambiar({ documentoCertificadoId: v || null, ...(v ? {} : { activa: r.certificadoObligatorio ? false : r.activa }) })}
                  opciones={[
                    ["", ctx.modo === "crear" ? "Disponible tras guardar el proveedor" : certificados.length === 0 ? "Sin certificados cargados" : "Sin certificado"],
                    ...certificados.map((c): [string, string] => [c.id, `${c.nombreArchivo}${c.fechaVencimiento ? ` · vence ${isoALocal(c.fechaVencimiento)}` : ""}`]),
                  ]}
                />
              </div>

              <div className={styles.checkGrid}>
                <Casilla
                  etiqueta="Exige certificado"
                  campo={`${p}.certificadoObligatorio`}
                  valor={r.certificadoObligatorio}
                  alCambiar={(v) => cambiar({ certificadoObligatorio: v, ...(v && !r.documentoCertificadoId ? { activa: false } : {}) })}
                />
                <Casilla
                  etiqueta="Retención activa"
                  campo={`${p}.activa`}
                  valor={r.activa}
                  disabled={r.certificadoObligatorio && !r.documentoCertificadoId}
                  alCambiar={(v) => cambiar({ activa: v })}
                />
              </div>
              {r.certificadoObligatorio && !r.documentoCertificadoId ? (
                <p className={styles.textoSecundario} style={{ margin: "0 0 12px" }}>
                  Esta retención exige certificado: cargue un certificado de retención en la pestaña Documentos, vincúlelo aquí y luego actívela.
                </p>
              ) : null}
              {r.certificadoObligatorio && r.documentoCertificadoId && r.certificadoValido === false ? (
                <p className={styles.campoError} style={{ margin: "0 0 12px" }}>
                  El certificado vinculado ya no es válido (vencido o eliminado): la retención no puede seguir activa hasta vincular otro.
                </p>
              ) : null}

              <Area etiqueta="Observación" campo={`${p}.observacion`} errores={errores} valor={r.observacion} alCambiar={(v) => cambiar({ observacion: v })} maxLength={1000} />
            </article>
          );
        })}
      </div>
    </>
  );
}
