/** Reglas del formulario de Listas de Precios (cliente y pruebas): validación por campo, advertencias, alta de ítems y cambios sin guardar. */
import { margenBruto, redondearMoneda, tramosSuperpuestos } from "@/lib/listas-precio/calculos";
import type { CatalogoListasPrecio, ListaPrecioProducto, NuevaListaPrecio } from "@/types/lista-precio";

export type TabLista = "informacion" | "productos" | "reglas";
export type ErroresLista = Record<string, string>;

const CAMPOS_PRODUCTOS = /^productos(\.|$)/;
const CAMPOS_REGLAS = /^(reglasComerciales(\.|$)|grupoClienteId|clienteId|zonaId|canalVentaId)/;

export function tabDeCampo(campo: string): TabLista {
  if (CAMPOS_PRODUCTOS.test(campo)) return "productos";
  if (CAMPOS_REGLAS.test(campo)) return "reglas";

  return "informacion";
}

/** Id de elemento HTML para un campo (ruta con puntos). */
export const idDeCampo = (campo: string) => `lp-${campo.replace(/\./g, "-")}`;

const finito = (n: number) => Number.isFinite(n);

/** Validación local por campo. Las claves se insertan en orden de pestaña y posición: la primera recibe el foco. */
export function validarListaFormulario(f: NuevaListaPrecio): ErroresLista {
  const e: ErroresLista = {};

  if (!f.nombre.trim()) e.nombre = "Ingrese el nombre de la lista de precios.";
  if (!f.vigenteDesde) e.vigenteDesde = "Ingrese la fecha de vigencia inicial.";
  if (f.vigenteDesde && f.vigenteHasta && f.vigenteHasta < f.vigenteDesde) e.vigenteHasta = "La vigencia final no puede ser anterior a la inicial.";
  if (!finito(f.prioridad) || f.prioridad < 0 || !Number.isInteger(f.prioridad)) e.prioridad = "La prioridad debe ser un entero mayor o igual a 0.";
  if (!finito(f.descuentoMaximoPct) || f.descuentoMaximoPct < 0 || f.descuentoMaximoPct > 100) e.descuentoMaximoPct = "Debe estar entre 0 y 100.";
  if (!finito(f.ajusteGeneralPct) || f.ajusteGeneralPct < -100 || f.ajusteGeneralPct > 999) e.ajusteGeneralPct = "Debe estar entre -100 y 999.";

  f.productos.forEach((p, i) => {
    const r = `productos.${i}`;

    if (!finito(p.costoReferencia) || p.costoReferencia < 0) e[`${r}.costoReferencia`] = "El costo no puede ser negativo.";
    if (!finito(p.precioBase) || p.precioBase < 0) e[`${r}.precioBase`] = "El precio base no puede ser negativo.";
    if (!finito(p.precioLista) || p.precioLista < 0) e[`${r}.precioLista`] = "El precio no puede ser negativo.";
    if (!finito(p.cantidadMinima) || p.cantidadMinima <= 0) e[`${r}.cantidadMinima`] = "La cantidad mínima debe ser mayor que 0.";
    if (!finito(p.descuentoPct) || p.descuentoPct < 0 || p.descuentoPct > 100) e[`${r}.descuentoPct`] = "Debe estar entre 0 y 100.";
    if (p.vigenteDesde && p.vigenteHasta && p.vigenteHasta < p.vigenteDesde) e[`${r}.vigenteHasta`] = "La vigencia final no puede ser anterior a la inicial.";
    p.escalas.forEach((s, k) => {
      const re = `${r}.escalas.${k}`;

      if (!finito(s.cantidadMinima) || s.cantidadMinima <= 0) e[`${re}.cantidadMinima`] = "Debe ser mayor que 0.";
      if (s.cantidadMaxima !== null && (!finito(s.cantidadMaxima) || s.cantidadMaxima < s.cantidadMinima)) e[`${re}.cantidadMaxima`] = "No puede ser menor que la cantidad mínima.";
      if (!finito(s.precio) || s.precio < 0) e[`${re}.precio`] = "El precio no puede ser negativo.";
      if (!finito(s.descuentoPct) || s.descuentoPct < 0 || s.descuentoPct > 100) e[`${re}.descuentoPct`] = "Debe estar entre 0 y 100.";
    });
  });

  f.reglasComerciales.forEach((g, i) => {
    const r = `reglasComerciales.${i}`;

    if (g.tipoAplicacion !== "GENERAL" && !g.referenciaId) e[`${r}.referenciaId`] = "Seleccione la referencia de la regla.";
    if (!finito(g.prioridad) || g.prioridad < 0 || !Number.isInteger(g.prioridad)) e[`${r}.prioridad`] = "Entero mayor o igual a 0.";
    if (!finito(g.cantidadMinima) || g.cantidadMinima <= 0) e[`${r}.cantidadMinima`] = "Debe ser mayor que 0.";
    if (!finito(g.descuentoMaximoPct) || g.descuentoMaximoPct < 0 || g.descuentoMaximoPct > 100) e[`${r}.descuentoMaximoPct`] = "Debe estar entre 0 y 100.";
    if (g.vigenteDesde && g.vigenteHasta && g.vigenteHasta < g.vigenteDesde) e[`${r}.vigenteHasta`] = "La vigencia final no puede ser anterior a la inicial.";
  });

  return e;
}

