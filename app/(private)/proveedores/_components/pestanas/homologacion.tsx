"use client";

import { Area, Casilla, Selector, Texto } from "../campos";
import type { ContextoFormulario } from "../contexto";
import styles from "../proveedor-form.module.css";
import { PanelGobernanza } from "./panel-gobernanza";

export function PestanaHomologacion({ ctx }: { ctx: ContextoFormulario }) {
  const { form, errores, catalogos } = ctx;

  return (
    <>
      <div className={styles.sectionTitle}>
        <h3>Homologación y logística</h3>
      </div>

      <PanelGobernanza ctx={ctx} />

      <div className={styles.gridFour}>
        <Selector
          etiqueta="Incoterm"
          campo="incotermCodigo"
          errores={errores}
          valor={form.incotermCodigo}
          alCambiar={(v) => ctx.set("incotermCodigo", v)}
          opciones={[["", "Sin Incoterm"], ...catalogos.incoterms.map((i): [string, string] => [i.codigo, `${i.codigo} · ${i.nombre}`])]}
        />
        <Selector
          etiqueta="Transporte preferido"
          campo="metodoTransportePreferido"
          errores={errores}
          valor={form.metodoTransportePreferido}
          alCambiar={(v) => ctx.set("metodoTransportePreferido", v)}
          opciones={[
            ["", "Sin preferencia"],
            ["TERRESTRE", "Terrestre"],
            ["MARITIMO", "Marítimo"],
            ["AEREO", "Aéreo"],
            ["FERROVIARIO", "Ferroviario"],
            ["MULTIMODAL", "Multimodal"],
            ["OTRO", "Otro"],
          ]}
        />
        <Texto etiqueta="Días para confirmar el pedido" campo="diasConfirmacionPedido" errores={errores} valor={form.diasConfirmacionPedido} alCambiar={(v) => ctx.set("diasConfirmacionPedido", v)} maxLength={5} modo="numeric" />
      </div>

      <Area etiqueta="Condición de entrega" campo="condicionEntrega" errores={errores} valor={form.condicionEntrega} alCambiar={(v) => ctx.set("condicionEntrega", v)} maxLength={500} />

      <div className={styles.checkGrid}>
        <Casilla etiqueta="Permite entrega parcial" campo="permiteEntregaParcial" valor={form.permiteEntregaParcial} alCambiar={(v) => ctx.set("permiteEntregaParcial", v)} />
      </div>
    </>
  );
}
