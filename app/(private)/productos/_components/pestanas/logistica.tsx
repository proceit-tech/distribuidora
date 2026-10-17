"use client";

import { Area, Selector, SubTitulo, Texto } from "../campos";
import type { ContextoFormulario } from "../contexto";
import styles from "../producto-form.module.css";

export function PestanaLogistica({ ctx }: { ctx: ContextoFormulario }) {
  const { form, errores } = ctx;
  const dec = (etiqueta: string, campo: keyof typeof form, ayuda?: string) => (
    <Texto etiqueta={etiqueta} campo={campo} errores={errores} valor={String(form[campo] ?? "")} alCambiar={(v) => ctx.set(campo, v as never)} modo="decimal" maxLength={19} ayuda={ayuda} />
  );

  return (
    <>
      <div className={styles.sectionTitle}>
        <h3>Logística</h3>
      </div>

      <SubTitulo>Características físicas</SubTitulo>
      <div className={styles.gridFour}>
        {dec("Peso neto (kg)", "pesoNetoKg", "Hasta 4 decimales, con punto.")}
        {dec("Peso bruto (kg)", "pesoBrutoKg")}
        {dec("Largo (cm)", "largoCm")}
        {dec("Ancho (cm)", "anchoCm")}
      </div>
      <div className={styles.gridFour}>
        {dec("Alto (cm)", "altoCm")}
        {dec("Volumen (m³)", "volumenM3")}
      </div>

      <SubTitulo>Merma y quiebra</SubTitulo>
      <p className={styles.nota} style={{ margin: "0 0 10px" }}>
        Valores por defecto del producto: no modifican el inventario. La merma o quiebra real se informa en la operación.
      </p>
      <div className={styles.gridFour}>
        <Selector
          etiqueta="Relación mercadería"
          campo="relacionMercaderia"
          errores={errores}
          valor={form.relacionMercaderia}
          alCambiar={(v) => ctx.set("relacionMercaderia", v)}
          opciones={[
            ["", "Sin relación"],
            ["1", "1 · Quiebra"],
            ["2", "2 · Merma"],
          ]}
        />
        {dec("Cantidad de merma", "cantidadMerma")}
        {dec("Porcentaje de merma (%)", "porcentajeMerma", "Entre 0 y 100, hasta 4 decimales.")}
      </div>

      <SubTitulo>Observación</SubTitulo>
      <Area etiqueta="Observación interna" campo="observacion" errores={errores} valor={form.observacion} alCambiar={(v) => ctx.set("observacion", v)} maxLength={1000} />
    </>
  );
}
