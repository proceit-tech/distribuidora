"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import ui from "@/components/ui/lista-padrao/lista.module.css";
import { resumenCalculo, type LineaFE } from "@/lib/facturacion/payload-fe";
import { useProtegerCambios } from "@/lib/ui/proteger-cambios";

import estilos from "./page.module.css";

type Punto = { id: string; codigo: string; nombre: string };
type Sucursal = { id: string; nombre: string; establecimiento: string; puntos: Punto[] };
type Opciones = { tiposTransaccion: Record<string, string>; presencias: Record<string, string>; formasPago: Record<string, string> };
type Cliente = { id: string; codigo: string; razonSocial: string; numeroDocumento: string; dv: string | null; apto: boolean; pendientes: string[] };
type Producto = { id: string; codigo: string; descripcion: string; unidadSifen: number | null; afectacion: number | null; proporcion: string | null; tasa: number | null; precio: string | null; monedaPrecio: string | null; gtin: string | null };
type Linea = { clave: number; producto: Producto; cantidad: string };

const ETIQUETA_IVA: Record<number, string> = { 1: "Gravado", 2: "Exonerado", 3: "Exento", 4: "Gravado parcial" };
const gs = (n: number) => n.toLocaleString("es-PY", { maximumFractionDigits: 8 });

async function leer<T>(r: Response, porDefecto: string): Promise<T> {
  const j = (await r.json().catch(() => ({}))) as T & { error?: string; detalles?: string[] };

  if (!r.ok) throw Object.assign(new Error(j.error ?? porDefecto), { detalles: j.detalles ?? [] });

  return j;
}

/** Problemas visibles por producto (el servidor vuelve a validar todo; esto solo evita enviar lo que se sabe inválido). */
function problemasProducto(p: Producto): string[] {
  const m: string[] = [];

  if (p.afectacion === null) m.push("sin clasificación de IVA");
  if (p.unidadSifen === null) m.push("sin unidad de medida SIFEN");
  if (p.precio === null || p.monedaPrecio !== "PYG") m.push("sin precio de venta en guaraníes");

  return m;
}

const aLineaFE = (l: Linea): LineaFE => ({
  codigoInterno: l.producto.codigo, gtin: l.producto.gtin, descripcion: l.producto.descripcion, unidadSifen: l.producto.unidadSifen, cantidad: l.cantidad,
  precio: l.producto.precio ?? "0", afectacion: l.producto.afectacion, tasa: l.producto.tasa, proporcion: l.producto.proporcion,
});

