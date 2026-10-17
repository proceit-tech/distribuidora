-- VERIFICACIÓN POSTERIOR de NEX-063. SOLO LECTURA. Cada fila debe dar ok = true. La ejecuta el responsable en la VM después de aplicar la migración con el runner documentado.
BEGIN READ ONLY;
SELECT 'columna fe_punto_secuencias.serie' AS control, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fe_punto_secuencias' AND column_name = 'serie') AS ok
UNION ALL SELECT 'columna fe_punto_secuencias.activo', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fe_punto_secuencias' AND column_name = 'activo')
UNION ALL SELECT 'funciones nuevas', to_regprocedure('public.fe_secuencia_reservar(uuid,uuid,text)') IS NOT NULL AND to_regprocedure('public.fe_secuencia_siguiente(text,integer)') IS NOT NULL
       AND to_regprocedure('public.fe_punto_registrar(uuid,uuid,uuid,text,text)') IS NOT NULL AND to_regprocedure('public.fe_secuencia_configurar(uuid,uuid,uuid,text,text,integer,boolean,boolean)') IS NOT NULL
       AND to_regprocedure('public.fe_secuencia_estado(uuid,uuid,uuid,text,boolean)') IS NOT NULL AND to_regprocedure('public.fe_punto_estado(uuid,uuid,uuid,boolean)') IS NOT NULL
UNION ALL SELECT 'emisiones FE/NCE usan la reserva por serie', pg_get_functiondef('public.fe_documento_crear_fe(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb)'::regprocedure) LIKE '%fe_secuencia_reservar%'
       AND pg_get_functiondef('public.fe_documento_crear_nce(uuid,uuid,uuid,uuid,text,uuid,integer,jsonb,text,numeric,jsonb)'::regprocedure) LIKE '%fe_secuencia_reservar%'
UNION ALL SELECT 'paso entre series (espejo de series.ts)', (SELECT o_serie IS NULL AND o_numero = 9999999 FROM public.fe_secuencia_siguiente(NULL, 9999998))
       AND (SELECT o_serie = 'AA' AND o_numero = 1 FROM public.fe_secuencia_siguiente(NULL, 9999999)) AND (SELECT o_serie = 'AB' AND o_numero = 1 FROM public.fe_secuencia_siguiente('AA', 9999999))
       AND (SELECT o_serie = 'BA' AND o_numero = 1 FROM public.fe_secuencia_siguiente('AZ', 9999999)) AND (SELECT o_serie = 'ZZ' AND o_numero = 1 FROM public.fe_secuencia_siguiente('ZY', 9999999))
       AND (SELECT o_serie IS NULL AND o_numero IS NULL FROM public.fe_secuencia_siguiente('ZZ', 9999999))
UNION ALL SELECT 'las secuencias existentes se conservaron activas y sin serie', NOT EXISTS (SELECT 1 FROM public.fe_punto_secuencias WHERE serie IS NOT NULL AND origen = 'MIGRACION_NEX060')
UNION ALL SELECT 'ninguna secuencia menor que lo emitido', NOT EXISTS (
         SELECT 1 FROM public.fe_punto_secuencias s JOIN public.fe_puntos_expedicion p ON p.empresa_id = s.empresa_id AND p.id = s.punto_id JOIN public.sucursales sc ON sc.empresa_id = p.empresa_id AND sc.id = p.sucursal_id
          WHERE (public.fe_serie_orden(s.serie), s.ultimo_numero) < (SELECT public.fe_serie_orden(m.o_serie), m.o_numero FROM public.fe_punto_maximo_emitido_serie(s.empresa_id, sc.establecimiento_sifen, p.codigo, s.tipo_documento) m))
UNION ALL SELECT 'trigger de no retroceso', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'fe_punto_secuencias_inmutable_trg' AND NOT tgisinternal)
UNION ALL SELECT 'privilegios del rol de la aplicación', NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime')
       OR (has_function_privilege('nexit_runtime', 'public.fe_secuencia_configurar(uuid,uuid,uuid,text,text,integer,boolean,boolean)', 'EXECUTE')
           AND has_function_privilege('nexit_runtime', 'public.fe_punto_registrar(uuid,uuid,uuid,text,text)', 'EXECUTE')
           AND NOT has_function_privilege('nexit_runtime', 'public.fe_secuencia_reservar(uuid,uuid,text)', 'EXECUTE')
           AND NOT has_table_privilege('nexit_runtime', 'public.fe_punto_secuencias', 'UPDATE') AND has_table_privilege('nexit_runtime', 'public.fe_punto_secuencias', 'SELECT'));
ROLLBACK;
-- Después: verificar en la aplicación que Facturación → Puntos de expedición lista una fila por tipo y que una factura de prueba autorizada por el responsable toma la numeración esperada.
