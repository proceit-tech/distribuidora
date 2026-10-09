-- =====================================================================
-- NEX-004 — Catálogos por empresa
-- Medios de pago, grupos, vendedores, rutas, zonas, canales, categorías y marcas.
-- Proyecto Nexit (REQ NEXIT-2026-001). ESTADO: PROPUESTA para revisión técnica.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable.
-- Aplicar con documentacao/banco/nexit/scripts/aplicar-migraciones.sh (transacción única + checksum).
-- =====================================================================

CREATE TABLE medios_pago (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas (id),
  codigo        text        NOT NULL CHECK (length(btrim(codigo)) > 0),      
  nombre        text        NOT NULL CHECK (length(btrim(nombre)) > 0),      
  tipo        text,                                                       
  activo   boolean     NOT NULL DEFAULT true,
  creado_at  timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT medios_pago_empresa_codigo_key UNIQUE (empresa_id, codigo),
  CONSTRAINT medios_pago_empresa_id_id_key UNIQUE (empresa_id, id)                       
);

CREATE TABLE grupos_cliente (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid        NOT NULL REFERENCES empresas (id),                
  codigo        text        NOT NULL CHECK (length(btrim(codigo)) > 0),          
  nombre        text        NOT NULL CHECK (length(btrim(nombre)) > 0),          
  activo   boolean     NOT NULL DEFAULT true,                             
  creado_at  timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grupos_cliente_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT grupos_cliente_empresa_codigo_key  UNIQUE (empresa_id, codigo)      
);

CREATE TABLE vendedores (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid        NOT NULL REFERENCES empresas (id),                
  codigo        text        NOT NULL CHECK (length(btrim(codigo)) > 0),          
  nombre        text        NOT NULL CHECK (length(btrim(nombre)) > 0),          
  activo   boolean     NOT NULL DEFAULT true,                             
  creado_at  timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendedores_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT vendedores_empresa_codigo_key  UNIQUE (empresa_id, codigo)
);

CREATE TABLE rutas_entrega (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid        NOT NULL REFERENCES empresas (id),                
  codigo        text        NOT NULL CHECK (length(btrim(codigo)) > 0),          
  nombre        text        NOT NULL CHECK (length(btrim(nombre)) > 0),          
  zona        text,                                                          
  activo   boolean     NOT NULL DEFAULT true,                             
  creado_at  timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rutas_entrega_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT rutas_entrega_empresa_codigo_key  UNIQUE (empresa_id, codigo)
);

CREATE TABLE zonas_comerciales (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid        NOT NULL REFERENCES empresas (id),                
  codigo        text        NOT NULL CHECK (length(btrim(codigo)) > 0),          
  nombre        text        NOT NULL CHECK (length(btrim(nombre)) > 0),          
  activo   boolean     NOT NULL DEFAULT true,                             
  creado_at  timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zonas_comerciales_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT zonas_comerciales_empresa_codigo_key  UNIQUE (empresa_id, codigo)
);

CREATE TABLE canales_venta (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid        NOT NULL REFERENCES empresas (id),                
  codigo        text        NOT NULL CHECK (length(btrim(codigo)) > 0),          
  nombre        text        NOT NULL CHECK (length(btrim(nombre)) > 0),          
  activo   boolean     NOT NULL DEFAULT true,                             
  creado_at  timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canales_venta_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT canales_venta_empresa_codigo_key  UNIQUE (empresa_id, codigo)
);

CREATE TABLE grupos_proveedor (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid        NOT NULL REFERENCES empresas (id),
  codigo        text,                                  
  nombre        text        NOT NULL CHECK (length(btrim(nombre)) > 0),   
  activo   boolean     NOT NULL DEFAULT true,     
  creado_at  timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grupos_proveedor_empresa_id_id_key UNIQUE (empresa_id, id)
);

CREATE TABLE categorias_producto (            
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid        NOT NULL REFERENCES empresas (id),
  codigo        text,       
  nombre        text        NOT NULL CHECK (length(btrim(nombre)) > 0),   
  activo   boolean     NOT NULL DEFAULT true,
  creado_at  timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categorias_producto_empresa_id_id_key UNIQUE (empresa_id, id)
  
);

CREATE TABLE marcas_producto (                
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid        NOT NULL REFERENCES empresas (id),
  codigo        text,       
  nombre        text        NOT NULL CHECK (length(btrim(nombre)) > 0),   
  activo   boolean     NOT NULL DEFAULT true,
  creado_at  timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marcas_producto_empresa_id_id_key UNIQUE (empresa_id, id)
);

SELECT nex_instalar_triggers_actualizacion();
