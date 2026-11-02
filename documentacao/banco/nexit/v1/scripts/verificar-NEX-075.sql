-- VERIFICACIÓN POSTERIOR de NEX-075 (Compras → Entradas). SOLO LECTURA. Cada fila debe dar ok = true. La ejecuta el responsable en la VM INMEDIATAMENTE después de aplicar la migración:
--   docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < verificar-NEX-075.sql
BEGIN READ ONLY;
SELECT 'tablas compras_entradas y compras_entradas_intenciones existen y están vacías al aplicar' AS control,
       to_regclass('public.compras_entradas') IS NOT NULL AND to_regclass('public.compras_entradas_intenciones') IS NOT NULL
       AND (SELECT count(*) FROM public.compras_entradas) = 0 AND (SELECT count(*) FROM public.compras_entradas_intenciones) = 0 AS ok
UNION ALL SELECT 'compras_entradas: movimiento único por empresa y clave única', EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compras_entradas_movimiento_uk' AND contype = 'u') AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compras_entradas_clave_uk' AND contype = 'u')
UNION ALL SELECT 'compras_entradas: FK compuestas (empresa) a movimiento, proveedor y usuario', (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.compras_entradas'::regclass AND contype = 'f' AND conname IN ('compras_entradas_movimiento_fk', 'compras_entradas_proveedor_fk', 'compras_entradas_usuario_fk')) = 3
UNION ALL SELECT 'compras_entradas: NO guarda cantidades ni costos (sin columnas cantidad/costo)', NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'compras_entradas' AND (column_name LIKE '%cantidad%' OR column_name LIKE '%costo%' OR column_name LIKE '%valor%'))
UNION ALL SELECT 'compras_entradas inmutable (disparador UPDATE/DELETE)', EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.compras_entradas'::regclass AND tgname = 'compras_entradas_inmutable_trg' AND NOT tgisinternal)
UNION ALL SELECT 'intenciones: una sola pendiente por empresa + usuario (índice único parcial)', EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'compras_entradas_int_pendiente_uk' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%(empresa_id, usuario_id)%')
UNION ALL SELECT 'intenciones: clave única por empresa, estados y ACK con CHECK', EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compras_entradas_int_clave_uk') AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compras_entradas_int_estado_chk') AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compras_entradas_int_reconocida_chk')
UNION ALL SELECT 'las seis funciones existen, SECURITY DEFINER y con search_path fijo', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
       AND p.proname IN ('compras_entrada_intencion_visible', 'compras_entrada_intencion_reservar', 'compras_entrada_intencion_pendiente', 'compras_entrada_registrar', 'compras_entrada_ejecutar', 'compras_entrada_intencion_reconocer')
       AND p.prosecdef AND array_to_string(p.proconfig, ',') LIKE '%search_path=public, pg_temp%') = 6
UNION ALL SELECT 'la aplicación solo LEE compras_entradas', has_table_privilege('nexit_runtime', 'public.compras_entradas', 'SELECT')
       AND NOT (has_table_privilege('nexit_runtime', 'public.compras_entradas', 'INSERT') OR has_table_privilege('nexit_runtime', 'public.compras_entradas', 'UPDATE') OR has_table_privilege('nexit_runtime', 'public.compras_entradas', 'DELETE'))
UNION ALL SELECT 'la aplicación NO accede a la tabla de intenciones', NOT (has_table_privilege('nexit_runtime', 'public.compras_entradas_intenciones', 'SELECT') OR has_table_privilege('nexit_runtime', 'public.compras_entradas_intenciones', 'INSERT')
       OR has_table_privilege('nexit_runtime', 'public.compras_entradas_intenciones', 'UPDATE') OR has_table_privilege('nexit_runtime', 'public.compras_entradas_intenciones', 'DELETE'))
UNION ALL SELECT 'la aplicación EJECUTA reservar, pendiente, ejecutar y reconocer', has_function_privilege('nexit_runtime', 'public.compras_entrada_intencion_reservar(uuid,uuid,text,jsonb)', 'EXECUTE')
       AND has_function_privilege('nexit_runtime', 'public.compras_entrada_intencion_pendiente(uuid,uuid)', 'EXECUTE') AND has_function_privilege('nexit_runtime', 'public.compras_entrada_ejecutar(uuid,uuid,text)', 'EXECUTE')
       AND has_function_privilege('nexit_runtime', 'public.compras_entrada_intencion_reconocer(uuid,uuid,text)', 'EXECUTE')
UNION ALL SELECT 'la aplicación NO ejecuta el registro interno ni la visibilidad', NOT has_function_privilege('nexit_runtime', 'public.compras_entrada_registrar(uuid,uuid,text,jsonb)', 'EXECUTE')
       AND NOT has_function_privilege('nexit_runtime', 'public.compras_entrada_intencion_visible(uuid,uuid,jsonb)', 'EXECUTE')
UNION ALL SELECT 'PUBLIC no ejecuta ninguna función de NEX-075', NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       WHERE n.nspname = 'public' AND (p.proname LIKE 'compras\_entrada%' OR p.proname = 'nex_aplicar_grants_compras_entradas') AND a.grantee = 0)
UNION ALL SELECT 'permisos COMPRAS.VER y COMPRAS.CREAR en el catálogo (OPERACIONAL)', (SELECT count(*) FROM public.permisos WHERE codigo IN ('COMPRAS.VER', 'COMPRAS.CREAR') AND clase = 'OPERACIONAL') = 2
UNION ALL SELECT 'NEX-075 no asignó permisos COMPRAS a ningún perfil', NOT EXISTS (SELECT 1 FROM public.perfil_permiso pp JOIN public.permisos pe ON pe.id = pp.permiso_id WHERE pe.recurso = 'COMPRAS')
UNION ALL SELECT 'NEX-014 intacta: el motor sigue existiendo con su firma', to_regprocedure('public.inventario_registrar_movimiento(uuid,uuid,text,text,date,uuid,uuid,jsonb,text,uuid,text,text,text)') IS NOT NULL
UNION ALL SELECT 'el ayudante de grants existe (lo reaplica nex_aplicar_grants_runtime)', to_regprocedure('public.nex_aplicar_grants_compras_entradas()') IS NOT NULL;
ROLLBACK;
