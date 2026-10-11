/**
 * Casos de regresión de Proveedores V1 (lógica pura + sincronización contra una conexión SIMULADA; no usa base de datos).
 * Cubre: decimales exactos, RUC/DV y documentos del exterior, límites y errores con campo/pestaña, fechas, bancos (SWIFT/IBAN),
 * conversión del formulario y, sobre todo, que la edición NUNCA borra y recrea las filas relacionadas.
 */
import { contador } from "@/lib/clientes/contador-casos";
import { MONTO_18_2, PORCENTAJE_5_2, decimalExacto } from "@/lib/proveedores/decimal";
import { ErrorValidacion } from "@/lib/proveedores/errores";
import { esFechaIsoReal, hoyAsuncion, isoALocal, localAIso } from "@/lib/proveedores/fechas";
import { formularioAPayload, formularioDesdeDetalle, formularioInicial } from "@/lib/proveedores/formulario";
import { validarIdentificacion } from "@/lib/proveedores/identificacion";
import { normalizarProveedor } from "@/lib/proveedores/normalizar";
import { idCampo, pestanaDeCampo } from "@/lib/proveedores/pestanas";
import { validarIban, validarSwift } from "@/lib/proveedores/bancos";
import { sincronizarHijos } from "@/lib/proveedores/sincronizar";

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const PROV = "22222222-2222-4222-8222-222222222222";
const USUARIO = "33333333-3333-4333-8333-333333333333";
const FILA_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FILA_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FILA_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function base(extra: Record<string, unknown> = {}) {
  return { tipoDocumento: "RUC", numeroDocumento: "80000005", dv: "6", razonSocial: "Proveedor Prueba S.A.", paisCodigo: "PRY", ...extra };
}

function fallaCon(fn: () => unknown): ErrorValidacion | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof ErrorValidacion ? e : null;
  }
}

type Consulta = { sql: string; parametros: unknown[] };

