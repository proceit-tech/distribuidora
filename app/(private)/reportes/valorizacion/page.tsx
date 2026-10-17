"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { crearCompuerta } from "@/lib/productos/catalogos-carga";
import { descargarValorizacion, pedirValorizacion } from "@/lib/reportes/cliente-valorizacion";
import { SITUACION_COSTO } from "@/lib/reportes/export-valorizacion";
import { fmtCantidadTexto, fmtDinero, fmtNum } from "@/lib/reportes/formato";
import { filtrosValorizacionIguales, porcentajeCobertura, respuestaValorizacionVigente, totalDivergencias } from "@/lib/reportes/valorizacion-cobertura";
import type { ValorizacionFiltros, ValorizacionFila, ValorizacionRespuestaApi } from "@/types/reportes";

import styles from "@/components/ui/lista-padrao/reporte.module.css";

const FILTROS_VACIOS: ValorizacionFiltros = { vista: "DETALLE", q: "", depositoId: "", categoriaId: "", familiaId: "", existencia: "CON", costo: "TODOS", cobertura: "TODOS" };
const VISTAS: [ValorizacionFiltros["vista"], string][] = [["DETALLE", "Detalle"], ["PRODUCTO", "Por producto"], ["DEPOSITO", "Por depósito"], ["CATEGORIA", "Por categoría"]];

type Catalogos = ValorizacionRespuestaApi["catalogos"];

