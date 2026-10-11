"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { cargarListas } from "@/lib/listas-precio/cliente-api";

import {
  ListaPrecioFila,
  ListaPrecioEstado,
  ListaPrecioMoneda,
  ListaPrecioTipo,
} from "@/types/lista-precio";

import styles from "./page.module.css";

const PAGE_SIZE = 8;

type EstadoFiltro =
  | "TODOS"
  | ListaPrecioEstado;

type TipoFiltro =
  | "TODOS"
  | ListaPrecioTipo;

type MonedaFiltro =
  | "TODOS"
  | ListaPrecioMoneda;

function getEstadoReal(
  lista: ListaPrecioFila,
): ListaPrecioEstado {
  if (
    lista.vigenteHasta &&
    new Date(
      `${lista.vigenteHasta}T23:59:59`,
    ).getTime() <
      new Date().getTime()
  ) {
    return "VENCIDA";
  }

  return lista.estado;
}

function formatearFecha(
  value: string,
) {
  if (!value) {
    return "Sin vencimiento";
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

function formatMoneda(
  moneda: ListaPrecioMoneda,
) {
  return moneda;
}

function getAplicacion(
  lista: ListaPrecioFila,
) {
  if (lista.clienteNombre) {
    return `Cliente · ${lista.clienteNombre}`;
  }

  if (lista.grupoClienteNombre) {
    return `Grupo · ${lista.grupoClienteNombre}`;
  }

  if (lista.zonaNombre) {
    return `Zona · ${lista.zonaNombre}`;
  }

  if (lista.canalVentaNombre) {
    return `Canal · ${lista.canalVentaNombre}`;
  }

  return "Aplicación general";
}

function getModoLabel(
  lista: ListaPrecioFila,
) {
  if (
    lista.modoPrecio ===
    "AJUSTE_PORCENTAJE"
  ) {
    if (
      lista.ajusteGeneralPct < 0
    ) {
      return `${Math.abs(
        lista.ajusteGeneralPct,
      )}% descuento`;
    }

    if (
      lista.ajusteGeneralPct > 0
    ) {
      return `${lista.ajusteGeneralPct}% aumento`;
    }

    return "Sin ajuste";
  }

  if (
    lista.modoPrecio ===
    "MARGEN_SOBRE_COSTO"
  ) {
    return "Margen sobre costo";
  }

  return "Precio fijo";
}

export default function ListasPrecioPage() {
  const [listas, setListas] =
    useState<ListaPrecioFila[]>([]);

  const [busqueda, setBusqueda] =
    useState("");

  const [filtroEstado, setFiltroEstado] =
    useState<EstadoFiltro>("TODOS");

  const [filtroTipo, setFiltroTipo] =
    useState<TipoFiltro>("TODOS");

  const [filtroMoneda, setFiltroMoneda] =
    useState<MonedaFiltro>("TODOS");

  const [pagina, setPagina] =
    useState(1);

  const [flash, setFlash] =
    useState("");

  const [cargando, setCargando] =
    useState(true);

  const [errorCarga, setErrorCarga] =
    useState("");

  useEffect(() => {
    let activo = true;

    cargarListas()
      .then((datos) => {
        if (activo) setListas(datos);
      })
      .catch((e: unknown) => {
        if (activo)
          setErrorCarga(
            e instanceof Error
              ? e.message
              : "No fue posible cargar las listas de precios.",
          );
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    // Aviso tras crear/editar (?ok=creado|actualizado).
    const ok = new URLSearchParams(
      window.location.search,
    ).get("ok");

    if (ok === "creado") {
      setFlash("Lista de precios registrada correctamente.");
    } else if (ok === "actualizado") {
      setFlash("Lista de precios actualizada correctamente.");
    }

    if (ok) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname,
      );
    }

    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    setPagina(1);
  }, [
    busqueda,
    filtroEstado,
    filtroTipo,
    filtroMoneda,
  ]);

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
    const hoy = new Date();

    const limite =
      new Date();

    limite.setDate(
      limite.getDate() + 30,
    );

    return listas.reduce(
      (acc, lista) => {
        acc.total += 1;

        const estado =
          getEstadoReal(lista);

        if (
          lista.activo &&
          estado === "ACTIVA"
        ) {
          acc.activas += 1;
        }

        if (
          lista.tipo === "VENTA"
        ) {
          acc.venta += 1;
        }

        if (
          lista.tipo === "COMPRA"
        ) {
          acc.compra += 1;
        }

        if (lista.vigenteHasta) {
          const vence =
            new Date(
              `${lista.vigenteHasta}T23:59:59`,
            );

          if (
            vence >= hoy &&
            vence <= limite
          ) {
            acc.proximasAVencer += 1;
          }
        }

        return acc;
      },
      {
        total: 0,
        activas: 0,
        venta: 0,
        compra: 0,
        proximasAVencer: 0,
      },
    );
  }, [listas]);

  const filtradas = useMemo(() => {
    const term =
      busqueda
        .trim()
        .toLocaleLowerCase("es");

    return listas.filter(
      (lista) => {
        const estado =
          getEstadoReal(lista);

        if (
          filtroEstado !==
            "TODOS" &&
          estado !== filtroEstado
        ) {
          return false;
        }

        if (
          filtroTipo !==
            "TODOS" &&
          lista.tipo !== filtroTipo
        ) {
          return false;
        }

        if (
          filtroMoneda !==
            "TODOS" &&
          lista.monedaCodigo !==
            filtroMoneda
        ) {
          return false;
        }

        if (!term) {
          return true;
        }

        return [
          lista.codigo,
          lista.nombre,
          lista.descripcion,
          lista.listaBaseCodigo,
          lista.listaBaseNombre,
          lista.grupoClienteNombre,
          lista.clienteNombre,
          lista.zonaNombre,
          lista.canalVentaNombre,
          lista.monedaCodigo,
        ]
          .join(" ")
          .toLocaleLowerCase("es")
          .includes(term);
      },
    );
  }, [
    listas,
    busqueda,
    filtroEstado,
    filtroTipo,
    filtroMoneda,
  ]);

  const totalPaginas =
    Math.max(
      1,
      Math.ceil(
        filtradas.length /
          PAGE_SIZE,
      ),
    );

  const paginaActual =
    useMemo(
      () =>
        filtradas.slice(
          (pagina - 1) *
            PAGE_SIZE,
          pagina * PAGE_SIZE,
        ),
      [filtradas, pagina],
    );

  return (
    <section className={styles.page}>
      {flash ? (
        <div
          className={styles.toast}
          role="status"
        >
          <span>✓</span>

          <div>
            <strong>
              Operación realizada
            </strong>
            <small>
              {flash}
            </small>
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
          <div
            className={
              styles.heroMeta
            }
          >
            <span
              className={
                styles.modulePill
              }
            >
              MAESTROS
            </span>

          </div>

          <h1>
            Listas de precios
          </h1>

          <p>
            Precios por mercado,
            cliente, grupo comercial,
            moneda y vigencia.
          </p>
        </div>

        <Link
          href="/listas-precio/nuevo"
          className={
            styles.primaryButton
          }
        >
          <span>＋</span>
          Nueva lista
        </Link>
      </header>

      <section
        className={
          styles.summaryGrid
        }
      >
        <article
          className={`${styles.summaryCard} ${styles.summaryTeal}`}
        >
          <span>
            LISTAS ACTIVAS
          </span>
          <strong>
            {resumen.activas}
          </strong>
          <small>
            Disponibles para operar
          </small>
        </article>

        <article
          className={`${styles.summaryCard} ${styles.summaryBlue}`}
        >
          <span>
            LISTAS DE VENTA
          </span>
          <strong>
            {resumen.venta}
          </strong>
          <small>
            Precios comerciales
          </small>
        </article>

        <article
          className={`${styles.summaryCard} ${styles.summaryPurple}`}
        >
          <span>
            LISTAS DE COMPRA
          </span>
          <strong>
            {resumen.compra}
          </strong>
          <small>
            Referencias de costo
          </small>
        </article>

        <article
          className={`${styles.summaryCard} ${styles.summaryAmber}`}
        >
          <span>
            PRÓXIMAS A VENCER
          </span>
          <strong>
            {
              resumen.proximasAVencer
            }
          </strong>
          <small>
            Dentro de 30 días
          </small>
        </article>
      </section>

      <section
        className={
          styles.contentCard
        }
      >
        <div
          className={
            styles.toolbar
          }
        >
          <label
            className={
              styles.search
            }
          >
            <span>⌕</span>

            <input
              value={busqueda}
              onChange={(event) =>
                setBusqueda(
                  event.target.value,
                )
              }
              placeholder="Buscar por código, nombre, grupo, cliente, canal..."
            />
          </label>

          <span
            className={
              styles.resultCount
            }
          >
            {filtradas.length} de{" "}
            {resumen.total}
          </span>
        </div>

        <div
          className={
            styles.filters
          }
        >
          <label>
            <span>Estado</span>

            <select
              value={filtroEstado}
              onChange={(event) =>
                setFiltroEstado(
                  event.target
                    .value as EstadoFiltro,
                )
              }
            >
              <option value="TODOS">
                Todos
              </option>
              <option value="ACTIVA">
                Activas
              </option>
              <option value="BORRADOR">
                Borrador
              </option>
              <option value="INACTIVA">
                Inactivas
              </option>
              <option value="VENCIDA">
                Vencidas
              </option>
            </select>
          </label>

          <label>
            <span>Tipo</span>

            <select
              value={filtroTipo}
              onChange={(event) =>
                setFiltroTipo(
                  event.target
                    .value as TipoFiltro,
                )
              }
            >
              <option value="TODOS">
                Todos
              </option>
              <option value="VENTA">
                Venta
              </option>
              <option value="COMPRA">
                Compra
              </option>
            </select>
          </label>

          <label>
            <span>Moneda</span>

            <select
              value={filtroMoneda}
              onChange={(event) =>
                setFiltroMoneda(
                  event.target
                    .value as MonedaFiltro,
                )
              }
            >
              <option value="TODOS">
                Todas
              </option>
              {Array.from(
                new Set(
                  listas.map((l) => l.monedaCodigo),
                ),
              )
                .sort()
                .map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
            </select>
          </label>

          <button
            type="button"
            className={
              styles.clearButton
            }
            onClick={() => {
              setBusqueda("");
              setFiltroEstado(
                "TODOS",
              );
              setFiltroTipo(
                "TODOS",
              );
              setFiltroMoneda(
                "TODOS",
              );
            }}
          >
            Limpiar filtros
          </button>
        </div>

        <div
          className={
            styles.listHeader
          }
        >
          <span>
            Lista de precios
          </span>
          <span>
            Aplicación
          </span>
          <span>
            Condiciones
          </span>
          <span />
        </div>

        <div className={styles.list}>
          {paginaActual.map(
            (lista) => {
              const estado =
                getEstadoReal(
                  lista,
                );

              return (
                <article
                  key={lista.id}
                  className={
                    styles.priceRow
                  }
                >
                  <div
                    className={
                      styles.priceMain
                    }
                  >
                    <div
                      className={
                        styles.avatar
                      }
                    >
                      {lista.tipo ===
                      "VENTA"
                        ? "$"
                        : "C"}
                    </div>

                    <div
                      className={
                        styles.priceIdentity
                      }
                    >
                      <div
                        className={
                          styles.identityTop
                        }
                      >
                        <strong>
                          {lista.nombre}
                        </strong>

                        <span
                          className={
                            styles.code
                          }
                        >
                          {lista.codigo}
                        </span>
                      </div>

                      <span
                        className={
                          styles.description
                        }
                      >
                        {lista.descripcion ||
                          "Sin descripción"}
                      </span>

                      <div
                        className={
                          styles.metaLine
                        }
                      >
                        <span>
                          {lista.productosCount}{" "}
                          productos
                        </span>

                        <span>
                          {formatMoneda(
                            lista.monedaCodigo,
                          )}
                        </span>

                        <span>
                          {lista.incluyeIva
                            ? "IVA incluido"
                            : "IVA no incluido"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    className={
                      styles.application
                    }
                  >
                    <strong>
                      {getAplicacion(
                        lista,
                      )}
                    </strong>

                    <span>
                      {lista.listaBaseNombre
                        ? `Base: ${lista.listaBaseCodigo} · ${lista.listaBaseNombre}`
                        : "Sin lista base"}
                    </span>

                    <small>
                      Prioridad{" "}
                      {lista.prioridad}
                    </small>
                  </div>

                  <div
                    className={
                      styles.conditions
                    }
                  >
                    <strong>
                      {getModoLabel(
                        lista,
                      )}
                    </strong>

                    <span>
                      {formatearFecha(
                        lista.vigenteDesde,
                      )}{" "}
                      →{" "}
                      {formatearFecha(
                        lista.vigenteHasta,
                      )}
                    </span>

                    <div
                      className={
                        styles.statuses
                      }
                    >
                      <span
                        className={
                          lista.tipo ===
                          "VENTA"
                            ? styles.statusSale
                            : styles.statusPurchase
                        }
                      >
                        {lista.tipo ===
                        "VENTA"
                          ? "Venta"
                          : "Compra"}
                      </span>

                      <span
                        className={
                          estado ===
                          "ACTIVA"
                            ? styles.statusActive
                            : estado ===
                                "VENCIDA"
                              ? styles.statusExpired
                              : estado ===
                                  "BORRADOR"
                                ? styles.statusDraft
                                : styles.statusInactive
                        }
                      >
                        {estado ===
                        "ACTIVA"
                          ? "Activa"
                          : estado ===
                              "VENCIDA"
                            ? "Vencida"
                            : estado ===
                                "BORRADOR"
                              ? "Borrador"
                              : "Inactiva"}
                      </span>
                    </div>
                  </div>

                  <Link
                    href={`/listas-precio/${lista.id}`}
                    className={
                      styles.detailButton
                    }
                  >
                    Ver lista
                    <span>›</span>
                  </Link>
                </article>
              );
            },
          )}

          {paginaActual.length ===
          0 ? (
            <div
              className={
                styles.empty
              }
            >
              <strong>
                {cargando
                  ? "Cargando listas de precios..."
                  : errorCarga ||
                    "No se encontraron listas de precios."}
              </strong>

              {!cargando && !errorCarga ? (
                <span>
                  Modifique los filtros
                  o cree una nueva lista.
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <footer
          className={
            styles.pagination
          }
        >
          <span>
            Mostrando{" "}
            {filtradas.length === 0
              ? 0
              : (pagina - 1) *
                  PAGE_SIZE +
                1}
            –
            {Math.min(
              pagina * PAGE_SIZE,
              filtradas.length,
            )}{" "}
            de {filtradas.length}
          </span>

          <div>
            <button
              type="button"
              disabled={pagina === 1}
              onClick={() =>
                setPagina(
                  (actual) =>
                    actual - 1,
                )
              }
            >
              ‹
            </button>

            <strong>
              {pagina} /{" "}
              {totalPaginas}
            </strong>

            <button
              type="button"
              disabled={
                pagina ===
                totalPaginas
              }
              onClick={() =>
                setPagina(
                  (actual) =>
                    actual + 1,
                )
              }
            >
              ›
            </button>
          </div>
        </footer>
      </section>
    </section>
  );
}