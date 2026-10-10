import type { Celda, ColRep, TablaReporte } from "@/lib/reportes/export";
import { ORIGENES_KARDEX, TIPOS_KARDEX } from "@/lib/reportes/kardex-textos";
import type { KardexFila, KardexFiltros, KardexResumenFila, KardexRespuesta } from "@/types/reportes";

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

type ColR = ColRep & { valor: (f: KardexResumenFila) => Celda };
const rt = (titulo: string, peso: number, valor: (f: KardexResumenFila) => string): ColR => ({ titulo, peso, tipo: "texto", valor });
const rq = (titulo: string, peso: number, valor: (f: KardexResumenFila) => number): ColR => ({ titulo, peso, tipo: "cantidad", valor });
export const COLUMNAS_RESUMEN: ColR[] = [
  rt("Código", 6, (f) => f.productoCodigo), rt("Producto", 12, (f) => f.productoDescripcion), rt("Depósito", 8, (f) => f.deposito), rt("Lote", 5, (f) => f.lote),
  rq("Saldo inicial", 6, (f) => f.saldoInicial), rq("Entradas", 5, (f) => f.entradas), rq("Salidas", 5, (f) => f.salidas),
  rq("Transf. entrada", 5.5, (f) => f.transfEntradas), rq("Transf. salida", 5.5, (f) => f.transfSalidas), rq("Saldo final", 6, (f) => f.saldoFinal),
  rq("Disponible", 5, (f) => f.finalDisponible), rq("Reservado", 5, (f) => f.finalReservado), rq("Cuarentena", 5, (f) => f.finalCuarentena),
];

export function tablaKardex(r: KardexRespuesta): TablaReporte {
  const t = r.totales;
  const detalle = r.filtros.vista === "DETALLE";
  const cols: (ColK | ColR)[] = detalle ? COLUMNAS_KARDEX : COLUMNAS_RESUMEN;
  const fila = (valores: Record<string, Celda>): Celda[] => cols.map((c) => (c.titulo in valores ? valores[c.titulo] : ""));
  const totales = detalle
    ? [
        { etiqueta: "SALDO INICIAL", celdas: fila({ "Saldo físico": t.saldoInicial.fisico, Disponible: t.saldoInicial.disponible, Reservado: t.saldoInicial.reservado, Cuarentena: t.saldoInicial.cuarentena }) },
        { etiqueta: "TOTAL MOVIMIENTOS", celdas: fila({ Entrada: t.entradas, Salida: t.salidas }) },
        { etiqueta: "TRANSFERENCIAS", celdas: fila({ Entrada: t.transfEntradas, Salida: t.transfSalidas }) },
        { etiqueta: "SALDO FINAL", celdas: fila({ "Saldo físico": t.saldoFinal.fisico, Disponible: t.saldoFinal.disponible, Reservado: t.saldoFinal.reservado, Cuarentena: t.saldoFinal.cuarentena }) },
      ]
    : [{ etiqueta: "TOTAL", celdas: fila({ "Saldo inicial": t.saldoInicial.fisico, Entradas: t.entradas, Salidas: t.salidas, "Transf. entrada": t.transfEntradas, "Transf. salida": t.transfSalidas, "Saldo final": t.saldoFinal.fisico, Disponible: t.saldoFinal.disponible, Reservado: t.saldoFinal.reservado, Cuarentena: t.saldoFinal.cuarentena }) }];
  const notas = [
    "Totales: saldo inicial = antes del período; total movimientos = entradas y salidas sin transferencias; las transferencias se compensan en el consolidado de la empresa.",
    r.conciliacion.conciliado
      ? `Conciliación con Stock (hoy): el libro de movimientos coincide con los saldos de stock en ${r.conciliacion.combinaciones} combinaciones producto × depósito × lote.`
      : `ATENCIÓN: el libro de movimientos NO coincide con Stock en ${r.conciliacion.divergentes} de ${r.conciliacion.combinaciones} combinaciones producto × depósito × lote; los saldos acumulados pueden no ser confiables.`,
    ...(t.filtrosDeFila ? ["Hay filtros de tipo, usuario, documento o estado: los saldos son los reales del libro; los totales de movimientos suman solo las filas filtradas."] : []),
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
    filas: detalle ? r.filas.map((f) => COLUMNAS_KARDEX.map((c) => c.valor(f))) : r.resumen.map((f) => COLUMNAS_RESUMEN.map((c) => c.valor(f))),
    totales,
    colEtiquetaPdf: detalle ? 6 : 1,
    notas,
    multilinea: true,
  };
}
