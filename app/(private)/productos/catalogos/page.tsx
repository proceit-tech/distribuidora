"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { compararTexto, ordenarLista, siguienteOrden, type Orden } from "@/components/ui/lista-padrao/orden";
import { ThOrdenable } from "@/components/ui/lista-padrao/th-ordenable";
import ui from "@/components/ui/lista-padrao/lista.module.css";
import { cargaConfiable, cargarCatalogoCompleto, crearCompuerta, motivoBloqueoGuardar, permisosVigentes, textoConfirmarInactivacion, type FilaCatalogo } from "@/lib/productos/catalogos-carga";
import { crearExclusion, ejecutarCambioEstado } from "@/lib/productos/catalogos-operacion";
import { useProtegerCambios } from "@/lib/ui/proteger-cambios";
import {
  campoDeErrorServidor,
  formularioSucio,
  primerCampoConError,
  validarFormularioCatalogo,
  type CampoCatalogo,
  type ErroresCatalogo,
  type FormularioCatalogo,
} from "@/lib/productos/catalogos-formulario";

import styles from "./page.module.css";

type Tipo = "categorias" | "marcas" | "familias" | "lineas";

type Fila = FilaCatalogo;

const TABS: Array<{ id: Tipo; label: string; singular: string; descripcion: boolean }> = [
  { id: "categorias", label: "Categorías", singular: "categoría", descripcion: false },
  { id: "marcas", label: "Marcas", singular: "marca", descripcion: false },
  { id: "familias", label: "Familias", singular: "familia", descripcion: true },
  { id: "lineas", label: "Líneas", singular: "línea", descripcion: true },
];

const PAGE_SIZE = 20;
const SIN_CATEGORIA = "__sin__";

type CampoOrden = "codigo" | "nombre" | "familia" | "categoria" | "productos" | "estado";

const VACIO: FormularioCatalogo = { id: null, codigo: "", nombre: "", descripcion: "", familiaId: "", categoriaId: "" };

const idCampo = (campo: CampoCatalogo) => `cat-${campo}`;

