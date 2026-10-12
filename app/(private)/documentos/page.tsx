"use client";

import { Fragment, useEffect, useState } from "react";

import { CampoFecha } from "@/components/ui/campo-fecha";
import ui from "@/components/ui/lista-padrao/lista.module.css";
import { siguienteOrden, type Orden } from "@/components/ui/lista-padrao/orden";
import { ThOrdenable } from "@/components/ui/lista-padrao/th-ordenable";
import {
  ESTADOS_SIFEN,
  ETIQUETA_EMAIL,
  ETIQUETA_LOCAL,
  etiquetaIntento,
  ETIQUETA_RESULTADO_INTENTO,
  ETIQUETA_SIFEN,
  ETIQUETA_TIPO,
  TIPOS_DOCUMENTO,
  numeroDocumento,
  type EstadoEmail,
  type EstadoLocal,
  type EstadoSifen,
  type GrupoIndicador,
  type TipoDocumento,
} from "@/lib/facturacion/estados";
import { formatearFechaHoraPy } from "@/lib/formato/listas";

const PAGE_SIZE = 20;

type CampoOrden = "fecha" | "numero" | "cliente" | "total" | "estado";
type Documento = {
  id: string; tipo: TipoDocumento; establecimiento: string; puntoExpedicion: string; numero: string; serie: string | null; cdc: string | null; fechaEmision: string;
  sucursalNombre: string; receptorNombre: string; receptorDocumento: string | null; moneda: string; total: string; estadoLocal: EstadoLocal; estadoSifen: EstadoSifen;
  estadoEmail: EstadoEmail; estadoGatewayTexto: string | null; codRespuesta: string | null; mensajeRespuesta: string | null; fechaFirma: string | null; fechaEnvio: string | null;
  ultimaConsultaAt: string | null; ultimaConsultaResultado: string | null; lote: string | null; envioErrorTipo: "AUTENTICACION" | "RECHAZO" | "TRANSITORIO" | null;
};
type Intento = { id: string; tipo: string; fase: string | null; lote: string | null; cdcInformado: string | null; resultado: string; httpStatus: number | null; estadoGateway: string | null; estadoSifen: string | null; codRespuesta: string | null; mensaje: string | null; creadoAt: string; actorNombre: string };
type Respuesta = {
  documentos: Documento[]; total: number; pagina: number; totalPaginas: number; resumen: Record<string, number>; sucursales: Array<{ id: string; nombre: string }>; permisos: { editar: boolean; crear: boolean };
};
type Detalle = { cargando: boolean; error: string; intentos: Intento[]; aviso: string; consultando: boolean };

const DETALLE_VACIO: Detalle = { cargando: false, error: "", intentos: [], aviso: "", consultando: false };

const INDICADORES: Array<{ grupo: GrupoIndicador | ""; titulo: string; ayuda: string; clase: string }> = [
  { grupo: "", titulo: "Total", ayuda: "Documentos visibles", clase: ui.summaryTeal },
  { grupo: "PEND_ENVIO", titulo: "Pendientes de envío", ayuda: "Aún sin recibir el gateway", clase: ui.summaryAmber },
  { grupo: "PEND_RESPUESTA", titulo: "Pendientes de respuesta", ayuda: "Enviados, sin respuesta SIFEN", clase: ui.summaryBlue },
  { grupo: "APROBADO", titulo: "Aprobados", ayuda: "Estado SIFEN aprobado", clase: ui.summaryTeal },
  { grupo: "RECHAZADO", titulo: "Rechazados", ayuda: "Estado SIFEN rechazado", clase: ui.summaryRed },
  { grupo: "EMAIL_ENVIADO", titulo: "E-mail enviado", ayuda: "Según el proveedor", clase: ui.summaryViolet },
  { grupo: "EMAIL_ERROR", titulo: "Error de e-mail", ayuda: "Según el proveedor", clase: ui.summaryRed },
  { grupo: "SIN_EMAIL", titulo: "Sin e-mail", ayuda: "Sin información de envío", clase: ui.summaryAmber },
];

