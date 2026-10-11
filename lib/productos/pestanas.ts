/** Pestañas del formulario de Productos y su correspondencia con los campos (para enfocar el error exacto). */
export type PestanaId = "general" | "sifen" | "stock" | "compras" | "logistica" | "kit" | "documentos";

const POR_COLECCION: Record<string, PestanaId> = {
  codigos: "sifen",
  depositos: "stock",
  unidades: "compras",
  proveedores: "compras",
  alternativos: "kit",
  componentes: "kit",
  documentos: "documentos",
};

const POR_CAMPO: Record<string, PestanaId> = {
  codigoSifen: "sifen",
  ncm: "sifen",
  partidaArancelaria: "sifen",
  dncpGeneral: "sifen",
  dncpEspecifico: "sifen",
  paisOrigenCodigo: "sifen",
  codigoBarras: "sifen",
  informacionFactura: "sifen",
  modoControlStock: "stock",
  stockMinimo: "stock",
  stockMaximo: "stock",
  puntoReposicion: "stock",
  vidaUtilDias: "stock",
  controlaStock: "stock",
  requiereVencimiento: "stock",
  requiereInspeccionCalidad: "stock",
  inventarioInicial: "stock",
  pesoNetoKg: "logistica",
  pesoBrutoKg: "logistica",
  largoCm: "logistica",
  anchoCm: "logistica",
  altoCm: "logistica",
  volumenM3: "logistica",
  relacionMercaderia: "logistica",
  cantidadMerma: "logistica",
  porcentajeMerma: "logistica",
  observacion: "logistica",
};

export function pestanaDeCampo(campo: string): PestanaId | null {
  const [raiz] = campo.split(".");

  return POR_COLECCION[raiz] ?? POR_CAMPO[raiz] ?? "general";
}

/** Identificador DOM estable de un campo, para enfocarlo tras un error. */
export function idCampo(campo: string) {
  return `prd-${campo.replaceAll(".", "-")}`;
}
