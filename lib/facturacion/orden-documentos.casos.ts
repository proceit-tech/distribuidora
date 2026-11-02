/**
 * PRO-333 (CASA MINGO, ETAPA 2) — Documentos electrónicos: la columna «Documento» ordena por el VALOR NUMÉRICO del número fiscal como criterio primario, en SQL y
 * ANTES de LIMIT/OFFSET. Lógica REAL probada: construirConsultas/normalizarConsulta (SQL generado como texto) y siguienteOrden (ciclo ASC → DESC → sin orden del encabezado).
 * PostgreSQL NO se ejecuta aquí: la semántica del ORDER BY se reproduce con un modelo en memoria que aplica las MISMAS claves que el SQL (grupo numérico/no numérico,
 * longitud sin ceros a la izquierda, dígitos byte a byte, texto exacto, establecimiento, punto, serie, tipo, fecha e id). La comprobación en la base real corresponde al responsable.
 * Casos ESCRITOS, NO EJECUTADOS en la entrega (restricción vigente: sin runner, lint, typecheck, build ni SQL).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { siguienteOrden } from "@/components/ui/lista-padrao/orden";
import { contador } from "@/lib/clientes/contador-casos";
import { numeroDocumento } from "@/lib/facturacion/estados";
import { construirConsultas, normalizarConsulta } from "@/lib/facturacion/shared";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const USUARIO = "99999999-9999-4999-8999-999999999999";
const SUC = "55555555-5555-4555-8555-555555555555";

type Doc = { id: string; tipo: string; establecimiento: string; puntoExpedicion: string; numero: string; serie: string | null; fecha: string };

/** Comparación byte a byte (COLLATE "C"). */
const c = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const NUM = /^[0-9]+$/;
const sinCeros = (n: string) => n.replace(/^0+/, "");

/**
 * Modelo del ORDER BY de PRO-333 (mismas claves y en el mismo orden que ORDEN_NUMERO + «d.id DESC» de construirConsultas). Los numéricos van SIEMPRE primero;
 * para los no numéricos las claves CASE son NULL (iguales entre sí) y deciden el texto y los desempates.
 */
function compararModelo(dir: "asc" | "desc") {
  const f = dir === "asc" ? 1 : -1;

  return (a: Doc, b: Doc) => {
    const na = NUM.test(a.numero);
    const nb = NUM.test(b.numero);

    if (na !== nb) return na ? -1 : 1;
    if (na) {
      const la = sinCeros(a.numero).length - sinCeros(b.numero).length;

      if (la !== 0) return f * Math.sign(la);
      const d = c(sinCeros(a.numero), sinCeros(b.numero));

      if (d !== 0) return f * d;
    }

    return (
      f * c(a.numero, b.numero) ||
      f * c(a.establecimiento, b.establecimiento) ||
      f * c(a.puntoExpedicion, b.puntoExpedicion) ||
      f * c(a.serie ?? "", b.serie ?? "") ||
      f * c(a.tipo, b.tipo) ||
      f * c(a.fecha, b.fecha) ||
      -c(a.id, b.id)
    );
  };
}

const ordenar = (docs: Doc[], dir: "asc" | "desc") => [...docs].sort(compararModelo(dir));
const doc = (id: string, numero: string, extra: Partial<Doc> = {}): Doc => ({ id, tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero, serie: null, fecha: "2026-11-01T10:00:00Z", ...extra });
const numeros = (docs: Doc[]) => docs.map((d) => d.numero);
const ids = (docs: Doc[]) => docs.map((d) => d.id);

