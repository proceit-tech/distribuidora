import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

// Lógica compartida de validación y persistencia de proveedores (POST y PUT).
// Toda consulta es parametrizada; empresa_id siempre llega de la sesión autenticada.

export type ContactoInput = {
  nombre?: string;
  apellido?: string;
  cargo?: string;
  departamento?: string;
  telefono?: string;
  celular?: string;
  email?: string;
  esPrincipal?: boolean;
  recibeCotizaciones?: boolean;
  recibeOrdenesCompra?: boolean;
  recibeLogistica?: boolean;
  recibeDevoluciones?: boolean;
  recibePagos?: boolean;
  recibeCalidad?: boolean;
  recibeNotificaciones?: boolean;
};

export type DireccionInput = {
  tipo?: "FISCAL" | "COMERCIAL" | "RETIRO" | "PAGOS" | "OTRA";
  descripcion?: string;
  direccion?: string;
  numeroCasa?: string;
  paisCodigo?: string;
  departamentoCodigo?: string | number;
  distritoCodigo?: string | number;
  ciudadCodigo?: string | number;
  departamento?: string;
  distrito?: string;
  ciudad?: string;
  codigoPostal?: string;
  esPrincipal?: boolean;
};

export type CuentaBancariaInput = {
  banco?: string;
  sucursalBanco?: string;
  titular?: string;
  documentoTitular?: string;
  tipoCuenta?: "CORRIENTE" | "AHORRO" | "CAJA_AHORRO" | "OTRA";
  numeroCuenta?: string;
  monedaCodigo?: string;
  aliasCuenta?: string;
  codigoSwift?: string;
  iban?: string;
  esPrincipal?: boolean;
};

export type RetencionInput = {
  tipo?: "IVA" | "RENTA" | "OTRA";
  impuestoId?: string;
  porcentaje?: string | number;
  certificadoObligatorio?: boolean;
  fechaVigenciaDesde?: string;
  fechaVigenciaHasta?: string;
  observacion?: string;
};

export type DocumentoInput = {
  tipo?:
    | "CONTRATO"
    | "CONSTANCIA_RUC"
    | "CERTIFICADO_BANCARIO"
    | "CERTIFICADO_RETENCION"
    | "LICENCIA"
    | "OTRO";
  nombreArchivo?: string;
  urlArchivo?: string;
  fechaEmision?: string;
  fechaVencimiento?: string;
  observacion?: string;
};

export type ProveedorBody = {
  activo?: boolean;
  tipoPersona?: "FISICA" | "JURIDICA";
  grupoProveedorId?: string;
  tipoDocumento?: string;
  numeroDocumento?: string;
  dv?: string;
  razonSocial?: string;
  nombreFantasia?: string;
  paisCodigo?: string;
  email?: string;
  telefono?: string;
  condicionPagoId?: string;
  monedaCodigoPredeterminada?: string;
  medioPagoPreferidoId?: string;
  diaPagoPreferido?: string | number;
  plazoEntregaDias?: string | number;
  descuentoComercialPct?: string | number;
  montoMinimoCompra?: string | number;
  permiteAnticipos?: boolean;
  requiereOrdenCompra?: boolean;
  emailPagos?: string;
  sitioWeb?: string;
  fechaInicioRelacion?: string;
  fechaFinRelacion?: string;
  observacion?: string;
  estadoHomologacion?: string;
  fechaHomologacion?: string;
  fechaVencimientoHomologacion?: string;
  nivelRiesgo?: string;
  calificacionActual?: string | number;
  incotermCodigo?: string;
  condicionEntrega?: string;
  metodoTransportePreferido?: string;
  diasConfirmacionPedido?: string | number;
  permiteEntregaParcial?: boolean;
  contactos?: ContactoInput[];
  direcciones?: DireccionInput[];
  cuentasBancarias?: CuentaBancariaInput[];
  retenciones?: RetencionInput[];
  documentos?: DocumentoInput[];
};

