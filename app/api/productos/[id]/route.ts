import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { denyIfNoPermission } from "@/lib/auth/permissions";
import {
  columnasProducto,
  insertarHijos,
  prepararProducto,
  resolverPais,
  respuestaError,
  TABLAS_HIJAS,
} from "@/lib/productos/shared";

type Contexto = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Solo DEMO explícito usa respuestas simuladas; sin DATABASE_URL se responde 503.
const DEMO_MODE = process.env.DEMO_MODE === "true";

const sinBase = () =>
  NextResponse.json({ error: "Servicio no disponible: base de datos no configurada." }, { status: 503 });
const noEncontrado = () => NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });

async function sesionActual() {
  const { getCurrentSession } = await import("@/lib/auth/session");
  return getCurrentSession();
}

async function obtenerDb() {
  const { db } = await import("@/lib/db");
  return db;
}

const D = (columna: string) => `coalesce(to_char(${columna}, 'YYYY-MM-DD'), '')`;

export async function GET(_request: Request, contexto: Contexto) {
  if (!DEMO_MODE && !process.env.DATABASE_URL) return sinBase();
  if (DEMO_MODE) return noEncontrado();

  const session = await sesionActual();
  if (!session) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });

  const denegado = await denyIfNoPermission(session, "PRODUCTOS", "VER");
  if (denegado) return denegado;

  const { id } = await contexto.params;
  if (!UUID.test(id)) return noEncontrado();

  const empresaId = session.user.empresaId;
  const db = await obtenerDb();

  try {
    const principal = await db.query(
      `SELECT p.id, p.codigo, coalesce(p.codigo_inventario,'') AS "codigoInventario",
              coalesce(p.codigo_sifen,'') AS "codigoSifen", coalesce(p.codigo_barras,'') AS "codigoBarras",
              p.descripcion, p.descripcion_factura AS "descripcionFactura", p.tipo_producto AS "tipoProducto",
              coalesce(p.categoria_id::text,'') AS "categoriaId", coalesce(p.marca_id::text,'') AS "marcaId",
              coalesce(p.origen_etiqueta,'') AS procedencia,
              p.unidad_medida_id AS "unidadMedidaId", coalesce(p.impuesto_id::text,'') AS "impuestoId",
              p.controla_stock AS "controlaStock", p.modo_control_stock AS "modoControlStock",
              p.permite_terceros AS "permiteTerceros", p.requiere_vencimiento AS "requiereVencimiento",
              p.stock_minimo::float8 AS "stockMinimo", coalesce(p.stock_maximo,0)::float8 AS "stockMaximo",
              coalesce(p.punto_reposicion,0)::float8 AS "puntoReposicion",
              coalesce(p.partida_arancelaria,'') AS "partidaArancelaria", coalesce(p.ncm,'') AS ncm,
              coalesce(p.dncp_general,'') AS "dncpGeneral", coalesce(p.dncp_especifico,'') AS "dncpEspecifico",
              coalesce(p.pais_origen_codigo,'') AS "paisOrigenCodigo", coalesce(p.pais_origen_nombre,'') AS "paisOrigenNombre",
              coalesce(p.informacion_factura,'') AS "informacionFactura",
              coalesce(p.relacion_mercaderia::text,'') AS "relacionMercaderia",
              coalesce(p.porcentaje_merma,0)::float8 AS "porcentajeMerma", coalesce(p.cantidad_merma,0)::float8 AS "cantidadMerma",
              p.vendible, p.comprable, p.requiere_inspeccion_calidad AS "requiereInspeccionCalidad",
              coalesce(p.vida_util_dias,0) AS "vidaUtilDias",
              coalesce(p.peso_neto_kg,0)::float8 AS "pesoNetoKg", coalesce(p.peso_bruto_kg,0)::float8 AS "pesoBrutoKg",
              coalesce(p.largo_cm,0)::float8 AS "largoCm", coalesce(p.ancho_cm,0)::float8 AS "anchoCm",
              coalesce(p.alto_cm,0)::float8 AS "altoCm", coalesce(p.volumen_m3,0)::float8 AS "volumenM3",
              coalesce(p.imagen_url,'') AS "imagenUrl", coalesce(p.observacion,'') AS observacion,
              p.activo, p.creado_at AS "creadoEn", p.actualizado_at AS "actualizadoEn"
         FROM productos p WHERE p.id = $1 AND p.empresa_id = $2`,
      [id, empresaId],
    );
    if (!principal.rowCount) return noEncontrado();

    const [codigos, unidades, proveedores, depositos, alternativos, componentes, documentos] = await Promise.all([
      db.query(
        `SELECT id, tipo, codigo, coalesce(descripcion,'') AS descripcion, es_principal AS "esPrincipal"
           FROM producto_codigos WHERE producto_id = $1 AND empresa_id = $2 ORDER BY creado_at, id`,
        [id, empresaId],
      ),
      db.query(
        `SELECT id, unidad_medida_id AS "unidadMedidaId", nombre_presentacion AS "nombrePresentacion",
                factor_conversion::float8 AS "factorConversion", es_unidad_base AS "esUnidadBase",
                es_unidad_compra AS "esUnidadCompra", es_unidad_venta AS "esUnidadVenta",
                coalesce(codigo_barras,'') AS "codigoBarras", coalesce(peso_bruto_kg,0)::float8 AS "pesoBrutoKg",
                coalesce(volumen_m3,0)::float8 AS "volumenM3"
           FROM producto_unidades WHERE producto_id = $1 AND empresa_id = $2 ORDER BY creado_at, id`,
        [id, empresaId],
      ),
      db.query(
        `SELECT pp.id, pp.proveedor_id AS "proveedorId", pr.razon_social AS "proveedorNombre",
                coalesce(pp.codigo_proveedor,'') AS "codigoProveedor", coalesce(pp.descripcion_proveedor,'') AS "descripcionProveedor",
                coalesce(pp.unidad_medida_id::text,'') AS "unidadMedidaId", pp.factor_conversion::float8 AS "factorConversion",
                coalesce(pp.costo_referencia,0)::float8 AS "costoReferencia", coalesce(pp.moneda_codigo,'PYG') AS "monedaCodigo",
                coalesce(pp.cantidad_minima_compra,0)::float8 AS "cantidadMinimaCompra", coalesce(pp.plazo_entrega_dias,0) AS "plazoEntregaDias",
                pp.es_principal AS "esPrincipal"
           FROM producto_proveedores pp
           JOIN proveedores pr ON pr.empresa_id = pp.empresa_id AND pr.id = pp.proveedor_id
          WHERE pp.producto_id = $1 AND pp.empresa_id = $2 ORDER BY pp.creado_at, pp.id`,
        [id, empresaId],
      ),
      db.query(
        `SELECT c.id, c.deposito_id AS "depositoId", d.nombre AS "depositoNombre",
                coalesce(c.ubicacion_preferida_id::text,'') AS "ubicacionPreferidaId",
                coalesce(c.stock_minimo,0)::float8 AS "stockMinimo", coalesce(c.stock_maximo,0)::float8 AS "stockMaximo",
                coalesce(c.punto_reposicion,0)::float8 AS "puntoReposicion", coalesce(c.cantidad_reposicion,0)::float8 AS "cantidadReposicion"
           FROM producto_deposito_configuracion c
           JOIN depositos d ON d.empresa_id = c.empresa_id AND d.id = c.deposito_id
          WHERE c.producto_id = $1 AND c.empresa_id = $2 ORDER BY c.creado_at, c.id`,
        [id, empresaId],
      ),
      db.query(
        `SELECT a.id, a.producto_alternativo_id AS "productoAlternativoId", p.descripcion AS "productoAlternativoNombre",
                a.tipo, a.prioridad
           FROM producto_alternativos a
           JOIN productos p ON p.empresa_id = a.empresa_id AND p.id = a.producto_alternativo_id
          WHERE a.producto_id = $1 AND a.empresa_id = $2 ORDER BY a.prioridad, a.id`,
        [id, empresaId],
      ),
      db.query(
        `SELECT k.id, k.producto_componente_id AS "productoComponenteId", p.descripcion AS "productoComponenteNombre",
                k.cantidad::float8 AS cantidad, k.es_opcional AS "esOpcional", k.orden
           FROM producto_componentes k
           JOIN productos p ON p.empresa_id = k.empresa_id AND p.id = k.producto_componente_id
          WHERE k.producto_kit_id = $1 AND k.empresa_id = $2 ORDER BY k.orden, k.id`,
        [id, empresaId],
      ),
      db.query(
        `SELECT id, tipo, nombre_archivo AS "nombreArchivo", url_archivo AS "urlArchivo",
                ${D("fecha_emision")} AS "fechaEmision", ${D("fecha_vencimiento")} AS "fechaVencimiento",
                coalesce(observacion,'') AS observacion
           FROM producto_documentos WHERE producto_id = $1 AND empresa_id = $2 ORDER BY creado_at, id`,
        [id, empresaId],
      ),
    ]);

    const base = principal.rows[0] as Record<string, unknown>;
    return NextResponse.json({
      producto: {
        ...base,
        codigos: codigos.rows,
        unidades: unidades.rows,
        proveedores: proveedores.rows,
        depositos: depositos.rows,
        alternativos: alternativos.rows,
        componentes: componentes.rows,
        documentos: documentos.rows,
      },
    });
  } catch (error) {
    console.error("Error al consultar producto:", error);
    return NextResponse.json({ error: "No fue posible cargar el producto." }, { status: 500 });
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

  const denegado = await denyIfNoPermission(session, "PRODUCTOS", "EDITAR");
  if (denegado) return denegado;

  const { id } = await contexto.params;
  if (!UUID.test(id)) return noEncontrado();

  const empresaId = session.user.empresaId;
  const db = await obtenerDb();
  let conexion: PoolClient | undefined;

  try {
    const datos = prepararProducto(cuerpo);
    if (!datos.codigo) throw new Error("El código del producto es obligatorio.");

    conexion = await db.connect();
    await conexion.query("BEGIN");

    const existente = await conexion.query(
      `SELECT codigo FROM productos WHERE id = $1 AND empresa_id = $2 FOR UPDATE`,
      [id, empresaId],
    );
    if (!existente.rowCount) {
      await conexion.query("ROLLBACK");
      return noEncontrado();
    }

    await resolverPais(conexion, datos);

    // Las listas hijas del formulario reemplazan a las anteriores. Se borran antes del UPDATE
    // para que un cambio de tipo KIT -> otro no choque con la guarda de componentes.
    for (const [tabla, columna] of TABLAS_HIJAS) {
      await conexion.query(`DELETE FROM ${tabla} WHERE ${columna} = $1 AND empresa_id = $2`, [id, empresaId]);
    }

    const columnas = columnasProducto(datos, datos.codigo);
    const sets = columnas.map(([nombre], i) => `${nombre} = $${i + 3}`);
    await conexion.query(
      `UPDATE productos SET ${sets.join(", ")} WHERE id = $1 AND empresa_id = $2`,
      [id, empresaId, ...columnas.map(([, v]) => v)],
    );

    await insertarHijos(conexion, id, datos, session.user.id);
    await conexion.query("COMMIT");

    return NextResponse.json({ message: `Producto ${datos.codigo} actualizado correctamente.`, producto: { id, codigo: datos.codigo } });
  } catch (error) {
    if (conexion) await conexion.query("ROLLBACK").catch(() => undefined);
    return respuestaError(error, "actualizar");
  } finally {
    conexion?.release();
  }
}
