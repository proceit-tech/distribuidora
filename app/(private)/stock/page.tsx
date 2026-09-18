"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  obtenerStockDemo,
} from "@/lib/mocks/stock-storage";

import {
  StockDemo,
  StockNivel,
  StockPropiedad,
} from "@/types/stock";

import styles from "./page.module.css";

const PAGE_SIZE = 25;

type NivelFiltro =
  | "TODOS"
  | StockNivel;

type PropiedadFiltro =
  | "TODOS"
  | StockPropiedad;

function money(value: number) {
  return `Gs. ${new Intl.NumberFormat(
    "es-PY",
    {
      maximumFractionDigits: 0,
    },
  ).format(value)}`;
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


const MARKUP_DEMO = 0.2;

function costoUnitario(item: StockDemo) {
  return Number(
    item.precioVentaReferencia || 0,
  );
}

function valorCosto(item: StockDemo) {
  return (
    costoUnitario(item) *
    Number(item.disponible || 0)
  );
}

function precioVentaDemo(item: StockDemo) {
  return costoUnitario(item) *
    (1 + MARKUP_DEMO);
}

function valorVentaDemo(item: StockDemo) {
  return (
    precioVentaDemo(item) *
    Number(item.disponible || 0)
  );
}

function gananciaPotencial(
  item: StockDemo,
) {
  return (
    valorVentaDemo(item) -
    valorCosto(item)
  );
}

function fechaArchivo() {
  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(
      2,
      "0",
    ),
    String(now.getDate()).padStart(
      2,
      "0",
    ),
  ].join("-");
}

function ajustarColumnas(
  sheet: {
    ["!cols"]?: Array<{
      wch?: number;
    }>;
  },
  widths: number[],
) {
  sheet["!cols"] = widths.map(
    (width) => ({
      wch: width,
    }),
  );
}

function descargarWorkbook(
  XLSX: typeof import("xlsx"),
  workbook: import("xlsx").WorkBook,
  nombreArchivo: string,
) {
  XLSX.writeFile(
    workbook,
    nombreArchivo,
    {
      bookType: "xlsx",
      compression: true,
    },
  );
}

