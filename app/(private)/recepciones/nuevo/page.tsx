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
  crearRecepcionDemo,
  obtenerProductosParaRecepcion,
  obtenerProveedoresParaRecepcion,
} from "@/lib/mocks/recepciones-storage";

import {
  NuevaRecepcionDemo,
  RecepcionItemDemo,
} from "@/types/recepciones";

import styles from "./page.module.css";

type ProductoOpcion = {
  id: string;
  codigo: string;
  codigoInventario: string;
  descripcion: string;
  unidadMedidaNombre: string;
  costoPromedio: number;
  precioVentaReferencia: number;
  modoControlStock: string;
};

type ProveedorOpcion = {
  id: string;
  codigo: string;
  nombre: string;
};

const DEPOSITOS = [
  {
    id: "dep-central",
    codigo: "DEP-CEN",
    nombre: "Depósito Central",
  },
  {
    id: "dep-norte",
    codigo: "DEP-NOR",
    nombre: "Depósito Norte",
  },
];

function uid() {
  return `rec-item-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

function today() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}

function timeNow() {
  return new Date()
    .toTimeString()
    .slice(0, 5);
}

function money(
  value: number,
) {
  return `Gs. ${new Intl.NumberFormat(
    "es-PY",
    {
      maximumFractionDigits: 0,
    },
  ).format(value)}`;
}

export default function NuevaRecepcionPage() {
  const router = useRouter();

  const productos =
    useMemo(
      () =>
        obtenerProductosParaRecepcion() as ProductoOpcion[],
      [],
    );

  const proveedores =
    useMemo(() => {
      const base =
        obtenerProveedoresParaRecepcion() as ProveedorOpcion[];

      return base.length
        ? base
        : [
            {
              id: "demo-prv-001",
              codigo: "PRV-000001",
              nombre:
                "IMPORTADORA CENTRAL S.A.",
            },
            {
              id: "demo-prv-002",
              codigo: "PRV-000002",
              nombre:
                "DISTRIBUIDORA COMERCIAL S.A.",
            },
          ];
    }, []);

  const [form, setForm] =
    useState<NuevaRecepcionDemo>({
      fecha: today(),
      hora: timeNow(),
      proveedorId: "",
      proveedorCodigo: "",
      proveedorNombre: "",
      ordenCompraId: "",
      ordenCompraNumero: "",
      depositoId: "dep-central",
      depositoCodigo: "DEP-CEN",
      depositoNombre:
        "Depósito Central",
      documentoProveedor: "",
      observacion: "",
      items: [],
      usuario: "admin",
    });

  const [productoId, setProductoId] =
    useState("");

  const [error, setError] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  function patch<
    K extends keyof NuevaRecepcionDemo,
  >(
    key: K,
    value: NuevaRecepcionDemo[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  const totalUnidades =
    useMemo(
      () =>
        form.items.reduce(
          (sum, item) =>
            sum +
            Number(
              item.cantidadRecibida ||
                0,
            ),
          0,
        ),
      [form.items],
    );

  const totalCosto =
    useMemo(
      () =>
        form.items.reduce(
          (sum, item) =>
            sum +
            Number(
              item.cantidadRecibida ||
                0,
            ) *
              Number(
                item.costoUnitario ||
                  0,
              ),
          0,
        ),
      [form.items],
    );

  function seleccionarProveedor(
    id: string,
  ) {
    const found =
      proveedores.find(
        (item) =>
          item.id === id,
      );

    patch("proveedorId", id);
    patch(
      "proveedorCodigo",
      found?.codigo ?? "",
    );
    patch(
      "proveedorNombre",
      found?.nombre ?? "",
    );
  }

  function seleccionarDeposito(
    id: string,
  ) {
    const found =
      DEPOSITOS.find(
        (item) =>
          item.id === id,
      );

    patch("depositoId", id);
    patch(
      "depositoCodigo",
      found?.codigo ?? "",
    );
    patch(
      "depositoNombre",
      found?.nombre ?? "",
    );
  }

  function agregarProducto() {
    if (!productoId) {
      return;
    }

    const producto =
      productos.find(
        (item) =>
          item.id === productoId,
      );

    if (!producto) {
      return;
    }

    if (
      form.items.some(
        (item) =>
          item.productoId ===
          producto.id,
      )
    ) {
      setError(
        "El producto ya fue agregado.",
      );
      return;
    }

    const item: RecepcionItemDemo = {
      id: uid(),
      productoId: producto.id,
      productoCodigo:
        producto.codigo,
      productoCodigoInventario:
        producto.codigoInventario,
      productoDescripcion:
        producto.descripcion,
      unidadMedidaNombre:
        producto.unidadMedidaNombre,
      cantidadOrdenada: 0,
      cantidadRecibida: 1,
      cantidadPendiente: 0,
      costoUnitario:
        producto.costoPromedio,
      subtotal:
        producto.costoPromedio,
      lote: "",
      fechaVencimiento: "",
    };

    patch("items", [
      ...form.items,
      item,
    ]);

    setProductoId("");
    setError("");
  }

  function actualizarItem(
    id: string,
    changes: Partial<RecepcionItemDemo>,
  ) {
    patch(
      "items",
      form.items.map(
        (item) => {
          if (item.id !== id) {
            return item;
          }

          const next = {
            ...item,
            ...changes,
          };

          next.cantidadPendiente =
            Math.max(
              0,
              Number(
                next.cantidadOrdenada ||
                  0,
              ) -
                Number(
                  next.cantidadRecibida ||
                    0,
                ),
            );

          next.subtotal =
            Number(
              next.cantidadRecibida ||
                0,
            ) *
            Number(
              next.costoUnitario ||
                0,
            );

          return next;
        },
      ),
    );
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError("");

    if (!form.proveedorId) {
      setError(
        "Seleccione un proveedor.",
      );
      return;
    }

    if (!form.depositoId) {
      setError(
        "Seleccione el depósito destino.",
      );
      return;
    }

    if (!form.items.length) {
      setError(
        "Agregue al menos un producto.",
      );
      return;
    }

    setSaving(true);

    try {
      crearRecepcionDemo(form);

      await new Promise(
        (resolve) =>
          window.setTimeout(
            resolve,
            350,
          ),
      );

      router.push(
        "/recepciones",
      );
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No fue posible registrar la recepción.",
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
              COMPRAS
            </span>
            <span className={styles.demoPill}>
              DEMO
            </span>
          </div>

          <h1>
            Nueva recepción
          </h1>

          <p>
            Recepción de mercadería con
            entrada automática al stock.
          </p>
        </div>

        <Link
          href="/recepciones"
          className={styles.secondaryButton}
        >
          ← Volver a recepciones
        </Link>
      </header>

      <form
        className={styles.card}
        onSubmit={submit}
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
                Datos de la recepción
              </h2>
              <p>
                Proveedor, documento,
                depósito y referencia de
                compra.
              </p>
            </div>

            <span>
              REC- automático
            </span>
          </div>

          <div className={styles.gridFour}>
            <label>
              <span>Fecha *</span>
              <input
                type="date"
                value={form.fecha}
                onChange={(event) =>
                  patch(
                    "fecha",
                    event.target.value,
                  )
                }
              />
            </label>

            <label>
              <span>Hora *</span>
              <input
                type="time"
                value={form.hora}
                onChange={(event) =>
                  patch(
                    "hora",
                    event.target.value,
                  )
                }
              />
            </label>

            <label>
              <span>Proveedor *</span>
              <select
                value={form.proveedorId}
                onChange={(event) =>
                  seleccionarProveedor(
                    event.target.value,
                  )
                }
              >
                <option value="">
                  Seleccione proveedor
                </option>

                {proveedores.map(
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
            </label>

            <label>
              <span>
                Depósito destino *
              </span>
              <select
                value={form.depositoId}
                onChange={(event) =>
                  seleccionarDeposito(
                    event.target.value,
                  )
                }
              >
                {DEPOSITOS.map(
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
            </label>
          </div>

          <div className={styles.gridThree}>
            <label>
              <span>
                Orden de compra
              </span>
              <input
                value={
                  form.ordenCompraNumero
                }
                placeholder="OC-000123"
                onChange={(event) =>
                  patch(
                    "ordenCompraNumero",
                    event.target.value,
                  )
                }
              />
            </label>

            <label>
              <span>
                Documento proveedor
              </span>
              <input
                value={
                  form.documentoProveedor
                }
                placeholder="Factura / remisión"
                onChange={(event) =>
                  patch(
                    "documentoProveedor",
                    event.target.value,
                  )
                }
              />
            </label>

            <label>
              <span>Usuario</span>
              <input
                value={form.usuario}
                readOnly
              />
            </label>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>
                Productos recibidos
              </h2>
              <p>
                Registre cantidades
                recibidas, costos y lotes.
              </p>
            </div>
          </div>

          <div className={styles.addProduct}>
            <select
              value={productoId}
              onChange={(event) =>
                setProductoId(
                  event.target.value,
                )
              }
            >
              <option value="">
                Seleccione producto
              </option>

              {productos.map(
                (item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.codigoInventario ||
                      item.codigo}
                    {" · "}
                    {item.descripcion}
                  </option>
                ),
              )}
            </select>

            <button
              type="button"
              onClick={agregarProducto}
            >
              ＋ Agregar producto
            </button>
          </div>

          <div className={styles.itemHeader}>
            <span>Producto</span>
            <span>Ordenada</span>
            <span>Recibida</span>
            <span>Pendiente</span>
            <span>Costo unit.</span>
            <span>Subtotal</span>
            <span>Lote</span>
            <span>Vencimiento</span>
            <span />
          </div>

          {form.items.map(
            (item) => (
              <div
                key={item.id}
                className={styles.itemRow}
              >
                <div className={styles.productCell}>
                  <strong>
                    {item.productoDescripcion}
                  </strong>
                  <small>
                    {item.productoCodigoInventario ||
                      item.productoCodigo}
                  </small>
                </div>

                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={
                    item.cantidadOrdenada
                  }
                  onChange={(event) =>
                    actualizarItem(
                      item.id,
                      {
                        cantidadOrdenada:
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
                  min="0.001"
                  step="0.001"
                  value={
                    item.cantidadRecibida
                  }
                  onChange={(event) =>
                    actualizarItem(
                      item.id,
                      {
                        cantidadRecibida:
                          Number(
                            event.target.value ||
                              0,
                          ),
                      },
                    )
                  }
                />

                <input
                  value={
                    item.cantidadPendiente
                  }
                  readOnly
                />

                <input
                  type="number"
                  min="0"
                  value={
                    item.costoUnitario
                  }
                  onChange={(event) =>
                    actualizarItem(
                      item.id,
                      {
                        costoUnitario:
                          Number(
                            event.target.value ||
                              0,
                          ),
                      },
                    )
                  }
                />

                <input
                  value={money(
                    item.subtotal,
                  )}
                  readOnly
                />

                <input
                  value={item.lote}
                  onChange={(event) =>
                    actualizarItem(
                      item.id,
                      {
                        lote:
                          event.target.value,
                      },
                    )
                  }
                />

                <input
                  type="date"
                  value={
                    item.fechaVencimiento
                  }
                  onChange={(event) =>
                    actualizarItem(
                      item.id,
                      {
                        fechaVencimiento:
                          event.target.value,
                      },
                    )
                  }
                />

                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() =>
                    patch(
                      "items",
                      form.items.filter(
                        (actual) =>
                          actual.id !==
                          item.id,
                      ),
                    )
                  }
                >
                  ×
                </button>
              </div>
            ),
          )}

          {form.items.length === 0 ? (
            <div className={styles.empty}>
              Sin productos agregados.
            </div>
          ) : null}
        </section>

        <section className={styles.section}>
          <div className={styles.summary}>
            <div>
              <span>
                ÍTEMS
              </span>
              <strong>
                {form.items.length}
              </strong>
            </div>

            <div>
              <span>
                UNIDADES RECIBIDAS
              </span>
              <strong>
                {new Intl.NumberFormat(
                  "es-PY",
                  {
                    maximumFractionDigits: 2,
                  },
                ).format(
                  totalUnidades,
                )}
              </strong>
            </div>

            <div>
              <span>
                COSTO TOTAL
              </span>
              <strong>
                {money(
                  totalCosto,
                )}
              </strong>
            </div>
          </div>

          <label className={styles.textareaField}>
            <span>
              Observación
            </span>

            <textarea
              value={form.observacion}
              onChange={(event) =>
                patch(
                  "observacion",
                  event.target.value,
                )
              }
            />
          </label>
        </section>

        <footer className={styles.footer}>
          <div>
            <span>
              Entrada automática de stock
            </span>

            <small>
              Al registrar la recepción se
              genera un movimiento ENTRADA
              por cada producto recibido.
            </small>
          </div>

          <div className={styles.footerActions}>
            <Link
              href="/recepciones"
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
                ? "Registrando..."
                : "Registrar recepción"}
            </button>
          </div>
        </footer>
      </form>
    </section>
  );
}