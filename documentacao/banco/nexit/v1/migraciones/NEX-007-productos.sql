-- =====================================================================
-- NEX-007 — Productos
-- Productos, códigos, unidades, proveedores, configuración por depósito, alternativos, componentes (kits) y documentos.
-- Proyecto Nexit (REQ NEXIT-2026-001). ESTADO: V1 candidata oficial — pendiente de auditoría (ChatGPT) y aprobación del responsable.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable.
-- Aplicar con documentacao/banco/nexit/v1/scripts/aplicar-migraciones.sh (transacción única + checksum).
-- =====================================================================

CREATE TABLE productos (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),    
  empresa_id                  uuid        NOT NULL REFERENCES empresas (id),        
  codigo                        text        NOT NULL CONSTRAINT productos_codigo_chk CHECK (length(btrim(codigo)) > 0 AND char_length(codigo) <= 80),   
  codigo_inventario              text,       
  codigo_sifen                  text        CONSTRAINT productos_sifen_codigo_chk CHECK (char_length(codigo_sifen) <= 20),   
  codigo_barras                     text        CONSTRAINT productos_barcode_chk CHECK (char_length(codigo_barras) <= 80),         
  descripcion                 text        NOT NULL CONSTRAINT productos_description_chk CHECK (length(btrim(descripcion)) > 0 AND char_length(descripcion) <= 300),   
  descripcion_factura         text        NOT NULL CONSTRAINT productos_invoice_desc_chk CHECK (length(btrim(descripcion_factura)) > 0 AND char_length(descripcion_factura) <= 120),  
  tipo_producto                text        NOT NULL DEFAULT 'MERCADERIA'
                              CONSTRAINT productos_tipo_chk CHECK (tipo_producto IN ('MERCADERIA','SERVICIO','KIT','ACTIVO_FIJO')),   
  categoria_id                 uuid,       
  marca_id                    uuid,       
  familia_id                   uuid,       
  linea_id                     uuid,       
  origen_etiqueta                text,       
  unidad_medida_id          uuid        NOT NULL REFERENCES unidades_medida (id),   
  impuesto_id                      uuid        REFERENCES impuestos (id),                       
  controla_stock                boolean     NOT NULL DEFAULT true,   
  modo_control_stock          text        NOT NULL DEFAULT 'CANTIDAD'
                              CONSTRAINT productos_stock_mode_chk CHECK (modo_control_stock IN ('CANTIDAD','LOTE','UNIDAD_ETIQUETADA')),   
  permite_terceros    boolean     NOT NULL DEFAULT false,  
  requiere_vencimiento             boolean     NOT NULL DEFAULT false,  
  stock_minimo                   numeric(18,4) NOT NULL DEFAULT 0 CONSTRAINT productos_min_stock_chk CHECK (stock_minimo >= 0),   
  stock_maximo                   numeric(18,4) CONSTRAINT productos_max_stock_chk CHECK (stock_maximo >= 0),        
  punto_reposicion               numeric(18,4) CONSTRAINT productos_reorder_point_chk CHECK (punto_reposicion >= 0), 
  costo_promedio                numeric(18,4) NOT NULL DEFAULT 0 CONSTRAINT productos_average_costo_chk CHECK (costo_promedio >= 0),
                              
  partida_arancelaria              text        CONSTRAINT productos_tariff_chk CHECK (char_length(partida_arancelaria) <= 4),        
  ncm                         text        CONSTRAINT productos_ncm_chk CHECK (char_length(ncm) <= 8),                      
  dncp_general           text        CONSTRAINT productos_dncp_gen_chk CHECK (char_length(dncp_general) <= 8),   
  dncp_especifico          text        CONSTRAINT productos_dncp_spec_chk CHECK (char_length(dncp_especifico) <= 4), 
  pais_origen_codigo         text        CONSTRAINT productos_origin_pais_chk CHECK (pais_origen_codigo ~ '^[A-Z]{3}$'),   
  pais_origen_nombre         text        CONSTRAINT productos_origin_pais_nombre_chk CHECK (char_length(pais_origen_nombre) <= 30),  
  informacion_factura     text        CONSTRAINT productos_invoice_info_chk CHECK (char_length(informacion_factura) <= 500),  
  relacion_mercaderia              smallint    CONSTRAINT productos_goods_relation_chk CHECK (relacion_mercaderia IN (1,2)),   
  porcentaje_merma           numeric(7,4) CONSTRAINT productos_shrink_pct_chk CHECK (porcentaje_merma BETWEEN 0 AND 100),   
  cantidad_merma          numeric(18,4) CONSTRAINT productos_shrink_cant_chk CHECK (cantidad_merma >= 0),               
  vendible                 boolean     NOT NULL DEFAULT true,   
  comprable              boolean     NOT NULL DEFAULT true,   
  requiere_inspeccion_calidad boolean     NOT NULL DEFAULT false,  
  vida_util_dias             integer     CONSTRAINT productos_shelf_life_chk CHECK (vida_util_dias >= 0),   
  peso_neto_kg               numeric(18,4) CONSTRAINT productos_net_weight_chk CHECK (peso_neto_kg >= 0),     
  peso_bruto_kg             numeric(18,4) CONSTRAINT productos_gross_weight_chk CHECK (peso_bruto_kg >= 0), 
  largo_cm                   numeric(18,4) CONSTRAINT productos_length_chk CHECK (largo_cm >= 0),             
  ancho_cm                    numeric(18,4) CONSTRAINT productos_width_chk CHECK (ancho_cm >= 0),               
  alto_cm                   numeric(18,4) CONSTRAINT productos_height_chk CHECK (alto_cm >= 0),             
  volumen_m3                   numeric(18,4) CONSTRAINT productos_volume_chk CHECK (volumen_m3 >= 0),             
  imagen_url                   text,       
  observacion                       text        CONSTRAINT productos_notes_chk CHECK (char_length(observacion) <= 1000),   
  activo                   boolean     NOT NULL DEFAULT true,   
  creado_por                  uuid,       
  creado_at                  timestamptz NOT NULL DEFAULT now(),  
  actualizado_at                  timestamptz NOT NULL DEFAULT now(),  
  CONSTRAINT productos_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT productos_empresa_codigo_key  UNIQUE (empresa_id, codigo),   
  CONSTRAINT productos_categoria_fk   FOREIGN KEY (empresa_id, categoria_id) REFERENCES categorias_producto (empresa_id, id),
  CONSTRAINT productos_marca_fk      FOREIGN KEY (empresa_id, marca_id)    REFERENCES marcas_producto (empresa_id, id),
  CONSTRAINT productos_creado_por_fk FOREIGN KEY (empresa_id, creado_por)  REFERENCES usuarios (empresa_id, id)
);

