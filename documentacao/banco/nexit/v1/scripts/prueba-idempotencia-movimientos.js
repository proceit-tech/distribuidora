/* eslint-disable */
// PRUEBA DE IDEMPOTENCIA DE MOVIMIENTOS CON POSTGRESQL REAL — la ejecuta SOLO el responsable. Claude Code NO la ejecutó (no accede a PostgreSQL real).
//
// Qué hace: llama a inventario_registrar_movimiento (la misma función SQL que usa la aplicación) y comprueba:
//   A. N solicitudes SIMULTÁNEAS con la misma clave y el mismo contenido → exactamente 1 movimiento; las demás devuelven o_repetido = true.
//   B. Repetición posterior de la misma solicitud (como tras un corte de red con la respuesta perdida) → mismo movimiento, repetido = true.
//   C. La misma clave con OTRO contenido (otra cantidad) → rechazo NEX:IDEMPOTENCIA_CONFLICTO.
//   D. N claves distintas simultáneas → N movimientos distintos.
//   E. Saldo: la cantidad neta agregada al depósito de prueba = (1 + N) × cantidad (A+B suman una sola vez; D suma N).
// Luego ANULA todos los movimientos creados con inventario_anular_movimiento (compensación; no se borra nada) y verifica que el saldo vuelva al inicial.
//
// ADVERTENCIA: crea movimientos reales (una entrada de 1 unidad y sus anulaciones) en la base a la que apunta DATABASE_URL. Use un producto y un
// depósito de PRUEBA acordados con el responsable, con backup reciente. Requiere un usuario con MOVIMIENTOS.CREAR y alcance sobre el depósito, y que
// el usuario pueda anular movimientos. No imprime ni guarda credenciales.
//
// Uso (desde la raíz del repositorio, con las variables en el entorno, no en el archivo):
//   CONFIRMO_PRUEBA_EN_AMBIENTE_REAL=SI DATABASE_URL=... PRUEBA_EMPRESA_ID=... PRUEBA_USUARIO_ID=... PRUEBA_PRODUCTO_ID=... PRUEBA_DEPOSITO_ID=... \
//   node documentacao/banco/nexit/v1/scripts/prueba-idempotencia-movimientos.js
// El producto debe controlarse por CANTIDAD (no por lote ni unidad identificada).

const { Pool } = require("pg");

const requeridas = ["DATABASE_URL", "PRUEBA_EMPRESA_ID", "PRUEBA_USUARIO_ID", "PRUEBA_PRODUCTO_ID", "PRUEBA_DEPOSITO_ID"];
const falta = requeridas.filter((v) => !process.env[v]);

if (process.env.CONFIRMO_PRUEBA_EN_AMBIENTE_REAL !== "SI" || falta.length) {
  console.error("No se ejecutó nada. Defina CONFIRMO_PRUEBA_EN_AMBIENTE_REAL=SI y: " + requeridas.join(", ") + (falta.length ? " (faltan: " + falta.join(", ") + ")" : ""));
  process.exit(2);
}

const N = Number(process.env.PRUEBA_CONCURRENCIA || 8);
const EMPRESA = process.env.PRUEBA_EMPRESA_ID;
const USUARIO = process.env.PRUEBA_USUARIO_ID;
const PRODUCTO = process.env.PRUEBA_PRODUCTO_ID;
const DEPOSITO = process.env.PRUEBA_DEPOSITO_ID;
const CANTIDAD = 1;
const COSTO = 1;
const corrida = Date.now().toString(36);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: N + 2 });
const fallos = [];
const creados = new Set();

const verificar = (nombre, ok, detalle) => {
  console.log((ok ? "OK    " : "FALLA ") + nombre + (detalle ? " — " + detalle : ""));
  if (!ok) fallos.push(nombre);
};

// Cada llamada usa su propia conexión y su propia transacción, igual que cada petición HTTP de la aplicación.
async function registrar(clave, cantidad = CANTIDAD) {
  const c = await pool.connect();

  try {
    await c.query("BEGIN");
    const linea = [{ producto_id: PRODUCTO, cantidad, costo_unitario: COSTO, propiedad: "PROPIO" }];
    const r = await c.query(
      `SELECT o_movimiento_id AS id, o_numero AS numero, o_repetido AS repetido
         FROM inventario_registrar_movimiento($1::uuid, $2::uuid, 'ENTRADA', 'MANUAL', NULL, NULL, $3::uuid, $4::jsonb, $5, NULL, $6, $7, NULL)`,
      [EMPRESA, USUARIO, DEPOSITO, JSON.stringify(linea), clave, "Prueba de idempotencia " + corrida, "Se compensa al finalizar la prueba"],
    );

    await c.query("COMMIT");
    if (!r.rows[0].repetido) creados.add(r.rows[0].id);

    return { ok: true, ...r.rows[0] };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);

    return { ok: false, error: e.message, detalle: e.detail };
  } finally {
    c.release();
  }
}

