/**
 * MOV-D03 — el cambio de día en Asunción no puede borrar el formulario de «Nuevo movimiento». Se ejercita la lógica REAL que usa la pantalla (`resolverInicializacion`, `iniciarCargaCatalogos`, `validarMovimiento`,
 * `hoyAsuncion`, `crearControlRegistro`) con promesas controladas y relojes fijos; el «estado de pantalla» replica el cableado (refs inicializado/tocado). No es una prueba de React ni de navegador.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { hoyAsuncion } from "@/lib/listas-precio/calculos";
import { aplicarTipo, movimientoSucio, validarMovimiento } from "@/lib/movimientos/formulario";
import { iniciarCargaCatalogos, resolverInicializacion } from "@/lib/movimientos/inicializacion";
import { crearControlRegistro, type ResultadoRegistro } from "@/lib/movimientos/intento";
import type { CatalogoMovimientos, NuevoMovimientoStock } from "@/types/movimientos-stock";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");
const tick = () => new Promise((r) => setTimeout(r, 0));
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [PROD, DEP_A, DEP_B, DEP_X] = [U(1), U(11), U(12), U(13)];

const catalogo = {
  monedaBase: "PYG",
  depositos: [
    { id: DEP_A, codigo: "A", nombre: "Central", permitido: true },
    { id: DEP_B, codigo: "B", nombre: "Norte", permitido: true },
    { id: DEP_X, codigo: "X", nombre: "Ajeno", permitido: false },
  ],
  productos: [{ id: PROD, codigo: "P-1", descripcion: "Leche", unidadMedidaNombre: "Unidad", modoControl: "CANTIDAD", stock: [], lotes: [] }],
} as unknown as CatalogoMovimientos;

const diferida = () => {
  let ok: (c: CatalogoMovimientos) => void = () => undefined;
  let ko: (e: Error) => void = () => undefined;
  const p = new Promise<CatalogoMovimientos>((res, rej) => { ok = res; ko = rej; });

  return { p, ok, ko };
};

/** Pantalla simulada: mismo cableado que el componente (carga única por intento; refs inicializado/tocado; la inicialización solo la aplica resolverInicializacion). */
function pantalla(hoyInicial: string, consulta = "") {
  const st = { catalogo: null as CatalogoMovimientos | null, form: null as NuevoMovimientoStock | null, base: null as NuevoMovimientoStock | null, cantidadTxt: "", error: "", aviso: "", inicializaciones: 0 };
  const refs = { inicializado: false, tocado: false };
  const cargar = (c: () => Promise<CatalogoMovimientos>) =>
    iniciarCargaCatalogos(c, {
      alCargar: (cat) => {
        const ini = resolverInicializacion({ ...refs, catalogos: cat, consulta: new URLSearchParams(consulta), hoyInicial });

        if (!ini.aplicar) return;
        refs.inicializado = true;
        st.inicializaciones += 1;
        st.catalogo = cat;
        st.error = "";
        st.form = ini.formulario;
        st.base = ini.formulario;
        st.cantidadTxt = ini.cantidadTxt;
        if (ini.descartados.length) st.aviso = ini.descartados.join(", ");
      },
      alFallar: (m) => { st.error = m; },
    });
  const editar = (parcial: Partial<NuevoMovimientoStock>) => { refs.tocado = true; st.form = { ...st.form!, ...parcial }; };

  return { st, cargar, editar, refs };
}

