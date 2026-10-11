/**
 * Validación y normalización PURA (sin base de datos) del cuerpo de Proveedores. La usan la API (POST/PUT) y el formulario, de modo
 * que la regla es una sola. Las comprobaciones que dependen de la base (catálogos, unicidad, geografía oficial) viven en shared.ts.
 *
 * Reglas: matriz normativa de Proveedores V1 + adenda de 14 correcciones. Nunca se trunca ni se redondea: lo que excede un límite
 * se rechaza con el campo y la pestaña de origen. Los gobernados (homologación, riesgo, bloqueo) NO se normalizan aquí: tienen
 * acciones propias y auditadas.
 */
import { ErrorValidacion } from "@/lib/proveedores/errores";
import { MONTO_18_2, PORCENTAJE_5_2, decimalExacto } from "@/lib/proveedores/decimal";
import { esFechaIsoReal } from "@/lib/proveedores/fechas";
import { validarIdentificacion } from "@/lib/proveedores/identificacion";
import { validarIban, validarSwift } from "@/lib/proveedores/bancos";

export const LIMITE_NOMBRE = 255;

export const TIPOS_DIRECCION = ["FISCAL", "COMERCIAL", "RETIRO", "PAGOS", "OTRA"] as const;
export const TIPOS_CUENTA = ["CORRIENTE", "AHORRO", "CAJA_AHORRO", "OTRA"] as const;
export const TIPOS_RETENCION = ["IVA", "RENTA", "OTRA"] as const;
export const METODOS_TRANSPORTE = ["TERRESTRE", "MARITIMO", "AEREO", "FERROVIARIO", "MULTIMODAL", "OTRO"] as const;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Crudo = Record<string, unknown>;

export type ContactoNormalizado = {
  id: string | null;
  nombre: string;
  apellido: string | null;
  cargo: string | null;
  departamento: string | null;
  telefono: string | null;
  celular: string | null;
  email: string | null;
  esPrincipal: boolean;
  recibeCotizaciones: boolean;
  recibeOrdenesCompra: boolean;
  recibeLogistica: boolean;
  recibeDevoluciones: boolean;
  recibePagos: boolean;
  recibeCalidad: boolean;
  recibeNotificaciones: boolean;
};

export type DireccionNormalizada = {
  id: string | null;
  tipo: (typeof TIPOS_DIRECCION)[number];
  descripcion: string;
  direccion: string;
  numeroCasa: string | null;
  paisCodigo: string;
  departamentoCodigo: number | null;
  distritoCodigo: number | null;
  ciudadCodigo: number | null;
  departamento: string | null;
  distrito: string | null;
  ciudad: string | null;
  codigoPostal: string | null;
  esPrincipal: boolean;
};

export type CuentaNormalizada = {
  id: string | null;
  banco: string;
  sucursalBanco: string | null;
  titular: string;
  documentoTitular: string | null;
  tipoCuenta: (typeof TIPOS_CUENTA)[number];
  numeroCuenta: string;
  monedaCodigo: string;
  aliasCuenta: string | null;
  codigoSwift: string | null;
  iban: string | null;
  esPrincipal: boolean;
};

export type RetencionNormalizada = {
  id: string | null;
  tipo: (typeof TIPOS_RETENCION)[number];
  impuestoId: string | null;
  porcentaje: string;
  certificadoObligatorio: boolean;
  activa: boolean;
  documentoCertificadoId: string | null;
  fechaVigenciaDesde: string | null;
  fechaVigenciaHasta: string | null;
  observacion: string | null;
};

export type Eliminaciones = { contactos: string[]; direcciones: string[]; cuentasBancarias: string[]; retenciones: string[] };

