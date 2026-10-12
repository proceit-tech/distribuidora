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

import type {
  ClienteDetalle,
  ClienteNaturaleza,
  ClienteOperacion,
  ClienteTipoPersona,
} from "@/types/clientes";

import {
  calcularDvRuc,
  validarRucDv,
} from "@/lib/fiscal/calcular-dv-ruc";
import { TelefonoPais } from "@/components/clientes/telefono-pais";
import { validarCamposReceptor, validarGln } from "@/lib/fiscal/campos-receptor";
import { DESCUENTO_COMERCIAL, LIMITE_CREDITO, decimalAcotado } from "@/lib/clientes/comercial";
import { pestanaDeErrorApi } from "@/lib/clientes/pestanas";
import { convertirLimites, requiereConversion, validarTasa } from "@/lib/clientes/cambio";
import { validarFrecuenciaYDias } from "@/lib/clientes/logistica";
import { validarDireccionFiscalRequerida } from "@/lib/clientes/obligatoriedad-fiscal";
import { useProtegerCambios } from "@/lib/ui/proteger-cambios";

import styles from "./page.module.css";
import { DocumentosCliente, type DocumentoCliente } from "./_components/documentos";
import {
  HijosEditor,
  hijosDesdeApi,
  hijosParaApi,
  hijosVacios,
  validarHijos,
  type HijosForm,
  type OpcionGeo,
} from "./_components/hijos";

type TabId =
  | "fiscal"
  | "comercial"
  | "contacto"
  | "logistica"
  | "contactos"
  | "direcciones"
  | "documentos";

type FormState = {
  naturaleza: ClienteNaturaleza;
  tipoOperacion: ClienteOperacion;
  tipoPersona: ClienteTipoPersona;

  paisCodigo: string;
  paisNombre: string;

  tipoDocumento: string;
  /** D209: descripción del documento, obligatoria (9–41) solo con tipo OTRO; vacía en los demás tipos. */
  descripcionDocumentoIdentidad: string;
  numeroDocumento: string;
  dv: string;

  razonSocial: string;
  nombreFantasia: string;

  email: string;
  emailCopia: string;
  telefono: string;
  celular: string;
  telefonoPais: string;
  telefonoDdi: string;
  telefonoArea: string;
  celularPais: string;
  celularDdi: string;
  celularArea: string;

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
  diaMesEntrega: string;
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
  {
    id: "contactos",
    label: "Contactos",
  },
  {
    id: "direcciones",
    label: "Direcciones",
  },
  {
    id: "documentos",
    label: "Documentos",
  },
];

type Opcion = {
  id: string;
  nombre: string;
};

type Catalogos = {
  monedas: { codigo: string; nombre: string }[];
  grupos: Opcion[];
  condicionesPago: Opcion[];
  listasPrecio: Opcion[];
  canalesVenta: Opcion[];
  vendedores: Opcion[];
  rutasEntrega: Opcion[];
  zonasComerciales: Opcion[];
  paises: { codigo: string; nombre: string }[];
  departamentosParaguay: OpcionGeo[];
};

const CATALOGOS_VACIOS: Catalogos = {
  monedas: [],
  grupos: [],
  condicionesPago: [],
  listasPrecio: [],
  canalesVenta: [],
  vendedores: [],
  rutasEntrega: [],
  zonasComerciales: [],
  paises: [],
  departamentosParaguay: [],
};

// dd/mm/yyyy (API) <-> yyyy-mm-dd (input type=date)
function aInputFecha(valor: string) {
  const m = valor.match(
    /^(\d{2})\/(\d{2})\/(\d{4})$/,
  );
  return m
    ? `${m[3]}-${m[2]}-${m[1]}`
    : "";
}

function aApiFecha(valor: string) {
  const m = valor.match(
    /^(\d{4})-(\d{2})-(\d{2})$/,
  );
  return m
    ? `${m[3]}/${m[2]}/${m[1]}`
    : "";
}

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

