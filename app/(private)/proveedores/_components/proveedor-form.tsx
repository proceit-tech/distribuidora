"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

import { calcularDvRuc } from "@/lib/fiscal/calcular-dv-ruc";
import { validarPendientes, type DocumentoPendiente } from "@/lib/proveedores/documento-pendiente";
import { ErrorValidacion } from "@/lib/proveedores/errores";
import { formularioAPayload, formularioDesdeDetalle, formularioInicial, type FormularioProveedor } from "@/lib/proveedores/formulario";
import { normalizarProveedor, UUID } from "@/lib/proveedores/normalizar";
import { idCampo, pestanaDeCampo, type PestanaId } from "@/lib/proveedores/pestanas";
import { HOMOLOGACION_TEXTO } from "@/lib/proveedores/textos";
import { useProtegerCambios } from "@/lib/ui/proteger-cambios";
import type { CatalogoProveedores, ProveedorContacto, ProveedorCuentaBancaria, ProveedorDetalle, ProveedorDireccion } from "@/types/proveedores";

import { Bloque, type Errores } from "./campos";
import type { ColeccionClave, ContextoFormulario } from "./contexto";
import { PestanaBancos } from "./pestanas/bancos";
import { PestanaCompras } from "./pestanas/compras";
import { PestanaContactos } from "./pestanas/contactos";
import { PestanaDirecciones } from "./pestanas/direcciones";
import { PestanaDocumentos } from "./pestanas/documentos";
import { PestanaHomologacion } from "./pestanas/homologacion";
import { PestanaInformacion } from "./pestanas/informacion";
import { PestanaRetenciones } from "./pestanas/retenciones";
import styles from "./proveedor-form.module.css";

type Props = {
  mode: "create" | "edit";
  initial?: ProveedorDetalle;
  catalogos: CatalogoProveedores;
  /** Recibe el contrato de la API; debe lanzar ErrorValidacion (con campo) si el servidor lo rechaza. */
  onSave: (datos: Record<string, unknown>, documentos: DocumentoPendiente[]) => Promise<void> | void;
  /** Relee la ficha tras una acción administrativa (homologación, riesgo, bloqueo, aprobación bancaria). */
  onRecargar?: () => void;
  /** Aviso informativo bajo el encabezado (por ejemplo, documentos del alta que no pudieron cargarse). */
  aviso?: string;
  pestanaInicial?: PestanaId;
  alCambiarPestana?: (pestana: PestanaId) => void;
  /** PRV-D01: false cuando el usuario solo puede CREAR (la lista y las fichas exigen VER): no se ofrecen enlaces a ellas. */
  puedeVerLista?: boolean;
};

const PESTANAS: Array<{ id: PestanaId; etiqueta: string }> = [
  { id: "general", etiqueta: "Información" },
  { id: "compras", etiqueta: "Compras y pagos" },
  { id: "homologacion", etiqueta: "Homologación y logística" },
  { id: "contactos", etiqueta: "Contactos" },
  { id: "direcciones", etiqueta: "Direcciones" },
  { id: "bancos", etiqueta: "Cuentas bancarias" },
  { id: "retenciones", etiqueta: "Retenciones" },
  { id: "documentos", etiqueta: "Documentos" },
];

