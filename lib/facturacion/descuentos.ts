/**
 * E03 (PRO-200 / PRO-124) — descuentos de la Factura Electrónica por ítem y generales, % o monto, según el Manual Técnico SIFEN v150 y la Nota Técnica 1 (fórmulas leídas del MT/NT del repositorio):
 *   EA002 dDescItem    descuento PARTICULAR por UNIDAD (impuestos incluidos); EA003 dPorcDesIt = EA002 × 100 / E721 (variación admitida 0,8; 0 si no hay descuento).
 *   EA004 dDescGloItem descuento GLOBAL por unidad, aplicado a CADA ítem SIN prorrateo e independientemente del descuento particular: EA004 = F010 × E721 / 100 (NT 1; variación admitida 0,8).
 *   F010  dPorcDescTotal porcentaje de descuento global (informativo).
 *   EA008 dTotOpeItem  = (E721 − EA002 − EA004) × E711.   F009 = Σ EA002 × E711;  F033 = Σ EA004 × E711;  F011 = F009 + F033;  F014 = F008 − F013 + F025 (F008 ya es neto).
 * Los dos descuentos se combinan (se suman por unidad). El descuento general es siempre un PORCENTAJE sobre el precio unitario (F010): si el operador lo ingresa en monto, se convierte a F010 = monto × 100 / Σ(E721 × E711)
 * y se reparte EXACTAMENTE por unidad (resolución de 4 decimales, restos por mayor fracción) para que Σ EA004 × E711 sea el monto ingresado; si no hay reparto exacto con las cantidades dadas, se rechaza (nunca se redondea el total).
 * Aritmética Decimal (BigInt a escala 10^-8, la del motor fiscal): sin Number. Un descuento no puede dejar el precio neto de un ítem en cero o menos.
 */
import { B, S, parseDec, type Dec } from "@/lib/facturacion/calculo";

export type ModoDescuento = "PORCENTAJE" | "MONTO";
export type DescuentoEntrada = { modo: ModoDescuento; valor: string };

export type DescuentoItemResuelto = { descItem: Dec; porcItem: Dec; descGlobal: Dec };
export type ResolucionDescuentos = {
  /** ¿Hay algún descuento en el documento? (entonces el payload informa EA002/EA003/EA004 en TODOS los ítems, con 0 donde no hay). */
  hay: boolean;
  porItem: DescuentoItemResuelto[];
  /** F010 (porcentaje de descuento global). 0 sin descuento general. */
  porcGlobal: Dec;
  errores: string[];
};

const PASO4 = B(10000); // 10^-4 en la escala interna 10^-8
const CIEN = B(100);
/** División entera con redondeo mitad hacia arriba (valores no negativos). */
const divR = (num: bigint, den: bigint): bigint => (num + den / B(2)) / den;
const redondear4 = (d: Dec): Dec => divR(d, PASO4) * PASO4;

export const MODOS_DESCUENTO: Record<ModoDescuento, string> = { PORCENTAJE: "%", MONTO: "Monto" };

/** Forma del descuento recibido (null = sin descuento). Devuelve string con el error si el valor no es un número válido. */
export function leerDescuento(d: unknown): DescuentoEntrada | null | string {
  if (d === undefined || d === null) return null;
  if (typeof d !== "object" || Array.isArray(d)) return "El descuento no es válido.";

  const { modo, valor } = d as { modo?: unknown; valor?: unknown };

  if (modo !== "PORCENTAJE" && modo !== "MONTO") return "El tipo de descuento debe ser porcentaje o monto.";
  if (typeof valor !== "string" || valor.length > 25) return "El valor del descuento no es válido.";

  const v = valor.trim().replace(",", ".");

  if (v === "") return null;

  return { modo, valor: v };
}

/** Valor Decimal del descuento (hasta 4 decimales, mayor que cero). null = vacío/cero (sin descuento). string = error. */
function valorDe(d: DescuentoEntrada | null | undefined, etiqueta: string): Dec | null | string {
  if (!d || d.valor.trim() === "") return null;

  const v = parseDec(d.valor.trim().replace(",", "."), 4);

  if (v === null) return `${etiqueta}: el valor debe ser un número no negativo con hasta 4 decimales.`;
  if (v === B(0)) return null;
  if (d.modo === "PORCENTAJE" && v >= CIEN * S) return `${etiqueta}: el porcentaje debe ser menor que 100.`;

  return v;
}

export type ItemDescuento = { cantidad: Dec; precio: Dec; descuento?: DescuentoEntrada | null };

