/** Estado de las líneas de la pantalla de NCE (puro, probado sin navegador). */
export type EntradaLinea = { incluida: boolean; valor: string };
export type LineaConSaldo = { linea: number; agotada: boolean; cantidadDisponible: string };

/**
 * Estado inicial de las líneas según el motivo (NCE-R01-02): Devolución arranca con TODAS las líneas con saldo incluidas y su cantidad disponible como valor real (se pueden quitar o reducir);
 * las agotadas quedan fuera. Los motivos 3/4/8 arrancan vacíos: no se heredan valores de otro sentido al cambiar de motivo.
 */
export function entradasIniciales(lineas: readonly LineaConSaldo[], motivo: number | ""): Record<number, EntradaLinea> {
  const r: Record<number, EntradaLinea> = {};

  for (const l of lineas) r[l.linea] = motivo === 2 && !l.agotada ? { incluida: true, valor: l.cantidadDisponible } : { incluida: false, valor: "" };

  return r;
}
