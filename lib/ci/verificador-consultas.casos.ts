/**
 * Regresiones del verificador C1 (documentacao/banco/nexit/v1/herramientas/verificar-consultas-app.js). Sin PostgreSQL: PREPARE se simula con una función inyectada; lo que se
 * prueba es la CLASIFICACIÓN (literal, reconstruida, fragmento, no verificable), la resolución exacta de interpolaciones y la política de calidad. El PREPARE real lo ejecuta el CI
 * sobre PostgreSQL 16 descartable (paso C1).
 */
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";

type Informe = {
  total: number; literales: { ok: number; fallas: Array<{ err: string }> }; reconstruidas: { ok: number; variantes: number; fallas: Array<{ err: string; sql: string }> };
  fragmentos: { cubiertos: number }; reconstruidasPorArchivo: Record<string, number>; sugerencias: unknown[]; noVerificables: Array<{ id: string; motivo: string }>; corregidas: unknown[];
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

  return fallos;
}
