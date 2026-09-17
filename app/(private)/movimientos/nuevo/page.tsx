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
  crearMovimientoStockDemo,
} from "@/lib/mocks/movimientos-stock-storage";

import {
  obtenerStockDemo,
} from "@/lib/mocks/stock-storage";

import {
  MovimientoStockOrigen,
  MovimientoStockTipo,
  NuevoMovimientoStockDemo,
} from "@/types/movimientos-stock";

import styles from "./page.module.css";

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
  {
    id: "dep-sur",
    codigo: "DEP-SUR",
    nombre: "Depósito Sur",
  },
];

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

export default function NuevoMovimientoPage() {
  const router = useRouter();

  const productos =
    useMemo(
      () => obtenerStockDemo(),
      [],
    );

  const [form, setForm] =
    useState<NuevoMovimientoStockDemo>({
      tipo: "ENTRADA",
      origen: "MANUAL",
      fecha: today(),
      hora: timeNow(),
      productoId: "",
      productoCodigo: "",
      productoDescripcion: "",
      unidadMedidaNombre: "",
      depositoOrigenId: "",
      depositoOrigenCodigo: "",
      depositoOrigenNombre: "",
      depositoDestinoId: "dep-central",
      depositoDestinoCodigo: "DEP-CEN",
      depositoDestinoNombre: "Depósito Central",
      cantidad: 1,
      lote: "",
      fechaVencimiento: "",
      propiedad: "PROPIO",
      propietarioId: "",
      propietarioNombre: "CASA MINGO S.A.",
      documentoReferencia: "",
      motivo: "",
      observacion: "",
      usuario: "admin",
    });

  const [error, setError] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  function set<K extends keyof NuevoMovimientoStockDemo>(
    key: K,
    value: NuevoMovimientoStockDemo[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  const requiereOrigen =
    [
      "SALIDA",
      "TRANSFERENCIA",
      "RESERVA",
      "LIBERACION_RESERVA",
      "CUARENTENA",
      "LIBERACION_CUARENTENA",
      "AJUSTE_NEGATIVO",
    ].includes(form.tipo);

  const requiereDestino =
    [
      "ENTRADA",
      "TRANSFERENCIA",
      "AJUSTE_POSITIVO",
    ].includes(form.tipo);

  const productoSeleccionado =
    productos.find(
      (item) =>
        item.productoId ===
        form.productoId,
    );

  function elegirDeposito(
    kind: "origen" | "destino",
    id: string,
  ) {
    const dep =
      DEPOSITOS.find(
        (item) =>
          item.id === id,
      );

    if (kind === "origen") {
      set(
        "depositoOrigenId",
        id,
      );
      set(
        "depositoOrigenCodigo",
        dep?.codigo ?? "",
      );
      set(
        "depositoOrigenNombre",
        dep?.nombre ?? "",
      );
    } else {
      set(
        "depositoDestinoId",
        id,
      );
      set(
        "depositoDestinoCodigo",
        dep?.codigo ?? "",
      );
      set(
        "depositoDestinoNombre",
        dep?.nombre ?? "",
      );
    }
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError("");

    if (!form.productoId) {
      setError(
        "Seleccione un producto.",
      );
      return;
    }

    if (
      !form.cantidad ||
      form.cantidad <= 0
    ) {
      setError(
        "La cantidad debe ser mayor que cero.",
      );
      return;
    }

    if (
      requiereOrigen &&
      !form.depositoOrigenId
    ) {
      setError(
        "Seleccione el depósito origen.",
      );
      return;
    }

    if (
      requiereDestino &&
      !form.depositoDestinoId
    ) {
      setError(
        "Seleccione el depósito destino.",
      );
      return;
    }

    if (
      form.tipo ===
        "TRANSFERENCIA" &&
      form.depositoOrigenId ===
        form.depositoDestinoId
    ) {
      setError(
        "El depósito origen y destino deben ser diferentes.",
      );
      return;
    }

    setSaving(true);

    try {
      crearMovimientoStockDemo(
        form,
      );

      await new Promise(
        (resolve) =>
          window.setTimeout(
            resolve,
            350,
          ),
      );

      router.push(
        "/movimientos",
      );
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No fue posible registrar el movimiento.",
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
              INVENTARIO
            </span>
            <span className={styles.demoPill}>
              DEMO
            </span>
          </div>

          <h1>
            Nuevo movimiento de stock
          </h1>

          <p>
            Registre entradas, salidas,
            transferencias, ajustes,
            reservas y cuarentenas.
          </p>
        </div>

        <Link
          href="/movimientos"
          className={styles.secondaryButton}
        >
          ← Volver a movimientos
        </Link>
      </header>

      <form
        className={styles.card}
        onSubmit={submit}
      >
        <div className={styles.cardHeader}>
          <div>
            <span>
              NUEVO MOVIMIENTO
            </span>
            <h2>
              Datos del movimiento
            </h2>
            <p>
              El número MOV-XXXXXX se
              genera automáticamente.
            </p>
          </div>

          <div className={styles.statusBadge}>
            Registrado
          </div>
        </div>

        {error ? (
          <div className={styles.error}>
            {error}
          </div>
        ) : null}

        <div className={styles.content}>
          <div className={styles.gridFour}>
            <label>
              <span>Tipo *</span>
              <select
                value={form.tipo}
                onChange={(event) => {
                  const value =
                    event.target
                      .value as MovimientoStockTipo;

                  set("tipo", value);

                  if (
                    value === "ENTRADA"
                  ) {
                    set(
                      "origen",
                      "COMPRA",
                    );
                  } else if (
                    value ===
                    "SALIDA"
                  ) {
                    set(
                      "origen",
                      "VENTA",
                    );
                  } else if (
                    value ===
                    "TRANSFERENCIA"
                  ) {
                    set(
                      "origen",
                      "TRANSFERENCIA",
                    );
                  } else {
                    set(
                      "origen",
                      "AJUSTE",
                    );
                  }
                }}
              >
                <option value="ENTRADA">
                  Entrada
                </option>
                <option value="SALIDA">
                  Salida
                </option>
                <option value="TRANSFERENCIA">
                  Transferencia
                </option>
                <option value="AJUSTE_POSITIVO">
                  Ajuste positivo
                </option>
                <option value="AJUSTE_NEGATIVO">
                  Ajuste negativo
                </option>
                <option value="RESERVA">
                  Reserva
                </option>
                <option value="LIBERACION_RESERVA">
                  Liberación de reserva
                </option>
                <option value="CUARENTENA">
                  Cuarentena
                </option>
                <option value="LIBERACION_CUARENTENA">
                  Liberación de cuarentena
                </option>
              </select>
            </label>

            <label>
              <span>Origen *</span>
              <select
                value={form.origen}
                onChange={(event) =>
                  set(
                    "origen",
                    event.target
                      .value as MovimientoStockOrigen,
                  )
                }
              >
                <option value="MANUAL">
                  Manual
                </option>
                <option value="COMPRA">
                  Compra
                </option>
                <option value="VENTA">
                  Venta
                </option>
                <option value="DEVOLUCION">
                  Devolución
                </option>
                <option value="TRANSFERENCIA">
                  Transferencia
                </option>
                <option value="AJUSTE">
                  Ajuste
                </option>
                <option value="INVENTARIO">
                  Inventario
                </option>
              </select>
            </label>

            <label>
              <span>Fecha *</span>
              <input
                type="date"
                value={form.fecha}
                onChange={(event) =>
                  set(
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
                  set(
                    "hora",
                    event.target.value,
                  )
                }
              />
            </label>
          </div>

          <div className={styles.sectionTitle}>
            Producto y cantidad
          </div>

          <div className={styles.gridFour}>
            <label className={styles.wideField}>
              <span>Producto *</span>
              <select
                value={form.productoId}
                onChange={(event) => {
                  const id =
                    event.target.value;

                  const producto =
                    productos.find(
                      (item) =>
                        item.productoId ===
                        id,
                    );

                  set(
                    "productoId",
                    id,
                  );
                  set(
                    "productoCodigo",
                    producto?.productoCodigo ??
                      "",
                  );
                  set(
                    "productoDescripcion",
                    producto?.productoDescripcion ??
                      "",
                  );
                  set(
                    "unidadMedidaNombre",
                    producto?.unidadMedidaNombre ??
                      "",
                  );
                  set(
                    "propiedad",
                    producto?.propiedad ??
                      "PROPIO",
                  );
                  set(
                    "propietarioId",
                    producto?.propietarioId ??
                      "",
                  );
                  set(
                    "propietarioNombre",
                    producto?.propietarioNombre ??
                      "CASA MINGO S.A.",
                  );
                }}
              >
                <option value="">
                  Seleccione producto
                </option>

                {productos.map(
                  (item) => (
                    <option
                      key={item.id}
                      value={item.productoId}
                    >
                      {item.productoCodigo} ·{" "}
                      {item.productoDescripcion}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              <span>Cantidad *</span>
              <input
                type="number"
                min="0.001"
                step="0.001"
                value={form.cantidad}
                onChange={(event) =>
                  set(
                    "cantidad",
                    Number(
                      event.target.value ||
                        0,
                    ),
                  )
                }
              />
            </label>

            <label>
              <span>Unidad</span>
              <input
                value={
                  form.unidadMedidaNombre
                }
                readOnly
              />
            </label>
          </div>

          {productoSeleccionado ? (
            <div className={styles.stockSnapshot}>
              <div>
                <span>Disponible</span>
                <strong>
                  {
                    productoSeleccionado.disponible
                  }
                </strong>
              </div>

              <div>
                <span>Reservado</span>
                <strong>
                  {
                    productoSeleccionado.reservado
                  }
                </strong>
              </div>

              <div>
                <span>Cuarentena</span>
                <strong>
                  {
                    productoSeleccionado.cuarentena
                  }
                </strong>
              </div>

              <div>
                <span>Tránsito</span>
                <strong>
                  {
                    productoSeleccionado.transito
                  }
                </strong>
              </div>
            </div>
          ) : null}

          <div className={styles.sectionTitle}>
            Depósitos
          </div>

          <div className={styles.gridTwo}>
            <label>
              <span>
                Depósito origen
                {requiereOrigen
                  ? " *"
                  : ""}
              </span>
              <select
                value={
                  form.depositoOrigenId
                }
                onChange={(event) =>
                  elegirDeposito(
                    "origen",
                    event.target.value,
                  )
                }
              >
                <option value="">
                  Sin depósito origen
                </option>

                {DEPOSITOS.map(
                  (dep) => (
                    <option
                      key={dep.id}
                      value={dep.id}
                    >
                      {dep.codigo} ·{" "}
                      {dep.nombre}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              <span>
                Depósito destino
                {requiereDestino
                  ? " *"
                  : ""}
              </span>
              <select
                value={
                  form.depositoDestinoId
                }
                onChange={(event) =>
                  elegirDeposito(
                    "destino",
                    event.target.value,
                  )
                }
              >
                <option value="">
                  Sin depósito destino
                </option>

                {DEPOSITOS.map(
                  (dep) => (
                    <option
                      key={dep.id}
                      value={dep.id}
                    >
                      {dep.codigo} ·{" "}
                      {dep.nombre}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>

          {productoSeleccionado?.modoControl ===
          "LOTE" ? (
            <>
              <div className={styles.sectionTitle}>
                Lote y vencimiento
              </div>

              <div className={styles.gridTwo}>
                <label>
                  <span>Lote</span>
                  <input
                    value={form.lote}
                    onChange={(event) =>
                      set(
                        "lote",
                        event.target.value,
                      )
                    }
                  />
                </label>

                <label>
                  <span>
                    Fecha de vencimiento
                  </span>
                  <input
                    type="date"
                    value={
                      form.fechaVencimiento
                    }
                    onChange={(event) =>
                      set(
                        "fechaVencimiento",
                        event.target.value,
                      )
                    }
                  />
                </label>
              </div>
            </>
          ) : null}

          <div className={styles.sectionTitle}>
            Referencia
          </div>

          <div className={styles.gridTwo}>
            <label>
              <span>
                Documento de referencia
              </span>
              <input
                value={
                  form.documentoReferencia
                }
                placeholder="OC-000123 / ENT-000845"
                onChange={(event) =>
                  set(
                    "documentoReferencia",
                    event.target.value,
                  )
                }
              />
            </label>

            <label>
              <span>Motivo</span>
              <input
                value={form.motivo}
                onChange={(event) =>
                  set(
                    "motivo",
                    event.target.value,
                  )
                }
              />
            </label>
          </div>

          <label className={styles.textareaField}>
            <span>Observación</span>
            <textarea
              value={form.observacion}
              onChange={(event) =>
                set(
                  "observacion",
                  event.target.value,
                )
              }
            />
          </label>
        </div>

        <footer className={styles.footer}>
          <div>
            <span>Modo demostración</span>
            <small>
              Al guardar, el stock se
              actualiza en localStorage.
            </small>
          </div>

          <div className={styles.footerActions}>
            <Link
              href="/movimientos"
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
                : "Registrar movimiento"}
            </button>
          </div>
        </footer>
      </form>
    </section>
  );
}