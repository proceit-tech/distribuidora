-- VERIFICACIÓN POSTERIOR de NEX-081 (PRO-354-R02). SOLO LECTURA. Cada fila debe dar ok = true. La ejecuta el responsable INMEDIATAMENTE después de aplicar:
--   docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < verificar-NEX-081.sql
BEGIN READ ONLY;
SELECT 'empresas.bloquear_stock_insuficiente boolean NOT NULL DEFAULT true' AS control,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'empresas' AND column_name = 'bloquear_stock_insuficiente'
               AND data_type = 'boolean' AND is_nullable = 'NO' AND column_default = 'true') AS ok
UNION ALL SELECT 'al aplicar, TODAS las empresas quedan en TRUE (comportamiento actual)', NOT EXISTS (SELECT 1 FROM public.empresas WHERE NOT bloquear_stock_insuficiente)
UNION ALL SELECT 'tabla documento_electronico_stock_pendientes con PK propia', EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.documento_electronico_stock_pendientes'::regclass AND contype = 'p')
UNION ALL SELECT 'conciliación descontado + pendiente = facturado (CHECK)', EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.documento_electronico_stock_pendientes'::regclass AND conname = 'fe_stock_pend_cantidades_chk')
UNION ALL SELECT 'un pendiente por FE y producto (UNIQUE)', EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.documento_electronico_stock_pendientes'::regclass AND conname = 'fe_stock_pend_documento_producto_uk')
UNION ALL SELECT 'triggers de inmutabilidad y de movimiento vinculado',
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'fe_stock_pendientes_inmutable_trg' AND NOT tgisinternal) AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'fe_stock_pendiente_movimiento_protegido_trg' AND NOT tgisinternal)
UNION ALL SELECT 'R01: la obligación congela unidad base y sucursal (columnas NOT NULL + FK de sucursal)',
       (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documento_electronico_stock_pendientes'
          AND column_name IN ('unidad_medida_id', 'sucursal_id') AND is_nullable = 'NO') = 2
       AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.documento_electronico_stock_pendientes'::regclass AND conname = 'fe_stock_pend_sucursal_fk')
UNION ALL SELECT 'R01: guardas de producto (unidad/control/estado) y de depósito (sucursal/estado/terceros)',
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'fe_stock_pendientes_producto_guarda_trg' AND tgrelid = 'public.productos'::regclass AND NOT tgisinternal)
       AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'fe_stock_pendientes_deposito_guarda_trg' AND tgrelid = 'public.depositos'::regclass AND NOT tgisinternal)
UNION ALL SELECT 'R01: la confirmación no bloquea costo/saldo antes del motor y referencia la serie',
       position('inventario_costos' IN pg_get_functiondef('public.fe_stock_pendiente_confirmar(uuid,uuid,uuid)'::regprocedure)) = 0
       AND position('v_doc.serie' IN pg_get_functiondef('public.fe_stock_pendiente_confirmar(uuid,uuid,uuid)'::regprocedure)) > 0
UNION ALL SELECT 'R01: el registro del faltante toma el candado de numeración de movimientos',
       position('movimientos.numero:' IN pg_get_functiondef('public.fe_documento_crear_fe_stock_pendiente(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid,uuid,jsonb,boolean)'::regprocedure)) > 0
UNION ALL SELECT 'R02-R02: el registro exige la unidad base revisada (UUID) y la compara bajo bloqueo antes de numerar',
       position('NEX:STOCK_PENDIENTE_UNIDAD_CAMBIO' IN pg_get_functiondef('public.fe_documento_crear_fe_stock_pendiente(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid,uuid,jsonb,boolean)'::regprocedure)) > 0
       AND position('NEX:STOCK_PENDIENTE_UNIDAD_CAMBIO' IN pg_get_functiondef('public.fe_documento_crear_fe_stock_pendiente(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid,uuid,jsonb,boolean)'::regprocedure))
         < position('fe_documento_crear_fe_receptor' IN pg_get_functiondef('public.fe_documento_crear_fe_stock_pendiente(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid,uuid,jsonb,boolean)'::regprocedure))
UNION ALL SELECT 'R02-R02: la evidencia de lotes se re-comprueba después del candado de numeración',
       (SELECT count(*) FROM regexp_matches(pg_get_functiondef('public.fe_documento_crear_fe_stock_pendiente(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid,uuid,jsonb,boolean)'::regprocedure), 'NEX:STOCK_PENDIENTE_LOTE', 'g')) = 2
