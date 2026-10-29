/**
 * E04 (PRO-200) — dirección de entrega en la Factura Electrónica. Sin PostgreSQL ni navegador: el controlador de la pantalla y la orquestación del servidor (previa y emisión) son los REALES; la base es un simulador del
 * CONTRATO de NEX-068 (fe_entrega_opciones y fe_documento_crear_fe_con_stock_entrega). El SQL se verifica de forma estructural y NO se ejecutó (migración no aplicada); la pantalla, de forma estructural.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { crearFacturaElectronica, huellaReceptor, leerCuerpoFactura, MENSAJE_DESTINO_NO_COMPROBABLE, MENSAJE_INFO_CAMBIO, MENSAJE_RECEPTOR_CAMBIO, MENSAJE_RECEPTOR_SIN_MIGRACION, MENSAJE_REPARTO_CAMBIO, prepararFactura, type CuerpoFactura } from "@/lib/facturacion/emision";
import { direccionCompleta, MENSAJE_ENTREGA_INVALIDA, MENSAJE_ENTREGA_REQUERIDA, nombreEntrega, pedirOpcionesEntrega, resolverEntrega, type OpcionEntrega } from "@/lib/facturacion/entrega";
import { crearControlEntrega, pendienteEntrega } from "@/lib/facturacion/entrega-control";
import { componerInfoAdicional, descomponerInfoAdicional, huellaInfoAdicional, MARCA_AUTOMATICA } from "@/lib/facturacion/info-adicional";
import { erroresDomicilioReceptor } from "@/lib/facturacion/payload-fe";
import { ErrorFacturacion, ErrorValidacionFiscal } from "@/lib/facturacion/shared";
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
    const creado = await crearFacturaElectronica(m.db, EMPRESA, USUARIO, { ...c, repartoHuella: plan.huella, receptorHuella: prep.resumen.receptorHuella });
    const llamada = m.llamadas.find((l) => /fe_documento_crear_fe_con_stock_entrega/.test(l.sql));

    igual("EN-40 la emisión pasa el destino elegido a la función atómica (13.er parámetro) y queda guardado vinculado a la FE y al cliente correcto", [llamada?.p[12], m.entregas.map((e) => [e.cliente, e.direccion, e.snapshot.etiqueta, e.snapshot.tipo]), m.docs.size, creado.reutilizado], [A3.id, [[CLI_A, A3.id, "Depósito Este", "ENTREGA"]], 1, false]);

    const sinDest = mundo();
    const cB = cuerpo(CLI_B, { direccionEntregaId: B1.id });
    const prepB = await prepararFactura(sinDest.db, EMPRESA, USUARIO, cB);
    const prepB2 = await prepararFactura(sinDest.db, EMPRESA, USUARIO, cuerpo(CLI_B, { direccionEntregaId: B1.id }, "clave-entrega-0002"));

    igual("EN-41 (PRO-328, sustituye la regla E04 anterior) mismo cuerpo, mismo payload; en una FE nueva el domicilio del receptor (dDirRec) es la dirección SELECCIONADA, nunca el fiscal, y el dInfAdic ya no la repite", [JSON.stringify(prepB.payload) === JSON.stringify(prepB2.payload), (prepB.payload as unknown as Record<string, unknown>).dDirRec, String((prepB.payload as unknown as Record<string, unknown>).dInfAdic ?? "").includes("Dirección de entrega:")], [true, B1.direccion, false]);
  }
  {
    const m = mundo();
    const c = cuerpo(CLI_A, { direccionEntregaId: A1.id }, "clave-doble-clic-01");
    const prep = await prepararFactura(m.db, EMPRESA, USUARIO, c);
    const plan = await planificarStock(m.db, EMPRESA, USUARIO, SUC, prep.lineasStock);
    const [x, y] = await Promise.all([crearFacturaElectronica(m.db, EMPRESA, USUARIO, { ...c, repartoHuella: plan.huella, receptorHuella: prep.resumen.receptorHuella }), crearFacturaElectronica(m.db, EMPRESA, USUARIO, { ...c, repartoHuella: plan.huella, receptorHuella: prep.resumen.receptorHuella })]);

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

    await crearFacturaElectronica(m.db, EMPRESA, USUARIO, { ...c, repartoHuella: plan.huella, receptorHuella: prep.resumen.receptorHuella });

    const antes = JSON.stringify(m.entregas);

    // Clientes → Direcciones elimina la dirección ya usada (DELETE sobre direcciones_cliente): sin clave foránea no hay error y la fila histórica queda intacta.
    RAW[CLI_E] = RAW[CLI_E].filter((d) => d.op.id !== elegida.id);
    igual("EN-70 tras eliminar la dirección usada en una FE: la lista del cliente ya no la ofrece (4 restantes), pero el destino histórico y su fotografía de la FE siguen EXACTAMENTE iguales", [elegiblesDe(CLI_E).map((o) => o.id).includes(elegida.id), elegiblesDe(CLI_E).length, JSON.stringify(m.entregas) === antes, m.entregas[0].direccion, m.entregas[0].snapshot.etiqueta], [false, 4, true, elegida.id, "Filial 2"]);

    const reintento = await crearFacturaElectronica(m.db, EMPRESA, USUARIO, { ...c, repartoHuella: plan.huella, receptorHuella: prep.resumen.receptorHuella });
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
  cierto("EN-56 pantalla: controlador con efecto por cliente, destino SOLO si pertenece al cliente actual, id en el cuerpo revisado (cambia la huella), pendiente bloquea revisar, fila en el resumen previo y componente sin destinos informativo", /crearControlEntrega\(\{ cargar: \(id, signal\) => pedirOpcionesEntrega\(id, signal\) \}\)/.test(pagina) && /void entregaCtl\.seleccionarCliente\(clienteIdActual\)/.test(pagina) && /const entregaVigente = entregaEstado\.clienteId === clienteIdActual \? entregaEstado : null/.test(pagina) && /\.\.\.\(direccionEntregaId \? \{ direccionEntregaId \} : \{\}\)/.test(pagina) && /pendienteDeEntrega,/.test(pagina) && /<EntregaCliente control=\{entregaCtl\} clienteId=\{cliente\.id\} \/>/.test(pagina) && /Dirección de entrega<\/dt>/.test(pagina) && /no tiene direcciones de entrega registradas: la factura se emite igual/.test(comp) && /e\.clienteId !== clienteId/.test(comp) && /Se usa como domicilio del receptor de esta factura \(SIFEN\): no modifica la ficha del cliente/.test(comp));
  cierto("EN-57 fuera de alcance intacto: ni el payload FE, ni el cálculo, ni el stock, ni el gateway/KuDE importan el módulo de entrega", !/facturacion\/entrega/.test(leer("lib/facturacion/payload-fe.ts") + leer("lib/facturacion/stock-fe.ts") + leer("lib/facturacion/gateway.ts") + leer("lib/facturacion/calculo.ts") + leer("lib/facturacion/kude-visor.ts")));
  cierto("EN-58 documentación operativa de NEX-068: preflight, verificación, reversión y procedimiento versionados", ["scripts/preflight-NEX-068.sql", "scripts/verificar-NEX-068.sql", "scripts/reversion-NEX-068.sql", "docs/PROCEDIMIENTO-NEX-068.md"].every((f) => { try { return leer("documentacao/banco/nexit/v1/" + f).length > 200; } catch { return false; } }));

  // ── E1 (PRO-93): J003 dInfAdic de la FE = observaciones + dirección de entrega validada + vendedor autenticado ──────────────────────
  {
    const M = MARCA_AUTOMATICA;
    const info = (p: { payload: unknown }) => (p.payload as { dInfAdic: string | null }).dInfAdic;
    const m = mundo();
    const eA = await prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_A, { direccionEntregaId: A1.id }));
    const eB = await prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_A, { direccionEntregaId: A2.id }));
    const sinDir = await prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_C));
    const conObs = await prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_A, { direccionEntregaId: A2.id, infoAdicional: "Entregar por la tarde\nPedido 123" }));

    igual("E1-01 (PRO-328) FE nueva con la dirección A: el dInfAdic ya NO lleva «Dirección de entrega: …»; solo la marca y «Vendedor: …»", info(eA)?.split("\n"), [M, "Vendedor: Juan Pérez"]);
    igual("E1-02 (PRO-328) FE nueva con la dirección B: ni ese destino, ni otro, ni el domicilio fiscal aparecen en el dInfAdic", [info(eB)?.includes(nombreEntrega(A2)), info(eB)?.includes(nombreEntrega(A1)), info(eB)?.includes("Domicilio FISCAL")], [false, false, false]);
    igual("E1-03 FE sin dirección de entrega (cliente sin destinos): sin línea de dirección, solo el vendedor; no se inventa destino", [info(sinDir), (sinDir.payload as { dDirRec?: string }).dDirRec], [M + "\nVendedor: Juan Pérez", "Domicilio FISCAL c3"]);
    igual("E1-04 las observaciones del operador se preservan íntegras (con sus saltos de línea) y el vendedor se añade después de la marca (PRO-328: sin línea de entrega)", info(conObs)?.split("\n"), ["Entregar por la tarde", "Pedido 123", M, "Vendedor: Juan Pérez"]);

    m.cuentas.set(EMPRESA + "|" + "88888888-8888-4888-8888-888888888888", { nombre: "María", apellido: "Gómez" });

    const otro = await prepararFactura(m.db, EMPRESA, "88888888-8888-4888-8888-888888888888", cuerpo(CLI_A, { direccionEntregaId: A1.id }));

    igual("E1-05 el vendedor es el usuario AUTENTICADO que emite: la misma factura emitida por otra cuenta lleva su nombre, no el de otra", [info(otro)?.includes("Vendedor: María Gómez"), info(otro)?.includes("Juan")], [true, false]);

    const manual = await prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_A, { direccionEntregaId: A1.id, infoAdicional: "Vendedor: Otro\nDirección de entrega: Otra casa" }));
    const lm = info(manual)?.split("\n") ?? [];

    igual("E1-06 (F002/PRO-328) observaciones con «Vendedor: Otro» y «Dirección de entrega: Otra casa»: se preservan literalmente ANTES de la marca; después solo el vendedor autoritativo, una sola vez (sin línea automática de entrega)", [lm, lm.indexOf("Vendedor: Otro") < lm.indexOf(M), (info(manual)?.split(M)[1] ?? "").includes("Otro")], [["Vendedor: Otro", "Dirección de entrega: Otra casa", M, "Vendedor: Juan Pérez"], true, false]);
    igual("E1-06b una dirección que no es del cliente se rechaza antes de reservar numeración", (await estado(prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_A, { direccionEntregaId: B1.id })))).endsWith(MENSAJE_ENTREGA_INVALIDA), true);

    // aislamiento entre empresas: la cuenta de otra empresa no existe para esta; sin cuenta no se inventa vendedor
    const OTRA_EMPRESA = "22222222-2222-4222-8222-222222222222";
    const ajena = await prepararFactura(m.db, OTRA_EMPRESA, USUARIO, cuerpo(CLI_C));

    igual("E1-07 sin fuga entre tenants: con la empresa B el usuario de la empresa A no se resuelve y nunca aparece el nombre de la otra empresa", [info(ajena) === null || !info(ajena)?.includes("Juan"), m.llamadas.filter((l) => /FROM usuarios/.test(l.sql)).every((l) => l.p.length === 2)], [true, true]);

    // límite de 5000 sobre el texto FINAL, antes de reservar numeración, sin recortar
    const sufijo = ("\n" + M + "\nVendedor: Juan Pérez").length;
    const largo = "x".repeat(5000 - sufijo + 1);
    const justo = "y".repeat(5000 - sufijo);
    const conLargo = await estado(prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_C, { infoAdicional: largo })));
    const enLimite = await prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_C, { infoAdicional: justo }));

    igual("E1-08 (5001) el texto final supera el máximo por un carácter: error explícito (422), sin recortar y sin llegar a la función de emisión", [conLargo.startsWith("422:La información adicional"), m.llamadas.some((l) => /fe_documento_crear_fe_con_stock_entrega/.test(l.sql))], [true, false]);
    igual("E1-08b (5000) el texto final de exactamente 5000 caracteres se acepta completo (sin truncar)", info(enLimite)?.length, 5000);

    // reintento idempotente: mismo contenido, sin duplicar líneas, y snapshot aunque cambie el nombre del vendedor o la dirección
    const m2 = mundo();
    const c0 = cuerpo(CLI_A, { direccionEntregaId: A2.id, infoAdicional: "Nota" }, "clave-e1-reintento-01");
    const prev2 = await prepararFactura(m2.db, EMPRESA, USUARIO, c0);
    const plan2 = await planificarStock(m2.db, EMPRESA, USUARIO, SUC, prev2.lineasStock);
    const c = { ...c0, repartoHuella: plan2.huella, infoAdicionalHuella: prev2.resumen.infoAdicionalHuella, receptorHuella: prev2.resumen.receptorHuella };
    const r1 = await crearFacturaElectronica(m2.db, EMPRESA, USUARIO, c);
    const guardada = m2.infoPorClave.get("clave-e1-reintento-01");

    m2.cuentas.set(EMPRESA + "|" + USUARIO, { nombre: "Nombre", apellido: "Cambiado" });

    const etiquetaOriginal = A2.etiqueta;

    A2.etiqueta = "Sede renombrada";

    let r2: Awaited<ReturnType<typeof crearFacturaElectronica>>;

    try { r2 = await crearFacturaElectronica(m2.db, EMPRESA, USUARIO, c); } finally { A2.etiqueta = etiquetaOriginal; }

    const reenviado = JSON.parse(String(m2.llamadas.filter((l) => /fe_documento_crear_fe_con_stock_entrega/.test(l.sql)).pop()?.p[9])) as { dInfAdic: string };

    igual("E1-09 (reenvío tras cambio de nombre y de dirección) la misma clave devuelve el mismo documento, el dInfAdic reenviado es EXACTAMENTE el persistido (no se recompone) y no hay líneas duplicadas ni 409", [r1.reutilizado, r2.reutilizado, r1.documentoId === r2.documentoId, reenviado.dInfAdic === guardada, (guardada ?? "").split("\n").filter((l) => l.startsWith("Vendedor:")).length, (reenviado.dInfAdic.match(/Dirección de entrega:/g) ?? []).length, m2.llamadas.filter((l) => /fe_documento_crear_fe_con_stock_entrega/.test(l.sql)).length], [false, true, true, true, 1, 0, 2]);
    igual("E1-10 el JSON enviado conserva exactamente el nombre dInfAdic (J003) y no introduce campos con otro nombre", [Object.keys(reenviado).filter((k) => /inf.*adic/i.test(k)), "dInfAdic" in reenviado], [["dInfAdic"], true]);
    igual("E1-11 revisar dos veces la misma factura produce el mismo texto y la misma huella (la composición no acumula)", [info(await prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_A, { direccionEntregaId: A2.id, infoAdicional: "Nota" }))) === info(await prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_A, { direccionEntregaId: A2.id, infoAdicional: "Nota" }))), (await prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_A, { direccionEntregaId: A2.id, infoAdicional: "Nota" }))).resumen.infoAdicionalHuella === (await prepararFactura(m.db, EMPRESA, USUARIO, cuerpo(CLI_A, { direccionEntregaId: A2.id, infoAdicional: "Nota" }))).resumen.infoAdicionalHuella], [true, true]);

    // ── F003: se emite lo que se revisó ──────────────────────────────────────────────────────────
    const creaciones = (w: ReturnType<typeof mundo>) => w.llamadas.filter((l) => /fe_documento_crear_fe_con_stock_entrega/.test(l.sql)).length;
    const conStock = async (w: ReturnType<typeof mundo>, cu: CuerpoFactura, extra: Record<string, unknown> = {}) => ({ ...cu, repartoHuella: (await planificarStock(w.db, EMPRESA, USUARIO, SUC, (await prepararFactura(w.db, EMPRESA, USUARIO, cu)).lineasStock)).huella, ...extra });

    const f1 = mundo();
    const cf1 = cuerpo(CLI_A, { direccionEntregaId: A1.id }, "clave-e1-f003-nombre");
    const rev1 = await prepararFactura(f1.db, EMPRESA, USUARIO, cf1);

    igual("E1-12 la previa expone el dInfAdic final (lo que se imprimirá) y su huella SHA-256", [rev1.resumen.infoAdicional === info(rev1), /^[0-9a-f]{64}$/.test(rev1.resumen.infoAdicionalHuella)], [true, true]);

    f1.cuentas.set(EMPRESA + "|" + USUARIO, { nombre: "Juan", apellido: "Gómez" });

    const e1 = await estado(crearFacturaElectronica(f1.db, EMPRESA, USUARIO, await conStock(f1, cf1, { infoAdicionalHuella: rev1.resumen.infoAdicionalHuella })));

    igual("E1-13 (F003) el nombre del vendedor cambió entre la previa y el envío: 409 «revise de nuevo» y NO se llega a la función de emisión (sin numeración, sin documento)", [e1, creaciones(f1), f1.docs.size], ["409:" + MENSAJE_INFO_CAMBIO, 0, 0]);

    const rev1b = await prepararFactura(f1.db, EMPRESA, USUARIO, cf1);
    const ok1 = await crearFacturaElectronica(f1.db, EMPRESA, USUARIO, await conStock(f1, cf1, { infoAdicionalHuella: rev1b.resumen.infoAdicionalHuella, receptorHuella: rev1b.resumen.receptorHuella }));

    igual("E1-14 (F003) tras revisar de nuevo se emite con el nombre actual, una sola vez, y el payload lleva exactamente el texto revisado", [ok1.reutilizado, creaciones(f1), f1.infoPorClave.get("clave-e1-f003-nombre") === rev1b.resumen.infoAdicional, (f1.infoPorClave.get("clave-e1-f003-nombre") ?? "").includes("Vendedor: Juan Gómez")], [false, 1, true, true]);

    const f2 = mundo();
    const cf2 = cuerpo(CLI_A, { direccionEntregaId: A2.id }, "clave-e1-f003-direccion");
    const rev2 = await prepararFactura(f2.db, EMPRESA, USUARIO, cf2);
    const etiqueta2 = A2.etiqueta;

    A2.etiqueta = "Otra etiqueta de la misma dirección";

    let e2 = "";

    try { e2 = await estado(crearFacturaElectronica(f2.db, EMPRESA, USUARIO, await conStock(f2, cf2, { infoAdicionalHuella: rev2.resumen.infoAdicionalHuella, receptorHuella: rev2.resumen.receptorHuella }))); } finally { A2.etiqueta = etiqueta2; }

    igual("E1-15 (PRO-328) cambiar solo la ETIQUETA de la dirección elegida (mismo id, misma calle/número/códigos) ya no altera ni el dInfAdic ni el domicilio del receptor: la emisión procede una vez", [e2, creaciones(f2)], ["OK", 1]);

    const f3 = mundo();
    const cf3 = cuerpo(CLI_A, { direccionEntregaId: A1.id }, "clave-e1-f003-igual");
    const rev3 = await prepararFactura(f3.db, EMPRESA, USUARIO, cf3);
    const ok3 = await crearFacturaElectronica(f3.db, EMPRESA, USUARIO, await conStock(f3, cf3, { infoAdicionalHuella: rev3.resumen.infoAdicionalHuella, receptorHuella: rev3.resumen.receptorHuella }));

    igual("E1-16 (F003) sin cambios entre previa y envío la emisión procede normalmente (huella idéntica, un solo documento)", [ok3.reutilizado, creaciones(f3), f3.docs.size], [false, 1, 1]);

    const leida = leerCuerpoFactura({ claveIdempotencia: "clave-e1-huella-01", sucursalId: SUC, puntoId: PUNTO, clienteId: CLI_C, tipoTransaccion: 1, presencia: 1, pagos: [{ tipo: 1 }], infoAdicional: "", lineas: [{ productoId: P1, cantidad: "1", precio: null }], infoAdicionalHuella: rev3.resumen.infoAdicionalHuella, nombreVendedor: "Impostor" }) as CuerpoFactura & { nombreVendedor?: string };
    const basura = leerCuerpoFactura({ claveIdempotencia: "clave-e1-huella-02", sucursalId: SUC, puntoId: PUNTO, clienteId: CLI_C, tipoTransaccion: 1, presencia: 1, pagos: [{ tipo: 1 }], infoAdicional: "", lineas: [{ productoId: P1, cantidad: "1", precio: null }], infoAdicionalHuella: "no-es-hex" }) as CuerpoFactura;

    igual("E1-17 el cuerpo del navegador solo aporta la huella (64 hex): un nombre de vendedor enviado se ignora y una huella inválida se descarta (la ruta exigirá revisar de nuevo)", [leida.infoAdicionalHuella === rev3.resumen.infoAdicionalHuella, "nombreVendedor" in leida, basura.infoAdicionalHuella], [true, false, undefined]);

    const rutaFe = leer("app/api/facturas/route.ts");
    const rutaNce = leer("app/api/notas-credito/route.ts");

    cierto("E1-18 las rutas de emisión de FE y NCE exigen la huella de la información adicional revisada (409 antes de cualquier escritura) y la previa no escribe", /datos\.infoAdicionalHuella === undefined\) return NextResponse\.json\(\{ error: MENSAJE_INFO_CAMBIO \}, \{ status: 409 \}\)[\s\S]*emitirFactura/.test(rutaFe) && /datos\.infoAdicionalHuella === undefined\) return NextResponse\.json\(\{ error: MENSAJE_INFO_NCE_CAMBIO \}, \{ status: 409 \}\)[\s\S]*emitirNce/.test(rutaNce));

    const paginaFe = leer("app/(private)/facturas/nueva/page.tsx");
    const paginaNce = leer("app/(private)/notas-credito/page.tsx");

    cierto("E1-19 las pantallas envían al emitir la huella del resumen REVISADO (no un nombre) y muestran al operador el texto de información adicional que se imprimirá", paginaFe.includes("infoAdicionalHuella: revisado.infoAdicionalHuella") && paginaFe.includes("resumen.infoAdicional ?") && paginaNce.includes("JSON.stringify({ ...c, ...(revisado?.resumen.infoAdicionalHuella") && paginaNce.includes("resumen.infoAdicional ?"));
  }

  // PRO-328: la dirección seleccionada como domicilio del receptor (simulador propio del contrato NEX-074/NEX-076).
  await casosPro328(igual, cierto);

  return fallos;
}

// ══ PRO-328 (P0 fiscal): la dirección SELECCIONADA es el domicilio principal del receptor en el JSON de las FE NUEVAS ══════════════════════════════════════════════════════════════════════════════════
// Simulador PROPIO y completo del contrato (no reutiliza `mundo`, anterior a NEX-074/PRO-322): NEX-074 (vendedor), catálogo geográfico, fe_entrega_opciones (NEX-068) y NEX-076 (fe_direccion_receptor_elegida +
// fe_documento_crear_fe_receptor: comparación bajo bloqueo con el payload, fotografía de la MISMA dirección e identidad del reintento por UUID). El SQL de NEX-076 se verifica de forma estructural y NO se ejecutó.
const VEND_328 = "77777777-7777-4777-8777-777777777777";
const CLI_P = "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1"; // PY, B2B, con destinos (uno predeterminado)
const CLI_S = "e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2"; // sin destinos
const CLI_N = "e3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3"; // con destinos, sin predeterminado
const CLI_X = "e4e4e4e4-e4e4-4e4e-8e4e-e4e4e4e4e4e4"; // B2F (exterior)
const OTRA_EMPRESA_328 = "22222222-2222-4222-8222-222222222222";
const d328 = (n: number) => "d3280000-0000-4000-8000-" + String(n).padStart(12, "0");

type Dir328 = { id: string; cliente: string; tipo: string; esFiscal: boolean; esDefault: boolean; etiqueta: string; pais: string; direccion: string; numeroCasa: string | null; dep: number | null; dis: number | null; ciu: number | null; departamento: string; ciudad: string; revocada?: boolean };

const base328 = (id: string, cliente: string, extra: Partial<Dir328> = {}): Dir328 => ({ id, cliente, tipo: "SUCURSAL", esFiscal: false, esDefault: false, etiqueta: "Sucursal Luque", pais: "PRY", direccion: "Avda. Gral. Aquino", numeroCasa: "1500", dep: 11, dis: 5, ciu: 3, departamento: "Central", ciudad: "Luque", ...extra });
const DP1 = d328(1), DP2 = d328(2), DP3 = d328(3), DP4 = d328(4), DP5 = d328(5), DP6 = d328(6), DP7 = d328(7), DPF = d328(8), DN1 = d328(21), DN2 = d328(22), DX1 = d328(31), DX2 = d328(32);
const dirs328 = (): Dir328[] => [
  base328(DP1, CLI_P, { esDefault: true }),
  base328(DP2, CLI_P, { etiqueta: "Sin número", numeroCasa: null }),
  base328(DP3, CLI_P, { etiqueta: "Número S/N", numeroCasa: "S/N" }),
  base328(DP4, CLI_P, { etiqueta: "Sin ciudad", ciu: null }),
  base328(DP5, CLI_P, { etiqueta: "Geografía ajena", ciu: 9 }),
  base328(DP6, CLI_P, {}), // MISMO texto que DP1, otro UUID
  base328(DP7, CLI_P, { etiqueta: "Argentina", pais: "ARG" }),
  base328(DPF, CLI_P, { tipo: "FISCAL", esFiscal: true, etiqueta: "Fiscal" }), // no elegible
  base328(DN1, CLI_N, { etiqueta: "Norte" }),
  base328(DN2, CLI_N, { etiqueta: "Sur" }),
  base328(DX1, CLI_X, { esDefault: true, etiqueta: "São Paulo", pais: "BRA", direccion: "Rua das Flores", numeroCasa: "200", dep: null, dis: null, ciu: null }),
  base328(DX2, CLI_X, { etiqueta: "Asunción", pais: "PRY", direccion: "Calle PY", numeroCasa: "10", dep: 1, dis: 1, ciu: 1 }),
];
const PAISES_328: Record<string, string> = { PRY: "Paraguay", ARG: "Argentina", BRA: "Brasil" };
const GEO_328: Record<string, string> = { "1": "CAPITAL", "1|1": "ASUNCIÓN", "1|1|1": "ASUNCIÓN", "11": "CENTRAL", "11|5": "LUQUE", "11|5|3": "LUQUE" };
const fila328 = (id: string) =>
  id === CLI_X
    ? { codigo: "CLI-X", naturaleza_receptor: 2, tipo_operacion: 4, tipo_contribuyente_sifen: null, pais_codigo: "ARG", tipo_documento_identidad_sifen: 3, descripcion_documento_identidad: null, numero_documento: "AB123456", dv: null, razon_social: "CLIENTE EXTERIOR SA", nombre_fantasia: null, email: null, email_copia: null, email_facturacion: null, telefono: null, celular: null, telefono_ddi: null, celular_ddi: null, activo: true, bloqueado_ventas: false, direccion: "Av. Corrientes FISCAL", numero_casa: "300", departamento_codigo: null, distrito_codigo: null, ciudad_codigo: null }
    : { codigo: "CLI-" + id.slice(0, 2), naturaleza_receptor: 1, tipo_operacion: 1, tipo_contribuyente_sifen: 2, pais_codigo: "PRY", tipo_documento_identidad_sifen: null, descripcion_documento_identidad: null, numero_documento: "80000005", dv: "6", razon_social: "CLIENTE " + id.slice(0, 2), nombre_fantasia: null, email: null, email_copia: null, email_facturacion: null, telefono: null, celular: null, telefono_ddi: null, celular_ddi: null, activo: true, bloqueado_ventas: false, direccion: "Domicilio FISCAL", numero_casa: "999", departamento_codigo: "1", distrito_codigo: "1", ciudad_codigo: "1" };
const producto328 = { id: P1, codigo: "P-1", controlaStock: false, descripcion: "Producto P-1", unidadSifen: 77, unidadSimbolo: "UNI", unidadNombre: "Unidad", unidadVigente: true, afectacion: 1, proporcion: null, tasa: 10, precio: "11000", monedaPrecio: "PYG", gtin: null };

type Doc328 = { id: string; numero: string; cliente: string; payload: Record<string, unknown>; vendedor: string };

function mundo328(o: { nex076?: boolean } = {}) {
  const estado = { nex076: o.nex076 ?? true, antesDeBloquear: null as null | (() => void) };
  const dirs = dirs328();
  const llamadas: Array<{ sql: string; p: unknown[] }> = [];
  const docs = new Map<string, Doc328>();
  const entregas = new Map<string, { direccionId: string; snapshot: Record<string, unknown> }>();
  let secuencia = 0;
  const filas = (rows: unknown[]) => ({ rows, rowCount: rows.length });
  const elegible = (d: Dir328) => d.esDefault || (!d.esFiscal && d.tipo !== "FISCAL");
  const deCliente = (empresa: unknown, cliente: unknown) => (empresa === EMPRESA ? dirs.filter((d) => d.cliente === cliente && elegible(d)) : []);
  const err = (detail: string, mensaje: string) => Object.assign(new Error(mensaje), { code: "P0001", detail });
  // Espejo de la comparación de fe_documento_crear_fe_receptor (NEX-076) entre la fila bloqueada y el receptor del payload.
  const coincide = (d: Dir328, pl: Record<string, unknown>) => {
    const num = (d.numeroCasa ?? "").trim();

    if (pl.cPaisRec !== d.pais || pl.dDirRec !== d.direccion.trim() || !/^[0-9]{1,6}$/.test(num) || String(pl.dNumCasRec) !== String(Number(num))) return false;

    return String(pl.iTiOpe) === "4" ? !("cDepRec" in pl) && !("cDisRec" in pl) && !("cCiuRec" in pl) : String(pl.cDepRec) === String(d.dep) && String(pl.cDisRec) === String(d.dis) && String(pl.cCiuRec) === String(d.ciu);
  };
  const crear = (p: unknown[], conReceptor: boolean) => {
    const clave = String(p[4]);
    const cliente = String(p[5]);
    const payload = JSON.parse(String(p[9])) as Record<string, unknown>;
    const dir = (p[12] as string | null) ?? null;
    const previo = docs.get(clave);

    if (!previo && dir !== null && conReceptor) {
      estado.antesDeBloquear?.();

      const d = deCliente(p[0], cliente).find((x) => x.id === dir && !x.revocada);

      if (!d) throw err("NEX:ENTREGA_INVALIDA", "la dirección de entrega no pertenece al cliente de la factura o ya no está disponible");
      if (!coincide(d, payload)) throw err("NEX:ENTREGA_INVALIDA", "la dirección seleccionada cambió o no coincide con el receptor revisado");
    }
    if (previo) {
      if (previo.vendedor !== String(p[13])) throw err("NEX:IDEMPOTENCIA_CONFLICTO", "la clave de idempotencia ya se usó con otro vendedor");
      if (conReceptor && (entregas.get(previo.id)?.direccionId ?? null) !== dir) throw err("NEX:IDEMPOTENCIA_CONFLICTO", "la clave de idempotencia ya se usó con otra dirección seleccionada");

      return { documentoId: previo.id, numero: previo.numero, reutilizado: true };
    }

    const elegibles = deCliente(p[0], cliente);

    if (dir === null && elegibles.length > 0) throw err("NEX:ENTREGA_REQUERIDA", "el cliente tiene direcciones de entrega registradas: seleccione una");

    const d = dir === null ? null : elegibles.find((x) => x.id === dir) ?? null;

    if (dir !== null && !d) throw err("NEX:ENTREGA_INVALIDA", "la dirección de entrega no pertenece al cliente de la factura o ya no está disponible");
    secuencia += 1;

    const id = "d0328000-0000-4000-8000-" + String(secuencia).padStart(12, "0");

    docs.set(clave, { id, numero: String(90000 + secuencia), cliente, payload, vendedor: String(p[13]) });
    if (d) entregas.set(id, { direccionId: d.id, snapshot: { etiqueta: d.etiqueta, direccion: d.direccion, numeroCasa: d.numeroCasa, pais: d.pais } });

    return { documentoId: id, numero: String(90000 + secuencia), reutilizado: false };
  };
  const db = {
    async query(sql: string, p: unknown[] = []) {
      llamadas.push({ sql, p });
      if (/to_regprocedure\('public\.fe_documento_crear_fe_receptor/.test(sql)) return filas([{ ok: estado.nex076 }]);
      if (/to_regprocedure/.test(sql)) return filas([{ ok: true }]);
      if (/FROM fe_documento_crear_fe_receptor\(/.test(sql)) {
        if (!estado.nex076) throw Object.assign(new Error("function fe_documento_crear_fe_receptor does not exist"), { code: "42883" });
        return filas([crear(p, true)]);
      }
      if (/FROM fe_documento_crear_fe_vendedor\(/.test(sql)) return filas([crear(p, false)]);
      if (/FROM fe_direccion_receptor_elegida/.test(sql)) {
        if (!estado.nex076) throw Object.assign(new Error("function fe_direccion_receptor_elegida does not exist"), { code: "42883" });

        const d = deCliente(p[0], p[2]).find((x) => x.id === p[3] && !x.revocada);

        return filas(d ? [{ id: d.id, pais: d.pais, direccion: d.direccion, numeroCasa: d.numeroCasa, departamento: d.dep, distrito: d.dis, ciudad: d.ciu }] : []);
      }
      if (/FROM fe_entrega_opciones/.test(sql)) {
        return filas(deCliente(p[0], p[2]).map((d) => ({ id: d.id, tipo: d.tipo, etiqueta: d.etiqueta, descripcion: "", direccion: d.direccion, numeroCasa: d.numeroCasa ?? "", complemento: "", departamento: d.departamento, distrito: "", ciudad: d.ciudad, pais: d.pais, contactoNombre: "", contactoTelefono: "", horario: "", esDefault: d.esDefault })).sort((a, b) => Number(b.esDefault) - Number(a.esDefault)));
      }
      if (/FROM clientes c\s+LEFT JOIN LATERAL/.test(sql)) return filas(p[0] === EMPRESA ? [fila328(String(p[1]))] : []);
      if (/FROM clientes c WHERE c\.empresa_id/.test(sql)) return filas([]); // aptitud sin fila: no se reevalúa aquí (cubierta en sus propios casos)
      if (/FROM direcciones_cliente d\s+WHERE/.test(sql)) return filas([]);
      if (/FROM referencia_geografica_paises WHERE codigo = \$1/.test(sql)) return filas(PAISES_328[String(p[0])] ? [{ codigo: p[0], nombre: PAISES_328[String(p[0])] }] : []);
      if (/FROM referencia_geografica_paises WHERE activo/.test(sql)) return filas(Object.keys(PAISES_328).map((codigo) => ({ codigo })));
      if (/referencia_geografica_departamentos d WHERE d\.codigo/.test(sql)) {
        const [a, b, c] = p.map(String);

        return filas([{ dep: a in GEO_328, dis: `${a}|${b}` in GEO_328, ciu: `${a}|${b}|${c}` in GEO_328, depNombre: GEO_328[a] ?? null, disNombre: GEO_328[`${a}|${b}`] ?? null, ciuNombre: GEO_328[`${a}|${b}|${c}`] ?? null }]);
      }
      if (/FROM productos p/.test(sql)) return filas([producto328]);
      if (/FROM sucursales sc JOIN empresas e/.test(sql)) return filas([{ empresa: "EMPRESA SINTETICA", sucursal: "Casa Central", establecimiento: "001", punto: "002", puntoNombre: "Punto 002" }]);
      if (/FROM usuarios u\s+JOIN usuario_perfil/.test(sql)) return filas(p[0] === EMPRESA && p[1] === VEND_328 ? [{ id: VEND_328, usuario: "ana", nombre: "Ana", apellido: "Vendedora", email: "", estado: "ACTIVO" }] : []);
      if (/SELECT 1 AS ok FROM documentos_electronicos WHERE/.test(sql)) return filas(p[0] === EMPRESA && docs.has(String(p[1])) ? [{ ok: 1 }] : []);
      if (/FROM documento_electronico_solicitudes s\s+JOIN documentos_electronicos d/.test(sql)) {
        const d = docs.get(String(p[1]));

        return filas(d ? [{ payload: d.payload, clienteId: d.cliente, sucursalId: SUC, puntoId: PUNTO, fecha: "", vendedorId: d.vendedor }] : []);
      }
      if (/FROM documentos_electronicos d JOIN documento_electronico_solicitudes s/.test(sql)) {
        const d = docs.get(String(p[1]));

        return filas(d ? [{ info: typeof d.payload.dInfAdic === "string" ? d.payload.dInfAdic : null }] : []);
      }

      return filas([]);
    },
  } as never;

  return { db, llamadas, docs, entregas, dirs, estado, secuencia: () => secuencia, dir: (id: string) => dirs.find((d) => d.id === id) as Dir328 };
}

async function casosPro328(igual: (nombre: string, obtenido: unknown, esperado: unknown) => void, cierto: (nombre: string, c: boolean) => void) {
  const M = MARCA_AUTOMATICA;
  const cuerpo328 = (cliente: string, extra: Record<string, unknown> = {}, clave = "clave-pro328-0001"): CuerpoFactura =>
    leerCuerpoFactura({ claveIdempotencia: clave, sucursalId: SUC, puntoId: PUNTO, clienteId: cliente, vendedorId: VEND_328, tipoTransaccion: 1, presencia: 1, pagos: [{ tipo: 1 }], infoAdicional: "", lineas: [{ productoId: P1, cantidad: "2", precio: null }], ...extra }) as CuerpoFactura;
  const pl = (x: { payload: unknown }) => x.payload as unknown as Record<string, unknown>;
  const domicilio = (x: { payload: unknown }) => ["cPaisRec", "dDirRec", "dNumCasRec", "cDepRec", "cDisRec", "cCiuRec"].map((k) => (k in pl(x) ? pl(x)[k] : "∅"));
  const resultado = async (p: Promise<unknown>): Promise<Record<string, unknown>> => {
    try {
      await p;

      return { ok: true };
    } catch (e) {
      if (e instanceof ErrorValidacionFiscal) return { estado: e.estado, mensaje: e.message, detalles: e.detalles };
      if (e instanceof ErrorFacturacion) return { estado: e.estado, mensaje: e.message };

      return { detail: (e as { detail?: string }).detail ?? String((e as Error).message) };
    }
  };
  const creaciones = (w: ReturnType<typeof mundo328>) => w.llamadas.filter((l) => /FROM fe_documento_crear_fe_(receptor|vendedor)\(/.test(l.sql)).length;
  const lecturas = (w: ReturnType<typeof mundo328>) => w.llamadas.filter((l) => /FROM fe_direccion_receptor_elegida/.test(l.sql)).length;
  const revisarYEmitir = async (w: ReturnType<typeof mundo328>, c: CuerpoFactura) => {
    const prev = await prepararFactura(w.db, EMPRESA, USUARIO, c);

    return crearFacturaElectronica(w.db, EMPRESA, USUARIO, { ...c, infoAdicionalHuella: prev.resumen.infoAdicionalHuella, receptorHuella: prev.resumen.receptorHuella });
  };
  const enviado = (w: ReturnType<typeof mundo328>) => JSON.parse(String(w.llamadas.filter((l) => /FROM fe_documento_crear_fe_(receptor|vendedor)\(/.test(l.sql)).pop()?.p[9] ?? "{}")) as Record<string, unknown>;

  // ── A. FE nueva, Paraguay, destino válido ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const w = mundo328();
    const prev = await prepararFactura(w.db, EMPRESA, USUARIO, cuerpo328(CLI_P, { direccionEntregaId: DP1 }));

    igual("PRO328-01 FE nueva PY con destino válido: cPaisRec, dDirRec, dNumCasRec, cDepRec, cDisRec y cCiuRec son EXACTAMENTE los de la dirección seleccionada (misma fila, códigos oficiales)", domicilio(prev), ["PRY", "Avda. Gral. Aquino", 1500, 11, 5, 3]);
    igual("PRO328-02 la dirección fiscal del cliente (Domicilio FISCAL 999, 1/1/1) no contamina ningún campo del receptor ni del payload", [JSON.stringify(pl(prev)).includes("Domicilio FISCAL"), JSON.stringify(pl(prev)).includes("999")], [false, false]);
    igual("PRO328-03 la identidad del receptor no cambia (RUC, DV, nombre, tipo de operación del cliente)", [pl(prev).dRucRec, pl(prev).dDVRec, pl(prev).dNomRec, pl(prev).iTiOpe], ["80000005", 6, "CLIENTE e1", 1]);
    igual("PRO328-04 la revisión muestra el domicilio que REALMENTE irá en el JSON (desde el servidor): origen, calle, número, códigos y nombres oficiales; con su huella SHA-256", [prev.resumen.receptorDomicilio, /^[0-9a-f]{64}$/.test(prev.resumen.receptorHuella)], [{ origen: "SELECCIONADA", pais: "PRY", direccion: "Avda. Gral. Aquino", numeroCasa: "1500", departamento: "11", distrito: "5", ciudad: "3", nombres: { pais: "Paraguay", departamento: "CENTRAL", distrito: "LUQUE", ciudad: "LUQUE" } }, true]);
    igual("PRO328-05 los códigos se leen de la función autorizada de NEX-076 con empresa, usuario, cliente y UUID de la sesión (el navegador solo envía el UUID)", w.llamadas.filter((l) => /FROM fe_direccion_receptor_elegida/.test(l.sql)).map((l) => l.p), [[EMPRESA, USUARIO, CLI_P, DP1]]);
    igual("PRO328-06 la revisión no escribe ni reserva nada", [creaciones(w), w.docs.size, w.secuencia()], [0, 0, 0]);
  }

  // ── B. dInfAdic de las FE nuevas: observaciones íntegras + vendedor COMERCIAL, NUNCA la línea automática de entrega ──────────────────────────────────────────
  {
    const w = mundo328();
    const conObs = await prepararFactura(w.db, EMPRESA, USUARIO, cuerpo328(CLI_P, { direccionEntregaId: DP1, infoAdicional: "Entregar por la tarde\nPedido 123" }));
    const manual = await prepararFactura(w.db, EMPRESA, USUARIO, cuerpo328(CLI_P, { direccionEntregaId: DP1, infoAdicional: "Dirección de entrega: Portón 2" }));
    const sinObs = await prepararFactura(w.db, EMPRESA, USUARIO, cuerpo328(CLI_P, { direccionEntregaId: DP1 }));

    igual("PRO328-10 FE nueva con observaciones y vendedor: dInfAdic = observaciones íntegras + marca + «Vendedor: …» comercial; NO hay «Dirección de entrega: …» automática", String(pl(conObs).dInfAdic).split("\n"), ["Entregar por la tarde", "Pedido 123", M, "Vendedor: Ana Vendedora"]);
    igual("PRO328-11 si el operador escribe «Dirección de entrega: …» en las observaciones se preserva literalmente (antes de la marca) y no se agrega ninguna otra", String(pl(manual).dInfAdic).split("\n"), ["Dirección de entrega: Portón 2", M, "Vendedor: Ana Vendedora"]);
    igual("PRO328-12 sin observaciones: solo la marca y el vendedor (la marca existe porque hay una línea automática: el vendedor); la previa muestra exactamente ese texto con su huella", [String(pl(sinObs).dInfAdic), sinObs.resumen.infoAdicional === pl(sinObs).dInfAdic, sinObs.resumen.infoAdicionalHuella === huellaInfoAdicional(String(pl(sinObs).dInfAdic))], [M + "\nVendedor: Ana Vendedora", true, true]);
    igual("PRO328-13 composición pura de FE nueva (sin entrega) y parser legado intacto: el texto de una FE ANTIGUA con la línea automática sigue reconociéndose, sin derivar de él la identidad del destino", [componerInfoAdicional({ observaciones: "Obs", vendedor: "Vendedor: Ana Vendedora" }), descomponerInfoAdicional("Obs\n" + M + "\nDirección de entrega: Sucursal Luque — Avda. Gral. Aquino 1500\nVendedor: Ana Vendedora")], ["Obs\n" + M + "\nVendedor: Ana Vendedora", { observacion: "Obs", entrega: "Dirección de entrega: Sucursal Luque — Avda. Gral. Aquino 1500", vendedor: "Vendedor: Ana Vendedora" }]);
    igual("PRO328-14 límite de 5000 caracteres sobre el texto final (observaciones + vendedor), sin recortar", [(await resultado(prepararFactura(w.db, EMPRESA, USUARIO, cuerpo328(CLI_P, { direccionEntregaId: DP1, infoAdicional: "x".repeat(5000 - ("\n" + M + "\nVendedor: Ana Vendedora").length + 1) })))).estado, String(pl(await prepararFactura(w.db, EMPRESA, USUARIO, cuerpo328(CLI_P, { direccionEntregaId: DP1, infoAdicional: "y".repeat(5000 - ("\n" + M + "\nVendedor: Ana Vendedora").length) }))).dInfAdic).length], [422, 5000]);
  }

  // ── C. Sin destinos registrados / con destinos sin elegir / destinos ajenos ─────────────────────────────────────────────────────────────────────────────
  {
    const w = mundo328();
    const sin = await prepararFactura(w.db, EMPRESA, USUARIO, cuerpo328(CLI_S, { infoAdicional: "Nota" }));

    igual("PRO328-20 cliente SIN destinos: domicilio FISCAL original, sin línea «Dirección de entrega», sin bloquear y sin leer NEX-076", [domicilio(sin), String(pl(sin).dInfAdic), sin.resumen.receptorDomicilio.origen, sin.entrega, lecturas(w)], [["PRY", "Domicilio FISCAL", 999, 1, 1, 1], "Nota\n" + M + "\nVendedor: Ana Vendedora", "FISCAL", null, 0]);

    const sinMig = mundo328({ nex076: false });
    const okSinMig = await revisarYEmitir(sinMig, cuerpo328(CLI_S, {}, "clave-pro328-sin-mig"));

    igual("PRO328-21 sin destinos y SIN NEX-076 la FE sigue emitiéndose con el domicilio fiscal (vía de NEX-074), sin exigir crear destinos", [okSinMig.reutilizado, sinMig.llamadas.some((l) => /FROM fe_documento_crear_fe_vendedor\(/.test(l.sql)), enviado(sinMig).dDirRec], [false, true, "Domicilio FISCAL"]);

    const n = await resultado(prepararFactura(w.db, EMPRESA, USUARIO, cuerpo328(CLI_N)));

    igual("PRO328-22 con destinos pero sin elegir: error legible (422) y nada se emite", [n, creaciones(w)], [{ estado: 422, mensaje: MENSAJE_ENTREGA_REQUERIDA }, 0]);

    const ajeno = await resultado(prepararFactura(w.db, EMPRESA, USUARIO, cuerpo328(CLI_P, { direccionEntregaId: DN1 })));
    const noElegible = await resultado(prepararFactura(w.db, EMPRESA, USUARIO, cuerpo328(CLI_P, { direccionEntregaId: DPF })));
    const otraEmpresa = await resultado(prepararFactura(w.db, OTRA_EMPRESA_328, USUARIO, cuerpo328(CLI_P, { direccionEntregaId: DP1 })));

    igual("PRO328-23 destino de OTRO cliente o no elegible (domicilio exclusivamente fiscal): rechazo 422 sin filtrar datos de la dirección", [ajeno, noElegible, JSON.stringify([ajeno, noElegible]).includes("Avda.")], [{ estado: 422, mensaje: MENSAJE_ENTREGA_INVALIDA }, { estado: 422, mensaje: MENSAJE_ENTREGA_INVALIDA }, false]);
    igual("PRO328-24 otra empresa: el cliente y sus direcciones no existen para ella (rechazo, sin datos ajenos ni emisión)", [otraEmpresa.ok === true, JSON.stringify(otraEmpresa).includes("Avda."), creaciones(w)], [false, false, 0]);

    w.dir(DP1).revocada = true; // sigue en la lista vista por la pantalla, pero la función autorizada ya no la devuelve (revocada/inactiva entre la carga y la previa)

    const revocada = await resultado(prepararFactura(w.db, EMPRESA, USUARIO, cuerpo328(CLI_P, { direccionEntregaId: DP1 })));

    igual("PRO328-25 dirección revocada o inactiva durante la preparación: 422 «ya no está disponible», nunca el domicilio fiscal en su lugar", [revocada, creaciones(w)], [{ estado: 422, mensaje: MENSAJE_ENTREGA_INVALIDA }, 0]);
  }

  // ── D. Dirección seleccionada inválida: 422 por campo, nada se completa con el fiscal ────────────────────────────────────────────────────────────────────
  {
    const w = mundo328();
    const r = async (id: string) => resultado(prepararFactura(w.db, EMPRESA, USUARIO, cuerpo328(CLI_P, { direccionEntregaId: id })));
    const sinNumero = await r(DP2);
    const noNumerico = await r(DP3);
    const sinCiudad = await r(DP4);
    const geoAjena = await r(DP5);
    const paisAjeno = await r(DP7);
    const SEL = "La dirección seleccionada no es válida para la factura: corríjala en Clientes → Direcciones.";

    igual("PRO328-30 sin número de casa: 422 que nombra la dirección seleccionada (D218); no se toma el 999 del fiscal ni se pone 0", [sinNumero.estado, sinNumero.mensaje, sinNumero.detalles], [422, SEL, ["La dirección seleccionada para la factura requiere un número de casa numérico de 1 a 6 dígitos (D218). Corríjalo en Clientes; no se reemplaza por 0."]]);
    igual("PRO328-31 número no numérico (S/N): mismo rechazo", [noNumerico.estado, noNumerico.detalles], [422, ["La dirección seleccionada para la factura requiere un número de casa numérico de 1 a 6 dígitos (D218). Corríjalo en Clientes; no se reemplaza por 0."]]);
    igual("PRO328-32 falta el código de ciudad: 422 (D223); el código 1 del fiscal NO completa el hueco", [sinCiudad.estado, sinCiudad.detalles], [422, ["La dirección seleccionada para la factura requiere una ciudad válida (D223, NT 003)."]]);
    igual("PRO328-33 geografía fuera de la jerarquía oficial (ciudad 9 inexistente en 11/5): 422 con el nivel exacto y la indicación de corregir la seleccionada", geoAjena, { estado: 422, mensaje: "La ciudad de la dirección seleccionada para la factura no corresponde al departamento y distrito indicados. Corrija la dirección seleccionada en Clientes → Direcciones antes de facturar (no se reemplaza por el domicilio fiscal)." });
    igual("PRO328-34 país extranjero en una operación B2B: 422 (D203) sin cambiar iTiOpe ni la naturaleza del receptor", [paisAjeno.estado, paisAjeno.detalles], [422, ["En operaciones B2B, B2C y B2G el país del receptor debe ser Paraguay (D203): revise el país de la dirección seleccionada."]]);
    igual("PRO328-35 ningún rechazo llega a emitir, numerar o descontar stock", [creaciones(w), w.secuencia()], [0, 0]);

    const fiscal = erroresDomicilioReceptor({ codigo: "C", naturaleza: 1, tipoOperacion: 1, tipoContribuyente: 2, pais: "PRY", ruc: "80000005", dv: "6", tipoDocumentoIdentidad: null, descripcionTipoDocumento: "", numeroDocumento: "", razonSocial: "CLIENTE", nombreFantasia: "", direccion: "", numeroCasa: "", departamento: "", distrito: "", ciudad: "", telefono: "", celular: "", email: "", emailCopia: "", emailFacturacion: "" });
    const seleccionadaVacia = erroresDomicilioReceptor({ codigo: "C", naturaleza: 1, tipoOperacion: 1, tipoContribuyente: 2, pais: "PRY", ruc: "80000005", dv: "6", tipoDocumentoIdentidad: null, descripcionTipoDocumento: "", numeroDocumento: "", razonSocial: "CLIENTE", nombreFantasia: "", direccion: "", numeroCasa: "", departamento: "", distrito: "", ciudad: "", telefono: "", celular: "", email: "", emailCopia: "", emailFacturacion: "", origenDomicilio: "SELECCIONADA" });

    igual("PRO328-36 regla fiscal intacta: un domicilio FISCAL totalmente vacío sigue admitido; una dirección SELECCIONADA vacía nunca (se envía completa o no se emite)", [fiscal, seleccionadaVacia.length], [[], 5]);
  }

  // ── E. B2F ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const w = mundo328();
    const ok = await prepararFactura(w.db, EMPRESA, USUARIO, cuerpo328(CLI_X, { direccionEntregaId: DX1 }));
    const py = await resultado(prepararFactura(w.db, EMPRESA, USUARIO, cuerpo328(CLI_X, { direccionEntregaId: DX2 })));

    igual("PRO328-40 B2F con destino extranjero: país, calle y número de la dirección seleccionada, SIN geografía paraguaya (ni del destino ni del fiscal)", domicilio(ok), ["BRA", "Rua das Flores", 200, "∅", "∅", "∅"]);
    igual("PRO328-41 B2F con una dirección seleccionada en Paraguay: 422 (D203), sin cambiar el tipo de operación", [py.estado, py.detalles, pl(ok).iTiOpe], [422, ["En una operación B2F el país del receptor debe ser distinto de Paraguay (D203): revise el país de la dirección seleccionada."], 4]);
  }

  // ── F. Emisión atómica y cambios entre la previa y el envío ─────────────────────────────────────────────────────────────────────────────────────────────
  {
    const w = mundo328();
    const c = cuerpo328(CLI_P, { direccionEntregaId: DP1, infoAdicional: "Pedido 9" }, "clave-pro328-emision");
    const creado = await revisarYEmitir(w, c);
    const llamada = w.llamadas.find((l) => /FROM fe_documento_crear_fe_receptor\(/.test(l.sql));
    const doc = w.docs.get("clave-pro328-emision");

    igual("PRO328-50 la emisión usa fe_documento_crear_fe_receptor (NEX-076) con el UUID de la dirección y el vendedor; crea UNA FE", [creado.reutilizado, llamada?.p[12], llamada?.p[13], w.docs.size, w.secuencia()], [false, DP1, VEND_328, 1, 1]);
    igual("PRO328-51 el JSON creado lleva como receptor la dirección validada, y la fotografía logística es de la MISMA dirección (UUID) con la misma calle/número/país", [domicilio({ payload: doc?.payload }), w.entregas.get(String(doc?.id))?.direccionId, w.entregas.get(String(doc?.id))?.snapshot.direccion, w.entregas.get(String(doc?.id))?.snapshot.numeroCasa], [["PRY", "Avda. Gral. Aquino", 1500, 11, 5, 3], DP1, "Avda. Gral. Aquino", "1500"]);
    igual("PRO328-52 el dInfAdic creado no tiene la línea automática de entrega", String(doc?.payload.dInfAdic).includes("Dirección de entrega:"), false);
  }
  {
    const w = mundo328();
    const c = cuerpo328(CLI_P, { direccionEntregaId: DP1 }, "clave-pro328-editada");
    const prev = await prepararFactura(w.db, EMPRESA, USUARIO, c);

    w.dir(DP1).numeroCasa = "1600"; // Clientes → Direcciones edita la MISMA fila después de la previa

    const r = await resultado(crearFacturaElectronica(w.db, EMPRESA, USUARIO, { ...c, infoAdicionalHuella: prev.resumen.infoAdicionalHuella, receptorHuella: prev.resumen.receptorHuella }));

    igual("PRO328-53 dirección editada entre la previa y la emisión: 409 «revise de nuevo» aunque la huella del dInfAdic siga igual; no se llega a la emisión (sin FE, número ni stock)", [r, creaciones(w), w.docs.size, w.secuencia()], [{ estado: 409, mensaje: MENSAJE_RECEPTOR_CAMBIO }, 0, 0, 0]);

    const sinHuella = await resultado(crearFacturaElectronica(w.db, EMPRESA, USUARIO, { ...c, infoAdicionalHuella: prev.resumen.infoAdicionalHuella }));

    igual("PRO328-54 con dirección seleccionada la huella del receptor es obligatoria: sin ella 409, sin emisión", [sinHuella, creaciones(w)], [{ estado: 409, mensaje: MENSAJE_RECEPTOR_CAMBIO }, 0]);

    const prev2 = await prepararFactura(w.db, EMPRESA, USUARIO, c);
    const ok = await crearFacturaElectronica(w.db, EMPRESA, USUARIO, { ...c, infoAdicionalHuella: prev2.resumen.infoAdicionalHuella, receptorHuella: prev2.resumen.receptorHuella });

    igual("PRO328-55 tras revisar de nuevo se emite UNA vez con el número de casa actual", [ok.reutilizado, enviado(w).dNumCasRec, w.docs.size], [false, 1600, 1]);
  }
  {
    const w = mundo328();
    const c = cuerpo328(CLI_P, { direccionEntregaId: DP1 }, "clave-pro328-concurrente");
    const prev = await prepararFactura(w.db, EMPRESA, USUARIO, c);

    w.estado.antesDeBloquear = () => { w.dir(DP1).ciu = 1; w.dir(DP1).dis = 1; w.dir(DP1).dep = 1; }; // edición concurrente confirmada justo antes del bloqueo de la función SQL

    const r = await resultado(crearFacturaElectronica(w.db, EMPRESA, USUARIO, { ...c, infoAdicionalHuella: prev.resumen.infoAdicionalHuella, receptorHuella: prev.resumen.receptorHuella }));

    igual("PRO328-56 edición concurrente después de la verificación TypeScript: la función SQL compara bajo bloqueo y rechaza (NEX:ENTREGA_INVALIDA → 409); rollback completo: sin FE, sin número, sin fotografía", [r, w.docs.size, w.secuencia(), w.entregas.size], [{ detail: "NEX:ENTREGA_INVALIDA" }, 0, 0, 0]);
  }

  // ── G. Idempotencia: identidad del destino por UUID persistido, nunca por texto ─────────────────────────────────────────────────────────────────────────────
  {
    const w = mundo328();
    const c = cuerpo328(CLI_P, { direccionEntregaId: DP1 }, "clave-pro328-reintento");
    const r1 = await revisarYEmitir(w, c);
    const original = JSON.stringify(w.docs.get("clave-pro328-reintento")?.payload);
    const r2 = await crearFacturaElectronica(w.db, EMPRESA, USUARIO, c);

    igual("PRO328-60 reintento con la misma clave y el mismo UUID: misma FE (reutilizada), sin segunda FE ni número", [r1.reutilizado, r2.reutilizado, r1.documentoId === r2.documentoId, w.docs.size, w.secuencia()], [false, true, true, 1, 1]);

    w.dir(DP1).direccion = "Calle renombrada";
    w.dir(DP1).numeroCasa = "7";

    const r3 = await crearFacturaElectronica(w.db, EMPRESA, USUARIO, c);

    w.dirs.splice(w.dirs.findIndex((d) => d.id === DP1), 1); // y luego la dirección se ELIMINA del catálogo

    const r4 = await crearFacturaElectronica(w.db, EMPRESA, USUARIO, c);

    igual("PRO328-61 la dirección original editada y luego eliminada NO altera la FE emitida: el reintento reenvía el payload histórico íntegro y la fotografía sigue igual", [r3.reutilizado, r4.reutilizado, JSON.stringify(enviado(w)) === original, JSON.stringify(w.docs.get("clave-pro328-reintento")?.payload) === original, w.entregas.get(r1.documentoId as string)?.snapshot.direccion], [true, true, true, true, "Avda. Gral. Aquino"]);

    const otroId = await resultado(crearFacturaElectronica(w.db, EMPRESA, USUARIO, { ...c, direccionEntregaId: DP6 }));

    igual("PRO328-62 misma clave con OTRO direccionEntregaId de texto idéntico (DP6 = DP1 en calle/número/códigos): conflicto de idempotencia (409), no reutiliza ni crea otra FE", [otroId, w.docs.size, w.secuencia()], [{ detail: "NEX:IDEMPOTENCIA_CONFLICTO" }, 1, 1]);

    const sinDir = await resultado(crearFacturaElectronica(w.db, EMPRESA, USUARIO, cuerpo328(CLI_P, {}, "clave-pro328-reintento")));

    igual("PRO328-63 misma clave SIN dirección cuando la original tenía una: conflicto (no se prueba identidad)", [sinDir, w.docs.size], [{ detail: "NEX:IDEMPOTENCIA_CONFLICTO" }, 1]);
    igual("PRO328-64 huellas: el UUID forma parte de la del receptor (DP1 y DP6 de texto idéntico dan huellas distintas; mismo dato, misma huella)", [huellaReceptor({ cPaisRec: "PRY", dDirRec: "X", dNumCasRec: 1 }, DP1) === huellaReceptor({ cPaisRec: "PRY", dDirRec: "X", dNumCasRec: 1 }, DP6), huellaReceptor({ cPaisRec: "PRY", dDirRec: "X", dNumCasRec: 1 }, DP1) === huellaReceptor({ dNumCasRec: 1, dDirRec: "X", cPaisRec: "PRY" }, DP1.toUpperCase())], [false, true]);
  }
  {
    // FE HISTÓRICA (legada) con la línea automática en su dInfAdic y receptor fiscal: el reintento la preserva íntegra; la identidad del destino se prueba por el UUID de su fotografía.
    const w = mundo328();
    const base = await prepararFactura(w.db, EMPRESA, USUARIO, cuerpo328(CLI_P, { direccionEntregaId: DP1 }, "clave-pro328-legada"));
    const legada = { ...pl(base), dDirRec: "Domicilio FISCAL", dNumCasRec: 999, cDepRec: 1, cDisRec: 1, cCiuRec: 1, dInfAdic: M + "\nDirección de entrega: Sucursal Luque — Avda. Gral. Aquino 1500, Luque, Central\nVendedor: Ana Vendedora" };

    w.docs.set("clave-pro328-legada", { id: "d0328000-0000-4000-8000-0000000000aa", numero: "80001", cliente: CLI_P, payload: legada, vendedor: VEND_328 });
    w.entregas.set("d0328000-0000-4000-8000-0000000000aa", { direccionId: DP1, snapshot: { direccion: "Avda. Gral. Aquino" } });
    w.docs.set("clave-pro328-sin-foto", { id: "d0328000-0000-4000-8000-0000000000bb", numero: "80002", cliente: CLI_P, payload: legada, vendedor: VEND_328 }); // anterior a NEX-068: sin fotografía

    const ok = await crearFacturaElectronica(w.db, EMPRESA, USUARIO, cuerpo328(CLI_P, { direccionEntregaId: DP1 }, "clave-pro328-legada"));
    const reenviado = enviado(w);
    const otro = await resultado(crearFacturaElectronica(w.db, EMPRESA, USUARIO, cuerpo328(CLI_P, { direccionEntregaId: DP6 }, "clave-pro328-legada")));
    const sinFoto = await resultado(crearFacturaElectronica(w.db, EMPRESA, USUARIO, cuerpo328(CLI_P, { direccionEntregaId: DP1 }, "clave-pro328-sin-foto")));

    igual("PRO328-65 FE histórica con la línea automática: el reintento con el mismo UUID se reconoce y reenvía EXACTAMENTE su dInfAdic y su receptor fiscal (nada se recompone ni se reescribe)", [ok.reutilizado, reenviado.dInfAdic === legada.dInfAdic, reenviado.dDirRec, JSON.stringify(w.docs.get("clave-pro328-legada")?.payload) === JSON.stringify(legada)], [true, true, "Domicilio FISCAL", true]);
    igual("PRO328-66 FE histórica: otro UUID aunque el texto de su línea coincida → 409; FE sin fotografía (sin mecanismo de identidad) con dirección → 409; ninguna FE nueva", [otro, sinFoto, w.secuencia()], [{ detail: "NEX:IDEMPOTENCIA_CONFLICTO" }, { detail: "NEX:IDEMPOTENCIA_CONFLICTO" }, 0]);
  }

  // ── H. Sin NEX-076 aplicada: error controlado, nunca simulación ni vuelta silenciosa al fiscal ───────────────────────────────────────────────────────────────
  {
    const w = mundo328({ nex076: false });
    const r = await resultado(prepararFactura(w.db, EMPRESA, USUARIO, cuerpo328(CLI_P, { direccionEntregaId: DP1 })));

    igual("PRO328-70 sin NEX-076, una FE nueva con dirección seleccionada se rechaza (422) con mensaje claro, sin leer la dirección ni emitir con el domicilio fiscal", [r, lecturas(w), creaciones(w)], [{ estado: 422, mensaje: MENSAJE_RECEPTOR_SIN_MIGRACION }, 0, 0]);

    w.docs.set("clave-pro328-pre076", { id: "d0328000-0000-4000-8000-0000000000cc", numero: "80003", cliente: CLI_P, payload: { ...pl(await prepararFactura(mundo328().db, EMPRESA, USUARIO, cuerpo328(CLI_P, { direccionEntregaId: DP1 }))), dInfAdic: M + "\nVendedor: Ana Vendedora" }, vendedor: VEND_328 });

    const ret = await resultado(crearFacturaElectronica(w.db, EMPRESA, USUARIO, cuerpo328(CLI_P, { direccionEntregaId: DP1 }, "clave-pro328-pre076")));

    igual("PRO328-71 sin NEX-076 un reintento con dirección no puede probar el UUID histórico: 409 seguro, sin side effects", [ret, w.secuencia(), creaciones(w)], [{ estado: 409, mensaje: MENSAJE_DESTINO_NO_COMPROBABLE }, 0, 0]);
  }

  // ── I. SQL de NEX-076 (estructural: NO se ejecutó; migración NO aplicada), aplicación, pantalla y fuera de alcance ─────────────────────────────────────────
  const sql = leer("documentacao/banco/nexit/v1/migraciones/NEX-076-facturacion-fe-direccion-receptor-seleccionada.sql");
  const sinComentarios = sql.replace(/--[^\n]*/g, "");
  const emision = leer("lib/facturacion/emision.ts");
  const pagina = leer("app/(private)/facturas/nueva/page.tsx");
  const comp = leer("app/(private)/facturas/nueva/entrega-cliente.tsx");
  const lectura = sinComentarios.slice(sinComentarios.indexOf("CREATE FUNCTION public.fe_direccion_receptor_elegida"), sinComentarios.indexOf("CREATE FUNCTION public.fe_documento_crear_fe_receptor"));
  const emisionSql = sinComentarios.slice(sinComentarios.indexOf("CREATE FUNCTION public.fe_documento_crear_fe_receptor"), sinComentarios.indexOf("COMMENT ON FUNCTION"));

  cierto("PRO328-80 SQL lectura: SECURITY DEFINER con search_path fijo, exige FACTURACION_ELECTRONICA.CREAR, devuelve SOLO id/país/calle/número/códigos de la MISMA fila del cliente y la empresa, elegible (fe_entrega_elegible) y cliente activo; sin escritura",
    /LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp/.test(lectura) && /'FACTURACION_ELECTRONICA', 'CREAR'/.test(lectura) && /RETURNS TABLE \(o_id uuid, o_pais_codigo text, o_direccion text, o_numero_casa text, o_departamento_codigo integer, o_distrito_codigo integer, o_ciudad_codigo integer\)/.test(lectura)
    && /d\.empresa_id = p_empresa AND d\.cliente_id = p_cliente AND d\.id = p_direccion/.test(lectura) && /public\.fe_entrega_elegible\(d\.tipo, d\.es_fiscal, d\.es_entrega_default\)/.test(lectura) && /c\.activo AND NOT c\.bloqueado_ventas/.test(lectura) && !/INSERT|UPDATE|DELETE/.test(lectura) && !/d\.departamento\b|d\.ciudad\b|d\.distrito\b/.test(lectura));
  cierto("PRO328-81 SQL emisión: bloquea la fila (FOR SHARE OF d) ANTES de crear y compara cPaisRec, dDirRec, dNumCasRec, cDepRec, cDisRec y cCiuRec (B2F sin geografía) con NEX:ENTREGA_INVALIDA; envuelve SIN copiar a fe_documento_crear_fe_vendedor",
    /FOR SHARE OF d/.test(emisionSql) && emisionSql.indexOf("FOR SHARE OF d") < emisionSql.indexOf("FROM public.fe_documento_crear_fe_vendedor(") && ["cPaisRec", "dDirRec", "dNumCasRec", "cDepRec", "cDisRec", "cCiuRec"].every((k) => emisionSql.includes(`'${k}'`)) && /v_b2f := \(p_payload->>'iTiOpe'\) = '4'/.test(emisionSql)
    && /DETAIL = 'NEX:ENTREGA_INVALIDA'/.test(emisionSql) && !/INSERT INTO public\.documentos_electronicos|fe_secuencia_reservar|INSERT INTO public\.documento_electronico_entregas/.test(emisionSql));
  cierto("PRO328-82 SQL: la fotografía creada se comprueba de la MISMA dirección (direccion_id) y con calle/número/país validados; el reintento compara SOLO el direccion_id persistido (IS DISTINCT FROM) con NEX:IDEMPOTENCIA_CONFLICTO, sin escribir",
    /e\.direccion_id = v_dir\.id/.test(emisionSql) && /\(e\.snapshot->>'direccion'\) IS NOT DISTINCT FROM v_dir\.direccion/.test(emisionSql) && /SELECT e\.direccion_id INTO v_previa FROM public\.documento_electronico_entregas e WHERE e\.empresa_id = p_empresa AND e\.documento_id = v_id/.test(emisionSql) && /IF v_previa IS DISTINCT FROM p_direccion_entrega THEN/.test(emisionSql) && /DETAIL = 'NEX:IDEMPOTENCIA_CONFLICTO'/.test(emisionSql) && !/dInfAdic/.test(emisionSql));
  cierto("PRO328-83 SQL grants: REVOKE PUBLIC, EXECUTE solo a nexit_runtime, la emisión de NEX-074 deja de ser directa; sin SELECT nuevo a direcciones_cliente ni a documento_electronico_entregas; el ayudante corre después del de NEX-074; guardas de dependencias y de reaplicación; NO aplicada",
    /GRANT EXECUTE ON FUNCTION public\.fe_direccion_receptor_elegida\(uuid, uuid, uuid, uuid\) TO nexit_runtime/.test(sql) && /GRANT EXECUTE ON FUNCTION public\.fe_documento_crear_fe_receptor\(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb, uuid, uuid\) TO nexit_runtime/.test(sql)
    && /REVOKE ALL ON FUNCTION public\.fe_documento_crear_fe_vendedor\(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb, uuid, uuid\) FROM nexit_runtime/.test(sql) && !/GRANT SELECT/.test(sinComentarios) && "nex_aplicar_grants_facturacion_vendedor" < "nex_aplicar_grants_facturacion_vendedor_receptor"
    && /NEX-076 parece aplicada; no se reaplica por suposición/.test(sql) && /NEX-076 requiere la emisión de FE con vendedor \(NEX-074\)/.test(sql) && /NO aplicada/.test(sql));
  cierto("PRO328-84 SQL aditiva: no redefine funciones instaladas (solo CREATE FUNCTION nuevas, ningún CREATE OR REPLACE ni ALTER/DROP de NEX-005/048/067/068/073/074) ni toca tablas existentes",
    !/CREATE OR REPLACE/.test(sinComentarios) && !/ALTER TABLE|DROP |UPDATE public\.|DELETE FROM/.test(sinComentarios) && (sinComentarios.match(/CREATE FUNCTION/g) ?? []).length === 3);
  cierto("PRO328-85 aplicación: el receptor seleccionado sale de fe_direccion_receptor_elegida (no de las descripciones del destino), la FE nueva no compone la línea de entrega, la emisión elige fe_documento_crear_fe_receptor con NEX-076 y la equivalencia ya no compara el texto del destino",
    /FROM fe_direccion_receptor_elegida\(\$1::uuid, \$2::uuid, \$3::uuid, \$4::uuid\)/.test(emision) && !/destino\.opcion\.(departamento|distrito|ciudad|direccion|numeroCasa|pais)/.test(emision) && /componerInfoAdicional\(\{ observaciones: cuerpo\.infoAdicional, vendedor:/.test(emision) && !/lineaEntrega/.test(emision)
    && /conReceptor \? "fe_documento_crear_fe_receptor" : "fe_documento_crear_fe_vendedor"/.test(emision) && !/partes\.entrega !== null && lineaEntrega/.test(emision));
  cierto("PRO328-86 pantalla: envía la huella del receptor REVISADO, muestra el «Domicilio del receptor (SIFEN)» devuelto por el servidor y el selector indica que la dirección elegida se usa para la FE sin modificar el maestro; el destino forma parte del cuerpo revisado (cambiarlo invalida la revisión)",
    pagina.includes("receptorHuella: revisado.receptorHuella") && pagina.includes("Domicilio del receptor (SIFEN)") && /\.\.\.\(direccionEntregaId \? \{ direccionEntregaId \} : \{\}\)/.test(pagina) && /const huellaActual = JSON\.stringify\(cuerpoFactura\(\)\)/.test(pagina)
    && /Se usa como domicilio del receptor de esta factura \(SIFEN\): no modifica la ficha del cliente/.test(comp) && /irá como domicilio del receptor en la factura electrónica/.test(comp));
  cierto("PRO328-87 fuera de alcance intacto: NCE (sin dirección de entrega ni receptor seleccionado), KuDE (PRO-326) y payload de NCE no usan NEX-076; el parser legado se conserva",
    !/fe_direccion_receptor_elegida|fe_documento_crear_fe_receptor|receptorSeleccionado/.test(leer("lib/facturacion/nce.ts") + leer("lib/facturacion/gateway.ts") + leer("lib/facturacion/shared.ts")) && /export function descomponerInfoAdicional/.test(leer("lib/facturacion/info-adicional.ts")) && /export function lineaEntrega/.test(leer("lib/facturacion/info-adicional.ts")));
}