export const TIPOS_DIRECCION = new Set(["FISCAL", "COMERCIAL", "RETIRO", "PAGOS", "OTRA"]);
export const TIPOS_RETENCION = new Set(["IVA", "RENTA", "OTRA"]);
export const TIPOS_DOCUMENTO = new Set([
  "CONTRATO",
  "CONSTANCIA_RUC",
  "CERTIFICADO_BANCARIO",
  "CERTIFICADO_RETENCION",
  "LICENCIA",
  "OTRO",
]);
export const ESTADOS_HOMOLOGACION = new Set([
  "PENDIENTE",
  "EN_EVALUACION",
  "HOMOLOGADO",
  "RECHAZADO",
  "SUSPENDIDO",
  "VENCIDO",
]);
export const NIVELES_RIESGO = new Set(["NO_EVALUADO", "BAJO", "MEDIO", "ALTO", "CRITICO"]);
export const METODOS_TRANSPORTE = new Set([
  "TERRESTRE",
  "MARITIMO",
  "AEREO",
  "FERROVIARIO",
  "MULTIMODAL",
  "OTRO",
]);

export function texto(valor: unknown, maximo?: number) {
  const resultado = typeof valor === "string" ? valor.trim() : "";
  if (maximo && resultado.length > maximo) {
    throw new Error(`El valor ingresado supera el máximo permitido de ${maximo} caracteres.`);
  }
  return resultado;
}

export function opcional(valor: unknown, maximo?: number) {
  const resultado = texto(valor, maximo);
  return resultado || null;
}

export function fecha(valor: unknown, etiqueta = "La fecha") {
  if (valor === null || valor === undefined || valor === "") return null;
  const resultado = texto(valor);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(resultado)) {
    throw new Error(`${etiqueta} no tiene un formato válido.`);
  }
  return resultado;
}

export function entero(valor: unknown, etiqueta: string) {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  if (!Number.isInteger(numero)) throw new Error(`${etiqueta} debe ser un número entero.`);
  return numero;
}

export function decimal(valor: unknown, etiqueta: string, predeterminado: number | null = null) {
  if (valor === null || valor === undefined || valor === "") return predeterminado;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) throw new Error(`${etiqueta} debe ser un número válido.`);
  return numero;
}

export function booleano(valor: unknown, predeterminado = false) {
  if (valor === undefined || valor === null) return predeterminado;
  return valor === true;
}

export function arreglo<T>(valor: unknown): T[] {
  return Array.isArray(valor) ? (valor as T[]) : [];
}

export function codigoGeografico(valor: unknown, etiqueta: string) {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero <= 0) throw new Error(`${etiqueta} no es válido.`);
  return numero;
}

export function validarCorreo(valor: string | null, etiqueta: string) {
  if (!valor) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) throw new Error(`${etiqueta} no es válido.`);
}

export function validarUrl(valor: string | null) {
  if (!valor) return;
  try {
    const url = new URL(valor);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
  } catch {
    throw new Error("El sitio web debe ser una URL válida.");
  }
}

export async function validarReferenciaEmpresa(
  conexion: PoolClient,
  tabla: string,
  id: string | null,
  empresaId: string,
  etiqueta: string,
) {
  if (!id) return;
  const permitidas = new Set(["grupos_proveedor", "medios_pago"]);
  if (!permitidas.has(tabla)) throw new Error("Referencia interna no permitida.");
  const resultado = await conexion.query(
    `SELECT 1 FROM ${tabla} WHERE id = $1 AND empresa_id = $2 AND activo = true LIMIT 1`,
    [id, empresaId],
  );
  if (!resultado.rowCount) throw new Error(`El ${etiqueta} seleccionado no es válido o no está activo.`);
}

