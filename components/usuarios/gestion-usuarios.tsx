"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import ui from "@/components/ui/lista-padrao/lista.module.css";

import estilos from "./gestion-usuarios.module.css";

/**
 * Administración de usuarios de la EMPRESA (modo «usuarios», solo administrador de empresa) y Maestros → Vendedores (modo «vendedores»: usuarios con el perfil Vendedor).
 * No hay editor de perfiles: el administrador solo asigna o retira los nueve perfiles predefinidos. Todo el control real está en las APIs y en la base; esta pantalla solo presenta.
 */
type Modo = "usuarios" | "vendedores";
type Perfil = { codigo: string; nombre: string };
type Fila = { id: string; usuario: string; nombre: string; apellido: string | null; email: string | null; estado: string; perfiles?: Perfil[]; ultimoAcceso?: string | null };
type Catalogo = { id: string; codigo: string; nombre: string };
type Formulario = { id: string | null; usuario: string; nombre: string; apellido: string; email: string; contrasena: string; perfiles: string[] };

const POR_PAGINA = 10;
const VACIO: Formulario = { id: null, usuario: "", nombre: "", apellido: "", email: "", contrasena: "", perfiles: [] };

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };

  if (!r.ok) throw new Error(j.error ?? "No fue posible completar la operación.");

  return j;
}

