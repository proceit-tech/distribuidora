import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { margenBruto, tramosSuperpuestos } from "@/lib/listas-precio/calculos";
import { MENSAJE_CONFLICTO_ITEMS, conflictoItems, normalizarItemsCargados } from "@/lib/listas-precio/concurrencia";

// Validación y persistencia compartidas de listas de precios (POST y PUT).
// Consultas parametrizadas; empresa_id siempre llega de la sesión autenticada.

type Cuerpo = Record<string, unknown>;
type Fila = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const texto = (v: unknown, max?: number) => {
  const r = typeof v === "string" ? v.trim() : "";
  return max ? r.slice(0, max) : r;
};
const opcional = (v: unknown, max?: number) => texto(v, max) || null;
const lista = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Error de validación con el campo (ruta) al que corresponde, para mostrarlo junto al campo en la pantalla. */
export class ErrorLista extends Error {
  campo: string | null;
  /** Estado HTTP de la respuesta: 400 validación, 409 conflicto de versión. */
  estado: number;

  constructor(mensaje: string, campo: string | null = null, estado = 400) {
    super(mensaje);
    this.campo = campo;
    this.estado = estado;
  }
}

/** LPR-A02: conflicto de edición concurrente (409). */
export const conflicto = (mensaje: string, campo: string | null = null) => new ErrorLista(mensaje, campo, 409);

/** Versión = `actualizado_at` con microsegundos (UTC). Se calcula en SQL con esta misma expresión al leer y al comparar. */
export const SQL_VERSION = (columna: string) => `to_char(${columna} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')`;

/** LPR-A02: la versión de la cabecera es obligatoria y debe ser exactamente la persistida (se llama con la fila ya bloqueada, antes de cualquier escritura). */
export function exigirVersionLista(enviada: string, actual: string) {
  if (!enviada) throw conflicto("Falta la versión de la lista que se está editando. Recargue la página y vuelva a aplicar sus cambios.");
  if (enviada !== actual) {
    throw conflicto("La lista fue modificada por otra persona o desde otra pantalla después de abrirla. No se guardó nada: recargue para ver los datos vigentes (copie antes lo que haya escrito).");
  }
}

/** LPR-A04: el código de la lista de referencia (REF-VENTA) es inmutable. Un código vacío se interpreta como «sin cambio». */
export function validarCodigoReferencia(esReferencia: boolean, enviado: string, actual: string) {
  if (esReferencia && enviado && enviado !== actual) throw new ErrorLista("El código de la lista de referencia no se puede cambiar.", "codigo");
}

const idExistente = (v: unknown) => {
  const t = texto(v);

  return UUID.test(t) ? t : null;
};

function numero(v: unknown, etiqueta: string, min?: number, max?: number, campo: string | null = null): number | null {
  if (v === "" || v === undefined || v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
    throw new ErrorLista(`${etiqueta} no es válido.`, campo);
  }
  return n;
}

function uuidOpcional(v: unknown, etiqueta: string) {
  const t = texto(v);
  if (!t) return null;
  if (!UUID.test(t)) throw new Error(`${etiqueta} no es válido.`);
  return t;
}

/** yyyy-mm-dd (input type=date) o dd/mm/yyyy. Devuelve ISO o null. */
function fecha(v: unknown, etiqueta: string, campo: string | null = null) {
  const e = texto(v);
  if (!e) return null;
  let yyyy: string, mm: string, dd: string;
  const iso = e.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const loc = e.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (iso) [, yyyy, mm, dd] = iso;
  else if (loc) [, dd, mm, yyyy] = loc;
  else throw new ErrorLista(`${etiqueta} no tiene un formato válido.`, campo);
  const p = new Date(Date.UTC(+yyyy, +mm - 1, +dd));
  if (p.getUTCFullYear() !== +yyyy || p.getUTCMonth() !== +mm - 1 || p.getUTCDate() !== +dd) {
    throw new ErrorLista(`${etiqueta} no es válida.`, campo);
  }
  return `${yyyy}-${mm}-${dd}`;
}

const TIPOS = ["VENTA", "COMPRA"];
const ESTADOS = ["BORRADOR", "ACTIVA", "INACTIVA", "VENCIDA"];
const MODOS = ["PRECIO_FIJO", "AJUSTE_PORCENTAJE", "MARGEN_SOBRE_COSTO"];
const APLICACIONES = ["GENERAL", "GRUPO_CLIENTE", "CLIENTE", "ZONA", "CANAL_VENTA"];

export type DatosLista = ReturnType<typeof prepararLista>;

