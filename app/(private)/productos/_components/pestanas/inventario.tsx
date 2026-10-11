"use client";

import type { ProductoModoControlStock } from "@/types/productos";

import { Casilla, Selector, Texto } from "../campos";
import type { ContextoFormulario } from "../contexto";
import styles from "../producto-form.module.css";
import { TarjetaFila, TituloColeccion } from "./repetidores";

export function PestanaInventario({ ctx }: { ctx: ContextoFormulario }) {
  const { form, errores, catalogos, detalle } = ctx;
  const apertura = detalle?.aperturaRegistrada ?? null;
  const moneda = catalogos.monedaReferencia ? ` (${catalogos.monedaReferencia})` : "";

  return (
    <>
      <div className={styles.sectionTitle}>
        <h3>Inventario y trazabilidad</h3>
      </div>

      <div className={styles.gridFour}>
        <Selector
          etiqueta="Control de stock"
          campo="modoControlStock"
          errores={errores}
          valor={form.modoControlStock}
          alCambiar={(v) => ctx.set("modoControlStock", v as ProductoModoControlStock)}
          opciones={[
            ["CANTIDAD", "Por cantidad"],
            ["LOTE", "Por lote"],
            ["UNIDAD_ETIQUETADA", "Por serie / etiqueta"],
          ]}
        />
        <Texto etiqueta="Stock mínimo" campo="stockMinimo" errores={errores} valor={form.stockMinimo} alCambiar={(v) => ctx.set("stockMinimo", v)} modo="decimal" maxLength={19} ayuda="Hasta 4 decimales." />
        <Texto etiqueta="Stock máximo" campo="stockMaximo" errores={errores} valor={form.stockMaximo} alCambiar={(v) => ctx.set("stockMaximo", v)} modo="decimal" maxLength={19} />
        <Texto etiqueta="Punto de reposición" campo="puntoReposicion" errores={errores} valor={form.puntoReposicion} alCambiar={(v) => ctx.set("puntoReposicion", v)} modo="decimal" maxLength={19} />
      </div>

      <div className={styles.gridFour}>
        {ctx.modo === "crear" ? (
          <>
            <Texto etiqueta="Inventario inicial" campo="inventarioInicial.cantidad" errores={errores} valor={form.inventarioInicial.cantidad} alCambiar={(v) => ctx.set("inventarioInicial", { ...form.inventarioInicial, cantidad: v })} modo="decimal" maxLength={19} ayuda="Genera un movimiento real de apertura." />
            <Texto etiqueta={`Costo unitario de apertura${moneda}`} campo="inventarioInicial.costoUnitario" errores={errores} valor={form.inventarioInicial.costoUnitario} alCambiar={(v) => ctx.set("inventarioInicial", { ...form.inventarioInicial, costoUnitario: v })} modo="decimal" maxLength={19} ayuda="Obligatorio si hay inventario inicial." />
            <Selector
              etiqueta="Depósito de apertura"
              campo="inventarioInicial.depositoId"
              errores={errores}
              valor={form.inventarioInicial.depositoId}
              alCambiar={(v) => ctx.set("inventarioInicial", { ...form.inventarioInicial, depositoId: v })}
              opciones={[["", "Seleccione depósito"], ...catalogos.depositos.map((d): [string, string] => [d.id, d.nombre])]}
            />
          </>
        ) : (
          <>
            <Texto etiqueta="Inventario inicial" campo="aperturaCantidad" errores={errores} valor={apertura ? `${apertura.cantidad} · mov. ${apertura.numero}` : "Sin movimiento de apertura"} alCambiar={() => undefined} readOnly />
            <Texto etiqueta="Costo de apertura" campo="aperturaCosto" errores={errores} valor={apertura?.costoUnitario ?? ""} alCambiar={() => undefined} readOnly />
            <Texto etiqueta="Depósito de apertura" campo="aperturaDeposito" errores={errores} valor={apertura?.depositoNombre ?? ""} alCambiar={() => undefined} readOnly />
          </>
        )}
        <Texto etiqueta="Vida útil (días)" campo="vidaUtilDias" errores={errores} valor={form.vidaUtilDias} alCambiar={(v) => ctx.set("vidaUtilDias", v)} modo="numeric" maxLength={9} />
      </div>

      <div className={styles.gridFour}>
        <Texto etiqueta="Stock actual (real)" campo="stockActual" errores={errores} valor={ctx.modo === "crear" ? "0 (tras guardar según el inventario inicial)" : (detalle?.stockActual ?? "0")} alCambiar={() => undefined} readOnly />
        <Texto etiqueta={`Costo promedio${moneda}`} campo="costoPromedio" errores={errores} valor={detalle?.costoPromedio ?? ""} alCambiar={() => undefined} readOnly placeholder="Sin saldo valorizado" />
        {detalle?.stockPorDeposito.map((s) => (
          <Texto key={s.depositoId} etiqueta={`Stock en ${s.depositoNombre}`} campo={`stock-${s.depositoId}`} errores={errores} valor={s.cantidad} alCambiar={() => undefined} readOnly />
        ))}
      </div>

      <div className={styles.checkGrid}>
        <Casilla etiqueta="Controla stock" campo="controlaStock" valor={form.controlaStock} alCambiar={(v) => ctx.set("controlaStock", v)} />
        <Casilla etiqueta="Requiere vencimiento" campo="requiereVencimiento" valor={form.requiereVencimiento} alCambiar={(v) => ctx.set("requiereVencimiento", v)} />
        <Casilla etiqueta="Requiere inspección de calidad" campo="requiereInspeccionCalidad" valor={form.requiereInspeccionCalidad} alCambiar={(v) => ctx.set("requiereInspeccionCalidad", v)} />
      </div>

      <TituloColeccion titulo="Políticas por depósito" boton="Agregar depósito" alAgregar={() => ctx.agregar("depositos")} />

      {form.depositos.length === 0 ? <div className={styles.empty}>Sin políticas por depósito.</div> : null}

      <div className={styles.repeaterList}>
        {form.depositos.map((x, i) => {
          const p = `depositos.${i}`;
          const cambiar = (parche: Record<string, unknown>) => ctx.actualizar("depositos", x.id, parche);

          return (
            <TarjetaFila key={x.id} ctx={ctx} coleccion="depositos" id={x.id} titulo={`Depósito ${i + 1}`}>
              <div className={styles.gridFour}>
                <Selector
                  etiqueta="Depósito *"
                  campo={`${p}.depositoId`}
                  errores={errores}
                  valor={x.depositoId}
                  alCambiar={(v) => cambiar({ depositoId: v, depositoNombre: catalogos.depositos.find((d) => d.id === v)?.nombre ?? "" })}
                  opciones={[["", "Seleccione depósito"], ...catalogos.depositos.map((d): [string, string] => [d.id, `${d.codigo} · ${d.nombre}`])]}
                />
                <Texto etiqueta="Stock mínimo" campo={`${p}.stockMinimo`} errores={errores} valor={x.stockMinimo} alCambiar={(v) => cambiar({ stockMinimo: v })} modo="decimal" maxLength={19} />
                <Texto etiqueta="Stock máximo" campo={`${p}.stockMaximo`} errores={errores} valor={x.stockMaximo} alCambiar={(v) => cambiar({ stockMaximo: v })} modo="decimal" maxLength={19} />
                <Texto etiqueta="Punto de reposición" campo={`${p}.puntoReposicion`} errores={errores} valor={x.puntoReposicion} alCambiar={(v) => cambiar({ puntoReposicion: v })} modo="decimal" maxLength={19} />
              </div>
              <div className={styles.gridFour}>
                <Texto etiqueta="Cantidad a reponer" campo={`${p}.cantidadReposicion`} errores={errores} valor={x.cantidadReposicion} alCambiar={(v) => cambiar({ cantidadReposicion: v })} modo="decimal" maxLength={19} />
              </div>
            </TarjetaFila>
          );
        })}
      </div>
    </>
  );
}
