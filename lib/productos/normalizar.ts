/**
 * Validación y normalización ÚNICA de Productos (la ejecutan el formulario y la API). Reglas de la DDL vigente (NEX-007/017) y de la
 * matriz normativa; ningún texto se trunca (lo que excede el límite se rechaza con su campo), los decimales viajan como cadenas
 * exactas, y cada error lleva la ruta del campo para enfocarlo. Sin acceso a base de datos.
 */
import { coherenciaIva, LONGITUDES_GTIN, TIPOS_CODIGO_GTIN } from "@/lib/productos/fiscal";
import { CANTIDAD_18_4, FACTOR_18_6, PORCENTAJE_7_4, decimal, entero } from "@/lib/productos/decimales";
import { ErrorValidacion } from "@/lib/productos/errores";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Cuerpo = Record<string, unknown>;

export const TIPOS_PRODUCTO = ["MERCADERIA", "SERVICIO", "KIT", "ACTIVO_FIJO"] as const;
export const MODOS_STOCK = ["CANTIDAD", "LOTE", "UNIDAD_ETIQUETADA"] as const;
export const TIPOS_CODIGO = ["GTIN", "GTIN_EMPAQUE", "EAN", "UPC", "CODIGO_ALTERNO", "SKU_PROVEEDOR", "OTRO"] as const;
export const TIPOS_ALTERNATIVO = ["SUSTITUTO", "COMPLEMENTARIO", "UPSELL"] as const;
const CODIGOS_NUMERICOS: readonly string[] = TIPOS_CODIGO_GTIN;

export const COLECCIONES = ["codigos", "unidades", "proveedores", "depositos", "alternativos", "componentes"] as const;
export type Coleccion = (typeof COLECCIONES)[number];

const lista = (valor: unknown): Cuerpo[] => (Array.isArray(valor) ? valor.filter((x): x is Cuerpo => typeof x === "object" && x !== null) : []);
const si = (valor: unknown) => valor === true;

/** Texto recortado; si supera el máximo se RECHAZA (nunca se corta). */
function texto(valor: unknown, etiqueta: string, campo: string, maximo?: number): string {
  const t = typeof valor === "string" ? valor.trim() : valor === null || valor === undefined ? "" : String(valor).trim();

  if (maximo !== undefined && t.length > maximo) throw new ErrorValidacion(`${etiqueta} admite hasta ${maximo} caracteres (ingresó ${t.length}).`, campo);

  return t;
}

const opcional = (valor: unknown, etiqueta: string, campo: string, maximo?: number) => texto(valor, etiqueta, campo, maximo) || null;

function enumerado<T extends string>(valor: unknown, permitidos: readonly T[], etiqueta: string, campo: string, porDefecto?: T): T {
  const t = (typeof valor === "string" ? valor.trim().toUpperCase() : "") || porDefecto || "";

  if (!(permitidos as readonly string[]).includes(t)) throw new ErrorValidacion(`${etiqueta} no es válido.`, campo);

  return t as T;
}

/** Identificador persistente de una fila relacionada: UUID real = fila existente; cualquier otro valor (temporal del cliente) = alta. */
const idPersistente = (valor: unknown): string | null => (typeof valor === "string" && UUID.test(valor) ? valor : null);

export type ProductoCodigoDatos = { id: string | null; tipo: string; codigo: string; descripcion: string | null; esPrincipal: boolean };
export type ProductoUnidadDatos = { id: string | null; unidadMedidaId: string; nombrePresentacion: string; factorConversion: string; esUnidadBase: boolean; esUnidadCompra: boolean; esUnidadVenta: boolean; codigoBarras: string | null; pesoBrutoKg: string | null; volumenM3: string | null };
export type ProductoProveedorDatos = { id: string | null; proveedorId: string; codigoProveedor: string | null; descripcionProveedor: string | null; unidadMedidaId: string | null; factorConversion: string; costoReferencia: string | null; monedaCodigo: string | null; cantidadMinimaCompra: string | null; plazoEntregaDias: number | null; esPrincipal: boolean };
export type ProductoDepositoDatos = { id: string | null; depositoId: string; ubicacionPreferidaId: string | null; stockMinimo: string | null; stockMaximo: string | null; puntoReposicion: string | null; cantidadReposicion: string | null };
export type ProductoAlternativoDatos = { id: string | null; productoAlternativoId: string; tipo: string; prioridad: number };
export type ProductoComponenteDatos = { id: string | null; productoComponenteId: string; cantidad: string; esOpcional: boolean; orden: number };

