"use client";

import { B, parseDec, textoDec } from "@/lib/facturacion/calculo";
import { CUOTAS_HABILITADAS, MAX_CUOTAS, MAX_PLAZO_DIAS, plazoTexto, repartirCuotas, sumarDias, type EstadoCreditoUI } from "@/lib/facturacion/credito";
import { formatearMontoVisual } from "@/lib/formato/monto-visual";

import estilos from "./page.module.css";

/**
 * Crédito COMPACTO (PRO-128): una sola línea con Plazo (30/60/90 o días libres), entrega inicial opcional y saldo financiado. Cuotas sigue SUSPENDIDO (CUOTAS_HABILITADAS = false en la pantalla y en el
 * servidor): el código de cuotas se conserva pero la opción no se ofrece. `total` es el total de la factura como texto Decimal; el saldo se calcula en Decimal exacto (sin Number). El servidor valida todo
 * de nuevo con el mismo código (`erroresCredito`).
 */
export function CondicionCredito({ moneda, simbolo, estado, total, hoy, pendientes, alCambiar }: { moneda: string; simbolo: string; estado: EstadoCreditoUI; total: string; hoy: string; pendientes: string[]; alCambiar: (c: Partial<EstadoCreditoUI>) => void }) {
  const t = parseDec(total, 8) ?? B(0);
  const e = estado.entrega.trim() === "" ? B(0) : (parseDec(estado.entrega.trim(), 4) ?? B(0));
  const saldoDec = t > e ? t - e : B(0);
  const saldo = textoDec(saldoDec);
  const dias = /^\d{1,5}$/.test(estado.plazoDias) ? Number(estado.plazoDias) : 0;

  function generar() {
    const n = Number(estado.cantidad);
    const cada = Number(estado.cadaDias) || 30;
    const primero = estado.primerVencimiento || sumarDias(hoy, cada);

    alCambiar({ cuotas: repartirCuotas(saldo, n, primero, cada), primerVencimiento: primero });
  }

  return (
    <div className={estilos.creditoFila} role="group" aria-label="Condiciones del crédito">
      <span className={estilos.pagosTitulo}>Crédito {CUOTAS_HABILITADAS ? "" : "a plazo"}</span>

      {CUOTAS_HABILITADAS ? (
        <select aria-label="Tipo de crédito" value={estado.tipo} onChange={(ev) => alCambiar({ tipo: ev.target.value as "1" | "2", cuotas: [] })}>
          <option value="1">A plazo</option>
          <option value="2">En cuotas</option>
        </select>
      ) : null}

      {estado.tipo === "1" ? (
        <>
          <span className={estilos.chips} role="group" aria-label="Plazos frecuentes">
            {[30, 60, 90].map((d) => <button key={d} type="button" className={estilos.chip} aria-pressed={estado.plazoDias === String(d)} onClick={() => alCambiar({ plazoDias: String(d) })}>{d}</button>)}
          </span>
          <label className={estilos.inline}>
            <input className={estilos.corto} inputMode="numeric" aria-label="Plazo en días" maxLength={String(MAX_PLAZO_DIAS).length} value={estado.plazoDias} onChange={(ev) => alCambiar({ plazoDias: ev.target.value.replace(/\D/g, "") })} />
            <span>días</span>
          </label>
        </>
      ) : null}

      <label className={estilos.inline}>
        <span>Entrega inicial ({simbolo})</span>
        <input className={estilos.medio} inputMode="decimal" placeholder="Sin entrega" aria-label="Entrega inicial" value={estado.entrega} onChange={(ev) => alCambiar({ entrega: ev.target.value.replace(",", "."), cuotas: [] })} />
      </label>

      <small className={estilos.hint}>
        Saldo a financiar {simbolo} {formatearMontoVisual(saldo, moneda)}
        {estado.tipo === "1" && dias > 0 && hoy ? ` · «${plazoTexto(dias)}» · vence ${sumarDias(hoy, dias)}` : ""}
      </small>

      {estado.tipo === "2" ? (
        <>
          <label className={estilos.inline}><span>Cuotas</span><input className={estilos.corto} inputMode="numeric" aria-label="Cantidad de cuotas" maxLength={3} value={estado.cantidad} onChange={(ev) => alCambiar({ cantidad: ev.target.value.replace(/\D/g, ""), cuotas: [] })} /></label>
          <label className={estilos.inline}><span>Primer vencimiento</span><input type="date" aria-label="Primer vencimiento" min={hoy} value={estado.primerVencimiento} onChange={(ev) => alCambiar({ primerVencimiento: ev.target.value, cuotas: [] })} /></label>
          <label className={estilos.inline}><span>Días entre cuotas</span><input className={estilos.corto} inputMode="numeric" aria-label="Días entre cuotas" maxLength={4} value={estado.cadaDias} onChange={(ev) => alCambiar({ cadaDias: ev.target.value.replace(/\D/g, ""), cuotas: [] })} /></label>
          <button type="button" className={estilos.linkButton} disabled={saldoDec <= B(0) || !(Number(estado.cantidad) >= 1 && Number(estado.cantidad) <= MAX_CUOTAS)} onClick={generar}>
            {estado.cuotas.length > 0 ? "Regenerar cuotas iguales" : "Generar cuotas iguales"}
          </button>
          {estado.cuotas.map((q, i) => (
            <span key={i} className={estilos.inline}>
              <span>Cuota {i + 1}</span>
              <input className={estilos.medio} aria-label={`Monto de la cuota ${i + 1}`} inputMode="decimal" value={q.monto} onChange={(ev) => alCambiar({ cuotas: estado.cuotas.map((x, j) => (j === i ? { ...x, monto: ev.target.value.replace(",", ".") } : x)) })} />
              <input type="date" aria-label={`Vencimiento de la cuota ${i + 1}`} min={hoy} value={q.vencimiento} onChange={(ev) => alCambiar({ cuotas: estado.cuotas.map((x, j) => (j === i ? { ...x, vencimiento: ev.target.value } : x)) })} />
            </span>
          ))}
        </>
      ) : null}

      {pendientes.length > 0 ? <p className={estilos.pendienteLinea} role="status">{pendientes.slice(0, 3).join(" · ")}{pendientes.length > 3 ? ` · y ${pendientes.length - 3} más` : ""}</p> : null}
    </div>
  );
}
