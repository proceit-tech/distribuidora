"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { compararTexto, ordenarLista, siguienteOrden, type Orden } from "@/components/ui/lista-padrao/orden";
import { ThOrdenable } from "@/components/ui/lista-padrao/th-ordenable";
import ui from "@/components/ui/lista-padrao/lista.module.css";

import styles from "./page.module.css";

type Tipo = "categorias" | "marcas" | "familias" | "lineas";

type Fila = {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  activo: boolean;
  productos: number;
  familiaId?: string;
  familia?: string;
};

type Formulario = {
  id: string | null;
  codigo: string;
  nombre: string;
  descripcion: string;
  familiaId: string;
};

const TABS: Array<{ id: Tipo; label: string; singular: string; descripcion: boolean }> = [
  { id: "categorias", label: "Categorías", singular: "categoría", descripcion: false },
  { id: "marcas", label: "Marcas", singular: "marca", descripcion: false },
  { id: "familias", label: "Familias", singular: "familia", descripcion: true },
  { id: "lineas", label: "Líneas", singular: "línea", descripcion: true },
];

const PAGE_SIZE = 20;

type CampoOrden = "codigo" | "nombre" | "familia" | "productos" | "estado";

const VACIO: Formulario = { id: null, codigo: "", nombre: "", descripcion: "", familiaId: "" };

