"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
} from "react";

import {
  useParams,
} from "next/navigation";

import {
  buscarStockDemo,
} from "@/lib/mocks/stock-storage";

import {
  StockDemo,
} from "@/types/stock";

import styles from "./page.module.css";

function money(
  value: number,
) {
  return `Gs. ${new Intl.NumberFormat(
    "es-PY",
    {
      maximumFractionDigits: 0,
    },
  ).format(value)}`;
}

function date(
  value: string,
) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "es-PY",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  ).format(
    new Date(
      `${value}T12:00:00`,
    ),
  );
}

export default function StockDetallePage() {
  const params = useParams<{
    id: string;
  }>();

  const [item, setItem] =
    useState<StockDemo | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    setItem(
      buscarStockDemo(
        params.id,
      ),
    );

    setLoading(false);
  }, [params.id]);

  if (loading) {
    return (
      <main className={styles.state}>
        Cargando stock...
      </main>
    );
  }

  if (!item) {
    return (
      <main className={styles.state}>
        <h1>
          Stock no encontrado
        </h1>

        <Link href="/stock">
          Volver a stock
        </Link>
      </main>
    );
  }

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <div className={styles.heroMeta}>
            <span className={styles.modulePill}>
              STOCK
            </span>

            <span className={styles.demoPill}>
              DEMO
            </span>
          </div>

          <h1>
            {item.productoDescripcion}
          </h1>

          <p>
            {item.productoCodigo}
            {" · "}
            {item.categoria}
            {" · "}
            {item.marca}
          </p>
        </div>

        <Link
          href="/stock"
          className={styles.backButton}
        >
          ← Volver a stock
        </Link>
      </header>

      <section className={styles.summaryGrid}>
        <article>
          <span>DISPONIBLE</span>
          <strong>
            {item.disponible}
          </strong>
          <small>
            {item.unidadMedidaNombre}
          </small>
        </article>

        <article>
          <span>RESERVADO</span>
          <strong>
            {item.reservado}
          </strong>
          <small>
            Pendiente de salida
          </small>
        </article>

        <article>
          <span>CUARENTENA</span>
          <strong>
            {item.cuarentena}
          </strong>
          <small>
            No disponible
          </small>
        </article>

        <article>
          <span>TRÁNSITO</span>
          <strong>
            {item.transito}
          </strong>
          <small>
            Próximo ingreso
          </small>
        </article>

        <article>
          <span>VALOR FÍSICO</span>
          <strong>
            {money(
              item.valorInventario,
            )}
          </strong>
          <small>
            Costo promedio
          </small>
        </article>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>
              Resumen de inventario
            </h2>
            <p>
              Política y disponibilidad
              consolidada del producto.
            </p>
          </div>

          <span
            className={
              item.nivel === "NORMAL"
                ? styles.statusNormal
                : item.nivel === "BAJO"
                  ? styles.statusWarning
                  : item.nivel ===
                      "SIN_STOCK"
                    ? styles.statusDanger
                    : styles.statusOver
            }
          >
            {item.nivel === "NORMAL"
              ? "Normal"
              : item.nivel === "BAJO"
                ? "Stock bajo"
                : item.nivel ===
                    "SIN_STOCK"
                  ? "Sin stock"
                  : "Sobrestock"}
          </span>
        </div>

        <div className={styles.infoGrid}>
          <div>
            <span>Control</span>
            <strong>
              {item.modoControl}
            </strong>
          </div>

          <div>
            <span>Stock mínimo</span>
            <strong>
              {item.stockMinimo}
            </strong>
          </div>

          <div>
            <span>Punto reposición</span>
            <strong>
              {item.puntoReposicion}
            </strong>
          </div>

          <div>
            <span>Stock máximo</span>
            <strong>
              {item.stockMaximo || "—"}
            </strong>
          </div>

          <div>
            <span>Total físico</span>
            <strong>
              {item.totalFisico}
            </strong>
          </div>

          <div>
            <span>Total virtual</span>
            <strong>
              {item.totalVirtual}
            </strong>
          </div>

          <div>
            <span>Costo promedio</span>
            <strong>
              {money(
                item.costoPromedio,
              )}
            </strong>
          </div>

          <div>
            <span>Propiedad</span>
            <strong>
              {item.propiedad ===
              "PROPIO"
                ? "Propio"
                : "Tercero"}
            </strong>
          </div>
        </div>

        <div className={styles.owner}>
          <span>Propietario</span>
          <strong>
            {item.propietarioNombre}
          </strong>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>
              Stock por depósito
            </h2>
            <p>
              Distribución física y
              virtual por ubicación.
            </p>
          </div>
        </div>

        <div className={styles.tableHeader}>
          <span>Depósito</span>
          <span>Ubicación</span>
          <span>Disponible</span>
          <span>Reservado</span>
          <span>Cuarentena</span>
          <span>Tránsito</span>
          <span>Total físico</span>
        </div>

        {item.depositos.map(
          (deposito) => (
            <div
              key={deposito.id}
              className={styles.tableRow}
            >
              <div>
                <strong>
                  {deposito.depositoNombre}
                </strong>
                <small>
                  {deposito.depositoCodigo}
                </small>
              </div>

              <span>
                {deposito.ubicacion}
              </span>
              <span>
                {deposito.disponible}
              </span>
              <span>
                {deposito.reservado}
              </span>
              <span>
                {deposito.cuarentena}
              </span>
              <span>
                {deposito.transito}
              </span>
              <strong>
                {deposito.totalFisico}
              </strong>
            </div>
          ),
        )}
      </section>

      {item.modoControl ===
        "LOTE" ? (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h2>
                Lotes y vencimientos
              </h2>
              <p>
                Trazabilidad por lote.
              </p>
            </div>
          </div>

          <div className={styles.lotHeader}>
            <span>Lote</span>
            <span>Vencimiento</span>
            <span>Cantidad</span>
            <span>Estado</span>
            <span>Ubicación</span>
            <span>Propietario</span>
          </div>

          {item.lotes.map(
            (lote) => (
              <div
                key={lote.id}
                className={styles.lotRow}
              >
                <strong>
                  {lote.lote}
                </strong>
                <span>
                  {date(
                    lote.fechaVencimiento,
                  )}
                </span>
                <span>
                  {lote.cantidad}
                </span>
                <span>
                  {lote.estado}
                </span>
                <span>
                  {lote.ubicacion}
                </span>
                <span>
                  {lote.propietario}
                </span>
              </div>
            ),
          )}
        </section>
      ) : null}
    </section>
  );
}