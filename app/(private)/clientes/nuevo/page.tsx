"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
  celular: string;
  email: string;
  esPrincipal: boolean;
  recibePedidos: boolean;
  recibeFacturacion: boolean;
  recibeCobranzas: boolean;
  recibeDocumentosElectronicos: boolean;
  recibeNotificaciones: boolean;
};

type Direccion = {
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
  tipo: string;
  nombreArchivo: string;
  urlArchivo: string;
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
  celular: string;
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
  tipoPersona: "JURIDICA",
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
  celular: "",
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
    celular: "",
    email: "",
    esPrincipal: false,
    recibePedidos: false,
    recibeFacturacion: false,
    recibeCobranzas: false,
    recibeDocumentosElectronicos: false,
    recibeNotificaciones: true,
  };
}

function crearDireccion(): Direccion {
  return {
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

function crearDocumento(): Documento {
  return {
    tipo: "OTRO",
    nombreArchivo: "",
    urlArchivo: "",
    fechaEmision: "",
    fechaVencimiento: "",
    observacion: "",
  };
}

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
    Record<number, Opcion[]>
  >({});
  const [ciudadesPorDireccion, setCiudadesPorDireccion] = useState<
    Record<number, Opcion[]>
  >({});
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    void cargarCatalogos();
  }, []);

  async function cargarCatalogos() {
    try {
      const respuesta = await fetch("/api/clientes?modo=catalogos", {
        cache: "no-store",
      });
      const datos = (await respuesta.json()) as {
        catalogos?: Partial<Catalogos>;
        error?: string;
      };

      if (!respuesta.ok) {
        throw new Error(datos.error ?? "No fue posible cargar los catálogos.");
      }

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

  function establecerDireccionFiscal(indice: number, marcado: boolean) {
    setDirecciones((actuales) =>
      actuales.map((direccion, posicion) => ({
        ...direccion,
        esFiscal: posicion === indice ? marcado : marcado ? false : direccion.esFiscal,
      })),
    );
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
          return tipo === "FISCAL" ? { ...direccion, esFiscal: false } : direccion;
        }

        return {
          ...direccion,
          tipo,
          esFiscal: tipo === "FISCAL" ? true : direccion.esFiscal,
        };
      }),
    );
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

  async function seleccionarDepartamento(indice: number, codigo: string) {
    const departamento = catalogos.departamentosParaguay.find(
      (opcion) => String(opcion.codigo) === codigo,
    );

    actualizarDireccion(indice, "departamentoCodigo", codigo);
    actualizarDireccion(indice, "departamento", departamento?.nombre ?? "");
    actualizarDireccion(indice, "distritoCodigo", "");
    actualizarDireccion(indice, "distrito", "");
    actualizarDireccion(indice, "ciudadCodigo", "");
    actualizarDireccion(indice, "ciudad", "");
    setCiudadesPorDireccion((actual) => ({ ...actual, [indice]: [] }));

    if (!codigo) {
      setDistritosPorDireccion((actual) => ({ ...actual, [indice]: [] }));
      return;
    }

    try {
      const respuesta = await fetch(
        `/api/clientes?catalogo=distritos&departamento=${encodeURIComponent(codigo)}`,
        { cache: "no-store" },
      );
      const datos = (await respuesta.json()) as {
        datos?: Opcion[];
        error?: string;
      };

      if (!respuesta.ok) throw new Error(datos.error);

      setDistritosPorDireccion((actual) => ({
        ...actual,
        [indice]: datos.datos ?? [],
      }));
    } catch (errorCarga) {
      setError(
        errorCarga instanceof Error
          ? errorCarga.message
          : "No fue posible cargar los distritos.",
      );
    }
  }

  async function seleccionarDistrito(indice: number, codigo: string) {
    const distrito = (distritosPorDireccion[indice] ?? []).find(
      (opcion) => String(opcion.codigo) === codigo,
    );
    const departamentoCodigo = direcciones[indice]?.departamentoCodigo ?? "";

    actualizarDireccion(indice, "distritoCodigo", codigo);
    actualizarDireccion(indice, "distrito", distrito?.nombre ?? "");
    actualizarDireccion(indice, "ciudadCodigo", "");
    actualizarDireccion(indice, "ciudad", "");

    if (!codigo || !departamentoCodigo) {
      setCiudadesPorDireccion((actual) => ({ ...actual, [indice]: [] }));
      return;
    }

    try {
      const respuesta = await fetch(
        `/api/clientes?catalogo=ciudades&departamento=${encodeURIComponent(
          departamentoCodigo,
        )}&distrito=${encodeURIComponent(codigo)}`,
        { cache: "no-store" },
      );
      const datos = (await respuesta.json()) as {
        datos?: Opcion[];
        error?: string;
      };

      if (!respuesta.ok) throw new Error(datos.error);

      setCiudadesPorDireccion((actual) => ({
        ...actual,
        [indice]: datos.datos ?? [],
      }));
    } catch (errorCarga) {
      setError(
        errorCarga instanceof Error
          ? errorCarga.message
          : "No fue posible cargar las ciudades.",
      );
    }
  }

  function seleccionarCiudad(indice: number, codigo: string) {
    const ciudad = (ciudadesPorDireccion[indice] ?? []).find(
      (opcion) => String(opcion.codigo) === codigo,
    );

    actualizarDireccion(indice, "ciudadCodigo", codigo);
    actualizarDireccion(indice, "ciudad", ciudad?.nombre ?? "");
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError("");
    setGuardando(true);

    try {
      const respuesta = await fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formulario,
          contactos: contactos.filter(
            (contacto) =>
              contacto.nombre ||
              contacto.email ||
              contacto.telefono ||
              contacto.celular,
          ),
          direcciones: direcciones.filter((direccion) => direccion.direccion),
          documentos: documentos.filter(
            (documento) => documento.nombreArchivo || documento.urlArchivo,
          ),
        }),
      });
      const datos = (await respuesta.json()) as { error?: string };

      if (!respuesta.ok) {
        throw new Error(datos.error ?? "No fue posible guardar el cliente.");
      }

      router.push("/clientes");
      router.refresh();
    } catch (errorGuardado) {
      setError(
        errorGuardado instanceof Error
          ? errorGuardado.message
          : "No fue posible guardar el cliente.",
      );
    } finally {
      setGuardando(false);
    }
  }

  const esContribuyente = formulario.naturaleza === "CONTRIBUYENTE";
  const esB2F = formulario.tipoOperacion === "B2F";
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

  return (
    <main className="clienteNuevo">
      <header className="clienteNuevo__header">
        <div>
          <p className="clienteNuevo__miga">
            Distribuidora Central <span>/</span> Clientes <span>/</span> Nuevo
            cliente
          </p>
          <h1>Nuevo cliente</h1>
          <p className="clienteNuevo__subtitulo">
            Registro comercial, logístico y fiscal para ventas y facturación
            electrónica.
          </p>
        </div>

        <Link href="/clientes" className="clienteNuevo__secundario">
          ← Volver a clientes
        </Link>
      </header>

      <form onSubmit={guardar} className="clienteNuevo__card">
        <div className="clienteNuevo__cardHeader">
          <div>
            <span>NUEVO CLIENTE</span>
            <h2>Datos del cliente</h2>
            <p>El código interno se genera automáticamente al guardar.</p>
          </div>

          <div className="clienteNuevo__codigoAuto">
            <b>✓</b>
            <span>
              <strong>Código automático</strong>
              <small>No se utiliza código cliente SIFEN.</small>
            </span>
          </div>
        </div>

        {error ? <div className="clienteNuevo__error">{error}</div> : null}

        <nav className="clienteNuevo__tabs" aria-label="Secciones del cliente">
          {[
            ["fiscal", "Información fiscal"],
            ["comercial", "Comercial y crédito"],
            ["contactos", "Contactos"],
            ["direcciones", "Direcciones"],
            ["logistica", "Entrega y ventas"],
            ["documentos", "Documentos"],
          ].map(([identificador, etiqueta]) => (
            <button
              className={tab === identificador ? "activo" : ""}
              key={identificador}
              onClick={() => setTab(identificador)}
              type="button"
            >
              {etiqueta}
            </button>
          ))}
        </nav>

        {tab === "fiscal" ? (
          <section className="clienteNuevo__contenido">
            <Titulo
              titulo="Identificación fiscal"
              texto="Información del receptor utilizada al emitir documentos electrónicos."
            />

            <div className="clienteNuevo__grid clienteNuevo__grid--cuatro">
              <Select
                label="Naturaleza *"
                onChange={(valor) => {
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
                label="Tipo de operación *"
                onChange={(valor) => {
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
                label="País *"
                disabled={!esB2F}
                onChange={(valor) => actualizarFormulario("paisCodigo", valor)}
                opciones={opcionesPaisCliente}
                value={formulario.paisCodigo}
              />
              <Select
                label="Tipo de persona *"
                onChange={(valor) => actualizarFormulario("tipoPersona", valor)}
                opciones={[
                  { value: "JURIDICA", label: "Persona jurídica" },
                  { value: "FISICA", label: "Persona física" },
                ]}
                value={formulario.tipoPersona}
              />
            </div>

            <div className="clienteNuevo__grid clienteNuevo__grid--cuatro">
              {esContribuyente ? (
                <>
                  <Input
                    inputMode="numeric"
                    label="RUC *"
                    maxLength={8}
                    onChange={(valor) =>
                      actualizarFormulario(
                        "numeroDocumento",
                        valor.replace(/\D/g, "").slice(0, 8),
                      )
                    }
                    value={formulario.numeroDocumento}
                  />
                  <Input
                    label="DV *"
                    onChange={(valor) => actualizarFormulario("dv", valor)}
                    value={formulario.dv}
                  />
                </>
              ) : (
                <>
                  <Select
                    label="Tipo de documento *"
                    onChange={(valor) => {
                      setFormulario((actual) => ({
                        ...actual,
                        tipoDocumento: valor,
                        descripcionDocumentoIdentidad:
                          valor === "OTRO"
                            ? actual.descripcionDocumentoIdentidad
                            : "",
                        numeroDocumento:
                          valor === "INNOMINADO" ? "0" : actual.numeroDocumento === "0" ? "" : actual.numeroDocumento,
                      }));
                    }}
                    opciones={opcionesDocumentoIdentidad}
                    value={formulario.tipoDocumento}
                  />
                  <Input
                    disabled={esInnominado}
                    label={`Número de documento${esB2F ? " (opcional)" : " *"}`}
                    maxLength={20}
                    onChange={(valor) =>
                      actualizarFormulario("numeroDocumento", valor)
                    }
                    value={esInnominado ? "0" : formulario.numeroDocumento}
                  />
                  {formulario.tipoDocumento === "OTRO" ? (
                    <Input
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
                label="Nombre o razón social *"
                onChange={(valor) => actualizarFormulario("razonSocial", valor)}
                value={formulario.razonSocial}
              />
              <Input
                label="Nombre de fantasía"
                onChange={(valor) =>
                  actualizarFormulario("nombreFantasia", valor)
                }
                value={formulario.nombreFantasia}
              />
            </div>

            <Titulo
              titulo="Contacto principal"
              texto="Datos generales del cliente. Puede agregar personas específicas en la pestaña Contactos."
            />

            <div className="clienteNuevo__grid clienteNuevo__grid--cuatro">
              <Input
                label="Correo electrónico"
                onChange={(valor) => actualizarFormulario("email", valor)}
                type="email"
                value={formulario.email}
              />
              <Input
                label="Correo en copia"
                onChange={(valor) => actualizarFormulario("emailCopia", valor)}
                type="email"
                value={formulario.emailCopia}
              />
              <Input
                label="Teléfono"
                onChange={(valor) => actualizarFormulario("telefono", valor)}
                value={formulario.telefono}
              />
              <Input
                label="Celular"
                onChange={(valor) => actualizarFormulario("celular", valor)}
                value={formulario.celular}
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
                label="Límite de crédito (Gs.)"
                min="0"
                onChange={(valor) =>
                  actualizarFormulario("limiteCredito", valor)
                }
                type="number"
                value={formulario.limiteCredito}
              />
              <Input
                label="Descuento comercial (%)"
                max="100"
                min="0"
                onChange={(valor) =>
                  actualizarFormulario("descuentoComercialPct", valor)
                }
                type="number"
                value={formulario.descuentoComercialPct}
              />
              <Input
                label="Límite temporal (Gs.)"
                min="0"
                onChange={(valor) =>
                  actualizarFormulario("limiteCreditoTemporal", valor)
                }
                type="number"
                value={formulario.limiteCreditoTemporal}
              />
              <Input
                label="Vencimiento del crédito"
                onChange={(valor) =>
                  actualizarFormulario("fechaVencimientoCredito", valor)
                }
                placeholder="dd/mm/yyyy"
                value={formulario.fechaVencimientoCredito}
              />
            </div>

            <div className="clienteNuevo__grid clienteNuevo__grid--tres">
              <Input
                label="Día preferido de cobro"
                max="31"
                min="1"
                onChange={(valor) =>
                  actualizarFormulario("diaPreferidoCobro", valor)
                }
                type="number"
                value={formulario.diaPreferidoCobro}
              />
              <Input
                label="Correo de facturación"
                onChange={(valor) =>
                  actualizarFormulario("emailFacturacion", valor)
                }
                type="email"
                value={formulario.emailFacturacion}
              />
              <Input
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
                label="GLN"
                maxLength={13}
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

                <div className="clienteNuevo__grid clienteNuevo__grid--tres">
                  <Input
                    label="Teléfono"
                    onChange={(valor) =>
                      actualizarContacto(indice, "telefono", valor)
                    }
                    value={contacto.telefono}
                  />
                  <Input
                    label="Celular"
                    onChange={(valor) =>
                      actualizarContacto(indice, "celular", valor)
                    }
                    value={contacto.celular}
                  />
                  <Input
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
                <article className="clienteNuevo__repetido" key={indice}>
                  <CabeceraRepetido
                    etiqueta={`Dirección ${indice + 1}`}
                    onEliminar={() =>
                      setDirecciones((actuales) =>
                        actuales.filter((_, posicion) => posicion !== indice),
                      )
                    }
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
                      label="Dirección *"
                      onChange={(valor) =>
                        actualizarDireccion(indice, "direccion", valor)
                      }
                      value={direccion.direccion}
                    />
                    <Input
                      label={direccion.esFiscal || direccion.tipo === "FISCAL" ? "Nro. de casa *" : "Nro. de casa"}
                      onChange={(valor) =>
                        actualizarDireccion(indice, "numeroCasa", valor)
                      }
                      value={direccion.numeroCasa}
                    />
                  </div>

                  <div className="clienteNuevo__grid clienteNuevo__grid--cuatro">
                    <Select
                      label="País *"
                      onChange={(valor) => {
                        actualizarDireccion(indice, "paisCodigo", valor);
                        actualizarDireccion(indice, "departamentoCodigo", "");
                        actualizarDireccion(indice, "departamento", "");
                        actualizarDireccion(indice, "distritoCodigo", "");
                        actualizarDireccion(indice, "distrito", "");
                        actualizarDireccion(indice, "ciudadCodigo", "");
                        actualizarDireccion(indice, "ciudad", "");
                        setDistritosPorDireccion((actual) => ({
                          ...actual,
                          [indice]: [],
                        }));
                        setCiudadesPorDireccion((actual) => ({
                          ...actual,
                          [indice]: [],
                        }));
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
                        label="Departamento *"
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
                        label="Distrito *"
                        onChange={(valor) =>
                          void seleccionarDistrito(indice, valor)
                        }
                        opciones={opcionesCatalogo(
                          distritosPorDireccion[indice] ?? [],
                          "Seleccione un distrito",
                        )}
                        value={direccion.distritoCodigo}
                      />
                      <Select
                        disabled={!direccion.distritoCodigo}
                        label="Ciudad *"
                        onChange={(valor) => seleccionarCiudad(indice, valor)}
                        opciones={opcionesCatalogo(
                          ciudadesPorDireccion[indice] ?? [],
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
                label="Frecuencia de entrega"
                onChange={(valor) =>
                  actualizarFormulario("frecuenciaEntrega", valor)
                }
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
            </div>

            <p className="clienteNuevo__textoAuxiliar">
              Días habituales de entrega
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
            texto="Registre el enlace seguro a documentos comerciales vigentes."
            titulo="Documentos comerciales"
          >
            {documentos.map((documento, indice) => (
              <article className="clienteNuevo__repetido" key={indice}>
                <CabeceraRepetido
                  etiqueta={`Documento ${indice + 1}`}
                  onEliminar={() =>
                    setDocumentos((actuales) =>
                      actuales.filter((_, posicion) => posicion !== indice),
                    )
                  }
                />

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
                  <Input
                    label="Nombre del archivo *"
                    onChange={(valor) =>
                      actualizarDocumento(indice, "nombreArchivo", valor)
                    }
                    value={documento.nombreArchivo}
                  />
                  <Input
                    label="URL segura *"
                    onChange={(valor) =>
                      actualizarDocumento(indice, "urlArchivo", valor)
                    }
                    value={documento.urlArchivo}
                  />
                  <Input
                    label="Fecha de emisión"
                    onChange={(valor) =>
                      actualizarDocumento(indice, "fechaEmision", valor)
                    }
                    placeholder="dd/mm/yyyy"
                    value={documento.fechaEmision}
                  />
                </div>

                <div className="clienteNuevo__grid clienteNuevo__grid--dos">
                  <Input
                    label="Fecha de vencimiento"
                    onChange={(valor) =>
                      actualizarDocumento(indice, "fechaVencimiento", valor)
                    }
                    placeholder="dd/mm/yyyy"
                    value={documento.fechaVencimiento}
                  />
                  <Area
                    label="Observación"
                    onChange={(valor) =>
                      actualizarDocumento(indice, "observacion", valor)
                    }
                    value={documento.observacion}
                  />
                </div>
              </article>
            ))}
          </Repeater>
        ) : null}

        <footer className="clienteNuevo__footer">
          <Link href="/clientes" className="clienteNuevo__secundario">
            Cancelar
          </Link>
          <button
            className="clienteNuevo__primario"
            disabled={guardando}
            type="submit"
          >
            {guardando ? "Guardando..." : "Guardar cliente →"}
          </button>
        </footer>
      </form>

      <style jsx global>{`
        .clienteNuevo {
          max-width: 1180px;
          margin: 0 auto;
          color: #082d58;
        }

        .clienteNuevo__header,
        .clienteNuevo__cardHeader,
        .clienteNuevo__titulo,
        .clienteNuevo__repetidoHeader,
        .clienteNuevo__footer {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
        }

        .clienteNuevo__header {
          margin-bottom: 28px;
        }

        .clienteNuevo__miga {
          margin: 0;
          color: #7190b2;
          font-size: 13px;
        }

        .clienteNuevo__miga span {
          margin: 0 8px;
        }

        .clienteNuevo__header h1 {
          margin: 16px 0 8px;
          font-size: 34px;
        }

        .clienteNuevo__subtitulo,
        .clienteNuevo__cardHeader p,
        .clienteNuevo__titulo p {
          margin: 0;
          color: #6686aa;
          font-size: 14px;
        }

        .clienteNuevo__secundario,
        .clienteNuevo__primario,
        .clienteNuevo__agregar {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          border-radius: 9px;
          padding: 10px 16px;
          font-size: 13px;
          font-weight: 800;
          text-decoration: none;
          cursor: pointer;
        }

        .clienteNuevo__secundario {
          border: 1px solid #cadced;
          background: #fff;
          color: #16436d;
        }

        .clienteNuevo__primario {
          border: 0;
          background: #16aab3;
          color: #fff;
          box-shadow: 0 9px 18px rgba(22, 170, 179, 0.18);
        }

        .clienteNuevo__primario:disabled {
          cursor: progress;
          opacity: 0.68;
        }

        .clienteNuevo__card {
          overflow: hidden;
          border: 1px solid #d8e5f0;
          border-radius: 14px;
          background: #fff;
          box-shadow: 0 12px 30px rgba(22, 59, 90, 0.05);
        }

        .clienteNuevo__cardHeader {
          padding: 30px 36px;
          border-bottom: 1px solid #e2ecf4;
        }

        .clienteNuevo__cardHeader > div > span {
          color: #6584a7;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 1px;
        }

        .clienteNuevo__cardHeader h2 {
          margin: 8px 0;
          font-size: 27px;
        }

        .clienteNuevo__codigoAuto {
          display: flex;
          align-items: center;
          gap: 9px;
          border: 1px solid #b7e9e7;
          border-radius: 9px;
          background: #effcfb;
          padding: 11px;
          color: #087d8b;
        }

        .clienteNuevo__codigoAuto > b {
          display: grid;
          width: 22px;
          height: 22px;
          place-items: center;
          border-radius: 50%;
          background: #16aab3;
          color: #fff;
        }

        .clienteNuevo__codigoAuto span {
          display: grid;
          gap: 3px;
          font-size: 12px;
        }

        .clienteNuevo__codigoAuto small {
          font-size: 10px;
        }

        .clienteNuevo__error {
          margin: 20px 36px;
          border: 1px solid #ffc5cc;
          border-radius: 8px;
          background: #fff5f6;
          padding: 12px;
          color: #b62d40;
          font-size: 13px;
        }

        .clienteNuevo__tabs {
          display: flex;
          overflow-x: auto;
          border-bottom: 1px solid #dfe9f1;
          padding: 12px 36px 0;
        }

        .clienteNuevo__tabs button {
          flex: 0 0 auto;
          border: 0;
          border-bottom: 3px solid transparent;
          background: transparent;
          padding: 11px 13px;
          color: #6887a8;
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
          cursor: pointer;
        }

        .clienteNuevo__tabs button.activo {
          border-color: #14adb5;
          color: #063d68;
        }

        .clienteNuevo__contenido,
        .clienteNuevo__repetidor {
          padding: 30px 36px;
        }

        .clienteNuevo__titulo {
          margin: 0 0 21px;
        }

        .clienteNuevo__titulo h3 {
          margin: 0 0 5px;
          font-size: 19px;
        }

        .clienteNuevo__titulo small {
          color: #7190b2;
          font-size: 11px;
          white-space: nowrap;
        }

        .clienteNuevo__grid {
          display: grid;
          gap: 15px;
          margin-bottom: 15px;
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
          position: relative;
        }

        .clienteNuevo__campo input,
        .clienteNuevo__campo select,
        .clienteNuevo__campo textarea {
          box-sizing: border-box;
          width: 100%;
          height: 52px;
          border: 1px solid #cadced;
          border-radius: 8px;
          outline: 0;
          background: #fff;
          padding: 20px 12px 7px;
          color: #173d63;
          font: inherit;
          font-size: 13px;
        }

        .clienteNuevo__campo textarea {
          min-height: 86px;
          height: 86px;
          resize: vertical;
        }

        .clienteNuevo__campo input:focus,
        .clienteNuevo__campo select:focus,
        .clienteNuevo__campo textarea:focus {
          border-color: #16aab3;
          box-shadow: 0 0 0 3px rgba(22, 170, 179, 0.12);
        }

        .clienteNuevo__campo input:disabled,
        .clienteNuevo__campo select:disabled {
          cursor: not-allowed;
          background: #f4f7fa;
          color: #8097ac;
        }

        .clienteNuevo__campo label {
          position: absolute;
          top: 8px;
          left: 12px;
          color: #6685a6;
          font-size: 10px;
          font-weight: 700;
          pointer-events: none;
        }

        .clienteNuevo__checks {
          display: flex;
          flex-wrap: wrap;
          gap: 14px 18px;
          margin: 14px 0;
        }

        .clienteNuevo__checks label {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #315575;
          font-size: 12px;
          font-weight: 700;
        }

        .clienteNuevo__checks input {
          accent-color: #16aab3;
        }

        .clienteNuevo__repetido {
          margin-top: 14px;
          border: 1px solid #dbe7f0;
          border-radius: 10px;
          background: #fcfeff;
          padding: 19px;
        }

        .clienteNuevo__repetidoHeader {
          align-items: center;
          margin-bottom: 15px;
          color: #315575;
          font-size: 13px;
        }

        .clienteNuevo__agregar {
          border: 1px solid #a5e0de;
          background: #effcfb;
          color: #087d8b;
        }

        .clienteNuevo__eliminar {
          border: 0;
          background: transparent;
          color: #bf4050;
          font-weight: 800;
          cursor: pointer;
        }

        .clienteNuevo__sinRegistros {
          border: 1px dashed #cadced;
          border-radius: 9px;
          padding: 24px;
          color: #7190b2;
          text-align: center;
          font-size: 13px;
        }

        .clienteNuevo__textoAuxiliar {
          margin: 0;
          color: #315575;
          font-size: 13px;
          font-weight: 800;
        }

        .clienteNuevo__footer {
          align-items: center;
          justify-content: flex-end;
          border-top: 1px solid #dfe9f1;
          padding: 20px 36px;
        }

        @media (max-width: 900px) {
          .clienteNuevo__grid--cuatro,
          .clienteNuevo__grid--tres {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 650px) {
          .clienteNuevo__header,
          .clienteNuevo__cardHeader,
          .clienteNuevo__titulo {
            flex-direction: column;
          }

          .clienteNuevo__contenido,
          .clienteNuevo__repetidor,
          .clienteNuevo__cardHeader,
          .clienteNuevo__footer {
            padding-right: 20px;
            padding-left: 20px;
          }

          .clienteNuevo__grid--cuatro,
          .clienteNuevo__grid--tres,
          .clienteNuevo__grid--dos {
            grid-template-columns: 1fr;
          }

          .clienteNuevo__header h1 {
            font-size: 28px;
          }
        }
      `}</style>
    </main>
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
    <div className="clienteNuevo__campo">
      <input
        {...propiedades}
        onChange={(evento) => onChange(evento.target.value)}
        placeholder={propiedades.placeholder ?? " "}
      />
      <label>{label}</label>
    </div>
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
    <div className="clienteNuevo__campo">
      <select
        {...propiedades}
        onChange={(evento) => onChange(evento.target.value)}
      >
        {opciones.map((opcion) => (
          <option key={opcion.value} value={opcion.value}>
            {opcion.label}
          </option>
        ))}
      </select>
      <label>{label}</label>
    </div>
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
    <div className="clienteNuevo__campo">
      <textarea
        {...propiedades}
        onChange={(evento) => onChange(evento.target.value)}
        placeholder=" "
      />
      <label>{label}</label>
    </div>
  );
}

function Titulo({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="clienteNuevo__titulo">
      <div>
        <h3>{titulo}</h3>
        <p>{texto}</p>
      </div>
      <small>Los campos con * son obligatorios.</small>
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
  texto,
  agregar,
  onAgregar,
  children,
}: {
  titulo: string;
  texto: string;
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
        <div>
          <h3>{titulo}</h3>
          <p>{texto}</p>
        </div>
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