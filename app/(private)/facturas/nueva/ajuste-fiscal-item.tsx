"use client";

import { useEffect, useRef, useState } from "react";

import { problemasFiscales, valoresEfectivos, type AjusteUI, type GtinModo, type ProductoBase } from "@/lib/facturacion/ajuste-item";
import { cambiosPorOpcionIva, esParcial, OPCIONES_IVA, opcionIvaDe, RESTAURAR_IVA } from "@/lib/facturacion/iva-opciones";
import { etiquetaUnidad, filtrarUnidades } from "@/lib/facturacion/unidades";

import estilos from "./page.module.css";

export type UnidadSifen = { codigo: number; representacion: string; descripcion: string };

/**
 * Panel CONTEXTUAL de los datos fiscales de UN ítem (PRO-128): se abre solo para el producto elegido en la tabla y conserva su estado al cerrarse. Corrige este documento (IVA, unidad de medida,
 * descripción fiscal, GTIN); el servidor valida de nuevo todo y exige FACTURACION_ELECTRONICA.AJUSTE_FISCAL. «Guardar también en Productos» persiste SOLO la clasificación de IVA (PRODUCTOS.EDITAR + bitácora);
 * la unidad, la descripción, el GTIN y el precio nunca se guardan en el producto ni cambian su unidad física/de stock.
 */
