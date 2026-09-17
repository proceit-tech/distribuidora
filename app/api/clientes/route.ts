import type { PoolClient } from "pg";
import { NextResponse } from "next/server";


const DEMO_MODE =
  process.env.DEMO_MODE === "true" ||
  !process.env.DATABASE_URL;

async function obtenerSesionActual() {
  const { getCurrentSession } = await import("@/lib/auth/session");
  return getCurrentSession();
}

async function obtenerDb() {
  const { db } = await import("@/lib/db");
  return db;
}

function respuestaDemoCatalogos(url: URL) {
  const catalogo = url.searchParams.get("catalogo");

  if (catalogo) {
    return NextResponse.json({
      catalogo,
      datos: [],
      demo: true,
    });
  }

  return NextResponse.json({
    clientes: [],
    catalogos: {
      grupos: [],
      condicionesPago: [],
      monedas: [],
      listasPrecio: [],
      rutasEntrega: [],
      zonasComerciales: [],
      vendedores: [],
      canalesVenta: [],
      departamentosParaguay: [],
    },
    demo: true,
  });
}

function crearClienteDemo(cuerpo: JsonObject) {
  const numeroDocumento = texto(cuerpo.numeroDocumento, 30);
  const razonSocial = texto(cuerpo.razonSocial, 200);
  const codigo =
    texto(cuerpo.codigo, 50) ||
    `CLI-DEMO-${Date.now()}`;

  return {
    id: `demo-cliente-${Date.now()}`,
    codigo,
    razon_social: razonSocial || "Cliente demo",
    numero_documento: numeroDocumento,
  };
}


type JsonObject = Record<string, unknown>;

type ContactoEntrada = {
  nombre?: unknown;
  apellido?: unknown;
  cargo?: unknown;
  departamento?: unknown;
  telefono?: unknown;
  celular?: unknown;
  email?: unknown;
  esPrincipal?: unknown;
  recibePedidos?: unknown;
  recibeFacturacion?: unknown;
  recibeCobranzas?: unknown;
  recibeDocumentosElectronicos?: unknown;
  recibeNotificaciones?: unknown;
};

type DireccionEntrada = {
  tipo?: unknown;
  etiqueta?: unknown;
  direccion?: unknown;
  numeroCasa?: unknown;
  complemento?: unknown;
  paisCodigo?: unknown;
  paisNombre?: unknown;
  departamentoCodigo?: unknown;
  departamento?: unknown;
  distritoCodigo?: unknown;
  distrito?: unknown;
  ciudadCodigo?: unknown;
  ciudad?: unknown;
  codigoPostal?: unknown;
  contactoNombre?: unknown;
  contactoTelefono?: unknown;
  horarioRecepcion?: unknown;
  observacion?: unknown;
  esFiscal?: unknown;
  esEntregaDefault?: unknown;
  latitud?: unknown;
  longitud?: unknown;
};

type DocumentoEntrada = {
  tipo?: unknown;
  nombreArchivo?: unknown;
  urlArchivo?: unknown;
  fechaEmision?: unknown;
  fechaVencimiento?: unknown;
  observacion?: unknown;
};

const NATURALEZA_RECEPTOR = {
  CONTRIBUYENTE: 1,
  NO_CONTRIBUYENTE: 2,
} as const;

const TIPO_OPERACION_SIFEN = {
  B2B: 1,
  B2C: 2,
  B2G: 3,
  B2F: 4,
} as const;

const TIPO_CONTRIBUYENTE_SIFEN = {
  FISICA: 1,
  JURIDICA: 2,
} as const;

const TIPO_DOCUMENTO_IDENTIDAD_SIFEN = {
  CEDULA_PARAGUAYA: 1,
  PASAPORTE: 2,
  CEDULA_EXTRANJERA: 3,
  CARNET_RESIDENCIA: 4,
  INNOMINADO: 5,
  TARJETA_DIPLOMATICA: 6,
  OTRO: 9,
} as const;

const TIPOS_DIRECCION = new Set([
  "FISCAL",
  "COMERCIAL",
  "ENTREGA",
  "SUCURSAL",
  "OTRA",
]);

