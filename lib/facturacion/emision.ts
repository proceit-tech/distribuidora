import type { Pool } from "pg";

import { evaluarAptitudCliente } from "@/lib/clientes/aptitud-cliente";
import { parseDec, textoDec } from "@/lib/facturacion/calculo";
import { construirPayloadFE, FORMAS_PAGO, montoPagoDe, INDICADORES_PRESENCIA, resumenCalculo, TIPOS_TRANSACCION, totalFactura, validarEntradaFE, type EntradaFE, type LineaFE, type ReceptorFE } from "@/lib/facturacion/payload-fe";
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

  // Diagnóstico para el operador: sucursales activas del alcance a las que les falta el establecimiento SIFEN (no se ofrecen en el formulario).
  const falta = await db.query("SELECT count(*)::int AS n FROM sucursales sc WHERE sc.empresa_id = $1 AND sc.activo AND sc.establecimiento_sifen IS NULL AND sucursal_en_alcance($1::uuid, $2::uuid, sc.id)", [empresaId, usuarioId]);

  return { sucursales: r.rows as F[], sucursalesSinEstablecimiento: Number((falta.rows[0] as F | undefined)?.n ?? 0) };
}

const sinTotal = (fila: F): F => Object.fromEntries(Object.entries(fila).filter(([k]) => k !== "total"));

/** Paginación de los selectores: lista inmediata (sin texto), tamaño de página acotado y orden estable. */
export const POR_PAGINA = 10;
export const POR_PAGINA_MAX = 25;

export function leerPagina(pagina: unknown, porPagina: unknown) {
  const p = Number(pagina);
  const n = Number(porPagina);

  return { pagina: Number.isInteger(p) && p >= 1 && p <= 100000 ? p : 1, porPagina: Number.isInteger(n) && n >= 1 ? Math.min(n, POR_PAGINA_MAX) : POR_PAGINA };
}

/** Clientes facturables de la empresa (activos y no bloqueados), paginados en el servidor. Sin texto lista todos; con texto filtra por código, razón social, fantasía,
 *  RUC/CI (con o sin DV). Cada fila trae su ficha fiscal y su aptitud SIFEN con las pendientes. */
export async function buscarClientesFactura(db: Db, empresaId: string, texto: string, paginacion: { pagina?: unknown; porPagina?: unknown } = {}) {
  const q = texto.trim().slice(0, 80);
  const { pagina, porPagina } = leerPagina(paginacion.pagina, paginacion.porPagina);
  const r = await db.query(
    `SELECT c.id, c.codigo, c.razon_social AS "razonSocial", c.nombre_fantasia AS "nombreFantasia", c.numero_documento AS "numeroDocumento", c.dv, c.naturaleza_receptor AS naturaleza,
            c.tipo_operacion AS "tipoOperacion", c.tipo_contribuyente_sifen AS "tipoContribuyente", c.email, c.email_facturacion AS "emailFacturacion", c.telefono, c.celular,
            d.direccion, d.numero_casa AS "numeroCasa", count(*) OVER() AS total
       FROM clientes c
       LEFT JOIN LATERAL (SELECT x.direccion, x.numero_casa FROM direcciones_cliente x WHERE x.empresa_id = c.empresa_id AND x.cliente_id = c.id AND (x.es_fiscal OR x.tipo = 'FISCAL')
                           ORDER BY x.es_fiscal DESC, x.creado_at, x.id LIMIT 1) d ON true
      WHERE c.empresa_id = $1 AND c.activo AND NOT c.bloqueado_ventas
        AND ($2 = '' OR concat_ws(' ', c.codigo, c.razon_social, c.nombre_fantasia, c.numero_documento, c.numero_documento || '-' || c.dv, c.numero_documento || c.dv) ILIKE $3 ESCAPE '!')
      ORDER BY c.razon_social, c.id LIMIT $4 OFFSET $5`,
    [empresaId, q, `%${comodin(q)}%`, porPagina, (pagina - 1) * porPagina],
  );
  const clientes = await Promise.all(
    r.rows.map(async (c) => {
      const fila = sinTotal(c as F);
      const aptitud = await evaluarAptitudCliente(db as never, empresaId, s(fila.id));

      return { ...fila, apto: aptitud?.apto === true, pendientes: aptitud?.pendientes ?? [] };
    }),
  );

  return { clientes, total: r.rows.length > 0 ? Number((r.rows[0] as F).total) : 0, pagina, porPagina };
}

