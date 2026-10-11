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
  anularMovimientoApi,
  cargarMovimiento,
} from "@/lib/movimientos/cliente-api";

import {
  MovimientoStockDetalle,
} from "@/types/movimientos-stock";

import styles from "./page.module.css";

export default function MovimientoDetallePage() {
  const params = useParams<{
    id: string;
  }>();

  const [mov, setMov] =
    useState<MovimientoStockDetalle | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [motivoAnulacion, setMotivoAnulacion] =
    useState("");

  const [anulando, setAnulando] =
    useState(false);

  const [aviso, setAviso] =
    useState("");

  function recargar() {
    return cargarMovimiento(params.id)
      .then(setMov)
      .catch((e: unknown) =>
        setError(
          e instanceof Error
            ? e.message
            : "No fue posible cargar el movimiento.",
        ),
      )
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function anular() {
    setError("");
    setAnulando(true);

    try {
      setAviso(
        await anularMovimientoApi(
          params.id,
          motivoAnulacion,
        ),
      );
      setMotivoAnulacion("");
      await recargar();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No fue posible anular el movimiento.",
      );
    } finally {
      setAnulando(false);
    }
  }

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
          {error
            ? "No fue posible cargar el movimiento"
            : "Movimiento no encontrado"}
        </h1>

        {error ? <p>{error}</p> : null}
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
            <span>Costo unitario</span>
            <strong>
              {mov.costoUnitario === null
                ? "—"
                : `${mov.costoUnitario} ${mov.monedaCosto}`}
            </strong>
          </div>

          <div>
            <span>Costo total</span>
            <strong>
              {mov.costoTotal === null
                ? "—"
                : `${mov.costoTotal} ${mov.monedaCosto}`}
            </strong>
          </div>

          {mov.anuladoPor ? (
            <div>
              <span>Anulado por</span>
              <strong>{mov.anuladoPor}</strong>
            </div>
          ) : null}

          {mov.anulaA ? (
            <div>
              <span>Anula al movimiento</span>
              <strong>{mov.anulaA}</strong>
            </div>
          ) : null}
        </div>

        {mov.lineas.length > 1 ? (
          <div className={styles.observation}>
            <span>Líneas del movimiento</span>
            {mov.lineas.map((linea) => (
              <strong key={linea.lineaId}>
                {linea.productoCodigo} ·{" "}
                {linea.productoDescripcion}:{" "}
                {linea.cantidad}{" "}
                {linea.unidadMedidaNombre}
                {linea.lote
                  ? ` · Lote ${linea.lote}`
                  : ""}
              </strong>
            ))}
          </div>
        ) : null}

        {aviso ? (
          <div className={styles.observation}>
            <strong>{aviso}</strong>
          </div>
        ) : null}

        {error ? (
          <div className={styles.observation}>
            <strong>{error}</strong>
          </div>
        ) : null}

        {mov.estado === "REGISTRADO" &&
        !mov.anulaA ? (
          <div className={styles.observation}>
            <span>
              Anular movimiento (genera un
              movimiento inverso; requiere
              permiso de anulación)
            </span>
            <input
              value={motivoAnulacion}
              placeholder="Motivo de la anulación (mínimo 5 caracteres)"
              onChange={(event) =>
                setMotivoAnulacion(
                  event.target.value,
                )
              }
            />
            <button
              type="button"
              disabled={
                anulando ||
                motivoAnulacion.trim()
                  .length < 5
              }
              onClick={anular}
            >
              {anulando
                ? "Anulando..."
                : "Anular movimiento"}
            </button>
          </div>
        ) : null}

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