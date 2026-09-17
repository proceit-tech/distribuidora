"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  consumirProveedorFlash,
  obtenerProveedoresDemo,
} from "@/lib/mocks/proveedores-storage";

import type {
  ProveedorDemo,
  ProveedorEstadoHomologacion,
  ProveedorNivelRiesgo,
} from "@/types/proveedores";

import styles from "./page.module.css";

const PAGE_SIZE = 8;

type EstadoFiltro =
  | "TODOS"
  | "ACTIVOS"
  | "INACTIVOS";

type HomologacionFiltro =
  | "TODAS"
  | ProveedorEstadoHomologacion;

type RiesgoFiltro =
  | "TODOS"
  | ProveedorNivelRiesgo;

function money(
  value: number,
  currency: string,
) {
  if (currency === "USD") {
    return `USD ${new Intl.NumberFormat(
      "es-PY",
      {
        maximumFractionDigits: 2,
      },
    ).format(value)}`;
  }

  return `Gs. ${new Intl.NumberFormat(
    "es-PY",
    {
      maximumFractionDigits: 0,
    },
  ).format(value)}`;
}

function documento(
  proveedor: ProveedorDemo,
) {
  if (
    proveedor.tipoDocumento === "RUC"
  ) {
    return `RUC ${proveedor.numeroDocumento}${
      proveedor.dv
        ? `-${proveedor.dv}`
        : ""
    }`;
  }

  return `${proveedor.tipoDocumento.replaceAll(
    "_",
    " ",
  )} ${proveedor.numeroDocumento}`;
}

function initials(
  value: string,
) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((item) =>
      item.charAt(0).toUpperCase(),
    )
    .join("");
}

function homologacionClass(
  value: ProveedorEstadoHomologacion,
) {
  if (value === "HOMOLOGADO") {
    return styles.badgeSuccess;
  }

  if (
    value === "RECHAZADO" ||
    value === "SUSPENDIDO" ||
    value === "VENCIDO"
  ) {
    return styles.badgeDanger;
  }

  if (
    value === "EN_EVALUACION"
  ) {
    return styles.badgeInfo;
  }

  return styles.badgeWarning;
}

function riesgoClass(
  value: ProveedorNivelRiesgo,
) {
  if (value === "BAJO") {
    return styles.riskLow;
  }

  if (value === "MEDIO") {
    return styles.riskMedium;
  }

  if (
    value === "ALTO" ||
    value === "CRITICO"
  ) {
    return styles.riskHigh;
  }

  return styles.riskNeutral;
}

