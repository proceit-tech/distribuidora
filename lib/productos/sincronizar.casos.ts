/**
 * Regresión PRD-AUD-01: las dos fases de la sincronización (eliminarHijos + guardarHijos) ejecutadas JUNTAS contra una base simulada
 * con estado (las filas borradas desaparecen de verdad), incluyendo aislamiento multiempresa, referencias y transacciones secuenciales
 * con datos obsoletos (lo que ocurre tras un bloqueo FOR UPDATE del producto).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { ErrorValidacion } from "@/lib/productos/errores";
import { normalizarProducto } from "@/lib/productos/normalizar";
import { eliminarHijos, guardarHijos } from "@/lib/productos/sincronizar";

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const OTRA = "44444444-4444-4444-8444-444444444444";
const PROD = "22222222-2222-4222-8222-222222222222";
const USUARIO = "33333333-3333-4333-8333-333333333333";
const U1 = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const U2 = "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2";
const U3 = "a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3";
const C1 = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";

type Fila = Record<string, unknown>;
type Db = Record<string, Fila[]>;

/** Base simulada con estado: SELECT FOR UPDATE / DELETE / UPDATE / INSERT filtrados por (id, dueño, empresa). */
function baseSimulada(db: Db, bloqueadas: Record<string, string> = {}) {
  const registro: string[] = [];
  let nuevo = 0;
  const conexion = {
    async query(sql: string, p: unknown[] = []) {
      registro.push(sql.trim().split(/\s+/).slice(0, 4).join(" "));

      const sel = /FROM (producto_\w+) t WHERE (producto_id|producto_kit_id) = \$1 AND empresa_id = \$2 FOR UPDATE/.exec(sql);

      if (sel) {
        const filas = (db[sel[1]] ?? []).filter((f) => f[sel[2]] === p[0] && f.empresa_id === p[1]);

        return { rows: filas.map((f) => ({ fila: { ...f } })), rowCount: filas.length };
      }

      const del = /^\s*DELETE FROM (producto_\w+) WHERE id = \$1 AND (producto_id|producto_kit_id) = \$2 AND empresa_id = \$3/.exec(sql);

      if (del) {
        if (bloqueadas[String(p[0])]) throw Object.assign(new Error("referenciada"), { code: bloqueadas[String(p[0])] });

        const antes = db[del[1]].length;

        db[del[1]] = db[del[1]].filter((f) => !(f.id === p[0] && f[del[2]] === p[1] && f.empresa_id === p[2]));

        return { rows: [], rowCount: antes - db[del[1]].length };
      }

      const upd = /^\s*UPDATE (producto_\w+) SET [\s\S]* WHERE id = \$1 AND (producto_id|producto_kit_id) = \$2 AND empresa_id = \$3/.exec(sql);

      if (upd) {
        const fila = db[upd[1]].find((f) => f.id === p[0] && f[upd[2]] === p[1] && f.empresa_id === p[2]);

        if (fila) fila.modificada = true;

        return { rows: [], rowCount: fila ? 1 : 0 };
      }

      const ins = /^\s*INSERT INTO (producto_\w+) \((producto_id|producto_kit_id)/.exec(sql);

      if (ins) {
        db[ins[1]].push({ id: `nuevo-${++nuevo}`, [ins[2]]: p[0], empresa_id: EMPRESA, nueva: true });

        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  } as never;

  return { conexion, registro };
}

const fila = (id: string, extra: Fila = {}): Fila => ({ id, producto_id: PROD, empresa_id: EMPRESA, es_principal: false, ...extra });

export async function verificarCasosSincronizacion(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const datos = (cuerpo: Record<string, unknown>) => normalizarProducto({ descripcion: "P", descripcionFactura: "P", unidadMedidaId: U1, ...cuerpo }, { modo: "editar", productoId: PROD });
  /** Ejecuta la secuencia de la ruta PUT: fase 1, (UPDATE del producto), fase 2. Devuelve el error o null. */
  async function secuencia(db: Db, cuerpo: Record<string, unknown>, empresa = EMPRESA, bloqueadas: Record<string, string> = {}) {
    const x = baseSimulada(db, bloqueadas);
    const d = datos(cuerpo);
    const error = await (async () => {
      await eliminarHijos(x.conexion, empresa, PROD, d);
      await guardarHijos(x.conexion, empresa, PROD, d, USUARIO);
    })().then(
      () => null,
      (e) => e as ErrorValidacion,
    );

    return { error, registro: x.registro };
  }
  const nuevaDb = (): Db => ({
    producto_codigos: [fila(U1, { es_principal: true }), fila(U2), fila(U3)],
    producto_documentos: [fila(U1), fila(U2)],
    producto_componentes: [{ id: U1, producto_kit_id: PROD, empresa_id: EMPRESA }, { id: U2, producto_kit_id: PROD, empresa_id: EMPRESA }],
    producto_unidades: [],
    producto_proveedores: [],
    producto_deposito_configuracion: [],
    producto_alternativos: [],
  });
  const ids = (db: Db, t: string) => db[t].map((f) => f.id);
  const codigo = (id: string | undefined, extra: Record<string, unknown> = {}) => ({ id, tipo: "OTRO", codigo: `c-${id ?? "n"}`, ...extra });

  // 1) Exclusión simple: ya NO provoca el 409 de PRD-AUD-01
  let db = nuevaDb();
  let r = await secuencia(db, { eliminaciones: { codigos: [U2] } });

  igual("exclusión simple: sin error", r.error, null);
  igual("exclusión simple: la fila se eliminó y las otras siguen", ids(db, "producto_codigos"), [U1, U3]);

  // 2) Exclusión de varias colecciones a la vez
  db = nuevaDb();
  r = await secuencia(db, { eliminaciones: { codigos: [U2, U3], documentos: [U1] } });
  igual("exclusión en varias colecciones: sin error", r.error, null);
  igual("exclusión en varias colecciones: resultado", [ids(db, "producto_codigos"), ids(db, "producto_documentos")], [[U1], [U2]]);

  // 3) Exclusión + edición de otra fila
  db = nuevaDb();
  r = await secuencia(db, { codigos: [codigo(U1, { esPrincipal: true, descripcion: "editada" })], eliminaciones: { codigos: [U2] } });
  igual("exclusión con edición: sin error", r.error, null);
  igual("exclusión con edición: se eliminó U2 y se modificó U1 (por id)", [ids(db, "producto_codigos"), db.producto_codigos.find((f) => f.id === U1)?.modificada === true], [[U1, U3], true]);

  // 4) Exclusión + inclusión (la principal se reemplaza)
  db = nuevaDb();
  r = await secuencia(db, { codigos: [codigo(U1, { esPrincipal: false }), codigo("tmp-1", { esPrincipal: true })], eliminaciones: { codigos: [U3] } });
  igual("exclusión con inclusión: sin error", r.error, null);
  cierto("exclusión con inclusión: U3 eliminado y fila nueva insertada", !ids(db, "producto_codigos").includes(U3) && db.producto_codigos.some((f) => f.nueva === true));
  const pos = (prefijo: string) => r.registro.findIndex((q) => q.startsWith(prefijo));

  cierto("exclusión con inclusión: orden eliminar → actualizar → insertar", pos("DELETE FROM producto_codigos") < pos("UPDATE producto_codigos") && pos("UPDATE producto_codigos") < pos("INSERT INTO producto_codigos") && pos("DELETE FROM producto_codigos") >= 0);

  // 5) Exclusión de componentes de kit (FK producto_kit_id) con las dos fases
  db = nuevaDb();
  r = await secuencia(db, { tipoProducto: "KIT", componentes: [{ id: U1, productoComponenteId: C1, cantidad: "2" }], eliminaciones: { componentes: [U2] } });
  igual("componentes: eliminar + editar sin error", [r.error, ids(db, "producto_componentes")], [null, [U1]]);

  // 6) Sin eliminaciones el comportamiento no cambia
  db = nuevaDb();
  r = await secuencia(db, { codigos: [codigo(U1, { esPrincipal: true })] });
  igual("sin eliminaciones: nada se borra", [r.error, ids(db, "producto_codigos")], [null, [U1, U2, U3]]);

  // 7) Modificada y eliminada a la vez: 400 sin escrituras
  db = nuevaDb();
  r = await secuencia(db, { codigos: [codigo(U2)], eliminaciones: { codigos: [U2] } });
  igual("modificada y eliminada: 400", r.error?.estado, 400);
  igual("modificada y eliminada: nada se borró", ids(db, "producto_codigos"), [U1, U2, U3]);

  // 8) Protección de referencias (23503 / P0001): no se destruye nada y el error es claro
  db = nuevaDb();
  r = await secuencia(db, { eliminaciones: { codigos: [U2] } }, EMPRESA, { [U2]: "23503" });
  igual("referenciada: 409 con campo", [r.error?.estado, r.error?.campo], [409, "codigos"]);
  igual("referenciada: la fila sigue", ids(db, "producto_codigos"), [U1, U2, U3]);
  cierto("referenciada: se revirtió el savepoint", r.registro.includes("ROLLBACK TO SAVEPOINT baja_hija"));
  r = await secuencia(nuevaDb(), { eliminaciones: { codigos: [U2] } }, EMPRESA, { [U2]: "22P02" });
  igual("error no esperado de la base se propaga (no se oculta)", (r.error as unknown as { code?: string }).code, "22P02");

  // 9) Aislamiento multiempresa: filas de otra empresa son invisibles
  db = nuevaDb();
  db.producto_codigos.push(fila("b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1", { empresa_id: OTRA }));
  r = await secuencia(db, { eliminaciones: { codigos: ["b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1"] } });
  igual("id de otra empresa: 409", r.error?.estado, 409);
  cierto("id de otra empresa: no se borra ni se emite DELETE", db.producto_codigos.some((f) => f.empresa_id === OTRA) && !r.registro.some((s) => s.startsWith("DELETE FROM producto_codigos WHERE")));
  db = nuevaDb();
  r = await secuencia(db, { eliminaciones: { codigos: [U2] } }, OTRA);
  igual("sesión de otra empresa no puede eliminar filas ajenas", [r.error?.estado, ids(db, "producto_codigos")], [409, [U1, U2, U3]]);
  db = nuevaDb();
  r = await secuencia(db, { codigos: [codigo(U1)] }, OTRA);
  igual("sesión de otra empresa no puede modificar filas ajenas", [r.error?.estado, db.producto_codigos.some((f) => f.modificada)], [409, false]);

  // 10) Transacciones concurrentes (el producto se bloquea FOR UPDATE: la segunda corre después con datos obsoletos)
  db = nuevaDb();
  const t1 = await secuencia(db, { eliminaciones: { codigos: [U2] } });
  const t2 = await secuencia(db, { codigos: [codigo(U2)] }); // editaba U2 sin saber que fue eliminado
  const t3 = await secuencia(db, { eliminaciones: { codigos: [U2] } }); // intenta eliminarlo de nuevo

  igual("concurrencia: la primera confirma", t1.error, null);
  igual("concurrencia: editar una fila ya eliminada → 409 (recargar)", t2.error?.estado, 409);
  igual("concurrencia: eliminar dos veces → 409 sin romper nada", t3.error?.estado, 409);
  igual("concurrencia: estado final consistente", ids(db, "producto_codigos"), [U1, U3]);

  // 11) La ruta serializa y revierte: producto FOR UPDATE antes de las fases, ROLLBACK ante error
  const put = readFileSync(join(process.cwd(), "app/api/productos/[id]/route.ts"), "utf8");

  cierto("PUT: bloquea el producto (FOR UPDATE) antes de las fases", put.indexOf("FOR UPDATE") < put.indexOf("eliminarHijos("));
  cierto("PUT: las dos fases usan la misma transacción y se revierte ante cualquier error", put.indexOf("eliminarHijos(") < put.indexOf("guardarHijos(") && /ROLLBACK/.test(put));
  cierto("sincronizar: la fase 2 ya no exige que existan los ids eliminados", !/verificarIds/.test(readFileSync(join(process.cwd(), "lib/productos/sincronizar.ts"), "utf8")));

  return fallos;
}
