#!/usr/bin/env node
"use strict";
/**
 * C1 — Verifica las consultas SQL del código de la aplicación (app/api/**.ts y lib/**.ts) contra el esquema REAL de una base de pruebas (PREPARE: analiza tablas, columnas y
 * tipos de parámetros, no ejecuta nada). Sustituye a la versión Python, que no entendía las plantillas JS con interpolaciones ${...} y daba falsos errores.
 *
 * Cada plantilla de texto se clasifica SIN ambigüedad (nunca se convierte una lagunas en PASS):
 *   LITERAL            sin interpolaciones → PREPARE directo.
 *   RECONSTRUIDA       con interpolaciones que el verificador sabe resolver de forma EXACTA (constantes del código, funciones auxiliares de plantilla como D()/SQL_VERSION(), nombres
 *                      de tabla de las configuraciones CFG, ternarios independientes, .replace("a","b"), .split("a").join(b), constantes enteras y sumas, fragmentos condicionales entre
 *                      dos literales sin $n, funciones flecha de una expresión) → PREPARE de TODAS las combinaciones; cualquier error es FALLA.
 *   ANFITRIONA         plantilla pasada a una envoltura de consulta (p. ej. q(sql, cteExtra, extra) → `WITH ${cte}, ${cteExtra} ${sql}`): se arma y prepara la consulta COMPLETA que se
 *                      ejecuta (CTE común + CTE de la vista + numeración de parámetros) con el intérprete acotado; el texto suelto que depende de un CTE nunca se prepara solo.
 *   INTERPRETADA       unión de un arreglo LOCAL armado con push (cond.join(" AND ")): se reconstruye recorriendo la función en todos sus caminos (intérprete acotado).
 *   FRAGMENTO          constante SQL que otra consulta incrusta (o cuerpo de un CTE usado al armar anfitrionas): se valida a través de las consultas anfitrionas reconstruidas (no se prepara
 *                      suelta: sus parámetros $n son relativos o depende de otros CTE). Si una anfitriona que lo usa no es verificable, queda NO_VERIFICABLE; si tiene FALLA, se informa la FALLA.
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

/** Ruta (relativa a la raíz del repo) del módulo que importa `spec` desde `desde`, si está entre los archivos analizados. */
function resolverModulo(desde, spec, existentes) {
  const base = spec.startsWith("@/") ? spec.slice(2) : spec.startsWith(".") ? path.posix.join(path.posix.dirname(desde), spec) : null;

  if (base === null) return null;

  for (const c of [base + ".ts", base + "/index.ts"]) if (existentes.has(c)) return c;

  return null;
}

/**
 * Contexto de resolución POR ARCHIVO. Una constante o función solo se resuelve si está declarada una única vez en ESE archivo o si el archivo la IMPORTA de forma rastreada
 * (import { X } from "…"); jamás se toma un homónimo de otro archivo (los nombres como `filtro` se repiten por todo el código con significados distintos).
 */
function construirIndice(archivos) {
  const existentes = new Set(archivos.map((a) => a.archivo));
  const porArchivo = new Map();

  for (const a of archivos) {
    const consts = new Map(); const funcs = new Map();
    const declaraciones = (n) => (a.src.match(new RegExp("\\b(?:const|let|var)\\s+" + n + "\\b", "g")) ?? []).length;

    for (const pl of a.plantillas) {
      if (!pl.nombre) continue;
      if (declaraciones(pl.nombre) > 1) { consts.set(pl.nombre, { ambiguo: true }); funcs.delete(pl.nombre); continue; }
      if (pl.params) funcs.set(pl.nombre, pl); else consts.set(pl.nombre, pl);
    }
    for (const m of a.src.matchAll(/(?:const)\s+([A-Za-z_]\w*)\s*(?::[^=;]+)?=\s*("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')\s*;/g)) {
      consts.set(m[1], declaraciones(m[1]) > 1 ? { ambiguo: true } : { cadena: cadenaSimple(m[2]) });
    }
    const importados = new Map();

    for (const m of a.src.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
      const destino = resolverModulo(a.archivo, m[2], existentes);

      if (!destino) continue;
      for (const parte of m[1].split(",")) {
        const p = parte.trim().replace(/^type\s+/, "");

        if (!p) continue;

        const [orig, alias] = p.split(/\s+as\s+/);

        importados.set((alias ?? orig).trim(), { archivo: destino, nombre: orig.trim() });
      }
    }
    // Constantes numéricas (const LIMITE = 100;): su valor es fijo en el código.
    for (const m of a.src.matchAll(/(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_]\w*)\s*(?::\s*number\s*)?=\s*(\d+)\s*;/g)) {
      consts.set(m[1], declaraciones(m[1]) > 1 ? { ambiguo: true } : { cadena: m[2], numero: true });
    }
    // Fragmento condicional entre DOS literales SIN parámetros posicionales (const x = cond ? " … " : "";): ambas ramas son SQL fijo e independiente de la lista de parámetros,
    // así que se verifican las dos variantes. Con «$n» la rama depende de cuántos parámetros se agregaron: no se resuelve así (intérprete o NO_VERIFICABLE).
    for (const m of a.src.matchAll(/(?:const|let)\s+([A-Za-z_]\w*)\s*(?::[^=;]+)?=\s*([^;?\n]+?)\?\s*("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`[^`$]*`)\s*:\s*("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`[^`$]*`)\s*;/g)) {
      const ramas = [m[3], m[4]].map((x) => cadenaSimple(x) ?? sinInterpolar(x));

      if (ramas.some((x) => x === null || /\$\d/.test(x)) || /\b(tipo|tabla)\b/.test(m[2])) continue;
      consts.set(m[1], declaraciones(m[1]) > 1 ? { ambiguo: true } : { cadenas: ramas });
    }
    // Funciones flecha de UNA expresión que no es plantilla (const f = (n: number) => OTRA.split("$2").join(`$${n}`);).
    const flechas = new Map();

    for (const m of a.src.matchAll(/(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_]\w*)\s*=\s*\(([^)]*)\)\s*(?::\s*[\w<>[\]| ]+)?\s*=>\s*([^`;\n{][^;\n]*);/g)) {
      if (declaraciones(m[1]) > 1) continue;
      flechas.set(m[1], { params: m[2].split(",").map((p) => p.trim().split(/[:=\s?]/)[0]).filter(Boolean), expr: m[3].trim() });
    }
    const tablas = [...new Set([...a.src.matchAll(/\btabla:\s*"([a-z_0-9]+)"/g)].map((m) => m[1]))];

    porArchivo.set(a.archivo, { archivo: a.archivo, consts, funcs, flechas, tablas, importados });
  }
  for (const ctx of porArchivo.values()) ctx.todos = porArchivo;

  return { porArchivo };
}

/** Devuelve {v:[...variantes], tags:Set} o {no: motivo}. */
function resolverExpr(e, ctx, prof = 0) {
  e = e.trim();
  if (prof > MAX_PROFUNDIDAD) return { no: `profundidad excesiva: ${e}` };

  const t = new Set();
  const lit = cadenaSimple(e) ?? sinInterpolar(e);

  if (lit !== null) return { v: [lit], tags: t };
  if (/^\d+$/.test(e)) return { v: [e], tags: t };
  if (ctx.locales && ctx.locales.has(e)) return { v: [ctx.locales.get(e)], tags: t };

  // plantilla completa con sus propias interpolaciones (p. ej. la rama de un ternario)
  if (e[0] === "`") {
    const pl = leerPlantilla(e, 1);

    if (pl.fin === e.length) return resolverPartes(pl.partes, ctx, prof + 1);
  }
  // suma ENTERA de nivel superior (LIMIT ${POR_PAGINA + 1}): solo si todos los términos se resuelven a un entero fijo
  if (nivelSuperior(e, "+") > 0) {
    const terminos = [];
    let ini = 0;

    for (;;) { const k = nivelSuperior(e, "+", ini); if (k < 0) { terminos.push(e.slice(ini)); break; } terminos.push(e.slice(ini, k)); ini = k + 1; }
    const rs = terminos.map((x) => resolverExpr(x, ctx, prof + 1));

    if (rs.every((r) => !r.no && r.v.length === 1 && /^\d+$/.test(r.v[0]))) return { v: [String(rs.reduce((acc, r) => acc + Number(r.v[0]), 0))], tags: t };
  }
  // sufijo .split("a").join(b): reemplazo literal de un marcador por otro texto resuelto
  const sj = /^([\s\S]+)\.split\(\s*("(?:[^"\\]|\\.)*")\s*\)\.join\(([\s\S]+)\)$/.exec(e);

  if (sj) {
    const base = resolverExpr(sj[1], ctx, prof + 1);
    const por = resolverExpr(sj[3], ctx, prof + 1);

    if (!base.no && !por.no) {
      const marca = cadenaSimple(sj[2]);
      const v = [];

      for (const x of base.v) for (const y of por.v) v.push(x.split(marca).join(y));

      return { v, tags: new Set([...base.tags, ...por.tags]) };
    }
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

    // La proyección de columnas se construye según el tipo con lógica propia (subconsultas, jerarquías): sustituirla por t.* aprobaría una consulta DISTINTA de la ejecutada.
    if (nombre === "proyectar") return { no: "proyección dinámica proyectar(…): construye las columnas según el tipo; no se sustituye por t.* (sería otra consulta)" };

    const f = buscarFuncion(nombre, ctx);

    if (f.no) {
      const fl = buscarFlecha(nombre, ctx);

      if (!fl) return { no: f.no };
      const args = dividirArgumentos(llamada[2]).map((x) => (/^\d+$/.test(x) ? x : cadenaSimple(x) ?? sinInterpolar(x)));

      if (args.some((x) => x === null) || args.length !== fl.def.params.length) return { no: `argumentos no literales en ${nombre}(…)` };

      return resolverExpr(fl.def.expr, { ...fl.ctx, locales: new Map(fl.def.params.map((p, i) => [p, args[i]])) }, prof + 1);
    }

    const args = dividirArgumentos(llamada[2]).map((x) => cadenaSimple(x) ?? sinInterpolar(x));

    if (args.some((x) => x === null)) return { no: `argumentos no literales en ${nombre}(…)` };

    const partes = f.def.partes.map((p) => (p.t === "expr" && f.def.params.includes(p.v.trim()) ? { t: "txt", v: args[f.def.params.indexOf(p.v.trim())] ?? "" } : p));

    return resolverPartes(partes, f.ctx, prof + 1);
  }
  if (/^[A-Za-z_]\w*$/.test(e)) {
    let def = ctx.consts.get(e);
    let dctx = ctx;

    if (!def && ctx.importados.has(e)) {
      const im = ctx.importados.get(e);

      dctx = ctx.todos.get(im.archivo);
      def = dctx ? dctx.consts.get(im.nombre) : undefined;
    }
    if (!def) return { no: `variable de ejecución: ${e}` };
    if (def.ambiguo) return { no: `variable declarada más de una vez en el archivo: ${e}` };
    if (def.cadena !== undefined) return { v: [def.cadena], tags: t };
    if (def.cadenas !== undefined) return { v: def.cadenas, tags: new Set(["ternario"]) };

    return resolverPartes(def.partes, dctx, prof + 1);
  }

  return { no: `expresión de ejecución: ${e.replace(/\s+/g, " ").slice(0, 80)}` };
}

