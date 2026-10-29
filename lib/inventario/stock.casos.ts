/**
 * Inventario — Stock (INV-01/02/03/04, ORDEM-IMPLEMENTACAO-INVENTARIO §2.A). Sin PostgreSQL ni navegador: helpers decimales, lectura con conexión simulada y análisis del código.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { normalizarPermisosMovimientos, puedeAbrirNuevoMovimiento, puedeVerMovimientos } from "@/lib/inventario/acceso";
import { formatearMontoTexto, multiplicarDecimales, redondearDecimal, sumarDecimales } from "@/lib/inventario/decimal";
import { leerStock } from "@/lib/stock/shared";
import type { StockItem } from "@/types/stock";
import { ETIQUETA_NIVEL, clasificarNivel, indicadoresStock, vistaPorDeposito } from "@/lib/stock/vista";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");
const EMP = "11111111-1111-4111-8111-111111111111";
const PROD = "22222222-2222-4222-8222-222222222222";
const DEP_A = "33333333-3333-4333-8333-333333333333";
const DEP_B = "44444444-4444-4444-8444-444444444444";

export async function verificarCasosInventarioStock(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── INV-04: decimal exacto
  igual("INV-04 suma exacta donde float falla (0,1 + 0,2) y con valores grandes con 4 decimales", [sumarDecimales(["0.1", "0.2"]), 0.1 + 0.2, sumarDecimales(["123456789012345.6789", "0.0001"]), sumarDecimales([]), sumarDecimales(["1.50", null, "abc", "2.5"])], ["0.3", 0.30000000000000004, "123456789012345.679", "0", "4"]);
  igual("INV-04 producto exacto: precio × cantidad (4 decimales cada uno)", [multiplicarDecimales("1234567890.1234", "3"), multiplicarDecimales("0.0001", "0.0001"), multiplicarDecimales("19.99", "0"), multiplicarDecimales("x", "2"), multiplicarDecimales("2.5", "-4")], ["3703703670.3702", "0.00000001", "0", null, "-10"]);
  igual("INV-04 redondeo mitad hacia arriba sobre texto", [redondearDecimal("2.345", 2), redondearDecimal("1234.5", 0), redondearDecimal("1234.49", 0), redondearDecimal("-2.345", 2), redondearDecimal("5", 2), redondearDecimal("x", 2)], ["2.35", "1235", "1234", "-2.35", "5.00", null]);
  igual("INV-04 formato es-PY sin float: PYG sin decimales, USD con dos, negativos, entrada inválida", [
    formatearMontoTexto("1234567.5", "PYG"), formatearMontoTexto("999999999999999.4999", "PYG"), formatearMontoTexto("1234.5", "USD"), formatearMontoTexto("0.005", "USD"), formatearMontoTexto("-1500", "PYG"), formatearMontoTexto(null, "PYG"), formatearMontoTexto("abc", "USD"),
  ], ["Gs. 1.234.568", "Gs. 999.999.999.999.999", "USD 1.234,50", "USD 0,01", "Gs. -1.500", "—", "—"]);

  // ── Lectura con conexión simulada: importes exactos, moneda por línea, alcance
  const filas = (sql: string): Array<Record<string, unknown>> => {
    if (/FROM productos p/.test(sql)) return [{ id: PROD, codigo: "P-1", codigoInventario: "", codigoBarras: "", descripcion: "Leche", categoria: "", marca: "", familia: "", linea: "", procedencia: "", unidadMedidaId: "u", unidadMedidaNombre: "Unidad", modoControl: "CANTIDAD", stockMinimo: 5, stockMaximo: 0, puntoReposicion: 10, actualizadoEn: "2026-10-13" }];
    if (/FROM stock_saldos s/.test(sql)) {
      return [
        { id: "s1", productoId: PROD, depositoId: DEP_A, depositoCodigo: "A", depositoNombre: "Central", estado: "DISPONIBLE", propiedad: "PROPIO", cantidad: 1.1, cantidadTexto: "1.1", lote: "", vencimiento: "" },
        { id: "s2", productoId: PROD, depositoId: DEP_B, depositoCodigo: "B", depositoNombre: "Norte", estado: "DISPONIBLE", propiedad: "PROPIO", cantidad: 2.2, cantidadTexto: "2.2", lote: "", vencimiento: "" },
      ];
    }
    if (/FROM inventario_costos/.test(sql)) {
      return [
        { productoId: PROD, depositoId: DEP_A, cantidad: 1.1, valor: 0.1, valorTexto: "0.1" },
        { productoId: PROD, depositoId: DEP_B, cantidad: 2.2, valor: 0.2, valorTexto: "0.2" },
      ];
    }
    if (/v_producto_precio_referencia/.test(sql)) return [{ productoId: PROD, precio: 1234567890.1234, precioTexto: "1234567890.1234", moneda: "USD" }];
    if (/FROM empresas/.test(sql)) return [{ nombre: "Empresa", moneda: "PYG" }];
    if (/producto_deposito_configuracion/.test(sql)) return [{ productoId: PROD, depositoId: DEP_A, minimo: 5, maximo: null, punto: 10, reposicion: null }];
    if (/count\(\*\)/.test(sql)) return [{ n: 2 }];

    return [];
  };
  const db = { query: async (sql: string) => ({ rows: filas(sql), rowCount: 0 }) } as never;
  const r = await leerStock(db, EMP, null, null);
  const item = r.stock[0] as unknown as StockItem;

  igual("INV-04 el valor a costo del producto se suma como decimal exacto (0,1 + 0,2 = 0,3; el float daría 0,30000000000000004)", [item.valorInventarioTexto, item.valorInventario === 0.1 + 0.2], ["0.3", true]);
  igual("INV-03 el precio de referencia en USD con empresa en PYG conserva SU moneda y su valor exacto (precio × disponible 3,3), sin rotularse como moneda base", [item.monedaPrecio, r.monedaBase, item.precioVentaReferenciaTexto, item.valorVentaReferenciaTexto, formatearMontoTexto(item.valorVentaReferenciaTexto, item.monedaPrecio)], ["USD", "PYG", "1234567890.1234", "4074074037.40722", "USD 4.074.074.037,41"]);
  const dep = vistaPorDeposito(item, DEP_B)!;

  igual("INV-03/04 la vista por depósito recalcula con el texto exacto de ESE depósito (disponible 2,2 y costo 0,2) y mantiene la moneda de la referencia", [dep.valorVentaReferenciaTexto, dep.valorInventarioTexto, dep.monedaPrecio], ["2716049358.27148", "0.2", "USD"]);
  igual("INV-03 sin precio de referencia: sin importe de venta (no se inventa ni se pone 0)", await (async () => {
    const dbSinPrecio = { query: async (sql: string) => ({ rows: /v_producto_precio_referencia/.test(sql) ? [] : filas(sql), rowCount: 0 }) } as never;
    const x = (await leerStock(dbSinPrecio, EMP, null, null)).stock[0] as unknown as StockItem;

    return [x.precioVentaReferenciaTexto, x.valorVentaReferenciaTexto, x.valorVentaReferencia];
  })(), [null, null, null]);

  // ── Indicadores esenciales e INV-01
  const base = { ...item, nivel: "NORMAL" as const };
  const lista = [{ ...base, disponible: 0, nivel: "SIN_STOCK" as const }, { ...base, disponible: 3, nivel: "BAJO" as const }, { ...base, disponible: 8 }];

  igual("Stock: la portada resume solo SKU, Disponible, Sin stock y Bajo mínimo (sin importes)", indicadoresStock(lista), { sku: 3, disponible: 11, sinStock: 1, stockBajo: 1 });
  igual("INV-01 disponible entre el mínimo (5) y el punto (10): Stock lo clasifica NORMAL (la necesidad de reposición la decide Reposición con el punto)", [clasificarNivel({ disponible: 8, totalFisico: 8, minimo: 5, maximo: 0 }), clasificarNivel({ disponible: 4, totalFisico: 4, minimo: 5, maximo: 0 }), clasificarNivel({ disponible: 0, totalFisico: 0, minimo: 0, maximo: 0 })], ["NORMAL", "BAJO", "SIN_STOCK"]);
  igual("INV-01 etiquetas: «Bajo mínimo» (no «Stock bajo»)", ETIQUETA_NIVEL, { NORMAL: "Normal", BAJO: "Bajo mínimo", SIN_STOCK: "Sin stock", SOBRESTOCK: "Sobrestock" });

  // ── INV-02: acceso a los atajos
  const p = (ver: boolean, crear: boolean) => ({ movimientosVer: ver, movimientosCrear: crear });

  igual("INV-02 atajo «Nuevo movimiento»: solo VER+CREAR; CREAR sin VER y VER sin CREAR no lo muestran (las guardas de página darían 403/redirección); historial solo con VER", [
    puedeAbrirNuevoMovimiento(p(true, true)), puedeAbrirNuevoMovimiento(p(false, true)), puedeAbrirNuevoMovimiento(p(true, false)), puedeAbrirNuevoMovimiento(p(false, false)),
    puedeVerMovimientos(p(true, false)), puedeVerMovimientos(p(false, true)),
  ], [true, false, false, false, true, false]);
  igual("INV-02 permisos ausentes o malformados equivalen a «sin permisos»", [normalizarPermisosMovimientos(undefined), normalizarPermisosMovimientos({ movimientosVer: "si", movimientosCrear: 1 }), normalizarPermisosMovimientos(p(true, true)), puedeAbrirNuevoMovimiento(null)], [p(false, false), p(false, false), p(true, true), false]);

  // ── Código: lista y detalle
  const pagina = leer("app/(private)/stock/page.tsx");
  const detalle = leer("app/(private)/stock/[id]/page.tsx");
  const apiLista = leer("app/api/stock/route.ts");
  const apiDetalle = leer("app/api/stock/[id]/route.ts");

  cierto("Stock lista: la API devuelve los permisos de Movimientos (VER y CREAR) y la pantalla los normaliza; el atajo usa puedeAbrirNuevoMovimiento y el historial puedeVerMovimientos", /movimientosVer: hasPermission\(acceso, "MOVIMIENTOS", "VER"\)/.test(apiLista) && /movimientosCrear: hasPermission\(acceso, "MOVIMIENTOS", "CREAR"\)/.test(apiLista) && /puedeAbrirNuevoMovimiento\(permisos\)/.test(pagina) && /puedeVerMovimientos\(permisos\)/.test(pagina) && /normalizarPermisosMovimientos\(r\.permisos\)/.test(pagina));
  cierto("Stock lista: acción principal «Ver reposición»; sin tarjetas de valor a costo / venta (van a Reportes/ficha) y sin exportadores; los indicadores salen de indicadoresStock", /Ver reposición/.test(pagina) && !/Valor a costo|Valor venta referencia|resumen\.valorCosto|resumen\.valorVenta/.test(pagina) && /indicadoresStock\(stock\)/.test(pagina) && !/Exportar|xlsx/i.test(pagina));
  cierto("Stock: ninguna acción cambia saldos (solo GET) y no hay segundo motor: sin fetch con POST/PUT en lista y detalle; los atajos son enlaces a /movimientos/nuevo", !/method: "(POST|PUT|DELETE)"/.test(pagina + detalle) && /\/movimientos\/nuevo/.test(pagina) && /enlaceNuevoMovimiento/.test(detalle) && !/export async function (POST|PUT|DELETE)/.test(apiLista + apiDetalle));
  cierto("INV-03/04 pantalla: los importes se presentan desde el texto exacto con la moneda de cada línea (costo en moneda base, venta de referencia con su propia moneda); sin Number() ni suma de importes en la portada", /formatearMontoTexto\(item\.valorInventarioTexto, monedaBase\)/.test(pagina) && /item\.monedaPrecio \|\| monedaBase/.test(pagina) && !/reduce\(\(a, i\) => a \+ .*valor/.test(pagina) && /textoImporteDeStock\(item\.valorVentaReferenciaTexto, alcance, \(t\) => formatearMontoTexto\(t, item\.monedaPrecio/.test(detalle));
  cierto("INV-01 pantalla: la ayuda explica la diferencia entre «Bajo mínimo» (Stock) y la reposición por punto (Reposición)", /Bajo mínimo y reposición/.test(pagina) && /punto de reposición/.test(pagina));
  cierto("Stock detalle: los atajos «Entrada/Transferir» exigen VER+CREAR y no se ofrecen para unidades identificadas; los depósitos inactivos con saldo siguen apareciendo (la consulta no filtra por d.activo)", /puedeAbrirNuevoMovimiento\(permisos\)/.test(detalle) && /UNIDAD_ETIQUETADA/.test(detalle) && !/d\.activo/.test(leer("lib/stock/shared.ts")));

  return fallos;
}
