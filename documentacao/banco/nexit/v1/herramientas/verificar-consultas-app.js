#!/usr/bin/env node
"use strict";
/**
 * C1 — Verifica las consultas SQL del código de la aplicación (app/api/**.ts y lib/**.ts) contra el esquema REAL de una base de pruebas (PREPARE: analiza tablas, columnas y
 * tipos de parámetros, no ejecuta nada). Sustituye a la versión Python, que no entendía las plantillas JS con interpolaciones ${...} y daba falsos errores.
 *
 * Cada plantilla de texto se clasifica SIN ambigüedad (nunca se convierte una lagunas en PASS):
 *   LITERAL            sin interpolaciones → PREPARE directo.
 *   RECONSTRUIDA       con interpolaciones que el verificador sabe resolver de forma EXACTA (constantes del código, funciones auxiliares de plantilla como D()/SQL_VERSION(), nombres
 *                      de tabla de las configuraciones CFG, ternarios independientes, .replace("a","b")) → PREPARE de TODAS las combinaciones; cualquier error es FALLA.
 *   FRAGMENTO          constante SQL que otra consulta incrusta: se valida a través de las consultas anfitrionas reconstruidas (no se prepara suelta: sus parámetros $n son relativos).
 *   NO_VERIFICABLE     alguna interpolación depende de la ejecución (arreglos, variables calculadas, condicionales acoplados a tipo/tabla…). Se lista con su MOTIVO y solo se
 *                      admite si está en la línea base versionada (c1-linea-base.json); una consulta nueva sin verificar hace fallar el CI.
 * Código de salida != 0 si hay FALLAS o NO_VERIFICABLE fuera de la línea base.
 * Uso: node verificar-consultas-app.js <ruta-del-repo> [--solo-estatico] [--actualizar-linea-base]   (PGHOST/PGUSER/PGDATABASE… para PREPARE)
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");

const CORRECCIONES = {
  "THEN $32 ELSE NULL": ["THEN $32::uuid ELSE NULL", "F-01 clientes/route.ts: el parámetro $32 dentro de CASE se infiere como text y falla al asignarlo a una columna uuid (bloqueado_ventas_por)."],
};
const MAX_VARIANTES = 48;
const MAX_PROFUNDIDAD = 6;

// ── Lector de plantillas JS (con plantillas anidadas dentro de ${...}) ────────────────────────────────────────────────────────────────────────────────
function saltarCadena(src, i, q) {
  for (i += 1; i < src.length; i++) {
    if (src[i] === "\\") i++;
    else if (src[i] === q) return i + 1;
    else if (src[i] === "\n" && q !== "`") return i;
  }

  return i;
}

/** i apunta justo después de la comilla invertida de apertura. Devuelve las partes {t:"txt"|"expr", v} y el índice posterior al cierre. */
function leerPlantilla(src, i) {
  const partes = [];
  let txt = "";

  while (i < src.length) {
    const c = src[i];

    if (c === "\\") { txt += src[i + 1] === "`" ? "`" : src.slice(i, i + 2); i += 2; continue; }
    if (c === "`") { partes.push({ t: "txt", v: txt }); return { partes, fin: i + 1 }; }
    if (c === "$" && src[i + 1] === "{") {
      partes.push({ t: "txt", v: txt }); txt = "";
      const e = leerExpresion(src, i + 2);

      partes.push({ t: "expr", v: src.slice(i + 2, e - 1) });
      i = e;
      continue;
    }
    txt += c; i++;
  }

  return { partes, fin: i };
}

