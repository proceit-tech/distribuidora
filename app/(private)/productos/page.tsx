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

import { compararTexto, ordenarLista, siguienteOrden, type Orden } from "@/components/ui/lista-padrao/orden";
import { ThOrdenable } from "@/components/ui/lista-padrao/th-ordenable";
import ui from "@/components/ui/lista-padrao/lista.module.css";
import { formatearCantidad, formatearMonto } from "@/lib/formato/listas";

const PAGE_SIZE = 20;

type CampoOrden = "producto" | "clasificacion" | "inventario" | "precio";

type EstadoFiltro =
  | "TODOS"
  | "ACTIVOS"
  | "INACTIVOS";

type TipoFiltro =
  | "TODOS"
  | ProductoTipo;

function money(value: number, moneda: string) {
  return formatearMonto(value, moneda);
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
  stock_minimo: number | string;
  punto_reposicion: number | string | null;
  activo: boolean;
  origen_etiqueta: string | null;
  pais_origen_nombre: string | null;
  categoria: string | null;
  marca: string | null;
  impuesto: string | null;
  unidad_nombre: string | null;
  familia_id: string | null;
  familia: string | null;
  linea_id: string | null;
  linea: string | null;
  stock_disponible: number | string;
  bajo_minimo: boolean;
  costo_promedio: number | string | null;
  precio_venta_referencia: number | string | null;
  moneda_precio_referencia: string | null;
  inventario_inicial: number | string;
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
    familiaId: fila.familia_id ?? "",
    familiaNombre: fila.familia ?? "",
    lineaId: fila.linea_id ?? "",
    lineaNombre: fila.linea ?? "",
    impuestoNombre: fila.impuesto ?? "",
    unidadMedidaNombre: fila.unidad_nombre ?? "",
    procedencia: fila.origen_etiqueta ?? "",
    paisOrigenNombre: fila.pais_origen_nombre ?? "",
    controlaStock: fila.controla_stock,
    stockMinimo: Number(fila.stock_minimo ?? 0),
    puntoReposicion: Number(fila.punto_reposicion ?? 0),
    stockDisponible: Number(fila.stock_disponible ?? 0),
    bajoMinimo: fila.bajo_minimo,
    costoPromedio:
      fila.costo_promedio === null ? null : Number(fila.costo_promedio),
    precioVentaReferencia:
      fila.precio_venta_referencia === null
        ? null
        : Number(fila.precio_venta_referencia),
    monedaPrecioReferencia: fila.moneda_precio_referencia ?? "",
    inventarioInicial: Number(fila.inventario_inicial ?? 0),
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

  const [cargando, setCargando] =
    useState(true);

  const [errorCarga, setErrorCarga] =
    useState("");

  const [orden, setOrden] = useState<Orden<CampoOrden>>(null);

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
    filtroFamilia,
    filtroLinea,
    filtroProcedencia,
    orden,
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
            .map((item) => item.familiaNombre)
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [productos],
  );

  const lineas = useMemo(
    () =>
      Array.from(
        new Set(
          productos
            .filter(
              (item) =>
                filtroFamilia === "TODAS" ||
                item.familiaNombre === filtroFamilia,
            )
            .map((item) => item.lineaNombre)
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [productos, filtroFamilia],
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

        // Valor a precio de venta de referencia: solo productos con precio cargado (sin precio no suman).
        if (producto.precioVentaReferencia !== null) {
          acc.valorVenta +=
            producto.precioVentaReferencia *
            Number(producto.stockDisponible || 0);
          acc.monedaValor =
            producto.monedaPrecioReferencia || acc.monedaValor;
        }

        return acc;
      },
      {
        total: 0,
        activos: 0,
        inventario: 0,
        sinStock: 0,
        bajoMinimo: 0,
        valorVenta: 0,
        monedaValor: "",
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
          filtroFamilia !== "TODAS" &&
          producto.familiaNombre !== filtroFamilia
        ) {
          return false;
        }

        if (
          filtroLinea !== "TODAS" &&
          producto.lineaNombre !== filtroLinea
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
    filtroFamilia,
    filtroLinea,
    filtroProcedencia,
  ]);

  // Ordenación sobre el conjunto filtrado COMPLETO (toda la lista está cargada), antes de paginar.
  const ordenados = useMemo(
    () =>
      ordenarLista(filtrados, orden, (campo, a, b) => {
        switch (campo) {
          case "producto":
            return compararTexto(a.descripcion, b.descripcion);
          case "clasificacion":
            return compararTexto(
              `${a.familiaNombre} ${a.lineaNombre}`,
              `${b.familiaNombre} ${b.lineaNombre}`,
            );
          case "inventario":
            return Number(a.stockDisponible || 0) - Number(b.stockDisponible || 0);
          case "precio":
            return (a.precioVentaReferencia ?? -1) - (b.precioVentaReferencia ?? -1);
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
    <section className={ui.page}>
      <header className={ui.topbar}>
        <div className={ui.titleBlock}>
          <nav className={ui.breadcrumb} aria-label="Ruta de navegación">
            <span>Maestros</span>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Productos</span>
          </nav>

          <h1>Productos</h1>
        </div>

        <Link href="/productos/nuevo" className={ui.primaryButton}>
          <span aria-hidden="true">+</span>
          Nuevo producto
        </Link>
      </header>

      <section className={ui.summaryGrid} aria-label="Resumen de productos">
        <article className={[ui.summaryCard, ui.summaryTeal].join(" ")}>
          <span>Productos activos</span>
          <strong>{resumen.activos}</strong>
          <small>Registros habilitados</small>
        </article>

        <article className={[ui.summaryCard, ui.summaryBlue].join(" ")}>
          <span>Unidades inventario</span>
          <strong>{formatearCantidad(resumen.inventario)}</strong>
          <small>Stock disponible consolidado</small>
        </article>

        <article className={[ui.summaryCard, ui.summaryAmber].join(" ")}>
          <span>Sin stock</span>
          <strong>{resumen.sinStock}</strong>
          <small>Saldo cero · {resumen.bajoMinimo} bajo el mínimo</small>
        </article>

        <article className={[ui.summaryCard, ui.summaryViolet].join(" ")}>
          <span>Valor a precio venta</span>
          <strong>{money(resumen.valorVenta, resumen.monedaValor)}</strong>
          <small>Solo productos con precio de referencia</small>
        </article>
      </section>

      <section className={ui.contentCard}>
        <div className={[ui.toolbar, ui.toolbarDensa].join(" ")}>
          <label className={ui.search}>
            <span aria-hidden="true">⌕</span>

            <input
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Buscar por código, código inventario, descripción, marca, familia, línea..."
              aria-label="Buscar productos"
            />
          </label>

          <label className={ui.filterField}>
            <span>Estado</span>
            <select value={filtroEstado} onChange={(event) => setFiltroEstado(event.target.value as EstadoFiltro)}>
              <option value="TODOS">Todos</option>
              <option value="ACTIVOS">Activos</option>
              <option value="INACTIVOS">Inactivos</option>
            </select>
          </label>

          <label className={ui.filterField}>
            <span>Tipo</span>
            <select value={filtroTipo} onChange={(event) => setFiltroTipo(event.target.value as TipoFiltro)}>
              <option value="TODOS">Todos</option>
              <option value="MERCADERIA">Mercadería</option>
              <option value="SERVICIO">Servicio</option>
              <option value="KIT">Kit / combo</option>
              <option value="ACTIVO_FIJO">Activo fijo</option>
            </select>
          </label>

          <label className={ui.filterField}>
            <span>Marca</span>
            <select value={filtroMarca} onChange={(event) => setFiltroMarca(event.target.value)}>
              <option value="TODAS">Todas</option>
              {marcas.map((marca) => (
                <option key={marca} value={marca}>
                  {marca}
                </option>
              ))}
            </select>
          </label>

          <label className={ui.filterField}>
            <span>Familia</span>
            <select
              value={filtroFamilia}
              onChange={(event) => {
                setFiltroFamilia(event.target.value);
                setFiltroLinea("TODAS");
              }}
            >
              <option value="TODAS">Todas</option>
              {familias.map((familia) => (
                <option key={familia} value={familia}>
                  {familia}
                </option>
              ))}
            </select>
          </label>

          <label className={ui.filterField}>
            <span>Línea</span>
            <select value={filtroLinea} onChange={(event) => setFiltroLinea(event.target.value)}>
              <option value="TODAS">Todas</option>
              {lineas.map((linea) => (
                <option key={linea} value={linea}>
                  {linea}
                </option>
              ))}
            </select>
          </label>

          <label className={ui.filterField}>
            <span>Procedencia</span>
            <select value={filtroProcedencia} onChange={(event) => setFiltroProcedencia(event.target.value)}>
              <option value="TODAS">Todas</option>
              {procedencias.map((procedencia) => (
                <option key={procedencia} value={procedencia}>
                  {procedencia}
                </option>
              ))}
            </select>
          </label>

          <div className={ui.toolbarEnd}>
            <button type="button" className={ui.clearButton} onClick={limpiarFiltros}>
              Limpiar filtros
            </button>

            <span className={ui.resultCount} aria-live="polite">
            {filtrados.length} de {resumen.total}
          </span>
          </div>
        </div>

        <div className={ui.tableScroll}>
          <table className={ui.table}>
            <thead>
              <tr>
                <ThOrdenable titulo="Producto" campo="producto" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Clasificación" campo="clasificacion" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Inventario" campo="inventario" orden={orden} onOrden={cambiarOrden} alinear="derecha" />
                <ThOrdenable titulo="Precio venta" campo="precio" orden={orden} onOrden={cambiarOrden} alinear="derecha" />
                <ThOrdenable titulo="Acciones" alinear="derecha" />
              </tr>
            </thead>

            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={5} className={ui.emptyCell}>
                    <div className={ui.empty}>
                      <strong>Cargando productos...</strong>
                    </div>
                  </td>
                </tr>
              ) : errorCarga ? (
                <tr>
                  <td colSpan={5} className={ui.emptyCell}>
                    <div className={ui.empty} role="alert">
                      <strong>No fue posible cargar los productos</strong>
                      <span>{errorCarga}</span>
                    </div>
                  </td>
                </tr>
              ) : paginaActual.length === 0 ? (
                <tr>
                  <td colSpan={5} className={ui.emptyCell}>
                    <div className={ui.empty}>
                      <strong>
                        {productos.length === 0 ? "Aún no hay productos registrados" : "No se encontraron productos"}
                      </strong>
                      <span>
                        {productos.length === 0
                          ? "Cree su primer producto para comenzar a operar."
                          : "Modifique los filtros aplicados."}
                      </span>
                      {productos.length === 0 ? (
                        <Link href="/productos/nuevo" className={ui.emptyAction}>
                          + Nuevo producto
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : (
                paginaActual.map((producto) => (
                  <tr key={producto.id} className={ui.row}>
                    <td>
                      <div className={ui.clientMain}>
                        <div className={ui.avatar} aria-hidden="true">
                          {initials(producto.descripcion)}
                        </div>

                        <div className={ui.clientIdentity}>
                          <Link href={`/productos/${producto.id}`} className={ui.clientName}>
                            {producto.descripcion}
                          </Link>
                          <span className={ui.code}>
                            {producto.codigo} · Cód. inventario: {producto.codigoInventario || "—"}
                          </span>
                          <span className={ui.descr}>
                            Marca: {producto.marcaNombre || "—"} · Procedencia: {producto.procedencia || "—"}
                            {producto.unidadMedidaNombre ? ` · ${producto.unidadMedidaNombre}` : ""}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className={ui.cell}>
                        <strong>{producto.familiaNombre || "Sin familia"}</strong>
                        <span>Línea: {producto.lineaNombre || "—"}</span>
                        <span className={ui.descr}>Categoría: {producto.categoriaNombre || "Sin categoría"}</span>
                      </div>
                    </td>

                    <td className={ui.numeric}>
                      <div className={ui.cell}>
                        <strong className={ui.mono}>
                          {formatearCantidad(Number(producto.stockDisponible || 0))}{" "}
                          {producto.unidadMedidaNombre}
                        </strong>
                        <span>
                          Inicial:{" "}
                          {formatearCantidad(Number(producto.inventarioInicial || 0))}
                        </span>
                        <span>
                          <span className={Number(producto.stockDisponible || 0) <= 0 ? ui.statusDanger : ui.statusActive}>
                            {Number(producto.stockDisponible || 0) <= 0 ? "Sin stock" : "Disponible"}
                          </span>
                        </span>
                      </div>
                    </td>

                    <td className={ui.numeric}>
                      <div className={ui.cell}>
                        <strong className={ui.mono}>
                          {producto.precioVentaReferencia === null
                            ? "Sin precio"
                            : money(producto.precioVentaReferencia, producto.monedaPrecioReferencia)}
                        </strong>
                        <span>
                          Valor:{" "}
                          {producto.precioVentaReferencia === null
                            ? "—"
                            : money(
                                producto.precioVentaReferencia * Number(producto.stockDisponible || 0),
                                producto.monedaPrecioReferencia,
                              )}
                        </span>
                        <span>
                          Costo promedio: {producto.costoPromedio === null ? "—" : money(producto.costoPromedio, "PYG")}
                        </span>
                      </div>
                    </td>

                    <td className={ui.actionsCell}>
                      <Link
                        href={`/productos/${producto.id}`}
                        className={ui.detailButton}
                        aria-label={`Ver ficha de ${producto.descripcion}`}
                      >
                        Ver ficha
                        <span aria-hidden="true">›</span>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

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