/** Función auxiliar de plantilla: local al archivo o importada de forma rastreada. Devuelve {def, ctx} o {no}. */
function buscarFuncion(nombre, ctx) {
  const local = ctx.funcs.get(nombre);

  if (local) return { def: local, ctx };
  if (ctx.consts.get(nombre)?.ambiguo) return { no: `función declarada más de una vez en el archivo: ${nombre}` };
  if (ctx.importados.has(nombre)) {
    const im = ctx.importados.get(nombre);
    const dctx = ctx.todos.get(im.archivo);
    const def = dctx ? dctx.funcs.get(im.nombre) : undefined;

    if (def) return { def, ctx: dctx };
  }

  return { no: `función auxiliar no resoluble: ${nombre}(…)` };
}

/** Función flecha de una expresión: local o importada de forma rastreada. */
function buscarFlecha(nombre, ctx) {
  if (ctx.flechas.has(nombre)) return { def: ctx.flechas.get(nombre), ctx };
  if (ctx.importados.has(nombre)) {
    const im = ctx.importados.get(nombre);
    const dctx = ctx.todos.get(im.archivo);

    if (dctx && dctx.flechas.has(im.nombre)) return { def: dctx.flechas.get(im.nombre), ctx: dctx };
  }

  return null;
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

// ── Intérprete acotado de funciones (PRE-VM-R02-D) ──────────────────────────────────────────────────────────────────────────────────────────────────
/*
 * Reconstruye el SQL que una función arma en tiempo de ejecución SIN ejecutar el código de la aplicación: interpreta un subconjunto de TypeScript (declaraciones,
 * asignaciones, if/else, push a arreglos, plantillas, ternarios, funciones auxiliares y clausuras como p()/pe()) sobre valores simbólicos. Todo dato de ejecución
 * (filtros, esquema, filas leídas…) es OPACO: nunca se inventa su valor; solo sus CONDICIONES se recorren (mundos). Si un valor opaco llega al texto SQL, o el
 * código usa una forma no soportada, la consulta queda NO_VERIFICABLE con su motivo (nunca PASS).
 *   Mundos: cada condición sobre un dato opaco (p. ej. «filtros.estado», «esq.vendedor», «filtros.vista === "DOCUMENTOS"») es una variable con un dominio
 *   {FALSO, VERDADERO, literales comparados}. Se busca un mundo que ALCANCE la consulta y, a partir de él, se varía cada condición por separado y se arma un mundo
 *   de activación máxima: cada fragmento condicional, cada rama de esquema y la numeración de parámetros con todos los filtros activos llegan a PREPARE.
 */
const FALSO = Symbol("falso");
const VERDADERO = Symbol("verdadero");
const MAX_CORRIDAS = 600;

class NoSoportado extends Error {}
class Aborto extends Error {}
class Retorno { constructor(v) { this.v = v; } }

const opaco = (texto, ruta = null, motivo = null) => ({ opaco: true, texto: normal(texto).slice(0, 120), ruta, motivo });
const esOpaco = (v) => v !== null && typeof v === "object" && v.opaco === true;

/** Cierre de la plantilla/expresión que empieza en src[i] (comilla invertida) con posiciones absolutas de sus partes. */
function plantillaConPosiciones(src, i) {
  const partes = [];
  let txt = "";
  let j = i + 1;

  while (j < src.length) {
    const c = src[j];

    if (c === "\\") { txt += src[j + 1] === "`" ? "`" : src.slice(j, j + 2); j += 2; continue; }
    if (c === "`") { partes.push({ t: "txt", v: txt }); return { partes, fin: j + 1 }; }
    if (c === "$" && src[j + 1] === "{") {
      partes.push({ t: "txt", v: txt }); txt = "";
      const e = leerExpresion(src, j + 2);

      partes.push({ t: "expr", ini: j + 2, fin: e - 1 });
      j = e;
      continue;
    }
    txt += c; j++;
  }

  throw new NoSoportado("plantilla sin cerrar");
}

/** ¿El «/» en src[k] abre una expresión regular? (según el último carácter significativo anterior). */
function esInicioRegex(src, k) {
  let j = k - 1;

  while (j >= 0 && /\s/.test(src[j])) j--;
  if (j < 0) return true;
  if ("(,=:[!&|?{};+-*%<>~^".includes(src[j])) return !(src[j] === "*" && src[j - 1] === "/");

  return /\b(return|typeof|case|in|of)$/.test(src.slice(Math.max(0, j - 7), j + 1));
}

/** Posición posterior a la expresión regular que empieza en src[k]. */
function finRegex(src, k) {
  let j = k + 1;
  let clase = false;

  for (; j < src.length && src[j] !== "\n"; j++) {
    if (src[j] === "\\") j++;
    else if (src[j] === "[") clase = true;
    else if (src[j] === "]") clase = false;
    else if (src[j] === "/" && !clase) break;
  }
  j++;
  while (j < src.length && /[a-z]/.test(src[j])) j++;

  return j;
}

/** Posición posterior al cierre del grupo que abre en src[i] ((, [ o {), saltando cadenas, plantillas, comentarios y regex. */
function cerrarGrupo(src, i) {
  const pila = [];

  for (let k = i; k < src.length; k++) {
    const c = src[k];

    if (c === '"' || c === "'") { k = saltarCadena(src, k, c) - 1; continue; }
    if (c === "`") { k = leerPlantilla(src, k + 1).fin - 1; continue; }
    if (c === "/" && src[k + 1] === "/") { while (k < src.length && src[k] !== "\n") k++; continue; }
    if (c === "/" && src[k + 1] === "*") { const f = src.indexOf("*/", k + 2); k = f < 0 ? src.length : f + 1; continue; }
    if (c === "/" && esInicioRegex(src, k)) { k = finRegex(src, k) - 1; continue; }
    if ("([{".includes(c)) pila.push(c);
    else if (")]}".includes(c)) { pila.pop(); if (pila.length === 0) return k + 1; }
  }

  throw new NoSoportado("grupo sin cerrar");
}

// ── Léxico ──
const PUNTUACION = ["...", "===", "!==", "=>", "&&", "||", "??", "?.", "==", "!=", "<=", ">=", "+=", "(", ")", "[", "]", "{", "}", ",", ":", "?", ".", "+", "-", "*", "/", "%", "<", ">", "!", "=", ";", "|", "&"];

function tokenizar(src, ini, fin) {
  const toks = [];
  let i = ini;
  const previoRegex = () => { const p = toks[toks.length - 1]; return !p || (p.t === "p" && /^[(,=:[!&|?{};+\-*%<>]$|^(=>|&&|\|\||\?\?|===|!==)$/.test(p.v)) || (p.t === "id" && /^(return|typeof|await)$/.test(p.v)); };

  while (i < fin) {
    const c = src[i];

    if (/\s/.test(c)) { i++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < fin && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { const f = src.indexOf("*/", i + 2); i = f < 0 ? fin : f + 2; continue; }
    if (c === '"' || c === "'") { const f = saltarCadena(src, i, c); toks.push({ t: "str", v: cadenaSimple(src.slice(i, f)) ?? "", s: src.slice(i, f), ini: i, fin: f }); i = f; continue; }
    if (c === "`") { const r = plantillaConPosiciones(src, i); toks.push({ t: "tpl", partes: r.partes, src, s: src.slice(i, r.fin), ini: i, fin: r.fin }); i = r.fin; continue; }
    if (/[0-9]/.test(c)) { const m = /^[0-9][0-9_]*(\.[0-9]+)?/.exec(src.slice(i, fin)); toks.push({ t: "num", v: Number(m[0].replace(/_/g, "")), s: m[0], ini: i, fin: i + m[0].length }); i += m[0].length; continue; }
    if (/[A-Za-z_$]/.test(c)) { const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, fin)); toks.push({ t: "id", v: m[0], s: m[0], ini: i, fin: i + m[0].length }); i += m[0].length; continue; }
    if (c === "/" && previoRegex()) {
      let j = i + 1; let clase = false;

      for (; j < fin && src[j] !== "\n"; j++) {
        if (src[j] === "\\") j++;
        else if (src[j] === "[") clase = true;
        else if (src[j] === "]") clase = false;
        else if (src[j] === "/" && !clase) break;
      }
      j++;
      while (j < fin && /[a-z]/.test(src[j])) j++;
      toks.push({ t: "re", s: src.slice(i, j), ini: i, fin: j }); i = j;
      continue;
    }
    const p = PUNTUACION.find((x) => src.startsWith(x, i));

    if (!p) throw new NoSoportado(`carácter no reconocido «${c}»`);
    toks.push({ t: "p", v: p, s: p, ini: i, fin: i + p.length }); i += p.length;
  }

  return toks;
}

// ── Sintaxis de expresiones ──
function analizarExpresion(src, ini, fin) {
  const toks = tokenizar(src, ini, fin);
  let k = 0;
  const ver = (v, d = 0) => toks[k + d] && (toks[k + d].t === "p" || toks[k + d].t === "id") && toks[k + d].v === v;
  const tomar = (v) => { if (!ver(v)) throw new NoSoportado(`se esperaba «${v}»`); return toks[k++]; };
  const texto = (a, b) => toks.slice(a, b).map((t) => t.s).join(" ");
  const nodo = (o, a) => { o.txt = texto(a, k); return o; };

  /** Salta una anotación de tipo hasta un delimitador de nivel superior. */
  function saltarTipo(fines) {
    let p = 0;

    while (k < toks.length) {
      const t = toks[k];

      if (t.t === "p" && "([{<".includes(t.v)) p++;
      else if (t.t === "p" && ")]}>".includes(t.v)) { if (p === 0) return; p--; }
      else if (p === 0 && t.t === "p" && fines.includes(t.v)) return;
      k++;
    }
  }

  function parametros() {
    const out = [];

    tomar("(");
    while (!ver(")")) {
      if (ver("...")) throw new NoSoportado("parámetro rest");
      const n = toks[k++];

      if (n.t !== "id") throw new NoSoportado("parámetro con desestructuración");
      if (ver("?")) k++;
      if (ver(":")) { k++; saltarTipo([",", "=", ")"]); }
      let def = null;

      if (ver("=")) { k++; def = asignable(); }
      out.push({ nombre: n.v, def });
      if (ver(",")) k++;
    }
    tomar(")");

    return out;
  }

  function esFlecha() {
    let j = k;

    if (toks[j] && toks[j].t === "id" && toks[j].v === "async") j++;
    if (toks[j] && toks[j].t === "id" && toks[j + 1] && toks[j + 1].v === "=>") return true;
    if (!toks[j] || toks[j].v !== "(") return false;

    let p = 0;

    for (; j < toks.length; j++) {
      if (toks[j].t === "p" && "([{".includes(toks[j].v)) p++;
      else if (toks[j].t === "p" && ")]}".includes(toks[j].v)) { p--; if (p === 0) break; }
    }
    const sig = toks[j + 1];

    return !!sig && sig.t === "p" && (sig.v === "=>" || sig.v === ":");
  }

  function flecha() {
    const a = k;
    let asincrona = false;

    if (ver("async")) { asincrona = true; k++; }
    let params;

    if (toks[k].t === "id") params = [{ nombre: toks[k++].v, def: null }];
    else params = parametros();
    if (ver(":")) { k++; saltarTipo(["=>"]); }
    tomar("=>");
    if (ver("{")) {
      const ab = toks[k];
      const finBloque = cerrarGrupo(src, ab.ini);

      while (k < toks.length && toks[k].ini < finBloque) k++;

      return nodo({ k: "flecha", params, asincrona, bloque: { src, ini: ab.ini + 1, fin: finBloque - 1 } }, a);
    }

    return nodo({ k: "flecha", params, asincrona, cuerpo: asignable() }, a);
  }

  function asignable() { return esFlecha() ? flecha() : ternario(); }

  function ternario() {
    const a = k;
    const c = binario(0);

    if (ver("?")) {
      k++;
      const x = asignable();

      tomar(":");
      const y = asignable();

      return nodo({ k: "tern", c, a: x, b: y }, a);
    }

    return c;
  }

  const NIVELES = [["??"], ["||"], ["&&"], ["===", "!==", "==", "!="], ["<", ">", "<=", ">="], ["+", "-"], ["*", "/", "%"]];

  function binario(n) {
    if (n === NIVELES.length) return unario();
    const a = k;
    let izq = binario(n + 1);

    while (toks[k] && toks[k].t === "p" && NIVELES[n].includes(toks[k].v)) {
      const op = toks[k++].v;
      const der = binario(n + 1);

      izq = nodo({ k: "bin", op, a: izq, b: der }, a);
    }

    return izq;
  }

  function unario() {
    const a = k;

    if (ver("!") || ver("-")) { const op = toks[k++].v; return nodo({ k: "un", op, a: unario() }, a); }
    if (ver("await") || ver("typeof") || ver("new") || ver("void")) { k++; const x = unario(); return nodo({ k: "opaco", motivo: "await/new/typeof", x }, a); }

    return posfijo();
  }

  function argumentos() {
    const out = [];

    tomar("(");
    while (!ver(")")) {
      if (ver("...")) { k++; out.push({ spread: true, n: asignable() }); } else out.push({ n: asignable() });
      if (ver(",")) k++;
    }
    tomar(")");

    return out;
  }

  function posfijo() {
    const a = k;
    let o = primario();

    for (;;) {
      if (ver(".") || ver("?.")) {
        k++;
        if (ver("(")) { o = nodo({ k: "llamada", f: o, args: argumentos() }, a); continue; }
        if (ver("[")) { k++; const i = asignable(); tomar("]"); o = nodo({ k: "indice", o, i }, a); continue; }
        const n = toks[k++];

        if (!n || n.t !== "id") throw new NoSoportado("miembro inválido");
        o = nodo({ k: "miembro", o, p: n.v }, a);
      } else if (ver("[")) { k++; const i = asignable(); tomar("]"); o = nodo({ k: "indice", o, i }, a); }
      else if (ver("(")) o = nodo({ k: "llamada", f: o, args: argumentos() }, a);
      else if (ver("as") || ver("satisfies")) { k++; saltarTipo([",", ")", "]", "}", ";", "?", ":", "&&", "||", "??", "=", "+"]); }
      else if (ver("!") && toks[k + 1] && toks[k + 1].t === "p" && [".", ")", "]", ",", ";"].includes(toks[k + 1].v)) k++;
      else break;
    }

    return o;
  }

  function primario() {
    const a = k;
    const t = toks[k];

    if (!t) throw new NoSoportado("expresión incompleta");
    if (t.t === "num") { k++; return nodo({ k: "val", v: t.v }, a); }
    if (t.t === "str") { k++; return nodo({ k: "val", v: t.v }, a); }
    if (t.t === "re") { k++; return nodo({ k: "opaco", motivo: "expresión regular" }, a); }
    if (t.t === "tpl") {
      k++;

      return nodo({ k: "tpl", ini: t.ini, partes: t.partes.map((p) => (p.t === "txt" ? p : { t: "expr", n: analizarExpresion(t.src, p.ini, p.fin) })) }, a);
    }
    if (t.t === "id") {
      if (esFlecha()) return flecha();
      k++;
      if (t.v === "true" || t.v === "false") return nodo({ k: "val", v: t.v === "true" }, a);
      if (t.v === "null") return nodo({ k: "val", v: null }, a);
      if (t.v === "undefined") return nodo({ k: "val", v: undefined }, a);
      if (t.v === "function") throw new NoSoportado("función anónima");

      return nodo({ k: "id", v: t.v }, a);
    }
    if (ver("(")) {
      if (esFlecha()) return flecha();
      k++;
      const x = asignable();

      tomar(")");

      return x;
    }
    if (ver("[")) {
      k++;
      const el = [];

      while (!ver("]")) {
        if (ver("...")) { k++; el.push({ spread: true, n: asignable() }); } else el.push({ n: asignable() });
        if (ver(",")) k++;
      }
      tomar("]");

      return nodo({ k: "arreglo", el }, a);
    }
    if (ver("{")) {
      k++;
      const props = [];

      while (!ver("}")) {
        if (ver("...")) { k++; props.push({ spread: true, n: asignable() }); }
        else {
          const c = toks[k++];
          let clave;

          if (c.t === "id" || c.t === "str" || c.t === "num") clave = String(c.v);
          else throw new NoSoportado("clave de objeto calculada");
          if (ver(":")) { k++; props.push({ clave, n: asignable() }); } else props.push({ clave, n: { k: "id", v: clave, txt: clave } });
        }
        if (ver(",")) k++;
      }
      tomar("}");

      return nodo({ k: "objeto", props }, a);
    }

    throw new NoSoportado(`token inesperado «${t.s}»`);
  }

  const n = asignable();

  if (k < toks.length) throw new NoSoportado(`resto no interpretado «${texto(k, k + 3)}»`);

  return n;
}

// ── Sentencias de un bloque ──
/** Fin de «function nombre(params): Tipo { … }» (el tipo de retorno puede contener objetos, genéricos y flechas). Devuelve también la «{» del cuerpo. */
function cuerpoDeFuncion(src, i, fin) {
  let k = src.indexOf("(", i);

  if (k < 0 || k >= fin) throw new NoSoportado("función sin parámetros");
  k = cerrarGrupo(src, k);
  let p = 0;

  for (; k < fin; k++) {
    const c = src[k];

    if (c === "=" && src[k + 1] === ">") { k++; continue; }
    if (c === "(" || c === "[" || c === "<") p++;
    else if (c === ")" || c === "]" || c === ">") p--;
    else if (c === "{") {
      let j = k - 1;

      while (j >= 0 && /\s/.test(src[j])) j--;
      if (p === 0 && !":|&<,(=".includes(src[j]) && !(src[j] === ">" && src[j - 1] === "=")) return { llave: k, fin: cerrarGrupo(src, k) };
      k = cerrarGrupo(src, k) - 1;
    } else if (c === '"' || c === "'") k = saltarCadena(src, k, c) - 1;
  }

  throw new NoSoportado("función sin cuerpo");
}

const finDeclaracionFuncion = (src, i, fin) => cuerpoDeFuncion(src, i, fin).fin;

const PALABRAS_CONTROL = /^(for|while|switch|try|do)\b/;

/** Divide [ini, fin) de `src` en sentencias de nivel superior: simple | if (con ramas) | bloque | otro (control no soportado). Posiciones absolutas. */
function sentencias(src, ini, fin) {
  const out = [];
  let i = ini;
  const saltarBlanco = () => {
    for (;;) {
      while (i < fin && /\s/.test(src[i])) i++;
      if (src.startsWith("//", i)) { while (i < fin && src[i] !== "\n") i++; continue; }
      if (src.startsWith("/*", i)) { const f = src.indexOf("*/", i + 2); i = f < 0 ? fin : f + 2; continue; }
      break;
    }
  };
  /** Fin de una sentencia simple: «;» de nivel superior (o fin del rango). */
  const finSimple = (desde) => {
    for (let k = desde; k < fin; k++) {
      const c = src[k];

      if (c === '"' || c === "'") { k = saltarCadena(src, k, c) - 1; continue; }
      if (c === "`") { k = leerPlantilla(src, k + 1).fin - 1; continue; }
      if (c === "/" && src[k + 1] === "/") { while (k < fin && src[k] !== "\n") k++; continue; }
      if (c === "/" && src[k + 1] === "*") { const f = src.indexOf("*/", k + 2); k = f < 0 ? fin : f + 1; continue; }
      if (c === "/" && esInicioRegex(src, k)) { k = finRegex(src, k) - 1; continue; }
      if ("([{".includes(c)) { k = cerrarGrupo(src, k) - 1; continue; }
      if (c === ";") return k + 1;
    }

    return fin;
  };
  /** Cuerpo de una rama: bloque {…} o una sentencia. */
  const cuerpo = () => {
    saltarBlanco();
    if (src[i] === "{") { const f = cerrarGrupo(src, i); const r = { ini: i, fin: f, bloque: true }; i = f; return r; }
    if (/^if\b/.test(src.slice(i, i + 3))) { const s = sentenciaIf(); return { ini: s.ini, fin: s.fin, bloque: false }; }
    const f = finSimple(i);
    const r = { ini: i, fin: f, bloque: false };

    i = f;

    return r;
  };
  function sentenciaIf() {
    const a = i;
    const ramas = [];

    for (;;) {
      i += 2; saltarBlanco();
      if (src[i] !== "(") throw new NoSoportado("if sin condición");
      const fc = cerrarGrupo(src, i);
      const cond = { ini: i + 1, fin: fc - 1 };

      i = fc;
      ramas.push({ cond, cuerpo: cuerpo() });
      const guardar = i;

      saltarBlanco();
      if (/^else\b/.test(src.slice(i, i + 5))) {
        i += 4; saltarBlanco();
        if (/^if\b/.test(src.slice(i, i + 3))) continue;
        ramas.push({ cond: null, cuerpo: cuerpo() });
        break;
      }
      i = guardar;
      break;
    }

    return { tipo: "if", ini: a, fin: i, ramas };
  }

  for (;;) {
    saltarBlanco();
    if (i >= fin) break;
    const a = i;

    if (src[i] === ";") { i++; continue; }
    if (/^if\b/.test(src.slice(i, i + 3))) { out.push(sentenciaIf()); continue; }
    if (src[i] === "{") { const f = cerrarGrupo(src, i); out.push({ tipo: "bloque", ini: a, fin: f, cuerpo: { ini: a, fin: f, bloque: true } }); i = f; continue; }
    if (/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\b/.test(src.slice(i, i + 40))) { const f = finDeclaracionFuncion(src, i, fin); out.push({ tipo: "otro", ini: a, fin: f }); i = f; continue; }
    if (/^(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:interface|enum|class|namespace)\b/.test(src.slice(i, i + 40))) {
      let k = i;

      while (k < fin && src[k] !== "{") k++;
      const f = k < fin ? cerrarGrupo(src, k) : fin;

      out.push({ tipo: "otro", ini: a, fin: f }); i = f;
      continue;
    }
    if (PALABRAS_CONTROL.test(src.slice(i, i + 8))) {
      // Sentencia de control (o función interna): se consume con todos sus grupos y bloques hasta el último «}» consecutivo.
      let k = i;

      for (;;) {
        while (k < fin && !"({;".includes(src[k])) k++;
        if (k >= fin || src[k] === ";") { k = Math.min(fin, k + 1); break; }
        k = cerrarGrupo(src, k);
        const resto = src.slice(k, k + 40);

        if (/^\s*(\{|catch\b|finally\b|else\b|while\b)/.test(resto) || src[k - 1] === ")") continue;
        break;
      }
      out.push({ tipo: "otro", ini: a, fin: k }); i = k;
      continue;
    }
    const f = finSimple(i);

    out.push({ tipo: "simple", ini: a, fin: f }); i = f;
  }

  return out;
}

// ── Valores, entorno y evaluación ──
class Entorno {
  constructor(padre = null) { this.v = new Map(); this.padre = padre; }
  buscar(n) { for (let e = this; e; e = e.padre) if (e.v.has(n)) return e; return null; }
}

const clave = (o) => (o.ruta ? o.ruta.join(".") : o.texto);

/**
 * Corrida en un mundo: `mundo` (Map clave→valor) fija las condiciones sobre datos opacos; las claves consumidas se registran en orden con su dominio.
 * `ctxArchivo` resuelve nombres del módulo (constantes y funciones de nivel superior, importaciones rastreadas).
 */
function crearCorrida(mundo, modulos) {
  return { mundo, consumidas: [], dominios: new Map(), plantillas: new Set(), modulos };
}

function dominio(run, k, extra = []) {
  if (!run.dominios.has(k)) run.dominios.set(k, [FALSO, VERDADERO]);
  const d = run.dominios.get(k);

  for (const x of extra) if (!d.includes(x)) d.push(x);

  return d;
}

function valorMundo(run, o) {
  const k = clave(o);

  dominio(run, k);
  if (!run.consumidas.includes(k)) run.consumidas.push(k);

  return run.mundo.has(k) ? run.mundo.get(k) : FALSO;
}

const verdadDeMundo = (w) => (w === FALSO ? false : w === VERDADERO ? true : Boolean(w));

/** Verdad de una condición; las hojas opacas se deciden por el mundo. */
function verdad(n, env, run, mod) {
  if (n.k === "un" && n.op === "!") return !verdad(n.a, env, run, mod);
  if (n.k === "bin" && n.op === "&&") return verdad(n.a, env, run, mod) && verdad(n.b, env, run, mod);
  if (n.k === "bin" && n.op === "||") return verdad(n.a, env, run, mod) || verdad(n.b, env, run, mod);
  if (n.k === "bin" && ["===", "!==", "==", "!="].includes(n.op)) {
    const a = evaluar(n.a, env, run, mod);
    const b = evaluar(n.b, env, run, mod);
    const neg = n.op.startsWith("!");
    let igual;

    if (esOpaco(a) && !esOpaco(b) && (typeof b === "string" || typeof b === "number")) { dominio(run, clave(a), [b]); igual = valorMundo(run, a) === b; }
    else if (esOpaco(b) && !esOpaco(a) && (typeof a === "string" || typeof a === "number")) { dominio(run, clave(b), [a]); igual = valorMundo(run, b) === a; }
    else if (esOpaco(a) || esOpaco(b)) return verdadDeMundo(valorMundo(run, opaco(n.txt)));
    else igual = n.op.length === 3 ? a === b : a == b; // eslint-disable-line eqeqeq

    return neg ? !igual : igual;
  }
  const v = evaluar(n, env, run, mod);

  if (esOpaco(v)) return verdadDeMundo(valorMundo(run, v));

  return Boolean(v);
}

const NUMERO_O_TEXTO = (v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null || v === undefined;

function enTexto(v) {
  if (esOpaco(v)) return v;
  if (Array.isArray(v)) { if (v.contaminado) return opaco("arreglo modificado fuera del subconjunto interpretable"); const p = v.map(enTexto); return p.find(esOpaco) ?? p.join(","); }
  if (NUMERO_O_TEXTO(v)) return String(v);

  return opaco("valor no textual en la plantilla");
}

function llamar(f, args, run, mod) {
  if (!f || f.k !== "cierre") throw new NoSoportado("llamada a algo que no es función");
  const env = new Entorno(f.env);

  f.params.forEach((p, i) => env.v.set(p.nombre, args[i] !== undefined ? args[i] : p.def ? evaluar(p.def, env, run, f.mod) : undefined));
  if (f.cuerpo) return evaluar(f.cuerpo, env, run, f.mod);
  try {
    ejecutarBloque(f.bloque.src, f.bloque.ini, f.bloque.fin, env, run, f.mod, null);
  } catch (e) {
    if (e instanceof Retorno) return e.v;
    throw e;
  }

  return undefined;
}

function metodo(o, nombre, argsN, env, run, mod, txt) {
  const args = () => argsN.map((a) => evaluar(a.n, env, run, mod));

  if (Array.isArray(o)) {
    if (nombre === "push") { const v = args(); o.push(...v); return o.length; }
    if (o.contaminado) return opaco(txt);
    if (nombre === "join") { const [sep] = args(); if (esOpaco(sep)) return sep; const p = o.map(enTexto); return p.find(esOpaco) ?? p.join(sep === undefined ? "," : sep); }
    if (nombre === "map") { const [fn] = args(); const r = o.map((x, i) => llamar(fn, [x, i], run, mod)); return r; }
    if (nombre === "includes") {
      const [x] = args();

      if (esOpaco(x)) { dominio(run, clave(x), o.filter((y) => typeof y === "string" || typeof y === "number")); const w = valorMundo(run, x); return o.includes(w); }

      return o.includes(x);
    }
    if (nombre === "slice") { const [a, b] = args(); return o.slice(a, b); }
    if (["unshift", "splice", "sort", "reverse", "pop", "shift", "fill"].includes(nombre)) { o.contaminado = true; return opaco(txt); }

    return opaco(txt);
  }
  if (typeof o === "string") {
    const a = args();

    if (a.some(esOpaco)) return opaco(txt);
    if (nombre === "replace" && typeof a[0] === "string" && typeof a[1] === "string") return o.replace(a[0], () => a[1]);
    if (nombre === "split" && typeof a[0] === "string") return o.split(a[0]);
    if (nombre === "trim") return o.trim();
    if (nombre === "slice") return o.slice(a[0], a[1]);
    if (nombre === "toUpperCase") return o.toUpperCase();
    if (nombre === "toLowerCase") return o.toLowerCase();
    if (nombre === "indexOf") return o.indexOf(a[0]);

    return opaco(txt);
  }

  return opaco(txt);
}

/** Valor de un nodo. Lanza Aborto si el código real lanzaría (acceso a propiedad de undefined/null), NoSoportado si la forma no es interpretable. */
function evaluar(n, env, run, mod) {
  switch (n.k) {
    case "val": return n.v;
    case "opaco": return opaco(n.txt, null, n.motivo);
    case "tpl": {
      if (n.ini !== undefined) run.plantillas.add(`${mod.archivo}@${n.ini}`);
      let s = "";

      for (const p of n.partes) {
        if (p.t === "txt") { s += p.v; continue; }
        const v = enTexto(evaluar(p.n, env, run, mod));

        if (esOpaco(v)) return opaco(p.n.txt, null, v.motivo ?? `valor de ejecución en el SQL: ${v.texto}`);
        s += v;
      }

      return s;
    }
    case "id": {
      const e = env.buscar(n.v);

      if (e) return e.v.get(n.v);

      return valorDeModulo(n.v, mod, run);
    }
    case "miembro": {
      const o = evaluar(n.o, env, run, mod);

      if (esOpaco(o)) return opaco(n.txt, o.ruta ? [...o.ruta, n.p] : null);
      if (o === null || o === undefined) throw new Aborto(`acceso a «${n.p}» de un valor indefinido`);
      if (Array.isArray(o) || typeof o === "string") { if (n.p === "length") return Array.isArray(o) && o.contaminado ? opaco(n.txt) : o.length; return opaco(n.txt); }
      if (o.k === "objeto") return o.v.has(n.p) ? o.v.get(n.p) : undefined;

      return opaco(n.txt);
    }
    case "indice": {
      const o = evaluar(n.o, env, run, mod);
      const i = evaluar(n.i, env, run, mod);

      if (esOpaco(o)) return opaco(n.txt);
      if (o === null || o === undefined) throw new Aborto("índice de un valor indefinido");
      if (o.k === "objeto") {
        if (esOpaco(i)) { dominio(run, clave(i), [...o.v.keys()]); const w = valorMundo(run, i); return typeof w === "string" && o.v.has(w) ? o.v.get(w) : undefined; }

        return o.v.get(String(i));
      }
      if (Array.isArray(o) && typeof i === "number") return o[i];

      return opaco(n.txt);
    }
    case "llamada": {
      if (n.f.k === "miembro") {
        const o = evaluar(n.f.o, env, run, mod);

        if (esOpaco(o)) return opaco(n.txt);
        if (o === null || o === undefined) throw new Aborto("llamada sobre un valor indefinido");

        return metodo(o, n.f.p, n.args, env, run, mod, n.txt);
      }
      const f = evaluar(n.f, env, run, mod);

      if (esOpaco(f) || !f || f.k !== "cierre") return opaco(n.txt);
      const args = [];

      for (const a of n.args) {
        const v = evaluar(a.n, env, run, mod);

        if (a.spread) { if (!Array.isArray(v)) return opaco(n.txt); args.push(...v); } else args.push(v);
      }

      return llamar(f, args, run, mod);
    }
    case "un": {
      if (n.op === "!") return !verdad(n.a, env, run, mod);
      const v = evaluar(n.a, env, run, mod);

      return typeof v === "number" ? -v : opaco(n.txt);
    }
    case "bin": {
      if (["&&", "||", "===", "!==", "==", "!="].includes(n.op)) {
        if (n.op === "&&") return verdad(n.a, env, run, mod) ? evaluar(n.b, env, run, mod) : evaluar(n.a, env, run, mod);
        if (n.op === "||") return verdad(n.a, env, run, mod) ? evaluar(n.a, env, run, mod) : evaluar(n.b, env, run, mod);

        return verdad(n, env, run, mod);
      }
      const a = evaluar(n.a, env, run, mod);

      if (n.op === "??") return esOpaco(a) ? opaco(n.txt) : a ?? evaluar(n.b, env, run, mod);
      const b = evaluar(n.b, env, run, mod);

      if (esOpaco(a) || esOpaco(b)) return opaco(n.txt);
      if (n.op === "+") { if (typeof a === "number" && typeof b === "number") return a + b; if (NUMERO_O_TEXTO(a) && NUMERO_O_TEXTO(b)) return String(a) + String(b); return opaco(n.txt); }
      if (typeof a !== "number" || typeof b !== "number") return opaco(n.txt);

      return { "-": a - b, "*": a * b, "/": a / b, "%": a % b, "<": a < b, ">": a > b, "<=": a <= b, ">=": a >= b }[n.op];
    }
    case "tern": return verdad(n.c, env, run, mod) ? evaluar(n.a, env, run, mod) : evaluar(n.b, env, run, mod);
    case "arreglo": {
      const out = [];

      for (const e of n.el) {
        const v = evaluar(e.n, env, run, mod);

        if (e.spread) { if (!Array.isArray(v)) return opaco(n.txt); out.push(...v); } else out.push(v);
      }

      return out;
    }
    case "objeto": {
      const v = new Map();

      for (const p of n.props) {
        if (p.spread) { const o = evaluar(p.n, env, run, mod); if (!o || o.k !== "objeto") return opaco(n.txt); for (const [a, b] of o.v) v.set(a, b); continue; }
        v.set(p.clave, evaluar(p.n, env, run, mod));
      }

      return { k: "objeto", v };
    }
    case "flecha": return { k: "cierre", params: n.params, cuerpo: n.cuerpo, bloque: n.bloque, env, mod };
    default: throw new NoSoportado(`nodo ${n.k}`);
  }
}

// ── Módulos (nivel superior de cada archivo) ──
/** Declaraciones de nivel superior: const NAME = EXPR; y function NAME(params) { … }. Se analizan una vez por archivo. */
function declaracionesDeModulo(archivo, modulos) {
  const m = modulos.get(archivo);

  if (!m) return null;
  if (m.decl) return m.decl;
  m.decl = new Map();
  const src = m.src;
  let lista;

  try { lista = sentencias(src, 0, src.length); } catch { return m.decl; }
  for (const s of lista) {
    const t = src.slice(s.ini, s.fin);
    const f = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(t);

    if (s.tipo === "otro" && f) {
      let c;

      try { c = cuerpoDeFuncion(src, s.ini, s.fin); } catch { continue; }
      const ab = src.indexOf("(", s.ini);

      m.decl.set(f[1], m.decl.has(f[1]) ? { ambiguo: true } : { funcion: { paramsIni: ab, paramsFin: cerrarGrupo(src, ab), bloque: { src, ini: c.llave + 1, fin: c.fin - 1 } } });
      continue;
    }
    if (s.tipo !== "simple") continue;
    const c = /^(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=(?!=)/.exec(t);

    if (!c) continue;
    const ini = s.ini + c[0].length;
    let fin = s.fin;

    while (fin > ini && /[\s;]/.test(src[fin - 1])) fin--;
    m.decl.set(c[1], m.decl.has(c[1]) ? { ambiguo: true } : { expr: { ini, fin } });
  }

  return m.decl;
}

function valorDeModulo(nombre, mod, run) {
  const memo = run.memoModulo ?? (run.memoModulo = new Map());
  const k = `${mod.archivo}#${nombre}`;

  if (memo.has(k)) return memo.get(k);

  const decl = declaracionesDeModulo(mod.archivo, run.modulos);
  const d = decl ? decl.get(nombre) : undefined;
  let v;

  if (d && !d.ambiguo) {
    const m = run.modulos.get(mod.archivo);

    if (d.expr) v = evaluar(analizarCacheado(m.src, d.expr.ini, d.expr.fin), new Entorno(), run, mod);
    else {
      const params = parametrosDeTexto(m.src, d.funcion.paramsIni, d.funcion.paramsFin);

      v = { k: "cierre", params, bloque: d.funcion.bloque, env: new Entorno(), mod };
    }
  } else if (!d && mod.importados.has(nombre)) {
    const im = mod.importados.get(nombre);
    const destino = run.modulos.get(im.archivo);

    v = destino ? valorDeModulo(im.nombre, destino.ctx, run) : opaco(nombre, [nombre]);
  } else v = opaco(nombre, [nombre], d && d.ambiguo ? `nombre declarado más de una vez: ${nombre}` : null);
  memo.set(k, v);

  return v;
}

const cacheAst = new Map();

function analizarCacheado(src, ini, fin) {
  const k = `${ini}:${fin}:${src.length}:${src.slice(ini, Math.min(fin, ini + 40))}`;

  if (!cacheAst.has(k)) {
    try { cacheAst.set(k, analizarExpresion(src, ini, fin)); } catch (e) { cacheAst.set(k, e); }
  }
  const r = cacheAst.get(k);

  if (r instanceof Error) throw r;

  return r;
}

function parametrosDeTexto(src, abre, cierra) {
  return analizarExpresion(src.slice(0, cierra) + " => 0", abre, cierra + 5).params;
}

// ── Ejecución de sentencias ──
/** Interpreta las sentencias de [ini, fin). Si `objetivo` cae en una sentencia simple, devuelve {sentencia, env} sin ejecutarla. */
function ejecutarBloque(src, ini, fin, padre, run, mod, objetivo) {
  const env = new Entorno(padre);

  for (const s of sentencias(src, ini, fin)) {
    const contiene = objetivo !== null && objetivo >= s.ini && objetivo < s.fin;

    if (s.tipo === "if") {
      const destino = contiene ? s.ramas.find((r) => objetivo >= r.cuerpo.ini && objetivo < r.cuerpo.fin) : null;

      if (contiene && !destino) throw new NoSoportado("la consulta está dentro de una condición");
      let elegida = null;

      for (const r of s.ramas) if (r.cond === null || verdad(analizarCacheado(src, r.cond.ini, r.cond.fin), env, run, mod)) { elegida = r; break; }
      if (contiene && elegida !== destino) throw new Aborto("el mundo no toma la rama de la consulta");
      if (elegida) {
        const c = elegida.cuerpo;
        const res = c.bloque ? ejecutarBloque(src, c.ini + 1, c.fin - 1, env, run, mod, contiene ? objetivo : null) : ejecutarBloque(src, c.ini, c.fin, env, run, mod, contiene ? objetivo : null);

        if (res) return res;
      }
      continue;
    }
    if (s.tipo === "bloque") {
      const res = ejecutarBloque(src, s.ini + 1, s.fin - 1, env, run, mod, contiene ? objetivo : null);

      if (res) return res;
      continue;
    }
    if (s.tipo === "otro") {
      if (contiene) throw new NoSoportado(`sentencia de control no interpretable: ${normal(src.slice(s.ini, s.ini + 40))}`);
      contaminar(src.slice(s.ini, s.fin), env);
      continue;
    }
    if (contiene) return { sentencia: s, env };
    ejecutarSimple(src, s, env, run, mod);
  }

  return null;
}

/** Una sentencia fuera del subconjunto que modifica nombres conocidos los deja opacos/contaminados (nunca se supone que no cambió nada). */
function contaminar(texto, env) {
  for (let e = env; e; e = e.padre) {
    for (const [n, v] of e.v) {
      if (!new RegExp(`\\b${n.replace(/\$/g, "\\$")}\\s*(?:\\.(?:push|unshift|splice|pop|shift|sort|reverse)\\(|[+\\-]?=(?![=>]))`).test(texto)) continue;
      if (Array.isArray(v)) v.contaminado = true; else e.v.set(n, opaco(n));
    }
  }
}

function ejecutarSimple(src, s, env, run, mod) {
  let t = src.slice(s.ini, s.fin);
  let fin = s.fin;

  while (fin > s.ini && /[\s;]/.test(src[fin - 1])) fin--;
  t = src.slice(s.ini, fin);
  const decl = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=(?!=)/.exec(t);

  if (decl) {
    let v = evaluarSeguro(src, s.ini + decl[0].length, fin, env, run, mod);

    // Dato de ejecución con nombre: su identidad es el sitio de la declaración (dos «esq» de funciones distintas no se confunden).
    if (esOpaco(v) && !v.ruta) v = { ...v, ruta: [`${decl[1]}@${s.ini}`] };
    env.v.set(decl[1], v);
    return;
  }
  if (/^(?:const|let|var)\s+[[{]/.test(t)) { contaminar(t, env); return; }
  if (/^(?:let|var)\s+[A-Za-z_$][\w$]*\s*(?::[^;=]+)?$/.test(t)) { env.v.set(/^(?:let|var)\s+([A-Za-z_$][\w$]*)/.exec(t)[1], undefined); return; }
  const asig = /^([A-Za-z_$][\w$]*)\s*(\+?=)(?![=>])/.exec(t);

  if (asig) {
    const e = env.buscar(asig[1]);
    const v = evaluarSeguro(src, s.ini + asig[0].length, fin, env, run, mod);

    if (!e) return;
    if (asig[2] === "+=") { const a = e.v.get(asig[1]); e.v.set(asig[1], esOpaco(a) || esOpaco(v) ? opaco(asig[1]) : a + v); } else e.v.set(asig[1], v);
    return;
  }
  if (/^return\b/.test(t)) {
    const ini = s.ini + 6;

    throw new Retorno(fin > ini ? evaluarSeguro(src, ini, fin, env, run, mod) : undefined);
  }
  if (/^throw\b/.test(t)) throw new Aborto("throw");
  try {
    evaluar(analizarCacheado(src, s.ini, fin), env, run, mod);
  } catch (e) {
    if (e instanceof NoSoportado) { contaminar(t, env); return; }
    throw e;
  }
}

function evaluarSeguro(src, ini, fin, env, run, mod) {
  try {
    return evaluar(analizarCacheado(src, ini, fin), env, run, mod);
  } catch (e) {
    if (e instanceof NoSoportado) return opaco(src.slice(ini, fin), null, `forma no interpretable: ${e.message}`);
    throw e;
  }
}

// ── Exploración de mundos ──
const clonarMundo = (m) => new Map(m);
const firmaMundo = (m) => JSON.stringify([...m].map(([k, v]) => [k, typeof v === "symbol" ? v.description : v]).sort());

/**
 * `correr(mundo)` → {alcanzado, sql (texto u opaco), consumidas, dominios, plantillas}. Busca un mundo que alcance la consulta (búsqueda en anchura sobre las
 * decisiones consumidas) y, desde él, varía cada condición por separado y arma el mundo de activación máxima. Devuelve los resultados que alcanzan la consulta.
 */
function explorarMundos(correr) {
  const cache = new Map();
  const alcanzados = [];
  const dominios = new Map();
  let corridas = 0;
  const ejecutar = (m) => {
    const f = firmaMundo(m);

    if (cache.has(f)) return cache.get(f);
    if (++corridas > MAX_CORRIDAS) throw new NoSoportado(`más de ${MAX_CORRIDAS} recorridos`);
    const r = correr(m);

    for (const [k, d] of r.dominios) { const g = dominios.get(k) ?? []; for (const x of d) if (!g.includes(x)) g.push(x); dominios.set(k, g); }
    cache.set(f, r);
    if (r.alcanzado) alcanzados.push({ ...r, mundo: m });

    return r;
  };
  const valor = (m, k) => (m.has(k) ? m.get(k) : FALSO);
  /**
   * Busca, a partir de `inicio`, un mundo que alcance la consulta sin cambiar las condiciones `fijas`: en profundidad, cambiando primero la ÚLTIMA decisión tomada (la guarda que
   * desvió el recorrido) y conservando las anteriores. `limite` acota los recorridos de esta búsqueda.
   */
  const buscar = (inicio, fijas, limite) => {
    const pila = [inicio];
    const vistos = new Set();
    let n = 0;

    while (pila.length && n < limite) {
      const m = pila.pop();
      const f = firmaMundo(m);

      if (vistos.has(f)) continue;
      vistos.add(f); n++;
      const r = ejecutar(m);

      if (r.alcanzado) return { mundo: m, r };
      for (let i = 0; i < r.consumidas.length; i++) {
        const k = r.consumidas[i];

        if (fijas.has(k)) continue;
        for (const v of dominios.get(k) ?? [FALSO, VERDADERO]) {
          if (v === valor(m, k)) continue;
          const hijo = new Map();

          for (const [k2, v2] of m) if (fijas.has(k2)) hijo.set(k2, v2);
          for (const k2 of r.consumidas.slice(0, i)) hijo.set(k2, valor(m, k2));
          hijo.set(k, v);
          pila.push(hijo);
        }
      }
    }

    return null;
  };
  // 1) Primer mundo que alcanza la consulta.
  const base = buscar(new Map(), new Set(), MAX_CORRIDAS);

  if (!base) return { alcanzados, dominios, corridas };
  // 2) Cada condición por separado alrededor del mundo base; si el cambio desvía el recorrido (p. ej. un filtro que exige otra guarda), se repara el camino sin tocar esa condición.
  const pendientes = [...base.r.consumidas];
  const hechas = [];

  while (pendientes.length) {
    const k = pendientes.shift();

    if (hechas.includes(k)) continue;
    hechas.push(k);
    for (const v of dominios.get(k) ?? []) {
      if (v === valor(base.mundo, k)) continue;
      const n = clonarMundo(base.mundo);

      n.set(k, v);
      const res = buscar(n, new Set([k]), 40);

      if (res) for (const k2 of res.r.consumidas) if (!hechas.includes(k2)) pendientes.push(k2);
    }
  }
  // 3) Activación máxima: cada condición en su primer valor activo (literales comparados antes que VERDADERO) que siga alcanzando la consulta, conservando las ya activadas.
  let max = base.mundo;

  for (let vuelta = 0; vuelta < 3; vuelta++) {
    let cambio = false;

    for (const k of hechas) {
      if (valor(max, k) !== FALSO) continue;
      const valores = [...(dominios.get(k) ?? [])].sort((x, y) => (typeof x === "symbol") - (typeof y === "symbol"));

      for (const v of valores) {
        if (v === FALSO) continue;
        const n = clonarMundo(max);
        const fijas = new Set([...max].filter(([, w]) => w !== FALSO).map(([k2]) => k2));

        n.set(k, v);
        fijas.add(k);
        const res = buscar(n, fijas, 40);

        if (res) { max = res.mundo; cambio = true; break; }
      }
    }
    if (!cambio) break;
  }

  return { alcanzados, dominios, corridas };
}

// ── Consultas anfitrionas y reconstrucción por intérprete ──
/** Envolturas de consulta: const NOMBRE = async (sql…) => …query(`… ${sql} …`) que agregan SQL propio (p. ej. «WITH ${cte}»). */
function envolturas(a) {
  const out = [];

  for (const m of a.src.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::[^=]*)?=>\s*\(?\s*(?:await\s+)?[\w$.]+\.query\(\s*`/g)) {
    const params = m[2].split(",").map((p) => p.trim().split(/[:=\s?]/)[0]).filter(Boolean);
    const ini = m.index + m[0].length - 1;
    const pl = a.plantillas.find((p) => p.ini === ini);

    if (!pl || !params.length) continue;
    const usaParam = pl.partes.some((p) => p.t === "expr" && params.includes(p.v.trim()));
    const agrega = pl.partes.some((p) => (p.t === "txt" && p.v.trim() !== "") || (p.t === "expr" && !params.includes(p.v.trim()) && !/^[A-Za-z_$][\w$]*\s*\?/.test(p.v.trim())));

    if (usaParam && agrega) out.push({ nombre: m[1], ini: m.index, plantilla: pl });
  }

  return out;
}

/** Bloque {…} más interno que contiene la posición. */
function bloqueQueContiene(src, pos, aceptar = () => true) {
  let mejor = null;
  const pila = [];

  for (let k = 0; k < src.length && k <= pos + 1; k++) {
    const c = src[k];

    if (c === '"' || c === "'") { k = saltarCadena(src, k, c) - 1; continue; }
    if (c === "`") { const f = leerPlantilla(src, k + 1).fin - 1; if (f >= pos && k < pos) break; k = f; continue; }
    if (c === "/" && src[k + 1] === "/") { while (k < src.length && src[k] !== "\n") k++; continue; }
    if (c === "/" && src[k + 1] === "*") { const f = src.indexOf("*/", k + 2); k = f < 0 ? src.length : f + 1; continue; }
    if (c === "/" && esInicioRegex(src, k)) { k = finRegex(src, k) - 1; continue; }
    if (c === "{") pila.push(k);
    else if (c === "}") pila.pop();
  }
  for (let i = pila.length - 1; i >= 0; i--) {
    if (aceptar(pila[i])) { mejor = pila[i]; break; }
  }
  if (mejor === null) return null;

  return { ini: mejor + 1, fin: cerrarGrupo(src, mejor) - 1 };
}

/** ¿El «{» en `pos` abre el cuerpo de una función (y no un objeto literal, un tipo o un bloque de control)? */
function esCuerpoDeFuncion(src, pos) {
  let k = pos - 1;

  while (k >= 0 && /\s/.test(src[k])) k--;
  if (src[k] === ">" && src[k - 1] === "=") return true;
  if (src[k] === ")") {
    let p = 0;
    let j = k;

    for (; j >= 0; j--) { if (src[j] === ")") p++; else if (src[j] === "(") { p--; if (p === 0) break; } }
    const palabra = /([A-Za-z_$][\w$]*)\s*$/.exec(src.slice(Math.max(0, j - 40), j));

    return !(palabra && /^(if|for|while|switch|catch|with)$/.test(palabra[1]));
  }
  const palabra = /([A-Za-z_$][\w$]*)$/.exec(src.slice(Math.max(0, k - 40), k + 1));

  if (palabra) return !/^(else|try|finally|do|return)$/.test(palabra[1]);

  return src[k] === ">";
}

/** Contexto de módulos para el intérprete (fuente, importaciones rastreadas). */
function modulosDe(archivos, indice) {
  const m = new Map();

  for (const a of archivos) m.set(a.archivo, { src: a.src, ctx: { archivo: a.archivo, importados: indice.porArchivo.get(a.archivo).importados } });

  return m;
}

const RESERVADAS = new Set(["async", "await", "return", "const", "let", "var", "function", "new", "typeof", "true", "false", "null", "undefined", "this", "if", "else", "export", "default"]);

/**
 * Nombres de las funciones que ENVUELVEN al bloque (parámetros y declaraciones fuera del bloque): datos de ejecución opacos. Así un parámetro nunca se confunde con una constante homónima del módulo.
 */
function nombresExternos(src, bloque, modulo) {
  const env = new Entorno();
  let sentencia = null;

  try { sentencia = sentencias(src, 0, src.length).find((s) => s.ini <= bloque.ini && bloque.fin <= s.fin) ?? null; } catch { sentencia = null; }
  if (!sentencia) return env;
  const fuera = src.slice(sentencia.ini, bloque.ini - 1) + "\n" + src.slice(bloque.fin + 1, sentencia.fin);
  const nombres = new Set();

  for (const m of fuera.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) nombres.add(m[1]);
  for (const m of fuera.matchAll(/\b(?:const|let|var)\s*[{[]([^=]*)[}\]]\s*(?::[^=]+)?=/g)) for (const n of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*(?=[,}\]=]|$)/g)) nombres.add(n[1]);
  for (const m of fuera.matchAll(/[(,]\s*([A-Za-z_$][\w$]*)\s*(?=[?:,)=])/g)) nombres.add(m[1]);
  for (const m of fuera.matchAll(/(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*=>/g)) nombres.add(m[1]);
  for (const n of nombres) if (!RESERVADAS.has(n)) env.v.set(n, opaco(n, [n]));
  void modulo;

  return env;
}

/**
 * Reconstruye por intérprete la consulta cuya plantilla empieza en `pos`. Modo anfitriona: la plantilla es el primer argumento de una envoltura (q(`…`, cteExtra))
 * y la consulta COMPLETA es la plantilla de la envoltura con sus argumentos. Modo directo: la propia plantilla dentro de su función.
 * Devuelve {v:[sql…], mundos, plantillas:Set} o {no: motivo}.
 */
function reconstruirPorInterprete(a, pos, modulos, envoltura = null) {
  const src = a.src;
  const mod = modulos.get(a.archivo).ctx;
  const bloque = envoltura ? bloqueQueContiene(src, envoltura.ini) : bloqueQueContiene(src, pos, (k) => esCuerpoDeFuncion(src, k));

  if (!bloque || pos < bloque.ini || pos >= bloque.fin) return { no: "consulta fuera del bloque de su función o envoltura" };

  const externos = nombresExternos(src, bloque, modulos.get(a.archivo));
  const plantillasVistas = new Set();
  const correr = (mundo) => {
    const run = crearCorrida(mundo, modulos);

    try {
      const res = ejecutarBloque(src, bloque.ini, bloque.fin, externos, run, mod, pos);

      if (!res) return { alcanzado: false, consumidas: run.consumidas, dominios: run.dominios };
      let sql;

      if (envoltura) {
        const llamada = /([A-Za-z_$][\w$]*)\s*\(\s*$/.exec(src.slice(Math.max(0, pos - 80), pos));

        if (!llamada || llamada[1] !== envoltura.nombre) throw new NoSoportado("llamada a la envoltura no reconocida");
        const abre = src.lastIndexOf("(", pos);
        const args = dividirArgumentos(src.slice(abre + 1, cerrarGrupo(src, abre) - 1));
        const f = res.env.buscar(envoltura.nombre)?.v.get(envoltura.nombre);

        if (!f || f.k !== "cierre") throw new NoSoportado("envoltura no definida en el alcance");
        const env = new Entorno(f.env);
        let desde = abre + 1;

        f.params.forEach((p, i) => {
          if (i < args.length) {
            const ini = src.indexOf(args[i], desde);

            env.v.set(p.nombre, evaluar(analizarCacheado(src, ini, ini + args[i].length), res.env, run, mod));
            desde = ini + args[i].length;
          } else env.v.set(p.nombre, p.def ? evaluar(p.def, env, run, mod) : undefined);
        });
        sql = evaluar(analizarCacheado(src, envoltura.plantilla.ini, envoltura.plantilla.fin), env, run, mod);
      } else {
        const fin = plantillaConPosiciones(src, pos).fin;

        sql = evaluar(analizarCacheado(src, pos, fin), res.env, run, mod);
      }

      return { alcanzado: true, sql, consumidas: run.consumidas, dominios: run.dominios, plantillas: run.plantillas };
    } catch (e) {
      if (e instanceof Aborto || e instanceof Retorno) return { alcanzado: false, consumidas: run.consumidas, dominios: run.dominios };
      if (e instanceof NoSoportado) return { alcanzado: true, sql: opaco("", null, `forma no interpretable: ${e.message}`), consumidas: run.consumidas, dominios: run.dominios, plantillas: run.plantillas };
      throw e;
    }
  };
  let ex;

  try { ex = explorarMundos(correr); } catch (e) { if (e instanceof NoSoportado) return { no: e.message, plantillas: plantillasVistas }; throw e; }
  for (const r of ex.alcanzados) for (const p of r.plantillas ?? []) plantillasVistas.add(p);
  if (!ex.alcanzados.length) return { no: "ningún recorrido del código alcanza la consulta", plantillas: plantillasVistas };
  const malo = ex.alcanzados.find((r) => esOpaco(r.sql) || typeof r.sql !== "string");

  if (malo) return { no: (malo.sql && malo.sql.motivo) || `valor de ejecución en el SQL: ${malo.sql && malo.sql.texto}`, plantillas: plantillasVistas };
  const v = [...new Set(ex.alcanzados.map((r) => r.sql))];

  if (v.length > MAX_VARIANTES) return { no: `más de ${MAX_VARIANTES} combinaciones`, plantillas: plantillasVistas };

  return { v, mundos: ex.alcanzados.length, corridas: ex.corridas, plantillas: plantillasVistas };
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
  const modulos = modulosDe(archivos, indice);
  const informe = {
    literales: { ok: 0, fallas: [] }, reconstruidas: { ok: 0, variantes: 0, fallas: [] }, reconstruidasPorArchivo: {},
    anfitrionas: { total: 0, ok: 0, variantes: 0 }, interpretadas: { ok: 0, variantes: 0 },
    fragmentos: { cubiertos: 0, sinAnfitrion: [], conAnfitrionaEnFalla: [] }, sugerencias: [], noVerificables: [], total: 0,
  };
  const usadas = new Set();

  for (const a of archivos) for (const pl of a.plantillas) for (const p of pl.partes) if (p.t === "expr") for (const m of p.v.matchAll(/\b([A-Za-z_]\w*)\b/g)) usadas.add(m[1]);

  const anfitrionOk = new Set();
  const pendientes = [];
  const candidataDe = (pl) => {
    const texto = bruto(pl.partes);

    // Una consulta que EMPIEZA con una interpolación (`${SELECT} WHERE …`) no parece SQL a simple vista: se la considera candidata por sus parámetros y cláusulas.
    // Marcador posicional fijo ($3) o calculado ($${n}, p. ej. «LIMIT $${params.length + 1}»): los dos indican una consulta parametrizada.
    return esSql(pl.partes) || (pl.partes.some((p) => p.t === "expr") && /\$(?:\d+\b|\$\{)/.test(texto) && /\b(WHERE|JOIN|VALUES|RETURNING|ORDER BY|GROUP BY|LIMIT)\b/i.test(texto));
  };
  /** PREPARE de cada variante; devuelve true si todas son válidas. Las fallas quedan en `alvo.fallas`. */
  const verificar = (ref, variantes, alvo, dinamica) => {
    let ok = true;

    for (const sql of variantes) {
      const res = preparar(sql);

      if (dinamica) informe.reconstruidas.variantes++;
      if (res.ok) continue;
      ok = false;
      // Una corrección hipotética (CORRECCIONES) NO convierte el SQL publicado en válido: la consulta sigue siendo FALLA hasta que el código se corrija; la sugerencia solo se informa.
      let sugerencia = null;

      for (const [ant, [nuevo, desc]] of Object.entries(CORRECCIONES)) {
        if (sql.includes(ant) && preparar(sql.replace(ant, nuevo)).ok) { sugerencia = desc; informe.sugerencias.push({ ...ref, desc }); break; }
      }
      if (!alvo.fallas.some((f) => f.id === ref.id && f.sql === normal(sql).slice(0, 160))) alvo.fallas.push({ ...ref, err: res.err, sql: normal(sql).slice(0, 160), sugerencia });
    }

    return ok;
  };
  const exito = (a, pl) => {
    informe.reconstruidas.ok++;
    informe.reconstruidasPorArchivo[a.archivo] = (informe.reconstruidasPorArchivo[a.archivo] ?? 0) + 1;
    for (const p of pl.partes) if (p.t === "expr") for (const m of p.v.matchAll(/\b([A-Za-z_]\w*)\b/g)) anfitrionOk.add("nombre:" + m[1]);
  };

  // 1) CONSULTAS ANFITRIONAS: plantillas pasadas a una envoltura de consulta (q(`…`, cteExtra, params) → `WITH ${cte}, ${cteExtra} ${sql}`). Se reconstruye la consulta COMPLETA
  //    que se ejecuta (CTE común + CTE de la vista + numeración de parámetros) interpretando la función en todos sus caminos; jamás se prepara el texto suelto que depende de un CTE.
  const llamadas = new Set();
  const consumo = new Map();   // "archivo@ini" de cada plantilla usada al armar anfitrionas → [{id, estado}]

  for (const a of archivos) {
    for (const env of envolturas(a)) {
      for (const pl of a.plantillas) {
        if (pl.ini === env.plantilla.ini || !new RegExp(`(?:^|[^\\w$.])${env.nombre}\\s*\\(\\s*$`).test(a.src.slice(Math.max(0, pl.ini - 80), pl.ini))) continue;
        const ref = { id: idDe(a.archivo, pl.partes), archivo: a.archivo, linea: pl.linea };
        const r = reconstruirPorInterprete(a, pl.ini, modulos, env);
        let estado;

        llamadas.add(`${a.archivo}@${pl.ini}`);
        informe.total++;
        informe.anfitrionas.total++;
        if (r.no) {
          estado = "nv";
          informe.noVerificables.push({ ...ref, motivo: `consulta anfitriona ${env.nombre}(…) no reconstruible: ${r.no}` });
        } else {
          informe.anfitrionas.variantes += r.v.length;
          estado = verificar(ref, r.v, informe.reconstruidas, true) ? "ok" : "falla";
          if (estado === "ok") { informe.anfitrionas.ok++; exito(a, pl); }
        }
        for (const k of r.plantillas ?? []) { if (!consumo.has(k)) consumo.set(k, []); consumo.get(k).push({ id: ref.id, estado }); }
      }
    }
  }

  // 2) Resto de las plantillas.
  for (const a of archivos) {
    const ctx = indice.porArchivo.get(a.archivo);

    for (const pl of a.plantillas) {
      const clave = `${a.archivo}@${pl.ini}`;

      if (llamadas.has(clave) || !candidataDe(pl)) continue;
      const crudo = esSql(pl.partes);
      const dinamica = pl.partes.some((p) => p.t === "expr");
      const texto = bruto(pl.partes);
      const id = idDe(a.archivo, pl.partes);
      const ref = { id, archivo: a.archivo, linea: pl.linea };

      // Fragmento de una consulta anfitriona (CTE de la vista, cuerpo de un CTE común…): cubierto SOLO si TODAS las anfitrionas que lo usan se verificaron.
      if (consumo.has(clave)) {
        const usos = consumo.get(clave);

        informe.total++;
        if (usos.every((u) => u.estado === "ok")) informe.fragmentos.cubiertos++;
        else if (usos.some((u) => u.estado === "falla")) informe.fragmentos.conAnfitrionaEnFalla.push({ ...ref, anfitrionas: usos.filter((u) => u.estado === "falla").map((u) => u.id) });
        else {
          informe.fragmentos.sinAnfitrion.push(ref);
          informe.noVerificables.push({ ...ref, motivo: "fragmento de consulta anfitriona sin consulta anfitriona verificada" });
        }
        continue;
      }
      if (pl.nombre && !pl.params && usadas.has(pl.nombre) && !dinamica) { informe.total++; pendientes.push({ ...ref, nombre: pl.nombre }); continue; }
      if (pl.params) continue;   // función auxiliar que devuelve texto SQL: se valida por quienes la usan

      let r = dinamica ? resolverPartes(pl.partes, ctx) : { v: [texto], tags: new Set() };
      let interpretada = false;

      // Unión de un arreglo LOCAL armado con push (cond.join(" AND ")): se reconstruye interpretando la función en todos sus caminos. Si el intérprete no puede, queda el motivo original.
      if (r.no && /\b[A-Za-z_$][\w$]*(?:\.map\([\s\S]*\))?\.join\(/.test(r.no)) {
        const ri = reconstruirPorInterprete(a, pl.ini, modulos);

        if (!ri.no) { r = { v: ri.v, tags: new Set() }; interpretada = true; }
      }
      // Resuelta pero el resultado no es SQL (p. ej. una lista de columnas o un filtro suelto): no es una consulta; no se cuenta. Si el intérprete la reconstruyó y es un CTE con nombre
      // (const cte = `par AS (…)`), es un FRAGMENTO: queda cubierto solo si una consulta anfitriona válida lo incrusta (nunca se prepara suelto).
      if (!crudo && !r.no && !r.v.some((x) => esSql([{ t: "txt", v: x }]))) {
        if (interpretada && pl.nombre) { informe.total++; pendientes.push({ ...ref, nombre: pl.nombre }); }
        continue;
      }
      informe.total++;
      if (r.no) { informe.noVerificables.push({ ...ref, motivo: r.no }); continue; }
      const ok = verificar(ref, r.v, dinamica ? informe.reconstruidas : informe.literales, dinamica);

      if (!dinamica) { if (ok) informe.literales.ok++; continue; }
      if (interpretada) informe.interpretadas.variantes += r.v.length;
      if (ok) { if (interpretada) informe.interpretadas.ok++; exito(a, pl); }
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
  console.log(`  ANFITRIONAS (consulta completa armada por envoltura, p. ej. q(…) con CTE común + CTE de la vista): ${informe.anfitrionas.ok}/${informe.anfitrionas.total} válidas / ${informe.anfitrionas.variantes} combinaciones PREPARE`);
  console.log(`  INTERPRETADAS (uniones de arreglos locales reconstruidas recorriendo la función): ${informe.interpretadas.ok} consultas / ${informe.interpretadas.variantes} combinaciones PREPARE`);
  console.log(`  FRAGMENTOS cubiertos por consultas anfitrionas: ${informe.fragmentos.cubiertos}   en anfitriona con FALLA: ${informe.fragmentos.conAnfitrionaEnFalla.length}`);
  console.log(`  NO VERIFICABLES: ${informe.noVerificables.length} (línea base: ${(base.noVerificables ?? []).length}; nuevas fuera de la línea base: ${v.nuevas.length}; obsoletas: ${v.obsoletas.length})${estatico ? "   [modo estático: sin PREPARE]" : ""}`);
  for (const c of informe.sugerencias) console.log(`  SUGERENCIA DE CORRECCIÓN (la consulta publicada sigue en FALLA)  ${c.archivo}:${c.linea}  ${c.desc}`);
  for (const f of [...informe.literales.fallas, ...informe.reconstruidas.fallas]) console.log(`  FALLA ${f.archivo}:${f.linea}  ${f.err}  [${f.sql}]`);
  for (const n of v.nuevas) console.log(`  NO VERIFICABLE NUEVA (no está en la línea base) ${n.archivo}:${n.linea}  ${n.motivo}`);
  for (const o of v.obsoletas) console.log(`  aviso: la línea base contiene una entrada que ya no existe: ${o}`);

  return v.ok ? 0 : 1;
}

module.exports = { escanear, leerPlantilla, resolverExpr, resolverPartes, analizar, veredicto, construirIndice, leerArchivos, nivelSuperior, bruto, esSql, idDe, reconstruirPorInterprete, envolturas, modulosDe, sentencias, analizarExpresion };

if (require.main === module) process.exit(main(process.argv.slice(2)));
