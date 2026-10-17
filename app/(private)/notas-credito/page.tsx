"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import ui from "@/components/ui/lista-padrao/lista.module.css";
import { crearControlListado, entradasIniciales, etiquetaIvaLinea } from "@/lib/facturacion/nce-entradas";
import { iniciarRefresco } from "@/lib/facturacion/refresco-documentos";
import { formatearDecimalTexto } from "@/lib/formato/decimal-texto";
import { formatearFechaPy } from "@/lib/formato/listas";

import estilos from "./page.module.css";

const MENSAJE_INNOMINADO = "Un cliente Innominado no puede recibir una nota de crédito electrónica (el documento del receptor no puede ser «Innominado»).";
const MOTIVOS: Record<number, string> = { 2: "Devolución", 3: "Descuento", 4: "Bonificación", 8: "Ajuste de precio" };

type ClienteB = { id: string; codigo: string; razonSocial: string; documento: string; innominado: boolean };
type FacturaE = { id: string; numero: string; cdc: string; fechaEmision: string; moneda: string; total: string; saldo: string; receptorNombre: string; ncePendiente: boolean };
type Linea = {
  linea: number; codigoInterno: string; descripcion: string; unidad: string; cantidad: string; precio: string; total: string; cantidadAcreditada: string; cantidadDisponible: string;
  montoAcreditado: string; saldoMonto: string; agotada: boolean; afectacion: number; tasa: number; proporcion: string;
};
type Factura = {
  id: string; sucursalId: string; numero: string; cdc: string; fechaEmision: string; moneda: string; cambio: string | null; total: string; receptorNombre: string; receptorDocumento: string | null;
  lineas: Linea[]; motivoFijado: number | null; bloqueada: boolean; motivosPermitidos: number[];
};
type Punto = { id: string; codigo: string; nombre: string; ultimoNumero: number };
type Sucursal = { id: string; nombre: string; establecimiento: string; puntos: Punto[]; sinSecuencia: number };
type Resumen = {
  factura: { numero: string; cdc: string; fechaEmision: string }; motivo: { codigo: number; nombre: string }; punto: string; moneda: string; cambio: string | null; observacion: string; numero: string;
  lineas: Array<{ linea: number; codigo: string; descripcion: string; unidad: string; cantidad: string; precioUnitario: string; monto: string; afectacion: number; tasa: number; proporcion: string }>;
  totales: { exento: string; exonerado: string; gravado5: string; gravado10: string; iva5: string; iva10: string; totalIva: string; total: string };
};
type CuerpoRevisado = { facturaId: string; motivo: number; sucursalId: string; puntoId: string; observacion: string; lineas: Array<{ linea: number; cantidad?: string; monto?: string }>; claveIdempotencia: string };
type Entrada = { incluida: boolean; valor: string };

const fm = (t: string) => formatearDecimalTexto(t);
const aleatorio = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, cache: "no-store" });
  const j = (await r.json().catch(() => ({}))) as { error?: string };

  if (!r.ok) throw new Error(j.error ?? "No se pudo completar la operación.");

  return j as T;
}