export type DatosProducto = ReturnType<typeof normalizarProducto>;

/** `tasaImpuesto`: porcentaje del impuesto elegido (el formulario lo pasa desde el catálogo; el servidor lo valida contra la base). undefined = no se verifica aquí. */
export type OpcionesNormalizar = {
  modo: "crear" | "editar";
  productoId?: string;
  tasaImpuesto?: string | null;
  /** Equivalencia SIFEN (E709) de la unidad base elegida, para el producto NUEVO vendible. undefined = no se verifica aquí (el servidor la verifica contra la base); null = unidad desconocida. */
  unidadFiscal?: { sifenCodigo: number | null; sifenVigente?: boolean | null } | null;
};

/** DEC-PRD-U02: un producto NUEVO de tipo MERCADERIA/SERVICIO destinado a la venta no se guarda con la clasificación fiscal incompleta. Los productos existentes no se reclasifican. */
export const esVendibleFiscal = (modo: "crear" | "editar", tipoProducto: string, vendible: boolean) => modo === "crear" && vendible && (tipoProducto === "MERCADERIA" || tipoProducto === "SERVICIO");

function filas<T>(origen: Cuerpo[], campo: string, f: (fila: Cuerpo, p: string, indice: number) => T): T[] {
  return origen.map((fila, i) => f(fila, `${campo}.${i}`, i));
}

function unico<T extends { esPrincipal: boolean }>(items: T[], campo: string, mensaje: string) {
  const marcados = items.map((x, i) => (x.esPrincipal ? i : -1)).filter((i) => i >= 0);

  if (marcados.length > 1) throw new ErrorValidacion(mensaje, `${campo}.${marcados[1]}.esPrincipal`);
}

