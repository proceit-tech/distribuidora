"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useParams,
  useRouter,
} from "next/navigation";

import {
  actualizarClienteDemo,
  buscarClienteDemo,
} from "@/lib/mocks/clientes-storage";
import type {
  ClienteDemo,
  ClienteNaturaleza,
  ClienteOperacion,
  ClienteTipoPersona,
} from "@/types/clientes";

import styles from "./page.module.css";

type TabId =
  | "fiscal"
  | "comercial"
  | "contacto"
  | "logistica";

type FormState = {
  naturaleza: ClienteNaturaleza;
  tipoOperacion: ClienteOperacion;
  tipoPersona: ClienteTipoPersona;

  paisCodigo: string;
  paisNombre: string;

  tipoDocumento: string;
  numeroDocumento: string;
  dv: string;

  razonSocial: string;
  nombreFantasia: string;

  email: string;
  emailCopia: string;
  telefono: string;
  celular: string;

  limiteCredito: string;
  limiteCreditoTemporal: string;
  fechaVencimientoCredito: string;

  grupoCliente: string;
  condicionPago: string;
  moneda: string;
  listaPrecio: string;
  canalVenta: string;
  vendedor: string;

  codigoExterno: string;
  gln: string;
  descuentoComercialPct: string;

  bloqueadoVentas: boolean;
  motivoBloqueoVentas: string;

  diaPreferidoCobro: string;
  requiereOrdenCompra: boolean;

  emailFacturacion: string;
  emailCobranzas: string;
  recibeDocumentoElectronico: boolean;

  rutaEntrega: string;
  zonaComercial: string;
  frecuenciaEntrega: string;
  diasEntrega: number[];

  observacionComercial: string;
  observacionLogistica: string;

  activo: boolean;
};

const TABS: Array<{
  id: TabId;
  label: string;
}> = [
  {
    id: "fiscal",
    label: "Información fiscal",
  },
  {
    id: "comercial",
    label: "Comercial y crédito",
  },
  {
    id: "contacto",
    label: "Contacto y facturación",
  },
  {
    id: "logistica",
    label: "Entrega y ventas",
  },
];

const OPTIONS = {
  paises: [
    ["PRY", "Paraguay"],
    ["ARG", "Argentina"],
    ["BRA", "Brasil"],
    ["URY", "Uruguay"],
    ["BOL", "Bolivia"],
  ],
  grupos: [
    "Mayoristas",
    "Minoristas",
    "Supermercados",
    "Distribuidores",
    "Instituciones",
    "Exterior",
  ],
  condiciones: [
    "Contado",
    "Crédito 7 días",
    "Crédito 15 días",
    "Crédito 30 días",
    "Crédito 45 días",
    "Crédito 60 días",
  ],
  listas: [
    "Minorista",
    "Mayorista A",
    "Mayorista B",
    "Distribuidor",
    "Institucional",
    "Exportación",
  ],
  canales: [
    "Venta directa",
    "Ejecutivo comercial",
    "Preventista",
    "WhatsApp",
    "Licitaciones",
  ],
  vendedores: [
    "Carlos Benítez",
    "Laura Franco",
    "Andrea López",
    "José Ramírez",
  ],
  rutas: [
    "Ruta Central 01",
    "Ruta Central 02",
    "Ruta Central 03",
    "Ruta Central 04",
    "Ruta Norte 01",
    "Ruta Norte 02",
    "Ruta Sur 01",
    "Ruta Sur 02",
    "Ruta Institucional",
  ],
  zonas: [
    "Gran Asunción",
    "Asunción",
    "Asunción Norte",
    "Fernando de la Mora",
    "San Lorenzo",
    "Luque",
    "Lambaré",
    "Ñemby",
    "Mariano Roque Alonso",
    "Exterior",
  ],
};

function formatDate(value: string) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "es-PY",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(date);
}