/** Valida y normaliza el cuerpo. Lanza Error con mensaje en español si algo no es válido. */
export function prepararLista(d: Cuerpo) {
  const nombre = texto(d.nombre, 200);
  const tipo = texto(d.tipo).toUpperCase() || "VENTA";
  const moneda = texto(d.monedaCodigo).toUpperCase() || "PYG";
  const estado = texto(d.estado).toUpperCase() || "ACTIVA";
  const modo = texto(d.modoPrecio).toUpperCase() || "PRECIO_FIJO";
  const desde = fecha(d.vigenteDesde, "La vigencia inicial", "vigenteDesde");
  const hasta = fecha(d.vigenteHasta, "La vigencia final", "vigenteHasta");

  if (!nombre) throw new ErrorLista("Ingrese el nombre de la lista de precios.", "nombre");
  if (!desde) throw new ErrorLista("Ingrese la fecha de vigencia inicial.", "vigenteDesde");
  if (hasta && hasta < desde) throw new ErrorLista("La vigencia final no puede ser anterior a la inicial.", "vigenteHasta");
  if (!TIPOS.includes(tipo)) throw new ErrorLista("Tipo de lista no válido.", "tipo");
  if (!/^[A-Z]{3}$/.test(moneda)) throw new ErrorLista("Moneda no válida.", "monedaCodigo");
  if (!ESTADOS.includes(estado)) throw new ErrorLista("Estado no válido.", "estado");
  if (!MODOS.includes(modo)) throw new ErrorLista("Modo de precio no válido.", "modoPrecio");

  const productos = lista<Fila>(d.productos).map((p, i) => {
    const ruta = `productos.${i}`;
    const productoId = uuidOpcional(p.productoId, "El producto");
    if (!productoId) throw new ErrorLista(`El precio ${i + 1} requiere seleccionar un producto.`, `${ruta}.productoId`);
    const vDesde = fecha(p.vigenteDesde, "La vigencia del producto", `${ruta}.vigenteDesde`) ?? desde;
    const vHasta = fecha(p.vigenteHasta, "La vigencia final del producto", `${ruta}.vigenteHasta`);
    if (vHasta && vHasta < vDesde) throw new ErrorLista(`La vigencia final del precio ${i + 1} no puede ser anterior a la inicial.`, `${ruta}.vigenteHasta`);
    const escalas = lista<Fila>(p.escalas).map((e, k) => {
      const re = `${ruta}.escalas.${k}`;
      const min = numero(e.cantidadMinima, "Cantidad mínima del escalón", 0.0001, undefined, `${re}.cantidadMinima`);
      const max = numero(e.cantidadMaxima, "Cantidad máxima del escalón", 0, undefined, `${re}.cantidadMaxima`);
      if (min === null) throw new ErrorLista("Cada escalón requiere cantidad mínima.", `${re}.cantidadMinima`);
      if (max !== null && max < min) throw new ErrorLista("La cantidad máxima de un escalón no puede ser menor que la mínima.", `${re}.cantidadMaxima`);
      return { id: idExistente(e.id), min, max, precio: numero(e.precio, "Precio del escalón", 0, undefined, `${re}.precio`) ?? 0, desc: numero(e.descuentoPct, "Descuento del escalón", 0, 100, `${re}.descuentoPct`) ?? 0 };
    });
    // LPR-A03: los rangos (inclusivos) de un mismo precio no pueden superponerse; cada escalón debe empezar por encima del máximo del anterior y solo el último puede quedar abierto.
    const solapados = tramosSuperpuestos(escalas.map((x) => ({ cantidadMinima: x.min, cantidadMaxima: x.max })));

    if (solapados.length > 0) {
      const rango = (x: (typeof escalas)[number]) => `${x.min}–${x.max ?? "sin límite"}`;

      throw new ErrorLista(`Los escalones del precio ${i + 1} se superponen (${solapados.map((k) => rango(escalas[k])).join(" y ")}). Cada escalón debe empezar por encima del máximo del anterior.`, `${ruta}.escalas.${solapados[0]}.cantidadMinima`);
    }
    const costo = numero(p.costoReferencia, "Costo de referencia", 0, undefined, `${ruta}.costoReferencia`) ?? 0;
    const precio = numero(p.precioLista, "Precio de lista", 0, undefined, `${ruta}.precioLista`) ?? 0;
    return {
      id: idExistente(p.id),
      version: texto(p.version, 40),
      productoId,
      unidadMedidaId: uuidOpcional(p.unidadMedidaId, "La unidad"),
      costo,
      base: numero(p.precioBase, "Precio base", 0, undefined, `${ruta}.precioBase`) ?? 0,
      precio,
      // El margen lo calcula el servidor (margen bruto sobre el precio); sin precio o sin costo no hay margen definido y se guarda 0.
      margen: margenBruto(precio, costo) ?? 0,
      desc: numero(p.descuentoPct, "Descuento", 0, 100, `${ruta}.descuentoPct`) ?? 0,
      cantidadMinima: numero(p.cantidadMinima, "Cantidad mínima", 0.0001, undefined, `${ruta}.cantidadMinima`) ?? 1,
      desde: vDesde,
      hasta: vHasta,
      activo: p.activo !== false,
      escalas,
    };
  });
  const vistos = new Set<string>();
  for (const p of productos) {
    if (vistos.has(p.productoId)) throw new ErrorLista("Un producto no puede repetirse en la misma lista.", "productos");
    vistos.add(p.productoId);
  }

  const reglas = lista<Fila>(d.reglasComerciales).map((r, i) => {
    const ruta = `reglasComerciales.${i}`;
    const tipoAplicacion = texto(r.tipoAplicacion).toUpperCase() || "GENERAL";
    if (!APLICACIONES.includes(tipoAplicacion)) throw new ErrorLista(`El tipo de aplicación de la regla ${i + 1} no es válido.`, `${ruta}.tipoAplicacion`);
    const referenciaId = tipoAplicacion === "GENERAL" ? null : uuidOpcional(r.referenciaId, "La referencia de la regla");
    if (tipoAplicacion !== "GENERAL" && !referenciaId) throw new ErrorLista(`La regla ${i + 1} requiere seleccionar su referencia.`, `${ruta}.referenciaId`);
    const vDesde = fecha(r.vigenteDesde, "La vigencia de la regla", `${ruta}.vigenteDesde`) ?? desde;
    const vHasta = fecha(r.vigenteHasta, "La vigencia final de la regla", `${ruta}.vigenteHasta`);
    if (vHasta && vHasta < vDesde) throw new ErrorLista(`La vigencia final de la regla ${i + 1} no puede ser anterior a la inicial.`, `${ruta}.vigenteHasta`);
    return {
      id: idExistente(r.id),
      tipoAplicacion,
      referenciaId,
      prioridad: Math.trunc(numero(r.prioridad, "Prioridad de la regla", 0, undefined, `${ruta}.prioridad`) ?? 10),
      cantidadMinima: numero(r.cantidadMinima, "Cantidad mínima de la regla", 0.0001, undefined, `${ruta}.cantidadMinima`) ?? 1,
      permiteDescuentoAdicional: r.permiteDescuentoAdicional !== false,
      descuentoMaximoPct: numero(r.descuentoMaximoPct, "Descuento máximo de la regla", 0, 100, `${ruta}.descuentoMaximoPct`) ?? 0,
      desde: vDesde,
      hasta: vHasta,
      activo: r.activo !== false,
    };
  });

  // LPR-A01/A02: ids de los precios que la pantalla cargó al abrir (los que falten en `productos` se eliminan por decisión explícita). null = no enviado.
  // LPR-R02-01: id y versión de TODOS los precios cargados (también los quitados del borrador); incompleto o malformado → 400.
  const itemsCargados = normalizarItemsCargados(d.itemsCargados);

  if (itemsCargados === "invalido") throw new ErrorLista("La relación de precios cargados al abrir la lista (id y versión) está incompleta o no es válida. Recargue la página.", "productos");

  return {
    version: texto(d.version, 40),
    itemsCargados,
    codigo: texto(d.codigo, 50), // vacío => LP-nnn al crear
    nombre,
    descripcion: opcional(d.descripcion, 1000),
    tipo,
    moneda,
    estado,
    modo,
    incluyeIva: d.incluyeIva !== false,
    listaBaseId: uuidOpcional(d.listaBaseId, "La lista base"),
    ajuste: numero(d.ajusteGeneralPct, "Ajuste general", -100, 999, "ajusteGeneralPct") ?? 0,
    desde,
    hasta,
    prioridad: Math.trunc(numero(d.prioridad, "Prioridad", 0, undefined, "prioridad") ?? 10),
    permiteDescuentoAdicional: d.permiteDescuentoAdicional !== false,
    descuentoMaximoPct: numero(d.descuentoMaximoPct, "Descuento máximo", 0, 100, "descuentoMaximoPct") ?? 0,
    grupoClienteId: uuidOpcional(d.grupoClienteId, "El grupo de cliente"),
    clienteId: uuidOpcional(d.clienteId, "El cliente"),
    zonaId: uuidOpcional(d.zonaId, "La zona"),
    canalVentaId: uuidOpcional(d.canalVentaId, "El canal de venta"),
    // Estado y «activo» no pueden contradecirse: la lista está activa solo cuando su estado es ACTIVA (el valor enviado en «activo» se ignora).
    activo: estado === "ACTIVA",
    observacion: opcional(d.observacion, 1000),
    productos,
    reglas,
  };
}

