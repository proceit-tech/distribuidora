"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { compararTexto, ordenarLista, siguienteOrden, type Orden } from "@/components/ui/lista-padrao/orden";
import { ThOrdenable } from "@/components/ui/lista-padrao/th-ordenable";
import ui from "@/components/ui/lista-padrao/lista.module.css";
import { formatearCantidad } from "@/lib/formato/listas";
import { enlaceNuevoMovimiento } from "@/lib/movimientos/formulario";
import { calcularPlanReposicion, compararUrgencia, type Criticidad, type EntradaReposicion, type FilaReposicion } from "@/lib/reposicion/calculo";

const PAGE_SIZE = 25;

type CampoOrden = "producto" | "deposito" | "disponible" | "criticidad" | "sugerida";
type Respuesta = { entradas: EntradaReposicion[]; depositos: Array<{ id: string; nombre: string }>; alcanceParcial: boolean; permisos?: { movimientos: boolean } };

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
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [deposito, setDeposito] = useState("TODOS");
  const [marca, setMarca] = useState("TODAS");
  const [criticidad, setCriticidad] = useState<"TODAS" | "NECESITAN" | Criticidad>("NECESITAN");
  const [incluirTransito, setIncluirTransito] = useState(false);
  const [plan, setPlan] = useState<Record<string, string>>({});
  const [orden, setOrden] = useState<Orden<CampoOrden>>(null);
  const [paginacion, setPaginacion] = useState({ clave: "", pagina: 1 });

  useEffect(() => {
    let activo = true;

    fetch("/api/reposicion", { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as Respuesta & { error?: string };

        if (!r.ok) throw new Error(j.error ?? "No fue posible cargar los datos de reposición.");
        if (activo) setDatos(j);
      })
      .catch((e: unknown) => {
        if (activo) setError(e instanceof Error ? e.message : "No fue posible cargar los datos de reposición.");
      });

    return () => {
      activo = false;
    };
  }, []);

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
      sinParametros: filas.filter((f) => f.criticidad === "SIN_PARAMETROS").length,
    }),
    [filas],
  );

  const totalPaginas = Math.max(1, Math.ceil(visibles.length / PAGE_SIZE));
  const claveFiltros = JSON.stringify([busqueda, deposito, marca, criticidad, incluirTransito, orden]);
  const pagina = paginacion.clave === claveFiltros ? Math.min(paginacion.pagina, totalPaginas) : 1;
  const setPagina = (v: number | ((a: number) => number)) => setPaginacion({ clave: claveFiltros, pagina: typeof v === "function" ? v(pagina) : v });
  const paginaActual = useMemo(() => ordenados.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE), [ordenados, pagina]);

  const cantidadPlanificada = (f: FilaReposicion) => {
    const escrito = plan[f.clave];

    if (escrito === undefined || escrito === "") return f.sugerida;

    const n = Number(escrito);

    return Number.isFinite(n) && n >= 0 ? n : f.sugerida;
  };

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
          <Link href="/movimientos" className={ui.secondaryButton}>
            Movimientos
          </Link>
        </div>
      </header>

      <p className={ui.resultCount} role="status" style={{ margin: "0 0 8px" }}>
        Planificación: las cantidades son sugerencias calculadas con el stock propio disponible; esta pantalla no registra compras, transferencias ni movimientos.
        {datos?.alcanceParcial ? " Solo se consideran los depósitos que usted tiene autorizados." : ""}
      </p>

      {error ? (
        <div className={ui.alertError} role="alert">
          {error}
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
        <article className={[ui.summaryCard, ui.summaryViolet].join(" ")}>
          <span>Sin meta definida</span>
          <strong>{resumen.sinMeta}</strong>
          <small>Falta máximo o cantidad de reposición</small>
        </article>
      </section>
      <p className={ui.resultCount} style={{ margin: "6px 0 8px" }}>
        Los indicadores cuentan todos los renglones calculados con sus depósitos autorizados; los filtros de abajo solo afectan la tabla.
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

          <label className={ui.filterField}>
            <span>Tránsito</span>
            <select value={incluirTransito ? "1" : "0"} onChange={(e) => setIncluirTransito(e.target.value === "1")}>
              <option value="0">No considerar (sin confirmar)</option>
              <option value="1">Considerar como ingreso</option>
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
              setIncluirTransito(false);
            }}
          >
            Limpiar filtros
          </button>

          <span className={ui.resultCount} aria-live="polite">
            {visibles.length} de {filas.length}
          </span>
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
          <table className={ui.table} style={{ minWidth: 1180 }}>
            <thead>
              <tr>
                <ThOrdenable titulo="Producto" campo="producto" orden={orden} onOrden={(c) => setOrden((a) => siguienteOrden(a, c))} />
                <ThOrdenable titulo="Depósito" campo="deposito" orden={orden} onOrden={(c) => setOrden((a) => siguienteOrden(a, c))} />
                <ThOrdenable titulo="Disponible" campo="disponible" orden={orden} onOrden={(c) => setOrden((a) => siguienteOrden(a, c))} alinear="derecha" className={ui.colNumero} />
                <ThOrdenable titulo="R / C / T" alinear="derecha" />
                <ThOrdenable titulo="Mín. / Punto / Máx." alinear="derecha" />
                <ThOrdenable titulo="Situación" campo="criticidad" orden={orden} onOrden={(c) => setOrden((a) => siguienteOrden(a, c))} />
                <ThOrdenable titulo="Sugerida" campo="sugerida" orden={orden} onOrden={(c) => setOrden((a) => siguienteOrden(a, c))} alinear="derecha" className={ui.colNumero} />
                <ThOrdenable titulo="Alternativas (sugerencia)" />
                <ThOrdenable titulo="A planificar (simulación local, no se guarda)" alinear="derecha" />
                <ThOrdenable titulo="Acciones" alinear="derecha" />
              </tr>
            </thead>
            <tbody>
              {!datos && !error ? (
                <tr>
                  <td colSpan={10} className={ui.emptyCell}>
                    <div className={ui.empty}>
                      <strong>Cargando...</strong>
                    </div>
                  </td>
                </tr>
              ) : visibles.length === 0 ? (
                <tr>
                  <td colSpan={10} className={ui.emptyCell}>
                    <div className={ui.empty}>
                      <strong>{filas.length === 0 ? "Ningún producto tiene stock mínimo, punto de reposición o máximo configurado" : "Ningún registro coincide con los filtros"}</strong>
                      {filas.length === 0 ? <span>Configure los parámetros en la ficha del producto (por producto o por depósito) para obtener sugerencias.</span> : null}
                    </div>
                  </td>
                </tr>
              ) : (
                paginaActual.map((f) => (
                  <tr key={f.clave} className={ui.row}>
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
                    </td>
                    <td className={ui.numeric}>
                      <span className={ui.mono}>
                        {cant(f.saldo.reservado)} / {cant(f.saldo.cuarentena)} / {cant(f.saldo.transito)}
                      </span>
                    </td>
                    <td className={ui.numeric}>
                      <span className={ui.mono}>
                        {cant(f.parametros.minimo)} / {cant(f.parametros.punto)} / {cant(f.parametros.maximo)}
                      </span>
                    </td>
                    <td>
                      <span className={CLASE[f.criticidad]}>{ETIQUETA[f.criticidad]}</span>
                      {f.advertencias.map((a) => (
                        <small key={a} className={ui.muted} style={{ display: "block" }}>
                          {a}
                        </small>
                      ))}
                    </td>
                    <td className={ui.numeric}>
                      <span className={ui.mono}>{f.necesita ? cant(f.sugerida) : "—"}</span>
                    </td>
                    <td>
                      {f.necesita && f.sugerida ? (
                        <>
                          {f.transferencias.map((t) => (
                            <small key={t.depositoId} style={{ display: "block" }}>
                              Transferir {cant(t.cantidad)} desde {t.depositoNombre}
                              {datos?.permisos?.movimientos && f.ambito === "DEPOSITO" && f.depositoId ? (
                                <>
                                  {" · "}
                                  <Link href={enlaceNuevoMovimiento({ productoId: f.productoId, tipo: "TRANSFERENCIA", depositoOrigenId: t.depositoId, depositoDestinoId: f.depositoId, cantidad: t.cantidad })} title="Abre Nuevo movimiento con estos datos precargados; no registra nada hasta que usted confirme allí.">
                                    Preparar transferencia
                                  </Link>
                                </>
                              ) : null}
                            </small>
                          ))}
                          {f.sugeridaCompra ? (
                            <small style={{ display: "block" }}>
                              Comprar {cant(f.sugeridaCompra)}
                              {f.proveedorPrincipal ? ` a ${f.proveedorPrincipal.nombre}` : " (sin proveedor principal)"}
                              {f.proveedorPrincipal?.plazoDias != null ? ` · plazo ${f.proveedorPrincipal.plazoDias} d` : ""}
                              {f.proveedorPrincipal?.cantidadMinimaCompra ? ` · mínimo de compra ${cant(f.proveedorPrincipal.cantidadMinimaCompra)} (no aplicado)` : ""}
                            </small>
                          ) : null}
                        </>
                      ) : (
                        <small className={ui.muted}>{f.necesita ? "Defina la meta" : "—"}</small>
                      )}
                      {f.aValidarManualmente.map((v) => (
                        <small key={v.depositoId} className={ui.muted} style={{ display: "block" }}>
                          A validar manualmente: {v.depositoNombre} tiene {cant(v.disponible)} disponible(s) pero no tiene parámetros; no se incluye en la sugerencia.
                        </small>
                      ))}
                    </td>
                    <td className={ui.numeric}>
                      {f.necesita ? (
                        <input
                          type="number"
                          min="0"
                          step="any"
                          aria-label={`Cantidad a planificar de ${f.productoDescripcion} en ${f.depositoNombre}`}
                          style={{ width: 90, textAlign: "right" }}
                          value={plan[f.clave] ?? ""}
                          placeholder={f.sugerida === null ? "" : String(f.sugerida)}
                          onChange={(e) => setPlan((a) => ({ ...a, [f.clave]: e.target.value }))}
                          title={cantidadPlanificada(f) === null ? "Sin cantidad" : `Planificado: ${cantidadPlanificada(f)} (simulación; no se guarda)`}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={ui.actionsCell}>
                      <div className={ui.actionsGroup}>
                        <Link href={`/stock/${f.productoId}`} className={ui.rowButton}>
                          Ver stock
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
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
          <li>Se usa el stock <strong>propio disponible</strong>: lo reservado no se resta otra vez, la cuarentena no es vendible y el tránsito sin confirmar no se cuenta salvo que lo active en el filtro.</li>
          <li>Necesita reposición si el disponible es 0, menor que el mínimo o igual o menor que el punto de reposición. La cantidad sugerida completa hasta el máximo (o usa la cantidad de reposición del depósito); sin ninguno de los dos no se inventa una meta.</li>
          <li>Los parámetros por depósito se comparan con ese depósito; los del producto, con el total de los depósitos autorizados.</li>
          <li><strong>Transferencia</strong> desde otro depósito con parámetros y excedente (su disponible por encima de su propio punto/mínimo) se propone antes que la compra (si varios depósitos comparten el mismo origen, su excedente se reparte una sola vez por prioridad: criticidad, mayor cantidad, nombre); un depósito sin parámetros solo aparece como «a validar manualmente» y no reduce la compra. <strong>Compra</strong> al proveedor principal por el saldo restante.</li>
          <li>Si el producto tiene parámetros por depósito, el total consolidado queda como referencia y no se suma: hay un único plan por producto. Una «cantidad de reposición» sin mínimo, punto ni máximo no define cuándo reponer y se señala como tal.</li>
          <li><strong>Devolución de cliente</strong> y <strong>ajuste de inventario</strong> son entradas que se registran en Movimientos, con la autorización correspondiente; no se calculan aquí ni se generan automáticamente.</li>
        </ul>
      </details>
    </section>
  );
}
