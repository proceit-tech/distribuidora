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
  /**
   * Gancho previo a actualizar una fila existente: devuelve las columnas a escribir (puede añadir otras), o null si ya se
   * encargó de la fila (por ejemplo, creando una revisión pendiente en lugar de sobrescribir una cuenta aprobada).
   */
  antesDeActualizar?: (conexion: PoolClient, item: T, fila: Record<string, unknown>, columnas: Columnas) => Promise<Columnas | null>;
  /** Sustituye la baja física por defecto (por ejemplo, desactivación lógica de una cuenta aprobada). */
  darDeBaja?: (conexion: PoolClient, id: string, fila: Record<string, unknown>) => Promise<void>;
};

const IGNORADAS = new Set(["actualizado_at", "creado_at", "carga_documentos_inicial_abierta"]);

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
    if (c.darDeBaja) {
      await c.darDeBaja(conexion, id, porId.get(id) as Record<string, unknown>);
      continue;
    }

    await conexion.query(`DELETE FROM ${c.tabla} WHERE id = $1 AND proveedor_id = $2 AND empresa_id = $3`, [id, proveedorId, empresaId]);
    await registrarEvento(conexion, { empresaId, proveedorId, entidad: c.entidad, entidadId: id, accion: "BAJA", anterior: porId.get(id), usuarioId });
  }

  // 2) Actualizaciones: primero las que dejan de ser «principal», para no violar el índice de una sola principal
  const actualizar = c.items.filter((i) => i.id !== null);
  const orden = (item: T) => (c.principal && porId.get(item.id as string)?.[c.principal] === true && c.columnas(item).find(([k]) => k === c.principal)?.[1] === false ? 0 : 1);

  for (const item of [...actualizar].sort((a, b) => orden(a) - orden(b))) {
    const fila = porId.get(item.id as string) as Record<string, unknown>;
    const base = c.columnas(item);
    const columnas = c.antesDeActualizar ? await c.antesDeActualizar(conexion, item, fila, base) : base;

    if (columnas === null) continue;

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

      if (c.entidad === "RETENCION" && "activa" in despues) {
        await registrarEvento(conexion, { empresaId, proveedorId, entidad: c.entidad, entidadId: item.id, accion: despues.activa ? "RETENCION_ACTIVADA" : "RETENCION_DESACTIVADA", anterior: { activa: antes.activa }, nuevo: { activa: despues.activa, documentoCertificadoId: r.rows[0].nuevo.documento_certificado_id ?? null }, usuarioId });
      }
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

const igualValor = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);

/**
 * Control de aprobación bancaria (DEC-PRV-04/07): una cuenta APROBADA nunca se sobrescribe por la edición común; el cambio queda como
 * revisión pendiente (una sola por cuenta; una nueva solicitud reemplaza a la anterior) hasta que alguien con PROVEEDORES.APROBAR_BANCO
 * la apruebe. Una cuenta pendiente o rechazada se corrige en el lugar; si estaba rechazada y cambia, vuelve a PENDIENTE.
 */
/**
 * Baja de una cuenta bancaria (PRV-AUD-01). Una cuenta que alguna vez fue APROBADA, o que está referenciada por otra tabla, NO se
 * elimina: se DESACTIVA (activa = false, autor, fecha y motivo), conservando identificador, datos, historial y auditoría; su revisión
 * pendiente se cancela y deja de ser pagable y de ocupar la «principal de la moneda». Solo una cuenta nunca aprobada (pendiente o
 * rechazada) y sin referencias se elimina físicamente, con la fila completa en la auditoría.
 */
