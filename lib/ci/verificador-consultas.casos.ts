/**
 * Regresiones del verificador C1 (documentacao/banco/nexit/v1/herramientas/verificar-consultas-app.js). Sin PostgreSQL: PREPARE se simula con una función inyectada; lo que se
 * prueba es la CLASIFICACIÓN (literal, reconstruida, fragmento, no verificable), la resolución exacta de interpolaciones y la política de calidad. El PREPARE real lo ejecuta el CI
 * sobre PostgreSQL 16 descartable (paso C1).
 */
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";

type Informe = {
  total: number; literales: { ok: number; fallas: Array<{ err: string }> }; reconstruidas: { ok: number; variantes: number; fallas: Array<{ err: string; sql: string }> };
  fragmentos: { cubiertos: number; sinAnfitrion: unknown[]; conAnfitrionaEnFalla: unknown[] }; reconstruidasPorArchivo: Record<string, number>; sugerencias: unknown[];
  noVerificables: Array<{ id: string; motivo: string }>; corregidas: unknown[];
  anfitrionas: { total: number; ok: number; variantes: number }; interpretadas: { ok: number; variantes: number };
};
type Modulo = {
  escanear: (s: string) => Array<{ partes: Array<{ t: string; v: string }>; nombre: string | null; params: string[] | null }>;
  analizar: (a: Array<{ archivo: string; src: string; plantillas: unknown[] }>, p: (sql: string) => { ok: boolean; err: string }) => Informe;
  veredicto: (i: Informe, base: { noVerificables?: string[] }) => { fallas: number; nuevas: unknown[]; obsoletas: string[]; ok: boolean };
  leerArchivos: (raiz: string) => Array<{ archivo: string; src: string; plantillas: unknown[] }>;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const C1 = require(join(process.cwd(), "documentacao/banco/nexit/v1/herramientas/verificar-consultas-app.js")) as Modulo;

const BT = "`";
const archivo = (nombre: string, src: string) => ({ archivo: nombre, src, plantillas: C1.escanear(src) });
const siempreOk = () => ({ ok: true, err: "" });

export async function verificarCasosVerificadorC1(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  /** SQL que llegó a PREPARE al analizar un solo archivo sintético. */
  const preparados = (src: string, extra: Array<ReturnType<typeof archivo>> = []) => {
    const vistos: string[] = [];
    const inf = C1.analizar([archivo("lib/x.ts", src), ...extra], (sql) => { vistos.push(sql.replace(/\s+/g, " ").trim()); return { ok: true, err: "" }; });

    return { vistos, inf };
  };

  // ── Lector de plantillas
  const anidada = `const q = ${BT}SELECT a FROM t WHERE x = $1 \${y ? ${BT} AND z = \${w}${BT} : ""} ORDER BY a${BT};`;
  const plantillas = C1.escanear(anidada);

  igual("lector: una plantilla con otra anidada dentro de ${…} es UNA sola plantilla con una interpolación (antes se partía en trozos sin sentido)", [plantillas.length, plantillas[0].partes.filter((p) => p.t === "expr").length, plantillas[0].nombre], [1, 1, "q"]);
  igual("lector: un literal de expresión regular con comillas y comillas invertidas no desordena el resto del archivo", C1.escanear(`const r = /["'${BT}]/g; const q = ${BT}SELECT 1 FROM t${BT};`).map((p) => p.nombre), ["q"]);
  igual("lector: funciones auxiliares de plantilla registran sus parámetros (D = (c) => …)", C1.escanear(`const D = (c: string) => ${BT}to_char(\${c}, 'YYYY')${BT};`).map((p) => [p.nombre, p.params]), [["D", ["c"]]]);

  // ── Clasificación
  const lit = preparados(`const a = ${BT}SELECT id FROM clientes WHERE empresa_id = $1${BT};`);

  igual("clasificación: consulta literal → PREPARE directo y contada como LITERAL", [lit.vistos, lit.inf.literales.ok, lit.inf.noVerificables.length], [["SELECT id FROM clientes WHERE empresa_id = $1"], 1, 0]);

  const fn = preparados(`const D = (c: string) => ${BT}to_char(\${c}, 'DD')${BT}; const q = ${BT}SELECT \${D("l.vigente_desde")} AS d FROM listas l WHERE l.id = $1${BT};`);

  igual("resolución exacta: función auxiliar de plantilla con argumentos literales (D()) → reconstruida y contada como RECONSTRUIDA", [fn.vistos, fn.inf.reconstruidas.ok, fn.inf.noVerificables.length], [["SELECT to_char(l.vigente_desde, 'DD') AS d FROM listas l WHERE l.id = $1"], 1, 0]);

  const entreArchivos = preparados(`import { SQL_VERSION } from "./v";\nconst q = ${BT}SELECT \${SQL_VERSION("x.actualizado_at")} AS v FROM listas x WHERE x.id = $1${BT};`, [archivo("lib/v.ts", `export const SQL_VERSION = (col: string) => ${BT}to_char(\${col} AT TIME ZONE 'UTC', 'YYYY')${BT};`)]);

  igual("resolución exacta: función auxiliar IMPORTADA de forma rastreada (import { SQL_VERSION } from \"./v\")", [entreArchivos.vistos.some((s2) => s2.includes("to_char(x.actualizado_at AT TIME ZONE 'UTC'")), entreArchivos.inf.noVerificables.length], [true, 0]);
  igual("sin import rastreado, la misma función de OTRO archivo NO se usa (queda NO VERIFICABLE)", preparados(`const q = ${BT}SELECT \${SQL_VERSION("x.actualizado_at")} AS v FROM listas x WHERE x.id = $1${BT};`, [archivo("lib/v.ts", `export const SQL_VERSION = (col: string) => ${BT}to_char(\${col}, 'YYYY')${BT};`)]).inf.noVerificables.map((n) => n.motivo), ["función auxiliar no resoluble: SQL_VERSION(…)"]);

  const proy = preparados(`const CFG = { a: { tabla: "grupos_cliente" }, b: { tabla: "vendedores" } };\nconst proyectar = (tipo: string) => ${BT}t.id, (SELECT count(*) FROM x WHERE x.k = t.id) AS usos${BT};\nconst q = ${BT}SELECT \${proyectar(tipo)} FROM \${CFG[tipo].tabla} t WHERE t.empresa_id = $1 ORDER BY t.nombre${BT};`);

  igual("C1-R03-02: proyectar(tipo) NO se sustituye por «t.*» (aprobaría otra consulta): queda NO VERIFICABLE con motivo y no se prepara ningún SQL sintético", [proy.vistos, proy.inf.noVerificables.map((n) => n.motivo.startsWith("proyección dinámica proyectar")), proy.inf.reconstruidas.ok], [[], [true], 0]);

  const tablas = preparados(`const CFG = { a: { tabla: "grupos_cliente" }, b: { tabla: "vendedores" } };\nconst q = ${BT}SELECT t.id FROM \${CFG[tipo].tabla} t WHERE t.empresa_id = $1 ORDER BY t.nombre${BT};`);

  igual("tablas reales de CFG: «FROM ${CFG[tipo].tabla} t» se reconstruye con cada tabla del CFG y el alias (no «FROM t»)", tablas.vistos, ["SELECT t.id FROM grupos_cliente t WHERE t.empresa_id = $1 ORDER BY t.nombre", "SELECT t.id FROM vendedores t WHERE t.empresa_id = $1 ORDER BY t.nombre"]);

  // C1-R03-01: variables homónimas de otro archivo / de otra función
  const filtroAjeno = archivo("lib/otro.ts", `const filtro = ${BT} AND (\$2 = '' OR concat_ws(' ', p.codigo) ILIKE \$3)${BT};\nexport const q2 = ${BT}SELECT 1 FROM productos p WHERE p.empresa_id = $1 \${filtro}${BT};`);
  const filtroLocal = `async function f(clienteId: string | null) {\n  const filtro = clienteId ? "AND c.id = $2" : "";\n  return db.query(${BT}SELECT c.id FROM clientes c WHERE c.empresa_id = $1 \${filtro}${BT});\n}`;
  const homonimo = preparados(filtroLocal, [filtroAjeno]);

  igual("C1-R03-01: una variable local «filtro» (condicional) NO se sustituye por otra «filtro» de OTRO archivo: queda NO VERIFICABLE y el SQL del otro archivo nunca aparece en el PREPARE del primero", [homonimo.inf.noVerificables.map((n) => n.motivo).includes("variable de ejecución: filtro"), homonimo.vistos.some((v2) => v2.includes("clientes c") && v2.includes("concat_ws")), homonimo.vistos.filter((v2) => v2.includes("clientes c")).length], [true, false, 0]);
  igual("C1-R03-01: dos variables del mismo nombre en el MISMO archivo (una condicional y otra plantilla, en funciones distintas) tampoco se resuelven (ambigua)", preparados(`function a(c: boolean) { const filtro = c ? "AND x = $2" : ""; return ${BT}SELECT 1 FROM t WHERE a = $1 \${filtro}${BT}; }\nfunction b() { const filtro = ${BT}AND z = 2${BT}; return filtro; }`).inf.noVerificables.map((n) => n.motivo), ["variable declarada más de una vez en el archivo: filtro"]);
  igual("C1-R03-01: una constante exportada SÍ se usa cuando el archivo la importa (import rastreado) y se resuelve en el contexto del archivo que la define", preparados(`import { ALC as MIO } from "@/lib/a";\nconst q = ${BT}SELECT 1 FROM t WHERE x = $1 AND \${MIO}${BT};`, [archivo("lib/a.ts", `export const ALC = ${BT}y IN (SELECT 1 FROM u WHERE u.id = $2 \${F})${BT};\nconst F = "AND u.ok";`)]).vistos, ["SELECT 1 FROM t WHERE x = $1 AND y IN (SELECT 1 FROM u WHERE u.id = $2 AND u.ok)"]);

  // C1-R03-03: las correcciones hipotéticas no aprueban el SQL publicado
  const sugerencia = (() => {
    const inf = C1.analizar([archivo("lib/x.ts", `const q = ${BT}UPDATE t SET a = CASE WHEN b THEN $32 ELSE NULL END WHERE id = $1${BT};`)], (sql) => (sql.includes("$32::uuid") ? { ok: true, err: "" } : { ok: false, err: "ERROR: column a is of type uuid but expression is of type text" }));

    return inf;
  })();

  igual("C1-R03-03: una corrección hipotética que sí pasaría PREPARE NO aprueba el SQL publicado: la consulta sigue en FALLA, la sugerencia solo se informa y el veredicto es negativo", [sugerencia.literales.fallas.length, sugerencia.sugerencias.length, C1.veredicto(sugerencia, { noVerificables: [] }).ok, sugerencia.literales.ok], [1, 1, false, 0]);

  const frag = preparados(`const PERMITIDOS = ${BT}SELECT d.id FROM depositos d WHERE d.empresa_id = $1 AND d.x = $3${BT};\nconst q = ${BT}SELECT count(*) FROM (\${PERMITIDOS.replace("$3", "$2")}) x WHERE $1 IS NOT NULL${BT};\nconst r = ${BT}SELECT d.id FROM depositos d WHERE d.empresa_id = $1\${alc ? ${BT} AND d.id IN (\${PERMITIDOS.replace("$3", "$2")})${BT} : ""}${BT};`);

  igual("falso error de la versión anterior: el fragmento PERMITIDOS ($3) no se prepara suelto; se valida dentro de sus consultas anfitrionas con $3 → $2, incluida la rama de un ternario con plantilla anidada", [
    frag.vistos.some((s) => s === "SELECT d.id FROM depositos d WHERE d.empresa_id = $1 AND d.x = $3"), frag.vistos.filter((s) => s.includes("$3")).length, frag.vistos.length, frag.inf.fragmentos.cubiertos, frag.inf.noVerificables.length,
  ], [false, 0, 3, 1, 0]);

  const ternario = preparados(`const q = ${BT}SELECT 1 FROM t WHERE a = $1 \${f ? "AND b = $2" : ""}${BT};`);

  igual("ternario independiente: se prueban AMBAS ramas", ternario.vistos, ["SELECT 1 FROM t WHERE a = $1 AND b = $2", "SELECT 1 FROM t WHERE a = $1"]);

  // ── Lo que NO puede resolverse queda NO VERIFICABLE con motivo (nunca PASS)
  const motivos = (src: string) => preparados(src).inf.noVerificables.map((n) => n.motivo);

  igual("NO VERIFICABLE: arreglo unido en tiempo de ejecución", motivos(`const q = ${BT}UPDATE t SET \${sets.join(", ")} WHERE id = $1${BT};`), ['expresión de ejecución: sets.join(", ")']);
  igual("NO VERIFICABLE: variable calculada en la función", motivos(`const q = ${BT}SELECT 1 FROM t WHERE a = $1\${filtro}${BT};`), ["variable de ejecución: filtro"]);
  igual("NO VERIFICABLE: condicional acoplado a tipo/tabla (no se adivina la combinación)", motivos(`const q = ${BT}SELECT 1 FROM t WHERE a = $1 \${tipo === "x" ? "AND f = $2" : ""}${BT};`), ['condicional acoplado a tipo/tabla (tipo === "x")']);
  igual("NO VERIFICABLE: tabla × condicional sin acoplamiento conocido", motivos(`const CFG = { a: { tabla: "uno" } };\nconst q = ${BT}SELECT 1 FROM \${CFG[tipo].tabla} t WHERE a = $1 \${f ? "AND b = $2" : ""}${BT};`), ["combinación tabla × condicional sin acoplamiento conocido"]);
  igual("NO VERIFICABLE: nombre declarado dos veces en el archivo (no se adivina cuál aplica)", motivos(`function a() { const f = ${BT}AND x = 1${BT}; }\nfunction b() { const f = ${BT}AND y = 2${BT}; }\nconst q = ${BT}SELECT 1 FROM t WHERE a = $1 \${f}${BT};`), ["variable declarada más de una vez en el archivo: f"]);
  igual("NO VERIFICABLE: un fragmento SQL sin ninguna anfitriona verificada no queda cubierto en silencio", preparados(`const SEL = ${BT}SELECT 1 FROM t WHERE a = $1${BT};\nconst q = ${BT}\${SEL} AND \${algo.join(",")}${BT};`).inf.noVerificables.map((n) => n.motivo.startsWith("fragmento SEL")), [true]);

  // ── PREPARE: errores reales siguen siendo FALLA (no se ocultan ni por ser dinámicas)
  const fallaLit = C1.analizar([archivo("lib/x.ts", `const q = ${BT}SELECT nada FROM clientes WHERE id = $1${BT};`)], () => ({ ok: false, err: "ERROR: column nada does not exist" }));
  const fallaDin = C1.analizar([archivo("lib/x.ts", `const CFG = { a: { tabla: "uno" } };\nconst q = ${BT}SELECT t.nada FROM \${CFG[tipo].tabla} t WHERE t.id = $1${BT};`)], () => ({ ok: false, err: "ERROR: column t.nada does not exist" }));

  igual("calidad: el error de PREPARE de una consulta literal o de una reconstruida con interpolaciones resueltas es FALLA (sin atenuantes)", [fallaLit.literales.fallas.length, fallaDin.reconstruidas.fallas.length, fallaDin.reconstruidas.fallas[0].err], [1, 1, "ERROR: column t.nada does not exist"]);

  // ── Política de calidad (el verificador NO aprueba lagunas en silencio)
  const base = preparados(`const q = ${BT}UPDATE t SET \${sets.join(", ")} WHERE id = $1${BT};`).inf;
  const id0 = base.noVerificables[0].id;

  igual("política: sin línea base una consulta NO VERIFICABLE hace fallar el CI; con su id en la línea base se admite; una entrada obsoleta solo avisa; con una FALLA falla aunque todo lo demás esté en la línea base", [
    C1.veredicto(base, { noVerificables: [] }).ok, C1.veredicto(base, { noVerificables: [id0] }).ok, C1.veredicto(base, { noVerificables: [id0, "lib/y.ts:000"] }).obsoletas, C1.veredicto({ ...base, literales: { ok: 0, fallas: [{ err: "x" }] } }, { noVerificables: [id0] }).ok,
  ], [false, true, ["lib/y.ts:000"], false]);
  igual("política: el id de una consulta es estable ante cambios de espacios/saltos de línea (CRLF/LF) y cambia si cambia el SQL", [
    preparados(`const q = ${BT}UPDATE t SET \${sets.join(", ")}\r\n  WHERE id = $1${BT};`).inf.noVerificables[0].id === id0, preparados(`const q = ${BT}UPDATE t SET \${sets.join(", ")} WHERE id = $2${BT};`).inf.noVerificables[0].id === id0,
  ], [true, false]);

  // ── PRE-VM-R02-D: consultas anfitrionas, CTE dependientes e intérprete acotado
  // Envoltura q(sql, adicional, extra) → `WITH ${cte}, ${adicional} ${sql}`; CTE común armado por una función auxiliar con push condicional y la clausura p(); CTE de la vista con pe().
  const ANF = String.raw`function construir(f: F, esq: E, p: (v: unknown) => string): string {
  const cond: string[] = [];
  if (f.sucursal) cond.push(${"`"}d.sucursal_id = ${"${"}p(f.sucursal)}${"`"});
  const dsc = esq.descuentos
    ? ${"`"}SELECT nd.id FROM nce_descuentos nd JOIN docs n ON n.id = nd.nce_id${"`"}
    : ${"`"}SELECT NULL::uuid AS id WHERE false${"`"};
  return ${"`"}docs AS (SELECT d.id, d.estado FROM documentos d WHERE d.empresa_id = $1 ${"${"}cond.map((x) => ${"`"}AND ${"${"}x}${"`"}).join(" ")}), dsc AS (${"${"}dsc}), fil AS (SELECT docs.* FROM docs)${"`"};
}
export async function leer(db: Db, empresaId: string, filtros: F) {
  const esq = await leerEsquema(db);
  if (!esq.base) return null;
  const params: unknown[] = [empresaId];
  const p = (v: unknown) => { params.push(v); return ${"`"}$${"${"}params.length}${"`"}; };
  const cte = construir(filtros, esq, p);
  const base = params.length;
  const q = async (sql: string, adicional = "", extra: unknown[] = []) =>
    (await db.query(${"`"}WITH ${"${"}cte}${"${"}adicional ? ${"`"}, ${"${"}adicional}${"`"} : ""} ${"${"}sql}${"`"}, [...params, ...extra])).rows;
  const pe = (k: number) => ${"`"}$${"${"}base + k}${"`"};
  const total = await q(${"`"}SELECT count(*) FROM fil${"`"});
  const extra: unknown[] = [];
  const condLista: string[] = [];
  if (filtros.estado) { extra.push(filtros.estado); condLista.push(${"`"}estado = ${"${"}pe(extra.length)}${"`"}); }
  const lista = ${"`"}lista AS (SELECT * FROM fil${"${"}condLista.length ? ${"`"} WHERE ${"${"}condLista.join(" AND ")}${"`"} : ""})${"`"};
  const filas = await q(${"`"}SELECT id FROM lista ORDER BY id LIMIT ${"${"}pe(extra.length + 1)}${"`"}, lista, [...extra, 10]);
  return { total, filas };
}`;
  const anf = preparados(ANF);
  const MAX = "WITH docs AS (SELECT d.id, d.estado FROM documentos d WHERE d.empresa_id = $1 AND d.sucursal_id = $2), dsc AS (SELECT nd.id FROM nce_descuentos nd JOIN docs n ON n.id = nd.nce_id), fil AS (SELECT docs.* FROM docs), lista AS (SELECT * FROM fil WHERE estado = $3) SELECT id FROM lista ORDER BY id LIMIT $4";

  igual("R02-D anfitriona: la plantilla pasada a q(…) que depende del CTE común NUNCA se prepara suelta; se prepara la consulta COMPLETA «WITH docs…, fil… SELECT … FROM fil» y cuenta como anfitriona válida", [
    anf.vistos.includes("SELECT count(*) FROM fil"), anf.vistos.every((s) => s.startsWith("WITH docs AS (")), anf.inf.anfitrionas.total, anf.inf.anfitrionas.ok, anf.inf.noVerificables.length, anf.inf.literales.ok,
  ], [false, true, 2, 2, 0, 0]);
  igual("R02-D CTE adicional y parámetros: la consulta de la vista agrega su CTE (lista) y sus parámetros siguen a los del CTE común (pe(k) = base + k); con todos los filtros activos la numeración es $1…$4 sin huecos", [anf.vistos.includes(MAX), anf.vistos.includes("WITH docs AS (SELECT d.id, d.estado FROM documentos d WHERE d.empresa_id = $1 ), dsc AS (SELECT NULL::uuid AS id WHERE false), fil AS (SELECT docs.* FROM docs), lista AS (SELECT * FROM fil) SELECT id FROM lista ORDER BY id LIMIT $2")], [true, true]);
  igual("R02-D CTE dependiente del esquema: el cuerpo de dsc («… JOIN docs …») no se prepara suelto (docs no existiría); sus DOS ramas llegan a PREPARE dentro de la anfitriona y cuentan como FRAGMENTOS cubiertos", [
    anf.vistos.some((s) => s.startsWith("SELECT nd.id")), anf.vistos.some((s) => s.includes("dsc AS (SELECT nd.id FROM nce_descuentos nd JOIN docs n")), anf.vistos.some((s) => s.includes("dsc AS (SELECT NULL::uuid AS id WHERE false)")), anf.inf.fragmentos.cubiertos,
  ], [false, true, true, 2]);

  const anfFalla = (() => {
    const vistos: string[] = [];
    const inf = C1.analizar([archivo("lib/x.ts", ANF.replace("SELECT count(*) FROM fil", "SELECT count(*) FROM nada"))], (sql) => {
      vistos.push(sql);

      return sql.includes("FROM nada") ? { ok: false, err: 'ERROR: relation "nada" does not exist' } : { ok: true, err: "" };
    });

    return inf;
  })();

  igual("R02-D SQL realmente inválido en una anfitriona: es FALLA (cada variante con el error de PREPARE), sus fragmentos no se dan por cubiertos ni se esconden como NO VERIFICABLE y el veredicto es negativo", [
    anfFalla.reconstruidas.fallas.length, anfFalla.reconstruidas.fallas.every((f) => f.err.includes('relation "nada"')), anfFalla.fragmentos.cubiertos, anfFalla.fragmentos.conAnfitrionaEnFalla.length, anfFalla.noVerificables.length, C1.veredicto(anfFalla, { noVerificables: [] }).ok,
  ], [4, true, 0, 2, 0, false]);

  const anfNv = preparados(ANF.replace("FROM documentos d WHERE", "FROM ${filtros.tabla} d WHERE"));

  igual("R02-D anfitriona no reconstruible (un dato de ejecución llega al SQL): NO VERIFICABLE con motivo, nada se prepara y sus fragmentos quedan «sin consulta anfitriona verificada» (nunca cubiertos en silencio)", [
    anfNv.vistos.length, anfNv.inf.noVerificables.map((n) => n.motivo.startsWith("consulta anfitriona q(…) no reconstruible: valor de ejecución en el SQL") ? "anfitriona" : n.motivo),
  ], [0, ["anfitriona", "anfitriona", "fragmento de consulta anfitriona sin consulta anfitriona verificada", "fragmento de consulta anfitriona sin consulta anfitriona verificada"]]);

  const union = preparados(String.raw`const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function consulta(empresaId: string, c: { desde?: string; estado?: string }) {
  const params: unknown[] = [empresaId];
  const cond: string[] = ["e.empresa_id = $1"];
  const agregar = (sql: (n: number) => string, valor: unknown) => { params.push(valor); cond.push(sql(params.length)); };
  if (c.desde && ISO.test(c.desde)) agregar((n) => ${"`"}e.fecha >= $${"${"}n}::date${"`"}, c.desde);
  if (c.estado && ["A", "B"].includes(c.estado)) agregar((n) => ${"`"}e.estado = $${"${"}n}${"`"}, c.estado);
  const where = ${"`"} WHERE ${"${"}cond.join(" AND ")}${"`"};
  return { sql: ${"`"}SELECT e.id FROM entradas e${"${"}where} ORDER BY e.id LIMIT $${"${"}params.length + 1}${"`"}, params };
}`);

  igual("R02-D unión de un arreglo local (cond.join) con función auxiliar agregar((n) => …): se recorre la función y se preparan la variante base, cada filtro por separado y todos juntos, con la numeración real", [union.vistos, union.inf.interpretadas, union.inf.noVerificables.length], [[
    "SELECT e.id FROM entradas e WHERE e.empresa_id = $1 ORDER BY e.id LIMIT $2",
    "SELECT e.id FROM entradas e WHERE e.empresa_id = $1 AND e.estado = $2 ORDER BY e.id LIMIT $3",
    "SELECT e.id FROM entradas e WHERE e.empresa_id = $1 AND e.fecha >= $2::date AND e.estado = $3 ORDER BY e.id LIMIT $4",
  ], { ok: 1, variantes: 3 }, 0]);
  igual("R02-D sin falsos positivos: un arreglo armado en un bucle (fuera del subconjunto interpretable) NO se reconstruye; queda NO VERIFICABLE con su motivo original", preparados(String.raw`export function consulta(cols: string[]) {
  const sets: string[] = [];
  for (const c of cols) sets.push(${"`"}${"${"}c} = $2${"`"});
  return ${"`"}UPDATE t SET ${"${"}sets.join(", ")} WHERE id = $1${"`"};
}`).inf.noVerificables.map((n) => n.motivo), ['expresión de ejecución: sets.join(", ")']);

  const sombra = preparados(String.raw`const extraSql = "AND 1 = 1";
export function consulta(extraSql: string) {
  const cond: string[] = ["a = $1"];
  cond.push(extraSql);
  return ${"`"}SELECT 1 FROM t WHERE ${"${"}cond.join(" AND ")}${"`"};
}`);

  igual("R02-D sin falsos positivos: un parámetro que sombrea una constante homónima del módulo es dato de ejecución; jamás se sustituye por la constante (sería otra consulta)", [sombra.vistos, sombra.inf.noVerificables.map((n) => n.motivo)], [[], ['expresión de ejecución: cond.join(" AND ")']]);

  const numericas = preparados(String.raw`import { ALC } from "@/lib/a";
const POR_PAGINA = 100;
export async function f(db: Db, hay: boolean) {
  const extra = hay ? " AND x.ok" : "";
  return db.query(${"`"}SELECT x.id FROM t x WHERE x.e = $1${"${"}extra} AND ${"${"}ALC(3)} LIMIT ${"${"}POR_PAGINA + 1}${"`"});
}`, [archivo("lib/a.ts", String.raw`const BASE = ${"`"}x.u IN (SELECT u FROM w WHERE w.k = $2)${"`"};
export const ALC = (n: number) => BASE.split("$2").join(${"`"}$${"${"}n}${"`"});`)]);

  igual("R02-D constantes: entero (POR_PAGINA + 1 → 101), fragmento condicional entre dos literales SIN parámetros (ambas ramas) y función flecha de una expresión importada (ALC(3): $2 → $3)", numericas.vistos, [
    "SELECT x.id FROM t x WHERE x.e = $1 AND x.ok AND x.u IN (SELECT u FROM w WHERE w.k = $3) LIMIT 101",
    "SELECT x.id FROM t x WHERE x.e = $1 AND x.u IN (SELECT u FROM w WHERE w.k = $3) LIMIT 101",
  ]);

  const calculados = preparados(String.raw`export function f(params: unknown[], sel: string) {
  return ${"`"}${"${"}sel} WHERE a = $1 LIMIT $${"${"}params.length + 1}${"`"};
}`);

  igual("R02-D sin falsos negativos: una consulta cuyos marcadores son calculados ($${n}) ya no se omite en silencio; se analiza y, si no se reconstruye, queda NO VERIFICABLE", [calculados.inf.total, calculados.inf.noVerificables.map((n) => n.motivo)], [1, ["variable de ejecución: sel"]]);

  const objeto = preparados(String.raw`export async function f(db: Db, vista: string) {
  const params: unknown[] = [1];
  const q = async (sql: string, adicional = "") => (await db.query(${"`"}WITH base AS (SELECT 1 AS n) ${"${"}adicional ? ${"`"}, ${"${"}adicional}${"`"} : ""} ${"${"}sql}${"`"}, params)).rows;
  if (vista === "A") return q(${"`"}SELECT n FROM base${"`"});
  const def = { X: { orden: "n DESC" }, Y: { orden: "n" } }[vista as "X" | "Y"];
  return q(${"`"}SELECT n FROM base WHERE n = $1 ORDER BY ${"${"}def.orden}${"`"});
}`);

  igual("R02-D variantes por dato de ejecución: un objeto de definiciones indexado por la vista se prueba con CADA clave declarada; una vista sin definición aborta el camino (como en JS) y no inventa SQL", [objeto.vistos, objeto.inf.anfitrionas, objeto.inf.noVerificables.length], [[
    "WITH base AS (SELECT 1 AS n) SELECT n FROM base", "WITH base AS (SELECT 1 AS n) SELECT n FROM base WHERE n = $1 ORDER BY n", "WITH base AS (SELECT 1 AS n) SELECT n FROM base WHERE n = $1 ORDER BY n DESC",
  ], { total: 2, ok: 2, variantes: 3 }, 0]);

  // ── El código REAL de la aplicación: línea base vigente y sin crecimiento silencioso
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const lineaBase = require(join(process.cwd(), "documentacao/banco/nexit/v1/herramientas/c1-linea-base.json")) as { noVerificables: string[]; motivos: Record<string, string> };
  const real = C1.analizar(C1.leerArchivos(process.cwd()), siempreOk);
  const v = C1.veredicto(real, lineaBase);

  igual("código real: ninguna consulta nueva sin verificar fuera de la línea base y ninguna entrada obsoleta (si cambia el SQL dinámico de la app, hay que revisar y actualizar la línea base con --actualizar-linea-base)", [v.nuevas.length, v.obsoletas.length, real.noVerificables.length === lineaBase.noVerificables.length], [0, 0, true]);
  cierto("código real: se reconstruyen más de 40 consultas dinámicas con interpolaciones resueltas de forma exacta y las no verificables restantes tienen motivo explícito", real.reconstruidas.ok > 40 && real.noVerificables.every((n) => n.motivo.length > 10) && real.total > 350);
  cierto("código real: todas las consultas con proyectar(…) y los dos «filtro» de aptitud-cliente.ts:78 y stock/shared.ts:33 están como NO VERIFICABLE en la línea base, con el motivo correspondiente, y ningún PREPARE recibe un «t.*» sintético", (() => {
    const preparadas: string[] = [];
    const inf = C1.analizar(C1.leerArchivos(process.cwd()), (sql) => { preparadas.push(sql); return { ok: true, err: "" }; });
    const motivo = (arch: string, texto: string) => inf.noVerificables.some((n) => n.id.startsWith(arch) && n.motivo.includes(texto));

    return inf.noVerificables.filter((n) => n.motivo.startsWith("proyección dinámica proyectar")).length === 8 && motivo("lib/clientes/aptitud-cliente.ts", "variable de ejecución: filtro") && motivo("lib/stock/shared.ts", "variable de ejecución: filtro")
      && !preparadas.some((q) => /SELECT t\.\* FROM (canales_venta|zonas_comerciales|categorias_producto|marcas_producto|familias_producto|lineas_producto)/.test(q));
  })());

  cierto("R02-D código real: las consultas de lib/reportes/ventas.ts pasadas a q(…) se verifican como anfitrionas COMPLETAS (WITH docs … fil …) y ningún PREPARE recibe su texto suelto dependiente de los CTE (fil, lista, g, prd, grt)", (() => {
    const preparadas: string[] = [];
    const inf = C1.analizar(C1.leerArchivos(process.cwd()), (sql) => { preparadas.push(sql.replace(/\s+/g, " ").trim()); return { ok: true, err: "" }; });
    const sueltas = preparadas.filter((q) => /^SELECT\b/.test(q) && /\bFROM (fil|lista|g|prd|grt)\b/.test(q));

    return inf.anfitrionas.total >= 11 && inf.anfitrionas.ok === inf.anfitrionas.total && sueltas.length === 0 && preparadas.some((q) => q.startsWith("WITH docs AS (") && q.includes(" grt AS (SELECT grp.*"))
      && !inf.noVerificables.some((n) => n.id.startsWith("lib/reportes/ventas.ts"));
  })());

  return fallos;
}
