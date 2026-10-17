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

/** Alta fiscal ÚNICA (NEX-064): sucursal + código de punto + tipo + serie + último número + una confirmación; el punto se crea o se reutiliza en la misma operación. */
type DialogoAlta = { sucursalId: string; codigo: string; nombre: string; tipo: Tipo | ""; serie: string; ultimo: string; confirma: boolean; activar: boolean };
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

  const [dAlta, setDAlta] = useState<DialogoAlta | null>(null);
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

      // «Activos» = disponibles de verdad para emitir (FE/NCE con punto y tipo activos); NRE/NDE/AFE configurados no emiten todavía y cuentan como «no disponibles».
      const activa = f.tipo !== null && f.tipo.emitible && f.punto.activo && f.tipo.activo;

      if (filtroEstado === "ACTIVOS" && !activa) return false;
      if (filtroEstado === "INACTIVOS" && activa) return false;
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

  // ── Nuevo punto / tipo (formulario ÚNICO) ──
  const codigoOk = (c: string) => /^\d{3}$/.test(c) && c !== "000";
  const sucursalDelDialogo = dAlta ? sucursales.find((x) => x.id === dAlta.sucursalId) : undefined;
  // Punto administrativo existente (misma sucursal y código): se reutiliza; su nombre no se modifica y el tipo nuevo se añade a él.
  const puntoExistente = dAlta && sucursalDelDialogo ? sucursalDelDialogo.puntos.find((p) => p.codigo === dAlta.codigo) : undefined;
  const tipoYaConfigurado = dAlta && puntoExistente && dAlta.tipo !== "" ? puntoExistente.tipos.find((t) => t.tipo === dAlta.tipo) : undefined;
  const aSerie = dAlta ? dAlta.serie.trim().toUpperCase() : "";
  // Solo FE y NCE tienen flujo de emisión: para los demás tipos el alta es SOLO configuración (nunca «disponible para emitir»).
  const altaEmitible = dAlta !== null && (dAlta.tipo === "FE" || dAlta.tipo === "NCE");
  const nombreEfectivo = dAlta ? (puntoExistente ? puntoExistente.nombre : dAlta.nombre) : "";
  const errSucursal = dAlta && intento && dAlta.sucursalId === "" ? "Seleccione la sucursal." : "";
  const errCodigo = dAlta && intento && !codigoOk(dAlta.codigo) ? "Código de 3 dígitos (001 a 999)." : "";
  const errNombre = dAlta && intento && !puntoExistente && (nombreEfectivo.trim().length < 1 || nombreEfectivo.trim().length > 60) ? "Nombre de 1 a 60 caracteres." : "";
  const errATipo = dAlta && intento && dAlta.tipo === "" ? "Seleccione el tipo de documento." : "";
  const errASerie = dAlta && intento && aSerie !== "" && !/^[A-Z]{2}$/.test(aSerie) ? "Dos letras (AA a ZZ) o vacío para «Sin serie»." : "";
  const errAUltimo = dAlta && intento && !(/^\d{1,7}$/.test(dAlta.ultimo) && Number(dAlta.ultimo) <= 9999999) ? "Número entero de 0 a 9999999 (obligatorio; no se asume cero)." : "";
  const errAConfirma = dAlta && intento && !dAlta.confirma ? "Confirme que la serie y el último número son correctos." : "";

  async function guardarAlta() {
    if (!dAlta) return;

    setIntento(true);

    if (dAlta.sucursalId === "" || !codigoOk(dAlta.codigo) || dAlta.tipo === "" || tipoYaConfigurado || (!puntoExistente && (dAlta.nombre.trim().length < 1 || dAlta.nombre.trim().length > 60)) || (aSerie !== "" && !/^[A-Z]{2}$/.test(aSerie)) || !/^\d{1,7}$/.test(dAlta.ultimo) || Number(dAlta.ultimo) > 9999999 || !dAlta.confirma) return;

    let creado = false;

    try {
      await ejecutar(async () => {
        const res = await pedir<{ id: string; creado: boolean }>("/api/facturacion/puntos", JSON_POST({ sucursalId: dAlta.sucursalId, codigo: dAlta.codigo, nombre: nombreEfectivo, tipo: dAlta.tipo, serie: aSerie, ultimoNumero: dAlta.ultimo, confirmado: dAlta.confirma, activar: altaEmitible && dAlta.activar }), "No fue posible registrar el punto y su tipo.");

        creado = res.creado;
      }, "", true);
    } catch {
      return;
    }

    const soloConfig = !(dAlta.tipo === "FE" || dAlta.tipo === "NCE");

    setAviso((creado ? "Punto de expedición y tipo de documento registrados en una sola operación." : "Tipo de documento añadido al punto existente (su nombre y los demás tipos no cambiaron).") + (soloConfig ? " Queda configurado; la emisión de este tipo todavía no está habilitada." : ""));
    setDAlta(null);
    setIntento(false);
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
        await pedir(`/api/facturacion/puntos/${dTipo.puntoId}/tipos`, JSON_POST({ tipo: dTipo.tipo, serie: serieTxt, ultimoNumero: dTipo.ultimo, confirmado: dTipo.confirma, activar: (dTipo.tipo === "FE" || dTipo.tipo === "NCE") && dTipo.activar }), "No fue posible guardar la configuración.");
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

  const dialogoAbierto = dAlta !== null || dTipo !== null;
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
          <button type="button" className={ui.primaryButton} onClick={() => { setError(""); setAviso(""); setErrorDialogo(""); setIntento(false); setDAlta({ sucursalId: "", codigo: "", nombre: "", tipo: "", serie: "", ultimo: "", confirma: false, activar: true }); }}>
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
                            : !t.emitible ? <span className={ui.statusInfo} title="El tipo está configurado (serie y contador guardados), pero la emisión de este tipo todavía no está habilitada en NEXIT.">Configurado · emisión no disponible</span>
                            : operativo ? <span className={ui.statusActive}>Activo · disponible para emitir</span>
                              : !f.punto.activo ? <span className={ui.statusInactive}>Punto inactivo</span>
                                : <span className={ui.statusInactive}>Tipo inactivo</span>}
                        </td>
                        <td className={ui.actionsCell}>
                          <div className={ui.actionsGroup}>
                            <button type="button" className={ui.rowButton} disabled={ocupado} onClick={() => abrirConfiguracion(f)}>{t ? "Configurar" : "Configurar tipo"}</button>
                            {t && t.emitible ? <button type="button" className={ui.rowButton} disabled={ocupado} onClick={() => alternarTipo(f)}>{t.activo ? "Desactivar tipo" : "Activar tipo"}</button> : null}
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

      {dAlta ? (
        <div className={estilos.fondo} role="dialog" aria-modal="true" aria-label="Nuevo punto de expedición" onKeyDown={(e) => { if (e.key === "Escape" && !ocupado) setDAlta(null); }}>
          <form className={estilos.dialogo} noValidate onSubmit={(e) => { e.preventDefault(); void guardarAlta(); }}>
            <h2>Nuevo punto de expedición</h2>
            <p className={estilos.ayuda}>Un solo formulario: si el punto (establecimiento + código) ya existe se reutiliza y solo se añade este tipo de documento; si no existe, se crea junto con el tipo. Cada tipo lleva su propia numeración.</p>
            {errorDialogo ? <p className={estilos.errorDialogo} role="alert">{errorDialogo}</p> : null}
            <label className={estilos.campo}>
              <span>Sucursal (establecimiento)</span>
              <select value={dAlta.sucursalId} onChange={(e) => setDAlta({ ...dAlta, sucursalId: e.target.value })} aria-invalid={errSucursal !== ""} autoFocus>
                <option value="">Seleccione…</option>
                {sucursalesConEstablecimiento.map((x) => <option key={x.id} value={x.id}>{x.nombre} ({x.establecimiento})</option>)}
              </select>
              {errSucursal ? <small className={estilos.errorCampo}>{errSucursal}</small> : null}
              {sucursales.some((x) => x.establecimiento === null) ? <small className={estilos.ayuda}>Las sucursales sin establecimiento SIFEN no se listan: configure su establecimiento primero.</small> : null}
            </label>
            <div className={estilos.dosColumnas}>
              <label className={estilos.campo}>
                <span>Código del punto</span>
                <input value={dAlta.codigo} onChange={(e) => setDAlta({ ...dAlta, codigo: e.target.value.replace(/\D/g, "").slice(0, 3) })} inputMode="numeric" maxLength={3} placeholder="001" aria-invalid={errCodigo !== ""} />
                {errCodigo ? <small className={estilos.errorCampo}>{errCodigo}</small> : null}
              </label>
              <label className={estilos.campo}>
                <span>Nombre del punto</span>
                <input value={puntoExistente ? puntoExistente.nombre : dAlta.nombre} onChange={(e) => setDAlta({ ...dAlta, nombre: e.target.value })} maxLength={60} placeholder="Caja 1" readOnly={puntoExistente !== undefined} aria-invalid={errNombre !== ""} />
                {errNombre ? <small className={estilos.errorCampo}>{errNombre}</small> : puntoExistente ? <small className={estilos.ayuda}>Punto existente: se reutiliza y su nombre no se modifica.</small> : null}
              </label>
            </div>
            {sucursalDelDialogo && codigoOk(dAlta.codigo) ? <p className={estilos.ayuda}>Identidad fiscal: establecimiento {sucursalDelDialogo.establecimiento} · punto {dAlta.codigo} — {puntoExistente ? `ya existe (${puntoExistente.activo ? "activo" : "inactivo"}; tipos: ${puntoExistente.tipos.length === 0 ? "ninguno" : puntoExistente.tipos.map((t) => t.tipo).join(", ")})` : "punto nuevo"}.</p> : null}
            <label className={estilos.campo}>
              <span>Tipo de documento</span>
              <select value={dAlta.tipo} onChange={(e) => setDAlta({ ...dAlta, tipo: e.target.value as Tipo | "" })} aria-invalid={errATipo !== "" || tipoYaConfigurado !== undefined}>
                <option value="">Seleccione…</option>
                {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
              </select>
              {errATipo ? <small className={estilos.errorCampo}>{errATipo}</small> : null}
              {tipoYaConfigurado && puntoExistente && sucursalDelDialogo ? (
                <small className={estilos.errorCampo} role="alert">
                  El tipo {dAlta.tipo} ya está configurado en el punto {sucursalDelDialogo.establecimiento}-{puntoExistente.codigo} (serie {tipoYaConfigurado.serie ?? "sin serie"}, último número {textoNumeracion(tipoYaConfigurado.serie, tipoYaConfigurado.ultimoNumero)}). No se duplica ni se reinicia: use «Configurar» en su fila.
                </small>
              ) : null}
              {dAlta.tipo !== "" && dAlta.tipo !== "FE" && dAlta.tipo !== "NCE" ? <small className={estilos.ayuda}>Solo se configura el contador: la emisión de este tipo todavía no está habilitada.</small> : null}
            </label>
            <div className={estilos.dosColumnas}>
              <label className={estilos.campo}>
                <span>Serie actual</span>
                <input value={dAlta.serie} onChange={(e) => setDAlta({ ...dAlta, serie: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) })} maxLength={2} placeholder="Sin serie" aria-invalid={errASerie !== ""} />
                {errASerie ? <small className={estilos.errorCampo}>{errASerie}</small> : <small className={estilos.ayuda}>Vacío = «Sin serie» (primera numeración). La serie AA empieza solo al agotar 9999999.</small>}
              </label>
              <label className={estilos.campo}>
                <span>Último número emitido</span>
                <input value={dAlta.ultimo} onChange={(e) => setDAlta({ ...dAlta, ultimo: e.target.value.replace(/\D/g, "").slice(0, 7) })} inputMode="numeric" maxLength={7} placeholder="0000000" aria-invalid={errAUltimo !== ""} />
                {errAUltimo ? <small className={estilos.errorCampo}>{errAUltimo}</small> : <small className={estilos.ayuda}>0 solo si todavía no existe ningún documento de este tipo en este punto.</small>}
              </label>
            </div>
            <p className={estilos.referencia}>Próximo referencial: <strong>{proximoDeEntrada(aSerie, dAlta.ultimo)}</strong> <small>(el número definitivo se reserva al emitir)</small></p>
            <label className={estilos.casilla}>
              <input type="checkbox" checked={dAlta.confirma} onChange={(e) => setDAlta({ ...dAlta, confirma: e.target.checked })} />
              <span>Confirmo que la serie y el último número son los realmente emitidos.</span>
            </label>
            {errAConfirma ? <small className={estilos.errorCampo}>{errAConfirma}</small> : null}
            {altaEmitible ? (
              <label className={estilos.casilla}>
                <input type="checkbox" checked={dAlta.activar} onChange={(e) => setDAlta({ ...dAlta, activar: e.target.checked })} />
                <span>Dejar disponible para emitir ahora (activa este tipo y, si el punto estaba inactivo o es nuevo, también el punto). Los demás tipos no cambian.</span>
              </label>
            ) : dAlta.tipo !== "" ? <small className={estilos.ayuda}>Solo se registra la configuración (serie y contador). Este tipo no queda disponible para emitir: su emisión todavía no está habilitada.</small> : null}
            {altaEmitible && dAlta.activar && puntoExistente && !puntoExistente.activo ? <small className={estilos.ayuda}>El punto está inactivo: al activarlo, sus otros tipos activos volverán a poder emitir.</small> : null}
            <div className={estilos.acciones}>
              <button type="button" className={ui.secondaryButton} onClick={() => { setDAlta(null); setIntento(false); setErrorDialogo(""); }} disabled={ocupado}>Cancelar</button>
              <button type="submit" className={ui.primaryButton} disabled={ocupado || tipoYaConfigurado !== undefined}>{ocupado ? "Guardando…" : "Guardar punto y tipo"}</button>
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
            {dTipo.tipo === "FE" || dTipo.tipo === "NCE" ? (
              <label className={estilos.casilla}>
                <input type="checkbox" checked={dTipo.activar} onChange={(e) => setDTipo({ ...dTipo, activar: e.target.checked })} />
                <span>Dejar este tipo activo. Los demás tipos del punto no cambian.</span>
              </label>
            ) : null}
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
