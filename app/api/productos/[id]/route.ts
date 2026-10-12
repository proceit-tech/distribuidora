import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { denyIfNoPermission } from "@/lib/auth/permissions";
import { decidirAccesoDocumento } from "@/lib/productos/permisos-documentos";
import { autorizarProductos } from "@/lib/productos/http";
import { ErrorValidacion } from "@/lib/productos/errores";
import { normalizarProducto } from "@/lib/productos/normalizar";
import { componentesRestantes, eliminarHijos, guardarHijos } from "@/lib/productos/sincronizar";
import {
  columnasProducto,
  fijarPrecioReferencia,
  resolverPais,
  respuestaError,
  validarCambioUnidadBase,
  validarReferencias,
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
              coalesce(p.familia_id::text,'') AS "familiaId", coalesce(p.linea_id::text,'') AS "lineaId",
              coalesce(p.origen_etiqueta,'') AS procedencia,
              p.unidad_medida_id AS "unidadMedidaId", coalesce(p.impuesto_id::text,'') AS "impuestoId",
              coalesce(p.afectacion_iva::text,'') AS "afectacionIva", coalesce(p.proporcion_gravada_iva::text,'') AS "proporcionGravadaIva",
              p.controla_stock AS "controlaStock", p.modo_control_stock AS "modoControlStock",
              p.permite_terceros AS "permiteTerceros", p.requiere_vencimiento AS "requiereVencimiento",
              p.stock_minimo::text AS "stockMinimo", coalesce(p.stock_maximo::text,'') AS "stockMaximo",
              coalesce(p.punto_reposicion::text,'') AS "puntoReposicion",
              coalesce(p.partida_arancelaria,'') AS "partidaArancelaria", coalesce(p.ncm,'') AS ncm,
              coalesce(p.dncp_general,'') AS "dncpGeneral", coalesce(p.dncp_especifico,'') AS "dncpEspecifico",
              coalesce(p.pais_origen_codigo,'') AS "paisOrigenCodigo", coalesce(p.pais_origen_nombre,'') AS "paisOrigenNombre",
              coalesce(p.informacion_factura,'') AS "informacionFactura",
              coalesce(p.relacion_mercaderia::text,'') AS "relacionMercaderia",
              coalesce(p.porcentaje_merma::text,'') AS "porcentajeMerma", coalesce(p.cantidad_merma::text,'') AS "cantidadMerma",
              p.vendible, p.comprable, p.requiere_inspeccion_calidad AS "requiereInspeccionCalidad",
              coalesce(p.vida_util_dias::text,'') AS "vidaUtilDias",
              coalesce(p.peso_neto_kg::text,'') AS "pesoNetoKg", coalesce(p.peso_bruto_kg::text,'') AS "pesoBrutoKg",
              coalesce(p.largo_cm::text,'') AS "largoCm", coalesce(p.ancho_cm::text,'') AS "anchoCm",
              coalesce(p.alto_cm::text,'') AS "altoCm", coalesce(p.volumen_m3::text,'') AS "volumenM3",
              coalesce(p.imagen_url,'') AS "imagenUrl", coalesce(p.observacion,'') AS observacion,
              p.activo, p.creado_at AS "creadoEn", p.actualizado_at AS "actualizadoEn",
              (p.creado_por IS NOT DISTINCT FROM $3::uuid AND p.creado_por IS NOT NULL) AS "esCreador",
              p.carga_documentos_inicial_abierta AS "cargaDocumentosInicialAbierta",
              CASE WHEN p.imagen_clave IS NULL THEN NULL
                   ELSE jsonb_build_object('nombre', p.imagen_nombre, 'tamanoBytes', p.imagen_tamano, 'tipoMime', p.imagen_mime,
                        'actualizadaEn', to_char(p.imagen_actualizada_at AT TIME ZONE 'America/Asuncion', 'DD/MM/YYYY HH24:MI')) END AS "imagenPrivada"
         FROM productos p WHERE p.id = $1 AND p.empresa_id = $2`,
      [id, empresaId, session.user.id],
    );
    if (!principal.rowCount) return noEncontrado();

    const [codigos, unidades, proveedores, depositos, alternativos, componentes, documentos, precio, stock, costo, apertura] = await Promise.all([
      db.query(
        `SELECT id, tipo, codigo, coalesce(descripcion,'') AS descripcion, es_principal AS "esPrincipal"
           FROM producto_codigos WHERE producto_id = $1 AND empresa_id = $2 ORDER BY creado_at, id`,
        [id, empresaId],
      ),
      db.query(
        `SELECT id, unidad_medida_id AS "unidadMedidaId", nombre_presentacion AS "nombrePresentacion",
                factor_conversion::text AS "factorConversion", es_unidad_base AS "esUnidadBase",
                es_unidad_compra AS "esUnidadCompra", es_unidad_venta AS "esUnidadVenta",
                coalesce(codigo_barras,'') AS "codigoBarras", coalesce(peso_bruto_kg::text,'') AS "pesoBrutoKg",
                coalesce(volumen_m3::text,'') AS "volumenM3"
           FROM producto_unidades WHERE producto_id = $1 AND empresa_id = $2 ORDER BY creado_at, id`,
        [id, empresaId],
      ),
      db.query(
        `SELECT pp.id, pp.proveedor_id AS "proveedorId", pr.razon_social AS "proveedorNombre",
                coalesce(pp.codigo_proveedor,'') AS "codigoProveedor", coalesce(pp.descripcion_proveedor,'') AS "descripcionProveedor",
                coalesce(pp.unidad_medida_id::text,'') AS "unidadMedidaId", pp.factor_conversion::text AS "factorConversion",
                coalesce(pp.costo_referencia::text,'') AS "costoReferencia", coalesce(pp.moneda_codigo,'') AS "monedaCodigo",
                coalesce(pp.cantidad_minima_compra::text,'') AS "cantidadMinimaCompra", coalesce(pp.plazo_entrega_dias::text,'') AS "plazoEntregaDias",
                pp.es_principal AS "esPrincipal"
           FROM producto_proveedores pp
           JOIN proveedores pr ON pr.empresa_id = pp.empresa_id AND pr.id = pp.proveedor_id
          WHERE pp.producto_id = $1 AND pp.empresa_id = $2 ORDER BY pp.creado_at, pp.id`,
        [id, empresaId],
      ),
      db.query(
        `SELECT c.id, c.deposito_id AS "depositoId", d.nombre AS "depositoNombre",
                coalesce(c.ubicacion_preferida_id::text,'') AS "ubicacionPreferidaId",
                coalesce(c.stock_minimo::text,'') AS "stockMinimo", coalesce(c.stock_maximo::text,'') AS "stockMaximo",
                coalesce(c.punto_reposicion::text,'') AS "puntoReposicion", coalesce(c.cantidad_reposicion::text,'') AS "cantidadReposicion"
           FROM producto_deposito_configuracion c
           JOIN depositos d ON d.empresa_id = c.empresa_id AND d.id = c.deposito_id
          WHERE c.producto_id = $1 AND c.empresa_id = $2 ORDER BY c.creado_at, c.id`,
        [id, empresaId],
      ),
      db.query(
        `SELECT a.id, a.producto_alternativo_id AS "productoAlternativoId", p.descripcion AS "productoAlternativoNombre",
                a.tipo, a.prioridad::text AS prioridad
           FROM producto_alternativos a
           JOIN productos p ON p.empresa_id = a.empresa_id AND p.id = a.producto_alternativo_id
          WHERE a.producto_id = $1 AND a.empresa_id = $2 ORDER BY a.prioridad, a.id`,
        [id, empresaId],
      ),
      db.query(
        `SELECT k.id, k.producto_componente_id AS "productoComponenteId", p.descripcion AS "productoComponenteNombre",
                k.cantidad::text AS cantidad, k.es_opcional AS "esOpcional", k.orden::text AS orden
           FROM producto_componentes k
           JOIN productos p ON p.empresa_id = k.empresa_id AND p.id = k.producto_componente_id
          WHERE k.producto_kit_id = $1 AND k.empresa_id = $2 ORDER BY k.orden, k.id`,
        [id, empresaId],
      ),
      db.query(
        `SELECT id, tipo, nombre_archivo AS "nombreArchivo", coalesce(url_archivo,'') AS "urlArchivo",
                (almacen_clave IS NOT NULL) AS "tieneArchivo", tamano_bytes, coalesce(tipo_mime,'') AS "tipoMime", version_vigente AS version,
                ${D("fecha_emision")} AS "fechaEmision", ${D("fecha_vencimiento")} AS "fechaVencimiento",
                coalesce(observacion,'') AS observacion
           FROM producto_documentos WHERE producto_id = $1 AND empresa_id = $2 AND eliminado_at IS NULL ORDER BY creado_at, id`,
        [id, empresaId],
      ),
      // Precio de venta de referencia (lista de referencia) y su moneda; sin fila => sin precio.
      db.query(
        `SELECT precio::text AS precio, moneda FROM v_producto_precio_referencia WHERE empresa_id = $2 AND producto_id = $1`,
        [id, empresaId],
      ),
      // Stock real por depósito (saldos DISPONIBLE propios, el mismo criterio de v_stock_producto).
      db.query(
        `SELECT d.id AS "depositoId", d.nombre AS "depositoNombre", sum(s.cantidad)::text AS cantidad
           FROM stock_saldos s JOIN depositos d ON d.empresa_id = s.empresa_id AND d.id = s.deposito_id
          WHERE s.empresa_id = $2 AND s.producto_id = $1 AND s.estado_stock = 'DISPONIBLE' AND s.propiedad = 'PROPIO'
            AND usuario_puede_deposito($2::uuid, $3::uuid, s.deposito_id)
          GROUP BY d.id, d.nombre ORDER BY d.nombre`,
        [id, empresaId, session.user.id],
      ),
      db.query(
        `SELECT CASE WHEN sum(c.cantidad_valorizada) > 0 THEN round(sum(c.valor_total) / sum(c.cantidad_valorizada), 4)::text END AS costo
           FROM inventario_costos c WHERE c.empresa_id = $2 AND c.producto_id = $1 AND usuario_puede_deposito($2::uuid, $3::uuid, c.deposito_id)
          HAVING count(*) > 0`,
        [id, empresaId, session.user.id],
      ),
      db.query(
        `SELECT mi.numero_movimiento AS numero, to_char(mi.fecha_movimiento, 'YYYY-MM-DD') AS fecha, ml.cantidad::text AS cantidad,
                ml.costo_unitario::text AS "costoUnitario", d.nombre AS "depositoNombre"
           FROM movimiento_lineas ml
           JOIN movimientos_inventario mi ON mi.empresa_id = ml.empresa_id AND mi.id = ml.movimiento_id
           LEFT JOIN depositos d ON d.empresa_id = mi.empresa_id AND d.id = mi.deposito_destino_id
          WHERE ml.empresa_id = $2 AND ml.producto_id = $1 AND mi.tipo_origen = 'ABERTURA' AND mi.estado = 'REGISTRADO'
            AND usuario_puede_deposito($2::uuid, $3::uuid, mi.deposito_destino_id)
          ORDER BY mi.fecha_movimiento, mi.creado_at LIMIT 1`,
        [id, empresaId, session.user.id],
      ),
    ]);
    const monedaBase = await db.query(
      `SELECT coalesce((SELECT moneda_codigo FROM listas_precio WHERE empresa_id = e.id AND es_referencia), e.moneda_base_codigo) AS moneda
         FROM empresas e WHERE e.id = $1`,
      [empresaId],
    );
    const acceso = await autorizarProductos();
    const permisosDoc = "permisos" in acceso ? acceso.permisos : { ver: false, editar: false, crear: false };
    const contextoDoc = { esCreador: (principal.rows[0] as { esCreador: boolean }).esCreador === true, cargaInicialAbierta: (principal.rows[0] as { cargaDocumentosInicialAbierta: boolean }).cargaDocumentosInicialAbierta === true };
    const puede = (a: Parameters<typeof decidirAccesoDocumento>[0]) => decidirAccesoDocumento(a, permisosDoc, contextoDoc).permitido;
    const documentosLista = (documentos.rows as Array<Record<string, unknown>>).map((d) => ({ ...d, tamanoBytes: d.tamano_bytes === null ? null : Number(d.tamano_bytes), version: Number(d.version), tamano_bytes: undefined }));
    const stockRows = stock.rows as Array<{ depositoId: string; depositoNombre: string; cantidad: string }>;
    const stockTotal = await db.query(
      `SELECT coalesce(sum(cantidad),0)::text AS total FROM stock_saldos
        WHERE empresa_id = $2 AND producto_id = $1 AND estado_stock = 'DISPONIBLE' AND propiedad = 'PROPIO'
          AND usuario_puede_deposito($2::uuid, $3::uuid, deposito_id)`,
      [id, empresaId, session.user.id],
    );

    const base = principal.rows[0] as Record<string, unknown>;
    return NextResponse.json({
      producto: {
        ...base,
        precioVentaReferencia: precio.rowCount ? (precio.rows[0] as { precio: string }).precio : null,
        monedaPrecioReferencia: precio.rowCount
          ? (precio.rows[0] as { moneda: string }).moneda
          : ((monedaBase.rows[0] as { moneda?: string } | undefined)?.moneda ?? ""),
        stockActual: (stockTotal.rows[0] as { total: string }).total,
        stockPorDeposito: stockRows,
        costoPromedio: costo.rowCount ? (costo.rows[0] as { costo: string | null }).costo : null,
        aperturaRegistrada: apertura.rowCount ? apertura.rows[0] : null,
        codigos: codigos.rows,
        unidades: unidades.rows,
        proveedores: proveedores.rows,
        depositos: depositos.rows,
        alternativos: alternativos.rows,
        componentes: componentes.rows,
        documentos: documentosLista,
        permisosDocumentos: { cargar: puede("CARGAR"), gestionar: puede("EDITAR_DATOS"), historial: puede("VER_HISTORIAL"), finalizar: puede("FINALIZAR_CARGA") },
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
    const datos = normalizarProducto(cuerpo, { modo: "editar", productoId: id });

    conexion = await db.connect();
    await conexion.query("BEGIN");

    const existente = await conexion.query(
      `SELECT codigo, categoria_id::text, marca_id::text, familia_id::text, linea_id::text, unidad_medida_id::text, impuesto_id::text
         FROM productos WHERE id = $1 AND empresa_id = $2 FOR UPDATE`,
      [id, empresaId],
    );
    if (!existente.rowCount) {
      await conexion.query("ROLLBACK");
      return noEncontrado();
    }

    const actual = existente.rows[0] as { codigo: string; categoria_id: string | null; marca_id: string | null; familia_id: string | null; linea_id: string | null; unidad_medida_id: string | null; impuesto_id: string | null };

    // El código interno es inmutable: la edición no lo cambia (vacío = se conserva el existente).
    if (datos.codigo && datos.codigo !== actual.codigo) throw new ErrorValidacion("El código interno no puede modificarse.", "codigo", 409);

    await resolverPais(conexion, datos);
    await validarReferencias(conexion, empresaId, datos, actual);

    // PRD-A21: solo si la unidad base REALMENTE cambia respecto de la persistida; sin cambio, la edición es normal. Un producto sin unidad persistida (legado) no se bloquea.
    if (datos.unidadMedidaId && actual.unidad_medida_id && datos.unidadMedidaId !== actual.unidad_medida_id) {
      await validarCambioUnidadBase(conexion, empresaId, session.user.id, id, actual.unidad_medida_id, datos.unidadMedidaId);
    }

    // Sincronización selectiva: primero solo las eliminaciones explícitas (así un cambio de KIT a otro tipo no choca con la guarda de
    // componentes), después el producto y por último las actualizaciones por id y las altas. Nada se borra y recrea.
    await eliminarHijos(conexion, empresaId, id, datos);

    if (datos.tipoProducto !== "KIT" && (await componentesRestantes(conexion, empresaId, id)) > 0) {
      throw new ErrorValidacion("El producto tiene componentes: elimínelos antes de cambiar el tipo de KIT.", "tipoProducto");
    }

    const columnas = columnasProducto(datos, actual.codigo).filter(([nombre]) => nombre !== "codigo");
    const sets = columnas.map(([nombre], i) => `${nombre} = $${i + 3}`);
    // La primera edición cierra la carga inicial de documentos y foto (quien solo tiene CREAR deja de poder agregarlos).
    sets.push("carga_documentos_inicial_abierta = false");
    await conexion.query(
      `UPDATE productos SET ${sets.join(", ")}, actualizado_at = now() WHERE id = $1 AND empresa_id = $2`,
      [id, empresaId, ...columnas.map(([, v]) => v)],
    );

    await guardarHijos(conexion, empresaId, id, datos);
    // Precio de referencia: valor => alta/actualización; null => se quita; si el campo no viene en el cuerpo no se toca. El inventario inicial NO se toca al editar
    // (los cambios de stock se hacen con movimientos).
    if (datos.precioEnviado) await fijarPrecioReferencia(conexion, empresaId, id, datos.precioVentaReferencia);
    await conexion.query("COMMIT");

    return NextResponse.json({ message: `Producto ${actual.codigo} actualizado correctamente.`, producto: { id, codigo: actual.codigo } });
  } catch (error) {
    if (conexion) await conexion.query("ROLLBACK").catch(() => undefined);
    return respuestaError(error, "actualizar");
  } finally {
    conexion?.release();
  }
}
