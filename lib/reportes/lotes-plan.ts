/**
 * Lotes y vencimientos — reglas PURAS (sin base de datos ni React): validación del horizonte y de los intervalos de fecha, igualdad de filtros campo a campo,
 * vigencia de la respuesta y validación estructural de la API (cantidades solo como texto decimal exacto). La identidad física de la unidad es el UUID; el rótulo
 * visual de unidades homónimas reutiliza el helper puro del Kardex (`etiquetasUnidad`, lineal y sin tocar los datos de la API).
 */
import type { ClaseVencimiento, LotesFiltros } from "@/types/reportes";

export { etiquetasUnidad, nombreUnidad } from "@/lib/reportes/kardex-plan";

const CLASES: ClaseVencimiento[] = ["VENCIDO", "PROXIMO", "VIGENTE", "SIN_FECHA"];
const MAX_HORIZONTE = 3650;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Horizonte escrito por el usuario: entero de 0 a 3650. Devuelve el valor o el mensaje de error del campo (nunca una consulta con un horizonte distinto del visible). */
export function validarHorizonteTexto(txt: string): { valor: number | null; error: string } {
  const v = txt.trim();

  if (!/^\d{1,4}$/.test(v) || Number(v) > MAX_HORIZONTE) return { valor: null, error: `Horizonte no válido: ingrese un número entero de 0 a ${MAX_HORIZONTE} días.` };

  return { valor: Number(v), error: "" };
}

