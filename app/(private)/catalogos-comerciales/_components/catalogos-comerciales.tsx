"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "@/app/(private)/productos/catalogos/page.module.css";
import { CampoFecha } from "@/components/ui/campo-fecha";
import { compararTexto, ordenarLista, siguienteOrden, type Orden } from "@/components/ui/lista-padrao/orden";
import { ThOrdenable } from "@/components/ui/lista-padrao/th-ordenable";
import ui from "@/components/ui/lista-padrao/lista.module.css";
import { hoyAsuncion, isoAFechaLocal } from "@/lib/listas-precio/calculos";
import { cargarCatalogoComercial } from "@/lib/comercial/carga";
import { compararDecimales, formatearCambio } from "@/lib/comercial/cambio-decimal";
import { textoConfirmarInactivacionComercial } from "@/lib/comercial/vinculos";
import { crearExclusion } from "@/lib/productos/catalogos-operacion";
import { cargaConfiable, crearCompuerta, motivoBloqueoGuardar, permisosVigentes } from "@/lib/productos/catalogos-carga";
import { useProtegerCambios } from "@/lib/ui/proteger-cambios";
import { aplicarCambioCampo, validarFormularioComercial, formularioComercialSucio, type CampoComercial, type ErroresComercial, type FormularioComercial, type TabComercial } from "@/lib/comercial/formulario";

type Fila = {
  id: string;
  codigo?: string;
  nombre?: string;
  activo?: boolean;
  usos?: number;
  clientes?: number;
  fecha?: string;
  monedaCodigo?: string;
  cambio?: string;
  /** Tipos de cambio: número de versión de la cotización. Canales/zonas: versión de edición (actualizado_at µs). */
  version?: number | string;
  vigente?: boolean;
  motivo?: string;
  creadoEn?: string;
  creadoPor?: string;
  retiradoEn?: string;
};

type Moneda = { codigo: string; nombre: string; simbolo: string };

const TABS: Array<{ id: TabComercial; label: string; singular: string; ruta: string; clave: string }> = [
  { id: "cambios", label: "Tipos de cambio", singular: "tipo de cambio", ruta: "tipos-cambio", clave: "tiposCambio" },
  { id: "canales", label: "Canales de venta", singular: "canal de venta", ruta: "canales-venta", clave: "canales" },
  { id: "zonas", label: "Zonas comerciales", singular: "zona comercial", ruta: "zonas", clave: "zonas" },
];

const PAGE_SIZE = 20;
type CampoOrden = "codigo" | "nombre" | "usos" | "estado" | "fecha" | "moneda" | "cambio";

const idCampo = (c: CampoComercial) => `com-${c}`;

const vacio = (): FormularioComercial => ({ id: null, codigo: "", nombre: "", fecha: hoyAsuncion(), monedaCodigo: "", cambio: "", motivo: "" });

