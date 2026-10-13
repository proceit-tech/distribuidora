/**
 * Kardex — reglas PURAS (sin base de datos ni React): agrupación de totales por unidad × propiedad × propietario, aritmética decimal EXACTA (texto numeric, BigInt),
 * cuadre exacto (sin tolerancias), igualdad de filtros campo a campo y validación estructural de la respuesta de la API.
 */
import { compararDecimales, sumarDecimales } from "@/lib/inventario/decimal";
import type { KardexFiltros, KardexGrupo, KardexMovimientos, KardexResumenTotales, KardexSaldos } from "@/types/reportes";

type Fila = Record<string, unknown>;

const str = (v: unknown, def = "0"): string => (v === null || v === undefined ? def : String(v));

export const negarDecimal = (v: string): string => (v.startsWith("-") ? v.slice(1) : compararDecimales(v, "0") === 0 ? "0" : `-${v}`);
export const esCeroDecimal = (v: string): boolean => compararDecimales(v, "0") === 0;

/** Variación física neta: entradas − salidas + transferencias entrantes − transferencias salientes. */
export const netoMovimientos = (m: Pick<KardexMovimientos, "entradas" | "salidas" | "transfEntradas" | "transfSalidas">): string =>
  sumarDecimales([m.entradas, negarDecimal(m.salidas), m.transfEntradas, negarDecimal(m.transfSalidas)]);

/** Propietario de una línea: vacío para stock propio; en terceros, el identificador del propietario cuando existe (no hay tabla de propietarios en V1). */
export function textoPropietario(propiedad: string, propietarioId: string | null | undefined): string {
  if (propiedad !== "TERCERO") return "";

  return propietarioId ? `Tercero ${propietarioId.slice(0, 8)}` : "Tercero (propietario no registrado)";
}

/** Identidad física del grupo: unidad_id (UUID) × propiedad × propietario. El nombre/representación de la unidad NO es identidad. */
export const claveGrupo = (unidadId: string | null | undefined, propiedad: string, propietarioId: string | null | undefined): string => `${unidadId ?? ""}|${propiedad}|${propietarioId ?? ""}`;

const saldos = (d: unknown, r: unknown, c: unknown): KardexSaldos => ({ disponible: str(d), reservado: str(r), cuarentena: str(c), fisico: sumarDecimales([str(d), str(r), str(c)]) });
const movs = (t: Fila, px: string): KardexMovimientos => ({
  entradas: str(t[`${px}_ent`]), salidas: str(t[`${px}_sal`]), transfEntradas: str(t[`${px}_tent`]), transfSalidas: str(t[`${px}_tsal`]),
  cambiosEstado: Number(t[`${px}_cam`] ?? 0), anulaciones: Number(t[`${px}_anu`] ?? 0),
});

/** Cuadre EXACTO (decimales): saldo inicial + movimientos del período = saldo final, y filtrados + fuera del filtro = completo. */
export function cuadreExacto(g: Pick<KardexGrupo, "saldoInicial" | "saldoFinal" | "filtrado" | "fueraDelFiltro" | "completo">): boolean {
  return compararDecimales(sumarDecimales([g.saldoInicial.fisico, netoMovimientos(g.completo)]), g.saldoFinal.fisico) === 0 &&
    compararDecimales(sumarDecimales([netoMovimientos(g.filtrado), netoMovimientos(g.fueraDelFiltro)]), netoMovimientos(g.completo)) === 0;
}

const resumenVacio: KardexResumenTotales = { filas: 0, saldoInicial: "0", entradas: "0", salidas: "0", transfEntradas: "0", transfSalidas: "0", fueraDelFiltro: "0", saldoFinal: "0", finalDisponible: "0", finalReservado: "0", finalCuarentena: "0" };

/**
 * Un grupo por unidad × propiedad × propietario (nunca se suman unidades ni propietarios distintos). `tot` trae una fila por grupo con las sumas del libro;
 * `res` (solo vista RESUMEN) trae las sumas de las filas mostradas por grupo.
 */
