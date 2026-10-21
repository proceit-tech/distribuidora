/**
 * Definiciones únicas de Stock (cliente, servidor y pruebas):
 *  · físico = DISPONIBLE + RESERVADO + CUARENTENA; virtual = físico + TRÁNSITO (todo PROPIO; los saldos de terceros se informan aparte);
 *  · nivel: SIN_STOCK si no hay disponible; BAJO si hay mínimo y disponible < mínimo; SOBRESTOCK si hay máximo y físico > máximo.
 * La vista por depósito recalcula TODO (cantidades, valor a costo, valor de venta de referencia, terceros, parámetros y nivel) con los datos
 * del depósito elegido; nunca mezcla el saldo consolidado con el de un depósito.
 */
import { compararDecimales, dividirDecimales, multiplicarDecimales } from "@/lib/inventario/decimal";
import type { StockItem, StockNivel } from "@/types/stock";

/** Costo unitario = valor / cantidad valorizada, decimal exacto con 4 posiciones (misma regla que Valorización: round half-up). null si no hay cantidad valorizada o los textos no son numéricos. */
export function costoUnitarioTexto(valor: string | null | undefined, cantidad: string | null | undefined): string | null {
  if (compararDecimales(cantidad, "0") <= 0 || cantidad == null || valor == null) return null;

  return dividirDecimales(valor, cantidad, 4);
}

export function clasificarNivel(p: { disponible: number; totalFisico: number; minimo: number; maximo: number }): StockNivel {
  if (p.disponible <= 0) return "SIN_STOCK";
  if (p.minimo > 0 && p.disponible < p.minimo) return "BAJO";
  if (p.maximo > 0 && p.totalFisico > p.maximo) return "SOBRESTOCK";

  return "NORMAL";
}

/**
 * Producto visto desde UN depósito. Los parámetros mínimo/máximo/punto son los configurados para ese depósito (producto_deposito_configuracion);
 * si no hay, quedan en 0 (los del producto son globales y no se comparan con el saldo de un solo depósito). null si el producto no tiene saldo en él.
 */
export function vistaPorDeposito(item: StockItem, depositoId: string): StockItem | null {
  if (depositoId === "TODOS") return item;

  const d = item.depositos.find((x) => x.depositoId === depositoId);

  if (!d) return null;

  const totalFisico = d.disponible + d.reservado + d.cuarentena;
  const propios = totalFisico + d.transito;
  const minimo = d.stockMinimo ?? 0;
  const maximo = d.stockMaximo ?? 0;

  return {
    ...item,
    disponible: d.disponible,
    reservado: d.reservado,
    cuarentena: d.cuarentena,
    transito: d.transito,
    totalFisico,
    totalVirtual: totalFisico + d.transito,
    terceros: d.terceros,
    propiedad: propios === 0 && d.terceros > 0 ? "TERCERO" : "PROPIO",
    stockMinimo: minimo,
    stockMaximo: maximo,
    puntoReposicion: d.puntoReposicion ?? 0,
    nivel: clasificarNivel({ disponible: d.disponible, totalFisico, minimo, maximo }),
    valorInventario: d.costoValor,
    valorInventarioTexto: d.costoValorTexto,
    costoPromedioTexto: costoUnitarioTexto(d.costoValorTexto, d.costoCantidadTexto),
    valorVentaReferencia: item.precioVentaReferencia === null ? null : item.precioVentaReferencia * d.disponible,
    valorVentaReferenciaTexto: item.precioVentaReferenciaTexto === null ? null : multiplicarDecimales(item.precioVentaReferenciaTexto, d.disponibleTexto),
    depositos: [d],
    lotes: item.lotes.filter((l) => l.depositoId === depositoId),
  };
}

/**
 * C24 / STK-D01 — alcance del usuario sobre los depósitos. Define cómo se lee «Sin stock»: con alcance COMPLETO es ausencia de disponibilidad en los depósitos de la empresa; con PARCIAL solo en los depósitos
 * autorizados (nunca se presenta como total empresarial); SIN_DEPOSITOS = la persona no tiene ningún depósito autorizado (no hay saldos que informar: los indicadores no son «cero» real).
 */
export type AlcanceStock = "COMPLETO" | "PARCIAL" | "SIN_DEPOSITOS";

/** `restringido`: el usuario se evalúa por usuario_deposito; `permitidos`/`total`: depósitos autorizados y depósitos de la empresa. */
export function alcanceDeStock(restringido: boolean, permitidos: number, total: number): AlcanceStock {
  if (!restringido) return "COMPLETO";
  if (permitidos === 0 && total > 0) return "SIN_DEPOSITOS";

  return permitidos < total ? "PARCIAL" : "COMPLETO";
}

