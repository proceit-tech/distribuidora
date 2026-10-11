"use client";

import { useState } from "react";

import { isoALocal, localAIso } from "@/lib/proveedores/fechas";
import { ENTIDAD_TEXTO, EVENTO_TEXTO, HOMOLOGACION_TEXTO, RIESGO_TEXTO } from "@/lib/proveedores/textos";

import { Area, Selector, Texto } from "../campos";
import type { ContextoFormulario } from "../contexto";
import styles from "../proveedor-form.module.css";

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className={styles.field}>
      <span>{etiqueta}</span>
      <div className={styles.soloLectura}>{valor || "—"}</div>
    </div>
  );
}

type Accion = "EN_EVALUACION" | "HOMOLOGAR" | "RECHAZAR" | "SUSPENDER" | "RENOVAR" | "EVALUAR_RIESGO" | "BLOQUEAR" | "DESBLOQUEAR";

const TITULO: Record<Accion, string> = {
  EN_EVALUACION: "Pasar a evaluación",
  HOMOLOGAR: "Homologar",
  RECHAZAR: "Rechazar homologación",
  SUSPENDER: "Suspender homologación",
  RENOVAR: "Renovar homologación",
  EVALUAR_RIESGO: "Evaluar riesgo",
  BLOQUEAR: "Bloquear proveedor",
  DESBLOQUEAR: "Desbloquear proveedor",
};

const ETIQUETA_JUSTIFICACION: Partial<Record<Accion, string>> = {
  RECHAZAR: "Motivo del rechazo *",
  SUSPENDER: "Motivo de la suspensión *",
  EVALUAR_RIESGO: "Justificación de la evaluación *",
  BLOQUEAR: "Motivo del bloqueo *",
  DESBLOQUEAR: "Motivo del desbloqueo *",
};

type Evento = { id: string; entidad: string; accion: string; justificacion: string | null; fecha: string; usuario: string };

