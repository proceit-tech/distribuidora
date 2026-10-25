/**
 * E1 (PRO-93 / PRO-94) — J003 `dInfAdic` de la NCE y composición pura. Lógica REAL del servidor (prepararNce, propuestaCorreccion y las funciones de composición) con una base simulada que responde las
 * consultas que el código emite; la parte FE se prueba en entrega-e04.casos (E1-01…E1-11). Sin PostgreSQL ni gateway.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { componerInfoAdicional, legadoCoincide, lineaEntrega, lineaVendedor, LIMITE_INFO_ADICIONAL, MARCA_AUTOMATICA } from "@/lib/facturacion/info-adicional";
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

function base(opciones: { persistida?: Map<string, string | null>; cuentas?: Map<string, { nombre: string; apellido: string | null }>; rechazada?: { observacion: string }; migracion?: boolean; originales?: Map<string, string>; documento?: { observacion: string | null; motivo?: number }; descuentos?: { habilitado: boolean; montos?: Map<string, string> }; lineasGuardadas?: Array<{ linea: number; cantidad: string; monto: string }> } = {}) {
  const cuentas = opciones.cuentas ?? new Map([[EMP_A + "|" + U_FE, { nombre: "Ana", apellido: "López" }], [EMP_A + "|" + U_NCE, { nombre: "Luis", apellido: "Gómez" }], [EMP_B + "|" + U_B, { nombre: "Zoe", apellido: "Ajena" }]]);
  const llamadas: string[] = [];
  const parametros: Array<{ sql: string; p: unknown[] }> = [];
  const db = {
    async query(sql: string, p: unknown[] = []) {
      llamadas.push(sql);
      parametros.push({ sql, p });
      if (/to_regclass\('public\.nce_observaciones_originales'\)/.test(sql)) return { rows: [{ ok: opciones.migracion === true }] };
      if (/FROM nce_observaciones_originales/.test(sql)) { const o = opciones.originales?.get(String(p[0]) + "|" + String(p[1])); return { rows: o === undefined ? [] : [{ observacion: o }] }; }
      if (/LEFT JOIN nce_origen o/.test(sql) && opciones.documento) return { rows: [{ id: NCE_RECH, numero: "0000009", tipo: "NCE", sucursalId: SUC, puntoCodigo: "001", feId: FE, motivo: opciones.documento.motivo ?? 2, observacion: opciones.documento.observacion }] };
      if (/to_regclass\('public\.nce_descuentos'\)/.test(sql)) return { rows: [{ ok: opciones.descuentos?.habilitado === true }] };
      if (/FROM nce_descuentos WHERE empresa_id/.test(sql)) { const m = opciones.descuentos?.montos?.get(String(p[0]) + "|" + String(p[1])); return { rows: m === undefined ? [] : [{ monto: m }] }; }
      if (/FROM fe_puntos_expedicion WHERE empresa_id/.test(sql)) return { rows: [{ codigo: "001" }] };
      if (/FROM usuarios WHERE empresa_id/.test(sql)) { const u = cuentas.get(String(p[0]) + "|" + String(p[1])); return { rows: u ? [u] : [] }; }
      if (/FROM documentos_electronicos d JOIN documento_electronico_solicitudes s/.test(sql)) { const k = String(p[1]); return opciones.persistida?.has(k) ? { rows: [{ info: opciones.persistida.get(k) }] } : { rows: [] }; }
      if (/to_regclass/.test(sql)) return { rows: [{ ok: false }] };
      if (/JOIN LATERAL/.test(sql)) return { rows: [{ id: FE, sucursalId: SUC, establecimiento: "001", puntoExpedicion: "001", numero: "0000001", serie: null, cdc: CDC, fechaEmision: "2026-10-16T12:00:00Z", moneda: "PYG", total: "50000", clienteId: null, receptorNombre: "CLIENTE", receptorDocumento: "1", estadoSifen: "APROBADO", payload: { Detalles: [detalle], dNomRec: "CLIENTE", dRucRec: "1", iNatRec: 1 } }] };
      if (/FROM nce_lineas nl JOIN documentos_electronicos n/.test(sql)) return { rows: [] };
      if (/FROM nce_origen o JOIN documentos_electronicos n/.test(sql)) return { rows: [] };
      if (/FROM unidades_medida_sifen/.test(sql)) return { rows: [{ codigo: 77, representacion: "UNI" }] };
      if (/FROM fe_puntos_expedicion p JOIN sucursales/.test(sql)) return { rows: [{ codigo: "001", ultimo: 10, tipoActivo: true, establecimiento: "001" }] };
      if (/FROM documentos_electronicos n JOIN nce_origen o/.test(sql) && opciones.rechazada) return { rows: [{ id: NCE_RECH, sucursalId: SUC, establecimiento: "001", puntoExpedicion: "001", numero: "0000009", serie: null, estadoLocal: "ENVIADO", estadoSifen: "RECHAZADO", envioErrorTipo: null, feId: FE, motivo: 2, observacion: opciones.rechazada.observacion, puntoId: PTO }] };
      if (/FROM nce_lineas WHERE empresa_id/.test(sql)) return { rows: opciones.lineasGuardadas ?? [{ linea: 1, cantidad: "2", monto: "20000" }] };

      return { rows: [] };
    },
  };

  return { db: db as never, llamadas, parametros, cuentas };
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
  igual("E1-22 (R03-F002) NCE sin observación original registrada: el reintento solo coincide si el texto guardado es EXACTAMENTE el enviado y no hay bloque automático; con marca (dInfAdic compuesto) o texto distinto, no", [
    legadoCoincide("Nota", "Nota"),
    legadoCoincide(null, "  "),
    legadoCoincide("Nota\n" + M + "\nVendedor: Luis Gómez", "Nota"),
    legadoCoincide(M + "\nVendedor: Luis Gómez", ""),
    legadoCoincide(M + "\nVendedor: Luis Gómez", M + "\nVendedor: Luis Gómez"),
    legadoCoincide("Nota\n" + M + "\nVendedor: Luis Gómez", "Nota\n" + M + "\nVendedor: Luis Gómez"),
    legadoCoincide("Nota", "Otra"),
  ], [true, true, false, false, false, false, false]);

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

  // ── corrección de NCE rechazada (NEX-071: observación original persistida) ────────────────────
  const clave = (nce: string) => EMP_A + "|" + nce;
  const conOriginal = (texto: string, original: string, nce = NCE_RECH) => base({ migracion: true, rechazada: { observacion: texto }, originales: new Map([[clave(nce), original]]) });
  const manualM = "Entrega especial\n" + M + "\nVendedor: Ana López"; // lo tecleó el operador; el creador de la NCE histórica también se llama Ana López

  const prop = (await propuestaCorreccion(conOriginal("Obs de la rechazada\n" + M + "\nVendedor: Ana López", "Obs de la rechazada").db, EMP_A, U_NCE, NCE_RECH)) as { observacion: string; motivo: number; lineas: Array<{ linea: number }> };

  igual("E1-29 (NCE nueva) la corrección precarga EXACTAMENTE la observación original registrada, sin inferir nada del bloque automático, y conserva motivo y líneas", [prop.observacion, prop.motivo, prop.lineas.length], ["Obs de la rechazada", 2, 1]);

  const corr = base({ migracion: true });
  const reemitida = await prepararNce(corr.db, EMP_A, U_NCE, cuerpo({ observacion: prop.observacion }, "clave-nce-e1-0002"));

  igual("E1-30 (corregida por OTRO vendedor) al emitir la corrección, el vendedor es quien la emite ahora, aparece UNA sola vez y la observación no se pierde", [dInf(reemitida)?.split("\n"), (dInf(reemitida)?.match(/Vendedor:/g) ?? []).length], [["Obs de la rechazada", M, "Vendedor: Luis Gómez"], 1]);

  // R03-F001: NCE HISTÓRICA (sin registro) cuyo marcador y vendedor coinciden con el nombre del creador: no se pierde ninguna línea
  const hist1 = (await propuestaCorreccion(base({ migracion: true, rechazada: { observacion: manualM } }).db, EMP_A, U_NCE, NCE_RECH)) as { observacion: string };
  const hist2 = (await propuestaCorreccion(base({ migracion: true, rechazada: { observacion: "Entrega especial\n" + M + "\nVendedor: Pablo" } }).db, EMP_A, U_NCE, NCE_RECH)) as { observacion: string };
  const hist3 = (await propuestaCorreccion(base({ migracion: false, rechazada: { observacion: manualM } }).db, EMP_A, U_NCE, NCE_RECH)) as { observacion: string };
  const hist4 = (await propuestaCorreccion(base({ migracion: true, rechazada: { observacion: "Retira cliente\nDirección de entrega: Depósito 3\nVendedor: Pablo" } }).db, EMP_A, U_NCE, NCE_RECH)) as { observacion: string };

  igual("E1-32 (R03-F001) NCE histórica sin registro: la corrección conserva el texto íntegro aunque el marcador y el vendedor coincidan con el creador, aunque sea otro vendedor, sin la migración aplicada, o con «Vendedor:» / «Dirección de entrega:» manuales", [hist1.observacion, hist2.observacion, hist3.observacion, hist4.observacion], [manualM, "Entrega especial\n" + M + "\nVendedor: Pablo", manualM, "Retira cliente\nDirección de entrega: Depósito 3\nVendedor: Pablo"]);

  // NCE nueva con observación que imita el bloque automático: se conserva exactamente lo escrito; segunda corrección sin duplicación
  const nuevo1 = await prepararNce(corr.db, EMP_A, U_NCE, cuerpo({ observacion: manualM }, "clave-nce-e1-0005"));
  const sep2 = (await propuestaCorreccion(conOriginal(dInf(nuevo1) ?? "", manualM).db, EMP_A, U_FE, NCE_RECH)) as { observacion: string };
  const nuevo2 = await prepararNce(corr.db, EMP_A, U_FE, cuerpo({ observacion: sep2.observacion }, "clave-nce-e1-0006"));
  const sep3 = (await propuestaCorreccion(conOriginal(dInf(nuevo2) ?? "", sep2.observacion).db, EMP_A, U_NCE, NCE_RECH)) as { observacion: string };

  igual("E1-38 (R03-F001) NCE nueva con observación que imita marca + vendedor: se conserva tal cual; la 1.ª y la 2.ª corrección (por otros usuarios) recomponen UN solo bloque auténtico y no acumulan nada", [sep2.observacion, dInf(nuevo2)?.split("\n"), sep3.observacion], [manualM, ["Entrega especial", M, "Vendedor: Ana López", M, "Vendedor: Ana López"], manualM]);

  // usuario renombrado después: el registro persistido no depende del nombre
  const ren = base({ migracion: true, rechazada: { observacion: "Obs\n" + M + "\nVendedor: Ana López" }, originales: new Map([[clave(NCE_RECH), "Obs"]]) });

  ren.cuentas.set(EMP_A + "|" + U_FE, { nombre: "Ana", apellido: "Renombrada" });

  const hRen = (await propuestaCorreccion(ren.db, EMP_A, U_NCE, NCE_RECH)) as { observacion: string };

  igual("E1-39 NCE nueva y creador renombrado después: la observación original sale intacta del registro (sin reinterpretar texto)", hRen.observacion, "Obs");

  // aislamiento por empresa: el registro de otra empresa no se ve
  const otraEmpresa = (await propuestaCorreccion(base({ migracion: true, rechazada: { observacion: "Guardado A" }, originales: new Map([[EMP_B + "|" + NCE_RECH, "SECRETO B"]]) }).db, EMP_A, U_NCE, NCE_RECH)) as { observacion: string };

  igual("E1-40 aislamiento: el registro de observación original se busca por la empresa de la sesión; el de otra empresa nunca se usa", otraEmpresa.observacion, "Guardado A");

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

  // ── NEX-071: creación con registro de la observación original (o ruta conservadora sin la migración) ─
  const conMig = base({ migracion: true });
  const prepM = await prepararNce(conMig.db, EMP_A, U_NCE, cuerpo({ observacion: "  Nota original  " }, "clave-nce-e1-0007"));

  await crearNotaCredito(conMig.db, EMP_A, U_NCE, cuerpo({ observacion: "  Nota original  " }, "clave-nce-e1-0007"), prepM);

  const llamM = conMig.parametros.filter((q) => /fe_documento_crear_nce/.test(q.sql));
  const sinMig = base({ migracion: false });
  const prepS = await prepararNce(sinMig.db, EMP_A, U_NCE, cuerpo({ observacion: "Nota" }, "clave-nce-e1-0008"));

  await crearNotaCredito(sinMig.db, EMP_A, U_NCE, cuerpo({ observacion: "Nota" }, "clave-nce-e1-0008"), prepS);

  const llamS = sinMig.parametros.filter((q) => /fe_documento_crear_nce/.test(q.sql));

  igual("E1-41 (NEX-071 aplicada) la NCE nueva se crea con fe_documento_crear_nce_obs en UNA sola llamada, con la observación CRUDA (sin recortar) como 12.º parámetro y el mismo dInfAdic en el payload; sin la migración usa la función anterior y no envía observación original", [llamM.length, /fe_documento_crear_nce_obs/.test(llamM[0]?.sql ?? ""), llamM[0]?.p.length, llamM[0]?.p[11], (JSON.parse(String(llamM[0]?.p[10])) as { dInfAdic: string }).dInfAdic.startsWith("Nota original\n" + M), llamS.length, /fe_documento_crear_nce_obs/.test(llamS[0]?.sql ?? ""), llamS[0]?.p.length], [1, true, 12, "  Nota original  ", true, 1, false, 11]);

  const snap = base({ migracion: true, persistida: new Map([["clave-nce-e1-0009", "Nota\n" + M + "\nVendedor: Luis Gómez"]]) });
  const prepR = await prepararNce(snap.db, EMP_A, U_NCE, cuerpo({ observacion: "Nota" }, "clave-nce-e1-0009"));

  await crearNotaCredito(snap.db, EMP_A, U_NCE, cuerpo({ observacion: "Nota" }, "clave-nce-e1-0009"), prepR);
  igual("E1-42 si el documento ya existía (snapshot reutilizado) no se envía observación original: no se fabrica procedencia", snap.parametros.filter((q) => /fe_documento_crear_nce/.test(q.sql)).map((q) => [/_obs/.test(q.sql), q.p.length]), [[false, 11]]);

  // R03-F002: la clave reutilizada con observación distinta es conflicto 409; el reenvío legítimo reutiliza documento y número
  const guardadaEj = "Nota\n" + M + "\nVendedor: Luis Gómez";
  const rep = (o: { migracion: boolean; original?: string; guardada: string | null }, obs: string) => repeticion(base({ migracion: o.migracion, documento: { observacion: o.guardada }, originales: o.original === undefined ? undefined : new Map([[clave(NCE_RECH), o.original]]) }).db, EMP_A, U_NCE, cuerpo({ observacion: obs }, "clave-nce-e1-0004"));
  const vacioGuardado = M + "\nVendedor: Luis Gómez";

  igual("E1-37 (NEX-071, original registrada) reenvío legítimo: misma observación → mismo documento y número (aunque el vendedor se haya renombrado); original vacía → vacía", [(await rep({ migracion: true, original: "Nota", guardada: guardadaEj }, "Nota"))?.numero, (await rep({ migracion: true, original: "", guardada: vacioGuardado }, ""))?.numero, (await rep({ migracion: true, original: "  Nota \n", guardada: guardadaEj }, "  Nota \n"))?.numero], ["0000009", "0000009", "0000009"]);
  igual("E1-43 (R03-F002) observación distinta con la misma clave → 409: el dInfAdic guardado enviado como observación, original vacía vs. dInfAdic, \"Nota\" vs. \"Nota + bloque\", u otra observación", [
    await estado(rep({ migracion: true, original: "", guardada: vacioGuardado }, vacioGuardado)),
    await estado(rep({ migracion: true, original: "Nota", guardada: guardadaEj }, guardadaEj)),
    await estado(rep({ migracion: true, original: "Nota", guardada: guardadaEj }, "Otra observación")),
    await estado(rep({ migracion: true, original: "Nota", guardada: guardadaEj }, "")),
  ].map((x) => x.slice(0, 4)), ["409:", "409:", "409:", "409:"]);
  igual("E1-44 (sin registro: NCE histórica o migración no aplicada) texto guardado idéntico al enviado y sin bloque → reutiliza; dInfAdic compuesto guardado con cualquier observación (incluida la igual al guardado o vacía) → 409 seguro", [
    (await rep({ migracion: true, guardada: "Nota" }, "Nota"))?.numero,
    (await rep({ migracion: false, guardada: null }, ""))?.numero,
    (await estado(rep({ migracion: false, guardada: guardadaEj }, "Nota"))).slice(0, 4),
    (await estado(rep({ migracion: false, guardada: guardadaEj }, guardadaEj))).slice(0, 4),
    (await estado(rep({ migracion: true, guardada: vacioGuardado }, vacioGuardado))).slice(0, 4),
    (await estado(rep({ migracion: true, guardada: "Nota" }, "Otra"))).slice(0, 4),
  ], ["0000009", "0000009", "409:", "409:", "409:", "409:"]);

  // ── PRO-302: identidad de la observación CRUDA ────────────────────────────────────────────────
  const crudo = (original: string, enviada: string) => estado(rep({ migracion: true, original, guardada: M + "\nVendedor: Luis Gómez" }, enviada));

  igual("E1-48 (PRO-302) con la misma clave: \" Nota \" ≠ \"Nota\", vacío ≠ solo espacios, saltos de línea en los extremos ≠ sin ellos (409); la cadena idéntica byte a byte se reutiliza, también con saltos de línea", [
    (await crudo(" Nota ", "Nota")).slice(0, 4),
    (await crudo("Nota", " Nota ")).slice(0, 4),
    (await crudo("", "   ")).slice(0, 4),
    (await crudo("   ", "")).slice(0, 4),
    (await crudo("Nota", "\nNota")).slice(0, 4),
    (await crudo("Nota\n\n", "Nota")).slice(0, 4),
    (await rep({ migracion: true, original: "\n Nota con\nsalto \n", guardada: M }, "\n Nota con\nsalto \n"))?.numero,
    (await rep({ migracion: true, original: "   ", guardada: M }, "   "))?.numero,
  ], ["409:", "409:", "409:", "409:", "409:", "409:", "0000009", "0000009"]);

  // el payload sigue con la presentación fiscal ya definida (recortada) y la huella no cambia por los espacios cruda→compuesto
  const prepCrudaA = await prepararNce(b.db, EMP_A, U_NCE, cuerpo({ observacion: "\n Nota \n" }, "clave-nce-e1-0010"));
  const prepCrudaB = await prepararNce(b.db, EMP_A, U_NCE, cuerpo({ observacion: "Nota" }, "clave-nce-e1-0010"));
  const largaCruda = await estado(prepararNce(b.db, EMP_A, U_NCE, cuerpo({ observacion: " ".repeat(5001) }, "clave-nce-e1-0011")));
  const cruda5000 = await prepararNce(b.db, EMP_A, U_NCE, cuerpo({ observacion: " ".repeat(5000) }, "clave-nce-e1-0012"));

  igual("E1-49 (PRO-302) la presentación fiscal no cambia (dInfAdic con la observación recortada y la misma huella que antes); la entrada cruda de 5001 caracteres se rechaza antes de reservar numeración (422) y la de 5000 se acepta", [dInf(prepCrudaA), prepCrudaA.resumen.infoAdicionalHuella === prepCrudaB.resumen.infoAdicionalHuella, largaCruda.startsWith("422:"), dInf(cruda5000)], ["Nota\n" + M + "\nVendedor: Luis Gómez", true, true, M + "\nVendedor: Luis Gómez"]);

  // ── PRO-301: el servicio DESCUENTO participa en la identidad de la operación ──────────────────
  const servicio = (monto: string, motivo = 3) => cuerpo({ motivo, servicio: { monto }, lineas: [], observacion: "Nota" }, "clave-nce-e1-0004");
  const repS = (o: { habilitado: boolean; monto?: string; lineasGuardadas?: Array<{ linea: number; cantidad: string; monto: string }>; motivo?: number }, c: ReturnType<typeof servicio>) => repeticion(base({ migracion: true, documento: { observacion: "Nota\n" + M + "\nVendedor: Luis Gómez", motivo: c.motivo }, originales: new Map([[clave(NCE_RECH), "Nota"]]), lineasGuardadas: o.lineasGuardadas ?? [], descuentos: { habilitado: o.habilitado, montos: o.monto === undefined ? undefined : new Map([[clave(NCE_RECH), o.monto]]) } }).db, EMP_A, U_NCE, c);

  igual("E1-50 (PRO-301) NCE con servicio DESCUENTO de 30.000: el reenvío con 30.000 (también con otra escritura decimal) reutiliza documento y número; con 50.000 → 409; Bonificación (motivo 4) con monto modificado → 409", [
    (await repS({ habilitado: true, monto: "30000.00000000" }, servicio("30000")))?.numero,
    (await repS({ habilitado: true, monto: "30000.00000000" }, servicio("30000,00")))?.numero,
    (await estado(repS({ habilitado: true, monto: "30000.00000000" }, servicio("50000")))).slice(0, 4),
    (await estado(repS({ habilitado: true, monto: "30000.00000000" }, servicio("50000", 4)))).slice(0, 4),
    (await estado(repS({ habilitado: true, monto: "30000.00000000" }, servicio("abc")))).slice(0, 4),
  ], ["0000009", "0000009", "409:", "409:", "409:"]);
  igual("E1-51 (PRO-301) una NCE por líneas no se confunde con una de servicio ni al revés: pedir servicio sobre una NCE por líneas → 409; pedir líneas sobre una NCE de servicio → 409; con NEX-070 ausente el servicio solicitado con una clave ya usada → 409 y las NCE por líneas siguen reutilizándose", [
    (await estado(repS({ habilitado: true, lineasGuardadas: [{ linea: 1, cantidad: "0", monto: "20000" }] }, servicio("30000", 3)))).slice(0, 4),
    (await estado(repS({ habilitado: true, monto: "30000.00000000" }, cuerpo({ motivo: 3, observacion: "Nota", lineas: [{ linea: 1, monto: "20000" }] }, "clave-nce-e1-0004")))).slice(0, 4),
    (await estado(repS({ habilitado: false }, servicio("30000")))).slice(0, 4),
    (await repS({ habilitado: false, lineasGuardadas: [{ linea: 1, cantidad: "0", monto: "20000" }] }, cuerpo({ motivo: 3, observacion: "Nota", lineas: [{ linea: 1, monto: "20000" }] }, "clave-nce-e1-0004")))?.numero,
    (await repS({ habilitado: true, lineasGuardadas: [{ linea: 1, cantidad: "0", monto: "20000" }] }, cuerpo({ motivo: 3, observacion: "Nota", lineas: [{ linea: 1, monto: "20000" }] }, "clave-nce-e1-0004")))?.numero,
  ], ["409:", "409:", "409:", "0000009", "0000009"]);
  igual("E1-52 (PRO-301) aislamiento: el monto de servicio de OTRA empresa no valida la repetición (se busca por empresa y NCE de la sesión)", (await estado(repeticion(base({ migracion: true, documento: { observacion: "Nota" }, originales: new Map([[clave(NCE_RECH), "Nota"]]), lineasGuardadas: [], descuentos: { habilitado: true, montos: new Map([[EMP_B + "|" + NCE_RECH, "30000.00000000"]]) } }).db, EMP_A, U_NCE, servicio("30000")))).slice(0, 4), "409:");

  // ── aislamiento entre empresas ────────────────────────────────────────────────────────────────
  const aj = base();
  const deB = await prepararNce(aj.db, EMP_B, U_B, cuerpo()).then((x) => dInf(x), () => "ERR");
  const cruce = await prepararNce(aj.db, EMP_B, U_NCE, cuerpo()).then((x) => dInf(x), () => "ERR");

  igual("E1-31 sin fuga entre tenants: la cuenta se busca por empresa y usuario de la sesión; el usuario de la empresa A no resuelve nombre en B (no se inventa vendedor) y el nombre de B solo aparece para B", [deB, cruce, (cruce ?? "").includes("Luis")], [M + "\nVendedor: Zoe Ajena", null, false]);

  // ── contrato de NEX-071 (SQL versionado, nunca ejecutado aquí) ────────────────────────────────
  {
    const leerSql = (r: string) => readFileSync(join(process.cwd(), "documentacao/banco/nexit/v1", r), "utf8");
    const sql = leerSql("migraciones/NEX-071-facturacion-nce-observacion-original.sql");
    const rev = leerSql("scripts/reversion-NEX-071.sql");
    const ver = leerSql("scripts/verificar-NEX-071.sql");
    const pre = leerSql("scripts/preflight-NEX-071.sql");
    const doc = leerSql("docs/PROCEDIMIENTO-NEX-071.md");
    const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

    cierto("E1-45 NEX-071: tabla de solo altas, anclada por (empresa, nce) a nce_origen, observación acotada a 5000, sin tocar nce_origen ni fe_documento_crear_nce", /CREATE TABLE public\.nce_observaciones_originales/.test(sql) && /FOREIGN KEY \(empresa_id, nce_id\) REFERENCES public\.nce_origen \(empresa_id, nce_id\)/.test(sql) && /char_length\(observacion\) <= 5000/.test(sql) && /nce_observaciones_originales_inmutable_fila_trg BEFORE UPDATE OR DELETE/.test(sql) && /inmutable_truncate_trg BEFORE TRUNCATE/.test(sql) && !/CREATE OR REPLACE FUNCTION public\.fe_documento_crear_nce\(/.test(sql) && !/ALTER TABLE/.test(sql) && !/UPDATE public\.nce_origen/.test(sql));
    cierto("E1-46 NEX-071: el registro se inserta en la misma transacción que la creación y SOLO si la NCE es nueva; la función delega en fe_documento_crear_nce (permiso, idempotencia, numeración) y valida la cadena cruda (obligatoria, hasta 5000)", /FROM public\.fe_documento_crear_nce\(p_empresa, p_usuario, p_sucursal, p_punto, p_clave, p_fe, p_motivo, p_lineas, p_moneda, p_total, p_payload\)/.test(sql) && /IF NOT v_reutilizado THEN\s+INSERT INTO public\.nce_observaciones_originales \(empresa_id, nce_id, observacion\) VALUES \(p_empresa, v_id, p_observacion_original\)/.test(sql) && !/left\(v_info/.test(sql) && /p_observacion_original IS NULL OR char_length\(p_observacion_original\) > 5000/.test(sql) && /SECURITY DEFINER SET search_path = public, pg_temp/.test(sql));
    cierto("E1-47 NEX-071: la aplicación solo LEE la tabla y ejecuta la función nueva; PUBLIC sin acceso; reversión que se niega si hay registros; preflight y verificación de solo lectura; procedimiento versionado y NO aplicado", /GRANT SELECT ON public\.nce_observaciones_originales TO nexit_runtime/.test(sql) && /REVOKE ALL ON FUNCTION public\.fe_documento_crear_nce_obs\([^)]*\) FROM PUBLIC/.test(sql) && !/GRANT (INSERT|UPDATE|DELETE)/.test(sql) && /REVERSIÓN ABORTADA/.test(rev) && /DROP TABLE public\.nce_observaciones_originales/.test(rev) && !/DROP FUNCTION IF EXISTS public\.fe_documento_crear_nce\(/.test(rev) && /BEGIN READ ONLY/.test(ver) && /BEGIN READ ONLY/.test(pre) && /NO aplicada/.test(doc) && /sin la migración/i.test(doc));
  }

  return fallos;
}
