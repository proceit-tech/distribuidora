"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { cargarDashboard } from "@/lib/dashboard/cliente-api";
import type { DashboardPeriodo, DashboardRespuesta } from "@/types/dashboard";

import styles from "./page.module.css";

const PERIODOS: { clave: DashboardPeriodo; etiqueta: string; titulo: string }[] = [
  { clave: "7d", etiqueta: "Últimos 7 días", titulo: "los últimos 7 días" },
  { clave: "15d", etiqueta: "Últimos 15 días", titulo: "los últimos 15 días" },
  { clave: "30d", etiqueta: "Últimos 30 días", titulo: "los últimos 30 días" },
  { clave: "90d", etiqueta: "Últimos 90 días (por semana)", titulo: "los últimos 90 días, por semana" },
];

const TIPOS: Record<string, { texto: string; clase: "statusSuccess" | "statusInfo" | "statusWarning" }> = {
  ENTRADA: { texto: "Entrada", clase: "statusSuccess" },
  AJUSTE_POSITIVO: { texto: "Ajuste +", clase: "statusSuccess" },
  SALIDA: { texto: "Salida", clase: "statusWarning" },
  AJUSTE_NEGATIVO: { texto: "Ajuste −", clase: "statusWarning" },
  TRANSFERENCIA: { texto: "Transferencia", clase: "statusInfo" },
  RESERVA: { texto: "Reserva", clase: "statusInfo" },
  LIBERACION_RESERVA: { texto: "Liberación", clase: "statusInfo" },
  CUARENTENA: { texto: "Cuarentena", clase: "statusInfo" },
  LIBERACION_CUARENTENA: { texto: "Lib. cuarentena", clase: "statusInfo" },
};

const num = (v: number) => new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 }).format(v);
const compacto = (v: number) => new Intl.NumberFormat("es-PY", { notation: "compact", maximumFractionDigits: 1 }).format(v);

function money(v: number, moneda: string) {
  return `${moneda === "PYG" ? "Gs." : moneda} ${new Intl.NumberFormat("es-PY", { maximumFractionDigits: moneda === "PYG" ? 0 : 2 }).format(v)}`;
}

// Escala "redonda" para el eje del gráfico (1, 2, 5 × 10^n).
function escala(max: number) {
  if (max <= 0) return 4;
  const e = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
}

type Tarjeta = {
  label: string;
  value: string;
  detail: string;
  tone: "teal" | "blue" | "amber" | "violet" | "red";
  href: string;
  habilitada: boolean;
};

