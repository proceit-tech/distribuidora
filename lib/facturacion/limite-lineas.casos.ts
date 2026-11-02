/**
 * PRO-339-R01 — máximo de líneas por Factura Electrónica NUEVA configurable POR EMPRESA (empresas.fe_max_lineas, NEX-078; NULL = 999).
 * Lógica REAL probada: reglas puras de limite-lineas.ts, lectura parametrizada limiteLineasEmpresa y el control de prepararFactura con una base simulada (sin PostgreSQL).
 * Pantalla, API, migración y aislamiento NCE se verifican sobre el código fuente (el comportamiento en navegador lo revisa el responsable).
 * Empresas A/B/C son SINTÉTICAS (UUID de prueba): ningún caso depende de un tenant real ni de CASA MINGO.
 * PRO-339-R02 (R01-F001): casos 70..86 — alta atómica (modelo del contrato + inspección del código real; Strict Mode solo por inspección).
 * Casos ESCRITOS, NO EJECUTADOS en la entrega (restricción vigente: sin runner, lint, typecheck ni build).
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { catalogosFactura, leerCuerpoFactura, limiteLineasEmpresa, prepararFactura } from "@/lib/facturacion/emision";
import {
  agregarSiCabe, ALTA_BLOQUEADA, excedeLimite, interpretarLimiteLineas, leerMaximoApi, maximoValido, mensajeAltaBloqueada, mensajeExcesoLineas, mensajeLimiteLineas,
  MENSAJE_LIMITE_INVALIDO, MENSAJE_LIMITE_SIN_EMPRESA, MENSAJE_LIMITE_SIN_MIGRACION, puedeAgregarLinea, textoContadorLineas,
} from "@/lib/facturacion/limite-lineas";
import { MAX_LINEAS } from "@/lib/facturacion/payload-fe";
import { sumarUnaUnidad } from "@/lib/formato/cantidad-campo";
import { ErrorFacturacion, respuestaErrorFacturacion } from "@/lib/facturacion/shared";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");
const sinCom = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const EMPRESA_A = "aaaaaaaa-0000-4000-8000-000000000001"; // sintética, máximo 21
const EMPRESA_B = "bbbbbbbb-0000-4000-8000-000000000002"; // sintética, máximo 63
const EMPRESA_C = "cccccccc-0000-4000-8000-000000000003"; // sintética, máximo 99
const EMPRESA_N = "dddddddd-0000-4000-8000-000000000004"; // sintética, sin configuración (NULL)
const USUARIO = "eeeeeeee-0000-4000-8000-000000000005";
const SUC = "11111111-0000-4000-8000-000000000006";
const PUNTO = "22222222-0000-4000-8000-000000000007";
const CLIENTE = "33333333-0000-4000-8000-000000000008";
const VENDEDOR = "44444444-0000-4000-8000-000000000009";
const PRODUCTO = "55555555-0000-4000-8000-00000000000a";
const PRODUCTO_2 = "66666666-0000-4000-8000-00000000000b";

const CONFIG: Record<string, number | null> = { [EMPRESA_A]: 21, [EMPRESA_B]: 63, [EMPRESA_C]: 99, [EMPRESA_N]: null };

type Consulta = { sql: string; parametros: unknown[] };

/** Base simulada: responde SOLO la lectura del máximo (por el empresa_id PARAMETRIZADO) y registra todo; cualquier otra consulta devuelve vacío. */
function baseSimulada(opciones: { sinColumna?: boolean; config?: Record<string, unknown> } = {}) {
  const consultas: Consulta[] = [];
  const config = opciones.config ?? CONFIG;
  const db = {
    async query(sql: string, parametros: unknown[] = []) {
      consultas.push({ sql, parametros });
      if (/to_jsonb\(e\) \? 'fe_max_lineas'/.test(sql)) {
        const id = String(parametros[0]);

        if (!(id in config)) return { rows: [], rowCount: 0 };

        return { rows: [opciones.sinColumna ? { existe: false, valor: null } : { existe: true, valor: config[id] }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };

  return { db: db as never, consultas };
}

/** Cuerpo HTTP crudo (lo que enviaría el navegador o un cliente que manipula la API directamente). */
const crudo = (lineas: Array<{ productoId: string; cantidad: string }>, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  claveIdempotencia: "pro339-clave-0001", sucursalId: SUC, puntoId: PUNTO, clienteId: CLIENTE, vendedorId: VENDEDOR, tipoTransaccion: 1, presencia: 1, pagos: [{ tipo: 1 }], condicion: 1, infoAdicional: "", lineas, ...extra,
});
const cuerpoCon = (n: number, productos: string[] = [PRODUCTO]) => leerCuerpoFactura(crudo(Array.from({ length: n }, (_, i) => ({ productoId: productos[i % productos.length], cantidad: "1" }))));

/** Ejecuta prepararFactura y devuelve el error (o null). La base simulada no tiene el resto de los cadastros: un error POSTERIOR al control también se devuelve, para distinguirlo. */
async function intentar(empresa: string, n: number, opciones: { domicilioHistorico?: boolean } = {}, base = baseSimulada()) {
  const cuerpo = cuerpoCon(n);

  if (typeof cuerpo === "string") return { error: cuerpo, base };
  try {
    await prepararFactura(base.db, empresa, USUARIO, cuerpo, opciones);

    return { error: null as unknown, base };
  } catch (e) {
    return { error: e as unknown, base };
  }
}

const esExceso = (e: unknown) => e instanceof ErrorFacturacion && e.estado === 422 && /Esta empresa admite un máximo de/.test(e.message);
const maxDe = (e: unknown) => (e as { maxLineasFE?: unknown }).maxLineasFE;

type FilaModelo = { clave: number; productoId: string; cantidad: string };

/**
 * PRO-339-R02: MODELO del alta de la pantalla (no es el componente React; el código real se inspecciona en la sección 9). Reproduce el contrato de agregar + aplicarLineas:
 * las acciones se deciden sobre el borrador MÁS RECIENTE (ref síncrona), no sobre el snapshot del render, y la clave se reserva solo al agregar. `render` = snapshot que
 * veía la pantalla (el que usaba R01), para mostrar que dos acciones antes de re-renderizar ya no dependen de él.
 */
function editorModelo(maximo: number | null, iniciales: FilaModelo[] = []) {
  let actual = iniciales;
  let siguiente = iniciales.reduce((m, l) => Math.max(m, l.clave), 0) + 1;
  const avisos: string[] = [];
  const agregarModelo = (productoId: string): number => {
    const existente = actual.find((l) => l.productoId === productoId);

    if (existente) {
      actual = actual.map((l) => (l.clave === existente.clave ? { ...l, cantidad: sumarUnaUnidad(l.cantidad) ?? l.cantidad } : l));

      return existente.clave;
    }
    if (!puedeAgregarLinea(actual.length, maximo)) {
      avisos.push(mensajeAltaBloqueada(maximo));

      return ALTA_BLOQUEADA;
    }

    const clave = siguiente;

    siguiente = clave + 1;
    actual = agregarSiCabe(actual, { clave, productoId, cantidad: "1" }, maximo);

    return clave;
  };

  return { agregar: agregarModelo, quitar: (clave: number) => { actual = actual.filter((l) => l.clave !== clave); }, lineas: () => actual, avisos };
}

const filas = (n: number): FilaModelo[] => Array.from({ length: n }, (_, i) => ({ clave: i + 1, productoId: `p-${i + 1}`, cantidad: "1" }));

export async function verificarCasosLimiteLineasPro339(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── 1. Lectura de la configuración (NULL → 999; valores por empresa; falla cerrado) ─────────────────────────────────────────────────────────────────
  igual("PRO339-01 NULL (sin política propia) = 999, el máximo fiscal común", interpretarLimiteLineas({ existe: true, valor: null }), { ok: true, maximo: 999 });
  igual("PRO339-02 valores por empresa como número (jsonb): 21, 63, 99, 1 y 999", [21, 63, 99, 1, 999].map((v) => interpretarLimiteLineas({ existe: true, valor: v })), [21, 63, 99, 1, 999].map((maximo) => ({ ok: true, maximo })));
  igual("PRO339-03 valor como texto entero también se acepta (\"63\")", interpretarLimiteLineas({ existe: true, valor: "63" }), { ok: true, maximo: 63 });
  igual("PRO339-04 sin la columna (NEX-078 no aplicada): falla cerrado, nunca 999 en silencio", interpretarLimiteLineas({ existe: false, valor: null }), { ok: false, mensaje: MENSAJE_LIMITE_SIN_MIGRACION });
  igual("PRO339-05 empresa inexistente (sin fila): falla cerrado", interpretarLimiteLineas(undefined), { ok: false, mensaje: MENSAJE_LIMITE_SIN_EMPRESA });
  igual("PRO339-06 valores fuera de 1..999 o ilegibles (0, -1, 1000, 21.5, \"abc\", true, {}): falla cerrado", [0, -1, 1000, 21.5, "abc", true, {}].map((v) => interpretarLimiteLineas({ existe: true, valor: v }).ok), [false, false, false, false, false, false, false]);
  igual("PRO339-07 mensaje de configuración inválida", interpretarLimiteLineas({ existe: true, valor: 0 }), { ok: false, mensaje: MENSAJE_LIMITE_INVALIDO });
  igual("PRO339-08 maximoValido: entero 1..999 solamente", [1, 999, 0, 1000, 21.5, Number.NaN, "21"].map(maximoValido), [true, true, false, false, false, false, false]);
  igual("PRO339-09 MAX_LINEAS fiscal intacto (999)", MAX_LINEAS, 999);

  {
    const b = baseSimulada();
    const lecturas = await Promise.all([EMPRESA_A, EMPRESA_B, EMPRESA_C, EMPRESA_N].map((e) => limiteLineasEmpresa(b.db, e)));

    igual("PRO339-10 limiteLineasEmpresa lee el máximo de CADA empresa (A=21, B=63, C=99, sin configuración=999)", lecturas, [21, 63, 99, 999].map((maximo) => ({ ok: true, maximo })));
    cierto("PRO339-11 la consulta es paramétrica por empresa ($1::uuid), solo lectura, sobre la fila de empresas de ESA empresa", b.consultas.every((c) => /FROM empresas e WHERE e\.id = \$1::uuid/.test(c.sql) && !/UPDATE|INSERT|DELETE/i.test(c.sql)) && JSON.stringify(b.consultas.map((c) => c.parametros)) === JSON.stringify([[EMPRESA_A], [EMPRESA_B], [EMPRESA_C], [EMPRESA_N]]));
    cierto("PRO339-12 la lectura no falla si la columna no existe (to_jsonb de la fila, sin nombrar la columna en el SELECT)", /to_jsonb\(e\) \? 'fe_max_lineas'/.test(b.consultas[0].sql) && !/SELECT[^]*\be\.fe_max_lineas\b/.test(b.consultas[0].sql));

    const sinCol = baseSimulada({ sinColumna: true });

    igual("PRO339-13 sin NEX-078 la lectura devuelve el error controlado", await limiteLineasEmpresa(sinCol.db, EMPRESA_A), { ok: false, mensaje: MENSAJE_LIMITE_SIN_MIGRACION });

    const otra = baseSimulada();

    igual("PRO339-14 empresa_id que no es UUID (p. ej. sesión demo): falla cerrado SIN consultar la base", [await limiteLineasEmpresa(otra.db, "demo-casa-mingo"), otra.consultas.length], [{ ok: false, mensaje: MENSAJE_LIMITE_SIN_EMPRESA }, 0]);
    igual("PRO339-15 empresa de otro tenant inexistente para esta base: falla cerrado", await limiteLineasEmpresa(otra.db, "ffffffff-0000-4000-8000-0000000000ff"), { ok: false, mensaje: MENSAJE_LIMITE_SIN_EMPRESA });
  }

  // ── 2. Conteo de líneas: bordes por empresa ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const casos: Array<[number, number, boolean]> = [
      [21, 0, false], [21, 1, false], [21, 4, false], [21, 5, false], [21, 20, false], [21, 21, false], [21, 22, true],
      [63, 62, false], [63, 63, false], [63, 64, true],
      [99, 98, false], [99, 99, false], [99, 100, true],
      [999, 999, false], [999, 1000, true],
    ];

    igual("PRO339-16 excedeLimite (A=21: 0/1/4/5/20/21/22; B=63: 62/63/64; C=99: 98/99/100; NULL=999: 999/1000)", casos.map(([m, n]) => excedeLimite(n, m)), casos.map(([, , e]) => e));
    igual("PRO339-17 pantalla: puede agregar una línea NUEVA solo por debajo del máximo (20→sí, 21→no con 21; 62/63 con 63; 98/99 con 99)", [[20, 21], [21, 21], [62, 63], [63, 63], [98, 99], [99, 99]].map(([n, m]) => puedeAgregarLinea(n, m)), [true, false, true, false, true, false]);
    igual("PRO339-18 pantalla sin máximo conocido (null): solo el fiscal común (998 sí, 999 no)", [puedeAgregarLinea(998, null), puedeAgregarLinea(999, null)], [true, false]);
    igual("PRO339-19 borrar y reagregar: con 21/21 no entra; tras quitar una (20) vuelve a entrar", [puedeAgregarLinea(21, 21), puedeAgregarLinea(20, 21)], [false, true]);

    const veinte = Array.from({ length: 20 }, (_, i) => i);
    // Dos lecturas casi simultáneas del lector que vieron el mismo estado (20 líneas): el actualizador funcional deja pasar solo la 21.ª.
    const tras = agregarSiCabe(agregarSiCabe(veinte, 100, 21), 101, 21);

    igual("PRO339-20 doble lectura del lector con 20 líneas y máximo 21: queda 21 (la 22.ª no se agrega)", [tras.length, tras[20]], [21, 100]);
    igual("PRO339-21 agregarSiCabe no muta el arreglo original", [veinte.length, agregarSiCabe(veinte, 1, 21) !== veinte], [20, true]);
  }

  // ── 3. Textos (máximo REAL de la empresa, nunca fijo) ────────────────────────────────────────────────────────────────────────────────────────────────
  igual("PRO339-22 aviso con el máximo de cada empresa", [21, 63, 99].map(mensajeLimiteLineas), [21, 63, 99].map((m) => `Esta empresa admite un máximo de ${m} líneas por factura electrónica.`));
  igual("PRO339-23 singular con máximo 1", mensajeLimiteLineas(1), "Esta empresa admite un máximo de 1 línea por factura electrónica.");
  igual("PRO339-24 aviso de alta bloqueada sin máximo conocido usa el fiscal (999)", mensajeAltaBloqueada(null), "Esta empresa admite un máximo de 999 líneas por factura electrónica.");
  igual("PRO339-25 mensaje del servidor: cuántas tiene y cuántas quitar", mensajeExcesoLineas(21, 23), "Esta empresa admite un máximo de 21 líneas por factura electrónica. La factura tiene 23: quite 2 y revísela de nuevo.");
  igual("PRO339-26 contador «N de M ítems» y «N ítems» sin máximo", [textoContadorLineas(0, 21), textoContadorLineas(21, 21), textoContadorLineas(5, 63), textoContadorLineas(1, null), textoContadorLineas(4, null)], ["0 de 21 ítems", "21 de 21 ítems", "5 de 63 ítems", "1 ítem", "4 ítems"]);
  igual("PRO339-27 leerMaximoApi acepta solo enteros 1..999", [leerMaximoApi(21), leerMaximoApi(null), leerMaximoApi("21"), leerMaximoApi(0), leerMaximoApi(1000)], [21, null, null, null, null]);
  cierto("PRO339-28 ALTA_BLOQUEADA nunca coincide con una clave real (≥ 1)", ALTA_BLOQUEADA < 1);

  // ── 4. Servidor: prepararFactura (previa y emisión) ─────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const r22 = await intentar(EMPRESA_A, 22);

    cierto("PRO339-29 empresa A (21): 22 líneas → 422 con el máximo REAL y maxLineasFE = 21", esExceso(r22.error) && maxDe(r22.error) === 21 && /máximo de 21 líneas/.test((r22.error as Error).message));
    cierto("PRO339-30 el rechazo ocurre ANTES de cualquier otra consulta: sin reserva de numeración, sin stock, sin gateway (solo la lectura del máximo)", r22.base.consultas.length === 1 && !r22.base.consultas.some((c) => /fe_documento_crear_fe|planificar|inventario|stock|fe_secuencia/i.test(c.sql)));

    const r21 = await intentar(EMPRESA_A, 21);

    cierto("PRO339-31 empresa A (21): 21 líneas NO se rechazan por el máximo (sigue a las demás validaciones)", !esExceso(r21.error) && r21.base.consultas.length > 1);

    const b64 = await intentar(EMPRESA_B, 64);
    const b63 = await intentar(EMPRESA_B, 63);

    cierto("PRO339-32 empresa B (63): 64 → 422 (maxLineasFE 63); 63 pasa el control", esExceso(b64.error) && maxDe(b64.error) === 63 && !esExceso(b63.error));

    const c100 = await intentar(EMPRESA_C, 100);
    const c99 = await intentar(EMPRESA_C, 99);

    cierto("PRO339-33 empresa C (99): 100 → 422 (maxLineasFE 99); 99 pasa el control", esExceso(c100.error) && maxDe(c100.error) === 99 && !esExceso(c99.error));

    const n999 = await intentar(EMPRESA_N, 999);
    const n22 = await intentar(EMPRESA_N, 22);

    cierto("PRO339-34 empresa sin configuración (NULL = 999): 22 y 999 pasan el control", !esExceso(n22.error) && !esExceso(n999.error));
    igual("PRO339-35 1000 líneas: lo rechaza leerCuerpoFactura con su mensaje de FORMA 1..999 (intacto)", await intentar(EMPRESA_N, 1000).then((r) => r.error), "Agregue al menos un ítem (máximo 999).");
    igual("PRO339-36 0 líneas: sin cambios («Agregue al menos un ítem»)", typeof cuerpoCon(0), "string");

    const sinCol = await intentar(EMPRESA_A, 1, {}, baseSimulada({ sinColumna: true }));

    cierto("PRO339-37 sin NEX-078: FE nueva rechazada con 422 controlado (aun con 1 línea), sin otras consultas", sinCol.error instanceof ErrorFacturacion && (sinCol.error as ErrorFacturacion).estado === 422 && (sinCol.error as Error).message === MENSAJE_LIMITE_SIN_MIGRACION && sinCol.base.consultas.length === 1);

    const invalida = await intentar(EMPRESA_A, 1, {}, baseSimulada({ config: { [EMPRESA_A]: 5000 } }));

    cierto("PRO339-38 configuración ilegible: 422 controlado (falla cerrado)", invalida.error instanceof ErrorFacturacion && (invalida.error as Error).message === MENSAJE_LIMITE_INVALIDO);

    // Cambio de política entre borrador/previa y emisión: el servidor lee el valor VIGENTE en cada llamada (sin caché).
    const config: Record<string, number | null> = { [EMPRESA_A]: 63 };
    const viva = baseSimulada({ config });
    const antes = await intentar(EMPRESA_A, 30, {}, viva);

    config[EMPRESA_A] = 21;

    const despues = await intentar(EMPRESA_A, 30, {}, viva);

    cierto("PRO339-39 política reducida de 63 a 21 entre la previa y el envío: la primera pasa el control, la segunda 422 con maxLineasFE = 21", !esExceso(antes.error) && esExceso(despues.error) && maxDe(despues.error) === 21);
    cierto("PRO339-40 el empresa_id usado es el de la SESIÓN (argumento), no un campo del cuerpo: un empresaId en el cuerpo se ignora", (() => { const c = leerCuerpoFactura(crudo([{ productoId: PRODUCTO, cantidad: "1" }], { empresaId: EMPRESA_N })); return typeof c === "object" && !JSON.stringify(c).includes(EMPRESA_N); })() && r22.base.consultas[0].parametros[0] === EMPRESA_A);

    // Mismo SKU en dos renglones distintos cuenta como dos líneas.
    const dosRenglones = leerCuerpoFactura(crudo(Array.from({ length: 22 }, () => ({ productoId: PRODUCTO, cantidad: "1" }))));
    const bDos = baseSimulada();
    let eDos: unknown = null;

    try { await prepararFactura(bDos.db, EMPRESA_A, USUARIO, dosRenglones as never); } catch (e) { eDos = e; }
    cierto("PRO339-41 el MISMO producto en 22 renglones cuenta 22 líneas (no SKU distintos) → 422 con 21", esExceso(eDos));

    // Una línea con cantidad 100 cuenta 1.
    const cien = leerCuerpoFactura(crudo(Array.from({ length: 21 }, (_, i) => ({ productoId: i % 2 ? PRODUCTO : PRODUCTO_2, cantidad: i === 0 ? "100" : "1" }))));
    const bCien = baseSimulada();
    let eCien: unknown = null;

    try { await prepararFactura(bCien.db, EMPRESA_A, USUARIO, cien as never); } catch (e) { eCien = e; }
    cierto("PRO339-42 cantidades no cuentan: 21 renglones (uno con cantidad 100) pasan el control con máximo 21", !esExceso(eCien));

    // Reintento idempotente de una FE ya creada con payload histórico VERIFICADO (domicilioHistorico): no se reevalúa el máximo actual.
    const hist = await intentar(EMPRESA_A, 40, { domicilioHistorico: true });

    cierto("PRO339-43 reintento de FE histórica verificada con más líneas que el máximo actual: NO se lee ni se exige el máximo (payload original intacto)", !esExceso(hist.error) && !hist.base.consultas.some((c) => /fe_max_lineas/.test(c.sql)));
  }

  // ── 5. Respuesta HTTP ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const e = Object.assign(new ErrorFacturacion(422, mensajeExcesoLineas(21, 22)), { maxLineasFE: 21 });
    const r = respuestaErrorFacturacion(e, "revisar");
    const j = (await r.json()) as Record<string, unknown>;

    igual("PRO339-44 el 422 por exceso devuelve error + maxLineasFE (para actualizar la pantalla sin perder el borrador)", [r.status, j.maxLineasFE, typeof j.error], [422, 21, "string"]);

    const r2 = respuestaErrorFacturacion(new ErrorFacturacion(409, "otro"), "enviar");

    igual("PRO339-45 otros ErrorFacturacion no cambian (sin maxLineasFE)", [r2.status, "maxLineasFE" in ((await r2.json()) as object)], [409, false]);
  }

  // ── 6. Catálogos autenticados ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const cat = await catalogosFactura(baseSimulada().db, EMPRESA_B, USUARIO);
    const catSin = await catalogosFactura(baseSimulada({ sinColumna: true }).db, EMPRESA_B, USUARIO);

    igual("PRO339-46 catálogos exponen maxLineasFE de la empresa de la sesión (B = 63) sin error", [cat.maxLineasFE, "maxLineasFEError" in cat], [63, false]);
    igual("PRO339-47 sin NEX-078 los catálogos NO fallan: maxLineasFE null + motivo para mostrar", [catSin.maxLineasFE, (catSin as { maxLineasFEError?: string }).maxLineasFEError], [null, MENSAJE_LIMITE_SIN_MIGRACION]);

    const ruta = leer("app/api/facturas/catalogos/route.ts");

    cierto("PRO339-48 la ruta de catálogos usa la sesión (prepararFacturacion CREAR) y b.empresaId; no recibe empresa del navegador", /prepararFacturacion\("CREAR"\)/.test(ruta) && /catalogosFactura\(b\.db, b\.empresaId, b\.usuarioId\)/.test(ruta) && !/searchParams|request\.json/.test(ruta));
  }

  // ── 7. Código fuente: emisión, previa, NCE, migración, sin pantalla administrativa ──────────────────────────────────────────────────────────────────
  {
    const em = sinCom(leer("lib/facturacion/emision.ts"));
    const iPrep = em.indexOf("export async function prepararFactura(");
    const prep = em.slice(iPrep, em.indexOf("export async function crearFacturaElectronica("));
    const iLim = prep.indexOf("limiteLineasEmpresa(db, empresaId)");

    cierto("PRO339-49 prepararFactura controla el máximo antes de vendedor, cliente, productos y punto (y por tanto antes de reservar numeración y stock)", iLim > 0 && iLim < prep.indexOf("vendedorFeSoportado(db)") && iLim < prep.indexOf("receptorDe(db"));
    cierto("PRO339-50 el control solo se omite con payload histórico VERIFICADO (domicilioHistorico); crearFacturaElectronica lo pasa como historico !== null", /if \(opciones\.domicilioHistorico !== true\) \{\s*const limite = await limiteLineasEmpresa\(db, empresaId\);/.test(prep) && /prepararFactura\(db, empresaId, usuarioId, cuerpo, \{ documentoExiste, domicilioHistorico: historico !== null \}\)/.test(em));
    cierto("PRO339-51 la previa y la emisión pasan por prepararFactura (mismo contrato servidor)", /prepararFactura\(b\.db, b\.empresaId, b\.usuarioId, datos\)/.test(leer("app/api/facturas/previa/route.ts")) && /emitirFactura\(b\.db, b\.empresaId, b\.usuarioId, datos\)/.test(leer("app/api/facturas/route.ts")) && /crearFacturaElectronica\(db, empresaId, usuarioId, cuerpo, salida\)/.test(leer("lib/facturacion/envio.ts")));
    cierto("PRO339-52 leerCuerpoFactura mantiene la FORMA 1..999 y validarEntradaFE el MAX_LINEAS fiscal", /lineas\.length === 0 \|\| lineas\.length > 999\) return "Agregue al menos un ítem \(máximo 999\)\."/.test(em) && /if \(e\.lineas\.length > MAX_LINEAS\) errores\.push/.test(leer("lib/facturacion/payload-fe.ts")) && /export const MAX_LINEAS = 999;/.test(leer("lib/facturacion/payload-fe.ts")));
    cierto("PRO339-53 ningún número de empresa fijo en el código de la regla (sin 21/63/99, sin nombre ni RUC de empresa)", !/\b(21|63|99)\b|casa.?mingo/i.test(sinCom(leer("lib/facturacion/limite-lineas.ts"))) && !/casa.?mingo/i.test(prep));

    const nce = readdirSync(join(process.cwd(), "lib/facturacion")).filter((f) => /^nce.*\.ts$/.test(f) && !f.endsWith(".casos.ts"));

    cierto("PRO339-54 NCE intacta: ningún módulo NCE usa la regla de máximo por empresa", nce.length > 0 && nce.every((f) => !/limite-lineas|fe_max_lineas|limiteLineasEmpresa/.test(leer(`lib/facturacion/${f}`))));
    cierto("PRO339-55 KuDE, envío, reenvío y consulta no usan la regla (solo emisión de FE nueva)", ["lib/facturacion/kude.ts", "lib/facturacion/envio.ts", "lib/facturacion/stock-fe.ts"].filter((f) => existsSync(join(process.cwd(), f))).every((f) => !/limite-lineas|fe_max_lineas/.test(leer(f))));

    const mig = leer("documentacao/banco/nexit/v1/migraciones/NEX-078-empresas-fe-max-lineas.sql");
    const migSql = mig.replace(/--.*$/gm, "");

    cierto("PRO339-56 NEX-078: columna integer NULL con CHECK NULL o 1..999 y comentario", /ALTER TABLE public\.empresas ADD COLUMN fe_max_lineas integer NULL;/.test(migSql) && /CHECK \(fe_max_lineas IS NULL OR fe_max_lineas BETWEEN 1 AND 999\)/.test(migSql) && /COMMENT ON COLUMN public\.empresas\.fe_max_lineas/.test(migSql));
    cierto("PRO339-57 NEX-078 no cambia datos ni fija valores: sin UPDATE/INSERT/DELETE, sin DEFAULT, sin 21/63/99, sin UUID ni empresa por nombre", !/\b(UPDATE|INSERT|DELETE)\b/i.test(migSql) && !/DEFAULT/i.test(migSql) && !/\b(21|63|99)\b/.test(migSql) && !/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(migSql) && !/casa.?mingo|codigo\s*=/i.test(migSql));
    cierto("PRO339-58 NEX-078 no se reaplica (guarda de existencia) y no edita NEX-002", /ya existe: NEX-078 parece aplicada/.test(mig) && !/fe_max_lineas/.test(leer("documentacao/banco/nexit/v1/migraciones/NEX-002-seguridad.sql")));
    cierto("PRO339-59 preflight y verificación son de SOLO LECTURA (READ ONLY + ROLLBACK); la reversión se detiene si hay empresas configuradas", ["preflight", "verificar"].every((t) => { const x = leer(`documentacao/banco/nexit/v1/scripts/${t}-NEX-078.sql`).replace(/--.*$/gm, ""); return /BEGIN READ ONLY;/.test(x) && /ROLLBACK;/.test(x) && !/\b(UPDATE|INSERT|DELETE|ALTER)\b/i.test(x); }) && /fe_max_lineas IS NOT NULL\) THEN\s*RAISE EXCEPTION/.test(leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-078.sql")));

    const fuentes = (dir: string): string[] => readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? fuentes(`${dir}/${d.name}`) : /\.(ts|tsx)$/.test(d.name) && !d.name.endsWith(".casos.ts") ? [`${dir}/${d.name}`] : []));
    const app = [...fuentes("app"), ...fuentes("lib")];

    cierto("PRO339-60 sin pantalla ni API administrativa (PRO-340): ningún código escribe empresas.fe_max_lineas", app.every((f) => !/UPDATE\s+(public\.)?empresas[\s\S]{0,200}fe_max_lineas/i.test(leer(f))));
  }

  // ── 8. Pantalla Nueva factura (código fuente) ─────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const pag = leer("app/(private)/facturas/nueva/page.tsx");
    const iAgregar = pag.indexOf("function agregar(");
    const agregar = pag.slice(iAgregar, pag.indexOf("const agregarRapido", iAgregar));
    const selector = pag.slice(pag.indexOf("function SelectorProducto("), pag.indexOf("type ItemBusqueda"));

    cierto("PRO339-61 el mismo SKU suma cantidad ANTES del control (no cuenta línea nueva, permitido aun en el máximo)", agregar.indexOf("return existente.clave;") > 0 && agregar.indexOf("return existente.clave;") < agregar.indexOf("puedeAgregarLinea(lineas.length, maxLineasFE)"));
    cierto("PRO339-62 una línea nueva por encima del máximo no se agrega: aviso, sin foco a Cantidad y ALTA_BLOQUEADA", /if \(!puedeAgregarLinea\(lineas\.length, maxLineasFE\)\) \{\s*setAvisoLimiteLineas\(mensajeAltaBloqueada\(maxLineasFE\)\);\s*lineaAFocar\.current = null;\s*if \(origen === "rapido"\) volverAlBuscador\(ALTA_BLOQUEADA\);\s*return ALTA_BLOQUEADA;\s*\}/.test(agregar));
    cierto("PRO339-63 el alta usa agregarSiCabe (doble lectura del lector) y PRO331-22 sigue válido (agregar sin 21/999/MAX_LINEAS/FILAS_VISIBLES_DETALLE)", /aplicarLineas\(\(ls\) => agregarSiCabe\(ls, \{/.test(agregar) && !/FILAS_VISIBLES_DETALLE|\b21\b|MAX_LINEAS|999/.test(agregar));
    cierto("PRO339-64 selector avanzado: con ALTA_BLOQUEADA no registra «añadido» y muestra el aviso; el diálogo sigue abierto (foco en el selector)", /const clave = alAgregar\(p\); setUltimo\(\(u\) => \(clave === ALTA_BLOQUEADA \? u : registrarAnadido\(u, clave, p\.descripcion\)\)\); setAviso\(clave === ALTA_BLOQUEADA \? mensajeAltaBloqueada\(maxLineas\)/.test(selector) && /maxLineas=\{maxLineasFE\}/.test(pag));
    cierto("PRO339-65 contador «N de M ítems» en la tarjeta Detalle y en el selector", /textoContadorLineas\(lineas\.length, maxLineasFE\)/.test(pag) && /textoContadorLineas\(cantidadItems, maxLineas\)/.test(selector));
    cierto("PRO339-66 el máximo se lee de los catálogos autenticados (maxLineasFE), con aviso si falta NEX-078; nunca se envía al servidor", /setMaxLineasFE\(leerMaximoApi\(j\.maxLineasFE\)\)/.test(pag) && /j\.maxLineasFEError/.test(pag) && !/maxLineas/.test(pag.slice(pag.indexOf("const cuerpoFactura = () => ({"), pag.indexOf("const huellaActual"))));
    cierto("PRO339-67 un 422 con maxLineasFE (política cambiada) actualiza el máximo y conserva el borrador (solo errores; sin reenvío automático)", /maxLineasFE: leerMaximoApi\(j\.maxLineasFE\)/.test(pag) && /if \(maximo !== null\) \{ setMaxLineasFE\(maximo\); setErrorLimiteLineas\(""\); \}/.test(pag));
    cierto("PRO339-68 el aviso se oculta al bajar del máximo (borrar una línea habilita agregar otra)", /\{avisoLimiteLineas && !puedeAgregarLinea\(lineas\.length, maxLineasFE\) \?/.test(pag));
    cierto("PRO339-69 PRO-331 intacto: cuatro filas visibles y rolagem local medidos con FILAS_VISIBLES_DETALLE, sin relación con el máximo", /filas\[FILAS_VISIBLES_DETALLE\]/.test(pag) && /ref=\{setContenedorDetalle\}/.test(pag) && !/maxLineasFE/.test(pag.slice(pag.indexOf("const medir = () => {"), pag.indexOf("const observador = new ResizeObserver(medir);"))));
  }

  // ── 9. PRO-339-R02 (R01-F001): alta atómica, claves únicas y respuesta coherente ─────────────────────────────────────────────────────────────────────
  {
    // Modelo: acciones consecutivas ANTES de re-renderizar.
    const unHueco = editorModelo(21, filas(20));
    const r1 = unHueco.agregar("nuevo-a");
    const r2 = unHueco.agregar("nuevo-b");

    igual("PRO339-70 1 hueco y dos SKU distintos antes del re-render: entra solo el primero, el segundo devuelve ALTA_BLOQUEADA con el aviso del máximo de la empresa (nunca «añadido»)",
      [r1 > 0, r2, unHueco.lineas().length, unHueco.lineas().some((l) => l.productoId === "nuevo-b"), unHueco.avisos], [true, ALTA_BLOQUEADA, 21, false, ["Esta empresa admite un máximo de 21 líneas por factura electrónica."]]);

    const dosHuecos = editorModelo(63, filas(61));
    const c1 = dosHuecos.agregar("nuevo-a");
    const c2 = dosHuecos.agregar("nuevo-b");
    const claves = dosHuecos.lineas().map((l) => l.clave);

    igual("PRO339-71 2 huecos y dos SKU distintos antes del re-render: ambos entran con claves DISTINTAS y todas las claves del borrador son únicas", [c1 > 0 && c2 > 0 && c1 !== c2, dosHuecos.lineas().length, new Set(claves).size === claves.length], [true, 63, true]);

    const mismo = editorModelo(21, filas(3));
    const m1 = mismo.agregar("nuevo-a");
    const m2 = mismo.agregar("nuevo-a");
    const filaNueva = mismo.lineas().filter((l) => l.productoId === "nuevo-a");

    igual("PRO339-72 mismo SKU dos veces antes del re-render: una sola fila, cantidad 2, misma clave en ambas respuestas", [filaNueva.length, filaNueva[0]?.cantidad, m1 === m2, mismo.lineas().length], [1, "2", true, 4]);

    const lleno = editorModelo(21, filas(21));
    const inc = lleno.agregar("p-5");

    igual("PRO339-73 en el máximo exacto, sumar un SKU existente sigue permitido (clave de esa fila, sin aviso, sin fila nueva)", [inc, lleno.lineas().length, lleno.lineas()[4].cantidad, lleno.avisos.length], [5, 21, "2", 0]);

    const borrar = editorModelo(21, filas(21));

    borrar.quitar(7);

    const tras = borrar.agregar("nuevo-a");
    const otra = borrar.agregar("nuevo-b");

    igual("PRO339-74 quitar una con 21/21 y agregar dos seguidas: entra una (clave nueva, no reutiliza la quitada), la siguiente se bloquea", [tras > 21, otra, borrar.lineas().length], [true, ALTA_BLOQUEADA, 21]);

    const mixto = editorModelo(99, filas(97));

    igual("PRO339-75 alternar lector y selector (misma función) con 2 huecos: SKU nuevo, SKU repetido, SKU nuevo, SKU nuevo → 2 filas nuevas, 1 incremento, 1 bloqueo", [mixto.agregar("x") > 0, mixto.agregar("x") > 0, mixto.agregar("y") > 0, mixto.agregar("z"), mixto.lineas().length], [true, true, true, ALTA_BLOQUEADA, 99]);
    igual("PRO339-76 sin máximo conocido (null) el modelo solo respeta el fiscal común", [editorModelo(null, filas(998)).agregar("n") > 0, editorModelo(null, filas(999)).agregar("n")], [true, ALTA_BLOQUEADA]);

    // Código real de la pantalla.
    const pag = leer("app/(private)/facturas/nueva/page.tsx");
    const iAgregar = pag.indexOf("function agregar(");
    const agregar = pag.slice(iAgregar, pag.indexOf("const agregarRapido", iAgregar));
    const selector = pag.slice(pag.indexOf("function SelectorProducto("), pag.indexOf("type ItemBusqueda"));
    const iAplicar = pag.indexOf("const aplicarLineas = useCallback(");
    const aplicar = pag.slice(iAplicar, pag.indexOf("}, []);", iAplicar));

    cierto("PRO339-77 borrador y próxima clave en refs síncronas; aplicarLineas calcula sobre la ref y fija el VALOR (sin actualizador funcional)", /const lineasActuales = useRef<Linea\[\]>\(\[\]\);/.test(pag) && /const claveSiguiente = useRef\(1\);/.test(pag) && /const nuevas = cambio\(lineasActuales\.current\);\s*lineasActuales\.current = nuevas;\s*setLineas\(nuevas\);/.test(aplicar));
    cierto("PRO339-78 ninguna escritura de líneas fuera de aplicarLineas (agregar, editar, ajuste, moneda, quitar, nueva factura): setLineas aparece una sola vez", (pag.match(/setLineas\(/g) ?? []).length === 1 && !/setSiguienteClave/.test(pag));
    cierto("PRO339-79 agregar decide SKU existente y cupo sobre el borrador más reciente (no el snapshot del render)", /const lineas = lineasActuales\.current;\s*\/\/ El mismo producto no se duplica: suma una unidad a su línea\.\s*const existente = lineas\.find/.test(agregar) && /puedeAgregarLinea\(lineas\.length, maxLineasFE\)/.test(agregar));
    cierto("PRO339-80 la clave se reserva SOLO después del control de cupo y avanza en el acto (dos altas no comparten clave); el rechazo no consume clave", agregar.indexOf("return ALTA_BLOQUEADA;") < agregar.indexOf("const siguienteClave = claveSiguiente.current;") && /const siguienteClave = claveSiguiente\.current;\s*claveSiguiente\.current = siguienteClave \+ 1;/.test(agregar));
    cierto("PRO339-81 sin efectos dentro de actualizadores: foco, aviso y panel fiscal se deciden en el manejador; ningún setState/foco dentro de aplicarLineas((ls) => …)", !/aplicarLineas\(\(ls\) => [^;]*(setEditando|setAviso|focus|lineaAFocar|volverAlBuscador)/.test(pag) && !/setLineas\(\(ls\)/.test(pag));
    cierto("PRO339-82 alta rechazada: no abre el panel fiscal ni enfoca Cantidad (el return ocurre antes de setEditando y de lineaAFocar = siguienteClave)", agregar.indexOf("return ALTA_BLOQUEADA;") < agregar.indexOf("if (abrePanel) setEditando(siguienteClave);") && agregar.indexOf("return ALTA_BLOQUEADA;") < agregar.indexOf('if (destino === "cantidad") lineaAFocar.current = siguienteClave;'));
    cierto("PRO339-83 selector avanzado: «añadido» y registro del último SOLO con clave real; con ALTA_BLOQUEADA, aviso del máximo de la empresa", /setUltimo\(\(u\) => \(clave === ALTA_BLOQUEADA \? u : registrarAnadido\(u, clave, p\.descripcion\)\)\)/.test(selector) && /setAviso\(clave === ALTA_BLOQUEADA \? mensajeAltaBloqueada\(maxLineas\) : `«\$\{p\.descripcion\}» añadido\.`\)/.test(selector));
    cierto("PRO339-84 quitar pasa por la ref (borrar y reagregar antes del re-render ve el borrador real)", /onClick=\{\(\) => \{ aplicarLineas\(\(ls\) => ls\.filter\(\(x\) => x\.clave !== l\.clave\)\);/.test(pag));
    cierto("PRO339-85 PRO-331 intacto en agregar: mismo SKU suma con sumarUnaUnidad y vuelve al buscador; alta nueva sin foco a Cantidad en rápido; panel fiscal con permiso", /sumarUnaUnidad\(l\.cantidad\)/.test(agregar) && /const destino = destinoFocoTrasAlta\(origen, abrePanel\);/.test(agregar) && /if \(abrePanel\) setEditando\(siguienteClave\);/.test(agregar) && !/FILAS_VISIBLES_DETALLE|\b21\b|MAX_LINEAS|999/.test(agregar));
    cierto("PRO339-86 el 422 por cambio de política sigue conservando el borrador (solo actualiza máximo y errores) y R02 no toca backend ni NEX-078", /if \(maximo !== null\) \{ setMaxLineasFE\(maximo\); setErrorLimiteLineas\(""\); \}/.test(pag) && /limiteLineasEmpresa\(db, empresaId\)/.test(leer("lib/facturacion/emision.ts")));
    // Strict Mode / intercalado: verificado SOLO por inspección (no se ejecutó React). Los manejadores de eventos no se duplican en Strict Mode; los actualizadores sí, y ya no hay ninguno con efectos.
  }

  return fallos;
}
