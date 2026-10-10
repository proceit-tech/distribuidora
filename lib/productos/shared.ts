import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

// Validación y persistencia compartidas de productos (POST y PUT).
// Consultas parametrizadas; empresa_id siempre llega de la sesión autenticada.

type Cuerpo = Record<string, unknown>;
type Fila = Record<string, unknown>;

export const texto = (valor: unknown, maximo?: number) => {
  const resultado = typeof valor === "string" ? valor.trim() : "";
  return maximo ? resultado.slice(0, maximo) : resultado;
};
export const opcional = (valor: unknown, maximo?: number) => texto(valor, maximo) || null;
const lista = <T>(valor: unknown): T[] => (Array.isArray(valor) ? (valor as T[]) : []);
const si = (valor: unknown) => valor === true;

function numero(valor: unknown, etiqueta: string, minimo?: number, maximo?: number) {
  if (valor === "" || valor === undefined || valor === null) return null;
  const resultado = Number(valor);
  if (
    !Number.isFinite(resultado) ||
    (minimo !== undefined && resultado < minimo) ||
    (maximo !== undefined && resultado > maximo)
  ) {
    throw new Error(`${etiqueta} no es válido.`);
  }
  return resultado;
}

/** Acepta yyyy-mm-dd (input type=date) o dd/mm/yyyy. Devuelve ISO o null. */
function fecha(valor: unknown, etiqueta: string) {
  const entrada = texto(valor);
  if (!entrada) return null;
  let yyyy: string, mm: string, dd: string;
  const iso = entrada.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const local = entrada.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (iso) [, yyyy, mm, dd] = iso;
  else if (local) [, dd, mm, yyyy] = local;
  else throw new Error(`${etiqueta} no tiene un formato válido.`);
  const prueba = new Date(Date.UTC(+yyyy, +mm - 1, +dd));
  if (prueba.getUTCFullYear() !== +yyyy || prueba.getUTCMonth() !== +mm - 1 || prueba.getUTCDate() !== +dd) {
    throw new Error(`${etiqueta} no es válida.`);
  }
  return `${yyyy}-${mm}-${dd}`;
}

const TIPOS_PRODUCTO = ["MERCADERIA", "SERVICIO", "KIT", "ACTIVO_FIJO"];
const MODOS_STOCK = ["CANTIDAD", "LOTE", "UNIDAD_ETIQUETADA"];
const TIPOS_CODIGO = ["GTIN", "GTIN_EMPAQUE", "EAN", "UPC", "CODIGO_ALTERNO", "SKU_PROVEEDOR", "OTRO"];
const TIPOS_ALTERNATIVO = ["SUSTITUTO", "COMPLEMENTARIO", "UPSELL"];
const TIPOS_DOCUMENTO = ["FICHA_TECNICA", "HOJA_SEGURIDAD", "CERTIFICADO", "IMAGEN", "OTRO"];

export type DatosProducto = ReturnType<typeof prepararProducto>;

