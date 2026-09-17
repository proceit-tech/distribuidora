import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";

const texto = (valor: unknown, maximo?: number) => {
  const resultado = typeof valor === "string" ? valor.trim() : "";
  return maximo ? resultado.slice(0, maximo) : resultado;
};
const opcional = (valor: unknown, maximo?: number) =>
  texto(valor, maximo) || null;
const lista = <T>(valor: unknown): T[] =>
  Array.isArray(valor) ? (valor as T[]) : [];
const si = (valor: unknown) => valor === true;
function numero(
  valor: unknown,
  etiqueta: string,
  minimo?: number,
  maximo?: number,
) {
  if (valor === "" || valor === undefined || valor === null) return null;
  const resultado = Number(valor);
  if (
    !Number.isFinite(resultado) ||
    (minimo !== undefined && resultado < minimo) ||
    (maximo !== undefined && resultado > maximo)
  )
    throw new Error(`${etiqueta} no es válido.`);
  return resultado;
}
function fecha(valor: unknown, etiqueta: string) {
  const entrada = texto(valor);
  if (!entrada) return null;
  const partes = entrada.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!partes) throw new Error(`${etiqueta} debe tener el formato dd/mm/yyyy.`);
  const [, dd, mm, yyyy] = partes;
  const prueba = new Date(Date.UTC(+yyyy, +mm - 1, +dd));
  if (
    prueba.getUTCFullYear() !== +yyyy ||
    prueba.getUTCMonth() !== +mm - 1 ||
    prueba.getUTCDate() !== +dd
  )
    throw new Error(`${etiqueta} no es válida.`);
  return `${yyyy}-${mm}-${dd}`;
}
const errorPg = (e: unknown): e is { code?: string } =>
  typeof e === "object" && e !== null;

