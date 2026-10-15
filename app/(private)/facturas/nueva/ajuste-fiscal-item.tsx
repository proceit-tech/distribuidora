"use client";

import { hayIvaAjustado, problemasFiscales, valoresEfectivos, type AjusteUI, type ProductoBase } from "@/lib/facturacion/ajuste-item";

import estilos from "./page.module.css";

export type UnidadSifen = { codigo: number; representacion: string; descripcion: string };

const ETIQUETA_IVA: Record<string, string> = { "1": "Gravado", "2": "Exonerado", "3": "Exento", "4": "Gravado parcial" };

/**
 * Datos fiscales de UN ítem dentro de la propia factura (PRO-93 Fase A, FE-UX-07/08/09). Solo corrige este documento: el servidor valida de nuevo todo y exige el permiso
 * FACTURACION_ELECTRONICA.AJUSTE_FISCAL. «Guardar también en Productos» es una elección explícita por línea (solo la clasificación de IVA) y requiere PRODUCTOS.EDITAR.
 */
export function EditorFiscalItem({ producto, precio, ajuste, unidades, puedeEditarProductos, alCambiar }: {
  producto: ProductoBase & { unidadSimbolo: string | null; codigo: string }; precio: string; ajuste: AjusteUI; unidades: UnidadSifen[]; puedeEditarProductos: boolean; alCambiar: (c: Partial<AjusteUI>) => void;
}) {
  const e = valoresEfectivos(producto, ajuste);
  const pendientes = problemasFiscales(producto, ajuste, precio).filter((m) => !m.startsWith("sin precio"));
  const iva = hayIvaAjustado(ajuste);
  const cambiado = iva || ajuste.unidadSifen !== "" || ajuste.descripcion !== "" || ajuste.gtin !== "";
  const base = `${producto.codigo}`;

  return (
    <details className={estilos.fiscal} open={pendientes.length > 0 || undefined}>
      <summary>
        Datos fiscales del ítem
        {pendientes.length > 0 ? <span className={`${estilos.badge} ${estilos.badgeWarn}`}>Pendiente de completar</span> : cambiado ? <span className={`${estilos.badge} ${estilos.badgeOk}`}>Ajustado en esta factura</span> : null}
      </summary>

      {pendientes.length > 0 ? <p className={estilos.fieldError} role="alert">Falta: {pendientes.join(", ")}.</p> : null}

      <div className={estilos.grid}>
        <label className={estilos.field}>
          <span>Unidad SIFEN</span>
          <select aria-label={`Unidad SIFEN de ${base}`} value={ajuste.unidadSifen} onChange={(ev) => alCambiar({ unidadSifen: ev.target.value })}>
            <option value="">{producto.unidadSifen !== null ? `Del producto (${producto.unidadSimbolo ?? producto.unidadSifen})` : "Seleccione…"}</option>
            {unidades.map((u) => <option key={u.codigo} value={String(u.codigo)}>{u.representacion} · {u.descripcion}</option>)}
          </select>
        </label>

        <label className={estilos.field}>
          <span>Afectación de IVA</span>
          <select
            aria-label={`Afectación de IVA de ${base}`}
            value={ajuste.afectacion}
            onChange={(ev) => {
              const v = ev.target.value;

              alCambiar({ afectacion: v, tasa: v === "2" || v === "3" ? "0" : v === "" ? "" : ajuste.tasa === "0" ? "" : ajuste.tasa, proporcion: v === "4" ? ajuste.proporcion : "", guardar: v === "" ? false : ajuste.guardar });
            }}
          >
            <option value="">{producto.afectacion !== null ? `Del producto (${ETIQUETA_IVA[String(producto.afectacion)]}${producto.tasa ? ` ${producto.tasa} %` : ""})` : "Seleccione…"}</option>
            {Object.entries(ETIQUETA_IVA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>

        {iva ? (
          <label className={estilos.field}>
            <span>Tasa de IVA</span>
            <select aria-label={`Tasa de IVA de ${base}`} value={ajuste.tasa} disabled={ajuste.afectacion === "2" || ajuste.afectacion === "3"} onChange={(ev) => alCambiar({ tasa: ev.target.value })}>
              {ajuste.afectacion === "2" || ajuste.afectacion === "3" ? <option value="0">0 %</option> : (
                <>
                  <option value="">Seleccione…</option>
                  <option value="5">5 %</option>
                  <option value="10">10 %</option>
                </>
              )}
            </select>
          </label>
        ) : null}

        {ajuste.afectacion === "4" ? (
          <label className={estilos.field}>
            <span>Proporción gravada (%)</span>
            <input aria-label={`Proporción gravada de ${base}`} inputMode="decimal" placeholder="Mayor que 0 y menor que 100" value={ajuste.proporcion} onChange={(ev) => alCambiar({ proporcion: ev.target.value.replace(",", ".") })} />
          </label>
        ) : null}

        <label className={estilos.field}>
          <span>Descripción fiscal (máx. 120)</span>
          <input aria-label={`Descripción fiscal de ${base}`} maxLength={120} placeholder={producto.descripcion} value={ajuste.descripcion} onChange={(ev) => alCambiar({ descripcion: ev.target.value })} />
        </label>

        <label className={estilos.field}>
          <span>GTIN (8, 12, 13 o 14 dígitos)</span>
          <input aria-label={`GTIN de ${base}`} inputMode="numeric" placeholder={producto.gtin ?? "Sin GTIN"} value={ajuste.gtin} onChange={(ev) => alCambiar({ gtin: ev.target.value.replace(/\D/g, "") })} />
        </label>
      </div>

      {iva ? (
        <fieldset className={estilos.radios}>
          <legend>Clasificación de IVA</legend>
          <label>
            <input type="radio" name={`guardar-${base}`} checked={!ajuste.guardar} onChange={() => alCambiar({ guardar: false })} /> Solo esta factura (recomendado)
          </label>
          <label>
            <input type="radio" name={`guardar-${base}`} checked={ajuste.guardar} disabled={!puedeEditarProductos} onChange={() => alCambiar({ guardar: true })} /> Guardar también en Productos
          </label>
          {!puedeEditarProductos ? <small className={estilos.hint}>No tiene permiso para editar Productos: el cambio queda solo en esta factura.</small> : null}
          {ajuste.guardar ? <small className={estilos.hint} role="status">Al enviar la factura se actualizará la clasificación de IVA del producto {producto.codigo} y quedará registrada en una bitácora.</small> : null}
        </fieldset>
      ) : null}

      <small className={estilos.hint}>
        Unidad, descripción y GTIN valen solo para esta factura (no se guardan en Productos). El precio se modifica con su propio permiso. Se factura con: {e.unidadSifen ?? "sin unidad"} · {e.afectacion ? ETIQUETA_IVA[String(e.afectacion)] : "IVA sin clasificar"}{e.tasa !== null ? ` ${e.tasa} %` : ""}.
      </small>
    </details>
  );
}
