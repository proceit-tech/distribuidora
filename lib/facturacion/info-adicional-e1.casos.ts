/**
 * E1 (PRO-93 / PRO-94) — J003 `dInfAdic` de la NCE y composición pura. Lógica REAL del servidor (prepararNce, propuestaCorreccion y las funciones de composición) con una base simulada que responde las
 * consultas que el código emite; la parte FE se prueba en entrega-e04.casos (E1-01…E1-11). Sin PostgreSQL ni gateway.
 */
import { contador } from "@/lib/clientes/contador-casos";
import { componerInfoAdicional, lineaEntrega, lineaVendedor, LIMITE_INFO_ADICIONAL, separarObservacion } from "@/lib/facturacion/info-adicional";
import { leerCuerpoNce, prepararNce, propuestaCorreccion } from "@/lib/facturacion/nce";
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
  igual("E1-20 líneas: «Dirección de entrega: sede — dirección» y «Vendedor: nombre apellido» (espacios y controles limpiados; sin datos → null)", [lineaEntrega({ nombre: "SUC ESPAÑA", direccion: "AVDA ESPAÑA C/ DR BESTARD, ASUNCIÓN" }), lineaEntrega(null), lineaEntrega({ nombre: " ", direccion: "" }), lineaVendedor("Juan", "Pérez"), lineaVendedor(" Juan ", null), lineaVendedor("", " "), lineaVendedor(null, null)], ["Dirección de entrega: SUC ESPAÑA — AVDA ESPAÑA C/ DR BESTARD, ASUNCIÓN", null, null, "Vendedor: Juan Pérez", "Vendedor: Juan", null, null]);
  igual("E1-21 composición estable (observaciones → entrega → vendedor), sin duplicar una línea ya presente y vacía si no hay nada", [componerInfoAdicional({ observaciones: "Obs", entrega: "Dirección de entrega: X", vendedor: "Vendedor: Y" }), componerInfoAdicional({ observaciones: "Obs\nVendedor: Y", vendedor: "Vendedor: Y" }), componerInfoAdicional({ observaciones: "  ", entrega: null, vendedor: null }), componerInfoAdicional({ observaciones: "", vendedor: "Vendedor: Y" })], ["Obs\nDirección de entrega: X\nVendedor: Y", "Obs\nVendedor: Y", "", "Vendedor: Y"]);
  igual("E1-22 separarObservacion quita solo las líneas automáticas del FINAL (corrección de NCE rechazada sin acumular vendedores) y respeta el resto", [separarObservacion("Obs propia\nVendedor: Ana López"), separarObservacion("L1\nVendedor: algo\nL3"), separarObservacion("Vendedor: Ana López"), separarObservacion("Sin automáticas"), separarObservacion("")], ["Obs propia", "L1\nVendedor: algo\nL3", "", "Sin automáticas", ""]);

  // ── NCE emitida por el usuario B (distinto del que emitió la FE) ──────────────────────────────
  const b = base();
  const n1 = await prepararNce(b.db, EMP_A, U_NCE, cuerpo());
  const n2 = await prepararNce(b.db, EMP_A, U_NCE, cuerpo({ observacion: "Devolución por rotura\nCaja 3" }));
  const n3 = await prepararNce(b.db, EMP_A, U_FE, cuerpo());

  igual("E1-23 la NCE lleva «Vendedor:» del usuario que EMITE la nota (Luis Gómez), no el de la factura original (Ana López)", [dInf(n1), dInf(n1)?.includes("Ana")], ["Vendedor: Luis Gómez", false]);
  igual("E1-24 las observaciones propias de la NCE se preservan íntegras (con saltos de línea) y el vendedor se añade al final", dInf(n2)?.split("\n"), ["Devolución por rotura", "Caja 3", "Vendedor: Luis Gómez"]);
  igual("E1-25 la NCE emitida por el usuario de la factura original lleva su propio nombre (cada NCE registra a su emisor)", dInf(n3), "Vendedor: Ana López");
  igual("E1-26 el documento asociado y su CDC no cambian y el JSON usa exactamente dInfAdic", [(n2.payload.DocumentosAsociados as Array<{ dCdCDERef: string }>)[0].dCdCDERef, n2.payload.iTiDE, Object.keys(n2.payload).filter((k) => /inf.*adic/i.test(k))], [CDC, 5, ["dInfAdic"]]);

  // ── límite de 5000 caracteres sobre el texto final, antes de reservar numeración ──────────────
  const limite = 5000 - "\nVendedor: Luis Gómez".length;
  const justo = await prepararNce(b.db, EMP_A, U_NCE, cuerpo({ observacion: "k".repeat(limite) }));
  const exceso = await estado(prepararNce(b.db, EMP_A, U_NCE, cuerpo({ observacion: "k".repeat(limite + 1) })));

  igual("E1-27 el texto final de exactamente 5000 caracteres se acepta completo; un carácter más se rechaza con error explícito (422) sin truncar", [dInf(justo)?.length, exceso.startsWith("422:La información adicional"), LIMITE_INFO_ADICIONAL], [5000, true, 5000]);

  // ── reintento idempotente: snapshot persistido ────────────────────────────────────────────────
  const reintento = base({ persistida: new Map([["clave-nce-e1-0001", "Obs original\nVendedor: Luis Gómez"]]) });

  reintento.cuentas.set(EMP_A + "|" + U_NCE, { nombre: "Nombre", apellido: "Cambiado" });

  const rn = await prepararNce(reintento.db, EMP_A, U_NCE, cuerpo({ observacion: "Obs original" }));

  igual("E1-28 reenvío de una NCE ya creada con esa clave: se reutiliza el dInfAdic PERSISTIDO (no se recompone con el nombre nuevo ni se duplica el vendedor)", [dInf(rn), (dInf(rn) ?? "").split("\n").filter((l) => l.startsWith("Vendedor:")).length], ["Obs original\nVendedor: Luis Gómez", 1]);

  // ── corrección de NCE rechazada ───────────────────────────────────────────────────────────────
  const corr = base({ rechazada: { observacion: "Obs de la rechazada\nVendedor: Ana López" } });
  const prop = (await propuestaCorreccion(corr.db, EMP_A, U_NCE, NCE_RECH)) as { observacion: string; motivo: number; lineas: Array<{ linea: number }> };

  igual("E1-29 la corrección precarga solo las observaciones propias (sin el «Vendedor:» de la nota rechazada) y conserva motivo y líneas", [prop.observacion, prop.motivo, prop.lineas.length], ["Obs de la rechazada", 2, 1]);

  const reemitida = await prepararNce(corr.db, EMP_A, U_NCE, cuerpo({ observacion: prop.observacion }, "clave-nce-e1-0002"));

  igual("E1-30 al emitir la corrección, el vendedor es quien la emite ahora, aparece UNA sola vez y la observación no se pierde", [dInf(reemitida)?.split("\n"), (dInf(reemitida)?.match(/Vendedor:/g) ?? []).length], [["Obs de la rechazada", "Vendedor: Luis Gómez"], 1]);

  // ── aislamiento entre empresas ────────────────────────────────────────────────────────────────
  const aj = base();
  const deB = await prepararNce(aj.db, EMP_B, U_B, cuerpo()).then((x) => dInf(x), () => "ERR");
  const cruce = await prepararNce(aj.db, EMP_B, U_NCE, cuerpo()).then((x) => dInf(x), () => "ERR");

  igual("E1-31 sin fuga entre tenants: la cuenta se busca por empresa y usuario de la sesión; el usuario de la empresa A no resuelve nombre en B (no se inventa vendedor) y el nombre de B solo aparece para B", [deB, cruce, (cruce ?? "").includes("Luis")], ["Vendedor: Zoe Ajena", null, false]);

  return fallos;
}
