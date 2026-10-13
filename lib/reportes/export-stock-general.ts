import type { Celda, TablaReporte } from "@/lib/reportes/export";
import { fmtCantidadTexto, TEXTO_PROPIEDAD, textoTercerosEstadosTexto } from "@/lib/reportes/formato";
import type { StockGeneralFiltros, StockGeneralFila, StockGeneralRespuesta } from "@/types/reportes";

// Exportación de Stock general: usa exactamente las mismas filas, totales y filtros que la pantalla. Cantidades como texto numeric exacto; el total general
// NO suma cantidades de unidades distintas («n/a»): los totales por unidad van explícitos en las notas.

export const NIVEL: Record<string, string> = { SIN_STOCK: "Sin stock", BAJO: "Bajo", NORMAL: "Normal", SOBRESTOCK: "Sobrestock" };
export const NO_APLICA = "n/a";
export const EXISTENCIA_STOCK_GENERAL: Record<StockGeneralFiltros["existencia"], string> = {
  TODOS: "Todos", CON: "Con stock (propio, en tránsito o de terceros)", SIN: "Sin stock (nada propio ni de terceros)",
};

export function describirFiltros(r: StockGeneralRespuesta): string[] {
  const f: StockGeneralFiltros = r.filtros;
  const nombre = (l: { id: string; nombre: string }[], id: string) => l.find((x) => x.id === id)?.nombre ?? id;
  const inactivos = r.catalogos.depositos.filter((d) => !d.activo).length;
  const out = [`Vista: ${f.vista === "PRODUCTO" ? "Agregado por producto" : "Detalle por depósito y lote"}`];
  out.push(`Depósito: ${f.depositoId ? nombre(r.catalogos.depositos, f.depositoId) : `Todos los de su alcance (${r.catalogos.depositos.length}${inactivos ? `, ${inactivos} inactivo(s)` : ""})`}`);
  if (f.q) out.push(`Búsqueda: ${f.q}`);
  if (f.categoriaId) out.push(`Categoría: ${nombre(r.catalogos.categorias, f.categoriaId)}`);
  if (f.marcaId) out.push(`Marca: ${nombre(r.catalogos.marcas, f.marcaId)}`);
  if (f.familiaId) out.push(`Familia: ${nombre(r.catalogos.familias, f.familiaId)}`);
  if (f.situacion) out.push(`Situación: ${NIVEL[f.situacion]}`);
  if (f.lote) out.push(`Lote: ${f.lote}`);
  if (f.existencia !== "TODOS") out.push(`Existencia: ${EXISTENCIA_STOCK_GENERAL[f.existencia]}`);
  return out;
}

type Cant = "disponible" | "reservado" | "cuarentena" | "transito" | "fisico" | "virtual";
export type Col = { titulo: string; peso: number; cant?: Cant | "terceros"; valor: (f: StockGeneralFila) => string | number };

const textoDeposito = (f: StockGeneralFila) => (f.sinSaldo ? "Sin saldo en el alcance filtrado" : f.depositoInactivo ? `${f.deposito} (inactivo)` : f.deposito);

