import type { PoolClient } from "pg";

import { ErrorValidacion } from "@/lib/proveedores/errores";
import type { DatosProveedor } from "@/lib/proveedores/normalizar";

// Auditoría y sincronización SELECTIVA de las filas relacionadas (sin Next.js: lógica testeable de forma aislada).

export type EntidadEvento = "PROVEEDOR" | "CONTACTO" | "DIRECCION" | "CUENTA" | "RETENCION" | "DOCUMENTO";

/** Auditoría append-only (proveedor_eventos, NEX-034): quién, cuándo, qué cambió (antes/después) y con qué justificación. */
export async function registrarEvento(
  conexion: PoolClient,
  e: {
    empresaId: string;
    proveedorId: string;
    entidad: EntidadEvento;
    entidadId?: string | null;
    accion: string;
    anterior?: unknown;
    nuevo?: unknown;
    justificacion?: string | null;
    usuarioId: string;
  },
) {
  await conexion.query(
    `INSERT INTO proveedor_eventos (empresa_id, proveedor_id, entidad, entidad_id, accion, anterior, nuevo, justificacion, usuario_id)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)`,
    [
      e.empresaId,
      e.proveedorId,
      e.entidad,
      e.entidadId ?? null,
      e.accion,
      e.anterior === undefined ? null : JSON.stringify(e.anterior),
      e.nuevo === undefined ? null : JSON.stringify(e.nuevo),
      e.justificacion ?? null,
      e.usuarioId,
    ],
  );
}

type Columnas = Array<[string, unknown]>;

type ColeccionSync<T extends { id: string | null }> = {
  tabla: string;
  entidad: EntidadEvento;
  campo: "contactos" | "direcciones" | "cuentasBancarias" | "retenciones";
  etiqueta: string;
  items: T[];
  eliminar: string[];
  columnas: (item: T) => Columnas;
  /** Nombre de la columna booleana «principal», si la tabla tiene una (para ordenar las actualizaciones). */
  principal?: string;
};

const IGNORADAS = new Set(["actualizado_at", "creado_at"]);

export function diferenciasFila(anterior: Record<string, unknown>, nuevo: Record<string, unknown>) {
  const antes: Record<string, unknown> = {};
  const despues: Record<string, unknown> = {};

  for (const clave of Object.keys(nuevo)) {
    if (IGNORADAS.has(clave)) continue;
    if (JSON.stringify(anterior[clave]) !== JSON.stringify(nuevo[clave])) {
      antes[clave] = anterior[clave];
      despues[clave] = nuevo[clave];
    }
  }

  return { antes, despues };
}

/**
 * Sincroniza una colección con la base SIN borrar y recrear: las filas con identificador persistido se ACTUALIZAN (solo si algún
 * valor cambió), las nuevas se insertan, y únicamente se eliminan las que el usuario pidió explícitamente (con la fila completa
 * guardada en la auditoría). Una fila ausente del envío no se toca. Todo con empresa_id y proveedor_id de la sesión.
 */
async function sincronizarColeccion<T extends { id: string | null }>(conexion: PoolClient, empresaId: string, proveedorId: string, usuarioId: string, c: ColeccionSync<T>) {
  const existentes = await conexion.query(`SELECT to_jsonb(t.*) AS fila FROM ${c.tabla} t WHERE proveedor_id = $1 AND empresa_id = $2 FOR UPDATE`, [proveedorId, empresaId]);
  const porId = new Map<string, Record<string, unknown>>(existentes.rows.map((r) => [String(r.fila.id), r.fila as Record<string, unknown>]));

  for (const [indice, item] of c.items.entries()) {
    if (item.id !== null && !porId.has(item.id)) {
      throw new ErrorValidacion(`El registro ${indice + 1} de ${c.etiqueta} ya no existe o no pertenece a este proveedor; recargue la ficha.`, `${c.campo}.${indice}`, 409);
    }
    if (item.id !== null && c.eliminar.includes(item.id)) {
      throw new ErrorValidacion(`El registro ${indice + 1} de ${c.etiqueta} figura a la vez como modificado y como eliminado.`, `${c.campo}.${indice}`, 400);
    }
  }
  for (const id of c.eliminar) {
    if (!porId.has(id)) throw new ErrorValidacion(`Un registro de ${c.etiqueta} a eliminar ya no existe; recargue la ficha.`, c.campo, 409);
  }

  // 1) Eliminaciones explícitas (la fila completa queda en la auditoría)
  for (const id of c.eliminar) {
    await conexion.query(`DELETE FROM ${c.tabla} WHERE id = $1 AND proveedor_id = $2 AND empresa_id = $3`, [id, proveedorId, empresaId]);
    await registrarEvento(conexion, { empresaId, proveedorId, entidad: c.entidad, entidadId: id, accion: "BAJA", anterior: porId.get(id), usuarioId });
  }

  // 2) Actualizaciones: primero las que dejan de ser «principal», para no violar el índice de una sola principal
  const actualizar = c.items.filter((i) => i.id !== null);
  const orden = (item: T) => (c.principal && porId.get(item.id as string)?.[c.principal] === true && c.columnas(item).find(([k]) => k === c.principal)?.[1] === false ? 0 : 1);

  for (const item of [...actualizar].sort((a, b) => orden(a) - orden(b))) {
    const columnas = c.columnas(item);
    const sets = columnas.map(([nombre], i) => `${nombre} = $${i + 4}`).join(", ");
    const cambios = columnas.map(([nombre], i) => `x.${nombre} IS DISTINCT FROM $${i + 4}`).join(" OR ");
    const r = await conexion.query(
      `UPDATE ${c.tabla} x SET ${sets} FROM ${c.tabla} old
        WHERE x.id = $1 AND x.proveedor_id = $2 AND x.empresa_id = $3 AND old.id = x.id AND (${cambios})
        RETURNING to_jsonb(old.*) AS anterior, to_jsonb(x.*) AS nuevo`,
      [item.id, proveedorId, empresaId, ...columnas.map(([, valor]) => valor)],
    );

    if (r.rowCount) {
      const { antes, despues } = diferenciasFila(r.rows[0].anterior, r.rows[0].nuevo);

      await registrarEvento(conexion, { empresaId, proveedorId, entidad: c.entidad, entidadId: item.id, accion: "MODIFICACION", anterior: antes, nuevo: despues, usuarioId });
    }
  }

  // 3) Altas
  for (const item of c.items.filter((i) => i.id === null)) {
    const columnas = c.columnas(item);
    const r = await conexion.query(
      `INSERT INTO ${c.tabla} (proveedor_id, ${columnas.map(([n]) => n).join(", ")})
       VALUES ($1, ${columnas.map((_, i) => `$${i + 2}`).join(", ")}) RETURNING id, to_jsonb(${c.tabla}.*) AS fila`,
      [proveedorId, ...columnas.map(([, valor]) => valor)],
    );

    await registrarEvento(conexion, { empresaId, proveedorId, entidad: c.entidad, entidadId: r.rows[0].id, accion: "ALTA", nuevo: r.rows[0].fila, usuarioId });
  }
}

