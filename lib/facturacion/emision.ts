import { createHash } from "node:crypto";

import type { Pool } from "pg";

import { evaluarAptitudCliente } from "@/lib/clientes/aptitud-cliente";
import { leerAjuste, type AjusteFiscal } from "@/lib/facturacion/ajuste-item";
import { permisoAjusteFiscal, permisoEditarProductos, type ClasificacionGuardar } from "@/lib/facturacion/ajuste-fiscal";
import { B, parseDec, textoDec, type Dec } from "@/lib/facturacion/calculo";
import { CLAVE_FECHA_SOLICITADA, evaluarFechaEmision, fechaIsoValida } from "@/lib/facturacion/fecha-emision";
import { CONDICION_CONTADO, CONDICION_CREDITO, CREDITO_CUOTAS, CREDITO_PLAZO, CUOTAS_HABILITADAS, hoyParaguay, MENSAJE_CUOTAS_SUSPENDIDAS, leerCredito, plazoTexto, type CreditoEntrada } from "@/lib/facturacion/credito";
import { leerMonedaYCambio, leerCambio, precioEnMoneda, precioSerializable, totalEnGuaranies, type Moneda } from "@/lib/facturacion/monedas";
import { DENOMINACIONES_TARJETA, FORMAS_PAGO, FORMAS_PROCESAMIENTO, leerPagos, resolverMontos, type PagoEntrada } from "@/lib/facturacion/pagos";
import { construirPayloadFE, CONDICIONES_OPERACION, INDICADORES_PRESENCIA, resumenCalculo, TIPOS_TRANSACCION, totalFactura, erroresDomicilioReceptor, validarEntradaFE, type EntradaFE, type LineaFE, type ReceptorFE } from "@/lib/facturacion/payload-fe";
import { ErrorFacturacion, ErrorValidacionFiscal } from "@/lib/facturacion/shared";
import { leerDescuento, type DescuentoEntrada } from "@/lib/facturacion/descuentos";
import { MENSAJE_ENTREGA_INVALIDA, opcionesEntrega, resolverEntrega, resumenEntrega } from "@/lib/facturacion/entrega";
import { componerInfoAdicional, contieneMarcaAutomatica, descomponerInfoAdicional, huellaInfoAdicional, infoAdicionalPersistida, LIMITE_INFO_ADICIONAL, lineaVendedor } from "@/lib/facturacion/info-adicional";
import { nombreDeUsuario, vendedorActivo, vendedorFeSoportado } from "@/lib/usuarios/vendedores";
import { asignacionesSql, mensajeStockInsuficiente, planificarStock, type LineaStock } from "@/lib/facturacion/stock-fe";
import { normalizarCantidadTexto } from "@/lib/formato/cantidad-campo";
import { ErrorGeografia, resolverPais, validarPaisPorOperacion } from "@/lib/geografia/referencia";

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
            coalesce(json_agg(json_build_object('id', p.id, 'codigo', p.codigo, 'nombre', p.nombre, 'ultimoNumero', s.ultimo_numero, 'serie', s.serie) ORDER BY p.codigo) FILTER (WHERE p.id IS NOT NULL AND s.ultimo_numero IS NOT NULL AND s.activo), '[]'::json) AS puntos,
            (SELECT count(*)::int FROM fe_punto_secuencias x JOIN fe_puntos_expedicion xp ON xp.empresa_id = x.empresa_id AND xp.id = x.punto_id WHERE xp.empresa_id = sc.empresa_id AND xp.sucursal_id = sc.id AND x.tipo_documento = 'FE' AND NOT x.activo) AS "puntosInactivos"
       FROM sucursales sc
       LEFT JOIN fe_puntos_expedicion p ON p.empresa_id = sc.empresa_id AND p.sucursal_id = sc.id
       LEFT JOIN fe_punto_secuencias s ON s.empresa_id = p.empresa_id AND s.punto_id = p.id AND s.tipo_documento = 'FE'
      WHERE sc.empresa_id = $1 AND sc.activo AND sc.establecimiento_sifen IS NOT NULL AND sucursal_en_alcance($1::uuid, $2::uuid, sc.id)
      GROUP BY sc.id ORDER BY sc.nombre`,
    [empresaId, usuarioId],
  );

  // Diagnóstico para el operador: sucursales activas del alcance a las que les falta el establecimiento SIFEN (no se ofrecen en el formulario).
  const falta = await db.query("SELECT count(*)::int AS n FROM sucursales sc WHERE sc.empresa_id = $1 AND sc.activo AND sc.establecimiento_sifen IS NULL AND sucursal_en_alcance($1::uuid, $2::uuid, sc.id)", [empresaId, usuarioId]);

  // Unidades de medida SIFEN vigentes (Tabla 5 del MT): opciones para completar la unidad de un ítem en la propia factura.
  const unidades = await db.query(`SELECT codigo, representacion, descripcion FROM unidades_medida_sifen WHERE vigente ORDER BY descripcion, codigo`);

  // Última cotización manual vigente de cada moneda extranjera (catálogo «Tipos de cambio»): SOLO una sugerencia; el operador escribe el cambio y el documento guarda el que se usó.
  const cotizaciones: Record<string, { cambio: string; fecha: string }> = {};

  for (const m of ["USD", "BRL"]) {
    const c = await cotizacionVigente(db, empresaId, m);

    if (c) cotizaciones[m] = c;
  }

  return { sucursales: r.rows as F[], sucursalesSinEstablecimiento: Number((falta.rows[0] as F | undefined)?.n ?? 0), unidadesSifen: unidades.rows as F[], cotizaciones };
}

/**
 * Cotización manual más reciente (vigente) de la empresa para una moneda, o null. El catálogo guarda 6 decimales; D018 admite 4: si la cotización no cabe SIN redondear, no se sugiere
 * (nunca se recorta en silencio). Sin la migración NEX-045 devuelve null.
 */
export async function cotizacionVigente(db: Db, empresaId: string, moneda: string): Promise<{ cambio: string; fecha: string } | null> {
  try {
    const r = await db.query(
      "SELECT cambio::text AS cambio, fecha::text AS fecha FROM tipos_cambio WHERE empresa_id = $1 AND moneda_codigo = $2 AND vigente ORDER BY fecha DESC, version DESC LIMIT 1",
      [empresaId, moneda],
    );
    const f = r.rows[0] as F | undefined;

    if (!f) return null;

    const t = s(f.cambio).includes(".") ? s(f.cambio).replace(/0+$/, "").replace(/\.$/, "") : s(f.cambio);
    const cambio = leerCambio(t);

    return cambio === null ? null : { cambio, fecha: s(f.fecha) };
  } catch {
    return null;
  }
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
  SELECT p.id, p.codigo, p.controla_stock AS "controlaStock", p.descripcion_factura AS descripcion, um.unidad_sifen_codigo AS "unidadSifen", us.representacion AS "unidadSimbolo", us.descripcion AS "unidadNombre", us.vigente AS "unidadVigente", p.afectacion_iva AS afectacion,
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
  /** Forma de pago: del total (Contado) o de la ENTREGA INICIAL (Crédito con entrega). */
  /** Medios de pago: del total (Contado) o de la ENTREGA INICIAL (Crédito); ver `pagos.ts`. */
  pagos: PagoEntrada[]; condicion?: number;
  /** D015 (PYG por omisión) y D018 (manual, guaraníes por 1 unidad; solo moneda extranjera). */
  moneda?: Moneda; cambio?: string; credito?: CreditoEntrada; infoAdicional: string; lineas: Array<{ productoId: string; cantidad: string; precio: string | null; ajuste?: AjusteFiscal; /** E03: descuento particular del ítem (% o monto por unidad). */ descuento?: DescuentoEntrada }>;
  /** E03: descuento general de la factura (% o monto). */
  descuentoGlobal?: DescuentoEntrada;
  /** E04: dirección de entrega elegida entre las registradas del cliente (el servidor la valida contra la empresa y el cliente; sin destinos registrados no se informa). */
  direccionEntregaId?: string;
  /** E02: huella del reparto de stock que el operador REVISÓ (la devuelve la previa). Obligatoria al emitir si hay productos con control de stock; si el stock cambió, se exige revisar de nuevo. */
  repartoHuella?: string;
  /** E1: huella del dInfAdic (observaciones + vendedor) que el operador REVISÓ (la devuelve la previa). Si al emitir el texto que el servidor compondría es otro (cambió el nombre del vendedor), se exige revisar de nuevo. */
  infoAdicionalHuella?: string;
  /** PRO-328: huella del domicilio del receptor REVISADO (dirección seleccionada o fiscal, tal como irá en el JSON; la devuelve la previa). Obligatoria al crear una FE nueva: si cambió, se exige revisar de nuevo. */
  receptorHuella?: string;
  /** PRO-72/PRO-307: vendedor comercial elegido (ID de un usuario ACTIVO de la empresa con el perfil Vendedor). Es independiente del usuario que emite; el servidor lo revalida y lo registra de forma estructurada. */
  vendedorId: string;
  /** D002: fecha de emisión elegida (AAAA-MM-DD, día local de Paraguay). Sin ella, la de hoy. Se valida en el servidor (selección −30/+5 días y ventana fiscalmente habilitada) antes de reservar numeración. */
  fechaEmision?: string;
};

const entero = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : typeof v === "string" && /^\d{1,3}$/.test(v) ? Number(v) : NaN);

/** Valida la FORMA del cuerpo (los valores fiscales se validan después con las reglas de negocio). */
export function leerCuerpoFactura(c: Record<string, unknown>): CuerpoFactura | string {
  const lineas = Array.isArray(c.lineas) ? c.lineas : [];

  if (typeof c.claveIdempotencia !== "string" || c.claveIdempotencia.length < 8 || c.claveIdempotencia.length > 120) return "Falta la clave de idempotencia de la operación.";
  if (![c.sucursalId, c.puntoId, c.clienteId].every((v) => typeof v === "string" && UUID.test(v))) return "Seleccione sucursal, punto de expedición y cliente.";
  if (lineas.length === 0 || lineas.length > 999) return "Agregue al menos un ítem (máximo 999).";
  if (!lineas.every((l) => l && typeof l === "object" && typeof (l as F).productoId === "string" && UUID.test(s((l as F).productoId)) && typeof (l as F).cantidad === "string")) return "Los ítems no son válidos.";
  // Precio unitario IVA incluido propuesto por el operador (opcional). Solo su FORMA se valida aquí; el servidor lo contrasta con el precio de referencia y el permiso.
  if (!lineas.every((l) => (l as F).precio === undefined || (l as F).precio === null || (l as F).precio === "" || (typeof (l as F).precio === "string" && /^\d{1,12}(\.\d{1,4})?$/.test(s((l as F).precio).trim())))) return "El precio unitario de un ítem no es válido.";
  for (const l of lineas) {
    const a = leerAjuste((l as F | null)?.ajuste);

    if (typeof a === "string") return a;

    const d = leerDescuento((l as F | null)?.descuento);

    if (typeof d === "string") return d;
  }

  const descuentoGlobal = leerDescuento(c.descuentoGlobal);

  if (typeof descuentoGlobal === "string") return descuentoGlobal;
  if (c.direccionEntregaId !== undefined && c.direccionEntregaId !== null && !(typeof c.direccionEntregaId === "string" && UUID.test(c.direccionEntregaId))) return "La dirección de entrega no es válida.";

  if (typeof c.vendedorId !== "string" || !UUID.test(c.vendedorId)) return "Seleccione el vendedor.";
  if (c.fechaEmision !== undefined && c.fechaEmision !== null && fechaIsoValida(c.fechaEmision) === null) return "La fecha de emisión no es válida.";

  const pagos = leerPagos(c.pagos);

  if (typeof pagos === "string") return pagos;

  // Condición de la operación (E601): sin el campo, Contado (clientes anteriores a MFE-B1). Nunca se asume Contado ante un valor inválido.
  const condicion = c.condicion === undefined || c.condicion === null ? CONDICION_CONTADO : c.condicion;

  if (condicion !== CONDICION_CONTADO && condicion !== CONDICION_CREDITO) return "La condición de la operación no es válida (Contado o Crédito).";

  const monedaYCambio = leerMonedaYCambio(c.moneda, c.cambio);

  if (typeof monedaYCambio === "string") return monedaYCambio;

  const credito = leerCredito(condicion, c.credito);

  if (typeof credito === "string") return credito;
  if (condicion === CONDICION_CONTADO && pagos.length === 0) return "Seleccione la forma de pago.";

  return {
    claveIdempotencia: c.claveIdempotencia,
    sucursalId: c.sucursalId as string,
    puntoId: c.puntoId as string,
    clienteId: c.clienteId as string,
    tipoTransaccion: entero(c.tipoTransaccion),
    presencia: entero(c.presencia),
    pagos,
    condicion,
    ...(monedaYCambio.moneda !== "PYG" ? { moneda: monedaYCambio.moneda, cambio: monedaYCambio.cambio as string } : {}),
    ...(credito ? { credito } : {}),
    infoAdicional: typeof c.infoAdicional === "string" ? c.infoAdicional.trim() : "",
    ...(descuentoGlobal ? { descuentoGlobal } : {}),
    ...(typeof c.direccionEntregaId === "string" ? { direccionEntregaId: c.direccionEntregaId } : {}),
    ...(typeof c.repartoHuella === "string" && /^[0-9a-f]{64}$/.test(c.repartoHuella) ? { repartoHuella: c.repartoHuella } : {}),
    vendedorId: c.vendedorId,
    ...(typeof c.fechaEmision === "string" ? { fechaEmision: c.fechaEmision } : {}),
    ...(typeof c.infoAdicionalHuella === "string" && /^[0-9a-f]{64}$/.test(c.infoAdicionalHuella) ? { infoAdicionalHuella: c.infoAdicionalHuella } : {}),
    ...(typeof c.receptorHuella === "string" && /^[0-9a-f]{64}$/.test(c.receptorHuella) ? { receptorHuella: c.receptorHuella } : {}),
    lineas: lineas.map((l) => {
      const ajuste = leerAjuste((l as F).ajuste);

      const descuento = leerDescuento((l as F).descuento) as DescuentoEntrada | null;

      return { productoId: s((l as F).productoId), ...(descuento ? { descuento } : {}), cantidad: normalizarCantidadTexto(s((l as F).cantidad)), precio: s((l as F).precio).trim() === "" ? null : s((l as F).precio).trim(), ...(ajuste && typeof ajuste !== "string" ? { ajuste } : {}) };
    }),
  };
}

const OPERACION_RECEPTOR: Record<number, string> = { 1: "B2B", 2: "B2C", 3: "B2G", 4: "B2F" };

/** Nombres OFICIALES (catálogo, por código) del domicilio del receptor validado: solo para que el operador revise lo que irá en el JSON; nunca se deriva un código de un nombre. */
export type NombresGeografia = { pais: string; departamento: string; distrito: string; ciudad: string };

/**
 * País y domicilio del receptor (el fiscal o, en una FE nueva, la dirección SELECCIONADA: PRO-328) contra el catálogo geográfico oficial (los mismos `referencia_geografica_*` que validan Clientes): el país
 * existe y es el que exige el tipo de operación; con calle fuera de B2F, departamento, distrito y ciudad existen y forman una cadena jerárquica coherente. Solo lectura, ANTES de reservar numeración o
 * transmitir; 422 con el motivo, que nombra la dirección a corregir (la seleccionada nunca se completa ni se sustituye por la fiscal).
 */
async function validarGeografiaReceptor(db: Db, r: ReceptorFE): Promise<NombresGeografia> {
  const operacion = OPERACION_RECEPTOR[r.tipoOperacion];
  const seleccionada = r.origenDomicilio === "SELECCIONADA";
  const cual = seleccionada ? "dirección seleccionada para la factura" : "dirección fiscal del cliente";

  if (operacion === undefined) throw new ErrorFacturacion(422, "El tipo de operación del cliente no es válido. Corríjalo en Clientes.");

  const motivos = erroresDomicilioReceptor(r);

  if (motivos.length > 0) throw detalles(422, seleccionada ? "La dirección seleccionada no es válida para la factura: corríjala en Clientes → Direcciones." : "El domicilio fiscal del cliente no es válido para la factura.", motivos);

  try {
    const pais = await resolverPais(db as never, r.pais, seleccionada ? "El país de la dirección seleccionada" : "El país del cliente");
    const nombres: NombresGeografia = { pais: s(pais.nombre), departamento: "", distrito: "", ciudad: "" };

    validarPaisPorOperacion(operacion, r.pais);

    if (r.tipoOperacion !== 4 && [r.direccion, r.numeroCasa, r.departamento, r.distrito, r.ciudad].some((v) => v.trim() !== "")) {
      // Domicilio nacional informado (completo, ya garantizado por erroresDomicilioReceptor): departamento, distrito y ciudad existen y forman la cadena jerárquica del catálogo.
      const g = await db.query(
        `SELECT EXISTS (SELECT 1 FROM referencia_geografica_departamentos d WHERE d.codigo = $1::int AND d.activo) AS dep,
                EXISTS (SELECT 1 FROM referencia_geografica_distritos di WHERE di.departamento_codigo = $1::int AND di.codigo = $2::int AND di.activo) AS dis,
                EXISTS (SELECT 1 FROM referencia_geografica_ciudades ci WHERE ci.departamento_codigo = $1::int AND ci.distrito_codigo = $2::int AND ci.codigo = $3::int AND ci.activo) AS ciu,
                (SELECT d.nombre FROM referencia_geografica_departamentos d WHERE d.codigo = $1::int AND d.activo) AS "depNombre",
                (SELECT di.nombre FROM referencia_geografica_distritos di WHERE di.departamento_codigo = $1::int AND di.codigo = $2::int AND di.activo) AS "disNombre",
                (SELECT ci.nombre FROM referencia_geografica_ciudades ci WHERE ci.departamento_codigo = $1::int AND ci.distrito_codigo = $2::int AND ci.codigo = $3::int AND ci.activo) AS "ciuNombre"`,
        [r.departamento.trim(), r.distrito.trim(), r.ciudad.trim()],
      );
      const f = g.rows[0] as F | undefined;

      if (f?.dep !== true) throw new ErrorGeografia(`El departamento de la ${cual} no existe en el catálogo.`);
      if (f.dis !== true) throw new ErrorGeografia(`El distrito de la ${cual} no existe en el departamento indicado.`);
      if (f.ciu !== true) throw new ErrorGeografia(`La ciudad de la ${cual} no corresponde al departamento y distrito indicados.`);
      nombres.departamento = s(f.depNombre); nombres.distrito = s(f.disNombre); nombres.ciudad = s(f.ciuNombre);
    }

    return nombres;
  } catch (error) {
    if (error instanceof ErrorGeografia) throw new ErrorFacturacion(422, `${error.message} ${seleccionada ? "Corrija la dirección seleccionada en Clientes → Direcciones antes de facturar (no se reemplaza por el domicilio fiscal)." : "Corrija la dirección fiscal del cliente en Clientes antes de facturar."}`);
    throw error;
  }
}

/** PRO-328: ¿Está aplicada NEX-076 (lectura autorizada de la dirección seleccionada y emisión que la verifica bajo bloqueo)? */
async function receptorSeleccionadoSoportado(db: Db): Promise<boolean> {
  const r = await db.query(
    "SELECT to_regprocedure('public.fe_documento_crear_fe_receptor(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid,uuid)') IS NOT NULL AND to_regprocedure('public.fe_direccion_receptor_elegida(uuid,uuid,uuid,uuid)') IS NOT NULL AS ok",
  );

  return (r.rows[0] as F | undefined)?.ok === true;
}

export const MENSAJE_RECEPTOR_SIN_MIGRACION = "Usar la dirección seleccionada como domicilio del receptor de la factura requiere la migración NEX-076 en la base de datos (aún no aplicada). No se emite con el domicilio fiscal en su lugar.";
export const MENSAJE_RECEPTOR_CAMBIO = "La dirección del receptor (dirección seleccionada o domicilio fiscal) cambió desde la revisión. Revise la factura de nuevo antes de enviarla.";
export const MENSAJE_DESTINO_NO_COMPROBABLE = "No se puede comprobar que la dirección seleccionada sea la de la factura ya creada con esta clave (falta la migración NEX-076). No se vuelve a crear ni a modificar: consulte o reintente su envío desde Documentos electrónicos.";

/**
 * PRO-328: domicilio del receptor de una FE NUEVA con dirección seleccionada. El navegador solo envía el UUID; país, calle, número y CÓDIGOS oficiales de departamento / distrito / ciudad se leen de ESA MISMA fila
 * con la función autorizada de NEX-076 (empresa, cliente, permiso y elegibilidad), sin mezclar ningún dato del domicilio fiscal (los huecos quedan vacíos y la validación los rechaza). Identidad y contacto del receptor
 * (RUC, nombre, teléfonos, correos, tipo de operación) no cambian. Sin NEX-076: 422 claro, nunca el fiscal en silencio.
 */
async function receptorSeleccionado(db: Db, empresaId: string, usuarioId: string, clienteId: string, direccionId: string, fiscal: ReceptorFE): Promise<ReceptorFE> {
  if (!(await receptorSeleccionadoSoportado(db))) throw new ErrorFacturacion(422, MENSAJE_RECEPTOR_SIN_MIGRACION);

  const r = await db.query(
    `SELECT o_id AS id, o_pais_codigo AS pais, o_direccion AS direccion, o_numero_casa AS "numeroCasa", o_departamento_codigo AS departamento, o_distrito_codigo AS distrito, o_ciudad_codigo AS ciudad
       FROM fe_direccion_receptor_elegida($1::uuid, $2::uuid, $3::uuid, $4::uuid)`,
    [empresaId, usuarioId, clienteId, direccionId],
  );
  const f = r.rows[0] as F | undefined;

  if (!f || s(f.id).toLowerCase() !== direccionId.toLowerCase()) throw new ErrorFacturacion(422, MENSAJE_ENTREGA_INVALIDA);

  return { ...fiscal, pais: s(f.pais), direccion: s(f.direccion), numeroCasa: s(f.numeroCasa), departamento: s(f.departamento), distrito: s(f.distrito), ciudad: s(f.ciudad), origenDomicilio: "SELECCIONADA" };
}

/** Claves del domicilio del receptor en el JSON (D203, D213, D218, D219, D221, D223). */
const CLAVES_DOMICILIO = ["cPaisRec", "dDirRec", "dNumCasRec", "cDepRec", "cDisRec", "cCiuRec"] as const;

/** PRO-328: huella del domicilio del receptor TAL COMO va en el JSON (más el UUID de la dirección seleccionada): el operador revisa exactamente esto y la emisión de una FE nueva lo exige igual. */
export function huellaReceptor(payload: Record<string, unknown>, direccionId: string | null): string {
  const domicilio = Object.fromEntries(CLAVES_DOMICILIO.map((k) => [k, payload[k] ?? null]));

  return createHash("sha256").update(JSON.stringify({ direccionId: direccionId === null ? null : direccionId.toLowerCase(), domicilio }), "utf8").digest("hex");
}

/** ¿Está aplicada NEX-073 (la base honra la fecha de emisión elegida)? */
async function fechaEmisionSoportada(db: Db): Promise<boolean> {
  const r = await db.query("SELECT to_regprocedure('public.fe_emision_fecha_soportada()') IS NOT NULL AS ok");

  return (r.rows[0] as F | undefined)?.ok === true;
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

/** Cotización usada, equivalente en guaraníes (F023, exacto) y si difiere de la última del catálogo (solo informativo: la cotización es manual). */
async function resumenCambio(db: Db, empresaId: string, moneda: string, cambio: string, total: Dec | null) {
  const catalogo = await cotizacionVigente(db, empresaId, moneda);

  return {
    valor: cambio,
    totalGs: total === null ? "" : textoDec(totalEnGuaranies(total, cambio) ?? B(0)),
    catalogo,
    modificado: catalogo !== null && catalogo.cambio !== cambio,
  };
}

/** Lectura de las condiciones de crédito para la previa y el modal de confirmación (los valores ya fueron validados). */
function resumenCredito(c: CreditoEntrada, total: Dec | null) {
  const entrega = c.entrega !== null ? parseDec(c.entrega, 4) ?? B(0) : B(0);

  return {
    tipo: c.tipo === CREDITO_PLAZO ? "Plazo" : "Cuotas",
    plazo: c.tipo === CREDITO_PLAZO && c.plazoDias !== null ? plazoTexto(c.plazoDias) : null,
    entrega: textoDec(entrega),
    saldo: total === null ? "" : textoDec(total - entrega),
    cuotas: c.cuotas.map((q, i) => ({ numero: i + 1, monto: q.monto, vencimiento: q.vencimiento })),
  };
}

const ETIQUETA_TRANSACCION = TIPOS_TRANSACCION as Record<number, string>;
const ETIQUETA_PRESENCIA = INDICADORES_PRESENCIA as Record<number, string>;
const ETIQUETA_PAGO = FORMAS_PAGO as Record<number, string>;

/** Dato legible del medio para la previa (nunca el número de tarjeta: no se recolecta). */
function detallePago(p: PagoEntrada): string {
  if (p.cheque) return `cheque ${p.cheque.numero} · ${p.cheque.banco}`;
  if (p.tarjeta) return `${DENOMINACIONES_TARJETA[p.tarjeta.denominacion] === "Otro" ? p.tarjeta.descripcion ?? "Otro" : DENOMINACIONES_TARJETA[p.tarjeta.denominacion] ?? ""} · ${FORMAS_PROCESAMIENTO[p.tarjeta.formaProcesamiento] ?? ""}`;

  return p.descripcion ?? "";
}

/**
 * Valida y calcula la factura SIN escribir nada ni reservar número: es la base de la previa («Grabar») y de la emisión. Todo sale de los cadastros de la
 * empresa de la sesión y se recalcula en el servidor. Lanza ErrorFacturacion / ErrorValidacionFiscal (422) con los motivos.
 */
export async function prepararFactura(db: Db, empresaId: string, usuarioId: string, cuerpo: CuerpoFactura, opciones: { documentoExiste?: () => Promise<boolean>; domicilioHistorico?: boolean } = {}) {
  const condicion = cuerpo.condicion ?? CONDICION_CONTADO;
  const moneda: Moneda = cuerpo.moneda ?? "PYG";
  const cambio = moneda === "PYG" ? undefined : cuerpo.cambio;

  // Cuotas suspendido (MFE-03): también aquí, por si el cuerpo no pasó por leerCuerpoFactura. Antes de cualquier consulta y, por tanto, antes de reservar numeración (NEX-048).
  if (cuerpo.credito?.tipo === CREDITO_CUOTAS && !CUOTAS_HABILITADAS) throw new ErrorFacturacion(422, MENSAJE_CUOTAS_SUSPENDIDAS);
  if (cuerpo.pagos.some((p) => !(p.tipo in FORMAS_PAGO))) throw new ErrorFacturacion(422, "La forma de pago no es válida.");

  // Vendedor estructurado (NEX-074): sin la migración no hay dónde registrarlo y no se emite con el emisor "por defecto"; se rechaza ANTES de reservar numeración.
  if (!(await vendedorFeSoportado(db))) throw new ErrorFacturacion(422, "Elegir el vendedor de la factura requiere la migración NEX-074 en la base de datos (aún no aplicada).");

  // D002: fecha de emisión elegida. Una FE NUEVA debe estar dentro de la selección comercial y de la ventana fiscalmente habilitada (antes de cualquier reserva); un reintento de una FE ya creada conserva su fecha original (se compara en la equivalencia).
  const hoyFecha = hoyParaguay();
  const fechaElegida = cuerpo.fechaEmision ?? hoyFecha;

  if (opciones.domicilioHistorico !== true) {
    const f = evaluarFechaEmision(fechaElegida, hoyFecha);

    if (!f.ok) throw new ErrorFacturacion(422, f.error);
    // NEX-073 (fecha elegida) no aplicada: la función antigua ignoraría la fecha; se rechaza en vez de emitir con otra.
    if (fechaElegida !== hoyFecha && !(await fechaEmisionSoportada(db))) throw new ErrorFacturacion(422, "Elegir una fecha de emisión distinta de hoy requiere la migración NEX-073 en la base de datos (aún no aplicada). Use la fecha de hoy.");
  }

  const [receptorFiscal, aptitud, productos, punto] = await Promise.all([
    receptorDe(db, empresaId, cuerpo.clienteId),
    evaluarAptitudCliente(db as never, empresaId, cuerpo.clienteId),
    db.query(`${SELECT_PRODUCTOS} AND p.id = ANY($2::uuid[])`, [empresaId, [...new Set(cuerpo.lineas.map((l) => l.productoId))]]),
    // Sucursal activa en el alcance del usuario, con establecimiento SIFEN, y punto de expedición activo de ESA sucursal.
    db.query(
      `SELECT e.razon_social AS empresa, sc.nombre AS sucursal, sc.establecimiento_sifen AS establecimiento, p.codigo AS punto, p.nombre AS "puntoNombre"
         FROM sucursales sc JOIN empresas e ON e.id = sc.empresa_id
         JOIN fe_puntos_expedicion p ON p.empresa_id = sc.empresa_id AND p.sucursal_id = sc.id AND p.id = $3
         JOIN fe_punto_secuencias fs ON fs.empresa_id = p.empresa_id AND fs.punto_id = p.id AND fs.tipo_documento = 'FE' AND fs.activo
        WHERE sc.empresa_id = $1 AND sc.id = $2 AND sc.activo AND sc.establecimiento_sifen IS NOT NULL AND sucursal_en_alcance($1::uuid, $4::uuid, sc.id)`,
      [empresaId, cuerpo.sucursalId, cuerpo.puntoId, usuarioId],
    ),
  ]);

  // Reintento de una FE ya creada y verificada (domicilioHistorico): la aptitud ACTUAL del cadastro no se reevalúa (la FE ya congeló sus datos); la equivalencia se prueba después en crearFacturaElectronica. Una FE nueva siempre la exige.
  if (aptitud && !aptitud.apto && opciones.domicilioHistorico !== true) throw detalles(422, "El cliente tiene datos fiscales pendientes de regularizar.", aptitud.pendientes);
  // El vendedor se revalida en el servidor (empresa de la sesión, usuario ACTIVO con el perfil Vendedor); un reintento de una FE ya creada conserva su vendedor original (se compara en la equivalencia).
  const vendedor = await vendedorActivo(db, empresaId, cuerpo.vendedorId);

  if (!vendedor && opciones.domicilioHistorico !== true) throw new ErrorFacturacion(422, "El vendedor elegido no existe en la empresa, está inactivo o no tiene el perfil Vendedor. Elija otro en Maestros → Vendedores.");

  // E04: el destino de entrega debe ser una dirección registrada de ESTE cliente y ESTA empresa; con destinos registrados hay que elegir uno, sin destinos la FE sale sin destino. Antes de reservar numeración.
  // Reintento de una FE YA creada (misma clave): el destino ya quedó guardado y es inmutable; si la dirección del catálogo se editó o eliminó después, el reintento NO la vuelve a exigir (PRO-205).
  const destino = opciones.documentoExiste && (await opciones.documentoExiste()) ? ({ ok: true, opcion: null } as const) : resolverEntrega(await opcionesEntrega(db, empresaId, usuarioId, cuerpo.clienteId), cuerpo.direccionEntregaId);

  if (!destino.ok) throw new ErrorFacturacion(422, destino.error);

  // PRO-328: en una FE NUEVA con dirección seleccionada, ESA dirección (misma fila, con sus códigos oficiales, leída por la función autorizada de NEX-076) es el domicilio principal del receptor en el JSON; sin
  // destinos, el domicilio fiscal como hasta ahora. Un reintento de una FE ya creada reutiliza su payload histórico (destino.opcion es null): nada se recompone.
  const receptor = destino.opcion && opciones.domicilioHistorico !== true ? await receptorSeleccionado(db, empresaId, usuarioId, cuerpo.clienteId, destino.opcion.id, receptorFiscal) : receptorFiscal;

  // PRO-322: país y domicilio del receptor (códigos) validados contra el catálogo geográfico antes de cualquier reserva (la dirección seleccionada con las mismas reglas que el fiscal).
  // Una FE ya creada (reintento de la misma clave) conserva su payload original: el domicilio y el catálogo actuales no se reevalúan.
  const nombresGeo = opciones.domicilioHistorico !== true ? await validarGeografiaReceptor(db, receptor) : null;

  if (punto.rows.length === 0) throw new ErrorFacturacion(422, "La sucursal o el punto de expedición no son válidos (inactivos, sin establecimiento SIFEN o fuera de su alcance).");

  const porId = new Map((productos.rows as F[]).map((p) => [s(p.id), p]));
  const lineas: LineaFE[] = [];
  const lineasStock: LineaStock[] = [];
  const precios: Array<{ referencia: string; modificado: boolean }> = [];
  const extras: Array<{ campos: string[]; unidadSimbolo: string }> = [];
  const guardar: ClasificacionGuardar[] = [];
  let puedePrecio: boolean | null = null;

  // Ajuste fiscal por ítem (PRO-93 Fase A): exige su propio permiso; «guardar en Productos» exige además PRODUCTOS.EDITAR. Se verifica ANTES de tocar nada.
  const conAjuste = cuerpo.lineas.some((l) => l.ajuste !== undefined);

  if (conAjuste && !(await permisoAjusteFiscal(db, empresaId, usuarioId))) {
    throw new ErrorFacturacion(403, "No tiene permiso para ajustar los datos fiscales de los ítems en la factura (FACTURACION_ELECTRONICA.AJUSTE_FISCAL). Corrija el producto en Productos.");
  }
  if (cuerpo.lineas.some((l) => l.ajuste?.guardarClasificacion) && !(await permisoEditarProductos(db, empresaId, usuarioId))) {
    throw new ErrorFacturacion(403, "No tiene permiso para guardar en Productos (PRODUCTOS.EDITAR): use «Solo esta factura».");
  }

  const unidadesPedidas = [...new Set(cuerpo.lineas.flatMap((l) => (l.ajuste?.unidadSifen !== undefined ? [l.ajuste.unidadSifen] : [])))];
  const catalogoUnidades = new Map<number, { vigente: boolean; simbolo: string }>();

  if (unidadesPedidas.length > 0) {
    const u = await db.query("SELECT codigo, representacion, vigente FROM unidades_medida_sifen WHERE codigo = ANY($1::int[])", [unidadesPedidas]);

    for (const fila of u.rows as F[]) catalogoUnidades.set(Number(fila.codigo), { vigente: fila.vigente === true, simbolo: s(fila.representacion) });
  }

  for (const l of cuerpo.lineas) {
    const p = porId.get(l.productoId);

    if (!p) throw new ErrorFacturacion(422, "Uno de los productos no existe, está inactivo, no está marcado como vendible o no es facturable (solo mercadería y servicios).");

    const a = l.ajuste;
    const campos: string[] = [];
    let unidadSifen = p.unidadSifen === null ? null : Number(p.unidadSifen);
    let unidadSimbolo = s(p.unidadSimbolo);

    if (a?.unidadSifen !== undefined) {
      const u = catalogoUnidades.get(a.unidadSifen);

      if (!u) throw new ErrorFacturacion(422, `El código SIFEN ${a.unidadSifen} de la unidad elegida para el producto ${s(p.codigo)} no existe en el catálogo oficial.`);
      if (!u.vigente) throw new ErrorFacturacion(422, `El código SIFEN ${a.unidadSifen} de la unidad elegida para el producto ${s(p.codigo)} no está vigente en el catálogo oficial.`);
      unidadSifen = a.unidadSifen; unidadSimbolo = u.simbolo; campos.push("unidad SIFEN");
    } else {
      if (p.unidadSifen === null) throw new ErrorFacturacion(422, `El producto ${s(p.codigo)} no tiene unidad de medida con equivalencia SIFEN: no se puede facturar hasta vincularla en Catálogos.`);
      if (p.unidadVigente === null) throw new ErrorFacturacion(422, `El código SIFEN ${s(p.unidadSifen)} de la unidad del producto ${s(p.codigo)} no existe en el catálogo oficial.`);
      if (p.unidadVigente === false) throw new ErrorFacturacion(422, `El código SIFEN ${s(p.unidadSifen)} de la unidad del producto ${s(p.codigo)} no está vigente en el catálogo oficial.`);
    }

    let afectacion = p.afectacion === null ? null : Number(p.afectacion);
    let tasa = p.tasa === null ? null : Number(p.tasa);
    let proporcion = p.proporcion === null ? null : s(p.proporcion);

    if (a?.afectacion !== undefined) {
      afectacion = a.afectacion; tasa = a.tasa ?? null; proporcion = a.afectacion === 4 ? (a.proporcion ?? null) : null; campos.push("IVA");
      if (a.guardarClasificacion && tasa !== null) guardar.push({ productoId: s(p.id), codigo: s(p.codigo), afectacion, tasa, proporcion });
    }

    const descripcion = a?.descripcion !== undefined ? a.descripcion : s(p.descripcion);
    const gtin = a?.gtin !== undefined ? a.gtin : p.gtin === null ? null : s(p.gtin);

    if (a?.descripcion !== undefined) campos.push("descripción fiscal");
    if (a?.gtin !== undefined) campos.push("GTIN");

    // El precio de referencia del catálogo manda SOLO si está en la MISMA moneda de la factura (jamás se convierte en silencio un precio de lista). Un precio distinto del navegador (o el de
    // un producto SIN precio de lista en esa moneda) solo se acepta con el permiso FACTURACION_ELECTRONICA.PRECIO (consultado en el servidor); es siempre positivo, con a lo sumo 4
    // decimales, IVA incluido, y queda en el payload inmutable.
    const referencia = p.precio !== null && precioEnMoneda(s(p.monedaPrecio), moneda) ? parseDec(s(p.precio), 8) : null;

    if (referencia === null && l.precio === null) throw new ErrorFacturacion(422, `El producto ${s(p.codigo)} no tiene precio de venta de referencia en ${moneda === "PYG" ? "guaraníes" : moneda}${moneda === "PYG" ? "" : " (no se convierte el precio de otra moneda): escriba el precio en esa moneda"}.`);

    const propuesto = l.precio === null ? null : parseDec(l.precio, 4);

    // Un precio escrito jamás se sustituye por el de lista: si no se puede escribir en el documento electrónico sin cambiar su valor, se RECHAZA con el motivo (antes de reservar numeración).
    if (l.precio !== null && propuesto !== null && !precioSerializable(l.precio)) {
      throw new ErrorFacturacion(422, `El precio escrito para el producto ${s(p.codigo)} (${l.precio}) no puede escribirse en el documento electrónico sin perder precisión. Reduzca el precio; no se usa el precio de lista en su lugar.`);
    }
    const modificado = propuesto !== null && (referencia === null || propuesto !== referencia);

    if (l.precio !== null && (propuesto === null || propuesto <= parseDec("0", 0)!)) throw new ErrorFacturacion(422, `El precio del producto ${s(p.codigo)} debe ser mayor que cero.`);
    if (modificado) {
      puedePrecio ??= await permisoPrecio(db, empresaId, usuarioId);

      if (!puedePrecio) throw new ErrorFacturacion(403, `No tiene permiso para modificar el precio del producto ${s(p.codigo)}. Se factura con el precio de lista.`);
    }
    // E01: todas las unidades (también SIFEN 77/UNI) admiten cantidades fraccionarias (hasta 4 decimales, validadas por el cálculo fiscal).
    precios.push({ referencia: referencia === null ? "" : s(p.precio), modificado });
    lineasStock.push({ productoId: s(p.id), codigo: s(p.codigo), descripcion, cantidad: l.cantidad, controlaStock: p.controlaStock === true });
    extras.push({ campos, unidadSimbolo });

    lineas.push({
      codigoInterno: s(p.codigo), gtin, descripcion, unidadSifen, cantidad: l.cantidad, precio: modificado ? (l.precio as string) : s(p.precio), afectacion, tasa, proporcion, ...(l.descuento ? { descuento: l.descuento } : {}),
    });
  }

  // J003 dInfAdic: observaciones del operador + vendedor COMERCIAL elegido (revalidado; no el usuario que emite), compuestos AQUÍ en el servidor. PRO-328: una FE NUEVA ya NO lleva la línea automática
  // «Dirección de entrega: …» (la dirección seleccionada viaja como domicilio del receptor); lo que el operador escriba en las observaciones se preserva literalmente. Un reintento de una emisión ya creada
  // reutiliza el texto persistido (también el de una FE legada que sí tiene esa línea).
  const persistida = opciones.documentoExiste && (await opciones.documentoExiste()) ? await infoAdicionalPersistida(db, empresaId, cuerpo.claveIdempotencia) : undefined;
  const infoAdicional = persistida !== undefined
    ? (persistida ?? "")
    : componerInfoAdicional({ observaciones: cuerpo.infoAdicional, vendedor: vendedor ? lineaVendedor(vendedor.nombre, vendedor.apellido) : null });

  if (infoAdicional.length > LIMITE_INFO_ADICIONAL) throw new ErrorFacturacion(422, `La información adicional (observaciones + vendedor) tiene ${infoAdicional.length} caracteres y el máximo es ${LIMITE_INFO_ADICIONAL}. Acorte las observaciones; no se recorta automáticamente.`);

  const base = { moneda, ...(cambio !== undefined ? { cambio } : {}), tipoTransaccion: cuerpo.tipoTransaccion, presencia: cuerpo.presencia, condicion, ...(cuerpo.credito ? { credito: cuerpo.credito } : {}), infoAdicional, receptor, lineas, ...(cuerpo.descuentoGlobal ? { descuentoGlobal: cuerpo.descuentoGlobal } : {}) };
  // Contado: el pago único cubre el total que calcula el servidor (nunca un monto del navegador). Crédito: el único pago es la entrega inicial (si la hay); el resto se valida
  // contra el total del servidor (entrega + cuotas = total) y nunca se cuenta dos veces.
  const total = totalFactura(lineas, cuerpo.descuentoGlobal);
  const enCredito = condicion === CONDICION_CREDITO;
  const entrega = enCredito ? cuerpo.credito?.entrega ?? null : null;

  if (total === null) throw detalles(422, "La factura no cumple las reglas fiscales.", validarEntradaFE({ ...base, pagos: cuerpo.pagos.map((p) => ({ ...p, monto: p.monto ?? "1" })) }));

  // Medios de pago. Contado: suman el total. Crédito: SOLO la entrega inicial (E645), nunca el saldo financiado; sin entrega no hay pagos (un único medio sin datos ni monto, forma
  // anterior de la pantalla, se ignora). Un único medio sin monto cubre todo el objetivo; con varios, cada uno trae el suyo. La suma EXACTA la concilia validarEntradaFE.
  const objetivo = enCredito ? (entrega !== null ? parseDec(entrega, 4) : null) : total;
  const soloTipo = cuerpo.pagos.length === 1 && cuerpo.pagos[0].monto === undefined && !cuerpo.pagos[0].cheque && !cuerpo.pagos[0].tarjeta && !cuerpo.pagos[0].descripcion;
  let pagosFinal: Array<PagoEntrada & { monto: string }> = [];

  if (enCredito && objetivo === null) {
    if (cuerpo.pagos.length > 0 && !soloTipo) throw new ErrorFacturacion(422, "Sin entrega inicial no se informan medios de pago: el saldo se financia a plazo.");
  } else if (objetivo !== null) {
    const r = resolverMontos(cuerpo.pagos, objetivo);

    if ("errores" in r) throw detalles(422, "La factura no cumple las reglas fiscales.", r.errores);
    pagosFinal = cuerpo.pagos.map((p, i) => ({ ...p, monto: r.montos[i] }));
  }

  const final: EntradaFE = { ...base, pagos: pagosFinal };
  const errores = validarEntradaFE(final, undefined, { domicilioHistorico: opciones.domicilioHistorico });

  if (errores.length > 0) throw detalles(422, "La factura no cumple las reglas fiscales.", errores);

  const payload = construirPayloadFE(final, undefined, { domicilioHistorico: opciones.domicilioHistorico }) as { Subtotales: Array<{ dTotGralOpe: number }> } & Record<string, unknown>;

  // La fecha solo viaja a la base si difiere de hoy (la función SQL la valida y la fija como dFeEmiDE/fecha_emision; no queda en el snapshot que se envía). Sin ella el payload es el de siempre.
  if (fechaElegida !== hoyFecha) payload[CLAVE_FECHA_SOLICITADA] = fechaElegida;
  const calculo = resumenCalculo(lineas, cuerpo.descuentoGlobal);
  const fila = punto.rows[0] as F;
  const resumen = {
    empresa: s(fila.empresa),
    sucursal: s(fila.sucursal),
    establecimiento: s(fila.establecimiento),
    punto: s(fila.punto),
    numero: "Se asigna al enviar la factura",
    fechaEmision: fechaElegida,
    vendedor: vendedor ? { id: vendedor.id, nombre: vendedor.nombreCompleto } : null,
    cliente: { codigo: receptor.codigo, razonSocial: receptor.razonSocial, documento: receptor.naturaleza === 1 ? `${receptor.ruc}-${receptor.dv}` : receptor.numeroDocumento },
    tipoTransaccion: ETIQUETA_TRANSACCION[cuerpo.tipoTransaccion] ?? "",
    presencia: ETIQUETA_PRESENCIA[cuerpo.presencia] ?? "",
    condicion: CONDICIONES_OPERACION[condicion] ?? "",
    // Contado: medio del total. Crédito: medio de la entrega inicial (vacío sin entrega).
    formaPago: pagosFinal.map((p) => ETIQUETA_PAGO[p.tipo] ?? "").join(" + "),
    pagos: pagosFinal.map((p) => ({ medio: ETIQUETA_PAGO[p.tipo] ?? "", monto: p.monto, detalle: detallePago(p) })),
    ...(enCredito && cuerpo.credito ? { credito: resumenCredito(cuerpo.credito, total) } : {}),
    moneda,
    ...(cambio !== undefined ? { cambio: await resumenCambio(db, empresaId, moneda, cambio, total) } : {}),
    lineas: lineas.map((l, i) => ({ codigo: l.codigoInterno, descripcion: l.descripcion, unidad: extras[i].unidadSimbolo, ...(extras[i].campos.length > 0 ? { ajustes: extras[i].campos } : {}), cantidad: l.cantidad, precio: l.precio, precioLista: precios[i].referencia, precioModificado: precios[i].modificado, afectacion: l.afectacion, tasa: l.tasa, proporcion: l.afectacion === 4 ? l.proporcion : null, total: calculo.items[i], totalTexto: calculo.texto.items[i], ...(calculo.descuentos.hay ? { descuento: calculo.descuentos.items[i] } : {}) })),
    totales: { exento: calculo.exento, exonerado: calculo.exonerado, gravado5: calculo.gravado5, gravado10: calculo.gravado10, iva5: calculo.iva5, iva10: calculo.iva10, totalIva: calculo.totalIva, total: calculo.total },
    totalesTexto: calculo.texto,
    // E04: destino de entrega elegido (null = el cliente no tiene destinos registrados). PRO-328: en una FE nueva es también el domicilio del receptor (ver receptorDomicilio); el maestro del cliente no cambia.
    entrega: destino.opcion ? resumenEntrega(destino.opcion) : null,
    // PRO-328: domicilio del receptor EXACTAMENTE como va en el JSON (país, calle, número y códigos; nombres oficiales del catálogo solo para leer) y su huella, que la emisión exige igual.
    receptorDomicilio: {
      origen: receptor.origenDomicilio === "SELECCIONADA" ? "SELECCIONADA" : "FISCAL",
      pais: s(payload.cPaisRec),
      direccion: s(payload.dDirRec),
      numeroCasa: s(payload.dNumCasRec),
      departamento: s(payload.cDepRec),
      distrito: s(payload.cDisRec),
      ciudad: s(payload.cCiuRec),
      nombres: nombresGeo,
    },
    receptorHuella: huellaReceptor(payload, destino.opcion ? destino.opcion.id : null),
    // E1: texto J003 final (lo que viajará en dInfAdic) y su huella: el operador revisa EXACTAMENTE esto y la emisión lo verifica.
    infoAdicional,
    infoAdicionalHuella: huellaInfoAdicional(infoAdicional),
    // E03: descuentos informados (solo si hay alguno): por ítem (unitario, %, global, total) y totales F009/F033/F011 + F010.
    ...(calculo.descuentos.hay ? { descuentos: calculo.descuentos } : {}),
  };

  return { entrada: final, payload, totalTexto: String(payload.Subtotales[0].dTotGralOpe), receptor, resumen, guardar, lineasStock, entrega: destino.opcion, infoReutilizada: persistida !== undefined };
}

/**
 * Crea la Factura Electrónica (documento + payload inmutable, número reservado UNA vez) de forma idempotente. La clave de idempotencia evita duplicados
 * ante doble clic, reintento o pérdida de respuesta. Solo se llama al CONFIRMAR el envío: revisar o volver a editar no consume numeración.
 */
export async function crearFacturaElectronica(db: Db, empresaId: string, usuarioId: string, cuerpo: CuerpoFactura, salida?: { guardar: ClasificacionGuardar[] }) {
  // ¿La FE de esta clave ya existe? (doble clic, respuesta perdida, reintento): entonces ni el stock ni el destino se vuelven a evaluar; PostgreSQL devuelve el documento existente sin tocar inventario ni destino.
  // La consulta es perezosa: se hace después de las validaciones previas (p. ej. Cuotas suspendidas se rechaza sin tocar la base) y se reutiliza abajo.
  let existencia: boolean | null = null;
  const documentoExiste = async () => {
    if (existencia === null) existencia = ((await db.query("SELECT 1 AS ok FROM documentos_electronicos WHERE empresa_id = $1::uuid AND clave_idempotencia = $2", [empresaId, cuerpo.claveIdempotencia])).rows as F[]).length > 0;

    return existencia;
  };
  // F002-R02: si la FE de esta clave ya existe, solo se reutiliza su payload original (verificado contra el hash de entrada guardado, de la misma empresa) cuando la operación comercial del reintento es equivalente; si no, 409.
  const historico = (await documentoExiste()) ? await payloadHistorico(db, empresaId, cuerpo.claveIdempotencia) : null;
  const preparada = await prepararFactura(db, empresaId, usuarioId, cuerpo, { documentoExiste, domicilioHistorico: historico !== null });
  const { receptor, guardar, lineasStock, resumen } = preparada;
  // PRO-328: con NEX-076 la emisión pasa SIEMPRE por fe_documento_crear_fe_receptor (verifica bajo bloqueo la dirección seleccionada y, en un reintento, la identidad del destino por UUID persistido).
  const conReceptor = await receptorSeleccionadoSoportado(db);
  const noEquivalente = historico ? await equivalente(db, empresaId, historico, preparada.payload, cuerpo, conReceptor) : null;

  if (noEquivalente !== null) throw new ErrorFacturacion(409, noEquivalente);

  const payload = historico ? historico.payload : preparada.payload;
  const totalTexto = historico ? String((historico.payload as { Subtotales: Array<{ dTotGralOpe: number }> }).Subtotales[0].dTotGralOpe) : preparada.totalTexto;
  const documentoExistente = await documentoExiste();

  // E1-F003: un documento NUEVO solo se crea con el dInfAdic que el operador revisó (observaciones y nombre del vendedor releído del servidor); si cambiaron entre la previa y el envío, se exige revisar de nuevo, sin reservar numeración.
  // Una repetición de una clave ya creada reutiliza el snapshot persistido y no se compara.
  if (!documentoExistente && cuerpo.infoAdicionalHuella !== undefined && cuerpo.infoAdicionalHuella !== resumen.infoAdicionalHuella) throw new ErrorFacturacion(409, MENSAJE_INFO_CAMBIO);
  // PRO-328: un documento NUEVO solo se crea con el domicilio del receptor que el operador revisó (dirección seleccionada releída ahora); si cambió se revisa de nuevo, sin reservar numeración. Con dirección
  // seleccionada la huella es OBLIGATORIA (sin ella también 409); la huella de reparto o de dInfAdic no la sustituye. La función SQL vuelve a verificar la misma dirección bajo bloqueo al crear.
  if (!documentoExistente && (cuerpo.receptorHuella !== undefined || cuerpo.direccionEntregaId !== undefined) && cuerpo.receptorHuella !== resumen.receptorHuella) throw new ErrorFacturacion(409, MENSAJE_RECEPTOR_CAMBIO);

  if (salida) salida.guardar = guardar;

  // E02: control y baja de stock en la MISMA transacción que la FE (fe_documento_crear_fe_con_stock). Una repetición de la misma clave (doble clic, respuesta perdida, reintento) NO vuelve a evaluar el stock:
  // la FE ya existe y el stock ya se bajó; PostgreSQL devuelve el documento existente sin tocar inventario.
  let asignaciones: ReturnType<typeof asignacionesSql> = [];

  if (!documentoExistente && lineasStock.some((l) => l.controlaStock)) {
    const plan = await planificarStock(db, empresaId, usuarioId, cuerpo.sucursalId, lineasStock);

    if (!plan.suficiente) throw new ErrorFacturacion(409, mensajeStockInsuficiente(plan));
    // El reparto que se baja es EXACTAMENTE el que el operador revisó; si el stock cambió y el reparto ya no coincide, se exige revisar de nuevo (no se sustituye en silencio).
    if (plan.salidas.length > 0 && cuerpo.repartoHuella !== plan.huella) throw new ErrorFacturacion(409, MENSAJE_REPARTO_CAMBIO);
    asignaciones = asignacionesSql(plan);
  }

  const documento = receptor.naturaleza === 1 ? `${receptor.ruc}-${receptor.dv}` : receptor.numeroDocumento;
  const llamar = () =>
    db.query(`SELECT o_documento_id AS "documentoId", o_numero AS numero, o_reutilizado AS reutilizado FROM ${conReceptor ? "fe_documento_crear_fe_receptor" : "fe_documento_crear_fe_vendedor"}($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::uuid, $7, $8, $11, $9::numeric, $10::jsonb, $12::jsonb, $13::uuid, $14::uuid)`,
      [empresaId, usuarioId, cuerpo.sucursalId, cuerpo.puntoId, cuerpo.claveIdempotencia, cuerpo.clienteId, documento, receptor.razonSocial, totalTexto, JSON.stringify(payload), cuerpo.moneda ?? "PYG", JSON.stringify(asignaciones), cuerpo.direccionEntregaId ?? null, cuerpo.vendedorId]);

  try {
    return (await llamar()).rows[0] as F;
  } catch (error) {
    // Carrera de la misma clave: la otra transacción ya la confirmó; releer devuelve su documento (o el conflicto si el contenido difiere).
    if ((error as { code?: string }).code === "23505") return (await llamar()).rows[0] as F;
    throw error;
  }
}

type Historico = { payload: Record<string, unknown>; clienteId: string; sucursalId: string; puntoId: string; fecha: string; vendedorId: string };

/**
 * FE existente de esta empresa y clave de idempotencia con su payload ORIGINAL (el que entró a fe_documento_crear_fe, sin las claves que agrega la base: dEst, dPunExp, dNumDoc, dSerieNum, dFeEmiDE),
 * solo si su hash coincide con el `entrada_hash` persistido. Si no se puede comprobar, null.
 */
async function leerPayloadHistorico(db: Db, empresaId: string, clave: string): Promise<Historico | null> {
  // El hash de entrada se calculó sobre el payload tal como entró a la base: sin las claves que ella agrega y, si se eligió otra fecha, CON dFecEmiSol (que la base no deja en el snapshot; se reconstruye desde dFeEmiDE y el hash lo comprueba).
  const r = await db.query(
    `SELECT CASE WHEN encode(sha256(convert_to(p.base::text, 'UTF8')), 'hex') = p.entrada_hash THEN p.base ELSE p.con_fecha END AS payload,
            p.cliente_id AS "clienteId", p.sucursal_id AS "sucursalId", p.punto_id AS "puntoId", left(p.fecha_emi, 10) AS fecha, p.vendedor_id AS "vendedorId" FROM (
       SELECT b.base, b.base || jsonb_build_object('dFecEmiSol', left(b.fecha_emi, 10)) AS con_fecha, b.fecha_emi, b.entrada_hash, b.cliente_id, b.sucursal_id, b.punto_id, b.vendedor_id FROM (
         SELECT s.payload - 'dEst' - 'dPunExp' - 'dNumDoc' - 'dSerieNum' - 'dFeEmiDE' AS base, s.payload->>'dFeEmiDE' AS fecha_emi, s.entrada_hash, d.cliente_id, d.sucursal_id,
                (SELECT v.vendedor_id::text FROM documento_electronico_vendedor v WHERE v.empresa_id = d.empresa_id AND v.documento_id = d.id) AS vendedor_id,
                (SELECT CASE WHEN count(*) = 1 THEN min(x.id::text) END FROM fe_puntos_expedicion x WHERE x.empresa_id = d.empresa_id AND x.sucursal_id = d.sucursal_id AND x.codigo = d.punto_expedicion) AS punto_id
           FROM documento_electronico_solicitudes s
           JOIN documentos_electronicos d ON d.empresa_id = s.empresa_id AND d.id = s.documento_id
          WHERE d.empresa_id = $1::uuid AND d.clave_idempotencia = $2 AND d.tipo = 'FE' AND s.version = 1) b) p
      WHERE encode(sha256(convert_to(p.base::text, 'UTF8')), 'hex') = p.entrada_hash OR encode(sha256(convert_to(p.con_fecha::text, 'UTF8')), 'hex') = p.entrada_hash`,
    [empresaId, clave],
  );
  const f = r.rows[0] as F | undefined;

  return f && f.payload !== null && typeof f.payload === "object" ? { payload: f.payload as Record<string, unknown>, clienteId: s(f.clienteId), sucursalId: s(f.sucursalId), puntoId: s(f.puntoId), fecha: s(f.fecha), vendedorId: s(f.vendedorId) } : null;
}

/** Sin la tabla del vendedor (NEX-074 no aplicada) no se puede probar la equivalencia: null, y prepararFactura rechaza con el motivo claro antes de cualquier reserva. */
async function payloadHistorico(db: Db, empresaId: string, clave: string): Promise<Historico | null> {
  try {
    return await leerPayloadHistorico(db, empresaId, clave);
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") return null;
    throw error;
  }
}

/** Claves de la identidad y el domicilio del receptor: derivan del cadastro ACTUAL del cliente (o de la dirección seleccionada) y no se comparan con el snapshot histórico (la identidad se prueba por cliente_id y el destino por su UUID). */
const CLAVES_RECEPTOR = new Set(["iNatRec", "iTiOpe", "cPaisRec", "iTiContRec", "dRucRec", "dDVRec", "iTipIDRec", "dDTipIDRec", "dNumIDRec", "dNomRec", "dNomFanRec", "dDirRec", "dNumCasRec", "cDepRec", "cDisRec", "cCiuRec", "dTelRec", "dCelRec", "dEmailRec", "dEmailAdic", "dEmailAdmin", "dCodCliente", "dInfAdic"]);

const canonico = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));
const operacionComercial = (p: Record<string, unknown>) => canonico(Object.fromEntries(Object.entries(p).filter(([k]) => !CLAVES_RECEPTOR.has(k) && k !== CLAVE_FECHA_SOLICITADA)));

/**
 * Equivalencia de la operación de un reintento con la FE histórica de la misma clave (la clave por sí sola no lo prueba). Todo debe coincidir, o el llamador responde 409 (equivalencia no demostrable = falla cerrado):
 *  · cliente, sucursal, punto de expedición y VENDEDOR (ID registrado en documento_electronico_vendedor) del documento persistido (el punto se resuelve por su código en esa sucursal; si no es único, no se prueba);
 *  · operación comercial recalculada (ítems, precios, impuestos, descuentos, pagos, moneda, condición) idéntica al payload original;
 *  · observaciones: las enviadas ahora deben ser EXACTAMENTE las del dInfAdic persistido (ver `descomponerInfoAdicional`: sin marca propia, forma única comprobable);
 *  · destino de entrega (PRO-328): SOLO por el UUID persistido en documento_electronico_entregas, que fe_documento_crear_fe_receptor (NEX-076) compara en la misma transacción (otro UUID, o UUID sin registro, o
 *    registro sin UUID enviado = NEX:IDEMPOTENCIA_CONFLICTO → 409). Nunca por el texto del dInfAdic (las FE nuevas ya no lo llevan; el de las legadas solo se conserva) ni por el catálogo actual (editado o eliminado).
 *    Sin NEX-076 no existe un mecanismo autorizado para probar ese UUID: con dirección enviada, 409; sin dirección, se acepta solo si el snapshot no trae una línea legada de entrega (rechazo conservador, no identidad).
 */
async function equivalente(db: Db, empresaId: string, historico: Historico, nuevo: Record<string, unknown>, cuerpo: CuerpoFactura, conReceptor: boolean): Promise<string | null> {
  const OTRO = "La clave de la operación ya se usó con otro contenido. Recargue el formulario e intente de nuevo.";

  if (historico.clienteId !== cuerpo.clienteId || historico.sucursalId !== cuerpo.sucursalId || historico.puntoId.toLowerCase() !== cuerpo.puntoId.toLowerCase()) return OTRO;
  if (cuerpo.fechaEmision !== undefined && cuerpo.fechaEmision !== historico.fecha) return OTRO;
  if (operacionComercial(historico.payload) !== operacionComercial(nuevo)) return OTRO;

  const guardada = typeof historico.payload.dInfAdic === "string" ? historico.payload.dInfAdic : null;
  const partes = descomponerInfoAdicional(guardada);
  const enviada = cuerpo.infoAdicional.trim();

  if (partes === null || contieneMarcaAutomatica(enviada) || partes.observacion !== enviada.replace(/\r\n/g, "\n")) return OTRO;

  // Vendedor. FE posterior a NEX-074: el ID registrado debe ser el mismo. FE ANTERIOR (sin registro): no hay ID que comparar y NUNCA se le atribuye uno; solo se reconoce el reintento si el vendedor elegido coincide con la
  // línea «Vendedor: …» congelada en su dInfAdic (nombre del usuario que la emitió entonces). Si no se puede probar, conflicto específico (no se recrea ni se modifica la FE).
  if (historico.vendedorId !== "") {
    if (historico.vendedorId.toLowerCase() !== cuerpo.vendedorId.toLowerCase()) return OTRO;
  } else {
    const u = await nombreDeUsuario(db, empresaId, cuerpo.vendedorId);

    if (u === null || partes.vendedor === null || lineaVendedor(u.nombre, u.apellido) !== partes.vendedor) {
      return "Esta factura es anterior al registro estructurado del vendedor y no se puede comprobar que el vendedor elegido sea el original. No se vuelve a crear ni a modificar: consulte o reintente su envío desde Documentos electrónicos.";
    }
  }

  if (conReceptor) return null;
  if (cuerpo.direccionEntregaId !== undefined) return MENSAJE_DESTINO_NO_COMPROBABLE;

  return partes.entrega === null ? null : OTRO;
}

export const MENSAJE_INFO_CAMBIO = "La información adicional (observaciones o vendedor) cambió desde la revisión. Revise la factura de nuevo antes de enviarla.";

export const MENSAJE_REPARTO_CAMBIO = "El stock disponible cambió desde la revisión y el reparto por depósito ya no es el mismo. Revise la factura de nuevo antes de enviarla.";

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
