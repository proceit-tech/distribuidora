"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { crearCompuerta } from "@/lib/productos/catalogos-carga";
import { descargarStockGeneral, pedirStockGeneral } from "@/lib/reportes/cliente-stock-general";
import { fmtCantidadTexto, fmtNum, TEXTO_PROPIEDAD, textoTercerosEstadosTexto } from "@/lib/reportes/formato";
import { filtrosStockGeneralIguales, respuestaStockGeneralVigente } from "@/lib/reportes/stock-general-plan";
import type { NivelStock, StockGeneralFiltros, StockGeneralFila, StockGeneralRespuestaApi } from "@/types/reportes";

import styles from "@/components/ui/lista-padrao/reporte.module.css";

const NIVEL: Record<NivelStock, string> = { SIN_STOCK: "Sin stock", BAJO: "Bajo", NORMAL: "Normal", SOBRESTOCK: "Sobrestock" };
const FILTROS_VACIOS: StockGeneralFiltros = {
  vista: "PRODUCTO", q: "", depositoId: "", categoriaId: "", marcaId: "", familiaId: "", situacion: "", lote: "", existencia: "TODOS",
};

const num = fmtNum;

type Cant = "disponible" | "reservado" | "cuarentena" | "transito" | "fisico" | "virtual";
const CANTIDADES: [string, Cant][] = [
  ["Disponible", "disponible"], ["Reservado", "reservado"], ["Cuarentena", "cuarentena"], ["En tránsito", "transito"], ["Físico", "fisico"], ["Virtual", "virtual"],
];

type Catalogos = StockGeneralRespuestaApi["catalogos"];

