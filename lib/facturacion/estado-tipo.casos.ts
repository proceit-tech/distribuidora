/**
 * NEX-065 / AUD-PRO129-UX-R04 — el ESTADO DE EMISIÓN es POR TIPO. Sin red y sin PostgreSQL: la migración, la reversión y T32/T33/T34 NO se ejecutaron aquí (las corre el responsable sobre una base
 * descartable). Se verifica el texto versionado (SQL, scripts, pruebas, runner), la retirada de la API y la pantalla, y que el servicio TS ya no consulte el estado físico del punto.
 * No prueba comportamiento de PostgreSQL ni concurrencia real.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");
const sinComentarios = (t: string) => t.replace(/--.*$/gm, "");
const BASE = "documentacao/banco/nexit/v1/";

/** Cuerpo de una función SQL (desde su CREATE OR REPLACE hasta el siguiente CREATE o el fin). */
const funcion = (sql: string, nombre: string) => {
  const a = sql.indexOf("CREATE OR REPLACE FUNCTION public." + nombre + "(");
  if (a < 0) return "";
  const b = sql.indexOf("CREATE OR REPLACE FUNCTION", a + 10);
  return b < 0 ? sql.slice(a) : sql.slice(a, b);
};

export async function verificarCasosEstadoTipo(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(nombre + ": esperado " + JSON.stringify(esperado) + ", obtenido " + JSON.stringify(obtenido));
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  const mig = leer(BASE + "migraciones/NEX-065-facturacion-estado-por-tipo.sql");
  const migSql = sinComentarios(mig);
  const rev = sinComentarios(leer(BASE + "scripts/reversion-NEX-065.sql"));
  const pre = sinComentarios(leer(BASE + "scripts/preflight-NEX-065.sql"));
  const ver = sinComentarios(leer(BASE + "scripts/verificar-NEX-065.sql"));
  const crearFe = funcion(migSql, "fe_documento_crear_fe");
  const crearNce = funcion(migSql, "fe_documento_crear_nce");
  const altaTipo = funcion(migSql, "fe_punto_alta_tipo");
  const estadoTipo = funcion(migSql, "fe_secuencia_estado");
  const estadoPunto = funcion(migSql, "fe_punto_estado");

  // 1. La emisión ya no depende del estado físico del punto
  cierto("NEX-065: fe_documento_crear_fe y fe_documento_crear_nce ya no filtran por fe_puntos_expedicion.activo (la compuerta es el tipo)", crearFe.length > 500 && crearNce.length > 500 && !/AND activo FOR SHARE/.test(crearFe + crearNce) && !/v_punto\.activo|p\.activo/.test(crearFe + crearNce));
  cierto("NEX-065: ambas conservan la reserva por tipo (fe_secuencia_reservar), empresa, sucursal y permiso: solo se quitó la compuerta del punto", /fe_secuencia_reservar\(p_empresa, p_punto, 'FE'\)/.test(crearFe) && /fe_secuencia_reservar\(p_empresa, p_punto, 'NCE'\)/.test(crearNce) && /FOR SHARE/.test(crearFe) && /FOR SHARE/.test(crearNce) && /sucursal_id = p_sucursal/.test(crearFe + crearNce) && /FACTURACION_ELECTRONICA/.test(crearFe + crearNce));
  cierto("NEX-065: el alta fiscal con «activar» deja activo SOLO el tipo dado: no llama a fe_punto_estado/fe_punto_activar ni actualiza fe_puntos_expedicion", altaTipo.length > 500 && !/fe_punto_estado|fe_punto_activar/.test(altaTipo) && !/UPDATE public\.fe_puntos_expedicion/.test(altaTipo));
  cierto("NEX-065: cambiar el estado de un tipo toma el punto en FOR KEY SHARE (no bloquea la emisión de otro tipo) y solo actualiza la fila de ese tipo", /fe_puntos_expedicion WHERE empresa_id = p_empresa AND id = p_punto FOR KEY SHARE/.test(estadoTipo) && /UPDATE public\.fe_punto_secuencias SET activo = p_activo[^;]*AND tipo_documento = p_tipo;/.test(estadoTipo) && !/UPDATE public\.fe_puntos_expedicion/.test(estadoTipo));

  // 2. Migración que preserva los estados bloqueados
  const iSnap = migSql.indexOf("CREATE TABLE public.fe_estado_previo_nex065");
  const iUpd = migSql.indexOf("UPDATE public.fe_punto_secuencias s SET activo = false");
  cierto("NEX-065: guarda la foto previa (fe_estado_previo_nex065) ANTES de convertir, con bloqueos EXCLUSIVE sobre puntos y secuencias antes de leer", iSnap > 0 && iUpd > iSnap && migSql.indexOf("LOCK TABLE public.fe_puntos_expedicion IN EXCLUSIVE MODE") < iSnap && migSql.indexOf("LOCK TABLE public.fe_punto_secuencias IN EXCLUSIVE MODE") < iSnap && /efectivo_previo/.test(migSql));
  const upd = iUpd >= 0 ? migSql.slice(iUpd, migSql.indexOf(";", iUpd)) : "";
  cierto("NEX-065: la conversión solo DESACTIVA (los tipos cuyo punto estaba inactivo): jamás escribe activo = true sobre las secuencias", /AND s\.activo AND NOT p\.activo/.test(upd) && /NOT p\.activo/.test(upd) && !/SET\s+activo\s*=\s*true/i.test(migSql));
  cierto("NEX-065: no modifica numeración, series, documentos ni CDC (ningún INSERT/UPDATE/DELETE sobre documentos_electronicos; la conversión no toca ultimo_numero ni serie)", !/(UPDATE|DELETE FROM|INSERT INTO) public\.documentos_electronicos/.test(migSql.slice(0, migSql.indexOf("CREATE OR REPLACE FUNCTION"))) && !/ultimo_numero\s*=/.test(upd) && !/\bserie\s*=/.test(upd));
  cierto("NEX-065: exige NEX-063/064, aborta si ya está aplicada y verifica el índice único real con COALESCE(serie,'') (la serie NULL cuenta como valor)", /NEX-065 requiere NEX-063 y NEX-064/.test(mig) && /ya existe: NEX-065 parece aplicada/.test(mig) && /documentos_electronicos_numero_key/.test(mig) && /coalesce\(serie,' \|\| repeat\(chr\(39\), 2\)/.test(mig) && /ABORTADA: falta el índice único/.test(mig));
  cierto("NEX-065 es incremental: NEX-063 y NEX-064 conservan sus textos históricos (compuerta del punto en NEX-063; alta única en NEX-064)", /AND activo FOR SHARE/.test(leer(BASE + "migraciones/NEX-063-facturacion-puntos-tipos-series.sql")) && /fe_punto_alta_tipo/.test(leer(BASE + "migraciones/NEX-064-facturacion-punto-alta-con-tipo.sql")));

  // 3. API antigua retirada
  cierto("NEX-065: fe_punto_estado queda RETIRADA (rechaza siempre con NEX:ESTADO_PUNTO_RETIRADO), sin UPDATE, y se revoca al rol de la aplicación junto con el resto de las funciones del punto físico", estadoPunto.length > 100 && /ESTADO_PUNTO_RETIRADO/.test(estadoPunto) && !/UPDATE/.test(estadoPunto) && /REVOKE ALL ON FUNCTION public\.fe_punto_estado\(uuid, uuid, uuid, boolean\) FROM nexit_runtime/.test(migSql) && /REVOKE ALL ON FUNCTION public\.fe_punto_activar\([^)]*\) FROM nexit_runtime/.test(migSql) && /REVOKE ALL ON FUNCTION public\.fe_punto_desactivar\([^)]*\) FROM nexit_runtime/.test(migSql) && /REVOKE ALL ON FUNCTION public\.fe_punto_crear\([^)]*\) FROM nexit_runtime/.test(migSql));
  const serieHelper = funcion(migSql, "nex_aplicar_grants_facturacion_series");
  const revSerie = funcion(rev, "nex_aplicar_grants_facturacion_series");
  cierto("R05-01: NEX-065 redefine nex_aplicar_grants_facturacion_series (el que reejecuta el envoltorio global): ya no concede fe_punto_registrar ni fe_punto_estado, los revoca al rol de la aplicación y conserva configurar/estado por tipo", serieHelper.length > 300 && !/GRANT EXECUTE ON FUNCTION public\.fe_punto_(registrar|estado)/.test(serieHelper) && /REVOKE ALL ON FUNCTION public\.fe_punto_registrar\([^)]*\) FROM nexit_runtime/.test(serieHelper) && /REVOKE ALL ON FUNCTION public\.fe_punto_estado\([^)]*\) FROM nexit_runtime/.test(serieHelper) && /GRANT EXECUTE ON FUNCTION public\.fe_secuencia_configurar/.test(serieHelper) && /GRANT EXECUTE ON FUNCTION public\.fe_secuencia_estado/.test(serieHelper));
  cierto("R05-01: la reversión restaura el ayudante de series de NEX-063 con sus concesiones y T32/verificar comprueban los permisos tras el envoltorio global", /GRANT EXECUTE ON FUNCTION public\.fe_punto_registrar/.test(revSerie) && /GRANT EXECUTE ON FUNCTION public\.fe_punto_estado/.test(revSerie) && /PERFORM nex_aplicar_grants_runtime\(\)/.test(leer(BASE + "pruebas/T32-nex065-estado-por-tipo.sql")) && /fe_punto_registrar/.test(ver) && /fe_documento_crear_nce/.test(ver));
  cierto("R05-02/03: T33 activa P2/P3/P4 explícitamente y deja P1 inactivo con precondiciones; T29 activa el punto en el setup legado", /fe_punto_estado\('\$E','\$U','\$p',true\)/.test(leer(BASE + "pruebas/T33-migracion-estado-por-tipo.sh")) && !/fe_punto_estado\('\$E','\$U','\$P1',false\)/.test(leer(BASE + "pruebas/T33-migracion-estado-por-tipo.sh")) && /001=false,002=true,003=true,004=true/.test(leer(BASE + "pruebas/T33-migracion-estado-por-tipo.sh")) && /fe_punto_estado\('\$E','\$U','\$P',true\)/.test(leer(BASE + "pruebas/T29-reversion-series.sh")));
  cierto("NEX-065: el ayudante de privilegios es DURABLE (el runner lo reaplica en cada ciclo) y la función NEX-057 de grants ya no concede las funciones heredadas", /nex_aplicar_grants_facturacion_estado_tipo/.test(migSql) && /CREATE OR REPLACE FUNCTION public\.nex_aplicar_grants_facturacion_puntos/.test(migSql) && !/GRANT EXECUTE ON FUNCTION public\.fe_punto_(activar|desactivar|crear|estado)/.test(migSql));
  cierto("la ruta HTTP antigua /api/facturacion/puntos/[id]/estado fue eliminada (una llamada directa da 404) y el servicio ya no expone cambiarEstadoPunto ni llama a fe_punto_estado", !existsSync(join(raiz, "app/api/facturacion/puntos/[id]/estado")) && !/cambiarEstadoPunto|fe_punto_estado/.test(leer("lib/facturacion/puntos.ts")) && /ESTADO_PUNTO_RETIRADO/.test(leer("lib/facturacion/puntos.ts")));

  // 4. TS: la emisión no consulta el estado físico
  const emision = leer("lib/facturacion/emision.ts");
  const nce = leer("lib/facturacion/nce.ts");
  cierto("emisión FE/NCE en TypeScript: ninguna consulta filtra por fe_puntos_expedicion.activo (p.activo): el punto se muestra y el tipo decide", !/fe_puntos_expedicion[^\n]*\bp\.activo/.test(emision) && !/\bp\.activo\b/.test(nce) && !emision.split("\n").some((l) => /\bp\.activo\b/.test(l) && !/p\.vendible/.test(l)) && /s\.activo/.test(emision));

  // 5. Pantalla: una acción por fila, del propio tipo
  const pag = leer("app/(private)/facturacion/puntos/page.tsx");
  cierto("pantalla: desaparecen «Activar punto» y «Desactivar punto»; cada fila ofrece SOLO Activar/Desactivar de su propio tipo documental", !/Activar punto|Desactivar punto|Punto inactivo|alternarPunto/.test(pag) && /Desactivar \$\{t\.tipo\}/.test(pag) && /Activar \$\{t\.tipo\}/.test(pag));
  cierto("pantalla: el estado mostrado y el filtro «Activos» dependen solo del tipo (sin punto.activo) y no se llama a ninguna API de estado del punto", !/punto\.activo/.test(pag) && !/\/estado`|\}\/estado/.test(pag.replace(/tipos\/\$\{[^}]*\}\/estado/g, "")));

  // 6. Reversión
  cierto("reversion-NEX-065: toma los bloqueos con lock_timeout, usa la foto, restaura las funciones de NEX-063/064 y elimina la foto y el ayudante", /lock_timeout/.test(rev) && rev.indexOf("LOCK TABLE public.fe_punto_secuencias") > 0 && rev.indexOf("LOCK TABLE public.fe_punto_secuencias") < rev.indexOf("UPDATE public.fe_punto_secuencias") && /DROP TABLE public\.fe_estado_previo_nex065/.test(rev) && /DROP FUNCTION public\.nex_aplicar_grants_facturacion_estado_tipo/.test(rev) && /CREATE OR REPLACE FUNCTION public\.fe_punto_estado/.test(rev) && /AND activo FOR SHARE/.test(rev));
  cierto("reversion-NEX-065: NUNCA reactiva (solo UPDATE ... SET activo = false para los tipos cuyo punto está inactivo)", /UPDATE public\.fe_punto_secuencias s SET activo = false/.test(rev) && !/SET\s+activo\s*=\s*true/i.test(rev) && /NOT p\.activo/.test(rev));
  const r64 = sinComentarios(leer(BASE + "scripts/reversion-NEX-064.sql"));
  const r63 = sinComentarios(leer(BASE + "scripts/reversion-NEX-063.sql"));
  cierto("orden inverso protegido: reversion-NEX-064 y reversion-NEX-063 abortan mientras NEX-065 siga aplicada", /fe_estado_previo_nex065/.test(r64) && /reversion-NEX-065\.sql/.test(r64) && /fe_estado_previo_nex065/.test(r63) && /reversion-NEX-065\.sql/.test(r63));

  // 7. Scripts de solo lectura
  cierto("preflight-NEX-065 y verificar-NEX-065 son de SOLO LECTURA (BEGIN READ ONLY … ROLLBACK, sin INSERT/UPDATE/DELETE/DROP/CREATE)", [pre, ver].every((t) => /BEGIN READ ONLY;/.test(t) && /ROLLBACK;/.test(t) && !/\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)\b/i.test(t.replace(/'[^']*'/g, "''"))));
  cierto("preflight-NEX-065 revisa tipos, documentos e identidades fiscales duplicadas; verificar-NEX-065 compara con la foto (nada quedó habilitado de más)", /fe_punto_secuencias/.test(pre) && /documentos_electronicos/.test(pre) && /HAVING count\(\*\) > 1/i.test(pre) && /fe_estado_previo_nex065/.test(ver) && /efectivo_previo/.test(ver));

  // 7b. Índice fiscal: verificación por catálogos, idéntica en migración, preflight y verificar (falla real de aplicación: LIKE con comillas mal escapadas)
  const defReal = "CREATE UNIQUE INDEX documentos_electronicos_numero_key ON public.documentos_electronicos USING btree (empresa_id, tipo, establecimiento, punto_expedicion, numero, COALESCE(serie, ''::text))";
  const patronAntiguo = "%empresa_id, tipo, establecimiento, punto_expedicion, numero, COALESCE(serie, ''::text)%".replace(/''/g, "'"); // lo que PostgreSQL entendía del literal antiguo
  const patronCorrecto = "COALESCE(serie, ''::text)";
  cierto("índice fiscal: la comparación textual ANTIGUA (comilla simple escapada una vez) no reconoce la definición real de PostgreSQL (falso negativo reproducido) y la definición real sí contiene las dos comillas", !defReal.includes(patronAntiguo.replace(/^%|%$/g, "")) && defReal.includes(patronCorrecto));
  const critNorm = (t: string) => { const m = /EXISTS \(SELECT 1 FROM pg_index i JOIN pg_class c[\s\S]*?repeat\(chr\(39\), 2\) \|\| '::text\)'\)/.exec(t); return m ? m[0].replace(/\s+/g, " ") : ""; };
  const cMig = critNorm(migSql), cPre = critNorm(pre), cVer = critNorm(ver);
  cierto("índice fiscal: migración, preflight y verificar usan el MISMO criterio por catálogos (único, válido, listo, sin filtro parcial, 6 columnas, columnas exactas y coalesce(serie, ''))", cMig.length > 400 && cMig === cPre && cMig === cVer && /indisunique AND i\.indisvalid AND i\.indisready AND i\.indpred IS NULL/.test(cMig) && /indkey\[5\] = 0/.test(cMig) && /'empresa_id', 'tipo', 'establecimiento', 'punto_expedicion', 'numero'/.test(cMig) && /nspname = 'public'/.test(cMig));
  cierto("índice fiscal: ya no se compara pg_indexes.indexdef con LIKE en ninguno de los tres; T35 (esquema descartable) reproduce el índice real, el falso negativo y rechaza variantes (no único, ordinario, parcial, expresión distinta, otro orden, ausente)", ![migSql, pre, ver].some((t) => /indexdef\s+LIKE/.test(t)) && /ABORTADA: falta el índice único/.test(mig) && /T35-nex065-indice-fiscal\.sql/.test(leer(BASE + "scripts/ejecutar-pruebas.sh")) && /rechaza el índice NO único/.test(leer(BASE + "pruebas/T35-nex065-indice-fiscal.sql")) && /falso negativo/.test(leer(BASE + "pruebas/T35-nex065-indice-fiscal.sql")));

  // 8. Pruebas registradas
  const runner = leer(BASE + "scripts/ejecutar-pruebas.sh");
  cierto("T32 (SQL), T33 (migración) y T34 (concurrencia) versionadas y registradas en el runner (T33/T34 como pasos propios; T32 en el bucle SQL)", /T26 T27 T30 T32; do/.test(runner) && /T33-migracion-estado-por-tipo\.sh/.test(runner) && /T34-concurrencia-estado-tipo\.sh/.test(runner) && existsSync(join(raiz, BASE + "pruebas/T32-nex065-estado-por-tipo.sql")));
  const t32 = leer(BASE + "pruebas/T32-nex065-estado-por-tipo.sql");
  cierto("T32 cubre: FE activa/NCE inactiva, activar NCE no altera FE, desactivar FE deja NCE activa, alta de otro tipo sin efecto colateral, función retirada, series y números distintos, unicidad con serie NULL, permisos y aislamiento", /FE activa, NCE inactiva/.test(t32) && /activar NCE: la FE/.test(t32) && /desactivar FE: la NCE permanece activa/.test(t32) && /NO reactiva FE ni NCE/.test(t32) && /fe_punto_estado\(%L, %L, %L, true\)/.test(t32) && /AA-9999999 a AB-0000001/.test(t32) && /SIN serie \(NULL\) violan la unicidad/.test(t32) && /42501/.test(t32) && /aislamiento/.test(t32));
  const t33 = leer(BASE + "pruebas/T33-migracion-estado-por-tipo.sh");
  cierto("T33 prueba la migración real: base NEX-001…064 (sin 065), bloqueados que siguen bloqueados, snapshot, series/contadores/documentos idénticos por md5, activación posterior independiente y reversión sin reactivar", /nexit_test_\*/.test(t33) && /NEX-065-\*/.test(t33) && /MIGRACIONES_DIR/.test(t33) && /fe_estado_previo_nex065/.test(t33) && /md5\(/.test(t33) && /reversion-NEX-065\.sql/.test(t33) && /NADA se activó automáticamente/.test(t33));
  const t34 = leer(BASE + "pruebas/T34-concurrencia-estado-tipo.sh");
  cierto("T34 prueba la carrera real: el cambio de estado de FE retenido NO bloquea la NCE del mismo punto y SÍ serializa la FE (rechazada con TIPO_INACTIVO al confirmar)", /nexit_test_\*/.test(t34) && /fe_secuencia_estado\('\$E','\$U','\$P','FE',false\)/.test(t34) && /wait_event_type='Lock'/.test(t34) && /TIPO_INACTIVO/.test(t34) && /NO esperó al cambio de estado/.test(t34));
  cierto("T19/T21/T28/T30 ya no usan fe_punto_estado como llave de emisión (T27/T32 lo llaman para verificar que está retirada; T29/T33 solo en el setup LEGADO anterior a NEX-065)", ["T19-nex057-puntos-expedicion.sql", "T21-nex060-secuencias-por-tipo.sql", "T28-concurrencia-series.sh", "T30-nex064-alta-punto-tipo.sql"].every((f) => !/fe_punto_estado\(/.test(leer(BASE + "pruebas/" + f))));

  return fallos;
}
