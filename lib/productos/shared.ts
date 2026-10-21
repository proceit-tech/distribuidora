import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { ErrorValidacion } from "@/lib/productos/errores";
import { coherenciaIva } from "@/lib/productos/fiscal";
import type { DatosProducto } from "@/lib/productos/normalizar";

// Persistencia compartida de productos (POST y PUT). Consultas parametrizadas; empresa_id siempre llega de la sesión autenticada.
// La validación vive en lib/productos/normalizar.ts (misma función en el formulario y en la API).

/** Texto recortado; si supera el máximo se RECHAZA (nunca se trunca en silencio). Lo usa la administración de catálogos. */
export const texto = (valor: unknown, maximo?: number) => {
  const resultado = typeof valor === "string" ? valor.trim() : "";

  if (maximo && resultado.length > maximo) throw new Error(`El texto admite hasta ${maximo} caracteres (ingresó ${resultado.length}).`);

  return resultado;
};
export const opcional = (valor: unknown, maximo?: number) => texto(valor, maximo) || null;

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
    ["familia_id", d.familiaId],
    ["linea_id", d.lineaId],
    ["origen_etiqueta", d.procedencia],
    ["unidad_medida_id", d.unidadMedidaId],
    ["impuesto_id", d.impuestoId],
    ["afectacion_iva", d.afectacionIva],
    ["proporcion_gravada_iva", d.proporcionGravadaIva],
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

/** Precio de venta de referencia en la lista de referencia (NEX-017). null => quita el precio. */
export async function fijarPrecioReferencia(conexion: PoolClient, empresaId: string, productoId: string, precio: string | null) {
  await conexion.query(`SELECT producto_fijar_precio_referencia($1, $2, $3)`, [empresaId, productoId, precio]);
}

/**
 * Inventario inicial = movimiento REAL (ENTRADA / origen ABERTURA) en el depósito indicado, en la MISMA transacción del alta.
 * Lo valida y registra inventario_registrar_movimiento (permiso MOVIMIENTOS.CREAR, alcance de depósito, costo, idempotencia).
 * Devuelve el número del movimiento, o null si no hay cantidad.
 */
export async function registrarInventarioInicial(
  conexion: PoolClient,
  empresaId: string,
  usuarioId: string,
  productoId: string,
  d: DatosProducto,
) {
  const a = d.inventarioInicial;
  if (a.cantidad === null || !a.depositoId) return null; // la cantidad ya viene validada como mayor que cero
  const r = await conexion.query(
    `SELECT o_numero FROM inventario_registrar_movimiento($1, $2, 'ENTRADA', 'ABERTURA', NULL, NULL, $3, $4::jsonb, $5, NULL, 'Inventario inicial', NULL, NULL)`,
    [
      empresaId,
      usuarioId,
      a.depositoId,
      JSON.stringify([{ producto_id: productoId, cantidad: a.cantidad, costo_unitario: a.costoUnitario }]),
      `apertura:${productoId}`,
    ],
  );
  return (r.rows[0] as { o_numero: string }).o_numero;
}

