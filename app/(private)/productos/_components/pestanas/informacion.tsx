"use client";

import { productoRedondeado } from "@/lib/productos/decimales";
import type { ProductoTipo } from "@/types/productos";

import { Casilla, Texto, Selector } from "../campos";
import type { ContextoFormulario } from "../contexto";
import styles from "../producto-form.module.css";

const TIPOS: Array<[ProductoTipo, string]> = [
  ["MERCADERIA", "Mercadería"],
  ["SERVICIO", "Servicio"],
  ["KIT", "Kit / combo"],
  ["ACTIVO_FIJO", "Activo fijo"],
];

export function PestanaInformacion({ ctx }: { ctx: ContextoFormulario }) {
  const { form, errores, catalogos, detalle } = ctx;
  const lineas = catalogos.lineas.filter((l) => l.familiaId === form.familiaId);
  const pais = catalogos.paises.find((p) => p.codigo === form.paisOrigenCodigo);
  const valor = detalle && form.precioVentaReferencia ? productoRedondeado(form.precioVentaReferencia, detalle.stockActual) : null;

  return (
    <>
      <div className={styles.sectionTitle}>
        <h3>Información comercial</h3>
      </div>

      <div className={styles.gridFour}>
        {ctx.modo === "editar" ? <Texto etiqueta="Código interno" campo="codigo" errores={errores} valor={form.codigo} alCambiar={() => undefined} readOnly ayuda="Automático; no se modifica." /> : null}
        <Texto etiqueta="Código inventario" campo="codigoInventario" errores={errores} valor={form.codigoInventario} alCambiar={(v) => ctx.set("codigoInventario", v)} maxLength={80} />
        <Texto etiqueta="Descripción interna *" campo="descripcion" errores={errores} valor={form.descripcion} alCambiar={(v) => ctx.set("descripcion", v)} maxLength={300} />
        <Texto etiqueta="Descripción para factura *" campo="descripcionFactura" errores={errores} valor={form.descripcionFactura} alCambiar={(v) => ctx.set("descripcionFactura", v)} maxLength={120} ayuda="Hasta 120 caracteres." />
      </div>

      <div className={styles.gridFour}>
        <Selector etiqueta="Tipo de producto *" campo="tipoProducto" errores={errores} valor={form.tipoProducto} alCambiar={(v) => ctx.set("tipoProducto", v as ProductoTipo)} opciones={TIPOS} />
        <Selector
          etiqueta="Unidad base *"
          campo="unidadMedidaId"
          errores={errores}
          valor={form.unidadMedidaId}
          alCambiar={(v) => ctx.set("unidadMedidaId", v)}
          opciones={[["", "Seleccione unidad"], ...catalogos.unidades.map((u): [string, string] => [u.id, `${u.codigo} · ${u.nombre}`])]}
        />
        <Selector etiqueta="Categoría" campo="categoriaId" errores={errores} valor={form.categoriaId} alCambiar={(v) => ctx.set("categoriaId", v)} opciones={[["", "Sin categoría"], ...catalogos.categorias.map((c): [string, string] => [c.id, `${c.codigo} · ${c.nombre}`])]} />
        <Selector etiqueta="Marca" campo="marcaId" errores={errores} valor={form.marcaId} alCambiar={(v) => ctx.set("marcaId", v)} opciones={[["", "Sin marca"], ...catalogos.marcas.map((m): [string, string] => [m.id, m.nombre])]} />
      </div>

      <div className={styles.gridFour}>
        <Selector
          etiqueta="Familia"
          campo="familiaId"
          errores={errores}
          valor={form.familiaId}
          alCambiar={(v) => {
            ctx.set("familiaId", v);
            // La línea debe pertenecer a la familia elegida.
            if (!catalogos.lineas.some((l) => l.id === form.lineaId && l.familiaId === v)) ctx.set("lineaId", "");
          }}
          opciones={[["", catalogos.familias.length ? "Sin familia" : "Sin familias registradas"], ...catalogos.familias.map((f): [string, string] => [f.id, f.nombre])]}
        />
        <Selector
          etiqueta="Línea"
          campo="lineaId"
          errores={errores}
          valor={form.lineaId}
          disabled={!form.familiaId}
          alCambiar={(v) => ctx.set("lineaId", v)}
          opciones={[["", form.familiaId ? "Sin línea" : "Seleccione familia primero"], ...lineas.map((l): [string, string] => [l.id, l.nombre])]}
        />
        <Texto etiqueta="Procedencia" campo="procedencia" errores={errores} valor={form.procedencia} alCambiar={(v) => ctx.set("procedencia", v)} maxLength={100} />
        <Selector etiqueta="Impuesto / IVA" campo="impuestoId" errores={errores} valor={form.impuestoId} alCambiar={(v) => ctx.set("impuestoId", v)} opciones={[["", "Sin impuesto"], ...catalogos.impuestos.map((i): [string, string] => [i.id, i.nombre])]} />
      </div>

      <div className={styles.gridFour}>
        <Texto
          etiqueta={`Precio venta referencia${catalogos.monedaReferencia ? ` (${catalogos.monedaReferencia})` : ""}`}
          campo="precioVentaReferencia"
          errores={errores}
          valor={form.precioVentaReferencia}
          alCambiar={(v) => ctx.set("precioVentaReferencia", v)}
          modo="decimal"
          maxLength={19}
          placeholder="Sin precio"
          ayuda="Hasta 4 decimales, con punto. Vacío = sin precio."
        />
        <Texto etiqueta="Valor venta referencia" campo="valorReferencia" errores={errores} valor={valor === null ? "" : new Intl.NumberFormat("es-PY").format(valor)} alCambiar={() => undefined} readOnly placeholder="Precio × stock actual" />
        <Texto etiqueta="País de origen" campo="paisOrigenMirror" errores={errores} valor={pais ? `${pais.codigo} · ${pais.nombre}` : form.paisOrigenCodigo} alCambiar={() => undefined} readOnly ayuda="Se edita en SIFEN y códigos." />
        <Texto etiqueta="Imagen (URL)" campo="imagenUrl" errores={errores} valor={form.imagenUrl} alCambiar={(v) => ctx.set("imagenUrl", v)} maxLength={2000} tipo="url" />
      </div>

      <div className={styles.checkGrid}>
        <Casilla etiqueta="Producto vendible" campo="vendible" valor={form.vendible} alCambiar={(v) => ctx.set("vendible", v)} />
        <Casilla etiqueta="Producto comprable" campo="comprable" valor={form.comprable} alCambiar={(v) => ctx.set("comprable", v)} />
        <Casilla etiqueta="Permite stock de terceros" campo="permiteTerceros" valor={form.permiteTerceros} alCambiar={(v) => ctx.set("permiteTerceros", v)} />
        {ctx.modo === "editar" ? <Casilla etiqueta="Producto activo" campo="activo" valor={form.activo} alCambiar={(v) => ctx.set("activo", v)} /> : null}
      </div>
    </>
  );
}
