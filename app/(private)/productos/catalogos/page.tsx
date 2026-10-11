"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

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

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={styles.modulePill}>MAESTROS</span>
          <h1>Catálogos de productos</h1>
          <p>Categorías, marcas, familias y líneas que alimentan la ficha de Productos.</p>
        </div>
        <div className={styles.actions}>
          <Link href="/productos" className={styles.secondaryButton}>
            ← Productos
          </Link>
          {permisos.crear ? (
            <button type="button" className={styles.primaryButton} onClick={() => { setForm({ ...VACIO }); setAviso(""); setError(""); }}>
              ＋ Nueva {meta.singular}
            </button>
          ) : null}
        </div>
      </header>

      <nav className={styles.tabs} aria-label="Catálogos">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={[styles.tab, tipo === t.id ? styles.tabActive : ""].join(" ")} onClick={() => cambiarTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {error ? <div className={styles.error}>{error}</div> : null}
      {aviso ? <div className={styles.ok}>{aviso}</div> : null}

      {form ? (
        <form className={styles.form} onSubmit={guardar}>
          <h3>{form.id ? `Editar ${meta.singular}` : `Nueva ${meta.singular}`}</h3>
          {tipo === "lineas" ? (
            <label className={styles.field}>
              <span>Familia *</span>
              <select value={form.familiaId} onChange={(e) => setForm({ ...form, familiaId: e.target.value })}>
                <option value="">Seleccione una familia</option>
                {familiasActivas.map((f) => (
                  <option key={f.id} value={f.id}>{f.nombre}{f.activo ? "" : " (inactiva)"}</option>
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
              <textarea maxLength={500} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
            </label>
          ) : null}
          <div className={styles.formActions}>
            <button type="button" className={styles.secondaryButton} onClick={() => setForm(null)}>Cancelar</button>
            <button type="submit" className={styles.primaryButton} disabled={guardando}>{guardando ? "Guardando..." : "Guardar"}</button>
          </div>
        </form>
      ) : null}

      <div className={styles.card}>
        <div className={styles.toolbar}>
          <input className={styles.search} placeholder="Buscar por nombre o código" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <div className={styles.filters}>
            {tipo === "lineas" ? (
              <select value={filtroFamilia} onChange={(e) => setFiltroFamilia(e.target.value)} aria-label="Familia">
                <option value="">Todas las familias</option>
                {familias.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
              </select>
            ) : null}
            <select value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)} aria-label="Estado">
              <option value="TODOS">Todos</option>
              <option value="ACTIVOS">Activos</option>
              <option value="INACTIVOS">Inactivos</option>
            </select>
          </div>
        </div>

        <div className={styles.head}>
          <span>Código</span><span>Nombre</span><span>{tipo === "lineas" ? "Familia" : ""}</span><span>{meta.descripcion ? "Descripción" : ""}</span><span>Productos</span><span>Estado</span><span>Acciones</span>
        </div>

        {cargando ? (
          <div className={styles.empty}><strong>Cargando...</strong></div>
        ) : visibles.length === 0 ? (
          <div className={styles.empty}>
            <strong>{filas.length === 0 ? `Todavía no hay ${meta.label.toLowerCase()} registradas.` : "Ningún registro coincide con los filtros."}</strong>
          </div>
        ) : (
          visibles.map((f) => (
            <div className={styles.row} key={f.id}>
              <span>{f.codigo || "—"}</span>
              <strong>{f.nombre}</strong>
              <span>{tipo === "lineas" ? f.familia : ""}</span>
              <span>{f.descripcion}</span>
              <span>{f.productos}</span>
              <span className={[styles.pill, f.activo ? styles.activo : styles.inactivo].join(" ")}>{f.activo ? "ACTIVO" : "INACTIVO"}</span>
              <div className={styles.actions}>
                {permisos.editar ? (
                  <>
                    <button type="button" className={styles.rowButton} onClick={() => { setForm({ id: f.id, codigo: f.codigo, nombre: f.nombre, descripcion: f.descripcion, familiaId: f.familiaId ?? "" }); setAviso(""); setError(""); }}>
                      Editar
                    </button>
                    <button type="button" className={styles.rowButton} onClick={() => void cambiarEstado(f)}>
                      {f.activo ? "Inactivar" : "Activar"}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
