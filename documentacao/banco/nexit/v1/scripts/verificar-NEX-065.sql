-- VERIFICACIÓN POSTERIOR de NEX-065. SOLO LECTURA. Cada fila debe dar ok = true. La ejecuta el responsable en la VM INMEDIATAMENTE después de aplicar la migración
-- (la comparación con la foto previa solo es válida antes de que los operadores cambien estados).
BEGIN READ ONLY;
SELECT 'foto previa guardada (una fila por tipo)' AS control, to_regclass('public.fe_estado_previo_nex065') IS NOT NULL AND (SELECT count(*) FROM public.fe_estado_previo_nex065) = (SELECT count(*) FROM public.fe_punto_secuencias) AS ok
UNION ALL SELECT 'NINGÚN tipo quedó habilitado si antes estaba bloqueado (activo ⇒ efectivo previo)', NOT EXISTS (
         SELECT 1 FROM public.fe_punto_secuencias s JOIN public.fe_estado_previo_nex065 f ON f.empresa_id = s.empresa_id AND f.punto_id = s.punto_id AND f.tipo_documento = s.tipo_documento WHERE s.activo AND NOT f.efectivo_previo)
UNION ALL SELECT 'ningún tipo habilitado antes fue bloqueado sin motivo (efectivo previo ⇒ activo)', NOT EXISTS (
         SELECT 1 FROM public.fe_punto_secuencias s JOIN public.fe_estado_previo_nex065 f ON f.empresa_id = s.empresa_id AND f.punto_id = s.punto_id AND f.tipo_documento = s.tipo_documento WHERE NOT s.activo AND f.efectivo_previo)
UNION ALL SELECT 'series y contadores intactos (nunca menores que lo emitido)', NOT EXISTS (
         SELECT 1 FROM public.fe_punto_secuencias s JOIN public.fe_puntos_expedicion p ON p.empresa_id = s.empresa_id AND p.id = s.punto_id JOIN public.sucursales sc ON sc.empresa_id = p.empresa_id AND sc.id = p.sucursal_id
          WHERE (public.fe_serie_orden(s.serie), s.ultimo_numero) < (SELECT public.fe_serie_orden(m.o_serie), m.o_numero FROM public.fe_punto_maximo_emitido_serie(s.empresa_id, sc.establecimiento_sifen, p.codigo, s.tipo_documento) m))
UNION ALL SELECT 'la emisión FE/NCE ya no exige el estado físico del punto', pg_get_functiondef('public.fe_documento_crear_fe(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb)'::regprocedure) NOT LIKE '%AND sucursal_id = p_sucursal AND activo FOR SHARE%'
       AND pg_get_functiondef('public.fe_documento_crear_nce(uuid,uuid,uuid,uuid,text,uuid,integer,jsonb,text,numeric,jsonb)'::regprocedure) NOT LIKE '%AND sucursal_id = p_sucursal AND activo FOR SHARE%'
       AND pg_get_functiondef('public.fe_documento_crear_fe(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb)'::regprocedure) LIKE '%fe_secuencia_reservar%'
UNION ALL SELECT 'el alta única no activa el punto', pg_get_functiondef('public.fe_punto_alta_tipo(uuid,uuid,uuid,text,text,text,text,integer,boolean,boolean)'::regprocedure) NOT LIKE '%fe_punto_estado%'
UNION ALL SELECT 'fe_punto_estado retirada y sin acceso para la aplicación', pg_get_functiondef('public.fe_punto_estado(uuid,uuid,uuid,boolean)'::regprocedure) LIKE '%ESTADO_PUNTO_RETIRADO%'
       AND (NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') OR NOT has_function_privilege('nexit_runtime', 'public.fe_punto_estado(uuid,uuid,uuid,boolean)', 'EXECUTE'))
UNION ALL SELECT 'foto previa sin acceso para la aplicación', NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') OR NOT has_table_privilege('nexit_runtime', 'public.fe_estado_previo_nex065', 'SELECT')
UNION ALL SELECT 'índice único fiscal con COALESCE(serie, '''')', EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'documentos_electronicos' AND indexname = 'documentos_electronicos_numero_key'
         AND indexdef LIKE 'CREATE UNIQUE INDEX%' AND indexdef LIKE '%empresa_id, tipo, establecimiento, punto_expedicion, numero, COALESCE(serie, ''::text)%');
ROLLBACK;
