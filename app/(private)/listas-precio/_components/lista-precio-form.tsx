"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  LISTAS_PRECIO_CANALES,
  LISTAS_PRECIO_GRUPOS_CLIENTE,
  LISTAS_PRECIO_ZONAS,
} from "@/lib/mocks/listas-precio";

import {
  obtenerClientesParaListaPrecio,
  obtenerListasBaseDemo,
  obtenerProductosParaListaPrecio,
} from "@/lib/mocks/listas-precio-storage";

import {
  ListaPrecioDemo,
  ListaPrecioEstado,
  ListaPrecioModo,
  ListaPrecioMoneda,
  ListaPrecioProducto,
  ListaPrecioReglaComercial,
  ListaPrecioTipo,
  NuevaListaPrecioDemo,
} from "@/types/lista-precio";

import styles from "./lista-precio-form.module.css";

type Props = {
  mode: "create" | "edit";
  initial?: ListaPrecioDemo;
  onSave: (
    data: NuevaListaPrecioDemo,
  ) => Promise<void> | void;
};

type TabId =
  | "informacion"
  | "productos"
  | "reglas";

type ProductoOpcion = {
  id: string;
  codigo: string;
  descripcion: string;
  unidadMedidaId: string;
  unidadMedidaNombre: string;
  costoPromedio: number;
};

type ClienteOpcion = {
  id: string;
  codigo: string;
  nombre: string;
};

type ListaBaseOpcion = {
  id: string;
  codigo: string;
  nombre: string;
  monedaCodigo: ListaPrecioMoneda;
};

const TABS: Array<{
  id: TabId;
  label: string;
}> = [
  {
    id: "informacion",
    label: "Información",
  },
  {
    id: "productos",
    label: "Productos y precios",
  },
  {
    id: "reglas",
    label: "Reglas comerciales",
  },
];

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

function initialForm(
  initial?: ListaPrecioDemo,
): NuevaListaPrecioDemo {
  if (initial) {
    const {
      id: _id,
      creadoEn: _creadoEn,
      actualizadoEn: _actualizadoEn,
      ...rest
    } = initial;

    return structuredClone(rest);
  }

  return {
    codigo: "",
    nombre: "",
    descripcion: "",
    tipo: "VENTA",
    monedaCodigo: "PYG",
    estado: "ACTIVA",
    modoPrecio: "PRECIO_FIJO",
    incluyeIva: true,
    listaBaseId: "",
    listaBaseCodigo: "",
    listaBaseNombre: "",
    ajusteGeneralPct: 0,
    vigenteDesde:
      new Date()
        .toISOString()
        .slice(0, 10),
    vigenteHasta: "",
    prioridad: 10,
    permiteDescuentoAdicional: true,
    descuentoMaximoPct: 5,
    grupoClienteId: "",
    grupoClienteNombre: "",
    clienteId: "",
    clienteCodigo: "",
    clienteNombre: "",
    zonaId: "",
    zonaNombre: "",
    canalVentaId: "",
    canalVentaNombre: "",
    productos: [],
    reglasComerciales: [],
    activo: true,
    observacion: "",
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

function NumberField({
  label,
  value,
  onChange,
  step = "1",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: string;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(event) =>
          onChange(
            Number(
              event.target.value || 0,
            ),
          )
        }
      />
    </Field>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={styles.check}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) =>
          onChange(
            event.target.checked,
          )
        }
      />
      {label}
    </label>
  );
}

