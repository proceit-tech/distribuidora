import type { Celda, ColRep, TablaReporte } from "@/lib/reportes/export";
import { fmtCantidadTexto } from "@/lib/reportes/formato";
import { esCeroDecimal, etiquetaGrupo, etiquetasUnidad, netoMovimientos, nombreUnidad } from "@/lib/reportes/kardex-plan";
import { ORIGENES_KARDEX, TIPOS_KARDEX } from "@/lib/reportes/kardex-textos";
import type { KardexFila, KardexFiltros, KardexGrupo, KardexResumenFila, KardexRespuesta } from "@/types/reportes";

// Exportación del Kardex: mismas filas (en el mismo orden), filtros, saldos y totales que la pantalla. Cantidades como texto numeric exacto.

export const NOMBRE_TIPO: Record<string, string> = Object.fromEntries(TIPOS_KARDEX.map((t) => [t.id, t.nombre]));

export const textoTipo = (f: Pick<KardexFila, "tipo" | "origen">) => `${NOMBRE_TIPO[f.tipo] ?? f.tipo} · ${ORIGENES_KARDEX[f.origen] ?? f.origen}`;
export const textoVinculo = (f: Pick<KardexFila, "vinculado" | "vinculoTipo">) =>
  f.vinculoTipo === "ANULADO_POR" ? `Anulado por ${f.vinculado}` : f.vinculoTipo === "ANULA_A" ? `Anula a ${f.vinculado}` : "";
/** Cantidad con signo explícito (+/−) a partir de un texto numeric exacto. */
export const sgDecimal = (v: string): string => (esCeroDecimal(v) ? "0" : v.startsWith("-") ? `−${fmtCantidadTexto(v.slice(1))}` : `+${fmtCantidadTexto(v)}`);
/** Efecto de un cambio de estado de stock (reserva, cuarentena y sus liberaciones). */
export const textoCambioEstado = (f: Pick<KardexFila, "efecto" | "dDisponible" | "dReservado" | "dCuarentena">) =>
  f.efecto !== "ESTADO"
    ? ""
    : [!esCeroDecimal(f.dDisponible) ? `Disp. ${sgDecimal(f.dDisponible)}` : "", !esCeroDecimal(f.dReservado) ? `Res. ${sgDecimal(f.dReservado)}` : "", !esCeroDecimal(f.dCuarentena) ? `Cuar. ${sgDecimal(f.dCuarentena)}` : ""].filter(Boolean).join(" · ");
export const textoEstadoMov = (e: string) => (e === "ANULADO" ? "Anulado" : "Registrado");
export const textoPropiedadFila = (f: { propiedad: string; propietario: string }) => (f.propiedad === "TERCERO" ? f.propietario : "Propio");
/** Depósito de la fila con su rótulo de inactivo y, en transferencias, el depósito de la otra punta (solo si está en el alcance). */
export const textoDeposito = (f: Pick<KardexFila, "deposito" | "depositoInactivo" | "contraparte" | "efecto">) =>
  `${f.deposito}${f.depositoInactivo ? " (inactivo)" : ""}${f.contraparte ? ` (${f.efecto === "ENTRADA" ? "desde" : "hacia"} ${f.contraparte})` : ""}`;

