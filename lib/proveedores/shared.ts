import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { resolverUbicacionParaguay } from "@/lib/geografia/referencia";
import { ErrorValidacion } from "@/lib/proveedores/errores";
import type { DatosProveedor } from "@/lib/proveedores/normalizar";
import { certificadoValido } from "@/lib/proveedores/documentos";
import { hoyAsuncion } from "@/lib/proveedores/fechas";
import { registrarEvento, sincronizarHijos, diferenciasFila } from "@/lib/proveedores/sincronizar";

// Persistencia de Proveedores (POST y PUT). Toda consulta es parametrizada; empresa_id siempre llega de la sesión autenticada.
// La validación de formato vive en normalizar.ts (pura); aquí solo lo que depende de la base: catálogos, unicidad, geografía
// oficial y la sincronización SELECTIVA de las filas relacionadas (nunca borrar y recrear).

export type ProveedorBody = Record<string, unknown>;
export type { DatosProveedor };
export { registrarEvento, sincronizarHijos, diferenciasFila };

async function existeActivo(conexion: PoolClient, sql: string, parametros: unknown[]) {
  return ((await conexion.query(sql, parametros)).rowCount ?? 0) > 0;
}

/**
 * PRV-M01: concurrencia optimista OBLIGATORIA. `enviada` es la versión (actualizado_at con microsegundos) que el operador tenía en pantalla; `actual` es la leída tras bloquear
 * la fila (FOR UPDATE). Ausente, vacía, no textual o distinta → 409 y no se escribe nada.
 */
export function exigirVersionPresente(enviada: unknown) {
  if (typeof enviada !== "string" || enviada.trim() === "") {
    throw new ErrorValidacion("Falta la versión de la ficha: recargue el proveedor antes de guardar. No se guardó ningún cambio.", null, 409);
  }
}

export function exigirVersion(enviada: unknown, actual: unknown) {
  exigirVersionPresente(enviada);
  if (enviada !== actual) {
    throw new ErrorValidacion("Otro usuario modificó este proveedor mientras usted lo editaba (o la versión enviada no es válida). Recargue la ficha para ver los cambios antes de guardar; no se guardó ningún cambio.", null, 409);
  }
}

/** Valores que el proveedor YA tiene guardados (PRV-M02): un vínculo histórico idéntico se tolera aunque se haya inactivado; lo nuevo o modificado debe estar activo. */
export type ReferenciasPrevias = { grupoProveedorId?: string | null; medioPagoId?: string | null };

/**
 * Verifica que las referencias de catálogo existan y estén activas (las de empresa, dentro de la empresa de la sesión). Con `previo` (edición, bajo FOR UPDATE), el grupo y el
 * medio de pago que NO cambian se aceptan aunque estén inactivos, siempre que pertenezcan a la empresa; nunca se anulan ni se reemplazan en silencio.
 */
