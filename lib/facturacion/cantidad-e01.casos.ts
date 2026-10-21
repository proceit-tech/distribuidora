/**
 * E01 (PRO-200 / PRO-93) — cantidades fraccionarias en la Factura: coma o punto, hasta 4 decimales, para TODAS las unidades (77/UNI incluida), y foco automático en «Cantidad» tras agregar un producto.
 * El servidor (previa/payload con unidad 77) se prueba en ajuste-fiscal.casos; aquí: el módulo puro de cantidad, la pantalla (estructural: React no se renderizó) y que el cálculo/payload fiscal no cambió.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { cantidadFacturaValida, normalizarCantidadTexto, sumarUnaUnidad } from "@/lib/formato/cantidad-campo";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");

export async function verificarCasosCantidadE01(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(nombre + ": esperado " + JSON.stringify(esperado) + ", obtenido " + JSON.stringify(obtenido));
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  igual("E01-01 la coma se acepta como separador decimal y se normaliza a punto (texto, sin Number)", ["5,5", "2,25", "0,0001", ",5", "5,", " 5,5 ", "5.5", "12", "1000,1234"].map(normalizarCantidadTexto), ["5.5", "2.25", "0.0001", "0.5", "5", "5.5", "5.5", "12", "1000.1234"]);
  igual("E01-02 cantidades válidas: fracciones hasta 4 decimales, con coma o punto, cualquier unidad", ["5,5", "5.5", "2,25", "0,0001", "0.0001", "1", "10", "9999999999", "9999999999,9999", ",5", "5,"].map(cantidadFacturaValida), [true, true, true, true, true, true, true, true, true, true, true]);
  igual("E01-03 cantidades inválidas: vacía, solo espacios, cero (en cualquier forma), más de 4 decimales, 11 enteros, coma y punto juntos, varias comas, negativa, texto", ["", "   ", "0", "0,0000", "0.00", "1,23456", "12345678901", "1.234,5", "1,2,3", "-1", "abc", ",", "."].map(cantidadFacturaValida), [false, false, false, false, false, false, false, false, false, false, false, false, false]);
  igual("E01-04 la normalización no pierde precisión: el valor canónico es el texto exacto escrito (no pasa por Number)", [normalizarCantidadTexto("9999999999,9999"), normalizarCantidadTexto("0,1"), normalizarCantidadTexto("0,0001")], ["9999999999.9999", "0.1", "0.0001"]);
  igual("E01-05 agregar el mismo producto suma una unidad exacta (sin ruido binario) y respeta fracciones", [sumarUnaUnidad("1"), sumarUnaUnidad("5,5"), sumarUnaUnidad("0,1"), sumarUnaUnidad("2.25"), sumarUnaUnidad("1,2000"), sumarUnaUnidad("abc"), sumarUnaUnidad("")], ["2", "6.5", "1.1", "3.25", "2.2", null, null]);

  const pagina = leer("app/(private)/facturas/nueva/page.tsx");
  const emision = leer("lib/facturacion/emision.ts");
  const payload = leer("lib/facturacion/payload-fe.ts");

  cierto("E01-10 pantalla: sin bloqueo por unidad 77 (ni validación ni mensaje «entero»), validación única por el módulo puro, el campo guarda lo escrito (coma incluida) y solo se normaliza para validar/enviar/calcular", !/unidadSifen\s*[!=]==\s*77/.test(pagina) && !/Entero mayor/.test(pagina) && /const cantidadValida = \(l: Linea\) => cantidadFacturaValida\(l\.cantidad\)/.test(pagina) && /onChange=\{\(e\) => editar\(l\.clave, \{ cantidad: e\.target\.value \}\)\}/.test(pagina) && /cantidad: normalizarCantidadTexto\(l\.cantidad\)/.test(pagina) && (pagina.match(/normalizarCantidadTexto\(l\.cantidad\)/g) ?? []).length === 2);
  cierto("E01-11 pantalla: foco y selección en «Cantidad» de la línea agregada (o incrementada) al cerrar el selector; el selector multi-alta y «Listo» se conservan", /lineaAFocar\.current = siguienteClave/.test(pagina) && /lineaAFocar\.current = existente\.clave/.test(pagina) && /id=\{`cantidad-\$\{l\.clave\}`\}/.test(pagina) && /document\.getElementById\(`cantidad-\$\{lineaAFocar\.current\}`\)/.test(pagina) && /campo\.focus\(\);\s*campo\.select\(\)/.test(pagina) && /if \(lineaAFocar\.current === null \|\| selector !== null\) return/.test(pagina) && /onClick=\{alCerrar\}>Listo</.test(pagina));
  cierto("E01-12 servidor: la cantidad del cuerpo se normaliza (coma → punto) y el rechazo por unidad 77 fue retirado; las demás validaciones (4 decimales, 10 enteros, > 0) siguen en el cálculo fiscal", /cantidad: normalizarCantidadTexto\(s\(\(l as F\)\.cantidad\)\)/.test(emision) && !/se vende por unidad: la cantidad debe ser un número entero/.test(emision) && /parseDec\(l\.cantidad, 4\)/.test(payload) && /la cantidad debe ser mayor que cero, con hasta 4 decimales/.test(payload));
  cierto("E01-13 el cálculo fiscal, el payload FE, el inventario y el gateway no se tocaron en E01 (no importan el módulo de cantidad de la pantalla)", !/cantidad-campo/.test(payload) && !/cantidad-campo/.test(leer("lib/facturacion/calculo.ts")) && !/cantidad-campo/.test(leer("lib/facturacion/gateway.ts")) && !/inventario_registrar_movimiento/.test(emision));

  return fallos;
}
