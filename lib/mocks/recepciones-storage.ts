import {
  RECEPCIONES_DEMO_INICIALES,
} from "@/lib/mocks/recepciones";

import {
  crearMovimientoStockDemo,
} from "@/lib/mocks/movimientos-stock-storage";

import {
  obtenerProductosDemo,
} from "@/lib/mocks/productos-storage";

import {
  NuevaRecepcionDemo,
  RecepcionDemo,
} from "@/types/recepciones";

const STORAGE_KEY =
  "distribunex.demo.recepciones.v1";

const FLASH_KEY =
  "distribunex.demo.recepciones.flash";

function canUseStorage() {
  return typeof window !== "undefined";
}

function cloneBase(): RecepcionDemo[] {
  return RECEPCIONES_DEMO_INICIALES.map(
    (recepcion) => ({
      ...recepcion,
      items: recepcion.items.map(
        (item) => ({
          ...item,
        }),
      ),
    }),
  );
}

export function obtenerRecepcionesDemo(): RecepcionDemo[] {
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
      JSON.parse(raw) as RecepcionDemo[];

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

function guardarRecepciones(
  recepciones: RecepcionDemo[],
) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(recepciones),
  );
}

function siguienteNumero(
  recepciones: RecepcionDemo[],
) {
  const mayor = recepciones.reduce(
    (actual, recepcion) => {
      const numero = Number(
        recepcion.numero.replace(
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

  return `REC-${String(
    mayor + 1,
  ).padStart(6, "0")}`;
}

export function crearRecepcionDemo(
  payload: NuevaRecepcionDemo,
): RecepcionDemo {
  const recepciones =
    obtenerRecepcionesDemo();

  if (
    payload.items.length === 0
  ) {
    throw new Error(
      "Agregue al menos un producto.",
    );
  }

  const items =
    payload.items.map((item) => ({
      ...item,
      cantidadPendiente:
        Math.max(
          0,
          Number(
            item.cantidadOrdenada || 0,
          ) -
            Number(
              item.cantidadRecibida || 0,
            ),
        ),
      subtotal:
        Number(
          item.cantidadRecibida || 0,
        ) *
        Number(
          item.costoUnitario || 0,
        ),
    }));

  if (
    items.some(
      (item) =>
        item.cantidadRecibida <= 0,
    )
  ) {
    throw new Error(
      "La cantidad recibida debe ser mayor que cero.",
    );
  }

  const totalUnidades =
    items.reduce(
      (sum, item) =>
        sum +
        Number(
          item.cantidadRecibida ||
            0,
        ),
      0,
    );

  const totalCosto =
    items.reduce(
      (sum, item) =>
        sum +
        Number(
          item.subtotal || 0,
        ),
      0,
    );

  const nueva: RecepcionDemo = {
    ...payload,
    items,
    id:
      typeof crypto !==
        "undefined" &&
      typeof crypto.randomUUID ===
        "function"
        ? crypto.randomUUID()
        : `rec-${Date.now()}`,
    numero:
      siguienteNumero(
        recepciones,
      ),
    estado: "RECIBIDA",
    totalUnidades,
    totalCosto,
    creadoEn:
      new Date().toISOString(),
  };

  items.forEach((item) => {
    crearMovimientoStockDemo({
      tipo: "ENTRADA",
      origen: "COMPRA",
      fecha: payload.fecha,
      hora: payload.hora,
      productoId:
        item.productoId,
      productoCodigo:
        item.productoCodigo,
      productoDescripcion:
        item.productoDescripcion,
      unidadMedidaNombre:
        item.unidadMedidaNombre,
      depositoOrigenId: "",
      depositoOrigenCodigo: "",
      depositoOrigenNombre: "",
      depositoDestinoId:
        payload.depositoId,
      depositoDestinoCodigo:
        payload.depositoCodigo,
      depositoDestinoNombre:
        payload.depositoNombre,
      cantidad:
        item.cantidadRecibida,
      lote: item.lote,
      fechaVencimiento:
        item.fechaVencimiento,
      propiedad: "PROPIO",
      propietarioId: "",
      propietarioNombre:
        "CASA MINGO S.A.",
      documentoReferencia:
        nueva.numero,
      motivo:
        `Recepción de compra ${payload.ordenCompraNumero || ""}`.trim(),
      observacion:
        payload.observacion,
      usuario: payload.usuario,
    });
  });

  guardarRecepciones([
    nueva,
    ...recepciones,
  ]);

  setRecepcionFlash(
    `Recepción ${nueva.numero} registrada y stock actualizado.`,
  );

  return nueva;
}

export function buscarRecepcionDemo(
  id: string,
): RecepcionDemo | null {
  return (
    obtenerRecepcionesDemo().find(
      (item) => item.id === id,
    ) ?? null
  );
}

export function setRecepcionFlash(
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

export function consumirRecepcionFlash() {
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

export function obtenerProductosParaRecepcion() {
  return obtenerProductosDemo()
    .filter(
      (producto) =>
        producto.tipoProducto ===
          "MERCADERIA" &&
        producto.activo !== false,
    )
    .map((producto) => ({
      id: producto.id,
      codigo: producto.codigo,
      codigoInventario:
        producto.codigoInventario ??
        "",
      descripcion:
        producto.descripcion,
      unidadMedidaNombre:
        producto.unidadMedidaNombre ||
        "Unidad",
      costoPromedio:
        Number(
          producto.costoPromedio ||
            0,
        ),
      precioVentaReferencia:
        Number(
          producto.precioVentaReferencia ||
            0,
        ),
      modoControlStock:
        producto.modoControlStock,
    }));
}

export function obtenerProveedoresParaRecepcion() {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw =
      window.localStorage.getItem(
        "distribunex.demo.proveedores.v1",
      );

    if (!raw) {
      return [];
    }

    const parsed =
      JSON.parse(raw) as Array<{
        id: string;
        codigo: string;
        nombre: string;
        razonSocial?: string;
        activo?: boolean;
      }>;

    return parsed
      .filter(
        (item) =>
          item.activo !== false,
      )
      .map((item) => ({
        id: item.id,
        codigo: item.codigo,
        nombre:
          item.nombre ||
          item.razonSocial ||
          "",
      }));
  } catch {
    return [];
  }
}