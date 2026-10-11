"use client";

import { useState } from "react";

import { ACCEPT_ARCHIVOS, EXTENSIONES_TEXTO, TAMANO_MAXIMO_BYTES, tamanoLegible, validarNombreYTamano } from "@/lib/almacenamiento/archivos-reglas";

import styles from "../page.module.css";

// Documentos del cliente = archivos reales en almacenamiento privado. Cada acción (cargar, reemplazar = nueva versión, editar los
// datos, eliminar = exclusión LÓGICA, restaurar, recuperar una versión anterior) se ejecuta de inmediato contra
// /api/clientes/{id}/documentos y luego se recarga la lista: nada se pierde en silencio ni depende del «Guardar» del cliente.
// Ningún archivo se destruye: eliminar y reemplazar conservan los bytes, el historial de versiones y la auditoría.
// La descarga pasa por la API autenticada (no hay URL pública).

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
  version: number;
  urlArchivo: string;
};

type Borrador = { tipo: string; fechaEmision: string; fechaVencimiento: string; observacion: string; archivo: File | null };
type Eliminado = { id: string; tipo: string; nombreArchivo: string; tamanoBytes: number | null; version: number; eliminadoEn: string };
type Historial = {
  versionVigente: number;
  versiones: Array<{ version: number; nombreArchivo: string; tamanoBytes: number; subidoEn: string }>;
  eventos: Array<{ accion: string; version: number | null; cuando: string }>;
};

