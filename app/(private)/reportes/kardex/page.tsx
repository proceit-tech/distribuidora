"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";

import { cargarKardex, descargarKardex } from "@/lib/reportes/cliente-kardex";
import { textoCambioEstado, textoEstadoMov, textoTipo, textoVinculo } from "@/lib/reportes/export-kardex";
import { fmtDinero, fmtNum } from "@/lib/reportes/formato";
import type { KardexFiltros, KardexFila, KardexRespuesta, KardexResumenFila } from "@/types/reportes";

import styles from "./page.module.css";

const FILTROS_VACIOS: KardexFiltros = {
  vista: "DETALLE", q: "", depositoId: "", tipo: "", usuarioId: "", documento: "", estado: "", estadoStock: "", lote: "", desde: "", hasta: "",
};

const sgn = (v: number) => (v > 0 ? `+${fmtNum(v)}` : v < 0 ? `−${fmtNum(-v)}` : "0");

export default function ReporteKardexPage() {
  const [filtros, setFiltros] = useState<KardexFiltros>(FILTROS_VACIOS);
  const [aplicados, setAplicados] = useState<KardexFiltros>(FILTROS_VACIOS);
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<KardexRespuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [exportando, setExportando] = useState("");
  const [abierta, setAbierta] = useState("");

  // Texto: se aplica con una pequeña espera; selectores y fechas, de inmediato.
  useEffect(() => {
    const t = setTimeout(() => {
      setAplicados((a) => (a.q === filtros.q && a.documento === filtros.documento && a.lote === filtros.lote ? a : { ...a, q: filtros.q, documento: filtros.documento, lote: filtros.lote }));
    }, 300);
    return () => clearTimeout(t);
  }, [filtros.q, filtros.documento, filtros.lote]);

  useEffect(() => {
    setAplicados((a) => ({ ...filtros, q: a.q, documento: a.documento, lote: a.lote }));
  }, [filtros.vista, filtros.depositoId, filtros.tipo, filtros.usuarioId, filtros.estado, filtros.estadoStock, filtros.desde, filtros.hasta]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError("");
    cargarKardex(aplicados, pagina)
      .then((r) => { if (activo) setDatos(r); })
      .catch((e: unknown) => { if (activo) setError(e instanceof Error ? e.message : "No fue posible generar el reporte."); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [aplicados, pagina]);

  const cambiar = (parcial: Partial<KardexFiltros>) => {
    setPagina(1);
    setAbierta("");
    setFiltros((f) => ({ ...f, ...parcial }));
  };

  const exportar = async (formato: "xlsx" | "pdf") => {
    setExportando(formato);
    setError("");
    try {
      await descargarKardex(aplicados, formato);
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
  const cc = datos?.conciliacion;

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <div className={styles.heroMeta}>
            <span className={styles.modulePill}>REPORTES</span>
          </div>
          <h1>Kardex de movimientos</h1>
          <p>
            Libro de movimientos con saldo acumulado por producto, depósito y lote.
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
          <span>SALDO INICIAL (FÍSICO)</span>
          <strong>{t ? fmtNum(t.saldoInicial.fisico) : "—"}</strong>
          <small>Antes del período{filtros.desde ? ` (${filtros.desde})` : ""}</small>
        </article>
        <article className={[styles.summaryCard, styles.summaryBlue].join(" ")}>
          <span>ENTRADAS / SALIDAS</span>
          <strong>{t ? `${fmtNum(t.entradas)} / ${fmtNum(t.salidas)}` : "—"}</strong>
          <small>Sin transferencias · {t ? fmtNum(t.anulaciones) : "—"} anulaciones</small>
        </article>
        <article className={[styles.summaryCard, styles.summaryAmber].join(" ")}>
          <span>TRANSFERENCIAS</span>
          <strong>{t ? `${fmtNum(t.transfEntradas)} / ${fmtNum(t.transfSalidas)}` : "—"}</strong>
          <small>Entrada / salida · se compensan en el consolidado</small>
        </article>
        <article className={[styles.summaryCard, styles.summaryPurple].join(" ")}>
          <span>SALDO FINAL (FÍSICO)</span>
          <strong>{t ? fmtNum(t.saldoFinal.fisico) : "—"}</strong>
          <small>{t ? `Disp. ${fmtNum(t.saldoFinal.disponible)} · Res. ${fmtNum(t.saldoFinal.reservado)} · Cuar. ${fmtNum(t.saldoFinal.cuarentena)}` : "—"}</small>
        </article>
        <article className={[styles.summaryCard, cc && !cc.conciliado ? styles.summaryRed : styles.summaryTeal].join(" ")}>
          <span>CONCILIACIÓN CON STOCK</span>
          <strong>{cc ? (cc.conciliado ? "Conciliado" : "Con diferencias") : "—"}</strong>
          <small>{cc ? `${fmtNum(cc.divergentes)} de ${fmtNum(cc.combinaciones)} combinaciones` : "—"}</small>
        </article>
      </section>

      <section className={styles.contentCard}>
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
            <button type="button" aria-pressed={filtros.vista === "DETALLE"} onClick={() => cambiar({ vista: "DETALLE" })}>Detalle</button>
            <button type="button" aria-pressed={filtros.vista === "RESUMEN"} onClick={() => cambiar({ vista: "RESUMEN" })}>Resumen por lote</button>
          </div>

          <span className={styles.resultCount}>{cargando ? "Cargando..." : `${fmtNum(total)} ${detalle ? "movimientos" : "combinaciones"}`}</span>
        </div>

        <div className={styles.filters}>
          <label>
            <span>Desde (registro)</span>
            <input type="date" value={filtros.desde} max={filtros.hasta || undefined} onChange={(e) => cambiar({ desde: e.target.value })} />
          </label>
          <label>
            <span>Hasta (registro)</span>
            <input type="date" value={filtros.hasta} min={filtros.desde || undefined} onChange={(e) => cambiar({ hasta: e.target.value })} />
          </label>
          <label>
            <span>Depósito</span>
            <select value={filtros.depositoId} onChange={(e) => cambiar({ depositoId: e.target.value })}>
              <option value="">Todos</option>
              {(datos?.catalogos.depositos ?? []).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </label>
          <label>
            <span>Tipo</span>
            <select value={filtros.tipo} onChange={(e) => cambiar({ tipo: e.target.value })}>
              <option value="">Todos</option>
              {(datos?.catalogos.tipos ?? []).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </label>
          <label>
            <span>Estado del movimiento</span>
            <select value={filtros.estado} onChange={(e) => cambiar({ estado: e.target.value as KardexFiltros["estado"] })}>
              <option value="">Todos</option>
              <option value="REGISTRADO">Registrado</option>
              <option value="ANULADO">Anulado</option>
            </select>
          </label>
          <label>
            <span>Estado de stock afectado</span>
            <select value={filtros.estadoStock} onChange={(e) => cambiar({ estadoStock: e.target.value as KardexFiltros["estadoStock"] })}>
              <option value="">Todos</option>
              <option value="DISPONIBLE">Disponible</option>
              <option value="RESERVADO">Reservado</option>
              <option value="CUARENTENA">Cuarentena</option>
            </select>
          </label>
          <label>
            <span>Usuario</span>
            <select value={filtros.usuarioId} onChange={(e) => cambiar({ usuarioId: e.target.value })}>
              <option value="">Todos</option>
              {(datos?.catalogos.usuarios ?? []).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </label>
          <label>
            <span>Documento / Nº movimiento</span>
            <input type="text" value={filtros.documento} onChange={(e) => cambiar({ documento: e.target.value })} placeholder="Documento o MOV-..." />
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

        {cc && !cc.conciliado ? (
          <div className={styles.alertBox}>
            El libro de movimientos no coincide con los saldos de Stock en {fmtNum(cc.divergentes)} de {fmtNum(cc.combinaciones)} combinaciones producto × depósito × lote
            (stock cargado fuera del libro de movimientos). Los saldos acumulados de esas combinaciones no son confiables.
          </div>
        ) : cc && cc.combinaciones > 0 ? (
          <div className={styles.okBox}>Libro de movimientos conciliado con Stock en {fmtNum(cc.combinaciones)} combinaciones producto × depósito × lote.</div>
        ) : null}
        {t?.filtrosDeFila ? (
          <div className={styles.okBox}>Con filtros de tipo, usuario, documento o estado, los saldos son los reales del libro y los totales de movimientos suman solo las filas filtradas.</div>
        ) : null}
        {error ? <div className={styles.errorBox}>{error}</div> : null}

        <div className={styles.tableWrap}>
          {detalle ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Fecha y hora</th><th>Movimiento</th><th>Tipo · origen</th><th>Estado</th><th>Documento</th><th>Producto</th><th>Depósito</th><th>Lote</th>
                  <th className={styles.num}>Entrada</th><th className={styles.num}>Salida</th><th>Cambio de estado</th>
                  <th className={styles.num}>Saldo físico</th><th className={styles.num}>Disponible</th><th className={styles.num}>Reservado</th><th className={styles.num}>Cuarentena</th>
                  <th className={styles.num}>Costo unit.</th><th className={styles.num}>Costo total</th><th>Usuario</th><th>Vinculado</th><th />
                </tr>
              </thead>
              <tbody>
                {(datos?.filas ?? []).map((f: KardexFila) => (
                  <Fragment key={f.clave}>
                    <tr>
                      <td>{f.fechaRegistro} {f.horaRegistro.slice(0, 5)}{f.retroactivo ? <span className={styles.muted}> · mov. {f.fechaMovimiento}</span> : null}</td>
                      <td>{f.numero}</td>
                      <td>{textoTipo(f)}</td>
                      <td><span className={[styles.badge, styles[`badge${f.estado}`]].join(" ")}>{textoEstadoMov(f.estado)}</span></td>
                      <td>{f.documento || "—"}</td>
                      <td className={styles.desc} title={f.productoDescripcion}>{f.productoCodigo} · {f.productoDescripcion}</td>
                      <td>{f.deposito}{f.contraparte ? <span className={styles.muted}> ({f.efecto === "ENTRADA" ? "desde" : "hacia"} {f.contraparte})</span> : null}</td>
                      <td>{f.lote || "—"}</td>
                      <td className={[styles.num, styles.pos].join(" ")}>{f.entrada ? fmtNum(f.entrada) : ""}</td>
                      <td className={[styles.num, styles.neg].join(" ")}>{f.salida ? fmtNum(f.salida) : ""}</td>
                      <td>{textoCambioEstado(f) || ""}</td>
                      <td className={styles.num}><strong>{fmtNum(f.saldoFisico)}</strong></td>
                      <td className={styles.num}>{fmtNum(f.saldoDisponible)}</td>
                      <td className={styles.num}>{fmtNum(f.saldoReservado)}</td>
                      <td className={styles.num}>{fmtNum(f.saldoCuarentena)}</td>
                      <td className={styles.num}>{fmtDinero(f.costoUnitario)}</td>
                      <td className={styles.num}>{fmtDinero(f.costoTotal)}</td>
                      <td>{f.usuario || "—"}</td>
                      <td>{textoVinculo(f) || "—"}</td>
                      <td><button type="button" className={styles.rowToggle} aria-expanded={abierta === f.clave} onClick={() => setAbierta(abierta === f.clave ? "" : f.clave)}>{abierta === f.clave ? "Ocultar" : "Ver"}</button></td>
                    </tr>
                    {abierta === f.clave ? (
                      <tr className={styles.detailRow}>
                        <td colSpan={20}>
                          <strong>{f.numero}</strong> · {textoTipo(f)} · registrado {f.fechaRegistro} {f.horaRegistro} (fecha del movimiento {f.fechaMovimiento}) por {f.usuario || "—"}.
                          {" "}Producto {f.productoCodigo} · {f.productoDescripcion}; depósito {f.deposito}{f.lote ? `; lote ${f.lote}` : ""}.
                          {" "}Efecto: disponible {sgn(f.dDisponible)}, reservado {sgn(f.dReservado)}, cuarentena {sgn(f.dCuarentena)}.
                          {" "}Motivo: {f.motivo || "—"}. Observación: {f.observacion || "—"}. Documento: {f.documento || "—"}.
                          {f.costoTotal !== null ? ` Costo registrado: ${fmtDinero(f.costoUnitario)} por unidad, ${fmtDinero(f.costoTotal)} en total (${f.moneda}).` : " Sin costo registrado en este movimiento."}
                          {textoVinculo(f) ? ` ${textoVinculo(f)}.` : ""}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
              {datos && t && (datos.filas.length > 0 || t.saldoInicial.fisico !== 0 || t.saldoFinal.fisico !== 0) ? (
                <tfoot>
                  <tr>
                    <td colSpan={8}>SALDO INICIAL (antes del período)</td><td /><td /><td />
                    <td className={styles.num}>{fmtNum(t.saldoInicial.fisico)}</td><td className={styles.num}>{fmtNum(t.saldoInicial.disponible)}</td>
                    <td className={styles.num}>{fmtNum(t.saldoInicial.reservado)}</td><td className={styles.num}>{fmtNum(t.saldoInicial.cuarentena)}</td><td colSpan={5} />
                  </tr>
                  <tr>
                    <td colSpan={8}>TOTAL MOVIMIENTOS (sin transferencias; todo el filtro)</td>
                    <td className={styles.num}>{fmtNum(t.entradas)}</td><td className={styles.num}>{fmtNum(t.salidas)}</td><td colSpan={9} />
                  </tr>
                  <tr>
                    <td colSpan={8}>TRANSFERENCIAS (entrada / salida; se compensan en el consolidado)</td>
                    <td className={styles.num}>{fmtNum(t.transfEntradas)}</td><td className={styles.num}>{fmtNum(t.transfSalidas)}</td><td colSpan={9} />
                  </tr>
                  <tr>
                    <td colSpan={8}>SALDO FINAL</td><td /><td /><td />
                    <td className={styles.num}>{fmtNum(t.saldoFinal.fisico)}</td><td className={styles.num}>{fmtNum(t.saldoFinal.disponible)}</td>
                    <td className={styles.num}>{fmtNum(t.saldoFinal.reservado)}</td><td className={styles.num}>{fmtNum(t.saldoFinal.cuarentena)}</td><td colSpan={5} />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Código</th><th>Producto</th><th>Depósito</th><th>Lote</th>
                  <th className={styles.num}>Saldo inicial</th><th className={styles.num}>Entradas</th><th className={styles.num}>Salidas</th>
                  <th className={styles.num}>Transf. entrada</th><th className={styles.num}>Transf. salida</th><th className={styles.num}>Saldo final</th>
                  <th className={styles.num}>Disponible</th><th className={styles.num}>Reservado</th><th className={styles.num}>Cuarentena</th>
                </tr>
              </thead>
              <tbody>
                {(datos?.resumen ?? []).map((f: KardexResumenFila) => (
                  <tr key={f.clave}>
                    <td>{f.productoCodigo}</td><td className={styles.desc} title={f.productoDescripcion}>{f.productoDescripcion}</td><td>{f.deposito}</td><td>{f.lote || "—"}</td>
                    <td className={styles.num}>{fmtNum(f.saldoInicial)}</td><td className={styles.num}>{fmtNum(f.entradas)}</td><td className={styles.num}>{fmtNum(f.salidas)}</td>
                    <td className={styles.num}>{fmtNum(f.transfEntradas)}</td><td className={styles.num}>{fmtNum(f.transfSalidas)}</td>
                    <td className={styles.num}><strong>{fmtNum(f.saldoFinal)}</strong></td>
                    <td className={styles.num}>{fmtNum(f.finalDisponible)}</td><td className={styles.num}>{fmtNum(f.finalReservado)}</td><td className={styles.num}>{fmtNum(f.finalCuarentena)}</td>
                  </tr>
                ))}
              </tbody>
              {datos && t && datos.resumen.length > 0 ? (
                <tfoot>
                  <tr>
                    <td colSpan={4}>TOTAL (todo el filtro)</td>
                    <td className={styles.num}>{fmtNum(t.saldoInicial.fisico)}</td><td className={styles.num}>{fmtNum(t.entradas)}</td><td className={styles.num}>{fmtNum(t.salidas)}</td>
                    <td className={styles.num}>{fmtNum(t.transfEntradas)}</td><td className={styles.num}>{fmtNum(t.transfSalidas)}</td>
                    <td className={styles.num}>{fmtNum(t.saldoFinal.fisico)}</td>
                    <td className={styles.num}>{fmtNum(t.saldoFinal.disponible)}</td><td className={styles.num}>{fmtNum(t.saldoFinal.reservado)}</td><td className={styles.num}>{fmtNum(t.saldoFinal.cuarentena)}</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          )}
        </div>

        {datos && total === 0 && !cargando ? (
          <div className={styles.empty}>
            <strong>No se encontraron movimientos.</strong>
            <span>{hayFiltros ? "Modifique los filtros aplicados." : "Aún no hay movimientos de inventario."}</span>
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
          {(datos?.cobertura ?? []).map((n) => <li key={n}>{n}</li>)}
        </ul>
      </section>
    </section>
  );
}
