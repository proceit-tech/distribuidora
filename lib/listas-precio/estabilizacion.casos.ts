/**
 * Listas de precios — estabilización LPR-A01…A09 (AUD-LISTAS-PRECIOS-V1 §II y §V).
 * Sin PostgreSQL ni navegador: una conexión SIMULADA con tablas en memoria ejecuta el plan real (`planificarHijos` + `aplicarHijos`) y las validaciones reales de `shared.ts`,
 * más análisis del código de la ruta y de la pantalla. Lo concurrente de verdad (dos transacciones, FOR UPDATE) solo se comprueba en el PostgreSQL real.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { validarListaFormulario } from "@/lib/listas-precio/formulario";
import {
  ErrorLista,
  aplicarHijos,
  exigirVersionLista,
  insertarHijos,
  planificarHijos,
  prepararLista,
  validarCambioMonedaTipo,
  validarCodigoReferencia,
  validarReferenciasComerciales,
  validarUnidadesItems,
} from "@/lib/listas-precio/shared";
import type { NuevaListaPrecio } from "@/types/lista-precio";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8").replace(/\r\n/g, "\n");

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const EMP = uuid(1);
const OTRA_EMP = uuid(2);
const LISTA = uuid(10);
const U_BASE = uuid(20);
const U_CAJA = uuid(21);
const U_OTRA = uuid(22);
const P1 = uuid(31);
const P2 = uuid(32);
const P3 = uuid(33);
const P_AJENO = uuid(39);

type Item = { id: string; empresa: string; lista: string; producto: string; unidad: string; moneda: string; costo: number; base: number; precio: number; margen: number; desc: number; cant: number; desde: string; hasta: string | null; activo: boolean; version: string; creado: string };
type Escalon = { id: string; empresa: string; item: string; min: number; max: number | null; precio: number; desc: number; version: string; creado: string };
type Regla = { id: string; empresa: string; lista: string; tipo: string; ref: string | null; prio: number; cant: number; perm: boolean; descmax: number; desde: string; hasta: string | null; activo: boolean; version: string; creado: string };

function nuevaBd() {
  let seq = 1000;
  let reloj = 1;
  const tick = () => `2026-10-12T10:00:00.${String(reloj++).padStart(6, "0")}`;
  const bd = {
    items: [] as Item[],
    escalones: [] as Escalon[],
    reglas: [] as Regla[],
    productos: [
      { id: P1, empresa: EMP, base: U_BASE, presentaciones: [U_CAJA] },
      { id: P2, empresa: EMP, base: U_BASE, presentaciones: [] },
      { id: P3, empresa: EMP, base: U_BASE, presentaciones: [] },
      { id: P_AJENO, empresa: OTRA_EMP, base: U_BASE, presentaciones: [] },
    ],
    sentencias: [] as string[],
    escrituras: 0,
  };
  const nuevoId = () => uuid(seq++);
  const verbo = (sql: string) => sql.trim().split(/\s+/).slice(0, 3).join(" ");
  const arr = <T>(v: unknown) => v as T[];

  const c = {
    async query(sql: string, p: unknown[] = []) {
      const s = sql.replace(/\s+/g, " ");

      // ── Lecturas bloqueadas
      if (/^SELECT id::text AS id, producto_id::text AS producto_id/.test(s.trim())) {
        const rows = bd.items.filter((i) => i.empresa === p[0] && i.lista === p[1]).map((i) => ({ id: i.id, producto_id: i.producto, unidad_medida_id: i.unidad, version: i.version }));

        return { rows, rowCount: rows.length };
      }
      if (/FROM productos p LEFT JOIN producto_unidades/.test(s)) {
        const rows = bd.productos.filter((x) => x.empresa === p[0] && arr<string>(p[1]).includes(x.id)).map((x) => ({ id: x.id, base: x.base, presentaciones: x.presentaciones }));

        return { rows, rowCount: rows.length };
      }
      if (/FROM lista_precio_escalones WHERE empresa_id = \$1 AND lista_precio_item_id = ANY/.test(s) && /^SELECT/.test(s.trim())) {
        const rows = bd.escalones.filter((e) => e.empresa === p[0] && arr<string>(p[1]).includes(e.item)).map((e) => ({ id: e.id, item_id: e.item }));

        return { rows, rowCount: rows.length };
      }
      if (/^SELECT id::text AS id FROM lista_precio_reglas/.test(s.trim())) {
        const rows = bd.reglas.filter((r) => r.empresa === p[0] && r.lista === p[1]).map((r) => ({ id: r.id }));

        return { rows, rowCount: rows.length };
      }

      // ── Eliminaciones
      if (/^DELETE FROM lista_precio_escalones WHERE empresa_id = \$1 AND id = ANY/.test(s)) {
        bd.escalones = bd.escalones.filter((e) => !(e.empresa === p[0] && arr<string>(p[1]).includes(e.id)));
      } else if (/^DELETE FROM lista_precio_escalones WHERE empresa_id = \$1 AND lista_precio_item_id = ANY/.test(s)) {
        bd.escalones = bd.escalones.filter((e) => !(e.empresa === p[0] && arr<string>(p[1]).includes(e.item)));
      } else if (/^DELETE FROM lista_precio_items/.test(s)) {
        bd.items = bd.items.filter((i) => !(i.empresa === p[0] && i.lista === p[1] && arr<string>(p[2]).includes(i.id)));
      } else if (/^DELETE FROM lista_precio_reglas/.test(s)) {
        bd.reglas = bd.reglas.filter((r) => !(r.empresa === p[0] && r.lista === p[1] && arr<string>(p[2]).includes(r.id)));
      }
      // ── Actualizaciones (solo si algún valor cambia: IS DISTINCT FROM)
      else if (/^UPDATE lista_precio_items/.test(s)) {
        const i = bd.items.find((x) => x.empresa === p[0] && x.lista === p[1] && x.id === p[2]);

        if (i) {
          const nuevo = { unidad: (p[3] as string | null) ?? i.unidad, moneda: p[4], costo: p[5], base: p[6], precio: p[7], margen: p[8], desc: p[9], cant: p[10], desde: p[11], hasta: p[12], activo: p[13] };
          const actual = { unidad: i.unidad, moneda: i.moneda, costo: i.costo, base: i.base, precio: i.precio, margen: i.margen, desc: i.desc, cant: i.cant, desde: i.desde, hasta: i.hasta, activo: i.activo };

          if (JSON.stringify(nuevo) !== JSON.stringify(actual)) {
            Object.assign(i, nuevo, { version: tick() });
            bd.escrituras += 1;
          }
        }
      } else if (/^UPDATE lista_precio_escalones/.test(s)) {
        const e = bd.escalones.find((x) => x.empresa === p[0] && x.id === p[1]);

        if (e && JSON.stringify([e.min, e.max, e.precio, e.desc]) !== JSON.stringify([p[2], p[3], p[4], p[5]])) {
          Object.assign(e, { min: p[2], max: p[3], precio: p[4], desc: p[5], version: tick() });
          bd.escrituras += 1;
        }
      } else if (/^UPDATE lista_precio_reglas/.test(s)) {
        const r = bd.reglas.find((x) => x.empresa === p[0] && x.lista === p[1] && x.id === p[2]);

        if (r) {
          const nuevo = { tipo: p[3], ref: p[4], prio: p[5], cant: p[6], perm: p[7], descmax: p[8], desde: p[9], hasta: p[10], activo: p[11] };
          const actual = { tipo: r.tipo, ref: r.ref, prio: r.prio, cant: r.cant, perm: r.perm, descmax: r.descmax, desde: r.desde, hasta: r.hasta, activo: r.activo };

          if (JSON.stringify(nuevo) !== JSON.stringify(actual)) {
            Object.assign(r, nuevo, { version: tick() });
            bd.escrituras += 1;
          }
        }
      }
      // ── Inserciones
      else if (/^INSERT INTO lista_precio_items/.test(s)) {
        const prod = arr<string>(p[3]);
        const rows: Array<{ id: string; producto_id: string }> = [];

        prod.forEach((pid, k) => {
          // JOIN productos p ON p.empresa_id = $1: un producto de otra empresa no genera fila.
          if (!bd.productos.some((x) => x.id === pid && x.empresa === p[0])) return;

          const id = nuevoId();
          const base = bd.productos.find((x) => x.id === pid)!.base;

          bd.items.push({ id, empresa: p[0] as string, lista: p[1] as string, producto: pid, unidad: arr<string | null>(p[4])[k] ?? base, moneda: p[2] as string, costo: arr<number>(p[5])[k], base: arr<number>(p[6])[k], precio: arr<number>(p[7])[k], margen: arr<number>(p[8])[k], desc: arr<number>(p[9])[k], cant: arr<number>(p[10])[k], desde: arr<string>(p[11])[k], hasta: arr<string | null>(p[12])[k], activo: arr<boolean>(p[13])[k], version: tick(), creado: "creado-nuevo" });
          rows.push({ id, producto_id: pid });
        });
        bd.escrituras += rows.length;

        return { rows, rowCount: rows.length };
      } else if (/^INSERT INTO lista_precio_escalones/.test(s)) {
        arr<string>(p[1]).forEach((item, k) => {
          bd.escalones.push({ id: nuevoId(), empresa: p[0] as string, item, min: arr<number>(p[2])[k], max: arr<number | null>(p[3])[k], precio: arr<number>(p[4])[k], desc: arr<number>(p[5])[k], version: tick(), creado: "creado-nuevo" });
        });
        bd.escrituras += arr<string>(p[1]).length;
      } else if (/^INSERT INTO lista_precio_reglas/.test(s)) {
        bd.reglas.push({ id: nuevoId(), empresa: p[0] as string, lista: p[1] as string, tipo: p[2] as string, ref: p[3] as string | null, prio: p[4] as number, cant: p[5] as number, perm: p[6] as boolean, descmax: p[7] as number, desde: p[8] as string, hasta: p[9] as string | null, activo: p[10] as boolean, version: tick(), creado: "creado-nuevo" });
        bd.escrituras += 1;
      } else {
        throw new Error(`consulta no prevista en la simulación: ${s.slice(0, 80)}`);
      }

      bd.sentencias.push(verbo(s));

      return { rows: [], rowCount: 0 };
    },
  };

  /** Alta directa (sin pasar por la lista), como hace Productos con `producto_fijar_precio_referencia`. */
  const sembrarItem = (producto: string, extra: Partial<Item> = {}) => {
    const p = bd.productos.find((x) => x.id === producto)!;
    const item: Item = { id: nuevoId(), empresa: EMP, lista: LISTA, producto, unidad: p.base, moneda: "PYG", costo: 100, base: 200, precio: 200, margen: 50, desc: 0, cant: 1, desde: "2026-10-01", hasta: null, activo: true, version: tick(), creado: "creado-original", ...extra };

    bd.items.push(item);

    return item;
  };
  const sembrarEscalon = (item: string, extra: Partial<Escalon> = {}) => {
    const e: Escalon = { id: nuevoId(), empresa: EMP, item, min: 1, max: 10, precio: 190, desc: 0, version: tick(), creado: "creado-original", ...extra };

    bd.escalones.push(e);

    return e;
  };
  const sembrarRegla = (extra: Partial<Regla> = {}) => {
    const r: Regla = { id: nuevoId(), empresa: EMP, lista: LISTA, tipo: "GENERAL", ref: null, prio: 10, cant: 1, perm: true, descmax: 5, desde: "2026-10-01", hasta: null, activo: true, version: tick(), creado: "creado-original", ...extra };

    bd.reglas.push(r);

    return r;
  };
  /** Cambio de precio hecho por Productos (no toca la cabecera de la lista). */
  const productosFijaPrecio = (producto: string, precio: number) => {
    const i = bd.items.find((x) => x.producto === producto && x.lista === LISTA)!;

    i.precio = precio;
    i.base = precio;
    i.version = tick();
  };

  return { bd, c: c as never, sembrarItem, sembrarEscalon, sembrarRegla, productosFijaPrecio };
}

