-- PRE-VERIFICACIÓN de NEX-081 (política «Bloquear facturación por stock insuficiente» + bajas pendientes, PRO-354-R02). SOLO LECTURA. La ejecuta el responsable en la VM ANTES de aplicar:
--   docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < preflight-NEX-081.sql
-- Cualquier fila con ok = false en la sección 1 significa NO APLICAR hasta conciliar. No escribe nada (transacción READ ONLY + ROLLBACK). Nada de esto fue ejecutado por Claude.
BEGIN READ ONLY;

\echo '== 1. Dependencias y estado (todas deben dar ok = true) =='
SELECT 'motor de movimientos NEX-014 (inventario_registrar_movimiento)' AS control,
       to_regprocedure('public.inventario_registrar_movimiento(uuid,uuid,text,text,date,uuid,uuid,jsonb,text,uuid,text,text,text)') IS NOT NULL AS ok
UNION ALL SELECT 'baja de stock NEX-067 presente (fe_stock_baja_documento + documento_electronico_stock_salidas)',
       to_regprocedure('public.fe_stock_baja_documento(uuid,uuid,uuid,jsonb)') IS NOT NULL AND to_regclass('public.documento_electronico_stock_salidas') IS NOT NULL
UNION ALL SELECT 'fe_stock_baja_documento es todavía la versión NEX-067 (no redefinida por otra migración)',
       to_regprocedure('public.fe_stock_baja_documento(uuid,uuid,uuid,jsonb)') IS NOT NULL
       AND position('NEX:STOCK_REPARTO_INVALIDO' IN pg_get_functiondef('public.fe_stock_baja_documento(uuid,uuid,uuid,jsonb)'::regprocedure)) > 0
       AND position('fe_stock_pendientes_preparacion' IN pg_get_functiondef('public.fe_stock_baja_documento(uuid,uuid,uuid,jsonb)'::regprocedure)) = 0
UNION ALL SELECT 'emisión con dirección/vendedor NEX-076 (fe_documento_crear_fe_receptor, 14 parámetros)',
       to_regprocedure('public.fe_documento_crear_fe_receptor(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid,uuid)') IS NOT NULL
UNION ALL SELECT 'envoltorio de grants que descubre nex_aplicar_grants_* (NEX-037/NEX-052)',
       to_regprocedure('public.nex_aplicar_grants_runtime()') IS NOT NULL AND to_regprocedure('public.nex_aplicar_grants_runtime_base()') IS NOT NULL
UNION ALL SELECT 'R01: alcance de sucursal y estado de demo (sucursal_en_alcance NEX-046, nex_reinicio_demo_activo NEX-012)',
       to_regprocedure('public.sucursal_en_alcance(uuid,uuid,uuid)') IS NOT NULL AND to_regprocedure('public.nex_reinicio_demo_activo(uuid)') IS NOT NULL
UNION ALL SELECT 'R01: productos.unidad_medida_id / controla_stock / activo y depositos.sucursal_id / activo / es_de_terceros existen',
       (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'
          AND ((table_name = 'productos' AND column_name IN ('unidad_medida_id', 'controla_stock', 'activo'))
               OR (table_name = 'depositos' AND column_name IN ('sucursal_id', 'activo', 'es_de_terceros')))) = 6
UNION ALL SELECT 'R01: la numeración de movimientos usa el candado ''movimientos.numero:'' (NEX-011) que serializa el faltante real con las entradas',
       to_regprocedure('public.nex_siguiente_numero_movimiento(uuid)') IS NOT NULL
       AND position('movimientos.numero:' IN pg_get_functiondef('public.nex_siguiente_numero_movimiento(uuid)'::regprocedure)) > 0
UNION ALL SELECT 'R01: el motor de líneas lee el producto con FOR SHARE (NEX-052)',
       position('FOR SHARE' IN pg_get_functiondef('public.inventario_agregar_linea(uuid,uuid,uuid,numeric,numeric,uuid,text,uuid,numeric,text,numeric)'::regprocedure)) > 0
UNION ALL SELECT 'tabla stock_lotes (evidencia de control de lotes, NEX-009)', to_regclass('public.stock_lotes') IS NOT NULL
UNION ALL SELECT 'tabla eventos_seguridad (auditoría del cambio de política)', to_regclass('public.eventos_seguridad') IS NOT NULL
UNION ALL SELECT 'NEX-081 ausente: empresas.bloquear_stock_insuficiente no existe',
       NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'empresas' AND column_name = 'bloquear_stock_insuficiente')
UNION ALL SELECT 'NEX-081 ausente: tablas de pendientes no existen',
       to_regclass('public.documento_electronico_stock_pendientes') IS NULL AND to_regclass('public.fe_stock_pendientes_preparacion') IS NULL
UNION ALL SELECT 'NEX-081 ausente: funciones nuevas no existen',
       to_regprocedure('public.fe_documento_crear_fe_stock_pendiente(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid,uuid,jsonb,boolean)') IS NULL
       AND to_regprocedure('public.fe_stock_pendiente_confirmar(uuid,uuid,uuid)') IS NULL
       AND to_regprocedure('public.fe_stock_pendientes_filtros(uuid,uuid)') IS NULL
UNION ALL SELECT 'NEX-081 ausente: triggers de guarda R01 no existen',
       NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname IN ('fe_stock_pendientes_producto_guarda_trg', 'fe_stock_pendientes_deposito_guarda_trg') AND NOT tgisinternal);

\echo '== 2. Informativo: empresas (todas quedarán con bloquear_stock_insuficiente = TRUE, comportamiento actual) y productos con lotes registrados =='
SELECT (SELECT count(*) FROM public.empresas) AS empresas,
       (SELECT count(DISTINCT (empresa_id, producto_id)) FROM public.stock_lotes) AS productos_con_lotes;

\echo '== 3. Estado de migraciones registrado (NEX-080 es de PRO-342: NEX-081 no la necesita ni la modifica; ver PROCEDIMIENTO-NEX-081.md) =='
SELECT version, nombre FROM public.schema_migrations WHERE version IN ('NEX-067', 'NEX-076', 'NEX-078', 'NEX-079', 'NEX-080', 'NEX-081') ORDER BY version;

ROLLBACK;
