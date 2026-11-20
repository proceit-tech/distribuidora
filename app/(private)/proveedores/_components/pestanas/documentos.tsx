"use client";

import { useEffect, useState } from "react";

import { ACCEPT_ARCHIVOS, EXTENSIONES_TEXTO, TAMANO_MAXIMO_BYTES, tamanoLegible, validarNombreYTamano } from "@/lib/almacenamiento/archivos-reglas";
import { documentoPendienteVacio, formDataDeDocumento, type DocumentoPendiente } from "@/lib/proveedores/documento-pendiente";
import { ErrorValidacion } from "@/lib/proveedores/errores";
import { isoALocal } from "@/lib/proveedores/fechas";
import { idCampo } from "@/lib/proveedores/pestanas";
import { EVENTO_TEXTO, TIPO_DOCUMENTO_TEXTO } from "@/lib/proveedores/textos";
import type { ProveedorDocumento } from "@/types/proveedores";

import { Campo, Fecha, Selector, SinRegistros, Texto, type Errores } from "../campos";
import type { ContextoFormulario } from "../contexto";
import styles from "../proveedor-form.module.css";

const TIPOS: Array<[string, string]> = Object.entries(TIPO_DOCUMENTO_TEXTO);

type Borrador = { tipo: string; fechaEmision: string; fechaVencimiento: string; observacion: string; archivo: File | null };
type Eliminado = { id: string; tipo: string; nombreArchivo: string; tamanoBytes: number | null; version: number; eliminadoEn: string };
type Historial = {
  versionVigente: number;
  versiones: Array<{ version: number; nombreArchivo: string; tamanoBytes: number; subidoEn: string; subidoPor: string }>;
  eventos: Array<{ accion: string; usuario: string; cuando: string }>;
};

export function CamposDocumento({ prefijo, valor, errores, alCambiar, archivoObligatorio }: { prefijo: string; valor: Borrador; errores: Errores; alCambiar: (b: Borrador) => void; archivoObligatorio: boolean }) {
  return (
    <>
      <div className={styles.gridFour}>
        <Selector etiqueta="Tipo *" campo={`${prefijo}.tipo`} errores={errores} valor={valor.tipo} alCambiar={(v) => alCambiar({ ...valor, tipo: v })} opciones={TIPOS} />
        <Campo etiqueta={archivoObligatorio ? "Archivo *" : "Nueva versión del archivo (opcional)"} campo={`${prefijo}.archivo`} errores={errores} ayuda={valor.archivo ? `${valor.archivo.name} · ${tamanoLegible(valor.archivo.size)}` : `${EXTENSIONES_TEXTO} · máx. ${TAMANO_MAXIMO_BYTES / 1024 / 1024} MB`}>
          <input id={idCampo(`${prefijo}.archivo`)} type="file" accept={ACCEPT_ARCHIVOS} onChange={(e) => alCambiar({ ...valor, archivo: e.target.files?.[0] ?? null })} />
        </Campo>
        <Fecha etiqueta="Fecha de emisión" campo={`${prefijo}.fechaEmision`} errores={errores} valor={valor.fechaEmision} alCambiar={(v) => alCambiar({ ...valor, fechaEmision: v })} />
        <Fecha etiqueta="Fecha de vencimiento" campo={`${prefijo}.fechaVencimiento`} errores={errores} valor={valor.fechaVencimiento} alCambiar={(v) => alCambiar({ ...valor, fechaVencimiento: v })} />
      </div>
      <div className={styles.gridTwo}>
        <Texto etiqueta="Observación" campo={`${prefijo}.observacion`} errores={errores} valor={valor.observacion} alCambiar={(v) => alCambiar({ ...valor, observacion: v })} maxLength={1000} />
      </div>
    </>
  );
}

/** Alta: los archivos se adjuntan ahora y se cargan al guardar el proveedor (la carga inicial queda abierta solo para su creador). */
function DocumentosAlta({ ctx }: { ctx: ContextoFormulario }) {
  const pendientes = ctx.pendientes;

  return (
    <>
      <div className={styles.sectionTitle}>
        <h3>Documentos</h3>
        <button type="button" className={styles.addButton} onClick={() => ctx.setPendientes([...pendientes, documentoPendienteVacio()])}>
          + Agregar documento
        </button>
      </div>

      <p className={styles.textoSecundario} style={{ margin: "0 0 10px" }}>Los archivos se cargan de forma privada al guardar el proveedor. {EXTENSIONES_TEXTO} · máx. {TAMANO_MAXIMO_BYTES / 1024 / 1024} MB por archivo.</p>

      {pendientes.length === 0 ? <SinRegistros texto="Aún no hay documentos adjuntos." /> : null}

      <div className={styles.repeaterList}>
        {pendientes.map((p, i) => (
          <article key={p.uid} className={styles.repeaterCard}>
            <header>
              <strong>Documento {i + 1}</strong>
              <button type="button" onClick={() => ctx.setPendientes(pendientes.filter((x) => x.uid !== p.uid))}>
                Quitar
              </button>
            </header>
            <CamposDocumento prefijo={`documentos.${i}`} valor={p} errores={ctx.errores} archivoObligatorio alCambiar={(b) => ctx.setPendientes(pendientes.map((x) => (x.uid === p.uid ? { ...x, ...b } : x)))} />
          </article>
        ))}
      </div>
    </>
  );
}

