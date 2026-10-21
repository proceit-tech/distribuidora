"use client";

import { Casilla, SinRegistros, Texto } from "../campos";
import type { ContextoFormulario } from "../contexto";
import styles from "../proveedor-form.module.css";

const PREFERENCIAS = [
  ["recibeCotizaciones", "Recibe cotizaciones"],
  ["recibeOrdenesCompra", "Recibe órdenes de compra"],
  ["recibeLogistica", "Recibe logística"],
  ["recibeDevoluciones", "Recibe devoluciones"],
  ["recibePagos", "Recibe pagos"],
  ["recibeCalidad", "Recibe calidad"],
  ["recibeNotificaciones", "Recibe notificaciones"],
] as const;

export function PestanaContactos({ ctx }: { ctx: ContextoFormulario }) {
  const { form, errores } = ctx;

  return (
    <>
      <div className={styles.sectionTitle}>
        <h3>Contactos</h3>
        <button type="button" className={styles.addButton} onClick={() => ctx.agregar("contactos")}>
          + Agregar contacto
        </button>
      </div>

      {form.contactos.length === 0 ? <SinRegistros texto="Aún no hay contactos cargados." /> : <p className={styles.nota} style={{ margin: "0 0 10px" }}>* Obligatorio en cada contacto agregado.</p>}

      <div className={styles.repeaterList}>
        {form.contactos.map((c, i) => {
          const p = `contactos.${i}`;
          const cambiar = (parche: Partial<typeof c>) => ctx.actualizar("contactos", c.id, parche);

          return (
            <article key={c.id} className={styles.repeaterCard}>
              <header>
                <strong>Contacto {i + 1}</strong>
                <button type="button" onClick={() => ctx.quitar("contactos", c.id)}>
                  Eliminar
                </button>
              </header>

              <div className={styles.gridFour}>
                <Texto etiqueta="Nombre *" campo={`${p}.nombre`} errores={errores} valor={c.nombre} alCambiar={(v) => cambiar({ nombre: v })} maxLength={100} />
                <Texto etiqueta="Apellido" campo={`${p}.apellido`} errores={errores} valor={c.apellido} alCambiar={(v) => cambiar({ apellido: v })} maxLength={100} />
                <Texto etiqueta="Cargo" campo={`${p}.cargo`} errores={errores} valor={c.cargo} alCambiar={(v) => cambiar({ cargo: v })} maxLength={100} />
                <Texto etiqueta="Departamento o área" campo={`${p}.departamento`} errores={errores} valor={c.departamento} alCambiar={(v) => cambiar({ departamento: v })} maxLength={100} />
              </div>

              <div className={styles.gridThree}>
                <Texto etiqueta="Teléfono" campo={`${p}.telefono`} errores={errores} valor={c.telefono} alCambiar={(v) => cambiar({ telefono: v })} maxLength={50} />
                <Texto etiqueta="Celular" campo={`${p}.celular`} errores={errores} valor={c.celular} alCambiar={(v) => cambiar({ celular: v })} maxLength={50} />
                <Texto etiqueta="Correo" campo={`${p}.email`} errores={errores} valor={c.email} alCambiar={(v) => cambiar({ email: v })} maxLength={150} tipo="email" />
              </div>

              <div className={styles.checkGrid}>
                <Casilla etiqueta="Contacto principal" campo={`${p}.esPrincipal`} valor={c.esPrincipal} alCambiar={(v) => ctx.marcarPrincipal("contactos", c.id, v)} />
                {PREFERENCIAS.map(([clave, etiqueta]) => (
                  <Casilla key={clave} etiqueta={etiqueta} valor={c[clave]} alCambiar={(v) => cambiar({ [clave]: v })} />
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
