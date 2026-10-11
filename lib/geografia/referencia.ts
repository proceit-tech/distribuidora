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
 * Ubicación de Paraguay: departamento, distrito y ciudad son OPCIONALES, pero jerárquicos:
 * no se admite un nivel sin su padre (distrito sin departamento, ciudad sin distrito) y los niveles informados
 * deben formar una combinación existente en el catálogo (el distrito pertenece al departamento; la ciudad, al distrito).
 * Devuelve códigos y nombres oficiales; los niveles no informados quedan en null.
 */
export async function resolverUbicacionParaguay(db: Db, dep: unknown, dis: unknown, ciu: unknown, etiqueta = "La dirección") {
  const d = codigoGeo(dep, "El departamento");
  const di = codigoGeo(dis, "El distrito");
  const c = codigoGeo(ciu, "La ciudad");
  if (di && !d) throw new ErrorGeografia(`${etiqueta}: el distrito requiere departamento.`);
  if (c && !di) throw new ErrorGeografia(`${etiqueta}: la ciudad requiere distrito.`);
  const vacio = { departamentoCodigo: null as number | null, distritoCodigo: null as number | null, ciudadCodigo: null as number | null,
    departamento: null as string | null, distrito: null as string | null, ciudad: null as string | null };
  if (!d) return vacio;
  const r = await db.query(
    `SELECT d.nombre AS departamento, di.nombre AS distrito, ci.nombre AS ciudad
       FROM referencia_geografica_departamentos d
       LEFT JOIN referencia_geografica_distritos di ON di.departamento_codigo = d.codigo AND di.codigo = $2::int AND di.activo
       LEFT JOIN referencia_geografica_ciudades ci ON ci.departamento_codigo = di.departamento_codigo AND ci.distrito_codigo = di.codigo
                                                  AND ci.codigo = $3::int AND ci.activo
      WHERE d.codigo = $1::int AND d.activo`,
    [d, di, c],
  );
  const f = r.rows[0];
  if (r.rowCount !== 1 || (di && !f.distrito) || (c && !f.ciudad)) {
    throw new ErrorGeografia("La combinación de departamento, distrito y ciudad no es válida.");
  }
  return {
    departamentoCodigo: d,
    distritoCodigo: di,
    ciudadCodigo: c,
    departamento: f.departamento as string,
    distrito: (f.distrito as string | null) ?? null,
    ciudad: (f.ciudad as string | null) ?? null,
  };
}

/**
 * Regla del receptor SIFEN v1.50 (iTiOpe/cPaisRec) aplicada a Clientes:
 * B2B, B2C y B2G => PRY; B2F => cualquier país distinto de PRY.
 * NO se aplica a Proveedores.
 */
export function validarPaisPorOperacion(tipoOperacion: string, paisCodigo: string) {
  if (tipoOperacion === "B2F") {
    if (paisCodigo === "PRY") throw new ErrorGeografia("En operaciones B2F el país del cliente debe ser distinto de Paraguay.");
  } else if (paisCodigo !== "PRY") {
    throw new ErrorGeografia(`En operaciones ${tipoOperacion} el país del cliente debe ser Paraguay.`);
  }
}
