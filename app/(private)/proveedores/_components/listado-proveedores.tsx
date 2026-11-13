"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  ProveedorLista,
  ProveedorEstadoHomologacion,
  ProveedorNivelRiesgo,
} from "@/types/proveedores";

import { compararTexto, ordenarLista, siguienteOrden, type Orden } from "@/components/ui/lista-padrao/orden";
import { ThOrdenable } from "@/components/ui/lista-padrao/th-ordenable";
import ui from "@/components/ui/lista-padrao/lista.module.css";
import { formatearMonto } from "@/lib/formato/listas";
import { hoyAsuncion } from "@/lib/proveedores/fechas";
import { homologacionVencida } from "@/lib/proveedores/gobernanza";

import styles from "../page.module.css";

const PAGE_SIZE = 8;

const COLUMNAS = 7;

type CampoOrden = "proveedor" | "identificacion" | "compras" | "homologacion" | "estado";

type EstadoFiltro =
  | "TODOS"
  | "ACTIVOS"
  | "INACTIVOS";

type HomologacionFiltro =
  | "TODAS"
  | ProveedorEstadoHomologacion;

type RiesgoFiltro =
  | "TODOS"
  | ProveedorNivelRiesgo;

function money(value: number, currency: string) {
  return formatearMonto(value, currency);
}

function documento(
  proveedor: ProveedorLista,
) {
  if (
    proveedor.tipoDocumento === "RUC"
  ) {
    return `RUC ${proveedor.numeroDocumento}${
      proveedor.dv
        ? `-${proveedor.dv}`
        : ""
    }`;
  }

  return `${proveedor.tipoDocumento.replaceAll(
    "_",
    " ",
  )} ${proveedor.numeroDocumento}`;
}

function initials(
  value: string,
) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((item) =>
      item.charAt(0).toUpperCase(),
    )
    .join("");
}

function homologacionClass(
  value: ProveedorEstadoHomologacion,
) {
  if (value === "HOMOLOGADO") {
    return styles.badgeSuccess;
  }

  if (
    value === "RECHAZADO" ||
    value === "SUSPENDIDO" ||
    value === "VENCIDO"
  ) {
    return styles.badgeDanger;
  }

  if (
    value === "EN_EVALUACION"
  ) {
    return styles.badgeInfo;
  }

  return styles.badgeWarning;
}

function riesgoClass(
  value: ProveedorNivelRiesgo,
) {
  if (value === "BAJO") {
    return styles.riskLow;
  }

  if (value === "MEDIO") {
    return styles.riskMedium;
  }

  if (
    value === "ALTO" ||
    value === "CRITICO"
  ) {
    return styles.riskHigh;
  }

  return styles.riskNeutral;
}

const HOMOLOGACION_TEXTO: Record<string, string> = {
  HOMOLOGADO: "Homologado",
  PENDIENTE: "Pendiente",
  EN_EVALUACION: "En evaluación",
  SUSPENDIDO: "Suspendido",
  VENCIDO: "Vencido",
  RECHAZADO: "Rechazado",
};

const RIESGO_TEXTO: Record<string, string> = {
  NO_EVALUADO: "Riesgo no evaluado",
  BAJO: "Riesgo bajo",
  MEDIO: "Riesgo medio",
  ALTO: "Riesgo alto",
  CRITICO: "Riesgo crítico",
};

type FilaApi = {
  id: string;
  codigo: string;
  razon_social: string;
  nombre_fantasia: string | null;
  tipo_documento: string;
  numero_documento: string;
  dv: string | null;
  pais_nombre: string | null;
  email: string | null;
  telefono: string | null;
  grupo_nombre: string | null;
  condicion_pago_nombre: string | null;
  moneda_codigo_predeterminada: string | null;
  monto_minimo_compra: string | number | null;
  estado_homologacion: ProveedorEstadoHomologacion;
  nivel_riesgo: ProveedorNivelRiesgo;
  calificacion_actual: string | number | null;
  fecha_vencimiento_homologacion: string | Date | null;
  bloqueado: boolean;
  activo: boolean;
};