function fromCliente(
  cliente: ClienteDetalle,
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
    descripcionDocumentoIdentidad: cliente.descripcionDocumentoIdentidad ?? "",
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
    // Registro con número y sin país (anterior a la retificación): se deja sin país hasta que el usuario lo elija;
    // sin número se propone Paraguay (+595) como predeterminado.
    telefonoPais: cliente.telefono ? cliente.telefonoPais ?? "" : "PRY",
    telefonoDdi: cliente.telefono ? cliente.telefonoDdi ?? "" : "595",
    telefonoArea: cliente.telefonoArea ?? "",
    celularPais: cliente.celular ? cliente.celularPais ?? "" : "PRY",
    celularDdi: cliente.celular ? cliente.celularDdi ?? "" : "595",
    celularArea: cliente.celularArea ?? "",

    limiteCredito:
      String(cliente.limiteCredito),
    limiteCreditoTemporal:
      cliente.limiteCreditoTemporal,
    fechaVencimientoCredito:
      aInputFecha(
        cliente.fechaVencimientoCredito,
      ),

    grupoCliente:
      cliente.grupoClienteId,
    condicionPago:
      cliente.condicionPagoId,
    moneda:
      cliente.monedaCodigoPredeterminada,
    listaPrecio:
      cliente.listaPrecioId,
    canalVenta:
      cliente.canalVentaId,
    vendedor: cliente.vendedorId,

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
      cliente.rutaEntregaId,
    zonaComercial:
      cliente.zonaComercialId,
    frecuenciaEntrega:
      cliente.frecuenciaEntrega,
    diaMesEntrega: cliente.diaMesEntrega ?? "",
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
        Los cambios se guardan en la base de datos.
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
    useState<ClienteDetalle | null>(
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

  const [aptitud, setAptitud] =
    useState<{
      apto: boolean;
      pendientes: string[];
    } | null>(null);

  // Documentos: archivos reales; se gestionan aparte del «Guardar» del cliente (carga/reemplazo/eliminación inmediatos).
  const [documentos, setDocumentos] = useState<DocumentoCliente[]>([]);
  const [aviso, setAviso] = useState("");

  // Cambio de moneda con límites vigentes: tasa informada por el usuario y confirmación expresa (CLI-VIS-05/06).
  const [tasaCambio, setTasaCambio] = useState("");
  const [conversionConfirmada, setConversionConfirmada] = useState(false);

  async function recargarDocumentos() {
    const r = await fetch(`/api/clientes/${id}`, { cache: "no-store" });
    const j = (await r.json().catch(() => ({}))) as { documentos?: DocumentoCliente[] };

    if (r.ok) setDocumentos(j.documentos ?? []);
  }

  const [hijos, setHijos] =
    useState<HijosForm>(hijosVacios);

  // CLI-A02: huella de lo que el servidor entregó (ficha + contactos + direcciones) y borrador de documento sin enviar; avisa al recargar/cerrar y al usar enlaces.
  const [huellaBase, setHuellaBase] = useState("");
  const [borradorDocumento, setBorradorDocumento] = useState(false);
  const sucio = !saving && ((huellaBase !== "" && JSON.stringify({ form, hijos }) !== huellaBase) || borradorDocumento);

  useProtegerCambios(sucio);

  const [catalogos, setCatalogos] =
    useState<Catalogos>(
      CATALOGOS_VACIOS,
    );

  useEffect(() => {
    let activo = true;

    async function cargar() {
      try {
        const [rCliente, rCatalogos] =
          await Promise.all([
            fetch(`/api/clientes/${id}`, {
              cache: "no-store",
            }),
            fetch(
              "/api/clientes?modo=catalogos",
              { cache: "no-store" },
            ),
          ]);

        if (rCliente.status === 404) {
          if (activo) {
            setCliente(null);
          }
          return;
        }

        const datos =
          (await rCliente.json()) as {
            cliente?: ClienteDetalle;
            contactos?: Parameters<typeof hijosDesdeApi>[0]["contactos"];
            direcciones?: Parameters<typeof hijosDesdeApi>[0]["direcciones"];
            documentos?: DocumentoCliente[];
            aptitudSifen?: { apto: boolean; pendientes: string[] };
            referenciasHistoricas?: Record<string, { id: string; codigo: string; nombre: string }>;
            error?: string;
          };

        if (
          !rCliente.ok ||
          !datos.cliente
        ) {
          throw new Error(
            datos.error ??
              "No fue posible cargar el cliente.",
          );
        }

        // CLI-A04: un fallo del catálogo (401/403/500) NO se convierte en listas vacías: eso borraría vínculos al guardar y parecería un cliente normal.
        if (!rCatalogos.ok) {
          const detalle = (await rCatalogos.json().catch(() => ({}))) as { error?: string };

          throw new Error(
            `No fue posible cargar los catálogos del cliente (código ${rCatalogos.status}): ${
              detalle.error ?? (rCatalogos.status === 401 || rCatalogos.status === 403 ? "no tiene permiso para consultarlos." : "el servicio no respondió correctamente.")
            } La ficha no se muestra para no perder sus vínculos; recargue la página o pida acceso.`,
          );
        }

        const cat =
          (await rCatalogos.json()) as {
            catalogos?: Partial<Catalogos>;
          };
        const catalogosCompletos = { ...CATALOGOS_VACIOS, ...(cat.catalogos ?? {}) };
        const formularioInicial = fromCliente(datos.cliente);
        const hijosIniciales = hijosDesdeApi(datos);

        if (activo) {
          // CLI-A01: una referencia que el cliente ya tiene pero hoy está inactiva se muestra (marcada) para conservarla; no se ofrece como elección nueva.
          const historicas = datos.referenciasHistoricas ?? {};
          const conHistorica = (lista: Opcion[], campo: string) => {
            const h = historicas[campo];

            return h && !lista.some((o) => o.id === h.id) ? [...lista, { id: h.id, nombre: `${h.nombre} (inactivo)` }] : lista;
          };

          setCatalogos({
            ...catalogosCompletos,
            grupos: conHistorica(catalogosCompletos.grupos, "grupoClienteId"),
            listasPrecio: conHistorica(catalogosCompletos.listasPrecio, "listaPrecioId"),
            canalesVenta: conHistorica(catalogosCompletos.canalesVenta, "canalVentaId"),
            vendedores: conHistorica(catalogosCompletos.vendedores, "vendedorId"),
            rutasEntrega: conHistorica(catalogosCompletos.rutasEntrega, "rutaEntregaId"),
            zonasComerciales: conHistorica(catalogosCompletos.zonasComerciales, "zonaComercialId"),
          });
          setHijos(hijosIniciales);
          setDocumentos(datos.documentos ?? []);
          setAptitud(datos.aptitudSifen ?? null);
          setCliente(datos.cliente);
          setForm(formularioInicial);
          setHuellaBase(JSON.stringify({ form: formularioInicial, hijos: hijosIniciales }));
        }
      } catch (e) {
        if (activo) {
          setError(
            e instanceof Error
              ? e.message
              : "No fue posible cargar el cliente.",
          );
        }
      } finally {
        if (activo) {
          setLoading(false);
        }
      }
    }

    void cargar();

    return () => {
      activo = false;
    };
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
        // Paraguay por defecto; en B2F el país se elige del catálogo (sin valores fijos).
        paisCodigo:
          value === "B2F"
            ? ""
            : "PRY",
        paisNombre:
          value === "B2F"
            ? ""
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

  // Los límites que se ven están en la moneda GUARDADA del cliente; si se elige otra moneda se convierten al guardar con la
  // tasa que informe el usuario (sin cotización automática) y su confirmación expresa. Cálculo exacto, half-up a 4 decimales.
  const monedaLimites = cliente?.monedaCodigoPredeterminada || form?.moneda || "sin moneda";
  const monedaCambia = Boolean(cliente?.monedaCodigoPredeterminada && form?.moneda && cliente.monedaCodigoPredeterminada !== form.moneda);
  const vistaConversion = ((): { tipo: "sin-limites" } | { tipo: "esperando" } | { tipo: "error"; mensaje: string } | { tipo: "listo"; limite: string; temporal: string | null; limiteDestino: string; temporalDestino: string | null } | null => {
    if (!form || !monedaCambia) return null;

    try {
      const limite = decimalAcotado(form.limiteCredito, "El límite de crédito", LIMITE_CREDITO) ?? "0";
      const temporal = decimalAcotado(form.limiteCreditoTemporal, "El límite de crédito temporal", LIMITE_CREDITO);

      if (!requiereConversion(limite, temporal)) return { tipo: "sin-limites" };
      if (tasaCambio.trim() === "") return { tipo: "esperando" };

      const c = convertirLimites(limite, temporal, tasaCambio);

      return { tipo: "listo", limite, temporal, limiteDestino: c.limiteDestino, temporalDestino: c.temporalDestino };
    } catch (errorVista) {
      return { tipo: "error", mensaje: (errorVista as Error).message };
    }
  })();

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

    if (form.naturaleza === "CONTRIBUYENTE") {
      const sinCambio =
        form.numeroDocumento === cliente.numeroDocumento &&
        form.dv === cliente.dv;
      const rucDv = validarRucDv(
        form.numeroDocumento,
        form.dv,
      );

      if (!sinCambio && !rucDv.ok) {
        setTab("fiscal");
        setError(rucDv.error);
        return;
      }
    }

    const errorReceptor = validarCamposReceptor(
      {
        naturaleza: form.naturaleza,
        tipoDocumento: form.tipoDocumento,
        numeroDocumento: form.numeroDocumento.trim(),
        descripcionDocumento: form.tipoDocumento === "OTRO" ? form.descripcionDocumentoIdentidad.trim() : "",
        razonSocial: form.razonSocial.trim().toUpperCase(),
        nombreFantasia: form.nombreFantasia.trim(),
        email: form.email.trim(),
        telefono: form.telefono.trim(),
        celular: form.celular.trim(),
      },
      {
        numeroDocumento: cliente.numeroDocumento,
        descripcionDocumento: cliente.descripcionDocumentoIdentidad ?? "",
        razonSocial: cliente.razonSocial,
        nombreFantasia: cliente.nombreFantasia,
        email: cliente.email,
        telefono: cliente.telefono,
        celular: cliente.celular,
      },
    );

    if (errorReceptor) {
      setTab("fiscal");
      setError(errorReceptor);
      return;
    }

    const errorHijos = validarHijos(hijos);
    if (errorHijos) {
      setTab(
        errorHijos.includes("contacto")
          ? "contactos"
          : errorHijos.includes("documento")
            ? "documentos"
            : "direcciones",
      );
      setError(errorHijos);
      return;
    }

    // GLN opcional: si se informa, exactamente 13 dígitos y dígito verificador GS1.
    const errorGln = validarGln(form.gln.trim());

    if (errorGln) {
      setTab("comercial");
      setError(errorGln);
      return;
    }

    try {
      decimalAcotado(form.limiteCredito, "El límite de crédito", LIMITE_CREDITO);
      decimalAcotado(form.limiteCreditoTemporal, "El límite de crédito temporal", LIMITE_CREDITO);
      decimalAcotado(form.descuentoComercialPct, "El descuento comercial", DESCUENTO_COMERCIAL);
    } catch (errorNumerico) {
      setTab("comercial");
      setError((errorNumerico as Error).message);
      return;
    }

    if (!form.paisCodigo) {
      setTab("fiscal");
      setError("Seleccione el país del cliente.");
      return;
    }

    // Entrega y ventas: días obligatorios con frecuencia semanal/quincenal. Se valida al cambiar la combinación
    // (un cliente anterior que no la toca no se bloquea; el servidor aplica la misma tolerancia).
    const diasOrdenados = (dias: number[]) => [...dias].sort((a, b) => a - b).join(",");
    const logisticaCambio =
      (form.frecuenciaEntrega || "") !== (cliente.frecuenciaEntrega || "") || diasOrdenados(form.diasEntrega) !== diasOrdenados(cliente.diasEntrega ?? []) || (form.diaMesEntrega || "") !== (cliente.diaMesEntrega || "");
    const errorLogistica = logisticaCambio ? validarFrecuenciaYDias(form.frecuenciaEntrega, form.diasEntrega, form.diaMesEntrega) : null;

    if (errorLogistica) {
      setTab("logistica");
      setError(errorLogistica);
      return;
    }

    // B2F exige dirección fiscal (decisión 01). Un cliente B2F anterior sin tocar direcciones se tolera.
    const direccionesTocadas = hijos.direccionesEliminar.length > 0 || hijos.direcciones.some((d) => !d.id);
    const errorB2F =
      form.tipoOperacion === "B2F" && (cliente.tipoOperacion !== "B2F" || direccionesTocadas)
        ? validarDireccionFiscalRequerida(form.tipoOperacion, hijos.direcciones.some((d) => d.esFiscal || d.tipo === "FISCAL"))
        : null;

    if (errorB2F) {
      setTab("direcciones");
      setError(errorB2F);
      return;
    }

    // Cambio de moneda con límites vigentes: tasa informada + confirmación expresa; el servidor recalcula y valida.
    const monedaPrevia = cliente.monedaCodigoPredeterminada || "";
    let conversionMoneda: Record<string, unknown> | undefined;

    if (monedaPrevia && form.moneda && monedaPrevia !== form.moneda) {
      const limiteOrigen = decimalAcotado(form.limiteCredito, "El límite de crédito", LIMITE_CREDITO) ?? "0";
      const temporalOrigen = decimalAcotado(form.limiteCreditoTemporal, "El límite de crédito temporal", LIMITE_CREDITO);

      if (requiereConversion(limiteOrigen, temporalOrigen)) {
        try {
          validarTasa(tasaCambio);

          if (!conversionConfirmada) {
            throw new Error("Confirme expresamente la conversión de los límites para cambiar la moneda.");
          }

          const c = convertirLimites(limiteOrigen, temporalOrigen, tasaCambio);

          conversionMoneda = {
            monedaOrigen: monedaPrevia,
            monedaDestino: form.moneda,
            tasa: c.tasa,
            limiteDestino: c.limiteDestino,
            temporalDestino: c.temporalDestino ?? "",
            confirmada: true,
          };
        } catch (errorConversion) {
          setTab("comercial");
          setError((errorConversion as Error).message);
          return;
        }
      }
    }

    setSaving(true);

    try {
      const respuesta = await fetch(
        `/api/clientes/${cliente.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            // CLI-A03: versión de la ficha cargada; el servidor rechaza (409) si otro usuario guardó antes.
            actualizadoEn: cliente.actualizadoEn,
            naturaleza: form.naturaleza,
            tipoOperacion:
              form.tipoOperacion,
            tipoPersona: form.tipoPersona,
            paisCodigo: form.paisCodigo,
            paisNombre: form.paisNombre,
            tipoDocumento:
              form.tipoDocumento,
            descripcionDocumentoIdentidad:
              form.naturaleza !== "CONTRIBUYENTE" && form.tipoDocumento === "OTRO" ? form.descripcionDocumentoIdentidad.trim() : "",
            numeroDocumento:
              form.numeroDocumento,
            dv: form.dv,
            razonSocial:
              form.razonSocial.toUpperCase(),
            nombreFantasia:
              form.nombreFantasia,
            email: form.email,
            emailCopia: form.emailCopia,
            telefono: form.telefono,
            celular: form.celular,
            telefonoPais: form.telefonoPais,
            telefonoDdi: form.telefonoDdi,
            telefonoArea: form.telefonoArea,
            celularPais: form.celularPais,
            celularDdi: form.celularDdi,
            celularArea: form.celularArea,
            limiteCredito: form.limiteCredito.trim(),
            limiteCreditoTemporal: form.limiteCreditoTemporal.trim(),
            fechaVencimientoCredito:
              aApiFecha(
                form.fechaVencimientoCredito,
              ),
            grupoClienteId:
              form.grupoCliente,
            condicionPagoId:
              form.condicionPago,
            monedaCodigoPredeterminada:
              form.moneda,
            conversionMoneda,
            listaPrecioId:
              form.listaPrecio,
            canalVentaId: form.canalVenta,
            vendedorId: form.vendedor,
            codigoExterno:
              form.codigoExterno,
            gln: form.gln,
            descuentoComercialPct: form.descuentoComercialPct.trim(),
            bloqueadoVentas:
              form.bloqueadoVentas,
            motivoBloqueoVentas:
              form.motivoBloqueoVentas,
            diaPreferidoCobro:
              form.diaPreferidoCobro
                ? Number(
                    form.diaPreferidoCobro,
                  )
                : null,
            requiereOrdenCompra:
              form.requiereOrdenCompra,
            emailFacturacion:
              form.emailFacturacion,
            emailCobranzas:
              form.emailCobranzas,
            recibeDocumentoElectronico:
              form.recibeDocumentoElectronico,
            rutaEntregaId:
              form.rutaEntrega,
            zonaComercialId:
              form.zonaComercial,
            frecuenciaEntrega:
              form.frecuenciaEntrega,
            diasEntrega: form.diasEntrega,
            diaMesEntrega: form.diaMesEntrega,
            observacionComercial:
              form.observacionComercial,
            observacionLogistica:
              form.observacionLogistica,
            activo: form.activo,
            ...hijosParaApi(hijos),
          }),
        },
      );

      const datos =
        (await respuesta.json()) as {
          error?: string;
        };

      if (!respuesta.ok) {
        throw new Error(
          datos.error ??
            "No fue posible actualizar el cliente.",
        );
      }

      router.push(
        "/clientes?ok=actualizado",
      );
      router.refresh();
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : "No fue posible actualizar el cliente.";

      // Los datos del formulario se conservan; se abre la pestaña a la que pertenece el error.
      setTab(pestanaDeErrorApi(mensaje));
      setError(mensaje);
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
            {error
              ? "No fue posible cargar el cliente"
              : "Cliente no encontrado"}
          </strong>

          <p>
            El registro puede haber sido
            eliminado o pertenecer a otra
            empresa.
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
              <strong>{cliente.razonSocial}</strong>

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

            {aptitud ? (
              <span className={aptitud.apto ? styles.statusActive : styles.statusBlocked}>
                {aptitud.apto ? "Apto para SIFEN" : `Fiscal incompleto (${aptitud.pendientes.length})`}
              </span>
            ) : null}
          </div>
        </div>

        {aptitud && !aptitud.apto ? (
          <div
            className={styles.error}
            role="status"
          >
            <strong>
              Datos fiscales pendientes: este cliente aún no está apto para la emisión SIFEN
            </strong>
            <ul>
              {aptitud.pendientes.map((pendiente) => (
                <li key={pendiente}>{pendiente}</li>
              ))}
            </ul>
            <p>
              Para guardar cualquier cambio de este cliente debe regularizar antes estos datos fiscales (decisión del responsable): corríjalos en las pestañas indicadas.
            </p>
          </div>
        ) : null}

        {aviso ? (
          <div className={styles.error} role="status">
            <span>{aviso}</span>
            <button onClick={() => setAviso("")} type="button">
              Entendido
            </button>
          </div>
        ) : null}

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
                        catalogos.paises.find(
                          (pais) =>
                            pais.codigo === value,
                        );

                      update(
                        "paisCodigo",
                        value,
                      );

                      update(
                        "paisNombre",
                        country?.nombre ??
                          "",
                      );
                    }}
                    disabled={
                      form.tipoOperacion !==
                      "B2F"
                    }
                  >
                    {form.tipoOperacion === "B2F" ? (
                      <option value="">
                        Seleccione un país
                      </option>
                    ) : null}
                    {catalogos.paises
                      .filter((pais) =>
                        form.tipoOperacion === "B2F"
                          ? pais.codigo !== "PRY"
                          : pais.codigo === "PRY",
                      )
                      .map((pais) => (
                        <option key={pais.codigo} value={pais.codigo}>
                          {pais.nombre}
                        </option>
                      ))}
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
                      onChange={(value) => {
                        const ruc = value
                          .replace(/\D/g, "")
                          .slice(0, 8);

                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                numeroDocumento: ruc,
                                dv: calcularDvRuc(ruc) ?? "",
                              }
                            : current,
                        );
                      }}
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
                      <option value="TARJETA_DIPLOMATICA">
                        Tarjeta diplomática
                      </option>
                      <option value="OTRO">
                        Otro
                      </option>
                    </SelectInput>
                  )}
                </Field>

                {!esContribuyente && form.tipoDocumento === "OTRO" ? (
                  <Field label="Descripción del documento * (9 a 41 caracteres)">
                    <TextInput
                      maxLength={41}
                      onChange={(value) => update("descripcionDocumentoIdentidad", value)}
                      value={form.descripcionDocumentoIdentidad}
                    />
                  </Field>
                ) : null}

                {esContribuyente ? (
                  <Field
                    label="DV (automático)"
                    required
                  >
                    <TextInput
                      value={form.dv}
                      readOnly
                      tabIndex={-1}
                      onChange={() => undefined}
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
                    <>
<option value="">Sin asignar</option>
{catalogos.grupos.map((item) => (
<option key={item.id} value={item.id}>{item.nombre}</option>
))}
</>
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
                    <>
<option value="">Sin asignar</option>
{catalogos.condicionesPago.map((item) => (
<option key={item.id} value={item.id}>{item.nombre}</option>
))}
</>
                  </SelectInput>
                </Field>

                <Field label="Moneda">
                  <SelectInput
                    value={
                      form.moneda
                    }
                    onChange={(value) => {
                      update(
                        "moneda",
                        value,
                      );
                      setTasaCambio("");
                      setConversionConfirmada(false);
                    }}
                  >
                    <option value="">Sin definir</option>
                    {catalogos.monedas.map((m) => (
                      <option key={m.codigo} value={m.codigo}>
                        {m.nombre} · {m.codigo}
                      </option>
                    ))}
                    {form.moneda && !catalogos.monedas.some((m) => m.codigo === form.moneda) ? (
                      <option value={form.moneda}>{form.moneda}</option>
                    ) : null}
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
                    <>
<option value="">Sin asignar</option>
{catalogos.listasPrecio.map((item) => (
<option key={item.id} value={item.id}>{item.nombre}</option>
))}
</>
                  </SelectInput>
                </Field>
              </div>

              <div
                className={
                  styles.gridFour
                }
              >
                <Field label={`Límite de crédito (${monedaLimites})`}>
                  <TextInput
                    value={
                      form.limiteCredito
                    }
                    inputMode="decimal"
                    onChange={(value) =>
                      update(
                        "limiteCredito",
                        value,
                      )
                    }
                  />
                </Field>

                <Field label={`Límite temporal (${monedaLimites})`}>
                  <TextInput
                    value={
                      form.limiteCreditoTemporal
                    }
                    inputMode="decimal"
                    onChange={(value) =>
                      update(
                        "limiteCreditoTemporal",
                        value,
                      )
                    }
                  />
                </Field>

                <Field label="Vencimiento del límite temporal">
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

              {monedaCambia && vistaConversion ? (
                <div
                  aria-live="polite"
                  role="group"
                  style={{ border: "1px solid #e0b34a", background: "rgba(224, 179, 74, 0.12)", borderRadius: 10, padding: 12, margin: "8px 0", display: "grid", gap: 8 }}
                >
                  <strong>
                    Cambio de moneda: {cliente?.monedaCodigoPredeterminada} → {form.moneda}
                  </strong>
                  {vistaConversion.tipo === "sin-limites" ? (
                    <span>No hay límites de crédito vigentes para convertir: la moneda se cambia sin tasa.</span>
                  ) : (
                    <>
                      <span>
                        Los límites de arriba están en {cliente?.monedaCodigoPredeterminada} y no deben modificarse en este mismo guardado (el servidor lo rechaza). Informe la tasa de cambio (no se consulta ninguna cotización) y confirme la conversión. Los saldos u
                        operaciones de otros módulos no se convierten.
                      </span>
                      <Field label={`Tasa: 1 ${cliente?.monedaCodigoPredeterminada} = ? ${form.moneda}`}>
                        <TextInput
                          inputMode="decimal"
                          onChange={(valor) => {
                            setTasaCambio(valor);
                            setConversionConfirmada(false);
                          }}
                          value={tasaCambio}
                        />
                      </Field>
                      {vistaConversion.tipo === "error" ? (
                        <span role="alert" style={{ color: "#b3263b" }}>
                          {vistaConversion.mensaje}
                        </span>
                      ) : null}
                      {vistaConversion.tipo === "listo" ? (
                        <>
                          <table style={{ borderCollapse: "collapse" }}>
                            <tbody>
                              <tr>
                                <td style={{ padding: "2px 12px 2px 0" }}>Límite de crédito</td>
                                <td style={{ padding: "2px 12px 2px 0" }}>
                                  {vistaConversion.limite} {cliente?.monedaCodigoPredeterminada}
                                </td>
                                <td style={{ padding: "2px 12px 2px 0" }}>→</td>
                                <td>
                                  <strong>
                                    {vistaConversion.limiteDestino} {form.moneda}
                                  </strong>
                                </td>
                              </tr>
                              {vistaConversion.temporal !== null ? (
                                <tr>
                                  <td style={{ padding: "2px 12px 2px 0" }}>Límite temporal</td>
                                  <td style={{ padding: "2px 12px 2px 0" }}>
                                    {vistaConversion.temporal} {cliente?.monedaCodigoPredeterminada}
                                  </td>
                                  <td style={{ padding: "2px 12px 2px 0" }}>→</td>
                                  <td>
                                    <strong>
                                      {vistaConversion.temporalDestino} {form.moneda}
                                    </strong>
                                  </td>
                                </tr>
                              ) : null}
                            </tbody>
                          </table>
                          <small>Redondeo half-up a 4 decimales (escala del importe). El servidor vuelve a calcular y rechaza si no coincide.</small>
                          <label className={styles.checkItem}>
                            <input checked={conversionConfirmada} onChange={(evento) => setConversionConfirmada(evento.target.checked)} type="checkbox" />
                            <span>
                              Confirmo la conversión con la tasa 1 {cliente?.monedaCodigoPredeterminada} = {tasaCambio.trim()} {form.moneda}
                            </span>
                          </label>
                        </>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}

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
                    <>
<option value="">Sin asignar</option>
{catalogos.canalesVenta.map((item) => (
<option key={item.id} value={item.id}>{item.nombre}</option>
))}
</>
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
                    <>
<option value="">Sin asignar</option>
{catalogos.vendedores.map((item) => (
<option key={item.id} value={item.id}>{item.nombre}</option>
))}
</>
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

          {tab === "documentos" ? (
            <DocumentosCliente
              clienteId={cliente.id}
              documentos={documentos}
              onAviso={setAviso}
              onError={setError}
              onRecargar={recargarDocumentos}
              onBorrador={setBorradorDocumento}
            />
          ) : null}

          {tab === "contactos" || tab === "direcciones" ? (
            <HijosEditor
              tab={tab}
              valor={hijos}
              onChange={setHijos}
              paises={catalogos.paises}
              departamentos={
                catalogos.departamentosParaguay
              }
              onError={setError}
            />
          ) : null}

          {tab === "contacto" ? (
            <section>
              <SectionTitle
                title="Datos de contacto del cliente"
                description="Correo y teléfonos generales del cliente y correos operativos. Las personas de contacto están en la pestaña Contactos."
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

              </div>

              <div
                className={
                  styles.gridTwo
                }
              >
                <TelefonoPais
                  campo="telefono"
                  clases={{
                    campo: styles.field,
                    selector: styles.select,
                    entrada: styles.input,
                  }}
                  etiqueta="Teléfono"
                  id="cli-edit-telefono"
                  onChange={(nuevo) =>
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            telefonoPais: nuevo.pais,
                            telefonoDdi: nuevo.ddi,
                            telefonoArea: nuevo.area,
                            telefono: nuevo.numero,
                          }
                        : current,
                    )
                  }
                  valor={{
                    pais: form.telefonoPais,
                    ddi: form.telefonoDdi,
                    area: form.telefonoArea,
                    numero: form.telefono,
                  }}
                />

                <TelefonoPais
                  campo="celular"
                  clases={{
                    campo: styles.field,
                    selector: styles.select,
                    entrada: styles.input,
                  }}
                  etiqueta="Celular"
                  id="cli-edit-celular"
                  onChange={(nuevo) =>
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            celularPais: nuevo.pais,
                            celularDdi: nuevo.ddi,
                            celularArea: nuevo.area,
                            celular: nuevo.numero,
                          }
                        : current,
                    )
                  }
                  valor={{
                    pais: form.celularPais,
                    ddi: form.celularDdi,
                    area: form.celularArea,
                    numero: form.celular,
                  }}
                />
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

                    <>
<option value="">Sin asignar</option>
{catalogos.rutasEntrega.map((item) => (
<option key={item.id} value={item.id}>{item.nombre}</option>
))}
</>
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
                    <>
<option value="">Sin asignar</option>
{catalogos.zonasComerciales.map((item) => (
<option key={item.id} value={item.id}>{item.nombre}</option>
))}
</>
                  </SelectInput>
                </Field>

                <Field label="Frecuencia">
                  <SelectInput
                    value={
                      form.frecuenciaEntrega
                    }
                    onChange={(value) => {
                      update("frecuenciaEntrega", value);
                      // El día del mes solo aplica a la frecuencia mensual: al cambiar de frecuencia se limpia (no se conserva un dato que no aplica).
                      if (value !== "MENSUAL") update("diaMesEntrega", "");
                    }}
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
                    <option value="A_DEMANDA">
                      A demanda
                    </option>
                  </SelectInput>
                </Field>

                {form.frecuenciaEntrega === "MENSUAL" ? (
                  <Field label="Día del mes de entrega * (1 a 31)">
                    <TextInput
                      inputMode="numeric"
                      maxLength={2}
                      onChange={(value) => update("diaMesEntrega", value)}
                      value={form.diaMesEntrega}
                    />
                  </Field>
                ) : null}
              </div>

              <div
                className={
                  styles.deliveryDays
                }
              >
                <span>
                  {["SEMANAL", "QUINCENAL"].includes(form.frecuenciaEntrega) ? "Días de entrega * (obligatorios con esta frecuencia)" : "Días de entrega"}
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
