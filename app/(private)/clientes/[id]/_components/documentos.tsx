"use client";

import { useState } from "react";

import { ACCEPT_ARCHIVOS, EXTENSIONES_TEXTO, TAMANO_MAXIMO_BYTES, tamanoLegible, validarNombreYTamano } from "@/lib/almacenamiento/archivos-reglas";

import styles from "../page.module.css";

// Documentos del cliente = archivos reales en almacenamiento privado (CLI-VIS-01). Cada acción (cargar, reemplazar, editar los
// datos, eliminar) se ejecuta de inmediato contra /api/clientes/{id}/documentos y luego se recarga la lista: nada se pierde
// en silencio ni depende del botón «Guardar» del cliente. La descarga pasa por la API autenticada (no hay URL pública).

export type DocumentoCliente = {
  id: string;
  tipo: string;
  nombreArchivo: string;
  fechaEmision: string;
  fechaVencimiento: string;
  observacion: string;
  tieneArchivo: boolean;
  tamanoBytes: number | null;
  tipoMime: string;
  urlArchivo: string;
};

type Borrador = { tipo: string; fechaEmision: string; fechaVencimiento: string; observacion: string; archivo: File | null };

const TIPOS: Array<[string, string]> = [
  ["RUC", "Constancia de RUC"],
  ["CONTRATO", "Contrato"],
  ["CREDITO", "Documento de crédito"],
  ["EXONERACION", "Exoneración"],
  ["OTRO", "Otro"],
];
const etiquetaTipo = (t: string) => TIPOS.find(([v]) => v === t)?.[1] ?? t;
const borradorVacio = (): Borrador => ({ tipo: "OTRO", fechaEmision: "", fechaVencimiento: "", observacion: "", archivo: null });

