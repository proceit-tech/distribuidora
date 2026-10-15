"use client";

import Link from "next/link";
import { Fragment, useEffect, useId, useState } from "react";

import ui from "@/components/ui/lista-padrao/lista.module.css";
import { AJUSTE_VACIO, ajusteParaEnvio, decidirProducto, problemasFiscales, valoresEfectivos, type AjusteUI, type PermisosProducto } from "@/lib/facturacion/ajuste-item";
import { elegirPorEnter, MENSAJE_ENTER } from "@/lib/facturacion/busqueda-rapida";
import { CREDITO_UI_VACIO, creditoParaEnvio, hoyParaguay, pendientesCredito, type EstadoCreditoUI } from "@/lib/facturacion/credito";
import { B, parseDec, textoDec } from "@/lib/facturacion/calculo";
import { cabeEnF023, leerCambio, mismoPrecio, MONEDAS_FE, simboloMoneda, totalEnGuaranies, type Moneda } from "@/lib/facturacion/monedas";
import { conciliarPagos, PAGO_UI_VACIO, pagoParaEnvio, pendientesPagos, textoDecimal, type PagoUI } from "@/lib/facturacion/pagos";
import { resumenCalculo, type LineaFE } from "@/lib/facturacion/payload-fe";
import { formatearFechaPy } from "@/lib/formato/listas";
import { useProtegerCambios } from "@/lib/ui/proteger-cambios";

import { EditorFiscalItem, type UnidadSifen } from "./ajuste-fiscal-item";
import { CondicionCredito } from "./condicion-credito";
import { MediosPago } from "./medios-pago";
import estilos from "./page.module.css";

type Punto = { id: string; codigo: string; nombre: string; ultimoNumero?: number };
type Sucursal = { id: string; nombre: string; establecimiento: string; puntos: Punto[]; puntosInactivos?: number };
type Opciones = { condiciones: Record<string, string>; tiposTransaccion: Record<string, string>; presencias: Record<string, string>; formasPago: Record<string, string> };
type Cliente = {
  id: string; codigo: string; razonSocial: string; nombreFantasia: string | null; numeroDocumento: string; dv: string | null; naturaleza: number; tipoContribuyente: number | null;
  email: string | null; emailFacturacion: string | null; telefono: string | null; celular: string | null; direccion: string | null; numeroCasa: string | null; apto: boolean; pendientes: string[];
};
type Producto = {
  id: string; codigo: string; descripcion: string; unidadSifen: number | null; unidadSimbolo: string | null; unidadNombre: string | null; unidadVigente?: boolean | null; afectacion: number | null; proporcion: string | null;
  tasa: number | null; precio: string | null; monedaPrecio: string | null; gtin: string | null;
};
type Linea = { clave: number; producto: Producto; cantidad: string; precio: string; ajuste: AjusteUI };
type Resumen = {
  empresa: string; sucursal: string; establecimiento: string; punto: string; numero: string; cliente: { codigo: string; razonSocial: string; documento: string };
  tipoTransaccion: string; presencia: string; condicion: string; formaPago: string; moneda: string;
  cambio?: { valor: string; totalGs: string; catalogo: { cambio: string; fecha: string } | null; modificado: boolean };
  pagos?: Array<{ medio: string; monto: string; detalle: string }>;
  credito?: { tipo: string; plazo: string | null; entrega: string; saldo: string; cuotas: Array<{ numero: number; monto: string; vencimiento: string }> };
  lineas: Array<{ codigo: string; descripcion: string; unidad: string; cantidad: string; precio: string; precioLista: string; precioModificado: boolean; afectacion: number; tasa: number; total: number; ajustes?: string[] }>;
  totales: { exento: number; exonerado: number; gravado5: number; gravado10: number; iva5: number; iva10: number; totalIva: number; total: number };
};
type FaseEnvio = { fase: string; ok: boolean; detalle: string; http?: number | null };
type ResultadoEnvio = {
  documentoId: string; numero: string; reutilizado: boolean; estadoLocal: string; errorTipo: string | null; resultado: string; http: number | null; mensaje: string | null; lote: string | null; cdc: string | null;
  estadoGateway: string | null; errores: string[]; fases: FaseEnvio[];
  ajustesProducto?: Array<{ productoId: string; codigo: string; estado: "GUARDADO" | "SIN_CAMBIO" | "OMITIDO" | "ERROR"; mensaje: string }>;
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
const CANTIDAD_OK = /^\d{1,10}(\.\d{1,4})?$/;
const PRECIO_OK = /^\d{1,12}(\.\d{1,4})?$/;

async function leer<T>(r: Response, porDefecto: string): Promise<T> {
  const j = (await r.json().catch(() => ({}))) as T & { error?: string; detalles?: string[] };

  if (!r.ok) throw Object.assign(new Error(j.error ?? porDefecto), { detalles: j.detalles ?? [] });

  return j;
}

const cantidadValida = (l: Linea) => CANTIDAD_OK.test(l.cantidad) && Number(l.cantidad) > 0 && (valoresEfectivos(l.producto, l.ajuste).unidadSifen !== 77 || /^\d+(\.0+)?$/.test(l.cantidad));
// Comparaciones de precio en Decimal EXACTO (nunca Number): una diferencia mínima o un valor enorme no se descartan en silencio.
const precioValido = (l: Linea) => PRECIO_OK.test(l.precio) && (parseDec(l.precio, 4) ?? B(0)) > B(0);
/** Precio de lista SOLO si está en la moneda de la factura: nunca se convierte un precio de otra moneda. */
const referencia = (p: Producto, moneda: string) => (p.monedaPrecio === moneda ? p.precio : null);
const precioModificado = (l: Linea, moneda: string) => precioValido(l) && (referencia(l.producto, moneda) === null || !mismoPrecio(l.precio, referencia(l.producto, moneda)));

const aLineaFE = (l: Linea, moneda: string): LineaFE => {
  const e = valoresEfectivos(l.producto, l.ajuste);

  return {
    codigoInterno: l.producto.codigo, gtin: e.gtin, descripcion: e.descripcion, unidadSifen: e.unidadSifen, cantidad: l.cantidad,
    precio: precioValido(l) ? l.precio : (referencia(l.producto, moneda) ?? "0"), afectacion: e.afectacion, tasa: e.tasa, proporcion: e.proporcion,
  };
};

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

const POR_PAGINA = 10;

/** Lista paginada del servidor para los selectores: carga la primera página al abrir (sin exigir texto) y vuelve a consultar al filtrar o paginar. */
function useListado<T>(url: string, campo: "clientes" | "productos", q: string, pagina: number, habilitado = true) {
  const clave = `${q}|${pagina}`;
  const [datos, setDatos] = useState<{ clave: string; items: T[]; total: number; error: string } | null>(null);

  useEffect(() => {
    if (!habilitado) return;

    let activo = true;
    const t = window.setTimeout(() => {
      fetch(`${url}?q=${encodeURIComponent(q)}&pagina=${pagina}&porPagina=${POR_PAGINA}`, { cache: "no-store" })
        .then((r) => leer<Record<string, unknown> & { total: number }>(r, "No fue posible cargar la lista."))
        .then((j) => activo && setDatos({ clave, items: j[campo] as T[], total: j.total, error: "" }))
        .catch((e: unknown) => activo && setDatos({ clave, items: [], total: 0, error: e instanceof Error ? e.message : "No fue posible cargar la lista." }));
    }, 0);

    return () => {
      activo = false;
      window.clearTimeout(t);
    };
  }, [url, campo, q, pagina, clave, habilitado]);

  return { cargando: habilitado && (datos === null || datos.clave !== clave), items: datos?.items ?? [], total: datos?.total ?? 0, error: datos?.error ?? "" };
}

/** Filtro con pausa: el texto escrito se aplica a la lista a los 300 ms (o con Enter) y reinicia la paginación. */
function useFiltro() {
  const [texto, setTexto] = useState("");
  const [q, setQ] = useState("");
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(texto.trim());
      setPagina(1);
    }, 300);

    return () => window.clearTimeout(t);
  }, [texto]);

  return { texto, setTexto, q, pagina, setPagina, aplicar: () => { setQ(texto.trim()); setPagina(1); } };
}