/** Sincroniza las cuatro colecciones relacionadas editables (los documentos tienen su propio flujo de archivos). */
export async function sincronizarHijos(conexion: PoolClient, empresaId: string, proveedorId: string, d: DatosProveedor, usuarioId: string) {
  await sincronizarColeccion(conexion, empresaId, proveedorId, usuarioId, {
    tabla: "proveedor_contactos",
    entidad: "CONTACTO",
    campo: "contactos",
    etiqueta: "contactos",
    items: d.contactos,
    eliminar: d.eliminaciones.contactos,
    principal: "es_principal",
    columnas: (c) => [
      ["nombre", c.nombre],
      ["apellido", c.apellido],
      ["cargo", c.cargo],
      ["departamento", c.departamento],
      ["telefono", c.telefono],
      ["celular", c.celular],
      ["email", c.email],
      ["es_principal", c.esPrincipal],
      ["recibe_cotizaciones", c.recibeCotizaciones],
      ["recibe_ordenes_compra", c.recibeOrdenesCompra],
      ["recibe_logistica", c.recibeLogistica],
      ["recibe_devoluciones", c.recibeDevoluciones],
      ["recibe_pagos", c.recibePagos],
      ["recibe_calidad", c.recibeCalidad],
      ["recibe_notificaciones", c.recibeNotificaciones],
    ],
  });

  await sincronizarColeccion(conexion, empresaId, proveedorId, usuarioId, {
    tabla: "proveedor_direcciones",
    entidad: "DIRECCION",
    campo: "direcciones",
    etiqueta: "direcciones",
    items: d.direcciones,
    eliminar: d.eliminaciones.direcciones,
    principal: "es_principal",
    columnas: (x) => [
      ["tipo", x.tipo],
      ["descripcion", x.descripcion],
      ["direccion", x.direccion],
      ["numero_casa", x.numeroCasa],
      ["pais_codigo", x.paisCodigo],
      ["departamento_codigo", x.departamentoCodigo],
      ["distrito_codigo", x.distritoCodigo],
      ["ciudad_codigo", x.ciudadCodigo],
      ["departamento", x.departamento],
      ["distrito", x.distrito],
      ["ciudad", x.ciudad],
      ["codigo_postal", x.codigoPostal],
      ["es_principal", x.esPrincipal],
    ],
  });

  await sincronizarColeccion(conexion, empresaId, proveedorId, usuarioId, {
    tabla: "proveedor_cuentas_bancarias",
    entidad: "CUENTA",
    campo: "cuentasBancarias",
    etiqueta: "cuentas bancarias",
    items: d.cuentasBancarias,
    eliminar: d.eliminaciones.cuentasBancarias,
    principal: "es_principal",
    columnas: (x) => [
      ["banco", x.banco],
      ["sucursal_banco", x.sucursalBanco],
      ["titular", x.titular],
      ["documento_titular", x.documentoTitular],
      ["tipo_cuenta", x.tipoCuenta],
      ["numero_cuenta", x.numeroCuenta],
      ["moneda_codigo", x.monedaCodigo],
      ["alias_cuenta", x.aliasCuenta],
      ["codigo_swift", x.codigoSwift],
      ["iban", x.iban],
      ["es_principal", x.esPrincipal],
    ],
  });

  await sincronizarColeccion(conexion, empresaId, proveedorId, usuarioId, {
    tabla: "proveedor_retenciones",
    entidad: "RETENCION",
    campo: "retenciones",
    etiqueta: "retenciones",
    items: d.retenciones,
    eliminar: d.eliminaciones.retenciones,
    columnas: (x) => [
      ["tipo", x.tipo],
      ["impuesto_id", x.impuestoId],
      ["porcentaje", x.porcentaje],
      ["certificado_obligatorio", x.certificadoObligatorio],
      ["fecha_vigencia_desde", x.fechaVigenciaDesde],
      ["fecha_vigencia_hasta", x.fechaVigenciaHasta],
      ["observacion", x.observacion],
    ],
  });
}

