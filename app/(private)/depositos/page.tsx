"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import styles from "@/app/(private)/productos/catalogos/page.module.css";
import { compararTexto, ordenarLista, siguienteOrden, type Orden } from "@/components/ui/lista-padrao/orden";
import { ThOrdenable } from "@/components/ui/lista-padrao/th-ordenable";
import ui from "@/components/ui/lista-padrao/lista.module.css";
import { formularioDepositoSucio, validarDeposito, type CampoDeposito, type ErroresDeposito, type FormularioDeposito } from "@/lib/depositos/validacion";
import { useProtegerCambios } from "@/lib/ui/proteger-cambios";

type Deposito = { id: string; codigo: string; nombre: string; activo: boolean; sucursalId: string; sucursalNombre: string; sucursalCodigo: string; conMovimientos: boolean; conSaldo: boolean };
type Sucursal = { id: string; codigo: string; nombre: string; activo: boolean };
type UsuarioDeposito = { id: string; usuario: string; nombre: string; apellido: string; estado: string; alcanceDepositos: "TODOS" | "ASIGNADOS"; alcanceSucursales: string; asignado: boolean; asignadoAt: string | null; sucursalCompatible: boolean; esUsted: boolean };
type Datos = { depositos: Deposito[]; sucursales: Sucursal[]; permisos: { crear: boolean; editar: boolean }; actor: { alcanceDepositos: "TODOS" | "ASIGNADOS" } | null };
type EventoAcceso = { id: string; evento: "ATRIBUIR" | "REVOCAR"; origen: "MANUAL" | "CREACION"; creadoAt: string; usuarioNombre: string; usuarioCodigo: string; actorNombre: string; actorCodigo: string };
type Panel = { deposito: Deposito; usuarios: UsuarioDeposito[] | null; eventos: EventoAcceso[]; error: string; ocupado: string };
type CampoOrden = "codigo" | "nombre" | "sucursal" | "estado";
type FormEstado = FormularioDeposito & { id: string | null; asignarme: boolean };

const VACIO: FormEstado = { id: null, codigo: "", nombre: "", sucursalId: "", asignarme: true };
const idCampo = (c: CampoDeposito) => `deposito-${c}`;