/** Valida y normaliza el cuerpo. Lanza ErrorValidacion (mensaje en español + campo) ante el primer problema. */
export function normalizarProducto(d: Cuerpo, opciones: OpcionesNormalizar = { modo: "crear" }) {
  const idP = (valor: unknown) => (opciones.modo === "crear" ? null : idPersistente(valor));
  const codigo = texto(d.codigo, "El código interno", "codigo", 80);
  const descripcion = texto(d.descripcion, "La descripción", "descripcion", 300);
  const descripcionFactura = texto(d.descripcionFactura, "La descripción para factura", "descripcionFactura", 120);
  const unidadMedidaId = texto(d.unidadMedidaId, "La unidad base", "unidadMedidaId");
  const tipoProducto = enumerado(d.tipoProducto, TIPOS_PRODUCTO, "El tipo de producto", "tipoProducto", "MERCADERIA");
  const modoControl = enumerado(d.modoControlStock, MODOS_STOCK, "El modo de control de stock", "modoControlStock", "CANTIDAD");

  if (!descripcion) throw new ErrorValidacion("La descripción interna es obligatoria.", "descripcion");
  if (!descripcionFactura) throw new ErrorValidacion("La descripción para factura es obligatoria.", "descripcionFactura");
  if (!unidadMedidaId) throw new ErrorValidacion("La unidad base es obligatoria.", "unidadMedidaId");

  const familiaId = opcional(d.familiaId, "La familia", "familiaId");
  const lineaId = opcional(d.lineaId, "La línea", "lineaId");

  if (lineaId && !familiaId) throw new ErrorValidacion("Seleccione la familia de la línea.", "familiaId");

  // Fiscal (E8 del MT v150 y NT009/NT026): solo validaciones cadastrales fundamentadas; no se amplían los límites comerciales.
  const codigoSifen = opcional(d.codigoSifen, "El código SIFEN", "codigoSifen", 20);
  const ncm = opcional(d.ncm, "El NCM", "ncm", 8);
  const partidaArancelaria = opcional(d.partidaArancelaria, "La partida arancelaria", "partidaArancelaria", 4);
  const dncpGeneral = opcional(d.dncpGeneral, "El código DNCP general", "dncpGeneral", 8);
  const dncpEspecifico = opcional(d.dncpEspecifico, "El código DNCP específico", "dncpEspecifico", 4);

  if (ncm && !/^\d{6,8}$/.test(ncm)) throw new ErrorValidacion("El NCM debe tener entre 6 y 8 dígitos numéricos.", "ncm");
  if (partidaArancelaria && !/^\d{4}$/.test(partidaArancelaria)) throw new ErrorValidacion("La partida arancelaria debe tener 4 dígitos numéricos.", "partidaArancelaria");
  if (dncpGeneral && !/^[A-Za-z0-9]{1,8}$/.test(dncpGeneral)) throw new ErrorValidacion("El código DNCP general admite hasta 8 caracteres alfanuméricos.", "dncpGeneral");
  if (dncpEspecifico && !/^[A-Za-z0-9]{3,4}$/.test(dncpEspecifico)) throw new ErrorValidacion("El código DNCP específico debe tener entre 3 y 4 caracteres alfanuméricos.", "dncpEspecifico");

  const paisOrigenCodigo = opcional(d.paisOrigenCodigo, "El país de origen", "paisOrigenCodigo", 3)?.toUpperCase() ?? null;

  if (paisOrigenCodigo && !/^[A-Z]{3}$/.test(paisOrigenCodigo)) throw new ErrorValidacion("El país de origen no es válido.", "paisOrigenCodigo");

  const relacion = opcional(d.relacionMercaderia, "La relación de mercadería", "relacionMercaderia", 1);

  if (relacion && relacion !== "1" && relacion !== "2") throw new ErrorValidacion("La relación de mercadería debe ser 1 (quiebra) o 2 (merma).", "relacionMercaderia");

  // Clasificación IVA estándar (E731/E733): vacío = sin clasificar (productos existentes). La tasa viene del impuesto elegido.
  const afectacionTexto = texto(d.afectacionIva, "La afectación IVA", "afectacionIva", 1);

  if (afectacionTexto && !/^[1-4]$/.test(afectacionTexto)) throw new ErrorValidacion("La afectación IVA debe ser 1, 2, 3 o 4.", "afectacionIva");

  const afectacionIva = afectacionTexto ? Number(afectacionTexto) : null;
  const proporcionGravadaIva = decimal(d.proporcionGravadaIva, PORCENTAJE_7_4, "La proporción gravada", "proporcionGravadaIva");
  const incoherencia = opciones.tasaImpuesto === undefined ? (afectacionIva === null && proporcionGravadaIva !== null ? coherenciaIva(null, null, proporcionGravadaIva) : afectacionIva !== null && afectacionIva !== 4 && proporcionGravadaIva !== null ? coherenciaIva(afectacionIva, afectacionIva === 1 ? "10" : "0", proporcionGravadaIva) : null) : coherenciaIva(afectacionIva, opciones.tasaImpuesto, proporcionGravadaIva);

  if (incoherencia) throw new ErrorValidacion(incoherencia.mensaje, incoherencia.campo);

  if (esVendibleFiscal(opciones.modo, tipoProducto, d.vendible !== false)) {
    if (afectacionIva === null) throw new ErrorValidacion("Seleccione la afectación IVA: un producto nuevo destinado a la venta no se guarda sin clasificación fiscal.", "afectacionIva");
    if (!opcional(d.impuestoId, "El impuesto", "impuestoId")) throw new ErrorValidacion("Seleccione el impuesto (tasa de IVA): un producto nuevo destinado a la venta no se guarda sin clasificación fiscal.", "impuestoId");
    if (opciones.unidadFiscal !== undefined) {
      const u = opciones.unidadFiscal;

      if (u === null || u.sifenCodigo === null) throw new ErrorValidacion("La unidad base no tiene equivalencia SIFEN (E709): no se puede crear un producto vendible con ella. Elija una unidad con código SIFEN.", "unidadMedidaId");
      if (u.sifenVigente === false) throw new ErrorValidacion("El código SIFEN de la unidad base no está vigente en el catálogo oficial: elija otra unidad.", "unidadMedidaId");
    }
  }

  // Precio de venta de referencia: vacío = sin precio (nunca se asume 0).
  const precioVentaReferencia = decimal(d.precioVentaReferencia, CANTIDAD_18_4, "El precio de venta de referencia", "precioVentaReferencia");

  // Inventario inicial (solo en el alta): cantidad + costo + depósito → movimiento real.
  const apertura = (d.inventarioInicial && typeof d.inventarioInicial === "object" ? d.inventarioInicial : {}) as Cuerpo;
  const aperturaCantidad = decimal(apertura.cantidad, CANTIDAD_18_4, "El inventario inicial", "inventarioInicial.cantidad");
  const aperturaCosto = decimal(apertura.costoUnitario, CANTIDAD_18_4, "El costo de apertura", "inventarioInicial.costoUnitario");
  const aperturaDeposito = opcional(apertura.depositoId, "El depósito de apertura", "inventarioInicial.depositoId");
  const hayApertura = aperturaCantidad !== null && /[1-9]/.test(aperturaCantidad);

  if (hayApertura) {
    if (opciones.modo !== "crear") throw new ErrorValidacion("El inventario inicial solo se registra al crear el producto; use Movimientos.", "inventarioInicial.cantidad");
    if (!si(d.controlaStock)) throw new ErrorValidacion("El inventario inicial requiere que el producto controle stock.", "inventarioInicial.cantidad");
    if (modoControl !== "CANTIDAD") {
      throw new ErrorValidacion("Para productos controlados por lote o serie, registre el inventario inicial desde Movimientos (requiere identificar el lote).", "inventarioInicial.cantidad");
    }
    if (!aperturaDeposito) throw new ErrorValidacion("Seleccione el depósito del inventario inicial.", "inventarioInicial.depositoId");
    if (aperturaCosto === null) throw new ErrorValidacion("Informe el costo unitario de apertura del inventario inicial.", "inventarioInicial.costoUnitario");
  }

  // ── Colecciones relacionadas (id UUID = fila existente; otro valor = alta)
  const codigos = filas(lista(d.codigos), "codigos", (c, p): ProductoCodigoDatos => {
    const tipo = enumerado(c.tipo, TIPOS_CODIGO, "El tipo de código", `${p}.tipo`);
    const valor = texto(c.codigo, "El código", `${p}.codigo`, 80);

    if (!valor) throw new ErrorValidacion("El código es obligatorio.", `${p}.codigo`);
    if (CODIGOS_NUMERICOS.includes(tipo)) {
      if (!/^[0-9]+$/.test(valor)) throw new ErrorValidacion("El GTIN solo admite dígitos.", `${p}.codigo`);
      if (!(LONGITUDES_GTIN as readonly number[]).includes(valor.length)) throw new ErrorValidacion(`El GTIN debe tener ${LONGITUDES_GTIN.join(", ")} dígitos (ingresó ${valor.length}).`, `${p}.codigo`);
    }

    return { id: idP(c.id), tipo, codigo: valor, descripcion: opcional(c.descripcion, "La descripción del código", `${p}.descripcion`, 120), esPrincipal: si(c.esPrincipal) };
  });

  unico(codigos, "codigos", "Solo puede existir un código principal.");
  codigos.forEach((c, i) => {
    if (codigos.findIndex((x) => x.tipo === c.tipo && x.codigo === c.codigo) !== i) throw new ErrorValidacion("Ese código ya está cargado con el mismo tipo.", `codigos.${i}.codigo`);
  });

  const unidades = filas(lista(d.unidades), "unidades", (u, p): ProductoUnidadDatos => {
    const unidad = texto(u.unidadMedidaId, "La unidad", `${p}.unidadMedidaId`);
    const nombre = texto(u.nombrePresentacion, "El nombre de la presentación", `${p}.nombrePresentacion`, 100);

    if (!unidad) throw new ErrorValidacion("Seleccione la unidad de la presentación.", `${p}.unidadMedidaId`);
    if (!nombre) throw new ErrorValidacion("El nombre de la presentación es obligatorio.", `${p}.nombrePresentacion`);

    const factor = decimal(u.factorConversion, FACTOR_18_6, "El factor de conversión", `${p}.factorConversion`, { positivo: true });

    if (factor === null) throw new ErrorValidacion("El factor de conversión es obligatorio.", `${p}.factorConversion`);

    return {
      id: idP(u.id),
      unidadMedidaId: unidad,
      nombrePresentacion: nombre,
      factorConversion: factor,
      esUnidadBase: si(u.esUnidadBase),
      esUnidadCompra: si(u.esUnidadCompra),
      esUnidadVenta: si(u.esUnidadVenta),
      codigoBarras: opcional(u.codigoBarras, "El código de barras", `${p}.codigoBarras`, 80),
      pesoBrutoKg: decimal(u.pesoBrutoKg, CANTIDAD_18_4, "El peso bruto", `${p}.pesoBrutoKg`),
      volumenM3: decimal(u.volumenM3, CANTIDAD_18_4, "El volumen", `${p}.volumenM3`),
    };
  });

  const bases = unidades.map((u, i) => (u.esUnidadBase ? i : -1)).filter((i) => i >= 0);

  if (bases.length > 1) throw new ErrorValidacion("Solo puede existir una unidad base.", `unidades.${bases[1]}.esUnidadBase`);

  const proveedores = filas(lista(d.proveedores), "proveedores", (x, p): ProductoProveedorDatos => {
    const proveedorId = texto(x.proveedorId, "El proveedor", `${p}.proveedorId`);

    if (!proveedorId) throw new ErrorValidacion("Seleccione el proveedor.", `${p}.proveedorId`);

    const moneda = opcional(x.monedaCodigo, "La moneda", `${p}.monedaCodigo`, 3)?.toUpperCase() ?? null;
    const costo = decimal(x.costoReferencia, CANTIDAD_18_4, "El costo de referencia", `${p}.costoReferencia`);

    if (costo !== null && !moneda) throw new ErrorValidacion("Indique la moneda del costo de referencia.", `${p}.monedaCodigo`);

    return {
      id: idP(x.id),
      proveedorId,
      codigoProveedor: opcional(x.codigoProveedor, "El código del proveedor", `${p}.codigoProveedor`, 80),
      descripcionProveedor: opcional(x.descripcionProveedor, "La descripción del proveedor", `${p}.descripcionProveedor`, 300),
      unidadMedidaId: opcional(x.unidadMedidaId, "La unidad", `${p}.unidadMedidaId`),
      // Factor > 0 (PRD-A07): el valor vacío se interpreta como 1 (el DEFAULT de la columna).
      factorConversion: decimal(x.factorConversion ?? "1", FACTOR_18_6, "El factor de conversión", `${p}.factorConversion`, { positivo: true }) ?? "1.000000",
      costoReferencia: costo,
      monedaCodigo: moneda,
      cantidadMinimaCompra: decimal(x.cantidadMinimaCompra, CANTIDAD_18_4, "La cantidad mínima de compra", `${p}.cantidadMinimaCompra`),
      plazoEntregaDias: entero(x.plazoEntregaDias, "El plazo de entrega", `${p}.plazoEntregaDias`),
      esPrincipal: si(x.esPrincipal),
    };
  });

  unico(proveedores, "proveedores", "Solo puede existir un proveedor principal.");

  const depositos = filas(lista(d.depositos), "depositos", (x, p): ProductoDepositoDatos => {
    const depositoId = texto(x.depositoId, "El depósito", `${p}.depositoId`);

    if (!depositoId) throw new ErrorValidacion("Seleccione el depósito.", `${p}.depositoId`);

    return {
      id: idP(x.id),
      depositoId,
      ubicacionPreferidaId: opcional(x.ubicacionPreferidaId, "La ubicación", `${p}.ubicacionPreferidaId`),
      stockMinimo: decimal(x.stockMinimo, CANTIDAD_18_4, "El stock mínimo", `${p}.stockMinimo`),
      stockMaximo: decimal(x.stockMaximo, CANTIDAD_18_4, "El stock máximo", `${p}.stockMaximo`),
      puntoReposicion: decimal(x.puntoReposicion, CANTIDAD_18_4, "El punto de reposición", `${p}.puntoReposicion`),
      cantidadReposicion: decimal(x.cantidadReposicion, CANTIDAD_18_4, "La cantidad de reposición", `${p}.cantidadReposicion`),
    };
  });

  depositos.forEach((x, i) => {
    if (depositos.findIndex((y) => y.depositoId === x.depositoId) !== i) throw new ErrorValidacion("El depósito está repetido en la configuración del producto.", `depositos.${i}.depositoId`);
  });

  const alternativos = filas(lista(d.alternativos), "alternativos", (a, p): ProductoAlternativoDatos => {
    const producto = texto(a.productoAlternativoId, "El producto alternativo", `${p}.productoAlternativoId`);

    if (!producto) throw new ErrorValidacion("Seleccione el producto alternativo.", `${p}.productoAlternativoId`);
    if (opciones.productoId && producto === opciones.productoId) throw new ErrorValidacion("Un producto no puede ser alternativo de sí mismo.", `${p}.productoAlternativoId`);

    return {
      id: idP(a.id),
      productoAlternativoId: producto,
      tipo: enumerado(a.tipo, TIPOS_ALTERNATIVO, "El tipo de alternativo", `${p}.tipo`, "SUSTITUTO"),
      prioridad: entero(a.prioridad, "La prioridad", `${p}.prioridad`, 1) ?? 1,
    };
  });

  const componentes = filas(lista(d.componentes), "componentes", (c, p): ProductoComponenteDatos => {
    const producto = texto(c.productoComponenteId, "El componente", `${p}.productoComponenteId`);

    if (!producto) throw new ErrorValidacion("Seleccione el producto componente.", `${p}.productoComponenteId`);
    if (opciones.productoId && producto === opciones.productoId) throw new ErrorValidacion("Un kit no puede contenerse a sí mismo.", `${p}.productoComponenteId`);

    const cantidad = decimal(c.cantidad, CANTIDAD_18_4, "La cantidad del componente", `${p}.cantidad`, { positivo: true });

    if (cantidad === null) throw new ErrorValidacion("La cantidad del componente es obligatoria.", `${p}.cantidad`);

    return { id: idP(c.id), productoComponenteId: producto, cantidad, esOpcional: si(c.esOpcional), orden: entero(c.orden, "El orden", `${p}.orden`, 1) ?? 1 };
  });

  if (componentes.length && tipoProducto !== "KIT") throw new ErrorValidacion("Solo un producto de tipo KIT puede tener componentes.", "componentes.0.productoComponenteId");

  // Los DOCUMENTOS ya no forman parte de la ficha (NEX-041): se gestionan con sus propias acciones (archivo privado, versiones, historial).

  // Eliminaciones explícitas (ids persistidos); una fila ausente del envío NO se borra.
  const eliminaciones = Object.fromEntries(
    COLECCIONES.map((c) => {
      const crudo = (d.eliminaciones && typeof d.eliminaciones === "object" ? (d.eliminaciones as Cuerpo)[c] : undefined) as unknown;
      const ids = Array.isArray(crudo) ? crudo.filter((x): x is string => typeof x === "string" && UUID.test(x)) : [];

      return [c, [...new Set(ids)]];
    }),
  ) as Record<Coleccion, string[]>;

  return {
    codigo,
    codigoInventario: opcional(d.codigoInventario, "El código de inventario", "codigoInventario", 80),
    codigoSifen,
    codigoBarras: opcional(d.codigoBarras, "El código de barras", "codigoBarras", 80),
    descripcion,
    descripcionFactura,
    tipoProducto,
    categoriaId: opcional(d.categoriaId, "La categoría", "categoriaId"),
    marcaId: opcional(d.marcaId, "La marca", "marcaId"),
    familiaId,
    lineaId,
    precioVentaReferencia,
    precioEnviado: Object.prototype.hasOwnProperty.call(d, "precioVentaReferencia"),
    inventarioInicial: { cantidad: hayApertura ? aperturaCantidad : null, costoUnitario: aperturaCosto, depositoId: aperturaDeposito },
    procedencia: opcional(d.procedencia, "La procedencia", "procedencia", 100),
    unidadMedidaId,
    impuestoId: opcional(d.impuestoId, "El impuesto", "impuestoId"),
    afectacionIva,
    proporcionGravadaIva,
    controlaStock: si(d.controlaStock),
    modoControl,
    permiteTerceros: si(d.permiteTerceros),
    requiereVencimiento: si(d.requiereVencimiento),
    stockMinimo: decimal(d.stockMinimo, CANTIDAD_18_4, "El stock mínimo", "stockMinimo") ?? "0.0000",
    stockMaximo: decimal(d.stockMaximo, CANTIDAD_18_4, "El stock máximo", "stockMaximo"),
    puntoReposicion: decimal(d.puntoReposicion, CANTIDAD_18_4, "El punto de reposición", "puntoReposicion"),
    partidaArancelaria,
    ncm,
    dncpGeneral,
    dncpEspecifico,
    paisOrigenCodigo,
    paisOrigenNombre: null as string | null, // se completa desde el catálogo (resolverPais)
    informacionFactura: opcional(d.informacionFactura, "La información adicional de factura", "informacionFactura", 500),
    relacionMercaderia: relacion ? Number(relacion) : null,
    porcentajeMerma: decimal(d.porcentajeMerma, PORCENTAJE_7_4, "El porcentaje de merma", "porcentajeMerma"),
    cantidadMerma: decimal(d.cantidadMerma, CANTIDAD_18_4, "La cantidad de merma", "cantidadMerma"),
    vendible: d.vendible !== false,
    comprable: d.comprable !== false,
    requiereInspeccionCalidad: si(d.requiereInspeccionCalidad),
    vidaUtilDias: entero(d.vidaUtilDias, "La vida útil", "vidaUtilDias"),
    pesoNetoKg: decimal(d.pesoNetoKg, CANTIDAD_18_4, "El peso neto", "pesoNetoKg"),
    pesoBrutoKg: decimal(d.pesoBrutoKg, CANTIDAD_18_4, "El peso bruto", "pesoBrutoKg"),
    largoCm: decimal(d.largoCm, CANTIDAD_18_4, "El largo", "largoCm"),
    anchoCm: decimal(d.anchoCm, CANTIDAD_18_4, "El ancho", "anchoCm"),
    altoCm: decimal(d.altoCm, CANTIDAD_18_4, "El alto", "altoCm"),
    volumenM3: decimal(d.volumenM3, CANTIDAD_18_4, "El volumen", "volumenM3"),
    imagenUrl: opcional(d.imagenUrl, "La URL de la imagen", "imagenUrl", 2000),
    observacion: opcional(d.observacion, "La observación", "observacion", 1000),
    activo: d.activo !== false,
    codigos,
    unidades,
    proveedores,
    depositos,
    alternativos,
    componentes,
    eliminaciones,
  };
}