export async function verificarCasosOrdenDocumentosPro333(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, v: boolean) => igual(nombre, v, true);

  // ── 1. SQL generado ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const desc = construirConsultas(EMPRESA, USUARIO, { orden: "numero", dir: "desc" }, 1).lista.sql;
  const asc = construirConsultas(EMPRESA, USUARIO, { orden: "numero", dir: "asc" }, 1).lista.sql;
  const orderBy = (sql: string) => sql.slice(sql.indexOf("ORDER BY"), sql.indexOf(" LIMIT "));

  igual("PRO333-01 DESC: el número numérico es el criterio PRIMARIO (antes de establecimiento/punto), luego desempates y cierre por id", orderBy(desc),
    `ORDER BY (d.numero !~ '^[0-9]+$') ASC, CASE WHEN d.numero ~ '^[0-9]+$' THEN length(ltrim(d.numero, '0')) END DESC, CASE WHEN d.numero ~ '^[0-9]+$' THEN ltrim(d.numero, '0') END COLLATE "C" DESC, d.numero COLLATE "C" DESC, d.establecimiento COLLATE "C" DESC, d.punto_expedicion COLLATE "C" DESC, coalesce(d.serie, '') COLLATE "C" DESC, d.tipo COLLATE "C" DESC, d.fecha_emision DESC, d.id DESC`);
  igual("PRO333-02 ASC: mismas claves en ASC; el grupo numérico/no numérico NO se invierte y el id sigue cerrando DESC", orderBy(asc),
    `ORDER BY (d.numero !~ '^[0-9]+$') ASC, CASE WHEN d.numero ~ '^[0-9]+$' THEN length(ltrim(d.numero, '0')) END ASC, CASE WHEN d.numero ~ '^[0-9]+$' THEN ltrim(d.numero, '0') END COLLATE "C" ASC, d.numero COLLATE "C" ASC, d.establecimiento COLLATE "C" ASC, d.punto_expedicion COLLATE "C" ASC, coalesce(d.serie, '') COLLATE "C" ASC, d.tipo COLLATE "C" ASC, d.fecha_emision ASC, d.id DESC`);
  cierto("PRO333-03 sin cast peligroso: el número TEXT nunca se convierte a int/bigint/numeric ni se regraba (solo SELECT)", ![desc, asc].some((s) => /numero\s*::|CAST\s*\(\s*d\.numero|to_number\s*\(\s*d\.numero|UPDATE\s/i.test(s)));
  cierto("PRO333-04 el ORDER BY va ANTES de LIMIT/OFFSET en la MISMA consulta (orden sobre todo el conjunto filtrado, no sobre la página)", [desc, asc].every((s) => /ORDER BY [^]*d\.id DESC LIMIT \$3 OFFSET \$4$/.test(s) && s.indexOf("ORDER BY") < s.indexOf("LIMIT")));
  igual("PRO333-05 sin selección se mantiene el orden por fecha de emisión descendente (por defecto)", [/ORDER BY d\.fecha_emision DESC, d\.id DESC LIMIT/.test(construirConsultas(EMPRESA, USUARIO, {}, 1).lista.sql), /d\.numero/.test(orderBy(construirConsultas(EMPRESA, USUARIO, {}, 1).lista.sql))], [true, false]);
  igual("PRO333-06 las demás columnas no cambian (fecha, cliente, total, estado)", ["fecha", "cliente", "total", "estado"].map((o) => orderBy(construirConsultas(EMPRESA, USUARIO, { orden: o, dir: "asc" }, 1).lista.sql)),
    ["ORDER BY d.fecha_emision ASC, d.id DESC", "ORDER BY d.receptor_nombre ASC, d.id DESC", "ORDER BY d.total ASC, d.id DESC", "ORDER BY d.estado_sifen ASC, d.id DESC"]);

  const conFiltros = construirConsultas(EMPRESA, USUARIO, { q: "9001", tipo: "NCE", sucursal: SUC, estadoSifen: "APROBADO", grupo: "APROBADO", desde: "2026-10-01", hasta: "2026-11-02", orden: "numero", dir: "desc", tamano: 20 }, 3);

  cierto("PRO333-07 filtros, empresa/usuario de sesión y alcance de sucursal intactos con orden por número (conteo y lista)",
    conFiltros.lista.params[0] === EMPRESA && conFiltros.lista.params[1] === USUARIO && [conFiltros.conteo.sql, conFiltros.lista.sql].every((s) => /d\.empresa_id = \$1 AND sucursal_en_alcance\(\$1::uuid, \$2::uuid, d\.sucursal_id\)/.test(s) && /d\.tipo = \$3/.test(s) && /d\.sucursal_id = \$4/.test(s) && /ILIKE \$\d+ ESCAPE '!'/.test(s)));
  igual("PRO333-08 paginación: página 3 de 20 → LIMIT 20 OFFSET 40; el conteo no lleva ORDER BY", [conFiltros.lista.params.slice(-2), /ORDER BY/.test(conFiltros.conteo.sql)], [[20, 40], false]);
  igual("PRO333-09 normalización: «numero» y la dirección se aceptan; dirección desconocida = desc; orden con inyección se descarta", [normalizarConsulta({ orden: "numero", dir: "asc" }).orden, normalizarConsulta({ orden: "numero", dir: "asc" }).dir, normalizarConsulta({ orden: "numero", dir: "x" }).dir, normalizarConsulta({ orden: "numero; DROP TABLE x" }).orden], ["numero", "asc", "desc", ""]);

  // ── 2. Modelo del ORDER BY (lo que PostgreSQL devuelve) ─────────────────────────────────────────────────────────────────────────────────────────────
  const casoMingo = [doc("a", "0090006"), doc("b", "0090005", { establecimiento: "002" }), doc("c", "0090004", { establecimiento: "002" }), doc("d", "0090015"), doc("e", "0090014", { puntoExpedicion: "003" })];

  igual("PRO333-10 DESC del cliente: 90015, 90014, 90006, 90005, 90004 aunque cambien establecimiento/punto (antes: 002-… arriba por texto)", numeros(ordenar(casoMingo, "desc")), ["0090015", "0090014", "0090006", "0090005", "0090004"]);
  igual("PRO333-11 ASC: exactamente lo inverso", numeros(ordenar(casoMingo, "asc")), ["0090004", "0090005", "0090006", "0090014", "0090015"]);
  igual("PRO333-12 número corto vs largo (sin ceros a la izquierda): 9004 < 90004 < 90015 numéricamente, no lexicográficamente", numeros(ordenar([doc("a", "90015"), doc("b", "9004"), doc("c", "90004"), doc("d", "100"), doc("e", "99")], "asc")), ["99", "100", "9004", "90004", "90015"]);
  igual("PRO333-13 con y sin ceros a la izquierda se ordenan por valor y se devuelven SIN alterar (presentación con ceros)", numeros(ordenar([doc("a", "0009004"), doc("b", "90015"), doc("c", "0000007"), doc("d", "0090004")], "desc")), ["90015", "0090004", "0009004", "0000007"]);
  igual("PRO333-14 mismo valor con distinta cantidad de ceros: desempate determinista por el texto exacto", numeros(ordenar([doc("a", "7"), doc("b", "0000007"), doc("c", "007")], "asc")), ["0000007", "007", "7"]);
  igual("PRO333-15 cero y ceros: 0000000 es el menor valor", numeros(ordenar([doc("a", "0000001"), doc("b", "0000000"), doc("c", "0000010")], "asc")), ["0000000", "0000001", "0000010"]);

  const empate = [
    doc("e1", "0000100", { establecimiento: "002" }), doc("e2", "0000100", { puntoExpedicion: "002" }), doc("e3", "0000100", { serie: "AB" }),
    doc("e4", "0000100", { tipo: "NCE" }), doc("e5", "0000100", { fecha: "2026-11-02T10:00:00Z" }), doc("e6", "0000100"), doc("e7", "0000100"),
  ];

  igual("PRO333-16 empate de número: desempata establecimiento, punto, serie (NULL = ''), tipo, fecha y por último id DESC (ASC)", ids(ordenar(empate, "asc")), ["e7", "e6", "e5", "e4", "e3", "e2", "e1"]);
  igual("PRO333-17 empate de número en DESC: desempates invertidos, id DESC fijo", ids(ordenar(empate, "desc")), ["e1", "e2", "e3", "e4", "e5", "e7", "e6"]);
  igual("PRO333-18 el orden es total y estable: el resultado no depende del orden de entrada", [ids(ordenar([...empate].reverse(), "asc")), ids(ordenar([...casoMingo].reverse(), "desc"))], [ids(ordenar(empate, "asc")), ids(ordenar(casoMingo, "desc"))]);
  igual("PRO333-19 no numérico (hoy imposible por CHECK NEX-047) siempre DESPUÉS de los numéricos en ASC y DESC, entre sí por texto", [numeros(ordenar([doc("a", "X1"), doc("b", "5"), doc("c", "A-2"), doc("d", "12")], "asc")), numeros(ordenar([doc("a", "X1"), doc("b", "5"), doc("c", "A-2"), doc("d", "12")], "desc"))], [["5", "12", "A-2", "X1"], ["12", "5", "X1", "A-2"]]);

  const muchos = Array.from({ length: 45 }, (_, i) => doc(`id${String(i).padStart(2, "0")}`, String(90000 + ((i * 37) % 45)).padStart(7, "0"), { establecimiento: i % 2 ? "001" : "002" }));
  const completo = ordenar(muchos, "desc");
  const paginas = [0, 1, 2].map((p) => completo.slice(p * 20, p * 20 + 20));

  igual("PRO333-20 paginación sobre el conjunto ordenado completo: 3 páginas (20/20/5) sin huecos ni repetidos y la página 2 continúa la 1", [paginas.map((p) => p.length), new Set(paginas.flat().map((d) => d.id)).size, paginas[0][19].numero > paginas[1][0].numero, numeros(paginas[0]).slice(0, 3)], [[20, 20, 5], 45, true, ["0090044", "0090043", "0090042"]]);

  // ── 3. Pantalla y presentación (sin cambios) ────────────────────────────────────────────────────────────────────────────────────────────────────────
  const pagina = leer("app/(private)/documentos/page.tsx");

  cierto("PRO333-21 el encabezado «Documento» envía orden=numero y dir a la API (orden en el servidor, sin ordenar en el cliente)", /<ThOrdenable titulo="Documento" campo="numero" orden=\{orden\} onOrden=\{cambiarOrden\} \/>/.test(pagina) && /orden: orden\?\.campo \?\? "", dir: orden\?\.dir \?\? ""/.test(pagina) && !/ordenarLista/.test(pagina));
  igual("PRO333-22 ciclo del encabezado: sin orden → ASC → DESC → sin orden (vuelve a fecha por defecto)", [siguienteOrden(null, "numero"), siguienteOrden({ campo: "numero", dir: "asc" }, "numero"), siguienteOrden({ campo: "numero", dir: "desc" }, "numero")], [{ campo: "numero", dir: "asc" }, { campo: "numero", dir: "desc" }, null]);
  igual("PRO333-23 presentación del número conserva los ceros (001-001-0090015 (AB))", numeroDocumento({ establecimiento: "001", puntoExpedicion: "001", numero: "0090015", serie: "AB" }), "001-001-0090015 (AB)");
  cierto("PRO333-24 la API sigue pasando orden/dir crudos a leerDocumentos (normalizados en el servidor)", /orden: p\.get\("orden"\) \?\? undefined/.test(leer("app/api/documentos/route.ts")) && /dir: p\.get\("dir"\) \?\? undefined/.test(leer("app/api/documentos/route.ts")));

  return fallos;
}
