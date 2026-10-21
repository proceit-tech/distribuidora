/**
 * Aptitud SIFEN de clientes YA GRABADOS evaluada con el estado real de la base (una sola implementación para el detalle, el
 * listado y la compuerta de guardado). Usa `evaluarAptitudSifen` (reglas compartidas, sin duplicar lógica) con los datos
 * de `clientes`, la dirección fiscal (`direcciones_cliente`) y el catálogo oficial de países. Siempre filtra por `empresa_id`.
 *
 * Compuerta de guardado (decisión final 10, 2026-10-11): POST y PUT evalúan el estado FINAL dentro de la transacción y, si
 * quedan datos fiscales aplicables sin regularizar, rechazan el guardado listando lo pendiente (también en registros anteriores):
 * nunca se modifican datos en silencio.
 */
import { evaluarAptitudSifen, type AptitudSifen, type DatosAptitud, type DireccionFiscalAptitud } from "@/lib/fiscal/aptitud-sifen";

type Fila = Record<string, unknown>;
type Db = { query: (texto: string, valores?: unknown[]) => Promise<{ rows: Fila[]; rowCount: number | null }> };

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

const NATURALEZAS: Record<number, string> = { 1: "CONTRIBUYENTE", 2: "NO_CONTRIBUYENTE" };
const OPERACIONES: Record<number, string> = { 1: "B2B", 2: "B2C", 3: "B2G", 4: "B2F" };

/** Un código desconocido nunca se sustituye por un valor válido: queda marcado y la aptitud lo informa como pendiente. */
export function datosAptitudDeFila(c: Fila, paises: Set<string>): DatosAptitud {
  const pais = s(c.pais_codigo).toUpperCase();

  return {
    naturaleza: NATURALEZAS[Number(c.naturaleza_receptor)] ?? `DESCONOCIDA_${s(c.naturaleza_receptor)}`,
    tipoOperacion: OPERACIONES[Number(c.tipo_operacion)] ?? `DESCONOCIDA_${s(c.tipo_operacion)}`,
    tipoPersona: s(c.tipo_persona),
    paisCodigo: s(c.pais_codigo),
    paisEnCatalogo: pais === "" ? false : paises.has(pais),
    tipoDocumento: s(c.tipo_documento),
    numeroDocumento: s(c.numero_documento),
    dv: s(c.dv),
    descripcionDocumento: s(c.descripcion_documento_identidad),
    razonSocial: s(c.razon_social),
    nombreFantasia: s(c.nombre_fantasia),
    email: s(c.email),
    telefono: s(c.telefono),
    celular: s(c.celular),
    telefonoPais: s(c.telefono_pais),
    telefonoDdi: s(c.telefono_ddi),
    telefonoArea: s(c.telefono_area),
    celularPais: s(c.celular_pais),
    celularDdi: s(c.celular_ddi),
    celularArea: s(c.celular_area),
  };
}

export function direccionFiscalAptitud(d: Fila | undefined, paises: Set<string>): DireccionFiscalAptitud | null {
  if (!d) return null;

  const pais = s(d.pais_codigo).toUpperCase();

  return {
    direccion: s(d.direccion),
    numeroCasa: s(d.numero_casa),
    departamentoCodigo: s(d.departamento_codigo),
    distritoCodigo: s(d.distrito_codigo),
    ciudadCodigo: s(d.ciudad_codigo),
    paisCodigo: s(d.pais_codigo),
    paisEnCatalogo: pais === "" ? false : paises.has(pais),
  };
}

async function paisesActivos(db: Db): Promise<Set<string>> {
  const r = await db.query("SELECT codigo FROM referencia_geografica_paises WHERE activo = true");

  return new Set(r.rows.map((p) => s(p.codigo).toUpperCase()));
}

const COLUMNAS = `c.id, c.naturaleza_receptor, c.tipo_operacion, c.tipo_persona, c.pais_codigo, c.tipo_documento,
  c.descripcion_documento_identidad, c.numero_documento, c.dv, c.razon_social, c.nombre_fantasia, c.email, c.telefono, c.celular,
  c.telefono_ddi, c.celular_ddi, c.telefono_pais, c.telefono_area, c.celular_pais, c.celular_area`;

async function evaluar(db: Db, empresaId: string, clienteId: string | null): Promise<Map<string, AptitudSifen>> {
  const filtro = clienteId ? "AND c.id = $2" : "";
  const parametros = clienteId ? [empresaId, clienteId] : [empresaId];
  const [clientes, direcciones, paises] = await Promise.all([
    db.query(`SELECT ${COLUMNAS} FROM clientes c WHERE c.empresa_id = $1 ${filtro}`, parametros),
    db.query(
      `SELECT DISTINCT ON (d.cliente_id) d.cliente_id, d.direccion, d.numero_casa, d.departamento_codigo, d.distrito_codigo, d.ciudad_codigo, d.pais_codigo
         FROM direcciones_cliente d
        WHERE d.empresa_id = $1 ${clienteId ? "AND d.cliente_id = $2" : ""} AND (d.es_fiscal OR d.tipo = 'FISCAL')
        ORDER BY d.cliente_id, d.es_fiscal DESC, d.creado_at, d.id`,
      parametros,
    ),
    paisesActivos(db),
  ]);
  const fiscalPorCliente = new Map(direcciones.rows.map((d) => [s(d.cliente_id), d]));
  const resultado = new Map<string, AptitudSifen>();

  for (const c of clientes.rows) {
    resultado.set(s(c.id), evaluarAptitudSifen(datosAptitudDeFila(c, paises), direccionFiscalAptitud(fiscalPorCliente.get(s(c.id)), paises)));
  }

  return resultado;
}

/** Aptitud de UN cliente de la empresa (null si no existe en esa empresa). Con una transacción abierta ve el estado final. */
export async function evaluarAptitudCliente(db: Db, empresaId: string, clienteId: string): Promise<AptitudSifen | null> {
  return (await evaluar(db, empresaId, clienteId)).get(clienteId) ?? null;
}

/** Aptitud de TODOS los clientes de la empresa, por id (para el listado y sus filtros). */
export async function evaluarAptitudEmpresa(db: Db, empresaId: string): Promise<Map<string, AptitudSifen>> {
  return evaluar(db, empresaId, null);
}

/** Mensaje de rechazo de guardado cuando quedan datos fiscales sin regularizar; null si el cliente está apto. */
export function mensajeRegularizacionFiscal(aptitud: AptitudSifen | null): string | null {
  if (aptitud === null || aptitud.apto) return null;

  return `Antes de guardar debe regularizar los datos fiscales del cliente: ${aptitud.pendientes.join(" · ")}`;
}
