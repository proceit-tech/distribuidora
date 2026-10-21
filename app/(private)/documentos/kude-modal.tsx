"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import ui from "@/components/ui/lista-padrao/lista.module.css";
import type { crearControladorVisor } from "@/lib/facturacion/kude-visor";

type Controlador = ReturnType<typeof crearControladorVisor>;

/** Modal del KuDE (PRO-194): refleja el controlador; el PDF vive solo como Blob/URL temporal mientras está abierta. Escape y «Cerrar» liberan todo. */
export function KudeModal({ controlador }: { controlador: Controlador }) {
  const estado = useSyncExternalStore(controlador.suscribir, controlador.estado, controlador.estado);
  const cierre = useRef<HTMLButtonElement | null>(null);
  const caja = useRef<HTMLDivElement | null>(null);
  const abierto = estado.fase !== "CERRADO";

  useEffect(() => {
    if (!abierto) return;

    const previo = document.activeElement as HTMLElement | null;

    cierre.current?.focus();

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        controlador.cerrar();

        return;
      }
      if (e.key !== "Tab" || !caja.current) return;

      // Foco atrapado dentro de la modal.
      const foco = Array.from(caja.current.querySelectorAll<HTMLElement>("button:not([disabled]), iframe")).filter((x) => x.offsetParent !== null);

      if (foco.length === 0) return;

      const primero = foco[0];
      const ultimo = foco[foco.length - 1];

      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };

    document.addEventListener("keydown", alTeclear);

    return () => {
      document.removeEventListener("keydown", alTeclear);
      previo?.focus?.();
    };
  }, [abierto, controlador]);

  // Al desmontar la pantalla se libera cualquier solicitud o URL pendiente.
  useEffect(() => () => controlador.cerrar(), [controlador]);

  if (estado.fase === "CERRADO") return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onMouseDown={(e) => { if (e.target === e.currentTarget) controlador.cerrar(); }}>
      <div ref={caja} role="dialog" aria-modal="true" aria-labelledby="kude-titulo" style={{ background: "var(--surface, #fff)", color: "inherit", borderRadius: 8, width: "min(1100px, 100%)", height: "min(92vh, 100%)", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(0,0,0,0.35)" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--border, #d6dcdc)" }}>
          <h2 id="kude-titulo" style={{ margin: 0, fontSize: "1.05rem" }}>{estado.titulo}</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className={ui.secondaryButton} disabled={estado.fase !== "LISTO" || estado.descarga === "CARGANDO"} onClick={() => void controlador.descargar()}>{estado.fase === "LISTO" && estado.descarga === "CARGANDO" ? "Preparando descarga…" : "Descargar PDF"}</button>
            <button type="button" className={ui.secondaryButton} disabled={estado.fase !== "LISTO"} onClick={() => controlador.imprimir()}>Imprimir</button>
            <button ref={cierre} type="button" className={ui.primaryButton} onClick={() => controlador.cerrar()}>Cerrar</button>
          </div>
        </header>
        {estado.fase === "LISTO" && estado.descarga === "ERROR" ? <p className={ui.alertError} role="alert" style={{ margin: "8px 16px 0" }}>{estado.mensajeDescarga} Puede intentar «Descargar PDF» nuevamente.</p> : null}
        <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "stretch", justifyContent: "center" }}>
          {estado.fase === "CARGANDO" ? <p role="status" style={{ margin: "auto" }}>Obteniendo el KuDE del gateway…</p> : null}
          {estado.fase === "ERROR" ? (
            <div role="alert" style={{ margin: "auto", textAlign: "center", maxWidth: 520 }}>
              <p className={ui.alertError}>{estado.mensaje}</p>
              <button type="button" className={ui.secondaryButton} onClick={() => void controlador.reintentar()}>Reintentar</button>
            </div>
          ) : null}
          {estado.fase === "LISTO" ? <iframe id="kude-visor" key={estado.url} src={estado.url} title={estado.titulo} style={{ border: 0, width: "100%", height: "100%" }} /> : null}
        </div>
      </div>
    </div>
  );
}
