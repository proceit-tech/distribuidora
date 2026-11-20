import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { denyIfNoPermission } from "@/lib/auth/permissions";
import { decidirGet } from "@/lib/productos/acceso-get";
import {
  columnasProducto,
  fijarPrecioReferencia,
  registrarInventarioInicial,
  resolverPais,
  respuestaError,
  siguienteCodigo,
  validarReferencias,
} from "@/lib/productos/shared";
import { ErrorValidacion } from "@/lib/productos/errores";
import { alcanceConsultaDeposito } from "@/lib/productos/alcance";
import { esVendibleFiscal, normalizarProducto } from "@/lib/productos/normalizar";
import { guardarHijos } from "@/lib/productos/sincronizar";

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
  monedaBaseCosto: "",
  unidades: [],
  impuestos: [],
  proveedores: [],
  depositos: [],
  paises: [],
  monedas: [],
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

  // PRD-D01: la autorización se decide por la FINALIDAD de la consulta (lib/productos/acceso-get.ts) antes de conceder cualquier excepción. Solo `modo=catalogos` (único parámetro) admite VER o CREAR y, para
  // CREAR-only, sin la lista de productos existentes (política C24 pendiente); la lista y cualquier otra consulta exigen VER.
  const denegadoVer = await denyIfNoPermission(session, "PRODUCTOS", "VER");
  const tieneCrear = (await denyIfNoPermission(session, "PRODUCTOS", "CREAR")) === null;
  const decision = decidirGet(new URL(request.url), { ver: !denegadoVer, crear: tieneCrear });

  if (decision.tipo === "invalida") return NextResponse.json({ error: "Consulta no válida." }, { status: 400 });
  if (decision.tipo === "denegada") return denegadoVer ?? NextResponse.json({ error: "No tiene permiso para esta acción." }, { status: 403 });

  const db = await obtenerDb();
  const soloCatalogos = decision.finalidad === "CATALOGOS";

  try {
    const empresaId = session.user.empresaId;
    const [productos, categorias, marcas, familias, lineas, moneda, unidades, impuestos, proveedores, depositos, paises, monedas, catalogoProductos] =
      await Promise.all([
        soloCatalogos
          ? Promise.resolve({ rows: [] as unknown[] })
          : db.query(
              `SELECT p.id, p.codigo, p.codigo_inventario, p.codigo_sifen, p.codigo_barras,
                      p.descripcion, p.descripcion_factura, p.tipo_producto, p.controla_stock,
                      p.stock_minimo::text AS stock_minimo, p.punto_reposicion::text AS punto_reposicion,
                      p.activo, p.origen_etiqueta, p.pais_origen_nombre,
                      c.nombre AS categoria, m.nombre AS marca, i.nombre AS impuesto,
                      u.nombre AS unidad_nombre,
                      p.familia_id, f.nombre AS familia, p.linea_id, l.nombre AS linea,
                      COALESCE(sp.disponible, 0)::text AS stock_disponible,
                      (p.controla_stock AND p.stock_minimo > 0 AND COALESCE(sp.disponible, 0) < p.stock_minimo) AS bajo_minimo,
                      cp.costo_promedio::text AS costo_promedio,
                      pr.precio::text AS precio_venta_referencia, pr.moneda AS moneda_precio_referencia,
                      COALESCE(ap.cantidad, 0)::text AS inventario_inicial
                 FROM productos p
                 LEFT JOIN familias_producto f ON f.empresa_id = p.empresa_id AND f.id = p.familia_id
                 LEFT JOIN lineas_producto l ON l.empresa_id = p.empresa_id AND l.id = p.linea_id
                 -- PRD-A23/R02-01: costo, stock e inventario inicial agregan SOLO los depósitos dentro del alcance de consulta del usuario (el mismo criterio de Stock, activos o no).
                 LEFT JOIN LATERAL (
                   SELECT CASE WHEN sum(c.cantidad_valorizada) > 0 THEN round(sum(c.valor_total) / sum(c.cantidad_valorizada), 4) END AS costo_promedio
                     FROM inventario_costos c
                    WHERE c.empresa_id = p.empresa_id AND c.producto_id = p.id AND ${alcanceConsultaDeposito("c.deposito_id", "$1", "$2")}
                 ) cp ON true
                 LEFT JOIN v_producto_precio_referencia pr ON pr.empresa_id = p.empresa_id AND pr.producto_id = p.id
                 LEFT JOIN LATERAL (
                   SELECT sum(ml.cantidad) AS cantidad
                     FROM movimiento_lineas ml
                     JOIN movimientos_inventario mi ON mi.empresa_id = ml.empresa_id AND mi.id = ml.movimiento_id
                    WHERE ml.empresa_id = p.empresa_id AND ml.producto_id = p.id
                      AND mi.tipo_origen = 'ABERTURA' AND mi.estado = 'REGISTRADO'
                      AND ${alcanceConsultaDeposito("mi.deposito_destino_id", "$1", "$2")}
                 ) ap ON true
                 LEFT JOIN categorias_producto c ON c.empresa_id = p.empresa_id AND c.id = p.categoria_id
                 LEFT JOIN marcas_producto m ON m.empresa_id = p.empresa_id AND m.id = p.marca_id
                 LEFT JOIN impuestos i ON i.id = p.impuesto_id
                 LEFT JOIN unidades_medida u ON u.id = p.unidad_medida_id
                 LEFT JOIN LATERAL (
                   SELECT sum(s.cantidad) AS disponible
                     FROM stock_saldos s
                    WHERE s.empresa_id = p.empresa_id AND s.producto_id = p.id AND s.estado_stock = 'DISPONIBLE' AND s.propiedad = 'PROPIO'
                      AND ${alcanceConsultaDeposito("s.deposito_id", "$1", "$2")}
                 ) sp ON true
                WHERE p.empresa_id = $1
                ORDER BY p.activo DESC, p.descripcion`,
              [empresaId, session.user.id],
            ),
        db.query(`SELECT id, codigo, nombre FROM categorias_producto WHERE empresa_id = $1 AND activo = true ORDER BY nombre`, [empresaId]),
        db.query(`SELECT id, coalesce(codigo, '') AS codigo, nombre FROM marcas_producto WHERE empresa_id = $1 AND activo = true ORDER BY nombre`, [empresaId]),
        db.query(`SELECT id, coalesce(codigo, '') AS codigo, nombre, categoria_id AS "categoriaId" FROM familias_producto WHERE empresa_id = $1 AND activo = true ORDER BY nombre`, [empresaId]),
        db.query(`SELECT id, familia_id, coalesce(codigo, '') AS codigo, nombre FROM lineas_producto WHERE empresa_id = $1 AND activo = true ORDER BY nombre`, [empresaId]),
        db.query(
          // PRO-335-R01: además de la moneda del PRECIO de referencia, la moneda base de la empresa (moneda de los COSTOS de inventario), solo lectura.
          `SELECT coalesce((SELECT moneda_codigo FROM listas_precio WHERE empresa_id = e.id AND es_referencia), e.moneda_base_codigo) AS moneda,
                  e.moneda_base_codigo AS moneda_base
             FROM empresas e WHERE e.id = $1`,
          [empresaId],
        ),
        db.query(
          `SELECT u.id, u.codigo, u.nombre, u.unidad_sifen_codigo AS "sifenCodigo", coalesce(s.representacion, '') AS "sifenRepresentacion", s.vigente AS "sifenVigente"
             FROM unidades_medida u LEFT JOIN unidades_medida_sifen s ON s.codigo = u.unidad_sifen_codigo
            WHERE u.activo = true ORDER BY u.nombre`,
        ),
        db.query(`SELECT id, codigo, nombre, porcentaje::text AS porcentaje FROM impuestos WHERE activo = true ORDER BY porcentaje, nombre`),
        db.query(`SELECT id, codigo, razon_social FROM proveedores WHERE empresa_id = $1 AND activo = true ORDER BY razon_social`, [empresaId]),
        db.query(`SELECT id, codigo, nombre FROM depositos WHERE empresa_id = $1 AND activo = true AND usuario_puede_deposito($1::uuid, $2::uuid, id) ORDER BY nombre`, [empresaId, session.user.id]),
        db.query(`SELECT codigo, nombre FROM referencia_geografica_paises WHERE activo = true ORDER BY nombre`),
        db.query(`SELECT codigo, nombre FROM monedas WHERE activo = true ORDER BY codigo`),
        soloCatalogos && decision.incluirProductos
          ? db.query(`SELECT id, codigo, descripcion FROM productos WHERE empresa_id = $1 AND activo = true ORDER BY descripcion`, [empresaId])
          : Promise.resolve({ rows: [] as unknown[] }),
      ]);

    return NextResponse.json({
      // PRD-D01: permiso VER del usuario autenticado (sesión del servidor) para que la alta decida sus enlaces de retorno.
      permisos: { ver: !denegadoVer },
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
        monedaBaseCosto: (moneda.rows[0] as { moneda_base?: string } | undefined)?.moneda_base ?? "",
        unidades: unidades.rows,
        impuestos: impuestos.rows,
        proveedores: proveedores.rows,
        depositos: depositos.rows,
        paises: paises.rows,
        monedas: monedas.rows,
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
    const datos = normalizarProducto(cuerpo, { modo: "crear" });
    const empresaId = session.user.empresaId;

    // El inventario inicial es un movimiento real: exige además MOVIMIENTOS.CREAR (y la función valida el alcance del depósito).
    if (datos.codigo) throw new ErrorValidacion("El código interno se genera automáticamente y no puede indicarse.", "codigo");
    if (datos.inventarioInicial.cantidad !== null) {
      const denegadoMov = await denyIfNoPermission(session, "MOVIMIENTOS", "CREAR");
      if (denegadoMov) return denegadoMov;
    }

    conexion = await db.connect();
    await conexion.query("BEGIN");
    await resolverPais(conexion, datos);

    await validarReferencias(conexion, empresaId, datos, {}, { exigirUnidadSifen: esVendibleFiscal("crear", datos.tipoProducto, datos.vendible) });

    const codigo = await siguienteCodigo(conexion, empresaId);
    const columnas = columnasProducto(datos, codigo);
    const nombres = ["empresa_id", "creado_por", "carga_documentos_inicial_abierta", ...columnas.map(([n]) => n)];
    const valores = [empresaId, session.user.id, true, ...columnas.map(([, v]) => v)];

    const insertado = await conexion.query(
      `INSERT INTO productos (${nombres.join(",")}) VALUES (${valores.map((_, i) => `$${i + 1}`).join(",")})
       RETURNING id, codigo, descripcion`,
      valores,
    );
    const producto = insertado.rows[0] as { id: string; codigo: string; descripcion: string };

    await guardarHijos(conexion, empresaId, producto.id, datos);
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
