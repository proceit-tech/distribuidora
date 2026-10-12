import type { Pool } from "pg";

import { evaluarAptitudCliente } from "@/lib/clientes/aptitud-cliente";
import { textoDec } from "@/lib/facturacion/calculo";
import { construirPayloadFE, FORMAS_PAGO, totalFactura, validarEntradaFE, type EntradaFE, type LineaFE, type ReceptorFE } from "@/lib/facturacion/payload-fe";
import { ErrorFacturacion, ErrorValidacionFiscal } from "@/lib/facturacion/shared";

/**
 * Preparación y registro de la Factura Electrónica (F-02). Todo lo fiscal sale de los cadastros de la empresa de la SESIÓN: el navegador solo envía
 * identificadores (cliente, productos), cantidades, forma de pago y datos de operación; precios, IVA, unidad SIFEN y datos del receptor se leen aquí
 * y el cálculo se rehace en el servidor. NO se envía nada al gateway (el contrato de recepcion_de está pendiente): el documento queda en
 * PENDIENTE_ENVIO con su payload inmutable, listo para reconciliarse con la consulta de estado.
 */

type Db = Pick<Pool, "query">;
type F = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const comodin = (t: string) => t.replace(/[!%_]/g, (c) => `!${c}`);

/** Sucursales utilizables (activas, en el alcance, con establecimiento SIFEN) con sus puntos de expedición activos. $1 empresa, $2 usuario. */
export async function catalogosFactura(db: Db, empresaId: string, usuarioId: string) {
  const r = await db.query(
    `SELECT sc.id, sc.nombre, sc.establecimiento_sifen AS establecimiento,
            coalesce(json_agg(json_build_object('id', p.id, 'codigo', p.codigo, 'nombre', p.nombre) ORDER BY p.codigo) FILTER (WHERE p.id IS NOT NULL), '[]'::json) AS puntos
       FROM sucursales sc
       LEFT JOIN fe_puntos_expedicion p ON p.empresa_id = sc.empresa_id AND p.sucursal_id = sc.id AND p.activo
      WHERE sc.empresa_id = $1 AND sc.activo AND sc.establecimiento_sifen IS NOT NULL AND sucursal_en_alcance($1::uuid, $2::uuid, sc.id)
      GROUP BY sc.id ORDER BY sc.nombre`,
    [empresaId, usuarioId],
  );

  return { sucursales: r.rows as F[] };
}

/** Clientes facturables que coinciden con el texto (máx. 10), con su aptitud SIFEN. */
export async function buscarClientesFactura(db: Db, empresaId: string, texto: string) {
  const q = texto.trim().slice(0, 80);
  const r = await db.query(
    `SELECT c.id, c.codigo, c.razon_social AS "razonSocial", c.numero_documento AS "numeroDocumento", c.dv, c.naturaleza_receptor AS naturaleza, c.tipo_operacion AS "tipoOperacion"
       FROM clientes c
      WHERE c.empresa_id = $1 AND c.activo AND NOT c.bloqueado_ventas
        AND ($2 = '' OR concat_ws(' ', c.codigo, c.razon_social, c.nombre_fantasia, c.numero_documento) ILIKE $3 ESCAPE '!')
      ORDER BY c.razon_social LIMIT 10`,
    [empresaId, q, `%${comodin(q)}%`],
  );
  const clientes = await Promise.all(
    r.rows.map(async (c) => {
      const aptitud = await evaluarAptitudCliente(db as never, empresaId, s((c as F).id));

      return { ...(c as F), apto: aptitud?.apto === true, pendientes: aptitud?.pendientes ?? [] };
    }),
  );

  return { clientes };
}

const SELECT_PRODUCTOS = `
  SELECT p.id, p.codigo, p.descripcion_factura AS descripcion, um.unidad_sifen_codigo AS "unidadSifen", p.afectacion_iva AS afectacion,
         p.proporcion_gravada_iva::text AS proporcion, i.porcentaje::int AS tasa, pr.precio::text AS precio, pr.moneda AS "monedaPrecio",
         coalesce((SELECT pc.codigo FROM producto_codigos pc WHERE pc.empresa_id = p.empresa_id AND pc.producto_id = p.id AND pc.tipo = 'GTIN' AND pc.codigo ~ '^[0-9]{8,14}$'
                    ORDER BY pc.es_principal DESC, pc.creado_at LIMIT 1), CASE WHEN p.codigo_barras ~ '^[0-9]{8,14}$' THEN p.codigo_barras END) AS gtin
    FROM productos p
    JOIN unidades_medida um ON um.id = p.unidad_medida_id
    LEFT JOIN impuestos i ON i.id = p.impuesto_id
    LEFT JOIN v_producto_precio_referencia pr ON pr.empresa_id = p.empresa_id AND pr.producto_id = p.id
   WHERE p.empresa_id = $1 AND p.activo AND p.tipo_producto IN ('MERCADERIA','SERVICIO')`;

