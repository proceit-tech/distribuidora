/**
 * E02 (PRO-200) — control y baja de stock al emitir la Factura. Sin PostgreSQL real: el reparto y las reglas de la aplicación se prueban con la orquestación REAL (previa, emisión) contra un simulador del
 * CONTRATO de NEX-067 (fe_stock_disponibilidad y fe_documento_crear_fe_con_stock: filtro de saldos, revalidación bajo bloqueo, atomicidad, idempotencia). El SQL de NEX-067 se verifica de forma estructural
 * y NO se ejecutó (migración no aplicada). Concurrencia: las dos solicitudes leen el MISMO disponible y la segunda emisión es rechazada por el simulador igual que lo hace la revalidación SQL con FOR UPDATE.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { crearFacturaElectronica, leerCuerpoFactura, MENSAJE_REPARTO_CAMBIO, prepararFactura, type CuerpoFactura } from "@/lib/facturacion/emision";
import { ErrorFacturacion } from "@/lib/facturacion/shared";
import { asignarStock, huellaReparto, planificarStock, type SaldoDisponible } from "@/lib/facturacion/stock-fe";
import { verificarCasosStockPreventivo } from "@/lib/facturacion/stock-preventivo.casos";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");
const EMPRESA = "11111111-1111-4111-8111-111111111111";
const USUARIO = "99999999-9999-4999-8999-999999999999";
const SUC = "55555555-5555-4555-8555-555555555555";
const CLIENTE = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";
const PUNTO = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1";
const P1 = "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1";
const P2 = "f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2";
const SERV = "f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3";
const DEP_A = "a0000000-0000-4000-8000-00000000000a";
const DEP_B = "a0000000-0000-4000-8000-00000000000b";
const DEP_C = "a0000000-0000-4000-8000-00000000000c";
const LOTE_1 = "10000000-0000-4000-8000-000000000001";
const LOTE_2 = "10000000-0000-4000-8000-000000000002";

const filaCliente = { codigo: "CLI-000001", naturaleza_receptor: 1, tipo_operacion: 1, tipo_contribuyente_sifen: 2, pais_codigo: "PRY", tipo_documento_identidad_sifen: null, descripcion_documento_identidad: null, numero_documento: "80000005", dv: "6", razon_social: "CLIENTE SINTETICO", nombre_fantasia: null, email: null, email_copia: null, email_facturacion: null, telefono: null, celular: null, telefono_ddi: null, celular_ddi: null, activo: true, bloqueado_ventas: false, direccion: "Calle 1", numero_casa: "123", departamento_codigo: "1", distrito_codigo: "1", ciudad_codigo: "1" };
const producto = (id: string, codigo: string, controlaStock: boolean, precio = "11000") => ({ id, codigo, controlaStock, descripcion: "Producto " + codigo, unidadSifen: 77, unidadSimbolo: "UNI", unidadNombre: "Unidad", unidadVigente: true, afectacion: 1, proporcion: null, tasa: 10, precio, monedaPrecio: "PYG", gtin: null });
const CATALOGO = [producto(P1, "P-1", true), producto(P2, "P-2", true), producto(SERV, "SERV-1", false)];

type Saldo = { producto: string; deposito: string; codigo: string; nombre: string; sucursal: string; lote: string | null; venc: string | null; estado: string; propiedad: string; cantidad: number; activo: boolean; tercero?: boolean };
type ErrorSql = Error & { code?: string; detail?: string };
const errorSql = (mensaje: string, detail: string, code = "P0001"): ErrorSql => Object.assign(new Error(mensaje), { code, detail });

function mundo(saldosIniciales: Saldo[], opciones: { sinAlcance?: string[]; permisoCrear?: boolean } = {}) {
  const stock: Saldo[] = saldosIniciales.map((s) => ({ ...s }));
  const docs = new Map<string, { id: string; numero: string; asignaciones: unknown }>();
  const salidas: Array<{ doc: string; deposito: string; movimiento: string; lineas: Array<{ producto: string; lote: string | null; cantidad: number }> }> = [];
  const consultas: string[] = [];
  const manuales: Array<{ id: string; deposito: string; producto: string; cantidad: number; estado: string }> = [];
  const anulaciones: string[] = [];
  let secuencia = 0;

  const elegibles = (productoIds: string[], sucursal: string) =>
    stock.filter((s) => productoIds.includes(s.producto) && s.sucursal === sucursal && s.estado === "DISPONIBLE" && s.propiedad === "PROPIO" && s.activo && !s.tercero && s.cantidad > 0 && !(opciones.sinAlcance ?? []).includes(s.deposito)
      && CATALOGO.find((p) => p.id === s.producto)?.controlaStock === true);

  const db = {
    async query(sql: string, p: unknown[] = []) {
      consultas.push(sql);
      if (/usuario_tiene_permiso/.test(sql)) return { rows: [{ ok: false }], rowCount: 1 };
      if (/FROM unidades_medida_sifen WHERE codigo = ANY/.test(sql)) return { rows: [], rowCount: 0 };
      if (/FROM clientes c\s+LEFT JOIN LATERAL/.test(sql)) return { rows: [filaCliente], rowCount: 1 };
      if (/SELECT c\.id, c\.naturaleza_receptor/.test(sql)) return { rows: [{ ...filaCliente, id: CLIENTE, tipo_persona: "JURIDICA", tipo_documento: "RUC", pais_codigo: "PRY" }], rowCount: 1 };
      if (/FROM direcciones_cliente/.test(sql)) return { rows: [{ cliente_id: CLIENTE, direccion: "Calle 1", numero_casa: "123", departamento_codigo: "1", distrito_codigo: "1", ciudad_codigo: "1", pais_codigo: "PRY" }], rowCount: 1 };
      if (/FROM referencia_geografica_paises/.test(sql)) return { rows: [{ codigo: "PRY" }], rowCount: 1 };
      if (/FROM sucursales sc JOIN empresas e/.test(sql)) return { rows: [{ empresa: "EMPRESA SINTETICA", sucursal: "Casa Central", establecimiento: "001", punto: "002", puntoNombre: "Punto 002" }], rowCount: 1 };
      if (/FROM productos p/.test(sql)) return { rows: CATALOGO.filter((c) => (p[1] as string[]).includes(c.id)), rowCount: 1 };
      if (/FROM documentos_electronicos WHERE empresa_id/.test(sql)) return { rows: docs.has(String(p[1])) ? [{ ok: 1 }] : [], rowCount: 0 };
      if (/FROM fe_stock_disponibilidad/.test(sql)) {
        if (opciones.permisoCrear === false) throw errorSql("sin permiso", "", "42501");

        return {
          rows: elegibles(p[3] as string[], String(p[2])).sort((a, b) => (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0)).map((s) => ({ productoId: s.producto, depositoId: s.deposito, depositoCodigo: s.codigo, depositoNombre: s.nombre, loteId: s.lote, loteCodigo: s.lote ? "L-" + s.lote.slice(-1) : null, vencimiento: s.venc, disponible: String(s.cantidad) })),
          rowCount: 1,
        };
      }
      if (/fe_documento_crear_fe_con_stock/.test(sql)) {
        const clave = String(p[4]);
        const previo = docs.get(clave);

        if (previo) return { rows: [{ documentoId: previo.id, numero: previo.numero, reutilizado: true }], rowCount: 1 };

        const payload = JSON.parse(String(p[9])) as { Detalles: Array<{ dCodInt: string; dCantProSer: number }> };

        // PRO-203 (espejo del SQL): Detalles debe ser un arreglo NO vacío y cada detalle debe ser verificable (código de un producto de la empresa y cantidad numérica > 0).
        if (!Array.isArray(payload.Detalles) || payload.Detalles.length === 0) throw errorSql("la factura no tiene detalles fiscales válidos para conciliar el stock", "NEX:STOCK_PAYLOAD_INVALIDO");
        for (const d of payload.Detalles as Array<Record<string, unknown>>) {
          if (!d || typeof d !== "object" || typeof d.dCodInt !== "string" || d.dCodInt.trim() === "" || !CATALOGO.some((c) => c.codigo === d.dCodInt)) throw errorSql("un detalle fiscal no corresponde a un producto conocido de la empresa", "NEX:STOCK_PAYLOAD_INVALIDO");
          if (typeof d.dCantProSer !== "number" || d.dCantProSer <= 0) throw errorSql("un detalle fiscal no tiene una cantidad numérica positiva", "NEX:STOCK_PAYLOAD_INVALIDO");
        }
        const asig = JSON.parse(String(p[11])) as Array<{ producto_id: string; deposito_id: string; lote_id: string | null; cantidad: string }>;
        // Conciliación con el payload persistido (solo productos que controlan stock).
        const esperado = new Map<string, number>();

        for (const d of payload.Detalles) {
          const pr = CATALOGO.find((c) => c.codigo === d.dCodInt);

          if (pr?.controlaStock) esperado.set(pr.id, (esperado.get(pr.id) ?? 0) + d.dCantProSer);
        }
        const dado = new Map<string, number>();

        for (const a of asig) dado.set(a.producto_id, (dado.get(a.producto_id) ?? 0) + Number(a.cantidad));
        for (const k of new Set([...esperado.keys(), ...dado.keys()])) if (Math.abs((esperado.get(k) ?? -1) - (dado.get(k) ?? -2)) > 1e-9) throw errorSql("el reparto de stock no coincide con la cantidad facturada", "NEX:STOCK_REPARTO_INVALIDO");

        // Revalidación bajo bloqueo (simulada de forma atómica): todo o nada.
        const copia = stock.map((s) => ({ ...s }));

        for (const a of asig) {
          const s = copia.find((x) => x.producto === a.producto_id && x.deposito === a.deposito_id && x.lote === a.lote_id && x.estado === "DISPONIBLE" && x.propiedad === "PROPIO");
          const dep = copia.find((x) => x.deposito === a.deposito_id);

          if (!dep || !dep.activo || dep.tercero || dep.sucursal !== String(p[2]) || (opciones.sinAlcance ?? []).includes(a.deposito_id)) throw errorSql("depósito no válido", "NEX:STOCK_DEPOSITO_NO_AUTORIZADO", "42501");
          if (!s || s.cantidad < Number(a.cantidad)) throw errorSql("stock disponible insuficiente para facturar", "NEX:STOCK_INSUFICIENTE");
          s.cantidad = Math.round((s.cantidad - Number(a.cantidad)) * 10000) / 10000;
        }
        stock.splice(0, stock.length, ...copia);
        secuencia += 1;

        const id = "d0000000-0000-4000-8000-" + String(secuencia).padStart(12, "0");
        const numero = "00" + String(50000 + secuencia);

        docs.set(clave, { id, numero, asignaciones: asig });
        for (const dep of [...new Set(asig.map((a) => a.deposito_id))].sort()) {
          salidas.push({ doc: id, deposito: dep, movimiento: "MOV-" + String(salidas.length + 1).padStart(6, "0"), lineas: asig.filter((a) => a.deposito_id === dep).map((a) => ({ producto: a.producto_id, lote: a.lote_id, cantidad: Number(a.cantidad) })) });
        }

        return { rows: [{ documentoId: id, numero, reutilizado: false }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };

  /** Espejo de inventario_anular_movimiento + disparador fe_stock_movimiento_protegido_trg: una salida vinculada a una FE NO se anula (la transacción completa se deshace, sin movimiento inverso). */
  async function anular(movimiento: string) {
    const vinculada = salidas.some((x) => x.movimiento === movimiento);

    if (vinculada) throw errorSql("el movimiento está vinculado a una factura electrónica y no se puede anular manualmente", "NEX:MOVIMIENTO_VINCULADO_FE");

    const man = manuales.find((x) => x.id === movimiento && x.estado === "REGISTRADO");

    if (!man) throw errorSql("movimiento inexistente o ya anulado", "NEX:YA_ANULADO");

    const s = stock.find((x) => x.producto === man.producto && x.deposito === man.deposito && x.estado === "DISPONIBLE" && x.propiedad === "PROPIO");

    if (s) s.cantidad += man.cantidad;
    man.estado = "ANULADO";
    anulaciones.push(movimiento);
  }

  return { anular, manuales, anulaciones, secuencia: () => secuencia, db: db as never, stock, docs, salidas, consultas, saldo: (producto: string, deposito: string) => stock.filter((s) => s.producto === producto && s.deposito === deposito && s.estado === "DISPONIBLE").reduce((a, s) => a + s.cantidad, 0) };
}

