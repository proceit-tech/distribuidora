"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import ui from "@/components/ui/lista-padrao/lista.module.css";
import { resumenCalculo, type LineaFE } from "@/lib/facturacion/payload-fe";
import { formatearFechaPy } from "@/lib/formato/listas";
import { useProtegerCambios } from "@/lib/ui/proteger-cambios";

import estilos from "./page.module.css";

type Punto = { id: string; codigo: string; nombre: string };
type Sucursal = { id: string; nombre: string; establecimiento: string; puntos: Punto[] };
type Opciones = { tiposTransaccion: Record<string, string>; presencias: Record<string, string>; formasPago: Record<string, string> };
type Cliente = {
  id: string; codigo: string; razonSocial: string; nombreFantasia: string | null; numeroDocumento: string; dv: string | null; naturaleza: number; tipoContribuyente: number | null;
  email: string | null; emailFacturacion: string | null; telefono: string | null; celular: string | null; direccion: string | null; numeroCasa: string | null; apto: boolean; pendientes: string[];
};
type Producto = {
  id: string; codigo: string; descripcion: string; unidadSifen: number | null; unidadSimbolo: string | null; unidadNombre: string | null; afectacion: number | null; proporcion: string | null;
  tasa: number | null; precio: string | null; monedaPrecio: string | null; gtin: string | null;
};
type Linea = { clave: number; producto: Producto; cantidad: string; precio: string };
type Resumen = {
  empresa: string; sucursal: string; establecimiento: string; punto: string; numero: string; cliente: { codigo: string; razonSocial: string; documento: string };
  tipoTransaccion: string; presencia: string; condicion: string; formaPago: string; moneda: string;
  lineas: Array<{ codigo: string; descripcion: string; unidad: string; cantidad: string; precio: string; precioLista: string; precioModificado: boolean; afectacion: number; tasa: number; total: number }>;
  totales: { exento: number; exonerado: number; gravado5: number; gravado10: number; iva5: number; iva10: number; totalIva: number; total: number };
};
type FaseEnvio = { fase: string; ok: boolean; detalle: string; http?: number | null };
type ResultadoEnvio = {
  documentoId: string; numero: string; reutilizado: boolean; estadoLocal: string; errorTipo: string | null; resultado: string; http: number | null; mensaje: string | null; lote: string | null; cdc: string | null;
  estadoGateway: string | null; errores: string[]; fases: FaseEnvio[];
};
const ETIQUETA_FASE: Record<string, string> = { AUTENTICACION: "Autenticación", TRANSMISION: "Transmisión", RESPUESTA: "Respuesta" };
const ETIQUETA_RESULTADO: Record<string, string> = {
  OK: "Recepción confirmada por el gateway", ERROR_HTTP: "Rechazado o error del gateway", TIMEOUT: "Tiempo de espera agotado", RED: "Error de red", RESPUESTA_INVALIDA: "Respuesta no interpretable", YA_ENVIADO: "Ya enviado anteriormente",
};
const ETIQUETA_ESTADO_LOCAL: Record<string, string> = {
  ENVIADO: "Recepción confirmada por el gateway",
  ERROR_ENVIO: "Error de envío",
  ENVIO_INDETERMINADO: "Recepción NO confirmada (verifique en el gateway; no se reenvía automáticamente)",
};

const ETIQUETA_IVA: Record<number, string> = { 1: "Gravado", 2: "Exonerado", 3: "Exento", 4: "Gravado parcial" };
const ETIQUETA_CONTRIBUYENTE: Record<number, string> = { 1: "Persona física", 2: "Persona jurídica" };
const gs = (n: number) => n.toLocaleString("es-PY", { maximumFractionDigits: 8 });
const MIN_BUSQUEDA = 2;
const CANTIDAD_OK = /^\d{1,10}(\.\d{1,4})?$/;
const PRECIO_OK = /^\d{1,12}(\.\d{1,4})?$/;

async function leer<T>(r: Response, porDefecto: string): Promise<T> {
  const j = (await r.json().catch(() => ({}))) as T & { error?: string; detalles?: string[] };

  if (!r.ok) throw Object.assign(new Error(j.error ?? porDefecto), { detalles: j.detalles ?? [] });

  return j;
}

/** Impedimentos visibles por producto (el servidor vuelve a validar todo; esto solo evita enviar lo que se sabe inválido). */
function problemasProducto(p: Producto): string[] {
  const m: string[] = [];

  if (p.afectacion === null) m.push("sin clasificación de IVA");
  if (p.unidadSifen === null) m.push("sin unidad de medida SIFEN");
  if (p.precio === null || p.monedaPrecio !== "PYG") m.push("sin precio de venta en guaraníes");

  return m;
}

const cantidadValida = (l: Linea) => CANTIDAD_OK.test(l.cantidad) && Number(l.cantidad) > 0 && (l.producto.unidadSifen !== 77 || /^\d+(\.0+)?$/.test(l.cantidad));
const precioValido = (l: Linea) => PRECIO_OK.test(l.precio) && Number(l.precio) > 0;
const precioModificado = (l: Linea) => precioValido(l) && Number(l.precio) !== Number(l.producto.precio);

