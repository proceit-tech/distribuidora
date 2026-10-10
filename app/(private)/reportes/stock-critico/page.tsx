"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { cargarStockCritico, descargarStockCritico } from "@/lib/reportes/cliente-stock-critico";
import { fmtDinero, fmtNum } from "@/lib/reportes/formato";
import type { NivelStock, StockCriticoFiltros, StockCriticoRespuesta } from "@/types/reportes";

import styles from "./page.module.css";

const NIVEL: Record<NivelStock, string> = { SIN_STOCK: "Sin stock", BAJO: "Bajo", NORMAL: "Normal", SOBRESTOCK: "Sobrestock" };
const FILTROS_VACIOS: StockCriticoFiltros = {
  vista: "PRODUCTO", q: "", depositoId: "", categoriaId: "", marcaId: "", familiaId: "", situacion: "", objetivo: "MINIMO",
};

const num = fmtNum;
const opc = (n: number | null) => (n === null ? "—" : num(n));

export default function ReporteStockCriticoPage() {
  const [filtros, setFiltros] = useState<StockCriticoFiltros>(FILTROS_VACIOS);
  const [aplicados, setAplicados] = useState<StockCriticoFiltros>(FILTROS_VACIOS);
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<StockCriticoRespuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [exportando, setExportando] = useState("");

  // El texto de búsqueda se aplica con una pequeña espera; los selectores, de inmediato.
  useEffect(() => {
    const t = setTimeout(() => setAplicados((a) => (a.q === filtros.q ? a : { ...a, q: filtros.q })), 300);
    return () => clearTimeout(t);
  }, [filtros.q]);

  useEffect(() => {
    setAplicados((a) => ({ ...filtros, q: a.q }));
  }, [filtros.vista, filtros.depositoId, filtros.categoriaId, filtros.marcaId, filtros.familiaId, filtros.situacion, filtros.objetivo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError("");
    cargarStockCritico(aplicados, pagina)
      .then((r) => { if (activo) setDatos(r); })
      .catch((e: unknown) => { if (activo) setError(e instanceof Error ? e.message : "No fue posible generar el reporte."); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [aplicados, pagina]);

  const cambiar = (parcial: Partial<StockCriticoFiltros>) => {
    setPagina(1);
    setFiltros((f) => ({ ...f, ...parcial }));
  };

  const exportar = async (formato: "xlsx" | "pdf") => {
    setExportando(formato);
    setError("");
    try {
      await descargarStockCritico(aplicados, formato);
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
  const porDeposito = aplicados.vista === "DEPOSITO";
  const colDeposito = porDeposito || !!aplicados.depositoId;
  const hayFiltros = JSON.stringify({ ...filtros, vista: "", objetivo: "" }) !== JSON.stringify({ ...FILTROS_VACIOS, vista: "", objetivo: "" });
  const colTotal = 5 + (porDeposito ? 1 : 0) + (colDeposito ? 1 : 0) + 4;

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <div className={styles.heroMeta}>
            <span className={styles.modulePill}>REPORTES</span>
          </div>
          <h1>Stock crítico y reposición</h1>
          <p>
            Productos sin stock, bajo el mínimo, normales y en sobrestock, con la cantidad sugerida a reponer.
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
          <small>Normal {t ? num(t.normal) : "—"} · Sobrestock {t ? num(t.sobrestock) : "—"}</small>
        </article>
        <article className={[styles.summaryCard, styles.summaryRed].join(" ")}>
          <span>SIN STOCK</span>
          <strong>{t ? num(t.sinStock) : "—"}</strong>
          <small>Disponible en cero</small>
        </article>
        <article className={[styles.summaryCard, styles.summaryAmber].join(" ")}>
          <span>BAJO EL MÍNIMO</span>
          <strong>{t ? num(t.bajo) : "—"}</strong>
          <small>En punto de reposición {t ? num(t.enPuntoReposicion) : "—"}</small>
        </article>
        <article className={[styles.summaryCard, styles.summaryBlue].join(" ")}>
          <span>CANTIDAD SUGERIDA</span>
          <strong>{t ? num(t.cantidadSugerida) : "—"}</strong>
          <small>{t ? `${num(t.aReponer)} productos a reponer` : "—"}</small>
        </article>
        <article className={[styles.summaryCard, styles.summaryPurple].join(" ")}>
          <span>VALOR SUGERIDO ({t?.moneda ?? ""})</span>
          <strong>{t ? fmtDinero(t.valorSugerido) : "—"}</strong>
          <small>{t && t.sugeridoSinCosto > 0 ? `${num(t.sugeridoSinCosto)} sin costo registrado (no suman)` : "Con costo promedio real"}</small>
        </article>
      </section>

      <section className={styles.contentCard}>
        <div className={styles.policyNote} role="note">
          <strong>Límites por producto, no por depósito.</strong> En la V1 el mínimo, el máximo y el punto de reposición se definen en el cadastro de Productos
          y valen para el producto completo. La situación y la cantidad sugerida usan el disponible consolidado de todos los depósitos a los que usted tiene acceso;
          el filtro de depósito solo muestra los productos con stock allí y cuánto hay en ese depósito.
        </div>

        <div className={styles.toolbar}>
          <label className={styles.search}>
            <input
              type="search"
              value={filtros.q}
              onChange={(e) => cambiar({ q: e.target.value })}
              placeholder="Buscar producto por código, código de inventario, GTIN o descripción"
              aria-label="Buscar producto"
            />
          </label>

          <div className={styles.viewToggle} role="group" aria-label="Vista del reporte">
            <button type="button" aria-pressed={filtros.vista === "PRODUCTO"} onClick={() => cambiar({ vista: "PRODUCTO" })}>Por producto</button>
            <button type="button" aria-pressed={filtros.vista === "DEPOSITO"} onClick={() => cambiar({ vista: "DEPOSITO" })}>Por producto y depósito</button>
          </div>

          <span className={styles.resultCount}>{cargando ? "Cargando..." : `${num(total)} ${porDeposito ? "filas" : "productos"}`}</span>
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
            <span>Situación</span>
            <select value={filtros.situacion} onChange={(e) => cambiar({ situacion: e.target.value as StockCriticoFiltros["situacion"] })}>
              <option value="">Todas</option>
              {(Object.keys(NIVEL) as NivelStock[]).map((n) => <option key={n} value={n}>{NIVEL[n]}</option>)}
            </select>
          </label>
          <label>
            <span>Reponer hasta</span>
            <select value={filtros.objetivo} onChange={(e) => cambiar({ objetivo: e.target.value as StockCriticoFiltros["objetivo"] })}>
              <option value="MINIMO">Stock mínimo (conservador)</option>
              <option value="MAXIMO">Stock máximo</option>
            </select>
          </label>

          {hayFiltros ? (
            <button type="button" className={styles.clearButton} onClick={() => { setPagina(1); setFiltros({ ...FILTROS_VACIOS, vista: filtros.vista, objetivo: filtros.objetivo }); }}>
              Limpiar filtros
            </button>
          ) : null}
        </div>

        {error ? <div className={styles.errorBox}>{error}</div> : null}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Código</th><th>Descripción</th><th>Categoría</th><th>Marca</th><th>Familia</th>
                {porDeposito ? <th>Depósito</th> : null}
                {colDeposito ? <th className={styles.num}>Disp. en depósito</th> : null}
                <th className={styles.num}>Disponible (total)</th><th className={styles.num}>Mínimo</th><th className={styles.num}>Máximo</th>
                <th className={styles.num}>Punto reposición</th><th>Situación</th><th className={styles.num}>Cant. sugerida</th>
                <th className={styles.num}>Costo ref.</th><th className={styles.num}>Valor sugerido</th>
              </tr>
            </thead>
            <tbody>
              {(datos?.filas ?? []).map((f, i) => (
                <tr key={`${f.productoId}-${f.deposito}-${i}`}>
                  <td>{f.codigo}</td>
                  <td className={styles.desc} title={f.descripcion}>{f.descripcion}</td>
                  <td>{f.categoria || "—"}</td><td>{f.marca || "—"}</td><td>{f.familia || "—"}</td>
                  {porDeposito ? <td>{f.deposito || "—"}</td> : null}
                  {colDeposito ? <td className={styles.num}>{opc(f.disponibleDeposito)}</td> : null}
                  <td className={styles.num}>{num(f.disponible)}</td>
                  <td className={styles.num}>{num(f.minimo)}</td>
                  <td className={styles.num}>{opc(f.maximo)}</td>
                  <td className={styles.num}>{opc(f.puntoReposicion)}</td>
                  <td>
                    <span className={[styles.badge, styles[`badge${f.nivel}`]].join(" ")}>{NIVEL[f.nivel]}</span>
                    {f.enPuntoReposicion && f.nivel !== "SIN_STOCK" && f.nivel !== "BAJO" ? <small> en punto</small> : null}
                  </td>
                  <td className={styles.num}>{num(f.cantidadSugerida)}</td>
                  <td className={styles.num}>{fmtDinero(f.costoReferencia)}</td>
                  <td className={styles.num}>{fmtDinero(f.valorSugerido)}</td>
                </tr>
              ))}
            </tbody>
            {datos && datos.filas.length > 0 ? (
              <tfoot>
                <tr>
                  <td colSpan={colTotal - 1}>TOTAL (productos del filtro, cada uno una sola vez)</td>
                  <td className={styles.num}>{num(datos.totales.cantidadSugerida)}</td>
                  <td />
                  <td className={styles.num}>{fmtDinero(datos.totales.valorSugerido)}</td>
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
