-- =====================================================================
-- NEX-020 — Escritura controlada de Categorías y Marcas de producto
-- Problema: nexit_runtime solo tenía SELECT en categorias_producto / marcas_producto (NEX-013), por lo que la pantalla
-- administrativa de catálogos (Corrección 3) no podía crear ni editar categorías/marcas.
-- Solución (mínimo privilegio, sin conceder escritura directa sobre las tablas):
--   1) Índices únicos por empresa (nombre y código, sin distinguir mayúsculas ni espacios extremos), igual que familias/líneas (NEX-017).
--      Antes de crearlos se verifica que NO existan duplicados; si existen, la migración aborta con el detalle y no cambia nada.
--   2) Función SECURITY DEFINER catalogo_producto_guardar(): alta y edición/inactivación de CATEGORIA o MARCA.
--      * MODELO DE CONFIANZA: la función NO recibe empresa ni usuario del llamador. Recibe la credencial de la sesión autenticada
--        (id de sesión + secreto del token de la cookie) y la VERIFICA en sesiones_usuario (bcrypt: token_hash = crypt(secreto, token_hash),
--        sin revocar, sin expirar, usuario ACTIVO y no bloqueado, empresa ACTIVA). Empresa y usuario se DERIVAN de esa fila.
--        El secreto (256 bits aleatorios) solo existe en la cookie del usuario; en la BD solo está su hash bcrypt, que el rol de ejecución
--        puede leer pero no invertir. Conocer el UUID de otro administrador (o de otra empresa) no sirve para representarlo.
--        No se usa ninguna variable de sesión de PostgreSQL como prueba de identidad.
--      * Luego valida PRODUCTOS.CREAR / PRODUCTOS.EDITAR con usuario_tiene_permiso() sobre la empresa/usuario derivados.
--      * search_path fijo (public, pg_temp); toda sentencia filtra por la empresa derivada; ningún camino toca otra empresa.
--      * Sin DELETE físico (la función no borra; el rol no recibe DELETE).
--   3) nex_aplicar_grants_runtime() se redefine (idéntica a NEX-017) añadiendo SOLO EXECUTE sobre la nueva función.
-- Preserva registros y UUID existentes (no modifica filas). NO modifica NEX-001..019. Re-ejecutable por el runner (checksum).
-- NO ejecutar en la VM / base real sin autorización expresa del responsable.
-- =====================================================================

-- 1) Guardia: duplicados existentes (misma empresa, nombre o código equivalentes) impiden crear los índices.
DO $$
DECLARE d record; msg text := '';
BEGIN
  FOR d IN
    SELECT 'categorias_producto' AS tabla, 'nombre' AS campo, empresa_id, lower(btrim(nombre)) AS valor, count(*) AS n
      FROM categorias_producto GROUP BY empresa_id, lower(btrim(nombre)) HAVING count(*) > 1
    UNION ALL
    SELECT 'categorias_producto', 'codigo', empresa_id, lower(btrim(codigo)), count(*)
      FROM categorias_producto WHERE codigo IS NOT NULL AND btrim(codigo) <> '' GROUP BY empresa_id, lower(btrim(codigo)) HAVING count(*) > 1
    UNION ALL
    SELECT 'marcas_producto', 'nombre', empresa_id, lower(btrim(nombre)), count(*)
      FROM marcas_producto GROUP BY empresa_id, lower(btrim(nombre)) HAVING count(*) > 1
    UNION ALL
    SELECT 'marcas_producto', 'codigo', empresa_id, lower(btrim(codigo)), count(*)
      FROM marcas_producto WHERE codigo IS NOT NULL AND btrim(codigo) <> '' GROUP BY empresa_id, lower(btrim(codigo)) HAVING count(*) > 1
  LOOP
    msg := msg || format(E'\n  %s.%s empresa=%s valor=%L (%s filas)', d.tabla, d.campo, d.empresa_id, d.valor, d.n);
  END LOOP;
  IF msg <> '' THEN
    RAISE EXCEPTION 'NEX-020: existen duplicados; resuélvalos (renombrar/inactivar) antes de aplicar:%', msg USING ERRCODE = 'P0001';
  END IF;
END $$;

-- 2) Índices únicos por empresa (mismas reglas que la API y que NEX-017: sin distinguir mayúsculas ni espacios extremos).
CREATE UNIQUE INDEX categorias_producto_empresa_nombre_key ON categorias_producto (empresa_id, lower(btrim(nombre)));
CREATE UNIQUE INDEX categorias_producto_empresa_codigo_key ON categorias_producto (empresa_id, lower(btrim(codigo))) WHERE codigo IS NOT NULL AND btrim(codigo) <> '';
CREATE UNIQUE INDEX marcas_producto_empresa_nombre_key     ON marcas_producto (empresa_id, lower(btrim(nombre)));
CREATE UNIQUE INDEX marcas_producto_empresa_codigo_key     ON marcas_producto (empresa_id, lower(btrim(codigo))) WHERE codigo IS NOT NULL AND btrim(codigo) <> '';

