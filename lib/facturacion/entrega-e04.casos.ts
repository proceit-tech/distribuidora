/**
 * E04 (PRO-200) — dirección de entrega en la Factura Electrónica. Sin PostgreSQL ni navegador: el controlador de la pantalla y la orquestación del servidor (previa y emisión) son los REALES; la base es un simulador del
 * CONTRATO de NEX-068 (fe_entrega_opciones y fe_documento_crear_fe_con_stock_entrega). El SQL se verifica de forma estructural y NO se ejecutó (migración no aplicada); la pantalla, de forma estructural.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { crearFacturaElectronica, leerCuerpoFactura, MENSAJE_REPARTO_CAMBIO, prepararFactura, type CuerpoFactura } from "@/lib/facturacion/emision";
import { direccionCompleta, MENSAJE_ENTREGA_INVALIDA, MENSAJE_ENTREGA_REQUERIDA, nombreEntrega, pedirOpcionesEntrega, resolverEntrega, type OpcionEntrega } from "@/lib/facturacion/entrega";
import { crearControlEntrega, pendienteEntrega } from "@/lib/facturacion/entrega-control";
import { ErrorFacturacion } from "@/lib/facturacion/shared";
import { planificarStock } from "@/lib/facturacion/stock-fe";

void MENSAJE_REPARTO_CAMBIO;

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");
const EMPRESA = "11111111-1111-4111-8111-111111111111";
const USUARIO = "99999999-9999-4999-8999-999999999999";
const SUC = "55555555-5555-4555-8555-555555555555";
const PUNTO = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1";
const CLI_A = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";
const CLI_B = "c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2";
const CLI_C = "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3"; // sin destinos
const CLI_D = "c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4"; // con destinos pero sin predeterminado
const P1 = "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1";
const DEP_A = "a0000000-0000-4000-8000-00000000000a";
const dirId = (n: number) => "d1000000-0000-4000-8000-" + String(n).padStart(12, "0");

const op = (id: string, nombre: string, extra: Partial<OpcionEntrega> = {}): OpcionEntrega => ({ id, tipo: "SUCURSAL", etiqueta: nombre, descripcion: "", direccion: "Calle " + nombre, numeroCasa: "123", complemento: "", departamento: "Central", distrito: "", ciudad: "Asunción", pais: "PRY", contactoNombre: "", contactoTelefono: "", horario: "", esDefault: false, ...extra });
const A1 = op(dirId(1), "Sucursal Norte", { esDefault: true });
const A2 = op(dirId(2), "Sucursal Sur");
const A3 = op(dirId(3), "Depósito Este", { tipo: "ENTREGA" });
const B1 = op(dirId(11), "Filial B1", { esDefault: true });
const D1 = op(dirId(21), "Destino D1");
const D2 = op(dirId(22), "Destino D2");
const CATALOGO_DIRS: Record<string, OpcionEntrega[]> = { [CLI_A]: [A1, A2, A3], [CLI_B]: [B1], [CLI_C]: [], [CLI_D]: [D1, D2] };

// PRO-206: catálogo CRUDO por cliente (como direcciones_cliente) y la regla ÚNICA de elegibilidad (espejo de fe_entrega_elegible): toda dirección que no sea exclusivamente la fiscal; el fiscal solo si es predeterminado.
type DirCruda = { op: OpcionEntrega; esFiscal: boolean };
const CLI_E = "c5c5c5c5-c5c5-4c5c-8c5c-c5c5c5c5c5c5"; // cinco filiales tipo COMERCIAL, sin principal
const CLI_F = "c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6"; // cinco filiales COMERCIAL con una principal
const CLI_G = "c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7"; // solo domicilio fiscal
const CLI_H = "c8c8c8c8-c8c8-4c8c-8c8c-c8c8c8c8c8c8"; // fiscal marcado como predeterminado + comercial marcada fiscal + OTRA
const filial = (n: number, extra: Partial<OpcionEntrega> = {}): OpcionEntrega => op(dirId(100 + n), "Filial " + n, { tipo: "COMERCIAL", ...extra });
const RAW: Record<string, DirCruda[]> = {
  [CLI_E]: [1, 2, 3, 4, 5].map((n) => ({ op: filial(n), esFiscal: false })),
  [CLI_F]: [1, 2, 3, 4, 5].map((n) => ({ op: filial(n + 10, n === 3 ? { esDefault: true } : {}), esFiscal: false })),
  [CLI_G]: [{ op: op(dirId(201), "Domicilio fiscal", { tipo: "FISCAL" }), esFiscal: true }],
  [CLI_H]: [{ op: op(dirId(301), "Fiscal-predeterminado", { tipo: "FISCAL", esDefault: true }), esFiscal: true }, { op: filial(31), esFiscal: true }, { op: op(dirId(303), "Otra sede", { tipo: "OTRA" }), esFiscal: false }],
};
const elegibleRegla = (d: DirCruda): boolean => d.op.esDefault || (!d.esFiscal && d.op.tipo !== "FISCAL");
const elegiblesDe = (cliente: string): OpcionEntrega[] => CATALOGO_DIRS[cliente] ?? (RAW[cliente] ?? []).filter(elegibleRegla).map((d) => d.op).sort((a, b) => (a.esDefault === b.esDefault ? 0 : a.esDefault ? -1 : 1));

const filaCliente = (id: string) => ({ codigo: "CLI-" + id.slice(0, 2), naturaleza_receptor: 1, tipo_operacion: 1, tipo_contribuyente_sifen: 2, pais_codigo: "PRY", tipo_documento_identidad_sifen: null, descripcion_documento_identidad: null, numero_documento: "80000005", dv: "6", razon_social: "CLIENTE " + id.slice(0, 2), nombre_fantasia: null, email: null, email_copia: null, email_facturacion: null, telefono: null, celular: null, telefono_ddi: null, celular_ddi: null, activo: true, bloqueado_ventas: false, direccion: "Domicilio FISCAL " + id.slice(0, 2), numero_casa: "999", departamento_codigo: "1", distrito_codigo: "1", ciudad_codigo: "1" });
const producto = { id: P1, codigo: "P-1", controlaStock: true, descripcion: "Producto P-1", unidadSifen: 77, unidadSimbolo: "UNI", unidadNombre: "Unidad", unidadVigente: true, afectacion: 1, proporcion: null, tasa: 10, precio: "11000", monedaPrecio: "PYG", gtin: null };

function mundo(opciones: { stock?: number } = {}) {
  const llamadas: Array<{ sql: string; p: unknown[] }> = [];
  const docs = new Map<string, { id: string; numero: string }>();
  const entregas: Array<{ doc: string; cliente: string; direccion: string; snapshot: Record<string, unknown> }> = [];
  // E1: cuentas por empresa (nombre/apellido persistidos) y dInfAdic persistido por clave (snapshot de la emisión).
  const cuentas = new Map<string, { nombre: string; apellido: string | null }>([[EMPRESA + "|" + USUARIO, { nombre: "Juan", apellido: "Pérez" }]]);
  const infoPorClave = new Map<string, string | null>();
  let secuencia = 0;
  const stock = opciones.stock ?? 10;
  const db = {
    async query(sql: string, p: unknown[] = []) {
      llamadas.push({ sql, p });
      if (/FROM usuarios WHERE empresa_id/.test(sql)) { const u = cuentas.get(String(p[0]) + "|" + String(p[1])); return { rows: u ? [u] : [], rowCount: u ? 1 : 0 }; }
      if (/FROM documentos_electronicos d JOIN documento_electronico_solicitudes s/.test(sql)) return infoPorClave.has(String(p[1])) ? { rows: [{ info: infoPorClave.get(String(p[1])) }], rowCount: 1 } : { rows: [], rowCount: 0 };
      if (/usuario_tiene_permiso/.test(sql)) return { rows: [{ ok: false }], rowCount: 1 };
      if (/FROM clientes c\s+LEFT JOIN LATERAL/.test(sql)) return { rows: [filaCliente(String(p[1]))], rowCount: 1 };
      if (/SELECT c\.id, c\.naturaleza_receptor/.test(sql)) return { rows: [{ ...filaCliente(String(p[1])), id: p[1], tipo_persona: "JURIDICA", tipo_documento: "RUC" }], rowCount: 1 };
      if (/FROM direcciones_cliente/.test(sql)) return { rows: [{ cliente_id: p[1], direccion: "Domicilio FISCAL", numero_casa: "999", departamento_codigo: "1", distrito_codigo: "1", ciudad_codigo: "1", pais_codigo: "PRY" }], rowCount: 1 };
      if (/FROM referencia_geografica_paises/.test(sql)) return { rows: [{ codigo: "PRY" }], rowCount: 1 };
      if (/FROM sucursales sc JOIN empresas e/.test(sql)) return { rows: [{ empresa: "EMPRESA SINTETICA", sucursal: "Casa Central", establecimiento: "001", punto: "002", puntoNombre: "Punto 002" }], rowCount: 1 };
      if (/FROM productos p/.test(sql)) return { rows: [producto], rowCount: 1 };
      if (/FROM documentos_electronicos WHERE empresa_id/.test(sql)) return { rows: docs.has(String(p[1])) ? [{ ok: 1 }] : [], rowCount: 0 };
      if (/FROM fe_entrega_opciones/.test(sql)) {
        // Contrato SQL: solo la empresa de la sesión y el cliente pedido; cliente ajeno/inexistente → vacío.
        return { rows: p[0] === EMPRESA ? elegiblesDe(String(p[2])) : [], rowCount: 1 };
      }
      if (/FROM fe_stock_disponibilidad/.test(sql)) return { rows: [{ productoId: P1, depositoId: DEP_A, depositoCodigo: "A", depositoNombre: "Depósito A", loteId: null, loteCodigo: null, vencimiento: null, disponible: String(stock) }], rowCount: 1 };
      if (/fe_documento_crear_fe_con_stock_entrega/.test(sql)) {
        const clave = String(p[4]);
        const previo = docs.get(clave);

        if (previo) return { rows: [{ documentoId: previo.id, numero: previo.numero, reutilizado: true }], rowCount: 1 };

        const cliente = String(p[5]);
        const dir = p[12] as string | null;
        const elegibles = elegiblesDe(cliente);

        // Espejo del SQL: sin destino con destinos registrados → ENTREGA_REQUERIDA; destino ajeno/no elegible → ENTREGA_INVALIDA. Todo o nada: ni FE ni numeración.
        if (dir === null && elegibles.length > 0) throw Object.assign(new Error("el cliente tiene direcciones de entrega registradas: seleccione una"), { code: "P0001", detail: "NEX:ENTREGA_REQUERIDA" });

        const elegida = dir === null ? null : elegibles.find((o) => o.id === dir) ?? null;

        if (dir !== null && !elegida) throw Object.assign(new Error("la dirección de entrega no pertenece al cliente de la factura o ya no está disponible"), { code: "P0001", detail: "NEX:ENTREGA_INVALIDA" });

        secuencia += 1;

        const id = "d0000000-0000-4000-8000-" + String(secuencia).padStart(12, "0");

        docs.set(clave, { id, numero: "00" + String(50000 + secuencia) });
        infoPorClave.set(clave, (JSON.parse(String(p[9])) as { dInfAdic?: string | null }).dInfAdic ?? null);
        if (elegida) entregas.push({ doc: id, cliente, direccion: elegida.id, snapshot: { etiqueta: elegida.etiqueta, direccion: elegida.direccion, tipo: elegida.tipo } });

        return { rows: [{ documentoId: id, numero: "00" + String(50000 + secuencia), reutilizado: false }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  } as never;

  return { db, llamadas, docs, entregas, cuentas, infoPorClave, secuencia: () => secuencia };
}

const cuerpo = (cliente: string, extra: Record<string, unknown> = {}, clave = "clave-entrega-0001"): CuerpoFactura =>
  leerCuerpoFactura({ claveIdempotencia: clave, sucursalId: SUC, puntoId: PUNTO, clienteId: cliente, tipoTransaccion: 1, presencia: 1, pagos: [{ tipo: 1 }], infoAdicional: "", lineas: [{ productoId: P1, cantidad: "2", precio: null }], ...extra }) as CuerpoFactura;
const estado = async (p: Promise<unknown>) => { try { await p; return "OK"; } catch (e) { return e instanceof ErrorFacturacion ? e.estado + ":" + e.message : "ERR:" + String((e as Error).message); } };

export async function verificarCasosEntregaE04(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(nombre + ": esperado " + JSON.stringify(esperado) + ", obtenido " + JSON.stringify(obtenido));
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── 1. Regla pura del servidor ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
  igual("EN-01 sin destinos y sin id: se factura sin destino (ok, null); con destinos y sin id: se exige elegir", [resolverEntrega([], undefined), resolverEntrega([A1, A2], undefined)], [{ ok: true, opcion: null }, { ok: false, error: MENSAJE_ENTREGA_REQUERIDA }]);
  igual("EN-02 un id de la lista del cliente se acepta; un id ajeno, inexistente o con cliente sin destinos se rechaza", [resolverEntrega([A1, A2], A2.id), resolverEntrega([A1, A2], dirId(99)), resolverEntrega([A1, A2], B1.id), resolverEntrega([], A1.id)], [{ ok: true, opcion: A2 }, { ok: false, error: MENSAJE_ENTREGA_INVALIDA }, { ok: false, error: MENSAJE_ENTREGA_INVALIDA }, { ok: false, error: MENSAJE_ENTREGA_INVALIDA }]);
  igual("EN-03 nombre y dirección legibles (etiqueta, si no descripción, si no tipo; calle + número, ciudad, departamento)", [nombreEntrega(A1), nombreEntrega(op("x", "", { descripcion: "Depósito 7" })), nombreEntrega(op("y", "", { tipo: "ENTREGA" })), direccionCompleta(A1)], ["Sucursal Norte", "Depósito 7", "ENTREGA", "Calle Sucursal Norte 123, Asunción, Central"]);

  // ── 2. Controlador de la pantalla: carga, preselección, cambio de cliente y respuestas tardías ─────────────────────────────────────────────────
  type Pend = { cliente: string; resolver: (o: OpcionEntrega[]) => void; rechazar: (e: Error) => void; signal: AbortSignal };

  function control() {
    const pendientes: Pend[] = [];
    const ctl = crearControlEntrega({ cargar: (cliente, signal) => new Promise<OpcionEntrega[]>((resolver, rechazar) => { pendientes.push({ cliente, resolver, rechazar, signal }); }) });

    return { ctl, pendientes };
  }

  {
    const { ctl, pendientes } = control();
    const fases: string[] = [];

    ctl.suscribir(() => fases.push(ctl.estado().fase));
    const carga = ctl.seleccionarCliente(CLI_A);

    pendientes[0].resolver(CATALOGO_DIRS[CLI_A]);
    await carga;
    igual("EN-10 al elegir un cliente se cargan SUS direcciones y se preselecciona la marcada como principal; el operador puede cambiarla a otra del mismo cliente", [fases, ctl.estado().opciones.map((o) => o.id), ctl.estado().elegida], [["CARGANDO", "LISTO"], [A1.id, A2.id, A3.id], A1.id]);
    ctl.elegir(A3.id);
    igual("EN-11 elegir otra filial registrada del mismo cliente funciona; un id de otro cliente o inexistente se ignora", [ctl.estado().elegida, (ctl.elegir(B1.id), ctl.estado().elegida), (ctl.elegir("no-existe"), ctl.estado().elegida)], [A3.id, A3.id, A3.id]);
    igual("EN-12 volver a elegir el MISMO cliente no recarga ni pierde la elección del operador", [(void ctl.seleccionarCliente(CLI_A), pendientes.length), ctl.estado().elegida], [1, A3.id]);
  }
  {
    const { ctl, pendientes } = control();
    const pa = ctl.seleccionarCliente(CLI_A);

    pendientes[0].resolver(CATALOGO_DIRS[CLI_A]);
    await pa;
    ctl.elegir(A2.id);

    // Cambiar de A a B: se limpia de inmediato el destino de A.
    const pb = ctl.seleccionarCliente(CLI_B);
    const justoDespues = { ...ctl.estado() };

    igual("EN-13 al cambiar de cliente se limpia de inmediato el destino anterior y la lista del anterior (estado CARGANDO del nuevo cliente, sin elegida)", [justoDespues.clienteId, justoDespues.fase, justoDespues.opciones.length, justoDespues.elegida], [CLI_B, "CARGANDO", 0, ""]);
    pendientes[1].resolver(CATALOGO_DIRS[CLI_B]);
    await pb;
    igual("EN-14 se muestran solo las direcciones del nuevo cliente con su principal preseleccionada", [ctl.estado().clienteId, ctl.estado().opciones.map((o) => o.id), ctl.estado().elegida], [CLI_B, [B1.id], B1.id]);
  }
  {
    // Respuesta TARDÍA del cliente anterior (A responde después de elegir B): nunca restaura su lista ni su destino.
    const { ctl, pendientes } = control();
    const pa = ctl.seleccionarCliente(CLI_A);
    const pb = ctl.seleccionarCliente(CLI_B);

    pendientes[1].resolver(CATALOGO_DIRS[CLI_B]);
    await pb;
    pendientes[0].resolver(CATALOGO_DIRS[CLI_A]); // A llega tarde
    await pa;
    igual("EN-15 respuesta tardía de A después de B: se descarta (la solicitud de A fue abortada) y la pantalla conserva B", [pendientes[0].signal.aborted, ctl.estado().clienteId, ctl.estado().opciones.map((o) => o.id), ctl.estado().elegida], [true, CLI_B, [B1.id], B1.id]);

    // Error tardío de A tampoco cambia nada; quitar el cliente mientras carga descarta la respuesta.
    const { ctl: c2, pendientes: p2 } = control();
    const x = c2.seleccionarCliente(CLI_A);

    await c2.seleccionarCliente(null);
    p2[0].resolver(CATALOGO_DIRS[CLI_A]);
    await x;
    igual("EN-16 quitar el cliente mientras carga: la respuesta tardía no restaura nada", [c2.estado().fase, c2.estado().clienteId, c2.estado().opciones.length, c2.estado().elegida], ["SIN_CLIENTE", null, 0, ""]);

    const { ctl: c3, pendientes: p3 } = control();
    const y = c3.seleccionarCliente(CLI_A);
    const z = c3.seleccionarCliente(CLI_B);

    p3[1].resolver(CATALOGO_DIRS[CLI_B]);
    await z;
    p3[0].rechazar(new Error("tarde"));
    await y;
    igual("EN-17 un ERROR tardío del cliente anterior tampoco cambia el estado del cliente actual", [c3.estado().fase, c3.estado().clienteId], ["LISTO", CLI_B]);
  }
  {
    // Sin destinos, sin principal y errores de carga.
    const { ctl, pendientes } = control();
    const sin = ctl.seleccionarCliente(CLI_C);

    pendientes[0].resolver([]);
    await sin;
    igual("EN-18 cliente SIN destinos: estado listo sin opciones y nada pendiente (se factura con aviso informativo, no bloquea)", [ctl.estado().fase, ctl.estado().opciones.length, pendienteEntrega(ctl.estado())], ["LISTO", 0, ""]);

    const manual = ctl.seleccionarCliente(CLI_D);

    pendientes[1].resolver(CATALOGO_DIRS[CLI_D]);
    await manual;
    igual("EN-19 cliente con destinos pero SIN principal: no se preselecciona nada y queda pendiente elegir; elegido uno, ya no", [ctl.estado().elegida, pendienteEntrega(ctl.estado()), (ctl.elegir(D2.id), pendienteEntrega(ctl.estado())), ctl.estado().elegida], ["", "seleccionar la dirección de entrega", "", D2.id]);

    const fallo = ctl.seleccionarCliente(CLI_A);

    pendientes[2].rechazar(new Error("sin conexión"));
    await fallo;
    igual("EN-20 si la carga falla no se puede emitir (no se sabe si hay destinos): mensaje y pendiente; reintentar vuelve a pedir y recupera", [ctl.estado().fase, ctl.estado().mensaje, pendienteEntrega(ctl.estado())], ["ERROR", "sin conexión", "cargar las direcciones de entrega del cliente"]);

    const otra = ctl.reintentar();

    pendientes[3].resolver(CATALOGO_DIRS[CLI_A]);
    await otra;
    igual("EN-21 tras reintentar el cliente queda cargado con su principal; mientras carga está pendiente", [ctl.estado().fase, ctl.estado().elegida, pendienteEntrega({ clienteId: CLI_A, fase: "CARGANDO", opciones: [], elegida: "", mensaje: "" }), pendienteEntrega({ clienteId: null, fase: "SIN_CLIENTE", opciones: [], elegida: "", mensaje: "" })], ["LISTO", A1.id, "esperar las direcciones de entrega del cliente", ""]);
  }
  {
    const r = await (async () => {
      const llamadas: Array<{ url: string; init: RequestInit }> = [];
      const f = (async (url: string, init?: RequestInit) => { llamadas.push({ url, init: init ?? {} }); return new Response(JSON.stringify({ opciones: [A1] }), { status: 200, headers: { "content-type": "application/json" } }); }) as unknown as typeof fetch;
      const ctl = new AbortController();
      const o = await pedirOpcionesEntrega(CLI_A, ctl.signal, f);
      const mal = await pedirOpcionesEntrega(CLI_A, ctl.signal, (async () => new Response(JSON.stringify({ error: "No tiene permiso para esta acción." }), { status: 403 })) as unknown as typeof fetch).catch((e: Error) => e.message);

      return [llamadas[0].url, llamadas[0].init.cache, llamadas[0].init.signal === ctl.signal, o.length, mal];
    })();

    igual("EN-22 cliente HTTP: solo viaja el id del cliente (GET sin caché y con señal de aborto) y los errores del servidor se muestran", r, ["/api/facturas/clientes/" + CLI_A + "/entrega", "no-store", true, 1, "No tiene permiso para esta acción."]);
  }

  // ── 3. Servidor: previa y emisión con la orquestación real ────────────────────────────────────────────────────────────────────────────────────
  {
    const m = mundo();
    const prep = await prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_A, { direccionEntregaId: A2.id }));
    const res = prep.resumen as unknown as { entrega: { nombre: string; direccion: string } | null; cliente: { razonSocial: string } };

    igual("EN-30 la previa valida el destino contra la lista del cliente y lo muestra en el resumen; el receptor sigue siendo el fiscal del cliente", [res.entrega?.nombre, res.entrega?.direccion, res.cliente.razonSocial, prep.entrega?.id], ["Sucursal Sur", "Calle Sucursal Sur 123, Asunción, Central", "CLIENTE c1", A2.id]);

    const sinDestino = await prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_C));

    igual("EN-31 cliente sin destinos: la previa sale normalmente con entrega = null (aviso informativo en la pantalla), sin crear ninguna dirección", [(sinDestino.resumen as unknown as { entrega: unknown }).entrega, sinDestino.entrega], [null, null]);
  }
  {
    const m = mundo();
    const casos: Array<[string, CuerpoFactura, string]> = [
      ["cliente con destinos y sin elegir", cuerpo(CLI_A), "422:" + MENSAJE_ENTREGA_REQUERIDA],
      ["destino de OTRO cliente de la misma empresa (forjado)", cuerpo(CLI_A, { direccionEntregaId: B1.id }), "422:" + MENSAJE_ENTREGA_INVALIDA],
      ["destino inexistente", cuerpo(CLI_A, { direccionEntregaId: dirId(404) }), "422:" + MENSAJE_ENTREGA_INVALIDA],
      ["id enviado para un cliente sin destinos", cuerpo(CLI_C, { direccionEntregaId: A1.id }), "422:" + MENSAJE_ENTREGA_INVALIDA],
      ["cliente con destinos sin principal y sin elegir", cuerpo(CLI_D), "422:" + MENSAJE_ENTREGA_REQUERIDA],
    ];

    for (const [nombre, c, esperado] of casos) igual("EN-32 [" + nombre + "]: rechazo del servidor ANTES de reservar numeración o transmitir (sin llamada a la función de emisión)", [await estado(prepararFactura(m.db, EMPRESA, USUARIO, c)), await estado(crearFacturaElectronica(m.db, EMPRESA, USUARIO, c)), m.llamadas.some((l) => /fe_documento_crear_fe/.test(l.sql)), m.docs.size], [esperado, esperado, false, 0]);

    // Destino de OTRA empresa: la lista de esa empresa es vacía → inválido; el cuerpo no puede traer empresa.
    const otraEmpresa = await (async () => {
      const c = cuerpo(CLI_A, { direccionEntregaId: A1.id, empresaId: "otra" });

      return JSON.stringify(c).includes("otra");
    })();

    igual("EN-33 el cuerpo ignora cualquier empresa enviada por el navegador (el aislamiento sale de la sesión)", otraEmpresa, false);
    igual("EN-34 la forma del id se valida: un texto que no es UUID se rechaza al leer el cuerpo", [leerCuerpoFactura({ claveIdempotencia: "clave-entrega-0001", sucursalId: SUC, puntoId: PUNTO, clienteId: CLI_A, tipoTransaccion: 1, presencia: 1, pagos: [{ tipo: 1 }], infoAdicional: "", lineas: [{ productoId: P1, cantidad: "1", precio: null }], direccionEntregaId: "'; DROP TABLE x;--" }), leerCuerpoFactura({ claveIdempotencia: "clave-entrega-0001", sucursalId: SUC, puntoId: PUNTO, clienteId: CLI_A, tipoTransaccion: 1, presencia: 1, pagos: [{ tipo: 1 }], infoAdicional: "", lineas: [{ productoId: P1, cantidad: "1", precio: null }], direccionEntregaId: 5 })], ["La dirección de entrega no es válida.", "La dirección de entrega no es válida."]);
  }
  {
    // Emisión: el destino viaja a la función atómica, se guarda UNA vez (fotografía) y el payload fiscal es IDÉNTICO con y sin destino.
    const m = mundo();
    const c = cuerpo(CLI_A, { direccionEntregaId: A3.id });
    const prep = await prepararFactura(m.db, EMPRESA, USUARIO, c);
    const plan = await planificarStock(m.db, EMPRESA, USUARIO, SUC, prep.lineasStock);
    const creado = await crearFacturaElectronica(m.db, EMPRESA, USUARIO, { ...c, repartoHuella: plan.huella });
    const llamada = m.llamadas.find((l) => /fe_documento_crear_fe_con_stock_entrega/.test(l.sql));

    igual("EN-40 la emisión pasa el destino elegido a la función atómica (13.er parámetro) y queda guardado vinculado a la FE y al cliente correcto", [llamada?.p[12], m.entregas.map((e) => [e.cliente, e.direccion, e.snapshot.etiqueta, e.snapshot.tipo]), m.docs.size, creado.reutilizado], [A3.id, [[CLI_A, A3.id, "Depósito Este", "ENTREGA"]], 1, false]);

    const sinDest = mundo();
    const cB = cuerpo(CLI_B, { direccionEntregaId: B1.id });
    const prepB = await prepararFactura(sinDest.db, EMPRESA, USUARIO, cB);
    const prepB2 = await prepararFactura(sinDest.db, EMPRESA, USUARIO, cuerpo(CLI_B, { direccionEntregaId: B1.id }, "clave-entrega-0002"));

    igual("EN-41 el payload SIFEN no cambia por el destino: mismo payload con el mismo cuerpo y el domicilio fiscal del receptor (dDirRec) sigue siendo el fiscal, nunca el destino", [JSON.stringify(prepB.payload) === JSON.stringify(prepB2.payload), (prepB.payload as unknown as Record<string, unknown>).dDirRec, JSON.stringify({ ...(prepB.payload as unknown as Record<string, unknown>), dInfAdic: null }).includes("Filial B1")], [true, "Domicilio FISCAL c2", false]);   // E1: el destino solo viaja como línea de dInfAdic (J003), nunca en los datos fiscales
  }
  {
    const m = mundo();
    const c = cuerpo(CLI_A, { direccionEntregaId: A1.id }, "clave-doble-clic-01");
    const prep = await prepararFactura(m.db, EMPRESA, USUARIO, c);
    const plan = await planificarStock(m.db, EMPRESA, USUARIO, SUC, prep.lineasStock);
    const [x, y] = await Promise.all([crearFacturaElectronica(m.db, EMPRESA, USUARIO, { ...c, repartoHuella: plan.huella }), crearFacturaElectronica(m.db, EMPRESA, USUARIO, { ...c, repartoHuella: plan.huella })]);

    igual("EN-42 doble clic con la misma clave: una FE y un solo destino guardado; la repetición no toca el destino original", [[x.reutilizado, y.reutilizado].sort(), m.docs.size, m.entregas.length], [[false, true], 1, 1]);

    // Contrato SQL: aunque la aplicación fuese saltada, un destino ajeno o faltante deshace todo (ni FE ni numeración).
    const sql = m.db as unknown as { query(s: string, p: unknown[]): Promise<unknown> };
    const llamar = (cliente: string, dir: string | null, clave: string) => sql.query("SELECT 1 FROM fe_documento_crear_fe_con_stock_entrega($1::uuid)", [EMPRESA, USUARIO, SUC, PUNTO, clave, cliente, "x", "y", "11000", "{}", "PYG", "[]", dir]).then(() => "OK", (e: { detail?: string }) => e.detail ?? "ERR");
    const antes = m.secuencia();

    igual("EN-43 SQL (contrato): destino ajeno → NEX:ENTREGA_INVALIDA y destino faltante con destinos registrados → NEX:ENTREGA_REQUERIDA, ambos sin FE ni numeración consumida", [await llamar(CLI_A, B1.id, "clave-forjada-0001"), await llamar(CLI_A, null, "clave-forjada-0002"), await llamar(CLI_C, null, "clave-sin-dest-0003"), m.secuencia() - antes, m.docs.size], ["NEX:ENTREGA_INVALIDA", "NEX:ENTREGA_REQUERIDA", "OK", 1, 2]);
  }

  // ── 3b. PRO-206 (F-002): las filiales ya registradas como COMERCIAL se ofrecen; el domicilio exclusivamente fiscal queda aparte ───────────────────────────────────────────────────────────────
  {
    const m = mundo();

    igual("EN-60 cliente con CINCO filiales tipo COMERCIAL (sin etiquetar como SUCURSAL/ENTREGA): se ofrecen exactamente las 5 y, sin principal, hay que elegir una (no se emite sin destino)", [elegiblesDe(CLI_E).map((o) => o.id), resolverEntrega(elegiblesDe(CLI_E), undefined), await estado(prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_E))), await estado(prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_E, { direccionEntregaId: filial(4).id })))], [[1, 2, 3, 4, 5].map((n) => filial(n).id), { ok: false, error: MENSAJE_ENTREGA_REQUERIDA }, "422:" + MENSAJE_ENTREGA_REQUERIDA, "OK"]);

    const { ctl, pendientes } = control();
    const carga = ctl.seleccionarCliente(CLI_F);

    pendientes[0].resolver(elegiblesDe(CLI_F));
    await carga;
    igual("EN-61 con cinco filiales COMERCIAL y una marcada principal: se preselecciona esa (la 3.ª), aparece primero en la lista y el operador puede cambiarla a cualquiera de las otras cuatro", [ctl.estado().opciones.length, ctl.estado().elegida, ctl.estado().opciones[0].id, (ctl.elegir(filial(11).id), ctl.estado().elegida)], [5, filial(13).id, filial(13).id, filial(11).id]);

    igual("EN-62 el domicilio EXCLUSIVAMENTE fiscal no es destino: cliente con solo domicilio fiscal → sin destinos (se factura con aviso); una dirección COMERCIAL marcada fiscal tampoco", [elegiblesDe(CLI_G).length, resolverEntrega(elegiblesDe(CLI_G), undefined), elegiblesDe(CLI_H).map((o) => o.id)], [0, { ok: true, opcion: null }, [dirId(301), dirId(303)]]);
    igual("EN-63 solo el fiscal EXPLÍCITAMENTE marcado predeterminado de entrega, y las direcciones OTRA, entran en la lista (con la marcada primero)", [elegiblesDe(CLI_H).map((o) => [o.tipo, o.esDefault])], [[["FISCAL", true], ["OTRA", false]]]);
    igual("EN-64 sin destinos por ser solo fiscal, la previa sale normalmente con entrega = null; un id forjado hacia el domicilio fiscal se rechaza", [(await prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_G))).entrega, await estado(prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_G, { direccionEntregaId: dirId(201) })))], [null, "422:" + MENSAJE_ENTREGA_INVALIDA]);
  }

  // ── 3c. PRO-205 (F-001): eliminar después la dirección del catálogo no se bloquea y la FE conserva su fotografía ──────────────────────────────────────────────────────────────────────────────────
  {
    const m = mundo();
    const elegida = filial(2);
    const c = cuerpo(CLI_E, { direccionEntregaId: elegida.id }, "clave-historica-001");
    const prep = await prepararFactura(m.db, EMPRESA, USUARIO, c);
    const plan = await planificarStock(m.db, EMPRESA, USUARIO, SUC, prep.lineasStock);

    await crearFacturaElectronica(m.db, EMPRESA, USUARIO, { ...c, repartoHuella: plan.huella });

    const antes = JSON.stringify(m.entregas);

    // Clientes → Direcciones elimina la dirección ya usada (DELETE sobre direcciones_cliente): sin clave foránea no hay error y la fila histórica queda intacta.
    RAW[CLI_E] = RAW[CLI_E].filter((d) => d.op.id !== elegida.id);
    igual("EN-70 tras eliminar la dirección usada en una FE: la lista del cliente ya no la ofrece (4 restantes), pero el destino histórico y su fotografía de la FE siguen EXACTAMENTE iguales", [elegiblesDe(CLI_E).map((o) => o.id).includes(elegida.id), elegiblesDe(CLI_E).length, JSON.stringify(m.entregas) === antes, m.entregas[0].direccion, m.entregas[0].snapshot.etiqueta], [false, 4, true, elegida.id, "Filial 2"]);

    const reintento = await crearFacturaElectronica(m.db, EMPRESA, USUARIO, { ...c, repartoHuella: plan.huella });
    const nueva = await estado(prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_E, { direccionEntregaId: elegida.id }, "clave-historica-002")));

    igual("EN-71 el reintento de la FE original sigue siendo idempotente (misma FE, destino intacto) y una FE NUEVA con la dirección eliminada se rechaza como inválida (la validación de pertenencia sigue vigente)", [reintento.reutilizado, m.entregas.length, nueva], [true, 1, "422:" + MENSAJE_ENTREGA_INVALIDA]);
    RAW[CLI_E] = [1, 2, 3, 4, 5].map((n) => ({ op: filial(n), esFiscal: false })); // restablece el catálogo para las pruebas siguientes
  }

  // ── 4. SQL de NEX-068 (estructural: NO se ejecutó), ruta y pantalla ─────────────────────────────────────────────────────────────────────────────
  const sql = leer("documentacao/banco/nexit/v1/migraciones/NEX-068-facturacion-direccion-entrega.sql");
  const emision = leer("lib/facturacion/emision.ts");
  const ruta = leer("app/api/facturas/clientes/[id]/entrega/route.ts");
  const pagina = leer("app/(private)/facturas/nueva/page.tsx");
  const comp = leer("app/(private)/facturas/nueva/entrega-cliente.tsx");

  cierto("EN-50 SQL: destinos elegibles = TODA dirección del cliente y la empresa pedidos que no sea exclusivamente fiscal (fe_entrega_elegible), exige FACTURACION_ELECTRONICA.CREAR, sin tocar el domicilio fiscal ni el catálogo", /d\.empresa_id = p_empresa AND d\.cliente_id = p_cliente\s+AND public\.fe_entrega_elegible\(d\.tipo, d\.es_fiscal, d\.es_entrega_default\)/.test(sql) && /'FACTURACION_ELECTRONICA', 'CREAR'/.test(sql) && !/UPDATE public\.direcciones_cliente|INSERT INTO public\.direcciones_cliente|DELETE FROM public\.direcciones_cliente/.test(sql));
  cierto("EN-72 SQL (PRO-206): la regla de elegibilidad es UNA sola función (SELECT p_es_default OR (NOT p_es_fiscal AND p_tipo <> 'FISCAL')) usada exactamente en la consulta, la existencia de destinos y la validación de la emisión; ya no existe el filtro por tipo ENTREGA/SUCURSAL", /CREATE OR REPLACE FUNCTION public\.fe_entrega_elegible\(p_tipo text, p_es_fiscal boolean, p_es_default boolean\) RETURNS boolean\s+LANGUAGE sql IMMUTABLE AS \$\$\s+SELECT p_es_default OR \(NOT p_es_fiscal AND p_tipo <> 'FISCAL'\)/.test(sql) && (sql.match(/public\.fe_entrega_elegible\(d\.tipo, d\.es_fiscal, d\.es_entrega_default\)/g) ?? []).length === 3 && !/IN \('ENTREGA', 'SUCURSAL'\)/.test(sql));
  cierto("EN-73 SQL (PRO-205): la referencia histórica direccion_id NO tiene clave foránea a direcciones_cliente (la fotografía inmutable es la evidencia); se conserva la FK a empresa/documento y la validación de pertenencia bajo FOR SHARE al emitir", !/REFERENCES public\.direcciones_cliente/.test(sql) && !/fe_entregas_direccion_fk/.test(sql) && /fe_entregas_documento_fk FOREIGN KEY \(empresa_id, documento_id\) REFERENCES public\.documentos_electronicos/.test(sql) && /empresa_id   uuid        NOT NULL REFERENCES public\.empresas/.test(sql) && /d\.empresa_id = p_empresa AND d\.cliente_id = p_cliente AND d\.id = p_direccion_entrega AND public\.fe_entrega_elegible\(d\.tipo, d\.es_fiscal, d\.es_entrega_default\) FOR SHARE/.test(sql) && /fe_entregas_inmutable_trg BEFORE UPDATE OR DELETE/.test(sql));
  {
    const ver = leer("documentacao/banco/nexit/v1/scripts/verificar-NEX-068.sql");
    const rev = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-068.sql");
    const pre = leer("documentacao/banco/nexit/v1/scripts/preflight-NEX-068.sql");
    const doc = leer("documentacao/banco/nexit/v1/docs/PROCEDIMIENTO-NEX-068.md");

    cierto("EN-74 scripts y procedimiento coherentes: la verificación exige 2 FK y NINGUNA a direcciones_cliente y prueba la regla de elegibilidad; la reversión elimina la función de elegibilidad; el preflight cuenta con la regla nueva; el procedimiento documenta COMERCIAL/OTRA, el fiscal aislado y la eliminación posterior de direcciones", /contype = 'f'\) = 2/.test(ver) && /confrelid = 'public\.direcciones_cliente'::regclass/.test(ver) && /fe_entrega_elegible\('COMERCIAL', false, false\)/.test(ver) && /NOT public\.fe_entrega_elegible\('FISCAL', true, false\)/.test(ver) && /DROP FUNCTION IF EXISTS public\.fe_entrega_elegible\(text, boolean, boolean\)/.test(rev) && /NOT es_fiscal AND tipo <> 'FISCAL'/.test(pre) && !/IN \('ENTREGA', 'SUCURSAL'\)/.test(pre) && /COMERCIAL/.test(doc) && /no tiene clave foránea/.test(doc) && /E-10/.test(doc) && !/tipo \*\*ENTREGA\*\* o \*\*SUCURSAL\*\*/.test(doc));
  }
  cierto("EN-75 el reintento de una FE ya creada NO vuelve a exigir el destino (aunque la dirección se haya editado o eliminado): la emisión consulta primero si la clave existe y lo pasa a la preparación; la aplicación sigue sin tocar direcciones_cliente", /\.rows as F\[\]\)\.length > 0/.test(emision) && /prepararFactura\(db, empresaId, usuarioId, cuerpo, \{ documentoExiste \}\)/.test(emision) && /opciones\.documentoExiste && \(await opciones\.documentoExiste\(\)\) \? \(\{ ok: true, opcion: null \} as const\)/.test(emision) && /!documentoExistente && lineasStock\.some/.test(emision) && !/DELETE FROM direcciones_cliente|UPDATE direcciones_cliente|INSERT INTO direcciones_cliente/.test(emision));
  cierto("EN-51 SQL: la emisión con destino es atómica (llama a la emisión con stock de NEX-067 en la misma función), valida el destino contra cliente y empresa (NEX:ENTREGA_INVALIDA / NEX:ENTREGA_REQUERIDA), guarda referencia + snapshot SOLO en la creación original y la tabla es inmutable", /FROM public\.fe_documento_crear_fe_con_stock\(p_empresa/.test(sql) && /IF NOT v_reutilizado THEN/.test(sql) && /NEX:ENTREGA_REQUERIDA/.test(sql) && /NEX:ENTREGA_INVALIDA/.test(sql) && /d\.empresa_id = p_empresa AND d\.cliente_id = p_cliente AND d\.id = p_direccion_entrega/.test(sql) && /INSERT INTO public\.documento_electronico_entregas/.test(sql) && /jsonb_strip_nulls\(jsonb_build_object\('tipo'/.test(sql) && /fe_entregas_inmutable_trg BEFORE UPDATE OR DELETE/.test(sql) && /PRIMARY KEY \(empresa_id, documento_id\)/.test(sql));
  cierto("EN-52 SQL: grants — la aplicación ejecuta la lectura y la emisión con destino, no la tabla ni la emisión sin destino; el ayudante se ejecuta después del de NEX-067 (orden alfabético); NEX-067 y el payload no se modifican; migración NO aplicada", /GRANT EXECUTE ON FUNCTION public\.fe_entrega_opciones/.test(sql) && /GRANT EXECUTE ON FUNCTION public\.fe_documento_crear_fe_con_stock_entrega/.test(sql) && /REVOKE ALL ON FUNCTION public\.fe_documento_crear_fe_con_stock\(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb\) FROM nexit_runtime/.test(sql) && "nex_aplicar_grants_facturacion_stock" < "nex_aplicar_grants_facturacion_stock_entrega" && /nex_aplicar_grants_facturacion_stock_entrega\(\)/.test(sql) && !/CREATE OR REPLACE FUNCTION public\.fe_documento_crear_fe_con_stock\(|CREATE OR REPLACE FUNCTION public\.fe_stock_/.test(sql) && /NO aplicada/.test(sql));
  cierto("EN-53 aplicación: la emisión usa SOLO la función con destino (nunca la de NEX-067 ni la original); el servidor valida el destino antes de reservar numeración; el cuerpo ignora empresa", /FROM fe_documento_crear_fe_con_stock_entrega\(/.test(emision) && !/FROM fe_documento_crear_fe_con_stock\(/.test(emision) && /resolverEntrega\(await opcionesEntrega\(db, empresaId, usuarioId, cuerpo\.clienteId\), cuerpo\.direccionEntregaId\)/.test(emision) && !/direcciones_cliente/.test(emision.slice(emision.indexOf("export async function crearFacturaElectronica"))));
  cierto("EN-54 ruta: GET autenticado con FACTURACION_ELECTRONICA.CREAR, empresa y usuario de la SESIÓN, id validado como UUID, sin caché y solo lectura", /prepararFacturacion\("CREAR"\)/.test(ruta) && /opcionesEntrega\(b\.db, b\.empresaId, b\.usuarioId, id\)/.test(ruta) && /UUID\.test\(id\)/.test(ruta) && /no-store/.test(ruta) && !/POST|PUT|DELETE|PATCH/.test(ruta));
  {
    const previo = { d: process.env.DATABASE_URL, m: process.env.DEMO_MODE };

    delete process.env.DATABASE_URL;
    delete process.env.DEMO_MODE;
    const mod = await import("@/app/api/facturas/clientes/[id]/entrega/route");
    const res = await mod.GET(new Request("http://x/api/facturas/clientes/" + CLI_A + "/entrega"), { params: Promise.resolve({ id: CLI_A }) });

    if (previo.d !== undefined) process.env.DATABASE_URL = previo.d;
    if (previo.m !== undefined) process.env.DEMO_MODE = previo.m;
    igual("EN-55 ruta real: sin base de datos configurada responde 503 sin datos", res.status, 503);
  }
  cierto("EN-56 pantalla: controlador con efecto por cliente, destino SOLO si pertenece al cliente actual, id en el cuerpo revisado (cambia la huella), pendiente bloquea revisar, fila en el resumen previo y componente sin destinos informativo", /crearControlEntrega\(\{ cargar: \(id, signal\) => pedirOpcionesEntrega\(id, signal\) \}\)/.test(pagina) && /void entregaCtl\.seleccionarCliente\(clienteIdActual\)/.test(pagina) && /const entregaVigente = entregaEstado\.clienteId === clienteIdActual \? entregaEstado : null/.test(pagina) && /\.\.\.\(direccionEntregaId \? \{ direccionEntregaId \} : \{\}\)/.test(pagina) && /pendienteDeEntrega,/.test(pagina) && /<EntregaCliente control=\{entregaCtl\} clienteId=\{cliente\.id\} \/>/.test(pagina) && /Dirección de entrega<\/dt>/.test(pagina) && /no tiene direcciones de entrega registradas: la factura se emite igual/.test(comp) && /e\.clienteId !== clienteId/.test(comp) && /Es solo el destino de la mercadería: no cambia el domicilio fiscal/.test(comp));
  cierto("EN-57 fuera de alcance intacto: ni el payload FE, ni el cálculo, ni el stock, ni el gateway/KuDE importan el módulo de entrega", !/facturacion\/entrega/.test(leer("lib/facturacion/payload-fe.ts") + leer("lib/facturacion/stock-fe.ts") + leer("lib/facturacion/gateway.ts") + leer("lib/facturacion/calculo.ts") + leer("lib/facturacion/kude-visor.ts")));
  cierto("EN-58 documentación operativa de NEX-068: preflight, verificación, reversión y procedimiento versionados", ["scripts/preflight-NEX-068.sql", "scripts/verificar-NEX-068.sql", "scripts/reversion-NEX-068.sql", "docs/PROCEDIMIENTO-NEX-068.md"].every((f) => { try { return leer("documentacao/banco/nexit/v1/" + f).length > 200; } catch { return false; } }));

  // ── E1 (PRO-93): J003 dInfAdic de la FE = observaciones + dirección de entrega validada + vendedor autenticado ──────────────────────
  {
    const info = (p: { payload: unknown }) => (p.payload as { dInfAdic: string | null }).dInfAdic;
    const m = mundo();
    const eA = await prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_A, { direccionEntregaId: A1.id }));
    const eB = await prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_A, { direccionEntregaId: A2.id }));
    const sinDir = await prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_C));
    const conObs = await prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_A, { direccionEntregaId: A2.id, infoAdicional: "Entregar por la tarde\nPedido 123" }));

    igual("E1-01 FE con la dirección A: «Dirección de entrega: sede — dirección» (la elegida y validada) y «Vendedor: nombre apellido» de la cuenta que emite", info(eA)?.split("\n"), ["Dirección de entrega: " + nombreEntrega(A1) + " — " + direccionCompleta(A1), "Vendedor: Juan Pérez"]);
    igual("E1-02 FE con la dirección B: otro destino, otra línea (no la anterior ni el domicilio fiscal)", [info(eB)?.includes(nombreEntrega(A2)), info(eB)?.includes(nombreEntrega(A1)), info(eB)?.includes("Domicilio FISCAL")], [true, false, false]);
    igual("E1-03 FE sin dirección de entrega (cliente sin destinos): sin línea de dirección, solo el vendedor; no se inventa destino", [info(sinDir), (sinDir.payload as { dDirRec?: string }).dDirRec], ["Vendedor: Juan Pérez", "Domicilio FISCAL c3"]);
    igual("E1-04 las observaciones del operador se preservan íntegras (con sus saltos de línea) y las líneas automáticas se añaden después, en orden estable", info(conObs)?.split("\n"), ["Entregar por la tarde", "Pedido 123", "Dirección de entrega: " + nombreEntrega(A2) + " — " + direccionCompleta(A2), "Vendedor: Juan Pérez"]);

    m.cuentas.set(EMPRESA + "|" + "88888888-8888-4888-8888-888888888888", { nombre: "María", apellido: "Gómez" });

    const otro = await prepararFactura(m.db, EMPRESA, "88888888-8888-4888-8888-888888888888", cuerpo(CLI_A, { direccionEntregaId: A1.id }));

    igual("E1-05 el vendedor es el usuario AUTENTICADO que emite: la misma factura emitida por otra cuenta lleva su nombre, no el de otra", [info(otro)?.includes("Vendedor: María Gómez"), info(otro)?.includes("Juan")], [true, false]);
    igual("E1-06 el navegador no puede imponer el vendedor ni la dirección: un texto de observaciones que simula «Vendedor: Otro» no reemplaza al real (se añade el real) y una dirección que no es del cliente se rechaza antes de reservar numeración", [info(await prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_A, { direccionEntregaId: A1.id, infoAdicional: "Vendedor: Otro" })))?.split("\n").filter((l) => l.startsWith("Vendedor:")), (await estado(prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_A, { direccionEntregaId: B1.id })))).endsWith(MENSAJE_ENTREGA_INVALIDA)], [["Vendedor: Otro", "Vendedor: Juan Pérez"], true]);

    // aislamiento entre empresas: la cuenta de otra empresa no existe para esta; sin cuenta no se inventa vendedor
    const OTRA_EMPRESA = "22222222-2222-4222-8222-222222222222";
    const ajena = await prepararFactura(m.db, OTRA_EMPRESA, USUARIO, cuerpo(CLI_C));

    igual("E1-07 sin fuga entre tenants: con la empresa B el usuario de la empresa A no se resuelve y nunca aparece el nombre de la otra empresa", [info(ajena) === null || !info(ajena)?.includes("Juan"), m.llamadas.filter((l) => /FROM usuarios/.test(l.sql)).every((l) => l.p.length === 2)], [true, true]);

    // límite de 5000 sobre el texto FINAL, antes de reservar numeración, sin recortar
    const largo = "x".repeat(5000);
    const justo = "y".repeat(5000 - ("\nVendedor: Juan Pérez").length);
    const conLargo = await estado(prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_C, { infoAdicional: largo })));
    const llamadasAntes = m.llamadas.length;
    const enLimite = await prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_C, { infoAdicional: justo }));

    igual("E1-08 5000 caracteres de observaciones + el vendedor superan el máximo: error explícito (422), sin recortar y sin llegar a la función de emisión", [conLargo.startsWith("422:La información adicional"), m.llamadas.some((l) => /fe_documento_crear_fe_con_stock_entrega/.test(l.sql))], [true, false]);
    igual("E1-08 el texto final de exactamente 5000 caracteres se acepta completo (sin truncar)", [info(enLimite)?.length, llamadasAntes > 0], [5000, true]);

    // reintento idempotente: mismo contenido, sin duplicar líneas, y snapshot aunque cambie el nombre del vendedor o la dirección
    const m2 = mundo();
    const c0 = cuerpo(CLI_A, { direccionEntregaId: A2.id, infoAdicional: "Nota" }, "clave-e1-reintento-01");
    const plan2 = await planificarStock(m2.db, EMPRESA, USUARIO, SUC, (await prepararFactura(m2.db, EMPRESA, USUARIO, c0)).lineasStock);
    const c = { ...c0, repartoHuella: plan2.huella };
    const r1 = await crearFacturaElectronica(m2.db, EMPRESA, USUARIO, c);
    const guardada = m2.infoPorClave.get("clave-e1-reintento-01");

    m2.cuentas.set(EMPRESA + "|" + USUARIO, { nombre: "Nombre", apellido: "Cambiado" });

    const r2 = await crearFacturaElectronica(m2.db, EMPRESA, USUARIO, c);
    const reenviado = JSON.parse(String(m2.llamadas.filter((l) => /fe_documento_crear_fe_con_stock_entrega/.test(l.sql)).pop()?.p[9])) as { dInfAdic: string };

    igual("E1-09 reenvío idempotente: la misma clave devuelve el mismo documento, el dInfAdic reenviado es EXACTAMENTE el persistido (no se recompone con el nombre nuevo) y no hay líneas duplicadas", [r1.reutilizado, r2.reutilizado, r1.documentoId === r2.documentoId, reenviado.dInfAdic === guardada, (guardada ?? "").split("\n").filter((l) => l.startsWith("Vendedor:")).length, (reenviado.dInfAdic.match(/Dirección de entrega:/g) ?? []).length], [false, true, true, true, 1, 1]);
    igual("E1-10 el JSON enviado conserva exactamente el nombre dInfAdic (J003) y no introduce campos con otro nombre", [Object.keys(reenviado).filter((k) => /inf.*adic/i.test(k)), "dInfAdic" in reenviado], [["dInfAdic"], true]);
    igual("E1-11 revisar dos veces la misma factura produce el mismo texto (la composición no acumula)", [info(await prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_A, { direccionEntregaId: A2.id, infoAdicional: "Nota" }))) === info(await prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_A, { direccionEntregaId: A2.id, infoAdicional: "Nota" })))], [true]);
  }

  return fallos;
}