/** Estado de homologación, riesgo y bloqueo. Solo cambia con acciones específicas (permiso propio, justificación y auditoría). */
export function PanelGobernanza({ ctx }: { ctx: ContextoFormulario }) {
  const d = ctx.detalle;
  const [accion, setAccion] = useState<Accion | null>(null);
  const [justificacion, setJustificacion] = useState("");
  const [vencimiento, setVencimiento] = useState("");
  const [nivel, setNivel] = useState("BAJO");
  const [nota, setNota] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [eventos, setEventos] = useState<Evento[] | null>(null);

  if (!d) {
    return (
      <section className={styles.bloque} aria-label="Homologación y riesgo">
        <h4>Homologación y riesgo</h4>
        <p className={styles.textoSecundario}>El proveedor se registra como pendiente de homologación y con riesgo no evaluado. Los cambios se realizan desde la ficha, con permiso específico y auditoría.</p>
      </section>
    );
  }

  const estado = d.estadoHomologacion;
  const p = d.permisos;
  const disponibles: Accion[] = [];

  if (p.homologar) {
    if (["PENDIENTE", "RECHAZADO", "SUSPENDIDO", "VENCIDO"].includes(estado)) disponibles.push("EN_EVALUACION");
    if (["PENDIENTE", "EN_EVALUACION", "SUSPENDIDO"].includes(estado)) disponibles.push("HOMOLOGAR");
    if (["PENDIENTE", "EN_EVALUACION"].includes(estado)) disponibles.push("RECHAZAR");
    if (estado === "HOMOLOGADO") disponibles.push("SUSPENDER");
    if (estado === "HOMOLOGADO" || estado === "VENCIDO") disponibles.push("RENOVAR");
  }
  if (p.evaluarRiesgo) disponibles.push("EVALUAR_RIESGO");
  if (p.bloquear) disponibles.push(d.bloqueado ? "DESBLOQUEAR" : "BLOQUEAR");

  function abrir(a: Accion) {
    if (ctx.sucio && !window.confirm("Hay cambios sin guardar en el formulario: la acción recarga la ficha y se perderían. ¿Desea continuar?")) return;

    setAccion(a);
    setJustificacion("");
    setVencimiento("");
    setNota("");
    setNivel(d?.nivelRiesgo && d.nivelRiesgo !== "NO_EVALUADO" ? d.nivelRiesgo : "BAJO");
    setError("");
  }

  async function confirmar() {
    if (!accion || !d) return;

    const iso = localAIso(vencimiento);

    if (iso === null) {
      setError("La fecha de vencimiento debe tener el formato dd/mm/aaaa y ser una fecha real.");
      return;
    }

    setEnviando(true);
    setError("");

    try {
      const respuesta = await fetch(`/api/proveedores/${encodeURIComponent(d.id)}/gobernanza`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, justificacion, fechaVencimiento: iso || null, nivelRiesgo: nivel, calificacion: nota }),
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

  async function verHistorial() {
    if (!d) return;

    try {
      const respuesta = await fetch(`/api/proveedores/${encodeURIComponent(d.id)}/eventos?limite=100`, { cache: "no-store" });
      const json = (await respuesta.json()) as { eventos?: Evento[]; error?: string };

      if (!respuesta.ok) throw new Error(json.error);

      setEventos(json.eventos ?? []);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "No fue posible cargar el historial.");
    }
  }

  const operativo = d.estadoOperativo;

  return (
    <section className={styles.bloque} aria-label="Homologación, riesgo y bloqueo">
      <h4>Homologación, riesgo y bloqueo</h4>

      <p>
        <span className={[styles.etiquetaEstado, operativo.elegible ? styles.etiquetaOk : styles.etiquetaAlerta].join(" ")}>
          {operativo.elegible ? "Elegible para nuevas compras" : "No elegible para nuevas compras"}
        </span>{" "}
        {operativo.elegible ? null : <span className={styles.textoSecundario}>{operativo.motivos.join(" ")}</span>}
      </p>

      <div className={styles.gridFour}>
        <Dato etiqueta="Estado de homologación" valor={d.homologacionVencida && estado === "HOMOLOGADO" ? "Homologación vencida" : HOMOLOGACION_TEXTO[estado]} />
        <Dato etiqueta="Fecha de homologación" valor={isoALocal(d.fechaHomologacion)} />
        <Dato etiqueta="Vencimiento de la homologación" valor={isoALocal(d.fechaVencimientoHomologacion)} />
        <Dato etiqueta="Nivel de riesgo" valor={RIESGO_TEXTO[d.nivelRiesgo]} />
      </div>

      <div className={styles.gridFour}>
        <Dato etiqueta="Calificación actual" valor={d.calificacionActual ? `${d.calificacionActual} / 100` : ""} />
        <Dato etiqueta="Bloqueo administrativo" valor={d.bloqueado ? "Bloqueado" : "Sin bloqueo"} />
        {d.bloqueado ? <Dato etiqueta="Motivo del bloqueo" valor={d.motivoBloqueo} /> : null}
      </div>

      {disponibles.length > 0 ? (
        <div className={styles.acciones}>
          {disponibles.map((a) => (
            <button key={a} type="button" className={styles.secondaryButton} onClick={() => abrir(a)}>
              {TITULO[a]}
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.textoSecundario}>Su perfil no incluye permisos de homologación, riesgo o bloqueo.</p>
      )}

      {accion ? (
        <div className={styles.bloque} role="group" aria-label={TITULO[accion]}>
          <h4>{TITULO[accion]}</h4>

          {accion === "HOMOLOGAR" || accion === "RENOVAR" ? (
            <div className={styles.gridFour}>
              <Texto
                etiqueta={accion === "RENOVAR" ? "Nuevo vencimiento *" : "Vencimiento de la homologación"}
                campo="vencimientoAccion"
                errores={{}}
                valor={vencimiento}
                alCambiar={setVencimiento}
                placeholder="dd/mm/aaaa"
                maxLength={10}
                modo="numeric"
                ayuda="Vale hasta el final de ese día."
              />
            </div>
          ) : null}

          {accion === "EVALUAR_RIESGO" ? (
            <div className={styles.gridFour}>
              <Selector
                etiqueta="Nivel de riesgo *"
                campo="nivelAccion"
                errores={{}}
                valor={nivel}
                alCambiar={setNivel}
                opciones={[
                  ["BAJO", "Bajo"],
                  ["MEDIO", "Medio"],
                  ["ALTO", "Alto"],
                  ["CRITICO", "Crítico"],
                ]}
              />
              <Texto etiqueta="Calificación (0 a 100)" campo="notaAccion" errores={{}} valor={nota} alCambiar={setNota} maxLength={6} modo="decimal" ayuda="Opcional; hasta 2 decimales." />
            </div>
          ) : null}

          <Area etiqueta={ETIQUETA_JUSTIFICACION[accion] ?? "Justificación *"} campo="justificacionAccion" errores={{}} valor={justificacion} alCambiar={setJustificacion} maxLength={1000} />

          {error ? (
            <div className={styles.error} role="alert" style={{ margin: "0 0 10px" }}>
              {error}
            </div>
          ) : null}

          <div className={styles.acciones}>
            <button type="button" className={styles.saveButton} disabled={enviando} onClick={confirmar}>
              {enviando ? "Procesando..." : "Confirmar"}
            </button>
            <button type="button" className={styles.cancelButton} onClick={() => setAccion(null)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : error ? (
        <div className={styles.error} role="alert" style={{ margin: "0 0 10px" }}>
          {error}
        </div>
      ) : null}

      <p className={styles.textoSecundario}>La homologación, el riesgo y el bloqueo no se editan en el formulario: cada cambio exige su permiso, una justificación y queda auditado.</p>

      <div className={styles.acciones}>
        <button type="button" className={styles.cancelButton} onClick={verHistorial}>
          {eventos ? "Actualizar historial" : "Ver historial"}
        </button>
      </div>

      {eventos ? (
        eventos.length === 0 ? (
          <p className={styles.textoSecundario}>Aún no hay eventos registrados.</p>
        ) : (
          <ul className={styles.textoSecundario} style={{ margin: 0, paddingLeft: 18 }}>
            {eventos.map((e) => (
              <li key={e.id}>
                <strong>{EVENTO_TEXTO[e.accion] ?? e.accion}</strong> · {ENTIDAD_TEXTO[e.entidad] ?? e.entidad} · {e.fecha} · {e.usuario || "usuario"}
                {e.justificacion ? ` — ${e.justificacion}` : ""}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}
