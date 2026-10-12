/**
 * Reposición: PLANIFICACIÓN (solo sugerencias; nada se graba ni se ejecuta). Política explícita:
 *
 *  · Alcance de los parámetros. Los parámetros por depósito (producto_deposito_configuracion) se comparan con el saldo de ESE depósito; los del
 *    producto (stock mínimo / punto / máximo) son globales y se comparan con el saldo CONSOLIDADO de los depósitos visibles. Nunca se mezclan.
 *  · Posición = DISPONIBLE propio. RESERVADO ya es un estado aparte (no se resta de nuevo); CUARENTENA no es vendible (no cuenta); TRÁNSITO no
 *    confirmado NO cuenta por defecto (opción «considerar tránsito»; decisión de negocio pendiente). Los saldos de terceros no participan.
 *  · Necesita reposición si hay parámetros y: posición ≤ punto de reposición (si hay), o posición < mínimo (si hay), o posición ≤ 0.
 *  · Cantidad sugerida: hasta el máximo (máximo − posición); si no hay máximo, la «cantidad de reposición» del depósito; si tampoco, sin sugerencia
 *    y se avisa (no se inventa una meta).
 *  · Transferencia primero (solo en filas por depósito): otros depósitos visibles ceden su disponible por encima de su propio punto/mínimo.
 *    El resto se sugiere como compra. Nunca se transfiere ni se compra automáticamente.
 */

export type Criticidad = "SIN_PARAMETROS" | "OK" | "EN_PUNTO" | "BAJO_MINIMO" | "SIN_STOCK";

export type Parametros = { minimo: number | null; punto: number | null; maximo: number | null; cantidadReposicion: number | null };

export type OtroDeposito = { id: string; nombre: string; disponible: number; minimo: number | null; punto: number | null };

export type EntradaReposicion = {
  clave: string;
  ambito: "DEPOSITO" | "CONSOLIDADO";
  productoId: string;
  productoCodigo: string;
  productoDescripcion: string;
  marca: string;
  unidad: string;
  depositoId: string | null;
  depositoNombre: string;
  saldo: { disponible: number; reservado: number; cuarentena: number; transito: number };
  parametros: Parametros;
  otrosDepositos: OtroDeposito[];
  proveedorPrincipal: { nombre: string; plazoDias: number | null; cantidadMinimaCompra: number | null } | null;
};

export type Transferencia = { depositoId: string; depositoNombre: string; cantidad: number; origenSinParametros: boolean };

export type FilaReposicion = EntradaReposicion & {
  posicion: number;
  criticidad: Criticidad;
  necesita: boolean;
  /** null = hay necesidad pero no hay meta definida (sin máximo ni cantidad de reposición). */
  sugerida: number | null;
  transferencias: Transferencia[];
  sugeridaTransferencia: number;
  sugeridaCompra: number | null;
  advertencias: string[];
};

const positivo = (n: number | null): number => (n !== null && Number.isFinite(n) && n > 0 ? n : 0);
const redondear = (n: number) => Math.round(n * 10000) / 10000;

export function calcularReposicion(e: EntradaReposicion, opciones: { incluirTransito: boolean }): FilaReposicion {
  const minimo = positivo(e.parametros.minimo);
  const punto = positivo(e.parametros.punto);
  const maximo = positivo(e.parametros.maximo);
  const reposicion = positivo(e.parametros.cantidadReposicion);
  const posicion = redondear(e.saldo.disponible + (opciones.incluirTransito ? e.saldo.transito : 0));
  const advertencias: string[] = [];

  const base = { ...e, posicion, transferencias: [] as Transferencia[], sugeridaTransferencia: 0 };

  if (minimo === 0 && punto === 0 && maximo === 0) {
    return { ...base, criticidad: "SIN_PARAMETROS", necesita: false, sugerida: 0, sugeridaCompra: 0, advertencias: ["Sin mínimo, punto de reposición ni máximo configurados: no se sugiere reposición."] };
  }

  if (maximo > 0 && minimo > maximo) advertencias.push("El mínimo es mayor que el máximo.");
  if (maximo > 0 && punto > maximo) advertencias.push("El punto de reposición es mayor que el máximo.");
  if (minimo > 0 && punto > 0 && punto < minimo) advertencias.push("El punto de reposición es menor que el mínimo.");

  const criticidad: Criticidad = posicion <= 0 ? "SIN_STOCK" : minimo > 0 && posicion < minimo ? "BAJO_MINIMO" : punto > 0 && posicion <= punto ? "EN_PUNTO" : "OK";
  const necesita = criticidad !== "OK";

  if (!necesita) return { ...base, criticidad, necesita, sugerida: 0, sugeridaCompra: 0, advertencias };

  let sugerida: number | null;

  if (maximo > 0) sugerida = redondear(Math.max(0, maximo - posicion));
  else if (reposicion > 0) sugerida = reposicion;
  else {
    sugerida = null;
    advertencias.push("Hay necesidad pero no hay máximo ni cantidad de reposición: defina la meta para obtener una cantidad sugerida.");
  }

  // Transferencias desde otros depósitos visibles (solo con parámetros propios del depósito; el producto consolidado ya suma todos).
  const transferencias: Transferencia[] = [];
  let pendiente = sugerida ?? 0;

  if (e.ambito === "DEPOSITO" && pendiente > 0) {
    const candidatos = e.otrosDepositos
      .map((o) => {
        const reserva = Math.max(positivo(o.punto), positivo(o.minimo));

        return { o, transferible: redondear(Math.max(0, o.disponible - reserva)), sinParametros: reserva === 0 };
      })
      .filter((c) => c.transferible > 0)
      .sort((a, b) => b.transferible - a.transferible);

    for (const c of candidatos) {
      if (pendiente <= 0) break;

      const cantidad = redondear(Math.min(pendiente, c.transferible));

      transferencias.push({ depositoId: c.o.id, depositoNombre: c.o.nombre, cantidad, origenSinParametros: c.sinParametros });
      pendiente = redondear(pendiente - cantidad);
    }
  }

  const sugeridaTransferencia = redondear(transferencias.reduce((a, t) => a + t.cantidad, 0));

  return {
    ...base,
    criticidad,
    necesita,
    sugerida,
    transferencias,
    sugeridaTransferencia,
    sugeridaCompra: sugerida === null ? null : redondear(sugerida - sugeridaTransferencia),
    advertencias,
  };
}

/** Orden por urgencia: sin stock, bajo mínimo, en punto, resto; y mayor cantidad sugerida primero. */
const PESO: Record<Criticidad, number> = { SIN_STOCK: 0, BAJO_MINIMO: 1, EN_PUNTO: 2, OK: 3, SIN_PARAMETROS: 4 };

export function compararUrgencia(a: FilaReposicion, b: FilaReposicion): number {
  return PESO[a.criticidad] - PESO[b.criticidad] || (b.sugerida ?? 0) - (a.sugerida ?? 0) || a.productoDescripcion.localeCompare(b.productoDescripcion, "es");
}
