"use client";

import { Casilla, Fecha, Selector, Texto } from "../campos";
import type { ContextoFormulario } from "../contexto";
import styles from "../proveedor-form.module.css";

export function PestanaCompras({ ctx }: { ctx: ContextoFormulario }) {
  const { form, errores, catalogos } = ctx;

  return (
    <>
      <div className={styles.sectionTitle}>
        <h3>Compras y pagos</h3>
      </div>

      <div className={styles.gridFour}>
        <Selector
          etiqueta="Condición de pago"
          campo="condicionPagoId"
          errores={errores}
          valor={form.condicionPagoId}
          alCambiar={(v) => ctx.set("condicionPagoId", v)}
          opciones={[["", "Sin condición"], ...catalogos.condicionesPago.map((c): [string, string] => [c.id, c.nombre])]}
        />
        <Selector
          etiqueta="Moneda predeterminada"
          campo="monedaCodigoPredeterminada"
          errores={errores}
          valor={form.monedaCodigoPredeterminada}
          alCambiar={(v) => ctx.set("monedaCodigoPredeterminada", v)}
          opciones={[["", "Sin moneda"], ...catalogos.monedas.map((m): [string, string] => [m.codigo, `${m.codigo} · ${m.nombre}`])]}
        />
        <Selector
          etiqueta="Medio de pago preferido"
          campo="medioPagoPreferidoId"
          errores={errores}
          valor={form.medioPagoPreferidoId}
          alCambiar={(v) => ctx.set("medioPagoPreferidoId", v)}
          opciones={[["", "Sin preferencia"], ...catalogos.mediosPago.map((m): [string, string] => [m.id, m.nombre])]}
        />
        <Texto etiqueta="Día preferido de pago (1 a 31)" campo="diaPagoPreferido" errores={errores} valor={form.diaPagoPreferido} alCambiar={(v) => ctx.set("diaPagoPreferido", v)} maxLength={2} modo="numeric" />
      </div>

      <div className={styles.gridFour}>
        <Texto etiqueta="Plazo de entrega (días)" campo="plazoEntregaDias" errores={errores} valor={form.plazoEntregaDias} alCambiar={(v) => ctx.set("plazoEntregaDias", v)} maxLength={5} modo="numeric" />
        <Texto etiqueta="Descuento comercial (%)" campo="descuentoComercialPct" errores={errores} valor={form.descuentoComercialPct} alCambiar={(v) => ctx.set("descuentoComercialPct", v)} maxLength={6} modo="decimal" ayuda="Hasta 2 decimales, con punto." />
        <Texto etiqueta="Monto mínimo de compra" campo="montoMinimoCompra" errores={errores} valor={form.montoMinimoCompra} alCambiar={(v) => ctx.set("montoMinimoCompra", v)} maxLength={19} modo="decimal" ayuda="Hasta 2 decimales, con punto; sin separador de miles." />
        <Texto etiqueta="Correo para pagos" campo="emailPagos" errores={errores} valor={form.emailPagos} alCambiar={(v) => ctx.set("emailPagos", v)} maxLength={150} tipo="email" />
      </div>

      <div className={styles.gridFour}>
        <Fecha etiqueta="Inicio de la relación" campo="fechaInicioRelacion" errores={errores} valor={form.fechaInicioRelacion} alCambiar={(v) => ctx.set("fechaInicioRelacion", v)} />
        <Fecha etiqueta="Fin de la relación" campo="fechaFinRelacion" errores={errores} valor={form.fechaFinRelacion} alCambiar={(v) => ctx.set("fechaFinRelacion", v)} />
      </div>

      <div className={styles.checkGrid}>
        <Casilla etiqueta="Permite anticipos" campo="permiteAnticipos" valor={form.permiteAnticipos} alCambiar={(v) => ctx.set("permiteAnticipos", v)} />
        <Casilla etiqueta="Requiere orden de compra" campo="requiereOrdenCompra" valor={form.requiereOrdenCompra} alCambiar={(v) => ctx.set("requiereOrdenCompra", v)} />
      </div>
    </>
  );
}
