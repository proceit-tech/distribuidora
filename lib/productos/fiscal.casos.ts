/**
 * Regresión de la evolución fiscal de Productos (NEX-039 unidades SIFEN, NEX-040 clasificación IVA, GTIN E706/E707):
 * reglas puras, validación contra una base simulada, y verificaciones estáticas de SQL, seed, reconciliación, API y pantalla.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { UNIDADES_SIFEN_TABLA5, etiquetaUnidad } from "@/lib/fiscal/unidades-sifen";
import { ErrorValidacion } from "@/lib/productos/errores";
import { coherenciaIva, proporcionEfectiva } from "@/lib/productos/fiscal";
import { formularioAPayload, formularioDesdeDetalle, formularioInicial } from "@/lib/productos/formulario";
import { normalizarProducto } from "@/lib/productos/normalizar";
import { validarReferencias } from "@/lib/productos/shared";
import type { CatalogoProductos, ProductoDetalle } from "@/types/productos";

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const U1 = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const IMP = "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1";
const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");
// Fixture de producto no vendible: la completitud fiscal del producto nuevo vendible (DEC-PRD-U02) se prueba aparte con vendible: true.
const base = { descripcion: "P", descripcionFactura: "P", unidadMedidaId: U1, vendible: false };

export async function verificarCasosFiscales(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const campo = (cuerpo: Record<string, unknown>, tasa?: string | null) => {
    try {
      normalizarProducto({ ...base, ...cuerpo }, { modo: "crear", tasaImpuesto: tasa });

      return "ok";
    } catch (e) {
      return e instanceof ErrorValidacion ? (e.campo ?? "sin-campo") : "excepcion";
    }
  };

  // ── Las cuatro afectaciones IVA (Tabla 6): combinaciones válidas
  igual("1 Gravado + tasa 10, proporción derivada 100", [coherenciaIva(1, "10.00", null), proporcionEfectiva(1, null)], [null, "100"]);
  igual("1 Gravado + tasa 5", coherenciaIva(1, "5.00", null), null);
  igual("2 Exonerado + tasa 0, proporción derivada 0", [coherenciaIva(2, "0.00", null), proporcionEfectiva(2, null)], [null, "0"]);
  igual("3 Exento + tasa 0, proporción derivada 0", [coherenciaIva(3, "0.00", null), proporcionEfectiva(3, null)], [null, "0"]);
  igual("4 Gravado parcial + tasa 10 + proporción 50", [coherenciaIva(4, "10.00", "50.0000"), proporcionEfectiva(4, "50.0000")], [null, "50.0000"]);
  igual("4 Gravado parcial + tasa 5 + proporción 0.0001", coherenciaIva(4, "5", "0.0001"), null);
  igual("4 Gravado parcial + proporción 99.9999", coherenciaIva(4, "5", "99.9999"), null);
  igual("sin clasificar no exige nada (legado)", [coherenciaIva(null, null, null), coherenciaIva(null, "10", null), proporcionEfectiva(null, null)], [null, null, null]);

  // ── Combinaciones inválidas
  igual("1 Gravado con tasa 0 rechazado", coherenciaIva(1, "0", null)?.campo, "impuestoId");
  igual("1 Gravado con tasa 7 rechazado", coherenciaIva(1, "7", null)?.campo, "impuestoId");
  igual("1 Gravado con proporción informada rechazado", coherenciaIva(1, "10", "100")?.campo, "proporcionGravadaIva");
  igual("2 Exonerado con tasa 10 rechazado", coherenciaIva(2, "10", null)?.campo, "impuestoId");
  igual("3 Exento con tasa 5 rechazado", coherenciaIva(3, "5", null)?.campo, "impuestoId");
  igual("3 Exento con proporción informada rechazado", coherenciaIva(3, "0", "0")?.campo, "proporcionGravadaIva");
  igual("4 Gravado parcial con tasa 0 rechazado", coherenciaIva(4, "0", "50")?.campo, "impuestoId");
  igual("4 Gravado parcial sin proporción rechazado", coherenciaIva(4, "10", null)?.campo, "proporcionGravadaIva");
  igual("4 Gravado parcial con proporción 0 rechazado", coherenciaIva(4, "10", "0.0000")?.campo, "proporcionGravadaIva");
  igual("4 Gravado parcial con proporción 100 rechazado", coherenciaIva(4, "10", "100.0000")?.campo, "proporcionGravadaIva");
  igual("afectación sin impuesto rechazada", coherenciaIva(1, null, null)?.campo, "impuestoId");
  igual("proporción sin afectación rechazada", coherenciaIva(null, "10", "50")?.campo, "proporcionGravadaIva");

  // ── Normalizador (formulario y servidor)
  igual("afectación 9 rechazada", campo({ afectacionIva: "9" }), "afectacionIva");
  igual("afectación vacía = sin clasificar (solo producto existente o no vendible; el nuevo vendible la exige)", normalizarProducto({ ...base, afectacionIva: "" }, { modo: "editar" }).afectacionIva, null);
  igual("afectación 4 con proporción exacta", normalizarProducto({ ...base, afectacionIva: "4", proporcionGravadaIva: "33.3333" }, { modo: "crear", tasaImpuesto: "10.00" }).proporcionGravadaIva, "33.3333");
  igual("proporción con 5 decimales rechazada (no se redondea)", campo({ afectacionIva: "4", proporcionGravadaIva: "33.33333" }, "10"), "proporcionGravadaIva");
  igual("proporción 101 rechazada", campo({ afectacionIva: "4", proporcionGravadaIva: "101" }, "10"), "proporcionGravadaIva");
  igual("formulario: afectación 2 con tasa 10 rechazada", campo({ afectacionIva: "2" }, "10.00"), "impuestoId");
  igual("formulario: afectación 3 con tasa 0 ok", campo({ afectacionIva: "3" }, "0.00"), "ok");
  igual("formulario: afectación 1 con tasa 10 ok", campo({ afectacionIva: "1" }, "10.00"), "ok");
  igual("formulario: afectación 4 sin proporción rechazada", campo({ afectacionIva: "4" }, "10.00"), "proporcionGravadaIva");
  igual("servidor (sin tasa): proporción con afectación 1 rechazada", campo({ afectacionIva: "1", proporcionGravadaIva: "100" }), "proporcionGravadaIva");
  igual("servidor (sin tasa): proporción sin afectación rechazada", campo({ proporcionGravadaIva: "50" }), "proporcionGravadaIva");
  igual("producto legado sin clasificar se acepta", campo({ impuestoId: IMP }, "0.00"), "ok");

  // ── GTIN: solo 8/12/13/14 dígitos y solo para tipos GTIN (E706/E707)
  const gtin = (tipo: string, codigo: string) => campo({ codigos: [{ tipo, codigo }] });

  for (const n of [8, 12, 13, 14]) igual(`GTIN de ${n} dígitos ok`, gtin("GTIN", "1".repeat(n)), "ok");
  for (const n of [7, 9, 10, 11, 15]) igual(`GTIN de ${n} dígitos rechazado`, gtin("GTIN", "1".repeat(n)), "codigos.0.codigo");
  igual("GTIN_EMPAQUE de 14 ok", gtin("GTIN_EMPAQUE", "1".repeat(14)), "ok");
  igual("GTIN_EMPAQUE de 10 rechazado", gtin("GTIN_EMPAQUE", "1".repeat(10)), "codigos.0.codigo");
  igual("EAN de 13 ok y de 11 rechazado", [gtin("EAN", "1".repeat(13)), gtin("EAN", "1".repeat(11))], ["ok", "codigos.0.codigo"]);
  igual("UPC de 12 ok y de 9 rechazado", [gtin("UPC", "1".repeat(12)), gtin("UPC", "1".repeat(9))], ["ok", "codigos.0.codigo"]);
  igual("GTIN con letras rechazado", gtin("GTIN", "12345678A"), "codigos.0.codigo");
  for (const tipo of ["CODIGO_ALTERNO", "SKU_PROVEEDOR", "OTRO"]) igual(`${tipo}: cualquier identificador no GTIN, sin regla de longitud`, [gtin(tipo, "AB-12"), gtin(tipo, "12345")], ["ok", "ok"]);
  igual("el código interno y el código SIFEN siguen siendo campos distintos", normalizarProducto({ ...base, codigoSifen: "SK-1", codigos: [{ tipo: "GTIN", codigo: "1".repeat(13) }] }).codigoSifen, "SK-1");
  igual("límites comerciales NO ampliados: código SIFEN 21 y descripción fiscal 121 rechazados", [campo({ codigoSifen: "x".repeat(21) }), campo({ descripcionFactura: "x".repeat(121) })], ["codigoSifen", "descripcionFactura"]);
  igual("NCM/partida/DNCP conservan sus reglas", [campo({ ncm: "12345" }), campo({ partidaArancelaria: "12" }), campo({ dncpEspecifico: "12" }), campo({ ncm: "123456", partidaArancelaria: "1234", dncpGeneral: "ABC", dncpEspecifico: "123" })], ["ncm", "partidaArancelaria", "dncpEspecifico", "ok"]);

  // ── Validación contra la base (tasa REAL del impuesto) y aislamiento por empresa
  function conexion(tasa: string | null) {
    const reg: Array<{ sql: string; parametros: unknown[] }> = [];
    const c = {
      async query(sql: string, parametros: unknown[] = []) {
        reg.push({ sql, parametros });

        if (/SELECT porcentaje::text AS porcentaje FROM impuestos/.test(sql)) return tasa === null ? { rows: [], rowCount: 0 } : { rows: [{ porcentaje: tasa }], rowCount: 1 };

        return { rows: [{ activo: true, familia_id: null }], rowCount: 1 };
      },
    } as never;

    return { c, reg };
  }
  const refs = async (cuerpo: Record<string, unknown>, tasa: string | null) => {
    const x = conexion(tasa);
    const e = await validarReferencias(x.c, EMPRESA, normalizarProducto({ ...base, impuestoId: IMP, ...cuerpo }, { modo: "editar" })).then(
      () => null,
      (err) => err as ErrorValidacion,
    );

    return { campo: e ? e.campo : "ok", reg: x.reg };
  };

  igual("BD: afectación 1 + impuesto 10 ok", (await refs({ afectacionIva: "1" }, "10.00")).campo, "ok");
  igual("BD: afectación 1 + impuesto EXE (0) rechazada", (await refs({ afectacionIva: "1" }, "0.00")).campo, "impuestoId");
  igual("BD: afectación 2 + impuesto 0 ok", (await refs({ afectacionIva: "2" }, "0.00")).campo, "ok");
  igual("BD: afectación 3 + impuesto 5 rechazada", (await refs({ afectacionIva: "3" }, "5.00")).campo, "impuestoId");
  igual("BD: afectación 4 + 50 % + impuesto 5 ok", (await refs({ afectacionIva: "4", proporcionGravadaIva: "50" }, "5.00")).campo, "ok");
  igual("BD: afectación 4 sin proporción rechazada", (await refs({ afectacionIva: "4" }, "5.00")).campo, "proporcionGravadaIva");
  igual("BD: afectación sin impuesto rechazada", (await refs({ afectacionIva: "1", impuestoId: "" }, null)).campo, "impuestoId");
  igual("BD: producto legado EXE sin clasificar sigue válido (no se reclasifica)", (await refs({}, "0.00")).campo, "ok");
  const ref = await refs({ afectacionIva: "1" }, "10");

  cierto("catálogos propios se consultan por empresa; impuestos y unidades son globales", ref.reg.filter((q) => /FROM (categorias_producto|marcas_producto|familias_producto|depositos|proveedores)/.test(q.sql)).every((q) => /empresa_id = \$2/.test(q.sql)) && !/empresa_id/.test(ref.reg.find((q) => /FROM impuestos/.test(q.sql))?.sql ?? ""));

  // ── Catálogo oficial de unidades: Tabla 5 del MT v150 (34) + NT023 §3.1 (30) = 64 entradas, claves por código
  const T = UNIDADES_SIFEN_TABLA5;

  igual("64 unidades: 34 del MT v150 + 30 de la NT023", T.length, 64);
  const ANTIGUAS = [87, 2366, 2329, 110, 77, 86, 89, 90, 91, 92, 93, 94, 96, 79, 97, 98, 99, 100, 101, 104, 103, 108, 109, 95, 666, 102, 83, 88, 625, 660, 885, 891, 869, 569];

  igual("se preservan, en su orden, los 34 códigos anteriores", T.slice(0, 34).map((u) => u.codigo), ANTIGUAS);
  igual("las 30 nuevas son los códigos 111–140 consecutivos (NT023)", T.slice(34).map((u) => u.codigo), Array.from({ length: 30 }, (_, i) => 111 + i));
  igual("Caja es 131/BX y Docena es 113/DOC (NT023)", [T.find((u) => u.codigo === 131), T.find((u) => u.codigo === 113)], [{ codigo: 131, representacion: "BX", descripcion: "Caja" }, { codigo: 113, representacion: "DOC", descripcion: "Docena" }]);
  igual("representaciones tal como figuran en la NT023", T.slice(34).map((u) => u.representacion), ["4A", "Ci", "DOC", "GLL", "GRO", "E4", "KT", "M5", "MCU", "MIL", "PAR", "FOT", "FTK", "PCE", "KLT", "RM", "RO", "kWh", "U(JGO)", "DR", "BX", "SET", "PK", "BG", "DPC", "JR", "BL", "AB", "BK", "BW"]);
  igual("códigos únicos", new Set(T.map((u) => u.codigo)).size, 64);
  igual("Metros figura con 87/m y 108/MT (no se deduplica por nombre)", T.filter((u) => u.descripcion === "Metros").map((u) => [u.codigo, u.representacion]), [[87, "m"], [108, "MT"]]);
  igual("ml (660) y ML (88) coexisten", [T.find((u) => u.codigo === 660)?.representacion, T.find((u) => u.codigo === 88)?.representacion], ["ml", "ML"]);
  cierto("E709 numérico 1–5 y E710 de 1–10 caracteres", T.every((u) => u.codigo >= 1 && u.codigo <= 99999 && u.representacion.length >= 1 && u.representacion.length <= 10));
  igual("Litros es 89/LT", T.find((u) => u.codigo === 89), { codigo: 89, representacion: "LT", descripcion: "Litros" });
  igual("la etiqueta muestra código y representación SIFEN", etiquetaUnidad({ codigo: "LT", nombre: "Litro", sifenCodigo: 89, sifenRepresentacion: "LT" }), "LT · Litro (SIFEN 89 · LT)");
  igual("unidad sin equivalencia: la etiqueta no inventa nada", etiquetaUnidad({ codigo: "CJ", nombre: "Caja", sifenCodigo: null, sifenRepresentacion: "" }), "CJ · Caja");

  const n39 = leer("documentacao/banco/nexit/v1/migraciones/NEX-039-unidades-medida-sifen.sql");
  const filasSql = [...n39.matchAll(/^ {2}\((\d+), '([^']+)', '([^']+)'(?:, '[A-Z0-9-]+')?\)/gm)].map((m) => ({ codigo: Number(m[1]), representacion: m[2], descripcion: m[3] }));

  igual("NEX-039 (inmutable, ya aplicada) carga exactamente las 34 unidades de la Tabla 5 en el mismo orden", filasSql, T.slice(0, 34));
  const n43 = leer("documentacao/banco/nexit/v1/migraciones/NEX-043-unidades-medida-sifen-nt023.sql");
  const filasSql43 = [...n43.matchAll(/^ {2}\((\d+), '([^']+)', '([^']+)'(?:, '[A-Z0-9-]+')?\)/gm)].map((m) => ({ codigo: Number(m[1]), representacion: m[2], descripcion: m[3] }));

  igual("NEX-043 agrega exactamente las 30 unidades de la NT023 (111–140) y NEX-039 + NEX-043 = catálogo TS de 64", [filasSql43, [...filasSql, ...filasSql43]], [T.slice(34), T]);
  cierto("NEX-039 conserva el checksum confirmado en el banco real (SHA-256 del archivo restaurado)", createHash("sha256").update(readFileSync(join(raiz, "documentacao/banco/nexit/v1/migraciones/NEX-039-unidades-medida-sifen.sql"))).digest("hex") === "6d5a5d3dea0f00521ab9a2bdcb5bb4722f187069a94198d12ae84793f6e38dab");
  cierto("NEX-043: incremental y no destructivo (solo INSERT de 111–140 con fuente NT023-T5; sin ALTER/DROP/UPDATE/DELETE), exige NEX-039 y no se reaplica", (n43.replace(/--.*$/gm, "").match(/^\s+\(\d+,.*'NT023-T5'\)/gm) ?? []).length === 30 && !/\b(ALTER|DROP|UPDATE|DELETE|TRUNCATE)\b/.test(n43.replace(/--.*$/gm, "")) && /requiere NEX-039/.test(n43) && /NEX-043 parece aplicada/.test(n43) && !/unidades_medida\b(?!_sifen)/.test(n43.replace(/--.*$/gm, "")));
  const r43 = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-043.sql");

  cierto("reversión NEX-043: aborta si hay vínculos 111–140 y solo retira las 30 filas NT023", /unidad_sifen_codigo BETWEEN 111 AND 140\) THEN\s+RAISE EXCEPTION/.test(r43) && /DELETE FROM public\.unidades_medida_sifen WHERE codigo BETWEEN 111 AND 140 AND fuente = 'NT023-T5'/.test(r43));
  cierto("NEX-039: sin filas NT023 (van en NEX-043) y las 34 del MT con la fuente por defecto", (n39.match(/NT023-T5/g) ?? []).length === 0 && /fuente\s+text\s+NOT NULL DEFAULT 'MT150-T5'/.test(n39));
  cierto("NEX-039 sigue sin vincular unidades existentes ni elegir Metro", !/UPDATE public\.unidades_medida/.test(n39.replace(/--.*$/gm, "")) && !/'MT'/.test(n39.replace(/--.*$/gm, "").replace(/\(108, 'MT'[^)]*\)/, "")));
  cierto("NEX-039: clave en el código; sin UNIQUE sobre representación ni descripción", /codigo\s+integer\s+PRIMARY KEY/.test(n39) && !/UNIQUE[^;]*(representacion|descripcion)/i.test(n39.replace(/--.*$/gm, "")));
  cierto("NEX-039: vínculo N:1 nullable con FK; no borra ni renombra unidades", /ADD COLUMN unidad_sifen_codigo integer[^;]*REFERENCES public\.unidades_medida_sifen \(codigo\)/.test(n39) && !/DROP COLUMN|DELETE FROM|UPDATE public\.unidades_medida SET/.test(n39.replace(/--.*$/gm, "")));
  cierto("NEX-039: columnas legadas son espejo (una sola fuente de verdad) y no se eliminan", /unidades_medida_espejo_sifen_trg/.test(n39) && /NEW\.codigo_sifen := NEW\.unidad_sifen_codigo::text/.test(n39) && !/DROP COLUMN/.test(n39));
  cierto("NEX-039: no vincula ninguna unidad existente (lo hace la reconciliación)", !/UPDATE public\.unidades_medida/.test(n39.replace(/--.*$/gm, "")));
  cierto("NEX-039: pre-condiciones y registro de reconciliación", /requiere NEX-003/.test(n39) && /CREATE TABLE public\.fiscal_reconciliacion_log/.test(n39));
  const r39 = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-039.sql");

  cierto("reversión NEX-039 aborta si hay vínculos o registro de reconciliación", /unidad_sifen_codigo IS NOT NULL\) THEN\s+RAISE EXCEPTION/.test(r39) && /fiscal_reconciliacion_log\) THEN\s+RAISE EXCEPTION/.test(r39));

  // ── Seed para instalaciones nuevas
  const seed = leer("documentacao/banco/nexit/v1/seeds/S-001-catalogos-globales.sql");
  const bloque = /INSERT INTO unidades_medida[\s\S]*?ON CONFLICT \(codigo\) DO NOTHING;/.exec(seed)?.[0] ?? "";

  cierto("seed: UN→77, KG→83, LT→89", /\('UN','Unidad',77\)/.test(bloque) && /\('KG','Kilogramo',83\)/.test(bloque) && /\('LT','Litro',89\)/.test(bloque));
  cierto("seed: CJ→131 (BX) y DOC→113 (DOC); Metro SIN vínculo (decisión pendiente); nada de 86/87", /\('CJ','Caja',131\)/.test(bloque) && /\('DOC','Docena',113\)/.test(bloque) && /\('MT','Metro',NULL\)/.test(bloque) && !/'8[67]'|codigo_sifen/.test(bloque));
  cierto("seed: UN→77, KG→83, LT→89 conservados", /\('UN','Unidad',77\)/.test(bloque) && /\('KG','Kilogramo',83\)/.test(bloque) && /\('LT','Litro',89\)/.test(bloque));
  cierto("seed: no altera unidades existentes", /ON CONFLICT \(codigo\) DO NOTHING/.test(bloque));

  // ── Reconciliación separada, idempotente, con registro y sin ambigüedades
  const rec = leer("documentacao/banco/nexit/v1/scripts/reconciliar-unidades-sifen-NEX-039.sql");
  const regla = /VALUES \(('UN'[^)]*\)(?:, \('[A-Z]+'[^)]*\))*)/.exec(rec)?.[0] ?? "";
  const sinComentarios = (t: string) => t.replace(/--.*$/gm, "");

  cierto("reconciliación unidades: UN, KG, LT, CJ (131) y DOC (113) por código y nombre exactos; Metro NO", /\('UN', 'unidad', 77\)/.test(regla) && /\('KG', 'kilogramo', 83\)/.test(regla) && /\('LT', 'litro', 89\)/.test(regla) && /\('CJ', 'caja', 131\)/.test(regla) && /\('DOC', 'docena', 113\)/.test(regla) && !/'MT'/.test(regla));
  cierto("reconciliación unidades idempotente y con registro antes/después", /unidad_sifen_codigo IS NULL/.test(rec) && (rec.match(/INSERT INTO public\.fiscal_reconciliacion_log/g) ?? []).length === 1 && /antes, despues/.test(rec));
  cierto("PRD-AUD-06: la reconciliación de unidades NO reclasifica productos ni toca impuestos", !/UPDATE public\.(productos|impuestos)|afectacion_iva\s*=/.test(sinComentarios(rec)));
  cierto("reconciliación: informes de solo lectura (unidades, código legado sin vínculo, GTIN, IVA pendiente)", /SELECT 'unidad sin equivalencia SIFEN'/.test(rec) && /código SIFEN LEGADO sin vínculo canónico/.test(rec) && /SELECT 'GTIN con longitud no admitida/.test(rec) && /NO se reclasifica/.test(rec));
  cierto("reconciliación no toca stock, costos, presentaciones ni movimientos", !/stock_saldos|inventario_costos|movimiento|producto_unidades|precio/i.test(sinComentarios(rec)));

  // PRD-AUD-06: la reclasificación IVA es otro script, que aborta sin autorización expresa y nadie ejecuta solo
  const recl = leer("documentacao/banco/nexit/v1/scripts/reclasificar-iva-productos-NEX-040.sql");
  const reclSql = sinComentarios(recl);

  cierto("reclasificación IVA: la primera sentencia es la guarda de autorización expresa", reclSql.indexOf("nex.autorizacion_reclasificacion") >= 0 && reclSql.indexOf("nex.autorizacion_reclasificacion") < reclSql.indexOf("UPDATE public.productos") && /RAISE EXCEPTION 'Reclasificación IVA no autorizada/.test(recl));
  cierto("reclasificación IVA: solo IVA10/IVA5 → Gravado, idempotente, con registro; EXE intacto", /i\.codigo = 'IVA10' AND i\.porcentaje = 10/.test(recl) && /i\.codigo = 'IVA5' AND i\.porcentaje = 5/.test(recl) && /p\.afectacion_iva IS NULL/.test(recl) && /fiscal_reconciliacion_log/.test(recl) && !/'EXE'/.test(reclSql));
  const invocadores = ["documentacao/banco/nexit/v1/scripts/aplicar-migraciones.sh", "documentacao/banco/nexit/v1/implantacion/vm/nexit-db-remote.sh", "documentacao/banco/nexit/v1/scripts/ejecutar-pruebas.sh", "documentacao/banco/nexit/v1/seeds/S-001-catalogos-globales.sql", "documentacao/banco/nexit/v1/migraciones/NEX-039-unidades-medida-sifen.sql", "documentacao/banco/nexit/v1/migraciones/NEX-040-productos-clasificacion-iva.sql"];

  for (const r of invocadores) cierto(`${r.split("/").pop()}: no ejecuta la reclasificación IVA`, !/\b(psql|\\i|\\ir)\b[^\n]*reclasificar-iva/.test(sinComentarios(leer(r))));
  const n40doc = leer("documentacao/banco/nexit/v1/migraciones/NEX-040-productos-clasificacion-iva.sql");

  cierto("NEX-040 ya no promete reclasificar y apunta al script protegido", !/reconciliar-fiscal/.test(n40doc) && /aborta sin autorización expresa/.test(n40doc));

  // ── NEX-040
  const n40 = leer("documentacao/banco/nexit/v1/migraciones/NEX-040-productos-clasificacion-iva.sql");

  cierto("NEX-040: afectación 1–4 y proporción 0<x<100", /afectacion_iva IN \(1, 2, 3, 4\)/.test(n40) && /proporcion_gravada_iva > 0 AND proporcion_gravada_iva < 100/.test(n40));
  cierto("NEX-040: proporción solo con afectación 4 (y obligatoria)", /afectacion_iva = 4 AND proporcion_gravada_iva IS NOT NULL/.test(n40) && /afectacion_iva IS DISTINCT FROM 4 AND proporcion_gravada_iva IS NULL/.test(n40));
  cierto("NEX-040: trigger de tasa 5/10 (1 y 4) y 0 (2 y 3) contra impuestos.porcentaje", /afectacion_iva IN \(1, 4\) AND v_tasa NOT IN \(5, 10\)/.test(n40) && /afectacion_iva IN \(2, 3\) AND v_tasa <> 0/.test(n40));
  cierto("NEX-040: no reclasifica ni toca impuestos/EXE/stock/precios; sin columnas E735–E737", !/UPDATE public\.(productos|impuestos) SET|INSERT INTO public\.impuestos|dBasGravIVA|base_gravada|liquidacion/i.test(n40.replace(/--.*$/gm, "")));
  cierto("NEX-040: la tasa de un impuesto en uso no cambia", /impuestos_tasa_en_uso_trg/.test(n40));
  cierto("NEX-040: pre-condiciones", /requiere NEX-007 y NEX-039/.test(n40));
  cierto("reversión NEX-040 aborta si hay clasificación", /afectacion_iva IS NOT NULL OR proporcion_gravada_iva IS NOT NULL\) THEN\s+RAISE EXCEPTION/.test(leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-040.sql")));

  // ── API y persistencia
  const lista = leer("app/api/productos/route.ts");
  const ficha = leer("app/api/productos/[id]/route.ts");
  const shared = leer("lib/productos/shared.ts");

  cierto("API catálogos: unidades con código y representación SIFEN (vínculo, no columnas legadas)", /LEFT JOIN unidades_medida_sifen s ON s\.codigo = u\.unidad_sifen_codigo/.test(lista) && !/u\.codigo_sifen|descripcion_sifen/.test(lista));
  cierto("API GET: afectación y proporción como texto", /afectacion_iva::text/.test(ficha) && /proporcion_gravada_iva::text/.test(ficha));
  cierto("POST/PUT persisten la clasificación en las columnas editables", /\["afectacion_iva", d\.afectacionIva\]/.test(shared) && /\["proporcion_gravada_iva", d\.proporcionGravadaIva\]/.test(shared));
  cierto("PRD-AUD-01 intacto: eliminar → producto → guardar", ficha.indexOf("eliminarHijos(") < ficha.indexOf("UPDATE productos SET") && ficha.indexOf("UPDATE productos SET") < ficha.indexOf("guardarHijos("));

  // ── Pantalla: fuente única y avisos sin bloquear
  const sifen = leer("app/(private)/productos/_components/pestanas/sifen.tsx");
  const info = leer("app/(private)/productos/_components/pestanas/informacion.tsx");

  cierto("SIFEN no edita descripción ni unidad base (solo espejos)", !/ctx\.set\("descripcionFactura"|ctx\.set\("unidadMedidaId"/.test(sifen));
  cierto("Información no edita país, impuesto ni afectación (viven en SIFEN)", !/ctx\.set\("paisOrigenCodigo"|ctx\.set\("impuestoId"|ctx\.set\("afectacionIva"/.test(info));
  cierto("SIFEN edita país, impuesto, afectación y proporción una sola vez", (sifen.match(/ctx\.set\("paisOrigenCodigo"/g) ?? []).length === 1 && (sifen.match(/ctx\.set\("impuestoId"/g) ?? []).length === 1 && (sifen.match(/ctx\.set\("afectacionIva"/g) ?? []).length === 1);
  cierto("aviso sin equivalencia: al editar no bloquea; al crear un vendible lo informa (DEC-PRD-U02)", /Sin equivalencia SIFEN configurada/.test(sifen) && !/no podrá emitirse/.test(sifen) && /Al editar no se bloquea/.test(sifen));
  cierto("cinco bloques: identificación, IVA, unidad SIFEN, NCM/DNCP, GTIN", ["Identificación fiscal del producto", "Clasificación y afectación IVA", "Unidad de medida SIFEN", "NCM, partida arancelaria y DNCP", "GTIN y códigos adicionales"].every((t) => sifen.includes(t)));
  cierto("sin estimar E735–E737 en pantalla", !/E735|dBasGravIVA|base gravada/i.test(sifen.replace(/\(E735–E737\)/, "")));

  // ── Formulario ↔ contrato, datos legados
  const cat = { categorias: [], marcas: [], familias: [], lineas: [], monedaReferencia: "PYG", unidades: [], impuestos: [{ id: IMP, codigo: "IVA10", nombre: "IVA 10 %", porcentaje: "10.00" }], proveedores: [], depositos: [], paises: [], monedas: [], productos: [] } as CatalogoProductos;
  const nuevo = formularioInicial(cat);

  igual("producto nuevo: sugiere IVA 10 % Gravado (solo para nuevos)", [nuevo.impuestoId, nuevo.afectacionIva, nuevo.proporcionGravadaIva], [IMP, "1", ""]);
  const legado = formularioDesdeDetalle({ ...({} as ProductoDetalle), codigo: "PRD-1", codigoInventario: "", codigoSifen: "", codigoBarras: "", descripcion: "X", descripcionFactura: "X", tipoProducto: "MERCADERIA", categoriaId: "", marcaId: "", familiaId: "", lineaId: "", procedencia: "", unidadMedidaId: U1, impuestoId: IMP, afectacionIva: "", proporcionGravadaIva: "", controlaStock: true, modoControlStock: "CANTIDAD", permiteTerceros: false, requiereVencimiento: false, stockMinimo: "0.0000", stockMaximo: "", puntoReposicion: "", precioVentaReferencia: null, partidaArancelaria: "", ncm: "", dncpGeneral: "", dncpEspecifico: "", paisOrigenCodigo: "PRY", informacionFactura: "", relacionMercaderia: "", porcentajeMerma: "", cantidadMerma: "", vendible: true, comprable: true, requiereInspeccionCalidad: false, vidaUtilDias: "", pesoNetoKg: "", pesoBrutoKg: "", largoCm: "", anchoCm: "", altoCm: "", volumenM3: "", imagenUrl: "", observacion: "", activo: true, codigos: [], unidades: [], proveedores: [], depositos: [], alternativos: [], componentes: [], documentos: [] });

  igual("producto legado: se carga sin clasificar y se guarda sin forzar una afectación", [legado.afectacionIva, normalizarProducto(formularioAPayload(legado, "editar"), { modo: "editar", tasaImpuesto: "10.00" }).afectacionIva], ["", null]);
  igual("ciclo clasificado: afectación 4 conserva la proporción exacta", normalizarProducto(formularioAPayload({ ...legado, afectacionIva: "4", proporcionGravadaIva: "12.3456" }, "editar"), { modo: "editar", tasaImpuesto: "5.00" }).proporcionGravadaIva, "12.3456");


  // ══ ENTREGA 01 (AUD-PRODUCTOS-V1 §XXI): integridad fiscal del producto NUEVO vendible (DEC-PRD-U02 / U06; PRD-A02, A15, A16, A26) ═════════════════
  const vend = { ...base, vendible: true };
  const campoV = (cuerpo: Record<string, unknown>, opciones: Record<string, unknown> = {}) => {
    try {
      normalizarProducto({ ...vend, ...cuerpo }, { modo: "crear", ...opciones } as never);

      return "ok";
    } catch (e) {
      return e instanceof ErrorValidacion ? (e.campo ?? "sin-campo") : "excepcion";
    }
  };
  const completo = { impuestoId: IMP, afectacionIva: "1" };

  igual("A26/U02: producto NUEVO vendible sin afectación IVA o sin impuesto NO se normaliza (campo exacto); completo sí", [campoV({}), campoV({ impuestoId: IMP }), campoV({ afectacionIva: "1" }, { tasaImpuesto: "10.00" }), campoV(completo, { tasaImpuesto: "10.00" })], ["afectacionIva", "afectacionIva", "impuestoId", "ok"]);
  igual("U02: servicios también; vendible por omisión (no enviado) cuenta como vendible", [campoV({ tipoProducto: "SERVICIO" }), campoV({ vendible: undefined }), campoV({ tipoProducto: "SERVICIO", ...completo }, { tasaImpuesto: "10.00" })], ["afectacionIva", "afectacionIva", "ok"]);
  igual("U02: no vendibles, KIT y ACTIVO_FIJO nuevos no quedan obligados fiscalmente por esta regla", [campoV({ vendible: false }), campoV({ tipoProducto: "KIT" }), campoV({ tipoProducto: "ACTIVO_FIJO" })], ["ok", "ok", "ok"]);
  igual("legado: la EDICIÓN de un vendible sin clasificar sigue permitida (sin reclasificar en silencio)", (() => { try { return normalizarProducto({ ...vend }, { modo: "editar" }).afectacionIva; } catch { return "error"; } })(), null);
  igual("U06: 5 %, exonerado, exento y parcial se aceptan con su tasa; combinación inválida o parcial sin proporción se rechazan", [
    campoV({ impuestoId: IMP, afectacionIva: "1" }, { tasaImpuesto: "5.00" }), campoV({ impuestoId: IMP, afectacionIva: "2" }, { tasaImpuesto: "0.00" }), campoV({ impuestoId: IMP, afectacionIva: "3" }, { tasaImpuesto: "0.00" }),
    campoV({ impuestoId: IMP, afectacionIva: "4", proporcionGravadaIva: "50" }, { tasaImpuesto: "10.00" }), campoV({ impuestoId: IMP, afectacionIva: "4" }, { tasaImpuesto: "10.00" }), campoV({ impuestoId: IMP, afectacionIva: "2" }, { tasaImpuesto: "10.00" }),
  ], ["ok", "ok", "ok", "ok", "proporcionGravadaIva", "impuestoId"]);
  igual("A02: la unidad base del producto nuevo vendible debe tener código SIFEN existente y vigente (cliente: campo unidadMedidaId); undefined = lo verifica el servidor", [
    campoV(completo, { tasaImpuesto: "10.00", unidadFiscal: null }), campoV(completo, { tasaImpuesto: "10.00", unidadFiscal: { sifenCodigo: null } }), campoV(completo, { tasaImpuesto: "10.00", unidadFiscal: { sifenCodigo: 77, sifenVigente: false } }),
    campoV(completo, { tasaImpuesto: "10.00", unidadFiscal: { sifenCodigo: 77, sifenVigente: true } }), campoV(completo, { tasaImpuesto: "10.00" }), campoV({ vendible: false }, { unidadFiscal: { sifenCodigo: null } }),
  ], ["unidadMedidaId", "unidadMedidaId", "unidadMedidaId", "ok", "ok", "ok"]);

  // Servidor: validarReferencias consulta la base (unidad con SIFEN existente y vigente) solo cuando se le pide
  const consultasU: string[] = [];
  const baseUnidad = (u: Record<string, unknown> | null) => ({
    async query(sql: string) {
      consultasU.push(sql);
      if (/FROM unidades_medida x LEFT JOIN unidades_medida_sifen/.test(sql)) return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
      if (/SELECT porcentaje::text AS porcentaje FROM impuestos/.test(sql)) return { rows: [{ porcentaje: "10.00" }], rowCount: 1 };

      return { rows: [{ activo: true, familia_id: null }], rowCount: 1 };
    },
  }) as never;
  const refsU = async (u: Record<string, unknown> | null, exigir: boolean) => {
    const d = normalizarProducto({ ...vend, ...completo }, { modo: "crear", tasaImpuesto: "10.00" });

    return validarReferencias(baseUnidad(u), EMPRESA, d, {}, { exigirUnidadSifen: exigir }).then(() => "ok", (e) => (e instanceof ErrorValidacion ? `${e.campo}|${e.message}` : "excepcion"));
  };

  consultasU.length = 0;

  const rSin = await refsU({ codigo: "CJ", nombre: "Caja", sifenCodigo: null, sifenVigente: null }, true);
  const rHuerfano = await refsU({ codigo: "X", nombre: "X", sifenCodigo: 999, sifenVigente: null }, true);
  const rNoVigente = await refsU({ codigo: "X", nombre: "X", sifenCodigo: 87, sifenVigente: false }, true);
  const rOk = await refsU({ codigo: "UN", nombre: "Unidad", sifenCodigo: 77, sifenVigente: true }, true);

  igual("A02/A16 servidor: unidad sin código SIFEN, con código inexistente o no vigente se rechaza con campo unidadMedidaId; con código vigente pasa", [rSin.split("|")[0], /sin|no tiene equivalencia SIFEN/.test(rSin), rHuerfano.split("|")[0], /no existe en el catálogo oficial/.test(rHuerfano), rNoVigente.split("|")[0], /no está vigente/.test(rNoVigente), rOk], ["unidadMedidaId", true, "unidadMedidaId", true, "unidadMedidaId", true, "ok"]);
  consultasU.length = 0;
  igual("legado/edición: sin la opción no se consulta el catálogo SIFEN (una unidad sin código no bloquea editar otros datos)", [await refsU({ codigo: "CJ", nombre: "Caja", sifenCodigo: null, sifenVigente: null }, false), consultasU.some((q) => /unidades_medida_sifen/.test(q))], ["ok", false]);
  igual("A02: unidad inexistente en la base → mensaje de unidad sin equivalencia (nunca se infiere un vínculo)", (await refsU(null, true)).split("|")[0], "unidadMedidaId");

  const postRuta = leer("app/api/productos/route.ts");
  const postBloque = postRuta.slice(postRuta.indexOf("export async function POST"));
  const putRuta = leer("app/api/productos/[id]/route.ts");
  const normSrc = leer("lib/productos/normalizar.ts");

  cierto("POST: la exigencia fiscal (esVendibleFiscal) se valida contra la base dentro de la transacción, ANTES del INSERT y de la apertura de inventario; el PUT legado no la usa", /exigirUnidadSifen: esVendibleFiscal\("crear", datos\.tipoProducto, datos\.vendible\)/.test(postBloque) && postBloque.indexOf("validarReferencias(") > postBloque.indexOf('"BEGIN"') && postBloque.indexOf("validarReferencias(") < postBloque.indexOf("INSERT INTO productos") && postBloque.indexOf("validarReferencias(") < postBloque.indexOf("guardarHijos(") && !/exigirUnidadSifen/.test(putRuta));
  cierto("sin reclasificación silenciosa: ninguna migración ni UPDATE masivo; solo se exige en modo crear", /modo === "crear" && vendible/.test(normSrc) && !/UPDATE productos SET afectacion_iva/.test(postRuta + putRuta + leer("lib/productos/shared.ts")));
  cierto("catálogo del formulario expone la vigencia SIFEN de la unidad y el formulario la verifica antes de enviar; la pantalla ya no dice que no impide guardar", /s\.vigente AS "sifenVigente"/.test(postRuta) && /unidadFiscal:/.test(leer("app/(private)/productos/_components/producto-form.tsx")) && !/No impide guardar el producto/.test(leer("app/(private)/productos/_components/pestanas/sifen.tsx")) && /no se puede crear un producto vendible con ella/.test(leer("app/(private)/productos/_components/pestanas/sifen.tsx")));

  // U06: IVA 10 % Gravado como sugerencia editable
  const catSin10 = { ...cat, impuestos: [{ id: IMP, codigo: "IVA5", nombre: "IVA 5 %", porcentaje: "5.00" }] };

  igual("U06: sin impuesto del 10 % activo no se pre-selecciona nada (el usuario debe elegir); con 10 % se sugiere y es editable", [formularioInicial(catSin10 as never).afectacionIva, formularioInicial(catSin10 as never).impuestoId, formularioInicial(cat as never).afectacionIva], ["", "", "1"]);

  return fallos;
}