async function darDeBajaCuenta(conexion: PoolClient, empresaId: string, proveedorId: string, usuarioId: string, id: string, fila: Record<string, unknown>) {
  if (fila.activa === false) return; // ya desactivada: la baja es idempotente

  const alguna_vez_aprobada = fila.estado_aprobacion === "APROBADA" || (fila.aprobado_por ?? null) !== null;

  if (!alguna_vez_aprobada) {
    await conexion.query("SAVEPOINT baja_cuenta");

    try {
      await conexion.query("DELETE FROM proveedor_cuentas_bancarias WHERE id = $1 AND proveedor_id = $2 AND empresa_id = $3", [id, proveedorId, empresaId]);
      await conexion.query("RELEASE SAVEPOINT baja_cuenta");
      await registrarEvento(conexion, { empresaId, proveedorId, entidad: "CUENTA", entidadId: id, accion: "BAJA", anterior: fila, usuarioId });

      return;
    } catch (e) {
      const codigo = (e as { code?: string }).code;

      await conexion.query("ROLLBACK TO SAVEPOINT baja_cuenta");
      await conexion.query("RELEASE SAVEPOINT baja_cuenta");

      // Referenciada por otra tabla (23503) o protegida por el trigger (P0001): se desactiva en lugar de eliminarse.
      if (codigo !== "23503" && codigo !== "P0001") throw e;
    }
  }

  await conexion.query(
    `UPDATE proveedor_cuentas_bancarias
        SET activa = false, es_principal = false, desactivada_at = now(), desactivada_por = $4, motivo_desactivacion = $5
      WHERE id = $1 AND proveedor_id = $2 AND empresa_id = $3`,
    [id, proveedorId, empresaId, usuarioId, "Desactivada desde la edición del proveedor"],
  );
  await conexion.query(
    `UPDATE proveedor_cuenta_revisiones SET estado = 'RECHAZADA', resuelto_por = $4, resuelto_at = now(), motivo = 'Cuenta desactivada'
      WHERE cuenta_id = $1 AND proveedor_id = $2 AND empresa_id = $3 AND estado = 'PENDIENTE'`,
    [id, proveedorId, empresaId, usuarioId],
  );
  await registrarEvento(conexion, {
    empresaId,
    proveedorId,
    entidad: "CUENTA",
    entidadId: id,
    accion: "CUENTA_DESACTIVADA",
    anterior: { activa: true, estado: fila.estado_aprobacion, principal: fila.es_principal },
    nuevo: { activa: false },
    usuarioId,
  });
}

async function controlarCuenta(
  conexion: PoolClient,
  empresaId: string,
  proveedorId: string,
  usuarioId: string,
  cuentaId: string,
  fila: Record<string, unknown>,
  columnas: Columnas,
): Promise<Columnas | null> {
  const cambiada = columnas.some(([nombre, valor]) => !igualValor(fila[nombre], valor));

  // Una cuenta desactivada no se modifica (ni se reactiva) desde la edición común.
  if (fila.activa === false) {
    if (cambiada) throw new ErrorValidacion("Una cuenta desactivada no se puede modificar.", null, 409);

    return null;
  }

  if (!cambiada) return fila.estado_aprobacion === "APROBADA" ? null : columnas;

  if (fila.estado_aprobacion === "APROBADA") {
    const propuesta = Object.fromEntries(columnas);
    const anterior = Object.fromEntries(columnas.map(([nombre]) => [nombre, fila[nombre] ?? null]));
    const actualizada = await conexion.query(
      `UPDATE proveedor_cuenta_revisiones SET datos = $4::jsonb, solicitado_por = $5, solicitado_at = now()
        WHERE cuenta_id = $1 AND proveedor_id = $2 AND empresa_id = $3 AND estado = 'PENDIENTE' RETURNING id`,
      [cuentaId, proveedorId, empresaId, JSON.stringify(propuesta), usuarioId],
    );

    if (!actualizada.rowCount) {
      await conexion.query(
        `INSERT INTO proveedor_cuenta_revisiones (empresa_id, proveedor_id, cuenta_id, datos, solicitado_por) VALUES ($1,$2,$3,$4::jsonb,$5)`,
        [empresaId, proveedorId, cuentaId, JSON.stringify(propuesta), usuarioId],
      );
    }

    await registrarEvento(conexion, { empresaId, proveedorId, entidad: "CUENTA", entidadId: cuentaId, accion: "CUENTA_REVISION_SOLICITADA", anterior, nuevo: propuesta, usuarioId });

    return null;
  }

  if (fila.estado_aprobacion === "RECHAZADA") return [...columnas, ["estado_aprobacion", "PENDIENTE"], ["motivo_resolucion", null]];

  return columnas;
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
    antesDeActualizar: (cx, item, fila, columnas) => controlarCuenta(cx, empresaId, proveedorId, usuarioId, item.id as string, fila, columnas),
    darDeBaja: (cx, id, fila) => darDeBajaCuenta(cx, empresaId, proveedorId, usuarioId, id, fila),
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
      ["activa", x.activa],
      ["documento_certificado_id", x.documentoCertificadoId],
      ["fecha_vigencia_desde", x.fechaVigenciaDesde],
      ["fecha_vigencia_hasta", x.fechaVigenciaHasta],
      ["observacion", x.observacion],
    ],
  });
}

