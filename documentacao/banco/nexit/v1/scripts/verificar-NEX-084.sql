-- VERIFICACIÓN POSTERIOR de NEX-084 (PRO-312-R02 / Lote A). SOLO LECTURA.
-- La ejecuta el responsable DESPUÉS de aplicar NEX-084 con el runner (y después de cualquier reaplicación de privilegios):
--   psql -X -v ON_ERROR_STOP=1 -v entorno=VM -f verificar-NEX-084.sql
-- entorno (R02-C01 F005): VM (por defecto, modo estricto del operador: el rol nexit_runtime DEBE existir; control 5) o CI (base efímera sin ese rol: su ausencia es intencional).
-- Sección 3 (R02-C01 F003): integridad de los DATOS R05 ya registrados (cierre ↔ evento ↔ intento ↔ operación/versión, POST decisivo, respuesta del intento, POST/salidas/proyecciones/
-- tardías enlazados al POST exacto, hashes y bytes, snapshot, unicidad lógica). Solo lectura; cada fila cuenta violaciones y debe dar ok = true.
-- Transacción READ ONLY + ROLLBACK: no escribe nada. Nada de esto fue ejecutado por Claude.
-- Sección 1: toda fila debe dar ok = true. Las filas 70–79 dependen del modo: en ACTIVO las escrituras R05 tienen EXECUTE para nexit_runtime; en REVERTIDO no.
-- Si fallan SOLO los controles de privilegios (60–79), la corrección es un paso SEPARADO y autorizable (no lo hace este script):
--   psql -X -v ON_ERROR_STOP=1 -1 -c "SELECT public.nex_aplicar_grants_runtime();"
-- No muestra testigos, hashes de testigo, payloads, respuestas, CDC, lotes ni credenciales.
\if :{?entorno}
\else
  \set entorno VM
\endif
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
  ('public.fe_e03_registrar_salida_tardia_r05(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text,jsonb,text)')),
lecturas(firma) AS (VALUES ('public.fe_e03_operacion_por_correlacion_r05(uuid,uuid,uuid,uuid)'), ('public.fe_e03_conexion_referencia_r05(uuid,uuid,uuid)'),
                           ('public.fe_e03_estado_operacion_r05(uuid,uuid,uuid,uuid)')),
internas(firma) AS (VALUES ('public.fe_e03_r05_validar_proyeccion(jsonb,integer,text,text,text,text,jsonb)'), ('public.fe_e03_r05_cotejar(jsonb,jsonb,boolean,boolean)'),
  ('public.fe_e03_r05_procesar_proyeccion(jsonb,integer,text,text,text,text,jsonb,jsonb,boolean,boolean)'), ('public.fe_e03_r05_clase_eco(text,jsonb,jsonb,text)'),
  ('public.fe_e03_r05_alterado(jsonb)'), ('public.fe_e03_r05_astral(text)'), ('public.fe_e03_r05_trim_js(text)'), ('public.fe_e03_r05_token_rechazado_post1(uuid,uuid,uuid)'),
  ('public.fe_e03_r05_posts(uuid,uuid,uuid)'), ('public.fe_e03_r05_ultima_actividad(uuid,uuid,uuid)'), ('public.fe_e03_r05_abiertas(timestamptz)')),
legado(firma) AS (VALUES ('public.fe_e03_iniciar_envio(uuid,uuid,uuid,boolean)'),
  ('public.fe_e03_registrar_evento(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text)'),
  ('public.fe_e03_cerrar_envio(uuid,uuid,uuid,uuid,text,text,text,text,integer,text,text,text,text,text,text,jsonb)')),
