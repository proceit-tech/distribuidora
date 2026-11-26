-- T13 — NEX-018: integridad de listas de precios (vigencias, rangos, escalones, reglas, moneda coherente, referencias de la misma empresa).
\i _helpers.sql
SELECT crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12)) AS h \gset
SELECT nex_inicializar_empresa('emp-t13a', 'Empresa A T13 SA (prueba)', '8013101', '1', 'admin.a', 'Ana', 'A', NULL, :'h') AS ea \gset
SELECT nex_inicializar_empresa('emp-t13b', 'Empresa B T13 SA (prueba)', '8013102', '2', 'admin.b', 'Beto', 'B', NULL, :'h') AS eb \gset
SELECT id AS un FROM unidades_medida WHERE activo ORDER BY codigo LIMIT 1 \gset
INSERT INTO productos (empresa_id, codigo, descripcion, descripcion_factura, unidad_medida_id) VALUES (:'ea','P1','Vaso','Vaso',:'un'), (:'eb','P1','Vaso','Vaso',:'un');
SELECT id AS pa FROM productos WHERE empresa_id = :'ea' \gset
INSERT INTO grupos_cliente (empresa_id, codigo, nombre) VALUES (:'ea','G1','Mayoristas'), (:'eb','G1','Mayoristas');
SELECT id AS ga FROM grupos_cliente WHERE empresa_id = :'ea' \gset
SELECT id AS gb FROM grupos_cliente WHERE empresa_id = :'eb' \gset

-- ===== Cabecera =====
INSERT INTO listas_precio (empresa_id, codigo, nombre) VALUES (:'ea', 'LP-001', 'Mayorista'), (:'eb', 'LP-001', 'Mayorista');
SELECT id AS la FROM listas_precio WHERE empresa_id = :'ea' \gset
SELECT pg_temp.ok((SELECT count(*) = 2 FROM listas_precio WHERE codigo = 'LP-001'), 'mismo código de lista en empresas distintas');
SELECT pg_temp.falla(format($f$INSERT INTO listas_precio (empresa_id, codigo, nombre) VALUES (%L,'LP-001','Dup')$f$, :'ea'), '23505', 'código de lista único por empresa');
SELECT pg_temp.falla(format($f$INSERT INTO listas_precio (empresa_id, codigo, nombre, vigente_desde, vigente_hasta) VALUES (%L,'LP-X','x','2026-02-01','2026-01-01')$f$, :'ea'), '23514', 'vigencia final anterior a la inicial rechazada');
SELECT pg_temp.falla(format($f$INSERT INTO listas_precio (empresa_id, codigo, nombre, descuento_maximo_pct) VALUES (%L,'LP-X','x',101)$f$, :'ea'), '23514', 'descuento máximo > 100 rechazado');
SELECT pg_temp.falla(format($f$INSERT INTO listas_precio (empresa_id, codigo, nombre, ajuste_general_pct) VALUES (%L,'LP-X','x',-101)$f$, :'ea'), '23514', 'ajuste general < -100 rechazado');
SELECT pg_temp.falla(format($f$INSERT INTO listas_precio (empresa_id, codigo, nombre, prioridad) VALUES (%L,'LP-X','x',-1)$f$, :'ea'), '23514', 'prioridad negativa rechazada');
SELECT pg_temp.falla(format($f$INSERT INTO listas_precio (empresa_id, codigo, nombre, grupo_cliente_id) VALUES (%L,'LP-X','x',%L)$f$, :'ea', :'gb'), '23503', 'grupo de cliente de OTRA empresa rechazado');
SELECT pg_temp.falla(format($f$INSERT INTO listas_precio (empresa_id, codigo, nombre, lista_precio_base_id) VALUES (%L,'LP-X','x',%L)$f$, :'ea', (SELECT id FROM listas_precio WHERE empresa_id = :'eb')), '23503', 'lista base de OTRA empresa rechazada');

