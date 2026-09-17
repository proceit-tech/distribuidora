import {
  LISTAS_PRECIO_DEMO_INICIALES,
} from "@/lib/mocks/listas-precio";

import {
  ListaPrecioDemo,
  NuevaListaPrecioDemo,
} from "@/types/lista-precio";

const STORAGE_KEY =
  "distribunex.demo.listas-precio.v1";

const FLASH_KEY =
  "distribunex.demo.listas-precio.flash";

function canUseStorage() {
  return typeof window !== "undefined";
}

function cloneBase(): ListaPrecioDemo[] {
  return LISTAS_PRECIO_DEMO_INICIALES.map(
    (lista) => ({
      ...lista,
      productos: lista.productos.map(
        (producto) => ({
          ...producto,
          escalas: producto.escalas.map(
            (escala) => ({
              ...escala,
            }),
          ),
        }),
      ),
      reglasComerciales:
        lista.reglasComerciales.map(
          (regla) => ({
            ...regla,
          }),
        ),
    }),
  );
}

function ordenar(
  listas: ListaPrecioDemo[],
) {
  return [...listas].sort(
    (a, b) =>
      b.codigo.localeCompare(
        a.codigo,
      ),
  );
}

function normalizarLista(
  lista: ListaPrecioDemo,
): ListaPrecioDemo {
  return {
    ...lista,
    descripcion:
      lista.descripcion ?? "",
    productos:
      Array.isArray(
        lista.productos,
      )
        ? lista.productos.map(
            (producto) => ({
              ...producto,
              escalas:
                Array.isArray(
                  producto.escalas,
                )
                  ? producto.escalas
                  : [],
            }),
          )
        : [],
    reglasComerciales:
      Array.isArray(
        lista.reglasComerciales,
      )
        ? lista.reglasComerciales
        : [],
    observacion:
      lista.observacion ?? "",
  };
}

export function obtenerListasPrecioDemo(): ListaPrecioDemo[] {
  if (!canUseStorage()) {
    return cloneBase();
  }

  const raw =
    window.localStorage.getItem(
      STORAGE_KEY,
    );

  if (!raw) {
    const base = cloneBase();

    guardarListasPrecioDemo(base);

    return ordenar(base);
  }

  try {
    const parsed =
      JSON.parse(raw) as ListaPrecioDemo[];

    if (!Array.isArray(parsed)) {
      throw new Error(
        "Formato inválido",
      );
    }

    return ordenar(
      parsed.map(normalizarLista),
    );
  } catch {
    const base = cloneBase();

    guardarListasPrecioDemo(base);

    return ordenar(base);
  }
}

export function guardarListasPrecioDemo(
  listas: ListaPrecioDemo[],
) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(listas),
  );
}

function siguienteCodigo(
  listas: ListaPrecioDemo[],
) {
  const mayor =
    listas.reduce(
      (actual, lista) => {
        const numero = Number(
          lista.codigo.replace(
            /\D/g,
            "",
          ),
        );

        return Number.isFinite(
          numero,
        )
          ? Math.max(
              actual,
              numero,
            )
          : actual;
      },
      0,
    );

  return `LP-${String(
    mayor + 1,
  ).padStart(3, "0")}`;
}

export function crearListaPrecioDemo(
  payload: NuevaListaPrecioDemo,
): ListaPrecioDemo {
  const listas =
    obtenerListasPrecioDemo();

  const now =
    new Date().toISOString();

  const nueva: ListaPrecioDemo = {
    ...payload,
    id:
      typeof crypto !==
        "undefined" &&
      typeof crypto.randomUUID ===
        "function"
        ? crypto.randomUUID()
        : `lp-demo-${Date.now()}`,
    codigo:
      payload.codigo.trim() ||
      siguienteCodigo(listas),
    creadoEn: now,
    actualizadoEn: now,
  };

  guardarListasPrecioDemo([
    nueva,
    ...listas,
  ]);

 // setListaPrecioFlash(
 //   `Lista ${nueva.codigo} registrada correctamente.`,
//);

  return nueva;
}

export function actualizarListaPrecioDemo(
  id: string,
  changes: Partial<ListaPrecioDemo>,
): ListaPrecioDemo | null {
  const listas =
    obtenerListasPrecioDemo();

  let actualizada:
    | ListaPrecioDemo
    | null = null;

  const next =
    listas.map((lista) => {
      if (lista.id !== id) {
        return lista;
      }

      actualizada = {
        ...lista,
        ...changes,
        id: lista.id,
        creadoEn:
          lista.creadoEn,
        actualizadoEn:
          new Date().toISOString(),
      };

      return actualizada;
    });

  if (!actualizada) {
    return null;
  }

  guardarListasPrecioDemo(next);

  //setListaPrecioFlash(
  //  `Lista ${actualizada.codigo} actualizada correctamente.`,
 // );

  return actualizada;
}

export function buscarListaPrecioDemo(
  id: string,
): ListaPrecioDemo | null {
  return (
    obtenerListasPrecioDemo().find(
      (lista) =>
        lista.id === id,
    ) ?? null
  );
}

export function resetearListasPrecioDemo() {
  const base = cloneBase();

  guardarListasPrecioDemo(base);

  //setListaPrecioFlash(
  //  "Datos de listas de precios restaurados.",
  //);

  return base;
}

export function setListaPrecioFlash(
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

export function consumirListaPrecioFlash() {
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

export function obtenerListasBaseDemo(
  excluirId?: string,
) {
  return obtenerListasPrecioDemo()
    .filter(
      (lista) =>
        lista.id !== excluirId &&
        lista.tipo === "VENTA" &&
        lista.activo,
    )
    .map((lista) => ({
      id: lista.id,
      codigo: lista.codigo,
      nombre: lista.nombre,
      monedaCodigo:
        lista.monedaCodigo,
    }));
}

export function obtenerProductosParaListaPrecio() {
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

    const parsed =
      JSON.parse(raw) as Array<{
        id: string;
        codigo: string;
        descripcion: string;
        unidadMedidaId: string;
        unidadMedidaNombre: string;
        costoPromedio: number;
        activo: boolean;
      }>;

    return parsed
      .filter(
        (producto) =>
          producto &&
          producto.activo !== false,
      )
      .map((producto) => ({
        id: producto.id,
        codigo:
          producto.codigo,
        descripcion:
          producto.descripcion,
        unidadMedidaId:
          producto.unidadMedidaId,
        unidadMedidaNombre:
          producto.unidadMedidaNombre,
        costoPromedio:
          Number(
            producto.costoPromedio ??
              0,
          ),
      }));
  } catch {
    return [];
  }
}

export function obtenerClientesParaListaPrecio() {
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

    const parsed =
      JSON.parse(raw) as Array<{
        id: string;
        codigo: string;
        razonSocial: string;
        activo: boolean;
      }>;

    return parsed
      .filter(
        (cliente) =>
          cliente &&
          cliente.activo !== false,
      )
      .map((cliente) => ({
        id: cliente.id,
        codigo:
          cliente.codigo,
        nombre:
          cliente.razonSocial,
      }));
  } catch {
    return [];
  }
}
