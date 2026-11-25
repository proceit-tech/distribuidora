-- VERIFICACIÓN POSTERIOR de NEX-085 (PRO-312-R02-C03: privilegios internos R05, hallazgo F-VM-084-01). SOLO LECTURA.
-- La ejecuta el responsable DESPUÉS de aplicar NEX-085 con el runner (y después de cualquier reaplicación de nex_aplicar_grants_runtime()):
--   psql -X -v ON_ERROR_STOP=1 -v entorno=VM -f verificar-NEX-085.sql
-- y a continuación, SIN modificarlo, el verificador original de NEX-084 (sus 41 controles, incluido el 63, deben dar ok = true):
--   psql -X -v ON_ERROR_STOP=1 -v entorno=VM -f verificar-NEX-084.sql
-- entorno: VM (por defecto, modo estricto: el rol nexit_runtime DEBE existir) o CI (base efímera sin ese rol: su ausencia es intencional y los controles de rol se omiten).
-- Transacción READ ONLY + ROLLBACK: no escribe nada, no concede ni revoca nada. Nada de esto fue ejecutado por Claude.
-- Sección 1: toda fila debe dar ok = true. Sección 2: desvíos por FIRMA EXACTA (lo esperado es 0 filas). Sección 3: informativa.
-- Límite: esta lectura comprueba el estado de privilegios EN ESTE MOMENTO. No prueba por sí sola que el estado persista tras reaplicar el wrapper: eso se razona por el orden
-- base → ayudantes (NEX-052) y se demuestra con la prueba futura descrita al final (base descartable, rol real, reaplicación doble en ACTIVO y REVERTIDO), NO ejecutada.
-- No muestra testigos, hashes de testigo, payloads, respuestas, CDC, lotes ni credenciales.
\if :{?entorno}
\else
  \set entorno VM
\endif
BEGIN READ ONLY;

\echo '== 1. Instalación, inventario y privilegios efectivos (todas deben dar ok = true) =='
WITH internas(firma) AS (VALUES
  ('public.nex_e03_r05_estado_guarda()'), ('public.fe_e03_r05_operacion_inicio_guarda()'), ('public.fe_e03_r05_evidencia_guarda()'), ('public.fe_e03_r05_post_grande_guarda()'),
  ('public.fe_e03_r05_claves_exactas(jsonb, text[])'), ('public.fe_e03_r05_bool(jsonb)'), ('public.fe_e03_r05_entero(jsonb, numeric, numeric)'),
  ('public.fe_e03_r05_texto(jsonb, integer, boolean)'), ('public.fe_e03_r05_enum(jsonb, text[])'), ('public.fe_e03_r05_lote_valido(text)'), ('public.fe_e03_r05_lote_nex080(text)'),
  ('public.fe_e03_r05_alterado(jsonb)'), ('public.fe_e03_r05_astral(text)'), ('public.fe_e03_r05_trim_js(text)'), ('public.fe_e03_r05_clase_eco(text, jsonb, jsonb, text)'),
  ('public.fe_e03_r05_token_mensaje(jsonb)'), ('public.fe_e03_r05_validar_proyeccion(jsonb, integer, text, text, text, text, jsonb)'), ('public.fe_e03_r05_sanear_proyeccion(jsonb)'),
  ('public.fe_e03_clasificar_recepcion_r05(jsonb, text)'), ('public.fe_e03_r05_cotejar(jsonb, jsonb, boolean, boolean)'),
  ('public.fe_e03_r05_procesar_proyeccion(jsonb, integer, text, text, text, text, jsonb, jsonb, boolean, boolean)'), ('public.fe_e03_r05_exigir_activo()'),
  ('public.fe_e03_r05_preparar(uuid, uuid, uuid)'), ('public.fe_e03_r05_hash_testigo(text)'), ('public.fe_e03_r05_operacion(uuid, uuid, uuid, uuid, text)'),
  ('public.fe_e03_r05_no_vigente(uuid, uuid, uuid, text)'), ('public.fe_e03_r05_token_rechazado_post1(uuid, uuid, uuid)'), ('public.fe_e03_r05_posts(uuid, uuid, uuid)'),
  ('public.fe_e03_r05_ultima_actividad(uuid, uuid, uuid)'), ('public.fe_e03_r05_abiertas(timestamptz)'), ('public.fe_e03_r05_derivar_cierre(uuid, uuid, uuid)'),
  ('public.nex_aplicar_grants_facturacion_e03_r05()')),
