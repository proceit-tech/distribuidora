/**
 * Sincronización SELECTIVA de las colecciones hijas de un producto (PRD-API-01): sin DELETE-ALL + INSERT.
 *  · una fila con identificador persistido se ACTUALIZA solo si algún valor cambió (conserva id y creado_at);
 *  · una fila nueva se inserta;
 *  · únicamente se eliminan las filas que el usuario pidió eliminar explícitamente; si una fila está referenciada por otra tabla
 *    (23503) la eliminación se rechaza con un mensaje claro y NO se destruye nada;
 *  · una fila ausente del envío no se toca.
 * Todo con empresa_id y producto_id de la sesión/ruta; las FK compuestas impiden referencias de otra empresa.
 */
import type { PoolClient } from "pg";

import { ErrorValidacion } from "@/lib/productos/errores";
import type { Coleccion, DatosProducto } from "@/lib/productos/normalizar";

type Columnas = Array<[string, unknown]>;
type Fila = Record<string, unknown>;

type Definicion = {
  campo: Coleccion;
  tabla: string;
  /** Columna que apunta al producto dueño (producto_id, o producto_kit_id en los componentes). */
  fk: string;
  etiqueta: string;
  items: Array<{ id: string | null }>;
  columnas: (item: never) => Columnas;
  principal?: string;
};

export function definiciones(d: DatosProducto): Definicion[] {
  return [
    {
      campo: "codigos",
      tabla: "producto_codigos",
      fk: "producto_id",
      etiqueta: "códigos",
      items: d.codigos,
      columnas: (x: (typeof d.codigos)[number]) => [["tipo", x.tipo], ["codigo", x.codigo], ["descripcion", x.descripcion], ["es_principal", x.esPrincipal]],
      principal: "es_principal",
    },
    {
      campo: "unidades",
      tabla: "producto_unidades",
      fk: "producto_id",
      etiqueta: "presentaciones",
      items: d.unidades,
      columnas: (x: (typeof d.unidades)[number]) => [
        ["unidad_medida_id", x.unidadMedidaId],
        ["nombre_presentacion", x.nombrePresentacion],
        ["factor_conversion", x.factorConversion],
        ["es_unidad_base", x.esUnidadBase],
        ["es_unidad_compra", x.esUnidadCompra],
        ["es_unidad_venta", x.esUnidadVenta],
        ["codigo_barras", x.codigoBarras],
        ["peso_bruto_kg", x.pesoBrutoKg],
        ["volumen_m3", x.volumenM3],
      ],
      principal: "es_unidad_base",
    },
    {
      campo: "proveedores",
      tabla: "producto_proveedores",
      fk: "producto_id",
      etiqueta: "proveedores",
      items: d.proveedores,
      columnas: (x: (typeof d.proveedores)[number]) => [
        ["proveedor_id", x.proveedorId],
        ["codigo_proveedor", x.codigoProveedor],
        ["descripcion_proveedor", x.descripcionProveedor],
        ["unidad_medida_id", x.unidadMedidaId],
        ["factor_conversion", x.factorConversion],
        ["costo_referencia", x.costoReferencia],
        ["moneda_codigo", x.monedaCodigo],
        ["cantidad_minima_compra", x.cantidadMinimaCompra],
        ["plazo_entrega_dias", x.plazoEntregaDias],
        ["es_principal", x.esPrincipal],
      ],
      principal: "es_principal",
    },
    {
      campo: "depositos",
      tabla: "producto_deposito_configuracion",
      fk: "producto_id",
      etiqueta: "depósitos",
      items: d.depositos,
      columnas: (x: (typeof d.depositos)[number]) => [
        ["deposito_id", x.depositoId],
        ["ubicacion_preferida_id", x.ubicacionPreferidaId],
        ["stock_minimo", x.stockMinimo],
        ["stock_maximo", x.stockMaximo],
        ["punto_reposicion", x.puntoReposicion],
        ["cantidad_reposicion", x.cantidadReposicion],
      ],
    },
    {
      campo: "alternativos",
      tabla: "producto_alternativos",
      fk: "producto_id",
      etiqueta: "alternativos",
      items: d.alternativos,
      columnas: (x: (typeof d.alternativos)[number]) => [["producto_alternativo_id", x.productoAlternativoId], ["tipo", x.tipo], ["prioridad", x.prioridad]],
    },
    {
      campo: "componentes",
      tabla: "producto_componentes",
      fk: "producto_kit_id",
      etiqueta: "componentes",
      items: d.componentes,
      columnas: (x: (typeof d.componentes)[number]) => [["producto_componente_id", x.productoComponenteId], ["cantidad", x.cantidad], ["es_opcional", x.esOpcional], ["orden", x.orden]],
    },
    {
      campo: "documentos",
      tabla: "producto_documentos",
      fk: "producto_id",
      etiqueta: "documentos",
      items: d.documentos,
      // cargado_por solo se escribe al insertar; el documento editado conserva quién lo cargó.
      columnas: (x: (typeof d.documentos)[number]) => [["tipo", x.tipo], ["nombre_archivo", x.nombre], ["url_archivo", x.url], ["fecha_emision", x.emision], ["fecha_vencimiento", x.vencimiento], ["observacion", x.observacion]],
    },
  ];
}

