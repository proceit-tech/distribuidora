import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { denyIfNoPermission } from "@/lib/auth/permissions";
import {
  columnasProducto,
  fijarPrecioReferencia,
  insertarHijos,
  prepararProducto,
  registrarInventarioInicial,
  resolverPais,
  respuestaError,
  siguienteCodigo,
} from "@/lib/productos/shared";

// Solo DEMO explícito usa respuestas simuladas. La falta de DATABASE_URL NUNCA activa datos ficticios.
const DEMO_MODE = process.env.DEMO_MODE === "true";

function errorConfiguracion() {
  return NextResponse.json(
    { error: "Servicio no disponible: base de datos no configurada." },
    { status: 503 },
  );
}

async function obtenerSesionActual() {
  const { getCurrentSession } = await import("@/lib/auth/session");
  return getCurrentSession();
}

async function obtenerDb() {
  const { db } = await import("@/lib/db");
  return db;
}

const CATALOGOS_VACIOS = {
  categorias: [],
  marcas: [],
  familias: [],
  lineas: [],
  monedaReferencia: "",
  unidades: [],
  impuestos: [],
  proveedores: [],
  depositos: [],
  paises: [],
  productos: [],
};

export async function GET(request: Request) {
  if (!DEMO_MODE && !process.env.DATABASE_URL) {
    return errorConfiguracion();
  }

  if (DEMO_MODE) {
    return NextResponse.json({ productos: [], catalogos: CATALOGOS_VACIOS, demo: true });
  }

  const session = await obtenerSesionActual();
  if (!session) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const denegadoVer = await denyIfNoPermission(session, "PRODUCTOS", "VER");
  if (denegadoVer) return denegadoVer;

  const db = await obtenerDb();
  const soloCatalogos = new URL(request.url).searchParams.get("modo") === "catalogos";

  try {
    const empresaId = session.user.empresaId;
    const [productos, categorias, marcas, familias, lineas, moneda, unidades, impuestos, proveedores, depositos, paises, catalogoProductos] =
      await Promise.all([
        soloCatalogos
          ? Promise.resolve({ rows: [] as unknown[] })
          : db.query(
              `SELECT p.id, p.codigo, p.codigo_inventario, p.codigo_sifen, p.codigo_barras,
                      p.descripcion, p.descripcion_factura, p.tipo_producto, p.controla_stock,
                      p.stock_minimo::float8 AS stock_minimo, p.punto_reposicion::float8 AS punto_reposicion,
                      p.activo, p.origen_etiqueta, p.pais_origen_nombre,
                      c.nombre AS categoria, m.nombre AS marca, i.nombre AS impuesto,
                      u.nombre AS unidad_nombre,
                      p.familia_id, f.nombre AS familia, p.linea_id, l.nombre AS linea,
                      COALESCE(sp.disponible, 0)::float8 AS stock_disponible,
                      COALESCE(sp.bajo_minimo, false) AS bajo_minimo,
                      cp.costo_promedio::float8 AS costo_promedio,
                      pr.precio::float8 AS precio_venta_referencia, pr.moneda AS moneda_precio_referencia,
                      COALESCE(ap.cantidad, 0)::float8 AS inventario_inicial
                 FROM productos p
                 LEFT JOIN familias_producto f ON f.empresa_id = p.empresa_id AND f.id = p.familia_id
                 LEFT JOIN lineas_producto l ON l.empresa_id = p.empresa_id AND l.id = p.linea_id
                 LEFT JOIN v_producto_costo_promedio cp ON cp.empresa_id = p.empresa_id AND cp.producto_id = p.id
                 LEFT JOIN v_producto_precio_referencia pr ON pr.empresa_id = p.empresa_id AND pr.producto_id = p.id
                 LEFT JOIN LATERAL (
                   SELECT sum(ml.cantidad) AS cantidad
                     FROM movimiento_lineas ml
                     JOIN movimientos_inventario mi ON mi.empresa_id = ml.empresa_id AND mi.id = ml.movimiento_id
                    WHERE ml.empresa_id = p.empresa_id AND ml.producto_id = p.id
                      AND mi.tipo_origen = 'ABERTURA' AND mi.estado = 'REGISTRADO'
                 ) ap ON true
                 LEFT JOIN categorias_producto c ON c.empresa_id = p.empresa_id AND c.id = p.categoria_id
                 LEFT JOIN marcas_producto m ON m.empresa_id = p.empresa_id AND m.id = p.marca_id
                 LEFT JOIN impuestos i ON i.id = p.impuesto_id
                 LEFT JOIN unidades_medida u ON u.id = p.unidad_medida_id
                 LEFT JOIN v_stock_producto sp ON sp.empresa_id = p.empresa_id AND sp.producto_id = p.id
                WHERE p.empresa_id = $1
                ORDER BY p.activo DESC, p.descripcion`,
              [empresaId],
            ),
        db.query(`SELECT id, codigo, nombre FROM categorias_producto WHERE empresa_id = $1 AND activo = true ORDER BY nombre`, [empresaId]),
        db.query(`SELECT id, coalesce(codigo, '') AS codigo, nombre FROM marcas_producto WHERE empresa_id = $1 AND activo = true ORDER BY nombre`, [empresaId]),
        db.query(`SELECT id, coalesce(codigo, '') AS codigo, nombre FROM familias_producto WHERE empresa_id = $1 AND activo = true ORDER BY nombre`, [empresaId]),
        db.query(`SELECT id, familia_id, coalesce(codigo, '') AS codigo, nombre FROM lineas_producto WHERE empresa_id = $1 AND activo = true ORDER BY nombre`, [empresaId]),
        db.query(
          `SELECT coalesce((SELECT moneda_codigo FROM listas_precio WHERE empresa_id = e.id AND es_referencia), e.moneda_base_codigo) AS moneda
             FROM empresas e WHERE e.id = $1`,
          [empresaId],
        ),
        db.query(`SELECT id, codigo, nombre FROM unidades_medida WHERE activo = true ORDER BY nombre`),
        db.query(`SELECT id, codigo, nombre, porcentaje::float8 AS porcentaje FROM impuestos WHERE activo = true ORDER BY porcentaje, nombre`),
        db.query(`SELECT id, codigo, razon_social FROM proveedores WHERE empresa_id = $1 AND activo = true ORDER BY razon_social`, [empresaId]),
        db.query(`SELECT id, codigo, nombre FROM depositos WHERE empresa_id = $1 AND activo = true ORDER BY nombre`, [empresaId]),
        db.query(`SELECT codigo, nombre FROM referencia_geografica_paises WHERE activo = true ORDER BY nombre`),
        soloCatalogos
          ? db.query(`SELECT id, codigo, descripcion FROM productos WHERE empresa_id = $1 AND activo = true ORDER BY descripcion`, [empresaId])
          : Promise.resolve({ rows: [] as unknown[] }),
      ]);

    return NextResponse.json({
      productos: productos.rows,
      catalogos: {
        categorias: categorias.rows,
        marcas: marcas.rows,
        familias: familias.rows,
        lineas: (lineas.rows as Array<{ id: string; familia_id: string; codigo: string; nombre: string }>).map((x) => ({
          id: x.id,
          familiaId: x.familia_id,
          codigo: x.codigo,
          nombre: x.nombre,
        })),
        monedaReferencia: (moneda.rows[0] as { moneda?: string } | undefined)?.moneda ?? "",
        unidades: unidades.rows,
        impuestos: impuestos.rows,
        proveedores: proveedores.rows,
        depositos: depositos.rows,
        paises: paises.rows,
        productos: catalogoProductos.rows,
      },
    });
  } catch (error) {
    console.error("Error al cargar productos:", error);
    return NextResponse.json({ error: "No fue posible cargar los productos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let cuerpo: Record<string, unknown>;

  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }

  if (!DEMO_MODE && !process.env.DATABASE_URL) {
    return errorConfiguracion();
  }

  if (DEMO_MODE) {
    return NextResponse.json({ error: "Operación no disponible en modo demo." }, { status: 400 });
  }

  const session = await obtenerSesionActual();
  if (!session) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const denegadoCrear = await denyIfNoPermission(session, "PRODUCTOS", "CREAR");
  if (denegadoCrear) return denegadoCrear;

  const db = await obtenerDb();
  let conexion: PoolClient | undefined;

  try {
    const datos = prepararProducto(cuerpo);
    const empresaId = session.user.empresaId;

    // El inventario inicial es un movimiento real: exige además MOVIMIENTOS.CREAR (y la función valida el alcance del depósito).
    if (datos.inventarioInicial.cantidad > 0) {
      const denegadoMov = await denyIfNoPermission(session, "MOVIMIENTOS", "CREAR");
      if (denegadoMov) return denegadoMov;
    }

    conexion = await db.connect();
    await conexion.query("BEGIN");
    await resolverPais(conexion, datos);

    const codigo = datos.codigo || (await siguienteCodigo(conexion, empresaId));
    const columnas = columnasProducto(datos, codigo);
    const nombres = ["empresa_id", "creado_por", ...columnas.map(([n]) => n)];
    const valores = [empresaId, session.user.id, ...columnas.map(([, v]) => v)];

    const insertado = await conexion.query(
      `INSERT INTO productos (${nombres.join(",")}) VALUES (${valores.map((_, i) => `$${i + 1}`).join(",")})
       RETURNING id, codigo, descripcion`,
      valores,
    );
    const producto = insertado.rows[0] as { id: string; codigo: string; descripcion: string };

    await insertarHijos(conexion, producto.id, datos, session.user.id);
    if (datos.precioVentaReferencia !== null) {
      await fijarPrecioReferencia(conexion, empresaId, producto.id, datos.precioVentaReferencia);
    }
    const movimiento = await registrarInventarioInicial(conexion, empresaId, session.user.id, producto.id, datos);
    await conexion.query("COMMIT");

    return NextResponse.json(
      {
        message: `Producto ${producto.codigo} registrado correctamente.${movimiento ? ` Inventario inicial registrado en el movimiento ${movimiento}.` : ""}`,
        producto,
        movimiento,
      },
      { status: 201 },
    );
  } catch (error) {
    if (conexion) await conexion.query("ROLLBACK").catch(() => undefined);
    return respuestaError(error, "registrar");
  } finally {
    conexion?.release();
  }
}
