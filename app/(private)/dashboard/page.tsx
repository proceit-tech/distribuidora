import Link from "next/link";

import styles from "./page.module.css";

type Kpi = {
  label: string;
  value: string;
  detail: string;
  trend?: string;
  tone: "teal" | "blue" | "amber" | "violet" | "red";
  href: string;
};

const kpis: Kpi[] = [
  {
    label: "Ventas de hoy",
    value: "Gs. 48.650.000",
    detail: "Facturación acumulada",
    trend: "+12,4%",
    tone: "teal",
    href: "/ventas",
  },
  {
    label: "Pedidos activos",
    value: "38",
    detail: "12 listos para despacho",
    tone: "blue",
    href: "/pedidos",
  },
  {
    label: "Por cobrar",
    value: "Gs. 86.420.000",
    detail: "Gs. 9.850.000 vencidos",
    tone: "amber",
    href: "/finanzas/cuentas-por-cobrar",
  },
  {
    label: "Entregas de hoy",
    value: "27 / 42",
    detail: "64% del recorrido completado",
    tone: "violet",
    href: "/entregas",
  },
  {
    label: "Stock crítico",
    value: "8",
    detail: "Productos para reponer",
    tone: "red",
    href: "/stock",
  },
];

const salesData = [
  { day: "Mié", value: 26 },
  { day: "Jue", value: 38 },
  { day: "Vie", value: 30 },
  { day: "Sáb", value: 46 },
  { day: "Lun", value: 42 },
  { day: "Mar", value: 54 },
  { day: "Hoy", value: 49 },
];

const alerts = [
  {
    title: "8 productos con stock bajo",
    detail: "Requieren reposición esta semana",
    tone: "warning",
    href: "/stock",
  },
  {
    title: "3 cobros vencidos",
    detail: "Total pendiente: Gs. 9.850.000",
    tone: "danger",
    href: "/finanzas/cuentas-por-cobrar",
  },
  {
    title: "2 entregas demoradas",
    detail: "Ruta 03 · Zona Central",
    tone: "info",
    href: "/entregas",
  },
];

const orders = [
  {
    number: "PED-002418",
    customer: "Supermercado Real S.A.",
    amount: "Gs. 6.850.000",
    status: "Preparando",
  },
  {
    number: "PED-002417",
    customer: "Comercial San Miguel",
    amount: "Gs. 4.320.000",
    status: "Pendiente",
  },
  {
    number: "PED-002416",
    customer: "Distribuidora La Familia",
    amount: "Gs. 8.970.000",
    status: "Despachado",
  },
  {
    number: "PED-002415",
    customer: "Mercado Norte S.R.L.",
    amount: "Gs. 3.740.000",
    status: "Preparando",
  },
];

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

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function statusClass(status: string) {
  if (status === "Despachado") {
    return styles.statusSuccess;
  }

  if (status === "Preparando") {
    return styles.statusInfo;
  }

  return styles.statusWarning;
}

