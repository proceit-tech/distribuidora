"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { crearCompuerta } from "@/lib/productos/catalogos-carga";
import { descargarStockCritico, pedirStockCritico } from "@/lib/reportes/cliente-stock-critico";
import { SITUACIONES_CRITICO } from "@/lib/reportes/export-stock-critico";
import { fmtDinero, fmtNum } from "@/lib/reportes/formato";
import { ETIQUETA_CRITICIDAD, filtrosIguales, respuestaVigente } from "@/lib/reportes/stock-critico-plan";
import type { StockCriticoFila, StockCriticoFiltros, StockCriticoRespuestaApi } from "@/types/reportes";

import styles from "@/components/ui/lista-padrao/reporte.module.css";

const FILTROS_VACIOS: StockCriticoFiltros = { vista: "PRODUCTO", q: "", depositoId: "", categoriaId: "", marcaId: "", familiaId: "", situacion: "ALERTAS" };
const opc = (n: number | null) => (n === null ? "—" : fmtNum(n));

/** Meta definida → cantidad; destino que necesita reposición sin meta → «Sin meta definida» (nunca 0 ni una cantidad inventada). */
const conMeta = (n: number, x: StockCriticoFila) => (x.sinMeta > 0 ? (n === 0 ? "Sin meta definida" : `${fmtNum(n)} + ${fmtNum(x.sinMeta)} sin meta`) : x.necesita ? fmtNum(n) : "—");

type Catalogos = StockCriticoRespuestaApi["catalogos"];

