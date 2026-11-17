"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ui from "@/components/ui/lista-padrao/lista.module.css";
import { formatearDecimalTexto } from "@/lib/formato/decimal-texto";
import { formatearFechaPy } from "@/lib/formato/listas";
import {
  compararDecimal, consultaBajas, crearContextoBajas, puedeIntentarConfirmar, rangoPaginaBajas, resultadoConfirmacion, TAMANOS_PAGINA_BAJAS,
  type BajaPendiente, type CatalogoFiltrosBajas, type ResultadoConfirmacion, type TicketBajas,
} from "@/lib/stock/bajas-pendientes";

type Respuesta = {
  bajas: BajaPendiente[]; total: number; pagina: number; porPagina: number; filtros: CatalogoFiltrosBajas; permisos: { confirmar: boolean }; error?: string;
};
/** Datos SIEMPRE junto a la consulta que los produjo: si no es la vigente, no se muestran ni se accionan. */
type Datos = Respuesta & { clave: string };
type EstadoFiltro = "PENDIENTE" | "CONFIRMADA" | "TODOS";

const fd = (t: string) => formatearDecimalTexto(t);
const CATALOGO_VACIO: CatalogoFiltrosBajas = { sucursales: [], depositos: [] };

/**
 * PRO-354-R02 — Inventario › «Bajas pendientes de stock».
 * Faltantes de FE emitidas con la política «permitir facturar con stock insuficiente». Cada fila muestra lo facturado, lo descontado, el faltante original,
 * lo pendiente hoy, el saldo registrado y el saldo proyectado (solo una lectura: si es negativo NO es saldo físico ni contable).
 * Confirmar es manual: la base verifica de nuevo saldo real suficiente, estado de la FE, unidad, sucursal, depósito, lotes, permiso y alcance.
 * R01/F002: paginado con total, filtros de sucursal y depósito desde un catálogo propio, referencia fiscal con serie.
 * R01/F003: la generación de contexto cambia en cuanto cambian los filtros; las filas de otro contexto no se muestran ni se accionan; tras confirmar se relee con los filtros vigentes.
 * R02-R02/F003-R: el error de CARGA del listado y el resultado de una CONFIRMACIÓN son estados distintos. Una lectura exitosa solo limpia el error de carga;
 * el resultado de la confirmación (identificado por la factura) se conserva hasta «Cerrar» o hasta iniciar otra confirmación.
 */