const TIPOS_DOCUMENTO_CLIENTE = new Set([
  "RUC",
  "CONTRATO",
  "CREDITO",
  "EXONERACION",
  "OTRO",
]);

const FRECUENCIAS_ENTREGA = new Set([
  "DIARIA",
  "SEMANAL",
  "QUINCENAL",
  "MENSUAL",
  "A_DEMANDA",
]);

function texto(valor: unknown, maximo?: number) {
  if (typeof valor !== "string") return "";

  const resultado = valor.trim();
  return maximo ? resultado.slice(0, maximo) : resultado;
}

function opcional(valor: unknown, maximo?: number) {
  return texto(valor, maximo) || null;
}

function booleano(valor: unknown) {
  return valor === true;
}

function lista<T>(valor: unknown): T[] {
  return Array.isArray(valor) ? (valor as T[]) : [];
}

function numeroOpcional(valor: unknown, minimo?: number, maximo?: number) {
  if (valor === null || valor === undefined || valor === "") return null;

  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    throw new Error("Uno de los valores numéricos informados no es válido.");
  }

  if (minimo !== undefined && numero < minimo) {
    throw new Error(`El valor debe ser igual o mayor a ${minimo}.`);
  }

  if (maximo !== undefined && numero > maximo) {
    throw new Error(`El valor debe ser igual o menor a ${maximo}.`);
  }

  return numero;
}

function codigoGeografico(valor: unknown, etiqueta: string) {
  if (valor === null || valor === undefined || valor === "") return null;

  const codigo = Number(valor);

  if (!Number.isInteger(codigo) || codigo <= 0) {
    throw new Error(`${etiqueta} no es válido.`);
  }

  return codigo;
}

function fechaIso(valor: unknown, etiqueta: string) {
  const fecha = texto(valor);
  if (!fecha) return null;

  const coincidencia = fecha.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!coincidencia) {
    throw new Error(`${etiqueta} debe tener el formato dd/mm/yyyy.`);
  }

  const [, diaTexto, mesTexto, anioTexto] = coincidencia;
  const dia = Number(diaTexto);
  const mes = Number(mesTexto);
  const anio = Number(anioTexto);
  const fechaUtc = new Date(Date.UTC(anio, mes - 1, dia));

  if (
    fechaUtc.getUTCFullYear() !== anio ||
    fechaUtc.getUTCMonth() !== mes - 1 ||
    fechaUtc.getUTCDate() !== dia
  ) {
    throw new Error(`${etiqueta} no es una fecha válida.`);
  }

  return `${anioTexto}-${mesTexto}-${diaTexto}`;
}

function diasEntrega(valor: unknown) {
  if (!Array.isArray(valor) || valor.length === 0) return null;

  const dias = [...new Set(valor.map((dia) => Number(dia)))].sort(
    (a, b) => a - b,
  );

  if (dias.some((dia) => !Number.isInteger(dia) || dia < 1 || dia > 7)) {
    throw new Error("Los días de entrega deben estar entre 1 y 7.");
  }

  return dias;
}

function validarCorreo(valor: string | null, etiqueta: string) {
  if (!valor) return;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) {
    throw new Error(`${etiqueta} no tiene un formato válido.`);
  }
}

function esErrorPostgres(
  error: unknown,
): error is { code?: string; message?: string } {
  return typeof error === "object" && error !== null;
}

async function validarReferenciaEmpresa(
  conexion: PoolClient,
  tabla:
    | "grupos_cliente"
    | "listas_precio"
    | "rutas_entrega"
    | "zonas_comerciales"
    | "vendedores"
    | "canales_venta",
  id: string | null,
  empresaId: string,
  etiqueta: string,
) {
  if (!id) return;

  const resultado = await conexion.query(
    `SELECT 1 FROM ${tabla} WHERE id = $1 AND empresa_id = $2 AND activo = true`,
    [id, empresaId],
  );

  if (resultado.rowCount !== 1) {
    throw new Error(
      `El valor seleccionado para ${etiqueta} no está disponible.`,
    );
  }
}

