"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import ui from "@/components/ui/lista-padrao/lista.module.css";
import { numeracionSiguiente, textoNumeracion } from "@/lib/facturacion/series";

import estilos from "./page.module.css";

type Tipo = "FE" | "NCE" | "NRE" | "NDE" | "AFE";
type TipoConfigurado = { tipo: Tipo; serie: string | null; ultimoNumero: number; activo: boolean; proximo: string | null; emitible: boolean };
type Punto = { id: string; codigo: string; nombre: string; activo: boolean; tipos: TipoConfigurado[] };
type Sucursal = { id: string; nombre: string; establecimiento: string | null; puntos: Punto[] };

/** Una fila de la tabla = una configuración de tipo documental (o un punto todavía sin ningún tipo). */
type Fila = { clave: string; sucursal: Sucursal; punto: Punto; tipo: TipoConfigurado | null };

const TIPOS: Array<{ valor: Tipo; etiqueta: string }> = [
  { valor: "FE", etiqueta: "Factura electrónica (FE)" },
  { valor: "NCE", etiqueta: "Nota de crédito (NCE)" },
  { valor: "NRE", etiqueta: "Nota de remisión (NRE)" },
  { valor: "NDE", etiqueta: "Nota de débito (NDE)" },
  { valor: "AFE", etiqueta: "Autofactura (AFE)" },
];
const ETIQUETA: Record<Tipo, string> = { FE: "Factura electrónica", NCE: "Nota de crédito", NRE: "Nota de remisión", NDE: "Nota de débito", AFE: "Autofactura" };

async function pedir<T>(url: string, init: RequestInit | undefined, porDefecto: string): Promise<T> {
  const r = await fetch(url, init);
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };

  if (!r.ok) throw new Error(j.error ?? porDefecto);

  return j;
}

const JSON_POST = (cuerpo: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });

function numeroVista(serie: string | null, ultimo: number): string {
  return textoNumeracion(serie, ultimo);
}

/** Próximo REFERENCIAL de lo que se está escribiendo (el definitivo se reserva de forma atómica al emitir). */
function proximoDeEntrada(serie: string, ultimo: string): string {
  if (!/^\d{1,7}$/.test(ultimo) || Number(ultimo) > 9999999) return "—";
  if (serie !== "" && !/^[A-Z]{2}$/.test(serie)) return "—";

  const s = numeracionSiguiente(serie === "" ? null : serie, Number(ultimo));

  return s === null ? "Agotada" : textoNumeracion(s.serie, s.numero);
}

type DialogoPunto = { sucursalId: string; codigo: string; nombre: string };
type DialogoTipo = { puntoId: string; titulo: string; tipo: Tipo | ""; bloqueaTipo: boolean; serie: string; ultimo: string; confirma: boolean; activar: boolean; existente: boolean };

/**
 * Puntos de expedición (NEX-063; DECISION-PUNTOS-TIPOS-SERIES-2026-10-17): administración fiscal. El punto administrativo se registra una vez; cada tipo documental tiene su fila, su serie y su
 * contador independientes, con UNA confirmación del último número. La numeración nunca retrocede; el servidor y la función SQL vuelven a validar todo.
 */
