/**
 * NEX-064 / AUD-PRO129-UX-R01-01 — ALTA FISCAL ÚNICA punto + tipo documental. Sin red y sin PostgreSQL: la migración, T30 y T31 NO se ejecutaron aquí (las corre el responsable sobre una base descartable).
 * Se verifica la forma que llega del navegador, la llamada SQL única, la traducción de errores, el texto versionado de SQL/reversión/pruebas y la estructura del formulario. No prueba comportamiento real de
 * PostgreSQL ni la concurrencia real.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { altaPuntoConTipo, leerAltaPuntoTipo, traducirErrorPunto } from "@/lib/facturacion/puntos";
import { ErrorFacturacion } from "@/lib/facturacion/shared";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");
const sinComentarios = (t: string) => t.replace(/--.*$/gm, "");

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const USUARIO = "99999999-9999-4999-8999-999999999999";
const SUC = "55555555-5555-4555-8555-555555555555";
const PUNTO = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1";

const errorPg = (code: string | undefined, detail?: string, message = "x") => Object.assign(new Error(message), { code, detail });

export async function verificarCasosAltaPunto(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(nombre + ": esperado " + JSON.stringify(esperado) + ", obtenido " + JSON.stringify(obtenido));
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const traduce = (e: unknown) => { try { traducirErrorPunto(e); return "no lanzó"; } catch (x) { return x instanceof ErrorFacturacion ? x.estado + ":" + x.message : "otro"; } };

  // ── 1. Forma del cuerpo ────────────────────────────────────────────────────────────────────────
  const base = { sucursalId: SUC, codigo: "001", nombre: " Caja 1 ", tipo: "NCE", serie: "", ultimoNumero: "0", confirmado: true, activar: true };

  igual("alta única válida: punto + tipo + serie vacía (sin serie) + 0 declarado + confirmación + activar; el nombre se normaliza", leerAltaPuntoTipo(base), { tipo: "NCE", serie: null, ultimoNumero: 0, activar: true, sucursalId: SUC, codigo: "001", nombre: "Caja 1" });
  igual("el nombre es opcional en el cuerpo (un punto existente se reutiliza y el servidor lo ignora); con serie AA y último 9999999", leerAltaPuntoTipo({ ...base, nombre: undefined, serie: "aa", ultimoNumero: 9999999, activar: undefined }), { tipo: "NCE", serie: "AA", ultimoNumero: 9999999, activar: false, sucursalId: SUC, codigo: "001", nombre: null });
  igual("el tipo es OBLIGATORIO (no hay FE implícito) y debe ser del catálogo; sin sucursal/código válido, serie inválida, número ausente o fuera de rango, sin confirmación EXPRESA o nombre de 61 caracteres → error", [{ ...base, tipo: undefined }, { ...base, tipo: "XX" }, { ...base, sucursalId: "x" }, { ...base, codigo: "000" }, { ...base, serie: "A1" }, { ...base, ultimoNumero: undefined }, { ...base, ultimoNumero: 10000000 }, { ...base, confirmado: false }, { ...base, confirmado: "true" }, { ...base, nombre: "x".repeat(61) }].map((c) => typeof leerAltaPuntoTipo(c as never)), Array.from({ length: 10 }, () => "string"));

  // ── 2. Una sola llamada SQL (una transacción), con empresa y usuario de la sesión ──────────────────
  const llamadas: Array<{ sql: string; p: unknown[] }> = [];
  const db = (rows: unknown[]) => ({ query: async (sql: string, p: unknown[] = []) => { llamadas.push({ sql, p }); return { rows, rowCount: rows.length }; } });
  const datos = leerAltaPuntoTipo(base) as Exclude<ReturnType<typeof leerAltaPuntoTipo>, string>;
  const nuevo = await altaPuntoConTipo(db([{ o_punto: PUNTO, o_punto_creado: true }]) as never, EMPRESA, USUARIO, datos);
  const existente = await altaPuntoConTipo(db([{ o_punto: PUNTO, o_punto_creado: false }]) as never, EMPRESA, USUARIO, datos);

  igual("altaPuntoConTipo: UNA sola consulta a fe_punto_alta_tipo por operación (no dos llamadas HTTP/SQL separadas), con empresa y usuario de la sesión y la confirmación explícita", [llamadas.length, /fe_punto_alta_tipo\(\$1::uuid, \$2::uuid, \$3::uuid, \$4, \$5, \$6, \$7, \$8::integer, true, \$9::boolean\)/.test(llamadas[0].sql), llamadas[0].p], [2, true, [EMPRESA, USUARIO, SUC, "001", "Caja 1", "NCE", null, 0, true]]);
  igual("el resultado distingue punto creado de punto reutilizado", [nuevo, existente], [{ id: PUNTO, creado: true }, { id: PUNTO, creado: false }]);
  igual("tipo duplicado: 409 que habla del TIPO («ya está configurado», «no se duplica», «Configurar»), no del punto", [/^409:/.test(traduce(errorPg("P0001", "NEX:TIPO_DUPLICADO"))), /Ese tipo de documento ya está configurado.*no se duplica.*Configurar/.test(traduce(errorPg("P0001", "NEX:TIPO_DUPLICADO"))), /Ya existe un punto con ese código/.test(traduce(errorPg("P0001", "NEX:TIPO_DUPLICADO")))], [true, true, false]);
  igual("errores de la función se traducen sin tragarse: permiso 403, número menor 409, identidad fiscal 409; sin NEX-064 el error técnico llega como 409 que nombra la migración", [
    traduce(errorPg("42501")).split(":")[0], traduce(errorPg("P0001", "NEX:NUMERO_MENOR_QUE_EMITIDOS")).split(":")[0], traduce(errorPg("P0001", "NEX:IDENTIDAD_FISCAL_DUPLICADA")).split(":")[0], traduce(errorPg("42883")).split(":")[0],
  ], ["403", "409", "409", "409"]);
  igual("la API falla con el estado dirigido si la función rechaza (y no devuelve éxito parcial)", await (async () => { try { await altaPuntoConTipo({ query: async () => { throw errorPg("P0001", "NEX:TIPO_DUPLICADO"); } } as never, EMPRESA, USUARIO, datos); return "OK"; } catch (x) { return x instanceof ErrorFacturacion ? x.estado : "otro"; } })(), 409);

  // ── 3. Migración NEX-064 (texto) ───────────────────────────────────────────────────────────────
  const mig = leer("documentacao/banco/nexit/v1/migraciones/NEX-064-facturacion-punto-alta-con-tipo.sql");
  const sql = sinComentarios(mig);
  const fn = sql.slice(sql.indexOf("FUNCTION public.fe_punto_alta_tipo"), sql.indexOf("END $$;", sql.indexOf("FUNCTION public.fe_punto_alta_tipo")));
  const rev = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-064.sql");
  const rev63 = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-063.sql");

  cierto("NEX-064 incremental: exige NEX-063, no se reaplica por suposición, estado «NO aplicada»; no edita NEX-063 ni funciones de emisión ni toca documentos/CDC", /requiere NEX-063 aplicada/.test(mig) && /parece aplicada/.test(mig) && /NO aplicada/.test(mig) && !/fe_documento_crear_(fe|nce)|DROP TABLE|TRUNCATE|DELETE FROM|ALTER TABLE|documentos_electronicos/i.test(sql));
  cierto("alta única ATÓMICA: una sola función SECURITY DEFINER que registra el punto (si es nuevo) y configura el tipo reutilizando fe_punto_registrar / fe_secuencia_configurar / fe_punto_estado; cualquier fallo revierte TODO (no hay COMMIT intermedio ni EXCEPTION que trague el error)", /SECURITY DEFINER/.test(fn) && /public\.fe_punto_registrar\(/.test(fn) && /public\.fe_secuencia_configurar\(/.test(fn) && /public\.fe_punto_estado\(/.test(fn) && !/EXCEPTION WHEN/.test(fn) && !/COMMIT/.test(fn));
  cierto("punto existente: se reutiliza SIN registrar otro ni tocar su nombre; tipo ya configurado → NEX:TIPO_DUPLICADO ANTES de cualquier escritura; el punto nuevo solo se registra cuando no existe (sucursal + código)", /WHERE empresa_id = p_empresa AND sucursal_id = p_sucursal AND codigo = p_codigo/.test(fn) && /NEX:TIPO_DUPLICADO/.test(fn) && fn.indexOf("NEX:TIPO_DUPLICADO") < fn.indexOf("fe_punto_registrar(") && fn.indexOf("NEX:TIPO_DUPLICADO") < fn.indexOf("fe_secuencia_configurar(") && /ELSE\s+v_punto := public\.fe_punto_registrar/.test(fn));
  cierto("concurrencia: la identidad (empresa + establecimiento + código) se serializa con el MISMO advisory lock de NEX-057 antes de buscar el punto (dos altas simultáneas del mismo código terminan con un solo punto y dos configuraciones); orden sucursal FOR SHARE → lock de identidad → punto", /FOR SHARE/.test(fn) && /fe_punto_bloquear_identidad\(/.test(fn) && fn.indexOf("FOR SHARE") < fn.indexOf("fe_punto_bloquear_identidad(") && fn.indexOf("fe_punto_bloquear_identidad(") < fn.indexOf("FROM public.fe_puntos_expedicion WHERE"));
  cierto("permiso PUNTOS (42501), tipo del catálogo, código 001–999 y alcance de sucursal verificados dentro de la función; la confirmación, serie, rango y no retroceso los hereda de fe_secuencia_configurar", /'FACTURACION_ELECTRONICA', 'PUNTOS'/.test(fn) && /'FE', 'NCE', 'NDE', 'NRE', 'AFE'/.test(fn) && /p_codigo !~ '\^\[0-9\]\{3\}\$'/.test(fn) && /sucursal_en_alcance/.test(fn));
  cierto("activar: deja el tipo disponible y, si el punto estaba inactivo o es nuevo, activa también el punto (una sola decisión, sin etapas intermedias); sin activar no cambia el estado del punto", /fe_secuencia_configurar\(p_empresa, p_usuario, v_punto, p_tipo, p_serie, p_ultimo_numero, p_confirmado, p_activar\)/.test(fn) && /p_activar IS TRUE AND NOT v_activo/.test(fn));
  cierto("privilegios: PUBLIC revocado y solo el rol de la aplicación ejecuta la función; reversión de la función sin tocar datos, y la de NEX-063 se NIEGA a correr mientras NEX-064 siga aplicada (orden inverso)", /REVOKE ALL ON FUNCTION public\.fe_punto_alta_tipo/.test(sql) && /GRANT EXECUTE ON FUNCTION public\.fe_punto_alta_tipo[^;]*TO nexit_runtime/.test(sql) && /DROP FUNCTION public\.fe_punto_alta_tipo/.test(rev) && !/DELETE|TRUNCATE|UPDATE/.test(sinComentarios(rev)) && /NEX-064 sigue aplicada/.test(rev63));
  const t30 = leer("documentacao/banco/nexit/v1/pruebas/T30-nex064-alta-punto-tipo.sql");
  const t31 = leer("documentacao/banco/nexit/v1/pruebas/T31-concurrencia-alta-punto-tipo.sh");
  const runner = leer("documentacao/banco/nexit/v1/scripts/ejecutar-pruebas.sh");

  cierto("T30 (secuencial, no ejecutada) cubre P1 FE y NCE del mismo punto (nombre y FE intactos), P2 nuevo punto + NRE sin emisión, P3 tipo duplicado (sin escribir), P4 independencia entre empresas/establecimientos y conflicto de identidad, P5 rollback ante serie/número/confirmación/tipo inválidos sin punto huérfano, permisos y aislamiento", ["P1", "P2", "P3", "P4", "P5", "NEX:TIPO_DUPLICADO", "fe_punto_alta_tipo(", "huérfano", "42501", "aislamiento", "NRE", "NCE"].every((k) => t30.includes(k)));
  cierto("T31 (concurrencia real, no ejecutada) prueba dos sesiones: tipos distintos del mismo código → S2 bloqueada y luego reutiliza (UN punto, dos configuraciones); mismo tipo → S2 bloqueada y rechazada por tipo duplicado sin alterar la FE", /wait_event_type='Lock'/.test(t31) && /pg_stat_activity/.test(t31) && /FE=10\/true,NCE=0\/true/.test(t31) && /true\/false/.test(t31) && /TIPO_DUPLICADO/.test(t31) && /"1\/10"/.test(t31) && /T30( |;)/.test(runner) && /T31-concurrencia-alta-punto-tipo\.sh/.test(runner));

  // ── 4. FE/NCE/NRE comparten el punto sin interferir ───────────────────────────────────────────
  const mig63 = sinComentarios(leer("documentacao/banco/nexit/v1/migraciones/NEX-063-facturacion-puntos-tipos-series.sql"));

  cierto("FE y NCE reservan SOLO su propia secuencia (fe_secuencia_reservar con el tipo literal) y la clave de la secuencia es (empresa, punto, tipo): compartir el punto no comparte contador; NRE/NDE/AFE no tienen función de emisión", /fe_secuencia_reservar\(p_empresa, p_punto, 'FE'\)/.test(mig63) && /fe_secuencia_reservar\(p_empresa, p_punto, 'NCE'\)/.test(mig63) && /tipo_documento = p_tipo FOR UPDATE/.test(mig63) && !/crear_nre|crear_nde|crear_afe/.test(mig63 + sql));

  // ── 5. Formulario ÚNICO (estructura) ──────────────────────────────────────────────────────────
  const pagina = leer("app/(private)/facturacion/puntos/page.tsx");
  const ruta = leer("app/api/facturacion/puntos/route.ts");

  cierto("la ruta POST da de alta punto + tipo con UNA llamada (altaPuntoConTipo) y devuelve 201 si creó el punto y 200 si lo reutilizó; exige PUNTOS", /altaPuntoConTipo\(b\.db, b\.empresaId, b\.usuarioId, datos\)/.test(ruta) && /status: r\.creado \? 201 : 200/.test(ruta) && !/registrarPunto/.test(ruta) && (ruta.match(/prepararFacturacion\("PUNTOS"\)/g) ?? []).length === 2);
  cierto("formulario único: reutiliza el punto existente (nombre de solo lectura, «Punto existente: se reutiliza y su nombre no se modifica»), muestra los tipos ya configurados y avisa duplicidad DEL TIPO con serie y último número, sin permitir enviar", /puntoExistente/.test(pagina) && /readOnly=\{puntoExistente !== undefined\}/.test(pagina) && /Punto existente: se reutiliza y su nombre no se modifica/.test(pagina) && /tipoYaConfigurado/.test(pagina) && /ya está configurado en el punto/.test(pagina) && /No se duplica ni se reinicia: use «Configurar» en su fila/.test(pagina) && /disabled=\{ocupado \|\| tipoYaConfigurado !== undefined\}/.test(pagina));
  cierto("formulario único: tipo obligatorio sin valor por defecto, serie «Sin serie» vacía por defecto, último número sin valor por defecto, UNA confirmación, activación única que explica el efecto sobre el punto y los demás tipos, próximo referencial y avisos de NRE/NDE/AFE; la pantalla sigue con una fila por tipo", /tipo: "", serie: "", ultimo: "", confirma: false, activar: true/.test(pagina) && /placeholder="Sin serie"/.test(pagina) && /Dejar disponible para emitir ahora/.test(pagina) && /sus otros tipos activos volverán a poder emitir/.test(pagina) && /proximoDeEntrada\(aSerie, dAlta\.ultimo\)/.test(pagina) && /todavía no está habilitada/.test(pagina) && />Tipo de documento</.test(pagina));
  cierto("el flujo de dos pasos desapareció (no hay diálogo posterior de «Configure ahora»), el diálogo «Configurar» queda solo para reconciliar un tipo existente de una fila, y MT-01/UI-01/R04-01 no se tocaron", !/Configure ahora/.test(pagina) && /abrirConfiguracion\(f\)/.test(pagina) && /bloqueaTipo: f\.tipo !== null/.test(pagina) && /disabled=\{c\.innominado\}/.test(leer("app/(private)/notas-credito/page.tsx")) && !/receptorInnominado|bloqueoInnominado/.test(leer("app/(private)/notas-credito/page.tsx")));

  return fallos;
}