/** Valida y normaliza el cuerpo. Lanza Error con mensaje en español si algo no es válido. */
export function prepararProducto(d: Cuerpo) {
  const codigo = texto(d.codigo, 80); // vacío => se asigna PRD-nnnnnn al crear
  const descripcion = texto(d.descripcion, 300);
  const descripcionFactura = texto(d.descripcionFactura, 120);
  const unidadMedidaId = texto(d.unidadMedidaId);
  const tipoProducto = texto(d.tipoProducto).toUpperCase() || "MERCADERIA";
  const modoControl = texto(d.modoControlStock).toUpperCase() || "CANTIDAD";

  if (!descripcion || !descripcionFactura || !unidadMedidaId) {
    throw new Error("Descripción, descripción para factura y unidad base son obligatorios.");
  }
  if (!TIPOS_PRODUCTO.includes(tipoProducto)) throw new Error("Tipo de producto no válido.");
  if (!MODOS_STOCK.includes(modoControl)) throw new Error("Modo de control de stock no válido.");

  const codigoSifen = opcional(d.codigoSifen, 20);
  const codigos = lista<Fila>(d.codigos);
  const unidades = lista<Fila>(d.unidades);
  const proveedores = lista<Fila>(d.proveedores);
  const depositos = lista<Fila>(d.depositos);
  const alternativos = lista<Fila>(d.alternativos);
  const componentes = lista<Fila>(d.componentes);
  const documentos = lista<Fila>(d.documentos);

  for (const c of codigos) {
    const tipo = texto(c.tipo).toUpperCase();
    const valor = texto(c.codigo, 80);
    if (!TIPOS_CODIGO.includes(tipo) || !valor) throw new Error("Existe un código de producto incompleto.");
    if (["GTIN", "GTIN_EMPAQUE", "EAN", "UPC"].includes(tipo) && !/^[0-9]{8,14}$/.test(valor)) {
      throw new Error("GTIN/EAN/UPC debe contener entre 8 y 14 dígitos.");
    }
  }
  if (codigos.filter((c) => si(c.esPrincipal)).length > 1) throw new Error("Solo puede existir un código principal.");
  for (const u of unidades) {
    if (!texto(u.unidadMedidaId) || !texto(u.nombrePresentacion, 100) || !(numero(u.factorConversion, "Factor de conversión", 0) ?? 0)) {
      throw new Error("Cada presentación requiere unidad, nombre y factor de conversión.");
    }
  }
  if (unidades.filter((u) => si(u.esUnidadBase)).length > 1) throw new Error("Solo puede existir una unidad base.");
  if (proveedores.filter((p) => si(p.esPrincipal)).length > 1) throw new Error("Solo puede existir un proveedor principal.");
  for (const p of proveedores) if (!texto(p.proveedorId)) throw new Error("Cada proveedor del producto requiere seleccionar un proveedor.");
  for (const x of depositos) if (!texto(x.depositoId)) throw new Error("Cada configuración por depósito requiere seleccionar un depósito.");
  for (const a of alternativos) {
    if (!texto(a.productoAlternativoId)) throw new Error("Cada producto alternativo requiere seleccionar un producto.");
    if (!TIPOS_ALTERNATIVO.includes(texto(a.tipo).toUpperCase() || "SUSTITUTO")) throw new Error("Tipo de alternativo no válido.");
  }
  if (componentes.length && tipoProducto !== "KIT") throw new Error("Solo un producto de tipo KIT puede tener componentes.");
  for (const c of componentes) if (!texto(c.productoComponenteId)) throw new Error("Cada componente requiere seleccionar un producto.");

  const documentosOk = documentos.map((doc) => {
    const tipo = texto(doc.tipo).toUpperCase();
    const nombre = texto(doc.nombreArchivo, 255);
    const url = texto(doc.urlArchivo);
    if (!TIPOS_DOCUMENTO.includes(tipo)) throw new Error("Tipo de documento no válido.");
    if (!nombre || !url) throw new Error("Cada documento requiere nombre y URL.");
    const emision = fecha(doc.fechaEmision, "La fecha de emisión");
    const vencimiento = fecha(doc.fechaVencimiento, "La fecha de vencimiento");
    if (vencimiento && emision && vencimiento < emision) throw new Error("El vencimiento no puede ser anterior a la emisión.");
    return { tipo, nombre, url, emision, vencimiento, observacion: opcional(doc.observacion, 500) };
  });

  const paisOrigenCodigo = opcional(d.paisOrigenCodigo, 3)?.toUpperCase() ?? null;
  if (paisOrigenCodigo && !/^[A-Z]{3}$/.test(paisOrigenCodigo)) throw new Error("País de origen no válido.");

  return {
    codigo,
    codigoInventario: opcional(d.codigoInventario, 80),
    codigoSifen,
    codigoBarras: opcional(d.codigoBarras, 80),
    descripcion,
    descripcionFactura,
    tipoProducto,
    categoriaId: opcional(d.categoriaId),
    marcaId: opcional(d.marcaId),
    procedencia: opcional(d.procedencia, 100),
    unidadMedidaId,
    impuestoId: opcional(d.impuestoId),
    controlaStock: si(d.controlaStock),
    modoControl,
    permiteTerceros: si(d.permiteTerceros),
    requiereVencimiento: si(d.requiereVencimiento),
    stockMinimo: numero(d.stockMinimo, "Stock mínimo", 0) ?? 0,
    stockMaximo: numero(d.stockMaximo, "Stock máximo", 0),
    puntoReposicion: numero(d.puntoReposicion, "Punto de reposición", 0),
    partidaArancelaria: opcional(d.partidaArancelaria, 4),
    ncm: opcional(d.ncm, 8),
    dncpGeneral: opcional(d.dncpGeneral, 8),
    dncpEspecifico: opcional(d.dncpEspecifico, 4),
    paisOrigenCodigo,
    paisOrigenNombre: null as string | null, // se completa desde el catálogo (resolverPais)
    informacionFactura: opcional(d.informacionFactura, 500),
    relacionMercaderia: numero(d.relacionMercaderia, "Relación de mercadería", 1, 2),
    porcentajeMerma: numero(d.porcentajeMerma, "Porcentaje de merma", 0, 100),
    cantidadMerma: numero(d.cantidadMerma, "Cantidad de merma", 0),
    vendible: d.vendible !== false,
    comprable: d.comprable !== false,
    requiereInspeccionCalidad: si(d.requiereInspeccionCalidad),
    vidaUtilDias: numero(d.vidaUtilDias, "Vida útil", 0),
    pesoNetoKg: numero(d.pesoNetoKg, "Peso neto", 0),
    pesoBrutoKg: numero(d.pesoBrutoKg, "Peso bruto", 0),
    largoCm: numero(d.largoCm, "Largo", 0),
    anchoCm: numero(d.anchoCm, "Ancho", 0),
    altoCm: numero(d.altoCm, "Alto", 0),
    volumenM3: numero(d.volumenM3, "Volumen", 0),
    imagenUrl: opcional(d.imagenUrl),
    observacion: opcional(d.observacion, 1000),
    activo: d.activo !== false,
    codigos,
    unidades,
    proveedores,
    depositos,
    alternativos,
    componentes,
    documentos: documentosOk,
  };
}