/** Resuelve los descuentos de todos los ítems. No muta nada. Los errores traen el número de ítem (1-based) o «General». */
export function resolverDescuentos(items: ItemDescuento[], general?: DescuentoEntrada | null): ResolucionDescuentos {
  const errores: string[] = [];
  const porItem: DescuentoItemResuelto[] = items.map(() => ({ descItem: B(0), porcItem: B(0), descGlobal: B(0) }));
  let hay = false;

  // 1) Descuento particular (EA002/EA003) por ítem.
  items.forEach((it, idx) => {
    const v = valorDe(it.descuento, `Ítem ${idx + 1}`);

    if (typeof v === "string") { errores.push(v); return; }
    if (v === null) return;

    hay = true;
    if (it.descuento?.modo === "PORCENTAJE") {
      const desc = redondear4(divR(it.precio * v, CIEN * S));

      porItem[idx].descItem = desc;
      porItem[idx].porcItem = v;
    } else {
      porItem[idx].descItem = v;
      porItem[idx].porcItem = divR(v * CIEN * S, it.precio);
    }
    if (porItem[idx].descItem <= B(0)) errores.push(`Ítem ${idx + 1}: el descuento es demasiado pequeño para el precio (menos de 0,0001 por unidad).`);
    if (porItem[idx].descItem >= it.precio) errores.push(`Ítem ${idx + 1}: el descuento no puede ser igual ni mayor que el precio unitario.`);
  });

  // 2) Descuento general (F010 / EA004).
  let porcGlobal = B(0);
  const g = valorDe(general, "Descuento general");

  if (typeof g === "string") errores.push(g);
  else if (g !== null && items.length > 0) {
    hay = true;
    if (general?.modo === "PORCENTAJE") {
      porcGlobal = g;
      items.forEach((it, idx) => { porItem[idx].descGlobal = redondear4(divR(it.precio * g, CIEN * S)); });
    } else {
      // Monto → F010 = monto × 100 / Σ(E721 × E711) y reparto exacto por unidad (resolución 10^-4).
      const bruto = items.reduce((a, it) => a + divR(it.cantidad * it.precio, S), B(0));

      if (bruto <= B(0)) errores.push("Descuento general: la factura no tiene un total sobre el cual descontar.");
      else if (g >= bruto) errores.push("Descuento general: el monto no puede ser igual ni mayor que el total de la factura (antes de descuentos).");
      else {
        porcGlobal = divR(g * CIEN * S, bruto);

        // X_i = unidades de 10^-4 por unidad de ítem; Q_i = cantidad en unidades de 10^-4; el total descontado (escala interna) es Σ X_i × Q_i.
        const Q = items.map((it) => it.cantidad / PASO4);
        const ideal = items.map((it) => (it.precio * g) / bruto); // por unidad, escala interna (se trunca más abajo)
        const X = ideal.map((x) => x / PASO4);
        let resto = g - X.reduce((a, x, i) => a + x * Q[i], B(0));
        const orden = items.map((_, i) => i).sort((a, b) => {
          const fa = ideal[a] - X[a] * PASO4;
          const fb = ideal[b] - X[b] * PASO4;

          return fa === fb ? a - b : fa > fb ? -1 : 1;
        });
        let vueltas = 0;

        while (resto > B(0) && vueltas < 10000) {
          let avanzo = false;

          for (const i of orden) {
            if (Q[i] > B(0) && Q[i] <= resto) { X[i] += B(1); resto -= Q[i]; avanzo = true; if (resto === B(0)) break; }
          }
          vueltas += 1;
          if (!avanzo) break;
        }
        if (resto !== B(0)) errores.push("Descuento general: el monto no se puede repartir exactamente entre los ítems con sus cantidades. Use otro monto o un porcentaje.");
        else {
          items.forEach((_, idx) => { porItem[idx].descGlobal = X[idx] * PASO4; });
          // NT 1: |EA004 − F010 × E721 / 100| ≤ 0,8 (variación admitida por el validador de SIFEN).
          const tolerancia = B(8) * S / B(10);

          items.forEach((it, idx) => {
            const esperado = divR(porcGlobal * it.precio, CIEN * S);
            const dif = porItem[idx].descGlobal > esperado ? porItem[idx].descGlobal - esperado : esperado - porItem[idx].descGlobal;

            if (dif > tolerancia) errores.push(`Descuento general: el reparto en el ítem ${idx + 1} se aparta del porcentaje informado más de lo admitido por SIFEN. Use un porcentaje.`);
          });
        }
      }
    }
  }
  if (g !== null && typeof g !== "string" && items.length === 0) errores.push("Descuento general: agregue ítems antes de descontar.");

  // 3) El precio neto de cada ítem debe seguir siendo positivo con ambos descuentos combinados.
  items.forEach((it, idx) => {
    if (it.precio - porItem[idx].descItem - porItem[idx].descGlobal <= B(0)) errores.push(`Ítem ${idx + 1}: los descuentos (particular y general) no pueden dejar el precio en cero o negativo.`);
  });

  return { hay, porItem, porcGlobal, errores: [...new Set(errores)] };
}
