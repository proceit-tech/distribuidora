import {
  FACTURAS_DEMO_INICIALES,
} from "@/lib/mocks/facturas";

import {
  FacturaDemo,
  FacturaItem,
  FacturaTotales,
  NuevaFacturaDemo,
} from "@/types/facturas";

const STORAGE_KEY =
  "distribunex.demo.facturas.v1";

const FLASH_KEY =
  "distribunex.demo.facturas.flash";

function canUseStorage() {
  return typeof window !== "undefined";
}

function cloneBase(): FacturaDemo[] {
  return FACTURAS_DEMO_INICIALES.map(
    (factura) => ({
      ...factura,
      cliente: { ...factura.cliente },
      exportacion: { ...factura.exportacion },
      contratacionPublica: { ...factura.contratacionPublica },
      items: factura.items.map((item) => ({ ...item })),
      formaPago: { ...factura.formaPago },
      totales: { ...factura.totales },
    }),
  );
}

export function calcularTotalesFactura(
  items: FacturaItem[],
): FacturaTotales {
  let subtotalExento = 0;
  let subtotal5 = 0;
  let subtotal10 = 0;

  items.forEach((item) => {
    if (
      item.afectacionIva === "EXENTO" ||
      item.porcentajeIva === 0
    ) {
      subtotalExento += item.subtotal;
    } else if (item.porcentajeIva === 5) {
      subtotal5 += item.subtotal;
    } else {
      subtotal10 += item.subtotal;
    }
  });

  const baseGravada5 =
    subtotal5 > 0
      ? Math.round(subtotal5 / 1.05)
      : 0;

  const baseGravada10 =
    subtotal10 > 0
      ? Math.round(subtotal10 / 1.10)
      : 0;

  const iva5 =
    subtotal5 - baseGravada5;

  const iva10 =
    subtotal10 - baseGravada10;

  const totalOperacion =
    subtotalExento +
    subtotal5 +
    subtotal10;

  return {
    subtotalExento,
    subtotal5,
    subtotal10,
    totalOperacion,
    iva5,
    iva10,
    liquidacionIva5: iva5,
    liquidacionIva10: iva10,
    totalIva: iva5 + iva10,
    baseGravada5,
    baseGravada10,
    totalBaseGravadaIva:
      baseGravada5 + baseGravada10,
    totalGeneral: totalOperacion,
  };
}

export function obtenerFacturasDemo(): FacturaDemo[] {
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
      JSON.parse(raw) as FacturaDemo[];

    if (!Array.isArray(parsed)) {
      throw new Error("Formato inválido");
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

function siguienteNumero(
  facturas: FacturaDemo[],
) {
  const mayor = facturas.reduce(
    (actual, factura) => {
      const numero = Number(
        factura.numeroInterno.replace(
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

  return `FAC-${String(
    mayor + 1,
  ).padStart(6, "0")}`;
}

function siguienteSecuencia(
  facturas: FacturaDemo[],
) {
  const mayor = facturas.reduce(
    (actual, factura) => {
      const numero = Number(
        factura.numeroSecuencia,
      );

      return Number.isFinite(numero)
        ? Math.max(actual, numero)
        : actual;
    },
    0,
  );

  return String(mayor + 1).padStart(7, "0");
}

export function crearFacturaDemo(
  payload: NuevaFacturaDemo,
): FacturaDemo {
  const facturas =
    obtenerFacturasDemo();

  const now =
    new Date().toISOString();

  const secuencia =
    payload.numeroSecuencia ||
    siguienteSecuencia(facturas);

  const nueva: FacturaDemo = {
    ...payload,
    id:
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `fac-${Date.now()}`,
    numeroInterno:
      siguienteNumero(facturas),
    numeroSecuencia: secuencia,
    estado: "APROBADA",
    cdc:
      `01800033140001${payload.puntoExpedicion.padStart(3, "0")}${secuencia.padStart(7, "0")}${payload.fechaEmision.replaceAll("-", "")}12345678901`,
    mensajeSifen:
      "Documento aprobado",
    creadoEn: now,
    actualizadoEn: now,
  };

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify([
      nueva,
      ...facturas,
    ]),
  );

  setFacturaFlash(
    `Factura ${nueva.numeroInterno} emitida correctamente.`,
  );

  return nueva;
}

export function buscarFacturaDemo(
  id: string,
): FacturaDemo | null {
  return (
    obtenerFacturasDemo().find(
      (factura) =>
        factura.id === id,
    ) ?? null
  );
}

export function setFacturaFlash(
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

export function consumirFacturaFlash() {
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

export function obtenerClientesParaFactura() {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw =
      window.localStorage.getItem(
        "distribunex.demo.clientes.v1",
      );

    if (!raw) {
      return [];
    }

    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function obtenerProductosParaFactura() {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw =
      window.localStorage.getItem(
        "distribunex.demo.productos.v1",
      );

    if (!raw) {
      return [];
    }

    return JSON.parse(raw);
  } catch {
    return [];
  }
}