import type { Celda, ColRep, TablaReporte } from "@/lib/reportes/export";
import { fmtNum } from "@/lib/reportes/formato";
import { ORIGENES_KARDEX, TIPOS_KARDEX } from "@/lib/reportes/kardex-textos";
import type { KardexFila, KardexFiltros, KardexMovimientos, KardexResumenFila, KardexRespuesta } from "@/types/reportes";

// Exportación del Kardex: mismas filas (en el mismo orden), filtros, saldos y totales que la pantalla.

export const NOMBRE_TIPO: Record<string, string> = Object.fromEntries(TIPOS_KARDEX.map((t) => [t.id, t.nombre]));

export const textoTipo = (f: Pick<KardexFila, "tipo" | "origen">) => `${NOMBRE_TIPO[f.tipo] ?? f.tipo} · ${ORIGENES_KARDEX[f.origen] ?? f.origen}`;
export const textoVinculo = (f: Pick<KardexFila, "vinculado" | "vinculoTipo">) =>
  f.vinculoTipo === "ANULADO_POR" ? `Anulado por ${f.vinculado}` : f.vinculoTipo === "ANULA_A" ? `Anula a ${f.vinculado}` : "";
const sg = (v: number) => (v > 0 ? `+${v}` : `${v}`);
/** Efecto de un cambio de estado de stock (reserva, cuarentena y sus liberaciones). */
export const textoCambioEstado = (f: Pick<KardexFila, "efecto" | "dDisponible" | "dReservado" | "dCuarentena">) =>
  f.efecto !== "ESTADO"
    ? ""
    : [f.dDisponible !== 0 ? `Disp. ${sg(f.dDisponible)}` : "", f.dReservado !== 0 ? `Res. ${sg(f.dReservado)}` : "", f.dCuarentena !== 0 ? `Cuar. ${sg(f.dCuarentena)}` : ""].filter(Boolean).join(" · ");
export const textoEstadoMov = (e: string) => (e === "ANULADO" ? "Anulado" : "Registrado");

export function describirFiltrosKardex(r: KardexRespuesta): string[] {
  const f: KardexFiltros = r.filtros;
  const nombre = (l: { id: string; nombre: string }[], id: string) => l.find((x) => x.id === id)?.nombre ?? id;
  const out = [`Vista: ${f.vista === "DETALLE" ? "Detalle de movimientos" : "Resumen por producto, depósito y lote"}`];
  out.push(`Período (fecha de registro): ${f.desde || "inicio"} a ${f.hasta || "hoy"}`);
  out.push(`Depósito: ${f.depositoId ? nombre(r.catalogos.depositos, f.depositoId) : "Todos"}`);
  if (f.q) out.push(`Producto: ${f.q}`);
  if (f.tipo) out.push(`Tipo: ${NOMBRE_TIPO[f.tipo] ?? f.tipo}`);
  if (f.usuarioId) out.push(`Usuario: ${nombre(r.catalogos.usuarios, f.usuarioId)}`);
  if (f.documento) out.push(`Documento: ${f.documento}`);
  if (f.estado) out.push(`Estado del movimiento: ${textoEstadoMov(f.estado)}`);
  if (f.estadoStock) out.push(`Estado de stock afectado: ${f.estadoStock === "DISPONIBLE" ? "Disponible" : f.estadoStock === "RESERVADO" ? "Reservado" : "Cuarentena"}`);
  if (f.lote) out.push(`Lote: ${f.lote}`);
  return out;
}

type ColK = ColRep & { valor: (f: KardexFila) => Celda };
const txt = (titulo: string, peso: number, valor: (f: KardexFila) => string): ColK => ({ titulo, peso, tipo: "texto", valor });
const qty = (titulo: string, peso: number, valor: (f: KardexFila) => number): ColK => ({ titulo, peso, tipo: "cantidad", valor });