export default function StockPage() {
  const [stock, setStock] =
    useState<StockDemo[]>([]);

  const [busqueda, setBusqueda] =
    useState("");

  const [nivel, setNivel] =
    useState<NivelFiltro>("TODOS");

  const [
    propiedad,
    setPropiedad,
  ] =
    useState<PropiedadFiltro>(
      "TODOS",
    );

  const [marca, setMarca] =
    useState("TODAS");

  const [familia, setFamilia] =
    useState("TODAS");

  const [linea, setLinea] =
    useState("TODAS");

  const [
    procedencia,
    setProcedencia,
  ] = useState("TODAS");

  const [
    deposito,
    setDeposito,
  ] = useState("TODOS");

  const [pagina, setPagina] =
    useState(1);

  useEffect(() => {
    setStock(
      obtenerStockDemo(),
    );
  }, []);

  useEffect(() => {
    setPagina(1);
  }, [
    busqueda,
    nivel,
    propiedad,
    marca,
    familia,
    linea,
    procedencia,
    deposito,
  ]);

  const marcas = useMemo(
    () =>
      Array.from(
        new Set(
          stock
            .map(
              (item) =>
                item.marca,
            )
            .filter(Boolean),
        ),
      ).sort((a, b) =>
        a.localeCompare(b),
      ),
    [stock],
  );

  const familias = useMemo(
    () =>
      Array.from(
        new Set(
          stock
            .map(
              (item) =>
                item.familia,
            )
            .filter(Boolean),
        ),
      ).sort((a, b) =>
        a.localeCompare(b),
      ),
    [stock],
  );

  const lineas = useMemo(
    () =>
      Array.from(
        new Set(
          stock
            .map(
              (item) =>
                item.linea,
            )
            .filter(Boolean),
        ),
      ).sort((a, b) =>
        a.localeCompare(b),
      ),
    [stock],
  );

  const procedencias = useMemo(
    () =>
      Array.from(
        new Set(
          stock
            .map(
              (item) =>
                item.procedencia,
            )
            .filter(Boolean),
        ),
      ).sort((a, b) =>
        a.localeCompare(b),
      ),
    [stock],
  );

  const depositos = useMemo(() => {
    const map =
      new Map<
        string,
        string
      >();

    stock.forEach((item) => {
      item.depositos.forEach(
        (dep) => {
          map.set(
            dep.depositoId,
            dep.depositoNombre,
          );
        },
      );
    });

    return Array.from(
      map.entries(),
    );
  }, [stock]);

  const resumen = useMemo(() => {
    return stock.reduce(
      (acc, item) => {
        acc.sku += 1;

        acc.disponible +=
          Number(
            item.disponible || 0,
          );

        acc.valorCosto +=
          valorCosto(item);

        acc.valorVenta +=
          valorVentaDemo(item);

        if (
          item.nivel === "BAJO"
        ) {
          acc.stockBajo += 1;
        }

        if (
          item.nivel ===
          "SIN_STOCK"
        ) {
          acc.sinStock += 1;
        }

        return acc;
      },
      {
        sku: 0,
        disponible: 0,
        stockBajo: 0,
        sinStock: 0,
        valorCosto: 0,
        valorVenta: 0,
      },
    );
  }, [stock]);

  const filtrados = useMemo(() => {
    const term =
      normalizar(
        busqueda.trim(),
      );

    return stock.filter(
      (item) => {
        if (
          nivel !== "TODOS" &&
          item.nivel !== nivel
        ) {
          return false;
        }

        if (
          propiedad !==
            "TODOS" &&
          item.propiedad !==
            propiedad
        ) {
          return false;
        }

        if (
          marca !== "TODAS" &&
          item.marca !== marca
        ) {
          return false;
        }

        if (
          familia !== "TODAS" &&
          item.familia !==
            familia
        ) {
          return false;
        }

        if (
          linea !== "TODAS" &&
          item.linea !== linea
        ) {
          return false;
        }

        if (
          procedencia !==
            "TODAS" &&
          item.procedencia !==
            procedencia
        ) {
          return false;
        }

        if (
          deposito !== "TODOS" &&
          !item.depositos.some(
            (dep) =>
              dep.depositoId ===
              deposito,
          )
        ) {
          return false;
        }

        if (!term) {
          return true;
        }

        const searchable =
          normalizar(
            [
              item.productoCodigo,
              item.productoCodigoInventario,
              item.productoDescripcion,
              item.codigoBarras,
              item.categoria,
              item.marca,
              item.familia,
              item.linea,
              item.procedencia,
              item.propietarioNombre,
            ].join(" "),
          );

        return searchable.includes(
          term,
        );
      },
    );
  }, [
    stock,
    busqueda,
    nivel,
    propiedad,
    marca,
    familia,
    linea,
    procedencia,
    deposito,
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

  function limpiar() {
    setBusqueda("");
    setNivel("TODOS");
    setPropiedad("TODOS");
    setMarca("TODAS");
    setFamilia("TODAS");
    setLinea("TODAS");
    setProcedencia("TODAS");
    setDeposito("TODOS");
  }


  async function exportarListadoExcel() {
    const XLSX = await import("xlsx");

    const detalle = filtrados.map(
      (item) => ({
        Código: item.productoCodigo,
        "Código inventario":
          item.productoCodigoInventario ||
          "",
        Producto:
          item.productoDescripcion,
        Marca: item.marca || "",
        Familia: item.familia || "",
        Línea: item.linea || "",
        Procedencia:
          item.procedencia || "",
        Propiedad:
          item.propiedad === "TERCERO"
            ? `Tercero - ${
                item.propietarioNombre ||
                ""
              }`
            : "Propio",
        "Stock disponible": Number(
          item.disponible || 0,
        ),
        "Costo unitario":
          costoUnitario(item),
        "Valor a costo":
          valorCosto(item),
        "Markup %":
          MARKUP_DEMO,
        "Precio venta demo":
          precioVentaDemo(item),
        "Valor venta demo":
          valorVentaDemo(item),
        "Ganancia potencial":
          gananciaPotencial(item),
        Estado:
          item.nivel === "SIN_STOCK"
            ? "SIN STOCK"
            : item.nivel === "BAJO"
              ? "STOCK BAJO"
              : item.nivel ===
                  "SOBRESTOCK"
                ? "SOBRESTOCK"
                : "NORMAL",
      }),
    );

    const resumenExportacion = [
      {
        Indicador: "Productos",
        Valor: filtrados.length,
      },
      {
        Indicador:
          "Unidades disponibles",
        Valor: filtrados.reduce(
          (acc, item) =>
            acc +
            Number(
              item.disponible || 0,
            ),
          0,
        ),
      },
      {
        Indicador:
          "Valor total a costo",
        Valor: filtrados.reduce(
          (acc, item) =>
            acc + valorCosto(item),
          0,
        ),
      },
      {
        Indicador:
          "Valor venta demo",
        Valor: filtrados.reduce(
          (acc, item) =>
            acc +
            valorVentaDemo(item),
          0,
        ),
      },
      {
        Indicador:
          "Ganancia potencial",
        Valor: filtrados.reduce(
          (acc, item) =>
            acc +
            gananciaPotencial(item),
          0,
        ),
      },
      {
        Indicador:
          "Markup aplicado",
        Valor: MARKUP_DEMO,
      },
    ];

    const workbook =
      XLSX.utils.book_new();

    const resumenSheet =
      XLSX.utils.json_to_sheet(
        resumenExportacion,
      );

    const detalleSheet =
      XLSX.utils.json_to_sheet(
        detalle,
      );

    ajustarColumnas(
      resumenSheet,
      [28, 22],
    );

    ajustarColumnas(
      detalleSheet,
      [
        16,
        18,
        45,
        22,
        24,
        18,
        16,
        20,
        16,
        16,
        18,
        12,
        18,
        18,
        18,
        14,
      ],
    );

    resumenSheet["!autofilter"] = {
      ref: "A1:B7",
    };

    if (detalle.length > 0) {
      detalleSheet["!autofilter"] = {
        ref: `A1:P${
          detalle.length + 1
        }`,
      };
    }

    XLSX.utils.book_append_sheet(
      workbook,
      resumenSheet,
      "Resumen",
    );

    XLSX.utils.book_append_sheet(
      workbook,
      detalleSheet,
      "Stock valorizado",
    );

    descargarWorkbook(
      XLSX,
      workbook,
      `Stock_Valorizado_Casa_Mingo_${fechaArchivo()}.xlsx`,
    );
  }

  async function exportarValorizadoMarca() {
    const XLSX = await import("xlsx");

    const agrupado = new Map<
      string,
      {
        skus: number;
        unidades: number;
        costo: number;
        venta: number;
        ganancia: number;
      }
    >();

    filtrados.forEach((item) => {
      const nombreMarca =
        item.marca?.trim() ||
        "SIN MARCA";

      const actual =
        agrupado.get(nombreMarca) || {
          skus: 0,
          unidades: 0,
          costo: 0,
          venta: 0,
          ganancia: 0,
        };

      actual.skus += 1;
      actual.unidades += Number(
        item.disponible || 0,
      );
      actual.costo += valorCosto(item);
      actual.venta +=
        valorVentaDemo(item);
      actual.ganancia +=
        gananciaPotencial(item);

      agrupado.set(
        nombreMarca,
        actual,
      );
    });

    const totalCosto =
      Array.from(
        agrupado.values(),
      ).reduce(
        (acc, item) =>
          acc + item.costo,
        0,
      );

    const resumenMarca =
      Array.from(
        agrupado.entries(),
      )
        .sort(
          (a, b) =>
            b[1].costo -
            a[1].costo,
        )
        .map(
          ([nombreMarca, item]) => ({
            Marca: nombreMarca,
            SKUs: item.skus,
            Unidades: item.unidades,
            "Valor a costo":
              item.costo,
            "Valor venta demo":
              item.venta,
            "Ganancia potencial":
              item.ganancia,
            "Participación costo %":
              totalCosto > 0
                ? item.costo /
                  totalCosto
                : 0,
          }),
        );

    const workbook =
      XLSX.utils.book_new();

    const sheet =
      XLSX.utils.json_to_sheet(
        resumenMarca,
      );

    ajustarColumnas(
      sheet,
      [
        24,
        12,
        14,
        20,
        20,
        20,
        20,
      ],
    );

    if (resumenMarca.length > 0) {
      sheet["!autofilter"] = {
        ref: `A1:G${
          resumenMarca.length + 1
        }`,
      };
    }

    XLSX.utils.book_append_sheet(
      workbook,
      sheet,
      "Resumen por marca",
    );

    descargarWorkbook(
      XLSX,
      workbook,
      `Stock_Costo_por_Marca_Casa_Mingo_${fechaArchivo()}.xlsx`,
    );
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
              INVENTARIO
            </span>

            <span
              className={
                styles.demoPill
              }
            >
              MINGO 2026
            </span>
          </div>

          <h1>Stock</h1>

          <p>
            Inventario consolidado por
            producto, clasificación y
            procedencia.
          </p>
        </div>

        <div
          className={
            styles.heroActions
          }
        >
          <button
            type="button"
            className={
              styles.secondaryButton
            }
            onClick={
              exportarListadoExcel
            }
          >
            Exportar Excel
          </button>

          <button
            type="button"
            className={
              styles.secondaryButton
            }
            onClick={
              exportarValorizadoMarca
            }
          >
            Valorizado por marca
          </button>

          <Link
            href="/movimientos"
            className={
              styles.secondaryButton
            }
          >
            Movimientos
          </Link>

          <Link
            href="/reposicion"
            className={
              styles.primaryButton
            }
          >
            Reposición
          </Link>
        </div>
      </header>

      <section
        className={
          styles.summaryGrid
        }
      >
        <article
          className={`${styles.summaryCard} ${styles.summaryTeal}`}
        >
          <span>SKU</span>

          <strong>
            {resumen.sku}
          </strong>

          <small>
            Productos inventariados
          </small>
        </article>

        <article
          className={`${styles.summaryCard} ${styles.summaryBlue}`}
        >
          <span>
            UNIDADES DISPONIBLES
          </span>

          <strong>
            {new Intl.NumberFormat(
              "es-PY",
              {
                maximumFractionDigits: 2,
              },
            ).format(
              resumen.disponible,
            )}
          </strong>

          <small>
            Stock disponible
          </small>
        </article>

        <article
          className={`${styles.summaryCard} ${styles.summaryAmber}`}
        >
          <span>
            STOCK BAJO
          </span>

          <strong>
            {resumen.stockBajo}
          </strong>

          <small>
            Debajo del mínimo
          </small>
        </article>

        <article
          className={`${styles.summaryCard} ${styles.summaryRed}`}
        >
          <span>
            SIN STOCK
          </span>

          <strong>
            {resumen.sinStock}
          </strong>

          <small>
            Saldo disponible cero
          </small>
        </article>

        <article
          className={`${styles.summaryCard} ${styles.summaryPurple}`}
        >
          <span>
            VALOR A COSTO
          </span>

          <strong>
            {money(
              resumen.valorCosto,
            )}
          </strong>

          <small>
            Costo según archivo original
          </small>
        </article>

        <article
          className={`${styles.summaryCard} ${styles.summaryBlue}`}
        >
          <span>
            VALOR VENTA DEMO
          </span>

          <strong>
            {money(
              resumen.valorVenta,
            )}
          </strong>

          <small>
            Costo + 20%
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
              placeholder="Buscar por código, código inventario, producto, marca, familia, línea..."
            />
          </label>

          <span
            className={
              styles.resultCount
            }
          >
            {filtrados.length} productos
          </span>
        </div>

        <div
          className={
            styles.filters
          }
        >
          <label>
            <span>Nivel</span>

            <select
              value={nivel}
              onChange={(event) =>
                setNivel(
                  event.target
                    .value as NivelFiltro,
                )
              }
            >
              <option value="TODOS">
                Todos
              </option>

              <option value="NORMAL">
                Normal
              </option>

              <option value="BAJO">
                Stock bajo
              </option>

              <option value="SIN_STOCK">
                Sin stock
              </option>

              <option value="SOBRESTOCK">
                Sobrestock
              </option>
            </select>
          </label>

          <label>
            <span>Marca</span>

            <select
              value={marca}
              onChange={(event) =>
                setMarca(
                  event.target.value,
                )
              }
            >
              <option value="TODAS">
                Todas
              </option>

              {marcas.map(
                (value) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {value}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            <span>Familia</span>

            <select
              value={familia}
              onChange={(event) =>
                setFamilia(
                  event.target.value,
                )
              }
            >
              <option value="TODAS">
                Todas
              </option>

              {familias.map(
                (value) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {value}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            <span>Línea</span>

            <select
              value={linea}
              onChange={(event) =>
                setLinea(
                  event.target.value,
                )
              }
            >
              <option value="TODAS">
                Todas
              </option>

              {lineas.map(
                (value) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {value}
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
              value={procedencia}
              onChange={(event) =>
                setProcedencia(
                  event.target.value,
                )
              }
            >
              <option value="TODAS">
                Todas
              </option>

              {procedencias.map(
                (value) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {value}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            <span>Propiedad</span>

            <select
              value={propiedad}
              onChange={(event) =>
                setPropiedad(
                  event.target
                    .value as PropiedadFiltro,
                )
              }
            >
              <option value="TODOS">
                Todos
              </option>

              <option value="PROPIO">
                Propio
              </option>

              <option value="TERCERO">
                Tercero
              </option>
            </select>
          </label>

          <label>
            <span>Depósito</span>

            <select
              value={deposito}
              onChange={(event) =>
                setDeposito(
                  event.target.value,
                )
              }
            >
              <option value="TODOS">
                Todos
              </option>

              {depositos.map(
                ([id, nombre]) => (
                  <option
                    key={id}
                    value={id}
                  >
                    {nombre}
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
            onClick={limpiar}
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
            Disponibilidad
          </span>
          <span>
            Costo / valor
          </span>
          <span />
        </div>

        <div className={styles.list}>
          {paginaActual.map(
            (item) => (
              <article
                key={item.id}
                className={
                  styles.stockRow
                }
              >
                <div
                  className={
                    styles.productBlock
                  }
                >
                  <div
                    className={
                      styles.avatar
                    }
                  >
                    {item.productoDescripcion
                      .split(" ")
                      .slice(0, 2)
                      .map((word) =>
                        word.charAt(0),
                      )
                      .join("")}
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
                          item.productoDescripcion
                        }
                      </strong>

                      <span
                        className={
                          styles.code
                        }
                      >
                        {
                          item.productoCodigo
                        }
                      </span>
                    </div>

                    <span
                      className={
                        styles.inventoryCode
                      }
                    >
                      Código inventario:{" "}
                      {item.productoCodigoInventario ||
                        "—"}
                    </span>

                    <small>
                      {item.propiedad ===
                      "TERCERO"
                        ? `Propietario: ${item.propietarioNombre}`
                        : "Stock propio"}
                    </small>
                  </div>
                </div>

                <div
                  className={
                    styles.classification
                  }
                >
                  <strong>
                    {item.familia ||
                      "Sin familia"}
                  </strong>

                  <span>
                    {item.linea ||
                      "Sin línea"}
                  </span>

                  <small>
                    {item.marca ||
                      "Sin marca"}
                    {" · "}
                    {item.procedencia ||
                      "Sin procedencia"}
                  </small>
                </div>

                <div
                  className={
                    styles.availability
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
                        item.disponible ||
                          0,
                      ),
                    )}{" "}
                    {
                      item.unidadMedidaNombre
                    }
                  </strong>

                  <div
                    className={
                      styles.stockPills
                    }
                  >
                    <span
                      className={
                        styles.reserved
                      }
                    >
                      R {item.reservado}
                    </span>

                    <span
                      className={
                        styles.quarantine
                      }
                    >
                      C {item.cuarentena}
                    </span>

                    <span
                      className={
                        styles.transit
                      }
                    >
                      T {item.transito}
                    </span>
                  </div>

                  <span
                    className={
                      item.nivel ===
                      "NORMAL"
                        ? styles.statusNormal
                        : item.nivel ===
                            "BAJO"
                          ? styles.statusWarning
                          : item.nivel ===
                              "SIN_STOCK"
                            ? styles.statusDanger
                            : styles.statusOver
                    }
                  >
                    {item.nivel ===
                    "NORMAL"
                      ? "Normal"
                      : item.nivel ===
                          "BAJO"
                        ? "Stock bajo"
                        : item.nivel ===
                            "SIN_STOCK"
                          ? "Sin stock"
                          : "Sobrestock"}
                  </span>
                </div>

                <div
                  className={
                    styles.valueBlock
                  }
                >
                  <strong>
                    {money(
                      costoUnitario(item),
                    )}
                  </strong>

                  <span>
                    Valor costo:{" "}
                    {money(
                      valorCosto(item),
                    )}
                  </span>

                  <small>
                    Venta demo (+20%):{" "}
                    {money(
                      precioVentaDemo(item),
                    )}
                  </small>
                </div>

                <Link
                  href={`/stock/${item.id}`}
                  className={
                    styles.detailButton
                  }
                >
                  Ver detalle
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