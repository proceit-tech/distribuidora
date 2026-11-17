"use client";

import { useEffect, useState } from "react";

import estilos from "./page.module.css";

type Politica = { bloquear: boolean; soportada: boolean };

/**
 * PRO-354-R02 — Interruptor «Bloquear facturación por stock insuficiente» de la EMPRESA (predeterminado: activado = comportamiento de siempre).
 * El valor que se muestra es el leído del servidor. El cambio se confirma y se guarda en la base (auditado). Nunca se usa un valor local para facturar.
 */
export function PoliticaStockInsuficiente() {
  const [politica, setPolitica] = useState<Politica | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;

    void (async () => {
      try {
        const r = await fetch("/api/facturacion/politica-stock", { cache: "no-store" });
        const j = (await r.json().catch(() => ({}))) as Politica & { error?: string };

        if (!r.ok) throw new Error(j.error ?? "No se pudo leer la política de stock.");
        if (vivo) setPolitica({ bloquear: j.bloquear !== false, soportada: j.soportada === true });
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : "No se pudo leer la política de stock.");
      }
    })();

    return () => {
      vivo = false;
    };
  }, []);

  async function cambiar(bloquear: boolean) {
    if (!politica || guardando) return;

    const texto = bloquear
      ? "¿Bloquear la facturación cuando el stock disponible no alcance? Las bajas pendientes ya registradas seguirán visibles en Inventario."
      : "¿Permitir facturar con stock insuficiente? Se descontará solo lo disponible y el faltante quedará como baja pendiente para confirmar manualmente.";

    if (!window.confirm(texto)) return;
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const r = await fetch("/api/facturacion/politica-stock", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bloquear }) });
      const j = (await r.json().catch(() => ({}))) as Politica & { error?: string };

      if (!r.ok) throw new Error(j.error ?? "No se pudo guardar la política de stock.");
      setPolitica({ bloquear: j.bloquear !== false, soportada: true });
      setAviso(j.bloquear !== false ? "La facturación se bloquea cuando el stock no alcanza." : "Se permite facturar con stock insuficiente (faltante como baja pendiente).");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la política de stock.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className={estilos.card}>
      <h2>Stock al facturar</h2>
      {error ? <p className={estilos.error} role="alert">{error}</p> : null}
      {aviso ? <p className={estilos.aviso} role="status">{aviso}</p> : null}
      {politica === null && !error ? <p className={estilos.hint}>Cargando…</p> : null}
      {politica ? (
        <>
          <label className={estilos.field}>
            <span>
              <input
                type="checkbox"
                role="switch"
                aria-checked={politica.bloquear}
                checked={politica.bloquear}
                disabled={!politica.soportada || guardando}
                onChange={(ev) => void cambiar(ev.target.checked)}
              />{" "}
              Bloquear facturación por stock insuficiente
            </span>
            <small className={estilos.hint}>
              {politica.bloquear
                ? "Activado: no se puede emitir una factura si el stock disponible de algún producto no alcanza."
                : "Desactivado: se emite la factura, se descuenta solo el stock disponible y el faltante queda como «baja pendiente de stock», que se confirma manualmente en Inventario cuando haya stock."}
            </small>
            {!politica.soportada ? <small className={estilos.hint}>Requiere la actualización de base de datos NEX-081 (aún no aplicada). Mientras tanto la facturación se bloquea por stock insuficiente.</small> : null}
          </label>
          {guardando ? <p className={estilos.hint}>Guardando…</p> : null}
        </>
      ) : null}
    </div>
  );
}
