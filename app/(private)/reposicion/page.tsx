"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { compararTexto, ordenarLista, siguienteOrden, type Orden } from "@/components/ui/lista-padrao/orden";
import { ThOrdenable } from "@/components/ui/lista-padrao/th-ordenable";
import ui from "@/components/ui/lista-padrao/lista.module.css";
import { formatearCantidad } from "@/lib/formato/listas";
import { puedeAbrirNuevoMovimiento, puedeVerMovimientos, SIN_PERMISOS_MOVIMIENTOS } from "@/lib/inventario/acceso";
import { crearCompuerta } from "@/lib/productos/catalogos-carga";
import { enlaceNuevoMovimiento } from "@/lib/movimientos/formulario";
import { calcularPlanReposicion, compararUrgencia, transferenciasPlanificadas, type Criticidad, type FilaReposicion } from "@/lib/reposicion/calculo";
import { cantidadSimulada, cargarReposicion, incluirTransitoEfectivo, type DatosReposicion } from "@/lib/reposicion/carga";

const PAGE_SIZE = 25;

type CampoOrden = "producto" | "deposito" | "disponible" | "criticidad" | "sugerida";

const ETIQUETA: Record<Criticidad, string> = {
  SIN_GATILLO: "Cantidad sin gatillo",
  SIN_STOCK: "Sin stock",
  BAJO_MINIMO: "Bajo mínimo",
  EN_PUNTO: "En punto de reposición",
  OK: "Normal",
  SIN_PARAMETROS: "Sin parámetros",
};

const CLASE: Record<Criticidad, string> = {
  SIN_GATILLO: ui.statusInactive,
  SIN_STOCK: ui.statusBlocked,
  BAJO_MINIMO: ui.statusBlocked,
  EN_PUNTO: ui.statusInactive,
  OK: ui.statusActive,
  SIN_PARAMETROS: ui.muted,
};

const PESO: Record<Criticidad, number> = { SIN_STOCK: 0, BAJO_MINIMO: 1, EN_PUNTO: 2, OK: 3, SIN_GATILLO: 4, SIN_PARAMETROS: 5 };

const cant = (n: number | null) => (n === null ? "—" : formatearCantidad(n));