function DocumentosFicha({ ctx }: { ctx: ContextoFormulario }) {
  const d = ctx.detalle;
  const [nuevo, setNuevo] = useState<DocumentoPendiente | null>(null);
  const [editando, setEditando] = useState<{ id: string; borrador: Borrador } | null>(null);
  const [historial, setHistorial] = useState<{ id: string; datos: Historial } | null>(null);
  const [eliminados, setEliminados] = useState<Eliminado[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<ErrorValidacion | null>(null);
  const [aviso, setAviso] = useState("");
  const hayBorrador = nuevo !== null || editando !== null;
  const marcarBorrador = ctx.marcarBorradorDocumento;

  // PRV-M03: el borrador vive en esta pestaña; se informa al formulario para protegerlo (cambio de pestaña, Volver/Cancelar, cierre).
  useEffect(() => {
    marcarBorrador(hayBorrador);

    return () => marcarBorrador(false);
  }, [hayBorrador, marcarBorrador]);

  if (!d) return null;

  const proveedorId = d.id;
  const permisos = d.permisosDocumentos;
  const base = `/api/proveedores/${proveedorId}/documentos`;
  const errores: Errores = error?.campo ? { [error.campo]: error.message } : {};

  async function llamar<T = Record<string, unknown>>(url: string, init: RequestInit, falloPorDefecto: string): Promise<T | null> {
    setOcupado(true);
    setError(null);
    setAviso("");

    try {
      const r = await fetch(url, init);
      const j = (await r.json().catch(() => ({}))) as { error?: string } & T;

      if (!r.ok) {
        setError(new ErrorValidacion(j.error ?? falloPorDefecto));

        return null;
      }

      return j;
    } catch {
      setError(new ErrorValidacion("Error de conexión."));

      return null;
    } finally {
      setOcupado(false);
    }
  }

  /** Cada acción se aplica de inmediato en el servidor y luego se relee la ficha (no depende del «Actualizar proveedor»). */
  async function terminar(mensaje: string) {
    setAviso(mensaje);
    ctx.recargar();
  }

  async function guardar(url: string, metodo: "POST" | "PUT", b: Borrador, prefijo: string): Promise<boolean> {
    let datos: FormData;

    try {
      if (b.archivo) {
        const e = validarNombreYTamano(b.archivo.name, b.archivo.size);

        if (e) throw new ErrorValidacion(e, `${prefijo}.archivo`);
      }

      datos = formDataDeDocumento({ uid: "", ...b }, 0);
    } catch (e) {
      setError(e instanceof ErrorValidacion ? new ErrorValidacion(e.message, e.campo?.replace(/^documentos\.0\./, `${prefijo}.`) ?? null) : new ErrorValidacion("Datos no válidos."));

      return false;
    }

    return (await llamar(url, { method: metodo, body: datos }, "No fue posible guardar el documento.")) !== null;
  }

  async function eliminar(doc: ProveedorDocumento) {
    if (!window.confirm(`¿Eliminar el documento «${doc.nombreArchivo}»? Se oculta de la lista, pero el archivo, su historial y la auditoría se conservan y puede restaurarse.`)) return;

    if ((await llamar(`${base}/${doc.id}`, { method: "DELETE" }, "No fue posible eliminar el documento.")) !== null) await terminar("Documento eliminado (el archivo y su historial se conservan).");
  }

  async function verHistorial(doc: ProveedorDocumento) {
    if (historial?.id === doc.id) {
      setHistorial(null);

      return;
    }

    const datos = await llamar<Historial>(`${base}/${doc.id}/versiones`, { cache: "no-store" }, "No fue posible leer el historial.");

    if (datos) setHistorial({ id: doc.id, datos });
  }

  async function recuperar(doc: ProveedorDocumento, version: number) {
    if (!window.confirm(`¿Recuperar la versión ${version}? Pasará a ser la vigente; la versión actual se conserva en el historial.`)) return;

    if ((await llamar(`${base}/${doc.id}/versiones/${version}/recuperar`, { method: "POST" }, "No fue posible recuperar la versión.")) !== null) await terminar(`Versión ${version} recuperada.`);
  }

  async function cargarEliminados() {
    const datos = await llamar<{ documentos: Eliminado[] }>(`${base}?eliminados=1`, { cache: "no-store" }, "No fue posible leer los documentos eliminados.");

    if (datos) setEliminados(datos.documentos ?? []);
  }

  async function restaurar(doc: Eliminado) {
    if ((await llamar(`${base}/${doc.id}/restaurar`, { method: "POST" }, "No fue posible restaurar el documento.")) !== null) await terminar("Documento restaurado.");
  }

  const confirmarPerdida = () => !ctx.sucio || window.confirm("Hay cambios sin guardar en el formulario: la acción recarga la ficha y se perderían. ¿Desea continuar?");

  return (
    <>
      <div className={styles.sectionTitle}>
        <h3>Documentos</h3>
        <span style={{ display: "flex", gap: 8 }}>
          {permisos.historial ? (
            <button type="button" className={styles.cancelButton} disabled={ocupado} onClick={() => (eliminados === null ? void cargarEliminados() : setEliminados(null))}>
              {eliminados === null ? "Ver eliminados" : "Ocultar eliminados"}
            </button>
          ) : null}
          {permisos.cargar ? (
            <button type="button" className={styles.addButton} disabled={ocupado || nuevo !== null} onClick={() => setNuevo(documentoPendienteVacio())}>
              + Agregar documento
            </button>
          ) : null}
        </span>
      </div>

      {error ? (
        <div className={styles.error} role="alert" style={{ margin: "0 0 10px" }}>
          {error.message}
        </div>
      ) : null}
      {aviso ? (
        <p className={styles.textoSecundario} role="status" style={{ margin: "0 0 10px" }}>
          {aviso}
        </p>
      ) : null}

      {nuevo ? (
        <article className={styles.repeaterCard}>
          <header>
            <strong>Nuevo documento</strong>
            <button type="button" disabled={ocupado} onClick={() => setNuevo(null)}>
              Cancelar
            </button>
          </header>
          <CamposDocumento prefijo="nuevo" valor={nuevo} errores={errores} archivoObligatorio alCambiar={(b) => setNuevo({ ...nuevo, ...b })} />
          <div className={styles.acciones}>
            <button
              type="button"
              className={styles.saveButton}
              disabled={ocupado}
              onClick={async () => {
                if (!nuevo.archivo) {
                  setError(new ErrorValidacion("Seleccione el archivo del documento.", "documentos.nuevo.archivo"));

                  return;
                }
                if (!confirmarPerdida()) return;
                if (await guardar(base, "POST", nuevo, "nuevo")) {
                  setNuevo(null);
                  await terminar("Documento cargado.");
                }
              }}
            >
              {ocupado ? "Cargando..." : "Cargar documento"}
            </button>
          </div>
        </article>
      ) : null}

      {d.documentos.length === 0 && !nuevo ? <SinRegistros texto="Este proveedor no tiene documentos registrados." /> : null}

      <div className={styles.repeaterList}>
        {d.documentos.map((doc, i) => (
          <article key={doc.id} className={styles.repeaterCard}>
            <header>
              <strong>
                Documento {i + 1} · {TIPO_DOCUMENTO_TEXTO[doc.tipo] ?? doc.tipo}
                {doc.tieneArchivo ? ` · v${doc.version}` : ""}
              </strong>
              <span style={{ display: "flex", gap: 8 }}>
                {permisos.historial && doc.tieneArchivo ? (
                  <button type="button" disabled={ocupado} onClick={() => void verHistorial(doc)}>
                    {historial?.id === doc.id ? "Ocultar historial" : "Historial"}
                  </button>
                ) : null}
                {permisos.gestionar ? (
                  <>
                    <button type="button" disabled={ocupado} onClick={() => setEditando({ id: doc.id, borrador: { tipo: doc.tipo, fechaEmision: isoALocal(doc.fechaEmision), fechaVencimiento: isoALocal(doc.fechaVencimiento), observacion: doc.observacion, archivo: null } })}>
                      Editar
                    </button>
                    <button type="button" disabled={ocupado} onClick={() => void eliminar(doc)}>
                      Eliminar
                    </button>
                  </>
                ) : null}
              </span>
            </header>

            {editando?.id === doc.id ? (
              <>
                <CamposDocumento prefijo="editar" valor={editando.borrador} errores={errores} archivoObligatorio={false} alCambiar={(borrador) => setEditando({ id: doc.id, borrador })} />
                <div className={styles.acciones}>
                  <button
                    type="button"
                    className={styles.saveButton}
                    disabled={ocupado}
                    onClick={async () => {
                      if (!confirmarPerdida()) return;
                      if (await guardar(`${base}/${doc.id}`, "PUT", editando.borrador, "editar")) {
                        setEditando(null);
                        await terminar(editando.borrador.archivo ? "Nueva versión cargada (la anterior se conserva en el historial)." : "Documento actualizado.");
                      }
                    }}
                  >
                    {ocupado ? "Guardando..." : "Guardar cambios del documento"}
                  </button>
                  <button type="button" className={styles.cancelButton} disabled={ocupado} onClick={() => setEditando(null)}>
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <p className={styles.textoSecundario} style={{ margin: "0 0 12px" }}>
                {doc.tieneArchivo ? (
                  <a download href={`${base}/${doc.id}`}>
                    {doc.nombreArchivo}
                  </a>
                ) : (
                  <>
                    {doc.nombreArchivo} ·{" "}
                    <a href={/^https?:[/][/]/i.test(doc.urlArchivo) ? doc.urlArchivo : undefined} rel="noopener noreferrer" target="_blank">
                      enlace anterior
                    </a>{" "}
                    (sin archivo almacenado{permisos.gestionar ? ": edite el documento para cargar el archivo" : ""})
                  </>
                )}
                {doc.tamanoBytes ? ` · ${tamanoLegible(doc.tamanoBytes)}` : ""}
                {doc.fechaEmision ? ` · Emisión ${isoALocal(doc.fechaEmision)}` : ""}
                {doc.fechaVencimiento ? ` · Vence ${isoALocal(doc.fechaVencimiento)}` : ""}
                {doc.observacion ? ` · ${doc.observacion}` : ""}
              </p>
            )}

            {historial?.id === doc.id ? (
              <div className={styles.textoSecundario} style={{ marginBottom: 12 }}>
                <strong>Versiones</strong>
                <ul style={{ margin: "4px 0 8px", paddingLeft: 18 }}>
                  {historial.datos.versiones.map((v) => (
                    <li key={v.version}>
                      v{v.version}
                      {v.version === historial.datos.versionVigente ? " (vigente)" : ""} ·{" "}
                      <a download href={`${base}/${doc.id}?version=${v.version}`}>
                        {v.nombreArchivo}
                      </a>{" "}
                      · {tamanoLegible(v.tamanoBytes)} · {v.subidoEn}
                      {v.subidoPor ? ` · ${v.subidoPor}` : ""}
                      {v.version !== historial.datos.versionVigente ? (
                        <>
                          {" "}
                          <button type="button" className={styles.eliminar} disabled={ocupado} onClick={() => void recuperar(doc, v.version)}>
                            Recuperar esta versión
                          </button>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <strong>Auditoría</strong>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {historial.datos.eventos.map((e, k) => (
                    <li key={k}>
                      {e.cuando} · {EVENTO_TEXTO[e.accion] ?? e.accion}
                      {e.usuario ? ` · ${e.usuario}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {eliminados !== null ? (
        <section className={styles.bloque}>
          <h4>Documentos eliminados (el archivo y su historial se conservan)</h4>
          {eliminados.length === 0 ? <p className={styles.textoSecundario}>No hay documentos eliminados.</p> : null}
          {eliminados.map((doc) => (
            <p key={doc.id} className={styles.textoSecundario}>
              {TIPO_DOCUMENTO_TEXTO[doc.tipo] ?? doc.tipo} · v{doc.version} ·{" "}
              <a download href={`${base}/${doc.id}?version=${doc.version}`}>
                {doc.nombreArchivo}
              </a>
              {doc.tamanoBytes ? ` · ${tamanoLegible(doc.tamanoBytes)}` : ""} · eliminado {doc.eliminadoEn}{" "}
              {permisos.gestionar ? (
                <button type="button" className={styles.eliminar} disabled={ocupado} onClick={() => void restaurar(doc)}>
                  Restaurar
                </button>
              ) : null}
            </p>
          ))}
        </section>
      ) : null}

      {!permisos.cargar && d.documentos.length === 0 ? <p className={styles.textoSecundario}>Para cargar documentos se necesita el permiso de edición de proveedores.</p> : null}
    </>
  );
}

export function PestanaDocumentos({ ctx }: { ctx: ContextoFormulario }) {
  return ctx.modo === "crear" ? <DocumentosAlta ctx={ctx} /> : <DocumentosFicha ctx={ctx} />;
}