function SectionTitle({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={styles.sectionTitle}>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

export default function ListaPrecioForm({
  mode,
  initial,
  onSave,
}: Props) {
  const [tab, setTab] =
    useState<TabId>("informacion");

  const [form, setForm] =
    useState<NuevaListaPrecioDemo>(
      () => initialForm(initial),
    );

  const [
    productosCatalogo,
    setProductosCatalogo,
  ] = useState<ProductoOpcion[]>(
    [],
  );

  const [
    clientesCatalogo,
    setClientesCatalogo,
  ] = useState<ClienteOpcion[]>(
    [],
  );

  const [
    listasBase,
    setListasBase,
  ] = useState<ListaBaseOpcion[]>(
    [],
  );

  const [error, setError] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  useEffect(() => {
    setProductosCatalogo(
      obtenerProductosParaListaPrecio(),
    );

    setClientesCatalogo(
      obtenerClientesParaListaPrecio(),
    );

    setListasBase(
      obtenerListasBaseDemo(
        initial?.id,
      ),
    );
  }, [initial?.id]);

  function update<
    K extends keyof NuevaListaPrecioDemo,
  >(
    key: K,
    value: NuevaListaPrecioDemo[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  const resumen = useMemo(() => {
    const total =
      form.productos.length;

    const activos =
      form.productos.filter(
        (item) => item.activo,
      ).length;

    const promedio =
      total > 0
        ? form.productos.reduce(
            (acc, item) =>
              acc +
              item.precioLista,
            0,
          ) / total
        : 0;

    return {
      total,
      activos,
      promedio,
    };
  }, [form.productos]);

  function agregarProducto(
    producto: ProductoOpcion,
  ) {
    if (
      form.productos.some(
        (item) =>
          item.productoId ===
          producto.id,
      )
    ) {
      return;
    }

    const nuevo:
      ListaPrecioProducto = {
      id: uid("precio"),
      productoId: producto.id,
      productoCodigo:
        producto.codigo,
      productoDescripcion:
        producto.descripcion,
      unidadMedidaId:
        producto.unidadMedidaId,
      unidadMedidaNombre:
        producto.unidadMedidaNombre,
      monedaCodigo:
        form.monedaCodigo,
      costoReferencia:
        producto.costoPromedio,
      precioBase:
        producto.costoPromedio,
      precioLista:
        producto.costoPromedio,
      margenPct: 0,
      descuentoPct: 0,
      cantidadMinima: 1,
      vigenteDesde:
        form.vigenteDesde,
      vigenteHasta:
        form.vigenteHasta,
      activo: true,
      escalas: [],
    };

    update("productos", [
      ...form.productos,
      nuevo,
    ]);
  }

  function importarTodos() {
    const actuales =
      new Set(
        form.productos.map(
          (item) =>
            item.productoId,
        ),
      );

    const nuevos =
      productosCatalogo
        .filter(
          (producto) =>
            !actuales.has(
              producto.id,
            ),
        )
        .map(
          (producto) =>
            ({
              id: uid(
                "precio",
              ),
              productoId:
                producto.id,
              productoCodigo:
                producto.codigo,
              productoDescripcion:
                producto.descripcion,
              unidadMedidaId:
                producto.unidadMedidaId,
              unidadMedidaNombre:
                producto.unidadMedidaNombre,
              monedaCodigo:
                form.monedaCodigo,
              costoReferencia:
                producto.costoPromedio,
              precioBase:
                producto.costoPromedio,
              precioLista:
                producto.costoPromedio,
              margenPct: 0,
              descuentoPct: 0,
              cantidadMinima: 1,
              vigenteDesde:
                form.vigenteDesde,
              vigenteHasta:
                form.vigenteHasta,
              activo: true,
              escalas: [],
            }) satisfies ListaPrecioProducto,
        );

    update("productos", [
      ...form.productos,
      ...nuevos,
    ]);
  }

  function aplicarAjuste(
    porcentaje: number,
  ) {
    update(
      "productos",
      form.productos.map(
        (item) => {
          const base =
            item.precioBase ||
            item.costoReferencia;

          const precio =
            base *
            (1 +
              porcentaje /
                100);

          return {
            ...item,
            precioLista:
              Math.max(
                0,
                Math.round(
                  precio,
                ),
              ),
            descuentoPct:
              porcentaje < 0
                ? Math.abs(
                    porcentaje,
                  )
                : 0,
            margenPct:
              item.costoReferencia >
              0
                ? Number(
                    (
                      ((precio -
                        item.costoReferencia) /
                        precio) *
                      100
                    ).toFixed(2),
                  )
                : 0,
          };
        },
      ),
    );
  }

  function agregarRegla() {
    const regla:
      ListaPrecioReglaComercial = {
      id: uid("regla"),
      tipoAplicacion:
        "GENERAL",
      referenciaId: "",
      referenciaCodigo: "",
      referenciaNombre: "",
      prioridad:
        form.prioridad,
      cantidadMinima: 1,
      permiteDescuentoAdicional:
        form.permiteDescuentoAdicional,
      descuentoMaximoPct:
        form.descuentoMaximoPct,
      vigenteDesde:
        form.vigenteDesde,
      vigenteHasta:
        form.vigenteHasta,
      activo: true,
    };

    update(
      "reglasComerciales",
      [
        ...form.reglasComerciales,
        regla,
      ],
    );
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError("");

    if (!form.nombre.trim()) {
      setTab("informacion");
      setError(
        "Ingrese el nombre de la lista de precios.",
      );
      return;
    }

    if (!form.vigenteDesde) {
      setTab("informacion");
      setError(
        "Ingrese la fecha de vigencia inicial.",
      );
      return;
    }

    setSaving(true);

    try {
      await onSave({
        ...form,
        codigo:
          form.codigo.trim(),
        nombre:
          form.nombre.trim(),
        descripcion:
          form.descripcion.trim(),
        observacion:
          form.observacion.trim(),
      });
    } catch {
      setError(
        mode === "create"
          ? "No fue posible registrar la lista."
          : "No fue posible actualizar la lista.",
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
              LISTAS DE PRECIOS
            </span>
            <span className={styles.demoPill}>
              DEMO
            </span>
          </div>

          <h1>
            {mode === "create"
              ? "Nueva lista de precios"
              : "Editar lista de precios"}
          </h1>

          <p>
            Defina precios, vigencia,
            productos y reglas
            comerciales.
          </p>
        </div>

        <Link
          href="/listas-precio"
          className={styles.secondaryButton}
        >
          ← Volver a listas
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
                ? "NUEVA LISTA"
                : "FICHA DE PRECIOS"}
            </span>

            <h2>
              {initial?.codigo ||
                "Código automático"}
            </h2>

            <p>
              {mode === "create"
                ? "El código LP-XXX se genera al guardar si se deja vacío."
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

          <div className={styles.headerBadges}>
            <span className={styles.typeBadge}>
              {form.tipo === "VENTA"
                ? "Venta"
                : "Compra"}
            </span>

            <span className={styles.currencyBadge}>
              {form.monedaCodigo}
            </span>
          </div>
        </div>

        {error ? (
          <div className={styles.error}>
            {error}
          </div>
        ) : null}

        <nav className={styles.tabs}>
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

        <div className={styles.content}>
          {tab === "informacion" ? (
            <>
              <SectionTitle
                title="Información general"
                description="Identificación, tipo, moneda, vigencia y cálculo de la lista."
              />

              <div className={styles.gridFour}>
                <Field label="Código">
                  <input
                    value={form.codigo}
                    placeholder="Automático"
                    onChange={(event) =>
                      update(
                        "codigo",
                        event.target.value,
                      )
                    }
                  />
                </Field>

                <Field label="Nombre *">
                  <input
                    value={form.nombre}
                    onChange={(event) =>
                      update(
                        "nombre",
                        event.target.value,
                      )
                    }
                  />
                </Field>

                <Field label="Tipo">
                  <select
                    value={form.tipo}
                    onChange={(event) =>
                      update(
                        "tipo",
                        event.target
                          .value as ListaPrecioTipo,
                      )
                    }
                  >
                    <option value="VENTA">
                      Venta
                    </option>
                    <option value="COMPRA">
                      Compra
                    </option>
                  </select>
                </Field>

                <Field label="Moneda">
                  <select
                    value={form.monedaCodigo}
                    onChange={(event) =>
                      update(
                        "monedaCodigo",
                        event.target
                          .value as ListaPrecioMoneda,
                      )
                    }
                  >
                    <option value="PYG">
                      PYG
                    </option>
                    <option value="USD">
                      USD
                    </option>
                    <option value="BRL">
                      BRL
                    </option>
                    <option value="EUR">
                      EUR
                    </option>
                  </select>
                </Field>
              </div>

              <div className={styles.gridFour}>
                <Field label="Estado">
                  <select
                    value={form.estado}
                    onChange={(event) =>
                      update(
                        "estado",
                        event.target
                          .value as ListaPrecioEstado,
                      )
                    }
                  >
                    <option value="ACTIVA">
                      Activa
                    </option>
                    <option value="BORRADOR">
                      Borrador
                    </option>
                    <option value="INACTIVA">
                      Inactiva
                    </option>
                  </select>
                </Field>

                <Field label="Modo de precio">
                  <select
                    value={form.modoPrecio}
                    onChange={(event) =>
                      update(
                        "modoPrecio",
                        event.target
                          .value as ListaPrecioModo,
                      )
                    }
                  >
                    <option value="PRECIO_FIJO">
                      Precio fijo
                    </option>
                    <option value="AJUSTE_PORCENTAJE">
                      Ajuste porcentual
                    </option>
                    <option value="MARGEN_SOBRE_COSTO">
                      Margen sobre costo
                    </option>
                  </select>
                </Field>

                <Field label="Lista base">
                  <select
                    value={form.listaBaseId}
                    onChange={(event) => {
                      const id =
                        event.target.value;

                      const selected =
                        listasBase.find(
                          (item) =>
                            item.id === id,
                        );

                      update(
                        "listaBaseId",
                        id,
                      );
                      update(
                        "listaBaseCodigo",
                        selected?.codigo ??
                          "",
                      );
                      update(
                        "listaBaseNombre",
                        selected?.nombre ??
                          "",
                      );
                    }}
                  >
                    <option value="">
                      Sin lista base
                    </option>

                    {listasBase.map(
                      (item) => (
                        <option
                          key={item.id}
                          value={item.id}
                        >
                          {item.codigo} ·{" "}
                          {item.nombre}
                        </option>
                      ),
                    )}
                  </select>
                </Field>

                <NumberField
                  label="Ajuste general %"
                  value={form.ajusteGeneralPct}
                  step="0.01"
                  onChange={(value) =>
                    update(
                      "ajusteGeneralPct",
                      value,
                    )
                  }
                />
              </div>

              <div className={styles.gridFour}>
                <Field label="Vigencia desde">
                  <input
                    type="date"
                    value={form.vigenteDesde}
                    onChange={(event) =>
                      update(
                        "vigenteDesde",
                        event.target.value,
                      )
                    }
                  />
                </Field>

                <Field label="Vigencia hasta">
                  <input
                    type="date"
                    value={form.vigenteHasta}
                    onChange={(event) =>
                      update(
                        "vigenteHasta",
                        event.target.value,
                      )
                    }
                  />
                </Field>

                <NumberField
                  label="Prioridad"
                  value={form.prioridad}
                  onChange={(value) =>
                    update(
                      "prioridad",
                      value,
                    )
                  }
                />

                <NumberField
                  label="Descuento máximo %"
                  value={form.descuentoMaximoPct}
                  step="0.01"
                  onChange={(value) =>
                    update(
                      "descuentoMaximoPct",
                      value,
                    )
                  }
                />
              </div>

              <Field label="Descripción">
                <textarea
                  value={form.descripcion}
                  onChange={(event) =>
                    update(
                      "descripcion",
                      event.target.value,
                    )
                  }
                />
              </Field>

              <div className={styles.checkGrid}>
                <Check
                  label="IVA incluido"
                  checked={form.incluyeIva}
                  onChange={(value) =>
                    update(
                      "incluyeIva",
                      value,
                    )
                  }
                />

                <Check
                  label="Permite descuento adicional"
                  checked={
                    form.permiteDescuentoAdicional
                  }
                  onChange={(value) =>
                    update(
                      "permiteDescuentoAdicional",
                      value,
                    )
                  }
                />

                <Check
                  label="Lista activa"
                  checked={form.activo}
                  onChange={(value) =>
                    update(
                      "activo",
                      value,
                    )
                  }
                />
              </div>
            </>
          ) : null}

          {tab === "productos" ? (
            <>
              <SectionTitle
                title="Productos y precios"
                description="Defina los precios por producto y aplique ajustes masivos."
                action={
                  <div className={styles.headerActions}>
                    <button
                      type="button"
                      className={styles.secondaryAction}
                      onClick={importarTodos}
                    >
                      Importar todos
                    </button>

                    <button
                      type="button"
                      className={styles.addButton}
                      onClick={() => {
                        const producto =
                          productosCatalogo.find(
                            (item) =>
                              !form.productos.some(
                                (actual) =>
                                  actual.productoId ===
                                  item.id,
                              ),
                          );

                        if (producto) {
                          agregarProducto(
                            producto,
                          );
                        }
                      }}
                    >
                      ＋ Agregar producto
                    </button>
                  </div>
                }
              />

              <div className={styles.summaryStrip}>
                <div>
                  <span>Productos</span>
                  <strong>{resumen.total}</strong>
                </div>

                <div>
                  <span>Activos</span>
                  <strong>{resumen.activos}</strong>
                </div>

                <div>
                  <span>Precio promedio</span>
                  <strong>
                    {new Intl.NumberFormat(
                      "es-PY",
                      {
                        maximumFractionDigits: 0,
                      },
                    ).format(
                      resumen.promedio,
                    )}
                  </strong>
                </div>

                <div className={styles.massActions}>
                  <button
                    type="button"
                    onClick={() =>
                      aplicarAjuste(-5)
                    }
                  >
                    -5%
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      aplicarAjuste(-10)
                    }
                  >
                    -10%
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      aplicarAjuste(5)
                    }
                  >
                    +5%
                  </button>
                </div>
              </div>

              {form.productos.length ===
              0 ? (
                <div className={styles.empty}>
                  <strong>
                    Sin productos en la lista.
                  </strong>
                  <span>
                    Agregue productos o importe
                    el catálogo completo.
                  </span>
                </div>
              ) : (
                <div className={styles.priceTable}>
                  <div className={styles.priceHeader}>
                    <span>Producto</span>
                    <span>Costo</span>
                    <span>Precio base</span>
                    <span>Precio lista</span>
                    <span>Margen</span>
                    <span>Cant. mín.</span>
                    <span />
                  </div>

                  {form.productos.map(
                    (producto) => (
                      <div
                        key={producto.id}
                        className={styles.priceLine}
                      >
                        <div className={styles.productName}>
                          <strong>
                            {producto.productoDescripcion}
                          </strong>
                          <small>
                            {producto.productoCodigo}
                          </small>
                        </div>

                        <input
                          type="number"
                          value={producto.costoReferencia}
                          onChange={(event) =>
                            update(
                              "productos",
                              form.productos.map(
                                (item) =>
                                  item.id ===
                                  producto.id
                                    ? {
                                        ...item,
                                        costoReferencia:
                                          Number(
                                            event.target.value ||
                                              0,
                                          ),
                                      }
                                    : item,
                              ),
                            )
                          }
                        />

                        <input
                          type="number"
                          value={producto.precioBase}
                          onChange={(event) =>
                            update(
                              "productos",
                              form.productos.map(
                                (item) =>
                                  item.id ===
                                  producto.id
                                    ? {
                                        ...item,
                                        precioBase:
                                          Number(
                                            event.target.value ||
                                              0,
                                          ),
                                      }
                                    : item,
                              ),
                            )
                          }
                        />

                        <input
                          type="number"
                          value={producto.precioLista}
                          onChange={(event) => {
                            const value =
                              Number(
                                event.target.value ||
                                  0,
                              );

                            update(
                              "productos",
                              form.productos.map(
                                (item) =>
                                  item.id ===
                                  producto.id
                                    ? {
                                        ...item,
                                        precioLista:
                                          value,
                                        margenPct:
                                          item.costoReferencia >
                                          0
                                            ? Number(
                                                (
                                                  ((value -
                                                    item.costoReferencia) /
                                                    value) *
                                                  100
                                                ).toFixed(2),
                                              )
                                            : 0,
                                      }
                                    : item,
                              ),
                            );
                          }}
                        />

                        <span className={styles.margin}>
                          {producto.margenPct.toFixed(
                            2,
                          )}
                          %
                        </span>

                        <input
                          type="number"
                          min="1"
                          value={producto.cantidadMinima}
                          onChange={(event) =>
                            update(
                              "productos",
                              form.productos.map(
                                (item) =>
                                  item.id ===
                                  producto.id
                                    ? {
                                        ...item,
                                        cantidadMinima:
                                          Number(
                                            event.target.value ||
                                              1,
                                          ),
                                      }
                                    : item,
                              ),
                            )
                          }
                        />

                        <button
                          type="button"
                          className={styles.removeButton}
                          onClick={() =>
                            update(
                              "productos",
                              form.productos.filter(
                                (item) =>
                                  item.id !==
                                  producto.id,
                              ),
                            )
                          }
                        >
                          ×
                        </button>
                      </div>
                    ),
                  )}
                </div>
              )}
            </>
          ) : null}

          {tab === "reglas" ? (
            <>
              <SectionTitle
                title="Aplicación comercial"
                description="Defina a quién se aplica la lista y reglas adicionales."
              />

              <div className={styles.gridFour}>
                <Field label="Grupo de cliente">
                  <select
                    value={form.grupoClienteId}
                    onChange={(event) => {
                      const id =
                        event.target.value;

                      const selected =
                        LISTAS_PRECIO_GRUPOS_CLIENTE.find(
                          (item) =>
                            item.id === id,
                        );

                      update(
                        "grupoClienteId",
                        id,
                      );
                      update(
                        "grupoClienteNombre",
                        selected?.nombre ??
                          "",
                      );
                    }}
                  >
                    <option value="">
                      Todos
                    </option>

                    {LISTAS_PRECIO_GRUPOS_CLIENTE.map(
                      (item) => (
                        <option
                          key={item.id}
                          value={item.id}
                        >
                          {item.codigo} ·{" "}
                          {item.nombre}
                        </option>
                      ),
                    )}
                  </select>
                </Field>

                <Field label="Cliente específico">
                  <select
                    value={form.clienteId}
                    onChange={(event) => {
                      const id =
                        event.target.value;

                      const selected =
                        clientesCatalogo.find(
                          (item) =>
                            item.id === id,
                        );

                      update(
                        "clienteId",
                        id,
                      );
                      update(
                        "clienteCodigo",
                        selected?.codigo ??
                          "",
                      );
                      update(
                        "clienteNombre",
                        selected?.nombre ??
                          "",
                      );
                    }}
                  >
                    <option value="">
                      Sin cliente específico
                    </option>

                    {clientesCatalogo.map(
                      (item) => (
                        <option
                          key={item.id}
                          value={item.id}
                        >
                          {item.codigo} ·{" "}
                          {item.nombre}
                        </option>
                      ),
                    )}
                  </select>
                </Field>

                <Field label="Zona">
                  <select
                    value={form.zonaId}
                    onChange={(event) => {
                      const id =
                        event.target.value;

                      const selected =
                        LISTAS_PRECIO_ZONAS.find(
                          (item) =>
                            item.id === id,
                        );

                      update(
                        "zonaId",
                        id,
                      );
                      update(
                        "zonaNombre",
                        selected?.nombre ??
                          "",
                      );
                    }}
                  >
                    <option value="">
                      Todas
                    </option>

                    {LISTAS_PRECIO_ZONAS.map(
                      (item) => (
                        <option
                          key={item.id}
                          value={item.id}
                        >
                          {item.codigo} ·{" "}
                          {item.nombre}
                        </option>
                      ),
                    )}
                  </select>
                </Field>

                <Field label="Canal de venta">
                  <select
                    value={form.canalVentaId}
                    onChange={(event) => {
                      const id =
                        event.target.value;

                      const selected =
                        LISTAS_PRECIO_CANALES.find(
                          (item) =>
                            item.id === id,
                        );

                      update(
                        "canalVentaId",
                        id,
                      );
                      update(
                        "canalVentaNombre",
                        selected?.nombre ??
                          "",
                      );
                    }}
                  >
                    <option value="">
                      Todos
                    </option>

                    {LISTAS_PRECIO_CANALES.map(
                      (item) => (
                        <option
                          key={item.id}
                          value={item.id}
                        >
                          {item.codigo} ·{" "}
                          {item.nombre}
                        </option>
                      ),
                    )}
                  </select>
                </Field>
              </div>

              <SectionTitle
                title="Reglas adicionales"
                description="Reglas específicas con prioridad, cantidad y vigencia."
                action={
                  <button
                    type="button"
                    className={styles.addButton}
                    onClick={agregarRegla}
                  >
                    ＋ Agregar regla
                  </button>
                }
              />

              {form.reglasComerciales.length ===
              0 ? (
                <div className={styles.empty}>
                  <strong>
                    Sin reglas adicionales.
                  </strong>
                  <span>
                    La lista utilizará solamente
                    la configuración principal.
                  </span>
                </div>
              ) : (
                <div className={styles.ruleList}>
                  {form.reglasComerciales.map(
                    (regla, index) => (
                      <article
                        key={regla.id}
                        className={styles.ruleCard}
                      >
                        <header>
                          <strong>
                            Regla {index + 1}
                          </strong>

                          <button
                            type="button"
                            onClick={() =>
                              update(
                                "reglasComerciales",
                                form.reglasComerciales.filter(
                                  (item) =>
                                    item.id !==
                                    regla.id,
                                ),
                              )
                            }
                          >
                            Eliminar
                          </button>
                        </header>

                        <div className={styles.gridFour}>
                          <Field label="Aplicación">
                            <select
                              value={regla.tipoAplicacion}
                              onChange={(event) =>
                                update(
                                  "reglasComerciales",
                                  form.reglasComerciales.map(
                                    (item) =>
                                      item.id ===
                                      regla.id
                                        ? {
                                            ...item,
                                            tipoAplicacion:
                                              event.target
                                                .value as ListaPrecioReglaComercial["tipoAplicacion"],
                                          }
                                        : item,
                                  ),
                                )
                              }
                            >
                              <option value="GENERAL">
                                General
                              </option>
                              <option value="GRUPO_CLIENTE">
                                Grupo de cliente
                              </option>
                              <option value="CLIENTE">
                                Cliente
                              </option>
                              <option value="ZONA">
                                Zona
                              </option>
                              <option value="CANAL_VENTA">
                                Canal de venta
                              </option>
                            </select>
                          </Field>

                          <NumberField
                            label="Prioridad"
                            value={regla.prioridad}
                            onChange={(value) =>
                              update(
                                "reglasComerciales",
                                form.reglasComerciales.map(
                                  (item) =>
                                    item.id ===
                                    regla.id
                                      ? {
                                          ...item,
                                          prioridad:
                                            value,
                                        }
                                      : item,
                                ),
                              )
                            }
                          />

                          <NumberField
                            label="Cantidad mínima"
                            value={regla.cantidadMinima}
                            onChange={(value) =>
                              update(
                                "reglasComerciales",
                                form.reglasComerciales.map(
                                  (item) =>
                                    item.id ===
                                    regla.id
                                      ? {
                                          ...item,
                                          cantidadMinima:
                                            value,
                                        }
                                      : item,
                                ),
                              )
                            }
                          />

                          <NumberField
                            label="Descuento máximo %"
                            value={regla.descuentoMaximoPct}
                            step="0.01"
                            onChange={(value) =>
                              update(
                                "reglasComerciales",
                                form.reglasComerciales.map(
                                  (item) =>
                                    item.id ===
                                    regla.id
                                      ? {
                                          ...item,
                                          descuentoMaximoPct:
                                            value,
                                        }
                                      : item,
                                ),
                              )
                            }
                          />
                        </div>
                      </article>
                    ),
                  )}
                </div>
              )}

              <Field label="Observación">
                <textarea
                  value={form.observacion}
                  onChange={(event) =>
                    update(
                      "observacion",
                      event.target.value,
                    )
                  }
                />
              </Field>
            </>
          ) : null}
        </div>

        <footer className={styles.footer}>
          <div>
            <span>
              Modo demostración
            </span>
            <small>
              Los cambios quedan guardados
              en este navegador.
            </small>
          </div>

          <div className={styles.footerActions}>
            <Link
              href="/listas-precio"
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
                ? "Guardando..."
                : mode === "create"
                  ? "Guardar lista"
                  : "Actualizar lista"}
            </button>
          </div>
        </footer>
      </form>
    </section>
  );
}