-- ===== Ítems =====
INSERT INTO lista_precio_items (empresa_id, lista_precio_id, producto_id, unidad_medida_id, moneda_codigo, precio_base, precio_lista, vigente_desde)
  VALUES (:'ea', :'la', :'pa', :'un', 'PYG', 100, 100, '2026-01-01');
SELECT id AS ia FROM lista_precio_items WHERE empresa_id = :'ea' \gset
SELECT pg_temp.falla(format($f$INSERT INTO lista_precio_items (empresa_id, lista_precio_id, producto_id, unidad_medida_id, moneda_codigo, vigente_desde) VALUES (%L,%L,%L,%L,'PYG','2026-01-01')$f$, :'ea', :'la', :'pa', :'un'), '23505', 'un producto no se repite en la misma lista');
SELECT pg_temp.falla(format($f$UPDATE lista_precio_items SET precio_lista = -1 WHERE id = %L$f$, :'ia'), '23514', 'precio negativo rechazado');
SELECT pg_temp.falla(format($f$UPDATE lista_precio_items SET descuento_pct = 120 WHERE id = %L$f$, :'ia'), '23514', 'descuento de ítem > 100 rechazado');
SELECT pg_temp.falla(format($f$UPDATE lista_precio_items SET cantidad_minima = 0 WHERE id = %L$f$, :'ia'), '23514', 'cantidad mínima 0 rechazada');
SELECT pg_temp.falla(format($f$UPDATE lista_precio_items SET vigente_hasta = '2025-12-31' WHERE id = %L$f$, :'ia'), '23514', 'vigencia de ítem invertida rechazada');
SELECT pg_temp.falla(format($f$UPDATE lista_precio_items SET moneda_codigo = 'USD' WHERE id = %L$f$, :'ia'), 'P0001', 'moneda del ítem distinta de la lista rechazada');
SELECT pg_temp.falla(format($f$UPDATE listas_precio SET moneda_codigo = 'USD' WHERE id = %L$f$, :'la'), 'P0001', 'no se cambia la moneda de una lista con precios en otra moneda');
SELECT pg_temp.falla(format($f$INSERT INTO lista_precio_items (empresa_id, lista_precio_id, producto_id, unidad_medida_id, moneda_codigo, vigente_desde) VALUES (%L,%L,%L,%L,'PYG','2026-01-01')$f$, :'eb', (SELECT id FROM listas_precio WHERE empresa_id = :'eb'), :'pa', :'un'), '23503', 'ítem con producto de OTRA empresa rechazado');

-- ===== Escalones =====
INSERT INTO lista_precio_escalones (empresa_id, lista_precio_item_id, cantidad_minima, cantidad_maxima, precio) VALUES (:'ea', :'ia', 10, 49, 90), (:'ea', :'ia', 50, NULL, 80);
SELECT pg_temp.ok((SELECT count(*) = 2 FROM lista_precio_escalones WHERE lista_precio_item_id = :'ia'), 'escalones con y sin tope superior');
SELECT pg_temp.falla(format($f$INSERT INTO lista_precio_escalones (empresa_id, lista_precio_item_id, cantidad_minima, cantidad_maxima, precio) VALUES (%L,%L,10,5,1)$f$, :'ea', :'ia'), '23514', 'escalón con máximo menor que el mínimo rechazado');
SELECT pg_temp.falla(format($f$INSERT INTO lista_precio_escalones (empresa_id, lista_precio_item_id, cantidad_minima, precio) VALUES (%L,%L,0,1)$f$, :'ea', :'ia'), '23514', 'escalón con cantidad mínima 0 rechazado');
SELECT pg_temp.falla(format($f$INSERT INTO lista_precio_escalones (empresa_id, lista_precio_item_id, cantidad_minima, precio) VALUES (%L,%L,5,-1)$f$, :'ea', :'ia'), '23514', 'escalón con precio negativo rechazado');
SELECT pg_temp.falla(format($f$INSERT INTO lista_precio_escalones (empresa_id, lista_precio_item_id, cantidad_minima, precio) VALUES (%L,%L,5,1)$f$, :'eb', :'ia'), '23503', 'escalón de OTRA empresa sobre un ítem ajeno rechazado');

