/**
 * Cantidades de Movimientos de stock (E4 / PRO-295) en es-PY: miles con punto, decimales con coma, hasta 4 decimales (escala de
 * `movimiento_lineas.cantidad numeric(18,4)`) y sin ceros finales: 1.0000 → «1», 2.5000 → «2,5», 0.0001 → «0,0001», -1.2500 → «-1,25».
 * Solo presentación: no redondea a entero ni altera el valor recibido. Helper propio de Movimientos para no cambiar `formatearCantidad`
 * (lib/formato/listas.ts), que comparten Productos, Stock y Reposición con 2 decimales.
 */
const cantidad = new Intl.NumberFormat("es-PY", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

export function formatearCantidadMovimiento(valor: number): string {
  // Un valor ausente o no numérico no se presenta como dato real.
  if (typeof valor !== "number" || !Number.isFinite(valor)) return "—";

  const texto = cantidad.format(valor);

  // Un cero negativo (p. ej. -0 o -0,00001) no muestra signo.
  return texto === "-0" ? "0" : texto;
}