export default function DepositosPage() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState<"TODOS" | "ACTIVOS" | "INACTIVOS">("TODOS");
  const [orden, setOrden] = useState<Orden<CampoOrden>>(null);
  const [form, setForm] = useState<FormEstado | null>(null);
  const [base, setBase] = useState<FormEstado | null>(null);
  const [errores, setErrores] = useState<ErroresDeposito>({});
  const [errorForm, setErrorForm] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/depositos", { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as Datos & { error?: string };

      if (!r.ok) throw new Error(j.error ?? "No fue posible cargar los depósitos.");
      setDatos(j);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No fue posible cargar los depósitos.");
    }
  }, []);

  useEffect(() => {
    let activo = true;

    Promise.resolve().then(() => {
      if (activo) void cargar();
    });

    return () => {
      activo = false;
    };
  }, [cargar]);

  const sucio = form !== null && base !== null && formularioDepositoSucio(form, base);

  useProtegerCambios(sucio);

  const confirmarDescarte = () => !sucio || window.confirm("Hay cambios sin guardar en el formulario. Si continúa, se perderán. ¿Desea continuar?");
  const puedeCrear = datos?.permisos.crear === true;
  const puedeEditar = datos?.permisos.editar === true;
  const sucursalesFormulario = useMemo(
    // Al editar se conserva la sucursal actual aunque ya no esté en la lista de las utilizables (la función SQL solo exige alcance si cambia).
    () => (datos?.sucursales ?? []).filter((s) => s.activo || s.id === form?.sucursalId),
    [datos, form?.sucursalId],
  );

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const filtradas = (datos?.depositos ?? []).filter(
      (d) => (estado === "TODOS" || (estado === "ACTIVOS" ? d.activo : !d.activo)) && (!q || `${d.codigo} ${d.nombre} ${d.sucursalNombre}`.toLowerCase().includes(q)),
    );

    return ordenarLista(filtradas, orden, (campo, a, b) => {
      switch (campo) {
        case "codigo":
          return compararTexto(a.codigo, b.codigo);
        case "nombre":
          return compararTexto(a.nombre, b.nombre);
        case "sucursal":
          return compararTexto(a.sucursalNombre, b.sucursalNombre);
        case "estado":
          return Number(b.activo) - Number(a.activo);
      }
    });
  }, [datos, busqueda, estado, orden]);

  function abrir(f: FormEstado) {
    if (!confirmarDescarte()) return;
    setForm(f);
    setBase(f);
    setErrores({});
    setErrorForm("");
    setAviso("");
  }

  function cerrar() {
    if (!confirmarDescarte()) return;
    setForm(null);
    setBase(null);
    setErrores({});
    setErrorForm("");
  }

  async function guardar(event: FormEvent) {
    event.preventDefault();
    if (!form || guardando) return;

    const errs = validarDeposito(form, form.id === null);

    setErrores(errs);

    const primero = (Object.keys(errs) as CampoDeposito[])[0];

    if (primero) {
      setErrorForm("Revise los campos marcados.");
      window.setTimeout(() => document.getElementById(idCampo(primero))?.focus(), 0);

      return;
    }

    setGuardando(true);
    setErrorForm("");
    try {
      const r = await fetch(form.id ? `/api/depositos/${form.id}` : "/api/depositos", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form.id ? { nombre: form.nombre, sucursalId: form.sucursalId } : { codigo: form.codigo, nombre: form.nombre, sucursalId: form.sucursalId, asignarme: form.asignarme && datos?.actor?.alcanceDepositos === "ASIGNADOS" }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string; campo?: CampoDeposito; message?: string };

      if (!r.ok) {
        if (j.campo) {
          setErrores({ [j.campo]: j.error });
          window.setTimeout(() => document.getElementById(idCampo(j.campo as CampoDeposito))?.focus(), 0);
        }
        throw new Error(j.error ?? "No fue posible guardar el depósito.");
      }
      setAviso(j.message ?? "Depósito guardado.");
      setForm(null);
      setBase(null);
      await cargar();
    } catch (e) {
      setErrorForm(e instanceof Error ? e.message : "No fue posible guardar el depósito.");
    } finally {
      setGuardando(false);
    }
  }

  async function abrirUsuarios(d: Deposito) {
    setPanel({ deposito: d, usuarios: null, eventos: [], error: "", ocupado: "" });
    try {
      const [r, h] = await Promise.all([fetch(`/api/depositos/${d.id}/usuarios`, { cache: "no-store" }), fetch(`/api/depositos/${d.id}/historial-acceso`, { cache: "no-store" })]);
      const j = (await r.json().catch(() => ({}))) as { usuarios?: UsuarioDeposito[]; error?: string };
      const jh = (await h.json().catch(() => ({}))) as { eventos?: EventoAcceso[]; error?: string };

      if (!r.ok) throw new Error(j.error ?? "No fue posible cargar los usuarios.");
      if (!h.ok) throw new Error(jh.error ?? "No fue posible cargar el historial de accesos.");
      setPanel({ deposito: d, usuarios: j.usuarios ?? [], eventos: jh.eventos ?? [], error: "", ocupado: "" });
    } catch (e) {
      setPanel({ deposito: d, usuarios: [], eventos: [], error: e instanceof Error ? e.message : "No fue posible cargar los usuarios.", ocupado: "" });
    }
  }

  async function cambiarAcceso(u: UsuarioDeposito, autorizar: boolean) {
    if (!panel) return;

    const d = panel.deposito;
    const quien = `${u.nombre} ${u.apellido}`.trim();

    if (
      !autorizar &&
      !window.confirm(
        `¿Revocar el acceso de ${quien} al depósito «${d.nombre}»? Dejará de poder ver y operar este depósito (stock, movimientos y reposición); su historial y su alcance general no se modifican.${u.esUsted ? " Es su propio acceso: puede perder la posibilidad de administrar este depósito." : ""}`,
      )
    ) {
      return;
    }

    setPanel({ ...panel, error: "", ocupado: u.id });
    try {
      const r = await fetch(autorizar ? `/api/depositos/${d.id}/usuarios` : `/api/depositos/${d.id}/usuarios/${u.id}`, {
        method: autorizar ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: autorizar ? JSON.stringify({ usuarioId: u.id }) : undefined,
      });
      const j = (await r.json().catch(() => ({}))) as { usuarios?: UsuarioDeposito[]; error?: string; message?: string };

      if (!r.ok) throw new Error(j.error ?? "No fue posible cambiar el acceso.");
      setAviso(j.message ?? "Acceso actualizado.");
      await Promise.all([cargar(), abrirUsuarios(d)]);
    } catch (e) {
      setPanel((p) => (p ? { ...p, error: e instanceof Error ? e.message : "No fue posible cambiar el acceso.", ocupado: "" } : p));
    }
  }

  async function cambiarEstado(d: Deposito) {
    const activar = !d.activo;

    if (!activar && !window.confirm(`¿Inactivar el depósito «${d.nombre}»? Dejará de poder usarse en nuevas operaciones; su historial y su código se conservan.`)) return;

    setError("");
    setAviso("");
    try {
      const r = await fetch(`/api/depositos/${d.id}/estado`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activo: activar }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string; message?: string };

      if (!r.ok) throw new Error(j.error ?? "No fue posible cambiar el estado.");
      setAviso(j.message ?? "Estado actualizado.");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No fue posible cambiar el estado.");
    }
  }

  const claseCampo = (c: CampoDeposito, extra = "") => [styles.field, errores[c] ? styles.conError : "", extra].filter(Boolean).join(" ");
  const ariaCampo = (c: CampoDeposito) => ({ id: idCampo(c), "aria-invalid": errores[c] ? true : undefined, "aria-describedby": errores[c] ? `${idCampo(c)}-error` : undefined });
  const mensaje = (c: CampoDeposito) =>
    errores[c] ? (
      <span id={`${idCampo(c)}-error`} className={styles.campoError} role="alert">
        {errores[c]}
      </span>
    ) : null;

  return (
    <section className={ui.page}>
      <header className={ui.topbar}>
        <div className={ui.titleBlock}>
          <nav className={ui.breadcrumb} aria-label="Ruta de navegación">
            <span>Inventario</span>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Depósitos</span>
          </nav>
          <h1>Depósitos</h1>
        </div>

        <div className={ui.actionsGroup}>
          <Link href="/stock" className={ui.secondaryButton}>
            Stock
          </Link>
          {puedeCrear ? (
            <button type="button" className={ui.primaryButton} onClick={() => abrir(VACIO)}>
              <span aria-hidden="true">+</span>
              Nuevo depósito
            </button>
          ) : null}
        </div>
      </header>

      {aviso ? (
        <div className={ui.alertOk} role="status">
          {aviso}
        </div>
      ) : null}
      {error ? (
        <div className={ui.alertError} role="alert">
          {error}
        </div>
      ) : null}

      {form ? (
        <form className={styles.form} onSubmit={guardar} noValidate aria-label={form.id ? "Editar depósito" : "Nuevo depósito"}>
          <h3>{form.id ? "Editar depósito" : "Nuevo depósito"}</h3>
          {errorForm ? (
            <div className={styles.alertaForm} role="alert">
              {errorForm}
            </div>
          ) : null}

          <label className={claseCampo("codigo")}>
            <span>
              Código <b>*</b>
            </span>
            <input {...ariaCampo("codigo")} value={form.codigo} maxLength={30} disabled={form.id !== null} autoComplete="off" onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
            {errores.codigo ? mensaje("codigo") : <span className={styles.ayuda}>{form.id ? "El código no se puede modificar." : "Letras, números, punto, guion o guion bajo. No se podrá cambiar después."}</span>}
          </label>

          <label className={claseCampo("nombre", styles.wide)}>
            <span>
              Nombre <b>*</b>
            </span>
            <input {...ariaCampo("nombre")} value={form.nombre} maxLength={120} autoComplete="off" onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            {mensaje("nombre")}
          </label>

          <label className={claseCampo("sucursalId")}>
            <span>
              Sucursal <b>*</b>
            </span>
            <select {...ariaCampo("sucursalId")} value={form.sucursalId} onChange={(e) => setForm({ ...form, sucursalId: e.target.value })}>
              <option value="">Seleccione la sucursal</option>
              {sucursalesFormulario.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.codigo} · {s.nombre}
                </option>
              ))}
            </select>
            {mensaje("sucursalId")}
          </label>

          {form.id === null && datos?.actor?.alcanceDepositos === "ASIGNADOS" ? (
            <label className={[styles.field, styles.full].join(" ")}>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={form.asignarme} onChange={(e) => setForm({ ...form, asignarme: e.target.checked })} />
                Asignarme este depósito
              </span>
              <span className={styles.ayuda}>
                Su usuario solo ve los depósitos que tiene asignados. Si no lo marca, no verá ni podrá operar el depósito que está creando hasta que otro administrador se lo autorice. No cambia su alcance general.
              </span>
            </label>
          ) : form.id === null && datos?.actor?.alcanceDepositos === "TODOS" ? (
            <p className={styles.nota}>Su usuario tiene acceso a todos los depósitos: verá el nuevo depósito sin necesidad de asignación. Para autorizar a otros usuarios use «Usuarios» después de crearlo.</p>
          ) : null}

          <div className={styles.formActions}>
            <button type="button" className={ui.secondaryButton} onClick={cerrar}>
              Cancelar
            </button>
            <button type="submit" className={ui.primaryButton} disabled={guardando}>
              {guardando ? "Guardando..." : form.id ? "Guardar cambios" : "Crear depósito"}
            </button>
          </div>
        </form>
      ) : null}

      {panel ? (
        <section className={ui.contentCard} aria-label={`Usuarios autorizados en ${panel.deposito.nombre}`} style={{ marginBottom: 12 }}>
          <div className={ui.toolbar} style={{ justifyContent: "space-between" }}>
            <strong>
              Usuarios autorizados — {panel.deposito.codigo} · {panel.deposito.nombre}
              {!panel.deposito.activo ? " (inactivo)" : ""}
            </strong>
            <button type="button" className={ui.secondaryButton} onClick={() => setPanel(null)}>
              Cerrar
            </button>
          </div>
          <p className={ui.resultCount} style={{ margin: "0 0 8px" }}>
            Los usuarios con alcance «Todos los depósitos» ven todos los depósitos de la empresa y no dependen de una autorización individual. Solo a los usuarios con alcance «Depósitos asignados» se les autoriza o revoca aquí; el alcance
            general, el perfil y las sucursales de cada usuario no se modifican desde esta pantalla.
          </p>
          {panel.error ? (
            <div className={ui.alertError} role="alert">
              {panel.error}
            </div>
          ) : null}
          <div className={ui.tableScroll}>
            <table className={ui.table} style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Alcance de depósitos</th>
                  <th>Acceso a este depósito</th>
                  <th className={ui.actionsHead}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {panel.usuarios === null ? (
                  <tr>
                    <td colSpan={4} className={ui.emptyCell}>
                      <div className={ui.empty}>
                        <strong>Cargando usuarios...</strong>
                      </div>
                    </td>
                  </tr>
                ) : panel.usuarios.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={ui.emptyCell}>
                      <div className={ui.empty}>
                        <strong>No hay usuarios en la empresa</strong>
                      </div>
                    </td>
                  </tr>
                ) : (
                  panel.usuarios.map((u) => {
                    const todos = u.alcanceDepositos === "TODOS";

                    return (
                      <tr key={u.id} className={ui.row}>
                        <td>
                          <span className={ui.principal}>
                            {u.nombre} {u.apellido}
                          </span>
                          {u.esUsted ? <small className={ui.muted}> (usted)</small> : null}
                          <br />
                          <small className={ui.muted}>
                            {u.usuario}
                            {u.estado !== "ACTIVO" ? ` · ${u.estado === "BLOQUEADO" ? "bloqueado" : "dado de baja"}` : ""}
                          </small>
                        </td>
                        <td>{todos ? "Todos los depósitos" : "Depósitos asignados"}</td>
                        <td>
                          {todos ? (
                            <span className={ui.statusInfo} title="No depende de una autorización individual">
                              Acceso amplio (por alcance)
                            </span>
                          ) : u.asignado ? (
                            <span className={ui.statusActive}>Autorizado</span>
                          ) : (
                            <span className={ui.statusInactive}>Sin acceso</span>
                          )}
                        </td>
                        <td className={ui.actionsCell}>
                          {todos ? (
                            <small className={ui.muted}>No requiere autorización</small>
                          ) : u.asignado ? (
                            <button type="button" className={ui.rowButton} disabled={panel.ocupado === u.id} onClick={() => void cambiarAcceso(u, false)}>
                              {panel.ocupado === u.id ? "Revocando..." : "Revocar"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={ui.rowButton}
                              disabled={panel.ocupado === u.id || !u.sucursalCompatible}
                              title={!u.sucursalCompatible ? "La sucursal del depósito no está en el alcance de sucursales de este usuario." : undefined}
                              onClick={() => void cambiarAcceso(u, true)}
                            >
                              {panel.ocupado === u.id ? "Autorizando..." : "Autorizar"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <h4 style={{ margin: "14px 0 6px", fontSize: 13.5 }}>Historial de accesos</h4>
          <div className={ui.tableScroll}>
            <table className={ui.table} style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Evento</th>
                  <th>Usuario afectado</th>
                  <th>Realizado por</th>
                </tr>
              </thead>
              <tbody>
                {panel.eventos.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={ui.emptyCell}>
                      <div className={ui.empty}>
                        <strong>Sin cambios de acceso registrados</strong>
                        <span>Solo se registran las autorizaciones y revocaciones efectivas.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  panel.eventos.map((ev) => (
                    <tr key={ev.id} className={ui.row}>
                      <td>{new Date(ev.creadoAt).toLocaleString("es-PY", { timeZone: "America/Asuncion" })}</td>
                      <td>
                        <span className={ev.evento === "ATRIBUIR" ? ui.statusActive : ui.statusInactive}>{ev.evento === "ATRIBUIR" ? "Autorizado" : "Revocado"}</span>
                        {ev.origen === "CREACION" ? <small className={ui.muted}> · al crear el depósito</small> : null}
                      </td>
                      <td>
                        {ev.usuarioNombre || ev.usuarioCodigo}
                        <br />
                        <small className={ui.muted}>{ev.usuarioCodigo}</small>
                      </td>
                      <td>
                        {ev.actorNombre || ev.actorCodigo}
                        <br />
                        <small className={ui.muted}>{ev.actorCodigo}</small>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className={ui.contentCard}>
        <div className={ui.toolbar}>
          <label className={ui.search}>
            <span aria-hidden="true">⌕</span>
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por código, nombre o sucursal" aria-label="Buscar depósitos" />
          </label>

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
            }}
          >
            Limpiar filtros
          </button>

          <span className={ui.resultCount} aria-live="polite">
            {datos ? `${lista.length} de ${datos.depositos.length}` : ""}
          </span>
        </div>

        <div className={ui.tableScroll}>
          <table className={ui.table} style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <ThOrdenable titulo="Código" campo="codigo" orden={orden} onOrden={(c) => setOrden((a) => siguienteOrden(a, c))} className={ui.colCodigo} />
                <ThOrdenable titulo="Nombre" campo="nombre" orden={orden} onOrden={(c) => setOrden((a) => siguienteOrden(a, c))} />
                <ThOrdenable titulo="Sucursal" campo="sucursal" orden={orden} onOrden={(c) => setOrden((a) => siguienteOrden(a, c))} />
                <ThOrdenable titulo="Estado" campo="estado" orden={orden} onOrden={(c) => setOrden((a) => siguienteOrden(a, c))} className={ui.colEstado} />
                <ThOrdenable titulo="Uso" />
                {puedeEditar ? <ThOrdenable titulo="Acciones" alinear="derecha" /> : null}
              </tr>
            </thead>
            <tbody>
              {!datos && !error ? (
                <tr>
                  <td colSpan={6} className={ui.emptyCell}>
                    <div className={ui.empty}>
                      <strong>Cargando...</strong>
                    </div>
                  </td>
                </tr>
              ) : lista.length === 0 ? (
                <tr>
                  <td colSpan={6} className={ui.emptyCell}>
                    <div className={ui.empty}>
                      <strong>{datos && datos.depositos.length === 0 ? "No hay depósitos en su alcance" : "Ningún depósito coincide con los filtros"}</strong>
                      {datos && datos.depositos.length === 0 && puedeCrear ? <span>Cree el primer depósito con «Nuevo depósito».</span> : null}
                    </div>
                  </td>
                </tr>
              ) : (
                lista.map((d) => (
                  <tr key={d.id} className={ui.row}>
                    <td>
                      <span className={[ui.code, ui.mono].join(" ")}>{d.codigo}</span>
                    </td>
                    <td>
                      <span className={ui.principal}>{d.nombre}</span>
                    </td>
                    <td>
                      {d.sucursalNombre}
                      <br />
                      <small className={ui.muted}>{d.sucursalCodigo}</small>
                    </td>
                    <td>
                      <span className={d.activo ? ui.statusActive : ui.statusInactive}>{d.activo ? "Activo" : "Inactivo"}</span>
                    </td>
                    <td>
                      <small className={ui.muted}>
                        {d.conMovimientos ? "Con movimientos" : "Sin movimientos"}
                        {d.conSaldo ? " · con saldo" : ""}
                      </small>
                    </td>
                    {puedeEditar ? (
                      <td className={ui.actionsCell}>
                        <div className={ui.actionsGroup}>
                          <button type="button" className={ui.rowButton} onClick={() => abrir({ id: d.id, codigo: d.codigo, nombre: d.nombre, sucursalId: d.sucursalId, asignarme: false })}>
                            Editar
                          </button>
                          <button type="button" className={ui.rowButton} onClick={() => void abrirUsuarios(d)}>
                            Usuarios
                          </button>
                          <button
                            type="button"
                            className={ui.rowButton}
                            disabled={d.activo && d.conSaldo}
                            title={d.activo && d.conSaldo ? "Tiene saldo: trasládelo o regularícelo con Movimientos antes de inactivarlo." : undefined}
                            onClick={() => void cambiarEstado(d)}
                          >
                            {d.activo ? "Inactivar" : "Activar"}
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
