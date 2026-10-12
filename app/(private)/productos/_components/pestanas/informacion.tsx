"use client";

import { etiquetaUnidad } from "@/lib/fiscal/unidades-sifen";
import { productoRedondeado } from "@/lib/productos/decimales";
import { textoAfectacion } from "@/lib/productos/fiscal";
import type { ProductoTipo } from "@/types/productos";

import { Casilla, Dato, Selector, SubTitulo, Texto } from "../campos";
import type { ContextoFormulario } from "../contexto";
import styles from "../producto-form.module.css";
import { FotoProducto } from "./foto";

const TIPOS: Array<[ProductoTipo, string]> = [
  ["MERCADERIA", "Mercadería"],
  ["SERVICIO", "Servicio"],
  ["KIT", "Kit / combo"],
  ["ACTIVO_FIJO", "Activo fijo"],
];

export function PestanaInformacion({ ctx }: { ctx: ContextoFormulario }) {
  const { form, errores, catalogos, detalle } = ctx;
  // Selectores en cascada Categoría → Familia → Línea. Con categoría elegida se ofrecen sus familias y las históricas aún sin clasificar
  // (que no bloquean); la familia ya guardada siempre sigue visible para no perder el dato al editar.
  const familiasVisibles = catalogos.familias.filter((f) => !form.categoriaId || f.categoriaId === form.categoriaId || f.categoriaId === null || f.id === form.familiaId);
  const lineas = catalogos.lineas.filter((l) => l.familiaId === form.familiaId);

  function cambiarCategoria(categoriaId: string) {
    const familia = catalogos.familias.find((f) => f.id === form.familiaId);
    const incompatible = categoriaId !== "" && familia !== undefined && familia.categoriaId !== null && familia.categoriaId !== categoriaId;

    if (incompatible && !window.confirm("La familia y la línea elegidas no pertenecen a la nueva categoría y se limpiarán. ¿Continuar?")) return;

    ctx.set("categoriaId", categoriaId);

    if (incompatible) {
      ctx.set("familiaId", "");
      ctx.set("lineaId", "");
    }
  }
  const impuesto = catalogos.impuestos.find((i) => i.id === form.impuestoId);
  const pais = catalogos.paises.find((p) => p.codigo === form.paisOrigenCodigo);
  const valor = detalle && form.precioVentaReferencia ? productoRedondeado(form.precioVentaReferencia, detalle.stockActual) : null;

  return (
    <>
      <div className={styles.sectionTitle}>
        <h3>Información comercial</h3>
      </div>

      <SubTitulo>Identificación</SubTitulo>
      <div className={styles.gridFour}>
        {ctx.modo === "editar" ? <Dato etiqueta="Código interno" valor={form.codigo} ayuda="Automático; no se modifica." /> : null}
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
          opciones={[["", "Seleccione unidad"], ...catalogos.unidades.map((u): [string, string] => [u.id, etiquetaUnidad(u)])]}
        />
      </div>

      <SubTitulo>Clasificación</SubTitulo>
      <div className={styles.gridFour}>
        <Selector etiqueta="Categoría" campo="categoriaId" errores={errores} valor={form.categoriaId} alCambiar={cambiarCategoria} opciones={[["", "Sin categoría"], ...catalogos.categorias.map((c): [string, string] => [c.id, `${c.codigo} · ${c.nombre}`])]} />
        <Selector etiqueta="Marca" campo="marcaId" errores={errores} valor={form.marcaId} alCambiar={(v) => ctx.set("marcaId", v)} opciones={[["", "Sin marca"], ...catalogos.marcas.map((m): [string, string] => [m.id, m.nombre])]} />
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
          opciones={[["", catalogos.familias.length ? "Sin familia" : "Sin familias registradas"], ...familiasVisibles.map((f): [string, string] => [f.id, f.categoriaId === null ? `${f.nombre} (sin categoría asignada)` : f.nombre])]}
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
      </div>
      <div className={styles.gridFour}>
        <Texto etiqueta="Procedencia" campo="procedencia" errores={errores} valor={form.procedencia} alCambiar={(v) => ctx.set("procedencia", v)} maxLength={100} />
      </div>

      <SubTitulo>Precio de referencia y datos fiscales</SubTitulo>
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
        <Dato etiqueta="Valor venta referencia" valor={valor === null ? "" : new Intl.NumberFormat("es-PY").format(valor)} ayuda="Precio de referencia × stock actual; no es un valor contable del inventario." />
        <Dato etiqueta="Impuesto / IVA" valor={impuesto ? `${impuesto.nombre}${form.afectacionIva ? ` · ${textoAfectacion(Number(form.afectacionIva))}` : " · sin clasificar"}` : "Sin impuesto"} ayuda="Se edita en SIFEN y códigos." />
        <Dato etiqueta="País de origen" valor={pais ? `${pais.codigo} · ${pais.nombre}` : form.paisOrigenCodigo} ayuda="Se edita en SIFEN y códigos." />
      </div>

      <SubTitulo>Foto del producto</SubTitulo>
      <FotoProducto ctx={ctx} />
      {form.imagenUrl ? (
        <div className={styles.gridTwo}>
          <Texto etiqueta="Enlace de imagen anterior" campo="imagenUrl" errores={errores} valor={form.imagenUrl} alCambiar={(v) => ctx.set("imagenUrl", v)} maxLength={2000} tipo="url" ayuda="Se conserva el enlace cargado antes; la foto nueva se carga como archivo." />
        </div>
      ) : null}

      <SubTitulo>Disponibilidad</SubTitulo>
      <div className={styles.checkGrid}>
        <Casilla etiqueta="Producto vendible" campo="vendible" valor={form.vendible} alCambiar={(v) => ctx.set("vendible", v)} />
        <Casilla etiqueta="Producto comprable" campo="comprable" valor={form.comprable} alCambiar={(v) => ctx.set("comprable", v)} />
        <Casilla etiqueta="Permite stock de terceros" campo="permiteTerceros" valor={form.permiteTerceros} alCambiar={(v) => ctx.set("permiteTerceros", v)} />
        {ctx.modo === "editar" ? <Casilla etiqueta="Producto activo" campo="activo" valor={form.activo} alCambiar={(v) => ctx.set("activo", v)} /> : null}
      </div>
    </>
  );
}
