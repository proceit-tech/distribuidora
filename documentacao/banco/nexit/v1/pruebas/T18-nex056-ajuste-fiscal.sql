-- T18 — NEX-056 (PRO-93 Fase A): permiso FACTURACION_ELECTRONICA.AJUSTE_FISCAL y bitácora producto_clasificacion_fiscal_log, ejecutadas en PostgreSQL real descartable.
-- La sentencia de guardado es EXACTAMENTE la que ejecuta la aplicación (lib/facturacion/ajuste-fiscal.ts); una regresión en TypeScript comprueba que ambos textos coinciden.
\i _helpers.sql

DO $t$
DECLARE
  v_h text := crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12));
  v_a uuid; v_b uuid; v_ua uuid; v_ub uuid; v_s uuid; v_doc uuid; v_doc_b uuid; v_prod uuid; v_prod_b uuid; v_iva10 uuid; v_iva5 uuid; v_exe uuid;
  r record;
  v_sql text := $q$
    WITH ant AS (
      SELECT p.id, p.afectacion_iva, p.proporcion_gravada_iva::text AS prop, i.porcentaje::text AS tasa
        FROM productos p LEFT JOIN impuestos i ON i.id = p.impuesto_id
       WHERE p.empresa_id = $1 AND p.id = $2 FOR UPDATE OF p),
    upd AS (
      UPDATE productos p SET impuesto_id = $3::uuid, afectacion_iva = $4::smallint, proporcion_gravada_iva = $5::numeric, actualizado_at = now()
        FROM ant WHERE p.empresa_id = $1 AND p.id = ant.id
         AND (p.impuesto_id IS DISTINCT FROM $3::uuid OR p.afectacion_iva IS DISTINCT FROM $4::smallint OR p.proporcion_gravada_iva IS DISTINCT FROM $5::numeric)
      RETURNING p.id),
    ins AS (
      INSERT INTO producto_clasificacion_fiscal_log (empresa_id, producto_id, documento_id, usuario_id, anterior, nuevo)
      SELECT $1, upd.id, $6::uuid, $7::uuid,
             jsonb_build_object('afectacion', ant.afectacion_iva, 'tasa', ant.tasa, 'proporcion', ant.prop),
             jsonb_build_object('afectacion', $4::smallint, 'tasa', $8::numeric, 'proporcion', $5::numeric)
        FROM upd JOIN ant ON ant.id = upd.id
      RETURNING 1)
    SELECT (SELECT count(*) FROM ant)::int AS existe, (SELECT count(*) FROM upd)::int AS cambio, (SELECT count(*) FROM ins)::int AS anotado$q$;
