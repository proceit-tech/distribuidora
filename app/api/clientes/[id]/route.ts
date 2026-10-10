import { NextResponse } from "next/server";

import { denyIfNoPermission } from "@/lib/auth/permissions";
import { ErrorValidacion, leerEntrada, leerHijos, sincronizarHijos } from "@/lib/clientes/relacionados";

type Contexto = { params: Promise<{ id: string }> };
type Json = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NATURALEZA = { CONTRIBUYENTE: 1, NO_CONTRIBUYENTE: 2 } as const;
const OPERACION = { B2B: 1, B2C: 2, B2G: 3, B2F: 4 } as const;
const CONTRIBUYENTE = { FISICA: 1, JURIDICA: 2 } as const;
const DOC_SIFEN = {
  CEDULA_PARAGUAYA: 1,
  PASAPORTE: 2,
  CEDULA_EXTRANJERA: 3,
  CARNET_RESIDENCIA: 4,
  INNOMINADO: 5,
  TARJETA_DIPLOMATICA: 6,
  OTRO: 9,
} as const;
const FRECUENCIAS = new Set(["DIARIA", "SEMANAL", "QUINCENAL", "MENSUAL", "A_DEMANDA"]);
const REFERENCIAS = {
  grupoClienteId: ["grupos_cliente", "grupo de cliente"],
  listaPrecioId: ["listas_precio", "lista de precios"],
  rutaEntregaId: ["rutas_entrega", "ruta de entrega"],
  zonaComercialId: ["zonas_comerciales", "zona comercial"],
  vendedorId: ["vendedores", "vendedor"],
  canalVentaId: ["canales_venta", "canal de venta"],
} as const;

// Solo DEMO explícito usa respuestas simuladas; sin DATABASE_URL se responde 503.
const DEMO_MODE = process.env.DEMO_MODE === "true";

function texto(v: unknown, max?: number) {
  if (typeof v !== "string") return "";
  const r = v.trim();
  return max ? r.slice(0, max) : r;
}
const opcional = (v: unknown, max?: number) => texto(v, max) || null;
function numero(v: unknown, min?: number, max?: number) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error("Uno de los valores numéricos informados no es válido.");
  if (min !== undefined && n < min) throw new Error(`El valor debe ser igual o mayor a ${min}.`);
  if (max !== undefined && n > max) throw new Error(`El valor debe ser igual o menor a ${max}.`);
  return n;
}
function correo(v: string | null, etiqueta: string) {
  if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error(`${etiqueta} no tiene un formato válido.`);
}
function fechaIso(v: unknown) {
  const f = texto(v);
  if (!f) return null;
  const m = f.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) throw new Error("La fecha de vencimiento del crédito debe tener el formato dd/mm/yyyy.");
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  if (d.getUTCFullYear() !== +m[3] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[1]) {
    throw new Error("La fecha de vencimiento del crédito no es válida.");
  }
  return `${m[3]}-${m[2]}-${m[1]}`;
}
function dias(v: unknown) {
  if (!Array.isArray(v) || v.length === 0) return null;
  const d = [...new Set(v.map(Number))].sort((a, b) => a - b);
  if (d.some((x) => !Number.isInteger(x) || x < 1 || x > 7)) throw new Error("Los días de entrega deben estar entre 1 y 7.");
  return d;
}

function sinBase() {
  return NextResponse.json(
    { error: "Servicio no disponible: base de datos no configurada." },
    { status: 503 },
  );
}

async function sesion() {
  const { getCurrentSession } = await import("@/lib/auth/session");
  return getCurrentSession();
}

const NO_SESION = () => NextResponse.json({ error: "Sesión no válida." }, { status: 401 });

