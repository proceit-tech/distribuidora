/**
 * Inventario — correcciones residuales AUD-INV-R02 (R02-01 costo unitario exacto, R02-02 filtro de depósito por URL, R02-03 validación de cargas).
 * Sin PostgreSQL ni navegador: conexión y fetch simulados, helpers puros y análisis del código.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { cargarDepositos, interpretarDepositoUrl } from "@/lib/depositos/carga";
import { compararDecimales, dividirDecimales, formatearCostoUnitarioTexto } from "@/lib/inventario/decimal";
import { permisosVigentes, crearCompuerta } from "@/lib/productos/catalogos-carga";
import { cargarReposicion } from "@/lib/reposicion/carga";
import { leerStock } from "@/lib/stock/shared";
import { costoUnitarioTexto, vistaPorDeposito } from "@/lib/stock/vista";
import type { StockItem } from "@/types/stock";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const EMP = U(1), PA = U(10), PB = U(11), PC = U(12), DA = U(20), DB = U(21), DC = U(22);

type Resp = { status: number; cuerpo?: unknown } | "red" | "texto";

export async function verificarCasosInventarioResiduales(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ═══ R02-01 — costo unitario en decimal exacto ═══
  igual("R02-01 división exacta half-up a 4 posiciones (misma regla que round(numeric,4) de Valorización)", [
    dividirDecimales("100", "3", 4), dividirDecimales("2", "3", 4), dividirDecimales("1.00005", "1", 4), dividirDecimales("10", "0.3", 4), dividirDecimales("1", "8", 4), dividirDecimales("-1", "3", 4),
  ], ["33.3333", "0.6667", "1.0001", "33.3333", "0.1250", "-0.3333"]);
  igual("R02-01 valores grandes sin pérdida (más de 2^53) y divisor 0 / texto inválido → null", [
    dividirDecimales("99999999999999.9999", "3", 4), dividirDecimales("9007199254740993", "1", 4), dividirDecimales("1", "0", 4), dividirDecimales("1", "0.0000", 4), dividirDecimales("x", "2", 4), dividirDecimales(null, "2", 4),
  ], ["33333333333333.3333", "9007199254740993.0000", null, null, null, null]);
  igual("R02-01 costoUnitarioTexto: sin cantidad valorizada o sin texto → null (nunca 0 inventado)", [costoUnitarioTexto("0", "0"), costoUnitarioTexto("50", "0.0000"), costoUnitarioTexto(null, "2"), costoUnitarioTexto("50", null), costoUnitarioTexto("50", "4")], [null, null, null, null, "12.5000"]);
  igual("R02-01 comparación exacta para ordenar (empates de double, valores > 2^53, sin costo al final)", [
    compararDecimales("0.1", "0.10"), compararDecimales("10.0001", "10"), compararDecimales("9007199254740993", "9007199254740992"), compararDecimales("2", "10"), compararDecimales(null, "1"), compararDecimales("1", null), compararDecimales(null, null),
  ], [0, 1, 1, -1, 1, -1, 0]);
  igual("R02-01 presentación del costo unitario: hasta 4 decimales sin ceros finales, moneda correcta, sin costo → «—»", [
    formatearCostoUnitarioTexto("1234.5000", "PYG"), formatearCostoUnitarioTexto("0.3333", "PYG"), formatearCostoUnitarioTexto("12.3400", "USD"), formatearCostoUnitarioTexto("1000", "PYG"), formatearCostoUnitarioTexto(null, "PYG"), formatearCostoUnitarioTexto("x", "PYG"),
  ], ["Gs. 1.234,5", "Gs. 0,3333", "USD 12,34", "Gs. 1.000", "—", "—"]);

  // Lectura simulada: múltiples depósitos, cantidades fraccionarias, producto sin costo y productos con unidades distintas (sin promedio mezclado)
  const filas = (sql: string): Array<Record<string, unknown>> => {
    const prod = (id: string, d: string, um: string) => ({ id, codigo: d, codigoInventario: "", codigoBarras: "", descripcion: d, categoria: "", marca: "", familia: "", linea: "", procedencia: "", unidadMedidaId: um, unidadMedidaNombre: um, modoControl: "CANTIDAD", stockMinimo: 0, stockMaximo: 0, puntoReposicion: 0, actualizadoEn: "2026-10-13" });
    const saldo = (p: string, d: string, c: string) => ({ id: `${p}${d}`, productoId: p, depositoId: d, depositoCodigo: d.slice(-2), depositoNombre: `Dep ${d.slice(-2)}`, estado: "DISPONIBLE", propiedad: "PROPIO", cantidad: Number(c), cantidadTexto: c, lote: "", vencimiento: "" });

    if (/count\(\*\)/.test(sql)) return [{ n: 3 }];
    if (/SELECT d\.id, d\.nombre FROM depositos d/.test(sql)) return [{ id: DA, nombre: "Central" }, { id: DB, nombre: "Norte" }, { id: DC, nombre: "Vacío" }];
    if (/FROM productos p/.test(sql)) return [prod(PA, "Aceite", "Litro"), prod(PB, "Arroz", "Kilo"), prod(PC, "Sin costo", "Unidad")];
    if (/FROM stock_saldos s/.test(sql)) return [saldo(PA, DA, "3"), saldo(PA, DB, "0.3"), saldo(PB, DA, "7"), saldo(PC, DA, "5")];
    if (/FROM inventario_costos/.test(sql)) {
      return [
        { productoId: PA, depositoId: DA, cantidad: 3, valor: 100, valorTexto: "100.0000", cantidadTexto: "3.0000" },
        { productoId: PA, depositoId: DB, cantidad: 0.3, valor: 50, valorTexto: "50.0000", cantidadTexto: "0.3000" },
        { productoId: PB, depositoId: DA, cantidad: 7, valor: 99999999999999.9999, valorTexto: "99999999999999.9999", cantidadTexto: "7.0000" },
      ];
    }
    if (/FROM empresas/.test(sql)) return [{ nombre: "Empresa", moneda: "PYG" }];

    return [];
  };
  const db = { query: async (sql: string) => ({ rows: filas(sql), rowCount: 0 }) } as never;
  const r = await leerStock(db, EMP, null, null);
  const por = (id: string) => r.stock.find((i) => (i as unknown as StockItem).id === id) as unknown as StockItem;
  const a = por(PA), b = por(PB), c = por(PC);

  igual("R02-01 consolidado por producto: valor 150 / cantidad 3,3 = 45,4545 exacto; sin costo → null; cada producto usa solo sus propias cantidades (sin promedio entre unidades distintas)", [a.costoPromedioTexto, b.costoPromedioTexto, c.costoPromedioTexto], ["45.4545", "14285714285714.2857", null]);
  igual("R02-01 vista por depósito: costo de cada depósito (100/3 y 50/0,3), sin mezclar con el consolidado; depósito sin costo → null", [vistaPorDeposito(a, DA)!.costoPromedioTexto, vistaPorDeposito(a, DB)!.costoPromedioTexto, vistaPorDeposito(c, DA)!.costoPromedioTexto], ["33.3333", "166.6667", null]);
  igual("R02-01 el valor total ya corregido NO regresa: sigue siendo el texto exacto (150 y 99999999999999.9999)", [a.valorInventarioTexto, b.valorInventarioTexto], ["150", "99999999999999.9999"]);
  igual("R02-01 sin precio de referencia: sin importe de venta (no se inventa)", [a.precioVentaReferenciaTexto, a.valorVentaReferenciaTexto], [null, null]);
  igual("R02-01 lista de depósitos autorizados incluida en la lectura (con y sin saldo)", r.depositosAutorizados, [{ id: DA, nombre: "Central" }, { id: DB, nombre: "Norte" }, { id: DC, nombre: "Vacío" }]);

  const pagina = leer("app/(private)/stock/page.tsx");
  const detalle = leer("app/(private)/stock/[id]/page.tsx");
  const compartido = leer("lib/stock/shared.ts");
  const vista = leer("lib/stock/vista.ts");

  cierto("R02-01 código: sin división en Number ni Math.round del costo unitario; orden por compararDecimales; presentación desde el texto", !/Math\.round/.test(vista + compartido) && /compararDecimales\(costoUnitario\(a\), costoUnitario\(b\)\)/.test(pagina) && /formatearCostoUnitarioTexto\(item\.costoPromedioTexto/.test(pagina) && /formatearCostoUnitarioTexto\(item\.costoPromedioTexto/.test(detalle) && /cantidad_valorizada::text AS "cantidadTexto"/.test(compartido));
  cierto("R02-01 el motor de costos no se tocó: Stock solo lee inventario_costos (SELECT) y Valorización conserva su regla round(valor/cantidad, 4)", !/(INSERT|UPDATE|DELETE)\s/i.test(compartido.replace(/\/\*[\s\S]*?\*\//g, "")) && /round\(\$\{val\} \/ \$\{cant\}, 4\)/.test(leer("lib/reportes/valorizacion.ts")));

  // ═══ R02-02 — ?deposito= ═══
  const autorizados = [{ id: DA, nombre: "Central" }, { id: DC, nombre: "Vacío" }];

  igual("R02-02 sin parámetro → consolidado normal; depósito autorizado con saldo y SIN saldo → seleccionado (no desaparece)", [
    interpretarDepositoUrl("", autorizados), interpretarDepositoUrl(`?deposito=${DA}`, autorizados), interpretarDepositoUrl(`?deposito=${DC}`, autorizados),
  ], [{ tipo: "SIN_PARAMETRO" }, { tipo: "SELECCIONADO", id: DA, nombre: "Central" }, { tipo: "SELECCIONADO", id: DC, nombre: "Vacío" }]);
  igual("R02-02 id vacío, obsoleto, inexistente o fuera de alcance → NO_DISPONIBLE (aviso explícito, mismo resultado: no revela depósitos ajenos); otros parámetros no interfieren", [
    interpretarDepositoUrl("?deposito=", autorizados), interpretarDepositoUrl("?deposito=viejo", autorizados), interpretarDepositoUrl(`?deposito=${DB}`, autorizados), interpretarDepositoUrl("?deposito=%00", autorizados), interpretarDepositoUrl("?q=x", autorizados), interpretarDepositoUrl(`?deposito=${DA}`, []),
  ], [{ tipo: "NO_DISPONIBLE" }, { tipo: "NO_DISPONIBLE" }, { tipo: "NO_DISPONIBLE" }, { tipo: "NO_DISPONIBLE" }, { tipo: "SIN_PARAMETRO" }, { tipo: "NO_DISPONIBLE" }]);
  igual("R02-02 un depósito autorizado sin saldo produce vista vacía (0 productos), no el consolidado", r.stock.flatMap((i) => vistaPorDeposito(i as unknown as StockItem, DC) ?? []).length, 0);

  // Aislamiento: con usuario, la consulta de autorizados lleva el filtro de alcance y la empresa de la sesión
  const consultas: string[] = [];
  const dbEspia = { query: async (sql: string, params?: unknown[]) => { if (/SELECT d\.id, d\.nombre FROM depositos d/.test(sql)) consultas.push(`${sql}|${JSON.stringify(params)}`); return { rows: filas(sql), rowCount: 0 }; } } as never;

  await leerStock(dbEspia, EMP, null, U(99));
  await leerStock(dbEspia, EMP, null, null);
  cierto("R02-02 aislamiento: con usuario la lista de autorizados filtra por empresa y alcance (usuario_deposito); la lista nunca se arma desde el parámetro de la URL", consultas.length === 2 && /d\.empresa_id = \$1 AND d\.id IN \(/.test(consultas[0]) && consultas[0].endsWith(JSON.stringify([EMP, U(99)])) && !/IN \(/.test(consultas[1]) && consultas[1].endsWith(JSON.stringify([EMP])));
  cierto("R02-02 pantalla: selector con los autorizados (con o sin saldo), aviso role=alert con «Ver todos» cuando el depósito no está disponible y mensaje «sin saldos» para un autorizado vacío; no se creó segunda consulta de Stock", /interpretarDepositoUrl\(window\.location\.search, lista\)/.test(pagina) && /autorizados\.forEach\(\(d\) => map\.set\(d\.id, d\.nombre\)\)/.test(pagina) && /depositoNoDisponible \?/.test(pagina) && /Ver todos/.test(pagina) && /está autorizado, pero no tiene saldos/.test(pagina) && !/depositoDesdeConsulta/.test(pagina) && (pagina.match(/iniciarCargaStock\(cargarStock,/g) ?? []).length === 1 && !/cargarStock\(\)/.test(pagina));
  cierto("R02-02 el enlace «Ver stock» de Depósitos sigue generando /stock?deposito=<id> (reutilizado, no duplicado)", /enlaceStockDeDeposito/.test(leer("app/(private)/depositos/page.tsx")));

  // ═══ R02-03 — validación de cargas ═══
  const fetchDe = (resp: Resp, espera = 0) => async () => {
    if (espera) await new Promise((x) => setTimeout(x, espera));
    if (resp === "red") throw new TypeError("fetch failed");
    if (resp === "texto") return new Response("no es json", { status: 200 });

    return new Response(JSON.stringify(resp.cuerpo ?? {}), { status: resp.status });
  };
  const DEP = (id: string, nombre: string) => ({ id, codigo: "A", nombre, activo: true, sucursalId: U(5), sucursalNombre: "Matriz", sucursalCodigo: "S1", conMovimientos: false, conSaldo: false });
  const SUC = { id: U(5), codigo: "S1", nombre: "Matriz", activo: true };
  const okDep = (extra: Record<string, unknown> = {}) => ({ status: 200, cuerpo: { depositos: [DEP(U(30), "Central")], sucursales: [SUC], permisos: { crear: true, editar: true, stock: true }, actor: { alcanceDepositos: "TODOS" }, ...extra } });

  igual("R02-03 Depósitos: respuesta completa válida y lista realmente vacía siguen siendo válidas", [(await cargarDepositos(fetchDe(okDep()))).error, (await cargarDepositos(fetchDe(okDep({ depositos: [], sucursales: [] })))).datos?.depositos.length], ["", 0]);

  const malas: Array<[string, Record<string, unknown>]> = [
    ["registro null", { depositos: [null] }], ["registro primitivo", { depositos: ["x"] }], ["arreglo anidado", { depositos: [[]] }], ["sin id", { depositos: [{ ...DEP(U(30), "C"), id: undefined }] }], ["id vacío", { depositos: [{ ...DEP(U(30), "C"), id: "" }] }],
    ["activo no booleano", { depositos: [{ ...DEP(U(30), "C"), activo: "si" }] }], ["nombre numérico", { depositos: [{ ...DEP(U(30), "C"), nombre: 5 }] }], ["sin sucursalNombre", { depositos: [{ ...DEP(U(30), "C"), sucursalNombre: undefined }] }],
    ["conSaldo ausente", { depositos: [{ ...DEP(U(30), "C"), conSaldo: undefined }] }], ["una buena y una nula", { depositos: [DEP(U(30), "C"), null] }], ["sucursal null", { sucursales: [null] }], ["sucursal sin activo", { sucursales: [{ id: U(5), codigo: "S", nombre: "M" }] }],
    ["actor malformado", { actor: { alcanceDepositos: "OTRO" } }], ["actor primitivo", { actor: "x" }],
  ];

  for (const [nombre, extra] of malas) {
    const x = await cargarDepositos(fetchDe(okDep(extra)));
    const est = { cargando: false, errorCarga: x.error, errorAuxiliar: "" };

    igual(`R02-03 Depósitos HTTP 200 malformado (${nombre}): sin datos, error recuperable y sin permisos vigentes`, [x.datos, x.error !== "", permisosVigentes({ crear: true, editar: true }, est)], [null, true, { crear: false, editar: false }]);
  }

  for (const status of [401, 403, 500]) {
    const x = await cargarDepositos(fetchDe({ status, cuerpo: { error: "Fallo." } }));

    igual(`R02-03 Depósitos ${status}: sin datos, error con código`, [x.datos, x.error.includes(`código ${status}`)], [null, true]);
  }

  igual("R02-03 Depósitos: red caída y JSON inválido → error recuperable", [(await cargarDepositos(fetchDe("red"))).datos, (await cargarDepositos(fetchDe("texto"))).datos], [null, null]);

  const ENTRADA = (extra: Record<string, unknown> = {}) => ({
    clave: `${PA}|${DA}`, ambito: "DEPOSITO", productoId: PA, productoCodigo: "P-1", productoDescripcion: "Aceite", marca: "", unidad: "Litro", depositoId: DA, depositoNombre: "Central",
    saldo: { disponible: 3, reservado: 0, cuarentena: 0, transito: 0 }, parametros: { minimo: 5, punto: 8, maximo: 20, cantidadReposicion: null },
    otrosDepositos: [{ id: DB, nombre: "Norte", disponible: 10, minimo: 2, punto: 3 }], proveedorPrincipal: { nombre: "Prov", plazoDias: 5, cantidadMinimaCompra: null }, modoControl: "CANTIDAD", ...extra,
  });
  const okRep = (extra: Record<string, unknown> = {}) => ({ status: 200, cuerpo: { entradas: [ENTRADA()], depositos: [{ id: DA, nombre: "Central" }], alcanceParcial: false, permisos: { movimientosVer: true, movimientosCrear: true }, ...extra } });

  igual("R02-03 Reposición: respuesta completa válida (con consolidado, sin proveedor y listas vacías) → carga correcta", [
    (await cargarReposicion(fetchDe(okRep()))).error, (await cargarReposicion(fetchDe(okRep({ entradas: [ENTRADA({ ambito: "CONSOLIDADO", depositoId: null, proveedorPrincipal: null, soloReferencia: true })] })))).error,
    (await cargarReposicion(fetchDe(okRep({ entradas: [], depositos: [] })))).datos?.entradas.length,
  ], ["", "", 0]);

  const malasRep: Array<[string, Record<string, unknown>]> = [
    ["entrada null", { entradas: [null] }], ["entrada primitiva", { entradas: [7] }], ["depósito null", { depositos: [null] }], ["depósito sin nombre", { depositos: [{ id: DA }] }], ["sin saldo", { entradas: [ENTRADA({ saldo: undefined })] }],
    ["saldo no finito", { entradas: [ENTRADA({ saldo: { disponible: null, reservado: 0, cuarentena: 0, transito: 0 } })] }], ["saldo texto", { entradas: [ENTRADA({ saldo: { disponible: "3", reservado: 0, cuarentena: 0, transito: 0 } })] }],
    ["sin parámetros", { entradas: [ENTRADA({ parametros: undefined })] }], ["parámetro texto", { entradas: [ENTRADA({ parametros: { minimo: "5", punto: null, maximo: null, cantidadReposicion: null } })] }],
    ["ámbito inválido", { entradas: [ENTRADA({ ambito: "X" })] }], ["sin clave", { entradas: [ENTRADA({ clave: "" })] }], ["otrosDepositos no arreglo", { entradas: [ENTRADA({ otrosDepositos: null })] }], ["otro depósito null", { entradas: [ENTRADA({ otrosDepositos: [null] })] }],
    ["otro depósito disponible texto", { entradas: [ENTRADA({ otrosDepositos: [{ id: DB, nombre: "N", disponible: "10", minimo: null, punto: null }] })] }], ["proveedor primitivo", { entradas: [ENTRADA({ proveedorPrincipal: "x" })] }],
    ["modo de control desconocido", { entradas: [ENTRADA({ modoControl: "RARO" })] }], ["una buena y una nula", { entradas: [ENTRADA(), null] }], ["entradas no es arreglo", { entradas: {} }],
  ];

  for (const [nombre, extra] of malasRep) {
    const x = await cargarReposicion(fetchDe(okRep(extra)));

    igual(`R02-03 Reposición HTTP 200 malformado (${nombre}): sin datos y error recuperable`, [x.datos, x.error !== ""], [null, true]);
  }

  for (const status of [401, 403, 500]) {
    const x = await cargarReposicion(fetchDe({ status, cuerpo: { error: "Fallo." } }));

    igual(`R02-03 Reposición ${status}: sin datos, error con código`, [x.datos, x.error.includes(`código ${status}`)], [null, true]);
  }

  igual("R02-03 Reposición: red caída y JSON inválido → error recuperable", [(await cargarReposicion(fetchDe("red"))).datos, (await cargarReposicion(fetchDe("texto"))).datos], [null, null]);
  igual("R02-03 Reposición: permisos ausentes o raros equivalen a «sin permisos» aun con datos válidos", [(await cargarReposicion(fetchDe(okRep({ permisos: "x" })))).datos?.permisos, (await cargarReposicion(fetchDe(okRep({ permisos: undefined })))).datos?.permisos], [{ movimientosVer: false, movimientosCrear: false }, { movimientosVer: false, movimientosCrear: false }]);

  // Respuestas fuera de orden y recuperación (compuerta de última solicitud) para ambas pantallas
  {
    const compuerta = crearCompuerta();
    const estado: { dep: string[]; rep: string[]; err: string } = { dep: [], rep: [], err: "" };
    const recargarDep = async (resp: Resp, espera: number) => {
      const sol = compuerta.nueva();
      const res = await cargarDepositos(fetchDe(resp, espera));

      if (!compuerta.vigente(sol)) return;
      estado.err = res.error;
      if (res.datos) estado.dep = res.datos.depositos.map((d) => (d as { id: string }).id);
    };

    await Promise.all([recargarDep(okDep({ depositos: [DEP("vieja", "V")] }), 40), recargarDep(okDep({ depositos: [DEP("nueva", "N")] }), 5)]);
    igual("R02-03 Depósitos: respuesta lenta anterior no pisa a la última", estado.dep, ["nueva"]);
    await recargarDep(okDep({ depositos: [null] }), 0);
    igual("R02-03 Depósitos: una recarga malformada deja error (la pantalla bloquea acciones con él); no se toma ningún dato del cuerpo inválido", [estado.err !== "", estado.dep], [true, ["nueva"]]);
    await recargarDep(okDep({ depositos: [DEP("final", "F")] }), 0);
    igual("R02-03 Depósitos: recuperación con datos válidos limpia el error y reemplaza la lista", [estado.err, estado.dep], ["", ["final"]]);

    const compuertaR = crearCompuerta();
    const recargarRep = async (resp: Resp, espera: number) => {
      const sol = compuertaR.nueva();
      const res = await cargarReposicion(fetchDe(resp, espera));

      if (!compuertaR.vigente(sol)) return;
      if (res.datos) estado.rep = res.datos.entradas.map((e) => e.clave);
    };

    await Promise.all([recargarRep(okRep({ entradas: [ENTRADA({ clave: "vieja" })] }), 40), recargarRep(okRep({ entradas: [ENTRADA({ clave: "nueva" })] }), 5)]);
    igual("R02-03 Reposición: respuesta lenta anterior no pisa a la última", estado.rep, ["nueva"]);
  }

  // Código: las pantallas consumen las cargas validadas y conservan formularios / bloqueos
  const pDep = leer("app/(private)/depositos/page.tsx");
  const pRep = leer("app/(private)/reposicion/page.tsx");
  const cDep = leer("lib/depositos/carga.ts");
  const cRep = leer("lib/reposicion/carga.ts");

  cierto("R02-03 código: ambas cargas usan los validadores de registro (no solo Array.isArray) y las pantallas siguen usando cargarDepositos/cargarReposicion con compuerta", /listaValida\(j\.depositos, depositoValido\)/.test(cDep) && /listaValida\(j\.entradas, entradaReposicionValida\)/.test(cRep) && !/Array\.isArray\(j\.(depositos|entradas)\)/.test(cDep + cRep) && /cargarDepositos</.test(pDep) && /cargarReposicion\(/.test(pRep) && /crearCompuerta\(\)/.test(pDep + pRep));
  cierto("R02-03 el cálculo de Reposición queda intacto: calculo.ts no depende de la validación y mantiene calcularPlanReposicion", !/validar-carga/.test(leer("lib/reposicion/calculo.ts")) && /calcularPlanReposicion/.test(leer("lib/reposicion/calculo.ts")));

  return fallos;
}