const SELECT_PRODUCTOS = `
  SELECT p.id, p.codigo, p.descripcion_factura AS descripcion, um.unidad_sifen_codigo AS "unidadSifen", us.representacion AS "unidadSimbolo", us.descripcion AS "unidadNombre", us.vigente AS "unidadVigente", p.afectacion_iva AS afectacion,
         p.proporcion_gravada_iva::text AS proporcion, i.porcentaje::int AS tasa, pr.precio::text AS precio, pr.moneda AS "monedaPrecio",
         coalesce((SELECT pc.codigo FROM producto_codigos pc WHERE pc.empresa_id = p.empresa_id AND pc.producto_id = p.id AND pc.tipo = 'GTIN' AND pc.codigo ~ '^[0-9]{8,14}$'
                    ORDER BY pc.es_principal DESC, pc.creado_at LIMIT 1), CASE WHEN p.codigo_barras ~ '^[0-9]{8,14}$' THEN p.codigo_barras END) AS gtin
    FROM productos p
    JOIN unidades_medida um ON um.id = p.unidad_medida_id
    LEFT JOIN unidades_medida_sifen us ON us.codigo = um.unidad_sifen_codigo
    LEFT JOIN impuestos i ON i.id = p.impuesto_id
    LEFT JOIN v_producto_precio_referencia pr ON pr.empresa_id = p.empresa_id AND pr.producto_id = p.id
   WHERE p.empresa_id = $1 AND p.activo AND p.vendible AND p.tipo_producto IN ('MERCADERIA','SERVICIO')`;

/** Productos facturables (mercadería y servicios activos), paginados en el servidor. Sin texto lista todos; con texto filtra por código, descripción, código de barras,
 *  GTIN y códigos alternos. */
export async function buscarProductosFactura(db: Db, empresaId: string, texto: string, paginacion: { pagina?: unknown; porPagina?: unknown } = {}) {
  const q = texto.trim().slice(0, 80);
  const { pagina, porPagina } = leerPagina(paginacion.pagina, paginacion.porPagina);
  const filtro = `($2 = '' OR concat_ws(' ', p.codigo, p.descripcion, p.descripcion_factura, p.codigo_barras) ILIKE $3 ESCAPE '!'
       OR EXISTS (SELECT 1 FROM producto_codigos pc WHERE pc.empresa_id = p.empresa_id AND pc.producto_id = p.id AND pc.codigo ILIKE $3 ESCAPE '!'))`;
  const r = await db.query(
    `SELECT t.*, count(*) OVER() AS total FROM (${SELECT_PRODUCTOS} AND ${filtro}) t ORDER BY t.descripcion, t.id LIMIT $4 OFFSET $5`,
    [empresaId, q, `%${comodin(q)}%`, porPagina, (pagina - 1) * porPagina],
  );

  return { productos: r.rows.map((x) => sinTotal(x as F)), total: r.rows.length > 0 ? Number((r.rows[0] as F).total) : 0, pagina, porPagina };
}