/** Etiqueta del nivel según el alcance: «Sin stock» solo es literal con alcance completo. */
export function etiquetaNivel(nivel: StockNivel, alcance: AlcanceStock): string {
  if (nivel !== "SIN_STOCK") return ETIQUETA_NIVEL[nivel];
  if (alcance === "SIN_DEPOSITOS") return "Sin acceso a depósitos";
  if (alcance === "PARCIAL") return "Sin disponible en depósitos autorizados";

  return ETIQUETA_NIVEL.SIN_STOCK;
}

/** Texto de apoyo del indicador «Sin stock» (la cifra cuenta exactamente los productos mostrados). */
export function descripcionSinStock(alcance: AlcanceStock): string {
  if (alcance === "SIN_DEPOSITOS") return "Sin depósitos autorizados: no hay saldos que informar";
  if (alcance === "PARCIAL") return "Sin disponible en sus depósitos autorizados";

  return "Saldo disponible cero";
}

/**
 * PRO-180: con un depósito elegido la indisponibilidad se refiere SOLO a ese depósito («Sin disponible en este depósito»); con la visión consolidada (TODOS) rige la semántica de alcance (etiquetaNivel).
 */
export function etiquetaNivelVista(nivel: StockNivel, alcance: AlcanceStock, depositoElegido: boolean): string {
  return depositoElegido && nivel === "SIN_STOCK" ? "Sin disponible en este depósito" : etiquetaNivel(nivel, alcance);
}

export function descripcionSinStockVista(alcance: AlcanceStock, depositoElegido: boolean): string {
  return depositoElegido ? "Sin disponible en este depósito" : descripcionSinStock(alcance);
}

/**
 * PRO-181: sin ningún depósito autorizado no hay consulta real de saldos; cantidades y valores derivados del stock se presentan como «—», nunca como un cero que parezca real. Con depósitos autorizados un saldo
 * cero SÍ se muestra como 0. Solo presentación: los datos no se tocan. El precio de referencia cadastral NO depende de esto (no es un valor calculado sobre el stock).
 */
export const sinAccesoADepositos = (alcance: AlcanceStock) => alcance === "SIN_DEPOSITOS";

export function textoCantidad(valor: number | null | undefined, alcance: AlcanceStock, formatear: (n: number) => string): string {
  return sinAccesoADepositos(alcance) || valor === null || valor === undefined ? "—" : formatear(valor);
}

/** Importe derivado del saldo (costo, valor a costo, valor de venta del disponible): «—» sin acceso a depósitos o sin dato. */
export function textoImporteDeStock(texto: string | null | undefined, alcance: AlcanceStock, formatear: (t: string) => string): string {
  return sinAccesoADepositos(alcance) || texto === null || texto === undefined ? "—" : formatear(texto);
}

export type ResumenStock = { sku: number; disponible: number; stockBajo: number; sinStock: number; valorCosto: number; valorVenta: number; sinPrecio: number };

/** Indicadores de la portada de Stock (D-INV-02): solo SKU, Disponible, Sin stock y Bajo mínimo. Valorización y totales monetarios pertenecen a Reportes y a la ficha. */
export type IndicadoresStock = Pick<ResumenStock, "sku" | "disponible" | "sinStock" | "stockBajo">;

export const indicadoresStock = (items: StockItem[]): IndicadoresStock => {
  const { sku, disponible, sinStock, stockBajo } = resumenStock(items);

  return { sku, disponible, sinStock, stockBajo };
};

/** Etiquetas únicas del nivel de Stock (INV-01): «Bajo mínimo» no es «Necesita reposición» (eso lo decide Reposición con el punto de reposición). */
export const ETIQUETA_NIVEL: Record<StockNivel, string> = { NORMAL: "Normal", BAJO: "Bajo mínimo", SIN_STOCK: "Sin stock", SOBRESTOCK: "Sobrestock" };

/** SOLO conteos para los indicadores (indicadoresStock). Los campos monetarios (Number) son legados de prueba: NO son un total financiero oficial; la valorización exacta está en Reportes y los importes exactos en `*Texto`. Tarjetas de resumen: mismas definiciones que las filas (valor a costo = inventario_costos; venta = referencia × disponible; sin precio no suma). */
export function resumenStock(items: StockItem[]): ResumenStock {
  return items.reduce<ResumenStock>(
    (a, i) => ({
      sku: a.sku + 1,
      disponible: a.disponible + Number(i.disponible || 0),
      stockBajo: a.stockBajo + (i.nivel === "BAJO" ? 1 : 0),
      sinStock: a.sinStock + (i.nivel === "SIN_STOCK" ? 1 : 0),
      valorCosto: a.valorCosto + Number(i.valorInventario || 0),
      valorVenta: a.valorVenta + Number(i.valorVentaReferencia ?? 0),
      sinPrecio: a.sinPrecio + (i.precioVentaReferencia === null && i.disponible > 0 ? 1 : 0),
    }),
    { sku: 0, disponible: 0, stockBajo: 0, sinStock: 0, valorCosto: 0, valorVenta: 0, sinPrecio: 0 },
  );
}