const TIPOS: Array<[string, string]> = [
  ["RUC", "Constancia de RUC"],
  ["CONTRATO", "Contrato"],
  ["CREDITO", "Documento de crédito"],
  ["EXONERACION", "Exoneración"],
  ["OTRO", "Otro"],
];
const ACCIONES: Record<string, string> = {
  CARGA: "Carga",
  REEMPLAZO: "Nueva versión",
  EDICION_DATOS: "Edición de datos",
  ELIMINACION_LOGICA: "Eliminación lógica",
  RESTAURACION: "Restauración",
  RECUPERACION_VERSION: "Versión recuperada",
};
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
        <span>{obligatorioArchivo ? "Archivo *" : "Nueva versión del archivo (opcional)"}</span>
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
  const [historial, setHistorial] = useState<{ id: string; datos: Historial } | null>(null);
  const [eliminados, setEliminados] = useState<Eliminado[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const base = `/api/clientes/${clienteId}/documentos`;

  /** Ejecuta una acción contra la API y devuelve el JSON (o null tras informar el error). */
  async function llamar<T = Record<string, unknown>>(url: string, init: RequestInit, falloPorDefecto: string): Promise<T | null> {
    setOcupado(true);

    try {
      const r = await fetch(url, init);
      const j = (await r.json().catch(() => ({}))) as { error?: string } & T;

      if (!r.ok) {
        onError(j.error ?? falloPorDefecto);
        return null;
      }

      return j;
    } catch {
      onError("Error de conexión.");
      return null;
    } finally {
      setOcupado(false);
    }
  }

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

    if ((await llamar(url, { method: metodo, body: datos }, "No fue posible guardar el documento.")) === null) return false;

    await onRecargar();
    return true;
  }

  async function eliminar(d: DocumentoCliente) {
    if (!window.confirm(`¿Eliminar el documento «${d.nombreArchivo}»? Se oculta de la lista, pero el archivo, su historial y la auditoría se conservan y puede restaurarse.`)) return;

    if ((await llamar(`${base}/${d.id}`, { method: "DELETE" }, "No fue posible eliminar el documento.")) !== null) {
      onAviso("Documento eliminado (el archivo y su historial se conservan).");
      setHistorial(null);
      await onRecargar();
      if (eliminados !== null) await cargarEliminados();
    }
  }

  async function verHistorial(d: DocumentoCliente) {
    if (historial?.id === d.id) {
      setHistorial(null);
      return;
    }

    const datos = await llamar<Historial>(`${base}/${d.id}/versiones`, { cache: "no-store" }, "No fue posible leer el historial.");

    if (datos) setHistorial({ id: d.id, datos });
  }

  async function recuperar(d: DocumentoCliente, version: number) {
    if (!window.confirm(`¿Recuperar la versión ${version}? Pasará a ser la vigente; la versión actual se conserva en el historial.`)) return;

    if ((await llamar(`${base}/${d.id}/versiones/${version}/recuperar`, { method: "POST" }, "No fue posible recuperar la versión.")) !== null) {
      onAviso(`Versión ${version} recuperada.`);
      await onRecargar();
      setHistorial(null);
    }
  }

  async function cargarEliminados() {
    const datos = await llamar<{ documentos: Eliminado[] }>(`${base}?eliminados=1`, { cache: "no-store" }, "No fue posible leer los documentos eliminados.");

    if (datos) setEliminados(datos.documentos ?? []);
  }

  async function restaurar(d: Eliminado) {
    if ((await llamar(`${base}/${d.id}/restaurar`, { method: "POST" }, "No fue posible restaurar el documento.")) !== null) {
      onAviso("Documento restaurado.");
      await onRecargar();
      await cargarEliminados();
    }
  }

  return (
    <section>
      <div className={styles.sectionTitle}>
        <div>
          <h3>Documentos comerciales</h3>
        </div>
        <span>
          <button
            className={styles.removeButton}
            disabled={ocupado}
            onClick={() => (eliminados === null ? void cargarEliminados() : setEliminados(null))}
            type="button"
          >
            {eliminados === null ? "Ver eliminados" : "Ocultar eliminados"}
          </button>{" "}
          <button className={styles.addButton} disabled={ocupado || nuevo !== null} onClick={() => setNuevo(borradorVacio())} type="button">
            + Agregar documento
          </button>
        </span>
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
              {d.tieneArchivo ? ` · v${d.version}` : ""}
            </strong>
            <span>
              {d.tieneArchivo ? (
                <>
                  <button className={styles.removeButton} disabled={ocupado} onClick={() => void verHistorial(d)} type="button">
                    {historial?.id === d.id ? "Ocultar historial" : "Historial"}
                  </button>{" "}
                </>
              ) : null}
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
                    onAviso(editando.borrador.archivo ? "Nueva versión cargada (la anterior se conserva en el historial)." : "Documento actualizado.");
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

          {historial?.id === d.id ? (
            <div>
              <strong>Versiones</strong>
              <ul>
                {historial.datos.versiones.map((v) => (
                  <li key={v.version}>
                    v{v.version}
                    {v.version === historial.datos.versionVigente ? " (vigente)" : ""} ·{" "}
                    <a download href={`${base}/${d.id}?version=${v.version}`}>
                      {v.nombreArchivo}
                    </a>{" "}
                    · {tamanoLegible(v.tamanoBytes)} · {v.subidoEn}
                    {v.version !== historial.datos.versionVigente ? (
                      <>
                        {" "}
                        <button className={styles.removeButton} disabled={ocupado} onClick={() => void recuperar(d, v.version)} type="button">
                          Recuperar esta versión
                        </button>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
              <strong>Auditoría</strong>
              <ul>
                {historial.datos.eventos.map((e, k) => (
                  <li key={k}>
                    {e.cuando} · {ACCIONES[e.accion] ?? e.accion}
                    {e.version ? ` (v${e.version})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </article>
      ))}

      {eliminados !== null ? (
        <section>
          <h4>Documentos eliminados (el archivo y su historial se conservan)</h4>
          {eliminados.length === 0 ? <p className={styles.emptyHint}>No hay documentos eliminados.</p> : null}
          {eliminados.map((d) => (
            <article className={styles.repeated} key={d.id}>
              <div className={styles.repeatedHead}>
                <strong>
                  {etiquetaTipo(d.tipo)} · v{d.version}
                </strong>
                <button className={styles.removeButton} disabled={ocupado} onClick={() => void restaurar(d)} type="button">
                  Restaurar
                </button>
              </div>
              <p>
                <a download href={`${base}/${d.id}`}>
                  {d.nombreArchivo}
                </a>
                {d.tamanoBytes ? ` · ${tamanoLegible(d.tamanoBytes)}` : ""} · eliminado {d.eliminadoEn}
              </p>
            </article>
          ))}
        </section>
      ) : null}
    </section>
  );
}