async function existentes(conexion: PoolClient, empresaId: string, productoId: string, c: Definicion) {
  const r = await conexion.query(`SELECT to_jsonb(t.*) AS fila FROM ${c.tabla} t WHERE ${c.fk} = $1 AND empresa_id = $2 FOR UPDATE`, [productoId, empresaId]);

  return new Map<string, Fila>(r.rows.map((x) => [String(x.fila.id), x.fila as Fila]));
}

/** Una fila modificada debe existir y no puede figurar a la vez como eliminada. */
function verificarItems(c: Definicion, porId: Map<string, Fila>, eliminar: string[]) {
  c.items.forEach((item, i) => {
    if (item.id !== null && eliminar.includes(item.id)) throw new ErrorValidacion(`El registro ${i + 1} de ${c.etiqueta} figura a la vez como modificado y como eliminado.`, `${c.campo}.${i}`, 400);
    if (item.id !== null && !porId.has(item.id)) throw new ErrorValidacion(`El registro ${i + 1} de ${c.etiqueta} ya no existe o no pertenece a este producto; recargue la ficha.`, `${c.campo}.${i}`, 409);
  });
}

/** Fase 1 (antes del UPDATE del producto): eliminaciones explícitas. Un registro referenciado no se elimina. */
export async function eliminarHijos(conexion: PoolClient, empresaId: string, productoId: string, d: DatosProducto) {
  for (const c of definiciones(d)) {
    const eliminar = d.eliminaciones[c.campo];

    if (eliminar.length === 0) continue;

    const porId = await existentes(conexion, empresaId, productoId, c);

    verificarItems(c, porId, eliminar);
    for (const id of eliminar) {
      if (!porId.has(id)) throw new ErrorValidacion(`Un registro de ${c.etiqueta} a eliminar ya no existe; recargue la ficha.`, c.campo, 409);
    }

    for (const id of eliminar) {
      await conexion.query("SAVEPOINT baja_hija");

      try {
        await conexion.query(`DELETE FROM ${c.tabla} WHERE id = $1 AND ${c.fk} = $2 AND empresa_id = $3`, [id, productoId, empresaId]);
        await conexion.query("RELEASE SAVEPOINT baja_hija");
      } catch (e) {
        await conexion.query("ROLLBACK TO SAVEPOINT baja_hija");
        await conexion.query("RELEASE SAVEPOINT baja_hija");

        if ((e as { code?: string }).code === "23503") {
          throw new ErrorValidacion(`No se puede eliminar un registro de ${c.etiqueta}: está referenciado por otra operación.`, c.campo, 409);
        }

        throw e;
      }
    }
  }
}

/** Fase 2 (después del UPDATE del producto): actualiza por id lo que cambió e inserta lo nuevo. */
export async function guardarHijos(conexion: PoolClient, empresaId: string, productoId: string, d: DatosProducto, usuarioId: string) {
  for (const c of definiciones(d)) {
    const porId = await existentes(conexion, empresaId, productoId, c);

    // Las filas eliminadas ya no existen (la fase 1 las validó y las borró): aquí solo se exige que existan las que se modifican.
    verificarItems(c, porId, d.eliminaciones[c.campo]);

    const columnasDe = c.columnas as (item: unknown) => Columnas;
    const actualizar = c.items.filter((i) => i.id !== null);
    // Primero las filas que dejan de ser «principal», para no violar el índice de una sola principal.
    const orden = (item: { id: string | null }) => (c.principal && porId.get(item.id as string)?.[c.principal] === true && columnasDe(item).find(([k]) => k === c.principal)?.[1] === false ? 0 : 1);

    for (const item of [...actualizar].sort((a, b) => orden(a) - orden(b))) {
      const columnas = columnasDe(item);
      const sets = columnas.map(([nombre], i) => `${nombre} = $${i + 4}`).join(", ");
      const cambios = columnas.map(([nombre], i) => `${nombre} IS DISTINCT FROM $${i + 4}`).join(" OR ");

      await conexion.query(`UPDATE ${c.tabla} SET ${sets}, actualizado_at = now() WHERE id = $1 AND ${c.fk} = $2 AND empresa_id = $3 AND (${cambios})`, [item.id, productoId, empresaId, ...columnas.map(([, v]) => v)]);
    }

    for (const item of c.items.filter((i) => i.id === null)) {
      const columnas = columnasDe(item);
      const extra: Columnas = c.campo === "documentos" ? [["cargado_por", usuarioId]] : [];
      const todas = [...columnas, ...extra];

      await conexion.query(`INSERT INTO ${c.tabla} (${c.fk}, ${todas.map(([n]) => n).join(", ")}) VALUES ($1, ${todas.map((_, i) => `$${i + 2}`).join(", ")})`, [productoId, ...todas.map(([, v]) => v)]);
    }
  }
}

/** Cantidad de componentes que quedarían tras la fase 1 (para rechazar el cambio de KIT a otro tipo con componentes vivos). */
export async function componentesRestantes(conexion: PoolClient, empresaId: string, productoId: string) {
  const r = await conexion.query("SELECT count(*)::int AS n FROM producto_componentes WHERE producto_kit_id = $1 AND empresa_id = $2", [productoId, empresaId]);

  return (r.rows[0] as { n: number }).n;
}
