-- VERIFICACIÓN POSTERIOR de NEX-080 (PRO-342-R05). SOLO LECTURA. Cada fila debe dar ok = true. La ejecuta el responsable INMEDIATAMENTE después de aplicar la migración:
--   docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < verificar-NEX-080.sql
BEGIN READ ONLY;
SELECT 'sin restricciones de formato/coherencia del CDC en documentos' AS control,
       NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.documentos_electronicos'::regclass AND contype = 'c' AND (pg_get_constraintdef(oid) LIKE '%fe_cdc_coherente(%' OR pg_get_constraintdef(oid) LIKE '%(cdc ~ %')) AS ok
UNION ALL SELECT 'sin restricción de 44 dígitos en intentos.cdc_informado', NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.documento_electronico_intentos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%(cdc_informado ~ %')
UNION ALL SELECT 'sin restricción de 44 dígitos en nce_origen.fe_cdc', NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.nce_origen'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%(fe_cdc ~ %')
UNION ALL SELECT 'límites de transporte 1..256 presentes (3)', (SELECT count(*) FROM pg_constraint WHERE conname IN ('documentos_electronicos_cdc_texto_chk', 'documento_electronico_intentos_cdc_informado_texto_chk', 'nce_origen_fe_cdc_texto_chk')) = 3
UNION ALL SELECT 'índice único (empresa_id, cdc) conservado', to_regclass('public.documentos_electronicos_cdc_key') IS NOT NULL
UNION ALL SELECT 'columnas cdc_anterior y cdc_proyeccion', (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documento_electronico_intentos' AND column_name IN ('cdc_anterior', 'cdc_proyeccion')) = 2
UNION ALL SELECT 'ningún intento existente modificado (todas las proyecciones vacías al aplicar)', NOT EXISTS (SELECT 1 FROM public.documento_electronico_intentos WHERE cdc_proyeccion IS NOT NULL OR cdc_anterior IS NOT NULL)
UNION ALL SELECT 'respaldo: 2 funciones + 4 restricciones', (SELECT count(*) FROM public.nex080_respaldo WHERE clase = 'FUNCION') = 2 AND (SELECT count(*) FROM public.nex080_respaldo WHERE clase = 'RESTRICCION') = 4
UNION ALL SELECT 'trigger: CDC solo cambia por la proyección R05', pg_get_functiondef('public.fe_documentos_inmutable()'::regprocedure) LIKE '%nex.r05_proyeccion_cdc%'
UNION ALL SELECT 'fe_documento_crear_nce sin fe_cdc_coherente', pg_get_functiondef('public.fe_documento_crear_nce(uuid,uuid,uuid,uuid,text,uuid,integer,jsonb,text,numeric,jsonb)'::regprocedure) NOT LIKE '%fe_cdc_coherente%'
UNION ALL SELECT 'funciones R05 sin fe_cdc_coherente ni CDC_DIVERGENTE como resultado',
       pg_get_functiondef('public.fe_documento_registrar_consulta_nucleo_r05(text,uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,text,jsonb,uuid,jsonb)'::regprocedure) NOT LIKE '%fe_cdc_coherente%'
       AND pg_get_functiondef('public.fe_documento_registrar_envio_r05(uuid,uuid,uuid,text,text,text,text,integer,text,text,text,text,text,jsonb,jsonb)'::regprocedure) NOT LIKE '%fe_cdc_coherente%'
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