export async function GET(_request: Request, contexto: Contexto) {
  if (!DEMO_MODE && !process.env.DATABASE_URL) return sinBase();
  if (DEMO_MODE) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

  const { id } = await contexto.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

  const session = await sesion();
  if (!session) return NO_SESION();
  const denegado = await denyIfNoPermission(session, "CLIENTES", "VER");
  if (denegado) return denegado;

  try {
    const { db } = await import("@/lib/db");
    const r = await db.query(
      `SELECT c.id, c.codigo, c.naturaleza_receptor, c.tipo_operacion, c.tipo_persona,
              c.pais_codigo, c.pais_nombre, c.tipo_documento, c.descripcion_documento_identidad,
              c.numero_documento, c.dv, c.razon_social, c.nombre_fantasia,
              c.email, c.email_copia, c.telefono, c.celular,
              c.limite_credito, c.limite_credito_temporal,
              to_char(c.fecha_vencimiento_credito, 'DD/MM/YYYY') AS fecha_vencimiento_credito,
              c.grupo_cliente_id, c.condicion_pago_id, c.moneda_codigo_predeterminada,
              c.lista_precio_id, c.canal_venta_id, c.vendedor_id,
              c.codigo_externo, c.gln, c.descuento_comercial_pct,
              c.bloqueado_ventas, c.motivo_bloqueo_ventas, c.dia_preferido_cobro,
              c.requiere_orden_compra, c.email_facturacion, c.email_cobranzas,
              c.recibe_documento_electronico, c.ruta_entrega_id, c.zona_comercial_id,
              c.frecuencia_entrega, c.dias_entrega, c.observacion_comercial, c.observacion_logistica,
              c.activo, c.creado_at, c.actualizado_at
         FROM clientes c
        WHERE c.id = $1 AND c.empresa_id = $2`,
      [id, session.user.empresaId],
    );
    const c = r.rows[0];
    if (!c) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
    const hijos = await leerHijos(db, session.user.empresaId, id);

    return NextResponse.json({
      cliente: {
        id: c.id,
        codigo: c.codigo,
        naturaleza: c.naturaleza_receptor === 1 ? "CONTRIBUYENTE" : "NO_CONTRIBUYENTE",
        tipoOperacion: (["", "B2B", "B2C", "B2G", "B2F"] as const)[c.tipo_operacion] ?? "B2C",
        tipoPersona: c.tipo_persona,
        paisCodigo: c.pais_codigo,
        paisNombre: c.pais_nombre ?? "",
        tipoDocumento: c.tipo_documento,
        descripcionDocumentoIdentidad: c.descripcion_documento_identidad ?? "",
        numeroDocumento: c.numero_documento,
        dv: c.dv ?? "",
        razonSocial: c.razon_social,
        nombreFantasia: c.nombre_fantasia ?? "",
        email: c.email ?? "",
        emailCopia: c.email_copia ?? "",
        telefono: c.telefono ?? "",
        celular: c.celular ?? "",
        limiteCredito: Number(c.limite_credito),
        limiteCreditoTemporal: c.limite_credito_temporal === null ? "" : String(Number(c.limite_credito_temporal)),
        fechaVencimientoCredito: c.fecha_vencimiento_credito ?? "",
        grupoClienteId: c.grupo_cliente_id ?? "",
        condicionPagoId: c.condicion_pago_id ?? "",
        monedaCodigoPredeterminada: c.moneda_codigo_predeterminada ?? "",
        listaPrecioId: c.lista_precio_id ?? "",
        canalVentaId: c.canal_venta_id ?? "",
        vendedorId: c.vendedor_id ?? "",
        codigoExterno: c.codigo_externo ?? "",
        gln: c.gln ?? "",
        descuentoComercialPct: Number(c.descuento_comercial_pct),
        bloqueadoVentas: c.bloqueado_ventas,
        motivoBloqueoVentas: c.motivo_bloqueo_ventas ?? "",
        diaPreferidoCobro: c.dia_preferido_cobro,
        requiereOrdenCompra: c.requiere_orden_compra,
        emailFacturacion: c.email_facturacion ?? "",
        emailCobranzas: c.email_cobranzas ?? "",
        recibeDocumentoElectronico: c.recibe_documento_electronico,
        rutaEntregaId: c.ruta_entrega_id ?? "",
        zonaComercialId: c.zona_comercial_id ?? "",
        frecuenciaEntrega: c.frecuencia_entrega ?? "",
        diasEntrega: (c.dias_entrega ?? []).map(Number),
        observacionComercial: c.observacion_comercial ?? "",
        observacionLogistica: c.observacion_logistica ?? "",
        activo: c.activo,
        creadoEn: c.creado_at,
        actualizadoEn: c.actualizado_at,
      },
      ...hijos,
    });
  } catch (error) {
    console.error("Error al cargar el cliente:", error);
    return NextResponse.json({ error: "No fue posible cargar el cliente." }, { status: 500 });
  }
}