function Paginacion({ pagina, total, alCambiar }: { pagina: number; total: number; alCambiar: (p: number) => void }) {
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div className={estilos.paginacion}>
      <span>{total} resultado{total === 1 ? "" : "s"}</span>
      <div className={estilos.actions}>
        <button type="button" className={ui.secondaryButton} disabled={pagina <= 1} onClick={() => alCambiar(pagina - 1)}>Anterior</button>
        <span aria-live="polite">Página {Math.min(pagina, paginas)} de {paginas}</span>
        <button type="button" className={ui.secondaryButton} disabled={pagina >= paginas} onClick={() => alCambiar(pagina + 1)}>Siguiente</button>
      </div>
    </div>
  );
}

/** Selector de clientes: abre con la lista paginada de los clientes de la empresa; el filtro es opcional (nombre, RUC, CI, código). */
function SelectorCliente({ alElegir, alCerrar }: { alElegir: (c: Cliente) => void; alCerrar: () => void }) {
  const f = useFiltro();
  const l = useListado<Cliente>("/api/facturas/clientes", "clientes", f.q, f.pagina);

  useEscape(alCerrar);

  return (
    <div className={estilos.overlay} role="presentation">
      <div className={estilos.modal} role="dialog" aria-modal="true" aria-labelledby="titulo-cliente">
        <div className={estilos.modalHead}>
          <h2 id="titulo-cliente">Seleccionar cliente</h2>
          <button type="button" className={estilos.close} onClick={alCerrar} aria-label="Cerrar">×</button>
        </div>

        <form className={estilos.searchRow} onSubmit={(e) => { e.preventDefault(); f.aplicar(); }}>
          <input autoFocus value={f.texto} onChange={(e) => f.setTexto(e.target.value)} placeholder="Filtrar por nombre, RUC, CI o código" aria-label="Filtrar clientes" />
        </form>

        {l.error ? <p className={estilos.fieldError} role="alert">{l.error}</p> : null}

        {l.cargando ? (
          <div className={estilos.mensajeVacio} role="status">Cargando clientes…</div>
        ) : l.items.length === 0 && !l.error ? (
          <div className={estilos.mensajeVacio}>{f.q ? "Ningún cliente coincide con el filtro." : "La empresa no tiene clientes habilitados para facturar."} <Link href="/clientes">Ir a Clientes</Link></div>
        ) : (
          <ul className={estilos.resultados} aria-label="Clientes">
            {l.items.map((c) => (
              <li key={c.id}>
                <div className={estilos.info}>
                  <strong>{c.razonSocial}</strong>
                  <small>{c.codigo} · {documentoCliente(c)} · {tipoContribuyente(c)}</small>
                  {!c.apto ? <small className={estilos.impedimento}>Pendiente: {c.pendientes.join(" · ")}. <Link href="/clientes">Corregir en Clientes</Link></small> : null}
                </div>
                <span className={`${estilos.badge} ${c.apto ? estilos.badgeOk : estilos.badgeWarn}`}>{c.apto ? "Apto" : "Con pendientes"}</span>
                <button type="button" className={ui.secondaryButton} disabled={!c.apto} onClick={() => alElegir(c)}>Seleccionar</button>
              </li>
            ))}
          </ul>
        )}

        <Paginacion pagina={f.pagina} total={l.total} alCambiar={f.setPagina} />
      </div>
    </div>
  );
}

/** Selector de productos: lista paginada inmediata; filtro opcional (código, descripción, GTIN, código de barras). Permite añadir varios sin cerrar. */
function SelectorProducto({ alAgregar, alCerrar, cantidadItems, permisos, moneda }: { alAgregar: (p: Producto) => void; alCerrar: () => void; cantidadItems: number; permisos: PermisosProducto; moneda: string }) {
  const f = useFiltro();
  const l = useListado<Producto>("/api/facturas/productos", "productos", f.q, f.pagina);
  const [aviso, setAviso] = useState("");

  useEscape(alCerrar);

  return (
    <div className={estilos.overlay} role="presentation">
      <div className={`${estilos.modal} ${estilos.modalWide}`} role="dialog" aria-modal="true" aria-labelledby="titulo-producto">
        <div className={estilos.modalHead}>
          <h2 id="titulo-producto">Añadir producto</h2>
          <button type="button" className={estilos.close} onClick={alCerrar} aria-label="Cerrar">×</button>
        </div>

        <form className={estilos.searchRow} onSubmit={(e) => { e.preventDefault(); f.aplicar(); }}>
          <input autoFocus value={f.texto} onChange={(e) => f.setTexto(e.target.value)} placeholder="Filtrar por código, GTIN o descripción" aria-label="Filtrar productos" />
        </form>

        {l.error ? <p className={estilos.fieldError} role="alert">{l.error}</p> : null}
        {aviso ? <p className={estilos.aviso} role="status">{aviso}</p> : null}

        {l.cargando ? (
          <div className={estilos.mensajeVacio} role="status">Cargando productos…</div>
        ) : l.items.length === 0 && !l.error ? (
          <div className={estilos.mensajeVacio}>{f.q ? "Ningún producto coincide con el filtro." : "La empresa no tiene productos activos para facturar."} <Link href="/productos">Ir a Productos</Link></div>
        ) : (
          <ul className={estilos.resultados} aria-label="Productos">
            {l.items.map((p) => {
              const d = decidirProducto(p, moneda, permisos);

              return (
                <li key={p.id}>
                  <div className={estilos.info}>
                    <strong>{p.descripcion}</strong>
                    <small>{p.codigo}{p.gtin ? ` · GTIN ${p.gtin}` : ""} · {p.unidadSimbolo ?? "sin unidad"} · {p.afectacion ? `${ETIQUETA_IVA[p.afectacion]}${p.tasa ? ` ${p.tasa}%` : ""}` : "IVA sin clasificar"}</small>
                    {d.mensaje && d.habilitado ? <small className={estilos.aviso}>{d.mensaje}</small> : null}
                    {d.mensaje && !d.habilitado ? <small className={estilos.impedimento}>{d.mensaje}{d.corregirEnProductos ? <> <Link href="/productos">Corregir en Productos</Link></> : null}</small> : null}
                  </div>
                  <span className={estilos.precio}>{p.precio && p.monedaPrecio === moneda ? `${simboloMoneda(moneda)} ${gs(Number(p.precio))}` : "—"}</span>
                  <button type="button" className={ui.secondaryButton} disabled={!d.habilitado} onClick={() => { alAgregar(p); setAviso(`«${p.descripcion}» añadido.`); }}>Añadir</button>
                </li>
              );
            })}
          </ul>
        )}

        <Paginacion pagina={f.pagina} total={l.total} alCambiar={f.setPagina} />

        <div className={estilos.actions} style={{ marginTop: 12 }}>
          <span className={estilos.hint} style={{ margin: 0 }}>{cantidadItems} ítem{cantidadItems === 1 ? "" : "s"} en la factura</span>
          <button type="button" className={ui.primaryButton} onClick={alCerrar}>Listo</button>
        </div>
      </div>
    </div>
  );
}

