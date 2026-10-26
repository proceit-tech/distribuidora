import type { Celda, ColRep, FilaTotal, TablaReporte } from "@/lib/reportes/export";
import {
  describirFiltrosVentas,
  ETIQUETA_AJUSTE_NO_ATRIBUIBLE,
  ETIQUETA_ANOMALIA,
  ETIQUETA_MOTIVO_NCE,
  ETIQUETA_SITUACION_VENTAS,
  ETIQUETA_VENDEDOR,
  etiquetaLocal,
  etiquetaSifen,
  etiquetaTipoVentas,
} from "@/lib/reportes/ventas-presentacion";
import type { VentasFilaDocumento, VentasFilaGrupo, VentasImportes, VentasRespuesta, VistaVentas } from "@/types/reportes";

// Exportación del Informe de Ventas: mismas filas, filtros, totales por moneda, estados informativos, anomalías y avisos que la pantalla (una sola lectura con snapshot por solicitud).
// Dinero y cantidades salen como texto numeric exacto de PostgreSQL; aquí NO se suma ni se resta nada (los totales vienen calculados por la base). Nunca hay total entre monedas.

type Col<T> = ColRep & { valor: (f: T) => Celda };

const txt = <T,>(titulo: string, peso: number, valor: (f: T) => string): Col<T> => ({ titulo, peso, tipo: "texto", valor });
const cant = <T,>(titulo: string, peso: number, valor: (f: T) => string | number | null): Col<T> => ({ titulo, peso, tipo: "cantidad", valor: (f) => valor(f) ?? "n/a" });
const dinero = <T,>(titulo: string, peso: number, valor: (f: T) => string | null): Col<T> => ({ titulo, peso, tipo: "dinero", valor });

/** Cambia el signo de un decimal en texto exacto (sin pasar por Number). */
export const negativo = (v: string): string => (/^-?0+(\.0+)?$/.test(v) ? v.replace(/^-/, "") : v.startsWith("-") ? v.slice(1) : `-${v}`);

const columnasImportes = <T extends VentasImportes>(): Col<T>[] => [
  cant("FE aprobadas", 5, (f) => f.documentosFe), cant("NCE aprobadas", 5, (f) => f.documentosNce),
  dinero("FE con IVA", 8, (f) => f.feConIva), dinero("IVA FE", 7, (f) => f.ivaFe), dinero("NCE con IVA", 8, (f) => f.nceConIva), dinero("IVA NCE", 7, (f) => f.ivaNce),
  dinero("Venta neta con IVA", 8, (f) => f.netoConIva), dinero("IVA neto", 7, (f) => f.ivaNeto), dinero("Venta neta sin IVA", 8, (f) => f.netoSinIva),
];

export function columnasVentasResumen(): Col<VentasImportes & { moneda: string }>[] {
  return [
    txt("Moneda", 4, (f) => f.moneda),
    cant("FE aprobadas", 5, (f) => f.documentosFe), dinero("FE con IVA", 8, (f) => f.feConIva), dinero("IVA FE", 7, (f) => f.ivaFe), dinero("FE sin IVA", 8, (f) => f.feSinIva),
    cant("NCE aprobadas", 5, (f) => f.documentosNce), dinero("NCE con IVA", 8, (f) => f.nceConIva), dinero("IVA NCE", 7, (f) => f.ivaNce), dinero("NCE sin IVA", 8, (f) => f.nceSinIva),
    dinero("Venta neta con IVA", 8, (f) => f.netoConIva), dinero("IVA neto", 7, (f) => f.ivaNeto), dinero("Venta neta sin IVA", 8, (f) => f.netoSinIva),
  ];
}

export const textoVendedor = (f: Pick<VentasFilaDocumento, "vendedorEstado" | "vendedor">) => (f.vendedorEstado === "REGISTRADO" ? (f.vendedor ?? "") : ETIQUETA_VENDEDOR[f.vendedorEstado]);
export const textoReferenciaFe = (f: VentasFilaDocumento) => (f.tipo !== "NCE" ? "" : f.feReferencia ?? (f.feFueraAlcance ? "Fuera de su alcance" : "Sin vínculo"));
export const textoSituacion = (f: VentasFilaDocumento) => (f.situacion === "ANOMALIA" && f.anomalia ? `Anomalía: ${ETIQUETA_ANOMALIA[f.anomalia] ?? f.anomalia}` : ETIQUETA_SITUACION_VENTAS[f.situacion]);

