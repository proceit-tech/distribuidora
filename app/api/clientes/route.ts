import type { PoolClient } from "pg";
import { NextResponse } from "next/server";

import { resolverPais, resolverUbicacionParaguay, validarPaisPorOperacion } from "@/lib/geografia/referencia";

import { denyIfNoPermission } from "@/lib/auth/permissions";
import { validarRucDv } from "@/lib/fiscal/calcular-dv-ruc";
import {
  textoCrudo,
  validarCamposReceptor,
  validarDireccionFiscal,
  validarGln,
  validarInnominado,
  validarNaturalezaOperacion,
} from "@/lib/fiscal/campos-receptor";
import { mensajeRestriccionCliente } from "@/lib/clientes/errores-bd";
import { validarDiaPreferidoCobro } from "@/lib/clientes/dia-cobro";
import { leerDiaMes, validarFrecuenciaYDias } from "@/lib/clientes/logistica";
import { evaluarAptitudCliente, evaluarAptitudEmpresa, mensajeRegularizacionFiscal } from "@/lib/clientes/aptitud-cliente";
import { validarDireccionFiscalRequerida } from "@/lib/clientes/obligatoriedad-fiscal";
import { DESCUENTO_COMERCIAL, LIMITE_CREDITO, decimalAcotado, validarCondicionYMoneda } from "@/lib/clientes/comercial";
import { leerTelefonoEntrada, validarTelefono, type CampoTelefonico } from "@/lib/fiscal/telefono";


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


function texto(valor: unknown, maximo?: number) {
  if (typeof valor !== "string") return "";

  const resultado = valor.trim();

  // Nunca se trunca en silencio: un valor más largo que la columna se rechaza.
  if (maximo && resultado.length > maximo) {
    throw new Error(`Un valor supera el máximo permitido de ${maximo} caracteres.`);
  }

  return resultado;
}

function opcional(valor: unknown, maximo?: number) {
  return texto(valor, maximo) || null;
}

