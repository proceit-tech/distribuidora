-- T15 — NEX-021: ubicación geográfica opcional y jerárquica (Departamento → Distrito → Ciudad) en direcciones de Clientes y Proveedores.
-- Requiere la carga geográfica oficial (CARGA-GEOGRAFICA-SIFEN-2025.sql) ya aplicada en la base de prueba.
\i _helpers.sql
DO $t$
DECLARE
  v_h text := crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12));
  v_emp uuid; v_cli uuid; v_pro uuid;
  g record; o record; r record;
  v_antes text; v_despues text;
  v_tab text; v_dir text;
BEGIN
  -- Geografía real: una ciudad válida y un distrito de OTRO departamento
  SELECT departamento_codigo AS d, distrito_codigo AS di, codigo AS ci INTO g
    FROM referencia_geografica_ciudades ORDER BY 1, 2, 3 LIMIT 1;
  SELECT codigo AS di INTO o FROM referencia_geografica_distritos WHERE departamento_codigo <> g.d LIMIT 1;
  PERFORM pg_temp.ok(g.d IS NOT NULL AND o.di IS NOT NULL, 'catálogo geográfico oficial cargado');

  v_emp := nex_inicializar_empresa('emp-t15', 'Empresa T15 SA (prueba)', '8015101', '1', 'admin.t15', 'Ana', 'T', NULL, v_h);
  INSERT INTO clientes (empresa_id, codigo, naturaleza_receptor, tipo_operacion, tipo_persona, tipo_contribuyente_sifen, pais_codigo,
                        tipo_documento, numero_documento, dv, razon_social)
    VALUES (v_emp, 'C15', 1, 1, 'JURIDICA', 2, 'PRY', 'RUC', '8015102', '1', 'Cliente T15') RETURNING id INTO v_cli;
  INSERT INTO proveedores (empresa_id, codigo, numero_documento, dv, razon_social)
    VALUES (v_emp, 'P15', '8015103', '1', 'Proveedor T15') RETURNING id INTO v_pro;

  -- Estado "previo": direcciones completas (como las que ya existen) y una extranjera sin geografía
  INSERT INTO direcciones_cliente (empresa_id, cliente_id, direccion, pais_codigo, departamento_codigo, distrito_codigo, ciudad_codigo)
    VALUES (v_emp, v_cli, 'legado-c', 'PRY', g.d, g.di, g.ci), (v_emp, v_cli, 'legado-c-ext', 'BRA', NULL, NULL, NULL);
  INSERT INTO proveedor_direcciones (empresa_id, proveedor_id, tipo, descripcion, direccion, pais_codigo, departamento_codigo, distrito_codigo, ciudad_codigo)
    VALUES (v_emp, v_pro, 'COMERCIAL', 'd', 'legado-p', 'PRY', g.d, g.di, g.ci), (v_emp, v_pro, 'OTRA', 'd', 'legado-p-ext', 'BRA', NULL, NULL, NULL);

  -- Con NEX-021 aplicada: PRY vacío / parcial / completo son válidos en ambas tablas
  FOREACH v_tab IN ARRAY ARRAY['direcciones_cliente', 'proveedor_direcciones'] LOOP
    v_dir := CASE v_tab WHEN 'direcciones_cliente'
      THEN format($f$INSERT INTO direcciones_cliente (empresa_id, cliente_id, direccion, pais_codigo, departamento_codigo, distrito_codigo, ciudad_codigo)
                     VALUES (%L, %L, 'x', %%L, %%s, %%s, %%s)$f$, v_emp, v_cli)
      ELSE format($f$INSERT INTO proveedor_direcciones (empresa_id, proveedor_id, tipo, descripcion, direccion, pais_codigo, departamento_codigo, distrito_codigo, ciudad_codigo)
                     VALUES (%L, %L, 'OTRA', 'd', 'x', %%L, %%s, %%s, %%s)$f$, v_emp, v_pro) END;
    EXECUTE format(v_dir, 'PRY', 'NULL', 'NULL', 'NULL');
    PERFORM pg_temp.ok(true, v_tab || ': PRY vacío aceptado');
    EXECUTE format(v_dir, 'PRY', g.d, 'NULL', 'NULL');
    PERFORM pg_temp.ok(true, v_tab || ': PRY solo departamento aceptado');
    EXECUTE format(v_dir, 'PRY', g.d, g.di, 'NULL');
    PERFORM pg_temp.ok(true, v_tab || ': PRY departamento+distrito aceptado');
    EXECUTE format(v_dir, 'PRY', g.d, g.di, g.ci);
    PERFORM pg_temp.ok(true, v_tab || ': PRY completo aceptado');
    EXECUTE format(v_dir, 'ARG', 'NULL', 'NULL', 'NULL');
    PERFORM pg_temp.ok(true, v_tab || ': país extranjero sin geografía paraguaya aceptado');
    PERFORM pg_temp.falla(format(v_dir, 'PRY', 'NULL', g.di, 'NULL'), '23514', v_tab || ': distrito sin departamento rechazado');
    PERFORM pg_temp.falla(format(v_dir, 'PRY', g.d, 'NULL', g.ci), '23514', v_tab || ': ciudad sin distrito rechazada');
    PERFORM pg_temp.falla(format(v_dir, 'PRY', g.d, o.di, 'NULL'), '23503', v_tab || ': distrito de otro departamento rechazado');
    PERFORM pg_temp.falla(format(v_dir, 'PRY', g.d, g.di, 999999), '23503', v_tab || ': ciudad inexistente en el distrito rechazada');
    PERFORM pg_temp.falla(format(v_dir, 'PRY', 9999, 'NULL', 'NULL'), '23503', v_tab || ': departamento inexistente rechazado');
    PERFORM pg_temp.falla(format(v_dir, 'ARG', g.d, 'NULL', 'NULL'), '23514', v_tab || ': extranjero con geografía paraguaya rechazado');
  END LOOP;

  -- Edición: completo → parcial → vacío → completo persiste en ambas tablas
  FOREACH v_tab IN ARRAY ARRAY['direcciones_cliente', 'proveedor_direcciones'] LOOP
    v_dir := CASE v_tab WHEN 'direcciones_cliente' THEN 'legado-c' ELSE 'legado-p' END;
    EXECUTE format('UPDATE %I SET distrito_codigo = NULL, ciudad_codigo = NULL WHERE direccion = %L', v_tab, v_dir);
    EXECUTE format('SELECT departamento_codigo d, distrito_codigo di, ciudad_codigo ci FROM %I WHERE direccion = %L', v_tab, v_dir) INTO r;
    PERFORM pg_temp.ok(r.d = g.d AND r.di IS NULL AND r.ci IS NULL, v_tab || ': completo→parcial persiste');
    EXECUTE format('UPDATE %I SET departamento_codigo = NULL WHERE direccion = %L', v_tab, v_dir);
    EXECUTE format('SELECT departamento_codigo d, distrito_codigo di, ciudad_codigo ci FROM %I WHERE direccion = %L', v_tab, v_dir) INTO r;
    PERFORM pg_temp.ok(r.d IS NULL AND r.di IS NULL AND r.ci IS NULL, v_tab || ': parcial→vacío persiste');
    EXECUTE format('UPDATE %I SET departamento_codigo = %s, distrito_codigo = %s, ciudad_codigo = %s WHERE direccion = %L', v_tab, g.d, g.di, g.ci, v_dir);
    EXECUTE format('SELECT departamento_codigo d, distrito_codigo di, ciudad_codigo ci FROM %I WHERE direccion = %L', v_tab, v_dir) INTO r;
    PERFORM pg_temp.ok(r.d = g.d AND r.di = g.di AND r.ci = g.ci, v_tab || ': vacío→completo persiste');
  END LOOP;

  -- Catálogo protegido y sin barrios
  PERFORM pg_temp.falla(format('DELETE FROM referencia_geografica_departamentos WHERE codigo = %s', g.d), '23503', 'departamento referenciado no se puede borrar');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name LIKE '%barrio%')
                 AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE column_name LIKE '%barrio%'), 'sin tabla ni columnas de barrio (fuera del alcance V1)');
END $t$;

-- El rol de ejecución conserva su acceso (la migración no cambia grants)
DO $t$
DECLARE v_emp uuid; v_cli uuid; g record;
BEGIN
  SELECT id INTO v_emp FROM empresas WHERE codigo = 'emp-t15';
  SELECT id INTO v_cli FROM clientes WHERE empresa_id = v_emp AND codigo = 'C15';
  SELECT departamento_codigo AS d INTO g FROM referencia_geografica_ciudades ORDER BY 1 LIMIT 1;
  SET LOCAL ROLE nexit_runtime;
  INSERT INTO direcciones_cliente (empresa_id, cliente_id, direccion, pais_codigo, departamento_codigo)
    VALUES (v_emp, v_cli, 'runtime-parcial', 'PRY', g.d);
  RESET ROLE;
  PERFORM pg_temp.ok(true, 'nexit_runtime inserta dirección PRY parcial');
END $t$;
