import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { denyIfNoPermission } from "@/lib/auth/permissions";
import { ErrorValidacion } from "@/lib/proveedores/errores";
import { normalizarProveedor } from "@/lib/proveedores/normalizar";
import {
  columnasProveedor,
  diferenciasFila,
  registrarEvento,
  respuestaError,
  sincronizarHijos,
  validarReferencias,
  verificarDocumentoUnico,
  type ProveedorBody,
} from "@/lib/proveedores/shared";

type Contexto = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Solo DEMO explícito usa respuestas simuladas; sin DATABASE_URL se responde 503.
const DEMO_MODE = process.env.DEMO_MODE === "true";

function sinBase() {
  return NextResponse.json(
    { error: "Servicio no disponible: base de datos no configurada." },
    { status: 503 },
  );
}

async function sesionActual() {
  const { getCurrentSession } = await import("@/lib/auth/session");
  return getCurrentSession();
}

async function obtenerDb() {
  const { db } = await import("@/lib/db");
  return db;
}


export async function GET(_request: Request, contexto: Contexto) {
  if (!DEMO_MODE && !process.env.DATABASE_URL) return sinBase();
  if (DEMO_MODE) return NextResponse.json({ error: "Proveedor no encontrado." }, { status: 404 });

  const session = await sesionActual();
  if (!session) return NextResponse.json({ error: "Su sesión ha finalizado." }, { status: 401 });

  const denegado = await denyIfNoPermission(session, "PROVEEDORES", "VER");
  if (denegado) return denegado;

  const { id } = await contexto.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Proveedor no encontrado." }, { status: 404 });

  const empresaId = session.user.empresaId;
  const db = await obtenerDb();

  try {
    const principal = await db.query(
      `SELECT
         p.id, p.codigo, p.tipo_persona AS "tipoPersona",
         p.grupo_proveedor_id AS "grupoProveedorId",
         p.tipo_documento AS "tipoDocumento", p.numero_documento AS "numeroDocumento",
         coalesce(p.dv, '') AS dv, p.razon_social AS "razonSocial",
         coalesce(p.nombre_fantasia, '') AS "nombreFantasia",
         p.pais_codigo AS "paisCodigo", coalesce(p.pais_nombre, '') AS "paisNombre",
         coalesce(p.email, '') AS email, coalesce(p.telefono, '') AS telefono,
         coalesce(p.sitio_web, '') AS "sitioWeb",
         p.condicion_pago_id AS "condicionPagoId",
         coalesce(p.moneda_codigo_predeterminada, '') AS "monedaCodigoPredeterminada",
         p.medio_pago_preferido_id AS "medioPagoPreferidoId",
         p.dia_pago_preferido AS "diaPagoPreferido",
         p.plazo_entrega_dias AS "plazoEntregaDias",
         p.descuento_comercial_pct::text AS "descuentoComercialPct",
         p.monto_minimo_compra::text AS "montoMinimoCompra",
         p.permite_anticipos AS "permiteAnticipos",
         p.requiere_orden_compra AS "requiereOrdenCompra",
         coalesce(p.email_pagos, '') AS "emailPagos",
         coalesce(to_char(p.fecha_inicio_relacion, 'YYYY-MM-DD'), '') AS "fechaInicioRelacion",
         coalesce(to_char(p.fecha_fin_relacion, 'YYYY-MM-DD'), '') AS "fechaFinRelacion",
         p.estado_homologacion AS "estadoHomologacion",
         coalesce(to_char(p.fecha_homologacion, 'YYYY-MM-DD'), '') AS "fechaHomologacion",
         coalesce(to_char(p.fecha_vencimiento_homologacion, 'YYYY-MM-DD'), '') AS "fechaVencimientoHomologacion",
         p.nivel_riesgo AS "nivelRiesgo",
         p.calificacion_actual::text AS "calificacionActual",
         coalesce(p.incoterm_codigo, '') AS "incotermCodigo",
         coalesce(p.condicion_entrega, '') AS "condicionEntrega",
         coalesce(p.metodo_transporte_preferido, '') AS "metodoTransportePreferido",
         p.dias_confirmacion_pedido AS "diasConfirmacionPedido",
         p.permite_entrega_parcial AS "permiteEntregaParcial",
         coalesce(p.observacion, '') AS observacion,
         p.activo, p.creado_at AS "creadoEn", p.actualizado_at AS "actualizadoEn",
         to_char(p.actualizado_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS version
       FROM proveedores p
       WHERE p.id = $1 AND p.empresa_id = $2`,
      [id, empresaId],
    );

    if (!principal.rowCount) {
      return NextResponse.json({ error: "Proveedor no encontrado." }, { status: 404 });
    }

    const [contactos, direcciones, cuentas, retenciones, documentos] = await Promise.all([
      db.query(
        `SELECT id, nombre, coalesce(apellido,'') AS apellido, coalesce(cargo,'') AS cargo,
                coalesce(departamento,'') AS departamento, coalesce(telefono,'') AS telefono,
                coalesce(celular,'') AS celular, coalesce(email,'') AS email,
                es_principal AS "esPrincipal", recibe_cotizaciones AS "recibeCotizaciones",
                recibe_ordenes_compra AS "recibeOrdenesCompra", recibe_logistica AS "recibeLogistica",
                recibe_devoluciones AS "recibeDevoluciones", recibe_pagos AS "recibePagos",
                recibe_calidad AS "recibeCalidad", recibe_notificaciones AS "recibeNotificaciones"
         FROM proveedor_contactos WHERE proveedor_id = $1 AND empresa_id = $2 ORDER BY creado_at, id`,
        [id, empresaId],
      ),
      db.query(
        `SELECT d.id, d.tipo, d.descripcion, d.direccion, coalesce(d.numero_casa,'') AS "numeroCasa",
                d.pais_codigo AS "paisCodigo", coalesce(pa.nombre, d.pais_codigo) AS "paisNombre",
                coalesce(d.departamento_codigo::text,'') AS "departamentoCodigo",
                coalesce(d.distrito_codigo::text,'') AS "distritoCodigo",
                coalesce(d.ciudad_codigo::text,'') AS "ciudadCodigo",
                coalesce(d.departamento,'') AS departamento, coalesce(d.distrito,'') AS distrito,
                coalesce(d.ciudad,'') AS ciudad, coalesce(d.codigo_postal,'') AS "codigoPostal",
                d.es_principal AS "esPrincipal"
         FROM proveedor_direcciones d
         LEFT JOIN referencia_geografica_paises pa ON pa.codigo = d.pais_codigo
         WHERE d.proveedor_id = $1 AND d.empresa_id = $2 ORDER BY d.creado_at, d.id`,
        [id, empresaId],
      ),
      db.query(
        `SELECT id, banco, coalesce(sucursal_banco,'') AS "sucursalBanco", titular,
                coalesce(documento_titular,'') AS "documentoTitular", tipo_cuenta AS "tipoCuenta",
                numero_cuenta AS "numeroCuenta", moneda_codigo AS "monedaCodigo",
                coalesce(alias_cuenta,'') AS "aliasCuenta", coalesce(codigo_swift,'') AS "codigoSwift",
                coalesce(iban,'') AS iban, es_principal AS "esPrincipal"
         FROM proveedor_cuentas_bancarias WHERE proveedor_id = $1 AND empresa_id = $2 ORDER BY creado_at, id`,
        [id, empresaId],
      ),
      db.query(
        `SELECT id, tipo, impuesto_id AS "impuestoId", porcentaje::text AS porcentaje,
                certificado_obligatorio AS "certificadoObligatorio",
                coalesce(to_char(fecha_vigencia_desde,'YYYY-MM-DD'),'') AS "fechaVigenciaDesde",
                coalesce(to_char(fecha_vigencia_hasta,'YYYY-MM-DD'),'') AS "fechaVigenciaHasta",
                coalesce(observacion,'') AS observacion
         FROM proveedor_retenciones WHERE proveedor_id = $1 AND empresa_id = $2 ORDER BY creado_at, id`,
        [id, empresaId],
      ),
      db.query(
        `SELECT id, tipo, nombre_archivo AS "nombreArchivo", url_archivo AS "urlArchivo",
                coalesce(to_char(fecha_emision,'YYYY-MM-DD'),'') AS "fechaEmision",
                coalesce(to_char(fecha_vencimiento,'YYYY-MM-DD'),'') AS "fechaVencimiento",
                coalesce(observacion,'') AS observacion
         FROM proveedor_documentos WHERE proveedor_id = $1 AND empresa_id = $2 ORDER BY creado_at, id`,
        [id, empresaId],
      ),
    ]);

    return NextResponse.json({
      proveedor: {
        ...principal.rows[0],
        contactos: contactos.rows,
        direcciones: direcciones.rows,
        cuentasBancarias: cuentas.rows,
        retenciones: retenciones.rows,
        documentos: documentos.rows,
      },
    });
  } catch (error) {
    console.error("Error al consultar proveedor:", error);
    return NextResponse.json({ error: "No fue posible cargar el proveedor." }, { status: 500 });
  }
}

