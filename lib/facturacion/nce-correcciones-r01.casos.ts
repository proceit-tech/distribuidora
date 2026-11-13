/**
 * AUD E06-E07-E08-R01 → PRO-210 (Restaurar conserva lo digitado) y PRO-211 (saldo global con DESCUENTO).
 * Las pruebas ejecutan la lógica REAL que usa el código: restaurarEntradas / eliminarSeleccionadas / armarCuerpoNce / cuerpoRevisadoVigente (la pantalla las usa tal cual) y saldoGlobalFe (la regla
 * que usa leerFacturaOriginal y que replican el listado SQL y NEX-070). El SQL del listado NO se ejecuta aquí (sin PostgreSQL): se verifica por las consultas que emite y por su texto; el saldo real con
 * datos queda para la homologación humana.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { listarFacturasElegibles, saldoGlobalFe } from "@/lib/facturacion/nce";
import { armarCuerpoNce, cuerpoRevisadoVigente, eliminadasPorPrecarga, eliminarSeleccionadas, entradasIniciales, restaurarEntradas, type EntradaLinea, type EstadoCuerpoNce } from "@/lib/facturacion/nce-entradas";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");
const U = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const U2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

export async function verificarCasosNceCorreccionesR01(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── PRO-210: Restaurar ─────────────────────────────────────────────────────────────────────────
  const lineas = [{ linea: 1, agotada: false, cantidadDisponible: "5" }, { linea: 2, agotada: false, cantidadDisponible: "3" }, { linea: 3, agotada: false, cantidadDisponible: "1" }];
  const estado = (motivo: number, entradas: Record<number, EntradaLinea>, eliminadas: Set<number> = new Set()): EstadoCuerpoNce => ({ facturaId: U, lineas, motivo, sucursalId: U, puntoId: U, observacion: "", entradas, eliminadas, descuento: null, nonce: "n1" });
  const valoresEnCuerpo = (e: EstadoCuerpoNce) => (armarCuerpoNce(e)?.lineas ?? []).map((l) => [l.linea, "cantidad" in l ? l.cantidad : l.monto]);

  /** Flujo completo de la pantalla: eliminar las marcadas y luego «Restaurar» (misma secuencia de funciones que los manejadores). */
  const eliminarYRestaurar = (e: EstadoCuerpoNce, marcadas: number[]) => {
    const t = eliminarSeleccionadas(e.lineas, e.eliminadas, new Set(marcadas));
    const eliminado = { ...e, eliminadas: t.eliminadas };
    const restaurado = { ...eliminado, entradas: restaurarEntradas(eliminado.entradas, eliminado.eliminadas, e.lineas, e.motivo), eliminadas: new Set<number>() };

    return { eliminado, restaurado };
  };

  // A: 5 → 2
  {
    const e0 = estado(2, { ...entradasIniciales(lineas, 2), 1: { incluida: true, valor: "2" } });
    const { eliminado, restaurado } = eliminarYRestaurar(e0, [1]);

    igual("PRO210-A Devolución 5 → 2 → eliminar: la línea sale del cuerpo; restaurar: vuelve con 2 (no 5) y las otras líneas siguen igual", [valoresEnCuerpo(eliminado), valoresEnCuerpo(restaurado)], [[[2, "3"], [3, "1"]], [[1, "2"], [2, "3"], [3, "1"]]]);
    igual("PRO210-A tras eliminar y restaurar sin más cambios el cuerpo es idéntico al original (misma clave de idempotencia)", JSON.stringify(armarCuerpoNce(restaurado)), JSON.stringify(armarCuerpoNce(e0)));
  }
  // B: fracción con coma
  {
    const e0 = estado(2, { ...entradasIniciales(lineas, 2), 1: { incluida: true, valor: "2,5" } });
    const { restaurado } = eliminarYRestaurar(e0, [1]);

    igual("PRO210-B 2,5 se conserva sin alterar la precisión (texto digitado intacto y cantidad normalizada «2.5» en el cuerpo)", [restaurado.entradas[1].valor, valoresEnCuerpo(restaurado)[0]], ["2,5", [1, "2.5"]]);
  }
  // C: monto por línea
  {
    const e0 = estado(3, { 1: { incluida: true, valor: "1000" }, 2: { incluida: false, valor: "" }, 3: { incluida: false, valor: "" } });
    const { eliminado, restaurado } = eliminarYRestaurar(e0, [1]);

    igual("PRO210-C Descuento por línea: 1.000 → eliminar → restaurar conserva 1.000 (la línea sale del cuerpo mientras está eliminada)", [valoresEnCuerpo(eliminado), valoresEnCuerpo(restaurado)], [[], [[1, "1000"]]]);
  }
  // D: dos líneas editadas, una eliminada
  {
    const e0 = estado(2, { ...entradasIniciales(lineas, 2), 1: { incluida: true, valor: "2" }, 2: { incluida: true, valor: "1,5" } });
    const { eliminado, restaurado } = eliminarYRestaurar(e0, [2]);

    igual("PRO210-D dos líneas editadas, se elimina solo la 2: la 1 queda intacta durante y después; la 2 restaurada mantiene 1,5", [valoresEnCuerpo(eliminado)[0], restaurado.entradas[1].valor, restaurado.entradas[2].valor, restaurado.entradas[3].valor], [[1, "2"], "2", "1,5", "1"]);
  }
  // E: corrección de NCE rechazada (precarga: solo la línea 1 con 2 y la 2 con 1,5; la 3 queda eliminada)
  {
    const precarga = [{ linea: 1, cantidad: "2", monto: "0" }, { linea: 2, cantidad: "1.5", monto: "0" }];
    const entradas: Record<number, EntradaLinea> = {};

    for (const l of lineas) { const p = precarga.find((x) => x.linea === l.linea); entradas[l.linea] = { incluida: !!p, valor: p ? p.cantidad : "" }; }

    const eliminadas0 = eliminadasPorPrecarga(lineas, 2, precarga);
    const e0 = estado(2, entradas, eliminadas0);
    const { restaurado } = eliminarYRestaurar(e0, [1]);

    igual("PRO210-E corrección de NCE rechazada: la línea 3 queda eliminada por la precarga; eliminar y restaurar la 1 conserva sus valores precargados y no toca la 2", [[...eliminadas0], valoresEnCuerpo(e0), valoresEnCuerpo({ ...restaurado, eliminadas: eliminadas0 })], [[3], [[1, "2"], [2, "1.5"]], [[1, "2"], [2, "1.5"]]]);

    // restaurar también la 3 (sin valor precargado): recibe su valor inicial, sin pisar las demás
    const todas = restaurarEntradas(entradas, new Set([1, 2, 3]), lineas, 2);

    igual("PRO210-E restaurar una línea que la precarga había dejado vacía le da su valor inicial (saldo) y no pisa las precargadas", [todas[1].valor, todas[2].valor, todas[3].valor], ["2", "1.5", ""]);
  }
  // F: invalidación de la revisión
  {
    const e0 = estado(2, { ...entradasIniciales(lineas, 2), 1: { incluida: true, valor: "2" } });
    const revisado = armarCuerpoNce(e0);
    const { eliminado, restaurado } = eliminarYRestaurar(e0, [1]);

    igual("PRO210-F tras eliminar, el cuerpo revisado ya NO es vigente (Emitir se bloquea y exige revisar de nuevo); sin cambios sí lo es; con revisión nula nunca", [cuerpoRevisadoVigente(revisado, armarCuerpoNce(eliminado)), cuerpoRevisadoVigente(revisado, armarCuerpoNce(e0)), cuerpoRevisadoVigente(null, armarCuerpoNce(e0))], [false, true, false]);
    igual("PRO210-F una cantidad editada después de restaurar también invalida la revisión", cuerpoRevisadoVigente(revisado, armarCuerpoNce({ ...restaurado, entradas: { ...restaurado.entradas, 1: { incluida: true, valor: "3" } } })), false);

    const pagina = leer("app/(private)/notas-credito/page.tsx");

    cierto("PRO210-F la pantalla invalida la revisión previa al eliminar y al restaurar, y Emitir compara con cuerpoRevisadoVigente", /setEliminadas\(r\.eliminadas\); setMarcadas\(r\.seleccion\); setRevisado\(null\)/.test(pagina) && /setEntradas\(\(p\) => restaurarEntradas\(p, eliminadas, factura\.lineas, motivo\)\);\s*setEliminadas\(new Set\(\)\); setRevisado\(null\)/.test(pagina) && /!cuerpoRevisadoVigente\(c, cuerpo\(\)\)/.test(pagina));
  }

  // ── PRO-211: saldo global ──────────────────────────────────────────────────────────────────────
  const T = ["100000"];
  const L = (monto: string, estadoSifen = "APROBADO") => ({ tipo: "LINEA" as const, monto, estadoSifen });
  const D = (monto: string, estadoSifen = "APROBADO") => ({ tipo: "DESCUENTO" as const, monto, estadoSifen });

  igual("PRO211-A FE sin NCE: saldo 100.000 (elegible)", saldoGlobalFe(T, []), "100000");
  igual("PRO211-B NCE por línea aprobada de 30.000: saldo 70.000", saldoGlobalFe(T, [L("30000")]), "70000");
  igual("PRO211-C DESCUENTO parcial aprobado de 25.000: saldo 75.000", saldoGlobalFe(T, [D("25000")]), "75000");
  igual("PRO211-D DESCUENTO total aprobado de 100.000: saldo 0 (la FE deja de ser elegible)", saldoGlobalFe(T, [D("100000")]), "0");
  igual("PRO211-E créditos combinados (línea 30.000 + DESCUENTO 20.000): saldo 50.000", saldoGlobalFe(T, [L("30000"), D("20000")]), "50000");
  igual("PRO211-F/G NCE pendiente, indeterminada, rechazada o cancelada NO consumen saldo", saldoGlobalFe(T, [L("30000", "PENDIENTE"), D("50000", "RECHAZADO"), D("10000", "SIN_CONSULTA"), L("5000", "CANCELADO")]), "100000");
  igual("PRO211 solo cuenta lo aprobado cuando se mezclan estados (aprobada 30.000 + pendiente 50.000 + rechazada 20.000)", saldoGlobalFe(T, [L("30000"), D("50000", "PENDIENTE"), L("20000", "RECHAZADO")]), "70000");
  igual("PRO211 aritmética exacta sin flotantes (0,1 + 0,2 de USD) y nunca negativo", [saldoGlobalFe(["0.3"], [L("0.1"), L("0.2")]), saldoGlobalFe(["10.5000"], [D("10.5")]), saldoGlobalFe(T, [D("100000"), D("1")])], ["0", "0", "0"]);
  igual("PRO211 varias líneas originales suman su total y los decimales USD se conservan", saldoGlobalFe(["10.25", "20.5"], [L("5.125")]), "25.625");

  // Listado: consultas emitidas (sin PostgreSQL)
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
  const fila = (id: string, saldo: string, total = 3) => ({ id, numero: "001-001-0000001", cdc: "0".repeat(44), fecha_emision: "2026-10-16T12:00:00Z", moneda: "PYG", total: "100000", receptor_nombre: "X", saldo, pendiente: false, total_filas: total });

  const con = bd(true, [fila(U, "40000")]);
  const rc = await listarFacturasElegibles(con.db, U, U2, { clienteId: U, q: "001-001-0000001", pagina: 3, porPagina: 5 });
  const sqlCon = con.consultas.find((c) => /WITH base/.test(c.sql))!;
  const sinNd = bd(false, [fila(U, "100000")]);

  await listarFacturasElegibles(sinNd.db, U, U2, { clienteId: U });

  const sqlSin = sinNd.consultas.find((c) => /WITH base/.test(c.sql))!.sql;
  const acred = sqlCon.sql.slice(sqlCon.sql.indexOf("AS acreditado") - 700, sqlCon.sql.indexOf("AS acreditado"));

  cierto("PRO211 el SQL del listado descuenta nce_lineas Y nce_descuentos de NCE APROBADAS de la misma empresa y FE (misma definición que saldoGlobalFe y NEX-070)", /FROM nce_lineas nl/.test(acred) && /FROM nce_descuentos nd JOIN documentos_electronicos nd_n/.test(acred) && /nd\.empresa_id = d\.empresa_id AND nd\.fe_id = d\.id AND nd_n\.estado_sifen = 'APROBADO'/.test(acred) && /nn\.estado_sifen = 'APROBADO'\) \+ \(SELECT/.test(acred) && (sqlCon.sql.match(/estado_sifen = 'APROBADO'/g) ?? []).length === 3);
  cierto("PRO211-D el filtro de elegibilidad y el conteo salen del acreditado ampliado (saldo > 0) y la NCE pendiente solo marca el bloqueo", /FROM base WHERE original - acreditado > 0/.test(sqlCon.sql) && /count\(\*\) OVER\(\) AS total_filas/.test(sqlCon.sql) && /AS pendiente/.test(sqlCon.sql));
  igual("PRO211-H sin NEX-070 la tabla se detecta con to_regclass ANTES de la consulta y el SQL no nombra nce_descuentos (no puede fallar por tabla inexistente) pero conserva el cálculo anterior", [con.consultas[0].sql.includes("to_regclass('public.nce_descuentos')"), /nce_descuentos/.test(sqlSin), /FROM nce_lineas nl/.test(sqlSin), /original - acreditado > 0/.test(sqlSin)], [true, false, true, true]);
  igual("PRO211-I aislamiento y filtros: empresa, usuario (alcance de sucursal), cliente, búsqueda, LIMIT/OFFSET (página 3 de 5 → 10) siguen como parámetros; total de páginas desde total_filas", [sqlCon.p[0], sqlCon.p[1], sqlCon.p[2], sqlCon.p[3], sqlCon.p[5], sqlCon.p[6], rc.pagina, rc.totalPaginas, rc.total], [U, U2, U, "001-001-0000001", 5, 10, 3, 1, 3]);
  cierto("PRO211-I el aislamiento por sucursal y empresa permanece en el SQL (sucursal_en_alcance, d.empresa_id = $1) y el orden sigue siendo más recientes primero", /d\.empresa_id = \$1/.test(sqlCon.sql) && /sucursal_en_alcance\(\$1::uuid, \$2::uuid, d\.sucursal_id\)/.test(sqlCon.sql) && /ORDER BY fecha_emision DESC, id DESC LIMIT \$6 OFFSET \$7/.test(sqlCon.sql));
  igual("PRO211 el saldo visible es el calculado por la consulta (parcial 40.000 de 100.000); sin filas (todas agotadas por líneas y/o DESCUENTO) el listado queda vacío", [rc.facturas.map((f) => f.saldo), (await (async () => { const x = await listarFacturasElegibles(bd(true, []).db, U, U2, { clienteId: U }); return [x.facturas.length, x.total]; })())], [["40000"], [0, 0]]);
  cierto("PRO211 el motor de preparación y el detalle usan saldoGlobalFe (una sola regla) y NEX-070 resta los mismos créditos", /saldoGlobalFe\(originales\.map/.test(leer("lib/facturacion/nce.ts")) && /v_usado_glob \+ v_suma > v_fe_total/.test(leer("documentacao/banco/nexit/v1/migraciones/NEX-070-facturacion-nce-descuento.sql")));

  return fallos;
}