type ItemBusqueda = { titulo: string; detalle: string; derecha?: string; impedimento?: string; enlace?: { href: string; texto: string }; habilitado: boolean };

/**
 * Búsqueda rápida (combobox) para clientes y productos: escribe, elige con el ratón o con las flechas + Enter. Con Enter y una coincidencia exacta (código, GTIN o documento)
 * o un único resultado habilitado, lo selecciona directamente (útil con lector de código de barras). El selector avanzado (diálogo paginado) sigue disponible.
 */
function BuscadorRapido<T extends { id: string }>({ url, campo, etiqueta, placeholder, describir, exacto, alElegir, mantenerAbierto, autoFocus }: {
  url: string; campo: "clientes" | "productos"; etiqueta: string; placeholder: string; describir: (t: T) => ItemBusqueda; exacto: (t: T, texto: string) => boolean;
  alElegir: (t: T) => void; mantenerAbierto?: boolean; autoFocus?: boolean;
}) {
  const f = useFiltro();
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);
  const [aviso, setAviso] = useState("");
  const [buscando, setBuscando] = useState(false);
  const idBase = useId();
  const l = useListado<T>(url, campo, f.q, 1, abierto);
  const items = l.items.slice(0, 8);

  function elegir(t: T) {
    alElegir(t);
    setAviso(`«${describir(t).titulo}» añadido.`);
    f.setTexto("");
    setActivo(-1);
    if (!mantenerAbierto) setAbierto(false);
  }

  // Enter sin opción resaltada: consulta con el texto actual y selecciona solo si hay una coincidencia exacta o un único resultado habilitado.
  async function elegirConEnter() {
    const texto = f.texto.trim();

    if (!texto) return;

    setBuscando(true);
    setAviso("");
    try {
      const j = await leer<Record<string, unknown>>(await fetch(`${url}?q=${encodeURIComponent(texto)}&pagina=1&porPagina=${POR_PAGINA}`, { cache: "no-store" }), "No fue posible buscar.");
      const encontrados = (j[campo] as T[]).filter((t) => describir(t).habilitado);
      const decision = elegirPorEnter(encontrados, texto, exacto);

      if (decision.elegido) elegir(decision.elegido);
      else if (decision.motivo) setAviso(MENSAJE_ENTER[decision.motivo]);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No fue posible buscar.");
    } finally {
      setBuscando(false);
    }
  }

  function teclas(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAbierto(true);
      setActivo((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((a) => Math.max(a - 1, 0));
    } else if (e.key === "Escape") {
      setAbierto(false);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activo >= 0 && items[activo] && describir(items[activo]).habilitado) elegir(items[activo]);
      else void elegirConEnter();
    }
  }

  return (
    <div className={estilos.buscador} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAbierto(false); }}>
      <label className={estilos.field}>
        <span>{etiqueta}</span>
        <input
          role="combobox"
          aria-expanded={abierto}
          aria-controls={`${idBase}-lista`}
          aria-autocomplete="list"
          aria-activedescendant={activo >= 0 ? `${idBase}-op-${activo}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          value={f.texto}
          placeholder={placeholder}
          onChange={(e) => { f.setTexto(e.target.value); setAbierto(true); setActivo(-1); setAviso(""); }}
          onFocus={() => setAbierto(true)}
          onKeyDown={teclas}
        />
      </label>

      {abierto ? (
        <ul id={`${idBase}-lista`} role="listbox" aria-label={etiqueta} className={estilos.opciones}>
          {l.cargando || buscando ? <li className={estilos.opcionVacia} role="status">Buscando…</li> : null}
          {!l.cargando && l.error ? <li className={estilos.opcionVacia} role="alert">{l.error}</li> : null}
          {!l.cargando && !l.error && items.length === 0 ? <li className={estilos.opcionVacia}>{f.q ? "Ninguna coincidencia." : "No hay registros habilitados."}</li> : null}
          {!l.cargando && items.map((t, i) => {
            const d = describir(t);

            return (
              <li
                key={t.id}
                id={`${idBase}-op-${i}`}
                role="option"
                aria-selected={i === activo}
                aria-disabled={!d.habilitado}
                className={`${estilos.opcion} ${i === activo ? estilos.opcionActiva : ""} ${d.habilitado ? "" : estilos.opcionBloqueada}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActivo(i)}
                onClick={() => d.habilitado && elegir(t)}
              >
                <span className={estilos.opcionTexto}>
                  <strong>{d.titulo}</strong>
                  <small>{d.detalle}</small>
                  {d.impedimento ? <small className={estilos.impedimento}>{d.impedimento}{d.enlace ? <> <Link href={d.enlace.href}>{d.enlace.texto}</Link></> : null}</small> : null}
                </span>
                {d.derecha ? <span className={estilos.precio}>{d.derecha}</span> : null}
              </li>
            );
          })}
          {l.total > items.length ? <li className={estilos.opcionVacia}>Hay {l.total} resultados: afine la búsqueda o use la búsqueda avanzada.</li> : null}
        </ul>
      ) : null}

      {aviso ? <p className={estilos.aviso} role="status">{aviso}</p> : null}
    </div>
  );
}

