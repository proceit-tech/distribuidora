"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { crearCompuerta } from "@/lib/productos/catalogos-carga";
import { descargarLotes, pedirLotes } from "@/lib/reportes/cliente-lotes";
import { CLASE_LOTE, textoAlcanceExistencia, textoDepositoLote, textoDias } from "@/lib/reportes/export-lotes";
import { fmtCantidadTexto, fmtNum, textoTercerosEstadosTexto } from "@/lib/reportes/formato";
import { etiquetasUnidad, filtrosLotesIguales, nombreUnidad, respuestaLotesVigente, validarHorizonteTexto } from "@/lib/reportes/lotes-plan";
import type { ClaseVencimiento, LotesFiltros, LotesRespuestaApi } from "@/types/reportes";

import styles from "@/components/ui/lista-padrao/reporte.module.css";

const FILTROS_VACIOS: LotesFiltros = {
  vista: "LOTE", q: "", lote: "", depositoId: "", categoriaId: "", marcaId: "", familiaId: "", clase: "", existencia: "CON",
  horizonte: 30, vencDesde: "", vencHasta: "",
};
const num = fmtNum;
const cant = fmtCantidadTexto;
const CLASES = Object.keys(CLASE_LOTE) as ClaseVencimiento[];

type Catalogos = LotesRespuestaApi["catalogos"];

