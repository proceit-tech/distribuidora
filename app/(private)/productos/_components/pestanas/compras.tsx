"use client";

import { Casilla, Selector, Texto } from "../campos";
import type { ContextoFormulario } from "../contexto";
import styles from "../producto-form.module.css";
import { TarjetaFila, TituloColeccion } from "./repetidores";

export function PestanaCompras({ ctx }: { ctx: ContextoFormulario }) {
  const { form, errores, catalogos } = ctx;
  const unidades = [["", "Seleccione unidad"], ...catalogos.unidades.map((u): [string, string] => [u.id, `${u.codigo} · ${u.nombre}`])] as Array<[string, string]>;

  return (
    <>
      <TituloColeccion titulo="Presentaciones y conversiones" boton="Agregar presentación" alAgregar={() => ctx.agregar("unidades")} />

      {form.unidades.length === 0 ? <div className={styles.empty}>Sin presentaciones adicionales.</div> : null}

      <div className={styles.repeaterList}>
        {form.unidades.map((u, i) => {
          const p = `unidades.${i}`;
          const cambiar = (parche: Record<string, unknown>) => ctx.actualizar("unidades", u.id, parche);

          return (
            <TarjetaFila key={u.id} ctx={ctx} coleccion="unidades" id={u.id} titulo={`Presentación ${i + 1}`}>
              <div className={styles.gridFour}>
                <Selector etiqueta="Unidad *" campo={`${p}.unidadMedidaId`} errores={errores} valor={u.unidadMedidaId} alCambiar={(v) => cambiar({ unidadMedidaId: v })} opciones={unidades} />
                <Texto etiqueta="Presentación *" campo={`${p}.nombrePresentacion`} errores={errores} valor={u.nombrePresentacion} alCambiar={(v) => cambiar({ nombrePresentacion: v })} maxLength={100} />
                <Texto etiqueta="Factor de conversión *" campo={`${p}.factorConversion`} errores={errores} valor={u.factorConversion} alCambiar={(v) => cambiar({ factorConversion: v })} modo="decimal" maxLength={19} ayuda="Mayor que cero; hasta 6 decimales." />
                <Texto etiqueta="Código de barras" campo={`${p}.codigoBarras`} errores={errores} valor={u.codigoBarras} alCambiar={(v) => cambiar({ codigoBarras: v })} maxLength={80} />
              </div>
              <div className={styles.gridFour}>
                <Texto etiqueta="Peso bruto (kg)" campo={`${p}.pesoBrutoKg`} errores={errores} valor={u.pesoBrutoKg} alCambiar={(v) => cambiar({ pesoBrutoKg: v })} modo="decimal" maxLength={19} />
                <Texto etiqueta="Volumen (m³)" campo={`${p}.volumenM3`} errores={errores} valor={u.volumenM3} alCambiar={(v) => cambiar({ volumenM3: v })} modo="decimal" maxLength={19} />
              </div>
              <div className={styles.checkGrid}>
                <Casilla etiqueta="Unidad base" campo={`${p}.esUnidadBase`} valor={u.esUnidadBase} alCambiar={(v) => ctx.set("unidades", form.unidades.map((x) => ({ ...x, esUnidadBase: x.id === u.id ? v : v ? false : x.esUnidadBase })))} />
                <Casilla etiqueta="Unidad de compra" campo={`${p}.esUnidadCompra`} valor={u.esUnidadCompra} alCambiar={(v) => cambiar({ esUnidadCompra: v })} />
                <Casilla etiqueta="Unidad de venta" campo={`${p}.esUnidadVenta`} valor={u.esUnidadVenta} alCambiar={(v) => cambiar({ esUnidadVenta: v })} />
              </div>
            </TarjetaFila>
          );
        })}
      </div>

      <TituloColeccion titulo="Proveedores del producto" boton="Agregar proveedor" alAgregar={() => ctx.agregar("proveedores")} />

      {form.proveedores.length === 0 ? <div className={styles.empty}>Sin proveedores asociados.</div> : null}

      <div className={styles.repeaterList}>
        {form.proveedores.map((x, i) => {
          const p = `proveedores.${i}`;
          const cambiar = (parche: Record<string, unknown>) => ctx.actualizar("proveedores", x.id, parche);

          return (
            <TarjetaFila key={x.id} ctx={ctx} coleccion="proveedores" id={x.id} titulo={`Proveedor ${i + 1}`}>
              <div className={styles.gridFour}>
                <Selector
                  etiqueta="Proveedor *"
                  campo={`${p}.proveedorId`}
                  errores={errores}
                  valor={x.proveedorId}
                  alCambiar={(v) => cambiar({ proveedorId: v, proveedorNombre: catalogos.proveedores.find((r) => r.id === v)?.razon_social ?? "" })}
                  opciones={[["", "Seleccione proveedor"], ...catalogos.proveedores.map((r): [string, string] => [r.id, `${r.codigo} · ${r.razon_social}`])]}
                />
                <Texto etiqueta="Código del proveedor" campo={`${p}.codigoProveedor`} errores={errores} valor={x.codigoProveedor} alCambiar={(v) => cambiar({ codigoProveedor: v })} maxLength={80} />
                <Texto etiqueta="Descripción del proveedor" campo={`${p}.descripcionProveedor`} errores={errores} valor={x.descripcionProveedor} alCambiar={(v) => cambiar({ descripcionProveedor: v })} maxLength={300} />
                <Selector etiqueta="Unidad" campo={`${p}.unidadMedidaId`} errores={errores} valor={x.unidadMedidaId} alCambiar={(v) => cambiar({ unidadMedidaId: v })} opciones={[["", "Sin unidad"], ...unidades.slice(1)]} />
              </div>
              <div className={styles.gridFour}>
                <Texto etiqueta="Factor de conversión" campo={`${p}.factorConversion`} errores={errores} valor={x.factorConversion} alCambiar={(v) => cambiar({ factorConversion: v })} modo="decimal" maxLength={19} ayuda="Mayor que cero; vacío = 1." />
                <Texto etiqueta="Costo de referencia" campo={`${p}.costoReferencia`} errores={errores} valor={x.costoReferencia} alCambiar={(v) => cambiar({ costoReferencia: v })} modo="decimal" maxLength={19} ayuda="No es el costo real del inventario." />
                <Selector etiqueta="Moneda" campo={`${p}.monedaCodigo`} errores={errores} valor={x.monedaCodigo} alCambiar={(v) => cambiar({ monedaCodigo: v })} opciones={[["", "Sin moneda"], ...catalogos.monedas.map((m): [string, string] => [m.codigo, `${m.codigo} · ${m.nombre}`])]} />
                <Texto etiqueta="Cantidad mínima de compra" campo={`${p}.cantidadMinimaCompra`} errores={errores} valor={x.cantidadMinimaCompra} alCambiar={(v) => cambiar({ cantidadMinimaCompra: v })} modo="decimal" maxLength={19} />
              </div>
              <div className={styles.gridFour}>
                <Texto etiqueta="Plazo de entrega (días)" campo={`${p}.plazoEntregaDias`} errores={errores} valor={x.plazoEntregaDias} alCambiar={(v) => cambiar({ plazoEntregaDias: v })} modo="numeric" maxLength={9} />
              </div>
              <div className={styles.checkGrid}>
                <Casilla etiqueta="Proveedor principal" campo={`${p}.esPrincipal`} valor={x.esPrincipal} alCambiar={(v) => ctx.marcarPrincipal("proveedores", x.id, v)} />
              </div>
            </TarjetaFila>
          );
        })}
      </div>
    </>
  );
}