export async function validarReferenciaGlobal(
  conexion: PoolClient,
  tabla: string,
  columna: string,
  valor: string | null,
  etiqueta: string,
) {
  if (!valor) return;
  const permitidas = new Set([
    "condiciones_pago:id",
    "monedas:codigo",
    "incoterms:codigo",
    "referencia_geografica_paises:codigo",
  ]);
  if (!permitidas.has(`${tabla}:${columna}`)) throw new Error("Referencia interna no permitida.");
  const resultado = await conexion.query(
    `SELECT 1 FROM ${tabla} WHERE ${columna} = $1 AND activo = true LIMIT 1`,
    [valor],
  );
  if (!resultado.rowCount) throw new Error(`El ${etiqueta} seleccionado no existe o está inactivo.`);
}


export type DatosProveedor = ReturnType<typeof prepararProveedor>;

/** Valida y normaliza el cuerpo. Lanza Error con mensaje en español si algo no es válido. */
export function prepararProveedor(body: ProveedorBody) {
    const tipoPersona = body.tipoPersona === "FISICA" ? "FISICA" : "JURIDICA";
    const tipoDocumento = texto(body.tipoDocumento, 30).toUpperCase();
    const numeroDocumento = texto(body.numeroDocumento, 50).replace(/\s/g, "");
    const dv = opcional(body.dv, 1);
    const razonSocial = texto(body.razonSocial, 200);
    const paisCodigo = (texto(body.paisCodigo, 3).toUpperCase() || "PRY");
    const email = opcional(body.email, 150);
    const emailPagos = opcional(body.emailPagos, 150);
    const sitioWeb = opcional(body.sitioWeb, 300);

    if (!tipoDocumento) throw new Error("Seleccione el tipo de documento.");
    if (!numeroDocumento) throw new Error("Ingrese el número de documento.");
    if (!razonSocial) throw new Error("Ingrese el nombre o razón social del proveedor.");
    if (!/^[A-Z]{3}$/.test(paisCodigo)) throw new Error("Seleccione un país válido.");

    if (paisCodigo === "PRY" && tipoDocumento !== "RUC") {
      throw new Error("Un proveedor de Paraguay debe utilizar RUC como tipo de documento.");
    }
    if (tipoDocumento === "RUC") {
      if (!/^\d{3,8}$/.test(numeroDocumento)) throw new Error("El RUC debe contener entre 3 y 8 dígitos.");
      if (!dv || !/^\d$/.test(dv)) throw new Error("El DV del RUC debe contener exactamente un dígito.");
    }

    validarCorreo(email, "El correo electrónico");
    validarCorreo(emailPagos, "El correo para pagos");
    validarUrl(sitioWeb);

    const diaPagoPreferido = entero(body.diaPagoPreferido, "El día preferido de pago");
    const plazoEntregaDias = entero(body.plazoEntregaDias, "El plazo de entrega");
    const diasConfirmacionPedido = entero(body.diasConfirmacionPedido, "Los días de confirmación");
    const descuentoComercialPct = decimal(body.descuentoComercialPct, "El descuento comercial", 0) ?? 0;
    const montoMinimoCompra = decimal(body.montoMinimoCompra, "El monto mínimo de compra", 0) ?? 0;
    const calificacionActual = decimal(body.calificacionActual, "La calificación actual", null);

    if (diaPagoPreferido !== null && (diaPagoPreferido < 1 || diaPagoPreferido > 31)) {
      throw new Error("El día preferido de pago debe estar entre 1 y 31.");
    }
    if (plazoEntregaDias !== null && plazoEntregaDias < 0) throw new Error("El plazo de entrega no puede ser negativo.");
    if (diasConfirmacionPedido !== null && diasConfirmacionPedido < 0) throw new Error("Los días de confirmación no pueden ser negativos.");
    if (descuentoComercialPct < 0 || descuentoComercialPct > 100) throw new Error("El descuento comercial debe estar entre 0% y 100%.");
    if (montoMinimoCompra < 0) throw new Error("El monto mínimo de compra no puede ser negativo.");
    if (calificacionActual !== null && (calificacionActual < 0 || calificacionActual > 100)) throw new Error("La calificación debe estar entre 0 y 100.");

    const estadoHomologacion = (texto(body.estadoHomologacion).toUpperCase() || "PENDIENTE");
    const nivelRiesgo = (texto(body.nivelRiesgo).toUpperCase() || "NO_EVALUADO");
    const metodoTransporte = opcional(body.metodoTransportePreferido)?.toUpperCase() ?? null;
    if (!ESTADOS_HOMOLOGACION.has(estadoHomologacion)) throw new Error("El estado de homologación no es válido.");
    if (!NIVELES_RIESGO.has(nivelRiesgo)) throw new Error("El nivel de riesgo no es válido.");
    if (metodoTransporte && !METODOS_TRANSPORTE.has(metodoTransporte)) throw new Error("El método de transporte no es válido.");

    const fechaInicioRelacion = fecha(body.fechaInicioRelacion, "La fecha de inicio de relación");
    const fechaFinRelacion = fecha(body.fechaFinRelacion, "La fecha de fin de relación");
    const fechaHomologacion = fecha(body.fechaHomologacion, "La fecha de homologación");
    const fechaVencimientoHomologacion = fecha(body.fechaVencimientoHomologacion, "La fecha de vencimiento de homologación");
    if (fechaInicioRelacion && fechaFinRelacion && fechaFinRelacion < fechaInicioRelacion) throw new Error("La fecha de finalización no puede ser anterior a la fecha de inicio.");
    if (fechaHomologacion && fechaVencimientoHomologacion && fechaVencimientoHomologacion < fechaHomologacion) throw new Error("La fecha de vencimiento de homologación no puede ser anterior a la fecha de homologación.");

    const contactos = arreglo<ContactoInput>(body.contactos);
    const direcciones = arreglo<DireccionInput>(body.direcciones);
    const cuentasBancarias = arreglo<CuentaBancariaInput>(body.cuentasBancarias);
    const retenciones = arreglo<RetencionInput>(body.retenciones);
    const documentos = arreglo<DocumentoInput>(body.documentos);

    if (contactos.filter((c) => c.esPrincipal).length > 1) throw new Error("Solo puede existir un contacto principal.");
    if (cuentasBancarias.filter((c) => c.esPrincipal).length > 1) throw new Error("Solo puede existir una cuenta bancaria principal.");

    const principalesDireccion = new Set<string>();
    for (const direccion of direcciones) {
      const tipo = texto(direccion.tipo).toUpperCase();
      if (!TIPOS_DIRECCION.has(tipo)) throw new Error("Existe un tipo de dirección no válido.");
      if (direccion.esPrincipal) {
        if (principalesDireccion.has(tipo)) throw new Error(`Solo puede existir una dirección principal del tipo ${tipo}.`);
        principalesDireccion.add(tipo);
      }
      if (!texto(direccion.descripcion, 150) || !texto(direccion.direccion, 300)) throw new Error("Cada dirección requiere descripción y dirección.");
    }

    const grupoProveedorId = opcional(body.grupoProveedorId);
    const condicionPagoId = opcional(body.condicionPagoId);
    const monedaCodigo = opcional(body.monedaCodigoPredeterminada)?.toUpperCase() ?? null;
    const medioPagoId = opcional(body.medioPagoPreferidoId);
    const incotermCodigo = opcional(body.incotermCodigo)?.toUpperCase() ?? null;

    return {
      tipoPersona, tipoDocumento, numeroDocumento, dv, razonSocial, paisCodigo, email, emailPagos, sitioWeb,
      diaPagoPreferido, plazoEntregaDias, diasConfirmacionPedido, descuentoComercialPct, montoMinimoCompra,
      calificacionActual, estadoHomologacion, nivelRiesgo, metodoTransporte,
      fechaInicioRelacion, fechaFinRelacion, fechaHomologacion, fechaVencimientoHomologacion,
      contactos, direcciones, cuentasBancarias, retenciones, documentos,
      grupoProveedorId, condicionPagoId, monedaCodigo, medioPagoId, incotermCodigo,
      nombreFantasia: opcional(body.nombreFantasia, 200),
      telefono: opcional(body.telefono, 50),
      permiteAnticipos: booleano(body.permiteAnticipos),
      requiereOrdenCompra: booleano(body.requiereOrdenCompra),
      observacion: opcional(body.observacion, 2000),
      condicionEntrega: opcional(body.condicionEntrega, 500),
      permiteEntregaParcial: booleano(body.permiteEntregaParcial, true),
      activo: booleano(body.activo, true),
    };
}

