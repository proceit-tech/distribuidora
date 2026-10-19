"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { cargarStock } from "@/lib/stock/cliente-api";
import { iniciarCargaStock } from "@/lib/stock/carga-instancia";
import { puedeAbrirNuevoMovimiento, puedeVerMovimientos, normalizarPermisosMovimientos, SIN_PERMISOS_MOVIMIENTOS } from "@/lib/inventario/acceso";
import { interpretarDepositoUrl } from "@/lib/depositos/carga";
import { compararDecimales, formatearCostoUnitarioTexto, formatearMontoTexto } from "@/lib/inventario/decimal";
import { ETIQUETA_NIVEL, indicadoresStock, vistaPorDeposito } from "@/lib/stock/vista";

import {
  StockItem,
  StockNivel,
  StockPropiedad,
} from "@/types/stock";

import { compararTexto, ordenarLista, siguienteOrden, type Orden } from "@/components/ui/lista-padrao/orden";
import { ThOrdenable } from "@/components/ui/lista-padrao/th-ordenable";
import ui from "@/components/ui/lista-padrao/lista.module.css";
import { formatearCantidad } from "@/lib/formato/listas";

const PAGE_SIZE = 25;

type CampoOrden = "producto" | "clasificacion" | "disponible" | "costo";

type NivelFiltro =
  | "TODOS"
  | StockNivel;

type PropiedadFiltro =
  | "TODOS"
  | StockPropiedad;

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
// INV-R02-01: costo unitario exacto (texto); sin costo cuenta como 0 para ordenar.
function costoUnitario(item: StockItem) {
  return item.costoPromedioTexto ?? "0";
}


