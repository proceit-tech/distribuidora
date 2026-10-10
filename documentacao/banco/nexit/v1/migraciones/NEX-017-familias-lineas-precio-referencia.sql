-- =====================================================================
-- NEX-017 — Familias y Líneas de producto, precio de venta de referencia
-- Complementa el modelo de datos para la ficha de Productos (campos Familia, Línea, Precio de venta de referencia).
--   * familias_producto  : catálogo auxiliar por empresa.
--   * lineas_producto    : catálogo auxiliar por empresa, vinculado a UNA familia.
--   * productos.familia_id / linea_id: columnas que ya existían (NEX-007) sin FK; ahora con FK compuesta y coherencia línea→familia.
--   * listas_precio.es_referencia: marca la lista de venta que guarda el "precio de venta de referencia" (sin duplicar estructuras de precios).
--   * lista_precio_referencia() / producto_fijar_precio_referencia(): lectura/escritura del precio de referencia con su moneda.
-- NO modifica NEX-001..016. Redefine nex_aplicar_grants_runtime() (CREATE OR REPLACE) para conceder las tablas nuevas.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable.
-- Aplicar con documentacao/banco/nexit/v1/scripts/aplicar-migraciones.sh (transacción única + checksum).
-- =====================================================================

-- 0) Guardia: productos.familia_id / linea_id no tenían tabla destino; no pueden contener valores huérfanos.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM productos WHERE familia_id IS NOT NULL OR linea_id IS NOT NULL) THEN
    RAISE EXCEPTION 'NEX-017: productos.familia_id/linea_id contienen valores sin catálogo; revisar antes de aplicar' USING ERRCODE = 'P0001';
  END IF;
END $$;

-- 1) Familias
CREATE TABLE familias_producto (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid        NOT NULL REFERENCES empresas (id),
  codigo          text        CONSTRAINT familias_producto_codigo_chk CHECK (codigo IS NULL OR (length(btrim(codigo)) > 0 AND char_length(codigo) <= 40)),
  nombre          text        NOT NULL CONSTRAINT familias_producto_nombre_chk CHECK (length(btrim(nombre)) > 0 AND char_length(nombre) <= 120),
  descripcion     text        CONSTRAINT familias_producto_desc_chk CHECK (char_length(descripcion) <= 500),
  activo          boolean     NOT NULL DEFAULT true,
  creado_at       timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT familias_producto_empresa_id_id_key UNIQUE (empresa_id, id)
);
CREATE UNIQUE INDEX familias_producto_empresa_codigo_key ON familias_producto (empresa_id, lower(codigo)) WHERE codigo IS NOT NULL;
CREATE UNIQUE INDEX familias_producto_empresa_nombre_key ON familias_producto (empresa_id, lower(btrim(nombre)));

-- 2) Líneas (pertenecen a una familia de la MISMA empresa)
CREATE TABLE lineas_producto (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid        NOT NULL REFERENCES empresas (id),
  familia_id      uuid        NOT NULL,
  codigo          text        CONSTRAINT lineas_producto_codigo_chk CHECK (codigo IS NULL OR (length(btrim(codigo)) > 0 AND char_length(codigo) <= 40)),
  nombre          text        NOT NULL CONSTRAINT lineas_producto_nombre_chk CHECK (length(btrim(nombre)) > 0 AND char_length(nombre) <= 120),
  descripcion     text        CONSTRAINT lineas_producto_desc_chk CHECK (char_length(descripcion) <= 500),
  activo          boolean     NOT NULL DEFAULT true,
  creado_at       timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lineas_producto_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT lineas_producto_empresa_familia_id_key UNIQUE (empresa_id, familia_id, id),   -- destino de la FK de productos (coherencia línea→familia)
  CONSTRAINT lineas_producto_familia_fk FOREIGN KEY (empresa_id, familia_id) REFERENCES familias_producto (empresa_id, id)
);
CREATE UNIQUE INDEX lineas_producto_empresa_codigo_key ON lineas_producto (empresa_id, lower(codigo)) WHERE codigo IS NOT NULL;
CREATE UNIQUE INDEX lineas_producto_familia_nombre_key ON lineas_producto (empresa_id, familia_id, lower(btrim(nombre)));
CREATE INDEX lineas_producto_familia_idx ON lineas_producto (empresa_id, familia_id);