/** Columnas editables de `proveedores` (mismo orden para INSERT y UPDATE). */
export function columnasProveedor(d: DatosProveedor): Array<[string, unknown]> {
  return [
    ["tipo_persona", d.tipoPersona],
    ["grupo_proveedor_id", d.grupoProveedorId],
    ["tipo_documento", d.tipoDocumento],
    ["numero_documento", d.numeroDocumento],
    ["dv", d.tipoDocumento === "RUC" ? d.dv : null],
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
    ["estado_homologacion", d.estadoHomologacion],
    ["fecha_homologacion", d.fechaHomologacion],
    ["fecha_vencimiento_homologacion", d.fechaVencimientoHomologacion],
    ["nivel_riesgo", d.nivelRiesgo],
    ["calificacion_actual", d.calificacionActual],
    ["incoterm_codigo", d.incotermCodigo],
    ["condicion_entrega", d.condicionEntrega],
    ["metodo_transporte_preferido", d.metodoTransporte],
    ["dias_confirmacion_pedido", d.diasConfirmacionPedido],
    ["permite_entrega_parcial", d.permiteEntregaParcial],
    ["activo", d.activo],
  ];
}

/** Verifica que las referencias de catálogo pertenezcan a la empresa de la sesión (o sean globales y activas). */
export async function validarReferencias(conexion: PoolClient, d: DatosProveedor, empresaId: string) {
  await validarReferenciaEmpresa(conexion, "grupos_proveedor", d.grupoProveedorId, empresaId, "grupo de proveedor");
  await validarReferenciaEmpresa(conexion, "medios_pago", d.medioPagoId, empresaId, "medio de pago");
  await validarReferenciaGlobal(conexion, "condiciones_pago", "id", d.condicionPagoId, "condición de pago");
  await validarReferenciaGlobal(conexion, "monedas", "codigo", d.monedaCodigo, "moneda");
  await validarReferenciaGlobal(conexion, "incoterms", "codigo", d.incotermCodigo, "Incoterm");
  await validarReferenciaGlobal(conexion, "referencia_geografica_paises", "codigo", d.paisCodigo, "país");
}

