"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import ui from "@/components/ui/lista-padrao/lista.module.css";
import { formatearDecimalTexto } from "@/lib/formato/decimal-texto";
import { formatearFechaPy } from "@/lib/formato/listas";
import { compararDecimal, puedeIntentarConfirmar, type BajaPendiente } from "@/lib/stock/bajas-pendientes";

type Respuesta = { bajas: BajaPendiente[]; permisos: { confirmar: boolean }; error?: string };
type EstadoFiltro = "PENDIENTE" | "CONFIRMADA" | "TODOS";

const fd = (t: string) => formatearDecimalTexto(t);

/**
 * PRO-354-R02 — Inventario › «Bajas pendientes de stock».
 * Faltantes de FE emitidas con la política «permitir facturar con stock insuficiente». Cada fila muestra lo facturado, lo ya descontado, lo pendiente, el saldo registrado y el saldo proyectado.
 * El proyectado es solo una lectura: si es negativo NO es saldo físico ni contable.
 * Confirmar es manual: la base verifica de nuevo saldo real suficiente, estado de la FE, lotes, permiso y alcance. Una respuesta tardía de un filtro anterior se descarta.
 */
export default function BajasPendientesPage() {
  const [estado, setEstado] = useState<EstadoFiltro>("PENDIENTE");
  const [buscar, setBuscar] = useState("");
  const [deposito, setDeposito] = useState("");
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [cargando, setCargando] = useState(true);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const version = useRef(0);

  const cargar = useCallback(async () => {
    const mia = ++version.current;

    setCargando(true);
    try {
      const q = new URLSearchParams({ estado, ...(deposito ? { deposito } : {}), ...(buscar.trim() ? { buscar: buscar.trim() } : {}) });
      const r = await fetch(`/api/stock/bajas-pendientes?${q.toString()}`, { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as Respuesta;

      if (mia !== version.current) return;
      if (!r.ok) throw new Error(j.error ?? "No fue posible cargar las bajas pendientes.");
      setDatos(j);
      setError("");
    } catch (e) {
      if (mia !== version.current) return;
      setDatos(null);
      setError(e instanceof Error ? e.message : "No fue posible cargar las bajas pendientes.");
    } finally {
      if (mia === version.current) setCargando(false);
    }
  }, [estado, deposito, buscar]);

  useEffect(() => {
    const t = setTimeout(() => void cargar(), 250);

    return () => clearTimeout(t);
  }, [cargar]);

  async function confirmar(b: BajaPendiente) {
    if (confirmando) return;
    if (!window.confirm(`¿Confirmar la baja de ${fd(b.pendiente)} de ${b.productoCodigo} en ${b.depositoCodigo} ${b.depositoNombre} (factura ${b.documento})? Se registrará una salida de stock.`)) return;
    setConfirmando(b.id);
    setAviso("");
    setError("");
    try {
      const r = await fetch(`/api/stock/bajas-pendientes/${b.id}/confirmar`, { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { numero?: string; repetido?: boolean; error?: string };

      if (!r.ok) throw new Error(j.error ?? "No fue posible confirmar la baja pendiente.");
      setAviso(j.repetido ? `La baja ya estaba confirmada (movimiento ${j.numero}).` : `Baja confirmada: movimiento ${j.numero}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No fue posible confirmar la baja pendiente.");
    } finally {
      setConfirmando(null);
      await cargar();
    }
  }

  const bajas = datos?.bajas ?? [];
  const depositos = [...new Map(bajas.map((b) => [b.depositoId, `${b.depositoCodigo} ${b.depositoNombre}`] as const)).entries()];
  const abiertas = bajas.filter((b) => b.estado === "PENDIENTE").length;

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

      {error ? <p className={ui.alertError} role="alert" style={{ margin: "0 0 8px" }}>{error}</p> : null}
      {aviso ? <p className={ui.resultCount} role="status" style={{ margin: "0 0 8px" }}>{aviso}</p> : null}

      <section className={ui.contentCard}>
        <div className={[ui.toolbar, ui.toolbarDensa].join(" ")}>
          <label className={ui.search}>
            <span aria-hidden="true">⌕</span>
            <input value={buscar} onChange={(e) => setBuscar(e.target.value.slice(0, 80))} placeholder="Buscar por producto o número de factura…" aria-label="Buscar bajas pendientes" />
          </label>
          <label className={ui.filterField}>
            <span>Estado</span>
            <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoFiltro)}>
              <option value="PENDIENTE">Pendientes</option>
              <option value="CONFIRMADA">Confirmadas</option>
              <option value="TODOS">Todas</option>
            </select>
          </label>
          <label className={ui.filterField}>
            <span>Depósito</span>
            <select value={deposito} onChange={(e) => setDeposito(e.target.value)}>
              <option value="">Todos</option>
              {depositos.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
            </select>
          </label>
          <div className={ui.toolbarEnd}>
            <span className={ui.resultCount} aria-live="polite">{cargando ? "Cargando…" : `${bajas.length} registros · ${abiertas} pendientes`}</span>
          </div>
        </div>

        <div className={ui.tableScroll}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Factura</th>
                <th>Producto</th>
                <th>Depósito</th>
                <th className={ui.numeric}>Facturado</th>
                <th className={ui.numeric}>Descontado</th>
                <th className={ui.numeric}>Pendiente</th>
                <th className={ui.numeric}>Saldo registrado</th>
                <th className={ui.numeric}>Saldo proyectado</th>
                <th>Estado</th>
                <th className={ui.numeric}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {bajas.length === 0 ? (
                <tr><td colSpan={10} className={ui.emptyCell}><div className={ui.empty}>{cargando ? "Cargando…" : "No hay bajas pendientes con estos filtros."}</div></td></tr>
              ) : bajas.map((b) => {
                const c = puedeIntentarConfirmar(b, datos?.permisos.confirmar === true);
                const negativo = compararDecimal(b.saldoProyectado, "0") < 0;

                return (
                  <tr key={b.id} className={ui.row}>
                    <td className={ui.cell}><span className={ui.code}>{b.documento}</span><small>{b.fechaEmision ? formatearFechaPy(b.fechaEmision) : ""} · {b.estadoSifen}</small></td>
                    <td className={ui.cell}><strong>{b.productoDescripcion}</strong><small className={ui.code}>{b.productoCodigo}</small></td>
                    <td className={ui.cell}>{b.depositoCodigo} {b.depositoNombre}</td>
                    <td className={ui.numeric}>{fd(b.facturado)}</td>
                    <td className={ui.numeric}>{fd(b.descontado)}</td>
                    <td className={ui.numeric}><strong>{fd(b.pendiente)}</strong></td>
                    <td className={ui.numeric}>{fd(b.saldoRegistrado)}</td>
                    <td className={ui.numeric} title="Informativo: saldo registrado menos todos los pendientes abiertos del producto en este depósito.">
                      {negativo ? <span className={ui.statusWarning}>{fd(b.saldoProyectado)}</span> : fd(b.saldoProyectado)}
                    </td>
                    <td className={ui.cell}>
                      {b.estado === "PENDIENTE" ? <span className={ui.statusWarning}>Pendiente</span> : <span className={ui.statusInfo}>Confirmada</span>}
                      {b.estado === "CONFIRMADA" ? <small>{b.confirmadoAt ? formatearFechaPy(b.confirmadoAt) : ""}{b.confirmadoPor ? ` · ${b.confirmadoPor}` : ""}{b.movimientoNumero ? ` · Mov. ${b.movimientoNumero}` : ""}</small> : null}
                    </td>
                    <td className={ui.numeric}>
                      {b.estado === "PENDIENTE" ? (
                        <button type="button" className={ui.secondaryButton} disabled={!c.puede || confirmando !== null} title={c.motivo || undefined} onClick={() => void confirmar(b)}>
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
      </section>
    </section>
  );
}
