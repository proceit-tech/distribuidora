"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  consumirClienteFlash,
  obtenerClientesDemo,
} from "@/lib/mocks/clientes-storage";
import type {
  ClienteDemo,
  ClienteNaturaleza,
  ClienteOperacion,
} from "@/types/clientes";

import styles from "./page.module.css";

const PAGE_SIZE = 8;

type EstadoFiltro =
  | "TODOS"
  | "ACTIVOS"
  | "INACTIVOS"
  | "BLOQUEADOS";

type NaturalezaFiltro =
  | "TODAS"
  | ClienteNaturaleza;

type OperacionFiltro =
  | "TODAS"
  | ClienteOperacion;

function dinero(value: number) {
  return new Intl.NumberFormat(
    "es-PY",
    {
      maximumFractionDigits: 0,
    },
  ).format(value);
}

function documento(cliente: ClienteDemo) {
  if (
    cliente.naturaleza ===
    "CONTRIBUYENTE"
  ) {
    return `RUC ${cliente.numeroDocumento}${
      cliente.dv
        ? `-${cliente.dv}`
        : ""
    }`;
  }

  if (
    cliente.tipoDocumento ===
    "INNOMINADO"
  ) {
    return "Innominado";
  }

  return `${cliente.tipoDocumento.replaceAll(
    "_",
    " ",
  )} ${cliente.numeroDocumento}`;
}

function contactoPrincipal(
  cliente: ClienteDemo,
) {
  return (
    cliente.telefono ||
    cliente.celular ||
    "Sin teléfono"
  );
}

