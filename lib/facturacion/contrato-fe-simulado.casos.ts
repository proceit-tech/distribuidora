// PRE-VM-R02-A: capa COMÚN de las bases simuladas de FE de los casos. Desde PRO-93-R02 / PRO-307 (vendedor estructurado, NEX-074), PRO-322 (catálogo geográfico),
// PRO-339 (máximo de líneas por empresa, NEX-078), PRO-328 (dirección seleccionada, NEX-076), D002 (fecha de emisión, NEX-073) y PRO-354 (política de stock, NEX-081),
// prepararFactura / crearFacturaElectronica hacen lecturas OBLIGATORIAS que las bases simuladas anteriores a esas reglas no respondían: el cuerpo sin vendedor se rechazaba
// («Seleccione el vendedor.»), el fixture lo forzaba a CuerpoFactura y la suite abortaba (PRE-VM-R01 A-01…A-10).
//
// La capa responde SOLO esas lecturas de contrato con valores válidos y explícitos (configurables para los casos negativos) y delega todo lo demás en la base del caso, que
// conserva sus propios escenarios (cliente, productos, punto, creación, conflicto…). Se intercepta ANTES de la base: las lecturas de catálogo (to_regprocedure) no aparecen en
// los registros de llamadas de los casos y no se confunden con la función de emisión. No sustituye ninguna validación: los valores por omisión son los de una base con las
// migraciones aplicadas y un vendedor activo, y cada uno puede invertirse para comprobar el rechazo.
//
// No exporta funciones verificar*: el runner lo carga una vez para el inventario (scripts/casos-clientes/run.js).
import { leerCuerpoFactura, type CuerpoFactura } from "@/lib/facturacion/emision";

/** Vendedor sintético activo (usuario con el perfil Vendedor) de la empresa del caso. */
export const VENDEDOR_SIM = "7e7e7e7e-7e7e-4e7e-8e7e-7e7e7e7e7e7e";
export const VENDEDOR_SIM_NOMBRE = { nombre: "Ana", apellido: "Vendedora" };
/** Texto que el servidor compone en dInfAdic para el vendedor sintético. */
export const LINEA_VENDEDOR_SIM = "Vendedor: Ana Vendedora";

export type OpcionesContratoFE = {
  /** NEX-074 aplicada (fe_documento_crear_fe_vendedor existe). Por omisión: sí. */
  nex074?: boolean;
  /** NEX-076 aplicada (dirección seleccionada como domicilio del receptor). Por omisión: no (emisión por fe_documento_crear_fe_vendedor). */
  nex076?: boolean;
  /** NEX-073 aplicada (fecha de emisión distinta de hoy). Por omisión: sí. */
  nex073?: boolean;
  /** empresas.fe_max_lineas: número, null (= 999) o "sinMigracion" (NEX-078 no aplicada). Por omisión: null. */
  maxLineas?: number | null | "sinMigracion";
  /** Vendedores ACTIVOS con perfil Vendedor por UUID (y empresa opcional). Por omisión: VENDEDOR_SIM, de cualquier empresa del caso. */
  vendedores?: Record<string, { nombre: string; apellido: string; empresaId?: string }>;
  /** La base del caso responde ella misma la lectura del vendedor (simuladores con su propio registro de cuentas por empresa). Por omisión: no. */
  vendedorEnBase?: boolean;
  /** empresas.bloquear_stock_insuficiente: true/false o undefined (sin fila = bloquear, comportamiento por omisión). */
  politicaStock?: boolean;
  /** Catálogo geográfico: departamento/distrito/ciudad existentes y coherentes. Por omisión: sí. false = departamento inexistente. */
  geografiaValida?: boolean;
};

type Resultado = { rows: unknown[]; rowCount?: number };
type ConQuery = { query: (sql: string, parametros?: unknown[]) => Promise<unknown> };

const filas = (rows: unknown[]): Resultado => ({ rows, rowCount: rows.length });

/** Respuesta de la capa, o null si la consulta no es de contrato (entonces responde la base del caso). */
export function respuestaContratoFE(sql: string, parametros: unknown[] = [], o: OpcionesContratoFE = {}): Resultado | null {
  if (/to_regprocedure\('public\.fe_documento_crear_fe_vendedor\(/.test(sql)) return filas([{ ok: o.nex074 !== false }]);
  if (/to_regprocedure\('public\.fe_documento_crear_fe_receptor\(/.test(sql)) return filas([{ ok: o.nex076 === true }]);
  if (/to_regprocedure\('public\.fe_emision_fecha_soportada\(\)'\)/.test(sql)) return filas([{ ok: o.nex073 !== false }]);
  if (/to_jsonb\(e\) \? 'fe_max_lineas'/.test(sql)) {
    if (o.maxLineas === "sinMigracion") return filas([{ existe: false, valor: null }]);

    return filas([{ existe: true, valor: o.maxLineas ?? null }]);
  }
  if (/to_jsonb\(e\) -> 'bloquear_stock_insuficiente'/.test(sql)) return filas(o.politicaStock === undefined ? [] : [{ v: o.politicaStock }]);
  // vendedorActivo (lib/usuarios/vendedores.ts): usuario ACTIVO de la empresa con el perfil Vendedor.
  if (o.vendedorEnBase !== true && /FROM usuarios u\s+JOIN usuario_perfil up/.test(sql) && /u\.id = \$2 AND u\.estado = 'ACTIVO'/.test(sql)) {
    const vendedores = o.vendedores ?? { [VENDEDOR_SIM]: VENDEDOR_SIM_NOMBRE };
    const v = vendedores[String(parametros[1])];

    if (!v || (v.empresaId !== undefined && v.empresaId !== String(parametros[0]))) return filas([]);

    return filas([{ id: String(parametros[1]), usuario: "vendedor", nombre: v.nombre, apellido: v.apellido, email: "", estado: "ACTIVO" }]);
  }
  // validarGeografiaReceptor (emision.ts): cadena departamento → distrito → ciudad del catálogo.
  if (/FROM referencia_geografica_departamentos d WHERE d\.codigo = \$1::int AND d\.activo\) AS dep/.test(sql)) {
    const ok = o.geografiaValida !== false;

    return filas([{ dep: ok, dis: ok, ciu: ok, depNombre: ok ? "DEPARTAMENTO SINTÉTICO" : null, disNombre: ok ? "DISTRITO SINTÉTICO" : null, ciuNombre: ok ? "CIUDAD SINTÉTICA" : null }]);
  }

  return null;
}

/** Envuelve la base simulada de un caso con la capa de contrato. Devuelve el mismo tipo que recibe (los casos la usan como `never`). */
export function conContratoFE<T>(base: T, opciones: OpcionesContratoFE = {}): T {
  const b = base as unknown as ConQuery;

  return {
    ...(base as object),
    async query(sql: string, parametros: unknown[] = []) {
      return respuestaContratoFE(sql, parametros, opciones) ?? b.query(sql, parametros);
    },
  } as unknown as T;
}

/**
 * Lee el cuerpo como la API (leerCuerpoFactura) SIN ocultar el rechazo: si el fixture es inválido lanza un error que nombra el motivo, en lugar de forzar un texto de error a
 * CuerpoFactura (que antes terminaba en un TypeError lejos de la causa). Los casos negativos siguen llamando a leerCuerpoFactura directamente y comparan el texto.
 */
export function cuerpoValido(entrada: Record<string, unknown>): CuerpoFactura {
  const r = leerCuerpoFactura(entrada);

  if (typeof r === "string") throw new Error(`fixture de FE inválido: leerCuerpoFactura lo rechazó («${r}»)`);

  return r;
}
