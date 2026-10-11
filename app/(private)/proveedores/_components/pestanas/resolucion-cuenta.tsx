"use client";

import { useState } from "react";

import type { ProveedorCuentaBancaria } from "@/types/proveedores";

import { Area } from "../campos";
import type { ContextoFormulario } from "../contexto";
import styles from "../proveedor-form.module.css";

const ESTADO_TEXTO: Record<string, string> = { PENDIENTE: "Pendiente de aprobación", APROBADA: "Aprobada", RECHAZADA: "Rechazada" };

const ETIQUETA_DATO: Record<string, string> = {
  banco: "Banco",
  sucursal_banco: "Sucursal",
  titular: "Titular",
  documento_titular: "Documento del titular",
  tipo_cuenta: "Tipo de cuenta",
  numero_cuenta: "Número de cuenta",
  moneda_codigo: "Moneda",
  alias_cuenta: "Alias",
  codigo_swift: "SWIFT / BIC",
  iban: "IBAN",
  es_principal: "Cuenta principal",
};

/** Estado de aprobación de una cuenta guardada y, con PROVEEDORES.APROBAR_BANCO, sus botones de aprobar o rechazar. */
export function ResolucionCuenta({ ctx, cuenta }: { ctx: ContextoFormulario; cuenta: ProveedorCuentaBancaria }) {
  const [abierto, setAbierto] = useState<"APROBAR" | "RECHAZAR" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Una cuenta aún no guardada no tiene estado: se presentará a aprobación al guardar.
  const guardada = ctx.detalle?.cuentasBancarias.find((c) => c.id === cuenta.id);

  if (!guardada || !guardada.estadoAprobacion) {
    return <p className={styles.textoSecundario}>Al guardar, la cuenta quedará pendiente de aprobación y no podrá usarse en pagos hasta que se apruebe.</p>;
  }

  const revision = guardada.revisionPendiente ?? null;
  const puedeResolver = ctx.detalle?.permisos.aprobarBanco === true && (guardada.estadoAprobacion === "PENDIENTE" || (guardada.estadoAprobacion === "APROBADA" && revision !== null));
  const cambios = revision ? Object.entries(revision.datos).filter(([k]) => k in ETIQUETA_DATO) : [];

  async function enviar() {
    if (!abierto || !ctx.detalle) return;
    if (ctx.sucio && !window.confirm("Hay cambios sin guardar en el formulario: la acción recarga la ficha y se perderían. ¿Desea continuar?")) return;

    setEnviando(true);
    setError("");

    try {
      const respuesta = await fetch(`/api/proveedores/${encodeURIComponent(ctx.detalle.id)}/cuentas/${encodeURIComponent(cuenta.id)}/resolucion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: abierto, motivo }),
      });

      if (!respuesta.ok) {
        const json = (await respuesta.json().catch(() => ({}))) as { error?: string };

        setError(json.error || "No fue posible completar la acción.");
        return;
      }

      ctx.recargar();
    } catch {
      setError("No fue posible completar la acción. Verifique la conexión.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={styles.bloque}>
      <p>
        <span
          className={[styles.etiquetaEstado, guardada.estadoAprobacion === "APROBADA" ? styles.etiquetaOk : guardada.estadoAprobacion === "RECHAZADA" ? styles.etiquetaPeligro : styles.etiquetaAlerta].join(" ")}
        >
          {ESTADO_TEXTO[guardada.estadoAprobacion]}
        </span>{" "}
        {guardada.estadoAprobacion === "APROBADA" && guardada.aprobadoEn ? <span className={styles.textoSecundario}>el {guardada.aprobadoEn}</span> : null}
        {guardada.estadoAprobacion === "RECHAZADA" && guardada.motivoResolucion ? <span className={styles.textoSecundario}>Motivo: {guardada.motivoResolucion}</span> : null}
      </p>

      {guardada.estadoAprobacion === "APROBADA" ? <p className={styles.textoSecundario}>Los cambios en una cuenta aprobada no la reemplazan: quedan pendientes de aprobación y la cuenta aprobada sigue vigente para pagos.</p> : null}

      {revision ? (
        <div>
          <p className={styles.textoSecundario}>
            <strong>Cambios pendientes de aprobación</strong> (solicitados el {revision.solicitadoEn}):
          </p>
          <ul className={styles.textoSecundario} style={{ margin: "0 0 8px", paddingLeft: 18 }}>
            {cambios.map(([clave, valor]) => (
              <li key={clave}>
                {ETIQUETA_DATO[clave]}: {typeof valor === "boolean" ? (valor ? "Sí" : "No") : String(valor ?? "—") || "—"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {puedeResolver ? (
        <>
          <div className={styles.acciones}>
            <button type="button" className={styles.secondaryButton} onClick={() => setAbierto("APROBAR")}>
              {revision ? "Aprobar cambios" : "Aprobar cuenta"}
            </button>
            <button type="button" className={styles.cancelButton} onClick={() => setAbierto("RECHAZAR")}>
              {revision ? "Rechazar cambios" : "Rechazar cuenta"}
            </button>
          </div>

          {abierto ? (
            <>
              <Area etiqueta={abierto === "RECHAZAR" ? "Motivo del rechazo *" : "Observación"} campo={`motivo-cuenta-${cuenta.id}`} errores={{}} valor={motivo} alCambiar={setMotivo} maxLength={1000} />
              {error ? (
                <div className={styles.error} role="alert" style={{ margin: "0 0 10px" }}>
                  {error}
                </div>
              ) : null}
              <div className={styles.acciones}>
                <button type="button" className={styles.saveButton} disabled={enviando} onClick={enviar}>
                  {enviando ? "Procesando..." : "Confirmar"}
                </button>
                <button type="button" className={styles.cancelButton} onClick={() => setAbierto(null)}>
                  Cancelar
                </button>
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