export async function buscarProductosFactura(db: Db, empresaId: string, texto: string) {
  const q = texto.trim().slice(0, 80);
  const r = await db.query(`${SELECT_PRODUCTOS} AND ($2 = '' OR concat_ws(' ', p.codigo, p.descripcion, p.codigo_barras) ILIKE $3 ESCAPE '!') ORDER BY p.descripcion LIMIT 20`, [empresaId, q, `%${comodin(q)}%`]);

  return { productos: r.rows as F[] };
}

type CuerpoFactura = {
  claveIdempotencia: string; sucursalId: string; puntoId: string; clienteId: string; tipoTransaccion: number; presencia: number;
  pagos: Array<{ tipo: number }>; infoAdicional: string; lineas: Array<{ productoId: string; cantidad: string }>;
};

const entero = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : typeof v === "string" && /^\d{1,3}$/.test(v) ? Number(v) : NaN);

/** Valida la FORMA del cuerpo (los valores fiscales se validan después con las reglas de negocio). */
export function leerCuerpoFactura(c: Record<string, unknown>): CuerpoFactura | string {
  const lineas = Array.isArray(c.lineas) ? c.lineas : [];
  const pagos = Array.isArray(c.pagos) ? c.pagos : [];

  if (typeof c.claveIdempotencia !== "string" || c.claveIdempotencia.length < 8 || c.claveIdempotencia.length > 120) return "Falta la clave de idempotencia de la operación.";
  if (![c.sucursalId, c.puntoId, c.clienteId].every((v) => typeof v === "string" && UUID.test(v))) return "Seleccione sucursal, punto de expedición y cliente.";
  if (lineas.length === 0 || lineas.length > 999) return "Agregue al menos un ítem (máximo 999).";
  if (!lineas.every((l) => l && typeof l === "object" && typeof (l as F).productoId === "string" && UUID.test(s((l as F).productoId)) && typeof (l as F).cantidad === "string")) return "Los ítems no son válidos.";
  if (pagos.length === 0 || pagos.length > 1 || !pagos.every((p) => p && typeof p === "object" && Number.isInteger(entero((p as F).tipo)))) return "Seleccione la forma de pago.";

  return {
    claveIdempotencia: c.claveIdempotencia,
    sucursalId: c.sucursalId as string,
    puntoId: c.puntoId as string,
    clienteId: c.clienteId as string,
    tipoTransaccion: entero(c.tipoTransaccion),
    presencia: entero(c.presencia),
    pagos: pagos.map((p) => ({ tipo: entero((p as F).tipo) })),
    infoAdicional: typeof c.infoAdicional === "string" ? c.infoAdicional.trim() : "",
    lineas: lineas.map((l) => ({ productoId: s((l as F).productoId), cantidad: s((l as F).cantidad).trim() })),
  };
}

async function receptorDe(db: Db, empresaId: string, clienteId: string): Promise<ReceptorFE> {
  const r = await db.query(
    `SELECT c.codigo, c.naturaleza_receptor, c.tipo_operacion, c.tipo_contribuyente_sifen, c.pais_codigo, c.tipo_documento_identidad_sifen,
            c.descripcion_documento_identidad, c.numero_documento, c.dv, c.razon_social, c.nombre_fantasia, c.email, c.email_copia, c.email_facturacion, c.telefono, c.celular,
            c.telefono_ddi, c.celular_ddi, c.activo, c.bloqueado_ventas,
            d.direccion, d.numero_casa, d.departamento_codigo, d.distrito_codigo, d.ciudad_codigo
       FROM clientes c
       LEFT JOIN LATERAL (SELECT x.* FROM direcciones_cliente x WHERE x.empresa_id = c.empresa_id AND x.cliente_id = c.id AND (x.es_fiscal OR x.tipo = 'FISCAL')
                           ORDER BY x.es_fiscal DESC, x.creado_at, x.id LIMIT 1) d ON true
      WHERE c.empresa_id = $1 AND c.id = $2`,
    [empresaId, clienteId],
  );
  const c = r.rows[0] as F | undefined;

  if (!c) throw new ErrorFacturacion(404, "Cliente no encontrado.");
  if (c.activo !== true || c.bloqueado_ventas === true) throw new ErrorFacturacion(409, "El cliente está inactivo o bloqueado para ventas.");

  const contribuyente = Number(c.naturaleza_receptor) === 1;

  return {
    codigo: s(c.codigo),
    naturaleza: Number(c.naturaleza_receptor) as 1 | 2,
    tipoOperacion: Number(c.tipo_operacion) as 1 | 2 | 3 | 4,
    tipoContribuyente: c.tipo_contribuyente_sifen === null ? null : (Number(c.tipo_contribuyente_sifen) as 1 | 2),
    pais: s(c.pais_codigo),
    ruc: contribuyente ? s(c.numero_documento) : "",
    dv: contribuyente ? s(c.dv) : "",
    tipoDocumentoIdentidad: c.tipo_documento_identidad_sifen === null ? null : Number(c.tipo_documento_identidad_sifen),
    descripcionTipoDocumento: s(c.descripcion_documento_identidad),
    numeroDocumento: contribuyente ? "" : s(c.numero_documento),
    razonSocial: s(c.razon_social),
    nombreFantasia: s(c.nombre_fantasia),
    direccion: s(c.direccion),
    numeroCasa: s(c.numero_casa),
    departamento: s(c.departamento_codigo),
    distrito: s(c.distrito_codigo),
    ciudad: s(c.ciudad_codigo),
    telefono: s(c.telefono),
    celular: s(c.celular),
    email: s(c.email),
    emailCopia: s(c.email_copia),
    emailFacturacion: s(c.email_facturacion),
  };
}

