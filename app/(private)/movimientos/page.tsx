"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { cargarMovimientos } from "@/lib/movimientos/cliente-api";

import {
  MovimientoStockFila,
  MovimientoStockTipo,
} from "@/types/movimientos-stock";

import { compararTexto, ordenarLista, siguienteOrden, type Orden } from "@/components/ui/lista-padrao/orden";
import { ThOrdenable } from "@/components/ui/lista-padrao/th-ordenable";
import ui from "@/components/ui/lista-padrao/lista.module.css";

const PAGE_SIZE = 20;

type CampoOrden = "movimiento" | "producto" | "deposito" | "cantidad";

type TipoFiltro =
  | "TODOS"
  | MovimientoStockTipo;

function tipoLabel(
  tipo: MovimientoStockTipo,
) {
  switch (tipo) {
    case "ENTRADA":
      return "Entrada";
    case "SALIDA":
      return "Salida";
    case "TRANSFERENCIA":
      return "Transferencia";
    case "AJUSTE_POSITIVO":
      return "Ajuste +";
    case "AJUSTE_NEGATIVO":
      return "Ajuste -";
    case "RESERVA":
      return "Reserva";
    case "LIBERACION_RESERVA":
      return "Liberar reserva";
    case "CUARENTENA":
      return "Cuarentena";
    case "LIBERACION_CUARENTENA":
      return "Liberar cuarentena";
  }
}

