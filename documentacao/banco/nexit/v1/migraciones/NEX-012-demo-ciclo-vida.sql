-- =====================================================================
-- NEX-012 — Empresas DEMO: creación, datos ficticios, reinicio seguro y eliminación
-- Modelo C aprobado (P5): una empresa-modelo + una empresa demo individual por prospecto, aisladas por empresa_id.
-- Datos 100 % ficticios (RUC/CI/nombres inventados, rango reservado 999xxxx). Sin datos reales.
-- Las funciones demo_* solo operan sobre empresas con es_demo = true y código 'demo-*'.
-- La contraseña NUNCA va en este archivo: demo_crear_empresa recibe el HASH bcrypt generado fuera del servidor
-- (ver scripts/generar-hash-clave.sh). Proyecto Nexit (NEXIT-2026-001). ESTADO: V1 candidata oficial — NO ejecutar en la VM sin autorización expresa del responsable.
-- =====================================================================

ALTER TABLE empresas
  ADD COLUMN es_demo         boolean     NOT NULL DEFAULT false,
  ADD COLUMN demo_prospecto  text,
  ADD COLUMN demo_creada_at  timestamptz,
  ADD COLUMN demo_vence_at   timestamptz,
  ADD CONSTRAINT empresas_demo_codigo_chk CHECK (NOT es_demo OR codigo LIKE 'demo-%'),
  ADD CONSTRAINT empresas_demo_datos_chk  CHECK (es_demo OR (demo_prospecto IS NULL AND demo_creada_at IS NULL AND demo_vence_at IS NULL));

-- ---------------------------------------------------------------------
-- Guards de inmutabilidad: solo se permite DELETE durante un reinicio/eliminación de empresa DEMO.
-- El reinicio fija la variable de sesión nex.reinicio_demo = <empresa_id> (solo vale dentro de la transacción).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nex_reinicio_demo_activo(p_empresa uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('nex.reinicio_demo', true), '') = p_empresa::text
     AND EXISTS (SELECT 1 FROM empresas WHERE id = p_empresa AND es_demo)
$$;