const aLineaFE = (l: Linea): LineaFE => ({
  codigoInterno: l.producto.codigo, gtin: l.producto.gtin, descripcion: l.producto.descripcion, unidadSifen: l.producto.unidadSifen, cantidad: l.cantidad,
  precio: precioValido(l) ? l.precio : (l.producto.precio ?? "0"), afectacion: l.producto.afectacion, tasa: l.producto.tasa, proporcion: l.producto.proporcion,
});

const tipoContribuyente = (c: Cliente) => (c.naturaleza === 2 ? "No contribuyente" : (ETIQUETA_CONTRIBUYENTE[c.tipoContribuyente ?? 0] ?? "Contribuyente"));
const documentoCliente = (c: Cliente) => `${c.numeroDocumento}${c.dv ? `-${c.dv}` : ""}`;

/** Cierra el diálogo con Escape. */
function useEscape(alCerrar: () => void) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && alCerrar();

    window.addEventListener("keydown", f);

    return () => window.removeEventListener("keydown", f);
  }, [alCerrar]);
}

/** Selector de clientes: no consulta nada hasta que el operador pulsa «Buscar» (o Enter) con al menos 2 caracteres. */
function SelectorCliente({ alElegir, alCerrar }: { alElegir: (c: Cliente) => void; alCerrar: () => void }) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<Cliente[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState("");
  const ultima = useRef(0);

  useEscape(alCerrar);

  async function buscar() {
    const q = texto.trim();

    if (q.length < MIN_BUSQUEDA) {
      setError(`Escriba al menos ${MIN_BUSQUEDA} caracteres (código, nombre o documento).`);

      return;
    }

    const id = ++ultima.current;

    setBuscando(true);
    setError("");
    try {
      const j = await leer<{ clientes: Cliente[] }>(await fetch(`/api/facturas/clientes?q=${encodeURIComponent(q)}`, { cache: "no-store" }), "No fue posible buscar clientes.");

      if (id === ultima.current) setResultados(j.clientes);
    } catch (e) {
      if (id === ultima.current) {
        setResultados(null);
        setError(e instanceof Error ? e.message : "No fue posible buscar clientes.");
      }
    } finally {
      if (id === ultima.current) setBuscando(false);
    }
  }

  return (
    <div className={estilos.overlay} role="presentation">
      <div className={estilos.modal} role="dialog" aria-modal="true" aria-labelledby="titulo-cliente">
        <div className={estilos.modalHead}>
          <div>
            <h2 id="titulo-cliente">Buscar cliente</h2>
            <p className={estilos.hint} style={{ margin: 0 }}>Busque por código, razón social, nombre de fantasía o documento. Solo se muestran clientes activos y habilitados para ventas.</p>
          </div>
          <button type="button" className={estilos.close} onClick={alCerrar} aria-label="Cerrar">×</button>
        </div>

        <form className={estilos.searchRow} onSubmit={(e) => { e.preventDefault(); void buscar(); }}>
          <input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Código, nombre o documento" aria-label="Texto de búsqueda de cliente" />
          <button type="submit" className={ui.primaryButton} disabled={buscando}>{buscando ? "Buscando..." : "Buscar"}</button>
        </form>

        {error ? <p className={estilos.fieldError} role="alert">{error}</p> : null}

        {resultados === null ? (
          <div className={estilos.mensajeVacio}>Escriba un criterio y pulse «Buscar» para ver clientes.</div>
        ) : resultados.length === 0 ? (
          <div className={estilos.mensajeVacio}>No se encontraron clientes con ese criterio. <Link href="/clientes">Ir a Clientes</Link></div>
        ) : (
          <ul className={estilos.resultados} aria-label="Clientes encontrados">
            {resultados.map((c) => (
              <li key={c.id}>
                <div className={estilos.info}>
                  <strong>{c.razonSocial}</strong>
                  <small>{c.codigo} · {documentoCliente(c)} · {tipoContribuyente(c)}</small>
                  {!c.apto ? <small className={estilos.impedimento}>No apto para facturar: {c.pendientes.join(" · ")}. <Link href="/clientes">Corregir en Clientes</Link></small> : null}
                </div>
                <button type="button" className={ui.secondaryButton} disabled={!c.apto} onClick={() => alElegir(c)}>Seleccionar</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Selector de productos: igual que el de clientes, sin listado previo. Permite añadir varios sin cerrar. */
function SelectorProducto({ alAgregar, alCerrar, cantidadItems }: { alAgregar: (p: Producto) => void; alCerrar: () => void; cantidadItems: number }) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<Producto[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const ultima = useRef(0);

  useEscape(alCerrar);

  async function buscar() {
    const q = texto.trim();

    if (q.length < MIN_BUSQUEDA) {
      setError(`Escriba al menos ${MIN_BUSQUEDA} caracteres (código, código de barras, GTIN o descripción).`);

      return;
    }

    const id = ++ultima.current;

    setBuscando(true);
    setError("");
    setAviso("");
    try {
      const j = await leer<{ productos: Producto[] }>(await fetch(`/api/facturas/productos?q=${encodeURIComponent(q)}`, { cache: "no-store" }), "No fue posible buscar productos.");

      if (id === ultima.current) setResultados(j.productos);
    } catch (e) {
      if (id === ultima.current) {
        setResultados(null);
        setError(e instanceof Error ? e.message : "No fue posible buscar productos.");
      }
    } finally {
      if (id === ultima.current) setBuscando(false);
    }
  }

  return (
    <div className={estilos.overlay} role="presentation">
      <div className={`${estilos.modal} ${estilos.modalWide}`} role="dialog" aria-modal="true" aria-labelledby="titulo-producto">
        <div className={estilos.modalHead}>
          <div>
            <h2 id="titulo-producto">Añadir producto</h2>
            <p className={estilos.hint} style={{ margin: 0 }}>Busque por código, código de barras, GTIN o descripción. Se facturan mercaderías y servicios activos.</p>
          </div>
          <button type="button" className={estilos.close} onClick={alCerrar} aria-label="Cerrar">×</button>
        </div>

        <form className={estilos.searchRow} onSubmit={(e) => { e.preventDefault(); void buscar(); }}>
          <input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Código, GTIN o descripción" aria-label="Texto de búsqueda de producto" />
          <button type="submit" className={ui.primaryButton} disabled={buscando}>{buscando ? "Buscando..." : "Buscar"}</button>
        </form>

        {error ? <p className={estilos.fieldError} role="alert">{error}</p> : null}
        {aviso ? <p className={estilos.hint} role="status">{aviso}</p> : null}

        {resultados === null ? (
          <div className={estilos.mensajeVacio}>Escriba un criterio y pulse «Buscar» para ver productos.</div>
        ) : resultados.length === 0 ? (
          <div className={estilos.mensajeVacio}>No se encontraron productos con ese criterio. <Link href="/productos">Ir a Productos</Link></div>
        ) : (
          <ul className={estilos.resultados} aria-label="Productos encontrados">
            {resultados.map((p) => {
              const pr = problemasProducto(p);

              return (
                <li key={p.id}>
                  <div className={estilos.info}>
                    <strong>{p.descripcion}</strong>
                    <small>
                      {p.codigo} · {p.unidadSimbolo ?? "sin unidad"} · {p.afectacion ? `${ETIQUETA_IVA[p.afectacion]}${p.tasa ? ` ${p.tasa}%` : ""}` : "IVA sin clasificar"}
                      {p.precio ? ` · Gs. ${gs(Number(p.precio))} (IVA incl.)` : ""}
                    </small>
                    {pr.length > 0 ? <small className={estilos.impedimento}>No se puede facturar: {pr.join(", ")}. <Link href="/productos">Corregir en Productos</Link></small> : null}
                  </div>
                  <button type="button" className={ui.secondaryButton} disabled={pr.length > 0} onClick={() => { alAgregar(p); setAviso(`«${p.descripcion}» añadido a la factura.`); }}>Añadir</button>
                </li>
              );
            })}
          </ul>
        )}

        <div className={estilos.actions} style={{ marginTop: 12 }}>
          <span className={estilos.hint} style={{ margin: 0 }}>{cantidadItems} ítem{cantidadItems === 1 ? "" : "s"} en la factura</span>
          <button type="button" className={ui.primaryButton} onClick={alCerrar}>Listo</button>
        </div>
      </div>
    </div>
  );
}

export default function NuevaFacturaPage() {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [opciones, setOpciones] = useState<Opciones | null>(null);
  const [puedeEditarPrecio, setPuedeEditarPrecio] = useState(false);
  const [errorCarga, setErrorCarga] = useState("");
  const [sucursalId, setSucursalId] = useState("");
  const [puntoId, setPuntoId] = useState("");
  const [tipoTransaccion, setTipoTransaccion] = useState("1");
  const [presencia, setPresencia] = useState("1");
  const [formaPago, setFormaPago] = useState("1");
  const [infoAdicional, setInfoAdicional] = useState("");
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [siguienteClave, setSiguienteClave] = useState(1);
  const [clave, setClave] = useState(() => crypto.randomUUID());
  const [selector, setSelector] = useState<"cliente" | "producto" | null>(null);
  const [hoy, setHoy] = useState("");
  const [revisando, setRevisando] = useState(false);
  const [errores, setErrores] = useState<string[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoEnvio | null>(null);
  const [mostrarEnvio, setMostrarEnvio] = useState(false);

  const sucio = resultado === null && (cliente !== null || lineas.length > 0 || infoAdicional !== "");

  useProtegerCambios(sucio);

  useEffect(() => {
    let activo = true;

    fetch("/api/facturas/catalogos", { cache: "no-store" })
      .then((r) => leer<{ sucursales: Sucursal[]; opciones: Opciones; puedeEditarPrecio?: boolean }>(r, "No fue posible cargar los datos del formulario."))
      .then((j) => {
        if (!activo) return;

        setHoy(formatearFechaPy(new Date()));
        setSucursales(j.sucursales);
        setOpciones(j.opciones);
        setPuedeEditarPrecio(j.puedeEditarPrecio === true);
        if (j.sucursales.length === 1) {
          setSucursalId(j.sucursales[0].id);
          if (j.sucursales[0].puntos.length === 1) setPuntoId(j.sucursales[0].puntos[0].id);
        }
      })
      .catch((e: unknown) => activo && setErrorCarga(e instanceof Error ? e.message : "No fue posible cargar los datos del formulario."));

    return () => {
      activo = false;
    };
  }, []);

  const sucursal = sucursales.find((s) => s.id === sucursalId);
  const calculo = resumenCalculo(lineas.map(aLineaFE));
  const problemas = lineas.flatMap((l) => problemasProducto(l.producto).map((p) => `${l.producto.codigo}: ${p}.`));
  const lineasValidas = lineas.every((l) => cantidadValida(l) && precioValido(l));
  const faltan = [
    sucursalId === "" ? "sucursal" : "",
    puntoId === "" ? "punto de expedición" : "",
    cliente === null ? "cliente" : "",
    lineas.length === 0 ? "al menos un ítem" : "",
    lineas.length > 0 && !lineasValidas ? "corregir cantidades o precios" : "",
    problemas.length > 0 ? "corregir productos con impedimentos" : "",
  ].filter(Boolean);
  const puedeGuardar = !revisando && !enviando && faltan.length === 0 && cliente !== null && cliente.apto && calculo.completo;
  const hayPrecioModificado = lineas.some(precioModificado);

  function agregar(p: Producto) {
    // El mismo producto no se duplica: suma una unidad a su línea.
    const existente = lineas.find((l) => l.producto.id === p.id);

    if (existente) {
      setLineas((ls) => ls.map((l) => (l.clave === existente.clave ? { ...l, cantidad: String(Math.round((Number(l.cantidad || "0") + 1) * 10000) / 10000) } : l)));

      return;
    }

    setLineas((ls) => [...ls, { clave: siguienteClave, producto: p, cantidad: "1", precio: p.precio ?? "" }]);
    setSiguienteClave((n) => n + 1);
  }

  const editar = (k: number, cambio: Partial<Pick<Linea, "cantidad" | "precio">>) => setLineas((ls) => ls.map((x) => (x.clave === k ? { ...x, ...cambio } : x)));

  // El precio solo viaja cuando difiere del de lista; el servidor lo contrasta con el catálogo y con el permiso del usuario.
  const cuerpoFactura = () => ({
    claveIdempotencia: clave, sucursalId, puntoId, clienteId: cliente?.id, tipoTransaccion: Number(tipoTransaccion), presencia: Number(presencia),
    pagos: [{ tipo: Number(formaPago) }], infoAdicional,
    lineas: lineas.map((l) => ({ productoId: l.producto.id, cantidad: l.cantidad, ...(precioModificado(l) ? { precio: l.precio } : {}) })),
  });

  // «Grabar»: solo revisión. El servidor valida y calcula; NO se reserva número ni se transmite nada.
  async function grabar() {
    if (!cliente) return;

    setRevisando(true);
    setErrores([]);
    try {
      const r = await leer<{ resumen: Resumen }>(
        await fetch("/api/facturas/previa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpoFactura()) }),
        "No fue posible revisar la factura.",
      );

      setResumen(r.resumen);
    } catch (e) {
      const d = (e as { detalles?: string[] }).detalles ?? [];

      setErrores([e instanceof Error ? e.message : "No fue posible revisar la factura.", ...d]);
    } finally {
      setRevisando(false);
    }
  }

  // «Enviar factura»: confirma. La clave de idempotencia es la misma en cada reintento, así que no se duplica documento, número ni envío.
  async function enviar() {
    setEnviando(true);
    setMostrarEnvio(true);
    setErrores([]);
    try {
      const r = await leer<ResultadoEnvio>(
        await fetch("/api/facturas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpoFactura()) }),
        "No fue posible enviar la factura.",
      );

      setResultado(r);
      setResumen(null);
    } catch (e) {
      const d = (e as { detalles?: string[] }).detalles ?? [];

      setMostrarEnvio(false);
      setResumen(null);
      setErrores([e instanceof Error ? e.message : "No fue posible enviar la factura.", ...d]);
    } finally {
      setEnviando(false);
    }
  }

  // Reintento de un documento que ya existe con error de envío: usa el endpoint del documento (sin crear ni consumir numeración).
  async function reintentar() {
    if (!resultado) return;

    setEnviando(true);
    setMostrarEnvio(true);
    try {
      const r = await leer<ResultadoEnvio>(await fetch(`/api/documentos/${resultado.documentoId}/enviar`, { method: "POST" }), "No fue posible reintentar el envío.");

      setResultado({ ...r, documentoId: resultado.documentoId, reutilizado: true });
    } catch (e) {
      setMostrarEnvio(false);
      setErrores([e instanceof Error ? e.message : "No fue posible reintentar el envío."]);
    } finally {
      setEnviando(false);
    }
  }

  function nueva() {
    setCliente(null);
    setLineas([]);
    setInfoAdicional("");
    setErrores([]);
    setResultado(null);
    setResumen(null);
    setMostrarEnvio(false);
    setClave(crypto.randomUUID());
  }

  return (
    <section className={ui.page}>
      <header className={ui.topbar}>
        <div className={ui.titleBlock}>
          <nav className={ui.breadcrumb} aria-label="Ruta de navegación">
            <span>Facturación</span>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Nueva factura electrónica</span>
          </nav>

          <h1>Nueva factura electrónica</h1>
        </div>
      </header>

      {errorCarga ? <div className={ui.alertError} role="alert">{errorCarga}</div> : null}

      {resultado ? (
        <div className={resultado.estadoLocal === "ENVIADO" ? ui.alertOk : ui.alertError} role="status">
          <strong>Factura {resultado.numero}: {ETIQUETA_ESTADO_LOCAL[resultado.estadoLocal] ?? resultado.estadoLocal}.</strong> El estado fiscal (SIFEN) se confirma en Documentos electrónicos con la consulta de estado; recibir la factura no equivale a aprobarla.{" "}
          <Link href="/documentos">Ver documentos electrónicos</Link>
          {resultado.estadoLocal === "ERROR_ENVIO" && resultado.errorTipo !== "RECHAZO" ? <> · <button type="button" className={ui.clearButton} disabled={enviando} onClick={reintentar}>Reintentar envío</button></> : null}
          {resultado.estadoLocal === "ERROR_ENVIO" && resultado.errorTipo === "RECHAZO" ? <> · El gateway rechazó el documento; se conserva su número. El reenvío del mismo contenido se confirma desde Documentos electrónicos.</> : null}
          {" "}· <button type="button" className={ui.clearButton} onClick={nueva}>Nueva factura</button>{" "}
          <button type="button" className={ui.clearButton} onClick={() => setMostrarEnvio(true)}>Ver detalle técnico</button>
        </div>
      ) : (
        <div className={estilos.form}>
          <section className={estilos.card} aria-labelledby="sec-cabecera">
            <div className={estilos.cardHead}>
              <h2 id="sec-cabecera">Cabecera</h2>
            </div>
            <div className={estilos.cardBody}>
              <div className={estilos.grid}>
                <label className={estilos.field}>
                  <span>Sucursal *</span>
                  <select value={sucursalId} onChange={(e) => { setSucursalId(e.target.value); setPuntoId(""); }}>
                    <option value="">Seleccione…</option>
                    {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre} ({s.establecimiento})</option>)}
                  </select>
                </label>

                <label className={estilos.field}>
                  <span>Punto de expedición *</span>
                  <select value={puntoId} onChange={(e) => setPuntoId(e.target.value)} disabled={!sucursal}>
                    <option value="">Seleccione…</option>
                    {(sucursal?.puntos ?? []).map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}
                  </select>
                  {sucursal && sucursal.puntos.length === 0 ? <small className={estilos.fieldError}>Esta sucursal no tiene puntos de expedición activos.</small> : null}
                </label>

                <div className={estilos.field}>
                  <span>Fecha de emisión</span>
                  <div className={estilos.readonly}>{hoy || "—"} · la fija el sistema al enviar</div>
                </div>

                <div className={estilos.field}>
                  <span>Número</span>
                  <div className={estilos.readonly}>Se asigna al enviar la factura</div>
                </div>

                <label className={estilos.field}>
                  <span>Condición y forma de pago</span>
                  <select value={formaPago} onChange={(e) => setFormaPago(e.target.value)} aria-label="Forma de pago (contado)">
                    {Object.entries(opciones?.formasPago ?? {}).map(([k, v]) => <option key={k} value={k}>Contado · {v}</option>)}
                  </select>
                </label>

                <div className={estilos.field}>
                  <span>Moneda</span>
                  <div className={estilos.readonly}>Guaraníes (PYG)</div>
                </div>

                <label className={estilos.field}>
                  <span>Tipo de transacción</span>
                  <select value={tipoTransaccion} onChange={(e) => setTipoTransaccion(e.target.value)}>
                    {Object.entries(opciones?.tiposTransaccion ?? {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>

                <label className={estilos.field}>
                  <span>Indicador de presencia</span>
                  <select value={presencia} onChange={(e) => setPresencia(e.target.value)}>
                    {Object.entries(opciones?.presencias ?? {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
              </div>
              <p className={estilos.hint}>Solo se factura al contado y en guaraníes en esta etapa. El número y la fecha fiscal los asigna el sistema al registrar el envío.</p>
            </div>
          </section>

          <section className={estilos.card} aria-labelledby="sec-cliente">
            <div className={estilos.cardHead}>
              <h2 id="sec-cliente">Cliente *</h2>
              {cliente ? (
                <div className={estilos.actions}>
                  <button type="button" className={ui.secondaryButton} onClick={() => setSelector("cliente")}>Cambiar cliente</button>
                  <button type="button" className={ui.clearButton} onClick={() => setCliente(null)}>Quitar</button>
                </div>
              ) : null}
            </div>
            <div className={estilos.cardBody}>
              {cliente ? (
                <>
                  <dl className={estilos.ficha} aria-label="Ficha fiscal del cliente">
                    <div className={estilos.fichaTitulo}><dt>Razón social</dt><dd>{cliente.razonSocial}</dd></div>
                    <div><dt>Código</dt><dd>{cliente.codigo}</dd></div>
                    <div><dt>{cliente.naturaleza === 1 ? "RUC - DV" : "Documento"}</dt><dd>{documentoCliente(cliente)}</dd></div>
                    <div><dt>Tipo de contribuyente</dt><dd>{tipoContribuyente(cliente)}</dd></div>
                    {cliente.nombreFantasia ? <div><dt>Nombre de fantasía</dt><dd>{cliente.nombreFantasia}</dd></div> : null}
                    <div>
                      <dt>Dirección fiscal</dt>
                      <dd>{cliente.direccion ? `${cliente.direccion} · N.º ${cliente.numeroCasa && /^\d{1,6}$/.test(cliente.numeroCasa.trim()) ? cliente.numeroCasa.trim() : "0 (no cargado; se informa 0)"}` : "No informada"}</dd>
                    </div>
                    <div><dt>Teléfono</dt><dd>{cliente.celular || cliente.telefono || "No informado"}</dd></div>
                    <div><dt>Correo</dt><dd>{cliente.emailFacturacion || cliente.email || "No informado"}</dd></div>
                    <div>
                      <dt>Estado fiscal</dt>
                      <dd><span className={`${estilos.badge} ${cliente.apto ? estilos.badgeOk : estilos.badgeWarn}`}>{cliente.apto ? "Apto para facturar" : "Con pendientes"}</span></dd>
                    </div>
                  </dl>
                  {!cliente.apto ? (
                    <ul className={estilos.pendientes} role="alert">
                      {cliente.pendientes.map((p) => <li key={p}>{p}</li>)}
                      <li><Link href="/clientes">Regularizar en Clientes</Link> (esta pantalla no modifica el cadastro).</li>
                    </ul>
                  ) : null}
                </>
              ) : (
                <div className={estilos.empty}>
                  <span>Aún no seleccionó un cliente.</span>
                  <button type="button" className={ui.primaryButton} onClick={() => setSelector("cliente")}>Buscar cliente</button>
                </div>
              )}
            </div>
          </section>

          <section className={estilos.card} aria-labelledby="sec-detalle">
            <div className={estilos.cardHead}>
              <div>
                <h2 id="sec-detalle">Detalle de la factura *</h2>
                <small>
                  Precios con IVA incluido.{" "}
                  {puedeEditarPrecio ? "Puede ajustar la cantidad y el precio unitario de cada ítem." : "El precio es el de lista; modificarlo requiere un permiso especial."}
                </small>
              </div>
              <button type="button" className={ui.primaryButton} onClick={() => setSelector("producto")}>Añadir producto</button>
            </div>
            <div className={estilos.tableWrap}>
              <table className={estilos.items}>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Afectación IVA</th>
                    <th className={estilos.num}>% IVA</th>
                    <th>Unidad</th>
                    <th className={estilos.num}>Cantidad</th>
                    <th className={estilos.num}>Precio unitario (IVA incl.)</th>
                    <th className={estilos.num}>Subtotal</th>
                    <th><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.length === 0 ? (
                    <tr><td colSpan={8} className={estilos.tableEmpty}>Aún no agregó ítems. Use «Añadir producto» para buscar y seleccionar.</td></tr>
                  ) : lineas.map((l, i) => {
                    const cantOk = cantidadValida(l);
                    const precOk = precioValido(l);
                    const mod = precioModificado(l);

                    return (
                      <tr key={l.clave}>
                        <td className={estilos.prod}><strong>{l.producto.descripcion}</strong><small>{l.producto.codigo}</small></td>
                        <td>{l.producto.afectacion ? ETIQUETA_IVA[l.producto.afectacion] : "Sin clasificar"}</td>
                        <td className={estilos.num}>{l.producto.afectacion ? `${l.producto.tasa ?? 0}%` : "—"}</td>
                        <td title={l.producto.unidadNombre ?? undefined}>{l.producto.unidadSimbolo ?? "—"}</td>
                        <td className={estilos.num}>
                          <input
                            className={`${estilos.qty} ${cantOk ? "" : estilos.invalid}`}
                            inputMode="decimal"
                            aria-label={`Cantidad de ${l.producto.descripcion}`}
                            aria-invalid={cantOk ? undefined : true}
                            value={l.cantidad}
                            onChange={(e) => editar(l.clave, { cantidad: e.target.value.replace(",", ".") })}
                          />
                          {!cantOk ? <small className={estilos.fieldError}>{l.producto.unidadSifen === 77 ? "Entero mayor que 0" : "Mayor que 0, hasta 4 decimales"}</small> : null}
                        </td>
                        <td className={estilos.num}>
                          {puedeEditarPrecio ? (
                            <>
                              <input
                                className={`${estilos.price} ${precOk ? "" : estilos.invalid}`}
                                inputMode="decimal"
                                aria-label={`Precio unitario de ${l.producto.descripcion}`}
                                aria-invalid={precOk ? undefined : true}
                                value={l.precio}
                                onChange={(e) => editar(l.clave, { precio: e.target.value.replace(",", ".") })}
                              />
                              {!precOk ? <small className={estilos.fieldError}>Mayor que 0</small> : null}
                              {mod ? (
                                <span className={estilos.modificado}>
                                  Lista: {gs(Number(l.producto.precio))} · <button type="button" className={estilos.linkButton} onClick={() => editar(l.clave, { precio: l.producto.precio ?? "" })}>Restaurar</button>
                                </span>
                              ) : null}
                            </>
                          ) : (
                            gs(Number(l.producto.precio ?? 0))
                          )}
                        </td>
                        <td className={estilos.num}>{calculo.completo ? gs(calculo.items[i] ?? 0) : "—"}</td>
                        <td><button type="button" className={estilos.remove} aria-label={`Quitar ${l.producto.descripcion}`} onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}>Quitar</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {problemas.length > 0 ? <div className={ui.alertError} role="alert" style={{ margin: 12 }}>{problemas.join(" ")}</div> : null}
          </section>

          <section className={estilos.card} aria-labelledby="sec-totales">
            <div className={estilos.cardHead}><h2 id="sec-totales">Totales (guaraníes)</h2></div>
            <div className={`${estilos.cardBody} ${estilos.totalesWrap}`}>
              <dl className={estilos.totals}>
                <div><dt>Exento</dt><dd>{gs(calculo.exento)}</dd></div>
                <div><dt>Exonerado</dt><dd>{gs(calculo.exonerado)}</dd></div>
                <div><dt>Gravado 5 % (IVA incl.)</dt><dd>{gs(calculo.gravado5)}</dd></div>
                <div><dt>Gravado 10 % (IVA incl.)</dt><dd>{gs(calculo.gravado10)}</dd></div>
                <div><dt>IVA 5 %</dt><dd>{gs(calculo.iva5)}</dd></div>
                <div><dt>IVA 10 %</dt><dd>{gs(calculo.iva10)}</dd></div>
                <div><dt>Total IVA</dt><dd>{gs(calculo.totalIva)}</dd></div>
              </dl>
              <div className={estilos.totalGeneral}>
                <span>Total general</span>
                <strong>Gs. {gs(calculo.total)}</strong>
                <small>IVA incluido{hayPrecioModificado ? " · con precios modificados" : ""}</small>
              </div>
            </div>
            <p className={estilos.hint} style={{ margin: "0 16px 14px" }}>El servidor recalcula todo con los precios, el IVA y la unidad de los cadastros; este resumen es solo informativo.</p>
          </section>

          <section className={estilos.card} aria-labelledby="sec-info">
            <div className={estilos.cardHead}><h2 id="sec-info">Información adicional</h2></div>
            <div className={estilos.cardBody}>
              <label className={estilos.field}>
                <span>Observaciones (opcional)</span>
                <textarea value={infoAdicional} maxLength={5000} onChange={(e) => setInfoAdicional(e.target.value)} />
              </label>
            </div>
          </section>

          {errores.length > 0 ? (
            <div className={ui.alertError} role="alert">
              {errores[0]}
              {errores.length > 1 ? <ul className={estilos.errorList}>{errores.slice(1).map((m) => <li key={m}>{m}</li>)}</ul> : null}
            </div>
          ) : null}

          <div className={estilos.actionsBar}>
            <p className={estilos.faltan}>{faltan.length > 0 ? `Falta: ${faltan.join(", ")}.` : "Listo para revisar."}</p>
            <div className={estilos.actions}>
              <Link href="/documentos" className={ui.secondaryButton}>Cancelar</Link>
              <button type="button" className={ui.primaryButton} disabled={!puedeGuardar} onClick={grabar}>
                {revisando ? "Revisando..." : "Grabar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selector === "cliente" ? <SelectorCliente alCerrar={() => setSelector(null)} alElegir={(c) => { setCliente(c); setSelector(null); }} /> : null}
      {selector === "producto" ? <SelectorProducto alCerrar={() => setSelector(null)} alAgregar={agregar} cantidadItems={lineas.length} /> : null}

      {resumen ? (
        <div className={estilos.overlay} role="presentation">
          <div className={estilos.modal} role="dialog" aria-modal="true" aria-labelledby="titulo-resumen">
            <h2 id="titulo-resumen">Resumen de la factura</h2>
            <p className={estilos.hint} style={{ marginTop: 0 }}>Revise los datos. Todavía no se asignó número ni se transmitió nada: el número se reserva al enviar.</p>
            <dl className={estilos.totals}>
              <div><dt>Empresa</dt><dd>{resumen.empresa}</dd></div>
              <div><dt>Establecimiento / sucursal</dt><dd>{resumen.establecimiento} · {resumen.sucursal}</dd></div>
              <div><dt>Punto de expedición</dt><dd>{resumen.punto}</dd></div>
              <div><dt>Número</dt><dd>{resumen.numero}</dd></div>
              <div><dt>Fecha de emisión</dt><dd>{hoy || "—"} (la fija el sistema al enviar)</dd></div>
              <div><dt>Cliente</dt><dd>{resumen.cliente.razonSocial} ({resumen.cliente.documento})</dd></div>
              <div><dt>Transacción · presencia</dt><dd>{resumen.tipoTransaccion} · {resumen.presencia}</dd></div>
              <div><dt>Condición · pago</dt><dd>{resumen.condicion} · {resumen.formaPago}</dd></div>
            </dl>
            <div className={estilos.tableWrap} style={{ margin: "10px 0" }}>
              <table className={estilos.items} style={{ minWidth: 560 }}>
                <thead><tr><th>Producto</th><th>Unid.</th><th className={estilos.num}>Cant.</th><th className={estilos.num}>Precio (IVA incl.)</th><th>IVA</th><th className={estilos.num}>Total</th></tr></thead>
                <tbody>
                  {resumen.lineas.map((l, i) => (
                    <tr key={i}>
                      <td className={estilos.prod}><strong>{l.descripcion}</strong><small>{l.codigo}</small></td>
                      <td>{l.unidad || "—"}</td>
                      <td className={estilos.num}>{l.cantidad}</td>
                      <td className={estilos.num}>
                        {gs(Number(l.precio))}
                        {l.precioModificado ? <span className={estilos.modificado}>Precio modificado (lista {gs(Number(l.precioLista))})</span> : null}
                      </td>
                      <td>{ETIQUETA_IVA[l.afectacion]}{l.tasa ? ` ${l.tasa}%` : ""}</td>
                      <td className={estilos.num}>{gs(l.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className={estilos.totals}>
              <div><dt>Exento</dt><dd>{gs(resumen.totales.exento)}</dd></div>
              <div><dt>Exonerado</dt><dd>{gs(resumen.totales.exonerado)}</dd></div>
              <div><dt>Gravado 5 %</dt><dd>{gs(resumen.totales.gravado5)}</dd></div>
              <div><dt>Gravado 10 %</dt><dd>{gs(resumen.totales.gravado10)}</dd></div>
              <div><dt>IVA 5 %</dt><dd>{gs(resumen.totales.iva5)}</dd></div>
              <div><dt>IVA 10 %</dt><dd>{gs(resumen.totales.iva10)}</dd></div>
              <div><dt>Total IVA</dt><dd>{gs(resumen.totales.totalIva)}</dd></div>
              <div><dt>Total general</dt><dd>{gs(resumen.totales.total)}</dd></div>
            </dl>
            <div className={estilos.actions} style={{ marginTop: 14 }}>
              <button type="button" className={ui.secondaryButton} onClick={() => setResumen(null)}>Volver a editar</button>
              <button type="button" className={ui.primaryButton} disabled={enviando} onClick={enviar}>Enviar factura</button>
            </div>
          </div>
        </div>
      ) : null}

      {mostrarEnvio ? (
        <div className={estilos.overlay} role="presentation">
          <div className={estilos.modal} role="dialog" aria-modal="true" aria-labelledby="titulo-envio">
            <h2 id="titulo-envio">Envío al gateway (diagnóstico de prueba)</h2>
            {enviando ? (
              <p role="status">Autenticando y transmitiendo… no cierre esta ventana.</p>
            ) : resultado ? (
              <>
                <dl className={estilos.totals}>
                  <div><dt>Documento</dt><dd>{resultado.numero}</dd></div>
                  <div><dt>Resultado</dt><dd>{ETIQUETA_RESULTADO[resultado.resultado] ?? resultado.resultado}</dd></div>
                  <div><dt>HTTP</dt><dd>{resultado.http ?? "—"}</dd></div>
                  <div><dt>Estado de envío</dt><dd>{ETIQUETA_ESTADO_LOCAL[resultado.estadoLocal] ?? resultado.estadoLocal}</dd></div>
                  {resultado.lote ? <div><dt>Lote (informado por el gateway)</dt><dd>{resultado.lote}</dd></div> : null}
                  {resultado.cdc ? <div><dt>CDC (informado por el gateway)</dt><dd style={{ overflowWrap: "anywhere" }}>{resultado.cdc}</dd></div> : null}
                  {resultado.estadoGateway ? <div><dt>Estado informado</dt><dd>{resultado.estadoGateway}</dd></div> : null}
                </dl>
                <h3 style={{ fontSize: 13.5, margin: "12px 0 4px" }}>Fases</h3>
                <ol className={estilos.errorList}>
                  {resultado.fases.length === 0 ? <li>Sin transmisión: el documento ya había sido enviado.</li> : null}
                  {resultado.fases.map((f, i) => (
                    <li key={i}><strong>{f.ok ? "✔" : "✖"} {ETIQUETA_FASE[f.fase] ?? f.fase}</strong>{f.http ? ` (HTTP ${f.http})` : ""}: {f.detalle}</li>
                  ))}
                </ol>
                {resultado.mensaje ? <p><strong>Mensaje del gateway:</strong> {resultado.mensaje}</p> : null}
                {resultado.errores.length > 0 ? (
                  <div className={ui.alertError} role="alert">
                    Errores de validación informados:
                    <ul className={estilos.errorList}>{resultado.errores.map((m, i) => <li key={i}>{m}</li>)}</ul>
                  </div>
                ) : null}
                <p className={estilos.hint}>«Recibido» y HTTP 200 no significan aprobado por SIFEN. La aprobación solo se confirma con la consulta de estado en Documentos electrónicos.</p>
                <div className={estilos.actions}>
                  <button type="button" className={ui.secondaryButton} onClick={() => setMostrarEnvio(false)}>Cerrar</button>
                  <Link href="/documentos" className={ui.primaryButton}>Ver documentos electrónicos</Link>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
