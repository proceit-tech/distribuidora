"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ProductoLista,
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

type FilaApi = {
  id: string;
  codigo: string;
  codigo_inventario: string | null;
  codigo_sifen: string | null;
  codigo_barras: string | null;
  descripcion: string;
  descripcion_factura: string;
  tipo_producto: ProductoTipo;
  controla_stock: boolean;
  stock_minimo: number;
  punto_reposicion: number | null;
  activo: boolean;
  origen_etiqueta: string | null;
  pais_origen_nombre: string | null;
  categoria: string | null;
  marca: string | null;
  impuesto: string | null;
  unidad_nombre: string | null;
  stock_disponible: number;
  bajo_minimo: boolean;
};

function desdeApi(fila: FilaApi): ProductoLista {
  return {
    id: fila.id,
    codigo: fila.codigo,
    codigoInventario: fila.codigo_inventario ?? "",
    codigoSifen: fila.codigo_sifen ?? "",
    codigoBarras: fila.codigo_barras ?? "",
    descripcion: fila.descripcion,
    descripcionFactura: fila.descripcion_factura,
    tipoProducto: fila.tipo_producto,
    categoriaNombre: fila.categoria ?? "",
    marcaNombre: fila.marca ?? "",
    impuestoNombre: fila.impuesto ?? "",
    unidadMedidaNombre: fila.unidad_nombre ?? "",
    procedencia: fila.origen_etiqueta ?? "",
    paisOrigenNombre: fila.pais_origen_nombre ?? "",
    controlaStock: fila.controla_stock,
    stockMinimo: Number(fila.stock_minimo ?? 0),
    puntoReposicion: Number(fila.punto_reposicion ?? 0),
    stockDisponible: Number(fila.stock_disponible ?? 0),
    bajoMinimo: fila.bajo_minimo,
    activo: fila.activo,
  };
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
    useState<ProductoLista[]>([]);

  const [busqueda, setBusqueda] =
    useState("");

  const [filtroEstado, setFiltroEstado] =
    useState<EstadoFiltro>("TODOS");

  const [filtroTipo, setFiltroTipo] =
    useState<TipoFiltro>("TODOS");

  const [filtroMarca, setFiltroMarca] =
    useState("TODAS");

  const [
    filtroProcedencia,
    setFiltroProcedencia,
  ] = useState("TODAS");

  const [pagina, setPagina] =
    useState(1);

  const [cargando, setCargando] =
    useState(true);

  const [errorCarga, setErrorCarga] =
    useState("");

  useEffect(() => {
    let activo = true;

    async function cargar() {
      try {
        const respuesta = await fetch(
          "/api/productos",
          { cache: "no-store" },
        );

        if (!respuesta.ok) {
          const json = (await respuesta
            .json()
            .catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(
            json.error ??
              "No fue posible cargar los productos.",
          );
        }

        const json =
          (await respuesta.json()) as {
            productos: FilaApi[];
          };

        if (activo) {
          setProductos(
            json.productos.map(desdeApi),
          );
        }
      } catch (e) {
        if (activo) {
          setErrorCarga(
            e instanceof Error
              ? e.message
              : "No fue posible cargar los productos.",
          );
        }
      } finally {
        if (activo) {
          setCargando(false);
        }
      }
    }

    void cargar();

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
    filtroMarca,
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
            producto.stockDisponible || 0,
          );

        if (
          Number(
            producto.stockDisponible || 0,
          ) <= 0
        ) {
          acc.sinStock += 1;
        }

        if (producto.bajoMinimo) {
          acc.bajoMinimo += 1;
        }

        return acc;
      },
      {
        total: 0,
        activos: 0,
        inventario: 0,
        sinStock: 0,
        bajoMinimo: 0,
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
              producto.categoriaNombre,
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
          </div>

          <h1>Productos</h1>

          <p>
            Catálogo de productos de su
            empresa.
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
            Stock disponible consolidado
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
            BAJO EL MÍNIMO
          </span>

          <strong>
            {resumen.bajoMinimo}
          </strong>

          <small>
            Stock bajo el mínimo configurado
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
              placeholder="Buscar por código, código inventario, descripción, marca, categoría..."
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
            Reposición
          </span>
          <span />
        </div>

        <div className={styles.list}>
          {cargando ? (
            <div className={styles.empty}>
              <strong>
                Cargando productos...
              </strong>
            </div>
          ) : errorCarga ? (
            <div
              className={styles.empty}
              role="alert"
            >
              <strong>
                No fue posible cargar los productos
              </strong>
              <span>{errorCarga}</span>
            </div>
          ) : paginaActual.length === 0 ? (
            <div className={styles.empty}>
              <strong>
                {productos.length === 0
                  ? "Aún no hay productos registrados"
                  : "No se encontraron productos."}
              </strong>
              <span>
                {productos.length === 0
                  ? "Registre el primer producto con el botón Nuevo producto."
                  : "Modifique los filtros aplicados."}
              </span>
            </div>
          ) : (
            paginaActual.map(
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
                    {producto.categoriaNombre ||
                      "Sin categoría"}
                  </strong>

                  <span>
                    {producto.tipoProducto.replaceAll(
                      "_",
                      " ",
                    )}
                  </span>

                  <small>
                    {producto.impuestoNombre ||
                      "Sin impuesto"}
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
                        producto.stockDisponible ||
                          0,
                      ),
                    )}{" "}
                    {
                      producto.unidadMedidaNombre
                    }
                  </strong>

                  <span>
                    Mínimo:{" "}
                    {new Intl.NumberFormat(
                      "es-PY",
                      {
                        maximumFractionDigits: 2,
                      },
                    ).format(
                      Number(
                        producto.stockMinimo ||
                          0,
                      ),
                    )}
                  </span>

                  <span
                    className={
                      Number(
                        producto.stockDisponible ||
                          0,
                      ) <= 0
                        ? styles.statusDanger
                        : styles.statusActive
                    }
                  >
                    {Number(
                      producto.stockDisponible ||
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
                    {new Intl.NumberFormat(
                      "es-PY",
                      {
                        maximumFractionDigits: 2,
                      },
                    ).format(
                      Number(
                        producto.puntoReposicion ||
                          0,
                      ),
                    )}
                  </strong>

                  <span>
                    Punto de reposición
                  </span>

                  <small>
                    Código de barras:{" "}
                    {producto.codigoBarras ||
                      "—"}
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
          ))}
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