export function columnas(vista: StockGeneralFiltros["vista"]): Col[] {
  const base: Col[] = [
    { titulo: "Código", peso: 5.5, valor: (f) => f.codigo },
    { titulo: "Cód. inv. / GTIN", peso: 8, valor: (f) => [f.codigoInventario, f.codigoBarras].filter(Boolean).join(" / ") },
    { titulo: "Descripción", peso: 11, valor: (f) => f.descripcion },
    { titulo: "Categoría", peso: 6.5, valor: (f) => f.categoria },
    { titulo: "Marca", peso: 5.5, valor: (f) => f.marca },
    { titulo: "Familia", peso: 5.5, valor: (f) => f.familia },
    { titulo: "Línea", peso: 4.5, valor: (f) => f.linea },
    { titulo: "Unidad", peso: 4, valor: (f) => f.unidad },
  ];
  const cant = (titulo: string, k: Cant): Col => ({ titulo, peso: 5.8, cant: k, valor: (f) => f[k] });
  // Mismas columnas de cantidad en las dos vistas: Disponible…Virtual = stock PROPIO; Terceros = stock de terceros (todos los estados).
  const cantidades: Col[] = [
    cant("Disponible", "disponible"), cant("Reservado", "reservado"), cant("Cuarentena", "cuarentena"), cant("En tránsito", "transito"),
    cant("Físico", "fisico"), cant("Virtual", "virtual"),
    { titulo: "Terceros", peso: 5.8, cant: "terceros", valor: (f) => f.terceros },
    { titulo: "Terceros por estado", peso: 11, valor: (f) => textoTercerosEstadosTexto(f.tercerosEstados) },
  ];
  if (vista === "PRODUCTO") return [...base, ...cantidades, { titulo: "Situación", peso: 5.5, valor: (f) => NIVEL[f.nivel] }];
  return [
    ...base,
    { titulo: "Depósito", peso: 8, valor: textoDeposito },
    { titulo: "Lote", peso: 4.5, valor: (f) => f.lote },
    { titulo: "Vencimiento", peso: 6, valor: (f) => f.fechaVencimiento },
    { titulo: "Propiedad", peso: 6.5, valor: (f) => TEXTO_PROPIEDAD[f.propiedad] ?? "" },
    ...cantidades,
  ];
}

/** Totales por unidad de medida, explícitos y rotulados (nunca una suma sin unidad). */
export function resumenPorUnidad(r: StockGeneralRespuesta): string[] {
  return r.totales.porUnidad.map(
    (u) => `${u.unidad || "Sin unidad"} (${u.productos} producto(s)): disponible ${fmtCantidadTexto(u.disponible)} · reservado ${fmtCantidadTexto(u.reservado)} · cuarentena ${fmtCantidadTexto(u.cuarentena)} · tránsito ${fmtCantidadTexto(u.transito)} · físico ${fmtCantidadTexto(u.fisico)} · virtual ${fmtCantidadTexto(u.virtual)} · terceros ${fmtCantidadTexto(u.terceros)}`,
  );
}

const filaTotal = (cols: Col[], etiqueta: string): Celda[] => cols.map((c, i) => (i === 0 ? etiqueta : c.cant ? NO_APLICA : ""));

/** Mismas filas, filtros y totales que la pantalla; la escritura de Excel/PDF es común a todos los reportes (lib/reportes/export.ts). */
export function tablaStockGeneral(r: StockGeneralRespuesta): TablaReporte {
  const cols = columnas(r.filtros.vista);
  const t = r.totales;

  return {
    titulo: "Stock general",
    hoja: "Stock general",
    nombreBase: `Stock_General_${r.filtros.vista === "PRODUCTO" ? "Producto" : "Detalle"}`,
    empresa: r.empresa.nombre,
    generado: r.generado,
    sello: r.sello,
    filtros: describirFiltros(r),
    totalFilas: r.pagina.totalFilas,
    columnas: cols.map((c) => ({ titulo: c.titulo, peso: c.peso, tipo: c.cant ? "cantidad" : "texto" })),
    filas: r.filas.map((f) => cols.map((c) => c.valor(f))),
    totales: [{ etiqueta: "TOTAL GENERAL (cantidades no sumadas entre unidades)", celdas: filaTotal(cols, "") }],
    colEtiquetaPdf: 2,
    notas: [
      `Productos: ${t.productos} · Sin saldo: ${t.sinSaldo} · Situación — sin stock: ${t.sinStock}, bajo: ${t.bajo}, sobrestock: ${t.sobrestock}.`,
      ...(r.totales.porUnidad.length ? ["Totales por unidad de medida:", ...resumenPorUnidad(r)] : []),
      ...r.cobertura,
    ],
  };
}