/** Asigna LP-nnn por empresa (serializado por advisory lock dentro de la transacción). */
export async function siguienteCodigo(c: PoolClient, empresaId: string) {
  await c.query(`SELECT pg_advisory_xact_lock(hashtextextended('listas_precio.codigo:' || $1::text, 0))`, [empresaId]);
  const r = await c.query(
    `SELECT 'LP-' || lpad((coalesce(max(substring(codigo FROM '^LP-([0-9]+)$')::bigint), 0) + 1)::text, 3, '0') AS codigo
       FROM listas_precio WHERE empresa_id = $1`,
    [empresaId],
  );
  return (r.rows[0] as { codigo: string }).codigo;
}

/** Columnas editables de `listas_precio` (INSERT y UPDATE). `es_referencia` nunca se escribe desde la pantalla. */
export function columnasLista(d: DatosLista, codigo: string): Array<[string, unknown]> {
  return [
    ["codigo", codigo],
    ["nombre", d.nombre],
    ["descripcion", d.descripcion],
    ["tipo_lista", d.tipo],
    ["moneda_codigo", d.moneda],
    ["estado", d.estado],
    ["modo_precio", d.modo],
    ["incluye_impuesto", d.incluyeIva],
    ["lista_precio_base_id", d.listaBaseId],
    ["ajuste_general_pct", d.ajuste],
    ["vigente_desde", d.desde],
    ["vigente_hasta", d.hasta],
    ["prioridad", d.prioridad],
    ["permite_descuento_adicional", d.permiteDescuentoAdicional],
    ["descuento_maximo_pct", d.descuentoMaximoPct],
    ["grupo_cliente_id", d.grupoClienteId],
    ["cliente_id", d.clienteId],
    ["zona_comercial_id", d.zonaId],
    ["canal_venta_id", d.canalVentaId],
    ["activo", d.activo],
    ["observacion", d.observacion],
  ];
}

/** La lista base no puede ser la propia lista ni cerrar un ciclo (A→B→A). */
export type PrevioLista = { baseId: string | null; moneda: string; tipo: string };

