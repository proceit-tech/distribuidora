-- VERIFICACIÓN POSTERIOR de NEX-084 (PRO-312-R02 / Lote A). SOLO LECTURA.
-- La ejecuta el responsable DESPUÉS de aplicar NEX-084 con el runner (y después de cualquier reaplicación de privilegios):
--   psql -X -v ON_ERROR_STOP=1 -f verificar-NEX-084.sql
-- Transacción READ ONLY + ROLLBACK: no escribe nada. Nada de esto fue ejecutado por Claude.
-- Sección 1: toda fila debe dar ok = true. Las filas 70–79 dependen del modo: en ACTIVO las escrituras R05 tienen EXECUTE para nexit_runtime; en REVERTIDO no.
-- Si fallan SOLO los controles de privilegios (60–79), la corrección es un paso SEPARADO y autorizable (no lo hace este script):
--   psql -X -v ON_ERROR_STOP=1 -1 -c "SELECT public.nex_aplicar_grants_runtime();"
-- No muestra testigos, hashes de testigo, payloads, respuestas, CDC, lotes ni credenciales.
BEGIN READ ONLY;

\echo '== 1. Instalación, estructura, invariantes y privilegios (todas deben dar ok = true) =='
WITH r05(nombre) AS (VALUES ('documento_electronico_envio_operaciones_r05'), ('documento_electronico_envio_posts_grandes_r05'), ('documento_electronico_envio_autenticaciones_r05'),
                            ('documento_electronico_envio_proyecciones_r05'), ('documento_electronico_envio_cierres_r05'), ('documento_electronico_envio_salidas_tardias_r05')),
escrituras(firma) AS (VALUES
  ('public.fe_e03_iniciar_envio_r05(uuid,uuid,uuid,boolean,uuid,text,jsonb)'),
  ('public.fe_e03_registrar_autenticacion_r05(uuid,uuid,uuid,uuid,text,text,text,text,integer)'),
  ('public.fe_e03_registrar_post_r05(uuid,uuid,uuid,uuid,text,smallint,text)'),
  ('public.fe_e03_registrar_salida_r05(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text,jsonb,text)'),
  ('public.fe_e03_registrar_no_transmitido_r05(uuid,uuid,uuid,uuid,text,text)'),
  ('public.fe_e03_cerrar_envio_r05(uuid,uuid,uuid,uuid,text,jsonb)'),
  ('public.fe_e03_registrar_salida_tardia_r05(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text,jsonb)')),
lecturas(firma) AS (VALUES ('public.fe_e03_operacion_por_correlacion_r05(uuid,uuid,uuid,uuid)'), ('public.fe_e03_conexion_referencia_r05(uuid,uuid,uuid)')),
legado(firma) AS (VALUES ('public.fe_e03_iniciar_envio(uuid,uuid,uuid,boolean)'),
  ('public.fe_e03_registrar_evento(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text)'),
  ('public.fe_e03_cerrar_envio(uuid,uuid,uuid,uuid,text,text,text,text,integer,text,text,text,text,text,text,jsonb)')),