CREATE OR REPLACE FUNCTION movimientos_inventario_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF nex_reinicio_demo_activo(OLD.empresa_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'movimientos_inventario es inmutable: use el estado ANULADO en lugar de DELETE (movimiento %)', OLD.numero_movimiento
      USING ERRCODE = 'P0001';
  END IF;
  IF (to_jsonb(NEW) - 'estado' - 'actualizado_at') IS DISTINCT FROM (to_jsonb(OLD) - 'estado' - 'actualizado_at') THEN
    RAISE EXCEPTION 'movimientos_inventario es inmutable: solo el estado puede cambiar (movimiento %)', OLD.numero_movimiento
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado AND NOT (OLD.estado = 'REGISTRADO' AND NEW.estado = 'ANULADO') THEN
    RAISE EXCEPTION 'transición de estado inválida: % -> % (solo REGISTRADO -> ANULADO)', OLD.estado, NEW.estado
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION movimiento_lineas_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE s text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT estado INTO s FROM movimientos_inventario WHERE empresa_id = NEW.empresa_id AND id = NEW.movimiento_id;
    IF FOUND AND s <> 'REGISTRADO' THEN
      RAISE EXCEPTION 'no se puede agregar una línea a un movimiento en estado %', s USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' AND nex_reinicio_demo_activo(OLD.empresa_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'movimiento_lineas es inmutable (% prohibido)', TG_OP USING ERRCODE = 'P0001';
END $$;

-- ---------------------------------------------------------------------
-- Movimiento de demostración (cabecera + líneas vía inventario_registrar_linea).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION demo_nuevo_movimiento(
  p_empresa uuid, p_tipo text, p_origen text, p_fecha date, p_dep_origen uuid, p_dep_destino uuid,
  p_cliente uuid, p_motivo text, p_usuario uuid) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  INSERT INTO movimientos_inventario (empresa_id, numero_movimiento, tipo_movimiento, tipo_origen, fecha_movimiento, hora_movimiento,
                                      deposito_origen_id, deposito_destino_id, cliente_id, motivo, creado_por)
  VALUES (p_empresa, nex_siguiente_numero_movimiento(p_empresa), p_tipo, p_origen, p_fecha, time '10:00',
          p_dep_origen, p_dep_destino, p_cliente, p_motivo, p_usuario)
  RETURNING id INTO v;
  RETURN v;
END $$;

-- ---------------------------------------------------------------------
-- Datos ficticios de la demostración. Determinista (sin random): mismo resultado en cada reinicio.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION demo_poblar(p_empresa uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_usuario uuid; v_dep1 uuid; v_dep2 uuid;
  v_iva10 uuid; v_iva5 uuid; v_exe uuid;
  v_lmay uuid; v_lmin uuid;
  g_may uuid; g_min uuid; g_sup uuid;
  mv uuid; r record; k int;
  v_precio numeric; v_lista uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM empresas WHERE id = p_empresa AND es_demo) THEN
    RAISE EXCEPTION 'demo_poblar solo opera sobre empresas DEMO' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM clientes WHERE empresa_id = p_empresa) OR EXISTS (SELECT 1 FROM productos WHERE empresa_id = p_empresa) THEN
    RAISE EXCEPTION 'la empresa ya tiene datos: use demo_reiniciar' USING ERRCODE = 'P0001';
  END IF;
  SELECT id INTO v_usuario FROM usuarios WHERE empresa_id = p_empresa ORDER BY creado_at LIMIT 1;
  SELECT id INTO v_dep1 FROM depositos WHERE empresa_id = p_empresa AND codigo = 'DEP-CENTRAL';
  SELECT id INTO v_dep2 FROM depositos WHERE empresa_id = p_empresa AND codigo = 'DEP-SALON';
  SELECT id INTO v_iva10 FROM impuestos WHERE codigo = 'IVA10';
  SELECT id INTO v_iva5  FROM impuestos WHERE codigo = 'IVA5';
  SELECT id INTO v_exe   FROM impuestos WHERE codigo = 'EXE';
  IF v_usuario IS NULL OR v_dep1 IS NULL OR v_dep2 IS NULL OR v_iva10 IS NULL THEN
    RAISE EXCEPTION 'faltan usuario, depósitos o catálogos globales (ejecute S-001 y demo_crear_empresa)' USING ERRCODE = 'P0001';
  END IF;

  -- Catálogos por empresa
  INSERT INTO grupos_cliente (empresa_id, codigo, nombre) VALUES
    (p_empresa, 'MAY', 'Mayoristas'), (p_empresa, 'MIN', 'Minoristas'), (p_empresa, 'SUP', 'Supermercados');
  SELECT id INTO g_may FROM grupos_cliente WHERE empresa_id = p_empresa AND codigo = 'MAY';
  SELECT id INTO g_min FROM grupos_cliente WHERE empresa_id = p_empresa AND codigo = 'MIN';
  SELECT id INTO g_sup FROM grupos_cliente WHERE empresa_id = p_empresa AND codigo = 'SUP';
  INSERT INTO vendedores (empresa_id, codigo, nombre) VALUES (p_empresa, 'V01', 'Vendedor Demo 1'), (p_empresa, 'V02', 'Vendedor Demo 2');
  INSERT INTO grupos_proveedor (empresa_id, codigo, nombre) VALUES (p_empresa, 'NAC', 'Proveedores nacionales'), (p_empresa, 'IMP', 'Importadores');
  INSERT INTO categorias_producto (empresa_id, codigo, nombre) VALUES
    (p_empresa, 'BEB', 'Bebidas'), (p_empresa, 'ALI', 'Alimentos'), (p_empresa, 'LIM', 'Limpieza'), (p_empresa, 'HIG', 'Higiene personal');
  INSERT INTO marcas_producto (empresa_id, codigo, nombre) VALUES
    (p_empresa, 'AUR', 'Aurora (ficticia)'), (p_empresa, 'GUA', 'Guaraní Demo (ficticia)'), (p_empresa, 'NAN', 'Ñandú Demo (ficticia)');

  -- Clientes (ficticios)
  INSERT INTO clientes (empresa_id, naturaleza_receptor, tipo_operacion, pais_codigo, tipo_persona, tipo_contribuyente_sifen,
                        tipo_documento, numero_documento, dv, razon_social, nombre_fantasia, email, telefono, grupo_cliente_id)
  SELECT p_empresa, 1, 1, 'PRY', 'JURIDICA', 2, 'RUC', '9990' || lpad(n::text, 3, '0'), ((n * 7) % 10)::text, rs, nf,
         'contacto' || n || '@ejemplo.invalid', '0981 000 0' || lpad(n::text, 2, '0'),
         CASE WHEN n % 3 = 1 THEN g_may WHEN n % 3 = 2 THEN g_min ELSE g_sup END
    FROM (VALUES
      (1,'Almacén Los Ceibos S.A. (demo)','Los Ceibos'), (2,'Autoservicio San Miguel S.R.L. (demo)','San Miguel'),
      (3,'Supermercado Ykuá Demo S.A.','Ykuá Demo'),     (4,'Distribuidora del Sur S.A. (demo)','Del Sur'),
      (5,'Minimercado La Esquina S.R.L. (demo)','La Esquina'), (6,'Comercial Tres Fronteras S.A. (demo)','Tres Fronteras'),
      (7,'Despensa Don Lucas S.R.L. (demo)','Don Lucas'), (8,'Hipermercado Central Demo S.A.','Central Demo'),
      (9,'Kiosco y Bazar Aurora S.R.L. (demo)','Bazar Aurora'), (10,'Cooperativa Santa Rosa Demo','Santa Rosa Demo')
    ) t(n, rs, nf);
  INSERT INTO direcciones_cliente (empresa_id, cliente_id, tipo, es_fiscal, direccion, pais_codigo,
                                   departamento_codigo, distrito_codigo, ciudad_codigo, departamento, distrito, ciudad)
  SELECT p_empresa, c.id, 'FISCAL', true, 'Calle Ficticia ' || substring(c.numero_documento FROM 5 FOR 3), 'PRY',
         g.dep, g.dis, g.ciu, g.dep_n, g.dis_n, g.ciu_n
    FROM (SELECT c2.*, row_number() OVER (ORDER BY c2.codigo) rn FROM clientes c2 WHERE c2.empresa_id = p_empresa) c
    JOIN LATERAL (SELECT * FROM (VALUES
          (1, 1, 1, 'Capital', 'Asunción', 'Asunción'),
          (12, 123, 1230, 'Central', 'Luque', 'Luque'),
          (12, 121, 1210, 'Central', 'Lambaré', 'Lambaré')) v(dep, dis, ciu, dep_n, dis_n, ciu_n)
          OFFSET (c.rn % 3) LIMIT 1) g ON true;

  -- Proveedores (ficticios)
  INSERT INTO proveedores (empresa_id, tipo_persona, tipo_documento, numero_documento, dv, razon_social, nombre_fantasia, pais_codigo, email, telefono, grupo_proveedor_id)
  SELECT p_empresa, 'JURIDICA', 'RUC', '9991' || lpad(n::text, 3, '0'), ((n * 3) % 10)::text, rs, nf, 'PRY',
         'ventas' || n || '@ejemplo.invalid', '021 000 0' || lpad(n::text, 2, '0'),
         (SELECT id FROM grupos_proveedor WHERE empresa_id = p_empresa AND codigo = CASE WHEN n <= 4 THEN 'NAC' ELSE 'IMP' END)
    FROM (VALUES
      (1,'Bebidas del Paraguay Demo S.A.','BebiPar Demo'), (2,'Alimentos Yvyra Demo S.A.','Yvyra Demo'),
      (3,'Industria de Limpieza Pytã Demo S.R.L.','Pytã Demo'), (4,'Cuidado Personal Ñemby Demo S.A.','Ñemby Demo'),
      (5,'Importadora Cono Sur Demo S.A.','Cono Sur Demo')
    ) t(n, rs, nf);

  -- Productos (ficticios)  — costo de referencia y categoría por código
  CREATE TEMP TABLE _demo_prod ON COMMIT DROP AS
  SELECT * FROM (VALUES
    ('BEB-001','Agua mineral sin gas 500 ml','BEB','AUR','UN','IVA10',  1800),
    ('BEB-002','Gaseosa cola 2 litros','BEB','GUA','UN','IVA10',  9500),
    ('BEB-003','Jugo de naranja 1 litro','BEB','AUR','UN','IVA10',  7200),
    ('BEB-004','Cerveza rubia lata 350 ml','BEB','GUA','UN','IVA10',  5400),
    ('BEB-005','Agua saborizada limón 1,5 litros','BEB','NAN','UN','IVA10',  4300),
    ('BEB-006','Bebida isotónica 600 ml','BEB','NAN','UN','IVA10',  6100),
    ('ALI-001','Yerba mate 1 kg','ALI','GUA','UN','IVA10', 21000),
    ('ALI-002','Arroz tipo 1 en bolsa de 1 kg','ALI','AUR','UN','IVA10',  6800),
    ('ALI-003','Fideos tallarín 500 g','ALI','NAN','UN','IVA10',  4200),
    ('ALI-004','Aceite de girasol 900 ml','ALI','AUR','UN','IVA10', 14500),
    ('ALI-005','Azúcar blanca 1 kg','ALI','GUA','UN','IVA10',  5900),
    ('ALI-006','Harina de trigo 1 kg','ALI','NAN','UN','EXE',     4700),
    ('LIM-001','Detergente líquido 750 ml','LIM','AUR','UN','IVA10',  8900),
    ('LIM-002','Lavandina 1 litro','LIM','GUA','UN','IVA10',  3900),
    ('LIM-003','Limpiador multiuso 500 ml','LIM','NAN','UN','IVA10',  7300),
    ('LIM-004','Jabón en polvo 800 g','LIM','AUR','UN','IVA10', 16800),
    ('LIM-005','Esponja de cocina x3','LIM','GUA','UN','IVA10',  4800),
    ('LIM-006','Bolsas de residuos x10','LIM','NAN','UN','IVA10',  5200),
    ('HIG-001','Jabón de tocador x3','HIG','AUR','UN','IVA10',  9900),
    ('HIG-002','Shampoo 400 ml','HIG','GUA','UN','IVA10', 17500),
    ('HIG-003','Pasta dental 90 g','HIG','NAN','UN','IVA10',  8400),
    ('HIG-004','Papel higiénico x4','HIG','AUR','UN','IVA10', 11200),
    ('HIG-005','Desodorante en aerosol 150 ml','HIG','GUA','UN','IVA10', 15300),
    ('HIG-006','Toallitas húmedas x50','HIG','NAN','UN','IVA10',  9700)
  ) t(codigo, descripcion, cat, marca, um, imp, costo);
  INSERT INTO productos (empresa_id, codigo, descripcion, descripcion_factura, categoria_id, marca_id, unidad_medida_id, impuesto_id, stock_minimo)
  SELECT p_empresa, d.codigo, d.descripcion, left(d.descripcion, 120),
         (SELECT id FROM categorias_producto WHERE empresa_id = p_empresa AND codigo = d.cat),
         (SELECT id FROM marcas_producto WHERE empresa_id = p_empresa AND codigo = d.marca),
         (SELECT id FROM unidades_medida WHERE codigo = d.um),
         (SELECT id FROM impuestos WHERE codigo = d.imp),
         CASE WHEN d.codigo IN ('ALI-001','HIG-002') THEN 500 ELSE 20 END      -- 2 productos quedan bajo el mínimo (alerta del Dashboard)
    FROM _demo_prod d;
  INSERT INTO producto_unidades (empresa_id, producto_id, unidad_medida_id, nombre_presentacion, factor_conversion, es_unidad_base, es_unidad_compra, es_unidad_venta)
  SELECT empresa_id, id, unidad_medida_id, 'Unidad', 1, true, true, true FROM productos WHERE empresa_id = p_empresa;
  INSERT INTO producto_codigos (empresa_id, producto_id, tipo, codigo, es_principal)
  SELECT empresa_id, id, 'CODIGO_ALTERNO', codigo, true FROM productos WHERE empresa_id = p_empresa;

  -- Listas de precios
  INSERT INTO listas_precio (empresa_id, codigo, nombre, descripcion, tipo_lista, moneda_codigo, vigente_desde, prioridad, descuento_maximo_pct)
  VALUES (p_empresa, 'MAYORISTA', 'Lista mayorista', 'Precios para mayoristas y supermercados (ficticia)', 'VENTA', 'PYG', CURRENT_DATE - 90, 10, 8),
         (p_empresa, 'MINORISTA', 'Lista minorista', 'Precios para minoristas (ficticia)', 'VENTA', 'PYG', CURRENT_DATE - 90, 20, 3);
  SELECT id INTO v_lmay FROM listas_precio WHERE empresa_id = p_empresa AND codigo = 'MAYORISTA';
  SELECT id INTO v_lmin FROM listas_precio WHERE empresa_id = p_empresa AND codigo = 'MINORISTA';
  INSERT INTO lista_precio_items (empresa_id, lista_precio_id, producto_id, unidad_medida_id, moneda_codigo, costo_referencia, precio_base, precio_lista, margen_pct, vigente_desde)
  SELECT p_empresa, l.id, p.id, p.unidad_medida_id, 'PYG', d.costo, d.costo,
         round(d.costo * l.factor / 100) * 100, round((l.factor - 1) * 100, 2), CURRENT_DATE - 90
    FROM (VALUES (v_lmay, 1.25), (v_lmin, 1.45)) l(id, factor)
    CROSS JOIN _demo_prod d
    JOIN productos p ON p.empresa_id = p_empresa AND p.codigo = d.codigo;
  INSERT INTO lista_precio_reglas (empresa_id, lista_precio_id, prioridad, permite_descuento_adicional, descuento_maximo_pct, vigente_desde)
  VALUES (p_empresa, v_lmay, 10, true, 8, CURRENT_DATE - 90), (p_empresa, v_lmin, 20, true, 3, CURRENT_DATE - 90);
  INSERT INTO lista_precio_escalones (empresa_id, lista_precio_item_id, cantidad_minima, precio, descuento_pct)
  SELECT i.empresa_id, i.id, 12, round(i.precio_lista * 0.95 / 100) * 100, 5
    FROM lista_precio_items i JOIN productos p ON p.empresa_id = i.empresa_id AND p.id = i.producto_id
   WHERE i.empresa_id = p_empresa AND i.lista_precio_id = v_lmay AND p.codigo IN ('BEB-001','BEB-002','ALI-002','LIM-002');
  UPDATE clientes SET lista_precio_id = CASE WHEN grupo_cliente_id = g_min THEN v_lmin ELSE v_lmay END WHERE empresa_id = p_empresa;

  -- Compras (ENTRADA/COMPRA) en el depósito central: 3 recepciones con costos distintos (promedio ponderado móvil)
  mv := demo_nuevo_movimiento(p_empresa, 'ENTRADA', 'COMPRA', CURRENT_DATE - 45, NULL, v_dep1, NULL, 'Compra inicial (ficticia)', v_usuario);
  FOR r IN SELECT p.id, d.costo FROM _demo_prod d JOIN productos p ON p.empresa_id = p_empresa AND p.codigo = d.codigo ORDER BY d.codigo LOOP
    PERFORM inventario_registrar_linea(p_empresa, mv, r.id, 120, r.costo);
  END LOOP;
  mv := demo_nuevo_movimiento(p_empresa, 'ENTRADA', 'COMPRA', CURRENT_DATE - 20, NULL, v_dep1, NULL, 'Reposición con aumento de costo (ficticia)', v_usuario);
  FOR r IN SELECT p.id, d.costo FROM _demo_prod d JOIN productos p ON p.empresa_id = p_empresa AND p.codigo = d.codigo ORDER BY d.codigo LOOP
    PERFORM inventario_registrar_linea(p_empresa, mv, r.id, 80, round(r.costo * 1.08, 4));
  END LOOP;
  mv := demo_nuevo_movimiento(p_empresa, 'ENTRADA', 'COMPRA', CURRENT_DATE - 5, NULL, v_dep1, NULL, 'Reposición parcial (ficticia)', v_usuario);
  FOR r IN SELECT p.id, d.costo FROM _demo_prod d JOIN productos p ON p.empresa_id = p_empresa AND p.codigo = d.codigo
            WHERE d.cat IN ('BEB','ALI') ORDER BY d.codigo LOOP
    PERFORM inventario_registrar_linea(p_empresa, mv, r.id, 60, round(r.costo * 1.12, 4));
  END LOOP;

  -- Transferencia central -> salón (12 productos)
  mv := demo_nuevo_movimiento(p_empresa, 'TRANSFERENCIA', 'TRANSFERENCIA', CURRENT_DATE - 15, v_dep1, v_dep2, NULL, 'Abastecimiento del salón (ficticio)', v_usuario);
  FOR r IN SELECT p.id FROM _demo_prod d JOIN productos p ON p.empresa_id = p_empresa AND p.codigo = d.codigo ORDER BY d.codigo LIMIT 12 LOOP
    PERFORM inventario_registrar_linea(p_empresa, mv, r.id, 30);
  END LOOP;

  -- Ajuste negativo (merma)
  mv := demo_nuevo_movimiento(p_empresa, 'AJUSTE_NEGATIVO', 'AJUSTE', CURRENT_DATE - 10, v_dep1, NULL, NULL, 'Merma por rotura (ficticia)', v_usuario);
  FOR r IN SELECT p.id FROM _demo_prod d JOIN productos p ON p.empresa_id = p_empresa AND p.codigo = d.codigo WHERE d.codigo IN ('BEB-002','LIM-003') LOOP
    PERFORM inventario_registrar_linea(p_empresa, mv, r.id, 2);
  END LOOP;

  -- Ventas (SALIDA/VENTA) a clientes, con precio de la lista del cliente
  FOR k IN 1..14 LOOP
    SELECT c.id, c.lista_precio_id INTO r FROM clientes c WHERE c.empresa_id = p_empresa ORDER BY c.codigo OFFSET ((k - 1) % 10) LIMIT 1;
    mv := demo_nuevo_movimiento(p_empresa, 'SALIDA', 'VENTA', CURRENT_DATE - (30 - k * 2), v_dep1, NULL, r.id, 'Venta de demostración', v_usuario);
    v_lista := r.lista_precio_id;
    PERFORM inventario_registrar_linea(p_empresa, mv, i.producto_id, (3 + (k + i.rn)::int % 9)::numeric, NULL, NULL, 'PROPIO', NULL, i.precio_lista, 'PYG')
      FROM (SELECT li.producto_id, li.precio_lista,
                   row_number() OVER (ORDER BY md5(pr.codigo || k::text)) AS rn
              FROM lista_precio_items li JOIN productos pr ON pr.empresa_id = li.empresa_id AND pr.id = li.producto_id
             WHERE li.empresa_id = p_empresa AND li.lista_precio_id = v_lista
             ORDER BY md5(pr.codigo || k::text) LIMIT 4) i;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- Crear una empresa DEMO completa (estructura + usuario + datos ficticios).