/** Inserta contactos, direcciones, cuentas, retenciones y documentos. empresa_id lo hereda un trigger del proveedor. */
export async function insertarHijos(conexion: PoolClient, proveedorId: string, d: DatosProveedor, usuarioId: string) {
  const { contactos, direcciones, cuentasBancarias, retenciones, documentos } = d;
    for (const [indice, contacto] of contactos.entries()) {
      const nombre = texto(contacto.nombre, 100);
      if (!nombre) throw new Error(`El contacto ${indice + 1} requiere nombre.`);
      const correo = opcional(contacto.email, 150);
      validarCorreo(correo, `El correo del contacto ${indice + 1}`);

      await conexion.query(
        `INSERT INTO proveedor_contactos (
           proveedor_id, nombre, apellido, cargo, departamento, telefono,
           celular, email, es_principal, recibe_cotizaciones,
           recibe_ordenes_compra, recibe_logistica, recibe_devoluciones,
           recibe_pagos, recibe_calidad, recibe_notificaciones
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          proveedorId,
          nombre,
          opcional(contacto.apellido, 100),
          opcional(contacto.cargo, 100),
          opcional(contacto.departamento, 100),
          opcional(contacto.telefono, 50),
          opcional(contacto.celular, 50),
          correo,
          booleano(contacto.esPrincipal),
          booleano(contacto.recibeCotizaciones),
          booleano(contacto.recibeOrdenesCompra),
          booleano(contacto.recibeLogistica),
          booleano(contacto.recibeDevoluciones),
          booleano(contacto.recibePagos),
          booleano(contacto.recibeCalidad),
          booleano(contacto.recibeNotificaciones, true),
        ],
      );
    }

    for (const [indice, direccion] of direcciones.entries()) {
      const tipo = texto(direccion.tipo).toUpperCase();
      const paisDireccion = (texto(direccion.paisCodigo, 3).toUpperCase() || d.paisCodigo);
      await validarReferenciaGlobal(conexion, "referencia_geografica_paises", "codigo", paisDireccion, `país de la dirección ${indice + 1}`);

      const departamentoCodigo = codigoGeografico(direccion.departamentoCodigo, "El departamento");
      const distritoCodigo = codigoGeografico(direccion.distritoCodigo, "El distrito");
      const ciudadCodigo = codigoGeografico(direccion.ciudadCodigo, "La ciudad");

      if (paisDireccion === "PRY" && (!departamentoCodigo || !distritoCodigo || !ciudadCodigo)) {
        throw new Error(`La dirección ${indice + 1} de Paraguay requiere departamento, distrito y ciudad.`);
      }

      await conexion.query(
        `INSERT INTO proveedor_direcciones (
           proveedor_id, tipo, descripcion, direccion, numero_casa,
           pais_codigo, departamento_codigo, distrito_codigo, ciudad_codigo,
           departamento, distrito, ciudad, codigo_postal, es_principal
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          proveedorId,
          tipo,
          texto(direccion.descripcion, 150),
          texto(direccion.direccion, 300),
          opcional(direccion.numeroCasa, 20),
          paisDireccion,
          paisDireccion === "PRY" ? departamentoCodigo : null,
          paisDireccion === "PRY" ? distritoCodigo : null,
          paisDireccion === "PRY" ? ciudadCodigo : null,
          paisDireccion === "PRY" ? null : opcional(direccion.departamento, 150),
          paisDireccion === "PRY" ? null : opcional(direccion.distrito, 150),
          paisDireccion === "PRY" ? null : opcional(direccion.ciudad, 150),
          opcional(direccion.codigoPostal, 30),
          booleano(direccion.esPrincipal),
        ],
      );
    }

    for (const [indice, cuenta] of cuentasBancarias.entries()) {
      const banco = texto(cuenta.banco, 150);
      const titular = texto(cuenta.titular, 200);
      const numeroCuenta = texto(cuenta.numeroCuenta, 100);
      const monedaCuenta = texto(cuenta.monedaCodigo, 3).toUpperCase();
      if (!banco || !titular || !numeroCuenta || !monedaCuenta) throw new Error(`La cuenta bancaria ${indice + 1} requiere banco, titular, número y moneda.`);
      await validarReferenciaGlobal(conexion, "monedas", "codigo", monedaCuenta, `moneda de la cuenta ${indice + 1}`);

      await conexion.query(
        `INSERT INTO proveedor_cuentas_bancarias (
           proveedor_id, banco, sucursal_banco, titular, documento_titular,
           tipo_cuenta, numero_cuenta, moneda_codigo, alias_cuenta,
           codigo_swift, iban, es_principal
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          proveedorId,
          banco,
          opcional(cuenta.sucursalBanco, 150),
          titular,
          opcional(cuenta.documentoTitular, 100),
          texto(cuenta.tipoCuenta).toUpperCase() || "CORRIENTE",
          numeroCuenta,
          monedaCuenta,
          opcional(cuenta.aliasCuenta, 100),
          opcional(cuenta.codigoSwift, 30),
          opcional(cuenta.iban, 50),
          booleano(cuenta.esPrincipal),
        ],
      );
    }

    for (const [indice, retencion] of retenciones.entries()) {
      const tipo = texto(retencion.tipo).toUpperCase();
      const porcentaje = decimal(retencion.porcentaje, `El porcentaje de retención ${indice + 1}`, null);
      if (!TIPOS_RETENCION.has(tipo)) throw new Error(`Seleccione el tipo de retención ${indice + 1}.`);
      if (porcentaje === null || porcentaje < 0 || porcentaje > 100) throw new Error(`El porcentaje de retención ${indice + 1} debe estar entre 0% y 100%.`);
      const desde = fecha(retencion.fechaVigenciaDesde, `La fecha inicial de retención ${indice + 1}`);
      const hasta = fecha(retencion.fechaVigenciaHasta, `La fecha final de retención ${indice + 1}`);
      if (desde && hasta && hasta < desde) throw new Error(`La vigencia de la retención ${indice + 1} no es válida.`);

      await conexion.query(
        `INSERT INTO proveedor_retenciones (
           proveedor_id, tipo, impuesto_id, porcentaje, certificado_obligatorio,
           fecha_vigencia_desde, fecha_vigencia_hasta, observacion
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          proveedorId,
          tipo,
          opcional(retencion.impuestoId),
          porcentaje,
          booleano(retencion.certificadoObligatorio),
          desde,
          hasta,
          opcional(retencion.observacion, 1000),
        ],
      );
    }

    for (const [indice, documento] of documentos.entries()) {
      const tipo = texto(documento.tipo).toUpperCase();
      const nombreArchivo = texto(documento.nombreArchivo, 255);
      const urlArchivo = texto(documento.urlArchivo);
      if (!TIPOS_DOCUMENTO.has(tipo)) throw new Error(`Seleccione el tipo del documento ${indice + 1}.`);
      if (!nombreArchivo || !urlArchivo) throw new Error(`El documento ${indice + 1} requiere nombre y URL del archivo.`);
      const desde = fecha(documento.fechaEmision, `La fecha de emisión del documento ${indice + 1}`);
      const hasta = fecha(documento.fechaVencimiento, `La fecha de vencimiento del documento ${indice + 1}`);
      if (desde && hasta && hasta < desde) throw new Error(`La vigencia del documento ${indice + 1} no es válida.`);

      await conexion.query(
        `INSERT INTO proveedor_documentos (
           proveedor_id, tipo, nombre_archivo, url_archivo, fecha_emision,
           fecha_vencimiento, observacion, cargado_por
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          proveedorId,
          tipo,
          nombreArchivo,
          urlArchivo,
          desde,
          hasta,
          opcional(documento.observacion, 1000),
          usuarioId,
        ],
      );
    }
}

export function respuestaError(error: unknown, accion: string) {
  console.error(`Error al ${accion} proveedor:`, error);

  const pgError = error as { code?: string; constraint?: string; message?: string };
  if (pgError.code === "23505") {
    const constraint = pgError.constraint ?? "";
    let mensaje = "Existe un registro duplicado.";
    if (constraint.includes("empresa_documento")) mensaje = "Ya existe un proveedor con ese tipo y número de documento.";
    else if (constraint.includes("cuentas_bancarias_numero")) mensaje = "La cuenta bancaria ya está registrada para este proveedor.";
    else if (constraint.includes("contactos_uno_principal")) mensaje = "Solo puede existir un contacto principal.";
    else if (constraint.includes("direcciones_uno_principal")) mensaje = "Solo puede existir una dirección principal por tipo.";
    else if (constraint.includes("cuentas_bancarias_uno_principal")) mensaje = "Solo puede existir una cuenta bancaria principal.";
    return NextResponse.json({ error: mensaje }, { status: 409 });
  }
  if (pgError.code === "23503") {
    return NextResponse.json({ error: "Existe una referencia relacionada que no es válida o ya no está disponible." }, { status: 400 });
  }
  if (pgError.code === "23514" || pgError.code === "P0001" || pgError.code === "22P02" || pgError.code === "22007" || pgError.code === "22003") {
    return NextResponse.json({ error: "Los datos enviados no cumplen las reglas del proveedor." }, { status: 400 });
  }
  if (pgError.code) {
    return NextResponse.json({ error: `No fue posible ${accion} el proveedor.` }, { status: 500 });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : `No fue posible ${accion} el proveedor.` },
    { status: 400 },
  );
}
