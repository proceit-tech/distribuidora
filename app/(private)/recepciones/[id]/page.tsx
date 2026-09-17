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
  buscarRecepcionDemo,
} from "@/lib/mocks/recepciones-storage";

import {
  RecepcionDemo,
} from "@/types/recepciones";

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

export default function RecepcionDetallePage() {
  const params = useParams<{
    id: string;
  }>();

  const [recepcion, setRecepcion] =
    useState<RecepcionDemo | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    setRecepcion(
      buscarRecepcionDemo(
        params.id,
      ),
    );

    setLoading(false);
  }, [params.id]);

  if (loading) {
    return (
      <main className={styles.state}>
        Cargando recepción...
      </main>
    );
  }

  if (!recepcion) {
    return (
      <main className={styles.state}>
        <h1>
          Recepción no encontrada
        </h1>

        <Link href="/recepciones">
          Volver a recepciones
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
              RECEPCIÓN
            </span>

            <span className={styles.demoPill}>
              DEMO
            </span>
          </div>

          <h1>
            {recepcion.numero}
          </h1>

          <p>
            {recepcion.proveedorNombre}
          </p>
        </div>

        <Link
          href="/recepciones"
          className={styles.backButton}
        >
          ← Volver a recepciones
        </Link>
      </header>

      <section className={styles.summaryGrid}>
        <article>
          <span>
            ESTADO
          </span>
          <strong>
            {recepcion.estado}
          </strong>
          <small>
            Entrada registrada
          </small>
        </article>

        <article>
          <span>
            UNIDADES
          </span>
          <strong>
            {recepcion.totalUnidades}
          </strong>
          <small>
            Total recibido
          </small>
        </article>

        <article>
          <span>
            ÍTEMS
          </span>
          <strong>
            {recepcion.items.length}
          </strong>
          <small>
            Productos recibidos
          </small>
        </article>

        <article>
          <span>
            COSTO
          </span>
          <strong>
            {money(
              recepcion.totalCosto,
            )}
          </strong>
          <small>
            Valor recibido
          </small>
        </article>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>
              Datos de la recepción
            </h2>

            <p>
              Referencias de compra y
              depósito.
            </p>
          </div>

          <span className={styles.status}>
            {recepcion.estado}
          </span>
        </div>

        <div className={styles.infoGrid}>
          <div>
            <span>Fecha</span>
            <strong>
              {recepcion.fecha}
            </strong>
          </div>

          <div>
            <span>Hora</span>
            <strong>
              {recepcion.hora}
            </strong>
          </div>

          <div>
            <span>Proveedor</span>
            <strong>
              {recepcion.proveedorNombre}
            </strong>
          </div>

          <div>
            <span>Orden de compra</span>
            <strong>
              {recepcion.ordenCompraNumero ||
                "—"}
            </strong>
          </div>

          <div>
            <span>Depósito</span>
            <strong>
              {recepcion.depositoNombre}
            </strong>
          </div>

          <div>
            <span>
              Documento proveedor
            </span>
            <strong>
              {recepcion.documentoProveedor ||
                "—"}
            </strong>
          </div>

          <div>
            <span>Usuario</span>
            <strong>
              {recepcion.usuario}
            </strong>
          </div>

          <div>
            <span>Observación</span>
            <strong>
              {recepcion.observacion ||
                "—"}
            </strong>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>
              Productos recibidos
            </h2>

            <p>
              Cantidades, costos y
              pendientes.
            </p>
          </div>
        </div>

        <div className={styles.itemHeader}>
          <span>Producto</span>
          <span>Ordenada</span>
          <span>Recibida</span>
          <span>Pendiente</span>
          <span>Costo</span>
          <span>Subtotal</span>
          <span>Lote</span>
        </div>

        {recepcion.items.map(
          (item) => (
            <div
              key={item.id}
              className={styles.itemRow}
            >
              <div>
                <strong>
                  {item.productoDescripcion}
                </strong>

                <small>
                  {item.productoCodigoInventario ||
                    item.productoCodigo}
                </small>
              </div>

              <span>
                {item.cantidadOrdenada}
              </span>

              <strong>
                {item.cantidadRecibida}
              </strong>

              <span>
                {item.cantidadPendiente}
              </span>

              <span>
                {money(
                  item.costoUnitario,
                )}
              </span>

              <strong>
                {money(
                  item.subtotal,
                )}
              </strong>

              <span>
                {item.lote || "—"}
              </span>
            </div>
          ),
        )}
      </section>
    </section>
  );
}