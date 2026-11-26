"use client";

import { useEffect, useRef, useState } from "react";

import ui from "@/components/ui/lista-padrao/lista.module.css";
import { CANCELACION_FE_OPERATIVA, MOTIVO_NO_OPERATIVA, validarSolicitudCancelacion, type ElegibilidadCancelacion } from "@/lib/facturacion/eventos-fe";

import estilos from "./page.module.css";

/**
 * PRO-313-R01 / PRO-199 — Modal PREPARADA de «Cancelar documento» (FE). NO OPERATIVA: no existe ruta de envío ni llamada al gateway desde aquí; «Confirmar» queda deshabilitado mientras
 * CANCELACION_FE_OPERATIVA sea false (gates: aprobación oficial acreditada con zona, identificación inequívoca del evento, homologación autorizada). Solo se abre si la elegibilidad
 * lo permite (hoy nunca). «Volver» cierra sin efectos. El motivo se valida localmente (obligatorio, confirmación explícita); el servidor deberá revalidar todo al confirmar
 * (plazo, permisos, empresa/sucursal, identidad fiscal, eventos/documentos asociados, CSRF, una sola solicitud persistida antes del HTTP).
 */
export type DatosCancelacion = { numero: string; cdc: string | null; importe: string; aprobacionCandidata: string | null; elegibilidad: ElegibilidadCancelacion };

export function CancelacionModal({ datos, alVolver }: { datos: DatosCancelacion | null; alVolver: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const volver = useRef<HTMLButtonElement | null>(null);
  const caja = useRef<HTMLDivElement | null>(null);
  // El manejador del padre puede cambiar en cada render: se lee de una ref para que el efecto (foco inicial, Escape, Tab) no se reinstale ni robe el foco al escribir.
  const alVolverActual = useRef(alVolver);
  const abierto = datos !== null;

  useEffect(() => {
    alVolverActual.current = alVolver;
  }, [alVolver]);

  useEffect(() => {
    if (!abierto) return;

    const previo = document.activeElement as HTMLElement | null;

    volver.current?.focus();

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        alVolverActual.current();

        return;
      }
      if (e.key !== "Tab" || !caja.current) return;

      const foco = Array.from(caja.current.querySelectorAll<HTMLElement>("button:not([disabled]), textarea, input")).filter((x) => x.offsetParent !== null);

      if (foco.length === 0) return;
      if (e.shiftKey && document.activeElement === foco[0]) {
        e.preventDefault();
        foco[foco.length - 1].focus();
      } else if (!e.shiftKey && document.activeElement === foco[foco.length - 1]) {
        e.preventDefault();
        foco[0].focus();
      }
    };

    document.addEventListener("keydown", alTeclear);

    return () => {
      document.removeEventListener("keydown", alTeclear);
      previo?.focus?.();
    };
  }, [abierto]);

  if (!datos) return null;

  const validacion = validarSolicitudCancelacion({ motivo, confirmado });
  const operativa = CANCELACION_FE_OPERATIVA && datos.elegibilidad.disponible;
  const cerrar = () => {
    setMotivo("");
    setConfirmado(false);
    alVolver();
  };

  return (
    <div className={estilos.cancelacionFondo} role="presentation">
      <div ref={caja} className={estilos.cancelacionCaja} role="dialog" aria-modal="true" aria-labelledby="cancelacion-titulo">
        <h3 id="cancelacion-titulo">Cancelar documento</h3>
        <dl className={estilos.datosTecnicos}>
          <div><dt className={ui.muted}>Documento</dt><dd>{datos.numero}</dd></div>
          <div><dt className={ui.muted}>CDC</dt><dd className={ui.mono} style={{ overflowWrap: "anywhere" }}>{datos.cdc ?? "Sin información"}</dd></div>
          <div><dt className={ui.muted}>Monto</dt><dd>{datos.importe}</dd></div>
          <div><dt className={ui.muted}>Aprobación oficial SIFEN</dt><dd>No acreditada{datos.aprobacionCandidata ? ` (fecha de retorno candidata: ${datos.aprobacionCandidata})` : ""}</dd></div>
          <div><dt className={ui.muted}>Vencimiento del plazo (48 h)</dt><dd>{datos.elegibilidad.vencimientoMs === null ? "No calculable sin aprobación oficial acreditada" : new Date(datos.elegibilidad.vencimientoMs).toISOString()}</dd></div>
        </dl>
        <label className={estilos.campoMotivo}>
          <span>Motivo de la cancelación (obligatorio)</span>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
        </label>
        <label className={estilos.campoConfirmacion}>
          <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} /> Confirmo que solicito la cancelación fiscal de este documento.
        </label>
        {!validacion.valida ? <ul className={ui.muted}>{validacion.errores.map((e) => <li key={e}>{e}</li>)}</ul> : null}
        {!operativa ? <div className={ui.alertError} role="note">{datos.elegibilidad.motivo || `Cancelación no disponible: ${MOTIVO_NO_OPERATIVA}.`}</div> : null}
        <div className={estilos.barraAcciones}>
          <button ref={volver} type="button" className={ui.secondaryButton} onClick={cerrar}>Volver</button>
          {/* Sin transmisión: no hay manejador de envío. Se habilitará solo con el endpoint servidor idempotente autorizado. */}
          <button type="button" className={ui.primaryButton} disabled>Confirmar cancelación</button>
        </div>
      </div>
    </div>
  );
}