export default function ReporteValorizacionPage() {
  const [filtros, setFiltros] = useState<ValorizacionFiltros>(FILTROS_VACIOS);
  const [qAplicada, setQAplicada] = useState("");
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<ValorizacionRespuestaApi | null>(null);
  // Los catálogos (solo nombres para los selectores) sobreviven a un error para no perder los filtros elegidos; ningún dato financiero se conserva.
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

  // RPT-V04: la última solicitud iniciada gana; ante cualquier falla se DESCARTAN los datos anteriores (nunca totales viejos como actuales) y se conservan los filtros.
  const cargar = useCallback(async () => {
    const sol = compuerta.current.nueva();

    setCargando(true);
    setError("");

    const r = await pedirValorizacion(aplicados, pagina);

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

  const cambiar = (parcial: Partial<ValorizacionFiltros>) => {
    setPagina(1);
    setFiltros((f) => ({ ...f, ...parcial }));
  };

  // Solo se muestran y exportan datos que corresponden EXACTAMENTE a los filtros y la página vigentes.
  const actual = datos && respuestaValorizacionVigente(datos, error, aplicados, pagina) ? datos : null;
  const puedeExportar = actual?.permisos.exportar === true;
  const exportar = async (formato: "xlsx" | "pdf") => {
    if (!actual || !puedeExportar) return;
    setExportando(formato);
    setErrorExportacion("");
    try {
      await descargarValorizacion(actual.filtros, formato);
    } catch (e) {
      setErrorExportacion(e instanceof Error ? e.message : "No fue posible exportar el reporte.");
    } finally {
      setExportando("");
    }
  };

  const t = actual?.totales;
  const mon = t?.moneda ?? "";
  const total = actual?.pagina.totalFilas ?? 0;
  const tamano = actual?.pagina.tamano ?? 50;
  const paginas = Math.max(1, Math.ceil(total / tamano));
  const vista: ValorizacionFiltros["vista"] = aplicados.vista;
  const hayFiltros = !filtrosValorizacionIguales({ ...filtros, vista: FILTROS_VACIOS.vista }, FILTROS_VACIOS);
  const conProducto = vista === "DETALLE" || vista === "PRODUCTO";
  const conCantidades = conProducto;
  const etiquetaFilas = vista === "DETALLE" ? "filas" : vista === "PRODUCTO" ? "productos" : vista === "DEPOSITO" ? "depósitos" : "categorías";
  const cobertura = t ? porcentajeCobertura(t.conteos) : null;
  const divergencias = t ? totalDivergencias(t.conteos) : 0;
  const colsIdent = vista === "DETALLE" ? 5 : vista === "PRODUCTO" ? 4 : 1;

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <nav className={styles.breadcrumb} aria-label="Ruta de navegación">
            <Link href="/reportes">Reportes</Link>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Valorización de inventario</span>
          </nav>
          <h1>Valorización de inventario</h1>
          <p>
            Valor del inventario a costo real y su cobertura, a hoy.
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
          <span>VALOR TOTAL ({mon || "—"})</span>
          <strong>{t ? fmtDinero(t.valorTotal) : "—"}</strong>
          <small>{t ? `${fmtNum(t.productosConCosto)} producto(s) con costo · solo costo real` : "—"}</small>
        </article>
        <article className={[styles.summaryCard, styles.summaryBlue].join(" ")}>
          <span>COBERTURA DE COSTO</span>
          <strong>{t ? (cobertura ? `${cobertura} %` : "—") : "—"}</strong>
          <small>{t ? `${fmtNum(t.conteos.CON_COSTO)} de ${fmtNum(t.conteos.CON_COSTO + divergencias)} pares producto × depósito con costo completo` : "—"}</small>
        </article>
        <article className={[styles.summaryCard, styles.summaryRed].join(" ")}>
          <span>DIVERGENCIAS</span>
          <strong>{t ? fmtNum(divergencias) : "—"}</strong>
          <small>
            {t ? `Sin costo ${fmtNum(t.conteos.SIN_COSTO)} · Parcial ${fmtNum(t.conteos.PARCIAL)} · Excedente ${fmtNum(t.conteos.EXCEDENTE)} · Valor sin cantidad ${fmtNum(t.conteos.RESIDUO)}` : "—"}
          </small>
        </article>
        <article className={[styles.summaryCard, styles.summaryAmber].join(" ")}>
          <span>ALCANCE</span>
          <strong>{t ? `${fmtNum(t.depositos)} depósito(s)` : "—"}</strong>
          <small>
            {t ? (t.inactivos.filas > 0 ? `Incluye ${fmtNum(t.inactivos.filas)} par(es) de depósitos inactivos por ${fmtDinero(t.inactivos.valor)} ${mon}` : `${fmtNum(t.productos)} producto(s) · foto de hoy`) : "—"}
          </small>
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

          <span className={styles.resultCount}>{cargando ? "Cargando..." : actual ? `${fmtNum(total)} ${etiquetaFilas}` : ""}</span>
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
            <span>Familia</span>
            <select value={filtros.familiaId} onChange={(e) => cambiar({ familiaId: e.target.value })}>
              <option value="">Todas</option>
              {(catalogos?.familias ?? []).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
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
            <span>Cobertura</span>
            <select value={filtros.cobertura} onChange={(e) => cambiar({ cobertura: e.target.value as ValorizacionFiltros["cobertura"] })}>
              <option value="TODOS">Todas</option>
              <option value="DIVERGENCIAS">Solo divergencias</option>
              <option value="SIN_COSTO">Sin costo</option>
              <option value="PARCIAL">Parcial</option>
              <option value="EXCEDENTE">Excedente valorizado</option>
              <option value="RESIDUO">Valor sin cantidad</option>
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
                {conProducto ? <><th>Código</th><th>Producto</th><th>Categoría</th>{vista === "PRODUCTO" ? <th>Familia</th> : <th>Depósito</th>}</> : null}
                {vista === "DETALLE" ? <th>Un.</th> : null}
                {vista === "PRODUCTO" ? <><th>Un.</th><th className={styles.num}>Depósitos</th></> : null}
                {vista === "CATEGORIA" ? <th>Categoría</th> : null}
                {vista === "DEPOSITO" ? <th>Depósito</th> : null}
                {vista === "DEPOSITO" || vista === "CATEGORIA" ? <th className={styles.num}>Productos</th> : null}
                {vista === "CATEGORIA" ? <th className={styles.num}>Depósitos</th> : null}
                {conCantidades ? <><th className={styles.num}>Físico propio</th><th className={styles.num}>Valorizada</th><th className={styles.num}>Sin valorizar</th><th className={styles.num}>Excedente</th><th className={styles.num}>Costo unit.</th></> : null}
                <th className={styles.num}>Valor total</th>
                {conProducto ? <th>Cobertura</th> : <><th className={styles.num}>Con costo</th><th className={styles.num}>Parcial</th><th className={styles.num}>Sin costo</th><th className={styles.num}>Excedente</th><th className={styles.num}>Valor s/ cant.</th></>}
              </tr>
            </thead>
            <tbody>
              {(actual?.filas ?? []).map((f: ValorizacionFila) => (
                <tr key={f.clave}>
                  {conProducto ? <><td>{f.codigo}</td><td className={styles.desc} title={f.descripcion}>{f.descripcion}</td><td>{f.categoria || "—"}</td>{vista === "PRODUCTO" ? <td>{f.familia || "—"}</td> : <td>{f.deposito}{f.depositoInactivo ? " (inactivo)" : ""}</td>}</> : null}
                  {conProducto ? <td>{f.unidad || "—"}</td> : null}
                  {vista === "PRODUCTO" ? <td className={styles.num}>{fmtNum(f.depositos)}</td> : null}
                  {vista === "CATEGORIA" ? <td className={styles.desc}>{f.categoria}</td> : null}
                  {vista === "DEPOSITO" ? <td className={styles.desc}>{f.deposito}{f.depositoInactivo ? " (inactivo)" : ""}</td> : null}
                  {vista === "DEPOSITO" || vista === "CATEGORIA" ? <td className={styles.num}>{fmtNum(f.productos)}</td> : null}
                  {vista === "CATEGORIA" ? <td className={styles.num}>{fmtNum(f.depositos)}</td> : null}
                  {conCantidades ? <><td className={styles.num}>{fmtCantidadTexto(f.fisico)}</td><td className={styles.num}>{fmtCantidadTexto(f.cantidadValorizada)}</td><td className={styles.num}>{fmtCantidadTexto(f.sinValorizar)}</td><td className={styles.num}>{fmtCantidadTexto(f.excedente)}</td><td className={styles.num}>{fmtDinero(f.costoPromedio)}</td></> : null}
                  <td className={styles.num}>{fmtDinero(f.valorTotal)}</td>
                  {conProducto ? (
                    <td>
                      <span className={[styles.badge, styles[`badge${f.situacionCosto}`]].join(" ")}>{SITUACION_COSTO[f.situacionCosto]}</span>
                      {vista === "PRODUCTO" && totalDivergencias(f.conteos) > 0 ? <small> · {fmtNum(totalDivergencias(f.conteos))} par(es)</small> : null}
                    </td>
                  ) : (
                    <><td className={styles.num}>{fmtNum(f.conteos.CON_COSTO)}</td><td className={styles.num}>{fmtNum(f.conteos.PARCIAL)}</td><td className={styles.num}>{fmtNum(f.conteos.SIN_COSTO)}</td><td className={styles.num}>{fmtNum(f.conteos.EXCEDENTE)}</td><td className={styles.num}>{fmtNum(f.conteos.RESIDUO)}</td></>
                  )}
                </tr>
              ))}
            </tbody>
            {actual && t && actual.filas.length > 0 ? (
              <tfoot>
                <tr>
                  <td colSpan={colsIdent}>TOTAL GENERAL (todos los resultados del filtro)</td>
                  {vista === "PRODUCTO" ? <><td /><td className={styles.num}>{fmtNum(t.depositos)}</td></> : null}
                  {vista === "DEPOSITO" || vista === "CATEGORIA" ? <td className={styles.num}>{fmtNum(t.productos)}</td> : null}
                  {vista === "CATEGORIA" ? <td className={styles.num}>{fmtNum(t.depositos)}</td> : null}
                  {conCantidades ? <><td className={styles.num}>n/a</td><td className={styles.num}>n/a</td><td className={styles.num}>n/a</td><td className={styles.num}>n/a</td><td className={styles.num}>n/a</td></> : null}
                  <td className={styles.num}>{fmtDinero(t.valorTotal)}</td>
                  {conProducto ? <td>{fmtNum(divergencias)} divergencia(s)</td> : (
                    <><td className={styles.num}>{fmtNum(t.conteos.CON_COSTO)}</td><td className={styles.num}>{fmtNum(t.conteos.PARCIAL)}</td><td className={styles.num}>{fmtNum(t.conteos.SIN_COSTO)}</td><td className={styles.num}>{fmtNum(t.conteos.EXCEDENTE)}</td><td className={styles.num}>{fmtNum(t.conteos.RESIDUO)}</td></>
                  )}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        {actual && actual.filas.length === 0 && !cargando ? (
          <div className={styles.empty}>
            <strong>No se encontraron resultados.</strong>
            <span>{hayFiltros ? "Modifique los filtros aplicados." : "Aún no hay inventario para valorizar."}</span>
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
          {t && divergencias > 0 ? <li>Divergencias sin compensar: {fmtNum(t.conteos.SIN_COSTO)} sin costo (valor {fmtDinero(t.valorPorSituacion.SIN_COSTO)}), {fmtNum(t.conteos.PARCIAL)} parciales (valor {fmtDinero(t.valorPorSituacion.PARCIAL)}), {fmtNum(t.conteos.EXCEDENTE)} con excedente valorizado (valor {fmtDinero(t.valorPorSituacion.EXCEDENTE)}), {fmtNum(t.conteos.RESIDUO)} con valor sin cantidad (valor {fmtDinero(t.valorPorSituacion.RESIDUO)}). El reporte las detecta; no corrige costos ni saldos.</li> : null}
          {(actual?.cobertura ?? []).map((n) => <li key={n}>{n}</li>)}
        </ul>
      </section>
    </section>
  );
}