-- 3) Escritura controlada. p_catalogo: 'CATEGORIA' | 'MARCA'. p_id NULL => alta (PRODUCTOS.CREAR); p_id => edición/(in)activación (PRODUCTOS.EDITAR).
--    p_sesion_id / p_secreto: credencial de la sesión autenticada (ver arriba). p_activo NULL => en la edición conserva el estado; en el alta = true.
--    Devuelve el id del registro. Errores: 42501 sesión inválida o sin permiso; P0001 datos inválidos; P0002 registro inexistente (o de otra empresa);
--    23505 duplicado (índices únicos).
CREATE OR REPLACE FUNCTION catalogo_producto_guardar(
  p_sesion_id uuid, p_secreto text, p_catalogo text, p_id uuid, p_codigo text, p_nombre text, p_activo boolean DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_empresa uuid;
  v_usuario uuid;
  v_nombre  text := btrim(p_nombre);
  v_codigo  text := NULLIF(btrim(p_codigo), '');
  v_id      uuid;
BEGIN
  IF p_sesion_id IS NULL OR p_secreto IS NULL OR p_secreto = '' THEN
    RAISE EXCEPTION 'sesión no válida' USING ERRCODE = '42501';
  END IF;
  -- Identidad autenticada: se deriva de la sesión verificada, nunca de parámetros de empresa/usuario.
  SELECT s.empresa_id, s.usuario_id INTO v_empresa, v_usuario
    FROM sesiones_usuario s
    JOIN usuarios u ON u.empresa_id = s.empresa_id AND u.id = s.usuario_id AND u.estado = 'ACTIVO'
                   AND (u.bloqueado_hasta IS NULL OR u.bloqueado_hasta <= now())
    JOIN empresas e ON e.id = s.empresa_id AND e.estado = 'ACTIVA'
   WHERE s.id = p_sesion_id AND s.revocada_at IS NULL AND s.expira_at > now()
     AND s.token_hash = crypt(p_secreto, s.token_hash);
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'sesión no válida' USING ERRCODE = '42501';
  END IF;
  IF p_catalogo IS NULL OR p_catalogo NOT IN ('CATEGORIA', 'MARCA') THEN
    RAISE EXCEPTION 'catálogo inválido (%)', p_catalogo USING ERRCODE = 'P0001';
  END IF;
  IF NOT usuario_tiene_permiso(v_empresa, v_usuario, 'PRODUCTOS', CASE WHEN p_id IS NULL THEN 'CREAR' ELSE 'EDITAR' END) THEN
    RAISE EXCEPTION 'el usuario no tiene permiso PRODUCTOS.% en esta empresa', CASE WHEN p_id IS NULL THEN 'CREAR' ELSE 'EDITAR' END USING ERRCODE = '42501';
  END IF;
  IF v_nombre IS NULL OR v_nombre = '' OR char_length(v_nombre) > 120 THEN
    RAISE EXCEPTION 'el nombre es obligatorio (máximo 120 caracteres)' USING ERRCODE = 'P0001';
  END IF;
  IF v_codigo IS NOT NULL AND char_length(v_codigo) > 40 THEN
    RAISE EXCEPTION 'el código admite máximo 40 caracteres' USING ERRCODE = 'P0001';
  END IF;

  IF p_catalogo = 'CATEGORIA' THEN
    IF p_id IS NULL THEN
      INSERT INTO categorias_producto (empresa_id, codigo, nombre, activo) VALUES (v_empresa, v_codigo, v_nombre, COALESCE(p_activo, true)) RETURNING id INTO v_id;
    ELSE
      UPDATE categorias_producto SET codigo = v_codigo, nombre = v_nombre, activo = COALESCE(p_activo, activo)
       WHERE id = p_id AND empresa_id = v_empresa RETURNING id INTO v_id;
    END IF;
  ELSE
    IF p_id IS NULL THEN
      INSERT INTO marcas_producto (empresa_id, codigo, nombre, activo) VALUES (v_empresa, v_codigo, v_nombre, COALESCE(p_activo, true)) RETURNING id INTO v_id;
    ELSE
      UPDATE marcas_producto SET codigo = v_codigo, nombre = v_nombre, activo = COALESCE(p_activo, activo)
       WHERE id = p_id AND empresa_id = v_empresa RETURNING id INTO v_id;
    END IF;
  END IF;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'registro no encontrado' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_id;
END $$;

-- 4) Permisos del rol de ejecución: solo EXECUTE en la función nueva (resto idéntico a NEX-017). Sin INSERT/UPDATE/DELETE directos en categorías/marcas.
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
                   'lista_precio_referencia','producto_fijar_precio_referencia',
                   'catalogo_producto_guardar')) LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO nexit_runtime', f);
  END LOOP;
END $$;

SELECT nex_aplicar_grants_runtime();
