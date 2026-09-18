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

function escaparXml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function celdaExcel(
  value: unknown,
  type:
    | "String"
    | "Number" = "String",
  styleId?: string,
) {
  const style = styleId
    ? ` ss:StyleID="${styleId}"`
    : "";

  return `<Cell${style}><Data ss:Type="${type}">${escaparXml(
    value,
  )}</Data></Cell>`;
}

function filaExcel(
  cells: string[],
) {
  return `<Row>${cells.join("")}</Row>`;
}

function construirLibroExcel(
  sheets: Array<{
    name: string;
    rows: string[];
  }>,
) {
  const worksheets = sheets
    .map(
      (sheet) => `
      <Worksheet ss:Name="${escaparXml(
        sheet.name,
      )}">
        <Table>
          ${sheet.rows.join("\\n")}
        </Table>
      </Worksheet>`,
    )
    .join("\\n");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook
  xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Font ss:FontName="Aptos" ss:Size="10"/>
    </Style>

    <Style ss:ID="title">
      <Font ss:Bold="1" ss:Size="16" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#103B4A" ss:Pattern="Solid"/>
      <Alignment ss:Vertical="Center"/>
    </Style>

    <Style ss:ID="subtitle">
      <Font ss:Italic="1" ss:Color="#315D69"/>
      <Interior ss:Color="#EAF5F7" ss:Pattern="Solid"/>
    </Style>

    <Style ss:ID="header">
      <Font ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#167D8A" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    </Style>

    <Style ss:ID="money">
      <NumberFormat ss:Format="&quot;Gs.&quot; #,##0"/>
    </Style>

    <Style ss:ID="number">
      <NumberFormat ss:Format="#,##0"/>
    </Style>

    <Style ss:ID="percent">
      <NumberFormat ss:Format="0.00%"/>
    </Style>

    <Style ss:ID="warning">
      <Font ss:Bold="1" ss:Color="#B42318"/>
      <Interior ss:Color="#FDECEC" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  ${worksheets}
</Workbook>`;
}

function descargarExcel(
  contenido: string,
  nombreArchivo: string,
) {
  const blob = new Blob(
    [contenido],
    {
      type:
        "application/vnd.ms-excel;charset=utf-8;",
    },
  );

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = nombreArchivo;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
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


  function exportarListadoExcel() {
    const rows = [
      filaExcel([
        celdaExcel(
          "CASA MINGO S.A. · STOCK VALORIZADO",
          "String",
          "title",
        ),
      ]),
      filaExcel([
        celdaExcel(
          "Listado filtrado · costo = PRECIOS del archivo original · venta demo = costo + 20%",
          "String",
          "subtitle",
        ),
      ]),
      filaExcel([]),
      filaExcel(
        [
          "Código",
          "Código inventario",
          "Producto",
          "Marca",
          "Familia",
          "Línea",
          "Procedencia",
          "Propiedad",
          "Stock disponible",
          "Costo unitario",
          "Valor a costo",
          "Markup",
          "Precio venta demo",
          "Valor venta demo",
          "Ganancia potencial",
          "Estado",
        ].map((value) =>
          celdaExcel(
            value,
            "String",
            "header",
          ),
        ),
      ),
      ...filtrados.map((item) =>
        filaExcel([
          celdaExcel(item.productoCodigo),
          celdaExcel(
            item.productoCodigoInventario ||
              "",
          ),
          celdaExcel(
            item.productoDescripcion,
          ),
          celdaExcel(item.marca || ""),
          celdaExcel(item.familia || ""),
          celdaExcel(item.linea || ""),
          celdaExcel(
            item.procedencia || "",
          ),
          celdaExcel(
            item.propiedad === "TERCERO"
              ? `Tercero - ${
                  item.propietarioNombre ||
                  ""
                }`
              : "Propio",
          ),
          celdaExcel(
            Number(item.disponible || 0),
            "Number",
            "number",
          ),
          celdaExcel(
            costoUnitario(item),
            "Number",
            "money",
          ),
          celdaExcel(
            valorCosto(item),
            "Number",
            "money",
          ),
          celdaExcel(
            MARKUP_DEMO,
            "Number",
            "percent",
          ),
          celdaExcel(
            precioVentaDemo(item),
            "Number",
            "money",
          ),
          celdaExcel(
            valorVentaDemo(item),
            "Number",
            "money",
          ),
          celdaExcel(
            gananciaPotencial(item),
            "Number",
            "money",
          ),
          celdaExcel(
            item.nivel === "SIN_STOCK"
              ? "SIN STOCK"
              : item.nivel === "BAJO"
                ? "STOCK BAJO"
                : item.nivel ===
                    "SOBRESTOCK"
                  ? "SOBRESTOCK"
                  : "NORMAL",
            "String",
            item.nivel === "SIN_STOCK"
              ? "warning"
              : undefined,
          ),
        ]),
      ),
    ];

    const workbook =
      construirLibroExcel([
        {
          name: "Stock valorizado",
          rows,
        },
      ]);

    descargarExcel(
      workbook,
      `Stock_Valorizado_Casa_Mingo_${fechaArchivo()}.xls`,
    );
  }

  function exportarValorizadoMarca() {
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

    const resumenMarca = Array.from(
      agrupado.entries(),
    )
      .sort(
        (a, b) =>
          b[1].costo - a[1].costo,
      );

    const rows = [
      filaExcel([
        celdaExcel(
          "CASA MINGO S.A. · STOCK AL COSTO POR MARCA",
          "String",
          "title",
        ),
      ]),
      filaExcel([
        celdaExcel(
          "Valorización demo · costo = PRECIOS del archivo original · markup 20%",
          "String",
          "subtitle",
        ),
      ]),
      filaExcel([]),
      filaExcel(
        [
          "Marca",
          "SKUs",
          "Unidades",
          "Valor a costo",
          "Valor venta demo",
          "Ganancia potencial",
          "% participación costo",
        ].map((value) =>
          celdaExcel(
            value,
            "String",
            "header",
          ),
        ),
      ),
      ...resumenMarca.map(
        ([nombreMarca, item]) =>
          filaExcel([
            celdaExcel(nombreMarca),
            celdaExcel(
              item.skus,
              "Number",
              "number",
            ),
            celdaExcel(
              item.unidades,
              "Number",
              "number",
            ),
            celdaExcel(
              item.costo,
              "Number",
              "money",
            ),
            celdaExcel(
              item.venta,
              "Number",
              "money",
            ),
            celdaExcel(
              item.ganancia,
              "Number",
              "money",
            ),
            celdaExcel(
              totalCosto > 0
                ? item.costo /
                    totalCosto
                : 0,
              "Number",
              "percent",
            ),
          ]),
      ),
    ];

    const workbook =
      construirLibroExcel([
        {
          name: "Resumen por marca",
          rows,
        },
      ]);

    descargarExcel(
      workbook,
      `Stock_Costo_por_Marca_Casa_Mingo_${fechaArchivo()}.xls`,
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