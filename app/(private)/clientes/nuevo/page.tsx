"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { calcularDvRuc, validarRucDv } from "@/lib/fiscal/calcular-dv-ruc";
import { TelefonoPais } from "@/components/clientes/telefono-pais";
import { validarTelefono } from "@/lib/fiscal/telefono";
import { DESCUENTO_COMERCIAL, LIMITE_CREDITO, decimalAcotado } from "@/lib/clientes/comercial";
import { altaSucia, finalizarSinPendientes as finalizarCarga } from "@/lib/clientes/cierre-alta";
import { crearCargasGeograficas } from "@/lib/clientes/geografia-cargas";
import { pestanaDeErrorApi } from "@/lib/clientes/pestanas";
import { useProtegerCambios } from "@/lib/ui/proteger-cambios";
import { ACCEPT_ARCHIVOS, EXTENSIONES_TEXTO, TAMANO_MAXIMO_BYTES, tamanoLegible, validarNombreYTamano } from "@/lib/almacenamiento/archivos-reglas";
import { validarFrecuenciaYDias } from "@/lib/clientes/logistica";
import { validarDireccionFiscalRequerida } from "@/lib/clientes/obligatoriedad-fiscal";
import {
  NOMBRE_INNOMINADO,
  validarCamposReceptor,
  validarDireccionFiscal,
  validarGln,
  validarInnominado,
  validarLongitudes,
  validarNaturalezaOperacion,
} from "@/lib/fiscal/campos-receptor";

type Opcion = {
  id?: string;
  codigo?: string | number;
  nombre: string;
  moneda_codigo?: string;
};

type Catalogos = {
  grupos: Opcion[];
  condicionesPago: Opcion[];
  monedas: Opcion[];
  listasPrecio: Opcion[];
  rutasEntrega: Opcion[];
  zonasComerciales: Opcion[];
  vendedores: Opcion[];
  canalesVenta: Opcion[];
  paises: Opcion[];
  departamentosParaguay: Opcion[];
};

type Contacto = {
  nombre: string;
  apellido: string;
  cargo: string;
  departamento: string;
  telefono: string;
  telefonoPais: string;
  telefonoDdi: string;
  telefonoArea: string;
  celular: string;
  celularPais: string;
  celularDdi: string;
  celularArea: string;
  email: string;
  esPrincipal: boolean;
  recibePedidos: boolean;
  recibeFacturacion: boolean;
  recibeCobranzas: boolean;
  recibeDocumentosElectronicos: boolean;
  recibeNotificaciones: boolean;
};

type Direccion = {
  /** CLI-D03: identidad estable de la dirección (no es el índice del arreglo); no se envía al servidor. */
  uid: string;
  tipo: string;
  etiqueta: string;
  direccion: string;
  numeroCasa: string;
  complemento: string;
  paisCodigo: string;
  departamentoCodigo: string;
  departamento: string;
  distritoCodigo: string;
  distrito: string;
  ciudadCodigo: string;
  ciudad: string;
  codigoPostal: string;
  contactoNombre: string;
  contactoTelefono: string;
  horarioRecepcion: string;
  observacion: string;
  esFiscal: boolean;
  esEntregaDefault: boolean;
  latitud: string;
  longitud: string;
};

type Documento = {
  /** Identificador estable de la fila (los índices cambian al eliminar filas): permite saber cuáles ya se cargaron. */
  uid: string;
  tipo: string;
  /** Archivo real elegido por el usuario; se sube a almacenamiento privado una vez creado el cliente. */
  archivo: File | null;
  fechaEmision: string;
  fechaVencimiento: string;
  observacion: string;
};

type Formulario = {
  naturaleza: string;
  tipoOperacion: string;
  tipoPersona: string;
  paisCodigo: string;
  tipoDocumento: string;
  descripcionDocumentoIdentidad: string;
  numeroDocumento: string;
  dv: string;
  razonSocial: string;
  nombreFantasia: string;
  email: string;
  emailCopia: string;
  telefono: string;
  telefonoPais: string;
  telefonoDdi: string;
  telefonoArea: string;
  celular: string;
  celularPais: string;
  celularDdi: string;
  celularArea: string;
  limiteCredito: string;
  grupoClienteId: string;
  condicionPagoId: string;
  monedaCodigoPredeterminada: string;
  listaPrecioId: string;
  canalVentaId: string;
  codigoExterno: string;
  gln: string;
  descuentoComercialPct: string;
  limiteCreditoTemporal: string;
  fechaVencimientoCredito: string;
  bloqueadoVentas: boolean;
  motivoBloqueoVentas: string;
  diaPreferidoCobro: string;
  requiereOrdenCompra: boolean;
  emailFacturacion: string;
  emailCobranzas: string;
  recibeDocumentoElectronico: boolean;
  rutaEntregaId: string;
  zonaComercialId: string;
  vendedorId: string;
  frecuenciaEntrega: string;
  diaMesEntrega: string;
  diasEntrega: number[];
  observacionComercial: string;
  observacionLogistica: string;
};

const catalogosVacios: Catalogos = {
  grupos: [],
  condicionesPago: [],
  monedas: [],
  listasPrecio: [],
  rutasEntrega: [],
  zonasComerciales: [],
  vendedores: [],
  canalesVenta: [],
  paises: [],
  departamentosParaguay: [],
};

const formularioInicial: Formulario = {
  naturaleza: "CONTRIBUYENTE",
  tipoOperacion: "B2B",
  tipoPersona: "",
  paisCodigo: "PRY",
  tipoDocumento: "RUC",
  descripcionDocumentoIdentidad: "",
  numeroDocumento: "",
  dv: "",
  razonSocial: "",
  nombreFantasia: "",
  email: "",
  emailCopia: "",
  telefono: "",
  telefonoPais: "PRY",
  telefonoDdi: "595",
  telefonoArea: "",
  celular: "",
  celularPais: "PRY",
  celularDdi: "595",
  celularArea: "",
  limiteCredito: "0",
  grupoClienteId: "",
  condicionPagoId: "",
  monedaCodigoPredeterminada: "PYG",
  listaPrecioId: "",
  canalVentaId: "",
  codigoExterno: "",
  gln: "",
  descuentoComercialPct: "",
  limiteCreditoTemporal: "",
  fechaVencimientoCredito: "",
  bloqueadoVentas: false,
  motivoBloqueoVentas: "",
  diaPreferidoCobro: "",
  requiereOrdenCompra: false,
  emailFacturacion: "",
  emailCobranzas: "",
  recibeDocumentoElectronico: true,
  rutaEntregaId: "",
  zonaComercialId: "",
  vendedorId: "",
  frecuenciaEntrega: "",
  diaMesEntrega: "",
  diasEntrega: [],
  observacionComercial: "",
  observacionLogistica: "",
};

function crearContacto(): Contacto {
  return {
    nombre: "",
    apellido: "",
    cargo: "",
    departamento: "",
    telefono: "",
    telefonoPais: "PRY",
    telefonoDdi: "595",
    telefonoArea: "",
    celular: "",
    celularPais: "PRY",
    celularDdi: "595",
    celularArea: "",
    email: "",
    esPrincipal: false,
    recibePedidos: false,
    recibeFacturacion: false,
    recibeCobranzas: false,
    recibeDocumentosElectronicos: false,
    recibeNotificaciones: true,
  };
}

let secuenciaDireccion = 0;

function crearDireccion(): Direccion {
  return {
    uid: `d${++secuenciaDireccion}`,
    tipo: "COMERCIAL",
    etiqueta: "",
    direccion: "",
    numeroCasa: "",
    complemento: "",
    paisCodigo: "PRY",
      departamentoCodigo: "",
    departamento: "",
    distritoCodigo: "",
    distrito: "",
    ciudadCodigo: "",
    ciudad: "",
    codigoPostal: "",
    contactoNombre: "",
    contactoTelefono: "",
    horarioRecepcion: "",
    observacion: "",
    esFiscal: false,
    esEntregaDefault: false,
    latitud: "",
    longitud: "",
  };
}

let contadorDocumentos = 0;

function crearDocumento(): Documento {
  return {
    uid: `d${++contadorDocumentos}`,
    tipo: "OTRO",
    archivo: null,
    fechaEmision: "",
    fechaVencimiento: "",
    observacion: "",
  };
}

