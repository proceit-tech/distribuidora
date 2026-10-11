"use client";

import { Fecha, Selector, Texto } from "../campos";
import type { ContextoFormulario } from "../contexto";
import styles from "../producto-form.module.css";
import { TarjetaFila, TituloColeccion } from "./repetidores";

export function PestanaDocumentos({ ctx }: { ctx: ContextoFormulario }) {
  const { form, errores } = ctx;

  return (
    <>
      <TituloColeccion titulo="Documentos técnicos" boton="Agregar documento" alAgregar={() => ctx.agregar("documentos")} />

      <p className={styles.nota} style={{ margin: "0 0 10px" }}>
        Por ahora los documentos se registran como enlaces (nombre y URL); se conservan los ya cargados. La carga de archivos privados con versiones queda pendiente de aprobación (DEC-PRD-04).
      </p>

      {form.documentos.length === 0 ? <div className={styles.empty}>Sin documentos técnicos.</div> : null}

      <div className={styles.repeaterList}>
        {form.documentos.map((d, i) => {
          const p = `documentos.${i}`;
          const cambiar = (parche: Record<string, unknown>) => ctx.actualizar("documentos", d.id, parche);

          return (
            <TarjetaFila key={d.id} ctx={ctx} coleccion="documentos" id={d.id} titulo={`Documento ${i + 1}`}>
              <div className={styles.gridFour}>
                <Selector
                  etiqueta="Tipo *"
                  campo={`${p}.tipo`}
                  errores={errores}
                  valor={d.tipo}
                  alCambiar={(v) => cambiar({ tipo: v })}
                  opciones={[
                    ["FICHA_TECNICA", "Ficha técnica"],
                    ["HOJA_SEGURIDAD", "Hoja de seguridad"],
                    ["CERTIFICADO", "Certificado"],
                    ["IMAGEN", "Imagen"],
                    ["OTRO", "Otro"],
                  ]}
                />
                <Texto etiqueta="Nombre del archivo *" campo={`${p}.nombreArchivo`} errores={errores} valor={d.nombreArchivo} alCambiar={(v) => cambiar({ nombreArchivo: v })} maxLength={255} />
                <Texto etiqueta="URL del archivo *" campo={`${p}.urlArchivo`} errores={errores} valor={d.urlArchivo} alCambiar={(v) => cambiar({ urlArchivo: v })} maxLength={2000} tipo="url" />
                <Texto etiqueta="Observación" campo={`${p}.observacion`} errores={errores} valor={d.observacion} alCambiar={(v) => cambiar({ observacion: v })} maxLength={500} />
              </div>
              <div className={styles.gridFour}>
                <Fecha etiqueta="Emisión" campo={`${p}.fechaEmision`} errores={errores} valor={d.fechaEmision} alCambiar={(v) => cambiar({ fechaEmision: v })} />
                <Fecha etiqueta="Vencimiento" campo={`${p}.fechaVencimiento`} errores={errores} valor={d.fechaVencimiento} alCambiar={(v) => cambiar({ fechaVencimiento: v })} />
              </div>
            </TarjetaFila>
          );
        })}
      </div>
    </>
  );
}