export async function validarReferencias(conexion: PoolClient, d: DatosProveedor, empresaId: string, previo: ReferenciasPrevias = {}) {
  const falla = (mensaje: string, campo: string): never => {
    throw new ErrorValidacion(mensaje, campo);
  };

  if (d.grupoProveedorId) {
    const sinCambio = d.grupoProveedorId === (previo.grupoProveedorId ?? null);
    const sql = sinCambio ? "SELECT 1 FROM grupos_proveedor WHERE id = $1 AND empresa_id = $2" : "SELECT 1 FROM grupos_proveedor WHERE id = $1 AND empresa_id = $2 AND activo = true";

    if (!(await existeActivo(conexion, sql, [d.grupoProveedorId, empresaId]))) falla("El grupo de proveedor seleccionado no es válido o no está activo.", "grupoProveedorId");
  }
  if (d.medioPagoId) {
    const sinCambio = d.medioPagoId === (previo.medioPagoId ?? null);
    const sql = sinCambio ? "SELECT 1 FROM medios_pago WHERE id = $1 AND empresa_id = $2" : "SELECT 1 FROM medios_pago WHERE id = $1 AND empresa_id = $2 AND activo = true";

    if (!(await existeActivo(conexion, sql, [d.medioPagoId, empresaId]))) falla("El medio de pago seleccionado no es válido o no está activo.", "medioPagoPreferidoId");
  }
  if (d.condicionPagoId && !(await existeActivo(conexion, "SELECT 1 FROM condiciones_pago WHERE id = $1 AND activo = true", [d.condicionPagoId]))) {
    falla("La condición de pago seleccionada no existe o está inactiva.", "condicionPagoId");
  }
  if (d.monedaCodigo && !(await existeActivo(conexion, "SELECT 1 FROM monedas WHERE codigo = $1 AND activo = true", [d.monedaCodigo]))) {
    falla("La moneda seleccionada no existe o está inactiva.", "monedaCodigoPredeterminada");
  }
  if (d.incotermCodigo && !(await existeActivo(conexion, "SELECT 1 FROM incoterms WHERE codigo = $1 AND activo = true", [d.incotermCodigo]))) {
    falla("El Incoterm seleccionado no existe o está inactivo.", "incotermCodigo");
  }
  if (!(await existeActivo(conexion, "SELECT 1 FROM referencia_geografica_paises WHERE codigo = $1 AND activo = true", [d.paisCodigo]))) {
    falla("El país seleccionado no existe o está inactivo.", "paisCodigo");
  }

  for (const [i, direccion] of d.direcciones.entries()) {
    if (!(await existeActivo(conexion, "SELECT 1 FROM referencia_geografica_paises WHERE codigo = $1 AND activo = true", [direccion.paisCodigo]))) {
      falla(`El país de la dirección ${i + 1} no existe o está inactivo.`, `direcciones.${i}.paisCodigo`);
    }
    if (direccion.paisCodigo === "PRY") {
      try {
        await resolverUbicacionParaguay(conexion, direccion.departamentoCodigo ?? undefined, direccion.distritoCodigo ?? undefined, direccion.ciudadCodigo ?? undefined, `La dirección ${i + 1}`);
      } catch (e) {
        throw new ErrorValidacion(e instanceof Error ? e.message : "La ubicación no es válida.", `direcciones.${i}.departamentoCodigo`);
      }
    }
  }
  for (const [i, cuenta] of d.cuentasBancarias.entries()) {
    if (!(await existeActivo(conexion, "SELECT 1 FROM monedas WHERE codigo = $1 AND activo = true", [cuenta.monedaCodigo]))) {
      falla(`La moneda de la cuenta ${i + 1} no existe o está inactiva.`, `cuentasBancarias.${i}.monedaCodigo`);
    }
  }
  for (const [i, retencion] of d.retenciones.entries()) {
    if (retencion.impuestoId && !(await existeActivo(conexion, "SELECT 1 FROM impuestos WHERE id = $1 AND activo = true", [retencion.impuestoId]))) {
      falla(`El impuesto de la retención ${i + 1} no existe o está inactivo.`, `retenciones.${i}.impuestoId`);
    }
  }
}

/**
 * Certificados de retención (DEC-PRV-08): el documento vinculado debe ser del MISMO proveedor y, para activar una retención que lo
 * exige, un certificado de retención con archivo, no eliminado y no vencido. En el alta (proveedorId = null) aún no hay documentos.
 */
export async function validarCertificados(conexion: PoolClient, empresaId: string, proveedorId: string | null, d: DatosProveedor) {
  const hoy = hoyAsuncion();

  for (const [i, r] of d.retenciones.entries()) {
    if (!r.documentoCertificadoId) continue;

    const campo = `retenciones.${i}.documentoCertificadoId`;

    if (proveedorId === null) throw new ErrorValidacion("Aún no hay documentos: guarde el proveedor, cargue el certificado y luego vincúlelo a la retención.", campo);

    const doc = await conexion.query(
      `SELECT tipo, almacen_clave IS NOT NULL AS tiene_archivo, eliminado_at IS NOT NULL AS eliminado, coalesce(to_char(fecha_vencimiento, 'YYYY-MM-DD'), '') AS fv
         FROM proveedor_documentos WHERE id = $1 AND proveedor_id = $2 AND empresa_id = $3`,
      [r.documentoCertificadoId, proveedorId, empresaId],
    );

    if (!doc.rowCount) throw new ErrorValidacion(`El certificado de la retención ${i + 1} no existe en este proveedor.`, campo);

    const valido = certificadoValido({ tipo: doc.rows[0].tipo, tieneArchivo: doc.rows[0].tiene_archivo === true, eliminado: doc.rows[0].eliminado === true, fechaVencimiento: doc.rows[0].fv }, hoy);

    if (r.certificadoObligatorio && r.activa && !valido) {
      throw new ErrorValidacion(`El certificado de la retención ${i + 1} no es válido: debe ser un certificado de retención con archivo, vigente y no eliminado.`, campo);
    }
  }
}

/** Unicidad documental por empresa (tipo + número), con mensaje sobre el campo; la restricción de base es la garantía final. */
export async function verificarDocumentoUnico(conexion: PoolClient, empresaId: string, d: DatosProveedor, excluirId: string | null) {
  const r = await conexion.query(
    "SELECT codigo FROM proveedores WHERE empresa_id = $1 AND tipo_documento = $2 AND numero_documento = $3 AND ($4::uuid IS NULL OR id <> $4::uuid) LIMIT 1",
    [empresaId, d.tipoDocumento, d.numeroDocumento, excluirId],
  );

  if (r.rowCount) {
    throw new ErrorValidacion(`Ya existe el proveedor ${r.rows[0].codigo} con ese tipo y número de documento.`, "numeroDocumento", 409);
  }
}

