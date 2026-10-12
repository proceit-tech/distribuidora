import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { denyIfNoPermission } from "@/lib/auth/permissions";
import { ErrorValidacion } from "@/lib/proveedores/errores";
import { hoyAsuncion } from "@/lib/proveedores/fechas";
import { estadoOperativo, homologacionVencida } from "@/lib/proveedores/gobernanza";
import { autorizarProveedores } from "@/lib/proveedores/http";
import { certificadoValido } from "@/lib/proveedores/documentos";
import { decidirAccesoDocumento } from "@/lib/proveedores/permisos-documentos";
import { normalizarProveedor } from "@/lib/proveedores/normalizar";
import {
  columnasProveedor,
  diferenciasFila,
  exigirVersion,
  exigirVersionPresente,
  registrarEvento,
  respuestaError,
  sincronizarHijos,
  validarCertificados,
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
         p.activo, p.bloqueado, coalesce(p.motivo_bloqueo, '') AS "motivoBloqueo",
         (p.creado_por IS NOT DISTINCT FROM $3::uuid AND p.creado_por IS NOT NULL) AS "esCreador",
         p.carga_documentos_inicial_abierta AS "cargaDocumentosInicialAbierta",
         p.creado_at AS "creadoEn", p.actualizado_at AS "actualizadoEn",
         to_char(p.actualizado_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS version
       FROM proveedores p
       WHERE p.id = $1 AND p.empresa_id = $2`,
      [id, empresaId, session.user.id],
    );

    if (!principal.rowCount) {
      return NextResponse.json({ error: "Proveedor no encontrado." }, { status: 404 });
    }

    // PRV-M02: grupo y medio de pago que el proveedor ya tiene pero que hoy están inactivos (no figuran en los catálogos activos): se informan para mostrarlos como «(inactivo)».
    const historicas = await db.query(
      `SELECT 'grupoProveedorId' AS campo, id::text, codigo, nombre FROM grupos_proveedor WHERE empresa_id = $1 AND id = $2::uuid AND NOT activo
       UNION ALL SELECT 'medioPagoPreferidoId', id::text, codigo, nombre FROM medios_pago WHERE empresa_id = $1 AND id = $3::uuid AND NOT activo`,
      [empresaId, principal.rows[0].grupoProveedorId, principal.rows[0].medioPagoPreferidoId],
    );
    const referenciasHistoricas = Object.fromEntries((historicas.rows as Array<{ campo: string; id: string; codigo: string | null; nombre: string }>).map((h) => [h.campo, { id: h.id, codigo: h.codigo ?? "", nombre: h.nombre }]));

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
                coalesce(iban,'') AS iban, es_principal AS "esPrincipal",
                estado_aprobacion AS "estadoAprobacion", coalesce(motivo_resolucion,'') AS "motivoResolucion", activa,
                coalesce(to_char(desactivada_at AT TIME ZONE 'America/Asuncion','DD/MM/YYYY HH24:MI'),'') AS "desactivadaEn",
                coalesce(to_char(aprobado_at AT TIME ZONE 'America/Asuncion','DD/MM/YYYY HH24:MI'),'') AS "aprobadoEn",
                (SELECT jsonb_build_object('id', r.id, 'datos', r.datos,
                          'solicitadoEn', to_char(r.solicitado_at AT TIME ZONE 'America/Asuncion','DD/MM/YYYY HH24:MI'))
                   FROM proveedor_cuenta_revisiones r
                  WHERE r.cuenta_id = proveedor_cuentas_bancarias.id AND r.empresa_id = proveedor_cuentas_bancarias.empresa_id AND r.estado = 'PENDIENTE') AS "revisionPendiente"
         FROM proveedor_cuentas_bancarias WHERE proveedor_id = $1 AND empresa_id = $2 ORDER BY creado_at, id`,
        [id, empresaId],
      ),
      db.query(
        `SELECT id, tipo, impuesto_id AS "impuestoId", porcentaje::text AS porcentaje,
                certificado_obligatorio AS "certificadoObligatorio", activa,
                documento_certificado_id AS "documentoCertificadoId",
                coalesce(to_char(fecha_vigencia_desde,'YYYY-MM-DD'),'') AS "fechaVigenciaDesde",
                coalesce(to_char(fecha_vigencia_hasta,'YYYY-MM-DD'),'') AS "fechaVigenciaHasta",
                coalesce(observacion,'') AS observacion
         FROM proveedor_retenciones WHERE proveedor_id = $1 AND empresa_id = $2 ORDER BY creado_at, id`,
        [id, empresaId],
      ),
      db.query(
        `SELECT id, tipo, nombre_archivo AS "nombreArchivo", coalesce(url_archivo,'') AS "urlArchivo",
                (almacen_clave IS NOT NULL) AS "tieneArchivo", tamano_bytes, coalesce(tipo_mime,'') AS "tipoMime", version_vigente AS version,
                coalesce(to_char(fecha_emision,'YYYY-MM-DD'),'') AS "fechaEmision",
                coalesce(to_char(fecha_vencimiento,'YYYY-MM-DD'),'') AS "fechaVencimiento",
                coalesce(observacion,'') AS observacion
         FROM proveedor_documentos WHERE proveedor_id = $1 AND empresa_id = $2 AND eliminado_at IS NULL ORDER BY creado_at, id`,
        [id, empresaId],
      ),
    ]);

    const base = principal.rows[0];
    const hoy = hoyAsuncion();
    const gobierno = {
      activo: base.activo as boolean,
      bloqueado: base.bloqueado as boolean,
      motivoBloqueo: base.motivoBloqueo as string,
      estadoHomologacion: base.estadoHomologacion as string,
      fechaHomologacion: base.fechaHomologacion as string,
      fechaVencimientoHomologacion: base.fechaVencimientoHomologacion as string,
      nivelRiesgo: base.nivelRiesgo as string,
      calificacionActual: base.calificacionActual as string | null,
    };
    const acceso = await autorizarProveedores();
    const permisos = "permisos" in acceso ? acceso.permisos : null;

    const permisosDoc = permisos ?? { ver: false, editar: false, crear: false };
    const contextoDoc = { esCreador: base.esCreador === true, cargaInicialAbierta: base.cargaDocumentosInicialAbierta === true };
    const puede = (a: Parameters<typeof decidirAccesoDocumento>[0]) => decidirAccesoDocumento(a, permisosDoc, contextoDoc).permitido;
    const documentosLista = documentos.rows.map((d) => ({ ...d, tamanoBytes: d.tamano_bytes === null ? null : Number(d.tamano_bytes), version: Number(d.version), tamano_bytes: undefined }));
    const retencionesLista = retenciones.rows.map((r) => {
      const doc = documentosLista.find((d) => d.id === r.documentoCertificadoId);

      return { ...r, certificadoValido: doc ? certificadoValido({ tipo: doc.tipo, tieneArchivo: doc.tieneArchivo, eliminado: false, fechaVencimiento: doc.fechaVencimiento }, hoy) : false };
    });

    return NextResponse.json({
      proveedor: {
        ...base,
        permisosDocumentos: { cargar: puede("CARGAR"), gestionar: puede("EDITAR_DATOS"), historial: puede("VER_HISTORIAL"), finalizar: puede("FINALIZAR_CARGA") },
        homologacionVencida: homologacionVencida(gobierno, hoy),
        estadoOperativo: estadoOperativo(gobierno, hoy),
        permisos: {
          editar: permisos?.editar ?? false,
          homologar: permisos?.homologar ?? false,
          evaluarRiesgo: permisos?.evaluarRiesgo ?? false,
          bloquear: permisos?.bloquear ?? false,
          aprobarBanco: permisos?.aprobarBanco ?? false,
          reactivarCuenta: permisos?.administrador ?? false,
        },
        referenciasHistoricas,
        contactos: contactos.rows,
        direcciones: direcciones.rows,
        cuentasBancarias: cuentas.rows,
        retenciones: retencionesLista,
        documentos: documentosLista,
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
    // PRV-R01-05: la ausencia de versión se informa (409) antes que cualquier error de validación del cuerpo; la comparación exacta sigue después del FOR UPDATE.
    exigirVersionPresente(body.version);

    const datos = normalizarProveedor(body);

    conexion = await db.connect();
    await conexion.query("BEGIN");

    const existente = await conexion.query(
      `SELECT codigo, grupo_proveedor_id::text AS grupo_proveedor_id, medio_pago_preferido_id::text AS medio_pago_preferido_id, estado_homologacion, coalesce(to_char(fecha_homologacion,'YYYY-MM-DD'),'') AS fecha_homologacion,
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

    // Concurrencia optimista (PRV-M01): la versión es OBLIGATORIA; se compara tras bloquear la fila y antes de validar o escribir nada.
    exigirVersion(body.version, actual.version);

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

    await validarReferencias(conexion, datos, empresaId, { grupoProveedorId: actual.grupo_proveedor_id as string | null, medioPagoId: actual.medio_pago_preferido_id as string | null });
    await verificarDocumentoUnico(conexion, empresaId, datos, id);
    await validarCertificados(conexion, empresaId, id, datos);

    const columnas = columnasProveedor(datos);
    const sets = columnas.map(([nombre], i) => `${nombre} = $${i + 3}`);
    // pais_nombre se recalcula desde el catálogo cuando cambia el país (el trigger solo completa si es NULL).
    sets.push(`pais_nombre = (SELECT nombre FROM referencia_geografica_paises WHERE codigo = $${columnas.length + 3})`);
    // La primera edición del proveedor cierra la carga inicial de documentos (quien solo tiene CREAR deja de poder agregarlos).
    sets.push("carga_documentos_inicial_abierta = false");

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