function Formulario({ valor, onChange, obligatorioArchivo }: { valor: Borrador; onChange: (b: Borrador) => void; obligatorioArchivo: boolean }) {
  return (
    <div className={styles.gridFour}>
      <label className={styles.field}>
        <span>Tipo</span>
        <select className={styles.select} value={valor.tipo} onChange={(e) => onChange({ ...valor, tipo: e.target.value })}>
          {TIPOS.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span>{obligatorioArchivo ? "Archivo *" : "Reemplazar archivo (opcional)"}</span>
        <input accept={ACCEPT_ARCHIVOS} className={styles.input} onChange={(e) => onChange({ ...valor, archivo: e.target.files?.[0] ?? null })} type="file" />
        <small>
          {valor.archivo ? `${valor.archivo.name} · ${tamanoLegible(valor.archivo.size)}` : `${EXTENSIONES_TEXTO} · máx. ${TAMANO_MAXIMO_BYTES / 1024 / 1024} MB`}
        </small>
      </label>
      <label className={styles.field}>
        <span>Fecha de emisión</span>
        <input className={styles.input} onChange={(e) => onChange({ ...valor, fechaEmision: e.target.value })} placeholder="dd/mm/yyyy" value={valor.fechaEmision} />
      </label>
      <label className={styles.field}>
        <span>Fecha de vencimiento</span>
        <input className={styles.input} onChange={(e) => onChange({ ...valor, fechaVencimiento: e.target.value })} placeholder="dd/mm/yyyy" value={valor.fechaVencimiento} />
      </label>
      <label className={[styles.field, styles.spanTwo].join(" ")}>
        <span>Observación</span>
        <input className={styles.input} maxLength={500} onChange={(e) => onChange({ ...valor, observacion: e.target.value })} value={valor.observacion} />
      </label>
    </div>
  );
}

export function DocumentosCliente({
  clienteId,
  documentos,
  onRecargar,
  onError,
  onAviso,
}: {
  clienteId: string;
  documentos: DocumentoCliente[];
  onRecargar: () => Promise<void>;
  onError: (mensaje: string) => void;
  onAviso: (mensaje: string) => void;
}) {
  const [nuevo, setNuevo] = useState<Borrador | null>(null);
  const [editando, setEditando] = useState<{ id: string; borrador: Borrador } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const base = `/api/clientes/${clienteId}/documentos`;

  async function enviar(url: string, metodo: "POST" | "PUT", b: Borrador): Promise<boolean> {
    if (b.archivo) {
      const errorArchivo = validarNombreYTamano(b.archivo.name, b.archivo.size);

      if (errorArchivo) {
        onError(errorArchivo);
        return false;
      }
    }

    const datos = new FormData();
    if (b.archivo) datos.set("archivo", b.archivo);
    datos.set("tipo", b.tipo);
    datos.set("fechaEmision", b.fechaEmision.trim());
    datos.set("fechaVencimiento", b.fechaVencimiento.trim());
    datos.set("observacion", b.observacion.trim());

    setOcupado(true);

    try {
      const r = await fetch(url, { method: metodo, body: datos });
      const j = (await r.json().catch(() => ({}))) as { error?: string };

      if (!r.ok) {
        onError(j.error ?? "No fue posible guardar el documento.");
        return false;
      }

      await onRecargar();
      return true;
    } catch {
      onError("Error de conexión al guardar el documento.");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function eliminar(d: DocumentoCliente) {
    if (!window.confirm(`¿Eliminar el documento «${d.nombreArchivo}»? Esta acción borra también el archivo y no se puede deshacer.`)) return;

    setOcupado(true);

    try {
      const r = await fetch(`${base}/${d.id}`, { method: "DELETE" });
      const j = (await r.json().catch(() => ({}))) as { error?: string };

      if (!r.ok) {
        onError(j.error ?? "No fue posible eliminar el documento.");
        return;
      }

      onAviso("Documento eliminado.");
      await onRecargar();
    } catch {
      onError("Error de conexión al eliminar el documento.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section>
      <div className={styles.sectionTitle}>
        <div>
          <h3>Documentos comerciales</h3>
        </div>
        <button className={styles.addButton} disabled={ocupado || nuevo !== null} onClick={() => setNuevo(borradorVacio())} type="button">
          + Agregar documento
        </button>
      </div>

      {nuevo ? (
        <article className={styles.repeated}>
          <div className={styles.repeatedHead}>
            <strong>Nuevo documento</strong>
            <button className={styles.removeButton} disabled={ocupado} onClick={() => setNuevo(null)} type="button">
              Cancelar
            </button>
          </div>
          <Formulario obligatorioArchivo onChange={setNuevo} valor={nuevo} />
          <button
            className={styles.addButton}
            disabled={ocupado}
            onClick={async () => {
              if (!nuevo.archivo) {
                onError("Seleccione el archivo del documento.");
                return;
              }
              if (await enviar(base, "POST", nuevo)) {
                setNuevo(null);
                onAviso("Documento cargado.");
              }
            }}
            type="button"
          >
            {ocupado ? "Cargando…" : "Cargar documento"}
          </button>
        </article>
      ) : null}

      {documentos.length === 0 && !nuevo ? <p className={styles.emptyHint}>Este cliente no tiene documentos registrados.</p> : null}

      {documentos.map((d, i) => (
        <article className={styles.repeated} key={d.id}>
          <div className={styles.repeatedHead}>
            <strong>
              Documento {i + 1} · {etiquetaTipo(d.tipo)}
            </strong>
            <span>
              <button className={styles.removeButton} disabled={ocupado} onClick={() => setEditando({ id: d.id, borrador: { tipo: d.tipo, fechaEmision: d.fechaEmision, fechaVencimiento: d.fechaVencimiento, observacion: d.observacion, archivo: null } })} type="button">
                Editar
              </button>{" "}
              <button className={styles.removeButton} disabled={ocupado} onClick={() => void eliminar(d)} type="button">
                Eliminar
              </button>
            </span>
          </div>

          {editando?.id === d.id ? (
            <>
              <Formulario obligatorioArchivo={false} onChange={(borrador) => setEditando({ id: d.id, borrador })} valor={editando.borrador} />
              <button
                className={styles.addButton}
                disabled={ocupado}
                onClick={async () => {
                  if (await enviar(`${base}/${d.id}`, "PUT", editando.borrador)) {
                    setEditando(null);
                    onAviso("Documento actualizado.");
                  }
                }}
                type="button"
              >
                {ocupado ? "Guardando…" : "Guardar cambios del documento"}
              </button>{" "}
              <button className={styles.removeButton} disabled={ocupado} onClick={() => setEditando(null)} type="button">
                Cancelar
              </button>
            </>
          ) : (
            <p>
              {d.tieneArchivo ? (
                <a download href={`${base}/${d.id}`}>
                  {d.nombreArchivo}
                </a>
              ) : (
                <>
                  {d.nombreArchivo} ·{" "}
                  <a href={/^https?:[/][/]/i.test(d.urlArchivo) ? d.urlArchivo : undefined} rel="noopener noreferrer" target="_blank">
                    enlace anterior
                  </a>{" "}
                  (sin archivo almacenado: edite el documento para cargar el archivo)
                </>
              )}
              {d.tamanoBytes ? ` · ${tamanoLegible(d.tamanoBytes)}` : ""}
              {d.fechaEmision ? ` · Emisión ${d.fechaEmision}` : ""}
              {d.fechaVencimiento ? ` · Vence ${d.fechaVencimiento}` : ""}
              {d.observacion ? ` · ${d.observacion}` : ""}
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