escrituras(firma) AS (VALUES
  ('public.fe_e03_iniciar_envio_r05(uuid,uuid,uuid,boolean,uuid,text,jsonb)'),
  ('public.fe_e03_registrar_autenticacion_r05(uuid,uuid,uuid,uuid,text,text,text,text,integer)'),
  ('public.fe_e03_registrar_post_r05(uuid,uuid,uuid,uuid,text,smallint,text)'),
  ('public.fe_e03_registrar_salida_r05(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text,jsonb,text)'),
  ('public.fe_e03_registrar_no_transmitido_r05(uuid,uuid,uuid,uuid,text,text)'),
  ('public.fe_e03_cerrar_envio_r05(uuid,uuid,uuid,uuid,text,jsonb)'),
  ('public.fe_e03_registrar_salida_tardia_r05(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text,jsonb,text)')),
lecturas(firma) AS (VALUES ('public.fe_e03_operacion_por_correlacion_r05(uuid,uuid,uuid,uuid)'), ('public.fe_e03_conexion_referencia_r05(uuid,uuid,uuid)'),
                           ('public.fe_e03_estado_operacion_r05(uuid,uuid,uuid,uuid)')),
legado(firma) AS (VALUES ('public.fe_e03_iniciar_envio(uuid,uuid,uuid,boolean)'),
  ('public.fe_e03_registrar_evento(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text)'),
  ('public.fe_e03_cerrar_envio(uuid,uuid,uuid,uuid,text,text,text,text,integer,text,text,text,text,text,text,jsonb)')),
r05(nombre) AS (VALUES ('documento_electronico_envio_operaciones_r05'), ('documento_electronico_envio_posts_grandes_r05'), ('documento_electronico_envio_autenticaciones_r05'),
                       ('documento_electronico_envio_proyecciones_r05'), ('documento_electronico_envio_cierres_r05'), ('documento_electronico_envio_salidas_tardias_r05')),