export default function CatalogosProductosPage() {
  const [tipo, setTipo] = useState<Tipo>("categorias");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [familias, setFamilias] = useState<Fila[]>([]);
  const [permisos, setPermisos] = useState({ crear: false, editar: false });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState<"TODOS" | "ACTIVOS" | "INACTIVOS">("TODOS");
  const [filtroFamilia, setFiltroFamilia] = useState("");
  const [form, setForm] = useState<Formulario | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [orden, setOrden] = useState<Orden<CampoOrden>>(null);
  const [pagina, setPagina] = useState(1);

  const meta = TABS.find((t) => t.id === tipo)!;

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const [r, rf] = await Promise.all([
        fetch(`/api/productos/${tipo}`, { cache: "no-store" }),
        tipo === "lineas" ? fetch("/api/productos/familias", { cache: "no-store" }) : Promise.resolve(null),
      ]);
      const j = (await r.json()) as Record<string, unknown> & { error?: string; permisos?: { crear: boolean; editar: boolean } };
      if (!r.ok) throw new Error(j.error ?? "No fue posible cargar el catálogo.");
      setFilas((j[tipo] as Fila[] | undefined) ?? []);
      setPermisos(j.permisos ?? { crear: false, editar: false });
      if (rf) {
        const jf = (await rf.json()) as { familias?: Fila[] };
        setFamilias(jf.familias ?? []);
      }
    } catch (e) {
      setFilas([]);
      setError(e instanceof Error ? e.message : "No fue posible cargar el catálogo.");
    } finally {
      setCargando(false);
    }
  }, [tipo]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function cambiarTab(nuevo: Tipo) {
    setTipo(nuevo);
    setOrden(null);
    setForm(null);
    setBusqueda("");
    setEstado("TODOS");
    setFiltroFamilia("");
    setAviso("");
    setError("");
  }

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (estado === "ACTIVOS" && !f.activo) return false;
      if (estado === "INACTIVOS" && f.activo) return false;
      if (filtroFamilia && f.familiaId !== filtroFamilia) return false;
      return !q || f.nombre.toLowerCase().includes(q) || f.codigo.toLowerCase().includes(q);
    });
  }, [filas, busqueda, estado, filtroFamilia]);

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

  useEffect(() => {
    setPagina(1);
  }, [tipo, busqueda, estado, filtroFamilia, orden]);

  useEffect(() => {
    if (pagina > totalPaginas) {
      setPagina(totalPaginas);
    }
  }, [pagina, totalPaginas]);

  const paginaActual = useMemo(
    () => ordenados.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE),
    [ordenados, pagina],
  );

  async function enviar(url: string, metodo: "POST" | "PUT", cuerpo: Record<string, unknown>) {
    const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    const j = (await r.json()) as { error?: string; message?: string };
    if (!r.ok) throw new Error(j.error ?? "No fue posible guardar.");
    return j;
  }

  async function guardar(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setError("");
    setAviso("");
    if (!form.nombre.trim()) return setError("El nombre es obligatorio.");
    if (tipo === "lineas" && !form.familiaId) return setError("Seleccione la familia de la línea.");
    setGuardando(true);
    try {
      const cuerpo: Record<string, unknown> = { codigo: form.codigo, nombre: form.nombre };
      if (meta.descripcion) cuerpo.descripcion = form.descripcion;
      if (tipo === "lineas") cuerpo.familiaId = form.familiaId;
      const j = form.id ? await enviar(`/api/productos/${tipo}/${form.id}`, "PUT", cuerpo) : await enviar(`/api/productos/${tipo}`, "POST", cuerpo);
      setAviso(j.message ?? "Guardado correctamente.");
      setForm(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No fue posible guardar.");
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarEstado(fila: Fila) {
    setError("");
    setAviso("");
    try {
      const cuerpo: Record<string, unknown> = { codigo: fila.codigo, nombre: fila.nombre, activo: !fila.activo };
      if (meta.descripcion) cuerpo.descripcion = fila.descripcion;
      if (tipo === "lineas") cuerpo.familiaId = fila.familiaId;
      await enviar(`/api/productos/${tipo}/${fila.id}`, "PUT", cuerpo);
      setAviso(fila.activo ? "Registro inactivado. Sus productos conservan el vínculo." : "Registro activado.");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No fue posible cambiar el estado.");
    }
  }

  const familiasActivas = familias.filter((f) => f.activo || f.id === form?.familiaId);

  const columnas = 5 + (tipo === "lineas" ? 1 : 0) + (meta.descripcion ? 1 : 0);

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
          <Link href="/productos" className={ui.secondaryButton}>
            ← Productos
          </Link>
          {permisos.crear ? (
            <button
              type="button"
              className={ui.primaryButton}
              onClick={() => {
                setForm({ ...VACIO });
                setAviso("");
                setError("");
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
      {aviso ? (
        <div className={ui.alertOk} role="status">
          {aviso}
        </div>
      ) : null}

      {form ? (
        <form className={styles.form} onSubmit={guardar}>
          <h3>{form.id ? `Editar ${meta.singular}` : `Nueva ${meta.singular}`}</h3>
          {tipo === "lineas" ? (
            <label className={styles.field}>
              <span>Familia *</span>
              <select value={form.familiaId} onChange={(e) => setForm({ ...form, familiaId: e.target.value })}>
                <option value="">Seleccione una familia</option>
                {familiasActivas.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nombre}
                    {f.activo ? "" : " (inactiva)"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className={styles.field}>
            <span>Código</span>
            <input maxLength={40} value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
          </label>
          <label className={[styles.field, styles.wide].join(" ")}>
            <span>Nombre *</span>
            <input maxLength={120} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </label>
          {meta.descripcion ? (
            <label className={[styles.field, styles.wide].join(" ")}>
              <span>Descripción</span>
              <textarea
                maxLength={500}
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              />
            </label>
          ) : null}
          <div className={styles.formActions}>
            <button type="button" className={ui.secondaryButton} onClick={() => setForm(null)}>
              Cancelar
            </button>
            <button type="submit" className={ui.primaryButton} disabled={guardando}>
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
                <ThOrdenable titulo="Código" campo="codigo" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Nombre" campo="nombre" orden={orden} onOrden={cambiarOrden} />
                {tipo === "lineas" ? (
                  <ThOrdenable titulo="Familia" campo="familia" orden={orden} onOrden={cambiarOrden} />
                ) : null}
                {meta.descripcion ? <ThOrdenable titulo="Descripción" /> : null}
                <ThOrdenable titulo="Productos" campo="productos" orden={orden} onOrden={cambiarOrden} alinear="derecha" />
                <ThOrdenable titulo="Estado" campo="estado" orden={orden} onOrden={cambiarOrden} />
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
                      {f.codigo ? <span className={ui.mono}>{f.codigo}</span> : <span className={ui.muted}>Sin código</span>}
                    </td>
                    <td>
                      <strong>{f.nombre}</strong>
                    </td>
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
                            onClick={() => {
                              setForm({
                                id: f.id,
                                codigo: f.codigo,
                                nombre: f.nombre,
                                descripcion: f.descripcion,
                                familiaId: f.familiaId ?? "",
                              });
                              setAviso("");
                              setError("");
                            }}
                          >
                            Editar
                          </button>
                          <button type="button" className={ui.rowButton} onClick={() => void cambiarEstado(f)}>
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
