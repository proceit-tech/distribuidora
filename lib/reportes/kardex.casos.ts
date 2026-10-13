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
import { claveGrupo, construirGrupos, etiquetasUnidad, filtrosKardexIguales, negarDecimal, respuestaKardexValida, respuestaKardexVigente } from "@/lib/reportes/kardex-plan";
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
  /** Instante de registro del movimiento (creado_at); por defecto freg + hreg. */
  ts?: string;
};
type Stock = { prod: string; dep: string; lote?: string; prop?: "PROPIO" | "TERCERO"; propietario?: string | null; d?: string; r?: string; c?: string };
type Escenario = {
  productos: Array<{ id: string; codigo: string; unidad: string; unidadId?: string }>;
  lineas: Linea[];
  depositos: Array<{ id: string; nombre: string; activo: boolean }>;
  stock?: Stock[];
  /** Historial de cambios de unidad-base (NEX-052). undefined = la tabla NO existe (migration sin aplicar). */
  historialUnidad?: Array<{ id: string; prod: string; de: string; a: string; at: string; deId?: string; aId?: string }>;
};
type Consulta = { sql: string; params?: unknown[] };
type Sal = {
  l: Linea; idx: number; dep: string; contra: string | null; lado: number; efecto: "ENTRADA" | "SALIDA" | "ESTADO";
  dd: string; dr: string; dc: string; s_disp: string; s_res: string; s_cuar: string; reg: string; unidad: string; unidadId: string; pcodigo: string; lote: string; propiedad: "PROPIO" | "TERCERO"; propietario: string | null; fis: string;
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
  const instante = (l: Linea) => l.ts ?? `${l.freg}T${l.hreg ?? "10:00:00"}Z`;
  // Regla de referencia (independiente del SQL): vigente = la última alteración con cambiado_at <= registro (orden cambiado_at, id); antes de la primera, la unidad anterior de la primera; sin historial, la actual.
  const idDe = (nombre: string) => `uid-${nombre}`;
  const unidadEn = (e: Escenario, l: Linea, actual: { unidad: string; unidadId?: string }): { nombre: string; id: string } => {
    const h = (e.historialUnidad ?? []).filter((x) => x.prod === l.prod).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    const previas = h.filter((x) => x.at <= instante(l));

    const u = previas.length ? previas[previas.length - 1] : undefined;

    if (u) return { nombre: u.a, id: u.aId ?? idDe(u.a) };
    if (h.length) return { nombre: h[0].de, id: h[0].deId ?? idDe(h[0].de) };

    return { nombre: actual.unidad, id: actual.unidadId ?? idDe(actual.unidad) };
  };
  const efectos = (e: Escenario, deps: string[]): Sal[] => {
    const f = filtroActual;
    const prod = (id: string) => e.productos.find((p) => p.id === id)!;
    const todos: Sal[] = [];

    e.lineas.forEach((l, idx) => {
      const mk = (dep: string, contra: string | null, lado: number, efecto: Sal["efecto"], dd: string, dr: string, dc: string) => {
        const p = prod(l.prod);

        todos.push({ l, idx, dep, contra, lado, efecto, dd, dr, dc, s_disp: "0", s_res: "0", s_cuar: "0", reg: l.freg, unidad: unidadEn(e, l, p).nombre, unidadId: unidadEn(e, l, p).id, pcodigo: p.codigo, lote: l.lote ?? "", propiedad: l.prop ?? "PROPIO", propietario: l.propietario ?? null, fis: suma([dd, dr, dc]) });
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
      const k = [s.l.prod, s.dep, s.lote, s.propiedad, s.propietario ?? "", s.unidadId].join("|");
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
  const claveG = (s: Sal) => `${s.unidadId}|${s.propiedad}|${s.propietario ?? ""}`;
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

  type G = { prod: string; dep: string; lote: string; prop: "PROPIO" | "TERCERO"; propietario: string | null; unidad: string; unidadId: string; pcodigo: string; inicial: string; entradas: string; salidas: string; t_ent: string; t_sal: string; fuera: string; f_disp: string; f_res: string; f_cuar: string; en: number };
  const grupos = (rows: Sal[]): G[] => {
    const m = new Map<string, Sal[]>();

    for (const s of rows) m.set([s.l.prod, s.dep, s.lote, s.propiedad, s.propietario ?? "", s.unidadId].join("|"), [...(m.get([s.l.prod, s.dep, s.lote, s.propiedad, s.propietario ?? "", s.unidadId].join("|")) ?? []), s]);

    const f = filtroActual;
    const fin = (s: Sal) => !f.hasta || s.reg <= f.hasta;

    return [...m.values()].map((l) => {
      const noT = l.filter((s) => sel(s) && s.l.tipo !== "TRANSFERENCIA"), t = l.filter((s) => sel(s) && s.l.tipo === "TRANSFERENCIA");

      return {
        prod: l[0].l.prod, dep: l[0].dep, lote: l[0].lote, prop: l[0].propiedad, propietario: l[0].propietario, unidad: l[0].unidad, unidadId: l[0].unidadId, pcodigo: l[0].pcodigo,
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
    if (/to_regclass\(/.test(sql)) return [{ existe: e.historialUnidad !== undefined }];
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
    if (/FROM sal GROUP BY unidad_id, propiedad, propietario_id ORDER BY max\(unidad\)/.test(sql)) {
      const sal = efectos(e, deps);
      const porG = new Map<string, Sal[]>();

      for (const s of sal) porG.set(claveG(s), [...(porG.get(claveG(s)) ?? []), s]);

      return [...porG.keys()].sort(ordenarG).map((k) => {
        const l = porG.get(k)!;
        const f = filtroActual;
        const fin = (s: Sal) => !f.hasta || s.reg <= f.hasta;

        return {
          unidad: l[0].unidad, unidad_id: l[0].unidadId, propiedad: l[0].propiedad, propietario_id: l[0].propietario, filas: l.filter(sel).length,
          i_disp: f.desde ? suma(l.filter((s) => s.reg < f.desde).map((s) => s.dd)) : "0", i_res: f.desde ? suma(l.filter((s) => s.reg < f.desde).map((s) => s.dr)) : "0", i_cuar: f.desde ? suma(l.filter((s) => s.reg < f.desde).map((s) => s.dc)) : "0",
          f_disp: suma(l.filter(fin).map((s) => s.dd)), f_res: suma(l.filter(fin).map((s) => s.dr)), f_cuar: suma(l.filter(fin).map((s) => s.dc)),
          ...movs(l, "f", sel), ...movs(l, "o", fuera), ...movs(l, "c", enPer),
        };
      });
    }
    if (/FROM gf GROUP BY unidad/.test(sql)) {
      const gf = grupos(efectos(e, deps)).filter((g) => g.en > 0 || (!filasDeFila() && !cero(g.inicial)));
      const porG = new Map<string, G[]>();

      for (const g of gf) porG.set(`${g.unidadId}|${g.prop}|${g.propietario ?? ""}`, [...(porG.get(`${g.unidadId}|${g.prop}|${g.propietario ?? ""}`) ?? []), g]);

      return [...porG.values()].map((l) => ({
        unidad: l[0].unidad, unidad_id: l[0].unidadId, propiedad: l[0].prop, propietario_id: l[0].propietario, n: l.length, inicial: suma(l.map((g) => g.inicial)), entradas: suma(l.map((g) => g.entradas)), salidas: suma(l.map((g) => g.salidas)),
        t_ent: suma(l.map((g) => g.t_ent)), t_sal: suma(l.map((g) => g.t_sal)), fuera: suma(l.map((g) => g.fuera)), final: suma(l.flatMap((g) => [g.f_disp, g.f_res, g.f_cuar])),
        f_disp: suma(l.map((g) => g.f_disp)), f_res: suma(l.map((g) => g.f_res)), f_cuar: suma(l.map((g) => g.f_cuar)),
      }));
    }
    if (/FROM gf JOIN depositos d/.test(sql)) {
      const limite = params[params.length - 2] as number, desde = params[params.length - 1] as number;
      const gf = grupos(efectos(e, deps)).filter((g) => g.en > 0 || (!filasDeFila() && !cero(g.inicial)))
        .sort((a, b) => a.pcodigo.localeCompare(b.pcodigo) || e.depositos.find((d) => d.id === a.dep)!.nombre.localeCompare(e.depositos.find((d) => d.id === b.dep)!.nombre) || a.lote.localeCompare(b.lote) || a.prop.localeCompare(b.prop) || (a.propietario ?? "").localeCompare(b.propietario ?? ""));

      return gf.slice(desde, desde + limite).map((g) => ({
        clave: `${g.prod}:${g.dep}:${g.lote}:${g.prop}:${g.propietario ?? ""}:${g.unidadId}`, pcodigo: g.pcodigo, pdesc: `Producto ${g.pcodigo}`, unidad: g.unidad, unidad_id: g.unidadId, deposito: e.depositos.find((d) => d.id === g.dep)!.nombre, inactivo: !e.depositos.find((d) => d.id === g.dep)!.activo,
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
          tipo_movimiento: s.l.tipo, tipo_origen: s.l.origen ?? "MANUAL", estado: s.l.estado ?? "REGISTRADO", doc: s.l.doc ?? "", motivo: "", obs: "", usuario: "ana", pcodigo: s.pcodigo, pdesc: `Producto ${s.pcodigo}`, unidad: s.unidad, unidad_id: s.unidadId,
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

  igual("KDX-T06 PDF: 0,3, 0,0001, 12.345.678.901.234.567,1234 COMPLETOS (sin «…»), moneda USD, totales con su unidad/propiedad y sin NaN", [pdf6.includes("0,3"), pdf6.includes("0,0001"), pdf6.includes("12.345.678.901.234.567,1234"), pdf6.includes("USD"), pdf6.filter((x) => x === "SALDO FINAL").length >= 3, pdf6.includes("Kilo") && pdf6.includes("Litro"), !pdf6.some((x) => /NaN/.test(x)), pdf6.filter((x) => /^[-+\d.,]+[…\u0085]$/.test(x)).length], [true, true, true, true, true, true, true, 0]);
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

  // ═══ KDX-R02-01 — PDF sin pérdida de dígitos (DETALLE y RESUMEN, totales, varias páginas y bloques de columnas) ═══
  const es = (v: string): string => {
    const [i, d = ""] = v.split(".");
    const ent = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const dd = d.replace(/0+$/, "");

    return dd ? `${ent},${dd}` : ent;
  };
  const aBig = (v: string): bigint => { const [i, d = ""] = v.split("."); return BigInt(i + d.padEnd(4, "0")); };
  const deBig = (n: bigint): string => { const s = n.toString().padStart(5, "0"); return `${s.slice(0, -4)}.${s.slice(-4)}`; };
  const sumaBig = (l: string[]): string => deBig(l.reduce((a, v) => a + aBig(v), BigInt(0)));
  const tokensPdf = (b: Buffer): string[] => [...b.toString("latin1").matchAll(/\(((?:[^()\\]|\\.)*)\) Tj/g)].map((m) => m[1].replace(/\\(.)/g, "$1"));
  const paginasPdf = (b: Buffer): number => (b.toString("latin1").match(/\/Type \/Page /g) ?? []).length;
  const truncado = (tokens: string[]): string[] => tokens.filter((x) => /^[-+\d.,]+[…\u0085]$/.test(x));

  const N = 70;
  const cants = Array.from({ length: N }, (_, i) => `${"9".repeat(19)}${i % 10}.${String(1000 + i).slice(-4)}`); // 20 dígitos enteros + 4 decimales
  const costosU = Array.from({ length: N }, (_, i) => `${"8".repeat(18)}${String(10 + (i % 80))}.${String(2000 + i).slice(-4)}`);
  const costosT = Array.from({ length: N }, (_, i) => `${"7".repeat(25)}${String(i % 10)}.${String(3000 + i).slice(-4)}`);
  const eBig: Escenario = {
    productos: prods, depositos: depos,
    lineas: cants.map((c, i): Linea => ({ num: `MOV-${String(i + 1).padStart(7, "0")}`, tipo: "ENTRADA", freg: "2026-10-01", hreg: `10:${String(i % 60).padStart(2, "0")}:00`, prod: PC, cant: c, lote: `LOTE-${String(i).padStart(3, "0")}`, d: DA, cu: costosU[i], ct: costosT[i], mon: "PYG" })),
  };
  const rBigD = await informe(eBig, { vista: "DETALLE" }, { tamano: 200 });
  const tBigD = tablaKardex(rBigD);
  const pdfD = generarPdfTabla(tBigD);
  const tkD = tokensPdf(pdfD);
  // cada movimiento tiene su propio lote: el saldo acumulado de cada fila es la propia cantidad (canónica)
  const saldos = cants;
  const canon = (v: string): string => sumarDecimales([v]);
  const totalBig = sumaBig(cants);

  igual("KDX-R02-01 el libro de prueba trae 70 movimientos con cantidades de 20 dígitos enteros + 4 decimales, costos y saldos acumulados exactos", [rBigD.filas.length, rBigD.filas[69].entrada, rBigD.filas[69].saldoFisico, rBigD.totales.grupos[0].saldoFinal.fisico], [N, canon(cants[69]), canon(cants[69]), totalBig]);
  cierto("KDX-R02-01 PDF DETALLE real: TODA entrada, saldo físico, costo unitario y costo total de las 70 filas aparece COMPLETA, con sus 24+ dígitos y decimales (agrupación es-PY)", cants.every((c, i) => tkD.includes(es(c)) && tkD.includes(es(saldos[i])) && tkD.includes(es(costosU[i])) && tkD.includes(es(costosT[i]))));
  cierto("KDX-R02-01 PDF DETALLE: ninguna cifra queda recortada con «…» ni con el carácter 0x85", truncado(tkD).length === 0);
  cierto("KDX-R02-01 PDF DETALLE: totales exactos (saldo final del grupo = suma exacta de 70 cantidades de 20 dígitos) y etiquetas SALDO INICIAL / SALDO FINAL", tkD.includes(es(totalBig)) && tkD.includes("SALDO INICIAL") && tkD.includes("SALDO FINAL"));
  cierto("KDX-R02-01 PDF DETALLE: más de una página y columnas en BLOQUES rotulados que repiten movimiento, producto, unidad, depósito, lote y propiedad", paginasPdf(pdfD) > 3 && tkD.some((x) => /^Bloque 1 de \d+: columnas /.test(x)) && tkD.filter((x) => x === "MOV-0000001").length >= Number((tkD.find((x) => /^Bloque 1 de \d+/.test(x)) ?? "").match(/de (\d+)/)?.[1] ?? 99) && tkD.filter((x) => x === "LOTE-000").length >= 2 && tkD.filter((x) => x === "Litro").length >= 2);
  cierto("KDX-R02-01 PDF DETALLE: cada bloque conserva cabeceras, y las columnas Entrada, Saldo físico, Costo unit., Costo total y Moneda costo se imprimen completas en algún bloque", ["Entrada", "Saldo físico", "Costo unit.", "Costo total", "Moneda costo", "Vinculado", "Propiedad"].every((h) => h.split(" ").every((w) => tkD.includes(w) || tkD.includes(h))) && tkD.filter((x) => x === "PYG").length >= N);

  const rBigR = await informe(eBig, { vista: "RESUMEN" }, { tamano: 200 });
  const tBigR = tablaKardex(rBigR);
  const pdfR = generarPdfTabla(tBigR);
  const tkR = tokensPdf(pdfR);

  igual("KDX-R02-01 el RESUMEN trae 70 combinaciones (un lote cada una) con los saldos exactos", [rBigR.resumen.length, rBigR.resumen[0].saldoFinal, rBigR.totales.grupos[0].resumen?.saldoFinal], [N, canon(cants[0]), totalBig]);
  cierto("KDX-R02-01 PDF RESUMEN real: entradas, saldo final y total TOTAL (suma exacta) de 20+ dígitos completos, sin recortes y con varias páginas", cants.every((c) => tkR.includes(es(c))) && tkR.includes(es(totalBig)) && truncado(tkR).length === 0 && paginasPdf(pdfR) >= 2);
  cierto("KDX-R02-01 PDF RESUMEN: la identificación (código, producto, unidad, depósito, lote, propiedad) se repite en cada bloque y el TOTAL lleva su unidad y propiedad", tkR.filter((x) => x === "LOTE-000").length >= 1 && tkR.filter((x) => x === "TOTAL").length >= 1 && tkR.filter((x) => x === "Litro").length >= 2);

  // filtros de fila: totales «fuera del filtro» y conciliación completa también sin recortes
  const rBigF = await informe(eBig, { vista: "RESUMEN", tipo: "SALIDA" }, { tamano: 200 });
  cierto("KDX-R02-01 PDF con filtro de fila: la CONCILIACIÓN COMPLETA y los totales fuera del filtro mantienen todas las cifras", (() => { const tk = tokensPdf(generarPdfTabla(tablaKardex(rBigF))); return tk.includes(es(totalBig)) && truncado(tk).length === 0 && tk.includes("CONCILIACIÓN") && tk.includes("COMPLETA"); })());

  // regresión de los otros cuatro informes: el modo exacto es opt-in (solo el Kardex lo activa); los demás PDF no cambian de comportamiento
  const fuentesOtros = ["export-valorizacion", "export-stock-critico", "export-stock-general", "export-lotes"].map((m) => leer(`lib/reportes/${m}.ts`));
  cierto("KDX-R02-01 los otros cuatro informes no activan el modo exacto (sin pdfAnclas) y el generador compartido lo trata como opción: sin la opción, un PDF es idéntico al generador anterior", fuentesOtros.every((x) => !/pdfAnclas/.test(x)) && /exacto\?: boolean/.test(leer("lib/reportes/pdf.ts")) && /t\.exacto/.test(leer("lib/reportes/pdf.ts")) && /\.\.\.\(t\.pdfAnclas \? \{ exacto: true/.test(leer("lib/reportes/export.ts")));

  const plano: Parameters<typeof generarPdfTabla>[0] = {
    titulo: "Plano", hoja: "H", nombreBase: "P", empresa: "E", generado: "g", sello: "s", filtros: ["f"], totalFilas: 2,
    columnas: [{ titulo: "Producto", peso: 10, tipo: "texto" }, { titulo: "Cantidad", peso: 4, tipo: "cantidad" }, { titulo: "Total", peso: 6, tipo: "dinero" }],
    filas: [["Arroz largo fino", "1234.5"], ["Azúcar", "0.0001"]].map((f, i) => [f[0], f[1], i === 0 ? "99.5" : null]), totales: [{ etiqueta: "TOTAL", celdas: ["", "1234.5001", "99.5"] }], colEtiquetaPdf: 0, notas: ["nota"],
  };
  const tkPlano = tokensPdf(generarPdfTabla(plano));

  igual("KDX-R02-01 regresión del generador compartido: un informe sin modo exacto sigue saliendo en un solo bloque, sin rótulos de bloque y con los mismos valores", [tkPlano.includes("1.234,5"), tkPlano.includes("0,0001"), tkPlano.includes("TOTAL"), tkPlano.some((x) => /^Bloque/.test(x)), paginasPdf(generarPdfTabla(plano))], [true, true, true, false, 1]);

  // XLSX del mismo libro: números ≤ 15 dígitos como número, más largos como TEXTO exacto (sin perder dígitos) — generación aprobada, no modificada
  const xlBig = leerHojaXlsx(generarXlsxTabla(tBigD));
  const baseB = 1 + 1 + 1 + tBigD.filtros.length + 1 + 1;
  const icB = (t: string) => tBigD.columnas.findIndex((c) => c.titulo === t);
  const colB = (i: number) => String.fromCharCode(65 + i);

  igual("KDX-R02-01 XLSX del mismo libro: la cantidad de 20 dígitos y el saldo acumulado son TEXTO exacto; el costo total también; la unidad es «Litro» en todas las filas", [
    xlBig.get(`${colB(icB("Entrada"))}${baseB + 1}`), xlBig.get(`${colB(icB("Saldo físico"))}${baseB + N}`), xlBig.get(`${colB(icB("Costo total"))}${baseB + 1}`), xlBig.get(`${colB(icB("Unidad"))}${baseB + 33}`),
  ], [{ tipo: "s", valor: canon(cants[0]) }, { tipo: "s", valor: canon(cants[69]) }, { tipo: "s", valor: costosT[0] }, { tipo: "s", valor: "Litro" }]);

  // ═══ KDX-R02-02 — unidad-base HISTÓRICA (NEX-052) ═══
  const HIST1 = [{ id: "h1", prod: PB, de: "Kilo", a: "Unidad", at: "2026-10-10T12:00:00Z" }];
  const eU: Escenario = {
    productos: [{ id: PB, codigo: "B-1", unidad: "Unidad" }], depositos: depos, historialUnidad: HIST1,
    lineas: [
      { num: L(1), tipo: "ENTRADA", freg: "2026-10-01", prod: PB, cant: "10", lote: "L1", d: DA, cu: "3", ct: "30", mon: "PYG" },
      { num: L(2), tipo: "SALIDA", freg: "2026-10-05", prod: PB, cant: "10", lote: "L1", o: DA, cu: "3", ct: "30", mon: "PYG" },
      { num: L(3), tipo: "ENTRADA", freg: "2026-10-11", prod: PB, cant: "7", lote: "L1", d: DA, cu: "4", ct: "28", mon: "PYG" },
    ],
  };
  const rU = await informe(eU);

  igual("KDX-R02-02 producto en KG con saldo cero que pasa a UNIDAD: los movimientos antiguos siguen en «Kilo» y el nuevo en «Unidad» (no se reetiqueta el pasado)", filas(rU).map((f) => [f.numero, f.unidad, f.saldoFisico]), [[L(1), "Kilo", "10"], [L(2), "Kilo", "0"], [L(3), "Unidad", "7"]]);
  igual("KDX-R02-02 dos grupos separados (Kilo y Unidad), sin sumar 10+7: Kilo cierra en 0 con 10 entradas y 10 salidas; Unidad en 7", rU.totales.grupos.map((g) => [g.unidad, g.filtrado.entradas, g.filtrado.salidas, g.saldoFinal.fisico, g.cuadra]), [["Kilo", "10", "10", "0", true], ["Unidad", "7", "0", "7", true]]);
  igual("KDX-R02-02 contrato de respuesta: fuenteUnidad = HISTORIAL y la nota de cobertura explica que las cantidades no se convierten", [rU.fuenteUnidad, rU.cobertura.some((x) => /Unidad de medida histórica/.test(x) && /NO se convierten/.test(x))], ["HISTORIAL", true]);
  igual("KDX-R02-02 conciliación con Stock coherente (el saldo real 7 pertenece a la unidad vigente) y la respuesta es válida para el cliente", [rU.conciliacion.conciliado, respuestaKardexValida(JSON.parse(JSON.stringify({ ...rU, permisos: { exportar: true } })))], [true, true]);

  const rUd = await informe(eU, { desde: "2026-10-11" });

  igual("KDX-R02-02 período posterior al cambio: el grupo Kilo conserva saldo inicial 0 y final 0 sin filas; el saldo inicial/final de Unidad pertenece a Unidad", [rUd.totales.grupos.map((g) => [g.unidad, g.filas, g.saldoInicial.fisico, g.saldoFinal.fisico]), filas(rUd).map((f) => [f.numero, f.unidad])], [[["Kilo", 0, "0", "0"], ["Unidad", 1, "0", "7"]], [[L(3), "Unidad"]]]);

  const rUr = await informe(eU, { vista: "RESUMEN" });

  igual("KDX-R02-02 vista Resumen: el mismo producto/depósito/lote sale en DOS filas (Kilo y Unidad) con claves distintas y totales por unidad", [rUr.resumen.map((x) => [x.unidad, x.saldoFinal]), new Set(rUr.resumen.map((x) => x.clave)).size, rUr.totales.grupos.map((g) => [g.unidad, g.resumen?.saldoFinal])], [[["Kilo", "0"], ["Unidad", "7"]], 2, [["Kilo", "0"], ["Unidad", "7"]]]);

  const tU = tablaKardex(rU);
  const xU = leerHojaXlsx(generarXlsxTabla(tU));
  const bU = 1 + 1 + 1 + tU.filtros.length + 1 + 1;
  const iU = (t: string) => tU.columnas.findIndex((c) => c.titulo === t);

  igual("KDX-R02-02 XLSX: misma unidad histórica por fila (Kilo, Kilo, Unidad), saldos numéricos y filas de totales por unidad", [
    xU.get(`${colB(iU("Unidad"))}${bU + 1}`), xU.get(`${colB(iU("Unidad"))}${bU + 2}`), xU.get(`${colB(iU("Unidad"))}${bU + 3}`), xU.get(`${colB(iU("Saldo físico"))}${bU + 3}`),
    tU.totales.map((x) => x.celdas[iU("Unidad")]).filter((x, i, a) => a.indexOf(x) === i),
  ], [{ tipo: "s", valor: "Kilo" }, { tipo: "s", valor: "Kilo" }, { tipo: "s", valor: "Unidad" }, { tipo: "n", valor: "7" }, ["Kilo", "Unidad"]]);

  const tkU = tokensPdf(generarPdfTabla(tU));

  cierto("KDX-R02-02 PDF: las filas muestran Kilo y Unidad según la época y hay totales para cada unidad", tkU.filter((x) => x === "Kilo").length >= 5 && tkU.filter((x) => x === "Unidad").length >= 3);

  // Estructura de la consulta con el historial presente
  const sqlU1 = (await (async () => { await informe(eU); return reg.consultas.find((c) => /FROM sal GROUP BY unidad/.test(c.sql))?.sql ?? ""; })());

  cierto("KDX-R02-02 la consulta usa el instante de registro del movimiento (creado_at) contra cambiado_at con desempate determinista (cambiado_at, id), cae a la unidad anterior de la primera alteración y a la del catálogo sin historial; la ventana del saldo se particiona también por unidad", /h\.cambiado_at <= ef\.creado_at ORDER BY h\.cambiado_at DESC, h\.id DESC LIMIT 1/.test(sqlU1) && /ORDER BY h\.cambiado_at ASC, h\.id ASC LIMIT 1/.test(sqlU1) && /pr\.unidad_medida_id\) AS unidad_id/.test(sqlU1) && /h\.empresa_id = \$1 AND h\.producto_id = ef\.producto_id/.test(sqlU1) && /ef\.propietario_id, uh\.unidad_id/.test(sqlU1));
  cierto("KDX-R02-02 la existencia de la tabla se verifica con to_regclass dentro de la MISMA transacción, antes de leer el libro", (await (async () => { await informe(eU); const i = reg.consultas.findIndex((c) => /to_regclass\('public\.producto_unidad_base_historial'\)/.test(c.sql)); const j = reg.consultas.findIndex((c) => /FROM sal GROUP BY unidad/.test(c.sql)); return i > 0 && j > i && reg.consultas[0].sql.startsWith("BEGIN") && reg.conexiones === 1; })()));

  // NEX-052 sin aplicar: la tabla no existe → nunca se consulta
  const eSin: Escenario = { ...eU, historialUnidad: undefined };
  const rSin = await informe(eSin);

  igual("KDX-R02-02 NEX-052 SIN aplicar: el Kardex funciona, usa la unidad del catálogo, lo informa (fuenteUnidad CATALOGO y nota) y ninguna consulta menciona la tabla ausente", [filas(rSin).map((f) => f.unidad), rSin.fuenteUnidad, rSin.cobertura.some((x) => /no existe en esta base/.test(x)), reg.consultas.filter((c) => /producto_unidad_base_historial/.test(c.sql) && !/to_regclass/.test(c.sql)).length, rSin.totales.grupos.length, "error" in (rSin as object)], [["Unidad", "Unidad", "Unidad"], "CATALOGO", true, 0, 1, false]);

  const rVacioH = await informe({ ...eU, historialUnidad: [] });

  igual("KDX-R02-02 tabla presente pero sin cambios: se mantiene la unidad actual y no se inventan eventos históricos", [filas(rVacioH).map((f) => f.unidad), rVacioH.fuenteUnidad, rVacioH.totales.grupos.length], [["Unidad", "Unidad", "Unidad"], "HISTORIAL", 1]);

  // varias trocas y límites temporales (== cambiado_at pertenece a la unidad NUEVA; un segundo antes, a la anterior)
  const HIST2 = [
    { id: "h2", prod: PB, de: "Unidad", a: "Litro", at: "2026-10-20T12:00:00Z" },
    { id: "h1", prod: PB, de: "Kilo", a: "Unidad", at: "2026-10-10T12:00:00Z" },
  ];
  const mov = (n: number, ts: string, cant: string, tipo = "ENTRADA", extra: Partial<Linea> = {}): Linea => ({ num: L(n), tipo, freg: ts.slice(0, 10), hreg: ts.slice(11, 19), ts, prod: PB, cant, lote: "L1", ...(tipo === "ENTRADA" ? { d: DA } : { o: DA }), cu: "1", ct: cant, mon: "PYG", ...extra });
  const eM: Escenario = {
    productos: [{ id: PB, codigo: "B-1", unidad: "Litro" }], depositos: depos, historialUnidad: HIST2,
    lineas: [
      mov(1, "2026-10-01T09:00:00Z", "5"), mov(2, "2026-10-02T09:00:00Z", "5", "SALIDA"), // antes de la primera troca: Kilo
      mov(3, "2026-10-10T11:59:59Z", "2"), mov(4, "2026-10-10T11:59:59Z", "2", "SALIDA", {}), // un segundo antes: Kilo
      mov(5, "2026-10-10T12:00:00Z", "3"), // exactamente en cambiado_at: Unidad
      mov(6, "2026-10-12T09:00:00Z", "3", "SALIDA"), // entre trocas: Unidad
      mov(7, "2026-10-20T11:59:59Z", "4"), mov(8, "2026-10-20T11:59:59Z", "4", "SALIDA"), // Unidad
      mov(9, "2026-10-20T12:00:00Z", "9"), // en la segunda troca: Litro
      mov(10, "2026-10-25T09:00:00Z", "1", "SALIDA"), // después de la última: Litro
    ],
  };
  const rM = await informe(eM);

  igual("KDX-R02-02 dos trocas: antes de la primera = Kilo, entre ambas = Unidad, después de la última = Litro; límites exactos (== cambiado_at → unidad nueva; 1 s antes → anterior)", filas(rM).map((f) => [f.numero, f.unidad]), [[L(1), "Kilo"], [L(2), "Kilo"], [L(3), "Kilo"], [L(4), "Kilo"], [L(5), "Unidad"], [L(6), "Unidad"], [L(7), "Unidad"], [L(8), "Unidad"], [L(9), "Litro"], [L(10), "Litro"]]);
  igual("KDX-R02-02 tres grupos independientes con saldos finales Kilo 0, Unidad 0, Litro 8; cantidades de épocas distintas jamás se suman (5+3+9 ≠ un total)", rM.totales.grupos.map((g) => [g.unidad, g.filtrado.entradas, g.filtrado.salidas, g.saldoFinal.fisico, g.cuadra]), [["Kilo", "7", "7", "0", true], ["Litro", "9", "1", "8", true], ["Unidad", "7", "7", "0", true]]);
  igual("KDX-R02-02 el saldo acumulado por fila se mantiene dentro de cada unidad (la época nueva empieza desde el saldo cero real)", filas(rM).map((f) => f.saldoFisico), ["5", "0", "2", "0", "3", "0", "4", "0", "9", "8"]);

  const rMh = await informe({ ...eM, historialUnidad: [...HIST2].reverse() });

  igual("KDX-R02-02 el resultado no depende del orden en que llega el historial (orden determinista por cambiado_at y id)", filas(rMh).map((f) => f.unidad), filas(rM).map((f) => f.unidad));

  // alteraciones con el MISMO cambiado_at: desempate por id (determinista)
  const AT = "2026-10-15T12:00:00Z";
  const eT: Escenario = {
    productos: [{ id: PB, codigo: "B-1", unidad: "Litro" }], depositos: depos,
    historialUnidad: [{ id: "b", prod: PB, de: "Unidad", a: "Litro", at: AT }, { id: "a", prod: PB, de: "Kilo", a: "Unidad", at: AT }],
    lineas: [mov(1, "2026-10-14T09:00:00Z", "1"), mov(2, "2026-10-14T09:30:00Z", "1", "SALIDA"), mov(3, AT, "2"), mov(4, "2026-10-16T09:00:00Z", "2", "SALIDA")],
  };
  const rT = await informe(eT);
  const rT2 = await informe({ ...eT, historialUnidad: [...eT.historialUnidad!].reverse() });

  igual("KDX-R02-02 dos alteraciones con el mismo instante: antes = anterior de la primera por (cambiado_at, id) → Kilo; en/después = nueva de la última → Litro; idéntico con otro orden de entrada", [filas(rT).map((f) => f.unidad), filas(rT2).map((f) => f.unidad)], [["Kilo", "Kilo", "Litro", "Litro"], ["Kilo", "Kilo", "Litro", "Litro"]]);

  // libro completo atravesando la época: depósito, lote, propiedad, propietario, anulación y transferencia
  const eC: Escenario = {
    productos: [{ id: PC, codigo: "C-1", unidad: "Unidad" }], depositos: depos, historialUnidad: [{ id: "h1", prod: PC, de: "Kilo", a: "Unidad", at: "2026-10-10T12:00:00Z" }],
    lineas: [
      { num: L(1), tipo: "ENTRADA", freg: "2026-10-01", prod: PC, cant: "5", lote: "L1", d: DA, cu: "2", ct: "10", mon: "PYG" },
      { num: L(2), tipo: "ENTRADA", freg: "2026-10-01", hreg: "11:00:00", prod: PC, cant: "3", lote: "L1", d: DA, prop: "TERCERO", propietario: OX },
      { num: L(3), tipo: "TRANSFERENCIA", origen: "TRANSFERENCIA", freg: "2026-10-03", prod: PC, cant: "2", lote: "L1", o: DA, d: DB, cu: "2", ct: "4", mon: "PYG" },
      { num: L(4), tipo: "SALIDA", freg: "2026-10-04", prod: PC, cant: "3", lote: "L1", o: DA, cu: "2", ct: "6", mon: "PYG" },
      { num: L(5), tipo: "SALIDA", freg: "2026-10-04", hreg: "11:00:00", prod: PC, cant: "2", lote: "L1", o: DB, cu: "2", ct: "4", mon: "PYG" },
      { num: L(6), tipo: "SALIDA", freg: "2026-10-05", prod: PC, cant: "3", lote: "L1", o: DA, prop: "TERCERO", propietario: OX },
      { num: L(7), tipo: "ENTRADA", estado: "ANULADO", freg: "2026-10-06", prod: PC, cant: "1", lote: "L1", d: DA, cu: "2", ct: "2", mon: "PYG" },
      { num: L(8), tipo: "SALIDA", origen: "ANULACION", freg: "2026-10-07", prod: PC, cant: "1", lote: "L1", o: DA, anulaA: L(7), cu: "2", ct: "2", mon: "PYG" },
      { num: L(9), tipo: "ENTRADA", freg: "2026-10-11", prod: PC, cant: "4", lote: "L2", d: DA, cu: "5", ct: "20", mon: "PYG" },
      { num: L(10), tipo: "ENTRADA", freg: "2026-10-11", hreg: "11:00:00", prod: PC, cant: "6", lote: "L2", d: DA, prop: "TERCERO", propietario: OX },
      { num: L(11), tipo: "TRANSFERENCIA", origen: "TRANSFERENCIA", freg: "2026-10-12", prod: PC, cant: "1", lote: "L2", o: DA, d: DB, cu: "5", ct: "5", mon: "PYG" },
    ],
  };
  const rC = await informe(eC);

  igual("KDX-R02-02 libro completo atravesando la época: cuatro grupos (Kilo y Unidad × propio y terceros del propietario X) con saldos propios de cada uno", rC.totales.grupos.map((g) => [g.unidad, g.propiedad, g.filtrado.entradas, g.filtrado.salidas, g.filtrado.transfEntradas, g.filtrado.transfSalidas, g.completo.anulaciones, g.saldoFinal.fisico, g.cuadra]), [
    ["Kilo", "PROPIO", "6", "6", "2", "2", 1, "0", true], ["Kilo", "TERCERO", "3", "3", "0", "0", 0, "0", true], ["Unidad", "PROPIO", "4", "0", "1", "1", 0, "4", true], ["Unidad", "TERCERO", "6", "0", "0", "0", 0, "6", true],
  ]);
  igual("KDX-R02-02 las dos puntas de cada transferencia llevan la misma unidad histórica; el movimiento anulado y su contramovimiento comparten la unidad de su época", [
    filas(rC).filter((f) => f.numero === L(3) || f.numero === L(11)).map((f) => [f.numero, f.efecto, f.deposito, f.unidad]), filas(rC).filter((f) => f.numero === L(7) || f.numero === L(8)).map((f) => [f.numero, f.estado, f.unidad, f.vinculoTipo]),
  ], [[[L(3), "SALIDA", "Central", "Kilo"], [L(3), "ENTRADA", "Norte", "Kilo"], [L(11), "SALIDA", "Central", "Unidad"], [L(11), "ENTRADA", "Norte", "Unidad"]], [[L(7), "ANULADO", "Kilo", "ANULADO_POR"], [L(8), "REGISTRADO", "Kilo", "ANULA_A"]]]);
  igual("KDX-R02-02 conciliación con Stock sobre el libro completo: coherente y sin divergencias (el saldo vivo pertenece a la unidad vigente)", [rC.conciliacion.conciliado, rC.conciliacion.divergentes, rC.totales.cuadra], [true, 0, true]);
  igual("KDX-R02-02 propiedad y propietario siguen siendo dimensiones independientes de la unidad", rC.totales.grupos.filter((g) => g.propiedad === "TERCERO").map((g) => [g.unidad, g.propietario]), [["Kilo", `Tercero ${OX.slice(0, 8)}`], ["Unidad", `Tercero ${OX.slice(0, 8)}`]]);

  const rCr = await informe(eC, { vista: "RESUMEN" });

  igual("KDX-R02-02 Resumen del mismo libro: filas por unidad histórica y total del resumen por grupo igual a la suma de sus filas", [rCr.resumen.map((x) => [x.unidad, x.propiedad, x.lote, x.saldoFinal]).filter((x) => x[0] === "Unidad"), rCr.totales.grupos.every((g) => g.resumen !== null && g.resumen.saldoFinal === sumarDecimales(rCr.resumen.filter((x) => x.unidad === g.unidad && x.propiedad === g.propiedad && x.propietario === g.propietario).map((x) => x.saldoFinal)))], [[["Unidad", "PROPIO", "L2", "3"], ["Unidad", "TERCERO", "L2", "6"], ["Unidad", "PROPIO", "L2", "1"]], true]);

  // filtros de lote/período con unidad histórica: el período posterior solo ve la unidad vigente de ese período
  const rCp = await informe(eC, { desde: "2026-10-11", hasta: "2026-10-12" });

  igual("KDX-R02-02 período posterior al cambio: las filas son solo de Unidad; los grupos Kilo conservan saldo inicial = final = 0 (nada se reatribuye a Unidad)", [filas(rCp).map((f) => f.unidad).filter((x, i, a) => a.indexOf(x) === i), rCp.totales.grupos.filter((g) => g.unidad === "Kilo").map((g) => [g.propiedad, g.saldoInicial.fisico, g.saldoFinal.fisico, g.filas])], [["Unidad"], [["PROPIO", "0", "0", 0], ["TERCERO", "0", "0", 0]]]);
  cierto("KDX-R02-02 la API/validador acepta el contrato nuevo y rechaza una fuenteUnidad inválida", respuestaKardexValida(JSON.parse(JSON.stringify({ ...rC, permisos: { exportar: false } }))) && !respuestaKardexValida(JSON.parse(JSON.stringify({ ...rC, fuenteUnidad: "OTRA", permisos: { exportar: false } }))));
  cierto("KDX-R02-02 no se tocaron NEX-052 ni el motor: el servicio solo LEE el historial (SELECT), sin escribir ni convertir cantidades", !/\b(INSERT|UPDATE|DELETE)\b/.test(leer("lib/reportes/kardex.ts")) && !/producto_cambiar_unidad_base/.test(leer("lib/reportes/kardex.ts")) && !/convert|factor/i.test(leer("lib/reportes/kardex.ts").replace(/NO se convierten|no se convierten/g, "")));

  const quitar = (o: object, k: string): Record<string, unknown> => { const c = { ...o } as Record<string, unknown>; delete c[k]; return c; };
  // ═══ KDX-R03-01 — la identidad del grupo es unidad_id (UUID), no el nombre de la unidad ═══
  // Dos unidades DISTINTAS con la misma descripción «Metro» (p. ej. la del catálogo con SIFEN 108/MT y otra con vínculo 87 o sin vínculo fiscal): jamás se suman.
  const M1 = "5a000000-0000-4000-8000-0000000000a1", M2 = "5a000000-0000-4000-8000-0000000000b2";
  const eN: Escenario = {
    productos: [{ id: PA, codigo: "A-1", unidad: "Metro", unidadId: M1 }, { id: PD, codigo: "D-1", unidad: "Metro", unidadId: M2 }, { id: PB, codigo: "B-1", unidad: "Kilo" }], depositos: depos,
    lineas: [
      { num: L(1), tipo: "ENTRADA", freg: "2026-10-01", prod: PA, cant: "5", lote: "L1", d: DA, cu: "2", ct: "10", mon: "PYG" },
      { num: L(2), tipo: "ENTRADA", freg: "2026-10-02", prod: PD, cant: "7", lote: "L1", d: DA, cu: "3", ct: "21", mon: "PYG" },
      { num: L(3), tipo: "SALIDA", freg: "2026-10-03", prod: PA, cant: "1", lote: "L1", o: DA, cu: "2", ct: "2", mon: "PYG" },
      { num: L(4), tipo: "ENTRADA", freg: "2026-10-04", prod: PD, cant: "2", lote: "L1", d: DA, prop: "TERCERO", propietario: OX },
      { num: L(5), tipo: "ENTRADA", freg: "2026-10-05", prod: PB, cant: "9", lote: "L1", d: DA, cu: "1", ct: "9", mon: "PYG" },
    ],
  };
  const rN = await informe(eN);
  const gN = (id: string, prop = "PROPIO") => rN.totales.grupos.find((g) => g.unidadId === id && g.propiedad === prop)!;

  igual("KDX-R03-01 dos unidades con el MISMO nombre y UUID distinto → grupos separados: Metro(M1) cierra en 4 (5−1) y Metro(M2) en 7; nunca 11", [rN.totales.grupos.length, gN(M1).saldoFinal.fisico, gN(M2).saldoFinal.fisico, gN(M1).filtrado.entradas, gN(M2).filtrado.entradas, gN(M1).filtrado.salidas], [4, "4", "7", "5", "7", "1"]);
  igual("KDX-R03-01 cada grupo transporta su identificador y el nombre queda como dato visual; los terceros de Metro(M2) son otro grupo y la unidad Kilo sigue aparte", rN.totales.grupos.map((g) => [g.unidad, g.unidadId, g.propiedad, g.saldoFinal.fisico]), [["Kilo", "uid-Kilo", "PROPIO", "9"], ["Metro", M1, "PROPIO", "4"], ["Metro", M2, "PROPIO", "7"], ["Metro", M2, "TERCERO", "2"]]);
  igual("KDX-R03-01 los grupos de igual nombre se rotulan con el identificador para distinguirlos (tela, Excel y PDF); Kilo no lleva sufijo", [...etiquetasUnidad(rN.totales.grupos).entries()].map(([id, e]) => [id, e.includes("[id ")]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))), [["5a000000-0000-4000-8000-0000000000a1", true], ["5a000000-0000-4000-8000-0000000000b2", true], ["uid-Kilo", false]]);
  igual("KDX-R03-01 DETALLE: cada fila lleva su unidadId y su saldo acumulado se mantiene dentro de su unidad", filas(rN).map((f) => [f.numero, f.unidad, f.unidadId, f.saldoFisico]), [[L(1), "Metro", M1, "5"], [L(2), "Metro", M2, "7"], [L(3), "Metro", M1, "4"], [L(4), "Metro", M2, "2"], [L(5), "Kilo", "uid-Kilo", "9"]]);

  const sqlN = reg.consultas.find((c) => /FROM sal GROUP BY unidad/.test(c.sql))?.sql ?? "";

  cierto("KDX-R03-01 la consulta de totales agrupa y ordena por unidad_id (nunca por el nombre), y el nombre solo sale como max(unidad) visual", /GROUP BY unidad_id, propiedad, propietario_id/.test(sqlN) && !/GROUP BY unidad,/.test(sqlN) && /max\(unidad\) AS unidad/.test(sqlN) && /unidad_id::text AS unidad_id/.test(sqlN));

  const rNr = await informe(eN, { vista: "RESUMEN" });
  const sqlNr = reg.consultas.filter((c) => /FROM gf GROUP BY/.test(c.sql)).map((c) => c.sql).join(" ");

  igual("KDX-R03-01 RESUMEN: filas y totales separados por UUID (Metro M1: 4, Metro M2: 7, terceros M2: 2) y el total del resumen es la suma de SUS filas", [
    rNr.resumen.map((x) => [x.productoCodigo, x.unidadId, x.saldoFinal]), rNr.totales.grupos.map((g) => [g.unidadId, g.propiedad, g.resumen?.saldoFinal, g.resumen?.filas]),
  ], [[["A-1", M1, "4"], ["B-1", "uid-Kilo", "9"], ["D-1", M2, "7"], ["D-1", M2, "2"]], [["uid-Kilo", "PROPIO", "9", 1], [M1, "PROPIO", "4", 1], [M2, "PROPIO", "7", 1], [M2, "TERCERO", "2", 1]]]);
  cierto("KDX-R03-01 el resumen agrupa por unidad_id en SQL y la clave de cada fila incluye el identificador (dos Metro del mismo producto no colisionan)", /GROUP BY unidad_id, propiedad, propietario_id/.test(sqlNr) && !/GROUP BY unidad,/.test(sqlNr) && /coalesce\(gf\.unidad_id::text, ''\) AS clave/.test(leer("lib/reportes/kardex.ts")) && new Set(rNr.resumen.map((x) => x.clave)).size === rNr.resumen.length);

  // XLSX y PDF: mismos resultados que la tela (grupos separados, sufijo de id, valores intactos)
  const tN = tablaKardex(rN);
  const xN = leerHojaXlsx(generarXlsxTabla(tN));
  const bN = 1 + 1 + 1 + tN.filtros.length + 1 + 1;
  const iN = (t: string) => tN.columnas.findIndex((c) => c.titulo === t);
  const colN = (i: number) => String.fromCharCode(65 + i);
  const rotulosUnidad = tN.totales.map((x) => String(x.celdas[iN("Unidad")])).filter((x, i, a) => a.indexOf(x) === i);

  igual("KDX-R03-01 XLSX: filas con su unidad, saldos numéricos, y totales con un bloque por UUID (los dos «Metro» se distinguen por el sufijo del identificador)", [
    xN.get(`${colN(iN("Unidad"))}${bN + 1}`), xN.get(`${colN(iN("Saldo físico"))}${bN + 3}`), xN.get(`${colN(iN("Saldo físico"))}${bN + 2}`), rotulosUnidad,
  ], [{ tipo: "s", valor: `Metro [id ${M1.slice(-8)}]` }, { tipo: "n", valor: "4" }, { tipo: "n", valor: "7" }, ["Kilo", `Metro [id ${M1.slice(-8)}]`, `Metro [id ${M2.slice(-8)}]`]]);

  const tkN = tokensPdf(generarPdfTabla(tN));

  cierto("KDX-R03-01 PDF: los saldos 4 y 7 por separado, ambos rótulos de Metro con su identificador y ningún total 11", tkN.includes("4") && tkN.includes("7") && tkN.some((x) => x.includes(`[id ${M1.slice(-8)}]`)) && tkN.some((x) => x.includes(`[id ${M2.slice(-8)}]`)) && !tkN.includes("11") && truncado(tkN).length === 0);
  cierto("KDX-R03-01 Excel/PDF del RESUMEN también separan por UUID", (() => { const t = tablaKardex(rNr); return t.totales.some((x) => String(x.celdas[t.columnas.findIndex((c) => c.titulo === "Unidad")]).includes(`[id ${M1.slice(-8)}]`)) && tokensPdf(generarPdfTabla(t)).some((x) => x.includes(`[id ${M2.slice(-8)}]`)); })());

  // Cambio histórico de unidad con nombres repetidos: Kilo → Metro(M1) sigue funcionando y no se mezcla con el otro Metro
  const eNh: Escenario = {
    productos: [{ id: PA, codigo: "A-1", unidad: "Metro", unidadId: M1 }, { id: PD, codigo: "D-1", unidad: "Metro", unidadId: M2 }], depositos: depos,
    historialUnidad: [{ id: "h1", prod: PA, de: "Kilo", a: "Metro", deId: "uid-K", aId: M1, at: "2026-10-10T12:00:00Z" }],
    lineas: [
      { num: L(1), tipo: "ENTRADA", freg: "2026-10-01", prod: PA, cant: "3", lote: "L1", d: DA, cu: "1", ct: "3", mon: "PYG" },
      { num: L(2), tipo: "SALIDA", freg: "2026-10-02", prod: PA, cant: "3", lote: "L1", o: DA, cu: "1", ct: "3", mon: "PYG" },
      { num: L(3), tipo: "ENTRADA", freg: "2026-10-11", prod: PA, cant: "6", lote: "L1", d: DA, cu: "1", ct: "6", mon: "PYG" },
      { num: L(4), tipo: "ENTRADA", freg: "2026-10-11", hreg: "11:00:00", prod: PD, cant: "8", lote: "L1", d: DA, cu: "1", ct: "8", mon: "PYG" },
    ],
  };
  const rNh = await informe(eNh);

  igual("KDX-R03-01 con historial NEX-052: A-1 pasa de Kilo a Metro(M1); el Metro de D-1 (M2) es otro grupo; ninguna cantidad se mezcla", [
    filas(rNh).map((f) => [f.numero, f.unidad, f.unidadId]), rNh.totales.grupos.map((g) => [g.unidad, g.unidadId, g.saldoFinal.fisico]),
  ], [[[L(1), "Kilo", "uid-K"], [L(2), "Kilo", "uid-K"], [L(3), "Metro", M1], [L(4), "Metro", M2]], [["Kilo", "uid-K", "0"], ["Metro", M1, "6"], ["Metro", M2, "8"]]]);

  // Unidad sin vínculo fiscal / códigos SIFEN: el Kardex no usa códigos fiscales como identidad (UUID ≠ código 108 ≠ código 87)
  const eSv: Escenario = { productos: [{ id: PA, codigo: "A-1", unidad: "", unidadId: "" }], depositos: depos, lineas: [{ num: L(1), tipo: "ENTRADA", freg: "2026-10-01", prod: PA, cant: "2", d: DA }] };
  const rSv = await informe(eSv);
  const fuenteKp = leer("lib/reportes/kardex-plan.ts"), fuenteKs = leer("lib/reportes/kardex.ts");

  igual("KDX-R03-01 unidad sin identificador ni vínculo fiscal: grupo propio con unidadId vacío rotulado «Sin unidad» (no se inventa un código SIFEN)", [rSv.totales.grupos.map((g) => [g.unidad, g.unidadId, g.saldoFinal.fisico]), rSv.totales.grupos.map((g) => g.clave)], [[["", "", "2"]], ["|PROPIO|"]]);
  igual("KDX-R03-01 la identidad es el UUID: igual nombre ≠ igual clave; código fiscal no participa (108 y 87 jamás se usan como clave)", [claveGrupo(M1, "PROPIO", null) === claveGrupo(M2, "PROPIO", null), claveGrupo(M1, "PROPIO", null) === claveGrupo(M1, "PROPIO", null), claveGrupo("108", "PROPIO", null) === claveGrupo("87", "PROPIO", null), claveGrupo(null, "PROPIO", null)], [false, true, false, "|PROPIO|"]);
  cierto("KDX-R03-01 el Kardex no consulta ni deriva identidad de unidades_medida_sifen / unidad_sifen_codigo; no hay códigos 108/87 en el servicio ni en el plan", !/unidad_sifen_codigo|unidades_medida_sifen|\b108\b|\b87\b/.test(fuenteKs + fuenteKp));
  cierto("KDX-R03-01 el validador exige unidadId en filas, resumen y grupos (un contrato sin identificador se rechaza)", respuestaKardexValida(JSON.parse(JSON.stringify({ ...rN, permisos: { exportar: true } }))) && !respuestaKardexValida(JSON.parse(JSON.stringify({ ...rN, totales: { ...rN.totales, grupos: rN.totales.grupos.map((g) => quitar(g, "unidadId")) }, permisos: { exportar: true } }))) && !respuestaKardexValida(JSON.parse(JSON.stringify({ ...rN, filas: rN.filas.map((x) => quitar(x, "unidadId")), permisos: { exportar: true } }))));

  // ═══ KDX-R04-01 / R04-02 — rendimiento lineal y rótulos de unidad inequívocos en filas, totales, Excel y PDF ═══
  const G = 10000;
  const tot = Array.from({ length: G }, (_, i) => ({ unidad: "Metro", unidad_id: M1, propiedad: "TERCERO", propietario_id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, filas: 1, i_disp: "0", i_res: "0", i_cuar: "0", f_disp: "1", f_res: "0", f_cuar: "0" }));
  const gMuchos = construirGrupos(tot, null);

  igual("KDX-R04-01 10.000 grupos de la MISMA unidad (mismo UUID) con propietarios distintos: 10.000 grupos y ninguna unidad ambigua (rótulo simple «Metro»)", [gMuchos.length, new Set(gMuchos.map((g) => g.unidadId)).size, [...etiquetasUnidad(gMuchos).entries()]], [G, 1, [[M1, "Metro"]]]);

  let lecturas = 0;
  const contados = gMuchos.map((g) => ({ get unidad() { lecturas += 1; return g.unidad; }, unidadId: g.unidadId }));

  etiquetasUnidad(contados);
  igual("KDX-R04-01 construcción lineal: cada grupo se lee UNA sola vez (no O(G²): con 10.000 grupos serían ~10⁸ lecturas)", lecturas, G);

  const mezcla = [
    ...Array.from({ length: 5000 }, (_, i) => ({ unidad: "Metro", unidadId: i % 2 === 0 ? M1 : M2 })), // dos UUID homónimos repartidos en miles de grupos
    ...Array.from({ length: 5000 }, (_, i) => ({ unidad: `Unidad ${i}`, unidadId: `u-${i}` })), // 5.000 unidades de nombre único
  ];
  lecturas = 0;

  const etMezcla = etiquetasUnidad(mezcla.map((g) => ({ get unidad() { lecturas += 1; return g.unidad; }, unidadId: g.unidadId })));

  igual("KDX-R04-01 mezcla de 10.000 grupos: solo las dos Metro (UUID distintos) llevan sufijo, las 5.000 unidades de nombre único no, y sigue siendo una lectura por grupo", [etMezcla.size, etMezcla.get(M1), etMezcla.get(M2), etMezcla.get("u-17"), lecturas], [5002, `Metro [id ${M1.slice(-8)}]`, `Metro [id ${M2.slice(-8)}]`, "Unidad 17", 10000]);

  // UUID distintos con los MISMOS últimos 8 caracteres (y más): el rótulo se amplía hasta ser único; el UUID completo en el peor caso
  const A8 = "5a000000-0000-4000-8000-0000000000a1", B8 = "6b000000-0000-4000-8000-0000000000a1", C12 = "5a000000-0000-4000-8000-1000000000a1";
  const etA = etiquetasUnidad([{ unidad: "Metro", unidadId: A8 }, { unidad: "Metro", unidadId: B8 }]);
  const etC = etiquetasUnidad([{ unidad: "Metro", unidadId: A8 }, { unidad: "Metro", unidadId: C12 }]);

  igual("KDX-R04-02 dos UUID con los mismos últimos 8 caracteres NO se rotulan con el mismo sufijo: se amplía hasta distinguirlos (UUID completo si difieren al inicio; 12 caracteres si difieren en el medio)", [etA.get(A8), etA.get(B8), etA.get(A8) !== etA.get(B8), etC.get(A8), etC.get(C12)], [`Metro [id ${A8.slice(-35)}]`, `Metro [id ${B8.slice(-35)}]`, true, "Metro [id 0000000000a1]", "Metro [id 1000000000a1]"]);
  igual("KDX-R04-02 sin nombre: «Sin unidad»; dos sin nombre con UUID distinto también se distinguen; una unidad de nombre único conserva su nombre", [
    [...etiquetasUnidad([{ unidad: "", unidadId: "" }]).values()], [...etiquetasUnidad([{ unidad: "", unidadId: "" }, { unidad: "", unidadId: M1 }]).values()], [...etiquetasUnidad([{ unidad: "Kilo", unidadId: "k" }]).values()],
  ], [["Sin unidad"], ["Sin unidad [id sin id]", `Sin unidad [id ${M1.slice(-8)}]`], ["Kilo"]]);

  // Filas, totales, Excel y PDF en DETALLE y RESUMEN con homónimas (eN: Metro M1 y M2, propio y terceros, además de Kilo)
  const etN = etiquetasUnidad(rN.totales.grupos);
  const l1 = `Metro [id ${M1.slice(-8)}]`, l2 = `Metro [id ${M2.slice(-8)}]`;

  igual("KDX-R04-02 API intacta: unidad y unidadId originales sin sufijo; el rótulo es derivado y común (Metro M1 / Metro M2 / Kilo)", [filas(rN).map((f) => [f.unidad, f.unidadId]).slice(0, 2), [etN.get(M1), etN.get(M2), etN.get("uid-Kilo")]], [[["Metro", M1], ["Metro", M2]], [l1, l2, "Kilo"]]);

  const tD = tablaKardex(rN);
  const xD = leerHojaXlsx(generarXlsxTabla(tD));
  const bD = 1 + 1 + 1 + tD.filtros.length + 1 + 1;
  const iD = (t: string) => tD.columnas.findIndex((c) => c.titulo === t);
  const cD = (n: number) => String.fromCharCode(65 + iD("Unidad")) + (bD + n);

  igual("KDX-R04-02 DETALLE: cada FILA (Excel) lleva el rótulo desambiguado; también las filas de totales; los valores numéricos no cambian", [
    [1, 2, 3, 4, 5].map((n) => xD.get(cD(n))?.valor), [...new Set(tD.totales.map((x) => String(x.celdas[iD("Unidad")])))], xD.get(`${String.fromCharCode(65 + iD("Saldo físico"))}${bD + 3}`),
  ], [[l1, l2, l1, l2, "Kilo"], ["Kilo", l1, l2], { tipo: "n", valor: "4" }]);

  const tkD2 = tokensPdf(generarPdfTabla(tD));

  cierto("KDX-R04-02 DETALLE PDF: los rótulos desambiguados aparecen en filas y totales (junto con las columnas ancla) y ningún valor queda recortado", tkD2.filter((x) => x === l1).length >= 4 && tkD2.filter((x) => x === l2).length >= 4 && tkD2.includes("Kilo") && truncado(tkD2).length === 0);

  const tR = tablaKardex(rNr);
  const xR = leerHojaXlsx(generarXlsxTabla(tR));
  const bR = 1 + 1 + 1 + tR.filtros.length + 1 + 1;
  const iR = (t: string) => tR.columnas.findIndex((c) => c.titulo === t);
  const tkR2 = tokensPdf(generarPdfTabla(tR));

  igual("KDX-R04-02 RESUMEN: filas (Excel) y totales con el rótulo desambiguado y saldos intactos", [
    [1, 2, 3, 4].map((n) => xR.get(`${String.fromCharCode(65 + iR("Unidad"))}${bR + n}`)?.valor), [...new Set(tR.totales.map((x) => String(x.celdas[iR("Unidad")])))], xR.get(`${String.fromCharCode(65 + iR("Saldo final"))}${bR + 1}`),
  ], [[l1, "Kilo", l2, l2], ["Kilo", l1, l2], { tipo: "n", valor: "4" }]);
  cierto("KDX-R04-02 RESUMEN PDF: rótulos desambiguados en filas y totales", tkR2.filter((x) => x === l1).length >= 2 && tkR2.filter((x) => x === l2).length >= 3);

  // Homónima FUERA de la página visible: la fila visible sigue desambiguada porque la ambigüedad sale de los totales de TODA la respuesta
  const rPag = await informe(eN, {}, { pagina: 1, tamano: 1 });
  const tPag = tablaKardex(rPag);
  const xPag = leerHojaXlsx(generarXlsxTabla(tPag));
  const bPag = 1 + 1 + 1 + tPag.filtros.length + 1 + 1;

  igual("KDX-R04-02 página 1 de 1 fila (solo Metro M1 visible; Metro M2 está en otra página y en los totales): la fila exportada/visible lleva igualmente el rótulo con identificador", [rPag.filas.map((f) => f.unidad), rPag.pagina.totalFilas, xPag.get(`${String.fromCharCode(65 + tPag.columnas.findIndex((c) => c.titulo === "Unidad"))}${bPag + 1}`)?.valor], [["Metro"], 5, l1]);

  // La fila de tela usa el mismo derivado: la página usa nombreUnidad/etiquetasUnidad sobre totales.grupos y nunca el nombre bruto en celdas
  const fuentePag = leer("app/(private)/reportes/kardex/page.tsx");

  cierto("KDX-R04-02 pantalla: rótulo derivado de totales.grupos de la respuesta vigente y usado en DETALLE, detalle expandido, RESUMEN y totales (sin f.unidad directo)", /etiquetasUnidad\(actual\?\.totales\.grupos \?\? \[\]\)/.test(fuentePag) && (fuentePag.match(/nombreUnidad\(et, f\)/g) ?? []).length >= 3 && /etiquetaGrupo\(g, et\)/.test(fuentePag) && !/\{f\.unidad/.test(fuentePag));
  cierto("KDX-R04-01 el cálculo de ambigüedad no depende de las filas visibles ni de búsquedas anidadas: Map nombre → Set de UUID, sin .some/.find/.filter dentro de bucles sobre grupos", /new Map<string, Set<string>>\(\)/.test(leer("lib/reportes/kardex-plan.ts")) && !/grupos\.some\(/.test(leer("lib/reportes/kardex-plan.ts")) && !/\bambigua\b/.test(leer("lib/reportes/kardex-plan.ts") + leer("types/reportes.ts")));

  // Troca histórica NEX-052 con nombres repetidos: filas y totales con el rótulo correcto
  const rNh2 = await informe(eNh);
  const tH = tablaKardex(rNh2);

  igual("KDX-R04-02 con historial NEX-052 (A-1: Kilo → Metro M1; D-1: Metro M2): Kilo conserva su nombre, ambos Metro quedan rotulados en filas y totales", [tH.filas.map((f) => f[tH.columnas.findIndex((c) => c.titulo === "Unidad")]), [...new Set(tH.totales.map((x) => String(x.celdas[tH.columnas.findIndex((c) => c.titulo === "Unidad")])))]], [["Kilo", "Kilo", l1, l2], ["Kilo", l1, l2]]);

  return fallos;
}