rt AS (SELECT (SELECT oid FROM pg_roles WHERE rolname = 'nexit_runtime') AS oid),
modo AS (SELECT (SELECT e.modo FROM public.nex_e03_r05_estado e WHERE e.id) AS valor),
ayudante AS (SELECT p.* FROM pg_proc p WHERE p.oid = to_regprocedure('public.nex_aplicar_grants_facturacion_e03_r05()'))
SELECT orden, control, ok FROM (
  -- 1–2. Registro y checksums
  SELECT 1 AS orden, 'NEX-085 registrada en schema_migrations con checksum 34f57411cef8f17c01f249b6e21e1904c8aa7aecd83718965bcfbadd4b29c7d7' AS control,
    EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 'NEX-085' AND checksum = '34f57411cef8f17c01f249b6e21e1904c8aa7aecd83718965bcfbadd4b29c7d7') AS ok
  UNION ALL SELECT 2, 'NEX-084 conserva su registro y checksum ORIGINAL 38d45ea661ed5d8f1dc3d43dc6b0f727f8872c6bdd0fbab5745cc7802f5b6854 (inmutable; NEX-085 no la reaplica)',
    EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 'NEX-084' AND checksum = '38d45ea661ed5d8f1dc3d43dc6b0f727f8872c6bdd0fbab5745cc7802f5b6854')
    AND (SELECT aplicada_at FROM public.schema_migrations WHERE version = 'NEX-084') <= (SELECT aplicada_at FROM public.schema_migrations WHERE version = 'NEX-085')
  UNION ALL SELECT 3, 'entorno declarado: ' || :'entorno' || ' (valores admitidos VM o CI)', :'entorno' IN ('VM', 'CI')
  UNION ALL SELECT 4, 'rol nexit_runtime: obligatorio en VM; su ausencia solo se admite con -v entorno=CI (los controles de rol la toleran solo por eso)',
    (SELECT oid FROM rt) IS NOT NULL OR :'entorno' = 'CI'
  UNION ALL SELECT 5, 'nex_e03_r05_estado: exactamente una fila (id = true) con modo ACTIVO o REVERTIDO',
    (SELECT count(*) = 1 AND bool_and(e.id AND e.modo IN ('ACTIVO', 'REVERTIDO')) FROM public.nex_e03_r05_estado e)
  -- 3. Ayudante corregido y firmas
  UNION ALL SELECT 10, 'ayudante nex_aplicar_grants_facturacion_e03_r05(): void, sin argumentos, SECURITY INVOKER, plpgsql (lo descubre el wrapper de NEX-052)',
    EXISTS (SELECT 1 FROM ayudante a JOIN pg_language l ON l.oid = a.prolang WHERE a.prorettype = 'void'::regtype AND a.pronargs = 0 AND NOT a.prosecdef AND l.lanname = 'plpgsql')
  UNION ALL SELECT 11, 'ayudante corregido: contiene REVOKE ALL ... FROM nexit_runtime por firma exacta en los 32 objetos internos (31 auxiliares + él mismo)',
    (SELECT count(*) FROM internas i, ayudante a
      WHERE position(format('REVOKE ALL ON FUNCTION %s FROM nexit_runtime;', i.firma) IN a.prosrc) > 0) = 32
  UNION ALL SELECT 12, 'ayudante conserva el cuerpo de NEX-084: SELECT por columnas sin testigo_sha256, 7 SELECT, 3 lecturas y 7 escrituras en la rama ACTIVO (17 concesiones) y rama REVERTIDO',
    (SELECT position('GRANT SELECT (operacion_id, empresa_id, documento_id, version, correlacion_id, actor_id, confirma_rechazo, conexion, payload_hash, creado_at)' IN prosrc) > 0
            AND position('testigo_sha256' IN prosrc) = 0
            AND position('IF v_modo = ''ACTIVO'' THEN' IN prosrc) > 0
            AND (length(prosrc) - length(replace(prosrc, 'TO nexit_runtime;', ''))) / length('TO nexit_runtime;') = 17
       FROM ayudante)
  UNION ALL SELECT 13, 'inventario: 31 auxiliares + ayudante + 7 escrituras + 3 lecturas existen con su firma exacta (42) y sin firmas anteriores',
    (SELECT count(*) FROM (SELECT firma FROM internas UNION ALL SELECT firma FROM escrituras UNION ALL SELECT firma FROM lecturas) f WHERE to_regprocedure(f.firma) IS NOT NULL) = 42
    AND to_regprocedure('public.fe_e03_r05_validar_proyeccion(jsonb,integer,text,text,text,text,text)') IS NULL
    AND to_regprocedure('public.fe_e03_registrar_salida_tardia_r05(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text,jsonb)') IS NULL
  UNION ALL SELECT 14, 'mecanismo general intacto: wrapper nex_aplicar_grants_runtime() y base nex_aplicar_grants_runtime_base() presentes (NEX-085 no los redefine)',
    to_regprocedure('public.nex_aplicar_grants_runtime()') IS NOT NULL AND to_regprocedure('public.nex_aplicar_grants_runtime_base()') IS NOT NULL
  -- 4. Tres lecturas
  UNION ALL SELECT 20, 'nexit_runtime: EXECUTE de las 3 lecturas R05 (en cualquier modo)',
    (SELECT oid FROM rt) IS NULL OR NOT EXISTS (SELECT 1 FROM lecturas l WHERE NOT has_function_privilege('nexit_runtime', l.firma, 'EXECUTE'))
  -- 5. Siete escrituras según el modo
  UNION ALL SELECT 21, 'modo ACTIVO → nexit_runtime tiene EXECUTE en las 7 escrituras R05',
    (SELECT oid FROM rt) IS NULL OR (SELECT valor FROM modo) <> 'ACTIVO' OR NOT EXISTS (SELECT 1 FROM escrituras e WHERE NOT has_function_privilege('nexit_runtime', e.firma, 'EXECUTE'))
  UNION ALL SELECT 22, 'modo REVERTIDO → nexit_runtime NO tiene EXECUTE en ninguna escritura R05',
    (SELECT oid FROM rt) IS NULL OR (SELECT valor FROM modo) <> 'REVERTIDO' OR NOT EXISTS (SELECT 1 FROM escrituras e WHERE has_function_privilege('nexit_runtime', e.firma, 'EXECUTE'))
  -- 6. Auxiliares internos sin EXECUTE efectivo ni concesión directa a runtime (incluye el guarda global y los auxiliares fuera del prefijo fe_e03_r05_)
  UNION ALL SELECT 23, 'nexit_runtime: SIN EXECUTE efectivo en los 31 auxiliares internos ni en el ayudante (4 guardas, nex_e03_r05_estado_guarda y fe_e03_clasificar_recepcion_r05 incluidos)',
    (SELECT oid FROM rt) IS NULL OR NOT EXISTS (SELECT 1 FROM internas i WHERE has_function_privilege('nexit_runtime', i.firma, 'EXECUTE'))
  UNION ALL SELECT 24, 'nexit_runtime: sin concesión DIRECTA (ni grant option) en ningún auxiliar interno ni en el ayudante (ACL sin entrada de runtime)',
    (SELECT oid FROM rt) IS NULL OR NOT EXISTS (SELECT 1 FROM internas i JOIN pg_proc p ON p.oid = to_regprocedure(i.firma), aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                                                  WHERE a.grantee = (SELECT oid FROM rt))
  UNION ALL SELECT 25, 'réplica del control 63 de verificar-NEX-084.sql: 3 lecturas con EXECUTE y ninguna función fe_e03_r05_% con EXECUTE de runtime',
    (SELECT oid FROM rt) IS NULL OR (NOT EXISTS (SELECT 1 FROM lecturas l WHERE NOT has_function_privilege('nexit_runtime', l.firma, 'EXECUTE'))
      AND NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'fe\_e03\_r05\_%' AND has_function_privilege('nexit_runtime', p.oid, 'EXECUTE')))
  -- 7. PUBLIC
  UNION ALL SELECT 30, 'PUBLIC sin EXECUTE en ninguno de los 42 objetos del inventario',
    NOT EXISTS (SELECT 1 FROM (SELECT firma FROM internas UNION ALL SELECT firma FROM escrituras UNION ALL SELECT firma FROM lecturas) f
                 WHERE has_function_privilege('public', f.firma, 'EXECUTE'))
  -- 8. Testigo
  UNION ALL SELECT 31, 'testigo privado: nexit_runtime NUNCA lee operaciones_r05.testigo_sha256; SELECT solo por columnas en operaciones_r05',
    (SELECT oid FROM rt) IS NULL OR (NOT has_column_privilege('nexit_runtime', 'public.documento_electronico_envio_operaciones_r05', 'testigo_sha256', 'SELECT')
      AND has_column_privilege('nexit_runtime', 'public.documento_electronico_envio_operaciones_r05', 'correlacion_id', 'SELECT')
      AND NOT has_table_privilege('nexit_runtime', 'public.documento_electronico_envio_operaciones_r05', 'SELECT'))
  -- 9. Tablas
  UNION ALL SELECT 32, 'tablas R05 y nex_e03_r05_estado: SELECT para nexit_runtime (salvo operaciones_r05, por columnas) y sin INSERT/UPDATE/DELETE/TRUNCATE',
    (SELECT oid FROM rt) IS NULL OR (
      NOT EXISTS (SELECT 1 FROM (SELECT nombre FROM r05 UNION ALL SELECT 'nex_e03_r05_estado') t
        WHERE has_table_privilege('nexit_runtime', 'public.' || t.nombre, 'INSERT') OR has_table_privilege('nexit_runtime', 'public.' || t.nombre, 'UPDATE')
           OR has_table_privilege('nexit_runtime', 'public.' || t.nombre, 'DELETE') OR has_table_privilege('nexit_runtime', 'public.' || t.nombre, 'TRUNCATE'))
      AND NOT EXISTS (SELECT 1 FROM (SELECT nombre FROM r05 UNION ALL SELECT 'nex_e03_r05_estado') t
        WHERE t.nombre <> 'documento_electronico_envio_operaciones_r05' AND NOT has_table_privilege('nexit_runtime', 'public.' || t.nombre, 'SELECT')))
  -- 10. Camino vigente de la aplicación
  UNION ALL SELECT 33, 'camino vigente de la aplicación (NEX-062/NEX-080): EXECUTE de nexit_runtime en fe_documento_iniciar_envio y fe_documento_registrar_envio_r05',
    (SELECT oid FROM rt) IS NULL OR (has_function_privilege('nexit_runtime', 'public.fe_documento_iniciar_envio(uuid,uuid,uuid,boolean)', 'EXECUTE')
      AND has_function_privilege('nexit_runtime', 'public.fe_documento_registrar_envio_r05(uuid,uuid,uuid,text,text,text,text,integer,text,text,text,text,text,jsonb,jsonb)', 'EXECUTE'))
  -- 11. Funciones E03 antiguas restringidas
  UNION ALL SELECT 34, 'E03 antiguas (NEX-072): sin EXECUTE de nexit_runtime en sus 3 escrituras; evidencia NEX-072 solo SELECT; nex_aplicar_grants_facturacion_e03() sin EXECUTE',
    (SELECT oid FROM rt) IS NULL OR (NOT EXISTS (SELECT 1 FROM legado l WHERE has_function_privilege('nexit_runtime', l.firma, 'EXECUTE'))
      AND NOT has_table_privilege('nexit_runtime', 'public.documento_electronico_envio_evidencias', 'INSERT')
      AND has_table_privilege('nexit_runtime', 'public.documento_electronico_envio_evidencias', 'SELECT')
      AND NOT has_function_privilege('nexit_runtime', 'public.nex_aplicar_grants_facturacion_e03()', 'EXECUTE'))
  -- 12. Disparadores y DEMO
  UNION ALL SELECT 40, 'disparadores R05 preservados y habilitados: 2 guardas de estado, inicio de operación, guarda de evidencia NEX-072, guarda de POST grande y 12 de inmutabilidad (17)',
    (SELECT count(*) FROM pg_trigger g WHERE NOT g.tgisinternal AND g.tgenabled = 'O'
       AND g.tgfoid IN (to_regprocedure('public.nex_e03_r05_estado_guarda()'), to_regprocedure('public.fe_e03_r05_operacion_inicio_guarda()'),
                        to_regprocedure('public.fe_e03_r05_evidencia_guarda()'), to_regprocedure('public.fe_e03_r05_post_grande_guarda()'))) = 5
    AND (SELECT count(*) FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
          WHERE c.relname IN (SELECT nombre FROM r05) AND g.tgfoid = to_regprocedure('public.fe_e03_evidencia_inmutable()') AND NOT g.tgisinternal AND g.tgenabled = 'O') = 12
  UNION ALL SELECT 41, 'DEMO preservado: nex_reinicio_demo_activo(uuid) existe y fe_e03_evidencia_inmutable() (NEX-072) sigue condicionando el borrado al reinicio DEMO',
    to_regprocedure('public.nex_reinicio_demo_activo(uuid)') IS NOT NULL
    AND (SELECT position('nex_reinicio_demo_activo' IN prosrc) > 0 FROM pg_proc WHERE oid = to_regprocedure('public.fe_e03_evidencia_inmutable()'))
  UNION ALL SELECT 42, 'guardas de NEX-084 siguen siendo funciones de disparador del mismo dueño que el ayudante (NEX-085 no los redefine)',
    (SELECT count(*) FROM pg_proc p WHERE p.prorettype = 'trigger'::regtype AND p.proowner = (SELECT proowner FROM ayudante)
       AND p.oid IN (to_regprocedure('public.nex_e03_r05_estado_guarda()'), to_regprocedure('public.fe_e03_r05_operacion_inicio_guarda()'),
                     to_regprocedure('public.fe_e03_r05_evidencia_guarda()'), to_regprocedure('public.fe_e03_r05_post_grande_guarda()'))) = 4
) x ORDER BY orden;

