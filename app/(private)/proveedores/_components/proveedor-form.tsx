"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import type {
  CatalogoProveedores,
  NuevoProveedor,
  ProveedorContacto,
  ProveedorCuentaBancaria,
  ProveedorDetalle,
  ProveedorDireccion,
  ProveedorDocumento,
  ProveedorEstadoHomologacion,
  ProveedorNivelRiesgo,
  ProveedorRetencion,
  ProveedorTipoPersona,
} from "@/types/proveedores";

import styles from "./proveedor-form.module.css";

type Mode = "create" | "edit";

type Props = {
  mode: Mode;
  initial?: ProveedorDetalle;
  catalogos: CatalogoProveedores;
  onSave: (data: NuevoProveedor) => Promise<void> | void;
};

type TabId =
  | "general"
  | "compras"
  | "homologacion"
  | "contactos"
  | "direcciones"
  | "bancos"
  | "retenciones"
  | "documentos";

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "general", label: "Información" },
  { id: "compras", label: "Compras y pagos" },
  { id: "homologacion", label: "Homologación y logística" },
  { id: "contactos", label: "Contactos" },
  { id: "direcciones", label: "Direcciones" },
  { id: "bancos", label: "Cuentas bancarias" },
  { id: "retenciones", label: "Retenciones" },
  { id: "documentos", label: "Documentos" },
];

