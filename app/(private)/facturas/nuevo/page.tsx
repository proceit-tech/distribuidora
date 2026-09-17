"use client";

import Link from "next/link";
import {
  FormEvent,
  useMemo,
  useState,
} from "react";
import {
  useRouter,
} from "next/navigation";

import {
  calcularTotalesFactura,
  crearFacturaDemo,
  obtenerClientesParaFactura,
  obtenerProductosParaFactura,
} from "@/lib/mocks/facturas-storage";

import {
  FacturaCliente,
  FacturaCondicionOperacion,
  FacturaIndicadorPresencia,
  FacturaItem,
  FacturaMoneda,
  FacturaTipoTransaccion,
  NuevaFacturaDemo,
} from "@/types/facturas";

import styles from "./page.module.css";

type ClienteLocal = {
  id: string;
  codigo: string;
  naturaleza: string;
  tipoPersona: string;
  tipoDocumento: string;
  numeroDocumento: string;
  dv: string;
  razonSocial: string;
  email: string;
  telefono: string;
  celular: string;
  direccion?: string;
};

type ProductoLocal = {
  id: string;
  codigo: string;
  descripcion: string;
  unidadMedidaNombre: string;
  impuestoNombre: string;
  costoPromedio: number;
};

function uid() {
  return `item-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

function emptyCliente(): FacturaCliente {
  return {
    clienteId: "",
    codigo: "",
    naturaleza: "CONTRIBUYENTE",
    tipoContribuyente: "PERSONA_JURIDICA",
    tipoDocumento: "RUC",
    numeroDocumento: "",
    dv: "",
    razonSocial: "SIN NOMBRE",
    email: "",
    telefono: "",
    celular: "",
    direccion: "",
    numeroCasa: "0",
  };
}

function base(): NuevaFacturaDemo {
  return {
    sucursalCodigo: "001",
    sucursalDescripcion:
      "CASA MINGO S.A.",
    puntoExpedicion: "001",
    descripcionPuntoExpedicion:
      "Casa Central",
    numeroSecuencia: "",
    fechaEmision:
      new Date()
        .toISOString()
        .slice(0, 10),
    moneda: "PYG",
    condicionOperacion: "CONTADO",
    tipoTransaccion:
      "VENTA_MERCADERIA",
    indicadorPresencia:
      "PRESENCIAL",
    informacionAdicional: "",
    cliente: emptyCliente(),
    exportacion: {
      habilitado: false,
      tipoOperacion: "Exportación",
      condicionNegociacion: "",
      paisDestino: "",
      empresaFletera: "",
      agenteTransporte: "",
      instruccionesPago: "",
      conocimientoEmbarque: "",
      manifiestoCarga: "",
      barcazaRemolcador: "",
      descripcionBienTransportado: "",
      cantidadBienTransportado: 0,
      ciudadExportacion: "",
      pesoBruto: 0,
      pesoNeto: 0,
      otrasObservaciones: "",
    },
    contratacionPublica: {
      habilitado: false,
      modalidad: "",
      entidad: "",
      codigoContratacion: "",
      numeroContrato: "",
      fechaContrato: "",
    },
    items: [],
    formaPago: {
      medio: "EFECTIVO",
      monto: 0,
    },
    totales:
      calcularTotalesFactura([]),
  };
}

export default function NuevaFacturaPage() {
  const router = useRouter();

  const [form, setForm] =
    useState<NuevaFacturaDemo>(
      base,
    );

  const [error, setError] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  const [clienteModal, setClienteModal] =
    useState(false);

  const [productoModal, setProductoModal] =
    useState(false);

  const [exportModal, setExportModal] =
    useState(false);

  const [publicaOpen, setPublicaOpen] =
    useState(false);

  const [clienteSearch, setClienteSearch] =
    useState("");

  const [productoSearch, setProductoSearch] =
    useState("");

  const clientes =
    useMemo(
      () =>
        obtenerClientesParaFactura() as ClienteLocal[],
      [],
    );

  const productos =
    useMemo(
      () =>
        obtenerProductosParaFactura() as ProductoLocal[],
      [],
    );

  const clientesFiltrados =
    clientes.filter((item) =>
      [
        item.razonSocial,
        item.numeroDocumento,
        item.codigo,
      ]
        .join(" ")
        .toLowerCase()
        .includes(
          clienteSearch.toLowerCase(),
        ),
    );

  const productosFiltrados =
    productos.filter((item) =>
      [
        item.codigo,
        item.descripcion,
      ]
        .join(" ")
        .toLowerCase()
        .includes(
          productoSearch.toLowerCase(),
        ),
    );

  function patch<
    K extends keyof NuevaFacturaDemo,
  >(
    key: K,
    value: NuevaFacturaDemo[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function seleccionarCliente(
    cliente: ClienteLocal,
  ) {
    patch("cliente", {
      clienteId: cliente.id,
      codigo: cliente.codigo,
      naturaleza:
        cliente.naturaleza ===
        "NO_CONTRIBUYENTE"
          ? "NO_CONTRIBUYENTE"
          : "CONTRIBUYENTE",
      tipoContribuyente:
        cliente.tipoPersona ===
        "FISICA"
          ? "PERSONA_FISICA"
          : "PERSONA_JURIDICA",
      tipoDocumento:
        cliente.tipoDocumento ||
        "RUC",
      numeroDocumento:
        cliente.numeroDocumento ||
        "",
      dv: cliente.dv || "",
      razonSocial:
        cliente.razonSocial ||
        "SIN NOMBRE",
      email: cliente.email || "",
      telefono:
        cliente.telefono || "",
      celular:
        cliente.celular || "",
      direccion:
        cliente.direccion || "",
      numeroCasa: "0",
    });

    setClienteModal(false);
  }

  function agregarProducto(
    producto: ProductoLocal,
  ) {
    const porcentaje =
      producto.impuestoNombre.includes(
        "5",
      )
        ? 5
        : producto.impuestoNombre.includes(
              "Exenta",
            )
          ? 0
          : 10;

    const nuevo: FacturaItem = {
      id: uid(),
      productoId: producto.id,
      productoCodigo:
        producto.codigo,
      descripcion:
        producto.descripcion,
      afectacionIva:
        porcentaje === 0
          ? "EXENTO"
          : "GRAVADO",
      porcentajeIva:
        porcentaje as 0 | 5 | 10,
      unidadMedida:
        producto.unidadMedidaNombre ||
        "Unidad",
      cantidad: 1,
      precioUnitario:
        Math.max(
          producto.costoPromedio,
          0,
        ),
      subtotal:
        Math.max(
          producto.costoPromedio,
          0,
        ),
    };

    const items = [
      ...form.items,
      nuevo,
    ];

    const totales =
      calcularTotalesFactura(
        items,
      );

    patch("items", items);
    patch("totales", totales);
    patch("formaPago", {
      ...form.formaPago,
      monto:
        form.condicionOperacion ===
        "CONTADO"
          ? totales.totalGeneral
          : form.formaPago.monto,
    });

    setProductoModal(false);
  }

  function actualizarItem(
    id: string,
    changes: Partial<FacturaItem>,
  ) {
    const items =
      form.items.map((item) => {
        if (item.id !== id) {
          return item;
        }

        const next = {
          ...item,
          ...changes,
        };

        next.subtotal =
          Number(
            next.cantidad || 0,
          ) *
          Number(
            next.precioUnitario ||
              0,
          );

        return next;
      });

    const totales =
      calcularTotalesFactura(
        items,
      );

    patch("items", items);
    patch("totales", totales);

    if (
      form.condicionOperacion ===
      "CONTADO"
    ) {
      patch("formaPago", {
        ...form.formaPago,
        monto:
          totales.totalGeneral,
      });
    }
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError("");

    if (
      !form.cliente.clienteId
    ) {
      setError(
        "Seleccione un cliente.",
      );
      return;
    }

    if (
      form.items.length === 0
    ) {
      setError(
        "Agregue al menos un producto.",
      );
      return;
    }

    setSaving(true);

    try {
      crearFacturaDemo(form);

      await new Promise(
        (resolve) =>
          window.setTimeout(
            resolve,
            350,
          ),
      );

      router.push("/facturas");
      router.refresh();
    } catch {
      setError(
        "No fue posible emitir la factura.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <div className={styles.heroMeta}>
            <span className={styles.modulePill}>
              FACTURACIÓN
            </span>
            <span className={styles.demoPill}>
              DEMO
            </span>
          </div>

          <h1>Nueva factura</h1>

          <p>
            Emisor: CASA MINGO S.A.
          </p>
        </div>

        <Link
          href="/facturas"
          className={styles.secondaryButton}
        >
          ← Volver al listado
        </Link>
      </header>

      <form
        onSubmit={submit}
        className={styles.card}
      >
        {error ? (
          <div className={styles.error}>
            {error}
          </div>
        ) : null}

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>
                Datos de la cabecera
              </h2>
              <p>
                Campos principales del
                documento electrónico.
              </p>
            </div>

            <span>
              Campos obligatorios *
            </span>
          </div>

          <div className={styles.gridSix}>
            <label>
              <span>Sucursal *</span>
              <select
                value={form.sucursalCodigo}
                onChange={(event) =>
                  patch(
                    "sucursalCodigo",
                    event.target.value,
                  )
                }
              >
                <option value="001">
                  001 · Casa Central
                </option>
              </select>
            </label>

            <label className={styles.spanTwo}>
              <span>Descripción</span>
              <input
                value={form.sucursalDescripcion}
                onChange={(event) =>
                  patch(
                    "sucursalDescripcion",
                    event.target.value,
                  )
                }
              />
            </label>

            <label>
              <span>Punt. Exp. *</span>
              <select
                value={form.puntoExpedicion}
                onChange={(event) =>
                  patch(
                    "puntoExpedicion",
                    event.target.value,
                  )
                }
              >
                <option value="001">
                  001
                </option>
                <option value="002">
                  002
                </option>
              </select>
            </label>

            <label>
              <span>Nro. secuencia</span>
              <input
                value={form.numeroSecuencia}
                placeholder="Automático"
                onChange={(event) =>
                  patch(
                    "numeroSecuencia",
                    event.target.value,
                  )
                }
              />
            </label>

            <label>
              <span>Fecha emisión *</span>
              <input
                type="date"
                value={form.fechaEmision}
                onChange={(event) =>
                  patch(
                    "fechaEmision",
                    event.target.value,
                  )
                }
              />
            </label>
          </div>

          <div className={styles.gridFour}>
            <label>
              <span>
                Condición operación *
              </span>
              <select
                value={form.condicionOperacion}
                onChange={(event) =>
                  patch(
                    "condicionOperacion",
                    event.target
                      .value as FacturaCondicionOperacion,
                  )
                }
              >
                <option value="CONTADO">
                  Contado
                </option>
                <option value="CREDITO">
                  Crédito
                </option>
              </select>
            </label>

            <label>
              <span>
                Tipo transacción *
              </span>
              <select
                value={form.tipoTransaccion}
                onChange={(event) =>
                  patch(
                    "tipoTransaccion",
                    event.target
                      .value as FacturaTipoTransaccion,
                  )
                }
              >
                <option value="VENTA_MERCADERIA">
                  Venta de mercadería
                </option>
                <option value="PRESTACION_SERVICIO">
                  Prestación de servicio
                </option>
                <option value="MIXTO">
                  Mixto
                </option>
                <option value="MUESTRAS_MEDICAS">
                  Muestras médicas
                </option>
                <option value="DONACION">
                  Donación
                </option>
                <option value="OTRO">
                  Otro
                </option>
              </select>
            </label>

            <label>
              <span>
                Indicador presencia *
              </span>
              <select
                value={form.indicadorPresencia}
                onChange={(event) =>
                  patch(
                    "indicadorPresencia",
                    event.target
                      .value as FacturaIndicadorPresencia,
                  )
                }
              >
                <option value="PRESENCIAL">
                  Operación presencial
                </option>
                <option value="INTERNET">
                  Internet
                </option>
                <option value="TELEFONO">
                  Teléfono
                </option>
                <option value="OTRO">
                  Otro
                </option>
              </select>
            </label>

            <label>
              <span>Moneda *</span>
              <select
                value={form.moneda}
                onChange={(event) =>
                  patch(
                    "moneda",
                    event.target
                      .value as FacturaMoneda,
                  )
                }
              >
                <option value="PYG">
                  Guaraní
                </option>
                <option value="USD">
                  Dólar
                </option>
                <option value="BRL">
                  Real
                </option>
                <option value="EUR">
                  Euro
                </option>
              </select>
            </label>
          </div>

          <label className={styles.textareaField}>
            <span>Información adicional</span>
            <textarea
              value={form.informacionAdicional}
              onChange={(event) =>
                patch(
                  "informacionAdicional",
                  event.target.value,
                )
              }
            />
          </label>

          <div className={styles.quickActions}>
            <button
              type="button"
              onClick={() =>
                setExportModal(true)
              }
            >
              ＋ Datos para factura de exportación
            </button>

            <button
              type="button"
              onClick={() =>
                setPublicaOpen(
                  (value) => !value,
                )
              }
            >
              ＋ Datos de contratación pública
            </button>
          </div>

          {publicaOpen ? (
            <div className={styles.publicBox}>
              <div className={styles.gridThree}>
                <label>
                  <span>Modalidad</span>
                  <input
                    value={
                      form.contratacionPublica
                        .modalidad
                    }
                    onChange={(event) =>
                      patch(
                        "contratacionPublica",
                        {
                          ...form.contratacionPublica,
                          habilitado: true,
                          modalidad:
                            event.target.value,
                        },
                      )
                    }
                  />
                </label>

                <label>
                  <span>Entidad</span>
                  <input
                    value={
                      form.contratacionPublica
                        .entidad
                    }
                    onChange={(event) =>
                      patch(
                        "contratacionPublica",
                        {
                          ...form.contratacionPublica,
                          habilitado: true,
                          entidad:
                            event.target.value,
                        },
                      )
                    }
                  />
                </label>

                <label>
                  <span>Código contratación</span>
                  <input
                    value={
                      form.contratacionPublica
                        .codigoContratacion
                    }
                    onChange={(event) =>
                      patch(
                        "contratacionPublica",
                        {
                          ...form.contratacionPublica,
                          habilitado: true,
                          codigoContratacion:
                            event.target.value,
                        },
                      )
                    }
                  />
                </label>
              </div>
            </div>
          ) : null}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Datos del cliente</h2>
              <p>
                Receptor del documento
                electrónico.
              </p>
            </div>

            <button
              type="button"
              className={styles.searchButton}
              onClick={() =>
                setClienteModal(true)
              }
            >
              ⌕ Buscar cliente
            </button>
          </div>

          <div className={styles.gridFive}>
            <label>
              <span>Naturaleza receptor *</span>
              <select
                value={form.cliente.naturaleza}
                onChange={(event) =>
                  patch("cliente", {
                    ...form.cliente,
                    naturaleza:
                      event.target
                        .value as FacturaCliente["naturaleza"],
                  })
                }
              >
                <option value="CONTRIBUYENTE">
                  Contribuyente
                </option>
                <option value="NO_CONTRIBUYENTE">
                  No contribuyente
                </option>
              </select>
            </label>

            <label>
              <span>Tipo contribuyente *</span>
              <select
                value={form.cliente.tipoContribuyente}
                onChange={(event) =>
                  patch("cliente", {
                    ...form.cliente,
                    tipoContribuyente:
                      event.target
                        .value as FacturaCliente["tipoContribuyente"],
                  })
                }
              >
                <option value="PERSONA_JURIDICA">
                  Persona Jurídica
                </option>
                <option value="PERSONA_FISICA">
                  Persona Física
                </option>
              </select>
            </label>

            <label>
              <span>RUC / Documento</span>
              <input
                value={form.cliente.numeroDocumento}
                onChange={(event) =>
                  patch("cliente", {
                    ...form.cliente,
                    numeroDocumento:
                      event.target.value,
                  })
                }
              />
            </label>

            <label>
              <span>DV</span>
              <input
                value={form.cliente.dv}
                onChange={(event) =>
                  patch("cliente", {
                    ...form.cliente,
                    dv: event.target.value,
                  })
                }
              />
            </label>

            <label>
              <span>Razón social *</span>
              <input
                value={form.cliente.razonSocial}
                onChange={(event) =>
                  patch("cliente", {
                    ...form.cliente,
                    razonSocial:
                      event.target.value,
                  })
                }
              />
            </label>
          </div>

          <div className={styles.gridFive}>
            <label>
              <span>Email</span>
              <input
                value={form.cliente.email}
                onChange={(event) =>
                  patch("cliente", {
                    ...form.cliente,
                    email:
                      event.target.value,
                  })
                }
              />
            </label>

            <label>
              <span>Teléfono</span>
              <input
                value={form.cliente.telefono}
                onChange={(event) =>
                  patch("cliente", {
                    ...form.cliente,
                    telefono:
                      event.target.value,
                  })
                }
              />
            </label>

            <label>
              <span>Celular</span>
              <input
                value={form.cliente.celular}
                onChange={(event) =>
                  patch("cliente", {
                    ...form.cliente,
                    celular:
                      event.target.value,
                  })
                }
              />
            </label>

            <label className={styles.spanTwo}>
              <span>Dirección</span>
              <input
                value={form.cliente.direccion}
                onChange={(event) =>
                  patch("cliente", {
                    ...form.cliente,
                    direccion:
                      event.target.value,
                  })
                }
              />
            </label>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Detalles de la factura</h2>
              <p>
                Productos, IVA, cantidades
                y precios.
              </p>
            </div>

            <button
              type="button"
              className={styles.searchButton}
              onClick={() =>
                setProductoModal(true)
              }
            >
              ＋ Añadir producto
            </button>
          </div>

          <div className={styles.itemHeader}>
            <span>Producto</span>
            <span>Descripción</span>
            <span>Afectación IVA</span>
            <span>% IVA</span>
            <span>Uni. Med.</span>
            <span>Cantidad</span>
            <span>Prec. Uni.</span>
            <span>Subtotal</span>
            <span />
          </div>

          {form.items.map((item) => (
            <div
              key={item.id}
              className={styles.itemRow}
            >
              <input
                value={item.productoCodigo}
                readOnly
              />

              <input
                value={item.descripcion}
                onChange={(event) =>
                  actualizarItem(
                    item.id,
                    {
                      descripcion:
                        event.target.value,
                    },
                  )
                }
              />

              <select
                value={item.afectacionIva}
                onChange={(event) =>
                  actualizarItem(
                    item.id,
                    {
                      afectacionIva:
                        event.target
                          .value as FacturaItem["afectacionIva"],
                    },
                  )
                }
              >
                <option value="GRAVADO">
                  Gravado IVA
                </option>
                <option value="EXENTO">
                  Exento
                </option>
              </select>

              <select
                value={item.porcentajeIva}
                onChange={(event) =>
                  actualizarItem(
                    item.id,
                    {
                      porcentajeIva:
                        Number(
                          event.target.value,
                        ) as 0 | 5 | 10,
                    },
                  )
                }
              >
                <option value="10">
                  10%
                </option>
                <option value="5">
                  5%
                </option>
                <option value="0">
                  0%
                </option>
              </select>

              <input
                value={item.unidadMedida}
                readOnly
              />

              <input
                type="number"
                min="0.001"
                step="0.001"
                value={item.cantidad}
                onChange={(event) =>
                  actualizarItem(
                    item.id,
                    {
                      cantidad:
                        Number(
                          event.target.value ||
                            0,
                        ),
                    },
                  )
                }
              />

              <input
                type="number"
                min="0"
                value={item.precioUnitario}
                onChange={(event) =>
                  actualizarItem(
                    item.id,
                    {
                      precioUnitario:
                        Number(
                          event.target.value ||
                            0,
                        ),
                    },
                  )
                }
              />

              <input
                value={item.subtotal}
                readOnly
              />

              <button
                type="button"
                className={styles.removeButton}
                onClick={() => {
                  const items =
                    form.items.filter(
                      (actual) =>
                        actual.id !== item.id,
                    );

                  patch("items", items);
                  patch(
                    "totales",
                    calcularTotalesFactura(
                      items,
                    ),
                  );
                }}
              >
                ×
              </button>
            </div>
          ))}

          {form.items.length === 0 ? (
            <div className={styles.emptyItems}>
              Sin productos agregados.
            </div>
          ) : null}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Forma de pago</h2>
              <p>
                Medio y monto asociado al
                documento.
              </p>
            </div>
          </div>

          <div className={styles.gridTwo}>
            <label>
              <span>Medio de pago *</span>
              <select
                value={form.formaPago.medio}
                onChange={(event) =>
                  patch("formaPago", {
                    ...form.formaPago,
                    medio:
                      event.target
                        .value as NuevaFacturaDemo["formaPago"]["medio"],
                  })
                }
              >
                <option value="EFECTIVO">
                  Efectivo
                </option>
                <option value="TARJETA">
                  Tarjeta
                </option>
                <option value="TRANSFERENCIA">
                  Transferencia
                </option>
                <option value="CHEQUE">
                  Cheque
                </option>
                <option value="OTRO">
                  Otro
                </option>
              </select>
            </label>

            <label>
              <span>Monto</span>
              <input
                type="number"
                min="0"
                value={form.formaPago.monto}
                onChange={(event) =>
                  patch("formaPago", {
                    ...form.formaPago,
                    monto:
                      Number(
                        event.target.value ||
                          0,
                      ),
                  })
                }
              />
            </label>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Subtotales</h2>
              <p>
                Cálculos automáticos del
                documento.
              </p>
            </div>
          </div>

          <div className={styles.totalGrid}>
            {[
              ["Subtotal Exento", form.totales.subtotalExento],
              ["Subtotal 5%", form.totales.subtotal5],
              ["Subtotal 10%", form.totales.subtotal10],
              ["Total Operación", form.totales.totalOperacion],
              ["IVA 5%", form.totales.iva5],
              ["IVA 10%", form.totales.iva10],
              ["Liquidación IVA 5%", form.totales.liquidacionIva5],
              ["Liquidación IVA 10%", form.totales.liquidacionIva10],
              ["Total IVA", form.totales.totalIva],
              ["Base Gravada 5%", form.totales.baseGravada5],
              ["Base Gravada 10%", form.totales.baseGravada10],
              ["Total Base Gravada IVA", form.totales.totalBaseGravadaIva],
              ["Total General", form.totales.totalGeneral],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <span>{label}</span>
                <strong>
                  {new Intl.NumberFormat(
                    "es-PY",
                    {
                      maximumFractionDigits: 0,
                    },
                  ).format(
                    Number(value),
                  )}
                </strong>
              </div>
            ))}
          </div>
        </section>

        <footer className={styles.footer}>
          <div>
            <span>
              Modo demostración
            </span>
            <small>
              La factura se guarda
              localmente y se simula como
              aprobada por SIFEN.
            </small>
          </div>

          <div className={styles.footerActions}>
            <Link
              href="/facturas"
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
                ? "Emitiendo..."
                : "Emitir factura"}
            </button>
          </div>
        </footer>
      </form>

      {clienteModal ? (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <header>
              <div>
                <h3>Buscar cliente</h3>
                <p>
                  Razón social, RUC o código.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setClienteModal(false)
                }
              >
                ×
              </button>
            </header>

            <input
              className={styles.modalSearch}
              value={clienteSearch}
              onChange={(event) =>
                setClienteSearch(
                  event.target.value,
                )
              }
              placeholder="Buscar por razón social o documento"
            />

            <div className={styles.modalTable}>
              {clientesFiltrados
                .slice(0, 10)
                .map((cliente) => (
                  <button
                    key={cliente.id}
                    type="button"
                    onClick={() =>
                      seleccionarCliente(
                        cliente,
                      )
                    }
                  >
                    <span>
                      {
                        cliente.numeroDocumento
                      }
                    </span>
                    <strong>
                      {cliente.razonSocial}
                    </strong>
                    <small>
                      {cliente.codigo}
                    </small>
                  </button>
                ))}
            </div>
          </div>
        </div>
      ) : null}

      {productoModal ? (
        <div className={styles.overlay}>
          <div className={styles.modalWide}>
            <header>
              <div>
                <h3>Buscar producto</h3>
                <p>
                  Código o descripción.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setProductoModal(false)
                }
              >
                ×
              </button>
            </header>

            <input
              className={styles.modalSearch}
              value={productoSearch}
              onChange={(event) =>
                setProductoSearch(
                  event.target.value,
                )
              }
              placeholder="Buscar por código o descripción"
            />

            <div className={styles.productResults}>
              {productosFiltrados
                .slice(0, 10)
                .map((producto) => (
                  <button
                    key={producto.id}
                    type="button"
                    onClick={() =>
                      agregarProducto(
                        producto,
                      )
                    }
                  >
                    <span>
                      {producto.codigo}
                    </span>
                    <strong>
                      {producto.descripcion}
                    </strong>
                    <small>
                      {
                        producto.unidadMedidaNombre
                      }{" "}
                      ·{" "}
                      {producto.impuestoNombre}
                    </small>
                  </button>
                ))}
            </div>
          </div>
        </div>
      ) : null}

      {exportModal ? (
        <div className={styles.overlay}>
          <div className={styles.exportModal}>
            <header>
              <div>
                <h3>
                  Datos de factura exportación
                </h3>
                <p>
                  Información adicional para
                  operaciones de exportación.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setExportModal(false)
                }
              >
                ×
              </button>
            </header>

            <div className={styles.gridTwo}>
              <label>
                <span>Tipo operación</span>
                <input
                  value={
                    form.exportacion
                      .tipoOperacion
                  }
                  onChange={(event) =>
                    patch(
                      "exportacion",
                      {
                        ...form.exportacion,
                        habilitado: true,
                        tipoOperacion:
                          event.target.value,
                      },
                    )
                  }
                />
              </label>

              <label>
                <span>
                  Condición negociación
                </span>
                <input
                  value={
                    form.exportacion
                      .condicionNegociacion
                  }
                  onChange={(event) =>
                    patch(
                      "exportacion",
                      {
                        ...form.exportacion,
                        habilitado: true,
                        condicionNegociacion:
                          event.target.value,
                      },
                    )
                  }
                />
              </label>

              <label>
                <span>País destino</span>
                <input
                  value={
                    form.exportacion
                      .paisDestino
                  }
                  onChange={(event) =>
                    patch(
                      "exportacion",
                      {
                        ...form.exportacion,
                        habilitado: true,
                        paisDestino:
                          event.target.value,
                      },
                    )
                  }
                />
              </label>

              <label>
                <span>Empresa fletera</span>
                <input
                  value={
                    form.exportacion
                      .empresaFletera
                  }
                  onChange={(event) =>
                    patch(
                      "exportacion",
                      {
                        ...form.exportacion,
                        habilitado: true,
                        empresaFletera:
                          event.target.value,
                      },
                    )
                  }
                />
              </label>

              <label>
                <span>Agente transporte</span>
                <input
                  value={
                    form.exportacion
                      .agenteTransporte
                  }
                  onChange={(event) =>
                    patch(
                      "exportacion",
                      {
                        ...form.exportacion,
                        habilitado: true,
                        agenteTransporte:
                          event.target.value,
                      },
                    )
                  }
                />
              </label>

              <label>
                <span>Ciudad exportación</span>
                <input
                  value={
                    form.exportacion
                      .ciudadExportacion
                  }
                  onChange={(event) =>
                    patch(
                      "exportacion",
                      {
                        ...form.exportacion,
                        habilitado: true,
                        ciudadExportacion:
                          event.target.value,
                      },
                    )
                  }
                />
              </label>

              <label>
                <span>Peso bruto</span>
                <input
                  type="number"
                  value={
                    form.exportacion
                      .pesoBruto
                  }
                  onChange={(event) =>
                    patch(
                      "exportacion",
                      {
                        ...form.exportacion,
                        habilitado: true,
                        pesoBruto:
                          Number(
                            event.target.value ||
                              0,
                          ),
                      },
                    )
                  }
                />
              </label>

              <label>
                <span>Peso neto</span>
                <input
                  type="number"
                  value={
                    form.exportacion
                      .pesoNeto
                  }
                  onChange={(event) =>
                    patch(
                      "exportacion",
                      {
                        ...form.exportacion,
                        habilitado: true,
                        pesoNeto:
                          Number(
                            event.target.value ||
                              0,
                          ),
                      },
                    )
                  }
                />
              </label>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() =>
                  setExportModal(false)
                }
              >
                Cancelar
              </button>

              <button
                type="button"
                className={styles.saveButton}
                onClick={() =>
                  setExportModal(false)
                }
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}