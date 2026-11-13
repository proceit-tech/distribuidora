import type { CatalogoProductos } from "@/types/productos";

/**
 * CAT-A04: categoría, marca, familia y línea ya asignadas a un producto que hoy están INACTIVAS (y por eso no vienen en los catálogos activos). El detalle del producto las
 * devuelve solo para ese producto y su empresa; aquí se agregan al selector marcadas «(inactivo)» para no perder el dato al editar. No se ofrecen otros inactivos para elegir.
 */
export type ReferenciasHistoricasProducto = Partial<Record<"categoriaId" | "marcaId" | "familiaId" | "lineaId", { id: string; codigo: string; nombre: string; padreId: string | null }>>;

export function catalogosConHistoricas(catalogos: CatalogoProductos, historicas: ReferenciasHistoricasProducto | undefined): CatalogoProductos {
  if (!historicas) return catalogos;

  const rot = (nombre: string) => `${nombre} (inactivo)`;
  const h = historicas;

  return {
    ...catalogos,
    categorias: h.categoriaId && !catalogos.categorias.some((x) => x.id === h.categoriaId!.id) ? [...catalogos.categorias, { id: h.categoriaId.id, codigo: h.categoriaId.codigo, nombre: rot(h.categoriaId.nombre) }] : catalogos.categorias,
    marcas: h.marcaId && !catalogos.marcas.some((x) => x.id === h.marcaId!.id) ? [...catalogos.marcas, { id: h.marcaId.id, codigo: h.marcaId.codigo, nombre: rot(h.marcaId.nombre) }] : catalogos.marcas,
    familias: h.familiaId && !catalogos.familias.some((x) => x.id === h.familiaId!.id) ? [...catalogos.familias, { id: h.familiaId.id, codigo: h.familiaId.codigo, nombre: rot(h.familiaId.nombre), categoriaId: h.familiaId.padreId }] : catalogos.familias,
    lineas: h.lineaId && !catalogos.lineas.some((x) => x.id === h.lineaId!.id) && h.lineaId.padreId ? [...catalogos.lineas, { id: h.lineaId.id, familiaId: h.lineaId.padreId, codigo: h.lineaId.codigo, nombre: rot(h.lineaId.nombre) }] : catalogos.lineas,
  };
}
