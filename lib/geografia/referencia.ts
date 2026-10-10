// Resolución y validación contra el catálogo geográfico oficial (tablas referencia_geografica_*, NEX-003).
// ÚNICA fuente para Clientes y Proveedores: ningún nombre de país, departamento, distrito o ciudad paraguayo se acepta como texto libre.

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }> };

export class ErrorGeografia extends Error {}

/** Código ISO de 3 letras -> { codigo, nombre } oficial. Rechaza países inexistentes o inactivos. */
export async function resolverPais(db: Db, codigo: unknown, etiqueta = "El país") {
  const c = typeof codigo === "string" ? codigo.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(c)) throw new ErrorGeografia(`${etiqueta} no es válido.`);
  const r = await db.query(`SELECT codigo, nombre FROM referencia_geografica_paises WHERE codigo = $1 AND activo = true`, [c]);
  if (r.rowCount !== 1) throw new ErrorGeografia(`${etiqueta} no existe en el catálogo.`);
  return { codigo: r.rows[0].codigo as string, nombre: r.rows[0].nombre as string };
}

export function codigoGeo(v: unknown, etiqueta: string) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ErrorGeografia(`${etiqueta} no es válido.`);
  return n;
}

/**
 * Departamento + distrito + ciudad de Paraguay: los tres son obligatorios y deben formar una combinación jerárquica
 * existente (la ciudad pertenece al distrito y al departamento; el distrito, al departamento). Devuelve los nombres oficiales.
 */
export async function resolverUbicacionParaguay(db: Db, dep: unknown, dis: unknown, ciu: unknown, etiqueta = "La dirección") {
  const d = codigoGeo(dep, "El departamento");
  const di = codigoGeo(dis, "El distrito");
  const c = codigoGeo(ciu, "La ciudad");
  if (!d || !di || !c) throw new ErrorGeografia(`${etiqueta} de Paraguay requiere departamento, distrito y ciudad.`);
  const r = await db.query(
    `SELECT d.nombre AS departamento, di.nombre AS distrito, ci.nombre AS ciudad
       FROM referencia_geografica_ciudades ci
       JOIN referencia_geografica_distritos di ON di.departamento_codigo = ci.departamento_codigo AND di.codigo = ci.distrito_codigo
       JOIN referencia_geografica_departamentos d ON d.codigo = di.departamento_codigo
      WHERE ci.departamento_codigo = $1 AND ci.distrito_codigo = $2 AND ci.codigo = $3`,
    [d, di, c],
  );
  if (r.rowCount !== 1) throw new ErrorGeografia("La combinación de departamento, distrito y ciudad no es válida.");
  return {
    departamentoCodigo: d,
    distritoCodigo: di,
    ciudadCodigo: c,
    departamento: r.rows[0].departamento as string,
    distrito: r.rows[0].distrito as string,
    ciudad: r.rows[0].ciudad as string,
  };
}