rt AS (SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') AS existe),
modo AS (SELECT (SELECT e.modo FROM public.nex_e03_r05_estado e WHERE e.id) AS valor)
SELECT orden, control, ok FROM (
  SELECT 1 AS orden, 'NEX-084 registrada en schema_migrations con checksum ec59bd921e3fbf77aae741df2ffb5f2577bacd03c5ba230dd1ea683f3411aff3' AS control,
    EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 'NEX-084' AND checksum = 'ec59bd921e3fbf77aae741df2ffb5f2577bacd03c5ba230dd1ea683f3411aff3') AS ok
  UNION ALL SELECT 2, 'nex_e03_r05_estado: exactamente una fila (id = true) con modo ACTIVO o REVERTIDO',
    (SELECT count(*) = 1 AND bool_and(e.id AND e.modo IN ('ACTIVO', 'REVERTIDO')) FROM public.nex_e03_r05_estado e)
  UNION ALL SELECT 3, 'las 6 tablas R05 con empresa_id existen como tabla base', (SELECT count(*) = 6 FROM r05 t JOIN pg_class c ON c.relnamespace = 'public'::regnamespace AND c.relname = t.nombre AND c.relkind = 'r')
  UNION ALL SELECT 10, 'T01: cada tabla R05 tiene empresa_id NOT NULL y una FK anclada en empresa_id',
    NOT EXISTS (SELECT 1 FROM r05 t JOIN pg_class c ON c.relnamespace = 'public'::regnamespace AND c.relname = t.nombre
                  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'empresa_id'
                 WHERE NOT a.attnotnull OR NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'f' AND k.conkey[1] = a.attnum))
  UNION ALL SELECT 11, 'T01: ninguna tabla R05 tiene actualizado_at (solo altas) ni columnas con nombres en inglés',
    NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public' AND (c.table_name IN (SELECT nombre FROM r05) OR c.table_name = 'nex_e03_r05_estado')
                  AND (c.column_name = 'actualizado_at' OR c.column_name ~ '(^|_)(company|created|updated|is_active|warehouse|customer|supplier|product_id|quantity)(_|$)'))
  UNION ALL SELECT 12, 'FK compuestas: operación → INICIO (identidad NEX-072), POST grande/autenticación/proyección/cierre/tardía → operación; cierre → intento; proyección/cierre → evento',
    (SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND conname IN ('envio_operaciones_r05_inicio_fk', 'envio_operaciones_r05_version_fk', 'envio_posts_grandes_r05_operacion_fk',
       'envio_autenticaciones_r05_operacion_fk', 'envio_proyecciones_r05_operacion_fk', 'envio_proyecciones_r05_evento_fk', 'envio_cierres_r05_operacion_fk', 'envio_cierres_r05_evento_fk',
       'envio_cierres_r05_intento_fk', 'envio_salidas_tardias_r05_operacion_fk', 'envio_salidas_tardias_r05_post_evento_fk', 'envio_salidas_tardias_r05_post_grande_fk')) = 12
  UNION ALL SELECT 13, 'unicidades: correlación por empresa, POST grande por número, autenticación por número, proyección por evento y por POST, cierre por intento, tardía por POST',
    (SELECT count(*) FROM pg_constraint WHERE contype = 'u' AND conname IN ('envio_operaciones_r05_correlacion_uk', 'envio_posts_grandes_r05_nro_uk', 'envio_autenticaciones_r05_nro_uk',
       'envio_proyecciones_r05_evento_uk', 'envio_proyecciones_r05_post_uk', 'envio_cierres_r05_intento_uk', 'envio_salidas_tardias_r05_post_uk')) = 7
  UNION ALL SELECT 14, 'límites: P <= 16384 bytes (proyecciones y tardías), POST grande > 1 MiB y <= 8 MiB, testigo solo como SHA-256 hex',
    EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.documento_electronico_envio_proyecciones_r05'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%16384%')
    AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.documento_electronico_envio_salidas_tardias_r05'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%16384%')
    AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.documento_electronico_envio_posts_grandes_r05'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%1048576%8388608%')
    AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.documento_electronico_envio_operaciones_r05'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%testigo_sha256%')
  UNION ALL SELECT 20, 'inmutabilidad: cada tabla R05 tiene los disparadores de fila (UPDATE/DELETE) y TRUNCATE con fe_e03_evidencia_inmutable (DELETE solo en reinicio DEMO)',
    (SELECT count(*) FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
      WHERE c.relname IN (SELECT nombre FROM r05) AND g.tgfoid = 'public.fe_e03_evidencia_inmutable()'::regprocedure AND NOT g.tgisinternal) = 12
  UNION ALL SELECT 21, 'nex_e03_r05_estado protegido contra DELETE y TRUNCATE',
    (SELECT count(*) FROM pg_trigger g WHERE g.tgrelid = 'public.nex_e03_r05_estado'::regclass AND g.tgfoid = 'public.nex_e03_r05_estado_guarda()'::regprocedure) = 2
  UNION ALL SELECT 22, 'guardas de inserción: evidencia NEX-072 de operaciones R05 solo por funciones R05; POST grande coherente; operación enlazada a INICIO',
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'envio_evidencias_r05_guarda_trg' AND tgrelid = 'public.documento_electronico_envio_evidencias'::regclass AND tgenabled = 'O')
    AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'envio_posts_grandes_r05_guarda_trg' AND tgenabled = 'O')
    AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'envio_operaciones_r05_inicio_trg' AND tgenabled = 'O')
  UNION ALL SELECT 23, 'NEX-072 intacta: su tabla conserva el límite de 1 MiB, sus disparadores de guarda e inmutabilidad y sus 3 funciones con la misma firma',
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'envio_evidencias_guarda_trg' AND tgenabled = 'O')
    AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'envio_evidencias_inmutable_fila_trg' AND tgenabled = 'O')
    AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.documento_electronico_envio_evidencias'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%1048576%')
    AND (SELECT count(*) FROM legado l WHERE to_regprocedure(l.firma) IS NOT NULL) = 3
  UNION ALL SELECT 30, 'funciones SECURITY DEFINER de NEX-084 fijan search_path y no usan SQL dinámico',
    NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
                  AND (p.proname LIKE 'fe\_e03\_%\_r05' OR p.proname LIKE 'fe\_e03\_r05\_%')
                  AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) s WHERE s LIKE 'search_path=%')
                       OR p.prosrc ~* '\mEXECUTE\M'))
  UNION ALL SELECT 31, 'funciones R05 que se conceden a nexit_runtime: 7 de escritura + 2 de lectura, todas SECURITY DEFINER',
    (SELECT count(*) FROM (SELECT firma FROM escrituras UNION ALL SELECT firma FROM lecturas) f JOIN pg_proc p ON p.oid = to_regprocedure(f.firma) WHERE p.prosecdef) = 9
  UNION ALL SELECT 32, 'ninguna función de NEX-084 ejecutable por PUBLIC',
    NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
                  AND (p.proname LIKE 'fe\_e03\_%\_r05' OR p.proname LIKE 'fe\_e03\_r05\_%' OR p.proname IN ('nex_e03_r05_estado_guarda', 'nex_aplicar_grants_facturacion_e03_r05'))
                  AND has_function_privilege('public', p.oid, 'EXECUTE'))
  UNION ALL SELECT 40, 'el ayudante nex_aplicar_grants_facturacion_e03_r05 lo descubre el envoltorio (sin argumentos, void, prefijo nex_aplicar_grants_)',
    to_regprocedure('public.nex_aplicar_grants_facturacion_e03_r05()') IS NOT NULL
    AND (SELECT prorettype = 'void'::regtype FROM pg_proc WHERE oid = to_regprocedure('public.nex_aplicar_grants_facturacion_e03_r05()'))
  UNION ALL SELECT 50, 'sin backfill: ninguna operación R05 enlaza un INICIO creado antes de la instalación de NEX-084',
    NOT EXISTS (SELECT 1 FROM public.documento_electronico_envio_operaciones_r05 o JOIN public.documento_electronico_envio_evidencias e
                  ON e.empresa_id = o.empresa_id AND e.documento_id = o.documento_id AND e.id = o.operacion_id
                 WHERE e.creado_at < (SELECT aplicada_at FROM public.schema_migrations WHERE version = 'NEX-084'))
  UNION ALL SELECT 60, 'nexit_runtime: sin privilegio de escritura en ninguna tabla R05 ni en nex_e03_r05_estado',
    NOT (SELECT existe FROM rt) OR NOT EXISTS (SELECT 1 FROM (SELECT nombre FROM r05 UNION ALL SELECT 'nex_e03_r05_estado') t
      WHERE has_table_privilege('nexit_runtime', 'public.' || t.nombre, 'INSERT') OR has_table_privilege('nexit_runtime', 'public.' || t.nombre, 'UPDATE')
         OR has_table_privilege('nexit_runtime', 'public.' || t.nombre, 'DELETE') OR has_table_privilege('nexit_runtime', 'public.' || t.nombre, 'TRUNCATE'))
  UNION ALL SELECT 61, 'nexit_runtime: SELECT de las tablas R05, pero NUNCA de operaciones_r05.testigo_sha256 (privilegio por columnas)',
    NOT (SELECT existe FROM rt) OR (
      NOT has_column_privilege('nexit_runtime', 'public.documento_electronico_envio_operaciones_r05', 'testigo_sha256', 'SELECT')
      AND has_column_privilege('nexit_runtime', 'public.documento_electronico_envio_operaciones_r05', 'correlacion_id', 'SELECT')
      AND NOT has_table_privilege('nexit_runtime', 'public.documento_electronico_envio_operaciones_r05', 'SELECT')
      AND NOT EXISTS (SELECT 1 FROM r05 t WHERE t.nombre <> 'documento_electronico_envio_operaciones_r05' AND NOT has_table_privilege('nexit_runtime', 'public.' || t.nombre, 'SELECT')))
  UNION ALL SELECT 62, 'nexit_runtime: SIN EXECUTE sobre las 3 funciones de escritura de NEX-072 (camino único R05) y sin escritura en la evidencia NEX-072',
    NOT (SELECT existe FROM rt) OR (NOT EXISTS (SELECT 1 FROM legado l WHERE has_function_privilege('nexit_runtime', l.firma, 'EXECUTE'))
      AND NOT has_table_privilege('nexit_runtime', 'public.documento_electronico_envio_evidencias', 'INSERT')
      AND has_table_privilege('nexit_runtime', 'public.documento_electronico_envio_evidencias', 'SELECT'))
  UNION ALL SELECT 63, 'nexit_runtime: EXECUTE de las 2 lecturas R05 en cualquier modo; sin EXECUTE en ayudantes internos',
    NOT (SELECT existe FROM rt) OR (NOT EXISTS (SELECT 1 FROM lecturas l WHERE NOT has_function_privilege('nexit_runtime', l.firma, 'EXECUTE'))
      AND NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'fe\_e03\_r05\_%' AND has_function_privilege('nexit_runtime', p.oid, 'EXECUTE')))
  UNION ALL SELECT 64, 'la aplicación vigente conserva su camino: EXECUTE de nexit_runtime en fe_documento_iniciar_envio y fe_documento_registrar_envio_r05',
    NOT (SELECT existe FROM rt) OR (has_function_privilege('nexit_runtime', 'public.fe_documento_iniciar_envio(uuid,uuid,uuid,boolean)', 'EXECUTE')
      AND has_function_privilege('nexit_runtime', 'public.fe_documento_registrar_envio_r05(uuid,uuid,uuid,text,text,text,text,integer,text,text,text,text,text,jsonb,jsonb)', 'EXECUTE'))
  UNION ALL SELECT 70, 'modo ACTIVO → nexit_runtime tiene EXECUTE en las 7 escrituras R05',
    NOT (SELECT existe FROM rt) OR (SELECT valor FROM modo) <> 'ACTIVO' OR NOT EXISTS (SELECT 1 FROM escrituras e WHERE NOT has_function_privilege('nexit_runtime', e.firma, 'EXECUTE'))
  UNION ALL SELECT 71, 'modo REVERTIDO → nexit_runtime NO tiene EXECUTE en ninguna escritura R05',
    NOT (SELECT existe FROM rt) OR (SELECT valor FROM modo) <> 'REVERTIDO' OR NOT EXISTS (SELECT 1 FROM escrituras e WHERE has_function_privilege('nexit_runtime', e.firma, 'EXECUTE'))
) x ORDER BY orden;