export type CuerpoFactura = {
  claveIdempotencia: string; sucursalId: string; puntoId: string; clienteId: string; tipoTransaccion: number; presencia: number;
  pagos: Array<{ tipo: number }>; infoAdicional: string; lineas: Array<{ productoId: string; cantidad: string; precio: string | null }>;
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
  // Precio unitario IVA incluido propuesto por el operador (opcional). Solo su FORMA se valida aquí; el servidor lo contrasta con el precio de referencia y el permiso.
  if (!lineas.every((l) => (l as F).precio === undefined || (l as F).precio === null || (l as F).precio === "" || (typeof (l as F).precio === "string" && /^\d{1,12}(\.\d{1,4})?$/.test(s((l as F).precio).trim())))) return "El precio unitario de un ítem no es válido.";
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
    lineas: lineas.map((l) => ({ productoId: s((l as F).productoId), cantidad: s((l as F).cantidad).trim(), precio: s((l as F).precio).trim() === "" ? null : s((l as F).precio).trim() })),
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

const ETIQUETA_TRANSACCION = TIPOS_TRANSACCION as Record<number, string>;
const ETIQUETA_PRESENCIA = INDICADORES_PRESENCIA as Record<number, string>;
const ETIQUETA_PAGO = FORMAS_PAGO as Record<number, string>;

/**
 * Valida y calcula la factura SIN escribir nada ni reservar número: es la base de la previa («Grabar») y de la emisión. Todo sale de los cadastros de la
 * empresa de la sesión y se recalcula en el servidor. Lanza ErrorFacturacion / ErrorValidacionFiscal (422) con los motivos.
 */
export async function prepararFactura(db: Db, empresaId: string, usuarioId: string, cuerpo: CuerpoFactura) {
  if (!Object.keys(FORMAS_PAGO).map(Number).includes(cuerpo.pagos[0].tipo)) throw new ErrorFacturacion(422, "La forma de pago no es válida.");

  const [receptor, aptitud, productos, punto] = await Promise.all([
    receptorDe(db, empresaId, cuerpo.clienteId),
    evaluarAptitudCliente(db as never, empresaId, cuerpo.clienteId),
    db.query(`${SELECT_PRODUCTOS} AND p.id = ANY($2::uuid[])`, [empresaId, [...new Set(cuerpo.lineas.map((l) => l.productoId))]]),
    // Sucursal activa en el alcance del usuario, con establecimiento SIFEN, y punto de expedición activo de ESA sucursal.
    db.query(
      `SELECT e.razon_social AS empresa, sc.nombre AS sucursal, sc.establecimiento_sifen AS establecimiento, p.codigo AS punto, p.nombre AS "puntoNombre"
         FROM sucursales sc JOIN empresas e ON e.id = sc.empresa_id
         JOIN fe_puntos_expedicion p ON p.empresa_id = sc.empresa_id AND p.sucursal_id = sc.id AND p.id = $3 AND p.activo
        WHERE sc.empresa_id = $1 AND sc.id = $2 AND sc.activo AND sc.establecimiento_sifen IS NOT NULL AND sucursal_en_alcance($1::uuid, $4::uuid, sc.id)`,
      [empresaId, cuerpo.sucursalId, cuerpo.puntoId, usuarioId],
    ),
  ]);

  if (aptitud && !aptitud.apto) throw detalles(422, "El cliente tiene datos fiscales pendientes de regularizar.", aptitud.pendientes);
  if (punto.rows.length === 0) throw new ErrorFacturacion(422, "La sucursal o el punto de expedición no son válidos (inactivos, sin establecimiento SIFEN o fuera de su alcance).");

  const porId = new Map((productos.rows as F[]).map((p) => [s(p.id), p]));
  const lineas: LineaFE[] = [];
  const precios: Array<{ referencia: string; modificado: boolean }> = [];
  let puedePrecio: boolean | null = null;

  for (const l of cuerpo.lineas) {
    const p = porId.get(l.productoId);

    if (!p) throw new ErrorFacturacion(422, "Uno de los productos no existe, está inactivo, no está marcado como vendible o no es facturable (solo mercadería y servicios).");
    if (p.unidadSifen === null) throw new ErrorFacturacion(422, `El producto ${s(p.codigo)} no tiene unidad de medida con equivalencia SIFEN: no se puede facturar hasta vincularla en Catálogos.`);
    if (p.unidadVigente === null) throw new ErrorFacturacion(422, `El código SIFEN ${s(p.unidadSifen)} de la unidad del producto ${s(p.codigo)} no existe en el catálogo oficial.`);
    if (p.unidadVigente === false) throw new ErrorFacturacion(422, `El código SIFEN ${s(p.unidadSifen)} de la unidad del producto ${s(p.codigo)} no está vigente en el catálogo oficial.`);
    if (p.precio === null || p.monedaPrecio !== "PYG") throw new ErrorFacturacion(422, `El producto ${s(p.codigo)} no tiene precio de venta de referencia en guaraníes.`);

    // El precio de referencia del catálogo manda. Un precio distinto del navegador solo se acepta con el permiso FACTURACION_ELECTRONICA.PRECIO (consultado
    // en el servidor); es siempre positivo, con a lo sumo 4 decimales (ya validado en la lectura), IVA incluido, y queda en el payload inmutable.
    const referencia = parseDec(s(p.precio), 8);
    const propuesto = l.precio === null ? null : parseDec(l.precio, 4);
    const modificado = propuesto !== null && referencia !== null && propuesto !== referencia;

    if (l.precio !== null && (propuesto === null || propuesto <= parseDec("0", 0)!)) throw new ErrorFacturacion(422, `El precio del producto ${s(p.codigo)} debe ser mayor que cero.`);
    if (modificado) {
      puedePrecio ??= await permisoPrecio(db, empresaId, usuarioId);

      if (!puedePrecio) throw new ErrorFacturacion(403, `No tiene permiso para modificar el precio del producto ${s(p.codigo)}. Se factura con el precio de lista.`);
    }
    // Cantidad coherente con la unidad: la unidad SIFEN «Unidad» (77) no admite fracciones.
    if (Number(p.unidadSifen) === 77 && !/^\d+$/.test(l.cantidad.replace(/\.0+$/, ""))) throw new ErrorFacturacion(422, `El producto ${s(p.codigo)} se vende por unidad: la cantidad debe ser un número entero.`);
    precios.push({ referencia: s(p.precio), modificado });

    lineas.push({
      codigoInterno: s(p.codigo), gtin: p.gtin === null ? null : s(p.gtin), descripcion: s(p.descripcion), unidadSifen: p.unidadSifen === null ? null : Number(p.unidadSifen),
      cantidad: l.cantidad, precio: modificado ? (l.precio as string) : s(p.precio), afectacion: p.afectacion === null ? null : Number(p.afectacion), tasa: p.tasa === null ? null : Number(p.tasa), proporcion: p.proporcion === null ? null : s(p.proporcion),
    });
  }

  const base = { moneda: "PYG", tipoTransaccion: cuerpo.tipoTransaccion, presencia: cuerpo.presencia, condicion: 1, infoAdicional: cuerpo.infoAdicional, receptor, lineas };
  // El pago único cubre el total que calcula el servidor (nunca un monto del navegador).
  const total = totalFactura(lineas);

  if (total === null) throw detalles(422, "La factura no cumple las reglas fiscales.", validarEntradaFE({ ...base, pagos: [{ tipo: cuerpo.pagos[0].tipo, monto: "1" }] }));

  const final: EntradaFE = { ...base, pagos: [{ tipo: cuerpo.pagos[0].tipo, monto: textoDec(montoPagoDe(total)) }] };
  const errores = validarEntradaFE(final);

  if (errores.length > 0) throw detalles(422, "La factura no cumple las reglas fiscales.", errores);

  const payload = construirPayloadFE(final) as { Subtotales: Array<{ dTotGralOpe: number }> };
  const calculo = resumenCalculo(lineas);
  const fila = punto.rows[0] as F;
  const resumen = {
    empresa: s(fila.empresa),
    sucursal: s(fila.sucursal),
    establecimiento: s(fila.establecimiento),
    punto: s(fila.punto),
    numero: "Se asigna al enviar la factura",
    cliente: { codigo: receptor.codigo, razonSocial: receptor.razonSocial, documento: receptor.naturaleza === 1 ? `${receptor.ruc}-${receptor.dv}` : receptor.numeroDocumento },
    tipoTransaccion: ETIQUETA_TRANSACCION[cuerpo.tipoTransaccion] ?? "",
    presencia: ETIQUETA_PRESENCIA[cuerpo.presencia] ?? "",
    condicion: "Contado",
    formaPago: ETIQUETA_PAGO[cuerpo.pagos[0].tipo] ?? "",
    moneda: "PYG",
    lineas: lineas.map((l, i) => ({ codigo: l.codigoInterno, descripcion: l.descripcion, unidad: s(porId.get(cuerpo.lineas[i].productoId)?.unidadSimbolo), cantidad: l.cantidad, precio: l.precio, precioLista: precios[i].referencia, precioModificado: precios[i].modificado, afectacion: l.afectacion, tasa: l.tasa, total: calculo.items[i] })),
    totales: { exento: calculo.exento, exonerado: calculo.exonerado, gravado5: calculo.gravado5, gravado10: calculo.gravado10, iva5: calculo.iva5, iva10: calculo.iva10, totalIva: calculo.totalIva, total: calculo.total },
  };

  return { entrada: final, payload, totalTexto: String(payload.Subtotales[0].dTotGralOpe), receptor, resumen };
}

/**
 * Crea la Factura Electrónica (documento + payload inmutable, número reservado UNA vez) de forma idempotente. La clave de idempotencia evita duplicados
 * ante doble clic, reintento o pérdida de respuesta. Solo se llama al CONFIRMAR el envío: revisar o volver a editar no consume numeración.
 */
export async function crearFacturaElectronica(db: Db, empresaId: string, usuarioId: string, cuerpo: CuerpoFactura) {
  const { payload, totalTexto, receptor } = await prepararFactura(db, empresaId, usuarioId, cuerpo);
  const documento = receptor.naturaleza === 1 ? `${receptor.ruc}-${receptor.dv}` : receptor.numeroDocumento;
  const llamar = () =>
    db.query(`SELECT o_documento_id AS "documentoId", o_numero AS numero, o_reutilizado AS reutilizado FROM fe_documento_crear_fe($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::uuid, $7, $8, 'PYG', $9::numeric, $10::jsonb)`,
      [empresaId, usuarioId, cuerpo.sucursalId, cuerpo.puntoId, cuerpo.claveIdempotencia, cuerpo.clienteId, documento, receptor.razonSocial, totalTexto, JSON.stringify(payload)]);

  try {
    return (await llamar()).rows[0] as F;
  } catch (error) {
    // Carrera de la misma clave: la otra transacción ya la confirmó; releer devuelve su documento (o el conflicto si el contenido difiere).
    if ((error as { code?: string }).code === "23505") return (await llamar()).rows[0] as F;
    throw error;
  }
}

/** ¿Puede el usuario facturar a un precio distinto del de lista? Permiso propio (NEX-051); sin él (o sin la migración) siempre falso. */
export async function permisoPrecio(db: Db, empresaId: string, usuarioId: string): Promise<boolean> {
  try {
    const r = await db.query("SELECT usuario_tiene_permiso($1::uuid, $2::uuid, 'FACTURACION_ELECTRONICA', 'PRECIO') AS ok", [empresaId, usuarioId]);

    return (r.rows[0] as F | undefined)?.ok === true;
  } catch {
    return false;
  }
}

function detalles(estado: number, mensaje: string, lista: string[]) {
  return new ErrorValidacionFiscal(estado, mensaje, lista);
}