function temporal(prefijo: string) {
  return `nuevo-${prefijo}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nuevoContacto(): ProveedorContacto {
  return {
    id: temporal("contacto"),
    nombre: "",
    apellido: "",
    cargo: "",
    departamento: "",
    telefono: "",
    celular: "",
    email: "",
    esPrincipal: false,
    recibeCotizaciones: false,
    recibeOrdenesCompra: false,
    recibeLogistica: false,
    recibeDevoluciones: false,
    recibePagos: false,
    recibeCalidad: false,
    recibeNotificaciones: true,
  };
}

function nuevaDireccion(pais: string, nombrePais: string): ProveedorDireccion {
  return {
    id: temporal("direccion"),
    tipo: "COMERCIAL",
    descripcion: "",
    direccion: "",
    numeroCasa: "",
    paisCodigo: pais,
    paisNombre: nombrePais,
    departamentoCodigo: "",
    distritoCodigo: "",
    ciudadCodigo: "",
    departamento: "",
    distrito: "",
    ciudad: "",
    codigoPostal: "",
    esPrincipal: false,
  };
}

function nuevaCuenta(moneda: string): ProveedorCuentaBancaria {
  return {
    id: temporal("cuenta"),
    banco: "",
    sucursalBanco: "",
    titular: "",
    documentoTitular: "",
    tipoCuenta: "CORRIENTE",
    numeroCuenta: "",
    monedaCodigo: moneda || "PYG",
    aliasCuenta: "",
    codigoSwift: "",
    iban: "",
    esPrincipal: false,
  };
}

/** PRV-M02: el grupo / medio de pago ya asignados pero hoy inactivos se muestran «(inactivo)» para conservarlos; no se ofrecen como elección nueva si no son los actuales. */
export function catalogosConHistoricas(catalogos: CatalogoProveedores, historicas: ProveedorDetalle["referenciasHistoricas"]): CatalogoProveedores {
  const agregar = <T extends { id: string; nombre: string }>(lista: T[], campo: string): T[] => {
    const h = historicas?.[campo];

    return h && !lista.some((o) => o.id === h.id) ? [...lista, { ...(h as unknown as T), id: h.id, codigo: h.codigo, nombre: `${h.nombre} (inactivo)` }] : lista;
  };

  return { ...catalogos, grupos: agregar(catalogos.grupos, "grupoProveedorId"), mediosPago: agregar(catalogos.mediosPago, "medioPagoPreferidoId") };
}

export default function ProveedorForm({ mode, initial, catalogos: catalogosActivos, onSave, onRecargar, aviso, pestanaInicial, alCambiarPestana, puedeVerLista = true }: Props) {
  const catalogos = catalogosConHistoricas(catalogosActivos, initial?.referenciasHistoricas);
  const [formularioBase] = useState<FormularioProveedor>(() => (initial ? formularioDesdeDetalle(initial) : formularioInicial()));
  const [form, setForm] = useState<FormularioProveedor>(formularioBase);
  const [tab, setTabInterno] = useState<PestanaId>(pestanaInicial ?? "general");
  // PRV-D02: en edición, sin PROVEEDORES.EDITAR la ficha es de consulta para los datos maestros (el servidor lo exige igualmente).
  const soloLectura = mode === "edit" && initial?.permisos.editar !== true;
  const sucio = form !== formularioBase && JSON.stringify(form) !== JSON.stringify(formularioBase);

  const [borradorDocumento, setBorradorDocumento] = useState(false);
  const [guardado, setGuardado] = useState(false);

  function setTab(pestana: PestanaId) {
    // PRV-M03: salir de la pestaña de documentos con un documento en preparación lo descartaría; se pide confirmación específica.
    if (tab === "documentos" && pestana !== "documentos" && borradorDocumento && !window.confirm("Hay un documento en preparación en la pestaña Documentos. Si cambia de pestaña se perderá. ¿Desea continuar?")) return;

    setTabInterno(pestana);
    alCambiarPestana?.(pestana);
  }
  const [errores, setErrores] = useState<Errores>({});
  const [pestanaConError, setPestanaConError] = useState<PestanaId | "">("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [pendientes, setPendientes] = useState<DocumentoPendiente[]>([]);

  // PRV-M03: avisa al recargar/cerrar y al usar enlaces (Volver, Cancelar, menú) cuando hay cambios de la ficha, documentos adjuntos pendientes o un documento en preparación.
  useProtegerCambios((sucio || pendientes.length > 0 || borradorDocumento) && !guardado);

  const enfocar = useRef<string | null>(null);

  // Tras mostrar la pestaña del error se enfoca el campo exacto.
  useEffect(() => {
    if (!enfocar.current) return;

    const id = enfocar.current;
    enfocar.current = null;
    document.getElementById(id)?.focus();
  }, [tab, errores]);

  const titulo = mode === "create" ? "Nuevo proveedor" : "Editar proveedor";

  function set<K extends keyof FormularioProveedor>(clave: K, valor: FormularioProveedor[K]) {
    setForm((actual) => ({ ...actual, [clave]: valor }));
  }

  function cambiarIdentificacion(parche: Partial<Pick<FormularioProveedor, "paisCodigo" | "tipoDocumento" | "numeroDocumento">>) {
    setForm((actual) => {
      const siguiente = { ...actual, ...parche };

      if (parche.paisCodigo === "PRY" && actual.paisCodigo !== "PRY") siguiente.tipoDocumento = "RUC";

      siguiente.dv = siguiente.tipoDocumento === "RUC" ? (calcularDvRuc(siguiente.numeroDocumento) ?? "") : "";

      return siguiente;
    });
  }

  function agregar(coleccion: ColeccionClave) {
    setForm((actual) => {
      if (coleccion === "contactos") return { ...actual, contactos: [...actual.contactos, nuevoContacto()] };
      if (coleccion === "direcciones") {
        const pais = actual.paisCodigo || "PRY";

        return { ...actual, direcciones: [...actual.direcciones, nuevaDireccion(pais, catalogos.paises.find((p) => p.codigo === pais)?.nombre ?? "")] };
      }
      if (coleccion === "cuentasBancarias") return { ...actual, cuentasBancarias: [...actual.cuentasBancarias, nuevaCuenta(actual.monedaCodigoPredeterminada)] };

      return {
        ...actual,
        retenciones: [
          ...actual.retenciones,
          { id: temporal("retencion"), impuestoId: null, tipo: "IVA", porcentaje: "0", certificadoObligatorio: false, activa: true, documentoCertificadoId: null, fechaVigenciaDesde: "", fechaVigenciaHasta: "", observacion: "" },
        ],
      };
    });
  }

  function actualizar<C extends ColeccionClave>(coleccion: C, id: string, parche: Record<string, unknown>) {
    setForm((actual) => ({
      ...actual,
      [coleccion]: (actual[coleccion] as Array<{ id: string }>).map((fila) => (fila.id === id ? { ...fila, ...parche } : fila)),
    }));
  }

  function quitar(coleccion: ColeccionClave, id: string) {
    setForm((actual) => ({
      ...actual,
      [coleccion]: (actual[coleccion] as Array<{ id: string }>).filter((fila) => fila.id !== id),
      // Una fila ya guardada se elimina solo porque el usuario lo pidió: queda registrada para la baja explícita.
      eliminaciones: UUID.test(id) ? { ...actual.eliminaciones, [coleccion]: [...actual.eliminaciones[coleccion], id] } : actual.eliminaciones,
    }));
  }

  function marcarPrincipal(coleccion: "contactos" | "direcciones" | "cuentasBancarias", id: string, valor: boolean) {
    setForm((actual) => {
      const filas = actual[coleccion] as Array<{ id: string; esPrincipal: boolean; tipo?: string; monedaCodigo?: string }>;
      const objetivo = filas.find((f) => f.id === id);

      if (!objetivo) return actual;

      const mismoGrupo = (f: (typeof filas)[number]) =>
        coleccion === "contactos" ? true : coleccion === "direcciones" ? f.tipo === objetivo.tipo : f.monedaCodigo === objetivo.monedaCodigo;

      return {
        ...actual,
        [coleccion]: filas.map((f) => (f.id === id ? { ...f, esPrincipal: valor } : valor && mismoGrupo(f) ? { ...f, esPrincipal: false } : f)),
      };
    });
  }

  function mostrarError(e: ErrorValidacion) {
    setError(e.message);
    setErrores(e.campo ? { [e.campo]: e.message } : {});

    if (e.campo) {
      const pestana = pestanaDeCampo(e.campo);

      if (pestana) {
        setTab(pestana);
        setPestanaConError(pestana);
      }
      enfocar.current = idCampo(e.campo);
    } else {
      setPestanaConError("");
    }
  }

  async function submit(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (soloLectura) return;
    setError("");
    setErrores({});
    setPestanaConError("");

    let payload: Record<string, unknown>;

    try {
      payload = formularioAPayload(form, mode === "create" ? "crear" : "editar");
      normalizarProveedor(payload); // la misma validación que ejecuta el servidor
      validarPendientes(pendientes);
    } catch (e) {
      mostrarError(e instanceof ErrorValidacion ? e : new ErrorValidacion(e instanceof Error ? e.message : "Los datos no son válidos."));
      return;
    }

    setGuardando(true);

    try {
      await onSave(payload, pendientes);
      setGuardado(true);
    } catch (e) {
      mostrarError(
        e instanceof ErrorValidacion
          ? e
          : new ErrorValidacion(e instanceof Error && e.message ? e.message : mode === "create" ? "No fue posible registrar el proveedor." : "No fue posible actualizar el proveedor."),
      );
    } finally {
      setGuardando(false);
    }
  }

  const ctx: ContextoFormulario = {
    modo: mode === "create" ? "crear" : "editar",
    soloLectura,
    form,
    detalle: initial,
    catalogos,
    errores,
    pendientes,
    setPendientes,
    sucio,
    marcarBorradorDocumento: setBorradorDocumento,
    recargar: () => onRecargar?.(),
    set,
    cambiarIdentificacion,
    agregar,
    actualizar,
    quitar,
    marcarPrincipal,
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <nav className={styles.miga} aria-label="Ruta de navegación">
            <span>Maestros</span>
            <i aria-hidden="true">/</i>
            {puedeVerLista ? <Link href="/proveedores">Proveedores</Link> : <span>Proveedores</span>}
            <i aria-hidden="true">/</i>
            <span aria-current="page">{titulo}</span>
          </nav>

          <div className={styles.titulo}>
            <h1>{mode === "edit" && initial ? initial.razonSocial : titulo}</h1>

            {mode === "edit" && initial ? (
              <>
                <span className={styles.codigo}>{initial.codigo}</span>
                <span className={form.activo ? styles.statusActive : styles.statusInactive}>{form.activo ? "Activo" : "Inactivo"}</span>
                <span className={styles.statusNeutral}>{HOMOLOGACION_TEXTO[initial.estadoHomologacion] ?? initial.estadoHomologacion}</span>
              </>
            ) : null}
          </div>
        </div>

        {puedeVerLista ? (
          <Link href="/proveedores" className={styles.secondaryButton}>
            ← Volver a proveedores
          </Link>
        ) : null}
      </header>

      <form className={styles.card} onSubmit={submit} noValidate>
        {aviso ? (
          <div className={styles.aviso} role="status">
            {aviso}
          </div>
        ) : null}

        {error ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : null}

        <nav className={styles.tabs} aria-label="Secciones del proveedor">
          {PESTANAS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={tab === item.id ? "true" : undefined}
              className={[tab === item.id ? styles.tabActive : "", pestanaConError === item.id ? styles.tabError : ""].filter(Boolean).join(" ")}
              onClick={() => setTab(item.id)}
            >
              {item.etiqueta}
              {pestanaConError === item.id ? <span className={styles.sr}>(contiene un error)</span> : null}
            </button>
          ))}
        </nav>

        {tab === "general" ? <p className={styles.nota}>Los campos con * son obligatorios.</p> : null}

        <div className={styles.content}>
          {tab === "general" ? <Bloque bloqueado={soloLectura}><PestanaInformacion ctx={ctx} /></Bloque> : null}
          {tab === "compras" ? <Bloque bloqueado={soloLectura}><PestanaCompras ctx={ctx} /></Bloque> : null}
          {tab === "homologacion" ? <PestanaHomologacion ctx={ctx} /> : null}
          {tab === "contactos" ? <Bloque bloqueado={soloLectura}><PestanaContactos ctx={ctx} /></Bloque> : null}
          {tab === "direcciones" ? <Bloque bloqueado={soloLectura}><PestanaDirecciones ctx={ctx} /></Bloque> : null}
          {tab === "bancos" ? <PestanaBancos ctx={ctx} /> : null}
          {tab === "retenciones" ? <Bloque bloqueado={soloLectura}><PestanaRetenciones ctx={ctx} /></Bloque> : null}
          {tab === "documentos" ? <PestanaDocumentos ctx={ctx} /> : null}
        </div>

        <footer className={styles.footer}>
          <div className={styles.footerActions}>
            {puedeVerLista ? (
              <Link href="/proveedores" className={styles.cancelButton}>
                Cancelar
              </Link>
            ) : null}

            {soloLectura ? (
              <span className={styles.textoSecundario} role="status">Solo lectura: su perfil puede consultar este proveedor, pero no modificar sus datos maestros.</span>
            ) : (
              <button type="submit" disabled={guardando} className={styles.saveButton}>
                {guardando ? (mode === "create" ? "Guardando..." : "Actualizando...") : mode === "create" ? "Guardar proveedor" : "Actualizar proveedor"}
              </button>
            )}
          </div>
        </footer>
      </form>
    </main>
  );
}