export async function validarListaBase(
  c: PoolClient,
  empresaId: string,
  listaId: string | null,
  baseId: string | null,
  actual?: { moneda: string; tipo: string; previo: PrevioLista | null },
) {
  if (!baseId) return;
  if (listaId && baseId === listaId) throw new ErrorLista("Una lista no puede ser su propia lista base.", "listaBaseId");
  const base = await c.query(`SELECT tipo_lista, moneda_codigo FROM listas_precio WHERE empresa_id = $1 AND id = $2`, [empresaId, baseId]);
  if (!base.rowCount) throw new ErrorLista("La lista base no existe en su empresa.", "listaBaseId");
  // Misma moneda y mismo tipo que la base: no existe una conversión de moneda aprobada y una lista de compra no deriva de una de venta.
  // Solo se exige al crear o cuando cambia la base, la moneda o el tipo (las listas históricas con otra combinación no quedan bloqueadas).
  const p = actual?.previo ?? null;
  if (actual && (!p || p.baseId !== baseId || p.moneda !== actual.moneda || p.tipo !== actual.tipo)) {
    const b = base.rows[0] as { tipo_lista: string; moneda_codigo: string };
    if (b.moneda_codigo !== actual.moneda) throw new ErrorLista(`La lista base está en ${b.moneda_codigo}: debe tener la misma moneda (no hay conversión de moneda aprobada).`, "listaBaseId");
    if (b.tipo_lista !== actual.tipo) throw new ErrorLista("La lista base debe ser del mismo tipo (venta o compra).", "listaBaseId");
  }
  if (!listaId) return;
  const ciclo = await c.query(
    `WITH RECURSIVE cadena AS (
       SELECT id, lista_precio_base_id FROM listas_precio WHERE empresa_id = $1 AND id = $2
       UNION
       SELECT l.id, l.lista_precio_base_id FROM listas_precio l JOIN cadena c ON l.empresa_id = $1 AND l.id = c.lista_precio_base_id)
     SELECT 1 FROM cadena WHERE id = $3`,
    [empresaId, baseId, listaId],
  );
  if (ciclo.rowCount) throw new ErrorLista("La lista base elegida depende de esta lista (referencia circular).", "listaBaseId");
}

const TABLA_REFERENCIA: Record<string, { tabla: string; que: string }> = {
  GRUPO_CLIENTE: { tabla: "grupos_cliente", que: "El grupo de cliente" },
  CLIENTE: { tabla: "clientes", que: "El cliente" },
  ZONA: { tabla: "zonas_comerciales", que: "La zona" },
  CANAL_VENTA: { tabla: "canales_venta", que: "El canal de venta" },
};

/**
 * Referencias comerciales de la cabecera y de las reglas: existen en la empresa de la sesión y están activas. Una referencia que la lista
 * YA tenía (edición) se admite aunque se haya inactivado después: las listas existentes no quedan bloqueadas ni pierden su vínculo.
 */