export async function PUT(request: Request, contexto: Contexto) {
  if (!DEMO_MODE && !process.env.DATABASE_URL) return sinBase();
  if (DEMO_MODE) return NextResponse.json({ error: "Edición no disponible en modo DEMO." }, { status: 405 });

  const { id } = await contexto.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

  const session = await sesion();
  if (!session) return NO_SESION();
  const denegado = await denyIfNoPermission(session, "CLIENTES", "EDITAR");
  if (denegado) return denegado;

  let cuerpo: Json;
  try {
    cuerpo = (await request.json()) as Json;
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const empresaId = session.user.empresaId; // SIEMPRE de la sesión; nunca del cuerpo
  const { db } = await import("@/lib/db");
  const conexion = await db.connect();

  try {
    const naturaleza = texto(cuerpo.naturaleza).toUpperCase();
    const tipoOperacion = texto(cuerpo.tipoOperacion).toUpperCase();
    const tipoPersona = texto(cuerpo.tipoPersona).toUpperCase();
    const tipoDocumento = texto(cuerpo.tipoDocumento).toUpperCase();
    const numeroDocumento = texto(cuerpo.numeroDocumento, 30);
    const dv = texto(cuerpo.dv, 5);
    const razonSocial = texto(cuerpo.razonSocial, 200);
    const paisCodigo = texto(cuerpo.paisCodigo, 3).toUpperCase();
    const paisNombre = texto(cuerpo.paisNombre, 60);
    const descDoc = opcional(cuerpo.descripcionDocumentoIdentidad, 100);
    const limiteTemporal = numero(cuerpo.limiteCreditoTemporal, 0);
    const vencimiento = fechaIso(cuerpo.fechaVencimientoCredito);
    const frecuencia = opcional(cuerpo.frecuenciaEntrega)?.toUpperCase() ?? null;
    const email = opcional(cuerpo.email, 150);
    const emailCopia = opcional(cuerpo.emailCopia, 150);
    const emailFacturacion = opcional(cuerpo.emailFacturacion, 150);
    const emailCobranzas = opcional(cuerpo.emailCobranzas, 150);
    const bloqueado = cuerpo.bloqueadoVentas === true;
    const motivo = opcional(cuerpo.motivoBloqueoVentas, 500);

    if (!(naturaleza in NATURALEZA)) throw new Error("Seleccione la naturaleza del cliente.");
    if (!(tipoOperacion in OPERACION)) throw new Error("Seleccione un tipo de operación válido.");
    if (!(tipoPersona in CONTRIBUYENTE)) throw new Error("Seleccione el tipo de contribuyente.");
    if (!paisCodigo) throw new Error("Informe el país del cliente.");
    if (!razonSocial) throw new Error("Informe el nombre o razón social del cliente.");
    if (naturaleza === "CONTRIBUYENTE") {
      if (!numeroDocumento || !dv) throw new Error("Para un contribuyente informe RUC y DV.");
    } else {
      if (!(tipoDocumento in DOC_SIFEN)) throw new Error("Seleccione el tipo de documento del cliente.");
      if (!numeroDocumento) throw new Error("Informe el número de documento del cliente.");
      if (tipoDocumento === "OTRO" && !descDoc) throw new Error("Describa el tipo de documento seleccionado como Otro.");
    }
    if (vencimiento && limiteTemporal === null) {
      throw new Error("Para informar vencimiento, indique también un límite de crédito temporal.");
    }
    if (frecuencia && !FRECUENCIAS.has(frecuencia)) throw new Error("La frecuencia de entrega no es válida.");
    if (bloqueado && !motivo) throw new Error("Informe el motivo del bloqueo de ventas.");
    correo(email, "El correo electrónico principal");
    correo(emailCopia, "El correo electrónico de copia");
    correo(emailFacturacion, "El correo de facturación");
    correo(emailCobranzas, "El correo de cobranzas");

    // Referencias: deben pertenecer a la empresa de la sesión y estar activas.
    const refs: Record<string, string | null> = {};
    for (const [campo, [tabla, etiqueta]] of Object.entries(REFERENCIAS)) {
      const valor = opcional(cuerpo[campo]);
      refs[campo] = valor;
      if (!valor) continue;
      if (!UUID.test(valor)) throw new Error(`El valor seleccionado para ${etiqueta} no está disponible.`);
      const ok = await conexion.query(
        `SELECT 1 FROM ${tabla} WHERE id = $1 AND empresa_id = $2 AND activo = true`,
        [valor, empresaId],
      );
      if (ok.rowCount !== 1) throw new Error(`El valor seleccionado para ${etiqueta} no está disponible.`);
    }
    const condicionPagoId = opcional(cuerpo.condicionPagoId);
    if (condicionPagoId && !UUID.test(condicionPagoId)) throw new Error("La condición de pago no es válida.");

    const entradaHijos = leerEntrada(cuerpo);
    await conexion.query("BEGIN");

    const actual = await conexion.query(
      "SELECT bloqueado_ventas FROM clientes WHERE id = $1 AND empresa_id = $2 FOR UPDATE",
      [id, empresaId],
    );
    if (actual.rowCount !== 1) {
      await conexion.query("ROLLBACK");
      return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
    }
    const estabaBloqueado = actual.rows[0].bloqueado_ventas === true;

    const duplicado = await conexion.query(
      `SELECT 1 FROM clientes
        WHERE empresa_id = $1 AND id <> $2 AND tipo_documento = $3
          AND numero_documento = $4 AND COALESCE(dv, '') = COALESCE($5, '')`,
      [empresaId, id, naturaleza === "CONTRIBUYENTE" ? "RUC" : tipoDocumento, numeroDocumento,
        naturaleza === "CONTRIBUYENTE" ? dv : null],
    );
    if (duplicado.rowCount) throw new Error("Ya existe otro cliente con esa identificación.");

    await conexion.query(
      `UPDATE clientes SET
         naturaleza_receptor = $3, tipo_operacion = $4, pais_codigo = $5, pais_nombre = $6,
         tipo_persona = $7, tipo_contribuyente_sifen = $8, tipo_documento = $9,
         tipo_documento_identidad_sifen = $10, descripcion_documento_identidad = $11,
         numero_documento = $12, dv = $13, razon_social = $14, nombre_fantasia = $15,
         email = $16, email_copia = $17, telefono = $18, celular = $19,
         limite_credito = $20, condicion_pago_id = $21, lista_precio_id = $22, grupo_cliente_id = $23,
         moneda_codigo_predeterminada = $24, canal_venta_id = $25, codigo_externo = $26, gln = $27,
         descuento_comercial_pct = $28, limite_credito_temporal = $29, fecha_vencimiento_credito = $30,
         bloqueado_ventas = $31::boolean, motivo_bloqueo_ventas = $32,
         bloqueado_ventas_at = CASE WHEN NOT $31::boolean THEN NULL
                                    WHEN $33::boolean THEN bloqueado_ventas_at ELSE now() END,
         bloqueado_ventas_por = CASE WHEN NOT $31::boolean THEN NULL
                                     WHEN $33::boolean THEN bloqueado_ventas_por ELSE $34::uuid END,
         dia_preferido_cobro = $35, ruta_entrega_id = $36, zona_comercial_id = $37, vendedor_id = $38,
         frecuencia_entrega = $39, dias_entrega = $40, requiere_orden_compra = $41,
         email_facturacion = $42, email_cobranzas = $43, recibe_documento_electronico = $44,
         observacion_comercial = $45, observacion_logistica = $46, activo = $47
       WHERE id = $1 AND empresa_id = $2`,
      [
        id, empresaId,
        NATURALEZA[naturaleza as keyof typeof NATURALEZA],
        OPERACION[tipoOperacion as keyof typeof OPERACION],
        paisCodigo, paisNombre || paisCodigo,
        tipoPersona, CONTRIBUYENTE[tipoPersona as keyof typeof CONTRIBUYENTE],
        naturaleza === "CONTRIBUYENTE" ? "RUC" : tipoDocumento,
        naturaleza === "CONTRIBUYENTE" ? null : DOC_SIFEN[tipoDocumento as keyof typeof DOC_SIFEN],
        naturaleza === "CONTRIBUYENTE" ? null : descDoc,
        numeroDocumento, naturaleza === "CONTRIBUYENTE" ? dv : null,
        razonSocial, opcional(cuerpo.nombreFantasia, 200),
        email, emailCopia, opcional(cuerpo.telefono, 30), opcional(cuerpo.celular, 30),
        numero(cuerpo.limiteCredito, 0) ?? 0,
        condicionPagoId, refs.listaPrecioId, refs.grupoClienteId,
        opcional(cuerpo.monedaCodigoPredeterminada, 3)?.toUpperCase() ?? null,
        refs.canalVentaId, opcional(cuerpo.codigoExterno, 100), opcional(cuerpo.gln, 13),
        numero(cuerpo.descuentoComercialPct, 0, 100) ?? 0,
        limiteTemporal, vencimiento,
        bloqueado, motivo, estabaBloqueado, session.user.id,
        numero(cuerpo.diaPreferidoCobro, 1, 31),
        refs.rutaEntregaId, refs.zonaComercialId, refs.vendedorId,
        frecuencia, dias(cuerpo.diasEntrega), cuerpo.requiereOrdenCompra === true,
        emailFacturacion, emailCobranzas, cuerpo.recibeDocumentoElectronico !== false,
        opcional(cuerpo.observacionComercial, 1000), opcional(cuerpo.observacionLogistica, 1000),
        cuerpo.activo !== false,
      ],
    );

    // Contactos, direcciones y documentos: misma transacción, mismo empresa_id.
    const resumen = await sincronizarHijos(conexion, empresaId, id, session.user.id, entradaHijos);

    await conexion.query("COMMIT");
    return NextResponse.json({ ok: true, id, hijos: resumen });
  } catch (error) {
    await conexion.query("ROLLBACK").catch(() => undefined);
    const pg = error as { code?: string };
    if (pg.code === "23505") {
      return NextResponse.json({ error: "Ya existe un cliente con esa identificación o código externo." }, { status: 409 });
    }
    if (pg.code && /^(22|23)/.test(pg.code)) {
      return NextResponse.json({ error: "Los datos informados no cumplen las reglas del cliente." }, { status: 400 });
    }
    if (error instanceof ErrorValidacion || (error instanceof Error && !pg.code)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error al actualizar el cliente:", error);
    return NextResponse.json({ error: "No fue posible actualizar el cliente." }, { status: 500 });
  } finally {
    conexion.release();
  }
}