export const COLUMNAS_KARDEX: ColK[] = [
  txt("Fecha y hora", 8, (f) => `${f.fechaRegistro} ${f.horaRegistro.slice(0, 5)}${f.retroactivo ? ` (mov. ${f.fechaMovimiento})` : ""}`),
  txt("Movimiento", 5.5, (f) => f.numero),
  txt("Tipo · origen", 9, textoTipo),
  txt("Estado", 4.5, (f) => textoEstadoMov(f.estado)),
  txt("Documento", 6, (f) => f.documento),
  txt("Código", 5, (f) => f.productoCodigo),
  txt("Producto", 10, (f) => f.productoDescripcion),
  txt("Depósito", 7, (f) => (f.contraparte ? `${f.deposito} (${f.efecto === "ENTRADA" ? "desde" : "hacia"} ${f.contraparte})` : f.deposito)),
  txt("Lote", 4.5, (f) => f.lote),
  qty("Entrada", 4.5, (f) => f.entrada),
  qty("Salida", 4.5, (f) => f.salida),
  txt("Cambio de estado", 7, textoCambioEstado),
  qty("Saldo físico", 5, (f) => f.saldoFisico),
  qty("Disponible", 5, (f) => f.saldoDisponible),
  qty("Reservado", 5, (f) => f.saldoReservado),
  qty("Cuarentena", 5, (f) => f.saldoCuarentena),
  { titulo: "Costo unit.", peso: 5.5, tipo: "dinero", valor: (f) => f.costoUnitario },
  { titulo: "Costo total", peso: 6, tipo: "dinero", valor: (f) => f.costoTotal },
  txt("Motivo", 7, (f) => f.motivo),
  txt("Usuario", 4.5, (f) => f.usuario),
  txt("Vinculado", 6.5, textoVinculo),
];

type ColR = ColRep & { k: string; valor: (f: KardexResumenFila) => Celda };
const rt = (k: string, titulo: string, peso: number, valor: (f: KardexResumenFila) => string): ColR => ({ k, titulo, peso, tipo: "texto", valor });
const rq = (k: string, titulo: string, peso: number, valor: (f: KardexResumenFila) => number): ColR => ({ k, titulo, peso, tipo: "cantidad", valor });
/** Con filtros de fila, los movimientos son los filtrados y aparece la columna "Fuera del filtro" (variación neta del resto del período). */
export function columnasResumen(filtrosDeFila: boolean): ColR[] {
  const fl = filtrosDeFila ? " filtradas" : "";
  return [
    rt("cod", "Código", 6, (f) => f.productoCodigo), rt("prod", "Producto", 12, (f) => f.productoDescripcion), rt("dep", "Depósito", 8, (f) => f.deposito), rt("lote", "Lote", 5, (f) => f.lote),
    rq("ini", "Saldo inicial", 6, (f) => f.saldoInicial), rq("ent", "Entradas" + fl, 5.5, (f) => f.entradas), rq("sal", "Salidas" + fl, 5.5, (f) => f.salidas),
    rq("tent", "Transf. entrada" + fl, 6, (f) => f.transfEntradas), rq("tsal", "Transf. salida" + fl, 6, (f) => f.transfSalidas),
    ...(filtrosDeFila ? [rq("fuera", "Fuera del filtro (neto)", 6.5, (f) => f.fueraDelFiltro)] : []),
    rq("fin", "Saldo final", 6, (f) => f.saldoFinal),
    rq("disp", "Disponible", 5, (f) => f.finalDisponible), rq("res", "Reservado", 5, (f) => f.finalReservado), rq("cuar", "Cuarentena", 5, (f) => f.finalCuarentena),
  ];
}

export const neto = (m: KardexMovimientos) => m.entradas - m.salidas + m.transfEntradas - m.transfSalidas;