-- 3) Productos: FK compuestas (empresa_id, ...). La línea debe pertenecer a la familia del propio producto.
ALTER TABLE productos
  ADD CONSTRAINT productos_familia_fk FOREIGN KEY (empresa_id, familia_id) REFERENCES familias_producto (empresa_id, id),
  ADD CONSTRAINT productos_linea_fk   FOREIGN KEY (empresa_id, familia_id, linea_id) REFERENCES lineas_producto (empresa_id, familia_id, id),
  ADD CONSTRAINT productos_linea_requiere_familia_chk CHECK (linea_id IS NULL OR familia_id IS NOT NULL);
CREATE INDEX productos_familia_idx ON productos (empresa_id, familia_id) WHERE familia_id IS NOT NULL;
CREATE INDEX productos_linea_idx   ON productos (empresa_id, linea_id)   WHERE linea_id IS NOT NULL;

-- 4) Precio de venta de referencia = ítem de UNA lista de venta marcada es_referencia (por empresa).
--    La moneda es la de la lista (y se copia en lista_precio_items.moneda_codigo). Sin ítem => "sin precio" (nunca un valor inventado).
ALTER TABLE listas_precio ADD COLUMN es_referencia boolean NOT NULL DEFAULT false;
ALTER TABLE listas_precio ADD CONSTRAINT listas_precio_referencia_chk CHECK (
  NOT es_referencia OR (tipo_lista = 'VENTA' AND modo_precio = 'PRECIO_FIJO' AND lista_precio_base_id IS NULL
                        AND grupo_cliente_id IS NULL AND cliente_id IS NULL AND zona_comercial_id IS NULL AND canal_venta_id IS NULL));
CREATE UNIQUE INDEX listas_precio_una_referencia_key ON listas_precio (empresa_id) WHERE es_referencia;

-- Devuelve la lista de referencia de la empresa; con p_crear = true la crea (moneda base de la empresa) si todavía no existe.
CREATE OR REPLACE FUNCTION lista_precio_referencia(p_empresa uuid, p_crear boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v uuid; v_moneda text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('lista_ref:' || p_empresa::text, 0));
  SELECT id INTO v FROM listas_precio WHERE empresa_id = p_empresa AND es_referencia;
  IF v IS NULL AND p_crear THEN
    SELECT moneda_base_codigo INTO v_moneda FROM empresas WHERE id = p_empresa;
    IF v_moneda IS NULL THEN RAISE EXCEPTION 'la empresa % no existe o no tiene moneda base', p_empresa USING ERRCODE = 'P0001'; END IF;
    INSERT INTO listas_precio (empresa_id, codigo, nombre, descripcion, tipo_lista, moneda_codigo, estado, modo_precio, es_referencia, descuento_maximo_pct)
    VALUES (p_empresa, 'REF-VENTA', 'Precio de venta de referencia', 'Lista de referencia de la ficha de productos', 'VENTA', v_moneda, 'ACTIVA', 'PRECIO_FIJO', true, 0)
    RETURNING id INTO v;
  END IF;
  RETURN v;
END $$;

-- Fija (o quita, con p_precio NULL) el precio de venta de referencia de un producto de la empresa. Devuelve la moneda del precio (NULL si se quitó).
CREATE OR REPLACE FUNCTION producto_fijar_precio_referencia(p_empresa uuid, p_producto uuid, p_precio numeric) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v_lista uuid; v_moneda text; v_unidad uuid;
BEGIN
  SELECT unidad_medida_id INTO v_unidad FROM productos WHERE empresa_id = p_empresa AND id = p_producto;
  IF NOT FOUND THEN RAISE EXCEPTION 'el producto % no existe en esta empresa', p_producto USING ERRCODE = 'P0001'; END IF;
  IF p_precio IS NULL THEN
    v_lista := lista_precio_referencia(p_empresa, false);
    IF v_lista IS NOT NULL THEN
      DELETE FROM lista_precio_items WHERE empresa_id = p_empresa AND lista_precio_id = v_lista AND producto_id = p_producto;
    END IF;
    RETURN NULL;
  END IF;
  IF p_precio < 0 OR p_precio <> round(p_precio, 4) THEN
    RAISE EXCEPTION 'precio de venta de referencia inválido (%): debe ser >= 0 con hasta 4 decimales', p_precio USING ERRCODE = 'P0001';
  END IF;
  v_lista := lista_precio_referencia(p_empresa, true);
  SELECT moneda_codigo INTO v_moneda FROM listas_precio WHERE empresa_id = p_empresa AND id = v_lista;
  INSERT INTO lista_precio_items (empresa_id, lista_precio_id, producto_id, unidad_medida_id, moneda_codigo, precio_base, precio_lista, vigente_desde)
  VALUES (p_empresa, v_lista, p_producto, v_unidad, v_moneda, p_precio, p_precio, (now() AT TIME ZONE 'America/Asuncion')::date)
  ON CONFLICT (empresa_id, lista_precio_id, producto_id)
  DO UPDATE SET precio_base = EXCLUDED.precio_base, precio_lista = EXCLUDED.precio_lista, unidad_medida_id = EXCLUDED.unidad_medida_id,
                moneda_codigo = EXCLUDED.moneda_codigo, activo = true, actualizado_at = now();
  RETURN v_moneda;