export default function ReposicionPage() {
  const [datos, setDatos] = useState<DatosReposicion | null>(null);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [deposito, setDeposito] = useState("TODOS");
  const [marca, setMarca] = useState("TODAS");
  const [criticidad, setCriticidad] = useState<"TODAS" | "NECESITAN" | Criticidad>("NECESITAN");
  // Simulación LOCAL (INV-06/INV-08): no se guarda, no reserva y no ejecuta nada; al salir o recargar se pierde.
  const [simulando, setSimulando] = useState(false);
  const [hipotesisTransito, setHipotesisTransito] = useState(false);
  const [plan, setPlan] = useState<Record<string, string>>({});
  const [abierta, setAbierta] = useState<string | null>(null);
  const [orden, setOrden] = useState<Orden<CampoOrden>>(null);
  const [paginacion, setPaginacion] = useState({ clave: "", pagina: 1 });

  // INV-R02-03: la última solicitud iniciada gana (una respuesta lenta anterior no pisa a la nueva) y «Reintentar» recarga sin tocar la simulación local en curso.
  const compuerta = useRef(crearCompuerta());
  const cargar = useCallback(async () => {
    const sol = compuerta.current.nueva();
    const r = await cargarReposicion((url) => fetch(url, { cache: "no-store" }));

    if (!compuerta.current.vigente(sol)) return;
    // Sin datos confiables se descartan la lista y los permisos anteriores.
    setDatos(r.datos);
    setError(r.error);
  }, []);

  useEffect(() => {
    const actual = compuerta.current;

    void cargar();

    return () => {
      actual.nueva();
    };
  }, [cargar]);

  const permisos = datos?.permisos ?? SIN_PERMISOS_MOVIMIENTOS;
  const incluirTransito = incluirTransitoEfectivo(simulando, hipotesisTransito);
  const filas = useMemo<FilaReposicion[]>(() => calcularPlanReposicion(datos?.entradas ?? [], { incluirTransito }).sort(compararUrgencia), [datos, incluirTransito]);
  const marcas = useMemo(() => [...new Set(filas.map((f) => f.marca).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [filas]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();

    return filas.filter((f) => {
      if (deposito !== "TODOS" && f.depositoId !== deposito) return false;
      if (marca !== "TODAS" && f.marca !== marca) return false;
      if (criticidad === "NECESITAN" ? !f.necesita : criticidad !== "TODAS" && f.criticidad !== criticidad) return false;

      return !q || f.productoCodigo.toLowerCase().includes(q) || f.productoDescripcion.toLowerCase().includes(q) || f.marca.toLowerCase().includes(q);
    });
  }, [filas, busqueda, deposito, marca, criticidad]);

  const ordenados = useMemo(
    () =>
      ordenarLista(visibles, orden, (campo, a, b) => {
        switch (campo) {
          case "producto":
            return compararTexto(a.productoDescripcion, b.productoDescripcion);
          case "deposito":
            return compararTexto(a.depositoNombre, b.depositoNombre);
          case "disponible":
            return a.saldo.disponible - b.saldo.disponible;
          case "criticidad":
            return PESO[a.criticidad] - PESO[b.criticidad];
          case "sugerida":
            return (a.sugerida ?? 0) - (b.sugerida ?? 0);
        }
      }),
    [visibles, orden],
  );

  const resumen = useMemo(
    () => ({
      necesitan: filas.filter((f) => f.necesita).length,
      // Solo renglones que son plan: el consolidado de referencia no se cuenta (coherente con «Necesitan reposición»).
      sinStock: filas.filter((f) => f.necesita && f.criticidad === "SIN_STOCK").length,
      bajoMinimo: filas.filter((f) => f.necesita && f.criticidad === "BAJO_MINIMO").length,
      conTransferencia: filas.filter((f) => f.sugeridaTransferencia > 0).length,
      sinMeta: filas.filter((f) => f.necesita && f.sugerida === null).length,
    }),
    [filas],
  );

  // Filtro inicial «Necesitan reposición» sin otros filtros y sin coincidencias: se explica en vez de mostrar una tabla vacía sin contexto.
  const sinFiltrosExtra = filas.length > 0 && criticidad === "NECESITAN" && !busqueda && deposito === "TODOS" && marca === "TODAS";
  const totalPaginas = Math.max(1, Math.ceil(visibles.length / PAGE_SIZE));
  const claveFiltros = JSON.stringify([busqueda, deposito, marca, criticidad, incluirTransito, orden]);
  const pagina = paginacion.clave === claveFiltros ? Math.min(paginacion.pagina, totalPaginas) : 1;
  const setPagina = (v: number | ((a: number) => number)) => setPaginacion({ clave: claveFiltros, pagina: typeof v === "function" ? v(pagina) : v });
  const paginaActual = useMemo(() => ordenados.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE), [ordenados, pagina]);

  const planEscrita = (f: FilaReposicion): number | null => cantidadSimulada(plan, f.clave, simulando);

  function alternarSimulacion() {
    // Al salir de la simulación se descartan las cantidades y la hipótesis de tránsito: nada queda como si fuera un plan.
    if (simulando) {
      setPlan({});
      setHipotesisTransito(false);
    }
    setSimulando(!simulando);
  }

  return (
    <section className={ui.page}>
      <header className={ui.topbar}>
        <div className={ui.titleBlock}>
          <nav className={ui.breadcrumb} aria-label="Ruta de navegación">
            <span>Inventario</span>
            <i aria-hidden="true">/</i>
            <Link href="/stock">Stock</Link>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Reposición</span>
          </nav>
          <h1>Reposición</h1>
        </div>

        <div className={ui.actionsGroup}>
          <Link href="/stock" className={ui.secondaryButton}>
            ← Stock
          </Link>
          {puedeVerMovimientos(permisos) ? (
            <Link href="/movimientos" className={ui.secondaryButton}>
              Movimientos
            </Link>
          ) : null}
          <button type="button" className={ui.secondaryButton} aria-pressed={simulando} onClick={alternarSimulacion}>
            {simulando ? "Salir de la simulación" : "Simular"}
          </button>
        </div>
      </header>

      <p className={ui.resultCount} role="status" style={{ margin: "0 0 8px" }}>
        Planificación: recomienda qué reponer según los parámetros de cada producto (se editan en Productos › Inventario). <strong>Preparar transferencia</strong> solo abre Nuevo movimiento con esos datos y no registra nada hasta que usted lo confirme allí. Esta pantalla no registra compras, transferencias ni movimientos.
        {datos?.alcanceParcial ? " Solo se consideran los depósitos que usted tiene autorizados." : ""}
      </p>

      {simulando ? (
        <div className={ui.alertError} role="status">
          <strong>Simulación local.</strong> Las cantidades que escriba en cada renglón y la hipótesis de tránsito son pruebas en esta pantalla: no se guardan, no reservan stock y no generan compras ni movimientos. Se pierden al salir de la simulación o recargar.{" "}
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={hipotesisTransito} onChange={(e) => setHipotesisTransito(e.target.checked)} />
            Hipótesis: contar el tránsito como ingreso (no está confirmado en ningún depósito)
          </label>
        </div>
      ) : null}

      {error ? (
        <div className={ui.alertError} role="alert">
          {error}
          <button type="button" className={ui.clearButton} onClick={() => void cargar()}>
            Reintentar
          </button>
        </div>
      ) : null}

      <section className={ui.summaryGrid} aria-label="Resumen de reposición">
        <article className={[ui.summaryCard, ui.summaryAmber].join(" ")}>
          <span>Necesitan reposición</span>
          <strong>{resumen.necesitan}</strong>
          <small>Producto × depósito (o consolidado)</small>
        </article>
        <article className={[ui.summaryCard, ui.summaryRed].join(" ")}>
          <span>Sin stock</span>
          <strong>{resumen.sinStock}</strong>
          <small>Disponible cero con parámetros</small>
        </article>
        <article className={[ui.summaryCard, ui.summaryAmber].join(" ")}>
          <span>Bajo mínimo</span>
          <strong>{resumen.bajoMinimo}</strong>
          <small>Disponible menor que el mínimo</small>
        </article>
        <article className={[ui.summaryCard, ui.summaryBlue].join(" ")}>
          <span>Con transferencia posible</span>
          <strong>{resumen.conTransferencia}</strong>
          <small>Otro depósito tiene excedente</small>
        </article>
      </section>
      <p className={ui.resultCount} style={{ margin: "6px 0 8px" }}>
        Los indicadores cuentan todos los renglones calculados con sus depósitos autorizados; los filtros solo afectan la tabla.
        {resumen.sinMeta > 0 ? ` ${resumen.sinMeta} renglón(es) necesitan reposición pero no tienen meta definida (falta máximo o cantidad de reposición).` : ""}
      </p>

      <section className={ui.contentCard}>
        <div className={[ui.toolbar, ui.toolbarDensa].join(" ")}>
          <label className={ui.search}>
            <span aria-hidden="true">⌕</span>
            <input placeholder="Buscar por código, producto o marca" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar en la reposición" />
          </label>

          <label className={ui.filterField}>
            <span>Depósito</span>
            <select value={deposito} onChange={(e) => setDeposito(e.target.value)}>
              <option value="TODOS">Todos</option>
              {(datos?.depositos ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className={ui.filterField}>
            <span>Marca</span>
            <select value={marca} onChange={(e) => setMarca(e.target.value)}>
              <option value="TODAS">Todas</option>
              {marcas.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label className={ui.filterField}>
            <span>Situación</span>
            <select value={criticidad} onChange={(e) => setCriticidad(e.target.value as typeof criticidad)}>
              <option value="NECESITAN">Necesitan reposición</option>
              <option value="TODAS">Todas</option>
              <option value="SIN_STOCK">Sin stock</option>
              <option value="BAJO_MINIMO">Bajo mínimo</option>
              <option value="EN_PUNTO">En punto de reposición</option>
              <option value="OK">Normal</option>
              <option value="SIN_GATILLO">Cantidad sin gatillo</option>
              <option value="SIN_PARAMETROS">Sin parámetros</option>
            </select>
          </label>

          <button
            type="button"
            className={ui.clearButton}
            onClick={() => {
              setBusqueda("");
              setDeposito("TODOS");
              setMarca("TODAS");
              setCriticidad("NECESITAN");
            }}
          >
            Limpiar filtros
          </button>

          <div className={ui.toolbarEnd}>
            <details className={ui.ayuda}>
              <summary aria-label="Ayuda: Stock y Reposición" title="Ayuda: Stock y Reposición">
                ?
              </summary>
              <div className={ui.ayudaPanel} role="note">
                <strong>Stock «Bajo mínimo» ≠ Reposición</strong>
                <p>Stock marca «Bajo mínimo» cuando el disponible es menor que el mínimo. Reposición también pide abastecer en el <em>punto de reposición</em>: un producto puede estar «Normal» en Stock y «En punto de reposición» aquí.</p>
                <strong>R / C / T</strong>
                <p>R = reservado · C = cuarentena · T = en tránsito (se ven en el detalle de cada renglón).</p>
              </div>
            </details>
            <span className={ui.resultCount} aria-live="polite">
              {visibles.length} de {filas.length}
            </span>
          </div>
        </div>

        {criticidad === "NECESITAN" && filas.length > visibles.length && !busqueda && deposito === "TODOS" && marca === "TODAS" ? (
          <p className={ui.resultCount} role="status" style={{ margin: "0 0 8px" }}>
            El filtro «Necesitan reposición» oculta {filas.length - visibles.length} renglón(es) que no necesitan reposición, son de referencia o no tienen parámetros.{" "}
            <button type="button" className={ui.clearButton} onClick={() => setCriticidad("TODAS")}>
              Ver todos
            </button>
          </p>
        ) : null}

        <div className={ui.tableScroll}>
          <table className={ui.table}>
            <thead>
              <tr>
                <ThOrdenable titulo="Producto" campo="producto" orden={orden} onOrden={(c) => setOrden((a) => siguienteOrden(a, c))} />
                <ThOrdenable titulo="Depósito" campo="deposito" orden={orden} onOrden={(c) => setOrden((a) => siguienteOrden(a, c))} />
                <ThOrdenable titulo="Disponible" campo="disponible" orden={orden} onOrden={(c) => setOrden((a) => siguienteOrden(a, c))} alinear="derecha" className={ui.colNumero} />
                <ThOrdenable titulo="Necesidad / meta" campo="sugerida" orden={orden} onOrden={(c) => setOrden((a) => siguienteOrden(a, c))} alinear="derecha" className={ui.colNumero} />
                <ThOrdenable titulo="Recomendación / acción" />
              </tr>
            </thead>
            <tbody>
              {!datos && !error ? (
                <tr>
                  <td colSpan={5} className={ui.emptyCell}>
                    <div className={ui.empty}>
                      <strong>Cargando...</strong>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className={ui.emptyCell}>
                    <div className={ui.empty}>
                      <strong>No se pudieron cargar los datos de reposición</strong>
                    </div>
                  </td>
                </tr>
              ) : visibles.length === 0 ? (
                <tr>
                  <td colSpan={5} className={ui.emptyCell}>
                    <div className={ui.empty}>
                      <strong>{filas.length === 0 ? "Ningún producto tiene stock mínimo, punto de reposición o máximo configurado" : sinFiltrosExtra ? "Ningún producto necesita reposición" : "Ningún registro coincide con los filtros"}</strong>
                      {filas.length === 0 ? <span>Configure los parámetros en la ficha del producto (Productos › Inventario, por producto o por depósito) para obtener sugerencias.</span> : null}
                      {sinFiltrosExtra ? (
                        <>
                          <span>Con los parámetros configurados y el stock disponible actual, ningún producto está en el punto de reposición ni bajo el mínimo (por ejemplo, un producto con sobrestock no necesita reposición).</span>
                          <button type="button" className={ui.emptyAction} onClick={() => setCriticidad("TODAS")}>
                            Ver todos los renglones ({filas.length})
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : (
                paginaActual.map((f) => {
                  const escrita = planEscrita(f);
                  const expandida = abierta === f.clave;

                  return (
                    <Fragment key={f.clave}>
                      <tr className={ui.row}>
                        <td>
                          <Link href={`/stock/${f.productoId}`} className={ui.clientName}>
                            {f.productoDescripcion}
                          </Link>
                          <br />
                          <small className={ui.muted}>
                            {f.productoCodigo}
                            {f.marca ? ` · ${f.marca}` : ""} · {f.unidad}
                          </small>
                        </td>
                        <td>
                          {f.depositoNombre}
                          <br />
                          <small className={ui.muted}>{f.ambito === "CONSOLIDADO" ? (f.soloReferencia ? "Referencia (no se suma al plan por depósito)" : "Parámetros del producto") : "Parámetros del depósito"}</small>
                        </td>
                        <td className={ui.numeric}>
                          <span className={ui.mono}>{cant(f.saldo.disponible)}</span>
                          <br />
                          <span className={CLASE[f.criticidad]}>{ETIQUETA[f.criticidad]}</span>
                        </td>
                        <td className={ui.numeric}>
                          <span className={ui.mono}>{f.necesita ? cant(f.sugerida) : "—"}</span>
                          {f.necesita && f.parametros.maximo ? <small className={ui.muted} style={{ display: "block" }}>meta {cant(f.parametros.maximo)}</small> : null}
                        </td>
                        <td>
                          {f.necesita && f.sugerida ? (
                            <>
                              {f.transferencias.map((t) => {
                                // La cantidad preparada respeta la simulación local sin superar nunca lo confirmado por el plan global.
                                const preparada = transferenciasPlanificadas(f, escrita).find((x) => x.depositoId === t.depositoId)?.cantidad ?? 0;
                                const movible = f.modoControl !== "UNIDAD_ETIQUETADA";

                                return (
                                  <small key={t.depositoId} style={{ display: "block" }}>
                                    Transferir {cant(t.cantidad)} desde {t.depositoNombre}
                                    {puedeAbrirNuevoMovimiento(permisos) && f.ambito === "DEPOSITO" && f.depositoId && movible && preparada > 0 ? (
                                      <>
                                        {" · "}
                                        <Link href={enlaceNuevoMovimiento({ productoId: f.productoId, tipo: "TRANSFERENCIA", depositoOrigenId: t.depositoId, depositoDestinoId: f.depositoId, cantidad: preparada })} title="Abre Nuevo movimiento con estos datos precargados; no registra nada hasta que usted confirme allí.">
                                          Preparar transferencia{preparada !== t.cantidad ? ` de ${cant(preparada)} (simulada)` : ""}
                                        </Link>
                                      </>
                                    ) : null}
                                  </small>
                                );
                              })}
                              {f.modoControl === "UNIDAD_ETIQUETADA" && f.transferencias.length > 0 ? (
                                <small className={ui.muted} style={{ display: "block" }}>
                                  Unidad identificada (serie/etiqueta): aún no se puede transferir desde Movimientos; la sugerencia es solo de planificación.
                                </small>
                              ) : null}
                              {f.sugeridaCompra ? (
                                <small style={{ display: "block" }}>
                                  Comprar {cant(f.sugeridaCompra)} (indicativo: esta pantalla no genera compras)
                                  {f.proveedorPrincipal ? ` · proveedor principal: ${f.proveedorPrincipal.nombre}` : " · sin proveedor principal"}
                                </small>
                              ) : null}
                            </>
                          ) : (
                            <small className={ui.muted}>{f.necesita ? "Defina la meta en Productos › Inventario" : "—"}</small>
                          )}
                          <div>
                            <button type="button" className={ui.rowButton} aria-expanded={expandida} onClick={() => setAbierta(expandida ? null : f.clave)}>
                              {expandida ? "Ocultar detalle" : "Detalle"}
                            </button>{" "}
                            <Link href={`/stock/${f.productoId}`} className={ui.rowButton}>
                              Ver stock
                            </Link>
                          </div>
                        </td>
                      </tr>
                      {expandida ? (
                        <tr className={ui.row}>
                          <td colSpan={5}>
                            <div style={{ display: "grid", gap: 4, padding: "6px 4px" }}>
                              <small>
                                <strong>Saldo propio:</strong> reservado {cant(f.saldo.reservado)} · cuarentena {cant(f.saldo.cuarentena)} · en tránsito {cant(f.saldo.transito)} (el tránsito no cuenta como ingreso)
                              </small>
                              <small>
                                <strong>Parámetros (Mín. / Punto / Máx.):</strong> {cant(f.parametros.minimo)} / {cant(f.parametros.punto)} / {cant(f.parametros.maximo)}
                                {f.parametros.cantidadReposicion ? ` · cantidad de reposición ${cant(f.parametros.cantidadReposicion)}` : ""}
                              </small>
                              {f.advertencias.map((a) => (
                                <small key={a} className={ui.muted}>
                                  {a}
                                </small>
                              ))}
                              {f.aValidarManualmente.map((v) => (
                                <small key={v.depositoId} className={ui.muted}>
                                  A validar manualmente: {v.depositoNombre} tiene {cant(v.disponible)} disponible(s) pero no tiene parámetros; no se incluye en la sugerencia.
                                </small>
                              ))}
                              {f.proveedorPrincipal ? (
                                <small>
                                  <strong>Proveedor principal:</strong> {f.proveedorPrincipal.nombre}
                                  {f.proveedorPrincipal.plazoDias != null ? ` · plazo ${f.proveedorPrincipal.plazoDias} d` : ""}
                                  {f.proveedorPrincipal.cantidadMinimaCompra ? ` · mínimo de compra ${cant(f.proveedorPrincipal.cantidadMinimaCompra)} (no aplicado)` : ""}
                                </small>
                              ) : null}
                              {simulando && f.necesita ? (
                                <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                                  <small>
                                    <strong>Simular cantidad</strong> (local, no se guarda):
                                  </small>
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    aria-label={`Simular cantidad de ${f.productoDescripcion} en ${f.depositoNombre}`}
                                    style={{ width: 90, textAlign: "right" }}
                                    value={plan[f.clave] ?? ""}
                                    placeholder={f.sugerida === null ? "" : String(f.sugerida)}
                                    onChange={(e) => setPlan((a) => ({ ...a, [f.clave]: e.target.value }))}
                                  />
                                  {escrita !== null && f.sugerida !== null ? (
                                    <small className={ui.muted}>
                                      Simulado {cant(escrita)}: transferir {cant(transferenciasPlanificadas(f, escrita).reduce((a, t) => a + t.cantidad, 0))} · comprar{" "}
                                      {cant(Math.max(0, Math.round((escrita - transferenciasPlanificadas(f, escrita).reduce((a, t) => a + t.cantidad, 0)) * 10000) / 10000))}
                                      {escrita > f.sugerida ? " (por encima de la sugerida)" : ""}
                                    </small>
                                  ) : null}
                                </label>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <footer className={ui.pagination}>
          <span>
            Mostrando {visibles.length === 0 ? 0 : (pagina - 1) * PAGE_SIZE + 1}–{Math.min(pagina * PAGE_SIZE, visibles.length)} de {visibles.length}
          </span>
          <div>
            <button type="button" aria-label="Página anterior" disabled={pagina === 1} onClick={() => setPagina((a) => a - 1)}>
              ‹
            </button>
            <strong>
              {pagina} / {totalPaginas}
            </strong>
            <button type="button" aria-label="Página siguiente" disabled={pagina === totalPaginas} onClick={() => setPagina((a) => a + 1)}>
              ›
            </button>
          </div>
        </footer>
      </section>

      <details className={ui.contentCard} style={{ marginTop: 12, padding: "12px 16px" }}>
        <summary>Cómo se calcula y otras alternativas de reposición</summary>
        <ul style={{ margin: "8px 0 0 18px", lineHeight: 1.6 }}>
          <li>Se usa el stock <strong>propio disponible</strong>: lo reservado no se resta otra vez, la cuarentena no es vendible y el tránsito sin confirmar no se cuenta (solo como hipótesis dentro de «Simular»).</li>
          <li>Necesita reposición si el disponible es 0, menor que el mínimo o igual o menor que el punto de reposición. La cantidad sugerida completa hasta el máximo (o usa la cantidad de reposición del depósito); sin ninguno de los dos no se inventa una meta.</li>
          <li>Los parámetros por depósito se comparan con ese depósito; los del producto, con el total de los depósitos autorizados.</li>
          <li><strong>Transferencia</strong> desde otro depósito con parámetros y excedente (su disponible por encima de su propio punto/mínimo) se propone antes que la compra (si varios depósitos comparten el mismo origen, su excedente se reparte una sola vez por prioridad: criticidad, mayor cantidad, nombre); un depósito sin parámetros solo aparece como «a validar manualmente» y no reduce la compra. <strong>Compra</strong> al proveedor principal por el saldo restante (solo indicativa).</li>
          <li>Si el producto tiene parámetros por depósito, el total consolidado queda como referencia y no se suma: hay un único plan por producto. Una «cantidad de reposición» sin mínimo, punto ni máximo no define cuándo reponer y se señala como tal.</li>
          <li><strong>Devolución de cliente</strong> y <strong>ajuste de inventario</strong> son entradas que se registran en Movimientos, con la autorización correspondiente; no se calculan aquí ni se generan automáticamente.</li>
        </ul>
      </details>
    </section>
  );
}
