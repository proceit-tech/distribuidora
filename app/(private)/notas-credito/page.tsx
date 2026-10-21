"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import ui from "@/components/ui/lista-padrao/lista.module.css";
import { crearBusquedaClientes, crearBusquedaFacturas, crearCargaCorreccion, crearCargaDetalle, type EstadoClientes } from "@/lib/facturacion/nce-busqueda";
import { alternarLinea, alternarTodas, eliminadasPorPrecarga, eliminarSeleccionadas, enNota, entradasIniciales, errorCantidadDevolucion, etiquetaIvaLinea, lineasVisibles } from "@/lib/facturacion/nce-entradas";
import { normalizarCantidadTexto } from "@/lib/formato/cantidad-campo";
import { iniciarRefresco } from "@/lib/facturacion/refresco-documentos";
import { formatearDecimalTexto } from "@/lib/formato/decimal-texto";
import { formatearFechaPy } from "@/lib/formato/listas";
import { formatearMontoVisual } from "@/lib/formato/monto-visual";

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
type Punto = { id: string; codigo: string; nombre: string; ultimoNumero: number; serie?: string | null };
type Sucursal = { id: string; nombre: string; establecimiento: string; puntos: Punto[]; sinSecuencia: number };
type Resumen = {
  factura: { numero: string; cdc: string; fechaEmision: string }; motivo: { codigo: number; nombre: string }; punto: string; moneda: string; cambio: string | null; observacion: string; numero: string;
  lineas: Array<{ linea: number; codigo: string; descripcion: string; unidad: string; cantidad: string; precioUnitario: string; monto: string; afectacion: number; tasa: number; proporcion: string }>;
  totales: { exento: string; exonerado: string; gravado5: string; gravado10: string; iva5: string; iva10: string; totalIva: string; total: string };
};
type CuerpoRevisado = { facturaId: string; motivo: number; sucursalId: string; puntoId: string; observacion: string; lineas: Array<{ linea: number; cantidad?: string; monto?: string }>; claveIdempotencia: string };
type Entrada = { incluida: boolean; valor: string };