rt AS (SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') AS existe),
modo AS (SELECT (SELECT e.modo FROM public.nex_e03_r05_estado e WHERE e.id) AS valor)
SELECT orden, control, ok FROM (
  SELECT 1 AS orden, 'NEX-084 registrada en schema_migrations con checksum 12439af60ce0073cc98aebb7e9662312f7a21e46c6a800321319b48b4853248b' AS control,
    EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 'NEX-084' AND checksum = '12439af60ce0073cc98aebb7e9662312f7a21e46c6a800321319b48b4853248b') AS ok
  UNION ALL SELECT 2, 'nex_e03_r05_estado: exactamente una fila (id = true) con modo ACTIVO o REVERTIDO',
    (SELECT count(*) = 1 AND bool_and(e.id AND e.modo IN ('ACTIVO', 'REVERTIDO')) FROM public.nex_e03_r05_estado e)
  UNION ALL SELECT 4, 'entorno declarado: ' || :'entorno' || ' (valores admitidos VM o CI)', :'entorno' IN ('VM', 'CI')
  UNION ALL SELECT 5, 'rol nexit_runtime: obligatorio en VM; su ausencia solo se admite con -v entorno=CI (los controles 60–79 la toleran solo por eso)',
    (SELECT existe FROM rt) OR :'entorno' = 'CI'
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
  UNION ALL SELECT 31, 'funciones R05 que se conceden a nexit_runtime: 7 de escritura + 3 de lectura, todas SECURITY DEFINER',
    (SELECT count(*) FROM (SELECT firma FROM escrituras UNION ALL SELECT firma FROM lecturas) f JOIN pg_proc p ON p.oid = to_regprocedure(f.firma) WHERE p.prosecdef) = 10
  UNION ALL SELECT 33, 'R02-C01: ayudantes internos con su firma exacta (validador contra snapshot, cotejo, procesamiento común, token rechazado, actividad) y sin firmas anteriores',
    (SELECT count(*) FROM internas i WHERE to_regprocedure(i.firma) IS NOT NULL) = (SELECT count(*) FROM internas)
    AND to_regprocedure('public.fe_e03_r05_validar_proyeccion(jsonb,integer,text,text,text,text,text)') IS NULL
    AND to_regprocedure('public.fe_e03_registrar_salida_tardia_r05(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text,jsonb)') IS NULL
  UNION ALL SELECT 34, 'R02-C01: autenticación OK por HTTP = 200 exacto; cierre con salida del último POST y HTTP de POST/autenticación; tardía con estado de la proyección (A/B/C/D)',
    EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.documento_electronico_envio_autenticaciones_r05'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%http_status = 200%')
    AND (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documento_electronico_envio_cierres_r05'
           AND column_name IN ('salida_ultimo_post', 'http_post', 'http_autenticacion')) = 3
    AND (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documento_electronico_envio_salidas_tardias_r05'
           AND column_name IN ('estado_proyeccion', 'motivo_sin_proyeccion', 'motivo_descarte', 'regla', 'resultado', 'estado_local', 'error_tipo', 'cotejo', 'campos_cotejados')) = 9
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
  UNION ALL SELECT 63, 'nexit_runtime: EXECUTE de las 3 lecturas R05 en cualquier modo; sin EXECUTE en ayudantes internos',
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
-- Operaciones abiertas con la definición ÚNICA de NEX-084 (fe_e03_r05_abiertas, la misma que usa la reversión) y UN corte por ejecución. Umbral de actividad 10 min (SQL) ≠ ventana de
-- drenaje 15 min (procedimiento del operador). «antiguas» es el número que la reversión exige reconocer con -v huerfanas.
SELECT now() AS corte, x.o_abiertas AS operaciones_abiertas, x.o_recientes AS recientes_10_min, x.o_antiguas AS antiguas FROM public.fe_e03_r05_abiertas(now()) x;
SELECT 'operaciones R05' AS objeto, count(*) AS filas FROM public.documento_electronico_envio_operaciones_r05
UNION ALL SELECT 'POST grandes (> 1 MiB)', count(*) FROM public.documento_electronico_envio_posts_grandes_r05
UNION ALL SELECT 'salidas con proyección / sin proyección', NULL
UNION ALL SELECT '  con P', count(*) FROM public.documento_electronico_envio_proyecciones_r05 WHERE proyeccion IS NOT NULL
UNION ALL SELECT '  sin P', count(*) FROM public.documento_electronico_envio_proyecciones_r05 WHERE proyeccion IS NULL
UNION ALL SELECT 'cierres R05', count(*) FROM public.documento_electronico_envio_cierres_r05
UNION ALL SELECT '  de ellos indeterminados por evidencia insuficiente', count(*) FROM public.documento_electronico_envio_cierres_r05 WHERE motivo = 'EVIDENCIA_INSUFICIENTE'
UNION ALL SELECT '  ACK por lote con discrepancia de paridad JS/SQL (lote_paridad = false)', count(*) FROM public.documento_electronico_envio_cierres_r05 WHERE lote_paridad = false
UNION ALL SELECT 'salidas tardías', count(*) FROM public.documento_electronico_envio_salidas_tardias_r05
UNION ALL SELECT '  ' || estado_proyeccion, count(*) FROM public.documento_electronico_envio_salidas_tardias_r05 GROUP BY estado_proyeccion;