export function columnasVentasDocumentos(): Col<VentasFilaDocumento>[] {
  return [
    txt("Fecha", 6, (f) => f.fecha), txt("Tipo", 5, (f) => etiquetaTipoVentas(f.tipo)), txt("Número", 8, (f) => f.numero), txt("CDC", 14, (f) => f.cdc ?? ""),
    txt("Sucursal", 7, (f) => f.sucursal), txt("Cliente (receptor)", 12, (f) => f.receptor), txt("RUC / documento", 7, (f) => f.receptorDocumento ?? ""),
    txt("Vendedor", 9, textoVendedor), txt("Moneda", 4, (f) => f.moneda),
    dinero("Total con IVA", 8, (f) => f.totalConIva), dinero("IVA", 7, (f) => f.iva), dinero("Sin IVA", 8, (f) => f.sinIva),
    txt("Estado fiscal", 7, (f) => etiquetaSifen(f.estadoSifen)), txt("Estado de envío", 7, (f) => etiquetaLocal(f.estadoLocal)), txt("Situación", 10, textoSituacion),
    txt("Motivo NCE", 6, (f) => (f.nceMotivo ? (ETIQUETA_MOTIVO_NCE[f.nceMotivo] ?? String(f.nceMotivo)) : "")), txt("Factura original", 8, textoReferenciaFe),
  ];
}

export function columnasVentasGrupo(vista: VistaVentas): Col<VentasFilaGrupo>[] {
  if (vista === "PRODUCTOS") {
    return [
      txt("Código", 7, (f) => f.etiqueta), txt("Descripción", 14, (f) => f.detalle), txt("Unidad", 5, (f) => f.unidad), txt("Moneda", 4, (f) => f.moneda),
      cant("Cant. vendida", 6, (f) => f.cantidadVendida), cant("Cant. devuelta", 6, (f) => f.cantidadDevuelta), ...columnasImportes<VentasFilaGrupo>(),
    ];
  }
  if (vista === "CLIENTES") return [txt("Cliente", 14, (f) => f.etiqueta), txt("RUC / documento", 7, (f) => f.detalle), txt("Moneda", 4, (f) => f.moneda), ...columnasImportes<VentasFilaGrupo>()];

  return [txt(vista === "VENDEDORES" ? "Vendedor" : "Mes", 12, (f) => f.etiqueta), txt("Moneda", 4, (f) => f.moneda), ...columnasImportes<VentasFilaGrupo>()];
}

/** Fila de totales con las celdas alineadas por título de columna (las no aplicables quedan vacías). */
function filaTotal(cols: ColRep[], etiqueta: string, valores: Record<string, Celda>): FilaTotal {
  return { etiqueta, celdas: cols.map((c) => (c.titulo in valores ? valores[c.titulo] : "")) };
}

const valoresImportes = (i: VentasImportes & { moneda: string }): Record<string, Celda> => ({
  "Moneda": i.moneda, "FE aprobadas": i.documentosFe, "NCE aprobadas": i.documentosNce, "FE con IVA": i.feConIva, "IVA FE": i.ivaFe, "NCE con IVA": i.nceConIva, "IVA NCE": i.ivaNce,
  "Venta neta con IVA": i.netoConIva, "IVA neto": i.ivaNeto, "Venta neta sin IVA": i.netoSinIva,
});

/** Notas comunes: indicadores por moneda, bloque informativo de estados, anomalías, avisos y cobertura. */
export function notasVentas(r: VentasRespuesta): string[] {
  const out: string[] = [];

  if (r.resumen.length === 0) out.push("Sin documentos FE/NCE en el período y filtros indicados.");
  for (const m of r.resumen) {
    out.push(`${m.moneda} — FE aprobadas ${m.documentosFe}: con IVA ${m.feConIva}, IVA ${m.ivaFe}, sin IVA ${m.feSinIva} · NCE aprobadas ${m.documentosNce}: con IVA ${m.nceConIva}, IVA ${m.ivaNce} · Venta neta con IVA ${m.netoConIva} · IVA neto ${m.ivaNeto} · Venta neta sin IVA ${m.netoSinIva}.`);
  }
  if (r.estados.length) {
    out.push(`No computan (informativo, no alteran los netos): ${r.estados.map((e) => `${etiquetaTipoVentas(e.tipo)} ${etiquetaSifen(e.estadoSifen)} ${e.moneda}: ${e.documentos} doc.${e.enviados ? ` (${e.enviados} enviados sin aprobación)` : ""}, importe informativo ${e.total}`).join("; ")}.`);
  }
  if (r.anomalias.length) {
    out.push(`Anomalías (aprobados no conciliables, excluidos de los indicadores): ${r.anomalias.map((a) => `${ETIQUETA_ANOMALIA[a.motivo] ?? a.motivo} — ${etiquetaTipoVentas(a.tipo)} ${a.moneda}: ${a.documentos} doc., importe ${a.total}`).join("; ")}.`);
  }

  return [...out, ...r.avisos, ...r.cobertura];
}