/** Completa el nombre del país de origen desde el catálogo (no se confía en el cliente). */
export async function resolverPais(conexion: PoolClient, datos: DatosProducto) {
  if (!datos.paisOrigenCodigo) {
    datos.paisOrigenNombre = null;
    return;
  }
  const r = await conexion.query(
    `SELECT left(nombre, 30) AS nombre FROM referencia_geografica_paises WHERE codigo = $1 AND activo = true`,
    [datos.paisOrigenCodigo],
  );
  if (!r.rowCount) throw new Error("El país de origen seleccionado no existe o está inactivo.");
  datos.paisOrigenNombre = (r.rows[0] as { nombre: string }).nombre;
}

/** Asigna PRD-nnnnnn por empresa (serializado por advisory lock dentro de la transacción). */
export async function siguienteCodigo(conexion: PoolClient, empresaId: string) {
  await conexion.query(`SELECT pg_advisory_xact_lock(hashtextextended('productos.codigo:' || $1::text, 0))`, [empresaId]);
  const r = await conexion.query(
    `SELECT 'PRD-' || lpad((coalesce(max(substring(codigo FROM '^PRD-([0-9]+)$')::bigint), 0) + 1)::text, 6, '0') AS codigo
       FROM productos WHERE empresa_id = $1`,
    [empresaId],
  );
  return (r.rows[0] as { codigo: string }).codigo;
}

/** Columnas editables de `productos` (INSERT y UPDATE). No incluye costo_promedio: el costo lo gobierna Inventario. */
export function columnasProducto(d: DatosProducto, codigo: string): Array<[string, unknown]> {
  return [
    ["codigo", codigo],
    ["codigo_inventario", d.codigoInventario],
    ["codigo_sifen", d.codigoSifen],
    ["codigo_barras", d.codigoBarras],
    ["descripcion", d.descripcion],
    ["descripcion_factura", d.descripcionFactura],
    ["tipo_producto", d.tipoProducto],
    ["categoria_id", d.categoriaId],
    ["marca_id", d.marcaId],
    ["origen_etiqueta", d.procedencia],
    ["unidad_medida_id", d.unidadMedidaId],
    ["impuesto_id", d.impuestoId],
    ["controla_stock", d.controlaStock],
    ["modo_control_stock", d.modoControl],
    ["permite_terceros", d.permiteTerceros],
    ["requiere_vencimiento", d.requiereVencimiento],
    ["stock_minimo", d.stockMinimo],
    ["stock_maximo", d.stockMaximo],
    ["punto_reposicion", d.puntoReposicion],
    ["partida_arancelaria", d.partidaArancelaria],
    ["ncm", d.ncm],
    ["dncp_general", d.dncpGeneral],
    ["dncp_especifico", d.dncpEspecifico],
    ["pais_origen_codigo", d.paisOrigenCodigo],
    ["pais_origen_nombre", d.paisOrigenNombre],
    ["informacion_factura", d.informacionFactura],
    ["relacion_mercaderia", d.relacionMercaderia],
    ["porcentaje_merma", d.porcentajeMerma],
    ["cantidad_merma", d.cantidadMerma],
    ["vendible", d.vendible],
    ["comprable", d.comprable],
    ["requiere_inspeccion_calidad", d.requiereInspeccionCalidad],
    ["vida_util_dias", d.vidaUtilDias],
    ["peso_neto_kg", d.pesoNetoKg],
    ["peso_bruto_kg", d.pesoBrutoKg],
    ["largo_cm", d.largoCm],
    ["ancho_cm", d.anchoCm],
    ["alto_cm", d.altoCm],
    ["volumen_m3", d.volumenM3],
    ["imagen_url", d.imagenUrl],
    ["observacion", d.observacion],
    ["activo", d.activo],
  ];
}

export const TABLAS_HIJAS: Array<[string, string]> = [
  ["producto_codigos", "producto_id"],
  ["producto_unidades", "producto_id"],
  ["producto_proveedores", "producto_id"],
  ["producto_deposito_configuracion", "producto_id"],
  ["producto_alternativos", "producto_id"],
  ["producto_componentes", "producto_kit_id"],
  ["producto_documentos", "producto_id"],
];