function armarTarjetas(d: DashboardRespuesta | null): Tarjeta[] {
  const sin = "Sin permiso de acceso";
  const k = d?.kpis;
  return [
    {
      label: "Productos activos", tone: "teal", href: "/productos", habilitada: !!k?.productos,
      value: k?.productos ? num(k.productos.activos) : "—",
      detail: k?.productos ? `${num(k.productos.controlanStock)} controlan stock` : d ? sin : "Cargando...",
    },
    {
      label: "Clientes activos", tone: "blue", href: "/clientes", habilitada: !!k?.clientes,
      value: k?.clientes ? num(k.clientes.activos) : "—",
      detail: k?.clientes ? "Registrados en la empresa" : d ? sin : "Cargando...",
    },
    {
      label: "Valor de inventario", tone: "amber", href: "/stock", habilitada: !!k?.inventario,
      value: k?.inventario ? money(k.inventario.valor, d!.empresa.moneda) : "—",
      detail: k?.inventario ? `Costo promedio · ${num(k.inventario.productosValorizados)} productos valorizados` : d ? sin : "Cargando...",
    },
    {
      label: "Movimientos del período", tone: "violet", href: "/movimientos", habilitada: !!k?.movimientos,
      value: k?.movimientos ? num(k.movimientos.total) : "—",
      detail: k?.movimientos ? `${num(k.movimientos.entradas)} u. entradas · ${num(k.movimientos.salidas)} u. salidas` : d ? sin : "Cargando...",
    },
    {
      label: "Stock crítico", tone: "red", href: "/stock", habilitada: !!k?.stockCritico,
      value: k?.stockCritico ? num(k.stockCritico.bajo + k.stockCritico.sin) : "—",
      detail: k?.stockCritico ? `${num(k.stockCritico.sin)} sin stock · ${num(k.stockCritico.bajo)} bajo el mínimo` : d ? sin : "Cargando...",
    },
  ];
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export default function DashboardPage() {
  const [periodo, setPeriodo] = useState<DashboardPeriodo>("7d");
  const [depositoId, setDepositoId] = useState("");
  const [datos, setDatos] = useState<DashboardRespuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError("");

    cargarDashboard(periodo, depositoId)
      .then((r) => {
        if (activo) setDatos(r);
      })
      .catch((e: unknown) => {
        if (activo) setError(e instanceof Error ? e.message : "No fue posible cargar el panel.");
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, [periodo, depositoId, recarga]);

  const tarjetas = armarTarjetas(datos);
  const periodoInfo = PERIODOS.find((p) => p.clave === periodo)!;
  const serie = datos?.serie ?? null;
  const maxValor = serie ? Math.max(0, ...serie.flatMap((x) => [x.entradas, x.salidas])) : 0;
  const tope = escala(maxValor);
  const hayMovimientos = maxValor > 0;
  const idxMax = serie && hayMovimientos ? serie.reduce((m, x, i) => (x.entradas > serie[m].entradas ? i : m), 0) : -1;
  const alertas = datos?.alertas ?? null;

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <div className={styles.heroMeta}>
            <span className={styles.companyPill}>
              {(datos?.empresa.nombre ?? "EMPRESA").toUpperCase()}
            </span>
          </div>

          <h1>Panel general</h1>

          <p>
            Visión ejecutiva de inventario, movimientos y
            maestros de la empresa.
          </p>
        </div>
      </header>

      <section className={styles.filters}>
        <label>
          <span>Período</span>
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value as DashboardPeriodo)}
          >
            {PERIODOS.map((p) => (
              <option key={p.clave} value={p.clave}>
                {p.etiqueta}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Depósito</span>
          <select
            value={depositoId}
            onChange={(e) => setDepositoId(e.target.value)}
          >
            <option value="">Todos los depósitos</option>
            {(datos?.filtros.depositos ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className={styles.refresh}
          onClick={() => setRecarga((n) => n + 1)}
          disabled={cargando}
        >
          {cargando ? "Actualizando..." : "Actualizar"}
        </button>

        {error ? <p className={styles.filterError}>{error}</p> : null}
      </section>

      <section className={styles.kpiGrid}>
        {tarjetas.map((kpi) => {
          const clases = [
            styles.kpiCard,
            styles[`kpi${kpi.tone[0].toUpperCase()}${kpi.tone.slice(1)}`],
          ].join(" ");

          const contenido = (
            <>
              <div className={styles.kpiTop}>
                <span>{kpi.label}</span>
                <span className={styles.kpiArrow}>
                  <ArrowIcon />
                </span>
              </div>

              <strong className={styles.kpiValue}>{kpi.value}</strong>

              <small>{kpi.detail}</small>
            </>
          );

          return kpi.habilitada ? (
            <Link key={kpi.label} href={kpi.href} className={clases}>
              {contenido}
            </Link>
          ) : (
            <div key={kpi.label} className={clases}>
              {contenido}
            </div>
          );
        })}
      </section>

      <section className={styles.contentGrid}>
        <article className={styles.mainPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.sectionLabel}>
                MOVIMIENTOS DE INVENTARIO
              </span>
              <h2>Entradas y salidas de {periodoInfo.titulo}</h2>
            </div>

            <Link href="/movimientos">
              Ver movimientos
              <ArrowIcon />
            </Link>
          </div>

          {serie && hayMovimientos ? (
            <>
              <div className={styles.chartBody}>
                <div className={styles.chartScale}>
                  {[1, 0.75, 0.5, 0.25, 0].map((f) => (
                    <span key={f}>{f === 0 ? "0" : compacto(tope * f)}</span>
                  ))}
                </div>

                <div className={styles.chartCanvas}>
                  <div className={styles.horizontalLine} />
                  <div className={styles.horizontalLine} />
                  <div className={styles.horizontalLine} />
                  <div className={styles.horizontalLine} />

                  <div
                    className={styles.bars}
                    style={{ gridTemplateColumns: `repeat(${serie.length}, minmax(0, 1fr))`, gap: serie.length > 15 ? 3 : 9 }}
                  >
                    {serie.map((item, i) => (
                      <div key={item.desde} className={styles.barColumn} title={`${item.etiqueta}: ${num(item.entradas)} entradas · ${num(item.salidas)} salidas`}>
                        <div className={styles.barArea}>
                          <div
                            className={[styles.bar, i === idxMax ? styles.barActive : ""].join(" ")}
                            style={{ height: `${(item.entradas / tope) * 100}%`, width: "min(14px, 45%)" }}
                          >
                            {i === idxMax ? <span>{compacto(item.entradas)}</span> : null}
                          </div>
                          <div
                            className={[styles.bar, styles.barSalida].join(" ")}
                            style={{ height: `${(item.salidas / tope) * 100}%`, width: "min(14px, 45%)" }}
                          />
                        </div>

                        <small>{serie.length > 15 && i % 3 !== 0 ? "" : item.etiqueta}</small>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className={styles.legend}>
                <span><i className={styles.legendEntrada} /> Entradas (unidades)</span>
                <span><i className={styles.legendSalida} /> Salidas (unidades)</span>
              </div>
            </>
          ) : (
            <div className={styles.emptyState}>
              <strong>
                {cargando
                  ? "Cargando movimientos..."
                  : !datos
                    ? "No fue posible cargar los movimientos."
                    : serie
                      ? "Sin entradas ni salidas en el período."
                      : "No tiene permiso para ver los movimientos."}
              </strong>
              {serie && !cargando ? <span>Los movimientos registrados en Movimientos aparecerán aquí.</span> : null}
            </div>
          )}
        </article>

        <article className={styles.alertPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.sectionLabel}>
                ATENCIÓN REQUERIDA
              </span>
              <h2>Alertas operativas</h2>
            </div>

            <strong className={styles.alertTotal}>
              {alertas ? alertas.length : 0}
            </strong>
          </div>

          <div className={styles.alertList}>
            {alertas && alertas.length > 0 ? (
              alertas.map((alert) => (
                <Link key={alert.clave} href={alert.href} className={styles.alertRow}>
                  <span
                    className={[
                      styles.alertDot,
                      styles[`alert${alert.tono[0].toUpperCase()}${alert.tono.slice(1)}`],
                    ].join(" ")}
                  />

                  <span className={styles.alertText}>
                    <strong>{alert.titulo}</strong>
                    <small>{alert.detalle}</small>
                  </span>

                  <ArrowIcon />
                </Link>
              ))
            ) : (
              <div className={styles.emptyState}>
                <strong>
                  {cargando
                    ? "Cargando alertas..."
                    : !datos
                      ? "No fue posible cargar las alertas."
                      : alertas
                        ? "Sin alertas operativas."
                        : "No tiene permiso para ver las alertas de inventario."}
                </strong>
              </div>
            )}
          </div>
        </article>

        <article className={styles.ordersPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.sectionLabel}>
                ACTIVIDAD RECIENTE
              </span>
              <h2>Últimos movimientos</h2>
            </div>

            <Link href="/movimientos">
              Ver todos
              <ArrowIcon />
            </Link>
          </div>

          <div className={styles.ordersList}>
            {datos?.ultimos && datos.ultimos.length > 0 ? (
              datos.ultimos.map((m) => {
                const tipo = TIPOS[m.tipo] ?? { texto: m.tipo, clase: "statusInfo" as const };

                return (
                  <Link key={m.id} href={`/movimientos/${m.id}`} className={styles.orderRow}>
                    <div>
                      <strong>{m.numero}</strong>
                      <small>
                        {m.producto} · {m.depositos} · {m.fecha} {m.hora}
                      </small>
                    </div>

                    <strong className={styles.orderAmount}>{num(m.cantidad)} u.</strong>

                    <span className={[styles.status, styles[tipo.clase]].join(" ")}>
                      {tipo.texto}
                    </span>
                  </Link>
                );
              })
            ) : (
              <div className={styles.emptyState}>
                <strong>
                  {cargando
                    ? "Cargando movimientos..."
                    : !datos
                      ? "No fue posible cargar los movimientos."
                      : datos.ultimos
                        ? "Aún no hay movimientos registrados."
                        : "No tiene permiso para ver los movimientos."}
                </strong>
              </div>
            )}
          </div>
        </article>

        <article className={styles.stockPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.sectionLabel}>
                INVENTARIO
              </span>
              <h2>Disponibilidad de stock</h2>
            </div>

            <Link href="/stock">
              Ver inventario
              <ArrowIcon />
            </Link>
          </div>

          {datos?.stock && datos.stock.controlados > 0 ? (
            <div className={styles.stockBody}>
              <div className={styles.stockHeadline}>
                <strong>{datos.stock.disponibilidad}%</strong>
                <span>Productos con stock disponible</span>
              </div>

              <div className={styles.progress}>
                <span style={{ width: `${datos.stock.disponibilidad}%` }} />
              </div>

              <div className={styles.stockStats}>
                <div>
                  <span className={styles.stockDotAvailable} />
                  <strong>{num(datos.stock.disponibles)}</strong>
                  <small>Disponibles</small>
                </div>

                <div>
                  <span className={styles.stockDotLow} />
                  <strong>{num(datos.stock.bajo)}</strong>
                  <small>Stock bajo</small>
                </div>

                <div>
                  <span className={styles.stockDotOut} />
                  <strong>{num(datos.stock.sin)}</strong>
                  <small>Sin stock</small>
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <strong>
                {cargando
                  ? "Cargando stock..."
                  : !datos
                    ? "No fue posible cargar el stock."
                    : datos.stock
                      ? "No hay productos que controlen stock."
                      : "No tiene permiso para ver el stock."}
              </strong>
            </div>
          )}
        </article>
      </section>
    </section>
  );
}