export async function validarReferenciasComerciales(c: PoolClient, empresaId: string, listaId: string | null, d: DatosLista) {
  // LPR-A09: lo histórico se identifica POR CONTEXTO, no por UUID suelto: el campo de cabecera con el mismo valor, o la misma regla (por id) con el mismo tipo y referencia.
  const cabeceraPrevia: Record<string, string | null> = {};
  const reglasPrevias = new Map<string, { tipo: string; referencia: string | null }>();

  if (listaId) {
    const cab = await c.query(
      `SELECT grupo_cliente_id, cliente_id, zona_comercial_id, canal_venta_id FROM listas_precio WHERE empresa_id = $1 AND id = $2`,
      [empresaId, listaId],
    );
    const fila = (cab.rows[0] ?? {}) as Record<string, string | null>;

    cabeceraPrevia.grupoClienteId = fila.grupo_cliente_id ?? null;
    cabeceraPrevia.clienteId = fila.cliente_id ?? null;
    cabeceraPrevia.zonaId = fila.zona_comercial_id ?? null;
    cabeceraPrevia.canalVentaId = fila.canal_venta_id ?? null;

    const reg = await c.query(`SELECT id, tipo_aplicacion, referencia_id FROM lista_precio_reglas WHERE empresa_id = $1 AND lista_precio_id = $2 AND referencia_id IS NOT NULL`, [empresaId, listaId]);

    for (const r of reg.rows as Array<{ id: string; tipo_aplicacion: string; referencia_id: string | null }>) reglasPrevias.set(r.id, { tipo: r.tipo_aplicacion, referencia: r.referencia_id });
  }

  async function verificar(tipo: string, id: string | null, campo: string, etiqueta: string, vinculoPrevio: boolean) {
    if (!id) return;
    const t = TABLA_REFERENCIA[tipo];
    const r = await c.query(`SELECT activo FROM ${t.tabla} WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
    if (!r.rowCount) throw new ErrorLista(`${etiqueta} no existe en su empresa.`, campo);
    if (r.rows[0].activo !== true && !vinculoPrevio) throw new ErrorLista(`${etiqueta} está inactivo(a); actívelo(a) antes de usarlo(a).`, campo);
  }

  await verificar("GRUPO_CLIENTE", d.grupoClienteId, "grupoClienteId", TABLA_REFERENCIA.GRUPO_CLIENTE.que, cabeceraPrevia.grupoClienteId === d.grupoClienteId);
  await verificar("CLIENTE", d.clienteId, "clienteId", TABLA_REFERENCIA.CLIENTE.que, cabeceraPrevia.clienteId === d.clienteId);
  await verificar("ZONA", d.zonaId, "zonaId", TABLA_REFERENCIA.ZONA.que, cabeceraPrevia.zonaId === d.zonaId);
  await verificar("CANAL_VENTA", d.canalVentaId, "canalVentaId", TABLA_REFERENCIA.CANAL_VENTA.que, cabeceraPrevia.canalVentaId === d.canalVentaId);
  for (const [i, r] of d.reglas.entries()) {
    if (r.tipoAplicacion === "GENERAL") continue;

    const previa = r.id ? reglasPrevias.get(r.id) : undefined;
    const mismoVinculo = previa !== undefined && previa.tipo === r.tipoAplicacion && previa.referencia === r.referenciaId;

    await verificar(r.tipoAplicacion, r.referenciaId, `reglasComerciales.${i}.referenciaId`, `La referencia de la regla ${i + 1}`, mismoVinculo);
  }
}

type ProductoDatos = DatosLista["productos"][number];

/**
 * LPR-A06: la unidad de un precio debe ser la unidad base del producto o la de una de sus presentaciones. Sin unidad se usa la base. Solo se valida lo NUEVO o lo que cambia:
 * una unidad histórica ya guardada y sin cambios no se toca (ni se recalcula el precio, decisión U10).
 */
export async function validarUnidadesItems(c: PoolClient, empresaId: string, items: Array<{ indice: number; productoId: string; unidadMedidaId: string | null }>) {
  if (items.length === 0) return;

  const r = await c.query(
    `SELECT p.id::text AS id, p.unidad_medida_id::text AS base,
            coalesce(array_agg(DISTINCT pu.unidad_medida_id::text) FILTER (WHERE pu.id IS NOT NULL), '{}') AS presentaciones
       FROM productos p
       LEFT JOIN producto_unidades pu ON pu.empresa_id = p.empresa_id AND pu.producto_id = p.id
      WHERE p.empresa_id = $1 AND p.id = ANY($2::uuid[])
      GROUP BY p.id, p.unidad_medida_id`,
    [empresaId, [...new Set(items.map((i) => i.productoId))]],
  );
  const porProducto = new Map((r.rows as Array<{ id: string; base: string; presentaciones: string[] }>).map((x) => [x.id, x]));

  for (const it of items) {
    const p = porProducto.get(it.productoId);

    if (!p) throw new ErrorLista(`El producto del precio ${it.indice + 1} no existe en su empresa.`, `productos.${it.indice}.productoId`);
    if (it.unidadMedidaId && it.unidadMedidaId !== p.base && !p.presentaciones.includes(it.unidadMedidaId)) {
      throw new ErrorLista(`La unidad del precio ${it.indice + 1} no corresponde al producto: use su unidad base o una de sus presentaciones.`, `productos.${it.indice}.unidadMedidaId`);
    }
  }
}

async function insertarItems(c: PoolClient, empresaId: string, listaId: string, moneda: string, productos: ProductoDatos[]) {
  const items = await c.query(
    `INSERT INTO lista_precio_items
       (empresa_id, lista_precio_id, producto_id, unidad_medida_id, moneda_codigo, costo_referencia, precio_base, precio_lista,
        margen_pct, descuento_pct, cantidad_minima, vigente_desde, vigente_hasta, activo)
     SELECT $1, $2, x.producto_id, coalesce(x.unidad_id, p.unidad_medida_id), $3, x.costo, x.base, x.precio,
            x.margen, x.descuento, x.cantidad_minima, x.desde, x.hasta, x.activo
       FROM unnest($4::uuid[], $5::uuid[], $6::numeric[], $7::numeric[], $8::numeric[], $9::numeric[], $10::numeric[], $11::numeric[],
                   $12::date[], $13::date[], $14::boolean[])
            AS x(producto_id, unidad_id, costo, base, precio, margen, descuento, cantidad_minima, desde, hasta, activo)
       JOIN productos p ON p.empresa_id = $1 AND p.id = x.producto_id
     RETURNING id, producto_id`,
    [
      empresaId, listaId, moneda,
      productos.map((p) => p.productoId),
      productos.map((p) => p.unidadMedidaId),
      productos.map((p) => p.costo),
      productos.map((p) => p.base),
      productos.map((p) => p.precio),
      productos.map((p) => p.margen),
      productos.map((p) => p.desc),
      productos.map((p) => p.cantidadMinima),
      productos.map((p) => p.desde),
      productos.map((p) => p.hasta),
      productos.map((p) => p.activo),
    ],
  );

  if (items.rowCount !== productos.length) {
    throw Object.assign(new Error("Algún producto no existe en su empresa."), { code: "23503", constraint: "lista_precio_items_producto_fk" });
  }

  return new Map((items.rows as Array<{ id: string; producto_id: string }>).map((r) => [r.producto_id, r.id]));
}

type EscalaFila = { item: string; min: number; max: number | null; precio: number; desc: number };

async function insertarEscalones(c: PoolClient, empresaId: string, esc: EscalaFila[]) {
  if (esc.length === 0) return;

  await c.query(
    `INSERT INTO lista_precio_escalones (empresa_id, lista_precio_item_id, cantidad_minima, cantidad_maxima, precio, descuento_pct)
     SELECT $1, * FROM unnest($2::uuid[], $3::numeric[], $4::numeric[], $5::numeric[], $6::numeric[])`,
    [empresaId, esc.map((e) => e.item), esc.map((e) => e.min), esc.map((e) => e.max), esc.map((e) => e.precio), esc.map((e) => e.desc)],
  );
}

async function insertarRegla(c: PoolClient, empresaId: string, listaId: string, r: DatosLista["reglas"][number]) {
  await c.query(
    `INSERT INTO lista_precio_reglas
       (empresa_id, lista_precio_id, tipo_aplicacion, referencia_id, prioridad, cantidad_minima, permite_descuento_adicional,
        descuento_maximo_pct, vigente_desde, vigente_hasta, activo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [empresaId, listaId, r.tipoAplicacion, r.referenciaId, r.prioridad, r.cantidadMinima, r.permiteDescuentoAdicional, r.descuentoMaximoPct, r.desde, r.hasta, r.activo],
  );
}

/** Alta (POST): hijos nuevos. empresa_id explícito; las FK compuestas impiden referencias de otra empresa. */
export async function insertarHijos(c: PoolClient, empresaId: string, listaId: string, d: DatosLista) {
  if (d.productos.length) {
    await validarUnidadesItems(c, empresaId, d.productos.map((p, indice) => ({ indice, productoId: p.productoId, unidadMedidaId: p.unidadMedidaId })));

    const idPorProducto = await insertarItems(c, empresaId, listaId, d.moneda, d.productos);

    await insertarEscalones(c, empresaId, d.productos.flatMap((p) => p.escalas.map((e) => ({ item: idPorProducto.get(p.productoId) as string, min: e.min, max: e.max, precio: e.precio, desc: e.desc }))));
  }
  for (const r of d.reglas) await insertarRegla(c, empresaId, listaId, r);
}

/** LPR-A01: plan de sincronización de los hijos (qué se conserva, qué se actualiza, qué se inserta y qué se elimina por decisión explícita). */
export type PlanHijos = {
  itemsEliminar: string[];
  itemsActualizar: Array<{ id: string; i: number }>;
  itemsNuevos: number[];
  escalonesEliminar: string[];
  escalonesActualizar: Array<{ id: string; i: number; k: number }>;
  escalonesNuevos: Array<{ itemId: string | null; i: number; k: number }>;
  reglasEliminar: string[];
  reglasActualizar: Array<{ id: string; i: number }>;
  reglasNuevas: number[];
};

/**
 * Lee los hijos actuales BAJO BLOQUEO (FOR UPDATE), detecta conflictos con cambios hechos por otros canales (p. ej. Productos fijando el precio de referencia, que NO toca la cabecera)
 * y valida las unidades. No escribe nada: si lanza, la transacción no tiene escrituras.
 *  · LPR-A02: cada precio existente debe traer la versión (actualizado_at µs) que la pantalla cargó; si cambió (o ya no existe) → 409. Un precio que apareció en la base después de abrir
 *    la lista (no está en `itemsCargados`) → 409 en lugar de borrarlo en silencio.
 *  · LPR-A01: la identidad (id y creado_at) de precios, escalones y reglas se conserva; solo se elimina lo que el operador quitó de la pantalla.
 */
export async function planificarHijos(c: PoolClient, empresaId: string, listaId: string, d: DatosLista): Promise<PlanHijos> {
  if (d.itemsCargados === null) throw conflicto("Falta la relación de precios que se cargaron al abrir la lista. Recargue la página y vuelva a aplicar sus cambios.", "productos");

  const cargados = new Set(d.itemsCargados.map((x) => x.id));
  const dbItems = (
    await c.query(
      `SELECT id::text AS id, producto_id::text AS producto_id, unidad_medida_id::text AS unidad_medida_id, ${SQL_VERSION("actualizado_at")} AS version
         FROM lista_precio_items WHERE empresa_id = $1 AND lista_precio_id = $2 FOR UPDATE`,
      [empresaId, listaId],
    )
  ).rows as Array<{ id: string; producto_id: string; unidad_medida_id: string; version: string }>;
  const porId = new Map(dbItems.map((x) => [x.id, x]));

  // LPR-R02-01: la foto completa (ids y versiones, incluidos los precios quitados del borrador) debe coincidir EXACTAMENTE con la base bloqueada; si no, 409 antes de escribir.
  const dif = conflictoItems(dbItems.map((x) => ({ id: x.id, version: x.version })), d.itemsCargados);

  if (dif) {
    const enEnvio = d.productos.findIndex((p) => p.id === dif.id);

    throw conflicto(MENSAJE_CONFLICTO_ITEMS[dif.tipo], enEnvio >= 0 ? `productos.${enEnvio}` : "productos");
  }

  const plan: PlanHijos = { itemsEliminar: [], itemsActualizar: [], itemsNuevos: [], escalonesEliminar: [], escalonesActualizar: [], escalonesNuevos: [], reglasEliminar: [], reglasActualizar: [], reglasNuevas: [] };
  const retenidos = new Map<string, number>();

  d.productos.forEach((p, i) => {
    const db = p.id ? porId.get(p.id) : undefined;

    if (p.id && !db) {
      if (cargados.has(p.id)) throw conflicto(`El precio ${i + 1} ya no existe (fue eliminado desde otra pantalla). No se guardó nada: recargue la lista.`, `productos.${i}`);
      plan.itemsNuevos.push(i);

      return;
    }
    if (!db) {
      plan.itemsNuevos.push(i);

      return;
    }
    if (!p.version || p.version !== db.version) {
      throw conflicto(`El precio ${i + 1} fue modificado (por otra persona o desde la ficha de Productos) después de abrir la lista. No se guardó nada: recargue para ver el precio vigente.`, `productos.${i}`);
    }
    if (retenidos.has(db.id)) throw new ErrorLista(`El precio ${i + 1} está repetido en el envío.`, `productos.${i}`);
    // La identidad de un precio es su producto: si la fila pasó a otro producto se trata como un precio nuevo y el anterior se elimina.
    if (db.producto_id !== p.productoId) {
      plan.itemsNuevos.push(i);

      return;
    }
    retenidos.set(db.id, i);
    plan.itemsActualizar.push({ id: db.id, i });
  });

  plan.itemsEliminar = dbItems.filter((x) => !retenidos.has(x.id)).map((x) => x.id);

  await validarUnidadesItems(c, empresaId, [
    ...plan.itemsNuevos.map((i) => ({ indice: i, productoId: d.productos[i].productoId, unidadMedidaId: d.productos[i].unidadMedidaId })),
    ...plan.itemsActualizar.filter((u) => d.productos[u.i].unidadMedidaId && d.productos[u.i].unidadMedidaId !== porId.get(u.id)?.unidad_medida_id).map((u) => ({ indice: u.i, productoId: d.productos[u.i].productoId, unidadMedidaId: d.productos[u.i].unidadMedidaId })),
  ]);

  // Escalones: de los precios conservados se actualizan por id, se insertan los nuevos y se eliminan los que ya no vienen; los de los precios eliminados se borran con ellos.
  const dbEscalones = retenidos.size
    ? ((
        await c.query(
          `SELECT id::text AS id, lista_precio_item_id::text AS item_id FROM lista_precio_escalones WHERE empresa_id = $1 AND lista_precio_item_id = ANY($2::uuid[]) FOR UPDATE`,
          [empresaId, [...retenidos.keys()]],
        )
      ).rows as Array<{ id: string; item_id: string }>)
    : [];
  const escalonPorId = new Map(dbEscalones.map((e) => [e.id, e]));
  const escalonesVistos = new Set<string>();

  for (const [itemId, i] of retenidos) {
    d.productos[i].escalas.forEach((e, k) => {
      const db = e.id ? escalonPorId.get(e.id) : undefined;

      if (db && db.item_id === itemId && !escalonesVistos.has(db.id)) {
        escalonesVistos.add(db.id);
        plan.escalonesActualizar.push({ id: db.id, i, k });
      } else {
        plan.escalonesNuevos.push({ itemId, i, k });
      }
    });
  }
  for (const i of plan.itemsNuevos) d.productos[i].escalas.forEach((_, k) => plan.escalonesNuevos.push({ itemId: null, i, k }));
  plan.escalonesEliminar = dbEscalones.filter((e) => !escalonesVistos.has(e.id)).map((e) => e.id);

  // Reglas (solo se escriben desde esta pantalla: las protege la versión de la cabecera).
  const dbReglas = (await c.query(`SELECT id::text AS id FROM lista_precio_reglas WHERE empresa_id = $1 AND lista_precio_id = $2 FOR UPDATE`, [empresaId, listaId])).rows as Array<{ id: string }>;
  const reglasDb = new Set(dbReglas.map((r) => r.id));
  const reglasVistas = new Set<string>();

  d.reglas.forEach((r, i) => {
    if (r.id && reglasDb.has(r.id) && !reglasVistas.has(r.id)) {
      reglasVistas.add(r.id);
      plan.reglasActualizar.push({ id: r.id, i });
    } else {
      plan.reglasNuevas.push(i);
    }
  });
  plan.reglasEliminar = dbReglas.filter((r) => !reglasVistas.has(r.id)).map((r) => r.id);

  return plan;
}

/** Aplica el plan: elimina lo quitado, actualiza SOLO lo que cambió (IS DISTINCT FROM, para no alterar actualizado_at de lo intacto) e inserta lo nuevo. */
export async function aplicarHijos(c: PoolClient, empresaId: string, listaId: string, d: DatosLista, plan: PlanHijos) {
  if (plan.escalonesEliminar.length) await c.query(`DELETE FROM lista_precio_escalones WHERE empresa_id = $1 AND id = ANY($2::uuid[])`, [empresaId, plan.escalonesEliminar]);
  if (plan.itemsEliminar.length) {
    await c.query(`DELETE FROM lista_precio_escalones WHERE empresa_id = $1 AND lista_precio_item_id = ANY($2::uuid[])`, [empresaId, plan.itemsEliminar]);
    await c.query(`DELETE FROM lista_precio_items WHERE empresa_id = $1 AND lista_precio_id = $2 AND id = ANY($3::uuid[])`, [empresaId, listaId, plan.itemsEliminar]);
  }
  if (plan.reglasEliminar.length) await c.query(`DELETE FROM lista_precio_reglas WHERE empresa_id = $1 AND lista_precio_id = $2 AND id = ANY($3::uuid[])`, [empresaId, listaId, plan.reglasEliminar]);

  for (const u of plan.itemsActualizar) {
    const p = d.productos[u.i];

    await c.query(
      `UPDATE lista_precio_items SET unidad_medida_id = coalesce($4::uuid, unidad_medida_id), moneda_codigo = $5, costo_referencia = $6, precio_base = $7, precio_lista = $8,
              margen_pct = $9, descuento_pct = $10, cantidad_minima = $11, vigente_desde = $12, vigente_hasta = $13, activo = $14
        WHERE empresa_id = $1 AND lista_precio_id = $2 AND id = $3
          AND (unidad_medida_id, moneda_codigo, costo_referencia, precio_base, precio_lista, margen_pct, descuento_pct, cantidad_minima, vigente_desde, vigente_hasta, activo)
              IS DISTINCT FROM (coalesce($4::uuid, unidad_medida_id), $5::text, $6::numeric, $7::numeric, $8::numeric, $9::numeric, $10::numeric, $11::numeric, $12::date, $13::date, $14::boolean)`,
      [empresaId, listaId, u.id, p.unidadMedidaId, d.moneda, p.costo, p.base, p.precio, p.margen, p.desc, p.cantidadMinima, p.desde, p.hasta, p.activo],
    );
  }
  for (const u of plan.escalonesActualizar) {
    const e = d.productos[u.i].escalas[u.k];

    await c.query(
      `UPDATE lista_precio_escalones SET cantidad_minima = $3, cantidad_maxima = $4, precio = $5, descuento_pct = $6
        WHERE empresa_id = $1 AND id = $2
          AND (cantidad_minima, cantidad_maxima, precio, descuento_pct) IS DISTINCT FROM ($3::numeric, $4::numeric, $5::numeric, $6::numeric)`,
      [empresaId, u.id, e.min, e.max, e.precio, e.desc],
    );
  }
  for (const u of plan.reglasActualizar) {
    const r = d.reglas[u.i];

    await c.query(
      `UPDATE lista_precio_reglas SET tipo_aplicacion = $4, referencia_id = $5, prioridad = $6, cantidad_minima = $7, permite_descuento_adicional = $8,
              descuento_maximo_pct = $9, vigente_desde = $10, vigente_hasta = $11, activo = $12
        WHERE empresa_id = $1 AND lista_precio_id = $2 AND id = $3
          AND (tipo_aplicacion, referencia_id, prioridad, cantidad_minima, permite_descuento_adicional, descuento_maximo_pct, vigente_desde, vigente_hasta, activo)
              IS DISTINCT FROM ($4::text, $5::uuid, $6::integer, $7::numeric, $8::boolean, $9::numeric, $10::date, $11::date, $12::boolean)`,
      [empresaId, listaId, u.id, r.tipoAplicacion, r.referenciaId, r.prioridad, r.cantidadMinima, r.permiteDescuentoAdicional, r.descuentoMaximoPct, r.desde, r.hasta, r.activo],
    );
  }

  const idNuevo = plan.itemsNuevos.length ? await insertarItems(c, empresaId, listaId, d.moneda, plan.itemsNuevos.map((i) => d.productos[i])) : new Map<string, string>();

  await insertarEscalones(
    c,
    empresaId,
    plan.escalonesNuevos.map((n) => {
      const p = d.productos[n.i];
      const e = p.escalas[n.k];

      return { item: n.itemId ?? (idNuevo.get(p.productoId) as string), min: e.min, max: e.max, precio: e.precio, desc: e.desc };
    }),
  );
  for (const i of plan.reglasNuevas) await insertarRegla(c, empresaId, listaId, d.reglas[i]);
}

/**
 * LPR-A05/A08: cambios de moneda y de tipo que la integridad vigente no admite o que dejarían incoherente a la cadena de listas base. Sin conversión ni cambios automáticos.
 *  · una lista con precios cargados no cambia de moneda (el trigger de NEX-018 lo rechazaría);
 *  · una lista que es base de otras no cambia de tipo ni de moneda (las derivadas exigen la misma moneda y tipo que su base).
 */
export async function validarCambioMonedaTipo(c: PoolClient, empresaId: string, listaId: string, actual: { moneda: string; tipo: string }, nuevo: { moneda: string; tipo: string }) {
  const cambiaMoneda = nuevo.moneda !== actual.moneda;
  const cambiaTipo = nuevo.tipo !== actual.tipo;

  if (!cambiaMoneda && !cambiaTipo) return;

  if (cambiaMoneda) {
    const n = await c.query(`SELECT count(*)::int AS n FROM lista_precio_items WHERE empresa_id = $1 AND lista_precio_id = $2`, [empresaId, listaId]);

    if (((n.rows[0] ?? { n: 0 }) as { n: number }).n > 0) {
      throw new ErrorLista("No se puede cambiar la moneda de una lista con precios cargados (no hay conversión aprobada). Cree una lista nueva en esa moneda y cargue sus precios.", "monedaCodigo");
    }
  }

  const derivadas = await c.query(`SELECT codigo FROM listas_precio WHERE empresa_id = $1 AND lista_precio_base_id = $2 ORDER BY codigo LIMIT 3`, [empresaId, listaId]);

  if (derivadas.rowCount) {
    const codigos = (derivadas.rows as Array<{ codigo: string }>).map((x) => x.codigo).join(", ");

    throw new ErrorLista(`Esta lista es la base de otras (${codigos}). No se puede cambiar su ${cambiaMoneda ? "moneda" : "tipo"} sin que dejen de coincidir con ella; cambie primero la base de esas listas.`, cambiaMoneda ? "monedaCodigo" : "tipo");
  }
}

export function respuestaError(error: unknown, accion: string) {
  if (error instanceof ErrorLista) return NextResponse.json({ error: error.message, campo: error.campo }, { status: error.estado });
  console.error(`Error al ${accion} lista de precios:`, error);
  const pg = error as { code?: string; constraint?: string; message?: string };

  if (pg.code === "23505") {
    const c = pg.constraint ?? "";
    let mensaje = "Ya existe un registro con ese valor.";
    if (c.includes("empresa_codigo")) mensaje = "Ya existe una lista de precios con ese código.";
    else if (c.includes("una_referencia")) mensaje = "Ya existe la lista de referencia de la empresa.";
    else if (c.includes("lista_producto")) mensaje = "Un producto no puede repetirse en la misma lista.";
    return NextResponse.json({ error: mensaje }, { status: 409 });
  }
  if (pg.code === "23503") {
    const c = pg.constraint ?? "";
    let mensaje = "Existe una referencia (producto, lista base, grupo, cliente, zona, canal o regla) que no es válida o no pertenece a su empresa.";
    if (c.includes("producto")) mensaje = "Algún producto no existe en su empresa.";
    else if (c.includes("base")) mensaje = "La lista base no existe en su empresa.";
    else if (c.includes("regla") || (pg.message ?? "").includes("referencia de la regla")) mensaje = "La referencia de una regla comercial no existe en su empresa.";
    return NextResponse.json({ error: mensaje }, { status: 400 });
  }
  if (pg.code === "P0001") {
    return NextResponse.json({ error: pg.message ?? "Los datos no cumplen las reglas de la lista." }, { status: 400 });
  }
  if (pg.code === "23514" || pg.code === "22P02" || pg.code === "22007" || pg.code === "22003") {
    return NextResponse.json({ error: "Los datos enviados no cumplen las reglas de la lista de precios." }, { status: 400 });
  }
  if (pg.code) return NextResponse.json({ error: `No fue posible ${accion} la lista de precios.` }, { status: 500 });
  return NextResponse.json({ error: error instanceof Error ? error.message : `No fue posible ${accion} la lista de precios.` }, { status: 400 });
}
