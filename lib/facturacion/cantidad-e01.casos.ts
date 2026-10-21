/**
 * E01 (PRO-200 / PRO-93) — cantidades fraccionarias en la Factura: coma o punto, hasta 4 decimales, para TODAS las unidades (77/UNI incluida), y foco automático en «Cantidad» tras agregar un producto.
 * El servidor (previa/payload con unidad 77) se prueba en ajuste-fiscal.casos; aquí: el módulo puro de cantidad, la pantalla (estructural: React no se renderizó) y que el cálculo/payload fiscal no cambió.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { registrarAnadido, type UltimoAnadido } from "@/lib/facturacion/seleccion-cantidad";
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
  igual("E01-05 agregar el mismo producto suma una unidad exacta (sin ruido binario), respeta fracciones y no rebasa 10 enteros", [sumarUnaUnidad("9999999999"), sumarUnaUnidad("9999999998,5"), sumarUnaUnidad("1"), sumarUnaUnidad("5,5"), sumarUnaUnidad("0,1"), sumarUnaUnidad("2.25"), sumarUnaUnidad("1,2000"), sumarUnaUnidad("abc"), sumarUnaUnidad("")], [null, "9999999999.5", "2", "6.5", "1.1", "3.25", "2.2", null, null]);

  const pagina = leer("app/(private)/facturas/nueva/page.tsx");
  const emision = leer("lib/facturacion/emision.ts");
  const payload = leer("lib/facturacion/payload-fe.ts");

  cierto("E01-10 pantalla: sin bloqueo por unidad 77 (ni validación ni mensaje «entero»), validación única por el módulo puro, el campo guarda lo escrito (coma incluida) y solo se normaliza para validar/enviar/calcular", !/unidadSifen\s*[!=]==\s*77/.test(pagina) && !/Entero mayor/.test(pagina) && /const cantidadValida = \(l: Linea\) => cantidadFacturaValida\(l\.cantidad\)/.test(pagina) && /onChange=\{\(e\) => editar\(l\.clave, \{ cantidad: e\.target\.value \}\)\}/.test(pagina) && /cantidad: normalizarCantidadTexto\(l\.cantidad\)/.test(pagina) && (pagina.match(/normalizarCantidadTexto\(l\.cantidad\)/g) ?? []).length === 2);
  cierto("E01-11 pantalla: foco y selección en «Cantidad» de la línea agregada (o incrementada) al cerrar el selector; el selector multi-alta y «Listo» se conservan", /lineaAFocar\.current = siguienteClave/.test(pagina) && /lineaAFocar\.current = existente\.clave/.test(pagina) && /id=\{`cantidad-\$\{l\.clave\}`\}/.test(pagina) && /document\.getElementById\(`cantidad-\$\{lineaAFocar\.current\}`\)/.test(pagina) && /campo\.focus\(\);\s*campo\.select\(\)/.test(pagina) && /if \(lineaAFocar\.current === null \|\| selector !== null\) return/.test(pagina) && /onClick=\{alCerrar\}>Listo</.test(pagina));
  cierto("E01-12 servidor: la cantidad del cuerpo se normaliza (coma → punto) y el rechazo por unidad 77 fue retirado; las demás validaciones (4 decimales, 10 enteros, > 0) siguen en el cálculo fiscal", /cantidad: normalizarCantidadTexto\(s\(\(l as F\)\.cantidad\)\)/.test(emision) && !/se vende por unidad: la cantidad debe ser un número entero/.test(emision) && /parseDec\(l\.cantidad, 4\)/.test(payload) && /la cantidad debe ser mayor que cero, con hasta 4 decimales/.test(payload));
  cierto("E01-13 el cálculo fiscal, el payload FE, el inventario y el gateway no se tocaron en E01 (no importan el módulo de cantidad de la pantalla)", !/cantidad-campo/.test(payload) && !/cantidad-campo/.test(leer("lib/facturacion/calculo.ts")) && !/cantidad-campo/.test(leer("lib/facturacion/gateway.ts")) && !/inventario_registrar_movimiento/.test(emision));


  // ── E01-R02 (PRO-201): la cantidad se edita en el propio selector avanzado justo después de cada «Añadir» ───────────────────────────────────────────
  {
    let u: UltimoAnadido | null = null;
    const secuencia: UltimoAnadido[] = [];

    for (const [clave, desc] of [[1, "Producto A"], [2, "Producto B"], [1, "Producto A"]] as Array<[number, string]>) {
      u = registrarAnadido(u, clave, desc);
      secuencia.push(u);
    }
    igual("E01-R02-01 cada alta (primer producto, segundo producto y REPETIR uno existente) genera una solicitud de foco nueva y apunta a la línea correcta", secuencia.map((x) => [x.clave, x.descripcion, x.solicitud]), [[1, "Producto A", 1], [2, "Producto B", 2], [1, "Producto A", 3]]);
  }

  {
    const pagina2 = leer("app/(private)/facturas/nueva/page.tsx");
    const comp = leer("app/(private)/facturas/nueva/cantidad-anadido.tsx");
    const selector = pagina2.slice(pagina2.indexOf("function SelectorProducto("), pagina2.indexOf("type ItemBusqueda"));

    cierto("E01-R02-02 selector: «Añadir» registra el alta con la clave de la línea (nueva o existente) y muestra el campo Cantidad de ESE producto dentro del diálogo, sin cerrarlo; «Listo» y la multi-alta se conservan", /const clave = alAgregar\(p\); setUltimo\(\(u\) => registrarAnadido\(u, clave, p\.descripcion\)\)/.test(selector) && /\{ultimo \? <CantidadAnadido /.test(selector) && /valor=\{cantidadDe\(ultimo\.clave\)\}/.test(selector) && /valida=\{cantidadFacturaValida\(cantidadDe\(ultimo\.clave\)\)\}/.test(selector) && /alCambiar=\{\(v\) => alEditarCantidad\(ultimo\.clave, v\)\}/.test(selector) && /role="dialog" aria-modal="true"/.test(selector) && /onClick=\{alCerrar\}>Listo</.test(selector));
    cierto("E01-R02-03 agregar devuelve la clave de la línea en AMBAS ramas (producto nuevo y repetido, que suma 1 exacto) y el selector edita la línea real vía editar(clave, { cantidad })", /function agregar\(p: Producto\): number \{/.test(pagina2) && /return existente\.clave;/.test(pagina2) && /return siguienteClave;/.test(pagina2) && /alEditarCantidad=\{\(clave, valor\) => editar\(clave, \{ cantidad: valor \}\)\}/.test(pagina2) && /cantidadDe=\{\(clave\) => lineas\.find\(\(x\) => x\.clave === clave\)\?\.cantidad \?\? "1"\}/.test(pagina2) && /sumarUnaUnidad\(l\.cantidad\)/.test(pagina2));
    cierto("E01-R02-04 accesibilidad: el campo vive DENTRO del diálogo aria-modal (el foco no sale de él), con grupo/etiqueta asociada, foco y selección en cada solicitud, aria-invalid y Enter devuelve el foco al filtro", /role="group" aria-label="Cantidad del último producto añadido"/.test(comp) && /<label htmlFor="cantidad-anadido">/.test(comp) && /id="cantidad-anadido"/.test(comp) && /campo\.current\?\.focus\(\);\s*campo\.current\?\.select\(\);\s*\}, \[solicitud\]\)/.test(comp) && /aria-invalid=\{valida \? undefined : true\}/.test(comp) && /e\.key === "Enter"/.test(comp) && /alTerminar=\{\(\) => document\.getElementById\("filtro-productos"\)\?\.focus\(\)\}/.test(selector) && /id="filtro-productos"/.test(selector) && !/document\.getElementById\("cantidad-anadido"\)/.test(pagina2));
    cierto("E01-R02-05 reglas fiscales intactas: la validación de la cantidad es la misma (cantidadFacturaValida, coma o punto, hasta 4 decimales), la edición no toca precio/IVA/cliente/estoque y el flujo de la búsqueda rápida sigue enfocando Cantidad", /import \{ cantidadFacturaValida,/.test(pagina2) && /lineaAFocar\.current = siguienteClave/.test(pagina2) && !/precio|afectacion|inventario/.test(comp));
  }

  return fallos;
}
