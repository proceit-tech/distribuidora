-- T03 — Aislamiento entre empresas (A no ve B), FKs compuestas, herencia de empresa_id en filas hijas
-- (el código desplegado inserta hijos solo con el id del padre) y generación de códigos CLI-/PRV-.
\i _helpers.sql
SELECT crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12)) AS h \gset
SELECT demo_crear_empresa('demo-aa', 'Empresa A (prueba)', 'admin', :'h', 'prueba A') AS ea \gset
SELECT demo_crear_empresa('demo-bb', 'Empresa B (prueba)', 'admin', :'h', 'prueba B') AS eb \gset

SELECT pg_temp.ok((SELECT count(*) FROM clientes WHERE empresa_id = :'ea') = (SELECT count(*) FROM clientes WHERE empresa_id = :'eb'), 'A y B tienen el mismo conjunto ficticio (independiente)');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM clientes a JOIN clientes b ON a.id = b.id AND a.empresa_id <> b.empresa_id), 'ningún id compartido entre empresas');
SELECT pg_temp.ok((SELECT count(*) FROM clientes WHERE codigo = 'CLI-000001') >= 3, 'el mismo código CLI-000001 existe en cada empresa (unicidad por empresa)');

-- FK compuesta: no se puede colgar un hijo de B de un padre de A
SELECT id AS cli_a FROM clientes WHERE empresa_id = :'ea' ORDER BY codigo LIMIT 1 \gset
SELECT pg_temp.falla(format($f$INSERT INTO cliente_contactos (empresa_id, cliente_id, nombre) VALUES (%L, %L, 'x')$f$, :'eb', :'cli_a'), '23503', 'contacto de B no puede apuntar a un cliente de A (FK compuesta)');
SELECT id AS dep_b FROM depositos WHERE empresa_id = :'eb' ORDER BY codigo LIMIT 1 \gset
SELECT id AS prod_a FROM productos WHERE empresa_id = :'ea' ORDER BY codigo LIMIT 1 \gset
SELECT id AS usr_a FROM usuarios WHERE empresa_id = :'ea' LIMIT 1 \gset
SELECT pg_temp.falla(format($f$INSERT INTO movimientos_inventario (empresa_id, numero_movimiento, tipo_movimiento, tipo_origen, fecha_movimiento, hora_movimiento, deposito_destino_id, creado_por)
  VALUES (%L, 'MOV-900001', 'ENTRADA', 'MANUAL', CURRENT_DATE, now()::time, %L, %L)$f$, :'ea', :'dep_b', :'usr_a'), '23503', 'movimiento de A no puede usar un depósito de B');
SELECT pg_temp.falla(format($f$INSERT INTO lista_precio_items (empresa_id, lista_precio_id, producto_id, unidad_medida_id, moneda_codigo, vigente_desde)
  SELECT %L, l.id, %L, (SELECT id FROM unidades_medida LIMIT 1), 'PYG', CURRENT_DATE FROM listas_precio l WHERE l.empresa_id = %L LIMIT 1$f$, :'eb', :'prod_a', :'eb'), '23503', 'ítem de lista de B no puede usar un producto de A');

-- Herencia de empresa_id en hijos (inserciones SIN empresa_id, como hace el código desplegado)
INSERT INTO cliente_contactos (cliente_id, nombre) VALUES (:'cli_a', 'Contacto sin empresa_id');
INSERT INTO direcciones_cliente (cliente_id, direccion, pais_codigo, tipo, departamento_codigo, distrito_codigo, ciudad_codigo)
  VALUES (:'cli_a', 'Otra dirección', 'PRY', 'ENTREGA', 1, 1, 1);
SELECT pg_temp.ok((SELECT count(*) FROM cliente_contactos WHERE cliente_id = :'cli_a' AND empresa_id = :'ea' AND nombre = 'Contacto sin empresa_id') = 1, 'cliente_contactos hereda empresa_id del cliente');
SELECT pg_temp.ok((SELECT empresa_id FROM direcciones_cliente WHERE cliente_id = :'cli_a' AND direccion = 'Otra dirección') = :'ea', 'direcciones_cliente hereda empresa_id y completa pais_nombre: ' || (SELECT pais_nombre FROM direcciones_cliente WHERE cliente_id = :'cli_a' AND direccion = 'Otra dirección'));

