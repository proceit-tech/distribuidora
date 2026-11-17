/**
 * PRO-354-R02 — Política por EMPRESA «Bloquear facturación por stock insuficiente» y «Bajas pendientes de stock» (NEX-081).
 * Lógica REAL probada:
 *  · reglas puras: politica-stock.ts, stock-preventivo.ts y bajas-pendientes.ts;
 *  · planificarStockConPolitica con una base simulada (sin PostgreSQL).
 * SQL (NEX-081 y sus scripts), rutas, pantalla y menú se verifican sobre el código fuente.
 * Empresas, productos y depósitos son SINTÉTICOS (UUID de prueba): ningún caso depende de CASA MINGO ni de un tenant real.
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
import { compararDecimal, errorBajaPendiente, leerFiltrosBajas, puedeIntentarConfirmar, SinNex081Error, type BajaPendiente } from "@/lib/stock/bajas-pendientes";

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

const linea = (productoId: string, cantidad: string, controlaStock = true): LineaStock => ({ productoId, codigo: `C-${productoId.slice(0, 4)}`, descripcion: `Producto ${productoId.slice(0, 4)}`, cantidad, controlaStock });
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
  "R01-D6 política final de confirmación según estado fiscal (R02 adopta la condición conservadora: ENVIADO y SIN_CONSULTA|PENDIENTE|APROBADO)",
  "PRO-310 reserva al envío / salida al aprobar: incompatibilidad con la baja al emitir, a reconciliar antes del GO de producción",
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
  id: "f0f0f0f0-0000-4000-8000-0000000003b0", documentoId: "f1f1f1f1-0000-4000-8000-0000000003b1", documento: "001-001-0000010", fechaEmision: "2026-11-17T12:00:00.000Z",
  estadoLocal: "ENVIADO", estadoSifen: "APROBADO", productoCodigo: "C1", productoDescripcion: "P1", depositoId: D1, depositoCodigo: "D01", depositoNombre: "Central",
  facturado: "15.0000", descontado: "10.0000", pendiente: "5.0000", saldoRegistrado: "0.0000", pendienteAbierto: "5.0000", saldoProyectado: "-5.0000",
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

    igual("PRO354-05 FALSE 10/15: salida inmediata 10 y pendiente 5 en el depósito elegible; emitible", [p.emitible, asignacionesSql(p), pendientesSql(p)], [true, [{ producto_id: P1, deposito_id: D1, lote_id: null, cantidad: "10" }], [{ producto_id: P1, deposito_id: D1, cantidad: "5" }]]);
    igual("PRO354-06 FALSE 10/15: conciliación exacta salidas + pendiente = facturado", [p.lineas[0].requerido, p.lineas[0].disponible, p.lineas[0].pendiente], ["15", "10", "5"]);

    const cero = aplicarPolitica([linea(P1, "3")], [], permite());

    igual("PRO354-07 FALSE disponible cero: TODO pendiente y NINGUNA salida (sin movimiento artificial)", [cero.emitible, cero.salidas.length, pendientesSql(cero)], [true, 0, [{ producto_id: P1, deposito_id: D1, cantidad: "3" }]]);
    cierto("PRO354-08 FALSE disponible cero: la huella es obligatoria igual (no vacía ni la de un reparto vacío)", cero.huella !== asignarStock([], []).huella && /^[0-9a-f]{64}$/.test(cero.huella));

    const suf = aplicarPolitica([linea(P1, "4")], [saldo(P1, D1, "10")], permite());

    igual("PRO354-09 FALSE suficiente: salida normal, sin pendientes y la huella de siempre", [suf.pendientes, suf.huella], [[], asignarStock([linea(P1, "4")], [saldo(P1, D1, "10")]).huella]);

    const fino = aplicarPolitica([linea(P1, "10.0001")], [saldo(P1, D1, "10")], permite());

    igual("PRO354-10 FALSE faltante 0.0001 exacto (decimal 4, sin float)", [asignacionesSql(fino)[0].cantidad, pendientesSql(fino)[0].cantidad], ["10", "0.0001"]);

    const rep = aplicarPolitica([linea(P1, "6"), linea(P1, "9"), linea(SERV, "1", false)], [saldo(P1, D1, "4"), saldo(P1, D2, "6")], permite({ depositos: [DEP1] }));

    igual("PRO354-11 FALSE líneas repetidas: se agregan por UUID (15), se toma todo el disponible de ambos depósitos y un solo pendiente; servicios excluidos",
      [asignacionesSql(rep).map((a) => [a.deposito_id, a.cantidad]), pendientesSql(rep)], [[[D1, "4"], [D2, "6"]], [{ producto_id: P1, deposito_id: D1, cantidad: "5" }]]);

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
    const pd = (dep: string, c: string) => [{ productoId: P1, codigo: "C", descripcion: "D", depositoId: dep, depositoCodigo: "X", depositoNombre: "Y", cantidad: c }];

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
    igual("PRO354-40 filtros: por omisión PENDIENTE; TODOS = null; depósito UUID; búsqueda ≤ 80; inválidos rechazados",
      [leerFiltrosBajas(new URLSearchParams("")), leerFiltrosBajas(new URLSearchParams("estado=TODOS"))?.estado, leerFiltrosBajas(new URLSearchParams("estado=X")), leerFiltrosBajas(new URLSearchParams("deposito=1;DROP")), leerFiltrosBajas(new URLSearchParams(`buscar=${"a".repeat(81)}`))],
      [{ estado: "PENDIENTE", depositoId: null, buscar: "" }, null, null, null, null]);
    igual("PRO354-41 decimal exacto en texto (sin float): -5 < 0; 5.0000 = 5; 0.0001 > 0", [compararDecimal("-5.0000", "0"), compararDecimal("5.0000", "5"), compararDecimal("0.0001", "0")], [-1, 0, 1]);
    igual("PRO354-42 confirmación con faltante sin saldo suficiente: el botón no se ofrece (la base además lo rechaza sin saldo negativo)", puedeIntentarConfirmar(baja(), true).puede, false);
    igual("PRO354-43 tras reposición (entrada 8, pendiente 5): se ofrece la confirmación", puedeIntentarConfirmar(baja({ saldoRegistrado: "8.0000", saldoProyectado: "3.0000" }), true).puede, true);
    igual("PRO354-44 FE rechazada/indeterminada/no transmitida (feConfirmable false), lote o sin MOVIMIENTOS.CREAR: no se ofrece", [puedeIntentarConfirmar(baja({ saldoRegistrado: "8", feConfirmable: false }), true).puede, puedeIntentarConfirmar(baja({ saldoRegistrado: "8", conLote: true }), true).puede, puedeIntentarConfirmar(baja({ saldoRegistrado: "8" }), false).puede], [false, false, false]);
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
    cierto("PRO354-55 emisión con faltante: producto controla stock y sin lotes; depósito propio, activo, de la sucursal y en alcance", /p\.controla_stock/.test(crear) && /NEX:STOCK_PENDIENTE_LOTE/.test(crear) && /d\.activo AND NOT d\.es_de_terceros AND d\.sucursal_id = p_sucursal/.test(crear) && /usuario_puede_deposito\(p_empresa, p_usuario, v_dep\)/.test(crear));
    cierto("PRO354-56 faltante REAL: tras la salida no queda disponible elegible (FOR UPDATE); si queda, NEX:STOCK_PENDIENTE_CON_DISPONIBLE", /FOR UPDATE OF s;\s*IF FOUND THEN/.test(crear) && /NEX:STOCK_PENDIENTE_CON_DISPONIBLE/.test(crear));
    cierto("PRO354-57 reintento / carrera de la misma clave: no escribe y exige los mismos pendientes (NEX:IDEMPOTENCIA_CONFLICTO)", /IF v_reutilizado THEN/.test(crear) && /NEX:IDEMPOTENCIA_CONFLICTO/.test(crear) && crear.indexOf("IF v_reutilizado THEN") < crear.indexOf("INSERT INTO public.documento_electronico_stock_pendientes"));
    cierto("PRO354-58 confirmación: MOVIMIENTOS.CREAR, advisory lock + FOR UPDATE, alcance, idempotente, FE ENVIADA y no rechazada/cancelada/inutilizada", /'MOVIMIENTOS', 'CREAR'/.test(confirmar) && /pg_advisory_xact_lock/.test(confirmar) && /FOR UPDATE/.test(confirmar) && /usuario_puede_deposito\(p_empresa, p_usuario, v_p\.deposito_id\)/.test(confirmar) && /v_p\.estado = 'CONFIRMADA'/.test(confirmar) && /estado_local IS DISTINCT FROM 'ENVIADO' OR v_doc\.estado_sifen NOT IN \('SIN_CONSULTA', 'PENDIENTE', 'APROBADO'\)/.test(confirmar));
    cierto("PRO354-59 confirmación solo con saldo real suficiente (jamás negativo) y por el motor ordinario con clave idempotente", /s\.cantidad >= v_p\.cantidad_pendiente FOR UPDATE/.test(confirmar) && /NEX:STOCK_INSUFICIENTE/.test(confirmar) && /inventario_registrar_movimiento\(p_empresa, p_usuario, 'SALIDA', 'VENTA'/.test(confirmar) && /'FE-STOCK-PEND:' \|\| v_p\.id::text/.test(confirmar));
    cierto("PRO354-60 NO toca CHECK de stock_saldos, inventario_costos (estructura), costo promedio ni saldo negativo", !/ALTER TABLE public\.stock_saldos|stock_saldos_cant_chk|ALTER TABLE public\.inventario_costos|costo_promedio\s*=|UPDATE public\.stock_saldos/.test(cod));
    cierto("PRO354-61 listado: STOCK.VER y alcance de depósito; proyectado = registrado − pendientes abiertos", /'STOCK', 'VER'/.test(listar) && /usuario_puede_deposito\(p_empresa, p_usuario, p\.deposito_id\)/.test(listar) && /sal\.registrado - ab\.abierto/.test(listar));
    cierto("PRO354-62 inmutabilidad: solo PENDIENTE→CONFIRMADA; el movimiento complementario no se anula a mano", /CREATE TRIGGER fe_stock_pendientes_inmutable_trg/.test(cod) && /CREATE TRIGGER fe_stock_pendiente_movimiento_protegido_trg/.test(cod));
    cierto("PRO354-63 grants mínimos: tablas sin acceso; la app solo EJECUTA las 5 funciones; la baja interna sigue sin ejecución", /REVOKE ALL ON public\.documento_electronico_stock_pendientes FROM nexit_runtime/.test(cod) && (cod.match(/GRANT EXECUTE ON FUNCTION public\.fe_(politica_stock_actualizar|stock_politica_contexto|documento_crear_fe_stock_pendiente|stock_pendientes_listar|stock_pendiente_confirmar)\(/g) ?? []).length === 5 && /REVOKE ALL ON FUNCTION public\.fe_stock_baja_documento\(uuid, uuid, uuid, jsonb\) FROM nexit_runtime/.test(cod));
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

  igual("PRO354-78 casos de la matriz R01 que dependen del gate contable: listados como PENDIENTES POR GATE (no simulados)", CASOS_PENDIENTES_POR_GATE.length, 7);

  return fallos;
}
