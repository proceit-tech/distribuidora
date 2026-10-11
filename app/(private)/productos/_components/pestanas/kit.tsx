"use client";

import { Casilla, Selector, Texto } from "../campos";
import type { ContextoFormulario } from "../contexto";
import styles from "../producto-form.module.css";
import { TarjetaFila, TituloColeccion } from "./repetidores";

export function PestanaKit({ ctx }: { ctx: ContextoFormulario }) {
  const { form, errores, catalogos, detalle } = ctx;
  // Un producto no puede ser alternativo ni componente de sí mismo.
  const productos: Array<[string, string]> = [["", "Seleccione producto"], ...catalogos.productos.filter((p) => p.id !== detalle?.id).map((p): [string, string] => [p.id, `${p.codigo} · ${p.descripcion}`])];
  const esKit = form.tipoProducto === "KIT";

  return (
    <>
      <TituloColeccion titulo="Productos alternativos" boton="Agregar alternativo" alAgregar={() => ctx.agregar("alternativos")} />

      {form.alternativos.length === 0 ? <div className={styles.empty}>Sin productos alternativos.</div> : null}

      <div className={styles.repeaterList}>
        {form.alternativos.map((a, i) => {
          const p = `alternativos.${i}`;
          const cambiar = (parche: Record<string, unknown>) => ctx.actualizar("alternativos", a.id, parche);

          return (
            <TarjetaFila key={a.id} ctx={ctx} coleccion="alternativos" id={a.id} titulo={`Alternativo ${i + 1}`}>
              <div className={styles.gridFour}>
                <Selector etiqueta="Producto *" campo={`${p}.productoAlternativoId`} errores={errores} valor={a.productoAlternativoId} alCambiar={(v) => cambiar({ productoAlternativoId: v, productoAlternativoNombre: catalogos.productos.find((x) => x.id === v)?.descripcion ?? "" })} opciones={productos} />
                <Selector
                  etiqueta="Tipo *"
                  campo={`${p}.tipo`}
                  errores={errores}
                  valor={a.tipo}
                  alCambiar={(v) => cambiar({ tipo: v })}
                  opciones={[
                    ["SUSTITUTO", "Sustituto"],
                    ["COMPLEMENTARIO", "Complementario"],
                    ["UPSELL", "Venta sugerida (upsell)"],
                  ]}
                />
                <Texto etiqueta="Prioridad" campo={`${p}.prioridad`} errores={errores} valor={a.prioridad} alCambiar={(v) => cambiar({ prioridad: v })} modo="numeric" maxLength={9} ayuda="1 = mayor prioridad." />
              </div>
            </TarjetaFila>
          );
        })}
      </div>

      <TituloColeccion titulo="Componentes del kit" boton="Agregar componente" alAgregar={() => ctx.agregar("componentes")} deshabilitado={!esKit} />

      {!esKit ? <div className={styles.empty}>Solo los productos de tipo Kit / combo tienen componentes.</div> : null}
      {esKit && form.componentes.length === 0 ? <div className={styles.empty}>Sin componentes.</div> : null}

      <div className={styles.repeaterList}>
        {form.componentes.map((c, i) => {
          const p = `componentes.${i}`;
          const cambiar = (parche: Record<string, unknown>) => ctx.actualizar("componentes", c.id, parche);

          return (
            <TarjetaFila key={c.id} ctx={ctx} coleccion="componentes" id={c.id} titulo={`Componente ${i + 1}`}>
              <div className={styles.gridFour}>
                <Selector etiqueta="Producto *" campo={`${p}.productoComponenteId`} errores={errores} valor={c.productoComponenteId} alCambiar={(v) => cambiar({ productoComponenteId: v, productoComponenteNombre: catalogos.productos.find((x) => x.id === v)?.descripcion ?? "" })} opciones={productos} />
                <Texto etiqueta="Cantidad *" campo={`${p}.cantidad`} errores={errores} valor={c.cantidad} alCambiar={(v) => cambiar({ cantidad: v })} modo="decimal" maxLength={19} ayuda="Mayor que cero; hasta 4 decimales." />
                <Texto etiqueta="Orden" campo={`${p}.orden`} errores={errores} valor={c.orden} alCambiar={(v) => cambiar({ orden: v })} modo="numeric" maxLength={9} />
                <div className={styles.checkGrid}>
                  <Casilla etiqueta="Opcional" campo={`${p}.esOpcional`} valor={c.esOpcional} alCambiar={(v) => cambiar({ esOpcional: v })} />
                </div>
              </div>
            </TarjetaFila>
          );
        })}
      </div>
    </>
  );
}
