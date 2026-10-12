/**
 * Stock (vista por depósito, ubicación, alcance), Reposición (política de cálculo) y contrato Movimientos ↔ documentos (Etapa C).
 * Sin base de datos: cálculos puros, conexión simulada y análisis del código y de las migraciones.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { claveEfectoFisico, decidirEfecto, planEstorno, validarLinea, type ContextoDocumento } from "@/lib/movimientos/documentos";
import { calcularReposicion, compararUrgencia, type EntradaReposicion } from "@/lib/reposicion/calculo";
import { leerEntradasReposicion } from "@/lib/reposicion/datos";
import { leerStock } from "@/lib/stock/shared";
import { clasificarNivel, resumenStock, vistaPorDeposito } from "@/lib/stock/vista";
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

  cierto("Stock: sin «Exportar Excel» ni «Valorizado por marca» y sin xlsx; conserva Movimientos y Reposición", !/Exportar Excel|Valorizado por marca|exportarListadoExcel|exportarValorizadoMarca|xlsx/i.test(stockPage) && />\s*Movimientos\s*</.test(stockPage) && />\s*Reposición\s*</.test(stockPage) && /href="\/reposicion"/.test(stockPage));
  cierto("los reportes existentes de Reportes siguen en su lugar", ["app/(private)/reportes/valorizacion/page.tsx", "app/(private)/reportes/stock-general/page.tsx"].every((f) => existsSync(join(raiz, f))));
  cierto("Stock: filtro por depósito con vista por depósito (cantidades, costo, valor) y rótulo de visión consolidada/del depósito", /vistaPorDeposito/.test(stockPage) && /Visión consolidada/.test(stockPage) && /Visión del depósito/.test(stockPage) && /resumenStock\(stock\)/.test(stockPage));
  cierto("Stock (ficha): ubicación real o «Sin ubicación registrada», nunca inventada", /Sin ubicación registrada/.test(leer("app/(private)/stock/[id]/page.tsx")));
  cierto("Reposición: página, layout con STOCK.VER, API de solo lectura con STOCK.VER, ruta en V1_HREFS y menú con STOCK.VER", existsSync(join(raiz, "app/(private)/reposicion/page.tsx")) && /guardPage\("STOCK", "VER"\)/.test(leer("app/(private)/reposicion/layout.tsx")) && /denyIfNoPermission\(session, "STOCK", "VER"\)/.test(leer("app/api/reposicion/route.ts")) && !/export (async )?function (POST|PUT|DELETE|PATCH)|export const (POST|PUT|DELETE|PATCH)/.test(leer("app/api/reposicion/route.ts")) && /"\/reposicion"/.test(menu.slice(menu.indexOf("V1_HREFS"))) && /href: "\/reposicion",\s+icon: "replenishment",\s+permission: "STOCK\.VER"/.test(menu));
  const repPage = leer("app/(private)/reposicion/page.tsx");

  cierto("Reposición: solo planificación (sin POST/PUT, sin botones de compra) y la acción hacia Movimientos solo con permiso y destino real", !/method:\s*"(POST|PUT|DELETE)"/.test(repPage) && !/Comprar ahora|Generar pedido|Crear orden/i.test(repPage) && /datos\?\.permisos\?\.movimientos/.test(repPage) && /href="\/movimientos\/nuevo"/.test(repPage) && existsSync(join(raiz, "app/(private)/movimientos/nuevo/page.tsx")));
  cierto("la API de stock aplica el alcance de depósitos del usuario", /session\.user\.id/.test(leer("app/api/stock/route.ts")) && /session\.user\.id/.test(leer("app/api/stock/[id]/route.ts")));

  return fallos;
}
