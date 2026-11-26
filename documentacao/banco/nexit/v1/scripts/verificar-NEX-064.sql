-- VERIFICACIÓN POSTERIOR de NEX-064. SOLO LECTURA. Cada fila debe dar ok = true. La ejecuta el responsable en la VM después de aplicar la migración.
BEGIN READ ONLY;
SELECT 'función fe_punto_alta_tipo' AS control, to_regprocedure('public.fe_punto_alta_tipo(uuid,uuid,uuid,text,text,text,text,integer,boolean,boolean)') IS NOT NULL AS ok
UNION ALL SELECT 'depende de NEX-063', to_regprocedure('public.fe_secuencia_configurar(uuid,uuid,uuid,text,text,integer,boolean,boolean)') IS NOT NULL AND to_regprocedure('public.fe_punto_registrar(uuid,uuid,uuid,text,text)') IS NOT NULL
UNION ALL SELECT 'privilegios del rol de la aplicación', NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime')
       OR has_function_privilege('nexit_runtime', 'public.fe_punto_alta_tipo(uuid,uuid,uuid,text,text,text,text,integer,boolean,boolean)', 'EXECUTE')
UNION ALL SELECT 'PUBLIC sin acceso', NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = 'public.fe_punto_alta_tipo(uuid,uuid,uuid,text,text,text,text,integer,boolean,boolean)'::regprocedure AND a.grantee = 0);
ROLLBACK;
