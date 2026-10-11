"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { cargarValorizacion, descargarValorizacion } from "@/lib/reportes/cliente-valorizacion";
import { SITUACION_COSTO } from "@/lib/reportes/export-valorizacion";
import { fmtDinero, fmtNum } from "@/lib/reportes/formato";
import type { ValorizacionFiltros, ValorizacionFila, ValorizacionRespuesta } from "@/types/reportes";

import styles from "./page.module.css";

const FILTROS_VACIOS: ValorizacionFiltros = { vista: "DETALLE", q: "", depositoId: "", categoriaId: "", familiaId: "", existencia: "CON", costo: "TODOS" };
const VISTAS: [ValorizacionFiltros["vista"], string][] = [["DETALLE", "Detalle"], ["PRODUCTO", "Por producto"], ["DEPOSITO", "Por depósito"], ["CATEGORIA", "Por categoría"]];

export default function ReporteValorizacionPage() {
  const [filtros, setFiltros] = useState<ValorizacionFiltros>(FILTROS_VACIOS);
  const [aplicados, setAplicados] = useState<ValorizacionFiltros>(FILTROS_VACIOS);
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<ValorizacionRespuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [exportando, setExportando] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setAplicados((a) => (a.q === filtros.q ? a : { ...a, q: filtros.q })), 300);
    return () => clearTimeout(t);
  }, [filtros.q]);

  useEffect(() => {
    setAplicados((a) => ({ ...filtros, q: a.q }));
  }, [filtros.vista, filtros.depositoId, filtros.categoriaId, filtros.familiaId, filtros.existencia, filtros.costo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError("");
    cargarValorizacion(aplicados, pagina)
      .then((r) => { if (activo) setDatos(r); })
      .catch((e: unknown) => { if (activo) setError(e instanceof Error ? e.message : "No fue posible generar el reporte."); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [aplicados, pagina]);

  const cambiar = (parcial: Partial<ValorizacionFiltros>) => {
    setPagina(1);
    setFiltros((f) => ({ ...f, ...parcial }));
  };

  const exportar = async (formato: "xlsx" | "pdf") => {
    setExportando(formato);
    setError("");
    try {
      await descargarValorizacion(aplicados, formato);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No fue posible exportar el reporte.");
    } finally {
      setExportando("");
    }
  };

  const t = datos?.totales;
  const mon = t?.moneda ?? "";
  const total = datos?.pagina.totalFilas ?? 0;
  const tamano = datos?.pagina.tamano ?? 50;
  const paginas = Math.max(1, Math.ceil(total / tamano));
  const vista: ValorizacionFiltros["vista"] = aplicados.vista;
  const hayFiltros = JSON.stringify({ ...filtros, vista: "" }) !== JSON.stringify({ ...FILTROS_VACIOS, vista: "" });
  const conProducto = vista === "DETALLE" || vista === "PRODUCTO";
  const colsIdent: number = vista === "DETALLE" ? 5 : vista === "PRODUCTO" ? 4 : 1;
  const etiquetaFilas = vista === "DETALLE" ? "filas" : vista === "PRODUCTO" ? "productos" : vista === "DEPOSITO" ? "depósitos" : "categorías";

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <div className={styles.heroMeta}>
            <span className={styles.modulePill}>REPORTES</span>
          </div>
          <h1>Valorización de inventario</h1>
          <p>
            Costo promedio real y valor del inventario a hoy.
            {datos ? ` ${datos.empresa.nombre} · moneda ${datos.empresa.moneda} · generado ${datos.generado}.` : ""}
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
          <span>VALOR TOTAL ({mon || "—"})</span>
          <strong>{t ? fmtDinero(t.valorTotal) : "—"}</strong>
          <small>Solo stock con costo registrado</small>
        </article>
        <article className={[styles.summaryCard, styles.summaryBlue].join(" ")}>
          <span>CANTIDAD VALORIZADA</span>
          <strong>{t ? fmtNum(t.cantidadValorizada) : "—"}</strong>
          <small>Costo promedio {t ? fmtDinero(t.costoPromedio) : "—"}</small>
        </article>
        <article className={[styles.summaryCard, styles.summaryAmber].join(" ")}>
          <span>STOCK FÍSICO PROPIO</span>
          <strong>{t ? fmtNum(t.fisico) : "—"}</strong>
          <small>{t ? `${fmtNum(t.productos)} productos · ${fmtNum(t.depositos)} depósitos` : "—"}</small>
        </article>
        <article className={[styles.summaryCard, styles.summaryRed].join(" ")}>
          <span>SIN COSTO REGISTRADO</span>
          <strong>{t ? fmtNum(t.filasSinCosto) : "—"}</strong>
          <small>{t ? `${fmtNum(t.fisicoNoValorizado)} u. físicas no valorizadas` : "—"}</small>
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
            {VISTAS.map(([v, texto]) => (
              <button key={v} type="button" aria-pressed={filtros.vista === v} onClick={() => cambiar({ vista: v })}>{texto}</button>
            ))}
          </div>

          <span className={styles.resultCount}>{cargando ? "Cargando..." : `${fmtNum(total)} ${etiquetaFilas}`}</span>
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
            <span>Familia</span>
            <select value={filtros.familiaId} onChange={(e) => cambiar({ familiaId: e.target.value })}>
              <option value="">Todas</option>
              {(datos?.catalogos.familias ?? []).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </label>
          <label>
            <span>Existencia</span>
            <select value={filtros.existencia} onChange={(e) => cambiar({ existencia: e.target.value as ValorizacionFiltros["existencia"] })}>
              <option value="CON">Con existencia</option>
              <option value="SIN">Sin existencia</option>
              <option value="TODOS">Todos</option>
            </select>
          </label>
          <label>
            <span>Costo registrado</span>
            <select value={filtros.costo} onChange={(e) => cambiar({ costo: e.target.value as ValorizacionFiltros["costo"] })}>
              <option value="TODOS">Todos</option>
              <option value="CON">Con costo</option>
              <option value="SIN">Sin costo</option>
            </select>
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
                {conProducto ? <><th>Código</th><th>Producto</th><th>Categoría</th><th>Familia</th></> : null}
                {vista === "CATEGORIA" ? <th>Categoría</th> : null}
                {vista === "DETALLE" || vista === "DEPOSITO" ? <th>Depósito</th> : null}
                {vista === "DEPOSITO" || vista === "CATEGORIA" ? <th className={styles.num}>Productos</th> : null}
                {vista === "CATEGORIA" ? <th className={styles.num}>Depósitos</th> : null}
                {vista === "PRODUCTO" ? <th className={styles.num}>Depósitos</th> : null}
                <th className={styles.num}>Stock físico propio</th>
                <th className={styles.num}>Cantidad valorizada</th>
                <th className={styles.num}>Costo promedio unit.</th>
                <th className={styles.num}>Valor total</th>
                <th>Moneda</th>
                <th>Costo</th>
              </tr>
            </thead>
            <tbody>
              {(datos?.filas ?? []).map((f: ValorizacionFila) => (
                <tr key={f.clave}>
                  {conProducto ? <><td>{f.codigo}</td><td className={styles.desc} title={f.descripcion}>{f.descripcion}</td><td>{f.categoria || "—"}</td><td>{f.familia || "—"}</td></> : null}
                  {vista === "CATEGORIA" ? <td className={styles.desc}>{f.categoria}</td> : null}
                  {vista === "DETALLE" ? <td>{f.deposito}</td> : null}
                  {vista === "DEPOSITO" ? <td className={styles.desc}>{f.deposito}</td> : null}
                  {vista === "DEPOSITO" || vista === "CATEGORIA" ? <td className={styles.num}>{fmtNum(f.productos)}</td> : null}
                  {vista === "CATEGORIA" || vista === "PRODUCTO" ? <td className={styles.num}>{fmtNum(f.depositos)}</td> : null}
                  <td className={styles.num}>{fmtNum(f.fisico)}</td>
                  <td className={styles.num}>{fmtNum(f.cantidadValorizada)}</td>
                  <td className={styles.num}>{fmtDinero(f.costoPromedio)}</td>
                  <td className={styles.num}>{fmtDinero(f.valorTotal)}</td>
                  <td>{f.moneda}</td>
                  <td><span className={[styles.badge, styles[`badge${f.situacionCosto}`]].join(" ")}>{SITUACION_COSTO[f.situacionCosto]}</span></td>
                </tr>
              ))}
            </tbody>
            {datos && t && datos.filas.length > 0 ? (
              <tfoot>
                <tr>
                  <td colSpan={colsIdent}>TOTAL GENERAL (todos los resultados del filtro)</td>
                  {vista === "DEPOSITO" || vista === "CATEGORIA" ? <td className={styles.num}>{fmtNum(t.productos)}</td> : null}
                  {vista === "CATEGORIA" || vista === "PRODUCTO" ? <td className={styles.num}>{fmtNum(t.depositos)}</td> : null}
                  <td className={styles.num}>{fmtNum(t.fisico)}</td>
                  <td className={styles.num}>{fmtNum(t.cantidadValorizada)}</td>
                  <td className={styles.num}>{fmtDinero(t.costoPromedio)}</td>
                  <td className={styles.num}>{fmtDinero(t.valorTotal)}</td>
                  <td>{t.moneda}</td>
                  <td />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        {datos && datos.filas.length === 0 && !cargando ? (
          <div className={styles.empty}>
            <strong>No se encontraron resultados.</strong>
            <span>{hayFiltros ? "Modifique los filtros aplicados." : "Aún no hay inventario para valorizar."}</span>
          </div>
        ) : null}
        {!datos && cargando ? <div className={styles.empty}><strong>Cargando reporte...</strong></div> : null}

        <footer className={styles.pagination}>
          <span>
            Mostrando {total === 0 ? 0 : (pagina - 1) * tamano + 1}–{Math.min(pagina * tamano, total)} de {fmtNum(total)}
          </span>
          <div>
            <button type="button" disabled={pagina === 1 || cargando} onClick={() => setPagina((p) => p - 1)}>‹</button>
            <strong>{pagina} / {paginas}</strong>
            <button type="button" disabled={pagina >= paginas || cargando} onClick={() => setPagina((p) => p + 1)}>›</button>
          </div>
        </footer>

        <ul className={styles.notes}>
          {t && t.filasSinCosto > 0 ? <li>Stock sin costo registrado (no incluido en el valor): {fmtNum(t.filasSinCosto)} filas producto × depósito, {fmtNum(t.fisicoNoValorizado)} unidades físicas no valorizadas.</li> : null}
          {(datos?.cobertura ?? []).map((n) => <li key={n}>{n}</li>)}
        </ul>
      </section>
    </section>
  );
}
