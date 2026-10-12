/**
 * Motor de cálculo fiscal de la Factura Electrónica (puro, sin base de datos). Aritmética decimal EXACTA con BigInt a escala 10^-8 (los campos del DE
 * admiten hasta 8 decimales: 1-15p(0-8)); nunca float. Fórmulas del Manual Técnico SIFEN v150 y de la Nota Técnica 13:
 *   E727 dTotBruOpeItem = E721 × E711                       (precio con impuestos incluidos × cantidad)
 *   EA008 dTotOpeItem   = E727                              (sin descuentos ni anticipos en esta etapa)
 *   E735 dBasGravIVA    = 100 × EA008 × E733 / (10000 + E734 × E733)       (E731 = 1 o 4; 0 si 2 o 3)
 *   E736 dLiqIVAItem    = E735 × E734 / 100
 *   E737 dBasExe        = 100 × EA008 × (100 − E733) / (10000 + E734 × E733)   (solo E731 = 4)
 *   F002 dSubExe = Σ EA008 (E731=3) + Σ E737 (E731=4);  F003 dSubExo = Σ EA008 (E731=2)
 *   F004 dSub5 / F005 dSub10 = Σ EA008 (E731=1) + Σ (E735+E736) (E731=4), por tasa
 *   F008 dTotOpe = F002+F003+F004+F005;  F014 dTotGralOpe = F008 − redondeo (0);  F015/F016 = Σ E736 por tasa;  F017 dTotIVA = F015+F016;
 *   F018/F019 = Σ E735 por tasa;  F020 dTBasGraIVA = F018+F019.
 * Redondeo: cada valor por ítem se redondea a 8 decimales (mitad hacia arriba) antes de sumar, lo que reproduce el ejemplo conocido del gateway
 * (3 ítems por 24.600 + 24.600 + 58.100 al 10 % → dTotIVA 9754.54545454). Es una regla de cálculo verificable, NO una afirmación de que SIFEN la exija así.
 */

const ESCALA = 8;
/** El proyecto compila a ES2017: sin literales bigint ni operador **; BigInt se crea con B(). */
export const B = (n: number): bigint => BigInt(n);
export const S = B(Math.pow(10, ESCALA));

export type Dec = bigint;
export type AfectacionIva = 1 | 2 | 3 | 4;
export type TasaIva = 0 | 5 | 10;

/** Texto decimal → Dec. null si no es un número no negativo con a lo sumo `maxDec` decimales. */
export function parseDec(texto: unknown, maxDec = ESCALA): Dec | null {
  const t = typeof texto === "number" && Number.isFinite(texto) ? String(texto) : typeof texto === "string" ? texto.trim() : "";
  const m = /^(\d{1,15})(?:\.(\d{1,8}))?$/.exec(t);

  if (!m || (m[2]?.length ?? 0) > maxDec) return null;

  return BigInt(m[1]) * S + BigInt((m[2] ?? "").padEnd(ESCALA, "0"));
}

/** Dec → texto con los decimales significativos (sin ceros finales). */
export function textoDec(d: Dec): string {
  const entero = d / S;
  const frac = (d % S).toString().padStart(ESCALA, "0").replace(/0+$/, "");

  return frac ? `${entero}.${frac}` : `${entero}`;
}

/** Dec → número JSON (los importes realistas caben sin pérdida: ≤ 15 dígitos significativos). */
export const numeroDec = (d: Dec): number => Number(textoDec(d));

/** División entera con redondeo mitad hacia arriba (valores no negativos). */
const divRedondeo = (num: bigint, den: bigint): bigint => (num + den / B(2)) / den;

export type EntradaItem = {
  cantidad: Dec; // E711, hasta 4 decimales
  precioUnitario: Dec; // E721, impuestos incluidos
  afectacion: AfectacionIva; // E731
  tasa: TasaIva; // E734
  proporcion: Dec; // E733 (100 para gravado, 0 para exonerado/exento, x para parcial), en porcentaje
};

export type ResultadoItem = { totBruto: Dec; totOperacion: Dec; baseGravada: Dec; liquidacion: Dec; baseExenta: Dec };

export function calcularItem(i: EntradaItem): ResultadoItem {
  const totBruto = divRedondeo(i.cantidad * i.precioUnitario, S);
  const totOperacion = totBruto;
  const gravado = i.afectacion === 1 || i.afectacion === 4;
  const P = i.proporcion;
  const den = B(10000) * S + BigInt(i.tasa) * P;
  const baseGravada = gravado ? divRedondeo(B(100) * totOperacion * P, den) : B(0);
  const liquidacion = gravado ? divRedondeo(baseGravada * BigInt(i.tasa), B(100)) : B(0);
  const baseExenta = i.afectacion === 4 ? divRedondeo(B(100) * totOperacion * (B(100) * S - P), den) : B(0);

  return { totBruto, totOperacion, baseGravada, liquidacion, baseExenta };
}

export type Subtotales = {
  dSubExe: Dec; dSubExo: Dec; dSub5: Dec; dSub10: Dec; dTotOpe: Dec; dTotGralOpe: Dec;
  dIVA5: Dec; dIVA10: Dec; dTotIVA: Dec; dBaseGrav5: Dec; dBaseGrav10: Dec; dTBasGraIVA: Dec; dTotalGs: Dec;
};

export function calcularSubtotales(items: Array<{ entrada: EntradaItem; resultado: ResultadoItem }>): Subtotales {
  let exe = B(0), exo = B(0), s5 = B(0), s10 = B(0), iva5 = B(0), iva10 = B(0), b5 = B(0), b10 = B(0);

  for (const { entrada: e, resultado: r } of items) {
    if (e.afectacion === 3) exe += r.totOperacion;
    else if (e.afectacion === 2) exo += r.totOperacion;
    else if (e.afectacion === 1) {
      if (e.tasa === 5) s5 += r.totOperacion;
      else s10 += r.totOperacion;
    } else {
      exe += r.baseExenta;
      if (e.tasa === 5) s5 += r.baseGravada + r.liquidacion;
      else s10 += r.baseGravada + r.liquidacion;
    }
    if (e.afectacion === 1 || e.afectacion === 4) {
      if (e.tasa === 5) { iva5 += r.liquidacion; b5 += r.baseGravada; }
      else { iva10 += r.liquidacion; b10 += r.baseGravada; }
    }
  }

  const total = exe + exo + s5 + s10;

  return { dSubExe: exe, dSubExo: exo, dSub5: s5, dSub10: s10, dTotOpe: total, dTotGralOpe: total, dIVA5: iva5, dIVA10: iva10, dTotIVA: iva5 + iva10, dBaseGrav5: b5, dBaseGrav10: b10, dTBasGraIVA: b5 + b10, dTotalGs: total };
}