CREATE INDEX productos_empresa_activo_idx ON productos (empresa_id, activo, descripcion);

CREATE INDEX productos_categoria_idx ON productos (empresa_id, categoria_id);

CREATE INDEX productos_marca_idx    ON productos (empresa_id, marca_id);

CREATE TABLE producto_codigos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid        NOT NULL REFERENCES empresas (id),   
  producto_id   uuid        NOT NULL,                             
  tipo    text        NOT NULL DEFAULT 'GTIN'
               CONSTRAINT producto_codigos_tipo_chk CHECK (tipo IN ('GTIN','GTIN_EMPAQUE','EAN','UPC','CODIGO_ALTERNO','SKU_PROVEEDOR','OTRO')),   
  codigo         text        NOT NULL CHECK (length(btrim(codigo)) > 0 AND char_length(codigo) <= 80),   
  descripcion  text        CHECK (char_length(descripcion) <= 120),   
  es_principal   boolean     NOT NULL DEFAULT false,   
  creado_at   timestamptz NOT NULL DEFAULT now(),
  actualizado_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT producto_codigos_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT producto_codigos_producto_fk FOREIGN KEY (empresa_id, producto_id) REFERENCES productos (empresa_id, id) ON DELETE CASCADE,
  
  CONSTRAINT producto_codigos_producto_codigo_key UNIQUE (empresa_id, producto_id, tipo, codigo),
  
  CONSTRAINT producto_codigos_gtin_format_chk CHECK (tipo NOT IN ('GTIN','GTIN_EMPAQUE','EAN','UPC') OR codigo ~ '^[0-9]{8,14}$')
);

CREATE INDEX producto_codigos_lookup_idx ON producto_codigos (empresa_id, codigo);

CREATE UNIQUE INDEX producto_codigos_uno_principal_uq ON producto_codigos (empresa_id, producto_id) WHERE es_principal;