/** i justo después de «${»; devuelve el índice posterior a la «}» que cierra. */
function leerExpresion(src, i) {
  let prof = 1;

  while (i < src.length) {
    const c = src[i];

    if (c === '"' || c === "'") { i = saltarCadena(src, i, c); continue; }
    if (c === "`") { i = leerPlantilla(src, i + 1).fin; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { const f = src.indexOf("*/", i + 2); i = f < 0 ? src.length : f + 2; continue; }
    if (c === "{") prof++;
    else if (c === "}") { prof--; if (prof === 0) return i + 1; }
    i++;
  }

  return i;
}

const antesDeRegex = (previo) => /[(,=:[!&|?{};]$/.test(previo) || /return$/.test(previo) || previo === "";

/** Plantillas de primer nivel de un archivo: {ini, fin, partes, nombre, params, linea}. */
function escanear(src) {
  const out = [];
  let i = 0;
  let previo = "";

  while (i < src.length) {
    const c = src[i];

    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { const f = src.indexOf("*/", i + 2); i = f < 0 ? src.length : f + 2; continue; }
    if (c === '"' || c === "'") { i = saltarCadena(src, i, c); previo += "x"; continue; }
    if (c === "/" && antesDeRegex(previo)) {
      // literal de expresión regular: se salta entero (puede contener comillas o comillas invertidas)
      let j = i + 1; let clase = false;

      for (; j < src.length && src[j] !== "\n"; j++) {
        if (src[j] === "\\") j++;
        else if (src[j] === "[") clase = true;
        else if (src[j] === "]") clase = false;
        else if (src[j] === "/" && !clase) break;
      }
      i = j + 1; previo += "x";
      continue;
    }
    if (c === "`") {
      const r = leerPlantilla(src, i + 1);
      const prefijo = src.slice(Math.max(0, i - 240), i);
      const m = /(?:const|let|var)\s+([A-Za-z_]\w*)\s*(?::[^=;]+)?=\s*(?:\(([^)]*)\)\s*(?::\s*[^=]+?)?\s*=>\s*)?$/.exec(prefijo);

      out.push({
        ini: i, fin: r.fin, partes: r.partes, nombre: m ? m[1] : null, params: m && m[2] !== undefined ? m[2].split(",").map((p) => p.trim().split(/[:=\s]/)[0]).filter(Boolean) : null,
        linea: src.slice(0, i).split("\n").length,
      });
      i = r.fin; previo += "x";
      continue;
    }
    if (!/\s/.test(c)) previo += c;
    if (previo.length > 64) previo = previo.slice(-32);
    i++;
  }

  return out;
}

const bruto = (partes) => partes.map((p) => (p.t === "txt" ? p.v : "${" + p.v + "}")).join("");
const normal = (t) => t.replace(/\s+/g, " ").trim();
const esSql = (partes) => { const r = bruto(partes); return /^\s*(WITH|SELECT|INSERT|UPDATE|DELETE)\b/i.test(r) && /\b(FROM|INTO|UPDATE|SET)\b/i.test(r); };
const idDe = (archivo, partes) => `${archivo.replace(/\\/g, "/")}:${crypto.createHash("sha1").update(normal(bruto(partes))).digest("hex").slice(0, 12)}`;

// ── Resolución EXACTA de interpolaciones ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Índice de la primera aparición de `ch` a nivel superior (fuera de (), [], {}, cadenas y plantillas), a partir de `desde`. */
function nivelSuperior(e, ch, desde = 0, evitar = null) {
  let p = 0;

  for (let i = desde; i < e.length; i++) {
    const c = e[i];

    if (c === '"' || c === "'") { i = saltarCadena(e, i, c) - 1; continue; }
    if (c === "`") { i = leerPlantilla(e, i + 1).fin - 1; continue; }
    if ("([{".includes(c)) p++;
    else if (")]}".includes(c)) p--;
    else if (p === 0 && c === ch && !(evitar && evitar(e, i))) return i;
  }

  return -1;
}

function dividirArgumentos(t) {
  const out = [];
  let ini = 0;

  for (;;) {
    const k = nivelSuperior(t, ",", ini);

    if (k < 0) { out.push(t.slice(ini).trim()); break; }
    out.push(t.slice(ini, k).trim()); ini = k + 1;
  }

  return out.filter((x) => x !== "");
}

const cadenaSimple = (e) => { const m = /^("((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')$/.exec(e.trim()); return m ? (m[2] ?? m[3]).replace(/\\(.)/g, "$1") : null; };
const sinInterpolar = (e) => { const t = e.trim(); if (t[0] !== "`") return null; const r = leerPlantilla(t, 1); return r.fin === t.length && r.partes.every((p) => p.t === "txt") ? r.partes[0].v : null; };

function producto(listas) {
  let acc = [[]];

  for (const l of listas) { const n = []; for (const a of acc) for (const x of l) n.push([...a, x]); acc = n; if (acc.length > MAX_VARIANTES) return null; }

  return acc;
}

/** Contexto de resolución de un archivo: constantes locales y globales, funciones auxiliares de plantilla, tablas de sus CFG. */
function construirIndice(archivos) {
  const global = new Map();   // nombre -> [{archivo, plantilla}]
  const globalFuncs = new Map();   // nombre -> [plantilla de función auxiliar] (importadas entre archivos)
  const porArchivo = new Map();

  for (const a of archivos) {
    const consts = new Map(); const funcs = new Map();

    const vistos = new Set();

    for (const pl of a.plantillas) {
      if (!pl.nombre) continue;
      // Un mismo nombre declarado dos veces en el archivo (variables de distintas funciones) NO se resuelve: sería adivinar cuál aplica.
      if (vistos.has(pl.nombre)) { consts.set(pl.nombre, { ambiguo: true }); funcs.delete(pl.nombre); continue; }
      vistos.add(pl.nombre);
      if (pl.params) { funcs.set(pl.nombre, pl); const gl = globalFuncs.get(pl.nombre) ?? []; gl.push(pl); globalFuncs.set(pl.nombre, gl); } else consts.set(pl.nombre, pl);
      if (!pl.params) { const l = global.get(pl.nombre) ?? []; l.push({ archivo: a.archivo, plantilla: pl }); global.set(pl.nombre, l); }
    }
    for (const m of a.src.matchAll(/(?:const)\s+([A-Za-z_]\w*)\s*(?::[^=;]+)?=\s*("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')\s*;/g)) {
      const v = cadenaSimple(m[2]);

      consts.set(m[1], { cadena: v });
      const l = global.get(m[1]) ?? []; l.push({ archivo: a.archivo, plantilla: { cadena: v } }); global.set(m[1], l);
    }
    const tablas = [...new Set([...a.src.matchAll(/\btabla:\s*"([a-z_0-9]+)"/g)].map((m) => m[1]))];

    porArchivo.set(a.archivo, { consts, funcs, tablas });
  }

  return { global, globalFuncs, porArchivo };
}

/** Devuelve {v:[...variantes], tags:Set} o {no: motivo}. */
function resolverExpr(e, ctx, prof = 0) {
  e = e.trim();
  if (prof > MAX_PROFUNDIDAD) return { no: `profundidad excesiva: ${e}` };

  const t = new Set();
  const lit = cadenaSimple(e) ?? sinInterpolar(e);

  if (lit !== null) return { v: [lit], tags: t };

  // plantilla completa con sus propias interpolaciones (p. ej. la rama de un ternario)
  if (e[0] === "`") {
    const pl = leerPlantilla(e, 1);

    if (pl.fin === e.length) return resolverPartes(pl.partes, ctx, prof + 1);
  }
  // sufijo .replace("a","b")
  const rep = /^([\s\S]+)\.replace\(\s*("(?:[^"\\]|\\.)*")\s*,\s*("(?:[^"\\]|\\.)*")\s*\)$/.exec(e);

  if (rep) {
    const base = resolverExpr(rep[1], ctx, prof + 1);

    if (base.no) return base;

    const a = cadenaSimple(rep[2]); const b = cadenaSimple(rep[3]);

    return { v: base.v.map((x) => x.split(a).join(b)), tags: base.tags };
  }
  // ternario cond ? A : B
  const q = nivelSuperior(e, "?", 0, (s, i) => s[i + 1] === "." || s[i + 1] === "?" || s[i - 1] === "?");

  if (q > 0) {
    const d = nivelSuperior(e, ":", q + 1);
    const cond = e.slice(0, q);

    if (d < 0) return { no: `condicional no interpretable: ${e}` };
    if (/\b(tipo|tabla)\b/.test(cond)) return { no: `condicional acoplado a tipo/tabla (${cond.trim()})` };

    const A = resolverExpr(e.slice(q + 1, d), ctx, prof + 1); const B = resolverExpr(e.slice(d + 1), ctx, prof + 1);

    if (A.no) return A;
    if (B.no) return B;

    return { v: [...A.v, ...B.v], tags: new Set([...A.tags, ...B.tags, "ternario"]) };
  }
  if (/^(?:CFG\[[^\]]*\]\.tabla|[A-Za-z_]\w*\.tabla|tabla|t)$/.test(e)) {
    if (!ctx.tablas.length) return { no: `tabla interpolada sin configuración CFG en el archivo: ${e}` };

    return { v: ctx.tablas, tags: new Set(["tabla"]) };
  }
  const llamada = /^([A-Za-z_]\w*)\(([\s\S]*)\)$/.exec(e);

  if (llamada) {
    const nombre = llamada[1];

    if (nombre === "proyectar") return { v: ["t.*"], tags: new Set(["proyeccion"]) };

    const f = ctx.funcs.get(nombre) ?? (() => { const l = ctx.globalFuncs.get(nombre); return l && l.length === 1 ? l[0] : null; })();

    if (!f) return { no: `función auxiliar no resoluble: ${nombre}(…)` };

    const args = dividirArgumentos(llamada[2]).map((x) => cadenaSimple(x) ?? sinInterpolar(x));

    if (args.some((x) => x === null)) return { no: `argumentos no literales en ${nombre}(…)` };

    const partes = f.partes.map((p) => (p.t === "expr" && f.params.includes(p.v.trim()) ? { t: "txt", v: args[f.params.indexOf(p.v.trim())] ?? "" } : p));

    return resolverPartes(partes, ctx, prof + 1);
  }
  if (/^[A-Za-z_]\w*$/.test(e)) {
    const def = ctx.consts.get(e) ?? (() => { const l = ctx.global.get(e); return l && l.length === 1 ? l[0].plantilla : null; })();

    if (!def) return { no: `variable de ejecución: ${e}` };
    if (def.ambiguo) return { no: `variable declarada más de una vez en el archivo: ${e}` };
    if (def.cadena !== undefined) return { v: [def.cadena], tags: t };

    return resolverPartes(def.partes, ctx, prof + 1);
  }

  return { no: `expresión de ejecución: ${e.replace(/\s+/g, " ").slice(0, 80)}` };
}

function resolverPartes(partes, ctx, prof = 0) {
  const listas = []; const tags = new Set();

  for (const p of partes) {
    if (p.t === "txt") { listas.push([p.v]); continue; }

    const r = resolverExpr(p.v, ctx, prof);

    if (r.no) return r;
    r.tags.forEach((x) => tags.add(x));
    listas.push(r.v);
  }
  if (tags.has("tabla") && tags.has("ternario")) return { no: "combinación tabla × condicional sin acoplamiento conocido" };

  const prod = producto(listas);

  if (!prod) return { no: `más de ${MAX_VARIANTES} combinaciones` };

  return { v: prod.map((x) => x.join("")), tags };
}

// ── Análisis completo ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function leerArchivos(raiz) {
  const out = [];
  const caminar = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) caminar(p); else if (p.endsWith(".ts")) out.push(p); } };

  for (const d of ["app/api", "lib"]) if (fs.existsSync(path.join(raiz, d))) caminar(path.join(raiz, d));

  return out.sort().map((f) => { const src = fs.readFileSync(f, "utf8"); return { archivo: path.relative(raiz, f).replace(/\\/g, "/"), src, plantillas: escanear(src) }; });
}

/**
 * @param preparar (sql) => {ok:boolean, err:string}  inyectable (psql real en CI, simulado en las pruebas)
 */
function analizar(archivos, preparar) {
  const indice = construirIndice(archivos);
  const informe = { literales: { ok: 0, fallas: [] }, reconstruidas: { ok: 0, variantes: 0, fallas: [] }, reconstruidasPorArchivo: {}, fragmentos: { cubiertos: 0, sinAnfitrion: [] }, corregidas: [], noVerificables: [], total: 0 };
  const usadas = new Set();

  for (const a of archivos) for (const pl of a.plantillas) for (const p of pl.partes) if (p.t === "expr") for (const m of p.v.matchAll(/\b([A-Za-z_]\w*)\b/g)) usadas.add(m[1]);

  const anfitrionOk = new Set();
  const pendientes = [];

  for (const a of archivos) {
    const loc = indice.porArchivo.get(a.archivo);
    const ctx = { consts: loc.consts, funcs: loc.funcs, tablas: loc.tablas, global: indice.global, globalFuncs: indice.globalFuncs };

    for (const pl of a.plantillas) {
      const crudo = esSql(pl.partes);
      const dinamica = pl.partes.some((p) => p.t === "expr");
      const texto = bruto(pl.partes);
      // Una consulta que EMPIEZA con una interpolación (`${SELECT} WHERE …`) no parece SQL a simple vista: se la considera candidata por sus parámetros y cláusulas.
      const candidata = crudo || (dinamica && /\$\d+\b/.test(texto) && /\b(WHERE|JOIN|VALUES|RETURNING|ORDER BY|GROUP BY|LIMIT)\b/i.test(texto));

      if (!candidata) continue;

      const id = idDe(a.archivo, pl.partes);
      const ref = { id, archivo: a.archivo, linea: pl.linea };

      if (pl.nombre && !pl.params && usadas.has(pl.nombre) && !dinamica) { informe.total++; pendientes.push({ ...ref, nombre: pl.nombre }); continue; }
      if (pl.params) continue;   // función auxiliar que devuelve texto SQL: se valida por quienes la usan

      const r = dinamica ? resolverPartes(pl.partes, ctx) : { v: [texto], tags: new Set() };

      // Resuelta pero el resultado no es SQL (p. ej. una lista de columnas o un filtro suelto): no es una consulta; no se cuenta.
      if (!crudo && !r.no && !r.v.some((x) => esSql([{ t: "txt", v: x }]))) continue;
      informe.total++;
      if (r.no) { informe.noVerificables.push({ ...ref, motivo: r.no }); continue; }
      for (const sql of r.v) {
        const res = preparar(sql);
        const alvo = dinamica ? informe.reconstruidas : informe.literales;

        if (dinamica) informe.reconstruidas.variantes++;
        if (res.ok) { if (!dinamica) alvo.ok++; continue; }

        let corregida = false;

        for (const [ant, [nuevo, desc]] of Object.entries(CORRECCIONES)) {
          if (sql.includes(ant) && preparar(sql.replace(ant, nuevo)).ok) { informe.corregidas.push({ ...ref, desc }); corregida = true; break; }
        }
        if (!corregida) alvo.fallas.push({ ...ref, err: res.err, sql: normal(sql).slice(0, 160) });
      }
      if (dinamica && !informe.reconstruidas.fallas.some((f) => f.id === id)) {
        informe.reconstruidas.ok++;
        informe.reconstruidasPorArchivo[a.archivo] = (informe.reconstruidasPorArchivo[a.archivo] ?? 0) + 1;
        for (const p of pl.partes) if (p.t === "expr") for (const m of p.v.matchAll(/\b([A-Za-z_]\w*)\b/g)) anfitrionOk.add("nombre:" + m[1]);
      }
    }
  }
  // un fragmento (constante SQL incrustada por otras consultas) queda cubierto solo si una anfitriona reconstruida y válida lo usa
  for (const f of pendientes) {
    if (anfitrionOk.has("nombre:" + f.nombre)) informe.fragmentos.cubiertos++;
    else { informe.fragmentos.sinAnfitrion.push(f); informe.noVerificables.push({ ...f, motivo: `fragmento ${f.nombre} sin consulta anfitriona verificada` }); }
  }

  return informe;
}

function veredicto(informe, lineaBase) {
  const permitidos = new Set(lineaBase.noVerificables ?? []);
  const nuevas = informe.noVerificables.filter((x) => !permitidos.has(x.id));
  const actuales = new Set(informe.noVerificables.map((x) => x.id));
  const obsoletas = [...permitidos].filter((x) => !actuales.has(x));
  const fallas = informe.literales.fallas.length + informe.reconstruidas.fallas.length;

  return { fallas, nuevas, obsoletas, ok: fallas === 0 && nuevas.length === 0 };
}

function psqlPreparar(sql) {
  const r = cp.spawnSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", "PREPARE h AS " + sql.trim().replace(/;\s*$/, "") + ";"], { encoding: "utf8" });

  return { ok: r.status === 0, err: (r.stderr || "").trim().split("\n")[0] };
}

function main(argv) {
  const raiz = argv.find((a) => !a.startsWith("--"));

  if (!raiz) { console.error("uso: verificar-consultas-app.js <ruta-del-repo> [--solo-estatico] [--actualizar-linea-base]"); return 2; }

  const estatico = argv.includes("--solo-estatico");
  const archivos = leerArchivos(raiz);
  const informe = analizar(archivos, estatico ? () => ({ ok: true, err: "" }) : psqlPreparar);
  const ruta = path.join(__dirname, "c1-linea-base.json");

  if (argv.includes("--actualizar-linea-base")) {
    fs.writeFileSync(ruta, JSON.stringify({ descripcion: "Consultas dinámicas que el verificador C1 NO puede validar (con su motivo). Una consulta nueva sin verificar hace fallar el CI; esta lista solo se actualiza con revisión.", noVerificables: informe.noVerificables.map((x) => x.id).sort(), motivos: Object.fromEntries(informe.noVerificables.map((x) => [x.id, x.motivo])) }, null, 1) + "\n");
    console.log(`línea base escrita: ${informe.noVerificables.length} NO_VERIFICABLE`);

    return 0;
  }

  const base = fs.existsSync(ruta) ? JSON.parse(fs.readFileSync(ruta, "utf8")) : { noVerificables: [] };
  const v = veredicto(informe, base);

  console.log(`consultas SQL analizadas: ${informe.total}`);
  console.log(`  LITERALES verificadas: ${informe.literales.ok}   fallas: ${informe.literales.fallas.length}`);
  console.log(`  RECONSTRUIDAS (interpolaciones resueltas de forma exacta): ${informe.reconstruidas.ok} consultas / ${informe.reconstruidas.variantes} combinaciones PREPARE   fallas: ${informe.reconstruidas.fallas.length}`);
  console.log(`  FRAGMENTOS cubiertos por consultas anfitrionas: ${informe.fragmentos.cubiertos}`);
  console.log(`  NO VERIFICABLES: ${informe.noVerificables.length} (línea base: ${(base.noVerificables ?? []).length}; nuevas fuera de la línea base: ${v.nuevas.length}; obsoletas: ${v.obsoletas.length})${estatico ? "   [modo estático: sin PREPARE]" : ""}`);
  for (const c of informe.corregidas) console.log(`  CORRECCION REQUERIDA EN EL CÓDIGO  ${c.archivo}:${c.linea}  ${c.desc}`);
  for (const f of [...informe.literales.fallas, ...informe.reconstruidas.fallas]) console.log(`  FALLA ${f.archivo}:${f.linea}  ${f.err}  [${f.sql}]`);
  for (const n of v.nuevas) console.log(`  NO VERIFICABLE NUEVA (no está en la línea base) ${n.archivo}:${n.linea}  ${n.motivo}`);
  for (const o of v.obsoletas) console.log(`  aviso: la línea base contiene una entrada que ya no existe: ${o}`);

  return v.ok ? 0 : 1;
}

module.exports = { escanear, leerPlantilla, resolverExpr, resolverPartes, analizar, veredicto, construirIndice, leerArchivos, nivelSuperior, bruto, esSql, idDe };

if (require.main === module) process.exit(main(process.argv.slice(2)));
