"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  useRouter,
} from "next/navigation";

import {
  cargarCatalogosMovimientos,
  registrarMovimientoApi,
} from "@/lib/movimientos/cliente-api";

import {
  CatalogoMovimientos,
  MovimientoStockOrigen,
  MovimientoStockTipo,
  NuevoMovimientoStock,
} from "@/types/movimientos-stock";

import styles from "./page.module.css";

function today() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function timeNow() {
  return new Date()
    .toTimeString()
    .slice(0, 5);
}

export default function NuevoMovimientoPage() {
  const router = useRouter();

  const [catalogo, setCatalogo] =
    useState<CatalogoMovimientos | null>(null);

  const productos = catalogo?.productos ?? [];

  const depositos = (
    catalogo?.depositos ?? []
  ).filter((dep) => dep.permitido);

  const [form, setForm] =
    useState<NuevoMovimientoStock>({
      tipo: "ENTRADA",
      origen: "MANUAL",
      fecha: today(),
      productoId: "",
      cantidad: 1,
      costoUnitario: null,
      depositoOrigenId: "",
      depositoDestinoId: "",
      lote: "",
      fechaVencimiento: "",
      documentoReferencia: "",
      motivo: "",
      observacion: "",
      claveIdempotencia: "",
    });

  // Clave de idempotencia: se renueva con cada cambio del formulario; un doble clic reenvía la misma y no duplica el movimiento.
  const clave = useRef("");

  const [error, setError] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  useEffect(() => {
    let activo = true;

    cargarCatalogosMovimientos()
      .then((c) => {
        if (activo) setCatalogo(c);
      })
      .catch((e: unknown) => {
        if (activo)
          setError(
            e instanceof Error
              ? e.message
              : "No fue posible cargar los catálogos.",
          );
      });

    return () => {
      activo = false;
    };
  }, []);

  function set<K extends keyof NuevoMovimientoStock>(
    key: K,
    value: NuevoMovimientoStock[K],
  ) {
    clave.current = "";

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

  const requiereCosto =
    [
      "ENTRADA",
      "AJUSTE_POSITIVO",
    ].includes(form.tipo);

  const productoSeleccionado =
    productos.find(
      (item) =>
        item.id === form.productoId,
    );

  // Saldos del depósito relevante (origen, si no destino); sin depósito, el total de la empresa.
  const depositoRef =
    form.depositoOrigenId ||
    form.depositoDestinoId;

  const snapshot = (
    productoSeleccionado?.stock ?? []
  )
    .filter(
      (x) =>
        !depositoRef ||
        x.depositoId === depositoRef,
    )
    .reduce(
      (acc, x) => ({
        disponible: acc.disponible + x.disponible,
        reservado: acc.reservado + x.reservado,
        cuarentena: acc.cuarentena + x.cuarentena,
        transito: acc.transito + x.transito,
      }),
      {
        disponible: 0,
        reservado: 0,
        cuarentena: 0,
        transito: 0,
      },
    );

  // Lotes ya existentes del depósito relevante (sugerencias para elegir el lote).
  const lotesSugeridos = (
    productoSeleccionado?.lotes ?? []
  ).filter(
    (x) =>
      !depositoRef ||
      x.depositoId === depositoRef,
  );

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

    if (
      requiereCosto &&
      (form.costoUnitario === null ||
        form.costoUnitario < 0)
    ) {
      setError(
        "Ingrese el costo unitario de la entrada.",
      );
      return;
    }

    if (
      productoSeleccionado?.modoControl ===
        "LOTE" &&
      !form.lote.trim()
    ) {
      setError(
        "Ingrese el lote del producto.",
      );
      return;
    }

    setSaving(true);

    try {
      if (!clave.current) {
        clave.current = crypto.randomUUID();
      }

      const numero =
        await registrarMovimientoApi({
          ...form,
          claveIdempotencia:
            clave.current,
        });

      router.push(
        `/movimientos?ok=${encodeURIComponent(numero)}`,
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
                value={timeNow()}
                readOnly
                title="La hora la registra el servidor"
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
                  set(
                    "productoId",
                    event.target.value,
                  );
                  set("lote", "");
                  set(
                    "fechaVencimiento",
                    "",
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
                      value={item.id}
                    >
                      {item.codigo} ·{" "}
                      {item.descripcion}
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
                  productoSeleccionado?.unidadMedidaNombre ??
                  ""
                }
                readOnly
              />
            </label>

            {requiereCosto ? (
              <label>
                <span>
                  Costo unitario *{" "}
                  ({catalogo?.monedaBase ?? ""})
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={
                    form.costoUnitario ?? ""
                  }
                  onChange={(event) =>
                    set(
                      "costoUnitario",
                      event.target.value === ""
                        ? null
                        : Number(
                            event.target.value,
                          ),
                    )
                  }
                />
              </label>
            ) : null}
          </div>

          {productoSeleccionado ? (
            <div className={styles.stockSnapshot}>
              <div>
                <span>Disponible</span>
                <strong>
                  {
                    snapshot.disponible
                  }
                </strong>
              </div>

              <div>
                <span>Reservado</span>
                <strong>
                  {
                    snapshot.reservado
                  }
                </strong>
              </div>

              <div>
                <span>Cuarentena</span>
                <strong>
                  {
                    snapshot.cuarentena
                  }
                </strong>
              </div>

              <div>
                <span>Tránsito</span>
                <strong>
                  {
                    snapshot.transito
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
                  set(
                    "depositoOrigenId",
                    event.target.value,
                  )
                }
              >
                <option value="">
                  Sin depósito origen
                </option>

                {depositos.map(
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
                  set(
                    "depositoDestinoId",
                    event.target.value,
                  )
                }
              >
                <option value="">
                  Sin depósito destino
                </option>

                {depositos.map(
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
                  <span>Lote *</span>
                  <input
                    value={form.lote}
                    list="lotes-sugeridos"
                    onChange={(event) =>
                      set(
                        "lote",
                        event.target.value,
                      )
                    }
                  />
                  <datalist id="lotes-sugeridos">
                    {lotesSugeridos.map(
                      (x, i) => (
                        <option
                          key={`${x.codigo}-${x.estado}-${i}`}
                          value={x.codigo}
                        >
                          {x.estado} · {x.cantidad}
                        </option>
                      ),
                    )}
                  </datalist>
                </label>

                {requiereDestino &&
                form.tipo !==
                  "TRANSFERENCIA" ? (
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
                ) : null}
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
            <span>Movimiento de inventario</span>
            <small>
              Al guardar, los saldos y el
              costo se actualizan en la
              base de datos.
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