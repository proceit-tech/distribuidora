-- PRE-VERIFICACIÓN de NEX-085 (PRO-312-R02-C03: privilegios internos R05, hallazgo F-VM-084-01). SOLO LECTURA.
-- La ejecuta el responsable, con autorización expresa y en la ventana prevista, ANTES de aplicar NEX-085 con el runner oficial:
--   psql -X -v ON_ERROR_STOP=1 -v entorno=VM -f preflight-NEX-085.sql
-- entorno: VM (por defecto, modo estricto: el rol nexit_runtime DEBE existir) o CI (base efímera sin ese rol: su ausencia es intencional y se informa).
-- Transacción READ ONLY + ROLLBACK: no escribe nada, no concede ni revoca nada. Nada de esto fue ejecutado por Claude (ni en la VM ni en otra base).
-- Ejecutar con el rol propietario del esquema (el mismo del runner: debe poder redefinir el ayudante).
-- Sección 1: BLOQUEANTE. Cualquier fila con ok = false significa NO APLICAR hasta conciliar (dependencia incompatible).
-- Sección 2: INFORMATIVA. Muestra los privilegios efectivos actuales por firma exacta. Los EXECUTE de nexit_runtime sobre auxiliares internos (p. ej. los tres guardas de
-- F-VM-084-01) son el MOTIVO de la corrección: se esperan ANTES de NEX-085 y NO bloquean. Este preflight no exige que el control 63 de verificar-NEX-084.sql esté aprobado.
-- No muestra testigos, hashes de testigo, payloads, respuestas, CDC, lotes, credenciales ni identificadores de empresa/documento.
\if :{?entorno}
\else
  \set entorno VM
\endif
BEGIN READ ONLY;

\echo '== 1. Dependencias e incompatibilidades (BLOQUEANTE: todas deben dar ok = true) =='
WITH inv(categoria, firma) AS (VALUES
  ('GUARDA', 'public.nex_e03_r05_estado_guarda()'), ('GUARDA', 'public.fe_e03_r05_operacion_inicio_guarda()'),
  ('GUARDA', 'public.fe_e03_r05_evidencia_guarda()'), ('GUARDA', 'public.fe_e03_r05_post_grande_guarda()'),
  ('INTERNA', 'public.fe_e03_r05_claves_exactas(jsonb,text[])'), ('INTERNA', 'public.fe_e03_r05_bool(jsonb)'), ('INTERNA', 'public.fe_e03_r05_entero(jsonb,numeric,numeric)'),
  ('INTERNA', 'public.fe_e03_r05_texto(jsonb,integer,boolean)'), ('INTERNA', 'public.fe_e03_r05_enum(jsonb,text[])'), ('INTERNA', 'public.fe_e03_r05_lote_valido(text)'),
  ('INTERNA', 'public.fe_e03_r05_lote_nex080(text)'), ('INTERNA', 'public.fe_e03_r05_alterado(jsonb)'), ('INTERNA', 'public.fe_e03_r05_astral(text)'),
  ('INTERNA', 'public.fe_e03_r05_trim_js(text)'), ('INTERNA', 'public.fe_e03_r05_clase_eco(text,jsonb,jsonb,text)'), ('INTERNA', 'public.fe_e03_r05_token_mensaje(jsonb)'),
  ('INTERNA', 'public.fe_e03_r05_validar_proyeccion(jsonb,integer,text,text,text,text,jsonb)'), ('INTERNA', 'public.fe_e03_r05_sanear_proyeccion(jsonb)'),
  ('INTERNA', 'public.fe_e03_clasificar_recepcion_r05(jsonb,text)'), ('INTERNA', 'public.fe_e03_r05_cotejar(jsonb,jsonb,boolean,boolean)'),
  ('INTERNA', 'public.fe_e03_r05_procesar_proyeccion(jsonb,integer,text,text,text,text,jsonb,jsonb,boolean,boolean)'), ('INTERNA', 'public.fe_e03_r05_exigir_activo()'),
  ('INTERNA', 'public.fe_e03_r05_preparar(uuid,uuid,uuid)'), ('INTERNA', 'public.fe_e03_r05_hash_testigo(text)'), ('INTERNA', 'public.fe_e03_r05_operacion(uuid,uuid,uuid,uuid,text)'),
  ('INTERNA', 'public.fe_e03_r05_no_vigente(uuid,uuid,uuid,text)'), ('INTERNA', 'public.fe_e03_r05_token_rechazado_post1(uuid,uuid,uuid)'), ('INTERNA', 'public.fe_e03_r05_posts(uuid,uuid,uuid)'),
  ('INTERNA', 'public.fe_e03_r05_ultima_actividad(uuid,uuid,uuid)'), ('INTERNA', 'public.fe_e03_r05_abiertas(timestamptz)'), ('INTERNA', 'public.fe_e03_r05_derivar_cierre(uuid,uuid,uuid)'),
  ('AYUDANTE', 'public.nex_aplicar_grants_facturacion_e03_r05()'),
  ('ESCRITURA', 'public.fe_e03_iniciar_envio_r05(uuid,uuid,uuid,boolean,uuid,text,jsonb)'),
  ('ESCRITURA', 'public.fe_e03_registrar_autenticacion_r05(uuid,uuid,uuid,uuid,text,text,text,text,integer)'),
  ('ESCRITURA', 'public.fe_e03_registrar_post_r05(uuid,uuid,uuid,uuid,text,smallint,text)'),
  ('ESCRITURA', 'public.fe_e03_registrar_salida_r05(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text,jsonb,text)'),
  ('ESCRITURA', 'public.fe_e03_registrar_no_transmitido_r05(uuid,uuid,uuid,uuid,text,text)'),
  ('ESCRITURA', 'public.fe_e03_cerrar_envio_r05(uuid,uuid,uuid,uuid,text,jsonb)'),
  ('ESCRITURA', 'public.fe_e03_registrar_salida_tardia_r05(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text,jsonb,text)'),
  ('LECTURA', 'public.fe_e03_operacion_por_correlacion_r05(uuid,uuid,uuid,uuid)'), ('LECTURA', 'public.fe_e03_estado_operacion_r05(uuid,uuid,uuid,uuid)'),
  ('LECTURA', 'public.fe_e03_conexion_referencia_r05(uuid,uuid,uuid)')),
