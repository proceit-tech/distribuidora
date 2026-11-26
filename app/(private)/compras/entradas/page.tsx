"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import ui from "@/components/ui/lista-padrao/lista.module.css";
import { CampoFecha } from "@/components/ui/campo-fecha";
import { cargarEntradas, conCodigo, type RespuestaEntradas } from "@/lib/compras/entradas-cliente";
import { formatearFechaIso } from "@/lib/formato/listas";
import { formatearMontoTexto } from "@/lib/inventario/decimal";

type EstadoFiltro = "TODOS" | "REGISTRADO" | "ANULADO";

/** E6-A — Compras → Entradas: listado de entradas REALES registradas en este módulo (una fila por entrada / movimiento). No incluye movimientos COMPRA manuales ni recepciones DEMO. */
export default function EntradasPage() {
  const [busqueda, setBusqueda] = useState("");
  const [busquedaAplicada, setBusquedaAplicada] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [estado, setEstado] = useState<EstadoFiltro>("TODOS");
  const [paginacion, setPaginacion] = useState({ clave: "", pagina: 1 });
  const [recarga, setRecarga] = useState(0);
  const [resultado, setResultado] = useState<{ clave: string; datos?: RespuestaEntradas; error?: string } | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setBusquedaAplicada(busqueda.trim()), 300);

    return () => window.clearTimeout(t);
  }, [busqueda]);

  const claveFiltros = JSON.stringify([busquedaAplicada, desde, hasta, estado]);
  const pagina = paginacion.clave === claveFiltros ? paginacion.pagina : 1;
  const claveConsulta = JSON.stringify([claveFiltros, pagina, recarga]);

  useEffect(() => {
    let vigente = true;

    // La respuesta (datos o error) solo se aplica si sigue siendo la consulta vigente.
    cargarEntradas({ q: busquedaAplicada, desde, hasta, estado: estado === "TODOS" ? undefined : estado, pagina })
      .then((datos) => {
        if (vigente) setResultado({ clave: claveConsulta, datos });
      })
      .catch((e: unknown) => {
        if (vigente) setResultado({ clave: claveConsulta, error: e instanceof Error ? e.message : "No fue posible cargar las entradas." });
      });

    return () => {
      vigente = false;
    };
    // claveConsulta resume todos los parámetros de la consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveConsulta]);

  const actual = resultado?.clave === claveConsulta ? resultado : null;
  const cargando = actual === null;
  const datos = actual?.datos;
  const errorCarga = actual?.error ?? "";
  const filas = datos?.entradas ?? [];
  const total = datos?.total ?? 0;
  const totalPaginas = datos?.totalPaginas ?? 1;
  const paginaMostrada = datos?.pagina ?? pagina;
  const tamano = datos?.tamano ?? 20;
  const hayFiltros = busquedaAplicada !== "" || desde !== "" || hasta !== "" || estado !== "TODOS";
  const setPagina = (valor: number) => setPaginacion({ clave: claveFiltros, pagina: Math.max(1, valor) });

  return (
    <section className={ui.page}>
      <header className={ui.topbar}>
        <div className={ui.titleBlock}>
          <nav className={ui.breadcrumb} aria-label="Ruta de navegación">
            <span>Compras</span>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Entradas</span>
          </nav>

          <h1>Entradas de mercadería</h1>
          <p className={ui.muted} style={{ margin: "2px 0 0", fontSize: 13 }}>
            Entradas a inventario valorizadas a costo, con proveedor. No son facturas de proveedor ni generan IVA fiscal.
          </p>
        </div>

        {datos?.permisos?.crear === true ? (
          <Link href="/compras/entradas/nueva" className={ui.primaryButton}>
            <span aria-hidden="true">+</span>
            Nueva entrada
          </Link>
        ) : null}
      </header>

      <section className={ui.contentCard}>
        <div className={ui.toolbar}>
          <label className={ui.search}>
            <span aria-hidden="true">⌕</span>
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por número, proveedor, RUC o referencia..." aria-label="Buscar entradas" />
          </label>

          <label className={ui.filterField}>
            <span>Desde</span>
            <CampoFecha valor={desde} alCambiar={setDesde} />
          </label>

          <label className={ui.filterField}>
            <span>Hasta</span>
            <CampoFecha valor={hasta} alCambiar={setHasta} />
          </label>

          <label className={ui.filterField}>
            <span>Estado</span>
            <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoFiltro)}>
              <option value="TODOS">Todos</option>
              <option value="REGISTRADO">Registradas</option>
              <option value="ANULADO">Anuladas</option>
            </select>
          </label>

          <button
            type="button"
            className={ui.clearButton}
            onClick={() => {
              setBusqueda("");
              setBusquedaAplicada("");
              setDesde("");
              setHasta("");
              setEstado("TODOS");
            }}
          >
            Limpiar filtros
          </button>

          <span className={ui.resultCount} aria-live="polite">
            {datos ? `${total} entrada(s)` : ""}
          </span>
        </div>

        {errorCarga ? (
          <div className={ui.alertError} role="alert" style={{ margin: "0 0 8px" }}>
            {errorCarga}{" "}
            <button type="button" className={ui.clearButton} onClick={() => setRecarga((n) => n + 1)}>
              Reintentar
            </button>
          </div>
        ) : null}

        <div className={ui.tableScroll}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Entrada</th>
                <th>Proveedor</th>
                <th>Depósito</th>
                <th className={ui.numericHead}>Ítems</th>
                <th className={ui.numericHead}>Costo total</th>
                <th className={ui.actionsHead}>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {filas.map((e) => (
                <tr key={e.id} className={ui.row}>
                  <td>
                    <div className={ui.cell}>
                      <strong>
                        <Link href={`/compras/entradas/${e.id}`} className={ui.clientName}>
                          {e.numero}
                        </Link>
                        {e.estado === "ANULADO" ? (
                          <>
                            {" "}
                            <span className={ui.statusDanger}>Anulada</span>
                          </>
                        ) : null}
                      </strong>
                      <span>
                        {formatearFechaIso(e.fecha)}
                        {e.referencia ? ` · ${e.referencia}` : ""}
                      </span>
                    </div>
                  </td>

                  <td>
                    <div className={ui.cell}>
                      <strong>{e.proveedorNombre}</strong>
                      <span>{conCodigo(e.proveedorCodigo, e.proveedorDocumento)}</span>
                    </div>
                  </td>

                  <td>
                    <div className={ui.cell}>
                      <strong>{e.depositoNombre || "—"}</strong>
                      <span>{e.depositoCodigo}</span>
                    </div>
                  </td>

                  <td className={ui.numeric}>
                    <span className={ui.mono}>{e.lineas}</span>
                  </td>

                  <td className={ui.numeric}>
                    <span className={ui.mono}>{formatearMontoTexto(e.costoTotal, e.moneda)}</span>
                  </td>

                  <td className={ui.actionsCell}>
                    <Link href={`/compras/entradas/${e.id}`} className={ui.detailButton} aria-label={`Ver detalle de la entrada ${e.numero}`}>
                      Ver detalle
                      <span aria-hidden="true">›</span>
                    </Link>
                  </td>
                </tr>
              ))}

              {filas.length === 0 ? (
                <tr>
                  <td colSpan={6} className={ui.emptyCell}>
                    <div className={ui.empty}>
                      <strong>{cargando ? "Cargando entradas..." : errorCarga ? "No se pudo cargar el listado" : hayFiltros ? "No se encontraron entradas" : "Aún no hay entradas registradas"}</strong>
                      {!cargando && !errorCarga && !hayFiltros && datos?.permisos?.crear === true ? (
                        <Link href="/compras/entradas/nueva" className={ui.emptyAction}>
                          + Nueva entrada
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
          <span>{datos ? `Mostrando ${total === 0 ? 0 : (paginaMostrada - 1) * tamano + 1}–${Math.min(paginaMostrada * tamano, total)} de ${total} entrada(s)` : "Mostrando —"}</span>

          <div>
            <button type="button" aria-label="Página anterior" disabled={!datos || paginaMostrada <= 1} onClick={() => setPagina(paginaMostrada - 1)}>
              ‹
            </button>
            <strong>{datos ? `${paginaMostrada} / ${totalPaginas}` : "—"}</strong>
            <button type="button" aria-label="Página siguiente" disabled={!datos || paginaMostrada >= totalPaginas} onClick={() => setPagina(paginaMostrada + 1)}>
              ›
            </button>
          </div>
        </footer>
      </section>
    </section>
  );
}