-- p_password_hash: hash bcrypt con prefijo $2a$ (el único que pgcrypto crypt() valida) generado fuera del servidor. La contraseña nunca se almacena en claro.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION demo_crear_empresa(
  p_codigo text, p_razon_social text, p_usuario text, p_password_hash text,
  p_prospecto text DEFAULT NULL, p_dias_vigencia integer DEFAULT 30) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE e uuid; s uuid; u uuid; pf_admin uuid; pf_cons uuid;
BEGIN
  IF p_codigo !~ '^demo-[a-z0-9-]{2,30}$' THEN
    RAISE EXCEPTION 'el código de una empresa DEMO debe cumplir ^demo-[a-z0-9-]{2,30}$' USING ERRCODE = 'P0001';
  END IF;
  IF p_usuario !~ '^[a-z0-9._-]{1,80}$' THEN
    RAISE EXCEPTION 'usuario inválido (minúsculas, números . _ -)' USING ERRCODE = 'P0001';
  END IF;
  IF p_password_hash !~ '^\$2a\$[0-9]{2}\$[./A-Za-z0-9]{53}$' THEN
    RAISE EXCEPTION 'se espera un hash bcrypt con prefijo $2a$ (pgcrypto no valida $2b$/$2y$), no una contraseña en claro' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM impuestos WHERE codigo = 'IVA10') THEN
    RAISE EXCEPTION 'faltan catálogos globales: ejecute la semilla S-001 antes' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO empresas (codigo, razon_social, es_demo, demo_prospecto, demo_creada_at, demo_vence_at)
  VALUES (p_codigo, p_razon_social, true, p_prospecto, now(), now() + make_interval(days => p_dias_vigencia))
  RETURNING id INTO e;
  INSERT INTO sucursales (empresa_id, codigo, nombre, establecimiento_sifen) VALUES (e, 'CASA-CENTRAL', 'Casa central', '001') RETURNING id INTO s;
  INSERT INTO depositos (empresa_id, sucursal_id, codigo, nombre) VALUES
    (e, s, 'DEP-CENTRAL', 'Depósito central'), (e, s, 'DEP-SALON', 'Salón de ventas');
  INSERT INTO medios_pago (empresa_id, codigo, nombre, tipo) VALUES
    (e, 'EFECTIVO', 'Efectivo', 'EFECTIVO'), (e, 'TRANSFERENCIA', 'Transferencia bancaria', 'TRANSFERENCIA'),
    (e, 'CHEQUE', 'Cheque', 'CHEQUE'), (e, 'TARJETA', 'Tarjeta', 'TARJETA');
  INSERT INTO perfiles (empresa_id, codigo, nombre, es_administrador, es_sistema) VALUES (e, 'ADMIN', 'Administrador', true, true) RETURNING id INTO pf_admin;
  INSERT INTO perfiles (empresa_id, codigo, nombre, es_sistema) VALUES (e, 'CONSULTA', 'Solo consulta', true) RETURNING id INTO pf_cons;
  INSERT INTO perfil_permiso (empresa_id, perfil_id, permiso_id)
  SELECT e, pf_cons, id FROM permisos WHERE accion = 'VER' AND clase = 'OPERACIONAL';
  INSERT INTO usuarios (empresa_id, sucursal_id, usuario, nombre, apellido, password_hash, alcance_sucursales, alcance_depositos)
  VALUES (e, s, p_usuario, 'Administrador', 'Demo', p_password_hash, 'TODAS', 'TODOS') RETURNING id INTO u;
  INSERT INTO usuario_perfil (empresa_id, usuario_id, perfil_id) VALUES (e, u, pf_admin);
  PERFORM demo_poblar(e);
  RETURN e;
