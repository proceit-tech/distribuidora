"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

import styles from "@/app/(private)/productos/catalogos/page.module.css";
import { CampoFecha } from "@/components/ui/campo-fecha";
import ui from "@/components/ui/lista-padrao/lista.module.css";
import { cargarMonedasAlta, type MonedaComercial } from "@/lib/comercial/carga";
import { crearExclusion } from "@/lib/productos/catalogos-operacion";
import { formularioComercialSucio, validarFormularioComercial, type CampoComercial, type ErroresComercial, type FormularioComercial, type TabComercial } from "@/lib/comercial/formulario";
import { hoyAsuncion } from "@/lib/listas-precio/calculos";
import { useProtegerCambios } from "@/lib/ui/proteger-cambios";

const TIPOS: Array<{ id: TabComercial; label: string; ruta: string }> = [
  { id: "cambios", label: "Tipo de cambio", ruta: "tipos-cambio" },
  { id: "canales", label: "Canal de venta", ruta: "canales-venta" },
  { id: "zonas", label: "Zona comercial", ruta: "zonas" },
];

const vacio = (): FormularioComercial => ({ id: null, codigo: "", nombre: "", fecha: hoyAsuncion(), monedaCodigo: "", cambio: "", motivo: "" });

/**
 * CC-D01: alta de un tipo de cambio, canal de venta o zona comercial para el perfil que solo puede CREAR (sin listado, historial ni ficha). Usa únicamente las rutas POST ya protegidas (LISTAS_PRECIO.CREAR) y
 * la consulta mínima de monedas; la empresa siempre sale de la sesión. Sin LISTAS_PRECIO.VER no se ofrecen enlaces al listado.
 */