sm AS (SELECT to_regclass('public.schema_migrations') IS NOT NULL AS existe)
SELECT orden, control, ok FROM (
  SELECT 1 AS orden, 'schema_migrations existe (NEX-001)' AS control, (SELECT existe FROM sm) AS ok
  UNION ALL SELECT 2, 'NEX-084 registrada con checksum 38d45ea661ed5d8f1dc3d43dc6b0f727f8872c6bdd0fbab5745cc7802f5b6854 (instalada e inmutable)',
    CASE WHEN (SELECT existe FROM sm) THEN (xpath('/row/ok/text()', query_to_xml(
      $q$SELECT count(*) = 1 AS ok FROM public.schema_migrations WHERE version = 'NEX-084' AND checksum = '38d45ea661ed5d8f1dc3d43dc6b0f727f8872c6bdd0fbab5745cc7802f5b6854'$q$, false, true, '')))[1]::text = 'true' ELSE false END
  UNION ALL SELECT 3, 'NEX-085 NO registrada y ninguna versión NEX posterior registrada',
    CASE WHEN (SELECT existe FROM sm) THEN (xpath('/row/ok/text()', query_to_xml(
      $q$SELECT count(*) = 0 AS ok FROM public.schema_migrations WHERE version ~ '^NEX-[0-9]{3}$' AND version >= 'NEX-085'$q$, false, true, '')))[1]::text = 'true' ELSE false END
  UNION ALL SELECT 4, 'inventario NEX-084: 31 auxiliares internos + ayudante + 7 escrituras + 3 lecturas existen con su firma exacta (42)',
    (SELECT count(*) FROM inv WHERE to_regprocedure(firma) IS NOT NULL) = 42 AND (SELECT count(*) FROM inv) = 42
  UNION ALL SELECT 5, 'los 4 guardas son funciones de disparador (RETURNS trigger, sin argumentos)',
    (SELECT count(*) FROM inv i JOIN pg_proc p ON p.oid = to_regprocedure(i.firma) WHERE i.categoria = 'GUARDA' AND p.prorettype = 'trigger'::regtype AND p.pronargs = 0) = 4
  UNION ALL SELECT 6, 'ayudante nex_aplicar_grants_facturacion_e03_r05(): void, sin argumentos, SECURITY INVOKER, plpgsql (lo descubre el wrapper de NEX-052)',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang WHERE p.oid = to_regprocedure('public.nex_aplicar_grants_facturacion_e03_r05()')
              AND p.prorettype = 'void'::regtype AND p.pronargs = 0 AND NOT p.prosecdef AND l.lanname = 'plpgsql')
  UNION ALL SELECT 7, 'mecanismo de privilegios presente: nex_aplicar_grants_runtime() (wrapper NEX-052), nex_aplicar_grants_runtime_base() (NEX-037) y nex_aplicar_grants_facturacion_e03()',
    to_regprocedure('public.nex_aplicar_grants_runtime()') IS NOT NULL AND to_regprocedure('public.nex_aplicar_grants_runtime_base()') IS NOT NULL
    AND to_regprocedure('public.nex_aplicar_grants_facturacion_e03()') IS NOT NULL
  UNION ALL SELECT 8, 'rol actual dueño (o miembro del rol dueño) del ayudante R05 (CREATE OR REPLACE lo exige)',
    EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.nex_aplicar_grants_facturacion_e03_r05()') AND pg_has_role(current_user, p.proowner, 'USAGE'))
  UNION ALL SELECT 9, 'mismo dueño en los 42 objetos del inventario (dueño único de NEX-084)',
    (SELECT count(DISTINCT p.proowner) FROM inv i JOIN pg_proc p ON p.oid = to_regprocedure(i.firma)) = 1
  UNION ALL SELECT 10, 'nex_e03_r05_estado: exactamente una fila (id = true) con modo ACTIVO o REVERTIDO',
    to_regclass('public.nex_e03_r05_estado') IS NOT NULL
    AND (xpath('/row/ok/text()', query_to_xml(
      $q$SELECT count(*) = 1 AND bool_and(e.id AND e.modo IN ('ACTIVO', 'REVERTIDO')) AS ok FROM public.nex_e03_r05_estado e$q$, false, true, '')))[1]::text = 'true'
  UNION ALL SELECT 11, 'camino vigente de la aplicación presente: fe_documento_iniciar_envio y fe_documento_registrar_envio_r05 (NEX-062/NEX-080)',
    to_regprocedure('public.fe_documento_iniciar_envio(uuid,uuid,uuid,boolean)') IS NOT NULL
    AND to_regprocedure('public.fe_documento_registrar_envio_r05(uuid,uuid,uuid,text,text,text,text,integer,text,text,text,text,text,jsonb,jsonb)') IS NOT NULL
  UNION ALL SELECT 12, 'inmutabilidad y DEMO presentes: fe_e03_evidencia_inmutable() (NEX-072) y nex_reinicio_demo_activo(uuid) (NEX-012)',
    to_regprocedure('public.fe_e03_evidencia_inmutable()') IS NOT NULL AND to_regprocedure('public.nex_reinicio_demo_activo(uuid)') IS NOT NULL
  UNION ALL SELECT 13, 'entorno declarado: ' || :'entorno' || ' (valores admitidos VM o CI)', :'entorno' IN ('VM', 'CI')
  UNION ALL SELECT 14, 'rol nexit_runtime: obligatorio en VM; su ausencia solo se admite con -v entorno=CI (no se crea ningún rol)',
    EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') OR :'entorno' = 'CI'
) x ORDER BY orden;