const NOMBRE_VISTA: Record<VistaVentas, string> = { RESUMEN: "Resumen", DOCUMENTOS: "Documentos", PRODUCTOS: "Productos", CLIENTES: "Clientes", VENDEDORES: "Vendedores", MESES: "Meses" };

export function tablaVentas(r: VentasRespuesta): TablaReporte {
  const vista = r.filtros.vista;
  const comun = {
    titulo: "Informe de Ventas",
    hoja: `Ventas ${NOMBRE_VISTA[vista]}`,
    nombreBase: `Informe_Ventas_${NOMBRE_VISTA[vista]}`,
    empresa: r.empresa.nombre,
    generado: r.generado,
    sello: r.sello,
    filtros: describirFiltrosVentas(r.filtros, r.catalogos, r.generado),
    notas: notasVentas(r),
    multilinea: true,
  };

  if (vista === "RESUMEN") {
    const cols = columnasVentasResumen();

    return { ...comun, totalFilas: r.resumen.length, columnas: cols.map(({ titulo, peso, tipo }) => ({ titulo, peso, tipo })), filas: r.resumen.map((f) => cols.map((c) => c.valor(f))), totales: [], colEtiquetaPdf: 0, pdfAnclas: [0] };
  }

  if (vista === "DOCUMENTOS") {
    const cols = columnasVentasDocumentos();
    const totales = r.totalesDocumentos.map((t) => filaTotal(cols, `TOTAL COMPUTADO ${t.moneda} (${t.computan} de ${t.filas} documento(s) computan)`, {
      "Moneda": t.moneda, "Total con IVA": t.totalConIva, "IVA": t.iva, "Sin IVA": t.sinIva,
    }));

    return { ...comun, totalFilas: r.pagina.totalFilas, columnas: cols.map(({ titulo, peso, tipo }) => ({ titulo, peso, tipo })), filas: r.documentos.map((f) => cols.map((c) => c.valor(f))), totales, colEtiquetaPdf: 5, pdfAnclas: [0, 2] };
  }

  const cols = columnasVentasGrupo(vista);
  const totales: FilaTotal[] = [];

  if (vista === "PRODUCTOS") {
    const conFiltro = r.filtros.producto !== "";
    const monedas = [...new Set([...r.totalesProductos.map((t) => t.moneda), ...r.ajustesNoAtribuibles.map((a) => a.moneda)])];

    for (const m of monedas) {
      const sub = r.totalesProductos.find((t) => t.moneda === m);
      const aj = r.ajustesNoAtribuibles.find((a) => a.moneda === m);
      const tot = r.resumen.find((t) => t.moneda === m);

      if (sub) totales.push(filaTotal(cols, `SUBTOTAL PRODUCTOS ${m}${conFiltro ? " (filtro de producto: no concilia con el total)" : ""}`, valoresImportes(sub)));
      if (aj) {
        totales.push(filaTotal(cols, `${ETIQUETA_AJUSTE_NO_ATRIBUIBLE.toUpperCase()} ${m}`, {
          "Moneda": m, "NCE aprobadas": aj.documentos, "NCE con IVA": aj.conIva, "IVA NCE": aj.iva, "Venta neta con IVA": negativo(aj.conIva), "IVA neto": negativo(aj.iva), "Venta neta sin IVA": negativo(aj.sinIva),
        }));
      }
      // Sin filtro de producto, productos + ajustes = total del período (el total proviene de la base, no de una suma en la aplicación).
      if (!conFiltro && tot) totales.push(filaTotal(cols, `TOTAL ${m} (productos + ajustes no atribuibles)`, valoresImportes(tot)));
    }
  } else {
    for (const t of r.resumen) totales.push(filaTotal(cols, `TOTAL ${t.moneda}`, valoresImportes(t)));
  }

  return { ...comun, totalFilas: r.pagina.totalFilas, columnas: cols.map(({ titulo, peso, tipo }) => ({ titulo, peso, tipo })), filas: r.grupos.map((f) => cols.map((c) => c.valor(f))), totales, colEtiquetaPdf: 0, pdfAnclas: vista === "PRODUCTOS" ? [0, 1] : [0] };
}