export function respuestaError(error: unknown, accion: string) {
  console.error(`Error al ${accion} producto:`, error);
  const pg = error as { code?: string; constraint?: string; message?: string };

  // PRD-D03: un error de validación conserva su estado HTTP (409 por versión obsoleta) y el campo afectado; antes siempre salía 400.
  if (error instanceof ErrorValidacion) return NextResponse.json({ error: error.message, campo: error.campo }, { status: error.estado });

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
    const c = pg.constraint ?? "";
    const mensaje = c.includes("linea")
      ? "La línea seleccionada no pertenece a la familia elegida."
      : "Existe una referencia (categoría, marca, familia, línea, proveedor, depósito o producto) que no es válida o no pertenece a su empresa.";
    return NextResponse.json({ error: mensaje }, { status: 400 });
  }
  if (pg.code === "42501") {
    return NextResponse.json({ error: pg.message ?? "No tiene permiso para esta operación." }, { status: 403 });
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

const MENSAJES_CAMBIO_UNIDAD: Record<string, string> = {
  "NEX:STOCK_NO_CERO": "La unidad base no puede cambiarse mientras el producto tenga stock en algún depósito, estado, propiedad o lote. Deje todos los saldos en cero con Movimientos y vuelva a intentarlo.",
  "NEX:COSTO_VALORIZADO": "El producto tiene cantidad valorizada en el inventario: la unidad base no puede cambiarse hasta resolver esa inconsistencia.",
  "NEX:UNIDAD_CAMBIO_CONCURRENTE": "La unidad base del producto cambió mientras se editaba. Recargue la ficha antes de guardar.",
  "NEX:UNIDAD_INVALIDA": "La unidad base elegida no existe o está inactiva.",
  "NEX:UNIDAD_SIN_CAMBIO": "La unidad base nueva debe ser distinta de la actual.",
};

/**
 * PRD-A21 / DEC-PRD-U07: la unidad base de un producto EXISTENTE solo puede cambiar con TODOS los saldos en cero. La verificación vive en la base
 * (producto_cambiar_unidad_base_validar, NEX-052): bloquea el producto y serializa con los escritores de stock, de modo que un movimiento concurrente
 * no puede colarse entre la comprobación y el UPDATE. Sin esa función (migración no aplicada) el cambio se RECHAZA: nunca se edita la unidad sin protección.
 * Debe llamarse dentro de la transacción de la edición y ANTES del UPDATE del producto.
 */
export async function validarCambioUnidadBase(conexion: PoolClient, empresaId: string, usuarioId: string, productoId: string, anterior: string, nueva: string) {
  const marca = await conexion.query("SELECT to_regprocedure('public.producto_cambiar_unidad_base_validar(uuid,uuid,uuid,uuid,uuid)') IS NOT NULL AS ok");

  if ((marca.rows[0] as { ok?: boolean } | undefined)?.ok !== true) {
    throw new ErrorValidacion("El cambio de unidad base está bloqueado hasta aplicar la migración NEX-052 (protección contra movimientos de stock simultáneos). Los demás datos del producto sí pueden editarse.", "unidadMedidaId", 409);
  }

  try {
    await conexion.query("SELECT public.producto_cambiar_unidad_base_validar($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)", [empresaId, usuarioId, productoId, anterior, nueva]);
  } catch (error) {
    const detalle = (error as { detail?: string }).detail ?? "";

    if (MENSAJES_CAMBIO_UNIDAD[detalle]) throw new ErrorValidacion(MENSAJES_CAMBIO_UNIDAD[detalle], "unidadMedidaId", 409);

    throw error;
  }
}

type Previo = Partial<Record<"categoria_id" | "marca_id" | "familia_id" | "linea_id" | "unidad_medida_id" | "impuesto_id", string | null>>;

/**
 * Valida con mensaje por campo las referencias del producto: existen, son de la empresa (catálogos propios) y están activas.
 * Un valor que el producto ya tenía (edición) se admite aunque el catálogo se haya desactivado después. La línea debe pertenecer
 * a la familia (NEX-017). Las FK compuestas de la base siguen siendo la defensa final.
 */
export async function validarReferencias(conexion: PoolClient, empresaId: string, d: DatosProducto, previo: Previo = {}, opciones: { exigirUnidadSifen?: boolean } = {}) {
  async function verificar(tabla: string, ids: string[], porEmpresa: boolean, campo: (i: number) => string, mensaje: string, conservados: Array<string | null | undefined> = [], clave = "id", nuevos?: boolean[]) {
    for (const [i, id] of ids.entries()) {
      if (!id) continue;

      const r = await conexion.query(
        `SELECT ${tabla === "monedas" || tabla === "productos" ? "true" : "activo"} AS activo FROM ${tabla} WHERE ${clave} = $1${porEmpresa ? " AND empresa_id = $2" : ""}`,
        porEmpresa ? [id, empresaId] : [id],
      );

      if (!r.rowCount) throw new ErrorValidacion(`${mensaje} no existe o no pertenece a su empresa.`, campo(i));
      if (!(r.rows[0] as { activo: boolean }).activo && !conservados.includes(id) && (nuevos ? nuevos[i] : true)) throw new ErrorValidacion(`${mensaje} está inactivo.`, campo(i));
    }
  }
  const unico = (id: string | null, campo: string, tabla: string, porEmpresa: boolean, mensaje: string, anterior?: string | null) =>
    verificar(tabla, id ? [id] : [], porEmpresa, () => campo, mensaje, [anterior]);

  await unico(d.categoriaId, "categoriaId", "categorias_producto", true, "La categoría", previo.categoria_id);
  await unico(d.marcaId, "marcaId", "marcas_producto", true, "La marca", previo.marca_id);
  await unico(d.familiaId, "familiaId", "familias_producto", true, "La familia", previo.familia_id);
  // Jerarquía Categoría → Familia → Línea (NEX-044). Solo se exige cuando la familia YA tiene categoría asignada (las familias históricas sin
  // clasificar no bloquean) y cuando el par categoría/familia cambia: un producto histórico incoherente no se bloquea por editar otros datos.
  if (d.familiaId && d.categoriaId && !(previo.categoria_id === d.categoriaId && previo.familia_id === d.familiaId)) {
    const f = await conexion.query("SELECT categoria_id FROM familias_producto WHERE id = $1 AND empresa_id = $2", [d.familiaId, empresaId]);
    const categoriaFamilia = (f.rows[0] as { categoria_id?: string | null } | undefined)?.categoria_id ?? null;

    if (categoriaFamilia !== null && categoriaFamilia !== d.categoriaId) {
      throw new ErrorValidacion("La familia seleccionada no pertenece a la categoría elegida.", "familiaId");
    }
  }
  await unico(d.unidadMedidaId, "unidadMedidaId", "unidades_medida", false, "La unidad base", previo.unidad_medida_id);
  await unico(d.impuestoId, "impuestoId", "impuestos", false, "El impuesto", previo.impuesto_id);

  // DEC-PRD-U02 (solo producto NUEVO vendible): la unidad base debe estar ligada a un código SIFEN existente y vigente (E709). No se infiere ningún vínculo.
  if (opciones.exigirUnidadSifen) {
    const u = await conexion.query(
      `SELECT x.codigo, x.nombre, x.unidad_sifen_codigo AS "sifenCodigo", s.vigente AS "sifenVigente"
         FROM unidades_medida x LEFT JOIN unidades_medida_sifen s ON s.codigo = x.unidad_sifen_codigo WHERE x.id = $1`,
      [d.unidadMedidaId],
    );
    const fila = u.rows[0] as { codigo: string; nombre: string; sifenCodigo: number | null; sifenVigente: boolean | null } | undefined;

    if (!fila || fila.sifenCodigo === null) {
      throw new ErrorValidacion(`La unidad base ${fila ? `«${fila.codigo} · ${fila.nombre}» ` : ""}no tiene equivalencia SIFEN (E709): no se puede crear un producto vendible con ella. Elija una unidad con código SIFEN o solicite al administrador vincularla.`, "unidadMedidaId");
    }
    if (fila.sifenVigente === null) throw new ErrorValidacion(`El código SIFEN ${fila.sifenCodigo} de la unidad base no existe en el catálogo oficial.`, "unidadMedidaId");
    if (fila.sifenVigente === false) throw new ErrorValidacion(`El código SIFEN ${fila.sifenCodigo} de la unidad base no está vigente en el catálogo oficial: elija otra unidad.`, "unidadMedidaId");
  }

  // Coherencia de la clasificación IVA (E731 × E734 × E733) contra la tasa REAL del impuesto elegido (global, sin empresa_id).
  const tasa = d.impuestoId ? await conexion.query("SELECT porcentaje::text AS porcentaje FROM impuestos WHERE id = $1", [d.impuestoId]) : null;
  const incoherencia = coherenciaIva(d.afectacionIva, tasa && tasa.rowCount ? (tasa.rows[0] as { porcentaje: string }).porcentaje : null, d.proporcionGravadaIva);

  if (incoherencia) throw new ErrorValidacion(incoherencia.mensaje, incoherencia.campo);

  if (d.lineaId) {
    const r = await conexion.query("SELECT familia_id, activo FROM lineas_producto WHERE empresa_id = $1 AND id = $2", [empresaId, d.lineaId]);

    if (!r.rowCount) throw new ErrorValidacion("La línea no existe o no pertenece a su empresa.", "lineaId");
    if ((r.rows[0] as { familia_id: string }).familia_id !== d.familiaId) throw new ErrorValidacion("La línea seleccionada no pertenece a la familia elegida.", "lineaId");
    if (!(r.rows[0] as { activo: boolean }).activo && previo.linea_id !== d.lineaId) throw new ErrorValidacion("La línea está inactiva.", "lineaId");
  }

  await verificar("unidades_medida", d.unidades.map((x) => x.unidadMedidaId), false, (i) => `unidades.${i}.unidadMedidaId`, "La unidad de la presentación", [], "id", d.unidades.map((x) => x.id === null));
  await verificar("proveedores", d.proveedores.map((x) => x.proveedorId), true, (i) => `proveedores.${i}.proveedorId`, "El proveedor", [], "id", d.proveedores.map((x) => x.id === null));
  await verificar("unidades_medida", d.proveedores.map((x) => x.unidadMedidaId ?? ""), false, (i) => `proveedores.${i}.unidadMedidaId`, "La unidad del proveedor");
  await verificar("monedas", d.proveedores.map((x) => x.monedaCodigo ?? ""), false, (i) => `proveedores.${i}.monedaCodigo`, "La moneda", [], "codigo");
  await verificar("depositos", d.depositos.map((x) => x.depositoId), true, (i) => `depositos.${i}.depositoId`, "El depósito", [], "id", d.depositos.map((x) => x.id === null));
  await verificar("productos", d.alternativos.map((x) => x.productoAlternativoId), true, (i) => `alternativos.${i}.productoAlternativoId`, "El producto alternativo");
  await verificar("productos", d.componentes.map((x) => x.productoComponenteId), true, (i) => `componentes.${i}.productoComponenteId`, "El componente");
  await verificar("depositos", d.inventarioInicial.depositoId ? [d.inventarioInicial.depositoId] : [], true, () => "inventarioInicial.depositoId", "El depósito de apertura");
}
