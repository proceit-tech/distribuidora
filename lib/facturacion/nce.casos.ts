/**
 * PRO-94 — Nota de Crédito Electrónica V1. Sin red y sin PostgreSQL: la migración NEX-062 y sus funciones NO se ejecutaron aquí (las valida el responsable sobre PostgreSQL). Se verifica (a) la lógica
 * pura (saldos, motivos, cálculo exacto, payload) y (b) el texto versionado de SQL, rutas, pantalla, menú y planificador. No prueba comportamiento real de PostgreSQL, del gateway ni de SIFEN.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { UMBRAL_REVISION_HORAS } from "@/lib/facturacion/estados";
import { leerCuerpoNce } from "@/lib/facturacion/nce";
import { calcularNce, construirPayloadNCE, esMotivoNce, lineasParaSql, saldoDe, validarEntradaNce, type EntradaNce, type LineaOriginal } from "@/lib/facturacion/payload-nce";
import { CADENCIA_SEGUNDOS, ejecutarLote, segundosHastaProxima } from "@/lib/facturacion/consulta-automatica";
import { textoDec } from "@/lib/facturacion/calculo";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");
const sinComentarios = (t: string) => t.replace(/--.*$/gm, "");

const L1: LineaOriginal = { linea: 1, codigoInterno: "P1", gtin: null, descripcion: "Gaseosa 2L", unidadSifen: 77, cantidad: "2", precio: "50000", total: "100000", afectacion: 1, tasa: 10, proporcion: "100" };
const L2: LineaOriginal = { linea: 2, codigoInterno: "P2", gtin: null, descripcion: "Agua", unidadSifen: 77, cantidad: "10", precio: "5000", total: "50000", afectacion: 3, tasa: 0, proporcion: "0" };
const CDC = "01800000012001001000000112026101612345678901";
const SIN = { cantidad: "0", monto: "0" };

const entrada = (motivo: number, lineas: EntradaNce["lineas"], extra: Partial<EntradaNce> = {}): EntradaNce => ({ motivo, moneda: "PYG", cambio: null, lineas, observacion: "", ...extra });

export async function verificarCasosNce(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── 1. Motivos y saldos ─────────────────────────────────────────────────────────────────────────
  cierto("solo los motivos 2, 3, 4 y 8 son válidos", [2, 3, 4, 8].every(esMotivoNce) && ![1, 5, 6, 7, 9, 0, "2", null].some(esMotivoNce));
  igual("saldo inicial = cantidad y total de la línea", [textoDec(saldoDe(L1, SIN).cantidad), textoDec(saldoDe(L1, SIN).monto)], ["2", "100000"]);
  igual("saldo descuenta lo acreditado por NCE aprobadas", [textoDec(saldoDe(L1, { cantidad: "1", monto: "50000" }).cantidad), textoDec(saldoDe(L1, { cantidad: "1", monto: "50000" }).monto)], ["1", "50000"]);
  igual("el saldo nunca es negativo", textoDec(saldoDe(L1, { cantidad: "5", monto: "999999" }).monto), "0");

  // ── 2. Devolución: cantidad × precio original ──────────────────────────────────────────────────
  const dev = entrada(2, [{ original: L1, acreditado: SIN, cantidad: "1" }]);
  igual("devolución de 1 de 2 válida", validarEntradaNce(dev), []);
  igual("devolución: total = cantidad × precio original", calcularNce(dev).totales.total, "50000");
  igual("devolución: IVA 10% incluido en el precio", calcularNce(dev).totales.iva10, "4545.45454546");
  igual("devolución parcial acumulada: 1 ya acreditada + 1 nueva es válida", validarEntradaNce(entrada(2, [{ original: L1, acreditado: { cantidad: "1", monto: "50000" }, cantidad: "1" }])), []);
  cierto("devolución que supera la cantidad disponible se rechaza", validarEntradaNce(entrada(2, [{ original: L1, acreditado: { cantidad: "1", monto: "50000" }, cantidad: "2" }])).some((m) => /supera la disponible/.test(m)));
  cierto("devolución con cantidad cero o vacía se rechaza", validarEntradaNce(entrada(2, [{ original: L1, acreditado: SIN, cantidad: "0" }])).length > 0 && validarEntradaNce(entrada(2, [{ original: L1, acreditado: SIN }])).length > 0);
  cierto("línea agotada no admite devolución", validarEntradaNce(entrada(2, [{ original: L1, acreditado: { cantidad: "2", monto: "100000" }, cantidad: "1" }])).some((m) => /sin saldo|no tiene saldo/.test(m)));
  igual("devolución: lineasParaSql lleva la cantidad", lineasParaSql(dev), [{ linea: 1, cantidad: "1", monto: "50000" }]);

  // ── 3. Descuento / Bonificación / Ajuste de precio: monto por línea ───────────────────────────────
  for (const m of [3, 4, 8]) {
    const e = entrada(m, [{ original: L1, acreditado: SIN, monto: "33000" }]);

    igual(`motivo ${m}: monto válido`, validarEntradaNce(e), []);
    igual(`motivo ${m}: total = monto acreditado exacto (no se multiplica por la cantidad de la factura)`, calcularNce(e).totales.total, "33000");
    igual(`motivo ${m}: IVA 10% incluido`, calcularNce(e).totales.iva10, "3000");
    igual(`motivo ${m}: lineasParaSql cantidad 0 y monto`, lineasParaSql(e), [{ linea: 1, cantidad: "0", monto: "33000" }]);
    cierto(`motivo ${m}: monto mayor al saldo se rechaza`, validarEntradaNce(entrada(m, [{ original: L1, acreditado: { cantidad: "0", monto: "70000" }, monto: "30001" }])).some((x) => /supera el saldo/.test(x)));
    cierto(`motivo ${m}: monto cero, vacío o negativo se rechaza`, ["0", "", "-5"].every((v) => validarEntradaNce(entrada(m, [{ original: L1, acreditado: SIN, monto: v }])).length > 0));
  }
  cierto("guaraníes: no admite decimales en el monto", validarEntradaNce(entrada(3, [{ original: L1, acreditado: SIN, monto: "1000.5" }])).length > 0);
  igual("exenta: el crédito no genera IVA", calcularNce(entrada(3, [{ original: L2, acreditado: SIN, monto: "5000" }])).totales.totalIva, "0");
  igual("varias líneas: el total es la suma", calcularNce(entrada(3, [{ original: L1, acreditado: SIN, monto: "33000" }, { original: L2, acreditado: SIN, monto: "5000" }])).totales.total, "38000");
  cierto("línea repetida se rechaza", validarEntradaNce(entrada(3, [{ original: L1, acreditado: SIN, monto: "1000" }, { original: L1, acreditado: SIN, monto: "1000" }])).some((m) => /repetida/.test(m)));
  cierto("sin líneas, motivo inválido y observación excesiva o con control se rechazan", validarEntradaNce(entrada(3, [])).length > 0 && validarEntradaNce(entrada(9, [{ original: L1, acreditado: SIN, monto: "1000" }])).length > 0
    && validarEntradaNce(entrada(3, [{ original: L1, acreditado: SIN, monto: "1000" }], { observacion: "x".repeat(5001) })).length > 0 && validarEntradaNce(entrada(3, [{ original: L1, acreditado: SIN, monto: "1000" }], { observacion: "a\u0001b" })).length > 0);
  cierto("PYG con tipo de cambio y moneda extranjera sin cambio se rechazan", validarEntradaNce(entrada(3, [{ original: L1, acreditado: SIN, monto: "1000" }], { cambio: "7300" })).length > 0 && validarEntradaNce(entrada(3, [{ original: L1, acreditado: SIN, monto: "10" }], { moneda: "USD", cambio: null })).length > 0);

  // ── 4. Payload NCE ─────────────────────────────────────────────────────────────────────────────
  const rec = { dNomRec: "Cliente SA", dNumIDRec: "80000001", iNatRec: 1 };
  const p = construirPayloadNCE(entrada(3, [{ original: L1, acreditado: SIN, monto: "33000" }], { observacion: " Nota " }), rec, CDC) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  igual("payload: iTiDE 5, iMotEmi y asociación al CDC", [p.iTiDE, p.iMotEmi, p.DocumentosAsociados], [5, 3, [{ iTipDocAso: 1, dCdCDERef: CDC }]]);
  igual("payload: observación en dInfAdic recortada; vacía ⇒ null", [p.dInfAdic, (construirPayloadNCE(entrada(3, [{ original: L1, acreditado: SIN, monto: "1000" }]), rec, CDC) as Record<string, unknown>).dInfAdic], ["Nota", null]);
  igual("payload: ítem con cantidad 1 y precio = monto, datos fiscales de la línea original", [p.Detalles[0].dCantProSer, p.Detalles[0].dPUniProSer, p.Detalles[0].dTotOpeItem, p.Detalles[0].iAfecIVA, p.Detalles[0].dTasaIVA, p.Detalles[0].dCodInt], [1, 33000, 33000, 1, 10, "P1"]);
  igual("payload: total general y moneda", [p.Subtotales[0].dTotGralOpe, p.cMoneOpe, p.dTiCam], [33000, "PYG", null]);
  igual("payload: receptor heredado de la factura original", [p.dNomRec, p.dNumIDRec], ["Cliente SA", "80000001"]);
  cierto("payload no copia condición, pagos ni crédito de la FE", !("gCamCond" in p) && !("Pagos" in p) && !("iCondOpe" in p));
  cierto("payload exige CDC de 44 dígitos y entrada válida", (() => { try { construirPayloadNCE(entrada(3, [{ original: L1, acreditado: SIN, monto: "1000" }]), rec, "123"); return false; } catch { return true; } })() && (() => { try { construirPayloadNCE(entrada(3, []), rec, CDC); return false; } catch { return true; } })());
  const usd = construirPayloadNCE(entrada(3, [{ original: { ...L1, precio: "10", total: "20" }, acreditado: SIN, monto: "5" }], { moneda: "USD", cambio: "7300" }), rec, CDC) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  igual("moneda extranjera: copia el tipo de cambio original y calcula el equivalente en guaraníes", [usd.cMoneOpe, usd.dTiCam, usd.Subtotales[0].dTotalGs], ["USD", 7300, 36500]);

  // ── 5. Cuerpo de la API ────────────────────────────────────────────────────────────────────────
  const uuid = "11111111-1111-4111-8111-111111111111";
  const base = { facturaId: uuid, motivo: 3, sucursalId: uuid, puntoId: uuid, observacion: "", claveIdempotencia: "nce-clave-123", lineas: [{ linea: 1, monto: "33000" }] };

  cierto("cuerpo válido se acepta", typeof leerCuerpoNce(base) === "object");
  cierto("cuerpo inválido: factura, motivo, punto, clave, líneas", [{ ...base, facturaId: "x" }, { ...base, motivo: 5 }, { ...base, puntoId: "x" }, { ...base, claveIdempotencia: "corta" }, { ...base, lineas: [] }, { ...base, lineas: [{ linea: 0, monto: "1" }] }, { ...base, lineas: [{ linea: 1, monto: 5 }] }, { ...base, observacion: 7 }].every((c) => typeof leerCuerpoNce(c as Record<string, unknown>) === "string"));
  cierto("el cuerpo ignora empresa/usuario enviados por el cliente (no existen en el tipo)", (() => { const r = leerCuerpoNce({ ...base, empresaId: "otra", usuarioId: "otro" }); return typeof r === "object" && !("empresaId" in r) && !("usuarioId" in r); })());

  // ── 6. SQL NEX-062 ─────────────────────────────────────────────────────────────────────────────
  const mig = leer("documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql");
  const sql = sinComentarios(mig);
  const rev = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-062.sql");
  const crear = sql.slice(sql.indexOf("FUNCTION public.fe_documento_crear_nce"), sql.indexOf("FUNCTION public.fe_documento_iniciar_envio"));

  cierto("tablas nce_origen y nce_lineas, inmutables (solo altas) y con trigger de validación", /CREATE TABLE public\.nce_origen/.test(sql) && /CREATE TABLE public\.nce_lineas/.test(sql) && /nce_origen_inmutable_fila_trg/.test(sql) && /nce_lineas_inmutable_truncate_trg/.test(sql) && /nce_origen_valida_trg/.test(sql));
  cierto("motivos restringidos a 2, 3, 4 y 8 en la base", /motivo[^,]*IN \(2, 3, 4, 8\)|motivo (?:integer )?NOT NULL CHECK \(motivo IN \(2, 3, 4, 8\)\)/.test(sql));
  cierto("crear NCE: serializa por la fila de la FE (FOR UPDATE), exige permiso CREAR y alcance de sucursal, e idempotencia por entrada_hash", /FOR UPDATE/.test(crear) && /CREAR/.test(crear) && /sucursal_en_alcance|usuario_tiene_permiso/.test(crear) && /entrada_hash/.test(crear));
  cierto("crear NCE: bloqueo por NCE pendiente/indeterminada, motivo fijado por la primera aprobada y control de saldo", /fe_nce_clasificar/.test(crear) && /PENDIENTE|pendiente/.test(crear) && /saldo|SALDO/.test(crear));
  cierto("crear NCE: reserva la secuencia NCE del punto (no la FE) y la bloquea en orden punto→secuencia", /fe_punto_secuencias/.test(crear) && /'NCE'/.test(crear) && /FOR SHARE/.test(crear) && crear.indexOf("FOR SHARE") < crear.indexOf("tipo_documento = 'NCE' FOR UPDATE"));
  cierto("la clasificación distingue consume saldo (aprobada), libre (rechazada/cancelada/inutilizada) y bloquea (pendiente/indeterminada)", /fe_nce_clasificar/.test(sql) && /'CONSUME'/.test(sql) && /'LIBRE'/.test(sql) && /'BLOQUEA'/.test(sql) && /'RECHAZADO', 'CANCELADO'/.test(sql));
  cierto("reservar consultas usa lease y SKIP LOCKED; programar libera el lease", /SKIP LOCKED/.test(sql) && /fe_consulta_reservar/.test(sql) && /fe_consulta_programar/.test(sql));
  cierto("configurar secuencia NCE: permiso PUNTOS, confirmación explícita y registro en el log", /fe_punto_secuencia_configurar/.test(sql) && /'FACTURACION_ELECTRONICA', 'PUNTOS'/.test(sql) && /p_confirmado/.test(sql) && /'SECUENCIA'/.test(sql));
  cierto("funciones sensibles revocadas a PUBLIC y concedidas por helper; sin DROP de datos", /REVOKE ALL ON FUNCTION public\.fe_documento_crear_nce/.test(sql) && /nex_aplicar_grants_facturacion_nce/.test(sql) && !/DROP TABLE|TRUNCATE (?!ON)|DELETE FROM/i.test(sql));
  cierto("migración incremental: estado «NO aplicada» y requiere NEX-060/061", /NO aplicada/.test(mig) && /NEX-06[01]/.test(mig));
  cierto("reversión: aborta si existen NCE o acciones SECUENCIA y restaura iniciar_envio", /NCE/.test(rev) && /SECUENCIA/.test(rev) && /fe_documento_iniciar_envio/.test(rev) && /RAISE EXCEPTION/.test(rev));

  const t26 = leer("documentacao/banco/nexit/v1/pruebas/T26-nex062-nce.sql");

  cierto("T26 (SQL) versionada y registrada en el runner: secuencia NCE propia, idempotencia, NCE pendiente, motivo fijado, saldo exacto, rechazo libera, aislamiento y lease (NO ejecutada por la IA)", /T25( T26)?; do|T26/.test(leer("documentacao/banco/nexit/v1/scripts/ejecutar-pruebas.sh")) && /T21 T25 T26; do/.test(leer("documentacao/banco/nexit/v1/scripts/ejecutar-pruebas.sh"))
    && ["NEX:SECUENCIA_NO_CONFIGURADA", "NEX:IDEMPOTENCIA_CONFLICTO", "NEX:NCE_PENDIENTE", "NEX:MOTIVO_FIJADO", "NEX:SALDO_MONTO", "fe_consulta_reservar"].every((k) => t26.includes(k)));

  // ── 7. Rutas, pantalla y menú ───────────────────────────────────────────────────────────────────
  const rutas = ["app/api/notas-credito/route.ts", "app/api/notas-credito/previa/route.ts", "app/api/notas-credito/clientes/route.ts", "app/api/notas-credito/facturas/route.ts", "app/api/notas-credito/facturas/[id]/route.ts", "app/api/notas-credito/correccion/[id]/route.ts"];

  cierto("todas las rutas NCE exigen FACTURACION_ELECTRONICA.CREAR y toman empresa/usuario de la sesión", rutas.every((r) => /prepararFacturacion\("CREAR"\)/.test(leer(r)) && /b\.empresaId/.test(leer(r)) && !/searchParams\.get\("empresa/.test(leer(r))));
  cierto("el detalle de factura nunca devuelve el receptor completo (se descarta)", /receptor: _receptor/.test(leer("app/api/notas-credito/facturas/[id]/route.ts")));
  cierto("la configuración de secuencia NCE exige PUNTOS", /prepararFacturacion\("PUNTOS"\)/.test(leer("app/api/facturacion/puntos/[id]/secuencia-nce/route.ts")));
  cierto("layout de /notas-credito protegido con CREAR", /guardPage\("FACTURACION_ELECTRONICA", "CREAR"\)/.test(leer("app/(private)/notas-credito/layout.tsx")));
  const menu = leer("lib/navigation/menu.ts");

  cierto("menú: «Notas de crédito» visible en V1 con permiso CREAR", /href: "\/notas-credito"[\s\S]{0,120}FACTURACION_ELECTRONICA\.CREAR/.test(menu) && /^\s+"\/notas-credito",$/m.test(menu));
  const pagina = leer("app/(private)/notas-credito/page.tsx");

  cierto("pantalla: sin lista ni borrador, sin localStorage ni datos fijos; llama a las APIs reales", !/localStorage|sessionStorage/.test(pagina) && /\/api\/notas-credito\/previa/.test(pagina) && /\/api\/notas-credito"/.test(pagina) && /\/api\/notas-credito\/clientes/.test(pagina));
  cierto("pantalla: cuatro motivos, «NCE pendiente» deshabilitado, modal de revisión y clave de idempotencia", /2: "Devolución", 3: "Descuento", 4: "Bonificación", 8: "Ajuste de precio"/.test(pagina) && /NCE pendiente/.test(pagina) && /disabled=\{f\.ncePendiente/.test(pagina) && /aria-modal="true"/.test(pagina) && /claveIdempotencia/.test(pagina));
  cierto("pantalla: «Corregir y emitir nueva» precarga solo como propuesta (revalida en el servidor)", /corregir/.test(pagina) && /api\/notas-credito\/correccion/.test(pagina));
  const doc = leer("app/(private)/documentos/page.tsx");

  cierto("Documentos: «Requiere revisión», «Corregir y emitir nueva» y sin «Reintentar» para NCE", /Requiere revisión/.test(doc) && /Corregir y emitir nueva/.test(doc) && /d\.tipo !== "NCE" && d\.estadoLocal === "ERROR_ENVIO"/.test(doc));

  // ── 8. Consulta automática en el servidor ─────────────────────────────────────────────────────────
  igual("la cadencia provisional crece y se estabiliza en el último valor", [segundosHastaProxima(0), segundosHastaProxima(2), segundosHastaProxima(99)], [CADENCIA_SEGUNDOS[0], CADENCIA_SEGUNDOS[2], CADENCIA_SEGUNDOS[CADENCIA_SEGUNDOS.length - 1]]);
  cierto("«Requiere revisión» es solo etiqueta con umbral definido", UMBRAL_REVISION_HORAS > 0);
  cierto("instrumentation.ts arranca el planificador solo en el runtime Node", /iniciarPlanificador/.test(leer("instrumentation.ts")) && /nodejs/.test(leer("instrumentation.ts")));

  const llamadas: string[] = [];
  const dbFalsa = {
    query: async (texto: string, _p?: unknown[]) => {
      void _p;
      llamadas.push(texto.includes("fe_consulta_reservar") ? "reservar" : texto.includes("fe_consulta_programar") ? "programar" : "otra");

      if (texto.includes("fe_consulta_reservar")) return { rows: [{ o_empresa: uuid, o_documento: uuid, o_actor: null, o_tipo: "NCE", o_intentos: 0 }] };

      return { rows: [] };
    },
  };
  const lote = await ejecutarLote(dbFalsa as never, { dormir: async () => undefined });

  igual("lote sin usuario autorizado: no consulta, reprograma y cuenta sinActor", [lote.reservados, lote.consultados, lote.sinActor, llamadas], [1, 0, 1, ["reservar", "programar"]]);

  return fallos;
}