export type DatosProveedor = {
  tipoPersona: "FISICA" | "JURIDICA";
  grupoProveedorId: string | null;
  tipoDocumento: string;
  numeroDocumento: string;
  dv: string | null;
  razonSocial: string;
  nombreFantasia: string | null;
  paisCodigo: string;
  email: string | null;
  telefono: string | null;
  sitioWeb: string | null;
  activo: boolean;
  observacion: string | null;
  condicionPagoId: string | null;
  monedaCodigo: string | null;
  medioPagoId: string | null;
  diaPagoPreferido: number | null;
  plazoEntregaDias: number | null;
  descuentoComercialPct: string;
  montoMinimoCompra: string;
  permiteAnticipos: boolean;
  requiereOrdenCompra: boolean;
  emailPagos: string | null;
  fechaInicioRelacion: string | null;
  fechaFinRelacion: string | null;
  incotermCodigo: string | null;
  condicionEntrega: string | null;
  metodoTransporte: string | null;
  diasConfirmacionPedido: number | null;
  permiteEntregaParcial: boolean;
  contactos: ContactoNormalizado[];
  direcciones: DireccionNormalizada[];
  cuentasBancarias: CuentaNormalizada[];
  retenciones: RetencionNormalizada[];
  eliminaciones: Eliminaciones;
};

function bad(mensaje: string, campo: string): never {
  throw new ErrorValidacion(mensaje, campo);
}

function crudo(valor: unknown): Crudo {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor) ? (valor as Crudo) : {};
}

function texto(valor: unknown, campo: string, etiqueta: string, maximo: number): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor !== "string") return bad(`${etiqueta} no es válido.`, campo);

  const limpio = valor.trim();

  if (limpio.length > maximo) return bad(`${etiqueta} supera el máximo de ${maximo} caracteres.`, campo);

  return limpio;
}

function opcional(valor: unknown, campo: string, etiqueta: string, maximo: number): string | null {
  return texto(valor, campo, etiqueta, maximo) || null;
}

function obligatorio(valor: unknown, campo: string, etiqueta: string, maximo: number): string {
  const t = texto(valor, campo, etiqueta, maximo);

  return t || bad(`${etiqueta} es obligatorio.`, campo);
}

function booleano(valor: unknown, predeterminado: boolean): boolean {
  return valor === undefined || valor === null ? predeterminado : valor === true;
}

function entero(valor: unknown, campo: string, etiqueta: string, min: number, max?: number): number | null {
  if (valor === null || valor === undefined || valor === "") return null;

  const t = typeof valor === "number" ? String(valor) : typeof valor === "string" ? valor.trim() : "";

  if (!/^\d{1,9}$/.test(t)) return bad(`${etiqueta} debe ser un número entero.`, campo);

  const n = Number(t);

  if (n < min) return bad(`${etiqueta} no puede ser menor que ${min}.`, campo);
  if (max !== undefined && n > max) return bad(`${etiqueta} debe estar entre ${min} y ${max}.`, campo);

  return n;
}

function fechaIso(valor: unknown, campo: string, etiqueta: string): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor !== "string" || !esFechaIsoReal(valor.trim())) return bad(`${etiqueta} no es una fecha válida (dd/mm/aaaa).`, campo);

  return valor.trim();
}

