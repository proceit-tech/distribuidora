/**
 * Stock (vista por depósito, ubicación, alcance), Reposición (política de cálculo) y contrato Movimientos ↔ documentos (Etapa C).
 * Sin base de datos: cálculos puros, conexión simulada y análisis del código y de las migraciones.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import {
  advertenciaSaldo, aplicarTipo, enlaceNuevoMovimiento, formularioInicial, movimientoSucio, ORDEN_TIPOS, precargarDesdeConsulta, saldoVisible, TIPOS_INFO, validarMovimiento,
} from "@/lib/movimientos/formulario";
import { claveEfectoFisico, decidirEfecto, planEstorno, validarLinea, type ContextoDocumento } from "@/lib/movimientos/documentos";
import { calcularPlanReposicion, calcularReposicion, compararUrgencia, transferenciasPlanificadas, type EntradaReposicion } from "@/lib/reposicion/calculo";
import { formularioDepositoSucio, validarDeposito } from "@/lib/depositos/validacion";
import { listarDepositos, listarEventosAcceso, listarUsuariosDeposito, respuestaErrorDeposito } from "@/lib/depositos/shared";
import { construirConsultas, leerHistorial, leerLineasMovimiento, movimientoExiste, normalizarConsulta } from "@/lib/movimientos/historial";
import { mensajeMotivoObligatorio, motivoObligatorio, ORIGENES_POR_TIPO } from "@/lib/movimientos/reglas";
import { prepararMovimiento, resolverLote } from "@/lib/movimientos/shared";
import { navegacionInternaAbandona } from "@/lib/ui/proteger-cambios";
import { leerEntradasReposicion } from "@/lib/reposicion/datos";
import { leerStock } from "@/lib/stock/shared";
import { clasificarNivel, resumenStock, vistaPorDeposito } from "@/lib/stock/vista";
import type { CatalogoMovimientos, NuevoMovimientoStock } from "@/types/movimientos-stock";
import type { StockItem } from "@/types/stock";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const USUARIO = "99999999-9999-4999-8999-999999999999";
const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const D1 = "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1";
const D2 = "d2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2";
const D3 = "d3d3d3d3-d3d3-4d3d-8d3d-d3d3d3d3d3d3";

export async function verificarCasosStockReposicionMovimientos(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── Stock: nivel y vista por depósito
  igual("nivel: sin stock, bajo, sobrestock y normal", [clasificarNivel({ disponible: 0, totalFisico: 0, minimo: 5, maximo: 0 }), clasificarNivel({ disponible: 3, totalFisico: 3, minimo: 5, maximo: 0 }), clasificarNivel({ disponible: 50, totalFisico: 60, minimo: 5, maximo: 55 }), clasificarNivel({ disponible: 10, totalFisico: 10, minimo: 5, maximo: 55 })], ["SIN_STOCK", "BAJO", "SOBRESTOCK", "NORMAL"]);
  igual("sin parámetros nunca es bajo ni sobrestock", clasificarNivel({ disponible: 1, totalFisico: 999, minimo: 0, maximo: 0 }), "NORMAL");

  const dep = (id: string, nombre: string, extra: Record<string, unknown>) => ({
    id, depositoId: id, depositoCodigo: nombre.slice(0, 3).toUpperCase(), depositoNombre: nombre, ubicacion: "",
    disponible: 0, reservado: 0, cuarentena: 0, transito: 0, totalFisico: 0, terceros: 0, costoCantidad: 0, costoValor: 0,
    stockMinimo: null, stockMaximo: null, puntoReposicion: null, cantidadReposicion: null, ...extra,
  });
  const item = {
    id: P1, productoId: P1, productoCodigo: "P-1", productoDescripcion: "Leche", disponible: 150, reservado: 20, cuarentena: 5, transito: 10, totalFisico: 175, totalVirtual: 185,
    terceros: 7, propiedad: "PROPIO", nivel: "NORMAL", stockMinimo: 100, stockMaximo: 400, puntoReposicion: 120, costoPromedio: 1000, valorInventario: 150000,
    precioVentaReferencia: 2000, valorVentaReferencia: 300000, depositos: [
      dep(D1, "Central", { disponible: 100, reservado: 20, cuarentena: 0, transito: 0, totalFisico: 120, costoCantidad: 100, costoValor: 90000, stockMinimo: 150, stockMaximo: 500 }),
      dep(D2, "Sucursal", { disponible: 50, reservado: 0, cuarentena: 5, transito: 10, totalFisico: 55, terceros: 7, costoCantidad: 50, costoValor: 60000 }),
    ],
    lotes: [{ id: "l1", lote: "A", fechaVencimiento: "", cantidad: 100, estado: "DISPONIBLE", depositoId: D1, ubicacion: "Central", propietario: "X" }, { id: "l2", lote: "B", fechaVencimiento: "", cantidad: 50, estado: "DISPONIBLE", depositoId: D2, ubicacion: "Sucursal", propietario: "X" }],
  } as unknown as StockItem;

  igual("sin depósito elegido: visión consolidada intacta", vistaPorDeposito(item, "TODOS"), item);
  const v1 = vistaPorDeposito(item, D1)!;
  const v2 = vistaPorDeposito(item, D2)!;

  igual("depósito 1: cantidades propias de ese depósito (no el consolidado)", [v1.disponible, v1.reservado, v1.cuarentena, v1.transito, v1.totalFisico, v1.totalVirtual], [100, 20, 0, 0, 120, 120]);
  igual("depósito 2: físico = disponible + reservado + cuarentena; virtual suma el tránsito", [v2.totalFisico, v2.totalVirtual, v2.terceros], [55, 65, 7]);
  igual("valor a costo y costo promedio salen del costo del depósito", [v1.valorInventario, v1.costoPromedio, v2.valorInventario, v2.costoPromedio], [90000, 900, 60000, 1200]);
  igual("valor de venta de referencia = precio × disponible DEL depósito", [v1.valorVentaReferencia, v2.valorVentaReferencia], [200000, 100000]);
  igual("mínimo/máximo del depósito (los globales del producto no se comparan con un solo depósito)", [v1.stockMinimo, v1.stockMaximo, v2.stockMinimo, v2.stockMaximo], [150, 500, 0, 0]);
  igual("nivel del depósito 1: bajo (100 < 150 de su mínimo); depósito 2 sin parámetros: normal", [v1.nivel, v2.nivel], ["BAJO", "NORMAL"]);
  igual("solo se listan el depósito y los lotes elegidos", [v1.depositos.length, v1.lotes.map((l) => l.lote)], [1, ["A"]]);
  igual("producto sin saldo en el depósito: no aparece", vistaPorDeposito(item, D3), null);
  igual("sin precio de referencia: valor de venta ausente (null), no 0", vistaPorDeposito({ ...item, precioVentaReferencia: null }, D1)!.valorVentaReferencia, null);
  igual("sin costo en el depósito: costo promedio ausente", vistaPorDeposito({ ...item, depositos: [dep(D1, "Central", { disponible: 5, totalFisico: 5 })] as never }, D1)!.costoPromedio, null);
  igual("solo terceros en el depósito: propiedad TERCERO", vistaPorDeposito({ ...item, depositos: [dep(D1, "Central", { terceros: 4 })] as never }, D1)!.propiedad, "TERCERO");
  const r = resumenStock([v1, v2]);

  igual("tarjetas: suman lo mismo que las filas y no cuentan precio ausente", [r.sku, r.disponible, r.valorCosto, r.valorVenta, r.stockBajo], [2, 150, 150000, 300000, 1]);
  igual("sin precio con disponible se informa aparte", resumenStock([{ ...v1, precioVentaReferencia: null, valorVentaReferencia: null }]).sinPrecio, 1);

  // ── leerStock con conexión simulada: alcance de depósitos y datos por depósito
  function db(alcance: boolean) {
    const reg: Array<{ sql: string; parametros: unknown[] }> = [];

    return {
      reg,
      c: {
        async query(sql: string, parametros: unknown[] = []) {
          reg.push({ sql, parametros });
          const t = (re: RegExp) => re.test(sql);

          if (t(/FROM productos p/)) return { rows: [{ id: P1, codigo: "P-1", codigoInventario: "", codigoBarras: "", descripcion: "Leche", categoria: "", marca: "", familia: "", linea: "", procedencia: "", unidadMedidaId: "u", unidadMedidaNombre: "Unidad", modoControl: "CANTIDAD", stockMinimo: 10, stockMaximo: 100, puntoReposicion: 20, actualizadoEn: "" }], rowCount: 1 };
          if (t(/FROM stock_saldos s/)) return { rows: [{ id: "s1", productoId: P1, depositoId: D1, depositoCodigo: "C", depositoNombre: "Central", estado: "DISPONIBLE", propiedad: "PROPIO", cantidad: 30, lote: "", vencimiento: "" }, { id: "s2", productoId: P1, depositoId: D1, depositoCodigo: "C", depositoNombre: "Central", estado: "DISPONIBLE", propiedad: "TERCERO", cantidad: 4, lote: "", vencimiento: "" }], rowCount: 2 };
          if (t(/FROM inventario_costos c/)) return { rows: [{ productoId: P1, depositoId: D1, cantidad: 30, valor: 30000 }], rowCount: 1 };
          if (t(/FROM v_producto_precio_referencia/)) return { rows: [{ productoId: P1, precio: 2000, moneda: "PYG" }], rowCount: 1 };
          if (t(/FROM empresas/)) return { rows: [{ nombre: "E", moneda: "PYG" }], rowCount: 1 };
          if (t(/FROM producto_deposito_configuracion/)) return { rows: [{ productoId: P1, depositoId: D1, minimo: 15, maximo: 90, punto: 25, reposicion: 40 }], rowCount: 1 };
          if (t(/SELECT count\(\*\)::int AS n FROM depositos/)) return { rows: [{ n: 3 }], rowCount: 1 };
          if (t(/SELECT count\(\*\)::int AS n FROM \(/)) return { rows: [{ n: alcance ? 2 : 3 }], rowCount: 1 };

          return { rows: [], rowCount: 0 };
        },
      } as never,
    };
  }
  const x = db(true);
  const leido = await leerStock(x.c, EMPRESA, null, USUARIO);
  const it = leido.stock[0];

  igual("leerStock: el detalle por depósito trae terceros, costo y parámetros del depósito", [it.depositos[0].terceros, it.depositos[0].costoValor, it.depositos[0].stockMinimo, it.depositos[0].cantidadReposicion], [4, 30000, 15, 40]);
  igual("leerStock: los terceros no se suman a las cantidades propias", [it.disponible, it.terceros], [30, 4]);
  igual("leerStock: ubicación vacía (no existe modelo de ubicaciones; nunca se inventa)", it.depositos[0].ubicacion, "");
  igual("leerStock: alcance parcial cuando el usuario ve menos depósitos que la empresa", leido.alcanceParcial, true);
  igual("leerStock sin restricción: alcance completo", (await leerStock(db(false).c, EMPRESA, null, USUARIO)).alcanceParcial, false);
  const saldosQ = x.reg.find((q) => /FROM stock_saldos s\s+JOIN depositos d/.test(q.sql))!;

  cierto("saldos y costos se filtran por la empresa y por los depósitos autorizados del usuario de la sesión", /s\.empresa_id = \$1/.test(saldosQ.sql) && /u\.alcance_depositos = 'TODOS'/.test(saldosQ.sql) && /usuario_deposito/.test(saldosQ.sql) && saldosQ.parametros[0] === EMPRESA && saldosQ.parametros[1] === USUARIO && /c\.deposito_id IN/.test(x.reg.find((q) => /FROM inventario_costos c/.test(q.sql))!.sql));
  cierto("el alcance incluye depósitos inactivos (su saldo no desaparece del stock)", !/AND d\.activo/.test(saldosQ.sql));
  const sinUsuario = db(false);

  await leerStock(sinUsuario.c, EMPRESA, null);
  igual("sin usuario (uso interno) no se agrega el filtro de alcance", sinUsuario.reg.some((q) => /usuario_deposito/.test(q.sql)), false);

  // ── Reposición: política de cálculo
  const base: EntradaReposicion = {
    clave: "k", ambito: "DEPOSITO", productoId: P1, productoCodigo: "P-1", productoDescripcion: "Leche", marca: "", unidad: "Unidad", depositoId: D1, depositoNombre: "Central",
    saldo: { disponible: 10, reservado: 5, cuarentena: 3, transito: 20 }, parametros: { minimo: 20, punto: 30, maximo: 100, cantidadReposicion: null }, otrosDepositos: [], proveedorPrincipal: null,
  };
  const calc = (e: Partial<EntradaReposicion>, transito = false) => calcularReposicion({ ...base, ...e }, { incluirTransito: transito });

  igual("posición = disponible: reservado y cuarentena no se restan ni suman; tránsito fuera por defecto", calc({}).posicion, 10);
  igual("con «considerar tránsito» suma el tránsito", calc({}, true).posicion, 30);
  igual("bajo mínimo: sugiere hasta el máximo (100 − 10)", [calc({}).criticidad, calc({}).sugerida], ["BAJO_MINIMO", 90]);
  igual("en el punto de reposición (posición = punto) necesita; por encima no", [calc({ saldo: { ...base.saldo, disponible: 30 } }).criticidad, calc({ saldo: { ...base.saldo, disponible: 31 } }).necesita], ["EN_PUNTO", false]);
  igual("sin stock con parámetros", calc({ saldo: { disponible: 0, reservado: 9, cuarentena: 9, transito: 0 } }).criticidad, "SIN_STOCK");
  igual("sin parámetros: no se sugiere nada", [calc({ parametros: { minimo: null, punto: null, maximo: null, cantidadReposicion: null } }).criticidad, calc({ parametros: { minimo: 0, punto: 0, maximo: 0, cantidadReposicion: null } }).sugerida], ["SIN_PARAMETROS", 0]);
  // AUD-REP-03: cantidad de reposición sin gatillo
  const sinGatillo = calc({ saldo: { disponible: 0, reservado: 0, cuarentena: 0, transito: 0 }, parametros: { minimo: null, punto: 0, maximo: null, cantidadReposicion: 5 } });

  igual("cantidad de reposición sin mínimo, punto ni máximo: «cantidad sin gatillo», sin plan y con advertencia clara (aunque no haya stock)", [sinGatillo.criticidad, sinGatillo.necesita, sinGatillo.sugerida, sinGatillo.sugeridaCompra, /sin mínimo|no mínimo|no hay un criterio/i.test(sinGatillo.advertencias[0] ?? "")], ["SIN_GATILLO", false, 0, 0, true]);
  igual("la advertencia de cantidad sin gatillo menciona la cantidad y pide configurar un criterio", /cantidad de reposición \(5\)/.test(sinGatillo.advertencias[0]) && /Configure al menos uno/.test(sinGatillo.advertencias[0]), true);
  igual("con un gatillo (mínimo) la cantidad de reposición sí actúa como meta", calc({ parametros: { minimo: 20, punto: null, maximo: null, cantidadReposicion: 5 } }).sugerida, 5);
  igual("sin máximo usa la cantidad de reposición del depósito", calc({ parametros: { minimo: 20, punto: null, maximo: null, cantidadReposicion: 40 } }).sugerida, 40);
  const sinMeta = calc({ parametros: { minimo: 20, punto: null, maximo: null, cantidadReposicion: null } });

  igual("sin máximo ni cantidad de reposición: hay necesidad pero NO se inventa una cantidad", [sinMeta.necesita, sinMeta.sugerida, sinMeta.sugeridaCompra, sinMeta.advertencias.length], [true, null, null, 1]);
  igual("parámetros inconsistentes se advierten", calc({ parametros: { minimo: 50, punto: 45, maximo: 40, cantidadReposicion: null } }).advertencias.length, 3);
  igual("posición por encima del máximo: sugerida 0, nunca negativa", calc({ saldo: { ...base.saldo, disponible: 25 }, parametros: { minimo: 30, punto: null, maximo: 20, cantidadReposicion: null } }).sugerida, 0);
  igual("solo máximo configurado y sin stock: necesita reposición", calc({ saldo: { ...base.saldo, disponible: 0 }, parametros: { minimo: null, punto: null, maximo: 50, cantidadReposicion: null } }).sugerida, 50);

  // transferencias
  const otros = [
    { id: D2, nombre: "Sucursal", disponible: 70, minimo: 20, punto: 30 },
    { id: D3, nombre: "Depósito 3", disponible: 25, minimo: null, punto: null },
    { id: "d4", nombre: "Chico", disponible: 10, minimo: 10, punto: 15 },
  ];
  const conOtros = calc({ otrosDepositos: otros });

  // AUD-REP-02: un depósito sin parámetros NO cede automáticamente
  igual("transferencia confirmada solo desde depósitos con parámetros: cede lo que excede su punto (70 − 30 = 40)", conOtros.transferencias.map((t) => [t.depositoId, t.cantidad]), [[D2, 40]]);
  igual("el disponible de un depósito sin parámetros queda «a validar manualmente», fuera de la cantidad transferible y de la compra", conOtros.aValidarManualmente, [{ depositoId: D3, depositoNombre: "Depósito 3", disponible: 25 }]);
  igual("la compra es todo lo que la transferencia confirmada no cubre (90 − 40 = 50)", [conOtros.sugeridaTransferencia, conOtros.sugeridaCompra], [40, 50]);
  const soloSinParametros = calc({ otrosDepositos: [{ id: D3, nombre: "Depósito 3", disponible: 500, minimo: null, punto: null }] });

  igual("si el único origen no tiene parámetros: ninguna transferencia confirmada y toda la necesidad es compra", [soloSinParametros.transferencias, soloSinParametros.sugeridaTransferencia, soloSinParametros.sugeridaCompra, soloSinParametros.aValidarManualmente.length], [[], 0, 90, 1]);
  igual("origen con mínimo en cero explícito también se considera sin parámetros", calc({ otrosDepositos: [{ id: D3, nombre: "X", disponible: 40, minimo: 0, punto: 0 }] }).transferencias, []);
  igual("un origen en o bajo su propio punto no cede nada", conOtros.transferencias.some((t) => t.depositoId === "d4"), false);
  igual("si un origen cubre todo, no hay compra", [calc({ otrosDepositos: [{ id: D2, nombre: "S", disponible: 500, minimo: 10, punto: 20 }] }).sugeridaCompra, calc({ otrosDepositos: [{ id: D2, nombre: "S", disponible: 500, minimo: 10, punto: 20 }] }).transferencias[0].cantidad], [0, 90]);
  igual("renglón consolidado: no ofrece transferencias ni disponibilidad a validar", [calc({ ambito: "CONSOLIDADO", otrosDepositos: otros }).transferencias, calc({ ambito: "CONSOLIDADO", otrosDepositos: otros }).aValidarManualmente], [[], []]);
  // AUD-REP-01: un solo plan por producto
  const refer = calc({ ambito: "CONSOLIDADO", soloReferencia: true, depositoId: null, depositoNombre: "Todos los depósitos", otrosDepositos: otros });

  igual("consolidado de referencia (el producto ya tiene plan por depósito): no genera necesidad, compra ni transferencia y avisa", [refer.necesita, refer.sugerida, refer.sugeridaCompra, refer.transferencias, refer.criticidad, /no genera compra ni transferencia ni se suma/.test(refer.advertencias.join(" "))], [false, 0, 0, [], "BAJO_MINIMO", true]);
  igual("el mismo consolidado sin plan por depósito sí genera su sugerencia (comportamiento anterior preservado)", [calc({ ambito: "CONSOLIDADO", depositoId: null }).necesita, calc({ ambito: "CONSOLIDADO", depositoId: null }).sugerida], [true, 90]);
  igual("sin necesidad no hay transferencias ni compra", [calc({ saldo: { ...base.saldo, disponible: 80 }, otrosDepositos: otros }).transferencias, calc({ saldo: { ...base.saldo, disponible: 80 } }).sugeridaCompra], [[], 0]);
  const filas = [calc({ saldo: { ...base.saldo, disponible: 25 }, productoDescripcion: "B" }), calc({ saldo: { ...base.saldo, disponible: 0 }, productoDescripcion: "A" }), calc({ saldo: { ...base.saldo, disponible: 5 }, productoDescripcion: "C" })];

  igual("orden por urgencia: sin stock, luego bajo mínimo, luego en punto", [...filas].sort(compararUrgencia).map((f) => f.criticidad), ["SIN_STOCK", "BAJO_MINIMO", "EN_PUNTO"]);

  // ── AUD-REP-04: origen compartido entre varios destinos (asignación global, sin sobreasignar)
  const D4 = "d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4";
  const D5 = "d5d5d5d5-d5d5-4d5d-8d5d-d5d5d5d5d5d5";
  const ORIG = { id: D3, nombre: "Origen", disponible: 80, minimo: 10, punto: 30 };
  const dest = (id: string, nombre: string, disponible: number, extra: Partial<EntradaReposicion> = {}): EntradaReposicion => ({
    ...base, clave: `P|${id}`, depositoId: id, depositoNombre: nombre, saldo: { disponible, reservado: 0, cuarentena: 0, transito: 0 },
    parametros: { minimo: 20, punto: 30, maximo: 60, cantidadReposicion: null }, otrosDepositos: [ORIG], ...extra,
  });
  const totalOrigen = (fs: ReturnType<typeof calcularPlanReposicion>, id = D3) => fs.reduce((a, f) => a + f.transferencias.filter((t) => t.depositoId === id).reduce((b, t) => b + t.cantidad, 0), 0);
  // origen transferible = 80 − 30 = 50; A (posición 10) necesita 60 − 10 = 50; B (posición 15) necesita 45
  const dos = calcularPlanReposicion([dest(D1, "A", 10), dest(D2, "B", 15)], { incluirTransito: false });

  igual("2 destinos / 1 origen con 50 transferibles: la suma asignada nunca supera 50", totalOrigen(dos), 50);
  igual("el destino con mayor cantidad sugerida toma primero y el otro completa con compra", dos.map((f) => [f.depositoNombre, f.sugeridaTransferencia, f.sugeridaCompra]), [["A", 50, 0], ["B", 0, 45]]);
  igual("el destino sin cupo avisa que el origen ya fue asignado", /ya fue asignada a otro depósito de mayor prioridad/.test(dos[1].advertencias.join(" ")), true);
  igual("el origen conserva su punto: 80 − asignado ≥ 30", 80 - totalOrigen(dos) >= 30, true);
  igual("el cálculo independiente (sin plan global) sobreasignaría: es el defecto corregido", calcularReposicion(dest(D1, "A", 10), { incluirTransito: false }).sugeridaTransferencia + calcularReposicion(dest(D2, "B", 15), { incluirTransito: false }).sugeridaTransferencia > 50, true);

  const tres = calcularPlanReposicion([dest(D1, "A", 10), dest(D2, "B", 15), dest(D4, "C", 25)], { incluirTransito: false });

  igual("3 destinos con disponibilidad insuficiente: se reparte por prioridad hasta agotar el cupo", [totalOrigen(tres), tres.map((f) => f.sugeridaTransferencia)], [50, [50, 0, 0]]);
  igual("el faltante de cada destino es compra (sugerida − transferencia confirmada)", tres.map((f) => f.sugeridaCompra), [0, 45, 35]);
  const grande = { ...ORIG, disponible: 150 };
  const amplio = calcularPlanReposicion([dest(D1, "A", 10, { otrosDepositos: [grande] }), dest(D2, "B", 15, { otrosDepositos: [grande] }), dest(D4, "C", 25, { otrosDepositos: [grande] })], { incluirTransito: false });

  igual("cupo de 120 y demanda de 130: se asigna exactamente el cupo y el resto es compra", [amplio.map((f) => f.sugeridaTransferencia), totalOrigen(amplio), amplio.map((f) => f.sugeridaCompra)], [[50, 45, 25], 120, [0, 0, 10]]);
  igual("el origen no cede por debajo de su punto aunque sobre demanda", 150 - totalOrigen(amplio) >= 30, true);
  igual("prioridad por criticidad: SIN_STOCK antes que BAJO_MINIMO aunque pida menos", calcularPlanReposicion([dest(D1, "A", 10), dest(D2, "B", 0, { parametros: { minimo: 20, punto: 30, maximo: 40, cantidadReposicion: null } })], { incluirTransito: false }).map((f) => [f.depositoNombre, f.sugeridaTransferencia]), [["A", 10], ["B", 40]]);
  // empate total (misma criticidad y cantidad): desempata por nombre y luego id; el orden de entrada no importa
  const empate1 = calcularPlanReposicion([dest(D2, "Beta", 10), dest(D1, "Alfa", 10)], { incluirTransito: false });
  const empate2 = calcularPlanReposicion([dest(D1, "Alfa", 10), dest(D2, "Beta", 10)], { incluirTransito: false });

  igual("empate exacto: gana el nombre menor (Alfa) y el resultado no depende del orden de entrada", [empate1.find((f) => f.depositoNombre === "Alfa")?.sugeridaTransferencia, empate1.find((f) => f.depositoNombre === "Beta")?.sugeridaTransferencia, empate2.find((f) => f.depositoNombre === "Alfa")?.sugeridaTransferencia], [50, 0, 50]);
  igual("empate con el mismo nombre: desempata por id del depósito", calcularPlanReposicion([dest(D2, "X", 10), dest(D1, "X", 10)], { incluirTransito: false }).map((f) => [f.depositoId === D1 ? "d1" : "d2", f.sugeridaTransferencia]), [["d2", 0], ["d1", 50]]);
  igual("las filas se devuelven en el orden de las entradas", dos.map((f) => f.depositoId), [D1, D2]);
  const otroProducto = calcularPlanReposicion([dest(D1, "A", 10), dest(D2, "B", 10, { productoId: "p2", clave: "p2|d2" })], { incluirTransito: false });

  igual("el cupo se reparte por producto: otro producto en el mismo origen tiene su propio saldo", otroProducto.map((f) => f.sugeridaTransferencia), [50, 50]);
  // depósitos sin parámetros: nunca se asignan y no consumen cupo
  const SINP = { id: D5, nombre: "SinParam", disponible: 300, minimo: null, punto: null };
  const mixto = calcularPlanReposicion([dest(D1, "A", 10, { otrosDepositos: [SINP, ORIG] }), dest(D2, "B", 15, { otrosDepositos: [SINP, ORIG] })], { incluirTransito: false });

  igual("depósito sin parámetros: ninguna asignación, queda a validar manualmente en cada destino", [totalOrigen(mixto, D5), mixto.map((f) => f.aValidarManualmente.map((v) => v.depositoId))], [0, [[D5], [D5]]]);
  igual("con orígenes con y sin parámetros, el cupo confirmado sigue limitado al origen con parámetros", totalOrigen(mixto), 50);
  igual("solo orígenes sin parámetros: todo es compra y nada se asigna", calcularPlanReposicion([dest(D1, "A", 10, { otrosDepositos: [SINP] }), dest(D2, "B", 15, { otrosDepositos: [SINP] })], { incluirTransito: false }).map((f) => [f.sugeridaTransferencia, f.sugeridaCompra]), [[0, 50], [0, 45]]);
  igual("origen sin disponibilidad sobre su punto no se asigna", calcularPlanReposicion([dest(D1, "A", 10, { otrosDepositos: [{ ...ORIG, disponible: 30 }] })], { incluirTransito: false })[0].transferencias, []);
  igual("renglón consolidado de referencia no consume cupo del origen", calcularPlanReposicion([dest(D1, "A", 10, { ambito: "CONSOLIDADO", soloReferencia: true, depositoId: null, clave: "P|*" }), dest(D2, "B", 15)], { incluirTransito: false }).map((f) => f.sugeridaTransferencia), [0, 45]);
  igual("AUD-REP-03 se conserva en el plan: sin gatillo no genera transferencias", calcularPlanReposicion([dest(D1, "A", 0, { parametros: { minimo: null, punto: null, maximo: null, cantidadReposicion: 5 } })], { incluirTransito: false }).map((f) => [f.criticidad, f.sugeridaTransferencia]), [["SIN_GATILLO", 0]]);

  // acceso restringido: un depósito de origen que el usuario no puede ver no existe para el plan (nunca se asigna ni se menciona)
  const restringido = await leerEntradasReposicion({
    async query(sql: string) {
      if (/FROM productos p/.test(sql)) return { rows: [{ id: P1, codigo: "P-1", descripcion: "Leche", marca: "", unidad: "U", minimo: null, maximo: null, punto: null, proveedorNombre: null, proveedorPlazo: null, proveedorMinima: null }], rowCount: 1 };
      if (/FROM stock_saldos s/.test(sql)) return { rows: [{ productoId: P1, depositoId: D1, estado: "DISPONIBLE", cantidad: 5 }, { productoId: P1, depositoId: D2, estado: "DISPONIBLE", cantidad: 5 }, { productoId: P1, depositoId: D3, estado: "DISPONIBLE", cantidad: 500 }], rowCount: 3 };
      if (/FROM producto_deposito_configuracion/.test(sql)) return { rows: [{ productoId: P1, depositoId: D1, minimo: 20, maximo: 60, punto: 30, reposicion: null }, { productoId: P1, depositoId: D2, minimo: 20, maximo: 60, punto: 30, reposicion: null }, { productoId: P1, depositoId: D3, minimo: 10, maximo: null, punto: 30, reposicion: null }], rowCount: 3 };
      if (/SELECT count\(\*\)::int AS n FROM depositos/.test(sql)) return { rows: [{ n: 3 }], rowCount: 1 };
      if (/FROM depositos d JOIN usuarios u/.test(sql)) return { rows: [{ id: D1, codigo: "A", nombre: "A" }, { id: D2, codigo: "B", nombre: "B" }], rowCount: 2 };

      return { rows: [], rowCount: 0 };
    },
  } as never, EMPRESA, USUARIO);
  const planRestringido = calcularPlanReposicion(restringido.entradas, { incluirTransito: false });

  igual("acceso restringido: el origen no autorizado no recibe asignaciones y los dos destinos pasan a compra", [restringido.alcanceParcial, planRestringido.filter((f) => f.necesita).map((f) => [f.sugeridaTransferencia, f.sugeridaCompra]), totalOrigen(planRestringido)], [true, [[0, 55], [0, 55]], 0]);
  igual("acceso restringido: el origen no autorizado tampoco aparece como disponibilidad a validar", planRestringido.every((f) => f.aValidarManualmente.length === 0), true);

  // lectura de datos de reposición (conexión simulada)
  const regR: Array<{ sql: string; parametros: unknown[] }> = [];
  const dbR = {
    async query(sql: string, parametros: unknown[] = []) {
      regR.push({ sql, parametros });
      if (/FROM productos p/.test(sql)) return { rows: [{ id: P1, codigo: "P-1", descripcion: "Leche", marca: "M", unidad: "Unidad", minimo: 10, maximo: 100, punto: 20, proveedorNombre: "Prov", proveedorPlazo: 5, proveedorMinima: 12 }], rowCount: 1 };
      if (/FROM stock_saldos s/.test(sql)) return { rows: [{ productoId: P1, depositoId: D1, estado: "DISPONIBLE", cantidad: 8 }, { productoId: P1, depositoId: D2, estado: "DISPONIBLE", cantidad: 60 }, { productoId: P1, depositoId: D2, estado: "TRANSITO", cantidad: 3 }], rowCount: 3 };
      if (/FROM producto_deposito_configuracion/.test(sql)) return { rows: [{ productoId: P1, depositoId: D1, minimo: 15, maximo: 90, punto: 25, reposicion: null }, { productoId: P1, depositoId: D2, minimo: null, maximo: null, punto: null, reposicion: null }], rowCount: 2 };
      if (/SELECT count\(\*\)::int AS n FROM depositos/.test(sql)) return { rows: [{ n: 3 }], rowCount: 1 };
      if (/FROM depositos d JOIN usuarios u/.test(sql)) return { rows: [{ id: D1, codigo: "C", nombre: "Central" }, { id: D2, codigo: "S", nombre: "Sucursal" }], rowCount: 2 };

      return { rows: [], rowCount: 0 };
    },
  } as never;
  const lectura = await leerEntradasReposicion(dbR, EMPRESA, USUARIO);

  igual("datos: un renglón por depósito con parámetros propios (el depósito sin parámetros no genera renglón) más un consolidado del producto, que queda solo como referencia", lectura.entradas.map((e) => [e.ambito, e.depositoNombre, e.soloReferencia ?? false]), [["DEPOSITO", "Central", false], ["CONSOLIDADO", "Todos los depósitos", true]]);
  const calculadas = lectura.entradas.map((e) => calcularReposicion(e, { incluirTransito: false }));

  igual("mismo producto en 2 depósitos con parámetros globales y por depósito: una sola necesidad (no se duplica la compra)", [calculadas.filter((f) => f.necesita).length, calculadas.filter((f) => f.necesita && f.sugeridaCompra).length], [1, 1]);
  const dosDepositos = (await leerEntradasReposicion({
    async query(sql: string) {
      if (/FROM productos p/.test(sql)) return { rows: [{ id: P1, codigo: "P-1", descripcion: "Leche", marca: "", unidad: "U", minimo: 10, maximo: 100, punto: 20, proveedorNombre: null, proveedorPlazo: null, proveedorMinima: null }], rowCount: 1 };
      if (/FROM stock_saldos s/.test(sql)) return { rows: [{ productoId: P1, depositoId: D1, estado: "DISPONIBLE", cantidad: 1 }, { productoId: P1, depositoId: D2, estado: "DISPONIBLE", cantidad: 1 }], rowCount: 2 };
      if (/FROM producto_deposito_configuracion/.test(sql)) return { rows: [{ productoId: P1, depositoId: D1, minimo: 5, maximo: 50, punto: 8, reposicion: null }, { productoId: P1, depositoId: D2, minimo: 5, maximo: 50, punto: 8, reposicion: null }], rowCount: 2 };
      if (/SELECT count\(\*\)::int AS n FROM depositos/.test(sql)) return { rows: [{ n: 2 }], rowCount: 1 };
      if (/FROM depositos d JOIN usuarios u/.test(sql)) return { rows: [{ id: D1, codigo: "C", nombre: "Central" }, { id: D2, codigo: "S", nombre: "Sucursal" }], rowCount: 2 };

      return { rows: [], rowCount: 0 };
    },
  } as never, EMPRESA, USUARIO)).entradas.map((e) => calcularReposicion(e, { incluirTransito: false }));

  igual("mismo producto en 2 depósitos: 2 planes por depósito y el total solo como referencia (3 renglones, 2 necesidades, sin suma)", [dosDepositos.length, dosDepositos.filter((f) => f.necesita).length, dosDepositos.filter((f) => f.soloReferencia).length, dosDepositos.filter((f) => f.soloReferencia && f.sugeridaCompra !== 0).length], [3, 2, 1, 0]);
  igual("sin parámetros por depósito, el consolidado del producto sigue siendo el plan (no es referencia)", (await leerEntradasReposicion({
    async query(sql: string) {
      if (/FROM productos p/.test(sql)) return { rows: [{ id: P1, codigo: "P-1", descripcion: "Leche", marca: "", unidad: "U", minimo: 10, maximo: 100, punto: 20, proveedorNombre: null, proveedorPlazo: null, proveedorMinima: null }], rowCount: 1 };
      if (/SELECT count\(\*\)::int AS n FROM depositos/.test(sql)) return { rows: [{ n: 1 }], rowCount: 1 };
      if (/FROM depositos d JOIN usuarios u/.test(sql)) return { rows: [{ id: D1, codigo: "C", nombre: "Central" }], rowCount: 1 };

      return { rows: [], rowCount: 0 };
    },
  } as never, EMPRESA, USUARIO)).entradas.map((e) => e.soloReferencia ?? false), [false]);
  igual("datos: el consolidado suma los depósitos visibles con los parámetros GLOBALES; el de depósito usa los suyos", [lectura.entradas[1].saldo.disponible, lectura.entradas[1].parametros.maximo, lectura.entradas[0].saldo.disponible, lectura.entradas[0].parametros.maximo], [68, 100, 8, 90]);
  igual("datos: el tránsito se suma aparte y los otros depósitos con disponible son candidatos de transferencia", [lectura.entradas[1].saldo.transito, lectura.entradas[0].otrosDepositos.map((o) => [o.id, o.disponible])], [3, [[D2, 60]]]);
  igual("datos: proveedor principal real (plazo y mínimo de compra solo informativos)", lectura.entradas[0].proveedorPrincipal, { nombre: "Prov", plazoDias: 5, cantidadMinimaCompra: 12 });
  igual("datos: alcance parcial si el usuario ve menos depósitos que los activos de la empresa", lectura.alcanceParcial, true);
  const sal = regR.find((q) => /FROM stock_saldos s/.test(q.sql))!;

  cierto("reposición lee solo stock PROPIO de los depósitos activos autorizados, por empresa y usuario de la sesión, y nunca escribe", /s\.propiedad = 'PROPIO'/.test(sal.sql) && /d\.activo/.test(sal.sql) && sal.parametros[0] === EMPRESA && sal.parametros[1] === USUARIO && regR.every((q) => !/\b(INSERT|UPDATE|DELETE)\b/i.test(q.sql)));

  // ── Etapa C: contrato Movimientos ↔ documentos
  const linea = { lineaId: "l1", productoId: P1, cantidadBase: 5, depositoOrigenId: D1, depositoDestinoId: D2 };
  const ctx = (extra: Partial<ContextoDocumento>): ContextoDocumento => ({ tipo: "FACTURA_VENTA", documentoId: "doc1", eventoFisicoId: "ev1", linea, efectosPrevios: [], ...extra });
  const efecto = (extra: Partial<ContextoDocumento>) => decidirEfecto(ctx(extra)).efecto;

  igual("factura de venta sin política de momento de baja definida: bloqueada (decisión pendiente)", [efecto({}), decidirEfecto(ctx({})).bloqueos.length], ["NINGUNO", 1]);
  igual("factura de venta con baja en la factura: salida", efecto({ momentoBajaVenta: "FACTURA" }), "SALIDA");
  igual("factura cuando la baja es en la remisión/entrega: sin efecto", efecto({ momentoBajaVenta: "REMISION_ENTREGA" }), "NINGUNO");
  igual("factura cuando la remisión del mismo despacho ya dio salida: no hay doble baja", efecto({ momentoBajaVenta: "FACTURA", efectosPrevios: [{ eventoFisicoId: "ev1", lineaId: "otra", efecto: "SALIDA" }] }), "NINGUNO");
  igual("remisión de entrega confirmada: salida; sin confirmar: nada", [efecto({ tipo: "NOTA_REMISION", finalidadRemision: "ENTREGA_VENTA", hechoFisicoConfirmado: true }), efecto({ tipo: "NOTA_REMISION", finalidadRemision: "ENTREGA_VENTA" })], ["SALIDA", "NINGUNO"]);
  igual("remisión de traslado: transferencia con origen y destino", efecto({ tipo: "NOTA_REMISION", finalidadRemision: "TRASLADO_ENTRE_DEPOSITOS", hechoFisicoConfirmado: true }), "TRANSFERENCIA");
  igual("remisión de traslado al mismo depósito o sin destino: bloqueada", [decidirEfecto(ctx({ tipo: "NOTA_REMISION", finalidadRemision: "TRASLADO_ENTRE_DEPOSITOS", hechoFisicoConfirmado: true, linea: { ...linea, depositoDestinoId: D1 } })).bloqueos.length, decidirEfecto(ctx({ tipo: "NOTA_REMISION", finalidadRemision: "TRASLADO_ENTRE_DEPOSITOS", hechoFisicoConfirmado: true, linea: { ...linea, depositoDestinoId: null } })).bloqueos.length], [1, 1]);
  igual("remisión con otra finalidad: requiere decisión (no es baja definitiva)", [efecto({ tipo: "NOTA_REMISION", finalidadRemision: "OTRA", hechoFisicoConfirmado: true }), decidirEfecto(ctx({ tipo: "NOTA_REMISION", finalidadRemision: "OTRA", hechoFisicoConfirmado: true })).bloqueos.length], ["NINGUNO", 1]);
  igual("nota de crédito por devolución física con retorno confirmado: entrada", efecto({ tipo: "NOTA_CREDITO_VENTA", tipoNotaCredito: "DEVOLUCION_FISICA", retornoFisicoConfirmado: true }), "ENTRADA");
  igual("nota de crédito por devolución sin confirmar el retorno: sin entrada", efecto({ tipo: "NOTA_CREDITO_VENTA", tipoNotaCredito: "DEVOLUCION_FISICA" }), "NINGUNO");
  igual("nota de crédito financiera: nunca altera el stock (aunque se marque retorno)", efecto({ tipo: "NOTA_CREDITO_VENTA", tipoNotaCredito: "FINANCIERA", retornoFisicoConfirmado: true }), "NINGUNO");
  igual("recepción de compra confirmada: entrada; la factura de compra sola no mueve stock", [efecto({ tipo: "RECEPCION_COMPRA", hechoFisicoConfirmado: true }), efecto({ tipo: "FACTURA_COMPRA", hechoFisicoConfirmado: true })], ["ENTRADA", "NINGUNO"]);
  igual("devolución al proveedor con salida confirmada: salida", efecto({ tipo: "DEVOLUCION_PROVEEDOR", hechoFisicoConfirmado: true }), "SALIDA");
  igual("un evento físico ya registrado no se repite (idempotencia: un solo efecto)", decidirEfecto(ctx({ tipo: "RECEPCION_COMPRA", hechoFisicoConfirmado: true, efectosPrevios: [{ eventoFisicoId: "ev1", lineaId: "l1", efecto: "ENTRADA" }] })).efecto, "NINGUNO");
  igual("clave de idempotencia determinista por evento físico + línea + efecto", [claveEfectoFisico("ev1", "l1", "SALIDA"), decidirEfecto(ctx({ tipo: "RECEPCION_COMPRA", hechoFisicoConfirmado: true })).claveIdempotencia], ["fis:ev1:l1:SALIDA", "fis:ev1:l1:ENTRADA"]);
  igual("la clave respeta los límites de inventario_registrar_movimiento (8–120)", (() => { try { claveEfectoFisico("x".repeat(120), "l", "SALIDA"); return "ok"; } catch { return "rechazada"; } })(), "rechazada");
  igual("validaciones de línea: cantidad desconocida (sin conversión inventada), ≤ 0, lote obligatorio, terceros", [validarLinea("SALIDA", { ...linea, cantidadBase: null }).length, validarLinea("SALIDA", { ...linea, cantidadBase: 0 }).length, validarLinea("SALIDA", { ...linea, exigeLote: true }).length, validarLinea("ENTRADA", { ...linea, propiedad: "TERCERO" }).length], [1, 1, 1, 1]);
  igual("estorno: compensatorio y con motivo; no se anula una anulación ni dos veces", [planEstorno({ id: "m", estado: "REGISTRADO", esAnulacion: false }, "Error de carga").operacion, planEstorno({ id: "m", estado: "ANULADO", esAnulacion: false }, "Error de carga").operacion, planEstorno({ id: "m", estado: "REGISTRADO", esAnulacion: true }, "Error de carga").operacion, planEstorno({ id: "m", estado: "REGISTRADO", esAnulacion: false }, "xx").operacion], ["ANULAR", "NINGUNA", "NINGUNA", "NINGUNA"]);

  // ── Auditoría del módulo Movimientos existente (migraciones y código)
  const n14 = leer("documentacao/banco/nexit/v1/migraciones/NEX-014-movimientos-operativos.sql");

  cierto("movimientos: inmutables (DELETE rechazado), anulación = movimiento inverso ligado por anula_a_id, único por original", /movimientos_inventario es inmutable: use inventario_anular_movimiento en lugar de DELETE/.test(n14) && /anula_a_id/.test(n14) && /CREATE UNIQUE INDEX movimientos_inventario_anula_key/.test(n14) && /Un movimiento de anulación no se puede anular|un movimiento de anulación no se puede anular/.test(n14));
  cierto("movimientos: idempotencia por clave única de empresa y huella de la solicitud (misma clave y otra solicitud = conflicto)", /CREATE UNIQUE INDEX movimientos_inventario_idem_key\s+ON movimientos_inventario \(empresa_id, clave_idempotencia\)/.test(n14) && /huella_solicitud/.test(n14) && /NEX:IDEMPOTENCIA_CONFLICTO/.test(n14));
  cierto("movimientos: el registro y la anulación pasan por funciones SECURITY DEFINER con alcance de depósitos y la entrada exige costo explícito", /inventario_registrar_movimiento/.test(n14) && /SECURITY DEFINER/.test(n14) && /usuario_puede_deposito/.test(n14) && /el costo no se inventa|exige costo/.test(n14));
  const mov = leer("lib/movimientos/shared.ts");

  cierto("movimientos (código): el costo de entrada no se inventa, las unidades identificadas aún no se mueven, la cantidad admite 4 decimales y solo se llama a las funciones SQL", /el costo no se inventa/.test(mov) && /unidad identificada/.test(mov) && /hasta 4 decimales/.test(mov) && /inventario_registrar_movimiento/.test(mov) && !/INSERT INTO stock_saldos|UPDATE stock_saldos/.test(mov));
  cierto("brecha documentada: documento_referencia es texto libre (sin vínculo relacional por documento + línea): el contrato lo cubre sin automatismos", /documento_referencia\s+text/.test(leer("documentacao/banco/nexit/v1/migraciones/NEX-009-inventario-costos.sql")) && existsSync(join(raiz, "documentacao/v1/homologacao-visual/CONTRATO-INTEGRACION-MOVIMIENTOS-DOCUMENTOS-V1-2026-10-12.md")));

  // ── Pantallas, rutas y navegación
  const stockPage = leer("app/(private)/stock/page.tsx");
  const menu = leer("lib/navigation/menu.ts");

  cierto("Stock: sin «Exportar Excel» ni «Valorizado por marca» y sin xlsx; conserva Movimientos y Reposición", !/Exportar Excel|Valorizado por marca|exportarListadoExcel|exportarValorizadoMarca|xlsx/i.test(stockPage) && />\s*Movimientos\s*</.test(stockPage) && />\s*Ver reposición\s*</.test(stockPage) && /href="\/reposicion"/.test(stockPage));
  cierto("los reportes existentes de Reportes siguen en su lugar", ["app/(private)/reportes/valorizacion/page.tsx", "app/(private)/reportes/stock-general/page.tsx"].every((f) => existsSync(join(raiz, f))));
  cierto("Stock: filtro por depósito con vista por depósito (cantidades, costo, valor) y rótulo de visión consolidada/del depósito", /vistaPorDeposito/.test(stockPage) && /Visión consolidada/.test(stockPage) && /Visión del depósito/.test(stockPage) && /indicadoresStock\(stock\)/.test(stockPage));
  cierto("Stock (ficha): ubicación real o «Sin ubicación registrada», nunca inventada", /Sin ubicación registrada/.test(leer("app/(private)/stock/[id]/page.tsx")));
  cierto("Reposición: página, layout con STOCK.VER, API de solo lectura con STOCK.VER, ruta en V1_HREFS y menú con STOCK.VER", existsSync(join(raiz, "app/(private)/reposicion/page.tsx")) && /guardPage\("STOCK", "VER"\)/.test(leer("app/(private)/reposicion/layout.tsx")) && /denyIfNoPermission\(session, "STOCK", "VER"\)/.test(leer("app/api/reposicion/route.ts")) && !/export (async )?function (POST|PUT|DELETE|PATCH)|export const (POST|PUT|DELETE|PATCH)/.test(leer("app/api/reposicion/route.ts")) && /"\/reposicion"/.test(menu.slice(menu.indexOf("V1_HREFS"))) && /href: "\/reposicion",\s+icon: "replenishment",\s+permission: "STOCK\.VER"/.test(menu));
  const repPage = leer("app/(private)/reposicion/page.tsx");

  cierto("Reposición: solo planificación (sin POST/PUT, sin botones de compra) y la acción hacia Movimientos solo con permiso y destino real", !/method:\s*"(POST|PUT|DELETE)"/.test(repPage) && !/Comprar ahora|Generar pedido|Crear orden/i.test(repPage) && /puedeAbrirNuevoMovimiento\(permisos\)/.test(repPage) && /enlaceNuevoMovimiento/.test(repPage) && existsSync(join(raiz, "app/(private)/movimientos/nuevo/page.tsx")));
  cierto("la API de stock aplica el alcance de depósitos del usuario", /session\.user\.id/.test(leer("app/api/stock/route.ts")) && /session\.user\.id/.test(leer("app/api/stock/[id]/route.ts")));

  // ── Revisión visual y funcional: Detalle de Stock, Reposición y Nuevo movimiento (UX-01…UX-24)
  const HOY = "2026-10-12";
  const catMov: CatalogoMovimientos = {
    monedaBase: "PYG",
    depositos: [
      { id: D1, codigo: "C", nombre: "Central", permitido: true },
      { id: D2, codigo: "S", nombre: "Sucursal", permitido: true },
      { id: D3, codigo: "X", nombre: "Ajeno", permitido: false },
    ],
    productos: [
      { id: P1, codigo: "P-1", descripcion: "Leche", unidadMedidaNombre: "Unidad", modoControl: "CANTIDAD", stock: [{ depositoId: D1, disponible: 10, reservado: 2, cuarentena: 1, transito: 0, costoPromedio: 100 }, { depositoId: D2, disponible: 5, reservado: 0, cuarentena: 0, transito: 3, costoPromedio: null }], lotes: [] },
      { id: "p2", codigo: "P-2", descripcion: "Yogur", unidadMedidaNombre: "Caja", modoControl: "LOTE", stock: [], lotes: [] },
      { id: "p3", codigo: "P-3", descripcion: "Equipo", unidadMedidaNombre: "Unidad", modoControl: "UNIDAD_ETIQUETADA", stock: [], lotes: [] },
    ],
  };
  const f0 = formularioInicial(HOY);
  const val = (parcial: Partial<NuevoMovimientoStock>) => validarMovimiento({ ...f0, ...parcial }, catMov, HOY);

  igual("formulario inicial: sin producto ni cantidad; el estado inicial no es «registrado»", [f0.productoId, f0.cantidad, f0.tipo, f0.origen, f0.claveIdempotencia], ["", 0, "ENTRADA", "COMPRA", ""]);
  igual("todos los tipos de la API siguen disponibles en la pantalla", ORDEN_TIPOS, ["ENTRADA", "SALIDA", "TRANSFERENCIA", "AJUSTE_POSITIVO", "AJUSTE_NEGATIVO", "RESERVA", "LIBERACION_RESERVA", "CUARENTENA", "LIBERACION_CUARENTENA"]);
  igual("campos requeridos por tipo (origen/destino/costo) coinciden con lib/movimientos/shared.ts", ORDEN_TIPOS.map((t) => [TIPOS_INFO[t].origen, TIPOS_INFO[t].destino, TIPOS_INFO[t].costo]), [[false, true, true], [true, false, false], [true, true, false], [false, true, true], [true, false, false], [true, false, false], [true, false, false], [true, false, false], [true, false, false]]);
  cierto("cada tipo tiene descripción en español y orígenes coherentes (el primero es el predeterminado)", ORDEN_TIPOS.every((t) => TIPOS_INFO[t].descripcion.length > 10 && TIPOS_INFO[t].origenes.length > 0));
  igual("transferencia: el origen queda fijo en TRANSFERENCIA", TIPOS_INFO.TRANSFERENCIA.origenes, ["TRANSFERENCIA"]);

  // aplicarTipo: limpia lo que ya no aplica
  const conDatos: NuevoMovimientoStock = { ...f0, depositoOrigenId: D1, depositoDestinoId: D2, costoUnitario: 50, fechaVencimiento: "2026-12-01", origen: "COMPRA" };
  const aSalida = aplicarTipo(conDatos, "SALIDA");

  igual("ENTRADA → SALIDA: se limpian destino, costo y vencimiento y el origen pasa a uno coherente", [aSalida.depositoDestinoId, aSalida.costoUnitario, aSalida.fechaVencimiento, aSalida.origen, aSalida.depositoOrigenId], ["", null, "", "VENTA", D1]);
  igual("SALIDA no ofrece COMPRA como origen: pasa a VENTA", aSalida.origen, "VENTA");
  igual("ENTRADA → TRANSFERENCIA: origen TRANSFERENCIA, sin costo, sin vencimiento, conserva ambos depósitos", ((t) => [t.origen, t.costoUnitario, t.fechaVencimiento, t.depositoOrigenId, t.depositoDestinoId])(aplicarTipo(conDatos, "TRANSFERENCIA")), ["TRANSFERENCIA", null, "", D1, D2]);
  igual("RESERVA: solo origen; sin destino ni costo", ((t) => [t.depositoOrigenId, t.depositoDestinoId, t.costoUnitario])(aplicarTipo(conDatos, "RESERVA")), [D1, "", null]);

  // validación por campo, en orden visual
  const vacios = val({});

  igual("entrada vacía: errores por campo en orden visual (producto, cantidad, costo, destino)", Object.keys(vacios), ["productoId", "cantidad", "costoUnitario", "depositoDestinoId"]);
  igual("sin errores con una entrada completa", val({ productoId: P1, cantidad: 5, costoUnitario: 120, depositoDestinoId: D1 }), {});
  igual("costo 0 es válido; negativo no", [Object.keys(val({ productoId: P1, cantidad: 1, costoUnitario: 0, depositoDestinoId: D1 })).length, val({ productoId: P1, cantidad: 1, costoUnitario: -1, depositoDestinoId: D1 }).costoUnitario !== undefined], [0, true]);
  igual("la salida no exige costo", Object.keys(val({ tipo: "SALIDA", origen: "VENTA", productoId: P1, cantidad: 1, depositoOrigenId: D1 })), []);
  igual("cantidad: cero, negativa o con más de 4 decimales", [val({ cantidad: 0 }).cantidad, val({ cantidad: -2 }).cantidad, val({ cantidad: 1.00001 }).cantidad, val({ cantidad: 1.0001 }).cantidad], ["La cantidad debe ser mayor que cero.", "La cantidad debe ser mayor que cero.", "La cantidad admite hasta 4 decimales.", undefined]);
  igual("fecha futura rechazada (como la función SQL); hoy y pasadas válidas", [val({ fecha: "2026-10-13" }).fecha, val({ fecha: HOY }).fecha, val({ fecha: "2026-01-01" }).fecha], ["La fecha del movimiento no puede ser futura.", undefined, undefined]);
  igual("fecha vacía (inválida) se señala en el campo", val({ fecha: "" }).fecha, "Ingrese una fecha válida.");
  igual("producto con unidad identificada: rechazado con mensaje claro", val({ productoId: "p3" }).productoId, "Los productos con unidad identificada (serie/etiqueta) aún no se pueden mover desde esta pantalla.");
  igual("producto desconocido o fuera del catálogo de la sesión", val({ productoId: "otra-empresa" }).productoId, "El producto no está disponible para movimientos.");
  igual("lote obligatorio solo en productos por lote; vencimiento no anterior a la fecha", [val({ productoId: "p2", cantidad: 1, costoUnitario: 1, depositoDestinoId: D1 }).lote, val({ productoId: P1, cantidad: 1, costoUnitario: 1, depositoDestinoId: D1 }).lote, val({ productoId: "p2", cantidad: 1, costoUnitario: 1, depositoDestinoId: D1, lote: "L1", fechaVencimiento: "2026-10-01" }).fechaVencimiento], ["Ingrese el lote: este producto se controla por lote.", undefined, "El vencimiento no puede ser anterior a la fecha del movimiento."]);
  igual("transferencia con el mismo depósito: error en destino", val({ tipo: "TRANSFERENCIA", productoId: P1, cantidad: 1, depositoOrigenId: D1, depositoDestinoId: D1 }).depositoDestinoId, "El depósito origen y destino deben ser diferentes.");
  igual("depósito sin acceso (permitido=false): se rechaza en la pantalla (la API/SQL lo vuelve a verificar)", [val({ tipo: "SALIDA", productoId: P1, cantidad: 1, depositoOrigenId: D3 }).depositoOrigenId, val({ productoId: P1, cantidad: 1, costoUnitario: 1, depositoDestinoId: D3 }).depositoDestinoId], ["No tiene acceso a ese depósito.", "No tiene acceso a ese depósito."]);
  igual("límites de texto: referencia 120, motivo 300, observación 1000", [val({ documentoReferencia: "x".repeat(121) }).documentoReferencia !== undefined, val({ motivo: "x".repeat(301) }).motivo !== undefined, val({ observacion: "x".repeat(1001) }).observacion !== undefined, val({ documentoReferencia: "x".repeat(120), motivo: "x".repeat(300) }).motivo], [true, true, true, undefined]);
  igual("el motivo no es obligatorio al registrar (el SQL solo lo exige al anular)", val({ productoId: P1, cantidad: 1, costoUnitario: 1, depositoDestinoId: D1, motivo: "" }).motivo, undefined);

  // saldo visible y advertencia
  igual("saldo visible: por depósito de referencia y total de los depósitos autorizados", [saldoVisible(catMov.productos[0], D1), saldoVisible(catMov.productos[0], "")], [{ disponible: 10, reservado: 2, cuarentena: 1, transito: 0 }, { disponible: 15, reservado: 2, cuarentena: 1, transito: 3 }]);
  igual("advertencia (no bloqueante) cuando la cantidad supera el disponible visible del origen", [advertenciaSaldo({ ...f0, tipo: "SALIDA", cantidad: 11, depositoOrigenId: D1 }, catMov.productos[0]).startsWith("La cantidad supera el disponible visible"), advertenciaSaldo({ ...f0, tipo: "SALIDA", cantidad: 10, depositoOrigenId: D1 }, catMov.productos[0]), advertenciaSaldo({ ...f0, tipo: "ENTRADA", cantidad: 999 }, catMov.productos[0])], [true, "", ""]);
  cierto("la liberación de reserva compara contra lo reservado", /reservado visible/.test(advertenciaSaldo({ ...f0, tipo: "LIBERACION_RESERVA", cantidad: 5, depositoOrigenId: D1 }, catMov.productos[0])));

  // cambios sin guardar
  igual("cambios sin guardar: igual al estado base = limpio; cualquier edición = sucio; espacios no cuentan", [movimientoSucio(f0, f0), movimientoSucio({ ...f0, motivo: "  " }, f0), movimientoSucio({ ...f0, cantidad: 3 }, f0), movimientoSucio({ ...f0, productoId: P1 }, f0)], [false, false, true, true]);

  // precarga desde la dirección (Stock y Reposición): siempre contra el catálogo de la sesión
  const q = (s: string) => new URLSearchParams(s);
  const pre = precargarDesdeConsulta(q(`producto=${P1}&tipo=TRANSFERENCIA&depositoOrigen=${D1}&depositoDestino=${D2}&cantidad=4.5`), catMov, f0);

  igual("precarga válida (transferencia desde Reposición): producto, tipo, depósitos y cantidad", [pre.formulario.productoId, pre.formulario.tipo, pre.formulario.origen, pre.formulario.depositoOrigenId, pre.formulario.depositoDestinoId, pre.formulario.cantidad, pre.descartados, pre.precargado], [P1, "TRANSFERENCIA", "TRANSFERENCIA", D1, D2, 4.5, [], true]);
  igual("precarga con depósito no autorizado: se descarta y se informa", ((p) => [p.formulario.depositoOrigenId, p.descartados])(precargarDesdeConsulta(q(`tipo=SALIDA&depositoOrigen=${D3}`), catMov, f0)), ["", ["el depósito origen"]]);
  igual("precarga con producto inexistente o de unidad identificada: descartado", [precargarDesdeConsulta(q("producto=inventado"), catMov, f0).descartados, precargarDesdeConsulta(q("producto=p3"), catMov, f0).formulario.productoId], [["el producto"], ""]);
  igual("precarga con tipo inválido o cantidad inválida: descartados, el formulario queda intacto", ((p) => [p.formulario, p.descartados, p.precargado])(precargarDesdeConsulta(q("tipo=ROBO&cantidad=-3"), catMov, f0)), [f0, ["el tipo de movimiento", "la cantidad"], false]);
  igual("precarga de depósito destino en una SALIDA (no aplica al tipo): descartado", precargarDesdeConsulta(q(`tipo=SALIDA&depositoDestino=${D2}`), catMov, f0).descartados, ["el depósito destino"]);
  igual("precarga sin parámetros: formulario sin cambios y sin aviso", ((p) => [p.formulario, p.descartados, p.precargado])(precargarDesdeConsulta(q(""), catMov, f0)), [f0, [], false]);
  igual("enlace de contexto: solo ids y cantidad, y se reconstruye igual", ((url) => precargarDesdeConsulta(new URLSearchParams(url.split("?")[1]), catMov, f0).formulario.depositoDestinoId)(enlaceNuevoMovimiento({ productoId: P1, tipo: "ENTRADA", depositoDestinoId: D2 })), D2);
  cierto("el enlace no incluye cantidades inválidas", !/cantidad/.test(enlaceNuevoMovimiento({ productoId: P1, cantidad: 0 })) && /^\/movimientos\/nuevo\?producto=/.test(enlaceNuevoMovimiento({ productoId: P1 })));

  // pantallas y API (contenido real del código)
  const nuevoPage = leer("app/(private)/movimientos/nuevo/page.tsx");
  const detallePage = leer("app/(private)/stock/[id]/page.tsx");
  const movApi = leer("app/api/movimientos/route.ts");

  cierto("Nuevo movimiento: sin badge «Registrado» antes de guardar; estado «Sin registrar»; sin aviso duplicado del número", !/>\s*Registrado\s*</.test(nuevoPage) && /Sin registrar/.test(nuevoPage) && !/MOV-XXXXXX se\s+genera/.test(nuevoPage));
  cierto("Nuevo movimiento: validación por campo con foco, cambios sin guardar y envío único", /validarMovimiento\(/.test(nuevoPage) && /getElementById\(idCampo/.test(nuevoPage) && /useProtegerCambios/.test(nuevoPage) && /if \(saving\) return/.test(nuevoPage) && /disabled=\{saving \|\| cargando\}/.test(nuevoPage));
  cierto("Nuevo movimiento: idempotencia preservada (clave por formulario, renovada al editar)", /crypto\.randomUUID\(\)/.test(nuevoPage) && /clave\.current = ""/.test(nuevoPage) && /claveIdempotencia: clave\.current/.test(nuevoPage));
  cierto("Nuevo movimiento: campos condicionales (origen/destino/costo/lote según tipo y producto) y fecha local es-PY", /info\.origen \?/.test(nuevoPage) && /info\.destino \?/.test(nuevoPage) && /info\.costo \?/.test(nuevoPage) && /modoControl === "LOTE"/.test(nuevoPage) && /CampoFecha/.test(nuevoPage));
  cierto("Nuevo movimiento: la referencia se declara como texto libre sin vínculo fiscal", /no se vincula ni se valida contra facturas/.test(nuevoPage));
  cierto("Nuevo movimiento: layout con MOVIMIENTOS.CREAR (la API ya exige CREAR al registrar)", /guardPage\("MOVIMIENTOS", "CREAR"\)/.test(leer("app/(private)/movimientos/nuevo/layout.tsx")) && /denyIfNoPermission\(session, "MOVIMIENTOS", "CREAR"\)/.test(movApi));
  cierto("API de catálogos de movimientos: saldos y lotes limitados a los depósitos que el usuario puede operar", (movApi.match(/usuario_puede_deposito\(\$1::uuid, \$2::uuid, s\.deposito_id\)/g) ?? []).length === 2);
  cierto("Movimientos: el registro sigue pasando por la función SQL oficial (sin escritura directa de saldos)", /inventario_registrar_movimiento/.test(leer("lib/movimientos/shared.ts")) && !/INSERT INTO stock_saldos|UPDATE stock_saldos/.test(movApi + nuevoPage + detallePage + leer("lib/movimientos/shared.ts")));
  cierto("Detalle de Stock: cabecera con ruta, accesos condicionados por permisos y sin acciones fiscales/de compra", /movimientosCrear/.test(detallePage) && /movimientosVer/.test(detallePage) && /enlaceNuevoMovimiento/.test(detallePage) && !/Factura|Nota de crédito|Orden de compra|Comprar/i.test(detallePage));
  cierto("Detalle de Stock: conserva todas las secciones (5 indicadores, política, valorización, depósitos, lotes) y «Sin ubicación registrada»", ["Disponible", "Reservado", "Cuarentena", "Tránsito", "Valor físico", "Stock mínimo", "Punto de reposición", "Stock máximo", "Total físico", "Total virtual", "Costo promedio", "Propiedad", "Propietario", "Lotes y vencimientos", "Stock por depósito", "Sin ubicación registrada"].every((t) => detallePage.includes(t)));
  cierto("Detalle de Stock: la acción de mover se oculta para unidades identificadas y sin permiso", /puedeMover = puedeAbrirNuevoMovimiento\(permisos\) && item\.modoControl !== "UNIDAD_ETIQUETADA"/.test(detallePage));
  cierto("Detalle de Stock: el valor físico no se llama «costo promedio»", !/Valor físico[\s\S]{0,200}Costo promedio<\/small>/.test(detallePage));
  cierto("API del detalle de stock: devuelve permisos solo para mostrar accesos (cada API verifica el suyo)", /movimientosCrear: hasPermission\(acceso, "MOVIMIENTOS", "CREAR"\)/.test(leer("app/api/stock/[id]/route.ts")));
  cierto("Reposición: transferencia precargada solo con permiso, desde el cálculo auditado; sin botones de compra ni escritura", /enlaceNuevoMovimiento\(\{ productoId: f\.productoId, tipo: "TRANSFERENCIA"/.test(repPage) && /Preparar transferencia/.test(repPage) && !/method:\s*"(POST|PUT|DELETE)"/.test(repPage) && !/Comprar ahora|Generar pedido|Crear orden/i.test(repPage));
  cierto("Reposición: indicadores con el mismo criterio que la tabla (solo planes) y aviso de lo que oculta el filtro por defecto", /f\.necesita && f\.criticidad === "SIN_STOCK"/.test(repPage) && /oculta \{filas\.length - visibles\.length\}/.test(repPage) && /Simulación local\./.test(repPage));
  cierto("Reposición: sigue usando el plan global auditado (AUD-REP-01…04)", /calcularPlanReposicion\(/.test(repPage));
  cierto("Movimientos: la lista acepta ?buscar=<código> (histórico del producto con datos reales)", /get\("buscar"\)/.test(leer("app/(private)/movimientos/page.tsx")));

  // ── Auditoría complementaria (HOM-UX): navegación interna, unidad identificada, simulación vs transferencia preparada, lotes concurrentes
  const loc = { origen: "https://app.test", ruta: "/movimientos/nuevo", consulta: "" };
  const nav = (a: Parameters<typeof navegacionInternaAbandona>[0]) => navegacionInternaAbandona(a, loc);

  igual("navegación interna: enlace a otra ruta de la aplicación pide confirmación (menú, migas, volver)", [nav({ href: "/stock" }), nav({ href: "https://app.test/reposicion" }), nav({ href: "/movimientos?buscar=P-1" })], [true, true, true]);
  igual("navegación interna: misma ruta/consulta, ancla, otra pestaña, modificadores, descargas, botón del medio y otros sitios no piden confirmación aquí", [nav({ href: "/movimientos/nuevo" }), nav({ href: "#campo" }), nav({ href: "/stock", target: "_blank" }), nav({ href: "/stock", modificador: true }), nav({ href: "/x.pdf", download: true }), nav({ href: "/stock", boton: 1 }), nav({ href: "https://otro.com/x" }), nav({ href: "mailto:a@b.c" }), nav({ href: "/stock", target: "_self" })], [false, false, false, false, false, false, false, false, true]);
  igual("navegación interna: misma ruta con otra consulta sí abandona el estado del formulario", nav({ href: "/movimientos/nuevo?producto=1" }), true);
  cierto("el hook se registra en captura en el documento (antes del enrutador) y cubre beforeunload; Nuevo movimiento lo usa", /addEventListener\("click", alHacerClic, true\)/.test(leer("lib/ui/proteger-cambios.ts")) && /beforeunload/.test(leer("lib/ui/proteger-cambios.ts")) && /useProtegerCambios\(sucio\)/.test(nuevoPage) && !/confirmarSalida/.test(nuevoPage));
  cierto("el límite del botón «Atrás» está declarado en el código y en la documentación", /botón «Atrás»/.test(leer("lib/ui/proteger-cambios.ts")) && /Atrás/.test(leer("documentacao/v1/homologacao-visual/HOMOLOGACION-FUNCIONAL-STOCK-REPOSICION-MOVIMIENTOS-2026-10-12.md")));

  // Reposición: unidades identificadas
  const lecturaModo = await leerEntradasReposicion({
    async query(sql: string) {
      if (/FROM productos p/.test(sql)) return { rows: [{ id: P1, codigo: "P-1", descripcion: "Equipo", marca: "", unidad: "U", modoControl: "UNIDAD_ETIQUETADA", minimo: 10, maximo: 100, punto: 20, proveedorNombre: null, proveedorPlazo: null, proveedorMinima: null }], rowCount: 1 };
      if (/SELECT count\(\*\)::int AS n FROM depositos/.test(sql)) return { rows: [{ n: 1 }], rowCount: 1 };
      if (/FROM depositos d JOIN usuarios u/.test(sql)) return { rows: [{ id: D1, codigo: "C", nombre: "Central" }], rowCount: 1 };

      return { rows: [], rowCount: 0 };
    },
  } as never, EMPRESA, USUARIO);

  igual("Reposición: el modo de control del producto llega a cada renglón y la sugerencia se calcula igual (planificación)", [lecturaModo.entradas[0].modoControl, calcularReposicion(lecturaModo.entradas[0], { incluirTransito: false }).sugerida], ["UNIDAD_ETIQUETADA", 100]);
  cierto("Reposición: la consulta lee modo_control_stock y la pantalla no ofrece «Preparar transferencia» para unidades identificadas", /p\.modo_control_stock AS "modoControl"/.test(leer("lib/reposicion/datos.ts")) && /f\.modoControl !== "UNIDAD_ETIQUETADA"/.test(repPage) && /Unidad identificada \(serie\/etiqueta\)/.test(repPage));

  // Reposición: simulación vs transferencia preparada (nunca supera lo confirmado por el plan global)
  const D6 = "d6d6d6d6-d6d6-4d6d-8d6d-d6d6d6d6d6d6";
  const dosOrigenes = calcularPlanReposicion([{ ...base, saldo: { disponible: 10, reservado: 0, cuarentena: 0, transito: 0 }, otrosDepositos: [{ id: D2, nombre: "S", disponible: 60, minimo: 10, punto: 30 }, { id: D6, nombre: "N", disponible: 50, minimo: 10, punto: 30 }] }], { incluirTransito: false })[0];
  const prep = (p: number | null) => transferenciasPlanificadas(dosOrigenes, p).map((t) => [t.depositoId, t.cantidad]);

  igual("plan base: 90 sugeridos; transferencias confirmadas 30 (S) + 20 (N); compra 40", [dosOrigenes.sugerida, dosOrigenes.transferencias.map((t) => [t.depositoId, t.cantidad]), dosOrigenes.sugeridaCompra], [90, [[D2, 30], [D6, 20]], 40]);
  igual("sin simulación escrita se prepara lo confirmado por el plan", prep(null), [[D2, 30], [D6, 20]]);
  igual("simulación menor que lo transferible: se prepara solo esa cantidad, en el orden del plan", [prep(10), prep(30), prep(35)], [[[D2, 10]], [[D2, 30]], [[D2, 30], [D6, 5]]]);
  igual("simulación mayor que lo confirmado: el excedente es compra, nunca traslado (no se supera la disponibilidad de los orígenes)", [prep(500), prep(90)], [[[D2, 30], [D6, 20]], [[D2, 30], [D6, 20]]]);
  igual("simulación 0: no se prepara ninguna transferencia", prep(0), []);
  igual("la simulación no altera el cálculo auditado", [dosOrigenes.sugeridaTransferencia, dosOrigenes.sugeridaCompra], [50, 40]);
  cierto("Reposición: el enlace usa la cantidad planificada (transferenciasPlanificadas) y lo explica", /transferenciasPlanificadas\(f, escrita\)/.test(repPage) && /\(simulada\)/.test(repPage));

  // Movimientos: lote nuevo concurrente (ON CONFLICT) y repetición de la misma solicitud
  const consultasLote: string[] = [];
  const clienteLote = (carrera: boolean) => {
    let buscado = 0;

    return {
      async query(sql: string) {
        consultasLote.push(sql);
        if (/SELECT modo_control_stock/.test(sql)) return { rows: [{ modo: "LOTE" }], rowCount: 1 };
        if (/FROM stock_lotes/.test(sql)) return carrera && ++buscado > 1 ? { rows: [{ id: "lote-creado-por-otra", venc: null }], rowCount: 1 } : { rows: [], rowCount: 0 };
        if (/INSERT INTO stock_lotes/.test(sql)) return carrera ? { rows: [], rowCount: 0 } : { rows: [{ id: "lote-nuevo" }], rowCount: 1 };

        return { rows: [], rowCount: 0 };
      },
    } as never;
  };
  const datosLote = { tipo: "ENTRADA", productoId: P1, lote: "L-9", vencimiento: null } as never;

  igual("lote nuevo sin carrera: se crea", await resolverLote(clienteLote(false), EMPRESA, datosLote), "lote-nuevo");
  igual("lote nuevo con solicitud simultánea (ON CONFLICT DO NOTHING): reutiliza el lote creado por la otra en lugar de fallar", await resolverLote(clienteLote(true), EMPRESA, datosLote), "lote-creado-por-otra");
  cierto("el alta de lote usa ON CONFLICT sobre la clave única (empresa, producto, código)", consultasLote.some((q) => /ON CONFLICT \(empresa_id, producto_id, codigo_lote\) DO NOTHING/.test(q)));
  cierto("la clave de idempotencia se serializa por empresa+clave con bloqueo asesor transaccional y compara huella de la solicitud (NEX-014)", /pg_advisory_xact_lock\(hashtextextended\('movimientos\.idem:'/.test(leer("documentacao/banco/nexit/v1/migraciones/NEX-014-movimientos-operativos.sql")) && /IDEMPOTENCIA_CONFLICTO/.test(leer("documentacao/banco/nexit/v1/migraciones/NEX-014-movimientos-operativos.sql")));
  cierto("existe el script de prueba de idempotencia con PostgreSQL real, protegido contra ejecución accidental", /CONFIRMO_PRUEBA_EN_AMBIENTE_REAL/.test(leer("documentacao/banco/nexit/v1/scripts/prueba-idempotencia-movimientos.js")) && /Promise\.all/.test(leer("documentacao/banco/nexit/v1/scripts/prueba-idempotencia-movimientos.js")));
  cierto("la lista de Movimientos ya no usa setState en efectos para paginar y conserva ?ok= y ?buscar=", !/setPagina\(1\);\s*\}, \[busqueda/.test(leer("app/(private)/movimientos/page.tsx")) && /consulta\.get\("ok"\)/.test(leer("app/(private)/movimientos/page.tsx")) && /consulta\.get\("buscar"\)/.test(leer("app/(private)/movimientos/page.tsx")));

  // ── Correcciones de la auditoría 71ae486: alcance del historial, paginación en el servidor, aviso confirmado, matriz de origen y motivo
  // Reglas aprobadas (formulario y API usan el mismo módulo)
  igual("matriz de orígenes aprobada (primero = predeterminado)", ORDEN_TIPOS.map((t) => ORIGENES_POR_TIPO[t]), [["COMPRA", "DEVOLUCION", "INVENTARIO", "MANUAL"], ["VENTA", "DEVOLUCION", "INVENTARIO", "MANUAL"], ["TRANSFERENCIA"], ["AJUSTE", "INVENTARIO", "MANUAL"], ["AJUSTE", "INVENTARIO", "MANUAL"], ["AJUSTE", "MANUAL"], ["AJUSTE", "MANUAL"], ["AJUSTE", "MANUAL"], ["AJUSTE", "MANUAL"]]);
  igual("el formulario toma los orígenes de la misma matriz que la API", ORDEN_TIPOS.every((t) => TIPOS_INFO[t].origenes === ORIGENES_POR_TIPO[t]), true);
  igual("motivo obligatorio: ajustes, cuarentena, reservas y entradas/salidas manuales o de inventario", [
    motivoObligatorio("AJUSTE_POSITIVO", "AJUSTE"), motivoObligatorio("AJUSTE_NEGATIVO", "MANUAL"), motivoObligatorio("CUARENTENA", "AJUSTE"), motivoObligatorio("LIBERACION_CUARENTENA", "MANUAL"),
    motivoObligatorio("RESERVA", "AJUSTE"), motivoObligatorio("LIBERACION_RESERVA", "MANUAL"), motivoObligatorio("ENTRADA", "MANUAL"), motivoObligatorio("ENTRADA", "INVENTARIO"), motivoObligatorio("SALIDA", "MANUAL"), motivoObligatorio("SALIDA", "INVENTARIO"),
  ], Array(10).fill(true));
  igual("motivo opcional: compra, devolución, venta y transferencia", [motivoObligatorio("ENTRADA", "COMPRA"), motivoObligatorio("ENTRADA", "DEVOLUCION"), motivoObligatorio("SALIDA", "VENTA"), motivoObligatorio("SALIDA", "DEVOLUCION"), motivoObligatorio("TRANSFERENCIA", "TRANSFERENCIA")], Array(5).fill(false));
  const cuerpoOk = { tipo: "ENTRADA", origen: "COMPRA", fecha: "2026-10-12", productoId: "11111111-1111-4111-8111-111111111111", cantidad: 2, costoUnitario: 10, depositoDestinoId: "22222222-2222-4222-8222-222222222222" };
  const prepara = (c: Record<string, unknown>) => { try { return prepararMovimiento({ ...cuerpoOk, ...c }).origen; } catch (e) { return (e as Error).message; } };

  igual("API: origen coherente con el tipo se acepta", prepara({}), "COMPRA");
  igual("API: origen fuera de la matriz se rechaza (ENTRADA con VENTA, TRANSFERENCIA con MANUAL, RESERVA con COMPRA)", [prepara({ origen: "VENTA" }), prepara({ tipo: "TRANSFERENCIA", origen: "MANUAL", depositoOrigenId: "33333333-3333-4333-8333-333333333333" }), prepara({ tipo: "RESERVA", origen: "COMPRA", depositoOrigenId: "33333333-3333-4333-8333-333333333333" })], ["El origen VENTA no es válido para el tipo ENTRADA.", "El origen MANUAL no es válido para el tipo TRANSFERENCIA.", "El origen COMPRA no es válido para el tipo RESERVA."]);
  igual("API: sin origen se usa el predeterminado del tipo", prepara({ origen: "", tipo: "AJUSTE_POSITIVO", motivo: "Conteo físico" }), "AJUSTE");
  igual("API: origen inexistente sigue rechazado", prepara({ origen: "XYZ" }), "Origen de movimiento no válido.");
  igual("API: motivo obligatorio (menos de 5 caracteres) se rechaza; con motivo se acepta", [prepara({ tipo: "AJUSTE_POSITIVO", origen: "AJUSTE" }), prepara({ tipo: "AJUSTE_POSITIVO", origen: "AJUSTE", motivo: "abc" }), prepara({ tipo: "AJUSTE_POSITIVO", origen: "AJUSTE", motivo: "Conteo físico" })], [mensajeMotivoObligatorio, mensajeMotivoObligatorio, "AJUSTE"]);
  igual("API: motivo opcional en una compra", prepara({ motivo: "" }), "COMPRA");
  igual("formulario: origen fuera de matriz y motivo faltante se señalan por campo", [val({ origen: "VENTA" }).origen, val({ tipo: "AJUSTE_POSITIVO", origen: "AJUSTE", motivo: "" }).motivo, val({ tipo: "AJUSTE_POSITIVO", origen: "AJUSTE", motivo: "Conteo físico" }).motivo], ["Ese origen no es válido para el tipo de movimiento.", mensajeMotivoObligatorio, undefined]);
  cierto("Nuevo movimiento: etiqueta el motivo como obligatorio solo cuando corresponde", /motivoObligatorio\(form\.tipo, form\.origen\)/.test(nuevoPage) && /Obligatorio para este tipo y origen/.test(nuevoPage));
  cierto("la política de origen y motivo no toca SQL ni migrations (las funciones siguen aceptando todo)", !/CREATE OR REPLACE FUNCTION/.test(leer("lib/movimientos/reglas.ts")) && /no se modificó ninguna función ni migration/.test(leer("lib/movimientos/reglas.ts")));

  // Historial: alcance, paginación y filtros en el servidor
  const consultas = construirConsultas(EMPRESA, USUARIO, { q: "Leche_100%", tipo: "TRANSFERENCIA", orden: "cantidad", dir: "desc", pagina: 3, tamano: 20 }, 3);

  cierto("historial: la consulta filtra por empresa de la sesión y por el alcance de depósitos (origen y destino) del usuario", /m\.empresa_id = \$1/.test(consultas.lista.sql) && /alcance_depositos = 'TODOS'/.test(consultas.lista.sql) && /usuario_deposito/.test(consultas.lista.sql) && /m\.deposito_origen_id IN/.test(consultas.lista.sql) && /m\.deposito_destino_id IN/.test(consultas.lista.sql) && consultas.lista.params[0] === EMPRESA && consultas.lista.params[1] === USUARIO);
  cierto("historial: el conteo usa exactamente el mismo alcance y filtros que la lista", /alcance_depositos = 'TODOS'/.test(consultas.conteo.sql) && /m\.deposito_origen_id IN/.test(consultas.conteo.sql) && JSON.stringify(consultas.conteo.params) === JSON.stringify(consultas.lista.params.slice(0, consultas.conteo.params.length)));
  cierto("historial: el movimiento sin ningún depósito no se muestra y el alcance incluye depósitos inactivos", /deposito_origen_id IS NOT NULL OR m\.deposito_destino_id IS NOT NULL/.test(consultas.lista.sql) && !/d\.activo/.test(consultas.lista.sql));
  igual("historial: tipo, búsqueda (comodines escapados), orden y desplazamiento llegan como parámetros", [consultas.lista.params.slice(2), /m\.tipo_movimiento = \$3/.test(consultas.lista.sql), /ILIKE \$4 ESCAPE '!'/.test(consultas.lista.sql), /ORDER BY l\.cantidad DESC, m\.numero_movimiento DESC, l\.creado_at, l\.id LIMIT \$5 OFFSET \$6/.test(consultas.lista.sql)], [["TRANSFERENCIA", "%Leche!_100!%%", 20, 40], true, true, true]);
  igual("historial: valores no permitidos (tipo, orden, tamaño, página) se normalizan y nunca llegan al SQL como texto", ((n) => [n.tipo, n.orden, n.dir, n.pagina, n.tamano])(normalizarConsulta({ tipo: "X'; DROP TABLE", orden: "m.id; DELETE", dir: "sideways", pagina: -4, tamano: 100000 })), ["", null, "asc", 1, 100]);
  cierto("historial: sin orden explícito se mantiene el orden por número descendente", /ORDER BY m\.numero_movimiento DESC, m\.numero_movimiento DESC/.test(construirConsultas(EMPRESA, USUARIO, {}, 1).lista.sql));

  const regH: Array<{ sql: string; parametros: unknown[] }> = [];
  const dbH = (lineas: number, movs: number) => ({
    async query(sql: string, parametros: unknown[] = []) {
      regH.push({ sql, parametros });
      if (/count\(\*\)::int AS lineas/.test(sql)) return { rows: [{ lineas, movimientos: movs }], rowCount: 1 };
      if (/AS entradas/.test(sql)) return { rows: [{ movimientos: 50, entradas: 20, salidas: 25, transferencias: 5 }], rowCount: 1 };
      if (/LIMIT \$\d+ OFFSET/.test(sql)) return { rows: [{ id: "m1", lineaId: "l1", numero: "MOV-000001" }], rowCount: 1 };

      return { rows: [], rowCount: 0 };
    },
  } as never);
  const h1 = await leerHistorial(dbH(45, 40), EMPRESA, USUARIO, { pagina: 2, tamano: 20 });

  igual("historial: paginación real (45 líneas / 40 movimientos, 20 por página → 3 páginas, página 2, desplazamiento 20)", [h1.total, h1.totalMovimientos, h1.totalPaginas, h1.pagina, regH.find((q) => /LIMIT/.test(q.sql))?.parametros.slice(-2)], [45, 40, 3, 2, [20, 20]]);
  igual("historial: el resumen cuenta movimientos dentro del alcance, sin filtros", h1.resumen, { movimientos: 50, entradas: 20, salidas: 25, transferencias: 5 });
  cierto("historial: el resumen aplica el mismo alcance de depósitos", regH.filter((q) => /AS entradas/.test(q.sql)).every((q) => /m\.deposito_origen_id IN/.test(q.sql)));
  igual("historial: página fuera de rango se ajusta a la última", (await leerHistorial(dbH(45, 40), EMPRESA, USUARIO, { pagina: 99, tamano: 20 })).pagina, 3);
  igual("historial: sin resultados no consulta la lista y devuelve 1 página", ((r) => [r.movimientos, r.totalPaginas, r.total])(await leerHistorial(dbH(0, 0), EMPRESA, USUARIO, {})), [[], 1, 0]);
  const antes = regH.length;

  igual("confirmación: un número con formato inválido no consulta la base y no confirma", [await movimientoExiste(dbH(0, 0), EMPRESA, USUARIO, "MOV-1; DROP"), regH.length], [false, antes]);
  igual("confirmación: consulta con empresa y usuario de la sesión y alcance", await (async () => { const d = { async query(sql: string, p: unknown[]) { regH.push({ sql, parametros: p }); return { rows: [{}], rowCount: 1 }; } } as never; const ok = await movimientoExiste(d, EMPRESA, USUARIO, "MOV-000123"); const q = regH[regH.length - 1]; return [ok, q.parametros, /alcance_depositos = 'TODOS'/.test(q.sql)]; })(), [true, [EMPRESA, USUARIO, "MOV-000123"], true]);
  igual("detalle: las líneas del movimiento se leen con el mismo alcance (404 si algún depósito está fuera)", await (async () => { await leerLineasMovimiento(dbH(0, 0), EMPRESA, USUARIO, "mov-id"); const q = regH[regH.length - 1]; return [q.parametros, /m\.deposito_origen_id IN/.test(q.sql) && /m\.deposito_destino_id IN/.test(q.sql)]; })(), [[EMPRESA, USUARIO, "mov-id"], true]);

  // Rutas y pantalla (contenido real)
  const movRuta = leer("app/api/movimientos/route.ts");
  const detRuta = leer("app/api/movimientos/[id]/route.ts");
  const movLista = leer("app/(private)/movimientos/page.tsx");

  cierto("API del historial: sin límite fijo de 2000 filas; usa leerHistorial con paginación del servidor y la sesión", !/LIMIT 2000/.test(movRuta) && /leerHistorial\(db, empresaId, session\.user\.id/.test(movRuta));
  cierto("API del detalle: usa el alcance de depósitos (leerLineasMovimiento con el usuario de la sesión)", /leerLineasMovimiento\(db, empresaId, session\.user\.id, id\)/.test(detRuta) && !/\$\{SELECT_FILAS\} WHERE m\.empresa_id = \$1 AND m\.id = \$2/.test(detRuta));
  cierto("Movimientos (lista): búsqueda, tipo, orden y página se envían al servidor (sin filtrar un arreglo local)", /cargarMovimientos\(\{/.test(movLista) && /orden: orden\?\.campo/.test(movLista) && !/\.filter\(/.test(movLista) && !/ordenarLista/.test(movLista));
  cierto("Movimientos (lista): el aviso de registro solo aparece si el servidor lo confirma; el error de carga es un aviso aparte", /datos\.confirmado === true/.test(movLista) && /No se pudo confirmar el registro/.test(movLista) && /className=\{ui\.alertError\} role="alert" style=\{\{ margin: "0 0 8px" \}\}/.test(movLista) && !/setFlash\(`Movimiento \$\{ok\}/.test(movLista));
  cierto("Movimientos (lista): distingue líneas de movimientos en los contadores", /línea\(s\)/.test(movLista) && /totalMovimientos/.test(movLista));
  cierto("Reposición: comunica sugerida, planificada y preparada y no registra nada", /Preparar transferencia<\/strong> solo abre Nuevo movimiento/.test(repPage) && /Simulado \{cant\(escrita\)\}: transferir/.test(repPage) && !/method:\s*"(POST|PUT|DELETE)"/.test(repPage));

  // ── Auditoría de campo (d0e11ba): detalle de movimiento / anulación, Reposición vacía, Depósitos (bloqueado)
  const detMov = leer("app/(private)/movimientos/[id]/page.tsx");
  const anularRuta = leer("app/api/movimientos/[id]/anular/route.ts");

  cierto("VIS-03 detalle: anulación con etiqueta, campo, error inline (mínimo 5), foco, confirmación de acción crítica y estado de envío", /Motivo de la anulación/.test(detMov) && /MOTIVO_MINIMO/.test(detMov) && /getElementById\("anular-motivo"\)/.test(detMov) && /window\.confirm\(/.test(detMov) && /Anulando\.\.\./.test(detMov) && /aria-invalid/.test(detMov));
  cierto("VIS-03 detalle: la anulación solo se muestra con MOVIMIENTOS.ANULAR, movimiento REGISTRADO y que no sea una anulación", /permisos\.anular && mov\.estado === "REGISTRADO" && !mov\.anulaA/.test(detMov) && /hasPermission\(acceso, "MOVIMIENTOS", "ANULAR"\)/.test(leer("app/api/movimientos/[id]/route.ts")));
  cierto("VIS-03 detalle: reintento de la misma anulación usa la misma clave de idempotencia (se renueva al cambiar el motivo)", /clave\.current = crypto\.randomUUID\(\)/.test(detMov) && /anularMovimientoApi\(params\.id, motivo\.trim\(\), clave\.current\)/.test(detMov) && /claveIdempotencia: string = crypto\.randomUUID\(\)/.test(leer("lib/movimientos/cliente-api.ts")));
  cierto("VIS-03 detalle: usa el patrón visual de lista/catálogos, protege motivo escrito y no usa el CSS antiguo con aviso duplicado", /lista-padrao\/lista\.module\.css/.test(detMov) && /useProtegerCambios/.test(detMov) && !/MOVIMIENTO<\/span>/.test(detMov));
  cierto("VIS-03 anular: la API valida permiso ANULAR y el mismo alcance de depósitos; el estorno sigue siendo la función SQL compensatoria", /denyIfNoPermission\(session, "MOVIMIENTOS", "ANULAR"\)/.test(anularRuta) && /ALCANCE_MOVIMIENTO/.test(anularRuta) && /inventario_anular_movimiento/.test(anularRuta) && !/DELETE FROM|UPDATE movimientos_inventario/.test(anularRuta));
  cierto("VIS-05 Reposición: estado vacío específico («Ningún producto necesita reposición») con «Ver todos», sin cambiar el filtro inicial ni el cálculo", /Ningún producto necesita reposición/.test(repPage) && /Ver todos los renglones/.test(repPage) && /useState<"TODAS" \| "NECESITAN" \| Criticidad>\("NECESITAN"\)/.test(repPage) && /calcularPlanReposicion\(/.test(repPage));

  // ── Gestión de Depósitos (NEX-046)
  const mig46 = leer("documentacao/banco/nexit/v1/migraciones/NEX-046-depositos-gestion.sql");
  const rev46 = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-046.sql");
  const dpApi = leer("app/api/depositos/route.ts");
  const dpId = leer("app/api/depositos/[id]/route.ts");
  const dpEstado = leer("app/api/depositos/[id]/estado/route.ts");
  const dpPage = leer("app/(private)/depositos/page.tsx");
  const dpOk = { codigo: "DEP-NUEVO", nombre: "Depósito nuevo", sucursalId: D1 };

  igual("depósito: formulario válido sin errores (alta)", validarDeposito(dpOk, true), {});
  igual("depósito: código obligatorio y con formato (sin espacios, hasta 30)", [validarDeposito({ ...dpOk, codigo: "" }, true).codigo, validarDeposito({ ...dpOk, codigo: "DEP 1" }, true).codigo !== undefined, validarDeposito({ ...dpOk, codigo: "X".repeat(31) }, true).codigo !== undefined, validarDeposito({ ...dpOk, codigo: "dep.1-a_b" }, true).codigo], ["El código es obligatorio.", true, true, undefined]);
  igual("depósito: al editar el código no se valida (es inmutable)", validarDeposito({ ...dpOk, codigo: "" }, false), {});
  igual("depósito: nombre obligatorio (máx. 120) y sucursal obligatoria", [validarDeposito({ ...dpOk, nombre: "  " }, true).nombre, validarDeposito({ ...dpOk, nombre: "x".repeat(121) }, true).nombre !== undefined, validarDeposito({ ...dpOk, sucursalId: "" }, true).sucursalId], ["El nombre es obligatorio.", true, "Seleccione la sucursal."]);
  igual("depósito: errores en orden visual (código, nombre, sucursal)", Object.keys(validarDeposito({ codigo: "", nombre: "", sucursalId: "" }, true)), ["codigo", "nombre", "sucursalId"]);
  igual("depósito: cambios sin guardar", [formularioDepositoSucio(dpOk, dpOk), formularioDepositoSucio({ ...dpOk, nombre: " Depósito nuevo " }, dpOk), formularioDepositoSucio({ ...dpOk, nombre: "Otro" }, dpOk)], [false, false, true]);

  const regD: Array<{ sql: string; parametros: unknown[] }> = [];
  const listaD = await listarDepositos({ async query(sql: string, parametros: unknown[] = []) { regD.push({ sql, parametros }); return { rows: [], rowCount: 0 }; } } as never, EMPRESA, USUARIO);
  const consultaD = regD.find((q) => /FROM depositos d JOIN sucursales s/.test(q.sql))!;

  igual("depósito: la lista usa empresa y usuario de la sesión y el alcance de depósitos, incluyendo inactivos", [consultaD.parametros, /alcance_depositos = 'TODOS'/.test(consultaD.sql), /usuario_deposito/.test(consultaD.sql), /(WHERE|AND) d\.activo/.test(consultaD.sql)], [[EMPRESA, USUARIO], true, true, false]);
  igual("depósito: las sucursales ofrecidas están en el alcance del usuario", [/alcance_sucursales = 'TODAS'/.test(regD.map((q) => q.sql).join(" ")), /usuario_sucursal/.test(regD.map((q) => q.sql).join(" ")), listaD.depositos], [true, true, []]);
  igual("depósito: errores SQL → HTTP (permiso 403, duplicado 409, saldo 409, no encontrado 404, regla 400)", await Promise.all([{ code: "42501" }, { code: "P0001", detail: "NEX:DEPOSITO_CODIGO_DUPLICADO" }, { code: "P0001", detail: "NEX:DEPOSITO_CON_SALDO", message: "aún tiene saldo" }, { code: "P0001", detail: "NEX:DEPOSITO_NO_ENCONTRADO" }, { code: "P0001", message: "regla" }].map(async (e) => respuestaErrorDeposito(e, "x").status)), [403, 409, 409, 404, 400]);

  cierto("NEX-046: precondiciones y no reaplicación por suposición (códigos duplicados abortan sin tocar datos)", /to_regclass\('public\.depositos'\)/.test(mig46) && /to_regprocedure\('public\.deposito_crear\(uuid,uuid,uuid,text,text,boolean\)'\) IS NOT NULL/.test(mig46) && /GROUP BY empresa_id, lower\(codigo\) HAVING count\(\*\) > 1/.test(mig46) && /no se reaplica por suposición/.test(mig46));
  cierto("NEX-046: permisos INVENTARIO.VER/CREAR/EDITAR creados SIN asignarlos a ningún perfil", /\('INVENTARIO','VER'\), \('INVENTARIO','CREAR'\), \('INVENTARIO','EDITAR'\)/.test(mig46) && !/INSERT INTO\s+(public\.)?perfil_permiso/i.test(mig46) && /OPERACIONAL/.test(mig46));
  cierto("NEX-046: código inmutable por trigger; sin exclusión física (sin DELETE ni TRUNCATE para el rol de la aplicación)", /depositos_codigo_inmutable_trg BEFORE UPDATE/.test(mig46) && /NEW\.codigo IS DISTINCT FROM OLD\.codigo/.test(mig46) && !/GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*public\.depositos/i.test(mig46) && !/DELETE FROM public\.depositos/i.test(mig46));
  cierto("NEX-046: las tres funciones son SECURITY DEFINER con search_path fijo y validan permiso INVENTARIO y alcance dentro de la función", ["deposito_crear", "deposito_editar", "deposito_cambiar_estado"].every((fn) => new RegExp(`FUNCTION public\\.${fn}\\([^)]*\\)\\s+RETURNS \\w+\\s+LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp`).test(mig46)) && /usuario_tiene_permiso\(p_empresa, p_usuario, 'INVENTARIO', 'CREAR'\)/.test(mig46) && (mig46.match(/usuario_tiene_permiso\(p_empresa, p_usuario, 'INVENTARIO', 'EDITAR'\)/g) ?? []).length === 2 && (mig46.match(/deposito_en_alcance\(p_empresa, p_usuario, p_deposito\)/g) ?? []).length === 2 && /sucursal_en_alcance\(p_empresa, p_usuario, p_sucursal\)/.test(mig46));
  cierto("NEX-046: inactivar con saldo se bloquea (el depósito inactivo no permite operar) y activar siempre es posible; el historial no se toca", /NEX:DEPOSITO_CON_SALDO/.test(mig46) && /cantidad <> 0/.test(mig46) && !/UPDATE public\.(movimientos_inventario|stock_saldos|inventario_costos)/.test(mig46));
  cierto("NEX-046: envoltorio de grants conserva base+proveedores+fiscal+productos+comercial y agrega depósitos; solo EXECUTE para el runtime", /nex_aplicar_grants_comercial\(\);\s+PERFORM public\.nex_aplicar_grants_depositos\(\)/.test(mig46) && /GRANT EXECUTE ON FUNCTION public\.deposito_crear/.test(mig46) && /REVOKE ALL ON FUNCTION public\.deposito_crear[^;]*FROM PUBLIC/.test(mig46));
  cierto("NEX-046: reversión protegida (aborta si hay perfiles con INVENTARIO.* y restaura el envoltorio anterior); no borra depósitos", /perfil_permiso/.test(rev46) && /RAISE EXCEPTION/.test(rev46) && !/DELETE FROM public\.depositos|DROP TABLE IF EXISTS public[.]depositos/i.test(rev46) && /nex_aplicar_grants_comercial\(\);\s+END/.test(rev46));
  cierto("NEX-046 no modifica funciones transaccionales de inventario ni migrations anteriores", !/inventario_registrar_movimiento|inventario_anular_movimiento|inventario_registrar_linea/.test(mig46.replace(/--.*$/gm, "")));
  cierto("API de depósitos: permisos INVENTARIO.VER/CREAR/EDITAR, empresa y usuario de la sesión, sin DELETE y sin SQL de escritura directa", /prepararDepositos\("VER"\)/.test(dpApi) && /prepararDepositos\("CREAR"\)/.test(dpApi) && /prepararDepositos\("EDITAR"\)/.test(dpId) && /prepararDepositos\("EDITAR"\)/.test(dpEstado) && !/export (async )?function DELETE/.test(dpApi + dpId + dpEstado) && !/INSERT INTO depositos|UPDATE depositos|DELETE FROM depositos/.test(dpApi + dpId + dpEstado + leer("lib/depositos/shared.ts")) && /session\.user\.empresaId/.test(leer("lib/depositos/servidor.ts")) && /deposito_crear/.test(dpApi) && /deposito_editar/.test(dpId) && /deposito_cambiar_estado/.test(dpEstado));
  cierto("API de depósitos: el código no se puede modificar por PATCH y el alcance fuera de rango es 404", /cuerpo\.codigo !== undefined/.test(dpId) && /noEncontrado\(\)/.test(dpId) && /DEPOSITOS_EN_ALCANCE/.test(leer("lib/depositos/shared.ts")));
  cierto("Depósitos: layout con INVENTARIO.VER; acciones de crear/editar solo con permiso; código deshabilitado al editar; sin acción de borrar", /guardPage\("INVENTARIO", "VER"\)/.test(leer("app/(private)/depositos/layout.tsx")) && /puedeCrear \?/.test(dpPage) && /puedeEditar \?/.test(dpPage) && /disabled=\{form\.id !== null\}/.test(dpPage) && !/Eliminar|Borrar/.test(dpPage) && /useProtegerCambios/.test(dpPage));
  cierto("Menú: Depósitos habilitado (INVENTARIO.VER) solo porque existen página, APIs y permisos", existsSync(join(raiz, "app/(private)/depositos/page.tsx")) && existsSync(join(raiz, "app/api/depositos/route.ts")) && /"\/depositos"/.test(menu.slice(menu.indexOf("V1_HREFS"))) && /permission: "INVENTARIO\.VER"/.test(menu));
  cierto("Integración: Movimientos solo ofrece depósitos activos y autorizados para operar; el historial y Stock conservan los inactivos del alcance", /d\.activo ORDER BY d\.nombre/.test(movApi) && !/d\.activo/.test(consultas.lista.sql) && /activos o no/.test(leer("lib/stock/shared.ts")));
  cierto("Integración: no se tocaron los cálculos de Reposición ni las funciones de stock por la gestión de depósitos", /calcularPlanReposicion\(/.test(repPage) && !/depositos[/]shared/.test(leer("lib/reposicion/calculo.ts")));

  // Movimiento no encontrado tras anular
  cierto("Detalle: tras anular nunca se reemplaza la pantalla por «no encontrado»; se conserva lo mostrado y se avisa", /if \(r\) setDatos\(r\);/.test(detMov) && /La anulación se confirmó, pero no se pudo volver a consultar/.test(detMov));

  // ── Depósitos: CRUD completo con atribuciones de usuarios (decisión del responsable) y riesgos de integridad
  const dpUsuarios = leer("app/api/depositos/[id]/usuarios/route.ts");
  const dpUsuarioDel = leer("app/api/depositos/[id]/usuarios/[usuarioId]/route.ts");
  const sinComentarios = mig46.replace(/--.*$/gm, "");

  cierto("NEX-046: funciones de atribución/revocación SECURITY DEFINER con permiso INVENTARIO.EDITAR y alcance del actor, EXECUTE solo para el runtime", /FUNCTION public\.deposito_usuario_asignar\([^)]*\)\s+RETURNS void\s+LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp/.test(mig46) && /FUNCTION public\.deposito_usuario_revocar\([^)]*\)\s+RETURNS void\s+LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp/.test(mig46) && (mig46.match(/usuario_tiene_permiso\(p_empresa, p_actor, 'INVENTARIO', 'EDITAR'\)/g) ?? []).length === 2 && (mig46.match(/deposito_en_alcance\(p_empresa, p_actor, p_deposito\)/g) ?? []).length === 2 && /REVOKE ALL ON FUNCTION public\.deposito_usuario_asignar[^;]*FROM PUBLIC/.test(mig46) && /GRANT EXECUTE ON FUNCTION public\.deposito_usuario_revocar[^;]*TO nexit_runtime/.test(mig46));
  cierto("NEX-046 atribuciones: multiempresa (usuario buscado con empresa_id), solo alcance ASIGNADOS, sucursal compatible, usuario de baja rechazado, vínculo idempotente", /FROM public\.usuarios WHERE empresa_id = p_empresa AND id = p_usuario/.test(mig46) && /v_alcance <> 'ASIGNADOS'/.test(mig46) && /NEX:USUARIO_ALCANCE_TODOS/.test(mig46) && /sucursal_en_alcance\(p_empresa, p_usuario, v_suc\)/.test(mig46) && /NEX:USUARIO_SUCURSAL_FUERA/.test(mig46) && /v_estado = 'BAJA'/.test(mig46) && /ON CONFLICT DO NOTHING/.test(mig46));
  cierto("NEX-046 revocación: solo borra el vínculo usuario_deposito de esa empresa; no toca movimientos, saldos ni el alcance/perfil del usuario", /DELETE FROM public\.usuario_deposito WHERE empresa_id = p_empresa AND deposito_id = p_deposito AND usuario_id = p_usuario/.test(mig46) && !/UPDATE public\.(usuarios|perfiles|usuario_perfil|usuario_sucursal)|INSERT INTO public\.(usuario_sucursal|usuario_perfil|perfil_permiso)/.test(sinComentarios));
  cierto("riesgo (a) carrera inactivar × operar: FOR UPDATE antes de mirar el saldo y guarda FOR SHARE en stock_saldos (solo aumentos); sin tocar las funciones de inventario", /FROM public\.depositos WHERE empresa_id = p_empresa AND id = p_deposito FOR UPDATE;\s+IF v_actual = p_activo/.test(mig46) && /CREATE TRIGGER stock_saldos_deposito_activo_trg BEFORE INSERT OR UPDATE ON public\.stock_saldos/.test(mig46) && /FROM public\.depositos WHERE empresa_id = NEW\.empresa_id AND id = NEW\.deposito_id FOR SHARE/.test(mig46) && /NEW\.cantidad > 0 AND \(TG_OP = 'INSERT' OR NEW\.cantidad > OLD\.cantidad\)/.test(mig46) && /cantidad <> 0/.test(mig46) && !/CREATE OR REPLACE FUNCTION public\.inventario_/.test(mig46));
  cierto("riesgo (b) autoatribución del creador explícita: parámetro p_asignar_creador, la API solo la acepta si es true y la pantalla la ofrece solo con alcance ASIGNADOS, explicada", /p_asignar_creador boolean/.test(mig46) && /IF coalesce\(p_asignar_creador, false\)/.test(mig46) && /cuerpo\.asignarme === true/.test(dpApi) && /Asignarme este depósito/.test(dpPage) && /alcanceDepositos === "ASIGNADOS"/.test(dpPage) && /No cambia su alcance general/.test(dpPage) && !/INSERT INTO public\.usuario_deposito[^;]*\n\s+SELECT u\.empresa_id, u\.id, v_id, u\.id FROM public\.usuarios u\s+WHERE u\.empresa_id = p_empresa AND u\.id = p_usuario AND u\.alcance_depositos = 'ASIGNADOS';/.test(mig46));
  cierto("riesgo (c) cambio de sucursal: bloqueado con movimientos o con usuarios atribuidos sin la nueva sucursal; fila bloqueada; solo el nombre cambia libremente", /SELECT sucursal_id INTO v_suc_actual FROM public\.depositos WHERE empresa_id = p_empresa AND id = p_deposito FOR UPDATE/.test(mig46) && /NEX:DEPOSITO_SUCURSAL_CON_MOVIMIENTOS/.test(mig46) && /NEX:DEPOSITO_SUCURSAL_USUARIOS/.test(mig46) && /NOT public\.sucursal_en_alcance\(p_empresa, ud\.usuario_id, p_sucursal\)/.test(mig46));
  cierto("riesgo (d) inactivar no pierde el depósito: no borra vínculos ni historial; Stock, historial y administración siguen mostrando inactivos del alcance", !/DELETE FROM/.test(mig46.slice(mig46.indexOf("CREATE OR REPLACE FUNCTION public.deposito_cambiar_estado"), mig46.indexOf("CREATE OR REPLACE FUNCTION public.deposito_usuario_asignar"))) && /UPDATE public\.depositos SET activo = p_activo/.test(mig46) && !/(WHERE|AND) d\.activo/.test(consultaD.sql) && !/d\.activo/.test(consultas.lista.sql));
  cierto("reversión actualizada: elimina funciones de atribución, trigger y guarda de saldos; conserva depósitos y vínculos; aborta si hay perfiles con INVENTARIO.*", /deposito_usuario_revocar/.test(rev46) && /deposito_usuario_asignar/.test(rev46) && /stock_saldos_deposito_activo_trg/.test(rev46) && /deposito_crear\(uuid,uuid,uuid,text,text,boolean\)/.test(rev46) && !/DELETE FROM public\.(depositos|usuario_deposito)/.test(rev46));
  cierto("NEX-046 sigue sin aplicarse: no hay evidencia de ejecución en el registro de progreso (por eso se revisó en lugar de crear una incremental)", !/NEX-046[^\n]*(aplicada con éxito|ejecutada en la VM|schema_migrations.*NEX-046)/.test(leer("PROGRESSO-NEXIT-V1.md")));

  cierto("API de atribuciones: exige INVENTARIO.EDITAR, empresa/usuario de la sesión, usuarioId UUID, 404 si el depósito no está en el alcance, funciones SQL; revocar por DELETE sin tocar el depósito", /prepararDepositos\("EDITAR"\)/.test(dpUsuarios) && /prepararDepositos\("EDITAR"\)/.test(dpUsuarioDel) && /esUuid\(cuerpo\.usuarioId\)/.test(dpUsuarios) && /leerDeposito\(b\.db, b\.empresaId, b\.usuarioId, id\)/.test(dpUsuarios) && /deposito_usuario_asignar/.test(dpUsuarios) && /export async function DELETE/.test(dpUsuarioDel) && /deposito_usuario_revocar/.test(dpUsuarioDel) && !/INSERT INTO usuario_deposito|DELETE FROM usuario_deposito/.test(dpUsuarios + dpUsuarioDel));

  const regU: Array<{ sql: string; parametros: unknown[] }> = [];
  const usuariosD = await listarUsuariosDeposito({ async query(sql: string, parametros: unknown[] = []) { regU.push({ sql, parametros }); return { rows: [{ id: "u1" }], rowCount: 1 }; } } as never, EMPRESA, USUARIO, D1);
  const sqlU = regU[0].sql;

  igual("lista de usuarios: solo de la empresa de la sesión y de un depósito dentro del alcance del actor; bajas solo si conservan vínculo", [regU[0].parametros, usuariosD.length, /u\.empresa_id = \$1/.test(sqlU), /d\.id IN \(SELECT d\.id FROM depositos d JOIN usuarios u/.test(sqlU), /u\.estado <> 'BAJA' OR ud\.usuario_id IS NOT NULL/.test(sqlU)], [[EMPRESA, USUARIO, D1], 1, true, true, true]);
  cierto("lista de usuarios: informa alcance (TODOS/ASIGNADOS), vínculo, compatibilidad de sucursal y si es el propio usuario", /alcance_depositos AS "alcanceDepositos"/.test(sqlU) && /AS asignado/.test(sqlU) && /AS "sucursalCompatible"/.test(sqlU) && /AS "esUsted"/.test(sqlU));
  igual("errores de atribución → HTTP (usuario inexistente 404; alcance TODOS / sucursal / cambio de sucursal 409)", ["NEX:USUARIO_NO_ENCONTRADO", "NEX:USUARIO_ALCANCE_TODOS", "NEX:USUARIO_SUCURSAL_FUERA", "NEX:DEPOSITO_SUCURSAL_CON_MOVIMIENTOS", "NEX:DEPOSITO_SUCURSAL_USUARIOS", "NEX:DEPOSITO_INACTIVO"].map((detail) => respuestaErrorDeposito({ code: "P0001", detail, message: "m" }, "x").status), [404, 409, 409, 409, 409, 409]);
  cierto("pantalla de usuarios: distingue TODOS (acceso amplio, sin controles) de ASIGNADOS (autorizar/revocar), confirma la revocación, explica el alcance y no modifica alcance/perfil", /Acceso amplio \(por alcance\)/.test(dpPage) && /No requiere autorización/.test(dpPage) && /window\.confirm\(/.test(dpPage) && /Revocar/.test(dpPage) && /Autorizar/.test(dpPage) && /sucursalCompatible/.test(dpPage) && /no se modifican desde esta pantalla/.test(dpPage) && /puedeEditar \?/.test(dpPage));
  cierto("Stock, Movimientos y Reposición no cambian por las atribuciones: se leen con la misma política (usuario_deposito); sin cambios de cálculo", /usuario_deposito/.test(leer("lib/stock/shared.ts")) && /usuario_deposito/.test(leer("lib/reposicion/datos.ts")) && /calcularPlanReposicion\(/.test(repPage));

  // ── Sucursal inmutable tras el primer movimiento y auditoría persistente de atribuciones (decisión 8ea23f8)
  const fnAsignar = mig46.slice(mig46.indexOf("CREATE OR REPLACE FUNCTION public.deposito_usuario_asignar"), mig46.indexOf("CREATE OR REPLACE FUNCTION public.deposito_usuario_revocar"));
  const fnRevocar = mig46.slice(mig46.indexOf("CREATE OR REPLACE FUNCTION public.deposito_usuario_revocar"), mig46.indexOf("-- 6) Privilegios"));
  const fnCrear = mig46.slice(mig46.indexOf("CREATE OR REPLACE FUNCTION public.deposito_crear"), mig46.indexOf("CREATE OR REPLACE FUNCTION public.deposito_editar"));
  const evInsert = /INSERT INTO public\.deposito_usuario_eventos \(empresa_id, deposito_id, usuario_id, actor_id, evento, origen\)/;

  cierto("sucursal: se rechaza el cambio si existe CUALQUIER movimiento del depósito (anulado o apertura incluidos), en la función y en el trigger (también ante SQL directo)", /FROM public\.movimientos_inventario WHERE empresa_id = p_empresa AND \(deposito_origen_id = p_deposito OR deposito_destino_id = p_deposito\)/.test(mig46) && /NEW\.sucursal_id IS DISTINCT FROM OLD\.sucursal_id\s+AND EXISTS \(SELECT 1 FROM public\.movimientos_inventario m WHERE m\.empresa_id = OLD\.empresa_id AND \(m\.deposito_origen_id = OLD\.id OR m\.deposito_destino_id = OLD\.id\)\)/.test(mig46) && !/estado\s*(=|<>)\s*'REGISTRADO'/.test(mig46.slice(mig46.indexOf("deposito_editar"), mig46.indexOf("deposito_cambiar_estado"))));
  cierto("sucursal: sin carrera con el primer movimiento (trigger FOR SHARE en movimientos_inventario que fija la sucursal vigente); sin reclasificar movimientos ni saldos", /CREATE TRIGGER movimientos_deposito_sucursal_trg BEFORE INSERT ON public\.movimientos_inventario/.test(mig46) && /id IN \(NEW\.deposito_origen_id, NEW\.deposito_destino_id\) ORDER BY id FOR SHARE/.test(mig46) && /NEW\.sucursal_id := v_suc/.test(mig46) && !/UPDATE public\.(movimientos_inventario|stock_saldos|inventario_costos)/.test(sinComentarios));
  cierto("sucursal: editar el nombre sigue permitido; el cambio sin movimientos conserva las verificaciones de alcance y de usuarios atribuidos", /UPDATE public\.depositos SET nombre = v_nombre, sucursal_id = p_sucursal/.test(mig46) && /sucursal_en_alcance\(p_empresa, ud\.usuario_id, p_sucursal\)/.test(mig46) && /IF p_sucursal IS DISTINCT FROM v_suc_actual THEN/.test(mig46));
  cierto("auditoría: tabla de solo altas con empresa, depósito, usuario afectado, actor, evento ATRIBUIR/REVOCAR, origen y fecha del servidor; FKs compuestas por empresa; solo identificadores", /CREATE TABLE public\.deposito_usuario_eventos/.test(mig46) && /evento\s+text\s+NOT NULL CHECK \(evento IN \('ATRIBUIR','REVOCAR'\)\)/.test(mig46) && /origen\s+text\s+NOT NULL DEFAULT 'MANUAL' CHECK \(origen IN \('MANUAL','CREACION'\)\)/.test(mig46) && /creado_at\s+timestamptz NOT NULL DEFAULT now\(\)/.test(mig46) && (mig46.match(/FOREIGN KEY \(empresa_id, (deposito_id|usuario_id|actor_id)\)/g) ?? []).length === 3 && !/(nombre|email|password|ip|user_agent)\s+text/.test(mig46.slice(mig46.indexOf("CREATE TABLE public.deposito_usuario_eventos"), mig46.indexOf("CREATE INDEX deposito_usuario_eventos_deposito_idx"))));
  cierto("auditoría: inmutable (sin UPDATE/TRUNCATE; DELETE solo en el reinicio de una empresa DEMO) y el runtime solo la lee", /deposito_usuario_eventos_inmutable_fila_trg BEFORE UPDATE OR DELETE/.test(mig46) && /deposito_usuario_eventos_inmutable_truncate_trg BEFORE TRUNCATE/.test(mig46) && /nex_reinicio_demo_activo\(OLD\.empresa_id\)/.test(mig46) && /REVOKE ALL ON public\.deposito_usuario_eventos FROM nexit_runtime;\s+GRANT SELECT ON public\.deposito_usuario_eventos TO nexit_runtime;/.test(mig46) && !/GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*deposito_usuario_eventos/i.test(mig46));
  cierto("auditoría: atribuir registra el evento en la misma función y solo si el vínculo se creó (ROW_COUNT = 1); la repetición no deja rastro", /ON CONFLICT DO NOTHING;\s+GET DIAGNOSTICS v_n = ROW_COUNT;\s+-- [^\n]*\n\s+IF v_n = 1 THEN\s+INSERT INTO public\.deposito_usuario_eventos[^;]*'ATRIBUIR', 'MANUAL'\)/.test(fnAsignar) && evInsert.test(fnAsignar) && (fnAsignar.match(evInsert) ?? []).length === 1);
  cierto("auditoría: revocar registra el evento solo si había vínculo (ROW_COUNT = 1); DELETE sin vínculo o rechazado no deja evento", /DELETE FROM public\.usuario_deposito WHERE[^;]*;\s+GET DIAGNOSTICS v_n = ROW_COUNT;[\s\S]*IF v_n = 1 THEN\s+INSERT INTO public\.deposito_usuario_eventos[^;]*'REVOCAR', 'MANUAL'\)/.test(fnRevocar) && (fnRevocar.match(evInsert) ?? []).length === 1);
  cierto("auditoría: los rechazos (permiso, alcance, empresa, TODOS, sucursal, baja) lanzan excepción ANTES de cualquier escritura, por lo que no dejan evento", fnAsignar.indexOf("RAISE EXCEPTION 'el usuario no tiene permiso") < fnAsignar.indexOf("INSERT INTO public.usuario_deposito") && fnAsignar.indexOf("NEX:USUARIO_SUCURSAL_FUERA") < fnAsignar.indexOf("INSERT INTO public.usuario_deposito") && fnRevocar.indexOf("NEX:DEPOSITO_NO_ENCONTRADO") < fnRevocar.indexOf("DELETE FROM public.usuario_deposito"));
  cierto("auditoría: la atribución inicial del creador (Asignarme) deja evento origen CREACION, solo si el vínculo se creó, en la misma transacción que el depósito", /GET DIAGNOSTICS v_n = ROW_COUNT;\s+-- [^\n]*\n\s+IF v_n = 1 THEN\s+INSERT INTO public\.deposito_usuario_eventos[^;]*'ATRIBUIR', 'CREACION'\)/.test(fnCrear) && /coalesce\(p_asignar_creador, false\)/.test(fnCrear) && (fnCrear.match(evInsert) ?? []).length === 1);
  cierto("auditoría: sin escritura directa fuera de las funciones (API y librería no insertan en la tabla ni en usuario_deposito)", !/INSERT INTO deposito_usuario_eventos|INSERT INTO usuario_deposito|DELETE FROM usuario_deposito/.test(leer("lib/depositos/shared.ts") + dpApi + dpUsuarios + dpUsuarioDel + leer("app/api/depositos/[id]/historial-acceso/route.ts")));
  cierto("auditoría consultable: API de historial con INVENTARIO.EDITAR y depósito en el alcance (404 si no), empresa/usuario de la sesión; la pantalla lo muestra con fecha, evento, afectado y autor", /prepararDepositos\("EDITAR"\)/.test(leer("app/api/depositos/[id]/historial-acceso/route.ts")) && /leerDeposito\(b\.db, b\.empresaId, b\.usuarioId, id\)/.test(leer("app/api/depositos/[id]/historial-acceso/route.ts")) && /Historial de accesos/.test(dpPage) && /al crear el depósito/.test(dpPage) && /Realizado por/.test(dpPage));

  const regE: Array<{ sql: string; parametros: unknown[] }> = [];
  const eventosD = await listarEventosAcceso({ async query(sql: string, parametros: unknown[] = []) { regE.push({ sql, parametros }); return { rows: [{ id: "e1" }], rowCount: 1 }; } } as never, EMPRESA, USUARIO, D1);

  igual("historial: lectura con empresa, actor y depósito de la sesión, dentro del alcance, más reciente primero y acotada", [regE[0].parametros, eventosD.length, /e\.empresa_id = \$1/.test(regE[0].sql), /e[.]deposito_id IN \(SELECT d\.id FROM depositos d JOIN usuarios u/.test(regE[0].sql), /ORDER BY e\.creado_at DESC/.test(regE[0].sql), /LIMIT 200/.test(regE[0].sql)], [[EMPRESA, USUARIO, D1], 1, true, true, true, true]);
  cierto("reversión: aborta si la auditoría tiene filas, retira trigger/tabla/función de auditoría y el trigger de movimientos, sin borrar depósitos ni vínculos", /deposito_usuario_eventos tiene filas/.test(rev46) && /DROP TABLE IF EXISTS public\.deposito_usuario_eventos/.test(rev46) && /movimientos_deposito_sucursal_trg/.test(rev46) && rev46.indexOf("tiene filas") < rev46.indexOf("DROP FUNCTION IF EXISTS public.deposito_usuario_revocar") && !/DELETE FROM public\.(depositos|usuario_deposito)/.test(rev46));
  cierto("NEX-046 mantiene sus precondiciones (no reaplicación) incluyendo la tabla de auditoría y nex_reinicio_demo_activo", /to_regclass\('public\.deposito_usuario_eventos'\) IS NOT NULL/.test(mig46) && /to_regprocedure\('public\.nex_reinicio_demo_activo\(uuid\)'\) IS NULL/.test(mig46));

  return fallos;
}
