"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { cargarMovimientos } from "@/lib/movimientos/cliente-api";
import { derivarVista, lanzarConsulta, type ResultadoHistorial } from "@/lib/movimientos/vista-historial";
import { GRUPOS, ORDEN_GRUPOS } from "@/lib/movimientos/grupos";
import type { MovimientoStockTipo } from "@/types/movimientos-stock";

import { siguienteOrden, type Orden } from "@/components/ui/lista-padrao/orden";
import { ThOrdenable } from "@/components/ui/lista-padrao/th-ordenable";
import ui from "@/components/ui/lista-padrao/lista.module.css";
import { formatearFechaIso } from "@/lib/formato/listas";
import { formatearCantidadMovimiento } from "@/lib/movimientos/formato-cantidad";

const PAGE_SIZE = 20;

type CampoOrden = "movimiento" | "producto" | "deposito" | "cantidad";

type TipoFiltro = "TODOS" | MovimientoStockTipo;

const ETIQUETA_TIPO: Record<MovimientoStockTipo, string> = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  TRANSFERENCIA: "Transferencia",
  AJUSTE_POSITIVO: "Ajuste +",
  AJUSTE_NEGATIVO: "Ajuste -",
  RESERVA: "Reserva",
  LIBERACION_RESERVA: "Liberar reserva",
  CUARENTENA: "Cuarentena",
  LIBERACION_CUARENTENA: "Liberar cuarentena",
};

