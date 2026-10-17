/** Estado de las líneas de la pantalla de NCE (puro, probado sin navegador). */
export type EntradaLinea = { incluida: boolean; valor: string };
export type LineaConSaldo = { linea: number; agotada: boolean; cantidadDisponible: string };

/**
 * Control del listado de facturas (R05-02): recuerda el filtro REALMENTE aplicado (cliente, búsqueda, página) y numera cada petición. Una respuesta solo se aplica si su token sigue vigente; así una
 * búsqueda nueva descarta los resultados tardíos de un filtro anterior (ya sean de una búsqueda manual o del refresco automático) y el refresco siempre relee con el filtro actual.
 */
export type FiltroListado = { clienteId: string; q: string; pagina: number };

export function crearControlListado(inicial: FiltroListado) {
  let filtro = inicial;
  let n = 0;

  return {
    /** Registra un filtro nuevo (búsqueda manual, cambio de página o de cliente) e invalida cualquier petición anterior. */
    aplicar(f: FiltroListado): number { filtro = f; n += 1; return n; },
    /** Filtro vigente y su token, para el refresco automático. */
    leer(): { filtro: FiltroListado; token: number } { return { filtro, token: n }; },
    vigente(token: number): boolean { return token === n; },
  };
}

/** Etiqueta de tributación de una línea (afectación IVA 1 gravado, 2 exonerado, 3 exento, 4 gravado parcial; tasa 0/5/10; proporción en %). */
export function etiquetaIvaLinea(afectacion: number, tasa: number, proporcion: string | null): string {
  if (afectacion === 1) return `Gravado ${tasa}%`;
  if (afectacion === 2) return "Exonerado";
  if (afectacion === 3) return "Exento";
  if (afectacion === 4) return `Gravado parcial ${tasa}%${proporcion ? ` (prop. ${proporcion}%)` : ""}`;

  return "—";
}

/**
 * Estado inicial de las líneas según el motivo (NCE-R01-02): Devolución arranca con TODAS las líneas con saldo incluidas y su cantidad disponible como valor real (se pueden quitar o reducir);
 * las agotadas quedan fuera. Los motivos 3/4/8 arrancan vacíos: no se heredan valores de otro sentido al cambiar de motivo.
 */
export function entradasIniciales(lineas: readonly LineaConSaldo[], motivo: number | ""): Record<number, EntradaLinea> {
  const r: Record<number, EntradaLinea> = {};

  for (const l of lineas) r[l.linea] = motivo === 2 && !l.agotada ? { incluida: true, valor: l.cantidadDisponible } : { incluida: false, valor: "" };

  return r;
}