export function construirGrupos(tot: Fila[], res: Fila[] | null): KardexGrupo[] {
  const porClave = new Map((res ?? []).map((x) => [claveGrupo(x.unidad_id as string | null, str(x.propiedad, "PROPIO"), x.propietario_id as string | null), x]));

  const grupos = tot
    .map((t): KardexGrupo => {
      const unidad = str(t.unidad, ""), propiedad = str(t.propiedad, "PROPIO") as KardexGrupo["propiedad"];
      const unidadId = str(t.unidad_id, "");
      const clave = claveGrupo(unidadId, propiedad, t.propietario_id as string | null);
      const r = porClave.get(clave);
      const base = {
        clave, unidad, unidadId, ambigua: false, propiedad, propietario: textoPropietario(propiedad, t.propietario_id as string | null), filas: Number(t.filas ?? 0),
        saldoInicial: saldos(t.i_disp, t.i_res, t.i_cuar), saldoFinal: saldos(t.f_disp, t.f_res, t.f_cuar),
        filtrado: movs(t, "f"), fueraDelFiltro: movs(t, "o"), completo: movs(t, "c"),
      };

      return {
        ...base,
        cuadra: cuadreExacto(base),
        resumen: res === null ? null : r
          ? { filas: Number(r.n ?? 0), saldoInicial: str(r.inicial), entradas: str(r.entradas), salidas: str(r.salidas), transfEntradas: str(r.t_ent), transfSalidas: str(r.t_sal), fueraDelFiltro: str(r.fuera), saldoFinal: str(r.final), finalDisponible: str(r.f_disp), finalReservado: str(r.f_res), finalCuarentena: str(r.f_cuar) }
          : resumenVacio,
      };
    })
    .sort((a, b) => a.unidad.localeCompare(b.unidad, "es") || a.unidadId.localeCompare(b.unidadId) || a.propiedad.localeCompare(b.propiedad) || a.propietario.localeCompare(b.propietario));

  // Dos unidades distintas (UUID) con la misma descripción: grupos separados y rotulados con un sufijo del identificador.
  for (const g of grupos) g.ambigua = grupos.some((o) => o.unidad === g.unidad && o.unidadId !== g.unidadId);

  return grupos;
}

/** Etiqueta legible del grupo: «Unidad · Propio» / «Kg · Tercero abcd1234». */
export const unidadGrupo = (g: Pick<KardexGrupo, "unidad" | "unidadId" | "ambigua">): string => `${g.unidad || "Sin unidad"}${g.ambigua ? ` [id ${g.unidadId.slice(-8)}]` : ""}`;
export const etiquetaGrupo = (g: Pick<KardexGrupo, "unidad" | "unidadId" | "ambigua" | "propiedad" | "propietario">): string =>
  `${unidadGrupo(g)} · ${g.propiedad === "TERCERO" ? g.propietario : "Propio"}`;

// ── Filtros y validación de la respuesta (cliente)
export function filtrosKardexIguales(a: KardexFiltros, b: KardexFiltros): boolean {
  return a.vista === b.vista && a.q === b.q && a.depositoId === b.depositoId && a.tipo === b.tipo && a.usuarioId === b.usuarioId && a.documento === b.documento &&
    a.estado === b.estado && a.estadoStock === b.estadoStock && a.lote === b.lote && a.desde === b.desde && a.hasta === b.hasta;
}

export function respuestaKardexVigente(datos: { filtros: KardexFiltros; pagina: { numero: number } } | null, error: string, aplicados: KardexFiltros, pagina: number): boolean {
  return datos !== null && !error && filtrosKardexIguales(datos.filtros, aplicados) && datos.pagina.numero === pagina;
}

const esObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const txt = (v: unknown): v is string => typeof v === "string";
const entero = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const dec = (v: unknown): boolean => txt(v) && /^-?\d+(\.\d+)?$/.test(v);
const lista = (v: unknown, ok: (x: unknown) => boolean): boolean => Array.isArray(v) && v.every(ok);
const todos = (o: Fila, claves: string[], ok: (v: unknown) => boolean): boolean => claves.every((k) => ok(o[k]));
const idNombre = (d: unknown): boolean => esObj(d) && txt(d.id) && txt(d.nombre);
const VISTAS = ["DETALLE", "RESUMEN"];
const PROPIEDADES = ["PROPIO", "TERCERO"];