/** Columnas editables de `proveedores` (mismo orden para INSERT y UPDATE). Los datos gobernados (homologación, riesgo, bloqueo) NO están aquí. */
export function columnasProveedor(d: DatosProveedor): Array<[string, unknown]> {
  return [
    ["tipo_persona", d.tipoPersona],
    ["grupo_proveedor_id", d.grupoProveedorId],
    ["tipo_documento", d.tipoDocumento],
    ["numero_documento", d.numeroDocumento],
    ["dv", d.dv],
    ["razon_social", d.razonSocial],
    ["nombre_fantasia", d.nombreFantasia],
    ["pais_codigo", d.paisCodigo],
    ["email", d.email],
    ["telefono", d.telefono],
    ["condicion_pago_id", d.condicionPagoId],
    ["moneda_codigo_predeterminada", d.monedaCodigo],
    ["medio_pago_preferido_id", d.medioPagoId],
    ["dia_pago_preferido", d.diaPagoPreferido],
    ["plazo_entrega_dias", d.plazoEntregaDias],
    ["descuento_comercial_pct", d.descuentoComercialPct],
    ["monto_minimo_compra", d.montoMinimoCompra],
    ["permite_anticipos", d.permiteAnticipos],
    ["requiere_orden_compra", d.requiereOrdenCompra],
    ["email_pagos", d.emailPagos],
    ["sitio_web", d.sitioWeb],
    ["fecha_inicio_relacion", d.fechaInicioRelacion],
    ["fecha_fin_relacion", d.fechaFinRelacion],
    ["observacion", d.observacion],
    ["incoterm_codigo", d.incotermCodigo],
    ["condicion_entrega", d.condicionEntrega],
    ["metodo_transporte_preferido", d.metodoTransporte],
    ["dias_confirmacion_pedido", d.diasConfirmacionPedido],
    ["permite_entrega_parcial", d.permiteEntregaParcial],
    ["activo", d.activo],
  ];
}

const POR_RESTRICCION: Record<string, { mensaje: string; campo?: string }> = {
  proveedores_empresa_documento_key: { mensaje: "Ya existe un proveedor con ese tipo y número de documento.", campo: "numeroDocumento" },
  proveedor_cuentas_bancarias_numero_key: { mensaje: "Esa cuenta bancaria ya está registrada para este proveedor.", campo: "cuentasBancarias" },
  proveedor_contactos_uno_principal_uq: { mensaje: "Solo puede haber un contacto principal.", campo: "contactos" },
  proveedor_direcciones_uno_principal_per_tipo_uq: { mensaje: "Solo puede haber una dirección principal por tipo.", campo: "direcciones" },
  proveedor_cuentas_bancarias_uno_principal_uq: { mensaje: "Solo puede haber una cuenta principal por moneda.", campo: "cuentasBancarias" },
  proveedores_legal_nombre_chk: { mensaje: "La razón social no es válida o supera el máximo que admite la base de datos (aplique la migración NEX-033 para 255 caracteres).", campo: "razonSocial" },
  proveedores_trade_nombre_chk: { mensaje: "El nombre de fantasía supera el máximo que admite la base de datos (aplique la migración NEX-033 para 255 caracteres).", campo: "nombreFantasia" },
};

export function respuestaError(error: unknown, accion: string) {
  if (error instanceof ErrorValidacion) {
    return NextResponse.json({ error: error.message, campo: error.campo, pestana: error.pestana }, { status: error.estado });
  }

  console.error(`Error al ${accion} proveedor:`, error);

  const pg = error as { code?: string; constraint?: string };
  const conocida = pg.constraint ? POR_RESTRICCION[pg.constraint] : undefined;

  if (pg.code === "23505") {
    const m = conocida ?? { mensaje: "Existe un registro duplicado." };
    return NextResponse.json({ error: m.mensaje, campo: m.campo ?? null }, { status: 409 });
  }
  if (pg.code === "23503") {
    return NextResponse.json({ error: "Existe una referencia relacionada que no es válida o ya no está disponible." }, { status: 400 });
  }
  if (pg.code === "23514" || pg.code === "P0001" || pg.code === "22P02" || pg.code === "22007" || pg.code === "22003" || pg.code === "22001") {
    return NextResponse.json({ error: conocida?.mensaje ?? "Los datos enviados no cumplen las reglas del proveedor.", campo: conocida?.campo ?? null }, { status: 400 });
  }
  if (pg.code) {
    return NextResponse.json({ error: `No fue posible ${accion} el proveedor.` }, { status: 500 });
  }

  return NextResponse.json({ error: error instanceof Error ? error.message : `No fue posible ${accion} el proveedor.` }, { status: 400 });
}
