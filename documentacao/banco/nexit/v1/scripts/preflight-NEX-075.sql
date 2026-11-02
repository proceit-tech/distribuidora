-- PRE-VERIFICACIÓN de NEX-075 (Compras → Entradas, E6-A / PRO-325). SOLO LECTURA: no modifica nada. La ejecuta el responsable en la VM ANTES de aplicar la migración:
--   docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < preflight-NEX-075.sql
-- Cualquier fila con ok = false en la sección 1 significa NO APLICAR hasta conciliar.
BEGIN READ ONLY;

\echo '== 1. Dependencias (todas deben dar ok = true) =='
SELECT 'motor de inventario NEX-014 (inventario_registrar_movimiento, 13 parámetros)' AS control, to_regprocedure('public.inventario_registrar_movimiento(uuid,uuid,text,text,date,uuid,uuid,jsonb,text,uuid,text,text,text)') IS NOT NULL AS ok
UNION ALL SELECT 'índice único de idempotencia de movimientos (NEX-014)', to_regclass('public.movimientos_inventario_idem_key') IS NOT NULL
UNION ALL SELECT 'permiso y alcance de depósito (usuario_tiene_permiso / usuario_puede_deposito)', to_regprocedure('public.usuario_tiene_permiso(uuid,uuid,text,text)') IS NOT NULL AND to_regprocedure('public.usuario_puede_deposito(uuid,uuid,uuid)') IS NOT NULL
UNION ALL SELECT 'envoltorio de grants que descubre ayudantes (NEX-037/052)', to_regprocedure('public.nex_aplicar_grants_runtime_base()') IS NOT NULL AND position('nex\_aplicar\_grants\_%' IN pg_get_functiondef('public.nex_aplicar_grants_runtime()'::regprocedure)) > 0
UNION ALL SELECT 'reinicio demo (nex_reinicio_demo_activo)', to_regprocedure('public.nex_reinicio_demo_activo(uuid)') IS NOT NULL
UNION ALL SELECT 'unicidad (empresa_id, id) en proveedores, movimientos_inventario y usuarios (destino de las FK compuestas)',
  EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.proveedores'::regclass AND contype = 'u' AND conname = 'proveedores_empresa_id_id_key')
  AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.movimientos_inventario'::regclass AND contype = 'u' AND conname = 'movimientos_inventario_empresa_id_id_key')
  AND EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = 'public.usuarios'::regclass AND c.contype IN ('u', 'p')
                AND (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM unnest(c.conkey) k JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k) = ARRAY['empresa_id', 'id'])
UNION ALL SELECT 'columnas de proveedores usadas (codigo, razon_social, tipo_documento, numero_documento, dv, activo, bloqueado)',
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'proveedores' AND column_name IN ('codigo', 'razon_social', 'tipo_documento', 'numero_documento', 'dv', 'activo', 'bloqueado')) = 7
UNION ALL SELECT 'productos.modo_control_stock y stock_lotes (empresa, producto, codigo_lote) único', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'productos' AND column_name = 'modo_control_stock')
  AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_lotes_empresa_producto_codigo_key')
UNION ALL SELECT 'rol nexit_runtime existe', EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime')
UNION ALL SELECT 'NEX-075 ausente (no se reaplica)', to_regclass('public.compras_entradas') IS NULL AND to_regclass('public.compras_entradas_intenciones') IS NULL;

\echo '== 2. Estado de migraciones registrado (el runner aplica TODAS las pendientes en orden: revise con --solo-listar antes) =='
SELECT version, nombre FROM public.schema_migrations WHERE version IN ('NEX-014', 'NEX-052', 'NEX-066', 'NEX-074', 'NEX-075') ORDER BY version;
SELECT count(*) AS total, max(version) AS ultima FROM public.schema_migrations;

\echo '== 3. Informativo: permisos COMPRAS en el catálogo (se crearán si faltan; NO se asignan a perfiles) =='
SELECT codigo, clase, nivel_alcance FROM public.permisos WHERE recurso = 'COMPRAS' ORDER BY codigo;

\echo '== 4. Informativo: entradas COMPRA manuales ya registradas (NO serán entradas de Compras ni fuente de E6-B) =='
SELECT m.empresa_id, count(*) AS movimientos_compra_manuales, min(m.fecha_movimiento) AS desde, max(m.fecha_movimiento) AS hasta
  FROM public.movimientos_inventario m WHERE m.tipo_movimiento = 'ENTRADA' AND m.tipo_origen = 'COMPRA' GROUP BY m.empresa_id;

\echo '== 5. Informativo: proveedores elegibles (activos y no bloqueados) por empresa =='
SELECT empresa_id, count(*) FILTER (WHERE activo AND NOT bloqueado) AS elegibles, count(*) AS total FROM public.proveedores GROUP BY empresa_id;

ROLLBACK;
