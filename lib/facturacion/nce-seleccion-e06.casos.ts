/**
 * E06 (PRO-200) — NCE: «Seleccionar todos», «Eliminar seleccionados», devolución parcial con cantidad fraccionaria (coma) y tope por saldo. Estado puro + validación real del servidor
 * (validarEntradaNce) + estructura de la pantalla. Sin navegador ni PostgreSQL. La NCE no genera entrada de inventario.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { alternarLinea, alternarTodas, eliminadasPorPrecarga, eliminarSeleccionadas, enNota, entradasIniciales, errorCantidadDevolucion, lineasVisibles } from "@/lib/facturacion/nce-entradas";
import { leerCuerpoNce } from "@/lib/facturacion/nce";
import { calcularNce, validarEntradaNce, type EntradaNce, type LineaOriginal } from "@/lib/facturacion/payload-nce";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");
const sinCom = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const L = (linea: number, cantidad: string, precio: string): LineaOriginal => ({ linea, codigoInterno: `P${linea}`, gtin: null, descripcion: `Prod ${linea}`, unidadSifen: 77, cantidad, precio, total: String(Number(cantidad) * Number(precio)), afectacion: 1, tasa: 10, proporcion: "100" });
const SIN = { cantidad: "0", monto: "0" };
const entrada = (lineas: EntradaNce["lineas"]): EntradaNce => ({ motivo: 2, moneda: "PYG", cambio: null, lineas, observacion: "" });

export async function verificarCasosNceSeleccionE06(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  const lineas = [{ linea: 1, agotada: false, cantidadDisponible: "10" }, { linea: 2, agotada: false, cantidadDisponible: "2.5" }, { linea: 3, agotada: true, cantidadDisponible: "0" }, { linea: 4, agotada: false, cantidadDisponible: "1" }];
  const vacio = new Set<number>();
  const arr = (s: ReadonlySet<number>) => [...s].sort((a, b) => a - b);

  // ── Seleccionar todos / individual / eliminar ──────────────────────────────────────────────────
  igual("E06-01 «Seleccionar todos» marca TODAS las líneas de la nota (también la agotada, para poder quitarla)", arr(alternarTodas(lineas, vacio, vacio)), [1, 2, 3, 4]);
  igual("E06-01 pulsarlo con todo marcado desmarca todo", arr(alternarTodas(lineas, vacio, new Set([1, 2, 3, 4]))), []);
  igual("E06-01 con una selección parcial marca el resto (no la invierte)", arr(alternarTodas(lineas, vacio, new Set([2]))), [1, 2, 3, 4]);
  igual("E06-02 marcar y desmarcar individualmente no afecta a las demás", [arr(alternarLinea(new Set([1]), 2, true)), arr(alternarLinea(new Set([1, 2]), 1, false))], [[1, 2], [2]]);

  const r = eliminarSeleccionadas(lineas, vacio, new Set([2, 4]));

  igual("E06-03 «Eliminar seleccionados» quita SOLO las marcadas de la nota y vacía la selección; las demás permanecen", [arr(r.eliminadas), arr(r.seleccion), lineasVisibles(lineas, r.eliminadas).map((l) => l.linea)], [[2, 4], [], [1, 3]]);
  igual("E06-03 sin selección no elimina nada; una línea ya eliminada no reaparece ni se duplica", [arr(eliminarSeleccionadas(lineas, vacio, vacio).eliminadas), arr(eliminarSeleccionadas(lineas, r.eliminadas, new Set([1, 2])).eliminadas)], [[], [1, 2, 4]]);

  const todas = eliminarSeleccionadas(lineas, vacio, alternarTodas(lineas, vacio, vacio));

  igual("E06-03 se pueden eliminar todas las líneas (la nota queda vacía) y «Seleccionar todos» sobre una nota vacía no marca nada", [lineasVisibles(lineas, todas.eliminadas).length, arr(alternarTodas(lineas, todas.eliminadas, vacio))], [0, []]);
  igual("E06-03 las líneas eliminadas dejan de formar parte de la nota; las no eliminadas con saldo sí (devolución) aunque la cantidad esté vacía", [lineas.map((l) => enNota(true, l, "", r.eliminadas))], [[true, false, false, false]]);
  igual("E06-03 en motivos por monto la línea entra solo si hay monto (comportamiento previo conservado)", [lineas.map((l) => enNota(false, l, l.linea === 1 ? "5000" : "", vacio))], [[true, false, false, false]]);

  // ── Estado inicial y corrección de NCE rechazada ───────────────────────────────────────────────
  const ini = entradasIniciales(lineas, 2);

  igual("E06-04 Devolución arranca con la cantidad disponible en cada línea con saldo (se puede reducir) y la agotada fuera", [ini[1].valor, ini[2].valor, ini[3].valor, ini[3].incluida], ["10", "2.5", "", false]);
  igual("E06-04 corrección de NCE rechazada: las líneas que no estaban en la nota rechazada quedan eliminadas (devolución); en otros motivos no se elimina nada", [arr(eliminadasPorPrecarga(lineas, 2, [{ linea: 2 }, { linea: 1 }])), arr(eliminadasPorPrecarga(lineas, 3, [{ linea: 2 }]))], [[3, 4], []]);

  // ── Cantidad parcial, coma y tope ──────────────────────────────────────────────────────────────
  igual("E06-05 acepta coma o punto y hasta 4 decimales dentro del saldo (incluido el saldo exacto)", ["5,5", "5.5", "0,0001", "2,5", "10", "2,50"].map((v, i) => errorCantidadDevolucion(v, i < 4 ? "10" : i === 4 ? "10" : "2.5")), [null, null, null, null, null, null]);
  igual("E06-05 rechaza lo que supera el saldo disponible de la factura original (por una milésima también)", [errorCantidadDevolucion("10,0001", "10"), errorCantidadDevolucion("2,5001", "2.5"), errorCantidadDevolucion("11", "10")], ["Supera el saldo disponible (10).", "Supera el saldo disponible (2.5).", "Supera el saldo disponible (10)."]);
  igual("E06-05 rechaza vacío, cero, negativos, texto, más de 4 decimales, coma y punto juntos o varias comas", ["", "0", "0,0000", "-1", "abc", "1,23456", "1,000.5", "1,2,3", "1e3"].map((v) => errorCantidadDevolucion(v, "10") !== null), [true, true, true, true, true, true, true, true, true]);

  // servidor: misma regla con coma normalizada en el cuerpo y tope contra el saldo real (acumulado)
  const cuerpo = leerCuerpoNce({ facturaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", motivo: 2, sucursalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", puntoId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", claveIdempotencia: "clave-12345", lineas: [{ linea: 1, cantidad: " 2,5 " }, { linea: 2, cantidad: "3,", monto: "" }] });

  igual("E06-06 el servidor normaliza la cantidad con coma antes de validar (sin truncar a entero)", typeof cuerpo === "string" ? cuerpo : cuerpo.lineas.map((l) => l.cantidad), ["2.5", "3"]);

  const L1 = L(1, "10", "10000");
  const parcial = entrada([{ original: L1, acreditado: SIN, cantidad: "2.5" }]);

  igual("E06-06 devolución parcial fraccionaria válida y su total es cantidad × precio original (25.000)", [validarEntradaNce(parcial), calcularNce(parcial).totalTexto], [[], "25000"]);
  cierto("E06-06 no puede superar el saldo: con 6 ya acreditadas de 10, devolver 4,0001 se rechaza y 4 se acepta", validarEntradaNce(entrada([{ original: L1, acreditado: { cantidad: "6", monto: "60000" }, cantidad: "4.0001" }])).some((m) => /supera la disponible/.test(m)) && validarEntradaNce(entrada([{ original: L1, acreditado: { cantidad: "6", monto: "60000" }, cantidad: "4" }])).length === 0);
  cierto("E06-06 devolver solo algunas líneas (las otras no se envían) es válido; una línea ya agotada se rechaza", validarEntradaNce(entrada([{ original: L(2, "3", "1000"), acreditado: SIN, cantidad: "1" }])).length === 0 && validarEntradaNce(entrada([{ original: L1, acreditado: { cantidad: "10", monto: "100000" }, cantidad: "1" }])).length > 0);

  // ── Estructura de la pantalla y alcance ────────────────────────────────────────────────────────
  const pagina = leer("app/(private)/notas-credito/page.tsx");
  const p = sinCom(pagina);

  cierto("E06-07 la pantalla ofrece «Seleccionar todos» (botón y casilla de cabecera), casillas por línea, «Eliminar seleccionados» y restaurar, y solo envía las líneas que siguen en la nota con la cantidad normalizada", /Seleccionar todos/.test(p) && /Eliminar seleccionados/.test(p) && /aria-label=\{`Seleccionar ítem \$\{l\.linea\}`\}/.test(p) && /Restaurar/.test(p) && /enNota\(esDevolucion, l, entradas\[l\.linea\]\?\.valor/.test(p) && /normalizarCantidadTexto\(entradas\[l\.linea\]\?\.valor/.test(p));
  cierto("E06-07 el tope por saldo bloquea «Revisar» (errores por línea visibles) y el servidor lo vuelve a validar; el cambio de motivo reinicia selección y eliminadas", /erroresCantidad\.size === 0/.test(p) && /errorCantidadDevolucion\(/.test(p) && /role="alert"/.test(p) && /setMarcadas\(new Set\(\)\); setEliminadas\(new Set\(\)\)/.test(p));
  cierto("E06-08 se conservan el motivo fijado, la corrección de NCE rechazada y los motivos: la página sigue usando motivoFijado, precarga y MOTIVOS", /motivoFijado/.test(p) && /precarga/.test(p) && /correccion\.cargar\(corregir\)/.test(p) && /MOTIVOS\[m\]/.test(p) && /disabled=\{factura\.motivoFijado !== null\}/.test(p));
  cierto("E06-09 SIN entrada automática de inventario: la NCE (pantalla, API, servicio, payload y emisión) no toca movimientos, stock ni inventario", ["app/(private)/notas-credito/page.tsx", "lib/facturacion/nce.ts", "lib/facturacion/nce-emision.ts", "lib/facturacion/payload-nce.ts", "lib/facturacion/nce-entradas.ts"].every((f) => !/inventario_|movimientos?\b|stock_|fe_stock|aplicar_movimiento|entrada de stock/i.test(sinCom(leer(f)))) && /No se genera ninguna entrada de inventario/.test(pagina));
  cierto("E06-09 la pantalla no guarda nada en el navegador y no modifica la factura original (solo estado local de la nota)", !/localStorage|sessionStorage/.test(p) && !/method: "(DELETE|PUT|PATCH)"/.test(p));

  return fallos;
}