\echo '== 2. Estado y privilegios efectivos actuales (INFORMATIVO; no bloquea) =='
SELECT 'modo R05' AS control, (SELECT e.modo FROM public.nex_e03_r05_estado e WHERE e.id) AS valor,
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN 'nexit_runtime existe' ELSE 'sin rol nexit_runtime (' || :'entorno' || ')' END AS rol;

-- Inventario por firma exacta: dueño, EXECUTE efectivo de nexit_runtime y de PUBLIC, concesiones DIRECTAS a nexit_runtime (concedente:privilegio, +go = grant option) y lo
-- esperado DESPUÉS de NEX-085 según el modo. «desvio_actual» = true marca lo que NEX-085 corrige (esperado antes de aplicar; no bloquea).
WITH inv(categoria, firma) AS (VALUES
  ('GUARDA', 'public.nex_e03_r05_estado_guarda()'), ('GUARDA', 'public.fe_e03_r05_operacion_inicio_guarda()'),
  ('GUARDA', 'public.fe_e03_r05_evidencia_guarda()'), ('GUARDA', 'public.fe_e03_r05_post_grande_guarda()'),
  ('INTERNA', 'public.fe_e03_r05_claves_exactas(jsonb,text[])'), ('INTERNA', 'public.fe_e03_r05_bool(jsonb)'), ('INTERNA', 'public.fe_e03_r05_entero(jsonb,numeric,numeric)'),
  ('INTERNA', 'public.fe_e03_r05_texto(jsonb,integer,boolean)'), ('INTERNA', 'public.fe_e03_r05_enum(jsonb,text[])'), ('INTERNA', 'public.fe_e03_r05_lote_valido(text)'),
  ('INTERNA', 'public.fe_e03_r05_lote_nex080(text)'), ('INTERNA', 'public.fe_e03_r05_alterado(jsonb)'), ('INTERNA', 'public.fe_e03_r05_astral(text)'),
  ('INTERNA', 'public.fe_e03_r05_trim_js(text)'), ('INTERNA', 'public.fe_e03_r05_clase_eco(text,jsonb,jsonb,text)'), ('INTERNA', 'public.fe_e03_r05_token_mensaje(jsonb)'),
  ('INTERNA', 'public.fe_e03_r05_validar_proyeccion(jsonb,integer,text,text,text,text,jsonb)'), ('INTERNA', 'public.fe_e03_r05_sanear_proyeccion(jsonb)'),
  ('INTERNA', 'public.fe_e03_clasificar_recepcion_r05(jsonb,text)'), ('INTERNA', 'public.fe_e03_r05_cotejar(jsonb,jsonb,boolean,boolean)'),
  ('INTERNA', 'public.fe_e03_r05_procesar_proyeccion(jsonb,integer,text,text,text,text,jsonb,jsonb,boolean,boolean)'), ('INTERNA', 'public.fe_e03_r05_exigir_activo()'),
  ('INTERNA', 'public.fe_e03_r05_preparar(uuid,uuid,uuid)'), ('INTERNA', 'public.fe_e03_r05_hash_testigo(text)'), ('INTERNA', 'public.fe_e03_r05_operacion(uuid,uuid,uuid,uuid,text)'),
  ('INTERNA', 'public.fe_e03_r05_no_vigente(uuid,uuid,uuid,text)'), ('INTERNA', 'public.fe_e03_r05_token_rechazado_post1(uuid,uuid,uuid)'), ('INTERNA', 'public.fe_e03_r05_posts(uuid,uuid,uuid)'),
  ('INTERNA', 'public.fe_e03_r05_ultima_actividad(uuid,uuid,uuid)'), ('INTERNA', 'public.fe_e03_r05_abiertas(timestamptz)'), ('INTERNA', 'public.fe_e03_r05_derivar_cierre(uuid,uuid,uuid)'),
  ('AYUDANTE', 'public.nex_aplicar_grants_facturacion_e03_r05()'),
  ('ESCRITURA', 'public.fe_e03_iniciar_envio_r05(uuid,uuid,uuid,boolean,uuid,text,jsonb)'),
  ('ESCRITURA', 'public.fe_e03_registrar_autenticacion_r05(uuid,uuid,uuid,uuid,text,text,text,text,integer)'),
  ('ESCRITURA', 'public.fe_e03_registrar_post_r05(uuid,uuid,uuid,uuid,text,smallint,text)'),
  ('ESCRITURA', 'public.fe_e03_registrar_salida_r05(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text,jsonb,text)'),
  ('ESCRITURA', 'public.fe_e03_registrar_no_transmitido_r05(uuid,uuid,uuid,uuid,text,text)'),
  ('ESCRITURA', 'public.fe_e03_cerrar_envio_r05(uuid,uuid,uuid,uuid,text,jsonb)'),
  ('ESCRITURA', 'public.fe_e03_registrar_salida_tardia_r05(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text,jsonb,text)'),
  ('LECTURA', 'public.fe_e03_operacion_por_correlacion_r05(uuid,uuid,uuid,uuid)'), ('LECTURA', 'public.fe_e03_estado_operacion_r05(uuid,uuid,uuid,uuid)'),
  ('LECTURA', 'public.fe_e03_conexion_referencia_r05(uuid,uuid,uuid)')),