export async function GET() {
  const session = await getCurrentSession();
  if (!session)
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  try {
    const empresaId = session.user.empresaId;
    const [
      productos,
      categorias,
      marcas,
      unidades,
      impuestos,
      proveedores,
      depositos,
    ] = await Promise.all([
      db.query(
        `SELECT p.id,p.codigo,p.codigo_sifen,p.descripcion,p.descripcion_factura,p.tipo_producto,p.codigo_barras,p.controla_stock,p.modo_control_stock,p.requiere_vencimiento,p.stock_minimo,p.punto_reposicion,p.activo,c.nombre categoria,m.nombre marca,i.nombre impuesto FROM productos p LEFT JOIN categorias_producto c ON c.id=p.categoria_id LEFT JOIN marcas_producto m ON m.id=p.marca_id LEFT JOIN impuestos i ON i.id=p.impuesto_id WHERE p.empresa_id=$1 ORDER BY p.activo DESC,p.descripcion`,
        [empresaId],
      ),
      db.query(
        `SELECT id,codigo,nombre FROM categorias_producto WHERE empresa_id=$1 AND activo=true ORDER BY nombre`,
        [empresaId],
      ),
      db.query(
        `SELECT id,nombre FROM marcas_producto WHERE empresa_id=$1 AND activo=true ORDER BY nombre`,
        [empresaId],
      ),
      db.query(
        `SELECT id,codigo,nombre,codigo_sifen,descripcion_sifen FROM unidades_medida WHERE activo=true ORDER BY nombre`,
      ),
      db.query(
        `SELECT id,codigo,nombre,porcentaje FROM impuestos WHERE activo=true ORDER BY porcentaje,nombre`,
      ),
      db.query(
        `SELECT id,codigo,razon_social FROM proveedores WHERE empresa_id=$1 AND activo=true ORDER BY razon_social`,
        [empresaId],
      ),
      db.query(
        `SELECT id, codigo, nombre FROM depositos WHERE empresa_id = $1 AND activo = true ORDER BY nombre`,
        [empresaId],
      ),
    ]);
    return NextResponse.json({
      productos: productos.rows,
      catalogos: {
        categorias: categorias.rows ?? [],
        marcas: marcas.rows ?? [],
        unidades: unidades.rows ?? [],
        impuestos: impuestos.rows ?? [],
        proveedores: proveedores.rows ?? [],
        depositos: depositos.rows ?? [],
      },
    });
  } catch (error) {
    console.error("Error al cargar productos:", error);
    return NextResponse.json(
      { error: "No fue posible cargar los productos." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session)
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  let conexion: PoolClient | undefined;
  try {
    const d = (await request.json()) as Record<string, unknown>;
    const codigo = texto(d.codigo, 80);
    const descripcion = texto(d.descripcion, 300);
    const codigoSifen = opcional(d.codigoSifen, 20);
    const descripcionFactura = texto(d.descripcionFactura, 120);
    const tipoProducto = texto(d.tipoProducto).toUpperCase() || "MERCADERIA";
    const modoControl = texto(d.modoControlStock).toUpperCase() || "CANTIDAD";
    if (
      !codigo ||
      !descripcion ||
      !descripcionFactura ||
      !texto(d.unidadMedidaId)
    )
      throw new Error(
        "Código, descripción, descripción para factura y unidad base son obligatorios.",
      );
    if (
      !["MERCADERIA", "SERVICIO", "KIT", "ACTIVO_FIJO"].includes(tipoProducto)
    )
      throw new Error("Tipo de producto no válido.");
    if (!["CANTIDAD", "LOTE", "UNIDAD_ETIQUETADA"].includes(modoControl))
      throw new Error("Modo de control de stock no válido.");
    if (codigoSifen && codigoSifen.length > 20)
      throw new Error("El código SIFEN no puede superar 20 caracteres.");
    const codigos = lista<Record<string, unknown>>(d.codigos);
    const unidades = lista<Record<string, unknown>>(d.unidades);
    const proveedores = lista<Record<string, unknown>>(d.proveedores);
    const depositos = lista<Record<string, unknown>>(d.depositos);
    const alternativos = lista<Record<string, unknown>>(d.alternativos);
    const componentes = lista<Record<string, unknown>>(d.componentes);
    const documentos = lista<Record<string, unknown>>(d.documentos);
    for (const c of codigos) {
      const tipo = texto(c.tipo).toUpperCase();
      const valor = texto(c.codigo, 80);
      if (
        ![
          "GTIN",
          "GTIN_EMPAQUE",
          "EAN",
          "UPC",
          "CODIGO_ALTERNO",
          "SKU_PROVEEDOR",
          "OTRO",
        ].includes(tipo) ||
        !valor
      )
        throw new Error("Existe un código de producto incompleto.");
      if (
        ["GTIN", "GTIN_EMPAQUE", "EAN", "UPC"].includes(tipo) &&
        !/^[0-9]{8,14}$/.test(valor)
      )
        throw new Error("GTIN/EAN/UPC debe contener entre 8 y 14 dígitos.");
    }
    for (const u of unidades)
      if (
        !texto(u.unidadMedidaId) ||
        !texto(u.nombrePresentacion, 100) ||
        !(numero(u.factorConversion, "Factor de conversión", 0) ?? 0)
      )
        throw new Error(
          "Cada presentación requiere unidad, nombre y factor de conversión.",
        );
    if (componentes.length && tipoProducto !== "KIT")
      throw new Error("Solo un producto de tipo KIT puede tener componentes.");
    conexion = await db.connect();
    await conexion.query("BEGIN");
    const producto = (
      await conexion.query(
        `INSERT INTO productos (empresa_id,codigo,codigo_barras,descripcion,categoria_id,marca_id,unidad_medida_id,impuesto_id,controla_stock,modo_control_stock,permite_terceros,requiere_vencimiento,stock_minimo,stock_maximo,punto_reposicion,costo_promedio,tipo_producto,codigo_sifen,descripcion_factura,partida_arancelaria,ncm,dncp_general,dncp_especifico,pais_origen_codigo,pais_origen_nombre,informacion_factura,relacion_mercaderia,porcentaje_merma,cantidad_merma,vendible,comprable,requiere_inspeccion_calidad,vida_util_dias,peso_neto_kg,peso_bruto_kg,largo_cm,ancho_cm,alto_cm,volumen_m3,imagen_url,observacion) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41) RETURNING id,codigo,descripcion`,
        [
          session.user.empresaId,
          codigo,
          opcional(d.codigoBarras, 80),
          descripcion,
          opcional(d.categoriaId),
          opcional(d.marcaId),
          texto(d.unidadMedidaId),
          opcional(d.impuestoId),
          si(d.controlaStock),
          modoControl,
          si(d.permiteTerceros),
          si(d.requiereVencimiento),
          numero(d.stockMinimo, "Stock mínimo", 0) ?? 0,
          numero(d.stockMaximo, "Stock máximo", 0),
          numero(d.puntoReposicion, "Punto de reposición", 0),
          numero(d.costoPromedio, "Costo promedio", 0) ?? 0,
          tipoProducto,
          codigoSifen,
          descripcionFactura,
          opcional(d.partidaArancelaria, 4),
          opcional(d.ncm, 8),
          opcional(d.dncpGeneral, 8),
          opcional(d.dncpEspecifico, 4),
          opcional(d.paisOrigenCodigo, 3)?.toUpperCase() ?? null,
          opcional(d.paisOrigenNombre, 30),
          opcional(d.informacionFactura, 500),
          numero(d.relacionMercaderia, "Relación de mercadería", 1, 2),
          numero(d.porcentajeMerma, "Porcentaje de merma", 0, 100),
          numero(d.cantidadMerma, "Cantidad de merma", 0),
          d.vendible !== false,
          d.comprable !== false,
          si(d.requiereInspeccionCalidad),
          numero(d.vidaUtilDias, "Vida útil", 0),
          numero(d.pesoNetoKg, "Peso neto", 0),
          numero(d.pesoBrutoKg, "Peso bruto", 0),
          numero(d.largoCm, "Largo", 0),
          numero(d.anchoCm, "Ancho", 0),
          numero(d.altoCm, "Alto", 0),
          numero(d.volumenM3, "Volumen", 0),
          opcional(d.imagenUrl),
          opcional(d.observacion, 1000),
        ],
      )
    ).rows[0];
    for (const c of codigos)
      await conexion.query(
        `INSERT INTO producto_codigos(producto_id,tipo,codigo,descripcion,es_principal) VALUES($1,$2,$3,$4,$5)`,
        [
          producto.id,
          texto(c.tipo).toUpperCase(),
          texto(c.codigo, 80),
          opcional(c.descripcion, 120),
          si(c.esPrincipal),
        ],
      );
    for (const u of unidades)
      await conexion.query(
        `INSERT INTO producto_unidades(producto_id,unidad_medida_id,nombre_presentacion,factor_conversion,es_unidad_base,es_unidad_compra,es_unidad_venta,codigo_barras,peso_bruto_kg,volumen_m3) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          producto.id,
          texto(u.unidadMedidaId),
          texto(u.nombrePresentacion, 100),
          numero(u.factorConversion, "Factor de conversión", 0),
          si(u.esUnidadBase),
          si(u.esUnidadCompra),
          si(u.esUnidadVenta),
          opcional(u.codigoBarras, 80),
          numero(u.pesoBrutoKg, "Peso bruto", 0),
          numero(u.volumenM3, "Volumen", 0),
        ],
      );
    for (const p of proveedores)
      await conexion.query(
        `INSERT INTO producto_proveedores(producto_id,proveedor_id,codigo_proveedor,descripcion_proveedor,unidad_medida_id,factor_conversion,costo_referencia,moneda_codigo,cantidad_minima_compra,plazo_entrega_dias,es_principal) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          producto.id,
          texto(p.proveedorId),
          opcional(p.codigoProveedor, 80),
          opcional(p.descripcionProveedor, 300),
          opcional(p.unidadMedidaId),
          numero(p.factorConversion, "Factor", 0) ?? 1,
          numero(p.costoReferencia, "Costo", 0),
          opcional(p.monedaCodigo, 3),
          numero(p.cantidadMinimaCompra, "Cantidad mínima", 0),
          numero(p.plazoEntregaDias, "Plazo", 0),
          si(p.esPrincipal),
        ],
      );
    for (const x of depositos)
      await conexion.query(
        `INSERT INTO producto_deposito_configuracion(producto_id,deposito_id,ubicacion_preferida_id,stock_minimo,stock_maximo,punto_reposicion,cantidad_reposicion) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          producto.id,
          texto(x.depositoId),
          opcional(x.ubicacionPreferidaId),
          numero(x.stockMinimo, "Stock mínimo", 0),
          numero(x.stockMaximo, "Stock máximo", 0),
          numero(x.puntoReposicion, "Punto", 0),
          numero(x.cantidadReposicion, "Cantidad", 0),
        ],
      );
    for (const a of alternativos)
      await conexion.query(
        `INSERT INTO producto_alternativos(producto_id,producto_alternativo_id,tipo,prioridad) VALUES($1,$2,$3,$4)`,
        [
          producto.id,
          texto(a.productoAlternativoId),
          texto(a.tipo).toUpperCase() || "SUSTITUTO",
          numero(a.prioridad, "Prioridad", 1) ?? 1,
        ],
      );
    for (const c of componentes)
      await conexion.query(
        `INSERT INTO producto_componentes(producto_kit_id,producto_componente_id,cantidad,es_opcional,orden) VALUES($1,$2,$3,$4,$5)`,
        [
          producto.id,
          texto(c.productoComponenteId),
          numero(c.cantidad, "Cantidad", 0),
          si(c.esOpcional),
          numero(c.orden, "Orden", 1) ?? 1,
        ],
      );
    for (const doc of documentos) {
      const emision = fecha(doc.fechaEmision, "Fecha de emisión");
      const vencimiento = fecha(doc.fechaVencimiento, "Fecha de vencimiento");
      if (vencimiento && emision && vencimiento < emision)
        throw new Error("El vencimiento no puede ser anterior a la emisión.");
      await conexion.query(
        `INSERT INTO producto_documentos(producto_id,tipo,nombre_archivo,url_archivo,fecha_emision,fecha_vencimiento,observacion,cargado_por) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          producto.id,
          texto(doc.tipo).toUpperCase(),
          texto(doc.nombreArchivo, 255),
          texto(doc.urlArchivo),
          emision,
          vencimiento,
          opcional(doc.observacion, 500),
          session.user.id,
        ],
      );
    }
    await conexion.query("COMMIT");
    return NextResponse.json(
      { message: "Producto registrado correctamente.", producto },
      { status: 201 },
    );
  } catch (e) {
    if (conexion) await conexion.query("ROLLBACK").catch(() => undefined);
    console.error("Error al registrar producto:", e);
    if (errorPg(e) && e.code === "23505")
      return NextResponse.json(
        { error: "Ya existe un producto o código con ese valor." },
        { status: 409 },
      );
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "No fue posible registrar el producto.",
      },
      { status: 400 },
    );
  } finally {
    conexion?.release();
  }
}