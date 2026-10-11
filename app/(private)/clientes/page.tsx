"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  ClienteLista,
  ClienteNaturaleza,
  ClienteOperacion,
} from "@/types/clientes";

import styles from "./page.module.css";

const PAGE_SIZE = 8;

type EstadoFiltro =
  | "TODOS"
  | "ACTIVOS"
  | "INACTIVOS"
  | "BLOQUEADOS";

type NaturalezaFiltro =
  | "TODAS"
  | ClienteNaturaleza;

type OperacionFiltro =
  | "TODAS"
  | ClienteOperacion;

type CampoOrden = "cliente" | "identificacion" | "comercial" | "credito" | "estado";

type Orden = { campo: CampoOrden; dir: "asc" | "desc" } | null;

const COLUMNAS: {
  clave: string;
  titulo: string;
  orden?: CampoOrden;
  clase?: string;
}[] = [
  { clave: "cliente", titulo: "Cliente", orden: "cliente" },
  { clave: "identificacion", titulo: "Identificación", orden: "identificacion" },
  { clave: "comercial", titulo: "Comercial", orden: "comercial" },
  { clave: "contacto", titulo: "Contacto principal" },
  { clave: "credito", titulo: "Crédito", orden: "credito", clase: "numericHead" },
  { clave: "estado", titulo: "Estado", orden: "estado" },
  { clave: "acciones", titulo: "Acciones", clase: "actionsHead" },
];

function dinero(value: number) {
  return new Intl.NumberFormat(
    "es-PY",
    {
      maximumFractionDigits: 4,
    },
  ).format(value);
}

const OPERACIONES: Record<number, ClienteOperacion> = {
  1: "B2B",
  2: "B2C",
  3: "B2G",
  4: "B2F",
};

/** Teléfono para mostrar: "+DDI número" si se conoce el DDI (sin país guardado = registro anterior, solo el número). */
function telefonoVisible(ddi: string, numero: string) {
  return numero ? (ddi ? `+${ddi} ${numero}` : numero) : "";
}

const soloDigitos = (valor: string) => valor.replace(/\D/g, "");

function texto(valor: unknown) {
  return typeof valor === "string"
    ? valor
    : "";
}

function desdeApi(
  fila: Record<string, unknown>,
): ClienteLista {
  return {
    id: texto(fila.id),
    codigo: texto(fila.codigo),
    // Un código desconocido nunca se sustituye por un valor válido (ni B2C ni "no contribuyente"): se marca para revisión.
    naturaleza:
      Number(fila.naturaleza_receptor) === 1
        ? "CONTRIBUYENTE"
        : Number(fila.naturaleza_receptor) === 2
          ? "NO_CONTRIBUYENTE"
          : "DESCONOCIDA",
    tipoOperacion:
      OPERACIONES[Number(fila.tipo_operacion)] ?? "DESCONOCIDA",
    tipoDocumento: texto(
      fila.tipo_documento,
    ),
    numeroDocumento: texto(
      fila.numero_documento,
    ),
    dv: texto(fila.dv),
    razonSocial: texto(
      fila.razon_social,
    ),
    nombreFantasia: texto(
      fila.nombre_fantasia,
    ),
    paisNombre: texto(fila.pais_nombre),
    email: texto(fila.email),
    telefono: texto(fila.telefono),
    celular: texto(fila.celular),
    gln: texto(fila.gln),
    telefonoDdi: texto(fila.telefono_ddi),
    celularDdi: texto(fila.celular_ddi),
    contactoPrincipal: {
      nombre: [texto(fila.contacto_nombre), texto(fila.contacto_apellido)].filter(Boolean).join(" "),
      telefono: texto(fila.contacto_telefono),
      celular: texto(fila.contacto_celular),
      telefonoDdi: texto(fila.contacto_telefono_ddi),
      celularDdi: texto(fila.contacto_celular_ddi),
    },
    limiteCredito:
      Number(fila.limite_credito) || 0,
    grupoCliente: texto(
      fila.grupo_cliente_nombre,
    ),
    condicionPago: texto(
      fila.condicion_pago_nombre,
    ),
    vendedor: texto(
      fila.vendedor_nombre,
    ),
    rutaEntrega: texto(
      fila.ruta_entrega_nombre,
    ),
    zonaComercial: texto(
      fila.zona_comercial_nombre,
    ),
    bloqueadoVentas:
      fila.bloqueado_ventas === true,
    activo: fila.activo !== false,
  };
}

