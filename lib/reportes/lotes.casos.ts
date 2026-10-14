/**
 * Reportes — Lotes y vencimientos (AUD-LOT-R01, LOT-R01-01…09; matriz Lotes T01…T10). Sin PostgreSQL ni navegador: conexión simulada que EMULA la semántica de las lecturas
 * del informe (saldos por lote × depósito, clasificación por fecha, existencia por lote, totales por unidad), reglas puras, XLSX abiertos celda a celda, PDF y análisis del código.
 * El emulador modela la SEMÁNTICA de las consultas; NO prueba la serialización ni el planificador de PostgreSQL real (eso lo valida el responsable en el ambiente real).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { sumarDecimales } from "@/lib/inventario/decimal";
import { crearCompuerta } from "@/lib/productos/catalogos-carga";
import { pedirLotes } from "@/lib/reportes/cliente-lotes";
import { generarPdfTabla, generarXlsxTabla } from "@/lib/reportes/export";
import { columnasLotes, tablaLotes } from "@/lib/reportes/export-lotes";
import { leerHojaXlsx } from "@/lib/reportes/export-xlsx.casos";
import { leerLotes, parsearFiltrosLotes } from "@/lib/reportes/lotes";
import { filtrosLotesIguales, respuestaLotesValida, respuestaLotesVigente, validarFiltrosLotes, validarHorizonteTexto } from "@/lib/reportes/lotes-plan";
import type { LotesFiltros, LotesRespuesta, LotesRespuestaApi } from "@/types/reportes";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const EMP = U(1), USR = U(2), OTRA = U(3);
const DA = U(20), DB = U(21), DI = U(22);
const P1 = U(30), P2 = U(31), P3 = U(32), P4 = U(33);
const UK = "5a000000-0000-4000-8000-0000000000a1", UC = "5a000000-0000-4000-8000-0000000000b2", UM1 = "5a000000-0000-4000-8000-0000000000c3", UM2 = "5a000000-0000-4000-8000-0000000000d4";
const FILTROS: LotesFiltros = { vista: "LOTE", q: "", lote: "", depositoId: "", categoriaId: "", marcaId: "", familiaId: "", clase: "", existencia: "CON", horizonte: 30, vencDesde: "", vencHasta: "" };

type Dato = Record<string, unknown>;
type Prod = { id: string; codigo: string; descripcion?: string; unidad: string; unidadId: string; barras?: string; codigos?: Array<{ tipo: string; codigo: string; empresa?: string }> };
type Lote = { id: string; prod: string; codigo: string; venc: string | null };
type Saldo = { lote: string; dep: string; prop?: "PROPIO" | "TERCERO"; estado?: "DISPONIBLE" | "RESERVADO" | "CUARENTENA" | "TRANSITO"; cant: string };
type Escenario = {
  productos: Prod[]; lotes: Lote[]; saldos: Saldo[]; depositos: Array<{ id: string; nombre: string; activo: boolean }>; todos?: boolean; hoy?: string;
};
type Consulta = { sql: string; params?: unknown[] };

const suma = (l: string[]) => sumarDecimales(l);

export async function verificarCasosReportesLotes(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  const reg: { consultas: Consulta[]; conexiones: number; liberadas: number; poolQuery: number } = { consultas: [], conexiones: 0, liberadas: 0, poolQuery: 0 };
  const reiniciar = () => { reg.consultas = []; reg.conexiones = 0; reg.liberadas = 0; reg.poolQuery = 0; };
  let filtroActual: LotesFiltros = FILTROS;

  // ── Emulación de las lecturas: base (lote × depósito) → existencia por lote → fil → lot → totales por unidad
  const sinEscape = (p: unknown): string => String(p).replace(/^%|%$/g, "").replace(/\\([\\%_])/g, "$1").toLowerCase();
  const dias = (iso: string, hoy: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86400000);
  const clasificar = (venc: string | null, hoy: string, horizonte: number) => (venc === null ? "SIN_FECHA" : dias(venc, hoy) < 0 ? "VENCIDO" : dias(venc, hoy) <= horizonte ? "PROXIMO" : "VIGENTE");
  const ORDEN: Record<string, number> = { VENCIDO: 0, PROXIMO: 1, VIGENTE: 2, SIN_FECHA: 3 };

  type Base = { lote: Lote; prod: Prod; dep: string | null; depNombre: string; inactivo: boolean; d: string; r: string; c: string; fisico: string; td: string; tr: string; tc: string; tt: string; terceros: string; clase: string; dias: number | null };
  const construir = (e: Escenario, deps: string[], horizonte: number, huerfanos: boolean): Base[] => {
    const f = filtroActual;
    const hoy = e.hoy ?? "2026-10-13";
    const out: Base[] = [];
    const patron = f.q ? sinEscape(`%${f.q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`) : "";
    const patronL = f.lote ? sinEscape(`%${f.lote.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`) : "";

    for (const l of e.lotes) {
      const pr = e.productos.find((x) => x.id === l.prod)!;

      if (patron) {
        const campos = [pr.codigo, pr.descripcion ?? `Producto ${pr.codigo}`, pr.barras ?? ""].map((x) => x.toLowerCase());
        const alt = (pr.codigos ?? []).filter((c) => (c.empresa ?? EMP) === EMP && ["GTIN", "GTIN_EMPAQUE", "EAN", "UPC", "CODIGO_ALTERNO"].includes(c.tipo)).map((c) => c.codigo.toLowerCase());

        if (![...campos, ...alt].some((x) => x.includes(patron))) continue;
      }
      if (patronL && !l.codigo.toLowerCase().includes(patronL)) continue;
      if (f.vencDesde && !(l.venc !== null && l.venc >= f.vencDesde)) continue;
      if (f.vencHasta && !(l.venc !== null && l.venc <= f.vencHasta)) continue;

      const propios = e.saldos.filter((s) => s.lote === l.id);
      const porDep = deps.filter((d) => propios.some((s) => s.dep === d));
      const fila = (dep: string | null): Base => {
        const ss = propios.filter((s) => s.dep === dep);
        const q = (prop: string, est: string) => suma(ss.filter((s) => (s.prop ?? "PROPIO") === prop && (s.estado ?? "DISPONIBLE") === est).map((s) => s.cant));
        const d = q("PROPIO", "DISPONIBLE"), r = q("PROPIO", "RESERVADO"), c = q("PROPIO", "CUARENTENA");
        const td = q("TERCERO", "DISPONIBLE"), tr = q("TERCERO", "RESERVADO"), tc = q("TERCERO", "CUARENTENA"), tt = q("TERCERO", "TRANSITO");
        const dd = dep ? e.depositos.find((x) => x.id === dep) : undefined;

        return { lote: l, prod: pr, dep, depNombre: dd?.nombre ?? "", inactivo: dd ? !dd.activo : false, d, r, c, fisico: suma([d, r, c]), td, tr, tc, tt, terceros: suma([td, tr, tc, tt]), clase: clasificar(l.venc, hoy, horizonte), dias: l.venc === null ? null : dias(l.venc, hoy) };
      };

      for (const d of porDep) out.push(fila(d));
      if (porDep.length === 0 && huerfanos && propios.length === 0) out.push(fila(null));
    }

    return out;
  };
  const resolver = (e: Escenario, params: unknown[]) => {
    const f = filtroActual;
    const base = construir(e, params[1] as string[], params[2] as number, params[3] === true);
    const ex = new Map<string, string>();

    for (const b of base) ex.set(b.lote.id, suma([ex.get(b.lote.id) ?? "0", b.fisico, b.terceros]));

    const fil = base.filter((b) => (!f.clase || b.clase === f.clase) && (f.existencia !== "CON" || suma([b.fisico, b.terceros]) !== "0") && (f.existencia !== "SIN" || ex.get(b.lote.id) === "0"));
    const lots = new Map<string, Base[]>();

    for (const b of fil) lots.set(b.lote.id, [...(lots.get(b.lote.id) ?? []), b]);

    const lot = [...lots.values()].map((l) => ({
      lote: l[0].lote, prod: l[0].prod, clase: l[0].clase, dias: l[0].dias, depositos: l.filter((x) => x.dep !== null && suma([x.fisico, x.terceros]) !== "0").length,
      d: suma(l.map((x) => x.d)), r: suma(l.map((x) => x.r)), c: suma(l.map((x) => x.c)), fisico: suma(l.map((x) => x.fisico)),
      td: suma(l.map((x) => x.td)), tr: suma(l.map((x) => x.tr)), tc: suma(l.map((x) => x.tc)), tt: suma(l.map((x) => x.tt)), terceros: suma(l.map((x) => x.terceros)),
    }));

    return { base, fil, lot };
  };
  const ordenar = <T extends { lote: Lote; clase: string; prod: Prod; depNombre?: string }>(l: T[]): T[] =>
    [...l].sort((a, b) => ORDEN[a.clase] - ORDEN[b.clase] || (a.lote.venc ?? "9999").localeCompare(b.lote.venc ?? "9999") || a.prod.codigo.localeCompare(b.prod.codigo) || a.lote.codigo.localeCompare(b.lote.codigo) || (a.depNombre ?? "").localeCompare(b.depNombre ?? ""));

  const responder = (e: Escenario) => (sql: string, params: unknown[] = []): Dato[] => {
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return [];
    if (/FROM depositos d JOIN usuarios u/.test(sql)) return e.depositos;
    if (/FROM empresas/.test(sql)) return [{ nombre: "Empresa SA", moneda: "PYG" }];
    if (/AS t, to_char/.test(sql)) return [{ t: "13/10/2026 10:00", f: "20261013-1000", hoy: e.hoy ?? "2026-10-13" }];
    if (/SELECT alcance_depositos FROM usuarios/.test(sql)) return [{ alcance_depositos: e.todos === false ? "ASIGNADOS" : "TODOS" }];
    if (/FROM categorias_producto WHERE/.test(sql)) return [{ id: U(40), nombre: "Cat" }];
    if (/FROM marcas_producto WHERE/.test(sql)) return [{ id: U(50), nombre: "Marca" }];
    if (/FROM familias_producto WHERE/.test(sql)) return [{ id: U(60), nombre: "Fam" }];

    const { fil, lot } = resolver(e, params);
    const u = (p: Prod) => ({ unidad_id: p.unidadId, unidad: p.unidad });

    if (/FROM lot GROUP BY clase, unidad_id/.test(sql)) {
      const g = new Map<string, typeof lot>();

      for (const l of lot) g.set(`${l.clase}|${l.prod.unidadId}`, [...(g.get(`${l.clase}|${l.prod.unidadId}`) ?? []), l]);

      return [...g.values()].sort((a, b) => a[0].prod.unidad.localeCompare(b[0].prod.unidad) || a[0].prod.unidadId.localeCompare(b[0].prod.unidadId)).map((l) => ({ clase: l[0].clase, ...u(l[0].prod), lotes: l.length, fisico: suma(l.map((x) => x.fisico)), terceros: suma(l.map((x) => x.terceros)) }));
    }
    if (/FROM lot GROUP BY unidad_id/.test(sql)) {
      const g = new Map<string, typeof lot>();

      for (const l of lot) g.set(l.prod.unidadId, [...(g.get(l.prod.unidadId) ?? []), l]);

      return [...g.values()].sort((a, b) => a[0].prod.unidad.localeCompare(b[0].prod.unidad) || a[0].prod.unidadId.localeCompare(b[0].prod.unidadId)).map((l) => ({
        ...u(l[0].prod), lotes: l.length, disponible: suma(l.map((x) => x.d)), reservado: suma(l.map((x) => x.r)), cuarentena: suma(l.map((x) => x.c)), fisico: suma(l.map((x) => x.fisico)), terceros: suma(l.map((x) => x.terceros)),
        td: suma(l.map((x) => x.td)), tr: suma(l.map((x) => x.tr)), tc: suma(l.map((x) => x.tc)), tt: suma(l.map((x) => x.tt)),
      }));
    }
    if (/count\(\*\)::int AS filas FROM fil/.test(sql)) return [{ filas: fil.length }];

    const limite = params[params.length - 2] as number, desde = params[params.length - 1] as number;
    const comunes = (b: { lote: Lote; prod: Prod; clase: string; dias: number | null; d: string; r: string; c: string; fisico: string; terceros: string; td: string; tr: string; tc: string; tt: string }) => ({
      producto_id: b.prod.id, lote_id: b.lote.id, codigo: b.prod.codigo, descripcion: b.prod.descripcion ?? `Producto ${b.prod.codigo}`, categoria: "Cat", marca: "Marca", familia: "Fam", ...u(b.prod), lote: b.lote.codigo,
      clase: b.clase, dias: b.dias, venc: b.lote.venc ?? "", disponible: b.d, reservado: b.r, cuarentena: b.c, fisico: b.fisico, terceros: b.terceros, td: b.td, tr: b.tr, tc: b.tc, tt: b.tt,
    });

    if (/FROM lot f ORDER BY/.test(sql)) return ordenar(lot).slice(desde, desde + limite).map((l) => ({ ...comunes(l), depositos: l.depositos, deposito: "", deposito_inactivo: false }));
    if (/FROM fil f ORDER BY/.test(sql)) return ordenar(fil).slice(desde, desde + limite).map((b) => ({ ...comunes(b), depositos: b.dep ? 1 : 0, deposito: b.depNombre, deposito_inactivo: b.inactivo }));

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
  const informe = async (e: Escenario, f: Partial<LotesFiltros> = {}, o: { pagina?: number; tamano?: number; todas?: boolean; fallo?: (sql: string) => boolean } = {}) => {
    reiniciar();
    filtroActual = { ...FILTROS, ...f };

    return leerLotes(fakePool(e, o.fallo), EMP, USR, filtroActual, o.pagina ?? 1, o.tamano ?? 50, o.todas ?? false) as Promise<LotesRespuesta>;
  };

  const depos = [{ id: DA, nombre: "Central", activo: true }, { id: DB, nombre: "Norte", activo: true }, { id: DI, nombre: "Viejo", activo: false }];
  const tokensPdf = (b: Buffer): string[] => [...b.toString("latin1").matchAll(/\(((?:[^()\\]|\\.)*)\) Tj/g)].map((m) => m[1].replace(/\\(.)/g, "$1"));
  const truncado = (tk: string[]): string[] => tk.filter((x) => /^[-+\d.,]+[…\u0085]$/.test(x));
  const es = (v: string): string => {
    const [i, d = ""] = v.split(".");
    const ent = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const dd = d.replace(/0+$/, "");

    return dd ? `${ent},${dd}` : ent;
  };
  const xl = (tabla: ReturnType<typeof tablaLotes>) => {
    const h = leerHojaXlsx(generarXlsxTabla(tabla));
    const base = 1 + 1 + 1 + tabla.filtros.length + 1 + 1;
    const col = (t: string) => String.fromCharCode(65 + tabla.columnas.findIndex((c) => c.titulo === t));

    return { h, celda: (t: string, n: number) => h.get(`${col(t)}${base + n}`) };
  };

  // ═══ Lotes T01 — precisión decimal exacta (LOT-R01-01) y contrato de texto ═══
  const GRANDE = "12345678901234567890.1234";
  const prodKg = (id: string, codigo: string, extra: Partial<Prod> = {}): Prod => ({ id, codigo, unidad: "Kilo", unidadId: UK, ...extra });
  const e1: Escenario = {
    productos: [prodKg(P1, "A-1")], depositos: depos,
    lotes: [{ id: "l1", prod: P1, codigo: "L1", venc: "2026-10-20" }, { id: "l2", prod: P1, codigo: "L2", venc: "2026-10-01" }, { id: "l3", prod: P1, codigo: "L3", venc: null }],
    saldos: [
      { lote: "l1", dep: DA, cant: "0.1000" }, { lote: "l1", dep: DB, cant: "0.2000" }, { lote: "l1", dep: DA, prop: "TERCERO", estado: "TRANSITO", cant: "0.0001" },
      { lote: "l2", dep: DA, cant: GRANDE }, { lote: "l2", dep: DA, estado: "RESERVADO", cant: "0.0001" }, { lote: "l3", dep: DB, estado: "CUARENTENA", cant: "5" },
    ],
  };
  const r1 = await informe(e1);
  const f1 = (c: string) => r1.filas.find((x) => x.lote === c)!;

  igual("LOT-T01 cantidades exactas como TEXTO (0,1+0,2 = 0,3 sin 0,30000000000000004; 0,0001 conservado; entero de 20 dígitos intacto)", [f1("L1").disponible, f1("L1").tercerosEstados.transito, f1("L2").fisico, f1("L3").cuarentena], ["0.3", "0.0001", "12345678901234567890.1235", "5"]);
  igual("LOT-T01 totales por unidad exactos (sin Number): disponible 12345678901234567890.4 + …, físico y terceros", [r1.totales.porUnidad.map((u) => [u.unidad, u.lotes, u.disponible, u.fisico, u.terceros, u.tercerosPorEstado.transito])], [[["Kilo", 3, "12345678901234567890.4234", "12345678901234567895.4235", "0.0001", "0.0001"]]]);
  cierto("LOT-T01 ningún float8 / Number() / parseFloat sobre cantidades en el servicio, el plan, la exportación ni el cliente", ["lotes.ts", "lotes-plan.ts", "export-lotes.ts", "cliente-lotes.ts"].every((a) => !/float8|parseFloat|Number\(r\.(disp|res|cuar|fis|terc)/.test(leer(`lib/reportes/${a}`))) && !/::float8/.test(leer("lib/reportes/lotes.ts")));
  cierto("LOT-T01 el contrato de la API es válido (round-trip JSON) y se rechazan cantidades como número, no numéricas o campos ausentes", (() => {
    const ok = JSON.parse(JSON.stringify({ ...r1, permisos: { exportar: true } })) as Record<string, unknown>;
    const filas = ok.filas as Dato[];
    const mala = (cambio: Dato) => !respuestaLotesValida({ ...ok, filas: [{ ...filas[0], ...cambio }] });

    return respuestaLotesValida(ok) && mala({ disponible: 7 }) && mala({ fisico: "abc" }) && mala({ unidadId: undefined }) && mala({ tercerosEstados: { disponible: "1" } }) && !respuestaLotesValida({ ...ok, permisos: undefined }) && !respuestaLotesValida({ ...ok, totales: { ...(ok.totales as Dato), porUnidad: [{ unidadId: "x" }] } }) && !respuestaLotesValida(null) && !respuestaLotesValida([]);
  })());

  const t1 = tablaLotes(r1);
  const x1 = xl(t1);

  igual("LOT-T01 XLSX real: 0,3 numérico; la cantidad de 20 dígitos, su físico y el total como TEXTO exacto; unidad en cada fila y total", [
    x1.celda("Disponible", 1), x1.celda("Disponible", 2), x1.celda("Físico propio", 1), x1.celda("Unidad", 1), x1.celda("Disponible", 4),
  ], [{ tipo: "s", valor: "12345678901234567890.1234" }, { tipo: "n", valor: "0.3" }, { tipo: "s", valor: "12345678901234567890.1235" }, { tipo: "s", valor: "Kilo" }, { tipo: "s", valor: "12345678901234567890.4234" }]);

  const tk1 = tokensPdf(generarPdfTabla(t1));

  cierto("LOT-T01 PDF real: 0,3 · 0,0001 · 12.345.678.901.234.567.890,1235 COMPLETOS (sin «…»), totales y sin NaN", tk1.includes("0,3") && tk1.includes("0,0001") && tk1.includes(es("12345678901234567890.1235")) && truncado(tk1).length === 0 && !tk1.some((x) => /NaN|undefined/.test(x)));

  // ═══ Lotes T02 — clases de vencimiento, límites y horizonte ═══
  const e2: Escenario = {
    productos: [prodKg(P1, "A-1")], depositos: depos, hoy: "2026-10-13",
    lotes: [
      { id: "a", prod: P1, codigo: "HOY-1", venc: "2026-10-12" }, { id: "b", prod: P1, codigo: "HOY", venc: "2026-10-13" }, { id: "c", prod: P1, codigo: "H30", venc: "2026-11-12" },
      { id: "d", prod: P1, codigo: "H31", venc: "2026-11-13" }, { id: "e", prod: P1, codigo: "NULO", venc: null },
    ],
    saldos: ["a", "b", "c", "d", "e"].map((l) => ({ lote: l, dep: DA, cant: "1" })),
  };
  const r2 = await informe(e2);

  igual("LOT-T02 límites: ayer = Vencido; hoy = Próximo (el día del vencimiento no está vencido); hoy+30 = Próximo; hoy+31 = Vigente; sin fecha = Sin fecha (no vencido)", r2.filas.map((f) => [f.lote, f.clase, f.diasRestantes]), [["HOY-1", "VENCIDO", -1], ["HOY", "PROXIMO", 0], ["H30", "PROXIMO", 30], ["H31", "VIGENTE", 31], ["NULO", "SIN_FECHA", null]]);
  igual("LOT-T02 contadores por clase (aditivos) y horizonte 0: solo hoy es Próximo", [r2.totales.clases.map((c) => [c.clase, c.lotes]), (await informe(e2, { horizonte: 0 })).filas.filter((f) => f.clase === "PROXIMO").map((f) => f.lote)], [[["VENCIDO", 1], ["PROXIMO", 2], ["VIGENTE", 1], ["SIN_FECHA", 1]], ["HOY"]]);
  igual("LOT-T02 filtro por intervalo de vencimiento (desde/hasta inclusivos; los sin fecha quedan fuera) y por clase", [(await informe(e2, { vencDesde: "2026-10-13", vencHasta: "2026-11-12" })).filas.map((f) => f.lote), (await informe(e2, { clase: "VENCIDO" })).filas.map((f) => f.lote)], [["HOY", "H30"], ["HOY-1"]]);
  igual("LOT-T02 parser: horizonte 0–3650 entero; fuera de rango, decimal, negativo o texto → 400; fechas inválidas / invertidas → 400", [
    "horizonte=-1", "horizonte=3651", "horizonte=1.5", "horizonte=abc", "vencDesde=2026-02-30", "vencDesde=2026-10-05&vencHasta=2026-10-01", "clase=X", "existencia=Z", "vista=Q", "depositoId=zz",
  ].map((q) => "error" in parsearFiltrosLotes(new URLSearchParams(q))).concat(["horizonte=0", "horizonte=3650"].map((q) => "error" in parsearFiltrosLotes(new URLSearchParams(q)))), [true, true, true, true, true, true, true, true, true, true, false, false]);

  // ═══ Lotes T03 — snapshot, rollback, 413 y paginación (LOT-R01-02) ═══
  await informe(e1);
  igual("LOT-T03 UNA conexión (ninguna consulta por el pool), BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY primero, COMMIT al final y conexión liberada", [reg.conexiones, reg.poolQuery, reg.consultas[0].sql, reg.consultas.at(-1)?.sql, reg.liberadas], [1, 0, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "COMMIT", 1]);
  cierto("LOT-T03 alcance, empresa, hora, totales, clases, filas y catálogos salen de la MISMA transacción", ["depositos d JOIN usuarios", "FROM empresas", "now()", "FROM lot GROUP BY clase, unidad_id", "FROM lot GROUP BY unidad_id", "FROM lot f ORDER BY", "FROM categorias_producto", "FROM marcas_producto", "FROM familias_producto"].every((frag) => reg.consultas.slice(1, -1).some((c) => c.sql.includes(frag))));
  cierto("LOT-T03 el servicio usa conSnapshotLectura y depositosDelAlcance: sin Promise.all, sin consultas por el pool, sin depositosPermitidos", /conSnapshotLectura\(db/.test(leer("lib/reportes/lotes.ts")) && /depositosDelAlcance/.test(leer("lib/reportes/lotes.ts")) && !/Promise\.all|db\.query\(|depositosPermitidos/.test(leer("lib/reportes/lotes.ts")));

  let falla = "";
  try { await informe(e1, {}, { fallo: (s) => /FROM lot GROUP BY unidad_id/.test(s) }); } catch (x) { falla = (x as Error).message; }
  igual("LOT-T03 ante un error de lectura: ROLLBACK, se propaga el error, sin COMMIT y conexión liberada", [falla, reg.consultas.at(-1)?.sql, reg.consultas.some((c) => c.sql === "COMMIT"), reg.liberadas], ["fallo de consulta", "ROLLBACK", false, 1]);

  const fuera = (await informe(e1, { depositoId: U(99) })) as unknown as { status: number };

  igual("LOT-T03 depósito fuera del alcance (otra empresa / no asignado) → 403, sin leer lotes y con la transacción cerrada (COMMIT) y la conexión liberada", [fuera.status, reg.consultas.some((c) => /FROM stock_lotes/.test(c.sql)), reg.consultas.at(-1)?.sql, reg.liberadas], [403, false, "COMMIT", 1]);

  const muchos = (n: number): Escenario => ({
    productos: [prodKg(P1, "A-1")], depositos: depos,
    lotes: Array.from({ length: n }, (_, i) => ({ id: `l${i}`, prod: P1, codigo: `L${String(i).padStart(6, "0")}`, venc: "2026-12-01" })),
    saldos: Array.from({ length: n }, (_, i) => ({ lote: `l${i}`, dep: DA, cant: "1" })),
  });
  const r413 = (await informe(muchos(50001), {}, { todas: true })) as unknown as { status: number };

  igual("LOT-T03 más de 50.000 filas en la exportación → 413 (ejercitado con 50.001 lotes), pide LIMIT 50001 y cierra la transacción", [r413.status, reg.consultas.find((c) => /FROM lot f ORDER BY/.test(c.sql))?.params?.slice(-2), reg.consultas.at(-1)?.sql, reg.liberadas], [413, [50001, 0], "COMMIT", 1]);
  igual("LOT-T03 exactamente 50.000 SÍ se exportan; paginación: página 3 de 50 = filas 101–120 del filtro completo, con el total del filtro", [((await informe(muchos(50000), {}, { todas: true })) as LotesRespuesta).filas.length, (await informe(muchos(120), {}, { pagina: 3, tamano: 50 })).filas.length, reg.consultas.find((c) => /FROM lot f ORDER BY/.test(c.sql))?.params?.slice(-2), (await informe(muchos(120), {}, { pagina: 3, tamano: 50 })).pagina.totalFilas], [50000, 20, [50, 100], 120]);

  // ═══ Lotes T04 — aislamiento y lotes sin saldo (LOT-R01-03) ═══
  const eOrf: Escenario = {
    productos: [prodKg(P1, "A-1")], depositos: depos,
    lotes: [{ id: "con", prod: P1, codigo: "CON-SALDO", venc: "2026-12-01" }, { id: "orf", prod: P1, codigo: "HUERFANO", venc: "2026-12-01" }, { id: "otro", prod: P1, codigo: "SOLO-OTRO-DEP", venc: "2026-12-01" }],
    saldos: [{ lote: "con", dep: DA, cant: "3" }, { lote: "otro", dep: U(77), cant: "9" }],
  };
  const rTodos = await informe(eOrf, { existencia: "TODOS" });

  igual("LOT-T04 usuario con alcance TODOS ve el lote sin saldo registrado (una vez, sin depósito) y NO el lote cuyo saldo está solo en un depósito fuera de su alcance", [rTodos.filas.map((f) => f.lote), rTodos.huerfanos], [["CON-SALDO", "HUERFANO"], true]);

  const rAsig = await informe({ ...eOrf, todos: false }, { existencia: "TODOS" });

  igual("LOT-T04 usuario ASIGNADOS: los lotes huérfanos NO se listan (no pertenecen a un depósito de su alcance) y tampoco entran en totales", [rAsig.filas.map((f) => f.lote), rAsig.huerfanos, rAsig.totales.lotes], [["CON-SALDO"], false, 1]);
  igual("LOT-T04 con filtro de depósito nunca se listan huérfanos, ni siquiera con alcance TODOS", [(await informe(eOrf, { existencia: "TODOS", depositoId: DA })).filas.map((f) => f.lote), reg.consultas.find((c) => /FROM stock_lotes/.test(c.sql))?.params?.[3]], [["CON-SALDO"], false]);

  const sinDeps = await informe({ ...eOrf, depositos: [] }, { existencia: "TODOS" });

  igual("LOT-T04 usuario SIN depósitos autorizados: ninguna fila, ningún indicador ni catálogo, y no se lee un solo lote", [sinDeps.filas.length, sinDeps.totales.lotes, sinDeps.totales.porUnidad.length, sinDeps.totales.clases.every((c) => c.lotes === 0), sinDeps.huerfanos, sinDeps.catalogos.categorias.length, reg.consultas.some((c) => /FROM stock_lotes|FROM stock_saldos/.test(c.sql)), reg.consultas.some((c) => /SELECT alcance_depositos/.test(c.sql))], [0, 0, 0, true, false, 0, false, false]);
  cierto("LOT-T04 el SQL filtra lotes por la empresa de la SESIÓN ($1), restringe los saldos a los depósitos del alcance ($2) y solo admite huérfanos mediante el parámetro $4", (await informe(eOrf), (() => { const s = reg.consultas.find((c) => /FROM stock_lotes/.test(c.sql)); return !!s && s.params?.[0] === EMP && Array.isArray(s.params?.[1]) && /l\.empresa_id = \$1/.test(s.sql) && /s\.empresa_id = \$1 AND s\.lote_id IS NOT NULL AND s\.deposito_id = ANY\(\$2::uuid\[\]\)/.test(s.sql) && /\(\$4::boolean AND NOT EXISTS/.test(s.sql); })()));
  cierto("LOT-T04 permisos y respuestas HTTP: consultar exige REPORTES.VER, exportar VER+EXPORTAR en el servidor, permisos.exportar informado con hasPermission; 400 por filtros; 401/403/503 del guard común; 413 de la exportación", (() => {
    const g = leer("lib/reportes/guard.ts"), rl = leer("app/api/reportes/lotes/route.ts"), rx = leer("app/api/reportes/lotes/exportar/route.ts");

    return /autorizarReporte\(\["VER"\]\)/.test(rl) && /autorizarReporte\(\["VER", "EXPORTAR"\]\)/.test(rx) && /hasPermission\(acceso, "REPORTES", "EXPORTAR"\)/.test(rl) && /status: 400/.test(rl) && /status: 401/.test(g) && /status: 403/.test(g) && /status: 503/.test(g) && /r\.status/.test(rx);
  })());

  // ═══ Lotes T05 — depósitos inactivos (LOT-R01-04) ═══
  const eIna: Escenario = {
    productos: [prodKg(P1, "A-1")], depositos: depos,
    lotes: [{ id: "x", prod: P1, codigo: "X", venc: "2026-12-01" }],
    saldos: [{ lote: "x", dep: DI, cant: "4" }, { lote: "x", dep: DA, cant: "2" }],
  };
  const rIna = await informe(eIna, { vista: "DEPOSITO" });

  igual("LOT-T05 un depósito INACTIVO del alcance aparece rotulado en filas y catálogo; el saldo no desaparece del lote consolidado", [rIna.filas.map((f) => [f.deposito, f.depositoInactivo, f.fisico]), rIna.catalogos.depositos.map((d) => [d.nombre, d.activo]), (await informe(eIna)).filas[0].fisico], [[["Central", false, "2"], ["Viejo", true, "4"]], [["Central", true], ["Norte", true], ["Viejo", false]], "6"]);
  igual("LOT-T05 el alcance viene de usuarios/usuario_deposito con empresa y usuario de la SESIÓN (activos e inactivos), no del helper de solo activos", [reg.consultas.find((c) => /FROM depositos d JOIN usuarios u/.test(c.sql))?.params, /d\.activo\s+AND/.test(reg.consultas.find((c) => /FROM depositos d JOIN usuarios u/.test(c.sql))!.sql)], [[EMP, USR], false]);
  igual("LOT-T05 filtro por depósito inactivo permitido (no es 403) y el rótulo «(inactivo)» sale en Excel y PDF", [(await informe(eIna, { vista: "DEPOSITO", depositoId: DI })).filas.map((f) => f.deposito), (() => { const t = tablaLotes(rIna); return [xl(t).celda("Depósito", 2)?.valor, tokensPdf(generarPdfTabla(t)).includes("Viejo (inactivo)")]; })()], [["Viejo"], ["Viejo (inactivo)", true]]);

  // ═══ Lotes T06 — GTIN y códigos alternativos (LOT-R01-06) ═══
  const eG: Escenario = {
    productos: [
      prodKg(P1, "G-1", { barras: "7790000000001", codigos: [{ tipo: "EAN", codigo: "7891234567890" }, { tipo: "GTIN_EMPAQUE", codigo: "17891234567897" }, { tipo: "SKU_PROVEEDOR", codigo: "SKU-9" }] }),
      prodKg(P2, "G-2", { codigos: [{ tipo: "GTIN", codigo: "7895550000012", empresa: OTRA }, { tipo: "CODIGO_ALTERNO", codigo: "ALT%100" }] }),
    ],
    depositos: depos, lotes: [{ id: "g1", prod: P1, codigo: "L-G1", venc: "2026-12-01" }, { id: "g1b", prod: P1, codigo: "L-G1B", venc: "2026-12-01" }, { id: "g2", prod: P2, codigo: "L-G2", venc: "2026-12-01" }],
    saldos: [{ lote: "g1", dep: DA, cant: "1" }, { lote: "g1b", dep: DA, cant: "1" }, { lote: "g2", dep: DA, cant: "1" }],
  };
  const busca = async (q: string) => (await informe(eG, { q })).filas.map((f) => f.lote);

  igual("LOT-T06 la búsqueda encuentra el GTIN/EAN alternativo y el GTIN de empaque (producto con varios códigos: cada lote sale UNA sola vez, sin duplicados)", [await busca("78912345"), await busca("17891234567897"), (await informe(eG, { q: "7891234" })).totales.lotes], [["L-G1", "L-G1B"], ["L-G1", "L-G1B"], 2]);
  igual("LOT-T06 el código principal sigue funcionando; un tipo no aplicable (SKU de proveedor) y el código de OTRA empresa NO coinciden", [await busca("7790000000001"), await busca("SKU-9"), await busca("7895550000012")], [["L-G1", "L-G1B"], [], []]);
  igual("LOT-T06 comodines escapados: «%» y «_» se buscan literalmente (solo el código alterno «ALT%100» contiene «%»)", [await busca("%"), await busca("ALT%1"), await busca("_")], [["L-G2"], ["L-G2"], []]);
  cierto("LOT-T06 el SQL usa EXISTS parametrizado en producto_codigos por empresa y producto con los tipos GTIN/EAN/UPC/alternos y escape LIKE; sin JOIN que duplique lotes", (await informe(eG, { q: "x" }), (() => { const s = reg.consultas.find((c) => /FROM stock_lotes/.test(c.sql))!.sql; return /EXISTS \(SELECT 1 FROM producto_codigos pc WHERE pc\.empresa_id = pr\.empresa_id AND pc\.producto_id = pr\.id AND pc\.tipo IN \('GTIN','GTIN_EMPAQUE','EAN','UPC','CODIGO_ALTERNO'\) AND pc\.codigo ILIKE \$\d+\)/.test(s) && !/JOIN producto_codigos/.test(s); })()));

  // ═══ Lotes T07 — unidades de medida (LOT-R01-08) ═══
  const eU: Escenario = {
    productos: [prodKg(P1, "K-1"), { id: P2, codigo: "C-1", unidad: "Caja", unidadId: UC }, { id: P3, codigo: "M-1", unidad: "Metro", unidadId: UM1 }, { id: P4, codigo: "M-2", unidad: "Metro", unidadId: UM2 }],
    depositos: depos,
    lotes: [
      { id: "k", prod: P1, codigo: "LK", venc: "2026-10-01" }, { id: "c", prod: P2, codigo: "LC", venc: "2026-10-01" }, { id: "m1", prod: P3, codigo: "LM1", venc: "2026-12-01" }, { id: "m2", prod: P4, codigo: "LM2", venc: "2026-12-01" },
      { id: "k2", prod: P1, codigo: "LK2", venc: "2026-12-01" },
    ],
    saldos: [
      { lote: "k", dep: DA, cant: "10" }, { lote: "c", dep: DA, cant: "7" }, { lote: "m1", dep: DA, cant: "5" }, { lote: "m2", dep: DA, cant: "3" }, { lote: "m2", dep: DB, prop: "TERCERO", cant: "2" }, { lote: "m2", dep: DB, prop: "TERCERO", estado: "RESERVADO", cant: "1" },
      { lote: "k2", dep: DA, cant: "1" },
    ],
  };
  const rU = await informe(eU);
  const lab1 = `Metro [id ${UM1.slice(-8)}]`, lab2 = `Metro [id ${UM2.slice(-8)}]`;

  igual("LOT-T07 10 kg + 7 cajas NO suman 17: un grupo por unidad (UUID) con sus lotes, físico y terceros; nunca un total general de cantidades", [rU.totales.porUnidad.map((u) => [u.unidad, u.unidadId, u.lotes, u.fisico, u.terceros]), Object.keys(rU.totales).filter((k) => ["disponible", "fisico", "terceros", "reservado", "cuarentena"].includes(k))], [[["Caja", UC, 1, "7", "0"], ["Kilo", UK, 2, "11", "0"], ["Metro", UM1, 1, "5", "0"], ["Metro", UM2, 1, "3", "3"]], []]);
  igual("LOT-T07 dos unidades con el MISMO nombre y UUID distinto quedan separadas (Metro 5 y Metro 3, no 8) y con terceros por estado propios", [rU.totales.porUnidad.filter((u) => u.unidad === "Metro").map((u) => [u.fisico, u.tercerosPorEstado.disponible, u.tercerosPorEstado.reservado])], [[["5", "0", "0"], ["3", "2", "1"]]]);
  igual("LOT-T07 los lotes se cuentan globalmente (aditivo) y por clase: 5 lotes = 1+2+1+1; cada clase lista sus unidades", [rU.totales.lotes, rU.totales.clases.map((c) => [c.clase, c.lotes, c.unidades.map((u) => u.unidad)])], [5, [["VENCIDO", 2, ["Caja", "Kilo"]], ["PROXIMO", 0, []], ["VIGENTE", 3, ["Kilo", "Metro", "Metro"]], ["SIN_FECHA", 0, []]]]);
  cierto("LOT-T07 el SQL agrupa los totales por unidad_id (nunca por nombre, representación ni código SIFEN)", (() => { const s = reg.consultas.filter((c) => /FROM lot GROUP BY/.test(c.sql)).map((c) => c.sql).join(" "); return /GROUP BY clase, unidad_id/.test(s) && /GROUP BY unidad_id/.test(s) && !/GROUP BY unidad[,\s]/.test(s) && !/sifen/i.test(leer("lib/reportes/lotes.ts")); })());

  const tU = tablaLotes(rU);
  const xU = xl(tU);
  const unidadesTot = tU.totales.map((x) => String(x.celdas[tU.columnas.findIndex((c) => c.titulo === "Unidad")]));

  igual("LOT-T07 Excel: un bloque de totales por unidad, los dos «Metro» se distinguen con el final del identificador y las filas llevan el mismo rótulo; Kilo/Caja sin sufijo", [unidadesTot, [1, 2, 3, 4, 5].map((n) => xU.celda("Unidad", n)?.valor)], [["Caja", "Kilo", lab1, lab2], ["Caja", "Kilo", "Kilo", lab1, lab2]]);

  const tkU = tokensPdf(generarPdfTabla(tU));

  cierto("LOT-T07 PDF: totales por unidad (rótulos Caja, Kilo y los dos Metro con su identificador), sin total general y sin cifras recortadas", tkU.filter((x) => x === lab1).length >= 2 && tkU.filter((x) => x === lab2).length >= 2 && tkU.includes("Caja") && tkU.includes("Kilo") && truncado(tkU).length === 0 && tU.notas.some((n) => /no existe un total general/.test(n)));
  igual("LOT-T07 vista por depósito: las mismas filas por unidad y los totales no cambian (concilian con la vista por lote)", [(await informe(eU, { vista: "DEPOSITO" })).totales.porUnidad.map((u) => [u.unidad, u.lotes, u.fisico, u.terceros]), rU.totales.porUnidad.map((u) => [u.unidad, u.lotes, u.fisico, u.terceros])], [rU.totales.porUnidad.map((u) => [u.unidad, u.lotes, u.fisico, u.terceros]), rU.totales.porUnidad.map((u) => [u.unidad, u.lotes, u.fisico, u.terceros])]);

  // ═══ Lotes T08 — filtro Sin saldo (LOT-R01-09) ═══
  const eS: Escenario = {
    productos: [prodKg(P1, "S-1")], depositos: depos,
    lotes: [
      { id: "s1", prod: P1, codigo: "SIETE-A-CERO-B", venc: "2026-12-01" }, { id: "s2", prod: P1, codigo: "TODO-CERO", venc: "2026-12-01" }, { id: "s3", prod: P1, codigo: "SOLO-TERCEROS", venc: "2026-12-01" },
      { id: "s4", prod: P1, codigo: "SOLO-B", venc: "2026-12-01" }, { id: "s5", prod: P1, codigo: "ORFANO", venc: "2026-12-01" },
    ],
    saldos: [
      { lote: "s1", dep: DA, cant: "7" }, { lote: "s1", dep: DB, cant: "0" },
      { lote: "s2", dep: DA, cant: "0" }, { lote: "s2", dep: DB, cant: "0" },
      { lote: "s3", dep: DA, prop: "TERCERO", estado: "RESERVADO", cant: "2" }, { lote: "s3", dep: DB, cant: "0" },
      { lote: "s4", dep: DB, cant: "5" }, { lote: "s4", dep: DA, cant: "0" },
    ],
  };
  const sinV = await informe(eS, { existencia: "SIN" });
  const sinD = await informe(eS, { existencia: "SIN", vista: "DEPOSITO" });

  igual("LOT-T08 Sin saldo (lotes): solo los lotes con saldo TOTAL cero en los depósitos autorizados (todo cero y huérfano); el lote con 7 en A y 0 en B NO aparece como sin saldo", [sinV.filas.map((f) => f.lote), sinV.totales.lotes, sinV.alcanceExistencia], [["ORFANO", "TODO-CERO"], 2, { modo: "AUTORIZADOS", depositos: 3 }]);
  igual("LOT-T08 Sin saldo (por depósito): las filas cero de lotes sin saldo; jamás la fila cero de un lote que tiene saldo en otro depósito autorizado", [sinD.filas.map((f) => [f.lote, f.deposito]), sinD.totales.lotes, sinD.totales.filas], [[["ORFANO", ""], ["TODO-CERO", "Central"], ["TODO-CERO", "Norte"]], 2, 3]);
  igual("LOT-T08 Con saldo: el lote 7/0 aparece (con 1 depósito con saldo); terceros en estado reservado cuentan como saldo; el lote todo-cero no", [(await informe(eS, { existencia: "CON" })).filas.map((f) => [f.lote, f.depositos, f.fisico, f.terceros]), (await informe(eS, { existencia: "CON", vista: "DEPOSITO" })).filas.map((f) => [f.lote, f.deposito, f.fisico, f.terceros])], [[["SIETE-A-CERO-B", 1, "7", "0"], ["SOLO-B", 1, "5", "0"], ["SOLO-TERCEROS", 1, "0", "2"]], [["SIETE-A-CERO-B", "Central", "7", "0"], ["SOLO-B", "Norte", "5", "0"], ["SOLO-TERCEROS", "Central", "0", "2"]]]);
  igual("LOT-T08 con depósito explícito (Norte) la existencia refleja ESE depósito: el lote 7/0 es «sin saldo» en Norte y se rotula el alcance; el lote SOLO-B tiene saldo", [(await informe(eS, { existencia: "SIN", depositoId: DB })).filas.map((f) => f.lote), (await informe(eS, { existencia: "SIN", depositoId: DB })).alcanceExistencia, (await informe(eS, { existencia: "CON", depositoId: DB })).filas.map((f) => f.lote)], [["SIETE-A-CERO-B", "SOLO-TERCEROS", "TODO-CERO"], { modo: "DEPOSITO", depositos: 1 }, ["SOLO-B"]]);
  cierto("LOT-T08 las notas, filtros exportados y pantalla declaran la semántica de existencia y su alcance", (() => { const t = tablaLotes(sinV); return t.filtros.some((l) => /Existencia: Sin saldo \(saldo total del lote en los 3 depósitos autorizados\)/.test(l)) && t.notas.some((n) => /Una fila en cero de un depósito no vuelve «sin saldo»/.test(n)) && /textoAlcanceExistencia\(actual\)/.test(leer("app/(private)/reportes/lotes/page.tsx")); })());

  cierto("LOT-T08 estructura del SQL: la existencia SIN se evalúa sobre el saldo TOTAL del lote (CTE ex por lote, ex.saldo = 0) y nunca sobre la fila lote × depósito; CON sí filtra la fila", (await informe(eS, { existencia: "SIN" }), (() => { const q = reg.consultas.find((c) => c.sql.includes("FROM stock_lotes"))!.sql; return q.includes("ex AS (SELECT lote_id, sum(fisico + terceros) AS saldo FROM base GROUP BY lote_id)") && q.includes("JOIN ex ON ex.lote_id = b.lote_id WHERE ex.saldo = 0") && !q.includes("(b.fisico + b.terceros) = 0"); })()) && (await informe(eS, { existencia: "CON" }), reg.consultas.find((c) => c.sql.includes("FROM stock_lotes"))!.sql.includes("WHERE (b.fisico + b.terceros) > 0")));

  // ═══ Lotes T09 — PDF/Excel sin pérdida de dígitos con volumen (LOT-R01-01/08, varias páginas) ═══
  const NB = 70;
  const cants = Array.from({ length: NB }, (_, i) => `${"9".repeat(19)}${i % 10}.${String(1000 + i).slice(-4)}`);
  const eB: Escenario = {
    productos: [prodKg(P1, "B-1")], depositos: depos,
    lotes: cants.map((_, i) => ({ id: `b${i}`, prod: P1, codigo: `LOTE-${String(i).padStart(3, "0")}`, venc: "2027-01-01" })),
    saldos: cants.flatMap((c, i) => [{ lote: `b${i}`, dep: DA, cant: c }, { lote: `b${i}`, dep: DB, prop: "TERCERO" as const, cant: c }]),
  };
  const rB = await informe(eB, { vista: "DEPOSITO" }, { tamano: 200 });
  const totalB = rB.totales.porUnidad[0].fisico;
  const tB = tablaLotes(rB);
  const pdfB = generarPdfTabla(tB);
  const tkB = tokensPdf(pdfB);
  const aBig = (v: string): bigint => { const [i, d = ""] = v.split("."); return BigInt(i + d.padEnd(4, "0")); };
  const esperado = (() => { const s = cants.reduce((a, v) => a + aBig(v), BigInt(0)).toString().padStart(5, "0"); return `${s.slice(0, -4)}.${s.slice(-4)}`; })();

  igual("LOT-T09 la suma de 70 cantidades de 20 dígitos (físico) es exacta", [rB.filas.length, totalB], [NB * 2, esperado]);
  cierto("LOT-T09 PDF real (70 lotes × 2 depósitos, varias páginas): cada cantidad de 20+ dígitos, el total exacto y los totales aparecen COMPLETOS; nada recortado con «…»", cants.every((c) => tkB.includes(es(c))) && tkB.includes(es(totalB)) && truncado(tkB).length === 0 && (pdfB.toString("latin1").match(/\/Type \/Page /g) ?? []).length > 3 && tkB.some((x) => /^Bloque 1 de \d+: columnas /.test(x)));
  cierto("LOT-T09 las columnas ancla (código, producto, unidad, lote, depósito) se repiten en cada bloque del PDF", tkB.filter((x) => x === "LOTE-000").length >= Number((tkB.find((x) => /^Bloque 1 de \d+/.test(x)) ?? "").match(/de (\d+)/)?.[1] ?? 99) && tkB.filter((x) => x === "Kilo").length >= 2);
  igual("LOT-T09 XLSX del mismo libro: cantidad de 20 dígitos y total como TEXTO exacto (sin perder dígitos)", [xl(tB).celda("Físico propio", 1)?.valor, xl(tB).celda("Físico propio", NB * 2 + 1)?.tipo], [cants[0].replace(/0+$/, ""), "s"]);

  // ═══ Lotes T10 — cliente HTTP, permisos de pantalla, horizonte y regresiones (LOT-R01-05/07) ═══
  const ok = { ...r1, permisos: { exportar: true } } as LotesRespuestaApi;
  const buscar = (r: { status: number; cuerpo: unknown } | "red" | "texto") => async () => {
    if (r === "red") throw new Error("sin red");
    if (r === "texto") return new Response("<html>", { status: 200 });

    return new Response(JSON.stringify(r.cuerpo), { status: r.status });
  };

  igual("LOT-T10 la respuesta real del informe es válida para el cliente (round-trip JSON) y entrega los datos", [(await pedirLotes(FILTROS, 1, buscar({ status: 200, cuerpo: ok }))).error, (await pedirLotes(FILTROS, 1, buscar({ status: 200, cuerpo: ok }))).datos?.permisos], ["", { exportar: true }]);

  const dañadas: Array<[string, unknown]> = [["objeto vacío", {}], ["sin totales", { ...ok, totales: undefined }], ["cantidad como número", { ...ok, filas: [{ ...ok.filas[0], fisico: 10 }] }], ["sin permisos", { ...ok, permisos: undefined }], ["array", []], ["null", null]];

  for (const [n, cuerpo] of dañadas) igual(`LOT-T10 HTTP 200 inválido (${n}) → sin datos y con error`, (await pedirLotes(FILTROS, 1, buscar({ status: 200, cuerpo }))).datos === null && (await pedirLotes(FILTROS, 1, buscar({ status: 200, cuerpo }))).error, "La respuesta del reporte no tiene el formato esperado.");
  for (const status of [401, 403, 413, 500, 503]) igual(`LOT-T10 HTTP ${status} → sin datos y con el mensaje del servidor`, await pedirLotes(FILTROS, 1, buscar({ status, cuerpo: { error: "Fallo." } })), { datos: null, error: `Fallo. (código ${status})` });
  igual("LOT-T10 red caída y JSON inválido → sin datos y reintento posible con los mismos filtros", [(await pedirLotes(FILTROS, 1, buscar("red"))).datos, (await pedirLotes(FILTROS, 1, buscar("texto"))).datos, (await pedirLotes(FILTROS, 1, buscar({ status: 200, cuerpo: ok }))).datos !== null], [null, null, true]);

  let pedidos = 0;
  const contar = async () => { pedidos += 1; return new Response("{}", { status: 200 }); };

  igual("LOT-T10 horizonte/intervalo inválidos: error claro y NINGUNA petición (sin consulta divergente)", [
    (await pedirLotes({ ...FILTROS, horizonte: 4000 }, 1, contar)).error, (await pedirLotes({ ...FILTROS, vencDesde: "2026-10-05", vencHasta: "2026-10-01" }, 1, contar)).error, (await pedirLotes({ ...FILTROS, vencDesde: "2026-02-30" }, 1, contar)).error, pedidos,
  ], ["Horizonte no válido (0 a 3650 días).", "El intervalo de vencimiento es inválido: la fecha inicial es posterior a la final.", "Fecha de vencimiento no válida.", 0]);
  igual("LOT-T10 texto del horizonte: 0–3650 entero; vacío, decimal, negativo o >3650 → error de campo", ["0", "30", "3650", " 15 ", "", "3651", "-1", "1.5", "abc"].map((x) => validarHorizonteTexto(x).valor), [0, 30, 3650, 15, null, null, null, null, null]);
  igual("LOT-T10 el error del campo horizonte es explícito", validarHorizonteTexto("9999").error, "Horizonte no válido: ingrese un número entero de 0 a 3650 días.");

  const reordenado = JSON.parse(JSON.stringify({ vencHasta: "", vencDesde: "", horizonte: 30, existencia: "CON", clase: "", familiaId: "", marcaId: "", categoriaId: "", depositoId: "", lote: "", q: "", vista: "LOTE" })) as LotesFiltros;

  igual("LOT-T10 igualdad de filtros por campo (el orden de propiedades JSON no importa) y vigencia por filtros/página/error", [
    filtrosLotesIguales(reordenado, FILTROS), respuestaLotesVigente({ filtros: reordenado, pagina: { numero: 1 } }, "", FILTROS, 1), respuestaLotesVigente({ filtros: reordenado, pagina: { numero: 1 } }, "", { ...FILTROS, horizonte: 31 }, 1),
    respuestaLotesVigente({ filtros: reordenado, pagina: { numero: 1 } }, "", FILTROS, 2), respuestaLotesVigente({ filtros: reordenado, pagina: { numero: 1 } }, "falló", FILTROS, 1), respuestaLotesVigente(null, "", FILTROS, 1), validarFiltrosLotes(FILTROS),
  ], [true, true, false, false, false, false, ""]);

  const compuerta = crearCompuerta();
  const mostrada = { f: "" };
  let liberar: () => void = () => {};
  const lenta = new Promise<void>((res) => { liberar = res; });
  const s1 = compuerta.nueva();
  const p1 = pedirLotes({ ...FILTROS, q: "lenta" }, 1, async () => { await lenta; return new Response(JSON.stringify({ ...ok, filtros: { ...FILTROS, q: "lenta" } }), { status: 200 }); }).then((r) => { if (compuerta.vigente(s1)) mostrada.f = r.datos?.filtros.q ?? "error"; });
  const s2 = compuerta.nueva();
  const r2x = await pedirLotes({ ...FILTROS, q: "rapida" }, 1, async () => new Response(JSON.stringify({ ...ok, filtros: { ...FILTROS, q: "rapida" } }), { status: 200 }));

  if (compuerta.vigente(s2)) mostrada.f = r2x.datos?.filtros.q ?? "error";
  liberar();
  await p1;
  igual("LOT-T10 filtros rápidos: una respuesta lenta anterior NO pisa a la última solicitud", mostrada.f, "rapida");

  const pagina = leer("app/(private)/reportes/lotes/page.tsx");

  cierto("LOT-T10 pantalla: compuerta de última solicitud, datos descartados en error, solo respuesta vigente visible, «Reintentar», exportación solo con permisos.exportar y filtros de la respuesta vigente, sin JSON.stringify ni .catch que conserve datos", /pedirLotes\(aplicados, pagina\)/.test(pagina) && /crearCompuerta\(\)/.test(pagina) && /setDatos\(r\.datos\)/.test(pagina) && /respuestaLotesVigente\(datos, error, aplicados, pagina\)/.test(pagina) && /Reintentar/.test(pagina) && /actual\?\.permisos\.exportar === true/.test(pagina) && /\{puedeExportar \? \(/.test(pagina) && /descargarLotes\(actual\.filtros, formato\)/.test(pagina) && !/JSON\.stringify/.test(pagina) && !/\.catch\(\(e: unknown\)/.test(pagina));
  cierto("LOT-T10 pantalla: horizonte inválido se informa en el campo y el informe se oculta (nunca datos de otro horizonte); nada de cantidades como Number ni sumas en la pantalla; todo sale de «actual»", /validarHorizonteTexto\(horizonteTxt\)/.test(pagina) && /!hz\.error && datos/.test(pagina) && !/\.reduce\(/.test(pagina) && !/Number\(/.test(pagina) && !/\bdatos\??\.(filas|totales|cobertura)/.test(pagina) && /etiquetasUnidad\(actual\?\.totales\.porUnidad/.test(pagina));
  cierto("LOT-T10 la suite de Lotes está registrada en el runner oficial y el servicio es de solo lectura (sin INSERT/UPDATE/DELETE ni motor de Movimientos)", /reportes\/lotes\.casos/.test(leer("scripts/casos-clientes/run.js")) && /verificarCasosReportesLotes/.test(leer("scripts/casos-clientes/run.js")) && !/\b(INSERT|UPDATE|DELETE)\b/.test(leer("lib/reportes/lotes.ts")) && !/inventario_registrar|inventario_anular|inventario_costos/.test(leer("lib/reportes/lotes.ts")));
  cierto("LOT-T10 independencia: Stock general, Valorización, Kardex y Stock crítico no importan el informe de Lotes; Lotes no importa el servicio del Kardex (solo el helper puro de rótulos)", ["stock-general", "valorizacion", "kardex", "stock-critico"].every((m) => !/reportes\/(lotes|export-lotes|lotes-plan)"/.test(leer(`lib/reportes/${m}.ts`))) && !/from "@\/lib\/reportes\/kardex"/.test(leer("lib/reportes/lotes.ts") + leer("lib/reportes/export-lotes.ts")));
  cierto("LOT-T10 columnas de Excel de las dos vistas (compatibilidad con el exportador común)", columnasLotes("LOTE").some((c) => c.titulo === "Depósitos") && columnasLotes("DEPOSITO").some((c) => c.titulo === "Depósito") && columnasLotes("LOTE").some((c) => c.titulo === "Unidad"));

  return fallos;
}