/**
 * Crea la Factura Electrónica (documento + payload inmutable, número reservado) de forma idempotente. Devuelve errores de validación fiscal como
 * ErrorFacturacion 422 con la lista en `detalles`. La clave de idempotencia evita duplicados ante doble clic, reintento o pérdida de respuesta.
 */
export async function crearFacturaElectronica(db: Db, empresaId: string, usuarioId: string, cuerpo: CuerpoFactura) {
  if (!Object.keys(FORMAS_PAGO).map(Number).includes(cuerpo.pagos[0].tipo)) throw new ErrorFacturacion(422, "La forma de pago no es válida.");

  const [receptor, aptitud, productos] = await Promise.all([
    receptorDe(db, empresaId, cuerpo.clienteId),
    evaluarAptitudCliente(db as never, empresaId, cuerpo.clienteId),
    db.query(`${SELECT_PRODUCTOS} AND p.id = ANY($2::uuid[])`, [empresaId, [...new Set(cuerpo.lineas.map((l) => l.productoId))]]),
  ]);

  if (aptitud && !aptitud.apto) throw detalles(422, "El cliente tiene datos fiscales pendientes de regularizar.", aptitud.pendientes);

  const porId = new Map((productos.rows as F[]).map((p) => [s(p.id), p]));
  const lineas: LineaFE[] = [];

  for (const l of cuerpo.lineas) {
    const p = porId.get(l.productoId);

    if (!p) throw new ErrorFacturacion(422, "Uno de los productos no existe, está inactivo o no es facturable (solo mercadería y servicios).");
    if (p.precio === null || p.monedaPrecio !== "PYG") throw new ErrorFacturacion(422, `El producto ${s(p.codigo)} no tiene precio de venta de referencia en guaraníes.`);

    lineas.push({
      codigoInterno: s(p.codigo), gtin: p.gtin === null ? null : s(p.gtin), descripcion: s(p.descripcion), unidadSifen: p.unidadSifen === null ? null : Number(p.unidadSifen),
      cantidad: l.cantidad, precio: s(p.precio), afectacion: p.afectacion === null ? null : Number(p.afectacion), tasa: p.tasa === null ? null : Number(p.tasa), proporcion: p.proporcion === null ? null : s(p.proporcion),
    });
  }

  const base = { moneda: "PYG", tipoTransaccion: cuerpo.tipoTransaccion, presencia: cuerpo.presencia, condicion: 1, infoAdicional: cuerpo.infoAdicional, receptor, lineas };
  // El pago único cubre el total que calcula el servidor (nunca un monto del navegador).
  const total = totalFactura(lineas);

  if (total === null) throw detalles(422, "La factura no cumple las reglas fiscales.", validarEntradaFE({ ...base, pagos: [{ tipo: cuerpo.pagos[0].tipo, monto: "1" }] }));

  const final: EntradaFE = { ...base, pagos: [{ tipo: cuerpo.pagos[0].tipo, monto: textoDec(total) }] };
  const errores = validarEntradaFE(final);

  if (errores.length > 0) throw detalles(422, "La factura no cumple las reglas fiscales.", errores);

  const payload = construirPayloadFE(final) as { Subtotales: Array<{ dTotGralOpe: number }> };
  const totalTexto = String(payload.Subtotales[0].dTotGralOpe);
  const nombre = receptor.razonSocial;
  const documento = receptor.naturaleza === 1 ? `${receptor.ruc}-${receptor.dv}` : receptor.numeroDocumento;
  const llamar = () =>
    db.query(`SELECT o_documento_id AS "documentoId", o_numero AS numero, o_reutilizado AS reutilizado FROM fe_documento_crear_fe($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::uuid, $7, $8, 'PYG', $9::numeric, $10::jsonb)`,
      [empresaId, usuarioId, cuerpo.sucursalId, cuerpo.puntoId, cuerpo.claveIdempotencia, cuerpo.clienteId, documento, nombre, totalTexto, JSON.stringify(payload)]);

  try {
    return (await llamar()).rows[0] as F;
  } catch (error) {
    // Carrera de la misma clave: la otra transacción ya la confirmó; releer devuelve su documento (o el conflicto si el contenido difiere).
    if ((error as { code?: string }).code === "23505") return (await llamar()).rows[0] as F;
    throw error;
  }
}

function detalles(estado: number, mensaje: string, lista: string[]) {
  return new ErrorValidacionFiscal(estado, mensaje, lista);
}