export function describirFiltrosKardex(r: KardexRespuesta): string[] {
  const f: KardexFiltros = r.filtros;
  const nombre = (l: { id: string; nombre: string }[], id: string) => l.find((x) => x.id === id)?.nombre ?? id;
  const out = [`Vista: ${f.vista === "DETALLE" ? "Detalle de movimientos" : "Resumen por producto, depósito y lote"}`];
  out.push(`Período (fecha de registro): ${f.desde || "inicio"} a ${f.hasta || "hoy"}`);
  out.push(`Depósito: ${f.depositoId ? nombre(r.catalogos.depositos, f.depositoId) : "Todos los de su alcance"}`);
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
const qty = (titulo: string, peso: number, valor: (f: KardexFila) => string): ColK => ({ titulo, peso, tipo: "cantidad", valor });

export const COLUMNAS_KARDEX: ColK[] = [
  txt("Fecha y hora", 8, (f) => `${f.fechaRegistro} ${f.horaRegistro.slice(0, 5)}${f.retroactivo ? ` (mov. ${f.fechaMovimiento})` : ""}`),
  txt("Movimiento", 5.5, (f) => f.numero),
  txt("Tipo · origen", 9, textoTipo),
  txt("Estado", 4.5, (f) => textoEstadoMov(f.estado)),
  txt("Documento", 6, (f) => f.documento),
  txt("Código", 5, (f) => f.productoCodigo),
  txt("Producto", 10, (f) => f.productoDescripcion),
  txt("Unidad", 4, (f) => f.unidad),
  txt("Depósito", 7, textoDeposito),
  txt("Lote", 4.5, (f) => f.lote),
  txt("Propiedad", 5, textoPropiedadFila),
  qty("Entrada", 4.5, (f) => f.entrada),
  qty("Salida", 4.5, (f) => f.salida),
  txt("Cambio de estado", 7, textoCambioEstado),
  qty("Saldo físico", 5, (f) => f.saldoFisico),
  qty("Disponible", 5, (f) => f.saldoDisponible),
  qty("Reservado", 5, (f) => f.saldoReservado),
  qty("Cuarentena", 5, (f) => f.saldoCuarentena),
  { titulo: "Costo unit.", peso: 5.5, tipo: "dinero", valor: (f) => f.costoUnitario },
  { titulo: "Costo total", peso: 6, tipo: "dinero", valor: (f) => f.costoTotal },
  txt("Moneda costo", 4, (f) => f.moneda),
  txt("Motivo", 7, (f) => f.motivo),
  txt("Usuario", 4.5, (f) => f.usuario),
  txt("Vinculado", 6.5, textoVinculo),
];

type ColR = ColRep & { k: string; valor: (f: KardexResumenFila) => Celda };
const rt = (k: string, titulo: string, peso: number, valor: (f: KardexResumenFila) => string): ColR => ({ k, titulo, peso, tipo: "texto", valor });
const rq = (k: string, titulo: string, peso: number, valor: (f: KardexResumenFila) => string): ColR => ({ k, titulo, peso, tipo: "cantidad", valor });
/** Con filtros de fila, los movimientos son los filtrados y aparece la columna "Fuera del filtro" (variación neta del resto del período). */
export function columnasResumen(filtrosDeFila: boolean): ColR[] {
  const fl = filtrosDeFila ? " filtradas" : "";
  return [
    rt("cod", "Código", 6, (f) => f.productoCodigo), rt("prod", "Producto", 12, (f) => f.productoDescripcion), rt("uni", "Unidad", 4, (f) => f.unidad),
    rt("dep", "Depósito", 8, (f) => `${f.deposito}${f.depositoInactivo ? " (inactivo)" : ""}`), rt("lote", "Lote", 5, (f) => f.lote), rt("prop", "Propiedad", 5, textoPropiedadFila),
    rq("ini", "Saldo inicial", 6, (f) => f.saldoInicial), rq("ent", "Entradas" + fl, 5.5, (f) => f.entradas), rq("sal", "Salidas" + fl, 5.5, (f) => f.salidas),
    rq("tent", "Transf. entrada" + fl, 6, (f) => f.transfEntradas), rq("tsal", "Transf. salida" + fl, 6, (f) => f.transfSalidas),
    ...(filtrosDeFila ? [rq("fuera", "Fuera del filtro (neto)", 6.5, (f) => f.fueraDelFiltro)] : []),
    rq("fin", "Saldo final", 6, (f) => f.saldoFinal),
    rq("disp", "Disponible", 5, (f) => f.finalDisponible), rq("res", "Reservado", 5, (f) => f.finalReservado), rq("cuar", "Cuarentena", 5, (f) => f.finalCuarentena),
  ];
}

export { netoMovimientos };

export function tablaKardex(r: KardexRespuesta): TablaReporte {
  const t = r.totales;
  // Rótulo de unidad derivado de TODOS los grupos de la respuesta (no de las filas de la página) y compartido por filas, totales, Excel y PDF.
  const et = etiquetasUnidad(t.grupos);
  const detalle = r.filtros.vista === "DETALLE";
  const fl = t.filtrosDeFila;
  const colsR = columnasResumen(fl);
  const cols: ColRep[] = detalle ? COLUMNAS_KARDEX : colsR;
  const fila = (valores: Record<string, Celda>): Celda[] =>
    detalle ? COLUMNAS_KARDEX.map((c) => (c.titulo in valores ? valores[c.titulo] : "")) : colsR.map((c) => (c.k in valores ? valores[c.k] : ""));
  const totales: NonNullable<TablaReporte["totales"]> = [];

  // Un bloque de totales por grupo homogéneo (unidad × propiedad × propietario): jamás se suman grupos distintos.
  for (const g of t.grupos) {
    const gr: Record<string, Celda> = { Unidad: nombreUnidad(et, g), Propiedad: textoPropiedadFila(g), uni: nombreUnidad(et, g), prop: textoPropiedadFila(g) };

    if (detalle) {
      const sal = (x: KardexGrupo["saldoInicial"]) => ({ "Saldo físico": x.fisico, Disponible: x.disponible, Reservado: x.reservado, Cuarentena: x.cuarentena });
      totales.push(
        { etiqueta: `SALDO INICIAL`, celdas: fila({ ...gr, ...sal(g.saldoInicial) }) },
        { etiqueta: `${fl ? "MOV. FILTRADOS" : "TOTAL MOVIMIENTOS"}`, celdas: fila({ ...gr, Entrada: g.filtrado.entradas, Salida: g.filtrado.salidas }) },
        { etiqueta: `${fl ? "TRANSF. FILTRADAS" : "TRANSFERENCIAS"}`, celdas: fila({ ...gr, Entrada: g.filtrado.transfEntradas, Salida: g.filtrado.transfSalidas }) },
      );
      if (fl) {
        totales.push(
          { etiqueta: `MOV. FUERA DEL FILTRO`, celdas: fila({ ...gr, Entrada: g.fueraDelFiltro.entradas, Salida: g.fueraDelFiltro.salidas }) },
          { etiqueta: `TRANSF. FUERA DEL FILTRO`, celdas: fila({ ...gr, Entrada: g.fueraDelFiltro.transfEntradas, Salida: g.fueraDelFiltro.transfSalidas }) },
        );
      }
      totales.push({ etiqueta: `SALDO FINAL`, celdas: fila({ ...gr, ...sal(g.saldoFinal) }) });
    } else if (g.resumen) {
      const q = g.resumen;
      totales.push({
        etiqueta: `${fl ? "TOTAL FILAS MOSTRADAS" : "TOTAL"}`,
        celdas: fila({ ...gr, ini: q.saldoInicial, ent: q.entradas, sal: q.salidas, tent: q.transfEntradas, tsal: q.transfSalidas, fuera: q.fueraDelFiltro, fin: q.saldoFinal, disp: q.finalDisponible, res: q.finalReservado, cuar: q.finalCuarentena }),
      });
      if (fl) {
        totales.push({
          etiqueta: `CONCILIACIÓN COMPLETA`,
          celdas: fila({ ...gr, ini: g.saldoInicial.fisico, ent: g.completo.entradas, sal: g.completo.salidas, tent: g.completo.transfEntradas, tsal: g.completo.transfSalidas, fin: g.saldoFinal.fisico, disp: g.saldoFinal.disponible, res: g.saldoFinal.reservado, cuar: g.saldoFinal.cuarentena }),
        });
      }
    }
  }

  const noCuadran = t.grupos.filter((g) => !g.cuadra).map((g) => etiquetaGrupo(g, et));
  const notas = [
    r.conciliacion.conciliado
      ? `Conciliación con Stock (misma fotografía): el libro de movimientos coincide con los saldos de stock en ${r.conciliacion.combinaciones} combinaciones producto × depósito × lote × propiedad.`
      : `ATENCIÓN: el libro de movimientos NO coincide con Stock en ${r.conciliacion.divergentes} de ${r.conciliacion.combinaciones} combinaciones producto × depósito × lote × propiedad; los saldos acumulados pueden no ser confiables.`,
    ...(t.grupos.length > 1 ? ["Los totales se presentan por unidad de medida, propiedad y propietario: no existe un total general de cantidades de unidades o propietarios distintos (n/a)."] : []),
    ...(fl
      ? [
          "Hay filtros de tipo, usuario, documento o estado. Los saldos son los reales del libro; los totales de movimientos corresponden SOLO a las filas filtradas y no explican por sí solos la variación del saldo: saldo inicial + movimientos filtrados + movimientos fuera del filtro = saldo final (ver los totales «fuera del filtro» y la conciliación de cada grupo).",
          ...(detalle ? [] : ["TOTAL FILAS MOSTRADAS suma solo las combinaciones que tienen movimientos filtrados; CONCILIACIÓN COMPLETA incluye todas las combinaciones del período."]),
        ]
      : []),
    ...(noCuadran.length > 0 ? [`ATENCIÓN: el saldo inicial más los movimientos del período no coincide con el saldo final (inconsistencia del libro) en: ${noCuadran.join("; ")}.`] : []),
    "Totales: saldo inicial = antes del período; movimientos = entradas y salidas sin transferencias; las transferencias se compensan en el consolidado.",
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
    filas: detalle ? r.filas.map((f) => COLUMNAS_KARDEX.map((c) => c.valor({ ...f, unidad: nombreUnidad(et, f) }))) : r.resumen.map((f) => colsR.map((c) => c.valor({ ...f, unidad: nombreUnidad(et, f) }))),
    totales,
    colEtiquetaPdf: detalle ? 6 : 1,
    notas,
    multilinea: true,
    // Movimiento, Código, Producto, Unidad, Depósito, Lote y Propiedad identifican cada fila en TODOS los bloques del PDF (nunca se recorta una cifra).
    pdfAnclas: detalle ? [1, 5, 6, 7, 8, 9, 10] : [0, 1, 2, 3, 4, 5],
  };
}