export default function ReporteStockGeneralPage() {
  const [filtros, setFiltros] = useState<StockGeneralFiltros>(FILTROS_VACIOS);
  const [qAplicada, setQAplicada] = useState({ q: "", lote: "" });
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<StockGeneralRespuestaApi | null>(null);
  // Solo los nombres de los selectores sobreviven a un error (conservan los filtros elegidos); ningún dato del informe se conserva.
  const [catalogos, setCatalogos] = useState<Catalogos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [errorExportacion, setErrorExportacion] = useState("");
  const [exportando, setExportando] = useState("");
  const compuerta = useRef(crearCompuerta());

  // Los campos de texto se aplican con una pequeña espera; los selectores, de inmediato.
  useEffect(() => {
    const t = setTimeout(() => setQAplicada({ q: filtros.q, lote: filtros.lote }), 300);

    return () => clearTimeout(t);
  }, [filtros.q, filtros.lote]);

  const aplicados = useMemo(() => ({ ...filtros, q: qAplicada.q, lote: qAplicada.lote }), [filtros, qAplicada]);

  // La última solicitud iniciada gana; ante cualquier falla se descartan los datos anteriores y se conservan los filtros.
  const cargar = useCallback(async () => {
    const sol = compuerta.current.nueva();

    setCargando(true);
    setError("");

    const r = await pedirStockGeneral(aplicados, pagina);

    if (!compuerta.current.vigente(sol)) return;
    setDatos(r.datos);
    if (r.datos) setCatalogos(r.datos.catalogos);
    setError(r.error);
    setCargando(false);
  }, [aplicados, pagina]);

  useEffect(() => {
    const actual = compuerta.current;
    const t = setTimeout(() => void cargar(), 0);

    return () => {
      clearTimeout(t);
      actual.nueva();
    };
  }, [cargar]);

  const cambiar = (parcial: Partial<StockGeneralFiltros>) => {
    setPagina(1);
    setFiltros((f) => ({ ...f, ...parcial }));
  };

  // Solo se muestran y exportan datos que corresponden EXACTAMENTE a los filtros y la página vigentes.
  const actual = datos && respuestaStockGeneralVigente(datos, error, aplicados, pagina) ? datos : null;
  const puedeExportar = actual?.permisos.exportar === true;
  const exportar = async (formato: "xlsx" | "pdf") => {
    if (!actual || !puedeExportar) return;
    setExportando(formato);
    setErrorExportacion("");
    try {
      await descargarStockGeneral(actual.filtros, formato);
    } catch (e) {
      setErrorExportacion(e instanceof Error ? e.message : "No fue posible exportar el reporte.");
    } finally {
      setExportando("");
    }
  };

  const t = actual?.totales;
  const total = actual?.pagina.totalFilas ?? 0;
  const tamano = actual?.pagina.tamano ?? 50;
  const paginas = Math.max(1, Math.ceil(total / tamano));
  const detalle = aplicados.vista === "DETALLE";
  const hayFiltros = !filtrosStockGeneralIguales({ ...filtros, vista: FILTROS_VACIOS.vista }, FILTROS_VACIOS);

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <nav className={styles.breadcrumb} aria-label="Ruta de navegación">
            <Link href="/reportes">Reportes</Link>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Stock general</span>
          </nav>
          <h1>Stock general</h1>
          <p>
            Saldos reales por producto, depósito y lote (informe cuantitativo).
            {actual ? ` ${actual.empresa.nombre} · generado ${actual.generado}.` : ""}
          </p>
        </div>

        <div className={styles.heroActions}>
          <Link href="/reportes" className={styles.secondaryButton}>Reportes</Link>
          {puedeExportar ? (
            <>
              <button type="button" className={styles.secondaryButton} disabled={!!exportando || cargando} onClick={() => exportar("xlsx")}>
                {exportando === "xlsx" ? "Generando..." : "Descargar Excel (.xlsx)"}
              </button>
              <button type="button" className={styles.primaryButton} disabled={!!exportando || cargando} onClick={() => exportar("pdf")}>
                {exportando === "pdf" ? "Generando..." : "Exportar PDF"}
              </button>
            </>
          ) : null}
        </div>
      </header>

      <section className={styles.summaryGrid}>
        <article className={[styles.summaryCard, styles.summaryTeal].join(" ")}>
          <span>PRODUCTOS</span>
          <strong>{t ? num(t.productos) : "—"}</strong>
          <small>{t ? `Sin saldo en el alcance: ${num(t.sinSaldo)}` : "Según los filtros activos"}</small>
        </article>
        <article className={[styles.summaryCard, styles.summaryRed].join(" ")}>
          <span>SIN STOCK / BAJO</span>
          <strong>{t ? `${num(t.sinStock)} / ${num(t.bajo)}` : "—"}</strong>
          <small>Sobrestock {t ? num(t.sobrestock) : "—"} · misma regla que Inventario › Stock</small>
        </article>
        <article className={[styles.summaryCard, styles.summaryBlue].join(" ")}>
          <span>UNIDADES DE MEDIDA</span>
          <strong>{t ? num(t.porUnidad.length) : "—"}</strong>
          <small>Las cantidades se suman solo dentro de cada unidad (ver resumen)</small>
        </article>
      </section>

      <section className={styles.contentCard}>
        {t && t.porUnidad.length > 0 ? (
          <details className={styles.policyNote} open>
            <summary><strong>Resumen por unidad de medida</strong> (stock propio y de terceros, sin mezclar unidades)</summary>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Unidad</th><th className={styles.num}>Productos</th>
                    {CANTIDADES.map(([titulo]) => <th key={titulo} className={styles.num}>{titulo}</th>)}
                    <th className={styles.num}>Terceros</th>
                  </tr>
                </thead>
                <tbody>
                  {t.porUnidad.map((u) => (
                    <tr key={u.unidad || "sin"}>
                      <td>{u.unidad || "Sin unidad"}</td><td className={styles.num}>{num(u.productos)}</td>
                      {CANTIDADES.map(([, k]) => <td key={k} className={styles.num}>{fmtCantidadTexto(u[k])}</td>)}
                      <td className={styles.num}>{fmtCantidadTexto(u.terceros)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}

        <div className={styles.toolbar}>
          <label className={styles.search}>
            <input
              type="search"
              value={filtros.q}
              onChange={(e) => cambiar({ q: e.target.value })}
              placeholder="Buscar por código, código de inventario, GTIN o descripción"
              aria-label="Buscar producto"
            />
          </label>

          <div className={styles.viewToggle} role="group" aria-label="Vista del reporte">
            <button type="button" aria-pressed={filtros.vista === "PRODUCTO"} onClick={() => cambiar({ vista: "PRODUCTO" })}>Por producto</button>
            <button type="button" aria-pressed={filtros.vista === "DETALLE"} onClick={() => cambiar({ vista: "DETALLE" })}>Detalle por depósito y lote</button>
          </div>

          <span className={styles.resultCount}>{cargando ? "Cargando..." : actual ? `${num(total)} ${detalle ? "filas" : "productos"}` : ""}</span>
        </div>

        <div className={styles.filters}>
          <label>
            <span>Depósito</span>
            <select value={filtros.depositoId} onChange={(e) => cambiar({ depositoId: e.target.value })}>
              <option value="">Todos</option>
              {(catalogos?.depositos ?? []).map((d) => <option key={d.id} value={d.id}>{d.activo ? d.nombre : `${d.nombre} (inactivo)`}</option>)}
            </select>
          </label>
          <label>
            <span>Categoría</span>
            <select value={filtros.categoriaId} onChange={(e) => cambiar({ categoriaId: e.target.value })}>
              <option value="">Todas</option>
              {(catalogos?.categorias ?? []).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </label>
          <label>
            <span>Marca</span>
            <select value={filtros.marcaId} onChange={(e) => cambiar({ marcaId: e.target.value })}>
              <option value="">Todas</option>
              {(catalogos?.marcas ?? []).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </label>
          <label>
            <span>Familia</span>
            <select value={filtros.familiaId} onChange={(e) => cambiar({ familiaId: e.target.value })}>
              <option value="">Todas</option>
              {(catalogos?.familias ?? []).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </label>
          <label>
            <span>Situación del stock</span>
            <select value={filtros.situacion} onChange={(e) => cambiar({ situacion: e.target.value as StockGeneralFiltros["situacion"] })}>
              <option value="">Todas</option>
              {(Object.keys(NIVEL) as NivelStock[]).map((n) => <option key={n} value={n}>{NIVEL[n]}</option>)}
            </select>
          </label>
          <label>
            <span>Existencia</span>
            <select value={filtros.existencia} onChange={(e) => cambiar({ existencia: e.target.value as StockGeneralFiltros["existencia"] })}>
              <option value="TODOS">Todos</option>
              <option value="CON">Con stock (propio o de terceros)</option>
              <option value="SIN">Sin stock (nada propio ni de terceros)</option>
            </select>
          </label>
          <label>
            <span>Lote</span>
            <input type="text" value={filtros.lote} onChange={(e) => cambiar({ lote: e.target.value })} placeholder="Código de lote" />
          </label>

          {hayFiltros ? (
            <button type="button" className={styles.clearButton} onClick={() => { setPagina(1); setFiltros({ ...FILTROS_VACIOS, vista: filtros.vista }); }}>
              Limpiar filtros
            </button>
          ) : null}
        </div>

        {error ? (
          <div className={styles.errorBox} role="alert">
            {error} No se muestran ni se exportan datos anteriores; los filtros se conservan.{" "}
            <button type="button" className={styles.clearButton} onClick={() => void cargar()}>Reintentar</button>
          </div>
        ) : null}
        {errorExportacion ? <div className={styles.errorBox} role="alert">{errorExportacion}</div> : null}
        {actual && !puedeExportar ? <div className={styles.alertBox}>Su perfil puede consultar este reporte, pero no exportarlo (requiere el permiso Exportar de Reportes).</div> : null}

        <div className={styles.tableWrap} aria-busy={cargando}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Código</th><th>Cód. inv. / GTIN</th><th>Descripción</th><th>Categoría</th><th>Marca</th><th>Familia</th><th>Línea</th><th>Unidad</th>
                {detalle ? <><th>Depósito</th><th>Lote</th><th>Vencimiento</th><th>Propiedad</th></> : null}
                {CANTIDADES.map(([titulo]) => <th key={titulo} className={styles.num}>{titulo}</th>)}
                <th className={styles.num}>Terceros</th><th>Terceros por estado</th>
                {detalle ? null : <th>Situación</th>}
              </tr>
            </thead>
            <tbody>
              {(actual?.filas ?? []).map((f: StockGeneralFila, i: number) => (
                <tr key={`${f.productoId}-${f.deposito}-${f.lote}-${f.propiedad}-${i}`}>
                  <td>{f.codigo}</td>
                  <td>{[f.codigoInventario, f.codigoBarras].filter(Boolean).join(" / ") || "—"}</td>
                  <td className={styles.desc} title={f.descripcion}>{f.descripcion}</td>
                  <td>{f.categoria || "—"}</td><td>{f.marca || "—"}</td><td>{f.familia || "—"}</td><td>{f.linea || "—"}</td><td>{f.unidad || "—"}</td>
                  {detalle ? (
                    <>
                      <td>{f.sinSaldo ? <em>Sin saldo en el alcance filtrado</em> : `${f.deposito}${f.depositoInactivo ? " (inactivo)" : ""}`}</td>
                      <td>{f.lote || "—"}</td><td>{f.fechaVencimiento || "—"}</td><td>{TEXTO_PROPIEDAD[f.propiedad] ?? "—"}</td>
                    </>
                  ) : null}
                  {CANTIDADES.map(([, k]) => <td key={k} className={styles.num}>{fmtCantidadTexto(f[k])}</td>)}
                  <td className={styles.num}>{fmtCantidadTexto(f.terceros)}</td>
                  <td>{textoTercerosEstadosTexto(f.tercerosEstados) || "—"}</td>
                  {detalle ? null : <td><span className={[styles.badge, styles[`badge${f.nivel}`]].join(" ")}>{NIVEL[f.nivel]}</span></td>}
                </tr>
              ))}
            </tbody>
            {actual && actual.filas.length > 0 ? (
              <tfoot>
                <tr>
                  <td colSpan={detalle ? 12 : 8}>TOTAL GENERAL (las cantidades no se suman entre unidades; vea el resumen por unidad)</td>
                  {CANTIDADES.map(([, k]) => <td key={k} className={styles.num}>n/a</td>)}
                  <td className={styles.num}>n/a</td>
                  <td />
                  {detalle ? null : <td />}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        {actual && actual.filas.length === 0 && !cargando ? (
          <div className={styles.empty}>
            <strong>No se encontraron resultados.</strong>
            <span>{hayFiltros ? "Modifique los filtros aplicados." : "Aún no hay productos que controlen stock."}</span>
          </div>
        ) : null}
        {!actual && cargando ? <div className={styles.empty}><strong>Cargando reporte...</strong></div> : null}
        {!actual && !cargando && error ? <div className={styles.empty}><strong>No se pudo generar el reporte</strong><span>Use «Reintentar» para volver a consultar con los mismos filtros.</span></div> : null}

        <footer className={styles.pagination}>
          <span>
            Mostrando {total === 0 ? 0 : (pagina - 1) * tamano + 1}–{Math.min(pagina * tamano, total)} de {num(total)}
          </span>
          <div>
            <button type="button" disabled={pagina === 1 || cargando} onClick={() => setPagina((p) => p - 1)}>‹</button>
            <strong>{pagina} / {paginas}</strong>
            <button type="button" disabled={pagina >= paginas || cargando || !actual} onClick={() => setPagina((p) => p + 1)}>›</button>
          </div>
        </footer>

        <ul className={styles.notes}>
          {(actual?.cobertura ?? []).map((n) => <li key={n}>{n}</li>)}
        </ul>
      </section>
    </section>
  );
}
