/**
 * Definiciones únicas de Stock (cliente, servidor y pruebas):
 *  · físico = DISPONIBLE + RESERVADO + CUARENTENA; virtual = físico + TRÁNSITO (todo PROPIO; los saldos de terceros se informan aparte);
 *  · nivel: SIN_STOCK si no hay disponible; BAJO si hay mínimo y disponible < mínimo; SOBRESTOCK si hay máximo y físico > máximo.
 * La vista por depósito recalcula TODO (cantidades, valor a costo, valor de venta de referencia, terceros, parámetros y nivel) con los datos
 * del depósito elegido; nunca mezcla el saldo consolidado con el de un depósito.
 */
import type { StockItem, StockNivel } from "@/types/stock";

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
    costoPromedio: d.costoCantidad > 0 ? Math.round((d.costoValor / d.costoCantidad) * 10000) / 10000 : null,
    valorVentaReferencia: item.precioVentaReferencia === null ? null : item.precioVentaReferencia * d.disponible,
    depositos: [d],
    lotes: item.lotes.filter((l) => l.depositoId === depositoId),
  };
}

export type ResumenStock = { sku: number; disponible: number; stockBajo: number; sinStock: number; valorCosto: number; valorVenta: number; sinPrecio: number };

/** Tarjetas de resumen: mismas definiciones que las filas (valor a costo = inventario_costos; venta = referencia × disponible; sin precio no suma). */
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
