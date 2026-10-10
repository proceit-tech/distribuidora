import { NextResponse } from "next/server";

import { denyIfNoPermission } from "@/lib/auth/permissions";
import type { PoolClient } from "pg";

import {
  columnasProveedor,
  insertarHijos,
  prepararProveedor,
  respuestaError,
  texto,
  validarReferencias,
  type ProveedorBody,
} from "@/lib/proveedores/shared";


// Solo DEMO explícito usa respuestas simuladas. La falta de DATABASE_URL NUNCA activa datos ficticios.
const DEMO_MODE = process.env.DEMO_MODE === "true";

function errorConfiguracion() {
  return NextResponse.json(
    { error: "Servicio no disponible: base de datos no configurada." },
    { status: 503 },
  );
}

async function obtenerSesionActual() {
  const { getCurrentSession } = await import("@/lib/auth/session");
  return getCurrentSession();
}

async function obtenerDb() {
  const { db } = await import("@/lib/db");
  return db;
}

function respuestaProveedoresDemo(url: URL) {
  const catalogo = url.searchParams.get("catalogo");

  if (catalogo) {
    return NextResponse.json({
      catalogo,
      datos: [],
      demo: true,
    });
  }

  return NextResponse.json({
    proveedores: [],
    catalogos: {
      grupos: [],
      gruposProveedor: [],
      condicionesPago: [],
      monedas: [],
      mediosPago: [],
      paises: [],
      incoterms: [],
      departamentos: [],
    },
    demo: true,
  });
}

function crearProveedorDemo(body: ProveedorBody) {
  const codigo = `PRV-DEMO-${Date.now()}`;

  return {
    id: `demo-proveedor-${Date.now()}`,
    codigo,
    razon_social:
      texto(body.razonSocial, 200) ||
      "Proveedor demo",
    pais_codigo:
      texto(body.paisCodigo, 3).toUpperCase() ||
      "PRY",
    estado_homologacion:
      texto(body.estadoHomologacion).toUpperCase() ||
      "PENDIENTE",
  };
}

