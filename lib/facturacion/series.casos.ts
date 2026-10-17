/**
 * NEX-063 — puntos por tipo documental, series SIFEN y paso atómico entre series (DECISION-PUNTOS-TIPOS-SERIES-2026-10-17). Sin red y sin PostgreSQL: la migración, T27 y T28 NO se ejecutaron aquí (las
 * corre el runner del responsable sobre una base descartable). Se verifica la lógica pura de series (TypeScript), el texto versionado de SQL/reversión/scripts y las capas de aplicación que seleccionan
 * por tipo. No prueba comportamiento real de PostgreSQL ni concurrencia real.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { compararNumeracion, esSerieValida, numeracionSiguiente, NUMERO_MAXIMO, ordenSerie, serieSiguiente, textoNumeracion } from "@/lib/facturacion/series";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");
const sinComentarios = (t: string) => t.replace(/--.*$/gm, "");

export async function verificarCasosSeries(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const lanza = (f: () => unknown) => { try { f(); return false; } catch { return true; } };

  // ── 1. Lógica pura de series (CA-02) ─────────────────────────────────────────────────────────────
  igual("CA-02: sin serie 9999998 → 9999999 (sin serie); 9999999 → AA-0000001", [numeracionSiguiente(null, 9999998), numeracionSiguiente(null, 9999999)], [{ serie: null, numero: 9999999 }, { serie: "AA", numero: 1 }]);
  igual("CA-02: AA 9999999 → AB-0000001; AZ → BA; ZY → ZZ; ZZ 9999999 → agotada (null)", [numeracionSiguiente("AA", 9999999), numeracionSiguiente("AZ", 9999999), numeracionSiguiente("ZY", 9999999), numeracionSiguiente("ZZ", 9999999)], [{ serie: "AB", numero: 1 }, { serie: "BA", numero: 1 }, { serie: "ZZ", numero: 1 }, null]);
  igual("dentro de una serie solo avanza el número; el primero de una identidad nueva (0) es 0000001 sin serie", [numeracionSiguiente("AC", 5), numeracionSiguiente(null, 0)], [{ serie: "AC", numero: 6 }, { serie: null, numero: 1 }]);
  igual("la recorrida completa de series es estricta y sin saltos: null, AA…AZ, BA…ZZ (676 series) y termina en ZZ", (() => {
    const vistas: Array<string | null> = [null];
    let s: string | null = null;

    for (;;) {
      const n = serieSiguiente(s);

      if (n === null) break;

      vistas.push(n);
      s = n;
    }

    return [vistas.length, vistas[1], vistas[26], vistas[27], vistas[vistas.length - 1], vistas.every((x, i) => ordenSerie(x) === i), new Set(vistas).size === vistas.length];
  })(), [677, "AA", "AZ", "BA", "ZZ", true, true]);
  igual("texto de la numeración: «0000001» sin serie, «AA-0000001» con serie; comparación por (serie, número)", [textoNumeracion(null, 1), textoNumeracion("AA", 1), textoNumeracion("ZZ", 9999999), compararNumeracion({ serie: null, numero: 9999999 }, { serie: "AA", numero: 1 }) < 0, compararNumeracion({ serie: "AB", numero: 1 }, { serie: "AA", numero: 9999999 }) > 0, compararNumeracion({ serie: "AA", numero: 5 }, { serie: "AA", numero: 5 })], ["0000001", "AA-0000001", "ZZ-9999999", true, true, 0]);
  cierto("entradas inválidas se rechazan (serie en minúscula/larga, número fuera de 0…9999999); 9999999 es un valor final VÁLIDO (no se trunca a 9999998)", lanza(() => numeracionSiguiente("aa", 1)) && lanza(() => numeracionSiguiente("AAA", 1)) && lanza(() => numeracionSiguiente(null, -1)) && lanza(() => numeracionSiguiente(null, 10000000)) && !lanza(() => numeracionSiguiente(null, NUMERO_MAXIMO)) && esSerieValida("AB") && !esSerieValida("A1") && !esSerieValida(null));

  // ── 2. Migración NEX-063 (texto) ─────────────────────────────────────────────────────────────────
  const mig = leer("documentacao/banco/nexit/v1/migraciones/NEX-063-facturacion-puntos-tipos-series.sql");
  const sql = sinComentarios(mig);
  const rev = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-063.sql");
  const fn = (nombre: string) => { const i = sql.indexOf("FUNCTION public." + nombre); return sql.slice(i, sql.indexOf("END $$;", i)); };

  cierto("NEX-063 incremental: exige NEX-060/061/062, no se reaplica por suposición, estado «NO aplicada», y no toca migraciones previas (sin ALTER/DROP de datos de documentos)", /requiere NEX-060, NEX-061 y NEX-062/.test(mig) && /parece aplicada/.test(mig) && /NO aplicada/.test(mig) && !/DROP TABLE|TRUNCATE (?!ON)|DELETE FROM|ALTER TABLE public\.documentos_electronicos/i.test(sql));
  cierto("columnas: serie (NULL o dos letras A–Z) y activo (default true: lo existente sigue emitiendo); la identidad (empresa, punto, tipo) no cambia", /ADD COLUMN serie text CHECK \(serie IS NULL OR serie ~ '\^\[A-Z\]\{2\}\$'\)/.test(sql) && /ADD COLUMN activo boolean NOT NULL DEFAULT true/.test(sql));
  const sig = fn("fe_secuencia_siguiente");

  cierto("SQL fe_secuencia_siguiente: 9999999 sin serie → AA; AA..ZY siguiente letra; xZ → (x+1)A; ZZ → agotada (NULL, NULL); rango 0…9999999 (espejo de series.ts)", /p_ultimo < 9999999/.test(sig) && /'AA'::text, 1/.test(sig) && /p_serie = 'ZZ'/.test(sig) && /NULL::text, NULL::integer/.test(sig) && /substr\(p_serie, 2, 1\) < 'Z'/.test(sig) && /chr\(ascii\(substr\(p_serie, 2, 1\)\) \+ 1\), 1/.test(sig) && /chr\(ascii\(substr\(p_serie, 1, 1\)\) \+ 1\) \|\| 'A', 1/.test(sig) && /NOT BETWEEN 0 AND 9999999/.test(sig));
  const res = fn("fe_secuencia_reservar");

  cierto("reserva atómica: FOR UPDATE de la fila de la secuencia del TIPO, tipo inactivo → NEX:TIPO_INACTIVO, sin configurar → NEX:SECUENCIA_NO_CONFIGURADA, ZZ-9999999 → NEX:NUMERACION_AGOTADA y UPDATE de serie+número en la misma sentencia (sin reinicio)", /tipo_documento = p_tipo FOR UPDATE/.test(res) && /NEX:TIPO_INACTIVO/.test(res) && /NEX:SECUENCIA_NO_CONFIGURADA/.test(res) && /NEX:NUMERACION_AGOTADA/.test(res) && /SET serie = v_sig\.o_serie, ultimo_numero = v_sig\.o_numero/.test(res) && /SECURITY DEFINER/.test(res));
  const trg = fn("fe_secuencias_inmutable");

  cierto("trigger: (serie, número) nunca retrocede, la identidad es inmutable, no se elimina ni se vacía (salvo reinicio DEMO) y activo puede alternarse", /fe_serie_orden\(NEW\.serie\) < public\.fe_serie_orden\(OLD\.serie\)/.test(trg) && /NEW\.ultimo_numero < OLD\.ultimo_numero/.test(trg) && /son inmutables/.test(trg) && /nex_reinicio_demo_activo/.test(trg) && /no se elimina ni se vacía/.test(trg));
  const crearFe = fn("fe_documento_crear_fe");
  const crearNce = fn("fe_documento_crear_nce");

  cierto("FE usa SOLO la secuencia 'FE' y NCE SOLO la 'NCE' mediante fe_secuencia_reservar, con el punto bloqueado FOR SHARE antes (orden punto → secuencia); sin el viejo tope de 9999999 ni UPDATE directo del contador", /fe_secuencia_reservar\(p_empresa, p_punto, 'FE'\)/.test(crearFe) && !/'NCE'\)/.test(crearFe.slice(crearFe.indexOf("fe_secuencia_reservar"), crearFe.indexOf("fe_secuencia_reservar") + 120)) && /fe_secuencia_reservar\(p_empresa, p_punto, 'NCE'\)/.test(crearNce) && crearFe.indexOf("FOR SHARE") < crearFe.indexOf("fe_secuencia_reservar") && crearNce.indexOf("FOR SHARE") < crearNce.indexOf("fe_secuencia_reservar") && !/ultimo_numero >= 9999999|UPDATE public\.fe_punto_secuencias/.test(crearFe + crearNce));
  cierto("la serie viaja al documento y al JSON: serie en documentos_electronicos y dSerieNum del payload (null = sin serie, como hasta ahora; el contrato real del gateway se confirma en homologación)", /v_numero, v_serie, now\(\)/.test(crearFe) && /'dSerieNum', v_serie/.test(crearFe) && /v_numero, v_serie, now\(\)/.test(crearNce) && /'dSerieNum', v_serie/.test(crearNce));
  cierto("FE y NCE conservan permiso CREAR, idempotencia por entrada_hash, payload inmutable y la validación fiscal de NCE (receptor, ítems, subtotales, F023) previa a la reserva", /usuario_tiene_permiso\(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR'\)/.test(crearFe + crearNce) && /entrada_hash/.test(crearFe) && /entrada_hash/.test(crearNce) && crearNce.indexOf("NEX:PAYLOAD_INVALIDO") < crearNce.indexOf("fe_secuencia_reservar") && /NEX:SALDO_MONTO/.test(crearNce) && /NEX:NCE_PENDIENTE/.test(crearNce));
  const cfg = fn("fe_secuencia_configurar");

  cierto("configurar: permiso PUNTOS (42501), tipo del catálogo, confirmación EXPRESA única, serie vacía o AA–ZZ, número 0…9999999, alcance de sucursal y establecimiento; nunca menor a lo emitido por Nexit ni a lo registrado; 0 solo declarado", /'FACTURACION_ELECTRONICA', 'PUNTOS'/.test(cfg) && /'FE', 'NCE', 'NDE', 'NRE', 'AFE'/.test(cfg) && /p_confirmado IS NOT TRUE/.test(cfg) && /p_serie !~ '\^\[A-Z\]\{2\}\$'/.test(cfg) && /NOT BETWEEN 0 AND 9999999/.test(cfg) && /sucursal_en_alcance/.test(cfg) && /fe_punto_maximo_emitido_serie/.test(cfg) && /NEX:NUMERO_MENOR_QUE_EMITIDOS/.test(cfg) && /fe_serie_orden\(p_serie\), p_ultimo_numero\) < \(public\.fe_serie_orden\(v_s\.serie\), v_s\.ultimo_numero\)/.test(cfg));
  cierto("configurar: bloqueos punto (FOR UPDATE) → secuencia (FOR UPDATE), igual que la emisión; no crea FE por defecto, no activa otros tipos y deja bitácora SECUENCIA con serie, número y estado", /fe_puntos_expedicion WHERE empresa_id = p_empresa AND id = p_punto FOR UPDATE/.test(cfg) && /tipo_documento = p_tipo FOR UPDATE/.test(cfg) && cfg.indexOf("p_punto FOR UPDATE") < cfg.indexOf("tipo_documento = p_tipo FOR UPDATE") && /'SECUENCIA'/.test(cfg) && /'serie', p_serie/.test(cfg) && /coalesce\(p_activar, false\)/.test(cfg));
  const reg = fn("fe_punto_registrar");

  cierto("registrar punto: inactivo, sin número ni tipo, código 001–999, nombre 1–60, sucursal activa en alcance con establecimiento, identidad fiscal única entre sucursales (lock + comprobación), permiso PUNTOS", /VALUES \(p_empresa, p_sucursal, p_codigo, btrim\(p_nombre\), 0, false\)/.test(reg) && !/fe_punto_secuencias/.test(reg) && /fe_punto_bloquear_identidad/.test(reg) && /fe_punto_identidad_en_uso/.test(reg) && /NEX:IDENTIDAD_FISCAL_DUPLICADA/.test(reg) && /'PUNTOS'/.test(reg) && /FOR SHARE/.test(reg));
  const est = fn("fe_secuencia_estado");
  const estP = fn("fe_punto_estado");

  cierto("estados separados: fe_secuencia_estado cambia SOLO un tipo (conserva serie y número) y fe_punto_estado solo el punto, sin pedir números; ambos con permiso PUNTOS, alcance y bitácora", /SET activo = p_activo/.test(est) && !/ultimo_numero =|serie =/.test(est.slice(est.indexOf("UPDATE"))) && /'PUNTOS'/.test(est) && /sucursal_en_alcance/.test(est) && /'SECUENCIA'/.test(est) && /UPDATE public\.fe_puntos_expedicion SET activo = p_activo/.test(estP) && !/fe_punto_secuencias/.test(estP.slice(estP.indexOf("UPDATE"))) && /fe_punto_identidad_en_uso/.test(estP) && /'PUNTOS'/.test(estP));
  const grants = fn("nex_aplicar_grants_facturacion_series");

  cierto("grants: PUBLIC revocado en todas las funciones nuevas; el rol de la aplicación ejecuta solo la administración (registrar, configurar, estado) y NO la reserva interna", /REVOKE ALL ON FUNCTION public\.fe_secuencia_reservar\(uuid, uuid, text\) FROM PUBLIC/.test(grants) && /GRANT EXECUTE ON FUNCTION public\.fe_secuencia_configurar/.test(grants) && /GRANT EXECUTE ON FUNCTION public\.fe_punto_registrar/.test(grants) && /GRANT EXECUTE ON FUNCTION public\.fe_secuencia_estado/.test(grants) && /GRANT EXECUTE ON FUNCTION public\.fe_punto_estado/.test(grants) && !/GRANT EXECUTE ON FUNCTION public\.fe_secuencia_reservar/.test(grants) && /SELECT public\.nex_aplicar_grants_facturacion_series\(\)/.test(sql));
  cierto("SQL: no usa la función vieja de 3 argumentos y los pisos por tipo salen de fe_punto_maximo_emitido_serie (por serie y número, por empresa/establecimiento/punto/tipo)", /FROM public\.documentos_electronicos d\s+WHERE d\.empresa_id = p_empresa AND d\.tipo = p_tipo AND d\.establecimiento = p_establecimiento AND d\.punto_expedicion = p_codigo/.test(sql) && /ORDER BY public\.fe_serie_orden\(d\.serie\) DESC, d\.numero DESC LIMIT 1/.test(sql));

  // ── 3. Reversión, pre-verificación y verificación ──────────────────────────────────────────────────
  cierto("reversión: aborta si hay series, documentos con serie o tipos desactivados; restaura FE (NEX-060), NCE (NEX-062) y el trigger previo; elimina funciones y columnas nuevas; no toca documentos", /REVERSIÓN ABORTADA: hay secuencias con serie/.test(rev) && /documentos emitidos con serie/.test(rev) && /tipos desactivados/.test(rev) && /CREATE OR REPLACE FUNCTION public\.fe_documento_crear_fe\(/.test(rev) && /CREATE OR REPLACE FUNCTION public\.fe_documento_crear_nce\(/.test(rev) && /DROP COLUMN serie, DROP COLUMN activo/.test(rev) && !/fe_secuencia_reservar\(p_empresa/.test(rev.slice(rev.indexOf("CREATE OR REPLACE FUNCTION public.fe_documento_crear_fe"))) && !/DELETE FROM public\.documentos|UPDATE public\.documentos_electronicos/.test(rev));
  const pre = leer("documentacao/banco/nexit/v1/scripts/preflight-NEX-063.sql");
  const ver = leer("documentacao/banco/nexit/v1/scripts/verificar-NEX-063.sql");

  cierto("pre-verificación y verificación son de SOLO LECTURA (BEGIN READ ONLY … ROLLBACK, sin INSERT/UPDATE/DELETE/ALTER) y cubren dependencias, inventario, secuencias menores que lo emitido, documentos con serie e identidades duplicadas", /BEGIN READ ONLY/.test(pre) && /ROLLBACK/.test(pre) && !/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/.test(sinComentarios(pre).replace(/UPDATE public/g, "")) && /fe_punto_maximo_emitido/.test(pre) && /serie IS NOT NULL/.test(pre) && /count\(DISTINCT p\.sucursal_id\) > 1/.test(pre) && /BEGIN READ ONLY/.test(ver) && /ROLLBACK/.test(ver) && !/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/.test(sinComentarios(ver).replace(/'[^']*'/g, "''")));
  cierto("scripts y pruebas versionados: T27 (CA-01…08 secuencial) y T28 (carrera real en el paso de serie) registrados en el runner; no ejecutados por la IA", existsSync(join(raiz, "documentacao/banco/nexit/v1/pruebas/T27-nex063-series-tipos.sql")) && existsSync(join(raiz, "documentacao/banco/nexit/v1/pruebas/T28-concurrencia-series.sh")) && /T25 T26 T27; do/.test(leer("documentacao/banco/nexit/v1/scripts/ejecutar-pruebas.sh")) && /T28-concurrencia-series\.sh/.test(leer("documentacao/banco/nexit/v1/scripts/ejecutar-pruebas.sh")));
  const t27 = leer("documentacao/banco/nexit/v1/pruebas/T27-nex063-series-tipos.sql");
  const t28 = leer("documentacao/banco/nexit/v1/pruebas/T28-concurrencia-series.sh");

  cierto("T27 cubre: tabla de series, FE/NCE/NRE del mismo punto y otros puntos/establecimientos/empresas independientes, 9999999→AA→AB→BA→ZZ→agotada, no retroceso, tipo/punto inactivos, NRE sin emisión, permisos y aislamiento, bitácora", ["fe_secuencia_siguiente(NULL, 9999999)", "CA-01", "AA-0000001", "AB-0000001", "BA-0000001", "ZZ-0000001", "NEX:NUMERACION_AGOTADA", "NEX:TIPO_INACTIVO", "CA-08", "42501", "aislamiento", "bitácora"].every((k) => t27.includes(k)));
  cierto("T28 (concurrencia real, no ejecutada aquí): la segunda emisión queda BLOQUEADA y recibe AA-0000001 mientras la primera conserva 9999999; la NCE avanza sin esperar", /9999998/.test(t28) && /pg_stat_activity/.test(t28) && /wait_event_type='Lock'/.test(t28) && /9999999\/-/.test(t28) && /0000001\/AA/.test(t28) && /FE=AA\/1,NCE=-\/1/.test(t28));

  // ── 4. Capas de aplicación: selección estricta por tipo, serie visible y servidor como autoridad ────
  const emision = leer("lib/facturacion/emision.ts");
  const nce = leer("lib/facturacion/nce.ts");

  cierto("FE: el catálogo y la validación previa usan SOLO la secuencia FE activa; NCE: SOLO la NCE activa (con 422 si el tipo no está activo); el backend no depende del combo", /fs\.tipo_documento = 'FE' AND fs\.activo/.test(emision) && /s\.tipo_documento = 'FE'/.test(emision) && /AND s\.activo\)/.test(emision) && /q\.tipo_documento = 'NCE'/.test(nce) && /AND q\.activo\)/.test(nce) && /tipoActivo !== true/.test(nce) && !/tipo_documento = 'NCE'/.test(emision) && !/tipo_documento = 'FE'/.test(nce));
  cierto("el próximo referencial de la factura se calcula con el paso de serie (series.ts) y la serie viaja en el catálogo; el definitivo se reserva en SQL", /numeracionSiguiente\(puntoElegido\.serie \?\? null, puntoElegido\.ultimoNumero\)/.test(leer("app/(private)/facturas/nueva/page.tsx")) && /'serie', s\.serie/.test(emision) && /'serie', q\.serie/.test(nce));
  cierto("no se habilita NRE/NDE/AFE: ninguna ruta ni función SQL de emisión para esos tipos (solo FE y NCE) y la pantalla avisa que su emisión no está habilitada", !existsSync(join(raiz, "app/api/notas-remision")) && !/crear_nre|crear_nde|crear_afe/.test(sql) && /TIPOS_EMITIBLES: readonly TipoDocumentoPunto\[\] = \["FE", "NCE"\]/.test(leer("lib/facturacion/puntos.ts")) && /todavía no está habilitada/.test(leer("app/(private)/facturacion/puntos/page.tsx")));
  cierto("MT-01/UI-01 y la corrección de NCE rechazadas no se tocaron en esta etapa (sin R04-01 reintroducido; emitir con el cuerpo revisado; disabled del Innominado)", /disabled=\{c\.innominado\}/.test(leer("app/(private)/notas-credito/page.tsx")) && /const c = revisado\?\.cuerpo;/.test(leer("app/(private)/notas-credito/page.tsx")) && !/receptorInnominado|bloqueoInnominado/.test(leer("app/(private)/notas-credito/page.tsx")));

  return fallos;
}
