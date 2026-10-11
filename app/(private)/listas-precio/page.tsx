"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { cargarListas } from "@/lib/listas-precio/cliente-api";

import {
  ListaPrecioFila,
  ListaPrecioEstado,
  ListaPrecioMoneda,
  ListaPrecioTipo,
} from "@/types/lista-precio";

import { compararTexto, ordenarLista, siguienteOrden, type Orden } from "@/components/ui/lista-padrao/orden";
import { ThOrdenable } from "@/components/ui/lista-padrao/th-ordenable";
import ui from "@/components/ui/lista-padrao/lista.module.css";

const PAGE_SIZE = 8;

type CampoOrden = "lista" | "aplicacion" | "vigencia" | "tipo" | "estado";

type EstadoFiltro =
  | "TODOS"
  | ListaPrecioEstado;

type TipoFiltro =
  | "TODOS"
  | ListaPrecioTipo;

type MonedaFiltro =
  | "TODOS"
  | ListaPrecioMoneda;

function getEstadoReal(
  lista: ListaPrecioFila,
): ListaPrecioEstado {
  if (
    lista.vigenteHasta &&
    new Date(
      `${lista.vigenteHasta}T23:59:59`,
    ).getTime() <
      new Date().getTime()
  ) {
    return "VENCIDA";
  }

  return lista.estado;
}

function formatearFecha(
  value: string,
) {
  if (!value) {
    return "Sin vencimiento";
  }

  return new Intl.DateTimeFormat(
    "es-PY",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  ).format(
    new Date(
      `${value}T12:00:00`,
    ),
  );
}

function textoVigencia(lista: ListaPrecioFila) {
  const desde = lista.vigenteDesde ? formatearFecha(lista.vigenteDesde) : "";
  const hasta = lista.vigenteHasta ? formatearFecha(lista.vigenteHasta) : "";

  if (desde && hasta) {
    return `${desde} → ${hasta}`;
  }

  if (desde) {
    return `Desde ${desde} · sin vencimiento`;
  }

  return hasta ? `Hasta ${hasta}` : "Sin vigencia definida";
}

function formatMoneda(
  moneda: ListaPrecioMoneda,
) {
  return moneda;
}

function getAplicacion(
  lista: ListaPrecioFila,
) {
  if (lista.clienteNombre) {
    return `Cliente · ${lista.clienteNombre}`;
  }

  if (lista.grupoClienteNombre) {
    return `Grupo · ${lista.grupoClienteNombre}`;
  }

  if (lista.zonaNombre) {
    return `Zona · ${lista.zonaNombre}`;
  }

  if (lista.canalVentaNombre) {
    return `Canal · ${lista.canalVentaNombre}`;
  }

  return "Aplicación general";
}

function getModoLabel(
  lista: ListaPrecioFila,
) {
  if (
    lista.modoPrecio ===
    "AJUSTE_PORCENTAJE"
  ) {
    if (
      lista.ajusteGeneralPct < 0
    ) {
      return `${Math.abs(
        lista.ajusteGeneralPct,
      )}% descuento`;
    }

    if (
      lista.ajusteGeneralPct > 0
    ) {
      return `${lista.ajusteGeneralPct}% aumento`;
    }

    return "Sin ajuste";
  }

  if (
    lista.modoPrecio ===
    "MARGEN_SOBRE_COSTO"
  ) {
    return "Margen sobre costo";
  }

  return "Precio fijo";
}