type Estado = ReturnType<typeof nuevaBd>;

/** Cuerpo que enviaría la pantalla a partir de lo cargado en la base (como GET → formulario), con cambios opcionales. */
function cuerpoDesde(e: Estado, extra: Record<string, unknown> = {}, cambiar?: (productos: Array<Record<string, unknown>>, reglas: Array<Record<string, unknown>>) => void) {
  const productos = e.bd.items.map((i) => ({
    id: i.id, version: i.version, productoId: i.producto, unidadMedidaId: i.unidad, costoReferencia: i.costo, precioBase: i.base, precioLista: i.precio, descuentoPct: i.desc, cantidadMinima: i.cant, vigenteDesde: i.desde, vigenteHasta: i.hasta ?? "", activo: i.activo,
    escalas: e.bd.escalones.filter((x) => x.item === i.id).map((x) => ({ id: x.id, cantidadMinima: x.min, cantidadMaxima: x.max, precio: x.precio, descuentoPct: x.desc })),
  }));
  const reglas = e.bd.reglas.map((r) => ({ id: r.id, tipoAplicacion: r.tipo, referenciaId: r.ref ?? "", prioridad: r.prio, cantidadMinima: r.cant, permiteDescuentoAdicional: r.perm, descuentoMaximoPct: r.descmax, vigenteDesde: r.desde, vigenteHasta: r.hasta ?? "", activo: r.activo }));

  cambiar?.(productos, reglas);

  return { nombre: "Mayorista", vigenteDesde: "2026-10-01", version: "v-cab", itemsCargados: e.bd.items.map((i) => i.id), productos, reglasComerciales: reglas, ...extra };
}

