/**
 * MOV-D02 — historial de Movimientos: solo datos de la consulta vigente. Se ejercita la lógica REAL que usa la pantalla (`derivarVista` y `lanzarConsulta`) con promesas controladas y respuestas fuera de orden; el
 * «estado de pantalla» replica el cableado del efecto (al cambiar la clave se invalida la consulta anterior y se lanza la nueva). No es una prueba de renderizado de React ni de navegador.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import type { RespuestaHistorial } from "@/lib/movimientos/cliente-api";
import { derivarVista, lanzarConsulta, type ResultadoHistorial } from "@/lib/movimientos/vista-historial";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");
const tick = () => new Promise((r) => setTimeout(r, 0));

const datos = (etiqueta: string, over: Partial<RespuestaHistorial> = {}) =>
  ({
    movimientos: [{ id: etiqueta, numero: etiqueta }],
    total: 100,
    totalMovimientos: 80,
    pagina: 1,
    totalPaginas: 5,
    resumen: { movimientos: 80, entradas: 30, salidas: 40, transferencias: 10 },
    permisos: { crear: true },
    ...over,
  }) as unknown as RespuestaHistorial;

const diferida = () => {
  let ok: (d: RespuestaHistorial) => void = () => undefined;
  let ko: (e: Error) => void = () => undefined;
  const p = new Promise<RespuestaHistorial>((res, rej) => { ok = res; ko = rej; });

  return { p, ok, ko };
};

/** Pantalla simulada: `consultar(clave, cargar)` replica el efecto (cancela la anterior y lanza la nueva); `vista()` es lo que se renderizaría. */
function pantalla() {
  let resultado: ResultadoHistorial | null = null;
  let clave = "";
  let cancelar: (() => void) | null = null;
  const consultar = (nuevaClave: string, cargar: () => Promise<RespuestaHistorial>) => {
    cancelar?.();
    clave = nuevaClave;
    cancelar = lanzarConsulta(cargar, nuevaClave, (r) => { resultado = r; });
  };

  return { consultar, vista: () => derivarVista(resultado, clave, true), desmontar: () => cancelar?.() };
}

