/**
 * Estado del formulario de Productos: todo texto (los decimales viajan como cadenas exactas) y las fechas en dd/mm/aaaa.
 * `formularioAPayload` produce el contrato de la API; la misma validación (`normalizarProducto`) corre en el formulario y en el servidor.
 */
import { COLECCIONES, UUID, type Coleccion } from "@/lib/productos/normalizar";
import type {
  CatalogoProductos,
  ProductoAlternativo,
  ProductoCodigo,
  ProductoComponente,
  ProductoDetalle,
  ProductoDeposito,
  ProductoModoControlStock,
  ProductoPresentacion,
  ProductoProveedor,
  ProductoTipo,
} from "@/types/productos";

export type FormularioProducto = {
  codigo: string;
  codigoInventario: string;
  codigoSifen: string;
  codigoBarras: string;
  descripcion: string;
  descripcionFactura: string;
  tipoProducto: ProductoTipo;
  categoriaId: string;
  marcaId: string;
  familiaId: string;
  lineaId: string;
  procedencia: string;
  unidadMedidaId: string;
  impuestoId: string;
  /** E731: "" = sin clasificar; "1" Gravado, "2" Exonerado, "3" Exento, "4" Gravado parcial. */
  afectacionIva: string;
  /** E733: solo con afectación 4 (en 1/2/3 la proporción es fija y se deriva). */
  proporcionGravadaIva: string;
  precioVentaReferencia: string;
  controlaStock: boolean;
  modoControlStock: ProductoModoControlStock;
  permiteTerceros: boolean;
  requiereVencimiento: boolean;
  stockMinimo: string;
  stockMaximo: string;
  puntoReposicion: string;
  inventarioInicial: { cantidad: string; costoUnitario: string; depositoId: string };
  partidaArancelaria: string;
  ncm: string;
  dncpGeneral: string;
  dncpEspecifico: string;
  paisOrigenCodigo: string;
  informacionFactura: string;
  relacionMercaderia: string;
  porcentajeMerma: string;
  cantidadMerma: string;
  vendible: boolean;
  comprable: boolean;
  requiereInspeccionCalidad: boolean;
  vidaUtilDias: string;
  pesoNetoKg: string;
  pesoBrutoKg: string;
  largoCm: string;
  anchoCm: string;
  altoCm: string;
  volumenM3: string;
  imagenUrl: string;
  observacion: string;
  activo: boolean;
  codigos: ProductoCodigo[];
  unidades: ProductoPresentacion[];
  proveedores: ProductoProveedor[];
  depositos: ProductoDeposito[];
  alternativos: ProductoAlternativo[];
  componentes: ProductoComponente[];
  /** Ids persistidos que el usuario pidió eliminar de cada colección (una fila ausente nunca se borra). */
  eliminaciones: Record<Coleccion, string[]>;
};

export const eliminacionesVacias = (): Record<Coleccion, string[]> => Object.fromEntries(COLECCIONES.map((c) => [c, []])) as unknown as Record<Coleccion, string[]>;

export function formularioInicial(catalogos: CatalogoProductos): FormularioProducto {
  return {
    codigo: "",
    codigoInventario: "",
    codigoSifen: "",
    codigoBarras: "",
    descripcion: "",
    descripcionFactura: "",
    tipoProducto: "MERCADERIA",
    categoriaId: "",
    marcaId: "",
    familiaId: "",
    lineaId: "",
    procedencia: "",
    unidadMedidaId: "",
    impuestoId: catalogos.impuestos.find((i) => Number(i.porcentaje) === 10)?.id ?? "",
    // Valor sugerido solo para productos NUEVOS (IVA 10 % gravado); los existentes conservan lo que tengan.
    afectacionIva: catalogos.impuestos.some((i) => Number(i.porcentaje) === 10) ? "1" : "",
    proporcionGravadaIva: "",
    precioVentaReferencia: "",
    controlaStock: true,
    modoControlStock: "CANTIDAD",
    permiteTerceros: false,
    requiereVencimiento: false,
    stockMinimo: "0",
    stockMaximo: "",
    puntoReposicion: "",
    inventarioInicial: { cantidad: "", costoUnitario: "", depositoId: catalogos.depositos.length === 1 ? catalogos.depositos[0].id : "" },
    partidaArancelaria: "",
    ncm: "",
    dncpGeneral: "",
    dncpEspecifico: "",
    paisOrigenCodigo: "PRY",
    informacionFactura: "",
    relacionMercaderia: "",
    porcentajeMerma: "",
    cantidadMerma: "",
    vendible: true,
    comprable: true,
    requiereInspeccionCalidad: false,
    vidaUtilDias: "",
    pesoNetoKg: "",
    pesoBrutoKg: "",
    largoCm: "",
    anchoCm: "",
    altoCm: "",
    volumenM3: "",
    imagenUrl: "",
    observacion: "",
    activo: true,
    codigos: [],
    unidades: [],
    proveedores: [],
    depositos: [],
    alternativos: [],
    componentes: [],
    eliminaciones: eliminacionesVacias(),
  };
}