export default function ReporteStockCriticoPage() {
  const [filtros, setFiltros] = useState<StockCriticoFiltros>(FILTROS_VACIOS);
  const [qAplicada, setQAplicada] = useState("");
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<StockCriticoRespuestaApi | null>(null);
  // Solo los nombres de los selectores sobreviven a un error (conservan los filtros elegidos); ningún dato del informe se conserva.
  const [catalogos, setCatalogos] = useState<Catalogos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [errorExportacion, setErrorExportacion] = useState("");
  const [exportando, setExportando] = useState("");
  const compuerta = useRef(crearCompuerta());

  // La búsqueda de texto se aplica con retraso (300 ms); el resto de los filtros, de inmediato.
  useEffect(() => {
    const t = setTimeout(() => setQAplicada(filtros.q), 300);

    return () => clearTimeout(t);
  }, [filtros.q]);

  const aplicados = useMemo(() => ({ ...filtros, q: qAplicada }), [filtros, qAplicada]);

  // La última solicitud iniciada gana; ante cualquier falla se descartan los datos anteriores y se conservan los filtros.
  const cargar = useCallback(async () => {
    const sol = compuerta.current.nueva();

    setCargando(true);
    setError("");

    const r = await pedirStockCritico(aplicados, pagina);

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

  const cambiar = (parcial: Partial<StockCriticoFiltros>) => {
    setPagina(1);
    setFiltros((f) => ({ ...f, ...parcial }));
  };

  // Solo se muestran y exportan datos que corresponden EXACTAMENTE a los filtros y la página vigentes.
  const actual = datos && respuestaVigente(datos, error, aplicados, pagina) ? datos : null;
  const puedeExportar = actual?.permisos.exportar === true;
  const exportar = async (formato: "xlsx" | "pdf") => {
    if (!actual || !puedeExportar) return;
    setExportando(formato);
    setErrorExportacion("");
    try {
      await descargarStockCritico(actual.filtros, formato);
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
  const porDeposito = aplicados.vista === "DEPOSITO";
  const hayFiltros = !filtrosIguales({ ...filtros, vista: FILTROS_VACIOS.vista }, FILTROS_VACIOS);
  const colsFijas = porDeposito ? 4 : 3;

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <nav className={styles.breadcrumb} aria-label="Ruta de navegación">
            <Link href="/reportes">Reportes</Link>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Stock crítico y reposición</span>
          </nav>
          <h1>Stock crítico y reposición</h1>
          <p>
            Excepciones de reposición calculadas con la misma regla de Inventario → Reposición.
            {actual ? ` ${actual.empresa.nombre} · moneda base ${actual.empresa.moneda} · generado ${actual.generado}.` : ""}
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
          <span>NECESITAN REPOSICIÓN</span>
          <strong>{t ? fmtNum(t.necesitan) : "—"}</strong>
          <small>{t ? `${fmtNum(t.destinos)} destino(s) con plan · ${fmtNum(t.productos)} producto(s)` : "—"}</small>
        </article>
        <article className={[styles.summaryCard, styles.summaryRed].join(" ")}>
          <span>SIN STOCK</span>
          <strong>{t ? fmtNum(t.porCriticidad.SIN_STOCK) : "—"}</strong>
          <small>Disponible propio en cero</small>
        </article>
        <article className={[styles.summaryCard, styles.summaryAmber].join(" ")}>
          <span>BAJO EL MÍNIMO</span>
          <strong>{t ? fmtNum(t.porCriticidad.BAJO_MINIMO) : "—"}</strong>
          <small>En punto de reposición {t ? fmtNum(t.porCriticidad.EN_PUNTO) : "—"}</small>
        </article>
        <article className={[styles.summaryCard, styles.summaryBlue].join(" ")}>
          <span>SOBRESTOCK</span>
          <strong>{t ? fmtNum(t.sobrestock) : "—"}</strong>
          <small>{t ? `Físico propio sobre el máximo (informativo) · sin meta definida ${fmtNum(t.sinMeta)}` : "—"}</small>
        </article>
        <article className={[styles.summaryCard, styles.summaryPurple].join(" ")}>
          <span>VALOR DE REFERENCIA ({t?.moneda ?? ""})</span>
          <strong>{t ? fmtDinero(t.valorReferencia) : "—"}</strong>
          <small>{t && t.sinCosto > 0 ? `${fmtNum(t.sinCosto)} sin costo registrado (no se estiman)` : "Estimación a costo real; no es valorización"}</small>
        </article>
      </section>

      <section className={styles.contentCard}>
        <div className={styles.policyNote} role="note">
          <strong>Informe de solo lectura.</strong> Muestra el resultado del mismo cálculo de Reposición (parámetros por depósito, disponible propio, transferencia primero y compra por el resto). No planifica ni crea
          compras, pedidos o movimientos: para actuar use Inventario → Reposición. Las cantidades se suman solo dentro de un mismo producto.
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

          <span className={styles.resultCount}>{cargando ? "Cargando..." : actual ? `${fmtNum(total)} ${porDeposito ? "filas" : "productos"}` : ""}</span>
        </div>

        <div className={styles.filters}>
          <label>
            <span>Depósito</span>
            <select value={filtros.depositoId} onChange={(e) => cambiar({ depositoId: e.target.value })}>
              <option value="">Todos</option>
              {(catalogos?.depositos ?? []).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
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
            <span>Situación</span>
            <select value={filtros.situacion} onChange={(e) => cambiar({ situacion: e.target.value as StockCriticoFiltros["situacion"] })}>
              {(Object.keys(SITUACIONES_CRITICO) as StockCriticoFiltros["situacion"][]).map((s) => <option key={s} value={s}>{SITUACIONES_CRITICO[s]}</option>)}
            </select>
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
                <th>Código</th><th>Producto</th><th>Categoría</th>
                {porDeposito ? <th>Depósito</th> : <th className={styles.num}>Destinos</th>}
                <th>Un.</th><th className={styles.num}>Disponible</th>
                {porDeposito ? <><th className={styles.num}>Mín.</th><th className={styles.num}>Punto</th><th className={styles.num}>Máx.</th></> : null}
                <th>Situación</th><th className={styles.num}>Sobrestock</th><th className={styles.num}>Sugerida</th><th className={styles.num}>Transferencia</th><th className={styles.num}>Compra</th>
                {porDeposito ? <th>Orígenes</th> : null}
                <th className={styles.num}>Valor ref.</th>
              </tr>
            </thead>
            <tbody>
              {(actual?.filas ?? []).map((f) => (
                <tr key={f.clave} title={f.advertencias.join(" ")}>
                  <td>{f.codigo}</td>
                  <td className={styles.desc} title={f.descripcion}>{f.descripcion}</td>
                  <td>{f.categoria || "—"}</td>
                  {porDeposito ? <td>{f.deposito || "—"}</td> : <td className={styles.num}>{fmtNum(f.destinos)}</td>}
                  <td>{f.unidad || "—"}</td>
                  <td className={styles.num}>{fmtNum(f.disponible)}</td>
                  {porDeposito ? <><td className={styles.num}>{opc(f.minimo)}</td><td className={styles.num}>{opc(f.punto)}</td><td className={styles.num}>{opc(f.maximo)}</td></> : null}
                  <td><span className={[styles.badge, styles[`badge${f.criticidad}`]].join(" ")}>{ETIQUETA_CRITICIDAD[f.criticidad]}</span></td>
                  <td className={styles.num}>{f.sobrestock ? <span className={[styles.badge, styles.badgeSOBRESTOCK].join(" ")}>+{fmtNum(f.exceso)}</span> : "—"}</td>
                  <td className={styles.num}>{conMeta(f.sugerida, f)}</td>
                  <td className={styles.num}>{f.necesita ? fmtNum(f.transferencia) : "—"}</td>
                  <td className={styles.num}>{f.necesita ? conMeta(f.compra, f) : "—"}</td>
                  {porDeposito ? <td className={styles.desc} title={f.origenes}>{f.origenes || "—"}</td> : null}
                  <td className={styles.num}>{f.valorReferencia === null ? (f.destinosSinCosto > 0 ? "Sin costo" : "—") : fmtDinero(f.valorReferencia)}</td>
                </tr>
              ))}
            </tbody>
            {actual && t && actual.filas.length > 0 ? (
              <tfoot>
                <tr>
                  <td colSpan={colsFijas}>TOTAL GENERAL (alertas; las cantidades no se suman entre productos)</td>
                  {porDeposito ? <td /> : <><td className={styles.num}>{fmtNum(t.destinos)}</td><td /></>}
                  <td className={styles.num}>n/a</td>
                  {porDeposito ? <><td /><td /><td /></> : null}
                  <td>{fmtNum(t.necesitan)} alerta(s)</td>
                  <td className={styles.num}>n/a</td><td className={styles.num}>n/a</td><td className={styles.num}>n/a</td><td className={styles.num}>n/a</td>
                  {porDeposito ? <td /> : null}
                  <td className={styles.num}>{fmtDinero(t.valorReferencia)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        {actual && actual.filas.length === 0 && !cargando ? (
          <div className={styles.empty}>
            <strong>No se encontraron resultados.</strong>
            <span>{hayFiltros || filtros.situacion !== "ALERTAS" ? "Modifique los filtros aplicados." : "No hay productos con necesidad de reposición según los parámetros configurados."}</span>
          </div>
        ) : null}
        {!actual && cargando ? <div className={styles.empty}><strong>Cargando reporte...</strong></div> : null}
        {!actual && !cargando && error ? <div className={styles.empty}><strong>No se pudo generar el reporte</strong><span>Use «Reintentar» para volver a consultar con los mismos filtros.</span></div> : null}

        <footer className={styles.pagination}>
          <span>
            Mostrando {total === 0 ? 0 : (pagina - 1) * tamano + 1}–{Math.min(pagina * tamano, total)} de {fmtNum(total)}
          </span>
          <div>
            <button type="button" disabled={pagina === 1 || cargando} onClick={() => setPagina((p) => p - 1)}>‹</button>
            <strong>{pagina} / {paginas}</strong>
            <button type="button" disabled={pagina >= paginas || cargando || !actual} onClick={() => setPagina((p) => p + 1)}>›</button>
          </div>
        </footer>

        <ul className={styles.notes}>
          {t && t.referencias > 0 ? <li>{fmtNum(t.referencias)} producto(s) del recorte filtrado tienen un total consolidado que se omite por ser solo referencia (tienen parámetros por depósito).</li> : null}
          {(actual?.cobertura ?? []).map((n) => <li key={n}>{n}</li>)}
        </ul>
      </section>
    </section>
  );
}
