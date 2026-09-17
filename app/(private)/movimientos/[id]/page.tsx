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
  buscarMovimientoStockDemo,
} from "@/lib/mocks/movimientos-stock-storage";

import {
  MovimientoStockDemo,
} from "@/types/movimientos-stock";

import styles from "./page.module.css";

export default function MovimientoDetallePage() {
  const params = useParams<{
    id: string;
  }>();

  const [mov, setMov] =
    useState<MovimientoStockDemo | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    setMov(
      buscarMovimientoStockDemo(
        params.id,
      ),
    );

    setLoading(false);
  }, [params.id]);

  if (loading) {
    return (
      <main className={styles.state}>
        Cargando movimiento...
      </main>
    );
  }

  if (!mov) {
    return (
      <main className={styles.state}>
        <h1>
          Movimiento no encontrado
        </h1>
        <Link href="/movimientos">
          Volver a movimientos
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
              MOVIMIENTO
            </span>
            <span className={styles.demoPill}>
              DEMO
            </span>
          </div>

          <h1>{mov.numero}</h1>

          <p>
            {mov.productoCodigo} ·{" "}
            {mov.productoDescripcion}
          </p>
        </div>

        <Link
          href="/movimientos"
          className={styles.backButton}
        >
          ← Volver a movimientos
        </Link>
      </header>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <span>DETALLE</span>
            <h2>
              Movimiento registrado
            </h2>
            <p>
              {mov.fecha} · {mov.hora}
            </p>
          </div>

          <span className={styles.status}>
            {mov.estado}
          </span>
        </div>

        <div className={styles.infoGrid}>
          <div>
            <span>Tipo</span>
            <strong>{mov.tipo}</strong>
          </div>

          <div>
            <span>Origen</span>
            <strong>{mov.origen}</strong>
          </div>

          <div>
            <span>Cantidad</span>
            <strong>
              {mov.cantidad}{" "}
              {mov.unidadMedidaNombre}
            </strong>
          </div>

          <div>
            <span>Usuario</span>
            <strong>{mov.usuario}</strong>
          </div>

          <div>
            <span>Depósito origen</span>
            <strong>
              {mov.depositoOrigenNombre ||
                "—"}
            </strong>
          </div>

          <div>
            <span>Depósito destino</span>
            <strong>
              {mov.depositoDestinoNombre ||
                "—"}
            </strong>
          </div>

          <div>
            <span>Documento</span>
            <strong>
              {mov.documentoReferencia ||
                "—"}
            </strong>
          </div>

          <div>
            <span>Motivo</span>
            <strong>
              {mov.motivo || "—"}
            </strong>
          </div>

          <div>
            <span>Lote</span>
            <strong>
              {mov.lote || "—"}
            </strong>
          </div>

          <div>
            <span>Vencimiento</span>
            <strong>
              {mov.fechaVencimiento ||
                "—"}
            </strong>
          </div>

          <div>
            <span>Propiedad</span>
            <strong>
              {mov.propiedad}
            </strong>
          </div>

          <div>
            <span>Propietario</span>
            <strong>
              {mov.propietarioNombre}
            </strong>
          </div>
        </div>

        <div className={styles.observation}>
          <span>Observación</span>
          <strong>
            {mov.observacion ||
              "Sin observación"}
          </strong>
        </div>
      </section>
    </section>
  );
}