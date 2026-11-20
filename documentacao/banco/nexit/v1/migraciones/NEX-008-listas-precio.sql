-- =====================================================================
-- NEX-008 — Listas de precios
-- Listas, ítems, escalones y reglas; FK clientes → listas_precio.
-- Proyecto Nexit (REQ NEXIT-2026-001). ESTADO: V1 candidata oficial — pendiente de auditoría (ChatGPT) y aprobación del responsable.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable.
-- Aplicar con documentacao/banco/nexit/v1/scripts/aplicar-migraciones.sh (transacción única + checksum).
-- =====================================================================

CREATE TABLE listas_precio (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),         
  empresa_id                  uuid          NOT NULL REFERENCES empresas (id),      
  codigo                        text          NOT NULL,                              
  nombre                        text          NOT NULL,                              
  descripcion                 text,                                                
  tipo_lista                   text          NOT NULL DEFAULT 'VENTA',              
  moneda_codigo               text          NOT NULL DEFAULT 'PYG',                
  estado                      text          NOT NULL DEFAULT 'ACTIVA',             
  modo_precio                text          NOT NULL DEFAULT 'PRECIO_FIJO',        
  incluye_impuesto                boolean       NOT NULL DEFAULT true,                 
  lista_precio_base_id          uuid,                                                
  ajuste_general_pct      numeric(7,4)  NOT NULL DEFAULT 0,                    
  vigente_desde                  date          NOT NULL DEFAULT current_date,         
  vigente_hasta                    date,                                                
  prioridad                    integer       NOT NULL DEFAULT 10,                   
  permite_descuento_adicional  boolean       NOT NULL DEFAULT true,                 
  descuento_maximo_pct            numeric(7,4)  NOT NULL DEFAULT 5,                    
  grupo_cliente_id           uuid,                                                
  cliente_id                 uuid,                                                
  zona_comercial_id          uuid,                                                
  canal_venta_id            uuid,                                                
  activo                   boolean       NOT NULL DEFAULT true,                 
  observacion                       text,                                                
  creado_por                  uuid,                                                
  creado_at                  timestamptz   NOT NULL DEFAULT now(),                
  actualizado_at                  timestamptz   NOT NULL DEFAULT now(),                
  CONSTRAINT listas_precio_empresa_id_id_key UNIQUE (empresa_id, id),
  
  
  CONSTRAINT listas_precio_empresa_codigo_key  UNIQUE (empresa_id, codigo),
  CONSTRAINT listas_precio_lista_tipo_chk     CHECK (tipo_lista IN ('VENTA','COMPRA')),
  CONSTRAINT listas_precio_estado_chk        CHECK (estado IN ('BORRADOR','ACTIVA','INACTIVA','VENCIDA')),
  CONSTRAINT listas_precio_pricing_mode_chk  CHECK (modo_precio IN ('PRECIO_FIJO','AJUSTE_PORCENTAJE','MARGEN_SOBRE_COSTO')),
  CONSTRAINT listas_precio_moneda_fk       FOREIGN KEY (moneda_codigo)                    REFERENCES monedas (codigo),
  CONSTRAINT listas_precio_base_fk           FOREIGN KEY (empresa_id, lista_precio_base_id)   REFERENCES listas_precio (empresa_id, id),
  CONSTRAINT listas_precio_cliente_grupo_fk FOREIGN KEY (empresa_id, grupo_cliente_id)    REFERENCES grupos_cliente (empresa_id, id),
  CONSTRAINT listas_precio_cliente_fk       FOREIGN KEY (empresa_id, cliente_id)          REFERENCES clientes (empresa_id, id),
  CONSTRAINT listas_precio_zone_fk           FOREIGN KEY (empresa_id, zona_comercial_id)   REFERENCES zonas_comerciales (empresa_id, id),
  CONSTRAINT listas_precio_channel_fk        FOREIGN KEY (empresa_id, canal_venta_id)     REFERENCES canales_venta (empresa_id, id),
  CONSTRAINT listas_precio_creado_por_fk     FOREIGN KEY (empresa_id, creado_por)           REFERENCES usuarios (empresa_id, id)
  
  
  
);

CREATE INDEX listas_precio_empresa_estado_idx ON listas_precio (empresa_id, estado, activo);

CREATE INDEX listas_precio_base_idx           ON listas_precio (empresa_id, lista_precio_base_id)  WHERE lista_precio_base_id IS NOT NULL;

CREATE INDEX listas_precio_cliente_idx       ON listas_precio (empresa_id, cliente_id)         WHERE cliente_id IS NOT NULL;