rt AS (SELECT (SELECT oid FROM pg_roles WHERE rolname = 'nexit_runtime') AS oid),
modo AS (SELECT (SELECT e.modo FROM public.nex_e03_r05_estado e WHERE e.id) AS valor),
fila AS (
  SELECT i.categoria, i.firma, p.oid, pg_get_userbyid(p.proowner) AS dueno,
         CASE WHEN (SELECT oid FROM rt) IS NULL THEN NULL ELSE has_function_privilege('nexit_runtime', p.oid, 'EXECUTE') END AS runtime_execute,
         has_function_privilege('public', p.oid, 'EXECUTE') AS public_execute,
         (SELECT string_agg(pg_get_userbyid(a.grantor) || ':' || a.privilege_type || CASE WHEN a.is_grantable THEN '+go' ELSE '' END, ', ')
            FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = (SELECT oid FROM rt)) AS concesiones_directas_runtime,
         CASE i.categoria WHEN 'LECTURA' THEN true WHEN 'ESCRITURA' THEN (SELECT valor FROM modo) = 'ACTIVO' ELSE false END AS esperado_tras_nex085
    FROM inv i LEFT JOIN pg_proc p ON p.oid = to_regprocedure(i.firma))
SELECT categoria, firma, dueno, runtime_execute, public_execute, concesiones_directas_runtime, esperado_tras_nex085,
       (runtime_execute IS DISTINCT FROM esperado_tras_nex085 AND runtime_execute IS NOT NULL) OR public_execute AS desvio_actual
  FROM fila ORDER BY CASE categoria WHEN 'GUARDA' THEN 1 WHEN 'INTERNA' THEN 2 WHEN 'AYUDANTE' THEN 3 WHEN 'LECTURA' THEN 4 ELSE 5 END, firma;