export default function PuntosExpedicionPage() {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [version, setVersion] = useState(0);

  const [busqueda, setBusqueda] = useState("");
  const [filtroSucursal, setFiltroSucursal] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");

  const [dPunto, setDPunto] = useState<DialogoPunto | null>(null);
  const [dTipo, setDTipo] = useState<DialogoTipo | null>(null);
  const [errorDialogo, setErrorDialogo] = useState("");
  const [intento, setIntento] = useState(false);

  const recargar = useCallback(() => {
    setCargando(true);
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let activo = true;

    pedir<{ sucursales: Sucursal[] }>("/api/facturacion/puntos", { cache: "no-store" }, "No fue posible cargar los puntos de expedición.")
      .then((j) => {
        if (!activo) return;

        setSucursales(j.sucursales);
        setErrorCarga("");
      })
      .catch((e) => {
        if (activo) setErrorCarga(e instanceof Error ? e.message : "No fue posible cargar los puntos de expedición.");
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, [version]);

  const filas = useMemo<Fila[]>(() => {
    const out: Fila[] = [];

    for (const sucursal of sucursales) {
      for (const punto of sucursal.puntos) {
        if (punto.tipos.length === 0) out.push({ clave: `${punto.id}-sin-tipo`, sucursal, punto, tipo: null });
        else for (const tipo of punto.tipos) out.push({ clave: `${punto.id}-${tipo.tipo}`, sucursal, punto, tipo });
      }
    }

    return out;
  }, [sucursales]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();

    return filas.filter((f) => {
      if (filtroSucursal && f.sucursal.id !== filtroSucursal) return false;
      if (filtroTipo === "SIN_TIPO" ? f.tipo !== null : filtroTipo && f.tipo?.tipo !== filtroTipo) return false;

      const activa = f.punto.activo && (f.tipo?.activo ?? true);

      if (filtroEstado === "ACTIVOS" && !(f.tipo && activa)) return false;
      if (filtroEstado === "INACTIVOS" && f.tipo && activa) return false;
      if (q && !`${f.sucursal.establecimiento ?? ""} ${f.punto.codigo} ${f.punto.nombre} ${f.sucursal.nombre}`.toLowerCase().includes(q)) return false;

      return true;
    });
  }, [filas, busqueda, filtroSucursal, filtroTipo, filtroEstado]);

  const hayFiltros = busqueda !== "" || filtroSucursal !== "" || filtroTipo !== "" || filtroEstado !== "";

  async function ejecutar(accion: () => Promise<void>, ok: string, delDialogo = false) {
    setOcupado(true);
    setError("");
    setAviso("");
    setErrorDialogo("");
    try {
      await accion();
      setAviso(ok);
      recargar();
    } catch (e) {
      const m = e instanceof Error ? e.message : "No fue posible completar la operación.";

      if (delDialogo) setErrorDialogo(m);
      else setError(m);

      throw e;
    } finally {
      setOcupado(false);
    }
  }

  // ── Nuevo punto ──
  const codigoOk = (c: string) => /^\d{3}$/.test(c) && c !== "000";
  const errCodigo = dPunto && intento && !codigoOk(dPunto.codigo) ? "Código de 3 dígitos (001 a 999)." : "";
  const errNombre = dPunto && intento && (dPunto.nombre.trim().length < 1 || dPunto.nombre.trim().length > 60) ? "Nombre de 1 a 60 caracteres." : "";
  const errSucursal = dPunto && intento && dPunto.sucursalId === "" ? "Seleccione la sucursal." : "";
  const sucursalDelDialogo = dPunto ? sucursales.find((s) => s.id === dPunto.sucursalId) : undefined;

  async function guardarPunto() {
    if (!dPunto) return;

    setIntento(true);

    if (!codigoOk(dPunto.codigo) || dPunto.nombre.trim().length < 1 || dPunto.sucursalId === "") return;

    let nuevoId = "";

    try {
      await ejecutar(async () => {
        const r = await pedir<{ id: string }>("/api/facturacion/puntos", JSON_POST({ sucursalId: dPunto.sucursalId, codigo: dPunto.codigo, nombre: dPunto.nombre }), "No fue posible crear el punto.");

        nuevoId = r.id;
      }, "Punto registrado (inactivo y sin tipos). Configure ahora su primer tipo de documento.", true);
    } catch {
      return;
    }

    setDPunto(null);
    setIntento(false);
    setDTipo({ puntoId: nuevoId, titulo: `Configurar tipo · punto ${dPunto.codigo}`, tipo: "", bloqueaTipo: false, serie: "", ultimo: "", confirma: false, activar: false, existente: false });
  }

  // ── Configurar un tipo ──
  const serieTxt = dTipo ? dTipo.serie.trim().toUpperCase() : "";
  const errTipo = dTipo && intento && dTipo.tipo === "" ? "Seleccione el tipo de documento." : "";
  const errSerie = dTipo && intento && serieTxt !== "" && !/^[A-Z]{2}$/.test(serieTxt) ? "Dos letras (AA a ZZ) o vacío para «Sin serie»." : "";
  const errUltimo = dTipo && intento && !(/^\d{1,7}$/.test(dTipo.ultimo) && Number(dTipo.ultimo) <= 9999999) ? "Número entero de 0 a 9999999 (obligatorio; no se asume cero)." : "";
  const errConfirma = dTipo && intento && !dTipo.confirma ? "Confirme que la serie y el último número son correctos." : "";

  async function guardarTipo() {
    if (!dTipo) return;

    setIntento(true);

    if (dTipo.tipo === "" || (serieTxt !== "" && !/^[A-Z]{2}$/.test(serieTxt)) || !/^\d{1,7}$/.test(dTipo.ultimo) || Number(dTipo.ultimo) > 9999999 || !dTipo.confirma) return;

    try {
      await ejecutar(async () => {
        await pedir(`/api/facturacion/puntos/${dTipo.puntoId}/tipos`, JSON_POST({ tipo: dTipo.tipo, serie: serieTxt, ultimoNumero: dTipo.ultimo, confirmado: dTipo.confirma, activar: dTipo.activar }), "No fue posible guardar la configuración.");
      }, "Configuración guardada. La numeración continúa desde el último número confirmado; el definitivo se reserva al emitir.", true);
    } catch {
      return;
    }

    setDTipo(null);
    setIntento(false);
  }

  function abrirConfiguracion(f: Fila) {
    setError("");
    setAviso("");
    setErrorDialogo("");
    setIntento(false);
    setDTipo({
      puntoId: f.punto.id,
      titulo: `Configurar tipo · punto ${f.punto.codigo}`,
      tipo: f.tipo?.tipo ?? "",
      bloqueaTipo: f.tipo !== null,
      serie: f.tipo?.serie ?? "",
      ultimo: f.tipo ? String(f.tipo.ultimoNumero) : "",
      confirma: false,
      activar: false,
      existente: f.tipo !== null,
    });
  }

  const alternarTipo = (f: Fila) => {
    if (!f.tipo) return;

    const destino = !f.tipo.activo;

    void ejecutar(async () => { await pedir(`/api/facturacion/puntos/${f.punto.id}/tipos/${f.tipo!.tipo}/estado`, JSON_POST({ activo: destino }), "No fue posible cambiar el estado del tipo."); }, destino ? "Tipo activado en el punto." : "Tipo desactivado: se conservan su serie y su último número.").catch(() => undefined);
  };

  const alternarPunto = (f: Fila) => {
    const destino = !f.punto.activo;

    void ejecutar(async () => { await pedir(`/api/facturacion/puntos/${f.punto.id}/estado`, JSON_POST({ activo: destino }), "No fue posible cambiar el estado del punto."); }, destino ? "Punto activado." : "Punto desactivado: no emite ningún tipo, pero conserva sus configuraciones.").catch(() => undefined);
  };

  const dialogoAbierto = dPunto !== null || dTipo !== null;
  const sucursalesConEstablecimiento = sucursales.filter((s) => s.establecimiento !== null);

  return (
    <section className={ui.page}>
      <div inert={dialogoAbierto} style={{ display: "contents" }}>
        <header className={ui.topbar}>
          <div className={ui.titleBlock}>
            <nav className={ui.breadcrumb} aria-label="Ruta de navegación">
              <Link href="/documentos">Facturación</Link>
              <i aria-hidden="true">/</i>
              <span aria-current="page">Puntos de expedición</span>
            </nav>
            <h1>Puntos de expedición</h1>
          </div>
          <button type="button" className={ui.primaryButton} onClick={() => { setError(""); setAviso(""); setErrorDialogo(""); setIntento(false); setDPunto({ sucursalId: "", codigo: "", nombre: "" }); }}>
            <span aria-hidden="true">+</span>
            Nuevo punto
          </button>
        </header>

        {error ? <p className={ui.alertError} role="alert">{error}</p> : null}
        {errorCarga ? <p className={ui.alertError} role="alert">{errorCarga}</p> : null}
        {aviso ? <p className={ui.alertOk} role="status">{aviso}</p> : null}

        <section className={ui.contentCard}>
          <div className={ui.toolbar}>
            <label className={ui.search}>
              <span aria-hidden="true">⌕</span>
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por establecimiento, punto, nombre o sucursal…" aria-label="Buscar puntos de expedición" />
            </label>
            <label className={ui.filterField}>
              <span>Sucursal / establecimiento</span>
              <select value={filtroSucursal} onChange={(e) => setFiltroSucursal(e.target.value)}>
                <option value="">Todas</option>
                {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}{s.establecimiento ? ` (${s.establecimiento})` : ""}</option>)}
              </select>
            </label>
            <label className={ui.filterField}>
              <span>Tipo de documento</span>
              <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
                <option value="">Todos</option>
                {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
                <option value="SIN_TIPO">Sin tipo configurado</option>
              </select>
            </label>
            <label className={ui.filterField}>
              <span>Estado</span>
              <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
                <option value="">Todos</option>
                <option value="ACTIVOS">Activos</option>
                <option value="INACTIVOS">Inactivos</option>
              </select>
            </label>
            <button type="button" className={ui.clearButton} onClick={() => { setBusqueda(""); setFiltroSucursal(""); setFiltroTipo(""); setFiltroEstado(""); }} disabled={!hayFiltros}>Limpiar filtros</button>
            <span className={ui.resultCount} aria-live="polite">{filtradas.length} de {filas.length}</span>
          </div>

          <div className={ui.tableScroll}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Establecimiento</th>
                  <th scope="col">Punto</th>
                  <th scope="col">Nombre</th>
                  <th scope="col">Tipo de documento</th>
                  <th scope="col">Serie actual</th>
                  <th scope="col" className={ui.numericHead}>Último número</th>
                  <th scope="col">Próximo (referencial)</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cargando ? (
                  <tr><td colSpan={9} className={ui.emptyCell}><div className={ui.empty}><strong>Cargando puntos de expedición…</strong></div></td></tr>
                ) : filtradas.length === 0 ? (
                  <tr>
                    <td colSpan={9} className={ui.emptyCell}>
                      <div className={ui.empty}>
                        <strong>{filas.length === 0 ? "Todavía no hay puntos de expedición." : "No hay configuraciones que coincidan con los filtros."}</strong>
                        {filas.length === 0 ? <span>Registre un punto y configure el tipo de documento que va a emitir.</span> : null}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtradas.map((f) => {
                    const t = f.tipo;
                    const operativo = f.punto.activo && (t?.activo ?? false);

                    return (
                      <tr key={f.clave} className={ui.row}>
                        <td className={ui.mono}>{f.sucursal.establecimiento ?? "—"}<br /><small className={ui.muted}>{f.sucursal.nombre}</small></td>
                        <td className={ui.mono}>{f.punto.codigo}</td>
                        <td>{f.punto.nombre}</td>
                        <td>{t ? <>{ETIQUETA[t.tipo]} <small className={ui.muted}>({t.tipo})</small>{!t.emitible ? <><br /><small className={ui.muted}>Solo configuración: la emisión aún no está habilitada.</small></> : null}</> : <span className={ui.muted}>Sin tipo configurado</span>}</td>
                        <td>{t ? (t.serie ?? <span className={ui.muted}>Sin serie</span>) : "—"}</td>
                        <td className={ui.numeric}>{t ? numeroVista(t.serie, t.ultimoNumero) : "—"}</td>
                        <td>{t ? (t.proximo ?? "—") : "—"}</td>
                        <td>
                          {t === null ? <span className={ui.statusWarning}>Sin configurar</span>
                            : operativo ? <span className={ui.statusActive}>Activo</span>
                              : !f.punto.activo ? <span className={ui.statusInactive}>Punto inactivo</span>
                                : <span className={ui.statusInactive}>Tipo inactivo</span>}
                        </td>
                        <td className={ui.actionsCell}>
                          <div className={ui.actionsGroup}>
                            <button type="button" className={ui.rowButton} disabled={ocupado} onClick={() => abrirConfiguracion(f)}>{t ? "Configurar" : "Configurar tipo"}</button>
                            {t ? <button type="button" className={ui.rowButton} disabled={ocupado} onClick={() => alternarTipo(f)}>{t.activo ? "Desactivar tipo" : "Activar tipo"}</button> : null}
                            <button type="button" className={ui.rowButton} disabled={ocupado} onClick={() => alternarPunto(f)}>{f.punto.activo ? "Desactivar punto" : "Activar punto"}</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {dPunto ? (
        <div className={estilos.fondo} role="dialog" aria-modal="true" aria-label="Nuevo punto de expedición" onKeyDown={(e) => { if (e.key === "Escape" && !ocupado) setDPunto(null); }}>
          <form className={estilos.dialogo} noValidate onSubmit={(e) => { e.preventDefault(); void guardarPunto(); }}>
            <h2>Nuevo punto de expedición</h2>
            <p className={estilos.ayuda}>El punto se crea inactivo y sin tipos de documento. Después se configura cada tipo (factura, nota de crédito, etc.) con su serie y su último número.</p>
            {errorDialogo ? <p className={estilos.errorDialogo} role="alert">{errorDialogo}</p> : null}
            <label className={estilos.campo}>
              <span>Sucursal (establecimiento)</span>
              <select value={dPunto.sucursalId} onChange={(e) => setDPunto({ ...dPunto, sucursalId: e.target.value })} aria-invalid={errSucursal !== ""} autoFocus>
                <option value="">Seleccione…</option>
                {sucursalesConEstablecimiento.map((s) => <option key={s.id} value={s.id}>{s.nombre} ({s.establecimiento})</option>)}
              </select>
              {errSucursal ? <small className={estilos.errorCampo}>{errSucursal}</small> : null}
              {sucursales.some((s) => s.establecimiento === null) ? <small className={estilos.ayuda}>Las sucursales sin establecimiento SIFEN no se listan: configure su establecimiento primero.</small> : null}
            </label>
            <div className={estilos.dosColumnas}>
              <label className={estilos.campo}>
                <span>Código del punto</span>
                <input value={dPunto.codigo} onChange={(e) => setDPunto({ ...dPunto, codigo: e.target.value.replace(/\D/g, "").slice(0, 3) })} inputMode="numeric" maxLength={3} placeholder="001" aria-invalid={errCodigo !== ""} />
                {errCodigo ? <small className={estilos.errorCampo}>{errCodigo}</small> : null}
              </label>
              <label className={estilos.campo}>
                <span>Nombre</span>
                <input value={dPunto.nombre} onChange={(e) => setDPunto({ ...dPunto, nombre: e.target.value })} maxLength={60} placeholder="Caja 1" aria-invalid={errNombre !== ""} />
                {errNombre ? <small className={estilos.errorCampo}>{errNombre}</small> : null}
              </label>
            </div>
            {sucursalDelDialogo ? <p className={estilos.ayuda}>Identidad fiscal: establecimiento {sucursalDelDialogo.establecimiento} · punto {dPunto.codigo || "—"}.</p> : null}
            <div className={estilos.acciones}>
              <button type="button" className={ui.secondaryButton} onClick={() => { setDPunto(null); setIntento(false); setErrorDialogo(""); }} disabled={ocupado}>Cancelar</button>
              <button type="submit" className={ui.primaryButton} disabled={ocupado}>{ocupado ? "Guardando…" : "Registrar punto"}</button>
            </div>
          </form>
        </div>
      ) : null}

      {dTipo ? (
        <div className={estilos.fondo} role="dialog" aria-modal="true" aria-label={dTipo.titulo} onKeyDown={(e) => { if (e.key === "Escape" && !ocupado) setDTipo(null); }}>
          <form className={estilos.dialogo} noValidate onSubmit={(e) => { e.preventDefault(); void guardarTipo(); }}>
            <h2>{dTipo.titulo}</h2>
            <p className={estilos.ayuda}>Se confirma una sola vez la serie actual y el último número realmente emitido (también el emitido por otros sistemas). La numeración nunca retrocede.</p>
            {errorDialogo ? <p className={estilos.errorDialogo} role="alert">{errorDialogo}</p> : null}
            <label className={estilos.campo}>
              <span>Tipo de documento</span>
              <select value={dTipo.tipo} onChange={(e) => setDTipo({ ...dTipo, tipo: e.target.value as Tipo | "" })} disabled={dTipo.bloqueaTipo} aria-invalid={errTipo !== ""} autoFocus={!dTipo.bloqueaTipo}>
                <option value="">Seleccione…</option>
                {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
              </select>
              {errTipo ? <small className={estilos.errorCampo}>{errTipo}</small> : null}
              {dTipo.tipo !== "" && dTipo.tipo !== "FE" && dTipo.tipo !== "NCE" ? <small className={estilos.ayuda}>Solo se configura el contador: la emisión de este tipo todavía no está habilitada.</small> : null}
            </label>
            <div className={estilos.dosColumnas}>
              <label className={estilos.campo}>
                <span>Serie actual</span>
                <input value={dTipo.serie} onChange={(e) => setDTipo({ ...dTipo, serie: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) })} maxLength={2} placeholder="Sin serie" aria-invalid={errSerie !== ""} autoFocus={dTipo.bloqueaTipo} />
                {errSerie ? <small className={estilos.errorCampo}>{errSerie}</small> : <small className={estilos.ayuda}>Vacío = «Sin serie» (primera numeración). La serie AA empieza solo al agotar 9999999.</small>}
              </label>
              <label className={estilos.campo}>
                <span>Último número emitido</span>
                <input value={dTipo.ultimo} onChange={(e) => setDTipo({ ...dTipo, ultimo: e.target.value.replace(/\D/g, "").slice(0, 7) })} inputMode="numeric" maxLength={7} placeholder="0000000" aria-invalid={errUltimo !== ""} />
                {errUltimo ? <small className={estilos.errorCampo}>{errUltimo}</small> : <small className={estilos.ayuda}>0 solo si todavía no existe ningún documento de este tipo en este punto.</small>}
              </label>
            </div>
            <p className={estilos.referencia}>Próximo referencial: <strong>{proximoDeEntrada(serieTxt, dTipo.ultimo)}</strong> <small>(el número definitivo se reserva al emitir)</small></p>
            <label className={estilos.casilla}>
              <input type="checkbox" checked={dTipo.confirma} onChange={(e) => setDTipo({ ...dTipo, confirma: e.target.checked })} />
              <span>Confirmo que la serie y el último número son los realmente emitidos.</span>
            </label>
            {errConfirma ? <small className={estilos.errorCampo}>{errConfirma}</small> : null}
            <label className={estilos.casilla}>
              <input type="checkbox" checked={dTipo.activar} onChange={(e) => setDTipo({ ...dTipo, activar: e.target.checked })} />
              <span>Dejar este tipo activo. Los demás tipos del punto no cambian.</span>
            </label>
            <div className={estilos.acciones}>
              <button type="button" className={ui.secondaryButton} onClick={() => { setDTipo(null); setIntento(false); setErrorDialogo(""); }} disabled={ocupado}>Cancelar</button>
              <button type="submit" className={ui.primaryButton} disabled={ocupado}>{ocupado ? "Guardando…" : "Guardar configuración"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
