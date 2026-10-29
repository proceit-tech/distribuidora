"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { crearCompuerta } from "@/lib/productos/catalogos-carga";
import { descargarVentas, filtrosVentasNormalizados, pedirVentas } from "@/lib/reportes/cliente-ventas";
import { negativo, textoReferenciaFe, textoSituacion, textoVendedor } from "@/lib/reportes/export-ventas";
import { fmtCantidadTexto, fmtImporteMoneda, fmtNum } from "@/lib/reportes/formato";
import {
  ESTADOS_SIFEN_VENTAS,
  ETIQUETA_AJUSTE_NO_ATRIBUIBLE,
  ETIQUETA_ANOMALIA,
  ETIQUETA_MOTIVO_NCE,
  ETIQUETA_VENDEDOR,
  etiquetaLocal,
  etiquetaSifen,
  etiquetaTipoVentas,
  filtrosVentasPorDefecto,
  MONEDAS_VENTAS,
  respuestaVentasVigente,
  VISTAS_VENTAS,
} from "@/lib/reportes/ventas-presentacion";
import type { SituacionVentas, VentasFiltros, VentasImportes, VentasRespuestaApi } from "@/types/reportes";

import styles from "@/components/ui/lista-padrao/reporte.module.css";
import propios from "./page.module.css";

type Catalogos = VentasRespuestaApi["catalogos"];

const BADGE_SITUACION: Record<SituacionVentas, string> = { COMPUTA: styles.badgeOK, NO_COMPUTA: styles.badgeSIN_COSTO, ANOMALIA: styles.badgeRESIDUO };
const esNegativo = (v: string | null | undefined) => typeof v === "string" && v.startsWith("-") && !/^-0+(\.0+)?$/.test(v);
const claseNum = (v: string | null | undefined) => [styles.num, esNegativo(v) ? styles.neg : ""].join(" ");

/** Celdas de importes (FE/NCE aprobadas y netos) de una fila agregada o de un total, en la moneda de ESA fila (PRO-335: nunca la del filtro ni la de la empresa). */
function CeldasImportes({ i, moneda }: { i: VentasImportes; moneda: string }) {
  return (
    <>
      <td className={styles.num}>{fmtNum(i.documentosFe)}</td>
      <td className={styles.num}>{fmtNum(i.documentosNce)}</td>
      <td className={styles.num}>{fmtImporteMoneda(i.feConIva, moneda)}</td>
      <td className={styles.num}>{fmtImporteMoneda(i.ivaFe, moneda)}</td>
      <td className={styles.num}>{fmtImporteMoneda(i.nceConIva, moneda)}</td>
      <td className={styles.num}>{fmtImporteMoneda(i.ivaNce, moneda)}</td>
      <td className={claseNum(i.netoConIva)}>{fmtImporteMoneda(i.netoConIva, moneda)}</td>
      <td className={claseNum(i.ivaNeto)}>{fmtImporteMoneda(i.ivaNeto, moneda)}</td>
      <td className={claseNum(i.netoSinIva)}>{fmtImporteMoneda(i.netoSinIva, moneda)}</td>
    </>
  );
}

const ENCABEZADO_IMPORTES = (
  <>
    <th className={styles.num}>FE aprob.</th>
    <th className={styles.num}>NCE aprob.</th>
    <th className={styles.num}>FE con IVA</th>
    <th className={styles.num}>IVA FE</th>
    <th className={styles.num}>NCE con IVA</th>
    <th className={styles.num}>IVA NCE</th>
    <th className={styles.num}>Venta neta con IVA</th>
    <th className={styles.num}>IVA neto</th>
    <th className={styles.num}>Venta neta sin IVA</th>
  </>
);

