import {
  MOVIMIENTOS_STOCK_DEMO_INICIALES,
} from "@/lib/mocks/movimientos-stock";

import {
  obtenerStockDemo,
  guardarStockDemo,
} from "@/lib/mocks/stock-storage";

import {
  MovimientoStockDemo,
  NuevoMovimientoStockDemo,
} from "@/types/movimientos-stock";

import {
  StockDemo,
  StockNivel,
} from "@/types/stock";

const STORAGE_KEY =
  "distribunex.demo.movimientos-stock.v1";

const FLASH_KEY =
  "distribunex.demo.movimientos-stock.flash";

function canUseStorage() {
  return typeof window !== "undefined";
}

function cloneBase() {
  return MOVIMIENTOS_STOCK_DEMO_INICIALES.map(
    (item) => ({ ...item }),
  );
}

function calcularNivel(
  disponible: number,
  minimo: number,
  maximo: number,
): StockNivel {
  if (disponible <= 0) {
    return "SIN_STOCK";
  }

  if (disponible <= minimo) {
    return "BAJO";
  }

  if (
    maximo > 0 &&
    disponible > maximo
  ) {
    return "SOBRESTOCK";
  }

  return "NORMAL";
}

export function obtenerMovimientosStockDemo(): MovimientoStockDemo[] {
  if (!canUseStorage()) {
    return cloneBase();
  }

  const raw =
    window.localStorage.getItem(
      STORAGE_KEY,
    );

  if (!raw) {
    const base = cloneBase();

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(base),
    );

    return base;
  }

  try {
    const parsed =
      JSON.parse(raw) as MovimientoStockDemo[];

    if (!Array.isArray(parsed)) {
      throw new Error(
        "Formato inválido",
      );
    }

    return [...parsed].sort(
      (a, b) =>
        b.creadoEn.localeCompare(
          a.creadoEn,
        ),
    );
  } catch {
    const base = cloneBase();

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(base),
    );

    return base;
  }
}

function guardarMovimientos(
  movimientos: MovimientoStockDemo[],
) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(movimientos),
  );
}

function siguienteNumero(
  movimientos: MovimientoStockDemo[],
) {
  const mayor = movimientos.reduce(
    (actual, movimiento) => {
      const numero = Number(
        movimiento.numero.replace(
          /\D/g,
          "",
        ),
      );

      return Number.isFinite(numero)
        ? Math.max(actual, numero)
        : actual;
    },
    0,
  );

  return `MOV-${String(
    mayor + 1,
  ).padStart(6, "0")}`;
}

function recalcular(
  item: StockDemo,
): StockDemo {
  const totalFisico =
    item.disponible +
    item.reservado +
    item.cuarentena;

  const totalVirtual =
    totalFisico +
    item.transito;

  return {
    ...item,
    totalFisico,
    totalVirtual,
    valorInventario:
      totalFisico *
      item.costoPromedio,
    nivel: calcularNivel(
      item.disponible,
      item.stockMinimo,
      item.stockMaximo,
    ),
    actualizadoEn:
      new Date().toISOString(),
  };
}