CREATE TABLE producto_unidades (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid        NOT NULL REFERENCES empresas (id),
  producto_id          uuid        NOT NULL,                             
  unidad_medida_id  uuid        NOT NULL REFERENCES unidades_medida (id),   
  nombre_presentacion   text        NOT NULL CHECK (length(btrim(nombre_presentacion)) > 0 AND char_length(nombre_presentacion) <= 100),   
  factor_conversion   numeric(18,6) NOT NULL CONSTRAINT producto_unidades_factor_chk CHECK (factor_conversion > 0),   
  es_unidad_base        boolean     NOT NULL DEFAULT false,   
  es_unidad_compra    boolean     NOT NULL DEFAULT false,   
  es_unidad_venta       boolean     NOT NULL DEFAULT true,    
  codigo_barras             text        CHECK (char_length(codigo_barras) <= 80),   
  peso_bruto_kg     numeric(18,4) CONSTRAINT producto_unidades_weight_chk CHECK (peso_bruto_kg >= 0),   
  volumen_m3           numeric(18,4) CONSTRAINT producto_unidades_volume_chk CHECK (volumen_m3 >= 0),         
  creado_at          timestamptz NOT NULL DEFAULT now(),
  actualizado_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT producto_unidades_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT producto_unidades_producto_fk FOREIGN KEY (empresa_id, producto_id) REFERENCES productos (empresa_id, id) ON DELETE CASCADE
);

CREATE INDEX producto_unidades_producto_idx ON producto_unidades (empresa_id, producto_id);

CREATE UNIQUE INDEX producto_unidades_uno_base_uq ON producto_unidades (empresa_id, producto_id) WHERE es_unidad_base;