END $$;

-- ---------------------------------------------------------------------
-- Tablas de datos de negocio de una empresa, en orden seguro de borrado (hijas antes que padres).
-- Se conservan: empresa, sucursales, depósitos, medios de pago, perfiles, usuarios (y su contraseña) y sesiones.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION demo_vaciar_datos(p_empresa uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM empresas WHERE id = p_empresa AND es_demo AND codigo LIKE 'demo-%') THEN
    RAISE EXCEPTION 'operación permitida solo para empresas DEMO' USING ERRCODE = 'P0001';
  END IF;
  PERFORM set_config('nex.reinicio_demo', p_empresa::text, true);
  UPDATE clientes SET lista_precio_id = NULL WHERE empresa_id = p_empresa;
  DELETE FROM inventario_costos WHERE empresa_id = p_empresa;
  DELETE FROM movimiento_lineas WHERE empresa_id = p_empresa;
  DELETE FROM movimientos_inventario WHERE empresa_id = p_empresa;
  DELETE FROM stock_saldos WHERE empresa_id = p_empresa;
  DELETE FROM stock_lotes WHERE empresa_id = p_empresa;
  DELETE FROM lista_precio_reglas WHERE empresa_id = p_empresa;
  DELETE FROM lista_precio_escalones WHERE empresa_id = p_empresa;
  DELETE FROM lista_precio_items WHERE empresa_id = p_empresa;
  DELETE FROM listas_precio WHERE empresa_id = p_empresa;
  DELETE FROM producto_documentos WHERE empresa_id = p_empresa;
  DELETE FROM producto_componentes WHERE empresa_id = p_empresa;
  DELETE FROM producto_alternativos WHERE empresa_id = p_empresa;
  DELETE FROM producto_deposito_configuracion WHERE empresa_id = p_empresa;
  DELETE FROM producto_proveedores WHERE empresa_id = p_empresa;
  DELETE FROM producto_unidades WHERE empresa_id = p_empresa;
  DELETE FROM producto_codigos WHERE empresa_id = p_empresa;
  DELETE FROM productos WHERE empresa_id = p_empresa;
  DELETE FROM proveedor_documentos WHERE empresa_id = p_empresa;
  DELETE FROM proveedor_retenciones WHERE empresa_id = p_empresa;
  DELETE FROM proveedor_cuentas_bancarias WHERE empresa_id = p_empresa;
  DELETE FROM proveedor_direcciones WHERE empresa_id = p_empresa;
  DELETE FROM proveedor_contactos WHERE empresa_id = p_empresa;
  DELETE FROM proveedores WHERE empresa_id = p_empresa;
  DELETE FROM cliente_documentos WHERE empresa_id = p_empresa;
  DELETE FROM direcciones_cliente WHERE empresa_id = p_empresa;
  DELETE FROM cliente_contactos WHERE empresa_id = p_empresa;
  DELETE FROM clientes WHERE empresa_id = p_empresa;
  DELETE FROM marcas_producto WHERE empresa_id = p_empresa;
  DELETE FROM categorias_producto WHERE empresa_id = p_empresa;
  DELETE FROM grupos_proveedor WHERE empresa_id = p_empresa;
  DELETE FROM canales_venta WHERE empresa_id = p_empresa;
  DELETE FROM zonas_comerciales WHERE empresa_id = p_empresa;
  DELETE FROM rutas_entrega WHERE empresa_id = p_empresa;
  DELETE FROM vendedores WHERE empresa_id = p_empresa;
  DELETE FROM grupos_cliente WHERE empresa_id = p_empresa;
  PERFORM set_config('nex.reinicio_demo', '', true);