function Formulario() {
  const router = useRouter();
  const parametros = useSearchParams();
  const corregir = parametros.get("corregir");
  const nonce = useRef(aleatorio());

  const [textoCliente, setTextoCliente] = useState("");
  const [clientes, setClientes] = useState<ClienteB[]>([]);
  const [pagCli, setPagCli] = useState({ pagina: 1, totalPaginas: 1 });
  const [cliente, setCliente] = useState<ClienteB | null>(null);
  const [facturas, setFacturas] = useState<FacturaE[]>([]);
  const [pagFac, setPagFac] = useState({ pagina: 1, totalPaginas: 1 });
  const [textoFactura, setTextoFactura] = useState("");
  const [factura, setFactura] = useState<Factura | null>(null);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [motivo, setMotivo] = useState<number | "">("");
  const [sucursalId, setSucursalId] = useState("");
  const [puntoId, setPuntoId] = useState("");
  const [observacion, setObservacion] = useState("");
  const [entradas, setEntradas] = useState<Record<number, Entrada>>({});
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  // UI-01: la revisión guarda el cuerpo EXACTO que el servidor validó y resumió; «Emitir» envía ese mismo cuerpo (misma clave de idempotencia), nunca uno reconstruido desde los campos.
  const [revisado, setRevisado] = useState<{ cuerpo: CuerpoRevisado; resumen: Resumen } | null>(null);
  const resumen = revisado?.resumen ?? null;
  const [enviando, setEnviando] = useState(false);

  const cargarClientes = useCallback(async (q: string, pagina: number) => {
    try {
      const r = await pedir<{ clientes: ClienteB[]; pagina: number; totalPaginas: number }>(`/api/notas-credito/clientes?q=${encodeURIComponent(q)}&pagina=${pagina}&porPagina=10`);

      setClientes(r.clientes);
      setPagCli({ pagina: r.pagina, totalPaginas: r.totalPaginas });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const control = useRef(crearControlListado({ clienteId: "", q: "", pagina: 1 }));

  const cargarFacturas = useCallback(async (clienteId: string, q: string, pagina: number, actualizar: boolean) => {
    const token = control.current.aplicar({ clienteId, q, pagina });

    setCargando(true);
    try {
      const r = await pedir<{ facturas: FacturaE[]; pagina: number; totalPaginas: number }>(`/api/notas-credito/facturas?clienteId=${clienteId}&q=${encodeURIComponent(q)}&pagina=${pagina}&porPagina=10${actualizar ? "&actualizar=1" : ""}`);

      if (!control.current.vigente(token)) return;

      setFacturas(r.facturas);
      setPagFac({ pagina: r.pagina, totalPaginas: r.totalPaginas });
      setError(null);
    } catch (e) {
      if (control.current.vigente(token)) setError((e as Error).message);
    } finally {
      if (control.current.vigente(token)) setCargando(false);
    }
  }, []);

  // GAP-03: mientras la lista muestra alguna factura con «NCE pendiente» se relee en silencio (solo GET; el worker del servidor consulta). Mismo control que Documentos: frecuencia decreciente, aba visible.
  const hayNcePendiente = !factura && cliente !== null && facturas.some((f) => f.ncePendiente);
  const clienteId = cliente?.id ?? "";

  useEffect(() => {
    if (!hayNcePendiente || clienteId === "") return;

    let activo = true;
    const detener = iniciarRefresco({
      leer: () => {
        // Filtro APLICADO en este momento (no el capturado al crear el ciclo) y token para descartar respuestas de una búsqueda anterior (R05-02).
        const { filtro, token } = control.current.leer();

        if (filtro.clienteId !== clienteId) return;

        fetch(`/api/notas-credito/facturas?clienteId=${filtro.clienteId}&q=${encodeURIComponent(filtro.q)}&pagina=${filtro.pagina}&porPagina=10`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((j: { facturas: FacturaE[]; pagina: number; totalPaginas: number } | null) => { if (activo && j && control.current.vigente(token)) { setFacturas(j.facturas); setPagFac({ pagina: j.pagina, totalPaginas: j.totalPaginas }); } })
          .catch(() => undefined);
      },
      visible: () => document.visibilityState === "visible",
      programar: (fn, ms) => window.setTimeout(fn, ms),
      cancelar: (t) => window.clearTimeout(t as number),
      alVolverVisible: (fn) => { document.addEventListener("visibilitychange", fn); return () => document.removeEventListener("visibilitychange", fn); },
    });

    return () => { activo = false; detener(); };
  }, [hayNcePendiente, clienteId]);

  const abrirFactura = useCallback(async (id: string, precarga?: { motivo: number; sucursalId: string; puntoId: string | null; observacion: string; lineas: Array<{ linea: number; cantidad: string; monto: string }> }) => {
    setCargando(true);
    try {
      const r = await pedir<{ factura: Factura; sucursales: Sucursal[] }>(`/api/notas-credito/facturas/${id}`);
      const f = r.factura;
      const nuevas: Record<number, Entrada> = precarga ? {} : entradasIniciales(f.lineas, f.motivoFijado ?? "");

      if (precarga) for (const l of f.lineas) {
        const p = precarga?.lineas.find((x) => x.linea === l.linea);

        nuevas[l.linea] = { incluida: !!p, valor: p ? (precarga!.motivo === 2 ? p.cantidad : p.monto) : "" };
      }

      setFactura(f);
      setSucursales(r.sucursales);
      setEntradas(nuevas);
      setMotivo(precarga ? precarga.motivo : f.motivoFijado ?? "");
      setSucursalId(precarga?.sucursalId ?? (r.sucursales.some((s) => s.id === f.sucursalId) ? f.sucursalId : ""));
      setPuntoId(precarga?.puntoId ?? "");
      setObservacion(precarga?.observacion ?? "");
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (corregir) return;

    const t = window.setTimeout(() => { void cargarClientes("", 1); }, 0);

    return () => window.clearTimeout(t);
  }, [corregir, cargarClientes]);

  useEffect(() => {
    if (!corregir) return;

    let vivo = true;

    (async () => {
      try {
        const p = await pedir<{ facturaId: string; motivo: number; sucursalId: string; puntoId: string | null; observacion: string; numeroRechazado: string; lineas: Array<{ linea: number; cantidad: string; monto: string }> }>(`/api/notas-credito/correccion/${corregir}`);

        if (!vivo) return;

        setAviso(`Propuesta de corrección de la nota de crédito rechazada ${p.numeroRechazado}. Revise todos los datos: se vuelven a validar y se emitirá una NUEVA nota con su propio número.`);
        await abrirFactura(p.facturaId, p);
      } catch (e) {
        if (vivo) setError((e as Error).message);
      }
    })();

    return () => { vivo = false; };
  }, [corregir, abrirFactura]);

  const punto = useMemo(() => sucursales.find((s) => s.id === sucursalId)?.puntos.find((p) => p.id === puntoId) ?? null, [sucursales, sucursalId, puntoId]);
  const sucursal = sucursales.find((s) => s.id === sucursalId) ?? null;
  const esDevolucion = motivo === 2;

  const cuerpo = useCallback(() => {
    if (!factura || motivo === "") return null;

    const lineas = factura.lineas.filter((l) => entradas[l.linea]?.incluida).map((l) => ({ linea: l.linea, ...(esDevolucion ? { cantidad: entradas[l.linea].valor.trim() } : { monto: entradas[l.linea].valor.trim() }) }));
    const firma = JSON.stringify([factura.id, motivo, puntoId, observacion.trim(), lineas]);
    let h1 = 5381;
    let h2 = 52711;

    for (let i = 0; i < firma.length; i += 1) {
      h1 = ((h1 * 33) ^ firma.charCodeAt(i)) >>> 0;
      h2 = ((h2 * 31) + firma.charCodeAt(i)) >>> 0;
    }

    return { facturaId: factura.id, motivo, sucursalId, puntoId, observacion: observacion.trim(), lineas, claveIdempotencia: `nce-${nonce.current}-${h1.toString(36)}${h2.toString(36)}` };
  }, [factura, motivo, entradas, esDevolucion, puntoId, sucursalId, observacion]);

  async function revisar() {
    const c = cuerpo();

    if (!c) { setError("Seleccione el motivo."); return; }

    setCargando(true);
    setError(null);
    try {
      const r = await pedir<{ resumen: Resumen }>("/api/notas-credito/previa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });

      setRevisado({ cuerpo: c as CuerpoRevisado, resumen: r.resumen });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  async function emitir() {
    // Se envía EXACTAMENTE el cuerpo revisado. Si los datos del formulario ya no coinciden con él, no se emite: hay que revisar de nuevo.
    const c = revisado?.cuerpo;

    if (!c || enviando) return;
    if (JSON.stringify(cuerpo()) !== JSON.stringify(c)) { setRevisado(null); setError("Los datos cambiaron después de la revisión: revise la nota de crédito de nuevo antes de emitirla."); return; }

    setEnviando(true);
    setError(null);
    try {
      const r = await pedir<{ numero: string; mensaje?: string }>("/api/notas-credito", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });

      router.push(`/documentos?q=${encodeURIComponent(r.numero)}`);
    } catch (e) {
      setError((e as Error).message);
      setRevisado(null);
      setEnviando(false);
    }
  }

  function volverAFacturas() {
    setFactura(null);
    setRevisado(null);
    setAviso(null);
    setError(null);
  }

  const seleccionadas = factura ? factura.lineas.filter((l) => entradas[l.linea]?.incluida).length : 0;
  const listoParaRevisar = !!factura && !factura.bloqueada && motivo !== "" && !!punto && seleccionadas > 0;

  return (
    <main className={ui.page}>
      {/* UI-01: con el modal abierto el fondo queda inerte (sin foco, teclado ni clics): no se puede editar lo revisado. */}
      <div inert={revisado !== null} style={{ display: "contents" }}>
      <header className={ui.topbar}>
        <div className={ui.titleBlock}>
          <nav className={ui.breadcrumb} aria-label="Ruta"><Link href="/documentos">Documentos electrónicos</Link> / Nota de crédito</nav>
          <h1>Nota de crédito electrónica</h1>
        </div>
        <Link className={ui.secondaryButton} href="/documentos">Documentos electrónicos</Link>
      </header>

      <p className={estilos.intro}>Acredite total o parcialmente una factura electrónica aprobada. La nota se emite con numeración propia y queda asociada al CDC de la factura. No modifica inventario ni cuentas por cobrar.</p>

      {error ? <div className={estilos.error} role="alert">{error}</div> : null}
      {aviso ? <div className={estilos.aviso} role="status">{aviso}</div> : null}

      {!factura ? (
        <>
          <section className={estilos.card}>
            <h2>1. Cliente</h2>
            {cliente ? (
              <p>
                <strong>{cliente.razonSocial}</strong> <small>{cliente.documento}</small>{" "}
                <button type="button" className={ui.secondaryButton} onClick={() => { control.current.aplicar({ clienteId: "", q: "", pagina: 1 }); setCliente(null); setFacturas([]); }}>Cambiar cliente</button>
              </p>
            ) : (
              <>
                <form className={estilos.grid} onSubmit={(e) => { e.preventDefault(); void cargarClientes(textoCliente, 1); }}>
                  <label className={estilos.field}><span>Buscar cliente (nombre, código o RUC)</span><input value={textoCliente} onChange={(e) => setTextoCliente(e.target.value)} maxLength={80} autoFocus /></label>
                  <div className={estilos.acciones}><button type="submit" className={ui.primaryButton}>Buscar</button></div>
                </form>
                <ul className={estilos.lista}>
                  {clientes.map((c) => (
                    <li key={c.id}>
                      <span>{c.razonSocial} <small>{c.codigo} · {c.documento}</small>{c.innominado ? <><span className={estilos.chip}>Innominado</span><br /><small>{MENSAJE_INNOMINADO}</small></> : null}</span>
                      <button type="button" className={ui.secondaryButton} disabled={c.innominado} title={c.innominado ? MENSAJE_INNOMINADO : undefined} onClick={() => { if (c.innominado) return; setCliente(c); void cargarFacturas(c.id, "", 1, true); }}>Seleccionar</button>
                    </li>
                  ))}
                  {clientes.length === 0 ? <li><small>No hay clientes con facturas aprobadas para esta búsqueda.</small></li> : null}
                </ul>
                {pagCli.totalPaginas > 1 ? (
                  <div className={estilos.acciones}>
                    <button type="button" className={ui.secondaryButton} disabled={pagCli.pagina <= 1} onClick={() => void cargarClientes(textoCliente, pagCli.pagina - 1)}>Anterior</button>
                    <span className={estilos.hint}>Página {pagCli.pagina} de {pagCli.totalPaginas}</span>
                    <button type="button" className={ui.secondaryButton} disabled={pagCli.pagina >= pagCli.totalPaginas} onClick={() => void cargarClientes(textoCliente, pagCli.pagina + 1)}>Siguiente</button>
                  </div>
                ) : null}
              </>
            )}
          </section>

          {cliente ? (
            <section className={estilos.card}>
              <h2>2. Factura aprobada <small>solo facturas con saldo por acreditar</small></h2>
              <form className={estilos.grid} onSubmit={(e) => { e.preventDefault(); void cargarFacturas(cliente.id, textoFactura, 1, false); }}>
                <label className={estilos.field}><span>Buscar por número, CDC (44 dígitos) o fecha (dd/mm/aaaa o aaaa-mm-dd)</span><input value={textoFactura} onChange={(e) => setTextoFactura(e.target.value)} maxLength={80} inputMode="search" /></label>
                <div className={estilos.acciones}><button type="submit" className={ui.primaryButton}>Buscar</button></div>
              </form>
              <ul className={estilos.lista}>
                {facturas.map((f) => (
                  <li key={f.id}>
                    <span>
                      <strong>{f.numero}</strong> <small>{formatearFechaPy(f.fechaEmision)} · {f.moneda}</small>
                      {f.ncePendiente ? <span className={estilos.chip}>NCE pendiente</span> : null}
                      <br /><small className={estilos.mono}>Total {fm(f.total)} · Saldo por acreditar {fm(f.saldo)}</small>
                    </span>
                    <button type="button" className={ui.secondaryButton} disabled={f.ncePendiente || cargando} title={f.ncePendiente ? "Hay una nota de crédito pendiente de resultado para esta factura." : undefined} onClick={() => void abrirFactura(f.id)}>Seleccionar</button>
                  </li>
                ))}
                {facturas.length === 0 && !cargando ? <li><small>Este cliente no tiene facturas aprobadas con saldo por acreditar.</small></li> : null}
              </ul>
              {pagFac.totalPaginas > 1 ? (
                <div className={estilos.acciones}>
                  <button type="button" className={ui.secondaryButton} disabled={pagFac.pagina <= 1} onClick={() => void cargarFacturas(cliente.id, textoFactura, pagFac.pagina - 1, false)}>Anterior</button>
                  <span className={estilos.hint}>Página {pagFac.pagina} de {pagFac.totalPaginas}</span>
                  <button type="button" className={ui.secondaryButton} disabled={pagFac.pagina >= pagFac.totalPaginas} onClick={() => void cargarFacturas(cliente.id, textoFactura, pagFac.pagina + 1, false)}>Siguiente</button>
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      ) : (
        <>
          <section className={estilos.card}>
            <h2>Factura {factura.numero} <small>{factura.receptorNombre} · {formatearFechaPy(factura.fechaEmision)} · {factura.moneda}{factura.cambio ? ` (cambio ${fm(factura.cambio)})` : ""}</small></h2>
            <p className={estilos.hint}>CDC <span className={estilos.mono}>{factura.cdc}</span></p>
            {factura.bloqueada ? <div className={estilos.error} role="alert">Esta factura tiene una nota de crédito pendiente de resultado. Espere su resultado definitivo antes de emitir otra.</div> : null}
            {!corregir ? <button type="button" className={ui.secondaryButton} onClick={volverAFacturas}>Elegir otra factura</button> : null}
          </section>

          <section className={estilos.card}>
            <h2>Datos de la nota</h2>
            <div className={estilos.grid}>
              <label className={estilos.field}>
                <span>Motivo</span>
                <select value={motivo} onChange={(e) => { const m = e.target.value === "" ? "" : Number(e.target.value); setMotivo(m); setEntradas(entradasIniciales(factura.lineas, m)); }} disabled={factura.motivoFijado !== null}>
                  <option value="">Seleccione…</option>
                  {factura.motivosPermitidos.map((m) => <option key={m} value={m}>{MOTIVOS[m]}</option>)}
                </select>
                {factura.motivoFijado !== null ? <small className={estilos.hint}>El motivo quedó fijado por la primera nota de crédito aprobada de esta factura.</small> : null}
              </label>
              <label className={estilos.field}>
                <span>Sucursal</span>
                <select value={sucursalId} onChange={(e) => { setSucursalId(e.target.value); setPuntoId(""); }}>
                  <option value="">Seleccione…</option>
                  {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre} ({s.establecimiento})</option>)}
                </select>
              </label>
              <label className={estilos.field}>
                <span>Punto de expedición</span>
                <select value={puntoId} onChange={(e) => setPuntoId(e.target.value)} disabled={!sucursal}>
                  <option value="">Seleccione…</option>
                  {sucursal?.puntos.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}
                </select>
                {sucursal && sucursal.puntos.length === 0 ? <small className={estilos.hint}>Esta sucursal no tiene puntos con numeración NCE confirmada. Configúrela en Facturación → Puntos de expedición.</small> : null}
                {sucursal && sucursal.sinSecuencia > 0 && sucursal.puntos.length > 0 ? <small className={estilos.hint}>{sucursal.sinSecuencia} punto(s) activo(s) sin numeración NCE confirmada no se listan.</small> : null}
              </label>
            </div>
            <label className={estilos.field} style={{ marginTop: 12 }}>
              <span>Observación (opcional)</span>
              <textarea rows={2} value={observacion} onChange={(e) => setObservacion(e.target.value)} maxLength={5000} />
            </label>
          </section>

          <section className={estilos.card}>
            <h2>Líneas a acreditar <small>{esDevolucion ? "indique la cantidad a devolver" : "indique el monto a acreditar (IVA incluido)"}</small></h2>
            <div className={estilos.tabla}>
              <table>
                <thead>
                  <tr><th /><th>Ítem</th><th>Código</th><th>Descripción</th><th>IVA</th><th className={estilos.num}>Cant.</th><th className={estilos.num}>Precio</th><th className={estilos.num}>Total</th><th className={estilos.num}>Cant. acreditada</th><th className={estilos.num}>Monto acreditado</th><th className={estilos.num}>Saldo cant.</th><th className={estilos.num}>Saldo monto</th><th className={estilos.num}>{esDevolucion ? "Cantidad a devolver" : "Monto a acreditar"}</th></tr>
                </thead>
                <tbody>
                  {factura.lineas.map((l) => {
                    const e = entradas[l.linea] ?? { incluida: false, valor: "" };

                    return (
                      <tr key={l.linea} className={l.agotada ? estilos.agotada : undefined}>
                        <td><input type="checkbox" aria-label={`Incluir ítem ${l.linea}`} checked={e.incluida} disabled={l.agotada} onChange={(ev) => setEntradas((p) => ({ ...p, [l.linea]: { ...e, incluida: ev.target.checked } }))} /></td>
                        <td>{l.linea}</td>
                        <td>{l.codigoInterno}</td>
                        <td>{l.descripcion}{l.agotada ? <span className={estilos.chip}>Sin saldo</span> : null}</td>
                        <td>{etiquetaIvaLinea(l.afectacion, l.tasa, l.proporcion)}</td>
                        <td className={estilos.num}>{fm(l.cantidad)} {l.unidad}</td>
                        <td className={estilos.num}>{fm(l.precio)}</td>
                        <td className={estilos.num}>{fm(l.total)}</td>
                        <td className={estilos.num}>{fm(l.cantidadAcreditada)}</td>
                        <td className={estilos.num}>{fm(l.montoAcreditado)}</td>
                        <td className={estilos.num}>{fm(l.cantidadDisponible)}</td>
                        <td className={estilos.num}>{fm(l.saldoMonto)}</td>
                        <td className={estilos.num}>
                          <input className={estilos.entrada} inputMode="decimal" aria-label={`${esDevolucion ? "Cantidad" : "Monto"} del ítem ${l.linea}`} disabled={!e.incluida || l.agotada} value={e.valor} placeholder={esDevolucion ? l.cantidadDisponible : l.saldoMonto}
                            onChange={(ev) => setEntradas((p) => ({ ...p, [l.linea]: { ...e, valor: ev.target.value } }))} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className={estilos.acciones}>
              <button type="button" className={ui.primaryButton} disabled={!listoParaRevisar || cargando} onClick={() => void revisar()}>Revisar nota de crédito</button>
              <span className={estilos.hint}>{seleccionadas} línea(s) seleccionada(s). El total y el IVA se calculan en el servidor al revisar.</span>
            </div>
          </section>
        </>
      )}

      </div>

      {resumen ? (
        <div className={estilos.fondo} role="dialog" aria-modal="true" aria-label="Revisión de la nota de crédito">
          <div className={estilos.modal}>
            <h2>Revisar y emitir</h2>
            <dl>
              <div><dt>Factura original</dt><dd>{resumen.factura.numero}</dd></div>
              <div><dt>CDC</dt><dd className={estilos.mono}>{resumen.factura.cdc}</dd></div>
              <div><dt>Motivo</dt><dd>{resumen.motivo.nombre}</dd></div>
              <div><dt>Nota de crédito Nº</dt><dd>{resumen.numero}</dd></div>
              <div><dt>Moneda</dt><dd>{resumen.moneda}{resumen.cambio ? ` · cambio ${fm(resumen.cambio)}` : ""}</dd></div>
              <div><dt>Punto</dt><dd>{resumen.punto}</dd></div>
              {resumen.observacion ? <div><dt>Observación</dt><dd>{resumen.observacion}</dd></div> : null}
            </dl>
            <div className={estilos.tabla}>
              <table>
                <thead><tr><th>Ítem</th><th>Código</th><th>Descripción</th><th>IVA</th><th className={estilos.num}>Cantidad</th><th className={estilos.num}>Precio</th><th className={estilos.num}>Monto</th></tr></thead>
                <tbody>
                  {resumen.lineas.map((l) => <tr key={l.linea}><td>{l.linea}</td><td>{l.codigo}</td><td>{l.descripcion}</td><td>{etiquetaIvaLinea(l.afectacion, l.tasa, l.proporcion)}</td><td className={estilos.num}>{fm(l.cantidad)}</td><td className={estilos.num}>{fm(l.precioUnitario)}</td><td className={estilos.num}>{fm(l.monto)}</td></tr>)}
                </tbody>
              </table>
            </div>
            <dl className={estilos.totales}>
              <div><dt>Exento</dt><dd>{fm(resumen.totales.exento)}</dd></div>
              <div><dt>Gravado 5%</dt><dd>{fm(resumen.totales.gravado5)}</dd></div>
              <div><dt>Gravado 10%</dt><dd>{fm(resumen.totales.gravado10)}</dd></div>
              <div><dt>IVA 5%</dt><dd>{fm(resumen.totales.iva5)}</dd></div>
              <div><dt>IVA 10%</dt><dd>{fm(resumen.totales.iva10)}</dd></div>
              <div><dt>Total IVA</dt><dd>{fm(resumen.totales.totalIva)}</dd></div>
              <div><dt>Total NCE</dt><dd>{fm(resumen.totales.total)}</dd></div>
            </dl>
            <p className={estilos.hint}>Al emitir se reserva el número y se envía al gateway. El resultado fiscal se consulta automáticamente y se ve en Documentos electrónicos.</p>
            <div className={estilos.acciones}>
              <button type="button" className={ui.secondaryButton} disabled={enviando} onClick={() => setRevisado(null)}>Volver y editar</button>
              <button type="button" className={ui.primaryButton} disabled={enviando} onClick={() => void emitir()}>{enviando ? "Emitiendo…" : "Emitir nota de crédito"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default function NotasCreditoPage() {
  return (
    <Suspense fallback={null}>
      <Formulario />
    </Suspense>
  );
}