export async function verificarCasosMovimientosHistorial(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const ids = (v: ReturnType<typeof derivarVista>) => (v.datos?.movimientos as unknown as Array<{ id: string }> | undefined)?.map((m) => m.id) ?? [];

  // 1) y 2) A cargada → filtro B pendiente: nada de A bajo B; luego solo B.
  const p = pantalla();
  const dA = diferida();
  const dB = diferida();

  p.consultar("A", () => dA.p);
  dA.ok(datos("A"));
  await tick();

  igual("1a: consulta A cargada → se ve A con su resumen, totales y permiso", [ids(p.vista()), p.vista().cargando, p.vista().datos?.resumen.movimientos, p.vista().datos?.permisos?.crear], [["A"], false, 80, true]);

  p.consultar("B", () => dB.p);

  igual("1b/10: con el filtro B pendiente NO queda nada de A: ni filas, ni resumen, ni totales, ni paginación, ni permiso «Nuevo movimiento»; la pantalla está en carga (no es un resultado vacío)", [p.vista().cargando, p.vista().datos, p.vista().error, ids(p.vista())], [true, null, "", []]);

  dB.ok(datos("B", { total: 3, totalMovimientos: 3, totalPaginas: 1, resumen: { movimientos: 3, entradas: 0, salidas: 0, transferencias: 3 } }));
  await tick();

  igual("2: B responde → solo filas, totales, resumen y paginación de B", [ids(p.vista()), p.vista().cargando, p.vista().datos?.total, p.vista().datos?.totalPaginas, p.vista().datos?.resumen.transferencias], [["B"], false, 3, 1, 3]);

  // 3) A responde después de B (fuera de orden): B permanece.
  const p3 = pantalla();
  const a3 = diferida();
  const b3 = diferida();

  p3.consultar("A", () => a3.p);
  p3.consultar("B", () => b3.p);
  b3.ok(datos("B"));
  await tick();
  a3.ok(datos("A"));
  await tick();

  igual("3: A responde DESPUÉS de B → B permanece (A no sustituye, limpia ni altera nada)", [ids(p3.vista()), p3.vista().cargando], [["B"], false]);

  // 4) A → B → C rápido: solo C.
  const p4 = pantalla();
  const [a4, b4, c4] = [diferida(), diferida(), diferida()];

  p4.consultar("A", () => a4.p);
  p4.consultar("B", () => b4.p);
  p4.consultar("C", () => c4.p);
  c4.ok(datos("C"));
  await tick();
  b4.ok(datos("B"));
  a4.ko(new Error("error tardío de A"));
  await tick();

  igual("4: filtro A → B → C rápido: solo C puede mostrarse; ni los datos tardíos de B ni el error tardío de A", [ids(p4.vista()), p4.vista().error, p4.vista().cargando], [["C"], "", false]);

  // 5) y 6) Cambios de página y de orden: la clave distinta oculta lo anterior.
  const p5 = pantalla();
  const pagina1 = diferida();
  const pagina2 = diferida();

  p5.consultar("q|pagina1", () => pagina1.p);
  pagina1.ok(datos("pag1", { pagina: 1 }));
  await tick();
  p5.consultar("q|pagina2", () => pagina2.p);

  igual("5: al cambiar de página, filas y paginación de la página anterior no se muestran como actuales (sin 1/5 ni «Mostrando 1–20»)", [p5.vista().datos, p5.vista().cargando], [null, true]);

  pagina2.ok(datos("pag2", { pagina: 2 }));
  await tick();
  const ordenAsc = diferida();

  p5.consultar("q|pagina2|orden-asc", () => ordenAsc.p);

  igual("6: al cambiar el orden, los datos con el orden anterior no aparecen bajo el nuevo; llegan los nuevos y solo ellos", [p5.vista().datos, (ordenAsc.ok(datos("asc", { pagina: 1 })), await tick(), ids(p5.vista()))], [null, ["asc"]]);

  // 7) y 8) Error de la consulta vigente: no reaparecen datos viejos; reintentar entrega solo datos válidos.
  const p7 = pantalla();
  const base = diferida();
  const fallida = diferida();

  p7.consultar("A", () => base.p);
  base.ok(datos("A"));
  await tick();
  p7.consultar("B", () => fallida.p);
  fallida.ko(new Error("No fue posible cargar los movimientos."));
  await tick();

  igual("7: B falla → se informa el error de B, sin datos (A no reaparece) y no es un resultado vacío legítimo", [p7.vista().error, p7.vista().datos, p7.vista().cargando, ids(p7.vista())], ["No fue posible cargar los movimientos.", null, false, []]);

  const reintento = diferida();

  p7.consultar("B|recarga1", () => reintento.p);

  igual("8a: al reintentar B vuelve el estado de carga y el error anterior se limpia (no se ven ni datos de A ni el error viejo)", [p7.vista().cargando, p7.vista().error, p7.vista().datos], [true, "", null]);

  reintento.ok(datos("B2"));
  await tick();

  igual("8b: la respuesta válida de B reemplaza todo; solo se presentan sus datos", [ids(p7.vista()), p7.vista().error, p7.vista().cargando], [["B2"], "", false]);

  // 9) Vacío legítimo vs carga vs error (la pantalla decide con cargando/error/filas).
  const p9 = pantalla();
  const vacio = diferida();

  p9.consultar("vacio", () => vacio.p);
  const durante = p9.vista();

  vacio.ok(datos("x", { movimientos: [], total: 0, totalMovimientos: 0, totalPaginas: 1, resumen: { movimientos: 0, entradas: 0, salidas: 0, transferencias: 0 } }));
  await tick();
  const tras = p9.vista();
  const mensaje = (v: ReturnType<typeof derivarVista>) => (v.cargando ? "Cargando movimientos..." : v.error ? "No se pudo cargar el historial" : (v.datos?.movimientos.length ?? 0) === 0 ? "No se encontraron movimientos" : "filas");

  igual("9/10: carga pendiente → «Cargando…» (jamás «No se encontraron»); respuesta vacía legítima → «No se encontraron movimientos»; error → «No se pudo cargar»", [mensaje(durante), mensaje(tras), mensaje({ cargando: false, datos: null, error: "x" })], ["Cargando movimientos...", "No se encontraron movimientos", "No se pudo cargar el historial"]);

  // 11) botones de paginación; 13) permiso de la respuesta vigente; 14) líneas vs movimientos distintos.
  const pb = pantalla();
  const dp = diferida();

  pb.consultar("A", () => Promise.resolve(datos("A", { permisos: { crear: false } } as Partial<RespuestaHistorial>)));
  await tick();
  const sinPermiso = pb.vista().datos?.permisos?.crear;

  pb.consultar("B", () => dp.p);
  const nuevoDurante = pb.vista().datos?.permisos?.crear === true;

  dp.ok(datos("B", { permisos: { crear: true } } as Partial<RespuestaHistorial>));
  await tick();

  igual("13: «Nuevo movimiento» solo con el permiso de la respuesta VIGENTE: false con A sin CREAR, oculto mientras B está pendiente, visible solo cuando B (con CREAR) responde", [sinPermiso, nuevoDurante, pb.vista().datos?.permisos?.crear], [false, false, true]);
  igual("14: las líneas (total) y los movimientos distintos (totalMovimientos) se conservan tal cual vienen del servidor, sin recálculo en el cliente", [pb.vista().datos?.total, pb.vista().datos?.totalMovimientos], [100, 80]);

  // Desmontaje: ninguna respuesta tardía actualiza.
  const pd = pantalla();
  const dd = diferida();

  pd.consultar("A", () => dd.p);
  pd.desmontar();
  dd.ok(datos("A"));
  await tick();

  igual("desmontaje: una respuesta posterior al desmontaje no produce resultado", [pd.vista().datos, pd.vista().cargando], [null, true]);

  // 12/15 y estructura de la pantalla (complemento).
  const pagina = leer("app/(private)/movimientos/page.tsx");

  cierto("pantalla (estructura): todo se deriva de derivarVista con la clave vigente — resumen/filas/total/permiso/paginación («—» en carga, botones bloqueados sin datos); el debounce de 300 ms alimenta la consulta; la confirmación ?ok sigue validada por el servidor (confirmado) y sin éxito falso ante error; la consulta se lanza con lanzarConsulta", /derivarVista\(resultado, claveConsulta, listo\)/.test(pagina) && /lanzarConsulta\(/.test(pagina) && !/resultado\?\.datos/.test(pagina) && /setTimeout\(\(\) => setBusquedaAplicada\(busqueda\.trim\(\)\), 300\)/.test(pagina) && /JSON\.stringify\(\[busquedaAplicada, tipo, orden\]\)/.test(pagina) && /resumen \? resumen\.movimientos : "—"/.test(pagina) && /disabled=\{!datos \|\| paginaMostrada <= 1 \|\| cargando\}/.test(pagina) && /disabled=\{!datos \|\| paginaMostrada >= totalPaginas \|\| cargando\}/.test(pagina) && /datos\?\.permisos\?\.crear === true/.test(pagina) && /r\.datos\?\.confirmado === true/.test(pagina) && /if \(r\.error\) setAvisoSinConfirmar/.test(pagina));

  return fallos;
}