export async function verificarCasosMovimientosInicializacion(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const D = "2026-10-19";
  const D1 = "2026-10-20";

  // 1) y 2) Apertura con fecha D: catálogos y formulario inicializados (fecha sugerida = D).
  const p = pantalla(D);
  const d1 = diferida();

  p.cargar(() => d1.p);
  d1.ok(catalogo);
  await tick();

  igual("1/2: la apertura inicializa el formulario UNA vez con la fecha sugerida de Asunción (D) y los catálogos cargados", [p.st.form?.fecha, p.st.catalogo === catalogo, p.st.inicializaciones, p.st.form?.productoId, p.st.cantidadTxt], [D, true, 1, "", ""]);

  // 3) Relleno parcial en D.
  p.editar({ productoId: PROD, cantidad: 4, depositoDestinoId: DEP_A, motivo: "conteo inicial", documentoReferencia: "OC-1", observacion: "obs", lote: "L1" });
  const antes = JSON.stringify(p.st.form);

  igual("3: el operador completa parte del movimiento en la fecha D (queda sin guardar y protegido)", [p.st.form?.productoId, p.st.form?.cantidad, movimientoSucio(p.st.form!, p.st.base!)], [PROD, 4, true]);

  // 4) y 5) Paso a D+1 y nueva renderización: la carga NO se repite (depende solo del intento) y, aunque llegara otra respuesta, no restaura.
  const ahoraD1 = hoyAsuncion(new Date("2026-10-20T03:01:00Z")); // 00:01 del 20/10 en Asunción
  const antesDeMedianoche = hoyAsuncion(new Date("2026-10-20T02:59:00Z"));
  const respuestaDuplicada = resolverInicializacion({ ...p.refs, catalogos: catalogo, consulta: new URLSearchParams(), hoyInicial: ahoraD1 });

  igual("4/5: Asunción pasa de D a D+1 (00:01 del 20/10 = 03:01 UTC) y, aunque una respuesta de catálogos llegue de nuevo, NO se aplica (ya inicializado y editado): el formulario no cambia ni un campo", [antesDeMedianoche, ahoraD1, respuestaDuplicada, JSON.stringify(p.st.form) === antes, p.st.inicializaciones], [D, D1, { aplicar: false }, true, 1]);

  // 6) La fecha elegida por el operador no se modifica.
  p.editar({ fecha: "2026-10-18" });
  const fechaElegida = p.st.form?.fecha;

  igual("6: la fecha digitada por el operador permanece intacta tras el cambio de día (no se reemplaza por la nueva fecha sugerida)", [fechaElegida, resolverInicializacion({ ...p.refs, catalogos: catalogo, consulta: new URLSearchParams(), hoyInicial: ahoraD1 }), p.st.form?.fecha], ["2026-10-18", { aplicar: false }, "2026-10-18"]);

  // 7) Validación con la referencia vigente de Asunción.
  const f = { ...p.st.form!, fecha: D, tipo: "ENTRADA", origen: "COMPRA", costoUnitario: 100 } as NuevoMovimientoStock;
  const errFecha = (fecha: string, hoy: string) => validarMovimiento({ ...f, fecha }, catalogo, hoy).fecha ?? "";

  igual("7: al registrar se valida con la fecha VIGENTE de Asunción: un movimiento fechado D sigue siendo válido en D+1; una fecha D+2 sigue siendo futura; D+1 era futura el día D y es válida el día D+1", [errFecha(D, D1), errFecha("2026-10-21", D1), errFecha(D1, D), errFecha(D1, D1)], ["", "La fecha del movimiento no puede ser futura.", "La fecha del movimiento no puede ser futura.", ""]);

  // 8) Respuesta tardía no sustituye un formulario ya editado.
  const p8 = pantalla(D);
  const d8 = diferida();

  p8.cargar(() => d8.p);
  p8.editar({ productoId: "x", cantidad: 9 }); // (en la pantalla real los campos están deshabilitados hasta cargar; se prueba igualmente la defensa)
  d8.ok(catalogo);
  await tick();

  igual("8: una respuesta de catálogos posterior a una edición NO sustituye el formulario ya editado", [p8.st.form?.productoId, p8.st.form?.cantidad, p8.st.inicializaciones], ["x", 9, 0]);

  // 9) Precarga válida en la inicialización legítima, con descartes informados.
  const p9 = pantalla(D, `producto=${PROD}&tipo=TRANSFERENCIA&depositoOrigen=${DEP_A}&depositoDestino=${DEP_X}&cantidad=3`);
  const d9 = diferida();

  p9.cargar(() => d9.p);
  d9.ok(catalogo);
  await tick();

  igual("9: los datos precargados de la URL se aplican en la inicialización legítima (producto, tipo, depósito origen, cantidad) y el depósito no permitido se descarta con aviso", [p9.st.form?.productoId, p9.st.form?.tipo, p9.st.form?.depositoOrigenId, p9.st.form?.depositoDestinoId, p9.st.form?.cantidad, p9.st.cantidadTxt, p9.st.aviso], [PROD, "TRANSFERENCIA", DEP_A, "", 3, "3", "el depósito destino"]);

  // 10) Cambios normales de producto, depósito y tipo.
  const f10 = aplicarTipo({ ...p.st.form!, depositoDestinoId: DEP_A }, "SALIDA");

  p.editar({ productoId: PROD, depositoDestinoId: DEP_B });
  igual("10: cambiar tipo, producto y depósito sigue funcionando con normalidad", [f10.tipo, p.st.form?.depositoDestinoId], ["SALIDA", DEP_B]);

  // 11) Error en la carga inicial: no restaura nada; reintento inicializa una sola vez; respuesta duplicada ignorada.
  const p11 = pantalla(D);
  const d11 = diferida();

  p11.cargar(() => d11.p);
  d11.ko(new Error("No fue posible cargar los catálogos."));
  await tick();
  const trasError = [p11.st.error, p11.st.form, p11.st.inicializaciones];
  const d11b = diferida();

  p11.cargar(() => d11b.p);
  d11b.ok(catalogo);
  await tick();
  const repetida = diferida();

  p11.cargar(() => repetida.p);
  repetida.ok(catalogo);
  await tick();

  igual("11: el error de la carga inicial se informa sin inicializar nada; el reintento correcto inicializa UNA vez y borra el error; una respuesta posterior no reinicializa", [trasError, p11.st.error, p11.st.inicializaciones, p11.st.form?.fecha], [["No fue posible cargar los catálogos.", null, 0], "", 1, D]);

  // 12) Cambios sin guardar protegidos: la pantalla los mantiene en el estado y la protección sigue activa.
  const pagina = leer("app/(private)/movimientos/nuevo/page.tsx");

  igual("12: tras editar y cambiar de día el borrador sigue marcado como sucio (la protección de navegación depende de este valor)", [movimientoSucio(p.st.form!, p.st.base!)], [true]);

  // 13) y 14) POST pendiente / indeterminado durante el cambio de día: K1 y payload no cambian.
  let n = 0;
  let falla = true;
  let liberar: () => void = () => undefined;
  const espera = new Promise<void>((r) => { liberar = r; });
  const enviados: Array<{ clave: string; fecha: string; cantidad: number }> = [];
  const control = crearControlRegistro({
    generarClave: () => `clave-K${++n}-00000000`,
    enviar: async (d): Promise<ResultadoRegistro> => {
      enviados.push({ clave: d.claveIdempotencia, fecha: d.fecha, cantidad: d.cantidad });
      await espera;

      return falla ? { tipo: "INDETERMINADO", mensaje: "x" } : { tipo: "OK", numero: "MOV-000001", repetido: true };
    },
  });
  const envio = control.registrar({ ...p.st.form!, fecha: D });
  const claveEnCurso = control.clave();
  const reinicio = resolverInicializacion({ ...p.refs, catalogos: catalogo, consulta: new URLSearchParams(), hoyInicial: D1 });

  igual("13: con el POST pendiente al cambiar de día no hay reinicialización (aplicar=false), la clave K1 y el snapshot siguen y el formulario continúa bloqueado", [reinicio, control.clave(), claveEnCurso, control.bloqueado(), control.payload()?.fecha], [{ aplicar: false }, "clave-K1-00000000", "clave-K1-00000000", true, D]);

  liberar();
  await envio;
  falla = false;
  const reintento = await control.registrar({ ...p.st.form!, fecha: D1, cantidad: 99 });

  igual("14: tras un resultado indeterminado el reintento reenvía K1 con el payload original (fecha D y cantidad originales), aunque el día haya cambiado y la pantalla tenga otros datos", [enviados.map((e) => e.clave), enviados.map((e) => e.fecha), enviados.map((e) => e.cantidad), reintento], [["clave-K1-00000000", "clave-K1-00000000"], [D, D], [4, 4], { tipo: "OK", numero: "MOV-000001", repetido: true }]);

  // 15) Componente desmontado: la respuesta tardía no produce efectos.
  const p15 = pantalla(D);
  const d15 = diferida();
  const desmontar = p15.cargar(() => d15.p);

  desmontar();
  d15.ok(catalogo);
  await tick();

  igual("15: tras desmontar, la respuesta tardía de catálogos no inicializa ni modifica nada", [p15.st.form, p15.st.catalogo, p15.st.inicializaciones], [null, null, 0]);

  cierto("pantalla (estructura): la carga de catálogos depende solo de `intentoCarga` (ya no de la fecha), la fecha inicial se fija una vez, el registro valida con hoyAsuncion() del momento, los manejadores marcan `tocado`, y «Reintentar» relanza la carga sin tocar el borrador", /\}, \[intentoCarga\]\);/.test(pagina) && !/\[hoy\]/.test(pagina) && /const \[hoyInicial\] = useState\(\(\) => hoyAsuncion\(\)\)/.test(pagina) && /validarMovimiento\(datos, catalogo, hoyAsuncion\(\)\)/.test(pagina) && (pagina.match(/tocado\.current = true;/g) ?? []).length === 4 && /resolverInicializacion\(\{ inicializado: inicializado\.current, tocado: tocado\.current/.test(pagina) && /setIntentoCarga\(\(n\) => n \+ 1\)/.test(pagina) && !/setInterval|setTimeout\(.*hoy/.test(pagina));

  return fallos;
}
