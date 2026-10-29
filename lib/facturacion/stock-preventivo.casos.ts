/**
 * PRO-330 — aviso inmediato de stock en «Nueva factura». Casos escritos como código (NO ejecutados en esta entrega, por orden del responsable):
 *  1. Servidor: forma estricta del cuerpo, cantidades decimales exactas, agregación por UUID, SIN_CONTROL, tandas de ≤ 500 UUID, productos/sucursal de la empresa de la sesión.
 *  2. Pantalla: controlador con temporizador y servidor simulados (carreras, aborto, versión/firma, error ≠ saldo cero, reintento, bloqueo de la revisión).
 *  3. Estructura: endpoint solo lectura y sin caché, previa/emisión intactas, pantalla con aviso accesible y bloqueo de «Revisar y confirmar».
 * El SQL de NEX-067 se verifica de forma estructural; no se ejecuta PostgreSQL.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { consultarDisponibilidadEnLotes, evaluarDisponibilidadPreventiva, LOTE_DISPONIBILIDAD, lotesDe, type LineaStock, type SaldoDisponible } from "@/lib/facturacion/stock-fe";
import {
  cantidadCanonica, crearVerificadorStock, leerSolicitudDisponibilidad, lineasParaStock, MAX_LINEAS_FE, prepararVerificacion, productosParaStock, respuestaCoherente, sucursalParaStock, textoInsuficiente, vistaStock,
  type BorradorStock, type SolicitudDisponibilidad,
} from "@/lib/facturacion/stock-preventivo";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");
const EMPRESA = "11111111-1111-4111-8111-111111111111";
const USUARIO = "99999999-9999-4999-8999-999999999999";
const SUC_A = "55555555-5555-4555-8555-555555555555";
const SUC_B = "66666666-6666-4666-8666-666666666666";
const CLI_1 = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";
const CLI_2 = "c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2";
const P1 = "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1";
const P2 = "f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2";
const SERV = "f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3";
const DEP = "a0000000-0000-4000-8000-00000000000a";

const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const saldo = (productoId: string, disponible: string): SaldoDisponible => ({ productoId, depositoId: DEP, depositoCodigo: "A", depositoNombre: "Depósito A", loteId: null, loteCodigo: null, vencimiento: null, disponible });
// El código «000123» es TEXTO del producto (no UUID ni GTIN): dos UUID distintos pueden mostrar códigos parecidos y no se mezclan.
const linea = (productoId: string, cantidad: string, controlaStock = true, codigo = "000123"): LineaStock => ({ productoId, codigo, descripcion: "Producto " + codigo, cantidad, controlaStock });

/** Respuesta coherente del servidor para una solicitud, con los saldos indicados (el servidor real usa la misma función). */
const responder = (s: SolicitudDisponibilidad, disp: Record<string, string>, sinControl: string[] = []) => ({
  sucursalId: s.sucursalId,
  ...evaluarDisponibilidadPreventiva(s.lineas.map((x) => linea(x.productoId, x.cantidad, !sinControl.includes(x.productoId), x.productoId === P1 ? "P-1" : "P-2")), Object.entries(disp).map(([id, d]) => saldo(id, d))),
});

function reloj() {
  let n = 0;
  const cola: Array<{ id: number; f: () => void; ms: number }> = [];

  return {
    programar: (f: () => void, ms: number) => {
      n += 1;
      cola.push({ id: n, f, ms });

      return n;
    },
    cancelar: (t: unknown) => {
      const i = cola.findIndex((x) => x.id === t);

      if (i >= 0) cola.splice(i, 1);
    },
    disparar: () => cola.splice(0).forEach((x) => x.f()),
    pendientes: () => cola.length,
    ultimoMs: () => cola[cola.length - 1]?.ms ?? null,
  };
}

