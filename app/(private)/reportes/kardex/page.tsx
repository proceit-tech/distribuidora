"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { crearCompuerta } from "@/lib/productos/catalogos-carga";
import { descargarKardex, pedirKardex } from "@/lib/reportes/cliente-kardex";
import { sgDecimal, textoCambioEstado, textoDeposito, textoEstadoMov, textoPropiedadFila, textoTipo, textoVinculo } from "@/lib/reportes/export-kardex";
import { fmtCantidadTexto, fmtImporteMoneda, fmtNum } from "@/lib/reportes/formato";
import { esCeroDecimal, etiquetaGrupo, etiquetasUnidad, filtrosKardexIguales, netoMovimientos, nombreUnidad, respuestaKardexVigente } from "@/lib/reportes/kardex-plan";
import type { KardexFiltros, KardexFila, KardexGrupo, KardexRespuestaApi, KardexResumenFila } from "@/types/reportes";

import styles from "@/components/ui/lista-padrao/reporte.module.css";

const FILTROS_VACIOS: KardexFiltros = {
  vista: "DETALLE", q: "", depositoId: "", tipo: "", usuarioId: "", documento: "", estado: "", estadoStock: "", lote: "", desde: "", hasta: "",
};

type Catalogos = KardexRespuestaApi["catalogos"];
const cant = fmtCantidadTexto;