export default function ClientesPage() {
  const [clientes, setClientes] =
    useState<ClienteDemo[]>([]);

  const [busqueda, setBusqueda] =
    useState("");

  const [
    filtroEstado,
    setFiltroEstado,
  ] =
    useState<EstadoFiltro>("TODOS");

  const [
    filtroNaturaleza,
    setFiltroNaturaleza,
  ] =
    useState<NaturalezaFiltro>("TODAS");

  const [
    filtroOperacion,
    setFiltroOperacion,
  ] =
    useState<OperacionFiltro>("TODAS");

  const [pagina, setPagina] =
    useState(1);

  const [flash, setFlash] =
    useState("");

  useEffect(() => {
    setClientes(
      obtenerClientesDemo(),
    );

    setFlash(
      consumirClienteFlash(),
    );
  }, []);

  useEffect(() => {
    setPagina(1);
  }, [
    busqueda,
    filtroEstado,
    filtroNaturaleza,
    filtroOperacion,
  ]);

  useEffect(() => {
    if (!flash) {
      return;
    }

    const timer = window.setTimeout(
      () => setFlash(""),
      4200,
    );

    return () => {
      window.clearTimeout(timer);
    };
  }, [flash]);

  const resumo = useMemo(() => {
    return clientes.reduce(
      (acc, cliente) => {
        acc.total += 1;

        if (cliente.activo) {
          acc.activos += 1;
        } else {
          acc.inactivos += 1;
        }

        if (
          cliente.bloqueadoVentas
        ) {
          acc.bloqueados += 1;
        }

        acc.credito +=
          cliente.limiteCredito;

        return acc;
      },
      {
        total: 0,
        activos: 0,
        inactivos: 0,
        bloqueados: 0,
        credito: 0,
      },
    );
  }, [clientes]);

  const filtrados = useMemo(() => {
    const term =
      busqueda
        .trim()
        .toLocaleLowerCase("es");

    return clientes.filter(
      (cliente) => {
        if (
          filtroEstado ===
            "ACTIVOS" &&
          !cliente.activo
        ) {
          return false;
        }

        if (
          filtroEstado ===
            "INACTIVOS" &&
          cliente.activo
        ) {
          return false;
        }

        if (
          filtroEstado ===
            "BLOQUEADOS" &&
          !cliente.bloqueadoVentas
        ) {
          return false;
        }

        if (
          filtroNaturaleza !==
            "TODAS" &&
          cliente.naturaleza !==
            filtroNaturaleza
        ) {
          return false;
        }

        if (
          filtroOperacion !==
            "TODAS" &&
          cliente.tipoOperacion !==
            filtroOperacion
        ) {
          return false;
        }

        if (!term) {
          return true;
        }

        return [
          cliente.codigo,
          cliente.razonSocial,
          cliente.nombreFantasia,
          cliente.numeroDocumento,
          cliente.dv,
          cliente.email,
          cliente.telefono,
          cliente.celular,
          cliente.gln,
          cliente.grupoCliente,
          cliente.vendedor,
          cliente.rutaEntrega,
          cliente.zonaComercial,
        ]
          .join(" ")
          .toLocaleLowerCase("es")
          .includes(term);
      },
    );
  }, [
    clientes,
    busqueda,
    filtroEstado,
    filtroNaturaleza,
    filtroOperacion,
  ]);

  const totalPaginas = Math.max(
    1,
    Math.ceil(
      filtrados.length /
        PAGE_SIZE,
    ),
  );

  useEffect(() => {
    if (pagina > totalPaginas) {
      setPagina(totalPaginas);
    }
  }, [pagina, totalPaginas]);

  const paginaActual = useMemo(
    () =>
      filtrados.slice(
        (pagina - 1) * PAGE_SIZE,
        pagina * PAGE_SIZE,
      ),
    [filtrados, pagina],
  );

  function limpiarFiltros() {
    setBusqueda("");
    setFiltroEstado("TODOS");
    setFiltroNaturaleza("TODAS");
    setFiltroOperacion("TODAS");
  }

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
            <small>{flash}</small>
          </div>

          <button
            type="button"
            aria-label="Cerrar mensaje"
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
            className={styles.heroMeta}
          >
            <span
              className={
                styles.modulePill
              }
            >
              MAESTROS
            </span>

            <span
              className={styles.demoPill}
            >
              DEMO
            </span>
          </div>

          <h1>Clientes</h1>

          <p>
            Gestión fiscal, comercial,
            crédito, contactos y
            logística de clientes.
          </p>
        </div>

        <Link
          href="/clientes/nuevo"
          className={
            styles.primaryButton
          }
        >
          <span>＋</span>
          Nuevo cliente
        </Link>
      </header>

      <section
        className={styles.summaryGrid}
      >
        <article
          className={[
            styles.summaryCard,
            styles.summaryTeal,
          ].join(" ")}
        >
          <span>
            CLIENTES ACTIVOS
          </span>
          <strong>
            {resumo.activos}
          </strong>
          <small>
            Disponibles para operar
          </small>
        </article>

        <article
          className={[
            styles.summaryCard,
            styles.summaryBlue,
          ].join(" ")}
        >
          <span>
            CRÉDITO AUTORIZADO
          </span>
          <strong>
            Gs.{" "}
            {dinero(
              resumo.credito,
            )}
          </strong>
          <small>
            Límite comercial total
          </small>
        </article>

        <article
          className={[
            styles.summaryCard,
            styles.summaryRed,
          ].join(" ")}
        >
          <span>
            VENTAS BLOQUEADAS
          </span>
          <strong>
            {resumo.bloqueados}
          </strong>
          <small>
            Requieren revisión
          </small>
        </article>

        <article
          className={[
            styles.summaryCard,
            styles.summaryViolet,
          ].join(" ")}
        >
          <span>
            INACTIVOS
          </span>
          <strong>
            {resumo.inactivos}
          </strong>
          <small>
            Sin operación habilitada
          </small>
        </article>
      </section>

      <section
        className={styles.contentCard}
      >
        <div
          className={styles.toolbar}
        >
          <label
            className={styles.search}
          >
            <span>⌕</span>

            <input
              value={busqueda}
              onChange={(event) =>
                setBusqueda(
                  event.target.value,
                )
              }
              placeholder="Buscar por nombre, código, RUC, GLN, vendedor..."
            />
          </label>

          <div
            className={
              styles.toolbarRight
            }
          >
            <span
              className={
                styles.resultCount
              }
            >
              {filtrados.length} de{" "}
              {resumo.total}
            </span>
          </div>
        </div>

        <div
          className={styles.filters}
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
              <option value="ACTIVOS">
                Activos
              </option>
              <option value="INACTIVOS">
                Inactivos
              </option>
              <option value="BLOQUEADOS">
                Ventas bloqueadas
              </option>
            </select>
          </label>

          <label>
            <span>Naturaleza</span>
            <select
              value={
                filtroNaturaleza
              }
              onChange={(event) =>
                setFiltroNaturaleza(
                  event.target
                    .value as NaturalezaFiltro,
                )
              }
            >
              <option value="TODAS">
                Todas
              </option>
              <option value="CONTRIBUYENTE">
                Contribuyente
              </option>
              <option value="NO_CONTRIBUYENTE">
                No contribuyente
              </option>
            </select>
          </label>

          <label>
            <span>Operación</span>
            <select
              value={
                filtroOperacion
              }
              onChange={(event) =>
                setFiltroOperacion(
                  event.target
                    .value as OperacionFiltro,
                )
              }
            >
              <option value="TODAS">
                Todas
              </option>
              <option value="B2B">
                B2B
              </option>
              <option value="B2C">
                B2C
              </option>
              <option value="B2G">
                B2G
              </option>
              <option value="B2F">
                B2F
              </option>
            </select>
          </label>

          <button
            type="button"
            className={
              styles.clearButton
            }
            onClick={limpiarFiltros}
          >
            Limpiar filtros
          </button>
        </div>

        <div
          className={styles.listHeader}
        >
          <span>Cliente</span>
          <span>
            Comercial / logística
          </span>
          <span>
            Crédito / estado
          </span>
          <span />
        </div>

        <div className={styles.list}>
          {paginaActual.length ===
          0 ? (
            <div
              className={styles.empty}
            >
              <strong>
                No encontramos clientes
              </strong>
              <span>
                Cambie los filtros o
                registre un nuevo
                cliente.
              </span>
            </div>
          ) : (
            paginaActual.map(
              (cliente) => (
                <article
                  key={cliente.id}
                  className={
                    styles.clientRow
                  }
                >
                  <div
                    className={
                      styles.clientMain
                    }
                  >
                    <div
                      className={
                        styles.avatar
                      }
                    >
                      {cliente.razonSocial
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((part) =>
                          part
                            .charAt(0)
                            .toUpperCase(),
                        )
                        .join("")}
                    </div>

                    <div
                      className={
                        styles.clientIdentity
                      }
                    >
                      <div
                        className={
                          styles.identityTop
                        }
                      >
                        <strong>
                          {
                            cliente.razonSocial
                          }
                        </strong>

                        <span
                          className={
                            styles.code
                          }
                        >
                          {cliente.codigo}
                        </span>
                      </div>

                      <span
                        className={
                          styles.document
                        }
                      >
                        {documento(
                          cliente,
                        )}
                        <i>·</i>
                        {
                          cliente.tipoOperacion
                        }
                        <i>·</i>
                        {
                          cliente.paisNombre
                        }
                      </span>

                      <div
                        className={
                          styles.contactLine
                        }
                      >
                        <span>
                          {contactoPrincipal(
                            cliente,
                          )}
                        </span>

                        <span>
                          {cliente.email ||
                            "Sin correo"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    className={
                      styles.commercial
                    }
                  >
                    <strong>
                      {cliente.grupoCliente ||
                        "Sin grupo"}
                    </strong>

                    <span>
                      {cliente.vendedor ||
                        "Sin vendedor"}
                    </span>

                    <small>
                      {cliente.rutaEntrega ||
                        cliente.zonaComercial ||
                        "Sin ruta o zona"}
                    </small>
                  </div>

                  <div
                    className={
                      styles.creditBlock
                    }
                  >
                    <strong>
                      Gs.{" "}
                      {dinero(
                        cliente.limiteCredito,
                      )}
                    </strong>

                    <span>
                      {
                        cliente.condicionPago
                      }
                    </span>

                    <div
                      className={
                        styles.statuses
                      }
                    >
                      <span
                        className={
                          cliente.activo
                            ? styles.statusActive
                            : styles.statusInactive
                        }
                      >
                        {cliente.activo
                          ? "Activo"
                          : "Inactivo"}
                      </span>

                      {cliente.bloqueadoVentas ? (
                        <span
                          className={
                            styles.statusBlocked
                          }
                        >
                          Bloqueado
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <Link
                    href={`/clientes/${cliente.id}`}
                    className={
                      styles.detailButton
                    }
                  >
                    Ver ficha
                    <span>›</span>
                  </Link>
                </article>
              ),
            )
          )}
        </div>

        <footer
          className={styles.pagination}
        >
          <span>
            Mostrando{" "}
            {filtrados.length === 0
              ? 0
              : (pagina - 1) *
                  PAGE_SIZE +
                1}
            –
            {Math.min(
              pagina * PAGE_SIZE,
              filtrados.length,
            )}{" "}
            de {filtrados.length}
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
                pagina === totalPaginas
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
