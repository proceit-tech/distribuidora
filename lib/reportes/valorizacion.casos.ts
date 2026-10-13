/**
 * Reportes — Valorización de inventario (ORDEM-IMPLEMENTACAO-REPORTES-VALORIZACION, RPT-V01…V06, RPT-N02; gates T01…T08).
 * Sin PostgreSQL ni navegador: conexión simulada que registra cada consulta (prueba la FORMA de la lectura — una conexión, una transacción de solo lectura,
 * sin float, clasificación previa a la agregación —, NO la serialización real de PostgreSQL), reglas puras, exportaciones y análisis del código.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { generarPdfTabla, generarXlsxTabla, numeroOTexto } from "@/lib/reportes/export";
import { columnasValorizacion, tablaValorizacion } from "@/lib/reportes/export-valorizacion";
import { fmtCantidadTexto } from "@/lib/reportes/formato";
import { pedirValorizacion } from "@/lib/reportes/cliente-valorizacion";
import { conSnapshotLectura, leerValorizacion, parsearFiltrosValorizacion } from "@/lib/reportes/valorizacion";
import { clasificarCobertura, conteosVacios, peorSituacion, porcentajeCobertura, respuestaValorizacionValida, SQL_SITUACION, totalDivergencias } from "@/lib/reportes/valorizacion-cobertura";
import { crearCompuerta } from "@/lib/productos/catalogos-carga";
import type { ValorizacionFiltros, ValorizacionRespuesta, ValorizacionRespuestaApi } from "@/types/reportes";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const EMP = U(1), USR = U(2), DA = U(20), DB = U(21), DI = U(22);
const FILTROS: ValorizacionFiltros = { vista: "DETALLE", q: "", depositoId: "", categoriaId: "", familiaId: "", existencia: "CON", costo: "TODOS", cobertura: "TODOS" };

type Consulta = { sql: string; params?: unknown[] };
type Dato = Record<string, unknown>;

export async function verificarCasosReportesValorizacion(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ═══ RPT-V03 — regla de cobertura (por producto × depósito, sin compensar) ═══
  igual("T03 clasificación por par: con costo, parcial, sin costo, excedente, valor sin cantidad, sin stock (incluye fracciones)", [
    clasificarCobertura("10", "10", "500"), clasificarCobertura("10.5", "10.5000", "500"), clasificarCobertura("10", "4", "200"), clasificarCobertura("10", "0", null), clasificarCobertura("10", "0", "0"),
    clasificarCobertura("5", "10", "300"), clasificarCobertura("0", "3", "300"), clasificarCobertura("5", "0", "123.4500"), clasificarCobertura("0", "0", "7"), clasificarCobertura("0", "0", null), clasificarCobertura("0.0001", "0.0001", "1"),
  ], ["CON_COSTO", "CON_COSTO", "PARCIAL", "SIN_COSTO", "SIN_COSTO", "EXCEDENTE", "EXCEDENTE", "RESIDUO", "RESIDUO", "SIN_STOCK", "CON_COSTO"]);
  igual("T03 +5 y −5 en depósitos distintos NO se compensan: A es excedente, B es parcial; el neto «0» no produce «con costo»", (() => {
    const a = clasificarCobertura("10", "15", "100"), b = clasificarCobertura("10", "5", "50");
    const k = conteosVacios();

    k[a] += 1;
    k[b] += 1;

    return [a, b, k.CON_COSTO, totalDivergencias(k), peorSituacion(k)];
  })(), ["EXCEDENTE", "PARCIAL", 0, 2, "EXCEDENTE"]);
  igual("T03 peor situación de un grupo (residuo > excedente > sin costo > parcial > con costo > sin stock)", [
    peorSituacion({ ...conteosVacios(), CON_COSTO: 5 }), peorSituacion({ ...conteosVacios(), CON_COSTO: 5, PARCIAL: 1 }), peorSituacion({ ...conteosVacios(), PARCIAL: 1, SIN_COSTO: 1 }),
    peorSituacion({ ...conteosVacios(), SIN_COSTO: 1, EXCEDENTE: 1 }), peorSituacion({ ...conteosVacios(), EXCEDENTE: 1, RESIDUO: 1 }), peorSituacion(conteosVacios()), peorSituacion({ ...conteosVacios(), SIN_STOCK: 3 }),
  ], ["CON_COSTO", "PARCIAL", "SIN_COSTO", "EXCEDENTE", "RESIDUO", "SIN_STOCK", "SIN_STOCK"]);
  igual("T03 cobertura = pares con costo completo / pares con existencia o valor (una decimal, sin float); sin pares → null", [
    porcentajeCobertura({ ...conteosVacios(), CON_COSTO: 7, PARCIAL: 1 }), porcentajeCobertura({ ...conteosVacios(), CON_COSTO: 1, SIN_COSTO: 2 }), porcentajeCobertura({ ...conteosVacios(), CON_COSTO: 3 }), porcentajeCobertura({ ...conteosVacios(), SIN_STOCK: 4 }), porcentajeCobertura({ ...conteosVacios(), EXCEDENTE: 2 }),
  ], ["87,5", "33,3", "100,0", null, "0,0"]);
  cierto("T03 la SQL aplica la MISMA regla en el mismo orden (residuo → excedente → sin stock → sin costo → parcial → con costo) y la clasificación (cls) ocurre ANTES de filtrar y agrupar", (() => {
    const orden = ["'RESIDUO'", "'EXCEDENTE'", "'SIN_STOCK'", "'SIN_COSTO'", "'PARCIAL'", "'CON_COSTO'"].map((k) => SQL_SITUACION.indexOf(k));

    return orden.every((v, i) => v >= 0 && (i === 0 || v > orden[i - 1])) && /cantv = 0 AND valor <> 0/.test(SQL_SITUACION);
  })());

  // ═══ RPT-V02 — una conexión, una transacción de solo lectura con snapshot, liberación en todos los caminos ═══
  const reg: { consultas: Consulta[]; conexiones: number; liberadas: number; poolQuery: number } = { consultas: [], conexiones: 0, liberadas: 0, poolQuery: 0 };
  const fakePool = (responder: (sql: string, params?: unknown[]) => Dato[] | Error) => ({
    query: async () => { reg.poolQuery += 1; return { rows: [] }; },
    connect: async () => {
      reg.conexiones += 1;

      return {
        query: async (sql: string, params?: unknown[]) => {
          reg.consultas.push({ sql, params });

          const r = responder(sql, params);

          if (r instanceof Error) throw r;

          return { rows: r };
        },
        release: () => { reg.liberadas += 1; },
      };
    },
  }) as never;
  const reiniciar = () => { reg.consultas = []; reg.conexiones = 0; reg.liberadas = 0; reg.poolQuery = 0; };

  reiniciar();
  await conSnapshotLectura(fakePool(() => []), async (c) => { await c.query("SELECT 1"); await c.query("SELECT 2"); });
  igual("T04/RPT-V02 snapshot: UNA conexión, BEGIN REPEATABLE READ READ ONLY primero, COMMIT al final, conexión liberada, sin Pool.query", [reg.conexiones, reg.consultas.map((c) => c.sql), reg.liberadas, reg.poolQuery], [1, ["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "SELECT 1", "SELECT 2", "COMMIT"], 1, 0]);

  reiniciar();
  let error1 = "";
  try {
    await conSnapshotLectura(fakePool((sql) => (sql === "SELECT 2" ? new Error("fallo de consulta") : [])), async (c) => { await c.query("SELECT 1"); await c.query("SELECT 2"); });
  } catch (e) {
    error1 = (e as Error).message;
  }
  igual("RPT-V02 ante un error: ROLLBACK, se propaga el error original y la conexión se libera (sin COMMIT)", [error1, reg.consultas.map((c) => c.sql).slice(-1)[0], reg.consultas.some((c) => c.sql === "COMMIT"), reg.liberadas], ["fallo de consulta", "ROLLBACK", false, 1]);

  reiniciar();
  let error2 = "";
  try {
    await conSnapshotLectura(fakePool((sql) => (/ROLLBACK|SELECT 1/.test(sql) ? new Error(sql === "SELECT 1" ? "original" : "rollback falló") : [])), async (c) => { await c.query("SELECT 1"); });
  } catch (e) {
    error2 = (e as Error).message;
  }
  igual("RPT-V02 si el ROLLBACK también falla se conserva el error original y igual se libera la conexión", [error2, reg.liberadas], ["original", 1]);

  // ═══ Lectura simulada de la Valorización ═══
  const emp = { nombre: "Empresa SA", moneda: "PYG" };
  const alcance = [{ id: DA, nombre: "Central", activo: true }, { id: DB, nombre: "Norte", activo: true }, { id: DI, nombre: "Viejo", activo: false }];
  const fila = (extra: Dato): Dato => ({ clave: "k", codigo: "P-1", descripcion: "Producto", categoria: "Cat", familia: "Fam", deposito: "Central", unidad: "Unidad", productos: 1, depositos: 1, inactivo: false, fisico: "10", cantv: "10", sin_val: "0", exced: "0", costo: "50.0000", valor: "500.0000", n_con: 1, n_par: 0, n_sin: 0, n_exc: 0, n_res: 0, n_nul: 0, ...extra });
  const total: Dato = { filas: 4, productos: 3, depositos: 2, productos_con_costo: 2, valor: "99999999999999.9999", n_con: 1, n_par: 1, n_sin: 1, n_exc: 1, n_res: 0, n_nul: 0, v_con: "500.0000", v_par: "200.0000", v_sin: "0", v_exc: "99999999999999.2999", v_res: "0", v_nul: "0", n_inactivos: 1, v_inactivos: "50.0000" };
  const responder = (filas: Dato[], filasTotal = 4, tot: Dato = total) => (sql: string): Dato[] => {
    if (/FROM depositos d JOIN usuarios u/.test(sql)) return alcance;
    if (/FROM empresas/.test(sql)) return [emp];
    if (/AS v_inactivos/.test(sql)) return [tot];
    if (/SELECT count\(\*\)::int AS n FROM vista/.test(sql)) return [{ n: filasTotal }];
    if (/FROM vista ORDER BY/.test(sql)) return filas;
    if (/categorias_producto WHERE/.test(sql)) return [{ id: U(30), nombre: "Cat" }];
    if (/familias_producto WHERE/.test(sql)) return [{ id: U(31), nombre: "Fam" }];
    if (/AS t, to_char/.test(sql)) return [{ t: "13/10/2026 10:00", f: "20261013-1000" }];

    return [];
  };
  const leer1 = async (f: ValorizacionFiltros, filas: Dato[], opciones: { todas?: boolean; filasTotal?: number; tot?: Dato } = {}) => {
    reiniciar();

    return leerValorizacion(fakePool(responder(filas, opciones.filasTotal, opciones.tot)), EMP, USR, f, 1, 50, opciones.todas ?? false);
  };

  const det = (await leer1(FILTROS, [fila({ clave: "a", unidad: "Unidad" }), fila({ clave: "b", codigo: "P-2", unidad: "Kg", fisico: "10.5", cantv: "4", sin_val: "6.5", costo: "12.5000", valor: "50.0000", n_con: 0, n_par: 1 })])) as ValorizacionRespuesta;

  cierto("T01/RPT-V02 la lectura completa (alcance, empresa, totales, conteo, filas, catálogos y hora) usa una sola conexión y una sola transacción, y nunca Pool.query", reg.conexiones === 1 && reg.poolQuery === 0 && reg.consultas[0].sql.startsWith("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY") && reg.consultas.at(-1)?.sql === "COMMIT" && reg.liberadas === 1 && reg.consultas.length === 10);
  igual("T01 DETALLE: cada fila lleva SU unidad (Unidad / Kg), cantidades y costo exactos como texto, y el costo unitario es del mismo producto", [det.filas.map((f) => f.unidad), det.filas[1].fisico, det.filas[1].sinValorizar, det.filas[1].costoPromedio, det.filas[1].situacionCosto], [["Unidad", "Kg"], "10.5", "6.5", "12.5000", "PARCIAL"]);
  igual("T02 totales: dinero exacto como texto (sin float) con 14 enteros + 4 decimales, moneda base, conteos y dinero por situación sin compensar", [det.totales.valorTotal, det.totales.moneda, det.totales.conteos, det.totales.valorPorSituacion.EXCEDENTE, det.totales.productosConCosto], ["99999999999999.9999", "PYG", { CON_COSTO: 1, PARCIAL: 1, SIN_COSTO: 1, EXCEDENTE: 1, RESIDUO: 0, SIN_STOCK: 0 }, "99999999999999.2999", 2]);
  igual("RPT-V06 los depósitos inactivos del alcance se incluyen y se informan (pares y valor); el catálogo marca cuáles están inactivos", [det.totales.inactivos, det.catalogos.depositos.map((d) => [d.nombre, d.activo])], [{ filas: 1, valor: "50.0000" }, [["Central", true], ["Norte", true], ["Viejo", false]]]);

  const sqlFilas = reg.consultas.find((c) => /FROM vista ORDER BY/.test(c.sql))!;

  igual("RPT-V06 alcance de depósitos: se pasan a la consulta TODOS los de su alcance, activos e inactivos, con la empresa de la sesión como $1", [(sqlFilas.params ?? []).slice(0, 2)], [[EMP, [DA, DB, DI]]]);
  cierto("T05 aislamiento: el alcance sale de usuarios/usuario_deposito (empresa y usuario de la sesión), no del cliente; toda consulta de datos usa $1 empresa", /FROM depositos d JOIN usuarios u ON u\.empresa_id = d\.empresa_id AND u\.id = \$2/.test(reg.consultas[1].sql) && reg.consultas[1].params?.[0] === EMP && reg.consultas[1].params?.[1] === USR && /usuario_deposito ud/.test(reg.consultas[1].sql) && reg.consultas.filter((c) => /inventario_costos|stock_saldos/.test(c.sql)).every((c) => c.params?.[0] === EMP && /empresa_id = \$1/.test(c.sql)));

  const fueraAlcance = (await leer1({ ...FILTROS, depositoId: U(99) }, [])) as { error: string; status: number };

  igual("T05 depósito fuera de su alcance → 403 y no se lee ningún dato", [fueraAlcance.status, reg.consultas.filter((c) => /inventario_costos/.test(c.sql)).length], [403, 0]);
  igual("T05 filtro con un depósito inactivo de su alcance es válido (no se descarta por estar inactivo)", "error" in ((await leer1({ ...FILTROS, depositoId: DI }, [fila({})])) as object), false);

  // Vistas agregadas: cantidades heterogéneas NO se suman ni se calcula un costo unitario global
  const dep = (await leer1({ ...FILTROS, vista: "DEPOSITO" }, [{ clave: DA, codigo: "", descripcion: "", categoria: "", familia: "", deposito: "Central", unidad: "", productos: 3, depositos: 1, inactivo: false, valor: "800.0000", n_con: 1, n_par: 1, n_sin: 1, n_exc: 0, n_res: 0, n_nul: 0 }])) as ValorizacionRespuesta;
  const sqlDep = reg.consultas.find((c) => /FROM vista ORDER BY/.test(c.sql))!.sql;

  igual("T01 DEPOSITO: sin cantidades ni costo unitario (n/a); solo dinero, productos y conteos por situación; la peor situación no oculta los conteos", [dep.filas[0].fisico, dep.filas[0].cantidadValorizada, dep.filas[0].costoPromedio, dep.filas[0].unidad, dep.filas[0].valorTotal, dep.filas[0].situacionCosto, dep.filas[0].conteos.PARCIAL], [null, null, null, "", "800.0000", "SIN_COSTO", 1]);
  cierto("T01 la SQL de las vistas DEPOSITO y CATEGORIA no suma físico ni cantidad valorizada ni calcula costo (solo dinero y conteos)", !/sum\(fisico\)|sum\(cantv\)|fisico::text|round\(/.test(sqlDep));

  const cat = (await leer1({ ...FILTROS, vista: "CATEGORIA" }, [{ clave: "sin", codigo: "", descripcion: "", categoria: "Cat", familia: "", deposito: "", unidad: "", productos: 2, depositos: 2, inactivo: false, valor: "10", n_con: 2, n_par: 0, n_sin: 0, n_exc: 0, n_res: 0, n_nul: 0 }])) as ValorizacionRespuesta;
  const sqlCat = reg.consultas.find((c) => /FROM vista ORDER BY/.test(c.sql))!.sql;
  const prod = (await leer1({ ...FILTROS, vista: "PRODUCTO" }, [fila({ depositos: 2, n_con: 1, n_par: 1, fisico: "15", cantv: "12", sin_val: "3", exced: "0", costo: "10.0000", valor: "120" })])) as ValorizacionRespuesta;
  const sqlProd = reg.consultas.find((c) => /FROM vista ORDER BY/.test(c.sql))!.sql;

  igual("T01 CATEGORIA: sin cantidades; PRODUCTO: cantidades y costo del mismo producto (una unidad), con la magnitud sin valorizar sumada por depósito (no neta)", [cat.filas[0].fisico, cat.filas[0].costoPromedio, prod.filas[0].fisico, prod.filas[0].unidad, prod.filas[0].costoPromedio, prod.filas[0].sinValorizar], [null, null, "15", "Unidad", "10.0000", "3"]);
  cierto("T03 PRODUCTO suma la parte positiva por depósito (greatest) para no compensar faltantes y excedentes entre depósitos; agrupa también por unidad", /sum\(greatest\(fisico - cantv, 0\)\)/.test(sqlProd) && /sum\(greatest\(cantv - fisico, 0\)\)/.test(sqlProd) && /GROUP BY producto_id, codigo, descripcion, categoria, familia, unidad/.test(sqlProd));
  cierto("T03 los conteos y el dinero por situación se calculan sobre las filas ya clasificadas por par (cls), también en CATEGORIA", /count\(\*\) FILTER \(WHERE situacion = 'PARCIAL'\)/.test(sqlCat) && /FROM fil GROUP BY/.test(sqlCat) && /cls AS \(SELECT base\.\*, CASE/.test(sqlCat) && /fil AS \(SELECT \* FROM cls/.test(sqlCat));

  // Filtros de cobertura / existencia
  await leer1({ ...FILTROS, cobertura: "DIVERGENCIAS" }, []);
  const sqlDiv = reg.consultas.find((c) => /AS v_inactivos/.test(c.sql))!.sql;

  await leer1({ ...FILTROS, cobertura: "EXCEDENTE", existencia: "SIN" }, []);
  const sqlExc = reg.consultas.find((c) => /AS v_inactivos/.test(c.sql))!.sql;

  cierto("T03 los filtros de cobertura y existencia actúan sobre la situación del par (no sobre sumas): solo divergencias, excedente, sin existencia", /situacion NOT IN \('CON_COSTO', 'SIN_STOCK'\)/.test(sqlDiv) && /situacion = 'EXCEDENTE'/.test(sqlExc) && /situacion = 'SIN_STOCK'/.test(sqlExc) && /\(fisico > 0 OR cantv > 0 OR valor <> 0\)/.test(sqlDiv));
  igual("filtros: cobertura inválida → error; válidas por lista cerrada; identificadores inválidos → error", [
    "error" in parsearFiltrosValorizacion(new URLSearchParams("cobertura=x; DROP TABLE")), "error" in parsearFiltrosValorizacion(new URLSearchParams("cobertura=DIVERGENCIAS")), "error" in parsearFiltrosValorizacion(new URLSearchParams("depositoId=xx")),
  ], [true, false, true]);

  // Exportación: tope de 50.000 filas
  const demasiadas = (await leer1(FILTROS, Array.from({ length: 50001 }, (_, i) => fila({ clave: String(i) })), { todas: true })) as { error: string; status: number };

  igual("T07 más de 50.000 filas → 413 (la transacción igual se cierra y se libera)", [demasiadas.status, reg.consultas.at(-1)?.sql, reg.liberadas], [413, "COMMIT", 1]);

  // ═══ RPT-V05 / T07 — precisión en exportaciones ═══
  igual("RPT-V05 Excel: número real solo si cabe sin perder precisión (≤ 15 dígitos); valores grandes, con fracciones y «n/a» quedan como texto exacto", [
    numeroOTexto("500.0000"), numeroOTexto("99999999999999.9999"), numeroOTexto("123456789012345.67"), numeroOTexto("0.0001"), numeroOTexto("n/a"), numeroOTexto("-12.5"),
  ], [500, "99999999999999.9999", "123456789012345.67", 0.0001, "n/a", -12.5]);
  igual("RPT-V05 formato de cantidades exactas desde texto (sin Number): fracciones, grandes y no aplicable", [fmtCantidadTexto("10.5000"), fmtCantidadTexto("1234567.1250"), fmtCantidadTexto("123456789012345678.1234"), fmtCantidadTexto(null)], ["10,5", "1.234.567,125", "123.456.789.012.345.678,1234", "n/a"]);

  const tablas = {
    DETALLE: tablaValorizacion(det), DEPOSITO: tablaValorizacion(dep), CATEGORIA: tablaValorizacion(cat), PRODUCTO: tablaValorizacion(prod),
  };

  igual("T01/T07 export DETALLE y PRODUCTO: columnas de cantidades y costo; el TOTAL GENERAL las marca «n/a» (no se suman unidades distintas) y lleva el dinero exacto", [
    tablas.DETALLE.columnas.map((c) => c.titulo).includes("Costo promedio unit."), tablas.DETALLE.totales[0].celdas[tablas.DETALLE.columnas.findIndex((c) => c.titulo === "Stock físico propio")], tablas.DETALLE.totales[0].celdas[tablas.DETALLE.columnas.findIndex((c) => c.titulo === "Costo promedio unit.")], tablas.DETALLE.totales[0].celdas[tablas.DETALLE.columnas.findIndex((c) => c.titulo === "Valor total")],
  ], [true, "n/a", "n/a", "99999999999999.9999"]);
  igual("T01/T07 export DEPOSITO y CATEGORIA: sin columnas de cantidad ni costo unitario; con conteos por situación y total de dinero", [
    tablas.DEPOSITO.columnas.map((c) => c.titulo), tablas.CATEGORIA.columnas.some((c) => /físico|valorizada|Costo promedio/i.test(c.titulo)),
  ], [["Depósito", "Productos", "Valor total", "Moneda", "Con costo", "Parcial", "Sin costo", "Excedente", "Valor sin cantidad"], false]);
  cierto("T07 export: encabezado con empresa, hora de extracción, moneda base, alcance y cobertura; notas con conteos y dinero por situación e inactivos; sin cobertura inventada", tablas.DETALLE.filtros.some((l) => /Moneda base: PYG/.test(l)) && tablas.DETALLE.filtros.some((l) => /Alcance: 3 depósito\(s\) de su alcance, 1 inactivo/.test(l)) && tablas.DETALLE.generado === "13/10/2026 10:00" && tablas.DETALLE.notas.some((n) => /Situaciones sin compensar/.test(n)) && tablas.DETALLE.notas.some((n) => /depósitos inactivos/.test(n)) && tablas.DETALLE.notas.some((n) => /foto corriente/.test(n)));
  igual("T07 export: mismas filas que la pantalla en las cuatro vistas, sin duplicar ni paginar (filas = filas leídas)", [tablas.DETALLE.filas.length, tablas.PRODUCTO.filas.length, tablas.DEPOSITO.filas.length, tablas.CATEGORIA.filas.length], [2, 1, 1, 1]);

  for (const [vista, tabla] of Object.entries(tablas)) {
    const xlsx = generarXlsxTabla(tabla), pdf = generarPdfTabla(tabla);

    cierto(`T07 ${vista}: XLSX (zip) y PDF se generan con los mismos datos`, xlsx.subarray(0, 2).toString() === "PK" && pdf.subarray(0, 5).toString() === "%PDF-" && xlsx.length > 200 && pdf.length > 200);
  }

  cierto("T07 cada fila exportada conserva su unidad y su depósito inactivo se rotula; columnas por vista coherentes con la pantalla", columnasValorizacion("DETALLE").some((c) => c.titulo === "Unidad") && columnasValorizacion("PRODUCTO").some((c) => c.titulo === "Pares con divergencia") && !columnasValorizacion("DEPOSITO").some((c) => c.titulo === "Unidad"));

  // ═══ RPT-V04 — cliente: errores, formato, respuestas viejas ═══
  const apiOk: ValorizacionRespuestaApi = { ...det, permisos: { exportar: true } };
  const buscar = (r: { status: number; cuerpo?: unknown } | "red" | "texto", espera = 0) => async () => {
    if (espera) await new Promise((x) => setTimeout(x, espera));
    if (r === "red") throw new TypeError("fetch failed");
    if (r === "texto") return new Response("no es json", { status: 200 });

    return new Response(JSON.stringify(r.cuerpo ?? {}), { status: r.status });
  };

  igual("T06 respuesta completa válida → datos sin error (con permiso de exportar)", [(await pedirValorizacion(FILTROS, 1, buscar({ status: 200, cuerpo: apiOk }))).error, respuestaValorizacionValida(apiOk)], ["", true]);

  const malas: Array<[string, unknown]> = [
    ["fila nula", { ...apiOk, filas: [null] }], ["filas no es arreglo", { ...apiOk, filas: {} }], ["sin totales", { ...apiOk, totales: undefined }], ["valor no numérico", { ...apiOk, totales: { ...apiOk.totales, valorTotal: "abc" } }],
    ["valor numérico (float)", { ...apiOk, totales: { ...apiOk.totales, valorTotal: 12.5 } }], ["conteos incompletos", { ...apiOk, totales: { ...apiOk.totales, conteos: { CON_COSTO: 1 } } }], ["situación desconocida", { ...apiOk, filas: [{ ...apiOk.filas[0], situacionCosto: "X" }] }],
    ["cantidad float", { ...apiOk, filas: [{ ...apiOk.filas[0], fisico: 10.5 }] }], ["sin permisos", { ...apiOk, permisos: undefined }], ["exportar no booleano", { ...apiOk, permisos: { exportar: "si" } }], ["catálogo con nulo", { ...apiOk, catalogos: { ...apiOk.catalogos, depositos: [null] } }],
    ["paginación inválida", { ...apiOk, pagina: { numero: 1, tamano: 50 } }], ["objeto vacío", {}], ["arreglo", []],
  ];

  for (const [n, cuerpo] of malas) {
    const r = await pedirValorizacion(FILTROS, 1, buscar({ status: 200, cuerpo }));

    igual(`T06 HTTP 200 malformado (${n}): sin datos y error recuperable`, [r.datos, r.error !== ""], [null, true]);
  }

  for (const status of [401, 403, 500, 503]) {
    const r = await pedirValorizacion(FILTROS, 1, buscar({ status, cuerpo: { error: "Fallo." } }));

    igual(`T05/T06 HTTP ${status}: sin datos y con código`, [r.datos, r.error.includes(`código ${status}`)], [null, true]);
  }

  igual("T06 red caída y JSON inválido → error sin datos", [(await pedirValorizacion(FILTROS, 1, buscar("red"))).datos, (await pedirValorizacion(FILTROS, 1, buscar("texto"))).datos], [null, null]);

  {
    // Réplica del control de la pantalla: compuerta de última solicitud + descarte de datos ante falla; recuperación con Reintentar
    const compuerta = crearCompuerta();
    const e: { datos: string | null; error: string } = { datos: null, error: "" };
    const cargar = async (f: ValorizacionFiltros, r: Parameters<typeof buscar>[0], espera: number) => {
      const sol = compuerta.nueva();
      const res = await pedirValorizacion(f, 1, buscar(r, espera));

      if (!compuerta.vigente(sol)) return;
      e.datos = res.datos ? res.datos.filtros.vista : null;
      e.error = res.error;
    };
    const apiVista = (vista: ValorizacionFiltros["vista"]) => ({ status: 200, cuerpo: { ...apiOk, filtros: { ...apiOk.filtros, vista } } });

    await Promise.all([cargar({ ...FILTROS, vista: "DEPOSITO" }, apiVista("DEPOSITO"), 40), cargar({ ...FILTROS, vista: "PRODUCTO" }, apiVista("PRODUCTO"), 5)]);
    igual("T06 cambio rápido de filtros: la respuesta lenta anterior no pisa a la última", e.datos, "PRODUCTO");
    await cargar(FILTROS, { status: 500, cuerpo: { error: "x" } }, 0);
    igual("T06 una falla descarta los datos anteriores (nunca se conservan totales viejos) y deja un error", [e.datos, e.error !== ""], [null, true]);
    await cargar(FILTROS, apiVista("DETALLE"), 0);
    igual("T06 reintento válido recupera datos y limpia el error", [e.datos, e.error], ["DETALLE", ""]);
  }

  // ═══ RPT-N02 / T05 — permisos de exportación y análisis del código ═══
  const pagina = leer("app/(private)/reportes/valorizacion/page.tsx");
  const rutaLeer = leer("app/api/reportes/valorizacion/route.ts");
  const rutaExportar = leer("app/api/reportes/valorizacion/exportar/route.ts");
  const fuente = leer("lib/reportes/valorizacion.ts");

  cierto("RPT-N02 servidor: consultar exige REPORTES.VER; exportar exige VER y EXPORTAR (siguen en el servidor) y la consulta informa permisos.exportar con hasPermission", /autorizarReporte\(\["VER"\]\)/.test(rutaLeer) && /autorizarReporte\(\["VER", "EXPORTAR"\]\)/.test(rutaExportar) && /hasPermission\(acceso, "REPORTES", "EXPORTAR"\)/.test(rutaLeer) && /leerValorizacion\(db, session\.user\.empresaId, session\.user\.id/.test(rutaExportar));
  cierto("RPT-N02 pantalla: los botones de Excel/PDF solo existen con permisos.exportar y datos vigentes; exportan los filtros CONFIRMADOS de la respuesta (no los que se están editando)", /puedeExportar \? \(/.test(pagina) && /actual\?\.permisos\.exportar === true/.test(pagina) && /descargarValorizacion\(actual\.filtros, formato\)/.test(pagina) && !/descargarValorizacion\(aplicados/.test(pagina));
  cierto("RPT-V04 pantalla: usa pedirValorizacion con compuerta de última solicitud, descarta datos ante falla, muestra solo datos de los filtros y la página vigentes, y ofrece «Reintentar» conservando filtros", /pedirValorizacion\(aplicados, pagina\)/.test(pagina) && /crearCompuerta\(\)/.test(pagina) && /setDatos\(r\.datos\)/.test(pagina) && /mismos\(datos\.filtros, aplicados\)/.test(pagina) && /datos\.pagina\.numero === pagina/.test(pagina) && /Reintentar/.test(pagina) && !/\.catch\(\(e: unknown\)/.test(pagina));
  cierto("T05 acceso: sin sesión 401, sin permiso 403 y sin base 503 siguen en el guard común (Valorización no lo reimplementa); no hay acceso de plataforma ni empresa del cliente", /getCurrentSession/.test(leer("lib/reportes/guard.ts")) && !/empresaId\s*=\s*sp\.|searchParams.*empresa/i.test(rutaLeer + rutaExportar + fuente));
  cierto("RPT-V05/costos reales: solo inventario_costos y stock_saldos; sin float8/Number para dinero ni cantidades, sin precios de venta, sin escrituras", !/float8/.test(fuente) && !/precio|margen|lista_precio/i.test(fuente.replace(/\/\/.*$/gm, "").replace(/"[^"\n]*(precios de venta|márgenes)[^"\n]*"/g, "")) && !/(INSERT|UPDATE|DELETE)\s/i.test(fuente.replace(/\/\/.*$/gm, "")) && /FROM inventario_costos/.test(fuente) && /FROM stock_saldos/.test(fuente));
  cierto("RPT-V06 el alcance NO exige d.activo (un depósito inactivo con valor sigue en el total) y respeta empresa y usuario; la función compartida depositosPermitidos de los otros reportes no se modificó", !/d\.activo\s+AND/.test(fuente.replace(/ORDER BY d\.activo DESC/, "")) && /u\.alcance_depositos = 'TODOS'/.test(fuente) && /AND d\.activo\n?\s*AND usuario_puede_deposito/.test(leer("lib/reportes/stock-general.ts")));
  cierto("Integración: Stock general, Kardex, Stock crítico y Lotes siguen con sus rutas y exportadores; Valorización no los modifica ni reimplementa", ["stock-general", "kardex", "stock-critico", "lotes"].every((r) => /export async function GET/.test(leer(`app/api/reportes/${r}/route.ts`)) && !/valorizacion/i.test(leer(`lib/reportes/${r === "kardex" ? "kardex" : r === "lotes" ? "lotes" : r}.ts`))));
  cierto("Reposición y Stock (Inventario) no se tocaron: cálculo de reposición sin dependencias de Reportes", !/reportes/.test(leer("lib/reposicion/calculo.ts")));

  return fallos;
}