BEGIN
  v_a := nex_inicializar_empresa('emp-t18a', 'Empresa T18 A SA (prueba)', '8018101', '1', 'admin.t18a', 'Ana', 'A', NULL, v_h);
  v_b := nex_inicializar_empresa('emp-t18b', 'Empresa T18 B SA (prueba)', '8018102', '1', 'admin.t18b', 'Beto', 'B', NULL, v_h);
  SELECT id INTO v_ua FROM usuarios WHERE empresa_id = v_a;
  SELECT id INTO v_ub FROM usuarios WHERE empresa_id = v_b;
  SELECT id INTO v_s FROM sucursales WHERE empresa_id = v_a ORDER BY creado_at, id LIMIT 1;
  SELECT id INTO v_iva10 FROM impuestos WHERE porcentaje = 10 AND activo;
  SELECT id INTO v_iva5 FROM impuestos WHERE porcentaje = 5 AND activo;
  SELECT id INTO v_exe FROM impuestos WHERE porcentaje = 0 AND activo;

  -- Permiso: existe, no está asignado a ningún perfil y el administrador de la empresa lo tiene por definición
  PERFORM pg_temp.ok((SELECT count(*) = 1 FROM permisos WHERE codigo = 'FACTURACION_ELECTRONICA.AJUSTE_FISCAL' AND recurso = 'FACTURACION_ELECTRONICA' AND accion = 'AJUSTE_FISCAL'), 'NEX-056: el permiso AJUSTE_FISCAL existe');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM perfil_permiso pp JOIN permisos pe ON pe.id = pp.permiso_id WHERE pe.codigo = 'FACTURACION_ELECTRONICA.AJUSTE_FISCAL'), 'NEX-056: el permiso no se asignó a ningún perfil');
  PERFORM pg_temp.ok(usuario_tiene_permiso(v_a, v_ua, 'FACTURACION_ELECTRONICA', 'AJUSTE_FISCAL') AND NOT usuario_tiene_permiso(v_a, v_ub, 'FACTURACION_ELECTRONICA', 'AJUSTE_FISCAL'), 'NEX-056: el administrador de la empresa lo tiene; el de otra empresa no');

  -- Fixtures sintéticas: dos productos (uno por empresa) y un documento por empresa
  INSERT INTO productos (empresa_id, codigo, descripcion, descripcion_factura, unidad_medida_id) VALUES (v_a, 'T18A', 'Producto T18 A', 'Producto T18 A', (SELECT id FROM unidades_medida WHERE codigo = 'UN')) RETURNING id INTO v_prod;
  INSERT INTO productos (empresa_id, codigo, descripcion, descripcion_factura, unidad_medida_id) VALUES (v_b, 'T18B', 'Producto T18 B', 'Producto T18 B', (SELECT id FROM unidades_medida WHERE codigo = 'UN')) RETURNING id INTO v_prod_b;
  INSERT INTO documentos_electronicos (empresa_id, sucursal_id, tipo, establecimiento, punto_expedicion, numero, fecha_emision, receptor_nombre, moneda, total, estado_local, estado_sifen, creado_por)
    VALUES (v_a, v_s, 'FE', '001', '002', '0180001', now(), 'Receptor T18', 'PYG', 1000, 'PENDIENTE_ENVIO', 'SIN_CONSULTA', v_ua) RETURNING id INTO v_doc;
  INSERT INTO documentos_electronicos (empresa_id, sucursal_id, tipo, establecimiento, punto_expedicion, numero, fecha_emision, receptor_nombre, moneda, total, estado_local, estado_sifen, creado_por)
    VALUES (v_b, (SELECT id FROM sucursales WHERE empresa_id = v_b LIMIT 1), 'FE', '001', '002', '0180002', now(), 'Receptor T18 B', 'PYG', 1000, 'PENDIENTE_ENVIO', 'SIN_CONSULTA', v_ub) RETURNING id INTO v_doc_b;
  PERFORM pg_temp.ok((SELECT afectacion_iva IS NULL FROM productos WHERE id = v_prod), 'NEX-056: el producto de prueba nace sin clasificar');

  -- La sentencia de la aplicación: guarda, anota y es idempotente
  EXECUTE v_sql INTO r USING v_a, v_prod, v_iva10, 1, NULL::numeric, v_doc, v_ua, 10;
  PERFORM pg_temp.ok(r.existe = 1 AND r.cambio = 1 AND r.anotado = 1, 'guardar: primera vez cambia el producto y anota la bitácora (una sola sentencia)');
  PERFORM pg_temp.ok((SELECT afectacion_iva = 1 AND impuesto_id = v_iva10 AND proporcion_gravada_iva IS NULL FROM productos WHERE id = v_prod), 'guardar: el producto quedó Gravado 10 %');
  PERFORM pg_temp.ok((SELECT count(*) = 1 AND bool_and(anterior->>'afectacion' IS NULL) AND bool_and((nuevo->>'afectacion')::int = 1 AND (nuevo->>'tasa')::numeric = 10 AND documento_id = v_doc AND usuario_id = v_ua)
                        FROM producto_clasificacion_fiscal_log WHERE producto_id = v_prod), 'guardar: la bitácora conserva valor anterior, nuevo, documento y usuario');
  EXECUTE v_sql INTO r USING v_a, v_prod, v_iva10, 1, NULL::numeric, v_doc, v_ua, 10;
  PERFORM pg_temp.ok(r.existe = 1 AND r.cambio = 0 AND r.anotado = 0 AND (SELECT count(*) = 1 FROM producto_clasificacion_fiscal_log WHERE producto_id = v_prod), 'guardar: repetir la misma clasificación no cambia nada ni duplica la bitácora (idempotente)');
  EXECUTE v_sql INTO r USING v_a, v_prod, v_iva5, 4, 50::numeric, v_doc, v_ua, 5;
  PERFORM pg_temp.ok(r.cambio = 1 AND (SELECT count(*) = 2 FROM producto_clasificacion_fiscal_log WHERE producto_id = v_prod), 'guardar: un cambio posterior se anota como una segunda fila');

  -- Aislamiento por empresa: la sentencia con empresa A no ve ni toca el producto de la empresa B
  EXECUTE v_sql INTO r USING v_a, v_prod_b, v_iva5, 1, NULL::numeric, v_doc, v_ua, 5;
  PERFORM pg_temp.ok(r.existe = 0 AND r.cambio = 0 AND r.anotado = 0 AND (SELECT afectacion_iva IS NULL FROM productos WHERE id = v_prod_b), 'aislamiento: el producto de otra empresa no existe para la sentencia y no se modifica');
  PERFORM pg_temp.falla(format($f$INSERT INTO producto_clasificacion_fiscal_log (empresa_id, producto_id, documento_id, usuario_id, anterior, nuevo) VALUES (%L, %L, %L, %L, '{}', '{}')$f$, v_a, v_prod_b, v_doc, v_ua), '23503', 'aislamiento: la bitácora no admite mezclar un producto de otra empresa (FK compuesta)');
  PERFORM pg_temp.falla(format($f$INSERT INTO producto_clasificacion_fiscal_log (empresa_id, producto_id, documento_id, usuario_id, anterior, nuevo) VALUES (%L, %L, %L, %L, '{}', '{}')$f$, v_a, v_prod, v_doc_b, v_ua), '23503', 'aislamiento: ni un documento de otra empresa');

  -- Inmutabilidad de la bitácora
  PERFORM pg_temp.falla(format('UPDATE producto_clasificacion_fiscal_log SET nuevo = %L WHERE producto_id = %L', '{}', v_prod), 'P0001', 'bitácora: no se modifica');
  PERFORM pg_temp.falla(format('DELETE FROM producto_clasificacion_fiscal_log WHERE producto_id = %L', v_prod), 'P0001', 'bitácora: no se borra');
  PERFORM pg_temp.falla('TRUNCATE producto_clasificacion_fiscal_log', 'P0001', 'bitácora: no se vacía');

  -- Privilegios del runtime: solo lectura e inserción
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') OR (has_table_privilege('nexit_runtime', 'public.producto_clasificacion_fiscal_log', 'SELECT') AND has_table_privilege('nexit_runtime', 'public.producto_clasificacion_fiscal_log', 'INSERT')
                       AND NOT has_table_privilege('nexit_runtime', 'public.producto_clasificacion_fiscal_log', 'UPDATE') AND NOT has_table_privilege('nexit_runtime', 'public.producto_clasificacion_fiscal_log', 'DELETE') AND NOT has_table_privilege('nexit_runtime', 'public.producto_clasificacion_fiscal_log', 'TRUNCATE')),
                     'privilegios: nexit_runtime solo SELECT e INSERT en la bitácora');
  PERFORM pg_temp.ok(to_regprocedure('public.nex_aplicar_grants_facturacion_ajuste()') IS NOT NULL, 'el ayudante de grants existe y el envoltorio de NEX-052 lo reaplica');
  RAISE NOTICE 'PASS: T18 completa';
END $t$;
