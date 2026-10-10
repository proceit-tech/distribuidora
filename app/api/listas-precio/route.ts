import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { denyIfNoPermission } from "@/lib/auth/permissions";
import {
  columnasLista,
  insertarHijos,
  prepararLista,
  respuestaError,
  siguienteCodigo,
  validarListaBase,
} from "@/lib/listas-precio/shared";

// Solo DEMO explícito usa respuestas simuladas. La falta de DATABASE_URL NUNCA activa datos ficticios.
const DEMO_MODE = process.env.DEMO_MODE === "true";

const sinBase = () =>
  NextResponse.json({ error: "Servicio no disponible: base de datos no configurada." }, { status: 503 });

async function sesionActual() {
  const { getCurrentSession } = await import("@/lib/auth/session");
  return getCurrentSession();
}
async function obtenerDb() {
  const { db } = await import("@/lib/db");
  return db;
}

const D = (c: string) => `coalesce(to_char(${c}, 'YYYY-MM-DD'), '')`;

export async function GET(request: Request) {
  if (!DEMO_MODE && !process.env.DATABASE_URL) return sinBase();
  if (DEMO_MODE) return NextResponse.json({ listas: [], demo: true });

  const session = await sesionActual();
  if (!session) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });

  const denegado = await denyIfNoPermission(session, "LISTAS_PRECIO", "VER");
  if (denegado) return denegado;

  const db = await obtenerDb();
  const empresaId = session.user.empresaId;
  const soloCatalogos = new URL(request.url).searchParams.get("modo") === "catalogos";

  try {
    if (soloCatalogos) {
      const [monedas, grupos, zonas, canales, clientes, productos, bases, base] = await Promise.all([
        db.query(`SELECT codigo, nombre, coalesce(simbolo, '') AS simbolo FROM monedas WHERE activo = true ORDER BY codigo`),
        db.query(`SELECT id, codigo, nombre FROM grupos_cliente WHERE empresa_id = $1 AND activo = true ORDER BY nombre`, [empresaId]),
        db.query(`SELECT id, codigo, nombre FROM zonas_comerciales WHERE empresa_id = $1 AND activo = true ORDER BY nombre`, [empresaId]),
        db.query(`SELECT id, codigo, nombre FROM canales_venta WHERE empresa_id = $1 AND activo = true ORDER BY nombre`, [empresaId]),
        db.query(`SELECT id, codigo, razon_social AS nombre FROM clientes WHERE empresa_id = $1 AND activo = true ORDER BY razon_social`, [empresaId]),
        db.query(
          `SELECT p.id, p.codigo, p.descripcion, p.unidad_medida_id AS "unidadMedidaId", u.nombre AS "unidadMedidaNombre",
                  coalesce(cp.costo_promedio, 0)::float8 AS "costoPromedio", pr.precio::float8 AS "precioReferencia"
             FROM productos p
             JOIN unidades_medida u ON u.id = p.unidad_medida_id
             LEFT JOIN v_producto_costo_promedio cp ON cp.empresa_id = p.empresa_id AND cp.producto_id = p.id
             LEFT JOIN v_producto_precio_referencia pr ON pr.empresa_id = p.empresa_id AND pr.producto_id = p.id
            WHERE p.empresa_id = $1 AND p.activo = true
            ORDER BY p.descripcion`,
          [empresaId],
        ),
        db.query(
          `SELECT id, codigo, nombre, moneda_codigo AS "monedaCodigo" FROM listas_precio WHERE empresa_id = $1 AND activo = true ORDER BY nombre`,
          [empresaId],
        ),
        db.query(`SELECT moneda_base_codigo AS moneda FROM empresas WHERE id = $1`, [empresaId]),
      ]);
      return NextResponse.json({
        catalogos: {
          monedas: monedas.rows,
          gruposCliente: grupos.rows,
          zonas: zonas.rows,
          canales: canales.rows,
          clientes: clientes.rows,
          productos: productos.rows,
          listasBase: bases.rows,
          monedaBase: (base.rows[0] as { moneda?: string } | undefined)?.moneda ?? "PYG",
        },
      });
    }

    const r = await db.query(
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
              l.creado_at AS "creadoEn", l.actualizado_at AS "actualizadoEn",
              (SELECT count(*)::int FROM lista_precio_items i WHERE i.empresa_id = l.empresa_id AND i.lista_precio_id = l.id) AS "productosCount",
              (SELECT count(*)::int FROM lista_precio_reglas x WHERE x.empresa_id = l.empresa_id AND x.lista_precio_id = l.id) AS "reglasCount"
         FROM listas_precio l
         LEFT JOIN listas_precio b ON b.empresa_id = l.empresa_id AND b.id = l.lista_precio_base_id
         LEFT JOIN grupos_cliente g ON g.empresa_id = l.empresa_id AND g.id = l.grupo_cliente_id
         LEFT JOIN clientes c ON c.empresa_id = l.empresa_id AND c.id = l.cliente_id
         LEFT JOIN zonas_comerciales z ON z.empresa_id = l.empresa_id AND z.id = l.zona_comercial_id
         LEFT JOIN canales_venta cv ON cv.empresa_id = l.empresa_id AND cv.id = l.canal_venta_id
        WHERE l.empresa_id = $1
        ORDER BY l.activo DESC, l.es_referencia DESC, l.nombre`,
      [empresaId],
    );
    return NextResponse.json({ listas: r.rows });
  } catch (error) {
    console.error("Error al cargar listas de precios:", error);
    return NextResponse.json({ error: "No fue posible cargar las listas de precios." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }

  if (!DEMO_MODE && !process.env.DATABASE_URL) return sinBase();
  if (DEMO_MODE) return NextResponse.json({ error: "Operación no disponible en modo demo." }, { status: 400 });

  const session = await sesionActual();
  if (!session) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });

  const denegado = await denyIfNoPermission(session, "LISTAS_PRECIO", "CREAR");
  if (denegado) return denegado;

  const db = await obtenerDb();
  let conexion: PoolClient | undefined;

  try {
    const datos = prepararLista(cuerpo);
    const empresaId = session.user.empresaId;

    conexion = await db.connect();
    await conexion.query("BEGIN");
    await validarListaBase(conexion, empresaId, null, datos.listaBaseId);

    const codigo = datos.codigo || (await siguienteCodigo(conexion, empresaId));
    const columnas = columnasLista(datos, codigo);
    const nombres = ["empresa_id", "creado_por", ...columnas.map(([n]) => n)];
    const valores = [empresaId, session.user.id, ...columnas.map(([, v]) => v)];
    const ins = await conexion.query(
      `INSERT INTO listas_precio (${nombres.join(",")}) VALUES (${valores.map((_, i) => `$${i + 1}`).join(",")})
       RETURNING id, codigo, nombre`,
      valores,
    );
    const lista = ins.rows[0] as { id: string; codigo: string; nombre: string };
    await insertarHijos(conexion, empresaId, lista.id, datos);
    await conexion.query("COMMIT");

    return NextResponse.json({ message: `Lista de precios ${lista.codigo} registrada correctamente.`, lista }, { status: 201 });
  } catch (error) {
    if (conexion) await conexion.query("ROLLBACK").catch(() => undefined);
    return respuestaError(error, "registrar");
  } finally {
    conexion?.release();
  }
}
