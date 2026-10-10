"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { cargarStockGeneral, descargarStockGeneral } from "@/lib/reportes/cliente-stock-general";
import { fmtNum, TEXTO_PROPIEDAD, textoTercerosEstados } from "@/lib/reportes/formato";
import type { NivelStock, StockGeneralFiltros, StockGeneralFila, StockGeneralRespuesta } from "@/types/reportes";

import styles from "./page.module.css";

const NIVEL: Record<NivelStock, string> = { SIN_STOCK: "Sin stock", BAJO: "Bajo", NORMAL: "Normal", SOBRESTOCK: "Sobrestock" };
const FILTROS_VACIOS: StockGeneralFiltros = {
  vista: "PRODUCTO", q: "", depositoId: "", categoriaId: "", marcaId: "", familiaId: "", situacion: "", lote: "", existencia: "TODOS",
};

const num = fmtNum;

type Cant = "disponible" | "reservado" | "cuarentena" | "transito" | "fisico" | "virtual";
const CANTIDADES: [string, Cant][] = [
  ["Disponible", "disponible"], ["Reservado", "reservado"], ["Cuarentena", "cuarentena"], ["En tránsito", "transito"], ["Físico", "fisico"], ["Virtual", "virtual"],
];

// Fila de totales única en las dos vistas: Disponible…Virtual = propio; Terceros aparte (mismo significado que en las filas).
function filaTotal(r: StockGeneralRespuesta): Partial<Record<Cant | "terceros", number>> {
  const t = r.totales;
  return { disponible: t.disponible, reservado: t.reservado, cuarentena: t.cuarentena, transito: t.transito, fisico: t.fisico, virtual: t.virtual, terceros: t.terceros };
}

