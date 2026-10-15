"use client";

import { DENOMINACIONES_TARJETA, FORMAS_PROCESAMIENTO, MAX_PAGOS, PRESENCIA_BANCARIA, TIPO_CHEQUE, TIPO_OTRO, TIPO_TARJETA_CREDITO, TIPO_TARJETA_DEBITO, type PagoUI } from "@/lib/facturacion/pagos";

import estilos from "./page.module.css";

const gs = (n: number) => n.toLocaleString("es-PY", { maximumFractionDigits: 4 });

/**
 * Medios de pago (MFE-03 P1): uno o varios, cada uno con su monto y SOLO los datos que el Manual SIFEN exige para esa modalidad (cheque: número y banco; tarjeta: marca y forma
 * de procesamiento; «Otro»: descripción). Nunca se pide el número de la tarjeta ni el código de seguridad. Con un solo medio, el monto es el total (o la entrega inicial en
 * Crédito) y no se escribe. El servidor vuelve a validar todo con el mismo código.
 */
export function MediosPago({ titulo, objetivo, presencia, formas, pagos, pendientes, alCambiar, alAgregar, alQuitar }: {
  titulo: string; objetivo: number; presencia: string; formas: Record<string, string>; pagos: PagoUI[]; pendientes: string[];
  alCambiar: (i: number, c: Partial<PagoUI>) => void; alAgregar: () => void; alQuitar: (i: number) => void;
}) {
  const varios = pagos.length > 1;
  const suma = pagos.reduce((a, p) => a + (Number(p.monto) || 0), 0);

  return (
    <fieldset className={estilos.credito} aria-label={titulo}>
      <legend>{titulo}</legend>

      {pagos.map((p, i) => {
        const tipo = Number(p.tipo);

        return (
          <div key={i} className={estilos.grid} role="group" aria-label={`Medio de pago ${i + 1}`}>
            <label className={estilos.field}>
              <span>Medio de pago{varios ? ` ${i + 1}` : ""}</span>
              <select aria-label={`Forma de pago ${i + 1}`} value={p.tipo} onChange={(e) => alCambiar(i, { tipo: e.target.value, descripcion: "", chequeNumero: "", chequeBanco: "", tarjetaDenominacion: "", tarjetaDescripcion: "", tarjetaForma: "" })}>
                {Object.entries(formas).filter(([k]) => k !== "16" || presencia === String(PRESENCIA_BANCARIA) || p.tipo === "16").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>

            {varios ? (
              <label className={estilos.field}>
                <span>Monto (Gs.)</span>
                <input aria-label={`Monto del pago ${i + 1}`} inputMode="decimal" value={p.monto} onChange={(e) => alCambiar(i, { monto: e.target.value.replace(",", ".") })} />
              </label>
            ) : null}

            {tipo === TIPO_CHEQUE ? (
              <>
                <label className={estilos.field}>
                  <span>N° de cheque</span>
                  <input aria-label={`Número de cheque ${i + 1}`} inputMode="numeric" maxLength={8} value={p.chequeNumero} onChange={(e) => alCambiar(i, { chequeNumero: e.target.value.replace(/\D/g, "") })} />
                </label>
                <label className={estilos.field}>
                  <span>Banco emisor</span>
                  <input aria-label={`Banco emisor ${i + 1}`} maxLength={20} value={p.chequeBanco} onChange={(e) => alCambiar(i, { chequeBanco: e.target.value })} />
                </label>
              </>
            ) : null}

            {tipo === TIPO_TARJETA_CREDITO || tipo === TIPO_TARJETA_DEBITO ? (
              <>
                <label className={estilos.field}>
                  <span>Marca de la tarjeta</span>
                  <select aria-label={`Marca de tarjeta ${i + 1}`} value={p.tarjetaDenominacion} onChange={(e) => alCambiar(i, { tarjetaDenominacion: e.target.value, tarjetaDescripcion: "" })}>
                    <option value="">Seleccione…</option>
                    {Object.entries(DENOMINACIONES_TARJETA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                {p.tarjetaDenominacion === "99" ? (
                  <label className={estilos.field}>
                    <span>Descripción de la marca</span>
                    <input aria-label={`Descripción de marca ${i + 1}`} maxLength={20} value={p.tarjetaDescripcion} onChange={(e) => alCambiar(i, { tarjetaDescripcion: e.target.value })} />
                  </label>
                ) : null}
                <label className={estilos.field}>
                  <span>Forma de procesamiento</span>
                  <select aria-label={`Procesamiento de tarjeta ${i + 1}`} value={p.tarjetaForma} onChange={(e) => alCambiar(i, { tarjetaForma: e.target.value })}>
                    <option value="">Seleccione…</option>
                    {Object.entries(FORMAS_PROCESAMIENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
              </>
            ) : null}

            {tipo === TIPO_OTRO ? (
              <label className={estilos.field}>
                <span>Descripción del medio de pago</span>
                <input aria-label={`Descripción del medio ${i + 1}`} maxLength={30} value={p.descripcion} onChange={(e) => alCambiar(i, { descripcion: e.target.value })} />
              </label>
            ) : null}

            {varios ? <button type="button" className={estilos.botonCuotas} onClick={() => alQuitar(i)} aria-label={`Quitar el medio de pago ${i + 1}`}>Quitar</button> : null}
          </div>
        );
      })}

      <div className={estilos.actions}>
        <button type="button" className={estilos.botonCuotas} disabled={pagos.length >= MAX_PAGOS} onClick={alAgregar}>Agregar otro medio de pago</button>
      </div>

      {tipoTarjeta(pagos) ? <small className={estilos.hint}>No se solicita el número de la tarjeta ni el código de seguridad.</small> : null}
      <small className={estilos.hint}>
        {varios ? `Suma de los pagos: Gs. ${gs(suma)} · A cubrir: Gs. ${gs(objetivo)}${Math.abs(suma - objetivo) > 0.00005 ? " · NO coinciden" : " · coinciden"}.` : `Cubre todo el monto: Gs. ${gs(objetivo)}.`}
      </small>

      {pendientes.length > 0 ? <p className={estilos.fieldError} role="alert">Pagos: {pendientes.slice(0, 4).join("; ")}{pendientes.length > 4 ? `; y ${pendientes.length - 4} más` : ""}.</p> : null}
    </fieldset>
  );
}

const tipoTarjeta = (pagos: PagoUI[]) => pagos.some((p) => p.tipo === String(TIPO_TARJETA_CREDITO) || p.tipo === String(TIPO_TARJETA_DEBITO));