function aplicarMovimientoAStock(
  movimiento: MovimientoStockDemo,
) {
  const stock =
    obtenerStockDemo();

  const index =
    stock.findIndex(
      (item) =>
        item.productoId ===
        movimiento.productoId,
    );

  if (index < 0) {
    throw new Error(
      "El producto no existe en el stock demo.",
    );
  }

  const current =
    stock[index];

  let updated: StockDemo = {
    ...current,
    depositos:
      current.depositos.map(
        (item) => ({
          ...item,
        }),
      ),
    lotes:
      current.lotes.map(
        (item) => ({
          ...item,
        }),
      ),
  };

  const cantidad =
    movimiento.cantidad;

  if (
    movimiento.tipo ===
    "ENTRADA"
  ) {
    updated.disponible +=
      cantidad;

    if (
      movimiento.depositoDestinoId
    ) {
      updated.depositos =
        updated.depositos.map(
          (dep) =>
            dep.depositoId ===
            movimiento.depositoDestinoId
              ? {
                  ...dep,
                  disponible:
                    dep.disponible +
                    cantidad,
                  totalFisico:
                    dep.totalFisico +
                    cantidad,
                }
              : dep,
        );
    }

    if (
      movimiento.lote &&
      updated.modoControl ===
        "LOTE"
    ) {
      const loteExistente =
        updated.lotes.find(
          (lote) =>
            lote.lote ===
            movimiento.lote,
        );

      if (loteExistente) {
        updated.lotes =
          updated.lotes.map(
            (lote) =>
              lote.id ===
              loteExistente.id
                ? {
                    ...lote,
                    cantidad:
                      lote.cantidad +
                      cantidad,
                  }
                : lote,
          );
      } else {
        updated.lotes = [
          ...updated.lotes,
          {
            id:
              typeof crypto !==
                "undefined" &&
              typeof crypto.randomUUID ===
                "function"
                ? crypto.randomUUID()
                : `lote-${Date.now()}`,
            lote:
              movimiento.lote,
            fechaVencimiento:
              movimiento.fechaVencimiento,
            cantidad,
            estado:
              "DISPONIBLE",
            ubicacion:
              movimiento.depositoDestinoNombre ||
              "Depósito",
            propietario:
              movimiento.propietarioNombre,
          },
        ];
      }
    }
  }

  if (
    movimiento.tipo ===
    "SALIDA"
  ) {
    if (
      updated.disponible <
      cantidad
    ) {
      throw new Error(
        "Stock disponible insuficiente para la salida.",
      );
    }

    updated.disponible -=
      cantidad;

    if (
      movimiento.depositoOrigenId
    ) {
      updated.depositos =
        updated.depositos.map(
          (dep) =>
            dep.depositoId ===
            movimiento.depositoOrigenId
              ? {
                  ...dep,
                  disponible:
                    Math.max(
                      0,
                      dep.disponible -
                        cantidad,
                    ),
                  totalFisico:
                    Math.max(
                      0,
                      dep.totalFisico -
                        cantidad,
                    ),
                }
              : dep,
        );
    }
  }

  if (
    movimiento.tipo ===
    "AJUSTE_POSITIVO"
  ) {
    updated.disponible +=
      cantidad;
  }

  if (
    movimiento.tipo ===
    "AJUSTE_NEGATIVO"
  ) {
    if (
      updated.disponible <
      cantidad
    ) {
      throw new Error(
        "Stock insuficiente para el ajuste negativo.",
      );
    }

    updated.disponible -=
      cantidad;
  }

  if (
    movimiento.tipo ===
    "RESERVA"
  ) {
    if (
      updated.disponible <
      cantidad
    ) {
      throw new Error(
        "Stock disponible insuficiente para reservar.",
      );
    }

    updated.disponible -=
      cantidad;
    updated.reservado +=
      cantidad;
  }

  if (
    movimiento.tipo ===
    "LIBERACION_RESERVA"
  ) {
    if (
      updated.reservado <
      cantidad
    ) {
      throw new Error(
        "La cantidad supera el stock reservado.",
      );
    }

    updated.reservado -=
      cantidad;
    updated.disponible +=
      cantidad;
  }

  if (
    movimiento.tipo ===
    "CUARENTENA"
  ) {
    if (
      updated.disponible <
      cantidad
    ) {
      throw new Error(
        "Stock disponible insuficiente para enviar a cuarentena.",
      );
    }

    updated.disponible -=
      cantidad;
    updated.cuarentena +=
      cantidad;
  }

  if (
    movimiento.tipo ===
    "LIBERACION_CUARENTENA"
  ) {
    if (
      updated.cuarentena <
      cantidad
    ) {
      throw new Error(
        "La cantidad supera el stock en cuarentena.",
      );
    }

    updated.cuarentena -=
      cantidad;
    updated.disponible +=
      cantidad;
  }

  if (
    movimiento.tipo ===
    "TRANSFERENCIA"
  ) {
    if (
      !movimiento.depositoOrigenId ||
      !movimiento.depositoDestinoId
    ) {
      throw new Error(
        "Seleccione depósito origen y destino.",
      );
    }

    const origen =
      updated.depositos.find(
        (dep) =>
          dep.depositoId ===
          movimiento.depositoOrigenId,
      );

    if (
      !origen ||
      origen.disponible <
        cantidad
    ) {
      throw new Error(
        "Stock insuficiente en el depósito origen.",
      );
    }

    updated.depositos =
      updated.depositos.map(
        (dep) => {
          if (
            dep.depositoId ===
            movimiento.depositoOrigenId
          ) {
            return {
              ...dep,
              disponible:
                dep.disponible -
                cantidad,
              totalFisico:
                dep.totalFisico -
                cantidad,
            };
          }

          if (
            dep.depositoId ===
            movimiento.depositoDestinoId
          ) {
            return {
              ...dep,
              disponible:
                dep.disponible +
                cantidad,
              totalFisico:
                dep.totalFisico +
                cantidad,
            };
          }

          return dep;
        },
      );
  }

  updated =
    recalcular(updated);

  stock[index] = updated;

  guardarStockDemo(stock);
}

export function crearMovimientoStockDemo(
  payload: NuevoMovimientoStockDemo,
): MovimientoStockDemo {
  const movimientos =
    obtenerMovimientosStockDemo();

  const nuevo:
    MovimientoStockDemo = {
    ...payload,
    id:
      typeof crypto !==
        "undefined" &&
      typeof crypto.randomUUID ===
        "function"
        ? crypto.randomUUID()
        : `mov-${Date.now()}`,
    numero:
      siguienteNumero(
        movimientos,
      ),
    estado: "REGISTRADO",
    creadoEn:
      new Date().toISOString(),
  };

  aplicarMovimientoAStock(
    nuevo,
  );

  guardarMovimientos([
    nuevo,
    ...movimientos,
  ]);

  setMovimientoStockFlash(
    `Movimiento ${nuevo.numero} registrado correctamente.`,
  );

  return nuevo;
}

export function buscarMovimientoStockDemo(
  id: string,
): MovimientoStockDemo | null {
  return (
    obtenerMovimientosStockDemo().find(
      (item) => item.id === id,
    ) ?? null
  );
}

export function setMovimientoStockFlash(
  message: string,
) {
  if (!canUseStorage()) {
    return;
  }

  window.sessionStorage.setItem(
    FLASH_KEY,
    message,
  );
}

export function consumirMovimientoStockFlash() {
  if (!canUseStorage()) {
    return "";
  }

  const message =
    window.sessionStorage.getItem(
      FLASH_KEY,
    ) ?? "";

  if (message) {
    window.sessionStorage.removeItem(
      FLASH_KEY,
    );
  }

  return message;
}