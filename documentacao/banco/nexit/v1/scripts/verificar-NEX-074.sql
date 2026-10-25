-- VERIFICACIÓN de NEX-074 tras aplicarla. SOLO LECTURA (no crea usuarios ni documentos). Todo debe dar ok = true.
--   docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < verificar-NEX-074.sql
BEGIN READ ONLY;
SELECT 'tabla documento_electronico_vendedor' AS control, to_regclass('public.documento_electronico_vendedor') IS NOT NULL AS ok
UNION ALL SELECT 'emisión con vendedor de 14 parámetros', to_regprocedure('public.fe_documento_crear_fe_vendedor(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid,uuid)') IS NOT NULL
UNION ALL SELECT 'usr_crear / usr_actualizar / usr_cambiar_estado / usr_asignar_perfiles / usr_perfiles_catalogo',
       to_regprocedure('public.usr_crear(uuid,uuid,text,text,text,text,text,text[])') IS NOT NULL AND to_regprocedure('public.usr_actualizar(uuid,uuid,uuid,text,text,text)') IS NOT NULL
       AND to_regprocedure('public.usr_cambiar_estado(uuid,uuid,uuid,boolean)') IS NOT NULL AND to_regprocedure('public.usr_asignar_perfiles(uuid,uuid,uuid,text[])') IS NOT NULL
       AND to_regprocedure('public.usr_perfiles_catalogo(uuid,uuid)') IS NOT NULL
UNION ALL SELECT 'cada empresa tiene los nueve perfiles del catálogo', NOT EXISTS (
         SELECT 1 FROM public.empresas e WHERE (SELECT count(*) FROM public.perfiles p WHERE p.empresa_id = e.id AND p.codigo = ANY (public.usr_codigos_catalogo())) <> 9)
UNION ALL SELECT 'la aplicación ejecuta la emisión con vendedor', has_function_privilege('nexit_runtime', 'public.fe_documento_crear_fe_vendedor(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid,uuid)', 'EXECUTE')
UNION ALL SELECT 'la aplicación YA NO ejecuta la emisión de 13 parámetros', NOT has_function_privilege('nexit_runtime', 'public.fe_documento_crear_fe_con_stock_entrega(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid)', 'EXECUTE')
UNION ALL SELECT 'la aplicación no escribe directamente en documento_electronico_vendedor', NOT has_table_privilege('nexit_runtime', 'public.documento_electronico_vendedor', 'INSERT, UPDATE, DELETE')
UNION ALL SELECT 'las funciones auxiliares no son ejecutables por PUBLIC', NOT has_function_privilege('public', 'public.usr_aplicar_perfiles(uuid,uuid,uuid,text[])', 'EXECUTE');
ROLLBACK;
