import { ESTADOS_SIFEN, ETIQUETA_LOCAL, ETIQUETA_SIFEN, type EstadoLocal, type EstadoSifen } from "@/lib/facturacion/estados";
import { hoyParaguay } from "@/lib/facturacion/credito";
import type { EstadoVendedorVentas, SituacionVentas, VentasFiltros, VentasRespuestaApi, VistaVentas } from "@/types/reportes";

// Informe de Ventas (E5 / PRO-296) — módulo PURO compartido por el servidor, la pantalla y las exportaciones: vistas, etiquetas, período por defecto, igualdad de
// filtros y validación estructural de la respuesta. Ningún importe se calcula aquí: todo el dinero llega como texto numeric exacto de PostgreSQL.

export const VISTAS_VENTAS: [VistaVentas, string][] = [
  ["RESUMEN", "Resumen"], ["DOCUMENTOS", "Documentos"], ["PRODUCTOS", "Productos"], ["CLIENTES", "Clientes"], ["VENDEDORES", "Vendedores"], ["MESES", "Meses"],
];
export const ETIQUETA_VISTA_VENTAS: Record<VistaVentas, string> = Object.fromEntries(VISTAS_VENTAS) as Record<VistaVentas, string>;
export const MONEDAS_VENTAS = ["PYG", "USD", "BRL"] as const;
export const SITUACIONES_VENTAS: SituacionVentas[] = ["COMPUTA", "NO_COMPUTA", "ANOMALIA"];

export const ETIQUETA_SITUACION_VENTAS: Record<SituacionVentas, string> = {
  COMPUTA: "Computa",
  NO_COMPUTA: "No computa (estado fiscal)",
  ANOMALIA: "Anomalía (no computa)",
};

/** Motivo SIFEN de la NCE (NEX-062). */
export const ETIQUETA_MOTIVO_NCE: Record<number, string> = { 2: "Devolución", 3: "Descuento", 4: "Bonificación", 8: "Ajuste de precio" };

/** Anomalías de un documento APROBADO: nunca se suma como cero; se informa aparte con su número, tipo, fecha y monto. */
export const ETIQUETA_ANOMALIA: Record<string, string> = {
  SIN_PAYLOAD: "Sin solicitud fiscal registrada",
  VERSION_INCIERTA: "Más de una versión de solicitud: versión emitida incierta",
  SIN_CDC: "Aprobado sin CDC",
  PAYLOAD_TIPO: "Tipo de documento del JSON fiscal distinto del registrado",
  MONEDA: "Moneda del JSON fiscal distinta de la del documento",
  SUBTOTALES: "Subtotales fiscales ausentes o no numéricos",
  TOTAL_DIFIERE: "dTotGralOpe distinto del total del documento",
  IVA_INCONSISTENTE: "dTotIVA no concilia con dIVA5 + dIVA10",
  ITEMS: "Ítems del JSON fiscal no concilian con los subtotales",
  NCE_SIN_ORIGEN: "NCE sin vínculo con su factura original",
  NCE_ORIGEN_INVALIDO: "Vínculo de la NCE con la factura original no verificable",
  NCE_MOTIVO: "Motivo de la NCE distinto del registrado",
  NCE_LINEAS: "Montos acreditados de la NCE no concilian con su total",
  NCE_FE_NO_APROBADA: "INCONSISTENCIA: NCE aprobada de una factura no aprobada (cancelada u otro estado)",
};

export const ETIQUETA_VENDEDOR: Record<EstadoVendedorVentas, string> = {
  REGISTRADO: "",
  SIN_REGISTRO: "Sin vendedor registrado",
  FUERA_ALCANCE: "Factura original fuera de su alcance",
  SIN_ORIGEN: "Sin factura original vinculada",
  NO_DISPONIBLE: "No disponible por esquema",
};

export const etiquetaSifen = (e: string) => ETIQUETA_SIFEN[e as EstadoSifen] ?? e;
export const etiquetaLocal = (e: string) => ETIQUETA_LOCAL[e as EstadoLocal] ?? e;
export const etiquetaTipoVentas = (t: string) => (t === "FE" ? "Factura" : t === "NCE" ? "Nota de crédito" : t);
export const ETIQUETA_SIN_CODIGO = "Código sin identificación histórica";
export const ETIQUETA_AJUSTE_NO_ATRIBUIBLE = "Ajustes no atribuibles a producto";

