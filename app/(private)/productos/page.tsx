"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  obtenerProductosDemo,
} from "@/lib/mocks/productos-storage";

import {
  ProductoDemo,
  ProductoTipo,
} from "@/types/productos";

import styles from "./page.module.css";

const PAGE_SIZE = 20;

type EstadoFiltro =
  | "TODOS"
  | "ACTIVOS"
  | "INACTIVOS";

type TipoFiltro =
  | "TODOS"
  | ProductoTipo;

function money(value: number) {
  return `Gs. ${new Intl.NumberFormat(
    "es-PY",
    {
      maximumFractionDigits: 0,
    },
  ).format(value)}`;
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((item) =>
      item.charAt(0).toUpperCase(),
    )
    .join("");
}

function normalizar(value: string) {
  return value
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      "",
    )
    .toLocaleLowerCase("es");
}

export default function ProductosPage() {
  const [productos, setProductos] =
    useState<ProductoDemo[]>([]);

  const [busqueda, setBusqueda] =
    useState("");

  const [filtroEstado, setFiltroEstado] =
    useState<EstadoFiltro>("TODOS");

  const [filtroTipo, setFiltroTipo] =
    useState<TipoFiltro>("TODOS");

  const [filtroMarca, setFiltroMarca] =
    useState("TODAS");

  const [filtroFamilia, setFiltroFamilia] =
    useState("TODAS");

  const [filtroLinea, setFiltroLinea] =
    useState("TODAS");

  const [
    filtroProcedencia,
    setFiltroProcedencia,
  ] = useState("TODAS");

  const [pagina, setPagina] =
    useState(1);

  useEffect(() => {
    setProductos(
      obtenerProductosDemo(),
    );
  }, []);

  useEffect(() => {
    setPagina(1);
  }, [
    busqueda,
    filtroEstado,
    filtroTipo,
    filtroMarca,
    filtroFamilia,
    filtroLinea,
    filtroProcedencia,
  ]);

  const marcas = useMemo(
    () =>
      Array.from(
        new Set(
          productos
            .map(
              (item) =>
                item.marcaNombre,
            )
            .filter(Boolean),
        ),
      ).sort((a, b) =>
        a.localeCompare(b),
      ),
    [productos],
  );

  const familias = useMemo(
    () =>
      Array.from(
        new Set(
          productos
            .map(
              (item) =>
                item.familiaNombre,
            )
            .filter(Boolean),
        ),
      ).sort((a, b) =>
        a.localeCompare(b),
      ),
    [productos],
  );

  const lineas = useMemo(
    () =>
      Array.from(
        new Set(
          productos
            .map(
              (item) =>
                item.lineaNombre,
            )
            .filter(Boolean),
        ),
      ).sort((a, b) =>
        a.localeCompare(b),
      ),
    [productos],
  );

  const procedencias = useMemo(
    () =>
      Array.from(
        new Set(
          productos
            .map(
              (item) =>
                item.procedencia,
            )
            .filter(Boolean),
        ),
      ).sort((a, b) =>
        a.localeCompare(b),
      ),
    [productos],
  );

  const resumen = useMemo(() => {
    return productos.reduce(
      (acc, producto) => {
        acc.total += 1;

        if (producto.activo) {
          acc.activos += 1;
        }

        acc.inventario +=
          Number(
            producto.stockActual || 0,
          );

        acc.valorVenta +=
          Number(
            producto.valorVentaReferencia ||
              0,
          );

        if (
          Number(
            producto.stockActual || 0,
          ) <= 0
        ) {
          acc.sinStock += 1;
        }

        return acc;
      },
      {
        total: 0,
        activos: 0,
        inventario: 0,
        sinStock: 0,
        valorVenta: 0,
      },
    );
  }, [productos]);

  const filtrados = useMemo(() => {
    const term =
      normalizar(
        busqueda.trim(),
      );

    return productos.filter(
      (producto) => {
        if (
          filtroEstado ===
            "ACTIVOS" &&
          !producto.activo
        ) {
          return false;
        }

        if (
          filtroEstado ===
            "INACTIVOS" &&
          producto.activo
        ) {
          return false;
        }

        if (
          filtroTipo !==
            "TODOS" &&
          producto.tipoProducto !==
            filtroTipo
        ) {
          return false;
        }

        if (
          filtroMarca !==
            "TODAS" &&
          producto.marcaNombre !==
            filtroMarca
        ) {
          return false;
        }

        if (
          filtroFamilia !==
            "TODAS" &&
          producto.familiaNombre !==
            filtroFamilia
        ) {
          return false;
        }

        if (
          filtroLinea !==
            "TODAS" &&
          producto.lineaNombre !==
            filtroLinea
        ) {
          return false;
        }

        if (
          filtroProcedencia !==
            "TODAS" &&
          producto.procedencia !==
            filtroProcedencia
        ) {
          return false;
        }

        if (!term) {
          return true;
        }

        const searchable =
          normalizar(
            [
              producto.codigo,
              producto.codigoInventario,
              producto.codigoSifen,
              producto.codigoBarras,
              producto.descripcion,
              producto.descripcionFactura,
              producto.marcaNombre,
              producto.familiaNombre,
              producto.lineaNombre,
              producto.procedencia,
              producto.paisOrigenNombre,
            ].join(" "),
          );

        return searchable.includes(
          term,
        );
      },
    );
  }, [
    productos,
    busqueda,
    filtroEstado,
    filtroTipo,
    filtroMarca,
    filtroFamilia,
    filtroLinea,
    filtroProcedencia,
  ]);

  const totalPaginas = Math.max(
    1,
    Math.ceil(
      filtrados.length /
        PAGE_SIZE,
    ),
  );

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
    setFiltroTipo("TODOS");
    setFiltroMarca("TODAS");
    setFiltroFamilia("TODAS");
    setFiltroLinea("TODAS");
    setFiltroProcedencia("TODAS");
  }

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <div className={styles.heroMeta}>
            <span
              className={
                styles.modulePill
              }
            >
              MAESTROS
            </span>

            <span
              className={
                styles.demoPill
              }
            >
              INVENTARIO MINGO
            </span>
          </div>

          <h1>Productos</h1>

          <p>
            Catálogo completo basado en
            el inventario real del
            cliente.
          </p>
        </div>

        <Link
          href="/productos/nuevo"
          className={
            styles.primaryButton
          }
        >
          ＋ Nuevo producto
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
            PRODUCTOS ACTIVOS
          </span>

          <strong>
            {resumen.activos}
          </strong>

          <small>
            Registros habilitados
          </small>
        </article>

        <article
          className={`${styles.summaryCard} ${styles.summaryBlue}`}
        >
          <span>
            UNIDADES INVENTARIO
          </span>

          <strong>
            {new Intl.NumberFormat(
              "es-PY",
              {
                maximumFractionDigits: 2,
              },
            ).format(
              resumen.inventario,
            )}
          </strong>

          <small>
            Stock inicial consolidado
          </small>
        </article>

        <article
          className={`${styles.summaryCard} ${styles.summaryAmber}`}
        >
          <span>SIN STOCK</span>

          <strong>
            {resumen.sinStock}
          </strong>

          <small>
            Productos con saldo cero
          </small>
        </article>

        <article
          className={`${styles.summaryCard} ${styles.summaryPurple}`}
        >
          <span>
            VALOR A PRECIO VENTA
          </span>

          <strong>
            {money(
              resumen.valorVenta,
            )}
          </strong>

          <small>
            Referencia del inventario
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
              placeholder="Buscar por código, código inventario, descripción, marca, familia, línea..."
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

              <option value="ACTIVOS">
                Activos
              </option>

              <option value="INACTIVOS">
                Inactivos
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

              <option value="MERCADERIA">
                Mercadería
              </option>

              <option value="SERVICIO">
                Servicio
              </option>

              <option value="KIT">
                Kit / combo
              </option>

              <option value="ACTIVO_FIJO">
                Activo fijo
              </option>
            </select>
          </label>

          <label>
            <span>Marca</span>

            <select
              value={filtroMarca}
              onChange={(event) =>
                setFiltroMarca(
                  event.target.value,
                )
              }
            >
              <option value="TODAS">
                Todas
              </option>

              {marcas.map(
                (marca) => (
                  <option
                    key={marca}
                    value={marca}
                  >
                    {marca}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            <span>Familia</span>

            <select
              value={filtroFamilia}
              onChange={(event) =>
                setFiltroFamilia(
                  event.target.value,
                )
              }
            >
              <option value="TODAS">
                Todas
              </option>

              {familias.map(
                (familia) => (
                  <option
                    key={familia}
                    value={familia}
                  >
                    {familia}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            <span>Línea</span>

            <select
              value={filtroLinea}
              onChange={(event) =>
                setFiltroLinea(
                  event.target.value,
                )
              }
            >
              <option value="TODAS">
                Todas
              </option>

              {lineas.map(
                (linea) => (
                  <option
                    key={linea}
                    value={linea}
                  >
                    {linea}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            <span>
              Procedencia
            </span>

            <select
              value={
                filtroProcedencia
              }
              onChange={(event) =>
                setFiltroProcedencia(
                  event.target.value,
                )
              }
            >
              <option value="TODAS">
                Todas
              </option>

              {procedencias.map(
                (procedencia) => (
                  <option
                    key={
                      procedencia
                    }
                    value={
                      procedencia
                    }
                  >
                    {procedencia}
                  </option>
                ),
              )}
            </select>
          </label>

          <button
            type="button"
            className={
              styles.clearButton
            }
            onClick={limpiarFiltros}
          >
            Limpiar
          </button>
        </div>

        <div
          className={
            styles.listHeader
          }
        >
          <span>Producto</span>
          <span>
            Clasificación
          </span>
          <span>
            Inventario
          </span>
          <span>
            Precio venta
          </span>
          <span />
        </div>

        <div className={styles.list}>
          {paginaActual.map(
            (producto) => (
              <article
                key={producto.id}
                className={
                  styles.productRow
                }
              >
                <div
                  className={
                    styles.productMain
                  }
                >
                  <div
                    className={
                      styles.avatar
                    }
                  >
                    {initials(
                      producto.descripcion,
                    )}
                  </div>

                  <div
                    className={
                      styles.productIdentity
                    }
                  >
                    <div
                      className={
                        styles.identityTop
                      }
                    >
                      <strong>
                        {
                          producto.descripcion
                        }
                      </strong>

                      <span
                        className={
                          styles.code
                        }
                      >
                        {
                          producto.codigo
                        }
                      </span>
                    </div>

                    <span
                      className={
                        styles.inventoryCode
                      }
                    >
                      Código inventario:{" "}
                      {producto.codigoInventario ||
                        "—"}
                    </span>

                    <div
                      className={
                        styles.metaLine
                      }
                    >
                      <span>
                        {producto.marcaNombre ||
                          "Sin marca"}
                      </span>

                      <span>
                        {producto.procedencia ||
                          "Sin procedencia"}
                      </span>

                      <span>
                        {
                          producto.unidadMedidaNombre
                        }
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  className={
                    styles.classification
                  }
                >
                  <strong>
                    {producto.familiaNombre ||
                      "Sin familia"}
                  </strong>

                  <span>
                    {producto.lineaNombre ||
                      "Sin línea"}
                  </span>

                  <small>
                    {
                      producto.categoriaNombre
                    }
                  </small>
                </div>

                <div
                  className={
                    styles.stockBlock
                  }
                >
                  <strong>
                    {new Intl.NumberFormat(
                      "es-PY",
                      {
                        maximumFractionDigits: 2,
                      },
                    ).format(
                      Number(
                        producto.stockActual ||
                          0,
                      ),
                    )}{" "}
                    {
                      producto.unidadMedidaNombre
                    }
                  </strong>

                  <span>
                    Inicial:{" "}
                    {new Intl.NumberFormat(
                      "es-PY",
                      {
                        maximumFractionDigits: 2,
                      },
                    ).format(
                      Number(
                        producto.inventarioInicial ||
                          0,
                      ),
                    )}
                  </span>

                  <span
                    className={
                      Number(
                        producto.stockActual ||
                          0,
                      ) <= 0
                        ? styles.statusDanger
                        : styles.statusActive
                    }
                  >
                    {Number(
                      producto.stockActual ||
                        0,
                    ) <= 0
                      ? "Sin stock"
                      : "Disponible"}
                  </span>
                </div>

                <div
                  className={
                    styles.priceBlock
                  }
                >
                  <strong>
                    {money(
                      Number(
                        producto.precioVentaReferencia ||
                          0,
                      ),
                    )}
                  </strong>

                  <span>
                    Valor:{" "}
                    {money(
                      Number(
                        producto.valorVentaReferencia ||
                          0,
                      ),
                    )}
                  </span>

                  <small>
                    Costo promedio:{" "}
                    {money(
                      Number(
                        producto.costoPromedio ||
                          0,
                      ),
                    )}
                  </small>
                </div>

                <Link
                  href={`/productos/${producto.id}`}
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

          {paginaActual.length ===
          0 ? (
            <div
              className={
                styles.empty
              }
            >
              <strong>
                No se encontraron
                productos.
              </strong>

              <span>
                Modifique los filtros
                aplicados.
              </span>
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