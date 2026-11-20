"use client";

import { useState } from "react";

import { Area } from "../campos";
import type { ContextoFormulario } from "../contexto";
import styles from "../proveedor-form.module.css";

/** Acción «Reactivar cuenta» de una cuenta desactivada: solo se muestra al administrador; la justificación es obligatoria. El servidor revalida todo. */
export function ReactivarCuenta({ ctx, cuentaId }: { ctx: ContextoFormulario; cuentaId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (!ctx.detalle || ctx.detalle.permisos.reactivarCuenta !== true) return null;

  const detalle = ctx.detalle;

  async function enviar() {
    if (!motivo.trim()) {
      setError("La justificación de la reactivación es obligatoria.");
      return;
    }
    if (ctx.sucio && !window.confirm("Hay cambios sin guardar en el formulario: la acción recarga la ficha y se perderían. ¿Desea continuar?")) return;

    setEnviando(true);
    setError("");

    try {
      const respuesta = await fetch(`/api/proveedores/${encodeURIComponent(detalle.id)}/cuentas/${encodeURIComponent(cuentaId)}/reactivar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo }),
      });

      if (!respuesta.ok) {
        const json = (await respuesta.json().catch(() => ({}))) as { error?: string };

        setError(json.error || "No fue posible reactivar la cuenta.");
        return;
      }

      ctx.recargar();
    } catch {
      setError("No fue posible reactivar la cuenta. Verifique la conexión.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={styles.bloque}>
      {abierto ? (
        <>
          <p className={styles.textoSecundario}>
            Reactivar conserva el estado de aprobación anterior: no aprueba cambios pendientes ni la define como principal. Una cuenta que estaba aprobada vuelve a poder usarse en pagos.
          </p>
          <Area etiqueta="Justificación de la reactivación *" campo={`motivo-reactivar-${cuentaId}`} errores={{}} valor={motivo} alCambiar={setMotivo} maxLength={1000} />
          {error ? (
            <div className={styles.error} role="alert" style={{ margin: "0 0 10px" }}>
              {error}
            </div>
          ) : null}
          <div className={styles.acciones}>
            <button type="button" className={styles.saveButton} disabled={enviando} onClick={enviar}>
              {enviando ? "Procesando..." : "Confirmar reactivación"}
            </button>
            <button type="button" className={styles.cancelButton} onClick={() => setAbierto(false)}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <div className={styles.acciones}>
          <button type="button" className={styles.secondaryButton} onClick={() => setAbierto(true)}>
            Reactivar cuenta
          </button>
        </div>
      )}
    </div>
  );
}
