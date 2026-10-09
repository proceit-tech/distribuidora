-- T01 — Estructura: tablas del código desplegado, control de migraciones, triggers, ausencia de nombres en inglés.
\i _helpers.sql
DO $$
DECLARE req text[] := ARRAY['empresas','usuarios','perfiles','permisos','perfil_permiso','usuario_perfil','sesiones_usuario','eventos_seguridad',
  'referencia_geografica_paises','referencia_geografica_departamentos','referencia_geografica_distritos','referencia_geografica_ciudades',
  'monedas','impuestos','medios_pago','incoterms','unidades_medida','condiciones_pago','grupos_cliente','grupos_proveedor','zonas_comerciales',
  'rutas_entrega','canales_venta','vendedores','listas_precio','clientes','cliente_contactos','direcciones_cliente','cliente_documentos',
  'proveedores','proveedor_contactos','proveedor_direcciones','proveedor_cuentas_bancarias','proveedor_retenciones','proveedor_documentos',
  'categorias_producto','marcas_producto','productos','producto_codigos','producto_unidades','producto_proveedores',
  'producto_deposito_configuracion','producto_alternativos','producto_componentes','producto_documentos','depositos','sucursales',
  'lista_precio_items','lista_precio_escalones','lista_precio_reglas','stock_saldos','stock_lotes','movimientos_inventario','movimiento_lineas','inventario_costos'];
  t text; faltan text[] := '{}';
BEGIN
  FOREACH t IN ARRAY req LOOP
    IF to_regclass('public.' || t) IS NULL THEN faltan := faltan || t; END IF;
  END LOOP;
  PERFORM pg_temp.ok(cardinality(faltan) = 0, 'existen las ' || cardinality(req) || ' tablas requeridas (faltan: ' || coalesce(array_to_string(faltan, ','), 'ninguna') || ')');
END $$;

SELECT pg_temp.ok((SELECT count(*) FROM schema_migrations) = 13, 'schema_migrations registra las 13 migraciones');
SELECT pg_temp.ok((SELECT count(*) FROM schema_migrations WHERE checksum ~ '^[0-9a-f]{64}$') = 13, 'cada migración tiene checksum SHA-256');

-- toda tabla con actualizado_at tiene su trigger
SELECT pg_temp.ok(NOT EXISTS (
  SELECT 1 FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.column_name = 'actualizado_at'
     AND NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = ('public.' || c.table_name)::regclass AND g.tgname = c.table_name || '_actualizado_trg')
), 'todas las tablas con actualizado_at tienen trigger de actualización');

-- toda tabla con empresa_id tiene una FK que empieza por empresa_id (hacia empresas o hacia un padre de la MISMA empresa)
SELECT pg_temp.ok(NOT EXISTS (
  SELECT 1 FROM information_schema.columns c
   JOIN information_schema.tables t ON t.table_schema = 'public' AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
   WHERE c.table_schema = 'public' AND c.column_name = 'empresa_id' AND c.table_name <> 'empresas'
     AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = ('public.' || c.table_name)::regclass AND k.contype = 'f'
                       AND k.conkey[1] = (SELECT attnum FROM pg_attribute WHERE attrelid = k.conrelid AND attname = 'empresa_id'))
), 'toda tabla con empresa_id tiene una FK anclada en empresa_id (aislamiento referencial)');

-- esquema en español: ninguna tabla/columna con nombres típicos en inglés
SELECT pg_temp.ok(NOT EXISTS (
  SELECT 1 FROM information_schema.columns
   WHERE table_schema = 'public' AND column_name ~ '(^|_)(company|created|updated|is_active|warehouse|customer|supplier|product_id|quantity)(_|$)'
), 'sin columnas con nombres en inglés (company/created/is_active/...)');
SELECT pg_temp.ok(NOT EXISTS (
  SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name ~ '^(companies|customers|suppliers|products|users|roles|warehouses|branches)$'
), 'sin tablas con nombres en inglés');

-- el hash de contraseña solo puede ser bcrypt ($2a$): nunca texto plano en la semilla
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM usuarios WHERE password_hash !~ '^\$2a\$'), 'todos los password_hash son bcrypt $2a$');
-- migraciones/seeds versionados no contienen contraseñas ni la credencial pública anterior