function desdeApi(fila: FilaApi): ProveedorLista {
  return {
    id: fila.id,
    codigo: fila.codigo,
    razonSocial: fila.razon_social,
    nombreFantasia: fila.nombre_fantasia ?? "",
    tipoDocumento: fila.tipo_documento,
    numeroDocumento: fila.numero_documento,
    dv: fila.dv ?? "",
    paisNombre: fila.pais_nombre ?? "",
    email: fila.email ?? "",
    telefono: fila.telefono ?? "",
    grupoNombre: fila.grupo_nombre ?? "",
    condicionPagoNombre:
      fila.condicion_pago_nombre ?? "",
    monedaCodigoPredeterminada:
      fila.moneda_codigo_predeterminada ?? "PYG",
    montoMinimoCompra: String(fila.monto_minimo_compra ?? "0"),
    estadoHomologacion:
      fila.estado_homologacion,
    nivelRiesgo: fila.nivel_riesgo,
    calificacionActual:
      fila.calificacion_actual === null
        ? null
        : String(fila.calificacion_actual),
    activo: fila.activo,
    bloqueado: fila.bloqueado === true,
    homologacionVencida: homologacionVencida(
      { estadoHomologacion: fila.estado_homologacion, fechaVencimientoHomologacion: isoDe(fila.fecha_vencimiento_homologacion) },
      hoyAsuncion(),
    ),
  };
}

function isoDe(valor: string | Date | null): string {
  if (!valor) return "";

  return typeof valor === "string" ? valor.slice(0, 10) : valor.toISOString().slice(0, 10);
}