\echo '== 2. Estado (informativo) =='
SELECT modo, cambiado_at, motivo FROM public.nex_e03_r05_estado;
SELECT 'operaciones R05' AS objeto, count(*) AS filas FROM public.documento_electronico_envio_operaciones_r05
UNION ALL SELECT 'operaciones R05 sin cierre', count(*) FROM public.documento_electronico_envio_operaciones_r05 o
           WHERE NOT EXISTS (SELECT 1 FROM public.documento_electronico_envio_cierres_r05 c WHERE c.operacion_id = o.operacion_id)
UNION ALL SELECT 'POST grandes (> 1 MiB)', count(*) FROM public.documento_electronico_envio_posts_grandes_r05
UNION ALL SELECT 'salidas con proyección / sin proyección', NULL
UNION ALL SELECT '  con P', count(*) FROM public.documento_electronico_envio_proyecciones_r05 WHERE proyeccion IS NOT NULL
UNION ALL SELECT '  sin P', count(*) FROM public.documento_electronico_envio_proyecciones_r05 WHERE proyeccion IS NULL
UNION ALL SELECT 'cierres R05', count(*) FROM public.documento_electronico_envio_cierres_r05
UNION ALL SELECT '  de ellos indeterminados por evidencia insuficiente', count(*) FROM public.documento_electronico_envio_cierres_r05 WHERE motivo = 'EVIDENCIA_INSUFICIENTE'
UNION ALL SELECT '  ACK por lote con discrepancia de paridad JS/SQL (lote_paridad = false)', count(*) FROM public.documento_electronico_envio_cierres_r05 WHERE lote_paridad = false
UNION ALL SELECT 'salidas tardías', count(*) FROM public.documento_electronico_envio_salidas_tardias_r05;

ROLLBACK;