const claseSifen = (e: EstadoSifen) => (e === "APROBADO" ? ui.statusActive : e === "RECHAZADO" || e === "CANCELADO" || e === "INUTILIZADO" ? ui.statusDanger : e === "PENDIENTE" ? ui.statusWarning : ui.statusInfo);
const claseLocal = (e: EstadoLocal) => (e === "ENVIADO" ? ui.statusActive : e === "ERROR_ENVIO" ? ui.statusDanger : ui.statusWarning);
const claseEmail = (e: EstadoEmail) => (e === "ENVIADO" ? ui.statusActive : e === "ERROR" ? ui.statusDanger : e === "PENDIENTE" ? ui.statusWarning : ui.statusInfo);
const fechaHora = (v: string) => formatearFechaHoraPy(v);
// Fechas que informa el gateway como texto (sin zona): se reordenan a dd/MM/yyyy sin convertir la hora.
const fechaGateway = (v: string | null) => {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?/.exec(v) : null;

  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}` : ""}` : (v ?? "—");
};
const importe = (d: Documento) => `${Number(d.total).toLocaleString("es-PY", { maximumFractionDigits: d.moneda === "PYG" ? 0 : 2 })} ${d.moneda}`;

async function leerJson<T>(r: Response, porDefecto: string): Promise<T> {
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };

  if (!r.ok) throw new Error(j.error ?? porDefecto);

  return j;
}

