-- VERIFICACIÓN POSTERIOR de NEX-080 (PRO-342-R05). SOLO LECTURA. Cada fila debe dar ok = true. La ejecuta el responsable INMEDIATAMENTE después de aplicar la migración:
--   docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < verificar-NEX-080.sql
--
-- PRO-342-R05-R01 (F002): las comprobaciones sobre el CÓDIGO de las funciones miran solo lo que se EJECUTA. pg_get_functiondef/prosrc conservan los comentarios del cuerpo (NEX-080 dice, en
-- un comentario de fe_documento_crear_nce, «antes fe_cdc_coherente»): el LIKE anterior sobre el texto completo daba un falso negativo. Ahora el cuerpo (prosrc) se limpia así:
--   1) sin comentarios de línea «-- …» ni de bloque «/* … */» → codigo_ejecutable (conserva los literales: sirve para buscar 'nex.r05_proyeccion_cdc' o un resultado 'CDC_DIVERGENTE');
--   2) además, sin literales de texto '…' (con '' incluido) → codigo_sin_textos (sirve para buscar LLAMADAS: un mensaje que nombra la función no es una llamada).
-- Llamada efectiva = el identificador fe_cdc_coherente (con o sin esquema o comillas, sin distinguir mayúsculas) seguido de «(». Las filas «detector» prueban el propio limpiado con textos de
-- muestra: comentario o literal NO cuentan; una llamada o un resultado reales SÍ (si el detector fallara, esas filas dan ok = false y la verificación no se da por buena).
-- Condición del limpiado, revisada en la fuente de NEX-080: sus cuerpos no tienen «--» dentro de literales ni apóstrofos sueltos en comentarios, ni literales con $tag$ internos.
-- No se quitó ningún control ni se fuerza ningún resultado: solo cambia QUÉ texto se inspecciona.
BEGIN READ ONLY;
WITH fuente(nombre, src) AS (
  SELECT 'MUESTRA_COMENTARIO', E'BEGIN\n  -- sin validar (antes fe_cdc_coherente)\n  /* fe_cdc_coherente(a, b) */\n  RAISE EXCEPTION ''no usar fe_cdc_coherente(x)'';\nEND'
  UNION ALL SELECT 'MUESTRA_LLAMADA', E'BEGIN\n  IF NOT public.fe_cdc_coherente(v_tipo, v_est, v_pun, v_num, v_cdc) THEN RETURN; END IF; -- comentario\nEND'
  UNION ALL SELECT 'MUESTRA_RESULTADO', E'BEGIN\n  v_resultado := ''CDC_DIVERGENTE'';\nEND'
  UNION ALL SELECT 'MUESTRA_RESULTADO_COMENTADO', E'BEGIN\n  -- antes ''CDC_DIVERGENTE''\n  /* v_resultado := ''CDC_DIVERGENTE''; */\nEND'
  UNION ALL SELECT 'MUESTRA_PROYECCION_COMENTADA', E'BEGIN\n  -- current_setting(''nex.r05_proyeccion_cdc'', true)\nEND'
  UNION ALL SELECT f.nombre, p.prosrc
  FROM (VALUES
    ('fe_documentos_inmutable', 'public.fe_documentos_inmutable()'),
    ('fe_documento_crear_nce', 'public.fe_documento_crear_nce(uuid,uuid,uuid,uuid,text,uuid,integer,jsonb,text,numeric,jsonb)'),
    ('fe_documento_registrar_consulta_nucleo_r05', 'public.fe_documento_registrar_consulta_nucleo_r05(text,uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,text,jsonb,uuid,jsonb)'),
    ('fe_documento_registrar_consulta_r05', 'public.fe_documento_registrar_consulta_r05(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,text,jsonb,jsonb)'),
    ('fe_documento_registrar_consulta_flujo_nce_r05', 'public.fe_documento_registrar_consulta_flujo_nce_r05(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,text,jsonb,jsonb)'),
    ('fe_documento_registrar_consulta_auto_r05', 'public.fe_documento_registrar_consulta_auto_r05(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,text,jsonb,uuid,jsonb)'),
    ('fe_documento_registrar_envio_r05', 'public.fe_documento_registrar_envio_r05(uuid,uuid,uuid,text,text,text,text,integer,text,text,text,text,text,jsonb,jsonb)'),
    ('fe_cdc_proyectar_r05', 'public.fe_cdc_proyectar_r05(uuid,uuid,text,text)'),
    ('fe_cdc_texto_r05', 'public.fe_cdc_texto_r05(text)')
  ) AS f(nombre, firma)
  JOIN pg_proc p ON p.oid = f.firma::regprocedure
), ejecutable AS (
  SELECT nombre, regexp_replace(regexp_replace(src, '--[^\n]*', ' ', 'g'), '/\*.*?\*/', ' ', 'g') AS codigo_ejecutable FROM fuente
), codigo AS (
  SELECT nombre, codigo_ejecutable, regexp_replace(codigo_ejecutable, '''([^'']|'''')*''', ' ', 'g') AS codigo_sin_textos FROM ejecutable
), llamada(patron) AS (
  SELECT '(^|[^a-z0-9_$])"?fe_cdc_coherente"?[[:space:]]*\('
), proyeccion(patron) AS (
  SELECT 'current_setting[[:space:]]*\([[:space:]]*''nex\.r05_proyeccion_cdc'''
)
SELECT 'detector: un comentario o un literal que nombra fe_cdc_coherente NO es una llamada' AS control,
       EXISTS (SELECT 1 FROM codigo WHERE nombre = 'MUESTRA_COMENTARIO')
       AND NOT EXISTS (SELECT 1 FROM codigo, llamada WHERE nombre = 'MUESTRA_COMENTARIO' AND codigo_sin_textos ~* patron) AS ok
UNION ALL SELECT 'detector: una llamada real a fe_cdc_coherente SÍ se detecta (aunque la línea tenga comentario)',
       EXISTS (SELECT 1 FROM codigo, llamada WHERE nombre = 'MUESTRA_LLAMADA' AND codigo_sin_textos ~* patron)
UNION ALL SELECT 'detector: CDC_DIVERGENTE como resultado SÍ se detecta; comentado NO',
       EXISTS (SELECT 1 FROM codigo WHERE nombre = 'MUESTRA_RESULTADO' AND codigo_ejecutable ~ '''CDC_DIVERGENTE''')
       AND NOT EXISTS (SELECT 1 FROM codigo WHERE nombre = 'MUESTRA_RESULTADO_COMENTADO' AND codigo_ejecutable ~ '''CDC_DIVERGENTE''')
UNION ALL SELECT 'detector: una lectura de nex.r05_proyeccion_cdc solo comentada NO cuenta',
       NOT EXISTS (SELECT 1 FROM codigo, proyeccion WHERE nombre = 'MUESTRA_PROYECCION_COMENTADA' AND codigo_ejecutable ~ patron)
UNION ALL SELECT 'funciones inspeccionadas presentes (9)', (SELECT count(*) FROM codigo WHERE nombre NOT LIKE 'MUESTRA\_%') = 9
UNION ALL SELECT 'sin restricciones de formato/coherencia del CDC en documentos',
       NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.documentos_electronicos'::regclass AND contype = 'c' AND (pg_get_constraintdef(oid) LIKE '%fe_cdc_coherente(%' OR pg_get_constraintdef(oid) LIKE '%(cdc ~ %'))
UNION ALL SELECT 'sin restricción de 44 dígitos en intentos.cdc_informado', NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.documento_electronico_intentos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%(cdc_informado ~ %')
UNION ALL SELECT 'sin restricción de 44 dígitos en nce_origen.fe_cdc', NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.nce_origen'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%(fe_cdc ~ %')
UNION ALL SELECT 'límites de transporte 1..256 presentes (3)', (SELECT count(*) FROM pg_constraint WHERE conname IN ('documentos_electronicos_cdc_texto_chk', 'documento_electronico_intentos_cdc_informado_texto_chk', 'nce_origen_fe_cdc_texto_chk')) = 3
UNION ALL SELECT 'índice único (empresa_id, cdc) conservado', to_regclass('public.documentos_electronicos_cdc_key') IS NOT NULL
UNION ALL SELECT 'columnas cdc_anterior y cdc_proyeccion', (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documento_electronico_intentos' AND column_name IN ('cdc_anterior', 'cdc_proyeccion')) = 2
UNION ALL SELECT 'ningún intento existente modificado (todas las proyecciones vacías al aplicar)', NOT EXISTS (SELECT 1 FROM public.documento_electronico_intentos WHERE cdc_proyeccion IS NOT NULL OR cdc_anterior IS NOT NULL)
UNION ALL SELECT 'respaldo: 2 funciones + 4 restricciones', (SELECT count(*) FROM public.nex080_respaldo WHERE clase = 'FUNCION') = 2 AND (SELECT count(*) FROM public.nex080_respaldo WHERE clase = 'RESTRICCION') = 4
UNION ALL SELECT 'trigger: el CDC solo cambia por la proyección R05 (lectura EJECUTABLE de nex.r05_proyeccion_cdc, no un comentario)',
       EXISTS (SELECT 1 FROM codigo, proyeccion WHERE nombre = 'fe_documentos_inmutable' AND codigo_ejecutable ~ patron)
UNION ALL SELECT 'fe_documento_crear_nce sin LLAMADAS a fe_cdc_coherente (los comentarios y literales no cuentan)',
       EXISTS (SELECT 1 FROM codigo WHERE nombre = 'fe_documento_crear_nce')
       AND NOT EXISTS (SELECT 1 FROM codigo, llamada WHERE nombre = 'fe_documento_crear_nce' AND codigo_sin_textos ~* patron)
UNION ALL SELECT 'funciones R05 (7) sin LLAMADAS a fe_cdc_coherente ni CDC_DIVERGENTE como resultado (código ejecutable)',
       (SELECT count(*) FROM codigo WHERE nombre LIKE 'fe\_%\_r05') = 7
       AND NOT EXISTS (SELECT 1 FROM codigo, llamada WHERE nombre LIKE 'fe\_%\_r05' AND codigo_sin_textos ~* patron)
       AND NOT EXISTS (SELECT 1 FROM codigo WHERE nombre LIKE 'fe\_%\_r05' AND codigo_ejecutable ~ '''CDC_DIVERGENTE''')
UNION ALL SELECT 'nexit_runtime ejecuta las 4 funciones públicas R05', NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') OR (
       has_function_privilege('nexit_runtime', 'public.fe_documento_registrar_consulta_r05(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,text,jsonb,jsonb)', 'EXECUTE')
       AND has_function_privilege('nexit_runtime', 'public.fe_documento_registrar_consulta_flujo_nce_r05(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,text,jsonb,jsonb)', 'EXECUTE')
       AND has_function_privilege('nexit_runtime', 'public.fe_documento_registrar_consulta_auto_r05(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,text,jsonb,uuid,jsonb)', 'EXECUTE')
       AND has_function_privilege('nexit_runtime', 'public.fe_documento_registrar_envio_r05(uuid,uuid,uuid,text,text,text,text,integer,text,text,text,text,text,jsonb,jsonb)', 'EXECUTE'))
UNION ALL SELECT 'nexit_runtime NO ejecuta las privadas (núcleo, proyección) ni lee el respaldo', NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') OR (
       NOT has_function_privilege('nexit_runtime', 'public.fe_cdc_proyectar_r05(uuid,uuid,text,text)', 'EXECUTE')
       AND NOT has_function_privilege('nexit_runtime', 'public.fe_documento_registrar_consulta_nucleo_r05(text,uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,text,jsonb,uuid,jsonb)', 'EXECUTE')
       AND NOT has_table_privilege('nexit_runtime', 'public.nex080_respaldo', 'SELECT'))
UNION ALL SELECT 'nexit_runtime sigue sin UPDATE directo sobre documentos (la variable de proyección no es explotable)', NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime')
       OR NOT has_table_privilege('nexit_runtime', 'public.documentos_electronicos', 'UPDATE');
ROLLBACK;