/** Mes calendario de Paraguay que contiene `hoy` (AAAA-MM-DD): período por defecto del informe. */
export function mesCorrienteParaguay(hoy: string = hoyParaguay()): { desde: string; hasta: string } {
  const [a, m] = hoy.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");

  return { desde: `${a}-${mm}-01`, hasta: `${a}-${mm}-${String(ultimo).padStart(2, "0")}` };
}

export function filtrosVentasPorDefecto(hoy?: string): VentasFiltros {
  return { vista: "RESUMEN", ...mesCorrienteParaguay(hoy), sucursalId: "", tipo: "", moneda: "", q: "", clienteId: "", vendedor: "", producto: "", estado: "", situacion: "TODAS" };
}

const CAMPOS: (keyof VentasFiltros)[] = ["vista", "desde", "hasta", "sucursalId", "tipo", "moneda", "q", "clienteId", "vendedor", "producto", "estado", "situacion"];

/** Igualdad CAMPO A CAMPO (independiente del orden de las propiedades). */
export function filtrosVentasIguales(a: VentasFiltros, b: VentasFiltros): boolean {
  return CAMPOS.every((k) => a[k] === b[k]);
}

/** Una respuesta solo se muestra (y habilita la exportación) sin error y si corresponde exactamente a los filtros y a la página pedidos ahora. */
export function respuestaVentasVigente(datos: { filtros: VentasFiltros; pagina: { numero: number } } | null, error: string, aplicados: VentasFiltros, pagina: number): boolean {
  return datos !== null && !error && filtrosVentasIguales(datos.filtros, aplicados) && datos.pagina.numero === pagina;
}

/** Texto que describe los filtros (pantalla, Excel y PDF usan el mismo). */
export function describirFiltrosVentas(f: VentasFiltros, catalogos: VentasRespuestaApi["catalogos"] | null, generado: string): string[] {
  const fecha = (t: string) => t.split("-").reverse().join("/");
  const out = [
    `Vista: ${ETIQUETA_VISTA_VENTAS[f.vista]}`,
    `Período (fecha de emisión, hora de Asunción): ${fecha(f.desde)} al ${fecha(f.hasta)}`,
    `Situación fiscal al generar: ${generado} (hora de Asunción)`,
    `Sucursal: ${f.sucursalId ? (catalogos?.sucursales.find((s) => s.id === f.sucursalId)?.nombre ?? f.sucursalId) : "Todas las de su alcance"}`,
  ];

  if (f.tipo) out.push(`Tipo: ${etiquetaTipoVentas(f.tipo)}`);
  if (f.moneda) out.push(`Moneda: ${f.moneda}`);
  if (f.q) out.push(`Búsqueda: ${f.q}`);
  if (f.clienteId) out.push(`Cliente: ${catalogos?.cliente?.nombre ?? f.clienteId}`);
  if (f.vendedor) out.push(`Vendedor: ${f.vendedor === "SIN" ? ETIQUETA_VENDEDOR.SIN_REGISTRO : (catalogos?.vendedores.find((v) => v.id === f.vendedor)?.nombre ?? f.vendedor)}`);
  if (f.vista === "PRODUCTOS" && f.producto) out.push(`Producto: ${f.producto}`);
  if (f.vista === "DOCUMENTOS" && f.estado) out.push(`Estado fiscal: ${etiquetaSifen(f.estado)}`);
  if (f.vista === "DOCUMENTOS" && f.situacion !== "TODAS") out.push(`Situación: ${ETIQUETA_SITUACION_VENTAS[f.situacion]}`);

  return out;
}

// ── Validación estructural de la respuesta (RPT-V04): incompleta, con importes no numéricos o conteos inválidos = se descarta completa. ──
const esObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const txt = (v: unknown): v is string => typeof v === "string";
const entero = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const dec = (v: unknown): boolean => txt(v) && /^-?\d+(\.\d+)?$/.test(v);
const decONulo = (v: unknown): boolean => v === null || dec(v);
const txtONulo = (v: unknown): boolean => v === null || txt(v);
const lista = (v: unknown, ok: (x: unknown) => boolean): boolean => Array.isArray(v) && v.every(ok);

