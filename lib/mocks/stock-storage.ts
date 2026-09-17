import {
  STOCK_DEMO_INICIAL,
} from "@/lib/mocks/stock";

import {
  StockDemo,
} from "@/types/stock";

const STORAGE_KEY =
  "distribunex.demo.stock.v1";

function canUseStorage() {
  return typeof window !== "undefined";
}

function cloneBase(): StockDemo[] {
  return STOCK_DEMO_INICIAL.map(
    (item) => ({
      ...item,
      depositos:
        item.depositos.map(
          (deposito) => ({
            ...deposito,
          }),
        ),
      lotes:
        item.lotes.map(
          (lote) => ({
            ...lote,
          }),
        ),
    }),
  );
}

export function obtenerStockDemo(): StockDemo[] {
  if (!canUseStorage()) {
    return cloneBase();
  }

  const raw =
    window.localStorage.getItem(
      STORAGE_KEY,
    );

  if (!raw) {
    const base = cloneBase();

    guardarStockDemo(base);

    return base;
  }

  try {
    const parsed =
      JSON.parse(raw) as StockDemo[];

    if (!Array.isArray(parsed)) {
      throw new Error(
        "Formato inválido",
      );
    }

    const base = cloneBase();

    const usaMockAnterior =
      parsed.length <= 20 &&
      base.length > parsed.length;

    if (usaMockAnterior) {
      guardarStockDemo(base);
      return base;
    }

    return parsed;
  } catch {
    const base = cloneBase();

    guardarStockDemo(base);

    return base;
  }
}

export function guardarStockDemo(
  stock: StockDemo[],
) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(stock),
  );
}

export function buscarStockDemo(
  id: string,
): StockDemo | null {
  return (
    obtenerStockDemo().find(
      (item) => item.id === id,
    ) ?? null
  );
}

export function resetearStockDemo() {
  const base = cloneBase();

  guardarStockDemo(base);

  return base;
}