export default function ListasPrecioPage() {
  const [listas, setListas] =
    useState<ListaPrecioFila[]>([]);

  const [busqueda, setBusqueda] =
    useState("");

  const [filtroEstado, setFiltroEstado] =
    useState<EstadoFiltro>("TODOS");

  const [filtroTipo, setFiltroTipo] =
    useState<TipoFiltro>("TODOS");

  const [filtroMoneda, setFiltroMoneda] =
    useState<MonedaFiltro>("TODOS");

  const [pagina, setPagina] =
    useState(1);

  const [flash, setFlash] =
    useState("");

  const [cargando, setCargando] =
    useState(true);

  const [errorCarga, setErrorCarga] =
    useState("");

  const [orden, setOrden] = useState<Orden<CampoOrden>>(null);

  useEffect(() => {
    let activo = true;

    cargarListas()
      .then((datos) => {
        if (activo) setListas(datos);
      })
      .catch((e: unknown) => {
        if (activo)
          setErrorCarga(
            e instanceof Error
              ? e.message
              : "No fue posible cargar las listas de precios.",
          );
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    // Aviso tras crear/editar (?ok=creado|actualizado).
    const ok = new URLSearchParams(
      window.location.search,
    ).get("ok");

    if (ok === "creado") {
      setFlash("Lista de precios registrada correctamente.");
    } else if (ok === "actualizado") {
      setFlash("Lista de precios actualizada correctamente.");
    }

    if (ok) {
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
    setPagina(1);
  }, [
    busqueda,
    filtroEstado,
    filtroTipo,
    filtroMoneda,
    orden,
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
    const hoy = new Date();

    const limite =
      new Date();

    limite.setDate(
      limite.getDate() + 30,
    );

    return listas.reduce(
      (acc, lista) => {
        acc.total += 1;

        const estado =
          getEstadoReal(lista);

        if (
          lista.activo &&
          estado === "ACTIVA"
        ) {
          acc.activas += 1;
        }

        if (
          lista.tipo === "VENTA"
        ) {
          acc.venta += 1;
        }

        if (
          lista.tipo === "COMPRA"
        ) {
          acc.compra += 1;
        }

        if (lista.vigenteHasta) {
          const vence =
            new Date(
              `${lista.vigenteHasta}T23:59:59`,
            );

          if (
            vence >= hoy &&
            vence <= limite
          ) {
            acc.proximasAVencer += 1;
          }
        }

        return acc;
      },
      {
        total: 0,
        activas: 0,
        venta: 0,
        compra: 0,
        proximasAVencer: 0,
      },
    );
  }, [listas]);

  const filtradas = useMemo(() => {
    const term =
      busqueda
        .trim()
        .toLocaleLowerCase("es");

    return listas.filter(
      (lista) => {
        const estado =
          getEstadoReal(lista);

        if (
          filtroEstado !==
            "TODOS" &&
          estado !== filtroEstado
        ) {
          return false;
        }

        if (
          filtroTipo !==
            "TODOS" &&
          lista.tipo !== filtroTipo
        ) {
          return false;
        }

        if (
          filtroMoneda !==
            "TODOS" &&
          lista.monedaCodigo !==
            filtroMoneda
        ) {
          return false;
        }

        if (!term) {
          return true;
        }

        return [
          lista.codigo,
          lista.nombre,
          lista.descripcion,
          lista.listaBaseCodigo,
          lista.listaBaseNombre,
          lista.grupoClienteNombre,
          lista.clienteNombre,
          lista.zonaNombre,
          lista.canalVentaNombre,
          lista.monedaCodigo,
        ]
          .join(" ")
          .toLocaleLowerCase("es")
          .includes(term);
      },
    );
  }, [
    listas,
    busqueda,
    filtroEstado,
    filtroTipo,
    filtroMoneda,
  ]);

  // Ordenación sobre el conjunto filtrado COMPLETO (toda la lista está cargada), antes de paginar.
  const ordenados = useMemo(
    () =>
      ordenarLista(filtradas, orden, (campo, a, b) => {
        switch (campo) {
          case "lista":
            return compararTexto(a.nombre, b.nombre);
          case "aplicacion":
            return compararTexto(getAplicacion(a), getAplicacion(b));
          case "vigencia":
            return compararTexto(a.vigenteHasta || "9999-12-31", b.vigenteHasta || "9999-12-31");
          case "tipo":
            return compararTexto(a.tipo, b.tipo);
          case "estado":
            return compararTexto(getEstadoReal(a), getEstadoReal(b));
        }
      }),
    [filtradas, orden],
  );

  function cambiarOrden(campo: CampoOrden) {
    setOrden((actual) => siguienteOrden(actual, campo));
  }

  const totalPaginas =
    Math.max(
      1,
      Math.ceil(
        filtradas.length /
          PAGE_SIZE,
      ),
    );

  const paginaActual =
    useMemo(
      () =>
        ordenados.slice(
          (pagina - 1) *
            PAGE_SIZE,
          pagina * PAGE_SIZE,
        ),
    [ordenados, pagina],
    );

  return (
    <section className={ui.page}>
      {flash ? (
        <div className={ui.toast} role="status">
          <span>✓</span>
          <div>
            <strong>Operación realizada</strong>
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
            <span>Maestros</span>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Listas de precios</span>
          </nav>

          <h1>Listas de precios</h1>
        </div>

        <Link href="/listas-precio/nuevo" className={ui.primaryButton}>
          <span aria-hidden="true">+</span>
          Nueva lista
        </Link>
      </header>

      <section className={ui.summaryGrid} aria-label="Resumen de listas de precios">
        <article className={[ui.summaryCard, ui.summaryTeal].join(" ")}>
          <span>Listas activas</span>
          <strong>{resumen.activas}</strong>
          <small>Disponibles para operar</small>
        </article>

        <article className={[ui.summaryCard, ui.summaryBlue].join(" ")}>
          <span>Listas de venta</span>
          <strong>{resumen.venta}</strong>
          <small>Precios comerciales</small>
        </article>

        <article className={[ui.summaryCard, ui.summaryViolet].join(" ")}>
          <span>Listas de compra</span>
          <strong>{resumen.compra}</strong>
          <small>Referencias de costo</small>
        </article>

        <article className={[ui.summaryCard, ui.summaryAmber].join(" ")}>
          <span>Próximas a vencer</span>
          <strong>{resumen.proximasAVencer}</strong>
          <small>Dentro de 30 días</small>
        </article>
      </section>

      <section className={ui.contentCard}>
        <div className={ui.toolbar}>
          <label className={ui.search}>
            <span aria-hidden="true">⌕</span>

            <input
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Buscar por código, nombre, grupo, cliente, canal..."
              aria-label="Buscar listas de precios"
            />
          </label>

          <label className={ui.filterField}>
            <span>Estado</span>
            <select value={filtroEstado} onChange={(event) => setFiltroEstado(event.target.value as EstadoFiltro)}>
              <option value="TODOS">Todos</option>
              <option value="ACTIVA">Activas</option>
              <option value="BORRADOR">Borrador</option>
              <option value="INACTIVA">Inactivas</option>
              <option value="VENCIDA">Vencidas</option>
            </select>
          </label>

          <label className={ui.filterField}>
            <span>Tipo</span>
            <select value={filtroTipo} onChange={(event) => setFiltroTipo(event.target.value as TipoFiltro)}>
              <option value="TODOS">Todos</option>
              <option value="VENTA">Venta</option>
              <option value="COMPRA">Compra</option>
            </select>
          </label>

          <label className={ui.filterField}>
            <span>Moneda</span>
            <select value={filtroMoneda} onChange={(event) => setFiltroMoneda(event.target.value as MonedaFiltro)}>
              <option value="TODOS">Todas</option>
              {Array.from(new Set(listas.map((l) => l.monedaCodigo)))
                .sort()
                .map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
            </select>
          </label>

          <button
            type="button"
            className={ui.clearButton}
            onClick={() => {
              setBusqueda("");
              setFiltroEstado("TODOS");
              setFiltroTipo("TODOS");
              setFiltroMoneda("TODOS");
            }}
          >
            Limpiar filtros
          </button>

          <span className={ui.resultCount} aria-live="polite">
            {filtradas.length} de {resumen.total}
          </span>
        </div>

        <div className={ui.tableScroll}>
          <table className={ui.table}>
            <thead>
              <tr>
                <ThOrdenable titulo="Lista de precios" campo="lista" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Aplicación" campo="aplicacion" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Condiciones" campo="vigencia" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Tipo" campo="tipo" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Estado" campo="estado" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Acciones" alinear="derecha" />
              </tr>
            </thead>

            <tbody>
              {paginaActual.map((lista) => {
                const estado = getEstadoReal(lista);

                return (
                  <tr key={lista.id} className={ui.row}>
                    <td>
                      <div className={ui.clientMain}>
                        <div className={ui.avatar} aria-hidden="true">
                          {lista.tipo === "VENTA" ? "$" : "C"}
                        </div>

                        <div className={ui.clientIdentity}>
                          <Link href={`/listas-precio/${lista.id}`} className={ui.clientName}>
                            {lista.nombre}
                          </Link>
                          <span className={ui.code}>
                            {lista.codigo} · {lista.productosCount} productos · {formatMoneda(lista.monedaCodigo)} ·{" "}
                            {lista.incluyeIva ? "IVA incluido" : "IVA no incluido"}
                          </span>
                          <span className={[ui.descr, ui.clamp2].join(" ")} title={lista.descripcion || undefined}>
                            {lista.descripcion || "Sin descripción"}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className={ui.cell}>
                        <strong>{getAplicacion(lista)}</strong>
                        <span>
                          {lista.listaBaseNombre
                            ? `Base: ${lista.listaBaseCodigo} · ${lista.listaBaseNombre}`
                            : "Sin lista base"}
                        </span>
                        <span>Prioridad {lista.prioridad}</span>
                      </div>
                    </td>

                    <td>
                      <div className={ui.cell}>
                        <strong>{getModoLabel(lista)}</strong>
                        <span>{textoVigencia(lista)}</span>
                      </div>
                    </td>

                    <td>
                      <span className={lista.tipo === "VENTA" ? ui.statusInfo : ui.statusPurple}>
                        {lista.tipo === "VENTA" ? "Venta" : "Compra"}
                      </span>
                    </td>

                    <td>
                      <span
                        className={
                          estado === "ACTIVA"
                            ? ui.statusActive
                            : estado === "VENCIDA"
                              ? ui.statusDanger
                              : estado === "BORRADOR"
                                ? ui.statusWarning
                                : ui.statusInactive
                        }
                      >
                        {estado === "ACTIVA"
                          ? "Activa"
                          : estado === "VENCIDA"
                            ? "Vencida"
                            : estado === "BORRADOR"
                              ? "Borrador"
                              : "Inactiva"}
                      </span>
                    </td>

                    <td className={ui.actionsCell}>
                      <Link
                        href={`/listas-precio/${lista.id}`}
                        className={ui.detailButton}
                        aria-label={`Ver lista ${lista.nombre}`}
                      >
                        Ver lista
                        <span aria-hidden="true">›</span>
                      </Link>
                    </td>
                  </tr>
                );
              })}

              {paginaActual.length === 0 ? (
                <tr>
                  <td colSpan={6} className={ui.emptyCell}>
                    <div className={ui.empty} role={errorCarga ? "alert" : undefined}>
                      <strong>
                        {cargando
                          ? "Cargando listas de precios..."
                          : errorCarga ||
                            (listas.length === 0
                              ? "Aún no hay listas de precios registradas"
                              : "No se encontraron listas de precios")}
                      </strong>
                      {!cargando && !errorCarga ? (
                        <span>
                          {listas.length === 0
                            ? "Cree su primera lista para comenzar a operar."
                            : "Modifique los filtros o cree una nueva lista."}
                        </span>
                      ) : null}
                      {!cargando && !errorCarga && listas.length === 0 ? (
                        <Link href="/listas-precio/nuevo" className={ui.emptyAction}>
                          + Nueva lista
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
            Mostrando {filtradas.length === 0 ? 0 : (pagina - 1) * PAGE_SIZE + 1}–
            {Math.min(pagina * PAGE_SIZE, filtradas.length)} de {filtradas.length}
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