export default function DashboardPage() {
  const maxSale = Math.max(
    ...salesData.map((item) => item.value),
  );

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <div className={styles.heroMeta}>
            <span className={styles.companyPill}>
              CASA MINGO S.A.
            </span>
            <span className={styles.demoPill}>
              DEMO
            </span>
          </div>

          <h1>Panel general</h1>

          <p>
            Visión ejecutiva de ventas, operación,
            cobranzas e inventario.
          </p>
        </div>

        <Link
          href="/facturas/nuevo"
          className={styles.primaryAction}
        >
          <PlusIcon />
          Emitir factura
        </Link>
      </header>

      <section className={styles.kpiGrid}>
        {kpis.map((kpi) => (
          <Link
            key={kpi.label}
            href={kpi.href}
            className={[
              styles.kpiCard,
              styles[
                `kpi${kpi.tone[0].toUpperCase()}${kpi.tone.slice(1)}`
              ],
            ].join(" ")}
          >
            <div className={styles.kpiTop}>
              <span>{kpi.label}</span>

              {kpi.trend ? (
                <strong className={styles.trend}>
                  {kpi.trend}
                </strong>
              ) : (
                <span className={styles.kpiArrow}>
                  <ArrowIcon />
                </span>
              )}
            </div>

            <strong className={styles.kpiValue}>
              {kpi.value}
            </strong>

            <small>{kpi.detail}</small>
          </Link>
        ))}
      </section>

      <section className={styles.contentGrid}>
        <article className={styles.mainPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.sectionLabel}>
                DESEMPEÑO COMERCIAL
              </span>
              <h2>Ventas de los últimos 7 días</h2>
            </div>

            <Link href="/reportes">
              Ver reporte
              <ArrowIcon />
            </Link>
          </div>

          <div className={styles.chartBody}>
            <div className={styles.chartScale}>
              <span>60M</span>
              <span>45M</span>
              <span>30M</span>
              <span>15M</span>
              <span>0</span>
            </div>

            <div className={styles.chartCanvas}>
              <div className={styles.horizontalLine} />
              <div className={styles.horizontalLine} />
              <div className={styles.horizontalLine} />
              <div className={styles.horizontalLine} />

              <div className={styles.bars}>
                {salesData.map((item) => {
                  const percentage =
                    (item.value / maxSale) * 100;

                  return (
                    <div
                      key={item.day}
                      className={styles.barColumn}
                    >
                      <div className={styles.barArea}>
                        <div
                          className={[
                            styles.bar,
                            item.day === "Mar"
                              ? styles.barActive
                              : "",
                          ].join(" ")}
                          style={{
                            height: `${percentage}%`,
                          }}
                        >
                          {item.day === "Mar" ? (
                            <span>54,2M</span>
                          ) : null}
                        </div>
                      </div>

                      <small>{item.day}</small>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
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
              3
            </strong>
          </div>

          <div className={styles.alertList}>
            {alerts.map((alert) => (
              <Link
                key={alert.title}
                href={alert.href}
                className={styles.alertRow}
              >
                <span
                  className={[
                    styles.alertDot,
                    styles[
                      `alert${alert.tone[0].toUpperCase()}${alert.tone.slice(1)}`
                    ],
                  ].join(" ")}
                />

                <span className={styles.alertText}>
                  <strong>{alert.title}</strong>
                  <small>{alert.detail}</small>
                </span>

                <ArrowIcon />
              </Link>
            ))}
          </div>
        </article>

        <article className={styles.ordersPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.sectionLabel}>
                ACTIVIDAD RECIENTE
              </span>
              <h2>Últimos pedidos</h2>
            </div>

            <Link href="/pedidos">
              Ver todos
              <ArrowIcon />
            </Link>
          </div>

          <div className={styles.ordersList}>
            {orders.map((order) => (
              <Link
                key={order.number}
                href="/pedidos"
                className={styles.orderRow}
              >
                <div>
                  <strong>{order.number}</strong>
                  <small>{order.customer}</small>
                </div>

                <strong className={styles.orderAmount}>
                  {order.amount}
                </strong>

                <span
                  className={[
                    styles.status,
                    statusClass(order.status),
                  ].join(" ")}
                >
                  {order.status}
                </span>
              </Link>
            ))}
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

          <div className={styles.stockBody}>
            <div className={styles.stockHeadline}>
              <strong>92%</strong>
              <span>Disponibilidad general</span>
            </div>

            <div className={styles.progress}>
              <span />
            </div>

            <div className={styles.stockStats}>
              <div>
                <span className={styles.stockDotAvailable} />
                <strong>1.248</strong>
                <small>Disponibles</small>
              </div>

              <div>
                <span className={styles.stockDotLow} />
                <strong>8</strong>
                <small>Stock bajo</small>
              </div>

              <div>
                <span className={styles.stockDotOut} />
                <strong>3</strong>
                <small>Sin stock</small>
              </div>
            </div>
          </div>
        </article>
      </section>
    </section>
  );
}