/** empresa_id de cada hija lo hereda un trigger del producto; las FK compuestas impiden referencias de otra empresa. */
export async function insertarHijos(conexion: PoolClient, productoId: string, d: DatosProducto, usuarioId: string) {
  for (const c of d.codigos) {
    await conexion.query(
      `INSERT INTO producto_codigos(producto_id,tipo,codigo,descripcion,es_principal) VALUES($1,$2,$3,$4,$5)`,
      [productoId, texto(c.tipo).toUpperCase(), texto(c.codigo, 80), opcional(c.descripcion, 120), si(c.esPrincipal)],
    );
  }
  for (const u of d.unidades) {
    await conexion.query(
      `INSERT INTO producto_unidades(producto_id,unidad_medida_id,nombre_presentacion,factor_conversion,es_unidad_base,es_unidad_compra,es_unidad_venta,codigo_barras,peso_bruto_kg,volumen_m3) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        productoId,
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
  }
  for (const p of d.proveedores) {
    await conexion.query(
      `INSERT INTO producto_proveedores(producto_id,proveedor_id,codigo_proveedor,descripcion_proveedor,unidad_medida_id,factor_conversion,costo_referencia,moneda_codigo,cantidad_minima_compra,plazo_entrega_dias,es_principal) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        productoId,
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
  }
  for (const x of d.depositos) {
    await conexion.query(
      `INSERT INTO producto_deposito_configuracion(producto_id,deposito_id,ubicacion_preferida_id,stock_minimo,stock_maximo,punto_reposicion,cantidad_reposicion) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [
        productoId,
        texto(x.depositoId),
        opcional(x.ubicacionPreferidaId),
        numero(x.stockMinimo, "Stock mínimo", 0),
        numero(x.stockMaximo, "Stock máximo", 0),
        numero(x.puntoReposicion, "Punto", 0),
        numero(x.cantidadReposicion, "Cantidad", 0),
      ],
    );
  }
  for (const a of d.alternativos) {
    await conexion.query(
      `INSERT INTO producto_alternativos(producto_id,producto_alternativo_id,tipo,prioridad) VALUES($1,$2,$3,$4)`,
      [productoId, texto(a.productoAlternativoId), texto(a.tipo).toUpperCase() || "SUSTITUTO", numero(a.prioridad, "Prioridad", 1) ?? 1],
    );
  }
  for (const c of d.componentes) {
    await conexion.query(
      `INSERT INTO producto_componentes(producto_kit_id,producto_componente_id,cantidad,es_opcional,orden) VALUES($1,$2,$3,$4,$5)`,
      [productoId, texto(c.productoComponenteId), numero(c.cantidad, "Cantidad", 0), si(c.esOpcional), numero(c.orden, "Orden", 1) ?? 1],
    );
  }
  for (const doc of d.documentos) {
    await conexion.query(
      `INSERT INTO producto_documentos(producto_id,tipo,nombre_archivo,url_archivo,fecha_emision,fecha_vencimiento,observacion,cargado_por) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [productoId, doc.tipo, doc.nombre, doc.url, doc.emision, doc.vencimiento, doc.observacion, usuarioId],
    );
  }
}

export function respuestaError(error: unknown, accion: string) {
  console.error(`Error al ${accion} producto:`, error);
  const pg = error as { code?: string; constraint?: string; message?: string };

  if (pg.code === "23505") {
    const c = pg.constraint ?? "";
    let mensaje = "Ya existe un registro con ese valor.";
    if (c.includes("empresa_codigo")) mensaje = "Ya existe un producto con ese código.";
    else if (c.includes("producto_codigos")) mensaje = "Existe un código de producto repetido o más de un código principal.";
    else if (c.includes("uno_base")) mensaje = "Solo puede existir una unidad base.";
    else if (c.includes("producto_proveedores")) mensaje = "Solo puede existir un proveedor principal.";
    else if (c.includes("deposito")) mensaje = "El depósito está repetido en la configuración del producto.";
    return NextResponse.json({ error: mensaje }, { status: 409 });
  }
  if (pg.code === "23503") {
    return NextResponse.json({ error: "Existe una referencia (categoría, marca, proveedor, depósito o producto) que no es válida o no pertenece a su empresa." }, { status: 400 });
  }
  if (pg.code === "P0001") {
    return NextResponse.json({ error: pg.message ?? "Los datos no cumplen las reglas del producto." }, { status: 400 });
  }
  if (pg.code === "23514" || pg.code === "22P02" || pg.code === "22007" || pg.code === "22003") {
    return NextResponse.json({ error: "Los datos enviados no cumplen las reglas del producto." }, { status: 400 });
  }
  if (pg.code) {
    return NextResponse.json({ error: `No fue posible ${accion} el producto.` }, { status: 500 });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : `No fue posible ${accion} el producto.` },
    { status: 400 },
  );
}