async function saldo() {
  const r = await pool.query(
    `SELECT coalesce(sum(cantidad), 0)::float8 AS total FROM stock_saldos
      WHERE empresa_id = $1 AND producto_id = $2 AND deposito_id = $3 AND propiedad = 'PROPIO' AND estado_stock = 'DISPONIBLE'`,
    [EMPRESA, PRODUCTO, DEPOSITO],
  );

  return r.rows[0].total;
}

async function anular(id) {
  const c = await pool.connect();

  try {
    await c.query("BEGIN");
    await c.query(`SELECT * FROM inventario_anular_movimiento($1::uuid, $2::uuid, $3::uuid, $4, $5)`, [EMPRESA, USUARIO, id, "Compensación de la prueba de idempotencia " + corrida, "anula-" + corrida + "-" + id]);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    console.error("No se pudo anular " + id + ": " + e.message + " — anúlelo manualmente desde Movimientos.");
    fallos.push("anulación " + id);
  } finally {
    c.release();
  }
}

(async () => {
  const modo = await pool.query(`SELECT modo_control_stock AS modo FROM productos WHERE empresa_id = $1 AND id = $2`, [EMPRESA, PRODUCTO]);

  if (!modo.rowCount || modo.rows[0].modo !== "CANTIDAD") {
    console.error("El producto de prueba debe existir y controlarse por CANTIDAD.");
    process.exit(2);
  }

  const inicial = await saldo();

  console.log("Saldo inicial disponible del depósito de prueba: " + inicial + ". Concurrencia: " + N + ".");

  // A. misma clave, mismo contenido, simultáneas
  const claveA = "prueba-idem-A-" + corrida;
  const A = await Promise.all(Array.from({ length: N }, () => registrar(claveA)));
  const okA = A.filter((r) => r.ok);

  verificar("A. todas las solicitudes simultáneas con la misma clave terminan sin error", okA.length === N, A.filter((r) => !r.ok).map((r) => r.error).join(" | "));
  verificar("A. exactamente un movimiento nuevo y el resto repetidos", okA.filter((r) => !r.repetido).length === 1 && new Set(okA.map((r) => r.id)).size === 1);

  // B. repetición posterior (respuesta perdida)
  const B = await registrar(claveA);

  verificar("B. repetir la solicitud después devuelve el mismo movimiento marcado como repetido", B.ok && B.repetido && B.id === okA[0]?.id);

  // C. misma clave, otro contenido
  const C = await registrar(claveA, CANTIDAD + 1);

  verificar("C. misma clave con otra cantidad es rechazada como conflicto de idempotencia", !C.ok && /IDEMPOTENCIA_CONFLICTO/.test(C.detalle || ""), C.ok ? "se aceptó" : C.error);

  // D. claves distintas simultáneas
  const D = await Promise.all(Array.from({ length: N }, (_, i) => registrar("prueba-idem-D" + i + "-" + corrida)));

  verificar("D. claves distintas simultáneas crean movimientos distintos", D.every((r) => r.ok && !r.repetido) && new Set(D.map((r) => r.id)).size === N, D.filter((r) => !r.ok).map((r) => r.error).join(" | "));

  // E. saldo
  const tras = await saldo();

  verificar("E. el saldo aumentó exactamente 1 + N unidades (A/B suman una sola vez)", Math.abs(tras - inicial - (1 + N) * CANTIDAD) < 1e-9, "inicial " + inicial + ", final " + tras);

  // Compensación
  for (const id of creados) await anular(id);

  const final = await saldo();

  verificar("Compensación: el saldo vuelve al inicial tras anular los movimientos de prueba", Math.abs(final - inicial) < 1e-9, "inicial " + inicial + ", final " + final);

  console.log(fallos.length ? "\nRESULTADO: " + fallos.length + " fallo(s). Registre el resultado en documentacao/v1/homologacao-visual/HOMOLOGACION-FUNCIONAL-STOCK-REPOSICION-MOVIMIENTOS-2026-10-12.md." : "\nRESULTADO: todas las comprobaciones pasaron. Registre fecha, ambiente y operador en el documento de homologación funcional.");
  await pool.end();
  process.exit(fallos.length ? 1 : 0);
})().catch(async (e) => {
  console.error("Error inesperado:", e.message);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