CREATE TABLE producto_proveedores (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid        NOT NULL REFERENCES empresas (id),
  producto_id            uuid        NOT NULL,                             
  proveedor_id           uuid        NOT NULL,                             
  codigo_proveedor         text        CHECK (char_length(codigo_proveedor) <= 80),          
  descripcion_proveedor  text        CHECK (char_length(descripcion_proveedor) <= 300),  
  unidad_medida_id    uuid        REFERENCES unidades_medida (id),                   
  factor_conversion     numeric(18,6) NOT NULL DEFAULT 1 CONSTRAINT producto_proveedores_factor_chk CHECK (factor_conversion >= 0),   
  costo_referencia        numeric(18,4) CONSTRAINT producto_proveedores_costo_chk CHECK (costo_referencia >= 0),
                        
  moneda_codigo         text        REFERENCES monedas (codigo),   
  cantidad_minima_compra numeric(18,4) CONSTRAINT producto_proveedores_minqty_chk CHECK (cantidad_minima_compra >= 0),   
  plazo_entrega_dias        integer     CONSTRAINT producto_proveedores_lead_chk CHECK (plazo_entrega_dias >= 0),   
  es_principal            boolean     NOT NULL DEFAULT false,   
  creado_at            timestamptz NOT NULL DEFAULT now(),
  actualizado_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT producto_proveedores_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT producto_proveedores_producto_fk  FOREIGN KEY (empresa_id, producto_id)  REFERENCES productos (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT producto_proveedores_proveedor_fk FOREIGN KEY (empresa_id, proveedor_id) REFERENCES proveedores (empresa_id, id)
);

CREATE INDEX producto_proveedores_producto_idx  ON producto_proveedores (empresa_id, producto_id);

CREATE INDEX producto_proveedores_proveedor_idx ON producto_proveedores (empresa_id, proveedor_id);

CREATE UNIQUE INDEX producto_proveedores_uno_principal_uq ON producto_proveedores (empresa_id, producto_id) WHERE es_principal;

CREATE TABLE producto_deposito_configuracion (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid        NOT NULL REFERENCES empresas (id),
  producto_id            uuid        NOT NULL,                             
  deposito_id          uuid        NOT NULL,                             
  ubicacion_preferida_id uuid,       
  stock_minimo             numeric(18,4) CONSTRAINT pws_min_chk CHECK (stock_minimo >= 0),            
  stock_maximo             numeric(18,4) CONSTRAINT pws_max_chk CHECK (stock_maximo >= 0),            
  punto_reposicion         numeric(18,4) CONSTRAINT pws_reorder_point_chk CHECK (punto_reposicion >= 0),   
  cantidad_reposicion      numeric(18,4) CONSTRAINT pws_reorder_qty_chk CHECK (cantidad_reposicion >= 0),  
  creado_at            timestamptz NOT NULL DEFAULT now(),
  actualizado_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT producto_deposito_configuracion_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT producto_deposito_configuracion_producto_fk   FOREIGN KEY (empresa_id, producto_id)   REFERENCES productos (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT producto_deposito_configuracion_deposito_fk FOREIGN KEY (empresa_id, deposito_id) REFERENCES depositos (empresa_id, id),
  
  CONSTRAINT producto_deposito_configuracion_producto_dep_key UNIQUE (empresa_id, producto_id, deposito_id)
);

CREATE INDEX producto_deposito_configuracion_dep_idx ON producto_deposito_configuracion (empresa_id, deposito_id);

CREATE TABLE producto_alternativos (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              uuid        NOT NULL REFERENCES empresas (id),
  producto_id              uuid        NOT NULL,                             
  producto_alternativo_id  uuid        NOT NULL,                             
  tipo        text        NOT NULL DEFAULT 'SUSTITUTO'
                          CONSTRAINT producto_alternativos_tipo_chk CHECK (tipo IN ('SUSTITUTO','COMPLEMENTARIO','UPSELL')),   
  prioridad                integer     NOT NULL DEFAULT 1 CONSTRAINT producto_alternativos_priority_chk CHECK (prioridad >= 1),   
  creado_at              timestamptz NOT NULL DEFAULT now(),
  actualizado_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT producto_alternativos_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT producto_alternativos_producto_fk FOREIGN KEY (empresa_id, producto_id)             REFERENCES productos (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT producto_alternativos_alternativo_fk     FOREIGN KEY (empresa_id, producto_alternativo_id) REFERENCES productos (empresa_id, id) ON DELETE CASCADE,
  
  CONSTRAINT producto_alternativos_not_self_chk CHECK (producto_alternativo_id <> producto_id)
  
);

CREATE INDEX producto_alternativos_producto_idx ON producto_alternativos (empresa_id, producto_id);

CREATE INDEX producto_alternativos_alternativo_idx     ON producto_alternativos (empresa_id, producto_alternativo_id);

CREATE TABLE producto_componentes (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid        NOT NULL REFERENCES empresas (id),
  producto_kit_id        uuid        NOT NULL,                             
  producto_componente_id  uuid        NOT NULL,                             
  cantidad              numeric(18,4) NOT NULL CONSTRAINT producto_componentes_cant_chk CHECK (cantidad > 0),   
  es_opcional           boolean     NOT NULL DEFAULT false,   
  orden            integer     NOT NULL DEFAULT 1 CONSTRAINT producto_componentes_order_chk CHECK (orden >= 1),   
  creado_at            timestamptz NOT NULL DEFAULT now(),
  actualizado_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT producto_componentes_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT producto_componentes_kit_fk       FOREIGN KEY (empresa_id, producto_kit_id)       REFERENCES productos (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT producto_componentes_componente_fk FOREIGN KEY (empresa_id, producto_componente_id) REFERENCES productos (empresa_id, id),
  
  CONSTRAINT producto_componentes_not_self_chk CHECK (producto_componente_id <> producto_kit_id)
  
);

CREATE INDEX producto_componentes_kit_idx       ON producto_componentes (empresa_id, producto_kit_id);

CREATE INDEX producto_componentes_componente_idx ON producto_componentes (empresa_id, producto_componente_id);

CREATE TABLE producto_documentos (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid        NOT NULL REFERENCES empresas (id),
  producto_id     uuid        NOT NULL,                             
  tipo  text        NOT NULL DEFAULT 'FICHA_TECNICA'
                 CONSTRAINT producto_documentos_tipo_chk CHECK (tipo IN ('FICHA_TECNICA','HOJA_SEGURIDAD','CERTIFICADO','IMAGEN','OTRO')),   
  nombre_archivo      text        NOT NULL CHECK (length(btrim(nombre_archivo)) > 0 AND char_length(nombre_archivo) <= 255),   
  url_archivo       text        NOT NULL CHECK (length(btrim(url_archivo)) > 0),   
  fecha_emision      date,       
  fecha_vencimiento     date,       
  observacion          text        CHECK (char_length(observacion) <= 500),   
  cargado_por    uuid,       
  creado_at     timestamptz NOT NULL DEFAULT now(),
  actualizado_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT producto_documentos_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT producto_documentos_producto_fk FOREIGN KEY (empresa_id, producto_id) REFERENCES productos (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT producto_documentos_uploaded_por_fk FOREIGN KEY (empresa_id, cargado_por) REFERENCES usuarios (empresa_id, id),
  CONSTRAINT producto_documentos_dates_chk CHECK (fecha_vencimiento IS NULL OR fecha_emision IS NULL OR fecha_vencimiento >= fecha_emision)
);

CREATE INDEX producto_documentos_producto_idx ON producto_documentos (empresa_id, producto_id);

CREATE OR REPLACE FUNCTION producto_componentes_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE kit_type text;
BEGIN
  -- Serializa as alterações de componentes da empresa para que duas transações
  -- concorrentes (A->B e B->A) não passem ambas pela detecção de ciclo.
  PERFORM pg_advisory_xact_lock(hashtextextended('product_components:' || NEW.empresa_id::text, 0));

  -- Regra 5 (route.ts:266-267): só produto do tipo KIT pode ter componentes.
  -- Se o kit não existir (ou for de outra empresa) a FK composta acusa o erro depois (23503).
  SELECT tipo_producto INTO kit_type FROM productos
   WHERE empresa_id = NEW.empresa_id AND id = NEW.producto_kit_id;
  IF kit_type IS NOT NULL AND kit_type <> 'KIT' THEN
    RAISE EXCEPTION 'KIT: el producto % es de tipo % y no puede tener componentes', NEW.producto_kit_id, kit_type USING ERRCODE = 'P0001';
  END IF;

  -- Ciclo: partindo do componente, descendo pelos kits, o kit novo não pode ser alcançado.
  -- UNION (não ALL) garante término mesmo se houver dados antigos cíclicos.
  IF EXISTS (
    WITH RECURSIVE down(id) AS (
      SELECT pc.producto_componente_id FROM producto_componentes pc
       WHERE pc.empresa_id = NEW.empresa_id AND pc.producto_kit_id = NEW.producto_componente_id AND pc.id <> NEW.id
      UNION
      SELECT pc.producto_componente_id FROM producto_componentes pc JOIN down d ON pc.producto_kit_id = d.id
       WHERE pc.empresa_id = NEW.empresa_id AND pc.id <> NEW.id
    )
    SELECT 1 FROM down WHERE id = NEW.producto_kit_id
  ) THEN
    RAISE EXCEPTION 'KIT: ciclo de componentes (% -> % ya alcanza %)', NEW.producto_kit_id, NEW.producto_componente_id, NEW.producto_kit_id USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER producto_componentes_guard_trg
  BEFORE INSERT OR UPDATE OF empresa_id, producto_kit_id, producto_componente_id ON producto_componentes
  FOR EACH ROW EXECUTE FUNCTION producto_componentes_guard();

CREATE OR REPLACE FUNCTION productos_kit_tipo_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.tipo_producto = 'KIT' AND NEW.tipo_producto <> 'KIT'
     AND EXISTS (SELECT 1 FROM producto_componentes WHERE empresa_id = OLD.empresa_id AND producto_kit_id = OLD.id) THEN
    RAISE EXCEPTION 'KIT: el producto % tiene componentes y no puede dejar de ser KIT', OLD.id USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER productos_kit_tipo_guard_trg
  BEFORE UPDATE OF tipo_producto ON productos
  FOR EACH ROW EXECUTE FUNCTION productos_kit_tipo_guard();

SELECT nex_instalar_heredar_empresa('producto_codigos','productos','producto_id');
SELECT nex_instalar_heredar_empresa('producto_unidades','productos','producto_id');
SELECT nex_instalar_heredar_empresa('producto_proveedores','productos','producto_id');
SELECT nex_instalar_heredar_empresa('producto_deposito_configuracion','productos','producto_id');
SELECT nex_instalar_heredar_empresa('producto_alternativos','productos','producto_id');
SELECT nex_instalar_heredar_empresa('producto_documentos','productos','producto_id');
SELECT nex_instalar_heredar_empresa('producto_componentes','productos','producto_kit_id');

SELECT nex_instalar_triggers_actualizacion();
