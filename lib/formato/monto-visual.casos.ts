/**
 * PRO-335 — formato monetario visual en TODAS las pantallas: PYG 0 decimales, USD/BRL 2 fijos, redondeo por texto mitad hacia arriba (también en negativos), moneda de CADA fila,
 * y separación explícita entre importe monetario y cantidad/tasa/código. Solo presentación: funciones puras reales + cableado de pantallas verificado estructuralmente.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { montoTexto } from "@/lib/dashboard/formato";
import { formatearDecimalTexto } from "@/lib/formato/decimal-texto";
import { formatearMonto } from "@/lib/formato/listas";
import {
  decimalesMonedaVisual,
  formatearDecimalExacto,
  formatearImporteConMoneda,
  formatearImporteMoneda,
  formatearMontoVisual,
  normalizarMonedaVisual,
} from "@/lib/formato/monto-visual";
import { formatearCostoUnitarioExactoTexto, formatearCostoUnitarioTexto, formatearMontoTexto } from "@/lib/inventario/decimal";
import { formatoMoneda } from "@/lib/listas-precio/calculos";
import { fmtCantidadTexto, fmtDinero, fmtImporteMoneda } from "@/lib/reportes/formato";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");

export async function verificarCasosFormatoMonetarioPro335(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(nombre + ": esperado " + JSON.stringify(esperado) + ", obtenido " + JSON.stringify(obtenido));
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const tabla = (prefijo: string, casos: Array<[string, string | number | null | undefined, string | null | undefined, string]>, f: (v: string | number | null | undefined, m: string | null | undefined) => string) => {
    for (const [id, entrada, moneda, esperado] of casos) igual(`${prefijo}-${id} ${String(moneda)} ${JSON.stringify(entrada)} → ${esperado}`, f(entrada, moneda), esperado);
  };

  // ── A. Tabla de aceptación obligatoria de la orden (§4) ─────────────────────────────────────────
  tabla("PRO335-A", [
    ["01", "142090.90909092", "PYG", "142.091"],
    ["02", "1420909.09090908", "PYG", "1.420.909"],
    ["03", "3661500.00", "PYG", "3.661.500"],
    ["04", "0.49", "PYG", "0"],
    ["05", "0.50", "PYG", "1"],
    ["06", "-0.50", "PYG", "-1"],
    ["07", "-0.4", "PYG", "0"],
    ["08", "1234.56789", "USD", "1.234,57"],
    ["09", "1234.5", "USD", "1.234,50"],
    ["10", "1.234", "USD", "1,23"],
    ["11", "1.235", "USD", "1,24"],
    ["12", "-1.235", "USD", "-1,24"],
    ["13", "0.00", "USD", "0,00"],
    ["14", "42.1", "BRL", "42,10"],
  ], formatearImporteMoneda);
  igual("PRO335-A15 cantidad (stock) 1.2500 → 1,25 sin moneda ni redondeo monetario", [fmtCantidadTexto("1.2500"), formatearDecimalExacto("1.2500")], ["1,25", "1,25"]);
  igual("PRO335-A16 cantidad (stock) 0.0001 → 0,0001 (no se redondea a 0 ni a 2 decimales)", [fmtCantidadTexto("0.0001"), formatearDecimalExacto("0.0001")], ["0,0001", "0,0001"]);
  igual("PRO335-A17 tipo de cambio 7350.123456 NO se redondea por la regla monetaria (camino exacto)", [formatearDecimalExacto("7350.123456"), formatearDecimalTexto("7350.123456"), fmtCantidadTexto("7350.123456")], ["7.350,123456", "7.350,123456", "7.350,123456"]);
  igual("PRO335-A18 código documental 000123-A no se convierte a número ni se modifica", [formatearImporteMoneda("000123-A", "PYG"), formatearDecimalExacto("000123-A"), fmtImporteMoneda("000123-A", "USD"), formatearMontoVisual("000123-A", "PYG")], ["000123-A", "000123-A", "000123-A", "000123-A"]);

  // ── B. Redondeo, signos y magnitudes ─────────────────────────────────────────────────────────────
  tabla("PRO335-B", [
    ["01", "0", "PYG", "0"],
    ["02", "-0", "PYG", "0"],
    ["03", "-0.00", "USD", "0,00"],
    ["04", "-0.004", "USD", "0,00"],
    ["05", "-0.005", "USD", "-0,01"],
    ["06", "0.499999", "PYG", "0"],
    ["07", "999999.99999999", "PYG", "1.000.000"],
    ["08", "999.995", "USD", "1.000,00"],
    ["09", "-142090.5", "PYG", "-142.091"],
    ["10", "-1500.7", "PYG", "-1.501"],
    ["11", "9007199254740993.4000", "PYG", "9.007.199.254.740.993"],
    ["12", "123456789012345678901234567890.5", "PYG", "123.456.789.012.345.678.901.234.567.891"],
    ["13", "99999999999999.9949", "USD", "99.999.999.999.999,99"],
    ["14", "1234.995", "BRL", "1.235,00"],
    ["15", "7", "USD", "7,00"],
    ["16", "100", "PYG", "100"],
    ["17", "0.1", "PYG", "0"],
    ["18", "  1500.5  ", "PYG", "1.501"],
    ["19", 1100, "PYG", "1.100"],
    ["20", 1234.5, "USD", "1.234,50"],
    ["21", -0.5, "PYG", "-1"],
    ["22", 0.1 + 0.2, "USD", "0,30"],
  ], formatearImporteMoneda);

  // ── C. Ausencia, inválidos y monedas desconocidas: no fabricar ni asumir ─────────────────────────
  igual("PRO335-C01 null/undefined/vacío son AUSENCIA («—»), distinta del 0 real", [formatearImporteMoneda(null, "PYG"), formatearImporteMoneda(undefined, "USD"), formatearImporteMoneda("", "PYG"), formatearImporteMoneda("0", "PYG"), formatearImporteMoneda("0", "USD")], ["—", "—", "—", "0", "0,00"]);
  igual("PRO335-C02 texto inválido se devuelve tal cual (no se vuelve 0); number no finito → «—»", [formatearImporteMoneda("abc", "PYG"), formatearImporteMoneda("12,5", "USD"), formatearImporteMoneda(Number.NaN, "PYG"), formatearImporteMoneda(Number.POSITIVE_INFINITY, "USD")], ["abc", "12,5", "—", "—"]);
  igual("PRO335-C03 moneda desconocida o ausente: valor exacto, sin asumir PYG ni USD", [formatearImporteMoneda("1234.5678", "EUR"), formatearImporteMoneda("1234.5678", null), formatearImporteMoneda("1234.5678", ""), formatearImporteMoneda("1234.5000", undefined)], ["1.234,5678", "1.234,5678", "1.234,5678", "1.234,5"]);
  igual("PRO335-C04 alias de guaraníes normalizados (PYG/Gs/Gs./GS/₲); USD/BRL; desconocidas → null", [normalizarMonedaVisual("PYG"), normalizarMonedaVisual("Gs"), normalizarMonedaVisual("Gs."), normalizarMonedaVisual(" gs "), normalizarMonedaVisual("₲"), normalizarMonedaVisual("usd"), normalizarMonedaVisual("BRL"), normalizarMonedaVisual("EUR"), normalizarMonedaVisual(""), normalizarMonedaVisual(null)], ["PYG", "PYG", "PYG", "PYG", "PYG", "USD", "BRL", null, null, null]);
  igual("PRO335-C05 decimales visuales por moneda", [decimalesMonedaVisual("PYG"), decimalesMonedaVisual("GS"), decimalesMonedaVisual("USD"), decimalesMonedaVisual("BRL"), decimalesMonedaVisual("EUR")], [0, 0, 2, 2, null]);
  igual("PRO335-C06 alias Gs aplica 0 decimales", [formatearImporteMoneda("142090.90909092", "Gs."), formatearImporteMoneda("142090.90909092", "GS")], ["142.091", "142.091"]);

  // ── D. Con moneda visible ─────────────────────────────────────────────────────────────────────
  igual("PRO335-D01 importe con moneda: Gs. sin decimales, USD/BRL con 2, desconocida con su código y valor exacto, sin moneda sin prefijo", [
    formatearImporteConMoneda("142090.90909092", "PYG"), formatearImporteConMoneda("1234.5", "USD"), formatearImporteConMoneda("42.1", "BRL"), formatearImporteConMoneda("10.125", "EUR"), formatearImporteConMoneda("10.125", ""),
  ], ["Gs. 142.091", "USD 1.234,50", "BRL 42,10", "EUR 10,125", "10,125"]);
  igual("PRO335-D02 ausencia/inválido no se rotulan como dinero", [formatearImporteConMoneda(null, "PYG"), formatearImporteConMoneda("abc", "USD")], ["—", "abc"]);

  // ── E. Mezcla PYG + USD en la misma tabla: cada fila con SU moneda ───────────────────────────────
  {
    const filas = [
      { moneda: "PYG", total: "142090.90909092" },
      { moneda: "USD", total: "1234.56789" },
      { moneda: "PYG", total: "-1420909.09090908" },
      { moneda: "USD", total: "-1.235" },
      { moneda: "BRL", total: "42.1" },
    ];
    igual("PRO335-E01 tabla mixta: la moneda de cada fila decide (nunca la del filtro ni la de la empresa)", filas.map((f) => fmtImporteMoneda(f.total, f.moneda)), ["142.091", "1.234,57", "-1.420.909", "-1,24", "42,10"]);
    igual("PRO335-E02 FE positiva y NCE negativa conservan el signo; un neto que redondea a cero no muestra «-0»", [fmtImporteMoneda("3661500.00", "PYG"), fmtImporteMoneda("-3661500.00", "PYG"), fmtImporteMoneda("-0.3", "PYG"), fmtImporteMoneda("-0.001", "USD")], ["3.661.500", "-3.661.500", "0", "0,00"]);
  }
  {
    const original = "142090.90909092";
    const copia = original;

    fmtImporteMoneda(original, "PYG");
    formatearImporteConMoneda(original, "USD");
    igual("PRO335-E03 el formateador no altera el valor de origen (solo devuelve texto)", original, copia);
  }

  // ── F. Separación dinero × cantidad × exportación en lib/reportes/formato ─────────────────────────
  igual("PRO335-F01 fmtCantidadTexto: cantidades exactas, sin redondeo monetario; ausente = «n/a»", [fmtCantidadTexto("10.5000"), fmtCantidadTexto("1234567.1250"), fmtCantidadTexto("123456789012345678.1234"), fmtCantidadTexto("-2.5"), fmtCantidadTexto(null), fmtCantidadTexto(undefined)], ["10,5", "1.234.567,125", "123.456.789.012.345.678,1234", "-2,5", "n/a", "n/a"]);
  igual("PRO335-F02 fmtDinero (exportaciones PDF) conserva el valor EXACTO de siempre (sin redondeo ni moneda)", [fmtDinero("142090.90909092"), fmtDinero("1420909.09090908"), fmtDinero("3661500.00"), fmtDinero(null), fmtDinero("")], ["142.090,90909092", "1.420.909,09090908", "3.661.500", "—", "—"]);
  igual("PRO335-F03 fmtImporteMoneda: PYG 0 / USD 2 sobre el mismo texto exacto que exporta fmtDinero", [fmtImporteMoneda("142090.90909092", "PYG"), fmtImporteMoneda("142090.90909092", "USD"), fmtImporteMoneda(null, "PYG")], ["142.091", "142.090,91", "—"]);

  // ── G. Formateadores paralelos ahora con la misma semántica ──────────────────────────────────────
  igual("PRO335-G01 inventario: formatearMontoTexto PYG 0 / USD 2 desde texto; inválido o ausente «—»; sin moneda no asume Gs.", [formatearMontoTexto("1234567.5", "PYG"), formatearMontoTexto("1234.5", "USD"), formatearMontoTexto("0.005", "USD"), formatearMontoTexto("-1500", "PYG"), formatearMontoTexto(null, "PYG"), formatearMontoTexto("abc", "USD"), formatearMontoTexto("1234.5678", "")], ["Gs. 1.234.568", "USD 1.234,50", "USD 0,01", "Gs. -1.500", "—", "—", "1.234,5678"]);
  igual("PRO335-G02 costo unitario en pantalla con política monetaria; precisión exacta disponible para el detalle técnico", [formatearCostoUnitarioTexto("1234.5678", "PYG"), formatearCostoUnitarioTexto("12.3456", "USD"), formatearCostoUnitarioExactoTexto("1234.5678", "PYG"), formatearCostoUnitarioExactoTexto("12.3456", "USD")], ["Gs. 1.235", "USD 12,35", "Gs. 1.234,5678", "USD 12,3456"]);
  igual("PRO335-G03 dashboard: montoTexto con 2 decimales fijos en USD/BRL", [montoTexto("1420909.09090908", "PYG"), montoTexto("1234.5", "USD"), montoTexto("10.0000", "BRL")], ["Gs. 1.420.909", "USD 1.234,50", "BRL 10,00"]);
  igual("PRO335-G04 listados (productos/movimientos/proveedores): formatearMonto USD con 2 fijos y PYG 0", [formatearMonto(1234.5, "USD"), formatearMonto(142090.90909092, "PYG"), formatearMonto("3661500.00", "PYG"), formatearMonto(7, "BRL")], ["USD 1.234,50", "Gs. 142.091", "Gs. 3.661.500", "BRL 7,00"]);
  igual("PRO335-G05 listas de precio: formatoMoneda igual que antes en PYG/USD y sin inventar 0 para valores no finitos", [formatoMoneda(1234567, "PYG"), formatoMoneda(1234.5, "USD"), formatoMoneda(Number.NaN, "PYG")], ["1.234.567", "1.234,50", "—"]);
  igual("PRO335-G06 facturación (contrato previo intacto): sin moneda asume PYG del documento; alias GS ahora 0 decimales", [formatearMontoVisual("1500.9"), formatearMontoVisual("12.5", "USD"), formatearMontoVisual("1234.995", "BRL"), formatearMontoVisual("abc", "PYG"), formatearMontoVisual(""), formatearMontoVisual(null), formatearMontoVisual("1500.9", "GS")], ["1.501", "12,50", "1.235,00", "abc", "", "—", "1.501"]);

  // ── H. Cableado de pantallas (estructural) ───────────────────────────────────────────────────────
  const ventas = leer("app/(private)/reportes/ventas/page.tsx");
  const celdas = ventas.match(/<CeldasImportes [^>]*\/>/g) ?? [];

  cierto("PRO335-H01 Ventas: ningún importe usa fmtDinero (sin moneda); KPIs, resumen, no computan, anomalías, documentos, totales y ajustes usan fmtImporteMoneda", !/fmtDinero/.test(ventas) && (ventas.match(/fmtImporteMoneda\(/g) ?? []).length >= 30);
  cierto("PRO335-H02 Ventas: CeldasImportes recibe la moneda y TODAS sus vistas la pasan por fila/total", /function CeldasImportes\(\{ i, moneda \}: \{ i: VentasImportes; moneda: string \}\)/.test(ventas) && celdas.length >= 5 && celdas.every((c) => /moneda=\{(g\.moneda|t\.moneda|m)\}/.test(c)));
  cierto("PRO335-H03 Ventas: No computan y Anomalías usan la moneda de SU fila", /fmtImporteMoneda\(e\.total, e\.moneda\)/.test(ventas) && /fmtImporteMoneda\(a\.total, a\.moneda\)/.test(ventas) && /fmtImporteMoneda\(d\.totalConIva, d\.moneda\)/.test(ventas));
  cierto("PRO335-H04 Ventas: cantidades vendidas/devueltas siguen con fmtCantidadTexto (no redondeo monetario)", /fmtCantidadTexto\(g\.cantidadVendida\)/.test(ventas) && /fmtCantidadTexto\(g\.cantidadDevuelta\)/.test(ventas));

  const valorizacion = leer("app/(private)/reportes/valorizacion/page.tsx");
  const kardex = leer("app/(private)/reportes/kardex/page.tsx");
  const critico = leer("app/(private)/reportes/stock-critico/page.tsx");

  cierto("PRO335-H05 Valorización: valor/costo con moneda (fila o base), cantidades exactas y costo promedio exacto en el título", !/fmtDinero/.test(valorizacion) && /fmtImporteMoneda\(f\.valorTotal, f\.moneda\)/.test(valorizacion) && /fmtImporteMoneda\(t\.valorTotal, mon\)/.test(valorizacion) && /Costo promedio exacto/.test(valorizacion) && /fmtCantidadTexto\(f\.fisico\)/.test(valorizacion));
  cierto("PRO335-H06 Kardex: costo unitario/total en la moneda de la línea, exacto visible en título y detalle", !/fmtDinero/.test(kardex) && /fmtImporteMoneda\(f\.costoUnitario, f\.moneda\)/.test(kardex) && /fmtImporteMoneda\(f\.costoTotal, f\.moneda\)/.test(kardex) && /Costo unitario exacto/.test(kardex));
  cierto("PRO335-H07 Stock crítico: valor de referencia en la moneda base informada", !/fmtDinero/.test(critico) && /fmtImporteMoneda\(t\.valorReferencia, t\.moneda\)/.test(critico));

  const documentos = leer("app/(private)/documentos/page.tsx");

  cierto("PRO335-H08 Documentos electrónicos: el total no pasa por Number/toLocaleString y usa la moneda del documento", !/Number\(d\.total\)/.test(documentos) && /formatearImporteMoneda\(d\.total, d\.moneda\)/.test(documentos));

  const movimiento = leer("app/(private)/movimientos/[id]/page.tsx");

  cierto("PRO335-H09 Movimiento (detalle): sin moneda no se asume PYG; costo unitario exacto en el título", !/monedaCosto \|\| "PYG"/.test(movimiento) && /Costo unitario exacto/.test(movimiento));

  const info = leer("app/(private)/productos/_components/pestanas/informacion.tsx");
  const inv = leer("app/(private)/productos/_components/pestanas/inventario.tsx");

  cierto("PRO335-H10 Producto: valor venta referencia exacto (sin Intl/redondeo a entero) en la moneda del precio; costos de apertura/promedio con moneda y exacto en ayuda", !/new Intl\.NumberFormat/.test(info) && /formatearImporteConMoneda\(valor, catalogos\.monedaReferencia\)/.test(info) && /formatearImporteMoneda\(detalle\.costoPromedio, catalogos\.monedaReferencia\)/.test(inv) && /formatearImporteMoneda\(apertura\.costoUnitario, catalogos\.monedaReferencia\)/.test(inv));

  const stock = leer("app/(private)/stock/page.tsx");
  const stockDetalle = leer("app/(private)/stock/[id]/page.tsx");
  const entrada = leer("app/(private)/compras/entradas/[id]/page.tsx");
  const entradaNueva = leer("app/(private)/compras/entradas/nueva/page.tsx");

  cierto("PRO335-H11 Stock y Compras: costo unitario visual con política monetaria y su valor exacto visible en el título; el input editable de costo no cambia", [stock, stockDetalle, entrada, entradaNueva].every((p) => /formatearCostoUnitarioExactoTexto\(/.test(p) && /formatearCostoUnitarioTexto\(/.test(p)) && /<input inputMode="decimal" value=\{l\.costo\}/.test(entradaNueva));

  // ── I. Contratos que NO cambian: exportaciones y cálculos ────────────────────────────────────────
  cierto("PRO335-I01 exportadores conservan el valor exacto (fmtDinero/fmtCantidadTexto) y no usan el formato monetario de pantalla", /fmtDinero\(v as string \| null\)/.test(leer("lib/reportes/export.ts")) && !/fmtImporteMoneda|formatearImporteMoneda/.test(leer("lib/reportes/export.ts") + leer("lib/reportes/export-ventas.ts") + leer("lib/reportes/xlsx.ts") + leer("lib/reportes/pdf.ts")));
  cierto("PRO335-I02 listas de precio: el cálculo (decimalesMoneda/redondearMoneda) sigue igual; solo formatoMoneda delega en el formato visual", /export function decimalesMoneda\(monedaCodigo: string\): number \{\n  return monedaCodigo\.toUpperCase\(\) === "PYG" \? 0 : 2;/.test(leer("lib/listas-precio/calculos.ts")) && /Math\.round\(Math\.abs\(valor\) \* f \* \(1 \+ Number\.EPSILON\)\)/.test(leer("lib/listas-precio/calculos.ts")));
  cierto("PRO335-I03 el núcleo visual no usa Number/parseFloat/toFixed/Intl para el importe textual", (() => {
    const nucleo = leer("lib/formato/monto-visual.ts").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    const sinRamaNumber = nucleo.replace(/if \(typeof valor === "number"\) \{[\s\S]*?\n  \}\n/, "");

    return !/parseFloat|Intl\.NumberFormat|toLocaleString/.test(nucleo) && !/toFixed|Number\(/.test(sinRamaNumber.replace(/String\(Number\(a\[i\]\) \+ 1\)/, ""));
  })());

  return fallos;
}