/** Conexión simulada: devuelve filas existentes para el SELECT de bloqueo y registra todo lo demás. */
function conexionSimulada(existentes: Record<string, Array<Record<string, unknown>>>) {
  const consultas: Consulta[] = [];
  let secuencia = 0;

  return {
    consultas,
    conexion: {
      async query(sql: string, parametros: unknown[] = []) {
        consultas.push({ sql, parametros });
        const tabla = /FROM (proveedor_\w+) t WHERE proveedor_id/.exec(sql)?.[1];

        if (tabla && /to_jsonb\(t\.\*\) AS fila/.test(sql)) return { rows: (existentes[tabla] ?? []).map((fila) => ({ fila })), rowCount: (existentes[tabla] ?? []).length };
        if (/^\s*UPDATE/.test(sql)) return { rows: [{ anterior: { id: parametros[0], nombre: "viejo" }, nuevo: { id: parametros[0], nombre: "nuevo" } }], rowCount: 1 };
        if (/^\s*INSERT INTO proveedor_(?!eventos)/.test(sql)) {
          secuencia += 1;
          return { rows: [{ id: `dddddddd-dddd-4ddd-8ddd-${String(secuencia).padStart(12, "0")}`, fila: { id: "x" } }], rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      },
    } as never,
  };
}

export async function verificarCasosProveedores(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, condicion: boolean) => igual(nombre, condicion, true);
  const campoDe = (nombre: string, fn: () => unknown, campo: string, pestana: string | null) => {
    const e = fallaCon(fn);

    igual(`${nombre} (campo)`, e?.campo ?? null, campo);
    igual(`${nombre} (pestaña)`, e?.pestana ?? null, pestana);
  };

  // ── Decimales exactos (PRV-A10)
  const dec = (v: unknown, r = MONTO_18_2) => {
    const x = decimalExacto(v, r, "El valor");
    return x.ok ? x.valor : `ERROR:${x.error}`;
  };

  igual("decimal 10 → 10.00", dec("10"), "10.00");
  igual("decimal 10.5 → 10.50", dec("10.5"), "10.50");
  igual("decimal ceros a la izquierda", dec("007.10"), "7.10");
  igual("decimal vacío → null", dec(""), null);
  igual("decimal 16 enteros", dec("9999999999999999.99"), "9999999999999999.99");
  cierto("decimal 17 enteros rechazado", String(dec("10000000000000000")).startsWith("ERROR"));
  cierto("decimal 3 decimales rechazado (sin redondeo)", String(dec("1.005")).startsWith("ERROR"));
  igual("decimal 1.500 se acepta (ceros finales)", dec("1.500"), "1.50");
  cierto("decimal coma rechazada", String(dec("1,5")).startsWith("ERROR"));
  cierto("decimal miles rechazado", String(dec("1.234,50")).startsWith("ERROR"));
  cierto("decimal negativo rechazado", String(dec("-1")).startsWith("ERROR"));
  cierto("decimal letras rechazado", String(dec("abc12")).startsWith("ERROR"));
  cierto("decimal notación científica rechazada", String(dec("1e3")).startsWith("ERROR"));
  igual("porcentaje 100.00 válido", dec("100", PORCENTAJE_5_2), "100.00");
  cierto("porcentaje 100.01 rechazado", String(dec("100.01", PORCENTAJE_5_2)).startsWith("ERROR"));
  igual("porcentaje 0 → 0.00", dec("0", PORCENTAJE_5_2), "0.00");
  igual("precisión: 0.10 + 0.20 no se opera en float", dec("0.30"), "0.30");
  igual("número JS entero aceptado", dec(25), "25.00");

  // ── Fechas
  cierto("fecha real", esFechaIsoReal("2026-02-28"));
  cierto("fecha 29/02 año no bisiesto", !esFechaIsoReal("2026-02-29"));
  cierto("fecha 29/02 bisiesto", esFechaIsoReal("2028-02-29"));
  igual("ISO → local", isoALocal("2026-10-11"), "11/10/2026");
  igual("local → ISO", localAIso("11/10/2026"), "2026-10-11");
  igual("local vacío → vacío", localAIso(""), "");
  igual("local inválido → null", localAIso("31/02/2026"), null);
  igual("local formato incorrecto → null", localAIso("2026-10-11"), null);
  cierto("hoy en Asunción es ISO", /^\d{4}-\d{2}-\d{2}$/.test(hoyAsuncion()));
  igual("hoy Asunción cruza la medianoche UTC", hoyAsuncion(new Date("2026-10-11T01:30:00Z")), "2026-10-10");

  // ── RUC / DV (PRV-A01) y documentos del exterior (DEC-PRV-05)
  const ident = (pais: string, tipo: string, numero: string, dv: string) => validarIdentificacion({ paisCodigo: pais, tipoDocumento: tipo, numeroDocumento: numero, dv });

  cierto("RUC válido 80000005-6", ident("PRY", "RUC", "80000005", "6").ok);
  cierto("RUC 800-1", ident("PRY", "RUC", "800", "1").ok);
  cierto("RUC 031-0 (resto 0)", ident("PRY", "RUC", "031", "0").ok);
  cierto("RUC 300-0 (resto 1)", ident("PRY", "RUC", "300", "0").ok);
  cierto("RUC con DV incorrecto rechazado", !ident("PRY", "RUC", "80000005", "5").ok);
  cierto("RUC sin DV rechazado", !ident("PRY", "RUC", "80000005", "").ok);
  cierto("RUC de 2 dígitos rechazado", !ident("PRY", "RUC", "12", "1").ok);
  cierto("RUC de 9 dígitos rechazado (DV pegado)", !ident("PRY", "RUC", "800000056", "6").ok);
  cierto("RUC con letras rechazado", !ident("PRY", "RUC", "12A45", "1").ok);
  cierto("RUC con guion rechazado", !ident("PRY", "RUC", "800-0", "1").ok);
  cierto("Paraguay exige RUC", !ident("PRY", "PASAPORTE", "AB123", "").ok);
  igual("Paraguay con tipo distinto: campo", (ident("PRY", "OTRO", "X1", "") as { campo?: string }).campo, "tipoDocumento");
  igual("RUC con DV incorrecto: campo", (ident("PRY", "RUC", "80000005", "5") as { campo?: string }).campo, "dv");
  cierto("exterior: ID fiscal sin DV", ident("ARG", "ID_FISCAL", "30-71234567-8", "").ok);
  cierto("exterior no exige RUC paraguayo", ident("BRA", "OTRO", "12.345.678/0001-95", "").ok);
  cierto("exterior con DV rechazado", !ident("ARG", "ID_FISCAL", "30712345678", "5").ok);
  cierto("exterior con espacios rechazado", !ident("ARG", "ID_FISCAL", "30 71", "").ok);
  igual("exterior en mayúsculas", (ident("USA", "ID_FISCAL", "ab-123", "") as { datos?: { numeroDocumento: string } }).datos?.numeroDocumento, "AB-123");
  cierto("exterior con RUC paraguayo sigue validando el DV", !ident("ARG", "RUC", "80000005", "1").ok);
  igual("ceros a la izquierda se conservan", (ident("PRY", "RUC", "001", "9") as { datos?: { numeroDocumento: string } }).datos?.numeroDocumento, "001");

  // ── Banca internacional (opcional)
  cierto("SWIFT 8", validarSwift("BCOEPYPA").ok);
  cierto("SWIFT 11", validarSwift("BCOEPYPA123").ok);
  cierto("SWIFT minúsculas se normaliza", validarSwift("bcoepypa").ok);
  cierto("SWIFT de 9 rechazado", !validarSwift("BCOEPYPA1").ok);
  cierto("IBAN ES válido", validarIban("ES91 2100 0418 4502 0005 1332").ok);
  cierto("IBAN DE válido", validarIban("DE89370400440532013000").ok);
  cierto("IBAN con control incorrecto", !validarIban("ES91 2100 0418 4502 0005 1333").ok);
  cierto("IBAN sin estructura", !validarIban("12345").ok);

  // ── Normalización: límites y errores con campo y pestaña
  cierto("cuerpo mínimo válido", fallaCon(() => normalizarProveedor(base())) === null);
  igual("descuento por defecto", normalizarProveedor(base()).descuentoComercialPct, "0.00");
  igual("monto por defecto", normalizarProveedor(base()).montoMinimoCompra, "0.00");
  igual("razón social de 255 caracteres", normalizarProveedor(base({ razonSocial: "A".repeat(255) })).razonSocial.length, 255);
  campoDe("razón social de 256", () => normalizarProveedor(base({ razonSocial: "A".repeat(256) })), "razonSocial", "general");
  campoDe("fantasía de 256", () => normalizarProveedor(base({ nombreFantasia: "A".repeat(256) })), "nombreFantasia", "general");
  campoDe("razón social vacía", () => normalizarProveedor(base({ razonSocial: "  " })), "razonSocial", "general");
  campoDe("email inválido", () => normalizarProveedor(base({ email: "sin-arroba" })), "email", "general");
  campoDe("sitio web ftp", () => normalizarProveedor(base({ sitioWeb: "ftp://x.com" })), "sitioWeb", "general");
  campoDe("observación > 2000", () => normalizarProveedor(base({ observacion: "x".repeat(2001) })), "observacion", "general");
  campoDe("día de pago 32", () => normalizarProveedor(base({ diaPagoPreferido: "32" })), "diaPagoPreferido", "compras");
  campoDe("día de pago 0", () => normalizarProveedor(base({ diaPagoPreferido: "0" })), "diaPagoPreferido", "compras");
  igual("día de pago 31", normalizarProveedor(base({ diaPagoPreferido: "31" })).diaPagoPreferido, 31);
  campoDe("plazo negativo", () => normalizarProveedor(base({ plazoEntregaDias: "-1" })), "plazoEntregaDias", "compras");
  campoDe("plazo decimal", () => normalizarProveedor(base({ plazoEntregaDias: "1.5" })), "plazoEntregaDias", "compras");
  campoDe("descuento 100.5", () => normalizarProveedor(base({ descuentoComercialPct: "100.5" })), "descuentoComercialPct", "compras");
  campoDe("monto con 3 decimales", () => normalizarProveedor(base({ montoMinimoCompra: "1.234" })), "montoMinimoCompra", "compras");
  campoDe("fin antes que inicio", () => normalizarProveedor(base({ fechaInicioRelacion: "2026-05-02", fechaFinRelacion: "2026-05-01" })), "fechaFinRelacion", "compras");
  campoDe("fecha inexistente", () => normalizarProveedor(base({ fechaInicioRelacion: "2026-02-30" })), "fechaInicioRelacion", "compras");
  campoDe("transporte inválido", () => normalizarProveedor(base({ metodoTransportePreferido: "CAMION" })), "metodoTransportePreferido", "homologacion");
  campoDe("condición de entrega > 500", () => normalizarProveedor(base({ condicionEntrega: "x".repeat(501) })), "condicionEntrega", "homologacion");
  campoDe("RUC con DV incorrecto en el cuerpo", () => normalizarProveedor(base({ dv: "0" })), "dv", "general");
  igual("DV se devuelve calculado", normalizarProveedor(base()).dv, "6");
  igual("exterior: DV nulo", normalizarProveedor({ tipoDocumento: "ID_FISCAL", numeroDocumento: "abc1", razonSocial: "Foreign Inc", paisCodigo: "USA" }).dv, null);
  igual("País por defecto PRY", normalizarProveedor({ tipoDocumento: "RUC", numeroDocumento: "80000005", dv: "6", razonSocial: "X" }).paisCodigo, "PRY");
  igual("pestaña de campo anidado", pestanaDeCampo("cuentasBancarias.2.iban"), "bancos");
  igual("pestaña de campo desconocido", pestanaDeCampo("xyz"), null);
  igual("id DOM del campo", idCampo("contactos.0.nombre"), "prv-contactos-0-nombre");

  // ── Contactos
  const conContactos = (contactos: unknown[]) => normalizarProveedor(base({ contactos }));

  campoDe("contacto sin nombre", () => conContactos([{ nombre: "" }]), "contactos.0.nombre", "contactos");
  campoDe("dos contactos principales", () => conContactos([{ nombre: "A", esPrincipal: true }, { nombre: "B", esPrincipal: true }]), "contactos.1.esPrincipal", "contactos");
  campoDe("correo de contacto inválido", () => conContactos([{ nombre: "A", email: "x" }]), "contactos.0.email", "contactos");
  campoDe("nombre de contacto > 100", () => conContactos([{ nombre: "A".repeat(101) }]), "contactos.0.nombre", "contactos");
  const c0 = conContactos([{ nombre: "A", recibePagos: true, esPrincipal: true }]).contactos[0];
  igual("contacto: principal y preferencias", [c0.esPrincipal, c0.recibePagos, c0.recibeCotizaciones, c0.recibeNotificaciones], [true, true, false, true]);
  igual("contacto nuevo sin UUID → id nulo", conContactos([{ id: "nuevo-contacto-1", nombre: "A" }]).contactos[0].id, null);
  igual("contacto persistido conserva su id", conContactos([{ id: FILA_A, nombre: "A" }]).contactos[0].id, FILA_A);

  // ── Direcciones
  const conDirs = (direcciones: unknown[]) => normalizarProveedor(base({ direcciones }));
  const dirPy = { tipo: "FISCAL", descripcion: "Casa matriz", direccion: "Av. X 123", paisCodigo: "PRY", departamentoCodigo: "11", distritoCodigo: "1", ciudadCodigo: "1" };

  cierto("dirección PY completa", fallaCon(() => conDirs([dirPy])) === null);
  campoDe("dirección sin descripción", () => conDirs([{ ...dirPy, descripcion: "" }]), "direcciones.0.descripcion", "direcciones");
  campoDe("dirección sin calle", () => conDirs([{ ...dirPy, direccion: " " }]), "direcciones.0.direccion", "direcciones");
  campoDe("dirección PY sin departamento", () => conDirs([{ ...dirPy, departamentoCodigo: "" }]), "direcciones.0.departamentoCodigo", "direcciones");
  campoDe("dos principales del mismo tipo", () => conDirs([{ ...dirPy, esPrincipal: true }, { ...dirPy, esPrincipal: true }]), "direcciones.1.esPrincipal", "direcciones");
  cierto("principales de tipos distintos", fallaCon(() => conDirs([{ ...dirPy, esPrincipal: true }, { ...dirPy, tipo: "RETIRO", esPrincipal: true }])) === null);
  campoDe("tipo de dirección inválido", () => conDirs([{ ...dirPy, tipo: "XX" }]), "direcciones.0.tipo", "direcciones");
  campoDe("código postal > 30", () => conDirs([{ ...dirPy, codigoPostal: "1".repeat(31) }]), "direcciones.0.codigoPostal", "direcciones");
  const ext = conDirs([{ tipo: "COMERCIAL", descripcion: "Depósito", direccion: "Main St", paisCodigo: "USA", departamento: "TX", ciudad: "Austin", codigoPostal: "78701-A" }]).direcciones[0];
  igual("dirección exterior: sin códigos, con texto y código postal", [ext.departamentoCodigo, ext.departamento, ext.codigoPostal], [null, "TX", "78701-A"]);

  // ── Cuentas bancarias
  const conCuentas = (cuentasBancarias: unknown[]) => normalizarProveedor(base({ cuentasBancarias }));
  const cta = { banco: "Banco X", titular: "Prov SA", numeroCuenta: "000123", monedaCodigo: "PYG" };

  cierto("cuenta mínima", fallaCon(() => conCuentas([cta])) === null);
  igual("número de cuenta conserva ceros", conCuentas([cta]).cuentasBancarias[0].numeroCuenta, "000123");
  campoDe("cuenta sin banco", () => conCuentas([{ ...cta, banco: "" }]), "cuentasBancarias.0.banco", "bancos");
  campoDe("cuenta sin titular", () => conCuentas([{ ...cta, titular: "" }]), "cuentasBancarias.0.titular", "bancos");
  campoDe("cuenta sin número", () => conCuentas([{ ...cta, numeroCuenta: "" }]), "cuentasBancarias.0.numeroCuenta", "bancos");
  campoDe("cuenta sin moneda", () => conCuentas([{ ...cta, monedaCodigo: "" }]), "cuentasBancarias.0.monedaCodigo", "bancos");
  campoDe("SWIFT inválido", () => conCuentas([{ ...cta, codigoSwift: "ABC" }]), "cuentasBancarias.0.codigoSwift", "bancos");
  campoDe("IBAN inválido", () => conCuentas([{ ...cta, iban: "ES91 2100 0418 4502 0005 1333" }]), "cuentasBancarias.0.iban", "bancos");
  campoDe("dos principales de la misma moneda", () => conCuentas([{ ...cta, esPrincipal: true }, { ...cta, numeroCuenta: "2", esPrincipal: true }]), "cuentasBancarias.1.esPrincipal", "bancos");
  cierto("principales de monedas distintas (DEC-PRV-07)", fallaCon(() => conCuentas([{ ...cta, esPrincipal: true }, { ...cta, numeroCuenta: "2", monedaCodigo: "USD", esPrincipal: true }])) === null);
  campoDe("número de cuenta duplicado en el envío", () => conCuentas([cta, { ...cta }]), "cuentasBancarias.1.numeroCuenta", "bancos");
  campoDe("tipo de cuenta inválido", () => conCuentas([{ ...cta, tipoCuenta: "XX" }]), "cuentasBancarias.0.tipoCuenta", "bancos");

  // ── Retenciones
  const conRet = (retenciones: unknown[]) => normalizarProveedor(base({ retenciones }));
  const ret = { tipo: "IVA", porcentaje: "30" };

  igual("retención: porcentaje exacto", conRet([ret]).retenciones[0].porcentaje, "30.00");
  campoDe("retención sin porcentaje", () => conRet([{ tipo: "IVA" }]), "retenciones.0.porcentaje", "retenciones");
  campoDe("retención 100.01", () => conRet([{ ...ret, porcentaje: "100.01" }]), "retenciones.0.porcentaje", "retenciones");
  campoDe("retención tipo inválido", () => conRet([{ ...ret, tipo: "X" }]), "retenciones.0.tipo", "retenciones");
  campoDe("vigencia invertida", () => conRet([{ ...ret, fechaVigenciaDesde: "2026-02-01", fechaVigenciaHasta: "2026-01-01" }]), "retenciones.0.fechaVigenciaHasta", "retenciones");
  campoDe("impuesto no UUID", () => conRet([{ ...ret, impuestoId: "abc" }]), "retenciones.0.impuestoId", "retenciones");
  campoDe("observación de retención > 1000", () => conRet([{ ...ret, observacion: "x".repeat(1001) }]), "retenciones.0.observacion", "retenciones");
  igual("retención: certificado obligatorio", conRet([{ ...ret, certificadoObligatorio: true }]).retenciones[0].certificadoObligatorio, true);

  // ── Eliminaciones explícitas
  igual("eliminaciones: solo UUID válidos", normalizarProveedor(base({ eliminaciones: { contactos: [FILA_A, "nuevo-1", FILA_A] } })).eliminaciones.contactos, [FILA_A]);

  // ── Formulario ⇄ API
  const f = formularioInicial();

  f.razonSocial = "Proveedor SA";
  f.numeroDocumento = "80000005";
  f.dv = "6";
  f.fechaInicioRelacion = "11/10/2026";
  igual("formulario → payload: fecha ISO", formularioAPayload(f, "crear").fechaInicioRelacion, "2026-10-11");
  igual("formulario → payload: sin versión al crear", "version" in formularioAPayload(f, "crear"), false);
  igual("formulario → payload: versión al editar", "version" in formularioAPayload(f, "editar"), true);
  f.fechaFinRelacion = "31/02/2026";
  campoDe("formulario: fecha inválida", () => formularioAPayload(f, "crear"), "fechaFinRelacion", "compras");
  f.fechaFinRelacion = "";
  igual("formulario inicial válido para el servidor", fallaCon(() => normalizarProveedor(formularioAPayload(f, "crear"))), null);
  igual("formulario: grupo vacío → null", formularioAPayload(f, "crear").grupoProveedorId, null);
  igual("detalle → formulario: fechas locales", formularioDesdeDetalle({ ...detalleBase(), fechaInicioRelacion: "2026-10-11" }).fechaInicioRelacion, "11/10/2026");
  igual("detalle → formulario: decimales como texto", formularioDesdeDetalle(detalleBase()).montoMinimoCompra, "1234.50");

  // ── Sincronización SELECTIVA (PRV-A09): nunca borrar y recrear
  const partes = (r: ReturnType<typeof conexionSimulada>) => ({
    deletes: r.consultas.filter((c) => /^\s*DELETE/.test(c.sql)),
    updates: r.consultas.filter((c) => /^\s*UPDATE/.test(c.sql)),
    inserts: r.consultas.filter((c) => /^\s*INSERT INTO proveedor_(?!eventos)/.test(c.sql)),
    eventos: r.consultas.filter((c) => /INSERT INTO proveedor_eventos/.test(c.sql)),
  });
  const filaContacto = (id: string, extra: Record<string, unknown> = {}) => ({ id, nombre: "A", es_principal: false, ...extra });

  // 1) Sin cambios de membresía: solo actualiza; ningún DELETE ni INSERT
  const s1 = conexionSimulada({ proveedor_contactos: [filaContacto(FILA_A), filaContacto(FILA_B)] });
  await sincronizarHijos(s1.conexion, EMPRESA, PROV, normalizarProveedor(base({ contactos: [{ id: FILA_A, nombre: "A" }, { id: FILA_B, nombre: "B" }] })), USUARIO);
  igual("sync 1: ningún DELETE", partes(s1).deletes.length, 0);
  igual("sync 1: ningún INSERT de filas", partes(s1).inserts.length, 0);
  igual("sync 1: dos UPDATE (por id)", partes(s1).updates.length, 2);
  cierto("sync 1: UPDATE filtra por empresa y proveedor", partes(s1).updates.every((u) => u.parametros[1] === PROV && u.parametros[2] === EMPRESA));
  cierto("sync 1: UPDATE solo si algo cambió (IS DISTINCT FROM)", partes(s1).updates.every((u) => /IS DISTINCT FROM/.test(u.sql)));

  // 2) Una fila ausente del envío NO se elimina
  const s2 = conexionSimulada({ proveedor_contactos: [filaContacto(FILA_A), filaContacto(FILA_B)] });
  await sincronizarHijos(s2.conexion, EMPRESA, PROV, normalizarProveedor(base({ contactos: [{ id: FILA_A, nombre: "A" }] })), USUARIO);
  igual("sync 2: la fila omitida no se borra", partes(s2).deletes.length, 0);

  // 3) Eliminación solo si es explícita, con auditoría de la fila completa
  const s3 = conexionSimulada({ proveedor_contactos: [filaContacto(FILA_A), filaContacto(FILA_B)] });
  await sincronizarHijos(s3.conexion, EMPRESA, PROV, normalizarProveedor(base({ contactos: [{ id: FILA_A, nombre: "A" }], eliminaciones: { contactos: [FILA_B] } })), USUARIO);
  igual("sync 3: un DELETE explícito", partes(s3).deletes.length, 1);
  igual("sync 3: DELETE del id pedido", partes(s3).deletes[0]?.parametros[0], FILA_B);
  cierto("sync 3: la baja queda auditada con la fila completa", partes(s3).eventos.some((e) => e.parametros[4] === "BAJA" && /"nombre":"A"/.test(String(e.parametros[5]))));

  // 4) Filas nuevas se insertan sin tocar las existentes
  const s4 = conexionSimulada({ proveedor_contactos: [filaContacto(FILA_A)] });
  await sincronizarHijos(s4.conexion, EMPRESA, PROV, normalizarProveedor(base({ contactos: [{ id: FILA_A, nombre: "A" }, { id: "nuevo-x", nombre: "N" }] })), USUARIO);
  igual("sync 4: un INSERT para la fila nueva", partes(s4).inserts.length, 1);
  igual("sync 4: ningún DELETE", partes(s4).deletes.length, 0);
  cierto("sync 4: el alta queda auditada", partes(s4).eventos.some((e) => e.parametros[4] === "ALTA"));

  // 5) Identificadores ajenos o inexistentes se rechazan (no se insertan ni se pisan)
  const s5 = conexionSimulada({ proveedor_contactos: [filaContacto(FILA_A)] });
  const e5 = await sincronizarHijos(s5.conexion, EMPRESA, PROV, normalizarProveedor(base({ contactos: [{ id: FILA_C, nombre: "X" }] })), USUARIO).then(() => null, (e) => e as ErrorValidacion);
  igual("sync 5: id desconocido → conflicto 409", e5 instanceof ErrorValidacion ? e5.estado : null, 409);
  igual("sync 5: nada se escribió", partes(s5).updates.length + partes(s5).inserts.length + partes(s5).deletes.length, 0);

  // 6) Eliminar una fila inexistente se rechaza
  const s6 = conexionSimulada({ proveedor_contactos: [filaContacto(FILA_A)] });
  const e6 = await sincronizarHijos(s6.conexion, EMPRESA, PROV, normalizarProveedor(base({ eliminaciones: { contactos: [FILA_C] } })), USUARIO).then(() => null, (e) => e as ErrorValidacion);
  igual("sync 6: eliminar inexistente → 409", e6 instanceof ErrorValidacion ? e6.estado : null, 409);

  // 7) Modificar y eliminar la misma fila a la vez es contradictorio
  const s7 = conexionSimulada({ proveedor_contactos: [filaContacto(FILA_A)] });
  const e7 = await sincronizarHijos(s7.conexion, EMPRESA, PROV, normalizarProveedor(base({ contactos: [{ id: FILA_A, nombre: "A" }], eliminaciones: { contactos: [FILA_A] } })), USUARIO).then(() => null, (e) => e as ErrorValidacion);
  igual("sync 7: modificar y eliminar a la vez → 400", e7 instanceof ErrorValidacion ? e7.estado : null, 400);

  // 8) Intercambio de contacto principal: primero se desmarca el anterior (el índice admite una sola principal)
  const s8 = conexionSimulada({ proveedor_contactos: [filaContacto(FILA_A, { es_principal: true }), filaContacto(FILA_B)] });
  await sincronizarHijos(s8.conexion, EMPRESA, PROV, normalizarProveedor(base({ contactos: [{ id: FILA_B, nombre: "B", esPrincipal: true }, { id: FILA_A, nombre: "A", esPrincipal: false }] })), USUARIO);
  igual("sync 8: primero se actualiza el que deja de ser principal", partes(s8).updates[0]?.parametros[0], FILA_A);

  // 9) Ningún SQL de la sincronización borra en bloque
  const todo = [s1, s2, s3, s4, s8].flatMap((r) => r.consultas.map((c) => c.sql));
  cierto("sync 9: jamás DELETE sin id", todo.filter((q) => /^\s*DELETE/.test(q)).every((q) => /WHERE id = \$1/.test(q)));

  return fallos;
}

function detalleBase() {
  return {
    id: PROV,
    codigo: "PRV-000001",
    version: "2026-10-11T00:00:00.000000",
    tipoPersona: "JURIDICA" as const,
    grupoProveedorId: null,
    tipoDocumento: "RUC",
    numeroDocumento: "80000005",
    dv: "6",
    razonSocial: "X",
    nombreFantasia: "",
    paisCodigo: "PRY",
    paisNombre: "Paraguay",
    email: "",
    telefono: "",
    sitioWeb: "",
    condicionPagoId: null,
    monedaCodigoPredeterminada: "PYG",
    medioPagoPreferidoId: null,
    diaPagoPreferido: null,
    plazoEntregaDias: null,
    descuentoComercialPct: "0.00",
    montoMinimoCompra: "1234.50",
    permiteAnticipos: false,
    requiereOrdenCompra: false,
    emailPagos: "",
    fechaInicioRelacion: "",
    fechaFinRelacion: "",
    estadoHomologacion: "PENDIENTE" as const,
    fechaHomologacion: "",
    fechaVencimientoHomologacion: "",
    nivelRiesgo: "NO_EVALUADO" as const,
    calificacionActual: null,
    incotermCodigo: "",
    condicionEntrega: "",
    metodoTransportePreferido: "",
    diasConfirmacionPedido: null,
    permiteEntregaParcial: true,
    contactos: [],
    direcciones: [],
    cuentasBancarias: [],
    retenciones: [],
    documentos: [],
    observacion: "",
    activo: true,
    creadoEn: "",
    actualizadoEn: "",
  };
}