/** Búsqueda rápida de clientes: solo los aptos para facturar son seleccionables. */
function BuscadorCliente({ alElegir }: { alElegir: (c: Cliente) => void }) {
  return (
    <BuscadorRapido<Cliente>
      url="/api/facturas/clientes"
      campo="clientes"
      etiqueta="Buscar cliente por nombre, RUC, CI o código"
      placeholder="Escriba para buscar…"
      describir={(c) => ({
        titulo: c.razonSocial, detalle: `${c.codigo} · ${documentoCliente(c)} · ${tipoContribuyente(c)}`, habilitado: c.apto,
        derecha: c.apto ? "Apto" : "Con pendientes", impedimento: c.apto ? undefined : `Pendiente: ${c.pendientes.join(" · ")}.`, enlace: c.apto ? undefined : { href: "/clientes", texto: "Corregir en Clientes" },
      })}
      exacto={(c, t) => c.numeroDocumento === t || documentoCliente(c) === t || c.codigo.toLowerCase() === t.toLowerCase()}
      alElegir={alElegir}
    />
  );
}

/** Búsqueda rápida de productos (código, GTIN o descripción): permanece abierta para añadir varios; los que tienen impedimentos no se pueden añadir. */
function BuscadorProducto({ alElegir, permisos, moneda }: { alElegir: (p: Producto) => void; permisos: PermisosProducto; moneda: string }) {
  return (
    <BuscadorRapido<Producto>
      url="/api/facturas/productos"
      campo="productos"
      etiqueta="Añadir producto por código, GTIN o descripción"
      placeholder="Escriba o escanee el código y presione Enter"
      mantenerAbierto
      describir={(p) => {
        const d = decidirProducto(p, moneda, permisos);

        return {
          titulo: p.descripcion,
          detalle: `${p.codigo}${p.gtin ? ` · GTIN ${p.gtin}` : ""} · ${p.unidadSimbolo ?? "sin unidad"} · ${p.afectacion ? `${ETIQUETA_IVA[p.afectacion]}${p.tasa ? ` ${p.tasa}%` : ""}` : "IVA sin clasificar"}`,
          derecha: p.precio && p.monedaPrecio === moneda ? `${simboloMoneda(moneda)} ${gs(Number(p.precio))}` : "—", habilitado: d.habilitado,
          impedimento: d.mensaje,
          enlace: d.corregirEnProductos ? { href: "/productos", texto: "Corregir en Productos" } : undefined,
        };
      }}
      exacto={(p, t) => p.codigo.toLowerCase() === t.toLowerCase() || p.gtin === t}
      alElegir={alElegir}
    />
  );
}

