"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { CampoFecha } from "@/components/ui/campo-fecha";
import { ajusteMasivo, decimalesMoneda, formatoMoneda, hoyAsuncion, margenBruto, redondearMoneda, tramosSuperpuestos } from "@/lib/listas-precio/calculos";
import { cargarCatalogosListas } from "@/lib/listas-precio/cliente-api";
import {
  advertenciasLista,
  idDeCampo,
  listaSucia,
  nuevoItemLista,
  opcionesConSeleccion,
  tabDeCampo,
  validarListaFormulario,
  type ErroresLista,
  type TabLista,
} from "@/lib/listas-precio/formulario";
import type {
  CatalogoListasPrecio,
  ListaPrecioCatalogoOpcion,
  ListaPrecioDetalle,
  ListaPrecioEscala,
  ListaPrecioEstado,
  ListaPrecioModo,
  ListaPrecioProducto,
  ListaPrecioReglaComercial,
  ListaPrecioTipo,
  NuevaListaPrecio,
} from "@/types/lista-precio";

import styles from "./lista-precio-form.module.css";

type Props = {
  mode: "create" | "edit";
  initial?: ListaPrecioDetalle;
  onSave: (data: NuevaListaPrecio) => Promise<void> | void;
};

const TABS: Array<{ id: TabLista; label: string }> = [
  { id: "informacion", label: "Información" },
  { id: "productos", label: "Productos y precios" },
  { id: "reglas", label: "Reglas comerciales" },
];