\echo '== 3. Integridad de datos R05 (R02-C01 F003; solo lectura; cada fila cuenta violaciones: debe dar ok = true) =='
WITH ops AS (SELECT o.* FROM public.documento_electronico_envio_operaciones_r05 o),
ev AS (SELECT e.* FROM public.documento_electronico_envio_evidencias e JOIN ops o ON o.empresa_id = e.empresa_id AND o.documento_id = e.documento_id AND o.operacion_id = e.operacion_id),
posts AS (
  SELECT e.empresa_id, e.documento_id, e.version, e.operacion_id, e.nro_post, e.id AS evento_id, NULL::uuid AS grande_id, e.solicitud_http_texto AS texto, e.solicitud_sha256 AS sha,
         e.solicitud_bytes AS bytes, 'NEX072' AS via
    FROM ev e WHERE e.tipo_evento = 'POST_INTENTADO'
  UNION ALL
  SELECT g.empresa_id, g.documento_id, g.version, g.operacion_id, g.nro_post, NULL::uuid, g.id, g.solicitud_http_texto, g.solicitud_sha256, g.solicitud_bytes, 'GRANDE'
    FROM public.documento_electronico_envio_posts_grandes_r05 g),
salidas AS (SELECT e.* FROM ev e WHERE e.tipo_evento IN ('HTTP_RESPUESTA', 'ERROR_TRANSMISION')),
ultimo AS (SELECT p.operacion_id, max(p.nro_post) AS nro FROM posts p GROUP BY p.operacion_id),
cie AS (
  SELECT c.*, u.nro AS ultimo_nro, s.tipo_evento AS salida_tipo, s.http_status AS salida_http, s.respuesta_saneada AS salida_respuesta, y.proyeccion AS p,
         a1.http_status AS aut1_http, a2.id AS aut2_id, a2.http_status AS aut2_http,
         i.tipo AS i_tipo, i.fase AS i_fase, i.resultado AS i_resultado, i.http_status AS i_http, i.respuesta AS i_respuesta, i.lote AS i_lote, i.cdc_informado AS i_cdc,
         (c.regla IN ('NT', 'AUT-1', 'AUT-2', 'EI-SIN-SALIDA') OR c.regla LIKE 'ET-%') AS sin_respuesta,
         NOT (c.regla IN ('NT', 'AUT-1', 'AUT-2', 'EI-TOKEN-SIN-POST2', 'EI-SIN-SALIDA', 'EI-SIN-P') OR c.regla LIKE 'ET-%') AS desde_p
    FROM public.documento_electronico_envio_cierres_r05 c
    LEFT JOIN ultimo u ON u.operacion_id = c.operacion_id
    LEFT JOIN salidas s ON s.operacion_id = c.operacion_id AND s.nro_post = u.nro
    LEFT JOIN public.documento_electronico_envio_proyecciones_r05 y ON y.empresa_id = c.empresa_id AND y.documento_id = c.documento_id AND y.evento_id = s.id
    LEFT JOIN public.documento_electronico_envio_autenticaciones_r05 a1 ON a1.empresa_id = c.empresa_id AND a1.documento_id = c.documento_id AND a1.operacion_id = c.operacion_id AND a1.nro = 1
    LEFT JOIN public.documento_electronico_envio_autenticaciones_r05 a2 ON a2.empresa_id = c.empresa_id AND a2.documento_id = c.documento_id AND a2.operacion_id = c.operacion_id AND a2.nro = 2
    LEFT JOIN public.documento_electronico_intentos i ON i.empresa_id = c.empresa_id AND i.documento_id = c.documento_id AND i.id = c.intento_id)
