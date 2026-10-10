import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { denyIfNoPermission } from "@/lib/auth/permissions";
import {
  borrarHijos,
  columnasLista,
  insertarHijos,
  prepararLista,
  respuestaError,
  validarListaBase,
} from "@/lib/listas-precio/shared";

type Contexto = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMO_MODE = process.env.DEMO_MODE === "true";

const sinBase = () =>
  NextResponse.json({ error: "Servicio no disponible: base de datos no configurada." }, { status: 503 });
const noEncontrado = () => NextResponse.json({ error: "Lista de precios no encontrada." }, { status: 404 });

async function sesionActual() {
  const { getCurrentSession } = await import("@/lib/auth/session");
  return getCurrentSession();
}
async function obtenerDb() {
  const { db } = await import("@/lib/db");
  return db;
}

const D = (c: string) => `coalesce(to_char(${c}, 'YYYY-MM-DD'), '')`;

export async function GET(_request: Request, contexto: Contexto) {
  if (!DEMO_MODE && !process.env.DATABASE_URL) return sinBase();
  if (DEMO_MODE) return noEncontrado();

  const session = await sesionActual();
  if (!session) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  const denegado = await denyIfNoPermission(session, "LISTAS_PRECIO", "VER");
  if (denegado) return denegado;

  const { id } = await contexto.params;
  if (!UUID.test(id)) return noEncontrado();

  const empresaId = session.user.empresaId;
  const db = await obtenerDb();

  try {
    const principal = await db.query(
      `SELECT l.id, l.codigo, l.nombre, coalesce(l.descripcion, '') AS descripcion, l.tipo_lista AS tipo,
              l.moneda_codigo AS "monedaCodigo", l.estado, l.modo_precio AS "modoPrecio",
              l.incluye_impuesto AS "incluyeIva", coalesce(l.lista_precio_base_id::text, '') AS "listaBaseId",
              coalesce(b.codigo, '') AS "listaBaseCodigo", coalesce(b.nombre, '') AS "listaBaseNombre",
              l.ajuste_general_pct::float8 AS "ajusteGeneralPct",
              ${D("l.vigente_desde")} AS "vigenteDesde", ${D("l.vigente_hasta")} AS "vigenteHasta",
              l.prioridad, l.permite_descuento_adicional AS "permiteDescuentoAdicional",
              l.descuento_maximo_pct::float8 AS "descuentoMaximoPct",
              coalesce(l.grupo_cliente_id::text, '') AS "grupoClienteId", coalesce(g.nombre, '') AS "grupoClienteNombre",
              coalesce(l.cliente_id::text, '') AS "clienteId", coalesce(c.codigo, '') AS "clienteCodigo", coalesce(c.razon_social, '') AS "clienteNombre",
              coalesce(l.zona_comercial_id::text, '') AS "zonaId", coalesce(z.nombre, '') AS "zonaNombre",
              coalesce(l.canal_venta_id::text, '') AS "canalVentaId", coalesce(cv.nombre, '') AS "canalVentaNombre",
              l.activo, coalesce(l.observacion, '') AS observacion, l.es_referencia AS "esReferencia",
              l.creado_at AS "creadoEn", l.actualizado_at AS "actualizadoEn"
         FROM listas_precio l
         LEFT JOIN listas_precio b ON b.empresa_id = l.empresa_id AND b.id = l.lista_precio_base_id
         LEFT JOIN grupos_cliente g ON g.empresa_id = l.empresa_id AND g.id = l.grupo_cliente_id
         LEFT JOIN clientes c ON c.empresa_id = l.empresa_id AND c.id = l.cliente_id
         LEFT JOIN zonas_comerciales z ON z.empresa_id = l.empresa_id AND z.id = l.zona_comercial_id
         LEFT JOIN canales_venta cv ON cv.empresa_id = l.empresa_id AND cv.id = l.canal_venta_id
        WHERE l.empresa_id = $1 AND l.id = $2`,
      [empresaId, id],
    );
    if (!principal.rowCount) return noEncontrado();

    const [items, escalones, reglas] = await Promise.all([
      db.query(
        `SELECT i.id, i.producto_id AS "productoId", p.codigo AS "productoCodigo", p.descripcion AS "productoDescripcion",
                i.unidad_medida_id AS "unidadMedidaId", u.nombre AS "unidadMedidaNombre", i.moneda_codigo AS "monedaCodigo",
                i.costo_referencia::float8 AS "costoReferencia", i.precio_base::float8 AS "precioBase",
                i.precio_lista::float8 AS "precioLista", i.margen_pct::float8 AS "margenPct",
                i.descuento_pct::float8 AS "descuentoPct", i.cantidad_minima::float8 AS "cantidadMinima",
                ${D("i.vigente_desde")} AS "vigenteDesde", ${D("i.vigente_hasta")} AS "vigenteHasta", i.activo
           FROM lista_precio_items i
           JOIN productos p ON p.empresa_id = i.empresa_id AND p.id = i.producto_id
           JOIN unidades_medida u ON u.id = i.unidad_medida_id
          WHERE i.empresa_id = $1 AND i.lista_precio_id = $2
          ORDER BY p.descripcion`,
        [empresaId, id],
      ),
      db.query(
        `SELECT e.id, e.lista_precio_item_id AS "itemId", e.cantidad_minima::float8 AS "cantidadMinima",
                e.cantidad_maxima::float8 AS "cantidadMaxima", e.precio::float8 AS precio, e.descuento_pct::float8 AS "descuentoPct"
           FROM lista_precio_escalones e
           JOIN lista_precio_items i ON i.empresa_id = e.empresa_id AND i.id = e.lista_precio_item_id
          WHERE e.empresa_id = $1 AND i.lista_precio_id = $2
          ORDER BY e.cantidad_minima`,
        [empresaId, id],
      ),
      db.query(
        `SELECT r.id, r.tipo_aplicacion AS "tipoAplicacion", coalesce(r.referencia_id::text, '') AS "referenciaId",
                coalesce(g.codigo, c.codigo, z.codigo, cv.codigo, '') AS "referenciaCodigo",
                coalesce(g.nombre, c.razon_social, z.nombre, cv.nombre, '') AS "referenciaNombre",
                r.prioridad, r.cantidad_minima::float8 AS "cantidadMinima",
                r.permite_descuento_adicional AS "permiteDescuentoAdicional", r.descuento_maximo_pct::float8 AS "descuentoMaximoPct",
                ${D("r.vigente_desde")} AS "vigenteDesde", ${D("r.vigente_hasta")} AS "vigenteHasta", r.activo
           FROM lista_precio_reglas r
           LEFT JOIN grupos_cliente g ON r.tipo_aplicacion = 'GRUPO_CLIENTE' AND g.empresa_id = r.empresa_id AND g.id = r.referencia_id
           LEFT JOIN clientes c ON r.tipo_aplicacion = 'CLIENTE' AND c.empresa_id = r.empresa_id AND c.id = r.referencia_id
           LEFT JOIN zonas_comerciales z ON r.tipo_aplicacion = 'ZONA' AND z.empresa_id = r.empresa_id AND z.id = r.referencia_id
           LEFT JOIN canales_venta cv ON r.tipo_aplicacion = 'CANAL_VENTA' AND cv.empresa_id = r.empresa_id AND cv.id = r.referencia_id
          WHERE r.empresa_id = $1 AND r.lista_precio_id = $2
          ORDER BY r.prioridad, r.creado_at`,
        [empresaId, id],
      ),
    ]);

    const escalasPorItem = new Map<string, unknown[]>();
    for (const e of escalones.rows as Array<{ itemId: string }>) {
      const { itemId, ...resto } = e;
      escalasPorItem.set(itemId, [...(escalasPorItem.get(itemId) ?? []), resto]);
    }
    const productos = (items.rows as Array<{ id: string }>).map((i) => ({ ...i, escalas: escalasPorItem.get(i.id) ?? [] }));

    return NextResponse.json({ lista: { ...principal.rows[0], productos, reglasComerciales: reglas.rows } });
  } catch (error) {
    console.error("Error al cargar lista de precios:", error);
    return NextResponse.json({ error: "No fue posible cargar la lista de precios." }, { status: 500 });
  }
}