const fm = (t: string) => formatearDecimalTexto(t);
/** Solo presentación: importes sin decimales largos (PYG sin decimales). No afecta cálculos ni lo enviado. */
const fmv = (t: string | number | null | undefined, moneda?: string | null) => formatearMontoVisual(t, moneda);
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

  const [estCli, setEstCli] = useState<EstadoClientes<ClienteB>>({ texto: "", consulta: null, items: [], pagina: 1, totalPaginas: 1, abierto: false, buscando: false });
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
  // E06: líneas marcadas (para eliminar) y líneas eliminadas de la NOTA en preparación; la factura original y su catálogo no se tocan.
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [eliminadas, setEliminadas] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  // UI-01: la revisión guarda el cuerpo EXACTO que el servidor validó y resumió; «Emitir» envía ese mismo cuerpo (misma clave de idempotencia), nunca uno reconstruido desde los campos.
  const [revisado, setRevisado] = useState<{ cuerpo: CuerpoRevisado; resumen: Resumen } | null>(null);
  const resumen = revisado?.resumen ?? null;
  const [enviando, setEnviando] = useState(false);
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set());

  // R01-01/02/03: los controladores puros invalidan peticiones, resultados y temporizadores al instante (ver lib/facturacion/nce-busqueda.ts).
  const [busCli] = useState(() => crearBusquedaClientes<ClienteB>({
    buscar: (q, pagina) => pedir(`/api/notas-credito/clientes?q=${encodeURIComponent(q)}&pagina=${pagina}&porPagina=10`),
    programar: (fn, ms) => window.setTimeout(fn, ms),
    cancelar: (t) => window.clearTimeout(t as number),
    alCambiar: setEstCli,
    alError: setError,
  }));
  const [busFac] = useState(() => crearBusquedaFacturas<FacturaE>({
    pedir: (clienteId, q, pagina, actualizar) => pedir(`/api/notas-credito/facturas?clienteId=${clienteId}&q=${encodeURIComponent(q)}&pagina=${pagina}&porPagina=10${actualizar ? "&actualizar=1" : ""}`),
    programar: (fn, ms) => window.setTimeout(fn, ms),
    cancelar: (t) => window.clearTimeout(t as number),
    alLimpiar: () => { setFacturas([]); setPagFac({ pagina: 1, totalPaginas: 1 }); },
    alResultado: (x) => { setFacturas(x.facturas); setPagFac({ pagina: x.pagina, totalPaginas: x.totalPaginas }); },
    alCargando: setCargando,
    alError: setError,
  }));
  const control = busFac.control;
  const textoCliente = estCli.texto;
  const textoCortoCli = textoCliente.trim().length < 2;

  // GAP-03: mientras la lista muestra alguna factura con «NCE pendiente» se relee en silencio (solo GET; el worker del servidor consulta). Mismo control que Documentos: frecuencia decreciente, aba visible.
  const hayNcePendiente = !factura && cliente !== null && facturas.some((f) => f.ncePendiente);
  const clienteId = cliente?.id ?? "";

  useEffect(() => {
    if (!hayNcePendiente || clienteId === "") return;

    let activo = true;
    const detener = iniciarRefresco({
      leer: () => {
        // Filtro APLICADO en este momento (no el capturado al crear el ciclo) y token para descartar respuestas de una búsqueda anterior (R05-02).
        const { filtro, token } = control.leer();

        if (filtro.clienteId !== clienteId) return;

        fetch(`/api/notas-credito/facturas?clienteId=${filtro.clienteId}&q=${encodeURIComponent(filtro.q)}&pagina=${filtro.pagina}&porPagina=10`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((j: { facturas: FacturaE[]; pagina: number; totalPaginas: number } | null) => { if (activo && j && control.vigente(token)) { setFacturas(j.facturas); setPagFac({ pagina: j.pagina, totalPaginas: j.totalPaginas }); } })
          .catch(() => undefined);
      },
      visible: () => document.visibilityState === "visible",
      programar: (fn, ms) => window.setTimeout(fn, ms),
      cancelar: (t) => window.clearTimeout(t as number),
      alVolverVisible: (fn) => { document.addEventListener("visibilitychange", fn); return () => document.removeEventListener("visibilitychange", fn); },
    });

    return () => { activo = false; detener(); };
  }, [hayNcePendiente, clienteId, control]);

  // C03 / NCE-D01: solo la apertura de factura VIGENTE aplica su resultado, su error y su estado «Cargando…»; cambiar de cliente, volver a la lista, cambiar la corrección o desmontar la invalidan.
  type Precarga = { motivo: number; sucursalId: string; puntoId: string | null; observacion: string; lineas: Array<{ linea: number; cantidad: string; monto: string }> };
  const [detalle] = useState(() => crearCargaDetalle<{ factura: Factura; sucursales: Sucursal[] }, Precarga | undefined>({
    pedir: (id) => pedir<{ factura: Factura; sucursales: Sucursal[] }>(`/api/notas-credito/facturas/${id}`),
    alCargando: setCargando,
    alError: setError,
    alResultado: (r, precarga) => {
      const f = r.factura;
      const nuevas: Record<number, Entrada> = precarga ? {} : entradasIniciales(f.lineas, f.motivoFijado ?? "");

      if (precarga) for (const l of f.lineas) {
        const p = precarga?.lineas.find((x) => x.linea === l.linea);

        nuevas[l.linea] = { incluida: !!p, valor: p ? (precarga!.motivo === 2 ? p.cantidad : p.monto) : "" };
      }

      setFactura(f);
      setSucursales(r.sucursales);
      setEntradas(nuevas);
      setMarcadas(new Set());
      setEliminadas(precarga ? eliminadasPorPrecarga(f.lineas, precarga.motivo, precarga.lineas) : new Set());
      setMotivo(precarga ? precarga.motivo : f.motivoFijado ?? "");
      setSucursalId(precarga?.sucursalId ?? (r.sucursales.some((s) => s.id === f.sucursalId) ? f.sucursalId : ""));
      setPuntoId(precarga?.puntoId ?? "");
      setObservacion(precarga?.observacion ?? "");
      setError(null);
    },
  }));
  const abrirFactura = useCallback((id: string, precarga?: Precarga) => {
    busFac.detener();

    return detalle.abrir(id, precarga);
  }, [busFac, detalle]);


  // C03-R02-01: la propuesta de corrección y la apertura de su factura comparten el contexto vigente; cualquier cambio de contexto invalida ambas etapas.
  type PropuestaCorreccion = Precarga & { facturaId: string; numeroRechazado: string };
  const [correccion] = useState(() => crearCargaCorreccion<PropuestaCorreccion>({
    pedir: (id) => pedir<PropuestaCorreccion>(`/api/notas-credito/correccion/${id}`),
    alPropuesta: (p) => setAviso(`Propuesta de corrección de la nota de crédito rechazada ${p.numeroRechazado}. Revise todos los datos: se vuelven a validar y se emitirá una NUEVA nota con su propio número.`),
    abrir: (facturaId, p) => abrirFactura(facturaId, p),
    alError: setError,
  }));
  const invalidarContexto = useCallback(() => { correccion.invalidar(); detalle.invalidar(); }, [correccion, detalle]);

  // Al desmontar se cancelan los temporizadores y se invalidan las peticiones pendientes (listas, propuesta de corrección y detalle).
  useEffect(() => () => { busCli.reiniciar(); busFac.cancelar(); correccion.invalidar(); detalle.invalidar(); }, [busCli, busFac, correccion, detalle]);

  useEffect(() => {
    if (!corregir) return;

    void correccion.cargar(corregir);

    // Cambiar de corrección (o salir) descarta la propuesta y la factura que aún se estén cargando.
    return () => invalidarContexto();
  }, [corregir, correccion, invalidarContexto]);

  const punto = useMemo(() => sucursales.find((s) => s.id === sucursalId)?.puntos.find((p) => p.id === puntoId) ?? null, [sucursales, sucursalId, puntoId]);
  const sucursal = sucursales.find((s) => s.id === sucursalId) ?? null;
  const esDevolucion = motivo === 2;
  const visibles = factura ? lineasVisibles(factura.lineas, eliminadas) : [];
  const marcadasVisibles = visibles.filter((l) => marcadas.has(l.linea)).length;
  const todasMarcadas = visibles.length > 0 && marcadasVisibles === visibles.length;

  const cuerpo = useCallback(() => {
    if (!factura || motivo === "") return null;

    const lineas = factura.lineas.filter((l) => enNota(esDevolucion, l, entradas[l.linea]?.valor ?? "", eliminadas)).map((l) => ({ linea: l.linea, ...(esDevolucion ? { cantidad: normalizarCantidadTexto(entradas[l.linea]?.valor ?? "") } : { monto: (entradas[l.linea]?.valor ?? "").trim() }) }));
    const firma = JSON.stringify([factura.id, motivo, puntoId, observacion.trim(), lineas]);
    let h1 = 5381;
    let h2 = 52711;

    for (let i = 0; i < firma.length; i += 1) {
      h1 = ((h1 * 33) ^ firma.charCodeAt(i)) >>> 0;
      h2 = ((h2 * 31) + firma.charCodeAt(i)) >>> 0;
    }

    return { facturaId: factura.id, motivo, sucursalId, puntoId, observacion: observacion.trim(), lineas, claveIdempotencia: `nce-${nonce.current}-${h1.toString(36)}${h2.toString(36)}` };
  }, [factura, motivo, entradas, eliminadas, esDevolucion, puntoId, sucursalId, observacion]);

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
    invalidarContexto();
    busFac.cambiarCliente(cliente?.id ?? null);
    setFactura(null);
    setRevisado(null);
    setAviso(null);
    setError(null);
  }

  const seleccionadas = factura ? factura.lineas.filter((l) => enNota(esDevolucion, l, entradas[l.linea]?.valor ?? "", eliminadas)).length : 0;
  const erroresCantidad = new Map<number, string>();

  if (factura && esDevolucion) for (const l of factura.lineas) if (enNota(true, l, entradas[l.linea]?.valor ?? "", eliminadas)) { const e = errorCantidadDevolucion(entradas[l.linea]?.valor ?? "", l.cantidadDisponible); if (e) erroresCantidad.set(l.linea, e); }

  const listoParaRevisar = !!factura && !factura.bloqueada && motivo !== "" && !!punto && seleccionadas > 0 && erroresCantidad.size === 0;
  const faltantes: string[] = [];

  if (factura) {
    if (factura.bloqueada) faltantes.push("Hay una nota de crédito pendiente de resultado para esta factura.");
    if (motivo === "") faltantes.push("Seleccione el motivo.");
    if (!punto) faltantes.push("Seleccione el establecimiento y el punto de expedición.");
    if (seleccionadas === 0) faltantes.push(eliminadas.size > 0 ? "La nota no tiene líneas: restaure las eliminadas o cambie de motivo." : "Incluya al menos una línea.");
    if (erroresCantidad.size > 0) faltantes.push(`Corrija la cantidad a devolver de ${erroresCantidad.size} línea${erroresCantidad.size === 1 ? "" : "s"}.`);
  }

  const paso = !cliente && !factura ? 1 : !factura ? 2 : 3;
  const lupa = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
  );
  const elegirCliente = (c: ClienteB) => {
    if (c.innominado) return;

    invalidarContexto();
    busCli.reiniciar();
    setCliente(c);
    setTextoFactura("");
    busFac.cambiarCliente(c.id);
  };

  return (
    <main className={ui.page}>
      {/* UI-01: con el modal abierto el fondo queda inerte (sin foco, teclado ni clics): no se puede editar lo revisado. */}
      <div inert={revisado !== null} style={{ display: "contents" }}>
      <header className={ui.topbar}>
        <div className={ui.titleBlock}>
          <nav className={ui.breadcrumb} aria-label="Ruta"><Link href="/documentos">Documentos electrónicos</Link> / Nota de crédito</nav>
          <h1>Nueva nota de crédito</h1>
        </div>
        <Link className={ui.secondaryButton} href="/documentos">Volver a documentos</Link>
      </header>

      <ol className={estilos.pasos} aria-label="Avance">
        <li className={paso > 1 ? estilos.hecho : undefined} aria-current={paso === 1 ? "step" : undefined}>Cliente</li>
        <li className={paso > 2 ? estilos.hecho : undefined} aria-current={paso === 2 ? "step" : undefined}>Factura original</li>
        <li aria-current={paso === 3 ? "step" : undefined}>Nota de crédito</li>
      </ol>

      {error ? <div className={estilos.error} role="alert">{error}</div> : null}
      {aviso ? <div className={estilos.aviso} role="status">{aviso}</div> : null}

      {!factura ? (
        <div className={estilos.region}>
          {cliente ? (
            <div className={estilos.banda}>
              <span>Cliente: <strong>{cliente.razonSocial}</strong> · {cliente.documento}</span>
              <button type="button" className={ui.secondaryButton} onClick={() => { invalidarContexto(); busFac.cambiarCliente(null); setCliente(null); setTextoFactura(""); }}>Cambiar</button>
            </div>
          ) : (
            <section className={estilos.card} aria-label="Cliente">
              <div className={estilos.busca}>
                <label htmlFor="nce-cliente">Cliente</label>
                <div className={estilos.entradaBusca}>
                  {lupa}
                  <input id="nce-cliente" type="search" aria-describedby="nce-cliente-ayuda" autoComplete="off" autoFocus maxLength={80}
                    placeholder="Buscar por nombre, código o RUC" value={textoCliente} onChange={(e) => busCli.escribir(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") { busCli.cerrar(); }
                      if (e.key === "ArrowDown" && !estCli.abierto) { e.preventDefault(); busCli.reabrir(); }
                      if (e.key === "Enter") { e.preventDefault(); const primero = busCli.primeroElegible(); if (primero) elegirCliente(primero); }
                    }} />
                </div>
                <p className={estilos.vacio} id="nce-cliente-ayuda">{textoCortoCli ? "Escriba al menos 2 caracteres para buscar un cliente con facturas aprobadas." : "Enter elige el primer cliente de la lista; Esc cierra los resultados; flecha abajo los reabre. También puede usar Tab y el botón Seleccionar."}</p>
                {!textoCortoCli && !estCli.abierto ? <p className={estilos.vacio}>Resultados cerrados. Presione la flecha abajo o modifique el texto para buscar de nuevo.</p> : null}
                {!textoCortoCli && estCli.abierto ? (
                  <ul className={estilos.resultados} id="nce-clientes" aria-live="polite">
                    {estCli.items.map((c) => (
                      <li key={c.id}>
                        <span>{c.razonSocial}{c.innominado ? <span className={estilos.chip}>Innominado</span> : null}<small>{c.codigo} · {c.documento}{c.innominado ? ` · ${MENSAJE_INNOMINADO}` : ""}</small></span>
                        <button type="button" className={ui.secondaryButton} disabled={c.innominado} title={c.innominado ? MENSAJE_INNOMINADO : undefined} onClick={() => elegirCliente(c)}>Seleccionar</button>
                      </li>
                    ))}
                    {estCli.items.length === 0 ? <li><small>{estCli.buscando || estCli.consulta === null ? "Buscando…" : "No hay clientes con facturas aprobadas para esta búsqueda."}</small></li> : null}
                  </ul>
                ) : null}
                {estCli.totalPaginas > 1 && estCli.abierto ? (
                  <div className={estilos.acciones}>
                    <button type="button" className={ui.secondaryButton} disabled={estCli.buscando || estCli.pagina <= 1} onClick={() => busCli.pagina(estCli.pagina - 1)}>Anterior</button>
                    <span className={estilos.hint}>Página {estCli.pagina} de {estCli.totalPaginas}</span>
                    <button type="button" className={ui.secondaryButton} disabled={estCli.buscando || estCli.pagina >= estCli.totalPaginas} onClick={() => busCli.pagina(estCli.pagina + 1)}>Siguiente</button>
                  </div>
                ) : null}
              </div>
            </section>
          )}

          {cliente ? (
            <section className={estilos.card} aria-label="Facturas aprobadas">
              <h2>Facturas aprobadas <small>solo con saldo por acreditar</small></h2>
              <div className={estilos.busca}>
                <div className={estilos.entradaBusca}>
                  {lupa}
                  <input type="search" aria-label="Buscar factura por número, fecha o CDC" placeholder="Número, fecha (dd/mm/aaaa) o CDC" maxLength={80} inputMode="search" autoComplete="off" value={textoFactura}
                    onChange={(e) => { setTextoFactura(e.target.value); busFac.filtrar(e.target.value); }} />
                </div>
              </div>
              <div className={estilos.tabla}>
                <table>
                  <thead><tr><th>Nº</th><th>Fecha</th><th>Moneda</th><th className={estilos.num}>Total</th><th className={estilos.num}>Saldo por acreditar</th><th /></tr></thead>
                  <tbody>
                    {facturas.map((f) => (
                      <tr key={f.id}>
                        <td><strong>{f.numero}</strong>{f.ncePendiente ? <span className={estilos.chip}>NCE pendiente</span> : null}</td>
                        <td>{formatearFechaPy(f.fechaEmision)}</td>
                        <td>{f.moneda}</td>
                        <td className={estilos.num}>{fmv(f.total, f.moneda)}</td>
                        <td className={estilos.num}>{fmv(f.saldo, f.moneda)}</td>
                        <td className={estilos.num}>
                          <button type="button" className={ui.secondaryButton} disabled={f.ncePendiente || cargando} title={f.ncePendiente ? "Hay una nota de crédito pendiente de resultado para esta factura." : undefined} onClick={() => void abrirFactura(f.id)}>Seleccionar factura</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {facturas.length === 0 ? <p className={estilos.vacio}>{cargando ? "Cargando facturas…" : textoFactura.trim() === "" ? "Este cliente no tiene facturas aprobadas con saldo por acreditar." : "Ninguna factura coincide con la búsqueda."}</p> : null}
              {pagFac.totalPaginas > 1 ? (
                <div className={estilos.acciones}>
                  <button type="button" className={ui.secondaryButton} disabled={pagFac.pagina <= 1} onClick={() => busFac.pagina(textoFactura, pagFac.pagina - 1)}>Anterior</button>
                  <span className={estilos.hint}>Página {pagFac.pagina} de {pagFac.totalPaginas}</span>
                  <button type="button" className={ui.secondaryButton} disabled={pagFac.pagina >= pagFac.totalPaginas} onClick={() => busFac.pagina(textoFactura, pagFac.pagina + 1)}>Siguiente</button>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : (
        <>
          <div className={estilos.banda} style={{ display: "block" }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "6px 12px", alignItems: "center" }}>
              <span>Factura <strong>{factura.numero}</strong> · {factura.receptorNombre} · {formatearFechaPy(factura.fechaEmision)} · {factura.moneda}{factura.cambio ? ` (cambio ${fm(factura.cambio)})` : ""} <span className={`${estilos.chip} ${estilos.chipOk}`}>APROBADA</span></span>
              {!corregir ? <button type="button" className={ui.secondaryButton} onClick={volverAFacturas}>Cambiar factura</button> : null}
            </div>
            <div className={estilos.cdc}>CDC <code>{factura.cdc}</code> <button type="button" className={estilos.linkBtn} onClick={() => { void navigator.clipboard?.writeText(factura.cdc).catch(() => undefined); }}>Copiar</button></div>
            {factura.bloqueada ? <div className={estilos.error} role="alert" style={{ marginTop: 8 }}>Esta factura tiene una nota de crédito pendiente de resultado. Espere su resultado definitivo antes de emitir otra.</div> : null}
          </div>

          <div className={estilos.layout}>
            <div className={estilos.principal}>
              <section className={estilos.card} aria-label="Datos de la nota">
                <h2>Datos de la nota</h2>
                <div className={estilos.grid}>
                  <label className={estilos.campo}>
                    <span>Motivo</span>
                    <select value={motivo} onChange={(e) => { const m = e.target.value === "" ? "" : Number(e.target.value); setMotivo(m); setEntradas(entradasIniciales(factura.lineas, m)); setMarcadas(new Set()); setEliminadas(new Set()); }} disabled={factura.motivoFijado !== null}>
                      <option value="">Seleccione…</option>
                      {factura.motivosPermitidos.map((m) => <option key={m} value={m}>{MOTIVOS[m]}</option>)}
                    </select>
                    {factura.motivoFijado !== null ? <small className={estilos.hint}>Fijado por la primera nota de crédito aprobada de esta factura.</small> : null}
                  </label>
                  <label className={estilos.campo}>
                    <span>Establecimiento</span>
                    <select value={sucursalId} onChange={(e) => { setSucursalId(e.target.value); setPuntoId(""); }}>
                      <option value="">Seleccione…</option>
                      {sucursales.map((s) => <option key={s.id} value={s.id}>{s.establecimiento} · {s.nombre}</option>)}
                    </select>
                  </label>
                  <label className={estilos.campo}>
                    <span>Punto de expedición NCE</span>
                    <select value={puntoId} onChange={(e) => setPuntoId(e.target.value)} disabled={!sucursal}>
                      <option value="">Seleccione…</option>
                      {sucursal?.puntos.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}
                    </select>
                    {sucursal && sucursal.puntos.length === 0 ? <small className={estilos.hint}>Esta sucursal no tiene puntos con numeración NCE confirmada. Configúrela en Facturación → Puntos de expedición.</small> : null}
                    {sucursal && sucursal.sinSecuencia > 0 && sucursal.puntos.length > 0 ? <small className={estilos.hint}>{sucursal.sinSecuencia} punto(s) activo(s) sin numeración NCE confirmada no se listan.</small> : null}
                  </label>
                </div>
                <label className={estilos.campo} style={{ marginTop: 10 }}>
                  <span>Observación (opcional)</span>
                  <textarea rows={2} value={observacion} onChange={(e) => setObservacion(e.target.value)} maxLength={5000} />
                </label>
              </section>

              <section className={estilos.card} aria-label="Líneas a acreditar">
                <h2>Líneas a acreditar <small>{esDevolucion ? "indique la cantidad a devolver (puede ser parcial, con coma)" : "indique el monto a acreditar (IVA incluido)"}</small></h2>
                <div className={estilos.barraLineas} role="toolbar" aria-label="Selección de líneas">
                  <button type="button" className={ui.secondaryButton} disabled={visibles.length === 0} onClick={() => setMarcadas(alternarTodas(factura.lineas, eliminadas, marcadas))}>{todasMarcadas ? "Deseleccionar todos" : "Seleccionar todos"}</button>
                  <button type="button" className={ui.secondaryButton} disabled={marcadasVisibles === 0} onClick={() => { const r = eliminarSeleccionadas(factura.lineas, eliminadas, marcadas); setEliminadas(r.eliminadas); setMarcadas(r.seleccion); setRevisado(null); }}>Eliminar seleccionados{marcadasVisibles > 0 ? ` (${marcadasVisibles})` : ""}</button>
                  {eliminadas.size > 0 ? <button type="button" className={estilos.linkBtn} onClick={() => { setEntradas((p) => { const base = entradasIniciales(factura.lineas, motivo); const n = { ...p }; for (const l of eliminadas) n[l] = base[l] ?? { incluida: false, valor: "" }; return n; }); setEliminadas(new Set()); setRevisado(null); }}>Restaurar {eliminadas.size} línea{eliminadas.size === 1 ? "" : "s"} eliminada{eliminadas.size === 1 ? "" : "s"}</button> : null}
                  <small className={estilos.hint}>Eliminar quita las líneas solo de esta nota; la factura original no se modifica. No se genera ninguna entrada de inventario.</small>
                </div>
                <div className={estilos.tabla}>
                  <table>
                    <thead>
                      <tr><th><input type="checkbox" aria-label="Seleccionar todos" checked={todasMarcadas} disabled={visibles.length === 0} onChange={() => setMarcadas(alternarTodas(factura.lineas, eliminadas, marcadas))} /></th><th>Producto</th><th>IVA</th><th className={estilos.num}>Factura original</th><th className={estilos.num}>Disponible</th><th className={estilos.num}>{esDevolucion ? "Cantidad a devolver" : "Monto a acreditar"}</th></tr>
                    </thead>
                    <tbody>
                      {visibles.length === 0 ? <tr><td colSpan={6} className={estilos.hint}>La nota no tiene líneas.</td></tr> : null}
                      {visibles.map((l) => {
                        const e = entradas[l.linea] ?? { incluida: false, valor: "" };
                        const errorCant = erroresCantidad.get(l.linea);
                        const abierta = abiertas.has(l.linea);

                        return (
                          <Fragment key={l.linea}>
                            <tr className={l.agotada ? estilos.agotada : undefined}>
                              <td><input type="checkbox" aria-label={`Seleccionar ítem ${l.linea}`} checked={marcadas.has(l.linea)} onChange={(ev) => setMarcadas(alternarLinea(marcadas, l.linea, ev.target.checked))} /></td>
                              <td>
                                {l.descripcion}{l.agotada ? <span className={estilos.chip}>Sin saldo</span> : null}
                                <div className={estilos.sub}>{l.codigoInterno} · ítem {l.linea} · <button type="button" className={estilos.linkBtn} aria-expanded={abierta} onClick={() => setAbiertas((p) => { const n = new Set(p); if (n.has(l.linea)) n.delete(l.linea); else n.add(l.linea); return n; })}>{abierta ? "Ocultar acreditado" : "Ver acreditado"}</button></div>
                              </td>
                              <td>{etiquetaIvaLinea(l.afectacion, l.tasa, l.proporcion)}</td>
                              <td className={estilos.num}>{fm(l.cantidad)} {l.unidad} × {fmv(l.precio, factura.moneda)}<div className={estilos.sub}>= {fmv(l.total, factura.moneda)}</div></td>
                              <td className={estilos.num}>{esDevolucion ? `${fm(l.cantidadDisponible)} ${l.unidad}` : fmv(l.saldoMonto, factura.moneda)}</td>
                              <td className={estilos.num}>
                                <input className={estilos.entrada} inputMode="decimal" aria-label={`${esDevolucion ? "Cantidad" : "Monto"} del ítem ${l.linea}`} disabled={l.agotada} aria-invalid={errorCant ? true : undefined} value={e.valor} placeholder={esDevolucion ? l.cantidadDisponible : l.saldoMonto}
                                  onChange={(ev) => setEntradas((p) => ({ ...p, [l.linea]: { ...e, incluida: ev.target.value.trim() !== "", valor: ev.target.value } }))} />
                                {errorCant ? <small className={estilos.errorCampo} role="alert">{errorCant}</small> : null}
                              </td>
                            </tr>
                            {abierta ? (
                              <tr className={estilos.detalleFila}>
                                <td />
                                <td colSpan={5}>
                                  <div className={estilos.detalleGrid}>
                                    <span>Cantidad acreditada: <b>{fm(l.cantidadAcreditada)}</b></span>
                                    <span>Monto acreditado: <b>{fmv(l.montoAcreditado, factura.moneda)}</b></span>
                                    <span>Saldo cantidad: <b>{fm(l.cantidadDisponible)}</b></span>
                                    <span>Saldo monto: <b>{fmv(l.saldoMonto, factura.moneda)}</b></span>
                                  </div>
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
            </div>

            <aside className={`${estilos.card} ${estilos.lateral} ${estilos.resumen}`} aria-label="Resumen de la nota">
              <h2>Resumen de la nota</h2>
              <dl>
                <div><dt>Tipo</dt><dd>NCE</dd></div>
                <div><dt>Factura original</dt><dd>{factura.numero}</dd></div>
                <div><dt>Motivo</dt><dd>{motivo === "" ? "—" : MOTIVOS[motivo]}</dd></div>
                <div><dt>Establecimiento / punto</dt><dd>{sucursal && punto ? `${sucursal.establecimiento}-${punto.codigo}` : "—"}</dd></div>
                <div><dt>Moneda</dt><dd>{factura.moneda}</dd></div>
                <div><dt>Líneas incluidas</dt><dd>{seleccionadas}</dd></div>
              </dl>
              <p className={estilos.pendiente}>Importes calculados al revisar: subtotal, IVA y total los determina el servidor.</p>
              <button type="button" className={ui.primaryButton} disabled={!listoParaRevisar || cargando} onClick={() => void revisar()}>{cargando ? "Revisando…" : "Revisar nota de crédito"}</button>
              {!listoParaRevisar && faltantes.length > 0 ? <ul className={estilos.faltan}>{faltantes.map((f) => <li key={f}>{f}</li>)}</ul> : null}
            </aside>
          </div>
        </>
      )}

      </div>

      {resumen ? (
        <div className={estilos.fondo} role="dialog" aria-modal="true" aria-label="Revisión de la nota de crédito">
          <div className={estilos.modal}>
            <header><h2>Revisar y emitir</h2></header>
            <div className={estilos.modalCuerpo}>
              <dl className={estilos.modalDatos}>
                <div><dt>Factura original</dt><dd>{resumen.factura.numero}</dd></div>
                <div><dt>Motivo</dt><dd>{resumen.motivo.nombre}</dd></div>
                <div><dt>Nota de crédito Nº</dt><dd>{resumen.numero}</dd></div>
                <div><dt>Punto</dt><dd>{resumen.punto}</dd></div>
                <div><dt>Moneda</dt><dd>{resumen.moneda}{resumen.cambio ? ` · cambio ${fm(resumen.cambio)}` : ""}</dd></div>
                <div style={{ gridColumn: "1 / -1" }}><dt>CDC de la factura</dt><dd className={estilos.mono}>{resumen.factura.cdc}</dd></div>
                {resumen.observacion ? <div style={{ gridColumn: "1 / -1" }}><dt>Observación</dt><dd>{resumen.observacion}</dd></div> : null}
              </dl>
              <div className={estilos.tabla}>
                <table>
                  <thead><tr><th>Ítem</th><th>Descripción</th><th>IVA</th><th className={estilos.num}>Cantidad</th><th className={estilos.num}>Precio</th><th className={estilos.num}>Monto</th></tr></thead>
                  <tbody>
                    {resumen.lineas.map((l) => <tr key={l.linea}><td>{l.linea}</td><td>{l.descripcion}<div className={estilos.sub}>{l.codigo}</div></td><td>{etiquetaIvaLinea(l.afectacion, l.tasa, l.proporcion)}</td><td className={estilos.num}>{fm(l.cantidad)}</td><td className={estilos.num}>{fmv(l.precioUnitario, resumen.moneda)}</td><td className={estilos.num}>{fmv(l.monto, resumen.moneda)}</td></tr>)}
                  </tbody>
                </table>
              </div>
              <dl className={estilos.totales}>
                <div><dt>Exento</dt><dd>{fmv(resumen.totales.exento, resumen.moneda)}</dd></div>
                <div><dt>Gravado 5%</dt><dd>{fmv(resumen.totales.gravado5, resumen.moneda)}</dd></div>
                <div><dt>Gravado 10%</dt><dd>{fmv(resumen.totales.gravado10, resumen.moneda)}</dd></div>
                <div><dt>IVA 5%</dt><dd>{fmv(resumen.totales.iva5, resumen.moneda)}</dd></div>
                <div><dt>IVA 10%</dt><dd>{fmv(resumen.totales.iva10, resumen.moneda)}</dd></div>
                <div><dt>Total IVA</dt><dd>{fmv(resumen.totales.totalIva, resumen.moneda)}</dd></div>
                <div className={estilos.totalNce}><dt>Total NCE</dt><dd>{fmv(resumen.totales.total, resumen.moneda)}</dd></div>
              </dl>
            </div>
            <div className={estilos.modalPie}>
              <p>Al emitir se reserva el número y se envía al gateway. El resultado fiscal se consulta automáticamente y se ve en Documentos electrónicos.</p>
              <div>
                <button type="button" className={ui.secondaryButton} disabled={enviando} onClick={() => setRevisado(null)}>Volver y editar</button>
                <button type="button" className={ui.primaryButton} disabled={enviando} onClick={() => void emitir()}>{enviando ? "Emitiendo…" : "Emitir nota de crédito"}</button>
              </div>
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