export default function NuevoCatalogoComercialPage() {
  const [tipo, setTipo] = useState<TabComercial>("canales");
  const [form, setForm] = useState<FormularioComercial>(vacio);
  const [base, setBase] = useState<FormularioComercial>(vacio);
  const [errores, setErrores] = useState<ErroresComercial>({});
  const [error, setError] = useState("");
  const [monedas, setMonedas] = useState<MonedaComercial[] | null>(null);
  const [errorMonedas, setErrorMonedas] = useState("");
  const [puedeVer, setPuedeVer] = useState(false);
  const [intento, setIntento] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [registrado, setRegistrado] = useState("");
  const exclusion = useRef(crearExclusion());
  const meta = TIPOS.find((t) => t.id === tipo)!;
  const sucio = formularioComercialSucio(form, base);
  // Tipos de cambio exige las monedas verificadas; canales y zonas no las necesitan.
  const bloqueo = tipo === "cambios" && monedas === null ? (errorMonedas ? `No se pudieron cargar las monedas: ${errorMonedas}` : "Las monedas se están cargando.") : null;

  useEffect(() => {
    let activo = true;

    void Promise.resolve()
      .then(() => cargarMonedasAlta((url) => fetch(url, { cache: "no-store" })))
      .then((r) => {
        if (!activo) return;
        if (r.ok) {
          setMonedas(r.monedas);
          setPuedeVer(r.puedeVer);
          setErrorMonedas("");
        } else {
          setMonedas(null);
          setErrorMonedas(r.mensaje);
        }
      });

    return () => {
      activo = false;
    };
  }, [intento]);

  useProtegerCambios(sucio && registrado === "");

  function cambiarTipo(nuevo: TabComercial) {
    if (exclusion.current.activa() || nuevo === tipo) return;
    if (sucio && !window.confirm("Hay cambios sin guardar en el formulario. Si continúa, se perderán. ¿Desea continuar?")) return;
    setTipo(nuevo);
    setForm(vacio());
    setBase(vacio());
    setErrores({});
    setError("");
  }

  function actualizar(campo: CampoComercial, valor: string) {
    setForm((a) => ({ ...a, [campo]: valor }));
    setErrores((a) => (a[campo] ? { ...a, [campo]: undefined } : a));
  }

  async function guardar(event: FormEvent) {
    event.preventDefault();
    if (exclusion.current.activa()) return;
    setError("");

    if (bloqueo) {
      setError(bloqueo);

      return;
    }

    const locales = validarFormularioComercial(tipo, form);

    if (Object.keys(locales).length > 0) {
      setErrores(locales);

      return;
    }

    setErrores({});
    setOcupado(true);
    await exclusion.current.ejecutar(async () => {
      try {
        const cuerpo = tipo === "cambios" ? { fecha: form.fecha, monedaCodigo: form.monedaCodigo, cambio: form.cambio } : { codigo: form.codigo, nombre: form.nombre };
        const r = await fetch(`/api/catalogos-comerciales/${meta.ruta}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
        const j = (await r.json().catch(() => ({}))) as { error?: string; message?: string; campo?: CampoComercial | null };

        if (!r.ok) {
          if (j.campo && j.campo in form) setErrores({ [j.campo]: j.error ?? "No fue posible guardar." });
          setError(j.error ?? "No fue posible guardar.");

          return;
        }
        // Confirmado por el servidor: el borrador ya no está pendiente.
        setBase(form);
        setRegistrado(j.message ?? "Registro guardado correctamente.");
      } catch {
        setError("No hubo conexión con el servidor. Lo escrito se conserva; intente nuevamente.");
      } finally {
        setOcupado(false);
      }
    });
  }

  if (registrado) {
    return (
      <main style={{ maxWidth: 640, margin: "48px auto", padding: "0 16px" }}>
        <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Registro guardado</h1>
        <p role="status" style={{ margin: "0 0 16px", lineHeight: 1.5 }}>
          {registrado} Su perfil puede registrar catálogos comerciales{puedeVer ? "" : ", pero no consultar el listado ni el historial"}.
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <button type="button" onClick={() => window.location.assign("/catalogos-comerciales/nuevo")} style={{ height: 38, padding: "0 16px", borderRadius: 9, border: 0, background: "#0c919b", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
            Registrar otro
          </button>
          {puedeVer ? (
            <Link href="/catalogos-comerciales" className={ui.secondaryButton}>
              Ver catálogos comerciales
            </Link>
          ) : null}
        </div>
      </main>
    );
  }

  const claseCampo = (campo: CampoComercial) => [styles.field, errores[campo] ? styles.conError : ""].filter(Boolean).join(" ");
  const mensajeCampo = (campo: CampoComercial) =>
    errores[campo] ? (
      <span className={styles.campoError} role="alert">
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
            <span aria-current="page">Nuevo catálogo comercial</span>
          </nav>
          <h1>Nuevo catálogo comercial</h1>
        </div>
        {puedeVer ? (
          <Link href="/catalogos-comerciales" className={ui.secondaryButton}>
            ← Catálogos comerciales
          </Link>
        ) : null}
      </header>

      <nav className={ui.tabs} aria-label="Tipo de registro">
        {TIPOS.map((t) => (
          <button key={t.id} type="button" className={[ui.tab, tipo === t.id ? ui.tabActive : ""].join(" ")} aria-current={tipo === t.id ? "page" : undefined} disabled={ocupado} onClick={() => cambiarTipo(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {errorMonedas && tipo === "cambios" ? (
        <div className={ui.alertError} role="alert">
          No se pudieron cargar las monedas: {errorMonedas} No se puede registrar un tipo de cambio hasta que se carguen; lo escrito se conserva.{" "}
          <button type="button" className={ui.rowButton} onClick={() => setIntento((n) => n + 1)}>
            Reintentar
          </button>
        </div>
      ) : null}

      <form className={styles.form} onSubmit={guardar} noValidate aria-label={`Nuevo ${meta.label.toLowerCase()}`}>
        <h3>Nuevo {meta.label.toLowerCase()}</h3>
        {error ? (
          <div className={styles.alertaForm} role="alert">
            {error}
          </div>
        ) : null}

        {tipo === "cambios" ? (
          <>
            <label className={claseCampo("fecha")}>
              <span>
                Fecha <b>*</b>
              </span>
              <CampoFecha valor={form.fecha} alCambiar={(v) => actualizar("fecha", v)} claseError={styles.campoError} />
              {mensajeCampo("fecha")}
            </label>
            <label className={claseCampo("monedaCodigo")}>
              <span>
                Moneda <b>*</b>
              </span>
              <select value={form.monedaCodigo} onChange={(e) => actualizar("monedaCodigo", e.target.value)}>
                <option value="">Seleccione la moneda</option>
                {(monedas ?? []).map((m) => (
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
              <input inputMode="decimal" autoComplete="off" value={form.cambio} onChange={(e) => actualizar("cambio", e.target.value)} />
              {errores.cambio ? mensajeCampo("cambio") : <span className={styles.ayuda}>Guaraníes (PYG) por 1 unidad de la moneda. Ej.: 7.350,50</span>}
            </label>
          </>
        ) : (
          <>
            <label className={claseCampo("codigo")}>
              <span>
                Código <b>*</b>
              </span>
              <input maxLength={40} value={form.codigo} onChange={(e) => actualizar("codigo", e.target.value)} />
              {mensajeCampo("codigo")}
            </label>
            <label className={[claseCampo("nombre"), styles.wide].join(" ")}>
              <span>
                Nombre <b>*</b>
              </span>
              <input maxLength={120} value={form.nombre} onChange={(e) => actualizar("nombre", e.target.value)} />
              {mensajeCampo("nombre")}
            </label>
          </>
        )}

        <div className={styles.formActions}>
          <button type="submit" className={ui.primaryButton} disabled={ocupado || bloqueo !== null} title={bloqueo ?? undefined}>
            {ocupado ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </form>
    </section>
  );
}