// Teléfono/celular de un contacto: mismo modelo por país que el del cliente (ERP: no es D214/D215). Lanza Error si es inválido.
function validarTelefonoContacto(contacto: unknown, campo: CampoTelefonico, numeroContacto: number) {
  const etiqueta = `${campo === "telefono" ? "el teléfono" : "el celular"} del contacto ${numeroContacto}`;
  const resultado = validarTelefono(campo, leerTelefonoEntrada(contacto as Record<string, unknown>, campo), etiqueta);

  if (!resultado.ok) throw new Error(resultado.error);

  return resultado;
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

  return resolverUbicacionParaguay(
    conexion,
    direccion.departamentoCodigo,
    direccion.distritoCodigo,
    direccion.ciudadCodigo,
    "La dirección",
  );
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
       WHERE activo = true
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
       WHERE departamento_codigo = $1 AND activo = true
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
         AND activo = true
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

  if (!DEMO_MODE && !process.env.DATABASE_URL) {
    return errorConfiguracion();
  }

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

  const denegadoVer = await denyIfNoPermission(session, "CLIENTES", "VER");
  if (denegadoVer) return denegadoVer;

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
              c.moneda_codigo_predeterminada,
              c.grupo_cliente_id,
              c.bloqueado_ventas,
              c.activo,
              c.pais_codigo,
              c.pais_nombre,
              c.gln,
              c.telefono_ddi,
              c.celular_ddi,
              cc.nombre AS contacto_nombre,
              cc.apellido AS contacto_apellido,
              cc.telefono AS contacto_telefono,
              cc.celular AS contacto_celular,
              cc.telefono_ddi AS contacto_telefono_ddi,
              cc.celular_ddi AS contacto_celular_ddi,
              zc.nombre AS zona_comercial_nombre,
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
            LEFT JOIN zonas_comerciales zc ON zc.id = c.zona_comercial_id
            LEFT JOIN cliente_contactos cc ON cc.empresa_id = c.empresa_id AND cc.cliente_id = c.id AND cc.es_principal
            WHERE c.empresa_id = $1
            ORDER BY c.activo DESC, c.razon_social ASC
          `,
          [empresaId],
        );

    // Listado: solo las filas de clientes (sin los once catálogos del formulario).
    if (url.searchParams.get("modo") === "lista") {
      const filas = (await clientesConsulta).rows as Array<Record<string, unknown>>;
      // Aptitud SIFEN de cada cliente (misma evaluación que el detalle y la compuerta de guardado), solo de la empresa de la sesión.
      const aptitud = await evaluarAptitudEmpresa(db, empresaId);

      return NextResponse.json({
        clientes: filas.map((fila) => {
          const a = aptitud.get(String(fila.id));

          return { ...fila, aptitud_apto: a?.apto === true, aptitud_pendientes: a?.pendientes ?? [] };
        }),
      });
    }

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
      paisesResultado,
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
         WHERE activo = true
         ORDER BY nombre`,
      ),
      db.query(
        `SELECT codigo, nombre
         FROM referencia_geografica_paises
         WHERE activo = true
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
        paises: paisesResultado.rows,
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

  if (!DEMO_MODE && !process.env.DATABASE_URL) {
    return errorConfiguracion();
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

  const denegadoCrear = await denyIfNoPermission(session, "CLIENTES", "CREAR");
  if (denegadoCrear) return denegadoCrear;

  const db = await obtenerDb();
  let conexion: PoolClient | undefined;

  try {
    const naturaleza = texto(cuerpo.naturaleza).toUpperCase();
    const tipoOperacion = texto(cuerpo.tipoOperacion).toUpperCase();
    const tipoPersona = texto(cuerpo.tipoPersona).toUpperCase();
    const tipoDocumento = texto(cuerpo.tipoDocumento).toUpperCase();
    const numeroDocumento = texto(cuerpo.numeroDocumento, 30);
    const dv = texto(cuerpo.dv, 5);
    const razonSocial = texto(cuerpo.razonSocial, 255);
    const paisCodigo = texto(cuerpo.paisCodigo, 3).toUpperCase();
    const descripcionDocumentoIdentidad = opcional(
      cuerpo.descripcionDocumentoIdentidad,
      100,
    );
    const contactos = lista<ContactoEntrada>(cuerpo.contactos);
    const direcciones = lista<DireccionEntrada>(cuerpo.direcciones);
    const documentos = lista<unknown>(cuerpo.documentos);
    const limiteCreditoTemporal = decimalAcotado(cuerpo.limiteCreditoTemporal, "El límite de crédito temporal", LIMITE_CREDITO);
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

    if (!paisCodigo) {
      throw new Error("Informe el país del cliente.");
    }
    validarPaisPorOperacion(tipoOperacion, paisCodigo);

    if (!razonSocial) {
      throw new Error("Informe el nombre o razón social del cliente.");
    }

    if (naturaleza === "CONTRIBUYENTE") {
      if (!numeroDocumento || !dv) {
        throw new Error("Para un contribuyente informe RUC y DV.");
      }

      const rucDv = validarRucDv(numeroDocumento, dv);

      if (!rucDv.ok) {
        throw new Error(rucDv.error);
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

    // Campos D3 del SIFEN: tamaños y formatos oficiales sobre el valor recibido (sin truncar).
    // D214/D215: DDI separado + número nacional normalizado (solo dígitos); sin DDI no se acepta un número.
    const telefonoFiscal = validarTelefono("telefono", leerTelefonoEntrada(cuerpo, "telefono"));
    if (!telefonoFiscal.ok) throw new Error(telefonoFiscal.error);
    const celularFiscal = validarTelefono("celular", leerTelefonoEntrada(cuerpo, "celular"));
    if (!celularFiscal.ok) throw new Error(celularFiscal.error);

    // Día preferido de cobro: entero 1–31 (DEC-CLI-COB-06); se guarda la preferencia original.
    const diaCobro = validarDiaPreferidoCobro(cuerpo.diaPreferidoCobro);
    if (!diaCobro.ok) throw new Error(diaCobro.error);

    const errorReceptor = validarCamposReceptor({
      naturaleza,
      tipoDocumento,
      numeroDocumento: textoCrudo(cuerpo.numeroDocumento),
      descripcionDocumento: textoCrudo(cuerpo.descripcionDocumentoIdentidad),
      razonSocial: textoCrudo(cuerpo.razonSocial),
      nombreFantasia: textoCrudo(cuerpo.nombreFantasia),
      email: textoCrudo(cuerpo.email),
      telefono: textoCrudo(cuerpo.telefono),
      celular: textoCrudo(cuerpo.celular),
    });

    if (errorReceptor) {
      throw new Error(errorReceptor);
    }

    const errorReglas =
      validarNaturalezaOperacion(naturaleza, tipoOperacion) ??
      validarInnominado({ tipoDocumento, naturaleza, tipoOperacion, numeroDocumento, razonSocial }) ??
      validarGln(textoCrudo(cuerpo.gln));

    if (errorReglas) {
      throw new Error(errorReglas);
    }

    if (fechaVencimientoCredito && limiteCreditoTemporal === null) {
      throw new Error(
        "Para informar el vencimiento del límite temporal, indique también el límite temporal.",
      );
    }

    const errorLogistica = validarFrecuenciaYDias(frecuenciaEntrega, dias ?? [], cuerpo.diaMesEntrega);
    if (errorLogistica) throw new Error(errorLogistica);

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

      if (tipo === "FISCAL" || (direccion as { esFiscal?: unknown }).esFiscal === true) {
        const errorFiscal = validarDireccionFiscal(
          textoCrudo(direccion.direccion),
          textoCrudo(direccion.numeroCasa),
          {
            exigir: tipoOperacion !== "B2F",
            departamento: String(direccion.departamentoCodigo ?? "").trim(),
            distrito: String(direccion.distritoCodigo ?? "").trim(),
            ciudad: String(direccion.ciudadCodigo ?? "").trim(),
          },
        );

        if (errorFiscal) {
          throw new Error(errorFiscal);
        }
      }
    }

    // Cadastro fiscal completo (decisión 01): una operación B2F (D202 = 4) exige dirección fiscal del receptor (D213).
    // En las demás operaciones la dirección fiscal es facultativa y no se impone.
    const mensajeFiscalB2F = validarDireccionFiscalRequerida(
      tipoOperacion,
      direcciones.some((d) => String(d.tipo ?? "").toUpperCase() === "FISCAL" || (d as { esFiscal?: unknown }).esFiscal === true),
    );
    if (mensajeFiscalB2F) throw new Error(mensajeFiscalB2F);

    for (const [indiceContacto, contacto] of contactos.entries()) {
      if (!texto(contacto.nombre, 100)) {
        throw new Error("Cada contacto debe tener nombre.");
      }

      validarCorreo(opcional(contacto.email, 150), "El correo de un contacto");
      validarTelefonoContacto(contacto, "telefono", indiceContacto + 1);
      validarTelefonoContacto(contacto, "celular", indiceContacto + 1);
    }

    // Los documentos son archivos reales: se cargan DESPUÉS de crear el cliente con POST /api/clientes/[id]/documentos
    // (almacenamiento privado). Ya no se aceptan enlaces externos en el alta; nada se descarta en silencio.
    if (documentos.length > 0) {
      throw new Error("Los documentos se cargan como archivos con POST /api/clientes/{id}/documentos una vez creado el cliente.");
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
    await validarCondicionYMoneda(conexion, opcional(cuerpo.condicionPagoId), opcional(cuerpo.monedaCodigoPredeterminada, 3)?.toUpperCase() ?? null);

    // Innominado: un único cliente por empresa (DEC-CLI-03). La barrera definitiva es el índice de NEX-023;
    // esta comprobación da el mensaje claro y funciona también antes de aplicar la migración.
    const identificacionExistente =
      tipoDocumento === "INNOMINADO" && naturaleza !== "CONTRIBUYENTE"
        ? await conexion.query(
            `SELECT 1 FROM clientes WHERE empresa_id = $1 AND tipo_documento = 'INNOMINADO' LIMIT 1`,
            [session.user.empresaId],
          )
        : await conexion.query(
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
      throw new Error(
        tipoDocumento === "INNOMINADO" && naturaleza !== "CONTRIBUYENTE"
          ? mensajeRestriccionCliente({ code: "23505", constraint: "clientes_empresa_innominado_key" }) ?? ""
          : "Ya existe un cliente con esa identificación.",
      );
    }

    // El nombre oficial del país sale del catálogo PostgreSQL; el cuerpo de la solicitud solo aporta el código.
    const paisCliente = await resolverPais(conexion, paisCodigo, "El país del cliente");

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
          observacion_logistica,
          telefono_ddi,
          celular_ddi,
          telefono_pais,
          telefono_area,
          celular_pais,
          celular_area,
          creado_por,
          carga_documentos_inicial_abierta,
          dia_mes_entrega
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
          $31, CASE WHEN $30::boolean THEN now() ELSE NULL END,
          CASE WHEN $30::boolean THEN $32::uuid ELSE NULL END,
          $33, $34, $35, $36, $37, $38, $39,
          $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51::uuid, true, $52
        )
        RETURNING id, codigo, razon_social
      `,
      [
        session.user.empresaId,
        NATURALEZA_RECEPTOR[naturaleza as keyof typeof NATURALEZA_RECEPTOR],
        TIPO_OPERACION_SIFEN[
          tipoOperacion as keyof typeof TIPO_OPERACION_SIFEN
        ],
        paisCliente.codigo,
        paisCliente.nombre,
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
        naturaleza === "CONTRIBUYENTE" || tipoDocumento !== "OTRO" ? null : descripcionDocumentoIdentidad,
        numeroDocumento,
        naturaleza === "CONTRIBUYENTE" ? dv : null,
        razonSocial,
        opcional(cuerpo.nombreFantasia, 255),
        email,
        emailCopia,
        telefonoFiscal.valor.numero,
        celularFiscal.valor.numero,
        decimalAcotado(cuerpo.limiteCredito, "El límite de crédito", LIMITE_CREDITO) ?? "0",
        opcional(cuerpo.condicionPagoId),
        opcional(cuerpo.listaPrecioId),
        opcional(cuerpo.grupoClienteId),
        opcional(cuerpo.monedaCodigoPredeterminada, 3)?.toUpperCase() ?? null,
        opcional(cuerpo.canalVentaId),
        opcional(cuerpo.codigoExterno, 100),
        opcional(cuerpo.gln, 13),
        decimalAcotado(cuerpo.descuentoComercialPct, "El descuento comercial", DESCUENTO_COMERCIAL) ?? "0",
        limiteCreditoTemporal,
        fechaVencimientoCredito,
        bloqueadoVentas,
        motivoBloqueoVentas,
        session.user.id,
        diaCobro.dia,
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
        telefonoFiscal.valor.ddi,
        celularFiscal.valor.ddi,
        telefonoFiscal.valor.pais,
        telefonoFiscal.valor.area,
        celularFiscal.valor.pais,
        celularFiscal.valor.area,
        session.user.id,
        frecuenciaEntrega === "MENSUAL" && leerDiaMes(cuerpo.diaMesEntrega) !== null ? leerDiaMes(cuerpo.diaMesEntrega) : null,
      ],
    );

    const cliente = clienteResultado.rows[0] as {
      id: string;
      codigo: string;
      razon_social: string;
    };

    for (const contacto of contactos) {
      const telContacto = validarTelefonoContacto(contacto, "telefono", 0);
      const celContacto = validarTelefonoContacto(contacto, "celular", 0);

      await conexion.query(
        `
          INSERT INTO cliente_contactos (
            empresa_id,
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
            recibe_notificaciones,
            telefono_pais,
            telefono_ddi,
            telefono_area,
            celular_pais,
            celular_ddi,
            celular_area
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20, $21
          )
        `,
        [
          session.user.empresaId,
          cliente.id,
          texto(contacto.nombre, 100),
          opcional(contacto.apellido, 100),
          opcional(contacto.cargo, 100),
          opcional(contacto.departamento, 100),
          telContacto.valor.numero,
          celContacto.valor.numero,
          opcional(contacto.email, 150),
          booleano(contacto.esPrincipal),
          booleano(contacto.recibePedidos),
          booleano(contacto.recibeFacturacion),
          booleano(contacto.recibeCobranzas),
          booleano(contacto.recibeDocumentosElectronicos),
          contacto.recibeNotificaciones !== false,
          telContacto.valor.pais,
          telContacto.valor.ddi,
          telContacto.valor.area,
          celContacto.valor.pais,
          celContacto.valor.ddi,
          celContacto.valor.area,
        ],
      );
    }

    for (const direccion of direcciones) {
      const tipo = texto(direccion.tipo).toUpperCase() || "COMERCIAL";
      const paisDireccion = await resolverPais(conexion, direccion.paisCodigo, "El país de la dirección");
      const geografia = await validarDireccionParaguay(conexion, direccion);

      await conexion.query(
        `
          INSERT INTO direcciones_cliente (
            empresa_id,
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
            $17, $18, $19, $20, $21, $22, $23, $24, $25
          )
        `,
        [
          session.user.empresaId,
          cliente.id,
          opcional(direccion.etiqueta, 100) ?? tipo,
          texto(direccion.direccion, 300),
          geografia ? geografia.ciudad : opcional(direccion.ciudad, 100),
          geografia ? geografia.departamento : opcional(direccion.departamento, 100),
          numeroOpcional(direccion.latitud, -90, 90),
          numeroOpcional(direccion.longitud, -180, 180),
          booleano(direccion.esFiscal) || tipo === "FISCAL",
          booleano(direccion.esEntregaDefault),
          tipo,
          opcional(direccion.etiqueta, 100),
          opcional(direccion.numeroCasa, 20),
          opcional(direccion.complemento, 200),
          paisDireccion.codigo,
          paisDireccion.nombre,
          geografia?.departamentoCodigo ?? null,
          geografia?.distritoCodigo ?? null,
          geografia ? geografia.distrito : opcional(direccion.distrito, 100),
          geografia?.ciudadCodigo ?? null,
          opcional(direccion.codigoPostal, 15),
          opcional(direccion.contactoNombre, 200),
          opcional(direccion.contactoTelefono, 30),
          opcional(direccion.horarioRecepcion, 200),
          opcional(direccion.observacion, 500),
        ],
      );
    }


    // Compuerta fiscal (decisión 10): el estado final del cliente nuevo (con sus direcciones y contactos) debe estar fiscalmente completo.
    const mensajeFiscal = mensajeRegularizacionFiscal(await evaluarAptitudCliente(conexion as never, session.user.empresaId, cliente.id));

    if (mensajeFiscal) throw new Error(mensajeFiscal);

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

    if (esErrorPostgres(error)) {
      const mensajeBd = mensajeRestriccionCliente(error as { code?: string; constraint?: string });

      if (mensajeBd) {
        return NextResponse.json(
          { error: mensajeBd },
          { status: error.code === "23505" ? 409 : 400 },
        );
      }
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