function documento(cliente: ClienteLista) {
  if (
    cliente.naturaleza ===
    "CONTRIBUYENTE"
  ) {
    return `RUC ${cliente.numeroDocumento}${
      cliente.dv
        ? `-${cliente.dv}`
        : ""
    }`;
  }

  if (
    cliente.tipoDocumento ===
    "INNOMINADO"
  ) {
    return "Innominado";
  }

  return `${cliente.tipoDocumento.replaceAll(
    "_",
    " ",
  )} ${cliente.numeroDocumento}`;
}

/** Columna "Contacto principal": el contacto marcado como principal; si no hay, los datos fiscales del cliente. */
function contactoPrincipal(cliente: ClienteLista) {
  const c = cliente.contactoPrincipal;
  const telefonoContacto = telefonoVisible(c.telefonoDdi, c.telefono) || telefonoVisible(c.celularDdi, c.celular);

  if (c.nombre) {
    return { titulo: c.nombre, detalle: telefonoContacto || "Sin teléfono" };
  }

  return {
    titulo: telefonoVisible(cliente.telefonoDdi, cliente.telefono) || telefonoVisible(cliente.celularDdi, cliente.celular) || "Sin teléfono",
    detalle: "",
  };
}

export default function ClientesPage() {
  const [clientes, setClientes] =
    useState<ClienteLista[]>([]);

  const [busqueda, setBusqueda] =
    useState("");

  const [
    filtroEstado,
    setFiltroEstado,
  ] =
    useState<EstadoFiltro>("TODOS");

  const [
    filtroNaturaleza,
    setFiltroNaturaleza,
  ] =
    useState<NaturalezaFiltro>("TODAS");

  const [
    filtroOperacion,
    setFiltroOperacion,
  ] =
    useState<OperacionFiltro>("TODAS");

  const [pagina, setPagina] =
    useState(1);

  const [flash, setFlash] =
    useState("");

  const [cargando, setCargando] =
    useState(true);

  const [errorCarga, setErrorCarga] =
    useState("");

  const [orden, setOrden] = useState<Orden>(null);

  useEffect(() => {
    let activo = true;

    async function cargar() {
      try {
        const respuesta = await fetch(
          "/api/clientes?modo=lista",
          { cache: "no-store" },
        );
        const datos =
          (await respuesta.json()) as {
            clientes?: Record<
              string,
              unknown
            >[];
            error?: string;
          };

        if (!respuesta.ok) {
          throw new Error(
            datos.error ??
              "No fue posible cargar los clientes.",
          );
        }

        if (activo) {
          setClientes(
            (datos.clientes ?? []).map(
              desdeApi,
            ),
          );
        }
      } catch (error) {
        if (activo) {
          setClientes([]);
          setErrorCarga(
            error instanceof Error
              ? error.message
              : "No fue posible cargar los clientes.",
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
      setFlash(
        ok === "creado"
          ? "Cliente registrado correctamente."
          : "Cliente actualizado correctamente.",
      );
      window.history.replaceState(
        null,
        "",
        "/clientes",
      );
    }

    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    setPagina(1);
  }, [
    busqueda,
    filtroEstado,
    filtroNaturaleza,
    filtroOperacion,
    orden,
  ]);

  useEffect(() => {
    if (!flash) {
      return;
    }

    const timer = window.setTimeout(
      () => setFlash(""),
      4200,
    );

    return () => {
      window.clearTimeout(timer);
    };
  }, [flash]);

  const resumo = useMemo(() => {
    return clientes.reduce(
      (acc, cliente) => {
        acc.total += 1;

        if (cliente.activo) {
          acc.activos += 1;
        } else {
          acc.inactivos += 1;
        }

        if (
          cliente.bloqueadoVentas
        ) {
          acc.bloqueados += 1;
        }

        acc.credito +=
          cliente.limiteCredito;

        return acc;
      },
      {
        total: 0,
        activos: 0,
        inactivos: 0,
        bloqueados: 0,
        credito: 0,
      },
    );
  }, [clientes]);

  const filtrados = useMemo(() => {
    const term =
      busqueda
        .trim()
        .toLocaleLowerCase("es");

    return clientes.filter(
      (cliente) => {
        if (
          filtroEstado ===
            "ACTIVOS" &&
          !cliente.activo
        ) {
          return false;
        }

        if (
          filtroEstado ===
            "INACTIVOS" &&
          cliente.activo
        ) {
          return false;
        }

        if (
          filtroEstado ===
            "BLOQUEADOS" &&
          !cliente.bloqueadoVentas
        ) {
          return false;
        }

        if (
          filtroNaturaleza !==
            "TODAS" &&
          cliente.naturaleza !==
            filtroNaturaleza
        ) {
          return false;
        }

        if (
          filtroOperacion !==
            "TODAS" &&
          cliente.tipoOperacion !==
            filtroOperacion
        ) {
          return false;
        }

        if (!term) {
          return true;
        }

        const principal = cliente.contactoPrincipal;
        const campos = [
          cliente.codigo,
          cliente.razonSocial,
          cliente.nombreFantasia,
          cliente.numeroDocumento,
          cliente.dv,
          cliente.email,
          cliente.telefono,
          cliente.celular,
          cliente.gln,
          cliente.grupoCliente,
          cliente.vendedor,
          cliente.rutaEntrega,
          cliente.zonaComercial,
          principal.nombre,
          principal.telefono,
          principal.celular,
        ];
        const digitos = soloDigitos(term);
        // Teléfonos: se compara también solo por dígitos (con o sin DDI, espacios o guiones).
        const numeros = [cliente.telefono, cliente.celular, principal.telefono, principal.celular].map(soloDigitos).filter(Boolean);

        return (
          campos.join(" ").toLocaleLowerCase("es").includes(term) ||
          (digitos.length >= 3 && numeros.some((n) => n.includes(digitos)))
        );
      },
    );
  }, [
    clientes,
    busqueda,
    filtroEstado,
    filtroNaturaleza,
    filtroOperacion,
  ]);

  // Ordenación sobre el conjunto filtrado COMPLETO (todos los clientes están cargados en el cliente), antes de paginar.
  const ordenados = useMemo(() => {
    if (!orden) {
      return filtrados;
    }

    const factor = orden.dir === "asc" ? 1 : -1;
    const texto = (a: string, b: string) =>
      a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
    const rango = (c: ClienteLista) => (!c.activo ? 2 : c.bloqueadoVentas ? 1 : 0);

    return [...filtrados].sort((a, b) => {
      switch (orden.campo) {
        case "cliente":
          return factor * texto(a.razonSocial, b.razonSocial);
        case "identificacion":
          return factor * texto(documento(a), documento(b));
        case "comercial":
          return factor * texto(a.grupoCliente, b.grupoCliente);
        case "credito":
          return factor * (a.limiteCredito - b.limiteCredito);
        case "estado":
          return factor * (rango(a) - rango(b));
      }
    });
  }, [filtrados, orden]);

  // Ciclo: sin orden (el de la API) → ascendente → descendente → sin orden.
  function cambiarOrden(campo: CampoOrden) {
    setOrden((actual) => {
      if (!actual || actual.campo !== campo) {
        return { campo, dir: "asc" };
      }

      return actual.dir === "asc" ? { campo, dir: "desc" } : null;
    });
  }

  const totalPaginas = Math.max(
    1,
    Math.ceil(
      filtrados.length /
        PAGE_SIZE,
    ),
  );

  useEffect(() => {
    if (pagina > totalPaginas) {
      setPagina(totalPaginas);
    }
  }, [pagina, totalPaginas]);

  const paginaActual = useMemo(
    () =>
      ordenados.slice(
        (pagina - 1) * PAGE_SIZE,
        pagina * PAGE_SIZE,
      ),
    [ordenados, pagina],
  );

  function limpiarFiltros() {
    setBusqueda("");
    setFiltroEstado("TODOS");
    setFiltroNaturaleza("TODAS");
    setFiltroOperacion("TODAS");
  }

  return (
    <section className={styles.page}>
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

      <header className={styles.topbar}>
        <div className={styles.titleBlock}>
          <nav className={styles.breadcrumb} aria-label="Ruta de navegación">
            <span>Maestros</span>
            <i aria-hidden="true">/</i>
            <span aria-current="page">Clientes</span>
          </nav>

          <h1>Clientes</h1>
        </div>

        <Link href="/clientes/nuevo" className={styles.primaryButton}>
          <span aria-hidden="true">+</span>
          Nuevo cliente
        </Link>
      </header>

      <section className={styles.summaryGrid} aria-label="Resumen de clientes">
        <article className={[styles.summaryCard, styles.summaryTeal].join(" ")}>
          <span>Clientes activos</span>
          <strong>{resumo.activos}</strong>
          <small>Disponibles para operar</small>
        </article>

        <article className={[styles.summaryCard, styles.summaryBlue].join(" ")}>
          <span>Suma de límites de crédito</span>
          <strong>{dinero(resumo.credito)}</strong>
          <small>Moneda de los límites por definir</small>
        </article>

        <article className={[styles.summaryCard, styles.summaryRed].join(" ")}>
          <span>Ventas bloqueadas</span>
          <strong>{resumo.bloqueados}</strong>
          <small>Requieren revisión</small>
        </article>

        <article className={[styles.summaryCard, styles.summaryViolet].join(" ")}>
          <span>Inactivos</span>
          <strong>{resumo.inactivos}</strong>
          <small>Sin operación habilitada</small>
        </article>
      </section>

      <section className={styles.contentCard}>
        <div className={styles.toolbar}>
          <label className={styles.search}>
            <span aria-hidden="true">⌕</span>

            <input
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Buscar por nombre, código, RUC, teléfono, contacto, GLN, vendedor..."
              aria-label="Buscar clientes"
            />
          </label>

          <label className={styles.filterField}>
            <span>Estado</span>
            <select
              value={filtroEstado}
              onChange={(event) => setFiltroEstado(event.target.value as EstadoFiltro)}
            >
              <option value="TODOS">Todos</option>
              <option value="ACTIVOS">Activos</option>
              <option value="INACTIVOS">Inactivos</option>
              <option value="BLOQUEADOS">Ventas bloqueadas</option>
            </select>
          </label>

          <label className={styles.filterField}>
            <span>Naturaleza</span>
            <select
              value={filtroNaturaleza}
              onChange={(event) => setFiltroNaturaleza(event.target.value as NaturalezaFiltro)}
            >
              <option value="TODAS">Todas</option>
              <option value="CONTRIBUYENTE">Contribuyente</option>
              <option value="NO_CONTRIBUYENTE">No contribuyente</option>
            </select>
          </label>

          <label className={styles.filterField}>
            <span>Operación</span>
            <select
              value={filtroOperacion}
              onChange={(event) => setFiltroOperacion(event.target.value as OperacionFiltro)}
            >
              <option value="TODAS">Todas</option>
              <option value="B2B">B2B</option>
              <option value="B2C">B2C</option>
              <option value="B2G">B2G</option>
              <option value="B2F">B2F</option>
            </select>
          </label>

          <button type="button" className={styles.clearButton} onClick={limpiarFiltros}>
            Limpiar filtros
          </button>

          <span className={styles.resultCount} aria-live="polite">
            {filtrados.length} de {resumo.total}
          </span>
        </div>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                {COLUMNAS.map((columna) => (
                  <th
                    key={columna.clave}
                    scope="col"
                    className={columna.clase ? styles[columna.clase] : undefined}
                    aria-sort={
                      !columna.orden
                        ? undefined
                        : orden?.campo === columna.orden
                          ? orden.dir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                    }
                  >
                    {columna.orden ? (
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => cambiarOrden(columna.orden as CampoOrden)}
                        title={`Ordenar por ${columna.titulo.toLowerCase()}`}
                      >
                        {columna.titulo}
                        <i aria-hidden="true">
                          {orden?.campo === columna.orden ? (orden.dir === "asc" ? "▲" : "▼") : "⇅"}
                        </i>
                      </button>
                    ) : (
                      columna.titulo
                    )}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={COLUMNAS.length} className={styles.emptyCell}>
                    <div className={styles.empty}>
                      <strong>Cargando clientes...</strong>
                    </div>
                  </td>
                </tr>
              ) : errorCarga ? (
                <tr>
                  <td colSpan={COLUMNAS.length} className={styles.emptyCell}>
                    <div className={styles.empty} role="alert">
                      <strong>No fue posible cargar los clientes</strong>
                      <span>{errorCarga}</span>
                    </div>
                  </td>
                </tr>
              ) : paginaActual.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNAS.length} className={styles.emptyCell}>
                    <div className={styles.empty}>
                      <strong>
                        {clientes.length === 0 ? "Aún no hay clientes registrados" : "No encontramos clientes"}
                      </strong>
                      <span>
                        {clientes.length === 0
                          ? "Cree su primer cliente para comenzar a operar."
                          : "Cambie los filtros o registre un nuevo cliente."}
                      </span>
                      {clientes.length === 0 ? (
                        <Link href="/clientes/nuevo" className={styles.emptyAction}>
                          + Nuevo cliente
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : (
                paginaActual.map((cliente) => (
                  <tr key={cliente.id} className={styles.row}>
                    <td>
                      <div className={styles.clientMain}>
                        <div className={styles.avatar} aria-hidden="true">
                          {cliente.razonSocial
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((part) => part.charAt(0).toUpperCase())
                            .join("")}
                        </div>

                        <div className={styles.clientIdentity}>
                          <Link href={`/clientes/${cliente.id}`} className={styles.clientName}>
                            {cliente.razonSocial}
                          </Link>
                          <span className={styles.code}>{cliente.codigo}</span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className={styles.cell}>
                        <strong>{documento(cliente)}</strong>
                        <span>
                          {cliente.tipoOperacion === "DESCONOCIDA" ? "Operación a revisar" : cliente.tipoOperacion}
                          <i>·</i>
                          {cliente.paisNombre}
                        </span>
                      </div>
                    </td>

                    <td>
                      <div className={styles.cell}>
                        <strong>{cliente.grupoCliente || "Sin grupo"}</strong>
                        <span>{cliente.vendedor || "Sin vendedor"}</span>
                        <span>{cliente.rutaEntrega || cliente.zonaComercial || "Sin ruta o zona"}</span>
                      </div>
                    </td>

                    <td>
                      <div className={styles.cell}>
                        <strong>{contactoPrincipal(cliente).titulo}</strong>
                        {contactoPrincipal(cliente).detalle ? <span>{contactoPrincipal(cliente).detalle}</span> : null}
                        <span className={styles.breakable}>{cliente.email || "Sin correo"}</span>
                      </div>
                    </td>

                    <td className={styles.numeric}>
                      <div className={styles.cell}>
                        <strong>{dinero(cliente.limiteCredito)}</strong>
                        <span>{cliente.condicionPago}</span>
                      </div>
                    </td>

                    <td>
                      <div className={styles.statuses}>
                        <span className={cliente.activo ? styles.statusActive : styles.statusInactive}>
                          {cliente.activo ? "Activo" : "Inactivo"}
                        </span>

                        {cliente.bloqueadoVentas ? (
                          <span className={styles.statusBlocked}>Bloqueado</span>
                        ) : null}
                      </div>
                    </td>

                    <td className={styles.actionsCell}>
                      <Link
                        href={`/clientes/${cliente.id}`}
                        className={styles.detailButton}
                        aria-label={`Ver ficha de ${cliente.razonSocial}`}
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

        <footer className={styles.pagination}>
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
