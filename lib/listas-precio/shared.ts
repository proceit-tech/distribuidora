import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

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
const si = (v: unknown) => v === true;

function numero(v: unknown, etiqueta: string, min?: number, max?: number): number | null {
  if (v === "" || v === undefined || v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
    throw new Error(`${etiqueta} no es válido.`);
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
function fecha(v: unknown, etiqueta: string) {
  const e = texto(v);
  if (!e) return null;
  let yyyy: string, mm: string, dd: string;
  const iso = e.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const loc = e.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (iso) [, yyyy, mm, dd] = iso;
  else if (loc) [, dd, mm, yyyy] = loc;
  else throw new Error(`${etiqueta} no tiene un formato válido.`);
  const p = new Date(Date.UTC(+yyyy, +mm - 1, +dd));
  if (p.getUTCFullYear() !== +yyyy || p.getUTCMonth() !== +mm - 1 || p.getUTCDate() !== +dd) {
    throw new Error(`${etiqueta} no es válida.`);
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
  const desde = fecha(d.vigenteDesde, "La vigencia inicial");
  const hasta = fecha(d.vigenteHasta, "La vigencia final");

  if (!nombre) throw new Error("Ingrese el nombre de la lista de precios.");
  if (!desde) throw new Error("Ingrese la fecha de vigencia inicial.");
  if (hasta && hasta < desde) throw new Error("La vigencia final no puede ser anterior a la inicial.");
  if (!TIPOS.includes(tipo)) throw new Error("Tipo de lista no válido.");
  if (!/^[A-Z]{3}$/.test(moneda)) throw new Error("Moneda no válida.");
  if (!ESTADOS.includes(estado)) throw new Error("Estado no válido.");
  if (!MODOS.includes(modo)) throw new Error("Modo de precio no válido.");

  const productos = lista<Fila>(d.productos).map((p) => {
    const productoId = uuidOpcional(p.productoId, "El producto");
    if (!productoId) throw new Error("Cada precio requiere seleccionar un producto.");
    const vDesde = fecha(p.vigenteDesde, "La vigencia del producto") ?? desde;
    const vHasta = fecha(p.vigenteHasta, "La vigencia final del producto");
    if (vHasta && vHasta < vDesde) throw new Error("La vigencia final de un producto no puede ser anterior a la inicial.");
    const escalas = lista<Fila>(p.escalas).map((e) => {
      const min = numero(e.cantidadMinima, "Cantidad mínima del escalón", 0.0001);
      const max = numero(e.cantidadMaxima, "Cantidad máxima del escalón", 0);
      if (min === null) throw new Error("Cada escalón requiere cantidad mínima.");
      if (max !== null && max < min) throw new Error("La cantidad máxima de un escalón no puede ser menor que la mínima.");
      return { min, max, precio: numero(e.precio, "Precio del escalón", 0) ?? 0, desc: numero(e.descuentoPct, "Descuento del escalón", 0, 100) ?? 0 };
    });
    return {
      productoId,
      unidadMedidaId: uuidOpcional(p.unidadMedidaId, "La unidad"),
      costo: numero(p.costoReferencia, "Costo de referencia", 0) ?? 0,
      base: numero(p.precioBase, "Precio base", 0) ?? 0,
      precio: numero(p.precioLista, "Precio de lista", 0) ?? 0,
      margen: numero(p.margenPct, "Margen", -999, 999) ?? 0,
      desc: numero(p.descuentoPct, "Descuento", 0, 100) ?? 0,
      cantidadMinima: numero(p.cantidadMinima, "Cantidad mínima", 0.0001) ?? 1,
      desde: vDesde,
      hasta: vHasta,
      activo: p.activo !== false,
      escalas,
    };
  });
  const vistos = new Set<string>();
  for (const p of productos) {
    if (vistos.has(p.productoId)) throw new Error("Un producto no puede repetirse en la misma lista.");
    vistos.add(p.productoId);
  }

  const reglas = lista<Fila>(d.reglasComerciales).map((r) => {
    const tipoAplicacion = texto(r.tipoAplicacion).toUpperCase() || "GENERAL";
    if (!APLICACIONES.includes(tipoAplicacion)) throw new Error("Tipo de aplicación de la regla no válido.");
    const referenciaId = tipoAplicacion === "GENERAL" ? null : uuidOpcional(r.referenciaId, "La referencia de la regla");
    if (tipoAplicacion !== "GENERAL" && !referenciaId) throw new Error("Cada regla que no es general requiere seleccionar su referencia.");
    const vDesde = fecha(r.vigenteDesde, "La vigencia de la regla") ?? desde;
    const vHasta = fecha(r.vigenteHasta, "La vigencia final de la regla");
    if (vHasta && vHasta < vDesde) throw new Error("La vigencia final de una regla no puede ser anterior a la inicial.");
    return {
      tipoAplicacion,
      referenciaId,
      prioridad: Math.trunc(numero(r.prioridad, "Prioridad de la regla", 0) ?? 10),
      cantidadMinima: numero(r.cantidadMinima, "Cantidad mínima de la regla", 0.0001) ?? 1,
      permiteDescuentoAdicional: r.permiteDescuentoAdicional !== false,
      descuentoMaximoPct: numero(r.descuentoMaximoPct, "Descuento máximo de la regla", 0, 100) ?? 0,
      desde: vDesde,
      hasta: vHasta,
      activo: r.activo !== false,
    };
  });

  return {
    codigo: texto(d.codigo, 50), // vacío => LP-nnn al crear
    nombre,
    descripcion: opcional(d.descripcion, 1000),
    tipo,
    moneda,
    estado,
    modo,
    incluyeIva: d.incluyeIva !== false,
    listaBaseId: uuidOpcional(d.listaBaseId, "La lista base"),
    ajuste: numero(d.ajusteGeneralPct, "Ajuste general", -100, 999) ?? 0,
    desde,
    hasta,
    prioridad: Math.trunc(numero(d.prioridad, "Prioridad", 0) ?? 10),
    permiteDescuentoAdicional: d.permiteDescuentoAdicional !== false,
    descuentoMaximoPct: numero(d.descuentoMaximoPct, "Descuento máximo", 0, 100) ?? 0,
    grupoClienteId: uuidOpcional(d.grupoClienteId, "El grupo de cliente"),
    clienteId: uuidOpcional(d.clienteId, "El cliente"),
    zonaId: uuidOpcional(d.zonaId, "La zona"),
    canalVentaId: uuidOpcional(d.canalVentaId, "El canal de venta"),
    activo: d.activo !== false,
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
export async function validarListaBase(c: PoolClient, empresaId: string, listaId: string | null, baseId: string | null) {
  if (!baseId) return;
  if (listaId && baseId === listaId) throw new Error("Una lista no puede ser su propia lista base.");
  const base = await c.query(`SELECT tipo_lista FROM listas_precio WHERE empresa_id = $1 AND id = $2`, [empresaId, baseId]);
  if (!base.rowCount) throw new Error("La lista base no existe en su empresa.");
  if (!listaId) return;
  const ciclo = await c.query(
    `WITH RECURSIVE cadena AS (
       SELECT id, lista_precio_base_id FROM listas_precio WHERE empresa_id = $1 AND id = $2
       UNION
       SELECT l.id, l.lista_precio_base_id FROM listas_precio l JOIN cadena c ON l.empresa_id = $1 AND l.id = c.lista_precio_base_id)
     SELECT 1 FROM cadena WHERE id = $3`,
    [empresaId, baseId, listaId],
  );
  if (ciclo.rowCount) throw new Error("La lista base elegida depende de esta lista (referencia circular).");
}

/** Hijos: precios por producto (con escalones) y reglas. empresa_id explícito; las FK compuestas impiden referencias de otra empresa. */
export async function insertarHijos(c: PoolClient, empresaId: string, listaId: string, d: DatosLista) {
  if (d.productos.length) {
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
        empresaId, listaId, d.moneda,
        d.productos.map((p) => p.productoId),
        d.productos.map((p) => p.unidadMedidaId),
        d.productos.map((p) => p.costo),
        d.productos.map((p) => p.base),
        d.productos.map((p) => p.precio),
        d.productos.map((p) => p.margen),
        d.productos.map((p) => p.desc),
        d.productos.map((p) => p.cantidadMinima),
        d.productos.map((p) => p.desde),
        d.productos.map((p) => p.hasta),
        d.productos.map((p) => p.activo),
      ],
    );
    if (items.rowCount !== d.productos.length) {
      throw Object.assign(new Error("Algún producto no existe en su empresa."), { code: "23503", constraint: "lista_precio_items_producto_fk" });
    }
    const idPorProducto = new Map((items.rows as Array<{ id: string; producto_id: string }>).map((r) => [r.producto_id, r.id]));
    const esc = d.productos.flatMap((p) => p.escalas.map((e) => ({ item: idPorProducto.get(p.productoId) as string, ...e })));
    if (esc.length) {
      await c.query(
        `INSERT INTO lista_precio_escalones (empresa_id, lista_precio_item_id, cantidad_minima, cantidad_maxima, precio, descuento_pct)
         SELECT $1, * FROM unnest($2::uuid[], $3::numeric[], $4::numeric[], $5::numeric[], $6::numeric[])`,
        [empresaId, esc.map((e) => e.item), esc.map((e) => e.min), esc.map((e) => e.max), esc.map((e) => e.precio), esc.map((e) => e.desc)],
      );
    }
  }
  for (const r of d.reglas) {
    await c.query(
      `INSERT INTO lista_precio_reglas
         (empresa_id, lista_precio_id, tipo_aplicacion, referencia_id, prioridad, cantidad_minima, permite_descuento_adicional,
          descuento_maximo_pct, vigente_desde, vigente_hasta, activo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [empresaId, listaId, r.tipoAplicacion, r.referenciaId, r.prioridad, r.cantidadMinima, r.permiteDescuentoAdicional,
       r.descuentoMaximoPct, r.desde, r.hasta, r.activo],
    );
  }
}

export async function borrarHijos(c: PoolClient, empresaId: string, listaId: string) {
  await c.query(
    `DELETE FROM lista_precio_escalones WHERE empresa_id = $1 AND lista_precio_item_id IN
       (SELECT id FROM lista_precio_items WHERE empresa_id = $1 AND lista_precio_id = $2)`,
    [empresaId, listaId],
  );
  await c.query(`DELETE FROM lista_precio_items WHERE empresa_id = $1 AND lista_precio_id = $2`, [empresaId, listaId]);
  await c.query(`DELETE FROM lista_precio_reglas WHERE empresa_id = $1 AND lista_precio_id = $2`, [empresaId, listaId]);
}

export function respuestaError(error: unknown, accion: string) {
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