export default function ProveedoresPage() {
  const [
    proveedores,
    setProveedores,
  ] = useState<ProveedorDemo[]>([]);

  const [busqueda, setBusqueda] =
    useState("");

  const [
    filtroEstado,
    setFiltroEstado,
  ] =
    useState<EstadoFiltro>("TODOS");

  const [
    filtroHomologacion,
    setFiltroHomologacion,
  ] =
    useState<HomologacionFiltro>(
      "TODAS",
    );

  const [
    filtroRiesgo,
    setFiltroRiesgo,
  ] =
    useState<RiesgoFiltro>("TODOS");

  const [pagina, setPagina] =
    useState(1);

  const [flash, setFlash] =
    useState("");

  useEffect(() => {
    setProveedores(
      obtenerProveedoresDemo(),
    );

    setFlash(
      consumirProveedorFlash(),
    );
  }, []);

  useEffect(() => {
    setPagina(1);
  }, [
    busqueda,
    filtroEstado,
    filtroHomologacion,
    filtroRiesgo,
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
    return proveedores.reduce(
      (acc, proveedor) => {
        acc.total += 1;

        if (proveedor.activo) {
          acc.activos += 1;
        }

        if (
          proveedor.estadoHomologacion ===
          "HOMOLOGADO"
        ) {
          acc.homologados += 1;
        }

        if (
          proveedor.nivelRiesgo ===
            "ALTO" ||
          proveedor.nivelRiesgo ===
            "CRITICO"
        ) {
          acc.riesgoAlto += 1;
        }

        return acc;
      },
      {
        total: 0,
        activos: 0,
        homologados: 0,
        riesgoAlto: 0,
      },
    );
  }, [proveedores]);

  const filtrados = useMemo(() => {
    const term =
      busqueda
        .trim()
        .toLocaleLowerCase("es");

    return proveedores.filter(
      (proveedor) => {
        if (
          filtroEstado ===
            "ACTIVOS" &&
          !proveedor.activo
        ) {
          return false;
        }

        if (
          filtroEstado ===
            "INACTIVOS" &&
          proveedor.activo
        ) {
          return false;
        }

        if (
          filtroHomologacion !==
            "TODAS" &&
          proveedor.estadoHomologacion !==
            filtroHomologacion
        ) {
          return false;
        }

        if (
          filtroRiesgo !==
            "TODOS" &&
          proveedor.nivelRiesgo !==
            filtroRiesgo
        ) {
          return false;
        }

        if (!term) {
          return true;
        }

        return [
          proveedor.codigo,
          proveedor.razonSocial,
          proveedor.nombreFantasia,
          proveedor.numeroDocumento,
          proveedor.email,
          proveedor.telefono,
          proveedor.grupoProveedor,
          proveedor.condicionPago,
          proveedor.paisNombre,
          proveedor.estadoHomologacion,
          proveedor.nivelRiesgo,
        ]
          .join(" ")
          .toLocaleLowerCase("es")
          .includes(term);
      },
    );
  }, [
    proveedores,
    busqueda,
    filtroEstado,
    filtroHomologacion,
    filtroRiesgo,
  ]);

  const totalPaginas =
    Math.max(
      1,
      Math.ceil(
        filtrados.length /
          PAGE_SIZE,
      ),
    );

  const paginaActual =
    useMemo(
      () =>
        filtrados.slice(
          (pagina - 1) *
            PAGE_SIZE,
          pagina * PAGE_SIZE,
        ),
      [filtrados, pagina],
    );

  function limpiarFiltros() {
    setBusqueda("");
    setFiltroEstado("TODOS");
    setFiltroHomologacion("TODAS");
    setFiltroRiesgo("TODOS");
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

          <h1>Proveedores</h1>

          <p>
            Gestión comercial,
            compras, pagos,
            homologación y logística.
          </p>
        </div>

        <Link
          href="/proveedores/nuevo"
          className={
            styles.primaryButton
          }
        >
          <span>＋</span>
          Nuevo proveedor
        </Link>
      </header>

      <section
        className={
          styles.summaryGrid
        }
      >
        <article
          className={[
            styles.summaryCard,
            styles.summaryTeal,
          ].join(" ")}
        >
          <span>
            PROVEEDORES ACTIVOS
          </span>
          <strong>
            {resumen.activos}
          </strong>
          <small>
            Disponibles para compras
          </small>
        </article>

        <article
          className={[
            styles.summaryCard,
            styles.summaryBlue,
          ].join(" ")}
        >
          <span>
            HOMOLOGADOS
          </span>
          <strong>
            {resumen.homologados}
          </strong>
          <small>
            Aprobación vigente
          </small>
        </article>

        <article
          className={[
            styles.summaryCard,
            styles.summaryRed,
          ].join(" ")}
        >
          <span>
            RIESGO ALTO / CRÍTICO
          </span>
          <strong>
            {resumen.riesgoAlto}
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
            TOTAL REGISTRADOS
          </span>
          <strong>
            {resumen.total}
          </strong>
          <small>
            Base de proveedores
          </small>
        </article>
      </section>

      <section
        className={
          styles.contentCard
        }
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
              placeholder="Buscar proveedor, código, RUC, grupo..."
            />
          </label>

          <span
            className={
              styles.resultCount
            }
          >
            {filtrados.length} de{" "}
            {resumen.total}
          </span>
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
            </select>
          </label>

          <label>
            <span>Homologación</span>

            <select
              value={
                filtroHomologacion
              }
              onChange={(event) =>
                setFiltroHomologacion(
                  event.target
                    .value as HomologacionFiltro,
                )
              }
            >
              <option value="TODAS">
                Todas
              </option>
              <option value="HOMOLOGADO">
                Homologado
              </option>
              <option value="PENDIENTE">
                Pendiente
              </option>
              <option value="EN_EVALUACION">
                En evaluación
              </option>
              <option value="SUSPENDIDO">
                Suspendido
              </option>
              <option value="VENCIDO">
                Vencido
              </option>
              <option value="RECHAZADO">
                Rechazado
              </option>
            </select>
          </label>

          <label>
            <span>Riesgo</span>

            <select
              value={filtroRiesgo}
              onChange={(event) =>
                setFiltroRiesgo(
                  event.target
                    .value as RiesgoFiltro,
                )
              }
            >
              <option value="TODOS">
                Todos
              </option>
              <option value="NO_EVALUADO">
                No evaluado
              </option>
              <option value="BAJO">
                Bajo
              </option>
              <option value="MEDIO">
                Medio
              </option>
              <option value="ALTO">
                Alto
              </option>
              <option value="CRITICO">
                Crítico
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
          <span>Proveedor</span>
          <span>
            Compras / pagos
          </span>
          <span>
            Homologación / riesgo
          </span>
          <span />
        </div>

        <div className={styles.list}>
          {paginaActual.map(
            (proveedor) => (
              <article
                key={proveedor.id}
                className={
                  styles.providerRow
                }
              >
                <div
                  className={
                    styles.providerMain
                  }
                >
                  <div
                    className={
                      styles.avatar
                    }
                  >
                    {initials(
                      proveedor.razonSocial,
                    )}
                  </div>

                  <div
                    className={
                      styles.providerIdentity
                    }
                  >
                    <div
                      className={
                        styles.identityTop
                      }
                    >
                      <strong>
                        {
                          proveedor.razonSocial
                        }
                      </strong>

                      <span
                        className={
                          styles.code
                        }
                      >
                        {
                          proveedor.codigo
                        }
                      </span>
                    </div>

                    <span
                      className={
                        styles.document
                      }
                    >
                      {documento(
                        proveedor,
                      )}
                      <i>·</i>
                      {
                        proveedor.paisNombre
                      }
                    </span>

                    <div
                      className={
                        styles.contactLine
                      }
                    >
                      <span>
                        {proveedor.telefono ||
                          "Sin teléfono"}
                      </span>

                      <span>
                        {proveedor.email ||
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
                    {proveedor.grupoProveedor ||
                      "Sin grupo"}
                  </strong>

                  <span>
                    {
                      proveedor.condicionPago
                    }
                  </span>

                  <small>
                    {money(
                      proveedor.montoMinimoCompra,
                      proveedor.monedaCodigoPredeterminada,
                    )}{" "}
                    mínimo
                  </small>
                </div>

                <div
                  className={
                    styles.homologation
                  }
                >
                  <div
                    className={
                      styles.badgeRow
                    }
                  >
                    <span
                      className={[
                        styles.badge,
                        homologacionClass(
                          proveedor.estadoHomologacion,
                        ),
                      ].join(" ")}
                    >
                      {proveedor.estadoHomologacion.replaceAll(
                        "_",
                        " ",
                      )}
                    </span>

                    <span
                      className={[
                        styles.risk,
                        riesgoClass(
                          proveedor.nivelRiesgo,
                        ),
                      ].join(" ")}
                    >
                      {
                        proveedor.nivelRiesgo
                      }
                    </span>
                  </div>

                  <small>
                    {proveedor.calificacionActual !==
                    null
                      ? `Calificación ${proveedor.calificacionActual}/100`
                      : "Sin calificación"}
                  </small>

                  <span
                    className={
                      proveedor.activo
                        ? styles.statusActive
                        : styles.statusInactive
                    }
                  >
                    {proveedor.activo
                      ? "Activo"
                      : "Inactivo"}
                  </span>
                </div>

                <Link
                  href={`/proveedores/${proveedor.id}`}
                  className={
                    styles.detailButton
                  }
                >
                  Ver ficha
                  <span>›</span>
                </Link>
              </article>
            ),
          )}
        </div>

        <footer
          className={
            styles.pagination
          }
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