END $$;

CREATE OR REPLACE FUNCTION demo_reiniciar(p_codigo text) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE e uuid;
BEGIN
  SELECT id INTO e FROM empresas WHERE codigo = p_codigo AND es_demo AND codigo LIKE 'demo-%' FOR UPDATE;
  IF e IS NULL THEN
    RAISE EXCEPTION 'no existe una empresa DEMO con código %', p_codigo USING ERRCODE = 'P0001';
  END IF;
  PERFORM demo_vaciar_datos(e);
  PERFORM demo_poblar(e);
  UPDATE empresas SET demo_vence_at = now() + (demo_vence_at - demo_creada_at) WHERE id = e AND demo_vence_at IS NOT NULL;
  RETURN e;
END $$;

CREATE OR REPLACE FUNCTION demo_eliminar(p_codigo text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE e uuid;
BEGIN
  SELECT id INTO e FROM empresas WHERE codigo = p_codigo AND es_demo AND codigo LIKE 'demo-%' FOR UPDATE;
  IF e IS NULL THEN
    RAISE EXCEPTION 'no existe una empresa DEMO con código %', p_codigo USING ERRCODE = 'P0001';
  END IF;
  PERFORM demo_vaciar_datos(e);
  PERFORM set_config('nex.reinicio_demo', e::text, true);
  DELETE FROM sesiones_usuario  WHERE empresa_id = e;
  DELETE FROM eventos_seguridad WHERE empresa_id = e;
  DELETE FROM usuario_perfil    WHERE empresa_id = e;
  DELETE FROM usuario_sucursal  WHERE empresa_id = e;
  DELETE FROM usuario_deposito  WHERE empresa_id = e;
  DELETE FROM perfil_permiso    WHERE empresa_id = e;
  DELETE FROM usuarios          WHERE empresa_id = e;
  DELETE FROM perfiles          WHERE empresa_id = e;
  DELETE FROM medios_pago       WHERE empresa_id = e;
  DELETE FROM depositos         WHERE empresa_id = e;
  DELETE FROM sucursales        WHERE empresa_id = e;
  DELETE FROM empresas          WHERE id = e;
  PERFORM set_config('nex.reinicio_demo', '', true);
END $$;

-- Conteos por área (verificación y reporte de pruebas).
CREATE OR REPLACE FUNCTION demo_resumen(p_codigo text) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'empresa', e.codigo,
    'clientes',     (SELECT count(*) FROM clientes x WHERE x.empresa_id = e.id),
    'proveedores',  (SELECT count(*) FROM proveedores x WHERE x.empresa_id = e.id),
    'productos',    (SELECT count(*) FROM productos x WHERE x.empresa_id = e.id),
    'listas_precio',(SELECT count(*) FROM listas_precio x WHERE x.empresa_id = e.id),
    'items_precio', (SELECT count(*) FROM lista_precio_items x WHERE x.empresa_id = e.id),
    'movimientos',  (SELECT count(*) FROM movimientos_inventario x WHERE x.empresa_id = e.id),
    'lineas',       (SELECT count(*) FROM movimiento_lineas x WHERE x.empresa_id = e.id),
    'saldos',       (SELECT count(*) FROM stock_saldos x WHERE x.empresa_id = e.id),
    'valor_stock',  (SELECT COALESCE(sum(valor_total), 0) FROM inventario_costos x WHERE x.empresa_id = e.id),
    'usuarios',     (SELECT count(*) FROM usuarios x WHERE x.empresa_id = e.id))
  FROM empresas e WHERE e.codigo = p_codigo
$$;

-- Las funciones de ciclo de vida son de ADMINISTRACIÓN: el rol de la aplicación no debe ejecutarlas.
REVOKE ALL ON FUNCTION demo_crear_empresa(text, text, text, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION demo_poblar(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION demo_vaciar_datos(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION demo_reiniciar(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION demo_eliminar(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION demo_nuevo_movimiento(uuid, text, text, date, uuid, uuid, uuid, text, uuid) FROM PUBLIC;

SELECT nex_instalar_triggers_actualizacion();