const importesValidos = (x: Record<string, unknown>): boolean =>
  entero(x.documentosFe) && entero(x.documentosNce) && ["feConIva", "ivaFe", "feSinIva", "nceConIva", "ivaNce", "nceSinIva", "netoConIva", "ivaNeto", "netoSinIva"].every((k) => dec(x[k]));
const resumenValido = (x: unknown): boolean => esObj(x) && txt(x.moneda) && importesValidos(x);

function documentoValido(x: unknown): boolean {
  return esObj(x) && txt(x.clave) && txt(x.fecha) && txt(x.tipo) && txt(x.numero) && txtONulo(x.cdc) && txt(x.sucursal) && txt(x.receptor) && txtONulo(x.receptorDocumento) &&
    typeof x.clienteVinculado === "boolean" && txt(x.vendedorEstado) && x.vendedorEstado in ETIQUETA_VENDEDOR && txtONulo(x.vendedor) && txt(x.moneda) && dec(x.totalConIva) &&
    decONulo(x.iva) && decONulo(x.sinIva) && txt(x.estadoSifen) && txt(x.estadoLocal) && txt(x.situacion) && (SITUACIONES_VENTAS as string[]).includes(x.situacion) &&
    txtONulo(x.anomalia) && (x.nceMotivo === null || entero(x.nceMotivo)) && txtONulo(x.feReferencia) && typeof x.feFueraAlcance === "boolean";
}

const grupoValido = (x: unknown): boolean =>
  esObj(x) && txt(x.clave) && txt(x.etiqueta) && txt(x.detalle) && txt(x.moneda) && txt(x.unidad) && decONulo(x.cantidadVendida) && decONulo(x.cantidadDevuelta) && txtONulo(x.clienteId) && importesValidos(x);

export function respuestaVentasValida(x: unknown): x is VentasRespuestaApi {
  if (!esObj(x)) return false;

  const p = x.pagina, f = x.filtros, c = x.catalogos, e = x.esquema, perm = x.permisos;

  return esObj(x.empresa) && txt(x.empresa.nombre) && txt(x.generado) && txt(x.sello) && esObj(f) && txt(f.vista) && txt(f.desde) && txt(f.hasta) &&
    esObj(p) && entero(p.numero) && entero(p.tamano) && entero(p.totalFilas) && esObj(e) && typeof e.vendedor === "boolean" && typeof e.nceDescuento === "boolean" &&
    lista(x.resumen, resumenValido) &&
    lista(x.estados, (s) => esObj(s) && txt(s.tipo) && txt(s.estadoSifen) && txt(s.moneda) && entero(s.documentos) && entero(s.enviados) && dec(s.total)) &&
    lista(x.anomalias, (s) => esObj(s) && txt(s.motivo) && txt(s.tipo) && txt(s.moneda) && entero(s.documentos) && dec(s.total)) &&
    lista(x.documentos, documentoValido) &&
    lista(x.totalesDocumentos, (t) => esObj(t) && txt(t.moneda) && entero(t.filas) && entero(t.computan) && dec(t.totalConIva) && dec(t.iva) && dec(t.sinIva)) &&
    lista(x.grupos, grupoValido) && lista(x.totalesProductos, resumenValido) &&
    lista(x.ajustesNoAtribuibles, (a) => esObj(a) && txt(a.moneda) && entero(a.documentos) && dec(a.conIva) && dec(a.iva) && dec(a.sinIva)) &&
    esObj(c) && lista(c.sucursales, (s) => esObj(s) && txt(s.id) && txt(s.nombre)) && lista(c.vendedores, (s) => esObj(s) && txt(s.id) && txt(s.nombre)) &&
    (c.cliente === null || (esObj(c.cliente) && txt(c.cliente.id) && txt(c.cliente.nombre))) &&
    lista(x.avisos, txt) && lista(x.cobertura, txt) && esObj(perm) && typeof perm.exportar === "boolean";
}

export const ESTADOS_SIFEN_VENTAS = ESTADOS_SIFEN;
