"use client";

import Link from "next/link";
import {
  FormEvent,
  useMemo,
  useState,
} from "react";

import type {
  NuevoProveedorDemo,
  ProveedorContacto,
  ProveedorCuentaBancaria,
  ProveedorDemo,
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
  initial?: ProveedorDemo;
  onSave: (data: NuevoProveedorDemo) => Promise<void> | void;
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

const paises = [
  ["PRY", "Paraguay"],
  ["ARG", "Argentina"],
  ["BRA", "Brasil"],
  ["URY", "Uruguay"],
  ["BOL", "Bolivia"],
];

const grupos = [
  "Materias primas",
  "Bebidas",
  "Importados",
  "Logística",
  "Tecnología",
  "Servicios",
  "Limpieza",
];

const condiciones = [
  "Contado",
  "Crédito 15 días",
  "Crédito 30 días",
  "Crédito 45 días",
  "Crédito 60 días",
];

const mediosPago = [
  "Transferencia",
  "Cheque",
  "Efectivo",
  "Tarjeta",
];

const incoterms = [
  "EXW",
  "FCA",
  "FAS",
  "FOB",
  "CFR",
  "CIF",
  "CPT",
  "CIP",
  "DAP",
  "DPU",
  "DDP",
];

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

function initialForm(initial?: ProveedorDemo): NuevoProveedorDemo {
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
    grupoProveedor: "",
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
    condicionPago: "",
    monedaCodigoPredeterminada: "PYG",
    medioPagoPreferido: "",
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
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function ProveedorForm({
  mode,
  initial,
  onSave,
}: Props) {
  const [tab, setTab] =
    useState<TabId>("general");

  const [form, setForm] =
    useState<NuevoProveedorDemo>(() =>
      initialForm(initial),
    );

  const [error, setError] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  function update<K extends keyof NuevoProveedorDemo>(
    key: K,
    value: NuevoProveedorDemo[K],
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

  const pageDescription =
    mode === "create"
      ? "Información comercial, compras, pagos, homologación y logística."
      : `Actualización de ${initial?.codigo ?? "proveedor"}.`;

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError("");

    if (!form.razonSocial.trim()) {
      setTab("general");
      setError("Informe el nombre o razón social del proveedor.");
      return;
    }

    if (
      form.paisCodigo === "PRY" &&
      form.tipoDocumento !== "RUC"
    ) {
      setTab("general");
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
    } catch {
      setError(
        mode === "create"
          ? "No fue posible registrar el proveedor."
          : "No fue posible actualizar el proveedor.",
      );
    } finally {
      setSaving(false);
    }
  }

  const sectionDone = useMemo(() => {
    return {
      general: Boolean(form.razonSocial && form.numeroDocumento),
      compras: Boolean(form.condicionPago || form.medioPagoPreferido),
      homologacion: form.estadoHomologacion !== "PENDIENTE",
      contactos: form.contactos.length > 0,
      direcciones: form.direcciones.length > 0,
      bancos: form.cuentasBancarias.length > 0,
      retenciones: form.retenciones.length > 0,
      documentos: form.documentos.length > 0,
    } satisfies Record<TabId, boolean>;
  }, [form]);

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <div className={styles.heroMeta}>
            <span className={styles.modulePill}>
              PROVEEDORES
            </span>
            <span className={styles.demoPill}>
              DEMO
            </span>
          </div>

          <h1>{pageTitle}</h1>
          <p>{pageDescription}</p>
        </div>

        <Link
          href="/proveedores"
          className={styles.secondaryButton}
        >
          ← Volver a proveedores
        </Link>
      </header>

      <form
        className={styles.card}
        onSubmit={submit}
      >
        <div className={styles.cardHeader}>
          <div>
            <span className={styles.cardEyebrow}>
              {mode === "create"
                ? "ALTA DE PROVEEDOR"
                : "FICHA DEL PROVEEDOR"}
            </span>

            <h2>
              {initial?.codigo ??
                "Código automático"}
            </h2>

            <p>
              {mode === "create"
                ? "El código PRV se asignará al guardar."
                : `Última actualización: ${
                    initial
                      ? new Date(
                          initial.actualizadoEn,
                        ).toLocaleString(
                          "es-PY",
                        )
                      : ""
                  }`}
            </p>
          </div>

          {initial ? (
            <div className={styles.statusGroup}>
              <span
                className={
                  form.activo
                    ? styles.statusActive
                    : styles.statusInactive
                }
              >
                {form.activo
                  ? "Activo"
                  : "Inactivo"}
              </span>

              <span className={styles.statusNeutral}>
                {form.estadoHomologacion.replaceAll("_", " ")}
              </span>
            </div>
          ) : (
            <div className={styles.autoCode}>
              <span>✓</span>
              <div>
                <strong>
                  Código automático
                </strong>
                <small>
                  PRV-0000XX
                </small>
              </div>
            </div>
          )}
        </div>

        {error ? (
          <div className={styles.error}>
            {error}
          </div>
        ) : null}

        <nav className={styles.tabs}>
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={[
                styles.tab,
                tab === item.id
                  ? styles.tabActive
                  : "",
              ].join(" ")}
              onClick={() => setTab(item.id)}
            >
              <span
                className={[
                  styles.tabDot,
                  sectionDone[item.id]
                    ? styles.tabDone
                    : "",
                ].join(" ")}
              >
                {sectionDone[item.id] ? "✓" : "•"}
              </span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className={styles.content}>
          {tab === "general" ? (
            <>
              <div className={styles.sectionTitle}>
                <div>
                  <h3>Identificación y contacto</h3>
                  <p>Datos principales del proveedor.</p>
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
                    value={form.grupoProveedor}
                    onChange={(event) =>
                      update("grupoProveedor", event.target.value)
                    }
                  >
                    <option value="">Sin grupo</option>
                    {grupos.map((item) => (
                      <option key={item}>{item}</option>
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
                        {code} · {name}
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
                  <p>Valores predeterminados para abastecimiento y cuentas por pagar.</p>
                </div>
              </div>

              <div className={styles.gridFour}>
                <Field label="Condición de pago">
                  <select
                    value={form.condicionPago}
                    onChange={(event) =>
                      update("condicionPago", event.target.value)
                    }
                  >
                    <option value="">Sin condición</option>
                    {condiciones.map((item) => (
                      <option key={item}>{item}</option>
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
                    <option value="PYG">PYG · Guaraníes</option>
                    <option value="USD">USD · Dólares</option>
                  </select>
                </Field>

                <Field label="Medio de pago preferido">
                  <select
                    value={form.medioPagoPreferido}
                    onChange={(event) =>
                      update("medioPagoPreferido", event.target.value)
                    }
                  >
                    <option value="">Sin medio</option>
                    {mediosPago.map((item) => (
                      <option key={item}>{item}</option>
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
                  <p>Control de aprobación, riesgo y condiciones logísticas.</p>
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
                    {incoterms.map((item) => (
                      <option key={item}>{item}</option>
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
                  <p>Personas y responsabilidades asociadas al proveedor.</p>
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
                  ＋ Agregar contacto
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
                  <p>Ubicaciones fiscales, comerciales, de retiro o pagos.</p>
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
                  ＋ Agregar dirección
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
                                    }
                                  : item,
                              ),
                            );
                          }}
                        >
                          {paises.map(([code, name]) => (
                            <option key={code} value={code}>
                              {code} · {name}
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field label="Departamento / estado">
                        <input
                          value={direccion.departamento}
                          onChange={(event) =>
                            update(
                              "direcciones",
                              form.direcciones.map((item) =>
                                item.id === direccion.id
                                  ? { ...item, departamento: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </Field>

                      <Field label="Distrito / región">
                        <input
                          value={direccion.distrito}
                          onChange={(event) =>
                            update(
                              "direcciones",
                              form.direcciones.map((item) =>
                                item.id === direccion.id
                                  ? { ...item, distrito: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </Field>

                      <Field label="Ciudad">
                        <input
                          value={direccion.ciudad}
                          onChange={(event) =>
                            update(
                              "direcciones",
                              form.direcciones.map((item) =>
                                item.id === direccion.id
                                  ? { ...item, ciudad: event.target.value }
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

          {tab === "bancos" ? (
            <>
              <div className={styles.sectionTitle}>
                <div>
                  <h3>Cuentas bancarias</h3>
                  <p>Datos bancarios para transferencias y pagos.</p>
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
                  ＋ Agregar cuenta
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
                      {(["banco", "sucursalBanco", "titular", "documentoTitular"] as const).map((key) => (
                        <Field key={key} label={key}>
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
                          <option value="PYG">PYG</option>
                          <option value="USD">USD</option>
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
                  <p>Configuración de retenciones aplicables al proveedor.</p>
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
                  ＋ Agregar retención
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
                  <p>Contratos, constancias, certificados y licencias.</p>
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
                  ＋ Agregar documento
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
          <div>
            <span>Modo demostración</span>
            <small>Los cambios quedan guardados en este navegador.</small>
          </div>

          <div className={styles.footerActions}>
            <Link
              href="/proveedores"
              className={styles.cancelButton}
            >
              Cancelar
            </Link>

            <button
              type="submit"
              disabled={saving}
              className={styles.saveButton}
            >
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
    </section>
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
    <div className={styles.empty}>
      <strong>{text}</strong>
      <span>Use el botón superior para agregar un registro.</span>
    </div>
  );
}
