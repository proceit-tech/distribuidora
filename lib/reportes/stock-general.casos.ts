/**
 * Reportes — Stock general (AUD-RPT-R09, RPT-SG-01…09; matriz SG-T01…SG-T09). Sin PostgreSQL ni navegador: conexión simulada que modela las lecturas del informe
 * (agregado por producto y desglose producto × depósito × lote con LEFT JOIN), reglas puras, XLSX abiertos celda a celda y análisis del código.
 * Los mocks prueban la FORMA de las lecturas y la lógica de TypeScript, NO la serialización real de PostgreSQL.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { sumarDecimales } from "@/lib/inventario/decimal";
import { crearCompuerta } from "@/lib/productos/catalogos-carga";
import { pedirStockGeneral } from "@/lib/reportes/cliente-stock-general";
import { generarPdfTabla, generarXlsxTabla } from "@/lib/reportes/export";
import { leerHojaXlsx } from "@/lib/reportes/export-xlsx.casos";
import { columnas, tablaStockGeneral } from "@/lib/reportes/export-stock-general";
import { leerStockGeneral, parsearFiltros } from "@/lib/reportes/stock-general";
import { calcularProducto, filtrosStockGeneralIguales, nivelStockTexto, respuestaStockGeneralValida, respuestaStockGeneralVigente } from "@/lib/reportes/stock-general-plan";
import { clasificarNivel } from "@/lib/stock/vista";
import type { StockGeneralFiltros, StockGeneralRespuesta, StockGeneralRespuestaApi } from "@/types/reportes";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const EMP = U(1), USR = U(2);
const DA = U(20), DB = U(21), DI = U(22);
const P1 = U(30), P2 = U(31), P3 = U(32), P4 = U(33), P5 = U(34);
const FILTROS: StockGeneralFiltros = { vista: "PRODUCTO", q: "", depositoId: "", categoriaId: "", marcaId: "", familiaId: "", situacion: "", lote: "", existencia: "TODOS" };

type Dato = Record<string, unknown>;
type Det = { prod: string; dep: string; lote?: string; venc?: string; d?: string; r?: string; c?: string; t?: string; td?: string; tr?: string; tc?: string; tt?: string };
type Prod = { id: string; codigo: string; unidad?: string; minimo?: string; maximo?: string; conf?: Record<string, { minimo: string; maximo: string }> };
type Escenario = { productos: Prod[]; det: Det[]; depositos: Array<{ id: string; nombre: string; activo: boolean }> };
type Consulta = { sql: string; params?: unknown[] };

type CampoDet = "d" | "r" | "c" | "t" | "td" | "tr" | "tc" | "tt";
const z = (v?: string) => v ?? "0";

export async function verificarCasosReportesStockGeneral(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  const reg: { consultas: Consulta[]; conexiones: number; liberadas: number; poolQuery: number } = { consultas: [], conexiones: 0, liberadas: 0, poolQuery: 0 };
  const reiniciar = () => { reg.consultas = []; reg.conexiones = 0; reg.liberadas = 0; reg.poolQuery = 0; };

  // Modelo de las dos lecturas del informe (agregado por producto y desglose con LEFT JOIN) a partir de los saldos del escenario.
  const responder = (e: Escenario) => (sql: string, params: unknown[] = []): Dato[] => {
    const deps = (params[1] as string[] | undefined) ?? [];

    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return [];
    if (/FROM depositos d JOIN usuarios u/.test(sql)) return e.depositos;
    if (/FROM empresas/.test(sql)) return [{ nombre: "Empresa SA", moneda: "PYG" }];
    if (/AS t_transito/.test(sql) && /GROUP BY p\.id/.test(sql)) {
      const conDep = /producto_deposito_configuracion/.test(sql);

      const m = /bool_or\(l\.codigo_lote ILIKE \$(\d+)\)/.exec(sql);
      const patron = m ? String(params[Number(m[1]) - 1]).replace(/%/g, "").toLowerCase() : null;
      const coincide = (x: Det) => !patron || (x.lote ?? "").toLowerCase().includes(patron);

      return e.productos.flatMap((p): Dato[] => {
        const filas = e.det.filter((x) => x.prod === p.id && deps.includes(x.dep));
        // Con filtro de lote solo salen los productos que TIENEN ese lote (HAVING); las cantidades mostradas son las del lote y las de situación (n_*) las del ámbito completo.
        if (patron && !filas.some((x) => (x.lote ?? "") !== "" && coincide(x))) return [];

        const mostradas = filas.filter(coincide);
        const suma = (k: CampoDet, l = mostradas) => sumarDecimales(l.map((x) => x[k]));
        const conf = conDep ? p.conf?.[deps[0]] : undefined;

        return [{
          id: p.id, codigo: p.codigo, ci: "", gtin: "", descripcion: `Producto ${p.codigo}`, categoria: "Cat", marca: "Marca", familia: "Fam", linea: "", unidad: p.unidad ?? "Unidad",
          minimo: conDep ? (conf?.minimo ?? "0") : (p.minimo ?? "0"), maximo: conDep ? (conf?.maximo ?? "0") : (p.maximo ?? "0"),
          n_disponible: suma("d", filas), n_reservado: suma("r", filas), n_cuarentena: suma("c", filas),
          disponible: suma("d"), reservado: suma("r"), cuarentena: suma("c"), transito: suma("t"), t_disponible: suma("td"), t_reservado: suma("tr"), t_cuarentena: suma("tc"), t_transito: suma("tt"),
        }];
      });
    }
    if (/FROM lista/.test(sql)) {
      const ids = params[2] as string[];
      const filas: Dato[] = ids.flatMap((id): Dato[] => {
        const p = e.productos.find((x) => x.id === id)!;
        const patronDet = /codigo_lote ILIKE \$4/.test(sql) ? String(params[3]).replace(/%/g, "").toLowerCase() : null;
        const ds = e.det.filter((x) => x.prod === id && deps.includes(x.dep) && (!patronDet || (x.lote ?? "").toLowerCase().includes(patronDet)) && sumarDecimales([x.d, x.r, x.c, x.t, x.td, x.tr, x.tc, x.tt]) !== "0").sort((a, b) => a.dep.localeCompare(b.dep) || (a.lote ?? "").localeCompare(b.lote ?? ""));

        return ds.length
          ? ds.map((x) => ({ producto_id: id, codigo: p.codigo, con_saldo: true, deposito: e.depositos.find((d) => d.id === x.dep)!.nombre, inactivo: !e.depositos.find((d) => d.id === x.dep)!.activo, lote: x.lote ?? "", venc: x.venc ?? "", disponible: z(x.d), reservado: z(x.r), cuarentena: z(x.c), transito: z(x.t), t_disponible: z(x.td), t_reservado: z(x.tr), t_cuarentena: z(x.tc), t_transito: z(x.tt) }))
          : [{ producto_id: id, codigo: p.codigo, con_saldo: false, deposito: null, inactivo: null, lote: "", venc: "" }];
      });

      if (/count\(\*\)::int AS n FROM lista/.test(sql)) return [{ n: filas.length }];

      const limite = params[params.length - 2] as number, desde = params[params.length - 1] as number;

      return filas.slice(desde, desde + limite);
    }
    if (/categorias_producto WHERE/.test(sql)) return [{ id: U(40), nombre: "Cat" }];
    if (/marcas_producto WHERE/.test(sql)) return [{ id: U(50), nombre: "Marca" }];
    if (/familias_producto WHERE/.test(sql)) return [{ id: U(60), nombre: "Fam" }];
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

          return { rows: responder(e)(sql, params) };
        },
        release: () => { reg.liberadas += 1; },
      };
    },
  }) as never;
  const informe = async (e: Escenario, f: Partial<StockGeneralFiltros> = {}, opciones: { pagina?: number; tamano?: number; todas?: boolean; usuario?: string } = {}) => {
    reiniciar();

    return leerStockGeneral(fakePool(e), EMP, opciones.usuario ?? USR, { ...FILTROS, ...f }, opciones.pagina ?? 1, opciones.tamano ?? 50, opciones.todas ?? false) as Promise<StockGeneralRespuesta>;
  };
  const depos = [{ id: DA, nombre: "Central", activo: true }, { id: DB, nombre: "Norte", activo: true }, { id: DI, nombre: "Viejo", activo: false }];

  // ═══ SG-T01 — estoque zero, solo terceros, solo tránsito; las dos vistas coherentes ═══
  const e1: Escenario = {
    productos: [{ id: P1, codigo: "A-1" }, { id: P2, codigo: "A-2" }, { id: P3, codigo: "A-3" }, { id: P4, codigo: "A-4" }],
    det: [
      { prod: P1, dep: DA, lote: "L1", venc: "2027-01-31", d: "10", r: "2" }, { prod: P1, dep: DB, d: "5" }, // propio
      { prod: P3, dep: DA, td: "7" }, // solo terceros
      { prod: P4, dep: DB, t: "3" }, // solo tránsito propio
      // P2: sin ningún saldo
    ],
    depositos: depos,
  };
  const prod = await informe(e1);
  const det = await informe(e1, { vista: "DETALLE" });

  igual("SG-T01 vista Por producto: los 4 productos activos (incluido el sin saldo) con sus totales; sin saldo = 1 (P2)", [prod.filas.map((f) => f.codigo), prod.pagina.totalFilas, prod.totales.productos, prod.totales.sinSaldo], [["A-1", "A-2", "A-3", "A-4"], 4, 4, 1]);
  igual("SG-T01 vista Detalle: el producto sin saldo sale en UNA fila «sin saldo» (sin depósito ni lote inventados) y los demás por depósito × lote; la paginación cuenta esas filas", [
    det.filas.map((f) => [f.codigo, f.deposito, f.lote, f.sinSaldo]), det.pagina.totalFilas,
  ], [[["A-1", "Central", "L1", false], ["A-1", "Norte", "", false], ["A-2", "", "", true], ["A-3", "Central", "", false], ["A-4", "Norte", "", false]], 5]);
  igual("SG-T01 propiedad por fila: solo propio, solo terceros y solo tránsito propio; la fila sin saldo tiene todo en cero", [det.filas.map((f) => f.propiedad), det.filas[2].disponible, det.filas[2].fisico, det.filas[2].terceros], [["PROPIO", "PROPIO", "", "TERCERO", "PROPIO"], "0", "0", "0"]);
  igual("SG-T01 el filtro Existencia considera todo el saldo (propio, tránsito y terceros): Con stock = A-1, A-3, A-4; Sin stock = A-2", [
    (await informe(e1, { existencia: "CON" })).filas.map((f) => f.codigo), (await informe(e1, { existencia: "SIN" })).filas.map((f) => f.codigo),
  ], [["A-1", "A-3", "A-4"], ["A-2"]]);
  igual("SG-T01 Detalle con Sin stock: solo la fila «sin saldo» (ids enviados al desglose = los productos filtrados); con depósito elegido el producto sin saldo en ESE depósito también aparece", [
    (await informe(e1, { vista: "DETALLE", existencia: "SIN" })).filas.map((f) => [f.codigo, f.sinSaldo]), (await informe(e1, { vista: "DETALLE", depositoId: DB })).filas.map((f) => [f.codigo, f.deposito, f.sinSaldo]),
  ], [[["A-2", true]], [["A-1", "Norte", false], ["A-2", "", true], ["A-3", "", true], ["A-4", "Norte", false]]]);
  cierto("SG-T01 la SQL del desglose usa LEFT JOIN desde la lista de productos filtrados y HAVING sum > 0 (el producto sin saldo no se pierde ni se inventa un depósito)", (() => {
    const q = reg.consultas.find((c) => /FROM lista/.test(c.sql) && /count/.test(c.sql));

    return !!q && /unnest\(\$3::uuid\[\]\)/.test(q.sql) && /LEFT JOIN det ON det\.producto_id = f\.id/.test(q.sql) && /HAVING sum\(s\.cantidad\) > 0/.test(q.sql);
  })());

  // ═══ SG-T02 — conciliación detalle vs producto ═══
  const sumaDetalle = (campo: "disponible" | "reservado" | "cuarentena" | "transito" | "fisico" | "virtual" | "terceros", cod: string) => sumarDecimales(det.filas.filter((f) => f.codigo === cod).map((f) => f[campo]));
  const filaProd = (cod: string) => prod.filas.find((f) => f.codigo === cod)!;

  igual("SG-T02 la suma de las filas de detalle (depósito × lote) de cada producto coincide EXACTAMENTE con la fila de la vista por producto en todas las columnas", ["A-1", "A-3", "A-4"].map((cod) => (["disponible", "reservado", "cuarentena", "transito", "fisico", "virtual", "terceros"] as const).every((k) => sumaDetalle(k, cod) === filaProd(cod)[k])), [true, true, true]);
  igual("SG-T02 físico propio = disponible + reservado + cuarentena (A-1: 17), virtual suma el tránsito (A-4: 3), terceros aparte (A-3: 7); lote y vencimiento solo si están registrados", [filaProd("A-1").fisico, filaProd("A-4").virtual, filaProd("A-3").terceros, det.filas[0].fechaVencimiento, det.filas[1].fechaVencimiento], ["17", "3", "7", "2027-01-31", ""]);

  // ═══ SG-T03 — clasificación alineada con Inventario > Stock ═══
  const e3: Escenario = {
    productos: [{ id: P1, codigo: "B-1", minimo: "100", maximo: "200", conf: { [DB]: { minimo: "5", maximo: "50" } } }, { id: P2, codigo: "B-2", minimo: "100", maximo: "200" }],
    det: [{ prod: P1, dep: DB, d: "20" }, { prod: P1, dep: DA, d: "30" }, { prod: P2, dep: DB, d: "20" }],
    depositos: depos,
  };
  const consolidado = await informe(e3);
  const consolidadoSql = reg.consultas.find((c) => /AS t_transito/.test(c.sql) && /GROUP BY/.test(c.sql))!.sql;
  const enB = await informe(e3, { depositoId: DB });
  const enBSql = reg.consultas.find((c) => /AS t_transito/.test(c.sql) && /GROUP BY/.test(c.sql))!;

  igual("SG-T03 consolidado: política del producto (mínimo 100): disponible 50 → BAJO", consolidado.filas.map((f) => [f.codigo, f.disponible, f.nivel]), [["B-1", "50", "BAJO"], ["B-2", "20", "BAJO"]]);
  igual("SG-T03 depósito Norte: se usan los parámetros de ESE depósito (5/50): disponible 20 → NORMAL, igual que vistaPorDeposito; el producto sin parámetros del depósito no es BAJO ni SOBRESTOCK (0/0 → NORMAL)", enB.filas.map((f) => [f.codigo, f.disponible, f.nivel]), [["B-1", "20", "NORMAL"], ["B-2", "20", "NORMAL"]]);
  cierto("SG-T03 la SQL toma el mínimo/máximo de producto_deposito_configuracion del depósito elegido solo cuando hay filtro de depósito (cero si no hay parámetro) y los del producto en el consolidado", /LEFT JOIN producto_deposito_configuracion k ON k\.empresa_id = p\.empresa_id AND k\.producto_id = p\.id AND k\.deposito_id = \$\d+/.test(enBSql.sql) && /coalesce\(k\.stock_minimo, 0\)/.test(enBSql.sql) && enBSql.params?.includes(DB) === true && !/producto_deposito_configuracion/.test(consolidadoSql) && /coalesce\(p\.stock_minimo, 0\)/.test(consolidadoSql));
  {
    // La misma regla que Inventario > Stock (clasificarNivel): rejilla de casos con decimales
    const casos: Array<[string, string, string, string, string]> = [];

    for (const disp of ["0", "3", "5", "10.5", "50"]) for (const res of ["0", "20"]) for (const min of ["0", "5", "10.5"]) for (const max of ["0", "40", "60"]) casos.push([disp, sumarDecimales([disp, res]), min, max, res]);

    const difs = casos.filter(([disp, fis, min, max]) => nivelStockTexto({ disponible: disp, fisico: fis, minimo: min, maximo: max }) !== clasificarNivel({ disponible: Number(disp), totalFisico: Number(fis), minimo: Number(min), maximo: Number(max) }));

    igual(`SG-T03 nivelStockTexto (decimal exacto) ≡ clasificarNivel de Inventario > Stock en ${casos.length} combinaciones de disponible/reservado/mínimo/máximo`, difs, []);
  }
  igual("SG-T03 filtrar por situación usa ese nivel: con Norte, «Bajo» no devuelve nada; en el consolidado devuelve ambos; el nivel es de stock, no «en punto de reposición»", [(await informe(e3, { depositoId: DB, situacion: "BAJO" })).filas.length, (await informe(e3, { situacion: "BAJO" })).filas.length], [0, 2]);
  igual("SG-T03 sobrestock con físico (no solo disponible): máximo 40, disponible 30 + reservado 20 → SOBRESTOCK", calcularProducto({ id: "x", codigo: "x", ci: "", gtin: "", descripcion: "", categoria: "", marca: "", familia: "", linea: "", unidad: "", minimo: "0", maximo: "40", disponible: "30", reservado: "20", cuarentena: "0", transito: "0", t_disponible: "0", t_reservado: "0", t_cuarentena: "0", t_transito: "0" }).nivel, "SOBRESTOCK");

  // ═══ SG-T04 — unidades heterogéneas y precisión ═══
  const e4: Escenario = {
    productos: [{ id: P1, codigo: "K-1", unidad: "Kilo" }, { id: P2, codigo: "U-1", unidad: "Unidad" }, { id: P3, codigo: "L-1", unidad: "Litro" }, { id: P4, codigo: "L-2", unidad: "Litro" }],
    det: [
      { prod: P1, dep: DA, d: "10.5000", td: "123456789012345.1234" }, { prod: P2, dep: DA, d: "0.0001" }, { prod: P3, dep: DA, d: "2.5", r: "1" }, { prod: P4, dep: DA, d: "3.25" },
    ],
    depositos: depos,
  };
  const r4 = await informe(e4);
  const unidad = (u: string) => r4.totales.porUnidad.find((x) => x.unidad === u)!;

  igual("SG-T04 totales por unidad (sin mezclar kg, unidades y litros) y exactos: Litro suma 2,5 + 3,25 = 5,75 disponible, físico 6,75", [r4.totales.porUnidad.map((u) => u.unidad), unidad("Litro").productos, unidad("Litro").disponible, unidad("Litro").fisico, unidad("Kilo").terceros, unidad("Unidad").disponible], [["Kilo", "Litro", "Unidad"], 2, "5.75", "6.75", "123456789012345.1234", "0.0001"]);
  igual("SG-T04 el total no tiene cantidades globales (disponible/físico/virtual/terceros sin unidad)", Object.keys(r4.totales).filter((k) => ["disponible", "reservado", "fisico", "virtual", "terceros", "transito"].includes(k)), []);

  const t4 = tablaStockGeneral(r4);
  const ic = (titulo: string) => t4.columnas.findIndex((c) => c.titulo === titulo);
  const xl = leerHojaXlsx(generarXlsxTabla(t4));
  const base = 1 + 1 + 1 + t4.filtros.length + 1 + 1;
  const col = (i: number) => String.fromCharCode(65 + i);
  const celda = (c: number, fila: number) => xl.get(`${col(c)}${fila}`);

  igual("SG-T04 XLSX real: 10,5 número; 0,0001 número; terceros 123456789012345,1234 como texto exacto (no se pierden dígitos); cantidades del TOTAL GENERAL «n/a»", [
    celda(ic("Disponible"), base + 1), celda(ic("Disponible"), base + 2), celda(ic("Terceros"), base + 1), celda(ic("Disponible"), base + 1 + r4.filas.length), celda(ic("Físico"), base + 1 + r4.filas.length),
  ], [{ tipo: "n", valor: "10.5" }, { tipo: "n", valor: "0.0001" }, { tipo: "s", valor: "123456789012345.1234" }, { tipo: "s", valor: "n/a" }, { tipo: "s", valor: "n/a" }]);

  const pdf = [...generarPdfTabla(t4).toString("latin1").matchAll(/\(((?:[^()\\]|\\.)*)\) Tj/g)].map((m) => m[1].replace(/\\(.)/g, "$1"));

  cierto("SG-T04 PDF: valores exactos (10,5 · 0,0001 · 123.456.789.012.345,1234), «n/a» en el total y el resumen por unidad rotulado en las notas; sin NaN", pdf.includes("10,5") && pdf.includes("0,0001") && pdf.includes("123.456.789.012.345,1234") && pdf.includes("n/a") && pdf.some((s) => /Totales por unidad de medida/.test(s)) && pdf.some((s) => /Litro \(2 producto\(s\)\): disponible 5,75/.test(s)) && !pdf.some((s) => /NaN/.test(s)));
  cierto("SG-T04 compatibilidad de las dos vistas: mismas columnas de cantidad (siete) en Producto y Detalle", columnas("PRODUCTO").filter((c) => c.cant).map((c) => c.titulo).join() === columnas("DETALLE").filter((c) => c.cant).map((c) => c.titulo).join() && columnas("PRODUCTO").filter((c) => c.cant).length === 7);

  // ═══ SG-T05 — alcance, empresa, permisos ═══
  const r5 = await informe(e1, { vista: "DETALLE", depositoId: DI });
  const aq = reg.consultas.find((c) => /FROM depositos d JOIN usuarios u/.test(c.sql))!;

  igual("SG-T05 un depósito INACTIVO del alcance del usuario es válido (mismo criterio que Inventario > Stock / NEX-046); su información sale rotulada y el catálogo marca cuáles están inactivos", [r5.catalogos.depositos.map((d) => [d.nombre, d.activo]), "error" in (r5 as object)], [[["Central", true], ["Norte", true], ["Viejo", false]], false]);
  igual("SG-T05 el alcance sale de usuarios/usuario_deposito con la empresa y el usuario de la SESIÓN ($1/$2), no de la consulta del cliente", [aq.params, /u\.alcance_depositos = 'TODOS'/.test(aq.sql) && /usuario_deposito ud/.test(aq.sql) && !/d\.activo\s+AND/.test(aq.sql)], [[EMP, USR], true]);

  const fuera = (await informe(e1, { depositoId: U(99) })) as unknown as { error: string; status: number };

  igual("SG-T05 depósito fuera del alcance (otra empresa o no asignado) → 403 y no se lee ningún saldo", [fuera.status, reg.consultas.some((c) => /stock_saldos/.test(c.sql))], [403, false]);
  cierto("SG-T05 toda lectura de saldos usa la empresa de la sesión ($1) y los depósitos del alcance ($2)", (await informe(e1), reg.consultas.filter((c) => /stock_saldos/.test(c.sql)).every((c) => c.params?.[0] === EMP && /empresa_id = \$1/.test(c.sql) && Array.isArray(c.params?.[1]))));
  igual("SG-T05 otro usuario: se pasa SU id al alcance (nunca el de otra sesión)", (await informe(e1, {}, { usuario: U(77) }), reg.consultas.find((c) => /FROM depositos d JOIN usuarios u/.test(c.sql))?.params), [EMP, U(77)]);

  const rutaLeer = leer("app/api/reportes/stock-general/route.ts");
  const rutaExportar = leer("app/api/reportes/stock-general/exportar/route.ts");
  const pagina = leer("app/(private)/reportes/stock-general/page.tsx");

  cierto("SG-T05 servidor: consultar exige REPORTES.VER; exportar exige VER y EXPORTAR; la consulta informa permisos.exportar con hasPermission (consultivo); sin sesión/permiso/base responden 401/403/503 desde el guard común", /autorizarReporte\(\["VER"\]\)/.test(rutaLeer) && /autorizarReporte\(\["VER", "EXPORTAR"\]\)/.test(rutaExportar) && /hasPermission\(acceso, "REPORTES", "EXPORTAR"\)/.test(rutaLeer) && /status: 401/.test(leer("lib/reportes/guard.ts")) && /status: 403/.test(leer("lib/reportes/guard.ts")) && /status: 503/.test(leer("lib/reportes/guard.ts")));
  cierto("SG-T05 pantalla: los botones Excel/PDF existen solo con permisos.exportar confirmado y datos vigentes, y exportan los filtros de la respuesta vigente", /puedeExportar \? \(/.test(pagina) && /actual\?\.permisos\.exportar === true/.test(pagina) && /descargarStockGeneral\(actual\.filtros, formato\)/.test(pagina) && !/descargarStockGeneral\(aplicados/.test(pagina));

  // ═══ SG-T06 — cliente: errores, formato, orden, reintento ═══
  const ok: StockGeneralRespuestaApi = { ...prod, permisos: { exportar: true } };
  const buscar = (r: { status: number; cuerpo?: unknown } | "red" | "texto", espera = 0) => async () => {
    if (espera) await new Promise((x) => setTimeout(x, espera));
    if (r === "red") throw new TypeError("fetch failed");
    if (r === "texto") return new Response("no es json", { status: 200 });

    return new Response(JSON.stringify(r.cuerpo ?? {}), { status: r.status });
  };

  igual("SG-T06 la respuesta real del informe es válida para el cliente (round-trip JSON) y entrega los datos", [respuestaStockGeneralValida(JSON.parse(JSON.stringify(ok))), (await pedirStockGeneral(FILTROS, 1, buscar({ status: 200, cuerpo: ok }))).error], [true, ""]);

  const malas: Array<[string, unknown]> = [
    ["array", []], ["objeto vacío", {}], ["fila nula", { ...ok, filas: [null] }], ["filas no es arreglo", { ...ok, filas: {} }], ["cantidad float", { ...ok, filas: [{ ...ok.filas[0], disponible: 10.5 }] }],
    ["cantidad no numérica", { ...ok, filas: [{ ...ok.filas[0], fisico: "abc" }] }], ["nivel inválido", { ...ok, filas: [{ ...ok.filas[0], nivel: "X" }] }], ["sin totales", { ...ok, totales: undefined }],
    ["unidad con cantidad float", { ...ok, totales: { ...ok.totales, porUnidad: [{ ...ok.totales.porUnidad[0], disponible: 3 }] } }], ["catálogo con nulo", { ...ok, catalogos: { ...ok.catalogos, depositos: [null] } }],
    ["depósito sin activo", { ...ok, catalogos: { ...ok.catalogos, depositos: [{ id: DA, nombre: "x" }] } }], ["sin permisos", { ...ok, permisos: undefined }], ["exportar no booleano", { ...ok, permisos: { exportar: "si" } }], ["paginación inválida", { ...ok, pagina: { numero: 1 } }],
  ];

  for (const [n, cuerpo] of malas) {
    const r = await pedirStockGeneral(FILTROS, 1, buscar({ status: 200, cuerpo }));

    igual(`SG-T06 HTTP 200 malformado (${n}): sin datos y error recuperable`, [r.datos, r.error !== ""], [null, true]);
  }

  for (const status of [401, 403, 500, 503]) {
    const r = await pedirStockGeneral(FILTROS, 1, buscar({ status, cuerpo: { error: "Fallo." } }));

    igual(`SG-T06 HTTP ${status}: sin datos y con código`, [r.datos, r.error.includes(`código ${status}`)], [null, true]);
  }

  igual("SG-T06 red caída y JSON inválido → sin datos", [(await pedirStockGeneral(FILTROS, 1, buscar("red"))).datos, (await pedirStockGeneral(FILTROS, 1, buscar("texto"))).datos], [null, null]);

  const parsed = parsearFiltros(new URLSearchParams("vista=DETALLE&q=aceite&lote=L1&situacion=BAJO&existencia=CON&depositoId=" + DA));
  const deParser = "filtros" in parsed ? parsed.filtros : FILTROS;
  const respReal = JSON.parse(JSON.stringify(await informe(e1, deParser))) as StockGeneralRespuestaApi;
  const pantalla: StockGeneralFiltros = { vista: "DETALLE", q: "aceite", depositoId: DA, categoriaId: "", marcaId: "", familiaId: "", situacion: "BAJO", lote: "L1", existencia: "CON" };

  igual("SG-T06 igualdad de filtros por campo (el orden de propiedades de la API y de la pantalla no importa; cada uno de los nueve campos cuenta)", [
    filtrosStockGeneralIguales(respReal.filtros, pantalla), (["vista", "q", "depositoId", "categoriaId", "marcaId", "familiaId", "situacion", "lote", "existencia"] as const).map((k) => filtrosStockGeneralIguales(pantalla, { ...pantalla, [k]: k === "vista" ? "PRODUCTO" : k === "situacion" ? "NORMAL" : k === "existencia" ? "SIN" : "otro" })),
  ], [true, [false, false, false, false, false, false, false, false, false]]);
  igual("SG-T06 respuesta vigente: mismos filtros y página; filtros distintos, otra página, error o sin datos → rechazada", [
    respuestaStockGeneralVigente(respReal, "", pantalla, 1), respuestaStockGeneralVigente(respReal, "", { ...pantalla, q: "arroz" }, 1), respuestaStockGeneralVigente(respReal, "", pantalla, 2), respuestaStockGeneralVigente(respReal, "x", pantalla, 1), respuestaStockGeneralVigente(null, "", pantalla, 1),
  ], [true, false, false, false, false]);
  {
    const compuerta = crearCompuerta();
    const est: { datos: StockGeneralRespuestaApi | null; error: string } = { datos: null, error: "" };
    const cargar = async (f: StockGeneralFiltros, pg: number, espera: number, fallar = false) => {
      const sol = compuerta.nueva();
      const res = await pedirStockGeneral(f, pg, async () => {
        await new Promise((x) => setTimeout(x, espera));
        if (fallar) return new Response(JSON.stringify({ error: "x" }), { status: 500 });

        const r = JSON.parse(JSON.stringify(await informe(e1, f))) as StockGeneralRespuestaApi;

        r.pagina.numero = pg;

        return new Response(JSON.stringify({ ...r, permisos: { exportar: true } }), { status: 200 });
      });

      if (!compuerta.vigente(sol)) return;
      est.datos = res.datos;
      est.error = res.error;
    };
    const A = { ...pantalla, q: "ace" }, B = { ...pantalla, q: "aceite" };

    await Promise.all([cargar(A, 1, 40), cargar(B, 1, 5)]);
    igual("SG-T06 búsqueda en dos pasos / alternancia A→B: la respuesta lenta anterior no pisa a la última", [est.datos?.filtros.q, respuestaStockGeneralVigente(est.datos, est.error, B, 1), respuestaStockGeneralVigente(est.datos, est.error, A, 1)], ["aceite", true, false]);
    await cargar(B, 2, 0);
    igual("SG-T06 paginación: la página 2 solo es vigente para la página 2", [respuestaStockGeneralVigente(est.datos, est.error, B, 2), respuestaStockGeneralVigente(est.datos, est.error, B, 1)], [true, false]);
    await cargar(B, 2, 0, true);
    igual("SG-T06 una falla descarta los datos anteriores (no hay resultado vigente ni exportación)", [est.datos, est.error !== "", respuestaStockGeneralVigente(est.datos, est.error, B, 2)], [null, true, false]);
    await cargar(B, 1, 0);
    igual("SG-T06 el reintento válido recupera la respuesta vigente", [respuestaStockGeneralVigente(est.datos, est.error, B, 1), est.error], [true, ""]);
  }
  cierto("SG-T06 pantalla: compuerta de última solicitud, datos descartados en error, solo respuesta vigente visible, «Reintentar» y sin JSON.stringify ni .catch que conserve datos", /pedirStockGeneral\(aplicados, pagina\)/.test(pagina) && /crearCompuerta\(\)/.test(pagina) && /setDatos\(r\.datos\)/.test(pagina) && /respuestaStockGeneralVigente\(datos, error, aplicados, pagina\)/.test(pagina) && /Reintentar/.test(pagina) && !/JSON\.stringify/.test(pagina) && !/\.catch\(\(e: unknown\)/.test(pagina));

  // ═══ SG-T07 — snapshot ═══
  await informe(e1, { vista: "DETALLE" });
  cierto("SG-T07 UNA conexión y UNA transacción REPEATABLE READ de solo lectura para alcance, agregado, desglose, conteo, catálogos y hora; nunca Pool.query; conexión liberada", reg.conexiones === 1 && reg.poolQuery === 0 && reg.consultas[0].sql.startsWith("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY") && reg.consultas.at(-1)?.sql === "COMMIT" && reg.liberadas === 1 && reg.consultas.length >= 9);

  reiniciar();
  let falla = "";
  try {
    await leerStockGeneral(fakePool(e1, (sql) => /FROM lista/.test(sql)), EMP, USR, { ...FILTROS, vista: "DETALLE" }, 1, 50, false);
  } catch (err) {
    falla = (err as Error).message;
  }
  igual("SG-T07 ante un error de lectura: ROLLBACK, se propaga el error y se libera la conexión (sin COMMIT)", [falla, reg.consultas.at(-1)?.sql, reg.consultas.some((c) => c.sql === "COMMIT"), reg.liberadas], ["fallo de consulta", "ROLLBACK", false, 1]);

  // ═══ SG-T08 — paginación, exportación y tope de 50.000 ═══
  const muchos: Escenario = { productos: Array.from({ length: 120 }, (_, i) => ({ id: `p${i}`, codigo: `C${String(i).padStart(3, "0")}` })), det: Array.from({ length: 120 }, (_, i) => ({ prod: `p${i}`, dep: DA, d: String(i + 1) })), depositos: depos };
  const pg2 = await informe(muchos, {}, { pagina: 2, tamano: 50 });
  const pg3d = await informe(muchos, { vista: "DETALLE" }, { pagina: 3, tamano: 50 });
  const todo = await informe(muchos, {}, { todas: true });
  const todoDet = await informe(muchos, { vista: "DETALLE" }, { todas: true });

  igual("SG-T08 paginación Por producto: página 2 de 50 = productos 51–100 y totalFilas 120; Detalle: página 3 = las 20 últimas filas; el total y los indicadores son los del filtro completo", [
    pg2.filas.map((f) => f.codigo).slice(0, 2), pg2.filas.length, pg2.pagina.totalFilas, pg3d.filas.length, pg3d.pagina.totalFilas, pg3d.totales.productos,
  ], [["C050", "C051"], 50, 120, 20, 120, 120]);
  igual("SG-T08 exportación (todas): devuelve todas las filas, sin depender de la página de la pantalla, en las dos vistas", [todo.filas.length, todoDet.filas.length, todo.pagina.totalFilas], [120, 120, 120]);

  const gigante: Escenario = { productos: Array.from({ length: 50001 }, (_, i) => ({ id: `q${i}`, codigo: `Z${i}` })), det: [], depositos: depos };
  const r413 = (await informe(gigante, {}, { todas: true })) as unknown as { error: string; status: number };

  igual("SG-T08 más de 50.000 filas en la exportación → 413 (ejercitado con 50.001 productos) y la transacción se cierra", [r413.status, reg.consultas.at(-1)?.sql, reg.liberadas], [413, "COMMIT", 1]);
  igual("SG-T08 exactamente 50.000 filas SÍ se exportan", ((await informe({ ...gigante, productos: gigante.productos.slice(0, 50000) }, {}, { todas: true })) as StockGeneralRespuesta).filas.length, 50000);
  igual("SG-T08 Excel y PDF de las dos vistas salen con los mismos filtros y columnas que la pantalla (descripción de filtros incluye existencia y alcance) y sin NaN", ["PRODUCTO", "DETALLE"].map((v) => {
    const t = tablaStockGeneral(v === "PRODUCTO" ? { ...prod, filtros: { ...prod.filtros, existencia: "CON" } } : { ...det, filtros: { ...det.filtros, existencia: "CON" } });
    const h = leerHojaXlsx(generarXlsxTabla(t));

    return [t.filtros.some((l) => /Existencia: Con stock \(propio, en tránsito o de terceros\)/.test(l)), t.filtros.some((l) => /Todos los de su alcance \(3, 1 inactivo\(s\)\)/.test(l)), [...h.values()].some((c) => /NaN|undefined/.test(c.valor)), generarPdfTabla(t).subarray(0, 5).toString()];
  }), [[true, true, false, "%PDF-"], [true, true, false, "%PDF-"]]);

  // ═══ RPT-R10-01 — el filtro de lote selecciona lotes y cantidades, pero NO cambia la situación del producto ═══
  const e10: Escenario = {
    productos: [
      { id: P1, codigo: "M-1", minimo: "50", maximo: "0", conf: { [DA]: { minimo: "50", maximo: "0" }, [DB]: { minimo: "0", maximo: "0" } } }, // L1=5, L2=95 → 100 ≥ 50: NORMAL
      { id: P2, codigo: "M-2", minimo: "50" }, // realmente BAJO: 10 + 5
      { id: P3, codigo: "M-3", minimo: "50" }, // L1 solo terceros (200), L2 propio 95 → NORMAL
      { id: P4, codigo: "M-4", minimo: "50" }, // sin lotes
      { id: P5, codigo: "M-5", minimo: "50" }, // sin ningún saldo
    ],
    det: [
      { prod: P1, dep: DA, lote: "L1", d: "5" }, { prod: P1, dep: DA, lote: "L2", d: "95" },
      { prod: P2, dep: DA, lote: "L1", d: "10" }, { prod: P2, dep: DA, lote: "L2", d: "5" },
      { prod: P3, dep: DA, lote: "L1", td: "200" }, { prod: P3, dep: DA, lote: "L2", d: "95" },
      { prod: P4, dep: DA, d: "70" },
    ],
    depositos: depos,
  };
  const f10 = (r: StockGeneralRespuesta, cod: string) => r.filas.find((f) => f.codigo === cod);
  const sinLote = await informe(e10);
  const conL1 = await informe(e10, { lote: "L1" });

  igual("R10-01 sin filtro de lote: M-1 disponible 100, situación NORMAL (como Inventario > Stock); M-2 realmente BAJO (15 < 50)", [f10(sinLote, "M-1")?.disponible, f10(sinLote, "M-1")?.nivel, f10(sinLote, "M-2")?.disponible, f10(sinLote, "M-2")?.nivel], ["100", "NORMAL", "15", "BAJO"]);
  igual("R10-01 con filtro L1: se muestra SOLO el lote L1 (disponible 5) pero la situación sigue NORMAL (el stock propio completo es 100); M-2 sigue BAJO", [f10(conL1, "M-1")?.disponible, f10(conL1, "M-1")?.nivel, f10(conL1, "M-2")?.disponible, f10(conL1, "M-2")?.nivel], ["5", "NORMAL", "10", "BAJO"]);
  igual("R10-01 filtro L1 + situación Bajo: M-1 NO aparece (no es bajo); M-2 sí (realmente bajo); con Normal ocurre lo contrario", [(await informe(e10, { lote: "L1", situacion: "BAJO" })).filas.map((f) => f.codigo), (await informe(e10, { lote: "L1", situacion: "NORMAL" })).filas.map((f) => f.codigo)], [["M-2"], ["M-1", "M-3"]]);
  igual("R10-01 los totales del filtro reflejan SOLO el lote seleccionado (L1): M-1 5 + M-2 10 = 15 de disponible propio; terceros 200 de M-3; nada de L2", [conL1.totales.porUnidad[0].disponible, conL1.totales.porUnidad[0].terceros, conL1.totales.productos], ["15", "200", 3]);
  igual("R10-01 lote solo de terceros (M-3, L1): el producto se muestra con disponible propio 0 y terceros 200, sin alterar la situación del stock propio completo (NORMAL, no SIN_STOCK); su situación 'sin saldo' es falsa porque tiene terceros", [f10(conL1, "M-3")?.disponible, f10(conL1, "M-3")?.terceros, f10(conL1, "M-3")?.nivel, f10(conL1, "M-3")?.fisico], ["0", "200", "NORMAL", "0"]);
  igual("R10-01 producto sin lotes (M-4), sin ningún saldo (M-5) y lote inexistente: con filtro de lote no se muestran (no se inventan lotes ni saldos); sin filtro M-4 sí y M-5 aparece sin saldo", [
    conL1.filas.map((f) => f.codigo).filter((c) => c === "M-4" || c === "M-5"), (await informe(e10, { lote: "NOEXISTE" })).filas.length, f10(sinLote, "M-4")?.disponible, f10(sinLote, "M-5")?.nivel, sinLote.totales.sinSaldo,
  ], [[], 0, "70", "SIN_STOCK", 1]);
  igual("R10-01 existencia sobre el recorte mostrado: con lote L1, «Con stock» incluye M-3 (terceros) y excluye productos cuyo lote no existe; «Sin stock» queda vacío", [(await informe(e10, { lote: "L1", existencia: "CON" })).filas.map((f) => f.codigo), (await informe(e10, { lote: "L1", existencia: "SIN" })).filas.length], [["M-1", "M-2", "M-3"], 0]);

  // Consolidado vs depósito con políticas distintas (A mínimo 50, B sin parámetros) y con lote
  const e10b: Escenario = {
    productos: [{ id: P1, codigo: "N-1", minimo: "50", conf: { [DA]: { minimo: "50", maximo: "0" } } }],
    det: [{ prod: P1, dep: DA, lote: "L1", d: "5" }, { prod: P1, dep: DA, lote: "L2", d: "95" }, { prod: P1, dep: DB, lote: "L1", d: "1" }],
    depositos: depos,
  };

  igual("R10-01 con y sin depósito, mismo lote L1: consolidado (A 5 + B 1 = 6 de L1; stock completo 101 ≥ 50) NORMAL; depósito A (5 de L1; completo 100 ≥ 50) NORMAL; depósito B sin parámetros (completo 1, mínimo 0) NORMAL", [
    (await informe(e10b, { lote: "L1" })).filas.map((f) => [f.disponible, f.nivel]), (await informe(e10b, { lote: "L1", depositoId: DA })).filas.map((f) => [f.disponible, f.nivel]), (await informe(e10b, { lote: "L1", depositoId: DB })).filas.map((f) => [f.disponible, f.nivel]),
  ], [[["6", "NORMAL"]], [["5", "NORMAL"]], [["1", "NORMAL"]]]);

  // Estructura REAL de la consulta: el lote no está en el WHERE ni en las sumas de la situación; sí en las sumas mostradas y en el HAVING
  await informe(e10, { lote: "L1", depositoId: DA });
  const aggQ = reg.consultas.find((c) => /AS t_transito/.test(c.sql) && /GROUP BY p\.id/.test(c.sql))!;
  const parteDonde = aggQ.sql.slice(aggQ.sql.indexOf("WHERE p.empresa_id"), aggQ.sql.indexOf("GROUP BY"));
  const colN = (nombre: string) => aggQ.sql.split("\n").find((l) => l.includes(`AS ${nombre},`) || l.includes(`AS ${nombre}\n`)) ?? "";
  const colMostrada = (nombre: string) => aggQ.sql.split("\n").find((l) => new RegExp(`::text AS ${nombre},?$`).test(l.trim())) ?? "";
  const iHaving = aggQ.sql.indexOf("HAVING"), iOrden = aggQ.sql.indexOf("ORDER BY");

  cierto("R10-01 estructura de la consulta: el filtro de lote NO está en el WHERE; las sumas de situación (n_disponible, n_reservado, n_cuarentena) NO lo usan; las cantidades mostradas SÍ; el HAVING exige que el producto tenga ese lote", !/codigo_lote/.test(parteDonde) && ["n_disponible", "n_reservado", "n_cuarentena"].every((n) => colN(n) !== "" && !/codigo_lote/.test(colN(n))) && /codigo_lote ILIKE/.test(colMostrada("disponible")) && /codigo_lote ILIKE/.test(colMostrada("t_disponible")) && iHaving > 0 && iHaving < iOrden && /bool_or\(l\.codigo_lote ILIKE \$\d+\)/.test(aggQ.sql.slice(iHaving, iOrden)));
  cierto("R10-01 el parámetro del lote y el del depósito viajan como parámetros (no concatenados) y la política del depósito sigue saliendo de producto_deposito_configuracion del depósito elegido", aggQ.params?.includes("%L1%") === true && aggQ.params?.includes(DA) === true && !aggQ.sql.includes("L1") && /LEFT JOIN producto_deposito_configuracion k/.test(aggQ.sql) && /coalesce\(k\.stock_minimo, 0\)/.test(aggQ.sql));

  await informe(e10, {});
  const sinLoteQ = reg.consultas.find((c) => /AS t_transito/.test(c.sql) && /GROUP BY p\.id/.test(c.sql))!;

  cierto("R10-01 sin filtro de lote la consulta no agrega predicados de lote ni HAVING de lote (comportamiento anterior)", !/ILIKE \$\d+\), 0\)::text AS disponible/.test(sinLoteQ.sql) && !/bool_or/.test(sinLoteQ.sql));

  // Orden de aplicación: 1) agregado con lote → 2) situación sobre el stock completo → 3) filtro de situación → 4) desglose solo de los productos que sobreviven
  await informe(e10, { lote: "L1", situacion: "BAJO", vista: "DETALLE" });
  const q = reg.consultas.map((c) => c.sql);
  const iAgg = q.findIndex((x) => /AS t_transito/.test(x) && /GROUP BY p\.id/.test(x)), iLista = q.findIndex((x) => /FROM lista/.test(x));
  const listaQ = reg.consultas[iLista];

  cierto("R10-01 orden de lectura: primero el agregado, luego (solo si queda algún producto tras la situación) el desglose; el desglose recibe SOLO los ids que pasaron el filtro de situación y el lote en su WHERE", iAgg >= 0 && iLista > iAgg && JSON.stringify(listaQ.params?.[2]) === JSON.stringify([P2]) && /codigo_lote ILIKE \$4/.test(listaQ.sql) && listaQ.params?.[3] === "%L1%");

  const sinProductos = await informe(e10, { lote: "L1", situacion: "SOBRESTOCK", vista: "DETALLE" });

  igual("R10-01 si ningún producto cumple la situación, no se consulta el desglose y la respuesta es vacía y consistente", [sinProductos.filas.length, sinProductos.pagina.totalFilas, reg.consultas.some((c) => /FROM lista/.test(c.sql)), sinProductos.totales.productos], [0, 0, false, 0]);

  // Vista detalle con lote: las filas y los totales corresponden al lote; la situación sigue siendo la del producto
  const detL1 = await informe(e10, { lote: "L1", vista: "DETALLE" });

  igual("R10-01 vista Detalle con L1: una fila por producto×depósito×lote L1 (M-1 5, M-2 10, M-3 solo terceros 200), situación NORMAL/BAJO del stock completo, sumas por producto = vista Por producto", [
    detL1.filas.map((f) => [f.codigo, f.lote, f.disponible, f.terceros, f.nivel]), detL1.pagina.totalFilas,
  ], [[["M-1", "L1", "5", "0", "NORMAL"], ["M-2", "L1", "10", "0", "BAJO"], ["M-3", "L1", "0", "200", "NORMAL"]], 3]);

  // Empresas y alcance parcial con lote
  const e10c: Escenario = { ...e10, depositos: [{ id: DA, nombre: "Central", activo: true }] };
  const parcial = await informe(e10c, { lote: "L1" }, { usuario: U(88) });
  const alq = reg.consultas.find((c) => /FROM depositos d JOIN usuarios u/.test(c.sql))!;

  igual("R10-01 usuario con alcance parcial: el alcance se calcula con su id y la empresa de la sesión; los saldos leídos son solo de sus depósitos ($2) y el nivel usa solo ese ámbito", [alq.params, reg.consultas.filter((c) => /stock_saldos/.test(c.sql)).every((c) => c.params?.[0] === EMP && JSON.stringify(c.params?.[1]) === JSON.stringify([DA])), parcial.catalogos.depositos.map((d) => d.id)], [[EMP, U(88)], true, [DA]]);
  igual("R10-01 depósito fuera del alcance parcial o de otra empresa con lote → 403 y sin lectura de saldos", [((await informe(e10c, { lote: "L1", depositoId: DB })) as unknown as { status: number }).status, reg.consultas.some((c) => /stock_saldos/.test(c.sql))], [403, false]);

  // Exportaciones consistentes con el lote
  const tL1 = tablaStockGeneral(conL1);
  const xlL1 = leerHojaXlsx(generarXlsxTabla(tL1));
  const baseL1 = 1 + 1 + 1 + tL1.filtros.length + 1 + 1;
  const iCol = (t: typeof tL1, titulo: string) => t.columnas.findIndex((c) => c.titulo === titulo);
  const celdaL1 = (c: number, fila: number) => xlL1.get(`${String.fromCharCode(65 + c)}${fila}`);
  const filaM1 = conL1.filas.findIndex((f) => f.codigo === "M-1");

  igual("R10-01 XLSX real con lote L1: M-1 disponible 5 (no 100), situación «Normal», filtro de lote en el encabezado y total «n/a»; el resumen por unidad suma solo L1", [
    celdaL1(iCol(tL1, "Disponible"), baseL1 + 1 + filaM1), celdaL1(iCol(tL1, "Situación"), baseL1 + 1 + filaM1), tL1.filtros.includes("Lote: L1"), celdaL1(iCol(tL1, "Disponible"), baseL1 + 1 + conL1.filas.length), tL1.notas.some((n) => /Unidad \(3 producto\(s\)\): disponible 15 /.test(n)),
  ], [{ tipo: "n", valor: "5" }, { tipo: "s", valor: "Normal" }, true, { tipo: "s", valor: "n/a" }, true]);

  const pdfL1 = [...generarPdfTabla(tL1).toString("latin1").matchAll(/\(((?:[^()\\]|\\.)*)\) Tj/g)].map((m) => m[1].replace(/\\(.)/g, "$1"));

  cierto("R10-01 PDF con lote L1: contiene el filtro de lote, el disponible del lote y la situación; no contiene el total del producto (100) como cantidad de M-1", pdfL1.some((x) => /Lote: L1/.test(x)) && pdfL1.includes("Normal") && !pdfL1.includes("100"));

  // ═══ SG-T09 — regresiones y responsabilidades ═══
  const fuente = leer("lib/reportes/stock-general.ts");
  const planFuente = leer("lib/reportes/stock-general-plan.ts");

  cierto("SG-T09 informe cuantitativo: sin costos, valorización, precios, movimientos ni planificación; fuente única stock_saldos; sin float8; solo lectura", !/inventario_costos|precio|costo|valor_total|float8/i.test(fuente.replace(/\/\/.*$/gm, "").replace(/"[^"\n]*(costos|valorización|precios)[^"\n]*"/g, "")) && /FROM stock_saldos/.test(fuente) && !/(INSERT|UPDATE|DELETE)\s/i.test(fuente.replace(/\/\/.*$/gm, "")) && !/calcularPlanReposicion|movimientos_inventario/.test(fuente + planFuente));
  cierto("SG-T09 la regla de situación es la de Inventario > Stock (documentada y probada contra clasificarNivel); no hay política paralela de mínimo/máximo ni cambios en Reposición", /clasificarNivel/.test(planFuente) && !/stock-general/.test(leer("lib/reposicion/calculo.ts") + leer("lib/stock/vista.ts") + leer("lib/stock/shared.ts")));
  cierto("SG-T09 los otros informes conservan sus dependencias compartidas (depositosPermitidos y MAX_FILAS_EXPORTACION siguen exportados con la misma firma) y sus rutas", /export async function depositosPermitidos\(db: Db, empresaId: string, usuarioId: string\)/.test(fuente) && /export const MAX_FILAS_EXPORTACION = 50000/.test(fuente) && ["kardex", "lotes", "stock-critico", "valorizacion"].every((r) => /export async function GET/.test(leer(`app/api/reportes/${r}/route.ts`))));
  cierto("SG-T09 sin migraciones nuevas: la última del repositorio sigue siendo NEX-053", readdirSync(join(process.cwd(), "documentacao/banco/nexit/v1/migraciones")).filter((n) => /^NEX-\d+/.test(n)).sort().at(-1)?.match(/^NEX-05[3-8]/) != null);

  return fallos;
}