export default function MovimientosPage() {
  const [movimientos, setMovimientos] =
    useState<MovimientoStockFila[]>([]);

  const [busqueda, setBusqueda] =
    useState("");

  const [tipo, setTipo] =
    useState<TipoFiltro>("TODOS");

  const [flash, setFlash] =
    useState("");

  const [cargando, setCargando] =
    useState(true);

  const [errorCarga, setErrorCarga] =
    useState("");
  const [orden, setOrden] = useState<Orden<CampoOrden>>(null);
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    let activo = true;

    cargarMovimientos()
      .then((datos) => {
        if (activo) setMovimientos(datos);
      })
      .catch((e: unknown) => {
        if (activo)
          setErrorCarga(
            e instanceof Error
              ? e.message
              : "No fue posible cargar los movimientos.",
          );
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    // Aviso tras registrar (?ok=<número>).
    const ok = new URLSearchParams(
      window.location.search,
    ).get("ok");

    if (ok) {
      setFlash(`Movimiento ${ok} registrado correctamente.`);
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
    return movimientos.reduce(
      (acc, mov) => {
        acc.total += 1;

        if (mov.tipo === "ENTRADA") {
          acc.entradas += 1;
        }

        if (mov.tipo === "SALIDA") {
          acc.salidas += 1;
        }

        if (
          mov.tipo ===
          "TRANSFERENCIA"
        ) {
          acc.transferencias += 1;
        }

        return acc;
      },
      {
        total: 0,
        entradas: 0,
        salidas: 0,
        transferencias: 0,
      },
    );
  }, [movimientos]);

  const filtrados = useMemo(() => {
    const term =
      busqueda
        .trim()
        .toLocaleLowerCase("es");

    return movimientos.filter(
      (mov) => {
        if (
          tipo !== "TODOS" &&
          mov.tipo !== tipo
        ) {
          return false;
        }

        if (!term) {
          return true;
        }

        return [
          mov.numero,
          mov.productoCodigo,
          mov.productoDescripcion,
          mov.documentoReferencia,
          mov.motivo,
          mov.depositoOrigenNombre,
          mov.depositoDestinoNombre,
        ]
          .join(" ")
          .toLocaleLowerCase("es")
          .includes(term);
      },
    );
  }, [
    movimientos,
    busqueda,
    tipo,
  ]);

  // Ordenación sobre el conjunto filtrado COMPLETO (toda la lista está cargada), antes de paginar.
  const ordenados = useMemo(
    () =>
      ordenarLista(filtrados, orden, (campo, a, b) => {
        switch (campo) {
          case "movimiento":
            return compararTexto(a.creadoEn || `${a.fecha} ${a.hora}`, b.creadoEn || `${b.fecha} ${b.hora}`);
          case "producto":
            return compararTexto(a.productoDescripcion, b.productoDescripcion);
          case "deposito":
            return compararTexto(
              a.depositoDestinoNombre || a.depositoOrigenNombre,
              b.depositoDestinoNombre || b.depositoOrigenNombre,
            );
          case "cantidad":
            return a.cantidad - b.cantidad;
        }
      }),
    [filtrados, orden],
  );

  function cambiarOrden(campo: CampoOrden) {
    setOrden((actual) => siguienteOrden(actual, campo));
  }

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));

  useEffect(() => {
    setPagina(1);
  }, [busqueda, tipo, orden]);

  useEffect(() => {
    if (pagina > totalPaginas) {
      setPagina(totalPaginas);
    }
  }, [pagina, totalPaginas]);

  const paginaActual = useMemo(
    () => ordenados.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE),
    [ordenados, pagina],
  );
  return (
    <section className={ui.page}>
      {flash ? (
        <div className={ui.toast} role="status">
          <span>✓</span>
          <div>
            <strong>Movimiento registrado</strong>
            <small>{flash}</small>
          </div>

          <button type="button" aria-label="Cerrar mensaje" onClick={() => setFlash("")}>
            ×
          </button>
        </div>
      ) : null}

      <header className={ui.topbar}>
        <div className={ui.titleBlock}>
          <nav className={ui.breadcrumb} aria-label="Ruta de navegación">
            <span>Inventario</span>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Movimientos</span>
          </nav>

          <h1>Movimientos de stock</h1>
        </div>

        <Link href="/movimientos/nuevo" className={ui.primaryButton}>
          <span aria-hidden="true">+</span>
          Nuevo movimiento
        </Link>
      </header>

      <section className={ui.summaryGrid} aria-label="Resumen de movimientos">
        <article className={[ui.summaryCard, ui.summaryTeal].join(" ")}>
          <span>Total</span>
          <strong>{resumen.total}</strong>
          <small>Movimientos registrados</small>
        </article>

        <article className={[ui.summaryCard, ui.summaryBlue].join(" ")}>
          <span>Entradas</span>
          <strong>{resumen.entradas}</strong>
          <small>Ingresos de stock</small>
        </article>

        <article className={[ui.summaryCard, ui.summaryAmber].join(" ")}>
          <span>Salidas</span>
          <strong>{resumen.salidas}</strong>
          <small>Egresos de stock</small>
        </article>

        <article className={[ui.summaryCard, ui.summaryViolet].join(" ")}>
          <span>Transferencias</span>
          <strong>{resumen.transferencias}</strong>
          <small>Entre depósitos</small>
        </article>
      </section>

      <section className={ui.contentCard}>
        <div className={ui.toolbar}>
          <label className={ui.search}>
            <span aria-hidden="true">⌕</span>

            <input
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Buscar por movimiento, producto, documento, depósito..."
              aria-label="Buscar movimientos"
            />
          </label>

          <label className={ui.filterField}>
            <span>Tipo</span>
            <select value={tipo} onChange={(event) => setTipo(event.target.value as TipoFiltro)}>
              <option value="TODOS">Todos</option>
              <option value="ENTRADA">Entrada</option>
              <option value="SALIDA">Salida</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="AJUSTE_POSITIVO">Ajuste positivo</option>
              <option value="AJUSTE_NEGATIVO">Ajuste negativo</option>
              <option value="RESERVA">Reserva</option>
              <option value="LIBERACION_RESERVA">Liberación reserva</option>
              <option value="CUARENTENA">Cuarentena</option>
              <option value="LIBERACION_CUARENTENA">Liberación cuarentena</option>
            </select>
          </label>

          <button
            type="button"
            className={ui.clearButton}
            onClick={() => {
              setBusqueda("");
              setTipo("TODOS");
            }}
          >
            Limpiar filtros
          </button>

          <span className={ui.resultCount} aria-live="polite">
            {filtrados.length} de {resumen.total}
          </span>
        </div>

        <div className={ui.tableScroll}>
          <table className={ui.table}>
            <thead>
              <tr>
                <ThOrdenable titulo="Movimiento" campo="movimiento" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Producto" campo="producto" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Depósito" campo="deposito" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Cantidad" campo="cantidad" orden={orden} onOrden={cambiarOrden} alinear="derecha" />
                <ThOrdenable titulo="Acciones" alinear="derecha" />
              </tr>
            </thead>

            <tbody>
              {paginaActual.map((mov) => (
                <tr key={mov.lineaId} className={ui.row}>
                  <td>
                    <div className={ui.cell}>
                      <strong>
                        <Link href={`/movimientos/${mov.id}`} className={ui.clientName}>
                          {mov.numero}
                        </Link>{" "}
                        <span className={ui.statusInfo}>{tipoLabel(mov.tipo)}</span>
                        {mov.estado === "ANULADO" ? (
                          <>
                            {" "}
                            <span className={ui.statusDanger}>Anulado</span>
                          </>
                        ) : mov.origen === "ANULACION" ? (
                          <>
                            {" "}
                            <span className={ui.statusWarning}>Anulación</span>
                          </>
                        ) : null}
                      </strong>
                      <span>
                        {mov.fecha} · {mov.hora}
                        {mov.documentoReferencia ? ` · ${mov.documentoReferencia}` : ""}
                      </span>
                    </div>
                  </td>

                  <td>
                    <div className={ui.cell}>
                      <strong>{mov.productoDescripcion}</strong>
                      <span>{mov.productoCodigo}</span>
                    </div>
                  </td>

                  <td>
                    <div className={ui.cell}>
                      <strong>
                        {mov.tipo === "TRANSFERENCIA"
                          ? `${mov.depositoOrigenNombre} → ${mov.depositoDestinoNombre}`
                          : mov.depositoDestinoNombre || mov.depositoOrigenNombre || "Sin depósito"}
                      </strong>
                      <span>{mov.motivo}</span>
                    </div>
                  </td>

                  <td className={ui.numeric}>
                    <div className={ui.cell}>
                      <strong className={ui.mono}>
                        {mov.cantidad} {mov.unidadMedidaNombre}
                      </strong>
                      <span>
                        {mov.lote ? `Lote ${mov.lote}` : mov.propiedad === "TERCERO" ? "Stock tercero" : "Stock propio"}
                      </span>
                    </div>
                  </td>

                  <td className={ui.actionsCell}>
                    <Link
                      href={`/movimientos/${mov.id}`}
                      className={ui.detailButton}
                      aria-label={`Ver detalle del movimiento ${mov.numero}`}
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
                          ? "Cargando movimientos..."
                          : errorCarga ||
                            (movimientos.length === 0
                              ? "Aún no hay movimientos registrados"
                              : "No se encontraron movimientos")}
                      </strong>
                      {!cargando && !errorCarga ? (
                        <span>
                          {movimientos.length === 0
                            ? "Registre el primer movimiento para comenzar a operar."
                            : "Modifique los filtros o registre un nuevo movimiento."}
                        </span>
                      ) : null}
                      {!cargando && !errorCarga && movimientos.length === 0 ? (
                        <Link href="/movimientos/nuevo" className={ui.emptyAction}>
                          + Nuevo movimiento
                        </Link>
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