function servidor() {
  const llamadas: Array<{ s: SolicitudDisponibilidad; signal: AbortSignal; resolver: (r: unknown) => void; rechazar: (e: unknown) => void }> = [];

  return {
    llamadas,
    consultar: (s: SolicitudDisponibilidad, signal: AbortSignal) => new Promise<unknown>((resolver, rechazar) => llamadas.push({ s, signal, resolver, rechazar })),
  };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const borrador = (sucursalId: string, lineas: BorradorStock["lineas"], clienteId: string | null = CLI_1): BorradorStock => ({ sucursalId, clienteId, lineas });
const l = (productoId: string, cantidad: string, controlaStock: boolean | null = true) => ({ productoId, cantidad, controlaStock });

export async function verificarCasosStockPreventivo(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(nombre + ": esperado " + JSON.stringify(esperado) + ", obtenido " + JSON.stringify(obtenido));
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── 1. Servidor ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const r = evaluarDisponibilidadPreventiva([linea(P1, "3")], [saldo(P1, "2")]);

    igual("PRO330-01 solicitado 3 / disponible 2 → INSUFICIENTE, faltante 1, suficiente false", [r.suficiente, r.productos], [false, [{ productoId: P1, codigo: "000123", descripcion: "Producto 000123", controlaStock: true, requerido: "3", disponible: "2", faltante: "1", estado: "INSUFICIENTE" }]]);
    igual("PRO330-02 texto del aviso en la línea", textoInsuficiente(r.productos[0] as { requerido: string; disponible: string; faltante: string }), "Stock insuficiente — Solicitado: 3 | Disponible: 2 | Faltante: 1");

    const ok = evaluarDisponibilidadPreventiva([linea(P1, "2")], [saldo(P1, "2")]);

    igual("PRO330-03 corregir a 2 → SUFICIENTE con faltante null", [ok.suficiente, ok.productos[0].estado, ok.productos[0].faltante, ok.productos[0].disponible], [true, "SUFICIENTE", null, "2"]);
  }
  igual("PRO330-04 cero REAL (consulta exitosa sin saldos válidos) → INSUFICIENTE con disponible 0 y faltante exacto", (() => {
    const p = evaluarDisponibilidadPreventiva([linea(P1, "3")], []).productos[0];

    return [p.estado, p.disponible, p.faltante];
  })(), ["INSUFICIENTE", "0", "3"]);
  igual("PRO330-05 el mismo UUID en dos líneas (1 + 2) → UNA entrada con requerido 3 (no solo la última línea)", (() => {
    const r = evaluarDisponibilidadPreventiva([linea(P1, "1"), linea(P1, "2")], [saldo(P1, "2")]);

    return [r.productos.length, r.productos[0].requerido, r.productos[0].faltante];
  })(), [1, "3", "1"]);
  igual("PRO330-06 dos UUID distintos con el mismo código de texto «000123» no se suman entre sí", (() => {
    const r = evaluarDisponibilidadPreventiva([linea(P1, "2"), linea(P2, "2")], [saldo(P1, "2"), saldo(P2, "1")]);

    return r.productos.map((p) => [p.productoId, p.requerido, p.estado]);
  })(), [[P1, "2", "SUFICIENTE"], [P2, "2", "INSUFICIENTE"]]);
  igual("PRO330-07 cantidades canónicas exactas sin float: 1,5 → 1.5; 0,0001 → 0.0001; 5,0000 → 5; 1.5 → 1.5", ["1,5", "0,0001", "5,0000", "1.5"].map(cantidadCanonica), ["1.5", "0.0001", "5", "1.5"]);
  igual("PRO330-08 cantidades inválidas no se canonizan (vacía, 0, 0,0000, cinco decimales, letras, coma y punto, negativa)", ["", "0", "0,0000", "1.23456", "abc", "1,2.3", "-1"].map(cantidadCanonica), [null, null, null, null, null, null, null]);
  igual("PRO330-09 decimales exactos en el saldo: 1.5 vs 1.5 alcanza; 0.0001 vs 0 falta 0.0001; 5.0001 vs 5 falta 0.0001", [
    evaluarDisponibilidadPreventiva([linea(P1, "1.5")], [saldo(P1, "1.5")]).productos[0].estado,
    evaluarDisponibilidadPreventiva([linea(P1, "0.0001")], []).productos[0].faltante,
    evaluarDisponibilidadPreventiva([linea(P1, "5.0001")], [saldo(P1, "5")]).productos[0].faltante,
  ], ["SUFICIENTE", "0.0001", "0.0001"]);
  {
    const r = evaluarDisponibilidadPreventiva([linea(SERV, "4", false), linea(SERV, "1.5", false), linea(P1, "1")], [saldo(P1, "1")]);

    igual("PRO330-10 servicio / mercadería sin control → SIN_CONTROL, disponible y faltante null (no es saldo cero), suma exacta, no bloquea", [r.suficiente, r.productos.map((p) => [p.productoId, p.estado, p.requerido, p.disponible, p.faltante])], [true, [[SERV, "SIN_CONTROL", "5.5", null, null], [P1, "SUFICIENTE", "1", "1", null]]]);
  }
  {
    const ok = leerSolicitudDisponibilidad({ sucursalId: SUC_A.toUpperCase(), lineas: [{ productoId: P1.toUpperCase(), cantidad: "1,5" }, { productoId: P2, cantidad: "5,0000" }] });

    igual("PRO330-11 forma válida: UUID en minúsculas y cantidades canónicas", ok, { sucursalId: SUC_A, lineas: [{ productoId: P1, cantidad: "1.5" }, { productoId: P2, cantidad: "5" }] });
  }
  igual("PRO330-12 se rechazan campos del navegador que no se confían (controlaStock, empresaId, precio, depósito, descripción) y formas inválidas", [
    { sucursalId: SUC_A, lineas: [], empresaId: EMPRESA },
    { sucursalId: SUC_A, lineas: [{ productoId: P1, cantidad: "1", controlaStock: false }] },
    { sucursalId: SUC_A, lineas: [{ productoId: P1, cantidad: "1", precio: "1000" }] },
    { sucursalId: SUC_A, lineas: [{ productoId: P1, cantidad: "1", depositoId: DEP }] },
    { sucursalId: SUC_A, lineas: [{ productoId: P1, cantidad: "1", descripcion: "x" }] },
    { sucursalId: "no-uuid", lineas: [] },
    { sucursalId: SUC_A, lineas: [{ productoId: "000123", cantidad: "1" }] },
    { sucursalId: SUC_A, lineas: [{ productoId: P1, cantidad: 1 }] },
    { sucursalId: SUC_A, lineas: [{ productoId: P1, cantidad: "0" }] },
    { sucursalId: SUC_A, lineas: "x" },
    [],
    null,
  ].map((c) => typeof leerSolicitudDisponibilidad(c) === "string"), [true, true, true, true, true, true, true, true, true, true, true, true]);
  igual("PRO330-13 límite real de la FE: 999 líneas se aceptan, 1000 se rechazan; sin líneas es válido (la pantalla limpia)", [
    typeof leerSolicitudDisponibilidad({ sucursalId: SUC_A, lineas: Array.from({ length: MAX_LINEAS_FE }, (_, i) => ({ productoId: uuid(i + 1), cantidad: "1" })) }),
    typeof leerSolicitudDisponibilidad({ sucursalId: SUC_A, lineas: Array.from({ length: MAX_LINEAS_FE + 1 }, (_, i) => ({ productoId: uuid(i + 1), cantidad: "1" })) }),
    leerSolicitudDisponibilidad({ sucursalId: SUC_A, lineas: [] }),
  ], ["object", "string", { sucursalId: SUC_A, lineas: [] }]);
  igual("PRO330-14 tandas de ≤ 500: 501 → 500 + 1; 999 → 500 + 499; 500 → una tanda", [LOTE_DISPONIBILIDAD, lotesDe(Array.from({ length: 501 }, (_, i) => i)).map((x) => x.length), lotesDe(Array.from({ length: 999 }, (_, i) => i)).map((x) => x.length), lotesDe(Array.from({ length: 500 }, (_, i) => i)).length], [500, [500, 1], [500, 499], 1]);
  {
    // Simulador del contrato de fe_stock_disponibilidad: con más de 500 UUID devuelve VACÍO (no error); cada producto tiene saldo 1.
    const llamadas: Array<{ sql: string; p: unknown[] }> = [];
    const db = {
      async query(sql: string, p: unknown[] = []) {
        llamadas.push({ sql, p });
        const ids = p[3] as string[];

        return { rows: ids.length > 500 ? [] : ids.map((id) => ({ productoId: id, depositoId: DEP, depositoCodigo: "A", depositoNombre: "Depósito A", loteId: null, loteCodigo: null, vencimiento: null, disponible: "1" })), rowCount: 1 };
      },
    };
    const ids = Array.from({ length: 501 }, (_, i) => uuid(i + 1));
    const saldos = await consultarDisponibilidadEnLotes(db as never, EMPRESA, USUARIO, SUC_A, [...ids, ids[0]]);
    const r = evaluarDisponibilidadPreventiva(ids.map((id) => linea(id, "1")), saldos);

    igual("PRO330-15 501 UUID únicos (y uno repetido) → dos llamadas a fe_stock_disponibilidad (500 + 1) con empresa/usuario/sucursal de la sesión", [llamadas.length, llamadas.map((x) => (x.p[3] as string[]).length), llamadas.every((x) => /FROM fe_stock_disponibilidad\(\$1::uuid, \$2::uuid, \$3::uuid, \$4::uuid\[\]\)/.test(x.sql) && x.p[0] === EMPRESA && x.p[1] === USUARIO && x.p[2] === SUC_A)], [2, [500, 1], true]);
    igual("PRO330-16 con las tandas los 501 productos con saldo resultan SUFICIENTES (sin insuficiencia fabricada por truncamiento)", [saldos.length, r.suficiente, r.productos.length], [501, true, 501]);
    llamadas.length = 0;
    igual("PRO330-17 sin productos con control de stock no se consulta saldo", [(await consultarDisponibilidadEnLotes(db as never, EMPRESA, USUARIO, SUC_A, [])).length, llamadas.length], [0, 0]);
  }
  {
    const vistas: Array<{ sql: string; p: unknown[] }> = [];
    const db = {
      async query(sql: string, p: unknown[] = []) {
        vistas.push({ sql, p });
        if (/FROM productos p/.test(sql)) return { rows: [{ id: P1, codigo: "P-1", descripcion: "Producto 1", controlaStock: true }, { id: SERV, codigo: "S-1", descripcion: "Servicio", controlaStock: false }], rowCount: 2 };

        return { rows: p[1] === SUC_A ? [{ ok: 1 }] : [], rowCount: 0 };
      },
    };
    const productos = await productosParaStock(db as never, EMPRESA, [P1, SERV, P1]);
    const sqlP = vistas[0];

    igual("PRO330-18 productos: solo de la empresa de la sesión, activos, vendibles, MERCADERIA|SERVICIO, IDs únicos; controlaStock es el de la BASE", [sqlP.p[0], sqlP.p[1], /p\.empresa_id = \$1 AND p\.activo AND p\.vendible AND p\.tipo_producto IN \('MERCADERIA','SERVICIO'\) AND p\.id = ANY\(\$2::uuid\[\]\)/.test(sqlP.sql), /controla_stock AS "controlaStock"/.test(sqlP.sql), productos.map((p) => p.controlaStock)], [EMPRESA, [P1, SERV], true, true, [true, false]]);
    igual("PRO330-19 sucursal: activa, de la empresa, con establecimiento y en el alcance del usuario (fuera → false)", [await sucursalParaStock(db as never, EMPRESA, USUARIO, SUC_A), await sucursalParaStock(db as never, EMPRESA, USUARIO, SUC_B), /sc\.empresa_id = \$1 AND sc\.id = \$2 AND sc\.activo AND sc\.establecimiento_sifen IS NOT NULL AND sucursal_en_alcance\(\$1::uuid, \$3::uuid, sc\.id\)/.test(vistas[1].sql), vistas[1].p], [true, false, true, [EMPRESA, SUC_A, USUARIO]]);
    igual("PRO330-20 producto de otra empresa / inactivo / no vendible (no devuelto por la base) → null (422 genérico, sin decir cuál)", lineasParaStock({ sucursalId: SUC_A, lineas: [{ productoId: P1, cantidad: "1" }, { productoId: P2, cantidad: "1" }] }, productos), null);
    igual("PRO330-21 líneas para el reparto con código, descripción y flag del SERVIDOR", lineasParaStock({ sucursalId: SUC_A, lineas: [{ productoId: SERV, cantidad: "2" }, { productoId: P1, cantidad: "1.5" }] }, productos), [{ productoId: SERV, codigo: "S-1", descripcion: "Servicio", cantidad: "2", controlaStock: false }, { productoId: P1, codigo: "P-1", descripcion: "Producto 1", cantidad: "1.5", controlaStock: true }]);
  }
  {
    const sql = leer("documentacao/banco/nexit/v1/migraciones/NEX-067-facturacion-stock-baja-fe.sql");
    const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.fe_stock_disponibilidad"), sql.indexOf("CREATE OR REPLACE FUNCTION public.fe_stock_baja_documento"));

    cierto("PRO330-22 la fuente única (NEX-067) filtra DISPONIBLE + PROPIO, depósitos activos de la sucursal, no terceros, alcance del usuario, permiso CREAR y producto con control de stock; > 500 UUID devuelve vacío (por eso las tandas)",
      /s\.estado_stock = 'DISPONIBLE' AND s\.propiedad = 'PROPIO' AND s\.cantidad > 0/.test(fn) && /d\.activo AND NOT d\.es_de_terceros AND d\.sucursal_id = p_sucursal/.test(fn) && /usuario_puede_deposito\(p_empresa, p_usuario, d\.id\)/.test(fn)
      && /'FACTURACION_ELECTRONICA', 'CREAR'/.test(fn) && /sucursal_en_alcance\(p_empresa, p_usuario, p_sucursal\)/.test(fn) && /pr\.controla_stock/.test(fn) && /cardinality\(p_productos\) > 500 THEN\s+RETURN;/.test(fn) && /s\.empresa_id = p_empresa/.test(fn));
  }

  // ── 2. Pantalla: controlador ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const t = reloj();
    const sv = servidor();
    const v = crearVerificadorStock({ consultar: sv.consultar, programar: t.programar, cancelar: t.cancelar });
    const b = borrador(SUC_A, [l(P1, "3"), l(SERV, "1", false)]);

    v.actualizar(b);
    igual("PRO330-23 al agregar: VERIFICANDO de inmediato, con espera corta (200 ms) y todavía sin petición", [v.estado().fase, t.ultimoMs(), sv.llamadas.length, vistaStock(v.estado(), b).pendiente], ["VERIFICANDO", 200, 0, "esperar la verificación de stock"]);
    t.disparar();
    igual("PRO330-24 una sola petición agrupada del borrador; los servicios conocidos no viajan", [sv.llamadas.length, sv.llamadas[0].s], [1, { sucursalId: SUC_A, lineas: [{ productoId: P1, cantidad: "3" }] }]);
    sv.llamadas[0].resolver(responder(sv.llamadas[0].s, { [P1]: "2" }));
    await tick();

    const vista = vistaStock(v.estado(), b);

    igual("PRO330-25 3 vs 2 → aviso INSUFICIENTE en la línea y revisión bloqueada con el código", [v.estado().fase, vista.avisos.get(P1), vista.avisos.get(SERV) ?? null, vista.pendiente], ["LISTO", { tipo: "INSUFICIENTE", codigo: "P-1", descripcion: "Producto P-1", requerido: "3", disponible: "2", faltante: "1" }, null, "corregir el stock insuficiente: P-1 (faltan 1)"]);

    const b2 = borrador(SUC_A, [l(P1, "2"), l(SERV, "1", false)]);

    v.actualizar(b2);
    t.disparar();
    sv.llamadas[1].resolver(responder(sv.llamadas[1].s, { [P1]: "2" }));
    await tick();
    igual("PRO330-26 corregir a 2 → SUFICIENTE, aviso anterior retirado y revisión habilitada por stock", [vistaStock(v.estado(), b2).avisos.get(P1), vistaStock(v.estado(), b2).pendiente], [{ tipo: "SUFICIENTE", requerido: "2", disponible: "2" }, ""]);

    v.actualizar(borrador(SUC_A, [l(P1, "2,0000"), l(SERV, "7", false)]));
    igual("PRO330-27 cambiar solo el precio, un servicio o escribir 2,0000 (misma cantidad canónica) no vuelve a consultar", [sv.llamadas.length, t.pendientes(), v.estado().fase], [2, 0, "LISTO"]);
  }
  {
    const t = reloj();
    const sv = servidor();
    const v = crearVerificadorStock({ consultar: sv.consultar, programar: t.programar, cancelar: t.cancelar });
    const bA = borrador(SUC_A, [l(P1, "3")]);
    const bB = borrador(SUC_B, [l(P1, "3")]);

    v.actualizar(bA);
    t.disparar();
    v.actualizar(bB);
    igual("PRO330-28 cambio de sucursal A → B con A en curso: A se aborta y el saldo anterior deja de valer de inmediato", [sv.llamadas[0].signal.aborted, v.estado().fase, vistaStock(v.estado(), bB).avisos.get(P1)], [true, "VERIFICANDO", { tipo: "VERIFICANDO" }]);
    t.disparar();
    sv.llamadas[0].resolver(responder(sv.llamadas[0].s, { [P1]: "10" }));
    await tick();
    igual("PRO330-29 la respuesta TARDÍA de A (suficiente) se descarta: no aparece un verde de otra sucursal", [v.estado().fase, vistaStock(v.estado(), bB).avisos.get(P1)], ["VERIFICANDO", { tipo: "VERIFICANDO" }]);
    sv.llamadas[1].resolver(responder(sv.llamadas[1].s, { [P1]: "1" }));
    await tick();
    igual("PRO330-30 B solo compara con B", [sv.llamadas[1].s.sucursalId, vistaStock(v.estado(), bB).avisos.get(P1)], [SUC_B, { tipo: "INSUFICIENTE", codigo: "P-1", descripcion: "Producto P-1", requerido: "3", disponible: "1", faltante: "2" }]);

    // A → B → A: la primera respuesta de A llega después de volver a A; la versión monotónica la descarta aunque la firma coincida.
    v.actualizar(bA);
    t.disparar();
    v.actualizar(bB);
    t.disparar();
    v.actualizar(bA);
    t.disparar();

    const [a1, , a3] = sv.llamadas.slice(2);

    a1.resolver(responder(a1.s, { [P1]: "10" }));
    await tick();
    igual("PRO330-31 A → B → A: la respuesta de la primera A (versión vieja, misma firma) se descarta", [v.estado().fase, a1.signal.aborted], ["VERIFICANDO", true]);
    a3.resolver(responder(a3.s, { [P1]: "3" }));
    await tick();
    igual("PRO330-32 solo la última consulta de A se publica", vistaStock(v.estado(), bA).avisos.get(P1), { tipo: "SUFICIENTE", requerido: "3", disponible: "3" });
  }
  {
    const t = reloj();
    const sv = servidor();
    const v = crearVerificadorStock({ consultar: sv.consultar, programar: t.programar, cancelar: t.cancelar });
    const b3 = borrador(SUC_A, [l(P1, "3")]);
    const b5 = borrador(SUC_A, [l(P1, "5")]);

    v.actualizar(b3);
    t.disparar();
    v.actualizar(b5);
    sv.llamadas[0].resolver(responder(sv.llamadas[0].s, { [P1]: "4" }));
    await tick();
    igual("PRO330-33 editar la cantidad con la consulta en curso: el resultado de 3 (suficiente) no se aplica a 5", [v.estado().fase, vistaStock(v.estado(), b5).avisos.get(P1), vistaStock(v.estado(), b5).pendiente], ["VERIFICANDO", { tipo: "VERIFICANDO" }, "esperar la verificación de stock"]);
    t.disparar();
    sv.llamadas[1].resolver(responder(sv.llamadas[1].s, { [P1]: "4" }));
    await tick();
    igual("PRO330-34 incremento 3 → 5 con 4 disponibles → faltante 1", vistaStock(v.estado(), b5).avisos.get(P1), { tipo: "INSUFICIENTE", codigo: "P-1", descripcion: "Producto P-1", requerido: "5", disponible: "4", faltante: "1" });

    // Un estado viejo jamás se muestra contra un borrador distinto aunque el controlador aún no se haya actualizado (render previo al efecto).
    igual("PRO330-35 la vista exige la firma vigente: estado LISTO de 5 frente a un borrador de 6 = VERIFICANDO", vistaStock(v.estado(), borrador(SUC_A, [l(P1, "6")])).avisos.get(P1), { tipo: "VERIFICANDO" });

    v.actualizar(borrador(SUC_A, [l(P1, "5")], CLI_2));
    igual("PRO330-36 sustituir el cliente reconsulta (la firma incluye el cliente) e invalida lo publicado", [v.estado().fase, t.pendientes()], ["VERIFICANDO", 1]);
    t.disparar();
    v.actualizar(borrador(SUC_A, []));
    sv.llamadas[2].resolver(responder(sv.llamadas[2].s, { [P1]: "9" }));
    await tick();
    igual("PRO330-37 quitar el ítem / vaciar la lista con la consulta en curso: estado limpio, sin avisos ni bloqueo, respuesta descartada", [v.estado().fase, sv.llamadas[2].signal.aborted, vistaStock(v.estado(), borrador(SUC_A, [])).avisos.size, vistaStock(v.estado(), borrador(SUC_A, [])).pendiente], ["INACTIVO", true, 0, ""]);
  }
  {
    const t = reloj();
    const sv = servidor();
    const v = crearVerificadorStock({ consultar: sv.consultar, programar: t.programar, cancelar: t.cancelar });
    const b = borrador(SUC_A, [l(P1, "3")]);

    v.actualizar(b);
    t.disparar();
    sv.llamadas[0].rechazar(new TypeError("Failed to fetch"));
    await tick();
    igual("PRO330-38 error de red → ERROR (no saldo 0 ni saldo confirmado) y revisión bloqueada", [v.estado().fase, v.estado().resultado, vistaStock(v.estado(), b).avisos.get(P1)?.tipo, vistaStock(v.estado(), b).pendiente], ["ERROR", null, "ERROR", "reintentar la verificación de stock"]);
    v.actualizar(b);
    igual("PRO330-39 el ERROR no se reintenta solo (sin bucles): espera «Reintentar»", [sv.llamadas.length, t.pendientes()], [1, 0]);
    v.reintentar();
    igual("PRO330-40 «Reintentar» fuerza una consulta real sin espera", [v.estado().fase, t.ultimoMs()], ["VERIFICANDO", 0]);
    t.disparar();
    sv.llamadas[1].resolver(responder(sv.llamadas[1].s, { [P1]: "3" }));
    await tick();
    igual("PRO330-41 tras reintentar, el resultado actualiza el aviso", vistaStock(v.estado(), b).avisos.get(P1), { tipo: "SUFICIENTE", requerido: "3", disponible: "3" });

    v.actualizar(borrador(SUC_A, [l(P1, "4")]));
    t.disparar();
    v.actualizar(borrador(SUC_A, [l(P1, "5")]));
    sv.llamadas[2].rechazar(new Error("HTTP 503"));
    await tick();
    igual("PRO330-42 un error TARDÍO de un borrador anterior tampoco se publica", v.estado().fase, "VERIFICANDO");
  }
  {
    const t = reloj();
    const sv = servidor();
    const v = crearVerificadorStock({ consultar: sv.consultar, programar: t.programar, cancelar: t.cancelar });
    const b = borrador(SUC_A, [l(P1, "3")]);

    v.actualizar(b);
    t.disparar();
    sv.llamadas[0].resolver({ ...responder(sv.llamadas[0].s, { [P1]: "9" }), sucursalId: SUC_B });
    await tick();
    igual("PRO330-43 respuesta de otra sucursal o incompleta = error técnico, nunca saldo", [v.estado().fase, respuestaCoherente({ sucursalId: SUC_A, suficiente: true, productos: [] }, { sucursalId: SUC_A, lineas: [{ productoId: P1, cantidad: "3" }] }), respuestaCoherente({ sucursalId: SUC_A, suficiente: true, productos: [{ productoId: P1, codigo: "P-1", descripcion: "x", controlaStock: true, requerido: "3", disponible: 3, faltante: null, estado: "SUFICIENTE" }] }, { sucursalId: SUC_A, lineas: [{ productoId: P1, cantidad: "3" }] })], ["ERROR", false, false]);
  }
  {
    const t = reloj();
    const sv = servidor();
    const v = crearVerificadorStock({ consultar: sv.consultar, programar: t.programar, cancelar: t.cancelar });

    v.actualizar(borrador(SUC_A, [l(P1, "1")]));
    v.actualizar(borrador(SUC_A, [l(P1, "2")]));
    v.actualizar(borrador(SUC_A, [l(P1, "3")]));
    t.disparar();
    igual("PRO330-44 escritura rápida (1 → 2 → 3) con espera corta: una sola petición, con la cantidad final", [sv.llamadas.length, sv.llamadas[0].s.lineas], [1, [{ productoId: P1, cantidad: "3" }]]);
  }
  {
    const t = reloj();
    const sv = servidor();
    const v = crearVerificadorStock({ consultar: sv.consultar, programar: t.programar, cancelar: t.cancelar });
    const soloServicios = borrador(SUC_A, [l(SERV, "2", false), l(P2, "1", false)]);

    v.actualizar(soloServicios);
    igual("PRO330-45 solo servicios / mercadería sin control: sin consulta, sin «verificando» y sin bloqueo", [v.estado().fase, t.pendientes(), sv.llamadas.length, vistaStock(v.estado(), soloServicios).pendiente, vistaStock(v.estado(), soloServicios).avisos.size], ["INACTIVO", 0, 0, "", 0]);

    const sinSucursal = borrador("", [l(P1, "2")]);

    v.actualizar(sinSucursal);
    igual("PRO330-46 sin sucursal elegida no hay consulta (la falta de sucursal ya bloquea la revisión por su propia regla)", [v.estado().fase, t.pendientes(), vistaStock(v.estado(), sinSucursal).pendiente], ["INACTIVO", 0, ""]);

    const mixta = borrador(SUC_A, [l(P1, "2,"), l(P1, "abc"), l(P2, "1")]);

    v.actualizar(mixta);
    t.disparar();
    igual("PRO330-47 cantidad inválida: su UUID no viaja (no se suma una cantidad estimada) y se pide «Corrija la cantidad»; los demás se verifican", [sv.llamadas[0].s.lineas, vistaStock(v.estado(), mixta).avisos.get(P1)], [[{ productoId: P2, cantidad: "1" }], { tipo: "CANTIDAD_INVALIDA" }]);
    igual("PRO330-48 un producto sin flag conocido (null) se verifica (conservador); false explícito no", [prepararVerificacion(borrador(SUC_A, [l(P1, "1", null), l(SERV, "1", false)])).solicitud], [{ sucursalId: SUC_A, lineas: [{ productoId: P1, cantidad: "1" }] }]);
    v.destruir();
    igual("PRO330-49 al desmontar se aborta lo pendiente y el estado queda limpio (un remontaje vuelve a consultar)", [sv.llamadas[0].signal.aborted, v.estado().fase], [true, "INACTIVO"]);
  }

  // ── 3. Estructura ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const ruta = leer("app/api/facturas/stock/disponibilidad/route.ts");
    const codigo = ruta.replace(/^\s*\/\/.*$/gm, "");

    cierto("PRO330-50 endpoint: POST con sesión FACTURACION_ELECTRONICA.CREAR, empresa/usuario de la sesión, Cache-Control no-store en todas las respuestas", /export async function POST\(/.test(ruta) && /prepararFacturacion\("CREAR"\)/.test(ruta) && /b\.empresaId, b\.usuarioId/.test(ruta) && /"Cache-Control": "no-store"/.test(ruta) && /sinCache\(b\.respuesta\)/.test(ruta) && !/cuerpo\.empresaId|solicitud\.empresaId/.test(ruta));
    cierto("PRO330-51 endpoint: reutiliza consultarDisponibilidadEnLotes + evaluarDisponibilidadPreventiva (asignarStock); sin otra fórmula, sin SQL de saldos propio", /consultarDisponibilidadEnLotes\(/.test(ruta) && /evaluarDisponibilidadPreventiva\(/.test(ruta) && !/stock_saldos|SUM\(|parseFloat|Number\(/.test(codigo));
    cierto("PRO330-52 endpoint SOLO LECTURA: sin INSERT/UPDATE/DELETE, sin numeración, sin reparto firmado ni baja", !/\b(INSERT|UPDATE|DELETE)\b/i.test(codigo) && !/repartoHuella|huellaReparto|planificarStock|fe_documento_crear|fe_stock_baja|asignacionesSql|numeracion/.test(codigo));
    cierto("PRO330-53 endpoint: 400 forma/tamaño, 403 sucursal fuera de alcance, 422 producto ajeno genérico, 503 error técnico (distinto de insuficiencia)", /LIMITE_CUERPO_DISPONIBILIDAD/.test(ruta) && /, 400\)/.test(ruta) && /ErrorFacturacion\(403,/.test(ruta) && /ErrorFacturacion\(422,/.test(ruta) && /, 503\)/.test(ruta) && /respuestaErrorFacturacion\(/.test(ruta));
  }
  {
    const previa = leer("app/api/facturas/previa/route.ts");
    const fe = leer("lib/facturacion/stock-fe.ts");
    const plan = fe.slice(fe.indexOf("export async function planificarStock"), fe.indexOf("export const asignacionesSql"));

    cierto("PRO330-54 la previa conserva su consulta real, el bloqueo 409 por insuficiencia y el resumen con la huella del reparto", /planificarStock\(b\.db, b\.empresaId, b\.usuarioId, datos\.sucursalId, lineasStock\)/.test(previa) && /if \(!plan\.suficiente\) throw new ErrorFacturacion\(409, mensajeStockInsuficiente\(plan\)\)/.test(previa) && /stock: resumenStock\(plan\)/.test(previa));
    cierto("PRO330-55 planificarStock sigue igual (una consulta con los UUID controlados + asignarStock)", /const controladas = lineas\.filter\(\(l\) => l\.controlaStock\);/.test(plan) && /const saldos = await consultarDisponibilidad\(db, empresaId, usuarioId, sucursalId, \[\.\.\.new Set\(controladas\.map\(\(l\) => l\.productoId\)\)\]\);/.test(plan) && /return asignarStock\(lineas, saldos\);/.test(plan));
    cierto("PRO330-56 la emisión sigue exigiendo y validando repartoHuella", /repartoHuella/.test(leer("lib/facturacion/emision.ts")) && /MENSAJE_REPARTO_CAMBIO/.test(leer("lib/facturacion/emision.ts")));
  }
  {
    const pag = leer("app/(private)/facturas/nueva/page.tsx");
    const aviso = pag.slice(pag.indexOf("function AvisoStockLinea"), pag.indexOf("const SIN_AVISO"));

    cierto("PRO330-57 pantalla: Producto tipa controlaStock y el borrador usa las líneas reales, sucursal y cliente actuales", /controlaStock\?: boolean \| null;/.test(pag) && /const borradorStock: BorradorStock = \{ sucursalId, clienteId: clienteIdActual, lineas: lineas\.map\(\(l\) => \(\{ productoId: l\.producto\.id, cantidad: l\.cantidad, controlaStock: l\.producto\.controlaStock \}\)\) \};/.test(pag));
    cierto("PRO330-58 pantalla: reconsulta en cada cambio del borrador (efecto por la clave del borrador) y se desmonta limpio", /stockCtl\.actualizar\(JSON\.parse\(claveStock\) as BorradorStock\);\s*\}, \[stockCtl, claveStock\]\);/.test(pag) && /useEffect\(\(\) => \(\) => stockCtl\.destruir\(\), \[stockCtl\]\);/.test(pag));
    cierto("PRO330-59 pantalla: aviso por línea accesible (role=alert en insuficiencia y error; status en verificando) con «Reintentar» funcional", /className=\{estilos\.stockInsuficiente\} role="alert"/.test(aviso) && /textoInsuficiente\(aviso\)/.test(aviso) && /Verificando stock…/.test(aviso) && /No se pudo verificar el stock\./.test(aviso) && /onClick=\{alReintentar\}>Reintentar</.test(aviso) && /alReintentar=\{\(\) => stockCtl\.reintentar\(\)\}/.test(pag));
    cierto("PRO330-60 pantalla: la causa de stock entra en los pendientes y por ello deshabilita «Revisar y confirmar»; Enviar no se toca", /pendienteDeEntrega,\s*vista\.pendiente,/.test(pag) && /const puedeGuardar = !revisando && !enviando && faltan\.length === 0/.test(pag) && /disabled=\{!puedeGuardar\} onClick=\{grabar\}/.test(pag) && !/vista\.pendiente[^\n]*enviar/.test(pag));
    cierto("PRO330-61 pantalla: búsqueda rápida/escáner y «Búsqueda avanzada» siguen entrando por agregar() (mismo incremento por UUID)", /<BuscadorProducto alElegir=\{agregar\}/.test(pag) && /<SelectorProducto alCerrar=\{\(\) => setSelector\(null\)\} alAgregar=\{agregar\}/.test(pag) && /const existente = lineas\.find\(\(l\) => l\.producto\.id === p\.id\);/.test(pag));
    cierto("PRO330-62 pantalla: la fila insuficiente se destaca con estilo propio y el CSS define los cuatro avisos", /avisoStock\.tipo === "INSUFICIENTE" \? estilos\.filaSinStock/.test(pag) && ["filaSinStock", "stockInsuficiente", "stockVerificando", "stockError", "stockOk"].every((c) => new RegExp("\\." + c + "\\b").test(leer("app/(private)/facturas/nueva/page.module.css"))));
    cierto("PRO330-63 módulo de la pantalla sin dependencias de Node (no importa valores de stock-fe ni node:)", (() => {
      const m = leer("lib/facturacion/stock-preventivo.ts");

      return !/from "node:/.test(m) && /import type \{ LineaStock, ProductoStockPreventivo \} from "@\/lib\/facturacion\/stock-fe";/.test(m) && !/^import \{[^}]*\} from "@\/lib\/facturacion\/stock-fe"/m.test(m);
    })());
  }

  return fallos;
}
