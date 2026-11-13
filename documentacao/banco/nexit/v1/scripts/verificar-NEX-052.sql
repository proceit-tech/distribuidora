-- VERIFICACIÓN de solo lectura de NEX-052 (no modifica nada). Ejecución por el responsable DESPUÉS de aplicarla:  psql -f verificar-NEX-052.sql
-- Cada fila debe dar «ok» = true.

-- 1) Existen la función, la tabla de historial y el trigger de inmutabilidad
SELECT 'función de validación' AS control, to_regprocedure('public.producto_cambiar_unidad_base_validar(uuid,uuid,uuid,uuid,uuid)') IS NOT NULL AS ok
UNION ALL SELECT 'tabla de historial', to_regclass('public.producto_unidad_base_historial') IS NOT NULL
UNION ALL SELECT 'trigger de inmutabilidad', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'producto_unidad_base_historial_inmutable_trg' AND NOT tgisinternal)
-- 2) El escritor de stock bloquea el producto con FOR SHARE (serialización con el cambio de unidad)
UNION ALL SELECT 'inventario_agregar_linea usa FOR SHARE', position('FOR SHARE' IN pg_get_functiondef('public.inventario_agregar_linea(uuid,uuid,uuid,numeric,numeric,uuid,text,uuid,numeric,text,numeric)'::regprocedure)) > 0
-- 3) La función de validación bloquea el producto FOR UPDATE y exige stock cero
UNION ALL SELECT 'validación bloquea el producto', position('FOR UPDATE' IN pg_get_functiondef('public.producto_cambiar_unidad_base_validar(uuid,uuid,uuid,uuid,uuid)'::regprocedure)) > 0
-- 4) Privilegios del rol de la aplicación (si existe): ejecuta la función, solo lee el historial
UNION ALL SELECT 'runtime ejecuta la validación', NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') OR has_function_privilege('nexit_runtime', 'public.producto_cambiar_unidad_base_validar(uuid,uuid,uuid,uuid,uuid)', 'EXECUTE')
UNION ALL SELECT 'runtime solo lee el historial', NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime')
       OR (has_table_privilege('nexit_runtime', 'public.producto_unidad_base_historial', 'SELECT') AND NOT has_table_privilege('nexit_runtime', 'public.producto_unidad_base_historial', 'INSERT, UPDATE, DELETE'))
-- 5) El envoltorio reaplica los ayudantes (ninguno se pierde)
UNION ALL SELECT 'envoltorio descubre ayudantes', position('nex\_aplicar\_grants\_%' IN pg_get_functiondef('public.nex_aplicar_grants_runtime()'::regprocedure)) > 0;

-- Ayudantes de grants que el envoltorio aplicará (informativo)
SELECT p.proname AS ayudante FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace AND p.pronargs = 0 AND p.proname LIKE 'nex\_aplicar\_grants\_%' ORDER BY 1;
