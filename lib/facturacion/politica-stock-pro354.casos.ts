/**
 * PRO-354-R02 — Política por EMPRESA «Bloquear facturación por stock insuficiente» y «Bajas pendientes de stock» (NEX-081).
 * Lógica REAL probada:
 *  · reglas puras: politica-stock.ts, stock-preventivo.ts y bajas-pendientes.ts;
 *  · planificarStockConPolitica con una base simulada (sin PostgreSQL).
 * SQL (NEX-081 y sus scripts), rutas, pantalla y menú se verifican sobre el código fuente.
 * Empresas, productos y depósitos son SINTÉTICOS (UUID de prueba): ningún caso depende de CASA MINGO ni de un tenant real.
 * PRO-354-R02-R01: sección L (F001 integridad y concurrencia, F002 listado, F003 respuestas tardías). PRO354-40, 55, 59 y 63 se actualizaron al contrato R01.
 * PRO-354-R02-R02: sección M (F001-R unidad base revisada y lotes, F002-R historial, F003-R resultado de confirmación). PRO-354-R02-R03: sección N (V001, verificador NEX-081 sobre código ejecutable).
 * Casos ESCRITOS, NO EJECUTADOS en la entrega (restricción de la orden: sin runner, tests, lint, typecheck ni build).
 * Los casos de la matriz R01 que requieren saldo negativo real o política de costos (D1–D3, RF07) NO se simulan: figuran en CASOS_PENDIENTES_POR_GATE.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import {
  aplicarPolitica, huellaConFaltante, interpretarPolitica, leerDepositosPendiente, mensajePlanNoEmitible, pendientesSql, planificarStockConPolitica, resumenStockPolitica,
  type ContextoFaltante,
} from "@/lib/facturacion/politica-stock";
import { asignacionesSql, asignarStock, mensajeStockInsuficiente, type LineaStock, type SaldoDisponible } from "@/lib/facturacion/stock-fe";
import { eleccionesVigentes, respuestaCoherente, textoFaltantePendiente, vistaStock, type EstadoVerificacion } from "@/lib/facturacion/stock-preventivo";
import {
  compararDecimal, consultaBajas, crearContextoBajas, errorBajaPendiente, filaBajaPendiente, leerFiltrosBajas, listarBajasPendientes, listarFiltrosBajas, puedeIntentarConfirmar,
  rangoPaginaBajas, resultadoConfirmacion, SinNex081Error, type BajaPendiente,
} from "@/lib/stock/bajas-pendientes";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");
const sinComSql = (t: string) => t.replace(/--.*$/gm, "");

const EMPRESA = "aaaaaaaa-0000-4000-8000-0000000003a1"; // sintética
const OTRA_EMPRESA = "bbbbbbbb-0000-4000-8000-0000000003a2"; // sintética
const USUARIO = "eeeeeeee-0000-4000-8000-0000000003a3";
const SUC = "11111111-0000-4000-8000-0000000003a4";
const P1 = "55555555-0000-4000-8000-0000000003a5";
const P2 = "66666666-0000-4000-8000-0000000003a6";
const SERV = "77777777-0000-4000-8000-0000000003a7";
const D1 = "d1d1d1d1-0000-4000-8000-0000000003a8";
const D2 = "d2d2d2d2-0000-4000-8000-0000000003a9";
const U1 = "a1a1a1a1-0000-4000-8000-0000000003c1"; // unidad base sintética (UNI)
const U2 = "a2a2a2a2-0000-4000-8000-0000000003c2"; // unidad base sintética (CAJA), misma equivalencia SIFEN posible

const linea = (productoId: string, cantidad: string, controlaStock = true, unidadId: string | null = U1): LineaStock => ({ productoId, codigo: `C-${productoId.slice(0, 4)}`, descripcion: `Producto ${productoId.slice(0, 4)}`, cantidad, controlaStock, unidadId });
const saldo = (productoId: string, depositoId: string, disponible: string, loteId: string | null = null): SaldoDisponible => ({
  productoId, depositoId, depositoCodigo: depositoId === D1 ? "D01" : "D02", depositoNombre: depositoId === D1 ? "Central" : "Anexo", loteId, loteCodigo: loteId ? "L1" : null, vencimiento: null, disponible,
});
const DEP1 = { id: D1, codigo: "D01", nombre: "Central" };
const DEP2 = { id: D2, codigo: "D02", nombre: "Anexo" };
const permite = (o: Partial<ContextoFaltante> = {}): ContextoFaltante => ({ bloquear: false, depositos: [DEP1], conLote: new Set(), ...o });
const BLOQUEA: ContextoFaltante = { bloquear: true, depositos: [], conLote: new Set() };

/** Matriz R01 adaptada: casos que dependen de decisiones contables aún NO aprobadas (gate PRO-354 D1–D3 / RF07). No se simulan ni se dan por aprobados. */
export const CASOS_PENDIENTES_POR_GATE = [
  "R01-RF07 saldo físico negativo real en stock_saldos (CHECK >= 0 intacto)",
  "R01-D1 costo del faltante al momento de emitir (valorización del pendiente)",
  "R01-D2 valor negativo de inventario_costos / deuda valorizada",
  "R01-D3 regularización automática del pendiente con una compra/entrada (costo de la entrada vs. costo promedio)",
  "R01 reportes de valorización y Kardex mostrando el pendiente como salida valorizada",
  "R01-D6 residual: confirmación con FE CANCELADO o INUTILIZADO (R02-R04 resolvió RECHAZADO; esos estados siguen bloqueados hasta decisión separada)",
] as const;

function baseSimulada(o: { politica?: unknown; sinFila?: boolean; saldos?: SaldoDisponible[]; depositos?: unknown[]; conLote?: string[] } = {}) {
  const consultas: Array<{ sql: string; p: unknown[] }> = [];
  const db = {
    async query(sql: string, p: unknown[] = []) {
      consultas.push({ sql, p });
      if (/FROM fe_stock_disponibilidad/.test(sql)) {
        const ids = p[3] as string[];

        return {
          rows: (o.saldos ?? []).filter((s) => ids.includes(s.productoId)).map((s) => ({ ...s })),
        };
      }
      if (/to_jsonb\(e\) -> 'bloquear_stock_insuficiente'/.test(sql)) return { rows: o.sinFila ? [] : [{ v: String(p[0]) === EMPRESA ? (o.politica ?? null) : true }] };
      if (/FROM fe_stock_politica_contexto/.test(sql)) return { rows: [{ bloquear: o.politica !== false, depositos: o.depositos ?? [DEP1], conLote: o.conLote ?? [] }] };

      return { rows: [] };
    },
  };

  return { db: db as never, consultas };
}

const baja = (o: Partial<BajaPendiente> = {}): BajaPendiente => ({
  id: "f0f0f0f0-0000-4000-8000-0000000003b0", documentoId: "f1f1f1f1-0000-4000-8000-0000000003b1", documento: "001-001-0000010 (AA)", serie: "AA", fechaEmision: "2026-11-17T12:00:00.000Z",
  estadoLocal: "ENVIADO", estadoSifen: "APROBADO", productoCodigo: "C1", productoDescripcion: "P1", unidad: "UNI", sucursalId: SUC, sucursalNombre: "Casa central",
  depositoId: D1, depositoCodigo: "D01", depositoNombre: "Central",
  facturado: "15.0000", descontadoEmision: "10.0000", faltanteOriginal: "5.0000", pendienteActual: "5.0000", descontadoTotal: "10.0000",
  saldoRegistrado: "0.0000", pendienteAbierto: "5.0000", saldoProyectado: "-5.0000",
  estado: "PENDIENTE", creadoAt: null, confirmadoAt: null, confirmadoPor: null, movimientoNumero: null, feConfirmable: true, conLote: false, ...o,
});

