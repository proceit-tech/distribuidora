import { PROVEEDORES_DEMO_INICIALES } from "@/lib/mocks/proveedores";
import {
  NuevoProveedorDemo,
  ProveedorDemo,
} from "@/types/proveedores";

const STORAGE_KEY = "distribunex.demo.proveedores.v1";
const FLASH_KEY = "distribunex.demo.proveedores.flash";

function canUseStorage() {
  return typeof window !== "undefined";
}

function cloneBase(): ProveedorDemo[] {
  return PROVEEDORES_DEMO_INICIALES.map((proveedor) => ({
    ...proveedor,
    contactos: proveedor.contactos.map((item) => ({
      ...item,
    })),
    direcciones: proveedor.direcciones.map((item) => ({
      ...item,
    })),
    cuentasBancarias: proveedor.cuentasBancarias.map((item) => ({
      ...item,
    })),
    retenciones: proveedor.retenciones.map((item) => ({
      ...item,
    })),
    documentos: proveedor.documentos.map((item) => ({
      ...item,
    })),
  }));
}

function ordenar(proveedores: ProveedorDemo[]) {
  return [...proveedores].sort((a, b) =>
    b.codigo.localeCompare(a.codigo),
  );
}

export function obtenerProveedoresDemo(): ProveedorDemo[] {
  if (!canUseStorage()) {
    return cloneBase();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    const base = cloneBase();

    guardarProveedoresDemo(base);

    return ordenar(base);
  }

  try {
    const parsed = JSON.parse(raw) as ProveedorDemo[];

    if (!Array.isArray(parsed)) {
      throw new Error("Formato inválido");
    }

    return ordenar(parsed);
  } catch {
    const base = cloneBase();

    guardarProveedoresDemo(base);

    return ordenar(base);
  }
}

export function guardarProveedoresDemo(
  proveedores: ProveedorDemo[],
) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(proveedores),
  );
}

function siguienteCodigo(
  proveedores: ProveedorDemo[],
) {
  const mayor = proveedores.reduce(
    (actual, proveedor) => {
      const numero = Number(
        proveedor.codigo.replace(/\D/g, ""),
      );

      if (!Number.isFinite(numero)) {
        return actual;
      }

      return Math.max(actual, numero);
    },
    0,
  );

  return `PRV-${String(mayor + 1).padStart(6, "0")}`;
}

export function crearProveedorDemo(
  payload: NuevoProveedorDemo,
): ProveedorDemo {
  const proveedores = obtenerProveedoresDemo();
  const now = new Date().toISOString();

  const nuevo: ProveedorDemo = {
    ...payload,
    id:
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `demo-prv-${Date.now()}`,
    codigo: siguienteCodigo(proveedores),
    creadoEn: now,
    actualizadoEn: now,
  };

  guardarProveedoresDemo([
    nuevo,
    ...proveedores,
  ]);

 //setProveedorFlash(
 //   `Proveedor ${nuevo.codigo} registrado correctamente.`,
 // );

  return nuevo;
}

export function actualizarProveedorDemo(
  id: string,
  changes: Partial<ProveedorDemo>,
): ProveedorDemo | null {
  const proveedores = obtenerProveedoresDemo();

  let actualizado: ProveedorDemo | null = null;

  const next = proveedores.map((proveedor) => {
    if (proveedor.id !== id) {
      return proveedor;
    }

    actualizado = {
      ...proveedor,
      ...changes,
      id: proveedor.id,
      codigo: proveedor.codigo,
      creadoEn: proveedor.creadoEn,
      actualizadoEn: new Date().toISOString(),
    };

    return actualizado;
  });

  if (!actualizado) {
    return null;
  }

  guardarProveedoresDemo(next);

  //setProveedorFlash(
  //  `Proveedor ${actualizado.codigo} actualizado correctamente.`,
  //);

  return actualizado;
}

export function buscarProveedorDemo(
  id: string,
): ProveedorDemo | null {
  return (
    obtenerProveedoresDemo().find(
      (proveedor) => proveedor.id === id,
    ) ?? null
  );
}

export function resetearProveedoresDemo(): ProveedorDemo[] {
  const base = cloneBase();

  guardarProveedoresDemo(base);

  //setProveedorFlash(
  //  "Datos de proveedores restaurados.",
  //);

  return base;
}

export function setProveedorFlash(
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

export function consumirProveedorFlash() {
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