\echo '== 2. Desvíos por firma exacta (lo esperado es 0 filas) =='
WITH inv(categoria, firma) AS (VALUES
  ('INTERNA', 'public.nex_e03_r05_estado_guarda()'), ('INTERNA', 'public.fe_e03_r05_operacion_inicio_guarda()'), ('INTERNA', 'public.fe_e03_r05_evidencia_guarda()'),
  ('INTERNA', 'public.fe_e03_r05_post_grande_guarda()'), ('INTERNA', 'public.fe_e03_r05_claves_exactas(jsonb,text[])'), ('INTERNA', 'public.fe_e03_r05_bool(jsonb)'),
  ('INTERNA', 'public.fe_e03_r05_entero(jsonb,numeric,numeric)'), ('INTERNA', 'public.fe_e03_r05_texto(jsonb,integer,boolean)'), ('INTERNA', 'public.fe_e03_r05_enum(jsonb,text[])'),
  ('INTERNA', 'public.fe_e03_r05_lote_valido(text)'), ('INTERNA', 'public.fe_e03_r05_lote_nex080(text)'), ('INTERNA', 'public.fe_e03_r05_alterado(jsonb)'),
  ('INTERNA', 'public.fe_e03_r05_astral(text)'), ('INTERNA', 'public.fe_e03_r05_trim_js(text)'), ('INTERNA', 'public.fe_e03_r05_clase_eco(text,jsonb,jsonb,text)'),
  ('INTERNA', 'public.fe_e03_r05_token_mensaje(jsonb)'), ('INTERNA', 'public.fe_e03_r05_validar_proyeccion(jsonb,integer,text,text,text,text,jsonb)'),
  ('INTERNA', 'public.fe_e03_r05_sanear_proyeccion(jsonb)'), ('INTERNA', 'public.fe_e03_clasificar_recepcion_r05(jsonb,text)'),
  ('INTERNA', 'public.fe_e03_r05_cotejar(jsonb,jsonb,boolean,boolean)'), ('INTERNA', 'public.fe_e03_r05_procesar_proyeccion(jsonb,integer,text,text,text,text,jsonb,jsonb,boolean,boolean)'),
  ('INTERNA', 'public.fe_e03_r05_exigir_activo()'), ('INTERNA', 'public.fe_e03_r05_preparar(uuid,uuid,uuid)'), ('INTERNA', 'public.fe_e03_r05_hash_testigo(text)'),
  ('INTERNA', 'public.fe_e03_r05_operacion(uuid,uuid,uuid,uuid,text)'), ('INTERNA', 'public.fe_e03_r05_no_vigente(uuid,uuid,uuid,text)'),
  ('INTERNA', 'public.fe_e03_r05_token_rechazado_post1(uuid,uuid,uuid)'), ('INTERNA', 'public.fe_e03_r05_posts(uuid,uuid,uuid)'),
  ('INTERNA', 'public.fe_e03_r05_ultima_actividad(uuid,uuid,uuid)'), ('INTERNA', 'public.fe_e03_r05_abiertas(timestamptz)'), ('INTERNA', 'public.fe_e03_r05_derivar_cierre(uuid,uuid,uuid)'),
  ('INTERNA', 'public.nex_aplicar_grants_facturacion_e03_r05()'),
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
  SELECT i.categoria, i.firma, p.oid,
         CASE WHEN (SELECT oid FROM rt) IS NULL THEN NULL ELSE has_function_privilege('nexit_runtime', p.oid, 'EXECUTE') END AS runtime_execute,
         CASE WHEN (SELECT oid FROM rt) IS NULL THEN NULL ELSE has_function_privilege('nexit_runtime', p.oid, 'EXECUTE WITH GRANT OPTION') END AS runtime_grant_option,
         has_function_privilege('public', p.oid, 'EXECUTE') AS public_execute,
         CASE i.categoria WHEN 'LECTURA' THEN true WHEN 'ESCRITURA' THEN (SELECT valor FROM modo) = 'ACTIVO' ELSE false END AS esperado
    FROM inv i LEFT JOIN pg_proc p ON p.oid = to_regprocedure(i.firma))