const FORMATO_FECHA = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Misma regla que el POST: dd/mm/yyyy y fecha real del calendario.
function fechaValida(valor: string) {
  const partes = FORMATO_FECHA.exec(valor.trim());
  if (!partes) return false;
  const [, dia, mes, anio] = partes.map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

function fechaComparable(valor: string) {
  const [dia, mes, anio] = valor.trim().split("/");
  return `${anio}${mes}${dia}`;
}

const PESTANAS: Record<string, string> = {
  fiscal: "Información fiscal",
  comercial: "Comercial y crédito",
  contactos: "Contactos",
  direcciones: "Direcciones",
  logistica: "Entrega y ventas",
  documentos: "Documentos",
};

type Incidencia = { pestana: string; mensaje: string; campo?: string };


function valorOpcion(opcion: Opcion) {
  return opcion.id ?? String(opcion.codigo ?? "");
}

function opcionesCatalogo(opciones: Opcion[], etiquetaVacia = "Sin asignar") {
  return [
    { value: "", label: etiquetaVacia },
    ...opciones.map((opcion) => ({
      value: valorOpcion(opcion),
      label: opcion.codigo
        ? `${opcion.codigo} · ${opcion.nombre}`
        : opcion.nombre,
    })),
  ];
}

export default function NuevoClientePage() {
  const router = useRouter();
  const [tab, setTab] = useState("fiscal");
  const [formulario, setFormulario] = useState<Formulario>(formularioInicial);
  const [catalogos, setCatalogos] = useState<Catalogos>(catalogosVacios);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [direcciones, setDirecciones] = useState<Direccion[]>([]);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [distritosPorDireccion, setDistritosPorDireccion] = useState<
    Record<string, Opcion[]>
  >({});
  const [ciudadesPorDireccion, setCiudadesPorDireccion] = useState<
    Record<string, Opcion[]>
  >({});
  const [error, setError] = useState("");
  const [pestanaConError, setPestanaConError] = useState("");
  const [aviso, setAviso] = useState("");
  const [guardando, setGuardando] = useState(false);
  // CLI-D01: permiso VER informado por la API desde la sesión del servidor. Sin VER no hay lista ni fichas: la alta termina en una pantalla propia y no ofrece enlaces a ellas.
  const [puedeVer, setPuedeVer] = useState(false);
  const [altaFinalizada, setAltaFinalizada] = useState(false);
  // CLI-R03-01: el servidor confirmó el cierre de la carga inicial; recién entonces se libera la protección de cambios sin guardar.
  const [cerrada, setCerrada] = useState(false);
  // Cliente ya creado (identidad conservada): a partir de aquí el formulario nunca vuelve a crear otro; solo reintenta documentos pendientes y el cierre.
  const [altaCreada, setAltaCreada] = useState<{ id: string } | null>(null);
  const [docsSubidos, setDocsSubidos] = useState<string[]>([]);
  const [erroresDocs, setErroresDocs] = useState<Record<string, string>>({});

  // CLI-D03: cargas por dirección con identidad estable y tokens; cambiar departamento/distrito/país o quitar la dirección invalida lo pendiente (ver lib/clientes/geografia-cargas.ts).
  const [geo] = useState(() => {
    async function pedirGeo(url: string): Promise<Opcion[]> {
      const respuesta = await fetch(url, { cache: "no-store" });
      const datos = (await respuesta.json()) as { datos?: Opcion[]; error?: string };

      if (!respuesta.ok) throw new Error(datos.error ?? "No fue posible cargar la ubicación.");

      return datos.datos ?? [];
    }

    return crearCargasGeograficas({
      pedirDistritos: (dep) => pedirGeo(`/api/clientes?catalogo=distritos&departamento=${encodeURIComponent(dep)}`),
      pedirCiudades: (dep, dis) => pedirGeo(`/api/clientes?catalogo=ciudades&departamento=${encodeURIComponent(dep)}&distrito=${encodeURIComponent(dis)}`),
      alDistritos: (uid, o) => setDistritosPorDireccion((actual) => ({ ...actual, [uid]: o as Opcion[] })),
      alCiudades: (uid, o) => setCiudadesPorDireccion((actual) => ({ ...actual, [uid]: o as Opcion[] })),
      alError: setError,
    });
  });

  // CLI-A02: avisa antes de perder datos escritos (ficha, contactos, direcciones, documentos con archivo). Tras crear el cliente solo protege los archivos que faltan por subir.
  const sucio = altaSucia({
    altaCreada: altaCreada !== null,
    cerrada,
    formularioSucio: JSON.stringify(formulario) !== JSON.stringify(formularioInicial) || contactos.length > 0 || direcciones.length > 0 || documentos.length > 0,
    hayArchivosPendientes: documentos.some((d) => d.archivo && !docsSubidos.includes(d.uid)),
  });

  useProtegerCambios(sucio && !guardando);

  async function cargarCatalogos() {
    try {
      const respuesta = await fetch("/api/clientes?modo=catalogos", {
        cache: "no-store",
      });
      const datos = (await respuesta.json()) as {
        catalogos?: Partial<Catalogos>;
        permisos?: { ver?: boolean };
        error?: string;
      };

      if (!respuesta.ok) {
        throw new Error(datos.error ?? "No fue posible cargar los catálogos.");
      }

      setPuedeVer(datos.permisos?.ver === true);

      const respuestaCatalogos = datos.catalogos ?? {};

      setCatalogos({
        grupos: respuestaCatalogos.grupos ?? [],
        condicionesPago: respuestaCatalogos.condicionesPago ?? [],
        monedas: respuestaCatalogos.monedas ?? [],
        listasPrecio: respuestaCatalogos.listasPrecio ?? [],
        rutasEntrega: respuestaCatalogos.rutasEntrega ?? [],
        zonasComerciales: respuestaCatalogos.zonasComerciales ?? [],
        vendedores: respuestaCatalogos.vendedores ?? [],
        canalesVenta: respuestaCatalogos.canalesVenta ?? [],
        paises: respuestaCatalogos.paises ?? [],
        departamentosParaguay: respuestaCatalogos.departamentosParaguay ?? [],
      });
    } catch (errorCarga) {
      setError(
        errorCarga instanceof Error
          ? errorCarga.message
          : "No fue posible cargar los catálogos.",
      );
    }
  }

  useEffect(() => {
    // Carga diferida (no síncrona en el cuerpo del efecto)
    void Promise.resolve().then(cargarCatalogos);
  }, []);

  function actualizarFormulario<K extends keyof Formulario>(
    campo: K,
    valor: Formulario[K],
  ) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
  }

  function actualizarDireccion<K extends keyof Direccion>(
    indice: number,
    campo: K,
    valor: Direccion[K],
  ) {
    setDirecciones((actuales) =>
      actuales.map((direccion, posicion) =>
        posicion === indice ? { ...direccion, [campo]: valor } : direccion,
      ),
    );
  }

  function actualizarContacto<K extends keyof Contacto>(
    indice: number,
    campo: K,
    valor: Contacto[K],
  ) {
    setContactos((actuales) =>
      actuales.map((contacto, posicion) =>
        posicion === indice ? { ...contacto, [campo]: valor } : contacto,
      ),
    );
  }

  function establecerContactoPrincipal(indice: number, marcado: boolean) {
    setContactos((actuales) =>
      actuales.map((contacto, posicion) => ({
        ...contacto,
        esPrincipal: posicion === indice ? marcado : marcado ? false : contacto.esPrincipal,
      })),
    );
  }

  // Un solo domicilio fiscal: `tipo` y `esFiscal` se mantienen coherentes en todos los ítems
  // (el POST fuerza es_fiscal cuando tipo = FISCAL y el índice único rechaza dos fiscales).
  function establecerDireccionFiscal(indice: number, marcado: boolean) {
    setDirecciones((actuales) =>
      actuales.map((direccion, posicion) => {
        if (posicion === indice) {
          return {
            ...direccion,
            esFiscal: marcado,
            tipo: !marcado && direccion.tipo === "FISCAL" ? "COMERCIAL" : direccion.tipo,
          };
        }
        if (!marcado) return direccion;
        return {
          ...direccion,
          esFiscal: false,
          tipo: direccion.tipo === "FISCAL" ? "COMERCIAL" : direccion.tipo,
        };
      }),
    );
    if (marcado) {
      setAviso("Solo puede haber una dirección fiscal: las demás pasaron a tipo Comercial si eran Fiscal.");
    }
  }

  function establecerEntregaDefault(indice: number, marcado: boolean) {
    setDirecciones((actuales) =>
      actuales.map((direccion, posicion) => ({
        ...direccion,
        esEntregaDefault:
          posicion === indice ? marcado : marcado ? false : direccion.esEntregaDefault,
      })),
    );
  }

  function cambiarTipoDireccion(indice: number, tipo: string) {
    setDirecciones((actuales) =>
      actuales.map((direccion, posicion) => {
        if (posicion !== indice) {
          if (tipo !== "FISCAL") return direccion;
          return {
            ...direccion,
            esFiscal: false,
            tipo: direccion.tipo === "FISCAL" ? "COMERCIAL" : direccion.tipo,
          };
        }

        return {
          ...direccion,
          tipo,
          esFiscal:
            tipo === "FISCAL"
              ? true
              : direccion.tipo === "FISCAL"
                ? false
                : direccion.esFiscal,
        };
      }),
    );
    if (tipo === "FISCAL") {
      setAviso("Solo puede haber una dirección fiscal: las demás pasaron a tipo Comercial si eran Fiscal.");
    }
  }

  function actualizarDocumento<K extends keyof Documento>(
    indice: number,
    campo: K,
    valor: Documento[K],
  ) {
    setDocumentos((actuales) =>
      actuales.map((documento, posicion) =>
        posicion === indice ? { ...documento, [campo]: valor } : documento,
      ),
    );
  }

  function seleccionarDepartamento(indice: number, codigo: string) {
    const departamento = catalogos.departamentosParaguay.find(
      (opcion) => String(opcion.codigo) === codigo,
    );
    const uid = direcciones[indice]?.uid;

    actualizarDireccion(indice, "departamentoCodigo", codigo);
    actualizarDireccion(indice, "departamento", departamento?.nombre ?? "");
    actualizarDireccion(indice, "distritoCodigo", "");
    actualizarDireccion(indice, "distrito", "");
    actualizarDireccion(indice, "ciudadCodigo", "");
    actualizarDireccion(indice, "ciudad", "");

    return uid ? geo.elegirDepartamento(uid, codigo) : Promise.resolve();
  }

  function seleccionarDistrito(indice: number, codigo: string) {
    const direccion = direcciones[indice];
    const distrito = (distritosPorDireccion[direccion?.uid ?? ""] ?? []).find(
      (opcion) => String(opcion.codigo) === codigo,
    );

    actualizarDireccion(indice, "distritoCodigo", codigo);
    actualizarDireccion(indice, "distrito", distrito?.nombre ?? "");
    actualizarDireccion(indice, "ciudadCodigo", "");
    actualizarDireccion(indice, "ciudad", "");

    return direccion ? geo.elegirDistrito(direccion.uid, direccion.departamentoCodigo, codigo) : Promise.resolve();
  }

  function seleccionarCiudad(indice: number, codigo: string) {
    const ciudad = (ciudadesPorDireccion[direcciones[indice]?.uid ?? ""] ?? []).find(
      (opcion) => String(opcion.codigo) === codigo,
    );

    actualizarDireccion(indice, "ciudadCodigo", codigo);
    actualizarDireccion(indice, "ciudad", ciudad?.nombre ?? "");
  }
  // Valida los seis conjuntos antes del POST con las mismas reglas que hoy aplica la API
  // (sin reglas nuevas): nada se descarta en silencio y el error apunta a pestaña y campo.
  function validar(): Incidencia | null {
    const f = formulario;
    const contribuyente = f.naturaleza === "CONTRIBUYENTE";
    const fiscal = (mensaje: string, campo?: string): Incidencia => ({
      pestana: "fiscal",
      mensaje,
      campo,
    });

    if (!f.tipoPersona) {
      return fiscal("Seleccione si el cliente es persona física o persona jurídica.", "cli-tipo-persona");
    }
    if (!f.paisCodigo) return fiscal("Seleccione el país del cliente.", "cli-pais");
    if (contribuyente) {
      if (!f.numeroDocumento.trim()) return fiscal("Informe el RUC del cliente.", "cli-numero");
      const rucDv = validarRucDv(f.numeroDocumento, f.dv);
      if (!rucDv.ok) return fiscal(rucDv.error, "cli-numero");
    } else {
      if (!f.tipoDocumento) return fiscal("Seleccione el tipo de documento del cliente.", "cli-tipo-documento");
      if (!f.numeroDocumento.trim()) return fiscal("Informe el número de documento del cliente.", "cli-numero");
      if (f.tipoDocumento === "OTRO" && !f.descripcionDocumentoIdentidad.trim()) {
        return fiscal("Describa el tipo de documento seleccionado como Otro.", "cli-descripcion-documento");
      }
    }
    if (!f.razonSocial.trim()) return fiscal("Informe el nombre o razón social del cliente.", "cli-razon-social");
    const errorReceptor = validarCamposReceptor({
      naturaleza: f.naturaleza,
      tipoDocumento: f.tipoDocumento,
      numeroDocumento: f.numeroDocumento.trim(),
      descripcionDocumento: f.descripcionDocumentoIdentidad.trim(),
      razonSocial: f.razonSocial.trim(),
      nombreFantasia: f.nombreFantasia.trim(),
      email: f.email.trim(),
      telefono: f.telefono.trim(),
      celular: f.celular.trim(),
    });
    if (errorReceptor) {
      const campo = /documento|descripci/i.test(errorReceptor)
        ? /descripci/i.test(errorReceptor)
          ? "cli-descripcion-documento"
          : "cli-numero"
        : /fantas/i.test(errorReceptor)
          ? "cli-nombre-fantasia"
          : /razón/i.test(errorReceptor)
            ? "cli-razon-social"
            : /correo/i.test(errorReceptor)
              ? "cli-email"
              : /celular/i.test(errorReceptor)
                ? "cli-celular"
                : "cli-telefono";
      return fiscal(errorReceptor, campo);
    }
    const errorReglas =
      validarNaturalezaOperacion(f.naturaleza, f.tipoOperacion) ??
      validarInnominado({
        tipoDocumento: f.tipoDocumento,
        naturaleza: f.naturaleza,
        tipoOperacion: f.tipoOperacion,
        numeroDocumento: f.numeroDocumento.trim(),
        razonSocial: f.razonSocial.trim(),
      });
    if (errorReglas) return fiscal(errorReglas, "cli-tipo-documento");
    const telefonoFiscal = validarTelefono("telefono", { pais: f.telefonoPais, ddi: f.telefonoDdi, area: f.telefonoArea, numero: f.telefono });
    if (!telefonoFiscal.ok) return fiscal(telefonoFiscal.error, "cli-telefono");
    const celularFiscal = validarTelefono("celular", { pais: f.celularPais, ddi: f.celularDdi, area: f.celularArea, numero: f.celular });
    if (!celularFiscal.ok) return fiscal(celularFiscal.error, "cli-celular");
    if (f.email.trim() && !FORMATO_CORREO.test(f.email.trim())) {
      return fiscal("El correo electrónico no tiene un formato válido.", "cli-email");
    }
    if (f.emailCopia.trim() && !FORMATO_CORREO.test(f.emailCopia.trim())) {
      return fiscal("El correo en copia no tiene un formato válido.", "cli-email-copia");
    }

    const comercial = (mensaje: string, campo?: string): Incidencia => ({
      pestana: "comercial",
      mensaje,
      campo,
    });
    const errorGln = validarGln(f.gln.trim());
    if (errorGln) return comercial(errorGln, "cli-gln");
    const errorLargoComercial = validarLongitudes([
      [f.codigoExterno.trim(), 100, "El código externo"],
      [f.observacionComercial.trim(), 1000, "Las observaciones comerciales"],
      [f.motivoBloqueoVentas.trim(), 500, "El motivo del bloqueo"],
      [f.emailCopia.trim(), 150, "El correo en copia"],
      [f.emailFacturacion.trim(), 150, "El correo de facturación"],
      [f.emailCobranzas.trim(), 150, "El correo de cobranzas"],
    ]);
    if (errorLargoComercial) return comercial(errorLargoComercial);
    const errorLargoLogistica = validarLongitudes([[f.observacionLogistica.trim(), 1000, "Las observaciones logísticas"]]);
    if (errorLargoLogistica) return { pestana: "logistica", mensaje: errorLargoLogistica };
    if (f.limiteCreditoTemporal.trim() === "" && f.fechaVencimientoCredito.trim()) {
      return comercial("Para informar el vencimiento del límite temporal, indique también el límite temporal.", "cli-limite-temporal");
    }
    if (f.fechaVencimientoCredito.trim() && !fechaValida(f.fechaVencimientoCredito)) {
      return comercial("El vencimiento del límite temporal debe ser una fecha válida con formato dd/mm/yyyy.", "cli-vencimiento");
    }
    if (f.diaPreferidoCobro.trim()) {
      const dia = Number(f.diaPreferidoCobro);
      if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
        return comercial("El día preferido de cobro debe ser un número entero entre 1 y 31.", "cli-dia-cobro");
      }
    }
    try {
      decimalAcotado(f.limiteCredito, "El límite de crédito", LIMITE_CREDITO);
    } catch (errorNumerico) {
      return comercial((errorNumerico as Error).message, "cli-limite-credito");
    }
    try {
      decimalAcotado(f.limiteCreditoTemporal, "El límite de crédito temporal", LIMITE_CREDITO);
    } catch (errorNumerico) {
      return comercial((errorNumerico as Error).message, "cli-limite-temporal");
    }
    try {
      decimalAcotado(f.descuentoComercialPct, "El descuento comercial", DESCUENTO_COMERCIAL);
    } catch (errorNumerico) {
      return comercial((errorNumerico as Error).message, "cli-descuento");
    }
    if (f.emailFacturacion.trim() && !FORMATO_CORREO.test(f.emailFacturacion.trim())) {
      return comercial("El correo de facturación no tiene un formato válido.", "cli-email-facturacion");
    }
    if (f.emailCobranzas.trim() && !FORMATO_CORREO.test(f.emailCobranzas.trim())) {
      return comercial("El correo de cobranzas no tiene un formato válido.", "cli-email-cobranzas");
    }
    if (f.bloqueadoVentas && !f.motivoBloqueoVentas.trim()) {
      return comercial("Informe el motivo del bloqueo de ventas.", "cli-motivo-bloqueo");
    }

    const errorLogistica = validarFrecuenciaYDias(f.frecuenciaEntrega, f.diasEntrega, f.diaMesEntrega);
    if (errorLogistica) return { pestana: "logistica", mensaje: errorLogistica, campo: "cli-frecuencia" };

    for (let i = 0; i < contactos.length; i += 1) {
      const c = contactos[i];
      const n = i + 1;
      const vacio = ![c.nombre, c.apellido, c.cargo, c.departamento, c.telefono, c.celular, c.email].some((v) => v.trim());
      if (vacio) {
        return { pestana: "contactos", mensaje: `El contacto ${n} está vacío: complételo o elimínelo.`, campo: `cli-contacto-${i}-nombre` };
      }
      if (!c.nombre.trim()) {
        return { pestana: "contactos", mensaje: `El contacto ${n} necesita nombre.`, campo: `cli-contacto-${i}-nombre` };
      }
      const telContacto = validarTelefono("telefono", { pais: c.telefonoPais, ddi: c.telefonoDdi, area: c.telefonoArea, numero: c.telefono }, `el teléfono del contacto ${n}`);
      if (!telContacto.ok) return { pestana: "contactos", mensaje: telContacto.error, campo: `cli-contacto-${i}-telefono` };
      const celContacto = validarTelefono("celular", { pais: c.celularPais, ddi: c.celularDdi, area: c.celularArea, numero: c.celular }, `el celular del contacto ${n}`);
      if (!celContacto.ok) return { pestana: "contactos", mensaje: celContacto.error, campo: `cli-contacto-${i}-celular` };
      const largoContacto = validarLongitudes([
        [c.nombre.trim(), 100, `El nombre del contacto ${n}`],
        [c.apellido.trim(), 100, `El apellido del contacto ${n}`],
        [c.cargo.trim(), 100, `El cargo del contacto ${n}`],
        [c.departamento.trim(), 100, `El departamento del contacto ${n}`],
        [c.telefono.trim(), 30, `El teléfono del contacto ${n}`],
        [c.celular.trim(), 30, `El celular del contacto ${n}`],
        [c.email.trim(), 150, `El correo del contacto ${n}`],
      ]);
      if (largoContacto) return { pestana: "contactos", mensaje: largoContacto, campo: `cli-contacto-${i}-nombre` };
      if (c.email.trim() && !FORMATO_CORREO.test(c.email.trim())) {
        return { pestana: "contactos", mensaje: `El correo del contacto ${n} no tiene un formato válido.`, campo: `cli-contacto-${i}-email` };
      }
    }

    for (let i = 0; i < direcciones.length; i += 1) {
      const d = direcciones[i];
      const n = i + 1;
      if (!d.direccion.trim()) {
        return { pestana: "direcciones", mensaje: `La dirección ${n} necesita el campo Dirección; si no la necesita, elimínela.`, campo: `cli-direccion-${i}-direccion` };
      }
      if (!d.paisCodigo) {
        return { pestana: "direcciones", mensaje: `Seleccione el país de la dirección ${n}.`, campo: `cli-direccion-${i}-pais` };
      }
      const largoDireccion = validarLongitudes([
        [d.etiqueta.trim(), 100, `La etiqueta de la dirección ${n}`],
        [d.direccion.trim(), 300, `La dirección ${n}`],
        [d.numeroCasa.trim(), 20, `El número de casa de la dirección ${n}`],
        [d.complemento.trim(), 200, `El complemento de la dirección ${n}`],
        [d.codigoPostal.trim(), 15, `El código postal de la dirección ${n}`],
        [d.contactoNombre.trim(), 200, `El contacto de recepción de la dirección ${n}`],
        [d.contactoTelefono.trim(), 30, `El teléfono de recepción de la dirección ${n}`],
        [d.horarioRecepcion.trim(), 200, `El horario de recepción de la dirección ${n}`],
        [d.observacion.trim(), 500, `La observación de la dirección ${n}`],
      ]);
      if (largoDireccion) return { pestana: "direcciones", mensaje: largoDireccion, campo: `cli-direccion-${i}-direccion` };
      if (d.esFiscal || d.tipo === "FISCAL") {
        const errorFiscal = validarDireccionFiscal(d.direccion.trim(), d.numeroCasa.trim(), {
          exigir: f.tipoOperacion !== "B2F",
          departamento: d.departamentoCodigo,
          distrito: d.distritoCodigo,
          ciudad: d.ciudadCodigo,
        });
        if (errorFiscal) {
          return {
            pestana: "direcciones",
            mensaje: `Dirección ${n}: ${errorFiscal}`,
            campo: `cli-direccion-${i}-${/número/i.test(errorFiscal) ? "numero" : "direccion"}`,
          };
        }
      }
    }
    const errorB2F = validarDireccionFiscalRequerida(f.tipoOperacion, direcciones.some((d) => d.esFiscal || d.tipo === "FISCAL"));
    if (errorB2F) return { pestana: "direcciones", mensaje: errorB2F };
    if (direcciones.filter((d) => d.esFiscal || d.tipo === "FISCAL").length > 1) {
      return { pestana: "direcciones", mensaje: "Solo puede haber una dirección fiscal." };
    }
    if (direcciones.filter((d) => d.esEntregaDefault).length > 1) {
      return { pestana: "direcciones", mensaje: "Solo puede haber una dirección de entrega predeterminada." };
    }

    for (let i = 0; i < documentos.length; i += 1) {
      const d = documentos[i];
      const n = i + 1;
      if (!d.archivo) {
        return { pestana: "documentos", mensaje: `El documento ${n} necesita el archivo; si no lo necesita, elimínelo.`, campo: `cli-documento-${i}-archivo` };
      }
      const errorArchivo = validarNombreYTamano(d.archivo.name, d.archivo.size);
      if (errorArchivo) {
        return { pestana: "documentos", mensaje: `Documento ${n}: ${errorArchivo}`, campo: `cli-documento-${i}-archivo` };
      }
      const largoDocumento = validarLongitudes([[d.observacion.trim(), 500, `La observación del documento ${n}`]]);
      if (largoDocumento) return { pestana: "documentos", mensaje: largoDocumento, campo: `cli-documento-${i}-observacion` };
      if (d.fechaEmision.trim() && !fechaValida(d.fechaEmision)) {
        return { pestana: "documentos", mensaje: `La fecha de emisión del documento ${n} debe tener formato dd/mm/yyyy y ser válida.`, campo: `cli-documento-${i}-emision` };
      }
      if (d.fechaVencimiento.trim() && !fechaValida(d.fechaVencimiento)) {
        return { pestana: "documentos", mensaje: `La fecha de vencimiento del documento ${n} debe tener formato dd/mm/yyyy y ser válida.`, campo: `cli-documento-${i}-vencimiento` };
      }
      if (
        d.fechaEmision.trim() &&
        d.fechaVencimiento.trim() &&
        fechaComparable(d.fechaVencimiento) < fechaComparable(d.fechaEmision)
      ) {
        return { pestana: "documentos", mensaje: `El vencimiento del documento ${n} no puede ser anterior a su emisión.`, campo: `cli-documento-${i}-vencimiento` };
      }
    }

    return null;
  }

  function mostrarIncidencia(incidencia: Incidencia) {
    setPestanaConError(incidencia.pestana);
    setTab(incidencia.pestana);
    setError(`${PESTANAS[incidencia.pestana] ?? ""}: ${incidencia.mensaje}`);
    if (incidencia.campo) {
      const id = incidencia.campo;
      window.setTimeout(() => document.getElementById(id)?.focus(), 60);
    }
  }

  // ---- Alta con documentos (F-CLI-09-05 / F-CLI-09-06) ------------------------------------------------------------------
  // El cliente se crea UNA sola vez. Después se suben los archivos pendientes; los que fallan se reintentan solos (los ya
  // cargados no se reenvían y `POST /api/clientes` no se repite). La carga inicial se cierra al terminar los uploads o por
  // acción explícita del usuario. Todo el flujo corre con la autorización del creador (CLIENTES.CREAR), sin exigir EDITAR.

  // Cierra la carga inicial verificando la RESPUESTA; si falla, el alta no se presenta como concluida.
  async function cerrarCargaInicial(clienteId: string): Promise<boolean> {
    try {
      const respuesta = await fetch(`/api/clientes/${clienteId}/documentos/finalizar`, { method: "POST" });

      if (respuesta.ok) return true;

      const detalle = (await respuesta.json().catch(() => ({}))) as { error?: string };

      setError(`El cliente ya se creó, pero no se pudo cerrar la carga inicial de sus documentos (${detalle.error ?? `error ${respuesta.status}`}). Pulse «Reintentar» para volver a intentarlo; no se creará otro cliente.`);
    } catch {
      setError("El cliente ya se creó, pero no se pudo cerrar la carga inicial de sus documentos por un error de conexión. Pulse «Reintentar» para volver a intentarlo; no se creará otro cliente.");
    }

    return false;
  }

  // Sube SOLO los documentos con archivo que aún no se cargaron. Devuelve true si no queda ninguno pendiente.
  async function subirPendientes(clienteId: string): Promise<boolean> {
    const subidos = [...docsSubidos];
    const errores: Record<string, string> = {};

    for (const documento of documentos) {
      if (!documento.archivo || subidos.includes(documento.uid)) continue;

      const formularioArchivo = new FormData();
      formularioArchivo.set("archivo", documento.archivo);
      formularioArchivo.set("tipo", documento.tipo);
      formularioArchivo.set("fechaEmision", documento.fechaEmision.trim());
      formularioArchivo.set("fechaVencimiento", documento.fechaVencimiento.trim());
      formularioArchivo.set("observacion", documento.observacion.trim());

      try {
        const subida = await fetch(`/api/clientes/${clienteId}/documentos`, { method: "POST", body: formularioArchivo });

        if (subida.ok) {
          subidos.push(documento.uid);
        } else {
          const detalle = (await subida.json().catch(() => ({}))) as { error?: string };
          errores[documento.uid] = detalle.error ?? `no se pudo cargar (error ${subida.status})`;
        }
      } catch {
        errores[documento.uid] = "error de conexión";
      }
    }

    setDocsSubidos(subidos);
    setErroresDocs(errores);

    return Object.keys(errores).length === 0;
  }

  function terminarAlta() {
    setCerrada(true);

    // CLI-D01: quien solo puede CREAR no tiene acceso a la lista ni a las fichas; termina en una pantalla propia que permite iniciar otro alta.
    if (!puedeVer) {
      setAltaFinalizada(true);

      return;
    }

    router.push("/clientes?ok=creado");
    router.refresh();
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError("");
    setPestanaConError("");

    let clienteId = altaCreada?.id ?? null;

    if (!clienteId) {
      const incidencia = validar();
      if (incidencia) {
        mostrarIncidencia(incidencia);
        return;
      }
    }

    setGuardando(true);

    try {
      if (!clienteId) {
        const respuesta = await fetch("/api/clientes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Los documentos son archivos reales: se suben a almacenamiento privado DESPUÉS de crear el cliente.
          body: JSON.stringify({ ...formulario, contactos, direcciones: direcciones.map(({ uid, ...resto }) => { void uid; return resto; }), documentos: [] }),
        });
        const datos = (await respuesta.json()) as { error?: string; cliente?: { id?: string } };

        if (!respuesta.ok) {
          throw new Error(datos.error ?? "No fue posible guardar el cliente.");
        }

        clienteId = datos.cliente?.id ?? null;

        // Identidad del cliente creado: de aquí en adelante este formulario nunca vuelve a crear otro.
        if (clienteId) {
          setAltaCreada({ id: clienteId });
          setTab("documentos");
        }
      }

      if (clienteId) {
        if (!(await subirPendientes(clienteId))) {
          setTab("documentos");
          setError("El cliente ya se creó, pero algunos documentos no se cargaron. Corrija lo indicado y pulse «Reintentar documentos pendientes» (solo se reenvían los pendientes), o finalice sin ellos.");
          return;
        }

        // Alta completa: se cierra la carga inicial (quien solo puede crear deja de poder agregar documentos a este cliente).
        if (!(await cerrarCargaInicial(clienteId))) return;
      }

      terminarAlta();
    } catch (errorGuardado) {
      const mensaje =
        errorGuardado instanceof Error
          ? errorGuardado.message
          : "No fue posible guardar el cliente.";
      const pestana = pestanaDeErrorApi(mensaje);
      setPestanaConError(pestana);
      setTab(pestana);
      setError(`${PESTANAS[pestana]}: ${mensaje}`);
    } finally {
      setGuardando(false);
    }
  }

  // Acción explícita del usuario: cerrar la carga inicial SIN los documentos pendientes (deberá agregarlos alguien con permiso de edición).
  async function finalizarSinPendientes() {
    if (!altaCreada) return;

    // Cancelar la confirmación no cambia nada (formulario, archivos pendientes, mensajes y protección intactos); un error del servidor tampoco libera la protección y permite reintentar.
    try {
      await finalizarCarga({
        confirmar: () => window.confirm("Se cerrará la carga inicial de documentos de este cliente. Los documentos pendientes no se cargarán y, para agregarlos después, se necesitará permiso de edición. ¿Desea continuar?"),
        cerrarCarga: async () => {
          setError("");
          setGuardando(true);

          return cerrarCargaInicial(altaCreada.id);
        },
        alTerminar: terminarAlta,
      });
    } finally {
      setGuardando(false);
    }
  }

  const esContribuyente = formulario.naturaleza === "CONTRIBUYENTE";
  const esB2F = formulario.tipoOperacion === "B2F";
  // Moneda de los límites (D-10: una moneda por cliente para el límite normal y el temporal); nunca se presume PYG.
  const monedaEtiqueta = formulario.monedaCodigoPredeterminada || "sin moneda";
  const esInnominado =
    !esContribuyente && formulario.tipoDocumento === "INNOMINADO";

  const opcionesOperacion = esContribuyente
    ? [
        { value: "B2B", label: "Negocio a negocio (B2B)" },
        { value: "B2C", label: "Negocio a consumidor (B2C)" },
        { value: "B2G", label: "Negocio a gobierno (B2G)" },
      ]
    : [
        { value: "B2C", label: "Negocio a consumidor (B2C)" },
        { value: "B2F", label: "Negocio a extranjero (B2F)" },
      ];

  const opcionesPaisCliente = esB2F
    ? [
        { value: "", label: "Seleccione un país" },
        ...catalogos.paises
          .filter((pais) => String(pais.codigo) !== "PRY")
          .map((pais) => ({
            value: String(pais.codigo ?? ""),
            label: pais.nombre,
          })),
      ]
    : catalogos.paises
        .filter((pais) => String(pais.codigo) === "PRY")
        .map((pais) => ({
          value: String(pais.codigo ?? ""),
          label: pais.nombre,
        }));

  const opcionesDocumentoIdentidad = [
    { value: "CEDULA_PARAGUAYA", label: "Cédula paraguaya" },
    { value: "PASAPORTE", label: "Pasaporte" },
    { value: "CEDULA_EXTRANJERA", label: "Cédula extranjera" },
    { value: "CARNET_RESIDENCIA", label: "Carnet de residencia" },
    ...(esB2F ? [] : [{ value: "INNOMINADO", label: "Innominado" }]),
    {
      value: "TARJETA_DIPLOMATICA",
      label: "Tarjeta diplomática",
    },
    { value: "OTRO", label: "Otro" },
  ];

  if (altaFinalizada) {
    return (
      <main className="clienteNuevo">
        <header className="clienteNuevo__header">
          <div>
            <h1>Cliente registrado</h1>
          </div>
        </header>
        <div className="clienteNuevo__card" role="status">
          <p>El cliente se registró correctamente y su carga inicial de documentos quedó cerrada. Su perfil puede registrar clientes, pero no consultar la lista ni las fichas.</p>
          <div className="clienteNuevo__footer">
            <button className="clienteNuevo__primario" onClick={() => window.location.assign("/clientes/nuevo")} type="button">
              Registrar otro cliente
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="clienteNuevo">
      <header className="clienteNuevo__header">
        <div>
          <nav className="clienteNuevo__miga" aria-label="Ruta de navegación">
            <span>Maestros</span>
            <i aria-hidden="true">/</i>
            {puedeVer ? <Link href="/clientes">Clientes</Link> : <span>Clientes</span>}
            <i aria-hidden="true">/</i>
            <span aria-current="page">Nuevo cliente</span>
          </nav>

          <h1>Nuevo cliente</h1>
        </div>

        {puedeVer ? (
          <Link href="/clientes" className="clienteNuevo__secundario">
            ← Volver a clientes
          </Link>
        ) : null}
      </header>

      <form onSubmit={guardar} className="clienteNuevo__card">
        {error ? (
          <div className="clienteNuevo__error" role="alert">
            {error}
            {altaCreada ? (
              <>
                {puedeVer ? (
                  <>
                    {" "}
                    <Link href={`/clientes/${altaCreada.id}`}>Ir a la ficha del cliente creado</Link>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        <nav className="clienteNuevo__tabs" aria-label="Secciones del cliente">
          {[
            ["fiscal", "Información fiscal"],
            ["comercial", "Comercial y crédito"],
            ["contactos", "Contactos"],
            ["direcciones", "Direcciones"],
            ["logistica", "Entrega y ventas"],
            ["documentos", "Documentos"],
          ].filter(([identificador]) => !altaCreada || identificador === "documentos").map(([identificador, etiqueta]) => (
            <button
              aria-current={tab === identificador ? "true" : undefined}
              className={[
                tab === identificador ? "activo" : "",
                pestanaConError === identificador ? "conError" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={identificador}
              onClick={() => setTab(identificador)}
              type="button"
            >
              {etiqueta}
              {pestanaConError === identificador ? (
                <span className="clienteNuevo__sr">(contiene un error)</span>
              ) : null}
            </button>
          ))}
        </nav>
        {aviso ? (
          <div className="clienteNuevo__aviso" role="status">
            {aviso}
            <button onClick={() => setAviso("")} type="button">
              Entendido
            </button>
          </div>
        ) : null}
        {tab === "fiscal" ||
        (tab === "contactos" && contactos.length > 0) ||
        (tab === "direcciones" && direcciones.length > 0) ||
        (tab === "documentos" && documentos.length > 0) ? (
          <p className="clienteNuevo__nota">
            {tab === "fiscal" ? "Los campos con * son obligatorios." : "* Obligatorio en cada registro agregado."}
          </p>
        ) : null}
        {tab === "direcciones" && esB2F ? (
          <p className="clienteNuevo__nota">Operación B2F: la dirección fiscal es obligatoria (agregue una y márquela como fiscal).</p>
        ) : null}
        {tab === "fiscal" ? (
          <section className="clienteNuevo__contenido">
            <Titulo
              titulo="Identificación fiscal"
              texto="Información del receptor utilizada al emitir documentos electrónicos."
            />

            <div className="clienteNuevo__grid clienteNuevo__grid--cuatro">
              <Select
                label="Naturaleza *"
                id="cli-naturaleza"
                onChange={(valor) => {
                  const hayDatos =
                    formulario.numeroDocumento.trim() !== "" ||
                    formulario.dv.trim() !== "" ||
                    formulario.descripcionDocumentoIdentidad.trim() !== "";

                  if (
                    hayDatos &&
                    !window.confirm(
                      "Al cambiar la naturaleza se borrarán el documento, el número y el DV ya escritos, porque corresponden a otra identificación. ¿Desea continuar?",
                    )
                  ) {
                    return;
                  }

                  setFormulario((actual) => ({
                    ...actual,
                    naturaleza: valor,
                    tipoOperacion: valor === "CONTRIBUYENTE" ? "B2B" : "B2C",
                    paisCodigo: "PRY",
                    tipoDocumento:
                      valor === "CONTRIBUYENTE" ? "RUC" : "CEDULA_PARAGUAYA",
                    descripcionDocumentoIdentidad: "",
                    numeroDocumento: "",
                    dv: "",
                  }));
                }}
                opciones={[
                  { value: "CONTRIBUYENTE", label: "Contribuyente" },
                  { value: "NO_CONTRIBUYENTE", label: "No contribuyente" },
                ]}
                value={formulario.naturaleza}
              />
              <Select
                id="cli-tipo-persona"
                label="Tipo de persona *"
                onChange={(valor) => actualizarFormulario("tipoPersona", valor)}
                opciones={[
                  { value: "", label: "Seleccione" },
                  { value: "FISICA", label: "Persona física" },
                  { value: "JURIDICA", label: "Persona jurídica" },
                ]}
                value={formulario.tipoPersona}
              />
              <Select
                label="Tipo de operación *"
                onChange={(valor) => {
                  if (
                    valor !== "B2F" &&
                    formulario.tipoOperacion === "B2F" &&
                    formulario.paisCodigo &&
                    formulario.paisCodigo !== "PRY" &&
                    !window.confirm(
                      "Al salir de B2F el país vuelve a Paraguay y se pierde el país seleccionado. ¿Desea continuar?",
                    )
                  ) {
                    return;
                  }

                  setFormulario((actual) => ({
                    ...actual,
                    tipoOperacion: valor,
                    paisCodigo: valor === "B2F" ? "" : "PRY",
                    tipoDocumento:
                      valor === "B2F" && actual.tipoDocumento === "INNOMINADO"
                        ? "PASAPORTE"
                        : actual.tipoDocumento,
                    numeroDocumento:
                      valor === "B2F" && actual.tipoDocumento === "INNOMINADO"
                        ? ""
                        : actual.numeroDocumento,
                  }));
                }}
                opciones={opcionesOperacion}
                value={formulario.tipoOperacion}
              />
              <Select
                id="cli-pais"
                label="País *"
                disabled={!esB2F}
                onChange={(valor) => actualizarFormulario("paisCodigo", valor)}
                opciones={opcionesPaisCliente}
                value={formulario.paisCodigo}
              />
            </div>

            <div className="clienteNuevo__grid clienteNuevo__grid--cuatro">
              {esContribuyente ? (
                <>
                  <Input
                    id="cli-numero"
                    inputMode="numeric"
                    label="RUC *"
                    maxLength={8}
                    onChange={(valor) => {
                      const ruc = valor.replace(/\D/g, "").slice(0, 8);

                      setFormulario((actual) => ({
                        ...actual,
                        numeroDocumento: ruc,
                        dv: calcularDvRuc(ruc) ?? "",
                      }));
                    }}
                    value={formulario.numeroDocumento}
                  />
                  <Input
                    id="cli-dv"
                    label="DV (automático) *"
                    onChange={() => undefined}
                    readOnly
                    tabIndex={-1}
                    value={formulario.dv}
                  />
                </>
              ) : (
                <>
                  <Select
                    id="cli-tipo-documento"
                    label="Tipo de documento *"
                    onChange={(valor) => {
                      if (
                        formulario.tipoDocumento === "OTRO" &&
                        valor !== "OTRO" &&
                        formulario.descripcionDocumentoIdentidad.trim() &&
                        !window.confirm(
                          "Al cambiar el tipo de documento se borrará la descripción ya escrita. ¿Desea continuar?",
                        )
                      ) {
                        return;
                      }

                      setFormulario((actual) => ({
                        ...actual,
                        tipoDocumento: valor,
                        descripcionDocumentoIdentidad:
                          valor === "OTRO"
                            ? actual.descripcionDocumentoIdentidad
                            : "",
                        numeroDocumento:
                          valor === "INNOMINADO" ? "0" : actual.numeroDocumento === "0" ? "" : actual.numeroDocumento,
                        razonSocial:
                          valor === "INNOMINADO"
                            ? NOMBRE_INNOMINADO
                            : actual.razonSocial === NOMBRE_INNOMINADO
                              ? ""
                              : actual.razonSocial,
                      }));
                    }}
                    opciones={opcionesDocumentoIdentidad}
                    value={formulario.tipoDocumento}
                  />
                  <Input
                    disabled={esInnominado}
                    id="cli-numero"
                    label="Número de documento * (1 a 20)"
                    onChange={(valor) =>
                      actualizarFormulario("numeroDocumento", valor)
                    }
                    value={esInnominado ? "0" : formulario.numeroDocumento}
                  />
                  {formulario.tipoDocumento === "OTRO" ? (
                    <Input
                      id="cli-descripcion-documento"
                      label="Descripción del documento *"
                      onChange={(valor) =>
                        actualizarFormulario(
                          "descripcionDocumentoIdentidad",
                          valor,
                        )
                      }
                      value={formulario.descripcionDocumentoIdentidad}
                    />
                  ) : null}
                </>
              )}
            </div>

            <div className="clienteNuevo__grid clienteNuevo__grid--dos">
              <Input
                id="cli-razon-social"
                label="Nombre o razón social *"
                onChange={(valor) => actualizarFormulario("razonSocial", valor)}
                value={formulario.razonSocial}
              />
              <Input
                id="cli-nombre-fantasia"
                label="Nombre de fantasía"
                onChange={(valor) =>
                  actualizarFormulario("nombreFantasia", valor)
                }
                value={formulario.nombreFantasia}
              />
            </div>

            <Titulo
              titulo="Datos de contacto del cliente"
              texto="Correo y teléfonos generales del cliente. Las personas de contacto se registran en la pestaña Contactos."
            />

            <div className="clienteNuevo__grid clienteNuevo__grid--dos">
              <Input
                id="cli-email"
                label="Correo electrónico"
                onChange={(valor) => actualizarFormulario("email", valor)}
                type="email"
                value={formulario.email}
              />
              <Input
                id="cli-email-copia"
                label="Correo en copia"
                onChange={(valor) => actualizarFormulario("emailCopia", valor)}
                type="email"
                value={formulario.emailCopia}
              />
            </div>

            <div className="clienteNuevo__grid clienteNuevo__grid--dos">
              <TelefonoPais
                campo="telefono"
                clases={{ campo: "clienteNuevo__campo" }}
                etiqueta="Teléfono"
                id="cli-telefono"
                onChange={(nuevo) =>
                  setFormulario((actual) => ({
                    ...actual,
                    telefonoPais: nuevo.pais,
                    telefonoDdi: nuevo.ddi,
                    telefonoArea: nuevo.area,
                    telefono: nuevo.numero,
                  }))
                }
                valor={{ pais: formulario.telefonoPais, ddi: formulario.telefonoDdi, area: formulario.telefonoArea, numero: formulario.telefono }}
              />
              <TelefonoPais
                campo="celular"
                clases={{ campo: "clienteNuevo__campo" }}
                etiqueta="Celular"
                id="cli-celular"
                onChange={(nuevo) =>
                  setFormulario((actual) => ({
                    ...actual,
                    celularPais: nuevo.pais,
                    celularDdi: nuevo.ddi,
                    celularArea: nuevo.area,
                    celular: nuevo.numero,
                  }))
                }
                valor={{ pais: formulario.celularPais, ddi: formulario.celularDdi, area: formulario.celularArea, numero: formulario.celular }}
              />
            </div>
          </section>
        ) : null}

        {tab === "comercial" ? (
          <section className="clienteNuevo__contenido">
            <Titulo
              titulo="Configuración comercial y crédito"
              texto="Valores predeterminados para pedidos, ventas y cobranzas."
            />

            <div className="clienteNuevo__grid clienteNuevo__grid--cuatro">
              <Select
                label="Grupo de cliente"
                onChange={(valor) =>
                  actualizarFormulario("grupoClienteId", valor)
                }
                opciones={opcionesCatalogo(catalogos.grupos)}
                value={formulario.grupoClienteId}
              />
              <Select
                label="Condición de pago"
                onChange={(valor) =>
                  actualizarFormulario("condicionPagoId", valor)
                }
                opciones={opcionesCatalogo(catalogos.condicionesPago)}
                value={formulario.condicionPagoId}
              />
              <Select
                label="Moneda predeterminada"
                onChange={(valor) =>
                  actualizarFormulario("monedaCodigoPredeterminada", valor)
                }
                opciones={opcionesCatalogo(catalogos.monedas, "Sin moneda")}
                value={formulario.monedaCodigoPredeterminada}
              />
              <Select
                label="Lista de precios"
                onChange={(valor) =>
                  actualizarFormulario("listaPrecioId", valor)
                }
                opciones={opcionesCatalogo(catalogos.listasPrecio)}
                value={formulario.listaPrecioId}
              />
            </div>

            <div className="clienteNuevo__grid clienteNuevo__grid--cuatro">
              <Input
                id="cli-limite-credito"
                label={`Límite de crédito (${monedaEtiqueta})`}
                step="any"
                min="0"
                onChange={(valor) =>
                  actualizarFormulario("limiteCredito", valor)
                }
                type="number"
                value={formulario.limiteCredito}
              />
              <Input
                id="cli-descuento"
                label="Descuento comercial (%)"
                step="any"
                max="100"
                min="0"
                onChange={(valor) =>
                  actualizarFormulario("descuentoComercialPct", valor)
                }
                type="number"
                value={formulario.descuentoComercialPct}
              />
              <Input
                id="cli-limite-temporal"
                label={`Límite temporal (${monedaEtiqueta})`}
                step="any"
                min="0"
                onChange={(valor) =>
                  actualizarFormulario("limiteCreditoTemporal", valor)
                }
                type="number"
                value={formulario.limiteCreditoTemporal}
              />
              <Input
                id="cli-vencimiento"
                label="Vencimiento del límite temporal (dd/mm/yyyy)"
                onChange={(valor) =>
                  actualizarFormulario("fechaVencimientoCredito", valor)
                }
                placeholder="dd/mm/yyyy"
                value={formulario.fechaVencimientoCredito}
              />
            </div>

            <div className="clienteNuevo__grid clienteNuevo__grid--tres">
              <Input
                id="cli-dia-cobro"
                label="Día preferido de cobro"
                max="31"
                min="1"
                step="1"
                onChange={(valor) =>
                  actualizarFormulario("diaPreferidoCobro", valor)
                }
                type="number"
                value={formulario.diaPreferidoCobro}
              />
              <Input
                id="cli-email-facturacion"
                label="Correo de facturación"
                onChange={(valor) =>
                  actualizarFormulario("emailFacturacion", valor)
                }
                type="email"
                value={formulario.emailFacturacion}
              />
              <Input
                id="cli-email-cobranzas"
                label="Correo de cobranzas"
                onChange={(valor) =>
                  actualizarFormulario("emailCobranzas", valor)
                }
                type="email"
                value={formulario.emailCobranzas}
              />
            </div>

            <Checks
              valores={[
                {
                  etiqueta: "Recibir documento electrónico",
                  marcado: formulario.recibeDocumentoElectronico,
                  cambiar: (valor) =>
                    actualizarFormulario("recibeDocumentoElectronico", valor),
                },
                {
                  etiqueta: "Requiere orden de compra",
                  marcado: formulario.requiereOrdenCompra,
                  cambiar: (valor) =>
                    actualizarFormulario("requiereOrdenCompra", valor),
                },
                {
                  etiqueta: "Bloquear ventas",
                  marcado: formulario.bloqueadoVentas,
                  cambiar: (valor) =>
                    actualizarFormulario("bloqueadoVentas", valor),
                },
              ]}
            />

            {formulario.bloqueadoVentas ? (
              <Input
                id="cli-motivo-bloqueo"
                label="Motivo del bloqueo *"
                onChange={(valor) =>
                  actualizarFormulario("motivoBloqueoVentas", valor)
                }
                value={formulario.motivoBloqueoVentas}
              />
            ) : null}

            <Area
              label="Observaciones comerciales"
              onChange={(valor) =>
                actualizarFormulario("observacionComercial", valor)
              }
              value={formulario.observacionComercial}
            />

            <Titulo
              titulo="Integraciones B2B"
              texto="Opcional. Complete estos campos solo cuando el cliente opere con integraciones externas."
            />

            <div className="clienteNuevo__grid clienteNuevo__grid--cuatro">
              <Select
                label="Canal de venta"
                onChange={(valor) =>
                  actualizarFormulario("canalVentaId", valor)
                }
                opciones={opcionesCatalogo(catalogos.canalesVenta)}
                value={formulario.canalVentaId}
              />
              <Input
                label="Código externo"
                onChange={(valor) =>
                  actualizarFormulario("codigoExterno", valor)
                }
                value={formulario.codigoExterno}
              />
              <Input
                id="cli-gln"
                label="GLN (13 dígitos)"
                onChange={(valor) => actualizarFormulario("gln", valor)}
                value={formulario.gln}
              />
            </div>
          </section>
        ) : null}

        {tab === "contactos" ? (
          <Repeater
            agregar="Agregar contacto"
            onAgregar={() =>
              setContactos((actuales) => [...actuales, crearContacto()])
            }
            texto="Responsables de pedidos, facturación, cobranzas y comunicaciones."
            titulo="Contactos"
          >
            {contactos.map((contacto, indice) => (
              <article className="clienteNuevo__repetido" key={indice}>
                <CabeceraRepetido
                  etiqueta={`Contacto ${indice + 1}`}
                  onEliminar={() =>
                    setContactos((actuales) =>
                      actuales.filter((_, posicion) => posicion !== indice),
                    )
                  }
                />

                <div className="clienteNuevo__grid clienteNuevo__grid--cuatro">
                  <Input
                    id={`cli-contacto-${indice}-nombre`}
                    label="Nombre *"
                    onChange={(valor) =>
                      actualizarContacto(indice, "nombre", valor)
                    }
                    value={contacto.nombre}
                  />
                  <Input
                    label="Apellido"
                    onChange={(valor) =>
                      actualizarContacto(indice, "apellido", valor)
                    }
                    value={contacto.apellido}
                  />
                  <Input
                    label="Cargo"
                    onChange={(valor) =>
                      actualizarContacto(indice, "cargo", valor)
                    }
                    value={contacto.cargo}
                  />
                  <Input
                    label="Departamento"
                    onChange={(valor) =>
                      actualizarContacto(indice, "departamento", valor)
                    }
                    value={contacto.departamento}
                  />
                </div>

                <div className="clienteNuevo__grid clienteNuevo__grid--dos">
                  <TelefonoPais
                    campo="telefono"
                    clases={{ campo: "clienteNuevo__campo" }}
                    etiqueta="Teléfono"
                    etiquetaError={`el teléfono del contacto ${indice + 1}`}
                    id={`cli-contacto-${indice}-telefono`}
                    onChange={(nuevo) =>
                      setContactos((actuales) =>
                        actuales.map((c, i) =>
                          i === indice
                            ? { ...c, telefonoPais: nuevo.pais, telefonoDdi: nuevo.ddi, telefonoArea: nuevo.area, telefono: nuevo.numero }
                            : c,
                        ),
                      )
                    }
                    valor={{ pais: contacto.telefonoPais, ddi: contacto.telefonoDdi, area: contacto.telefonoArea, numero: contacto.telefono }}
                  />
                  <TelefonoPais
                    campo="celular"
                    clases={{ campo: "clienteNuevo__campo" }}
                    etiqueta="Celular"
                    etiquetaError={`el celular del contacto ${indice + 1}`}
                    id={`cli-contacto-${indice}-celular`}
                    onChange={(nuevo) =>
                      setContactos((actuales) =>
                        actuales.map((c, i) =>
                          i === indice
                            ? { ...c, celularPais: nuevo.pais, celularDdi: nuevo.ddi, celularArea: nuevo.area, celular: nuevo.numero }
                            : c,
                        ),
                      )
                    }
                    valor={{ pais: contacto.celularPais, ddi: contacto.celularDdi, area: contacto.celularArea, numero: contacto.celular }}
                  />
                </div>

                <div className="clienteNuevo__grid clienteNuevo__grid--tres">
                  <Input
                    id={`cli-contacto-${indice}-email`}
                    label="Correo electrónico"
                    onChange={(valor) =>
                      actualizarContacto(indice, "email", valor)
                    }
                    type="email"
                    value={contacto.email}
                  />
                </div>

                <Checks
                  valores={[
                    {
                      etiqueta: "Principal",
                      marcado: contacto.esPrincipal,
                      cambiar: (valor) =>
                        establecerContactoPrincipal(indice, valor),
                    },
                    {
                      etiqueta: "Recibe pedidos",
                      marcado: contacto.recibePedidos,
                      cambiar: (valor) =>
                        actualizarContacto(indice, "recibePedidos", valor),
                    },
                    {
                      etiqueta: "Recibe facturación",
                      marcado: contacto.recibeFacturacion,
                      cambiar: (valor) =>
                        actualizarContacto(indice, "recibeFacturacion", valor),
                    },
                    {
                      etiqueta: "Recibe cobranzas",
                      marcado: contacto.recibeCobranzas,
                      cambiar: (valor) =>
                        actualizarContacto(indice, "recibeCobranzas", valor),
                    },
                    {
                      etiqueta: "Recibe notificaciones",
                      marcado: contacto.recibeNotificaciones,
                      cambiar: (valor) =>
                        actualizarContacto(indice, "recibeNotificaciones", valor),
                    },
                    {
                      etiqueta: "Recibe documentos electrónicos",
                      marcado: contacto.recibeDocumentosElectronicos,
                      cambiar: (valor) =>
                        actualizarContacto(
                          indice,
                          "recibeDocumentosElectronicos",
                          valor,
                        ),
                    },
                  ]}
                />
              </article>
            ))}
          </Repeater>
        ) : null}

        {tab === "direcciones" ? (
          <Repeater
            agregar="Agregar dirección"
            onAgregar={() =>
              setDirecciones((actuales) => [...actuales, crearDireccion()])
            }
            texto="Registre ubicaciones fiscal, comercial, de entrega, sucursal u otra."
            titulo="Direcciones"
          >
            {direcciones.map((direccion, indice) => {
              const esParaguay = direccion.paisCodigo === "PRY";

              return (
                <article className="clienteNuevo__repetido" key={direccion.uid}>
                  <CabeceraRepetido
                    etiqueta={`Dirección ${indice + 1}`}
                    onEliminar={() => {
                      geo.quitar(direccion.uid);
                      setDirecciones((actuales) =>
                        actuales.filter((x) => x.uid !== direccion.uid),
                      );
                    }}
                  />

                  <div className="clienteNuevo__grid clienteNuevo__grid--cuatro">
                    <Select
                      label="Tipo *"
                      onChange={(valor) => cambiarTipoDireccion(indice, valor)}
                      opciones={[
                        { value: "FISCAL", label: "Fiscal" },
                        { value: "COMERCIAL", label: "Comercial" },
                        { value: "ENTREGA", label: "Entrega" },
                        { value: "SUCURSAL", label: "Sucursal" },
                        { value: "OTRA", label: "Otra" },
                      ]}
                      value={direccion.tipo}
                    />
                    <Input
                      label="Etiqueta"
                      onChange={(valor) =>
                        actualizarDireccion(indice, "etiqueta", valor)
                      }
                      value={direccion.etiqueta}
                    />
                    <Input
                      id={`cli-direccion-${indice}-direccion`}
                      label="Dirección *"
                      onChange={(valor) =>
                        actualizarDireccion(indice, "direccion", valor)
                      }
                      value={direccion.direccion}
                    />
                    <Input
                      id={`cli-direccion-${indice}-numero`}
                      inputMode="numeric"
                      label={direccion.esFiscal || direccion.tipo === "FISCAL" ? "Nro. de casa *" : "Nro. de casa"}
                      onChange={(valor) =>
                        actualizarDireccion(indice, "numeroCasa", valor)
                      }
                      value={direccion.numeroCasa}
                    />
                  </div>

                  <div className="clienteNuevo__grid clienteNuevo__grid--cuatro">
                    <Select
                      id={`cli-direccion-${indice}-pais`}
                      label="País *"
                      onChange={(valor) => {
                        actualizarDireccion(indice, "paisCodigo", valor);
                        actualizarDireccion(indice, "departamentoCodigo", "");
                        actualizarDireccion(indice, "departamento", "");
                        actualizarDireccion(indice, "distritoCodigo", "");
                        actualizarDireccion(indice, "distrito", "");
                        actualizarDireccion(indice, "ciudadCodigo", "");
                        actualizarDireccion(indice, "ciudad", "");
                        geo.cambiarPais(direccion.uid);
                      }}
                      opciones={catalogos.paises.map((pais) => ({
                        value: String(pais.codigo ?? ""),
                        label: pais.nombre,
                      }))}
                      value={direccion.paisCodigo}
                    />
                    <Input
                      label="Complemento"
                      onChange={(valor) =>
                        actualizarDireccion(indice, "complemento", valor)
                      }
                      value={direccion.complemento}
                    />
                    <Input
                      label="Código postal"
                      onChange={(valor) =>
                        actualizarDireccion(indice, "codigoPostal", valor)
                      }
                      value={direccion.codigoPostal}
                    />
                  </div>

                  {esParaguay ? (
                    <div className="clienteNuevo__grid clienteNuevo__grid--tres">
                      <Select
                        label="Departamento"
                        onChange={(valor) =>
                          void seleccionarDepartamento(indice, valor)
                        }
                        opciones={opcionesCatalogo(
                          catalogos.departamentosParaguay,
                          "Seleccione un departamento",
                        )}
                        value={direccion.departamentoCodigo}
                      />
                      <Select
                        disabled={!direccion.departamentoCodigo}
                        label="Distrito"
                        onChange={(valor) =>
                          void seleccionarDistrito(indice, valor)
                        }
                        opciones={opcionesCatalogo(
                          distritosPorDireccion[direccion.uid] ?? [],
                          "Seleccione un distrito",
                        )}
                        value={direccion.distritoCodigo}
                      />
                      <Select
                        disabled={!direccion.distritoCodigo}
                        label="Ciudad"
                        onChange={(valor) => seleccionarCiudad(indice, valor)}
                        opciones={opcionesCatalogo(
                          ciudadesPorDireccion[direccion.uid] ?? [],
                          "Seleccione una ciudad",
                        )}
                        value={direccion.ciudadCodigo}
                      />
                    </div>
                  ) : null}

                  <div className="clienteNuevo__grid clienteNuevo__grid--tres">
                    <Input
                      label="Contacto de recepción"
                      onChange={(valor) =>
                        actualizarDireccion(indice, "contactoNombre", valor)
                      }
                      value={direccion.contactoNombre}
                    />
                    <Input
                      label="Teléfono de recepción"
                      onChange={(valor) =>
                        actualizarDireccion(indice, "contactoTelefono", valor)
                      }
                      value={direccion.contactoTelefono}
                    />
                    <Input
                      label="Horario de recepción"
                      onChange={(valor) =>
                        actualizarDireccion(indice, "horarioRecepcion", valor)
                      }
                      value={direccion.horarioRecepcion}
                    />
                  </div>

                  <Checks
                    valores={[
                      {
                        etiqueta: "Dirección fiscal",
                        marcado: direccion.esFiscal,
                        cambiar: (valor) =>
                          establecerDireccionFiscal(indice, valor),
                      },
                      {
                        etiqueta: "Dirección de entrega predeterminada",
                        marcado: direccion.esEntregaDefault,
                        cambiar: (valor) =>
                          establecerEntregaDefault(indice, valor),
                      },
                    ]}
                  />

                  <Area
                    label="Observación de la dirección"
                    onChange={(valor) =>
                      actualizarDireccion(indice, "observacion", valor)
                    }
                    value={direccion.observacion}
                  />
                </article>
              );
            })}
          </Repeater>
        ) : null}

        {tab === "logistica" ? (
          <section className="clienteNuevo__contenido">
            <Titulo
              titulo="Entrega y ventas"
              texto="Información para preparar pedidos y organizar las entregas."
            />

            <div className="clienteNuevo__grid clienteNuevo__grid--cuatro">
              <Select
                label="Ruta de entrega"
                onChange={(valor) =>
                  actualizarFormulario("rutaEntregaId", valor)
                }
                opciones={opcionesCatalogo(catalogos.rutasEntrega)}
                value={formulario.rutaEntregaId}
              />
              <Select
                label="Zona comercial"
                onChange={(valor) =>
                  actualizarFormulario("zonaComercialId", valor)
                }
                opciones={opcionesCatalogo(catalogos.zonasComerciales)}
                value={formulario.zonaComercialId}
              />
              <Select
                label="Vendedor responsable"
                onChange={(valor) => actualizarFormulario("vendedorId", valor)}
                opciones={opcionesCatalogo(catalogos.vendedores)}
                value={formulario.vendedorId}
              />
              <Select
                id="cli-frecuencia"
                label="Frecuencia de entrega"
                onChange={(valor) => {
                  actualizarFormulario("frecuenciaEntrega", valor);
                  // El día del mes solo aplica a la frecuencia mensual: se limpia al cambiar de frecuencia.
                  if (valor !== "MENSUAL") actualizarFormulario("diaMesEntrega", "");
                }}
                opciones={[
                  { value: "", label: "A definir" },
                  { value: "DIARIA", label: "Diaria" },
                  { value: "SEMANAL", label: "Semanal" },
                  { value: "QUINCENAL", label: "Quincenal" },
                  { value: "MENSUAL", label: "Mensual" },
                  { value: "A_DEMANDA", label: "A demanda" },
                ]}
                value={formulario.frecuenciaEntrega}
              />
              {formulario.frecuenciaEntrega === "MENSUAL" ? (
                <Input
                  id="cli-dia-mes-entrega"
                  inputMode="numeric"
                  label="Día del mes de entrega * (1 a 31)"
                  maxLength={2}
                  onChange={(valor) => actualizarFormulario("diaMesEntrega", valor)}
                  value={formulario.diaMesEntrega}
                />
              ) : null}
            </div>

            <p className="clienteNuevo__textoAuxiliar">
              {["SEMANAL", "QUINCENAL"].includes(formulario.frecuenciaEntrega) ? "Días de entrega * (obligatorios con esta frecuencia)" : "Días habituales de entrega"}
            </p>
            <Checks
              valores={[
                {
                  etiqueta: "Lunes",
                  marcado: formulario.diasEntrega.includes(1),
                  cambiar: (marcado: boolean) => {
                    actualizarFormulario(
                      "diasEntrega",
                      marcado
                        ? [...new Set([...formulario.diasEntrega, 1])]
                        : formulario.diasEntrega.filter(
                            (valor) => valor !== 1,
                          ),
                    );
                  },
                },
                {
                  etiqueta: "Martes",
                  marcado: formulario.diasEntrega.includes(2),
                  cambiar: (marcado: boolean) => {
                    actualizarFormulario(
                      "diasEntrega",
                      marcado
                        ? [...new Set([...formulario.diasEntrega, 2])]
                        : formulario.diasEntrega.filter(
                            (valor) => valor !== 2,
                          ),
                    );
                  },
                },
                {
                  etiqueta: "Miércoles",
                  marcado: formulario.diasEntrega.includes(3),
                  cambiar: (marcado: boolean) => {
                    actualizarFormulario(
                      "diasEntrega",
                      marcado
                        ? [...new Set([...formulario.diasEntrega, 3])]
                        : formulario.diasEntrega.filter(
                            (valor) => valor !== 3,
                          ),
                    );
                  },
                },
                {
                  etiqueta: "Jueves",
                  marcado: formulario.diasEntrega.includes(4),
                  cambiar: (marcado: boolean) => {
                    actualizarFormulario(
                      "diasEntrega",
                      marcado
                        ? [...new Set([...formulario.diasEntrega, 4])]
                        : formulario.diasEntrega.filter(
                            (valor) => valor !== 4,
                          ),
                    );
                  },
                },
                {
                  etiqueta: "Viernes",
                  marcado: formulario.diasEntrega.includes(5),
                  cambiar: (marcado: boolean) => {
                    actualizarFormulario(
                      "diasEntrega",
                      marcado
                        ? [...new Set([...formulario.diasEntrega, 5])]
                        : formulario.diasEntrega.filter(
                            (valor) => valor !== 5,
                          ),
                    );
                  },
                },
                {
                  etiqueta: "Sábado",
                  marcado: formulario.diasEntrega.includes(6),
                  cambiar: (marcado: boolean) => {
                    actualizarFormulario(
                      "diasEntrega",
                      marcado
                        ? [...new Set([...formulario.diasEntrega, 6])]
                        : formulario.diasEntrega.filter(
                            (valor) => valor !== 6,
                          ),
                    );
                  },
                },
                {
                  etiqueta: "Domingo",
                  marcado: formulario.diasEntrega.includes(7),
                  cambiar: (marcado: boolean) => {
                    actualizarFormulario(
                      "diasEntrega",
                      marcado
                        ? [...new Set([...formulario.diasEntrega, 7])]
                        : formulario.diasEntrega.filter(
                            (valor) => valor !== 7,
                          ),
                    );
                  },
                },
              ]}
            />

            <Area
              label="Observaciones logísticas"
              onChange={(valor) =>
                actualizarFormulario("observacionLogistica", valor)
              }
              value={formulario.observacionLogistica}
            />
          </section>
        ) : null}

        {tab === "documentos" ? (
          <Repeater
            agregar="Agregar documento"
            onAgregar={() =>
              setDocumentos((actuales) => [...actuales, crearDocumento()])
            }
            texto={`Formatos ${EXTENSIONES_TEXTO} · máximo ${TAMANO_MAXIMO_BYTES / 1024 / 1024} MB por archivo.`}
            titulo="Documentos comerciales"
          >
            {documentos.map((documento, indice) => {
              const yaCargado = docsSubidos.includes(documento.uid);

              return (
              <article className="clienteNuevo__repetido" key={documento.uid}>
                <CabeceraRepetido
                  etiqueta={`Documento ${indice + 1}${yaCargado ? " · cargado ✓" : ""}`}
                  onEliminar={() => {
                    if (yaCargado) {
                      window.alert("Este documento ya se cargó al cliente creado; para quitarlo se necesita permiso de edición desde la ficha del cliente.");
                      return;
                    }
                    setDocumentos((actuales) => actuales.filter((d) => d.uid !== documento.uid));
                  }}
                />
                {erroresDocs[documento.uid] ? (
                  <p className="clienteNuevo__error" role="alert">
                    No se cargó: {erroresDocs[documento.uid]}. Corrija el archivo o los datos y reintente.
                  </p>
                ) : null}
                <fieldset disabled={yaCargado} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>

                <div className="clienteNuevo__grid clienteNuevo__grid--cuatro">
                  <Select
                    label="Tipo"
                    onChange={(valor) =>
                      actualizarDocumento(indice, "tipo", valor)
                    }
                    opciones={[
                      { value: "RUC", label: "Constancia de RUC" },
                      { value: "CONTRATO", label: "Contrato" },
                      { value: "CREDITO", label: "Documento de crédito" },
                      { value: "EXONERACION", label: "Exoneración" },
                      { value: "OTRO", label: "Otro" },
                    ]}
                    value={documento.tipo}
                  />
                  <label className="clienteNuevo__campo">
                    <EtiquetaCampo label="Archivo *" />
                    <input
                      accept={ACCEPT_ARCHIVOS}
                      aria-required="true"
                      id={`cli-documento-${indice}-archivo`}
                      onChange={(evento) =>
                        actualizarDocumento(indice, "archivo", evento.target.files?.[0] ?? null)
                      }
                      type="file"
                    />
                    <small>
                      {documento.archivo
                        ? `${documento.archivo.name} · ${tamanoLegible(documento.archivo.size)}`
                        : `${EXTENSIONES_TEXTO} · máx. ${TAMANO_MAXIMO_BYTES / 1024 / 1024} MB`}
                    </small>
                  </label>
                  <Input
                    id={`cli-documento-${indice}-emision`}
                    label="Fecha de emisión (dd/mm/yyyy)"
                    onChange={(valor) =>
                      actualizarDocumento(indice, "fechaEmision", valor)
                    }
                    placeholder="dd/mm/yyyy"
                    value={documento.fechaEmision}
                  />
                  <Input
                    id={`cli-documento-${indice}-vencimiento`}
                    label="Fecha de vencimiento (dd/mm/yyyy)"
                    onChange={(valor) =>
                      actualizarDocumento(indice, "fechaVencimiento", valor)
                    }
                    placeholder="dd/mm/yyyy"
                    value={documento.fechaVencimiento}
                  />
                </div>

                <Area
                  label="Observación"
                  onChange={(valor) =>
                    actualizarDocumento(indice, "observacion", valor)
                  }
                  value={documento.observacion}
                />
                </fieldset>
              </article>
              );
            })}
          </Repeater>
        ) : null}

        <footer className="clienteNuevo__footer">
          {altaCreada || !puedeVer ? null : (
            <Link href="/clientes" className="clienteNuevo__secundario">
              Cancelar
            </Link>
          )}
          {altaCreada ? (
            <button className="clienteNuevo__secundario" disabled={guardando} onClick={() => void finalizarSinPendientes()} type="button">
              Finalizar sin los documentos pendientes
            </button>
          ) : null}
          <button
            className="clienteNuevo__primario"
            disabled={guardando}
            type="submit"
          >
            {guardando
              ? "Guardando..."
              : altaCreada
                ? documentos.some((d) => d.archivo && !docsSubidos.includes(d.uid))
                  ? "Reintentar documentos pendientes"
                  : "Reintentar cierre de la carga inicial"
                : "Guardar cliente"}
          </button>
        </footer>
      </form>

      <style jsx global>{`
        /* Padrón de formularios V1 (referencia: Nuevo cliente). Etiquetas fijas sobre el campo, 40px de alto,
           título 24px, pestañas 13.5px, botones 38px. */
        .clienteNuevo {
          max-width: 1240px;
          margin: 0 auto;
          padding: 16px 20px 24px;
          color: #173b59;
        }
        .clienteNuevo__header,
        .clienteNuevo__titulo,
        .clienteNuevo__repetidoHeader,
        .clienteNuevo__footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .clienteNuevo__header {
          align-items: flex-end;
          margin-bottom: 12px;
        }
        .clienteNuevo__miga {
          display: flex;
          align-items: center;
          gap: 6px;
          margin: 0 0 4px;
          color: #7c8ea0;
          font-size: 12px;
          font-weight: 450;
        }
        .clienteNuevo__miga a {
          color: inherit;
          text-decoration: none;
        }
        .clienteNuevo__miga a:hover {
          color: #0a7f88;
          text-decoration: underline;
        }
        .clienteNuevo__miga i {
          color: #a6b4c1;
          font-style: normal;
        }
        .clienteNuevo__miga span[aria-current] {
          color: #4f6a82;
          font-weight: 600;
        }
        .clienteNuevo__header h1 {
          margin: 0;
          color: #112f4a;
          font-size: 24px;
          font-weight: 700;
          line-height: 1.2;
          letter-spacing: -0.4px;
        }
        .clienteNuevo__secundario,
        .clienteNuevo__primario,
        .clienteNuevo__agregar {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          height: 38px;
          border-radius: 9px;
          padding: 0 16px;
          font: inherit;
          font-size: 13px;
          font-weight: 600;
          text-decoration: none;
          white-space: nowrap;
          cursor: pointer;
        }
        .clienteNuevo__secundario {
          border: 1px solid #d3dfe8;
          background: #fff;
          color: #41647d;
        }
        .clienteNuevo__secundario:hover {
          border-color: #aadadd;
          background: #f3fbfb;
          color: #0a7f88;
        }
        .clienteNuevo__primario {
          border: 0;
          background: linear-gradient(135deg, #13a9af, #0c919b);
          color: #fff;
          box-shadow: 0 6px 14px rgba(11, 145, 155, 0.16);
        }
        .clienteNuevo__primario:disabled {
          cursor: progress;
          opacity: 0.65;
        }
        .clienteNuevo__secundario:focus-visible,
        .clienteNuevo__primario:focus-visible,
        .clienteNuevo__agregar:focus-visible,
        .clienteNuevo__eliminar:focus-visible,
        .clienteNuevo__tabs button:focus-visible {
          outline: 3px solid rgba(15, 156, 165, 0.4);
          outline-offset: 2px;
        }
        .clienteNuevo__card {
          border: 1px solid #dce6ed;
          border-radius: 12px;
          background: #fff;
          box-shadow: 0 5px 14px rgba(20, 50, 77, 0.035);
        }
        .clienteNuevo__error {
          margin: 14px 20px 0;
          border: 1px solid #f0c5cb;
          border-radius: 9px;
          background: #fff4f5;
          padding: 10px 12px;
          color: #b3263b;
          font-size: 13.5px;
          line-height: 1.45;
        }
        .clienteNuevo__tabs {
          display: flex;
          gap: 2px;
          overflow-x: auto;
          border-bottom: 1px solid #e3ebf1;
          padding: 0 14px;
          scrollbar-width: thin;
        }
        .clienteNuevo__tabs button {
          flex: 0 0 auto;
          height: 44px;
          border: 0;
          border-bottom: 3px solid transparent;
          background: transparent;
          padding: 0 14px;
          color: #5c7388;
          font: inherit;
          font-size: 13.5px;
          font-weight: 600;
          white-space: nowrap;
          cursor: pointer;
        }
        .clienteNuevo__tabs button:hover {
          background: #f6f9fb;
          color: #234560;
        }
        .clienteNuevo__tabs button.activo {
          border-bottom-color: #0f9ca5;
          background: #f3fbfb;
          color: #0a7880;
        }
        .clienteNuevo__tabs button.conError::after {
          content: "";
          display: inline-block;
          width: 8px;
          height: 8px;
          margin-left: 7px;
          border-radius: 50%;
          background: #c0394d;
        }
        .clienteNuevo__sr {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
          white-space: nowrap;
        }
        .clienteNuevo__aviso {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin: 12px 20px 0;
          border: 1px solid #bfe3e6;
          border-radius: 9px;
          background: #f1fbfc;
          padding: 8px 12px;
          color: #1f5d66;
          font-size: 13px;
        }
        .clienteNuevo__aviso button {
          border: 0;
          background: transparent;
          color: #0a7f88;
          font: inherit;
          font-weight: 600;
          cursor: pointer;
        }
        .clienteNuevo__nota {
          margin: 12px 20px 0;
          color: #6f8498;
          font-size: 12px;
        }
        .clienteNuevo__contenido,
        .clienteNuevo__repetidor {
          padding: 16px 20px 8px;
        }
        .clienteNuevo__titulo {
          margin: 0 0 12px;
        }
        .clienteNuevo__titulo h3 {
          margin: 0;
          color: #173b59;
          font-size: 16px;
          font-weight: 650;
        }
        .clienteNuevo__grid {
          display: grid;
          gap: 12px 14px;
          margin-bottom: 12px;
        }
        .clienteNuevo__grid--cuatro {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
        .clienteNuevo__grid--tres {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .clienteNuevo__grid--dos {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .clienteNuevo__campo {
          display: grid;
          gap: 4px;
          min-width: 0;
          align-content: start;
        }
        .clienteNuevo__campo > span {
          color: #526e83;
          font-size: 12.5px;
          font-weight: 600;
          line-height: 1.3;
        }
        .clienteNuevo__campo > span b {
          color: #c0394d;
          font-weight: 600;
        }
        .clienteNuevo__campo input,
        .clienteNuevo__campo select,
        .clienteNuevo__campo textarea {
          box-sizing: border-box;
          width: 100%;
          height: 40px;
          border: 1px solid #cfdde9;
          border-radius: 8px;
          outline: 0;
          background: #fff;
          padding: 0 11px;
          color: #173b59;
          font: inherit;
          font-size: 14px;
          font-weight: 450;
        }
        .clienteNuevo__campo input,
        .clienteNuevo__campo select,
        .clienteNuevo__campo textarea,
        .clienteNuevo__checks input,
        .clienteNuevo__agregar,
        .clienteNuevo__eliminar {
          scroll-margin-bottom: 88px;
        }
        .clienteNuevo__campo textarea {
          min-height: 76px;
          height: 76px;
          padding: 9px 11px;
          line-height: 1.4;
          resize: vertical;
        }
        .clienteNuevo__campo input::placeholder,
        .clienteNuevo__campo textarea::placeholder {
          color: #8b9dae;
        }
        .clienteNuevo__campo input:hover,
        .clienteNuevo__campo select:hover,
        .clienteNuevo__campo textarea:hover {
          border-color: #9fbdd0;
        }
        .clienteNuevo__campo input:focus,
        .clienteNuevo__campo select:focus,
        .clienteNuevo__campo textarea:focus {
          border-color: #0f9ca5;
          box-shadow: 0 0 0 3px rgba(15, 156, 165, 0.16);
        }
        .clienteNuevo__campo input:disabled,
        .clienteNuevo__campo select:disabled,
        .clienteNuevo__campo textarea:disabled {
          cursor: not-allowed;
          background: #f3f6f9;
          color: #7f93a6;
        }
        .clienteNuevo__checks {
          display: flex;
          flex-wrap: wrap;
          gap: 10px 20px;
          margin: 4px 0 12px;
        }
        .clienteNuevo__checks label {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #315575;
          font-size: 13.5px;
          font-weight: 500;
          cursor: pointer;
        }
        .clienteNuevo__checks input {
          width: 16px;
          height: 16px;
          accent-color: #0f9ca5;
        }
        .clienteNuevo__repetido {
          margin-bottom: 12px;
          border: 1px solid #dbe7f0;
          border-radius: 10px;
          background: #fbfdfe;
          padding: 14px 16px 4px;
        }
        .clienteNuevo__repetidoHeader {
          margin-bottom: 12px;
          color: #315575;
          font-size: 13.5px;
        }
        .clienteNuevo__repetidoHeader strong {
          font-weight: 650;
        }
        .clienteNuevo__agregar {
          border: 1px solid #a5e0de;
          background: #effcfb;
          color: #087d8b;
        }
        .clienteNuevo__agregar:hover {
          background: #e0f8f6;
        }
        .clienteNuevo__eliminar {
          border: 0;
          border-radius: 6px;
          background: transparent;
          padding: 4px 6px;
          color: #bf4050;
          font: inherit;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .clienteNuevo__eliminar:hover {
          background: #fff0f2;
        }
        .clienteNuevo__sinRegistros {
          margin-bottom: 12px;
          border: 1px dashed #cfdde9;
          border-radius: 9px;
          padding: 14px;
          color: #6f8498;
          text-align: center;
          font-size: 13.5px;
        }
        .clienteNuevo__textoAuxiliar {
          margin: 0 0 10px;
          color: #315575;
          font-size: 13.5px;
          font-weight: 600;
        }
        .clienteNuevo__footer {
          position: sticky;
          bottom: 0;
          z-index: 5;
          justify-content: flex-end;
          border-top: 1px solid #e3ebf1;
          border-radius: 0 0 12px 12px;
          background: rgba(255, 255, 255, 0.97);
          padding: 12px 20px;
        }
        @media (max-width: 1100px) {
          .clienteNuevo__grid--cuatro,
          .clienteNuevo__grid--tres {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 640px) {
          .clienteNuevo {
            padding: 12px;
          }
          .clienteNuevo__header,
          .clienteNuevo__titulo {
            align-items: stretch;
            flex-direction: column;
          }
          .clienteNuevo__contenido,
          .clienteNuevo__repetidor {
            padding-right: 14px;
            padding-left: 14px;
          }
          .clienteNuevo__grid--cuatro,
          .clienteNuevo__grid--tres,
          .clienteNuevo__grid--dos {
            grid-template-columns: 1fr;
          }
          .clienteNuevo__campo input,
          .clienteNuevo__campo select,
          .clienteNuevo__campo textarea {
            font-size: 16px;
          }
          .clienteNuevo__footer {
            padding: 10px 14px;
          }
        }
      `}</style>
    </main>
  );
}

function EtiquetaCampo({ label }: { label: string }) {
  const obligatorio = label.trimEnd().endsWith("*");
  const base = obligatorio ? label.trimEnd().slice(0, -1).trimEnd() : label;

  return (
    <span>
      {base}
      {obligatorio ? <b aria-hidden="true"> *</b> : null}
    </span>
  );
}

function Input({
  label,
  onChange,
  ...propiedades
}: {
  label: string;
  onChange: (valor: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange">) {
  return (
    <label className="clienteNuevo__campo">
      <EtiquetaCampo label={label} />
      <input
        {...propiedades}
        aria-required={label.trimEnd().endsWith("*") ? true : undefined}
        onChange={(evento) => onChange(evento.target.value)}
      />
    </label>
  );
}

function Select({
  label,
  opciones,
  onChange,
  ...propiedades
}: {
  label: string;
  opciones: Array<{ value: string; label: string }>;
  onChange: (valor: string) => void;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange">) {
  return (
    <label className="clienteNuevo__campo">
      <EtiquetaCampo label={label} />
      <select
        {...propiedades}
        aria-required={label.trimEnd().endsWith("*") ? true : undefined}
        onChange={(evento) => onChange(evento.target.value)}
      >
        {opciones.map((opcion) => (
          <option key={opcion.value} value={opcion.value}>
            {opcion.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Area({
  label,
  onChange,
  ...propiedades
}: {
  label: string;
  onChange: (valor: string) => void;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange">) {
  return (
    <label className="clienteNuevo__campo">
      <EtiquetaCampo label={label} />
      <textarea
        {...propiedades}
        onChange={(evento) => onChange(evento.target.value)}
      />
    </label>
  );
}

function Titulo({ titulo }: { titulo: string; texto?: string }) {
  return (
    <div className="clienteNuevo__titulo">
      <h3>{titulo}</h3>
    </div>
  );
}

function Checks({
  valores,
}: {
  valores: Array<{
    etiqueta: string;
    marcado: boolean;
    cambiar: (valor: boolean) => void;
  }>;
}) {
  return (
    <div className="clienteNuevo__checks">
      {valores.map((valor) => (
        <label key={valor.etiqueta}>
          <input
            checked={valor.marcado}
            onChange={(evento) => valor.cambiar(evento.target.checked)}
            type="checkbox"
          />
          {valor.etiqueta}
        </label>
      ))}
    </div>
  );
}

function CabeceraRepetido({
  etiqueta,
  onEliminar,
}: {
  etiqueta: string;
  onEliminar: () => void;
}) {
  return (
    <div className="clienteNuevo__repetidoHeader">
      <strong>{etiqueta}</strong>
      <button
        className="clienteNuevo__eliminar"
        onClick={onEliminar}
        type="button"
      >
        Eliminar
      </button>
    </div>
  );
}

function Repeater({
  titulo,
  agregar,
  onAgregar,
  children,
}: {
  titulo: string;
  texto?: string;
  agregar: string;
  onAgregar: () => void;
  children: React.ReactNode;
}) {
  const hayRegistros = Array.isArray(children)
    ? children.length > 0
    : Boolean(children);

  return (
    <section className="clienteNuevo__repetidor">
      <div className="clienteNuevo__titulo">
        <h3>{titulo}</h3>
        <button
          className="clienteNuevo__agregar"
          onClick={onAgregar}
          type="button"
        >
          + {agregar}
        </button>
      </div>

      {hayRegistros ? (
        children
      ) : (
        <div className="clienteNuevo__sinRegistros">
          Aún no hay registros en esta sección.
        </div>
      )}
    </section>
  );
}