export function tablaKardex(r: KardexRespuesta): TablaReporte {
  const t = r.totales;
  const detalle = r.filtros.vista === "DETALLE";
  const fl = t.filtrosDeFila;
  const colsR = columnasResumen(fl);
  const cols: ColRep[] = detalle ? COLUMNAS_KARDEX : colsR;
  const fila = (valores: Record<string, Celda>): Celda[] =>
    detalle ? COLUMNAS_KARDEX.map((c) => (c.titulo in valores ? valores[c.titulo] : "")) : colsR.map((c) => (c.k in valores ? valores[c.k] : ""));
  let totales: TablaReporte["totales"];
  if (detalle) {
    const sal = (x: typeof t.saldoInicial) => ({ "Saldo físico": x.fisico, Disponible: x.disponible, Reservado: x.reservado, Cuarentena: x.cuarentena });
    totales = [
      { etiqueta: "SALDO INICIAL", celdas: fila(sal(t.saldoInicial)) },
      { etiqueta: fl ? "MOV. FILTRADOS" : "TOTAL MOVIMIENTOS", celdas: fila({ Entrada: t.filtrado.entradas, Salida: t.filtrado.salidas }) },
      { etiqueta: fl ? "TRANSF. FILTRADAS" : "TRANSFERENCIAS", celdas: fila({ Entrada: t.filtrado.transfEntradas, Salida: t.filtrado.transfSalidas }) },
      ...(fl
        ? [
            { etiqueta: "MOV. FUERA DEL FILTRO", celdas: fila({ Entrada: t.fueraDelFiltro.entradas, Salida: t.fueraDelFiltro.salidas }) },
            { etiqueta: "TRANSF. FUERA DEL FILTRO", celdas: fila({ Entrada: t.fueraDelFiltro.transfEntradas, Salida: t.fueraDelFiltro.transfSalidas }) },
          ]
        : []),
      { etiqueta: "SALDO FINAL", celdas: fila(sal(t.saldoFinal)) },
    ];
  } else {
    const q = t.resumen!;
    totales = [{
      etiqueta: fl ? "TOTAL FILAS MOSTRADAS" : "TOTAL",
      celdas: fila({ ini: q.saldoInicial, ent: q.entradas, sal: q.salidas, tent: q.transfEntradas, tsal: q.transfSalidas, fuera: q.fueraDelFiltro, fin: q.saldoFinal, disp: q.finalDisponible, res: q.finalReservado, cuar: q.finalCuarentena }),
    }];
    if (fl) {
      totales.push({
        etiqueta: "CONCILIACIÓN COMPLETA",
        celdas: fila({ ini: t.saldoInicial.fisico, ent: t.completo.entradas, sal: t.completo.salidas, tent: t.completo.transfEntradas, tsal: t.completo.transfSalidas, fin: t.saldoFinal.fisico, disp: t.saldoFinal.disponible, res: t.saldoFinal.reservado, cuar: t.saldoFinal.cuarentena }),
      });
    }
  }
  const notas = [
    r.conciliacion.conciliado
      ? `Conciliación con Stock (hoy): el libro de movimientos coincide con los saldos de stock en ${r.conciliacion.combinaciones} combinaciones producto × depósito × lote.`
      : `ATENCIÓN: el libro de movimientos NO coincide con Stock en ${r.conciliacion.divergentes} de ${r.conciliacion.combinaciones} combinaciones producto × depósito × lote; los saldos acumulados pueden no ser confiables.`,
    ...(fl
      ? [
          `Hay filtros de tipo, usuario, documento o estado. Los saldos son los reales del libro; los totales de movimientos corresponden SOLO a las filas filtradas y no explican por sí solos la variación del saldo. Conciliación completa del período: saldo inicial ${fmtNum(t.saldoInicial.fisico)} + movimientos filtrados ${fmtNum(neto(t.filtrado))} + movimientos fuera del filtro ${fmtNum(neto(t.fueraDelFiltro))} = saldo final ${fmtNum(t.saldoFinal.fisico)}${t.cuadra ? "" : " (NO CUADRA: inconsistencia del libro)"}.`,
          ...(detalle ? [] : ["TOTAL FILAS MOSTRADAS suma solo las combinaciones que tienen movimientos filtrados; CONCILIACIÓN COMPLETA incluye todas las combinaciones del período."]),
        ]
      : t.cuadra ? [] : ["ATENCIÓN: el saldo inicial más los movimientos del período no coincide con el saldo final (inconsistencia del libro)."]),
    "Totales: saldo inicial = antes del período; movimientos = entradas y salidas sin transferencias; las transferencias se compensan en el consolidado de la empresa.",
    ...r.cobertura,
  ];
  return {
    titulo: "Kardex de movimientos",
    hoja: "Kardex",
    nombreBase: `Kardex_Movimientos_${detalle ? "Detalle" : "Resumen"}`,
    empresa: r.empresa.nombre,
    generado: r.generado,
    sello: r.sello,
    filtros: describirFiltrosKardex(r),
    totalFilas: r.pagina.totalFilas,
    columnas: cols.map(({ titulo, peso, tipo }) => ({ titulo, peso, tipo })),
    filas: detalle ? r.filas.map((f) => COLUMNAS_KARDEX.map((c) => c.valor(f))) : r.resumen.map((f) => colsR.map((c) => c.valor(f))),
    totales,
    colEtiquetaPdf: detalle ? 6 : 1,
    notas,
    multilinea: true,
  };
}
