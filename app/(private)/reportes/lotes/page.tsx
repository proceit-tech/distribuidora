"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { cargarLotes, descargarLotes } from "@/lib/reportes/cliente-lotes";
import { CLASE_LOTE, textoDias } from "@/lib/reportes/export-lotes";
import { fmtNum, textoTercerosEstados } from "@/lib/reportes/formato";
import type { ClaseVencimiento, LotesFiltros, LotesRespuesta } from "@/types/reportes";

import styles from "./page.module.css";

const FILTROS_VACIOS: LotesFiltros = {
  vista: "LOTE", q: "", lote: "", depositoId: "", categoriaId: "", marcaId: "", familiaId: "", clase: "", existencia: "CON",
  horizonte: 30, vencDesde: "", vencHasta: "",
};
const num = fmtNum;
const CLASES = Object.keys(CLASE_LOTE) as ClaseVencimiento[];

export default function ReporteLotesPage() {
  const [filtros, setFiltros] = useState<LotesFiltros>(FILTROS_VACIOS);
  const [horizonteTxt, setHorizonteTxt] = useState("30");
  const [aplicados, setAplicados] = useState<LotesFiltros>(FILTROS_VACIOS);
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<LotesRespuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [exportando, setExportando] = useState("");

  // Texto y horizonte se aplican con una pequeña espera; los selectores y fechas, de inmediato.
  useEffect(() => {
    const t = setTimeout(() => {
      const h = /^\d{1,4}$/.test(horizonteTxt) ? Number(horizonteTxt) : null;
      setAplicados((a) => (a.q === filtros.q && a.lote === filtros.lote && (h === null || a.horizonte === h) ? a : { ...a, q: filtros.q, lote: filtros.lote, horizonte: h ?? a.horizonte }));
    }, 300);
    return () => clearTimeout(t);
  }, [filtros.q, filtros.lote, horizonteTxt]);

  useEffect(() => {
    setAplicados((a) => ({ ...filtros, q: a.q, lote: a.lote, horizonte: a.horizonte }));
  }, [filtros.vista, filtros.depositoId, filtros.categoriaId, filtros.marcaId, filtros.familiaId, filtros.clase, filtros.existencia, filtros.vencDesde, filtros.vencHasta]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError("");
    cargarLotes(aplicados, pagina)
      .then((r) => { if (activo) setDatos(r); })
      .catch((e: unknown) => { if (activo) setError(e instanceof Error ? e.message : "No fue posible generar el reporte."); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [aplicados, pagina]);

  const cambiar = (parcial: Partial<LotesFiltros>) => {
    setPagina(1);
    setFiltros((f) => ({ ...f, ...parcial }));
  };

  const exportar = async (formato: "xlsx" | "pdf") => {
    setExportando(formato);
    setError("");
    try {
      await descargarLotes(aplicados, formato);
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
  const hayFiltros =
    JSON.stringify({ ...filtros, vista: "", horizonte: 0 }) !== JSON.stringify({ ...FILTROS_VACIOS, vista: "", horizonte: 0 }) || horizonteTxt !== "30";
  const clase = (c: ClaseVencimiento) => t?.clases.find((x) => x.clase === c);
  const colorCard: Record<ClaseVencimiento, string> = { VENCIDO: styles.summaryRed, PROXIMO: styles.summaryAmber, VIGENTE: styles.summaryTeal, SIN_FECHA: styles.summaryPurple };

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <div className={styles.heroMeta}>
            <span className={styles.modulePill}>REPORTES</span>
          </div>
          <h1>Lotes y vencimientos</h1>
          <p>
            Lotes reales con su vencimiento y su stock por depósito, propio y de terceros por separado.
            {datos ? ` ${datos.empresa.nombre} · generado ${datos.generado} · fecha de referencia ${t?.hoy ?? ""} (Paraguay).` : ""}
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
        {CLASES.map((c) => (
          <article key={c} className={[styles.summaryCard, colorCard[c]].join(" ")}>
            <span>{CLASE_LOTE[c].toUpperCase()}</span>
            <strong>{t ? num(clase(c)?.lotes ?? 0) : "—"}</strong>
            <small>
              {t ? `Físico propio ${num(clase(c)?.fisico ?? 0)} · Terceros ${num(clase(c)?.terceros ?? 0)}` : "—"}
            </small>
          </article>
        ))}
      </section>

      <section className={styles.contentCard}>
        <div className={styles.policyNote} role="note">
          <strong>Clasificación con la fecha de hoy en Paraguay.</strong> Vencido = vence antes de hoy; Próximo = vence dentro del horizonte
          ({aplicados.horizonte} días); Vigente = vence después; Sin fecha = lote sin vencimiento registrado (no se inventa). La cuarentena no hace vencido a un lote.
          Cada lote cuenta una sola vez en los indicadores, aunque esté en varios depósitos.
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
            <button type="button" aria-pressed={filtros.vista === "LOTE"} onClick={() => cambiar({ vista: "LOTE" })}>Por lote</button>
            <button type="button" aria-pressed={filtros.vista === "DEPOSITO"} onClick={() => cambiar({ vista: "DEPOSITO" })}>Por lote y depósito</button>
          </div>

          <span className={styles.resultCount}>{cargando ? "Cargando..." : `${num(total)} ${porDeposito ? "filas" : "lotes"}`}</span>
        </div>

        <div className={styles.filters}>
          <label>
            <span>Lote</span>
            <input type="text" value={filtros.lote} onChange={(e) => cambiar({ lote: e.target.value })} placeholder="Código de lote" />
          </label>
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
            <span>Situación de vencimiento</span>
            <select value={filtros.clase} onChange={(e) => cambiar({ clase: e.target.value as LotesFiltros["clase"] })}>
              <option value="">Todas</option>
              {CLASES.map((c) => <option key={c} value={c}>{CLASE_LOTE[c]}</option>)}
            </select>
          </label>
          <label>
            <span>Existencia</span>
            <select value={filtros.existencia} onChange={(e) => cambiar({ existencia: e.target.value as LotesFiltros["existencia"] })}>
              <option value="CON">Solo con saldo</option>
              <option value="SIN">Sin saldo</option>
              <option value="TODOS">Todos</option>
            </select>
          </label>
          <label>
            <span>Horizonte de alerta (días)</span>
            <input type="number" min={0} max={3650} value={horizonteTxt} onChange={(e) => { setPagina(1); setHorizonteTxt(e.target.value); }} />
          </label>
          <label>
            <span>Vence desde</span>
            <input type="date" value={filtros.vencDesde} onChange={(e) => cambiar({ vencDesde: e.target.value })} />
          </label>
          <label>
            <span>Vence hasta</span>
            <input type="date" value={filtros.vencHasta} onChange={(e) => cambiar({ vencHasta: e.target.value })} />
          </label>

          {hayFiltros ? (
            <button type="button" className={styles.clearButton} onClick={() => { setPagina(1); setHorizonteTxt("30"); setFiltros({ ...FILTROS_VACIOS, vista: filtros.vista }); }}>
              Limpiar filtros
            </button>
          ) : null}
        </div>

        {error ? <div className={styles.errorBox}>{error}</div> : null}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Código</th><th>Producto</th><th>Categoría</th><th>Familia</th><th>Lote</th>
                {porDeposito ? <th>Depósito</th> : <th className={styles.num}>Depósitos</th>}
                <th>Vencimiento</th><th className={styles.num}>Días restantes</th><th>Situación</th>
                <th className={styles.num}>Disponible</th><th className={styles.num}>Reservado</th><th className={styles.num}>Cuarentena</th>
                <th className={styles.num}>Físico propio</th><th className={styles.num}>Terceros</th><th>Terceros por estado</th>
              </tr>
            </thead>
            <tbody>
              {(datos?.filas ?? []).map((f, i) => (
                <tr key={`${f.loteId}-${f.deposito}-${i}`}>
                  <td>{f.codigo}</td>
                  <td className={styles.desc} title={f.descripcion}>{f.descripcion}</td>
                  <td>{f.categoria || "—"}</td><td>{f.familia || "—"}</td><td>{f.lote}</td>
                  {porDeposito ? <td>{f.deposito || "—"}</td> : <td className={styles.num}>{num(f.depositos)}</td>}
                  <td>{f.vencimiento || "Sin fecha"}</td>
                  <td className={styles.num}>{textoDias(f)}</td>
                  <td><span className={[styles.badge, styles[`badge${f.clase}`]].join(" ")}>{CLASE_LOTE[f.clase]}</span></td>
                  <td className={styles.num}>{num(f.disponible)}</td><td className={styles.num}>{num(f.reservado)}</td>
                  <td className={styles.num}>{num(f.cuarentena)}</td><td className={styles.num}>{num(f.fisico)}</td>
                  <td className={styles.num}>{num(f.terceros)}</td>
                  <td>{textoTercerosEstados(f.tercerosEstados) || "—"}</td>
                </tr>
              ))}
            </tbody>
            {datos && datos.filas.length > 0 && t ? (
              <tfoot>
                <tr>
                  <td colSpan={9}>TOTAL GENERAL (lotes únicos)</td>
                  <td className={styles.num}>{num(t.disponible)}</td><td className={styles.num}>{num(t.reservado)}</td>
                  <td className={styles.num}>{num(t.cuarentena)}</td><td className={styles.num}>{num(t.fisico)}</td>
                  <td className={styles.num}>{num(t.terceros)}</td>
                  <td>{textoTercerosEstados(t.tercerosPorEstado) || "—"}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        {datos && datos.filas.length === 0 && !cargando ? (
          <div className={styles.empty}>
            <strong>No se encontraron lotes.</strong>
            <span>{hayFiltros ? "Modifique los filtros aplicados." : "Aún no hay lotes con saldo registrados."}</span>
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