UNION ALL SELECT 'R02-R02: listado y filtros usan el alcance histórico (deposito_en_alcance); la confirmación sigue exigiendo depósito activo',
       position('deposito_en_alcance' IN pg_get_functiondef('public.fe_stock_pendientes_listar(uuid,uuid,text,uuid,uuid,text,integer,integer)'::regprocedure)) > 0
       AND position('usuario_puede_deposito' IN pg_get_functiondef('public.fe_stock_pendientes_listar(uuid,uuid,text,uuid,uuid,text,integer,integer)'::regprocedure)) = 0
       AND position('deposito_en_alcance' IN pg_get_functiondef('public.fe_stock_pendientes_filtros(uuid,uuid)'::regprocedure)) > 0
       AND position('usuario_puede_deposito' IN pg_get_functiondef('public.fe_stock_pendiente_confirmar(uuid,uuid,uuid)'::regprocedure)) > 0
       AND position('NOT v_dp.activo' IN pg_get_functiondef('public.fe_stock_pendiente_confirmar(uuid,uuid,uuid)'::regprocedure)) > 0
UNION ALL SELECT 'PK histórica de documento_electronico_stock_salidas intacta (empresa, documento, depósito)',
       EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = 'public.documento_electronico_stock_salidas'::regclass AND c.contype = 'p' AND array_length(c.conkey, 1) = 3)
UNION ALL SELECT 'baja redefinida: lee la preparación y concilia pendientes', position('fe_stock_pendientes_preparacion' IN pg_get_functiondef('public.fe_stock_baja_documento(uuid,uuid,uuid,jsonb)'::regprocedure)) > 0
UNION ALL SELECT 'stock_saldos conserva su CHECK de cantidad no negativa (NEX-081 no lo toca)',
       EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.stock_saldos'::regclass AND conname = 'stock_saldos_cant_chk' AND pg_get_constraintdef(oid) LIKE '%cantidad >= %0%')
UNION ALL SELECT 'tablas sin pendientes ni preparación al aplicar',
       NOT EXISTS (SELECT 1 FROM public.documento_electronico_stock_pendientes) AND NOT EXISTS (SELECT 1 FROM public.fe_stock_pendientes_preparacion)
UNION ALL SELECT 'la aplicación NO accede a las tablas nuevas',
       NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime')
       OR (NOT has_table_privilege('nexit_runtime', 'public.documento_electronico_stock_pendientes', 'SELECT,INSERT,UPDATE,DELETE')
           AND NOT has_table_privilege('nexit_runtime', 'public.fe_stock_pendientes_preparacion', 'SELECT,INSERT,UPDATE,DELETE'))
UNION ALL SELECT 'la aplicación NO ejecuta la baja interna', NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') OR NOT has_function_privilege('nexit_runtime', 'public.fe_stock_baja_documento(uuid,uuid,uuid,jsonb)', 'EXECUTE')
UNION ALL SELECT 'la aplicación ejecuta las 6 funciones públicas de NEX-081',
       NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime')
       OR (has_function_privilege('nexit_runtime', 'public.fe_politica_stock_actualizar(uuid,uuid,boolean)', 'EXECUTE')
           AND has_function_privilege('nexit_runtime', 'public.fe_stock_politica_contexto(uuid,uuid,uuid,uuid[])', 'EXECUTE')
           AND has_function_privilege('nexit_runtime', 'public.fe_documento_crear_fe_stock_pendiente(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid,uuid,jsonb,boolean)', 'EXECUTE')
           AND has_function_privilege('nexit_runtime', 'public.fe_stock_pendientes_listar(uuid,uuid,text,uuid,uuid,text,integer,integer)', 'EXECUTE')
           AND has_function_privilege('nexit_runtime', 'public.fe_stock_pendientes_filtros(uuid,uuid)', 'EXECUTE')
           AND has_function_privilege('nexit_runtime', 'public.fe_stock_pendiente_confirmar(uuid,uuid,uuid)', 'EXECUTE'))
UNION ALL SELECT 'PUBLIC no ejecuta las funciones nuevas',
       NOT has_function_privilege('public', 'public.fe_stock_pendiente_confirmar(uuid,uuid,uuid)', 'EXECUTE')
       AND NOT has_function_privilege('public', 'public.fe_stock_pendientes_filtros(uuid,uuid)', 'EXECUTE')
       AND NOT has_function_privilege('public', 'public.fe_stock_pendientes_producto_guarda()', 'EXECUTE')
       AND NOT has_function_privilege('public', 'public.fe_documento_crear_fe_stock_pendiente(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid,uuid,jsonb,boolean)', 'EXECUTE')
UNION ALL SELECT 'la emisión de siempre (receptor) sigue disponible para la aplicación (política TRUE sin cambios)',
       NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime')
       OR has_function_privilege('nexit_runtime', 'public.fe_documento_crear_fe_receptor(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid,uuid)', 'EXECUTE');
ROLLBACK;