export default function ReporteLotesPage() {
  const [filtros, setFiltros] = useState<LotesFiltros>(FILTROS_VACIOS);
  const [horizonteTxt, setHorizonteTxt] = useState("30");
  const [textoAplicado, setTextoAplicado] = useState({ q: "", lote: "", horizonte: 30 });
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<LotesRespuestaApi | null>(null);
  // Solo los nombres de los selectores sobreviven a un error (conservan los filtros elegidos); ningún dato del informe se conserva.
  const [catalogos, setCatalogos] = useState<Catalogos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [errorExportacion, setErrorExportacion] = useState("");
  const [exportando, setExportando] = useState("");
  const compuerta = useRef(crearCompuerta());

  const hz = validarHorizonteTexto(horizonteTxt);

  // Texto y horizonte válido se aplican con una pequeña espera; selectores y fechas, de inmediato. Un horizonte inválido nunca se aplica en silencio.
  useEffect(() => {
    const t = setTimeout(() => setTextoAplicado((a) => ({ q: filtros.q, lote: filtros.lote, horizonte: hz.valor ?? a.horizonte })), 300);

    return () => clearTimeout(t);
  }, [filtros.q, filtros.lote, hz.valor]);

  const aplicados = useMemo(() => ({ ...filtros, ...textoAplicado }), [filtros, textoAplicado]);

  // La última solicitud iniciada gana; ante cualquier falla se descartan los datos anteriores y se conservan los filtros.
  const cargar = useCallback(async () => {
    const sol = compuerta.current.nueva();

    setCargando(true);
    setError("");

    const r = await pedirLotes(aplicados, pagina);

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

  const cambiar = (parcial: Partial<LotesFiltros>) => {
    setPagina(1);
    setFiltros((f) => ({ ...f, ...parcial }));
  };

  // Solo se muestran y exportan datos que corresponden EXACTAMENTE a los filtros y la página vigentes (y con un horizonte escrito válido).
  const actual = !hz.error && datos && respuestaLotesVigente(datos, error, aplicados, pagina) ? datos : null;
  const puedeExportar = actual?.permisos.exportar === true;
  const exportar = async (formato: "xlsx" | "pdf") => {
    if (!actual || !puedeExportar) return;
    setExportando(formato);
    setErrorExportacion("");
    try {
      await descargarLotes(actual.filtros, formato);
    } catch (e) {
      setErrorExportacion(e instanceof Error ? e.message : "No fue posible exportar el reporte.");
    } finally {
      setExportando("");
    }
  };

  const t = actual?.totales;
  // Rótulo de cada unidad según TODAS las unidades de la respuesta vigente (UUID = identidad; el nombre repetido se rotula con el identificador).
  const et = useMemo(() => etiquetasUnidad(actual?.totales.porUnidad ?? []), [actual]);
  const total = actual?.pagina.totalFilas ?? 0;
  const tamano = actual?.pagina.tamano ?? 50;
  const paginas = Math.max(1, Math.ceil(total / tamano));
  const porDeposito = aplicados.vista === "DEPOSITO";
  const hayFiltros = !filtrosLotesIguales({ ...filtros, vista: "LOTE", horizonte: 30 }, { ...FILTROS_VACIOS, horizonte: 30 }) || horizonteTxt !== "30";
  const clase = (c: ClaseVencimiento) => t?.clases.find((x) => x.clase === c);
  const colorCard: Record<ClaseVencimiento, string> = { VENCIDO: styles.summaryRed, PROXIMO: styles.summaryAmber, VIGENTE: styles.summaryTeal, SIN_FECHA: styles.summaryPurple };
  const depositos = catalogos?.depositos ?? [];

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <nav className={styles.breadcrumb} aria-label="Ruta de navegación">
            <Link href="/reportes">Reportes</Link>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Lotes y vencimientos</span>
          </nav>
          <h1>Lotes y vencimientos</h1>
          <p>
            Lotes reales con su vencimiento y su stock por depósito, propio y de terceros por separado.
            {actual ? ` ${actual.empresa.nombre} · generado ${actual.generado} · fecha de referencia ${t?.hoy ?? ""} (Paraguay).` : ""}
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
        {CLASES.map((c) => (
          <article key={c} className={[styles.summaryCard, colorCard[c]].join(" ")}>
            <span>{CLASE_LOTE[c].toUpperCase()}</span>
            <strong>{t ? num(clase(c)?.lotes ?? 0) : "—"}</strong>
            <small>
              {t
                ? (clase(c)?.unidades ?? []).map((u) => `${nombreUnidad(et, u)}: físico propio ${cant(u.fisico)} · terceros ${cant(u.terceros)}`).join(" | ") || "Sin lotes"
                : "—"}
            </small>
          </article>
        ))}
      </section>

      <section className={styles.contentCard}>
        <div className={styles.policyNote} role="note">
          <strong>Clasificación con la fecha de hoy en Paraguay.</strong> Vencido = vence antes de hoy; Próximo = vence dentro del horizonte
          ({aplicados.horizonte} días); Vigente = vence después; Sin fecha = lote sin vencimiento registrado (no se inventa). La cuarentena no hace vencido a un lote.
          Cada lote cuenta una sola vez en los indicadores, aunque esté en varios depósitos. Las cantidades se totalizan por unidad de medida, nunca entre unidades distintas.
          {actual ? ` Existencia: ${textoAlcanceExistencia(actual)}.` : ""}
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
              {depositos.map((d) => <option key={d.id} value={d.id}>{d.nombre}{d.activo ? "" : " (inactivo)"}</option>)}
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
            <span>Situación de vencimiento</span>
            <select value={filtros.clase} onChange={(e) => cambiar({ clase: e.target.value as LotesFiltros["clase"] })}>
              <option value="">Todas</option>
              {CLASES.map((c) => <option key={c} value={c}>{CLASE_LOTE[c]}</option>)}
            </select>
          </label>
          <label>
            <span>Existencia (saldo total del lote)</span>
            <select value={filtros.existencia} onChange={(e) => cambiar({ existencia: e.target.value as LotesFiltros["existencia"] })}>
              <option value="CON">Solo con saldo</option>
              <option value="SIN">Sin saldo</option>
              <option value="TODOS">Todos</option>
            </select>
          </label>
          <label>
            <span>Horizonte de alerta (días)</span>
            <input type="text" inputMode="numeric" value={horizonteTxt} aria-invalid={!!hz.error} onChange={(e) => { setPagina(1); setHorizonteTxt(e.target.value); }} />
            {hz.error ? <small role="alert">{hz.error}</small> : null}
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

        {t && t.porUnidad.length > 0 ? (
          <details className={styles.policyNote} open>
            <summary><strong>Totales por unidad de medida</strong> (sin total general de cantidades entre unidades distintas)</summary>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Unidad</th><th className={styles.num}>Lotes</th><th className={styles.num}>Disponible</th><th className={styles.num}>Reservado</th><th className={styles.num}>Cuarentena</th>
                    <th className={styles.num}>Físico propio</th><th className={styles.num}>Terceros</th><th>Terceros por estado</th>
                  </tr>
                </thead>
                <tbody>
                  {t.porUnidad.map((u) => (
                    <tr key={u.unidadId || "sin"}>
                      <td>{nombreUnidad(et, u)}</td><td className={styles.num}>{num(u.lotes)}</td>
                      <td className={styles.num}>{cant(u.disponible)}</td><td className={styles.num}>{cant(u.reservado)}</td><td className={styles.num}>{cant(u.cuarentena)}</td>
                      <td className={styles.num}>{cant(u.fisico)}</td><td className={styles.num}>{cant(u.terceros)}</td>
                      <td>{textoTercerosEstadosTexto(u.tercerosPorEstado) || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}

        {actual?.huerfanos ? <div className={styles.okBox}>Incluye lotes sin ningún saldo registrado (visibles solo con alcance a todos los depósitos).</div> : null}
        {hz.error ? <div className={styles.errorBox} role="alert">{hz.error} El informe no se muestra hasta corregir el campo.</div> : null}
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
                <th>Código</th><th>Producto</th><th>Unidad</th><th>Categoría</th><th>Familia</th><th>Lote</th>
                {porDeposito ? <th>Depósito</th> : <th className={styles.num}>Depósitos</th>}
                <th>Vencimiento</th><th className={styles.num}>Días restantes</th><th>Situación</th>
                <th className={styles.num}>Disponible</th><th className={styles.num}>Reservado</th><th className={styles.num}>Cuarentena</th>
                <th className={styles.num}>Físico propio</th><th className={styles.num}>Terceros</th><th>Terceros por estado</th>
              </tr>
            </thead>
            <tbody>
              {(actual?.filas ?? []).map((f, i) => (
                <tr key={`${f.loteId}-${f.deposito}-${i}`}>
                  <td>{f.codigo}</td>
                  <td className={styles.desc} title={f.descripcion}>{f.descripcion}</td>
                  <td>{nombreUnidad(et, f)}</td>
                  <td>{f.categoria || "—"}</td><td>{f.familia || "—"}</td><td>{f.lote}</td>
                  {porDeposito ? <td>{textoDepositoLote(f)}</td> : <td className={styles.num}>{num(f.depositos)}</td>}
                  <td>{f.vencimiento || "Sin fecha"}</td>
                  <td className={styles.num}>{textoDias(f)}</td>
                  <td><span className={[styles.badge, styles[`badge${f.clase}`]].join(" ")}>{CLASE_LOTE[f.clase]}</span></td>
                  <td className={styles.num}>{cant(f.disponible)}</td><td className={styles.num}>{cant(f.reservado)}</td>
                  <td className={styles.num}>{cant(f.cuarentena)}</td><td className={styles.num}>{cant(f.fisico)}</td>
                  <td className={styles.num}>{cant(f.terceros)}</td>
                  <td>{textoTercerosEstadosTexto(f.tercerosEstados) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {actual && actual.filas.length === 0 && !cargando ? (
          <div className={styles.empty}>
            <strong>No se encontraron lotes.</strong>
            <span>{hayFiltros ? "Modifique los filtros aplicados." : "Aún no hay lotes con saldo registrados."}</span>
          </div>
        ) : null}
        {!actual && cargando && !hz.error ? <div className={styles.empty}><strong>Cargando reporte...</strong></div> : null}
        {!actual && !cargando && error ? <div className={styles.empty}><strong>No se pudo generar el reporte</strong><span>Use «Reintentar» para volver a consultar con los mismos filtros.</span></div> : null}

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
          {(actual?.cobertura ?? []).map((n) => <li key={n}>{n}</li>)}
        </ul>
      </section>
    </section>
  );
}
