"use client";

import { CUOTAS_HABILITADAS, MAX_CUOTAS, MAX_PLAZO_DIAS, plazoTexto, repartirCuotas, sumarDias, type EstadoCreditoUI } from "@/lib/facturacion/credito";

import estilos from "./page.module.css";

const gs = (n: number) => n.toLocaleString("es-PY", { maximumFractionDigits: 4 });

/**
 * Condiciones del crédito (MFE-B1): Plazo (días) o Cuotas (cantidad, monto y vencimiento de cada una) y entrega inicial opcional. Se muestra solo con la condición Crédito; el
 * servidor vuelve a validar todo con el mismo código (`erroresCredito`). `saldo` = total menos la entrega; las cuotas deben sumarlo exactamente.
 */
export function CondicionCredito({ estado, total, hoy, pendientes, alCambiar }: { estado: EstadoCreditoUI; total: number; hoy: string; pendientes: string[]; alCambiar: (c: Partial<EstadoCreditoUI>) => void }) {
  const entrega = Number(estado.entrega.trim() === "" ? "0" : estado.entrega) || 0;
  const saldo = Math.max(0, total - entrega);
  const suma = estado.cuotas.reduce((a, q) => a + (Number(q.monto) || 0), 0);

  function generar() {
    const n = Number(estado.cantidad);
    const cada = Number(estado.cadaDias) || 30;
    const primero = estado.primerVencimiento || sumarDias(hoy, cada);

    alCambiar({ cuotas: repartirCuotas(String(saldo), n, primero, cada), primerVencimiento: primero });
  }

  return (
    <fieldset className={estilos.credito} aria-label="Condiciones del crédito">
      <legend>Crédito</legend>

      <div className={estilos.grid}>
        <label className={estilos.field}>
          <span>Tipo de crédito</span>
          <select value={estado.tipo} onChange={(e) => alCambiar({ tipo: e.target.value as "1" | "2", cuotas: [] })}>
            <option value="1">A plazo</option>
            {CUOTAS_HABILITADAS ? <option value="2">En cuotas</option> : null}
          </select>
        </label>

        <label className={estilos.field}>
          <span>Entrega inicial (Gs., opcional)</span>
          <input inputMode="decimal" placeholder="Sin entrega" value={estado.entrega} onChange={(e) => alCambiar({ entrega: e.target.value.replace(",", "."), cuotas: [] })} />
          <small className={estilos.hint}>Se cobra en el acto con la forma de pago elegida; el saldo se financia.</small>
        </label>

        {estado.tipo === "1" ? (
          <label className={estilos.field}>
            <span>Plazo (días)</span>
            <input inputMode="numeric" aria-label="Plazo en días" maxLength={String(MAX_PLAZO_DIAS).length} value={estado.plazoDias} onChange={(e) => alCambiar({ plazoDias: e.target.value.replace(/\D/g, "") })} />
            <span className={estilos.plazos} role="group" aria-label="Plazos frecuentes">
              {[30, 60, 90].map((d) => <button key={d} type="button" className={estilos.botonCuotas} aria-pressed={estado.plazoDias === String(d)} onClick={() => alCambiar({ plazoDias: String(d) })}>{d} días</button>)}
            </span>
            {/^\d{1,5}$/.test(estado.plazoDias) && Number(estado.plazoDias) > 0 && hoy ? <small className={estilos.hint}>Se informará: «{plazoTexto(Number(estado.plazoDias))}» (vence el {sumarDias(hoy, Number(estado.plazoDias))}). Saldo a plazo: Gs. {gs(saldo)}.</small> : null}
          </label>
        ) : (
          <>
            <label className={estilos.field}>
              <span>Cantidad de cuotas</span>
              <input inputMode="numeric" aria-label="Cantidad de cuotas" maxLength={3} value={estado.cantidad} onChange={(e) => alCambiar({ cantidad: e.target.value.replace(/\D/g, ""), cuotas: [] })} />
            </label>
            <label className={estilos.field}>
              <span>Primer vencimiento</span>
              <input type="date" aria-label="Primer vencimiento" min={hoy} value={estado.primerVencimiento} onChange={(e) => alCambiar({ primerVencimiento: e.target.value, cuotas: [] })} />
            </label>
            <label className={estilos.field}>
              <span>Días entre cuotas</span>
              <input inputMode="numeric" aria-label="Días entre cuotas" maxLength={4} value={estado.cadaDias} onChange={(e) => alCambiar({ cadaDias: e.target.value.replace(/\D/g, ""), cuotas: [] })} />
            </label>
          </>
        )}
      </div>

      {estado.tipo === "2" ? (
        <>
          <div className={estilos.actions}>
            <button type="button" className={estilos.botonCuotas} disabled={total <= 0 || saldo <= 0 || !(Number(estado.cantidad) >= 1 && Number(estado.cantidad) <= MAX_CUOTAS)} onClick={generar}>
              {estado.cuotas.length > 0 ? "Regenerar cuotas iguales" : "Generar cuotas iguales"}
            </button>
          </div>

          {estado.cuotas.length > 0 ? (
            <>
              <div className={estilos.tableWrap}>
                <table className={estilos.items}>
                  <thead><tr><th>Cuota</th><th className={estilos.num}>Monto (Gs.)</th><th>Vencimiento</th></tr></thead>
                  <tbody>
                    {estado.cuotas.map((q, i) => (
                      <tr key={i}>
                        <td>{i + 1} / {estado.cuotas.length}</td>
                        <td className={estilos.num}>
                          <input aria-label={`Monto de la cuota ${i + 1}`} inputMode="decimal" value={q.monto} onChange={(e) => alCambiar({ cuotas: estado.cuotas.map((x, j) => (j === i ? { ...x, monto: e.target.value.replace(",", ".") } : x)) })} />
                        </td>
                        <td>
                          <input type="date" aria-label={`Vencimiento de la cuota ${i + 1}`} min={hoy} value={q.vencimiento} onChange={(e) => alCambiar({ cuotas: estado.cuotas.map((x, j) => (j === i ? { ...x, vencimiento: e.target.value } : x)) })} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <small className={estilos.hint}>Suma de cuotas: Gs. {gs(suma)} · Saldo a financiar: Gs. {gs(saldo)}{Math.abs(suma - saldo) > 0.00005 ? " · NO coinciden" : " · coinciden"}.</small>
            </>
          ) : null}
        </>
      ) : null}

      {pendientes.length > 0 ? <p className={estilos.fieldError} role="alert">Crédito: {pendientes.slice(0, 4).join("; ")}{pendientes.length > 4 ? `; y ${pendientes.length - 4} más` : ""}.</p> : null}
    </fieldset>
  );
}