export async function verificarCasosPoliticaStockPro354(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n++;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── A. Política: lectura y valor por omisión ───────────────────────────────────────────────────────────────────────────────────────────────
  igual("PRO354-01 TRUE por omisión: columna ausente (sin NEX-081) o NULL = bloquear; solo false explícito permite", [interpretarPolitica(undefined), interpretarPolitica(null), interpretarPolitica(true), interpretarPolitica(false), interpretarPolitica("false")],
    [{ bloquear: true, soportada: false }, { bloquear: true, soportada: false }, { bloquear: true, soportada: true }, { bloquear: false, soportada: true }, { bloquear: true, soportada: true }]);

  // ── B. Plan con TRUE: idéntico al comportamiento actual ───────────────────────────────────────────────────────────────────────────────────
  {
    const lineas = [linea(P1, "15"), linea(SERV, "2", false)];
    const saldos = [saldo(P1, D1, "10")];
    const base = asignarStock(lineas, saldos);
    const plan = aplicarPolitica(lineas, saldos, BLOQUEA);

    igual("PRO354-02 TRUE + insuficiente: no emitible, mismas salidas (ninguna) y misma huella que asignarStock", [plan.emitible, plan.salidas, plan.pendientes, plan.huella], [false, base.salidas, [], base.huella]);
    igual("PRO354-03 TRUE + insuficiente: el mensaje 409 es EXACTAMENTE el de siempre", mensajePlanNoEmitible(plan), mensajeStockInsuficiente(base));

    const suf = aplicarPolitica([linea(P1, "4")], saldos, BLOQUEA);

    igual("PRO354-04 TRUE + suficiente: emitible con el reparto y la huella de siempre", [suf.emitible, suf.huella, asignacionesSql(suf)], [true, asignarStock([linea(P1, "4")], saldos).huella, [{ producto_id: P1, deposito_id: D1, lote_id: null, cantidad: "4" }]]);
  }

  // ── C. Plan con FALSE ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const p = aplicarPolitica([linea(P1, "15")], [saldo(P1, D1, "10")], permite());

    igual("PRO354-05 FALSE 10/15: salida inmediata 10 y pendiente 5 en el depósito elegible; emitible", [p.emitible, asignacionesSql(p), pendientesSql(p)], [true, [{ producto_id: P1, deposito_id: D1, lote_id: null, cantidad: "10" }], [{ producto_id: P1, deposito_id: D1, cantidad: "5", unidad_medida_id: U1 }]]);
    igual("PRO354-06 FALSE 10/15: conciliación exacta salidas + pendiente = facturado", [p.lineas[0].requerido, p.lineas[0].disponible, p.lineas[0].pendiente], ["15", "10", "5"]);

    const cero = aplicarPolitica([linea(P1, "3")], [], permite());

    igual("PRO354-07 FALSE disponible cero: TODO pendiente y NINGUNA salida (sin movimiento artificial)", [cero.emitible, cero.salidas.length, pendientesSql(cero)], [true, 0, [{ producto_id: P1, deposito_id: D1, cantidad: "3", unidad_medida_id: U1 }]]);
    cierto("PRO354-08 FALSE disponible cero: la huella es obligatoria igual (no vacía ni la de un reparto vacío)", cero.huella !== asignarStock([], []).huella && /^[0-9a-f]{64}$/.test(cero.huella));

    const suf = aplicarPolitica([linea(P1, "4")], [saldo(P1, D1, "10")], permite());

    igual("PRO354-09 FALSE suficiente: salida normal, sin pendientes y la huella de siempre", [suf.pendientes, suf.huella], [[], asignarStock([linea(P1, "4")], [saldo(P1, D1, "10")]).huella]);

    const fino = aplicarPolitica([linea(P1, "10.0001")], [saldo(P1, D1, "10")], permite());

    igual("PRO354-10 FALSE faltante 0.0001 exacto (decimal 4, sin float)", [asignacionesSql(fino)[0].cantidad, pendientesSql(fino)[0].cantidad], ["10", "0.0001"]);

    const rep = aplicarPolitica([linea(P1, "6"), linea(P1, "9"), linea(SERV, "1", false)], [saldo(P1, D1, "4"), saldo(P1, D2, "6")], permite({ depositos: [DEP1] }));

    igual("PRO354-11 FALSE líneas repetidas: se agregan por UUID (15), se toma todo el disponible de ambos depósitos y un solo pendiente; servicios excluidos",
      [asignacionesSql(rep).map((a) => [a.deposito_id, a.cantidad]), pendientesSql(rep)], [[[D1, "4"], [D2, "6"]], [{ producto_id: P1, deposito_id: D1, cantidad: "5", unidad_medida_id: U1 }]]);

    const mixto = aplicarPolitica([linea(P1, "15"), linea(P2, "2")], [saldo(P1, D1, "10"), saldo(P2, D1, "5")], permite());

    igual("PRO354-12 FALSE mixto: el producto suficiente conserva su reparto; el insuficiente toma todo y deja pendiente", [asignacionesSql(mixto).length, pendientesSql(mixto).map((x) => x.producto_id)], [2, [P1]]);
  }

  // ── D. Depósito del faltante, lotes y bloqueos ────────────────────────────────────────────────────────────────────────────────────────────
  {
    const lineas = [linea(P1, "15")];
    const saldos = [saldo(P1, D1, "10")];
    const varios = permite({ depositos: [DEP1, DEP2] });

    igual("PRO354-13 varios depósitos sin elección: bloqueo ELEGIR_DEPOSITO (no se elige por el operador)", [aplicarPolitica(lineas, saldos, varios).emitible, aplicarPolitica(lineas, saldos, varios).lineas[0].bloqueo], [false, "ELEGIR_DEPOSITO"]);
    igual("PRO354-14 varios depósitos con elección válida: el pendiente va al elegido", pendientesSql(aplicarPolitica(lineas, saldos, varios, { [P1]: D2 }))[0].deposito_id, D2);
    igual("PRO354-15 elección de un depósito NO elegible (otro tenant, otra sucursal, fuera de alcance): se ignora y sigue exigiendo elección", aplicarPolitica(lineas, saldos, varios, { [P1]: "99999999-0000-4000-8000-000000000999" }).lineas[0].bloqueo, "ELEGIR_DEPOSITO");
    igual("PRO354-16 un solo depósito elegible: preseleccionado", pendientesSql(aplicarPolitica(lineas, saldos, permite()))[0].deposito_id, D1);
    igual("PRO354-17 sin depósito elegible: bloqueo SIN_DEPOSITO (no se permite por falta de datos)", aplicarPolitica(lineas, saldos, permite({ depositos: [] })).lineas[0].bloqueo, "SIN_DEPOSITO");
    igual("PRO354-18 producto con control de lotes evidenciado: bloqueo LOTE (no se inventan lotes)", aplicarPolitica(lineas, saldos, permite({ conLote: new Set([P1]) })).lineas[0].bloqueo, "LOTE");
    igual("PRO354-19 cantidad inválida: bloqueo CANTIDAD_INVALIDA aunque la política permita", aplicarPolitica([linea(P1, "abc")], saldos, permite()).lineas[0].bloqueo, "CANTIDAD_INVALIDA");
    cierto("PRO354-20 mensaje del bloqueo nombra el producto y la causa", /C-5555: elija el depósito/.test(mensajePlanNoEmitible(aplicarPolitica(lineas, saldos, varios))) && /controla lotes/.test(mensajePlanNoEmitible(aplicarPolitica(lineas, saldos, permite({ conLote: new Set([P1]) })))));
  }

  // ── E. Huella: incluye política, salidas, pendientes y depósito ───────────────────────────────────────────────────────────────────────────
  {
    const s = [{ productoId: P1, depositoId: D1, depositoCodigo: "D01", depositoNombre: "Central", loteId: null, loteCodigo: null, cantidad: "10" }];
    const pd = (dep: string, c: string, unidadId: string | null = U1) => [{ productoId: P1, codigo: "C", descripcion: "D", depositoId: dep, depositoCodigo: "X", depositoNombre: "Y", cantidad: c, unidadId }];

    cierto("PRO354-21 huella: cambia con el depósito del pendiente, con la cantidad pendiente y con la salida", huellaConFaltante(s, pd(D1, "5")) !== huellaConFaltante(s, pd(D2, "5")) && huellaConFaltante(s, pd(D1, "5")) !== huellaConFaltante(s, pd(D1, "4")) && huellaConFaltante(s, pd(D1, "5")) !== huellaConFaltante([], pd(D1, "5")));
    cierto("PRO354-22 huella con faltante ≠ huella TRUE del mismo reparto (un cambio de política exige revisar de nuevo)", huellaConFaltante(s, []) !== asignarStock([linea(P1, "10")], [saldo(P1, D1, "10")]).huella);
    igual("PRO354-23 huella determinista (independiente del orden)", huellaConFaltante([...s, { ...s[0], depositoId: D2 }], pd(D1, "5")), huellaConFaltante([{ ...s[0], depositoId: D2 }, ...s], pd(D1, "5")));
  }

  // ── F. Forma estricta de la elección del depósito ─────────────────────────────────────────────────────────────────────────────────────────
  igual("PRO354-24 depositosPendiente: ausente = {}; UUID→UUID normalizado; cualquier otra forma = inválida", [leerDepositosPendiente(undefined), leerDepositosPendiente({ [P1.toUpperCase()]: D1 }), leerDepositosPendiente([]), leerDepositosPendiente({ [P1]: 5 }), leerDepositosPendiente({ x: D1 })],
    [{}, { [P1]: D1 }, null, null, null]);

  // ── G. planificarStockConPolitica con base simulada (servidor) ────────────────────────────────────────────────────────────────────────────
  {
    const b1 = baseSimulada({ politica: false, saldos: [saldo(P1, D1, "10")] });
    const suf = await planificarStockConPolitica(b1.db, EMPRESA, USUARIO, SUC, [linea(P1, "4")]);

    cierto("PRO354-25 suficiente: NO consulta la política ni el contexto (camino de siempre)", suf.emitible && !b1.consultas.some((c) => /bloquear_stock_insuficiente|fe_stock_politica_contexto/.test(c.sql)));

    const b2 = baseSimulada({ politica: true, saldos: [saldo(P1, D1, "10")] });
    const tru = await planificarStockConPolitica(b2.db, EMPRESA, USUARIO, SUC, [linea(P1, "15")]);

    igual("PRO354-26 TRUE en la base: bloquea y no consulta el contexto", [tru.emitible, b2.consultas.some((c) => /fe_stock_politica_contexto/.test(c.sql))], [false, false]);

    const b3 = baseSimulada({ politica: false, saldos: [saldo(P1, D1, "10")] });
    const fal = await planificarStockConPolitica(b3.db, EMPRESA, USUARIO, SUC, [linea(P1, "15")]);

    igual("PRO354-27 FALSE en la base: emite 10 + pendiente 5; la política se lee por la empresa de la SESIÓN (parámetro)", [fal.emitible, pendientesSql(fal)[0]?.cantidad, b3.consultas.find((c) => /bloquear_stock_insuficiente/.test(c.sql))?.p[0]], [true, "5", EMPRESA]);

    const b4 = baseSimulada({ politica: false, saldos: [saldo(P1, D1, "10")] });
    const otra = await planificarStockConPolitica(b4.db, OTRA_EMPRESA, USUARIO, SUC, [linea(P1, "15")]);

    igual("PRO354-28 aislamiento multiempresa: la política FALSE de una empresa no habilita a otra (la otra sigue TRUE)", otra.emitible, false);

    const b5 = baseSimulada({ sinFila: true, saldos: [] });

    igual("PRO354-29 sin NEX-081 / sin fila: TRUE (bloquea como hoy), nunca permitir por falta de datos", (await planificarStockConPolitica(b5.db, EMPRESA, USUARIO, SUC, [linea(P1, "1")])).emitible, false);

    const b6 = baseSimulada({ politica: false, saldos: [], depositos: [], conLote: [] });

    igual("PRO354-30 FALSE sin depósito elegible en la base: no emitible", (await planificarStockConPolitica(b6.db, EMPRESA, USUARIO, SUC, [linea(P1, "1")])).lineas[0].bloqueo, "SIN_DEPOSITO");

    const b7 = baseSimulada({ politica: false, saldos: [], conLote: [P1] });

    igual("PRO354-31 FALSE con lote en la base (stock_lotes): no emitible", (await planificarStockConPolitica(b7.db, EMPRESA, USUARIO, SUC, [linea(P1, "1")])).lineas[0].bloqueo, "LOTE");

    const b8 = baseSimulada({ politica: false, saldos: [] });
    const ids = Array.from({ length: 501 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const lim = await planificarStockConPolitica(b8.db, EMPRESA, USUARIO, SUC, ids.map((id) => linea(id, "1")));

    igual("PRO354-32 límite 500 por consulta de saldos (501 productos = 500 + 1) y 501 pendientes", [b8.consultas.filter((c) => /FROM fe_stock_disponibilidad/.test(c.sql)).map((c) => (c.p[3] as string[]).length), lim.pendientes.length], [[500, 1], 501]);

    const r = resumenStockPolitica(fal);

    igual("PRO354-33 resumen de la previa: salida inmediata y pendiente con depósito", [r.permitirFaltante, r.lineas[0].salidas.map((s) => s.cantidad), r.pendientes.map((x) => [x.depositoCodigo, x.cantidad])], [true, ["10"], [["D01", "5"]]]);
  }

  // ── H. Pantalla (stock-preventivo, lógica pura) ───────────────────────────────────────────────────────────────────────────────────────────
  {
    const b = { sucursalId: SUC, clienteId: null, lineas: [{ productoId: P1, cantidad: "15", controlaStock: true }] };
    const firma = JSON.stringify([SUC, "", [[P1, "15"]]]);
    const prod = { productoId: P1, codigo: "C1", descripcion: "P1", controlaStock: true, requerido: "15", disponible: "10", faltante: "5", estado: "INSUFICIENTE" as const };
    const estado = (faltantePendiente?: { depositos: typeof DEP1[]; conLote: string[] }): EstadoVerificacion => ({ fase: "LISTO", firma, mensaje: "", resultado: { sucursalId: SUC, suficiente: false, productos: [prod], ...(faltantePendiente ? { faltantePendiente } : {}) } });
    const s = { sucursalId: SUC, lineas: [{ productoId: P1, cantidad: "15" }] };

    igual("PRO354-34 TRUE (sin bloque de faltante): aviso INSUFICIENTE y bloquea la revisión como hoy", [vistaStock(estado(), b).avisos.get(P1)?.tipo, /corregir el stock insuficiente/.test(vistaStock(estado(), b).pendiente)], ["INSUFICIENTE", true]);

    const uno = vistaStock(estado({ depositos: [DEP1], conLote: [] }), b);

    igual("PRO354-35 FALSE con un depósito: aviso FALTANTE_PENDIENTE preseleccionado y NO bloquea", [uno.avisos.get(P1)?.tipo, (uno.avisos.get(P1) as { depositoId: string }).depositoId, uno.pendiente], ["FALTANTE_PENDIENTE", D1, ""]);
    igual("PRO354-36 texto: requerido, se descuenta ahora (disponible) y queda pendiente (faltante)", textoFaltantePendiente({ requerido: "15", disponible: "10", faltante: "5" }), "Stock insuficiente — Solicitado: 15 | Se descuenta ahora: 10 | Queda pendiente: 5");

    const dos = estado({ depositos: [DEP1, DEP2], conLote: [] });

    cierto("PRO354-37 FALSE con varios depósitos: exige elegir; con la elección deja de bloquear y viaja en el cuerpo", /elegir el depósito del faltante: C1/.test(vistaStock(dos, b).pendiente) && vistaStock(dos, b, { [P1]: D2 }).pendiente === "" && JSON.stringify(eleccionesVigentes(vistaStock(dos, b, { [P1]: D2 }).avisos, { [P1]: D2 })) === JSON.stringify({ [P1]: D2 }));
    cierto("PRO354-38 FALSE con lote: bloquea la revisión", /controla lotes/.test(vistaStock(estado({ depositos: [DEP1], conLote: [P1] }), b).pendiente));
    cierto("PRO354-39 respuesta: bloque de faltante válido aceptado; depósitos repetidos, id no UUID o lote de un producto no pedido = error técnico (nunca un saldo)",
      respuestaCoherente({ sucursalId: SUC, productos: [prod], faltantePendiente: { depositos: [DEP1], conLote: [] } }, s)
      && !respuestaCoherente({ sucursalId: SUC, productos: [prod], faltantePendiente: { depositos: [DEP1, DEP1], conLote: [] } }, s)
      && !respuestaCoherente({ sucursalId: SUC, productos: [prod], faltantePendiente: { depositos: [{ id: "x", codigo: "", nombre: "" }], conLote: [] } }, s)
      && !respuestaCoherente({ sucursalId: SUC, productos: [prod], faltantePendiente: { depositos: [DEP1], conLote: [P2] } }, s));
  }

  // ── I. «Bajas pendientes de stock» (lógica pura) ──────────────────────────────────────────────────────────────────────────────────────────
  {
    igual("PRO354-40 filtros: por omisión PENDIENTE, página 1 de 25; TODOS = null; depósito UUID; búsqueda ≤ 80; inválidos rechazados (R01: sucursal y paginación)",
      [leerFiltrosBajas(new URLSearchParams("")), leerFiltrosBajas(new URLSearchParams("estado=TODOS"))?.estado, leerFiltrosBajas(new URLSearchParams("estado=X")), leerFiltrosBajas(new URLSearchParams("deposito=1;DROP")), leerFiltrosBajas(new URLSearchParams(`buscar=${"a".repeat(81)}`))],
      [{ estado: "PENDIENTE", sucursalId: null, depositoId: null, buscar: "", pagina: 1, porPagina: 25 }, null, null, null, null]);
    igual("PRO354-41 decimal exacto en texto (sin float): -5 < 0; 5.0000 = 5; 0.0001 > 0", [compararDecimal("-5.0000", "0"), compararDecimal("5.0000", "5"), compararDecimal("0.0001", "0")], [-1, 0, 1]);
    igual("PRO354-42 confirmación con faltante sin saldo suficiente: el botón no se ofrece (la base además lo rechaza sin saldo negativo)", puedeIntentarConfirmar(baja(), true).puede, false);
    igual("PRO354-43 tras reposición (entrada 8, pendiente 5): se ofrece la confirmación", puedeIntentarConfirmar(baja({ saldoRegistrado: "8.0000", saldoProyectado: "3.0000" }), true).puede, true);
    igual("PRO354-44 FE con error técnico/indeterminada/no transmitida/cancelada/inutilizada/no reconocida (feConfirmable false; R02-R04: la rechazada SÍ es confirmable), lote o sin MOVIMIENTOS.CREAR: no se ofrece", [puedeIntentarConfirmar(baja({ saldoRegistrado: "8", feConfirmable: false }), true).puede, puedeIntentarConfirmar(baja({ saldoRegistrado: "8", conLote: true }), true).puede, puedeIntentarConfirmar(baja({ saldoRegistrado: "8" }), false).puede], [false, false, false]);
    igual("PRO354-45 ya confirmada: no se vuelve a ofrecer", puedeIntentarConfirmar(baja({ estado: "CONFIRMADA", saldoRegistrado: "8" }), true).puede, false);
    igual("PRO354-46 errores: sin NEX-081 503; permiso 403; no encontrado 404; insuficiente/FE no confirmable/lote 409 con el texto de la base; otro 500 genérico",
      [errorBajaPendiente(new SinNex081Error("x")).status, errorBajaPendiente({ code: "42501" }).status, errorBajaPendiente({ detail: "NEX:PENDIENTE_NO_ENCONTRADO" }).status, errorBajaPendiente({ detail: "NEX:STOCK_INSUFICIENTE", message: "m" }), errorBajaPendiente({ detail: "NEX:PENDIENTE_FE_NO_CONFIRMABLE" }).status, errorBajaPendiente(new Error("interno")).error],
      [503, 403, 404, { status: 409, error: "m" }, 409, "No fue posible completar la operación."]);
  }

  // ── J. NEX-081 (fuente; NO aplicada ni ejecutada) ─────────────────────────────────────────────────────────────────────────────────────────
  {
    const ruta = "documentacao/banco/nexit/v1/migraciones/NEX-081-facturacion-politica-stock-pendientes.sql";
    const sql = existsSync(join(process.cwd(), ruta)) ? leer(ruta) : "";
    const cod = sinComSql(sql);
    const tramo = (desde: string, hasta: string) => cod.slice(cod.indexOf(desde), cod.indexOf(hasta, cod.indexOf(desde) + desde.length));
    const baja = tramo("CREATE OR REPLACE FUNCTION public.fe_stock_baja_documento", "CREATE FUNCTION public.fe_politica_stock_actualizar");
    const crear = tramo("CREATE FUNCTION public.fe_documento_crear_fe_stock_pendiente", "CREATE FUNCTION public.fe_stock_pendientes_listar");
    const confirmar = tramo("CREATE FUNCTION public.fe_stock_pendiente_confirmar", "COMMENT ON FUNCTION");
    const politica = tramo("CREATE FUNCTION public.fe_politica_stock_actualizar", "CREATE FUNCTION public.fe_stock_politica_contexto");
    const listar = tramo("CREATE FUNCTION public.fe_stock_pendientes_listar", "CREATE FUNCTION public.fe_stock_pendiente_confirmar");
    const nex067 = leer("documentacao/banco/nexit/v1/migraciones/NEX-067-facturacion-stock-baja-fe.sql");

    cierto("PRO354-47 columna por EMPRESA boolean NOT NULL DEFAULT true (todas quedan en TRUE al aplicar)", /ALTER TABLE public\.empresas ADD COLUMN bloquear_stock_insuficiente boolean NOT NULL DEFAULT true;/.test(cod));
    cierto("PRO354-48 cambio auditado: CONFIGURAR, FOR UPDATE de la empresa, evento en eventos_seguridad con anterior/nuevo", /'FACTURACION_ELECTRONICA', 'CONFIGURAR'/.test(politica) && /FOR UPDATE/.test(politica) && /INSERT INTO public\.eventos_seguridad/.test(politica) && /'anterior', v_actual, 'nuevo', p_bloquear/.test(politica));
    cierto("PRO354-49 vínculos complementarios con PK propia; la PK histórica (empresa, documento, depósito) de las salidas NO se toca", /CREATE TABLE public\.documento_electronico_stock_pendientes \(\s*id\s+uuid\s+PRIMARY KEY/.test(cod) && !/ALTER TABLE public\.documento_electronico_stock_salidas/.test(cod));
    cierto("PRO354-50 conciliación en tabla: descontado + pendiente = facturado; un pendiente por (FE, producto)", /cantidad_descontada \+ cantidad_pendiente = cantidad_facturada/.test(cod) && /UNIQUE \(empresa_id, documento_id, producto_id\)/.test(cod));
    cierto("PRO354-51 baja redefinida: misma firma, concilia salidas + pendientes y trata una FE con pendientes como baja ya registrada", /CREATE OR REPLACE FUNCTION public\.fe_stock_baja_documento\(p_empresa uuid, p_usuario uuid, p_documento uuid, p_asignaciones jsonb\)/.test(cod) && /UNION ALL SELECT ep FROM jsonb_array_elements\(v_pend\) ep/.test(baja) && /FROM public\.documento_electronico_stock_pendientes WHERE empresa_id = p_empresa AND documento_id = p_documento/.test(baja));
    cierto("PRO354-52 la preparación solo vale para la MISMA transacción (txid_current) y la aplicación no tiene acceso", /pp\.txid = txid_current\(\)/.test(baja) && /REVOKE ALL ON public\.fe_stock_pendientes_preparacion FROM nexit_runtime/.test(cod));
    cierto("PRO354-53 emisión con faltante: política FALSE releída bajo FOR SHARE (nunca del navegador); si cambió, NEX:STOCK_POLITICA_CAMBIO", /bloquear_stock_insuficiente INTO v_bloquear FROM public\.empresas e WHERE e\.id = p_empresa FOR SHARE/.test(crear) && /v_bloquear IS DISTINCT FROM false OR p_bloquear_revisado IS DISTINCT FROM false/.test(crear) && /NEX:STOCK_POLITICA_CAMBIO/.test(crear));
    cierto("PRO354-54 emisión con faltante: envuelve SIN copiar la emisión vigente (receptor NEX-076); la numeración no cambia", /FROM public\.fe_documento_crear_fe_receptor\(p_empresa/.test(crear) && !/nex_siguiente_numero|INSERT INTO public\.documentos_electronicos/.test(crear));
    cierto("PRO354-55 emisión con faltante: producto activo que controla stock y sin lotes; depósito propio, activo, de la sucursal y en alcance (R01: filas bloqueadas antes de validar)", /NOT v_pr\.controla_stock OR NOT v_pr\.activo/.test(crear) && /NEX:STOCK_PENDIENTE_LOTE/.test(crear) && /NOT v_dp\.activo OR v_dp\.es_de_terceros OR v_dp\.sucursal_id IS DISTINCT FROM p_sucursal/.test(crear) && /usuario_puede_deposito\(p_empresa, p_usuario, v_dep\)/.test(crear));
    cierto("PRO354-56 faltante REAL: tras la salida no queda disponible elegible (FOR UPDATE); si queda, NEX:STOCK_PENDIENTE_CON_DISPONIBLE", /FOR UPDATE OF s;\s*IF FOUND THEN/.test(crear) && /NEX:STOCK_PENDIENTE_CON_DISPONIBLE/.test(crear));
    cierto("PRO354-57 reintento / carrera de la misma clave: no escribe y exige los mismos pendientes (NEX:IDEMPOTENCIA_CONFLICTO)", /IF v_reutilizado THEN/.test(crear) && /NEX:IDEMPOTENCIA_CONFLICTO/.test(crear) && crear.indexOf("IF v_reutilizado THEN") < crear.indexOf("INSERT INTO public.documento_electronico_stock_pendientes"));
    cierto("PRO354-58 confirmación: MOVIMIENTOS.CREAR, advisory lock + FOR UPDATE, alcance, idempotente, FE ENVIADA no cancelada/inutilizada/no reconocida (R02-R04: con rechazo fiscal definitivo admitida)", /'MOVIMIENTOS', 'CREAR'/.test(confirmar) && /pg_advisory_xact_lock/.test(confirmar) && /FOR UPDATE/.test(confirmar) && /usuario_puede_deposito\(p_empresa, p_usuario, v_p\.deposito_id\)/.test(confirmar) && /v_p\.estado = 'CONFIRMADA'/.test(confirmar) && /estado_local IS DISTINCT FROM 'ENVIADO' OR v_doc\.estado_sifen NOT IN \('SIN_CONSULTA', 'PENDIENTE', 'APROBADO', 'RECHAZADO'\) THEN/.test(confirmar));
    cierto("PRO354-59 confirmación solo con saldo real suficiente (jamás negativo; R01: lo decide el motor bajo su bloqueo) y por el motor ordinario con clave idempotente", /SQLERRM LIKE 'saldo disponible insuficiente%'/.test(confirmar) && /NEX:STOCK_INSUFICIENTE/.test(confirmar) && /inventario_registrar_movimiento\(p_empresa, p_usuario, 'SALIDA', 'VENTA'/.test(confirmar) && /'FE-STOCK-PEND:' \|\| v_p\.id::text/.test(confirmar));
    cierto("PRO354-60 NO toca CHECK de stock_saldos, inventario_costos (estructura), costo promedio ni saldo negativo", !/ALTER TABLE public\.stock_saldos|stock_saldos_cant_chk|ALTER TABLE public\.inventario_costos|costo_promedio\s*=|UPDATE public\.stock_saldos/.test(cod));
    cierto("PRO354-61 listado: STOCK.VER y alcance de depósito (R02-R02: alcance histórico); proyectado = registrado − pendientes abiertos", /'STOCK', 'VER'/.test(listar) && /deposito_en_alcance\(p_empresa, p_usuario, p\.deposito_id\)/.test(listar) && /sal\.registrado - ab\.abierto/.test(listar));
    cierto("PRO354-62 inmutabilidad: solo PENDIENTE→CONFIRMADA; el movimiento complementario no se anula a mano", /CREATE TRIGGER fe_stock_pendientes_inmutable_trg/.test(cod) && /CREATE TRIGGER fe_stock_pendiente_movimiento_protegido_trg/.test(cod));
    cierto("PRO354-63 grants mínimos: tablas sin acceso; la app solo EJECUTA las 6 funciones (R01: + catálogo de filtros); la baja interna sigue sin ejecución", /REVOKE ALL ON public\.documento_electronico_stock_pendientes FROM nexit_runtime/.test(cod) && (cod.match(/GRANT EXECUTE ON FUNCTION public\.fe_(politica_stock_actualizar|stock_politica_contexto|documento_crear_fe_stock_pendiente|stock_pendientes_listar|stock_pendientes_filtros|stock_pendiente_confirmar)\(/g) ?? []).length === 6 && /REVOKE ALL ON FUNCTION public\.fe_stock_baja_documento\(uuid, uuid, uuid, jsonb\) FROM nexit_runtime/.test(cod));
    cierto("PRO354-64 NEX-067 y NEX-080 NO editadas (el archivo de NEX-067 conserva su baja original)", !/fe_stock_pendientes_preparacion/.test(nex067) && !/bloquear_stock_insuficiente/.test(leer("documentacao/banco/nexit/v1/migraciones/NEX-080-facturacion-cdc-dato-api.sql")));
    cierto("PRO354-65 preflight/verificación de SOLO LECTURA, reversión protegida (rehúsa con pendientes o empresas en FALSE y restaura la baja de NEX-067) y procedimiento con el gate de NEX-080",
      ["preflight", "verificar"].every((n) => /BEGIN READ ONLY;[\s\S]*ROLLBACK;/.test(leer(`documentacao/banco/nexit/v1/scripts/${n}-NEX-081.sql`)))
      && /Existen bajas pendientes registradas/.test(leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-081.sql")) && /WHERE NOT bloquear_stock_insuficiente/.test(leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-081.sql"))
      && !/fe_stock_pendientes_preparacion pp/.test(leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-081.sql").slice(leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-081.sql").indexOf("CREATE OR REPLACE FUNCTION")))
      && /NEX-080/.test(leer("documentacao/banco/nexit/v1/docs/PROCEDIMIENTO-NEX-081.md")));
  }

  // ── K. Aplicación (fuente) ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const emision = leer("lib/facturacion/emision.ts");
    const previa = leer("app/api/facturas/previa/route.ts");
    const disp = leer("app/api/facturas/stock/disponibilidad/route.ts");
    const conf = leer("app/api/facturacion/politica-stock/route.ts");
    const pag = leer("app/(private)/facturas/nueva/page.tsx");
    const menu = leer("lib/navigation/menu.ts");

    cierto("PRO354-66 emisión: plan con política solo para FE NUEVA; huella obligatoria con salidas o pendientes; pendientes por la función NEX-081 con p_bloquear_revisado false",
      /if \(!documentoExistente && lineasStock\.some\(\(l\) => l\.controlaStock\)\) \{\s*const plan = await planificarStockConPolitica\(/.test(emision) && /\(plan\.salidas\.length > 0 \|\| plan\.pendientes\.length > 0\) && cuerpo\.repartoHuella !== plan\.huella/.test(emision) && /FROM fe_documento_crear_fe_stock_pendiente\(\$1::uuid[^`]*\$15::jsonb, false\)/.test(emision));
    cierto("PRO354-67 emisión sin faltante: llamada de siempre (receptor/vendedor) sin cambios de parámetros", /\$\{conReceptor \? "fe_documento_crear_fe_receptor" : "fe_documento_crear_fe_vendedor"\}\(\$1::uuid, \$2::uuid, \$3::uuid, \$4::uuid, \$5, \$6::uuid, \$7, \$8, \$11, \$9::numeric, \$10::jsonb, \$12::jsonb, \$13::uuid, \$14::uuid\)`,\s*parametros\)/.test(emision));
    cierto("PRO354-68 cuerpo: depositosPendiente con forma estricta; un valor inválido = 400", /const depositosPendiente = leerDepositosPendiente\(c\.depositosPendiente\);\s*if \(depositosPendiente === null\) return "El depósito del faltante de stock no es válido\.";/.test(emision));
    cierto("PRO354-69 previa: plan con política, 409 si no es emitible, resumen con salida y pendiente", /planificarStockConPolitica\(b\.db/.test(previa) && /mensajePlanNoEmitible/.test(previa) && /resumenStockPolitica\(plan\)/.test(previa));
    cierto("PRO354-70 disponibilidad anticipada (PRO-330): misma evaluación; solo con FALSE agrega depósitos/lotes; sigue SOLO LECTURA", /evaluarDisponibilidadPreventiva\(lineas, saldos\)/.test(disp) && /!\(await leerPoliticaStock\(b\.db, b\.empresaId\)\)\.bloquear/.test(disp) && !/\b(INSERT|UPDATE|DELETE)\b/.test(disp.replace(/^\s*\/\/.*$/gm, "")));
    cierto("PRO354-71 configuración: GET/PUT con FACTURACION_ELECTRONICA.CONFIGURAR, empresa de la sesión, cuerpo SOLO {bloquear:boolean}", (conf.match(/prepararFacturacion\("CONFIGURAR"\)/g) ?? []).length === 2 && /Object\.keys\(cuerpo\)\.some\(\(k\) => k !== "bloquear"\)/.test(conf) && /b\.empresaId, b\.usuarioId/.test(conf));
    cierto("PRO354-72 pantalla de configuración: interruptor «Bloquear facturación por stock insuficiente» en Facturación electrónica, valor leído del servidor y confirmación del cambio",
      /Bloquear facturación por stock insuficiente/.test(leer("app/(private)/configuracion/facturacion-electronica/politica-stock.tsx")) && /<PoliticaStockInsuficiente \/>/.test(leer("app/(private)/configuracion/facturacion-electronica/page.tsx")) && /window\.confirm/.test(leer("app/(private)/configuracion/facturacion-electronica/politica-stock.tsx")));
    cierto("PRO354-73 Nueva factura: aviso PRO-330 conservado; el faltante muestra solicitado/descuento/pendiente y la elección de depósito viaja en el cuerpo", /textoInsuficiente\(aviso\)/.test(pag) && /textoFaltantePendiente\(aviso\)/.test(pag) && /\.\.\.\(Object\.keys\(depositosPendiente\)\.length > 0 \? \{ depositosPendiente \} : \{\}\)/.test(pag));
    cierto("PRO354-74 Inventario: menú «Bajas pendientes de stock» con STOCK.VER, ruta V1 y layout del módulo Stock (guardPage STOCK.VER)", /label: "Bajas pendientes de stock",\s*href: "\/stock\/bajas-pendientes",\s*icon: "stock",\s*permission: "STOCK\.VER"/.test(menu) && /"\/stock\/bajas-pendientes"/.test(menu.slice(menu.indexOf("V1_HREFS"))) && existsSync(join(process.cwd(), "app/(private)/stock/bajas-pendientes/page.tsx")));
    cierto("PRO354-75 APIs de bajas: listado STOCK.VER (GET) y confirmación MOVIMIENTOS.CREAR (POST sin cuerpo)", /denyIfNoPermission\(session, "STOCK", "VER"\)/.test(leer("app/api/stock/bajas-pendientes/route.ts")) && /denyIfNoPermission\(session, "MOVIMIENTOS", "CREAR"\)/.test(leer("app/api/stock/bajas-pendientes/[id]/confirmar/route.ts")) && !/request\.json\(\)/.test(leer("app/api/stock/bajas-pendientes/[id]/confirmar/route.ts")));
    cierto("PRO354-76 sin hardcodear empresa: ningún archivo de PRO-354 menciona CASA MINGO, RUC ni UUID de tenant", ["lib/facturacion/politica-stock.ts", "lib/stock/bajas-pendientes.ts", "app/api/facturacion/politica-stock/route.ts", "documentacao/banco/nexit/v1/migraciones/NEX-081-facturacion-politica-stock-pendientes.sql"].every((f) => !/CASA ?MINGO|casamingo/i.test(leer(f).replace(/piloto/g, ""))));
    cierto("PRO354-77 regresión: PRO-342 (Documentos electrónicos, motor fiscal, CDC, KuDE, gateway) y NCE no se tocan desde PRO-354", !/politica-stock|bajas-pendientes/.test(leer("app/(private)/documentos/page.tsx")) && !/politica-stock/.test(leer("lib/facturacion/gateway.ts")) && !/politica-stock/.test(leer("lib/facturacion/reconciliacion.ts")));
  }

  // ── L. PRO-354-R02-R01 — correctivo de la auditoría (F001 integridad/concurrencia, F002 listado, F003 respuestas tardías) ───────────────────
  {
    const ruta = "documentacao/banco/nexit/v1/migraciones/NEX-081-facturacion-politica-stock-pendientes.sql";
    const cod = sinComSql(leer(ruta));
    const tramo = (desde: string, hasta: string) => cod.slice(cod.indexOf(desde), cod.indexOf(hasta, cod.indexOf(desde) + desde.length));
    const tabla = tramo("CREATE TABLE public.documento_electronico_stock_pendientes", "CREATE INDEX fe_stock_pend_abiertas_idx");
    const inmutable = tramo("CREATE FUNCTION public.fe_stock_pendientes_inmutable()", "CREATE TRIGGER fe_stock_pendientes_inmutable_trg");
    const gProd = tramo("CREATE FUNCTION public.fe_stock_pendientes_producto_guarda()", "CREATE FUNCTION public.fe_stock_pendientes_deposito_guarda()");
    const gDep = tramo("CREATE FUNCTION public.fe_stock_pendientes_deposito_guarda()", "CREATE TABLE public.fe_stock_pendientes_preparacion");
    const crear = tramo("CREATE FUNCTION public.fe_documento_crear_fe_stock_pendiente", "CREATE FUNCTION public.fe_stock_pendientes_listar");
    const listar = tramo("CREATE FUNCTION public.fe_stock_pendientes_listar", "CREATE FUNCTION public.fe_stock_pendientes_filtros");
    const filtros = tramo("CREATE FUNCTION public.fe_stock_pendientes_filtros", "CREATE FUNCTION public.fe_stock_pendiente_confirmar");
    const confirmar = tramo("CREATE FUNCTION public.fe_stock_pendiente_confirmar", "COMMENT ON FUNCTION");
    const pos = (t: string, s: string) => t.indexOf(s);
    const enOrden = (t: string, ...ss: string[]) => ss.every((s) => pos(t, s) >= 0) && ss.every((s, i) => i === 0 || pos(t, ss[i - 1]) < pos(t, s));
    const scripts = (n: string) => leer(`documentacao/banco/nexit/v1/scripts/${n}-NEX-081.sql`);
    const rev = scripts("reversion");

    // F001 — obligación congelada y guardas en todos los caminos
    cierto("PRO354-R01-01 la baja congela unidad base y sucursal (NOT NULL, FK de sucursal) y la inmutabilidad las incluye",
      /unidad_medida_id\s+uuid\s+NOT NULL REFERENCES public\.unidades_medida \(id\)/.test(tabla) && /sucursal_id\s+uuid\s+NOT NULL/.test(tabla)
      && /fe_stock_pend_sucursal_fk FOREIGN KEY \(empresa_id, sucursal_id\) REFERENCES public\.sucursales \(empresa_id, id\)/.test(tabla)
      && /NEW\.unidad_medida_id = OLD\.unidad_medida_id AND NEW\.sucursal_id = OLD\.sucursal_id/.test(inmutable));
    cierto("PRO354-R01-02 stock cero + cambio de unidad (5 UNI pendientes → CAJA): el trigger de productos lo impide en CUALQUIER camino de UPDATE (también tras la validación de NEX-052) mientras haya PENDIENTE",
      /CREATE TRIGGER fe_stock_pendientes_producto_guarda_trg BEFORE UPDATE OF unidad_medida_id, controla_stock, activo ON public\.productos/.test(cod)
      && /NEW\.unidad_medida_id IS DISTINCT FROM OLD\.unidad_medida_id/.test(gProd) && /p\.estado = 'PENDIENTE'/.test(gProd) && /NEX:PRODUCTO_CON_BAJAS_PENDIENTES/.test(gProd) && /SECURITY DEFINER/.test(gProd));
    cierto("PRO354-R01-03 producto con pendiente: tampoco deja de controlar stock ni se inactiva (quedaría inconfirmable); el reinicio de demo sigue permitido",
      /OLD\.controla_stock AND NOT NEW\.controla_stock/.test(gProd) && /OLD\.activo AND NOT NEW\.activo/.test(gProd) && /nex_reinicio_demo_activo\(OLD\.empresa_id\)/.test(gProd));
    cierto("PRO354-R01-04 depósito: no cambia de sucursal con CUALQUIER baja vinculada (también confirmada: preserva la historia); no se inactiva ni pasa a terceros con una abierta",
      /CREATE TRIGGER fe_stock_pendientes_deposito_guarda_trg BEFORE UPDATE OF sucursal_id, activo, es_de_terceros ON public\.depositos/.test(cod)
      && /NEW\.sucursal_id IS DISTINCT FROM OLD\.sucursal_id\s+AND EXISTS \(SELECT 1 FROM public\.documento_electronico_stock_pendientes p WHERE p\.empresa_id = OLD\.empresa_id AND p\.deposito_id = OLD\.id\)/.test(gDep)
      && /\(OLD\.activo AND NOT NEW\.activo\) OR \(NOT OLD\.es_de_terceros AND NEW\.es_de_terceros\)/.test(gDep) && /NEX:DEPOSITO_CON_BAJAS_PENDIENTES/.test(gDep));
    cierto("PRO354-R01-05 registro: producto y depósito BLOQUEADOS (FOR SHARE) ANTES de validarlos y antes de la emisión",
      enOrden(crear, "FROM public.productos p WHERE p.empresa_id = p_empresa AND p.id = v_prod FOR SHARE", "NOT v_pr.controla_stock", "FROM public.depositos d WHERE d.empresa_id = p_empresa AND d.id = v_dep FOR SHARE", "NOT v_dp.activo", "fe_documento_crear_fe_receptor("));
    cierto("PRO354-R01-06 reposición concurrente sin fila de saldo previa: el faltante real se comprueba DESPUÉS del candado de numeración de movimientos (el que toma toda entrada antes de tocar saldos)",
      enOrden(crear, "fe_documento_crear_fe_receptor(", "pg_advisory_xact_lock(hashtextextended('movimientos.numero:' || p_empresa::text, 0))", "NEX:STOCK_PENDIENTE_CON_DISPONIBLE", "INSERT INTO public.documento_electronico_stock_pendientes")
      && /pg_advisory_xact_lock\(hashtextextended\('movimientos\.numero:' \|\| p_empresa::text, 0\)\)/.test(leer("documentacao/banco/nexit/v1/migraciones/NEX-011-reportes-dashboard.sql")));
    cierto("PRO354-R01-07 registro: guarda la unidad base (R02-R02: la revisada, comprobada igual a la vigente bajo bloqueo) y la sucursal de la FE", /unidad_medida_id, sucursal_id,/.test(crear) && /VALUES \(p_empresa, v_id, r\.producto_id, r\.deposito_id, r\.unidad_medida_id, p_sucursal,/.test(crear));
    cierto("PRO354-R01-08 confirmación: NO bloquea costo ni saldo antes del motor (no invierte numeración → costo → saldo de los movimientos ordinarios)",
      !/inventario_costos/.test(confirmar) && !/FROM public\.stock_saldos/.test(confirmar));
    cierto("PRO354-R01-09 confirmación: orden de bloqueos candado propio → pendiente FOR UPDATE → FE FOR SHARE → depósito FOR SHARE → producto FOR SHARE → motor",
      enOrden(confirmar, "pg_advisory_xact_lock(hashtextextended('fe.stock.pend:'", "WHERE empresa_id = p_empresa AND id = p_pendiente FOR UPDATE", "id = v_p.documento_id FOR SHARE", "d.id = v_p.deposito_id FOR SHARE", "p.id = v_p.producto_id FOR SHARE", "inventario_registrar_movimiento("));
    cierto("PRO354-R01-10 confirmación revalida bajo bloqueo: sucursal original (depósito y FE), unidad base congelada, depósito activo/propio, producto activo con control de stock y lotes",
      /v_dp\.sucursal_id IS DISTINCT FROM v_p\.sucursal_id OR v_doc\.sucursal_id IS DISTINCT FROM v_p\.sucursal_id/.test(confirmar) && /NEX:PENDIENTE_SUCURSAL_DISTINTA/.test(confirmar)
      && /v_pr\.unidad_medida_id IS DISTINCT FROM v_p\.unidad_medida_id/.test(confirmar) && /NEX:PENDIENTE_UNIDAD_DISTINTA/.test(confirmar)
      && /NOT v_dp\.activo OR v_dp\.es_de_terceros/.test(confirmar) && /NOT v_pr\.activo OR NOT v_pr\.controla_stock/.test(confirmar)
      && enOrden(confirmar, "p.id = v_p.producto_id FOR SHARE", "FROM public.stock_lotes l", "inventario_registrar_movimiento("));
    cierto("PRO354-R01-11 saldo insuficiente al confirmar: lo detecta el motor bajo SU bloqueo; se traduce a NEX:STOCK_INSUFICIENTE dentro de una subtransacción (rollback completo, nada escrito) y cualquier otro error se propaga",
      /EXCEPTION WHEN raise_exception THEN/.test(confirmar) && /IF SQLERRM LIKE 'saldo disponible insuficiente%' THEN/.test(confirmar) && /\bRAISE;\s*END;/.test(confirmar)
      && enOrden(confirmar, "EXCEPTION WHEN raise_exception THEN", "UPDATE public.documento_electronico_stock_pendientes"));
    cierto("PRO354-R01-12 dos confirmaciones simultáneas de la misma baja: candado + FOR UPDATE; la segunda ve CONFIRMADA y devuelve el mismo movimiento (repetido)",
      enOrden(confirmar, "p_pendiente FOR UPDATE", "IF v_p.estado = 'CONFIRMADA' THEN", "inventario_registrar_movimiento(") && /'FE-STOCK-PEND:' \|\| v_p\.id::text/.test(confirmar));
    cierto("PRO354-R01-13 referencia del movimiento complementario con serie (dos FE AA/AB con el mismo número no se confunden)", /v_ref := 'FE ' \|\| v_doc\.establecimiento \|\| '-' \|\| v_doc\.punto_expedicion \|\| '-' \|\| v_doc\.numero \|\| CASE WHEN v_doc\.serie IS NULL THEN '' ELSE ' \(' \|\| v_doc\.serie \|\| '\)' END/.test(confirmar));
    cierto("PRO354-R01-14 sin reescribir el motor ni funciones históricas: NEX-081 no redefine el motor, la numeración, depósitos ni el cambio de unidad; sin conversiones ni saldo negativo",
      !/FUNCTION (public\.)?(inventario_registrar_movimiento|inventario_agregar_linea|inventario_registrar_linea|nex_siguiente_numero_movimiento|deposito_cambiar_estado|deposito_editar|producto_cambiar_unidad_base_validar)\(/.test(cod)
      && !/UPDATE public\.stock_saldos|stock_saldos_cant_chk|factor_conversion/.test(cod));
    cierto("PRO354-R01-15 scripts: preflight exige las dependencias R01 y la ausencia de guardas; verificación comprueba columnas, guardas, orden de la confirmación y candado del registro; reversión quita guardas, catálogo y la firma nueva del listado",
      /movimientos\.numero:/.test(scripts("preflight")) && /fe_stock_pendientes_producto_guarda_trg/.test(scripts("preflight")) && /sucursal_en_alcance/.test(scripts("preflight"))
      && /fe_stock_pend_sucursal_fk/.test(scripts("verificar")) && /fe_stock_pendientes_deposito_guarda_trg/.test(scripts("verificar")) && /strpos\(codigo_sin_textos, 'inventario_costos'\) = 0/.test(scripts("verificar"))
      && /DROP TRIGGER fe_stock_pendientes_producto_guarda_trg ON public\.productos;/.test(rev) && /DROP TRIGGER fe_stock_pendientes_deposito_guarda_trg ON public\.depositos;/.test(rev)
      && /DROP FUNCTION public\.fe_stock_pendientes_filtros\(uuid, uuid\);/.test(rev) && /DROP FUNCTION public\.fe_stock_pendientes_listar\(uuid, uuid, text, uuid, uuid, text, integer, integer\);/.test(rev)
      && !/fe_stock_pendientes_listar\(uuid, uuid, text, uuid, text\)/.test(rev + scripts("verificar")) && /Bloqueos y concurrencia/.test(leer("documentacao/banco/nexit/v1/docs/PROCEDIMIENTO-NEX-081.md")));
    {
      const { respuestaError } = await import("@/lib/productos/shared");
      const { respuestaErrorDeposito } = await import("@/lib/depositos/shared");

      igual("PRO354-R01-16 errores de guarda en la aplicación: producto 409 y depósito 409 con el texto de la base (no 500 genérico)",
        [respuestaError({ code: "P0001", detail: "NEX:PRODUCTO_CON_BAJAS_PENDIENTES", message: "m" }, "editar").status, respuestaErrorDeposito({ code: "P0001", detail: "NEX:DEPOSITO_CON_BAJAS_PENDIENTES", message: "m" }, "editar").status], [409, 409]);
    }
    igual("PRO354-R01-17 errores de la confirmación revalidada: sucursal/unidad distinta, depósito no autorizado o producto inválido = 409 con el texto de la base",
      ["NEX:PENDIENTE_SUCURSAL_DISTINTA", "NEX:PENDIENTE_UNIDAD_DISTINTA", "NEX:STOCK_DEPOSITO_NO_AUTORIZADO", "NEX:STOCK_PENDIENTE_INVALIDO"].map((d) => errorBajaPendiente({ code: "P0001", detail: d, message: "m" })),
      Array(4).fill({ status: 409, error: "m" }));

    // F002 — listado completo y referencia fiscal con serie
    cierto("PRO354-R01-20 listado paginado estable: límite 1..100, desplazamiento, total (count OVER) y desempate final por id",
      /p_sucursal uuid, p_deposito uuid, p_buscar text, p_limite integer, p_desplazamiento integer/.test(listar) && /v_limite < 1 OR v_limite > 100 OR v_desde < 0/.test(listar)
      && /count\(\*\) OVER \(\)/.test(listar) && /LIMIT v_limite OFFSET v_desde/.test(listar) && /COALESCE\(d\.serie, ''\), pr\.codigo, p\.id\s+LIMIT/.test(listar) && !/LIMIT 500/.test(listar));
    cierto("PRO354-R01-21 filtro de sucursal en el alcance del usuario (42501 fuera de alcance) sobre la sucursal congelada de la baja",
      /p_sucursal IS NOT NULL AND NOT public\.sucursal_en_alcance\(p_empresa, p_usuario, p_sucursal\)/.test(listar) && /\(p_sucursal IS NULL OR p\.sucursal_id = p_sucursal\)/.test(listar));
    cierto("PRO354-R01-22 identificación fiscal completa con serie en el listado y en la búsqueda (EEE-PPP-NNNNNNN (AA) y AA-NNNNNNN)",
      /d\.numero \|\| CASE WHEN d\.serie IS NULL THEN '' ELSE ' \(' \|\| d\.serie \|\| '\)' END,\s*d\.serie,/.test(listar) && /COALESCE\(d\.serie \|\| '-' \|\| d\.numero, ''\)/.test(listar));
    cierto("PRO354-R01-23 cantidades diferenciadas: faltante original (evidencia), pendiente actual (0 si confirmada) y descontado total (emisión + confirmación)",
      /CASE WHEN p\.estado = 'PENDIENTE' THEN p\.cantidad_pendiente ELSE 0::numeric END/.test(listar) && /p\.cantidad_descontada \+ CASE WHEN p\.estado = 'CONFIRMADA' THEN p\.cantidad_pendiente ELSE 0::numeric END/.test(listar)
      && /o_faltante_original numeric, o_pendiente_actual numeric, o_descontado_total numeric/.test(listar));
    cierto("PRO354-R01-24 catálogo de filtros independiente de página y filtros: STOCK.VER, depósitos propios autorizados con su sucursal (R02-R02: alcance histórico)", /'STOCK', 'VER'/.test(filtros) && /deposito_en_alcance\(p_empresa, p_usuario, dp\.id\)/.test(filtros) && /NOT dp\.es_de_terceros/.test(filtros) && !/p_estado|p_buscar|OFFSET/.test(filtros));
    igual("PRO354-R01-25 filtros de URL: sucursal UUID; página ≥ 1; tamaño 25|50|100; cualquier otro valor = inválido",
      [leerFiltrosBajas(new URLSearchParams(`sucursal=${SUC.toUpperCase()}&pagina=3&porPagina=50`)), ...["sucursal=x", "pagina=0", "pagina=-1", "pagina=1.5", "pagina=10001", "porPagina=26", "porPagina=abc"].map((q) => leerFiltrosBajas(new URLSearchParams(q)))],
      [{ estado: "PENDIENTE", sucursalId: SUC, depositoId: null, buscar: "", pagina: 3, porPagina: 50 }, null, null, null, null, null, null, null]);
    {
      const llamadas: unknown[][] = [];
      const filaSql = { o_id: "x", o_documento_id: "y", o_documento: "001-001-0000010 (AB)", o_serie: "AB", o_unidad: "CAJA", o_sucursal_id: SUC, o_sucursal_nombre: "Central", o_deposito_id: D1,
        o_facturado: "15.0000", o_descontado_emision: "10.0000", o_faltante_original: "5.0000", o_pendiente_actual: "0", o_descontado_total: "15.0000", o_saldo_registrado: "2.0000",
        o_pendiente_abierto: "0", o_saldo_proyectado: "2.0000", o_estado: "CONFIRMADA", o_total: "312" };
      const db = (filas: unknown[]) => ({ async query(_s: string, p: unknown[]) { llamadas.push(p); return { rows: filas }; } }) as never;
      const pag = await listarBajasPendientes(db([filaSql]), EMPRESA, USUARIO, { estado: null, sucursalId: SUC, depositoId: D1, buscar: "AB", pagina: 2, porPagina: 50 });
      const vacia = await listarBajasPendientes(db([]), EMPRESA, USUARIO, { estado: "PENDIENTE", sucursalId: null, depositoId: null, buscar: "", pagina: 7, porPagina: 25 });
      let sinNex = false;

      try { await listarBajasPendientes({ async query() { throw Object.assign(new Error("x"), { code: "42883" }); } } as never, EMPRESA, USUARIO, { estado: null, sucursalId: null, depositoId: null, buscar: "", pagina: 1, porPagina: 25 }); } catch (e) { sinNex = e instanceof SinNex081Error; }
      igual("PRO354-R01-26 listado real con base simulada: parámetros (sucursal, depósito, búsqueda, límite, desplazamiento) y total; página vacía = total 0; sin NEX-081 = 503",
        [llamadas[0], pag.total, pag.pagina, vacia.total, sinNex], [[EMPRESA, USUARIO, null, SUC, D1, "AB", 50, 50], 312, 2, 0, true]);
      igual("PRO354-R01-27 fila: serie, unidad, sucursal y cantidades como texto exacto (confirmada: pendiente actual 0, faltante original 5 conservado)",
        (({ documento, serie, unidad, sucursalNombre, faltanteOriginal, pendienteActual, descontadoTotal }) => ({ documento, serie, unidad, sucursalNombre, faltanteOriginal, pendienteActual, descontadoTotal }))(filaBajaPendiente(filaSql)),
        { documento: "001-001-0000010 (AB)", serie: "AB", unidad: "CAJA", sucursalNombre: "Central", faltanteOriginal: "5.0000", pendienteActual: "0", descontadoTotal: "15.0000" });
      const cat = await listarFiltrosBajas(db([
        { o_sucursal_id: SUC, o_sucursal_codigo: "001", o_sucursal_nombre: "Central", o_deposito_id: D1, o_deposito_codigo: "D01", o_deposito_nombre: "Central", o_deposito_activo: true },
        { o_sucursal_id: SUC, o_sucursal_codigo: "001", o_sucursal_nombre: "Central", o_deposito_id: D2, o_deposito_codigo: "D02", o_deposito_nombre: "Anexo", o_deposito_activo: false },
      ]), EMPRESA, USUARIO);
      igual("PRO354-R01-28 catálogo: una sucursal por id y todos sus depósitos (también inactivos, marcados)", [cat.sucursales.length, cat.depositos.map((d) => [d.codigo, d.sucursalId, d.activo])], [1, [["D01", SUC, true], ["D02", SUC, false]]]);
    }
    igual("PRO354-R01-29 el botón compara el saldo con el PENDIENTE ACTUAL", [puedeIntentarConfirmar(baja({ saldoRegistrado: "4.9999" }), true).puede, puedeIntentarConfirmar(baja({ saldoRegistrado: "5" }), true).puede], [false, true]);
    igual("PRO354-R01-30 rango de página sin totales inventados", [rangoPaginaBajas(312, 2, 25, 25), rangoPaginaBajas(312, 13, 25, 12), rangoPaginaBajas(0, 1, 25, 0)], ["Mostrando 26–50 de 312", "Mostrando 301–312 de 312", "Sin registros"]);
    {
      const api = leer("app/api/stock/bajas-pendientes/route.ts");
      const pagina = leer("app/(private)/stock/bajas-pendientes/page.tsx");

      cierto("PRO354-R01-31 API: devuelve página, total y catálogo de filtros (no derivado de las filas)", /\.\.\.pagina, filtros: catalogo/.test(api) && /listarFiltrosBajas\(db, session\.user\.empresaId, session\.user\.id\)/.test(api));
      cierto("PRO354-R01-32 vista: filtro de sucursal y depósito desde el catálogo; depósitos de la sucursal elegida; columnas Descontado / Faltante original / Pendiente actual; paginación; el proyectado no se suma",
        /catalogo\.sucursales\.map/.test(pagina) && /catalogo\.depositos\.filter\(\(d\) => !sucursal \|\| d\.sucursalId === sucursal\)/.test(pagina) && !/new Map\(bajas\.map/.test(pagina)
        && /Faltante original/.test(pagina) && /Pendiente actual/.test(pagina) && /Anterior/.test(pagina) && /Siguiente/.test(pagina) && !/saldoProyectado[^\n]*reduce|reduce[^\n]*saldoProyectado/.test(pagina));
    }

    // F003 — respuestas tardías y contexto vigente
    {
      const ctx = crearContextoBajas();
      const qA = consultaBajas({ estado: "PENDIENTE", sucursal: "", deposito: "", buscar: "", pagina: 1, porPagina: 25 });
      const qB = consultaBajas({ estado: "CONFIRMADA", sucursal: "", deposito: "", buscar: "", pagina: 1, porPagina: 25 });
      const tA = ctx.cambiar(qA);
      const tA2 = ctx.cambiar(qA);

      igual("PRO354-R01-40 misma consulta (re-render): no sube la generación", [tA2.generacion === tA.generacion, ctx.vigente(tA)], [true, true]);
      const tB = ctx.cambiar(qB);

      igual("PRO354-R01-41 cambio de filtro: la consulta anterior queda INVÁLIDA en el acto (antes de cualquier lectura, sin esperar el retardo)", [ctx.vigente(tA), ctx.vigente(tB)], [false, true]);

      // Vista simulada: aplica una respuesta solo si su ticket sigue vigente.
      let mostrado = "";
      const resolver = (t: typeof tA, filas: string) => { if (ctx.vigente(t)) mostrado = filas; };

      resolver(tB, "filas B");
      resolver(tA, "filas A (tardía)");
      igual("PRO354-R01-42 respuesta tardía del filtro anterior: se descarta y no reemplaza al contexto actual", mostrado, "filas B");

      // Confirmación pulsada bajo B; durante el POST el usuario pasa a C; el finally relee con la consulta VIGENTE (C), no con la del render anterior.
      const qC = consultaBajas({ estado: "TODOS", sucursal: SUC, deposito: "", buscar: "", pagina: 1, porPagina: 25 });
      const tC = ctx.cambiar(qC);
      const tRe = ctx.releer();

      igual("PRO354-R01-43 tras confirmar: relectura con los filtros vigentes; la lectura en vuelo previa no gana", [tRe.clave, ctx.vigente(tRe), ctx.vigente(tC), ctx.vigente(tB)], [qC, true, false, false]);
      igual("PRO354-R01-44 consulta canónica: orden fijo, búsqueda recortada, vacíos omitidos; otra página = otra consulta",
        [consultaBajas({ estado: "PENDIENTE", sucursal: "", deposito: D1, buscar: "  AB  ", pagina: 2, porPagina: 50 }), qA === consultaBajas({ estado: "PENDIENTE", sucursal: "", deposito: "", buscar: "   ", pagina: 1, porPagina: 25 }), qA === consultaBajas({ estado: "PENDIENTE", sucursal: "", deposito: "", buscar: "", pagina: 2, porPagina: 25 })],
        [`estado=PENDIENTE&deposito=${D1}&buscar=AB&pagina=2&porPagina=50`, true, false]);
    }
    {
      const pagina = leer("app/(private)/stock/bajas-pendientes/page.tsx");

      cierto("PRO354-R01-45 vista: el contexto cambia ANTES del retardo; solo se muestran filas de la consulta vigente", enOrden(pagina, "contexto.current.cambiar(consulta)", "setTimeout(() => void leer(ticket), 250)") && /const vigentes = datos !== null && datos\.clave === consulta;/.test(pagina) && /const bajas = vigentes \? datos\.bajas : \[\];/.test(pagina) && !/version\.current/.test(pagina));
      cierto("PRO354-R01-46 sin acciones sobre filas obsoletas: botón deshabilitado si no son vigentes o se está cargando; la confirmación vuelve a comprobarlo",
        /disabled=\{!c\.puede \|\| confirmando !== null \|\| cargando \|\| !vigentes\}/.test(pagina) && /if \(confirmando \|\| !vigentes \|\| cargando\) return;/.test(pagina));
      cierto("PRO354-R01-47 tras confirmar se relee con los filtros vigentes (ref de contexto), nunca con la función del render anterior; los errores de un contexto viejo no se muestran",
        /void leer\(contexto\.current\.releer\(\)\);/.test(pagina) && !/await cargar\(\)/.test(pagina) && enOrden(pagina, "} catch (e) {\n      if (!contexto.current.vigente(ticket)) return;", "setErrorListado(e instanceof Error"));
      cierto("PRO354-R01-48 cambiar un filtro vuelve a la página 1; cambiar de sucursal limpia un depósito de otra sucursal; confirmación explícita y resultado idempotente conservados",
        /function cambiarFiltro\(aplicar: \(\) => void\) \{\s*aplicar\(\);\s*setPagina\(1\);/.test(pagina) && /d\.id === deposito && d\.sucursalId === v/.test(pagina) && /window\.confirm/.test(pagina) && /resultadoConfirmacion\(b, r\.ok, j\)/.test(pagina));
    }
  }

  // ── M. PRO-354-R02-R02 — correctivo de la auditoría R01 (F001-R unidad base revisada + lotes; F002-R historial; F003-R resultado vs. carga) ──
  {
    const ruta = "documentacao/banco/nexit/v1/migraciones/NEX-081-facturacion-politica-stock-pendientes.sql";
    const cod = sinComSql(leer(ruta));
    const tramo = (desde: string, hasta: string) => cod.slice(cod.indexOf(desde), cod.indexOf(hasta, cod.indexOf(desde) + desde.length));
    const crear = tramo("CREATE FUNCTION public.fe_documento_crear_fe_stock_pendiente", "CREATE FUNCTION public.fe_stock_pendientes_listar");
    const listar = tramo("CREATE FUNCTION public.fe_stock_pendientes_listar", "CREATE FUNCTION public.fe_stock_pendientes_filtros");
    const filtros = tramo("CREATE FUNCTION public.fe_stock_pendientes_filtros", "CREATE FUNCTION public.fe_stock_pendiente_confirmar");
    const confirmar = tramo("CREATE FUNCTION public.fe_stock_pendiente_confirmar", "COMMENT ON FUNCTION");
    const gDep = tramo("CREATE FUNCTION public.fe_stock_pendientes_deposito_guarda()", "CREATE TABLE public.fe_stock_pendientes_preparacion");
    const pos = (t: string, s: string, desde = 0) => t.indexOf(s, desde);
    const enOrden = (t: string, ...ss: string[]) => ss.every((s) => pos(t, s) >= 0) && ss.every((s, i) => i === 0 || pos(t, ss[i - 1]) < pos(t, s));
    const nex046 = leer("documentacao/banco/nexit/v1/migraciones/NEX-046-depositos-gestion.sql");
    const alcance = nex046.slice(nex046.indexOf("FUNCTION public.deposito_en_alcance"), nex046.indexOf("$$;", nex046.indexOf("FUNCTION public.deposito_en_alcance")));
    const emision = leer("lib/facturacion/emision.ts");
    const pagina = leer("app/(private)/stock/bajas-pendientes/page.tsx");
    const scripts = (n: string) => leer(`documentacao/banco/nexit/v1/scripts/${n}-NEX-081.sql`);
    const loteCrear = [...crear.matchAll(/NEX:STOCK_PENDIENTE_LOTE/g)].map((m) => m.index ?? -1);
    const candado = pos(crear, "pg_advisory_xact_lock(hashtextextended('movimientos.numero:' || p_empresa::text, 0))");

    // F001-R — unidad base revisada: plan, huella, cuerpo SQL y comparación bajo bloqueo antes de numerar
    {
      const conU1 = aplicarPolitica([linea(P1, "15", true, U1)], [saldo(P1, D1, "10")], permite());
      const conU2 = aplicarPolitica([linea(P1, "15", true, U2)], [saldo(P1, D1, "10")], permite());
      const repetidas = aplicarPolitica([linea(P1, "2", true, U1), linea(P1, "3", true, U1)], [], permite());

      igual("PRO354-R02-01 el pendiente del plan lleva la unidad base revisada (UUID) y la envía a la base", [conU1.pendientes[0].unidadId, pendientesSql(conU1)[0].unidad_medida_id], [U1, U1]);
      cierto("PRO354-R02-02 cambio entre la previa y la emisión (misma cantidad/depósito, otra unidad base): la huella cambia → la emisión exige revisar de nuevo (409 MENSAJE_REPARTO_CAMBIO)",
        conU1.huella !== conU2.huella && /cuerpo\.repartoHuella !== plan\.huella\) throw new ErrorFacturacion\(409, MENSAJE_REPARTO_CAMBIO\)/.test(emision));
      igual("PRO354-R02-03 líneas repetidas del mismo UUID: un solo pendiente con la unidad de ese producto", [repetidas.pendientes.length, repetidas.pendientes[0].cantidad, repetidas.pendientes[0].unidadId], [1, "5", U1]);
      igual("PRO354-R02-04 sin unidad base conocida el pendiente viaja con null y la base lo rechaza (falla cerrada, nunca se completa con otra unidad)",
        pendientesSql(aplicarPolitica([linea(P1, "3", true, null)], [], permite()))[0].unidad_medida_id, null);
      cierto("PRO354-R02-05 sin cambio: misma unidad = misma huella (determinista)", conU1.huella === aplicarPolitica([linea(P1, "15", true, U1)], [saldo(P1, D1, "10")], permite()).huella);
      cierto("PRO354-R02-06 la emisión toma la unidad BASE del producto (p.unidad_medida_id), no la unidad SIFEN de la línea (un override SIFEN legítimo no la altera)",
        /p\.unidad_medida_id AS "unidadId"/.test(emision) && /unidadId: p\.unidadId === null \|\| p\.unidadId === undefined \? null : s\(p\.unidadId\)/.test(emision) && !/unidadId: [^,}]*unidadSifen/.test(emision));
      cierto("PRO354-R02-07 base: cada pendiente exige exactamente 4 claves con unidad_medida_id UUID en texto",
        /jsonb_object_keys\(x\)\) <> 4/.test(crear) && /jsonb_typeof\(x->'unidad_medida_id'\) IS DISTINCT FROM 'string'/.test(crear) && /\(x->>'unidad_medida_id'\) !~\* '\^\[0-9a-f\]\{8\}/.test(crear));
      cierto("PRO354-R02-08 cambio entre la preparación y la base: la unidad VIGENTE se lee bajo FOR SHARE y se compara por identidad ANTES de reservar numeración (NEX:STOCK_PENDIENTE_UNIDAD_CAMBIO)",
        /SELECT p\.activo, p\.controla_stock, p\.unidad_medida_id INTO v_pr FROM public\.productos p WHERE p\.empresa_id = p_empresa AND p\.id = v_prod FOR SHARE;/.test(crear)
        && enOrden(crear, "AND p.id = v_prod FOR SHARE", "v_pr.unidad_medida_id IS DISTINCT FROM v_uni", "NEX:STOCK_PENDIENTE_UNIDAD_CAMBIO", "FROM public.fe_documento_crear_fe_receptor("));
      cierto("PRO354-R02-09 misma equivalencia SIFEN con otro UUID = cambio: la comparación es por UUID, sin leer códigos SIFEN ni convertir",
        !/unidad_sifen|unidades_sifen|conversion|factor/i.test(crear) && /IS DISTINCT FROM v_uni/.test(crear));
      cierto("PRO354-R02-10 la unidad revisada integra la forma normalizada y es la que se guarda en el pendiente",
        /'unidad_medida_id', v_uni\)\)/.test(crear) && /\(n->>'unidad_medida_id'\)::uuid AS unidad_medida_id/.test(crear) && /VALUES \(p_empresa, v_id, r\.producto_id, r\.deposito_id, r\.unidad_medida_id, p_sucursal,/.test(crear) && !/SELECT pu\.unidad_medida_id/.test(crear));
      cierto("PRO354-R02-11 reintento idempotente: compara también la unidad persistida (misma clave con otra unidad = NEX:IDEMPOTENCIA_CONFLICTO, sin escribir)",
        /round\(p\.cantidad_pendiente, 4\)::text, p\.unidad_medida_id::text\)/.test(crear) && /round\(\(n->>'cantidad'\)::numeric, 4\)::text, \(n->>'unidad_medida_id'\)::uuid::text\)/.test(crear)
        && pos(crear, "IF v_reutilizado THEN") < pos(crear, "INSERT INTO public.documento_electronico_stock_pendientes"));
      cierto("PRO354-R02-12 la API traduce NEX:STOCK_PENDIENTE_UNIDAD_CAMBIO a 409 (revisar de nuevo)", /STOCK_PENDIENTE_UNIDAD_CAMBIO/.test(leer("lib/facturacion/shared.ts")));
      cierto("PRO354-R02-13 lotes: la evidencia se comprueba antes de numerar Y se RE-COMPRUEBA tras el candado de numeración, antes de insertar el pendiente",
        loteCrear.length === 2 && loteCrear[0] < pos(crear, "FROM public.fe_documento_crear_fe_receptor(") && candado > 0 && loteCrear[1] > candado
        && loteCrear[1] < pos(crear, "INSERT INTO public.documento_electronico_stock_pendientes", candado) && /FROM public\.stock_lotes l WHERE l\.empresa_id = p_empresa AND l\.producto_id = r\.producto_id/.test(crear));
    }

    // F002-R — historial visible tras inactivar el depósito; confirmación sigue exigiendo depósito activo
    cierto("PRO354-R02-14 listado: alcance HISTÓRICO (deposito_en_alcance) en lugar de usuario_puede_deposito; empresa de la sesión y STOCK.VER intactos",
      /AND public\.deposito_en_alcance\(p_empresa, p_usuario, p\.deposito_id\)/.test(listar) && !/usuario_puede_deposito/.test(listar) && /WHERE p\.empresa_id = p_empresa/.test(listar) && /'STOCK', 'VER'/.test(listar));
    cierto("PRO354-R02-15 baja confirmada con depósito inactivo y alcance autorizado: deposito_en_alcance (NEX-046) NO filtra por activo; alcance TODOS o asignación",
      alcance.length > 0 && !/activo/.test(alcance) && /alcance_depositos = 'TODOS'/.test(alcance) && /usuario_deposito ud/.test(alcance));
    cierto("PRO354-R02-16 alcance revocado u otra empresa: no se ve (asignación del usuario y misma empresa exigidas por deposito_en_alcance; filas de la empresa de la sesión)",
      /u\.empresa_id = p_empresa AND u\.id = p_usuario/.test(alcance) && /d\.empresa_id = u\.empresa_id/.test(alcance) && /ud\.deposito_id = p_deposito/.test(alcance) && /WHERE p\.empresa_id = p_empresa/.test(listar));
    cierto("PRO354-R02-17 catálogo de filtros con el mismo alcance histórico; los inactivos se marcan (o_deposito_activo) y la vista los rotula «(inactivo)»",
      /deposito_en_alcance\(p_empresa, p_usuario, dp\.id\)/.test(filtros) && !/usuario_puede_deposito/.test(filtros) && /dp\.activo/.test(filtros) && /" \(inactivo\)"/.test(pagina));
    cierto("PRO354-R02-18 confirmar NO cambia: MOVIMIENTOS.CREAR, alcance operativo (usuario_puede_deposito, solo activos) y depósito activo bajo bloqueo",
      /'MOVIMIENTOS', 'CREAR'/.test(confirmar) && /usuario_puede_deposito\(p_empresa, p_usuario, v_p\.deposito_id\)/.test(confirmar) && /IF NOT v_dp\.activo OR v_dp\.es_de_terceros THEN/.test(confirmar) && !/deposito_en_alcance/.test(confirmar));
    cierto("PRO354-R02-19 las guardas de inactivación no cambian (depósito con PENDIENTE no se inactiva ni pasa a terceros; con cualquier baja no cambia de sucursal)",
      /CREATE TRIGGER fe_stock_pendientes_deposito_guarda_trg/.test(cod) && /p\.estado = 'PENDIENTE'/.test(gDep) && /sucursal_id/.test(gDep));
    cierto("PRO354-R02-20 scripts: preflight exige deposito_en_alcance; verificar comprueba unidad, lotes y alcance histórico; reversión sin objetos nuevos; procedimiento documentado",
      /deposito_en_alcance\(uuid,uuid,uuid\)/.test(scripts("preflight")) && /NEX:STOCK_PENDIENTE_UNIDAD_CAMBIO/.test(scripts("verificar")) && /NEX:STOCK_PENDIENTE_LOTE/.test(scripts("verificar"))
      && /deposito_en_alcance/.test(scripts("verificar")) && /R02-R02: sin objetos nuevos/.test(scripts("reversion")) && /DROP FUNCTION public\.fe_stock_pendientes_listar\(uuid, uuid, text, uuid, uuid, text, integer, integer\)/.test(scripts("reversion"))
      && /Corrección R02-R02/.test(leer("documentacao/banco/nexit/v1/docs/PROCEDIMIENTO-NEX-081.md")) && /deposito_en_alcance\(uuid,uuid,uuid\)/.test(cod));

    // F003-R — resultado de la confirmación separado del error de carga del listado
    {
      const b = { id: "b1", documento: "001-001-0000007 (AA)" };
      const r409 = resultadoConfirmacion(b, false, { error: "Stock disponible insuficiente." });
      const ok = resultadoConfirmacion(b, true, { numero: "MOV-9" });
      const rep = resultadoConfirmacion(b, true, { numero: "MOV-9", repetido: true });
      const leerFn = pagina.slice(pagina.indexOf("const leer = useCallback"), pagina.indexOf("useEffect(() => {"));
      const cambiar = pagina.slice(pagina.indexOf("function cambiarFiltro"), pagina.indexOf("async function confirmar"));

      igual("PRO354-R02-21 resultado de confirmación identificado por la factura: 409 conserva el motivo; éxito y repetido con el movimiento",
        [r409.tipo, /001-001-0000007 \(AA\)/.test(r409.texto) && /Stock disponible insuficiente\./.test(r409.texto), ok.tipo, /baja confirmada, movimiento MOV-9/.test(ok.texto), /ya estaba confirmada \(movimiento MOV-9\)/.test(rep.texto)],
        ["ERROR", true, "OK", true, true]);
      cierto("PRO354-R02-22 POST 409 + GET 200: la lectura exitosa solo limpia el error de CARGA y nunca toca el resultado de la confirmación",
        /setErrorListado\(""\);/.test(leerFn) && !/setResultado/.test(leerFn) && !/setError\(|setAviso\(/.test(pagina));
      cierto("PRO354-R02-23 estados separados y mostrados por separado: resultado (alert/status con «Cerrar») y error de carga del listado",
        /useState<ResultadoConfirmacion \| null>\(null\)/.test(pagina) && /const \[errorListado, setErrorListado\] = useState\(""\);/.test(pagina)
        && /\{resultado \? \(/.test(pagina) && /\{errorListado \? <p className=\{ui\.alertError\} role="alert"/.test(pagina) && /onClick=\{\(\) => setResultado\(null\)\}/.test(pagina));
      cierto("PRO354-R02-24 cambio de filtros durante el POST (éxito o error): el resultado se aplica igual, identificado por su factura; cambiar filtros no lo borra",
        !/setResultado/.test(cambiar) && /setResultado\(resultadoConfirmacion\(b, r\.ok, j\)\);/.test(pagina) && /setResultado\(resultadoConfirmacion\(b, false, \{ error:/.test(pagina));
      cierto("PRO354-R02-25 A→B→A con respuesta tardía: la lectura vieja se descarta por generación/clave antes de aplicar datos o errores de carga",
        enOrden(leerFn, "if (!contexto.current.vigente(ticket)) return;", "setDatos({ ...j, clave: ticket.clave });") && enOrden(leerFn, "} catch (e) {", "if (!contexto.current.vigente(ticket)) return;", "setErrorListado(e instanceof Error"));
      cierto("PRO354-R02-26 acciones bloqueadas mientras carga o confirma; iniciar otra confirmación reemplaza el resultado anterior; relectura con filtros vigentes",
        /if \(confirmando \|\| !vigentes \|\| cargando\) return;/.test(pagina) && /disabled=\{!c\.puede \|\| confirmando !== null \|\| cargando \|\| !vigentes\}/.test(pagina)
        && enOrden(pagina, "setConfirmando(b.id);", "setResultado(null);", "await fetch(`/api/stock/bajas-pendientes/${b.id}/confirmar`") && /void leer\(contexto\.current\.releer\(\)\);/.test(pagina));
    }
  }

  // ── N. PRO-354-R02-R03 — V001: verificar-NEX-081.sql inspecciona solo código EJECUTABLE y el ORDEN real (unidad base / lotes) ─────────────────
  {
    const verificar = leer("documentacao/banco/nexit/v1/scripts/verificar-NEX-081.sql");
    const nex081 = leer("documentacao/banco/nexit/v1/migraciones/NEX-081-facturacion-politica-stock-pendientes.sql");
    const cuerpoCrear = (() => { const i = nex081.indexOf("CREATE FUNCTION public.fe_documento_crear_fe_stock_pendiente("); const a = nex081.indexOf("$$", i) + 2; return i < 0 ? "" : nex081.slice(a, nex081.indexOf("$$", a)); })();
    // Emulación TS del limpiado del script (mismo orden: comentarios → literales) y de sus dos predicados.
    const ejecutable = (src: string) => src.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
    const sinTextos = (src: string) => ejecutable(src).replace(/'(?:[^']|'')*'/g, " ");
    const evaluar = (src: string) => {
      const ej = ejecutable(src);
      const st = sinTextos(src);
      const p = (s: string) => st.indexOf(s) + 1;
      const [lee, compara, lote1, llamada, candado, lote2, insert] = ["p.unidad_medida_id INTO v_pr", "IS DISTINCT FROM v_uni", "l.producto_id = v_prod", "fe_documento_crear_fe_receptor", "pg_advisory_xact_lock",
        "l.producto_id = r.producto_id", "INSERT INTO public.documento_electronico_stock_pendientes"].map(p);
      const unidad = /p\.unidad_medida_id INTO v_pr FROM public\.productos p WHERE p\.empresa_id = p_empresa AND p\.id = v_prod FOR SHARE/.test(st)
        && /IS DISTINCT FROM v_uni\s+THEN\s+RAISE EXCEPTION[^;]*'NEX:STOCK_PENDIENTE_UNIDAD_CAMBIO'/.test(ej) && /(^|[^a-z0-9_$])"?fe_documento_crear_fe_receptor"?\s*\(/i.test(st)
        && lee > 0 && lee < compara && compara < llamada;
      const lotes = /stock_lotes l WHERE l\.empresa_id = p_empresa AND l\.producto_id = v_prod\)\s+THEN\s+RAISE EXCEPTION[^;]*'NEX:STOCK_PENDIENTE_LOTE'/.test(ej)
        && /stock_lotes l WHERE l\.empresa_id = p_empresa AND l\.producto_id = r\.producto_id\)\s+THEN\s+RAISE EXCEPTION[^;]*'NEX:STOCK_PENDIENTE_LOTE'/.test(ej)
        && /pg_advisory_xact_lock\s*\(\s*hashtextextended\s*\(\s*'movimientos\.numero:'/.test(ej)
        && lote1 > 0 && lote1 < llamada && llamada < candado && candado < lote2 && lote2 < insert;
      return { unidad, lotes };
    };
    const muestras = new Map([...verificar.matchAll(/SELECT '(MUESTRA_[A-Z_]+)', E'((?:[^']|'')*)'/g)].map((m) => [m[1], m[2].replace(/''/g, "'").replace(/\\n/g, "\n")] as const));
    const m = (n: string) => evaluar(muestras.get(n) ?? "");
    // Para el SCRIPT completo: primero literales (sus patrones contienen «--»), luego comentarios.
    const filas = verificar.replace(/'(?:[^']|'')*'/g, " ").replace(/--[^\n]*/g, " ");

    cierto("PRO354-R02-R03-01 el falso negativo existía: el cuerpo REAL de crear nombra fe_documento_crear_fe_receptor en un COMENTARIO antes del marcador NEX:STOCK_PENDIENTE_UNIDAD_CAMBIO",
      cuerpoCrear.length > 1000 && cuerpoCrear.indexOf("fe_documento_crear_fe_receptor") < cuerpoCrear.indexOf("NEX:STOCK_PENDIENTE_UNIDAD_CAMBIO")
      && ejecutable(cuerpoCrear).indexOf("fe_documento_crear_fe_receptor") > ejecutable(cuerpoCrear).indexOf("NEX:STOCK_PENDIENTE_UNIDAD_CAMBIO"));
    igual("PRO354-R02-R03-02 sobre el código correcto de NEX-081 los dos controles de orden dan true (unidad base y lotes)", evaluar(cuerpoCrear), { unidad: true, lotes: true });
    igual("PRO354-R02-R03-03 detector: comentario que nombra la llamada ANTES del marcador = orden correcto (true/true)", m("MUESTRA_ORDEN_OK"), { unidad: true, lotes: true });
    igual("PRO354-R02-R03-04 detector: orden invertido (comparar la unidad DESPUÉS de reservar numeración) = false", m("MUESTRA_UNIDAD_TRAS_NUMERAR").unidad, false);
    igual("PRO354-R02-R03-05 detector: la comparación de unidad que solo aparece en un literal no cuenta", m("MUESTRA_UNIDAD_EN_LITERAL").unidad, false);
    igual("PRO354-R02-R03-06 detector: segunda comprobación de lotes solo comentada = false", m("MUESTRA_LOTE_SOLO_COMENTADO").lotes, false);
    igual("PRO354-R02-R03-07 detector: segunda comprobación de lotes antes del candado de numeración = false", m("MUESTRA_LOTE_ANTES_DEL_CANDADO").lotes, false);
    cierto("PRO354-R02-R03-08 el script ya no busca posiciones sobre pg_get_functiondef (texto con comentarios) ni cuenta apariciones de texto para lotes; limpia prosrc como verificar-NEX-080.sql",
      !/pg_get_functiondef/.test(filas) && !/regexp_matches/.test(filas) && /p\.prosrc/.test(verificar)
      && verificar.includes("regexp_replace(regexp_replace(src, '--[^\\n]*', ' ', 'g'), '/\\*.*?\\*/', ' ', 'g') AS codigo_ejecutable")
      && verificar.includes("regexp_replace(codigo_ejecutable, '''([^'']|'''')*''', ' ', 'g') AS codigo_sin_textos"));
    cierto("PRO354-R02-R03-09 las filas de unidad y lotes usan los predicados de orden sobre crear, y los detectores exigen ok = true para dar la verificación por buena",
      /EXISTS \(SELECT 1 FROM evaluacion WHERE nombre = 'crear' AND unidad_ok\)/.test(verificar) && /EXISTS \(SELECT 1 FROM evaluacion WHERE nombre = 'crear' AND lotes_ok\)/.test(verificar)
      && ["MUESTRA_ORDEN_OK' AND unidad_ok AND lotes_ok", "MUESTRA_UNIDAD_TRAS_NUMERAR' AND NOT unidad_ok", "MUESTRA_UNIDAD_EN_LITERAL' AND NOT unidad_ok", "MUESTRA_LOTE_SOLO_COMENTADO' AND NOT lotes_ok",
        "MUESTRA_LOTE_ANTES_DEL_CANDADO' AND NOT lotes_ok"].every((c) => verificar.includes(c)) && /funciones inspeccionadas presentes \(5\)/.test(verificar));
    cierto("PRO354-R02-R03-10 controles similares del mismo script también sobre código ejecutable: confirmación (sin inventario_costos, con v_doc.serie), candado, alcance histórico y preparación de la baja",
      /nombre = 'confirmar' AND strpos\(codigo_sin_textos, 'inventario_costos'\) = 0 AND strpos\(codigo_sin_textos, 'v_doc\.serie'\) > 0/.test(verificar)
      && /nombre = 'listar' AND codigo_sin_textos ~\* 'deposito_en_alcance/.test(verificar) && /nombre = 'filtros' AND codigo_sin_textos ~\* 'deposito_en_alcance/.test(verificar)
      && /nombre = 'confirmar' AND codigo_sin_textos ~\* 'usuario_puede_deposito/.test(verificar) && /nombre = 'baja' AND strpos\(codigo_sin_textos, 'fe_stock_pendientes_preparacion'\) > 0/.test(verificar));
    cierto("PRO354-R02-R03-11 no se quitaron controles ni se fuerza true: siguen tabla, CHECK, UNIQUE, triggers, columnas/FK, guardas, PK de salidas, CHECK de saldos, tablas vacías y grants",
      ["empresas.bloquear_stock_insuficiente boolean NOT NULL DEFAULT true", "TODAS las empresas quedan en TRUE", "con PK propia", "fe_stock_pend_cantidades_chk", "fe_stock_pend_documento_producto_uk", "fe_stock_pendientes_inmutable_trg",
        "fe_stock_pend_sucursal_fk", "fe_stock_pendientes_producto_guarda_trg", "fe_stock_pendientes_deposito_guarda_trg", "PK histórica de documento_electronico_stock_salidas", "stock_saldos_cant_chk",
        "tablas sin pendientes ni preparación al aplicar", "la aplicación NO accede a las tablas nuevas", "la aplicación NO ejecuta la baja interna", "las 6 funciones públicas de NEX-081", "PUBLIC no ejecuta las funciones nuevas",
        "la emisión de siempre (receptor)"].every((c) => verificar.includes(c)) && !/\bOR true\b|SELECT true\b/i.test(filas));
    cierto("PRO354-R02-R03-12 sigue siendo de SOLO LECTURA (BEGIN READ ONLY … ROLLBACK, sin escrituras ejecutables fuera de literales y comentarios)",
      /BEGIN READ ONLY;/.test(verificar) && /ROLLBACK;\s*$/.test(verificar) && !/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i.test(filas));
    cierto("PRO354-R02-R03-13 V001 no toca la migration ni código funcional: el cuerpo de crear conserva el orden aprobado en R02-R02",
      /IF v_pr\.unidad_medida_id IS DISTINCT FROM v_uni THEN/.test(cuerpoCrear) && /PERFORM pg_advisory_xact_lock\(hashtextextended\('movimientos\.numero:' \|\| p_empresa::text, 0\)\);/.test(cuerpoCrear));
  }

  // ── O. PRO-354-R02-R04 — rectificación: la venta ocurre al EMITIR; confirmación manual también con rechazo fiscal SIFEN definitivo ─────────────
  // Casos ESCRITOS, NO ejecutados. La elegibilidad se lee de la FUENTE real de NEX-081 (no aplicada): listado y confirmación deben usar la MISMA lista cerrada.
  // La «base simulada» de la confirmación reproduce el orden de fe_stock_pendiente_confirmar (permiso → candado/fila → alcance → CONFIRMADA idempotente → FE elegible →
  // lotes → motor con saldo suficiente) usando la lista de estados extraída del código ejecutable; no sustituye la validación en PostgreSQL del responsable.
  {
    const ruta = "documentacao/banco/nexit/v1/migraciones/NEX-081-facturacion-politica-stock-pendientes.sql";
    const fuente = existsSync(join(process.cwd(), ruta)) ? leer(ruta) : "";
    const cod = sinComSql(fuente);
    const tramo = (desde: string, hasta: string) => cod.slice(cod.indexOf(desde), cod.indexOf(hasta, cod.indexOf(desde) + desde.length));
    const confirmar = tramo("CREATE FUNCTION public.fe_stock_pendiente_confirmar", "COMMENT ON FUNCTION");
    const listar = tramo("CREATE FUNCTION public.fe_stock_pendientes_listar", "CREATE FUNCTION public.fe_stock_pendientes_filtros");
    const verificar = leer("documentacao/banco/nexit/v1/scripts/verificar-NEX-081.sql");
    const lista = (m: RegExpMatchArray | null) => (m ? [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]) : []);
    const listaConfirmar = lista(confirmar.match(/v_doc\.estado_local IS DISTINCT FROM 'ENVIADO' OR v_doc\.estado_sifen NOT IN \(([^)]*)\) THEN/));
    const listaListar = lista(listar.match(/\(d\.estado_local = 'ENVIADO' AND d\.estado_sifen IN \(([^)]*)\)\),/));
    const elegibleConfirmar = (local: string, sifen: string) => local === "ENVIADO" && listaConfirmar.includes(sifen);
    const elegibleListar = (local: string, sifen: string) => local === "ENVIADO" && listaListar.includes(sifen);
    const ESTADOS_LOCALES = ["PENDIENTE_ENVIO", "ENVIANDO", "ENVIADO", "ERROR_ENVIO", "ENVIO_INDETERMINADO"];
    const ESTADOS_SIFEN = ["SIN_CONSULTA", "PENDIENTE", "APROBADO", "RECHAZADO", "CANCELADO", "INUTILIZADO", "NO_RECONOCIDO"];

    // Base simulada de la confirmación (una empresa, un depósito). Saldo en diezmilésimas (decimal exacto, sin float).
    type Doc = { estadoLocal: string; estadoSifen: string };
    const simular = (o: { doc: Doc; saldo: string; pendiente: string; permiso?: boolean; alcance?: boolean; conLote?: boolean; empresaPendiente?: string }) => {
      const dz = (x: string) => BigInt(x.replace(".", "").padEnd(x.includes(".") ? x.length - 1 : x.length + 4, "0"));
      const st = { saldo: dz(o.saldo), estado: "PENDIENTE" as "PENDIENTE" | "CONFIRMADA", movimientos: [] as string[], doc: { ...o.doc } };
      const confirmarSim = (empresa: string): { ok: true; repetido: boolean; movimiento: string } | { ok: false; error: { code?: string; detail?: string; message?: string } } => {
        if (o.permiso === false) return { ok: false, error: { code: "42501" } };
        if (empresa !== (o.empresaPendiente ?? EMPRESA)) return { ok: false, error: { detail: "NEX:PENDIENTE_NO_ENCONTRADO" } };
        if (o.alcance === false) return { ok: false, error: { code: "42501" } };
        if (st.estado === "CONFIRMADA") return { ok: true, repetido: true, movimiento: st.movimientos[0] };
        if (!elegibleConfirmar(st.doc.estadoLocal, st.doc.estadoSifen)) return { ok: false, error: { detail: "NEX:PENDIENTE_FE_NO_CONFIRMABLE", message: "no confirmable" } };
        if (o.conLote) return { ok: false, error: { detail: "NEX:STOCK_PENDIENTE_LOTE", message: "lote" } };
        const req = dz(o.pendiente);
        if (st.saldo < req) return { ok: false, error: { detail: "NEX:STOCK_INSUFICIENTE", message: "saldo disponible insuficiente" } };
        st.saldo -= req;
        st.estado = "CONFIRMADA";
        st.movimientos.push("FE-STOCK-PEND:f0f0f0f0");

        return { ok: true, repetido: false, movimiento: st.movimientos[0] };
      };
      // Una respuesta fiscal solo cambia el estado del documento: la simulación no tiene (igual que la base) ningún camino de stock desde la consulta.
      const respuestaFiscal = (sifen: string) => { st.doc = { estadoLocal: "ENVIADO", estadoSifen: sifen }; };
      const saldo = () => { const s = st.saldo.toString().padStart(5, "0"); return `${s.slice(0, -4)}.${s.slice(-4)}`; };

      return { confirmarSim, respuestaFiscal, saldo, st };
    };
    const RECHAZADA: Doc = { estadoLocal: "ENVIADO", estadoSifen: "RECHAZADO" };

    igual("PRO354-R02-R04-01 fuente: la confirmación admite exactamente SIN_CONSULTA/PENDIENTE/APROBADO/RECHAZADO con recepción ENVIADA (lista cerrada)", listaConfirmar, ["SIN_CONSULTA", "PENDIENTE", "APROBADO", "RECHAZADO"]);
    igual("PRO354-R02-R04-02 fuente: el listado (o_fe_confirmable) usa la MISMA lista que la confirmación", listaListar, listaConfirmar);
    igual("PRO354-R02-R04-03 matriz completa local × SIFEN: confirmación y listado coinciden en las 35 combinaciones",
      ESTADOS_LOCALES.flatMap((l) => ESTADOS_SIFEN.map((s) => elegibleConfirmar(l, s) === elegibleListar(l, s))).every(Boolean), true);
    igual("PRO354-R02-R04-04 rechazo fiscal SIFEN definitivo (ENVIADO + RECHAZADO): confirmable", elegibleConfirmar("ENVIADO", "RECHAZADO"), true);
    igual("PRO354-R02-R04-05 errores técnicos de transmisión y envíos sin recepción confirmada siguen bloqueados (ERROR_ENVIO, ENVIO_INDETERMINADO, ENVIANDO, PENDIENTE_ENVIO)",
      ["ERROR_ENVIO", "ENVIO_INDETERMINADO", "ENVIANDO", "PENDIENTE_ENVIO"].map((l) => elegibleConfirmar(l, "SIN_CONSULTA")), [false, false, false, false]);
    igual("PRO354-R02-R04-06 CANCELADO, INUTILIZADO y NO_RECONOCIDO siguen bloqueados (no se habilitan otros estados)",
      ["CANCELADO", "INUTILIZADO", "NO_RECONOCIDO"].map((s) => elegibleConfirmar("ENVIADO", s)), [false, false, false]);
    igual("PRO354-R02-R04-07 sin regresión: SIN_CONSULTA, PENDIENTE y APROBADO siguen confirmables", ["SIN_CONSULTA", "PENDIENTE", "APROBADO"].map((s) => elegibleConfirmar("ENVIADO", s)), [true, true, true]);
    {
      // Escenario del plan: FE de 15 emitida con 10 disponibles (salida 10 al emitir, pendiente 5), rechazo fiscal definitivo, entrada de 8, confirmación manual de 5 → saldo 3.
      const b = simular({ doc: { estadoLocal: "ENVIADO", estadoSifen: "SIN_CONSULTA" }, saldo: "0.0000", pendiente: "5.0000" });
      b.respuestaFiscal("RECHAZADO");
      const trasRechazo = b.saldo();
      const sinEntrada = b.confirmarSim(EMPRESA);
      b.st.saldo += 80000n; // entrada de 8 (motor ordinario, fuera de la FE)
      const r = b.confirmarSim(EMPRESA);
      igual("PRO354-R02-R04-08 FE 10/15 rechazada: el rechazo no mueve stock (saldo sigue 0), sin entrada no confirma (NEX:STOCK_INSUFICIENTE, sin saldo negativo); entrada 8 → confirma 5 → saldo 3",
        [trasRechazo, sinEntrada.ok ? null : sinEntrada.error.detail, r.ok && !r.repetido, b.saldo(), b.st.movimientos.length], ["0.0000", "NEX:STOCK_INSUFICIENTE", true, "3.0000", 1]);
      const otra = b.confirmarSim(EMPRESA);
      igual("PRO354-R02-R04-09 doble confirmación: devuelve el MISMO movimiento (repetido) y no duplica la salida (saldo 3, un movimiento)", [otra.ok && otra.repetido, otra.ok ? otra.movimiento : null, b.saldo(), b.st.movimientos.length], [true, "FE-STOCK-PEND:f0f0f0f0", "3.0000", 1]);
      b.respuestaFiscal("RECHAZADO");
      igual("PRO354-R02-R04-10 una respuesta fiscal posterior (repetida) no devuelve ni duplica stock", [b.saldo(), b.st.movimientos.length, b.st.estado], ["3.0000", 1, "CONFIRMADA"]);
    }
    {
      const sinPermiso = simular({ doc: RECHAZADA, saldo: "8.0000", pendiente: "5.0000", permiso: false });
      const sinAlcance = simular({ doc: RECHAZADA, saldo: "8.0000", pendiente: "5.0000", alcance: false });
      const otraEmpresa = simular({ doc: RECHAZADA, saldo: "8.0000", pendiente: "5.0000", empresaPendiente: OTRA_EMPRESA });
      const sinSaldo = simular({ doc: RECHAZADA, saldo: "4.9999", pendiente: "5.0000" });
      const conLote = simular({ doc: RECHAZADA, saldo: "8.0000", pendiente: "5.0000", conLote: true });
      const res = [sinPermiso, sinAlcance, otraEmpresa, sinSaldo, conLote].map((s) => s.confirmarSim(EMPRESA));
      igual("PRO354-R02-R04-11 FE rechazada sigue exigiendo permiso, alcance, misma empresa, saldo suficiente (4,9999 < 5) y producto sin lotes; ninguno escribe",
        [res.map((r) => (r.ok ? "OK" : (r.error.detail ?? r.error.code))), [sinPermiso, sinAlcance, otraEmpresa, sinSaldo, conLote].map((s) => [s.saldo(), s.st.movimientos.length])],
        [["42501", "42501", "NEX:PENDIENTE_NO_ENCONTRADO", "NEX:STOCK_INSUFICIENTE", "NEX:STOCK_PENDIENTE_LOTE"], [["8.0000", 0], ["8.0000", 0], ["8.0000", 0], ["4.9999", 0], ["8.0000", 0]]]);
      igual("PRO354-R02-R04-12 errores mapeados por la API sin cambios: 403 permiso/alcance, 404 otra empresa, 409 saldo/FE no confirmable/lote",
        res.map((r) => (r.ok ? 200 : errorBajaPendiente(r.error).status)).concat(errorBajaPendiente({ detail: "NEX:PENDIENTE_FE_NO_CONFIRMABLE" }).status), [403, 403, 404, 409, 409, 409]);
    }
    {
      const casos: Array<[string, Doc]> = [["error técnico", { estadoLocal: "ERROR_ENVIO", estadoSifen: "SIN_CONSULTA" }], ["indeterminado", { estadoLocal: "ENVIO_INDETERMINADO", estadoSifen: "SIN_CONSULTA" }],
        ["cancelado", { estadoLocal: "ENVIADO", estadoSifen: "CANCELADO" }], ["inutilizado", { estadoLocal: "ENVIADO", estadoSifen: "INUTILIZADO" }], ["no reconocido", { estadoLocal: "ENVIADO", estadoSifen: "NO_RECONOCIDO" }]];
      igual("PRO354-R02-R04-13 con saldo suficiente, error técnico / indeterminado / cancelado / inutilizado / no reconocido: 409 NEX:PENDIENTE_FE_NO_CONFIRMABLE sin movimiento",
        casos.map(([, d]) => { const s = simular({ doc: d, saldo: "8.0000", pendiente: "5.0000" }); const r = s.confirmarSim(EMPRESA); return [r.ok ? "OK" : r.error.detail, s.saldo()]; }),
        casos.map(() => ["NEX:PENDIENTE_FE_NO_CONFIRMABLE", "8.0000"]));
    }
    igual("PRO354-R02-R04-14 pantalla: FE rechazada (feConfirmable true del listado) con saldo suficiente ofrece «Confirmar baja»; sin saldo, lote o permiso no",
      [puedeIntentarConfirmar(baja({ estadoSifen: "RECHAZADO", saldoRegistrado: "8.0000", saldoProyectado: "3.0000" }), true).puede, puedeIntentarConfirmar(baja({ estadoSifen: "RECHAZADO" }), true).puede,
        puedeIntentarConfirmar(baja({ estadoSifen: "RECHAZADO", saldoRegistrado: "8", conLote: true }), true).puede, puedeIntentarConfirmar(baja({ estadoSifen: "RECHAZADO", saldoRegistrado: "8" }), false).puede],
      [true, false, false, false]);
    igual("PRO354-R02-R04-15 pantalla: el motivo de FE no confirmable ya no dice «rechazada» y nombra el error técnico/indeterminado, cancelada, inutilizada o no reconocida",
      ((t: string) => [/rechazada/i.test(t), /error técnico/.test(t), /indeterminado/.test(t), /cancelada/.test(t), /inutilizada/.test(t), /no reconocida/.test(t)])(puedeIntentarConfirmar(baja({ saldoRegistrado: "8", feConfirmable: false }), true).motivo),
      [false, true, true, true, true, true]);
    cierto("PRO354-R02-R04-16 mensaje SQL distingue error técnico de transmisión de rechazo fiscal y conserva NEX:PENDIENTE_FE_NO_CONFIRMABLE (409)",
      /RAISE EXCEPTION 'la factura no tiene la recepción confirmada por el gateway \(no enviada, con error técnico de transmisión o envío indeterminado\) o fue cancelada, inutilizada o no reconocida: la baja pendiente no se puede confirmar'\s+USING ERRCODE = 'P0001', DETAIL = 'NEX:PENDIENTE_FE_NO_CONFIRMABLE'/.test(confirmar)
      && !/fue rechazada/.test(confirmar));
    cierto("PRO354-R02-R04-17 los demás controles de la confirmación siguen en su orden (permiso → candado → FOR UPDATE → alcance → CONFIRMADA → FE FOR SHARE → depósito/producto → motor)",
      ["'MOVIMIENTOS', 'CREAR'", "pg_advisory_xact_lock", "FOR UPDATE", "usuario_puede_deposito(p_empresa, p_usuario, v_p.deposito_id)", "v_p.estado = 'CONFIRMADA'", "FROM public.documentos_electronicos WHERE empresa_id = p_empresa AND id = v_p.documento_id FOR SHARE",
        "FROM public.depositos d WHERE d.empresa_id = p_empresa AND d.id = v_p.deposito_id FOR SHARE", "inventario_registrar_movimiento(p_empresa, p_usuario, 'SALIDA', 'VENTA'"]
        .map((c) => confirmar.indexOf(c)).every((p, i, a) => p > 0 && (i === 0 || p > a[i - 1])));
    cierto("PRO354-R02-R04-18 la baja física sigue en la EMISIÓN: crear sigue llamando a la emisión vigente y la baja redefinida (NEX-067) no mira estado_sifen",
      /FROM public\.fe_documento_crear_fe_receptor\(p_empresa/.test(tramo("CREATE FUNCTION public.fe_documento_crear_fe_stock_pendiente", "CREATE FUNCTION public.fe_stock_pendientes_listar"))
      && !/estado_sifen/.test(tramo("CREATE OR REPLACE FUNCTION public.fe_stock_baja_documento", "CREATE FUNCTION public.fe_politica_stock_actualizar")));
    {
      // Ninguna respuesta fiscal mueve stock: los registros de envío/consulta versionados (NEX-047..080) no referencian stock en código ejecutable.
      const dir = "documentacao/banco/nexit/v1/migraciones";
      const migs = ["NEX-047-facturacion-documentos-electronicos.sql", "NEX-049-facturacion-envio-fe.sql", "NEX-050-facturacion-envio-control.sql", "NEX-054-facturacion-consulta-estado-final.sql",
        "NEX-062-facturacion-nce-v1.sql", "NEX-077-facturacion-consulta-automatica-lease.sql", "NEX-079-facturacion-intentos-conexion-cdc-consulta.sql", "NEX-080-facturacion-cdc-dato-api.sql"];
      const cuerpos = migs.filter((f) => existsSync(join(process.cwd(), `${dir}/${f}`))).flatMap((f) => {
        const s = sinComSql(leer(`${dir}/${f}`));

        return [...s.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.(fe_documento_registrar_(?:consulta|envio)\w*)\(/g)].map((m) => s.slice(m.index, s.indexOf("$$;", m.index)));
      });
      cierto("PRO354-R02-R04-19 ninguna respuesta fiscal mueve stock: las funciones de registro de envío/consulta no tocan motor, saldos, movimientos, baja ni pendientes",
        cuerpos.length >= 10 && cuerpos.every((c) => !/inventario_registrar_movimiento|inventario_anular_movimiento|stock_saldos|movimientos_inventario|fe_stock_baja_documento|documento_electronico_stock_pendientes|fe_stock_pendiente_confirmar/.test(c)));
    }
    cierto("PRO354-R02-R04-20 NEX-081 no libera faltantes automáticamente: solo fe_stock_pendiente_confirmar actualiza a CONFIRMADA (manual, MOVIMIENTOS.CREAR)",
      (cod.match(/estado = 'CONFIRMADA'/g) ?? []).length >= 1 && (cod.match(/UPDATE public\.documento_electronico_stock_pendientes/g) ?? []).length === 1
      && confirmar.includes("UPDATE public.documento_electronico_stock_pendientes"));
    cierto("PRO354-R02-R04-21 política TRUE intacta: la emisión de siempre (receptor) sigue sin pendientes y la columna sigue NOT NULL DEFAULT true",
      /ALTER TABLE public\.empresas ADD COLUMN bloquear_stock_insuficiente boolean NOT NULL DEFAULT true;/.test(cod) && /v_bloquear IS DISTINCT FROM false OR p_bloquear_revisado IS DISTINCT FROM false/.test(cod));
    cierto("PRO354-R02-R04-22 sin saldo negativo ni cambios de costo: CHECK de saldos e inventario_costos sin tocar",
      !/ALTER TABLE public\.stock_saldos|stock_saldos_cant_chk|ALTER TABLE public\.inventario_costos|UPDATE public\.stock_saldos/.test(cod));
    cierto("PRO354-R02-R04-23 verificador: elegibilidad exacta en confirmar y listar + detectores (R04 ok = true; sin RECHAZADO, ampliada con CANCELADO y comentada = false) + control «ninguna respuesta fiscal mueve stock»",
      ["MUESTRA_ELEG_R04_OK' AND elegibilidad_confirmar_ok", "MUESTRA_ELEG_SIN_RECHAZADO' AND NOT elegibilidad_confirmar_ok", "MUESTRA_ELEG_AMPLIADA' AND NOT elegibilidad_confirmar_ok",
        "MUESTRA_ELEG_COMENTADA' AND NOT elegibilidad_confirmar_ok", "nombre = 'confirmar' AND elegibilidad_confirmar_ok", "nombre = 'listar' AND elegibilidad_listar_ok", "ninguna respuesta fiscal mueve stock"].every((c) => verificar.includes(c))
      && /BEGIN READ ONLY;/.test(verificar) && /ROLLBACK;\s*$/.test(verificar));
    {
      // Emulación TS de los detectores del script: lista extraída de cada muestra (comentarios fuera) y comparada con la de R04.
      const muestras = new Map([...verificar.matchAll(/SELECT '(MUESTRA_ELEG_[A-Z0-9_]+)', E'((?:[^']|'')*)'/g)].map((m) => [m[1], m[2].replace(/''/g, "'").replace(/\\n/g, "\n")] as const));
      const ok = (n: string) => lista((muestras.get(n) ?? "").replace(/--[^\n]*/g, " ").match(/v_doc\.estado_local IS DISTINCT FROM 'ENVIADO' OR v_doc\.estado_sifen NOT IN \(([^)]*)\)\s+THEN\s+RAISE EXCEPTION[^;]*'NEX:PENDIENTE_FE_NO_CONFIRMABLE'/))
        .join(",") === "SIN_CONSULTA,PENDIENTE,APROBADO,RECHAZADO";
      igual("PRO354-R02-R04-24 detectores del verificador evaluados: R04 ok, sin RECHAZADO, ampliada y comentada", ["MUESTRA_ELEG_R04_OK", "MUESTRA_ELEG_SIN_RECHAZADO", "MUESTRA_ELEG_AMPLIADA", "MUESTRA_ELEG_COMENTADA"].map(ok), [true, false, false, false]);
    }
    cierto("PRO354-R02-R04-25 preflight y reversión no contienen el predicado (no requieren cambios); NEX-067/NEX-080 sin editar",
      !/estado_sifen/.test(leer("documentacao/banco/nexit/v1/scripts/preflight-NEX-081.sql")) && !/estado_sifen/.test(leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-081.sql"))
      && !/fe_stock_pendientes_preparacion/.test(leer("documentacao/banco/nexit/v1/migraciones/NEX-067-facturacion-stock-baja-fe.sql")) && !/bloquear_stock_insuficiente/.test(leer("documentacao/banco/nexit/v1/migraciones/NEX-080-facturacion-cdc-dato-api.sql")));
  }

  igual("PRO354-78 casos de la matriz R01 que dependen del gate contable: listados como PENDIENTES POR GATE (no simulados; R02-R04: PRO-310 cancelada sale de la lista, D6 queda solo CANCELADO/INUTILIZADO)", CASOS_PENDIENTES_POR_GATE.length, 6);

  return fallos;
}
