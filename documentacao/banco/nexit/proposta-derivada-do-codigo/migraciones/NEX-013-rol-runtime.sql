-- =====================================================================
-- NEX-013 — Rol de ejecución de la aplicación: nexit_runtime (sin superusuario)
-- Decisión P4: la aplicación debe dejar de conectarse como superusuario del contenedor (nexit_app lo es).
-- Este archivo CREA el rol y los permisos mínimos, pero NO cambia el DATABASE_URL de la VM:
-- el cambio de conexión es un paso posterior, con autorización del responsable (ver runbook).
-- La contraseña del rol NO está aquí: se define fuera de Git en el momento de la ejecución (ALTER ROLE ... PASSWORD).
-- Proyecto Nexit (NEXIT-2026-001). ESTADO: PROPUESTA — no ejecutar en la VM sin autorización.
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    CREATE ROLE nexit_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT;
  END IF;
END $$;

-- Re-ejecutable: el runner la vuelve a llamar después de cada migración futura.
CREATE OR REPLACE FUNCTION nex_aplicar_grants_runtime() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE t text;
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO nexit_runtime', current_database());
  GRANT USAGE ON SCHEMA public TO nexit_runtime;
  REVOKE CREATE ON SCHEMA public FROM nexit_runtime;

  -- Partir de cero (idempotente) y otorgar solo lo necesario.
  REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM nexit_runtime;
  REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM nexit_runtime;

  -- Lectura: todas las tablas funcionales y vistas, EXCEPTO el control de migraciones.
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v') AND c.relname <> 'schema_migrations' LOOP
    EXECUTE format('GRANT SELECT ON %I TO nexit_runtime', t);
  END LOOP;

  -- Escritura de negocio (datos de empresa; altas y edición con reemplazo de hijos).
  FOREACH t IN ARRAY ARRAY[
      'clientes','cliente_contactos','direcciones_cliente','cliente_documentos',
      'proveedores','proveedor_contactos','proveedor_direcciones','proveedor_cuentas_bancarias','proveedor_retenciones','proveedor_documentos',
      'productos','producto_codigos','producto_unidades','producto_proveedores','producto_deposito_configuracion',
      'producto_alternativos','producto_componentes','producto_documentos',
      'listas_precio','lista_precio_items','lista_precio_escalones','lista_precio_reglas',
      'stock_lotes','stock_saldos','inventario_costos'] LOOP
    EXECUTE format('GRANT INSERT, UPDATE, DELETE ON %I TO nexit_runtime', t);
  END LOOP;
  -- Movimientos: inmutables. Solo altas y anulación (UPDATE de estado); líneas solo altas.
  GRANT INSERT, UPDATE ON movimientos_inventario TO nexit_runtime;
  GRANT INSERT         ON movimiento_lineas      TO nexit_runtime;
  -- Sesión y seguridad: el login escribe sesiones/eventos y actualiza intentos del usuario.
  GRANT INSERT, UPDATE ON sesiones_usuario  TO nexit_runtime;
  GRANT INSERT         ON eventos_seguridad TO nexit_runtime;
  GRANT UPDATE (intentos_fallidos, bloqueado_hasta, ultimo_acceso_at) ON usuarios TO nexit_runtime;

  -- Catálogos globales y estructura de empresa: solo lectura (ya concedida arriba). Nunca escritura.
  -- Funciones: las utilitarias y de inventario son ejecutables; las de ciclo de vida DEMO NO (ver NEX-012).
  GRANT EXECUTE ON FUNCTION inventario_registrar_linea(uuid, uuid, uuid, numeric, numeric, uuid, text, uuid, numeric, text) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION nex_siguiente_numero_movimiento(uuid) TO nexit_runtime;
END $$;

SELECT nex_aplicar_grants_runtime();