SELECT 'control 63 de verificar-NEX-084.sql HOY (informativo: false es el hallazgo F-VM-084-01 que NEX-085 corrige)' AS control,
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN NULL
            ELSE NOT EXISTS (SELECT 1 FROM unnest(ARRAY['public.fe_e03_operacion_por_correlacion_r05(uuid,uuid,uuid,uuid)', 'public.fe_e03_conexion_referencia_r05(uuid,uuid,uuid)',
                                                        'public.fe_e03_estado_operacion_r05(uuid,uuid,uuid,uuid)']) l(firma)
                              WHERE NOT has_function_privilege('nexit_runtime', l.firma, 'EXECUTE'))
                 AND NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'fe\_e03\_r05\_%'
                                   AND has_function_privilege('nexit_runtime', p.oid, 'EXECUTE')) END AS ok_hoy;

-- Otras funciones del espacio E03/R05 fuera del inventario de NEX-084 (informativo: NEX-085 NO las toca; fe_e03_evidencia_inmutable() es de NEX-072 y la usan los disparadores).
SELECT p.oid::regprocedure AS firma, pg_get_userbyid(p.proowner) AS dueno, p.prorettype::regtype AS retorno,
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN NULL ELSE has_function_privilege('nexit_runtime', p.oid, 'EXECUTE') END AS runtime_execute
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND (p.proname LIKE 'fe\_e03\_%' OR p.proname LIKE 'nex\_e03\_%' OR p.proname LIKE 'nex\_aplicar\_grants\_facturacion\_e03%')
   AND p.proname NOT LIKE 'fe\_e03\_r05\_%' AND p.proname NOT LIKE 'fe\_e03\_%\_r05'
   AND p.proname NOT IN ('nex_e03_r05_estado_guarda', 'nex_aplicar_grants_facturacion_e03_r05')
 ORDER BY p.oid::regprocedure::text;

-- Disparadores que usan los guardas de NEX-084 (informativo: deben seguir habilitados; NEX-085 no los modifica).
SELECT g.tgname AS disparador, g.tgrelid::regclass AS tabla, g.tgfoid::regprocedure AS funcion, g.tgenabled AS habilitado
  FROM pg_trigger g
 WHERE NOT g.tgisinternal
   AND g.tgfoid IN (to_regprocedure('public.nex_e03_r05_estado_guarda()'), to_regprocedure('public.fe_e03_r05_operacion_inicio_guarda()'),
                    to_regprocedure('public.fe_e03_r05_evidencia_guarda()'), to_regprocedure('public.fe_e03_r05_post_grande_guarda()'))
 ORDER BY 1;

ROLLBACK;