export default function ReporteKardexPage() {
  const [filtros, setFiltros] = useState<KardexFiltros>(FILTROS_VACIOS);
  const [textoAplicado, setTextoAplicado] = useState({ q: "", documento: "", lote: "" });
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<KardexRespuestaApi | null>(null);
  // Solo los nombres de los selectores sobreviven a un error (conservan los filtros elegidos); ningún dato del informe se conserva.
  const [catalogos, setCatalogos] = useState<Catalogos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [errorExportacion, setErrorExportacion] = useState("");
  const [exportando, setExportando] = useState("");
  const [abierta, setAbierta] = useState("");
  const compuerta = useRef(crearCompuerta());

  // Los campos de texto se aplican con una pequeña espera; selectores y fechas, de inmediato.
  useEffect(() => {
    const t = setTimeout(() => setTextoAplicado({ q: filtros.q, documento: filtros.documento, lote: filtros.lote }), 300);

    return () => clearTimeout(t);
  }, [filtros.q, filtros.documento, filtros.lote]);

  const aplicados = useMemo(() => ({ ...filtros, ...textoAplicado }), [filtros, textoAplicado]);

  // La última solicitud iniciada gana; ante cualquier falla se descartan los datos anteriores y se conservan los filtros.
  const cargar = useCallback(async () => {
    const sol = compuerta.current.nueva();

    setCargando(true);
    setError("");

    const r = await pedirKardex(aplicados, pagina);

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

  const cambiar = (parcial: Partial<KardexFiltros>) => {
    setPagina(1);
    setAbierta("");
    setFiltros((f) => ({ ...f, ...parcial }));
  };

  // Solo se muestran y exportan datos que corresponden EXACTAMENTE a los filtros y la página vigentes.
  const actual = datos && respuestaKardexVigente(datos, error, aplicados, pagina) ? datos : null;
  const puedeExportar = actual?.permisos.exportar === true;
  const exportar = async (formato: "xlsx" | "pdf") => {
    if (!actual || !puedeExportar) return;
    setExportando(formato);
    setErrorExportacion("");
    try {
      await descargarKardex(actual.filtros, formato);
    } catch (e) {
      setErrorExportacion(e instanceof Error ? e.message : "No fue posible exportar el reporte.");
    } finally {
      setExportando("");
    }
  };

  const t = actual?.totales;
  // Rótulo de cada unidad según TODOS los grupos de la respuesta vigente (no solo las filas de la página).
  const et = useMemo(() => etiquetasUnidad(actual?.totales.grupos ?? []), [actual]);
  const total = actual?.pagina.totalFilas ?? 0;
  const tamano = actual?.pagina.tamano ?? 50;
  const paginas = Math.max(1, Math.ceil(total / tamano));
  const detalle = aplicados.vista === "DETALLE";
  const hayFiltros = !filtrosKardexIguales({ ...filtros, vista: FILTROS_VACIOS.vista }, FILTROS_VACIOS);
  const cc = actual?.conciliacion;
  const fl = t?.filtrosDeFila === true;
  const depositos = catalogos?.depositos ?? [];
  // PRO-335: importe visual en la moneda de la línea; el costo unitario exacto registrado queda visible en el título y en el detalle expandido.
  const costo = (f: KardexFila) => (f.costoUnitario === null ? "—" : `${fmtImporteMoneda(f.costoUnitario, f.moneda)} ${f.moneda}`.trim());
  const costoExacto = (f: KardexFila) => (f.costoUnitario === null ? undefined : `Costo unitario exacto: ${fmtCantidadTexto(f.costoUnitario)} ${f.moneda}`.trim());
  const costoTotal = (f: KardexFila) => (f.costoTotal === null ? "—" : `${fmtImporteMoneda(f.costoTotal, f.moneda)} ${f.moneda}`.trim());

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <nav className={styles.breadcrumb} aria-label="Ruta de navegación">
            <Link href="/reportes">Reportes</Link>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Kardex de movimientos</span>
          </nav>
          <h1>Kardex de movimientos</h1>
          <p>
            Libro de movimientos con saldo acumulado por producto, depósito y lote (stock propio y de terceros por separado).
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
          <span>MOVIMIENTOS DEL FILTRO</span>
          <strong>{t ? fmtNum(t.filas) : "—"}</strong>
          <small>{t ? `${fmtNum(t.grupos.length)} grupo(s) por unidad y propiedad` : "Según los filtros activos"}</small>
        </article>
        <article className={[styles.summaryCard, styles.summaryBlue].join(" ")}>
          <span>UNIDADES Y PROPIEDAD</span>
          <strong>{t ? fmtNum(t.grupos.length) : "—"}</strong>
          <small>Las cantidades se suman solo dentro de cada grupo (ver totales)</small>
        </article>
        <article className={[styles.summaryCard, t && !t.cuadra ? styles.summaryRed : styles.summaryPurple].join(" ")}>
          <span>CUADRE DEL LIBRO</span>
          <strong>{t ? (t.cuadra ? "Cuadra" : "No cuadra") : "—"}</strong>
          <small>Saldo inicial + movimientos = saldo final (exacto)</small>
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
              {depositos.map((d) => <option key={d.id} value={d.id}>{d.nombre}{d.activo ? "" : " (inactivo)"}</option>)}
            </select>
          </label>
          <label>
            <span>Tipo</span>
            <select value={filtros.tipo} onChange={(e) => cambiar({ tipo: e.target.value })}>
              <option value="">Todos</option>
              {(catalogos?.tipos ?? []).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
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
              {(catalogos?.usuarios ?? []).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
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

        {t && t.grupos.length > 0 ? (
          <details className={styles.policyNote} open>
            <summary><strong>Totales por unidad de medida y propiedad</strong> (sin mezclar unidades ni propietarios; sin total general)</summary>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Unidad · propiedad</th><th className={styles.num}>Saldo inicial</th>
                    <th className={styles.num}>{fl ? "Entradas filtradas" : "Entradas"}</th><th className={styles.num}>{fl ? "Salidas filtradas" : "Salidas"}</th>
                    <th className={styles.num}>{fl ? "Transf. entrada filtrada" : "Transf. entrada"}</th><th className={styles.num}>{fl ? "Transf. salida filtrada" : "Transf. salida"}</th>
                    {fl ? <th className={styles.num}>Fuera del filtro (neto)</th> : null}
                    <th className={styles.num}>Saldo final</th><th className={styles.num}>Disponible</th><th className={styles.num}>Reservado</th><th className={styles.num}>Cuarentena</th>
                  </tr>
                </thead>
                <tbody>
                  {t.grupos.map((g: KardexGrupo) => {
                    const r = detalle ? null : g.resumen;

                    return (
                      <tr key={g.clave}>
                        <td>{etiquetaGrupo(g, et)}{g.cuadra ? "" : " · NO CUADRA"}</td>
                        <td className={styles.num}>{cant(r ? r.saldoInicial : g.saldoInicial.fisico)}</td>
                        <td className={styles.num}>{cant(r ? r.entradas : g.filtrado.entradas)}</td><td className={styles.num}>{cant(r ? r.salidas : g.filtrado.salidas)}</td>
                        <td className={styles.num}>{cant(r ? r.transfEntradas : g.filtrado.transfEntradas)}</td><td className={styles.num}>{cant(r ? r.transfSalidas : g.filtrado.transfSalidas)}</td>
                        {fl ? <td className={styles.num}>{sgDecimal(r ? r.fueraDelFiltro : netoMovimientos(g.fueraDelFiltro))}</td> : null}
                        <td className={styles.num}><strong>{cant(r ? r.saldoFinal : g.saldoFinal.fisico)}</strong></td>
                        <td className={styles.num}>{cant(r ? r.finalDisponible : g.saldoFinal.disponible)}</td>
                        <td className={styles.num}>{cant(r ? r.finalReservado : g.saldoFinal.reservado)}</td>
                        <td className={styles.num}>{cant(r ? r.finalCuarentena : g.saldoFinal.cuarentena)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}

        {cc && !cc.conciliado ? (
          <div className={styles.alertBox}>
            El libro de movimientos no coincide con los saldos de Stock en {fmtNum(cc.divergentes)} de {fmtNum(cc.combinaciones)} combinaciones producto × depósito × lote × propiedad
            (stock cargado fuera del libro de movimientos). Los saldos acumulados de esas combinaciones no son confiables.
          </div>
        ) : cc && cc.combinaciones > 0 ? (
          <div className={styles.okBox}>Libro de movimientos conciliado con Stock en {fmtNum(cc.combinaciones)} combinaciones producto × depósito × lote × propiedad.</div>
        ) : null}
        {t && fl ? (
          <div className={styles.okBox}>
            <strong>Totales filtrados ≠ variación del saldo.</strong> Las filas y los totales de movimientos corresponden solo a los filtros de tipo, usuario, documento o estado; los saldos inicial y final son los reales del libro.
            {t.grupos.map((g) => (
              <div key={g.clave}>
                {etiquetaGrupo(g, et)}: saldo inicial {cant(g.saldoInicial.fisico)} + movimientos filtrados {sgDecimal(netoMovimientos(g.filtrado))} + movimientos fuera del filtro {sgDecimal(netoMovimientos(g.fueraDelFiltro))} = saldo final {cant(g.saldoFinal.fisico)}.
              </div>
            ))}
          </div>
        ) : null}
        {t && !t.cuadra ? (
          <div className={styles.alertBox}>Inconsistencia del libro: el saldo inicial más los movimientos del período no coincide con el saldo final. Informe a soporte antes de usar este reporte.</div>
        ) : null}
        {error ? (
          <div className={styles.errorBox} role="alert">
            {error} No se muestran ni se exportan datos anteriores; los filtros se conservan.{" "}
            <button type="button" className={styles.clearButton} onClick={() => void cargar()}>Reintentar</button>
          </div>
        ) : null}
        {errorExportacion ? <div className={styles.errorBox} role="alert">{errorExportacion}</div> : null}
        {actual && !puedeExportar ? <div className={styles.alertBox}>Su perfil puede consultar este reporte, pero no exportarlo (requiere el permiso Exportar de Reportes).</div> : null}

        <div className={styles.tableWrap} aria-busy={cargando}>
          {detalle ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Fecha y hora</th><th>Movimiento</th><th>Tipo · origen</th><th>Estado</th><th>Documento</th><th>Producto</th><th>Unidad</th><th>Depósito</th><th>Lote</th><th>Propiedad</th>
                  <th className={styles.num}>Entrada</th><th className={styles.num}>Salida</th><th>Cambio de estado</th>
                  <th className={styles.num}>Saldo físico</th><th className={styles.num}>Disponible</th><th className={styles.num}>Reservado</th><th className={styles.num}>Cuarentena</th>
                  <th className={styles.num}>Costo unit.</th><th className={styles.num}>Costo total</th><th>Usuario</th><th>Vinculado</th><th />
                </tr>
              </thead>
              <tbody>
                {(actual?.filas ?? []).map((f: KardexFila) => (
                  <Fragment key={f.clave}>
                    <tr>
                      <td>{f.fechaRegistro} {f.horaRegistro.slice(0, 5)}{f.retroactivo ? <span className={styles.muted}> · mov. {f.fechaMovimiento}</span> : null}</td>
                      <td>{f.numero}</td>
                      <td>{textoTipo(f)}</td>
                      <td><span className={[styles.badge, styles[`badge${f.estado}`]].join(" ")}>{textoEstadoMov(f.estado)}</span></td>
                      <td>{f.documento || "—"}</td>
                      <td className={styles.desc} title={f.productoDescripcion}>{f.productoCodigo} · {f.productoDescripcion}</td>
                      <td>{nombreUnidad(et, f)}</td>
                      <td>{textoDeposito(f)}</td>
                      <td>{f.lote || "—"}</td>
                      <td>{textoPropiedadFila(f)}</td>
                      <td className={[styles.num, styles.pos].join(" ")}>{esCeroDecimal(f.entrada) ? "" : cant(f.entrada)}</td>
                      <td className={[styles.num, styles.neg].join(" ")}>{esCeroDecimal(f.salida) ? "" : cant(f.salida)}</td>
                      <td>{textoCambioEstado(f) || ""}</td>
                      <td className={styles.num}><strong>{cant(f.saldoFisico)}</strong></td>
                      <td className={styles.num}>{cant(f.saldoDisponible)}</td>
                      <td className={styles.num}>{cant(f.saldoReservado)}</td>
                      <td className={styles.num}>{cant(f.saldoCuarentena)}</td>
                      <td className={styles.num} title={costoExacto(f)}>{costo(f)}</td>
                      <td className={styles.num}>{costoTotal(f)}</td>
                      <td>{f.usuario || "—"}</td>
                      <td>{textoVinculo(f) || "—"}</td>
                      <td><button type="button" className={styles.rowToggle} aria-expanded={abierta === f.clave} onClick={() => setAbierta(abierta === f.clave ? "" : f.clave)}>{abierta === f.clave ? "Ocultar" : "Ver"}</button></td>
                    </tr>
                    {abierta === f.clave ? (
                      <tr className={styles.detailRow}>
                        <td colSpan={22}>
                          <strong>{f.numero}</strong> · {textoTipo(f)} · registrado {f.fechaRegistro} {f.horaRegistro} (fecha del movimiento {f.fechaMovimiento}) por {f.usuario || "—"}.
                          {" "}Producto {f.productoCodigo} · {f.productoDescripcion} ({nombreUnidad(et, f)}); depósito {textoDeposito(f)}{f.lote ? `; lote ${f.lote}` : ""}; {textoPropiedadFila(f)}.
                          {" "}Efecto: disponible {sgDecimal(f.dDisponible)}, reservado {sgDecimal(f.dReservado)}, cuarentena {sgDecimal(f.dCuarentena)}.
                          {" "}Motivo: {f.motivo || "—"}. Observación: {f.observacion || "—"}. Documento: {f.documento || "—"}.
                          {f.costoTotal !== null ? ` Costo registrado: ${fmtImporteMoneda(f.costoUnitario, f.moneda)} por unidad (exacto ${fmtCantidadTexto(f.costoUnitario)}), ${fmtImporteMoneda(f.costoTotal, f.moneda)} en total (${f.moneda}).` : f.propiedad === "TERCERO" ? " Stock de terceros: sin costo patrimonial." : " Sin costo registrado en esta fila (reservas, entrada de una transferencia o movimiento sin costo)."}
                          {textoVinculo(f) ? ` ${textoVinculo(f)}.` : ""}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Código</th><th>Producto</th><th>Unidad</th><th>Depósito</th><th>Lote</th><th>Propiedad</th>
                  <th className={styles.num}>Saldo inicial</th>
                  <th className={styles.num}>{fl ? "Entradas filtradas" : "Entradas"}</th><th className={styles.num}>{fl ? "Salidas filtradas" : "Salidas"}</th>
                  <th className={styles.num}>{fl ? "Transf. entrada filtrada" : "Transf. entrada"}</th><th className={styles.num}>{fl ? "Transf. salida filtrada" : "Transf. salida"}</th>
                  {fl ? <th className={styles.num}>Fuera del filtro (neto)</th> : null}
                  <th className={styles.num}>Saldo final</th>
                  <th className={styles.num}>Disponible</th><th className={styles.num}>Reservado</th><th className={styles.num}>Cuarentena</th>
                </tr>
              </thead>
              <tbody>
                {(actual?.resumen ?? []).map((f: KardexResumenFila) => (
                  <tr key={f.clave}>
                    <td>{f.productoCodigo}</td><td className={styles.desc} title={f.productoDescripcion}>{f.productoDescripcion}</td><td>{nombreUnidad(et, f)}</td>
                    <td>{f.deposito}{f.depositoInactivo ? " (inactivo)" : ""}</td><td>{f.lote || "—"}</td><td>{textoPropiedadFila(f)}</td>
                    <td className={styles.num}>{cant(f.saldoInicial)}</td><td className={styles.num}>{cant(f.entradas)}</td><td className={styles.num}>{cant(f.salidas)}</td>
                    <td className={styles.num}>{cant(f.transfEntradas)}</td><td className={styles.num}>{cant(f.transfSalidas)}</td>
                    {fl ? <td className={styles.num}>{sgDecimal(f.fueraDelFiltro)}</td> : null}
                    <td className={styles.num}><strong>{cant(f.saldoFinal)}</strong></td>
                    <td className={styles.num}>{cant(f.finalDisponible)}</td><td className={styles.num}>{cant(f.finalReservado)}</td><td className={styles.num}>{cant(f.finalCuarentena)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {actual && total === 0 && !cargando ? (
          <div className={styles.empty}>
            <strong>No se encontraron movimientos.</strong>
            <span>{hayFiltros ? "Modifique los filtros aplicados." : "Aún no hay movimientos de inventario."}</span>
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
            <button type="button" disabled={pagina >= paginas || cargando} onClick={() => setPagina((p) => p + 1)}>›</button>
          </div>
        </footer>

        <ul className={styles.notes}>
          {(actual?.cobertura ?? []).map((n) => <li key={n}>{n}</li>)}
        </ul>
      </section>
    </section>
  );
}