/** Fecha AAAA-MM-DD existente o vacía. Total: nunca lanza (una fecha inexistente como 2026-13-01 produce un Date inválido y se rechaza ANTES de toISOString). */
export function fechaValida(v: unknown): boolean {
  if (v === "") return true;
  if (typeof v !== "string" || !FECHA.test(v)) return false;

  const d = new Date(`${v}T00:00:00Z`);

  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Validación de los filtros ya aplicados antes de pedir el informe ("" = válidos). Total: devuelve un mensaje controlado, nunca lanza. */
export function validarFiltrosLotes(f: LotesFiltros): string {
  try {
    return validarFiltrosLotesInterno(f);
  } catch {
    return "Filtros no válidos.";
  }
}

function validarFiltrosLotesInterno(f: LotesFiltros): string {
  if (!Number.isInteger(f.horizonte) || f.horizonte < 0 || f.horizonte > MAX_HORIZONTE) return `Horizonte no válido (0 a ${MAX_HORIZONTE} días).`;
  if (!fechaValida(f.vencDesde) || !fechaValida(f.vencHasta)) return "Fecha de vencimiento no válida.";
  if (f.vencDesde && f.vencHasta && f.vencDesde > f.vencHasta) return "El intervalo de vencimiento es inválido: la fecha inicial es posterior a la final.";

  return "";
}

/**
 * Controlador de la consulta (puro): decide, a partir del estado de la pantalla, SI corresponde consultar y con qué filtros. El horizonte aplicado es SIEMPRE el texto
 * mostrado (nunca el anterior); con el horizonte escrito inválido o un intervalo de fechas inválido no hay consulta. `clave` identifica la consulta (filtros + página):
 * la pantalla solo consulta cuando la clave cambia, de modo que estados con valores idénticos no provocan consultas.
 */
export type EstadoConsultaLotes = {
  filtros: LotesFiltros;
  /** Textos ya estabilizados (con la espera de escritura): búsqueda, lote y horizonte. */
  q: string;
  lote: string;
  horizonteAplicadoTxt: string;
  /** Texto del horizonte tal como está escrito AHORA en el campo. */
  horizonteVivoTxt: string;
  pagina: number;
};
export type PlanConsultaLotes = { errorHorizonte: string; error: string; consulta: { filtros: LotesFiltros; pagina: number } | null; clave: string };

export function planificarConsulta(e: EstadoConsultaLotes): PlanConsultaLotes {
  const vivo = validarHorizonteTexto(e.horizonteVivoTxt);

  if (vivo.error) return { errorHorizonte: vivo.error, error: "", consulta: null, clave: "" };

  const aplicado = validarHorizonteTexto(e.horizonteAplicadoTxt);

  // El campo ya es válido pero la espera de escritura aún no aplicó ese valor: no se consulta con el horizonte anterior.
  if (aplicado.valor === null || aplicado.valor !== vivo.valor) return { errorHorizonte: "", error: "", consulta: null, clave: "" };

  const filtros: LotesFiltros = { ...e.filtros, q: e.q, lote: e.lote, horizonte: aplicado.valor };
  const error = validarFiltrosLotes(filtros);

  if (error) return { errorHorizonte: "", error, consulta: null, clave: "" };

  const f = filtros;
  const clave = [e.pagina, f.vista, f.q, f.lote, f.depositoId, f.categoriaId, f.marcaId, f.familiaId, f.clase, f.existencia, f.horizonte, f.vencDesde, f.vencHasta].join(String.fromCharCode(1));

  return { errorHorizonte: "", error: "", consulta: { filtros, pagina: e.pagina }, clave };
}

export function filtrosLotesIguales(a: LotesFiltros, b: LotesFiltros): boolean {
  return a.vista === b.vista && a.q === b.q && a.lote === b.lote && a.depositoId === b.depositoId && a.categoriaId === b.categoriaId && a.marcaId === b.marcaId && a.familiaId === b.familiaId &&
    a.clase === b.clase && a.existencia === b.existencia && a.horizonte === b.horizonte && a.vencDesde === b.vencDesde && a.vencHasta === b.vencHasta;
}

export function respuestaLotesVigente(datos: { filtros: LotesFiltros; pagina: { numero: number } } | null, error: string, aplicados: LotesFiltros, pagina: number): boolean {
  return datos !== null && !error && filtrosLotesIguales(datos.filtros, aplicados) && datos.pagina.numero === pagina;
}

const esObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const txt = (v: unknown): v is string => typeof v === "string";
const entero = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const dec = (v: unknown): boolean => txt(v) && /^-?\d+(\.\d+)?$/.test(v);
const lista = (v: unknown, ok: (x: unknown) => boolean): boolean => Array.isArray(v) && v.every(ok);
const todos = (o: Record<string, unknown>, claves: string[], ok: (v: unknown) => boolean): boolean => claves.every((k) => ok(o[k]));
const idNombre = (d: unknown): boolean => esObj(d) && txt(d.id) && txt(d.nombre);
const estados = (e: unknown): boolean => esObj(e) && todos(e, ["disponible", "reservado", "cuarentena", "transito"], dec);

function filaValida(f: unknown): boolean {
  return esObj(f) && todos(f, ["productoId", "loteId", "codigo", "descripcion", "categoria", "marca", "familia", "unidad", "unidadId", "lote", "deposito", "vencimiento"], txt) &&
    typeof f.depositoInactivo === "boolean" && entero(f.depositos) && (f.diasRestantes === null || typeof f.diasRestantes === "number") && txt(f.clase) && CLASES.includes(f.clase as ClaseVencimiento) &&
    todos(f, ["disponible", "reservado", "cuarentena", "fisico", "terceros"], dec) && estados(f.tercerosEstados);
}

function claseValida(c: unknown): boolean {
  return esObj(c) && txt(c.clase) && CLASES.includes(c.clase as ClaseVencimiento) && entero(c.lotes) &&
    lista(c.unidades, (u) => esObj(u) && txt(u.unidadId) && txt(u.unidad) && entero(u.lotes) && dec(u.fisico) && dec(u.terceros));
}

function unidadValida(u: unknown): boolean {
  return esObj(u) && txt(u.unidadId) && txt(u.unidad) && entero(u.lotes) && todos(u, ["disponible", "reservado", "cuarentena", "fisico", "terceros"], dec) && estados(u.tercerosPorEstado);
}

/** Validación estructural de la respuesta antes de pintarla o habilitar la exportación: una respuesta incompleta o con cantidades no decimales se rechaza completa. */
export function respuestaLotesValida(x: unknown): boolean {
  if (!esObj(x)) return false;

  const e = x.empresa, f = x.filtros, p = x.pagina, t = x.totales, a = x.alcanceExistencia, c = x.catalogos, perm = x.permisos;

  return esObj(e) && txt(e.nombre) && txt(e.moneda) && txt(x.generado) && txt(x.sello) && esObj(f) && txt(f.vista) && ["LOTE", "DEPOSITO"].includes(f.vista) &&
    esObj(p) && entero(p.numero) && entero(p.tamano) && entero(p.totalFilas) && lista(x.filas, filaValida) && lista(x.cobertura, txt) && typeof x.huerfanos === "boolean" &&
    esObj(a) && (a.modo === "AUTORIZADOS" || a.modo === "DEPOSITO") && entero(a.depositos) &&
    esObj(t) && entero(t.lotes) && entero(t.filas) && txt(t.hoy) && lista(t.clases, claseValida) && lista(t.porUnidad, unidadValida) &&
    esObj(c) && lista(c.depositos, (d) => idNombre(d) && typeof (d as Record<string, unknown>).activo === "boolean") && lista(c.categorias, idNombre) && lista(c.marcas, idNombre) && lista(c.familias, idNombre) &&
    esObj(perm) && typeof perm.exportar === "boolean";
}