export default function StockPage() {
  const [stockCompleto, setStock] =
    useState<StockItem[]>([]);
  const [alcanceParcial, setAlcanceParcial] = useState(false);
  // INV-02: atajos hacia Movimientos solo con los permisos que exigen sus guardas de página.
  const [permisos, setPermisos] = useState(SIN_PERMISOS_MOVIMIENTOS);

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

  const [paginacion, setPaginacion] = useState({ clave: "", pagina: 1 });

  const [cargando, setCargando] =
    useState(true);

  // STK-D02: moneda de los costos = moneda base de la empresa de ESTA instancia, confirmada por su propia respuesta (null mientras no llegue: no se muestra ninguna moneda inventada).
  const [monedaBase, setMonedaBase] = useState<string | null>(null);

  const [errorCarga, setErrorCarga] =
    useState("");

  const [orden, setOrden] = useState<Orden<CampoOrden>>(null);

  // INV-R02-02: depósitos autorizados (con o sin saldo) y aviso cuando el enlace pide un depósito que no está disponible.
  const [autorizados, setAutorizados] = useState<Array<{ id: string; nombre: string }>>([]);
  const [depositoNoDisponible, setDepositoNoDisponible] = useState(false);

  useEffect(() => {
    return iniciarCargaStock(cargarStock, {
      alCompletar: (r, moneda) => {
        setMonedaBase(moneda);
        setStock(r.stock);
        // Atajo desde Depósitos (?deposito=): se valida contra los depósitos AUTORIZADOS; uno sin saldo se muestra vacío y uno no disponible se avisa (nunca consolidado en silencio).
        const lista = Array.isArray(r.depositosAutorizados) ? r.depositosAutorizados : [];
        const pedido = interpretarDepositoUrl(window.location.search, lista);

        setAutorizados(lista);
        if (pedido.tipo === "SELECCIONADO") setDeposito(pedido.id);
        setDepositoNoDisponible(pedido.tipo === "NO_DISPONIBLE");
        setAlcanceParcial(r.alcanceParcial === true);
        setPermisos(normalizarPermisosMovimientos(r.permisos));
      },
      alFallar: (mensaje) => setErrorCarga(mensaje),
      alFinalizar: () => setCargando(false),
    });
  }, []);

  // Con un depósito elegido TODO (filas, tarjetas, filtros, orden) usa los saldos y el costo de ese depósito; sin él, la visión consolidada.
  const stock = useMemo(
    () => (deposito === "TODOS" ? stockCompleto : stockCompleto.flatMap((item) => vistaPorDeposito(item, deposito) ?? [])),
    [stockCompleto, deposito],
  );

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

    autorizados.forEach((d) => map.set(d.id, d.nombre));

    stockCompleto.forEach((item) => {
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
  }, [stockCompleto, autorizados]);

  const resumen = useMemo(() => indicadoresStock(stock), [stock]);

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
            return compararDecimales(costoUnitario(a), costoUnitario(b));
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

  // La página vuelve a 1 cuando cambian los filtros o el orden y nunca excede el total: se deriva en el render (sin efecto).
  const claveFiltros = JSON.stringify([busqueda, nivel, propiedad, marca, familia, linea, procedencia, deposito, orden]);
  const pagina = paginacion.clave === claveFiltros ? Math.min(paginacion.pagina, totalPaginas) : 1;
  const setPagina = (valor: number | ((actual: number) => number)) =>
    setPaginacion({ clave: claveFiltros, pagina: typeof valor === "function" ? valor(pagina) : valor });

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
          {puedeVerMovimientos(permisos) ? (
            <Link href="/movimientos" className={ui.secondaryButton}>
              Movimientos
            </Link>
          ) : null}
          {puedeAbrirNuevoMovimiento(permisos) ? (
            <Link href="/movimientos/nuevo" className={ui.secondaryButton}>
              Nuevo movimiento
            </Link>
          ) : null}
          <Link href="/reposicion" className={ui.primaryButton}>
            Ver reposición
          </Link>
        </div>
      </header>

      <p className={ui.resultCount} role="status" style={{ margin: "0 0 8px" }}>
        {deposito === "TODOS"
          ? `Visión consolidada${alcanceParcial ? " de los depósitos que usted tiene autorizados" : " de todos los depósitos"}.`
          : `Visión del depósito ${depositos.find(([id]) => id === deposito)?.[1] ?? ""}: cantidades, costo y valores corresponden solo a este depósito; el mínimo y el máximo son los configurados para él.`}
      </p>

      {depositoNoDisponible ? (
        <p className={ui.alertError} role="alert" style={{ margin: "0 0 8px" }}>
          El depósito indicado en el enlace no existe, está desactualizado o no está en su alcance; no se aplicó ningún filtro y se muestra la visión consolidada.{" "}
          <button type="button" className={ui.secondaryButton} onClick={() => { setDepositoNoDisponible(false); window.history.replaceState(null, "", "/stock"); }}>
            Ver todos
          </button>
        </p>
      ) : null}

      {deposito !== "TODOS" && stock.length === 0 && !cargando && !errorCarga ? (
        <p className={ui.resultCount} role="status" style={{ margin: "0 0 8px" }}>
          El depósito {depositos.find(([id]) => id === deposito)?.[1] ?? ""} está autorizado, pero no tiene saldos de stock (0 productos con existencia).
        </p>
      ) : null}

      <section className={ui.summaryGrid} aria-label="Resumen de stock">
        <article className={[ui.summaryCard, ui.summaryTeal].join(" ")}>
          <span>SKU</span>
          <strong>{resumen.sku}</strong>
          <small>Productos inventariados</small>
        </article>

        <article className={[ui.summaryCard, ui.summaryBlue].join(" ")}>
          <span>Disponible</span>
          <strong>{formatearCantidad(resumen.disponible)}</strong>
          <small>Stock disponible</small>
        </article>

        <article className={[ui.summaryCard, ui.summaryAmber].join(" ")}>
          <span>Bajo mínimo</span>
          <strong>{resumen.stockBajo}</strong>
          <small>Disponible menor que el mínimo</small>
        </article>

        <article className={[ui.summaryCard, ui.summaryRed].join(" ")}>
          <span>Sin stock</span>
          <strong>{resumen.sinStock}</strong>
          <small>Saldo disponible cero</small>
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
              <option value="BAJO">Bajo mínimo</option>
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
            <select value={deposito} onChange={(event) => { setDeposito(event.target.value); setDepositoNoDisponible(false); }}>
              <option value="TODOS">Todos</option>
              {depositos.map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </select>
          </label>

          <div className={ui.toolbarEnd}>
          <details className={ui.ayuda}>
            <summary aria-label="Ayuda: significado de R, C, T y Sobrestock" title="Ayuda: R, C, T y Sobrestock">
              ?
            </summary>
            <div className={ui.ayudaPanel} role="note">
              <strong>Columnas R / C / T</strong>
              <p>R = reservado · C = cuarentena · T = en tránsito.</p>
              <strong>Bajo mínimo y reposición</strong>
              <p>«Bajo mínimo» compara el disponible con el mínimo. Reposición también considera el punto de reposición: un producto puede estar «Normal» aquí y necesitar reposición allá.</p>
              <strong>Sobrestock</strong>
              <p>
                Existencia física propia (disponible + reservado + cuarentena) mayor que el stock máximo registrado en la
                ficha del producto.
              </p>
            </div>
          </details>

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
                          {ETIQUETA_NIVEL[item.nivel]}
                        </span>
                      </span>
                    </div>
                  </td>

                  <td className={ui.numeric}>
                    <div className={ui.cell}>
                      <strong className={ui.mono}>{monedaBase ? formatearCostoUnitarioTexto(item.costoPromedioTexto, monedaBase) : "—"}</strong>
                      <span>Valor costo: {monedaBase ? formatearMontoTexto(item.valorInventarioTexto, monedaBase) : "—"}</span>
                      <span>
                        Venta referencia:{" "}
                        {item.precioVentaReferenciaTexto === null || !(item.monedaPrecio || monedaBase) ? "—" : formatearMontoTexto(item.precioVentaReferenciaTexto, item.monedaPrecio || monedaBase)}
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