export default function CatalogosProductosPage() {
  const [tipo, setTipo] = useState<Tipo>("categorias");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [familias, setFamilias] = useState<Fila[]>([]);
  const [categorias, setCategorias] = useState<Fila[]>([]);
  const [permisosCargados, setPermisos] = useState({ crear: false, editar: false });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // CAT-R02-01: fallo de la consulta principal. Separado de «error» (errores de acciones) para que guardar/abrir formularios no lo borren.
  const [errorCarga, setErrorCarga] = useState("");
  // CAT-A01: fallo de un catálogo auxiliar (Familias/Categorías): la lista se muestra, pero no se permite crear ni editar asociaciones con opciones insuficientes.
  const [errorAuxiliar, setErrorAuxiliar] = useState("");
  const [aviso, setAviso] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState<"TODOS" | "ACTIVOS" | "INACTIVOS">("TODOS");
  const [filtroFamilia, setFiltroFamilia] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [form, setForm] = useState<FormularioCatalogo | null>(null);
  const [base, setBase] = useState<FormularioCatalogo | null>(null);
  const [errores, setErrores] = useState<ErroresCatalogo>({});
  const [errorForm, setErrorForm] = useState("");
  const [guardando, setGuardando] = useState(false);
  // CAT-D01: una gravación (guardar o cambiar estado) en curso es exclusiva: mientras dura no se cambia de pestaña, no se abre/cancela otro formulario ni se lanza otra escritura.
  const [ocupado, setOcupado] = useState(false);
  const exclusion = useRef(crearExclusion());
  const [orden, setOrden] = useState<Orden<CampoOrden>>(null);
  const [paginacion, setPaginacion] = useState({ clave: "", pagina: 1 });

  const estadoCarga = { cargando, errorCarga, errorAuxiliar };
  const confiable = cargaConfiable(estadoCarga);
  const permisos = permisosVigentes(permisosCargados, estadoCarga);
  const meta = TABS.find((t) => t.id === tipo)!;
  const sucio = formularioSucio(form, base);
  // Familia histórica sin categoría: se puede editar e inactivar sin clasificarla; la categoría se asigna manualmente cuando corresponda.
  const categoriaPendiente = tipo === "familias" && form?.id !== null && base?.categoriaId === "";

  // CAT-A02: solo la última solicitud iniciada (de la pestaña actual) puede escribir en pantalla; una respuesta lenta de otra pestaña se descarta.
  const compuerta = useRef(crearCompuerta());

  // CAT-D02: `preservarError` conserva el error de una acción (409/403/500) durante la recarga que la sigue.
  const cargar = useCallback(async (opciones: { preservarError?: boolean } = {}) => {
    const solicitud = compuerta.current.nueva();

    setCargando(true);
    if (!opciones.preservarError) setError("");
    setErrorCarga("");
    setErrorAuxiliar("");

    const r = await cargarCatalogoCompleto(tipo, (url) => fetch(url, { cache: "no-store" }));

    if (!compuerta.current.vigente(solicitud)) return;

    if (r.error) {
      setFilas([]);
      setPermisos({ crear: false, editar: false });
      setFamilias([]);
      setCategorias([]);
      setErrorCarga(r.error);
    } else {
      setFilas(r.filas);
      setPermisos(r.permisos);
      if (r.familias) setFamilias(r.familias);
      if (r.categorias) setCategorias(r.categorias);
      setErrorAuxiliar(r.errorAuxiliar);

      if (r.errorAuxiliar) {
        if (!r.familias) setFamilias([]);
        if (!r.categorias) setCategorias([]);
      }
    }
    setCargando(false);
  }, [tipo]);

  useEffect(() => {
    // Carga inicial y al cambiar de pestaña (diferida para no actualizar el estado de forma síncrona dentro del efecto).
    void Promise.resolve().then(() => cargar());
  }, [cargar]);

  // CAT-A03: aviso al recargar/cerrar y al usar CUALQUIER enlace interno (menú lateral, «Productos»), con el mismo guard de Clientes/Productos; sin aviso si el formulario está intacto.
  useProtegerCambios(sucio);

  /** Política única: solo se pide confirmación si hay cambios efectivos sin guardar. */
  function confirmarDescarte(): boolean {
    return !sucio || window.confirm("Hay cambios sin guardar en el formulario. Si continúa, se perderán. ¿Desea continuar?");
  }

  function abrirFormulario(f: FormularioCatalogo) {
    setForm(f);
    setBase(f);
    setErrores({});
    setErrorForm("");
    setAviso("");
    setError("");
  }

  function cerrarFormulario() {
    setForm(null);
    setBase(null);
    setErrores({});
    setErrorForm("");
  }

  function cambiarTab(nuevo: Tipo) {
    if (exclusion.current.activa() || nuevo === tipo || !confirmarDescarte()) return;

    // CAT-R02-01: los permisos y datos de la pestaña anterior no valen para la nueva mientras no llegue su carga.
    setCargando(true);
    setPermisos({ crear: false, editar: false });
    setTipo(nuevo);
    setOrden(null);
    cerrarFormulario();
    setBusqueda("");
    setEstado("TODOS");
    setFiltroFamilia("");
    setFiltroCategoria("");
    setAviso("");
    setError("");
  }

  function actualizar(campo: CampoCatalogo, valor: string) {
    setForm((actual) => (actual ? { ...actual, [campo]: valor } : actual));
    setErrores((actual) => (actual[campo] ? { ...actual, [campo]: undefined } : actual));
  }

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (estado === "ACTIVOS" && !f.activo) return false;
      if (estado === "INACTIVOS" && f.activo) return false;
      if (filtroFamilia && f.familiaId !== filtroFamilia) return false;
      if (filtroCategoria === SIN_CATEGORIA && (f.categoriaId ?? null) !== null) return false;
      if (filtroCategoria && filtroCategoria !== SIN_CATEGORIA && f.categoriaId !== filtroCategoria) return false;
      return !q || f.nombre.toLowerCase().includes(q) || f.codigo.toLowerCase().includes(q);
    });
  }, [filas, busqueda, estado, filtroFamilia, filtroCategoria]);

  // Ordenación sobre el conjunto filtrado COMPLETO (toda la lista está cargada), antes de paginar.
  const ordenados = useMemo(
    () =>
      ordenarLista(visibles, orden, (campo, a, b) => {
        switch (campo) {
          case "codigo":
            return compararTexto(a.codigo, b.codigo);
          case "nombre":
            return compararTexto(a.nombre, b.nombre);
          case "familia":
            return compararTexto(a.familia ?? "", b.familia ?? "");
          case "categoria":
            return compararTexto(a.categoria ?? "", b.categoria ?? "");
          case "productos":
            return a.productos - b.productos;
          case "estado":
            return Number(b.activo) - Number(a.activo);
        }
      }),
    [visibles, orden],
  );

  function cambiarOrden(campo: CampoOrden) {
    setOrden((actual) => siguienteOrden(actual, campo));
  }

  const totalPaginas = Math.max(1, Math.ceil(visibles.length / PAGE_SIZE));

  // La página vuelve a 1 cuando cambian los filtros o el orden y nunca excede el total: se deriva en el render (sin efecto).
  const claveFiltros = JSON.stringify([tipo, busqueda, estado, filtroFamilia, filtroCategoria, orden]);
  const pagina = paginacion.clave === claveFiltros ? Math.min(paginacion.pagina, totalPaginas) : 1;
  const setPagina = (valor: number | ((actual: number) => number)) =>
    setPaginacion({ clave: claveFiltros, pagina: typeof valor === "function" ? valor(pagina) : valor });

  const paginaActual = useMemo(
    () => ordenados.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE),
    [ordenados, pagina],
  );

  async function enviar(url: string, metodo: "POST" | "PUT", cuerpo: Record<string, unknown>) {
    const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    const j = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!r.ok) throw new Error(j.error ?? "No fue posible guardar.");
    return j;
  }

  function enfocar(campo: CampoCatalogo | null) {
    if (campo) window.setTimeout(() => document.getElementById(idCampo(campo))?.focus(), 0);
  }

  async function guardar(event: FormEvent) {
    event.preventDefault();
    if (!form || exclusion.current.activa()) return;
    setError("");
    setAviso("");
    setErrorForm("");

    // CAT-R02-01: sin datos confiables (carga en curso o fallida) no se envía nada; el borrador queda intacto.
    const bloqueo = motivoBloqueoGuardar(estadoCarga);

    if (bloqueo) {
      setErrorForm(bloqueo);

      return;
    }

    const locales = validarFormularioCatalogo(tipo, form, categoriaPendiente);

    if (primerCampoConError(locales)) {
      setErrores(locales);
      enfocar(primerCampoConError(locales));

      return;
    }

    setErrores({});
    setGuardando(true);
    setOcupado(true);
    await exclusion.current.ejecutar(async () => {
    try {
      const cuerpo: Record<string, unknown> = { codigo: form.codigo, nombre: form.nombre };
      if (meta.descripcion) cuerpo.descripcion = form.descripcion;
      if (tipo === "lineas") cuerpo.familiaId = form.familiaId;
      if (tipo === "familias") cuerpo.categoriaId = form.categoriaId;
      if (form.id) cuerpo.version = form.version;
      const j = form.id ? await enviar(`/api/productos/${tipo}/${form.id}`, "PUT", cuerpo) : await enviar(`/api/productos/${tipo}`, "POST", cuerpo);
      setAviso(j.message ?? "Guardado correctamente.");
      cerrarFormulario();
      await cargar();
    } catch (e) {
      // El formulario se mantiene abierto con lo escrito: el error se muestra junto al campo (o arriba si es general).
      const mensaje = e instanceof Error ? e.message : "No fue posible guardar.";
      const campo = campoDeErrorServidor(tipo, mensaje);

      if (campo) {
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

  async function cambiarEstado(fila: Fila) {
    if (exclusion.current.activa()) return;
    setError("");
    setAviso("");

    const bloqueo = motivoBloqueoGuardar(estadoCarga);

    if (bloqueo) {
      setError(bloqueo);

      return;
    }

    // CAT-A05: confirmación con los descendientes reales (familias/líneas), sin cascada.
    const confirmar = textoConfirmarInactivacion(tipo, fila);

    if (confirmar && !window.confirm(confirmar)) return;

    setOcupado(true);
    await exclusion.current.ejecutar(async () => {
      try {
        await ejecutarCambioEstado({
          enviar: () => {
            const cuerpo: Record<string, unknown> = { codigo: fila.codigo, nombre: fila.nombre, activo: !fila.activo, version: fila.version };
            if (meta.descripcion) cuerpo.descripcion = fila.descripcion;
            if (tipo === "lineas") cuerpo.familiaId = fila.familiaId;

            return enviar(`/api/productos/${tipo}/${fila.id}`, "PUT", cuerpo);
          },
          alExito: () => setAviso(fila.activo ? "Registro inactivado. Sus productos conservan el vínculo." : "Registro activado."),
          alError: (m) => setError(m),
          recargar: (o) => cargar({ preservarError: o.preservarError }), // CAT-A06: ante un 409 se muestran los datos vigentes sin perder el error de la acción
        });
      } finally {
        setOcupado(false);
      }
    });
  }

  const familiasActivas = familias.filter((f) => f.activo || f.id === form?.familiaId);
  const categoriasActivas = categorias.filter((c) => c.activo || c.id === form?.categoriaId);
  const conCategoria = tipo === "familias" || tipo === "lineas";

  const columnas = 5 + (tipo === "lineas" ? 1 : 0) + (conCategoria ? 1 : 0) + (meta.descripcion ? 1 : 0);

  const claseCampo = (campo: CampoCatalogo, extra = "") => [styles.field, errores[campo] ? styles.conError : "", extra].filter(Boolean).join(" ");
  const ariaCampo = (campo: CampoCatalogo) => ({
    id: idCampo(campo),
    "aria-invalid": errores[campo] ? true : undefined,
    "aria-describedby": errores[campo] ? `${idCampo(campo)}-error` : undefined,
  });
  const mensajeCampo = (campo: CampoCatalogo) =>
    errores[campo] ? (
      <span id={`${idCampo(campo)}-error`} className={styles.campoError} role="alert">
        {errores[campo]}
      </span>
    ) : null;

  return (
    <section className={ui.page}>
      <header className={ui.topbar}>
        <div className={ui.titleBlock}>
          <nav className={ui.breadcrumb} aria-label="Ruta de navegación">
            <span>Maestros</span>
            <i aria-hidden="true">/</i>
            <Link href="/productos">Productos</Link>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Catálogos</span>
          </nav>

          <h1>Catálogos de productos</h1>
        </div>

        <div className={ui.actionsGroup}>
          <Link
            href="/productos"
            className={ui.secondaryButton}
          >
            ← Productos
          </Link>
          {permisos.crear ? (
            <button
              type="button"
              className={ui.primaryButton}
              disabled={ocupado}
              onClick={() => {
                if (ocupado || !confirmarDescarte()) return;
                abrirFormulario({ ...VACIO });
                enfocar(tipo === "familias" ? "categoriaId" : tipo === "lineas" ? "familiaId" : "codigo");
              }}
            >
              <span aria-hidden="true">+</span>
              Nueva {meta.singular}
            </button>
          ) : null}
        </div>
      </header>

      <nav className={ui.tabs} aria-label="Catálogos">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={[ui.tab, tipo === t.id ? ui.tabActive : ""].join(" ")}
            aria-current={tipo === t.id ? "page" : undefined}
            disabled={ocupado}
            onClick={() => cambiarTab(t.id)}
          >
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
          {errorCarga} No se puede crear, editar ni guardar hasta recargar correctamente.{form ? " Lo escrito en el formulario se conserva." : ""}
        </div>
      ) : null}
      {errorAuxiliar ? (
        <div className={ui.alertError} role="alert">
          No se pudieron cargar los catálogos auxiliares: {errorAuxiliar}. Por seguridad no se puede crear ni editar hasta recargar.
        </div>
      ) : null}
      {aviso ? (
        <div className={ui.alertOk} role="status">
          {aviso}
        </div>
      ) : null}

      {form ? (
        <form className={styles.form} onSubmit={guardar} noValidate aria-label={form.id ? `Editar ${meta.singular}` : `Nueva ${meta.singular}`}>
          <h3>{form.id ? `Editar ${meta.singular}` : `Nueva ${meta.singular}`}</h3>
          {errorForm ? (
            <div className={styles.alertaForm} role="alert">
              {errorForm}
            </div>
          ) : null}
          {tipo === "familias" && categoriaPendiente ? (
            <p className={styles.nota}>
              <span className={styles.sinClasificar}>Esta familia histórica todavía no tiene categoría.</span> Asígnela cuando corresponda; no se completa automáticamente.
            </p>
          ) : null}

          {tipo === "familias" ? (
            <label className={claseCampo("categoriaId", styles.wide)}>
              <span>
                Categoría {categoriaPendiente ? "" : <b>*</b>}
              </span>
              <select {...ariaCampo("categoriaId")} value={form.categoriaId} onChange={(e) => actualizar("categoriaId", e.target.value)}>
                <option value="">{categoriaPendiente ? "Sin categoría (pendiente de clasificar)" : "Seleccione una categoría"}</option>
                {categoriasActivas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                    {c.activo ? "" : " (inactiva)"}
                  </option>
                ))}
              </select>
              {mensajeCampo("categoriaId")}
            </label>
          ) : null}
          {tipo === "lineas" ? (
            <label className={claseCampo("familiaId", styles.wide)}>
              <span>
                Familia <b>*</b>
              </span>
              <select {...ariaCampo("familiaId")} value={form.familiaId} onChange={(e) => actualizar("familiaId", e.target.value)}>
                <option value="">Seleccione una familia</option>
                {familiasActivas.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nombre}
                    {f.categoria ? ` · ${f.categoria}` : " · sin categoría"}
                    {f.activo ? "" : " (inactiva)"}
                  </option>
                ))}
              </select>
              {mensajeCampo("familiaId")}
            </label>
          ) : null}
          <label className={claseCampo("codigo")}>
            <span>Código</span>
            <input {...ariaCampo("codigo")} maxLength={40} value={form.codigo} onChange={(e) => actualizar("codigo", e.target.value)} />
            {mensajeCampo("codigo")}
          </label>
          <label className={claseCampo("nombre", styles.wide)}>
            <span>
              Nombre <b>*</b>
            </span>
            <input {...ariaCampo("nombre")} maxLength={120} value={form.nombre} onChange={(e) => actualizar("nombre", e.target.value)} />
            {mensajeCampo("nombre")}
          </label>
          {meta.descripcion ? (
            <label className={claseCampo("descripcion", styles.full)}>
              <span>Descripción</span>
              <textarea {...ariaCampo("descripcion")} maxLength={500} rows={2} value={form.descripcion} onChange={(e) => actualizar("descripcion", e.target.value)} />
              {mensajeCampo("descripcion")}
            </label>
          ) : null}
          <div className={styles.formActions}>
            <button
              type="button"
              className={ui.secondaryButton}
              disabled={ocupado}
              onClick={() => {
                if (!ocupado && confirmarDescarte()) cerrarFormulario();
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
            <input
              placeholder="Buscar por nombre o código"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              aria-label="Buscar en el catálogo"
            />
          </label>

          {conCategoria ? (
            <label className={ui.filterField}>
              <span>Categoría</span>
              <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
                <option value="">Todas las categorías</option>
                <option value={SIN_CATEGORIA}>Sin categoría (por clasificar)</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {tipo === "lineas" ? (
            <label className={ui.filterField}>
              <span>Familia</span>
              <select value={filtroFamilia} onChange={(e) => setFiltroFamilia(e.target.value)}>
                <option value="">Todas las familias</option>
                {familias.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nombre}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className={ui.filterField}>
            <span>Estado</span>
            <select value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)}>
              <option value="TODOS">Todos</option>
              <option value="ACTIVOS">Activos</option>
              <option value="INACTIVOS">Inactivos</option>
            </select>
          </label>

          <button
            type="button"
            className={ui.clearButton}
            onClick={() => {
              setBusqueda("");
              setEstado("TODOS");
              setFiltroFamilia("");
              setFiltroCategoria("");
            }}
          >
            Limpiar filtros
          </button>

          <span className={ui.resultCount} aria-live="polite">
            {visibles.length} de {filas.length}
          </span>
        </div>

        <div className={ui.tableScroll}>
          <table className={ui.table} style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <ThOrdenable titulo="Código" campo="codigo" orden={orden} onOrden={cambiarOrden} className={ui.colCodigo} />
                <ThOrdenable titulo="Nombre" campo="nombre" orden={orden} onOrden={cambiarOrden} />
                {conCategoria ? <ThOrdenable titulo="Categoría" campo="categoria" orden={orden} onOrden={cambiarOrden} /> : null}
                {tipo === "lineas" ? (
                  <ThOrdenable titulo="Familia" campo="familia" orden={orden} onOrden={cambiarOrden} />
                ) : null}
                {meta.descripcion ? <ThOrdenable titulo="Descripción" /> : null}
                <ThOrdenable titulo="Productos (total)" campo="productos" orden={orden} onOrden={cambiarOrden} alinear="derecha" className={ui.colNumero} />
                <ThOrdenable titulo="Estado" campo="estado" orden={orden} onOrden={cambiarOrden} className={ui.colEstado} />
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
                      <strong>
                        {filas.length === 0
                          ? `Todavía no hay ${meta.label.toLowerCase()} registradas`
                          : "Ningún registro coincide con los filtros"}
                      </strong>
                      {filas.length === 0 && permisos.crear ? (
                        <span>Cree la primera {meta.singular} con el botón Nueva {meta.singular}.</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : (
                paginaActual.map((f) => (
                  <tr key={f.id} className={ui.row}>
                    <td>
                      {f.codigo ? <span className={[ui.code, ui.mono].join(" ")}>{f.codigo}</span> : <span className={[ui.code, ui.muted].join(" ")}>Sin código</span>}
                    </td>
                    <td>
                      <span className={ui.principal}>{f.nombre}</span>
                    </td>
                    {conCategoria ? <td>{f.categoria ? f.categoria : <span className={ui.muted}>Sin categoría</span>}</td> : null}
                    {tipo === "lineas" ? <td>{f.familia}</td> : null}
                    {meta.descripcion ? <td className={ui.breakable}>{f.descripcion}</td> : null}
                    <td className={ui.numeric}>
                      <span className={ui.mono}>{f.productos}</span>
                    </td>
                    <td>
                      <span className={f.activo ? ui.statusActive : ui.statusInactive}>
                        {f.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className={ui.actionsCell}>
                      {permisos.editar ? (
                        <div className={ui.actionsGroup}>
                          <button
                            type="button"
                            className={ui.rowButton}
                            disabled={!confiable || ocupado}
                            title={confiable ? undefined : "No se puede editar mientras falle la carga del catálogo o de los catálogos auxiliares."}
                            onClick={() => {
                              if (ocupado || !confirmarDescarte()) return;
                              abrirFormulario({
                                id: f.id,
                                version: f.version,
                                codigo: f.codigo,
                                nombre: f.nombre,
                                descripcion: f.descripcion,
                                familiaId: f.familiaId ?? "",
                                categoriaId: tipo === "familias" ? (f.categoriaId ?? "") : "",
                              });
                            }}
                          >
                            Editar
                          </button>
                          <button type="button" className={ui.rowButton} disabled={!confiable || ocupado} onClick={() => void cambiarEstado(f)}>
                            {f.activo ? "Inactivar" : "Activar"}
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <footer className={ui.pagination}>
          <span>
            Mostrando {visibles.length === 0 ? 0 : (pagina - 1) * PAGE_SIZE + 1}–
            {Math.min(pagina * PAGE_SIZE, visibles.length)} de {visibles.length}
          </span>

          <div>
            <button
              type="button"
              aria-label="Página anterior"
              disabled={pagina === 1}
              onClick={() => setPagina((actual) => actual - 1)}
            >
              ‹
            </button>

            <strong>
              {pagina} / {totalPaginas}
            </strong>

            <button
              type="button"
              aria-label="Página siguiente"
              disabled={pagina === totalPaginas}
              onClick={() => setPagina((actual) => actual + 1)}
            >
              ›
            </button>
          </div>
        </footer>
      </section>
    </section>
  );
}