-- ===== Reglas =====
INSERT INTO lista_precio_reglas (empresa_id, lista_precio_id, tipo_aplicacion, referencia_id, prioridad, permite_descuento_adicional, descuento_maximo_pct, vigente_desde)
  VALUES (:'ea', :'la', 'GRUPO_CLIENTE', :'ga', 5, true, 3, '2026-01-01'), (:'ea', :'la', 'GENERAL', NULL, 10, true, 0, '2026-01-01');
SELECT pg_temp.ok((SELECT count(*) = 2 FROM lista_precio_reglas WHERE lista_precio_id = :'la'), 'regla general y regla por grupo');
SELECT pg_temp.falla(format($f$INSERT INTO lista_precio_reglas (empresa_id, lista_precio_id, tipo_aplicacion, referencia_id, prioridad, permite_descuento_adicional, descuento_maximo_pct, vigente_desde) VALUES (%L,%L,'GRUPO_CLIENTE',%L,5,true,3,'2026-01-01')$f$, :'ea', :'la', :'gb'), '23503', 'regla con grupo de OTRA empresa rechazada');
SELECT pg_temp.falla(format($f$INSERT INTO lista_precio_reglas (empresa_id, lista_precio_id, tipo_aplicacion, referencia_id, prioridad, permite_descuento_adicional, descuento_maximo_pct, vigente_desde) VALUES (%L,%L,'ZONA',%L,5,true,3,'2026-01-01')$f$, :'ea', :'la', :'ga'), '23503', 'regla de ZONA con el id de un grupo rechazada (la referencia debe ser del tipo indicado)');
SELECT pg_temp.falla(format($f$INSERT INTO lista_precio_reglas (empresa_id, lista_precio_id, tipo_aplicacion, prioridad, permite_descuento_adicional, descuento_maximo_pct, vigente_desde) VALUES (%L,%L,'CLIENTE',5,true,3,'2026-01-01')$f$, :'ea', :'la'), '23514', 'regla no general sin referencia rechazada');
SELECT pg_temp.falla(format($f$INSERT INTO lista_precio_reglas (empresa_id, lista_precio_id, tipo_aplicacion, referencia_id, prioridad, permite_descuento_adicional, descuento_maximo_pct, vigente_desde) VALUES (%L,%L,'GENERAL',%L,5,true,3,'2026-01-01')$f$, :'ea', :'la', :'ga'), '23503', 'regla general con referencia rechazada (la referencia no existe para el tipo GENERAL)');
SELECT pg_temp.falla(format($f$INSERT INTO lista_precio_reglas (empresa_id, lista_precio_id, tipo_aplicacion, prioridad, permite_descuento_adicional, descuento_maximo_pct, vigente_desde, vigente_hasta) VALUES (%L,%L,'GENERAL',5,true,3,'2026-02-01','2026-01-01')$f$, :'ea', :'la'), '23514', 'vigencia de regla invertida rechazada');
SELECT pg_temp.falla(format($f$INSERT INTO lista_precio_reglas (empresa_id, lista_precio_id, tipo_aplicacion, prioridad, permite_descuento_adicional, descuento_maximo_pct, vigente_desde) VALUES (%L,%L,'GENERAL',5,true,150,'2026-01-01')$f$, :'ea', :'la'), '23514', 'descuento máximo de regla > 100 rechazado');

-- ===== Aislamiento =====
SELECT pg_temp.ok((SELECT count(*) = 0 FROM lista_precio_items WHERE empresa_id = :'eb') AND (SELECT count(*) = 0 FROM lista_precio_reglas WHERE empresa_id = :'eb'), 'la empresa B no tiene precios ni reglas de A');
SELECT pg_temp.ok((SELECT count(*) = 1 FROM listas_precio WHERE empresa_id = :'eb'), 'cada empresa conserva su propia lista');