const HOMOLOGACION_TEXTO: Record<string, string> = {
  HOMOLOGADO: "Homologado",
  PENDIENTE: "Pendiente",
  EN_EVALUACION: "En evaluación",
  SUSPENDIDO: "Suspendido",
  VENCIDO: "Vencido",
  RECHAZADO: "Rechazado",
};

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function emptyContacto(): ProveedorContacto {
  return {
    id: uid("contacto"),
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

function emptyDireccion(): ProveedorDireccion {
  return {
    id: uid("direccion"),
    tipo: "COMERCIAL",
    descripcion: "",
    direccion: "",
    numeroCasa: "",
    paisCodigo: "PRY",
    paisNombre: "Paraguay",
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

function emptyCuenta(): ProveedorCuentaBancaria {
  return {
    id: uid("cuenta"),
    banco: "",
    sucursalBanco: "",
    titular: "",
    documentoTitular: "",
    tipoCuenta: "CORRIENTE",
    numeroCuenta: "",
    monedaCodigo: "PYG",
    aliasCuenta: "",
    codigoSwift: "",
    iban: "",
    esPrincipal: false,
  };
}

function emptyRetencion(): ProveedorRetencion {
  return {
    id: uid("retencion"),
    tipo: "IVA",
    porcentaje: 0,
    certificadoObligatorio: false,
    fechaVigenciaDesde: "",
    fechaVigenciaHasta: "",
    observacion: "",
  };
}

function emptyDocumento(): ProveedorDocumento {
  return {
    id: uid("documento"),
    tipo: "OTRO",
    nombreArchivo: "",
    urlArchivo: "",
    fechaEmision: "",
    fechaVencimiento: "",
    observacion: "",
  };
}

function initialForm(initial?: ProveedorDetalle): NuevoProveedor {
  if (initial) {
    const {
      id: _id,
      codigo: _codigo,
      creadoEn: _creadoEn,
      actualizadoEn: _actualizadoEn,
      ...rest
    } = initial;

    return structuredClone(rest);
  }

  return {
    tipoPersona: "JURIDICA",
    grupoProveedorId: null,
    tipoDocumento: "RUC",
    numeroDocumento: "",
    dv: "",
    razonSocial: "",
    nombreFantasia: "",
    paisCodigo: "PRY",
    paisNombre: "Paraguay",
    email: "",
    telefono: "",
    sitioWeb: "",
    condicionPagoId: null,
    monedaCodigoPredeterminada: "PYG",
    medioPagoPreferidoId: null,
    diaPagoPreferido: null,
    plazoEntregaDias: null,
    descuentoComercialPct: 0,
    montoMinimoCompra: 0,
    permiteAnticipos: false,
    requiereOrdenCompra: false,
    emailPagos: "",
    fechaInicioRelacion: "",
    fechaFinRelacion: "",
    estadoHomologacion: "PENDIENTE",
    fechaHomologacion: "",
    fechaVencimientoHomologacion: "",
    nivelRiesgo: "NO_EVALUADO",
    calificacionActual: null,
    incotermCodigo: "",
    condicionEntrega: "",
    metodoTransportePreferido: "",
    diasConfirmacionPedido: null,
    permiteEntregaParcial: true,
    contactos: [],
    direcciones: [],
    cuentasBancarias: [],
    retenciones: [],
    documentos: [],
    observacion: "",
    activo: true,
  };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span>
        {label.trimEnd().endsWith("*") ? label.trimEnd().slice(0, -1).trimEnd() : label}
        {label.trimEnd().endsWith("*") ? <b aria-hidden="true"> *</b> : null}
      </span>
      {children}
    </label>
  );
}

type Opcion = { codigo: number; nombre: string };

/** Paraguay: departamento / distrito / ciudad desde el catálogo oficial; otros países: texto libre. */
function GeografiaDireccion({
  direccion,
  departamentos,
  onChange,
}: {
  direccion: ProveedorDireccion;
  departamentos: Opcion[];
  onChange: (patch: Partial<ProveedorDireccion>) => void;
}) {
  const [distritos, setDistritos] = useState<Opcion[]>([]);
  const [ciudades, setCiudades] = useState<Opcion[]>([]);
  const esPy = direccion.paisCodigo === "PRY";
  const dep = direccion.departamentoCodigo;
  const dis = direccion.distritoCodigo;

  useEffect(() => {
    if (!esPy || !dep) {
      setDistritos([]);
      return;
    }
    let activo = true;
    fetch(`/api/proveedores?catalogo=distritos&departamento=${encodeURIComponent(dep)}`)
      .then((r) => (r.ok ? r.json() : { datos: [] }))
      .then((j) => activo && setDistritos(j.datos ?? []))
      .catch(() => activo && setDistritos([]));
    return () => {
      activo = false;
    };
  }, [esPy, dep]);

  useEffect(() => {
    if (!esPy || !dep || !dis) {
      setCiudades([]);
      return;
    }
    let activo = true;
    fetch(
      `/api/proveedores?catalogo=ciudades&departamento=${encodeURIComponent(dep)}&distrito=${encodeURIComponent(dis)}`,
    )
      .then((r) => (r.ok ? r.json() : { datos: [] }))
      .then((j) => activo && setCiudades(j.datos ?? []))
      .catch(() => activo && setCiudades([]));
    return () => {
      activo = false;
    };
  }, [esPy, dep, dis]);

  if (!esPy) {
    return (
      <>
        <Field label="Departamento / estado">
          <input
            value={direccion.departamento}
            onChange={(event) => onChange({ departamento: event.target.value })}
          />
        </Field>
        <Field label="Distrito / región">
          <input
            value={direccion.distrito}
            onChange={(event) => onChange({ distrito: event.target.value })}
          />
        </Field>
        <Field label="Ciudad">
          <input
            value={direccion.ciudad}
            onChange={(event) => onChange({ ciudad: event.target.value })}
          />
        </Field>
      </>
    );
  }

  return (
    <>
      <Field label="Departamento">
        <select
          value={dep}
          onChange={(event) =>
            onChange({ departamentoCodigo: event.target.value, distritoCodigo: "", ciudadCodigo: "" })
          }
        >
          <option value="">Seleccione</option>
          {departamentos.map((item) => (
            <option key={item.codigo} value={String(item.codigo)}>
              {item.nombre}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Distrito">
        <select
          value={dis}
          disabled={!dep}
          onChange={(event) => onChange({ distritoCodigo: event.target.value, ciudadCodigo: "" })}
        >
          <option value="">Seleccione</option>
          {distritos.map((item) => (
            <option key={item.codigo} value={String(item.codigo)}>
              {item.nombre}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Ciudad">
        <select
          value={direccion.ciudadCodigo}
          disabled={!dis}
          onChange={(event) => onChange({ ciudadCodigo: event.target.value })}
        >
          <option value="">Seleccione</option>
          {ciudades.map((item) => (
            <option key={item.codigo} value={String(item.codigo)}>
              {item.nombre}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}

export default function ProveedorForm({
  mode,
  initial,
  catalogos,
  onSave,
}: Props) {
  const paises = catalogos.paises.map(
    (pais) => [pais.codigo, pais.nombre] as const,
  );

  const [tab, setTab] =
    useState<TabId>("general");

  const [form, setForm] =
    useState<NuevoProveedor>(() =>
      initialForm(initial),
    );

  const [error, setError] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  const [tabError, setTabError] =
    useState<TabId | "">("");

  function update<K extends keyof NuevoProveedor>(
    key: K,
    value: NuevoProveedor[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  const pageTitle =
    mode === "create"
      ? "Nuevo proveedor"
      : "Editar proveedor";

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError("");
    setTabError("");

    if (!form.razonSocial.trim()) {
      setTab("general");
      setTabError("general");
      setError("Informe el nombre o razón social del proveedor.");
      return;
    }

    if (
      form.paisCodigo === "PRY" &&
      form.tipoDocumento !== "RUC"
    ) {
      setTab("general");
      setTabError("general");
      setError("Un proveedor de Paraguay debe utilizar RUC.");
      return;
    }

    if (
      form.tipoDocumento === "RUC" &&
      (
        !/^\d{3,8}$/.test(form.numeroDocumento.trim()) ||
        !/^\d$/.test(form.dv.trim())
      )
    ) {
      setTab("general");
      setTabError("general");
      setError("El RUC debe tener entre 3 y 8 dígitos y un DV de un dígito.");
      return;
    }

    setSaving(true);

    try {
      await onSave({
        ...form,
        razonSocial: form.razonSocial.trim().toUpperCase(),
        nombreFantasia: form.nombreFantasia.trim(),
        email: form.email.trim(),
        telefono: form.telefono.trim(),
        sitioWeb: form.sitioWeb.trim(),
        emailPagos: form.emailPagos.trim(),
        observacion: form.observacion.trim(),
      });
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : mode === "create"
          ? "No fue posible registrar el proveedor."
          : "No fue posible actualizar el proveedor.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <nav className={styles.miga} aria-label="Ruta de navegación">
            <span>Maestros</span>
            <i aria-hidden="true">/</i>
            <Link href="/proveedores">Proveedores</Link>
            <i aria-hidden="true">/</i>
            <span aria-current="page">{pageTitle}</span>
          </nav>

          <div className={styles.titulo}>
            <h1>{mode === "edit" && initial ? initial.razonSocial : pageTitle}</h1>

            {mode === "edit" && initial ? (
              <>
                <span className={styles.codigo}>{initial.codigo}</span>
                <span className={form.activo ? styles.statusActive : styles.statusInactive}>
                  {form.activo ? "Activo" : "Inactivo"}
                </span>
                <span className={styles.statusNeutral}>
                  {HOMOLOGACION_TEXTO[form.estadoHomologacion] ?? form.estadoHomologacion}
                </span>
              </>
            ) : null}
          </div>
        </div>

        <Link href="/proveedores" className={styles.secondaryButton}>
          ← Volver a proveedores
        </Link>
      </header>

      <form className={styles.card} onSubmit={submit}>
        {error ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : null}

        <nav className={styles.tabs} aria-label="Secciones del proveedor">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={tab === item.id ? "true" : undefined}
              className={[
                tab === item.id ? styles.tabActive : "",
                tabError === item.id ? styles.tabError : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              {tabError === item.id ? <span className={styles.sr}>(contiene un error)</span> : null}
            </button>
          ))}
        </nav>

        {tab === "general" ? <p className={styles.nota}>Los campos con * son obligatorios.</p> : null}

        <div className={styles.content}>
          {tab === "general" ? (
            <>
              <div className={styles.sectionTitle}>
                <div>
                  <h3>Identificación y contacto</h3>
                </div>
              </div>

              <div className={styles.gridFour}>
                <Field label="Tipo de persona *">
                  <select
                    value={form.tipoPersona}
                    onChange={(event) =>
                      update(
                        "tipoPersona",
                        event.target
                          .value as ProveedorTipoPersona,
                      )
                    }
                  >
                    <option value="JURIDICA">Persona jurídica</option>
                    <option value="FISICA">Persona física</option>
                  </select>
                </Field>

                <Field label="Tipo de documento *">
                  <select
                    value={form.tipoDocumento}
                    onChange={(event) =>
                      update(
                        "tipoDocumento",
                        event.target.value,
                      )
                    }
                  >
                    <option value="RUC">RUC</option>
                    <option value="CEDULA">Cédula paraguaya</option>
                    <option value="PASAPORTE">Pasaporte</option>
                    <option value="CEDULA_EXTRANJERA">Cédula extranjera</option>
                    <option value="CUIT">CUIT</option>
                    <option value="OTRO">Otro documento</option>
                  </select>
                </Field>

                <Field label={form.tipoDocumento === "RUC" ? "RUC *" : "Número documento *"}>
                  <input
                    value={form.numeroDocumento}
                    onChange={(event) =>
                      update(
                        "numeroDocumento",
                        event.target.value.replace(/\s/g, ""),
                      )
                    }
                  />
                </Field>

                <Field label="DV">
                  <input
                    value={form.dv}
                    disabled={form.tipoDocumento !== "RUC"}
                    maxLength={1}
                    onChange={(event) =>
                      update(
                        "dv",
                        event.target.value.replace(/\D/g, "").slice(0, 1),
                      )
                    }
                  />
                </Field>
              </div>

              <div className={styles.gridThree}>
                <Field label="Nombre o razón social *">
                  <input
                    value={form.razonSocial}
                    onChange={(event) =>
                      update("razonSocial", event.target.value)
                    }
                  />
                </Field>

                <Field label="Nombre de fantasía">
                  <input
                    value={form.nombreFantasia}
                    onChange={(event) =>
                      update("nombreFantasia", event.target.value)
                    }
                  />
                </Field>

                <Field label="Grupo de proveedor">
                  <select
                    value={form.grupoProveedorId ?? ""}
                    onChange={(event) =>
                      update("grupoProveedorId", event.target.value || null)
                    }
                  >
                    <option value="">Sin grupo</option>
                    {catalogos.grupos.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nombre}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className={styles.gridFour}>
                <Field label="País *">
                  <select
                    value={form.paisCodigo}
                    onChange={(event) => {
                      const code = event.target.value;
                      const country =
                        paises.find(([value]) => value === code);

                      update("paisCodigo", code);
                      update("paisNombre", country?.[1] ?? "");

                      if (code === "PRY") {
                        update("tipoDocumento", "RUC");
                      }
                    }}
                  >
                    {paises.map(([code, name]) => (
                      <option key={code} value={code}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Teléfono">
                  <input
                    value={form.telefono}
                    onChange={(event) =>
                      update("telefono", event.target.value)
                    }
                  />
                </Field>

                <Field label="Correo electrónico">
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      update("email", event.target.value)
                    }
                  />
                </Field>

                <Field label="Sitio web">
                  <input
                    value={form.sitioWeb}
                    onChange={(event) =>
                      update("sitioWeb", event.target.value)
                    }
                  />
                </Field>
              </div>

              {mode === "edit" ? (
                <div className={styles.checkGrid}>
                  <label>
                    <input
                      type="checkbox"
                      checked={form.activo}
                      onChange={(event) =>
                        update("activo", event.target.checked)
                      }
                    />
                    Proveedor activo
                  </label>
                </div>
              ) : null}
            </>
          ) : null}

          {tab === "compras" ? (
            <>
              <div className={styles.sectionTitle}>
                <div>
                  <h3>Compras y pagos</h3>
                </div>
              </div>

              <div className={styles.gridFour}>
                <Field label="Condición de pago">
                  <select
                    value={form.condicionPagoId ?? ""}
                    onChange={(event) =>
                      update("condicionPagoId", event.target.value || null)
                    }
                  >
                    <option value="">Sin condición</option>
                    {catalogos.condicionesPago.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nombre}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Moneda predeterminada">
                  <select
                    value={form.monedaCodigoPredeterminada}
                    onChange={(event) =>
                      update("monedaCodigoPredeterminada", event.target.value)
                    }
                  >
                    {catalogos.monedas.map((item) => (
                      <option key={item.codigo} value={item.codigo}>
                        {item.codigo} · {item.nombre}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Medio de pago preferido">
                  <select
                    value={form.medioPagoPreferidoId ?? ""}
                    onChange={(event) =>
                      update("medioPagoPreferidoId", event.target.value || null)
                    }
                  >
                    <option value="">Sin medio</option>
                    {catalogos.mediosPago.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nombre}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Día preferido de pago">
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={form.diaPagoPreferido ?? ""}
                    onChange={(event) =>
                      update(
                        "diaPagoPreferido",
                        event.target.value
                          ? Number(event.target.value)
                          : null,
                      )
                    }
                  />
                </Field>
              </div>

              <div className={styles.gridFour}>
                <Field label="Plazo de entrega (días)">
                  <input
                    type="number"
                    min={0}
                    value={form.plazoEntregaDias ?? ""}
                    onChange={(event) =>
                      update(
                        "plazoEntregaDias",
                        event.target.value
                          ? Number(event.target.value)
                          : null,
                      )
                    }
                  />
                </Field>

                <Field label="Descuento comercial (%)">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={form.descuentoComercialPct}
                    onChange={(event) =>
                      update("descuentoComercialPct", Number(event.target.value || 0))
                    }
                  />
                </Field>

                <Field label="Monto mínimo de compra">
                  <input
                    type="number"
                    min={0}
                    value={form.montoMinimoCompra}
                    onChange={(event) =>
                      update("montoMinimoCompra", Number(event.target.value || 0))
                    }
                  />
                </Field>

                <Field label="Correo para pagos">
                  <input
                    type="email"
                    value={form.emailPagos}
                    onChange={(event) =>
                      update("emailPagos", event.target.value)
                    }
                  />
                </Field>
              </div>

              <div className={styles.gridTwo}>
                <Field label="Fecha inicio de relación">
                  <input
                    type="date"
                    value={form.fechaInicioRelacion}
                    onChange={(event) =>
                      update("fechaInicioRelacion", event.target.value)
                    }
                  />
                </Field>

                <Field label="Fecha finalización">
                  <input
                    type="date"
                    value={form.fechaFinRelacion}
                    onChange={(event) =>
                      update("fechaFinRelacion", event.target.value)
                    }
                  />
                </Field>
              </div>

              <div className={styles.checkGrid}>
                <label>
                  <input
                    type="checkbox"
                    checked={form.permiteAnticipos}
                    onChange={(event) =>
                      update("permiteAnticipos", event.target.checked)
                    }
                  />
                  Permite anticipos
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={form.requiereOrdenCompra}
                    onChange={(event) =>
                      update("requiereOrdenCompra", event.target.checked)
                    }
                  />
                  Requiere orden de compra
                </label>
              </div>
            </>
          ) : null}

          {tab === "homologacion" ? (
            <>
              <div className={styles.sectionTitle}>
                <div>
                  <h3>Homologación y logística</h3>
                </div>
              </div>

              <div className={styles.gridFour}>
                <Field label="Estado de homologación">
                  <select
                    value={form.estadoHomologacion}
                    onChange={(event) =>
                      update(
                        "estadoHomologacion",
                        event.target.value as ProveedorEstadoHomologacion,
                      )
                    }
                  >
                    <option value="PENDIENTE">Pendiente</option>
                    <option value="EN_EVALUACION">En evaluación</option>
                    <option value="HOMOLOGADO">Homologado</option>
                    <option value="RECHAZADO">Rechazado</option>
                    <option value="SUSPENDIDO">Suspendido</option>
                    <option value="VENCIDO">Vencido</option>
                  </select>
                </Field>

                <Field label="Nivel de riesgo">
                  <select
                    value={form.nivelRiesgo}
                    onChange={(event) =>
                      update(
                        "nivelRiesgo",
                        event.target.value as ProveedorNivelRiesgo,
                      )
                    }
                  >
                    <option value="NO_EVALUADO">No evaluado</option>
                    <option value="BAJO">Bajo</option>
                    <option value="MEDIO">Medio</option>
                    <option value="ALTO">Alto</option>
                    <option value="CRITICO">Crítico</option>
                  </select>
                </Field>

                <Field label="Calificación actual">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.calificacionActual ?? ""}
                    onChange={(event) =>
                      update(
                        "calificacionActual",
                        event.target.value
                          ? Number(event.target.value)
                          : null,
                      )
                    }
                  />
                </Field>

                <Field label="Incoterm">
                  <select
                    value={form.incotermCodigo}
                    onChange={(event) =>
                      update("incotermCodigo", event.target.value)
                    }
                  >
                    <option value="">Sin Incoterm</option>
                    {catalogos.incoterms.map((item) => (
                      <option key={item.codigo} value={item.codigo}>
                        {item.codigo}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className={styles.gridFour}>
                <Field label="Fecha de homologación">
                  <input
                    type="date"
                    value={form.fechaHomologacion}
                    onChange={(event) =>
                      update("fechaHomologacion", event.target.value)
                    }
                  />
                </Field>

                <Field label="Vencimiento homologación">
                  <input
                    type="date"
                    value={form.fechaVencimientoHomologacion}
                    onChange={(event) =>
                      update("fechaVencimientoHomologacion", event.target.value)
                    }
                  />
                </Field>

                <Field label="Transporte preferido">
                  <select
                    value={form.metodoTransportePreferido}
                    onChange={(event) =>
                      update("metodoTransportePreferido", event.target.value)
                    }
                  >
                    <option value="">Sin preferencia</option>
                    <option value="TERRESTRE">Terrestre</option>
                    <option value="MARITIMO">Marítimo</option>
                    <option value="AEREO">Aéreo</option>
                    <option value="FERROVIARIO">Ferroviario</option>
                    <option value="MULTIMODAL">Multimodal</option>
                    <option value="OTRO">Otro</option>
                  </select>
                </Field>

                <Field label="Días para confirmar pedido">
                  <input
                    type="number"
                    min={0}
                    value={form.diasConfirmacionPedido ?? ""}
                    onChange={(event) =>
                      update(
                        "diasConfirmacionPedido",
                        event.target.value
                          ? Number(event.target.value)
                          : null,
                      )
                    }
                  />
                </Field>
              </div>

              <Field label="Condición de entrega">
                <textarea
                  value={form.condicionEntrega}
                  onChange={(event) =>
                    update("condicionEntrega", event.target.value)
                  }
                />
              </Field>

              <div className={styles.checkGrid}>
                <label>
                  <input
                    type="checkbox"
                    checked={form.permiteEntregaParcial}
                    onChange={(event) =>
                      update("permiteEntregaParcial", event.target.checked)
                    }
                  />
                  Permite entrega parcial
                </label>
              </div>
            </>
          ) : null}

          {tab === "contactos" ? (
            <>
              <div className={styles.sectionTitle}>
                <div>
                  <h3>Contactos</h3>
                </div>

                <button
                  type="button"
                  className={styles.addButton}
                  onClick={() =>
                    update("contactos", [
                      ...form.contactos,
                      emptyContacto(),
                    ])
                  }
                >
                  + Agregar contacto
                </button>
              </div>

              <RepeaterEmpty
                empty={form.contactos.length === 0}
                text="Aún no hay contactos cargados."
              />

              <div className={styles.repeaterList}>
                {form.contactos.map((contacto, index) => (
                  <article key={contacto.id} className={styles.repeaterCard}>
                    <header>
                      <strong>Contacto {index + 1}</strong>
                      <button
                        type="button"
                        onClick={() =>
                          update(
                            "contactos",
                            form.contactos.filter((item) => item.id !== contacto.id),
                          )
                        }
                      >
                        Eliminar
                      </button>
                    </header>

                    <div className={styles.gridFour}>
                      {(["nombre", "apellido", "cargo", "departamento"] as const).map((key) => (
                        <Field key={key} label={key === "departamento" ? "Departamento / área" : key[0].toUpperCase() + key.slice(1)}>
                          <input
                            value={contacto[key]}
                            onChange={(event) =>
                              update(
                                "contactos",
                                form.contactos.map((item) =>
                                  item.id === contacto.id
                                    ? { ...item, [key]: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </Field>
                      ))}
                    </div>

                    <div className={styles.gridThree}>
                      {(["telefono", "celular", "email"] as const).map((key) => (
                        <Field key={key} label={key === "email" ? "Correo" : key[0].toUpperCase() + key.slice(1)}>
                          <input
                            value={contacto[key]}
                            onChange={(event) =>
                              update(
                                "contactos",
                                form.contactos.map((item) =>
                                  item.id === contacto.id
                                    ? { ...item, [key]: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </Field>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}

          {tab === "direcciones" ? (
            <>
              <div className={styles.sectionTitle}>
                <div>
                  <h3>Direcciones</h3>
                </div>

                <button
                  type="button"
                  className={styles.addButton}
                  onClick={() =>
                    update("direcciones", [
                      ...form.direcciones,
                      emptyDireccion(),
                    ])
                  }
                >
                  + Agregar dirección
                </button>
              </div>

              <RepeaterEmpty
                empty={form.direcciones.length === 0}
                text="Aún no hay direcciones cargadas."
              />

              <div className={styles.repeaterList}>
                {form.direcciones.map((direccion, index) => (
                  <article key={direccion.id} className={styles.repeaterCard}>
                    <header>
                      <strong>Dirección {index + 1}</strong>
                      <button
                        type="button"
                        onClick={() =>
                          update(
                            "direcciones",
                            form.direcciones.filter((item) => item.id !== direccion.id),
                          )
                        }
                      >
                        Eliminar
                      </button>
                    </header>

                    <div className={styles.gridFour}>
                      <Field label="Tipo">
                        <select
                          value={direccion.tipo}
                          onChange={(event) =>
                            update(
                              "direcciones",
                              form.direcciones.map((item) =>
                                item.id === direccion.id
                                  ? {
                                      ...item,
                                      tipo: event.target.value as ProveedorDireccion["tipo"],
                                    }
                                  : item,
                              ),
                            )
                          }
                        >
                          <option value="FISCAL">Fiscal</option>
                          <option value="COMERCIAL">Comercial</option>
                          <option value="RETIRO">Retiro / depósito</option>
                          <option value="PAGOS">Pagos</option>
                          <option value="OTRA">Otra</option>
                        </select>
                      </Field>

                      <Field label="Descripción">
                        <input
                          value={direccion.descripcion}
                          onChange={(event) =>
                            update(
                              "direcciones",
                              form.direcciones.map((item) =>
                                item.id === direccion.id
                                  ? { ...item, descripcion: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </Field>

                      <Field label="Dirección">
                        <input
                          value={direccion.direccion}
                          onChange={(event) =>
                            update(
                              "direcciones",
                              form.direcciones.map((item) =>
                                item.id === direccion.id
                                  ? { ...item, direccion: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </Field>

                      <Field label="Nro. casa">
                        <input
                          value={direccion.numeroCasa}
                          onChange={(event) =>
                            update(
                              "direcciones",
                              form.direcciones.map((item) =>
                                item.id === direccion.id
                                  ? { ...item, numeroCasa: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </Field>
                    </div>

                    <div className={styles.gridFour}>
                      <Field label="País">
                        <select
                          value={direccion.paisCodigo}
                          onChange={(event) => {
                            const code = event.target.value;
                            const country = paises.find(([value]) => value === code);

                            update(
                              "direcciones",
                              form.direcciones.map((item) =>
                                item.id === direccion.id
                                  ? {
                                      ...item,
                                      paisCodigo: code,
                                      paisNombre: country?.[1] ?? "",
                                      departamentoCodigo: "",
                                      distritoCodigo: "",
                                      ciudadCodigo: "",
                                      departamento: "",
                                      distrito: "",
                                      ciudad: "",
                                    }
                                  : item,
                              ),
                            );
                          }}
                        >
                          {paises.map(([code, name]) => (
                            <option key={code} value={code}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </Field>

                      <GeografiaDireccion
                        direccion={direccion}
                        departamentos={catalogos.departamentos}
                        onChange={(patch) =>
                          update(
                            "direcciones",
                            form.direcciones.map((item) =>
                              item.id === direccion.id
                                ? { ...item, ...patch }
                                : item,
                            ),
                          )
                        }
                      />
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}

          {tab === "bancos" ? (
            <>
              <div className={styles.sectionTitle}>
                <div>
                  <h3>Cuentas bancarias</h3>
                </div>

                <button
                  type="button"
                  className={styles.addButton}
                  onClick={() =>
                    update("cuentasBancarias", [
                      ...form.cuentasBancarias,
                      emptyCuenta(),
                    ])
                  }
                >
                  + Agregar cuenta
                </button>
              </div>

              <RepeaterEmpty
                empty={form.cuentasBancarias.length === 0}
                text="Aún no hay cuentas bancarias cargadas."
              />

              <div className={styles.repeaterList}>
                {form.cuentasBancarias.map((cuenta, index) => (
                  <article key={cuenta.id} className={styles.repeaterCard}>
                    <header>
                      <strong>Cuenta {index + 1}</strong>
                      <button
                        type="button"
                        onClick={() =>
                          update(
                            "cuentasBancarias",
                            form.cuentasBancarias.filter((item) => item.id !== cuenta.id),
                          )
                        }
                      >
                        Eliminar
                      </button>
                    </header>

                    <div className={styles.gridFour}>
                      {(
                        [
                          ["banco", "Banco"],
                          ["sucursalBanco", "Sucursal"],
                          ["titular", "Titular"],
                          ["documentoTitular", "Documento del titular"],
                        ] as const
                      ).map(([key, etiqueta]) => (
                        <Field key={key} label={etiqueta}>
                          <input
                            value={cuenta[key]}
                            onChange={(event) =>
                              update(
                                "cuentasBancarias",
                                form.cuentasBancarias.map((item) =>
                                  item.id === cuenta.id
                                    ? { ...item, [key]: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </Field>
                      ))}
                    </div>

                    <div className={styles.gridFour}>
                      <Field label="Tipo de cuenta">
                        <select
                          value={cuenta.tipoCuenta}
                          onChange={(event) =>
                            update(
                              "cuentasBancarias",
                              form.cuentasBancarias.map((item) =>
                                item.id === cuenta.id
                                  ? {
                                      ...item,
                                      tipoCuenta:
                                        event.target.value as ProveedorCuentaBancaria["tipoCuenta"],
                                    }
                                  : item,
                              ),
                            )
                          }
                        >
                          <option value="CORRIENTE">Corriente</option>
                          <option value="AHORRO">Ahorro</option>
                          <option value="CAJA_AHORRO">Caja de ahorro</option>
                          <option value="OTRA">Otra</option>
                        </select>
                      </Field>

                      <Field label="Número de cuenta">
                        <input
                          value={cuenta.numeroCuenta}
                          onChange={(event) =>
                            update(
                              "cuentasBancarias",
                              form.cuentasBancarias.map((item) =>
                                item.id === cuenta.id
                                  ? { ...item, numeroCuenta: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </Field>

                      <Field label="Moneda">
                        <select
                          value={cuenta.monedaCodigo}
                          onChange={(event) =>
                            update(
                              "cuentasBancarias",
                              form.cuentasBancarias.map((item) =>
                                item.id === cuenta.id
                                  ? { ...item, monedaCodigo: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        >
                          {catalogos.monedas.map((item) => (
                            <option key={item.codigo} value={item.codigo}>
                              {item.codigo}
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field label="Alias">
                        <input
                          value={cuenta.aliasCuenta}
                          onChange={(event) =>
                            update(
                              "cuentasBancarias",
                              form.cuentasBancarias.map((item) =>
                                item.id === cuenta.id
                                  ? { ...item, aliasCuenta: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </Field>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}

          {tab === "retenciones" ? (
            <>
              <div className={styles.sectionTitle}>
                <div>
                  <h3>Retenciones</h3>
                </div>

                <button
                  type="button"
                  className={styles.addButton}
                  onClick={() =>
                    update("retenciones", [
                      ...form.retenciones,
                      emptyRetencion(),
                    ])
                  }
                >
                  + Agregar retención
                </button>
              </div>

              <RepeaterEmpty
                empty={form.retenciones.length === 0}
                text="Aún no hay retenciones cargadas."
              />

              <div className={styles.repeaterList}>
                {form.retenciones.map((retencion, index) => (
                  <article key={retencion.id} className={styles.repeaterCard}>
                    <header>
                      <strong>Retención {index + 1}</strong>
                      <button
                        type="button"
                        onClick={() =>
                          update(
                            "retenciones",
                            form.retenciones.filter((item) => item.id !== retencion.id),
                          )
                        }
                      >
                        Eliminar
                      </button>
                    </header>

                    <div className={styles.gridFour}>
                      <Field label="Tipo">
                        <select
                          value={retencion.tipo}
                          onChange={(event) =>
                            update(
                              "retenciones",
                              form.retenciones.map((item) =>
                                item.id === retencion.id
                                  ? {
                                      ...item,
                                      tipo:
                                        event.target.value as ProveedorRetencion["tipo"],
                                    }
                                  : item,
                              ),
                            )
                          }
                        >
                          <option value="IVA">IVA</option>
                          <option value="RENTA">Renta</option>
                          <option value="OTRA">Otra</option>
                        </select>
                      </Field>

                      <Field label="Porcentaje">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={retencion.porcentaje}
                          onChange={(event) =>
                            update(
                              "retenciones",
                              form.retenciones.map((item) =>
                                item.id === retencion.id
                                  ? {
                                      ...item,
                                      porcentaje: Number(event.target.value || 0),
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                      </Field>

                      <Field label="Vigencia desde">
                        <input
                          type="date"
                          value={retencion.fechaVigenciaDesde}
                          onChange={(event) =>
                            update(
                              "retenciones",
                              form.retenciones.map((item) =>
                                item.id === retencion.id
                                  ? {
                                      ...item,
                                      fechaVigenciaDesde: event.target.value,
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                      </Field>

                      <Field label="Vigencia hasta">
                        <input
                          type="date"
                          value={retencion.fechaVigenciaHasta}
                          onChange={(event) =>
                            update(
                              "retenciones",
                              form.retenciones.map((item) =>
                                item.id === retencion.id
                                  ? {
                                      ...item,
                                      fechaVigenciaHasta: event.target.value,
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                      </Field>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}

          {tab === "documentos" ? (
            <>
              <div className={styles.sectionTitle}>
                <div>
                  <h3>Documentos</h3>
                </div>

                <button
                  type="button"
                  className={styles.addButton}
                  onClick={() =>
                    update("documentos", [
                      ...form.documentos,
                      emptyDocumento(),
                    ])
                  }
                >
                  + Agregar documento
                </button>
              </div>

              <RepeaterEmpty
                empty={form.documentos.length === 0}
                text="Aún no hay documentos cargados."
              />

              <div className={styles.repeaterList}>
                {form.documentos.map((documento, index) => (
                  <article key={documento.id} className={styles.repeaterCard}>
                    <header>
                      <strong>Documento {index + 1}</strong>
                      <button
                        type="button"
                        onClick={() =>
                          update(
                            "documentos",
                            form.documentos.filter((item) => item.id !== documento.id),
                          )
                        }
                      >
                        Eliminar
                      </button>
                    </header>

                    <div className={styles.gridFour}>
                      <Field label="Tipo">
                        <select
                          value={documento.tipo}
                          onChange={(event) =>
                            update(
                              "documentos",
                              form.documentos.map((item) =>
                                item.id === documento.id
                                  ? {
                                      ...item,
                                      tipo:
                                        event.target.value as ProveedorDocumento["tipo"],
                                    }
                                  : item,
                              ),
                            )
                          }
                        >
                          <option value="CONTRATO">Contrato</option>
                          <option value="CONSTANCIA_RUC">Constancia RUC</option>
                          <option value="CERTIFICADO_BANCARIO">Certificado bancario</option>
                          <option value="CERTIFICADO_RETENCION">Certificado retención</option>
                          <option value="LICENCIA">Licencia</option>
                          <option value="OTRO">Otro</option>
                        </select>
                      </Field>

                      <Field label="Nombre archivo">
                        <input
                          value={documento.nombreArchivo}
                          onChange={(event) =>
                            update(
                              "documentos",
                              form.documentos.map((item) =>
                                item.id === documento.id
                                  ? { ...item, nombreArchivo: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </Field>

                      <Field label="Fecha emisión">
                        <input
                          type="date"
                          value={documento.fechaEmision}
                          onChange={(event) =>
                            update(
                              "documentos",
                              form.documentos.map((item) =>
                                item.id === documento.id
                                  ? { ...item, fechaEmision: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </Field>

                      <Field label="Fecha vencimiento">
                        <input
                          type="date"
                          value={documento.fechaVencimiento}
                          onChange={(event) =>
                            update(
                              "documentos",
                              form.documentos.map((item) =>
                                item.id === documento.id
                                  ? { ...item, fechaVencimiento: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </Field>
                    </div>

                    <div className={styles.gridTwo}>
                      <Field label="URL del archivo">
                        <input
                          value={documento.urlArchivo}
                          onChange={(event) =>
                            update(
                              "documentos",
                              form.documentos.map((item) =>
                                item.id === documento.id
                                  ? { ...item, urlArchivo: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </Field>

                      <Field label="Observación">
                        <input
                          value={documento.observacion}
                          onChange={(event) =>
                            update(
                              "documentos",
                              form.documentos.map((item) =>
                                item.id === documento.id
                                  ? { ...item, observacion: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </Field>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}

          <div className={styles.observationBlock}>
            <Field label="Observación general">
              <textarea
                value={form.observacion}
                onChange={(event) =>
                  update("observacion", event.target.value)
                }
              />
            </Field>
          </div>
        </div>

        <footer className={styles.footer}>
          <div className={styles.footerActions}>
            <Link href="/proveedores" className={styles.cancelButton}>
              Cancelar
            </Link>

            <button type="submit" disabled={saving} className={styles.saveButton}>
              {saving
                ? mode === "create"
                  ? "Guardando..."
                  : "Actualizando..."
                : mode === "create"
                  ? "Guardar proveedor"
                  : "Actualizar proveedor"}
            </button>
          </div>
        </footer>
      </form>
    </main>
  );
}

function RepeaterEmpty({
  empty,
  text,
}: {
  empty: boolean;
  text: string;
}) {
  if (!empty) {
    return null;
  }

  return (
    <div className={styles.empty}>{text}</div>
  );
}