export default function NuevaFacturaPage() {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [opciones, setOpciones] = useState<Opciones | null>(null);
  const [puedeEditarPrecio, setPuedeEditarPrecio] = useState(false);
  const [puedeAjustarFiscal, setPuedeAjustarFiscal] = useState(false);
  const [puedeGestionarPuntos, setPuedeGestionarPuntos] = useState(false);
  const [puedeEditarProductos, setPuedeEditarProductos] = useState(false);
  const [unidadesSifen, setUnidadesSifen] = useState<UnidadSifen[]>([]);
  const [sinEstablecimiento, setSinEstablecimiento] = useState(0);
  const [errorCarga, setErrorCarga] = useState("");
  const [sucursalId, setSucursalId] = useState("");
  const [puntoId, setPuntoId] = useState("");
  const [tipoTransaccion, setTipoTransaccion] = useState("1");
  const [presencia, setPresencia] = useState("1");
  const [pagos, setPagos] = useState<PagoUI[]>([PAGO_UI_VACIO]);
  const [condicion, setCondicion] = useState("1");
  const [credito, setCredito] = useState<EstadoCreditoUI>(CREDITO_UI_VACIO);
  const [hoyIso, setHoyIso] = useState("");
  const [moneda, setMoneda] = useState<Moneda>("PYG");
  const [cambio, setCambio] = useState("");
  const [cotizaciones, setCotizaciones] = useState<Record<string, { cambio: string; fecha: string }>>({});
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
      .then((r) => leer<{ sucursales: Sucursal[]; opciones: Opciones; puedeEditarPrecio?: boolean; puedeAjustarFiscal?: boolean; puedeGestionarPuntos?: boolean; puedeEditarProductos?: boolean; unidadesSifen?: UnidadSifen[]; cotizaciones?: Record<string, { cambio: string; fecha: string }>; sucursalesSinEstablecimiento?: number }>(r, "No fue posible cargar los datos del formulario."))
      .then((j) => {
        if (!activo) return;

        setHoy(formatearFechaPy(new Date()));
        setHoyIso(hoyParaguay());
        setSucursales(j.sucursales);
        setSinEstablecimiento(j.sucursalesSinEstablecimiento ?? 0);
        setOpciones(j.opciones);
        setPuedeEditarPrecio(j.puedeEditarPrecio === true);
        setPuedeAjustarFiscal(j.puedeAjustarFiscal === true);
        setPuedeGestionarPuntos(j.puedeGestionarPuntos === true);
        setPuedeEditarProductos(j.puedeEditarProductos === true);
        setUnidadesSifen(j.unidadesSifen ?? []);
        setCotizaciones(j.cotizaciones ?? {});
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
  const puntoElegido = sucursal?.puntos.find((p) => p.id === puntoId);
  const proximoNumero = puntoElegido && typeof puntoElegido.ultimoNumero === "number" ? `${puntoElegido.codigo}-${String(puntoElegido.ultimoNumero + 1).padStart(7, "0")}` : "";
  const calculo = resumenCalculo(lineas.map((l) => aLineaFE(l, moneda)));
  const extranjera = moneda !== "PYG";
  const cambioNormal = extranjera ? leerCambio(cambio) : null;
  const totalDec = parseDec(String(calculo.total), 8);
  const equivalenteGs = extranjera && cambioNormal !== null && totalDec !== null ? totalEnGuaranies(totalDec, cambioNormal) : null;
  const sim = simboloMoneda(moneda);
  const pendienteCambio = extranjera && cambioNormal === null ? "indicar el tipo de cambio manual (guaraníes por 1 " + moneda + ")" : extranjera && calculo.total > 0 && (equivalenteGs === null || !cabeEnF023(equivalenteGs)) ? "el equivalente en guaraníes no es exacto o supera 15 dígitos enteros: revise el tipo de cambio o los importes" : "";
  const problemas = lineas.flatMap((l) => problemasFiscales(l.producto, l.ajuste, l.precio, moneda).filter((m) => !m.startsWith("sin precio") || !precioValido(l)).map((m) => `${l.producto.codigo}: ${m}.`));
  const lineasValidas = lineas.every((l) => cantidadValida(l) && precioValido(l));
  const enCredito = condicion === "2";
  const pendientesDeCredito = enCredito ? pendientesCredito(credito, String(calculo.total), hoyIso) : [];
  // Medios de pago: cubren el total (Contado) o SOLO la entrega inicial (Crédito con entrega); con un único medio no se escribe el monto.
  const entregaDec = enCredito && credito.entrega.trim() !== "" ? parseDec(credito.entrega.trim(), 4) : null;
  const hayPagos = !enCredito || (entregaDec !== null && entregaDec > B(0));
  const objetivoDec = enCredito ? entregaDec : parseDec(String(calculo.total), 8);
  const pendientesDePagos = hayPagos && objetivoDec !== null && calculo.total > 0 ? pendientesPagos(pagos.map((p) => pagoParaEnvio(p, pagos.length === 1)), objetivoDec, Number(presencia)) : [];
  const faltan = [
    sucursalId === "" ? "sucursal" : "",
    puntoId === "" ? "punto de expedición" : "",
    cliente === null ? "cliente" : "",
    lineas.length === 0 ? "al menos un ítem" : "",
    lineas.length > 0 && !lineasValidas ? "corregir cantidades o precios" : "",
    problemas.length > 0 ? "completar los datos fiscales de los ítems marcados" : "",
    pendientesDeCredito.length > 0 ? "corregir las condiciones del crédito" : "",
    pendientesDePagos.length > 0 ? "corregir los medios de pago" : "",
    pendienteCambio,
  ].filter(Boolean);
  const puedeGuardar = !revisando && !enviando && faltan.length === 0 && cliente !== null && cliente.apto && calculo.completo;
  const hayPrecioModificado = lineas.some((l) => precioModificado(l, moneda));

  function agregar(p: Producto) {
    // El mismo producto no se duplica: suma una unidad a su línea.
    const existente = lineas.find((l) => l.producto.id === p.id);

    if (existente) {
      setLineas((ls) => ls.map((l) => (l.clave === existente.clave ? { ...l, cantidad: String(Math.round((Number(l.cantidad || "0") + 1) * 10000) / 10000) } : l)));

      return;
    }

    setLineas((ls) => [...ls, { clave: siguienteClave, producto: p, cantidad: "1", precio: referencia(p, moneda) ?? "", ajuste: AJUSTE_VACIO }]);
    setSiguienteClave((n) => n + 1);
  }

  const editar = (k: number, cambio: Partial<Pick<Linea, "cantidad" | "precio">>) => setLineas((ls) => ls.map((x) => (x.clave === k ? { ...x, ...cambio } : x)));
  const editarAjuste = (k: number, cambio: Partial<AjusteUI>) => setLineas((ls) => ls.map((x) => (x.clave === k ? { ...x, ajuste: { ...x.ajuste, ...cambio } } : x)));

  // El precio solo viaja cuando difiere del de lista; el servidor lo contrasta con el catálogo y con el permiso del usuario.
  const cuerpoFactura = () => ({
    claveIdempotencia: clave, sucursalId, puntoId, clienteId: cliente?.id, tipoTransaccion: Number(tipoTransaccion), presencia: Number(presencia), moneda, ...(extranjera ? { cambio } : {}),
    pagos: hayPagos ? pagos.map((p) => pagoParaEnvio(p, pagos.length === 1)) : [], condicion: Number(condicion), ...(enCredito ? { credito: creditoParaEnvio(credito) } : {}), infoAdicional,
    lineas: lineas.map((l) => {
      const ajuste = ajusteParaEnvio(l.producto, l.ajuste);

      return { productoId: l.producto.id, cantidad: l.cantidad, ...(precioModificado(l, moneda) ? { precio: l.precio } : {}), ...(ajuste ? { ajuste } : {}) };
    }),
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

  // Cambiar de moneda invalida todo lo expresado en la anterior: precios (solo se conserva el de lista si está en la nueva moneda), pagos y entrega. Nunca se convierte nada.
  function cambiarMoneda(m: Moneda) {
    setMoneda(m);
    setCambio(m === "PYG" ? "" : (cotizaciones[m]?.cambio ?? ""));
    setLineas((ls) => ls.map((l) => ({ ...l, precio: referencia(l.producto, m) ?? "" })));
    setPagos([PAGO_UI_VACIO]);
    setCredito(CREDITO_UI_VACIO);
    setResumen(null);
  }

  function nueva() {
    setCliente(null);
    setLineas([]);
    setInfoAdicional("");
    setCondicion("1");
    setCredito(CREDITO_UI_VACIO);
    setPagos([PAGO_UI_VACIO]);
    setMoneda("PYG");
    setCambio("");
    setErrores([]);
    setResultado(null);
    setResumen(null);
    setMostrarEnvio(false);
    setClave(crypto.randomUUID());
  }

  const condicionTexto = opciones?.condiciones?.[condicion] ?? "Contado";
  const estadoOperacion = resultado
    ? resultado.estadoLocal === "ENVIADO" ? "Enviada · SIFEN pendiente de consulta" : "Envío con incidencias"
    : enviando ? "Enviando…" : revisando ? "Revisando…" : sucio ? "Borrador sin guardar" : "Documento nuevo";
  const textoOpcion = (grupo: Record<string, string> | undefined, k: string) => grupo?.[k] ?? "—";
  const pendientes = [...faltan, ...(cliente !== null && !cliente.apto ? ["regularizar el cliente en Clientes"] : [])];

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

        <div className={estilos.contexto} aria-label="Contexto de la operación">
          <span className={estilos.meta}>Fecha: {hoy || "—"} · Moneda: {moneda}{extranjera && cambioNormal ? ` · Cambio: ${cambioNormal}` : ""}</span>
          <span className={`${estilos.estado} ${resultado ? (resultado.estadoLocal === "ENVIADO" ? estilos.estadoOk : estilos.estadoWarn) : sucio ? estilos.estadoBorrador : ""}`} role="status">{estadoOperacion}</span>
        </div>
      </header>

      {errorCarga ? <div className={ui.alertError} role="alert">{errorCarga}</div> : null}

      {resultado ? (
        <section className={estilos.resultado} aria-labelledby="titulo-resultado">
          <h2 id="titulo-resultado">
            {resultado.estadoLocal === "ENVIADO" ? `Factura ${resultado.numero} enviada` : `Factura ${resultado.numero}: el envío no se completó`}
          </h2>
          <p className={resultado.estadoLocal === "ENVIADO" ? estilos.resultadoOk : estilos.resultadoError}>{ETIQUETA_ESTADO_LOCAL[resultado.estadoLocal] ?? resultado.estadoLocal}.</p>
          {resultado.ajustesProducto && resultado.ajustesProducto.length > 0 ? (
            <ul className={estilos.errorList} aria-label="Guardado en Productos">
              {resultado.ajustesProducto.map((a) => <li key={a.productoId}><strong>{a.codigo}</strong>: {a.mensaje}</li>)}
            </ul>
          ) : null}
          <p className={estilos.hint}>La aprobación fiscal (SIFEN) se confirma en Documentos electrónicos con la consulta de estado: recibir la factura no equivale a aprobarla.</p>
          {resultado.estadoLocal === "ERROR_ENVIO" && resultado.errorTipo === "RECHAZO" ? <p className={estilos.hint}>El gateway rechazó el documento; se conserva su número. El reenvío del mismo contenido se confirma desde Documentos electrónicos.</p> : null}
          <div className={estilos.actions} style={{ justifyContent: "flex-start", marginTop: 12 }}>
            <button type="button" className={ui.primaryButton} onClick={nueva}>Nueva factura</button>
            <Link href="/documentos" className={ui.secondaryButton}>Ver en Documentos electrónicos</Link>
            {resultado.estadoLocal === "ERROR_ENVIO" && resultado.errorTipo !== "RECHAZO" ? <button type="button" className={ui.secondaryButton} disabled={enviando} onClick={reintentar}>Reintentar envío</button> : null}
            <button type="button" className={ui.clearButton} onClick={() => setMostrarEnvio(true)}>Ver detalle técnico</button>
          </div>
        </section>
      ) : (
        <>
          {errores.length > 0 ? (
            <div className={ui.alertError} role="alert">
              {errores[0]}
              {errores.length > 1 ? <ul className={estilos.errorList}>{errores.slice(1).map((m) => <li key={m}>{m}</li>)}</ul> : null}
            </div>
          ) : null}

          <div className={estilos.workspace}>
            <div className={estilos.principal}>
              <section className={estilos.card} aria-labelledby="sec-operacion">
                <div className={estilos.cardHead}>
                  <h2 id="sec-operacion">Operación</h2>
                  {sucursal ? <span className={estilos.meta}>Establecimiento {sucursal.establecimiento}{puntoId ? ` · Punto ${sucursal.puntos.find((p) => p.id === puntoId)?.codigo ?? ""}` : ""}</span> : null}
                </div>
                <div className={estilos.cardBody}>
                  {sucursales.length === 0 && opciones ? (
                    <div className={ui.alertError} role="alert" style={{ marginBottom: 12 }}>
                      No hay sucursales habilitadas para facturar en su alcance.
                      {sinEstablecimiento > 0 ? ` ${sinEstablecimiento} sucursal(es) no tienen el establecimiento SIFEN cargado.` : " Verifique la sucursal, su establecimiento SIFEN y su alcance de acceso."}
                    </div>
                  ) : null}
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
                      {sucursal && sucursal.puntos.length === 0 ? (
                        <small className={estilos.fieldError} role="alert">
                          La sucursal «{sucursal.nombre}» no tiene un punto de expedición activo{(sucursal.puntosInactivos ?? 0) > 0 ? ` (hay ${sucursal.puntosInactivos} inactivo${sucursal.puntosInactivos === 1 ? "" : "s"})` : ""}.{" "}
                          {puedeGestionarPuntos ? <Link href="/facturacion/puntos">Configurar punto de expedición</Link> : "Solicite al administrador fiscal que lo configure."}
                        </small>
                      ) : null}
                      {sucursal && puntoId && proximoNumero ? <small className={estilos.hint}>Próximo número (referencial): {sucursal.establecimiento}-{proximoNumero}. Se reserva una sola vez al enviar.</small> : null}
                    </label>

                    <label className={estilos.field}>
                      <span>Condición de la operación</span>
                      <select aria-label="Condición de la operación" value={condicion} onChange={(e) => { setCondicion(e.target.value); setCredito(CREDITO_UI_VACIO); setPagos([PAGO_UI_VACIO]); }}>
                        {Object.entries(opciones?.condiciones ?? { "1": "Contado" }).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </label>

                    <label className={estilos.field}>
                      <span>Moneda de la factura</span>
                      <select aria-label="Moneda de la factura" value={moneda} onChange={(e) => cambiarMoneda(e.target.value as Moneda)}>
                        {(Object.keys(MONEDAS_FE) as Moneda[]).map((m) => <option key={m} value={m}>{m} — {MONEDAS_FE[m].nombre}</option>)}
                      </select>
                    </label>

                    {extranjera ? (
                      <label className={estilos.field}>
                        <span>Tipo de cambio (Gs. por 1 {moneda})</span>
                        <input aria-label="Tipo de cambio" inputMode="decimal" placeholder="Ej.: 7500" value={cambio} onChange={(e) => setCambio(e.target.value.replace(",", "."))} />
                        {cambio.trim() !== "" && cambioNormal === null ? <small className={estilos.fieldError} role="alert">Mayor que 0, hasta 5 enteros y 4 decimales.</small> : null}
                        {cotizaciones[moneda] ? <small className={estilos.hint}>Última cotización registrada: {cotizaciones[moneda].cambio} ({cotizaciones[moneda].fecha}){cambioNormal !== null && cambioNormal !== cotizaciones[moneda].cambio ? " · distinta de la registrada" : ""}.</small> : <small className={estilos.hint}>Cotización manual; no hay una registrada para {moneda}. El cambio usado queda fijo en el documento.</small>}
                      </label>
                    ) : null}
                  </div>

                  {enCredito ? <CondicionCredito simbolo={sim} estado={credito} total={calculo.total} hoy={hoyIso} pendientes={pendientesDeCredito} alCambiar={(c) => setCredito((x) => ({ ...x, ...c }))} /> : null}

                  {hayPagos ? (
                    <MediosPago
                      simbolo={sim}
                      titulo={enCredito ? "Medios de pago de la entrega inicial" : "Forma de pago"}
                      objetivo={objetivoDec === null ? "—" : textoDecimal(objetivoDec)}
                      conciliacion={objetivoDec === null ? { suma: null, coincide: false } : conciliarPagos(pagos.map((p) => pagoParaEnvio(p, pagos.length === 1)), objetivoDec)}
                      presencia={presencia}
                      formas={opciones?.formasPago ?? {}}
                      pagos={pagos}
                      pendientes={pendientesDePagos}
                      alCambiar={(i, c) => setPagos((ps) => ps.map((x, j) => (j === i ? { ...x, ...c } : x)))}
                      alAgregar={() => setPagos((ps) => [...ps, { ...PAGO_UI_VACIO, tipo: "5" }])}
                      alQuitar={(i) => setPagos((ps) => ps.filter((_, j) => j !== i))}
                    />
                  ) : null}

                  <details className={estilos.avanzado}>
                    <summary>Parámetros fiscales: {textoOpcion(opciones?.tiposTransaccion, tipoTransaccion)} · {textoOpcion(opciones?.presencias, presencia)}</summary>
                    <div className={estilos.grid}>
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
                  </details>
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
                      <div className={estilos.clienteResumen}>
                        <div className={estilos.clienteNombre}>
                          <strong>{cliente.razonSocial}</strong>
                          <span>{documentoCliente(cliente)} · {tipoContribuyente(cliente)} · {cliente.codigo}</span>
                        </div>
                        <span className={`${estilos.badge} ${cliente.apto ? estilos.badgeOk : estilos.badgeWarn}`}>{cliente.apto ? "Apto para facturar" : "Con pendientes"}</span>
                      </div>
                      {!cliente.apto ? (
                        <ul className={estilos.pendientes} role="alert">
                          {cliente.pendientes.map((p) => <li key={p}>{p}</li>)}
                          <li><Link href="/clientes">Regularizar en Clientes</Link> (esta pantalla no modifica el cadastro).</li>
                        </ul>
                      ) : null}
                      <details className={estilos.avanzado}>
                        <summary>Ficha fiscal completa</summary>
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
                      </details>
                    </>
                  ) : (
                    <div className={estilos.buscarFila}>
                      <BuscadorCliente alElegir={setCliente} />
                      <button type="button" className={ui.secondaryButton} onClick={() => setSelector("cliente")}>Búsqueda avanzada</button>
                    </div>
                  )}
                </div>
              </section>

              <section className={estilos.card} aria-labelledby="sec-detalle">
                <div className={estilos.cardHead}>
                  <h2 id="sec-detalle">Detalle de la factura *</h2>
                  <span className={estilos.meta}>{lineas.length} ítem{lineas.length === 1 ? "" : "s"}</span>
                </div>
                <div className={`${estilos.cardBody} ${estilos.buscarFila}`}>
                  <BuscadorProducto alElegir={agregar} permisos={{ puedeAjustarFiscal, puedeEditarPrecio }} moneda={moneda} />
                  <button type="button" className={ui.secondaryButton} onClick={() => setSelector("producto")}>Búsqueda avanzada</button>
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
                        <tr><td colSpan={8} className={estilos.tableEmpty}>Aún no agregó ítems. Busque arriba por código, GTIN o descripción, o use «Búsqueda avanzada».</td></tr>
                      ) : lineas.map((l, i) => {
                        const cantOk = cantidadValida(l);
                        const precOk = precioValido(l);
                        const mod = precioModificado(l, moneda);
                        const e = valoresEfectivos(l.producto, l.ajuste);
                        const pr = problemasFiscales(l.producto, l.ajuste, l.precio, moneda).filter((m) => !m.startsWith("sin precio") || !precOk);

                        return (
                          <Fragment key={l.clave}>
                          <tr className={!cantOk || !precOk || pr.length > 0 ? estilos.filaInvalida : undefined}>
                            <td className={estilos.prod} data-label="Producto">
                              <strong>{l.producto.descripcion}</strong>
                              <small>{l.producto.codigo}{l.producto.gtin ? ` · GTIN ${l.producto.gtin}` : ""}</small>
                              {pr.length > 0 ? <small className={estilos.fieldError} role="alert">{puedeAjustarFiscal ? "Pendiente de completar" : "No se puede facturar"}: {pr.join(", ")}.</small> : null}
                            </td>
                            <td data-label="Afectación IVA">{e.afectacion ? ETIQUETA_IVA[e.afectacion] : "Sin clasificar"}</td>
                            <td className={estilos.num} data-label="% IVA">{e.afectacion ? `${e.tasa ?? "—"}${e.tasa !== null ? "%" : ""}` : "—"}</td>
                            <td data-label="Unidad" title={l.producto.unidadNombre ?? undefined}>{l.ajuste.unidadSifen !== "" ? (unidadesSifen.find((u) => String(u.codigo) === l.ajuste.unidadSifen)?.representacion ?? l.ajuste.unidadSifen) : (l.producto.unidadSimbolo ?? "—")}</td>
                            <td className={estilos.num} data-label="Cantidad">
                              <input
                                className={`${estilos.qty} ${cantOk ? "" : estilos.invalid}`}
                                inputMode="decimal"
                                aria-label={`Cantidad de ${l.producto.descripcion}`}
                                aria-invalid={cantOk ? undefined : true}
                                value={l.cantidad}
                                onChange={(e) => editar(l.clave, { cantidad: e.target.value.replace(",", ".") })}
                              />
                              {!cantOk ? <small className={estilos.fieldError}>{e.unidadSifen === 77 ? "Entero mayor que 0" : "Mayor que 0, hasta 4 decimales"}</small> : null}
                            </td>
                            <td className={estilos.num} data-label="Precio unitario (IVA incl.)">
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
                                      Lista: {referencia(l.producto, moneda) === null ? `sin precio en ${extranjera ? moneda : "guaraníes"}` : gs(Number(referencia(l.producto, moneda)))} · <button type="button" className={estilos.linkButton} onClick={() => editar(l.clave, { precio: referencia(l.producto, moneda) ?? "" })}>Restaurar</button>
                                    </span>
                                  ) : null}
                                </>
                              ) : referencia(l.producto, moneda) === null ? (
                                <small className={estilos.fieldError}>Sin precio de lista: requiere el permiso de precio</small>
                              ) : (
                                gs(Number(referencia(l.producto, moneda)))
                              )}
                            </td>
                            <td className={`${estilos.num} ${estilos.subtotal}`} data-label="Subtotal">{calculo.completo ? gs(calculo.items[i] ?? 0) : "—"}</td>
                            <td className={estilos.accion}><button type="button" className={estilos.remove} aria-label={`Quitar ${l.producto.descripcion}`} onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}>Quitar</button></td>
                          </tr>
                          {puedeAjustarFiscal ? (
                            <tr className={estilos.filaFiscal}>
                              <td colSpan={8}>
                                <EditorFiscalItem moneda={moneda} producto={l.producto} precio={l.precio} ajuste={l.ajuste} unidades={unidadesSifen} puedeEditarProductos={puedeEditarProductos} alCambiar={(c) => editarAjuste(l.clave, c)} />
                              </td>
                            </tr>
                          ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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
            </div>

            <aside className={estilos.resumenPanel} aria-labelledby="sec-totales">
              <h2 id="sec-totales">Resumen ({MONEDAS_FE[moneda].nombre.toLowerCase()})</h2>

              <dl className={estilos.totals}>
                <div><dt>Exento</dt><dd>{gs(calculo.exento)}</dd></div>
                <div><dt>Exonerado</dt><dd>{gs(calculo.exonerado)}</dd></div>
                <div><dt>Gravado 5 % (IVA incl.)</dt><dd>{gs(calculo.gravado5)}</dd></div>
                <div><dt>IVA 5 %</dt><dd>{gs(calculo.iva5)}</dd></div>
                <div><dt>Gravado 10 % (IVA incl.)</dt><dd>{gs(calculo.gravado10)}</dd></div>
                <div><dt>IVA 10 %</dt><dd>{gs(calculo.iva10)}</dd></div>
                <div className={estilos.totalIva}><dt>Total IVA</dt><dd>{gs(calculo.totalIva)}</dd></div>
              </dl>

              <div className={estilos.totalGeneral}>
                <span>Total general</span>
                <strong>{sim} {gs(calculo.total)}</strong>
                {extranjera ? <small>Equivalente: Gs. {equivalenteGs === null ? "—" : gs(Number(textoDec(equivalenteGs)))} (cambio {cambioNormal ?? "—"})</small> : null}
                <small>IVA incluido{hayPrecioModificado ? " · con precios modificados" : ""}</small>
              </div>

              <dl className={estilos.pagoResumen}>
                <div><dt>Cliente</dt><dd>{cliente ? cliente.razonSocial : "Sin seleccionar"}</dd></div>
                <div><dt>Condición</dt><dd>{condicionTexto}</dd></div>
                {hayPagos ? <div><dt>{enCredito ? "Pago de la entrega" : "Forma de pago"}</dt><dd>{pagos.map((p) => textoOpcion(opciones?.formasPago, p.tipo)).join(" + ")}</dd></div> : null}
                {enCredito ? <div><dt>Crédito</dt><dd>{credito.tipo === "1" ? `A plazo (${credito.plazoDias || "—"} días)` : `${credito.cuotas.length} cuota${credito.cuotas.length === 1 ? "" : "s"}`}</dd></div> : null}
              </dl>

              <div className={estilos.pendientesPanel} aria-live="polite">
                <h3>Pendientes de validación</h3>
                {pendientes.length > 0 ? <ul>{pendientes.map((p) => <li key={p}>{p}</li>)}</ul> : <p className={estilos.listo}>Todo listo para revisar.</p>}
              </div>

              {problemas.length > 0 ? <p className={estilos.fieldError} role="alert">{puedeAjustarFiscal ? "Hay ítems con datos fiscales pendientes: complételos en su línea («Datos fiscales del ítem») o quítelos de la factura." : "Hay productos con impedimentos: corríjalos en Productos o quítelos de la factura."}</p> : null}

              <div className={estilos.accionesPanel}>
                <button type="button" className={`${ui.primaryButton} ${estilos.accionPrincipal} ${estilos.accionRevisar}`} disabled={!puedeGuardar} onClick={grabar}>
                  {revisando ? "Revisando..." : "Revisar y confirmar"}
                </button>
                <Link href="/dashboard" className={`${ui.secondaryButton} ${estilos.accionPrincipal}`}>Cancelar</Link>
              </div>
            </aside>
          </div>

          <div className={estilos.barraMovil}>
            <div>
              <strong>{sim} {gs(calculo.total)}</strong>
              <small>{faltan.length > 0 ? `Falta: ${faltan.join(", ")}.` : "Listo para revisar."}</small>
            </div>
            <button type="button" className={ui.primaryButton} disabled={!puedeGuardar} onClick={grabar}>{revisando ? "Revisando..." : "Revisar"}</button>
          </div>
        </>
      )}

      {selector === "cliente" ? <SelectorCliente alCerrar={() => setSelector(null)} alElegir={(c) => { setCliente(c); setSelector(null); }} /> : null}
      {selector === "producto" ? <SelectorProducto alCerrar={() => setSelector(null)} alAgregar={agregar} cantidadItems={lineas.length} permisos={{ puedeAjustarFiscal, puedeEditarPrecio }} moneda={moneda} /> : null}

      {resumen ? (
        <div className={estilos.overlay} role="presentation">
          <div className={estilos.modal} role="dialog" aria-modal="true" aria-labelledby="titulo-resumen">
            <h2 id="titulo-resumen">Resumen de la factura</h2>
            <p className={estilos.hint} style={{ marginTop: 0 }}>Revise los datos antes de enviar la factura.</p>
            <dl className={estilos.totals}>
              <div><dt>Empresa</dt><dd>{resumen.empresa}</dd></div>
              <div><dt>Establecimiento / sucursal</dt><dd>{resumen.establecimiento} · {resumen.sucursal}</dd></div>
              <div><dt>Punto de expedición</dt><dd>{resumen.punto}</dd></div>
              <div><dt>Fecha</dt><dd>{hoy || "—"}</dd></div>
              <div><dt>Cliente</dt><dd>{resumen.cliente.razonSocial} ({resumen.cliente.documento})</dd></div>
              <div><dt>Transacción · presencia</dt><dd>{resumen.tipoTransaccion} · {resumen.presencia}</dd></div>
              <div><dt>Condición de la operación</dt><dd>{resumen.condicion}</dd></div>
              <div><dt>Moneda</dt><dd>{resumen.moneda}</dd></div>
              {resumen.cambio ? (
                <>
                  <div><dt>Tipo de cambio (manual)</dt><dd>Gs. {gs(Number(resumen.cambio.valor))} por 1 {resumen.moneda}{resumen.cambio.modificado && resumen.cambio.catalogo ? ` · distinto del registrado (${resumen.cambio.catalogo.cambio}, ${resumen.cambio.catalogo.fecha})` : ""}</dd></div>
                  <div><dt>Equivalente en guaraníes</dt><dd>Gs. {gs(Number(resumen.cambio.totalGs))}</dd></div>
                </>
              ) : null}
              {resumen.pagos && resumen.pagos.length > 0
                ? resumen.pagos.map((p, i) => <div key={i}><dt>{resumen.credito ? "Medio de la entrega" : "Pago"} · {p.medio}</dt><dd>{simboloMoneda(resumen.moneda)} {gs(Number(p.monto))}{p.detalle ? ` · ${p.detalle}` : ""}</dd></div>)
                : resumen.formaPago ? <div><dt>Forma de pago</dt><dd>{resumen.formaPago}</dd></div> : null}
              {resumen.credito ? (
                <>
                  <div><dt>Tipo de crédito</dt><dd>{resumen.credito.tipo}{resumen.credito.plazo ? ` · ${resumen.credito.plazo}` : ""}</dd></div>
                  <div><dt>Entrega inicial</dt><dd>{simboloMoneda(resumen.moneda)} {gs(Number(resumen.credito.entrega))}</dd></div>
                  <div><dt>Saldo financiado</dt><dd>{simboloMoneda(resumen.moneda)} {gs(Number(resumen.credito.saldo))}</dd></div>
                  {resumen.credito.cuotas.map((q) => <div key={q.numero}><dt>Cuota {q.numero}/{resumen.credito?.cuotas.length}</dt><dd>{simboloMoneda(resumen.moneda)} {gs(Number(q.monto))} · vence {q.vencimiento}</dd></div>)}
                </>
              ) : null}
            </dl>
            <div className={estilos.tableWrap} style={{ margin: "10px 0" }}>
              <table className={`${estilos.items} ${estilos.itemsResumen}`}>
                <thead><tr><th>Producto</th><th>Unid.</th><th className={estilos.num}>Cant.</th><th className={estilos.num}>Precio (IVA incl.)</th><th>IVA</th><th className={estilos.num}>Total</th></tr></thead>
                <tbody>
                  {resumen.lineas.map((l, i) => (
                    <tr key={i}>
                      <td className={estilos.prod}>
                        <strong>{l.descripcion}</strong>
                        <small>{l.codigo}</small>
                        {l.ajustes && l.ajustes.length > 0 ? <small className={estilos.modificado}>Ajustado en esta factura: {l.ajustes.join(", ")}</small> : null}
                      </td>
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
            <h2 id="titulo-envio">Detalle técnico del envío</h2>
            {enviando ? (
              <p role="status">Enviando la factura al gateway… no cierre esta ventana.</p>
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
                <h3 style={{ fontSize: 14, margin: "12px 0 4px" }}>Fases</h3>
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