export default function ListadoCatalogosComerciales() {
  const [tab, setTab] = useState<TabComercial>("cambios");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [permisosCargados, setPermisos] = useState({ crear: false, editar: false });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // CC-A04: fallo de la consulta principal; estado propio que guardar/abrir formularios no borran.
  const [errorCarga, setErrorCarga] = useState("");
  const [aviso, setAviso] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState<"TODOS" | "ACTIVOS" | "INACTIVOS">("TODOS");
  const [filtroMoneda, setFiltroMoneda] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [historial, setHistorial] = useState(false);
  const [form, setForm] = useState<FormularioComercial | null>(null);
  const [base, setBase] = useState<FormularioComercial | null>(null);
  const [errores, setErrores] = useState<ErroresComercial>({});
  const [errorForm, setErrorForm] = useState("");
  const [guardando, setGuardando] = useState(false);
  // CC-D02: una gravación (guardar, activar/inactivar, anular) en curso es EXCLUSIVA: mientras dura no se cambia de pestaña/historial ni se abre/cancela otro formulario ni se lanza otra mutación. La exclusión se adquiere de forma síncrona en el manejador.
  const [ocupado, setOcupado] = useState(false);
  const exclusion = useRef(crearExclusion());
  const [orden, setOrden] = useState<Orden<CampoOrden>>(null);
  const [paginacion, setPaginacion] = useState({ clave: "", pagina: 1 });

  const meta = TABS.find((t) => t.id === tab)!;
  const sucio = formularioComercialSucio(form, base);
  const corrigiendo = tab === "cambios" && form?.id != null;
  const estadoCarga = { cargando, errorCarga, errorAuxiliar: "" };
  const confiable = cargaConfiable(estadoCarga);
  const permisos = permisosVigentes(permisosCargados, estadoCarga);
  // CC-A03: solo la última solicitud iniciada (pestaña/historial vigentes) puede escribir en pantalla.
  const compuerta = useRef(crearCompuerta());

  const cargar = useCallback(async () => {
    const solicitud = compuerta.current.nueva();

    setCargando(true);
    setError("");
    setErrorCarga("");

    const r = await cargarCatalogoComercial(meta.ruta, meta.clave, tab === "cambios" && historial, (url) => fetch(url, { cache: "no-store" }));

    if (!compuerta.current.vigente(solicitud)) return;

    if (r.error) {
      setFilas([]);
      setPermisos({ crear: false, editar: false });
      setMonedas([]); // CC-D03: las monedas de una carga anterior no valen tras un fallo
      setErrorCarga(r.error);
    } else {
      setFilas(r.filas as Fila[]);
      setPermisos(r.permisos);
      if (r.monedas) setMonedas(r.monedas);
    }
    setCargando(false);
  }, [meta.ruta, meta.clave, tab, historial]);

  useEffect(() => {
    void Promise.resolve().then(cargar);
  }, [cargar]);

  // CC-A02: guard oficial (recarga/cierre y cualquier enlace interno, también el menú lateral); sin aviso si el formulario está intacto.
  useProtegerCambios(sucio);

  const confirmarDescarte = () => !sucio || window.confirm("Hay cambios sin guardar en el formulario. Si continúa, se perderán. ¿Desea continuar?");

  function enfocar(campo: CampoComercial | null) {
    if (campo) window.setTimeout(() => document.getElementById(idCampo(campo))?.focus(), 0);
  }

  function abrir(f: FormularioComercial) {
    setForm(f);
    setBase(f);
    setErrores({});
    setErrorForm("");
    setAviso("");
    setError("");
  }

  function cerrar() {
    setForm(null);
    setBase(null);
    setErrores({});
    setErrorForm("");
  }

  function cambiarTab(nuevo: TabComercial) {
    if (exclusion.current.activa() || nuevo === tab || !confirmarDescarte()) return;
    // CC-A03/A04: los permisos y datos de la pestaña anterior no valen para la nueva mientras no llegue su carga.
    setCargando(true);
    setPermisos({ crear: false, editar: false });
    setTab(nuevo);
    setOrden(null);
    cerrar();
    setBusqueda("");
    setEstado("TODOS");
    setFiltroMoneda("");
    setDesde("");
    setHasta("");
    setHistorial(false);
    setAviso("");
    setError("");
  }

  function actualizar(campo: CampoComercial, valor: string) {
    // CC-R03-01: con una gravación en curso el borrador no se modifica (los campos también están deshabilitados).
    if (exclusion.current.activa()) return;
    setForm((a) => (a ? aplicarCambioCampo(a, campo, valor, false) : a));
    setErrores((a) => (a[campo] ? { ...a, [campo]: undefined } : a));
  }

  // Estado de una cotización: vigente, reemplazada (hay una versión posterior de la misma fecha/moneda) o anulada.
  const estadoCambio = useCallback(
    (f: Fila) => (f.vigente ? "Vigente" : filas.some((x) => x.fecha === f.fecha && x.monedaCodigo === f.monedaCodigo && Number(x.version ?? 0) > Number(f.version ?? 0)) ? "Reemplazada" : "Anulada"),
    [filas],
  );

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();

    return filas.filter((f) => {
      if (tab === "cambios") {
        if (filtroMoneda && f.monedaCodigo !== filtroMoneda) return false;
        if (desde && (f.fecha ?? "") < desde) return false;
        if (hasta && (f.fecha ?? "") > hasta) return false;

        return !q || (f.monedaCodigo ?? "").toLowerCase().includes(q) || isoAFechaLocal(f.fecha ?? "").includes(q);
      }
      if (estado === "ACTIVOS" && !f.activo) return false;
      if (estado === "INACTIVOS" && f.activo) return false;

      return !q || (f.nombre ?? "").toLowerCase().includes(q) || (f.codigo ?? "").toLowerCase().includes(q);
    });
  }, [filas, busqueda, estado, filtroMoneda, desde, hasta, tab]);

  const ordenados = useMemo(
    () =>
      ordenarLista(visibles, orden, (campo, a, b) => {
        switch (campo) {
          case "codigo":
            return compararTexto(a.codigo ?? "", b.codigo ?? "");
          case "nombre":
            return compararTexto(a.nombre ?? "", b.nombre ?? "");
          case "usos":
            return (a.usos ?? 0) - (b.usos ?? 0);
          case "estado":
            return Number(b.activo ?? b.vigente) - Number(a.activo ?? a.vigente);
          case "fecha":
            return compararTexto(a.fecha ?? "", b.fecha ?? "");
          case "moneda":
            return compararTexto(a.monedaCodigo ?? "", b.monedaCodigo ?? "");
          case "cambio":
            return compararDecimales(a.cambio ?? "0", b.cambio ?? "0");
        }
      }),
    [visibles, orden],
  );

  const totalPaginas = Math.max(1, Math.ceil(visibles.length / PAGE_SIZE));
  const claveFiltros = JSON.stringify([tab, busqueda, estado, filtroMoneda, desde, hasta, historial, orden]);
  const pagina = paginacion.clave === claveFiltros ? Math.min(paginacion.pagina, totalPaginas) : 1;
  const setPagina = (v: number | ((a: number) => number)) => setPaginacion({ clave: claveFiltros, pagina: typeof v === "function" ? v(pagina) : v });
  const paginaActual = useMemo(() => ordenados.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE), [ordenados, pagina]);

  async function enviar(url: string, metodo: "POST" | "PUT", cuerpo: Record<string, unknown>) {
    const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    const j = (await r.json().catch(() => ({}))) as { error?: string; message?: string; campo?: string | null };

    if (!r.ok) throw Object.assign(new Error(j.error ?? "No fue posible guardar."), { campo: j.campo ?? null });

    return j;
  }

  async function guardar(event: FormEvent) {
    event.preventDefault();
    if (!form || exclusion.current.activa()) return;
    setError("");
    setAviso("");
    setErrorForm("");

    // CC-A04: sin datos confiables (carga en curso o fallida) no se envía nada; el borrador queda intacto.
    const bloqueo = motivoBloqueoGuardar(estadoCarga);

    if (bloqueo) {
      setErrorForm(bloqueo);

      return;
    }

    const locales = validarFormularioComercial(tab, form);
    const primero = (Object.keys(locales) as CampoComercial[])[0];

    if (primero) {
      setErrores(locales);
      enfocar(primero);

      return;
    }

    setErrores({});
    setGuardando(true);
    setOcupado(true);
    await exclusion.current.ejecutar(async () => {
    try {
      const raiz = `/api/catalogos-comerciales/${meta.ruta}`;
      const cuerpo: Record<string, unknown> =
        tab === "cambios"
          ? form.id
            ? { cambio: form.cambio, motivo: form.motivo }
            : { fecha: form.fecha, monedaCodigo: form.monedaCodigo, cambio: form.cambio }
          : { codigo: form.codigo, nombre: form.nombre, ...(form.id ? { version: form.version } : {}) };
      const j = form.id ? await enviar(`${raiz}/${form.id}`, "PUT", tab === "cambios" ? cuerpo : { ...cuerpo, activo: filas.find((f) => f.id === form.id)?.activo }) : await enviar(raiz, "POST", cuerpo);

      setAviso(j.message ?? "Guardado correctamente.");
      cerrar();
      await cargar();
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : "No fue posible guardar.";
      const campo = (e as { campo?: CampoComercial | null }).campo ?? null;

      if (campo && campo in form) {
        setErrores({ [campo]: mensaje });
        enfocar(campo);
      } else {
        setErrorForm(mensaje);
      }
    } finally {
      setGuardando(false);
      setOcupado(false);
    }
    });
  }

  async function cambiarEstado(f: Fila) {
    if (exclusion.current.activa()) return;
    setError("");
    setAviso("");

    const bloqueo = motivoBloqueoGuardar(estadoCarga);

    if (bloqueo) {
      setError(bloqueo);

      return;
    }

    // CC-A07: confirma si hay vínculos con listas/reglas O con clientes.
    const confirmar = textoConfirmarInactivacionComercial(f);

    if (confirmar && !window.confirm(confirmar)) return;

    setOcupado(true);
    await exclusion.current.ejecutar(async () => {
      try {
        await enviar(`/api/catalogos-comerciales/${meta.ruta}/${f.id}`, "PUT", { codigo: f.codigo, nombre: f.nombre, activo: !f.activo, version: f.version });
        setAviso(f.activo ? "Registro inactivado. Sus vínculos se conservan." : "Registro activado.");
        await cargar();
      } catch (e) {
        const mensaje = e instanceof Error ? e.message : "No fue posible cambiar el estado.";

        await cargar(); // CC-A01: ante un 409 se muestran los datos vigentes (y luego el aviso, que la recarga limpia)
        setError(mensaje);
      } finally {
        setOcupado(false);
      }
    });
  }

  async function anular(f: Fila) {
    if (exclusion.current.activa()) return;
    setError("");
    setAviso("");

    const bloqueo = motivoBloqueoGuardar(estadoCarga);

    if (bloqueo) {
      setError(bloqueo);

      return;
    }

    if (!window.confirm(`¿Anular la cotización de ${f.monedaCodigo} del ${isoAFechaLocal(f.fecha ?? "")}? Quedará en el historial y podrá registrar una nueva.`)) return;

    setOcupado(true);
    await exclusion.current.ejecutar(async () => {
      try {
        const r = await fetch(`/api/catalogos-comerciales/tipos-cambio/${f.id}/anular`, { method: "POST" });
        const j = (await r.json().catch(() => ({}))) as { error?: string; message?: string };

        if (!r.ok) throw new Error(j.error ?? "No fue posible anular.");
        setAviso(j.message ?? "Cotización anulada.");
        await cargar();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No fue posible anular.");
      } finally {
        setOcupado(false);
      }
    });
  }

  const claseCampo = (campo: CampoComercial, extra = "") => [styles.field, errores[campo] ? styles.conError : "", extra].filter(Boolean).join(" ");
  const ariaCampo = (campo: CampoComercial) => ({
    id: idCampo(campo),
    "aria-invalid": errores[campo] ? true : undefined,
    "aria-describedby": errores[campo] ? `${idCampo(campo)}-error` : undefined,
  });
  const mensajeCampo = (campo: CampoComercial) =>
    errores[campo] ? (
      <span id={`${idCampo(campo)}-error`} className={styles.campoError} role="alert">
        {errores[campo]}
      </span>
    ) : null;

  const columnas = tab === "cambios" ? 7 : 6;

  return (
    <section className={ui.page}>
      <header className={ui.topbar}>
        <div className={ui.titleBlock}>
          <nav className={ui.breadcrumb} aria-label="Ruta de navegación">
            <span>Maestros</span>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Catálogos comerciales</span>
          </nav>
          <h1>Catálogos comerciales</h1>
        </div>

        <div className={ui.actionsGroup}>
          <Link
            href="/listas-precio"
            className={ui.secondaryButton}
          >
            ← Listas de precios
          </Link>
          {permisos.crear ? (
            <button
              type="button"
              className={ui.primaryButton}
              disabled={ocupado}
              onClick={() => {
                if (ocupado || !confirmarDescarte()) return;
                abrir(vacio());
                enfocar(tab === "cambios" ? "fecha" : "codigo");
              }}
            >
              <span aria-hidden="true">+</span>
              Nuevo {meta.singular}
            </button>
          ) : null}
        </div>
      </header>

      <nav className={ui.tabs} aria-label="Catálogos comerciales">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={[ui.tab, tab === t.id ? ui.tabActive : ""].join(" ")} aria-current={tab === t.id ? "page" : undefined} disabled={ocupado} onClick={() => cambiarTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {error ? (
        <div className={ui.alertError} role="alert">
          {error}
        </div>
      ) : null}
      {errorCarga ? (
        <div className={ui.alertError} role="alert">
          {errorCarga} No se puede crear, editar ni guardar hasta recargar correctamente.{form ? " Lo escrito en el formulario se conserva." : ""}{" "}
          <button type="button" className={ui.rowButton} disabled={ocupado || cargando} onClick={() => void cargar()}>
            Reintentar
          </button>
        </div>
      ) : null}
      {aviso ? (
        <div className={ui.alertOk} role="status">
          {aviso}
        </div>
      ) : null}

      {form ? (
        <form className={styles.form} onSubmit={guardar} noValidate aria-label={corrigiendo ? "Corregir tipo de cambio" : `Nuevo ${meta.singular}`}>
          <h3>{corrigiendo ? "Corregir tipo de cambio" : form.id ? `Editar ${meta.singular}` : `Nuevo ${meta.singular}`}</h3>
          {errorForm ? (
            <div className={styles.alertaForm} role="alert">
              {errorForm}
            </div>
          ) : null}

          {tab === "cambios" ? (
            <>
              <label className={claseCampo("fecha")}>
                <span>
                  Fecha <b>*</b>
                </span>
                <CampoFecha id={idCampo("fecha")} valor={form.fecha} disabled={corrigiendo || ocupado} alCambiar={(v) => actualizar("fecha", v)} aria-invalid={!!errores.fecha} aria-describedby={errores.fecha ? `${idCampo("fecha")}-error` : undefined} claseError={styles.campoError} />
                {mensajeCampo("fecha")}
              </label>
              <label className={claseCampo("monedaCodigo")}>
                <span>
                  Moneda <b>*</b>
                </span>
                <select {...ariaCampo("monedaCodigo")} value={form.monedaCodigo} disabled={corrigiendo || ocupado} onChange={(e) => actualizar("monedaCodigo", e.target.value)}>
                  <option value="">Seleccione la moneda</option>
                  {monedas.map((m) => (
                    <option key={m.codigo} value={m.codigo}>
                      {m.codigo}
                      {m.nombre ? ` · ${m.nombre}` : ""}
                    </option>
                  ))}
                </select>
                {mensajeCampo("monedaCodigo")}
              </label>
              <label className={claseCampo("cambio")}>
                <span>
                  Cambio <b>*</b>
                </span>
                <input {...ariaCampo("cambio")} inputMode="decimal" autoComplete="off" disabled={ocupado} value={form.cambio} onChange={(e) => actualizar("cambio", e.target.value)} />
                {errores.cambio ? mensajeCampo("cambio") : <span className={styles.ayuda}>Guaraníes (PYG) por 1 unidad de la moneda. Ej.: 7.350,50</span>}
              </label>
              {corrigiendo ? (
                <label className={claseCampo("motivo")}>
                  <span>Motivo de la corrección</span>
                  <input {...ariaCampo("motivo")} maxLength={200} disabled={ocupado} value={form.motivo} onChange={(e) => actualizar("motivo", e.target.value)} />
                  {mensajeCampo("motivo")}
                </label>
              ) : null}
              {corrigiendo ? <p className={styles.nota}>La versión actual no se sobrescribe: queda en el historial y esta cotización pasa a ser la vigente.</p> : null}
            </>
          ) : (
            <>
              <label className={claseCampo("codigo")}>
                <span>
                  Código <b>*</b>
                </span>
                <input {...ariaCampo("codigo")} maxLength={40} disabled={ocupado} value={form.codigo} onChange={(e) => actualizar("codigo", e.target.value)} />
                {mensajeCampo("codigo")}
              </label>
              <label className={claseCampo("nombre", styles.wide)}>
                <span>
                  Nombre <b>*</b>
                </span>
                <input {...ariaCampo("nombre")} maxLength={120} disabled={ocupado} value={form.nombre} onChange={(e) => actualizar("nombre", e.target.value)} />
                {mensajeCampo("nombre")}
              </label>
            </>
          )}

          <div className={styles.formActions}>
            <button
              type="button"
              className={ui.secondaryButton}
              disabled={ocupado}
              onClick={() => {
                if (!ocupado && confirmarDescarte()) cerrar();
              }}
            >
              Cancelar
            </button>
            <button type="submit" className={ui.primaryButton} disabled={guardando || !confiable} title={confiable ? undefined : "Hasta que los datos se carguen correctamente no se puede guardar."}>
              {guardando ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      ) : null}

      <section className={ui.contentCard}>
        <div className={ui.toolbar}>
          <label className={ui.search}>
            <span aria-hidden="true">⌕</span>
            <input placeholder={tab === "cambios" ? "Buscar por moneda o fecha" : "Buscar por nombre o código"} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar en el catálogo" />
          </label>

          {tab === "cambios" ? (
            <>
              <label className={ui.filterField}>
                <span>Moneda</span>
                <select value={filtroMoneda} onChange={(e) => setFiltroMoneda(e.target.value)}>
                  <option value="">Todas</option>
                  {monedas.map((m) => (
                    <option key={m.codigo} value={m.codigo}>
                      {m.codigo}
                    </option>
                  ))}
                </select>
              </label>
              <label className={ui.filterField}>
                <span>Desde</span>
                <CampoFecha valor={desde} alCambiar={setDesde} />
              </label>
              <label className={ui.filterField}>
                <span>Hasta</span>
                <CampoFecha valor={hasta} alCambiar={setHasta} />
              </label>
              <label className={ui.filterField}>
                <span>Historial</span>
                <select value={historial ? "1" : "0"} disabled={ocupado} onChange={(e) => { if (!exclusion.current.activa()) setHistorial(e.target.value === "1"); }}>
                  <option value="0">Solo vigentes</option>
                  <option value="1">Con versiones anteriores</option>
                </select>
              </label>
            </>
          ) : (
            <label className={ui.filterField}>
              <span>Estado</span>
              <select value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)}>
                <option value="TODOS">Todos</option>
                <option value="ACTIVOS">Activos</option>
                <option value="INACTIVOS">Inactivos</option>
              </select>
            </label>
          )}

          <button
            type="button"
            className={ui.clearButton}
            onClick={() => {
              setBusqueda("");
              setEstado("TODOS");
              setFiltroMoneda("");
              setDesde("");
              setHasta("");
            }}
          >
            Limpiar filtros
          </button>

          <span className={ui.resultCount} aria-live="polite">
            {visibles.length} de {filas.length}
          </span>
        </div>

        <div className={ui.tableScroll}>
          <table className={ui.table} style={{ minWidth: 720 }}>
            <thead>
              <tr>
                {tab === "cambios" ? (
                  <>
                    <ThOrdenable titulo="Fecha" campo="fecha" orden={orden} onOrden={(c) => setOrden((a) => siguienteOrden(a, c))} />
                    <ThOrdenable titulo="Moneda" campo="moneda" orden={orden} onOrden={(c) => setOrden((a) => siguienteOrden(a, c))} />
                    <ThOrdenable titulo="Cambio (PYG)" campo="cambio" orden={orden} onOrden={(c) => setOrden((a) => siguienteOrden(a, c))} alinear="derecha" className={ui.colNumero} />
                    <ThOrdenable titulo="Versión" />
                    <ThOrdenable titulo="Registrado" />
                  </>
                ) : (
                  <>
                    <ThOrdenable titulo="Código" campo="codigo" orden={orden} onOrden={(c) => setOrden((a) => siguienteOrden(a, c))} className={ui.colCodigo} />
                    <ThOrdenable titulo="Nombre" campo="nombre" orden={orden} onOrden={(c) => setOrden((a) => siguienteOrden(a, c))} />
                    <ThOrdenable titulo="Vínculos (listas y reglas)" campo="usos" orden={orden} onOrden={(c) => setOrden((a) => siguienteOrden(a, c))} alinear="derecha" className={ui.colNumero} />
                    <ThOrdenable titulo="Clientes" alinear="derecha" className={ui.colNumero} />
                  </>
                )}
                <ThOrdenable titulo="Estado" campo="estado" orden={orden} onOrden={(c) => setOrden((a) => siguienteOrden(a, c))} className={ui.colEstado} />
                <ThOrdenable titulo="Acciones" alinear="derecha" />
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={columnas} className={ui.emptyCell}>
                    <div className={ui.empty}>
                      <strong>Cargando...</strong>
                    </div>
                  </td>
                </tr>
              ) : visibles.length === 0 ? (
                <tr>
                  <td colSpan={columnas} className={ui.emptyCell}>
                    <div className={ui.empty}>
                      <strong>{filas.length === 0 ? `Todavía no hay registros de ${meta.label.toLowerCase()}` : "Ningún registro coincide con los filtros"}</strong>
                      {filas.length === 0 && permisos.crear ? <span>Cree el primero con el botón Nuevo {meta.singular}.</span> : null}
                    </div>
                  </td>
                </tr>
              ) : (
                paginaActual.map((f) => {
                  const estadoTexto = tab === "cambios" ? estadoCambio(f) : f.activo ? "Activo" : "Inactivo";
                  const bueno = tab === "cambios" ? f.vigente : f.activo;

                  return (
                    <tr key={f.id} className={ui.row}>
                      {tab === "cambios" ? (
                        <>
                          <td>
                            <span className={ui.mono}>{isoAFechaLocal(f.fecha ?? "")}</span>
                          </td>
                          <td>
                            <span className={ui.principal}>{f.monedaCodigo}</span>
                          </td>
                          <td className={ui.numeric}>
                            <span className={ui.mono}>{formatearCambio(f.cambio ?? "0")}</span>
                          </td>
                          <td>
                            {f.version}
                            {f.motivo ? <small className={ui.muted}> · {f.motivo}</small> : null}
                          </td>
                          <td>
                            <small className={ui.muted}>
                              {f.creadoEn}
                              {f.creadoPor ? ` · ${f.creadoPor}` : ""}
                            </small>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>
                            <span className={[ui.code, ui.mono].join(" ")}>{f.codigo}</span>
                          </td>
                          <td>
                            <span className={ui.principal}>{f.nombre}</span>
                          </td>
                          <td className={ui.numeric}>
                            <span className={ui.mono}>{f.usos}</span>
                          </td>
                          <td className={ui.numeric}>
                            <span className={ui.mono}>{f.clientes ?? 0}</span>
                          </td>
                        </>
                      )}
                      <td>
                        <span className={bueno ? ui.statusActive : ui.statusInactive}>{estadoTexto}</span>
                      </td>
                      <td className={ui.actionsCell}>
                        {permisos.editar ? (
                          <div className={ui.actionsGroup}>
                            {tab === "cambios" ? (
                              f.vigente ? (
                                <>
                                  <button
                                    type="button"
                                    className={ui.rowButton}
                                    disabled={!confiable || ocupado}
                                    onClick={() => {
                                      if (ocupado || !confirmarDescarte()) return;
                                      abrir({ ...vacio(), id: f.id, fecha: f.fecha ?? "", monedaCodigo: f.monedaCodigo ?? "", cambio: formatearCambio(f.cambio ?? "") });
                                      enfocar("cambio");
                                    }}
                                  >
                                    Corregir
                                  </button>
                                  <button type="button" className={ui.rowButton} disabled={!confiable || ocupado} onClick={() => void anular(f)}>
                                    Anular
                                  </button>
                                </>
                              ) : null
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className={ui.rowButton}
                                  disabled={!confiable || ocupado}
                                  onClick={() => {
                                    if (ocupado || !confirmarDescarte()) return;
                                    abrir({ ...vacio(), id: f.id, codigo: f.codigo ?? "", nombre: f.nombre ?? "", version: typeof f.version === "string" ? f.version : undefined });
                                  }}
                                >
                                  Editar
                                </button>
                                <button type="button" className={ui.rowButton} disabled={!confiable || ocupado} onClick={() => void cambiarEstado(f)}>
                                  {f.activo ? "Inactivar" : "Activar"}
                                </button>
                              </>
                            )}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <footer className={ui.pagination}>
          <span>
            Mostrando {visibles.length === 0 ? 0 : (pagina - 1) * PAGE_SIZE + 1}–{Math.min(pagina * PAGE_SIZE, visibles.length)} de {visibles.length}
          </span>
          <div>
            <button type="button" aria-label="Página anterior" disabled={pagina === 1} onClick={() => setPagina((a) => a - 1)}>
              ‹
            </button>
            <strong>
              {pagina} / {totalPaginas}
            </strong>
            <button type="button" aria-label="Página siguiente" disabled={pagina === totalPaginas} onClick={() => setPagina((a) => a + 1)}>
              ›
            </button>
          </div>
        </footer>
      </section>
    </section>
  );
}