export default function BajasPendientesPage() {
  const [estado, setEstado] = useState<EstadoFiltro>("PENDIENTE");
  const [buscar, setBuscar] = useState("");
  const [sucursal, setSucursal] = useState("");
  const [deposito, setDeposito] = useState("");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState<number>(TAMANOS_PAGINA_BAJAS[0]);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [catalogo, setCatalogo] = useState<CatalogoFiltrosBajas>(CATALOGO_VACIO);
  const [errorListado, setErrorListado] = useState("");
  const [resultado, setResultado] = useState<ResultadoConfirmacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const contexto = useRef(crearContextoBajas());

  const consulta = useMemo(() => consultaBajas({ estado, sucursal, deposito, buscar, pagina, porPagina }), [estado, sucursal, deposito, buscar, pagina, porPagina]);

  /** Lee la consulta del ticket; aplica la respuesta SOLO si el ticket sigue vigente (generación y consulta). */
  const leer = useCallback(async (ticket: TicketBajas) => {
    setCargando(true);
    try {
      const r = await fetch(`/api/stock/bajas-pendientes?${ticket.clave}`, { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as Respuesta;

      if (!contexto.current.vigente(ticket)) return;
      if (!r.ok) throw new Error(j.error ?? "No fue posible cargar las bajas pendientes.");
      // Una página más allá del final (p. ej. tras confirmar la última fila de la última página): se vuelve a la primera.
      if (j.bajas.length === 0 && j.pagina > 1) {
        setPagina(1);
        return;
      }
      setDatos({ ...j, clave: ticket.clave });
      setCatalogo(j.filtros ?? CATALOGO_VACIO);
      // Solo el error de CARGA; el resultado de una confirmación no se toca.
      setErrorListado("");
    } catch (e) {
      if (!contexto.current.vigente(ticket)) return;
      setDatos(null);
      setErrorListado(e instanceof Error ? e.message : "No fue posible cargar las bajas pendientes.");
    } finally {
      if (contexto.current.vigente(ticket)) setCargando(false);
    }
  }, []);

  // El contexto cambia YA (invalida respuestas en vuelo y oculta las filas anteriores); solo la lectura espera el retardo de la búsqueda.
  useEffect(() => {
    const ticket = contexto.current.cambiar(consulta);

    setCargando(true);
    const t = setTimeout(() => void leer(ticket), 250);

    return () => clearTimeout(t);
  }, [consulta, leer]);

  const vigentes = datos !== null && datos.clave === consulta;
  const bajas = vigentes ? datos.bajas : [];
  const depositosVisibles = catalogo.depositos.filter((d) => !sucursal || d.sucursalId === sucursal);

  function cambiarFiltro(aplicar: () => void) {
    aplicar();
    setPagina(1);
    // R02-R02/F003-R: cambiar filtros NO borra el resultado de una confirmación (está identificado por su factura).
  }

  async function confirmar(b: BajaPendiente) {
    // Solo filas del contexto vigente y ya cargado.
    if (confirmando || !vigentes || cargando) return;
    if (!window.confirm(`¿Confirmar la baja de ${fd(b.pendienteActual)} ${b.unidad} de ${b.productoCodigo} en ${b.depositoCodigo} ${b.depositoNombre} (factura ${b.documento})? Se registrará una salida de stock.`)) return;
    setConfirmando(b.id);
    // Iniciar otra confirmación reemplaza el resultado anterior (el error de carga del listado no se toca).
    setResultado(null);
    try {
      const r = await fetch(`/api/stock/bajas-pendientes/${b.id}/confirmar`, { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { numero?: string; repetido?: boolean; error?: string };

      setResultado(resultadoConfirmacion(b, r.ok, j));
    } catch (e) {
      setResultado(resultadoConfirmacion(b, false, { error: e instanceof Error ? e.message : undefined }));
    } finally {
      setConfirmando(null);
      // Relectura con los filtros VIGENTES (los de la ref de contexto), no con los del render en que se pulsó el botón.
      void leer(contexto.current.releer());
    }
  }

  const total = vigentes ? datos.total : 0;
  const paginas = Math.max(1, Math.ceil(total / porPagina));

  return (
    <section className={ui.page}>
      <header className={ui.topbar}>
        <div className={ui.titleBlock}>
          <nav className={ui.breadcrumb} aria-label="Ruta de navegación">
            <span>Inventario</span>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Bajas pendientes de stock</span>
          </nav>
          <h1>Bajas pendientes de stock</h1>
        </div>
        <div className={ui.actionsGroup}>
          <Link href="/stock" className={ui.secondaryButton}>Stock</Link>
        </div>
      </header>

      <p className={ui.resultCount} role="note" style={{ margin: "0 0 8px" }}>
        Faltantes de facturas emitidas con stock insuficiente: al emitir se descontó solo lo disponible. Confirme la baja cuando haya stock disponible en el depósito.
        El saldo proyectado es informativo: un valor negativo no es stock físico ni contable.
      </p>

      {resultado ? (
        <div className={resultado.tipo === "ERROR" ? ui.alertError : ui.resultCount} role={resultado.tipo === "ERROR" ? "alert" : "status"} style={{ margin: "0 0 8px", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ flex: 1 }}>{resultado.texto}</span>
          <button type="button" className={ui.secondaryButton} onClick={() => setResultado(null)} aria-label={`Cerrar el resultado de la factura ${resultado.documento}`}>Cerrar</button>
        </div>
      ) : null}
      {errorListado ? <p className={ui.alertError} role="alert" style={{ margin: "0 0 8px" }}>{errorListado}</p> : null}

      <section className={ui.contentCard}>
        <div className={[ui.toolbar, ui.toolbarDensa].join(" ")}>
          <label className={ui.search}>
            <span aria-hidden="true">⌕</span>
            <input value={buscar} onChange={(e) => { const v = e.target.value.slice(0, 80); cambiarFiltro(() => setBuscar(v)); }}
              placeholder="Buscar por producto, factura o serie…" aria-label="Buscar bajas pendientes" />
          </label>
          <label className={ui.filterField}>
            <span>Estado</span>
            <select value={estado} onChange={(e) => { const v = e.target.value as EstadoFiltro; cambiarFiltro(() => setEstado(v)); }}>
              <option value="PENDIENTE">Pendientes</option>
              <option value="CONFIRMADA">Confirmadas</option>
              <option value="TODOS">Todas</option>
            </select>
          </label>
          <label className={ui.filterField}>
            <span>Sucursal</span>
            <select value={sucursal} onChange={(e) => {
              const v = e.target.value;
              cambiarFiltro(() => {
                setSucursal(v);
                // Un depósito de otra sucursal deja de ser un filtro válido.
                if (deposito && v && !catalogo.depositos.some((d) => d.id === deposito && d.sucursalId === v)) setDeposito("");
              });
            }}>
              <option value="">Todas</option>
              {catalogo.sucursales.map((s) => <option key={s.id} value={s.id}>{s.codigo} {s.nombre}</option>)}
            </select>
          </label>
          <label className={ui.filterField}>
            <span>Depósito</span>
            <select value={deposito} onChange={(e) => { const v = e.target.value; cambiarFiltro(() => setDeposito(v)); }}>
              <option value="">Todos</option>
              {depositosVisibles.map((d) => <option key={d.id} value={d.id}>{d.codigo} {d.nombre}{d.activo ? "" : " (inactivo)"}</option>)}
            </select>
          </label>
          <div className={ui.toolbarEnd}>
            <span className={ui.resultCount} aria-live="polite">{cargando || !vigentes ? "Cargando…" : rangoPaginaBajas(total, pagina, porPagina, bajas.length)}</span>
          </div>
        </div>

        <div className={ui.tableScroll} aria-busy={cargando || !vigentes}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Factura</th>
                <th>Producto</th>
                <th>Sucursal / depósito</th>
                <th className={ui.numeric}>Facturado</th>
                <th className={ui.numeric} title="Total descontado del stock: al emitir y, si se confirmó, también el faltante.">Descontado</th>
                <th className={ui.numeric} title="Faltante registrado al emitir la factura (no cambia).">Faltante original</th>
                <th className={ui.numeric} title="Lo que queda por descontar hoy (cero si ya se confirmó).">Pendiente actual</th>
                <th className={ui.numeric}>Saldo registrado</th>
                <th className={ui.numeric}>Saldo proyectado</th>
                <th>Estado</th>
                <th className={ui.numeric}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {bajas.length === 0 ? (
                <tr><td colSpan={11} className={ui.emptyCell}><div className={ui.empty}>{cargando || !vigentes ? "Cargando…" : "No hay bajas pendientes con estos filtros."}</div></td></tr>
              ) : bajas.map((b) => {
                const c = puedeIntentarConfirmar(b, datos?.permisos.confirmar === true);
                const negativo = compararDecimal(b.saldoProyectado, "0") < 0;
                const descontadoDistinto = compararDecimal(b.descontadoTotal, b.descontadoEmision) !== 0;

                return (
                  <tr key={b.id} className={ui.row}>
                    <td className={ui.cell}><span className={ui.code}>{b.documento}</span><small>{b.fechaEmision ? formatearFechaPy(b.fechaEmision) : ""} · {b.estadoSifen}</small></td>
                    <td className={ui.cell}><strong>{b.productoDescripcion}</strong><small><span className={ui.code}>{b.productoCodigo}</span>{b.unidad ? ` · ${b.unidad}` : ""}</small></td>
                    <td className={ui.cell}>{b.depositoCodigo} {b.depositoNombre}<small>{b.sucursalNombre}</small></td>
                    <td className={ui.numeric}>{fd(b.facturado)}</td>
                    <td className={ui.numeric}>{fd(b.descontadoTotal)}{descontadoDistinto ? <small>al emitir {fd(b.descontadoEmision)}</small> : null}</td>
                    <td className={ui.numeric}>{fd(b.faltanteOriginal)}</td>
                    <td className={ui.numeric}><strong>{fd(b.pendienteActual)}</strong></td>
                    <td className={ui.numeric}>{fd(b.saldoRegistrado)}</td>
                    <td className={ui.numeric} title="Informativo, por producto y depósito: saldo registrado menos todos los pendientes abiertos. Se repite en cada fila del mismo par; no se suma.">
                      {negativo ? <span className={ui.statusWarning}>{fd(b.saldoProyectado)}</span> : fd(b.saldoProyectado)}
                    </td>
                    <td className={ui.cell}>
                      {b.estado === "PENDIENTE" ? <span className={ui.statusWarning}>Pendiente</span> : <span className={ui.statusInfo}>Confirmada</span>}
                      {b.estado === "CONFIRMADA" ? <small>{b.confirmadoAt ? formatearFechaPy(b.confirmadoAt) : ""}{b.confirmadoPor ? ` · ${b.confirmadoPor}` : ""}{b.movimientoNumero ? ` · Mov. ${b.movimientoNumero}` : ""}</small> : null}
                    </td>
                    <td className={ui.numeric}>
                      {b.estado === "PENDIENTE" ? (
                        <button type="button" className={ui.secondaryButton} disabled={!c.puede || confirmando !== null || cargando || !vigentes} title={c.motivo || undefined} onClick={() => void confirmar(b)}>
                          {confirmando === b.id ? "Confirmando…" : "Confirmar baja"}
                        </button>
                      ) : null}
                      {b.estado === "PENDIENTE" && !c.puede ? <small>{c.motivo}</small> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className={[ui.toolbar, ui.toolbarDensa].join(" ")}>
          <label className={ui.filterField}>
            <span>Por página</span>
            <select value={porPagina} onChange={(e) => { const v = Number(e.target.value); cambiarFiltro(() => setPorPagina(v)); }}>
              {TAMANOS_PAGINA_BAJAS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className={ui.toolbarEnd}>
            <button type="button" className={ui.secondaryButton} disabled={pagina <= 1 || cargando || !vigentes} onClick={() => setPagina((p) => Math.max(1, p - 1))}>Anterior</button>
            <span className={ui.resultCount}>Página {pagina} de {paginas}</span>
            <button type="button" className={ui.secondaryButton} disabled={pagina >= paginas || cargando || !vigentes} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
          </div>
        </div>
      </section>
    </section>
  );
}