export function EditorFiscalItem({ producto, precio, moneda, ajuste, unidades, puedeEditarProductos, alCambiar, alCerrar }: {
  producto: ProductoBase & { unidadSimbolo: string | null; codigo: string }; precio: string; moneda: string; ajuste: AjusteUI; unidades: UnidadSifen[]; puedeEditarProductos: boolean;
  alCambiar: (c: Partial<AjusteUI>) => void; alCerrar: () => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const raiz = useRef<HTMLElement>(null);
  const e = valoresEfectivos(producto, ajuste);
  const pendientes = problemasFiscales(producto, ajuste, precio, moneda).filter((m) => !m.startsWith("sin precio"));
  const ivaCambiado = ajuste.afectacion !== "";
  const opcion = opcionIvaDe(e.afectacion, e.tasa);
  const filtradas = filtrarUnidades(unidades, busqueda);
  // La unidad ya elegida siempre debe seguir presente en la lista aunque el filtro no la incluya (el select no puede quedar sin su valor).
  const elegida = ajuste.unidadSifen !== "" ? unidades.find((u) => String(u.codigo) === ajuste.unidadSifen) : undefined;
  const lista = elegida && !filtradas.includes(elegida) ? [elegida, ...filtradas] : filtradas;
  const base = producto.codigo;

  // Al abrirse (AUD-PRO128-R01-02) el panel se hace visible aunque la fila esté arriba en una factura larga y el foco pasa a su primer control; Escape lo cierra. La búsqueda de unidades es estado
  // LOCAL del panel (el padre lo remonta por producto con key), así que no se arrastra de un producto a otro.
  useEffect(() => {
    const el = raiz.current;

    el?.scrollIntoView({ block: "nearest" });
    el?.querySelector<HTMLElement>("select, input")?.focus({ preventScroll: true });
  }, []);

  return (
    <section ref={raiz} className={estilos.panelFiscal} aria-label={`Datos fiscales de ${base}`} onKeyDown={(ev) => { if (ev.key === "Escape") { ev.stopPropagation(); alCerrar(); } }}>
      <div className={estilos.panelFiscalCabecera}>
        <strong>Datos fiscales · {base}</strong>
        <button type="button" className={estilos.linkButton} onClick={alCerrar}>Cerrar</button>
      </div>

      <div className={estilos.gridFiscal}>
        <label className={estilos.field}>
          <span>IVA</span>
          <select aria-label={`IVA de ${base}`} value={opcion} onChange={(ev) => alCambiar(cambiosPorOpcionIva(ev.target.value, producto, ajuste))}>
            {opcion === "" ? <option value="">Seleccione…</option> : null}
            {OPCIONES_IVA.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
          </select>
          {ivaCambiado ? <button type="button" className={estilos.linkButton} onClick={() => alCambiar(RESTAURAR_IVA)}>Usar IVA del producto</button> : null}
        </label>

        {esParcial(opcion) ? (
          <label className={estilos.field}>
            <span>Proporción gravada (%)</span>
            <input
              aria-label={`Proporción gravada de ${base}`}
              inputMode="decimal"
              placeholder="Mayor que 0 y menor que 100"
              value={ivaCambiado ? ajuste.proporcion : (producto.proporcion ?? "")}
              onChange={(ev) => alCambiar({ afectacion: String(e.afectacion ?? 4), tasa: String(e.tasa ?? ""), proporcion: ev.target.value.replace(",", ".") })}
            />
          </label>
        ) : null}

        <div className={`${estilos.field} ${estilos.campoUnidad}`}>
          <label htmlFor={`unidad-buscar-${base}`}>Unidad de medida</label>
          <input id={`unidad-buscar-${base}`} type="search" placeholder="Buscar por nombre, símbolo o código" aria-label={`Buscar unidad de medida de ${base}`} value={busqueda} onChange={(ev) => setBusqueda(ev.target.value)} />
          <select aria-label={`Unidad de medida de ${base}`} value={ajuste.unidadSifen} onChange={(ev) => alCambiar({ unidadSifen: ev.target.value })}>
            <option value="">{producto.unidadSifen !== null ? `Del producto (${producto.unidadSimbolo ?? producto.unidadSifen})` : "Seleccione…"}</option>
            {lista.map((u) => <option key={u.codigo} value={String(u.codigo)}>{etiquetaUnidad(u)}</option>)}
          </select>
          <small className={estilos.hint}>{filtradas.length} de {unidades.length} unidades vigentes{busqueda.trim() !== "" && filtradas.length === 0 ? " · sin coincidencias" : ""}.</small>
        </div>

        <label className={estilos.field}>
          <span>Descripción fiscal (máx. 120)</span>
          <input aria-label={`Descripción fiscal de ${base}`} maxLength={120} placeholder={producto.descripcion} value={ajuste.descripcion} onChange={(ev) => alCambiar({ descripcion: ev.target.value })} />
        </label>

        <label className={estilos.field}>
          <span>GTIN</span>
          <select aria-label={`Modo de GTIN de ${base}`} value={ajuste.gtinModo} onChange={(ev) => alCambiar({ gtinModo: ev.target.value as GtinModo, ...(ev.target.value === "informar" ? {} : { gtin: "" }) })}>
            <option value="cadastro">{producto.gtin ? `Usar el del producto (${producto.gtin})` : "Usar el del producto (sin GTIN)"}</option>
            <option value="informar">Informar otro GTIN (solo esta factura)</option>
            <option value="sin">Sin GTIN (solo esta factura)</option>
          </select>
        </label>

        {ajuste.gtinModo === "informar" ? (
          <label className={estilos.field}>
            <span>GTIN (8, 12, 13 o 14 dígitos)</span>
            <input aria-label={`GTIN de ${base}`} inputMode="numeric" value={ajuste.gtin} onChange={(ev) => alCambiar({ gtin: ev.target.value.replace(/\D/g, "") })} />
          </label>
        ) : null}
      </div>

      {ivaCambiado ? (
        <fieldset className={estilos.radiosCompactos}>
          <legend>Clasificación de IVA</legend>
          <label>
            <input type="radio" name={`guardar-${base}`} checked={!ajuste.guardar} onChange={() => alCambiar({ guardar: false })} /> Solo esta factura (recomendado)
          </label>
          <label>
            <input type="radio" name={`guardar-${base}`} checked={ajuste.guardar} disabled={!puedeEditarProductos} onChange={() => alCambiar({ guardar: true })} /> Guardar también en Productos (solo la clasificación de IVA)
          </label>
          {!puedeEditarProductos ? <small className={estilos.hint}>Sin permiso para editar Productos: el cambio queda solo en esta factura.</small> : null}
          {ajuste.guardar ? <small className={estilos.hint} role="status">Al enviar se actualizará la clasificación de IVA del producto {base} y quedará en una bitácora.</small> : null}
        </fieldset>
      ) : null}

      {pendientes.length > 0 ? <p className={estilos.pendienteLinea} role="status">Falta: {pendientes.join(", ")}.</p> : null}

      <small className={estilos.hint}>Unidad, descripción y GTIN valen solo para esta factura: no cambian el producto ni su unidad de stock. El precio se modifica con su propio permiso.</small>
    </section>
  );
}
