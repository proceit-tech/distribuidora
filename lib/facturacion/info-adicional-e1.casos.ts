/**
 * E1 (PRO-93 / PRO-94) — J003 `dInfAdic` de la NCE y composición pura. Lógica REAL del servidor (prepararNce, propuestaCorreccion y las funciones de composición) con una base simulada que responde las
 * consultas que el código emite; la parte FE se prueba en entrega-e04.casos (E1-01…E1-11). Sin PostgreSQL ni gateway.
 */
import { contador } from "@/lib/clientes/contador-casos";
import { componerInfoAdicional, lineaEntrega, lineaVendedor, LIMITE_INFO_ADICIONAL, MARCA_AUTOMATICA, separarObservacion } from "@/lib/facturacion/info-adicional";
import { crearNotaCredito, leerCuerpoNce, MENSAJE_INFO_NCE_CAMBIO, prepararNce, propuestaCorreccion } from "@/lib/facturacion/nce";
import { repeticion } from "@/lib/facturacion/nce-emision";
import { ErrorFacturacion } from "@/lib/facturacion/shared";

const EMP_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EMP_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const U_FE = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1"; // emitió la FE original
const U_NCE = "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2"; // emite la NCE
const U_B = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1"; // otra empresa
const FE = "f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0";
const NCE_RECH = "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0";
const SUC = "50505050-5050-4505-8505-505050505050";
const PTO = "70707070-7070-4707-8707-707070707070";
const CDC = "01800000017001001000000112026101612345678901";

const detalle = { dCodInt: "P1", dGtin: null, dDesProSer: "Producto uno", cUniMed: 77, dCantProSer: 5, dPUniProSer: 10000, dTotOpeItem: 50000, iAfecIVA: 1, dPropIVA: 100, dTasaIVA: 10 };

function base(opciones: { persistida?: Map<string, string | null>; cuentas?: Map<string, { nombre: string; apellido: string | null }>; rechazada?: { observacion: string } } = {}) {
  const cuentas = opciones.cuentas ?? new Map([[EMP_A + "|" + U_FE, { nombre: "Ana", apellido: "López" }], [EMP_A + "|" + U_NCE, { nombre: "Luis", apellido: "Gómez" }], [EMP_B + "|" + U_B, { nombre: "Zoe", apellido: "Ajena" }]]);
  const llamadas: string[] = [];
  const db = {
    async query(sql: string, p: unknown[] = []) {
      llamadas.push(sql);
      if (/FROM usuarios WHERE empresa_id/.test(sql)) { const u = cuentas.get(String(p[0]) + "|" + String(p[1])); return { rows: u ? [u] : [] }; }
      if (/FROM documentos_electronicos d JOIN documento_electronico_solicitudes s/.test(sql)) { const k = String(p[1]); return opciones.persistida?.has(k) ? { rows: [{ info: opciones.persistida.get(k) }] } : { rows: [] }; }
      if (/to_regclass/.test(sql)) return { rows: [{ ok: false }] };
      if (/JOIN LATERAL/.test(sql)) return { rows: [{ id: FE, sucursalId: SUC, establecimiento: "001", puntoExpedicion: "001", numero: "0000001", serie: null, cdc: CDC, fechaEmision: "2026-10-16T12:00:00Z", moneda: "PYG", total: "50000", clienteId: null, receptorNombre: "CLIENTE", receptorDocumento: "1", estadoSifen: "APROBADO", payload: { Detalles: [detalle], dNomRec: "CLIENTE", dRucRec: "1", iNatRec: 1 } }] };
      if (/FROM nce_lineas nl JOIN documentos_electronicos n/.test(sql)) return { rows: [] };
      if (/FROM nce_origen o JOIN documentos_electronicos n/.test(sql)) return { rows: [] };
      if (/FROM unidades_medida_sifen/.test(sql)) return { rows: [{ codigo: 77, representacion: "UNI" }] };
      if (/FROM fe_puntos_expedicion p JOIN sucursales/.test(sql)) return { rows: [{ codigo: "001", ultimo: 10, tipoActivo: true, establecimiento: "001" }] };
      if (/FROM documentos_electronicos n JOIN nce_origen o/.test(sql) && opciones.rechazada) return { rows: [{ id: NCE_RECH, sucursalId: SUC, establecimiento: "001", puntoExpedicion: "001", numero: "0000009", serie: null, estadoLocal: "ENVIADO", estadoSifen: "RECHAZADO", envioErrorTipo: null, feId: FE, motivo: 2, observacion: opciones.rechazada.observacion, puntoId: PTO }] };
      if (/FROM nce_lineas WHERE empresa_id/.test(sql)) return { rows: [{ linea: 1, cantidad: "2", monto: "20000" }] };

      return { rows: [] };
    },
  };

  return { db: db as never, llamadas, cuentas };
}