export default function ListadoProveedores({ puedeCrear }: { puedeCrear: boolean }) {
  const [
    proveedores,
    setProveedores,
  ] = useState<ProveedorLista[]>([]);

  const [busqueda, setBusqueda] =
    useState("");

  const [
    filtroEstado,
    setFiltroEstado,
  ] =
    useState<EstadoFiltro>("TODOS");

  const [
    filtroHomologacion,
    setFiltroHomologacion,
  ] =
    useState<HomologacionFiltro>(
      "TODAS",
    );

  const [
    filtroRiesgo,
    setFiltroRiesgo,
  ] =
    useState<RiesgoFiltro>("TODOS");

  const [pagina, setPagina] =
    useState(1);

  const [flash, setFlash] =
    useState("");

  const [cargando, setCargando] =
    useState(true);

  const [errorCarga, setErrorCarga] =
    useState("");

  const [orden, setOrden] = useState<Orden<CampoOrden>>(null);

  useEffect(() => {
    let activo = true;

    async function cargar() {
      try {
        const respuesta = await fetch(
          "/api/proveedores",
          { cache: "no-store" },
        );

        if (!respuesta.ok) {
          const json = (await respuesta
            .json()
            .catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(
            json.error ??
              "No fue posible cargar los proveedores.",
          );
        }

        const json =
          (await respuesta.json()) as {
            proveedores: FilaApi[];
          };

        if (activo) {
          setProveedores(
            json.proveedores.map(
              desdeApi,
            ),
          );
        }
      } catch (e) {
        if (activo) {
          setErrorCarga(
            e instanceof Error
              ? e.message
              : "No fue posible cargar los proveedores.",
          );
        }
      } finally {
        if (activo) {
          setCargando(false);
        }
      }
    }

    void cargar();

    const ok = new URLSearchParams(
      window.location.search,
    ).get("ok");

    if (ok) {
      void Promise.resolve().then(() =>
        setFlash(
          ok === "creado"
            ? "Proveedor registrado correctamente."
            : "Proveedor actualizado correctamente.",
        ),
      );
      window.history.replaceState(
        null,
        "",
        "/proveedores",
      );
    }

    return () => {
      activo = false;
    };
  }, []);

  // Al cambiar búsqueda, filtros u orden se vuelve a la primera página (se ajusta durante el render, sin efecto).
  const claveFiltros = [busqueda, filtroEstado, filtroHomologacion, filtroRiesgo, orden?.campo ?? "", orden?.dir ?? ""].join("|");
  const [claveAnterior, setClaveAnterior] = useState(claveFiltros);

  if (claveAnterior !== claveFiltros) {
    setClaveAnterior(claveFiltros);
    setPagina(1);
  }

  useEffect(() => {
    if (!flash) {
      return;
    }

    const timer =
      window.setTimeout(
        () => setFlash(""),
        4200,
      );

    return () =>
      window.clearTimeout(timer);
  }, [flash]);

  const resumen = useMemo(() => {
    return proveedores.reduce(
      (acc, proveedor) => {
        acc.total += 1;

        if (proveedor.activo) {
          acc.activos += 1;
        }

        if (
          proveedor.estadoHomologacion ===
            "HOMOLOGADO" &&
          !proveedor.homologacionVencida
        ) {
          acc.homologados += 1;
        }

        if (
          proveedor.nivelRiesgo ===
            "ALTO" ||
          proveedor.nivelRiesgo ===
            "CRITICO"
        ) {
          acc.riesgoAlto += 1;
        }

        return acc;
      },
      {
        total: 0,
        activos: 0,
        homologados: 0,
        riesgoAlto: 0,
      },
    );
  }, [proveedores]);

  const filtrados = useMemo(() => {
    const term =
      busqueda
        .trim()
        .toLocaleLowerCase("es");

    return proveedores.filter(
      (proveedor) => {
        if (
          filtroEstado ===
            "ACTIVOS" &&
          !proveedor.activo
        ) {
          return false;
        }

        if (
          filtroEstado ===
            "INACTIVOS" &&
          proveedor.activo
        ) {
          return false;
        }

        if (
          filtroHomologacion !==
            "TODAS" &&
          proveedor.estadoHomologacion !==
            filtroHomologacion
        ) {
          return false;
        }

        if (
          filtroRiesgo !==
            "TODOS" &&
          proveedor.nivelRiesgo !==
            filtroRiesgo
        ) {
          return false;
        }

        if (!term) {
          return true;
        }

        return [
          proveedor.codigo,
          proveedor.razonSocial,
          proveedor.nombreFantasia,
          proveedor.numeroDocumento,
          proveedor.email,
          proveedor.telefono,
          proveedor.grupoNombre,
          proveedor.condicionPagoNombre,
          proveedor.paisNombre,
          proveedor.estadoHomologacion,
          proveedor.nivelRiesgo,
        ]
          .join(" ")
          .toLocaleLowerCase("es")
          .includes(term);
      },
    );
  }, [
    proveedores,
    busqueda,
    filtroEstado,
    filtroHomologacion,
    filtroRiesgo,
  ]);

  const totalPaginas =
    Math.max(
      1,
      Math.ceil(
        filtrados.length /
          PAGE_SIZE,
      ),
    );

  // Ordenación sobre el conjunto filtrado COMPLETO (todos los proveedores están cargados), antes de paginar.
  const ordenados = useMemo(
    () =>
      ordenarLista(filtrados, orden, (campo, a, b) => {
        switch (campo) {
          case "proveedor":
            return compararTexto(a.razonSocial, b.razonSocial);
          case "identificacion":
            return compararTexto(documento(a), documento(b));
          case "compras":
            return compararTexto(a.grupoNombre, b.grupoNombre);
          case "homologacion":
            return compararTexto(a.estadoHomologacion, b.estadoHomologacion);
          case "estado":
            return Number(b.activo) - Number(a.activo);
        }
      }),
    [filtrados, orden],
  );

  function cambiarOrden(campo: CampoOrden) {
    setOrden((actual) => siguienteOrden(actual, campo));
  }

  const paginaActual = useMemo(
    () => ordenados.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE),
    [ordenados, pagina],
  );

  function limpiarFiltros() {
    setBusqueda("");
    setFiltroEstado("TODOS");
    setFiltroHomologacion("TODAS");
    setFiltroRiesgo("TODOS");
  }

  return (
    <section className={ui.page}>
      {flash ? (
        <div className={styles.toast} role="status">
          <span>✓</span>
          <div>
            <strong>Operación realizada</strong>
            <small>{flash}</small>
          </div>

          <button type="button" aria-label="Cerrar mensaje" onClick={() => setFlash("")}>
            ×
          </button>
        </div>
      ) : null}

      <header className={ui.topbar}>
        <div className={ui.titleBlock}>
          <nav className={ui.breadcrumb} aria-label="Ruta de navegación">
            <span>Maestros</span>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Proveedores</span>
          </nav>

          <h1>Proveedores</h1>
        </div>

        {puedeCrear ? (
          <Link href="/proveedores/nuevo" className={ui.primaryButton}>
            <span aria-hidden="true">+</span>
            Nuevo proveedor
          </Link>
        ) : null}
      </header>

      <section className={ui.summaryGrid} aria-label="Resumen de proveedores">
        <article className={[ui.summaryCard, ui.summaryTeal].join(" ")}>
          <span>Proveedores activos</span>
          <strong>{resumen.activos}</strong>
          <small>Disponibles para compras</small>
        </article>

        <article className={[ui.summaryCard, ui.summaryBlue].join(" ")}>
          <span>Homologados</span>
          <strong>{resumen.homologados}</strong>
          <small>Aprobación vigente</small>
        </article>

        <article className={[ui.summaryCard, ui.summaryRed].join(" ")}>
          <span>Riesgo alto / crítico</span>
          <strong>{resumen.riesgoAlto}</strong>
          <small>Requieren revisión</small>
        </article>

        <article className={[ui.summaryCard, ui.summaryViolet].join(" ")}>
          <span>Total registrados</span>
          <strong>{resumen.total}</strong>
          <small>Base de proveedores</small>
        </article>
      </section>

      <section className={ui.contentCard}>
        <div className={ui.toolbar}>
          <label className={ui.search}>
            <span aria-hidden="true">⌕</span>

            <input
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Buscar proveedor, código, RUC, grupo..."
              aria-label="Buscar proveedores"
            />
          </label>

          <label className={ui.filterField}>
            <span>Estado</span>
            <select
              value={filtroEstado}
              onChange={(event) => setFiltroEstado(event.target.value as EstadoFiltro)}
            >
              <option value="TODOS">Todos</option>
              <option value="ACTIVOS">Activos</option>
              <option value="INACTIVOS">Inactivos</option>
            </select>
          </label>

          <label className={ui.filterField}>
            <span>Homologación</span>
            <select
              value={filtroHomologacion}
              onChange={(event) => setFiltroHomologacion(event.target.value as HomologacionFiltro)}
            >
              <option value="TODAS">Todas</option>
              <option value="HOMOLOGADO">Homologado</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="EN_EVALUACION">En evaluación</option>
              <option value="SUSPENDIDO">Suspendido</option>
              <option value="VENCIDO">Vencido</option>
              <option value="RECHAZADO">Rechazado</option>
            </select>
          </label>

          <label className={ui.filterField}>
            <span>Riesgo</span>
            <select
              value={filtroRiesgo}
              onChange={(event) => setFiltroRiesgo(event.target.value as RiesgoFiltro)}
            >
              <option value="TODOS">Todos</option>
              <option value="NO_EVALUADO">No evaluado</option>
              <option value="BAJO">Bajo</option>
              <option value="MEDIO">Medio</option>
              <option value="ALTO">Alto</option>
              <option value="CRITICO">Crítico</option>
            </select>
          </label>

          <button type="button" className={ui.clearButton} onClick={limpiarFiltros}>
            Limpiar filtros
          </button>

          <span className={ui.resultCount} aria-live="polite">
            {filtrados.length} de {resumen.total}
          </span>
        </div>

        <div className={ui.tableScroll}>
          <table className={ui.table}>
            <thead>
              <tr>
                <ThOrdenable titulo="Proveedor" campo="proveedor" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Identificación" campo="identificacion" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Contacto" />
                <ThOrdenable titulo="Compras / pagos" campo="compras" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Homologación / riesgo" campo="homologacion" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Estado" campo="estado" orden={orden} onOrden={cambiarOrden} />
                <ThOrdenable titulo="Acciones" alinear="derecha" />
              </tr>
            </thead>

            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={COLUMNAS} className={ui.emptyCell}>
                    <div className={ui.empty}>
                      <strong>Cargando proveedores...</strong>
                    </div>
                  </td>
                </tr>
              ) : errorCarga ? (
                <tr>
                  <td colSpan={COLUMNAS} className={ui.emptyCell}>
                    <div className={ui.empty} role="alert">
                      <strong>No fue posible cargar los proveedores</strong>
                      <span>{errorCarga}</span>
                    </div>
                  </td>
                </tr>
              ) : paginaActual.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNAS} className={ui.emptyCell}>
                    <div className={ui.empty}>
                      <strong>
                        {proveedores.length === 0 ? "Aún no hay proveedores registrados" : "No encontramos proveedores"}
                      </strong>
                      <span>
                        {proveedores.length === 0
                          ? puedeCrear ? "Cree su primer proveedor para comenzar a operar." : "Solicite a un usuario con permiso de creación que registre los proveedores."
                          : puedeCrear ? "Cambie los filtros o registre un nuevo proveedor." : "Cambie los filtros de búsqueda."}
                      </span>
                      {proveedores.length === 0 && puedeCrear ? (
                        <Link href="/proveedores/nuevo" className={ui.emptyAction}>
                          + Nuevo proveedor
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : (
                paginaActual.map((proveedor) => (
                  <tr key={proveedor.id} className={ui.row}>
                    <td>
                      <div className={ui.clientMain}>
                        <div className={ui.avatar} aria-hidden="true">
                          {initials(proveedor.razonSocial)}
                        </div>

                        <div className={ui.clientIdentity}>
                          <Link href={`/proveedores/${proveedor.id}`} className={ui.clientName}>
                            {proveedor.razonSocial}
                          </Link>
                          <span className={ui.code}>{proveedor.codigo}</span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className={ui.cell}>
                        <strong>{documento(proveedor)}</strong>
                        <span>{proveedor.paisNombre}</span>
                      </div>
                    </td>

                    <td>
                      <div className={ui.cell}>
                        <strong>{proveedor.telefono || "Sin teléfono"}</strong>
                        <span className={ui.email}>{proveedor.email || "Sin correo"}</span>
                      </div>
                    </td>

                    <td>
                      <div className={ui.cell}>
                        <strong>{proveedor.grupoNombre || "Sin grupo"}</strong>
                        <span>{proveedor.condicionPagoNombre}</span>
                        <span>
                          {money(Number(proveedor.montoMinimoCompra), proveedor.monedaCodigoPredeterminada)} mínimo
                        </span>
                      </div>
                    </td>

                    <td>
                      <div className={ui.cell}>
                        <div className={styles.badgeRow}>
                          <span className={[styles.badge, homologacionClass(proveedor.homologacionVencida ? "VENCIDO" : proveedor.estadoHomologacion)].join(" ")}>
                            {proveedor.homologacionVencida && proveedor.estadoHomologacion === "HOMOLOGADO" ? "Homologación vencida" : HOMOLOGACION_TEXTO[proveedor.estadoHomologacion] ?? proveedor.estadoHomologacion}
                          </span>
                          {proveedor.bloqueado ? <span className={[styles.badge, styles.badgeDanger].join(" ")}>Bloqueado</span> : null}
                          <span className={[styles.badge, riesgoClass(proveedor.nivelRiesgo)].join(" ")}>
                            {RIESGO_TEXTO[proveedor.nivelRiesgo] ?? proveedor.nivelRiesgo}
                          </span>
                        </div>
                        <span>
                          {proveedor.calificacionActual !== null
                            ? `Calificación ${proveedor.calificacionActual}/100`
                            : "Sin calificación"}
                        </span>
                      </div>
                    </td>

                    <td>
                      <div className={ui.statuses}>
                        <span className={proveedor.activo ? ui.statusActive : ui.statusInactive}>
                          {proveedor.activo ? "Activo" : "Inactivo"}
                        </span>
                      </div>
                    </td>

                    <td className={ui.actionsCell}>
                      <Link
                        href={`/proveedores/${proveedor.id}`}
                        className={ui.detailButton}
                        aria-label={`Ver ficha de ${proveedor.razonSocial}`}
                      >
                        Ver ficha
                        <span aria-hidden="true">›</span>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <footer className={ui.pagination}>
          <span>
            Mostrando {filtrados.length === 0 ? 0 : (pagina - 1) * PAGE_SIZE + 1}–
            {Math.min(pagina * PAGE_SIZE, filtrados.length)} de {filtrados.length}
          </span>

          <div>
            <button
              type="button"
              aria-label="Página anterior"
              disabled={pagina === 1}
              onClick={() => setPagina((actual) => actual - 1)}
            >
              ‹
            </button>

            <strong>
              {pagina} / {totalPaginas}
            </strong>

            <button
              type="button"
              aria-label="Página siguiente"
              disabled={pagina === totalPaginas}
              onClick={() => setPagina((actual) => actual + 1)}
            >
              ›
            </button>
          </div>
        </footer>
      </section>
    </section>
  );
}