async function validarDireccionParaguay(
  conexion: PoolClient,
  direccion: DireccionEntrada,
) {
  const paisCodigo = texto(direccion.paisCodigo, 3).toUpperCase();

  if (paisCodigo !== "PRY") return;

  const departamentoCodigo = codigoGeografico(
    direccion.departamentoCodigo,
    "El departamento",
  );
  const distritoCodigo = codigoGeografico(
    direccion.distritoCodigo,
    "El distrito",
  );
  const ciudadCodigo = codigoGeografico(direccion.ciudadCodigo, "La ciudad");

  if (!departamentoCodigo || !distritoCodigo || !ciudadCodigo) {
    throw new Error(
      "Para una dirección de Paraguay seleccione departamento, distrito y ciudad.",
    );
  }

  const resultado = await conexion.query(
    `
      SELECT
        d.nombre AS departamento,
        di.nombre AS distrito,
        c.nombre AS ciudad
      FROM referencia_geografica_departamentos d
      JOIN referencia_geografica_distritos di
        ON di.departamento_codigo = d.codigo
      JOIN referencia_geografica_ciudades c
        ON c.distrito_codigo = di.codigo
      WHERE d.codigo = $1
        AND di.codigo = $2
        AND c.codigo = $3
    `,
    [departamentoCodigo, distritoCodigo, ciudadCodigo],
  );

  if (resultado.rowCount !== 1) {
    throw new Error(
      "La combinación de departamento, distrito y ciudad no es válida.",
    );
  }

  return {
    departamentoCodigo,
    distritoCodigo,
    ciudadCodigo,
    ...resultado.rows[0],
  };
}