export default function NuevaFacturaPage() {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [opciones, setOpciones] = useState<Opciones | null>(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [sucursalId, setSucursalId] = useState("");
  const [puntoId, setPuntoId] = useState("");
  const [tipoTransaccion, setTipoTransaccion] = useState("1");
  const [presencia, setPresencia] = useState("1");
  const [formaPago, setFormaPago] = useState("1");
  const [infoAdicional, setInfoAdicional] = useState("");
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [productos, setProductos] = useState<Producto[]>([]);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [siguienteClave, setSiguienteClave] = useState(1);
  const [clave, setClave] = useState(() => crypto.randomUUID());
  const [enviando, setEnviando] = useState(false);
  const [errores, setErrores] = useState<string[]>([]);
  const [creada, setCreada] = useState<{ numero: string; reutilizado: boolean } | null>(null);

  const sucio = creada === null && (cliente !== null || lineas.length > 0 || infoAdicional !== "");

  useProtegerCambios(sucio);

  useEffect(() => {
    let activo = true;

    fetch("/api/facturas/catalogos", { cache: "no-store" })
      .then((r) => leer<{ sucursales: Sucursal[]; opciones: Opciones }>(r, "No fue posible cargar los datos del formulario."))
      .then((j) => {
        if (!activo) return;

        setSucursales(j.sucursales);
        setOpciones(j.opciones);
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

  // Búsquedas con pausa para no consultar en cada tecla; un resultado viejo nunca pisa a uno más nuevo.
  useEffect(() => {
    let activo = true;
    const t = window.setTimeout(() => {
      fetch(`/api/facturas/clientes?q=${encodeURIComponent(busquedaCliente.trim())}`, { cache: "no-store" })
        .then((r) => leer<{ clientes: Cliente[] }>(r, "No fue posible buscar clientes."))
        .then((j) => activo && setClientes(j.clientes))
        .catch(() => activo && setClientes([]));
    }, 300);

    return () => {
      activo = false;
      window.clearTimeout(t);
    };
  }, [busquedaCliente]);

  useEffect(() => {
    let activo = true;
    const t = window.setTimeout(() => {
      fetch(`/api/facturas/productos?q=${encodeURIComponent(busquedaProducto.trim())}`, { cache: "no-store" })
        .then((r) => leer<{ productos: Producto[] }>(r, "No fue posible buscar productos."))
        .then((j) => activo && setProductos(j.productos))
        .catch(() => activo && setProductos([]));
    }, 300);

    return () => {
      activo = false;
      window.clearTimeout(t);
    };
  }, [busquedaProducto]);

  const sucursal = sucursales.find((s) => s.id === sucursalId);
  const calculo = resumenCalculo(lineas.map(aLineaFE));
  const problemas = lineas.flatMap((l) => problemasProducto(l.producto).map((p) => `${l.producto.codigo}: ${p}.`));
  const cantidadesValidas = lineas.every((l) => /^\d{1,10}(\.\d{1,4})?$/.test(l.cantidad) && Number(l.cantidad) > 0);
  const puedeGuardar = !enviando && sucursalId !== "" && puntoId !== "" && cliente !== null && cliente.apto && lineas.length > 0 && cantidadesValidas && problemas.length === 0 && calculo.completo;

  function agregar(p: Producto) {
    setLineas((ls) => [...ls, { clave: siguienteClave, producto: p, cantidad: "1" }]);
    setSiguienteClave((n) => n + 1);
  }

  async function guardar() {
    if (!cliente) return;

    setEnviando(true);
    setErrores([]);
    try {
      const r = await leer<{ documentoId: string; numero: string; reutilizado: boolean }>(
        await fetch("/api/facturas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            claveIdempotencia: clave, sucursalId, puntoId, clienteId: cliente.id, tipoTransaccion: Number(tipoTransaccion), presencia: Number(presencia),
            pagos: [{ tipo: Number(formaPago) }], infoAdicional, lineas: lineas.map((l) => ({ productoId: l.producto.id, cantidad: l.cantidad })),
          }),
        }),
        "No fue posible registrar la factura.",
      );

      setCreada({ numero: r.numero, reutilizado: r.reutilizado });
    } catch (e) {
      const d = (e as { detalles?: string[] }).detalles ?? [];

      setErrores([e instanceof Error ? e.message : "No fue posible registrar la factura.", ...d]);
    } finally {
      setEnviando(false);
    }
  }

  function nueva() {
    setCliente(null);
    setLineas([]);
    setInfoAdicional("");
    setBusquedaCliente("");
    setBusquedaProducto("");
    setErrores([]);
    setCreada(null);
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

      {creada ? (
        <div className={ui.alertOk} role="status">
          <strong>{creada.reutilizado ? "Esta factura ya estaba registrada" : "Factura registrada"}: {creada.numero}.</strong> Queda <strong>pendiente de envío</strong>: el envío al gateway aún no está habilitado y no se ha generado ningún CDC ni aprobación.{" "}
          <Link href="/documentos">Ver documentos electrónicos</Link> · <button type="button" className={ui.clearButton} onClick={nueva}>Nueva factura</button>
        </div>
      ) : (
        <>
          <section className={ui.contentCard}>
            <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>Operación</h2>
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
                {sucursal && sucursal.puntos.length === 0 ? <small className={estilos.hint}>Esta sucursal no tiene puntos de expedición activos.</small> : null}
              </label>

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

              <label className={estilos.field}>
                <span>Condición y forma de pago</span>
                <select value={formaPago} onChange={(e) => setFormaPago(e.target.value)} aria-label="Forma de pago (contado)">
                  {Object.entries(opciones?.formasPago ?? {}).map(([k, v]) => <option key={k} value={k}>Contado · {v}</option>)}
                </select>
              </label>
            </div>
            <p className={estilos.hint}>Moneda: guaraníes (PYG). La fecha de emisión y el número los asigna el sistema al registrar; solo se factura al contado en esta etapa.</p>
          </section>

          <section className={ui.contentCard}>
            <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>Cliente *</h2>
            {cliente ? (
              <div className={estilos.selected}>
                <div>
                  <strong>{cliente.razonSocial}</strong>
                  <br />
                  <small>{cliente.codigo} · {cliente.numeroDocumento}{cliente.dv ? `-${cliente.dv}` : ""}</small>
                  {!cliente.apto ? (
                    <div className={ui.alertError} role="alert" style={{ marginTop: 8 }}>
                      Datos fiscales pendientes de regularizar en Clientes:
                      <ul className={estilos.errorList}>{cliente.pendientes.map((p) => <li key={p}>{p}</li>)}</ul>
                    </div>
                  ) : null}
                </div>
                <button type="button" className={ui.clearButton} onClick={() => setCliente(null)}>Cambiar</button>
              </div>
            ) : (
              <>
                <label className={ui.search}>
                  <span aria-hidden="true">⌕</span>
                  <input value={busquedaCliente} onChange={(e) => setBusquedaCliente(e.target.value)} placeholder="Buscar cliente por código, nombre o documento..." aria-label="Buscar cliente" />
                </label>
                <ul className={estilos.results} aria-label="Clientes encontrados">
                  {clientes.length === 0 ? <li style={{ padding: 10 }}>Sin resultados.</li> : null}
                  {clientes.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => setCliente(c)}>
                        <strong>{c.razonSocial}</strong>
                        <small>{c.codigo} · {c.numeroDocumento}{c.dv ? `-${c.dv}` : ""}{c.apto ? "" : " · datos fiscales pendientes"}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className={ui.contentCard}>
            <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>Ítems *</h2>
            <label className={ui.search}>
              <span aria-hidden="true">⌕</span>
              <input value={busquedaProducto} onChange={(e) => setBusquedaProducto(e.target.value)} placeholder="Buscar producto por código, descripción o código de barras..." aria-label="Buscar producto" />
            </label>
            <ul className={estilos.results} aria-label="Productos encontrados">
              {productos.length === 0 ? <li style={{ padding: 10 }}>Sin resultados.</li> : null}
              {productos.map((p) => {
                const pr = problemasProducto(p);

                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => agregar(p)} disabled={pr.length > 0}>
                      <strong>{p.descripcion}</strong>
                      <small>{p.codigo}{p.precio ? ` · Gs. ${gs(Number(p.precio))}` : ""}{pr.length ? ` · ${pr.join(", ")}` : ""}</small>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className={ui.tableScroll} style={{ marginTop: 10 }}>
              <table className={ui.table} style={{ minWidth: 640 }}>
                <thead>
                  <tr><th>Producto</th><th>Cantidad</th><th>Precio (IVA incl.)</th><th>IVA</th><th>Total</th><th><span className="sr-only">Quitar</span></th></tr>
                </thead>
                <tbody>
                  {lineas.length === 0 ? (
                    <tr><td colSpan={6} className={ui.emptyCell}><div className={ui.empty}><strong>Aún no agregó ítems</strong><span>Busque un producto y selecciónelo para agregarlo.</span></div></td></tr>
                  ) : lineas.map((l, i) => (
                    <tr key={l.clave} className={ui.row}>
                      <td><div className={ui.cell}><strong>{l.producto.descripcion}</strong><span>{l.producto.codigo}</span></div></td>
                      <td>
                        <input
                          className={estilos.qty}
                          inputMode="decimal"
                          aria-label={`Cantidad de ${l.producto.descripcion}`}
                          value={l.cantidad}
                          onChange={(e) => setLineas((ls) => ls.map((x) => (x.clave === l.clave ? { ...x, cantidad: e.target.value.replace(",", ".") } : x)))}
                        />
                      </td>
                      <td className={ui.numeric}>{l.producto.precio ? gs(Number(l.producto.precio)) : "—"}</td>
                      <td>{l.producto.afectacion ? `${ETIQUETA_IVA[l.producto.afectacion]}${l.producto.tasa ? ` ${l.producto.tasa}%` : ""}` : "Sin clasificar"}</td>
                      <td className={ui.numeric}>{calculo.completo ? gs(calculo.items[i] ?? 0) : "—"}</td>
                      <td><button type="button" className={ui.clearButton} aria-label={`Quitar ${l.producto.descripcion}`} onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}>Quitar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {lineas.length > 0 && !cantidadesValidas ? <p className={ui.alertError} role="alert">Cada cantidad debe ser mayor que cero, con hasta 4 decimales.</p> : null}
            {problemas.length > 0 ? <p className={ui.alertError} role="alert">{problemas.join(" ")}</p> : null}
          </section>

          <section className={ui.contentCard}>
            <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>Totales (guaraníes)</h2>
            <dl className={estilos.totals}>
              <div><dt>Exento</dt><dd>{gs(calculo.exento)}</dd></div>
              <div><dt>Exonerado</dt><dd>{gs(calculo.exonerado)}</dd></div>
              <div><dt>Gravado 5 % (IVA incl.)</dt><dd>{gs(calculo.gravado5)}</dd></div>
              <div><dt>Gravado 10 % (IVA incl.)</dt><dd>{gs(calculo.gravado10)}</dd></div>
              <div><dt>IVA 5 %</dt><dd>{gs(calculo.iva5)}</dd></div>
              <div><dt>IVA 10 %</dt><dd>{gs(calculo.iva10)}</dd></div>
              <div><dt>Total IVA</dt><dd>{gs(calculo.totalIva)}</dd></div>
              <div><dt>Total general</dt><dd>{gs(calculo.total)}</dd></div>
            </dl>
            <p className={estilos.hint}>El servidor recalcula todo con los precios, el IVA y la unidad de los cadastros; este resumen es solo informativo.</p>
          </section>

          <section className={ui.contentCard}>
            <label className={estilos.field}>
              <span>Información adicional (opcional)</span>
              <textarea value={infoAdicional} maxLength={5000} onChange={(e) => setInfoAdicional(e.target.value)} />
            </label>
          </section>

          {errores.length > 0 ? (
            <div className={ui.alertError} role="alert">
              {errores[0]}
              {errores.length > 1 ? <ul className={estilos.errorList}>{errores.slice(1).map((m) => <li key={m}>{m}</li>)}</ul> : null}
            </div>
          ) : null}

          <div className={estilos.actions}>
            <Link href="/documentos" className={ui.secondaryButton}>Cancelar</Link>
            <button type="button" className={ui.primaryButton} disabled={!puedeGuardar} onClick={guardar}>
              {enviando ? "Registrando..." : "Registrar factura"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
