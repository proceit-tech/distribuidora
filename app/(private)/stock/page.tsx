"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { cargarStock } from "@/lib/stock/cliente-api";

import {
  StockItem,
  StockNivel,
  StockPropiedad,
} from "@/types/stock";

import { compararTexto, ordenarLista, siguienteOrden, type Orden } from "@/components/ui/lista-padrao/orden";
import { ThOrdenable } from "@/components/ui/lista-padrao/th-ordenable";
import ui from "@/components/ui/lista-padrao/lista.module.css";
import { formatearCantidad, formatearMonto } from "@/lib/formato/listas";

const PAGE_SIZE = 25;

type CampoOrden = "producto" | "clasificacion" | "disponible" | "costo";

type NivelFiltro =
  | "TODOS"
  | StockNivel;

type PropiedadFiltro =
  | "TODOS"
  | StockPropiedad;

// Moneda de los costos: moneda base de la empresa (se actualiza al cargar el stock).
let MONEDA_BASE = "PYG";

function money(value: number) {
  return formatearMonto(value, MONEDA_BASE);
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


// Costos y precios reales: costo promedio de inventario_costos y precio de venta de referencia (lista de referencia).
// Sin costo o sin precio registrado el valor es 0 en los totales y se muestra "—" en la ficha; nada se inventa.
function costoUnitario(item: StockItem) {
  return Number(item.costoPromedio ?? 0);
}

function valorCosto(item: StockItem) {
  return Number(item.valorInventario || 0);
}

function precioVentaReferencia(item: StockItem) {
  return Number(item.precioVentaReferencia ?? 0);
}

function valorVentaReferencia(item: StockItem) {
  return Number(item.valorVentaReferencia ?? 0);
}

function gananciaPotencial(
  item: StockItem,
) {
  if (
    item.precioVentaReferencia === null ||
    item.costoPromedio === null
  ) {
    return 0;
  }

  return (
    valorVentaReferencia(item) -
    costoUnitario(item) *
      Number(item.disponible || 0)
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
    useState<StockItem[]>([]);

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

  const [cargando, setCargando] =
    useState(true);

  const [errorCarga, setErrorCarga] =
    useState("");

  const [orden, setOrden] = useState<Orden<CampoOrden>>(null);

  useEffect(() => {
    let activo = true;

    cargarStock()
      .then((r) => {
        MONEDA_BASE = r.monedaBase;
        if (activo) setStock(r.stock);
      })
      .catch((e: unknown) => {
        if (activo)
          setErrorCarga(
            e instanceof Error
              ? e.message
              : "No fue posible cargar el stock.",
          );
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
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
    orden,
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
          valorVentaReferencia(item);

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

  // Ordenación sobre el conjunto filtrado COMPLETO (toda la lista está cargada), antes de paginar.
  const ordenados = useMemo(
    () =>
      ordenarLista(filtrados, orden, (campo, a, b) => {
        switch (campo) {
          case "producto":
            return compararTexto(a.productoDescripcion, b.productoDescripcion);
          case "clasificacion":
            return compararTexto(`${a.familia} ${a.linea}`, `${b.familia} ${b.linea}`);
          case "disponible":
            return Number(a.disponible || 0) - Number(b.disponible || 0);
          case "costo":
            return costoUnitario(a) - costoUnitario(b);
        }
      }),
    [filtrados, orden],
  );

  function cambiarOrden(campo: CampoOrden) {
    setOrden((actual) => siguienteOrden(actual, campo));
  }

  const totalPaginas = Math.max(
    1,
    Math.ceil(
      filtrados.length /
        PAGE_SIZE,
    ),
  );

  const paginaActual = useMemo(
    () =>
      ordenados.slice(
        (pagina - 1) * PAGE_SIZE,
        pagina * PAGE_SIZE,
      ),
    [ordenados, pagina],
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
        "Precio venta referencia":
          precioVentaReferencia(item),
        "Valor venta referencia":
          valorVentaReferencia(item),
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
          "Valor venta referencia",
        Valor: filtrados.reduce(
          (acc, item) =>
            acc +
            valorVentaReferencia(item),
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
      ref: "A1:B6",
    };

    if (detalle.length > 0) {
      detalleSheet["!autofilter"] = {
        ref: `A1:O${
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
      `Stock_Valorizado_${fechaArchivo()}.xlsx`,
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
        valorVentaReferencia(item);
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
            "Valor venta referencia":
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
      `Stock_Costo_por_Marca_${fechaArchivo()}.xlsx`,
    );
  }

  return (
    <section className={ui.page}>
      <header className={ui.topbar}>
        <div className={ui.titleBlock}>
          <nav className={ui.breadcrumb} aria-label="Ruta de navegación">
            <span>Inventario</span>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Stock</span>
          </nav>

          <h1>Stock</h1>
        </div>

        <div className={ui.actionsGroup}>
          <button type="button" className={ui.secondaryButton} onClick={exportarListadoExcel}>
            Exportar Excel
          </button>
          <button type="button" className={ui.secondaryButton} onClick={exportarValorizadoMarca}>
            Valorizado por marca
          </button>
          <Link href="/movimientos" className={ui.secondaryButton}>
            Movimientos
          </Link>
          <Link href="/reposicion" className={ui.primaryButton}>
            Reposición
          </Link>
        </div>
      </header>

      <section className={ui.summaryGrid} aria-label="Resumen de stock">
        <article className={[ui.summaryCard, ui.summaryTeal].join(" ")}>
          <span>SKU</span>
          <strong>{resumen.sku}</strong>
          <small>Productos inventariados</small>
        </article>

        <article className={[ui.summaryCard, ui.summaryBlue].join(" ")}>
          <span>Unidades disponibles</span>
          <strong>{formatearCantidad(resumen.disponible)}</strong>
          <small>Stock disponible</small>
        </article>

        <article className={[ui.summaryCard, ui.summaryAmber].join(" ")}>
          <span>Stock bajo</span>
          <strong>{resumen.stockBajo}</strong>
          <small>Debajo del mínimo</small>
        </article>

        <article className={[ui.summaryCard, ui.summaryRed].join(" ")}>
          <span>Sin stock</span>
          <strong>{resumen.sinStock}</strong>
          <small>Saldo disponible cero</small>
        </article>

        <article className={[ui.summaryCard, ui.summaryViolet].join(" ")}>
          <span>Valor a costo</span>
          <strong>{money(resumen.valorCosto)}</strong>
          <small>Costo promedio de inventario</small>
        </article>

        <article className={[ui.summaryCard, ui.summaryBlue].join(" ")}>
          <span>Valor venta referencia</span>
          <strong>{money(resumen.valorVenta)}</strong>
          <small>Precio de la lista de referencia</small>
        </article>
      </section>

      <section className={ui.contentCard}>
        <div className={[ui.toolbar, ui.toolbarDensa].join(" ")}>
          <label className={ui.search}>
            <span aria-hidden="true">⌕</span>

            <input
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Buscar por código, código inventario, producto, marca, familia, línea..."
              aria-label="Buscar en el stock"
            />
          </label>

          <label className={ui.filterField}>
            <span>Nivel</span>
            <select value={nivel} onChange={(event) => setNivel(event.target.value as NivelFiltro)}>
              <option value="TODOS">Todos</option>
              <option value="NORMAL">Normal</option>
              <option value="BAJO">Stock bajo</option>
              <option value="SIN_STOCK">Sin stock</option>
              <option value="SOBRESTOCK">Sobrestock</option>
            </select>
          </label>

          <label className={ui.filterField}>
            <span>Marca</span>
            <select value={marca} onChange={(event) => setMarca(event.target.value)}>
              <option value="TODAS">Todas</option>
              {marcas.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className={ui.filterField}>
            <span>Familia</span>
            <select value={familia} onChange={(event) => setFamilia(event.target.value)}>
              <option value="TODAS">Todas</option>
              {familias.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className={ui.filterField}>
            <span>Línea</span>
            <select value={linea} onChange={(event) => setLinea(event.target.value)}>
              <option value="TODAS">Todas</option>
              {lineas.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className={ui.filterField}>
            <span>Procedencia</span>
            <select value={procedencia} onChange={(event) => setProcedencia(event.target.value)}>
              <option value="TODAS">Todas</option>
              {procedencias.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className={ui.filterField}>
            <span>Propiedad</span>
            <select value={propiedad} onChange={(event) => setPropiedad(event.target.value as PropiedadFiltro)}>
              <option value="TODOS">Todos</option>
              <option value="PROPIO">Propio</option>
              <option value="TERCERO">Tercero</option>
            </select>
          </label>

          <label className={ui.filterField}>
            <span>Depósito</span>
            <select value={deposito} onChange={(event) => setDeposito(event.target.value)}>
              <option value="TODOS">Todos</option>
              {depositos.map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </select>
          </label>

          <div className={ui.toolbarEnd}>
            <button type="button" className={ui.clearButton} onClick={limpiar}>
              Limpiar filtros
            </button>

            <span className={ui.resultCount} aria-live="polite">
            {filtrados.length} productos
          </span>
          </div>
        </div>

        <div className={ui.tableScroll}>
          <table className={ui.table}>
            <thead>
              <tr>
                <ThOrdenable titulo="Producto" campo="producto" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Clasificación" campo="clasificacion" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Disponibilidad" campo="disponible" orden={orden} onOrden={cambiarOrden} alinear="derecha" />
                <ThOrdenable titulo="Costo / valor" campo="costo" orden={orden} onOrden={cambiarOrden} alinear="derecha" />
                <ThOrdenable titulo="Acciones" alinear="derecha" />
              </tr>
            </thead>

            <tbody>
              {paginaActual.map((item) => (
                <tr key={item.id} className={ui.row}>
                  <td>
                    <div className={ui.clientMain}>
                      <div className={ui.avatar} aria-hidden="true">
                        {item.productoDescripcion
                          .split(" ")
                          .slice(0, 2)
                          .map((word) => word.charAt(0))
                          .join("")}
                      </div>

                      <div className={ui.clientIdentity}>
                        <Link href={`/stock/${item.id}`} className={ui.clientName}>
                          {item.productoDescripcion}
                        </Link>
                        <span className={ui.code}>
                          {item.productoCodigo} · Cód. inventario: {item.productoCodigoInventario || "—"}
                        </span>
                        <span className={ui.code}>
                          {item.propiedad === "TERCERO" ? `Propietario: ${item.propietarioNombre}` : "Stock propio"}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td>
                    <div className={ui.cell}>
                      <strong>{item.familia || "Sin familia"}</strong>
                      <span>{item.linea || "Sin línea"}</span>
                      <span>
                        {item.marca || "Sin marca"} · {item.procedencia || "Sin procedencia"}
                      </span>
                    </div>
                  </td>

                  <td className={ui.numeric}>
                    <div className={ui.cell}>
                      <strong className={ui.mono}>
                        {formatearCantidad(Number(item.disponible || 0))}{" "}
                        {item.unidadMedidaNombre}
                      </strong>
                      <span>
                        <span className={ui.statusInfo} title="Reservado" aria-label={`Reservado ${item.reservado}`}>
                          R {item.reservado}
                        </span>{" "}
                        <span className={ui.statusWarning} title="Cuarentena" aria-label={`Cuarentena ${item.cuarentena}`}>
                          C {item.cuarentena}
                        </span>{" "}
                        <span className={ui.statusPurple} title="En tránsito" aria-label={`En tránsito ${item.transito}`}>
                          T {item.transito}
                        </span>
                      </span>
                      <span>
                        <span
                          className={
                            item.nivel === "NORMAL"
                              ? ui.statusActive
                              : item.nivel === "BAJO"
                                ? ui.statusWarning
                                : item.nivel === "SIN_STOCK"
                                  ? ui.statusDanger
                                  : ui.statusInfo
                          }
                        >
                          {item.nivel === "NORMAL"
                            ? "Normal"
                            : item.nivel === "BAJO"
                              ? "Stock bajo"
                              : item.nivel === "SIN_STOCK"
                                ? "Sin stock"
                                : "Sobrestock"}
                        </span>
                      </span>
                    </div>
                  </td>

                  <td className={ui.numeric}>
                    <div className={ui.cell}>
                      <strong className={ui.mono}>{money(costoUnitario(item))}</strong>
                      <span>Valor costo: {money(valorCosto(item))}</span>
                      <span>
                        Venta referencia:{" "}
                        {item.precioVentaReferencia === null ? "—" : money(precioVentaReferencia(item))}
                      </span>
                    </div>
                  </td>

                  <td className={ui.actionsCell}>
                    <Link
                      href={`/stock/${item.id}`}
                      className={ui.detailButton}
                      aria-label={`Ver detalle de ${item.productoDescripcion}`}
                    >
                      Ver detalle
                      <span aria-hidden="true">›</span>
                    </Link>
                  </td>
                </tr>
              ))}

              {paginaActual.length === 0 ? (
                <tr>
                  <td colSpan={5} className={ui.emptyCell}>
                    <div className={ui.empty} role={errorCarga ? "alert" : undefined}>
                      <strong>
                        {cargando
                          ? "Cargando stock..."
                          : errorCarga ||
                            (stock.length === 0 ? "Aún no hay productos en el inventario" : "No se encontraron productos")}
                      </strong>
                      {!cargando && !errorCarga ? (
                        <span>
                          {stock.length === 0
                            ? "Registre un movimiento de entrada para comenzar a operar."
                            : "Modifique los filtros aplicados."}
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <p className={ui.legendNote}>
          R = reservado · C = cuarentena · T = en tránsito. Sobrestock: existencia física propia (disponible + reservado +
          cuarentena) mayor que el stock máximo del producto.
        </p>

        <footer className={ui.pagination}>
          <span>
            Mostrando {filtrados.length === 0 ? 0 : (pagina - 1) * PAGE_SIZE + 1}–
            {Math.min(pagina * PAGE_SIZE, filtrados.length)} de {filtrados.length}
          </span>

          <div>
            <button
              type="button"
              aria-label="Página anterior"
              disabled={pagina === 1}
              onClick={() => setPagina((actual) => actual - 1)}
            >
              ‹
            </button>

            <strong>
              {pagina} / {totalPaginas}
            </strong>

            <button
              type="button"
              aria-label="Página siguiente"
              disabled={pagina === totalPaginas}
              onClick={() => setPagina((actual) => actual + 1)}
            >
              ›
            </button>
          </div>
        </footer>
      </section>
    </section>
  );
}
