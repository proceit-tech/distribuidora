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
import { crearControlListado, entradasIniciales, etiquetaIvaLinea } from "@/lib/facturacion/nce-entradas";
import { listarFacturasElegibles } from "@/lib/facturacion/nce";
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

  cierto("R01-01: la búsqueda de clientes incluye FE aprobadas O enviadas con SIN_CONSULTA/PENDIENTE, siempre por empresa y alcance", /estado_sifen = 'APROBADO' OR \(d\.estado_local = 'ENVIADO' AND d\.estado_sifen IN \('SIN_CONSULTA', 'PENDIENTE'\)\)/.test(clientesSql) && /c\.empresa_id = \$1/.test(clientesSql) && /sucursal_en_alcance/.test(clientesSql));
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
  cierto("R02-02: las reconciliaciones del flujo (facturas y NCE) usan la función del flujo; la consulta manual y el worker siguen con la original", (leer("lib/facturacion/nce-emision.ts").match(/flujoNce: true/g) ?? []).length === 2 && /opciones\.flujoNce \? "fe_documento_registrar_consulta_flujo_nce" : "fe_documento_registrar_consulta"/.test(leer("lib/facturacion/shared.ts")) && !/flujoNce/.test(leer("lib/facturacion/consulta-automatica.ts")) && !/flujoNce/.test(leer("app/api/documentos/[id]/consultar/route.ts")));
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
  return fallos;
}