export async function PUT(request: Request, contexto: Contexto) {
  let body: ProveedorBody;
  try {
    body = (await request.json()) as ProveedorBody;
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }

  if (!DEMO_MODE && !process.env.DATABASE_URL) return sinBase();
  if (DEMO_MODE) return NextResponse.json({ error: "Proveedor no encontrado." }, { status: 404 });

  const session = await sesionActual();
  if (!session) return NextResponse.json({ error: "Su sesión ha finalizado." }, { status: 401 });

  const denegado = await denyIfNoPermission(session, "PROVEEDORES", "EDITAR");
  if (denegado) return denegado;

  const { id } = await contexto.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Proveedor no encontrado." }, { status: 404 });

  const empresaId = session.user.empresaId;
  const db = await obtenerDb();
  let conexion: PoolClient | null = null;

  try {
    const datos = normalizarProveedor(body);

    conexion = await db.connect();
    await conexion.query("BEGIN");

    const existente = await conexion.query(
      `SELECT codigo, estado_homologacion, coalesce(to_char(fecha_homologacion,'YYYY-MM-DD'),'') AS fecha_homologacion,
              coalesce(to_char(fecha_vencimiento_homologacion,'YYYY-MM-DD'),'') AS fecha_vencimiento_homologacion,
              nivel_riesgo, calificacion_actual::text AS calificacion_actual, bloqueado, coalesce(motivo_bloqueo,'') AS motivo_bloqueo,
              to_char(actualizado_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS version
         FROM proveedores WHERE id = $1 AND empresa_id = $2 FOR UPDATE`,
      [id, empresaId],
    );
    if (!existente.rowCount) {
      await conexion.query("ROLLBACK");
      return NextResponse.json({ error: "Proveedor no encontrado." }, { status: 404 });
    }
    const actual = existente.rows[0] as Record<string, string | boolean | null>;

    // Concurrencia optimista: si otro usuario guardó después de cargar la ficha, no se pisa su trabajo.
    if (typeof body.version === "string" && body.version !== actual.version) {
      throw new ErrorValidacion("Otro usuario modificó este proveedor mientras usted lo editaba. Recargue la ficha para ver los cambios antes de guardar.", null, 409);
    }

    // Los datos gobernados no se cambian por la edición común (DEC-PRV-02/06/10): solo por sus acciones con permiso y auditoría.
    const gobernados: Array<[string, unknown, unknown]> = [
      ["estadoHomologacion", body.estadoHomologacion, actual.estado_homologacion],
      ["fechaHomologacion", body.fechaHomologacion, actual.fecha_homologacion],
      ["fechaVencimientoHomologacion", body.fechaVencimientoHomologacion, actual.fecha_vencimiento_homologacion],
      ["nivelRiesgo", body.nivelRiesgo, actual.nivel_riesgo],
      ["calificacionActual", body.calificacionActual, actual.calificacion_actual],
      ["bloqueado", body.bloqueado, actual.bloqueado],
      ["motivoBloqueo", body.motivoBloqueo, actual.motivo_bloqueo],
    ];
    for (const [campo, enviado, guardado] of gobernados) {
      const vacio = enviado === undefined || enviado === null || enviado === "";
      if (!vacio && String(enviado) !== String(guardado ?? "")) {
        throw new ErrorValidacion("Este dato se modifica solo con la acción específica (homologación, riesgo o bloqueo), con su permiso y auditoría.", campo, 403);
      }
    }

    await validarReferencias(conexion, datos, empresaId);
    await verificarDocumentoUnico(conexion, empresaId, datos, id);

    const columnas = columnasProveedor(datos);
    const sets = columnas.map(([nombre], i) => `${nombre} = $${i + 3}`);
    // pais_nombre se recalcula desde el catálogo cuando cambia el país (el trigger solo completa si es NULL).
    sets.push(`pais_nombre = (SELECT nombre FROM referencia_geografica_paises WHERE codigo = $${columnas.length + 3})`);

    const actualizado = await conexion.query(
      `UPDATE proveedores x SET ${sets.join(", ")} FROM proveedores old
        WHERE x.id = $1 AND x.empresa_id = $2 AND old.id = x.id
        RETURNING to_jsonb(old.*) AS anterior, to_jsonb(x.*) AS nuevo`,
      [id, empresaId, ...columnas.map(([, valor]) => valor), datos.paisCodigo],
    );
    const { antes, despues } = diferenciasFila(actualizado.rows[0].anterior, actualizado.rows[0].nuevo);
    if (Object.keys(despues).length > 0) {
      await registrarEvento(conexion, { empresaId, proveedorId: id, entidad: "PROVEEDOR", entidadId: id, accion: "ACTUALIZACION", anterior: antes, nuevo: despues, usuarioId: session.user.id });
    }

    // Filas relacionadas: actualización selectiva por identificador; solo se elimina lo que el usuario eliminó explícitamente.
    await sincronizarHijos(conexion, empresaId, id, datos, session.user.id);

    await conexion.query("COMMIT");
    const codigo = actual.codigo as string;
    return NextResponse.json({ message: `Proveedor ${codigo} actualizado correctamente.`, proveedor: { id, codigo } });
  } catch (error) {
    if (conexion) await conexion.query("ROLLBACK").catch(() => undefined);
    return respuestaError(error, "actualizar");
  } finally {
    conexion?.release();
  }
}