export default function ReporteStockGeneralPage() {
  const [filtros, setFiltros] = useState<StockGeneralFiltros>(FILTROS_VACIOS);
  const [aplicados, setAplicados] = useState<StockGeneralFiltros>(FILTROS_VACIOS);
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<StockGeneralRespuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [exportando, setExportando] = useState("");

  // Los campos de texto se aplican con una pequeña espera; los selectores, de inmediato.
  useEffect(() => {
    const t = setTimeout(() => {
      setAplicados((a) => (a.q === filtros.q && a.lote === filtros.lote ? a : { ...a, q: filtros.q, lote: filtros.lote }));
    }, 300);
    return () => clearTimeout(t);
  }, [filtros.q, filtros.lote]);

  useEffect(() => {
    setAplicados((a) => ({ ...filtros, q: a.q, lote: a.lote }));
  }, [filtros.vista, filtros.depositoId, filtros.categoriaId, filtros.marcaId, filtros.familiaId, filtros.situacion, filtros.existencia]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError("");
    cargarStockGeneral(aplicados, pagina)
      .then((r) => { if (activo) setDatos(r); })
      .catch((e: unknown) => { if (activo) setError(e instanceof Error ? e.message : "No fue posible generar el reporte."); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [aplicados, pagina]);

  const cambiar = (parcial: Partial<StockGeneralFiltros>) => {
    setPagina(1);
    setFiltros((f) => ({ ...f, ...parcial }));
  };

  const exportar = async (formato: "xlsx" | "pdf") => {
    setExportando(formato);
    setError("");
    try {
      await descargarStockGeneral(aplicados, formato);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No fue posible exportar el reporte.");
    } finally {
      setExportando("");
    }
  };

  const t = datos?.totales;
  const total = datos?.pagina.totalFilas ?? 0;
  const tamano = datos?.pagina.tamano ?? 50;
  const paginas = Math.max(1, Math.ceil(total / tamano));
  const detalle = aplicados.vista === "DETALLE";
  const hayFiltros = JSON.stringify({ ...filtros, vista: "" }) !== JSON.stringify({ ...FILTROS_VACIOS, vista: "" });

  const celdaNum = (f: StockGeneralFila, k: Cant | "terceros") => <td key={k} className={styles.num}>{num(k === "terceros" ? f.terceros : f[k])}</td>;

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <div className={styles.heroMeta}>
            <span className={styles.modulePill}>REPORTES</span>
          </div>
          <h1>Stock general</h1>
          <p>
            Saldos reales por producto, depósito y lote.
            {datos ? ` ${datos.empresa.nombre} · generado ${datos.generado}.` : ""}
          </p>
        </div>

        <div className={styles.heroActions}>
          <Link href="/reportes" className={styles.secondaryButton}>Reportes</Link>
          <button type="button" className={styles.secondaryButton} disabled={!!exportando || cargando} onClick={() => exportar("xlsx")}>
            {exportando === "xlsx" ? "Generando..." : "Descargar Excel (.xlsx)"}
          </button>
          <button type="button" className={styles.primaryButton} disabled={!!exportando || cargando} onClick={() => exportar("pdf")}>
            {exportando === "pdf" ? "Generando..." : "Exportar PDF"}
          </button>
        </div>
      </header>

      <section className={styles.summaryGrid}>
        <article className={[styles.summaryCard, styles.summaryTeal].join(" ")}>
          <span>PRODUCTOS</span>
          <strong>{t ? num(t.productos) : "—"}</strong>
          <small>Según los filtros activos</small>
        </article>
        <article className={[styles.summaryCard, styles.summaryBlue].join(" ")}>
          <span>DISPONIBLE (PROPIO)</span>
          <strong>{t ? num(t.disponible) : "—"}</strong>
          <small>Reservado {t ? num(t.reservado) : "—"} · Cuarentena {t ? num(t.cuarentena) : "—"}</small>
        </article>
        <article className={[styles.summaryCard, styles.summaryAmber].join(" ")}>
          <span>FÍSICO / VIRTUAL (PROPIO)</span>
          <strong>{t ? `${num(t.fisico)} / ${num(t.virtual)}` : "—"}</strong>
          <small>En tránsito {t ? num(t.transito) : "—"}</small>
        </article>
        <article className={[styles.summaryCard, styles.summaryPurple].join(" ")}>
          <span>STOCK DE TERCEROS</span>
          <strong>{t ? num(t.terceros) : "—"}</strong>
          <small>Separado del stock propio</small>
        </article>
        <article className={[styles.summaryCard, styles.summaryRed].join(" ")}>
          <span>SIN STOCK / BAJO</span>
          <strong>{t ? `${num(t.sinStock)} / ${num(t.bajo)}` : "—"}</strong>
          <small>Sobrestock {t ? num(t.sobrestock) : "—"}</small>
        </article>
      </section>

      <section className={styles.contentCard}>
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

          <span className={styles.resultCount}>{cargando ? "Cargando..." : `${num(total)} ${detalle ? "filas" : "productos"}`}</span>
        </div>

        <div className={styles.filters}>
          <label>
            <span>Depósito</span>
            <select value={filtros.depositoId} onChange={(e) => cambiar({ depositoId: e.target.value })}>
              <option value="">Todos</option>
              {(datos?.catalogos.depositos ?? []).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </label>
          <label>
            <span>Categoría</span>
            <select value={filtros.categoriaId} onChange={(e) => cambiar({ categoriaId: e.target.value })}>
              <option value="">Todas</option>
              {(datos?.catalogos.categorias ?? []).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </label>
          <label>
            <span>Marca</span>
            <select value={filtros.marcaId} onChange={(e) => cambiar({ marcaId: e.target.value })}>
              <option value="">Todas</option>
              {(datos?.catalogos.marcas ?? []).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </label>
          <label>
            <span>Familia</span>
            <select value={filtros.familiaId} onChange={(e) => cambiar({ familiaId: e.target.value })}>
              <option value="">Todas</option>
              {(datos?.catalogos.familias ?? []).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
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
              <option value="CON">Con stock</option>
              <option value="SIN">Sin stock</option>
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

        {error ? <div className={styles.errorBox}>{error}</div> : null}

        <div className={styles.tableWrap}>
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
              {(datos?.filas ?? []).map((f: StockGeneralFila, i: number) => (
                <tr key={`${f.productoId}-${f.deposito}-${f.lote}-${f.propiedad}-${i}`}>
                  <td>{f.codigo}</td>
                  <td>{[f.codigoInventario, f.codigoBarras].filter(Boolean).join(" / ") || "—"}</td>
                  <td className={styles.desc} title={f.descripcion}>{f.descripcion}</td>
                  <td>{f.categoria || "—"}</td><td>{f.marca || "—"}</td><td>{f.familia || "—"}</td><td>{f.linea || "—"}</td><td>{f.unidad || "—"}</td>
                  {detalle ? <><td>{f.deposito}</td><td>{f.lote || "—"}</td><td>{f.fechaVencimiento || "—"}</td><td>{TEXTO_PROPIEDAD[f.propiedad]}</td></> : null}
                  {CANTIDADES.map(([, k]) => celdaNum(f, k))}
                  {celdaNum(f, "terceros")}
                  <td>{textoTercerosEstados(f.tercerosEstados) || "—"}</td>
                  {detalle ? null : <td><span className={[styles.badge, styles[`badge${f.nivel}`]].join(" ")}>{NIVEL[f.nivel]}</span></td>}
                </tr>
              ))}
            </tbody>
            {datos && datos.filas.length > 0 ? (
              <tfoot>
                <tr>
                  <td colSpan={detalle ? 12 : 8}>TOTAL (todos los resultados del filtro)</td>
                  {CANTIDADES.map(([, k]) => <td key={k} className={styles.num}>{num(filaTotal(datos)[k] ?? 0)}</td>)}
                  <td className={styles.num}>{num(datos.totales.terceros)}</td>
                  <td>{textoTercerosEstados(datos.totales.tercerosPorEstado) || "—"}</td>
                  {detalle ? null : <td />}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        {datos && datos.filas.length === 0 && !cargando ? (
          <div className={styles.empty}>
            <strong>No se encontraron resultados.</strong>
            <span>{hayFiltros ? "Modifique los filtros aplicados." : "Aún no hay productos que controlen stock."}</span>
          </div>
        ) : null}
        {!datos && cargando ? <div className={styles.empty}><strong>Cargando reporte...</strong></div> : null}

        <footer className={styles.pagination}>
          <span>
            Mostrando {total === 0 ? 0 : (pagina - 1) * tamano + 1}–{Math.min(pagina * tamano, total)} de {num(total)}
          </span>
          <div>
            <button type="button" disabled={pagina === 1 || cargando} onClick={() => setPagina((p) => p - 1)}>‹</button>
            <strong>{pagina} / {paginas}</strong>
            <button type="button" disabled={pagina >= paginas || cargando} onClick={() => setPagina((p) => p + 1)}>›</button>
          </div>
        </footer>

        <ul className={styles.notes}>
          {(datos?.cobertura ?? []).map((n) => <li key={n}>{n}</li>)}
        </ul>
      </section>
    </section>
  );
}