export async function PUT(request: Request, contexto: Contexto) {
  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }

  if (!DEMO_MODE && !process.env.DATABASE_URL) return sinBase();
  if (DEMO_MODE) return noEncontrado();

  const session = await sesionActual();
  if (!session) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  const denegado = await denyIfNoPermission(session, "LISTAS_PRECIO", "EDITAR");
  if (denegado) return denegado;

  const { id } = await contexto.params;
  if (!UUID.test(id)) return noEncontrado();

  const empresaId = session.user.empresaId;
  const db = await obtenerDb();
  let conexion: PoolClient | undefined;

  try {
    const datos = prepararLista(cuerpo);
    conexion = await db.connect();
    await conexion.query("BEGIN");

    const actual = await conexion.query(
      `SELECT codigo, es_referencia FROM listas_precio WHERE empresa_id = $1 AND id = $2 FOR UPDATE`,
      [empresaId, id],
    );
    if (!actual.rowCount) {
      await conexion.query("ROLLBACK");
      return noEncontrado();
    }
    const { codigo: codigoActual, es_referencia: esReferencia } = actual.rows[0] as { codigo: string; es_referencia: boolean };

    if (esReferencia) {
      // La lista de referencia (precio de venta de Productos) mantiene su definición: venta, precio fijo, sin alcance ni base.
      if (datos.tipo !== "VENTA" || datos.modo !== "PRECIO_FIJO") {
        throw new Error("La lista de referencia debe ser de tipo Venta y de precio fijo.");
      }
      if (datos.listaBaseId || datos.grupoClienteId || datos.clienteId || datos.zonaId || datos.canalVentaId) {
        throw new Error("La lista de referencia no admite lista base ni alcance comercial.");
      }
      if (datos.estado !== "ACTIVA" || !datos.activo) {
        throw new Error("La lista de referencia debe permanecer activa.");
      }
    }

    await validarListaBase(conexion, empresaId, id, datos.listaBaseId);

    const columnas = columnasLista(datos, datos.codigo || codigoActual);
    const sets = columnas.map(([n], i) => `${n} = $${i + 3}`);
    await conexion.query(`UPDATE listas_precio SET ${sets.join(", ")} WHERE id = $1 AND empresa_id = $2`, [
      id,
      empresaId,
      ...columnas.map(([, v]) => v),
    ]);

    await borrarHijos(conexion, empresaId, id);
    await insertarHijos(conexion, empresaId, id, datos);
    await conexion.query("COMMIT");

    return NextResponse.json({
      message: `Lista de precios ${datos.codigo || codigoActual} actualizada correctamente.`,
      lista: { id, codigo: datos.codigo || codigoActual },
    });
  } catch (error) {
    if (conexion) await conexion.query("ROLLBACK").catch(() => undefined);
    return respuestaError(error, "actualizar");
  } finally {
    conexion?.release();
  }
}
