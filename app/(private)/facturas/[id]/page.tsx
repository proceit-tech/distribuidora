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
  buscarFacturaDemo,
} from "@/lib/mocks/facturas-storage";

import {
  FacturaDemo,
} from "@/types/facturas";

import styles from "./page.module.css";

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

export default function FacturaDetallePage() {
  const params = useParams<{
    id: string;
  }>();

  const [factura, setFactura] =
    useState<FacturaDemo | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    setFactura(
      buscarFacturaDemo(
        params.id,
      ),
    );

    setLoading(false);
  }, [params.id]);

  if (loading) {
    return (
      <main className={styles.state}>
        Cargando factura...
      </main>
    );
  }

  if (!factura) {
    return (
      <main className={styles.state}>
        <h1>
          Factura no encontrada
        </h1>

        <Link href="/facturas">
          Volver a facturas
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
              FACTURA
            </span>

            <span className={styles.demoPill}>
              DEMO
            </span>
          </div>

          <h1>
            {factura.numeroInterno}
          </h1>

          <p>
            {factura.sucursalCodigo}-
            {factura.puntoExpedicion}-
            {factura.numeroSecuencia}
          </p>
        </div>

        <Link
          href="/facturas"
          className={styles.backButton}
        >
          ← Volver a facturas
        </Link>
      </header>

      <section className={styles.summaryGrid}>
        <article>
          <span>ESTADO</span>
          <strong>
            {factura.estado}
          </strong>
          <small>
            {factura.mensajeSifen}
          </small>
        </article>

        <article>
          <span>CLIENTE</span>
          <strong>
            {factura.cliente.razonSocial}
          </strong>
          <small>
            {factura.cliente.numeroDocumento}
            {factura.cliente.dv
              ? `-${factura.cliente.dv}`
              : ""}
          </small>
        </article>

        <article>
          <span>FECHA</span>
          <strong>
            {factura.fechaEmision}
          </strong>
          <small>
            {factura.moneda}
          </small>
        </article>

        <article>
          <span>TOTAL</span>
          <strong>
            {money(
              factura.totales.totalGeneral,
              factura.moneda,
            )}
          </strong>
          <small>
            {factura.items.length} ítems
          </small>
        </article>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>
              Datos del documento
            </h2>
            <p>
              Cabecera y datos SIFEN.
            </p>
          </div>

          <span className={styles.status}>
            {factura.estado}
          </span>
        </div>

        <div className={styles.infoGrid}>
          <div>
            <span>Sucursal</span>
            <strong>
              {factura.sucursalCodigo}
            </strong>
          </div>

          <div>
            <span>Punto expedición</span>
            <strong>
              {factura.puntoExpedicion}
            </strong>
          </div>

          <div>
            <span>Secuencia</span>
            <strong>
              {factura.numeroSecuencia}
            </strong>
          </div>

          <div>
            <span>Condición</span>
            <strong>
              {factura.condicionOperacion}
            </strong>
          </div>

          <div>
            <span>Transacción</span>
            <strong>
              {factura.tipoTransaccion}
            </strong>
          </div>

          <div>
            <span>Presencia</span>
            <strong>
              {factura.indicadorPresencia}
            </strong>
          </div>

          <div>
            <span>Moneda</span>
            <strong>
              {factura.moneda}
            </strong>
          </div>

          <div>
            <span>Medio de pago</span>
            <strong>
              {factura.formaPago.medio}
            </strong>
          </div>
        </div>

        <div className={styles.cdc}>
          <span>CDC</span>
          <strong>
            {factura.cdc}
          </strong>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>Cliente</h2>
            <p>
              Datos del receptor.
            </p>
          </div>
        </div>

        <div className={styles.infoGrid}>
          <div>
            <span>Código</span>
            <strong>
              {factura.cliente.codigo}
            </strong>
          </div>

          <div>
            <span>Razón social</span>
            <strong>
              {factura.cliente.razonSocial}
            </strong>
          </div>

          <div>
            <span>Documento</span>
            <strong>
              {factura.cliente.numeroDocumento}
              {factura.cliente.dv
                ? `-${factura.cliente.dv}`
                : ""}
            </strong>
          </div>

          <div>
            <span>Email</span>
            <strong>
              {factura.cliente.email || "—"}
            </strong>
          </div>

          <div>
            <span>Teléfono</span>
            <strong>
              {factura.cliente.telefono || "—"}
            </strong>
          </div>

          <div>
            <span>Celular</span>
            <strong>
              {factura.cliente.celular || "—"}
            </strong>
          </div>

          <div>
            <span>Dirección</span>
            <strong>
              {factura.cliente.direccion || "—"}
            </strong>
          </div>

          <div>
            <span>Naturaleza</span>
            <strong>
              {factura.cliente.naturaleza}
            </strong>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>Ítems</h2>
            <p>
              Detalle de productos facturados.
            </p>
          </div>
        </div>

        <div className={styles.itemHeader}>
          <span>Producto</span>
          <span>Descripción</span>
          <span>IVA</span>
          <span>Cantidad</span>
          <span>Precio unitario</span>
          <span>Subtotal</span>
        </div>

        {factura.items.map(
          (item) => (
            <div
              key={item.id}
              className={styles.itemRow}
            >
              <strong>
                {item.productoCodigo}
              </strong>
              <span>
                {item.descripcion}
              </span>
              <span>
                {item.porcentajeIva}%
              </span>
              <span>
                {item.cantidad}{" "}
                {item.unidadMedida}
              </span>
              <span>
                {money(
                  item.precioUnitario,
                  factura.moneda,
                )}
              </span>
              <strong>
                {money(
                  item.subtotal,
                  factura.moneda,
                )}
              </strong>
            </div>
          ),
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>Totales</h2>
            <p>
              Resumen tributario del documento.
            </p>
          </div>
        </div>

        <div className={styles.totalGrid}>
          {[
            ["Subtotal exento", factura.totales.subtotalExento],
            ["Subtotal 5%", factura.totales.subtotal5],
            ["Subtotal 10%", factura.totales.subtotal10],
            ["IVA 5%", factura.totales.iva5],
            ["IVA 10%", factura.totales.iva10],
            ["Total IVA", factura.totales.totalIva],
            ["Base gravada 5%", factura.totales.baseGravada5],
            ["Base gravada 10%", factura.totales.baseGravada10],
            ["Total general", factura.totales.totalGeneral],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <span>{label}</span>
              <strong>
                {money(
                  Number(value),
                  factura.moneda,
                )}
              </strong>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}