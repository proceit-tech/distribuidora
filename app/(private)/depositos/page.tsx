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
type Datos = { depositos: Deposito[]; sucursales: Sucursal[]; permisos: { crear: boolean; editar: boolean } };
type CampoOrden = "codigo" | "nombre" | "sucursal" | "estado";
type FormEstado = FormularioDeposito & { id: string | null };

const VACIO: FormEstado = { id: null, codigo: "", nombre: "", sucursalId: "" };
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
        body: JSON.stringify(form.id ? { nombre: form.nombre, sucursalId: form.sucursalId } : { codigo: form.codigo, nombre: form.nombre, sucursalId: form.sucursalId }),
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
                          <button type="button" className={ui.rowButton} onClick={() => abrir({ id: d.id, codigo: d.codigo, nombre: d.nombre, sucursalId: d.sucursalId })}>
                            Editar
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
