"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  consumirMovimientoStockFlash,
  obtenerMovimientosStockDemo,
} from "@/lib/mocks/movimientos-stock-storage";

import {
  MovimientoStockDemo,
  MovimientoStockTipo,
} from "@/types/movimientos-stock";

import styles from "./page.module.css";

type TipoFiltro =
  | "TODOS"
  | MovimientoStockTipo;

function tipoLabel(
  tipo: MovimientoStockTipo,
) {
  switch (tipo) {
    case "ENTRADA":
      return "Entrada";
    case "SALIDA":
      return "Salida";
    case "TRANSFERENCIA":
      return "Transferencia";
    case "AJUSTE_POSITIVO":
      return "Ajuste +";
    case "AJUSTE_NEGATIVO":
      return "Ajuste -";
    case "RESERVA":
      return "Reserva";
    case "LIBERACION_RESERVA":
      return "Liberar reserva";
    case "CUARENTENA":
      return "Cuarentena";
    case "LIBERACION_CUARENTENA":
      return "Liberar cuarentena";
  }
}

export default function MovimientosPage() {
  const [movimientos, setMovimientos] =
    useState<MovimientoStockDemo[]>([]);

  const [busqueda, setBusqueda] =
    useState("");

  const [tipo, setTipo] =
    useState<TipoFiltro>("TODOS");

  const [flash, setFlash] =
    useState("");

  useEffect(() => {
    setMovimientos(
      obtenerMovimientosStockDemo(),
    );

    setFlash(
      consumirMovimientoStockFlash(),
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
    return movimientos.reduce(
      (acc, mov) => {
        acc.total += 1;

        if (mov.tipo === "ENTRADA") {
          acc.entradas += 1;
        }

        if (mov.tipo === "SALIDA") {
          acc.salidas += 1;
        }

        if (
          mov.tipo ===
          "TRANSFERENCIA"
        ) {
          acc.transferencias += 1;
        }

        return acc;
      },
      {
        total: 0,
        entradas: 0,
        salidas: 0,
        transferencias: 0,
      },
    );
  }, [movimientos]);

  const filtrados = useMemo(() => {
    const term =
      busqueda
        .trim()
        .toLocaleLowerCase("es");

    return movimientos.filter(
      (mov) => {
        if (
          tipo !== "TODOS" &&
          mov.tipo !== tipo
        ) {
          return false;
        }

        if (!term) {
          return true;
        }

        return [
          mov.numero,
          mov.productoCodigo,
          mov.productoDescripcion,
          mov.documentoReferencia,
          mov.motivo,
          mov.depositoOrigenNombre,
          mov.depositoDestinoNombre,
        ]
          .join(" ")
          .toLocaleLowerCase("es")
          .includes(term);
      },
    );
  }, [
    movimientos,
    busqueda,
    tipo,
  ]);

  return (
    <section className={styles.page}>
      {flash ? (
        <div className={styles.toast}>
          <span>✓</span>
          <div>
            <strong>
              Movimiento registrado
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
              INVENTARIO
            </span>
            <span className={styles.demoPill}>
              DEMO
            </span>
          </div>

          <h1>Movimientos de stock</h1>

          <p>
            Entradas, salidas,
            transferencias, ajustes,
            reservas y cuarentenas.
          </p>
        </div>

        <Link
          href="/movimientos/nuevo"
          className={styles.primaryButton}
        >
          ＋ Nuevo movimiento
        </Link>
      </header>

      <section className={styles.summaryGrid}>
        <article>
          <span>TOTAL</span>
          <strong>{resumen.total}</strong>
          <small>Movimientos registrados</small>
        </article>

        <article>
          <span>ENTRADAS</span>
          <strong>{resumen.entradas}</strong>
          <small>Ingresos de stock</small>
        </article>

        <article>
          <span>SALIDAS</span>
          <strong>{resumen.salidas}</strong>
          <small>Egresos de stock</small>
        </article>

        <article>
          <span>TRANSFERENCIAS</span>
          <strong>
            {resumen.transferencias}
          </strong>
          <small>Entre depósitos</small>
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
              placeholder="Buscar por movimiento, producto, documento, depósito..."
            />
          </label>

          <label className={styles.filter}>
            <span>Tipo</span>
            <select
              value={tipo}
              onChange={(event) =>
                setTipo(
                  event.target
                    .value as TipoFiltro,
                )
              }
            >
              <option value="TODOS">
                Todos
              </option>
              <option value="ENTRADA">
                Entrada
              </option>
              <option value="SALIDA">
                Salida
              </option>
              <option value="TRANSFERENCIA">
                Transferencia
              </option>
              <option value="AJUSTE_POSITIVO">
                Ajuste positivo
              </option>
              <option value="AJUSTE_NEGATIVO">
                Ajuste negativo
              </option>
              <option value="RESERVA">
                Reserva
              </option>
              <option value="LIBERACION_RESERVA">
                Liberación reserva
              </option>
              <option value="CUARENTENA">
                Cuarentena
              </option>
              <option value="LIBERACION_CUARENTENA">
                Liberación cuarentena
              </option>
            </select>
          </label>
        </div>

        <div className={styles.listHeader}>
          <span>Movimiento</span>
          <span>Producto</span>
          <span>Depósito</span>
          <span>Cantidad</span>
          <span />
        </div>

        {filtrados.map((mov) => (
          <article
            key={mov.id}
            className={styles.row}
          >
            <div>
              <div className={styles.rowTitle}>
                <strong>
                  {mov.numero}
                </strong>
                <span className={styles.typeBadge}>
                  {tipoLabel(mov.tipo)}
                </span>
              </div>

              <small>
                {mov.fecha} · {mov.hora}
                {mov.documentoReferencia
                  ? ` · ${mov.documentoReferencia}`
                  : ""}
              </small>
            </div>

            <div>
              <strong>
                {mov.productoDescripcion}
              </strong>
              <small>
                {mov.productoCodigo}
              </small>
            </div>

            <div>
              <strong>
                {mov.tipo ===
                "TRANSFERENCIA"
                  ? `${mov.depositoOrigenNombre} → ${mov.depositoDestinoNombre}`
                  : mov.depositoDestinoNombre ||
                    mov.depositoOrigenNombre ||
                    "Sin depósito"}
              </strong>
              <small>{mov.motivo}</small>
            </div>

            <div>
              <strong>
                {mov.cantidad}{" "}
                {mov.unidadMedidaNombre}
              </strong>
              <small>
                {mov.lote
                  ? `Lote ${mov.lote}`
                  : mov.propiedad ===
                      "TERCERO"
                    ? "Stock tercero"
                    : "Stock propio"}
              </small>
            </div>

            <Link
              href={`/movimientos/${mov.id}`}
              className={styles.detailButton}
            >
              Ver detalle ›
            </Link>
          </article>
        ))}

        {filtrados.length === 0 ? (
          <div className={styles.empty}>
            <strong>
              No se encontraron movimientos.
            </strong>
            <span>
              Modifique los filtros o
              registre un nuevo movimiento.
            </span>
          </div>
        ) : null}
      </section>
    </section>
  );
}