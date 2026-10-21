-- PRE-VERIFICACIÓN de NEX-068 (dirección de entrega en la Factura Electrónica, PRO-200 E04). SOLO LECTURA: no modifica nada. La ejecuta el responsable en la VM ANTES de aplicar la migración:
--   docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < preflight-NEX-068.sql
-- Cualquier fila con ok = false en la sección 1 significa NO APLICAR hasta conciliar (NEX-068 exige NEX-067 aplicada antes).
BEGIN READ ONLY;

\echo '== 1. Dependencias (todas deben dar ok = true) =='
SELECT 'NEX-067 aplicada (fe_documento_crear_fe_con_stock, 12 parámetros)' AS control, to_regprocedure('public.fe_documento_crear_fe_con_stock(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb)') IS NOT NULL AS ok
UNION ALL SELECT 'direcciones_cliente y documentos_electronicos existen', to_regclass('public.direcciones_cliente') IS NOT NULL AND to_regclass('public.documentos_electronicos') IS NOT NULL
UNION ALL SELECT 'direcciones_cliente tiene tipo y es_entrega_default', (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'direcciones_cliente' AND column_name IN ('tipo', 'es_entrega_default', 'etiqueta', 'horario_recepcion')) = 4
UNION ALL SELECT 'permiso y reinicio demo (usuario_tiene_permiso / nex_reinicio_demo_activo)', to_regprocedure('public.usuario_tiene_permiso(uuid,uuid,text,text)') IS NOT NULL AND to_regprocedure('public.nex_reinicio_demo_activo(uuid)') IS NOT NULL
UNION ALL SELECT 'envoltorio de grants (NEX-037/052)', to_regprocedure('public.nex_aplicar_grants_runtime_base()') IS NOT NULL
UNION ALL SELECT 'rol nexit_runtime existe', EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime')
UNION ALL SELECT 'NEX-068 ausente (no se reaplica)', to_regclass('public.documento_electronico_entregas') IS NULL;

\echo '== 2. Estado de migraciones registrado (el runner aplica TODAS las pendientes en orden: revise con --solo-listar antes) =='
SELECT version, nombre FROM public.schema_migrations WHERE version IN ('NEX-065', 'NEX-066', 'NEX-067', 'NEX-068') ORDER BY version;
SELECT count(*) AS total, max(version) AS ultima FROM public.schema_migrations;

\echo '== 3. Informativo: destinos elegibles por cliente (toda dirección registrada que no sea exclusivamente la fiscal, o la fiscal marcada como predeterminada de entrega) =='
SELECT count(*) AS clientes_con_destinos_elegibles
  FROM (SELECT empresa_id, cliente_id FROM public.direcciones_cliente WHERE es_entrega_default OR (NOT es_fiscal AND tipo <> 'FISCAL') GROUP BY empresa_id, cliente_id) x;
SELECT count(*) AS clientes_con_destinos_pero_sin_predeterminado
  FROM (SELECT empresa_id, cliente_id FROM public.direcciones_cliente WHERE es_entrega_default OR (NOT es_fiscal AND tipo <> 'FISCAL') GROUP BY empresa_id, cliente_id HAVING NOT bool_or(es_entrega_default)) x;
SELECT tipo, count(*) AS direcciones, count(*) FILTER (WHERE es_entrega_default) AS predeterminadas FROM public.direcciones_cliente GROUP BY tipo ORDER BY tipo;

ROLLBACK;
