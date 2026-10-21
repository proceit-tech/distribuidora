-- PRE-VERIFICACIÓN de NEX-067 (control y baja de stock al emitir la Factura Electrónica, PRO-200 E02). SOLO LECTURA: no modifica nada. La ejecuta el responsable en la VM ANTES de aplicar la migración:
--   docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < preflight-NEX-067.sql
-- Cualquier fila con ok = false en la sección 1 significa NO APLICAR hasta conciliar.
BEGIN READ ONLY;

\echo '== 1. Dependencias (todas deben dar ok = true) =='
SELECT 'motor de inventario NEX-014 (inventario_registrar_movimiento)' AS control, to_regprocedure('public.inventario_registrar_movimiento(uuid,uuid,text,text,date,uuid,uuid,jsonb,text,uuid,text,text,text)') IS NOT NULL AS ok
UNION ALL SELECT 'línea de inventario (inventario_agregar_linea, 11 parámetros)', to_regprocedure('public.inventario_agregar_linea(uuid,uuid,uuid,numeric,numeric,uuid,text,uuid,numeric,text,numeric)') IS NOT NULL
UNION ALL SELECT 'numeración de movimientos (nex_siguiente_numero_movimiento)', to_regprocedure('public.nex_siguiente_numero_movimiento(uuid)') IS NOT NULL
UNION ALL SELECT 'emisión de FE (fe_documento_crear_fe, firma de 11 parámetros)', to_regprocedure('public.fe_documento_crear_fe(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb)') IS NOT NULL
UNION ALL SELECT 'alcance de sucursal (sucursal_en_alcance)', to_regprocedure('public.sucursal_en_alcance(uuid,uuid,uuid)') IS NOT NULL
UNION ALL SELECT 'permiso y alcance de depósito (usuario_tiene_permiso / usuario_puede_deposito)', to_regprocedure('public.usuario_tiene_permiso(uuid,uuid,text,text)') IS NOT NULL AND to_regprocedure('public.usuario_puede_deposito(uuid,uuid,uuid)') IS NOT NULL
UNION ALL SELECT 'envoltorio de grants (NEX-037/052)', to_regprocedure('public.nex_aplicar_grants_runtime_base()') IS NOT NULL
UNION ALL SELECT 'reinicio demo (nex_reinicio_demo_activo)', to_regprocedure('public.nex_reinicio_demo_activo(uuid)') IS NOT NULL
UNION ALL SELECT 'tablas stock_saldos, stock_lotes, inventario_costos, documentos_electronicos, documento_electronico_solicitudes', to_regclass('public.stock_saldos') IS NOT NULL AND to_regclass('public.stock_lotes') IS NOT NULL AND to_regclass('public.inventario_costos') IS NOT NULL AND to_regclass('public.documentos_electronicos') IS NOT NULL AND to_regclass('public.documento_electronico_solicitudes') IS NOT NULL
UNION ALL SELECT 'productos.controla_stock y depositos.es_de_terceros existen', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'productos' AND column_name = 'controla_stock') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'depositos' AND column_name = 'es_de_terceros')
UNION ALL SELECT 'rol nexit_runtime existe', EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime')
UNION ALL SELECT 'índice único de idempotencia de movimientos (NEX-014)', to_regclass('public.movimientos_inventario_idem_key') IS NOT NULL
UNION ALL SELECT 'NEX-067 ausente (no se reaplica)', to_regclass('public.documento_electronico_stock_salidas') IS NULL;

\echo '== 2. Estado de migraciones registrado (el runner aplica TODAS las pendientes en orden: revise con --solo-listar antes) =='
SELECT version, nombre FROM public.schema_migrations WHERE version IN ('NEX-014', 'NEX-048', 'NEX-065', 'NEX-066', 'NEX-067') ORDER BY version;
SELECT count(*) AS total, max(version) AS ultima FROM public.schema_migrations;

\echo '== 3. Informativo: qué pasará con el control de stock al activar la migración =='
SELECT count(*) AS productos_que_controlan_stock FROM public.productos WHERE controla_stock AND activo AND vendible;
SELECT count(*) AS de_ellos_sin_saldo_disponible_propio
  FROM public.productos p
 WHERE p.controla_stock AND p.activo AND p.vendible
   AND NOT EXISTS (SELECT 1 FROM public.stock_saldos s WHERE s.empresa_id = p.empresa_id AND s.producto_id = p.id AND s.estado_stock = 'DISPONIBLE' AND s.propiedad = 'PROPIO' AND s.cantidad > 0);
SELECT d.codigo AS deposito, d.activo, d.es_de_terceros, s.nombre AS sucursal, count(DISTINCT ss.producto_id) AS productos_con_saldo
  FROM public.depositos d
  JOIN public.sucursales s ON s.empresa_id = d.empresa_id AND s.id = d.sucursal_id
  LEFT JOIN public.stock_saldos ss ON ss.empresa_id = d.empresa_id AND ss.deposito_id = d.id AND ss.estado_stock = 'DISPONIBLE' AND ss.propiedad = 'PROPIO' AND ss.cantidad > 0
 GROUP BY d.codigo, d.activo, d.es_de_terceros, s.nombre ORDER BY d.codigo;
SELECT count(*) AS facturas_fe_existentes_sin_baja_de_stock FROM public.documentos_electronicos WHERE tipo = 'FE';

ROLLBACK;
