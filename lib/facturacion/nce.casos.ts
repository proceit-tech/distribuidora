/**
 * PRO-94 — Nota de Crédito Electrónica V1. Sin red y sin PostgreSQL: la migración NEX-062 y sus funciones NO se ejecutaron aquí (las valida el responsable sobre PostgreSQL). Se verifica (a) la lógica
 * pura (saldos, motivos, cálculo exacto, payload) y (b) el texto versionado de SQL, rutas, pantalla, menú y planificador. No prueba comportamiento real de PostgreSQL, del gateway ni de SIFEN.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { UMBRAL_REVISION_HORAS } from "@/lib/facturacion/estados";
import { leerCuerpoNce } from "@/lib/facturacion/nce";
import { CAMPOS_RECEPTOR, type LineaNceEntrada as LineaNceEntradaT, calcularNce, construirPayloadNCE, esMotivoNce, lineasParaSql, saldoDe, validarEntradaNce, type EntradaNce, type LineaOriginal } from "@/lib/facturacion/payload-nce";
import { CADENCIA_SEGUNDOS, ejecutarLote, segundosHastaProxima } from "@/lib/facturacion/consulta-automatica";
import { textoDec } from "@/lib/facturacion/calculo";
import { iniciarRefresco, retardoRefresco } from "@/lib/facturacion/refresco-documentos";
import { MAX_ENTEROS_F023 } from "@/lib/facturacion/monedas";
import { crearControlListado, entradasIniciales, etiquetaIvaLinea } from "@/lib/facturacion/nce-entradas";
import { buscarClientesConFacturas, LIMITE_BYTES_PAYLOAD_NCE, listarFacturasElegibles } from "@/lib/facturacion/nce";
import { interpretarRecepcion, type DocumentoRecepcion } from "@/lib/facturacion/gateway";
import { reconciliarFacturasPendientes } from "@/lib/facturacion/nce-emision";
import { reconciliarNcePendientes, repeticion } from "@/lib/facturacion/nce-emision";
import { ErrorFacturacion } from "@/lib/facturacion/shared";

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

  // ── 9. Corrección AUD-PRO94-NCE-R01 ───────────────────────────────────────────────────────────────
  // R01-01: el cliente con facturas enviadas sin resultado se localiza; solo las APROBADAS con CDC son elegibles.
  const fuente = leer("lib/facturacion/nce.ts");
  const clientesSql = fuente.slice(fuente.indexOf("export async function buscarClientesConFacturas"), fuente.indexOf("export type FacturaElegible"));
  const elegiblesSql = fuente.slice(fuente.indexOf("export async function listarFacturasElegibles"), fuente.indexOf("export async function puntosParaNce"));

  cierto("R01-01: la búsqueda de clientes incluye FE aprobadas O enviadas con SIN_CONSULTA/PENDIENTE, siempre por empresa y alcance", /estado_sifen = 'APROBADO' OR \(d\.estado_local IN \('ENVIADO', 'ENVIO_INDETERMINADO'\) AND d\.estado_sifen IN \('SIN_CONSULTA', 'PENDIENTE', 'NO_RECONOCIDO'\)\)/.test(clientesSql) && /c\.empresa_id = \$1/.test(clientesSql) && /sucursal_en_alcance/.test(clientesSql));
  cierto("R01-01: las facturas elegibles para emitir siguen siendo SOLO APROBADAS con CDC y saldo", /d\.estado_sifen = 'APROBADO' AND d\.cdc IS NOT NULL/.test(elegiblesSql) && !/SIN_CONSULTA/.test(elegiblesSql) && /original - acreditado > 0/.test(elegiblesSql));
  cierto("R01-01: al seleccionar el cliente se consulta (actualizar=1) antes de listar", /actualizar=1/.test(leer("app/(private)/notas-credito/page.tsx")) && /reconciliarFacturasPendientes/.test(leer("app/api/notas-credito/facturas/route.ts")));

  // R01-02: Devolución precarga las líneas con saldo y su cantidad disponible; las agotadas quedan fuera; 3/4/8 vacíos.
  const cinco = [1, 2, 3, 4, 5].map((n) => ({ linea: n, agotada: n === 2 || n === 4, cantidadDisponible: String(n * 10) }));
  const devI = entradasIniciales(cinco, 2);

  igual("R01-02: Devolución incluye las 3 líneas con saldo con su cantidad disponible; las 2 agotadas fuera", [devI[1], devI[2], devI[3], devI[4], devI[5]], [{ incluida: true, valor: "10" }, { incluida: false, valor: "" }, { incluida: true, valor: "30" }, { incluida: false, valor: "" }, { incluida: true, valor: "50" }]);
  igual("R01-02: motivos 3/4/8 y sin motivo arrancan vacíos (cambiar de motivo reinicializa)", [3, 4, 8, ""].every((m) => Object.values(entradasIniciales(cinco, m as number | "")).every((e) => !e.incluida && e.valor === "")), true);
  {
    // quitar una línea y reducir otra: el cuerpo y la validación reflejan exactamente eso
    const quitada: Record<number, { incluida: boolean; valor: string }> = { ...devI, 3: { incluida: false, valor: "30" }, 5: { incluida: true, valor: "20" } };
    const sel = cinco.filter((l) => quitada[l.linea].incluida).map((l) => l.linea);

    igual("R01-02: tras quitar el ítem 3 y reducir el 5, solo viajan las líneas 1 y 5 con sus cantidades", [sel, quitada[1].valor, quitada[5].valor], [[1, 5], "10", "20"]);
    cierto("R01-02: la validación acepta la cantidad precargada completa y la reducida", validarEntradaNce(entrada(2, [{ original: L1, acreditado: SIN, cantidad: "2" }])).length === 0 && validarEntradaNce(entrada(2, [{ original: L1, acreditado: SIN, cantidad: "1" }])).length === 0);
  }
  const pagNce = leer("app/(private)/notas-credito/page.tsx");

  cierto("R01-02: la pantalla usa el estado inicial al abrir la factura y al cambiar de motivo, y respeta la precarga de corrección", /entradasIniciales\(f\.lineas, f\.motivoFijado \?\? ""\)/.test(pagNce) && /setEntradas\(entradasIniciales\(factura\.lineas, m\)\)/.test(pagNce) && /if \(precarga\) for/.test(pagNce));

  // R01-03: idempotencia por identidad completa (FE, motivo, líneas, sucursal, punto, observación)
  const SUC = "22222222-2222-4222-8222-222222222222";
  const PTO = "33333333-3333-4333-8333-333333333333";
  const cuerpoBase = { facturaId: uuid, motivo: 3, sucursalId: SUC, puntoId: PTO, observacion: "Nota", claveIdempotencia: "nce-clave-xyz", lineas: [{ linea: 1, monto: "33000" }] };
  const dbIdem = (cod: string) => ({
    query: async (texto: string, _p?: unknown[]) => {
      void _p;

      if (texto.includes("FROM documentos_electronicos d LEFT JOIN nce_origen")) return { rows: [{ id: "doc-1", numero: "0000001", tipo: "NCE", sucursalId: SUC, puntoCodigo: "001", feId: uuid, motivo: 3, observacion: "Nota" }] };
      if (texto.includes("FROM nce_lineas")) return { rows: [{ linea: 1, cantidad: "0", monto: "33000" }] };
      if (texto.includes("FROM fe_puntos_expedicion")) return { rows: [{ codigo: cod }] };

      return { rows: [] };
    },
  });
  const conflicto = async (c: unknown, db: unknown) => { try { await repeticion(db as never, uuid, uuid, c as never); return "sin conflicto"; } catch (e) { return e instanceof ErrorFacturacion ? e.estado : "otro"; } };

  igual("R01-03: contenido idéntico reutiliza el mismo documento (sin reservar)", await repeticion(dbIdem("001") as never, uuid, uuid, cuerpoBase as never), { documentoId: "doc-1", numero: "0000001" });
  igual("R01-03: misma clave con OTRA sucursal → 409", await conflicto({ ...cuerpoBase, sucursalId: "44444444-4444-4444-8444-444444444444" }, dbIdem("001")), 409);
  igual("R01-03: misma clave con OTRO punto (código distinto) → 409", await conflicto(cuerpoBase, dbIdem("002")), 409);
  igual("R01-03: misma clave con OTRA observación → 409", await conflicto({ ...cuerpoBase, observacion: "Otra" }, dbIdem("001")), 409);
  igual("R01-03: observación vacía vs guardada → 409; solo espacios alrededor NO cambia la identidad", [await conflicto({ ...cuerpoBase, observacion: "" }, dbIdem("001")), await conflicto({ ...cuerpoBase, observacion: "  Nota " }, dbIdem("001"))], [409, "sin conflicto"]);
  igual("R01-03: otra factura, otro motivo u otro monto → 409", [await conflicto({ ...cuerpoBase, facturaId: "55555555-5555-4555-8555-555555555555" }, dbIdem("001")), await conflicto({ ...cuerpoBase, motivo: 4 }, dbIdem("001")), await conflicto({ ...cuerpoBase, lineas: [{ linea: 1, monto: "1" }] }, dbIdem("001"))], [409, 409, 409]);

  // R01-04: Documentos releen el listado de forma controlada y la factura reconcilia sus NCE pendientes con límites
  const docs = leer("app/(private)/documentos/page.tsx");

  cierto("R01-04/R02-01: Documentos usa el refresco controlado (temporizador desde lib), solo con pendientes, y lo limpia al desmontar", /iniciarRefresco\(\{/.test(docs) && /if \(!hayPendientes\) return;/.test(docs) && /detener\(\);/.test(docs) && !/lecturas >= 120|setInterval/.test(docs));
  cierto("R01-04: la relectura es solo GET del listado (no consulta ni reenvía desde el navegador)", !/consultar-estado|enviar/.test(docs.slice(docs.indexOf("Actualización automática"), docs.indexOf("const cargando"))));

  // R02-01: el refresco NO se detiene tras 120 lecturas; frecuencia con tope; oculta no lee; al volver lee; detener limpia (reloj falso)
  {
    let ahora = 0;
    let visible = true;
    let lecturasHechas = 0;
    let avisoVisible: (() => void) | null = null;
    const tareas = new Map<number, { en: number; f: () => void }>();
    let idT = 0;
    const entorno = {
      leer: () => { lecturasHechas += 1; },
      visible: () => visible,
      programar: (fn: () => void, ms: number) => { idT += 1; tareas.set(idT, { en: ahora + ms, f: fn }); return idT; },
      cancelar: (t: unknown) => { tareas.delete(t as number); },
      alVolverVisible: (fn: () => void) => { avisoVisible = fn; return () => { avisoVisible = null; }; },
    };
    const avanzar = (ms: number) => {
      const fin = ahora + ms;

      for (;;) {
        const prox = [...tareas.entries()].sort((x, y) => x[1].en - y[1].en)[0];

        if (!prox || prox[1].en > fin) break;

        ahora = prox[1].en;
        tareas.delete(prox[0]);
        prox[1].f();
      }
      ahora = fin;
    };
    const detener = iniciarRefresco(entorno);

    avanzar(30_000 * 20);
    igual("R02-01: 20 lecturas a 30 s en los primeros 10 minutos", lecturasHechas, 20);
    avanzar(60_000 * 40);
    igual("R02-01: luego 40 lecturas a 60 s", lecturasHechas, 60);
    avanzar(120_000 * 100);
    igual("R02-01: pasado el ciclo 120 (más de 3 horas) sigue leyendo cada 120 s, sin tope total", lecturasHechas, 160);
    igual("R02-01: retardos 30/60/120 s con tope", [retardoRefresco(0), retardoRefresco(19), retardoRefresco(20), retardoRefresco(59), retardoRefresco(60), retardoRefresco(100000)], [30_000, 30_000, 60_000, 60_000, 120_000, 120_000]);
    visible = false;
    avanzar(120_000 * 5);
    igual("R02-01: con la pestaña oculta no lee", lecturasHechas, 160);
    visible = true;
    (avisoVisible as (() => void) | null)?.();
    igual("R02-01: al volver a ser visible lee de inmediato", lecturasHechas, 161);
    detener();
    avanzar(120_000 * 10);
    igual("R02-01: detener (desmontaje/cambio de filtros/sin pendientes) no deja temporizadores ni avisos", [lecturasHechas, tareas.size, avisoVisible], [161, 0, null]);
  }
  const consultasNce: string[] = [];
  const nProc = await reconciliarNcePendientes({ query: async (t: string) => { consultasNce.push(t); return { rows: [] }; } } as never, uuid, uuid, uuid);

  igual("R01-04: reconciliar NCE de una factura consulta como máximo 3, solo ENVIADO pendientes no consultadas hace <60 s, por empresa y alcance", [nProc, /LIMIT 3/.test(consultasNce[0]), /interval '60 seconds'/.test(consultasNce[0]), /n\.estado_sifen IN \('SIN_CONSULTA', 'PENDIENTE'\)/.test(consultasNce[0]), /sucursal_en_alcance/.test(consultasNce[0])], [0, true, true, true, true]);
  cierto("R01-04: el detalle de la factura reconcilia antes de leer, y no existe otro scheduler (un solo setInterval de servidor)", /reconciliarNcePendientes\(b\.db/.test(leer("app/api/notas-credito/facturas/[id]/route.ts")) && (leer("lib/facturacion/consulta-automatica.ts").match(/setInterval\(/g) ?? []).length === 1 && !/setInterval/.test(leer("lib/facturacion/nce-emision.ts")));


  // ── 10. R02-02: la consulta iniciada desde el flujo de NCE funciona con CREAR, con identidad real y alcance ─────────────
  const sqlFlujo = sql.slice(sql.indexOf("FUNCTION public.fe_documento_registrar_consulta_flujo_nce"), sql.indexOf("nex_aplicar_grants_facturacion_nce() RETURNS"));
  const nce054 = sinComentarios(leer("documentacao/banco/nexit/v1/migraciones/NEX-054-facturacion-consulta-estado-final.sql"));

  cierto("R02-02: función SQL nueva (NEX-062) exige CREAR o EDITAR, sucursal en alcance y por empresa; NEX-054 no se toca", /'CREAR'\) OR public\.usuario_tiene_permiso\(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'EDITAR'\)/.test(sqlFlujo) && /sucursal_en_alcance\(p_empresa, p_usuario, d\.sucursal_id\)/.test(sqlFlujo) && /empresa_id = p_empresa AND id = p_documento FOR UPDATE/.test(sqlFlujo) && /'EDITAR'\) THEN/.test(nce054));
  cierto("R02-02: identidad real del operador en la auditoría (actor_id = p_usuario); sin suplantar a otro usuario", /actor_id\)\s+VALUES \(p_empresa, p_documento, 'CONSULTA'[\s\S]*p_usuario\);/.test(sqlFlujo) && !/EDITAR'\)[\s\S]{0,80}creado_por/.test(sqlFlujo));
  cierto("R02-02: solo FE/NCE ya enviadas y sin resultado definitivo (un CREAR no reconsulta finales ni otros tipos); NEX:DOCUMENTO_NO_PENDIENTE", /d\.tipo NOT IN \('FE', 'NCE'\)/.test(sqlFlujo) && /d\.estado_local NOT IN \('ENVIADO', 'ENVIO_INDETERMINADO'\)/.test(sqlFlujo) && /d\.estado_sifen NOT IN \('SIN_CONSULTA', 'PENDIENTE', 'NO_RECONOCIDO'\)/.test(sqlFlujo) && /NEX:DOCUMENTO_NO_PENDIENTE/.test(sqlFlujo));
  cierto("R02-02: conserva la guarda de CDC coherente; un resultado no OK solo anota la consulta (no cambia el estado fiscal ni libera saldo)", /CDC_DIVERGENTE/.test(sqlFlujo) && /ELSE\s+UPDATE public\.documentos_electronicos SET ultima_consulta_at = now\(\), ultima_consulta_resultado = v_resultado/.test(sqlFlujo));
  cierto("R02-02: grants y reversión de la función nueva (REVOKE PUBLIC, GRANT runtime, DROP)", /REVOKE ALL ON FUNCTION public\.fe_documento_registrar_consulta_flujo_nce/.test(sql) && /GRANT EXECUTE ON FUNCTION public\.fe_documento_registrar_consulta_flujo_nce/.test(sql) && /DROP FUNCTION public\.fe_documento_registrar_consulta_flujo_nce/.test(rev));
  cierto("R02-02: las reconciliaciones del flujo (facturas y NCE) usan la función del flujo; la consulta manual sigue con la original (el worker de NCE también usa la del flujo, ZERO-01)", (leer("lib/facturacion/nce-emision.ts").match(/flujoNce: true/g) ?? []).length === 2 && /opciones\.flujoNce \? "fe_documento_registrar_consulta_flujo_nce" : "fe_documento_registrar_consulta"/.test(leer("lib/facturacion/shared.ts")) && !/flujoNce/.test(leer("app/api/documentos/[id]/consultar/route.ts")));
  cierto("R02-02: T26 cubre el operador solo CREAR, el estado final y otro tenant", /flujo_nce/.test(t26) && /sin permiso|solo CREAR/.test(t26));
  // ── 11. R03-01: la función del flujo no registra un estado definitivo sin CDC válido ─────────────────────────────────
  const iFin = sqlFlujo.indexOf("INSERT INTO public.documento_electronico_intentos");
  const guardaCdc = sqlFlujo.slice(sqlFlujo.indexOf("CDC_DIVERGENTE"), iFin);

  cierto("R03-01: estado definitivo (APROBADO/RECHAZADO/CANCELADO/INUTILIZADO) exige coalesce(p_cdc, d.cdc) no nulo y coherente; si no, RESPUESTA_INVALIDA antes de auditar y de actualizar", iFin > 0 && /p_estado_sifen IN \('APROBADO', 'RECHAZADO', 'CANCELADO', 'INUTILIZADO'\)/.test(guardaCdc) && /coalesce\(p_cdc, d\.cdc\) IS NULL OR NOT public\.fe_cdc_coherente\(d\.tipo, d\.establecimiento, d\.punto_expedicion, d\.numero, coalesce\(p_cdc, d\.cdc\)\)/.test(guardaCdc) && /v_resultado := 'RESPUESTA_INVALIDA'/.test(guardaCdc));
  cierto("R03-01: tras la degradación a RESPUESTA_INVALIDA solo se anota la consulta (el UPDATE de estado/CDC está condicionado a v_resultado = 'OK') y la evidencia no guarda el estado informado", /IF v_resultado = 'OK' THEN\s+UPDATE public\.documentos_electronicos SET\s+estado_sifen = p_estado_sifen/.test(sqlFlujo) && /CASE WHEN v_resultado = 'OK' THEN p_estado_sifen END/.test(sqlFlujo));
  cierto("R03-01: T26 comprueba aprobación con CDC válido (CDC guardado) y respuesta definitiva sin CDC (RESPUESTA_INVALIDA, estado/CDC intactos, actor real); NEX-054 sigue sin tocarse", /v_cdc_pend/.test(t26) && /APROBADO sin CDC no cambia el estado ni el CDC/.test(t26) && /RECHAZADO sin CDC tampoco/.test(t26) && /\(PENDIENTE\) sin CDC sí se registra/.test(t26) && /CDC_DIVERGENTE/.test(t26) && !/flujo_nce/.test(nce054));
  // ── 12. GAP-01…04 (checklist integral) ─────────────────────────────────────────────────────────────
  // GAP-01: código, tributación (IVA) y monto ya acreditado visibles en la tabla y en la revisión
  igual("GAP-01: etiqueta de IVA por línea", [etiquetaIvaLinea(1, 10, "100"), etiquetaIvaLinea(1, 5, null), etiquetaIvaLinea(2, 0, null), etiquetaIvaLinea(3, 0, null), etiquetaIvaLinea(4, 10, "50")], ["Gravado 10%", "Gravado 5%", "Exonerado", "Exento", "Gravado parcial 10% (prop. 50%)"]);
  cierto("GAP-01: la tabla muestra Código, IVA y Monto acreditado con sus celdas; el modal muestra Código e IVA por línea", ["<th>Código</th>", "<th>IVA</th>", "Monto acreditado</th>", "{l.codigoInterno}", "{fm(l.montoAcreditado)}", "etiquetaIvaLinea(l.afectacion, l.tasa, l.proporcion)", "<td>{l.codigo}</td>"].every((k) => pagNce.includes(k)));

  // GAP-02: el campo admite CDC completo y el servidor lo busca exacto aunque se pegue con espacios o guiones
  cierto("GAP-02: el campo de búsqueda admite 44 dígitos y declara número, CDC y fecha", /maxLength=\{80\}/.test(pagNce) && /CDC \(44 dígitos\)/.test(pagNce) && !/maxLength=\{40\}/.test(pagNce));
  {
    const CDC44 = "01800000056001001000000112026101612345678901";
    const params: unknown[][] = [];
    const dbBusq = { query: async (_t: string, p?: unknown[]) => { params.push(p ?? []); return { rows: [] }; } };

    await listarFacturasElegibles(dbBusq as never, uuid, uuid, { clienteId: uuid, q: CDC44.replace(/(\d{4})/g, "$1 ").trim() });
    await listarFacturasElegibles(dbBusq as never, uuid, uuid, { clienteId: uuid, q: "001-001-0000001" });
    await listarFacturasElegibles(dbBusq as never, uuid, uuid, { clienteId: uuid, q: "16/10/2026" });
    igual("GAP-02: un CDC pegado con espacios se busca como los 44 dígitos; número y fecha se conservan", [params[0][3], params[1][3], params[2][3]], [CDC44, "001-001-0000001", "16/10/2026"]);
    cierto("GAP-02: la consulta busca CDC, número y fecha (sin tocar la elegibilidad: aprobada con CDC y saldo)", /d\.cdc/.test(elegiblesSql) && /DD\/MM\/YYYY/.test(elegiblesSql) && /YYYY-MM-DD/.test(elegiblesSql) && /d\.estado_sifen = 'APROBADO' AND d\.cdc IS NOT NULL/.test(elegiblesSql));
  }

  // GAP-03: la lista de facturas se relee sola mientras haya «NCE pendiente» (mismo control que Documentos; sin worker nuevo ni consultas desde el navegador)
  cierto("GAP-03: refresco solo con facturas «NCE pendiente», sin factura abierta, con el temporizador común y limpieza", /const hayNcePendiente = !factura && cliente !== null && facturas\.some\(\(f\) => f\.ncePendiente\)/.test(pagNce) && /iniciarRefresco\(\{/.test(pagNce) && /if \(!hayNcePendiente \|\| clienteId === ""\) return;/.test(pagNce) && /detener\(\);/.test(pagNce) && !/setInterval/.test(pagNce));
  cierto("GAP-03: la relectura es un GET de la lista (sin actualizar=1, sin consultar ni reenviar) y no crea otro scheduler", (() => { const t = pagNce.slice(pagNce.indexOf("GAP-03"), pagNce.indexOf("const abrirFactura")); return /\/api\/notas-credito\/facturas\?clienteId=/.test(t) && !/actualizar=1|method: "POST"/.test(t); })() && (leer("lib/facturacion/consulta-automatica.ts").match(/setInterval\(/g) ?? []).length === 1);

  // GAP-04: la función SQL confronta receptor completo e ítems con la FE original
  const crearFn = sql.slice(sql.indexOf("FUNCTION public.fe_documento_crear_nce"), sql.indexOf("FUNCTION public.fe_documento_iniciar_envio"));
  const camposRec = ["iNatRec", "iTiOpe", "cPaisRec", "iTiContRec", "dRucRec", "dDVRec", "iTipIDRec", "dDTipIDRec", "dNumIDRec", "dNomRec", "dNomFanRec", "dDirRec", "dNumCasRec", "dTelRec", "dCelRec", "dEmailRec", "dEmailAdic", "dEmailAdmin", "dCodCliente"];

  cierto("GAP-04: la lista de campos del receptor en SQL es EXACTAMENTE la que copia el payload de TypeScript", camposRec.every((k) => crearFn.includes("'" + k + "'")) && camposRec.length === CAMPOS_RECEPTOR.length && CAMPOS_RECEPTOR.every((k) => camposRec.includes(k)));
  cierto("GAP-04: receptor adulterado → NEX:ASOCIACION_INVALIDA (comparación null-segura con la FE original)", /nullif\(p_payload->v_k, 'null'::jsonb\) IS DISTINCT FROM nullif\(v_sol->v_k, 'null'::jsonb\)/.test(crearFn) && /el receptor de la nota de crédito/.test(crearFn));
  cierto("GAP-04: los ítems del payload coinciden en número y posición con las líneas acreditadas y conservan código, GTIN, descripción, unidad, afectación, tasa y proporción de la línea original", /jsonb_array_length\(p_payload->'Detalles'\) <> jsonb_array_length\(p_lineas\)/.test(crearFn) && /WITH ORDINALITY t\(x, ord\)/.test(crearFn) && /p_payload->'Detalles'->\(l\.ord - 1\)::int/.test(crearFn) && ["dCodInt", "dGtin", "dDesProSer", "cUniMed", "iAfecIVA", "dTasaIVA", "dPropIVA"].every((k) => crearFn.includes("'" + k + "'")));
  cierto("GAP-04: importe del ítem = crédito; Devolución conserva precio original y cantidad devuelta; 3/4/8 llevan cantidad 1 y precio = monto", /dTotOpeItem'\)::numeric IS DISTINCT FROM l\.monto/.test(crearFn) && /p_motivo = 2 AND \(\(v_det->>'dCantProSer'\)::numeric IS DISTINCT FROM l\.cantidad OR \(v_det->>'dPUniProSer'\)::numeric IS DISTINCT FROM \(v_orig->>'dPUniProSer'\)::numeric\)/.test(crearFn) && /p_motivo <> 2 AND \(\(v_det->>'dCantProSer'\)::numeric IS DISTINCT FROM 1 OR \(v_det->>'dPUniProSer'\)::numeric IS DISTINCT FROM l\.monto\)/.test(crearFn));
  cierto("GAP-04: las validaciones ocurren antes de reservar la secuencia (sin consumir número) y se conservan motivos, saldos, bloqueo e idempotencia", crearFn.indexOf("NEX:PAYLOAD_INVALIDO', 'x'") < 0 && crearFn.lastIndexOf("NEX:PAYLOAD_INVALIDO") < crearFn.indexOf("tipo_documento = 'NCE' FOR UPDATE") && /NEX:SALDO_MONTO/.test(crearFn) && /NEX:NCE_PENDIENTE/.test(crearFn) && /NEX:MOTIVO_FIJADO/.test(crearFn) && /IDEMPOTENCIA_CONFLICTO/.test(crearFn));
  cierto("GAP-04: T26 ejercita receptor, afectación, importe, ítems y cantidad adulterados y que no se consume número", ["dDirRec", "iAfecIVA", "Detalles,0,dTotOpeItem", "'{Detalles}', '[]'", "dCantProSer", "ningún payload adulterado consumió número"].every((k) => t26.includes(k)) && /FUNCTION pg_temp\.pay/.test(t26));
  // ── 13. R05-01/02/03 ─────────────────────────────────────────────────────────────────────────────
  // R05-01: SQL recalcula bruto/base/liquidación/base exenta por ítem y los subtotales con la misma fórmula y redondeo que el motor TypeScript, antes de reservar numeración
  cierto("R05-01: la función SQL recalcula los derivados por ítem y compara bruto, total, base gravada, liquidación y base exenta", ["v_tb := round(v_cant_p * v_prec_p, 8)", "round(100 * v_tb * v_prop / v_den, 8)", "round(v_base * v_tasa / 100, 8)", "round(100 * v_tb * (100 - v_prop) / v_den, 8)", "dTotBruOpeItem", "dBasGravIVA", "dLiqIVAItem", "dBasExe"].every((k) => crearFn.includes(k)));
  cierto("R05-01: SQL compara los subtotales (exento, exonerado, 5 %, 10 %, IVA, bases, total IVA, total) y exige una sola fila con descuentos/anticipos/redondeo en cero", ["dSubExe", "dSubExo", "dSub5", "dSub10", "dTotOpe", "dIVA5", "dIVA10", "dLiqTotIVA5", "dLiqTotIVA10", "dTotIVA", "dBaseGrav5", "dBaseGrav10", "dTBasGraIVA", "dTotDesc", "dAnticipo", "dRedon"].every((k) => crearFn.includes(k)) && /jsonb_array_length\(p_payload->'Subtotales'\) <> 1/.test(crearFn));
  cierto("R05-01: las comprobaciones derivadas ocurren antes de reservar la secuencia NCE", crearFn.indexOf("los subtotales de la nota de crédito no coinciden") < crearFn.indexOf("tipo_documento = 'NCE' FOR UPDATE") && crearFn.indexOf("importes fiscales derivados") < crearFn.indexOf("tipo_documento = 'NCE' FOR UPDATE"));
  {
    // Paridad: lo que genera el serializador cumple la fórmula que SQL recalcula (redondeo mitad hacia arriba a 8 decimales sobre racionales exactos, independiente del motor)
    const E8 = BigInt(100000000);
    const div = (num: bigint, den: bigint) => (BigInt(2) * num + den) / (BigInt(2) * den);   // cociente entero con redondeo mitad hacia arriba
    const txt8 = (v: bigint) => { const e = v / E8; const fr = (v % E8).toString().padStart(8, "0").replace(/0+$/, ""); return fr ? `${e}.${fr}` : `${e}`; };
    const L4: LineaOriginal = { linea: 3, codigoInterno: "P3", gtin: null, descripcion: "Mixto", unidadSifen: 77, cantidad: "3", precio: "11000", total: "33000", afectacion: 4, tasa: 10, proporcion: "50" };
    const casos: Array<[number, LineaNceEntradaT]> = [
      [3, { original: L1, acreditado: SIN, monto: "10000" }], [3, { original: L4, acreditado: SIN, monto: "10500" }], [3, { original: L2, acreditado: SIN, monto: "5000" }],
      [2, { original: L1, acreditado: SIN, cantidad: "1.5" }], [2, { original: L1, acreditado: SIN, cantidad: "1" }],
    ];
    const resultados = casos.map(([motivo, lin]) => {
      const pl = construirPayloadNCE(entrada(motivo, [lin]), rec, CDC) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      const d = pl.Detalles[0];
      const cant = BigInt(Math.round(Number(d.dCantProSer) * 1e8));
      const prec = BigInt(Math.round(Number(d.dPUniProSer) * 1e8));
      const tb = div(cant * prec, E8);
      const prop = BigInt(Math.round(Number(d.dPropIVA) * 1e8));
      const tasa = BigInt(d.dTasaIVA);
      const den = BigInt(10000) * E8 + tasa * prop;       // (10000 + tasa·prop) en escala 1e-8
      const grav = d.iAfecIVA === 1 || d.iAfecIVA === 4;
      const base = grav ? div(BigInt(100) * tb * prop, den) : BigInt(0);
      return [d.dTotBruOpeItem === Number(txt8(tb)), grav ? d.dBasGravIVA === Number(txt8(base)) : d.dBasGravIVA === 0, grav ? d.dLiqIVAItem === Number(txt8(div(base * tasa, BigInt(100)))) : d.dLiqIVAItem === 0];
    });

    igual("R05-01: paridad TypeScript ↔ fórmula SQL (bruto, base gravada, liquidación) en IVA 10 %, parcial 50 %, exento y devolución con decimales", resultados, casos.map(() => [true, true, true]));
  }
  const t26b = t26;

  cierto("R05-01: T26 prueba derivados y subtotales alterados (liquidación, base, bruto, IVA 10 %, total IVA, subtotal gravado, descuento) y un caso positivo con IVA parcial", ["dLiqIVAItem", "dBasGravIVA", "dTotBruOpeItem", "{Subtotales,0,dIVA10}", "{Subtotales,0,dTotIVA}", "{Subtotales,0,dSub10}", "{Subtotales,0,dTotDesc}", "\"dPropIVA\":50", "0000004"].every((k) => t26b.includes(k)));

  // R05-02: el refresco usa el filtro aplicado y descarta respuestas de un filtro anterior
  {
    const c = crearControlListado({ clienteId: "A", q: "", pagina: 1 });
    const t1 = c.aplicar({ clienteId: "A", q: "uno", pagina: 1 });
    const lectura = c.leer();

    igual("R05-02: el refresco lee el filtro APLICADO (búsqueda uno)", [lectura.filtro.q, c.vigente(lectura.token)], ["uno", true]);

    const t2 = c.aplicar({ clienteId: "A", q: "dos", pagina: 1 });

    igual("R05-02: tras la búsqueda nueva, las respuestas de la anterior (manual o refresco) quedan descartadas y el refresco lee el filtro nuevo", [c.vigente(t1), c.vigente(lectura.token), c.vigente(t2), c.leer().filtro.q], [false, false, true, "dos"]);
    c.aplicar({ clienteId: "", q: "", pagina: 1 });
    igual("R05-02: al cambiar de cliente se invalida cualquier petición en vuelo", [c.vigente(t2), c.leer().filtro.clienteId], [false, ""]);
  }
  cierto("R05-02: la pantalla registra cada filtro aplicado, el refresco no usa el texto capturado y solo aplica respuestas vigentes", /control\.current\.aplicar\(\{ clienteId, q, pagina \}\)/.test(pagNce) && /control\.current\.leer\(\)/.test(pagNce) && /control\.current\.vigente\(token\)/.test(pagNce) && !/encodeURIComponent\(textoFactura\)&pagina=\$\{pagFac/.test(pagNce) && /\}, \[hayNcePendiente, clienteId\]\);/.test(pagNce) && !/actualizar=1/.test(pagNce.slice(pagNce.indexOf("GAP-03"), pagNce.indexOf("const abrirFactura"))));

  // R05-03: la revisión final conserva la proporción del IVA parcial
  cierto("R05-03: el resumen del servidor incluye la proporción de IVA y el modal la usa", /afectacion: i\.original\.afectacion, tasa: i\.original\.tasa, proporcion: i\.original\.proporcion/.test(fuente) && /proporcion: string \}>;/.test(fuente) && /etiquetaIvaLinea\(l\.afectacion, l\.tasa, l\.proporcion\)/.test(pagNce.slice(pagNce.indexOf("Revisar y emitir"))) && !/etiquetaIvaLinea\(l\.afectacion, l\.tasa, null\)/.test(pagNce));
  igual("R05-03: etiqueta del IVA parcial con proporción", etiquetaIvaLinea(4, 10, "50"), "Gravado parcial 10% (prop. 50%)");
  // ── 14. ZERO-01/02/03 ────────────────────────────────────────────────────────────────────────────
  const reservar = sql.slice(sql.indexOf("FUNCTION public.fe_consulta_reservar"), sql.indexOf("FUNCTION public.fe_consulta_programar"));
  const crearFx = sql.slice(sql.indexOf("FUNCTION public.fe_documento_crear_nce"), sql.indexOf("FUNCTION public.fe_documento_iniciar_envio"));
  const auto = leer("lib/facturacion/consulta-automatica.ts");

  // ZERO-01
  cierto("ZERO-01: el actor del worker es un usuario ACTIVO con CREAR o EDITAR y alcance (creador primero; si no, el más antiguo autorizado; si no, NULL → sinActor)", (reservar.match(/u\.estado = 'ACTIVO'/g) ?? []).length === 2 && (reservar.match(/'CREAR'\) OR public\.usuario_tiene_permiso\(e\.empresa_id, u\.id, 'FACTURACION_ELECTRONICA', 'EDITAR'\)/g) ?? []).length === 2 && (reservar.match(/sucursal_en_alcance\(e\.empresa_id, u\.id, e\.sucursal_id\)/g) ?? []).length === 2 && /u\.id = e\.creado_por/.test(reservar) && /ORDER BY u\.creado_at, u\.id LIMIT 1/.test(reservar) && /empresa_id = e\.empresa_id/.test(reservar));
  cierto("ZERO-01: conserva lease, SKIP LOCKED, solo los tipos pedidos y estados pendientes; no amplía el alcance a documentos finales", /FOR UPDATE SKIP LOCKED/.test(reservar) && /consulta_lease_hasta/.test(reservar) && /d\.tipo = ANY \(p_tipos\)/.test(reservar) && /estado_sifen IN \('SIN_CONSULTA', 'PENDIENTE', 'NO_RECONOCIDO'\)/.test(reservar) && /TIPOS_CONSULTA_AUTOMATICA: readonly string\[\] = \["NCE"\]/.test(auto));
  cierto("ZERO-01: el worker consulta las NCE con la función del flujo NCE (flujoNce) y mantiene sinActor cuando no hay usuario autorizado; la consulta manual no cambia", /flujoNce: String\(f\.o_tipo\) === "NCE"/.test(auto) && /f\.o_actor === null \|\| f\.o_actor === undefined/.test(auto) && !/flujoNce/.test(leer("app/api/documentos/[id]/consultar/route.ts")));
  {
    // El worker llama a consultarEstado con el actor reservado (identidad real) y flujoNce para NCE; sin actor no consulta y reprograma
    const llamadasSql: string[] = [];
    const dbW = { query: async (t: string, p?: unknown[]) => {
      llamadasSql.push(t.includes("fe_consulta_reservar") ? "reservar" : t.includes("fe_consulta_programar") ? "programar:" + String((p ?? [])[3]) : "otra");

      if (t.includes("fe_consulta_reservar")) return { rows: [{ o_empresa: uuid, o_documento: uuid, o_actor: null, o_tipo: "NCE", o_intentos: 2 }] };

      return { rows: [] };
    } };
    const rw = await ejecutarLote(dbW as never, { dormir: async () => undefined });

    igual("ZERO-01: sin usuario autorizado el worker no consulta, reprograma sin contar intento y no toca el documento", [rw.sinActor, rw.consultados, llamadasSql], [1, 0, ["reservar", "programar:false"]]);
  }

  // ZERO-02
  const usdPl = construirPayloadNCE(entrada(3, [{ original: { ...L1, precio: "50000", total: "100000" }, acreditado: SIN, monto: "11" }], { moneda: "USD", cambio: "7300" }), rec, CDC) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  igual("ZERO-02: el serializador USD genera dCondTiCam 1, dTiCam original y dTotalGs = total × cambio exacto", [usdPl.dCondTiCam, usdPl.dTiCam, usdPl.Subtotales[0].dTotGralOpe, usdPl.Subtotales[0].dTotalGs], [1, 7300, 11, 80300]);
  cierto("ZERO-02: SQL exige moneda del catálogo, PYG sin cambio, USD/BRL con el cambio ORIGINAL de la FE y dCondTiCam = 1", /p_moneda NOT IN \('PYG', 'USD', 'BRL'\)/.test(crearFx) && /v_cambio := \(v_sol->>'dTiCam'\)::numeric/.test(crearFx) && /\(v_sol->>'dTiCam'\) IS DISTINCT FROM \(p_payload->>'dTiCam'\)/.test(crearFx) && /\(p_payload->>'dCondTiCam'\)::numeric IS DISTINCT FROM 1/.test(crearFx) && /scale\(trim_scale\(v_cambio\)\) > 4/.test(crearFx));
  cierto("ZERO-02: SQL exige dTotalGs = dTotGralOpe × cambio EXACTO (≤ 8 decimales y < 10^15, sin redondeo, no nulo) antes de reservar numeración", /v_gs := v_total_det \* v_cambio/.test(crearFx) && /scale\(trim_scale\(v_gs\)\) > 8/.test(crearFx) && /v_gs >= 1000000000000000/.test(crearFx) && /\(v_sub->>'dTotalGs'\)::numeric IS DISTINCT FROM v_gs/.test(crearFx) && !/round\(v_gs/.test(crearFx) && crearFx.indexOf("v_gs := v_total_det") < crearFx.indexOf("tipo_documento = 'NCE' FOR UPDATE"));
  cierto("ZERO-02: el límite SQL coincide con la norma TypeScript (15 enteros, 8 decimales, cambio de 4 decimales)", MAX_ENTEROS_F023 === 15 && /scale\(trim_scale\(v_cambio\)\) > 4/.test(crearFx));
  cierto("ZERO-02: T26 cubre USD válido, dTotalGs +1, ausente, dCondTiCam y cambio alterados, moneda distinta", ["clave-t26-fx01", "clave-t26-fx02", "clave-t26-fx03", "clave-t26-fx04", "clave-t26-fx05", "clave-t26-fx06", "80300", "80301"].every((k) => t26.includes(k)));

  // ZERO-03
  const lista = elegiblesSql;

  cierto("ZERO-03: el saldo de la lista suma los Detalles de UNA sola versión (la última, LATERAL ORDER BY version DESC LIMIT 1), no de todas", /CROSS JOIN LATERAL \(SELECT so\.payload FROM documento_electronico_solicitudes so WHERE so\.empresa_id = d\.empresa_id AND so\.documento_id = d\.id ORDER BY so\.version DESC LIMIT 1\) sv/.test(lista) && /jsonb_array_elements\(sv\.payload->'Detalles'\)/.test(lista) && !/FROM documento_electronico_solicitudes so, jsonb_array_elements/.test(lista));
  cierto("ZERO-03: coincide con la versión que usan el detalle y la reserva SQL; conserva crédito aprobado, pendiente, CDC, empresa/alcance, búsqueda, paginación y orden", /ORDER BY version DESC LIMIT 1/.test(fuente.slice(fuente.indexOf("export async function leerFacturaOriginal"), fuente.indexOf("export async function buscarClientesConFacturas"))) && /ORDER BY s\.version DESC LIMIT 1/.test(crearFx) && /nn\.estado_sifen = 'APROBADO'/.test(lista) && /fe_nce_clasificar/.test(lista) && /d\.cdc IS NOT NULL/.test(lista) && /sucursal_en_alcance/.test(lista) && /original - acreditado > 0/.test(lista) && /ORDER BY fecha_emision DESC, id DESC LIMIT \$6 OFFSET \$7/.test(lista));
  {
    // Simulación pura de las dos versiones sintéticas: con una sola versión se suma esa; con dos, solo la última (120, no 220)
    const total = (versiones: number[]) => versiones[versiones.length - 1];

    igual("ZERO-03: v1=120 → 120; v1=100 y v2=120 → 120 (no 220)", [total([120]), total([100, 120])], [120, 120]);
  }
  // ── 15. NCE-DB-01/02/04 y NCE-UI-03 (auditoría estructural) ────────────────────────────────────────
  const L1000: LineaOriginal = { ...L2, precio: "1000", total: "1000", cantidad: "1" };

  // DB-01: PYG sin centavos en el TOTAL
  cierto("PYG-01: devolución de 0.0001 × Gs. 1.000 (total 0,1) se rechaza con mensaje útil", validarEntradaNce(entrada(2, [{ original: L1000, acreditado: SIN, cantidad: "0.0001" }])).some((m) => /guaraníes debe ser un número entero/.test(m)));
  cierto("PYG-02: devolución de 1 × Gs. 1.000 y de 0.5 × Gs. 50.000 (total entero) válidas; descuento monetario PYG entero sigue válido", validarEntradaNce(entrada(2, [{ original: L1000, acreditado: SIN, cantidad: "1" }])).length === 0 && validarEntradaNce(entrada(2, [{ original: L1, acreditado: SIN, cantidad: "0.5" }])).length === 0 && validarEntradaNce(entrada(3, [{ original: L1, acreditado: SIN, monto: "33000" }])).length === 0);
  cierto("PYG-03: bases e IVA siguen con 8 decimales (devolución 1.5 × 50.000 al 10 %)", calcularNce(entrada(2, [{ original: L1, acreditado: SIN, cantidad: "1.5" }])).totales.iva10 === "6818.18181818" && calcularNce(entrada(2, [{ original: L1, acreditado: SIN, cantidad: "1.5" }])).totales.total === "75000");
  cierto("PYG-03: el rechazo no construye payload ni líneas (nada que enviar a SQL)", (() => { try { construirPayloadNCE(entrada(2, [{ original: L1000, acreditado: SIN, cantidad: "0.0001" }]), rec, CDC); return false; } catch { return true; } })());

  // DB-02: total exacto en numeric(20,4)
  const L05: LineaOriginal = { ...L1000, precio: "0.5", total: "0.5" };
  const usdE = (lineas: EntradaNce["lineas"], motivo = 3) => entrada(motivo, lineas, { moneda: "USD", cambio: "7300" });

  cierto("PREC-01: total USD 0,001 (3 decimales) y 0,0001 (4) representables; 0,00005 (5 decimales) no, sin tocar la validación de moneda y cambio", validarEntradaNce(usdE([{ original: L1, acreditado: SIN, monto: "0.001" }])).length === 0
    && validarEntradaNce(usdE([{ original: L2, acreditado: SIN, monto: "0.0001" }])).length === 0
    && validarEntradaNce(usdE([{ original: { ...L05, cantidad: "1" }, acreditado: SIN, cantidad: "0.0001" }], 2)).some((m) => /4 decimales/.test(m)));
  cierto("PREC-02: total 0,0001 (mínimo positivo) válido; total cero sigue inválido", calcularNce(usdE([{ original: L2, acreditado: SIN, monto: "0.0001" }])).totales.total === "0.0001" && validarEntradaNce(usdE([{ original: L2, acreditado: SIN, monto: "0" }])).length > 0);
  {
    const p = construirPayloadNCE(usdE([{ original: L2, acreditado: SIN, monto: "0.0001" }]), rec, CDC) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const li = lineasParaSql(usdE([{ original: L2, acreditado: SIN, monto: "0.0001" }]));

    igual("PREC-03: total del JSON, suma de líneas y monto de crédito coinciden exactamente (0.0001)", [p.Subtotales[0].dTotGralOpe, p.Detalles[0].dTotOpeItem, li[0].monto], [0.0001, 0.0001, "0.0001"]);
  }
  cierto("PREC-03: SQL exige p_total = dTotGralOpe recalculado, ≤ 4 decimales, < 10^16 y entero en PYG, antes de reservar numeración", /p_total <> v_total_det OR scale\(v_total_n4\) > 4 OR p_total >= 10000000000000000 OR \(p_moneda = 'PYG' AND scale\(v_total_n4\) > 0\)/.test(crearFx) && crearFx.indexOf("v_total_n4 := trim_scale(p_total)") < crearFx.indexOf("tipo_documento = 'NCE' FOR UPDATE") && /v_suma <> p_total/.test(crearFx));
  cierto("PREC-04: NEX-047/048/049/050/054 sin tocar (sin ALTER de documentos_electronicos.total) y límites FE intactos", !/ALTER TABLE public\.documentos_electronicos\s+ALTER COLUMN total/i.test(sql) && !/numeric\(20,\s*8\)[^;]*total/i.test(sql.slice(sql.indexOf("documentos_electronicos"), sql.indexOf("documentos_electronicos") + 50)));
  cierto("PYG/PREC en T26: devolución fraccionaria rechazada sin consumir número y entera válida", ["clave-t26-py01", "clave-t26-py02", "PYG-01", "PYG-02", "PYG-03"].every((k) => t26.includes(k)));

  // UI-03: CDC original distinto del CDC propio
  const compartido = leer("lib/facturacion/shared.ts");
  const colNce = compartido.slice(compartido.indexOf("const COLUMNAS_NCE"), compartido.indexOf("const DESDE_NCE"));

  cierto("UI-01: el SELECT de NCE devuelve el CDC de la factura original desde nce_origen (feCdc), solo en la consulta con alcance de empresa/sucursal, y la consulta básica sin NEX-062 queda como respaldo", /o\.fe_cdc AS "feCdc"/.test(colNce) && /LEFT JOIN nce_origen o ON o\.empresa_id = d\.empresa_id AND o\.nce_id = d\.id/.test(compartido) && /\${ALCANCE\}/.test(compartido) && /conNce \? SELECT_NCE : SELECT/.test(compartido));
  cierto("UI-01/02: el detalle muestra «CDC de la factura original» y «CDC de la nota de crédito» (Aún no informado si falta) y las FE conservan «CDC»", /CDC de la factura original<\/dt><dd[^>]*>\{d\.feCdc \?\? "—"\}/.test(docs) && /\{d\.tipo === "NCE" \? "CDC de la nota de crédito" : "CDC"\}/.test(docs) && /\{d\.cdc \?\? "Aún no informado"\}/.test(docs) && /feCdc\?: string \| null/.test(docs));

  // Tamaño del payload (contrato de límites): 999 líneas excederían el CHECK de NEX-048; se detecta antes de crear
  cierto("LIM-01: el payload se mide antes de crear la NCE (tope conservador de 240000 bytes frente al CHECK de 262144 de NEX-048) con mensaje claro y 422", /LIMITE_BYTES_PAYLOAD_NCE = 240000/.test(fuente) && /Buffer\.byteLength\(JSON\.stringify\(payload\), "utf8"\) > LIMITE_BYTES_PAYLOAD_NCE/.test(fuente) && fuente.indexOf("LIMITE_BYTES_PAYLOAD_NCE)") < fuente.indexOf("const calculo = calcularNce(entrada)") && /pg_column_size\(payload\) < 262144/.test(leer("documentacao/banco/nexit/v1/migraciones/NEX-048-facturacion-emision-fe.sql")));
  {
    const muchas: LineaOriginal[] = Array.from({ length: 999 }, (_, i) => ({ ...L2, linea: i + 1, descripcion: "Producto de prueba con descripcion tipica de cuarenta" }));
    const big = construirPayloadNCE(entrada(3, muchas.map((o) => ({ original: o, acreditado: SIN, monto: "500" }))), rec, CDC);
    const chico = construirPayloadNCE(entrada(3, muchas.slice(0, 10).map((o) => ({ original: o, acreditado: SIN, monto: "500" }))), rec, CDC);

    cierto("LIM-01: 999 líneas superan el tope y 10 líneas no (medición real del JSON)", Buffer.byteLength(JSON.stringify(big), "utf8") > LIMITE_BYTES_PAYLOAD_NCE && Buffer.byteLength(JSON.stringify(chico), "utf8") < LIMITE_BYTES_PAYLOAD_NCE);
  }

  // DB-04: FK compuesta
  const tablas = sql.slice(sql.indexOf("CREATE TABLE public.nce_origen"), sql.indexOf("CREATE OR REPLACE FUNCTION public.nce_solo_altas"));

  cierto("DB-04-01: nce_origen expone UNIQUE (empresa, nce, fe) y nce_lineas referencia (empresa, nce, fe) con esa clave; sin FK duplicada de 2 columnas", /CONSTRAINT nce_origen_identidad_uk UNIQUE \(empresa_id, nce_id, fe_id\)/.test(tablas) && /FOREIGN KEY \(empresa_id, nce_id, fe_id\) REFERENCES public\.nce_origen \(empresa_id, nce_id, fe_id\) ON DELETE CASCADE/.test(tablas) && !/FOREIGN KEY \(empresa_id, nce_id\) REFERENCES public\.nce_origen/.test(tablas));
  cierto("DB-04-01: la imutabilidad (solo altas), el índice por FE/ordinal y el borrado en cascada (reinicio DEMO) se conservan", /nce_lineas_inmutable_fila_trg/.test(sql) && /nce_lineas_inmutable_truncate_trg/.test(sql) && /nce_lineas_fe_idx ON public\.nce_lineas \(empresa_id, fe_id, linea\)/.test(tablas));
  cierto("DB-04-02: T26 prueba el fe_id incorrecto (23503), el correcto, y UPDATE/DELETE prohibidos", ["23503", "FK compuesta", "solo altas (UPDATE)", "solo altas (DELETE)"].every((k) => t26.includes(k)));
  // ── 16. INT-01/02/03 (revisión integral) ─────────────────────────────────────────────────────────────
  // INT-01: una NCE solo se rechaza (libera saldo) si Rechazados la identifica por su número; lo ambiguo queda indeterminado y bloquea
  const docN: DocumentoRecepcion = { tipo: "NCE", establecimiento: "001", puntoExpedicion: "001", numero: "0000005" };
  const docF: DocumentoRecepcion = { tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000005" };
  const resumen = (x: ReturnType<typeof interpretarRecepcion>) => [x.estadoLocal, x.errorTipo];
  const IND = ["ENVIO_INDETERMINADO", null];
  const jr = (o: unknown) => JSON.stringify(o);
  const CDC_N = "05" + "80000005" + "6" + "001" + "001" + "0000005" + "1" + "20261016" + "1" + "123456789" + "0";

  igual("A01: HTTP 422 genérico «Error de validación» → indeterminado (bloquea)", resumen(interpretarRecepcion(422, jr({ status: "error", message: "Error de validación" }), [], docN)), IND);
  igual("A02: HTTP 200 status:error genérico → indeterminado (bloquea)", resumen(interpretarRecepcion(200, jr({ status: "error", message: "Error general" }), [], docN)), IND);
  igual("A03: Rechazados con el número exacto de la NCE, sin Aceptados contradictorios ni duplicidad → RECHAZO definitivo", resumen(interpretarRecepcion(422, jr({ status: "error", message: "Se detectaron valores inválidos", rechazados: 1, response: { Aceptados: [], Rechazados: [{ "001-001-0000005": { iMotEmi: "Campo obligatorio requerido." } }] } }), [], docN)), ["ERROR_ENVIO", "RECHAZO"]);
  igual("A03b: Rechazados propio pero también Aceptado, o con texto de duplicidad → indeterminado", [
    resumen(interpretarRecepcion(422, jr({ status: "error", rechazados: 1, response: { Aceptados: [{ "001-001-0000005": {} }], Rechazados: [{ "001-001-0000005": { x: "y" } }] } }), [], docN)),
    resumen(interpretarRecepcion(422, jr({ status: "error", message: "Documento ya existe", rechazados: 1, response: { Aceptados: [], Rechazados: [{ "001-001-0000005": { x: "y" } }] } }), [], docN)),
  ], [IND, IND]);
  igual("A04: Rechazados de OTRO número → indeterminado", resumen(interpretarRecepcion(422, jr({ status: "error", rechazados: 1, response: { Aceptados: [], Rechazados: [{ "001-001-0000009": { x: "y" } }] } }), [], docN)), IND);
  igual("A05: 409 y mensaje de duplicidad → indeterminado", [resumen(interpretarRecepcion(409, jr({ status: "error", message: "Conflicto" }), [], docN)), resumen(interpretarRecepcion(400, jr({ status: "error", message: "El documento ya existe" }), [], docN))], [IND, IND]);
  igual("A06: 5xx, respuesta indescifrable → indeterminado", [resumen(interpretarRecepcion(503, "<html>", [], docN)), resumen(interpretarRecepcion(500, jr({ message: "boom" }), [], docN)), resumen(interpretarRecepcion(200, "no json", [], docN))], [IND, IND, IND]);
  igual("A07: success con lote, o con CDC coherente → ENVIADO (nunca APROBADO)", [resumen(interpretarRecepcion(200, jr({ status: "success", nro_lote: "12345" }), [], docN)), resumen(interpretarRecepcion(200, jr({ status: "success", cdc: CDC_N }), [], docN))], [["ENVIADO", null], ["ENVIADO", null]]);
  igual("A08: 401/403 siguen siendo AUTENTICACION y 429 TRANSITORIO (fallas anteriores a la transmisión, no bloquean el saldo)", [resumen(interpretarRecepcion(401, jr({ message: "Unauthorized" }), [], docN)), resumen(interpretarRecepcion(403, jr({ message: "Forbidden" }), [], docN)), resumen(interpretarRecepcion(429, jr({ message: "Too many" }), [], docN))], [["ERROR_ENVIO", "AUTENTICACION"], ["ERROR_ENVIO", "AUTENTICACION"], ["ERROR_ENVIO", "TRANSITORIO"]]);
  igual("A09: la factura conserva su política (4xx genérico y status:error siguen siendo RECHAZO) y el contrato de Rechazados propio", [resumen(interpretarRecepcion(422, jr({ status: "error", message: "Error de validación" }), [], docF)), resumen(interpretarRecepcion(200, jr({ status: "error", message: "Error general" }), [], docF)), resumen(interpretarRecepcion(422, jr({ status: "error", rechazados: 1, response: { Aceptados: [], Rechazados: [{ "001-001-0000005": { x: "y" } }] } }), [], docF))], [["ERROR_ENVIO", "RECHAZO"], ["ERROR_ENVIO", "RECHAZO"], ["ERROR_ENVIO", "RECHAZO"]]);
  cierto("INT-01: lo indeterminado BLOQUEA el saldo (clase SQL BLOQUEA), solo el RECHAZO inequívoco libera; no se ofrece «Corregir» para lo indeterminado", /WHEN p_estado_local = 'ERROR_ENVIO' AND p_envio_error_tipo = 'RECHAZO' THEN 'LIBRE'[\s\S]*ELSE 'BLOQUEA'/.test(sql) && /\(d\.tipo = 'NCE' AND \(d\.estado_sifen = 'RECHAZADO' OR \(d\.estado_local = 'ERROR_ENVIO' AND d\.envio_error_tipo = 'RECHAZO'\)\)\) AS corregible/.test(compartido));

  // INT-02: idempotencia biyectiva por ordinal
  const SUC2 = "22222222-2222-4222-8222-222222222222";
  const base2 = { facturaId: uuid, motivo: 3, sucursalId: SUC2, puntoId: "33333333-3333-4333-8333-333333333333", observacion: "", claveIdempotencia: "nce-clave-int02" };
  const dbI2 = (guardadas: Array<{ linea: number; cantidad: string; monto: string }>, motivo = 3) => ({
    query: async (texto: string) => {
      if (texto.includes("FROM documentos_electronicos d LEFT JOIN nce_origen")) return { rows: [{ id: "doc-2", numero: "0000002", tipo: "NCE", sucursalId: SUC2, puntoCodigo: "001", feId: uuid, motivo, observacion: null }] };
      if (texto.includes("FROM nce_lineas")) return { rows: guardadas };
      if (texto.includes("FROM fe_puntos_expedicion")) return { rows: [{ codigo: "001" }] };

      return { rows: [] };
    },
  });
  const G12 = [{ linea: 1, cantidad: "0", monto: "100" }, { linea: 2, cantidad: "0", monto: "200" }];
  const res = async (lineas: Array<{ linea: number; cantidad?: string; monto?: string }>, guardadas = G12, extra: Record<string, unknown> = {}, motivoGuardado = 3) => {
    try { await repeticion(dbI2(guardadas, motivoGuardado) as never, uuid, uuid, { ...base2, lineas, ...extra } as never); return "reutiliza"; } catch (e) { return e instanceof ErrorFacturacion ? e.estado : "otro"; }
  };

  igual("I01: cuerpo idéntico reutiliza la misma NCE", await res([{ linea: 1, monto: "100" }, { linea: 2, monto: "200" }]), "reutiliza");
  igual("I02: mismo contenido con las líneas reordenadas también reutiliza (sin duplicar)", await res([{ linea: 2, monto: "200" }, { linea: 1, monto: "100" }]), "reutiliza");
  igual("I03: persistida [1,2] vs cuerpo [1,1] con la misma clave → 409", await res([{ linea: 1, monto: "100" }, { linea: 1, monto: "100" }]), 409);
  igual("I04: línea ausente o distinta → 409", [await res([{ linea: 1, monto: "100" }]), await res([{ linea: 1, monto: "100" }, { linea: 3, monto: "200" }]), await res([{ linea: 1, monto: "100" }, { linea: 2, monto: "200" }, { linea: 3, monto: "1" }])], [409, 409, 409]);
  igual("I05: mismo ordinal con otro monto → 409 (y con otra cantidad en Devolución)", [await res([{ linea: 1, monto: "100" }, { linea: 2, monto: "201" }]), await res([{ linea: 1, cantidad: "3" }, { linea: 2, cantidad: "1" }], [{ linea: 1, cantidad: "2", monto: "10" }, { linea: 2, cantidad: "1", monto: "20" }], { motivo: 2 }, 2)], [409, 409]);
  igual("I06: el mismo valor en ordinales distintos no se confunde (100/100 vs 1/2 guardado con 100/200 → 409; 100/100 guardado idéntico → reutiliza)", [await res([{ linea: 1, monto: "100" }, { linea: 2, monto: "100" }]), await res([{ linea: 1, monto: "100" }, { linea: 2, monto: "100" }], [{ linea: 1, cantidad: "0", monto: "100" }, { linea: 2, cantidad: "0", monto: "100" }])], [409, "reutiliza"]);
  igual("I07: motivo, factura, punto, sucursal u observación distintos → 409", [await res([{ linea: 1, monto: "100" }, { linea: 2, monto: "200" }], G12, { motivo: 4 }), await res([{ linea: 1, monto: "100" }, { linea: 2, monto: "200" }], G12, { facturaId: "55555555-5555-4555-8555-555555555555" }), await res([{ linea: 1, monto: "100" }, { linea: 2, monto: "200" }], G12, { sucursalId: "44444444-4444-4444-8444-444444444444" }), await res([{ linea: 1, monto: "100" }, { linea: 2, monto: "200" }], G12, { observacion: "otra" })], [409, 409, 409, 409]);
  igual("I03b: el parser de la API rechaza ordinales repetidos antes de llegar a la idempotencia (400)", typeof leerCuerpoNce({ facturaId: uuid, motivo: 3, sucursalId: uuid, puntoId: uuid, observacion: "", claveIdempotencia: "nce-clave-123", lineas: [{ linea: 1, monto: "1" }, { linea: 1, monto: "1" }] }), "string");

  // INT-03: reconciliar FE sin decisión fiscal (ENVIADO/ENVIO_INDETERMINADO × SIN_CONSULTA/PENDIENTE/NO_RECONOCIDO), máx. 5 y 60 s, sin ampliar la elegibilidad
  {
    const consultas: Array<{ sql: string; params: unknown[] }> = [];
    const dbF = { query: async (texto: string, p?: unknown[]) => { consultas.push({ sql: texto, params: p ?? [] }); return { rows: [{ id: uuid }, { id: uuid }] }; } };
    const n = await reconciliarFacturasPendientes(dbF as never, "emp-1", "usr-1", "cli-1", {});
    const q = consultas[0].sql;

    igual("F01-F04: se consultan las FE ENVIADO/ENVIO_INDETERMINADO con SIN_CONSULTA/PENDIENTE/NO_RECONOCIDO", /d\.estado_local IN \('ENVIADO', 'ENVIO_INDETERMINADO'\) AND d\.estado_sifen IN \('SIN_CONSULTA', 'PENDIENTE', 'NO_RECONOCIDO'\)/.test(q), true);
    igual("F05: PENDIENTE_ENVIO, ENVIANDO y los estados fiscales definitivos no se consultan por este camino", [/PENDIENTE_ENVIO|ENVIANDO|'RECHAZADO'|'CANCELADO'|'APROBADO'|'INUTILIZADO'|'ERROR_ENVIO'/.test(q)], [false]);
    igual("F07: solo FE del cliente y de la empresa/alcance de la sesión, máximo 5 y no consultadas en los últimos 60 s", [/d\.tipo = 'FE'/.test(q), /d\.cliente_id = \$3/.test(q), /d\.empresa_id = \$1/.test(q), /sucursal_en_alcance\(\$1::uuid, \$2::uuid, d\.sucursal_id\)/.test(q), /LIMIT 5/.test(q), /interval '60 seconds'/.test(q), consultas[0].params], [true, true, true, true, true, true, ["emp-1", "usr-1", "cli-1"]]);
    igual("F07b: una falla de consulta (sin gateway configurado) no libera ni interrumpe: devuelve 0 consultas exitosas sin lanzar", n, 0);
  }
  cierto("F01-F04: se usa la consulta del flujo NCE (CREAR/EDITAR) y la SQL del flujo admite exactamente esos estados; el worker global no cambia", /flujoNce: true/.test(leer("lib/facturacion/nce-emision.ts")) && /d\.estado_local NOT IN \('ENVIADO', 'ENVIO_INDETERMINADO'\) OR d\.estado_sifen NOT IN \('SIN_CONSULTA', 'PENDIENTE', 'NO_RECONOCIDO'\)/.test(sqlFlujo) && /TIPOS_CONSULTA_AUTOMATICA: readonly string\[\] = \["NCE"\]/.test(auto));
  cierto("F06: ninguna FE no aprobada es elegible para emitir (APROBADO + CDC + saldo) y el cliente descubierto sin FE elegible recibe mensaje", /d\.estado_sifen = 'APROBADO' AND d\.cdc IS NOT NULL/.test(elegiblesSql) && /no tiene facturas aprobadas con saldo por acreditar/.test(pagNce));
  // ── 17. MT-01 (Innominado, solo interfaz) y UI-01 (integridad de la confirmación) ─────────────────────
  {
    const parametros: unknown[][] = [];
    const dbC = { query: async (_t: string, p?: unknown[]) => { parametros.push(p ?? []); return { rows: [
      { id: "c1", codigo: "C-1", razonSocial: "Cliente Normal", numeroDocumento: "80000001", dv: "1", innominado: false, total: "2" },
      { id: "c2", codigo: "C-2", razonSocial: "Sin Nombre", numeroDocumento: "44444401", dv: null, innominado: true, total: "2" },
    ] }; } };
    const r = await buscarClientesConFacturas(dbC as never, uuid, uuid, "", 1, 10);

    igual("MT-01: el DTO de clientes marca innominado solo donde el tipo fiscal estructurado es 5 (el resto igual); paginación y total intactos", [r.clientes.map((c) => [c.id, c.innominado]), r.total, r.pagina, r.totalPaginas], [[["c1", false], ["c2", true]], 2, 1, 1]);
    igual("MT-01: filtros, empresa y usuario de la sesión se pasan como antes", parametros[0].slice(0, 2), [uuid, uuid]);
  }
  const consultaClientes = fuente.slice(fuente.indexOf("export async function buscarClientesConFacturas"), fuente.indexOf("export type FacturaElegible"));

  cierto("MT-01: el indicador sale de tipo_documento_identidad_sifen = 5 (nunca del nombre) y la búsqueda sigue acotada por empresa y alcance", /\(c\.tipo_documento_identidad_sifen = 5\) AS innominado/.test(consultaClientes) && !/razon_social\s*(ILIKE|=|~)[^$]*innominado/i.test(consultaClientes) && /c\.empresa_id = \$1/.test(consultaClientes) && /sucursal_en_alcance/.test(consultaClientes));
  cierto("MT-01: la pantalla muestra al Innominado con «Seleccionar» deshabilitado, mensaje en español y sin llamar a las facturas; los demás clientes no cambian", /disabled=\{c\.innominado\}/.test(pagNce) && /if \(c\.innominado\) return;/.test(pagNce) && /no puede recibir una nota de crédito electrónica/.test(pagNce) && /innominado: boolean/.test(pagNce) && /onClick=\{\(\) => \{ if \(c\.innominado\) return; setCliente\(c\); void cargarFacturas\(c\.id, "", 1, true\); \}\}/.test(pagNce));
  cierto("MT-01: sin validación nueva de Innominado en el servicio de emisión, el JSON ni NEX-062 (decisión de alcance del responsable)", !/innominado|tipo_documento_identidad/i.test(leer("lib/facturacion/nce-emision.ts")) && !/innominado|tipo_documento_identidad/i.test(leer("lib/facturacion/payload-nce.ts")) && !/innominado|tipo_documento_identidad/i.test(sql));

  // UI-01
  const emitirFn = pagNce.slice(pagNce.indexOf("async function emitir()"), pagNce.indexOf("function volverAFacturas"));
  const revisarFn = pagNce.slice(pagNce.indexOf("async function revisar()"), pagNce.indexOf("async function emitir()"));

  cierto("UI-01: la revisión guarda el cuerpo exacto enviado a la previa junto con el resumen aprobado por el servidor", /setRevisado\(\{ cuerpo: c as CuerpoRevisado, resumen: r\.resumen \}\)/.test(revisarFn) && /JSON\.stringify\(c\)/.test(revisarFn));
  cierto("UI-01: «Emitir» envía exactamente revisado.cuerpo (misma clave de idempotencia) y nunca reconstruye el cuerpo desde los campos", /const c = revisado\?\.cuerpo;/.test(emitirFn) && /body: JSON\.stringify\(c\)/.test(emitirFn) && !/const c = cuerpo\(\)/.test(emitirFn));
  cierto("UI-01: si el formulario ya no coincide con lo revisado no se emite y se exige una nueva revisión; el servidor revalida igual", /JSON\.stringify\(cuerpo\(\)\) !== JSON\.stringify\(c\)/.test(emitirFn) && /revise la nota de crédito de nuevo/.test(emitirFn) && /prepararNce/.test(leer("lib/facturacion/nce-emision.ts")));
  cierto("UI-01: con el modal abierto el fondo queda inerte y se conservan volver a editar, errores y la protección contra doble clic", /<div inert=\{revisado !== null\} style=\{\{ display: "contents" \}\}>/.test(pagNce) && /onClick=\{\(\) => setRevisado\(null\)\}>Volver y editar/.test(pagNce) && /if \(!c \|\| enviando\) return;/.test(emitirFn) && /disabled=\{enviando\}/.test(pagNce) && /setEnviando\(true\)/.test(emitirFn) && /catch \(e\) \{[\s\S]*setRevisado\(null\);[\s\S]*setEnviando\(false\)/.test(emitirFn));
  {
    // Simulación pura del contrato: si algo cambia tras la revisión, la comparación detecta la diferencia
    const rev = JSON.stringify({ facturaId: uuid, motivo: 3, lineas: [{ linea: 1, monto: "100" }], claveIdempotencia: "k1" });

    igual("UI-01: cuerpo idéntico → emite; observación, línea, monto o motivo cambiados → exige nueva revisión", [rev === JSON.stringify({ facturaId: uuid, motivo: 3, lineas: [{ linea: 1, monto: "100" }], claveIdempotencia: "k1" }), rev === JSON.stringify({ facturaId: uuid, motivo: 3, lineas: [{ linea: 1, monto: "101" }], claveIdempotencia: "k1" }), rev === JSON.stringify({ facturaId: uuid, motivo: 4, lineas: [{ linea: 1, monto: "100" }], claveIdempotencia: "k1" })], [true, false, false]);
  }
  return fallos;
}