export type AdvertenciasLista = {
  /** Precios activos con precio de lista 0 (sin precio de referencia o sin cargar). */
  sinPrecio: number;
  /** Productos (índices) con escalones cuyas cantidades se solapan: la selección del escalón sería ambigua. */
  escalonesSuperpuestos: number[];
};

export function advertenciasLista(f: NuevaListaPrecio): AdvertenciasLista {
  return {
    sinPrecio: f.productos.filter((p) => p.activo && p.precioLista <= 0).length,
    escalonesSuperpuestos: f.productos.flatMap((p, i) => (tramosSuperpuestos(p.escalas).length > 0 ? [i] : [])),
  };
}

/**
 * Alta de un precio por producto. Los valores de referencia (costo promedio y precio de referencia) están en la moneda base de la empresa: solo
 * se usan si la lista está en esa misma moneda (no hay conversión aprobada). Sin precio de referencia el precio queda en 0 y se avisa: el
 * costo NUNCA se toma como precio de venta.
 */
export function nuevoItemLista(
  producto: CatalogoListasPrecio["productos"][number],
  contexto: { monedaLista: string; monedaBase: string; vigenteDesde: string; vigenteHasta: string; id: string },
): ListaPrecioProducto {
  const usaReferencia = contexto.monedaLista === contexto.monedaBase;
  const costo = usaReferencia ? redondearMoneda(producto.costoPromedio, contexto.monedaLista) : 0;
  const precio = usaReferencia && producto.precioReferencia !== null ? redondearMoneda(producto.precioReferencia, contexto.monedaLista) : 0;

  return {
    id: contexto.id,
    productoId: producto.id,
    productoCodigo: producto.codigo,
    productoDescripcion: producto.descripcion,
    unidadMedidaId: producto.unidadMedidaId,
    unidadMedidaNombre: producto.unidadMedidaNombre,
    monedaCodigo: contexto.monedaLista,
    costoReferencia: costo,
    precioBase: precio,
    precioLista: precio,
    margenPct: margenBruto(precio, costo) ?? 0,
    descuentoPct: 0,
    cantidadMinima: 1,
    vigenteDesde: contexto.vigenteDesde,
    vigenteHasta: contexto.vigenteHasta,
    activo: true,
    escalas: [],
  };
}

/** Opciones de un catálogo: las activas más la que ya estaba seleccionada aunque se haya inactivado (no se pierde el vínculo al editar). */
export function opcionesConSeleccion<T extends { id: string; activo?: boolean }>(catalogo: T[], seleccionId: string, respaldo?: Omit<T, "activo">): T[] {
  const visibles = catalogo.filter((o) => o.activo !== false || o.id === seleccionId);

  if (seleccionId && !visibles.some((o) => o.id === seleccionId) && respaldo) return [...visibles, respaldo as unknown as T];

  return visibles;
}

export function listaSucia(actual: NuevaListaPrecio | null, base: string): boolean {
  return actual !== null && JSON.stringify(actual) !== base;
}
