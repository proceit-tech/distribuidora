/**
 * Inventario — Reposición (ORDEM §2.D, INV-01/02/06/08, INV-T02/T07). El cálculo (lib/reposicion/calculo.ts) NO cambia: se verifica que sus invariantes siguen y que la pantalla solo recomienda.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { puedeAbrirNuevoMovimiento } from "@/lib/inventario/acceso";
import { calcularPlanReposicion, calcularReposicion, transferenciasPlanificadas, type EntradaReposicion } from "@/lib/reposicion/calculo";
import { cantidadSimulada, cargarReposicion, incluirTransitoEfectivo } from "@/lib/reposicion/carga";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [P, A, B, C] = [U(1), U(11), U(12), U(13)];

const entrada = (dep: string, nombre: string, disponible: number, parametros: Partial<EntradaReposicion["parametros"]>, otros: EntradaReposicion["otrosDepositos"], extra: Partial<EntradaReposicion> = {}): EntradaReposicion => ({
  clave: `${P}|${dep}`, ambito: "DEPOSITO", productoId: P, productoCodigo: "P-1", productoDescripcion: "Leche", marca: "", unidad: "Unidad", depositoId: dep, depositoNombre: nombre,
  saldo: { disponible, reservado: 0, cuarentena: 0, transito: 0 }, parametros: { minimo: null, punto: null, maximo: null, cantidadReposicion: null, ...parametros }, otrosDepositos: otros, proveedorPrincipal: null, ...extra,
});

type Resp = { status: number; cuerpo?: unknown } | "red";

export async function verificarCasosInventarioReposicion(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const fetchDe = (r: Resp) => async () => {
    if (r === "red") throw new TypeError("fetch failed");

    return new Response(JSON.stringify(r.cuerpo ?? {}), { status: r.status });
  };

  // ── Carga y permisos (INV-02)
  const cuerpo = (permisos: unknown) => ({ status: 200, cuerpo: { entradas: [], depositos: [{ id: A, nombre: "Central" }], alcanceParcial: true, permisos } });
  const ok = await cargarReposicion(fetchDe(cuerpo({ movimientosVer: true, movimientosCrear: true })));

  igual("carga correcta: entradas, depósitos, alcance parcial y permisos normalizados", [ok.error, ok.datos?.depositos.length, ok.datos?.alcanceParcial, ok.datos?.permisos], ["", 1, true, { movimientosVer: true, movimientosCrear: true }]);
  igual("INV-02 «Preparar transferencia» solo con VER+CREAR: CREAR-only, VER-only, ambos, formato antiguo {movimientos:true} y ausente", await Promise.all([
    { movimientosVer: false, movimientosCrear: true }, { movimientosVer: true, movimientosCrear: false }, { movimientosVer: true, movimientosCrear: true }, { movimientos: true }, undefined,
  ].map(async (p) => puedeAbrirNuevoMovimiento((await cargarReposicion(fetchDe(cuerpo(p)))).datos?.permisos))), [false, false, true, false, false]);
  for (const status of [401, 403, 500]) {
    const r = await cargarReposicion(fetchDe({ status, cuerpo: { error: "Fallo." } }));

    igual(`carga ${status}: sin datos y con código visible (la lista y los permisos anteriores no se conservan)`, [r.datos, r.error.includes(`código ${status}`)], [null, true]);
  }
  igual("respuesta malformada (sin entradas, depósitos no arreglo) o caída de red → error de carga", [
    (await cargarReposicion(fetchDe({ status: 200, cuerpo: { depositos: [] } }))).datos, (await cargarReposicion(fetchDe({ status: 200, cuerpo: { entradas: [], depositos: {} } }))).datos, (await cargarReposicion(fetchDe("red"))).error !== "",
  ], [null, null, true]);

  // ── INV-06 / INV-08: Simular es local; el tránsito nunca cuenta por defecto
  igual("INV-06 sin simulación activa las cantidades escritas no se aplican; con ella, solo valores válidos ≥ 0", [
    cantidadSimulada({ k: "7" }, "k", false), cantidadSimulada({ k: "7" }, "k", true), cantidadSimulada({ k: "" }, "k", true), cantidadSimulada({ k: "-1" }, "k", true), cantidadSimulada({ k: "abc" }, "k", true), cantidadSimulada({}, "k", true), cantidadSimulada({ k: "0" }, "k", true),
  ], [null, 7, null, null, null, null, 0]);
  igual("INV-08 el tránsito solo cuenta como hipótesis dentro de la simulación", [incluirTransitoEfectivo(false, true), incluirTransitoEfectivo(true, false), incluirTransitoEfectivo(true, true), incluirTransitoEfectivo(false, false)], [false, false, true, false]);
  const conTransito = entrada(B, "Norte", 0, { minimo: 5, maximo: 20 }, [], { saldo: { disponible: 0, reservado: 0, cuarentena: 0, transito: 8 } });

  igual("INV-08 el saldo en tránsito no evita la necesidad por defecto; solo la hipótesis explícita lo cuenta", [calcularReposicion(conTransito, { incluirTransito: false }).criticidad, calcularReposicion(conTransito, { incluirTransito: true }).criticidad], ["SIN_STOCK", "OK"]);

  // ── INV-01: Stock «Normal» y Reposición «En punto»
  const enPunto = calcularReposicion(entrada(B, "Norte", 8, { minimo: 5, punto: 10, maximo: 30 }, []), { incluirTransito: false });

  igual("INV-01 disponible 8 con mínimo 5 y punto 10: Reposición lo marca «En punto de reposición» y sugiere hasta el máximo (Stock lo muestra Normal)", [enPunto.criticidad, enPunto.necesita, enPunto.sugerida], ["EN_PUNTO", true, 22]);

  // ── INV-T02: origen compartido, sin sobreasignar, parámetros y consolidado
  const origenA = { id: A, nombre: "Central", disponible: 15, minimo: 3, punto: 5 };
  const planes = calcularPlanReposicion([
    entrada(B, "Norte", 0, { minimo: 5, punto: 8, maximo: 20 }, [origenA, { id: C, nombre: "Sur", disponible: 2, minimo: 3, punto: 5 }]),
    entrada(C, "Sur", 2, { minimo: 3, punto: 5, maximo: 18 }, [origenA, { id: B, nombre: "Norte", disponible: 0, minimo: 5, punto: 8 }]),
  ], { incluirTransito: false });
  const cedido = planes.flatMap((f) => f.transferencias.filter((t) => t.depositoId === A).map((t) => t.cantidad)).reduce((a, n) => a + n, 0);

  igual("INV-T02 A (15, punto 5) cede a B y C una sola vez: la suma cedida no supera el excedente (10) y A conserva su punto", [cedido, cedido <= 10, 15 - cedido >= 5], [10, true, true]);
  igual("INV-T02 el faltante de los destinos pasa a compra (sin pedido automático): la suma transferencia + compra cubre la meta de cada destino", planes.map((f) => [f.depositoNombre, f.sugerida, f.sugeridaTransferencia + (f.sugeridaCompra ?? 0)]).sort(), [["Norte", 20, 20], ["Sur", 16, 16]]);
  const sinParametros = calcularReposicion(entrada(B, "Norte", 0, { minimo: 5, maximo: 20 }, [{ id: A, nombre: "Central", disponible: 50, minimo: null, punto: null }]), { incluirTransito: false });

  igual("INV-T02 un origen sin parámetros nunca se asigna: queda «a validar» y no reduce la compra", [sinParametros.transferencias, sinParametros.aValidarManualmente.map((v) => v.disponible), sinParametros.sugeridaCompra], [[], [50], 20]);
  const ref = calcularReposicion(entrada(B, "Total", 0, { minimo: 5, maximo: 20 }, [], { ambito: "CONSOLIDADO", soloReferencia: true }), { incluirTransito: false });

  igual("INV-T02 el consolidado con planes por depósito es solo referencia: no genera necesidad, compra ni transferencia", [ref.necesita, ref.sugeridaCompra, ref.sugeridaTransferencia], [false, 0, 0]);
  igual("INV-T07 la cantidad preparada desde la simulación nunca supera lo confirmado por el plan; sin simulación se usa la sugerida", (() => {
    const f = planes.find((x) => x.depositoId === B)!;
    const total = (n: number | null) => transferenciasPlanificadas(f, n).reduce((a, t) => a + t.cantidad, 0);

    return [total(null), total(1000), total(3), total(0)];
  })(), [f2(planes), f2(planes), 3, 0]);

  // ── Código: la pantalla recomienda; no ejecuta
  const pagina = leer("app/(private)/reposicion/page.tsx");
  const api = leer("app/api/reposicion/route.ts");
  const calculo = leer("lib/reposicion/calculo.ts");

  cierto("INV-T07 la pantalla no escribe nada: sin fetch con POST/PUT/DELETE, sin botón de compra ni pedido, y el único destino operativo es el formulario real de Movimientos", !/method:\s*"(POST|PUT|DELETE)"/.test(pagina) && !/Comprar ahora|Generar pedido|Crear orden|Registrar compra/i.test(pagina) && /enlaceNuevoMovimiento/.test(pagina) && !/export async function (POST|PUT|DELETE)/.test(api));
  cierto("INV-06 «Simular» es una acción secundaria con aviso inequívoco (local, no guarda, no reserva, no ejecuta, se pierde al salir); la grilla principal ya no tiene la columna «A planificar»", /alternarSimulacion/.test(pagina) && /Simulación local\./.test(pagina) && /no se guardan, no reservan stock y no generan compras ni movimientos/.test(pagina) && !/A planificar/.test(pagina) && /setPlan\(\{\}\)/.test(pagina));
  cierto("grilla principal enxuta: Producto · Depósito · Disponible · Necesidad / meta · Recomendación / acción; R/C/T, mín./punto/máx., proveedor y advertencias en el detalle del renglón", /titulo="Producto"/.test(pagina) && /titulo="Depósito"/.test(pagina) && /titulo="Disponible"/.test(pagina) && /titulo="Necesidad \/ meta"/.test(pagina) && /titulo="Recomendación \/ acción"/.test(pagina) && !/titulo="R \/ C \/ T"/.test(pagina) && !/titulo="Mín\. \/ Punto \/ Máx\."/.test(pagina) && /Parámetros \(Mín\. \/ Punto \/ Máx\.\)/.test(pagina) && /Saldo propio:/.test(pagina));
  cierto("INV-08 el selector de tránsito de la barra desapareció: el tránsito es informativo y solo se prueba como hipótesis dentro de Simular, rotulada «no está confirmado»", !/Considerar como ingreso/.test(pagina) && /Hipótesis: contar el tránsito como ingreso \(no está confirmado/.test(pagina));
  cierto("INV-02 pantalla y API: el atajo «Preparar transferencia» y el enlace a Movimientos usan los permisos VER/CREAR de la API", /puedeAbrirNuevoMovimiento\(permisos\)/.test(pagina) && /puedeVerMovimientos\(permisos\)/.test(pagina) && /movimientosVer: hasPermission\(acceso, "MOVIMIENTOS", "VER"\)/.test(api) && /movimientosCrear: hasPermission\(acceso, "MOVIMIENTOS", "CREAR"\)/.test(api));
  cierto("los parámetros se editan solo en Productos (la pantalla lo indica y no tiene formularios de parámetros); INV-01: la ayuda explica Bajo mínimo (Stock) frente a punto de reposición", /Productos › Inventario/.test(pagina) && !/<form/.test(pagina) && /Stock «Bajo mínimo» ≠ Reposición/.test(pagina));
  cierto("el cálculo conserva sus invariantes (terceros, reserva sin doble descuento, parámetros por depósito, consolidado solo referencia, origen compartido asignado una vez, compra sin pedido, unidad identificada)", /soloReferencia/.test(calculo) && /restante/.test(calculo) && /AUD-REP-04/.test(calculo) && /Los saldos de terceros no participan/.test(calculo) && /RESERVADO ya es un estado aparte/.test(calculo) && /UNIDAD_ETIQUETADA/.test(calculo) && /Nunca se transfiere ni se compra automáticamente/.test(calculo));

  return fallos;
}

function f2(planes: ReturnType<typeof calcularPlanReposicion>): number {
  const f = planes.find((x) => x.depositoId === B)!;

  return f.sugeridaTransferencia;
}
