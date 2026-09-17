"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  consumirFacturaFlash,
  obtenerFacturasDemo,
} from "@/lib/mocks/facturas-storage";

import {
  FacturaDemo,
  FacturaEstado,
} from "@/types/facturas";

import styles from "./page.module.css";

type EstadoFiltro =
  | "TODOS"
  | FacturaEstado;

function money(
  value: number,
  moneda: string,
) {
  if (moneda === "PYG") {
    return `Gs. ${new Intl.NumberFormat(
      "es-PY",
      {
        maximumFractionDigits: 0,
      },
    ).format(value)}`;
  }

  return `${moneda} ${new Intl.NumberFormat(
    "es-PY",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  ).format(value)}`;
}

export default function FacturasPage() {
  const [facturas, setFacturas] =
    useState<FacturaDemo[]>([]);

  const [busqueda, setBusqueda] =
    useState("");

  const [estado, setEstado] =
    useState<EstadoFiltro>("TODOS");

  const [flash, setFlash] =
    useState("");

  useEffect(() => {
    setFacturas(
      obtenerFacturasDemo(),
    );

    setFlash(
      consumirFacturaFlash(),
    );
  }, []);

  useEffect(() => {
    if (!flash) {
      return;
    }

    const timer =
      window.setTimeout(
        () => setFlash(""),
        4200,
      );

    return () =>
      window.clearTimeout(timer);
  }, [flash]);

  const resumen = useMemo(() => {
    return facturas.reduce(
      (acc, factura) => {
        acc.total += 1;
        acc.monto +=
          factura.totales.totalGeneral;

        if (
          factura.estado ===
          "APROBADA"
        ) {
          acc.aprobadas += 1;
        }

        if (
          factura.estado ===
          "RECHAZADA"
        ) {
          acc.rechazadas += 1;
        }

        return acc;
      },
      {
        total: 0,
        aprobadas: 0,
        rechazadas: 0,
        monto: 0,
      },
    );
  }, [facturas]);

  const filtradas = useMemo(() => {
    const term =
      busqueda
        .trim()
        .toLocaleLowerCase("es");

    return facturas.filter(
      (factura) => {
        if (
          estado !== "TODOS" &&
          factura.estado !== estado
        ) {
          return false;
        }

        if (!term) {
          return true;
        }

        return [
          factura.numeroInterno,
          factura.numeroSecuencia,
          factura.cliente.razonSocial,
          factura.cliente.numeroDocumento,
          factura.cdc,
        ]
          .join(" ")
          .toLocaleLowerCase("es")
          .includes(term);
      },
    );
  }, [
    facturas,
    busqueda,
    estado,
  ]);

  return (
    <section className={styles.page}>
      {flash ? (
        <div className={styles.toast}>
          <span>✓</span>
          <div>
            <strong>
              Factura emitida
            </strong>
            <small>{flash}</small>
          </div>
          <button
            type="button"
            onClick={() =>
              setFlash("")
            }
          >
            ×
          </button>
        </div>
      ) : null}

      <header className={styles.hero}>
        <div>
          <div className={styles.heroMeta}>
            <span className={styles.modulePill}>
              FACTURACIÓN
            </span>
            <span className={styles.demoPill}>
              DEMO
            </span>
          </div>

          <h1>Facturas</h1>
          <p>
            Emisión, consulta y estado
            de documentos electrónicos.
          </p>
        </div>

        <Link
          href="/facturas/nuevo"
          className={styles.primaryButton}
        >
          ＋ Nueva factura
        </Link>
      </header>

      <section className={styles.summaryGrid}>
        <article>
          <span>TOTAL FACTURAS</span>
          <strong>{resumen.total}</strong>
          <small>Documentos registrados</small>
        </article>

        <article>
          <span>APROBADAS</span>
          <strong>
            {resumen.aprobadas}
          </strong>
          <small>Aceptadas por SIFEN</small>
        </article>

        <article>
          <span>RECHAZADAS</span>
          <strong>
            {resumen.rechazadas}
          </strong>
          <small>Requieren revisión</small>
        </article>

        <article>
          <span>MONTO EMITIDO</span>
          <strong>
            {money(
              resumen.monto,
              "PYG",
            )}
          </strong>
          <small>Total general demo</small>
        </article>
      </section>

      <section className={styles.card}>
        <div className={styles.toolbar}>
          <label className={styles.search}>
            <span>⌕</span>
            <input
              value={busqueda}
              onChange={(event) =>
                setBusqueda(
                  event.target.value,
                )
              }
              placeholder="Buscar por factura, cliente, RUC o CDC..."
            />
          </label>

          <label className={styles.filter}>
            <span>Estado</span>
            <select
              value={estado}
              onChange={(event) =>
                setEstado(
                  event.target
                    .value as EstadoFiltro,
                )
              }
            >
              <option value="TODOS">
                Todos
              </option>
              <option value="APROBADA">
                Aprobada
              </option>
              <option value="EMITIDA">
                Emitida
              </option>
              <option value="BORRADOR">
                Borrador
              </option>
              <option value="RECHAZADA">
                Rechazada
              </option>
              <option value="ANULADA">
                Anulada
              </option>
            </select>
          </label>
        </div>

        <div className={styles.listHeader}>
          <span>Factura</span>
          <span>Cliente</span>
          <span>Fecha / moneda</span>
          <span>Total</span>
          <span>Estado</span>
          <span />
        </div>

        {filtradas.map(
          (factura) => (
            <article
              key={factura.id}
              className={styles.row}
            >
              <div>
                <strong>
                  {factura.numeroInterno}
                </strong>
                <small>
                  {factura.sucursalCodigo}-
                  {factura.puntoExpedicion}-
                  {factura.numeroSecuencia}
                </small>
              </div>

              <div>
                <strong>
                  {
                    factura.cliente
                      .razonSocial
                  }
                </strong>
                <small>
                  {factura.cliente
                    .numeroDocumento
                    ? `${factura.cliente.numeroDocumento}-${factura.cliente.dv}`
                    : factura.cliente
                        .tipoDocumento}
                </small>
              </div>

              <div>
                <strong>
                  {factura.fechaEmision}
                </strong>
                <small>
                  {factura.moneda} ·{" "}
                  {
                    factura.condicionOperacion
                  }
                </small>
              </div>

              <div>
                <strong>
                  {money(
                    factura.totales
                      .totalGeneral,
                    factura.moneda,
                  )}
                </strong>
                <small>
                  {factura.items.length} ítems
                </small>
              </div>

              <div>
                <span
                  className={
                    factura.estado ===
                    "APROBADA"
                      ? styles.statusApproved
                      : factura.estado ===
                          "RECHAZADA"
                        ? styles.statusRejected
                        : styles.statusNeutral
                  }
                >
                  {factura.estado}
                </span>
              </div>

              <Link
                href={`/facturas/${factura.id}`}
                className={styles.detailButton}
              >
                Ver factura ›
              </Link>
            </article>
          ),
        )}

        {filtradas.length === 0 ? (
          <div className={styles.empty}>
            <strong>
              No se encontraron facturas.
            </strong>
            <span>
              Modifique los filtros o
              emita una nueva factura.
            </span>
          </div>
        ) : null}
      </section>
    </section>
  );
}