function correo(valor: unknown, campo: string, etiqueta: string): string | null {
  const t = opcional(valor, campo, etiqueta, 150);

  if (t && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return bad(`${etiqueta} no es válido.`, campo);

  return t;
}

function uuidOpcional(valor: unknown, campo: string, etiqueta: string): string | null {
  const t = opcional(valor, campo, etiqueta, 36);

  if (t && !UUID.test(t)) return bad(`${etiqueta} no es válido.`, campo);

  return t;
}

/** Identificador de una fila hija: UUID persistido (se actualiza) o cualquier otro valor/ausente (fila nueva → null). */
export function idPersistido(valor: unknown): string | null {
  return typeof valor === "string" && UUID.test(valor.trim()) ? valor.trim().toLowerCase() : null;
}

function lista(valor: unknown, campo: string, etiqueta: string, maximo = 200): Crudo[] {
  if (valor === undefined || valor === null) return [];
  if (!Array.isArray(valor)) return bad(`${etiqueta} no tiene un formato válido.`, campo);
  if (valor.length > maximo) return bad(`${etiqueta}: máximo ${maximo} registros.`, campo);

  return valor.map(crudo);
}

function pares(inicio: string | null, fin: string | null, campoFin: string, mensaje: string) {
  if (inicio && fin && fin < inicio) bad(mensaje, campoFin);
}

export function normalizarContactos(valor: unknown): ContactoNormalizado[] {
  const filas = lista(valor, "contactos", "Los contactos");
  const salida = filas.map((c, i) => {
    const p = `contactos.${i}`;
    const n = i + 1;

    return {
      id: idPersistido(c.id),
      nombre: obligatorio(c.nombre, `${p}.nombre`, `El nombre del contacto ${n}`, 100),
      apellido: opcional(c.apellido, `${p}.apellido`, `El apellido del contacto ${n}`, 100),
      cargo: opcional(c.cargo, `${p}.cargo`, `El cargo del contacto ${n}`, 100),
      departamento: opcional(c.departamento, `${p}.departamento`, `El departamento del contacto ${n}`, 100),
      telefono: opcional(c.telefono, `${p}.telefono`, `El teléfono del contacto ${n}`, 50),
      celular: opcional(c.celular, `${p}.celular`, `El celular del contacto ${n}`, 50),
      email: correo(c.email, `${p}.email`, `El correo del contacto ${n}`),
      esPrincipal: booleano(c.esPrincipal, false),
      recibeCotizaciones: booleano(c.recibeCotizaciones, false),
      recibeOrdenesCompra: booleano(c.recibeOrdenesCompra, false),
      recibeLogistica: booleano(c.recibeLogistica, false),
      recibeDevoluciones: booleano(c.recibeDevoluciones, false),
      recibePagos: booleano(c.recibePagos, false),
      recibeCalidad: booleano(c.recibeCalidad, false),
      recibeNotificaciones: booleano(c.recibeNotificaciones, true),
    };
  });
  const principales = salida.flatMap((c, i) => (c.esPrincipal ? [i] : []));

  if (principales.length > 1) bad("Solo puede haber un contacto principal.", `contactos.${principales[1]}.esPrincipal`);

  return salida;
}

export function normalizarDirecciones(valor: unknown, paisProveedor: string): DireccionNormalizada[] {
  const filas = lista(valor, "direcciones", "Las direcciones");
  const principalesPorTipo = new Set<string>();

  return filas.map((d, i) => {
    const p = `direcciones.${i}`;
    const n = i + 1;
    const tipo = texto(d.tipo, `${p}.tipo`, `El tipo de la dirección ${n}`, 20).toUpperCase();

    if (!(TIPOS_DIRECCION as readonly string[]).includes(tipo)) bad(`Seleccione el tipo de la dirección ${n}.`, `${p}.tipo`);

    const paisCodigo = texto(d.paisCodigo, `${p}.paisCodigo`, `El país de la dirección ${n}`, 3).toUpperCase() || paisProveedor;

    if (!/^[A-Z]{3}$/.test(paisCodigo)) bad(`Seleccione el país de la dirección ${n}.`, `${p}.paisCodigo`);

    const esPY = paisCodigo === "PRY";
    const codigo = (v: unknown, campo: string, etiqueta: string) => {
      if (!esPY) return null;
      const num = entero(v, `${p}.${campo}`, etiqueta, 1);

      return num ?? bad(`Seleccione ${etiqueta.toLowerCase()} de la dirección ${n}.`, `${p}.${campo}`);
    };
    const esPrincipal = booleano(d.esPrincipal, false);

    if (esPrincipal) {
      if (principalesPorTipo.has(tipo)) bad(`Solo puede haber una dirección principal del tipo ${tipo}.`, `${p}.esPrincipal`);
      principalesPorTipo.add(tipo);
    }

    return {
      id: idPersistido(d.id),
      tipo: tipo as DireccionNormalizada["tipo"],
      descripcion: obligatorio(d.descripcion, `${p}.descripcion`, `La descripción de la dirección ${n}`, 150),
      direccion: obligatorio(d.direccion, `${p}.direccion`, `La dirección ${n}`, 300),
      numeroCasa: opcional(d.numeroCasa, `${p}.numeroCasa`, `El número de casa de la dirección ${n}`, 20),
      paisCodigo,
      departamentoCodigo: codigo(d.departamentoCodigo, "departamentoCodigo", "El departamento"),
      distritoCodigo: codigo(d.distritoCodigo, "distritoCodigo", "El distrito"),
      ciudadCodigo: codigo(d.ciudadCodigo, "ciudadCodigo", "La ciudad"),
      departamento: esPY ? null : opcional(d.departamento, `${p}.departamento`, `El departamento de la dirección ${n}`, 150),
      distrito: esPY ? null : opcional(d.distrito, `${p}.distrito`, `El distrito de la dirección ${n}`, 150),
      ciudad: esPY ? null : opcional(d.ciudad, `${p}.ciudad`, `La ciudad de la dirección ${n}`, 150),
      codigoPostal: opcional(d.codigoPostal, `${p}.codigoPostal`, `El código postal de la dirección ${n}`, 30),
      esPrincipal,
    };
  });
}

export function normalizarCuentas(valor: unknown): CuentaNormalizada[] {
  const filas = lista(valor, "cuentasBancarias", "Las cuentas bancarias");
  const principalesPorMoneda = new Set<string>();
  const numeros = new Set<string>();

  return filas.map((c, i) => {
    const p = `cuentasBancarias.${i}`;
    const n = i + 1;
    const tipoCuenta = (texto(c.tipoCuenta, `${p}.tipoCuenta`, `El tipo de la cuenta ${n}`, 20).toUpperCase() || "CORRIENTE") as CuentaNormalizada["tipoCuenta"];

    if (!(TIPOS_CUENTA as readonly string[]).includes(tipoCuenta)) bad(`Seleccione el tipo de la cuenta ${n}.`, `${p}.tipoCuenta`);

    const monedaCodigo = obligatorio(c.monedaCodigo, `${p}.monedaCodigo`, `La moneda de la cuenta ${n}`, 3).toUpperCase();
    const swift = opcional(c.codigoSwift, `${p}.codigoSwift`, `El SWIFT/BIC de la cuenta ${n}`, 30);
    const iban = opcional(c.iban, `${p}.iban`, `El IBAN de la cuenta ${n}`, 50);
    const rs = swift ? validarSwift(swift) : null;
    const ri = iban ? validarIban(iban) : null;

    if (rs && !rs.ok) bad(rs.error, `${p}.codigoSwift`);
    if (ri && !ri.ok) bad(ri.error, `${p}.iban`);

    const numeroCuenta = obligatorio(c.numeroCuenta, `${p}.numeroCuenta`, `El número de la cuenta ${n}`, 100);

    if (numeros.has(numeroCuenta)) bad(`El número de la cuenta ${n} está repetido en este proveedor.`, `${p}.numeroCuenta`);
    numeros.add(numeroCuenta);

    const esPrincipal = booleano(c.esPrincipal, false);

    if (esPrincipal) {
      if (principalesPorMoneda.has(monedaCodigo)) bad(`Solo puede haber una cuenta principal por moneda (${monedaCodigo}).`, `${p}.esPrincipal`);
      principalesPorMoneda.add(monedaCodigo);
    }

    return {
      id: idPersistido(c.id),
      banco: obligatorio(c.banco, `${p}.banco`, `El banco de la cuenta ${n}`, 150),
      sucursalBanco: opcional(c.sucursalBanco, `${p}.sucursalBanco`, `La sucursal de la cuenta ${n}`, 150),
      titular: obligatorio(c.titular, `${p}.titular`, `El titular de la cuenta ${n}`, 200),
      documentoTitular: opcional(c.documentoTitular, `${p}.documentoTitular`, `El documento del titular de la cuenta ${n}`, 100),
      tipoCuenta,
      numeroCuenta,
      monedaCodigo,
      aliasCuenta: opcional(c.aliasCuenta, `${p}.aliasCuenta`, `El alias de la cuenta ${n}`, 100),
      codigoSwift: rs && rs.ok ? rs.valor : null,
      iban: ri && ri.ok ? ri.valor : null,
      esPrincipal,
    };
  });
}

export function normalizarRetenciones(valor: unknown): RetencionNormalizada[] {
  const filas = lista(valor, "retenciones", "Las retenciones");

  return filas.map((r, i) => {
    const p = `retenciones.${i}`;
    const n = i + 1;
    const tipo = texto(r.tipo, `${p}.tipo`, `El tipo de la retención ${n}`, 20).toUpperCase();

    if (!(TIPOS_RETENCION as readonly string[]).includes(tipo)) bad(`Seleccione el tipo de la retención ${n}.`, `${p}.tipo`);

    const pct = decimalExacto(r.porcentaje, PORCENTAJE_5_2, `El porcentaje de la retención ${n}`);

    if (!pct.ok) bad(pct.error, `${p}.porcentaje`);
    if (pct.valor === null) bad(`Ingrese el porcentaje de la retención ${n}.`, `${p}.porcentaje`);

    const desde = fechaIso(r.fechaVigenciaDesde, `${p}.fechaVigenciaDesde`, `La vigencia inicial de la retención ${n}`);
    const hasta = fechaIso(r.fechaVigenciaHasta, `${p}.fechaVigenciaHasta`, `La vigencia final de la retención ${n}`);

    pares(desde, hasta, `${p}.fechaVigenciaHasta`, `La vigencia final de la retención ${n} no puede ser anterior a la inicial.`);

    return {
      id: idPersistido(r.id),
      tipo: tipo as RetencionNormalizada["tipo"],
      impuestoId: uuidOpcional(r.impuestoId, `${p}.impuestoId`, `El impuesto de la retención ${n}`),
      porcentaje: pct.valor as string,
      certificadoObligatorio: booleano(r.certificadoObligatorio, false),
      activa: booleano(r.activa, true),
      documentoCertificadoId: uuidOpcional(r.documentoCertificadoId, `${p}.documentoCertificadoId`, `El certificado de la retención ${n}`),
      fechaVigenciaDesde: desde,
      fechaVigenciaHasta: hasta,
      observacion: opcional(r.observacion, `${p}.observacion`, `La observación de la retención ${n}`, 1000),
    };
  });
}

function idsAEliminar(valor: unknown, campo: string): string[] {
  if (valor === undefined || valor === null) return [];
  if (!Array.isArray(valor)) return bad("La lista de eliminaciones no es válida.", campo);

  return Array.from(new Set(valor.map((v) => idPersistido(v)).filter((v): v is string => v !== null)));
}

/** Valida el cuerpo completo. Lanza ErrorValidacion (con campo y pestaña) en la primera regla incumplida. */
export function normalizarProveedor(cuerpo: unknown): DatosProveedor {
  const b = crudo(cuerpo);
  const paisCodigo = texto(b.paisCodigo, "paisCodigo", "El país", 3).toUpperCase() || "PRY";

  if (!/^[A-Z]{3}$/.test(paisCodigo)) bad("Seleccione un país válido.", "paisCodigo");

  const identificacion = validarIdentificacion({
    paisCodigo,
    tipoDocumento: texto(b.tipoDocumento, "tipoDocumento", "El tipo de documento", 30),
    numeroDocumento: texto(b.numeroDocumento, "numeroDocumento", "El número de documento", 50),
    dv: texto(b.dv, "dv", "El DV", 1),
  });

  if (!identificacion.ok) bad(identificacion.error, identificacion.campo);

  const tipoPersona = b.tipoPersona === "FISICA" ? "FISICA" : "JURIDICA";
  const razonSocial = obligatorio(b.razonSocial, "razonSocial", "El nombre o razón social", LIMITE_NOMBRE);
  const nombreFantasia = opcional(b.nombreFantasia, "nombreFantasia", "El nombre de fantasía", LIMITE_NOMBRE);
  const sitioWeb = opcional(b.sitioWeb, "sitioWeb", "El sitio web", 300);

  if (sitioWeb && !/^https?:\/\/[^\s]+$/i.test(sitioWeb)) bad("El sitio web debe comenzar con http:// o https://.", "sitioWeb");

  const descuento = decimalExacto(b.descuentoComercialPct, PORCENTAJE_5_2, "El descuento comercial");
  const minimo = decimalExacto(b.montoMinimoCompra, MONTO_18_2, "El monto mínimo de compra");

  if (!descuento.ok) bad(descuento.error, "descuentoComercialPct");
  if (!minimo.ok) bad(minimo.error, "montoMinimoCompra");

  const metodo = opcional(b.metodoTransportePreferido, "metodoTransportePreferido", "El transporte preferido", 20)?.toUpperCase() ?? null;

  if (metodo && !(METODOS_TRANSPORTE as readonly string[]).includes(metodo)) bad("El transporte preferido no es válido.", "metodoTransportePreferido");

  const fechaInicioRelacion = fechaIso(b.fechaInicioRelacion, "fechaInicioRelacion", "La fecha de inicio de la relación");
  const fechaFinRelacion = fechaIso(b.fechaFinRelacion, "fechaFinRelacion", "La fecha de finalización");

  pares(fechaInicioRelacion, fechaFinRelacion, "fechaFinRelacion", "La fecha de finalización no puede ser anterior a la de inicio.");

  const e = crudo(b.eliminaciones);

  return {
    tipoPersona,
    grupoProveedorId: uuidOpcional(b.grupoProveedorId, "grupoProveedorId", "El grupo de proveedor"),
    tipoDocumento: identificacion.datos.tipoDocumento,
    numeroDocumento: identificacion.datos.numeroDocumento,
    dv: identificacion.datos.dv,
    razonSocial,
    nombreFantasia,
    paisCodigo,
    email: correo(b.email, "email", "El correo electrónico"),
    telefono: opcional(b.telefono, "telefono", "El teléfono", 50),
    sitioWeb,
    activo: booleano(b.activo, true),
    observacion: opcional(b.observacion, "observacion", "La observación general", 2000),
    condicionPagoId: uuidOpcional(b.condicionPagoId, "condicionPagoId", "La condición de pago"),
    monedaCodigo: opcional(b.monedaCodigoPredeterminada, "monedaCodigoPredeterminada", "La moneda", 3)?.toUpperCase() ?? null,
    medioPagoId: uuidOpcional(b.medioPagoPreferidoId, "medioPagoPreferidoId", "El medio de pago"),
    diaPagoPreferido: entero(b.diaPagoPreferido, "diaPagoPreferido", "El día preferido de pago", 1, 31),
    plazoEntregaDias: entero(b.plazoEntregaDias, "plazoEntregaDias", "El plazo de entrega", 0),
    descuentoComercialPct: descuento.valor ?? "0.00",
    montoMinimoCompra: minimo.valor ?? "0.00",
    permiteAnticipos: booleano(b.permiteAnticipos, false),
    requiereOrdenCompra: booleano(b.requiereOrdenCompra, false),
    emailPagos: correo(b.emailPagos, "emailPagos", "El correo para pagos"),
    fechaInicioRelacion,
    fechaFinRelacion,
    incotermCodigo: opcional(b.incotermCodigo, "incotermCodigo", "El Incoterm", 10)?.toUpperCase() ?? null,
    condicionEntrega: opcional(b.condicionEntrega, "condicionEntrega", "La condición de entrega", 500),
    metodoTransporte: metodo,
    diasConfirmacionPedido: entero(b.diasConfirmacionPedido, "diasConfirmacionPedido", "Los días para confirmar el pedido", 0),
    permiteEntregaParcial: booleano(b.permiteEntregaParcial, true),
    contactos: normalizarContactos(b.contactos),
    direcciones: normalizarDirecciones(b.direcciones, paisCodigo),
    cuentasBancarias: normalizarCuentas(b.cuentasBancarias),
    retenciones: normalizarRetenciones(b.retenciones),
    eliminaciones: {
      contactos: idsAEliminar(e.contactos, "contactos"),
      direcciones: idsAEliminar(e.direcciones, "direcciones"),
      cuentasBancarias: idsAEliminar(e.cuentasBancarias, "cuentasBancarias"),
      retenciones: idsAEliminar(e.retenciones, "retenciones"),
    },
  };
}