CREATE INDEX listas_precio_grupo_idx          ON listas_precio (empresa_id, grupo_cliente_id)   WHERE grupo_cliente_id IS NOT NULL;

CREATE TABLE lista_precio_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),           
  empresa_id          uuid          NOT NULL REFERENCES empresas (id),       
  lista_precio_id       uuid          NOT NULL,                                
  producto_id          uuid          NOT NULL,                                
  unidad_medida_id  uuid          NOT NULL REFERENCES unidades_medida (id),  
  moneda_codigo       text          NOT NULL REFERENCES monedas (codigo),   
  costo_referencia      numeric(18,4) NOT NULL DEFAULT 0,                      
  precio_base          numeric(18,4) NOT NULL DEFAULT 0,                      
  precio_lista          numeric(18,4) NOT NULL DEFAULT 0,                      
  margen_pct          numeric(7,4)  NOT NULL DEFAULT 0,                      
  descuento_pct        numeric(7,4)  NOT NULL DEFAULT 0,                      
  cantidad_minima        numeric(18,4) NOT NULL DEFAULT 1,                      
  vigente_desde          date          NOT NULL,                                
  vigente_hasta            date,                                                  
  activo           boolean       NOT NULL DEFAULT true,                   
  creado_at          timestamptz   NOT NULL DEFAULT now(),
  actualizado_at          timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT lista_precio_items_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT lista_precio_items_lista_fk    FOREIGN KEY (empresa_id, lista_precio_id) REFERENCES listas_precio (empresa_id, id),
  CONSTRAINT lista_precio_items_producto_fk FOREIGN KEY (empresa_id, producto_id)    REFERENCES productos (empresa_id, id),
  
  
  
  
  CONSTRAINT lista_precio_items_lista_producto_key UNIQUE (empresa_id, lista_precio_id, producto_id)
  
  
);

CREATE INDEX lista_precio_items_lista_idx    ON lista_precio_items (empresa_id, lista_precio_id);

CREATE INDEX lista_precio_items_producto_idx ON lista_precio_items (empresa_id, producto_id);

CREATE TABLE lista_precio_escalones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),           
  empresa_id          uuid          NOT NULL REFERENCES empresas (id),       
  lista_precio_item_id  uuid          NOT NULL,                                
  cantidad_minima        numeric(18,4) NOT NULL,                                
  cantidad_maxima        numeric(18,4),                                         
  precio               numeric(18,4) NOT NULL,                                
  descuento_pct        numeric(7,4)  NOT NULL DEFAULT 0,                      
  creado_at          timestamptz   NOT NULL DEFAULT now(),
  actualizado_at          timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT lista_precio_escalones_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT lista_precio_escalones_item_fk FOREIGN KEY (empresa_id, lista_precio_item_id) REFERENCES lista_precio_items (empresa_id, id)
  
  
);

CREATE INDEX lista_precio_escalones_item_idx ON lista_precio_escalones (empresa_id, lista_precio_item_id);

CREATE TABLE lista_precio_reglas (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),   
  empresa_id                  uuid          NOT NULL REFERENCES empresas (id),  
  lista_precio_id               uuid          NOT NULL,                        
  tipo_aplicacion            text          NOT NULL DEFAULT 'GENERAL',      
  referencia_id                uuid,                                          
  prioridad                    integer       NOT NULL,                        
  cantidad_minima                numeric(18,4) NOT NULL DEFAULT 1,              
  permite_descuento_adicional  boolean       NOT NULL,                        
  descuento_maximo_pct            numeric(7,4)  NOT NULL,                        
  vigente_desde                  date          NOT NULL,                        
  vigente_hasta                    date,                                          
  activo                   boolean       NOT NULL DEFAULT true,           
  creado_at                  timestamptz   NOT NULL DEFAULT now(),
  actualizado_at                  timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT lista_precio_reglas_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT lista_precio_reglas_lista_fk  FOREIGN KEY (empresa_id, lista_precio_id) REFERENCES listas_precio (empresa_id, id),
  CONSTRAINT lista_precio_reglas_tipo_chk CHECK (tipo_aplicacion IN ('GENERAL','GRUPO_CLIENTE','CLIENTE','ZONA','CANAL_VENTA'))
  
  
);

CREATE INDEX lista_precio_reglas_lista_idx ON lista_precio_reglas (empresa_id, lista_precio_id);

ALTER TABLE clientes
  ADD CONSTRAINT clientes_precio_lista_fk
  FOREIGN KEY (empresa_id, lista_precio_id) REFERENCES listas_precio (empresa_id, id);

SELECT nex_instalar_triggers_actualizacion();
