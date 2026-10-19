/**
 * CLI-D06 — un solo domicilio fiscal y coherencia `tipo` ⇄ `esFiscal` en TODAS las direcciones (el servicio calcula fiscal = esFiscal || tipo === "FISCAL", rechaza más de una y NEX-005 impone
 * tipo = FISCAL ⇒ es_fiscal). Funciones puras, la misma política del alta: la dirección que deja de ser fiscal y era de tipo FISCAL pasa a COMERCIAL; los demás tipos y campos no se tocan.
 */
export type DireccionFiscal = { tipo: string; esFiscal: boolean };

/** Elige el TIPO de la dirección `objetivo`. Con FISCAL: esa es la única fiscal (las demás pierden la marca y las de tipo FISCAL pasan a COMERCIAL). */
export function cambiarTipoDireccion<T extends DireccionFiscal>(lista: readonly T[], esObjetivo: (d: T) => boolean, tipo: string): T[] {
  return lista.map((d) => {
    if (esObjetivo(d)) return { ...d, tipo, esFiscal: tipo === "FISCAL" ? true : d.tipo === "FISCAL" ? false : d.esFiscal };
    if (tipo !== "FISCAL") return d;

    return { ...d, esFiscal: false, tipo: d.tipo === "FISCAL" ? "COMERCIAL" : d.tipo };
  });
}

/** Marca/desmarca «Dirección fiscal» de la dirección `objetivo`. Al marcar, las demás pierden la condición fiscal; al desmarcar una de tipo FISCAL, su tipo pasa a COMERCIAL. */
export function marcarDireccionFiscal<T extends DireccionFiscal>(lista: readonly T[], esObjetivo: (d: T) => boolean, marcado: boolean): T[] {
  return lista.map((d) => {
    if (esObjetivo(d)) return { ...d, esFiscal: marcado, tipo: !marcado && d.tipo === "FISCAL" ? "COMERCIAL" : d.tipo };
    if (!marcado) return d;

    return { ...d, esFiscal: false, tipo: d.tipo === "FISCAL" ? "COMERCIAL" : d.tipo };
  });
}

/** Cantidad de direcciones fiscales con el mismo criterio del servicio. */
export const contarFiscales = (lista: readonly DireccionFiscal[]) => lista.filter((d) => d.esFiscal || d.tipo === "FISCAL").length;
