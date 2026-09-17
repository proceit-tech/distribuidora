import { CLIENTES_DEMO_INICIALES } from "@/lib/mocks/clientes";
import type {
  ClienteDemo,
  NuevoClienteDemo,
} from "@/types/clientes";

const STORAGE_KEY = "distribunex.demo.clientes.v1";
const FLASH_KEY = "distribunex.demo.clientes.flash";

function canUseStorage() {
  return typeof window !== "undefined";
}

function cloneBase() {
  return CLIENTES_DEMO_INICIALES.map((cliente) => ({
    ...cliente,
    diasEntrega: [...cliente.diasEntrega],
  }));
}

function ordenar(clientes: ClienteDemo[]) {
  return [...clientes].sort((a, b) =>
    b.codigo.localeCompare(a.codigo),
  );
}

export function obtenerClientesDemo(): ClienteDemo[] {
  if (!canUseStorage()) {
    return cloneBase();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    const base = cloneBase();

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(base),
    );

    return ordenar(base);
  }

  try {
    const parsed = JSON.parse(raw) as ClienteDemo[];

    if (!Array.isArray(parsed)) {
      throw new Error("Formato inválido");
    }

    return ordenar(parsed);
  } catch {
    const base = cloneBase();

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(base),
    );

    return ordenar(base);
  }
}

export function guardarClientesDemo(
  clientes: ClienteDemo[],
) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(clientes),
  );
}

function siguienteCodigo(
  clientes: ClienteDemo[],
) {
  const mayor = clientes.reduce(
    (actual, cliente) => {
      const numero = Number(
        cliente.codigo.replace(/\D/g, ""),
      );

      return Number.isFinite(numero)
        ? Math.max(actual, numero)
        : actual;
    },
    0,
  );

  return `CLI-${String(mayor + 1).padStart(6, "0")}`;
}

export function crearClienteDemo(
  payload: NuevoClienteDemo,
): ClienteDemo {
  const clientes = obtenerClientesDemo();
  const now = new Date().toISOString();

  const nuevo: ClienteDemo = {
    ...payload,
    id:
      typeof crypto !== "undefined" &&
      "randomUUID" in crypto
        ? crypto.randomUUID()
        : `demo-${Date.now()}`,
    codigo: siguienteCodigo(clientes),
    creadoEn: now,
    actualizadoEn: now,
  };

  guardarClientesDemo([
    nuevo,
    ...clientes,
  ]);

  setClienteFlash(
    `Cliente ${nuevo.codigo} registrado correctamente.`,
  );

  return nuevo;
}

export function actualizarClienteDemo(
  id: string,
  changes: Partial<ClienteDemo>,
): ClienteDemo | null {
  const clientes = obtenerClientesDemo();

  const indice = clientes.findIndex(
    (cliente) => cliente.id === id,
  );

  if (indice === -1) {
    return null;
  }

  const clienteActual = clientes[indice];

  const actualizado: ClienteDemo = {
    ...clienteActual,
    ...changes,
    id: clienteActual.id,
    codigo: clienteActual.codigo,
    creadoEn: clienteActual.creadoEn,
    actualizadoEn: new Date().toISOString(),
  };

  const next = [...clientes];

  next[indice] = actualizado;

  guardarClientesDemo(next);

 // setClienteFlash(
 //   `Cliente ${actualizado.codigo} actualizado correctamente.`,
 // );

  return actualizado;
}

export function buscarClienteDemo(
  id: string,
) {
  return (
    obtenerClientesDemo().find(
      (cliente) => cliente.id === id,
    ) ?? null
  );
}

export function resetearClientesDemo() {
  const base = cloneBase();

  guardarClientesDemo(base);

  setClienteFlash(
    "Datos de demostración restaurados.",
  );

  return base;
}

export function setClienteFlash(
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

export function consumirClienteFlash() {
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