const uid = (prefijo: string) => `${prefijo}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const num = (v: string, porDefecto = 0) => (v === "" ? porDefecto : Number(v));

function formularioInicial(initial?: ListaPrecioDetalle): NuevaListaPrecio {
  if (initial) {
    /* eslint-disable @typescript-eslint/no-unused-vars */
    const { id, creadoEn, actualizadoEn, esReferencia, ...resto } = initial;
    /* eslint-enable @typescript-eslint/no-unused-vars */
    const copia = structuredClone(resto);

    // El margen mostrado se calcula siempre desde costo y precio (el valor guardado puede ser 0 por falta de datos).
    copia.productos = copia.productos.map((p) => ({ ...p, margenPct: margenBruto(p.precioLista, p.costoReferencia) ?? 0 }));

    return copia;
  }

  return {
    codigo: "",
    nombre: "",
    descripcion: "",
    tipo: "VENTA",
    monedaCodigo: "PYG",
    estado: "ACTIVA",
    modoPrecio: "PRECIO_FIJO",
    incluyeIva: true,
    listaBaseId: "",
    listaBaseCodigo: "",
    listaBaseNombre: "",
    ajusteGeneralPct: 0,
    vigenteDesde: hoyAsuncion(),
    vigenteHasta: "",
    prioridad: 10,
    permiteDescuentoAdicional: true,
    descuentoMaximoPct: 5,
    grupoClienteId: "",
    grupoClienteNombre: "",
    clienteId: "",
    clienteCodigo: "",
    clienteNombre: "",
    zonaId: "",
    zonaNombre: "",
    canalVentaId: "",
    canalVentaNombre: "",
    productos: [],
    reglasComerciales: [],
    activo: true,
    observacion: "",
  };
}

function Campo({ etiqueta, requerido, campo, errores, ayuda, className, children }: { etiqueta: string; requerido?: boolean; campo: string; errores: ErroresLista; ayuda?: string; className?: string; children: React.ReactNode }) {
  const mensaje = errores[campo];

  return (
    <label className={[styles.field, mensaje ? styles.conError : "", className ?? ""].filter(Boolean).join(" ")}>
      <span>
        {etiqueta} {requerido ? <b>*</b> : null}
      </span>
      {children}
      {mensaje ? (
        <span id={`${idDeCampo(campo)}-error`} className={styles.campoError} role="alert">
          {mensaje}
        </span>
      ) : ayuda ? (
        <span className={styles.ayuda}>{ayuda}</span>
      ) : null}
    </label>
  );
}

const aria = (campo: string, errores: ErroresLista) => ({
  id: idDeCampo(campo),
  "aria-invalid": errores[campo] ? (true as const) : undefined,
  "aria-describedby": errores[campo] ? `${idDeCampo(campo)}-error` : undefined,
});

function Numero({ etiqueta, campo, errores, valor, alCambiar, step = "1", min, max, disabled, className, ayuda }: { etiqueta: string; campo: string; errores: ErroresLista; valor: number; alCambiar: (v: number) => void; step?: string; min?: string; max?: string; disabled?: boolean; className?: string; ayuda?: string }) {
  return (
    <Campo etiqueta={etiqueta} campo={campo} errores={errores} className={className} ayuda={ayuda}>
      <input {...aria(campo, errores)} type="number" inputMode="decimal" step={step} min={min} max={max} disabled={disabled} value={Number.isFinite(valor) ? valor : ""} onChange={(e) => alCambiar(num(e.target.value))} />
    </Campo>
  );
}

function Check({ etiqueta, checked, alCambiar, disabled }: { etiqueta: string; checked: boolean; alCambiar: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={styles.check}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => alCambiar(e.target.checked)} />
      {etiqueta}
    </label>
  );
}

export default function ListaPrecioForm({ mode, initial, onSave }: Props) {
  const [tab, setTab] = useState<TabLista>("informacion");
  const [form, setForm] = useState<NuevaListaPrecio>(() => formularioInicial(initial));
  const [base, setBase] = useState(() => JSON.stringify(formularioInicial(initial)));
  const [catalogo, setCatalogo] = useState<CatalogoListasPrecio | null>(null);
  const [errores, setErrores] = useState<ErroresLista>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [productoElegido, setProductoElegido] = useState("");
  const [ajustePersonalizado, setAjustePersonalizado] = useState("");
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});

  const bloqueada = initial?.esReferencia === true;
  const sucio = listaSucia(form, base);
  const moneda = form.monedaCodigo;
  const decimales = decimalesMoneda(moneda);
  const monedaBase = catalogo?.monedaBase ?? "PYG";
  const referenciaUtil = moneda === monedaBase;

  useEffect(() => {
    let activo = true;

    cargarCatalogosListas()
      .then((c) => {
        if (activo) setCatalogo(c);
      })
      .catch((e: unknown) => {
        if (activo) setError(e instanceof Error ? e.message : "No fue posible cargar los catálogos.");
      });

    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    if (!sucio) return;

    const alSalir = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", alSalir);

    return () => window.removeEventListener("beforeunload", alSalir);
  }, [sucio]);

  const confirmarSalida = () => !sucio || window.confirm("Hay cambios sin guardar en la lista. Si sale, se perderán. ¿Desea salir?");

  function update<K extends keyof NuevaListaPrecio>(key: K, value: NuevaListaPrecio[K]) {
    setForm((actual) => ({ ...actual, [key]: value }));
    limpiar(String(key));
  }

  function limpiar(campo: string) {
    setErrores((actual) => (actual[campo] ? Object.fromEntries(Object.entries(actual).filter(([k]) => k !== campo)) : actual));
  }

  function enfocar(campo: string) {
    window.setTimeout(() => document.getElementById(idDeCampo(campo))?.focus(), 30);
  }

  // Catálogos: activos más lo ya seleccionado (aunque se haya inactivado, el vínculo se conserva al editar).
  const listasBase = useMemo(
    () => opcionesConSeleccion((catalogo?.listasBase ?? []).filter((l) => l.id !== initial?.id), form.listaBaseId, form.listaBaseId ? { id: form.listaBaseId, codigo: form.listaBaseCodigo, nombre: form.listaBaseNombre, monedaCodigo: moneda, tipo: form.tipo } : undefined),
    [catalogo, initial?.id, form.listaBaseId, form.listaBaseCodigo, form.listaBaseNombre, moneda, form.tipo],
  );
  const grupos = opcionesConSeleccion(catalogo?.gruposCliente ?? [], form.grupoClienteId, form.grupoClienteId ? { id: form.grupoClienteId, codigo: "", nombre: form.grupoClienteNombre } : undefined);
  const zonas = opcionesConSeleccion(catalogo?.zonas ?? [], form.zonaId, form.zonaId ? { id: form.zonaId, codigo: "", nombre: form.zonaNombre } : undefined);
  const canales = opcionesConSeleccion(catalogo?.canales ?? [], form.canalVentaId, form.canalVentaId ? { id: form.canalVentaId, codigo: "", nombre: form.canalVentaNombre } : undefined);
  const clientes = opcionesConSeleccion(catalogo?.clientes ?? [], form.clienteId, form.clienteId ? { id: form.clienteId, codigo: form.clienteCodigo, nombre: form.clienteNombre } : undefined);
  const productosCatalogo = useMemo(() => catalogo?.productos ?? [], [catalogo]);

  const etiquetaOpcion = (o: { codigo: string; nombre: string; activo?: boolean }) => `${o.codigo ? `${o.codigo} · ` : ""}${o.nombre}${o.activo === false ? " (inactivo)" : ""}`;

  const advertencias = useMemo(() => advertenciasLista(form), [form]);
  const resumen = useMemo(() => {
    const activos = form.productos.filter((p) => p.activo);
    const conPrecio = activos.filter((p) => p.precioLista > 0);

    return { total: form.productos.length, activos: activos.length, promedio: conPrecio.length ? conPrecio.reduce((a, p) => a + p.precioLista, 0) / conPrecio.length : 0 };
  }, [form.productos]);

  const tabsConError = useMemo(() => new Set(Object.keys(errores).map(tabDeCampo)), [errores]);

  // ── Productos
  const yaAgregados = useMemo(() => new Set(form.productos.map((p) => p.productoId)), [form.productos]);
  const coincidencias = useMemo(() => {
    const q = busquedaProducto.trim().toLowerCase();

    return productosCatalogo.filter((p) => !yaAgregados.has(p.id) && (!q || p.codigo.toLowerCase().includes(q) || p.descripcion.toLowerCase().includes(q)));
  }, [productosCatalogo, yaAgregados, busquedaProducto]);

  const contextoItem = () => ({ monedaLista: moneda, monedaBase, vigenteDesde: form.vigenteDesde, vigenteHasta: form.vigenteHasta });

  function agregarProducto() {
    const producto = productosCatalogo.find((p) => p.id === productoElegido);

    if (!producto) return;
    update("productos", [...form.productos, nuevoItemLista(producto, { ...contextoItem(), id: uid("precio") })]);
    setProductoElegido("");
  }

  function importarFiltrados() {
    if (coincidencias.length === 0) return;

    const sinPrecio = coincidencias.filter((p) => !referenciaUtil || p.precioReferencia === null).length;
    const aviso = referenciaUtil
      ? `Se agregarán ${coincidencias.length} producto(s) con su costo promedio y precio de referencia. ${sinPrecio} no tienen precio de referencia y quedarán en 0 (sin precio): el costo no se usa como precio de venta.`
      : `Se agregarán ${coincidencias.length} producto(s) SIN costo ni precio: la lista está en ${moneda} y los valores de referencia están en ${monedaBase}, sin conversión aprobada.`;

    if (!window.confirm(`${aviso} ¿Continuar?`)) return;
    update("productos", [...form.productos, ...coincidencias.map((p) => nuevoItemLista(p, { ...contextoItem(), id: uid("precio") }))]);
    setBusquedaProducto("");
  }

  function aplicarAjuste(porcentaje: number) {
    if (!Number.isFinite(porcentaje) || porcentaje === 0 || porcentaje <= -100 || form.productos.length === 0) return;

    const r = ajusteMasivo(form.productos, porcentaje, moneda);
    const texto = `Se recalculará el precio de lista de ${r.aplicados} producto(s) a partir de su PRECIO BASE (${porcentaje > 0 ? "+" : ""}${porcentaje} %), redondeado a ${decimales} decimal(es). ${r.omitidosSinBase} sin precio base no se modifican. El porcentaje se aplica una sola vez (no toca descuentos) y repetirlo no acumula. ¿Continuar?`;

    if (r.aplicados === 0) {
      window.alert("Ningún producto tiene precio base: no hay nada que ajustar.");

      return;
    }
    if (!window.confirm(texto)) return;
    update(
      "productos",
      form.productos.map((p, i) => {
        const precio = r.precios[i];

        return precio === null ? p : { ...p, precioLista: precio, margenPct: margenBruto(precio, p.costoReferencia) ?? 0 };
      }),
    );
  }

  function cambiarProducto(id: string, parche: Partial<ListaPrecioProducto>, campo?: string) {
    setForm((actual) => ({
      ...actual,
      productos: actual.productos.map((p) => {
        if (p.id !== id) return p;
        const nuevo = { ...p, ...parche };

        return { ...nuevo, margenPct: margenBruto(nuevo.precioLista, nuevo.costoReferencia) ?? 0 };
      }),
    }));
    if (campo) limpiar(campo);
  }

  function cambiarEscala(producto: ListaPrecioProducto, escalaId: string, parche: Partial<ListaPrecioEscala>, campo?: string) {
    cambiarProducto(producto.id, { escalas: producto.escalas.map((e) => (e.id === escalaId ? { ...e, ...parche } : e)) }, campo);
  }

  // ── Reglas
  function agregarRegla() {
    const regla: ListaPrecioReglaComercial = {
      id: uid("regla"),
      tipoAplicacion: "GENERAL",
      referenciaId: "",
      referenciaCodigo: "",
      referenciaNombre: "",
      prioridad: form.prioridad,
      cantidadMinima: 1,
      permiteDescuentoAdicional: form.permiteDescuentoAdicional,
      descuentoMaximoPct: form.descuentoMaximoPct,
      vigenteDesde: form.vigenteDesde,
      vigenteHasta: form.vigenteHasta,
      activo: true,
    };

    update("reglasComerciales", [...form.reglasComerciales, regla]);
  }

  function cambiarRegla(id: string, parche: Partial<ListaPrecioReglaComercial>, campo?: string) {
    setForm((actual) => ({ ...actual, reglasComerciales: actual.reglasComerciales.map((r) => (r.id === id ? { ...r, ...parche } : r)) }));
    if (campo) limpiar(campo);
  }

  function opcionesReferencia(regla: ListaPrecioReglaComercial): ListaPrecioCatalogoOpcion[] {
    const respaldo = regla.referenciaId ? { id: regla.referenciaId, codigo: regla.referenciaCodigo, nombre: regla.referenciaNombre } : undefined;

    if (regla.tipoAplicacion === "GRUPO_CLIENTE") return opcionesConSeleccion(catalogo?.gruposCliente ?? [], regla.referenciaId, respaldo);
    if (regla.tipoAplicacion === "CLIENTE") return opcionesConSeleccion(catalogo?.clientes ?? [], regla.referenciaId, respaldo);
    if (regla.tipoAplicacion === "ZONA") return opcionesConSeleccion(catalogo?.zonas ?? [], regla.referenciaId, respaldo);
    if (regla.tipoAplicacion === "CANAL_VENTA") return opcionesConSeleccion(catalogo?.canales ?? [], regla.referenciaId, respaldo);

    return [];
  }

  function mostrarErrores(nuevos: ErroresLista) {
    const claves = Object.keys(nuevos);
    const primero = claves[0];

    setErrores(nuevos);
    if (!primero) return;
    setTab(tabDeCampo(primero));
    const m = /^productos\.(\d+)\./.exec(primero);

    if (m && !primero.endsWith("precioLista") && !primero.endsWith("costoReferencia") && !primero.endsWith("precioBase") && !primero.endsWith("cantidadMinima")) {
      const item = form.productos[Number(m[1])];

      if (item) setAbiertos((a) => ({ ...a, [item.id]: true }));
    }
    enfocar(primero);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const locales = validarListaFormulario(form);

    if (Object.keys(locales).length > 0) {
      mostrarErrores(locales);
      setError("Revise los campos marcados.");

      return;
    }
    setErrores({});

    if (advertencias.sinPrecio > 0 && !window.confirm(`${advertencias.sinPrecio} producto(s) activos tienen precio de lista 0 (sin precio). ¿Guardar de todos modos?`)) {
      setTab("productos");

      return;
    }

    setSaving(true);
    const datos: NuevaListaPrecio = {
      ...form,
      codigo: form.codigo.trim(),
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim(),
      observacion: form.observacion.trim(),
      activo: form.estado === "ACTIVA",
    };

    try {
      await onSave(datos);
      setBase(JSON.stringify(form)); // guardado: ya no hay cambios pendientes antes de salir de la pantalla
    } catch (e) {
      const campo = (e as { campo?: string | null }).campo ?? null;
      const mensaje = e instanceof Error && e.message ? e.message : mode === "create" ? "No fue posible registrar la lista." : "No fue posible actualizar la lista.";

      if (campo) mostrarErrores({ [campo]: mensaje });
      setError(mensaje);
    } finally {
      setSaving(false);
    }
  }

  const estadosDisponibles: Array<[ListaPrecioEstado, string]> = [
    ["ACTIVA", "Activa"],
    ["BORRADOR", "Borrador"],
    ["INACTIVA", "Inactiva"],
    ...(form.estado === "VENCIDA" ? ([["VENCIDA", "Vencida"]] as Array<[ListaPrecioEstado, string]>) : []),
  ];

  return (
    <section className={styles.page}>
      <header className={styles.topbar}>
        <div>
          <nav className={styles.breadcrumb} aria-label="Ruta de navegación">
            <span>Maestros</span>
            <i aria-hidden="true">/</i>
            <Link href="/listas-precio" onClick={(e) => !confirmarSalida() && e.preventDefault()}>
              Listas de precios
            </Link>
            <i aria-hidden="true">/</i>
            <span aria-current="page">{mode === "create" ? "Nueva" : "Editar"}</span>
          </nav>
          <h1>
            {mode === "create" ? "Nueva lista de precios" : "Editar lista de precios"}
            {bloqueada ? <span className={styles.pill}>REFERENCIA</span> : null}
          </h1>
          {mode === "edit" && initial ? (
            <p className={styles.meta}>
              {initial.codigo} · actualizada {new Date(initial.actualizadoEn).toLocaleString("es-PY", { timeZone: "America/Asuncion" })}
            </p>
          ) : null}
        </div>

        <Link href="/listas-precio" className={styles.secondaryButton} onClick={(e) => !confirmarSalida() && e.preventDefault()}>
          ← Volver a listas
        </Link>
      </header>

      <form className={styles.card} onSubmit={submit} noValidate>
        {bloqueada ? (
          <div className={styles.aviso}>Lista de referencia de la empresa: venta, precio fijo, sin lista base ni alcance comercial. Sus precios son el precio de venta de referencia de Productos.</div>
        ) : null}

        {error ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : null}

        <nav className={styles.tabs} aria-label="Secciones de la lista">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={[styles.tab, tab === t.id ? styles.tabActive : "", tabsConError.has(t.id) ? styles.tabError : ""].filter(Boolean).join(" ")} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
              {t.label}
              {tabsConError.has(t.id) ? <span className="sr-only"> (con errores)</span> : null}
            </button>
          ))}
        </nav>

        <div className={styles.content}>
          {tab === "informacion" ? (
            <>
              <div className={styles.gridFour}>
                <Campo etiqueta="Código" campo="codigo" errores={errores}>
                  <input {...aria("codigo", errores)} maxLength={50} value={form.codigo} placeholder="Automático" onChange={(e) => update("codigo", e.target.value)} />
                </Campo>
                <Campo etiqueta="Nombre" requerido campo="nombre" errores={errores} className={styles.span2}>
                  <input {...aria("nombre", errores)} maxLength={200} value={form.nombre} onChange={(e) => update("nombre", e.target.value)} />
                </Campo>
                <Campo etiqueta="Tipo" campo="tipo" errores={errores}>
                  <select {...aria("tipo", errores)} disabled={bloqueada} value={form.tipo} onChange={(e) => update("tipo", e.target.value as ListaPrecioTipo)}>
                    <option value="VENTA">Venta</option>
                    <option value="COMPRA">Compra</option>
                  </select>
                </Campo>
              </div>

              <div className={styles.gridFour}>
                <Campo etiqueta="Moneda" campo="monedaCodigo" errores={errores}>
                  <select
                    {...aria("monedaCodigo", errores)}
                    disabled={bloqueada}
                    value={form.monedaCodigo}
                    onChange={(e) => {
                      if (form.productos.length > 0 && !window.confirm(`La lista tiene ${form.productos.length} precio(s) cargado(s). Cambiar la moneda a ${e.target.value} NO convierte los importes (no hay conversión aprobada). ¿Continuar?`)) return;
                      update("monedaCodigo", e.target.value);
                    }}
                  >
                    {(catalogo?.monedas ?? [{ codigo: form.monedaCodigo, nombre: form.monedaCodigo, simbolo: "" }]).map((m) => (
                      <option key={m.codigo} value={m.codigo}>
                        {m.codigo}
                        {m.nombre && m.nombre !== m.codigo ? ` · ${m.nombre}` : ""}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta="Estado" campo="estado" errores={errores}>
                  <select {...aria("estado", errores)} disabled={bloqueada} value={form.estado} onChange={(e) => update("estado", e.target.value as ListaPrecioEstado)}>
                    {estadosDisponibles.map(([valor, texto]) => (
                      <option key={valor} value={valor}>
                        {texto}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta="Modo de precio" campo="modoPrecio" errores={errores}>
                  <select {...aria("modoPrecio", errores)} disabled={bloqueada} value={form.modoPrecio} onChange={(e) => update("modoPrecio", e.target.value as ListaPrecioModo)}>
                    <option value="PRECIO_FIJO">Precio fijo</option>
                    <option value="AJUSTE_PORCENTAJE">Ajuste porcentual</option>
                    <option value="MARGEN_SOBRE_COSTO">Margen sobre costo</option>
                  </select>
                </Campo>
                <Campo etiqueta="Lista base" campo="listaBaseId" errores={errores} ayuda="Misma moneda y tipo que esta lista.">
                  <select
                    {...aria("listaBaseId", errores)}
                    disabled={bloqueada}
                    value={form.listaBaseId}
                    onChange={(e) => {
                      const elegida = listasBase.find((l) => l.id === e.target.value);

                      setForm((a) => ({ ...a, listaBaseId: e.target.value, listaBaseCodigo: elegida?.codigo ?? "", listaBaseNombre: elegida?.nombre ?? "" }));
                      limpiar("listaBaseId");
                    }}
                  >
                    <option value="">Sin lista base</option>
                    {listasBase.map((l) => (
                      <option key={l.id} value={l.id}>
                        {etiquetaOpcion(l)} · {l.monedaCodigo}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>

              <div className={styles.gridFour}>
                <Campo etiqueta="Vigencia desde" requerido campo="vigenteDesde" errores={errores}>
                  <CampoFecha {...aria("vigenteDesde", errores)} valor={form.vigenteDesde} alCambiar={(v) => update("vigenteDesde", v)} claseError={styles.campoError} />
                </Campo>
                <Campo etiqueta="Vigencia hasta" campo="vigenteHasta" errores={errores}>
                  <CampoFecha {...aria("vigenteHasta", errores)} valor={form.vigenteHasta} alCambiar={(v) => update("vigenteHasta", v)} claseError={styles.campoError} />
                </Campo>
                <Numero etiqueta="Prioridad" campo="prioridad" errores={errores} valor={form.prioridad} min="0" alCambiar={(v) => update("prioridad", v)} />
                <Numero etiqueta="Descuento máximo %" campo="descuentoMaximoPct" errores={errores} valor={form.descuentoMaximoPct} step="0.01" min="0" max="100" alCambiar={(v) => update("descuentoMaximoPct", v)} />
              </div>

              {form.modoPrecio === "AJUSTE_PORCENTAJE" || form.ajusteGeneralPct !== 0 ? (
                <div className={styles.gridFour}>
                  <Numero
                    etiqueta="Ajuste general %"
                    campo="ajusteGeneralPct"
                    errores={errores}
                    valor={form.ajusteGeneralPct}
                    step="0.01"
                    min="-100"
                    disabled={bloqueada || form.modoPrecio !== "AJUSTE_PORCENTAJE"}
                    alCambiar={(v) => update("ajusteGeneralPct", v)}
                    ayuda={form.modoPrecio !== "AJUSTE_PORCENTAJE" ? "Valor guardado; solo aplica en el modo Ajuste porcentual." : "Ajuste de la lista respecto de su lista base; no es el ajuste masivo de precios."}
                  />
                </div>
              ) : null}

              <div className={styles.gridTwo}>
                <Campo etiqueta="Descripción" campo="descripcion" errores={errores} className={styles.full}>
                  <textarea {...aria("descripcion", errores)} maxLength={1000} rows={2} value={form.descripcion} onChange={(e) => update("descripcion", e.target.value)} />
                </Campo>
              </div>

              <div className={styles.checkGrid}>
                <Check etiqueta="IVA incluido" checked={form.incluyeIva} alCambiar={(v) => update("incluyeIva", v)} />
                <Check etiqueta="Permite descuento adicional" checked={form.permiteDescuentoAdicional} alCambiar={(v) => update("permiteDescuentoAdicional", v)} />
              </div>
            </>
          ) : null}

          {tab === "productos" ? (
            <>
              {!referenciaUtil ? (
                <div className={styles.aviso} style={{ margin: "0 0 12px" }}>
                  Los valores de referencia (costo promedio y precio de referencia) están en {monedaBase}. Esta lista está en {moneda}: los productos se agregan sin costo ni precio, porque no hay conversión de moneda aprobada.
                </div>
              ) : null}

              <div className={styles.buscador}>
                <Campo etiqueta="Buscar producto" campo="busquedaProducto" errores={errores}>
                  <input id="lp-busquedaProducto" value={busquedaProducto} placeholder="Código o descripción" onChange={(e) => setBusquedaProducto(e.target.value)} />
                </Campo>
                <Campo etiqueta={`Producto (${coincidencias.length} disponibles)`} campo="productoElegido" errores={errores}>
                  <select id="lp-productoElegido" value={productoElegido} onChange={(e) => setProductoElegido(e.target.value)}>
                    <option value="">Seleccione un producto</option>
                    {coincidencias.slice(0, 100).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.codigo} · {p.descripcion}
                      </option>
                    ))}
                  </select>
                </Campo>
                <button type="button" className={styles.addButton} disabled={!productoElegido} onClick={agregarProducto}>
                  ＋ Agregar producto
                </button>
                <button type="button" className={styles.secondaryAction} disabled={coincidencias.length === 0} onClick={importarFiltrados}>
                  Importar los {coincidencias.length} filtrados
                </button>
              </div>

              <div className={styles.summaryStrip}>
                <div>
                  <span>Productos</span>
                  <strong>{resumen.total}</strong>
                </div>
                <div>
                  <span>Activos</span>
                  <strong>{resumen.activos}</strong>
                </div>
                <div>
                  <span>Precio promedio ({moneda}, activos con precio)</span>
                  <strong>{formatoMoneda(resumen.promedio, moneda)}</strong>
                </div>
                {advertencias.sinPrecio > 0 ? (
                  <div className={styles.alerta}>
                    <span>Sin precio</span>
                    <strong>{advertencias.sinPrecio}</strong>
                  </div>
                ) : null}
                <div className={styles.massActions} role="group" aria-label="Ajuste porcentual del precio de lista">
                  <span>Ajustar sobre el precio base:</span>
                  {[-10, -5, 5].map((p) => (
                    <button key={p} type="button" onClick={() => aplicarAjuste(p)} disabled={form.productos.length === 0}>
                      {p > 0 ? "+" : ""}
                      {p}%
                    </button>
                  ))}
                  <input type="number" step="0.01" aria-label="Porcentaje personalizado" placeholder="% libre" value={ajustePersonalizado} onChange={(e) => setAjustePersonalizado(e.target.value)} />
                  <button type="button" disabled={form.productos.length === 0 || !ajustePersonalizado} onClick={() => aplicarAjuste(Number(ajustePersonalizado))}>
                    Aplicar
                  </button>
                </div>
              </div>

              {form.productos.length === 0 ? (
                <div className={styles.empty}>
                  <strong>Sin productos en la lista.</strong>
                  <span>Busque y agregue productos, o importe los que coinciden con la búsqueda.</span>
                </div>
              ) : (
                <div className={styles.priceTable}>
                  <div className={styles.priceHeader}>
                    <span>Producto</span>
                    <span>Costo ({moneda})</span>
                    <span>Precio base</span>
                    <span>Precio lista</span>
                    <span>Margen</span>
                    <span>Cant. mín.</span>
                    <span />
                  </div>

                  {form.productos.map((p, i) => {
                    const r = `productos.${i}`;
                    const margen = margenBruto(p.precioLista, p.costoReferencia);
                    const solapados = tramosSuperpuestos(p.escalas);

                    return (
                      <div key={p.id}>
                        <div className={styles.priceLine}>
                          <div className={styles.productName}>
                            <strong title={p.productoDescripcion}>{p.productoDescripcion}</strong>
                            <small>{p.productoCodigo}</small>
                            {p.activo && p.precioLista <= 0 ? <span className={styles.chipAlerta}>Sin precio</span> : null}
                          </div>
                          <input {...aria(`${r}.costoReferencia`, errores)} className={errores[`${r}.costoReferencia`] ? styles.conError : undefined} aria-label="Costo de referencia" type="number" min="0" step={decimales === 0 ? "1" : "0.01"} value={p.costoReferencia} onChange={(e) => cambiarProducto(p.id, { costoReferencia: num(e.target.value) }, `${r}.costoReferencia`)} />
                          <input {...aria(`${r}.precioBase`, errores)} className={errores[`${r}.precioBase`] ? styles.conError : undefined} aria-label="Precio base" type="number" min="0" step={decimales === 0 ? "1" : "0.01"} value={p.precioBase} onChange={(e) => cambiarProducto(p.id, { precioBase: num(e.target.value) }, `${r}.precioBase`)} />
                          <input {...aria(`${r}.precioLista`, errores)} className={errores[`${r}.precioLista`] ? styles.conError : undefined} aria-label="Precio de lista" type="number" min="0" step={decimales === 0 ? "1" : "0.01"} value={p.precioLista} onChange={(e) => cambiarProducto(p.id, { precioLista: num(e.target.value) }, `${r}.precioLista`)} />
                          <span className={styles.margin} title="Margen bruto sobre el precio: (precio − costo) / precio">
                            {margen === null ? "—" : `${margen.toFixed(2)} %`}
                          </span>
                          <input {...aria(`${r}.cantidadMinima`, errores)} className={errores[`${r}.cantidadMinima`] ? styles.conError : undefined} aria-label="Cantidad mínima" type="number" min="0" step="any" value={p.cantidadMinima} onChange={(e) => cambiarProducto(p.id, { cantidadMinima: num(e.target.value, 1) }, `${r}.cantidadMinima`)} />
                          <button type="button" className={styles.removeButton} aria-label={`Quitar ${p.productoDescripcion}`} onClick={() => update("productos", form.productos.filter((x) => x.id !== p.id))}>
                            ×
                          </button>
                        </div>
                        {errores[`${r}.precioLista`] || errores[`${r}.costoReferencia`] || errores[`${r}.precioBase`] || errores[`${r}.cantidadMinima`] ? (
                          <p className={styles.campoError} role="alert" style={{ margin: "0 12px 6px" }}>
                            {errores[`${r}.precioLista`] ?? errores[`${r}.costoReferencia`] ?? errores[`${r}.precioBase`] ?? errores[`${r}.cantidadMinima`]}
                          </p>
                        ) : null}

                        <details className={styles.detalle} open={abiertos[p.id] === true} onToggle={(e) => setAbiertos((a) => ({ ...a, [p.id]: (e.currentTarget as HTMLDetailsElement).open }))}>
                          <summary>
                            Escalones, descuento y vigencia{p.escalas.length > 0 ? ` (${p.escalas.length} escalones)` : ""}
                            {solapados.length > 0 ? " · escalones superpuestos" : ""}
                          </summary>

                          <div className={styles.gridFour}>
                            <Numero etiqueta="Descuento %" campo={`${r}.descuentoPct`} errores={errores} valor={p.descuentoPct} step="0.01" min="0" max="100" alCambiar={(v) => cambiarProducto(p.id, { descuentoPct: v }, `${r}.descuentoPct`)} />
                            <Campo etiqueta="Vigencia desde" campo={`${r}.vigenteDesde`} errores={errores}>
                              <CampoFecha {...aria(`${r}.vigenteDesde`, errores)} valor={p.vigenteDesde} alCambiar={(v) => cambiarProducto(p.id, { vigenteDesde: v }, `${r}.vigenteDesde`)} claseError={styles.campoError} />
                            </Campo>
                            <Campo etiqueta="Vigencia hasta" campo={`${r}.vigenteHasta`} errores={errores}>
                              <CampoFecha {...aria(`${r}.vigenteHasta`, errores)} valor={p.vigenteHasta} alCambiar={(v) => cambiarProducto(p.id, { vigenteHasta: v }, `${r}.vigenteHasta`)} claseError={styles.campoError} />
                            </Campo>
                            <div className={styles.checkGrid} style={{ alignSelf: "end" }}>
                              <Check etiqueta="Precio activo" checked={p.activo} alCambiar={(v) => cambiarProducto(p.id, { activo: v })} />
                            </div>
                          </div>

                          {solapados.length > 0 ? (
                            <p className={styles.campoError} role="status">
                              Hay escalones cuyas cantidades se superponen: la selección del escalón sería ambigua. Ajuste los rangos.
                            </p>
                          ) : null}

                          {p.escalas.map((s, k) => {
                            const re = `${r}.escalas.${k}`;

                            return (
                              <div key={s.id} className={styles.escalaFila}>
                                <Numero etiqueta={`Escalón ${k + 1} · desde`} campo={`${re}.cantidadMinima`} errores={errores} valor={s.cantidadMinima} step="any" min="0" alCambiar={(v) => cambiarEscala(p, s.id, { cantidadMinima: v }, `${re}.cantidadMinima`)} />
                                <Campo etiqueta="Hasta (vacío = sin límite)" campo={`${re}.cantidadMaxima`} errores={errores}>
                                  <input {...aria(`${re}.cantidadMaxima`, errores)} type="number" step="any" min="0" value={s.cantidadMaxima ?? ""} onChange={(e) => cambiarEscala(p, s.id, { cantidadMaxima: e.target.value === "" ? null : Number(e.target.value) }, `${re}.cantidadMaxima`)} />
                                </Campo>
                                <Numero etiqueta="Precio" campo={`${re}.precio`} errores={errores} valor={s.precio} step={decimales === 0 ? "1" : "0.01"} min="0" alCambiar={(v) => cambiarEscala(p, s.id, { precio: v }, `${re}.precio`)} />
                                <Numero etiqueta="Descuento %" campo={`${re}.descuentoPct`} errores={errores} valor={s.descuentoPct} step="0.01" min="0" max="100" alCambiar={(v) => cambiarEscala(p, s.id, { descuentoPct: v }, `${re}.descuentoPct`)} />
                                <button type="button" className={styles.removeButton} aria-label={`Quitar escalón ${k + 1}`} onClick={() => cambiarProducto(p.id, { escalas: p.escalas.filter((x) => x.id !== s.id) })}>
                                  ×
                                </button>
                              </div>
                            );
                          })}

                          <button
                            type="button"
                            className={styles.secondaryAction}
                            onClick={() => {
                              cambiarProducto(p.id, { escalas: [...p.escalas, { id: uid("escala"), cantidadMinima: Math.max(1, ...p.escalas.map((x) => (x.cantidadMaxima ?? x.cantidadMinima) + 1)), cantidadMaxima: null, precio: redondearMoneda(p.precioLista, moneda), descuentoPct: 0 }] });
                              setAbiertos((a) => ({ ...a, [p.id]: true }));
                            }}
                          >
                            ＋ Agregar escalón
                          </button>
                        </details>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : null}

          {tab === "reglas" ? (
            <>
              <div className={styles.sectionTitle}>
                <h3>Alcance de la lista</h3>
              </div>
              <div className={styles.gridFour}>
                <Campo etiqueta="Grupo de cliente" campo="grupoClienteId" errores={errores}>
                  <select
                    {...aria("grupoClienteId", errores)}
                    disabled={bloqueada}
                    value={form.grupoClienteId}
                    onChange={(e) => {
                      const o = grupos.find((x) => x.id === e.target.value);

                      setForm((a) => ({ ...a, grupoClienteId: e.target.value, grupoClienteNombre: o?.nombre ?? "" }));
                      limpiar("grupoClienteId");
                    }}
                  >
                    <option value="">Todos</option>
                    {grupos.map((o) => (
                      <option key={o.id} value={o.id}>
                        {etiquetaOpcion(o)}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta="Cliente específico" campo="clienteId" errores={errores}>
                  <select
                    {...aria("clienteId", errores)}
                    disabled={bloqueada}
                    value={form.clienteId}
                    onChange={(e) => {
                      const o = clientes.find((x) => x.id === e.target.value);

                      setForm((a) => ({ ...a, clienteId: e.target.value, clienteCodigo: o?.codigo ?? "", clienteNombre: o?.nombre ?? "" }));
                      limpiar("clienteId");
                    }}
                  >
                    <option value="">Sin cliente específico</option>
                    {clientes.map((o) => (
                      <option key={o.id} value={o.id}>
                        {etiquetaOpcion(o)}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta="Zona comercial" campo="zonaId" errores={errores}>
                  <select
                    {...aria("zonaId", errores)}
                    disabled={bloqueada}
                    value={form.zonaId}
                    onChange={(e) => {
                      const o = zonas.find((x) => x.id === e.target.value);

                      setForm((a) => ({ ...a, zonaId: e.target.value, zonaNombre: o?.nombre ?? "" }));
                      limpiar("zonaId");
                    }}
                  >
                    <option value="">Todas</option>
                    {zonas.map((o) => (
                      <option key={o.id} value={o.id}>
                        {etiquetaOpcion(o)}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta="Canal de venta" campo="canalVentaId" errores={errores}>
                  <select
                    {...aria("canalVentaId", errores)}
                    disabled={bloqueada}
                    value={form.canalVentaId}
                    onChange={(e) => {
                      const o = canales.find((x) => x.id === e.target.value);

                      setForm((a) => ({ ...a, canalVentaId: e.target.value, canalVentaNombre: o?.nombre ?? "" }));
                      limpiar("canalVentaId");
                    }}
                  >
                    <option value="">Todos</option>
                    {canales.map((o) => (
                      <option key={o.id} value={o.id}>
                        {etiquetaOpcion(o)}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>

              <div className={styles.sectionTitle}>
                <h3>Reglas adicionales</h3>
                <button type="button" className={styles.addButton} onClick={agregarRegla}>
                  ＋ Agregar regla
                </button>
              </div>

              {form.reglasComerciales.length === 0 ? (
                <div className={styles.empty}>
                  <strong>Sin reglas adicionales.</strong>
                  <span>La lista utilizará solamente la configuración principal.</span>
                </div>
              ) : (
                <div className={styles.ruleList}>
                  {form.reglasComerciales.map((g, i) => {
                    const r = `reglasComerciales.${i}`;

                    return (
                      <article key={g.id} className={styles.ruleCard}>
                        <header>
                          <strong>Regla {i + 1}</strong>
                          <button type="button" onClick={() => update("reglasComerciales", form.reglasComerciales.filter((x) => x.id !== g.id))}>
                            Eliminar
                          </button>
                        </header>

                        <div className={styles.gridFour}>
                          <Campo etiqueta="Aplicación" campo={`${r}.tipoAplicacion`} errores={errores}>
                            <select {...aria(`${r}.tipoAplicacion`, errores)} value={g.tipoAplicacion} onChange={(e) => cambiarRegla(g.id, { tipoAplicacion: e.target.value as ListaPrecioReglaComercial["tipoAplicacion"], referenciaId: "", referenciaCodigo: "", referenciaNombre: "" }, `${r}.referenciaId`)}>
                              <option value="GENERAL">General</option>
                              <option value="GRUPO_CLIENTE">Grupo de cliente</option>
                              <option value="CLIENTE">Cliente</option>
                              <option value="ZONA">Zona comercial</option>
                              <option value="CANAL_VENTA">Canal de venta</option>
                            </select>
                          </Campo>
                          {g.tipoAplicacion !== "GENERAL" ? (
                            <Campo etiqueta="Referencia" requerido campo={`${r}.referenciaId`} errores={errores}>
                              <select
                                {...aria(`${r}.referenciaId`, errores)}
                                value={g.referenciaId}
                                onChange={(e) => {
                                  const o = opcionesReferencia(g).find((x) => x.id === e.target.value);

                                  cambiarRegla(g.id, { referenciaId: e.target.value, referenciaCodigo: o?.codigo ?? "", referenciaNombre: o?.nombre ?? "" }, `${r}.referenciaId`);
                                }}
                              >
                                <option value="">Seleccione</option>
                                {opcionesReferencia(g).map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {etiquetaOpcion(o)}
                                  </option>
                                ))}
                              </select>
                            </Campo>
                          ) : null}
                          <Numero etiqueta="Prioridad" campo={`${r}.prioridad`} errores={errores} valor={g.prioridad} min="0" alCambiar={(v) => cambiarRegla(g.id, { prioridad: v }, `${r}.prioridad`)} />
                          <Numero etiqueta="Cantidad mínima" campo={`${r}.cantidadMinima`} errores={errores} valor={g.cantidadMinima} step="any" min="0" alCambiar={(v) => cambiarRegla(g.id, { cantidadMinima: v }, `${r}.cantidadMinima`)} />
                          <Numero etiqueta="Descuento máximo %" campo={`${r}.descuentoMaximoPct`} errores={errores} valor={g.descuentoMaximoPct} step="0.01" min="0" max="100" alCambiar={(v) => cambiarRegla(g.id, { descuentoMaximoPct: v }, `${r}.descuentoMaximoPct`)} />
                        </div>

                        <div className={styles.gridFour}>
                          <Campo etiqueta="Vigencia desde" campo={`${r}.vigenteDesde`} errores={errores}>
                            <CampoFecha {...aria(`${r}.vigenteDesde`, errores)} valor={g.vigenteDesde} alCambiar={(v) => cambiarRegla(g.id, { vigenteDesde: v }, `${r}.vigenteDesde`)} claseError={styles.campoError} />
                          </Campo>
                          <Campo etiqueta="Vigencia hasta" campo={`${r}.vigenteHasta`} errores={errores}>
                            <CampoFecha {...aria(`${r}.vigenteHasta`, errores)} valor={g.vigenteHasta} alCambiar={(v) => cambiarRegla(g.id, { vigenteHasta: v }, `${r}.vigenteHasta`)} claseError={styles.campoError} />
                          </Campo>
                          <div className={styles.checkGrid} style={{ gridColumn: "span 2", alignSelf: "end" }}>
                            <Check etiqueta="Permite descuento adicional" checked={g.permiteDescuentoAdicional} alCambiar={(v) => cambiarRegla(g.id, { permiteDescuentoAdicional: v })} />
                            <Check etiqueta="Regla activa" checked={g.activo} alCambiar={(v) => cambiarRegla(g.id, { activo: v })} />
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              <div className={styles.gridTwo} style={{ marginTop: 12 }}>
                <Campo etiqueta="Observación" campo="observacion" errores={errores} className={styles.full}>
                  <textarea {...aria("observacion", errores)} maxLength={1000} rows={2} value={form.observacion} onChange={(e) => update("observacion", e.target.value)} />
                </Campo>
              </div>
            </>
          ) : null}
        </div>

        <footer className={styles.footer}>
          <small>{sucio ? "Hay cambios sin guardar." : "Sin cambios pendientes."}</small>

          <div className={styles.footerActions}>
            <Link href="/listas-precio" className={styles.cancelButton} onClick={(e) => !confirmarSalida() && e.preventDefault()}>
              Cancelar
            </Link>
            <button type="submit" disabled={saving} className={styles.saveButton}>
              {saving ? "Guardando..." : mode === "create" ? "Guardar lista" : "Actualizar lista"}
            </button>
          </div>
        </footer>
      </form>
    </section>
  );
}
