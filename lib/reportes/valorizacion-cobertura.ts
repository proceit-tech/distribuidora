/**
 * Valorización de inventario — reglas puras (sin base de datos ni React): clasificación de cobertura por producto × depósito, peor situación de un
 * grupo, porcentaje de cobertura y validación estructural de la respuesta que recibe la pantalla. La SQL de `valorizacion.ts` aplica EXACTAMENTE la
 * misma clasificación (constante `SQL_SITUACION`); `clasificarCobertura` es su definición de referencia y se prueba contra los casos de la regla.
 * Cantidades y dinero son texto `numeric` y se comparan como decimales exactos (nunca float).
 */
import { compararDecimales } from "@/lib/inventario/decimal";
import type { ConteoSituaciones, SituacionCosto, ValorizacionRespuestaApi } from "@/types/reportes";

export const SITUACIONES: SituacionCosto[] = ["CON_COSTO", "PARCIAL", "SIN_COSTO", "EXCEDENTE", "RESIDUO", "SIN_STOCK"];

/** Gravedad creciente al elegir la «peor situación» de un grupo. SIN_STOCK y CON_COSTO no son divergencias. */
const GRAVEDAD: Record<SituacionCosto, number> = { SIN_STOCK: 0, CON_COSTO: 1, PARCIAL: 2, SIN_COSTO: 3, EXCEDENTE: 4, RESIDUO: 5 };

export const ETIQUETA_SITUACION: Record<SituacionCosto, string> = {
  CON_COSTO: "Con costo", PARCIAL: "Parcial", SIN_COSTO: "Sin costo", EXCEDENTE: "Excedente valorizado", RESIDUO: "Valor sin cantidad", SIN_STOCK: "Sin stock",
};

export const conteosVacios = (): ConteoSituaciones => ({ CON_COSTO: 0, PARCIAL: 0, SIN_COSTO: 0, EXCEDENTE: 0, RESIDUO: 0, SIN_STOCK: 0 });

/** Fragmento SQL equivalente a `clasificarCobertura` (columnas `fisico`, `cantv`, `valor` ya numeric). */
export const SQL_SITUACION = `CASE
  WHEN cantv = 0 AND valor <> 0 THEN 'RESIDUO'
  WHEN cantv > fisico THEN 'EXCEDENTE'
  WHEN fisico <= 0 THEN 'SIN_STOCK'
  WHEN cantv = 0 THEN 'SIN_COSTO'
  WHEN cantv < fisico THEN 'PARCIAL'
  ELSE 'CON_COSTO' END`;

/** Referencia de la regla: físico propio (sin tránsito) vs cantidad valorizada de inventario_costos, por producto × depósito. */
export function clasificarCobertura(fisico: string, cantidadValorizada: string, valor: string | null): SituacionCosto {
  const v = valor ?? "0";

  if (compararDecimales(cantidadValorizada, "0") === 0 && compararDecimales(v, "0") !== 0) return "RESIDUO";
  if (compararDecimales(cantidadValorizada, fisico) > 0) return "EXCEDENTE";
  if (compararDecimales(fisico, "0") <= 0) return "SIN_STOCK";
  if (compararDecimales(cantidadValorizada, "0") === 0) return "SIN_COSTO";
  if (compararDecimales(cantidadValorizada, fisico) < 0) return "PARCIAL";

  return "CON_COSTO";
}

export const esDivergencia = (s: SituacionCosto): boolean => s !== "CON_COSTO" && s !== "SIN_STOCK";

export function peorSituacion(c: ConteoSituaciones): SituacionCosto {
  return SITUACIONES.filter((s) => c[s] > 0).reduce<SituacionCosto>((a, s) => (GRAVEDAD[s] > GRAVEDAD[a] ? s : a), "SIN_STOCK");
}

export const totalDivergencias = (c: ConteoSituaciones): number => c.PARCIAL + c.SIN_COSTO + c.EXCEDENTE + c.RESIDUO;

/** Cobertura = pares con costo coherente / pares con existencia o valor (excluye SIN_STOCK). Texto con una decimal («87,5»), sin float; null si no hay pares. */
export function porcentajeCobertura(c: ConteoSituaciones): string | null {
  const total = c.CON_COSTO + totalDivergencias(c);

  if (total === 0) return null;

  const decimas = Math.floor((c.CON_COSTO * 1000 + Math.floor(total / 2)) / total); // half-up sobre enteros pequeños (conteos)

  return `${Math.floor(decimas / 10)},${decimas % 10}`;
}

const esObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const txt = (v: unknown): v is string => typeof v === "string";
const entero = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const decimalTxt = (v: unknown): boolean => txt(v) && /^-?\d+(\.\d+)?$/.test(v);
const decimalONulo = (v: unknown): boolean => v === null || decimalTxt(v);
const conteosValidos = (v: unknown): boolean => esObj(v) && SITUACIONES.every((s) => entero(v[s]));
const dineroPorSituacion = (v: unknown): boolean => esObj(v) && SITUACIONES.every((s) => decimalTxt(v[s]));

function filaValida(f: unknown): boolean {
  return esObj(f) && txt(f.clave) && f.clave !== "" && txt(f.codigo) && txt(f.descripcion) && txt(f.categoria) && txt(f.familia) && txt(f.deposito) && typeof f.depositoInactivo === "boolean" && txt(f.unidad) &&
    entero(f.productos) && entero(f.depositos) && decimalONulo(f.fisico) && decimalONulo(f.cantidadValorizada) && decimalONulo(f.sinValorizar) && decimalONulo(f.excedente) && decimalONulo(f.costoPromedio) && decimalONulo(f.valorTotal) &&
    txt(f.moneda) && txt(f.situacionCosto) && (SITUACIONES as string[]).includes(f.situacionCosto) && conteosValidos(f.conteos);
}

const listaDe = (v: unknown, ok: (x: unknown) => boolean): boolean => Array.isArray(v) && v.every(ok);

/**
 * Validación estructural de la respuesta de la API de Valorización antes de pintarla o habilitar la exportación. Una respuesta incompleta, con
 * registros nulos, importes no numéricos o conteos inválidos se rechaza completa (la pantalla no muestra ni exporta datos no confiables).
 */
export function respuestaValorizacionValida(x: unknown): x is ValorizacionRespuestaApi {
  if (!esObj(x)) return false;

  const t = x.totales, p = x.pagina, c = x.catalogos, e = x.empresa, perm = x.permisos, f = x.filtros;

  return esObj(e) && txt(e.nombre) && txt(e.moneda) && txt(x.generado) && txt(x.sello) && esObj(f) && txt(f.vista) &&
    esObj(p) && entero(p.numero) && entero(p.tamano) && entero(p.totalFilas) &&
    listaDe(x.filas, filaValida) && listaDe(x.cobertura, txt) &&
    esObj(t) && entero(t.filas) && entero(t.productos) && entero(t.depositos) && entero(t.productosConCosto) && decimalTxt(t.valorTotal) && txt(t.moneda) && conteosValidos(t.conteos) && dineroPorSituacion(t.valorPorSituacion) &&
    esObj(t.inactivos) && entero(t.inactivos.filas) && decimalTxt(t.inactivos.valor) &&
    esObj(c) && listaDe(c.depositos, (d) => esObj(d) && txt(d.id) && txt(d.nombre) && typeof d.activo === "boolean") &&
    listaDe(c.categorias, (d) => esObj(d) && txt(d.id) && txt(d.nombre)) && listaDe(c.familias, (d) => esObj(d) && txt(d.id) && txt(d.nombre)) &&
    esObj(perm) && typeof perm.exportar === "boolean";
}