SELECT orden, control, violaciones, violaciones = 0 AS ok FROM (
  SELECT 100 AS orden, 'cierre ↔ operación: misma empresa, documento y versión' AS control,
    (SELECT count(*) FROM public.documento_electronico_envio_cierres_r05 c LEFT JOIN ops o ON o.operacion_id = c.operacion_id
      WHERE o.operacion_id IS NULL OR o.empresa_id <> c.empresa_id OR o.documento_id <> c.documento_id OR o.version <> c.version) AS violaciones
  UNION ALL SELECT 101, 'cierre ↔ evento CIERRE: tipo CIERRE de la misma operación y versión, mismo intento y mismo HTTP; ningún CIERRE R05 sin fila de cierre',
    (SELECT count(*) FROM public.documento_electronico_envio_cierres_r05 c LEFT JOIN ev e ON e.empresa_id = c.empresa_id AND e.documento_id = c.documento_id AND e.id = c.evento_cierre_id
      WHERE e.id IS NULL OR e.tipo_evento <> 'CIERRE' OR e.operacion_id <> c.operacion_id OR e.version <> c.version OR e.intento_id IS DISTINCT FROM c.intento_id
         OR e.http_status IS DISTINCT FROM c.http_status)
    + (SELECT count(*) FROM ev e WHERE e.tipo_evento = 'CIERRE'
         AND NOT EXISTS (SELECT 1 FROM public.documento_electronico_envio_cierres_r05 c WHERE c.operacion_id = e.operacion_id AND c.evento_cierre_id = e.id))
  UNION ALL SELECT 102, 'cierre ↔ intento: intento ENVIO del mismo documento con la misma fase, resultado y HTTP',
    (SELECT count(*) FROM cie WHERE i_tipo IS DISTINCT FROM 'ENVIO' OR i_fase IS DISTINCT FROM fase OR i_resultado IS DISTINCT FROM resultado OR i_http IS DISTINCT FROM http_status)
  UNION ALL SELECT 103, 'POST decisivo: salida_ultimo_post y http_post coinciden con la salida normal del último POST; http_autenticacion con la autenticación decisiva',
    (SELECT count(*) FROM cie
      WHERE salida_ultimo_post IS DISTINCT FROM (CASE WHEN ultimo_nro IS NULL THEN 'SIN_POST' WHEN salida_tipo IS NULL THEN 'SIN_SALIDA' ELSE salida_tipo END)
         OR http_post IS DISTINCT FROM (CASE WHEN salida_tipo = 'HTTP_RESPUESTA' THEN salida_http END)
         OR http_autenticacion IS DISTINCT FROM (CASE WHEN regla = 'AUT-1' THEN aut1_http WHEN aut2_id IS NOT NULL THEN aut2_http ELSE aut1_http END))
  UNION ALL SELECT 104, 'intento.respuesta = evidencia saneada del último POST; excepciones explícitas (NULL): AUT-1, AUT-2, NT, sin salida, error de transmisión',
    (SELECT count(*) FROM cie WHERE (sin_respuesta AND i_respuesta IS NOT NULL) OR (NOT sin_respuesta AND i_respuesta IS DISTINCT FROM salida_respuesta))
  UNION ALL SELECT 105, 'lote y CDC del intento: lote solo en ACK R-06f con paridad (= texto de P; lote_paridad = false → sin lote); CDC = el de P transportable u omitido (NULL)',
    (SELECT count(*) FROM cie
      WHERE (i_lote IS NOT NULL AND NOT (estado_local = 'ENVIADO' AND regla = 'R-06f' AND coalesce(lote_paridad, false)))
         OR (regla = 'R-06f' AND coalesce(lote_paridad, false) AND i_lote IS DISTINCT FROM (p #>> '{lote,texto}'))
         OR (desde_p AND i_cdc IS DISTINCT FROM public.fe_cdc_texto_r05(p #>> '{cdc,valor}'))
         OR (NOT desde_p AND i_cdc IS NOT NULL))
  UNION ALL SELECT 106, 'POST normal (NEX-072) y POST grande mutuamente excluyentes por número; un solo POST por número',
    (SELECT count(*) FROM (SELECT operacion_id, nro_post FROM posts GROUP BY operacion_id, nro_post HAVING count(*) > 1) d)
  UNION ALL SELECT 107, 'salidas normales enlazadas al POST exacto (misma operación, número y versión); una sola salida normal por POST',
    (SELECT count(*) FROM salidas s WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.operacion_id = s.operacion_id AND p.nro_post = s.nro_post AND p.version = s.version))
    + (SELECT count(*) FROM (SELECT operacion_id, nro_post FROM salidas GROUP BY operacion_id, nro_post HAVING count(*) > 1) d)
  UNION ALL SELECT 108, 'proyecciones: cada una enlaza la salida HTTP_RESPUESTA del mismo POST, operación y versión; cada HTTP_RESPUESTA tiene exactamente una (P o motivo)',
    (SELECT count(*) FROM public.documento_electronico_envio_proyecciones_r05 y LEFT JOIN salidas s ON s.empresa_id = y.empresa_id AND s.documento_id = y.documento_id AND s.id = y.evento_id
      WHERE s.id IS NULL OR s.tipo_evento <> 'HTTP_RESPUESTA' OR s.operacion_id <> y.operacion_id OR s.nro_post <> y.nro_post OR s.version <> y.version)
    + (SELECT count(*) FROM salidas s WHERE s.tipo_evento = 'HTTP_RESPUESTA'
         AND (SELECT count(*) FROM public.documento_electronico_envio_proyecciones_r05 y WHERE y.empresa_id = s.empresa_id AND y.documento_id = s.documento_id AND y.evento_id = s.id) <> 1)
  UNION ALL SELECT 109, 'tardías: enlazan el POST exacto (evento o POST grande del mismo número y versión) y nunca coexisten con una salida normal del mismo POST',
    (SELECT count(*) FROM public.documento_electronico_envio_salidas_tardias_r05 t
      WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.operacion_id = t.operacion_id AND p.nro_post = t.nro_post AND p.version = t.version
                          AND p.evento_id IS NOT DISTINCT FROM t.post_evento_id AND p.grande_id IS NOT DISTINCT FROM t.post_grande_id)
         OR EXISTS (SELECT 1 FROM salidas s WHERE s.operacion_id = t.operacion_id AND s.nro_post = t.nro_post))
  UNION ALL SELECT 110, 'hashes y bytes: SHA-256 y bytes UTF-8 de cada POST (texto) y de cada respuesta saneada (normal y tardía) recalculados coinciden',
    (SELECT count(*) FROM posts p WHERE p.sha IS DISTINCT FROM encode(sha256(convert_to(p.texto, 'UTF8')), 'hex') OR p.bytes IS DISTINCT FROM octet_length(convert_to(p.texto, 'UTF8')))
    + (SELECT count(*) FROM salidas s WHERE s.respuesta_saneada IS NOT NULL
         AND (s.respuesta_sha256 IS DISTINCT FROM encode(sha256(convert_to(s.respuesta_saneada::text, 'UTF8')), 'hex')
              OR s.respuesta_bytes IS DISTINCT FROM octet_length(convert_to(s.respuesta_saneada::text, 'UTF8'))))
    + (SELECT count(*) FROM public.documento_electronico_envio_salidas_tardias_r05 t WHERE t.respuesta_saneada IS NOT NULL
         AND (t.respuesta_sha256 IS DISTINCT FROM encode(sha256(convert_to(t.respuesta_saneada::text, 'UTF8')), 'hex')
              OR t.respuesta_bytes IS DISTINCT FROM octet_length(convert_to(t.respuesta_saneada::text, 'UTF8'))))
  UNION ALL SELECT 111, 'asociación al snapshot: el texto de cada POST, como jsonb, es igual al payload de la versión de la operación',
    (SELECT count(*) FROM posts p LEFT JOIN public.documento_electronico_solicitudes sol ON sol.empresa_id = p.empresa_id AND sol.documento_id = p.documento_id AND sol.version = p.version
      WHERE sol.payload IS NULL OR p.texto::jsonb IS DISTINCT FROM sol.payload)
  UNION ALL SELECT 112, 'unicidad lógica: un INICIO por operación (= raíz), a lo sumo un CIERRE y un NO_TRANSMITIDO por operación, a lo sumo 2 autenticaciones',
    (SELECT count(*) FROM ops o WHERE (SELECT count(*) FROM ev e WHERE e.operacion_id = o.operacion_id AND e.tipo_evento = 'INICIO' AND e.id = o.operacion_id) <> 1)
    + (SELECT count(*) FROM (SELECT operacion_id FROM ev WHERE tipo_evento IN ('CIERRE', 'NO_TRANSMITIDO') GROUP BY operacion_id, tipo_evento HAVING count(*) > 1) d)
    + (SELECT count(*) FROM (SELECT operacion_id FROM public.documento_electronico_envio_autenticaciones_r05 GROUP BY operacion_id HAVING count(*) > 2) d)
) x ORDER BY orden;

ROLLBACK;