END $$;

-- Vista de lectura: precio de referencia vigente por producto (una fila por producto con precio).
CREATE VIEW v_producto_precio_referencia WITH (security_invoker = true) AS
SELECT i.empresa_id, i.producto_id, i.precio_lista AS precio, i.moneda_codigo AS moneda, i.vigente_desde
  FROM lista_precio_items i
  JOIN listas_precio l ON l.empresa_id = i.empresa_id AND l.id = i.lista_precio_id AND l.es_referencia
 WHERE i.activo;

-- Vista de lectura: costo promedio por producto (valorización real de inventario_costos, todos los depósitos). NULL si no hay saldo valorizado.
CREATE VIEW v_producto_costo_promedio WITH (security_invoker = true) AS
SELECT empresa_id, producto_id, sum(cantidad_valorizada) AS cantidad_valorizada, sum(valor_total) AS valor_total,
       CASE WHEN sum(cantidad_valorizada) > 0 THEN round(sum(valor_total) / sum(cantidad_valorizada), 4) END AS costo_promedio
  FROM inventario_costos
 GROUP BY empresa_id, producto_id;

-- 5) Triggers de actualizado_at y permisos del rol de ejecución (misma definición de NEX-014 + tablas y funciones nuevas).
SELECT nex_instalar_triggers_actualizacion();

CREATE OR REPLACE FUNCTION nex_aplicar_grants_runtime() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE t text; f regprocedure;
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO nexit_runtime', current_database());
  GRANT USAGE ON SCHEMA public TO nexit_runtime;
  REVOKE CREATE ON SCHEMA public FROM nexit_runtime;
  REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM nexit_runtime;
  REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM nexit_runtime;

  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v') AND c.relname <> 'schema_migrations' LOOP
    EXECUTE format('GRANT SELECT ON %I TO nexit_runtime', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
      'clientes','cliente_contactos','direcciones_cliente','cliente_documentos',
      'proveedores','proveedor_contactos','proveedor_direcciones','proveedor_cuentas_bancarias','proveedor_retenciones','proveedor_documentos',
      'productos','producto_codigos','producto_unidades','producto_proveedores','producto_deposito_configuracion',
      'producto_alternativos','producto_componentes','producto_documentos',
      'listas_precio','lista_precio_items','lista_precio_escalones','lista_precio_reglas',
      'stock_lotes',
      'familias_producto','lineas_producto'] LOOP
    EXECUTE format('GRANT INSERT, UPDATE, DELETE ON %I TO nexit_runtime', t);
  END LOOP;
  -- stock_saldos, inventario_costos, movimientos_inventario y movimiento_lineas: SIN escritura directa (solo por inventario_registrar_movimiento / inventario_anular_movimiento).
  GRANT INSERT, UPDATE ON sesiones_usuario  TO nexit_runtime;
  GRANT INSERT         ON eventos_seguridad TO nexit_runtime;
  GRANT UPDATE (intentos_fallidos, bloqueado_hasta, ultimo_acceso_at) ON usuarios TO nexit_runtime;

  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
              AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM nexit_runtime', f);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.prokind = 'f'
              AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
              AND (p.prorettype = 'trigger'::regtype OR p.proname IN (
                   'inventario_registrar_movimiento','inventario_anular_movimiento','usuario_tiene_permiso','usuario_puede_deposito',
                   'nex_reinicio_demo_activo','costo_promedio_ponderado',
                   'lista_precio_referencia','producto_fijar_precio_referencia')) LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO nexit_runtime', f);
  END LOOP;
END $$;

SELECT nex_aplicar_grants_runtime();