SELECT id AS prv_a FROM proveedores WHERE empresa_id = :'ea' ORDER BY codigo LIMIT 1 \gset
INSERT INTO proveedor_contactos (proveedor_id, nombre) VALUES (:'prv_a', 'Contacto prov sin empresa');
SELECT pg_temp.ok((SELECT empresa_id FROM proveedor_contactos WHERE proveedor_id = :'prv_a' AND nombre = 'Contacto prov sin empresa') = :'ea', 'proveedor_contactos hereda empresa_id del proveedor');
INSERT INTO producto_codigos (producto_id, tipo, codigo) VALUES (:'prod_a', 'EAN', '7890000000017');
SELECT pg_temp.ok((SELECT empresa_id FROM producto_codigos WHERE producto_id = :'prod_a' AND codigo = '7890000000017') = :'ea', 'producto_codigos hereda empresa_id del producto');
INSERT INTO producto_proveedores (producto_id, proveedor_id) VALUES (:'prod_a', :'prv_a');
SELECT pg_temp.ok((SELECT empresa_id FROM producto_proveedores WHERE producto_id = :'prod_a' AND proveedor_id = :'prv_a') = :'ea', 'producto_proveedores hereda empresa_id');

-- Códigos asignados por la base
INSERT INTO clientes (empresa_id, naturaleza_receptor, tipo_operacion, pais_codigo, tipo_persona, tipo_contribuyente_sifen, tipo_documento, numero_documento, dv, razon_social)
  VALUES (:'ea', 1, 1, 'PRY', 'JURIDICA', 2, 'RUC', '9990900', '5', 'Cliente nuevo A');
SELECT pg_temp.ok((SELECT codigo FROM clientes WHERE empresa_id = :'ea' AND numero_documento = '9990900') = 'CLI-000011', 'clientes.codigo asignado por la base (CLI-000011 = siguiente de 10 ficticios)');
SELECT pg_temp.ok((SELECT pais_nombre FROM clientes WHERE empresa_id = :'ea' AND numero_documento = '9990900') = 'Paraguay', 'clientes.pais_nombre completado desde el catálogo');
INSERT INTO proveedores (empresa_id, tipo_documento, numero_documento, dv, razon_social) VALUES (:'ea', 'RUC', '9991900', '5', 'Proveedor nuevo A');
SELECT pg_temp.ok((SELECT codigo FROM proveedores WHERE empresa_id = :'ea' AND numero_documento = '9991900') = 'PRV-000006', 'proveedores.codigo asignado por la base (PRV-000006)');
SELECT pg_temp.ok((SELECT pais_nombre FROM proveedores WHERE empresa_id = :'ea' AND numero_documento = '9991900') = 'Paraguay', 'proveedores.pais_nombre completado');
-- documento duplicado dentro de la misma empresa se rechaza, en otra empresa se acepta
SELECT pg_temp.falla(format($f$INSERT INTO proveedores (empresa_id, tipo_documento, numero_documento, dv, razon_social) VALUES (%L, 'RUC', '9991900', '5', 'Duplicado')$f$, :'ea'), '23505', 'mismo RUC duplicado en la misma empresa rechazado');
INSERT INTO proveedores (empresa_id, tipo_documento, numero_documento, dv, razon_social) VALUES (:'eb', 'RUC', '9991900', '5', 'Mismo RUC en otra empresa');
SELECT pg_temp.ok(true, 'mismo RUC aceptado en otra empresa');

-- Kits: solo productos KIT con componentes; sin ciclos
SELECT id AS p2 FROM productos WHERE empresa_id = :'ea' ORDER BY codigo OFFSET 1 LIMIT 1 \gset
SELECT pg_temp.falla(format($f$INSERT INTO producto_componentes (producto_kit_id, producto_componente_id, cantidad) VALUES (%L, %L, 1)$f$, :'prod_a', :'p2'), 'P0001', 'solo un producto KIT puede tener componentes');
UPDATE productos SET tipo_producto = 'KIT' WHERE id IN (:'prod_a', :'p2');
INSERT INTO producto_componentes (producto_kit_id, producto_componente_id, cantidad) VALUES (:'prod_a', :'p2', 2);
SELECT pg_temp.falla(format($f$INSERT INTO producto_componentes (producto_kit_id, producto_componente_id, cantidad) VALUES (%L, %L, 1)$f$, :'p2', :'prod_a'), 'P0001', 'ciclo de componentes A->B->A rechazado');
SELECT pg_temp.falla(format($f$UPDATE productos SET tipo_producto = 'MERCADERIA' WHERE id = %L$f$, :'prod_a'), 'P0001', 'un KIT con componentes no puede dejar de ser KIT');

-- Perfiles: los permisos controlados no pueden asignarse a un perfil (ESC-13)
SELECT id AS pf FROM perfiles WHERE empresa_id = :'ea' AND codigo = 'CONSULTA' \gset
SELECT id AS pe_sens FROM permisos WHERE codigo = 'PRODUCTOS_COSTO.VER' \gset
SELECT pg_temp.falla(format($f$INSERT INTO perfil_permiso (empresa_id, perfil_id, permiso_id) VALUES (%L, %L, %L)$f$, :'ea', :'pf', :'pe_sens'), 'P0001', 'permiso DATO_SENSIBLE no se puede poner en un perfil (ESC-13)');
