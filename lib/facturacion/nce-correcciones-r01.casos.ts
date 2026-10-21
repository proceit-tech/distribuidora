/**
 * AUD E06-E07-E08-R01 → PRO-210 (Restaurar conserva lo digitado) y PRO-211 (el listado de facturas elegibles descuenta los DESCUENTO aprobados). Sin PostgreSQL: el SQL del listado se verifica por su
 * texto y por las consultas que emite; la lógica de «Restaurar» es estado puro.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { listarFacturasElegibles } from "@/lib/facturacion/nce";
import { eliminarSeleccionadas, entradasIniciales, restaurarEntradas, type EntradaLinea } from "@/lib/facturacion/nce-entradas";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");
const U = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export async function verificarCasosNceCorreccionesR01(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── PRO-210: Restaurar ─────────────────────────────────────────────────────────────────────────
  const lineas = [{ linea: 1, agotada: false, cantidadDisponible: "5" }, { linea: 2, agotada: false, cantidadDisponible: "3" }, { linea: 3, agotada: false, cantidadDisponible: "1" }];
  const editadas: Record<number, EntradaLinea> = { ...entradasIniciales(lineas, 2), 1: { incluida: true, valor: "2" }, 3: { incluida: true, valor: "0,5" } };
  const tras = eliminarSeleccionadas(lineas, new Set(), new Set([1, 3]));

  igual("PRO210 la eliminación no toca los valores digitados", [editadas[1].valor, editadas[3].valor], ["2", "0,5"]);

  const r = restaurarEntradas(editadas, tras.eliminadas, lineas, 2);

  igual("PRO210 Devolución: cantidad 5 → editada a 2 → eliminar → restaurar CONSERVA 2 (y 0,5); la línea no eliminada queda intacta", [r[1].valor, r[3].valor, r[2].valor], ["2", "0,5", "3"]);
  igual("PRO210 motivo por monto: 1000 → eliminar → restaurar conserva 1000 y el valor vacío sigue vacío", (() => {
    const e: Record<number, EntradaLinea> = { 1: { incluida: true, valor: "1000" }, 2: { incluida: false, valor: "" } };
    const x = restaurarEntradas(e, new Set([1, 2]), lineas, 3);

    return [x[1].valor, x[2].valor];
  })(), ["1000", ""]);
  igual("PRO210 solo una línea SIN entrada (precarga especial) recibe su valor inicial; no se pisa ninguna otra", (() => {
    const x = restaurarEntradas({ 2: { incluida: true, valor: "1" } }, new Set([1, 2]), lineas, 2);

    return [x[1].valor, x[2].valor];
  })(), ["5", "1"]);
  igual("PRO210 no muta el estado anterior y restaurar sin eliminadas devuelve lo mismo", [editadas[1].valor, JSON.stringify(restaurarEntradas(editadas, new Set(), lineas, 2)) === JSON.stringify(editadas)], ["2", true]);

  const pagina = leer("app/(private)/notas-credito/page.tsx");

  cierto("PRO210 la pantalla usa restaurarEntradas (ya no recalcula los valores iniciales) y sigue invalidando la revisión", /restaurarEntradas\(p, eliminadas, factura\.lineas, motivo\)/.test(pagina) && !/const base = entradasIniciales\(factura\.lineas, motivo\); const n = \{ \.\.\.p \}/.test(pagina) && /setEliminadas\(new Set\(\)\); setRevisado\(null\)/.test(pagina));

  // ── PRO-211: saldo del listado ─────────────────────────────────────────────────────────────────
  function bd(existe: boolean, filas: Array<Record<string, unknown>> = []) {
    const consultas: Array<{ sql: string; p: unknown[] }> = [];
    const db = {
      async query(sql: string, p: unknown[] = []) {
        consultas.push({ sql, p });
        if (/to_regclass/.test(sql)) return { rows: [{ ok: existe }] };

        return { rows: filas };
      },
    };

    return { db: db as never, consultas };
  }
  const fila = (id: string, saldo: string) => ({ id, numero: "001-001-0000001", cdc: "0".repeat(44), fecha_emision: "2026-10-16T12:00:00Z", moneda: "PYG", total: "100000", receptor_nombre: "X", saldo, pendiente: false, total_filas: 3 });

  const con = bd(true, [fila(U, "40000")]);
  const rc = await listarFacturasElegibles(con.db, U, U, { clienteId: U, pagina: 3, porPagina: 5 });
  const sqlCon = con.consultas.find((c) => /WITH base/.test(c.sql))!;
  const sinNd = bd(false, [fila(U, "100000")]);

  await listarFacturasElegibles(sinNd.db, U, U, { clienteId: U });

  const sqlSin = sinNd.consultas.find((c) => /WITH base/.test(c.sql))!.sql;
  const acred = sqlCon.sql.slice(sqlCon.sql.indexOf("AS acreditado") - 700, sqlCon.sql.indexOf("AS acreditado"));

  cierto("PRO211 con NEX-070 el saldo descuenta nce_descuentos de NCE APROBADAS de la MISMA empresa y FE (además de nce_lineas aprobadas)", /FROM nce_lineas nl/.test(acred) && /FROM nce_descuentos nd JOIN documentos_electronicos nd_n/.test(acred) && /nd\.empresa_id = d\.empresa_id AND nd\.fe_id = d\.id AND nd_n\.estado_sifen = 'APROBADO'/.test(acred) && /nn\.estado_sifen = 'APROBADO'\) \+ \(SELECT/.test(acred));
  cierto("PRO211 una NCE pendiente, indeterminada o rechazada no consume saldo (ambos términos exigen estado_sifen = APROBADO) y la pendiente solo marca el bloqueo", (sqlCon.sql.match(/estado_sifen = 'APROBADO'/g) ?? []).length === 3 && /AS pendiente/.test(sqlCon.sql));
  cierto("PRO211 una FE con saldo global agotado no es elegible: el filtro sigue siendo original − acreditado > 0 sobre el acreditado ampliado", /FROM base WHERE original - acreditado > 0/.test(sqlCon.sql));
  igual("PRO211 sin NEX-070 (la tabla no existe) el SQL conserva el cálculo anterior y NO nombra nce_descuentos", [/nce_descuentos/.test(sqlSin), /FROM nce_lineas nl/.test(sqlSin), /original - acreditado > 0/.test(sqlSin)], [false, true, true]);
  igual("PRO211 la comprobación de la tabla es to_regclass (nunca SQL sobre una tabla inexistente) y ocurre antes de la consulta principal", [con.consultas[0].sql.includes("to_regclass('public.nce_descuentos')"), con.consultas.findIndex((c) => /to_regclass/.test(c.sql)) < con.consultas.findIndex((c) => /WITH base/.test(c.sql))], [true, true]);
  igual("PRO211 paginación y filtros intactos: página 3 de 5 → LIMIT 5 OFFSET 10, empresa/usuario/cliente como parámetros; total de páginas desde el total de filas", [sqlCon.p[0], sqlCon.p[2], sqlCon.p[5], sqlCon.p[6], rc.pagina, rc.totalPaginas, rc.total], [U, U, 5, 10, 3, 1, 3]);
  igual("PRO211 el saldo visible es el calculado por la consulta (parcial 40.000 de 100.000) y solo se listan filas con saldo", [rc.facturas.map((f) => f.saldo), rc.facturas.length], [["40000"], 1]);
  igual("PRO211 sin filas (todas agotadas por líneas y/o DESCUENTO) el listado queda vacío", await (async () => { const x = await listarFacturasElegibles(bd(true, []).db, U, U, { clienteId: U }); return [x.facturas.length, x.total]; })(), [0, 0]);

  // misma definición que el motor de preparación (leerFacturaOriginal) y NEX-070
  const nce = leer("lib/facturacion/nce.ts");
  const sql70 = leer("documentacao/banco/nexit/v1/migraciones/NEX-070-facturacion-nce-descuento.sql");

  cierto("PRO211 la definición de saldo global coincide con leerFacturaOriginal y con NEX-070 (líneas aprobadas + DESCUENTO aprobados)", /descuentosAcreditados\(db, empresaId, feId\)/.test(nce) && /n\.estado_sifen = 'APROBADO'/.test(nce) && /v_usado_glob \+ v_suma > v_fe_total/.test(sql70) && /nd\.fe_id = p_fe AND n\.estado_sifen = 'APROBADO'/.test(sql70));

  return fallos;
}