function filaValida(f: unknown): boolean {
  return esObj(f) && todos(f, ["clave", "numero", "fechaRegistro", "horaRegistro", "fechaMovimiento", "tipo", "origen", "estado", "documento", "motivo", "observacion", "usuario", "productoCodigo", "productoDescripcion", "unidad", "unidadId", "deposito", "contraparte", "lote", "propietario", "moneda", "vinculado"], txt) &&
    typeof f.retroactivo === "boolean" && typeof f.depositoInactivo === "boolean" && txt(f.propiedad) && PROPIEDADES.includes(f.propiedad) && txt(f.efecto) && ["ENTRADA", "SALIDA", "ESTADO"].includes(f.efecto) &&
    todos(f, ["entrada", "salida", "dDisponible", "dReservado", "dCuarentena", "saldoDisponible", "saldoReservado", "saldoCuarentena", "saldoFisico"], dec) &&
    (f.costoUnitario === null || dec(f.costoUnitario)) && (f.costoTotal === null || dec(f.costoTotal)) && txt(f.vinculoTipo) && ["", "ANULADO_POR", "ANULA_A"].includes(f.vinculoTipo);
}

function resumenFilaValida(f: unknown): boolean {
  return esObj(f) && todos(f, ["clave", "productoCodigo", "productoDescripcion", "unidad", "unidadId", "deposito", "lote", "propietario"], txt) && typeof f.depositoInactivo === "boolean" && txt(f.propiedad) && PROPIEDADES.includes(f.propiedad) &&
    todos(f, ["saldoInicial", "entradas", "salidas", "transfEntradas", "transfSalidas", "fueraDelFiltro", "saldoFinal", "finalDisponible", "finalReservado", "finalCuarentena"], dec);
}

const saldosValidos = (s: unknown): boolean => esObj(s) && todos(s, ["disponible", "reservado", "cuarentena", "fisico"], dec);
const movsValidos = (m: unknown): boolean => esObj(m) && todos(m, ["entradas", "salidas", "transfEntradas", "transfSalidas"], dec) && entero(m.cambiosEstado) && entero(m.anulaciones);
const resumenTotalesValido = (r: unknown): boolean => r === null || (esObj(r) && entero(r.filas) && todos(r, ["saldoInicial", "entradas", "salidas", "transfEntradas", "transfSalidas", "fueraDelFiltro", "saldoFinal", "finalDisponible", "finalReservado", "finalCuarentena"], dec));

function grupoValido(g: unknown): boolean {
  return esObj(g) && todos(g, ["clave", "unidad", "unidadId", "propietario"], txt) && typeof g.ambigua === "boolean" && txt(g.propiedad) && PROPIEDADES.includes(g.propiedad) && entero(g.filas) && saldosValidos(g.saldoInicial) && saldosValidos(g.saldoFinal) &&
    movsValidos(g.filtrado) && movsValidos(g.fueraDelFiltro) && movsValidos(g.completo) && typeof g.cuadra === "boolean" && resumenTotalesValido(g.resumen);
}

/** Validación estructural de la respuesta de la API antes de pintarla o habilitar la exportación: una respuesta incompleta o con cantidades no numéricas se rechaza completa. */
export function respuestaKardexValida(x: unknown): boolean {
  if (!esObj(x)) return false;

  const f = x.filtros, p = x.pagina, t = x.totales, c = x.conciliacion, cat = x.catalogos, e = x.empresa, perm = x.permisos;

  return esObj(e) && txt(e.nombre) && txt(e.moneda) && txt(x.generado) && txt(x.sello) && txt(x.fuenteUnidad) && ["HISTORIAL", "CATALOGO"].includes(x.fuenteUnidad) && esObj(f) && txt(f.vista) && VISTAS.includes(f.vista) &&
    esObj(p) && entero(p.numero) && entero(p.tamano) && entero(p.totalFilas) && lista(x.filas, filaValida) && lista(x.resumen, resumenFilaValida) && lista(x.cobertura, txt) &&
    esObj(t) && entero(t.filas) && typeof t.filtrosDeFila === "boolean" && typeof t.cuadra === "boolean" && lista(t.grupos, grupoValido) &&
    esObj(c) && entero(c.combinaciones) && entero(c.divergentes) && typeof c.conciliado === "boolean" &&
    esObj(cat) && lista(cat.depositos, (d) => idNombre(d) && typeof (d as Fila).activo === "boolean") && lista(cat.usuarios, idNombre) && lista(cat.tipos, idNombre) &&
    esObj(perm) && typeof perm.exportar === "boolean";
}