export function formularioDesdeDetalle(d: ProductoDetalle): FormularioProducto {
  return {
    codigo: d.codigo,
    codigoInventario: d.codigoInventario,
    codigoSifen: d.codigoSifen,
    codigoBarras: d.codigoBarras,
    descripcion: d.descripcion,
    descripcionFactura: d.descripcionFactura,
    tipoProducto: d.tipoProducto,
    categoriaId: d.categoriaId,
    marcaId: d.marcaId,
    familiaId: d.familiaId,
    lineaId: d.lineaId,
    procedencia: d.procedencia,
    unidadMedidaId: d.unidadMedidaId,
    impuestoId: d.impuestoId,
    afectacionIva: d.afectacionIva,
    proporcionGravadaIva: d.proporcionGravadaIva,
    precioVentaReferencia: d.precioVentaReferencia ?? "",
    controlaStock: d.controlaStock,
    modoControlStock: d.modoControlStock,
    permiteTerceros: d.permiteTerceros,
    requiereVencimiento: d.requiereVencimiento,
    stockMinimo: d.stockMinimo,
    stockMaximo: d.stockMaximo,
    puntoReposicion: d.puntoReposicion,
    // En edición el inventario inicial no se vuelve a registrar (ya existe como movimiento): los cambios de stock van por Movimientos.
    inventarioInicial: { cantidad: "", costoUnitario: "", depositoId: "" },
    partidaArancelaria: d.partidaArancelaria,
    ncm: d.ncm,
    dncpGeneral: d.dncpGeneral,
    dncpEspecifico: d.dncpEspecifico,
    paisOrigenCodigo: d.paisOrigenCodigo,
    informacionFactura: d.informacionFactura,
    relacionMercaderia: d.relacionMercaderia,
    porcentajeMerma: d.porcentajeMerma,
    cantidadMerma: d.cantidadMerma,
    vendible: d.vendible,
    comprable: d.comprable,
    requiereInspeccionCalidad: d.requiereInspeccionCalidad,
    vidaUtilDias: d.vidaUtilDias,
    pesoNetoKg: d.pesoNetoKg,
    pesoBrutoKg: d.pesoBrutoKg,
    largoCm: d.largoCm,
    anchoCm: d.anchoCm,
    altoCm: d.altoCm,
    volumenM3: d.volumenM3,
    imagenUrl: d.imagenUrl,
    observacion: d.observacion,
    activo: d.activo,
    codigos: structuredClone(d.codigos),
    unidades: structuredClone(d.unidades),
    proveedores: structuredClone(d.proveedores),
    depositos: structuredClone(d.depositos),
    alternativos: structuredClone(d.alternativos),
    componentes: structuredClone(d.componentes),
    eliminaciones: eliminacionesVacias(),
  };
}

/** Contrato de la API. Las filas nuevas llevan id temporal (no UUID): el servidor las trata como altas. */
export function formularioAPayload(f: FormularioProducto, modo: "crear" | "editar"): Record<string, unknown> {
  const { eliminaciones, inventarioInicial, ...resto } = f;

  return {
    ...resto,
    codigo: modo === "crear" ? "" : f.codigo,
    descripcion: f.descripcion.trim().toUpperCase(),
    inventarioInicial: modo === "crear" ? inventarioInicial : { cantidad: "", costoUnitario: "", depositoId: "" },
    eliminaciones: Object.fromEntries(COLECCIONES.map((c) => [c, eliminaciones[c].filter((id) => UUID.test(id))])),
  };
}