const cuerpo = (extra: Record<string, unknown> = {}, clave = "clave-nce-e1-0001") => {
  const c = leerCuerpoNce({ facturaId: FE, motivo: 2, sucursalId: SUC, puntoId: PTO, claveIdempotencia: clave, observacion: "", lineas: [{ linea: 1, cantidad: "2" }], ...extra });

  if (typeof c === "string") throw new Error(c);

  return c;
};
const dInf = (p: { payload: Record<string, unknown> }) => p.payload.dInfAdic as string | null;
const estado = async (p: Promise<unknown>) => { try { await p; return "OK"; } catch (e) { return e instanceof ErrorFacturacion ? e.estado + ":" + e.message : "ERR:" + String((e as Error).message); } };

export async function verificarCasosInfoAdicionalE1(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };

  // ── composición pura ──────────────────────────────────────────────────────────────────────────
  const M = MARCA_AUTOMATICA;

  igual("E1-20 líneas: «Dirección de entrega: sede — dirección» y «Vendedor: nombre apellido» (espacios y controles limpiados; sin datos → null)", [lineaEntrega({ nombre: "SUC ESPAÑA", direccion: "AVDA ESPAÑA C/ DR BESTARD, ASUNCIÓN" }), lineaEntrega(null), lineaEntrega({ nombre: " ", direccion: "" }), lineaVendedor("Juan", "Pérez"), lineaVendedor(" Juan ", null), lineaVendedor("", " "), lineaVendedor(null, null)], ["Dirección de entrega: SUC ESPAÑA — AVDA ESPAÑA C/ DR BESTARD, ASUNCIÓN", null, null, "Vendedor: Juan Pérez", "Vendedor: Juan", null, null]);
  igual("E1-21 (F002) composición: observaciones → marca → entrega → vendedor; una línea «Vendedor:» escrita por el operador NO sustituye ni evita la automática; sin datos automáticos no hay marca; vacía si no hay nada", [componerInfoAdicional({ observaciones: "Obs", entrega: "Dirección de entrega: X", vendedor: "Vendedor: Y" }), componerInfoAdicional({ observaciones: "Obs\nVendedor: Y", vendedor: "Vendedor: Y" }), componerInfoAdicional({ observaciones: "  ", entrega: null, vendedor: null }), componerInfoAdicional({ observaciones: "", vendedor: "Vendedor: Y" }), componerInfoAdicional({ observaciones: "Solo obs", vendedor: null })], ["Obs\n" + M + "\nDirección de entrega: X\nVendedor: Y", "Obs\nVendedor: Y\n" + M + "\nVendedor: Y", "", M + "\nVendedor: Y", "Solo obs"]);
  igual("E1-22 (F001) separarObservacion solo retira un bloque automático VERIFICABLE (marca + líneas válidas al final); sin marca conserva todo, incluso «Vendedor:» o «Dirección de entrega:» escritos por el operador", [
    separarObservacion("Obs propia\n" + M + "\nVendedor: Ana López"),
    separarObservacion("Entrega especial\nVendedor: Pablo"),
    separarObservacion("Nota\nDirección de entrega: Depósito 3"),
    separarObservacion("L1\nVendedor: algo\nL3"),
    separarObservacion(M + "\nVendedor: Ana López"),
    separarObservacion("Sin automáticas"),
    separarObservacion(""),
    separarObservacion("X\n" + M + "\nOtra cosa"),
    separarObservacion("Obs\n" + M + "\nDirección de entrega: A\nVendedor: B"),
  ], ["Obs propia", "Entrega especial\nVendedor: Pablo", "Nota\nDirección de entrega: Depósito 3", "L1\nVendedor: algo\nL3", "", "Sin automáticas", "", "X\n" + M + "\nOtra cosa", "Obs"]);
  igual("E1-22b componer → separar es reversible y no acumula: la observación «Vendedor: Otro» sobrevive intacta, y una marca falsificada por el operador solo retira el bloque propio del sistema (el último)", [
    separarObservacion(componerInfoAdicional({ observaciones: "Vendedor: Otro", vendedor: "Vendedor: Y" })),
    separarObservacion("A\n" + M + "\nVendedor: Otro\n" + M + "\nVendedor: Ana"),
    separarObservacion(componerInfoAdicional({ observaciones: separarObservacion(componerInfoAdicional({ observaciones: "Obs", vendedor: "Vendedor: Y" })), vendedor: "Vendedor: Z" })),
  ], ["Vendedor: Otro", "A\n" + M + "\nVendedor: Otro", "Obs"]);

  // ── NCE emitida por el usuario B (distinto del que emitió la FE) ──────────────────────────────
  const b = base();
  const n1 = await prepararNce(b.db, EMP_A, U_NCE, cuerpo());
  const n2 = await prepararNce(b.db, EMP_A, U_NCE, cuerpo({ observacion: "Devolución por rotura\nCaja 3" }));
  const n3 = await prepararNce(b.db, EMP_A, U_FE, cuerpo());
  const n4 = await prepararNce(b.db, EMP_A, U_NCE, cuerpo({ observacion: "Vendedor: Otro" }));

  igual("E1-23 la NCE lleva «Vendedor:» del usuario que EMITE la nota (Luis Gómez), no el de la factura original (Ana López)", [dInf(n1), dInf(n1)?.includes("Ana")], [M + "\nVendedor: Luis Gómez", false]);
  igual("E1-24 las observaciones propias de la NCE se preservan íntegras (con saltos de línea); la marca y el vendedor se añaden después", dInf(n2)?.split("\n"), ["Devolución por rotura", "Caja 3", M, "Vendedor: Luis Gómez"]);
  igual("E1-25 la NCE emitida por el usuario de la factura original lleva su propio nombre (cada NCE registra a su emisor)", dInf(n3), M + "\nVendedor: Ana López");
  igual("E1-26 el documento asociado y su CDC no cambian y el JSON usa exactamente dInfAdic", [(n2.payload.DocumentosAsociados as Array<{ dCdCDERef: string }>)[0].dCdCDERef, n2.payload.iTiDE, Object.keys(n2.payload).filter((k) => /inf.*adic/i.test(k))], [CDC, 5, ["dInfAdic"]]);
  igual("E1-26b (F002) NCE con observación manual «Vendedor: Otro»: se preserva, queda ANTES de la marca y la identificación autenticada va después de ella, una sola vez", [dInf(n4)?.split("\n"), (dInf(n4)?.split("\n") ?? []).indexOf("Vendedor: Otro") < (dInf(n4)?.split("\n") ?? []).indexOf(M), (dInf(n4)?.split(M)[1] ?? "").includes("Otro")], [["Vendedor: Otro", M, "Vendedor: Luis Gómez"], true, false]);

  // ── límite de 5000 caracteres sobre el texto final, antes de reservar numeración ──────────────
  const limite = 5000 - ("\n" + M + "\nVendedor: Luis Gómez").length;
  const justo = await prepararNce(b.db, EMP_A, U_NCE, cuerpo({ observacion: "k".repeat(limite) }));
  const exceso = await estado(prepararNce(b.db, EMP_A, U_NCE, cuerpo({ observacion: "k".repeat(limite + 1) })));

  igual("E1-27 el texto final de exactamente 5000 caracteres se acepta completo; un carácter más (5001) se rechaza con error explícito (422) sin truncar", [dInf(justo)?.length, exceso.startsWith("422:La información adicional"), LIMITE_INFO_ADICIONAL], [5000, true, 5000]);

  // ── reintento idempotente: snapshot persistido ────────────────────────────────────────────────
  const reintento = base({ persistida: new Map([["clave-nce-e1-0001", "Obs original\n" + M + "\nVendedor: Luis Gómez"]]) });

  reintento.cuentas.set(EMP_A + "|" + U_NCE, { nombre: "Nombre", apellido: "Cambiado" });

  const rn = await prepararNce(reintento.db, EMP_A, U_NCE, cuerpo({ observacion: "Obs original" }));

  igual("E1-28 reenvío de una NCE ya creada con esa clave: se reutiliza el dInfAdic PERSISTIDO (no se recompone con el nombre nuevo ni se duplica el vendedor)", [dInf(rn), (dInf(rn) ?? "").split("\n").filter((l) => l.startsWith("Vendedor:")).length, rn.infoReutilizada], ["Obs original\n" + M + "\nVendedor: Luis Gómez", 1, true]);

  // ── corrección de NCE rechazada ───────────────────────────────────────────────────────────────
  const corr = base({ rechazada: { observacion: "Obs de la rechazada\n" + M + "\nVendedor: Ana López" } });
  const prop = (await propuestaCorreccion(corr.db, EMP_A, U_NCE, NCE_RECH)) as { observacion: string; motivo: number; lineas: Array<{ linea: number }> };

  igual("E1-29 la corrección precarga solo las observaciones propias (sin el bloque automático de la nota rechazada) y conserva motivo y líneas", [prop.observacion, prop.motivo, prop.lineas.length], ["Obs de la rechazada", 2, 1]);

  const reemitida = await prepararNce(corr.db, EMP_A, U_NCE, cuerpo({ observacion: prop.observacion }, "clave-nce-e1-0002"));

  igual("E1-30 (corregida por OTRO vendedor) al emitir la corrección, el vendedor es quien la emite ahora, aparece UNA sola vez y la observación no se pierde", [dInf(reemitida)?.split("\n"), (dInf(reemitida)?.match(/Vendedor:/g) ?? []).length], [["Obs de la rechazada", M, "Vendedor: Luis Gómez"], 1]);

  // F001: NCE histórica (sin marca) con observación manual que termina en «Vendedor:» / «Dirección de entrega:»
  const histV = await propuestaCorreccion(base({ rechazada: { observacion: "Entrega especial\nVendedor: Pablo" } }).db, EMP_A, U_NCE, NCE_RECH) as { observacion: string };
  const histD = await propuestaCorreccion(base({ rechazada: { observacion: "Retira cliente\nDirección de entrega: Depósito 3" } }).db, EMP_A, U_NCE, NCE_RECH) as { observacion: string };
  const reHist = await prepararNce(b.db, EMP_A, U_NCE, cuerpo({ observacion: histV.observacion }, "clave-nce-e1-0003"));
  const segunda = await propuestaCorreccion(base({ rechazada: { observacion: dInf(reHist) ?? "" } }).db, EMP_A, U_NCE, NCE_RECH) as { observacion: string };

  igual("E1-32 (F001) NCE histórica con observación manual terminada en «Vendedor:» o «Dirección de entrega:»: la corrección la conserva íntegra; recompuesta se distingue del vendedor autenticado y en una segunda corrección no se acumula nada", [histV.observacion, histD.observacion, dInf(reHist)?.split("\n"), segunda.observacion], ["Entrega especial\nVendedor: Pablo", "Retira cliente\nDirección de entrega: Depósito 3", ["Entrega especial", "Vendedor: Pablo", M, "Vendedor: Luis Gómez"], "Entrega especial\nVendedor: Pablo"]);

  // ── F003: la NCE se emite con el texto que se revisó ──────────────────────────────────────────
  const rev = base();
  const previa = await prepararNce(rev.db, EMP_A, U_NCE, cuerpo({ observacion: "Nota" }, "clave-nce-e1-0004"));
  const previa2 = await prepararNce(rev.db, EMP_A, U_NCE, cuerpo({ observacion: "Nota" }, "clave-nce-e1-0004"));

  igual("E1-33 (F003) la previa expone el dInfAdic final y su huella; revisar dos veces produce el mismo texto y la misma huella (no acumula)", [previa.resumen.infoAdicional === dInf(previa), /^[0-9a-f]{64}$/.test(previa.resumen.infoAdicionalHuella), previa.resumen.infoAdicionalHuella === previa2.resumen.infoAdicionalHuella], [true, true, true]);

  rev.cuentas.set(EMP_A + "|" + U_NCE, { nombre: "Luis", apellido: "Renombrado" });

  const envio = await prepararNce(rev.db, EMP_A, U_NCE, cuerpo({ observacion: "Nota" }, "clave-nce-e1-0004"));
  const creaciones = () => rev.llamadas.filter((q) => /fe_documento_crear_nce/.test(q)).length;
  const revisada = cuerpo({ observacion: "Nota", infoAdicionalHuella: previa.resumen.infoAdicionalHuella }, "clave-nce-e1-0004");
  const cambio = await estado(crearNotaCredito(rev.db, EMP_A, U_NCE, revisada, envio));

  igual("E1-34 (F003) si el nombre del vendedor cambió entre la previa y el envío: 409 «revise de nuevo» y NO se llega a la función de creación (sin numeración, sin documento)", [cambio, creaciones(), envio.resumen.infoAdicionalHuella === previa.resumen.infoAdicionalHuella], ["409:" + MENSAJE_INFO_NCE_CAMBIO, 0, false]);

  const vigente = cuerpo({ observacion: "Nota", infoAdicionalHuella: envio.resumen.infoAdicionalHuella }, "clave-nce-e1-0004");

  await crearNotaCredito(rev.db, EMP_A, U_NCE, vigente, envio);
  igual("E1-35 (F003) con la huella de la revisión vigente la NCE se crea (una única llamada de creación) y el payload lleva exactamente el texto revisado", [creaciones(), (envio.payload as { dInfAdic: string }).dInfAdic === envio.resumen.infoAdicional], [1, true]);

  const persistidoRev = base({ persistida: new Map([["clave-nce-e1-0004", previa.resumen.infoAdicional]]) });

  persistidoRev.cuentas.set(EMP_A + "|" + U_NCE, { nombre: "Otro", apellido: "Nombre" });

  const reenvio = await prepararNce(persistidoRev.db, EMP_A, U_NCE, cuerpo({ observacion: "Nota", infoAdicionalHuella: previa.resumen.infoAdicionalHuella }, "clave-nce-e1-0004"));

  await crearNotaCredito(persistidoRev.db, EMP_A, U_NCE, cuerpo({ observacion: "Nota", infoAdicionalHuella: previa.resumen.infoAdicionalHuella }, "clave-nce-e1-0004"), reenvio);
  igual("E1-36 (F003) reenvío de una NCE YA creada tras un cambio de nombre: reutiliza el snapshot original (misma huella que la revisión), sin 409 y sin recomponer", [reenvio.infoReutilizada, reenvio.resumen.infoAdicionalHuella === previa.resumen.infoAdicionalHuella, persistidoRev.llamadas.filter((q) => /fe_documento_crear_nce/.test(q)).length], [true, true, 1]);

  // falso conflicto de idempotencia: lo guardado es el dInfAdic compuesto, el reintento trae las observaciones crudas
  const guardado = base();
  const dbRep = { async query(sql: string, p: unknown[] = []): Promise<unknown> {
    if (/LEFT JOIN nce_origen o/.test(sql)) return { rows: [{ id: NCE_RECH, numero: "0000009", tipo: "NCE", sucursalId: SUC, puntoCodigo: "001", feId: FE, motivo: 2, observacion: "Nota\n" + M + "\nVendedor: Luis Gómez" }] };
    if (/FROM fe_puntos_expedicion WHERE empresa_id/.test(sql)) return { rows: [{ codigo: "001" }] };

    return (guardado.db as unknown as { query: (s: string, p: unknown[]) => Promise<unknown> }).query(sql, p);
  } };
  const rep = await repeticion(dbRep as never, EMP_A, U_NCE, cuerpo({ observacion: "Nota" }, "clave-nce-e1-0004"));
  const repOtra = await estado(repeticion(dbRep as never, EMP_A, U_NCE, cuerpo({ observacion: "Otra observación" }, "clave-nce-e1-0004")));

  igual("E1-37 reintento legítimo (respuesta perdida) de una NCE cuyo dInfAdic guardado incluye el vendedor: se reconoce como repetición (no falso conflicto); otra observación sigue siendo conflicto 409", [rep?.numero, repOtra.startsWith("409:")], ["0000009", true]);

  // ── aislamiento entre empresas ────────────────────────────────────────────────────────────────
  const aj = base();
  const deB = await prepararNce(aj.db, EMP_B, U_B, cuerpo()).then((x) => dInf(x), () => "ERR");
  const cruce = await prepararNce(aj.db, EMP_B, U_NCE, cuerpo()).then((x) => dInf(x), () => "ERR");

  igual("E1-31 sin fuga entre tenants: la cuenta se busca por empresa y usuario de la sesión; el usuario de la empresa A no resuelve nombre en B (no se inventa vendedor) y el nombre de B solo aparece para B", [deB, cruce, (cruce ?? "").includes("Luis")], [M + "\nVendedor: Zoe Ajena", null, false]);

  return fallos;
}
