/**
 * Reportes — Stock crítico y reposición (AUD-RPT-R05, RPT-C03-01…07; matriz RPT-T-C01…C09).
 * Sin PostgreSQL ni navegador: conexión simulada con datos de Reposición; el informe se compara con `calcularPlanReposicion` sobre los MISMOS datos
 * (motor único). Los XLSX se abren y se comparan celda a celda. Los mocks prueban la forma de las lecturas y la lógica, NO la serialización real de PostgreSQL.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { calcularPlanReposicion } from "@/lib/reposicion/calculo";
import { leerEntradasReposicion } from "@/lib/reposicion/datos";
import { crearCompuerta } from "@/lib/productos/catalogos-carga";
import { generarPdfTabla, generarXlsxTabla } from "@/lib/reportes/export";
import { leerHojaXlsx } from "@/lib/reportes/export-xlsx.casos";
import { columnasStockCritico, tablaStockCritico } from "@/lib/reportes/export-stock-critico";
import { pedirStockCritico } from "@/lib/reportes/cliente-stock-critico";
import { leerStockCritico, parsearFiltrosStockCritico } from "@/lib/reportes/stock-critico";
import { agruparPorProducto, contarReferencias, costoUnitario, filtrosIguales, respuestaStockCriticoValida, respuestaVigente, type Detalle } from "@/lib/reportes/stock-critico-plan";
import type { StockCriticoFiltros, StockCriticoRespuesta, StockCriticoRespuestaApi } from "@/types/reportes";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const EMP = U(1), USR = U(2);
const DA = U(20), DB = U(21), DC = U(22);
const P1 = U(30), P2 = U(31), P3 = U(32), P4 = U(33);
const FILTROS: StockCriticoFiltros = { vista: "DEPOSITO", q: "", depositoId: "", categoriaId: "", marcaId: "", familiaId: "", situacion: "TODAS" };

type Dato = Record<string, unknown>;
type Escenario = {
  productos: Dato[]; saldos: Dato[]; config: Dato[]; visibles: Dato[]; costos: Dato[]; total?: number;
};
type Consulta = { sql: string; params?: unknown[] };

const prod = (id: string, codigo: string, desc: string, unidad: string, extra: Dato = {}): Dato => ({
  id, codigo, descripcion: desc, marca: "Marca 1", unidad, minimo: null, maximo: null, punto: null, modoControl: "CANTIDAD", proveedorNombre: null, proveedorPlazo: null, proveedorMinima: null, ...extra,
});
const saldo = (p: string, d: string, estado: string, cantidad: number): Dato => ({ productoId: p, depositoId: d, estado, cantidad });
const cfg = (p: string, d: string, minimo: number | null, punto: number | null, maximo: number | null, reposicion: number | null = null): Dato => ({ productoId: p, depositoId: d, minimo, punto, maximo, reposicion });
const dep = (id: string, nombre: string): Dato => ({ id, codigo: nombre.slice(0, 3), nombre });

export async function verificarCasosReportesStockCritico(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  const reg: { consultas: Consulta[]; conexiones: number; liberadas: number; poolQuery: number } = { consultas: [], conexiones: 0, liberadas: 0, poolQuery: 0 };
  const responder = (e: Escenario) => (sql: string): Dato[] => {
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return [];
    if (/FROM empresas/.test(sql)) return [{ nombre: "Empresa SA", moneda: "PYG" }];
    if (/FROM stock_saldos s/.test(sql)) return e.saldos;
    if (/FROM producto_deposito_configuracion/.test(sql)) return e.config;
    if (/count\(\*\)::int AS n FROM depositos/.test(sql)) return [{ n: e.total ?? e.visibles.length }];
    if (/producto_proveedores/.test(sql)) return e.productos;
    if (/AS "categoriaId"/.test(sql)) {
      return e.productos.map((p) => ({ id: p.id, codigo: p.codigo, ci: "", gtin: "", descripcion: p.descripcion, categoriaId: p.catId ?? U(40), categoria: p.categoria ?? "Cat 1", marcaId: p.marcaId ?? U(50), familiaId: p.famId ?? U(60), familia: p.familia ?? "Fam 1" }));
    }
    if (/FROM inventario_costos/.test(sql)) return e.costos;
    if (/SELECT d\.id, d\.codigo, d\.nombre FROM depositos d/.test(sql)) return e.visibles;
    if (/categorias_producto WHERE/.test(sql)) return [{ id: U(40), nombre: "Cat 1" }, { id: U(41), nombre: "Cat 2" }];
    if (/marcas_producto WHERE/.test(sql)) return [{ id: U(50), nombre: "Marca 1" }];
    if (/familias_producto WHERE/.test(sql)) return [{ id: U(60), nombre: "Fam 1" }];
    if (/AS t, to_char/.test(sql)) return [{ t: "13/10/2026 10:00", f: "20261013-1000" }];

    return [];
  };
  const fakePool = (e: Escenario, fallo?: (sql: string) => boolean) => ({
    query: async () => { reg.poolQuery += 1; return { rows: [] }; },
    connect: async () => {
      reg.conexiones += 1;

      return {
        query: async (sql: string, params?: unknown[]) => {
          reg.consultas.push({ sql, params });
          if (fallo?.(sql)) throw new Error("fallo de consulta");

          return { rows: responder(e)(sql), rowCount: responder(e)(sql).length };
        },
        release: () => { reg.liberadas += 1; },
      };
    },
  }) as never;
  const reiniciar = () => { reg.consultas = []; reg.conexiones = 0; reg.liberadas = 0; reg.poolQuery = 0; };
  const informe = async (e: Escenario, f: Partial<StockCriticoFiltros> = {}, todas = true, usuario = USR) => {
    reiniciar();

    return leerStockCritico(fakePool(e), EMP, usuario, { ...FILTROS, ...f }, 1, 50, todas) as Promise<StockCriticoRespuesta>;
  };
  const motor = async (e: Escenario) => {
    const d = await leerEntradasReposicion({ query: async (sql: string) => ({ rows: responder(e)(sql), rowCount: responder(e)(sql).length }) } as never, EMP, USR);

    return { datos: d, plan: calcularPlanReposicion(d.entradas, { incluirTransito: false }) };
  };

  // ═══ RPT-T-C01 — el ejemplo de la auditoría: A=30, B=10; B 15/18/25, A 10/12 ═══
  const e1: Escenario = {
    productos: [prod(P1, "P-1", "Aceite", "Litro", { minimo: 20 })],
    saldos: [saldo(P1, DA, "DISPONIBLE", 30), saldo(P1, DB, "DISPONIBLE", 10)],
    config: [cfg(P1, DA, 10, 12, 40), cfg(P1, DB, 15, 18, 25)],
    visibles: [dep(DA, "Central"), dep(DB, "Norte")],
    costos: [{ productoId: P1, depositoId: DB, valor: "1000.0000", cantidad: "10.0000" }, { productoId: P1, depositoId: DA, valor: "600.0000", cantidad: "20.0000" }],
  };
  const r1 = await informe(e1, { situacion: "TODAS" });
  const filaB = r1.filas.find((f) => f.deposito === "Norte")!;
  const filaA = r1.filas.find((f) => f.deposito === "Central")!;

  igual("T-C01 destino B: bajo el mínimo (10 < 15), meta 25 − 10 = 15, transferencia 15 desde Central (que conserva su punto) y compra 0", [filaB.criticidad, filaB.necesita, filaB.sugerida, filaB.transferencia, filaB.compra, filaB.origenes], ["BAJO_MINIMO", true, 15, 15, 0, "Central: 15"]);
  igual("T-C01 el origen A (30 > punto 12) NO es alerta y el consolidado con mínimo global 20 no inventa otra necesidad (un solo plan por producto)", [filaA.criticidad, filaA.necesita, filaA.sugerida, r1.filas.length, r1.totales.referencias], ["OK", false, 0, 2, 1]);

  const m1 = await motor(e1);
  const comparar = (nombre: string, filas: StockCriticoRespuesta["filas"], plan: typeof m1.plan) => {
    const reales = plan.filter((p) => !p.soloReferencia);
    const mapa = new Map(filas.map((f) => [f.clave, f]));
    const dif: string[] = [];

    for (const p of reales) {
      const f = mapa.get(p.clave);

      if (!f) { dif.push(`${p.clave} ausente`); continue; }

      const esperado = [p.criticidad, p.necesita, p.necesita ? (p.sugerida ?? 0) : 0, p.sugeridaTransferencia, p.sugeridaCompra ?? 0, p.posicion, p.necesita && p.sugerida === null ? 1 : 0];
      const obtenido = [f.criticidad, f.necesita, f.sugerida, f.transferencia, f.compra, f.disponible, f.sinMeta];

      if (JSON.stringify(esperado) !== JSON.stringify(obtenido)) dif.push(`${p.clave}: motor ${JSON.stringify(esperado)} informe ${JSON.stringify(obtenido)}`);
    }

    igual(`${nombre}: el informe coincide fila por fila con calcularPlanReposicion sobre los mismos datos (${reales.length} planes)`, [dif, filas.length], [[], reales.length]);
  };

  comparar("T-C01", r1.filas, m1.plan);

  // ═══ RPT-T-C02 — dos destinos compiten por un origen: se cede UNA vez ═══
  const e2: Escenario = {
    productos: [prod(P1, "P-1", "Aceite", "Litro")],
    saldos: [saldo(P1, DA, "DISPONIBLE", 30), saldo(P1, DB, "DISPONIBLE", 0), saldo(P1, DC, "DISPONIBLE", 5)],
    config: [cfg(P1, DA, 10, 12, 40), cfg(P1, DB, 15, 18, 15), cfg(P1, DC, 10, 12, 20)],
    visibles: [dep(DA, "Central"), dep(DB, "Norte"), dep(DC, "Sur")],
    costos: [],
  };
  const r2 = await informe(e2, { situacion: "ALERTAS" });
  const dest = r2.filas.filter((f) => f.necesita);
  const cedido = dest.reduce((a, f) => a + f.transferencia, 0);

  igual("T-C02 el origen Central cede como máximo su disponible sobre el punto (30 − 12 = 18) UNA sola vez entre los destinos; transferencia + compra = meta de cada destino", [cedido <= 18, cedido, dest.map((f) => Math.round((f.transferencia + f.compra) * 10000) / 10000), dest.map((f) => f.sugerida)], [true, 18, dest.map((f) => f.sugerida), dest.map((f) => f.sugerida)]);
  comparar("T-C02", (await informe(e2)).filas, (await motor(e2)).plan);

  // ═══ RPT-T-C03 — sin meta, sin gatillo, depósito sin parámetros ═══
  const e3: Escenario = {
    productos: [prod(P1, "P-1", "Sin meta", "Unidad"), prod(P2, "P-2", "Solo cantidad", "Unidad"), prod(P3, "P-3", "Origen sin parámetros", "Unidad")],
    saldos: [saldo(P1, DB, "DISPONIBLE", 2), saldo(P2, DB, "DISPONIBLE", 1), saldo(P3, DA, "DISPONIBLE", 50), saldo(P3, DB, "DISPONIBLE", 0)],
    config: [cfg(P1, DB, 10, null, null), cfg(P2, DB, null, null, null, 20), cfg(P3, DB, 10, null, 30)],
    visibles: [dep(DA, "Central"), dep(DB, "Norte")],
    costos: [{ productoId: P1, depositoId: DB, valor: "100.0000", cantidad: "10.0000" }],
  };
  const r3 = await informe(e3);
  const f3 = (p: string) => r3.filas.find((f) => f.productoId === p)!;

  igual("T-C03 necesidad sin máximo ni cantidad: sugerida 0 y sinMeta 1 (se informa «Sin meta», no una cantidad inventada); sin valor estimado", [f3(P1).criticidad, f3(P1).necesita, f3(P1).sugerida, f3(P1).sinMeta, f3(P1).valorReferencia], ["BAJO_MINIMO", true, 0, 1, null]);
  igual("T-C03 solo cantidad de reposición (sin mínimo/punto/máximo) = SIN_GATILLO: no es alerta, no sugiere nada", [f3(P2).criticidad, f3(P2).necesita, f3(P2).sugerida], ["SIN_GATILLO", false, 0]);
  igual("T-C03 un depósito de origen sin parámetros NO cede automáticamente: no aparece como origen y el destino compra todo", [f3(P3).origenes, f3(P3).transferencia, f3(P3).sugerida, f3(P3).compra], ["", 0, 30, 30]);
  igual("T-C03 filtro de situación: ALERTAS excluye SIN_GATILLO y OK; TODAS lo incluye; SIN_GATILLO lo aísla", [
    (await informe(e3, { situacion: "ALERTAS" })).filas.map((f) => f.productoId).sort(), (await informe(e3, { situacion: "SIN_GATILLO" })).filas.map((f) => f.productoId),
  ], [[P1, P3].sort(), [P2]]);
  comparar("T-C03", r3.filas, (await motor(e3)).plan);

  // ═══ RPT-T-C04 — consolidado de referencia no aditivo; Por producto consolida solo planes reales ═══
  const e4: Escenario = {
    productos: [prod(P1, "P-1", "Con plan por depósito", "Litro", { minimo: 20, punto: 25, maximo: 60 })],
    saldos: [saldo(P1, DA, "DISPONIBLE", 2), saldo(P1, DB, "DISPONIBLE", 3)],
    config: [cfg(P1, DA, 5, 6, 10), cfg(P1, DB, 5, 6, 12)],
    visibles: [dep(DA, "Central"), dep(DB, "Norte")],
    costos: [{ productoId: P1, depositoId: DA, valor: "200.0000", cantidad: "2.0000" }, { productoId: P1, depositoId: DB, valor: "330.0000", cantidad: "3.0000" }],
  };
  const r4d = await informe(e4, { situacion: "ALERTAS" });
  const r4p = await informe(e4, { situacion: "ALERTAS", vista: "PRODUCTO" });

  igual("T-C04 el consolidado (mínimo/punto/máximo globales) es solo referencia: no aparece como fila ni genera compra duplicada", [r4d.filas.map((f) => f.deposito).sort(), r4d.totales.referencias, r4d.filas.reduce((a, f) => a + f.sugerida, 0)], [["Central", "Norte"], 1, 17]);
  igual("T-C04 Por producto: una fila que suma solo los dos destinos reales del MISMO producto (sin el consolidado): sugerida 8 + 9 = 17, 2 destinos", [r4p.filas.length, r4p.filas[0].destinos, r4p.filas[0].sugerida, r4p.filas[0].disponible, r4p.totales.necesitan], [1, 2, 17, 5, 2]);
  igual("T-C04 el valor de la fila por producto = suma exacta de los valores por destino (100 × 8 + 110 × 9), sin duplicar", [r4d.filas.map((f) => f.valorReferencia).sort(), r4p.filas[0].valorReferencia, r4p.totales.valorReferencia], [["800.0000", "990.0000"], "1790", "1790"]);

  const solo = { ...e4, productos: [prod(P2, "P-2", "Solo global", "Kilo", { minimo: 10, punto: 12, maximo: 30 })], saldos: [saldo(P2, DA, "DISPONIBLE", 4)], config: [], costos: [] };
  const r4g = await informe(solo, { situacion: "ALERTAS" });

  igual("T-C04 un producto sin parámetros por depósito usa el consolidado como plan real (una fila «Todos los depósitos») con su propia meta", [r4g.filas.length, r4g.filas[0]?.ambito, r4g.filas[0]?.deposito, r4g.filas[0]?.sugerida, r4g.totales.referencias], [1, "CONSOLIDADO", "Todos los depósitos", 26, 0]);
  igual("T-C04 con un depósito filtrado no se mezcla el plan consolidado (no pertenece a un depósito concreto)", (await informe(solo, { situacion: "ALERTAS", depositoId: DA })).filas.length, 0);
  comparar("T-C04", (await informe(e4)).filas, (await motor(e4)).plan);

  // ═══ RPT-T-C05 — unidades heterogéneas, valor monetario, costo ausente vs cero ═══
  const e5: Escenario = {
    productos: [prod(P1, "P-1", "Arroz", "Kilo"), prod(P2, "P-2", "Aceite", "Litro"), prod(P3, "P-3", "Sin costo", "Unidad"), prod(P4, "P-4", "Costo en cero", "Unidad")],
    saldos: [saldo(P1, DB, "DISPONIBLE", 0), saldo(P2, DB, "DISPONIBLE", 0), saldo(P3, DB, "DISPONIBLE", 0), saldo(P4, DB, "DISPONIBLE", 0)],
    config: [cfg(P1, DB, 5, null, 25.5), cfg(P2, DB, 1, null, 7), cfg(P3, DB, 1, null, 4), cfg(P4, DB, 1, null, 3)],
    visibles: [dep(DB, "Norte")],
    costos: [
      { productoId: P1, depositoId: DB, valor: "2000.0000", cantidad: "3.0000" }, { productoId: P2, depositoId: DB, valor: "99999999999.9999", cantidad: "1.0000" },
      { productoId: P4, depositoId: DB, valor: "0", cantidad: "0.0000" },
    ],
  };
  const r5 = await informe(e5, { situacion: "ALERTAS" });
  const f5 = (p: string) => r5.filas.find((f) => f.productoId === p)!;

  igual("T-C05 costo exacto en decimal (2000/3 = 666,6667) × 25,5 con redondeo a 4 decimales; valor grande exacto; sin registro de costo y costo en cero → NO se estima (sin costo)", [f5(P1).costoReferencia, f5(P1).valorReferencia, f5(P2).valorReferencia, f5(P3).valorReferencia, f5(P3).destinosSinCosto, f5(P4).valorReferencia, f5(P4).destinosSinCosto], ["666.6667", "17000.0009", "699999999999.9993", null, 1, null, 1]);
  igual("T-C05 el total no tiene cantidad global (kg + litros + unidades): solo conteos y dinero exacto; sinCosto cuenta los destinos sin estimar", [Object.keys(r5.totales).includes("cantidadSugerida"), r5.totales.valorReferencia, r5.totales.sinCosto, r5.totales.necesitan], [false, "700000017000.0002", 2, 4]);

  const t5 = tablaStockCritico(r5);
  const ci = (titulo: string) => t5.columnas.findIndex((c) => c.titulo === titulo);

  igual("T-C05 exportación: TOTAL GENERAL marca las cantidades «n/a» y lleva solo el valor de referencia", [t5.totales[0].celdas[ci("Cant. sugerida")], t5.totales[0].celdas[ci("Compra")], t5.totales[0].celdas[ci("Valor ref.")]], ["n/a", "n/a", "700000017000.0002"]);

  // ═══ RPT-T-C02/C06 — depósito autorizado con stock cero NO desaparece; filtros; alcance ═══
  const e6: Escenario = {
    productos: [prod(P1, "P-1", "Aceite girasol", "Litro", { catId: U(40), categoria: "Cat 1", marcaId: U(50), famId: U(60) }), prod(P2, "P-2", "Detergente", "Litro", { catId: U(41), categoria: "Cat 2" })],
    saldos: [saldo(P1, DA, "DISPONIBLE", 50)],
    config: [cfg(P1, DB, 10, 12, 30), cfg(P2, DB, 5, 6, 20), cfg(P2, DA, 5, 6, 20)],
    visibles: [dep(DA, "Central"), dep(DB, "Norte")],
    costos: [],
  };
  const r6 = await informe(e6, { situacion: "ALERTAS", depositoId: DB });

  igual("T-C02/C06 filtro por depósito: Norte con stock CERO en ambos productos sigue apareciendo como sin stock (un depósito crítico sin saldo no se oculta)", [r6.filas.map((f) => [f.productoId, f.criticidad]).sort()], [[[P1, "SIN_STOCK"], [P2, "SIN_STOCK"]].sort()]);
  igual("T-C06 filtros combinables sobre el plan ya calculado: categoría, producto (texto), marca y familia", [
    (await informe(e6, { situacion: "ALERTAS", categoriaId: U(41) })).filas.map((f) => f.productoId).sort(), (await informe(e6, { situacion: "ALERTAS", q: "girasol" })).filas.map((f) => f.productoId),
    (await informe(e6, { situacion: "ALERTAS", familiaId: U(60), marcaId: U(50) })).filas.map((f) => f.productoId).sort(), (await informe(e6, { situacion: "ALERTAS", categoriaId: U(41), q: "girasol" })).filas.length,
  ], [[P2, P2].sort(), [P1], [P1, P2, P2].sort(), 0]);
  igual("T-C06 la vista Por producto no duplica: P2 tiene dos destinos con alerta (Central y Norte) y sale en UNA fila con destinos 2", (await informe(e6, { situacion: "ALERTAS", vista: "PRODUCTO" })).filas.map((f) => [f.productoId, f.destinos]).sort(), [[P1, 1], [P2, 2]].sort());

  const fuera = (await informe(e6, { depositoId: U(99) })) as unknown as { error: string; status: number };

  igual("T-C06 depósito fuera del alcance (o inactivo) → 403 y no se calcula nada", [fuera.status, reg.consultas.some((c) => /inventario_costos/.test(c.sql))], [403, false]);
  cierto("T-C06 aislamiento: toda lectura usa la empresa de la sesión y el usuario como parámetros; el alcance (usuarios/usuario_deposito, depósitos activos) viene del servicio de Reposición, no del cliente", (() => {
    const a = reg.consultas.filter((c) => /FROM stock_saldos|producto_deposito_configuracion|JOIN usuarios/.test(c.sql));

    return a.length >= 2 && a.every((c) => c.params?.[0] === EMP && /alcance_depositos/.test(c.sql) && /d\.activo/.test(c.sql));
  })());
  await informe(e6, {}, true, U(77));
  cierto("T-C06 el usuario de la sesión es el que se envía al alcance (no un usuario de otro empresa/rol)", reg.consultas.filter((c) => /JOIN usuarios/.test(c.sql)).every((c) => c.params?.[0] === EMP && c.params?.[1] === U(77)));

  // ═══ RPT-T-C07 — snapshot y exportación ═══
  await informe(e1);
  cierto("T-C07 una sola conexión y una sola transacción REPEATABLE READ de solo lectura para alcance, motor, enriquecimiento, costos, catálogos y hora; nunca Pool.query", reg.conexiones === 1 && reg.poolQuery === 0 && reg.consultas[0].sql.startsWith("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY") && reg.consultas.at(-1)?.sql === "COMMIT" && reg.liberadas === 1);

  reiniciar();
  let falla = "";
  try {
    await leerStockCritico(fakePool(e1, (sql) => /inventario_costos/.test(sql)), EMP, USR, FILTROS, 1, 50, true);
  } catch (err) {
    falla = (err as Error).message;
  }
  igual("T-C07 ante un error: ROLLBACK, error propagado y conexión liberada", [falla, reg.consultas.at(-1)?.sql, reg.liberadas], ["fallo de consulta", "ROLLBACK", 1]);

  const pagina1 = (await informe(e5, { situacion: "ALERTAS" }, false)) as StockCriticoRespuesta;
  igual("T-C07 paginación: pagina.totalFilas cuenta las filas de la vista (no los planes) y los totales son los de todo el filtro", [pagina1.pagina.totalFilas, pagina1.totales.necesitan], [4, 4]);

  // XLSX/PDF reales vs API
  const xl = leerHojaXlsx(generarXlsxTabla(t5));
  const base = 1 + 1 + 1 + t5.filtros.length + 1 + 1; // fila de títulos (1-based)
  const col = (i: number) => String.fromCharCode(65 + i);
  const celda = (c: number, fila: number) => xl.get(`${col(c)}${fila}`);
  const iFila = (clave: string) => r5.filas.findIndex((f) => f.productoId === clave);

  igual("T-C07 XLSX real: «Cant. sugerida» 25,5 como número, valor de referencia grande como texto exacto, costo ausente como «—», total «n/a»", [
    celda(ci("Cant. sugerida"), base + 1 + iFila(P1)), celda(ci("Valor ref."), base + 1 + iFila(P2)), celda(ci("Valor ref."), base + 1 + iFila(P3)), celda(ci("Cant. sugerida"), base + 1 + r5.filas.length),
  ], [{ tipo: "n", valor: "25.5" }, { tipo: "s", valor: "699999999999.9993" }, { tipo: "s", valor: "—" }, { tipo: "s", valor: "n/a" }]);

  const sinMeta = tablaStockCritico(r3);
  const xs = leerHojaXlsx(generarXlsxTabla(sinMeta));
  const bs = 1 + 1 + 1 + sinMeta.filtros.length + 1 + 1;
  const iSin = r3.filas.findIndex((f) => f.productoId === P1);

  igual("T-C07 XLSX: destino con necesidad sin meta → texto «Sin meta» (no 0 ni vacío); PDF lo muestra", [xs.get(`${col(sinMeta.columnas.findIndex((c) => c.titulo === "Cant. sugerida"))}${bs + 1 + iSin}`), generarPdfTabla(sinMeta).toString("latin1").includes("(Sin meta)")], [{ tipo: "s", valor: "Sin meta" }, true]);
  cierto("T-C07 XLSX y PDF se generan sin NaN en las dos vistas", ["PRODUCTO", "DEPOSITO"].every((v) => {
    const t = tablaStockCritico({ ...r5, filtros: { ...r5.filtros, vista: v as StockCriticoFiltros["vista"] }, filas: r5.filas });
    const h = leerHojaXlsx(generarXlsxTabla(t));

    return ![...h.values()].some((x) => /NaN|undefined/.test(x.valor)) && generarPdfTabla(t).subarray(0, 5).toString() === "%PDF-" && columnasStockCritico({ vista: v as StockCriticoFiltros["vista"] }).length === t.columnas.length;
  }));

  // Tope de exportación: 50.000 filas → 413 (rama verificada en el código; generar 50.001 planes simulados haría la prueba innecesariamente lenta)
  cierto("T-C07 exportación: más de 50.000 filas de la vista → 413 antes de generar el archivo (la transacción se cierra por el mismo camino de conSnapshotLectura)", /todas && vista\.length > MAX_FILAS_EXPORTACION\) return \{ error: .*status: 413/.test(leer("lib/reportes/stock-critico.ts")) && /MAX_FILAS_EXPORTACION = 50[_]?000/.test(leer("lib/reportes/stock-general.ts")));

  // ═══ RPT-T-C08 — cliente: errores, formato, fuera de orden, sin datos viejos ═══
  const ok: StockCriticoRespuestaApi = { ...r1, permisos: { exportar: true } };
  const buscar = (r: { status: number; cuerpo?: unknown } | "red" | "texto", espera = 0) => async () => {
    if (espera) await new Promise((x) => setTimeout(x, espera));
    if (r === "red") throw new TypeError("fetch failed");
    if (r === "texto") return new Response("no es json", { status: 200 });

    return new Response(JSON.stringify(r.cuerpo ?? {}), { status: r.status });
  };

  igual("T-C08 respuesta completa válida → datos; la validación acepta la respuesta real del informe", [(await pedirStockCritico(FILTROS, 1, buscar({ status: 200, cuerpo: ok }))).error, respuestaStockCriticoValida(ok)], ["", true]);

  const malas: Array<[string, unknown]> = [
    ["fila nula", { ...ok, filas: [null] }], ["filas no es arreglo", { ...ok, filas: {} }], ["sin totales", { ...ok, totales: undefined }], ["valor no numérico", { ...ok, totales: { ...ok.totales, valorReferencia: "abc" } }],
    ["valor float", { ...ok, totales: { ...ok.totales, valorReferencia: 12.5 } }], ["criticidad desconocida", { ...ok, filas: [{ ...ok.filas[0], criticidad: "X" }] }], ["sugerida texto", { ...ok, filas: [{ ...ok.filas[0], sugerida: "15" }] }],
    ["sin permisos", { ...ok, permisos: undefined }], ["exportar no booleano", { ...ok, permisos: { exportar: 1 } }], ["catálogo con nulo", { ...ok, catalogos: { ...ok.catalogos, depositos: [null] } }], ["conteos incompletos", { ...ok, totales: { ...ok.totales, porCriticidad: { SIN_STOCK: 1 } } }],
    ["paginación inválida", { ...ok, pagina: { numero: 1 } }], ["objeto vacío", {}],
  ];

  for (const [n, cuerpo] of malas) {
    const r = await pedirStockCritico(FILTROS, 1, buscar({ status: 200, cuerpo }));

    igual(`T-C08 HTTP 200 malformado (${n}): sin datos y error recuperable`, [r.datos, r.error !== ""], [null, true]);
  }

  for (const status of [401, 403, 500, 503]) {
    const r = await pedirStockCritico(FILTROS, 1, buscar({ status, cuerpo: { error: "Fallo." } }));

    igual(`T-C06/C08 HTTP ${status}: sin datos y con código`, [r.datos, r.error.includes(`código ${status}`)], [null, true]);
  }

  igual("T-C08 red caída y JSON inválido → sin datos", [(await pedirStockCritico(FILTROS, 1, buscar("red"))).datos, (await pedirStockCritico(FILTROS, 1, buscar("texto"))).datos], [null, null]);

  {
    const compuerta = crearCompuerta();
    const e: { vista: string | null; error: string } = { vista: null, error: "" };
    const cargar = async (f: StockCriticoFiltros, r: Parameters<typeof buscar>[0], espera: number) => {
      const sol = compuerta.nueva();
      const res = await pedirStockCritico(f, 1, buscar(r, espera));

      if (!compuerta.vigente(sol)) return;
      e.vista = res.datos ? res.datos.filtros.vista : null;
      e.error = res.error;
    };
    const api = (vista: StockCriticoFiltros["vista"]) => ({ status: 200, cuerpo: { ...ok, filtros: { ...ok.filtros, vista } } });

    await Promise.all([cargar({ ...FILTROS, vista: "DEPOSITO" }, api("DEPOSITO"), 40), cargar({ ...FILTROS, vista: "PRODUCTO" }, api("PRODUCTO"), 5)]);
    igual("T-C08 cambio rápido de filtros: la respuesta lenta anterior no pisa a la última", e.vista, "PRODUCTO");
    await cargar(FILTROS, { status: 500, cuerpo: { error: "x" } }, 0);
    igual("T-C08 una falla descarta los datos anteriores y deja un error", [e.vista, e.error !== ""], [null, true]);
    await cargar(FILTROS, api("DEPOSITO"), 0);
    igual("T-C08 el reintento válido recupera los datos", [e.vista, e.error], ["DEPOSITO", ""]);
  }

  // ═══ Filtros HTTP, permisos y página ═══
  igual("filtros: el selector MINIMO/MAXIMO ya no existe (se ignora); situación y UUID validados; ALERTAS por defecto", [
    parsearFiltrosStockCritico(new URLSearchParams("objetivo=MAXIMO")), "error" in parsearFiltrosStockCritico(new URLSearchParams("situacion=NORMAL")), "error" in parsearFiltrosStockCritico(new URLSearchParams("marcaId=x")), "error" in parsearFiltrosStockCritico(new URLSearchParams("situacion=BAJO_MINIMO&vista=DEPOSITO")),
  ], [{ filtros: { vista: "PRODUCTO", depositoId: "", categoriaId: "", marcaId: "", familiaId: "", situacion: "ALERTAS", q: "" }, pagina: 1, tamano: 50 }, true, true, false]);

  const pagina = leer("app/(private)/reportes/stock-critico/page.tsx");
  const rutaLeer = leer("app/api/reportes/stock-critico/route.ts");
  const rutaExportar = leer("app/api/reportes/stock-critico/exportar/route.ts");
  const fuente = leer("lib/reportes/stock-critico.ts");
  const plan = leer("lib/reportes/stock-critico-plan.ts");

  cierto("T-C06 permisos: consultar exige REPORTES.VER; exportar exige VER y EXPORTAR en el servidor; los botones solo existen con permisos.exportar confirmado y exportan los filtros de la respuesta vigente", /autorizarReporte\(\["VER"\]\)/.test(rutaLeer) && /autorizarReporte\(\["VER", "EXPORTAR"\]\)/.test(rutaExportar) && /hasPermission\(acceso, "REPORTES", "EXPORTAR"\)/.test(rutaLeer) && /puedeExportar \? \(/.test(pagina) && /descargarStockCritico\(actual\.filtros, formato\)/.test(pagina) && !/descargarStockCritico\(aplicados/.test(pagina));
  cierto("T-C08 pantalla: pedirStockCritico con compuerta de última solicitud, datos descartados ante falla, solo datos de los filtros/página vigentes y «Reintentar»", /pedirStockCritico\(aplicados, pagina\)/.test(pagina) && /crearCompuerta\(\)/.test(pagina) && /setDatos\(r\.datos\)/.test(pagina) && /respuestaVigente\(datos, error, aplicados, pagina\)/.test(pagina) && !/JSON\.stringify/.test(pagina) && /Reintentar/.test(pagina) && !/\.catch\(\(e: unknown\)/.test(pagina));

  // ═══ RPT-T-C09 — un solo motor, solo lectura, regresiones ═══
  cierto("T-C09 un solo motor: el informe usa calcularPlanReposicion y leerEntradasReposicion; no recalcula necesidad, meta ni sugerencia (sin fórmulas propias, sin objetivo MINIMO/MAXIMO, sin float8 ni SQL de saldos propios)", /calcularPlanReposicion\(datos\.entradas, \{ incluirTransito: false \}\)/.test(fuente) && /leerEntradasReposicion\(c, empresaId, usuarioId\)/.test(fuente) && !/objetivo|"MINIMO"|"MAXIMO"|float8|FROM stock_saldos/.test(fuente + plan) && !/Math\.max\(0, maximo/.test(fuente + plan));
  cierto("T-C09 solo lectura: ni la pantalla, ni la API, ni la exportación crean movimientos, compras, transferencias ni simulaciones (sin POST/PUT, sin /movimientos, sin plan editable)", !/method: "(POST|PUT|DELETE)"|\/movimientos|A planificar|Simular/.test(pagina + fuente) && !/export async function (POST|PUT|DELETE)/.test(rutaLeer + rutaExportar) && !/(INSERT|UPDATE|DELETE)\s/i.test(fuente.replace(/\/\/.*$/gm, "")));
  cierto("T-C09 regresiones: el motor y los datos de Reposición, su pantalla y API, y Valorización no dependen del informe ni fueron reimplementados", !/reportes/.test(leer("lib/reposicion/calculo.ts") + leer("lib/reposicion/datos.ts") + leer("app/api/reposicion/route.ts")) && !/stock-critico/.test(leer("lib/reportes/valorizacion.ts") + leer("lib/reportes/valorizacion-cobertura.ts")) && /leerValorizacion/.test(leer("app/api/reportes/valorizacion/route.ts")));
  cierto("T-C09 los otros relatórios siguen con sus rutas: Stock general, Kardex, Lotes y Valorización", ["stock-general", "kardex", "lotes", "valorizacion"].every((r) => /export async function GET/.test(leer(`app/api/reportes/${r}/route.ts`))));

  // ═══ RPT-R06-01 — igualdad de filtros por campo (objetos reales servidor/cliente en órdenes distintos) ═══
  const sp = new URLSearchParams("vista=PRODUCTO&situacion=ALERTAS&q=aceite&depositoId=" + DB);
  const deApi = parsearFiltrosStockCritico(sp);
  const filtrosServidor = "filtros" in deApi ? deApi.filtros : FILTROS;
  // Lo que realmente devuelve la API: el objeto \`filtros\` de leerStockCritico serializado como JSON
  reiniciar();
  const respReal = JSON.parse(JSON.stringify(await leerStockCritico(fakePool(e1), EMP, USR, filtrosServidor, 1, 50, false))) as StockCriticoRespuestaApi;
  // Lo que arma el componente: { ...filtros, q } con otro orden de propiedades
  const cliente: StockCriticoFiltros = { vista: "PRODUCTO", q: "aceite", depositoId: DB, categoriaId: "", marcaId: "", familiaId: "", situacion: "ALERTAS" };

  igual("R06-01 los objetos reales servidor/cliente tienen el MISMO contenido y órdenes de propiedades distintos (JSON.stringify no sirve), y filtrosIguales los reconoce", [
    Object.keys(respReal.filtros).join(",") === Object.keys(cliente).join(","), JSON.stringify(respReal.filtros) === JSON.stringify(cliente), filtrosIguales(respReal.filtros, cliente),
  ], [false, false, true]);
  igual("R06-01 filtrosIguales: cada campo cuenta (vista, q, depósito, categoría, marca, familia, situación) y el orden de creación no", [
    (["vista", "q", "depositoId", "categoriaId", "marcaId", "familiaId", "situacion"] as const).map((k) => filtrosIguales(cliente, { ...cliente, [k]: k === "vista" ? "DEPOSITO" : k === "situacion" ? "TODAS" : "otro" })),
    filtrosIguales(cliente, { situacion: "ALERTAS", familiaId: "", marcaId: "", categoriaId: "", depositoId: DB, q: "aceite", vista: "PRODUCTO" }),
  ], [[false, false, false, false, false, false, false], true]);

  const aplicados: StockCriticoFiltros = { ...cliente };
  const vigente = (d: StockCriticoRespuestaApi | null, error: string, f: StockCriticoFiltros, pg: number) => respuestaVigente(d, error, f, pg);

  igual("R06-01 la pantalla muestra la respuesta real (con la API en otro orden) y habilita la exportación según el permiso; cambia un filtro, cambia la página, hay error o llega una respuesta vieja → se rechaza", [
    vigente(respReal, "", aplicados, 1), vigente(respReal, "", { ...aplicados, q: "arroz" }, 1), vigente(respReal, "", { ...aplicados, situacion: "TODAS" }, 1), vigente(respReal, "", aplicados, 2), vigente(respReal, "falló", aplicados, 1), vigente(null, "", aplicados, 1),
  ], [true, false, false, false, false, false]);
  igual("R06-01 con respuesta vigente: datos visibles y exportación solo si permisos.exportar (el servidor igual lo exige)", [
    [true, false].map((x) => { const d = { ...respReal, permisos: { exportar: x } }; return respuestaVigente(d, "", aplicados, 1) && d.permisos.exportar; }).join(),
    "",
  ], ["true,false", ""]);
  {
    // Búsqueda con retraso + paginación + respuesta vieja: réplica de la pantalla (compuerta + respuestaVigente)
    const compuerta = crearCompuerta();
    const e: { datos: StockCriticoRespuestaApi | null; error: string } = { datos: null, error: "" };
    const cargar = async (f: StockCriticoFiltros, pg: number, espera: number) => {
      const sol = compuerta.nueva();
      const res = await pedirStockCritico(f, pg, async () => {
        await new Promise((x) => setTimeout(x, espera));
        const r = JSON.parse(JSON.stringify(await informe(e1, f, false))) as StockCriticoRespuestaApi;

        r.pagina.numero = pg;

        return new Response(JSON.stringify({ ...r, permisos: { exportar: true } }), { status: 200 });
      });

      if (!compuerta.vigente(sol)) return;
      e.datos = res.datos;
      e.error = res.error;
    };
    const A = { ...cliente, q: "ace" }, B = { ...cliente, q: "aceite" };

    await Promise.all([cargar(A, 1, 40), cargar(B, 1, 5)]);
    igual("R06-01 búsqueda escrita en dos pasos: la respuesta lenta de «ace» no pisa a «aceite»; solo la última es vigente y es visible", [e.datos?.filtros.q, respuestaVigente(e.datos, e.error, B, 1), respuestaVigente(e.datos, e.error, A, 1)], ["aceite", true, false]);
    await cargar(B, 2, 0);
    igual("R06-01 paginación: la página 2 solicitada solo es vigente para la página 2", [respuestaVigente(e.datos, e.error, B, 2), respuestaVigente(e.datos, e.error, B, 1)], [true, false]);
  }

  // ═══ RPT-R06-02 — Sobrestock informativo (físico propio > máximo del mismo ámbito) ═══
  const e7: Escenario = {
    productos: [
      prod(P1, "P-1", "Sobre máximo en un depósito", "Unidad", { minimo: 1, punto: 2, maximo: 500 }), prod(P2, "P-2", "Sin máximo", "Unidad"),
      prod(P3, "P-3", "Reservas y cuarentena", "Unidad"), prod(P4, "P-4", "Solo global", "Kilo", { minimo: 1, maximo: 10 }),
    ],
    saldos: [
      saldo(P1, DA, "DISPONIBLE", 80), saldo(P1, DB, "DISPONIBLE", 8), // A: 80 > máx 50 (exceso 30); B: 8 ≤ máx 20
      saldo(P2, DA, "DISPONIBLE", 999), // sin máximo → nunca sobrestock
      saldo(P3, DA, "DISPONIBLE", 10), saldo(P3, DA, "RESERVADO", 25), saldo(P3, DA, "CUARENTENA", 10), saldo(P3, DA, "TRANSITO", 500), // físico 45 > 40; el tránsito no cuenta
      saldo(P4, DA, "DISPONIBLE", 30), // plan consolidado real (sin parámetros por depósito): 30 > 10
    ],
    config: [cfg(P1, DA, 5, 6, 50), cfg(P1, DB, 5, 6, 20), cfg(P2, DA, 5, 6, null), cfg(P3, DA, 5, 6, 40)],
    visibles: [dep(DA, "Central"), dep(DB, "Norte")],
    costos: [],
  };
  const r7 = await informe(e7, { situacion: "TODAS" });
  const f7 = (p: string, d?: string) => r7.filas.find((f) => f.productoId === p && (d === undefined || f.deposito === d))!;

  igual("R06-02 sobrestock por depósito con parámetros propios: Central 80 > 50 (exceso 30) sí; Norte 8 ≤ 20 no (el máximo global 500 del producto NO se usa); el consolidado de referencia no genera sobrestock", [f7(P1, "Central").sobrestock, f7(P1, "Central").exceso, f7(P1, "Norte").sobrestock, r7.filas.filter((f) => f.productoId === P1).length], [true, 30, false, 2]);
  igual("R06-02 producto sin máximo definido: nunca sobrestock aunque tenga stock enorme", [f7(P2).sobrestock, f7(P2).exceso, f7(P2).fisico], [false, 0, 999]);
  igual("R06-02 físico propio = disponible + reservado + cuarentena (45 > 40), sin tránsito (500) ni terceros; el disponible (10) no basta para decidir", [f7(P3).fisico, f7(P3).disponible, f7(P3).sobrestock, f7(P3).exceso], [45, 10, true, 5]);
  igual("R06-02 plan consolidado real (sin parámetros por depósito): se compara con el máximo global del producto (30 > 10)", [f7(P4).ambito, f7(P4).sobrestock, f7(P4).exceso], ["CONSOLIDADO", true, 20]);
  igual("R06-02 el sobrestock NO altera el plan del motor: criticidad, necesidad, transferencia y compra de cada fila son los de calcularPlanReposicion (y ninguno genera compra por exceso)", [r7.filas.every((f) => !f.sobrestock || f.compra === 0 || f.necesita), f7(P1, "Central").necesita, f7(P1, "Central").compra, f7(P3).transferencia], [true, false, 0, 0]);
  comparar("R06-02", r7.filas, (await motor(e7)).plan);

  const alertas = (await informe(e7, { situacion: "ALERTAS" })).filas.map((f) => `${f.productoId}|${f.deposito}`).sort();
  const soloSobre = await informe(e7, { situacion: "SOBRESTOCK" });

  igual("R06-02 filtro: «Sobrestock» aísla los excesos; el filtro por defecto (alertas) los incluye junto con lo que necesita reposición; «Normal» y demás filtros siguen por criticidad", [
    soloSobre.filas.map((f) => `${f.productoId}|${f.deposito}`).sort(), alertas.includes(`${P1}|Central`), alertas.includes(`${P2}|Central`), (await informe(e7, { situacion: "OK" })).filas.some((f) => f.productoId === P2),
  ], [[`${P1}|Central`, `${P3}|Central`, `${P4}|Todos los depósitos`].sort(), true, false, true]);
  igual("R06-02 totales: destinos en sobrestock contados aparte de los que necesitan reposición; Por producto: exceso del MISMO producto sumado una vez", [soloSobre.totales.sobrestock, soloSobre.totales.necesitan, (await informe(e7, { situacion: "SOBRESTOCK", vista: "PRODUCTO" })).filas.map((f) => [f.productoId, f.exceso]).sort()], [3, 0, [[P1, 30], [P3, 5], [P4, 20]].sort()]);
  igual("R06-02 categoría/marca/familia/texto actúan sobre el sobrestock; un depósito filtrado no recibe el consolidado", [(await informe(e7, { situacion: "SOBRESTOCK", q: "reservas" })).filas.map((f) => f.productoId), (await informe(e7, { situacion: "SOBRESTOCK", depositoId: DB })).filas.length, (await informe(e7, { situacion: "SOBRESTOCK", depositoId: DA })).filas.length], [[P3], 0, 2]);

  const t7 = tablaStockCritico(soloSobre);
  const h7 = leerHojaXlsx(generarXlsxTabla(t7));
  const b7 = 1 + 1 + 1 + t7.filtros.length + 1 + 1;
  const c7 = t7.columnas.findIndex((c) => c.titulo === "Sobrestock (exceso)");
  const col7 = String.fromCharCode(65 + c7);
  const i7 = soloSobre.filas.findIndex((f) => f.productoId === P1);

  igual("R06-02 XLSX real: columna «Sobrestock (exceso)» = 30 como número en el depósito con exceso; total «n/a»; PDF generado; las notas informan el conteo", [h7.get(col7 + (b7 + 1 + i7)), h7.get(col7 + (b7 + 1 + soloSobre.filas.length)), generarPdfTabla(t7).subarray(0, 5).toString(), t7.notas.some((n) => /En sobrestock \(informativo\): 3/.test(n))], [{ tipo: "n", valor: "30" }, { tipo: "s", valor: "n/a" }, "%PDF-", true]);
  cierto("R06-02 pantalla: filtro, KPI y columna de sobrestock; el motor (calculo.ts) no conoce el informe", /SOBRESTOCK/.test(leer("lib/reportes/export-stock-critico.ts")) && /Sobrestock/.test(pagina) && /f\.sobrestock/.test(pagina) && !/sobrestock/i.test(leer("lib/reposicion/calculo.ts")));

  // ═══ RPT-R06-03 — referencias contadas según el recorte ═══
  const e8: Escenario = {
    productos: [
      prod(P1, "P-1", "Con plan por depósito A", "Unidad", { minimo: 20, maximo: 60, catId: U(40) }), prod(P2, "P-2", "Con plan por depósito B", "Unidad", { minimo: 20, maximo: 60, catId: U(41) }),
      prod(P3, "P-3", "Sin referencia", "Unidad", { catId: U(41) }),
    ],
    saldos: [saldo(P1, DA, "DISPONIBLE", 1), saldo(P2, DA, "DISPONIBLE", 1)],
    config: [cfg(P1, DA, 5, 6, 10), cfg(P2, DA, 5, 6, 10), cfg(P3, DA, 5, 6, 10)],
    visibles: [dep(DA, "Central")],
    costos: [],
  };

  igual("R06-03 las referencias se cuentan sobre los PRODUCTOS del recorte: sin filtros 2; categoría 2 → 1; texto «sin referencia» → 0; con un depósito filtrado no se atribuyen (0)", [
    (await informe(e8, { situacion: "TODAS" })).totales.referencias, (await informe(e8, { situacion: "TODAS", categoriaId: U(41) })).totales.referencias, (await informe(e8, { situacion: "TODAS", q: "sin referencia" })).totales.referencias,
    (await informe(e8, { situacion: "TODAS", depositoId: DA })).totales.referencias,
  ], [2, 1, 0, 0]);
  igual("R06-03 contarReferencias: un producto se cuenta una vez y los filtros de producto se respetan", contarReferencias([P1, P1, P2], { ...FILTROS, categoriaId: U(40) }, new Map([[P1, { categoriaId: U(40), categoria: "", marcaId: "", familiaId: "", familia: "", busqueda: "" }], [P2, { categoriaId: U(41), categoria: "", marcaId: "", familiaId: "", familia: "", busqueda: "" }]])), 1);
  cierto("R06-03 la nota de pantalla y de exportación se refiere al recorte filtrado (no a toda la empresa)", /del recorte filtrado/.test(pagina) && tablaStockCritico(await informe(e8, { situacion: "TODAS" })).notas.some((n) => /del recorte filtrado/.test(n)));

  // Utilidades puras
  igual("costo unitario exacto: sin cantidad valorizada → null (no 0)", [costoUnitario({ valor: "10", cantidad: "4" }), costoUnitario({ valor: "0", cantidad: "0" }), costoUnitario(undefined)], ["2.5000", null, null]);
  igual("Por producto: agrupar no mezcla productos distintos", agruparPorProducto([{ productoId: "a", clave: "1", sugerida: 1, transferencia: 0, compra: 1, necesita: true, sinMeta: 0, destinos: 1, disponible: 1, criticidad: "SIN_STOCK", advertencias: [], valorReferencia: null, destinosSinCosto: 0, ambito: "DEPOSITO" } as unknown as Detalle, { productoId: "b", clave: "2", sugerida: 2, transferencia: 0, compra: 2, necesita: true, sinMeta: 0, destinos: 1, disponible: 2, criticidad: "SIN_STOCK", advertencias: [], valorReferencia: null, destinosSinCosto: 0, ambito: "DEPOSITO" } as unknown as Detalle]).map((f) => [f.productoId, f.sugerida]), [["a", 1], ["b", 2]]);

  return fallos;
}
