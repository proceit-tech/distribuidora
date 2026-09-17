import { PRODUCTOS_DEMO_INICIALES } from "@/lib/mocks/productos";
import {
  NuevoProductoDemo,
  ProductoDemo,
} from "@/types/productos";

const STORAGE_KEY = "distribunex.demo.productos.v1";
const FLASH_KEY = "distribunex.demo.productos.flash";

function canUseStorage() {
  return typeof window !== "undefined";
}

function cloneBase(): ProductoDemo[] {
  return PRODUCTOS_DEMO_INICIALES.map((producto) => ({
    ...producto,
    codigos: producto.codigos.map((item) => ({ ...item })),
    unidades: producto.unidades.map((item) => ({ ...item })),
    proveedores: producto.proveedores.map((item) => ({ ...item })),
    depositos: producto.depositos.map((item) => ({ ...item })),
    alternativos: producto.alternativos.map((item) => ({ ...item })),
    componentes: producto.componentes.map((item) => ({ ...item })),
    documentos: producto.documentos.map((item) => ({ ...item })),
  }));
}

function ordenar(productos: ProductoDemo[]) {
  return [...productos].sort((a, b) =>
    b.codigo.localeCompare(a.codigo),
  );
}

export function obtenerProductosDemo(): ProductoDemo[] {
  if (!canUseStorage()) {
    return cloneBase();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    const base = cloneBase();
    guardarProductosDemo(base);
    return ordenar(base);
  }

  try {
    const parsed = JSON.parse(raw) as ProductoDemo[];

    if (!Array.isArray(parsed)) {
      throw new Error("Formato inválido");
    }

    const base = cloneBase();

    const usaMockAnterior =
      parsed.length <= 20 &&
      base.length > parsed.length;

    if (usaMockAnterior) {
      guardarProductosDemo(base);
      return ordenar(base);
    }

    return ordenar(parsed);
  } catch {
    const base = cloneBase();
    guardarProductosDemo(base);
    return ordenar(base);
  }
}

export function guardarProductosDemo(productos: ProductoDemo[]) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(productos),
  );
}

function siguienteCodigo(productos: ProductoDemo[]) {
  const mayor = productos.reduce((actual, producto) => {
    const numero = Number(
      producto.codigo.replace(/\D/g, ""),
    );

    return Number.isFinite(numero)
      ? Math.max(actual, numero)
      : actual;
  }, 0);

  return `PRD-${String(mayor + 1).padStart(6, "0")}`;
}

export function crearProductoDemo(
  payload: NuevoProductoDemo,
): ProductoDemo {
  const productos = obtenerProductosDemo();
  const now = new Date().toISOString();

  const nuevo: ProductoDemo = {
    ...payload,
    id:
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `demo-prod-${Date.now()}`,
    codigo:
      payload.codigo.trim() ||
      siguienteCodigo(productos),
    creadoEn: now,
    actualizadoEn: now,
  };

  guardarProductosDemo([nuevo, ...productos]);

  //setProductoFlash(
  //  `Producto ${nuevo.codigo} registrado correctamente.`,
  //);

  return nuevo;
}

export function actualizarProductoDemo(
  id: string,
  changes: Partial<ProductoDemo>,
): ProductoDemo | null {
  const productos = obtenerProductosDemo();
  let actualizado: ProductoDemo | null = null;

  const next = productos.map((producto) => {
    if (producto.id !== id) {
      return producto;
    }

    actualizado = {
      ...producto,
      ...changes,
      id: producto.id,
      creadoEn: producto.creadoEn,
      actualizadoEn: new Date().toISOString(),
    };

    return actualizado;
  });

  if (!actualizado) {
    return null;
  }

  guardarProductosDemo(next);

 // setProductoFlash(
 //   `Producto ${actualizado.codigo} actualizado correctamente.`,
 // );

  return actualizado;
}

export function buscarProductoDemo(
  id: string,
): ProductoDemo | null {
  return (
    obtenerProductosDemo().find(
      (producto) => producto.id === id,
    ) ?? null
  );
}

export function resetearProductosDemo() {
  const base = cloneBase();
  guardarProductosDemo(base);

 //// setProductoFlash(
  //  "Datos de productos restaurados.",
 // );

  return base;
}

export function setProductoFlash(message: string) {
  if (!canUseStorage()) {
    return;
  }

  window.sessionStorage.setItem(
    FLASH_KEY,
    message,
  );
}

export function consumirProductoFlash() {
  if (!canUseStorage()) {
    return "";
  }

  const message =
    window.sessionStorage.getItem(FLASH_KEY) ?? "";

  if (message) {
    window.sessionStorage.removeItem(FLASH_KEY);
  }

  return message;
}

export function obtenerProveedoresParaProducto() {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(
      "distribunex.demo.proveedores.v1",
    );

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as Array<{
      id: string;
      razonSocial: string;
      codigo: string;
      activo: boolean;
    }>;

    return parsed
      .filter((item) => item && item.activo !== false)
      .map((item) => ({
        id: item.id,
        codigo: item.codigo,
        nombre: item.razonSocial,
      }));
  } catch {
    return [];
  }
}