export default function MovimientosPage() {
  const [busqueda, setBusqueda] = useState("");
  const [busquedaAplicada, setBusquedaAplicada] = useState("");
  const [tipo, setTipo] = useState<TipoFiltro>("TODOS");
  const [orden, setOrden] = useState<Orden<CampoOrden>>(null);
  const [paginacion, setPaginacion] = useState({ clave: "", pagina: 1 });
  const [listo, setListo] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const [resultado, setResultado] = useState<ResultadoHistorial | null>(null);
  // Aviso de registro: solo se muestra si el servidor confirma que el movimiento existe y es visible para el usuario.
  const [flash, setFlash] = useState("");
  const [avisoSinConfirmar, setAvisoSinConfirmar] = useState("");
  const [pendienteConfirmar, setPendienteConfirmar] = useState("");

  // Parámetros de la dirección: ?ok=<número> (tras registrar) y ?buscar=<código de producto>. Se leen una sola vez, fuera del cuerpo del efecto.
  useEffect(() => {
    let activo = true;

    Promise.resolve().then(() => {
      if (!activo) return;

      const consulta = new URLSearchParams(window.location.search);
      const ok = consulta.get("ok");
      const buscar = consulta.get("buscar");

      if (buscar) {
        setBusqueda(buscar.slice(0, 80));
        setBusquedaAplicada(buscar.slice(0, 80));
      }
      if (ok) setPendienteConfirmar(ok.slice(0, 30));
      if (ok || buscar) window.history.replaceState(null, "", window.location.pathname);
      setListo(true);
    });

    return () => {
      activo = false;
    };
  }, []);

  // La búsqueda se aplica tras una pausa para no consultar en cada tecla.
  useEffect(() => {
    const t = window.setTimeout(() => setBusquedaAplicada(busqueda.trim()), 300);

    return () => window.clearTimeout(t);
  }, [busqueda]);

  const claveFiltros = JSON.stringify([busquedaAplicada, tipo, orden]);
  const pagina = paginacion.clave === claveFiltros ? paginacion.pagina : 1;
  const claveConsulta = JSON.stringify([claveFiltros, pagina, recarga]);

  useEffect(() => {
    if (!listo) return;

    // MOV-D02: la respuesta (datos o error) solo se aplica si sigue siendo la consulta vigente (lanzarConsulta la invalida al cambiar la clave o desmontar).
    return lanzarConsulta(
      () =>
        cargarMovimientos({
          q: busquedaAplicada,
          tipo: tipo === "TODOS" ? undefined : tipo,
          orden: orden?.campo,
          dir: orden?.dir,
          pagina,
          tamano: PAGE_SIZE,
          confirmar: pendienteConfirmar || undefined,
        }),
      claveConsulta,
      (r) => {
        setResultado(r);

        if (pendienteConfirmar) {
          // Un error de carga nunca se presenta como éxito: el aviso pendiente queda sin confirmar.
          if (r.error) setAvisoSinConfirmar(`No se pudo confirmar el registro del movimiento ${pendienteConfirmar} porque el historial no se pudo cargar. Verifique antes de repetir la operación.`);
          else if (r.datos?.confirmado === true) setFlash(`Movimiento ${pendienteConfirmar} registrado correctamente.`);
          else setAvisoSinConfirmar(`No se pudo confirmar el registro del movimiento ${pendienteConfirmar}. Verifique en el historial antes de repetir la operación.`);
          setPendienteConfirmar("");
        }
      },
    );
    // pendienteConfirmar solo se consume en la primera carga; limpiarlo no debe provocar otra consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, claveConsulta]);

  useEffect(() => {
    if (!flash) return;

    const timer = window.setTimeout(() => setFlash(""), 4200);

    return () => window.clearTimeout(timer);
  }, [flash]);

  // MOV-D02: todo lo que se muestra (filas, resumen, totales, paginación, permisos) sale de la respuesta de la consulta VIGENTE; con otra pendiente no hay datos y se ve un estado neutro (sin ceros inventados).
  const { cargando, datos, error: errorCarga } = derivarVista(resultado, claveConsulta, listo);
  const filas = datos?.movimientos ?? [];
  const resumen = datos?.resumen ?? null;
  const totalLineas = datos?.total ?? 0;
  const totalPaginas = datos?.totalPaginas ?? 1;
  const paginaMostrada = datos?.pagina ?? pagina;
  const hayFiltros = busquedaAplicada !== "" || tipo !== "TODOS";

  function cambiarOrden(campo: CampoOrden) {
    setOrden((actual) => siguienteOrden(actual, campo));
  }

  const setPagina = (valor: number) => setPaginacion({ clave: claveFiltros, pagina: Math.max(1, valor) });

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

      {avisoSinConfirmar ? (
        <div className={ui.alertError} role="alert">
          {avisoSinConfirmar}{" "}
          <button type="button" className={ui.clearButton} onClick={() => setAvisoSinConfirmar("")}>
            Cerrar
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

        {datos?.permisos?.crear === true ? (
          <Link href="/movimientos/nuevo" className={ui.primaryButton}>
            <span aria-hidden="true">+</span>
            Nuevo movimiento
          </Link>
        ) : null}
      </header>

      <section className={ui.summaryGrid} aria-label="Resumen de movimientos">
        <article className={[ui.summaryCard, ui.summaryTeal].join(" ")}>
          <span>Movimientos</span>
          <strong>{resumen ? resumen.movimientos : "—"}</strong>
          <small>En sus depósitos autorizados</small>
        </article>

        <article className={[ui.summaryCard, ui.summaryBlue].join(" ")}>
          <span>Entradas</span>
          <strong>{resumen ? resumen.entradas : "—"}</strong>
          <small>Ingresos de stock</small>
        </article>

        <article className={[ui.summaryCard, ui.summaryAmber].join(" ")}>
          <span>Salidas</span>
          <strong>{resumen ? resumen.salidas : "—"}</strong>
          <small>Egresos de stock</small>
        </article>

        <article className={[ui.summaryCard, ui.summaryViolet].join(" ")}>
          <span>Transferencias</span>
          <strong>{resumen ? resumen.transferencias : "—"}</strong>
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
              placeholder="Buscar por movimiento, producto, documento, depósito, lote..."
              aria-label="Buscar movimientos"
            />
          </label>

          <label className={ui.filterField}>
            <span>Tipo</span>
            <select value={tipo} onChange={(event) => setTipo(event.target.value as TipoFiltro)}>
              <option value="TODOS">Todos</option>
              {ORDEN_GRUPOS.map((g) => (
                <optgroup key={g} label={GRUPOS[g].etiqueta}>
                  {GRUPOS[g].tipos.map((t) => (
                    <option key={t.tipo} value={t.tipo}>
                      {t.etiqueta}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <button
            type="button"
            className={ui.clearButton}
            onClick={() => {
              setBusqueda("");
              setBusquedaAplicada("");
              setTipo("TODOS");
            }}
          >
            Limpiar filtros
          </button>

          <span className={ui.resultCount} aria-live="polite">
            {datos
              ? hayFiltros
                ? `${totalLineas} línea(s) · ${datos.totalMovimientos} de ${datos.resumen.movimientos} movimiento(s)`
                : `${totalLineas} línea(s) · ${datos.totalMovimientos} movimiento(s)`
              : ""}
          </span>
        </div>

        {errorCarga && !cargando ? (
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
                <ThOrdenable titulo="Movimiento" campo="movimiento" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Producto" campo="producto" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Depósito" campo="deposito" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Cantidad" campo="cantidad" orden={orden} onOrden={cambiarOrden} alinear="derecha" />
                <ThOrdenable titulo="Acciones" alinear="derecha" />
              </tr>
            </thead>

            <tbody>
              {filas.map((mov) => (
                <tr key={mov.lineaId} className={ui.row}>
                  <td>
                    <div className={ui.cell}>
                      <strong>
                        <Link href={`/movimientos/${mov.id}`} className={ui.clientName}>
                          {mov.numero}
                        </Link>{" "}
                        <span className={ui.statusInfo}>{ETIQUETA_TIPO[mov.tipo]}</span>
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
                        {formatearFechaIso(mov.fecha)} · {mov.hora}
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
                        {formatearCantidadMovimiento(mov.cantidad)} {mov.unidadMedidaNombre}
                      </strong>
                      <span>{mov.lote ? `Lote ${mov.lote}` : mov.propiedad === "TERCERO" ? "Stock tercero" : "Stock propio"}</span>
                    </div>
                  </td>

                  <td className={ui.actionsCell}>
                    <Link href={`/movimientos/${mov.id}`} className={ui.detailButton} aria-label={`Ver detalle del movimiento ${mov.numero}`}>
                      Ver detalle
                      <span aria-hidden="true">›</span>
                    </Link>
                  </td>
                </tr>
              ))}

              {filas.length === 0 ? (
                <tr>
                  <td colSpan={5} className={ui.emptyCell}>
                    <div className={ui.empty}>
                      <strong>
                        {cargando
                          ? "Cargando movimientos..."
                          : errorCarga
                            ? "No se pudo cargar el historial"
                            : !hayFiltros
                              ? "Aún no hay movimientos en sus depósitos"
                              : "No se encontraron movimientos"}
                      </strong>
                      {!cargando && !errorCarga ? <span>{!hayFiltros ? "Registre el primer movimiento para comenzar a operar." : "Modifique los filtros o registre un nuevo movimiento."}</span> : null}
                      {!cargando && !errorCarga && !hayFiltros && datos?.permisos?.crear === true ? (
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
            {datos ? `Mostrando ${totalLineas === 0 ? 0 : (paginaMostrada - 1) * PAGE_SIZE + 1}–${Math.min(paginaMostrada * PAGE_SIZE, totalLineas)} de ${totalLineas} línea(s)` : "Mostrando —"}
          </span>

          <div>
            <button type="button" aria-label="Página anterior" disabled={!datos || paginaMostrada <= 1 || cargando} onClick={() => setPagina(paginaMostrada - 1)}>
              ‹
            </button>

            <strong>
              {datos ? `${paginaMostrada} / ${totalPaginas}` : "—"}
            </strong>

            <button type="button" aria-label="Página siguiente" disabled={!datos || paginaMostrada >= totalPaginas || cargando} onClick={() => setPagina(paginaMostrada + 1)}>
              ›
            </button>
          </div>
        </footer>
      </section>
    </section>
  );
}