async function guardar(e: Estado, cuerpo: Record<string, unknown>) {
  const datos = prepararLista(cuerpo);
  const plan = await planificarHijos(e.c, EMP, LISTA, datos);

  await aplicarHijos(e.c, EMP, LISTA, datos, plan);

  return plan;
}

const codigoError = async (f: () => Promise<unknown>) => {
  try {
    await f();

    return "ok";
  } catch (er) {
    const x = er as ErrorLista;

    return x instanceof ErrorLista ? `${x.estado}:${x.campo ?? ""}` : `otro:${(er as Error).message}`;
  }
};

export async function verificarCasosListasEstabilizacion(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  /** Base con dos precios (P1 con dos escalones, P2 inactivo histórico) y una regla general. */
  function escenario() {
    const e = nuevaBd();
    const i1 = e.sembrarItem(P1);
    const i2 = e.sembrarItem(P2, { activo: false, precio: 300, base: 300, margen: 66.67 });
    const e1 = e.sembrarEscalon(i1.id, { min: 1, max: 10 });
    const e2 = e.sembrarEscalon(i1.id, { min: 11, max: null, precio: 180 });
    const r1 = e.sembrarRegla();

    return { e, i1, i2, e1, e2, r1 };
  }

  // ── LPR-A01: persistencia incremental (identidad conservada)
  {
    const { e, i1, i2, e1, e2, r1 } = escenario();
    const antes = JSON.stringify([e.bd.items, e.bd.escalones, e.bd.reglas]);
    const plan = await guardar(e, cuerpoDesde(e, { nombre: "Solo cambia el nombre" }));

    igual("A01 solo cambia el nombre: ningún hijo se elimina, actualiza o inserta y no se emite una sola escritura", [plan.itemsEliminar, plan.itemsNuevos, plan.escalonesEliminar, plan.escalonesNuevos, plan.reglasEliminar, plan.reglasNuevas, e.bd.escrituras], [[], [], [], [], [], [], 0]);
    cierto("A01: los mismos ids, creado_at y versión (actualizado_at) de precios, escalones y reglas — nada se regrabó", JSON.stringify([e.bd.items, e.bd.escalones, e.bd.reglas]) === antes && e.bd.items[0].id === i1.id && e.bd.escalones[0].id === e1.id && e.bd.escalones[1].id === e2.id && e.bd.reglas[0].id === r1.id);
    cierto("A01: el precio inactivo histórico enviado sin cambios se conserva (id, estado y precio)", e.bd.items.some((x) => x.id === i2.id && x.activo === false && x.precio === 300));
    igual("A01: nunca se emite DELETE/INSERT sobre una lista sin cambios", e.bd.sentencias.filter((s) => /^(DELETE|INSERT)/.test(s)), []);
  }
  {
    const { e, i1, i2 } = escenario();
    const v2 = i2.version;

    await guardar(e, cuerpoDesde(e, {}, (ps) => { ps[0].precioLista = 250; }));
    igual("A01 cambiar un precio: solo ese precio cambia (misma identidad, nueva versión); el otro y sus escalones quedan intactos", [e.bd.items.find((x) => x.id === i1.id)!.precio, e.bd.items.find((x) => x.id === i1.id)!.creado, e.bd.items.find((x) => x.id === i2.id)!.version === v2, e.bd.escalones.length], [250, "creado-original", true, 2]);
  }
  {
    const { e, i1, i2, e1, e2 } = escenario();
    const plan = await guardar(e, cuerpoDesde(e, {}, (ps) => { ps.push({ productoId: P3, unidadMedidaId: U_BASE, precioLista: 50, escalas: [{ cantidadMinima: 1, cantidadMaxima: 5, precio: 45 }] }); }));

    igual("A01 incluir un producto: se inserta solo el nuevo (con su escalón); los existentes conservan id", [plan.itemsNuevos, e.bd.items.length, e.bd.items.slice(0, 2).map((x) => x.id), e.bd.escalones.length, e.bd.escalones.slice(0, 2).map((x) => x.id)], [[2], 3, [i1.id, i2.id], 3, [e1.id, e2.id]]);
  }
  {
    const { e, i1, i2, e1, e2 } = escenario();
    const plan = await guardar(e, cuerpoDesde(e, {}, (ps) => { ps.splice(1, 1); }));

    igual("A01 excluir un producto (decisión explícita): solo se elimina ese precio; el otro y sus escalones se conservan", [plan.itemsEliminar, e.bd.items.map((x) => x.id), e.bd.escalones.map((x) => x.id)], [[i2.id], [i1.id], [e1.id, e2.id]]);
  }
  {
    const { e, i1, e1, e2 } = escenario();

    await guardar(e, cuerpoDesde(e, {}, (ps) => { (ps[0].escalas as unknown[]).splice(1, 1); (ps[0].escalas as Array<Record<string, unknown>>)[0].precio = 175; }));
    igual("A01 escalones: el eliminado desaparece, el conservado mantiene id y se actualiza", [e.bd.escalones.map((x) => x.id), e.bd.escalones[0].precio, e.bd.items[0].id === i1.id, e.bd.escalones.some((x) => x.id === e2.id)], [[e1.id], 175, true, false]);
  }
  {
    const { e, r1 } = escenario();

    await guardar(e, cuerpoDesde(e, {}, (_p, rs) => { rs[0].prioridad = 3; rs.push({ tipoAplicacion: "GENERAL", prioridad: 1 }); }));
    igual("A01 reglas: la existente conserva id y se actualiza; la nueva se inserta", [e.bd.reglas.length, e.bd.reglas[0].id === r1.id, e.bd.reglas[0].prio, e.bd.reglas[1].creado], [2, true, 3, "creado-nuevo"]);
    await guardar(e, cuerpoDesde(e, {}, (_p, rs) => { rs.splice(0, 1); }));
    igual("A01 reglas: la quitada se elimina y la otra permanece", [e.bd.reglas.length, e.bd.reglas.some((x) => x.id === r1.id)], [1, false]);
  }
  {
    const { e, i1 } = escenario();

    await guardar(e, cuerpoDesde(e, {}, (ps) => { ps[0].productoId = P3; }));
    igual("A01 la fila cambió de producto: se trata como precio nuevo y el anterior se elimina (la identidad es el producto)", [e.bd.items.some((x) => x.id === i1.id), e.bd.items.some((x) => x.producto === P3)], [false, true]);
  }

  // ── LPR-A02: versión obligatoria y conflictos (incluida la integración con Productos)
  igual("A02 cabecera: códigos (sin versión, obsoleta, vigente)", [
    await codigoError(async () => exigirVersionLista("", "2026-10-12T10:00:00.000001")),
    await codigoError(async () => exigirVersionLista("2026-10-12T10:00:00.000001", "2026-10-12T10:00:00.000002")),
    await codigoError(async () => exigirVersionLista("2026-10-12T10:00:00.000002", "2026-10-12T10:00:00.000002")),
  ], ["409:", "409:", "ok"]);
  igual("A02 microsegundos: dos versiones que difieren solo en el último dígito son distintas (no se redondea a milisegundos)", await codigoError(async () => exigirVersionLista("2026-10-12T10:00:00.123456", "2026-10-12T10:00:00.123457")), "409:");
  {
    const { e } = escenario();
    const escrituras = e.bd.escrituras;
    const cuerpo = cuerpoDesde(e, { nombre: "Edición obsoleta" });

    e.productosFijaPrecio(P1, 999);
    const r = await codigoError(() => guardar(e, cuerpo));

    igual("A02+Productos: Productos cambió el precio de referencia mientras la lista estaba abierta; guardar SOLO el nombre da 409 y NO restaura el precio antiguo", [r, e.bd.items[0].precio, e.bd.escrituras, e.bd.sentencias.filter((s) => /^(DELETE|INSERT|UPDATE)/.test(s)).length], ["409:productos.0", 999, escrituras, 0]);
  }
  {
    const { e } = escenario();
    const cuerpo = cuerpoDesde(e, {}, (ps) => { ps[1].precioLista = 111; });

    e.productosFijaPrecio(P1, 777);
    igual("A02: aunque el operador edite OTRO precio, el cambio de Productos en el primero bloquea todo el guardado (nada se escribe)", [await codigoError(() => guardar(e, cuerpo)), e.bd.items[1].precio], ["409:productos.0", 300]);
  }
  {
    const { e } = escenario();
    const cuerpo = cuerpoDesde(e);

    e.sembrarItem(P3);
    igual("A02: Productos AGREGÓ un precio después de abrir la lista: 409 y NO se elimina en silencio", [await codigoError(() => guardar(e, cuerpo)), e.bd.items.length], ["409:productos", 3]);
  }
  {
    const { e, i1 } = escenario();
    const cuerpo = cuerpoDesde(e);

    e.bd.items = e.bd.items.filter((x) => x.id !== i1.id);
    e.bd.escalones = [];
    igual("A02: Productos ELIMINÓ el precio que la pantalla tiene: 409", await codigoError(() => guardar(e, cuerpo)), "409:productos.0");
  }
  {
    const { e } = escenario();
    const cuerpo = cuerpoDesde(e);

    delete (cuerpo as Record<string, unknown>).itemsCargados;
    igual("A02: petición directa sin la relación de precios cargados: 409", await codigoError(() => guardar(e, cuerpo)), "409:productos");
    const sinVersionItem = cuerpoDesde(e, {}, (ps) => { delete ps[0].version; });

    igual("A02: petición directa con un precio existente sin su versión: 409", await codigoError(() => guardar(e, sinVersionItem)), "409:productos.0");
  }
  {
    const { e } = escenario();
    const dos = cuerpoDesde(e, {}, (ps) => { ps[0].precioLista = 210; });

    await guardar(e, dos);
    igual("A02 dos pestañas: la segunda, con las versiones de antes de la primera, recibe 409 y el precio de la primera queda", [await codigoError(() => guardar(e, dos)), e.bd.items[0].precio], ["409:productos.0", 210]);
  }
  {
    const e = nuevaBd();
    const cuerpo = cuerpoDesde(e, {});

    igual("A02: una lista sin precios y con la relación vacía guarda normalmente (caso límite)", await codigoError(() => guardar(e, cuerpo)), "ok");
  }

  // ── LPR-A03: escalones superpuestos (servidor y pantalla)
  const esc = (...r: Array<[number, number | null]>) => ({ productos: [{ productoId: P1, escalas: r.map(([a, b]) => ({ cantidadMinima: a, cantidadMaxima: b, precio: 1 })) }] });
  const prep = (extra: Record<string, unknown>) => codigoError(async () => prepararLista({ nombre: "L", vigenteDesde: "2026-10-12", ...extra }));

  igual("A03 servidor: 1–10 y 5–15 se rechazan con el campo del escalón", await prep(esc([1, 10], [5, 15])), "400:productos.0.escalas.0.cantidadMinima");
  igual("A03: límites inclusivos — 1–10 y 10–20 se rechazan; 1–10 y 11–20 son válidos", [await prep(esc([1, 10], [10, 20])), await prep(esc([1, 10], [11, 20]))], ["400:productos.0.escalas.0.cantidadMinima", "ok"]);
  igual("A03: el abierto solo puede ser el último — 1–∞ con 5–10 se rechaza; 1–10, 11–∞ vale; dos abiertos se rechazan", [await prep(esc([1, null], [5, 10])), await prep(esc([1, 10], [11, null])), await prep(esc([1, null], [20, null]))], ["400:productos.0.escalas.0.cantidadMinima", "ok", "400:productos.0.escalas.0.cantidadMinima"]);
  igual("A03: no importa el orden en que lleguen; mínimos iguales se rechazan; el error nombra la pareja", [await prep(esc([11, 20], [1, 10])), await prep(esc([5, 8], [5, 9]))], ["ok", "400:productos.0.escalas.0.cantidadMinima"]);
  cierto("A03: el mensaje del servidor nombra los rangos en conflicto", /1–10 y 5–15/.test(((): string => { try { prepararLista({ nombre: "L", vigenteDesde: "2026-10-12", ...esc([1, 10], [5, 15]) }); return ""; } catch (er) { return (er as Error).message; } })()));
  igual("A03: precios distintos tienen sus propios escalones (el mismo rango en dos productos es válido)", await prep({ productos: [{ productoId: P1, escalas: [{ cantidadMinima: 1, cantidadMaxima: 10, precio: 1 }] }, { productoId: P2, escalas: [{ cantidadMinima: 1, cantidadMaxima: 10, precio: 1 }] }] }), "ok");
  {
    const f: NuevaListaPrecio = { codigo: "", nombre: "L", descripcion: "", tipo: "VENTA", monedaCodigo: "PYG", estado: "ACTIVA", modoPrecio: "PRECIO_FIJO", incluyeIva: true, listaBaseId: "", listaBaseCodigo: "", listaBaseNombre: "", ajusteGeneralPct: 0, vigenteDesde: "2026-10-12", vigenteHasta: "", prioridad: 10, permiteDescuentoAdicional: true, descuentoMaximoPct: 5, grupoClienteId: "", grupoClienteNombre: "", clienteId: "", clienteCodigo: "", clienteNombre: "", zonaId: "", zonaNombre: "", canalVentaId: "", canalVentaNombre: "", productos: [], reglasComerciales: [], activo: true, observacion: "" };
    const prod = (escalas: Array<[number, number | null]>) => ({ id: "p", productoId: P1, productoCodigo: "", productoDescripcion: "", unidadMedidaId: "", unidadMedidaNombre: "", monedaCodigo: "PYG", costoReferencia: 0, precioBase: 1, precioLista: 1, margenPct: 0, descuentoPct: 0, cantidadMinima: 1, vigenteDesde: "2026-10-12", vigenteHasta: "", activo: true, escalas: escalas.map(([a, b], i) => ({ id: `e${i}`, cantidadMinima: a, cantidadMaxima: b, precio: 1, descuentoPct: 0 })) });

    igual("A03 formulario: escalones superpuestos bloquean el guardado con error por campo (ambos escalones marcados)", Object.keys(validarListaFormulario({ ...f, productos: [prod([[1, 10], [5, 15]])] })), ["productos.0.escalas.0.cantidadMinima", "productos.0.escalas.1.cantidadMinima"]);
    igual("A03 formulario: escalones contiguos sin conflicto no dan error", validarListaFormulario({ ...f, productos: [prod([[1, 10], [11, null]])] }), {});
  }

  // ── LPR-A04: REF-VENTA inmutable
  igual("A04 lista de referencia: otro código → error en «codigo»; mismo código o vacío → válido; lista normal puede renombrarse", [
    await codigoError(async () => validarCodigoReferencia(true, "OTRO", "REF-VENTA")),
    await codigoError(async () => validarCodigoReferencia(true, "REF-VENTA", "REF-VENTA")),
    await codigoError(async () => validarCodigoReferencia(true, "", "REF-VENTA")),
    await codigoError(async () => validarCodigoReferencia(false, "NUEVO", "LP-001")),
  ], ["400:codigo", "ok", "ok", "ok"]);

  const ruta = leer("app/api/listas-precio/[id]/route.ts");
  const form = leer("app/(private)/listas-precio/_components/lista-precio-form.tsx");
  const put = ruta.slice(ruta.indexOf("export async function PUT"));
  const iVersion = put.indexOf("exigirVersionLista(datos.version, versionActual)");
  const iCodigo = put.indexOf("validarCodigoReferencia(esReferencia");
  const iPlan = put.indexOf("planificarHijos(conexion");
  const iUpdate = put.indexOf("UPDATE listas_precio SET");
  const iAplicar = put.indexOf("aplicarHijos(conexion");

  cierto("A04/A02 ruta PUT: tras el FOR UPDATE de la cabecera se exige la versión, luego el código inmutable, el plan de hijos (lectura bloqueada y conflictos) y SOLO después el UPDATE y la aplicación", put.indexOf("FOR UPDATE") > 0 && put.indexOf("FOR UPDATE") < iVersion && iVersion < iCodigo && iCodigo < iPlan && iPlan < iUpdate && iUpdate < iAplicar);
  cierto("A01 ruta PUT: ya no borra todos los hijos ni los regraba (sin borrarHijos/insertarHijos en el PUT)", !/borrarHijos|insertarHijos/.test(put));
  cierto("A04 pantalla: el código de la lista de referencia es de solo lectura y el precio sigue editable", /readOnly=\{bloqueada\}/.test(form) && !/disabled=\{bloqueada\}[^>]*precioLista/.test(form));
  cierto("A02 GET: devuelve la versión con microsegundos de la cabecera y de cada precio", (ruta.match(/SQL_VERSION\("(l|i)\.actualizado_at"\)/g) ?? []).length === 2);
  cierto("A02 pantalla: el cuerpo conserva las versiones y envía la relación de precios cargados al abrir", /itemsCargados: \(initial\?\.productos \?\? \[\]\)\.map\(\(p\) => p\.id\)/.test(form) && /const \{ id, creadoEn, actualizadoEn, esReferencia, \.\.\.resto \} = initial/.test(form));

  // ── LPR-A05 / A08: moneda y tipo
  function conexionMt(opc: { itemsEnLista: number; derivadas: string[] }) {
    const llamadas: string[] = [];

    return {
      llamadas,
      c: {
        async query(sql: string) {
          llamadas.push(sql.replace(/\s+/g, " ").slice(0, 60));
          if (/count\(\*\)::int AS n FROM lista_precio_items/.test(sql)) return { rows: [{ n: opc.itemsEnLista }], rowCount: 1 };
          if (/lista_precio_base_id = \$2/.test(sql)) return { rows: opc.derivadas.map((codigo) => ({ codigo })), rowCount: opc.derivadas.length };

          return { rows: [], rowCount: 0 };
        },
      } as never,
    };
  }
  const cambio = (opc: { itemsEnLista: number; derivadas: string[] }, a: { moneda: string; tipo: string }, b: { moneda: string; tipo: string }) => {
    const x = conexionMt(opc);

    return codigoError(() => validarCambioMonedaTipo(x.c, EMP, LISTA, a, b)).then((r) => ({ r, llamadas: x.llamadas.length }));
  };
  const PYG = { moneda: "PYG", tipo: "VENTA" };

  igual("A05 moneda con precios guardados → error en «monedaCodigo», sin conversión", (await cambio({ itemsEnLista: 2, derivadas: [] }, PYG, { moneda: "USD", tipo: "VENTA" })).r, "400:monedaCodigo");
  igual("A05 moneda SIN precios → permitido; misma moneda no consulta nada (edición común)", [(await cambio({ itemsEnLista: 0, derivadas: [] }, PYG, { moneda: "USD", tipo: "VENTA" })).r, await cambio({ itemsEnLista: 5, derivadas: ["X"] }, PYG, PYG)], ["ok", { r: "ok", llamadas: 0 }]);
  igual("A08 lista que es base de otra: no cambia de tipo ni de moneda (aunque no tenga precios)", [(await cambio({ itemsEnLista: 0, derivadas: ["LP-002"] }, PYG, { moneda: "PYG", tipo: "COMPRA" })).r, (await cambio({ itemsEnLista: 0, derivadas: ["LP-002"] }, PYG, { moneda: "USD", tipo: "VENTA" })).r], ["400:tipo", "400:monedaCodigo"]);
  igual("A08 cadena A→B→C: A (base de B) y B (base de C) no pueden cambiar; la hoja C sí", [
    (await cambio({ itemsEnLista: 0, derivadas: ["B"] }, PYG, { moneda: "PYG", tipo: "COMPRA" })).r,
    (await cambio({ itemsEnLista: 0, derivadas: ["C"] }, PYG, { moneda: "USD", tipo: "VENTA" })).r,
    (await cambio({ itemsEnLista: 0, derivadas: [] }, PYG, { moneda: "USD", tipo: "COMPRA" })).r,
  ], ["400:tipo", "400:monedaCodigo", "ok"]);
  cierto("A05 pantalla: la moneda no se puede cambiar en edición con precios guardados (select deshabilitado con explicación) y se conserva la confirmación en el alta", /const monedaBloqueada = mode === "edit" && \(initial\?\.productos\.length \?\? 0\) > 0/.test(form) && /disabled=\{bloqueada \|\| monedaBloqueada\}/.test(form) && /NO convierte los importes/.test(form));
  cierto("A05/A08 ruta PUT: el control de moneda/tipo corre antes del UPDATE de la cabecera", put.indexOf("validarCambioMonedaTipo(conexion") > 0 && put.indexOf("validarCambioMonedaTipo(conexion") < iUpdate);

  // ── LPR-A06: unidad coherente con el producto
  {
    const e = nuevaBd();
    const u = (indice: number, productoId: string, unidadMedidaId: string | null) => ({ indice, productoId, unidadMedidaId });

    igual("A06 unidad base, presentación y sin unidad (usa la base): válidas", await codigoError(() => validarUnidadesItems(e.c, EMP, [u(0, P1, U_BASE), u(1, P1, U_CAJA), u(2, P2, null)])), "ok");
    igual("A06 unidad existente pero ajena al producto → error en el campo del precio", await codigoError(() => validarUnidadesItems(e.c, EMP, [u(0, P2, U_BASE), u(1, P2, U_OTRA)])), "400:productos.1.unidadMedidaId");
    igual("A06 la presentación de OTRO producto no vale para este (P2 no tiene Caja)", await codigoError(() => validarUnidadesItems(e.c, EMP, [u(0, P2, U_CAJA)])), "400:productos.0.unidadMedidaId");
    igual("A06 multiempresa: producto de otra empresa → «no existe en su empresa»", await codigoError(() => validarUnidadesItems(e.c, EMP, [u(0, P_AJENO, U_BASE)])), "400:productos.0.productoId");
    igual("A06 alta (POST): la unidad inválida se rechaza ANTES de insertar nada", [await codigoError(() => insertarHijos(e.c, EMP, LISTA, prepararLista({ nombre: "L", vigenteDesde: "2026-10-12", moneda: "PYG", productos: [{ productoId: P2, unidadMedidaId: U_OTRA, precioLista: 1 }] }))), e.bd.items.length], ["400:productos.0.unidadMedidaId", 0]);
    igual("A06 alta (POST): con unidad válida inserta", [await codigoError(() => insertarHijos(e.c, EMP, LISTA, prepararLista({ nombre: "L", vigenteDesde: "2026-10-12", productos: [{ productoId: P1, unidadMedidaId: U_CAJA, precioLista: 1 }] }))), e.bd.items.length, e.bd.items[0]?.unidad], ["ok", 1, U_CAJA]);
  }
  {
    // Unidad histórica ya guardada (distinta de la base actual): si no cambia, no se valida ni se toca; si cambia a una ajena, error.
    const { e, i1 } = escenario();

    i1.unidad = U_OTRA;
    const cuerpoIgual = cuerpoDesde(e, { nombre: "Histórico intacto" });

    await guardar(e, cuerpoIgual);
    igual("A06 histórico: la unidad guardada (ya no es la base ni una presentación) se conserva sin reprecificar si el operador no la cambia", [e.bd.items[0].unidad, e.bd.items[0].precio, e.bd.escrituras], [U_OTRA, 200, 0]);
    igual("A06 histórico: cambiarla a una unidad ajena se rechaza; a una válida se acepta", [await codigoError(() => guardar(e, cuerpoDesde(e, {}, (ps) => { ps[0].unidadMedidaId = uuid(77); }))), await codigoError(() => guardar(e, cuerpoDesde(e, {}, (ps) => { ps[0].unidadMedidaId = U_CAJA; })))], ["400:productos.0.unidadMedidaId", "ok"]);
    igual("A06: el cambio de unidad no recalcula el precio (U10: valores nominales intactos)", [e.bd.items[0].unidad, e.bd.items[0].precio], [U_CAJA, 200]);
  }

  // ── LPR-A07: guard oficial
  cierto("A07 pantalla: usa useProtegerCambios(sucio) y ya no tiene beforeunload ni confirmación manual en los enlaces (sin doble aviso)", /import \{ useProtegerCambios \} from "@\/lib\/ui\/proteger-cambios"/.test(form) && /useProtegerCambios\(sucio\)/.test(form) && !/beforeunload|confirmarSalida|!confirmarSalida\(\)/.test(form));
  cierto("A07: tras guardar se alinea la base (sin cambios pendientes) antes de salir, y solo hay aviso con diferencias reales", /setBase\(JSON\.stringify\(form\)\)/.test(form) && /const sucio = listaSucia\(form, base\)/.test(form));

  // ── LPR-A09: vínculo inactivo solo en el mismo contexto
  const ZONA = uuid(50);
  const GRUPO = uuid(51);
  const REGLA = uuid(52);
  function conexionRef(opc: { cab: Record<string, string | null>; reglas: Array<{ id: string; tipo_aplicacion: string; referencia_id: string | null }>; inactivos: string[]; ajenos?: string[] }) {
    return {
      async query(sql: string, p: unknown[] = []) {
        if (/FROM listas_precio WHERE/.test(sql)) return { rows: [opc.cab], rowCount: 1 };
        if (/FROM lista_precio_reglas/.test(sql)) return { rows: opc.reglas, rowCount: opc.reglas.length };

        const id = p[0] as string;

        if (opc.ajenos?.includes(id)) return { rows: [], rowCount: 0 };

        return { rows: [{ activo: !opc.inactivos.includes(id) }], rowCount: 1 };
      },
    } as never;
  }
  const refs = (opc: Parameters<typeof conexionRef>[0], cuerpoLista: Record<string, unknown>) =>
    codigoError(() => validarReferenciasComerciales(conexionRef(opc), EMP, LISTA, prepararLista({ nombre: "L", vigenteDesde: "2026-10-12", ...cuerpoLista })));
  const cabZona = { grupo_cliente_id: null, cliente_id: null, zona_comercial_id: ZONA, canal_venta_id: null };
  const sinCab = { grupo_cliente_id: null, cliente_id: null, zona_comercial_id: null, canal_venta_id: null };

  igual("A09 cabecera: la zona inactiva que la lista YA tenía en ese campo se conserva", await refs({ cab: cabZona, reglas: [], inactivos: [ZONA] }, { zonaId: ZONA }), "ok");
  igual("A09 el caso de la auditoría: zona inactiva histórica en la cabecera NO habilita una regla NUEVA con ese mismo UUID", await refs({ cab: cabZona, reglas: [], inactivos: [ZONA] }, { zonaId: ZONA, reglasComerciales: [{ tipoAplicacion: "ZONA", referenciaId: ZONA }] }), "400:reglasComerciales.0.referenciaId");
  igual("A09 regla existente inalterada (mismo id, tipo y referencia) con referencia inactiva: se conserva, también si cambia de posición", [
    await refs({ cab: sinCab, reglas: [{ id: REGLA, tipo_aplicacion: "ZONA", referencia_id: ZONA }], inactivos: [ZONA] }, { reglasComerciales: [{ id: REGLA, tipoAplicacion: "ZONA", referenciaId: ZONA }] }),
    await refs({ cab: sinCab, reglas: [{ id: REGLA, tipo_aplicacion: "ZONA", referencia_id: ZONA }], inactivos: [ZONA] }, { reglasComerciales: [{ tipoAplicacion: "GENERAL" }, { id: REGLA, tipoAplicacion: "ZONA", referenciaId: ZONA }] }),
  ], ["ok", "ok"]);
  igual("A09 mover la referencia histórica de la regla a otro campo/regla o tipo se trata como nueva y exige activa", [
    await refs({ cab: sinCab, reglas: [{ id: REGLA, tipo_aplicacion: "ZONA", referencia_id: ZONA }], inactivos: [ZONA] }, { zonaId: ZONA }),
    await refs({ cab: sinCab, reglas: [{ id: REGLA, tipo_aplicacion: "ZONA", referencia_id: ZONA }], inactivos: [ZONA, GRUPO] }, { reglasComerciales: [{ id: REGLA, tipoAplicacion: "GRUPO_CLIENTE", referenciaId: GRUPO }] }),
    await refs({ cab: sinCab, reglas: [{ id: REGLA, tipo_aplicacion: "ZONA", referencia_id: ZONA }], inactivos: [ZONA] }, { reglasComerciales: [{ id: uuid(99), tipoAplicacion: "ZONA", referenciaId: ZONA }] }),
  ], ["400:zonaId", "400:reglasComerciales.0.referenciaId", "400:reglasComerciales.0.referenciaId"]);
  igual("A09 sin vínculos previos ninguna referencia inactiva es aceptable; las activas sí", [await refs({ cab: sinCab, reglas: [], inactivos: [ZONA] }, { zonaId: ZONA }), await refs({ cab: sinCab, reglas: [], inactivos: [] }, { zonaId: ZONA })], ["400:zonaId", "ok"]);
  igual("A09 multiempresa: una referencia que no existe en la empresa de la sesión se rechaza siempre, aunque figure como previa", await refs({ cab: cabZona, reglas: [], inactivos: [], ajenos: [ZONA] }, { zonaId: ZONA }), "400:zonaId");

  return fallos;
}
