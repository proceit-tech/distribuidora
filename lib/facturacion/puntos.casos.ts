/**
 * PRO-129 (Etapa A) — gestión administrativa de puntos de expedición: validación de la forma, traducción de errores de la función SQL, SQL que ejecuta la aplicación, permisos, aislamiento y
 * estructura de NEX-057, T19 y la pantalla. Sin red y sin PostgreSQL: la migración y las funciones NO se ejecutaron aquí (las prueba T19 en PostgreSQL descartable del CI, sin que yo la
 * acompañe); lo que se verifica es la lógica de TypeScript y el texto versionado.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { activarPunto, crearPunto, desactivarPunto, leerActivacion, leerAltaPunto, leerUltimoNumero, listarPuntos, permisoPuntos, traducirErrorPunto } from "@/lib/facturacion/puntos";
import { ErrorFacturacion } from "@/lib/facturacion/shared";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const USUARIO = "99999999-9999-4999-8999-999999999999";
const SUC = "55555555-5555-4555-8555-555555555555";
const PUNTO = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1";

type Llamada = { sql: string; parametros: unknown[] };

function dbSimulada(respuestas: Array<{ rows?: unknown[]; error?: unknown }> = []) {
  const llamadas: Llamada[] = [];
  const db = {
    async query(sql: string, parametros: unknown[] = []) {
      llamadas.push({ sql, parametros });

      const r = respuestas.shift();

      if (r?.error) throw r.error;

      return { rows: r?.rows ?? [], rowCount: (r?.rows ?? []).length };
    },
  };

  return { db: db as never, llamadas };
}

const errorPg = (code: string | undefined, detail?: string, message = "x") => Object.assign(new Error(message), { code, detail });

export async function verificarCasosPuntos(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const traduce = (e: unknown) => { try { traducirErrorPunto(e); return "no lanzó"; } catch (x) { return x instanceof ErrorFacturacion ? `${x.estado}:${x.message}` : `otro:${String(x)}`; } };
  const lanza = async (p: Promise<unknown>) => { try { await p; return "OK"; } catch (x) { return x instanceof ErrorFacturacion ? `${x.estado}` : `otro`; } };

  // ── 1. Forma de lo que llega del navegador ────────────────────────────────────────────────────────────────────────────────────────────────────
  igual("último número: entero explícito 0…9999998 (número o texto); sin valor, negativo, decimal, texto o fuera de rango → error (no se asume cero)", [leerUltimoNumero(120), leerUltimoNumero("120"), leerUltimoNumero(0), leerUltimoNumero("0"), leerUltimoNumero(9999998)], [120, 120, 0, 0, 9999998]);
  igual("último número inválido", [undefined, null, "", " ", -1, "-1", 1.5, "1.5", "abc", 9999999, "9999999", "10000000"].map((v) => typeof leerUltimoNumero(v)), Array.from({ length: 12 }, () => "string"));
  const alta = { sucursalId: SUC, codigo: "001", nombre: " Caja 1 ", ultimoNumero: "120", confirmado: true };
  igual("alta válida: código y nombre normalizados, número como entero", leerAltaPunto(alta), { sucursalId: SUC, codigo: "001", nombre: "Caja 1", ultimoNumero: 120 });
  igual("alta: sin sucursal, sucursal no UUID, código 000 / de 1 o 4 dígitos / con letras, nombre vacío o de 61 caracteres → error", [{ ...alta, sucursalId: undefined }, { ...alta, sucursalId: "x" }, { ...alta, codigo: "000" }, { ...alta, codigo: "1" }, { ...alta, codigo: "0001" }, { ...alta, codigo: "0a1" }, { ...alta, nombre: "  " }, { ...alta, nombre: "x".repeat(61) }].map((c) => typeof leerAltaPunto(c)), Array.from({ length: 8 }, () => "string"));
  igual("alta: sin último número o sin confirmación EXPRESA (false, ausente, 'true' como texto) → error; nunca cero por omisión", [{ ...alta, ultimoNumero: undefined }, { ...alta, confirmado: false }, { ...alta, confirmado: undefined }, { ...alta, confirmado: "true" }].map((c) => typeof leerAltaPunto(c)), ["string", "string", "string", "string"]);
  igual("alta con 0 informado y confirmado es válida (primer punto sin emisiones previas)", leerAltaPunto({ ...alta, ultimoNumero: 0 }), { sucursalId: SUC, codigo: "001", nombre: "Caja 1", ultimoNumero: 0 });
  igual("activación: número y confirmación expresos; sin ellos → error", [leerActivacion({ ultimoNumero: 125, confirmado: true }), typeof leerActivacion({ ultimoNumero: 125 }), typeof leerActivacion({ confirmado: true }), typeof leerActivacion({ ultimoNumero: -3, confirmado: true })], [{ ultimoNumero: 125 }, "string", "string", "string"]);

  // ── 2. Traducción de errores de las funciones SQL ─────────────────────────────────────────────────────────────────────────────────────────────
  igual("permiso (42501) → 403 con el permiso nombrado", /^403:.*FACTURACION_ELECTRONICA\.PUNTOS/.test(traduce(errorPg("42501"))), true);
  igual("sin NEX-057 (función o tabla inexistente) → 409 que nombra la migración", [traduce(errorPg("42883")), traduce(errorPg("42P01"))].map((t) => /^409:.*NEX-057/.test(t)), [true, true]);
  igual("códigos NEX → estados dirigidos", ["NEX:CONFIRMACION_REQUERIDA", "NEX:NUMERO_INVALIDO", "NEX:CODIGO_INVALIDO", "NEX:NOMBRE_INVALIDO", "NEX:SUCURSAL_INVALIDA", "NEX:SIN_ESTABLECIMIENTO", "NEX:PUNTO_DUPLICADO", "NEX:PUNTO_INVALIDO", "NEX:PUNTO_YA_ACTIVO", "NEX:PUNTO_YA_INACTIVO", "NEX:NUMERO_MENOR_QUE_EMITIDOS", "NEX:IDENTIDAD_FISCAL_DUPLICADA"].map((d) => traduce(errorPg("P0001", d)).split(":")[0]), ["422", "422", "422", "422", "409", "409", "409", "404", "409", "409", "409", "409"]);
  igual("identidad fiscal duplicada: el mensaje explica la colisión de numeración y qué hacer", /misma identidad fiscal colisionar.*otro código o desactive/.test(traduce(errorPg("P0001", "NEX:IDENTIDAD_FISCAL_DUPLICADA"))), true);
  igual("numeración que retrocedería: el mensaje dice que nunca retrocede", /nunca retrocede/.test(traduce(errorPg("P0001", "NEX:NUMERO_MENOR_QUE_EMITIDOS"))), true);
  igual("un error desconocido NO se traduce ni se oculta (se relanza para el 500 genérico)", /^otro:/.test(traduce(errorPg("XX000", "otra cosa"))), true);

  // ── 3. SQL que ejecuta la aplicación: solo las funciones, con la empresa y el usuario de la sesión ───────────────────────────────────────────
  const c1 = dbSimulada([{ rows: [{ id: PUNTO }] }]);
  const id = await crearPunto(c1.db, EMPRESA, USUARIO, { sucursalId: SUC, codigo: "001", nombre: "Caja 1", ultimoNumero: 120 });
  igual("crearPunto: una sola llamada a fe_punto_crear con empresa y usuario de la sesión, el último número informado y la confirmación explícita", [id, c1.llamadas.length, /fe_punto_crear\(\$1::uuid, \$2::uuid, \$3::uuid, \$4, \$5, \$6::integer, true\)/.test(c1.llamadas[0].sql), c1.llamadas[0].parametros], [PUNTO, 1, true, [EMPRESA, USUARIO, SUC, "001", "Caja 1", 120]]);
  const c2 = dbSimulada([{}]);
  await activarPunto(c2.db, EMPRESA, USUARIO, PUNTO, { ultimoNumero: 125 });
  igual("activarPunto: fe_punto_activar con el número confirmado", [c2.llamadas.length, /fe_punto_activar\(\$1::uuid, \$2::uuid, \$3::uuid, \$4::integer, true\)/.test(c2.llamadas[0].sql), c2.llamadas[0].parametros], [1, true, [EMPRESA, USUARIO, PUNTO, 125]]);
  const c3 = dbSimulada([{}]);
  await desactivarPunto(c3.db, EMPRESA, USUARIO, PUNTO);
  igual("desactivarPunto: fe_punto_desactivar", [/fe_punto_desactivar\(\$1::uuid, \$2::uuid, \$3::uuid\)/.test(c3.llamadas[0].sql), c3.llamadas[0].parametros], [true, [EMPRESA, USUARIO, PUNTO]]);
  igual("errores de la función se traducen (permiso 403, duplicado 409, número menor 409) y no se tragan", [
    await lanza(crearPunto(dbSimulada([{ error: errorPg("42501") }]).db, EMPRESA, USUARIO, { sucursalId: SUC, codigo: "001", nombre: "x", ultimoNumero: 1 })),
    await lanza(crearPunto(dbSimulada([{ error: errorPg("P0001", "NEX:PUNTO_DUPLICADO") }]).db, EMPRESA, USUARIO, { sucursalId: SUC, codigo: "001", nombre: "x", ultimoNumero: 1 })),
    await lanza(activarPunto(dbSimulada([{ error: errorPg("P0001", "NEX:NUMERO_MENOR_QUE_EMITIDOS") }]).db, EMPRESA, USUARIO, PUNTO, { ultimoNumero: 1 })),
    await lanza(desactivarPunto(dbSimulada([{ error: errorPg("P0001", "NEX:PUNTO_YA_INACTIVO") }]).db, EMPRESA, USUARIO, PUNTO)),
  ], ["403", "409", "409", "409"]);
  const l = dbSimulada([{ rows: [{ id: SUC, nombre: "Casa Central", establecimiento: "001", puntos: [{ id: PUNTO, codigo: "001", nombre: "Caja 1", ultimoNumero: 120, activo: false }] }, { id: "s2", nombre: "Depósito", establecimiento: null, puntos: [] }] }]);
  const lista = await listarPuntos(l.db, EMPRESA, USUARIO);
  igual("listarPuntos: filtra por la empresa de la sesión y el alcance del usuario, incluye puntos INACTIVOS y calcula el próximo número de 7 dígitos", [/sc\.empresa_id = \$1/.test(l.llamadas[0].sql), /sucursal_en_alcance\(\$1::uuid, \$2::uuid, sc\.id\)/.test(l.llamadas[0].sql), /p\.empresa_id = sc\.empresa_id/.test(l.llamadas[0].sql), !/AND p\.activo/.test(l.llamadas[0].sql), l.llamadas[0].parametros, lista[0].puntos[0], lista[1].establecimiento], [true, true, true, true, [EMPRESA, USUARIO], { id: PUNTO, codigo: "001", nombre: "Caja 1", ultimoNumero: 120, activo: false, proximo: "0000121" }, null]);
  const pp = dbSimulada([{ rows: [{ ok: true }] }, { rows: [{ ok: false }] }, { error: errorPg("42883") }]);
  igual("permisoPuntos: usa usuario_tiene_permiso con la empresa y el usuario de la sesión; false si no lo tiene o si la migración no existe", [await permisoPuntos(pp.db, EMPRESA, USUARIO), await permisoPuntos(pp.db, EMPRESA, USUARIO), await permisoPuntos(pp.db, EMPRESA, USUARIO), pp.llamadas[0].parametros, /'FACTURACION_ELECTRONICA', 'PUNTOS'/.test(pp.llamadas[0].sql)], [true, false, false, [EMPRESA, USUARIO], true]);

  // ── 4. Seguridad: la aplicación NO escribe la tabla de puntos ni confía en la empresa del navegador ───────────────────────────────────────────
  const logica = leer("lib/facturacion/puntos.ts");
  cierto("la lógica solo ejecuta las funciones SQL: ni INSERT, UPDATE ni DELETE de fe_puntos_expedicion desde TypeScript (el rol runtime tampoco puede)", !/INSERT INTO|UPDATE |DELETE FROM/i.test(logica.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")) && !/ultimo_numero *=/.test(logica));
  const rutas = ["app/api/facturacion/puntos/route.ts", "app/api/facturacion/puntos/[id]/activar/route.ts", "app/api/facturacion/puntos/[id]/desactivar/route.ts"].map(leer);
  cierto("las tres rutas exigen FACTURACION_ELECTRONICA.PUNTOS (prepararFacturacion('PUNTOS')) en cada método y toman empresa/usuario de la sesión, nunca del cuerpo", rutas.every((r) => /prepararFacturacion\("PUNTOS"\)/.test(r) && !/empresaId *[:=] *(cuerpo|datos|body)|cuerpo\.empresa|\.empresaId\b.*cuerpo/.test(r)) && (rutas[0].match(/prepararFacturacion\("PUNTOS"\)/g) ?? []).length === 2 && rutas.every((r) => /b\.empresaId, b\.usuarioId/.test(r)));
  cierto("la preparación común admite 'PUNTOS' y la página está protegida por guardPage del mismo permiso", /"VER" \| "EDITAR" \| "CREAR" \| "PUNTOS"/.test(leer("lib/facturacion/servidor.ts")) && /guardPage\("FACTURACION_ELECTRONICA", "PUNTOS"\)/.test(leer("app/(private)/facturacion/layout.tsx")));
  const menu = leer("lib/navigation/menu.ts");
  cierto("menú: «Puntos de expedición» en Facturación con el permiso PUNTOS y habilitado en V1", /id: "dispatch-points"[\s\S]{0,200}href: "\/facturacion\/puntos"[\s\S]{0,120}permission: "FACTURACION_ELECTRONICA\.PUNTOS"/.test(menu) && /"\/facturacion\/puntos",/.test(menu));

  // ── 5. Estructura de NEX-057, reversión y T19 ─────────────────────────────────────────────────────────────────────────────────────────────────
  const mig = leer("documentacao/banco/nexit/v1/migraciones/NEX-057-facturacion-puntos-expedicion-gestion.sql");
  const migraciones = readdirSync(join(raiz, "documentacao/banco/nexit/v1/migraciones")).filter((f) => /^NEX-\d+/.test(f)).sort();
  igual("NEX-057 y NEX-058 son las siguientes migraciones libres; NEX-048 no se editó (no conoce las funciones de gestión)", [migraciones.slice(-2).map((m) => m.slice(0, 7)), /fe_punto_crear/.test(leer("documentacao/banco/nexit/v1/migraciones/NEX-048-facturacion-emision-fe.sql"))], [["NEX-057", "NEX-058"], false]);
  cierto("NEX-057: permiso PUNTOS sin asignar a perfiles, bitácora inmutable (solo altas) con FK por empresa y trigger", /VALUES \('FACTURACION_ELECTRONICA\.PUNTOS'/.test(mig) && !/perfil_permiso/.test(mig.replace(/--.*$/gm, "")) && /CREATE TABLE public\.fe_puntos_expedicion_log/.test(mig) && /FOREIGN KEY \(empresa_id, punto_id\)/.test(mig) && /BEFORE UPDATE OR DELETE ON public\.fe_puntos_expedicion_log/.test(mig) && /BEFORE TRUNCATE ON public\.fe_puntos_expedicion_log/.test(mig));
  cierto("NEX-057: tres funciones SECURITY DEFINER con search_path fijo, permiso verificado dentro (42501), confirmación expresa, número obligatorio 0…9999998, código 001–999", (mig.match(/LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp/g) ?? []).length === 3 && (mig.match(/usuario_tiene_permiso\(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'PUNTOS'\)/g) ?? []).length === 3 && (mig.match(/p_confirmado IS NOT TRUE/g) ?? []).length === 2 && (mig.match(/NOT BETWEEN 0 AND 9999998/g) ?? []).length === 2 && /p_codigo !~ '\^\[0-9\]\{3\}\$' OR p_codigo = '000'/.test(mig));
  cierto("NEX-057: el punto nace INACTIVO, sin número por defecto (p_ultimo_numero sin DEFAULT), y se rechaza un número menor que el registrado o el ya emitido por Nexit", /VALUES \(p_empresa, p_sucursal, p_codigo, btrim\(p_nombre\), p_ultimo_numero, false\)/.test(mig) && !/p_ultimo_numero integer DEFAULT/.test(mig) && /NUMERO_MENOR_QUE_EMITIDOS/.test(mig) && /fe_punto_maximo_emitido/.test(mig) && /p_ultimo_numero < v_p\.ultimo_numero/.test(mig));
  cierto("NEX-057: no inserta puntos por su cuenta (un único INSERT INTO fe_puntos_expedicion, dentro de fe_punto_crear), no elimina, no baja el número y no toca la emisión", (mig.replace(/--.*$/gm, "").match(/INSERT INTO public\.fe_puntos_expedicion \(/g) ?? []).length === 1 && !/DELETE FROM public\.fe_puntos_expedicion\b/.test(mig.replace(/--.*$/gm, "")) && !/CREATE OR REPLACE FUNCTION public\.fe_documento_crear_fe/.test(mig) && /SET ultimo_numero = p_ultimo_numero, activo = true/.test(mig));
  cierto("NEX-057: grants — el runtime solo ejecuta las funciones y NO lee la bitácora (R01-02: sin RLS por empresa ni consumidor); PUBLIC revocado; el envoltorio de NEX-052 lo reaplica (helper nex_aplicar_grants_*)", /REVOKE ALL ON FUNCTION public\.fe_punto_crear[^;]+FROM PUBLIC/.test(mig) && /GRANT EXECUTE ON FUNCTION public\.fe_punto_crear[^;]+TO nexit_runtime/.test(mig) && !/GRANT[^;]*fe_puntos_expedicion_log[^;]*TO nexit_runtime/.test(mig.replace(/--.*$/gm, "")) && /REVOKE ALL ON public\.fe_puntos_expedicion_log FROM nexit_runtime/.test(mig) && /FUNCTION public\.nex_aplicar_grants_facturacion_puntos\(\)/.test(mig) && !/GRANT (INSERT|UPDATE|DELETE)[^;]*fe_puntos_expedicion TO nexit_runtime/.test(mig));
  cierto("R01-01 NEX-057: identidad fiscal (empresa + establecimiento + código) protegida en el alta (cualquier otro punto, activo o no, de OTRA sucursal), en la activación (otro punto ACTIVO) y por trigger BEFORE INSERT/UPDATE OF activo, sucursal_id; serializada con advisory lock transaccional por identidad", /fe_punto_identidad_en_uso\(p_empresa, v_est, p_codigo, p_sucursal, NULL, false\)/.test(mig) && /fe_punto_identidad_en_uso\(p_empresa, v_est, v_p\.codigo, v_p\.sucursal_id, v_p\.id, true\)/.test(mig) && /BEFORE INSERT OR UPDATE OF activo, sucursal_id ON public\.fe_puntos_expedicion/.test(mig) && /pg_advisory_xact_lock\(hashtextextended\('fe_punto\|' \|\| p_empresa::text/.test(mig) && (mig.match(/fe_punto_bloquear_identidad\(/g) ?? []).length >= 4 && /sx\.establecimiento_sifen = p_establecimiento AND x\.sucursal_id <> p_sucursal/.test(mig) && (mig.match(/NEX:IDENTIDAD_FISCAL_DUPLICADA/g) ?? []).length >= 3);
  cierto("R01-01 NEX-057: el trigger de identidad NO afecta la emisión (no se dispara con UPDATE de ultimo_numero), no impone restricción global a sucursales ni toca documentos, contadores, NEX-048 ni fe_documento_crear_fe", !/CREATE OR REPLACE FUNCTION public\.fe_documento_crear_fe/.test(mig) && !/ALTER TABLE public\.sucursales/.test(mig) && !/UPDATE public\.documentos_electronicos|DELETE FROM public\.documentos_electronicos/.test(mig.replace(/--.*$/gm, "")) && !/UNIQUE[^;]*establecimiento_sifen/.test(mig.replace(/--.*$/gm, "")) && /UPDATE OF activo, sucursal_id/.test(mig) && !/UPDATE OF[^;]*ultimo_numero/.test(mig));
  const m58 = leer("documentacao/banco/nexit/v1/migraciones/NEX-058-facturacion-establecimiento-protegido.sql");
  const m58sql = m58.replace(/--.*$/gm, "");
  cierto("R02-01 NEX-058 (migración APARTE, incremental, por si NEX-057 ya estuviera aplicada): trigger BEFORE UPDATE OF establecimiento_sifen en sucursales que rechaza el cambio (a otro valor o a NULL) si la sucursal tiene puntos (cualquier estado) o documentos, con error específico y exención del reinicio DEMO", /CREATE TRIGGER sucursales_establecimiento_protegido_trg BEFORE UPDATE OF establecimiento_sifen ON public\.sucursales/.test(m58sql) && /IS NOT DISTINCT FROM OLD\.establecimiento_sifen THEN\s+RETURN NEW/.test(m58sql) && /FROM public\.fe_puntos_expedicion WHERE empresa_id = OLD\.empresa_id AND sucursal_id = OLD\.id/.test(m58sql) && /FROM public\.documentos_electronicos WHERE empresa_id = OLD\.empresa_id AND sucursal_id = OLD\.id/.test(m58sql) && /NEX:ESTABLECIMIENTO_CON_PUNTOS/.test(m58sql) && /nex_reinicio_demo_activo\(OLD\.empresa_id\)/.test(m58sql) && /SECURITY DEFINER SET search_path = public, pg_temp/.test(m58sql));
  cierto("R02-01 NEX-058: serializa el alta de un punto con el cambio de establecimiento (BEFORE INSERT con SELECT … FOR SHARE sobre la sucursal), sin tocar NEX-048/NEX-057, la función de emisión, los documentos, los contadores ni imponer unicidad global", /CREATE TRIGGER fe_puntos_expedicion_bloquea_sucursal_trg BEFORE INSERT ON public\.fe_puntos_expedicion/.test(m58sql) && /FROM public\.sucursales WHERE empresa_id = NEW\.empresa_id AND id = NEW\.sucursal_id FOR SHARE/.test(m58sql) && !/fe_documento_crear_fe|ultimo_numero|CREATE OR REPLACE FUNCTION public\.fe_punto_/.test(m58sql) && !/UPDATE public\.|DELETE FROM|INSERT INTO|ALTER TABLE|UNIQUE/.test(m58sql) && /requiere NEX-057/.test(m58) && /parece aplicada/.test(m58) && /NO aplicada/.test(m58));
  const rev58 = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-058.sql");
  cierto("reversión NEX-058: quita solo los dos triggers y sus funciones (sin datos), avisa del riesgo y del orden (antes que NEX-057); la de NEX-057 sigue sin tocar puntos ni documentos", /DROP TRIGGER fe_puntos_expedicion_bloquea_sucursal_trg/.test(rev58) && /DROP TRIGGER sucursales_establecimiento_protegido_trg/.test(rev58) && /ANTES que NEX-057/.test(rev58) && !/DELETE|TRUNCATE|DROP TABLE/.test(rev58.replace(/--.*$/gm, "")));
  cierto("NEX-057: no se aplica por suposición (aborta si ya existe) y su estado dice «NO aplicada»", /parece aplicada/.test(mig) && /NO aplicada/.test(mig));
  const rev = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-057.sql");
  cierto("reversión: aborta con perfiles asignados o bitácora con registros, no toca puntos ni documentos", /hay perfiles con FACTURACION_ELECTRONICA\.PUNTOS asignado/.test(rev) && /la bitácora fe_puntos_expedicion_log tiene registros/.test(rev) && !/DROP TABLE public\.fe_puntos_expedicion;/.test(rev) && !/DELETE FROM public\.fe_puntos_expedicion;/.test(rev));
  const t19 = leer("documentacao/banco/nexit/v1/pruebas/T19-nex057-puntos-expedicion.sql");
  cierto("T19 versionada y registrada en el runner: permiso, alta/activación con confirmación, numeración monotónica y continuidad de la primera factura, aislamiento por empresa, inmutabilidad y grants", existsSync(join(raiz, "documentacao/banco/nexit/v1/pruebas/T19-nex057-puntos-expedicion.sql")) && /T18 T19; do/.test(leer("documentacao/banco/nexit/v1/scripts/ejecutar-pruebas.sh")) && /0000126/.test(t19) && /42501/.test(t19) && /nunca retrocede/.test(t19) && /aislamiento/.test(t19) && /has_table_privilege/.test(t19));
  const t20 = leer("documentacao/banco/nexit/v1/pruebas/T20-concurrencia-puntos.sh");
  cierto("R01-01 T19 ampliada: dos sucursales con el mismo establecimiento y código (activo e inactivo), error específico, código distinto válido, establecimiento distinto independiente, legado duplicado inactivo, activación y escritura directa rechazadas, sin números duplicados y sin tocar la numeración", /identidad: el código 001 del establecimiento 019 ya está ACTIVO en otra sucursal/.test(t19) && /ya existe \(INACTIVO\) en otra sucursal/.test(t19) && /NEX:IDENTIDAD_FISCAL_DUPLICADA/.test(t19) && /establecimiento DISTINTO \(020\)/.test(t19) && /identidad \(trigger\)/.test(t19) && /identidad \(activación\)/.test(t19) && /0000501/.test(t19) && /sin números duplicados/.test(t19) && /NOT has_table_privilege\('nexit_runtime', 'public\.fe_puntos_expedicion_log', 'SELECT'\)/.test(t19));
  cierto("R02-01 T19 ampliada: establecimiento con puntos activos e inactivos (colisión 031→030, NULL, valor libre) rechazado con NEX:ESTABLECIMIENTO_CON_PUNTOS sin cambiar valores ni numeración; mismo valor/otros datos permitidos; emisión intacta (0000101); sucursal solo con documentos protegida; sucursal sin puntos ni documentos normal; sin unicidad global; otra empresa no afectada", /NEX:ESTABLECIMIENTO_CON_PUNTOS/.test(t19) && /convertir 031 en 030/.test(t19) && /con el punto INACTIVO la colisión se rechaza igual/.test(t19) && /quitarlo \(NULL\) con puntos activos/.test(t19) && /reasignar el MISMO valor/.test(t19) && /0000101/.test(t19) && /con documentos emitidos \(aunque sin puntos\)/.test(t19) && /SIN puntos ni documentos puede cambiarlo, quitarlo y restablecerlo/.test(t19) && /NO hay unicidad global/.test(t19) && /otra empresa|los cambios que no tocan el establecimiento/.test(t19));
  cierto("R01-01 T20 (concurrencia real con dos sesiones, barrera por advisory lock como T17) registrada en el runner: altas y activaciones concurrentes de la misma identidad; la segunda queda bloqueada y es rechazada", /pg_stat_activity/.test(t20) && /wait_event_type='Lock'/.test(t20) && /IDENTIDAD_FISCAL_DUPLICADA/.test(t20) && /fe_punto_crear/.test(t20) && /fe_punto_activar/.test(t20) && /T20-concurrencia-puntos\.sh/.test(leer("documentacao/banco/nexit/v1/scripts/ejecutar-pruebas.sh")));

  // ── 6. Pantallas ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const pagina = leer("app/(private)/facturacion/puntos/page.tsx");
  cierto("pantalla de puntos: alta con último número obligatorio y casilla de confirmación, botón deshabilitado sin ambos, punto inactivo hasta activar confirmando de nuevo el número (no menor), desactivar sin eliminar", /Último número emitido \*/.test(pagina) && /Confirmo que/.test(pagina) && /disabled=\{!altaLista \|\| ocupado\}/.test(pagina) && /confirmaAlta/.test(pagina) && /Crear punto \(inactivo\)/.test(pagina) && /Number\(activando\.numero\) < p\.ultimoNumero/.test(pagina) && /Desactivar/.test(pagina) && !/Eliminar|DELETE/i.test(pagina) && /no se asume cero|Obligatorio; no se asume cero/.test(pagina));
  cierto("pantalla de puntos: no inicia ningún campo de número con valor por defecto (el estado inicial de «último número» es vacío)", /useState\(""\);\s+const \[confirmaAlta/.test(pagina) || /const \[ultimo, setUltimo\] = useState\(""\)/.test(pagina));
  const factura = leer("app/(private)/facturas/nueva/page.tsx");
  cierto("factura: sin punto activo muestra un mensaje breve y, SOLO con permiso, el enlace real «Configurar punto de expedición» (si no, «Solicite al administrador fiscal»); sin botón que cree puntos ni número", /no tiene un punto de expedición activo/.test(factura) && /puedeGestionarPuntos \? <Link href="\/facturacion\/puntos">Configurar punto de expedición<\/Link> : "Solicite al administrador fiscal/.test(factura) && !/fetch\("\/api\/facturacion\/puntos/.test(factura) && /puedeGestionarPuntos: await permisoPuntos/.test(leer("app/api/facturas/catalogos/route.ts")));
  cierto("emisión intacta: fe_documento_crear_fe sigue siendo la única que incrementa la numeración (ninguna ruta ni módulo TS escribe ultimo_numero)", !/ultimo_numero *=|SET ultimo_numero/.test(leer("lib/facturacion/emision.ts") + leer("lib/facturacion/envio.ts") + logica));

  return fallos;
}
