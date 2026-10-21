"use client";

import { formatearMontoVisual } from "@/lib/formato/monto-visual";
import { textoConciliacionPagos } from "@/lib/facturacion/presentacion";
import { DENOMINACIONES_TARJETA, FORMAS_PROCESAMIENTO, MAX_PAGOS, PRESENCIA_BANCARIA, TIPO_CHEQUE, TIPO_OTRO, TIPO_TARJETA_CREDITO, TIPO_TARJETA_DEBITO, type PagoUI } from "@/lib/facturacion/pagos";

import estilos from "./page.module.css";

/**
 * Medios de pago COMPACTOS (PRO-128): un solo medio es UNA línea («Efectivo · cubre el total»); con varios, una línea pequeña por medio (medio · monto · quitar). Solo cheque, tarjeta y «Otro» abren una
 * sublínea con los datos que el Manual SIFEN exige para esa modalidad. Nunca se pide el número de la tarjeta ni el código de seguridad. Con un solo medio el monto es el total (o la entrega inicial en
 * Crédito) y no se escribe. La conciliación es DECIMAL exacta (módulo compartido con el servidor) y los importes se muestran como texto, sin pasar por Number. El servidor vuelve a validar todo.
 */
export function MediosPago({ moneda, simbolo, titulo, objetivo, conciliacion, presencia, formas, pagos, pendientes, alCambiar, alAgregar, alQuitar }: {
  /** Código de la moneda (PYG sin decimales en lo que se muestra). */
  moneda: string; simbolo: string; titulo: string; objetivo: string; conciliacion: { suma: string | null; coincide: boolean }; presencia: string; formas: Record<string, string>; pagos: PagoUI[]; pendientes: string[];
  alCambiar: (i: number, c: Partial<PagoUI>) => void; alAgregar: () => void; alQuitar: (i: number) => void;
}) {
  const varios = pagos.length > 1;

  return (
    <div className={estilos.pagos} role="group" aria-label={titulo}>
      <span className={estilos.pagosTitulo}>{titulo}</span>

      {pagos.map((p, i) => {
        const tipo = Number(p.tipo);

        return (
          <div key={i} className={estilos.pagoFila} role="group" aria-label={`Medio de pago ${i + 1}`}>
            <select aria-label={`Forma de pago ${i + 1}`} value={p.tipo} onChange={(e) => alCambiar(i, { tipo: e.target.value, descripcion: "", chequeNumero: "", chequeBanco: "", tarjetaDenominacion: "", tarjetaDescripcion: "", tarjetaForma: "" })}>
              {Object.entries(formas).filter(([k]) => k !== "16" || presencia === String(PRESENCIA_BANCARIA) || p.tipo === "16").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>

            {varios ? (
              <input className={estilos.pagoMontoInput} aria-label={`Monto del pago ${i + 1}`} placeholder={`Monto (${simbolo})`} inputMode="decimal" value={p.monto} onChange={(e) => alCambiar(i, { monto: e.target.value.replace(",", ".") })} />
            ) : (
              <span className={estilos.pagoMonto}>cubre {simbolo} {formatearMontoVisual(objetivo, moneda)}</span>
            )}

            {tipo === TIPO_CHEQUE ? (
              <>
                <input className={estilos.pagoDato} aria-label={`Número de cheque ${i + 1}`} placeholder="N° de cheque" inputMode="numeric" maxLength={8} value={p.chequeNumero} onChange={(e) => alCambiar(i, { chequeNumero: e.target.value.replace(/\D/g, "") })} />
                <input className={estilos.pagoDato} aria-label={`Banco emisor ${i + 1}`} placeholder="Banco emisor" maxLength={20} value={p.chequeBanco} onChange={(e) => alCambiar(i, { chequeBanco: e.target.value })} />
              </>
            ) : null}

            {tipo === TIPO_TARJETA_CREDITO || tipo === TIPO_TARJETA_DEBITO ? (
              <>
                <select className={estilos.pagoDato} aria-label={`Marca de tarjeta ${i + 1}`} value={p.tarjetaDenominacion} onChange={(e) => alCambiar(i, { tarjetaDenominacion: e.target.value, tarjetaDescripcion: "" })}>
                  <option value="">Marca de la tarjeta…</option>
                  {Object.entries(DENOMINACIONES_TARJETA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                {p.tarjetaDenominacion === "99" ? (
                  <input className={estilos.pagoDato} aria-label={`Descripción de marca ${i + 1}`} placeholder="Describa la marca" maxLength={20} value={p.tarjetaDescripcion} onChange={(e) => alCambiar(i, { tarjetaDescripcion: e.target.value })} />
                ) : null}
                <select className={estilos.pagoDato} aria-label={`Procesamiento de tarjeta ${i + 1}`} value={p.tarjetaForma} onChange={(e) => alCambiar(i, { tarjetaForma: e.target.value })}>
                  <option value="">Forma de procesamiento…</option>
                  {Object.entries(FORMAS_PROCESAMIENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </>
            ) : null}

            {tipo === TIPO_OTRO ? (
              <input className={estilos.pagoDato} aria-label={`Descripción del medio ${i + 1}`} placeholder="Descripción del medio de pago" maxLength={30} value={p.descripcion} onChange={(e) => alCambiar(i, { descripcion: e.target.value })} />
            ) : null}

            {varios ? <button type="button" className={estilos.remove} onClick={() => alQuitar(i)} aria-label={`Quitar el medio de pago ${i + 1}`}>Quitar</button> : null}
          </div>
        );
      })}

      <div className={estilos.pagoPie}>
        <button type="button" className={estilos.linkButton} disabled={pagos.length >= MAX_PAGOS} onClick={alAgregar}>+ Agregar otro medio de pago</button>
        {varios ? (
          <small className={conciliacion.coincide ? estilos.hint : estilos.pendienteLinea}>
            {textoConciliacionPagos({ simbolo, moneda, objetivo, suma: conciliacion.suma, coincide: conciliacion.coincide })}
          </small>
        ) : null}
        {pagos.some((p) => p.tipo === String(TIPO_TARJETA_CREDITO) || p.tipo === String(TIPO_TARJETA_DEBITO)) ? <small className={estilos.hint}>No se solicita el número de la tarjeta ni el código de seguridad.</small> : null}
      </div>

      {pendientes.length > 0 ? <p className={estilos.pendienteLinea} role="status">{pendientes.slice(0, 3).join(" · ")}{pendientes.length > 3 ? ` · y ${pendientes.length - 3} más` : ""}</p> : null}
    </div>
  );
}