const json = (metodo: string, cuerpo: unknown): RequestInit => ({ method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
const nombreCompleto = (f: Fila) => `${f.nombre} ${f.apellido ?? ""}`.trim();

export function GestionUsuarios({ modo }: { modo: Modo }) {
  const esVendedores = modo === "vendedores";
  const [texto, setTexto] = useState("");
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<"TODOS" | "ACTIVO" | "INACTIVO">("TODOS");
  const [pagina, setPagina] = useState(1);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [puedeGestionar, setPuedeGestionar] = useState(!esVendedores);
  const [catalogo, setCatalogo] = useState<Catalogo[]>([]);
  const [form, setForm] = useState<{ tipo: "alta" | "datos" | "perfiles"; datos: Formulario } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => { setQ(texto.trim()); setPagina(1); }, 300);

    return () => window.clearTimeout(t);
  }, [texto]);

  useEffect(() => {
    let activo = true;
    const url = esVendedores
      ? `/api/vendedores?q=${encodeURIComponent(q)}&estado=${estado}&pagina=${pagina}&porPagina=${POR_PAGINA}`
      : `/api/usuarios?q=${encodeURIComponent(q)}&pagina=${pagina}&porPagina=${POR_PAGINA}`;

    pedir<Record<string, unknown>>(url)
      .then((j) => {
        if (!activo) return;

        const lista = (esVendedores ? j.vendedores : j.usuarios) as Array<Record<string, unknown>>;

        setFilas(lista.map((x) => ({ id: String(x.id), usuario: String(x.usuario), nombre: String(x.nombre), apellido: (x.apellido as string | null) ?? null, email: (x.email as string | null) || null, estado: String(x.estado), perfiles: x.perfiles as Perfil[] | undefined, ultimoAcceso: (x.ultimoAcceso as string | null | undefined) ?? null })));
        setTotal(Number(j.total ?? 0));
        if (esVendedores) setPuedeGestionar(j.puedeGestionar === true);
        setError("");
        setCargando(false);
      })
      .catch((e: unknown) => {
        if (!activo) return;

        setError(e instanceof Error ? e.message : "No fue posible cargar la lista.");
        setCargando(false);
      });

    return () => { activo = false; };
  }, [esVendedores, q, estado, pagina, version]);

  const recargar = useCallback(() => { setCargando(true); setVersion((v) => v + 1); }, []);

  async function cargarCatalogo() {
    if (catalogo.length > 0) return;

    try {
      setCatalogo((await pedir<{ perfiles: Catalogo[] }>("/api/usuarios/perfiles")).perfiles);
    } catch (e) {
      setErrorForm(e instanceof Error ? e.message : "No fue posible cargar los perfiles.");
    }
  }

  function abrir(tipo: "alta" | "datos" | "perfiles", fila?: Fila) {
    setErrorForm("");
    setAviso("");
    setForm({
      tipo,
      datos: fila
        ? { ...VACIO, id: fila.id, usuario: fila.usuario, nombre: fila.nombre, apellido: fila.apellido ?? "", email: fila.email ?? "", perfiles: (fila.perfiles ?? []).map((p) => p.codigo) }
        : { ...VACIO, perfiles: esVendedores ? ["VENDEDOR"] : [] },
    });
    if (tipo !== "datos" && !(esVendedores && tipo === "alta")) void cargarCatalogo();
  }

  async function guardar() {
    if (!form) return;

    const d = form.datos;

    setGuardando(true);
    setErrorForm("");
    try {
      if (form.tipo === "alta") {
        await pedir("/api/usuarios", json("POST", { usuario: d.usuario, nombre: d.nombre, apellido: d.apellido, email: d.email, contrasena: d.contrasena, perfiles: d.perfiles }));
        setAviso(`${esVendedores ? "Vendedor" : "Usuario"} «${d.usuario.trim().toLowerCase()}» creado. Deberá cambiar su contraseña inicial.`);
      } else if (form.tipo === "datos" && d.id) {
        await pedir(`/api/usuarios/${d.id}`, json("PATCH", { nombre: d.nombre, apellido: d.apellido, email: d.email }));
        setAviso("Datos actualizados.");
      } else if (form.tipo === "perfiles" && d.id) {
        await pedir(`/api/usuarios/${d.id}/perfiles`, json("PUT", { perfiles: d.perfiles }));
        setAviso("Perfiles actualizados. Las sesiones anteriores del usuario fueron cerradas.");
      }
      setForm(null);
      recargar();
    } catch (e) {
      setErrorForm(e instanceof Error ? e.message : "No fue posible completar la operación.");
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarEstado(f: Fila) {
    const activar = f.estado !== "ACTIVO";

    if (!activar && !window.confirm(`¿Desactivar a ${nombreCompleto(f)}? Se cerrarán sus sesiones${esVendedores ? " y dejará de aparecer para elegir en las facturas nuevas" : ""}.`)) return;

    setAviso("");
    try {
      await pedir(`/api/usuarios/${f.id}/estado`, json("POST", { activo: activar }));
      setAviso(`${nombreCompleto(f)} ${activar ? "activado" : "desactivado"}.`);
      recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No fue posible cambiar el estado.");
    }
  }

  const alternarPerfil = (codigo: string) => setForm((f) => (f ? { ...f, datos: { ...f.datos, perfiles: f.datos.perfiles.includes(codigo) ? f.datos.perfiles.filter((c) => c !== codigo) : [...f.datos.perfiles, codigo] } } : f));
  const campo = (k: keyof Formulario, v: string) => setForm((f) => (f ? { ...f, datos: { ...f.datos, [k]: v } } : f));
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const titulo = esVendedores ? "Vendedores" : "Usuarios";
  const altaValida = form?.tipo !== "alta" || (form.datos.usuario.trim().length >= 3 && form.datos.nombre.trim() !== "" && form.datos.contrasena.length >= 10);

  return (
    <section className={ui.page}>
      <header className={ui.topbar}>
        <div className={ui.titleBlock}>
          <nav className={ui.breadcrumb} aria-label="Ruta de navegación">
            <span>{esVendedores ? "Maestros" : "Administración"}</span>
            <i aria-hidden="true">/</i>
            <span aria-current="page">{titulo}</span>
          </nav>
          <h1>{titulo}</h1>
        </div>
        {puedeGestionar ? <button type="button" className={ui.primaryButton} onClick={() => abrir("alta")}>{esVendedores ? "Nuevo vendedor" : "Nuevo usuario"}</button> : null}
      </header>

      <p className={estilos.nota}>
        {esVendedores
          ? "Un vendedor es un usuario de la empresa con el perfil Vendedor; no es necesariamente quien emite la factura. Para convertir un usuario existente en vendedor, asígnele el perfil en Administración → Usuarios."
          : "Los perfiles son los nueve predefinidos, iguales para todas las empresas: aquí solo se asignan o retiran. Un usuario puede tener varios perfiles."}
      </p>

      {error ? <div className={ui.alertError} role="alert">{error}</div> : null}
      {aviso ? <p className={estilos.aviso} role="status">{aviso}</p> : null}

      <div className={estilos.filtros}>
        <label className={estilos.campo}>
          <span>Buscar por nombre{esVendedores ? " o código" : ", usuario o correo"}</span>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escriba para buscar…" />
        </label>
        {esVendedores ? (
          <label className={estilos.campo}>
            <span>Situación</span>
            <select value={estado} onChange={(e) => { setEstado(e.target.value as typeof estado); setPagina(1); }}>
              <option value="TODOS">Todos</option>
              <option value="ACTIVO">Activo</option>
              <option value="INACTIVO">Inactivo</option>
            </select>
          </label>
        ) : null}
      </div>

      <div className={estilos.tablaWrap}>
        <table className={estilos.tabla}>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Nombre</th>
              <th>Correo</th>
              {esVendedores ? null : <th>Perfiles</th>}
              <th>Situación</th>
              {puedeGestionar ? <th>Acciones</th> : null}
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan={6} className={estilos.vacio} role="status">Cargando…</td></tr>
            ) : filas.length === 0 ? (
              <tr><td colSpan={6} className={estilos.vacio}>{q || estado !== "TODOS" ? "Ningún registro coincide con el filtro." : esVendedores ? "Sin vendedores registrados." : "Sin usuarios."}</td></tr>
            ) : filas.map((f) => (
              <tr key={f.id}>
                <td>{f.usuario}</td>
                <td>{nombreCompleto(f)}</td>
                <td>{f.email ?? "—"}</td>
                {esVendedores ? null : <td>{(f.perfiles ?? []).length === 0 ? "Sin perfiles" : (f.perfiles ?? []).map((p) => <span key={p.codigo} className={estilos.chip}>{p.nombre}</span>)}</td>}
                <td><span className={`${estilos.badge} ${f.estado === "ACTIVO" ? estilos.activo : estilos.inactivo}`}>{f.estado === "ACTIVO" ? "Activo" : "Inactivo"}</span></td>
                {puedeGestionar ? (
                  <td className={estilos.acciones}>
                    <button type="button" className={ui.secondaryButton} onClick={() => abrir("datos", f)}>Editar</button>
                    {esVendedores ? null : <button type="button" className={ui.secondaryButton} onClick={() => abrir("perfiles", f)}>Perfiles</button>}
                    <button type="button" className={ui.clearButton} onClick={() => void cambiarEstado(f)}>{f.estado === "ACTIVO" ? "Desactivar" : "Activar"}</button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={estilos.paginacion}>
        <span>{total} resultado{total === 1 ? "" : "s"}</span>
        <div className={estilos.botones}>
          <button type="button" className={ui.secondaryButton} disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</button>
          <span aria-live="polite">Página {Math.min(pagina, paginas)} de {paginas}</span>
          <button type="button" className={ui.secondaryButton} disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>Siguiente</button>
        </div>
      </div>

      {!puedeGestionar && !cargando ? <p className={estilos.nota}>Solo el administrador de la empresa puede crear o modificar vendedores. <Link href="/dashboard">Volver al panel</Link></p> : null}

      {form ? (
        <div className={estilos.overlay} role="presentation">
          <div className={estilos.modal} role="dialog" aria-modal="true" aria-labelledby="titulo-form">
            <h2 id="titulo-form">
              {form.tipo === "alta" ? (esVendedores ? "Nuevo vendedor" : "Nuevo usuario") : form.tipo === "datos" ? `Editar ${form.datos.usuario}` : `Perfiles de ${form.datos.usuario}`}
            </h2>

            {form.tipo !== "perfiles" ? (
              <div className={estilos.formGrid}>
                {form.tipo === "alta" ? (
                  <label className={estilos.campo}>
                    <span>Usuario * (3 a 60: minúsculas, números, punto o guion)</span>
                    <input value={form.datos.usuario} onChange={(e) => campo("usuario", e.target.value)} autoComplete="off" />
                  </label>
                ) : null}
                <label className={estilos.campo}><span>Nombre *</span><input value={form.datos.nombre} onChange={(e) => campo("nombre", e.target.value)} maxLength={120} /></label>
                <label className={estilos.campo}><span>Apellido</span><input value={form.datos.apellido} onChange={(e) => campo("apellido", e.target.value)} maxLength={120} /></label>
                <label className={estilos.campo}><span>Correo</span><input type="email" value={form.datos.email} onChange={(e) => campo("email", e.target.value)} maxLength={200} /></label>
                {form.tipo === "alta" ? (
                  <label className={estilos.campo}>
                    <span>Contraseña inicial * (mínimo 10 caracteres)</span>
                    <input type="password" value={form.datos.contrasena} onChange={(e) => campo("contrasena", e.target.value)} autoComplete="new-password" />
                    <small>El usuario deberá cambiarla. No se muestra ni se guarda en pantalla.</small>
                  </label>
                ) : null}
              </div>
            ) : null}

            {form.tipo === "perfiles" || (form.tipo === "alta" && !esVendedores) ? (
              <fieldset className={estilos.perfiles}>
                <legend>Perfiles (se pueden asignar varios)</legend>
                {catalogo.length === 0 ? <p className={estilos.vacio} role="status">Cargando perfiles…</p> : null}
                {catalogo.map((p) => (
                  <label key={p.codigo} className={estilos.opcion}>
                    <input type="checkbox" checked={form.datos.perfiles.includes(p.codigo)} onChange={() => alternarPerfil(p.codigo)} />
                    <span>{p.nombre}</span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            {form.tipo === "alta" && esVendedores ? <p className={estilos.nota}>Se creará con el perfil Vendedor.</p> : null}

            {errorForm ? <div className={ui.alertError} role="alert">{errorForm}</div> : null}

            <div className={estilos.botones}>
              <button type="button" className={ui.secondaryButton} disabled={guardando} onClick={() => setForm(null)}>Cancelar</button>
              <button type="button" className={ui.primaryButton} disabled={guardando || !altaValida || (form.tipo !== "perfiles" && form.datos.nombre.trim() === "")} onClick={() => void guardar()}>{guardando ? "Guardando…" : "Guardar"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