async function catalogoGeografico(
  url: URL,
  db: Awaited<ReturnType<typeof obtenerDb>>,
) {
  const catalogo = url.searchParams.get("catalogo");

  if (!catalogo) return null;

  if (catalogo === "departamentos") {
    const resultado = await db.query(
      `SELECT codigo, nombre
       FROM referencia_geografica_departamentos
       ORDER BY nombre`,
    );

    return NextResponse.json({ catalogo, datos: resultado.rows });
  }

  const departamento = Number(url.searchParams.get("departamento"));

  if (!Number.isInteger(departamento) || departamento <= 0) {
    return NextResponse.json(
      { error: "Informe un departamento válido." },
      { status: 400 },
    );
  }

  if (catalogo === "distritos") {
    const resultado = await db.query(
      `SELECT codigo, nombre, departamento_codigo
       FROM referencia_geografica_distritos
       WHERE departamento_codigo = $1
       ORDER BY nombre`,
      [departamento],
    );

    return NextResponse.json({ catalogo, datos: resultado.rows });
  }

  if (catalogo === "ciudades") {
    const distrito = Number(url.searchParams.get("distrito"));

    if (!Number.isInteger(distrito) || distrito <= 0) {
      return NextResponse.json(
        { error: "Informe un distrito válido." },
        { status: 400 },
      );
    }

    const resultado = await db.query(
      `SELECT codigo, nombre, departamento_codigo, distrito_codigo
       FROM referencia_geografica_ciudades
       WHERE departamento_codigo = $1
         AND distrito_codigo = $2
       ORDER BY nombre`,
      [departamento, distrito],
    );

    return NextResponse.json({ catalogo, datos: resultado.rows });
  }

  return NextResponse.json(
    { error: "Catálogo geográfico no válido." },
    { status: 400 },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (DEMO_MODE) {
    return respuestaDemoCatalogos(url);
  }

  try {
    const session = await obtenerSesionActual();

    if (!session) {
      return NextResponse.json(
        { error: "Sesión no válida." },
        { status: 401 },
      );
    }

    const db = await obtenerDb();
    const respuestaGeografica = await catalogoGeografico(url, db);

    if (respuestaGeografica) return respuestaGeografica;

    const empresaId = session.user.empresaId;
    const soloCatalogos = url.searchParams.get("modo") === "catalogos";
    const clientesConsulta = soloCatalogos
      ? Promise.resolve({ rows: [] })
      : db.query(
          `
            SELECT
              c.id,
              c.codigo,
              c.naturaleza_receptor,
              c.tipo_operacion,
              c.tipo_persona,
              c.tipo_contribuyente_sifen,
              c.tipo_documento,
              c.tipo_documento_identidad_sifen,
              c.descripcion_documento_identidad,
              c.numero_documento,
              c.dv,
              c.razon_social,
              c.nombre_fantasia,
              c.email,
              c.email_copia,
              c.telefono,
              c.celular,
              c.limite_credito,
              c.bloqueado_ventas,
              c.activo,
              gc.nombre AS grupo_cliente_nombre,
              cp.nombre AS condicion_pago_nombre,
              lp.nombre AS lista_precio_nombre,
              v.nombre AS vendedor_nombre,
              r.nombre AS ruta_entrega_nombre
            FROM clientes c
            LEFT JOIN grupos_cliente gc ON gc.id = c.grupo_cliente_id
            LEFT JOIN condiciones_pago cp ON cp.id = c.condicion_pago_id
            LEFT JOIN listas_precio lp ON lp.id = c.lista_precio_id
            LEFT JOIN vendedores v ON v.id = c.vendedor_id
            LEFT JOIN rutas_entrega r ON r.id = c.ruta_entrega_id
            WHERE c.empresa_id = $1
            ORDER BY c.activo DESC, c.razon_social ASC
          `,
          [empresaId],
        );
    const [
      clientesResultado,
      gruposResultado,
      condicionesResultado,
      monedasResultado,
      listasResultado,
      rutasResultado,
      zonasResultado,
      vendedoresResultado,
      canalesResultado,
      departamentosResultado,
    ] = await Promise.all([
      clientesConsulta,
      db.query(
        `SELECT id, codigo, nombre
         FROM grupos_cliente
         WHERE empresa_id = $1 AND activo = true
         ORDER BY nombre`,
        [empresaId],
      ),
      db.query(
        `SELECT id, codigo, nombre, dias_vencimiento, requiere_credito
         FROM condiciones_pago
         WHERE activo = true
         ORDER BY nombre`,
      ),
      db.query(
        `SELECT codigo, nombre
         FROM monedas
         WHERE activo = true
         ORDER BY codigo`,
      ),
      db.query(
        `SELECT id, codigo, nombre, moneda_codigo
         FROM listas_precio
         WHERE empresa_id = $1 AND activo = true
         ORDER BY nombre`,
        [empresaId],
      ),
      db.query(
        `SELECT id, codigo, nombre, zona
         FROM rutas_entrega
         WHERE empresa_id = $1 AND activo = true
         ORDER BY nombre`,
        [empresaId],
      ),
      db.query(
        `SELECT id, codigo, nombre
         FROM zonas_comerciales
         WHERE empresa_id = $1 AND activo = true
         ORDER BY nombre`,
        [empresaId],
      ),
      db.query(
        `SELECT id, codigo, nombre
         FROM vendedores
         WHERE empresa_id = $1 AND activo = true
         ORDER BY nombre`,
        [empresaId],
      ),
      db.query(
        `SELECT id, codigo, nombre
         FROM canales_venta
         WHERE empresa_id = $1 AND activo = true
         ORDER BY nombre`,
        [empresaId],
      ),
      db.query(
        `SELECT codigo, nombre
         FROM referencia_geografica_departamentos
         ORDER BY nombre`,
      ),
    ]);

    return NextResponse.json({
      clientes: clientesResultado.rows,
      catalogos: {
        grupos: gruposResultado.rows,
        condicionesPago: condicionesResultado.rows,
        monedas: monedasResultado.rows,
        listasPrecio: listasResultado.rows,
        rutasEntrega: rutasResultado.rows,
        zonasComerciales: zonasResultado.rows,
        vendedores: vendedoresResultado.rows,
        canalesVenta: canalesResultado.rows,
        departamentosParaguay: departamentosResultado.rows,
      },
    });
  } catch (error) {
    console.error("Error al cargar clientes:", error);

    return NextResponse.json(
      { error: "No fue posible cargar la información de clientes." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let cuerpo: JsonObject;

  try {
    cuerpo = (await request.json()) as JsonObject;
  } catch {
    return NextResponse.json(
      { error: "Los datos enviados no son válidos." },
      { status: 400 },
    );
  }

  if (DEMO_MODE) {
    const cliente = crearClienteDemo(cuerpo);

    return NextResponse.json(
      {
        message: "Cliente registrado correctamente en modo demo.",
        cliente,
        demo: true,
      },
      { status: 201 },
    );
  }

  const session = await obtenerSesionActual();

  if (!session) {
    return NextResponse.json(
      { error: "Sesión no válida." },
      { status: 401 },
    );
  }

  const db = await obtenerDb();
  let conexion: PoolClient | undefined;

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
    const descripcionDocumentoIdentidad = opcional(
      cuerpo.descripcionDocumentoIdentidad,
      100,
    );
    const contactos = lista<ContactoEntrada>(cuerpo.contactos);
    const direcciones = lista<DireccionEntrada>(cuerpo.direcciones);
    const documentos = lista<DocumentoEntrada>(cuerpo.documentos);
    const limiteCreditoTemporal = numeroOpcional(
      cuerpo.limiteCreditoTemporal,
      0,
    );
    const fechaVencimientoCredito = fechaIso(
      cuerpo.fechaVencimientoCredito,
      "La fecha de vencimiento del crédito",
    );
    const dias = diasEntrega(cuerpo.diasEntrega);
    const frecuenciaEntrega =
      opcional(cuerpo.frecuenciaEntrega)?.toUpperCase() ?? null;
    const email = opcional(cuerpo.email, 150);
    const emailCopia = opcional(cuerpo.emailCopia, 150);
    const emailFacturacion = opcional(cuerpo.emailFacturacion, 150);
    const emailCobranzas = opcional(cuerpo.emailCobranzas, 150);

    if (!(naturaleza in NATURALEZA_RECEPTOR)) {
      throw new Error("Seleccione la naturaleza del cliente.");
    }

    if (!(tipoOperacion in TIPO_OPERACION_SIFEN)) {
      throw new Error("Seleccione un tipo de operación válido.");
    }

    if (!(tipoPersona in TIPO_CONTRIBUYENTE_SIFEN)) {
      throw new Error("Seleccione el tipo de contribuyente.");
    }

    if (!paisCodigo || !paisNombre) {
      throw new Error("Informe el país del cliente.");
    }

    if (!razonSocial) {
      throw new Error("Informe el nombre o razón social del cliente.");
    }

    if (naturaleza === "CONTRIBUYENTE") {
      if (!numeroDocumento || !dv) {
        throw new Error("Para un contribuyente informe RUC y DV.");
      }
    } else {
      if (!(tipoDocumento in TIPO_DOCUMENTO_IDENTIDAD_SIFEN)) {
        throw new Error("Seleccione el tipo de documento del cliente.");
      }

      if (!numeroDocumento) {
        throw new Error("Informe el número de documento del cliente.");
      }

      if (tipoDocumento === "OTRO" && !descripcionDocumentoIdentidad) {
        throw new Error(
          "Describa el tipo de documento seleccionado como Otro.",
        );
      }
    }

    if (fechaVencimientoCredito && limiteCreditoTemporal === null) {
      throw new Error(
        "Para informar vencimiento, indique también un límite de crédito temporal.",
      );
    }

    if (frecuenciaEntrega && !FRECUENCIAS_ENTREGA.has(frecuenciaEntrega)) {
      throw new Error("La frecuencia de entrega no es válida.");
    }

    const bloqueadoVentas = booleano(cuerpo.bloqueadoVentas);
    const motivoBloqueoVentas = opcional(cuerpo.motivoBloqueoVentas, 500);

    if (bloqueadoVentas && !motivoBloqueoVentas) {
      throw new Error("Informe el motivo del bloqueo de ventas.");
    }

    validarCorreo(email, "El correo electrónico principal");
    validarCorreo(emailCopia, "El correo electrónico de copia");
    validarCorreo(emailFacturacion, "El correo de facturación");
    validarCorreo(emailCobranzas, "El correo de cobranzas");

    for (const direccion of direcciones) {
      const tipo = texto(direccion.tipo).toUpperCase() || "COMERCIAL";

      if (!TIPOS_DIRECCION.has(tipo)) {
        throw new Error("Existe una dirección con tipo no válido.");
      }

      if (!texto(direccion.direccion, 300)) {
        throw new Error("Informe la dirección de cada ubicación registrada.");
      }

      if (!texto(direccion.paisCodigo, 3)) {
        throw new Error("Informe el país de cada dirección.");
      }
    }

    for (const contacto of contactos) {
      if (!texto(contacto.nombre, 100)) {
        throw new Error("Cada contacto debe tener nombre.");
      }

      validarCorreo(opcional(contacto.email, 150), "El correo de un contacto");
    }

    for (const documento of documentos) {
      if (!TIPOS_DOCUMENTO_CLIENTE.has(texto(documento.tipo).toUpperCase())) {
        throw new Error("Existe un tipo de documento de cliente no válido.");
      }

      if (
        !texto(documento.nombreArchivo, 255) ||
        !texto(documento.urlArchivo)
      ) {
        throw new Error(
          "Cada documento requiere nombre de archivo y URL segura.",
        );
      }
    }

    conexion = await db.connect();
    await conexion.query("BEGIN");

    await Promise.all([
      validarReferenciaEmpresa(
        conexion,
        "grupos_cliente",
        opcional(cuerpo.grupoClienteId),
        session.user.empresaId,
        "grupo de cliente",
      ),
      validarReferenciaEmpresa(
        conexion,
        "listas_precio",
        opcional(cuerpo.listaPrecioId),
        session.user.empresaId,
        "lista de precios",
      ),
      validarReferenciaEmpresa(
        conexion,
        "rutas_entrega",
        opcional(cuerpo.rutaEntregaId),
        session.user.empresaId,
        "ruta de entrega",
      ),
      validarReferenciaEmpresa(
        conexion,
        "zonas_comerciales",
        opcional(cuerpo.zonaComercialId),
        session.user.empresaId,
        "zona comercial",
      ),
      validarReferenciaEmpresa(
        conexion,
        "vendedores",
        opcional(cuerpo.vendedorId),
        session.user.empresaId,
        "vendedor",
      ),
      validarReferenciaEmpresa(
        conexion,
        "canales_venta",
        opcional(cuerpo.canalVentaId),
        session.user.empresaId,
        "canal de venta",
      ),
    ]);

    const identificacionExistente = await conexion.query(
      `
        SELECT 1
        FROM clientes
        WHERE empresa_id = $1
          AND tipo_documento = $2
          AND numero_documento = $3
          AND COALESCE(dv, '') = COALESCE($4, '')
        LIMIT 1
      `,
      [
        session.user.empresaId,
        naturaleza === "CONTRIBUYENTE" ? "RUC" : tipoDocumento,
        numeroDocumento,
        naturaleza === "CONTRIBUYENTE" ? dv : null,
      ],
    );

    if (identificacionExistente.rowCount) {
      throw new Error("Ya existe un cliente con esa identificación.");
    }

    const clienteResultado = await conexion.query(
      `
        INSERT INTO clientes (
          empresa_id,
          naturaleza_receptor,
          tipo_operacion,
          pais_codigo,
          pais_nombre,
          tipo_persona,
          tipo_contribuyente_sifen,
          tipo_documento,
          tipo_documento_identidad_sifen,
          descripcion_documento_identidad,
          numero_documento,
          dv,
          razon_social,
          nombre_fantasia,
          email,
          email_copia,
          telefono,
          celular,
          limite_credito,
          condicion_pago_id,
          lista_precio_id,
          grupo_cliente_id,
          moneda_codigo_predeterminada,
          canal_venta_id,
          codigo_externo,
          gln,
          descuento_comercial_pct,
          limite_credito_temporal,
          fecha_vencimiento_credito,
          bloqueado_ventas,
          motivo_bloqueo_ventas,
          bloqueado_ventas_at,
          bloqueado_ventas_por,
          dia_preferido_cobro,
          ruta_entrega_id,
          zona_comercial_id,
          vendedor_id,
          frecuencia_entrega,
          dias_entrega,
          requiere_orden_compra,
          email_facturacion,
          email_cobranzas,
          recibe_documento_electronico,
          observacion_comercial,
          observacion_logistica
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
          $31, CASE WHEN $30 THEN now() ELSE NULL END,
          CASE WHEN $30 THEN $32 ELSE NULL END,
          $33, $34, $35, $36, $37, $38, $39,
          $40, $41, $42, $43, $44
        )
        RETURNING id, codigo, razon_social
      `,
      [
        session.user.empresaId,
        NATURALEZA_RECEPTOR[naturaleza as keyof typeof NATURALEZA_RECEPTOR],
        TIPO_OPERACION_SIFEN[
          tipoOperacion as keyof typeof TIPO_OPERACION_SIFEN
        ],
        paisCodigo,
        paisNombre,
        tipoPersona,
        TIPO_CONTRIBUYENTE_SIFEN[
          tipoPersona as keyof typeof TIPO_CONTRIBUYENTE_SIFEN
        ],
        naturaleza === "CONTRIBUYENTE" ? "RUC" : tipoDocumento,
        naturaleza === "CONTRIBUYENTE"
          ? null
          : TIPO_DOCUMENTO_IDENTIDAD_SIFEN[
              tipoDocumento as keyof typeof TIPO_DOCUMENTO_IDENTIDAD_SIFEN
            ],
        naturaleza === "CONTRIBUYENTE" ? null : descripcionDocumentoIdentidad,
        numeroDocumento,
        naturaleza === "CONTRIBUYENTE" ? dv : null,
        razonSocial,
        opcional(cuerpo.nombreFantasia, 200),
        email,
        emailCopia,
        opcional(cuerpo.telefono, 30),
        opcional(cuerpo.celular, 30),
        numeroOpcional(cuerpo.limiteCredito, 0) ?? 0,
        opcional(cuerpo.condicionPagoId),
        opcional(cuerpo.listaPrecioId),
        opcional(cuerpo.grupoClienteId),
        opcional(cuerpo.monedaCodigoPredeterminada, 3)?.toUpperCase() ?? null,
        opcional(cuerpo.canalVentaId),
        opcional(cuerpo.codigoExterno, 100),
        opcional(cuerpo.gln, 13),
        numeroOpcional(cuerpo.descuentoComercialPct, 0, 100) ?? 0,
        limiteCreditoTemporal,
        fechaVencimientoCredito,
        bloqueadoVentas,
        motivoBloqueoVentas,
        session.user.id,
        numeroOpcional(cuerpo.diaPreferidoCobro, 1, 31),
        opcional(cuerpo.rutaEntregaId),
        opcional(cuerpo.zonaComercialId),
        opcional(cuerpo.vendedorId),
        frecuenciaEntrega,
        dias,
        booleano(cuerpo.requiereOrdenCompra),
        emailFacturacion,
        emailCobranzas,
        cuerpo.recibeDocumentoElectronico !== false,
        opcional(cuerpo.observacionComercial, 1000),
        opcional(cuerpo.observacionLogistica, 1000),
      ],
    );

    const cliente = clienteResultado.rows[0] as {
      id: string;
      codigo: string;
      razon_social: string;
    };

    for (const contacto of contactos) {
      await conexion.query(
        `
          INSERT INTO cliente_contactos (
            cliente_id,
            nombre,
            apellido,
            cargo,
            departamento,
            telefono,
            celular,
            email,
            es_principal,
            recibe_pedidos,
            recibe_facturacion,
            recibe_cobranzas,
            recibe_documentos_electronicos,
            recibe_notificaciones
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12, $13, $14
          )
        `,
        [
          cliente.id,
          texto(contacto.nombre, 100),
          opcional(contacto.apellido, 100),
          opcional(contacto.cargo, 100),
          opcional(contacto.departamento, 100),
          opcional(contacto.telefono, 30),
          opcional(contacto.celular, 30),
          opcional(contacto.email, 150),
          booleano(contacto.esPrincipal),
          booleano(contacto.recibePedidos),
          booleano(contacto.recibeFacturacion),
          booleano(contacto.recibeCobranzas),
          booleano(contacto.recibeDocumentosElectronicos),
          contacto.recibeNotificaciones !== false,
        ],
      );
    }

    for (const direccion of direcciones) {
      const tipo = texto(direccion.tipo).toUpperCase() || "COMERCIAL";
      const geografia = await validarDireccionParaguay(conexion, direccion);

      await conexion.query(
        `
          INSERT INTO direcciones_cliente (
            cliente_id,
            descripcion,
            direccion,
            ciudad,
            departamento,
            latitud,
            longitud,
            es_fiscal,
            es_entrega_default,
            tipo,
            etiqueta,
            numero_casa,
            complemento,
            pais_codigo,
            pais_nombre,
            departamento_codigo,
            distrito_codigo,
            distrito,
            ciudad_codigo,
            codigo_postal,
            contacto_nombre,
            contacto_telefono,
            horario_recepcion,
            observacion
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14, $15, $16,
            $17, $18, $19, $20, $21, $22, $23, $24
          )
        `,
        [
          cliente.id,
          opcional(direccion.etiqueta, 100) ?? tipo,
          texto(direccion.direccion, 300),
          geografia?.ciudad ?? opcional(direccion.ciudad, 100),
          geografia?.departamento ?? opcional(direccion.departamento, 100),
          numeroOpcional(direccion.latitud, -90, 90),
          numeroOpcional(direccion.longitud, -180, 180),
          booleano(direccion.esFiscal) || tipo === "FISCAL",
          booleano(direccion.esEntregaDefault),
          tipo,
          opcional(direccion.etiqueta, 100),
          opcional(direccion.numeroCasa, 20),
          opcional(direccion.complemento, 200),
          texto(direccion.paisCodigo, 3).toUpperCase(),
          texto(direccion.paisNombre, 60),
          geografia?.departamentoCodigo ?? null,
          geografia?.distritoCodigo ?? null,
          geografia?.distrito ?? opcional(direccion.distrito, 100),
          geografia?.ciudadCodigo ?? null,
          opcional(direccion.codigoPostal, 15),
          opcional(direccion.contactoNombre, 200),
          opcional(direccion.contactoTelefono, 30),
          opcional(direccion.horarioRecepcion, 200),
          opcional(direccion.observacion, 500),
        ],
      );
    }

    for (const documento of documentos) {
      const fechaEmision = fechaIso(
        documento.fechaEmision,
        "La fecha de emisión del documento",
      );
      const fechaVencimiento = fechaIso(
        documento.fechaVencimiento,
        "La fecha de vencimiento del documento",
      );

      if (fechaEmision && fechaVencimiento && fechaVencimiento < fechaEmision) {
        throw new Error(
          "La fecha de vencimiento de un documento no puede ser anterior a su emisión.",
        );
      }

      await conexion.query(
        `
          INSERT INTO cliente_documentos (
            cliente_id,
            tipo,
            nombre_archivo,
            url_archivo,
            fecha_emision,
            fecha_vencimiento,
            observacion,
            cargado_por
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          cliente.id,
          texto(documento.tipo).toUpperCase(),
          texto(documento.nombreArchivo, 255),
          texto(documento.urlArchivo),
          fechaEmision,
          fechaVencimiento,
          opcional(documento.observacion, 500),
          session.user.id,
        ],
      );
    }

    await conexion.query("COMMIT");

    return NextResponse.json(
      {
        message: "Cliente registrado correctamente.",
        cliente,
      },
      { status: 201 },
    );
  } catch (error) {
    if (conexion) {
      await conexion.query("ROLLBACK").catch(() => undefined);
    }

    console.error("Error al registrar cliente:", error);

    if (esErrorPostgres(error) && error.code === "23505") {
      return NextResponse.json(
        {
          error:
            "Ya existe un cliente con esa identificación o código externo.",
        },
        { status: 409 },
      );
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "No fue posible registrar el cliente." },
      { status: 500 },
    );
  } finally {
    conexion?.release();
  }
}