function money(value: string) {
  const parsed = Number(
    value.replace(/\./g, "").replace(",", "."),
  );

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function fromCliente(
  cliente: ClienteDemo,
): FormState {
  return {
    naturaleza: cliente.naturaleza,
    tipoOperacion:
      cliente.tipoOperacion,
    tipoPersona:
      cliente.tipoPersona,

    paisCodigo:
      cliente.paisCodigo,
    paisNombre:
      cliente.paisNombre,

    tipoDocumento:
      cliente.tipoDocumento,
    numeroDocumento:
      cliente.numeroDocumento,
    dv: cliente.dv,

    razonSocial:
      cliente.razonSocial,
    nombreFantasia:
      cliente.nombreFantasia,

    email: cliente.email,
    emailCopia:
      cliente.emailCopia,
    telefono: cliente.telefono,
    celular: cliente.celular,

    limiteCredito:
      String(cliente.limiteCredito),
    limiteCreditoTemporal:
      String(
        cliente.limiteCreditoTemporal,
      ),
    fechaVencimientoCredito:
      cliente.fechaVencimientoCredito,

    grupoCliente:
      cliente.grupoCliente,
    condicionPago:
      cliente.condicionPago,
    moneda: cliente.moneda,
    listaPrecio:
      cliente.listaPrecio,
    canalVenta:
      cliente.canalVenta,
    vendedor: cliente.vendedor,

    codigoExterno:
      cliente.codigoExterno,
    gln: cliente.gln,
    descuentoComercialPct:
      String(
        cliente.descuentoComercialPct,
      ),

    bloqueadoVentas:
      cliente.bloqueadoVentas,
    motivoBloqueoVentas:
      cliente.motivoBloqueoVentas,

    diaPreferidoCobro:
      cliente.diaPreferidoCobro
        ? String(
            cliente.diaPreferidoCobro,
          )
        : "",
    requiereOrdenCompra:
      cliente.requiereOrdenCompra,

    emailFacturacion:
      cliente.emailFacturacion,
    emailCobranzas:
      cliente.emailCobranzas,
    recibeDocumentoElectronico:
      cliente.recibeDocumentoElectronico,

    rutaEntrega:
      cliente.rutaEntrega,
    zonaComercial:
      cliente.zonaComercial,
    frecuenciaEntrega:
      cliente.frecuenciaEntrega,
    diasEntrega: [
      ...cliente.diasEntrega,
    ],

    observacionComercial:
      cliente.observacionComercial,
    observacionLogistica:
      cliente.observacionLogistica,

    activo: cliente.activo,
  };
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className={styles.sectionTitle}>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>

      <small>
        Los cambios se guardan localmente para la demostración.
      </small>
    </div>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={[
        styles.field,
        className ?? "",
      ].join(" ")}
    >
      <span>
        {label}
        {required ? " *" : ""}
      </span>

      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
>) {
  return (
    <input
      {...props}
      className={styles.input}
      value={value}
      onChange={(event) =>
        onChange(event.target.value)
      }
    />
  );
}

function SelectInput({
  value,
  onChange,
  children,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
} & Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  "value" | "onChange"
>) {
  return (
    <select
      {...props}
      className={styles.select}
      value={value}
      onChange={(event) =>
        onChange(event.target.value)
      }
    >
      {children}
    </select>
  );
}

export default function ClienteDetallePage() {
  const router = useRouter();
  const params = useParams<{
    id: string;
  }>();

  const id = params.id;

  const [cliente, setCliente] =
    useState<ClienteDemo | null>(
      null,
    );

  const [form, setForm] =
    useState<FormState | null>(
      null,
    );

  const [tab, setTab] =
    useState<TabId>("fiscal");

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  useEffect(() => {
    const found =
      buscarClienteDemo(id);

    setCliente(found);

    if (found) {
      setForm(fromCliente(found));
    }

    setLoading(false);
  }, [id]);

  const operacionesPermitidas =
    useMemo<ClienteOperacion[]>(
      () =>
        form?.naturaleza ===
        "CONTRIBUYENTE"
          ? ["B2B", "B2C", "B2G"]
          : ["B2C", "B2F"],
      [form?.naturaleza],
    );

  function update<
    K extends keyof FormState,
  >(
    key: K,
    value: FormState[K],
  ) {
    setForm((current) =>
      current
        ? {
            ...current,
            [key]: value,
          }
        : current,
    );
  }

  function changeNaturaleza(
    value: ClienteNaturaleza,
  ) {
    setForm((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        naturaleza: value,
        tipoOperacion:
          value === "CONTRIBUYENTE"
            ? "B2B"
            : "B2C",
        paisCodigo: "PRY",
        paisNombre: "Paraguay",
        tipoDocumento:
          value === "CONTRIBUYENTE"
            ? "RUC"
            : "CEDULA_PARAGUAYA",
        numeroDocumento: "",
        dv: "",
      };
    });
  }

  function changeOperacion(
    value: ClienteOperacion,
  ) {
    setForm((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        tipoOperacion: value,
        paisCodigo:
          value === "B2F"
            ? "ARG"
            : "PRY",
        paisNombre:
          value === "B2F"
            ? "Argentina"
            : "Paraguay",
        tipoDocumento:
          value === "B2F"
            ? "PASAPORTE"
            : current.naturaleza ===
                "CONTRIBUYENTE"
              ? "RUC"
              : "CEDULA_PARAGUAYA",
      };
    });
  }

  async function guardar(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!cliente || !form) {
      return;
    }

    setError("");

    if (!form.razonSocial.trim()) {
      setTab("fiscal");
      setError(
        "Ingrese la razón social del cliente.",
      );
      return;
    }

    if (
      !form.numeroDocumento.trim() &&
      form.tipoDocumento !==
        "INNOMINADO"
    ) {
      setTab("fiscal");
      setError(
        "Ingrese el documento del cliente.",
      );
      return;
    }

    setSaving(true);

    try {
      const updated =
        actualizarClienteDemo(
          cliente.id,
          {
            naturaleza:
              form.naturaleza,
            tipoOperacion:
              form.tipoOperacion,
            tipoPersona:
              form.tipoPersona,

            paisCodigo:
              form.paisCodigo,
            paisNombre:
              form.paisNombre,

            tipoDocumento:
              form.tipoDocumento,
            numeroDocumento:
              form.numeroDocumento.trim(),
            dv: form.dv.trim(),

            razonSocial:
              form.razonSocial
                .trim()
                .toUpperCase(),
            nombreFantasia:
              form.nombreFantasia.trim(),

            email:
              form.email.trim(),
            emailCopia:
              form.emailCopia.trim(),
            telefono:
              form.telefono.trim(),
            celular:
              form.celular.trim(),

            limiteCredito:
              money(
                form.limiteCredito,
              ),
            limiteCreditoTemporal:
              money(
                form.limiteCreditoTemporal,
              ),
            fechaVencimientoCredito:
              form.fechaVencimientoCredito,

            grupoCliente:
              form.grupoCliente,
            condicionPago:
              form.condicionPago,
            moneda:
              form.moneda,
            listaPrecio:
              form.listaPrecio,
            canalVenta:
              form.canalVenta,
            vendedor:
              form.vendedor,

            codigoExterno:
              form.codigoExterno.trim(),
            gln: form.gln.trim(),
            descuentoComercialPct:
              money(
                form.descuentoComercialPct,
              ),

            bloqueadoVentas:
              form.bloqueadoVentas,
            motivoBloqueoVentas:
              form.motivoBloqueoVentas.trim(),

            diaPreferidoCobro:
              form.diaPreferidoCobro
                ? Number(
                    form.diaPreferidoCobro,
                  )
                : null,

            requiereOrdenCompra:
              form.requiereOrdenCompra,

            emailFacturacion:
              form.emailFacturacion.trim(),
            emailCobranzas:
              form.emailCobranzas.trim(),
            recibeDocumentoElectronico:
              form.recibeDocumentoElectronico,

            rutaEntrega:
              form.rutaEntrega,
            zonaComercial:
              form.zonaComercial,
            frecuenciaEntrega:
              form.frecuenciaEntrega,
            diasEntrega: [
              ...form.diasEntrega,
            ],

            observacionComercial:
              form.observacionComercial.trim(),
            observacionLogistica:
              form.observacionLogistica.trim(),

            activo:
              form.activo,
          },
        );

      if (!updated) {
        throw new Error();
      }

      await new Promise(
        (resolve) =>
          window.setTimeout(
            resolve,
            400,
          ),
      );

      router.push("/clientes");
      router.refresh();
    } catch {
      setError(
        "No fue posible actualizar el cliente de demostración.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section
        className={styles.statePage}
      >
        <div
          className={styles.stateCard}
        >
          <span
            className={styles.spinner}
          />
          <strong>
            Cargando cliente...
          </strong>
        </div>
      </section>
    );
  }

  if (!cliente || !form) {
    return (
      <section
        className={styles.statePage}
      >
        <div
          className={styles.stateCard}
        >
          <strong>
            Cliente no encontrado
          </strong>

          <p>
            El registro puede haber sido
            eliminado o los datos demo
            fueron restaurados.
          </p>

          <Link href="/clientes">
            Volver a clientes
          </Link>
        </div>
      </section>
    );
  }

  const esContribuyente =
    form.naturaleza ===
    "CONTRIBUYENTE";

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <div
            className={styles.heroMeta}
          >
            <span
              className={
                styles.modulePill
              }
            >
              CLIENTES
            </span>

            <span
              className={styles.codePill}
            >
              {cliente.codigo}
            </span>

            <span
              className={styles.demoPill}
            >
              DEMO
            </span>
          </div>

          <h1>
            {cliente.razonSocial}
          </h1>

          <p>
            Ficha del cliente y edición de
            datos maestros.
          </p>
        </div>

        <Link
          href="/clientes"
          className={
            styles.secondaryButton
          }
        >
          ← Volver a clientes
        </Link>
      </header>

      <form
        className={styles.card}
        onSubmit={guardar}
      >
        <div
          className={styles.cardHeader}
        >
          <div
            className={
              styles.clientSummary
            }
          >
            <span
              className={styles.avatar}
            >
              {cliente.razonSocial
                .split(/\s+/)
                .slice(0, 2)
                .map((part) =>
                  part
                    .charAt(0)
                    .toUpperCase(),
                )
                .join("")}
            </span>

            <div>
              <span
                className={
                  styles.cardEyebrow
                }
              >
                FICHA DEL CLIENTE
              </span>

              <h2>
                {cliente.codigo}
              </h2>

              <p>
                Última actualización:{" "}
                {formatDate(
                  cliente.actualizadoEn,
                )}
              </p>
            </div>
          </div>

          <div
            className={
              styles.statusSummary
            }
          >
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

            {form.bloqueadoVentas ? (
              <span
                className={
                  styles.statusBlocked
                }
              >
                Ventas bloqueadas
              </span>
            ) : null}
          </div>
        </div>

        {error ? (
          <div
            className={styles.error}
            role="alert"
          >
            <strong>
              Revise los datos
            </strong>
            <span>{error}</span>
          </div>
        ) : null}

        <nav
          className={styles.tabs}
          aria-label="Secciones del cliente"
        >
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={[
                styles.tab,
                tab === item.id
                  ? styles.tabActive
                  : "",
              ].join(" ")}
              onClick={() =>
                setTab(item.id)
              }
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div
          className={styles.content}
        >
          {tab === "fiscal" ? (
            <section>
              <SectionTitle
                title="Identificación fiscal"
                description="Datos fiscales y de identificación del cliente."
              />

              <div
                className={
                  styles.gridFour
                }
              >
                <Field
                  label="Naturaleza"
                  required
                >
                  <SelectInput
                    value={
                      form.naturaleza
                    }
                    onChange={(value) =>
                      changeNaturaleza(
                        value as ClienteNaturaleza,
                      )
                    }
                  >
                    <option value="CONTRIBUYENTE">
                      Contribuyente
                    </option>

                    <option value="NO_CONTRIBUYENTE">
                      No contribuyente
                    </option>
                  </SelectInput>
                </Field>

                <Field
                  label="Tipo de operación"
                  required
                >
                  <SelectInput
                    value={
                      form.tipoOperacion
                    }
                    onChange={(value) =>
                      changeOperacion(
                        value as ClienteOperacion,
                      )
                    }
                  >
                    {operacionesPermitidas.map(
                      (operation) => (
                        <option
                          key={operation}
                          value={operation}
                        >
                          {operation}
                        </option>
                      ),
                    )}
                  </SelectInput>
                </Field>

                <Field
                  label="País"
                  required
                >
                  <SelectInput
                    value={
                      form.paisCodigo
                    }
                    onChange={(value) => {
                      const country =
                        OPTIONS.paises.find(
                          ([code]) =>
                            code === value,
                        );

                      update(
                        "paisCodigo",
                        value,
                      );

                      update(
                        "paisNombre",
                        country?.[1] ??
                          "",
                      );
                    }}
                    disabled={
                      form.tipoOperacion !==
                      "B2F"
                    }
                  >
                    {OPTIONS.paises.map(
                      ([code, name]) => (
                        <option
                          key={code}
                          value={code}
                        >
                          {name}
                        </option>
                      ),
                    )}
                  </SelectInput>
                </Field>

                <Field
                  label="Tipo de persona"
                  required
                >
                  <SelectInput
                    value={
                      form.tipoPersona
                    }
                    onChange={(value) =>
                      update(
                        "tipoPersona",
                        value as ClienteTipoPersona,
                      )
                    }
                  >
                    <option value="JURIDICA">
                      Persona jurídica
                    </option>

                    <option value="FISICA">
                      Persona física
                    </option>
                  </SelectInput>
                </Field>
              </div>

              <div
                className={
                  styles.gridFour
                }
              >
                <Field
                  label={
                    esContribuyente
                      ? "RUC"
                      : "Tipo de documento"
                  }
                  required
                >
                  {esContribuyente ? (
                    <TextInput
                      value={
                        form.numeroDocumento
                      }
                      inputMode="numeric"
                      maxLength={8}
                      onChange={(value) =>
                        update(
                          "numeroDocumento",
                          value
                            .replace(
                              /\D/g,
                              "",
                            )
                            .slice(0, 8),
                        )
                      }
                    />
                  ) : (
                    <SelectInput
                      value={
                        form.tipoDocumento
                      }
                      onChange={(value) =>
                        update(
                          "tipoDocumento",
                          value,
                        )
                      }
                    >
                      <option value="CEDULA_PARAGUAYA">
                        Cédula paraguaya
                      </option>
                      <option value="PASAPORTE">
                        Pasaporte
                      </option>
                      <option value="CEDULA_EXTRANJERA">
                        Cédula extranjera
                      </option>
                      <option value="CARNET_RESIDENCIA">
                        Carnet de residencia
                      </option>
                      <option value="INNOMINADO">
                        Innominado
                      </option>
                      <option value="OTRO">
                        Otro
                      </option>
                    </SelectInput>
                  )}
                </Field>

                {esContribuyente ? (
                  <Field
                    label="DV"
                    required
                  >
                    <TextInput
                      value={form.dv}
                      inputMode="numeric"
                      maxLength={1}
                      onChange={(value) =>
                        update(
                          "dv",
                          value
                            .replace(
                              /\D/g,
                              "",
                            )
                            .slice(0, 1),
                        )
                      }
                    />
                  </Field>
                ) : (
                  <Field
                    label="Número de documento"
                    required={
                      form.tipoDocumento !==
                      "INNOMINADO"
                    }
                  >
                    <TextInput
                      value={
                        form.numeroDocumento
                      }
                      disabled={
                        form.tipoDocumento ===
                        "INNOMINADO"
                      }
                      onChange={(value) =>
                        update(
                          "numeroDocumento",
                          value,
                        )
                      }
                    />
                  </Field>
                )}

                <Field
                  label="Razón social"
                  required
                  className={
                    styles.spanTwo
                  }
                >
                  <TextInput
                    value={
                      form.razonSocial
                    }
                    onChange={(value) =>
                      update(
                        "razonSocial",
                        value,
                      )
                    }
                  />
                </Field>
              </div>

              <div
                className={
                  styles.gridThree
                }
              >
                <Field label="Nombre de fantasía">
                  <TextInput
                    value={
                      form.nombreFantasia
                    }
                    onChange={(value) =>
                      update(
                        "nombreFantasia",
                        value,
                      )
                    }
                  />
                </Field>

                <Field label="Código externo">
                  <TextInput
                    value={
                      form.codigoExterno
                    }
                    onChange={(value) =>
                      update(
                        "codigoExterno",
                        value,
                      )
                    }
                  />
                </Field>

                <Field label="GLN">
                  <TextInput
                    value={form.gln}
                    inputMode="numeric"
                    maxLength={13}
                    onChange={(value) =>
                      update(
                        "gln",
                        value.replace(
                          /\D/g,
                          "",
                        ),
                      )
                    }
                  />
                </Field>
              </div>

              <div
                className={
                  styles.optionGrid
                }
              >
                <div
                  className={
                    styles.optionCard
                  }
                >
                  <label>
                    <input
                      type="checkbox"
                      checked={
                        form.activo
                      }
                      onChange={(event) =>
                        update(
                          "activo",
                          event.target
                            .checked,
                        )
                      }
                    />

                    <span>
                      <strong>
                        Cliente activo
                      </strong>
                      <small>
                        Habilita operaciones
                        comerciales.
                      </small>
                    </span>
                  </label>
                </div>

                <div
                  className={[
                    styles.optionCard,
                    form.bloqueadoVentas
                      ? styles.optionDanger
                      : "",
                  ].join(" ")}
                >
                  <label>
                    <input
                      type="checkbox"
                      checked={
                        form.bloqueadoVentas
                      }
                      onChange={(event) =>
                        update(
                          "bloqueadoVentas",
                          event.target
                            .checked,
                        )
                      }
                    />

                    <span>
                      <strong>
                        Bloquear ventas
                      </strong>
                      <small>
                        Impide nuevos pedidos
                        mientras esté activo.
                      </small>
                    </span>
                  </label>
                </div>
              </div>

              {form.bloqueadoVentas ? (
                <Field label="Motivo del bloqueo">
                  <textarea
                    className={
                      styles.textarea
                    }
                    value={
                      form.motivoBloqueoVentas
                    }
                    onChange={(event) =>
                      update(
                        "motivoBloqueoVentas",
                        event.target.value,
                      )
                    }
                  />
                </Field>
              ) : null}
            </section>
          ) : null}

          {tab === "comercial" ? (
            <section>
              <SectionTitle
                title="Comercial y crédito"
                description="Condiciones de venta, precios y exposición crediticia."
              />

              <div
                className={
                  styles.gridFour
                }
              >
                <Field label="Grupo de cliente">
                  <SelectInput
                    value={
                      form.grupoCliente
                    }
                    onChange={(value) =>
                      update(
                        "grupoCliente",
                        value,
                      )
                    }
                  >
                    {OPTIONS.grupos.map(
                      (item) => (
                        <option
                          key={item}
                          value={item}
                        >
                          {item}
                        </option>
                      ),
                    )}
                  </SelectInput>
                </Field>

                <Field label="Condición de pago">
                  <SelectInput
                    value={
                      form.condicionPago
                    }
                    onChange={(value) =>
                      update(
                        "condicionPago",
                        value,
                      )
                    }
                  >
                    {OPTIONS.condiciones.map(
                      (item) => (
                        <option
                          key={item}
                          value={item}
                        >
                          {item}
                        </option>
                      ),
                    )}
                  </SelectInput>
                </Field>

                <Field label="Moneda">
                  <SelectInput
                    value={
                      form.moneda
                    }
                    onChange={(value) =>
                      update(
                        "moneda",
                        value,
                      )
                    }
                  >
                    <option value="PYG">
                      Guaraníes · PYG
                    </option>
                    <option value="USD">
                      Dólares · USD
                    </option>
                  </SelectInput>
                </Field>

                <Field label="Lista de precios">
                  <SelectInput
                    value={
                      form.listaPrecio
                    }
                    onChange={(value) =>
                      update(
                        "listaPrecio",
                        value,
                      )
                    }
                  >
                    {OPTIONS.listas.map(
                      (item) => (
                        <option
                          key={item}
                          value={item}
                        >
                          {item}
                        </option>
                      ),
                    )}
                  </SelectInput>
                </Field>
              </div>

              <div
                className={
                  styles.gridFour
                }
              >
                <Field label="Límite de crédito">
                  <TextInput
                    value={
                      form.limiteCredito
                    }
                    inputMode="numeric"
                    onChange={(value) =>
                      update(
                        "limiteCredito",
                        value.replace(
                          /\D/g,
                          "",
                        ),
                      )
                    }
                  />
                </Field>

                <Field label="Crédito temporal">
                  <TextInput
                    value={
                      form.limiteCreditoTemporal
                    }
                    inputMode="numeric"
                    onChange={(value) =>
                      update(
                        "limiteCreditoTemporal",
                        value.replace(
                          /\D/g,
                          "",
                        ),
                      )
                    }
                  />
                </Field>

                <Field label="Vencimiento crédito temporal">
                  <TextInput
                    type="date"
                    value={
                      form.fechaVencimientoCredito
                    }
                    onChange={(value) =>
                      update(
                        "fechaVencimientoCredito",
                        value,
                      )
                    }
                  />
                </Field>

                <Field label="Descuento comercial %">
                  <TextInput
                    value={
                      form.descuentoComercialPct
                    }
                    inputMode="decimal"
                    onChange={(value) =>
                      update(
                        "descuentoComercialPct",
                        value,
                      )
                    }
                  />
                </Field>
              </div>

              <div
                className={
                  styles.gridThree
                }
              >
                <Field label="Canal de venta">
                  <SelectInput
                    value={
                      form.canalVenta
                    }
                    onChange={(value) =>
                      update(
                        "canalVenta",
                        value,
                      )
                    }
                  >
                    {OPTIONS.canales.map(
                      (item) => (
                        <option
                          key={item}
                          value={item}
                        >
                          {item}
                        </option>
                      ),
                    )}
                  </SelectInput>
                </Field>

                <Field label="Vendedor">
                  <SelectInput
                    value={
                      form.vendedor
                    }
                    onChange={(value) =>
                      update(
                        "vendedor",
                        value,
                      )
                    }
                  >
                    {OPTIONS.vendedores.map(
                      (item) => (
                        <option
                          key={item}
                          value={item}
                        >
                          {item}
                        </option>
                      ),
                    )}
                  </SelectInput>
                </Field>

                <Field label="Día preferido de cobro">
                  <TextInput
                    value={
                      form.diaPreferidoCobro
                    }
                    inputMode="numeric"
                    maxLength={2}
                    onChange={(value) =>
                      update(
                        "diaPreferidoCobro",
                        value
                          .replace(
                            /\D/g,
                            "",
                          )
                          .slice(0, 2),
                      )
                    }
                  />
                </Field>
              </div>

              <div
                className={
                  styles.optionGrid
                }
              >
                <div
                  className={
                    styles.optionCard
                  }
                >
                  <label>
                    <input
                      type="checkbox"
                      checked={
                        form.requiereOrdenCompra
                      }
                      onChange={(event) =>
                        update(
                          "requiereOrdenCompra",
                          event.target
                            .checked,
                        )
                      }
                    />

                    <span>
                      <strong>
                        Requiere orden de compra
                      </strong>
                      <small>
                        Validar OC antes de
                        facturar.
                      </small>
                    </span>
                  </label>
                </div>

                <div
                  className={
                    styles.optionCard
                  }
                >
                  <label>
                    <input
                      type="checkbox"
                      checked={
                        form.recibeDocumentoElectronico
                      }
                      onChange={(event) =>
                        update(
                          "recibeDocumentoElectronico",
                          event.target
                            .checked,
                        )
                      }
                    />

                    <span>
                      <strong>
                        Recibe documento electrónico
                      </strong>
                      <small>
                        Habilitado para comunicación
                        fiscal.
                      </small>
                    </span>
                  </label>
                </div>
              </div>
            </section>
          ) : null}

          {tab === "contacto" ? (
            <section>
              <SectionTitle
                title="Contacto y facturación"
                description="Datos generales y correos operativos del cliente."
              />

              <div
                className={
                  styles.gridFour
                }
              >
                <Field label="E-mail principal">
                  <TextInput
                    type="email"
                    value={form.email}
                    onChange={(value) =>
                      update(
                        "email",
                        value,
                      )
                    }
                  />
                </Field>

                <Field label="E-mail copia">
                  <TextInput
                    type="email"
                    value={
                      form.emailCopia
                    }
                    onChange={(value) =>
                      update(
                        "emailCopia",
                        value,
                      )
                    }
                  />
                </Field>

                <Field label="Teléfono">
                  <TextInput
                    value={
                      form.telefono
                    }
                    onChange={(value) =>
                      update(
                        "telefono",
                        value,
                      )
                    }
                  />
                </Field>

                <Field label="Celular">
                  <TextInput
                    value={form.celular}
                    onChange={(value) =>
                      update(
                        "celular",
                        value,
                      )
                    }
                  />
                </Field>
              </div>

              <div
                className={
                  styles.gridTwo
                }
              >
                <Field label="E-mail facturación">
                  <TextInput
                    type="email"
                    value={
                      form.emailFacturacion
                    }
                    onChange={(value) =>
                      update(
                        "emailFacturacion",
                        value,
                      )
                    }
                  />
                </Field>

                <Field label="E-mail cobranzas">
                  <TextInput
                    type="email"
                    value={
                      form.emailCobranzas
                    }
                    onChange={(value) =>
                      update(
                        "emailCobranzas",
                        value,
                      )
                    }
                  />
                </Field>
              </div>
            </section>
          ) : null}

          {tab === "logistica" ? (
            <section>
              <SectionTitle
                title="Entrega y ventas"
                description="Ruta, zona, frecuencia y observaciones operativas."
              />

              <div
                className={
                  styles.gridThree
                }
              >
                <Field label="Ruta de entrega">
                  <SelectInput
                    value={
                      form.rutaEntrega
                    }
                    onChange={(value) =>
                      update(
                        "rutaEntrega",
                        value,
                      )
                    }
                  >
                    <option value="">
                      Sin ruta asignada
                    </option>

                    {OPTIONS.rutas.map(
                      (item) => (
                        <option
                          key={item}
                          value={item}
                        >
                          {item}
                        </option>
                      ),
                    )}
                  </SelectInput>
                </Field>

                <Field label="Zona comercial">
                  <SelectInput
                    value={
                      form.zonaComercial
                    }
                    onChange={(value) =>
                      update(
                        "zonaComercial",
                        value,
                      )
                    }
                  >
                    {OPTIONS.zonas.map(
                      (item) => (
                        <option
                          key={item}
                          value={item}
                        >
                          {item}
                        </option>
                      ),
                    )}
                  </SelectInput>
                </Field>

                <Field label="Frecuencia">
                  <SelectInput
                    value={
                      form.frecuenciaEntrega
                    }
                    onChange={(value) =>
                      update(
                        "frecuenciaEntrega",
                        value,
                      )
                    }
                  >
                    <option value="">
                      Sin frecuencia
                    </option>
                    <option value="DIARIA">
                      Diaria
                    </option>
                    <option value="SEMANAL">
                      Semanal
                    </option>
                    <option value="QUINCENAL">
                      Quincenal
                    </option>
                    <option value="MENSUAL">
                      Mensual
                    </option>
                    <option value="SEGUN_PEDIDO">
                      Según pedido
                    </option>
                  </SelectInput>
                </Field>
              </div>

              <div
                className={
                  styles.deliveryDays
                }
              >
                <span>
                  Días de entrega
                </span>

                <div>
                  {[
                    [1, "Lun"],
                    [2, "Mar"],
                    [3, "Mié"],
                    [4, "Jue"],
                    [5, "Vie"],
                    [6, "Sáb"],
                  ].map(
                    ([day, label]) => (
                      <button
                        key={day}
                        type="button"
                        className={
                          form.diasEntrega.includes(
                            day as number,
                          )
                            ? styles.dayActive
                            : ""
                        }
                        onClick={() =>
                          update(
                            "diasEntrega",
                            form.diasEntrega.includes(
                              day as number,
                            )
                              ? form.diasEntrega.filter(
                                  (item) =>
                                    item !==
                                    day,
                                )
                              : [
                                  ...form.diasEntrega,
                                  day as number,
                                ],
                          )
                        }
                      >
                        {label}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div
                className={
                  styles.gridTwo
                }
              >
                <Field label="Observación comercial">
                  <textarea
                    className={
                      styles.textarea
                    }
                    value={
                      form.observacionComercial
                    }
                    onChange={(event) =>
                      update(
                        "observacionComercial",
                        event.target.value,
                      )
                    }
                  />
                </Field>

                <Field label="Observación logística">
                  <textarea
                    className={
                      styles.textarea
                    }
                    value={
                      form.observacionLogistica
                    }
                    onChange={(event) =>
                      update(
                        "observacionLogistica",
                        event.target.value,
                      )
                    }
                  />
                </Field>
              </div>
            </section>
          ) : null}
        </div>

        <footer
          className={styles.footer}
        >
          <div>
            <span
              className={
                styles.footerHint
              }
            >
              Registro local
            </span>

            <small>
              Los cambios se reflejarán
              inmediatamente en la lista de
              clientes.
            </small>
          </div>

          <div
            className={
              styles.footerActions
            }
          >
            <Link
              href="/clientes"
              className={
                styles.cancelButton
              }
            >
              Cancelar
            </Link>

            <button
              type="submit"
              className={
                styles.saveButton
              }
              disabled={saving}
            >
              {saving
                ? "Actualizando..."
                : "Actualizar cliente"}
            </button>
          </div>
        </footer>
      </form>
    </section>
  );
}