async function catalogoGeografico(
  url: URL,
  db: Awaited<ReturnType<typeof obtenerDb>>,
) {
  const catalogo = url.searchParams.get("catalogo");
  if (!catalogo) return null;

  if (catalogo === "paises") {
    const resultado = await db.query(
      `SELECT codigo, nombre FROM referencia_geografica_paises WHERE activo = true ORDER BY nombre`,
    );
    return NextResponse.json({ catalogo, datos: resultado.rows });
  }

  if (catalogo === "departamentos") {
    const resultado = await db.query(
      `SELECT codigo, nombre FROM referencia_geografica_departamentos WHERE activo = true ORDER BY nombre`,
    );
    return NextResponse.json({ catalogo, datos: resultado.rows });
  }

  const departamento = Number(url.searchParams.get("departamento"));
  if (!Number.isInteger(departamento) || departamento <= 0) {
    return NextResponse.json({ error: "Informe un departamento válido." }, { status: 400 });
  }

  if (catalogo === "distritos") {
    const resultado = await db.query(
      `SELECT codigo, nombre, departamento_codigo
       FROM referencia_geografica_distritos
       WHERE departamento_codigo = $1 AND activo = true
       ORDER BY nombre`,
      [departamento],
    );
    return NextResponse.json({ catalogo, datos: resultado.rows });
  }

  if (catalogo === "ciudades") {
    const distrito = Number(url.searchParams.get("distrito"));
    if (!Number.isInteger(distrito) || distrito <= 0) {
      return NextResponse.json({ error: "Informe un distrito válido." }, { status: 400 });
    }
    const resultado = await db.query(
      `SELECT codigo, nombre, departamento_codigo, distrito_codigo
       FROM referencia_geografica_ciudades
       WHERE departamento_codigo = $1 AND distrito_codigo = $2 AND activo = true
       ORDER BY nombre`,
      [departamento, distrito],
    );
    return NextResponse.json({ catalogo, datos: resultado.rows });
  }

  return NextResponse.json({ error: "Catálogo geográfico no válido." }, { status: 400 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (!DEMO_MODE && !process.env.DATABASE_URL) {
    return errorConfiguracion();
  }

  if (DEMO_MODE) {
    return respuestaProveedoresDemo(url);
  }

  const session = await obtenerSesionActual();

  if (!session) {
    return NextResponse.json(
      { error: "Su sesión ha finalizado." },
      { status: 401 },
    );
  }

  const denegadoVer = await denyIfNoPermission(session, "PROVEEDORES", "VER");
  if (denegadoVer) return denegadoVer;

  const db = await obtenerDb();

  try {
    const respuestaGeografica = await catalogoGeografico(url, db);
    if (respuestaGeografica) return respuestaGeografica;

    const soloCatalogos = url.searchParams.get("modo") === "catalogos";
    const empresaId = session.user.empresaId;

    const proveedoresConsulta = soloCatalogos
      ? Promise.resolve({ rows: [] as unknown[] })
      : db.query(
          `SELECT
             p.id,
             p.codigo,
             p.tipo_persona,
             p.tipo_documento,
             p.numero_documento,
             p.dv,
             p.razon_social,
             p.nombre_fantasia,
             p.email,
             p.telefono,
             p.pais_codigo,
             p.pais_nombre,
             p.plazo_entrega_dias,
             p.descuento_comercial_pct,
             p.monto_minimo_compra,
             p.permite_anticipos,
             p.requiere_orden_compra,
             p.dia_pago_preferido,
             p.email_pagos,
             p.sitio_web,
             p.fecha_inicio_relacion,
             p.fecha_fin_relacion,
             p.estado_homologacion,
             p.fecha_homologacion,
             p.fecha_vencimiento_homologacion,
             p.nivel_riesgo,
             p.calificacion_actual,
             p.incoterm_codigo,
             i.nombre AS incoterm_nombre,
             p.condicion_entrega,
             p.metodo_transporte_preferido,
             p.dias_confirmacion_pedido,
             p.permite_entrega_parcial,
             p.bloqueado,
             p.motivo_bloqueo,
             p.activo,
             gp.nombre AS grupo_nombre,
             cp.nombre AS condicion_pago_nombre,
             p.moneda_codigo_predeterminada,
             mo.nombre AS moneda_nombre,
             mp.nombre AS medio_pago_nombre
           FROM proveedores p
           LEFT JOIN grupos_proveedor gp ON gp.id = p.grupo_proveedor_id
           LEFT JOIN condiciones_pago cp ON cp.id = p.condicion_pago_id
           LEFT JOIN monedas mo ON mo.codigo = p.moneda_codigo_predeterminada
           LEFT JOIN medios_pago mp ON mp.id = p.medio_pago_preferido_id
           LEFT JOIN incoterms i ON i.codigo = p.incoterm_codigo
           WHERE p.empresa_id = $1
           ORDER BY p.razon_social ASC`,
          [empresaId],
        );

    const [proveedores, grupos, condicionesPago, monedas, mediosPago, paises, incoterms, departamentos] =
      await Promise.all([
        proveedoresConsulta,
        db.query(
          `SELECT id, codigo, nombre
           FROM grupos_proveedor
           WHERE empresa_id = $1 AND activo = true
           ORDER BY nombre`,
          [empresaId],
        ),
        db.query(
          `SELECT id, codigo, nombre, dias_vencimiento
           FROM condiciones_pago
           WHERE activo = true
           ORDER BY dias_vencimiento, nombre`,
        ),
        db.query(
          `SELECT codigo, nombre, simbolo
           FROM monedas
           WHERE activo = true
           ORDER BY codigo`,
        ),
        db.query(
          `SELECT id, codigo, nombre, tipo
           FROM medios_pago
           WHERE empresa_id = $1 AND activo = true
           ORDER BY nombre`,
          [empresaId],
        ),
        db.query(
          `SELECT codigo, nombre
           FROM referencia_geografica_paises
           WHERE activo = true
           ORDER BY nombre`,
        ),
        db.query(
          `SELECT codigo, nombre
           FROM incoterms
           WHERE activo = true
           ORDER BY codigo`,
        ),
        db.query(
          `SELECT codigo, nombre
           FROM referencia_geografica_departamentos
           WHERE activo = true
           ORDER BY nombre`,
        ),
      ]);

    return NextResponse.json({
      proveedores: proveedores.rows,
      catalogos: {
        grupos: grupos.rows,
        gruposProveedor: grupos.rows,
        condicionesPago: condicionesPago.rows,
        monedas: monedas.rows,
        mediosPago: mediosPago.rows,
        paises: paises.rows,
        incoterms: incoterms.rows,
        departamentos: departamentos.rows,
      },
    });
  } catch (error) {
    console.error("Error al consultar proveedores:", error);
    return NextResponse.json({ error: "No fue posible cargar los proveedores." }, { status: 500 });
  }
}


export async function POST(request: Request) {
  let body: ProveedorBody;

  try {
    body = (await request.json()) as ProveedorBody;
  } catch {
    return NextResponse.json(
      { error: "Los datos enviados no son válidos." },
      { status: 400 },
    );
  }

  if (!DEMO_MODE && !process.env.DATABASE_URL) {
    return errorConfiguracion();
  }

  if (DEMO_MODE) {
    const proveedor = crearProveedorDemo(body);

    return NextResponse.json(
      {
        message: `Proveedor ${proveedor.codigo} registrado correctamente en modo demo.`,
        proveedor,
        demo: true,
      },
      { status: 201 },
    );
  }

  const session = await obtenerSesionActual();

  if (!session) {
    return NextResponse.json(
      { error: "Su sesión ha finalizado." },
      { status: 401 },
    );
  }

  const denegadoCrear = await denyIfNoPermission(session, "PROVEEDORES", "CREAR");
  if (denegadoCrear) return denegadoCrear;

  const db = await obtenerDb();
  let conexion: PoolClient | null = null;

  try {
    const datos = prepararProveedor(body);
    const empresaId = session.user.empresaId;

    conexion = await db.connect();
    await conexion.query("BEGIN");
    await validarReferencias(conexion, datos, empresaId);

    const columnas = columnasProveedor(datos);
    const nombres = ["empresa_id", "creado_por", ...columnas.map(([nombre]) => nombre)];
    const valores = [empresaId, session.user.id, ...columnas.map(([, valor]) => valor)];
    const marcadores = valores.map((_, i) => `$${i + 1}`).join(",");

    const insertado = await conexion.query(
      `INSERT INTO proveedores (${nombres.join(",")}) VALUES (${marcadores})
       RETURNING id, codigo, razon_social, pais_codigo, pais_nombre, estado_homologacion`,
      valores,
    );
    const proveedor = insertado.rows[0] as { id: string; codigo: string };

    await insertarHijos(conexion, proveedor.id, datos, session.user.id);

    await conexion.query("COMMIT");
    return NextResponse.json(
      { message: `Proveedor ${proveedor.codigo} registrado correctamente.`, proveedor },
      { status: 201 },
    );
  } catch (error) {
    if (conexion) await conexion.query("ROLLBACK").catch(() => undefined);
    return respuestaError(error, "registrar");
  } finally {
    conexion?.release();
  }
}