SELECT categoria, firma,
       CASE WHEN oid IS NULL THEN 'firma inexistente'
            WHEN public_execute THEN 'PUBLIC con EXECUTE'
            WHEN runtime_execute IS NOT NULL AND runtime_execute <> esperado THEN 'nexit_runtime EXECUTE = ' || runtime_execute || ' (esperado ' || esperado || ', modo ' || (SELECT valor FROM modo) || ')'
            WHEN runtime_grant_option THEN 'nexit_runtime con grant option' END AS desvio
  FROM fila
 WHERE oid IS NULL OR public_execute OR (runtime_execute IS NOT NULL AND runtime_execute <> esperado) OR runtime_grant_option
 ORDER BY categoria, firma;

\echo '== 3. Estado (informativo) =='
SELECT (SELECT e.modo FROM public.nex_e03_r05_estado e WHERE e.id) AS modo_r05,
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN 'nexit_runtime existe' ELSE 'sin rol nexit_runtime (' || :'entorno' || ')' END AS rol,
       (SELECT aplicada_at FROM public.schema_migrations WHERE version = 'NEX-085') AS nex085_aplicada_at;

-- PRUEBA FUTURA AUTORIZABLE (NO EJECUTADA; requiere orden y base DESCARTABLE nexit_test_* con un rol nexit_runtime real, nunca la VM ni el banco 'nexit'):
--   1) aplicar NEX-001…085 con el runner (que ya reaplica el wrapper una vez) y correr este script con -v entorno=CI y verificar-NEX-084.sql: todo ok = true;
--   2) SELECT public.nex_aplicar_grants_runtime(); dos veces seguidas (la base vuelve a conceder EXECUTE a los disparadores y el ayudante R05 lo retira cada vez);
--      repetir ambos verificadores: todo ok = true y la sección 2 sin filas;
--   3) en la misma base descartable, pasar a REVERTIDO con desactivar-envio-r05.sql (PRO-312-R02-C04; no por UPDATE manual ni con reversion-NEX-084.sql, que aborta con
--      NEX-085 instalada) y repetir el paso 2 (dos reaplicaciones) y los verificadores: 3 lecturas con EXECUTE, 0 escrituras, 0 auxiliares internos;
--   4) ejercitar como nexit_runtime una escritura R05 en ACTIVO para comprobar que los disparadores de guarda e inmutabilidad se ejecutan sin EXECUTE directo de runtime.
-- Esta lectura sola NO demuestra la persistencia tras reaplicar el wrapper; solo describe el estado en el momento de ejecutarla.

ROLLBACK;