export default function InformeVentasPage() {
  const [filtros, setFiltros] = useState<VentasFiltros>(() => filtrosVentasPorDefecto());
  const [textoAplicado, setTextoAplicado] = useState({ q: "", producto: "" });
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<VentasRespuestaApi | null>(null);
  // Los catálogos (solo nombres para los selectores) sobreviven a un error para no perder los filtros elegidos; ningún importe se conserva.
  const [catalogos, setCatalogos] = useState<Catalogos | null>(null);
  const [esquemaVendedor, setEsquemaVendedor] = useState(true);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [errorExportacion, setErrorExportacion] = useState("");
  const [exportando, setExportando] = useState("");
  const compuerta = useRef(crearCompuerta());

  // Los textos de búsqueda se aplican con retraso (300 ms); el resto de los filtros, de inmediato.
  useEffect(() => {
    const t = setTimeout(() => setTextoAplicado({ q: filtros.q, producto: filtros.producto }), 300);

    return () => clearTimeout(t);
  }, [filtros.q, filtros.producto]);

  const aplicados = useMemo(() => filtrosVentasNormalizados({ ...filtros, q: textoAplicado.q, producto: textoAplicado.producto }), [filtros, textoAplicado]);
  const periodoIncompleto = !aplicados.desde || !aplicados.hasta;

  // La última solicitud iniciada gana; ante cualquier falla se DESCARTAN los datos anteriores (nunca totales viejos como actuales) y se conservan los filtros.
  const cargar = useCallback(async () => {
    const sol = compuerta.current.nueva();

    if (periodoIncompleto) {
      setDatos(null);
      setError("Indique el período completo (desde y hasta).");
      setCargando(false);
      return;
    }

    setCargando(true);
    setError("");

    const r = await pedirVentas(aplicados, pagina);

    if (!compuerta.current.vigente(sol)) return;
    setDatos(r.datos);
    if (r.datos) {
      setCatalogos(r.datos.catalogos);
      setEsquemaVendedor(r.datos.esquema.vendedor);
    }
    setError(r.error);
    setCargando(false);
  }, [aplicados, pagina, periodoIncompleto]);

  useEffect(() => {
    const actual = compuerta.current;

    const t = setTimeout(() => void cargar(), 0);

    return () => {
      clearTimeout(t);
      actual.nueva();
    };
  }, [cargar]);

  const cambiar = (parcial: Partial<VentasFiltros>) => {
    setPagina(1);
    setFiltros((f) => ({ ...f, ...parcial }));
  };

  const actual = datos && respuestaVentasVigente(datos, error, aplicados, pagina) ? datos : null;
  const puedeExportar = actual?.permisos.exportar === true;
  const vista = aplicados.vista;
  const vendedorNoDisponible = vista === "VENDEDORES" && actual !== null && !actual.esquema.vendedor;
  const exportar = async (formato: "xlsx" | "pdf") => {
    if (!actual || !puedeExportar) return;
    setExportando(formato);
    setErrorExportacion("");
    try {
      await descargarVentas(actual.filtros, formato);
    } catch (e) {
      setErrorExportacion(e instanceof Error ? e.message : "No fue posible exportar el informe.");
    } finally {
      setExportando("");
    }
  };

  const total = actual?.pagina.totalFilas ?? 0;
  const tamano = actual?.pagina.tamano ?? 50;
  const paginas = Math.max(1, Math.ceil(total / tamano));
  const porDefecto = filtrosVentasPorDefecto();
  const hayFiltros = filtros.sucursalId !== "" || filtros.tipo !== "" || filtros.moneda !== "" || filtros.q !== "" || filtros.clienteId !== "" || filtros.vendedor !== "" ||
    filtros.producto !== "" || filtros.estado !== "" || filtros.situacion !== "TODAS" || filtros.desde !== porDefecto.desde || filtros.hasta !== porDefecto.hasta;
  const etiquetaFilas = { RESUMEN: "moneda(s)", DOCUMENTOS: "documento(s)", PRODUCTOS: "producto(s)", CLIENTES: "cliente(s)", VENDEDORES: "vendedor(es)", MESES: "mes(es)" }[vista];
  const verDocumentos = (parcial: Partial<VentasFiltros>) => cambiar({ ...parcial, vista: "DOCUMENTOS", estado: "", situacion: "TODAS" });

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <nav className={styles.breadcrumb} aria-label="Ruta de navegación">
            <Link href="/reportes">Reportes</Link>
            <i aria-hidden="true">/</i>
            <Link href="/reportes">Reportes operativos</Link>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Informe de Ventas</span>
          </nav>
          <h1>Informe de Ventas</h1>
          <p>
            Facturas y notas de crédito electrónicas aprobadas por SIFEN, con los importes e IVA de su documento fiscal original.
            {actual ? ` ${actual.empresa.nombre} · situación fiscal al generar: ${actual.generado} (hora de Asunción).` : ""}
          </p>
        </div>

        <div className={styles.heroActions}>
          <Link href="/reportes" className={styles.secondaryButton}>Reportes</Link>
          {puedeExportar && !vendedorNoDisponible ? (
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

      <section className={styles.contentCard} style={{ marginBottom: 12 }}>
        <div className={styles.filters}>
          <label>
            <span>Desde (fecha de emisión)</span>
            <input type="date" value={filtros.desde} onChange={(e) => cambiar({ desde: e.target.value })} />
          </label>
          <label>
            <span>Hasta</span>
            <input type="date" value={filtros.hasta} onChange={(e) => cambiar({ hasta: e.target.value })} />
          </label>
          <label>
            <span>Sucursal</span>
            <select value={filtros.sucursalId} onChange={(e) => cambiar({ sucursalId: e.target.value })}>
              <option value="">Todas las de su alcance</option>
              {(catalogos?.sucursales ?? []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </label>
          <label>
            <span>Tipo</span>
            <select value={filtros.tipo} onChange={(e) => cambiar({ tipo: e.target.value as VentasFiltros["tipo"] })}>
              <option value="">Facturas y notas de crédito</option>
              <option value="FE">Solo facturas (FE)</option>
              <option value="NCE">Solo notas de crédito (NCE)</option>
            </select>
          </label>
          <label>
            <span>Moneda</span>
            <select value={filtros.moneda} onChange={(e) => cambiar({ moneda: e.target.value as VentasFiltros["moneda"] })}>
              <option value="">Todas (por separado)</option>
              {MONEDAS_VENTAS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label>
            <span>Vendedor</span>
            <select value={filtros.vendedor} disabled={!esquemaVendedor} onChange={(e) => cambiar({ vendedor: e.target.value })} title={esquemaVendedor ? undefined : ETIQUETA_VENDEDOR.NO_DISPONIBLE}>
              <option value="">{esquemaVendedor ? "Todos" : ETIQUETA_VENDEDOR.NO_DISPONIBLE}</option>
              {esquemaVendedor ? <option value="SIN">{ETIQUETA_VENDEDOR.SIN_REGISTRO}</option> : null}
              {(catalogos?.vendedores ?? []).map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>
          </label>
          <label style={{ flex: "2 1 260px" }}>
            <span>Documento, CDC o cliente</span>
            <input type="search" value={filtros.q} maxLength={80} onChange={(e) => cambiar({ q: e.target.value })} placeholder="Número 001-001-0000001, CDC, nombre o RUC del receptor" />
          </label>
          {filtros.clienteId ? (
            <span className={propios.chip}>
              Cliente: {actual?.catalogos.cliente?.nombre ?? catalogos?.cliente?.nombre ?? "seleccionado"}
              <button type="button" onClick={() => cambiar({ clienteId: "" })}>Quitar</button>
            </span>
          ) : null}
          {hayFiltros ? (
            <button type="button" className={styles.clearButton} onClick={() => { setPagina(1); setFiltros({ ...filtrosVentasPorDefecto(), vista: filtros.vista }); }}>
              Limpiar filtros
            </button>
          ) : null}
        </div>
      </section>

      {error ? (
        <div className={styles.errorBox} role="alert" style={{ margin: "0 0 12px" }}>
          {error} No se muestran ni se exportan datos anteriores; los filtros se conservan.{" "}
          {!periodoIncompleto ? <button type="button" className={styles.clearButton} onClick={() => void cargar()}>Reintentar</button> : null}
        </div>
      ) : null}
      {errorExportacion ? <div className={styles.errorBox} role="alert" style={{ margin: "0 0 12px" }}>{errorExportacion}</div> : null}
      {actual && actual.avisos.length > 0 ? (
        <ul className={propios.avisos} role="status">
          {actual.avisos.map((a) => <li key={a}>{a}</li>)}
        </ul>
      ) : null}

      {/* Indicadores: un bloque por moneda (nunca un total entre monedas). */}
      <div className={propios.monedas} aria-busy={cargando}>
        {!actual && cargando ? <div className={styles.contentCard}><div className={styles.empty}><strong>Cargando informe...</strong></div></div> : null}
        {actual && actual.resumen.length === 0 ? (
          <div className={styles.contentCard}>
            <div className={styles.empty}>
              <strong>Sin facturas ni notas de crédito en el período.</strong>
              <span>No hay documentos FE/NCE del NEXIT con los filtros indicados; no se muestran importes en cero como si fueran ventas.</span>
            </div>
          </div>
        ) : null}
        {(actual?.resumen ?? []).map((m) => (
          <section key={m.moneda} className={propios.moneda} aria-label={`Indicadores en ${m.moneda}`}>
            <h2>{m.moneda}<small>FE y NCE aprobadas y conciliables · importes de la foto fiscal histórica</small></h2>
            <div className={styles.summaryGrid}>
              <article className={[styles.summaryCard, styles.summaryTeal].join(" ")}>
                <span>FE aprobadas con IVA</span>
                <strong>{fmtImporteMoneda(m.feConIva, m.moneda)}</strong>
                <small>{fmtNum(m.documentosFe)} factura(s) · IVA {fmtImporteMoneda(m.ivaFe, m.moneda)} · sin IVA {fmtImporteMoneda(m.feSinIva, m.moneda)}</small>
              </article>
              <article className={[styles.summaryCard, styles.summaryAmber].join(" ")}>
                <span>NCE aprobadas con IVA</span>
                <strong>{fmtImporteMoneda(m.nceConIva, m.moneda)}</strong>
                <small>{fmtNum(m.documentosNce)} nota(s) de crédito · IVA {fmtImporteMoneda(m.ivaNce, m.moneda)} · sin IVA {fmtImporteMoneda(m.nceSinIva, m.moneda)}</small>
              </article>
              <article className={[styles.summaryCard, styles.summaryBlue].join(" ")}>
                <span>Venta neta con IVA</span>
                <strong>{fmtImporteMoneda(m.netoConIva, m.moneda)}</strong>
                <small>FE aprobadas − NCE aprobadas (con IVA)</small>
              </article>
              <article className={[styles.summaryCard, styles.summaryPurple].join(" ")}>
                <span>IVA neto</span>
                <strong>{fmtImporteMoneda(m.ivaNeto, m.moneda)}</strong>
                <small>IVA FE − IVA NCE{esNegativo(m.ivaNeto) ? " · negativo por NCE de ventas anteriores" : ""}</small>
              </article>
              <article className={[styles.summaryCard, styles.summaryTeal].join(" ")}>
                <span>Venta neta sin IVA</span>
                <strong>{fmtImporteMoneda(m.netoSinIva, m.moneda)}</strong>
                <small>Venta neta con IVA − IVA neto</small>
              </article>
            </div>
          </section>
        ))}
      </div>

      {/* Bloque INFORMATIVO separado: lo que no computa y las anomalías. Nunca alteran los netos. */}
      {actual ? (
        <div className={propios.informativo}>
          <section aria-label="Documentos que no computan">
            <h2>No computan por estado fiscal<small>Informativo: enviado, pendiente, sin consultar, rechazado, cancelado, inutilizado o no reconocido. No altera los netos.</small></h2>
            {actual.estados.length === 0 ? <div className={propios.sinDatos}>Ningún documento fuera de APROBADO en el período.</div> : (
              <table className={propios.tablaChica}>
                <thead><tr><th>Tipo</th><th>Estado fiscal</th><th>Moneda</th><th className={propios.num}>Documentos</th><th className={propios.num}>Enviados sin aprobación</th><th className={propios.num}>Importe informativo</th></tr></thead>
                <tbody>
                  {actual.estados.map((e) => (
                    <tr key={`${e.tipo}|${e.estadoSifen}|${e.moneda}`}>
                      <td>{etiquetaTipoVentas(e.tipo)}</td><td>{etiquetaSifen(e.estadoSifen)}</td><td>{e.moneda}</td>
                      <td className={propios.num}>{fmtNum(e.documentos)}</td><td className={propios.num}>{fmtNum(e.enviados)}</td><td className={propios.num}>{fmtImporteMoneda(e.total, e.moneda)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section aria-label="Anomalías">
            <h2>Anomalías: aprobados sin información fiscal conciliable<small>Excluidos de los indicadores; se informan con su monto, no como cero.</small></h2>
            {actual.anomalias.length === 0 ? <div className={propios.sinDatos}>Sin anomalías en el período.</div> : (
              <>
                <table className={propios.tablaChica}>
                  <thead><tr><th>Motivo</th><th>Tipo</th><th>Moneda</th><th className={propios.num}>Documentos</th><th className={propios.num}>Importe</th></tr></thead>
                  <tbody>
                    {actual.anomalias.map((a) => (
                      <tr key={`${a.motivo}|${a.tipo}|${a.moneda}`}>
                        <td style={{ whiteSpace: "normal" }}>{ETIQUETA_ANOMALIA[a.motivo] ?? a.motivo}</td><td>{etiquetaTipoVentas(a.tipo)}</td><td>{a.moneda}</td>
                        <td className={propios.num}>{fmtNum(a.documentos)}</td><td className={propios.num}>{fmtImporteMoneda(a.total, a.moneda)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className={propios.sinDatos}>
                  <button type="button" className={propios.enlace} onClick={() => cambiar({ vista: "DOCUMENTOS", estado: "", situacion: "ANOMALIA" })}>Ver los documentos con anomalía</button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}

      <section className={styles.contentCard}>
        <div className={styles.toolbar}>
          <div className={styles.viewToggle} role="group" aria-label="Vista del informe">
            {VISTAS_VENTAS.map(([v, texto]) => (
              <button key={v} type="button" aria-pressed={filtros.vista === v} onClick={() => cambiar({ vista: v })}>{texto}</button>
            ))}
          </div>

          {filtros.vista === "PRODUCTOS" ? (
            <label className={styles.search}>
              <input type="search" value={filtros.producto} maxLength={80} onChange={(e) => cambiar({ producto: e.target.value })} placeholder="Filtrar por código o descripción histórica del ítem" aria-label="Filtrar producto" />
            </label>
          ) : null}
          {filtros.vista === "DOCUMENTOS" ? (
            <div className={styles.filters} style={{ padding: 0, border: 0, background: "transparent", flex: "1 1 420px" }}>
              <label>
                <span>Estado fiscal (lista)</span>
                <select value={filtros.estado} onChange={(e) => cambiar({ estado: e.target.value })}>
                  <option value="">Todos</option>
                  {ESTADOS_SIFEN_VENTAS.map((e) => <option key={e} value={e}>{etiquetaSifen(e)}</option>)}
                </select>
              </label>
              <label>
                <span>Situación (lista)</span>
                <select value={filtros.situacion} onChange={(e) => cambiar({ situacion: e.target.value as VentasFiltros["situacion"] })}>
                  <option value="TODAS">Todas</option>
                  <option value="COMPUTA">Computan</option>
                  <option value="NO_COMPUTA">No computan (estado fiscal)</option>
                  <option value="ANOMALIA">Anomalías</option>
                </select>
              </label>
            </div>
          ) : null}

          <span className={styles.resultCount}>{cargando ? "Cargando..." : actual ? `${fmtNum(total)} ${etiquetaFilas}` : ""}</span>
        </div>

        {actual && !puedeExportar ? <div className={styles.alertBox}>Su perfil puede consultar este informe, pero no exportarlo (requiere el permiso Exportar de Reportes).</div> : null}
        {vendedorNoDisponible ? (
          <div className={styles.alertBox}>
            Vista por vendedor no disponible por esquema: falta el registro del vendedor comercial de la factura (NEX-074). No se agrupa por el usuario emisor ni se presume un vendedor.
          </div>
        ) : null}

        <div className={styles.tableWrap} aria-busy={cargando}>
          {vista === "RESUMEN" ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Moneda</th>
                  <th className={styles.num}>FE aprob.</th><th className={styles.num}>FE con IVA</th><th className={styles.num}>IVA FE</th><th className={styles.num}>FE sin IVA</th>
                  <th className={styles.num}>NCE aprob.</th><th className={styles.num}>NCE con IVA</th><th className={styles.num}>IVA NCE</th><th className={styles.num}>NCE sin IVA</th>
                  <th className={styles.num}>Venta neta con IVA</th><th className={styles.num}>IVA neto</th><th className={styles.num}>Venta neta sin IVA</th>
                </tr>
              </thead>
              <tbody>
                {(actual?.resumen ?? []).map((m) => (
                  <tr key={m.moneda}>
                    <td><strong>{m.moneda}</strong></td>
                    <td className={styles.num}>{fmtNum(m.documentosFe)}</td><td className={styles.num}>{fmtImporteMoneda(m.feConIva, m.moneda)}</td><td className={styles.num}>{fmtImporteMoneda(m.ivaFe, m.moneda)}</td><td className={styles.num}>{fmtImporteMoneda(m.feSinIva, m.moneda)}</td>
                    <td className={styles.num}>{fmtNum(m.documentosNce)}</td><td className={styles.num}>{fmtImporteMoneda(m.nceConIva, m.moneda)}</td><td className={styles.num}>{fmtImporteMoneda(m.ivaNce, m.moneda)}</td><td className={styles.num}>{fmtImporteMoneda(m.nceSinIva, m.moneda)}</td>
                    <td className={claseNum(m.netoConIva)}>{fmtImporteMoneda(m.netoConIva, m.moneda)}</td><td className={claseNum(m.ivaNeto)}>{fmtImporteMoneda(m.ivaNeto, m.moneda)}</td><td className={claseNum(m.netoSinIva)}>{fmtImporteMoneda(m.netoSinIva, m.moneda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {vista === "DOCUMENTOS" ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Fecha</th><th>Tipo</th><th>Número</th><th>CDC</th><th>Sucursal</th><th>Cliente (receptor)</th><th>Vendedor</th><th>Moneda</th>
                  <th className={styles.num}>Total con IVA</th><th className={styles.num}>IVA</th><th className={styles.num}>Sin IVA</th>
                  <th>Estado fiscal</th><th>Envío</th><th>Situación</th><th>Motivo NCE</th><th>Factura original</th>
                </tr>
              </thead>
              <tbody>
                {(actual?.documentos ?? []).map((d) => (
                  <tr key={d.clave}>
                    <td>{d.fecha}</td>
                    <td>{etiquetaTipoVentas(d.tipo)}</td>
                    <td>{d.numero}</td>
                    <td title={d.cdc ?? undefined} style={{ fontFamily: "monospace", fontSize: 12 }}>{d.cdc ?? "—"}</td>
                    <td>{d.sucursal}</td>
                    <td className={styles.desc} title={`${d.receptor}${d.receptorDocumento ? ` · ${d.receptorDocumento}` : ""}`}>
                      {d.receptor}{d.receptorDocumento ? <small> · {d.receptorDocumento}</small> : null}{d.clienteVinculado ? null : <small className={styles.muted}> (sin cliente vinculado)</small>}
                    </td>
                    <td className={d.vendedorEstado === "REGISTRADO" ? undefined : styles.muted}>{textoVendedor(d)}</td>
                    <td>{d.moneda}</td>
                    <td className={[claseNum(d.totalConIva), d.situacion === "COMPUTA" ? "" : styles.muted].join(" ")}>{fmtImporteMoneda(d.totalConIva, d.moneda)}</td>
                    <td className={claseNum(d.iva)}>{fmtImporteMoneda(d.iva, d.moneda)}</td>
                    <td className={claseNum(d.sinIva)}>{fmtImporteMoneda(d.sinIva, d.moneda)}</td>
                    <td>{etiquetaSifen(d.estadoSifen)}</td>
                    <td className={styles.muted}>{etiquetaLocal(d.estadoLocal)}</td>
                    <td><span className={[styles.badge, BADGE_SITUACION[d.situacion]].join(" ")} title={textoSituacion(d)}>{d.situacion === "ANOMALIA" ? "Anomalía" : d.situacion === "COMPUTA" ? "Computa" : "No computa"}</span>{d.situacion === "ANOMALIA" && d.anomalia ? <small> {ETIQUETA_ANOMALIA[d.anomalia] ?? d.anomalia}</small> : null}</td>
                    <td>{d.nceMotivo ? (ETIQUETA_MOTIVO_NCE[d.nceMotivo] ?? d.nceMotivo) : ""}</td>
                    <td className={d.feFueraAlcance ? styles.muted : undefined}>{textoReferenciaFe(d)}</td>
                  </tr>
                ))}
              </tbody>
              {actual && actual.totalesDocumentos.length > 0 ? (
                <tfoot>
                  {actual.totalesDocumentos.map((t) => (
                    <tr key={t.moneda}>
                      <td colSpan={7}>TOTAL COMPUTADO {t.moneda} — {fmtNum(t.computan)} de {fmtNum(t.filas)} documento(s) de la lista computan (todas las páginas)</td>
                      <td>{t.moneda}</td>
                      <td className={claseNum(t.totalConIva)}>{fmtImporteMoneda(t.totalConIva, t.moneda)}</td>
                      <td className={claseNum(t.iva)}>{fmtImporteMoneda(t.iva, t.moneda)}</td>
                      <td className={claseNum(t.sinIva)}>{fmtImporteMoneda(t.sinIva, t.moneda)}</td>
                      <td colSpan={5} />
                    </tr>
                  ))}
                </tfoot>
              ) : null}
            </table>
          ) : null}

          {vista === "PRODUCTOS" ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Código</th><th>Descripción (histórica)</th><th>Unidad</th><th>Moneda</th><th className={styles.num}>Cant. vendida</th><th className={styles.num}>Cant. devuelta</th>
                  {ENCABEZADO_IMPORTES}
                </tr>
              </thead>
              <tbody>
                {(actual?.grupos ?? []).map((g) => (
                  <tr key={`${g.moneda}|${g.clave}`}>
                    <td>{g.etiqueta}</td><td className={styles.desc} title={g.detalle}>{g.detalle}</td><td>{g.unidad || "—"}</td><td>{g.moneda}</td>
                    <td className={styles.num}>{fmtCantidadTexto(g.cantidadVendida)}</td><td className={styles.num}>{fmtCantidadTexto(g.cantidadDevuelta)}</td>
                    <CeldasImportes i={g} moneda={g.moneda} />
                  </tr>
                ))}
              </tbody>
              {actual && (actual.totalesProductos.length > 0 || actual.ajustesNoAtribuibles.length > 0) ? (
                <tfoot>
                  {[...new Set([...actual.totalesProductos.map((t) => t.moneda), ...actual.ajustesNoAtribuibles.map((a) => a.moneda)])].map((m) => {
                    const sub = actual.totalesProductos.find((t) => t.moneda === m);
                    const aj = actual.ajustesNoAtribuibles.find((a) => a.moneda === m);
                    const tot = actual.resumen.find((t) => t.moneda === m);
                    const conFiltro = actual.filtros.producto !== "";

                    return [
                      sub ? (
                        <tr key={`${m}-sub`} className={propios.subtotal}>
                          <td colSpan={3}>Subtotal productos {m}{conFiltro ? " — filtro de producto: no concilia con el total de la empresa" : " (todas las páginas)"}</td><td>{m}</td><td /><td />
                          <CeldasImportes i={sub} moneda={m} />
                        </tr>
                      ) : null,
                      aj ? (
                        <tr key={`${m}-aj`} className={propios.subtotal}>
                          <td colSpan={3}>{ETIQUETA_AJUSTE_NO_ATRIBUIBLE} {m} (NCE de servicio DESCUENTO u otras sin vínculo a ítems)</td><td>{m}</td><td /><td />
                          <td /><td className={styles.num}>{fmtNum(aj.documentos)}</td><td /><td /><td className={styles.num}>{fmtImporteMoneda(aj.conIva, m)}</td><td className={styles.num}>{fmtImporteMoneda(aj.iva, m)}</td>
                          <td className={styles.num + " " + styles.neg}>{fmtImporteMoneda(negativo(aj.conIva), m)}</td><td className={styles.num + " " + styles.neg}>{fmtImporteMoneda(negativo(aj.iva), m)}</td><td className={styles.num + " " + styles.neg}>{fmtImporteMoneda(negativo(aj.sinIva), m)}</td>
                        </tr>
                      ) : null,
                      !conFiltro && tot ? (
                        <tr key={`${m}-tot`}>
                          <td colSpan={3}>TOTAL {m} (productos + ajustes no atribuibles = total del período)</td><td>{m}</td><td /><td />
                          <CeldasImportes i={tot} moneda={m} />
                        </tr>
                      ) : null,
                    ];
                  })}
                </tfoot>
              ) : null}
            </table>
          ) : null}

          {vista === "CLIENTES" || vista === "VENDEDORES" || vista === "MESES" ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{vista === "CLIENTES" ? "Cliente (nombre fiscal más reciente)" : vista === "VENDEDORES" ? "Vendedor (registrado en la factura)" : "Mes de emisión"}</th>
                  {vista === "CLIENTES" ? <th>RUC / documento</th> : null}
                  <th>Moneda</th>
                  {ENCABEZADO_IMPORTES}
                  <th />
                </tr>
              </thead>
              <tbody>
                {(actual?.grupos ?? []).map((g) => {
                  const clave = g.clave.slice(g.clave.indexOf("|") + 1);
                  const filtroVendedor = vista === "VENDEDORES" ? (clave === "SIN_REGISTRO" ? "SIN" : clave === "FUERA_ALCANCE" ? null : clave) : null;

                  return (
                    <tr key={g.clave}>
                      <td className={styles.desc} title={g.etiqueta}>{g.etiqueta}</td>
                      {vista === "CLIENTES" ? <td>{g.detalle || "—"}</td> : null}
                      <td>{g.moneda}</td>
                      <CeldasImportes i={g} moneda={g.moneda} />
                      <td>
                        {vista === "CLIENTES" && g.clienteId ? <button type="button" className={propios.enlace} onClick={() => verDocumentos({ clienteId: g.clienteId ?? "", moneda: g.moneda as VentasFiltros["moneda"] })}>Ver documentos</button> : null}
                        {filtroVendedor ? <button type="button" className={propios.enlace} onClick={() => verDocumentos({ vendedor: filtroVendedor, moneda: g.moneda as VentasFiltros["moneda"] })}>Ver documentos</button> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {actual && actual.grupos.length > 0 ? (
                <tfoot>
                  {actual.resumen.map((t) => (
                    <tr key={t.moneda}>
                      <td colSpan={vista === "CLIENTES" ? 2 : 1}>TOTAL {t.moneda} (todos los resultados del filtro)</td>
                      <td>{t.moneda}</td>
                      <CeldasImportes i={t} moneda={t.moneda} />
                      <td />
                    </tr>
                  ))}
                </tfoot>
              ) : null}
            </table>
          ) : null}
        </div>

        {actual && !cargando && !vendedorNoDisponible && total === 0 ? (
          <div className={styles.empty}>
            <strong>No se encontraron resultados.</strong>
            <span>{hayFiltros ? "Modifique el período o los filtros aplicados." : "No hay documentos FE/NCE en el mes corriente."}</span>
          </div>
        ) : null}
        {!actual && !cargando && error ? <div className={styles.empty}><strong>No se pudo generar el informe</strong><span>Corrija el período o use «Reintentar» para volver a consultar con los mismos filtros.</span></div> : null}

        {vista !== "RESUMEN" ? (
          <footer className={styles.pagination}>
            <span>
              Mostrando {total === 0 ? 0 : (pagina - 1) * tamano + 1}–{Math.min(pagina * tamano, total)} de {fmtNum(total)}
            </span>
            <div>
              <button type="button" disabled={pagina === 1 || cargando} onClick={() => setPagina((p) => p - 1)} aria-label="Página anterior">‹</button>
              <strong>{pagina} / {paginas}</strong>
              <button type="button" disabled={pagina >= paginas || cargando || !actual} onClick={() => setPagina((p) => p + 1)} aria-label="Página siguiente">›</button>
            </div>
          </footer>
        ) : null}

        <ul className={styles.notes}>
          {(actual?.cobertura ?? []).map((n) => <li key={n}>{n}</li>)}
        </ul>
      </section>
    </section>
  );
}
