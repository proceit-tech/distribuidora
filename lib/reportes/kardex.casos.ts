/**
 * Reportes — Kardex de movimientos (AUD-KDX-R01, RPT-KDX-01…09; matriz KDX-T01…KDX-T10). Sin PostgreSQL ni navegador: conexión simulada que EMULA el libro de movimientos
 * (efectos por depósito, saldo acumulado en orden de registro, totales por grupo, conciliación con Stock), reglas puras, XLSX abiertos celda a celda, PDF y análisis del código.
 * El emulador modela la SEMÁNTICA de las lecturas del informe; NO prueba la serialización ni el planificador de PostgreSQL real (eso lo valida el responsable en el ambiente real).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { sumarDecimales } from "@/lib/inventario/decimal";
import { crearCompuerta } from "@/lib/productos/catalogos-carga";
import { pedirKardex } from "@/lib/reportes/cliente-kardex";
import { generarPdfTabla, generarXlsxTabla } from "@/lib/reportes/export";
import { COLUMNAS_KARDEX, columnasResumen, tablaKardex } from "@/lib/reportes/export-kardex";
import { leerHojaXlsx } from "@/lib/reportes/export-xlsx.casos";
import { leerKardex, parsearFiltrosKardex } from "@/lib/reportes/kardex";
import { filtrosKardexIguales, negarDecimal, respuestaKardexValida, respuestaKardexVigente } from "@/lib/reportes/kardex-plan";
import type { KardexFiltros, KardexRespuesta, KardexRespuestaApi } from "@/types/reportes";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const EMP = U(1), USR = U(2), OTRO = U(3);
const DA = U(20), DB = U(21), DI = U(22);
const PA = U(30), PB = U(31), PC = U(32), PD = U(33);
const OX = U(70), OY = U(71);
const FILTROS: KardexFiltros = { vista: "DETALLE", q: "", depositoId: "", tipo: "", usuarioId: "", documento: "", estado: "", estadoStock: "", lote: "", desde: "", hasta: "" };

type Dato = Record<string, unknown>;
type Linea = {
  num: string; tipo: string; origen?: string; estado?: string; freg: string; hreg?: string; fmov?: string; doc?: string; usr?: string; prod: string; cant: string;
  lote?: string; prop?: "PROPIO" | "TERCERO"; propietario?: string | null; o?: string; d?: string; cu?: string | null; ct?: string | null; mon?: string; anulaA?: string;
};
type Stock = { prod: string; dep: string; lote?: string; prop?: "PROPIO" | "TERCERO"; propietario?: string | null; d?: string; r?: string; c?: string };
type Escenario = {
  productos: Array<{ id: string; codigo: string; unidad: string }>;
  lineas: Linea[];
  depositos: Array<{ id: string; nombre: string; activo: boolean }>;
  stock?: Stock[];
};
type Consulta = { sql: string; params?: unknown[] };
type Sal = {
  l: Linea; idx: number; dep: string; contra: string | null; lado: number; efecto: "ENTRADA" | "SALIDA" | "ESTADO";
  dd: string; dr: string; dc: string; s_disp: string; s_res: string; s_cuar: string; reg: string; unidad: string; pcodigo: string; lote: string; propiedad: "PROPIO" | "TERCERO"; propietario: string | null; fis: string;
};

const cero = (v: string) => sumarDecimales([v]) === "0";
const pos = (v: string) => !v.startsWith("-") && !cero(v);
const neg = (v: string) => v.startsWith("-") && !cero(v);
const suma = (l: string[]) => sumarDecimales(l);

export async function verificarCasosReportesKardex(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  const reg: { consultas: Consulta[]; conexiones: number; liberadas: number; poolQuery: number } = { consultas: [], conexiones: 0, liberadas: 0, poolQuery: 0 };
  const reiniciar = () => { reg.consultas = []; reg.conexiones = 0; reg.liberadas = 0; reg.poolQuery = 0; };
  let filtroActual: KardexFiltros = FILTROS;

  // ── Emulación del libro: efectos por depósito, saldo acumulado (orden de registro) y lecturas agregadas.
  const efectos = (e: Escenario, deps: string[]): Sal[] => {
    const f = filtroActual;
    const prod = (id: string) => e.productos.find((p) => p.id === id)!;
    const todos: Sal[] = [];

    e.lineas.forEach((l, idx) => {
      const mk = (dep: string, contra: string | null, lado: number, efecto: Sal["efecto"], dd: string, dr: string, dc: string) => {
        const p = prod(l.prod);

        todos.push({ l, idx, dep, contra, lado, efecto, dd, dr, dc, s_disp: "0", s_res: "0", s_cuar: "0", reg: l.freg, unidad: p.unidad, pcodigo: p.codigo, lote: l.lote ?? "", propiedad: l.prop ?? "PROPIO", propietario: l.propietario ?? null, fis: suma([dd, dr, dc]) });
      };

      if (["ENTRADA", "AJUSTE_POSITIVO", "TRANSFERENCIA"].includes(l.tipo)) mk(l.d!, l.o ?? null, 1, "ENTRADA", l.cant, "0", "0");
      if (["SALIDA", "AJUSTE_NEGATIVO", "TRANSFERENCIA"].includes(l.tipo)) mk(l.o!, l.d ?? null, 0, "SALIDA", negarDecimal(l.cant), "0", "0");
      if (["RESERVA", "LIBERACION_RESERVA", "CUARENTENA", "LIBERACION_CUARENTENA"].includes(l.tipo)) {
        const dd = l.tipo === "RESERVA" || l.tipo === "CUARENTENA" ? negarDecimal(l.cant) : l.cant;
        const dr = l.tipo === "RESERVA" ? l.cant : l.tipo === "LIBERACION_RESERVA" ? negarDecimal(l.cant) : "0";
        const dc = l.tipo === "CUARENTENA" ? l.cant : l.tipo === "LIBERACION_CUARENTENA" ? negarDecimal(l.cant) : "0";

        mk(l.o!, null, 2, "ESTADO", dd, dr, dc);
      }
    });

    const patronQ = f.q.toLowerCase(), patronL = f.lote.toLowerCase();
    const filtradas = todos
      .filter((s) => deps.includes(s.dep) && (!patronQ || s.pcodigo.toLowerCase().includes(patronQ)) && (!patronL || s.lote.toLowerCase().includes(patronL)))
      .sort((a, b) => a.l.num.localeCompare(b.l.num) || a.idx - b.idx || a.lado - b.lado);
    const acum = new Map<string, [string, string, string]>();

    for (const s of filtradas) {
      const k = [s.l.prod, s.dep, s.lote, s.propiedad, s.propietario ?? ""].join("|");
      const [d, r, c] = acum.get(k) ?? ["0", "0", "0"];
      const n: [string, string, string] = [suma([d, s.dd]), suma([r, s.dr]), suma([c, s.dc])];

      acum.set(k, n);
      s.s_disp = n[0]; s.s_res = n[1]; s.s_cuar = n[2];
    }

    return filtradas;
  };
  const enPer = (s: Sal) => (!filtroActual.desde || s.reg >= filtroActual.desde) && (!filtroActual.hasta || s.reg <= filtroActual.hasta);
  const pasa = (s: Sal) => {
    const f = filtroActual;
    const doc = f.documento.toLowerCase();

    return (!f.tipo || s.l.tipo === f.tipo) && (!f.usuarioId || s.l.usr === f.usuarioId) && (!doc || (s.l.doc ?? "").toLowerCase().includes(doc) || s.l.num.toLowerCase().includes(doc)) &&
      (!f.estado || (s.l.estado ?? "REGISTRADO") === f.estado) && (!f.estadoStock || (f.estadoStock === "DISPONIBLE" ? !cero(s.dd) : f.estadoStock === "RESERVADO" ? !cero(s.dr) : !cero(s.dc)));
  };
  const sel = (s: Sal) => enPer(s) && pasa(s);
  const fuera = (s: Sal) => enPer(s) && !pasa(s);
  const claveG = (s: Sal) => `${s.unidad}|${s.propiedad}|${s.propietario ?? ""}`;
  const ordenarG = (a: string, b: string) => a.localeCompare(b);

  const movs = (rows: Sal[], px: string, cond: (s: Sal) => boolean): Dato => {
    const r = rows.filter(cond);
    const noT = r.filter((s) => s.l.tipo !== "TRANSFERENCIA");
    const t = r.filter((s) => s.l.tipo === "TRANSFERENCIA");

    return {
      [`${px}_ent`]: suma(noT.filter((s) => pos(s.fis)).map((s) => s.fis)),
      [`${px}_sal`]: negarDecimal(suma(noT.filter((s) => neg(s.fis)).map((s) => s.fis))),
      [`${px}_tent`]: suma(t.filter((s) => pos(s.dd)).map((s) => s.dd)),
      [`${px}_tsal`]: negarDecimal(suma(t.filter((s) => neg(s.dd)).map((s) => s.dd))),
      [`${px}_cam`]: r.filter((s) => s.efecto === "ESTADO").length,
      [`${px}_anu`]: new Set(r.filter((s) => (s.l.origen ?? "MANUAL") === "ANULACION").map((s) => s.l.num)).size,
    };
  };

  type G = { prod: string; dep: string; lote: string; prop: "PROPIO" | "TERCERO"; propietario: string | null; unidad: string; pcodigo: string; inicial: string; entradas: string; salidas: string; t_ent: string; t_sal: string; fuera: string; f_disp: string; f_res: string; f_cuar: string; en: number };
  const grupos = (rows: Sal[]): G[] => {
    const m = new Map<string, Sal[]>();

    for (const s of rows) m.set([s.l.prod, s.dep, s.lote, s.propiedad, s.propietario ?? ""].join("|"), [...(m.get([s.l.prod, s.dep, s.lote, s.propiedad, s.propietario ?? ""].join("|")) ?? []), s]);

    const f = filtroActual;
    const fin = (s: Sal) => !f.hasta || s.reg <= f.hasta;

    return [...m.values()].map((l) => {
      const noT = l.filter((s) => sel(s) && s.l.tipo !== "TRANSFERENCIA"), t = l.filter((s) => sel(s) && s.l.tipo === "TRANSFERENCIA");

      return {
        prod: l[0].l.prod, dep: l[0].dep, lote: l[0].lote, prop: l[0].propiedad, propietario: l[0].propietario, unidad: l[0].unidad, pcodigo: l[0].pcodigo,
        inicial: f.desde ? suma(l.filter((s) => s.reg < f.desde).map((s) => s.fis)) : "0",
        entradas: suma(noT.filter((s) => pos(s.fis)).map((s) => s.fis)), salidas: negarDecimal(suma(noT.filter((s) => neg(s.fis)).map((s) => s.fis))),
        t_ent: suma(t.filter((s) => pos(s.dd)).map((s) => s.dd)), t_sal: negarDecimal(suma(t.filter((s) => neg(s.dd)).map((s) => s.dd))),
        fuera: suma(l.filter(fuera).map((s) => s.fis)),
        f_disp: suma(l.filter(fin).map((s) => s.dd)), f_res: suma(l.filter(fin).map((s) => s.dr)), f_cuar: suma(l.filter(fin).map((s) => s.dc)),
        en: l.filter(sel).length,
      };
    });
  };
  const filasDeFila = () => !!(filtroActual.tipo || filtroActual.usuarioId || filtroActual.documento || filtroActual.estado || filtroActual.estadoStock);

  const responder = (e: Escenario) => (sql: string, params: unknown[] = []): Dato[] => {
    const deps = (params[1] as string[] | undefined) ?? [];
    const accesibles = (params[2] as string[] | undefined) ?? [];

    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return [];
    if (/FROM depositos d JOIN usuarios u/.test(sql)) return e.depositos;
    if (/FROM empresas/.test(sql)) return [{ nombre: "Empresa SA", moneda: "PYG" }];
    if (/AS t, to_char/.test(sql)) return [{ t: "13/10/2026 10:00", f: "20261013-1000" }];
    if (/FROM usuarios u\s+WHERE u\.empresa_id/.test(sql)) return [{ id: USR, nombre: "ana" }];

    if (/FULL JOIN st s/.test(sql)) {
      const sal = efectos(e, deps);
      const hist = new Map<string, [string, string, string]>();

      for (const s of sal) {
        const k = [s.l.prod, s.dep, s.lote, s.propiedad, s.propietario ?? ""].join("|");
        const v = hist.get(k) ?? ["0", "0", "0"];

        hist.set(k, [suma([v[0], s.dd]), suma([v[1], s.dr]), suma([v[2], s.dc])]);
      }

      const st = new Map<string, [string, string, string]>();
      const fuente: Stock[] = e.stock ?? [...hist.entries()].map(([k, v]) => { const [prod, dep, lote, prop, propietario] = k.split("|"); return { prod, dep, lote, prop: prop as "PROPIO" | "TERCERO", propietario: propietario || null, d: v[0], r: v[1], c: v[2] }; });
      const patronQ = filtroActual.q.toLowerCase(), patronL = filtroActual.lote.toLowerCase();

      for (const s of fuente) {
        const p = e.productos.find((x) => x.id === s.prod)!;

        if (!deps.includes(s.dep) || (patronQ && !p.codigo.toLowerCase().includes(patronQ)) || (patronL && !(s.lote ?? "").toLowerCase().includes(patronL))) continue;
        st.set([s.prod, s.dep, s.lote ?? "", s.prop ?? "PROPIO", s.propietario ?? ""].join("|"), [s.d ?? "0", s.r ?? "0", s.c ?? "0"]);
      }

      const claves = new Set([...hist.keys(), ...st.keys()]);
      let divergentes = 0;

      for (const k of claves) {
        const h = hist.get(k) ?? ["0", "0", "0"], s = st.get(k) ?? ["0", "0", "0"];

        if (suma([h[0], negarDecimal(s[0])]) !== "0" || suma([h[1], negarDecimal(s[1])]) !== "0" || suma([h[2], negarDecimal(s[2])]) !== "0") divergentes += 1;
      }

      return [{ n: claves.size, divergentes }];
    }
    if (/FROM sal GROUP BY unidad, propiedad, propietario_id ORDER BY unidad/.test(sql)) {
      const sal = efectos(e, deps);
      const porG = new Map<string, Sal[]>();

      for (const s of sal) porG.set(claveG(s), [...(porG.get(claveG(s)) ?? []), s]);

      return [...porG.keys()].sort(ordenarG).map((k) => {
        const l = porG.get(k)!;
        const f = filtroActual;
        const fin = (s: Sal) => !f.hasta || s.reg <= f.hasta;

        return {
          unidad: l[0].unidad, propiedad: l[0].propiedad, propietario_id: l[0].propietario, filas: l.filter(sel).length,
          i_disp: f.desde ? suma(l.filter((s) => s.reg < f.desde).map((s) => s.dd)) : "0", i_res: f.desde ? suma(l.filter((s) => s.reg < f.desde).map((s) => s.dr)) : "0", i_cuar: f.desde ? suma(l.filter((s) => s.reg < f.desde).map((s) => s.dc)) : "0",
          f_disp: suma(l.filter(fin).map((s) => s.dd)), f_res: suma(l.filter(fin).map((s) => s.dr)), f_cuar: suma(l.filter(fin).map((s) => s.dc)),
          ...movs(l, "f", sel), ...movs(l, "o", fuera), ...movs(l, "c", enPer),
        };
      });
    }
    if (/FROM gf GROUP BY unidad/.test(sql)) {
      const gf = grupos(efectos(e, deps)).filter((g) => g.en > 0 || (!filasDeFila() && !cero(g.inicial)));
      const porG = new Map<string, G[]>();

      for (const g of gf) porG.set(`${g.unidad}|${g.prop}|${g.propietario ?? ""}`, [...(porG.get(`${g.unidad}|${g.prop}|${g.propietario ?? ""}`) ?? []), g]);

      return [...porG.values()].map((l) => ({
        unidad: l[0].unidad, propiedad: l[0].prop, propietario_id: l[0].propietario, n: l.length, inicial: suma(l.map((g) => g.inicial)), entradas: suma(l.map((g) => g.entradas)), salidas: suma(l.map((g) => g.salidas)),
        t_ent: suma(l.map((g) => g.t_ent)), t_sal: suma(l.map((g) => g.t_sal)), fuera: suma(l.map((g) => g.fuera)), final: suma(l.flatMap((g) => [g.f_disp, g.f_res, g.f_cuar])),
        f_disp: suma(l.map((g) => g.f_disp)), f_res: suma(l.map((g) => g.f_res)), f_cuar: suma(l.map((g) => g.f_cuar)),
      }));
    }
    if (/FROM gf JOIN depositos d/.test(sql)) {
      const limite = params[params.length - 2] as number, desde = params[params.length - 1] as number;
      const gf = grupos(efectos(e, deps)).filter((g) => g.en > 0 || (!filasDeFila() && !cero(g.inicial)))
        .sort((a, b) => a.pcodigo.localeCompare(b.pcodigo) || e.depositos.find((d) => d.id === a.dep)!.nombre.localeCompare(e.depositos.find((d) => d.id === b.dep)!.nombre) || a.lote.localeCompare(b.lote) || a.prop.localeCompare(b.prop) || (a.propietario ?? "").localeCompare(b.propietario ?? ""));

      return gf.slice(desde, desde + limite).map((g) => ({
        clave: `${g.prod}:${g.dep}:${g.lote}:${g.prop}:${g.propietario ?? ""}`, pcodigo: g.pcodigo, pdesc: `Producto ${g.pcodigo}`, unidad: g.unidad, deposito: e.depositos.find((d) => d.id === g.dep)!.nombre, inactivo: !e.depositos.find((d) => d.id === g.dep)!.activo,
        lote: g.lote, propiedad: g.prop, propietario_id: g.propietario, inicial: g.inicial, entradas: g.entradas, salidas: g.salidas, t_ent: g.t_ent, t_sal: g.t_sal, fuera: g.fuera,
        final: suma([g.f_disp, g.f_res, g.f_cuar]), f_disp: g.f_disp, f_res: g.f_res, f_cuar: g.f_cuar,
      }));
    }
    if (/FROM pg s/.test(sql)) {
      const limite = params[params.length - 2] as number, desde = params[params.length - 1] as number;
      const filas = efectos(e, deps).filter(sel);
      const dep = (id: string) => e.depositos.find((d) => d.id === id);
      const porAnula = new Map(e.lineas.filter((x) => x.anulaA).map((x) => [x.anulaA!, x.num]));

      return filas.slice(desde, desde + limite).map((s) => {
        const costo = s.propiedad === "PROPIO" && !(s.l.tipo === "TRANSFERENCIA" && s.efecto === "ENTRADA");
        const entrada = pos(s.fis) ? s.fis : "0", salida = neg(s.fis) ? negarDecimal(s.fis) : "0";

        return {
          clave: `${s.l.num}:${s.idx}:${s.lado}`, numero_movimiento: s.l.num, freg: s.reg, hreg: s.l.hreg ?? "10:00:00", fmov: s.l.fmov ?? s.reg, retro: (s.l.fmov ?? s.reg) !== s.reg,
          tipo_movimiento: s.l.tipo, tipo_origen: s.l.origen ?? "MANUAL", estado: s.l.estado ?? "REGISTRADO", doc: s.l.doc ?? "", motivo: "", obs: "", usuario: "ana", pcodigo: s.pcodigo, pdesc: `Producto ${s.pcodigo}`, unidad: s.unidad,
          deposito: dep(s.dep)!.nombre, inactivo: !dep(s.dep)!.activo,
          contra: s.contra === null ? "" : accesibles.includes(s.contra) ? dep(s.contra)!.nombre : "Otro depósito (sin acceso)",
          lote: s.lote, propiedad: s.propiedad, propietario_id: s.propietario, efecto: s.efecto, entrada, salida, dd: s.dd, dr: s.dr, dc: s.dc,
          s_disp: s.s_disp, s_res: s.s_res, s_cuar: s.s_cuar, s_fis: suma([s.s_disp, s.s_res, s.s_cuar]),
          cu: costo ? (s.l.cu ?? null) : null, ct: costo ? (s.l.ct ?? null) : null, mon: costo && s.l.ct ? (s.l.mon ?? "PYG") : "",
          anulado_por: porAnula.get(s.l.num) ?? "", anula_a: s.l.anulaA ?? "",
        };
      });
    }

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
  const informe = async (e: Escenario, f: Partial<KardexFiltros> = {}, o: { pagina?: number; tamano?: number; todas?: boolean; usuario?: string; fallo?: (sql: string) => boolean } = {}) => {
    reiniciar();
    filtroActual = { ...FILTROS, ...f };

    return leerKardex(fakePool(e, o.fallo), EMP, o.usuario ?? USR, filtroActual, o.pagina ?? 1, o.tamano ?? 50, o.todas ?? false) as Promise<KardexRespuesta>;
  };
  const depos = [{ id: DA, nombre: "Central", activo: true }, { id: DB, nombre: "Norte", activo: true }, { id: DI, nombre: "Viejo", activo: false }];
  const prods = [{ id: PA, codigo: "A-1", unidad: "Unidad" }, { id: PB, codigo: "B-1", unidad: "Kilo" }, { id: PC, codigo: "C-1", unidad: "Litro" }, { id: PD, codigo: "D-1", unidad: "Unidad" }];
  const L = (n: number) => `MOV-${String(n).padStart(6, "0")}`;
  const filas = (r: KardexRespuesta) => r.filas;

  // ═══ KDX-T01 — entrada, salida, ajuste y anulación compensatoria ═══
  const e1: Escenario = {
    productos: prods, depositos: depos,
    lineas: [
      { num: L(1), tipo: "ENTRADA", freg: "2026-10-01", prod: PA, cant: "10.0000", lote: "L1", d: DA, cu: "5.0000", ct: "50.0000", mon: "PYG", doc: "FC-1" },
      { num: L(2), tipo: "SALIDA", estado: "ANULADO", freg: "2026-10-02", prod: PA, cant: "3.0000", lote: "L1", o: DA, cu: "5.0000", ct: "15.0000", mon: "PYG" },
      { num: L(3), tipo: "AJUSTE_POSITIVO", freg: "2026-10-03", prod: PA, cant: "2.0000", lote: "L1", d: DA, cu: "5.0000", ct: "10.0000", mon: "PYG" },
      { num: L(4), tipo: "ENTRADA", origen: "ANULACION", freg: "2026-10-04", prod: PA, cant: "3.0000", lote: "L1", d: DA, anulaA: L(2), cu: "5.0000", ct: "15.0000", mon: "PYG" },
    ],
  };
  const r1 = await informe(e1);
  const g1 = r1.totales.grupos[0];

  igual("KDX-T01 el libro conserva los cuatro movimientos en orden de registro; el original anulado sigue visible con su efecto", [filas(r1).map((f) => [f.numero, f.estado, f.entrada, f.salida]), r1.pagina.totalFilas], [[[L(1), "REGISTRADO", "10", "0"], [L(2), "ANULADO", "0", "3"], [L(3), "REGISTRADO", "2", "0"], [L(4), "REGISTRADO", "3", "0"]], 4]);
  igual("KDX-T01 saldo acumulado 10 → 7 → 9 → 12 (texto exacto) y saldo final del grupo 12; el original anulado NO se resta otra vez", [filas(r1).map((f) => f.saldoFisico), g1.saldoFinal.fisico, g1.saldoInicial.fisico], [["10", "7", "9", "12"], "12", "0"]);
  igual("KDX-T01 vínculos de anulación en ambos sentidos (anulado_por / anula_a) y una anulación contada", [filas(r1).map((f) => [f.vinculoTipo, f.vinculado]), g1.completo.anulaciones], [[["", ""], ["ANULADO_POR", L(4)], ["", ""], ["ANULA_A", L(2)]], 1]);
  igual("KDX-T01 totales exactos: entradas 15 (10+2+3), salidas 3, cuadra y conciliado con Stock", [g1.filtrado.entradas, g1.filtrado.salidas, g1.cuadra, r1.totales.cuadra, r1.conciliacion], ["15", "3", true, true, { combinaciones: 1, divergentes: 0, conciliado: true }]);

  // ═══ KDX-T02 — transferencia A→B y estorno; contraparte según el alcance ═══
  const e2: Escenario = {
    productos: prods, depositos: depos,
    lineas: [
      { num: L(1), tipo: "ENTRADA", freg: "2026-10-01", prod: PA, cant: "20", d: DA, cu: "2", ct: "40", mon: "PYG" },
      { num: L(2), tipo: "TRANSFERENCIA", origen: "TRANSFERENCIA", estado: "ANULADO", freg: "2026-10-02", prod: PA, cant: "4", o: DA, d: DB, cu: "2", ct: "8", mon: "PYG" },
      { num: L(3), tipo: "TRANSFERENCIA", origen: "ANULACION", freg: "2026-10-03", prod: PA, cant: "4", o: DB, d: DA, anulaA: L(2), cu: "2", ct: "8", mon: "PYG" },
    ],
  };
  const r2 = await informe(e2);
  const g2 = r2.totales.grupos[0];

  igual("KDX-T02 la transferencia muestra DOS lados (salida en el origen, entrada en el destino) y el estorno otros dos, con la contraparte rotulada", [filas(r2).filter((f) => f.tipo === "TRANSFERENCIA").map((f) => [f.numero, f.efecto, f.deposito, f.contraparte]), g2.filtrado.transfEntradas, g2.filtrado.transfSalidas], [[[L(2), "SALIDA", "Central", "Norte"], [L(2), "ENTRADA", "Norte", "Central"], [L(3), "SALIDA", "Norte", "Central"], [L(3), "ENTRADA", "Central", "Norte"]], "8", "8"]);
  igual("KDX-T02 el consolidado compensa: físico neto de transferencias 0, saldo final 20 y por depósito Central 20 / Norte 0", [g2.saldoFinal.fisico, filas(r2).filter((f) => f.numero === L(3)).map((f) => [f.deposito, f.saldoFisico])], ["20", [["Norte", "0"], ["Central", "20"]]]);
  igual("KDX-T02 el costo de la transferencia se muestra UNA sola vez (fila de salida); la entrada no repite el valor", filas(r2).filter((f) => f.numero === L(2)).map((f) => [f.efecto, f.costoUnitario, f.costoTotal, f.moneda]), [["SALIDA", "2", "8", "PYG"], ["ENTRADA", null, null, ""]]);

  const eRestringido: Escenario = { ...e2, depositos: [{ id: DA, nombre: "Central", activo: true }] };
  const r2r = await informe(eRestringido);

  igual("KDX-T02 usuario solo con Central: no ve filas de Norte y el nombre de la contraparte NO se revela («Otro depósito (sin acceso)»)", [filas(r2r).map((f) => f.deposito), [...new Set(filas(r2r).map((f) => f.contraparte))], JSON.stringify(r2r).includes("Norte")], [["Central", "Central", "Central"], ["", "Otro depósito (sin acceso)"], false]);
  igual("KDX-T02 el alcance parcial no amplía permisos: las consultas del libro reciben solo Central ($2) y el alcance completo para la contraparte ($3)", [reg.consultas.find((c) => /FROM sal GROUP BY unidad/.test(c.sql))?.params?.slice(0, 3)], [[EMP, [DA], [DA]]]);

  // ═══ KDX-T03 — reserva, liberación y cuarentena ═══
  const e3: Escenario = {
    productos: prods, depositos: depos,
    lineas: [
      { num: L(1), tipo: "ENTRADA", freg: "2026-10-01", prod: PA, cant: "10", d: DA, cu: "1", ct: "10", mon: "PYG" },
      { num: L(2), tipo: "RESERVA", freg: "2026-10-02", prod: PA, cant: "3", o: DA },
      { num: L(3), tipo: "LIBERACION_RESERVA", freg: "2026-10-03", prod: PA, cant: "1", o: DA },
      { num: L(4), tipo: "CUARENTENA", freg: "2026-10-04", prod: PA, cant: "2", o: DA },
    ],
  };
  const r3 = await informe(e3);
  const g3 = r3.totales.grupos[0];

  igual("KDX-T03 los cambios de estado mueven disponible/reservado/cuarentena sin cambiar el físico (10 en todas las filas) ni crear entradas/salidas", [filas(r3).map((f) => [f.saldoDisponible, f.saldoReservado, f.saldoCuarentena, f.saldoFisico]), filas(r3).slice(1).map((f) => [f.efecto, f.entrada, f.salida])], [[["10", "0", "0", "10"], ["7", "3", "0", "10"], ["8", "2", "0", "10"], ["6", "2", "2", "10"]], [["ESTADO", "0", "0"], ["ESTADO", "0", "0"], ["ESTADO", "0", "0"]]]);
  igual("KDX-T03 totales: entradas 10 y salidas 0 (las reservas no cuentan), 3 cambios de estado, saldo final disp 6 / res 2 / cuar 2 = 10", [g3.filtrado.entradas, g3.filtrado.salidas, g3.filtrado.cambiosEstado, g3.saldoFinal], ["10", "0", 3, { disponible: "6", reservado: "2", cuarentena: "2", fisico: "10" }]);
  igual("KDX-T03 filtro «estado de stock = Reservado» muestra solo las filas que cambian lo reservado, con los saldos reales y el cuadre intacto", [filas(await informe(e3, { estadoStock: "RESERVADO" })).map((f) => f.numero), (await informe(e3, { estadoStock: "RESERVADO" })).totales.cuadra], [[L(2), L(3)], true]);

  // ═══ KDX-T04 — propio, terceros y múltiples propietarios ═══
  const e4: Escenario = {
    productos: prods, depositos: depos,
    lineas: [
      { num: L(1), tipo: "ENTRADA", freg: "2026-10-01", prod: PA, cant: "5", lote: "L1", d: DA, cu: "3", ct: "15", mon: "PYG" },
      { num: L(2), tipo: "ENTRADA", freg: "2026-10-02", prod: PA, cant: "7", lote: "L1", d: DA, prop: "TERCERO", propietario: OX, cu: "9", ct: "63", mon: "PYG" },
      { num: L(3), tipo: "ENTRADA", freg: "2026-10-03", prod: PA, cant: "3", lote: "L1", d: DA, prop: "TERCERO", propietario: OY },
      { num: L(4), tipo: "ENTRADA", freg: "2026-10-04", prod: PA, cant: "2", lote: "L1", d: DA, prop: "TERCERO", propietario: null },
      { num: L(5), tipo: "SALIDA", freg: "2026-10-05", prod: PA, cant: "1", lote: "L1", o: DA, prop: "TERCERO", propietario: OX },
    ],
  };
  const r4 = await informe(e4);

  igual("KDX-T04 el libro incluye los movimientos de terceros, separados de lo propio e identificados por propietario", filas(r4).map((f) => [f.numero, f.propiedad, f.propietario, f.saldoFisico]), [[L(1), "PROPIO", "", "5"], [L(2), "TERCERO", `Tercero ${OX.slice(0, 8)}`, "7"], [L(3), "TERCERO", `Tercero ${OY.slice(0, 8)}`, "3"], [L(4), "TERCERO", "Tercero (propietario no registrado)", "2"], [L(5), "TERCERO", `Tercero ${OX.slice(0, 8)}`, "6"]]);
  igual("KDX-T04 cuatro grupos distintos (propio + tres propietarios) con saldos finales 5 / 6 / 3 / 2; nunca se mezclan", r4.totales.grupos.map((g) => [g.propiedad, g.propietario, g.saldoFinal.fisico]), [["PROPIO", "", "5"], ["TERCERO", "Tercero (propietario no registrado)", "2"], ["TERCERO", `Tercero ${OX.slice(0, 8)}`, "6"], ["TERCERO", `Tercero ${OY.slice(0, 8)}`, "3"]]);
  igual("KDX-T04 el stock de terceros no recibe costo patrimonial (aunque la línea traiga uno) y lo propio conserva el suyo", filas(r4).map((f) => [f.propiedad, f.costoUnitario, f.costoTotal, f.moneda]), [["PROPIO", "3", "15", "PYG"], ["TERCERO", null, null, ""], ["TERCERO", null, null, ""], ["TERCERO", null, null, ""], ["TERCERO", null, null, ""]]);
  igual("KDX-T04 conciliación con Stock incluye a terceros: 4 combinaciones, 0 divergentes", [r4.conciliacion.combinaciones, r4.conciliacion.divergentes], [4, 0]);

  const e4d: Escenario = { ...e4, stock: [
    { prod: PA, dep: DA, lote: "L1", d: "5" }, { prod: PA, dep: DA, lote: "L1", prop: "TERCERO", propietario: OX, d: "7" }, { prod: PA, dep: DA, lote: "L1", prop: "TERCERO", propietario: OY, d: "3" }, { prod: PA, dep: DA, lote: "L1", prop: "TERCERO", propietario: null, d: "2" },
  ] };
  igual("KDX-T04 divergencia real detectada: Stock de terceros (7) no refleja la salida del libro (6) → 1 divergente, sin tolerancias", [(await informe(e4d)).conciliacion], [{ combinaciones: 4, divergentes: 1, conciliado: false }]);

  // ═══ KDX-T05 — período, retroactivos, paginación, filtros de fila ═══
  const e5: Escenario = {
    productos: prods, depositos: depos,
    lineas: [
      { num: L(1), tipo: "ENTRADA", freg: "2026-09-25", prod: PA, cant: "10", d: DA, cu: "1", ct: "10", mon: "PYG", usr: USR },
      { num: L(2), tipo: "SALIDA", freg: "2026-10-02", prod: PA, cant: "4", o: DA, usr: USR },
      { num: L(3), tipo: "ENTRADA", freg: "2026-10-05", fmov: "2026-09-01", prod: PA, cant: "6", d: DA, cu: "1", ct: "6", mon: "PYG", usr: OTRO },
      { num: L(4), tipo: "AJUSTE_NEGATIVO", freg: "2026-10-06", prod: PA, cant: "1", o: DA, usr: USR },
      { num: L(5), tipo: "ENTRADA", freg: "2026-10-09", prod: PA, cant: "5", d: DA, cu: "1", ct: "5", mon: "PYG", usr: USR },
    ],
  };
  const rPer = await informe(e5, { desde: "2026-10-02", hasta: "2026-10-06" });
  const gP = rPer.totales.grupos[0];

  igual("KDX-T05 el período usa la fecha de REGISTRO: saldo inicial real 10 (antes del 02/10), movimientos del período y saldo final 11 al 06/10 (el movimiento del 09/10 queda fuera)", [gP.saldoInicial.fisico, filas(rPer).map((f) => f.numero), gP.saldoFinal.fisico, gP.cuadra], ["10", [L(2), L(3), L(4)], "11", true]);
  igual("KDX-T05 el movimiento retroactivo (fecha del movimiento 01/09, registrado 05/10) se ordena por registro y se marca", filas(rPer).map((f) => [f.numero, f.retroactivo, f.fechaMovimiento, f.saldoFisico]), [[L(2), false, "2026-10-02", "6"], [L(3), true, "2026-09-01", "12"], [L(4), false, "2026-10-06", "11"]]);

  const pg1 = await informe(e5, {}, { pagina: 1, tamano: 2 });
  const pg2 = await informe(e5, {}, { pagina: 2, tamano: 2 });
  const pg3 = await informe(e5, {}, { pagina: 3, tamano: 2 });

  igual("KDX-T05 paginación: el saldo acumulado NO se reinicia (páginas de 2: 10,6 · 12,11 · 16) y el total de filas y los totales son los del filtro completo", [filas(pg1).map((f) => f.saldoFisico), filas(pg2).map((f) => f.saldoFisico), filas(pg3).map((f) => f.saldoFisico), pg2.pagina.totalFilas, pg2.totales.grupos[0].saldoFinal.fisico], [["10", "6"], ["12", "11"], ["16"], 5, "16"]);

  const rTipo = await informe(e5, { tipo: "SALIDA", desde: "2026-10-02", hasta: "2026-10-06" });
  const gT = rTipo.totales.grupos[0];

  igual("KDX-T05 filtro de fila (tipo Salida): las filas se filtran pero los saldos siguen siendo los reales del libro, y filtrados + fuera del filtro = completo", [filas(rTipo).map((f) => [f.numero, f.saldoFisico]), gT.saldoInicial.fisico, gT.saldoFinal.fisico, gT.filtrado.salidas, gT.fueraDelFiltro.entradas, gT.fueraDelFiltro.salidas, gT.completo.entradas, gT.completo.salidas, gT.cuadra], [[[L(2), "6"]], "10", "11", "4", "6", "1", "6", "5", true]);
  igual("KDX-T05 filtro por usuario y por documento/número también conservan los saldos reales", [filas(await informe(e5, { usuarioId: OTRO })).map((f) => [f.numero, f.saldoFisico]), filas(await informe(e5, { documento: "MOV-000004" })).map((f) => [f.numero, f.saldoFisico])], [[[L(3), "12"]], [[L(4), "11"]]]);

  const rVacio = await informe(e5, { desde: "2026-10-07", hasta: "2026-10-08" });
  igual("KDX-T05 período sin movimientos visibles: sin filas, pero saldo inicial = saldo final = 11 (reales, no cero)", [rVacio.pagina.totalFilas, rVacio.totales.grupos[0].saldoInicial.fisico, rVacio.totales.grupos[0].saldoFinal.fisico, rVacio.totales.cuadra], [0, "11", "11", true]);

  const rRes = await informe(e5, { vista: "RESUMEN", desde: "2026-10-02", hasta: "2026-10-06" });
  const qR = rRes.totales.grupos[0].resumen!;

  igual("KDX-T05 vista Resumen: saldo inicial 10, entradas 6, salidas 5, saldo final 11; el total del resumen es la suma exacta de sus filas", [rRes.resumen.map((x) => [x.saldoInicial, x.entradas, x.salidas, x.saldoFinal]), qR.saldoInicial, qR.entradas, qR.salidas, qR.saldoFinal], [[["10", "6", "5", "11"]], "10", "6", "5", "11"]);

  // ═══ KDX-T06 — decimales exactos, cantidades grandes, unidades distintas, costos presentes/ausentes ═══
  const GRANDE = "12345678901234567.1234";
  const e6: Escenario = {
    productos: prods, depositos: depos,
    lineas: [
      { num: L(1), tipo: "ENTRADA", freg: "2026-10-01", prod: PA, cant: "0.1000", d: DA, cu: "1.5000", ct: "0.1500", mon: "PYG" },
      { num: L(2), tipo: "ENTRADA", freg: "2026-10-02", prod: PA, cant: "0.2000", d: DA, cu: null, ct: null },
      { num: L(3), tipo: "ENTRADA", freg: "2026-10-03", prod: PB, cant: "0.0001", d: DA, cu: "100.0000", ct: "0.0100", mon: "USD" },
      { num: L(4), tipo: "ENTRADA", freg: "2026-10-04", prod: PC, cant: GRANDE, d: DA, cu: "2.0000", ct: "24691357802469134.2468", mon: "PYG" },
      { num: L(5), tipo: "ENTRADA", freg: "2026-10-05", prod: PC, cant: "1", d: DA, cu: "2.0000", ct: "2.0000", mon: "PYG" },
    ],
  };
  const r6 = await informe(e6);
  const gr = (u: string) => r6.totales.grupos.find((g) => g.unidad === u)!;

  igual("KDX-T06 decimales exactos: 0,1 + 0,2 = 0,3 (sin 0,30000000000000004); 0,0001 conservado; el entero grande no pierde dígitos", [filas(r6).filter((f) => f.productoCodigo === "A-1").map((f) => f.saldoFisico), gr("Kilo").saldoFinal.fisico, gr("Litro").saldoFinal.fisico], [["0.1", "0.3"], "0.0001", "12345678901234568.1234"]);
  igual("KDX-T06 unidades distintas → tres grupos separados (Kilo, Litro, Unidad) y ningún total general de cantidades", [r6.totales.grupos.map((g) => g.unidad), Object.keys(r6.totales).filter((k) => ["saldoInicial", "saldoFinal", "filtrado", "completo", "disponible", "fisico"].includes(k))], [["Kilo", "Litro", "Unidad"], []]);
  igual("KDX-T06 costos presentes y ausentes: el ausente es null (no cero) y cada costo lleva su moneda (PYG / USD)", filas(r6).slice(0, 3).map((f) => [f.costoUnitario, f.costoTotal, f.moneda]), [["1.5000", "0.1500", "PYG"], [null, null, ""], ["100.0000", "0.0100", "USD"]]);

  const t6 = tablaKardex(r6);
  const ic = (titulo: string) => t6.columnas.findIndex((c) => c.titulo === titulo);
  const xl = leerHojaXlsx(generarXlsxTabla(t6));
  const col = (i: number) => String.fromCharCode(65 + i);
  const base = 1 + 1 + 1 + t6.filtros.length + 1 + 1;
  const celda = (titulo: string, n: number) => xl.get(`${col(ic(titulo))}${base + n}`);

  igual("KDX-T06 XLSX real: saldo 0,1 y 0,3 numéricos; 0,0001 numérico; el saldo >15 dígitos va como TEXTO exacto; costo ausente «—» y moneda como texto", [celda("Saldo físico", 1), celda("Saldo físico", 2), celda("Saldo físico", 3), celda("Saldo físico", 4), celda("Costo unit.", 1), celda("Costo unit.", 2), celda("Costo total", 2), celda("Moneda costo", 3), celda("Moneda costo", 2)], [
    { tipo: "n", valor: "0.1" }, { tipo: "n", valor: "0.3" }, { tipo: "n", valor: "0.0001" }, { tipo: "s", valor: "12345678901234567.1234" }, { tipo: "n", valor: "1.5" }, { tipo: "s", valor: "—" }, { tipo: "s", valor: "—" }, { tipo: "s", valor: "USD" }, null,
  ]);

  const pdf6 = [...generarPdfTabla(t6).toString("latin1").matchAll(/\(((?:[^()\\]|\\.)*)\) Tj/g)].map((m) => m[1].replace(/\\(.)/g, "$1"));

  const grande = pdf6.find((x) => x.startsWith("12.3"));
  igual("KDX-T06 PDF: 0,3 y 0,0001 exactos, moneda USD, totales rotulados por unidad/propiedad (SALDO FINAL con Kilo y Litro) y sin NaN; un valor de 20 dígitos nunca se altera en silencio (exacto o recortado con «…»)", [pdf6.includes("0,3"), pdf6.includes("0,0001"), pdf6.includes("USD"), pdf6.filter((x) => x === "SALDO FINAL").length, pdf6.includes("Kilo") && pdf6.includes("Litro"), !pdf6.some((x) => /NaN/.test(x)), grande === "12.345.678.901.234.567,1234" || (grande !== undefined && /[…\u0085]$/.test(grande))], [true, true, true, 3, true, true, true]);
  cierto("KDX-T06 cada fila de totales lleva su grupo en las columnas Unidad y Propiedad (Kilo, Litro, Unidad · Propio) y no existe una fila de totales sin unidad", t6.totales.length > 0 && t6.totales.every((tt) => ["Kilo", "Litro", "Unidad"].includes(String(tt.celdas[ic("Unidad")])) && tt.celdas[ic("Propiedad")] === "Propio"));

  const tRes = tablaKardex(await informe(e6, { vista: "RESUMEN" }));

  cierto("KDX-T06 Resumen: columna Unidad y totales por grupo también en el Resumen (Excel/PDF)", tRes.columnas.some((c) => c.titulo === "Unidad") && tRes.totales.every((tt) => ["Kilo", "Litro", "Unidad"].includes(String(tt.celdas[tRes.columnas.findIndex((c) => c.titulo === "Unidad")]))) && generarPdfTabla(tRes).subarray(0, 5).toString() === "%PDF-");

  // ═══ KDX-T07 — empresa, alcance, depósitos inactivos, permisos ═══
  const eI: Escenario = {
    productos: prods, depositos: depos,
    lineas: [
      { num: L(1), tipo: "ENTRADA", freg: "2026-10-01", prod: PA, cant: "6", d: DI, cu: "1", ct: "6", mon: "PYG" },
      { num: L(2), tipo: "ENTRADA", freg: "2026-10-02", prod: PA, cant: "4", d: DA, cu: "1", ct: "4", mon: "PYG" },
    ],
  };
  const rI = await informe(eI);

  igual("KDX-T07 un depósito INACTIVO dentro del alcance del usuario aparece en el historial y el catálogo, rotulado (misma regla que NEX-046)", [filas(rI).map((f) => [f.deposito, f.depositoInactivo]), rI.catalogos.depositos.map((d) => [d.nombre, d.activo]), rI.totales.grupos[0].saldoFinal.fisico], [[["Viejo", true], ["Central", false]], [["Central", true], ["Norte", true], ["Viejo", false]], "10"]);
  igual("KDX-T07 la lectura de depósitos usa alcance (activos e inactivos) con empresa y usuario de la SESIÓN, no el helper de solo activos", [reg.consultas.find((c) => /FROM depositos d JOIN usuarios u/.test(c.sql))?.params, /d\.activo\s+AND/.test(reg.consultas.find((c) => /FROM depositos d JOIN usuarios u/.test(c.sql))!.sql)], [[EMP, USR], false]);
  igual("KDX-T07 depósito elegido fuera del alcance (otra empresa / no asignado) → 403 y no se lee ningún movimiento", [(await informe(eI, { depositoId: U(99) }) as unknown as { status: number }).status, reg.consultas.some((c) => /movimientos_inventario/.test(c.sql))], [403, false]);
  igual("KDX-T07 un depósito inactivo del alcance puede filtrarse directamente (no es 403)", filas(await informe(eI, { depositoId: DI })).map((f) => f.deposito), ["Viejo"]);
  cierto("KDX-T07 el libro y la conciliación se filtran por la empresa de la SESIÓN ($1) y por los depósitos del alcance ($2)", (await informe(eI), reg.consultas.filter((c) => /^WITH\s+mv AS/.test(c.sql.trim())).every((c) => c.params?.[0] === EMP && Array.isArray(c.params?.[1]) && /m\.empresa_id = \$1|s\.empresa_id = \$1/.test(c.sql))));
  cierto("KDX-T07 el libro de otra empresa no se mezcla: toda tabla consultada en el libro se une por empresa_id", /WHERE m\.empresa_id = \$1/.test(leer("lib/reportes/kardex.ts")) && /l\.empresa_id = m\.empresa_id/.test(leer("lib/reportes/kardex.ts")) && /pr\.empresa_id = \$1/.test(leer("lib/reportes/kardex.ts")) && /s\.empresa_id = \$1/.test(leer("lib/reportes/kardex.ts")));

  const rutaLeer = leer("app/api/reportes/kardex/route.ts"), rutaExportar = leer("app/api/reportes/kardex/exportar/route.ts"), guard = leer("lib/reportes/guard.ts");

  cierto("KDX-T07 permisos: consultar exige REPORTES.VER, exportar exige VER y EXPORTAR; el GET informa permisos.exportar con hasPermission; 401/403/503 vienen del guard común", /autorizarReporte\(\["VER"\]\)/.test(rutaLeer) && /autorizarReporte\(\["VER", "EXPORTAR"\]\)/.test(rutaExportar) && /hasPermission\(acceso, "REPORTES", "EXPORTAR"\)/.test(rutaLeer) && /status: 401/.test(guard) && /status: 403/.test(guard) && /status: 503/.test(guard));
  igual("KDX-T07 filtros inválidos se rechazan antes de leer (identificadores, vista, tipo, fechas, período invertido)", [
    "depositoId=zzz", "usuarioId=1", "vista=X", "tipo=NADA", "estado=OTRO", "estadoStock=X", "desde=2026-13-01", "desde=2026-10-05&hasta=2026-10-01",
  ].map((q) => "error" in parsearFiltrosKardex(new URLSearchParams(q))), [true, true, true, true, true, true, true, true]);

  // ═══ KDX-T08 — snapshot, rollback/release y tope de 50.000 filas ═══
  await informe(e1);
  igual("KDX-T08 UNA conexión (ninguna consulta por el pool), BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY primero, COMMIT al final y conexión liberada", [reg.conexiones, reg.poolQuery, reg.consultas[0].sql, reg.consultas.at(-1)?.sql, reg.liberadas], [1, 0, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "COMMIT", 1]);
  cierto("KDX-T08 alcance, totales, conciliación, filas, catálogos y hora salen de la MISMA transacción (todas las consultas entre BEGIN y COMMIT)", ["depositos d JOIN usuarios", "FROM sal GROUP BY unidad", "FULL JOIN st s", "FROM pg s", "FROM usuarios u", "now()"].every((frag) => reg.consultas.slice(1, -1).some((c) => c.sql.includes(frag))));
  cierto("KDX-T08 el servicio no usa Promise.all ni el pool: todo pasa por conSnapshotLectura", /conSnapshotLectura\(db/.test(leer("lib/reportes/kardex.ts")) && !/Promise\.all/.test(leer("lib/reportes/kardex.ts")) && !/db\.query\(/.test(leer("lib/reportes/kardex.ts")));

  let falla = "";
  try { await informe(e1, {}, { fallo: (s) => /FULL JOIN st s/.test(s) }); } catch (x) { falla = (x as Error).message; }
  igual("KDX-T08 ante un error de lectura: ROLLBACK, se propaga el error, sin COMMIT y conexión liberada", [falla, reg.consultas.at(-1)?.sql, reg.consultas.some((c) => c.sql === "COMMIT"), reg.liberadas], ["fallo de consulta", "ROLLBACK", false, 1]);

  const masivo = (n: number): Escenario => ({ productos: prods, depositos: depos, lineas: Array.from({ length: n }, (_, i) => ({ num: `MOV-${String(i + 1).padStart(7, "0")}`, tipo: "ENTRADA", freg: "2026-10-01", prod: PA, cant: "1", d: DA })) });
  const r413 = (await informe(masivo(50001), {}, { todas: true })) as unknown as { error: string; status: number };

  igual("KDX-T08 más de 50.000 filas en la exportación → 413 (ejercitado con 50.001 movimientos), pide LIMIT 50001 y cierra la transacción", [r413.status, reg.consultas.find((c) => /FROM pg s/.test(c.sql))?.params?.slice(-2), reg.consultas.at(-1)?.sql, reg.liberadas], [413, [50001, 0], "COMMIT", 1]);
  igual("KDX-T08 exactamente 50.000 filas SÍ se exportan", ((await informe(masivo(50000), {}, { todas: true })) as KardexRespuesta).filas.length, 50000);
  igual("KDX-T08 la pantalla pide una página (LIMIT 50, OFFSET 0) y la exportación todas, sin depender de la página", [(await informe(masivo(120), {}, { pagina: 2, tamano: 50 })).filas.length, ((await informe(masivo(120), {}, { todas: true })) as KardexRespuesta).filas.length, reg.consultas.find((c) => /FROM pg s/.test(c.sql))?.params?.slice(-2)], [50, 120, [50001, 0]]);

  // Excel y PDF de las dos vistas con los mismos filtros/columnas que la pantalla
  const exp = ["DETALLE", "RESUMEN"].map((v) => {
    const t = tablaKardex({ ...r1, filtros: { ...r1.filtros, vista: v as "DETALLE" | "RESUMEN" }, resumen: [], totales: { ...r1.totales, grupos: r1.totales.grupos.map((g) => ({ ...g, resumen: g.resumen ?? { filas: 0, saldoInicial: "0", entradas: "0", salidas: "0", transfEntradas: "0", transfSalidas: "0", fueraDelFiltro: "0", saldoFinal: "0", finalDisponible: "0", finalReservado: "0", finalCuarentena: "0" } })) } });
    const h = leerHojaXlsx(generarXlsxTabla(t));

    return [t.columnas.length === (v === "DETALLE" ? COLUMNAS_KARDEX.length : columnasResumen(false).length), [...h.values()].some((c) => /NaN|undefined/.test(c.valor)), generarPdfTabla(t).subarray(0, 5).toString()];
  });

  igual("KDX-T08 Excel y PDF de las dos vistas: columnas = pantalla, sin NaN/undefined, PDF válido", exp, [[true, false, "%PDF-"], [true, false, "%PDF-"]]);

  const tFilas = tablaKardex(r1);
  const xl1 = leerHojaXlsx(generarXlsxTabla(tFilas));
  const b1 = 1 + 1 + 1 + tFilas.filtros.length + 1 + 1;
  const ic1 = (t: string) => tFilas.columnas.findIndex((c) => c.titulo === t);

  igual("KDX-T08 XLSX real del detalle: entrada 10 y saldo 12 numéricos, estado del original «Anulado» y vínculos en texto, mismas filas y orden que la pantalla", [
    xl1.get(`${col(ic1("Entrada"))}${b1 + 1}`), xl1.get(`${col(ic1("Saldo físico"))}${b1 + 4}`), xl1.get(`${col(ic1("Estado"))}${b1 + 2}`), xl1.get(`${col(ic1("Vinculado"))}${b1 + 2}`), xl1.get(`${col(ic1("Vinculado"))}${b1 + 4}`),
    xl1.get(`${col(ic1("Movimiento"))}${b1 + 1}`), xl1.get(`${col(ic1("Movimiento"))}${b1 + 4}`),
  ], [{ tipo: "n", valor: "10" }, { tipo: "n", valor: "12" }, { tipo: "s", valor: "Anulado" }, { tipo: "s", valor: `Anulado por ${L(4)}` }, { tipo: "s", valor: `Anula a ${L(2)}` }, { tipo: "s", valor: L(1) }, { tipo: "s", valor: L(4) }]);

  // ═══ KDX-T09 — cliente HTTP: respuestas inválidas, errores, filtros rápidos, retry, resultados obsoletos ═══
  const ok = { ...r1, permisos: { exportar: true } } as KardexRespuestaApi;
  const buscar = (r: { status: number; cuerpo: unknown } | "red" | "texto") => async () => {
    if (r === "red") throw new Error("sin red");
    if (r === "texto") return new Response("<html>", { status: 200 });

    return new Response(JSON.stringify(r.cuerpo), { status: r.status });
  };

  igual("KDX-T09 la respuesta real del informe es válida para el cliente (round-trip JSON) y entrega los datos", [respuestaKardexValida(JSON.parse(JSON.stringify(ok))), (await pedirKardex(FILTROS, 1, buscar({ status: 200, cuerpo: ok }))).error], [true, ""]);

  const dañadas: Array<[string, unknown]> = [
    ["objeto vacío", {}], ["sin totales", { ...ok, totales: undefined }], ["cantidad como número (float)", { ...ok, filas: [{ ...ok.filas[0], entrada: 10 }] }], ["cantidad no numérica", { ...ok, filas: [{ ...ok.filas[0], saldoFisico: "abc" }] }],
    ["grupo con saldo inválido", { ...ok, totales: { ...ok.totales, grupos: [{ ...ok.totales.grupos[0], saldoFinal: { disponible: "1" } }] } }], ["sin permisos", { ...ok, permisos: undefined }], ["propiedad inválida", { ...ok, filas: [{ ...ok.filas[0], propiedad: "OTRO" }] }], ["array", []], ["null", null],
  ];

  for (const [n, cuerpo] of dañadas) {
    const r = await pedirKardex(FILTROS, 1, buscar({ status: 200, cuerpo }));

    igual(`KDX-T09 HTTP 200 inválido (${n}) → sin datos y con error`, [r.datos, r.error], [null, "La respuesta del reporte no tiene el formato esperado."]);
  }
  for (const status of [401, 403, 500, 503]) {
    const r = await pedirKardex(FILTROS, 1, buscar({ status, cuerpo: { error: "Fallo." } }));

    igual(`KDX-T09 HTTP ${status} → sin datos y con el mensaje del servidor`, [r.datos, r.error], [null, `Fallo. (código ${status})`]);
  }
  igual("KDX-T09 red caída y JSON inválido → sin datos", [(await pedirKardex(FILTROS, 1, buscar("red"))).datos, (await pedirKardex(FILTROS, 1, buscar("texto"))).datos], [null, null]);
  igual("KDX-T09 reintentar con los mismos filtros tras un error entrega los datos", [(await pedirKardex(FILTROS, 1, buscar("red"))).error !== "", (await pedirKardex(FILTROS, 1, buscar({ status: 200, cuerpo: ok }))).datos !== null], [true, true]);

  // Filtros campo a campo (el orden de las propiedades JSON no importa) y página
  const reordenado = JSON.parse(JSON.stringify({ hasta: "", desde: "", lote: "", estadoStock: "", estado: "", documento: "", usuarioId: "", tipo: "", depositoId: "", q: "", vista: "DETALLE" })) as KardexFiltros;

  igual("KDX-T09 igualdad de filtros por campo: mismo contenido con otro orden de propiedades es vigente; un campo distinto o una página distinta no", [
    filtrosKardexIguales(reordenado, FILTROS), respuestaKardexVigente({ filtros: reordenado, pagina: { numero: 1 } }, "", FILTROS, 1), respuestaKardexVigente({ filtros: reordenado, pagina: { numero: 1 } }, "", { ...FILTROS, tipo: "SALIDA" }, 1),
    respuestaKardexVigente({ filtros: reordenado, pagina: { numero: 1 } }, "", FILTROS, 2), respuestaKardexVigente({ filtros: reordenado, pagina: { numero: 1 } }, "falló", FILTROS, 1), respuestaKardexVigente(null, "", FILTROS, 1),
  ], [true, true, false, false, false, false]);

  // Respuestas fuera de orden: la última solicitud iniciada gana
  const compuerta = crearCompuerta();
  const mostrada: { f: string } = { f: "" };
  let liberarLenta: () => void = () => {};
  const lenta = new Promise<void>((res) => { liberarLenta = res; });
  const sol1 = compuerta.nueva();
  const p1 = pedirKardex({ ...FILTROS, q: "lenta" }, 1, async () => { await lenta; return new Response(JSON.stringify({ ...ok, filtros: { ...FILTROS, q: "lenta" } }), { status: 200 }); }).then((r) => { if (compuerta.vigente(sol1)) mostrada.f = r.datos?.filtros.q ?? "error"; });
  const sol2 = compuerta.nueva();
  const r2x = await pedirKardex({ ...FILTROS, q: "rapida" }, 1, async () => new Response(JSON.stringify({ ...ok, filtros: { ...FILTROS, q: "rapida" } }), { status: 200 }));

  if (compuerta.vigente(sol2)) mostrada.f = r2x.datos?.filtros.q ?? "error";
  liberarLenta();
  await p1;
  igual("KDX-T09 filtros rápidos: una respuesta lenta anterior NO pisa a la última solicitud", mostrada.f, "rapida");

  const pagina = leer("app/(private)/reportes/kardex/page.tsx");

  cierto("KDX-T09 pantalla: compuerta de última solicitud, datos descartados en error, solo respuesta vigente visible, «Reintentar», exportación solo con permisos.exportar y sin JSON.stringify ni .catch que conserve datos", /pedirKardex\(aplicados, pagina\)/.test(pagina) && /crearCompuerta\(\)/.test(pagina) && /setDatos\(r\.datos\)/.test(pagina) && /respuestaKardexVigente\(datos, error, aplicados, pagina\)/.test(pagina) && /Reintentar/.test(pagina) && /actual\?\.permisos\.exportar === true/.test(pagina) && /\{puedeExportar \? \(/.test(pagina) && !/JSON\.stringify/.test(pagina) && !/\.catch\(\(e: unknown\)/.test(pagina));
  cierto("KDX-T09 la exportación usa los filtros de la respuesta VIGENTE (no los que el usuario esté tecleando) y la pantalla no suma cantidades de grupos distintos", /descargarKardex\(actual\.filtros, formato\)/.test(pagina) && !/\.reduce\(/.test(pagina) && !/Number\(/.test(pagina));
  cierto("KDX-T09 sin datos vigentes no hay KPI, tabla ni cobertura obsoleta en pantalla: todo sale de «actual»", !/\bdatos\??\.(filas|resumen|totales|conciliacion|cobertura)/.test(pagina) && /actual\?\.filas/.test(pagina));

  // ═══ KDX-T10 — Kardex solo lectura, independencia y regresiones ═══
  const fuenteK = leer("lib/reportes/kardex.ts");

  cierto("KDX-T10 el Kardex es SOLO lectura: no escribe (INSERT/UPDATE/DELETE), no llama al motor de Movimientos ni toca costos actuales", !/\b(INSERT|UPDATE|DELETE)\b/.test(fuenteK) && !/inventario_registrar|inventario_anular|registrar_movimiento|anular_movimiento/.test(fuenteK) && !/inventario_costos/.test(fuenteK));
  cierto("KDX-T10 sin float: ni ::float8 ni Number() sobre cantidades en el servicio, el plan, la exportación ni el cliente; sin tolerancias (eps)", ["lib/reportes/kardex.ts", "lib/reportes/kardex-plan.ts", "lib/reportes/export-kardex.ts", "lib/reportes/cliente-kardex.ts"].every((a) => !/float8|parseFloat|\beps\b|0\.00005/.test(leer(a))) && !/Number\(/.test(leer("lib/reportes/export-kardex.ts")));
  cierto("KDX-T10 el libro incluye propio y terceros (sin restringir l.propiedad = 'PROPIO') y usa el alcance con inactivos, no depositosPermitidos", !/l\.propiedad = 'PROPIO'/.test(fuenteK) && /depositosDelAlcance/.test(fuenteK) && !/depositosPermitidos/.test(fuenteK));
  cierto("KDX-T10 independencia: Valorización, Stock crítico, Stock general y Lotes no importan el Kardex", ["valorizacion", "stock-critico", "stock-general", "lotes"].every((m) => !/kardex/.test(leer(`lib/reportes/${m}.ts`))));
  cierto("KDX-T10 la suite del Kardex está registrada en el runner oficial", /reportes\/kardex\.casos/.test(leer("scripts/casos-clientes/run.js")) && /verificarCasosReportesKardex/.test(leer("scripts/casos-clientes/run.js")));
  cierto("KDX-T10 sin migration nueva ni cambios en el motor: el Kardex solo lee tablas del libro, depósitos, usuarios, productos y lotes", !/migraciones/.test(fuenteK));

  return fallos;
}