const base = (producto: string, deposito: string, codigo: string, cantidad: number, extra: Partial<Saldo> = {}): Saldo => ({ producto, deposito, codigo, nombre: "Depósito " + codigo, sucursal: SUC, lote: null, venc: null, estado: "DISPONIBLE", propiedad: "PROPIO", cantidad, activo: true, ...extra });
const cuerpo = (lineas: Array<{ productoId: string; cantidad: string }>, clave = "clave-de-prueba-0001", extra: Record<string, unknown> = {}) =>
  leerCuerpoFactura({ claveIdempotencia: clave, sucursalId: SUC, puntoId: PUNTO, clienteId: CLIENTE, tipoTransaccion: 1, presencia: 1, pagos: [{ tipo: 1 }], infoAdicional: "", lineas: lineas.map((l) => ({ ...l, precio: null })), ...extra }) as CuerpoFactura;

export async function verificarCasosStockE02(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(nombre + ": esperado " + JSON.stringify(esperado) + ", obtenido " + JSON.stringify(obtenido));
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const estado = async (p: Promise<unknown>) => { try { await p; return "OK"; } catch (e) { return e instanceof ErrorFacturacion ? e.estado + ":" + e.message : "ERR:" + String(e); } };

  // ── 1. Reparto puro ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const sA = (deposito: string, codigo: string, disponible: string, extra: Partial<SaldoDisponible> = {}): SaldoDisponible => ({ productoId: P1, depositoId: deposito, depositoCodigo: codigo, depositoNombre: "Depósito " + codigo, loteId: null, loteCodigo: null, vencimiento: null, disponible, ...extra });
  const linea = (cantidad: string, extra: Record<string, unknown> = {}) => ({ productoId: P1, codigo: "P-1", descripcion: "Producto P-1", cantidad, controlaStock: true, ...extra });

  {
    const plan = asignarStock([linea("6")], [sA(DEP_B, "B", "5"), sA(DEP_A, "A", "3")]);

    igual("E02-01 A=3, B=5, vender 6 → una línea con dos salidas: 3 de A + 3 de B (depósitos por código ascendente), suficiente", [plan.suficiente, plan.lineas.length, plan.salidas.map((s) => s.depositoCodigo + ":" + s.cantidad)], [true, 1, ["A:3", "B:3"]]);
    igual("E02-02 vender 2 con A=3, B=5 sale solo de A; vender 8 consume A y B completos", [asignarStock([linea("2")], [sA(DEP_A, "A", "3"), sA(DEP_B, "B", "5")]).salidas.map((s) => s.depositoCodigo + ":" + s.cantidad), asignarStock([linea("8")], [sA(DEP_A, "A", "3"), sA(DEP_B, "B", "5")]).salidas.map((s) => s.depositoCodigo + ":" + s.cantidad)], [["A:2"], ["A:3", "B:5"]]);
  }
  {
    const insuf = asignarStock([linea("9")], [sA(DEP_A, "A", "3"), sA(DEP_B, "B", "5")]);

    igual("E02-03 pedido 9 con 8 disponibles → insuficiente, faltante 1, sin salidas parciales", [insuf.suficiente, insuf.lineas[0].faltante, insuf.lineas[0].disponible, insuf.salidas.length], [false, "1", "8", 0]);
    igual("E02-04 sin ningún saldo (producto sin stock) → insuficiente con disponible 0", [asignarStock([linea("1")], []).suficiente, asignarStock([linea("1")], []).lineas[0].disponible], [false, "0"]);
  }
  igual("E02-05 fracciones exactas: 5.5 disponibles → 5.5 alcanza, 5.6 se bloquea; diferencia mínima 0.0001", [asignarStock([linea("5.5")], [sA(DEP_A, "A", "5.5")]).suficiente, asignarStock([linea("5.6")], [sA(DEP_A, "A", "5.5")]).suficiente, asignarStock([linea("5.5001")], [sA(DEP_A, "A", "5.5")]).suficiente, asignarStock([linea("0.0001")], [sA(DEP_A, "A", "0.0001")]).suficiente], [true, false, false, true]);
  {
    const lotes = asignarStock([linea("5")], [sA(DEP_A, "A", "3", { loteId: LOTE_2, loteCodigo: "L-2", vencimiento: "2027-06-01" }), sA(DEP_A, "A", "3", { loteId: LOTE_1, loteCodigo: "L-1", vencimiento: "2026-12-01" }), sA(DEP_A, "A", "9", { loteId: null })]);

    igual("E02-06 dentro del depósito, FEFO: primero el lote que vence antes, luego el posterior, sin vencimiento al final; una salida por lote", lotes.salidas.map((s) => (s.loteCodigo ?? "sin-lote") + ":" + s.cantidad), ["L-1:3", "L-2:2"]);
  }
  igual("E02-07 el mismo producto en dos líneas se agrega (control por producto); un servicio (no controla stock) se ignora", (() => {
    const plan = asignarStock([linea("2"), linea("3"), { ...linea("100"), productoId: SERV, controlaStock: false }], [sA(DEP_A, "A", "5")]);

    return [plan.lineas.length, plan.lineas[0].requerido, plan.suficiente, plan.salidas.length];
  })(), [1, "5", true, 1]);
  igual("E02-08 cantidad inválida (vacía, 0, cinco decimales) se trata como insuficiente (nunca baja nada)", ["", "0", "1.23456"].map((c) => asignarStock([linea(c)], [sA(DEP_A, "A", "10")]).suficiente), [false, false, false]);
  {
    const h1 = huellaReparto(asignarStock([linea("6")], [sA(DEP_A, "A", "3"), sA(DEP_B, "B", "5")]).salidas);
    const h2 = huellaReparto(asignarStock([linea("6")], [sA(DEP_B, "B", "5"), sA(DEP_A, "A", "3")]).salidas);
    const h3 = huellaReparto(asignarStock([linea("6")], [sA(DEP_A, "A", "2"), sA(DEP_B, "B", "5")]).salidas);

    igual("E02-09 la huella del reparto es estable (no depende del orden de entrada) y cambia si cambia el reparto", [h1 === h2, h1 === h3, /^[0-9a-f]{64}$/.test(h1)], [true, false, true]);
  }

  // ── 2. Previa y emisión con la orquestación real (simulador del contrato NEX-067) ────────────────────────────────────────────────────────────────
  {
    const m = mundo([base(P1, DEP_A, "A", 3), base(P1, DEP_B, "B", 5)]);
    const c = cuerpo([{ productoId: P1, cantidad: "6" }]);
    const prep = await prepararFactura(m.db, EMPRESA, USUARIO, c);
    const plan = await planificarStock(m.db, EMPRESA, USUARIO, SUC, prep.lineasStock);
    const antes = m.saldo(P1, DEP_A) + m.saldo(P1, DEP_B);

    igual("E02-10 la previa calcula y muestra 3 de A + 3 de B sin descontar nada; el payload sigue con UNA línea fiscal de cantidad 6", [plan.suficiente, plan.salidas.map((s) => s.depositoCodigo + ":" + s.cantidad), antes, (prep.payload as unknown as { Detalles: Array<{ dCantProSer: number }> }).Detalles.map((d) => d.dCantProSer)], [true, ["A:3", "B:3"], 8, [6]]);
    igual("E02-11 el control de stock no consulta escrituras en la previa (solo fe_stock_disponibilidad)", m.consultas.filter((q) => /INSERT|UPDATE|fe_documento_crear_fe/.test(q)).length, 0);

    const creado = await crearFacturaElectronica(m.db, EMPRESA, USUARIO, { ...c, repartoHuella: plan.huella });

    igual("E02-12 emitir con el reparto revisado: A 3→0 y B 5→2, una salida (movimiento) por depósito vinculada a la misma FE y una única FE", [m.saldo(P1, DEP_A), m.saldo(P1, DEP_B), m.salidas.length, new Set(m.salidas.map((s) => s.doc)).size, m.docs.size, creado.reutilizado], [0, 2, 2, 1, 1, false]);
    igual("E02-13 las salidas conservan producto y cantidad exactos por depósito (3 + 3 = 6)", m.salidas.map((s) => s.lineas.map((l) => l.producto === P1 ? l.cantidad : -1)), [[3], [3]]);

    // Repetición de la misma clave (doble clic / respuesta perdida): NO baja otra vez, ni vuelve a evaluar el stock (ya consumido).
    const repetida = await crearFacturaElectronica(m.db, EMPRESA, USUARIO, { ...c, repartoHuella: plan.huella });
    const repetidaSinHuella = await crearFacturaElectronica(m.db, EMPRESA, USUARIO, c);

    igual("E02-14 reintento con la misma clave: reutiliza la FE, sin segunda baja y sin error aunque el stock restante ya no alcance", [repetida.reutilizado, repetidaSinHuella.reutilizado, m.saldo(P1, DEP_A), m.saldo(P1, DEP_B), m.salidas.length, m.docs.size], [true, true, 0, 2, 2, 1]);
  }
  {
    const m = mundo([base(P1, DEP_A, "A", 3), base(P1, DEP_B, "B", 5)]);
    const e = await estado(crearFacturaElectronica(m.db, EMPRESA, USUARIO, { ...cuerpo([{ productoId: P1, cantidad: "9" }]), repartoHuella: "a".repeat(64) }));

    igual("E02-15 stock insuficiente (9 > 8): 409 con el detalle, sin FE, sin movimientos y sin tocar saldos", [e.startsWith("409:Stock insuficiente"), /pedido 9, disponible 8/.test(e), m.docs.size, m.salidas.length, m.saldo(P1, DEP_A), m.saldo(P1, DEP_B)], [true, true, 0, 0, 3, 5]);
  }
  {
    // Fracciones de punta a punta.
    const m = mundo([base(P1, DEP_A, "A", 5.5)]);
    const c55 = cuerpo([{ productoId: P1, cantidad: "5,5" }]);
    const prep = await prepararFactura(m.db, EMPRESA, USUARIO, c55);
    const plan = await planificarStock(m.db, EMPRESA, USUARIO, SUC, prep.lineasStock);

    await crearFacturaElectronica(m.db, EMPRESA, USUARIO, { ...c55, repartoHuella: plan.huella });
    igual("E02-16 cantidad 5,5 (coma): el stock baja exactamente 5,5 (quedan 0) y el movimiento registra 5.5", [m.saldo(P1, DEP_A), m.salidas[0].lineas[0].cantidad], [0, 5.5]);
    igual("E02-17 5.6 con 5.5 disponibles se bloquea en la emisión", await estado(crearFacturaElectronica(mundo([base(P1, DEP_A, "A", 5.5)]).db, EMPRESA, USUARIO, { ...cuerpo([{ productoId: P1, cantidad: "5.6" }]), repartoHuella: "b".repeat(64) })).then((x) => x.slice(0, 4)), "409:");
  }

  // ── 3. Qué cuenta como disponible ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const m = mundo([
      base(P1, DEP_A, "A", 2),
      base(P1, DEP_A, "A", 50, { estado: "RESERVADO" }), base(P1, DEP_A, "A", 50, { estado: "CUARENTENA" }), base(P1, DEP_A, "A", 50, { estado: "TRANSITO" }), base(P1, DEP_A, "A", 50, { propiedad: "TERCERO", lote: LOTE_1 }),
      base(P1, DEP_B, "B", 50, { activo: false }), base(P1, DEP_C, "C", 50, { sucursal: "otra-sucursal" }), base(P1, DEP_C, "C", 50, { tercero: true }),
    ]);
    const prep = await prepararFactura(m.db, EMPRESA, USUARIO, cuerpo([{ productoId: P1, cantidad: "3" }]));
    const plan = await planificarStock(m.db, EMPRESA, USUARIO, SUC, prep.lineasStock);

    igual("E02-18 solo cuenta DISPONIBLE/PROPIO de depósitos activos propios de la sucursal: reservado, cuarentena, tránsito, de terceros, inactivo y de otra sucursal NO suman (2 disponibles → 3 se bloquea)", [plan.suficiente, plan.lineas[0].disponible], [false, "2"]);
  }
  {
    const m = mundo([base(P1, DEP_A, "A", 3), base(P1, DEP_B, "B", 5)], { sinAlcance: [DEP_B] });
    const prep = await prepararFactura(m.db, EMPRESA, USUARIO, cuerpo([{ productoId: P1, cantidad: "6" }]));
    const plan = await planificarStock(m.db, EMPRESA, USUARIO, SUC, prep.lineasStock);

    igual("E02-19 un depósito fuera del alcance del usuario no entra en el reparto (A=3 visible, B oculto → 6 se bloquea)", [plan.suficiente, plan.lineas[0].disponible], [false, "3"]);
  }

  // ── 4. Reparto aprobado vs. stock cambiado; concurrencia ────────────────────────────────────────────────────────────────────────────────────────
  {
    const m = mundo([base(P1, DEP_A, "A", 3), base(P1, DEP_B, "B", 5)]);
    const c = cuerpo([{ productoId: P1, cantidad: "6" }]);
    const prep = await prepararFactura(m.db, EMPRESA, USUARIO, c);
    const aprobado = await planificarStock(m.db, EMPRESA, USUARIO, SUC, prep.lineasStock);

    m.stock[0].cantidad = 2; // otra venta consumió 1 de A después de la revisión: el reparto vigente sería A2 + B4
    const cambio = await estado(crearFacturaElectronica(m.db, EMPRESA, USUARIO, { ...c, repartoHuella: aprobado.huella }));
    const sinHuella = await estado(crearFacturaElectronica(m.db, EMPRESA, USUARIO, c));

    igual("E02-20 si el reparto revisado ya no coincide (o no se envió la huella) se exige revisar de nuevo: 409, sin sustituir en silencio, sin FE ni baja", [cambio, sinHuella, m.docs.size, m.salidas.length, m.saldo(P1, DEP_A), m.saldo(P1, DEP_B)], ["409:" + MENSAJE_REPARTO_CAMBIO, "409:" + MENSAJE_REPARTO_CAMBIO, 0, 0, 2, 5]);
  }
  {
    // Dos facturas simultáneas de 4 unidades con 6 disponibles en total (A=3, B=3): ambas pasan la lectura, la segunda emisión es rechazada por la revalidación bajo bloqueo.
    const m = mundo([base(P1, DEP_A, "A", 3), base(P1, DEP_B, "B", 3)]);
    const c1 = cuerpo([{ productoId: P1, cantidad: "4" }], "clave-factura-uno-01");
    const c2 = cuerpo([{ productoId: P1, cantidad: "4" }], "clave-factura-dos-02");
    const [prep1, prep2] = await Promise.all([prepararFactura(m.db, EMPRESA, USUARIO, c1), prepararFactura(m.db, EMPRESA, USUARIO, c2)]);
    const [plan1, plan2] = await Promise.all([planificarStock(m.db, EMPRESA, USUARIO, SUC, prep1.lineasStock), planificarStock(m.db, EMPRESA, USUARIO, SUC, prep2.lineasStock)]);
    const resultados = await Promise.all([
      crearFacturaElectronica(m.db, EMPRESA, USUARIO, { ...c1, repartoHuella: plan1.huella }).then(() => "OK", (e: ErrorSql) => e.detail ?? e.message),
      crearFacturaElectronica(m.db, EMPRESA, USUARIO, { ...c2, repartoHuella: plan2.huella }).then(() => "OK", (e: ErrorSql) => e.detail ?? e.message),
    ]);

    igual("E02-21 concurrencia: dos ventas de 4 con 6 disponibles → exactamente UNA se emite, la otra recibe NEX:STOCK_INSUFICIENTE; sin saldo negativo ni doble consumo", [resultados.filter((r) => r === "OK").length, resultados.filter((r) => r === "NEX:STOCK_INSUFICIENTE").length, m.docs.size, m.saldo(P1, DEP_A) + m.saldo(P1, DEP_B), m.stock.every((s) => s.cantidad >= 0)], [1, 1, 1, 2, true]);

    // Doble clic simultáneo con la MISMA clave: una FE y una baja.
    const m2 = mundo([base(P1, DEP_A, "A", 3), base(P1, DEP_B, "B", 5)]);
    const c = cuerpo([{ productoId: P1, cantidad: "6" }], "clave-doble-clic-0001");
    const prep = await prepararFactura(m2.db, EMPRESA, USUARIO, c);
    const plan = await planificarStock(m2.db, EMPRESA, USUARIO, SUC, prep.lineasStock);
    const dobles = await Promise.all([crearFacturaElectronica(m2.db, EMPRESA, USUARIO, { ...c, repartoHuella: plan.huella }), crearFacturaElectronica(m2.db, EMPRESA, USUARIO, { ...c, repartoHuella: plan.huella })]);

    igual("E02-22 doble clic simultáneo con la misma clave: una sola FE y una sola baja (3+3), la segunda llamada se reconoce como repetida", [dobles.map((d) => d.reutilizado).sort(), m2.docs.size, m2.salidas.length, m2.saldo(P1, DEP_A) + m2.saldo(P1, DEP_B)], [[false, true], 1, 2, 2]);
  }

  // ── 5. Servicios y facturas mixtas ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const m = mundo([base(P1, DEP_A, "A", 10)]);
    const c = cuerpo([{ productoId: P1, cantidad: "2" }, { productoId: SERV, cantidad: "7" }]);
    const prep = await prepararFactura(m.db, EMPRESA, USUARIO, c);
    const plan = await planificarStock(m.db, EMPRESA, USUARIO, SUC, prep.lineasStock);

    await crearFacturaElectronica(m.db, EMPRESA, USUARIO, { ...c, repartoHuella: plan.huella });
    igual("E02-23 factura con mercadería + servicio: solo la mercadería baja (2 de A); el servicio no se consulta ni genera movimiento", [m.saldo(P1, DEP_A), m.salidas.length, m.salidas[0].lineas.length, plan.lineas.length], [8, 1, 1, 1]);

    const m2 = mundo([]);
    const soloServicio = cuerpo([{ productoId: SERV, cantidad: "3" }]);
    const prep2 = await prepararFactura(m2.db, EMPRESA, USUARIO, soloServicio);
    const antesConsultas = m2.consultas.length;

    await planificarStock(m2.db, EMPRESA, USUARIO, SUC, prep2.lineasStock);
    await crearFacturaElectronica(m2.db, EMPRESA, USUARIO, soloServicio);
    igual("E02-24 factura solo de servicios: no consulta stock, no exige huella y emite sin salidas", [m2.consultas.slice(antesConsultas).some((q) => /fe_stock_disponibilidad/.test(q)), m2.docs.size, m2.salidas.length], [false, 1, 0]);
  }

  // ── 6. SQL de NEX-067 (estructural: NO se ejecutó) y cableado de la aplicación ──────────────────────────────────────────────────────────────────
  const sql = leer("documentacao/banco/nexit/v1/migraciones/NEX-067-facturacion-stock-baja-fe.sql");
  const emision = leer("lib/facturacion/emision.ts");
  const pagina = leer("app/(private)/facturas/nueva/page.tsx");
  const previa = leer("app/api/facturas/previa/route.ts");

  cierto("E02-30 SQL: disponibilidad solo DISPONIBLE/PROPIO, depósitos activos propios de la sucursal que emite y en el alcance del usuario; exige FACTURACION_ELECTRONICA.CREAR", /estado_stock = 'DISPONIBLE' AND s\.propiedad = 'PROPIO'/.test(sql) && /d\.activo AND NOT d\.es_de_terceros AND d\.sucursal_id = p_sucursal/.test(sql) && /usuario_puede_deposito\(p_empresa, p_usuario, d\.id\)/.test(sql) && /'FACTURACION_ELECTRONICA', 'CREAR'/.test(sql) && /pr\.controla_stock/.test(sql));
  cierto("E02-31 SQL: la baja es atómica con la FE (el envoltorio llama a fe_documento_crear_fe y a fe_stock_baja_documento en la misma función), no repite en reutilización y la baja interna no la ejecuta la aplicación", /FROM public\.fe_documento_crear_fe\(p_empresa/.test(sql) && /IF NOT v_reutilizado THEN\s+PERFORM public\.fe_stock_baja_documento/.test(sql) && /REVOKE ALL ON FUNCTION public\.fe_stock_baja_documento\(uuid, uuid, uuid, jsonb\) FROM nexit_runtime/.test(sql) && !/GRANT EXECUTE ON FUNCTION public\.fe_stock_baja_documento/.test(sql));
  cierto("E02-32 SQL: idempotencia y auditoría — bloqueo advisory por documento, vínculo PK (empresa, documento, depósito), clave 'FE-STOCK:<doc>:<depósito>', un movimiento SALIDA/VENTA por depósito, tabla inmutable", /pg_advisory_xact_lock\(hashtextextended\('fe\.stock:'/.test(sql) && /PRIMARY KEY \(empresa_id, documento_id, deposito_id\)/.test(sql) && /'FE-STOCK:' \|\| p_documento::text \|\| ':' \|\| v_dep::text/.test(sql) && /'SALIDA', 'VENTA'/.test(sql) && /fe_stock_salidas_inmutable_trg BEFORE UPDATE OR DELETE/.test(sql) && /IF EXISTS \(SELECT 1 FROM public\.documento_electronico_stock_salidas WHERE empresa_id = p_empresa AND documento_id = p_documento\) THEN\s+RETURN 0;/.test(sql));
  cierto("E02-33 SQL: revalida bajo FOR UPDATE (costo y luego saldo, igual que el motor), bloquea con NEX:STOCK_INSUFICIENTE, concilia con el payload persistido (dCodInt/dCantProSer), usa el motor de líneas de Inventario y cantidades de 4 decimales; NEX-014 no se modifica", /FOR UPDATE;\s+IF NOT FOUND THEN\s+RAISE EXCEPTION 'stock disponible insuficiente para facturar/.test(sql) && /NEX:STOCK_INSUFICIENTE/.test(sql) && /d->>'dCodInt'/.test(sql) && /d->>'dCantProSer'/.test(sql) && /public\.inventario_agregar_linea\(p_empresa, v_mov, b\.producto_id, b\.cantidad/.test(sql) && /round\(\(a\.x->>'cantidad'\)::numeric, 4\)/.test(sql) && !/CREATE OR REPLACE FUNCTION (public\.)?inventario_(registrar_movimiento|registrar_linea|agregar_linea)/.test(sql) && !/UPDATE public\.stock_saldos|INSERT INTO public\.stock_saldos/.test(sql));
  cierto("E02-34 SQL: grants — la aplicación ejecuta solo la disponibilidad y la emisión atómica; la creación de FE SIN baja (fe_documento_crear_fe) deja de ser ejecutable por la aplicación; helper descubierto por el envoltorio; migración NO aplicada", /GRANT EXECUTE ON FUNCTION public\.fe_stock_disponibilidad/.test(sql) && /GRANT EXECUTE ON FUNCTION public\.fe_documento_crear_fe_con_stock/.test(sql) && /REVOKE ALL ON FUNCTION public\.fe_documento_crear_fe\(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb\) FROM nexit_runtime/.test(sql) && /nex_aplicar_grants_facturacion_stock/.test(sql) && /NO aplicada/.test(sql));
  cierto("E02-35 aplicación: la emisión usa SOLO la función atómica (nunca fe_documento_crear_fe directa), no vuelve a evaluar stock si la clave ya existe, exige la huella del reparto revisado y no escribe en stock_saldos", /FROM fe_documento_crear_fe_con_stock_entrega\(/.test(emision) && !/FROM fe_documento_crear_fe_con_stock\(/.test(emision) && !/FROM fe_documento_crear_fe\(/.test(emision) && /clave_idempotencia = \$2/.test(emision) && /cuerpo\.repartoHuella !== plan\.huella/.test(emision) && !/stock_saldos/.test(emision) && !/inventario_registrar/.test(emision));
  cierto("E02-36 previa y pantalla: la previa devuelve el reparto (sin escribir) y bloquea si no alcanza; el resumen muestra la salida por depósito y la huella revisada viaja con el envío", /planificarStock\(b\.db/.test(previa) && /mensajeStockInsuficiente/.test(previa) && /resumen: plan\.lineas\.length > 0 \? \{ \.\.\.resumen, stock: resumenStock\(plan\) \}/.test(previa) && /Salida de stock por depósito/.test(pagina) && /enviar: async \(cuerpo, revisado\)/.test(pagina) && /repartoHuella: repartoDe\(revisado\)/.test(pagina) && /const repartoDe = \(r: Resumen \| null\): string \| null => r\?\.stock\?\.huella \?\? null/.test(pagina) && /deps\.enviar\(toma\.cuerpo, toma\.resumen\)/.test(leer("lib/facturacion/revision-factura.ts")));
  cierto("E02-37 documentación operativa de NEX-067: preflight, verificación, reversión y procedimiento versionados", ["scripts/preflight-NEX-067.sql", "scripts/verificar-NEX-067.sql", "scripts/reversion-NEX-067.sql", "docs/PROCEDIMIENTO-NEX-067.md"].every((f) => { try { return leer("documentacao/banco/nexit/v1/" + f).length > 200; } catch { return false; } }));


  // ── 7. AUD E02-R01 — PRO-202 / F-001: una salida vinculada a una FE NO se anula manualmente ───────────────────────────────────────────────────
  const errDetalle = async (p: Promise<unknown>) => { try { await p; return "OK"; } catch (e) { return (e as ErrorSql).detail ?? (e as Error).message; } };

  {
    const m = mundo([base(P1, DEP_A, "A", 3), base(P1, DEP_B, "B", 5)]);
    const c = cuerpo([{ productoId: P1, cantidad: "6" }]);
    const prep = await prepararFactura(m.db, EMPRESA, USUARIO, c);
    const plan = await planificarStock(m.db, EMPRESA, USUARIO, SUC, prep.lineasStock);

    await crearFacturaElectronica(m.db, EMPRESA, USUARIO, { ...c, repartoHuella: plan.huella });

    const intentos = await Promise.all(m.salidas.map((x) => errDetalle(m.anular(x.movimiento))));
    const concurrente = await Promise.all([errDetalle(m.anular(m.salidas[0].movimiento)), errDetalle(m.anular(m.salidas[0].movimiento))]);

    igual("F001-01 FE con salidas A3+B3: intentar anular CADA salida (con o sin MOVIMIENTOS.ANULAR) falla con NEX:MOVIMIENTO_VINCULADO_FE; ni siquiera un administrador repone stock", intentos, ["NEX:MOVIMIENTO_VINCULADO_FE", "NEX:MOVIMIENTO_VINCULADO_FE"]);
    igual("F001-02 tras los intentos no hay movimiento de compensación ni aumento de saldo (A=0, B=2), las salidas siguen registradas y la FE sigue siendo una sola", [m.saldo(P1, DEP_A), m.saldo(P1, DEP_B), m.anulaciones.length, m.salidas.length, m.docs.size], [0, 2, 0, 2, 1]);
    igual("F001-03 intentos de anulación concurrentes sobre la misma salida: todos rechazados", concurrente, ["NEX:MOVIMIENTO_VINCULADO_FE", "NEX:MOVIMIENTO_VINCULADO_FE"]);

    const reintento = await crearFacturaElectronica(m.db, EMPRESA, USUARIO, { ...c, repartoHuella: plan.huella });

    igual("F001-04 el reintento de la FE tras los intentos de anulación sigue reutilizando el documento: no crea otra baja ni otra salida", [reintento.reutilizado, m.salidas.length, m.saldo(P1, DEP_A) + m.saldo(P1, DEP_B)], [true, 2, 2]);
  }
  {
    // Una salida MANUAL no vinculada a FE sigue pudiendo anularse (el comportamiento de Movimientos no cambia).
    const m = mundo([base(P1, DEP_A, "A", 4)]);

    m.manuales.push({ id: "MOV-MANUAL-1", deposito: DEP_A, producto: P1, cantidad: 3, estado: "REGISTRADO" });
    m.stock[0].cantidad -= 3;
    await m.anular("MOV-MANUAL-1");
    igual("F001-05 anular una SALIDA manual no ligada a FE sigue funcionando: repone 3 y queda ANULADO", [m.saldo(P1, DEP_A), m.manuales[0].estado, m.anulaciones], [4, "ANULADO", ["MOV-MANUAL-1"]]);
  }

  const sql2 = leer("documentacao/banco/nexit/v1/migraciones/NEX-067-facturacion-stock-baja-fe.sql");
  const proc = leer("documentacao/banco/nexit/v1/docs/PROCEDIMIENTO-NEX-067.md");
  const rev = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-067.sql");
  const ver = leer("documentacao/banco/nexit/v1/scripts/verificar-NEX-067.sql");
  const mig009 = leer("documentacao/banco/nexit/v1/migraciones/NEX-009-inventario-costos.sql");

  cierto("F001-06 SQL: disparador BEFORE UPDATE OF estado sobre movimientos_inventario que rechaza la transición a ANULADO de un movimiento vinculado en documento_electronico_stock_salidas (NEX:MOVIMIENTO_VINCULADO_FE), SECURITY DEFINER con search_path fijo y sin permisos para PUBLIC", /CREATE OR REPLACE FUNCTION public\.fe_stock_movimiento_protegido\(\) RETURNS trigger\s+LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp/.test(sql2) && /NEW\.estado = 'ANULADO' AND OLD\.estado IS DISTINCT FROM 'ANULADO'\s+AND EXISTS \(SELECT 1 FROM public\.documento_electronico_stock_salidas s WHERE s\.empresa_id = OLD\.empresa_id AND s\.movimiento_id = OLD\.id\)/.test(sql2) && /DETAIL = 'NEX:MOVIMIENTO_VINCULADO_FE'/.test(sql2) && /CREATE TRIGGER fe_stock_movimiento_protegido_trg BEFORE UPDATE OF estado ON public\.movimientos_inventario\s+FOR EACH ROW/.test(sql2) && /REVOKE ALL ON FUNCTION public\.fe_stock_movimiento_protegido\(\) FROM PUBLIC/.test(sql2) && !/administrador|es_administrador/.test(sql2.slice(sql2.indexOf("fe_stock_movimiento_protegido() RETURNS"), sql2.indexOf("CREATE TRIGGER fe_stock_movimiento_protegido_trg"))));
  cierto("F001-07 el disparador dispara ANTES que el guard de NEX-014 (orden alfabético: fe_stock_… < movimientos_inventario_guard_trg), la excepción deshace la transacción de la función de anulación completa (también el movimiento inverso) y NEX-014 NO se modificó", "fe_stock_movimiento_protegido_trg" < "movimientos_inventario_guard_trg" && /CREATE TRIGGER movimientos_inventario_guard_trg/.test(mig009) && !/inventario_anular_movimiento|movimientos_inventario_guard/.test(sql2.replace(/--[^\n]*/g, "")) && !/CREATE OR REPLACE FUNCTION (public\.)?inventario_anular_movimiento/.test(sql2));
  cierto("F001-08 verificación y reversión: verificar-NEX-067 comprueba el disparador; la reversión lo elimina y sigue negándose si hay bajas vinculadas", /fe_stock_movimiento_protegido_trg/.test(ver) && /DROP TRIGGER IF EXISTS fe_stock_movimiento_protegido_trg ON public\.movimientos_inventario/.test(rev) && /DROP FUNCTION IF EXISTS public\.fe_stock_movimiento_protegido\(\)/.test(rev) && /REVERSIÓN ABORTADA: ya hay facturas con baja de stock registrada/.test(rev));
  cierto("F001-09 procedimiento: ya NO sugiere anular manualmente una salida vinculada a la FE; indica que está bloqueado y que solo la cancelación oficial (E10) revertirá el stock", !/anulación del movimiento|movimiento de entrada manual|anulación autorizada/i.test(proc) && /NO se puede anular manualmente/.test(proc) && /NEX:MOVIMIENTO_VINCULADO_FE/.test(proc) && /E10/.test(proc));
  cierto("F001-10 la API de anulación de Movimientos informa el bloqueo como 409 con el mensaje claro (sin tocar la lógica de anulación)", /NEX:MOVIMIENTO_VINCULADO_FE/.test(leer("lib/movimientos/shared.ts")));

  // ── 8. AUD E02-R01 — PRO-203 / F-002: la conciliación SQL cubre TODOS los detalles fiscales ───────────────────────────────────────────────────
  const llamar = (m: ReturnType<typeof mundo>, detalles: unknown, asignaciones: unknown[], clave = "clave-contrato-0001") =>
    (m.db as unknown as { query(sql: string, p: unknown[]): Promise<unknown> }).query("SELECT o_documento_id FROM fe_documento_crear_fe_con_stock($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::uuid, $7, $8, $11, $9::numeric, $10::jsonb, $12::jsonb)", [EMPRESA, USUARIO, SUC, PUNTO, clave, CLIENTE, "80000005-6", "CLIENTE", "11000", JSON.stringify({ iTiDE: 1, Detalles: detalles }), "PYG", JSON.stringify(asignaciones)]);
  const det = (codigo: unknown, cantidad: unknown) => ({ dCodInt: codigo, dCantProSer: cantidad });

  {
    const m = mundo([base(P1, DEP_A, "A", 10)]);
    const casos: Array<[string, unknown, string]> = [
      ["Detalles vacío", [], "NEX:STOCK_PAYLOAD_INVALIDO"],
      ["Detalles ausente", undefined, "NEX:STOCK_PAYLOAD_INVALIDO"],
      ["Detalles no es un arreglo", { dCodInt: "P-1" }, "NEX:STOCK_PAYLOAD_INVALIDO"],
      ["detalle sin dCodInt", [{ dCantProSer: 2 }], "NEX:STOCK_PAYLOAD_INVALIDO"],
      ["detalle con dCodInt vacío", [det("  ", 2)], "NEX:STOCK_PAYLOAD_INVALIDO"],
      ["código desconocido (con total positivo)", [det("DESCONOCIDO-9", 2)], "NEX:STOCK_PAYLOAD_INVALIDO"],
      ["código desconocido escondido entre detalles válidos", [det("P-1", 2), det("DESCONOCIDO-9", 1)], "NEX:STOCK_PAYLOAD_INVALIDO"],
      ["cantidad no numérica", [det("P-1", "2")], "NEX:STOCK_PAYLOAD_INVALIDO"],
      ["cantidad cero", [det("P-1", 0)], "NEX:STOCK_PAYLOAD_INVALIDO"],
      ["cantidad negativa", [det("P-1", -1)], "NEX:STOCK_PAYLOAD_INVALIDO"],
      ["detalle que no es un objeto", [null], "NEX:STOCK_PAYLOAD_INVALIDO"],
    ];

    for (const [nombre, detalles, esperado] of casos) {
      const antes = m.secuencia();

      igual("F002 [" + nombre + "]: se rechaza con " + esperado + " y no se crea la FE, no se consume numeración y no se baja stock", [await errDetalle(llamar(m, detalles, [])), m.docs.size, m.secuencia() - antes, m.salidas.length, m.saldo(P1, DEP_A)], [esperado, 0, 0, 0, 10]);
    }
    igual("F002 mercadería real con control de stock y asignaciones vacías: se rechaza (no queda fuera de la conciliación) sin FE ni baja", [await errDetalle(llamar(m, [det("P-1", 2)], [])), m.docs.size, m.saldo(P1, DEP_A)], ["NEX:STOCK_REPARTO_INVALIDO", 0, 10]);
    igual("F002 asignación para un producto que no está en los detalles fiscales: se rechaza", [await errDetalle(llamar(m, [det("SERV-1", 1)], [{ producto_id: P1, deposito_id: DEP_A, lote_id: null, cantidad: "1" }])), m.docs.size, m.saldo(P1, DEP_A)], ["NEX:STOCK_REPARTO_INVALIDO", 0, 10]);
  }
  {
    // Lo legítimo sigue funcionando: servicio real sin control de stock (sin movimiento) y factura mixta (solo la mercadería baja).
    const m = mundo([base(P1, DEP_A, "A", 10)]);

    igual("F002 servicio legítimo (controla_stock = false) sin asignaciones: la FE se crea y no hay movimiento", [await errDetalle(llamar(m, [det("SERV-1", 4)], [], "clave-servicio-0001")), m.docs.size, m.salidas.length, m.saldo(P1, DEP_A)], ["OK", 1, 0, 10]);
    igual("F002 factura mixta (mercadería + servicio): baja solo la mercadería y exactamente su cantidad", [await errDetalle(llamar(m, [det("P-1", 3), det("SERV-1", 9)], [{ producto_id: P1, deposito_id: DEP_A, lote_id: null, cantidad: "3" }], "clave-mixta-000002")), m.docs.size, m.salidas.length, m.saldo(P1, DEP_A)], ["OK", 2, 1, 7]);
    igual("F002 la misma mercadería en dos líneas fiscales se concilia por suma (2 + 3 = 5 repartidos)", [await errDetalle(llamar(m, [det("P-1", 2), det("P-1", 3)], [{ producto_id: P1, deposito_id: DEP_A, lote_id: null, cantidad: "5" }], "clave-dos-lineas-03")), m.saldo(P1, DEP_A)], ["OK", 2]);
    igual("F002 repartir menos o más de lo facturado se rechaza", [await errDetalle(llamar(m, [det("P-1", 2)], [{ producto_id: P1, deposito_id: DEP_A, lote_id: null, cantidad: "1" }], "clave-menos-000004")), await errDetalle(llamar(m, [det("P-1", 2)], [{ producto_id: P1, deposito_id: DEP_A, lote_id: null, cantidad: "3" }], "clave-mas-0000005"))], ["NEX:STOCK_REPARTO_INVALIDO", "NEX:STOCK_REPARTO_INVALIDO"]);
  }
  cierto("F002-SQL la baja valida ANTES de la conciliación que Detalles sea un arreglo no vacío y que cada detalle sea un objeto con dCodInt de un producto de la empresa y dCantProSer numérico > 0 (NEX:STOCK_PAYLOAD_INVALIDO); los servicios siguen admitidos y la conciliación por producto con control de stock se mantiene", /jsonb_typeof\(v_payload->'Detalles'\) IS DISTINCT FROM 'array' OR jsonb_array_length\(v_payload->'Detalles'\) = 0/.test(sql2) && /LEFT JOIN public\.productos p ON p\.empresa_id = p_empresa AND p\.codigo = x\.d->>'dCodInt'/.test(sql2) && /det\.producto_id IS NULL/.test(sql2) && /jsonb_typeof\(det\.d->'dCantProSer'\) IS DISTINCT FROM 'number'/.test(sql2) && /\(det\.d->>'dCantProSer'\)::numeric <= 0/.test(sql2) && /NEX:STOCK_PAYLOAD_INVALIDO/.test(sql2) && sql2.indexOf("NEX:STOCK_PAYLOAD_INVALIDO") < sql2.indexOf("Conciliación con el payload PERSISTIDO") && /AND p\.controla_stock/.test(sql2) && !/AND p\.controla_stock\s+LOOP/.test(sql2));
  cierto("F002-APP la aplicación traduce el rechazo del payload a un 409 claro", /STOCK_\(REPARTO_INVALIDO\|DEPOSITO_NO_AUTORIZADO\|PAYLOAD_INVALIDO\)/.test(leer("lib/facturacion/shared.ts")));

  // PRO-330: aviso inmediato de stock al cargar líneas (consulta anticipada de solo lectura con la misma fuente).
  fallos.push(...(await verificarCasosStockPreventivo()));

  return fallos;
}
