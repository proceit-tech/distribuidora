"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  consumirRecepcionFlash,
  obtenerRecepcionesDemo,
} from "@/lib/mocks/recepciones-storage";

import {
  RecepcionDemo,
  RecepcionEstado,
} from "@/types/recepciones";

import styles from "./page.module.css";

type EstadoFiltro =
  | "TODOS"
  | RecepcionEstado;

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

export default function RecepcionesPage() {
  const [recepciones, setRecepciones] =
    useState<RecepcionDemo[]>([]);

  const [busqueda, setBusqueda] =
    useState("");

  const [estado, setEstado] =
    useState<EstadoFiltro>("TODOS");

  const [flash, setFlash] =
    useState("");

  useEffect(() => {
    setRecepciones(
      obtenerRecepcionesDemo(),
    );

    setFlash(
      consumirRecepcionFlash(),
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
    return recepciones.reduce(
      (acc, item) => {
        acc.total += 1;
        acc.unidades +=
          item.totalUnidades;
        acc.costo +=
          item.totalCosto;

        if (
          item.estado ===
          "RECIBIDA"
        ) {
          acc.recibidas += 1;
        }

        return acc;
      },
      {
        total: 0,
        recibidas: 0,
        unidades: 0,
        costo: 0,
      },
    );
  }, [recepciones]);

  const filtradas = useMemo(() => {
    const term =
      busqueda
        .trim()
        .toLocaleLowerCase("es");

    return recepciones.filter(
      (item) => {
        if (
          estado !== "TODOS" &&
          item.estado !== estado
        ) {
          return false;
        }

        if (!term) {
          return true;
        }

        return [
          item.numero,
          item.proveedorCodigo,
          item.proveedorNombre,
          item.ordenCompraNumero,
          item.documentoProveedor,
          item.depositoNombre,
        ]
          .join(" ")
          .toLocaleLowerCase("es")
          .includes(term);
      },
    );
  }, [
    recepciones,
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
              Recepción registrada
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
              COMPRAS
            </span>

            <span className={styles.demoPill}>
              DEMO
            </span>
          </div>

          <h1>
            Recepciones
          </h1>

          <p>
            Recepción de mercadería,
            control de cantidades y
            entrada automática al stock.
          </p>
        </div>

        <Link
          href="/recepciones/nuevo"
          className={styles.primaryButton}
        >
          ＋ Nueva recepción
        </Link>
      </header>

      <section className={styles.summaryGrid}>
        <article>
          <span>
            RECEPCIONES
          </span>
          <strong>
            {resumen.total}
          </strong>
          <small>
            Documentos registrados
          </small>
        </article>

        <article>
          <span>
            RECIBIDAS
          </span>
          <strong>
            {resumen.recibidas}
          </strong>
          <small>
            Con entrada de stock
          </small>
        </article>

        <article>
          <span>
            UNIDADES RECIBIDAS
          </span>
          <strong>
            {new Intl.NumberFormat(
              "es-PY",
              {
                maximumFractionDigits: 2,
              },
            ).format(
              resumen.unidades,
            )}
          </strong>
          <small>
            Total recepcionado
          </small>
        </article>

        <article>
          <span>
            COSTO RECIBIDO
          </span>
          <strong>
            {money(
              resumen.costo,
            )}
          </strong>
          <small>
            Valor de recepción
          </small>
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
              placeholder="Buscar por recepción, proveedor, OC, documento o depósito..."
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
              <option value="RECIBIDA">
                Recibida
              </option>
              <option value="BORRADOR">
                Borrador
              </option>
              <option value="ANULADA">
                Anulada
              </option>
            </select>
          </label>
        </div>

        <div className={styles.listHeader}>
          <span>Recepción</span>
          <span>Proveedor</span>
          <span>Orden / depósito</span>
          <span>Unidades</span>
          <span>Total</span>
          <span />
        </div>

        {filtradas.map(
          (item) => (
            <article
              key={item.id}
              className={styles.row}
            >
              <div>
                <div className={styles.rowTitle}>
                  <strong>
                    {item.numero}
                  </strong>

                  <span className={styles.status}>
                    {item.estado}
                  </span>
                </div>

                <small>
                  {item.fecha} ·{" "}
                  {item.hora}
                </small>
              </div>

              <div>
                <strong>
                  {item.proveedorNombre}
                </strong>

                <small>
                  {item.proveedorCodigo}
                  {item.documentoProveedor
                    ? ` · ${item.documentoProveedor}`
                    : ""}
                </small>
              </div>

              <div>
                <strong>
                  {item.ordenCompraNumero ||
                    "Sin OC"}
                </strong>

                <small>
                  {item.depositoNombre}
                </small>
              </div>

              <div>
                <strong>
                  {new Intl.NumberFormat(
                    "es-PY",
                    {
                      maximumFractionDigits: 2,
                    },
                  ).format(
                    item.totalUnidades,
                  )}
                </strong>

                <small>
                  {item.items.length} ítems
                </small>
              </div>

              <div>
                <strong>
                  {money(
                    item.totalCosto,
                  )}
                </strong>

                <small>
                  Costo recibido
                </small>
              </div>

              <Link
                href={`/recepciones/${item.id}`}
                className={styles.detailButton}
              >
                Ver detalle ›
              </Link>
            </article>
          ),
        )}

        {filtradas.length === 0 ? (
          <div className={styles.empty}>
            <strong>
              No se encontraron recepciones.
            </strong>

            <span>
              Registre una nueva recepción
              de mercadería.
            </span>
          </div>
        ) : null}
      </section>
    </section>
  );
}