export default function DocumentosPage() {
  const [busqueda, setBusqueda] = useState("");
  const [busquedaAplicada, setBusquedaAplicada] = useState("");
  const [tipo, setTipo] = useState("");
  const [sucursal, setSucursal] = useState("");
  const [estadoSifen, setEstadoSifen] = useState("");
  const [grupo, setGrupo] = useState<GrupoIndicador | "">("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [orden, setOrden] = useState<Orden<CampoOrden>>(null);
  const [paginacion, setPaginacion] = useState({ clave: "", pagina: 1 });
  const [recarga, setRecarga] = useState(0);
  const [resultado, setResultado] = useState<{ clave: string; datos: Respuesta | null; error: string } | null>(null);
  const [abiertos, setAbiertos] = useState<Record<string, Detalle>>({});

  useEffect(() => {
    const t = window.setTimeout(() => setBusquedaAplicada(busqueda.trim()), 300);

    return () => window.clearTimeout(t);
  }, [busqueda]);

  const claveFiltros = JSON.stringify([busquedaAplicada, tipo, sucursal, estadoSifen, grupo, desde, hasta, orden]);
  const pagina = paginacion.clave === claveFiltros ? paginacion.pagina : 1;
  const claveConsulta = JSON.stringify([claveFiltros, pagina, recarga]);

  useEffect(() => {
    let activo = true;
    const p = new URLSearchParams({ pagina: String(pagina), tamano: String(PAGE_SIZE) });

    for (const [k, v] of Object.entries({ q: busquedaAplicada, tipo, sucursal, estadoSifen, grupo, desde, hasta, orden: orden?.campo ?? "", dir: orden?.dir ?? "" })) if (v) p.set(k, v);

    fetch(`/api/documentos?${p.toString()}`, { cache: "no-store" })
      .then((r) => leerJson<Respuesta>(r, "No fue posible cargar los documentos electrónicos."))
      .then((datos) => activo && setResultado({ clave: claveConsulta, datos, error: "" }))
      .catch((e: unknown) => activo && setResultado({ clave: claveConsulta, datos: null, error: e instanceof Error ? e.message : "No fue posible cargar los documentos electrónicos." }));

    return () => {
      activo = false;
    };
    // claveConsulta resume todos los filtros que intervienen en la consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveConsulta]);

  const cargando = resultado?.clave !== claveConsulta;
  const datos = resultado?.datos ?? null;
  const errorCarga = resultado?.error ?? "";
  const filas = datos?.documentos ?? [];
  const resumen = datos?.resumen ?? {};
  const paginaMostrada = datos?.pagina ?? pagina;
  const totalPaginas = datos?.totalPaginas ?? 1;
  const total = datos?.total ?? 0;
  const hayFiltros = busquedaAplicada !== "" || tipo !== "" || sucursal !== "" || estadoSifen !== "" || grupo !== "" || desde !== "" || hasta !== "";
  const editar = datos?.permisos.editar === true;
  const crear = datos?.permisos.crear === true;

  function cambiarOrden(campo: CampoOrden) {
    setOrden((actual) => siguienteOrden(actual, campo));
  }

  function limpiar() {
    setBusqueda("");
    setBusquedaAplicada("");
    setTipo("");
    setSucursal("");
    setEstadoSifen("");
    setGrupo("");
    setDesde("");
    setHasta("");
  }

  function actualizarDetalle(id: string, parte: Partial<Detalle>) {
    setAbiertos((a) => ({ ...a, [id]: { ...DETALLE_VACIO, ...a[id], ...parte } }));
  }

  async function alternar(d: Documento) {
    if (abiertos[d.id]) {
      setAbiertos((a) => Object.fromEntries(Object.entries(a).filter(([k]) => k !== d.id)));

      return;
    }

    actualizarDetalle(d.id, { cargando: true });
    try {
      const j = await leerJson<{ intentos: Intento[] }>(await fetch(`/api/documentos/${d.id}`, { cache: "no-store" }), "No fue posible cargar el detalle.");

      actualizarDetalle(d.id, { cargando: false, intentos: j.intentos });
    } catch (e) {
      actualizarDetalle(d.id, { cargando: false, error: e instanceof Error ? e.message : "No fue posible cargar el detalle." });
    }
  }

  async function reconsultar(d: Documento) {
    actualizarDetalle(d.id, { consultando: true, aviso: "", error: "" });
    try {
      const j = await leerJson<{ resultado: string; mensaje: string | null; intentos: Intento[] }>(await fetch(`/api/documentos/${d.id}/consultar`, { method: "POST" }), "No fue posible consultar el estado.");

      actualizarDetalle(d.id, { consultando: false, intentos: j.intentos, aviso: `${ETIQUETA_RESULTADO_INTENTO[j.resultado] ?? j.resultado}${j.mensaje ? `: ${j.mensaje}` : ""}` });
      setRecarga((n) => n + 1);
    } catch (e) {
      actualizarDetalle(d.id, { consultando: false, error: e instanceof Error ? e.message : "No fue posible consultar el estado." });
    }
  }

  async function enviarAlGateway(d: Documento, confirmarRechazo = false) {
    if (confirmarRechazo && !window.confirm("El gateway rechazó este documento por validación. Reenviar el MISMO contenido solo tiene sentido si ya se corrigió la causa en el gateway. No se generará un número nuevo. ¿Reenviar?")) return;

    actualizarDetalle(d.id, { consultando: true, aviso: "", error: "" });
    try {
      const j = await leerJson<{ resultado: string; mensaje: string | null; http: number | null; lote: string | null; errores: string[]; intentos: Intento[] }>(
        await fetch(`/api/documentos/${d.id}/enviar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmarRechazo }) }),
        "No fue posible enviar el documento.",
      );
      const partes = [etiquetaIntento("ENVIO", j.resultado), j.http ? `HTTP ${j.http}` : "", j.lote ? `lote ${j.lote}` : "", j.mensaje ?? "", ...j.errores].filter(Boolean);

      actualizarDetalle(d.id, { consultando: false, intentos: j.intentos, aviso: partes.join(" · ") });
      setRecarga((n) => n + 1);
    } catch (e) {
      actualizarDetalle(d.id, { consultando: false, error: e instanceof Error ? e.message : "No fue posible enviar el documento." });
    }
  }

  const setPagina = (valor: number) => setPaginacion({ clave: claveFiltros, pagina: Math.max(1, valor) });

  return (
    <section className={ui.page}>
      <header className={ui.topbar}>
        <div className={ui.titleBlock}>
          <nav className={ui.breadcrumb} aria-label="Ruta de navegación">
            <span>Facturación</span>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Documentos electrónicos</span>
          </nav>

          <h1>Documentos electrónicos</h1>
        </div>
      </header>

      <section className={ui.summaryGrid} aria-label="Indicadores de documentos">
        {INDICADORES.map((i) => (
          <button
            key={i.titulo}
            type="button"
            className={[ui.summaryCard, i.clase].join(" ")}
            style={{ textAlign: "left", cursor: "pointer", outline: grupo === i.grupo ? "2px solid currentColor" : undefined }}
            aria-pressed={grupo === i.grupo}
            onClick={() => setGrupo(i.grupo)}
          >
            <span>{i.titulo}</span>
            <strong>{i.grupo === "" ? (resumen.total ?? 0) : (resumen[i.grupo] ?? 0)}</strong>
            <small>{i.ayuda}</small>
          </button>
        ))}
      </section>

      <section className={ui.contentCard}>
        <div className={ui.toolbar}>
          <label className={ui.search}>
            <span aria-hidden="true">⌕</span>
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por número, CDC, RUC o cliente..." aria-label="Buscar documentos" />
          </label>

          <label className={ui.filterField}>
            <span>Tipo</span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Todos</option>
              {TIPOS_DOCUMENTO.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TIPO[t]}
                </option>
              ))}
            </select>
          </label>

          <label className={ui.filterField}>
            <span>Sucursal</span>
            <select value={sucursal} onChange={(e) => setSucursal(e.target.value)}>
              <option value="">Todas</option>
              {(datos?.sucursales ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className={ui.filterField}>
            <span>Estado SIFEN</span>
            <select value={estadoSifen} onChange={(e) => setEstadoSifen(e.target.value)}>
              <option value="">Todos</option>
              {ESTADOS_SIFEN.map((s) => (
                <option key={s} value={s}>
                  {ETIQUETA_SIFEN[s]}
                </option>
              ))}
            </select>
          </label>

          <label className={ui.filterField}>
            <span>Emisión desde</span>
            <CampoFecha valor={desde} alCambiar={setDesde} />
          </label>

          <label className={ui.filterField}>
            <span>Emisión hasta</span>
            <CampoFecha valor={hasta} alCambiar={setHasta} />
          </label>

          <button type="button" className={ui.clearButton} onClick={limpiar}>
            Limpiar filtros
          </button>

          <span className={ui.resultCount} aria-live="polite">
            {datos ? `${total} documento(s)` : ""}
          </span>
        </div>

        {errorCarga && !cargando ? (
          <div className={ui.alertError} role="alert" style={{ margin: "0 0 8px" }}>
            {errorCarga}{" "}
            <button type="button" className={ui.clearButton} onClick={() => setRecarga((n) => n + 1)}>
              Reintentar
            </button>
          </div>
        ) : null}

        <div className={ui.tableScroll}>
          <table className={ui.table} style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <ThOrdenable titulo="Documento" campo="numero" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Fecha" campo="fecha" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Cliente" campo="cliente" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Total" campo="total" orden={orden} onOrden={cambiarOrden} alinear="derecha" />
                <ThOrdenable titulo="Estados" campo="estado" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Acciones" alinear="derecha" />
              </tr>
            </thead>

            <tbody>
              {filas.map((d) => {
                const det = abiertos[d.id];

                return (
                  <Fragment key={d.id}>
                    <tr className={ui.row}>
                      <td>
                        <div className={ui.cell}>
                          <strong className={ui.mono}>{numeroDocumento(d)}</strong>
                          <span>{ETIQUETA_TIPO[d.tipo]} · {d.sucursalNombre}</span>
                        </div>
                      </td>
                      <td>{fechaHora(d.fechaEmision)}</td>
                      <td>
                        <div className={ui.cell}>
                          <strong>{d.receptorNombre}</strong>
                          <span>{d.receptorDocumento ?? "Sin documento"}</span>
                        </div>
                      </td>
                      <td className={ui.numeric}>
                        <strong className={ui.mono}>{importe(d)}</strong>
                      </td>
                      <td>
                        <div className={ui.statuses}>
                          <span className={claseSifen(d.estadoSifen)} title="Estado informado por SIFEN/gateway">SIFEN: {ETIQUETA_SIFEN[d.estadoSifen]}</span>
                          <span className={claseLocal(d.estadoLocal)} title="Estado del envío al gateway">Envío: {ETIQUETA_LOCAL[d.estadoLocal]}</span>
                          <span className={claseEmail(d.estadoEmail)} title="Estado del e-mail al cliente">{ETIQUETA_EMAIL[d.estadoEmail]}</span>
                        </div>
                      </td>
                      <td className={ui.actionsCell}>
                        <button type="button" className={ui.detailButton} aria-expanded={Boolean(det)} onClick={() => alternar(d)}>
                          {det ? "Ocultar detalle" : "Ver detalle"}
                          <span aria-hidden="true">{det ? "˄" : "˅"}</span>
                        </button>
                      </td>
                    </tr>

                    {det ? (
                      <tr>
                        <td colSpan={6} style={{ background: "var(--surface-muted, #f6f8f8)" }}>
                          <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "6px 16px", margin: "6px 0" }}>
                            <div><dt className={ui.muted}>CDC</dt><dd className={ui.mono} style={{ overflowWrap: "anywhere", margin: 0 }}>{d.cdc ?? "Aún no informado"}</dd></div>
                            <div><dt className={ui.muted}>Estado informado</dt><dd style={{ margin: 0 }}>{d.estadoGatewayTexto ?? "—"}</dd></div>
                            <div><dt className={ui.muted}>Último mensaje SIFEN</dt><dd style={{ margin: 0 }}>{d.codRespuesta ? `${d.codRespuesta} · ` : ""}{d.mensajeRespuesta ?? "—"}</dd></div>
                            <div><dt className={ui.muted}>Lote</dt><dd style={{ margin: 0 }}>{d.lote ?? "No informado"}</dd></div>
                            <div><dt className={ui.muted}>Fecha de firma</dt><dd style={{ margin: 0 }}>{fechaGateway(d.fechaFirma)}</dd></div>
                            <div><dt className={ui.muted}>Fecha de envío</dt><dd style={{ margin: 0 }}>{fechaGateway(d.fechaEnvio)}</dd></div>
                            <div><dt className={ui.muted}>Última consulta</dt><dd style={{ margin: 0 }}>{d.ultimaConsultaAt ? `${fechaHora(d.ultimaConsultaAt)} · ${ETIQUETA_RESULTADO_INTENTO[d.ultimaConsultaResultado ?? ""] ?? d.ultimaConsultaResultado}` : "Nunca consultado"}</dd></div>
                          </dl>

                          <p className={ui.muted} style={{ margin: "4px 0" }}>PDF/KuDE y XML: descarga no disponible (endpoint del proveedor sin confirmar).</p>

                          {crear && (d.estadoLocal === "PENDIENTE_ENVIO" || (d.estadoLocal === "ERROR_ENVIO" && d.envioErrorTipo !== "RECHAZO")) ? (
                            <button type="button" className={ui.primaryButton} disabled={det.consultando} onClick={() => enviarAlGateway(d)}>
                              {det.consultando ? "Enviando..." : "Enviar al gateway"}
                            </button>
                          ) : null}
                          {crear && d.estadoLocal === "ERROR_ENVIO" && d.envioErrorTipo === "RECHAZO" ? (
                            <button type="button" className={ui.secondaryButton} disabled={det.consultando} onClick={() => enviarAlGateway(d, true)}>
                              {det.consultando ? "Enviando..." : "Reenviar el mismo documento (confirmar)"}
                            </button>
                          ) : null}
                          {d.estadoLocal === "ERROR_ENVIO" && d.envioErrorTipo === "RECHAZO" ? (
                            <p className={ui.alertError} role="alert">El gateway rechazó este documento por validación. Se conserva su número y el historial; no se genera otro número ni se reenvía automáticamente.</p>
                          ) : null}
                          {d.estadoLocal === "ENVIO_INDETERMINADO" ? (
                            <p className={ui.alertError} role="alert">El resultado del envío no está confirmado. Verifique el documento en el gateway antes de cualquier reenvío: Nexit no reenvía automáticamente un envío indeterminado.</p>
                          ) : null}{" "}
                          {editar ? (
                            <button type="button" className={ui.secondaryButton} disabled={det.consultando} onClick={() => reconsultar(d)}>
                              {det.consultando ? "Consultando..." : "Consultar estado en SIFEN"}
                            </button>
                          ) : null}
                          {det.aviso ? <div className={ui.alertOk} role="status" style={{ margin: "8px 0" }}>{det.aviso}</div> : null}
                          {det.error ? <div className={ui.alertError} role="alert" style={{ margin: "8px 0" }}>{det.error}</div> : null}

                          <h4 style={{ margin: "10px 0 4px", fontSize: 13.5 }}>Historial de consultas</h4>
                          {det.cargando ? (
                            <p className={ui.muted}>Cargando historial...</p>
                          ) : det.intentos.length === 0 ? (
                            <p className={ui.muted}>Sin consultas registradas.</p>
                          ) : (
                            <div className={ui.tableScroll}>
                              <table className={ui.table} style={{ minWidth: 560 }}>
                                <thead>
                                  <tr><th>Fecha</th><th>Intento</th><th>Resultado</th><th>HTTP</th><th>Estado informado</th><th>Realizado por</th></tr>
                                </thead>
                                <tbody>
                                  {det.intentos.map((i) => (
                                    <tr key={i.id} className={ui.row}>
                                      <td>{fechaHora(i.creadoAt)}</td>
                                      <td>{i.tipo === "ENVIO" ? "Envío" : "Consulta"}{i.fase ? ` · ${i.fase.toLowerCase()}` : ""}</td>
                                      <td>{etiquetaIntento(i.tipo, i.resultado)}{i.lote ? ` · lote ${i.lote}` : ""}{i.cdcInformado ? <><br /><small className={ui.muted}>CDC informado: {i.cdcInformado}</small></> : null}{i.mensaje ? <><br /><small className={ui.muted}>{i.mensaje}</small></> : null}</td>
                                      <td>{i.httpStatus ?? "—"}</td>
                                      <td>{i.estadoGateway ?? "—"}</td>
                                      <td>{i.actorNombre}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}

              {filas.length === 0 ? (
                <tr>
                  <td colSpan={6} className={ui.emptyCell}>
                    <div className={ui.empty}>
                      <strong>{cargando ? "Cargando documentos..." : errorCarga ? "No se pudo cargar el listado" : hayFiltros ? "No se encontraron documentos" : "Aún no hay documentos electrónicos"}</strong>
                      {!cargando && !errorCarga ? <span>{hayFiltros ? "Modifique los filtros." : "Los documentos emitidos desde Nexit aparecerán aquí."}</span> : null}
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <footer className={ui.pagination}>
          <span>
            Mostrando {total === 0 ? 0 : (paginaMostrada - 1) * PAGE_SIZE + 1}–{Math.min(paginaMostrada * PAGE_SIZE, total)} de {total} documento(s)
          </span>

          <div>
            <button type="button" aria-label="Página anterior" disabled={paginaMostrada <= 1 || cargando} onClick={() => setPagina(paginaMostrada - 1)}>
              ‹
            </button>
            <strong>
              {paginaMostrada} / {totalPaginas}
            </strong>
            <button type="button" aria-label="Página siguiente" disabled={paginaMostrada >= totalPaginas || cargando} onClick={() => setPagina(paginaMostrada + 1)}>
              ›
            </button>
          </div>
        </footer>
      </section>
    </section>
  );
}
