import Link from "next/link";

import styles from "./page.module.css";

const REPORTES = [
  { href: "/reportes/stock-general", titulo: "Stock general", detalle: "Saldos por producto, depósito y lote: disponible, reservado, cuarentena, tránsito, físico y virtual.", activo: true },
  { href: "/reportes/valorizacion", titulo: "Valorización de inventario", detalle: "Costo promedio real y valor de inventario por producto y depósito.", activo: true },
  { href: "/reportes/kardex", titulo: "Kardex de movimientos", detalle: "Entradas, salidas, transferencias, reservas y anulaciones con saldo acumulado por producto, depósito y lote.", activo: true },
  { href: "/reportes/stock-critico", titulo: "Stock crítico y reposición", detalle: "Productos sin stock o bajo el mínimo y cantidad sugerida a reponer.", activo: true },
  { href: "", titulo: "Lotes y vencimientos", detalle: "Lotes vencidos, próximos a vencer y vigentes.", activo: false },
];

export default function ReportesPage() {
  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <div className={styles.heroMeta}>
            <span className={styles.modulePill}>REPORTES</span>
          </div>
          <h1>Reportes operativos</h1>
          <p>Reportes de inventario con datos reales, exportables a Excel y PDF.</p>
        </div>
      </header>

      <div className={styles.indexGrid}>
        {REPORTES.map((r) =>
          r.activo ? (
            <Link key={r.titulo} href={r.href} className={styles.indexCard}>
              <strong>{r.titulo}</strong>
              <span>{r.detalle}</span>
            </Link>
          ) : (
            <div key={r.titulo} className={[styles.indexCard, styles.indexCardOff].join(" ")}>
              <strong>{r.titulo}</strong>
              <span>{r.detalle}</span>
              <span>Disponible próximamente.</span>
            </div>
          ),
        )}
      </div>
    </section>
  );
}
